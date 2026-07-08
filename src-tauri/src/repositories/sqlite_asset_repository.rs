use std::collections::{HashMap, HashSet};

use rusqlite::{params, params_from_iter, types::Value as SqlValue, Connection, OptionalExtension};
use serde_json::{json, Value};

use crate::db::schema::DEFAULT_LIBRARY_ID;
use crate::repositories::asset_repository::{
    AssetListOptions, AssetRepository, AssetUpdatePatch, DebugCanvasNodesOptions, MoveFoldersOptions, ViewportOptions,
};

pub struct SqliteAssetRepository {
    conn: Connection,
}

#[derive(Debug, Clone)]
struct FolderRow {
    id: String,
    library_id: String,
    parent_id: Option<String>,
    name: String,
    sort_order: i64,
    metadata: Value,
    deleted_at: Option<i64>,
}

impl SqliteAssetRepository {
    pub fn new(conn: Connection) -> Self {
        Self { conn }
    }

    fn normalize_list_options(options: AssetListOptions) -> AssetListOptions {
        AssetListOptions {
            library_id: Some(options.library_id.unwrap_or_else(|| DEFAULT_LIBRARY_ID.to_string())),
            offset: Some(options.offset.unwrap_or(0).max(0)),
            limit: Some(options.limit.unwrap_or(200).clamp(1, 1000)),
            ..options
        }
    }

    fn build_asset_where(options: &AssetListOptions, values: &mut Vec<SqlValue>) -> String {
        let mut clauses = vec!["deleted_at IS NULL".to_string()];
        let library_id = options.library_id.clone().unwrap_or_else(|| DEFAULT_LIBRARY_ID.to_string());
        clauses.push("library_id = ?".to_string());
        values.push(SqlValue::Text(library_id));

        if let Some(folder_ids) = options.folder_ids.as_ref().map(|ids| {
            ids.iter()
                .map(|value| value.trim())
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
                .collect::<Vec<_>>()
        }).filter(|ids| !ids.is_empty()) {
            let placeholders = folder_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            clauses.push(format!("folder_id IN ({})", placeholders));
            for folder_id in folder_ids {
                values.push(SqlValue::Text(folder_id));
            }
        } else if let Some(folder_id) = options.folder_id.as_ref().map(|value| value.trim()).filter(|value| !value.is_empty()) {
            if folder_id == "all" {
                clauses.push("(folder_id IS NULL OR folder_id = '')".to_string());
            } else {
                clauses.push("folder_id = ?".to_string());
                values.push(SqlValue::Text(folder_id.to_string()));
            }
        }
        if let Some(file_type) = options.file_type.as_ref().map(|value| value.trim()).filter(|value| !value.is_empty()) {
            clauses.push("file_type = ?".to_string());
            values.push(SqlValue::Text(file_type.to_string()));
        }
        if let Some(keyword) = options.keyword.as_ref().map(|value| value.trim()).filter(|value| !value.is_empty()) {
            clauses.push("(file_name LIKE ? OR note LIKE ? OR source_url LIKE ?)".to_string());
            let pattern = format!("%{}%", keyword.replace('%', "\\%").replace('_', "\\_"));
            values.push(SqlValue::Text(pattern.clone()));
            values.push(SqlValue::Text(pattern.clone()));
            values.push(SqlValue::Text(pattern));
        }
        if let Some(tags) = options.tags.as_ref().filter(|tags| !tags.is_empty()) {
            let placeholders = tags.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            clauses.push(format!(
                "id IN (SELECT asset_id FROM asset_tags WHERE tag_id IN ({}) GROUP BY asset_id HAVING COUNT(DISTINCT tag_id) = ?)",
                placeholders
            ));
            for tag in tags {
                values.push(SqlValue::Text(tag.clone()));
            }
            values.push(SqlValue::Integer(tags.len() as i64));
        }

        format!("WHERE {}", clauses.join(" AND "))
    }

    fn normalize_library_id(library_id: Option<String>) -> String {
        library_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(DEFAULT_LIBRARY_ID)
            .to_string()
    }

