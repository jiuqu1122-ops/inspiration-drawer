use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;
use serde_json::{json, Value};

use crate::db::schema::{DEFAULT_LIBRARY_ID, DEFAULT_PROJECT_ID};
use crate::repositories::asset_repository::ViewportOptions;
use crate::repositories::canvas_repository::{CanvasRepository, CanvasScope};

pub struct SqliteCanvasRepository {
    conn: Connection,
}

impl SqliteCanvasRepository {
    pub fn new(conn: Connection) -> Self {
        Self { conn }
    }

    fn now() -> i64 {
        crate::current_time_millis()
    }

    fn make_id(prefix: &str, seed: &str) -> String {
        let now = Self::now();
        format!("{}-{}-{}", prefix, now, crate::stable_hash_hex(&format!("{}:{}:{}", prefix, now, seed)))
    }

    fn row_to_canvas(row: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
        Ok(json!({
            "id": row.get::<_, String>(0)?,
            "projectId": row.get::<_, Option<String>>(1)?.unwrap_or_else(|| DEFAULT_PROJECT_ID.to_string()),
            "libraryId": row.get::<_, Option<String>>(2)?.unwrap_or_else(|| DEFAULT_LIBRARY_ID.to_string()),
            "name": row.get::<_, Option<String>>(3)?.unwrap_or_else(|| "默认画布".to_string()),
            "description": row.get::<_, Option<String>>(4)?.unwrap_or_default(),
            "thumbnailPath": row.get::<_, Option<String>>(5)?,
            "sortOrder": row.get::<_, Option<i64>>(6)?.unwrap_or(0),
            "isActive": row.get::<_, Option<i64>>(7)?.unwrap_or(0) != 0,
            "isSnapshot": row.get::<_, Option<i64>>(8)?.unwrap_or(0) != 0,
            "sourceCanvasId": row.get::<_, Option<String>>(9)?,
            "createdAt": row.get::<_, Option<i64>>(10)?.unwrap_or(0),
            "updatedAt": row.get::<_, Option<i64>>(11)?.unwrap_or(0),
            "lastOpenedAt": row.get::<_, Option<i64>>(12)?.unwrap_or(0),
            "deletedAt": row.get::<_, Option<i64>>(13)?,
        }))
    }

    fn query_canvas(&self, canvas_id: &str, include_deleted: bool) -> Result<Option<Value>, String> {
        let sql = if include_deleted {
            "SELECT id, project_id, library_id, name, description, thumbnail_path, sort_order, is_active, is_snapshot, source_canvas_id, created_at, updated_at, last_opened_at, deleted_at FROM canvases WHERE id = ?1"
        } else {
            "SELECT id, project_id, library_id, name, description, thumbnail_path, sort_order, is_active, is_snapshot, source_canvas_id, created_at, updated_at, last_opened_at, deleted_at FROM canvases WHERE id = ?1 AND deleted_at IS NULL"
        };
        self.conn
            .query_row(sql, params![canvas_id], Self::row_to_canvas)
            .optional()
            .map_err(|err| err.to_string())
    }

    fn query_canvas_in_tx(tx: &rusqlite::Transaction<'_>, canvas_id: &str) -> Result<Option<Value>, String> {
        tx.query_row(
            "SELECT id, project_id, library_id, name, description, thumbnail_path, sort_order, is_active, is_snapshot, source_canvas_id, created_at, updated_at, last_opened_at, deleted_at FROM canvases WHERE id = ?1 AND deleted_at IS NULL",
            params![canvas_id],
            Self::row_to_canvas,
        )
        .optional()
        .map_err(|err| err.to_string())
    }

