use std::collections::{HashMap, HashSet};

use rusqlite::{params, params_from_iter, types::Value as SqlValue, Connection, OptionalExtension};
use serde_json::{json, Value};

use crate::db::schema::DEFAULT_LIBRARY_ID;
use crate::repositories::asset_repository::{
    AssetBatchUpdate, AssetListOptions, AssetRepository, AssetUpdatePatch, DebugCanvasNodesOptions,
    MoveFoldersOptions, ViewportOptions,
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
            library_id: Some(
                options
                    .library_id
                    .unwrap_or_else(|| DEFAULT_LIBRARY_ID.to_string()),
            ),
            offset: Some(options.offset.unwrap_or(0).max(0)),
            limit: Some(options.limit.unwrap_or(200).clamp(1, 1000)),
            ..options
        }
    }

    fn build_asset_where(options: &AssetListOptions, values: &mut Vec<SqlValue>) -> String {
        let mut clauses = vec![
            "deleted_at IS NULL".to_string(),
            "COALESCE(drawer_visible, 1) = 1".to_string(),
        ];
        let library_id = options
            .library_id
            .clone()
            .unwrap_or_else(|| DEFAULT_LIBRARY_ID.to_string());
        clauses.push("library_id = ?".to_string());
        values.push(SqlValue::Text(library_id));

        if let Some(folder_ids) = options
            .folder_ids
            .as_ref()
            .map(|ids| {
                ids.iter()
                    .map(|value| value.trim())
                    .filter(|value| !value.is_empty())
                    .map(ToOwned::to_owned)
                    .collect::<Vec<_>>()
            })
            .filter(|ids| !ids.is_empty())
        {
            let placeholders = folder_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            clauses.push(format!("folder_id IN ({})", placeholders));
            for folder_id in folder_ids {
                values.push(SqlValue::Text(folder_id));
            }
        } else if let Some(folder_id) = options
            .folder_id
            .as_ref()
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
        {
            if folder_id == "all" {
                clauses.push("(folder_id IS NULL OR folder_id = '')".to_string());
            } else {
                clauses.push("folder_id = ?".to_string());
                values.push(SqlValue::Text(folder_id.to_string()));
            }
        }
        if let Some(file_type) = options
            .file_type
            .as_ref()
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
        {
            clauses.push("file_type = ?".to_string());
            values.push(SqlValue::Text(file_type.to_string()));
        }
        if let Some(rating) = options.rating {
            clauses.push("rating = ?".to_string());
            values.push(SqlValue::Integer(rating));
        }
        if let Some(quick_access) = options.quick_access {
            clauses.push(
                "COALESCE(json_extract(metadata_json, '$.isQuickAccess'), 0) = ?".to_string(),
            );
            values.push(SqlValue::Integer(if quick_access { 1 } else { 0 }));
        }
        if let Some(status) = options
            .inspiration_status
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            let has_tags = "(COALESCE(json_array_length(json_extract(metadata_json, '$.inspirationProfile.aiTags')), 0) > 0 OR COALESCE(json_extract(metadata_json, '$.inspirationProfile.analysisVersion'), 0) >= 2)";
            let has_no_tags = "NOT (COALESCE(json_array_length(json_extract(metadata_json, '$.inspirationProfile.aiTags')), 0) > 0 OR COALESCE(json_extract(metadata_json, '$.inspirationProfile.analysisVersion'), 0) >= 2)";
            match status {
                "analyzed" => clauses.push(has_tags.to_string()),
                "unprocessed" => clauses.push(format!(
                    "{} AND json_type(metadata_json, '$.inspirationAnalysisFailure') IS NULL",
                    has_no_tags
                )),
                "retryable" => clauses.push(format!(
                    "{} AND json_type(metadata_json, '$.inspirationAnalysisFailure') IS NOT NULL AND COALESCE(json_extract(metadata_json, '$.inspirationAnalysisFailure.attempts'), 0) < 3",
                    has_no_tags
                )),
                "skipped" => clauses.push(format!(
                    "{} AND COALESCE(json_extract(metadata_json, '$.inspirationAnalysisFailure.attempts'), 0) >= 3",
                    has_no_tags
                )),
                _ => {}
            }
        }
        if let Some(keyword) = options
            .keyword
            .as_ref()
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
        {
            clauses.push("(file_name LIKE ? ESCAPE '\\' OR note LIKE ? ESCAPE '\\' OR source_url LIKE ? ESCAPE '\\' OR metadata_json LIKE ? ESCAPE '\\')".to_string());
            let pattern = format!("%{}%", keyword.replace('%', "\\%").replace('_', "\\_"));
            values.push(SqlValue::Text(pattern.clone()));
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

    fn has_column(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
        let sql = format!(
            "SELECT COUNT(*) FROM pragma_table_info('{}') WHERE name = ?1",
            table.replace('\'', "''")
        );
        let count: i64 = conn
            .query_row(&sql, params![column], |row| row.get(0))
            .map_err(|err| err.to_string())?;
        Ok(count > 0)
    }

    fn ensure_folder_deleted_at_column(conn: &Connection) -> Result<(), String> {
        if !Self::has_column(conn, "folders", "deleted_at")? {
            conn.execute("ALTER TABLE folders ADD COLUMN deleted_at INTEGER", [])
                .map_err(|err| err.to_string())?;
        }
        Ok(())
    }

    fn fetch_folder_rows(conn: &Connection, library_id: &str) -> Result<Vec<FolderRow>, String> {
        let deleted_at_sql = if Self::has_column(conn, "folders", "deleted_at")? {
            "deleted_at"
        } else {
            "NULL AS deleted_at"
        };
        let sql = format!(
            r#"
            SELECT id, COALESCE(library_id, ?1), parent_id, name, COALESCE(sort_order, 0), metadata_json, {}
            FROM folders
            WHERE library_id = ?1
            ORDER BY sort_order ASC, created_at ASC, name COLLATE NOCASE ASC
            "#,
            deleted_at_sql
        );
        let mut stmt = conn.prepare(&sql).map_err(|err| err.to_string())?;
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
                    .unwrap_or_else(
                        || json!({ "id": id.clone(), "name": name.clone(), "color": "#10b981" }),
                    );
                if !metadata.is_object() {
                    metadata =
                        json!({ "id": id.clone(), "name": name.clone(), "color": "#10b981" });
                }
                if let Some(object) = metadata.as_object_mut() {
                    object.insert("id".to_string(), Value::String(id.clone()));
                    object.insert("name".to_string(), Value::String(name.clone()));
                    object.insert(
                        "libraryId".to_string(),
                        Value::String(row_library_id.clone()),
                    );
                    object.insert("sortOrder".to_string(), Value::Number(sort_order.into()));
                    if let Some(parent_id) = parent_id.as_deref() {
                        if parent_id.trim().is_empty() {
                            object.remove("parentId");
                        } else {
                            object.insert(
                                "parentId".to_string(),
                                Value::String(parent_id.to_string()),
                            );
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

    fn normalize_folder_payload(
        folder: &Value,
        library_id: &str,
        sort_order: i64,
        now: i64,
    ) -> Result<Option<(String, Option<String>, String, i64, i64, i64, String)>, String> {
        let Some(object) = folder.as_object() else {
            return Ok(None);
        };
        let Some(id) = object
            .get("id")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
        else {
            return Ok(None);
        };
        let Some(name) = object
            .get("name")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
        else {
            return Ok(None);
        };
        let parent_id = object
            .get("parentId")
            .or_else(|| object.get("parent_id"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty() && *value != "all")
            .map(ToOwned::to_owned);
        let created_at = object
            .get("createdAt")
            .or_else(|| object.get("created_at"))
            .and_then(Value::as_i64)
            .unwrap_or(now);
        let updated_at = object
            .get("updatedAt")
            .or_else(|| object.get("updated_at"))
            .and_then(Value::as_i64)
            .unwrap_or(now);
        let mut metadata = folder.clone();
        if let Some(metadata_object) = metadata.as_object_mut() {
            metadata_object.insert("id".to_string(), Value::String(id.clone()));
            metadata_object.insert(
                "libraryId".to_string(),
                Value::String(library_id.to_string()),
            );
            metadata_object.insert("name".to_string(), Value::String(name.clone()));
            metadata_object.insert("sortOrder".to_string(), Value::Number(sort_order.into()));
            metadata_object.insert("updatedAt".to_string(), Value::Number(updated_at.into()));
            if let Some(parent_id) = parent_id.as_deref() {
                metadata_object
                    .insert("parentId".to_string(), Value::String(parent_id.to_string()));
            } else {
                metadata_object.remove("parentId");
            }
            metadata_object.remove("deletedAt");
            metadata_object.remove("deleted_at");
        }
        let metadata_json = serde_json::to_string(&metadata).map_err(|err| err.to_string())?;
        Ok(Some((
            id,
            parent_id,
            name,
            sort_order,
            created_at,
            updated_at,
            metadata_json,
        )))
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
            cursor = rows_by_id
                .get(&current_id)
                .and_then(|row| row.parent_id.clone());
        }
        false
    }

    fn folder_metadata_for_update(
        row: &FolderRow,
        library_id: &str,
        new_parent_id: Option<&str>,
        sort_order: i64,
        now: i64,
    ) -> Value {
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
            object.insert(
                "libraryId".to_string(),
                Value::String(library_id.to_string()),
            );
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

    fn update_asset_on_conn(
        conn: &Connection,
        id: &str,
        patch: AssetUpdatePatch,
    ) -> Result<Option<Value>, String> {
        let stored: Option<String> = conn
            .query_row(
                "SELECT metadata_json FROM assets WHERE id = ?1 AND deleted_at IS NULL",
                params![id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|err| err.to_string())?;
        let Some(stored) = stored else {
            return Ok(None);
        };
        let mut asset = serde_json::from_str::<Value>(&stored).map_err(|err| err.to_string())?;
        if let Some(name) = patch.name {
            asset["name"] = Value::String(name);
        }
        if let Some(content) = patch.content {
            asset["content"] = Value::String(content);
        }
        if let Some(folder_id) = patch.folder_id {
            asset["folderId"] = if folder_id.is_empty() {
                Value::Null
            } else {
                Value::String(folder_id)
            };
        }
        if let Some(note) = patch.note {
            asset["remark"] = Value::String(note);
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
        crate::services::migration_service::insert_asset(conn, &asset, now)?;
        Ok(Some(asset))
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
        let rows = stmt
            .query_map(params_from_iter(values), |row| {
                let metadata: String = row.get(0)?;
                Ok(metadata)
            })
            .map_err(|err| err.to_string())?;
        rows.map(|row| {
            let metadata = row.map_err(|err| err.to_string())?;
            serde_json::from_str::<Value>(&metadata).map_err(|err| err.to_string())
        })
        .collect()
    }

    fn get_asset_by_id(&self, id: &str) -> Result<Option<Value>, String> {
        let value: Option<String> = self
            .conn
            .query_row(
                "SELECT metadata_json FROM assets WHERE id = ?1 AND deleted_at IS NULL",
                params![id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|err| err.to_string())?;
        value
            .map(|metadata| serde_json::from_str(&metadata).map_err(|err| err.to_string()))
            .transpose()
    }

    fn get_asset_count(&self, options: AssetListOptions) -> Result<i64, String> {
        let options = Self::normalize_list_options(options);
        let mut values = Vec::new();
        let where_sql = Self::build_asset_where(&options, &mut values);
        let sql = format!("SELECT COUNT(*) FROM assets {}", where_sql);
        self.conn
            .query_row(&sql, params_from_iter(values), |row| row.get(0))
            .map_err(|err| err.to_string())
    }

    fn upsert_assets(&self, assets: Vec<Value>) -> Result<usize, String> {
        if assets.is_empty() {
            return Ok(0);
        }
        let now = crate::current_time_millis();
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|err| err.to_string())?;
        let log_id = format!("asset-upsert-{}", now);
        tx.execute(
            "INSERT OR REPLACE INTO import_logs (id, library_id, status, total_count, success_count, skipped_count, failed_count, started_at, finished_at) VALUES (?1, ?2, 'running', ?3, 0, 0, 0, ?4, NULL)",
            params![log_id, DEFAULT_LIBRARY_ID, assets.len() as i64, now],
        ).map_err(|err| err.to_string())?;
        let mut written = 0_usize;
        let mut failed = 0_usize;
        for asset in assets {
            match crate::services::migration_service::insert_asset(&tx, &asset, now) {
                Ok(()) => {
                    if let Some(id) = asset.get("id").and_then(Value::as_str) {
                        tx.execute(
                            "UPDATE assets SET drawer_visible = 1 WHERE id = ?1",
                            params![id],
                        )
                        .map_err(|err| err.to_string())?;
                    }
                    written += 1;
                }
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
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|err| err.to_string())?;
        let updated = Self::update_asset_on_conn(&tx, id, patch)?;
        tx.commit().map_err(|err| err.to_string())?;
        Ok(updated)
    }

    fn update_assets_batch(&self, updates: Vec<AssetBatchUpdate>) -> Result<Vec<Value>, String> {
        if updates.is_empty() {
            return Ok(Vec::new());
        }
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|err| err.to_string())?;
        let mut updated_assets = Vec::new();
        let mut seen = HashSet::new();
        for update in updates {
            for id in update.ids {
                if id.trim().is_empty() || !seen.insert(id.clone()) {
                    continue;
                }
                if let Some(asset) = Self::update_asset_on_conn(&tx, &id, update.patch.clone())? {
                    updated_assets.push(asset);
                }
            }
        }
        tx.commit().map_err(|err| err.to_string())?;
        Ok(updated_assets)
    }

    fn delete_asset(&self, id: &str) -> Result<bool, String> {
        let changed = self.conn.execute(
            "UPDATE assets SET deleted_at = ?2, updated_at = ?2 WHERE id = ?1 AND deleted_at IS NULL",
            params![id, crate::current_time_millis()],
        ).map_err(|err| err.to_string())?;
        Ok(changed > 0)
    }

    fn delete_assets_batch(&self, ids: Vec<String>) -> Result<usize, String> {
        let ids = Self::normalize_folder_ids(ids);
        if ids.is_empty() {
            return Ok(0);
        }
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|err| err.to_string())?;
        let now = crate::current_time_millis();
        let mut changed = 0_usize;
        for chunk in ids.chunks(500) {
            let placeholders = chunk.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            let sql = format!(
                "UPDATE assets SET deleted_at = ?, updated_at = ? WHERE deleted_at IS NULL AND id IN ({})",
                placeholders
            );
            let mut values = vec![SqlValue::Integer(now), SqlValue::Integer(now)];
            values.extend(chunk.iter().cloned().map(SqlValue::Text));
            changed += tx
                .execute(&sql, params_from_iter(values))
                .map_err(|err| err.to_string())?;
        }
        tx.commit().map_err(|err| err.to_string())?;
        Ok(changed)
    }

    fn move_assets_from_folders(
        &self,
        source_folder_ids: Vec<String>,
        destination_folder_id: Option<String>,
    ) -> Result<usize, String> {
        let source_folder_ids = Self::normalize_folder_ids(source_folder_ids);
        if source_folder_ids.is_empty() {
            return Ok(0);
        }
        let destination_folder_id = Self::normalize_parent_id(destination_folder_id);
        let placeholders = source_folder_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(",");
        let now = crate::current_time_millis();
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|err| err.to_string())?;
        let changed = if let Some(destination) = destination_folder_id {
            let sql = format!(
                "UPDATE assets SET folder_id = ?, updated_at = ?, metadata_json = json_set(metadata_json, '$.folderId', ?, '$.updatedAt', ?) WHERE library_id = ? AND deleted_at IS NULL AND folder_id IN ({})",
                placeholders
            );
            let mut values = vec![
                SqlValue::Text(destination.clone()),
                SqlValue::Integer(now),
                SqlValue::Text(destination),
                SqlValue::Integer(now),
                SqlValue::Text(DEFAULT_LIBRARY_ID.to_string()),
            ];
            values.extend(source_folder_ids.into_iter().map(SqlValue::Text));
            tx.execute(&sql, params_from_iter(values))
                .map_err(|err| err.to_string())?
        } else {
            let sql = format!(
                "UPDATE assets SET folder_id = NULL, updated_at = ?, metadata_json = json_remove(json_set(metadata_json, '$.updatedAt', ?), '$.folderId') WHERE library_id = ? AND deleted_at IS NULL AND folder_id IN ({})",
                placeholders
            );
            let mut values = vec![
                SqlValue::Integer(now),
                SqlValue::Integer(now),
                SqlValue::Text(DEFAULT_LIBRARY_ID.to_string()),
            ];
            values.extend(source_folder_ids.into_iter().map(SqlValue::Text));
            tx.execute(&sql, params_from_iter(values))
                .map_err(|err| err.to_string())?
        };
        tx.commit().map_err(|err| err.to_string())?;
        Ok(changed)
    }

    fn get_assets_by_ids(&self, ids: Vec<String>) -> Result<Vec<Value>, String> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT metadata_json FROM assets WHERE deleted_at IS NULL AND id IN ({})",
            placeholders
        );
        let mut stmt = self.conn.prepare(&sql).map_err(|err| err.to_string())?;
        let values = ids.into_iter().map(SqlValue::Text).collect::<Vec<_>>();
        let rows = stmt
            .query_map(params_from_iter(values), |row| {
                let metadata: String = row.get(0)?;
                Ok(metadata)
            })
            .map_err(|err| err.to_string())?;
        rows.map(|row| {
            let metadata = row.map_err(|err| err.to_string())?;
            serde_json::from_str::<Value>(&metadata).map_err(|err| err.to_string())
        })
        .collect()
    }

    fn get_assets_in_viewport(&self, options: ViewportOptions) -> Result<Vec<Value>, String> {
        let buffer = options.buffer.unwrap_or(300.0).max(0.0);
        let left = options.viewport_x - buffer;
        let top = options.viewport_y - buffer;
        let right = options.viewport_x + options.viewport_width + buffer;
        let bottom = options.viewport_y + options.viewport_height + buffer;
        let mut stmt = self
            .conn
            .prepare(
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
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map(
                params![options.canvas_id, left, right, top, bottom],
                |row| {
                    let metadata: String = row.get(0)?;
                    Ok(metadata)
                },
            )
            .map_err(|err| err.to_string())?;
        rows.map(|row| {
            let metadata = row.map_err(|err| err.to_string())?;
            serde_json::from_str::<Value>(&metadata).map_err(|err| err.to_string())
        })
        .collect()
    }

    fn debug_get_all_canvas_nodes(
        &self,
        options: DebugCanvasNodesOptions,
    ) -> Result<Value, String> {
        let canvas_id = options.canvas_id.unwrap_or_else(|| "default".to_string());
        let limit = options.limit.unwrap_or(20).clamp(1, 200);
        let count: i64 = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM canvas_nodes WHERE canvas_id = ?1 AND deleted_at IS NULL",
                params![canvas_id],
                |row| row.get(0),
            )
            .map_err(|err| err.to_string())?;
        let mut stmt = self
            .conn
            .prepare(
                r#"
            SELECT id, canvas_id, asset_id, x, y, width, height, rotation, z_index, metadata_json
            FROM canvas_nodes
            WHERE canvas_id = ?1 AND deleted_at IS NULL
            ORDER BY z_index ASC, created_at ASC
            LIMIT ?2
            "#,
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map(params![canvas_id, limit], |row| {
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
            })
            .map_err(|err| err.to_string())?;
        let nodes = rows
            .map(|row| row.map_err(|err| err.to_string()))
            .collect::<Result<Vec<_>, _>>()?;
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
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|err| err.to_string())?;
        let mut written = 0_usize;
        for node in nodes {
            let _ = crate::services::migration_service::insert_canvas_node(
                &tx, &canvas_id, &node, now,
            )?;
            written += 1;
        }
        tx.commit().map_err(|err| err.to_string())?;
        Ok(written)
    }

    fn list_folders(&self, library_id: Option<String>) -> Result<Vec<Value>, String> {
        let library_id = Self::normalize_library_id(library_id);
        Self::list_folders_from_conn(&self.conn, &library_id)
    }

    fn replace_folders(
        &self,
        library_id: Option<String>,
        folders: Vec<Value>,
    ) -> Result<Vec<Value>, String> {
        let library_id = Self::normalize_library_id(library_id);
        Self::ensure_folder_deleted_at_column(&self.conn)?;
        let now = crate::current_time_millis();
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|err| err.to_string())?;
        let mut active_ids = HashSet::new();
        for (index, folder) in folders.iter().enumerate() {
            let Some((id, parent_id, name, sort_order, created_at, updated_at, metadata_json)) =
                Self::normalize_folder_payload(folder, &library_id, index as i64, now)?
            else {
                continue;
            };
            active_ids.insert(id.clone());
            tx.execute(
                r#"
                INSERT INTO folders (id, library_id, parent_id, name, sort_order, created_at, updated_at, deleted_at, metadata_json)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8)
                ON CONFLICT(id) DO UPDATE SET
                    library_id = excluded.library_id,
                    parent_id = excluded.parent_id,
                    name = excluded.name,
                    sort_order = excluded.sort_order,
                    created_at = COALESCE(folders.created_at, excluded.created_at),
                    updated_at = excluded.updated_at,
                    deleted_at = NULL,
                    metadata_json = excluded.metadata_json
                "#,
                params![id, &library_id, parent_id, name, sort_order, created_at, updated_at, metadata_json],
            )
            .map_err(|err| err.to_string())?;
        }

        if active_ids.is_empty() {
            tx.execute(
                "UPDATE folders SET deleted_at = ?2, updated_at = ?2 WHERE library_id = ?1 AND deleted_at IS NULL",
                params![&library_id, now],
            )
            .map_err(|err| err.to_string())?;
        } else {
            let placeholders = active_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
            let sql = format!(
                "UPDATE folders SET deleted_at = ?, updated_at = ? WHERE library_id = ? AND deleted_at IS NULL AND id NOT IN ({})",
                placeholders
            );
            let mut values = vec![
                SqlValue::Integer(now),
                SqlValue::Integer(now),
                SqlValue::Text(library_id.clone()),
            ];
            values.extend(active_ids.into_iter().map(SqlValue::Text));
            tx.execute(&sql, params_from_iter(values))
                .map_err(|err| err.to_string())?;
        }

        tx.commit().map_err(|err| err.to_string())?;
        Self::list_folders_from_conn(&self.conn, &library_id)
    }

    fn move_folders(&self, options: MoveFoldersOptions) -> Result<Vec<Value>, String> {
        let folder_ids = Self::normalize_folder_ids(options.folder_ids);
        if folder_ids.is_empty() {
            return Err("folder_ids cannot be empty".to_string());
        }
        Self::ensure_folder_deleted_at_column(&self.conn)?;
        let library_id = Self::normalize_library_id(options.library_id);
        let new_parent_id = Self::normalize_parent_id(options.new_parent_id);
        let selected_ids = folder_ids.iter().cloned().collect::<HashSet<_>>();
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|err| err.to_string())?;
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
            let metadata = Self::folder_metadata_for_update(
                row,
                &library_id,
                new_parent_id.as_deref(),
                sort_order,
                now,
            );
            let metadata_json = serde_json::to_string(&metadata).map_err(|err| err.to_string())?;
            let changed = tx
                .execute(
                    r#"
                    UPDATE folders
                    SET parent_id = ?2, sort_order = ?3, updated_at = ?4, metadata_json = ?5
                    WHERE id = ?1 AND library_id = ?6 AND deleted_at IS NULL
                    "#,
                    params![
                        folder_id,
                        new_parent_id.as_deref(),
                        sort_order,
                        now,
                        metadata_json,
                        &library_id
                    ],
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
        let rows = stmt
            .query_map(params![library_id], |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "name": row.get::<_, String>(1)?,
                    "color": row.get::<_, Option<String>>(2)?.unwrap_or_default(),
                    "createdAt": row.get::<_, i64>(3)?,
                    "updatedAt": row.get::<_, i64>(4)?,
                }))
            })
            .map_err(|err| err.to_string())?;
        rows.map(|row| row.map_err(|err| err.to_string())).collect()
    }

    fn get_folder_asset_counts(&self, library_id: Option<String>) -> Result<Vec<Value>, String> {
        let library_id = Self::normalize_library_id(library_id);
        let mut stmt = self
            .conn
            .prepare(
                "SELECT NULLIF(folder_id, ''), COUNT(*) FROM assets WHERE library_id = ?1 AND deleted_at IS NULL AND COALESCE(drawer_visible, 1) = 1 GROUP BY NULLIF(folder_id, '')",
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map(params![library_id], |row| {
                Ok(json!({
                    "folderId": row.get::<_, Option<String>>(0)?,
                    "count": row.get::<_, i64>(1)?,
                }))
            })
            .map_err(|err| err.to_string())?;
        rows.map(|row| row.map_err(|err| err.to_string())).collect()
    }

    fn get_tag_asset_counts(&self, library_id: Option<String>) -> Result<Vec<Value>, String> {
        let library_id = Self::normalize_library_id(library_id);
        let mut stmt = self
            .conn
            .prepare(
                r#"
                SELECT asset_tags.tag_id, COUNT(DISTINCT asset_tags.asset_id)
                FROM asset_tags
                INNER JOIN assets ON assets.id = asset_tags.asset_id
                WHERE assets.library_id = ?1
                  AND assets.deleted_at IS NULL
                  AND COALESCE(assets.drawer_visible, 1) = 1
                GROUP BY asset_tags.tag_id
                "#,
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map(params![library_id], |row| {
                Ok(json!({
                    "tagId": row.get::<_, String>(0)?,
                    "count": row.get::<_, i64>(1)?,
                }))
            })
            .map_err(|err| err.to_string())?;
        rows.map(|row| row.map_err(|err| err.to_string())).collect()
    }

    fn get_inspiration_analysis_counts(&self, library_id: Option<String>) -> Result<Value, String> {
        let library_id = Self::normalize_library_id(library_id);
        self.conn
            .query_row(
                r#"
                SELECT
                    COUNT(*),
                    SUM(CASE WHEN COALESCE(json_array_length(json_extract(metadata_json, '$.inspirationProfile.aiTags')), 0) > 0
                        OR COALESCE(json_extract(metadata_json, '$.inspirationProfile.analysisVersion'), 0) >= 2 THEN 1 ELSE 0 END),
                    SUM(CASE WHEN NOT (COALESCE(json_array_length(json_extract(metadata_json, '$.inspirationProfile.aiTags')), 0) > 0
                        OR COALESCE(json_extract(metadata_json, '$.inspirationProfile.analysisVersion'), 0) >= 2)
                        AND json_type(metadata_json, '$.inspirationAnalysisFailure') IS NOT NULL
                        AND COALESCE(json_extract(metadata_json, '$.inspirationAnalysisFailure.attempts'), 0) < 3 THEN 1 ELSE 0 END),
                    SUM(CASE WHEN NOT (COALESCE(json_array_length(json_extract(metadata_json, '$.inspirationProfile.aiTags')), 0) > 0
                        OR COALESCE(json_extract(metadata_json, '$.inspirationProfile.analysisVersion'), 0) >= 2)
                        AND COALESCE(json_extract(metadata_json, '$.inspirationAnalysisFailure.attempts'), 0) >= 3 THEN 1 ELSE 0 END)
                FROM assets
                WHERE library_id = ?1
                  AND deleted_at IS NULL
                  AND COALESCE(drawer_visible, 1) = 1
                  AND file_type = 'image'
                "#,
                params![library_id],
                |row| {
                    Ok(json!({
                        "total": row.get::<_, i64>(0)?,
                        "analyzed": row.get::<_, Option<i64>>(1)?.unwrap_or(0),
                        "waitingRetry": row.get::<_, Option<i64>>(2)?.unwrap_or(0),
                        "skipped": row.get::<_, Option<i64>>(3)?.unwrap_or(0),
                    }))
                },
            )
            .map_err(|err| err.to_string())
    }

    fn get_asset_thumbnails(&self, asset_id: &str) -> Result<Vec<Value>, String> {
        let mut stmt = self.conn.prepare(
            "SELECT id, asset_id, size, path, width, height, format, file_size, created_at, source_modified_at FROM thumbnails WHERE asset_id = ?1 ORDER BY size ASC",
        ).map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map(params![asset_id], |row| {
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
            })
            .map_err(|err| err.to_string())?;
        rows.map(|row| row.map_err(|err| err.to_string())).collect()
    }
}

#[cfg(test)]
mod tests {
    use std::time::Instant;

    use rusqlite::{params, Connection};
    use serde_json::json;

    use super::SqliteAssetRepository;
    use crate::db::schema::{ensure_schema, DEFAULT_LIBRARY_ID};
    use crate::repositories::asset_repository::{
        AssetBatchUpdate, AssetListOptions, AssetRepository, AssetUpdatePatch,
    };

    fn repository() -> SqliteAssetRepository {
        let conn = Connection::open_in_memory().expect("in-memory sqlite");
        ensure_schema(&conn).expect("asset schema");
        SqliteAssetRepository::new(conn)
    }

    #[test]
    fn batch_crud_and_database_counts_stay_consistent() {
        let repo = repository();
        repo.upsert_assets(vec![
            json!({ "id": "a", "type": "image", "name": "Alpha", "content": "Alpha", "folderId": "f1", "createdAt": 3, "remarks": ["#warm"] }),
            json!({ "id": "b", "type": "image", "name": "Beta", "content": "Beta", "folderId": "f1", "createdAt": 2, "isQuickAccess": true }),
            json!({ "id": "c", "type": "text", "name": "Gamma", "content": "Gamma", "createdAt": 1 }),
        ])
        .expect("seed assets");

        assert_eq!(
            repo.get_asset_count(AssetListOptions::default()).unwrap(),
            3
        );
        assert_eq!(
            repo.get_asset_count(AssetListOptions {
                folder_id: Some("f1".to_string()),
                ..Default::default()
            })
            .unwrap(),
            2
        );
        assert_eq!(
            repo.get_asset_count(AssetListOptions {
                quick_access: Some(true),
                ..Default::default()
            })
            .unwrap(),
            1
        );

        let updated = repo
            .update_assets_batch(vec![AssetBatchUpdate {
                ids: vec!["a".to_string(), "b".to_string()],
                patch: AssetUpdatePatch {
                    folder_id: Some("f2".to_string()),
                    ..Default::default()
                },
            }])
            .expect("batch move");
        assert_eq!(updated.len(), 2);
        assert_eq!(
            repo.delete_assets_batch(vec!["b".to_string(), "c".to_string()])
                .unwrap(),
            2
        );
        assert_eq!(
            repo.get_asset_count(AssetListOptions::default()).unwrap(),
            1
        );

        let counts = repo.get_folder_asset_counts(None).expect("folder counts");
        assert_eq!(counts, vec![json!({ "folderId": "f2", "count": 1 })]);
        assert_eq!(
            repo.move_assets_from_folders(vec!["f2".to_string()], None)
                .expect("move deleted folder assets"),
            1
        );
        assert_eq!(
            repo.get_folder_asset_counts(None).expect("unfiled counts"),
            vec![json!({ "folderId": null, "count": 1 })]
        );
        let tag_counts = repo.get_tag_asset_counts(None).expect("tag counts");
        assert_eq!(tag_counts.len(), 1);
        assert_eq!(tag_counts[0]["count"], 1);
    }

    #[test]
    fn inspiration_analysis_queue_filters_cover_the_entire_database() {
        let repo = repository();
        repo.upsert_assets(vec![
            json!({ "id": "pending", "type": "image", "path": "C:/pending.jpg", "createdAt": 4 }),
            json!({ "id": "analyzed-empty-v2", "type": "image", "path": "C:/strict.jpg", "createdAt": 4, "inspirationProfile": { "aiTags": [], "analysisVersion": 2 } }),
            json!({ "id": "analyzed", "type": "image", "path": "C:/analyzed.jpg", "createdAt": 3, "inspirationProfile": { "aiTags": [{ "name": "工业设计", "category": "设计领域", "confidence": 0.9 }] } }),
            json!({ "id": "retry", "type": "image", "path": "C:/retry.jpg", "createdAt": 2, "inspirationAnalysisFailure": { "attemptedAt": 1, "attempts": 1, "message": "temporary" } }),
            json!({ "id": "skipped", "type": "image", "path": "C:/skipped.jpg", "createdAt": 1, "inspirationAnalysisFailure": { "attemptedAt": 1, "attempts": 3, "message": "failed" } }),
            json!({ "id": "text", "type": "text", "content": "not an image", "createdAt": 0 }),
        ])
        .expect("seed analysis states");

        for (status, expected_id) in [
            ("unprocessed", "pending"),
            ("retryable", "retry"),
            ("skipped", "skipped"),
        ] {
            let rows = repo
                .list_assets(AssetListOptions {
                    file_type: Some("image".to_string()),
                    inspiration_status: Some(status.to_string()),
                    ..Default::default()
                })
                .expect("query analysis state");
            assert_eq!(rows.len(), 1, "unexpected row count for {status}");
            assert_eq!(rows[0]["id"], expected_id);
        }

        let analyzed = repo
            .list_assets(AssetListOptions {
                file_type: Some("image".to_string()),
                inspiration_status: Some("analyzed".to_string()),
                ..Default::default()
            })
            .expect("query analyzed state");
        assert_eq!(analyzed.len(), 2);
        assert!(analyzed.iter().any(|row| row["id"] == "analyzed-empty-v2"));

        assert_eq!(
            repo.get_inspiration_analysis_counts(None)
                .expect("aggregate analysis counts"),
            json!({ "total": 5, "analyzed": 2, "waitingRetry": 1, "skipped": 1 })
        );
    }

    #[test]
    fn drawer_queries_exclude_canvas_private_items_and_keep_source_assets_addressable() {
        let repo = repository();
        repo.upsert_assets(vec![
            json!({ "id": "drawer-source", "type": "text", "name": "Drawer note", "createdAt": 2 }),
            json!({ "id": "canvas-private", "type": "text", "name": "Private prompt", "createdAt": 1 }),
        ])
        .expect("seed assets");
        crate::services::migration_service::insert_canvas_node(
            &repo.conn,
            "default",
            &json!({
                "id": "source-node",
                "item": { "id": "canvas-copy", "sourceItemId": "drawer-source", "type": "text", "name": "Drawer note" },
                "x": 0,
                "y": 0,
                "width": 100,
                "height": 100
            }),
            3,
        )
        .expect("insert source node");
        crate::services::migration_service::insert_canvas_node(
            &repo.conn,
            "default",
            &json!({
                "id": "private-node",
                "item": { "id": "canvas-private", "type": "text", "name": "Private prompt" },
                "x": 0,
                "y": 0,
                "width": 100,
                "height": 100
            }),
            3,
        )
        .expect("insert private node");
        repo.conn
            .execute(
                "UPDATE assets SET drawer_visible = 0 WHERE id = 'canvas-private'",
                [],
            )
            .expect("mark private canvas item hidden");

        let visible = repo
            .list_assets(AssetListOptions::default())
            .expect("list drawer assets");
        assert_eq!(visible.len(), 1);
        assert_eq!(visible[0]["id"], "drawer-source");
        assert!(repo
            .get_asset_by_id("canvas-private")
            .expect("read private item by id")
            .is_some());
        let source_asset_id: String = repo
            .conn
            .query_row(
                "SELECT asset_id FROM canvas_nodes WHERE id = 'source-node'",
                [],
                |row| row.get(0),
            )
            .expect("read source link");
        assert_eq!(source_asset_id, "drawer-source");

        repo.upsert_assets(vec![json!({
            "id": "canvas-private",
            "type": "text",
            "name": "Explicitly saved prompt",
            "createdAt": 1
        })])
        .expect("save hidden canvas item to drawer");
        let visible_after_save = repo
            .list_assets(AssetListOptions::default())
            .expect("list drawer assets after explicit save");
        assert_eq!(visible_after_save.len(), 2);
        assert!(visible_after_save
            .iter()
            .any(|item| item["id"] == "canvas-private"));
    }

    #[test]
    #[ignore = "explicit 100k metadata performance acceptance test"]
    fn repository_perf_100k() {
        let repo = repository();
        let seed_started = Instant::now();
        let tx = repo.conn.unchecked_transaction().expect("seed transaction");
        {
            let mut stmt = tx
                .prepare(
                    r#"
                    INSERT INTO assets
                    (id, library_id, folder_id, file_path, file_name, file_ext, file_type, file_size, width, height, duration, hash, quick_hash, source_url, note, rating, created_at, updated_at, imported_at, modified_at, deleted_at, metadata_json)
                    VALUES (?1, ?2, ?3, ?4, ?5, 'jpg', 'image', 1024, 512, 512, NULL, NULL, NULL, NULL, ?6, 0, ?7, ?7, ?7, ?7, NULL, ?8)
                    "#,
                )
                .expect("prepare seed");
            for index in 0_i64..100_000 {
                let id = format!("perf-{index:06}");
                let folder_id = format!("folder-{}", index % 100);
                let file_name = if index == 99_999 {
                    "needle-99999.jpg".to_string()
                } else {
                    format!("asset-{index:06}.jpg")
                };
                let metadata = json!({
                    "id": id.clone(),
                    "type": "image",
                    "name": file_name.clone(),
                    "content": file_name.clone(),
                    "path": format!("C:/mock/{file_name}"),
                    "folderId": folder_id.clone(),
                    "createdAt": index,
                })
                .to_string();
                stmt.execute(params![
                    id,
                    DEFAULT_LIBRARY_ID,
                    folder_id,
                    format!("C:/mock/{file_name}"),
                    file_name,
                    "",
                    index,
                    metadata,
                ])
                .expect("insert perf asset");
            }
        }
        tx.commit().expect("commit seed");
        let seed_ms = seed_started.elapsed().as_millis();

        let count_started = Instant::now();
        assert_eq!(
            repo.get_asset_count(AssetListOptions::default()).unwrap(),
            100_000
        );
        let count_ms = count_started.elapsed().as_millis();

        let analysis_queue_started = Instant::now();
        let analysis_counts = repo
            .get_inspiration_analysis_counts(None)
            .expect("analysis queue counts");
        assert_eq!(analysis_counts["total"], 100_000);
        assert_eq!(analysis_counts["analyzed"], 0);
        let analysis_queue_count_ms = analysis_queue_started.elapsed().as_millis();

        let page_started = Instant::now();
        let page = repo
            .list_assets(AssetListOptions {
                offset: Some(50_000),
                limit: Some(200),
                ..Default::default()
            })
            .expect("middle page");
        assert_eq!(page.len(), 200);
        let page_ms = page_started.elapsed().as_millis();

        let search_started = Instant::now();
        let search = repo
            .list_assets(AssetListOptions {
                keyword: Some("needle-99999".to_string()),
                limit: Some(200),
                ..Default::default()
            })
            .expect("search page");
        assert_eq!(search.len(), 1);
        let search_ms = search_started.elapsed().as_millis();

        println!(
            "[DrawerPerf100k] seed_ms={seed_ms} count_ms={count_ms} analysis_queue_count_ms={analysis_queue_count_ms} page_offset_50000_ms={page_ms} search_ms={search_ms}"
        );
    }
}