    fn normalize_parent_id(parent_id: Option<String>) -> Option<String> {
        parent_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty() && *value != "all")
            .map(ToOwned::to_owned)
    }

    fn normalize_folder_ids(folder_ids: Vec<String>) -> Vec<String> {
        let mut seen = HashSet::new();
        folder_ids
            .into_iter()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty() && seen.insert(value.clone()))
            .collect()
    }

    fn fetch_folder_rows(conn: &Connection, library_id: &str) -> Result<Vec<FolderRow>, String> {
        let mut stmt = conn
            .prepare(
                r#"
                SELECT id, COALESCE(library_id, ?1), parent_id, name, COALESCE(sort_order, 0), metadata_json, deleted_at
                FROM folders
                WHERE library_id = ?1
                ORDER BY sort_order ASC, created_at ASC, name COLLATE NOCASE ASC
                "#,
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map(params![library_id], |row| {
                let id: String = row.get(0)?;
                let row_library_id: String = row.get(1)?;
                let parent_id: Option<String> = row
                    .get::<_, Option<String>>(2)?
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty());
                let name: String = row.get(3)?;
                let sort_order: i64 = row.get(4)?;
                let metadata_json: Option<String> = row.get(5)?;
                let deleted_at: Option<i64> = row.get(6)?;
                let mut metadata = metadata_json
                    .as_deref()
                    .and_then(|value| serde_json::from_str::<Value>(value).ok())
                    .unwrap_or_else(|| json!({ "id": id.clone(), "name": name.clone(), "color": "#10b981" }));
                if !metadata.is_object() {
                    metadata = json!({ "id": id.clone(), "name": name.clone(), "color": "#10b981" });
                }
                if let Some(object) = metadata.as_object_mut() {
                    object.insert("id".to_string(), Value::String(id.clone()));
                    object.insert("name".to_string(), Value::String(name.clone()));
                    object.insert("libraryId".to_string(), Value::String(row_library_id.clone()));
                    object.insert("sortOrder".to_string(), Value::Number(sort_order.into()));
                    if let Some(parent_id) = parent_id.as_deref() {
                        if parent_id.trim().is_empty() {
                            object.remove("parentId");
                        } else {
                            object.insert("parentId".to_string(), Value::String(parent_id.to_string()));
                        }
                    } else {
                        object.remove("parentId");
                    }
                    if let Some(deleted_at) = deleted_at {
                        object.insert("deletedAt".to_string(), Value::Number(deleted_at.into()));
                    } else {
                        object.remove("deletedAt");
                    }
                }
                Ok(FolderRow {
                    id,
                    library_id: row_library_id,
                    parent_id,
                    name,
                    sort_order,
                    metadata,
                    deleted_at,
                })
            })
            .map_err(|err| err.to_string())?;
        rows.map(|row| row.map_err(|err| err.to_string())).collect()
    }

    fn list_folders_from_conn(conn: &Connection, library_id: &str) -> Result<Vec<Value>, String> {
        Self::fetch_folder_rows(conn, library_id).map(|rows| {
            rows.into_iter()
                .filter(|row| row.deleted_at.is_none())
                .map(|row| row.metadata)
                .collect()
        })
    }

    fn is_descendant_of(
        rows_by_id: &HashMap<String, FolderRow>,
        candidate_parent_id: &str,
        folder_id: &str,
    ) -> bool {
        let mut cursor = Some(candidate_parent_id.to_string());
        let mut seen = HashSet::new();
        while let Some(current_id) = cursor {
            if current_id == folder_id {
                return true;
            }
            if !seen.insert(current_id.clone()) {
                return true;
            }
            cursor = rows_by_id.get(&current_id).and_then(|row| row.parent_id.clone());
        }
        false
    }

    fn folder_metadata_for_update(row: &FolderRow, library_id: &str, new_parent_id: Option<&str>, sort_order: i64, now: i64) -> Value {
        let mut metadata = row.metadata.clone();
        if !metadata.is_object() {
            metadata = json!({
                "id": row.id,
                "name": row.name,
                "color": "#10b981",
            });
        }
        if let Some(object) = metadata.as_object_mut() {
            object.insert("id".to_string(), Value::String(row.id.clone()));
            object.insert("name".to_string(), Value::String(row.name.clone()));
            object.insert("libraryId".to_string(), Value::String(library_id.to_string()));
            object.insert("sortOrder".to_string(), Value::Number(sort_order.into()));
            object.insert("updatedAt".to_string(), Value::Number(now.into()));
            if let Some(parent_id) = new_parent_id {
                object.insert("parentId".to_string(), Value::String(parent_id.to_string()));
            } else {
                object.remove("parentId");
            }
        }
        metadata
    }

    fn sort_sql(sort: Option<&str>) -> &'static str {
        match sort.unwrap_or("").trim() {
            "created_at_asc" => "created_at ASC, id ASC",
            "updated_at_asc" => "updated_at ASC, id ASC",
            "updated_at_desc" => "updated_at DESC, id DESC",
            "imported_at_asc" => "imported_at ASC, id ASC",
            "file_name_asc" => "file_name COLLATE NOCASE ASC, id ASC",
            "file_name_desc" => "file_name COLLATE NOCASE DESC, id DESC",
            "file_size_asc" => "file_size ASC, id ASC",
            "file_size_desc" => "file_size DESC, id DESC",
            _ => "created_at DESC, imported_at DESC, id DESC",
        }
    }
}