    fn ensure_default_canvas(&self, scope: &CanvasScope) -> Result<Value, String> {
        let project_id = scope.normalized_project_id();
        let library_id = scope.normalized_library_id();
        if let Some(existing) = self
            .conn
            .query_row(
                r#"
                SELECT id, project_id, library_id, name, description, thumbnail_path, sort_order, is_active, is_snapshot, source_canvas_id, created_at, updated_at, last_opened_at, deleted_at
                FROM canvases
                WHERE project_id = ?1 AND library_id = ?2 AND deleted_at IS NULL
                ORDER BY is_active DESC, last_opened_at DESC, updated_at DESC, sort_order ASC
                LIMIT 1
                "#,
                params![project_id, library_id],
                Self::row_to_canvas,
            )
            .optional()
            .map_err(|err| err.to_string())?
        {
            return Ok(existing);
        }

        let now = Self::now();
        let id = Self::make_id("canvas-default", &format!("{}:{}", project_id, library_id));
        self.conn
            .execute(
                r#"
                INSERT INTO canvases
                (id, project_id, library_id, name, description, thumbnail_path, sort_order, is_active, is_snapshot, source_canvas_id, created_at, updated_at, last_opened_at, deleted_at)
                VALUES (?1, ?2, ?3, '默认画布', '', NULL, 0, 1, 0, NULL, ?4, ?4, ?4, NULL)
                "#,
                params![id, project_id, library_id, now],
            )
            .map_err(|err| err.to_string())?;
        self.query_canvas(&id, false)?
            .ok_or_else(|| "default canvas was not created".to_string())
    }

    fn max_sort_order(&self, project_id: &str, library_id: &str) -> Result<i64, String> {
        self.conn
            .query_row(
                "SELECT COALESCE(MAX(sort_order), -1) FROM canvases WHERE project_id = ?1 AND library_id = ?2",
                params![project_id, library_id],
                |row| row.get(0),
            )
            .map_err(|err| err.to_string())
    }

    fn create_canvas_row(
        tx: &rusqlite::Transaction<'_>,
        id: &str,
        project_id: &str,
        library_id: &str,
        name: &str,
        sort_order: i64,
        is_snapshot: bool,
        source_canvas_id: Option<&str>,
        now: i64,
    ) -> Result<(), String> {
        tx.execute(
            r#"
            INSERT INTO canvases
            (id, project_id, library_id, name, description, thumbnail_path, sort_order, is_active, is_snapshot, source_canvas_id, created_at, updated_at, last_opened_at, deleted_at)
            VALUES (?1, ?2, ?3, ?4, '', NULL, ?5, 0, ?6, ?7, ?8, ?8, ?8, NULL)
            "#,
            params![
                id,
                project_id,
                library_id,
                name,
                sort_order,
                if is_snapshot { 1 } else { 0 },
                source_canvas_id,
                now,
            ],
        )
        .map_err(|err| err.to_string())?;
        Ok(())
    }

    fn duplicate_nodes(
        tx: &rusqlite::Transaction<'_>,
        source_canvas_id: &str,
        target_canvas_id: &str,
        now: i64,
    ) -> Result<usize, String> {
        let mut stmt = tx
            .prepare(
                r#"
                SELECT id, asset_id, x, y, width, height, rotation, z_index, metadata_json
                FROM canvas_nodes
                WHERE canvas_id = ?1 AND deleted_at IS NULL
                ORDER BY z_index ASC, created_at ASC
                "#,
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map(params![source_canvas_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<f64>>(2)?.unwrap_or(0.0),
                    row.get::<_, Option<f64>>(3)?.unwrap_or(0.0),
                    row.get::<_, Option<f64>>(4)?.unwrap_or(0.0),
                    row.get::<_, Option<f64>>(5)?.unwrap_or(0.0),
                    row.get::<_, Option<f64>>(6)?.unwrap_or(0.0),
                    row.get::<_, Option<i64>>(7)?.unwrap_or(0),
                    row.get::<_, Option<String>>(8)?.unwrap_or_else(|| "{}".to_string()),
                ))
            })
            .map_err(|err| err.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|err| err.to_string())?;
        drop(stmt);

        let id_map = rows.iter().enumerate().map(|(index, (source_node_id, _, _, _, _, _, _, _, _))| {
            let target_node_id = format!(
                "{}-copy-{}-{}",
                source_node_id,
                now,
                crate::stable_hash_hex(&format!("{}:{}:{}", source_node_id, target_canvas_id, index))
            );
            (source_node_id.clone(), target_node_id)
        }).collect::<HashMap<_, _>>();

        for (source_node_id, asset_id, x, y, width, height, rotation, z_index, metadata_json) in rows.iter() {
            let target_node_id = id_map
                .get(source_node_id)
                .cloned()
                .ok_or_else(|| "copied canvas node id was not prepared".to_string())?;
            let mut metadata = serde_json::from_str::<Value>(metadata_json).unwrap_or_else(|_| json!({}));
            if let Some(object) = metadata.as_object_mut() {
                object.insert("id".to_string(), Value::String(target_node_id.clone()));
                object.insert("sourceCanvasNodeId".to_string(), Value::String(source_node_id.clone()));
                if let Some(inputs) = object.get_mut("inputs").and_then(Value::as_array_mut) {
                    for input in inputs.iter_mut() {
                        if let Some(remapped) = input.as_str().and_then(|input_id| id_map.get(input_id)) {
                            *input = Value::String(remapped.clone());
                        }
                    }
                }
            }
            let target_metadata_json = serde_json::to_string(&metadata).map_err(|err| err.to_string())?;
            tx.execute(
                r#"
                INSERT INTO canvas_nodes
                (id, canvas_id, asset_id, x, y, width, height, rotation, z_index, created_at, updated_at, deleted_at, metadata_json)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10, NULL, ?11)
                "#,
                params![
                    target_node_id,
                    target_canvas_id,
                    asset_id,
                    x,
                    y,
                    width,
                    height,
                    rotation,
                    z_index,
                    now,
                    target_metadata_json,
                ],
            )
            .map_err(|err| err.to_string())?;
        }
        Ok(rows.len())
    }

    fn create_copy(&self, canvas_id: &str, new_name: String, is_snapshot: bool) -> Result<Value, String> {
        let name = new_name.trim();
        if name.is_empty() {
            return Err("canvas name cannot be empty".to_string());
        }
        let Some(source) = self.query_canvas(canvas_id, false)? else {
            return Err("canvas not found".to_string());
        };
        let project_id = source.get("projectId").and_then(Value::as_str).unwrap_or(DEFAULT_PROJECT_ID).to_string();
        let library_id = source.get("libraryId").and_then(Value::as_str).unwrap_or(DEFAULT_LIBRARY_ID).to_string();
        let now = Self::now();
        let target_id = Self::make_id(if is_snapshot { "canvas-snapshot" } else { "canvas" }, &format!("{}:{}", canvas_id, name));
        let sort_order = self.max_sort_order(&project_id, &library_id)? + 1;
        let tx = self.conn.unchecked_transaction().map_err(|err| err.to_string())?;
        Self::create_canvas_row(
            &tx,
            &target_id,
            &project_id,
            &library_id,
            name,
            sort_order,
            is_snapshot,
            Some(canvas_id),
            now,
        )?;
        Self::duplicate_nodes(&tx, canvas_id, &target_id, now)?;
        tx.commit().map_err(|err| err.to_string())?;
        self.query_canvas(&target_id, false)?
            .ok_or_else(|| "created canvas not found".to_string())
    }

    fn select_replacement_canvas_in_tx(
        tx: &rusqlite::Transaction<'_>,
        project_id: &str,
        library_id: &str,
        deleted_canvas_id: &str,
    ) -> Result<Option<String>, String> {
        tx.query_row(
            r#"
            SELECT id
            FROM canvases
            WHERE project_id = ?1
              AND library_id = ?2
              AND deleted_at IS NULL
              AND id != ?3
            ORDER BY last_opened_at DESC, updated_at DESC, sort_order ASC
            LIMIT 1
            "#,
            params![project_id, library_id, deleted_canvas_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|err| err.to_string())
    }
}