impl AssetRepository for SqliteAssetRepository {
    fn list_assets(&self, options: AssetListOptions) -> Result<Vec<Value>, String> {
        let options = Self::normalize_list_options(options);
        let mut values = Vec::new();
        let where_sql = Self::build_asset_where(&options, &mut values);
        let sql = format!(
            "SELECT metadata_json FROM assets {} ORDER BY {} LIMIT ? OFFSET ?",
            where_sql,
            Self::sort_sql(options.sort.as_deref())
        );
        values.push(SqlValue::Integer(options.limit.unwrap_or(200)));
        values.push(SqlValue::Integer(options.offset.unwrap_or(0)));
        let mut stmt = self.conn.prepare(&sql).map_err(|err| err.to_string())?;
        let rows = stmt.query_map(params_from_iter(values), |row| {
            let metadata: String = row.get(0)?;
            Ok(metadata)
        }).map_err(|err| err.to_string())?;
        rows.map(|row| {
            let metadata = row.map_err(|err| err.to_string())?;
            serde_json::from_str::<Value>(&metadata).map_err(|err| err.to_string())
        }).collect()
    }

    fn get_asset_by_id(&self, id: &str) -> Result<Option<Value>, String> {
        let value: Option<String> = self.conn.query_row(
            "SELECT metadata_json FROM assets WHERE id = ?1 AND deleted_at IS NULL",
            params![id],
            |row| row.get(0),
        ).optional().map_err(|err| err.to_string())?;
        value.map(|metadata| serde_json::from_str(&metadata).map_err(|err| err.to_string())).transpose()
    }

    fn get_asset_count(&self, options: AssetListOptions) -> Result<i64, String> {
        let options = Self::normalize_list_options(options);
        let mut values = Vec::new();
        let where_sql = Self::build_asset_where(&options, &mut values);
        let sql = format!("SELECT COUNT(*) FROM assets {}", where_sql);
        self.conn.query_row(&sql, params_from_iter(values), |row| row.get(0)).map_err(|err| err.to_string())
    }

    fn upsert_assets(&self, assets: Vec<Value>) -> Result<usize, String> {
        if assets.is_empty() {
            return Ok(0);
        }
        let now = crate::current_time_millis();
        let tx = self.conn.unchecked_transaction().map_err(|err| err.to_string())?;
        let log_id = format!("asset-upsert-{}", now);
        tx.execute(
            "INSERT OR REPLACE INTO import_logs (id, library_id, status, total_count, success_count, skipped_count, failed_count, started_at, finished_at) VALUES (?1, ?2, 'running', ?3, 0, 0, 0, ?4, NULL)",
            params![log_id, DEFAULT_LIBRARY_ID, assets.len() as i64, now],
        ).map_err(|err| err.to_string())?;
        let mut written = 0_usize;
        let mut failed = 0_usize;
        for asset in assets {
            match crate::services::migration_service::insert_asset(&tx, &asset, now) {
                Ok(()) => written += 1,
                Err(err) => {
                    failed += 1;
                    tx.execute(
                        "INSERT INTO import_errors (id, import_log_id, file_path, reason, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                        params![
                            format!("{}-{}", log_id, written + failed),
                            log_id,
                            asset.get("path").and_then(Value::as_str).unwrap_or_default(),
                            err,
                            crate::current_time_millis(),
                        ],
                    ).map_err(|inner| inner.to_string())?;
                }
            }
        }
        tx.execute(
            "UPDATE import_logs SET status = ?2, success_count = ?3, failed_count = ?4, finished_at = ?5 WHERE id = ?1",
            params![
                log_id,
                if failed > 0 { "partial_failed" } else { "success" },
                written as i64,
                failed as i64,
                crate::current_time_millis(),
            ],
        ).map_err(|err| err.to_string())?;
        tx.commit().map_err(|err| err.to_string())?;
        Ok(written)
    }

    fn update_asset(&self, id: &str, patch: AssetUpdatePatch) -> Result<Option<Value>, String> {
        let Some(mut asset) = self.get_asset_by_id(id)? else {
            return Ok(None);
        };
        if let Some(folder_id) = patch.folder_id {
            asset["folderId"] = if folder_id.is_empty() { Value::Null } else { Value::String(folder_id.clone()) };
        }
        if let Some(note) = patch.note {
            asset["remark"] = Value::String(note.clone());
        }
        if let Some(rating) = patch.rating {
            asset["rating"] = Value::Number(rating.into());
        }
        if let Some(metadata) = patch.metadata {
            if let (Some(target), Some(source)) = (asset.as_object_mut(), metadata.as_object()) {
                for (key, value) in source {
                    target.insert(key.clone(), value.clone());
                }
            }
        }
        let now = crate::current_time_millis();
        asset["updatedAt"] = Value::Number(now.into());
        let folder_id = asset.get("folderId").and_then(Value::as_str).unwrap_or("").to_string();
        let note = asset.get("remark").and_then(Value::as_str).unwrap_or("").to_string();
        let rating = asset.get("rating").and_then(Value::as_i64).unwrap_or(0);
        let metadata_json = serde_json::to_string(&asset).map_err(|err| err.to_string())?;
        self.conn.execute(
            "UPDATE assets SET folder_id = ?2, note = ?3, rating = ?4, updated_at = ?5, metadata_json = ?6 WHERE id = ?1",
            params![id, folder_id, note, rating, now, metadata_json],
        ).map_err(|err| err.to_string())?;
        Ok(Some(asset))
    }

    fn delete_asset(&self, id: &str) -> Result<bool, String> {
        let changed = self.conn.execute(
            "UPDATE assets SET deleted_at = ?2, updated_at = ?2 WHERE id = ?1 AND deleted_at IS NULL",
            params![id, crate::current_time_millis()],
        ).map_err(|err| err.to_string())?;
        Ok(changed > 0)
    }

    fn get_assets_by_ids(&self, ids: Vec<String>) -> Result<Vec<Value>, String> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!("SELECT metadata_json FROM assets WHERE deleted_at IS NULL AND id IN ({})", placeholders);
        let mut stmt = self.conn.prepare(&sql).map_err(|err| err.to_string())?;
        let values = ids.into_iter().map(SqlValue::Text).collect::<Vec<_>>();
        let rows = stmt.query_map(params_from_iter(values), |row| {
            let metadata: String = row.get(0)?;
            Ok(metadata)
        }).map_err(|err| err.to_string())?;
        rows.map(|row| {
            let metadata = row.map_err(|err| err.to_string())?;
            serde_json::from_str::<Value>(&metadata).map_err(|err| err.to_string())
        }).collect()
    }

    fn get_assets_in_viewport(&self, options: ViewportOptions) -> Result<Vec<Value>, String> {
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

    fn debug_get_all_canvas_nodes(&self, options: DebugCanvasNodesOptions) -> Result<Value, String> {
        let canvas_id = options.canvas_id.unwrap_or_else(|| "default".to_string());
        let limit = options.limit.unwrap_or(20).clamp(1, 200);
        let count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM canvas_nodes WHERE canvas_id = ?1 AND deleted_at IS NULL",
            params![canvas_id],
            |row| row.get(0),
        ).map_err(|err| err.to_string())?;
        let mut stmt = self.conn.prepare(
            r#"
            SELECT id, canvas_id, asset_id, x, y, width, height, rotation, z_index, metadata_json
            FROM canvas_nodes
            WHERE canvas_id = ?1 AND deleted_at IS NULL
            ORDER BY z_index ASC, created_at ASC
            LIMIT ?2
            "#,
        ).map_err(|err| err.to_string())?;
        let rows = stmt.query_map(params![canvas_id, limit], |row| {
            let metadata: Option<String> = row.get(9)?;
            let parsed = metadata
                .as_deref()
                .and_then(|value| serde_json::from_str::<Value>(value).ok())
                .unwrap_or_else(|| json!({}));
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "canvasId": row.get::<_, String>(1)?,
                "assetId": row.get::<_, Option<String>>(2)?,
                "x": row.get::<_, f64>(3)?,
                "y": row.get::<_, f64>(4)?,
                "width": row.get::<_, f64>(5)?,
                "height": row.get::<_, f64>(6)?,
                "rotation": row.get::<_, Option<f64>>(7)?.unwrap_or(0.0),
                "zIndex": row.get::<_, Option<i64>>(8)?.unwrap_or(0),
                "metadata": parsed,
            }))
        }).map_err(|err| err.to_string())?;
        let nodes = rows.map(|row| row.map_err(|err| err.to_string())).collect::<Result<Vec<_>, _>>()?;
        Ok(json!({
            "mode": "sqlite",
            "canvasId": canvas_id,
            "count": count,
            "nodes": nodes,
        }))
    }

    fn upsert_canvas_nodes(&self, canvas_id: String, nodes: Vec<Value>) -> Result<usize, String> {
        if nodes.is_empty() {
            return Ok(0);
        }
        let now = crate::current_time_millis();
        let tx = self.conn.unchecked_transaction().map_err(|err| err.to_string())?;
        let mut written = 0_usize;
        for node in nodes {
            let _ = crate::services::migration_service::insert_canvas_node(&tx, &canvas_id, &node, now)?;
            written += 1;
        }
        tx.commit().map_err(|err| err.to_string())?;
        Ok(written)
    }

    fn list_folders(&self, library_id: Option<String>) -> Result<Vec<Value>, String> {
        let library_id = Self::normalize_library_id(library_id);
        Self::list_folders_from_conn(&self.conn, &library_id)
    }

    fn move_folders(&self, options: MoveFoldersOptions) -> Result<Vec<Value>, String> {
        let folder_ids = Self::normalize_folder_ids(options.folder_ids);
        if folder_ids.is_empty() {
            return Err("folder_ids cannot be empty".to_string());
        }
        let library_id = Self::normalize_library_id(options.library_id);
        let new_parent_id = Self::normalize_parent_id(options.new_parent_id);
        let selected_ids = folder_ids.iter().cloned().collect::<HashSet<_>>();
        let tx = self.conn.unchecked_transaction().map_err(|err| err.to_string())?;
        let rows = Self::fetch_folder_rows(&tx, &library_id)?;
        let rows_by_id = rows
            .iter()
            .cloned()
            .map(|row| (row.id.clone(), row))
            .collect::<HashMap<_, _>>();

        for folder_id in &folder_ids {
            let row = rows_by_id
                .get(folder_id)
                .ok_or_else(|| format!("folder not found: {}", folder_id))?;
            if row.deleted_at.is_some() {
                return Err(format!("folder has been deleted: {}", row.name));
            }
            if row.library_id != library_id {
                return Err("folders must belong to the same library".to_string());
            }
        }

        if let Some(parent_id) = new_parent_id.as_deref() {
            if selected_ids.contains(parent_id) {
                return Err("cannot move a folder into itself".to_string());
            }
            let target = rows_by_id
                .get(parent_id)
                .ok_or_else(|| "target folder not found".to_string())?;
            if target.deleted_at.is_some() {
                return Err("target folder has been deleted".to_string());
            }
            if target.library_id != library_id {
                return Err("target folder belongs to a different library".to_string());
            }
            for folder_id in &folder_ids {
                if Self::is_descendant_of(&rows_by_id, parent_id, folder_id) {
                    return Err("cannot move a folder into its own descendant".to_string());
                }
            }
        }

        let max_sibling_sort = rows
            .iter()
            .filter(|row| {
                row.deleted_at.is_none()
                    && !selected_ids.contains(&row.id)
                    && match new_parent_id.as_deref() {
                        Some(parent_id) => row.parent_id.as_deref() == Some(parent_id),
                        None => row.parent_id.as_deref().unwrap_or("").trim().is_empty(),
                    }
            })
            .map(|row| row.sort_order)
            .max();
        let start_sort_order = options
            .sort_order
            .or(options.insert_position)
            .unwrap_or_else(|| max_sibling_sort.map(|value| value + 1).unwrap_or(0))
            .max(0);
        let now = crate::current_time_millis();

        for (index, folder_id) in folder_ids.iter().enumerate() {
            let row = rows_by_id
                .get(folder_id)
                .ok_or_else(|| format!("folder not found: {}", folder_id))?;
            let sort_order = start_sort_order + index as i64;
            let metadata = Self::folder_metadata_for_update(row, &library_id, new_parent_id.as_deref(), sort_order, now);
            let metadata_json = serde_json::to_string(&metadata).map_err(|err| err.to_string())?;
            let changed = tx
                .execute(
                    r#"
                    UPDATE folders
                    SET parent_id = ?2, sort_order = ?3, updated_at = ?4, metadata_json = ?5
                    WHERE id = ?1 AND library_id = ?6 AND deleted_at IS NULL
                    "#,
                    params![folder_id, new_parent_id.as_deref(), sort_order, now, metadata_json, &library_id],
                )
                .map_err(|err| err.to_string())?;
            if changed != 1 {
                return Err(format!("failed to move folder: {}", row.name));
            }
        }
        tx.commit().map_err(|err| err.to_string())?;
        Self::list_folders_from_conn(&self.conn, &library_id)
    }

    fn list_tags(&self, library_id: Option<String>) -> Result<Vec<Value>, String> {
        let library_id = library_id.unwrap_or_else(|| DEFAULT_LIBRARY_ID.to_string());
        let mut stmt = self.conn.prepare(
            "SELECT id, name, color, created_at, updated_at FROM tags WHERE library_id = ?1 ORDER BY name COLLATE NOCASE ASC",
        ).map_err(|err| err.to_string())?;
        let rows = stmt.query_map(params![library_id], |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "name": row.get::<_, String>(1)?,
                "color": row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                "createdAt": row.get::<_, i64>(3)?,
                "updatedAt": row.get::<_, i64>(4)?,
            }))
        }).map_err(|err| err.to_string())?;
        rows.map(|row| row.map_err(|err| err.to_string())).collect()
    }

    fn get_asset_thumbnails(&self, asset_id: &str) -> Result<Vec<Value>, String> {
        let mut stmt = self.conn.prepare(
            "SELECT id, asset_id, size, path, width, height, format, file_size, created_at, source_modified_at FROM thumbnails WHERE asset_id = ?1 ORDER BY size ASC",
        ).map_err(|err| err.to_string())?;
        let rows = stmt.query_map(params![asset_id], |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "assetId": row.get::<_, String>(1)?,
                "size": row.get::<_, i64>(2)?,
                "path": row.get::<_, String>(3)?,
                "width": row.get::<_, i64>(4)?,
                "height": row.get::<_, i64>(5)?,
                "format": row.get::<_, String>(6)?,
                "fileSize": row.get::<_, i64>(7)?,
                "createdAt": row.get::<_, i64>(8)?,
                "sourceModifiedAt": row.get::<_, i64>(9)?,
            }))
        }).map_err(|err| err.to_string())?;
        rows.map(|row| row.map_err(|err| err.to_string())).collect()
    }
}