impl CanvasRepository for SqliteCanvasRepository {
    fn list_canvases(&self, scope: CanvasScope) -> Result<Vec<Value>, String> {
        self.ensure_default_canvas(&scope)?;
        let project_id = scope.normalized_project_id();
        let library_id = scope.normalized_library_id();
        let mut stmt = self
            .conn
            .prepare(
                r#"
                SELECT id, project_id, library_id, name, description, thumbnail_path, sort_order, is_active, is_snapshot, source_canvas_id, created_at, updated_at, last_opened_at, deleted_at
                FROM canvases
                WHERE project_id = ?1 AND library_id = ?2 AND deleted_at IS NULL
                ORDER BY sort_order ASC, created_at ASC
                "#,
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map(params![project_id, library_id], Self::row_to_canvas)
            .map_err(|err| err.to_string())?;
        rows.map(|row| row.map_err(|err| err.to_string())).collect()
    }

    fn list_deleted_canvases(&self, scope: CanvasScope) -> Result<Vec<Value>, String> {
        let project_id = scope.normalized_project_id();
        let library_id = scope.normalized_library_id();
        let mut stmt = self
            .conn
            .prepare(
                r#"
                SELECT id, project_id, library_id, name, description, thumbnail_path, sort_order, is_active, is_snapshot, source_canvas_id, created_at, updated_at, last_opened_at, deleted_at
                FROM canvases
                WHERE project_id = ?1 AND library_id = ?2 AND deleted_at IS NOT NULL
                ORDER BY deleted_at DESC, updated_at DESC
                "#,
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map(params![project_id, library_id], Self::row_to_canvas)
            .map_err(|err| err.to_string())?;
        rows.map(|row| row.map_err(|err| err.to_string())).collect()
    }

    fn get_canvas(&self, canvas_id: &str) -> Result<Option<Value>, String> {
        self.query_canvas(canvas_id, false)
    }

    fn create_canvas(&self, scope: CanvasScope, name: String) -> Result<Value, String> {
        let clean_name = name.trim();
        if clean_name.is_empty() {
            return Err("canvas name cannot be empty".to_string());
        }
        self.ensure_default_canvas(&scope)?;
        let project_id = scope.normalized_project_id();
        let library_id = scope.normalized_library_id();
        let now = Self::now();
        let id = Self::make_id("canvas", clean_name);
        let sort_order = self.max_sort_order(&project_id, &library_id)? + 1;
        self.conn
            .execute(
                r#"
                INSERT INTO canvases
                (id, project_id, library_id, name, description, thumbnail_path, sort_order, is_active, is_snapshot, source_canvas_id, created_at, updated_at, last_opened_at, deleted_at)
                VALUES (?1, ?2, ?3, ?4, '', NULL, ?5, 0, 0, NULL, ?6, ?6, ?6, NULL)
                "#,
                params![id, project_id, library_id, clean_name, sort_order, now],
            )
            .map_err(|err| err.to_string())?;
        self.query_canvas(&id, false)?
            .ok_or_else(|| "created canvas not found".to_string())
    }

    fn duplicate_canvas(&self, canvas_id: &str, new_name: String) -> Result<Value, String> {
        self.create_copy(canvas_id, new_name, false)
    }

    fn save_canvas_snapshot(&self, canvas_id: &str, snapshot_name: String) -> Result<Value, String> {
        self.create_copy(canvas_id, snapshot_name, true)
    }

    fn rename_canvas(&self, canvas_id: &str, name: String) -> Result<Option<Value>, String> {
        let clean_name = name.trim();
        if clean_name.is_empty() {
            return Err("canvas name cannot be empty".to_string());
        }
        let now = Self::now();
        self.conn
            .execute(
                "UPDATE canvases SET name = ?2, updated_at = ?3 WHERE id = ?1 AND deleted_at IS NULL",
                params![canvas_id, clean_name, now],
            )
            .map_err(|err| err.to_string())?;
        self.query_canvas(canvas_id, false)
    }

    fn soft_delete_canvas(&self, canvas_id: &str) -> Result<Value, String> {
        let now = Self::now();
        let tx = self.conn.unchecked_transaction().map_err(|err| err.to_string())?;
        let Some(canvas) = Self::query_canvas_in_tx(&tx, canvas_id)? else {
            return Err("canvas not found".to_string());
        };
        let project_id = canvas.get("projectId").and_then(Value::as_str).unwrap_or(DEFAULT_PROJECT_ID).to_string();
        let library_id = canvas.get("libraryId").and_then(Value::as_str).unwrap_or(DEFAULT_LIBRARY_ID).to_string();
        let was_active = canvas.get("isActive").and_then(Value::as_bool).unwrap_or(false);
        tx.execute(
            "UPDATE canvases SET deleted_at = ?2, updated_at = ?2, is_active = 0 WHERE id = ?1 AND deleted_at IS NULL",
            params![canvas_id, now],
        )
        .map_err(|err| err.to_string())?;

        let mut next_active_id = None;
        if was_active {
            next_active_id = Self::select_replacement_canvas_in_tx(&tx, &project_id, &library_id, canvas_id)?;
            if next_active_id.is_none() {
                let fallback_id = Self::make_id("canvas-default", &format!("{}:{}", project_id, library_id));
                tx.execute(
                    r#"
                    INSERT INTO canvases
                    (id, project_id, library_id, name, description, thumbnail_path, sort_order, is_active, is_snapshot, source_canvas_id, created_at, updated_at, last_opened_at, deleted_at)
                    VALUES (?1, ?2, ?3, '默认画布', '', NULL, 0, 0, 0, NULL, ?4, ?4, ?4, NULL)
                    "#,
                    params![fallback_id, project_id, library_id, now],
                )
                .map_err(|err| err.to_string())?;
                next_active_id = Some(fallback_id);
            }
            if let Some(active_id) = next_active_id.as_deref() {
                tx.execute(
                    "UPDATE canvases SET is_active = CASE WHEN id = ?1 THEN 1 ELSE 0 END, last_opened_at = CASE WHEN id = ?1 THEN ?2 ELSE last_opened_at END, updated_at = ?2 WHERE project_id = ?3 AND library_id = ?4 AND deleted_at IS NULL",
                    params![active_id, now, project_id, library_id],
                )
                .map_err(|err| err.to_string())?;
            }
        }
        tx.commit().map_err(|err| err.to_string())?;
        Ok(json!({
            "deletedCanvasId": canvas_id,
            "activeCanvasId": next_active_id,
        }))
    }

    fn restore_canvas(&self, canvas_id: &str) -> Result<Option<Value>, String> {
        let now = Self::now();
        self.conn
            .execute(
                "UPDATE canvases SET deleted_at = NULL, updated_at = ?2, is_active = 0 WHERE id = ?1 AND deleted_at IS NOT NULL",
                params![canvas_id, now],
            )
            .map_err(|err| err.to_string())?;
        self.query_canvas(canvas_id, false)
    }

    fn permanently_delete_canvas(&self, canvas_id: &str) -> Result<Value, String> {
        let Some(canvas) = self.query_canvas(canvas_id, true)? else {
            return Err("canvas not found".to_string());
        };
        if canvas.get("deletedAt").and_then(Value::as_i64).is_none() {
            return Err("canvas is not in trash".to_string());
        }
        let tx = self.conn.unchecked_transaction().map_err(|err| err.to_string())?;
        let deleted_nodes = tx
            .execute("DELETE FROM canvas_nodes WHERE canvas_id = ?1", params![canvas_id])
            .map_err(|err| err.to_string())?;
        let deleted_canvases = tx
            .execute("DELETE FROM canvases WHERE id = ?1 AND deleted_at IS NOT NULL", params![canvas_id])
            .map_err(|err| err.to_string())?;
        tx.commit().map_err(|err| err.to_string())?;
        if deleted_canvases == 0 {
            return Err("canvas was not deleted".to_string());
        }
        Ok(json!({
            "deletedCanvasId": canvas_id,
            "deletedNodeCount": deleted_nodes,
        }))
    }

    fn get_trash_count(&self, scope: CanvasScope) -> Result<i64, String> {
        let project_id = scope.normalized_project_id();
        let library_id = scope.normalized_library_id();
        self.conn
            .query_row(
                "SELECT COUNT(*) FROM canvases WHERE project_id = ?1 AND library_id = ?2 AND deleted_at IS NOT NULL",
                params![project_id, library_id],
                |row| row.get(0),
            )
            .map_err(|err| err.to_string())
    }

    fn set_active_canvas(&self, scope: CanvasScope, canvas_id: &str) -> Result<Value, String> {
        let Some(canvas) = self.query_canvas(canvas_id, false)? else {
            return Err("canvas not found".to_string());
        };
        let project_id = canvas
            .get("projectId")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| scope.normalized_project_id());
        let library_id = canvas
            .get("libraryId")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| scope.normalized_library_id());
        let now = Self::now();
        let tx = self.conn.unchecked_transaction().map_err(|err| err.to_string())?;
        tx.execute(
            "UPDATE canvases SET is_active = CASE WHEN id = ?1 THEN 1 ELSE 0 END, last_opened_at = CASE WHEN id = ?1 THEN ?2 ELSE last_opened_at END, updated_at = ?2 WHERE project_id = ?3 AND library_id = ?4 AND deleted_at IS NULL",
            params![canvas_id, now, project_id, library_id],
        )
        .map_err(|err| err.to_string())?;
        tx.commit().map_err(|err| err.to_string())?;
        self.query_canvas(canvas_id, false)?
            .ok_or_else(|| "active canvas not found".to_string())
    }

    fn get_active_canvas(&self, scope: CanvasScope) -> Result<Value, String> {
        let fallback = self.ensure_default_canvas(&scope)?;
        let project_id = scope.normalized_project_id();
        let library_id = scope.normalized_library_id();
        let active = self
            .conn
            .query_row(
                r#"
                SELECT id, project_id, library_id, name, description, thumbnail_path, sort_order, is_active, is_snapshot, source_canvas_id, created_at, updated_at, last_opened_at, deleted_at
                FROM canvases
                WHERE project_id = ?1 AND library_id = ?2 AND deleted_at IS NULL AND is_active = 1
                ORDER BY last_opened_at DESC, updated_at DESC
                LIMIT 1
                "#,
                params![project_id, library_id],
                Self::row_to_canvas,
            )
            .optional()
            .map_err(|err| err.to_string())?;
        if let Some(active) = active {
            return Ok(active);
        }
        let fallback_id = fallback
            .get("id")
            .and_then(Value::as_str)
            .ok_or_else(|| "default canvas id missing".to_string())?
            .to_string();
        self.set_active_canvas(scope, &fallback_id)
    }

    fn list_canvas_nodes(&self, canvas_id: &str) -> Result<Vec<Value>, String> {
        let mut stmt = self
            .conn
            .prepare(
                r#"
                SELECT metadata_json
                FROM canvas_nodes
                WHERE canvas_id = ?1 AND deleted_at IS NULL
                ORDER BY z_index ASC, created_at ASC
                "#,
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map(params![canvas_id], |row| row.get::<_, String>(0))
            .map_err(|err| err.to_string())?;
        rows.map(|row| {
            let metadata = row.map_err(|err| err.to_string())?;
            serde_json::from_str::<Value>(&metadata).map_err(|err| err.to_string())
        })
        .collect()
    }

    fn get_canvas_nodes_in_viewport(&self, options: ViewportOptions) -> Result<Vec<Value>, String> {
        let buffer = options.buffer.unwrap_or(300.0).max(0.0);
        let left = options.viewport_x - buffer;
        let top = options.viewport_y - buffer;
        let right = options.viewport_x + options.viewport_width + buffer;
        let bottom = options.viewport_y + options.viewport_height + buffer;
        let mut stmt = self.conn.prepare(
            r#"
            SELECT COALESCE(canvas_nodes.metadata_json, assets.metadata_json)
            FROM canvas_nodes
            LEFT JOIN assets ON assets.id = canvas_nodes.asset_id
            WHERE canvas_nodes.canvas_id = ?1
              AND canvas_nodes.deleted_at IS NULL
              AND canvas_nodes.x + canvas_nodes.width >= ?2
              AND canvas_nodes.x <= ?3
              AND canvas_nodes.y + canvas_nodes.height >= ?4
              AND canvas_nodes.y <= ?5
            ORDER BY canvas_nodes.z_index ASC, canvas_nodes.created_at ASC
            LIMIT 2000
            "#,
        ).map_err(|err| err.to_string())?;
        let rows = stmt.query_map(params![options.canvas_id, left, right, top, bottom], |row| {
            let metadata: String = row.get(0)?;
            Ok(metadata)
        }).map_err(|err| err.to_string())?;
        rows.map(|row| {
            let metadata = row.map_err(|err| err.to_string())?;
            serde_json::from_str::<Value>(&metadata).map_err(|err| err.to_string())
        }).collect()
    }

    fn update_canvas_nodes(&self, canvas_id: String, nodes: Vec<Value>) -> Result<usize, String> {
        if self.query_canvas(&canvas_id, false)?.is_none() {
            return Err("canvas not found".to_string());
        }
        let now = Self::now();
        let tx = self.conn.unchecked_transaction().map_err(|err| err.to_string())?;
        let mut ids = Vec::with_capacity(nodes.len());
        let mut written = 0_usize;
        for (index, node) in nodes.iter().enumerate() {
            let id = crate::services::migration_service::insert_canvas_node_with_z_index(&tx, &canvas_id, node, now, index as i64)?;
            ids.push(id);
            written += 1;
        }
        if ids.is_empty() {
            tx.execute(
                "UPDATE canvas_nodes SET deleted_at = ?2, updated_at = ?2 WHERE canvas_id = ?1 AND deleted_at IS NULL",
                params![canvas_id, now],
            )
            .map_err(|err| err.to_string())?;
        } else {
            let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            let sql = format!(
                "UPDATE canvas_nodes SET deleted_at = ?, updated_at = ? WHERE canvas_id = ? AND deleted_at IS NULL AND id NOT IN ({})",
                placeholders
            );
            let mut values: Vec<rusqlite::types::Value> = vec![
                rusqlite::types::Value::Integer(now),
                rusqlite::types::Value::Integer(now),
                rusqlite::types::Value::Text(canvas_id.clone()),
            ];
            values.extend(ids.into_iter().map(rusqlite::types::Value::Text));
            tx.execute(&sql, rusqlite::params_from_iter(values))
                .map_err(|err| err.to_string())?;
        }
        tx.execute(
            "UPDATE canvases SET updated_at = ?2 WHERE id = ?1 AND deleted_at IS NULL",
            params![canvas_id, now],
        )
        .map_err(|err| err.to_string())?;
        tx.commit().map_err(|err| err.to_string())?;
        Ok(written)
    }

    fn patch_canvas_nodes(&self, canvas_id: String, nodes: Vec<Value>) -> Result<usize, String> {
        if self.query_canvas(&canvas_id, false)?.is_none() {
            return Err("canvas not found".to_string());
        }
        if nodes.is_empty() {
            return Ok(0);
        }
        let now = Self::now();
        let tx = self.conn.unchecked_transaction().map_err(|err| err.to_string())?;
        let mut written = 0_usize;
        for node in nodes.iter() {
            let node_id = node.get("id").and_then(Value::as_str).unwrap_or_default();
            let fallback_z_index = if node_id.is_empty() {
                0
            } else {
                tx.query_row(
                    "SELECT COALESCE(z_index, 0) FROM canvas_nodes WHERE canvas_id = ?1 AND id = ?2",
                    params![canvas_id, node_id],
                    |row| row.get::<_, i64>(0),
                )
                .optional()
                .map_err(|err| err.to_string())?
                .unwrap_or(0)
            };
            crate::services::migration_service::insert_canvas_node_with_z_index(
                &tx,
                &canvas_id,
                node,
                now,
                fallback_z_index,
            )?;
            written += 1;
        }
        tx.execute(
            "UPDATE canvases SET updated_at = ?2 WHERE id = ?1 AND deleted_at IS NULL",
            params![canvas_id, now],
        )
        .map_err(|err| err.to_string())?;
        tx.commit().map_err(|err| err.to_string())?;
        Ok(written)
    }
}
