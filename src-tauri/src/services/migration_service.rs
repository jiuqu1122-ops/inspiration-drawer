use std::fs;
use std::path::Path;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::db::connection::{
    database_path, open_connection, set_json_mode_forced, sqlite_database_exists,
};
use crate::db::schema::{DEFAULT_CANVAS_ID, DEFAULT_LIBRARY_ID, DEFAULT_PROJECT_ID};
use crate::repositories::json_asset_repository::JsonAssetRepository;

const MIGRATION_ID_JSON_TO_SQLITE: &str = "json-to-sqlite-v1";
const MIGRATION_BATCH_SIZE: usize = 500;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MigrationStatus {
    pub mode: String,
    #[serde(rename = "databasePath")]
    pub database_path: String,
    #[serde(rename = "databaseExists")]
    pub database_exists: bool,
    #[serde(rename = "jsonModeForced")]
    pub json_mode_forced: bool,
    pub status: String,
    #[serde(rename = "totalCount")]
    pub total_count: i64,
    #[serde(rename = "processedCount")]
    pub processed_count: i64,
    #[serde(rename = "successCount")]
    pub success_count: i64,
    #[serde(rename = "failedCount")]
    pub failed_count: i64,
    #[serde(rename = "currentFile")]
    pub current_file: Option<String>,
    pub error: Option<String>,
    #[serde(rename = "startedAt")]
    pub started_at: Option<i64>,
    #[serde(rename = "finishedAt")]
    pub finished_at: Option<i64>,
}

pub fn get_migration_status(app_handle: tauri::AppHandle) -> Result<MigrationStatus, String> {
    let db_path = database_path(&app_handle);
    let db_exists = sqlite_database_exists(&app_handle);
    let json_forced = crate::db::connection::is_json_mode_forced(&app_handle);
    if !db_exists {
        return Ok(MigrationStatus {
            mode: "json".to_string(),
            database_path: db_path.to_string_lossy().to_string(),
            database_exists: false,
            json_mode_forced: json_forced,
            status: "not_started".to_string(),
            ..Default::default()
        });
    }
    let conn = open_connection(&app_handle)?;
    ensure_migration_progress_columns(&conn)?;
    let row = conn.query_row(
        "SELECT status, total_count, processed_count, success_count, failed_count, current_file, error, started_at, finished_at
         FROM migrations WHERE id = ?1",
        params![MIGRATION_ID_JSON_TO_SQLITE],
        |row| {
            Ok(MigrationStatus {
                mode: if json_forced { "json" } else { "sqlite" }.to_string(),
                database_path: db_path.to_string_lossy().to_string(),
                database_exists: true,
                json_mode_forced: json_forced,
                status: row.get(0)?,
                total_count: row.get::<_, Option<i64>>(1)?.unwrap_or(0),
                processed_count: row.get::<_, Option<i64>>(2)?.unwrap_or(0),
                success_count: row.get::<_, Option<i64>>(3)?.unwrap_or(0),
                failed_count: row.get::<_, Option<i64>>(4)?.unwrap_or(0),
                current_file: row.get(5)?,
                error: row.get(6)?,
                started_at: row.get(7)?,
                finished_at: row.get(8)?,
            })
        },
    );
    match row {
        Ok(status) => Ok(status),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(MigrationStatus {
            mode: if json_forced { "json" } else { "sqlite" }.to_string(),
            database_path: db_path.to_string_lossy().to_string(),
            database_exists: true,
            json_mode_forced: json_forced,
            status: "schema_ready".to_string(),
            ..Default::default()
        }),
        Err(err) => Err(err.to_string()),
    }
}

pub fn rollback_to_json_mode(app_handle: tauri::AppHandle) -> Result<MigrationStatus, String> {
    set_json_mode_forced(&app_handle, true)?;
    get_migration_status(app_handle)
}

pub fn migrate_json_to_sqlite(app_handle: tauri::AppHandle) -> Result<MigrationStatus, String> {
    let repo = JsonAssetRepository::new(app_handle.clone());
    backup_json_files(&app_handle, &repo)?;
    let conn = open_connection(&app_handle)?;
    ensure_migration_progress_columns(&conn)?;

    let started_at = crate::current_time_millis();
    let items = repo.read_items()?;
    let folders = repo.read_folders()?;
    let canvas_state = repo.read_canvas_state().unwrap_or_else(|_| json!({}));
    let total = items.len() as i64;
    upsert_migration_row(
        &conn, "running", total, 0, 0, 0, None, None, started_at, None,
    )?;

    let migration_result = migrate_payloads(&conn, &items, &folders, &canvas_state, started_at);
    match migration_result {
        Ok((processed, success, failed)) => {
            let sqlite_asset_count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM assets WHERE library_id = ?1 AND deleted_at IS NULL",
                    params![DEFAULT_LIBRARY_ID],
                    |row| row.get(0),
                )
                .map_err(|err| err.to_string())?;
            let sqlite_folder_count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM folders WHERE library_id = ?1",
                    params![DEFAULT_LIBRARY_ID],
                    |row| row.get(0),
                )
                .map_err(|err| err.to_string())?;
            if sqlite_asset_count < success || sqlite_folder_count < folders.len() as i64 {
                return finish_migration_error(
                    &conn,
                    total,
                    processed,
                    success,
                    failed,
                    started_at,
                    format!(
                        "validation failed: sqlite assets {}, expected at least {}; folders {}, expected at least {}",
                        sqlite_asset_count,
                        success,
                        sqlite_folder_count,
                        folders.len()
                    ),
                );
            }
            let finished_at = crate::current_time_millis();
            upsert_migration_row(
                &conn,
                "success",
                total,
                processed,
                success,
                failed,
                None,
                None,
                started_at,
                Some(finished_at),
            )?;
            set_json_mode_forced(&app_handle, false)?;
            get_migration_status(app_handle)
        }
        Err(err) => finish_migration_error(&conn, total, 0, 0, total, started_at, err),
    }
}

fn finish_migration_error(
    conn: &Connection,
    total: i64,
    processed: i64,
    success: i64,
    failed: i64,
    started_at: i64,
    error: String,
) -> Result<MigrationStatus, String> {
    let finished_at = crate::current_time_millis();
    upsert_migration_row(
        conn,
        "failed",
        total,
        processed,
        success,
        failed,
        None,
        Some(error.clone()),
        started_at,
        Some(finished_at),
    )?;
    Err(error)
}

fn ensure_migration_progress_columns(conn: &Connection) -> Result<(), String> {
    let columns = [
        ("total_count", "INTEGER"),
        ("processed_count", "INTEGER"),
        ("success_count", "INTEGER"),
        ("failed_count", "INTEGER"),
        ("current_file", "TEXT"),
    ];
    for (name, ty) in columns {
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('migrations') WHERE name = ?1",
                params![name],
                |row| row.get(0),
            )
            .map_err(|err| err.to_string())?;
        if exists == 0 {
            conn.execute(
                &format!("ALTER TABLE migrations ADD COLUMN {} {}", name, ty),
                [],
            )
            .map_err(|err| err.to_string())?;
        }
    }
    Ok(())
}

fn upsert_migration_row(
    conn: &Connection,
    status: &str,
    total: i64,
    processed: i64,
    success: i64,
    failed: i64,
    current_file: Option<String>,
    error: Option<String>,
    started_at: i64,
    finished_at: Option<i64>,
) -> Result<(), String> {
    conn.execute(
        r#"
        INSERT INTO migrations (id, version, name, status, started_at, finished_at, error, total_count, processed_count, success_count, failed_count, current_file)
        VALUES (?1, 1, 'JSON to SQLite migration', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        ON CONFLICT(id) DO UPDATE SET
            status = excluded.status,
            started_at = excluded.started_at,
            finished_at = excluded.finished_at,
            error = excluded.error,
            total_count = excluded.total_count,
            processed_count = excluded.processed_count,
            success_count = excluded.success_count,
            failed_count = excluded.failed_count,
            current_file = excluded.current_file
        "#,
        params![
            MIGRATION_ID_JSON_TO_SQLITE,
            status,
            started_at,
            finished_at,
            error,
            total,
            processed,
            success,
            failed,
            current_file,
        ],
    )
    .map_err(|err| err.to_string())?;
    Ok(())
}

fn backup_json_files(
    app_handle: &tauri::AppHandle,
    repo: &JsonAssetRepository,
) -> Result<(), String> {
    let backup_dir = crate::get_user_data_dir(app_handle)
        .join("json_backups")
        .join(format!("migration_{}", crate::current_time_millis()));
    fs::create_dir_all(&backup_dir).map_err(|err| err.to_string())?;
    for source in [repo.items_path(), repo.folders_path(), repo.canvas_path()] {
        if !source.exists() {
            continue;
        }
        let file_name = source
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("data.json");
        fs::copy(&source, backup_dir.join(file_name)).map_err(|err| err.to_string())?;
    }
    Ok(())
}

fn migrate_payloads(
    conn: &Connection,
    items: &[Value],
    folders: &[Value],
    canvas_state: &Value,
    started_at: i64,
) -> Result<(i64, i64, i64), String> {
    conn.execute(
        "INSERT OR IGNORE INTO libraries (id, name, path, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![DEFAULT_LIBRARY_ID, "Default Library", "", started_at, started_at],
    ).map_err(|err| err.to_string())?;
    conn.execute(
        r#"
        INSERT OR IGNORE INTO canvases
        (id, project_id, library_id, name, description, thumbnail_path, sort_order, is_active, is_snapshot, source_canvas_id, created_at, updated_at, last_opened_at, deleted_at)
        VALUES (?1, ?2, ?3, '默认画布', '', NULL, 0, 1, 0, NULL, ?4, ?4, ?4, NULL)
        "#,
        params![DEFAULT_CANVAS_ID, DEFAULT_PROJECT_ID, DEFAULT_LIBRARY_ID, started_at],
    ).map_err(|err| err.to_string())?;

    for (index, chunk) in folders.chunks(MIGRATION_BATCH_SIZE).enumerate() {
        let tx = conn
            .unchecked_transaction()
            .map_err(|err| err.to_string())?;
        for (offset, folder) in chunk.iter().enumerate() {
            insert_folder(
                &tx,
                folder,
                (index * MIGRATION_BATCH_SIZE + offset) as i64,
                started_at,
            )?;
        }
        tx.commit().map_err(|err| err.to_string())?;
    }

    let mut processed = 0_i64;
    let mut success = 0_i64;
    let mut failed = 0_i64;
    for chunk in items.chunks(MIGRATION_BATCH_SIZE) {
        let tx = conn
            .unchecked_transaction()
            .map_err(|err| err.to_string())?;
        for item in chunk {
            processed += 1;
            match insert_asset(&tx, item, started_at) {
                Ok(()) => success += 1,
                Err(err) => {
                    failed += 1;
                    let log_id = format!("migration-error-{}", started_at);
                    tx.execute(
                        "INSERT OR IGNORE INTO import_logs (id, library_id, status, total_count, success_count, skipped_count, failed_count, started_at) VALUES (?1, ?2, 'migration', ?3, 0, 0, 0, ?4)",
                        params![log_id, DEFAULT_LIBRARY_ID, items.len() as i64, started_at],
                    ).map_err(|inner| inner.to_string())?;
                    tx.execute(
                        "INSERT INTO import_errors (id, import_log_id, file_path, reason, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                        params![
                            format!("{}-{}", log_id, processed),
                            log_id,
                            item.get("path").and_then(Value::as_str).unwrap_or_default(),
                            err,
                            crate::current_time_millis(),
                        ],
                    ).map_err(|inner| inner.to_string())?;
                }
            }
        }
        tx.commit().map_err(|err| err.to_string())?;
        upsert_migration_row(
            conn,
            "running",
            items.len() as i64,
            processed,
            success,
            failed,
            None,
            None,
            started_at,
            None,
        )?;
    }

    insert_canvas_nodes(conn, canvas_state, started_at)?;
    Ok((processed, success, failed))
}

fn insert_folder(
    conn: &Connection,
    folder: &Value,
    sort_order: i64,
    now: i64,
) -> Result<(), String> {
    let id = value_string(folder, "id").ok_or_else(|| "folder missing id".to_string())?;
    let name = value_string(folder, "name").unwrap_or_else(|| "Folder".to_string());
    let parent_id = value_string(folder, "parentId");
    let created_at = value_i64(folder, "createdAt").unwrap_or(now);
    let metadata_json = serde_json::to_string(folder).map_err(|err| err.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO folders (id, library_id, parent_id, name, sort_order, created_at, updated_at, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, DEFAULT_LIBRARY_ID, parent_id, name, sort_order, created_at, now, metadata_json],
    ).map_err(|err| err.to_string())?;
    Ok(())
}

pub(crate) fn insert_asset(conn: &Connection, item: &Value, now: i64) -> Result<(), String> {
    let id = value_string(item, "id").ok_or_else(|| "asset missing id".to_string())?;
    let file_type = value_string(item, "type").unwrap_or_else(|| "file".to_string());
    let file_path = value_string(item, "path")
        .or_else(|| value_string(item, "url"))
        .unwrap_or_default();
    let file_name = value_string(item, "name")
        .or_else(|| value_string(item, "content"))
        .unwrap_or_else(|| file_name_from_path(&file_path));
    let file_ext = Path::new(&file_name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let folder_id = value_string(item, "folderId");
    let file_size = value_i64(item, "fileSize").unwrap_or(0);
    let width = value_i64(item, "width").unwrap_or(0);
    let height = value_i64(item, "height").unwrap_or(0);
    let quick_hash = value_string(item, "fingerprint");
    let hash = value_string(item, "hash");
    let source_url = value_string(item, "sourceUrl").or_else(|| value_string(item, "originalUrl"));
    let note = value_string(item, "remark");
    let created_at = value_i64(item, "createdAt").unwrap_or(now);
    let updated_at = value_i64(item, "updatedAt").unwrap_or(created_at);
    let imported_at = value_i64(item, "importedAt").unwrap_or(created_at);
    let modified_at = value_i64(item, "modifiedAt").unwrap_or(0);
    let metadata_json = serde_json::to_string(item).map_err(|err| err.to_string())?;

    conn.execute(
        r#"
        INSERT OR REPLACE INTO assets
        (id, library_id, folder_id, file_path, file_name, file_ext, file_type, file_size, width, height, duration, hash, quick_hash, source_url, note, rating, created_at, updated_at, imported_at, modified_at, deleted_at, metadata_json)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, NULL, ?20)
        "#,
        params![
            id,
            DEFAULT_LIBRARY_ID,
            folder_id,
            file_path,
            file_name,
            file_ext,
            file_type,
            file_size,
            width,
            height,
            hash,
            quick_hash,
            source_url,
            note,
            value_i64(item, "rating").unwrap_or(0),
            created_at,
            updated_at,
            imported_at,
            modified_at,
            metadata_json,
        ],
    ).map_err(|err| err.to_string())?;

    if let Some(thumbnail) = value_string(item, "thumbnail") {
        conn.execute(
            "INSERT OR REPLACE INTO thumbnails (id, asset_id, size, path, width, height, format, file_size, created_at, source_modified_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                format!("{}:512", id),
                id,
                512,
                thumbnail,
                width,
                height,
                "unknown",
                0,
                now,
                modified_at,
            ],
        ).map_err(|err| err.to_string())?;
    }

    if let Some(remarks) = item.get("remarks").and_then(Value::as_array) {
        for remark in remarks {
            let Some(text) = remark
                .as_str()
                .map(str::trim)
                .filter(|value| value.starts_with('#') && value.len() > 1)
            else {
                continue;
            };
            let tag_name = text.trim_start_matches('#').trim();
            let tag_id = format!("tag-{}", crate::stable_hash_hex(tag_name));
            conn.execute(
                "INSERT OR IGNORE INTO tags (id, library_id, name, color, created_at, updated_at) VALUES (?1, ?2, ?3, '', ?4, ?4)",
                params![tag_id, DEFAULT_LIBRARY_ID, tag_name, now],
            ).map_err(|err| err.to_string())?;
            conn.execute(
                "INSERT OR IGNORE INTO asset_tags (asset_id, tag_id) VALUES (?1, ?2)",
                params![id, tag_id],
            )
            .map_err(|err| err.to_string())?;
        }
    }

    Ok(())
}

fn insert_canvas_nodes(conn: &Connection, canvas_state: &Value, now: i64) -> Result<(), String> {
    let items = canvas_state
        .get("items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    for chunk in items.chunks(MIGRATION_BATCH_SIZE) {
        let tx = conn
            .unchecked_transaction()
            .map_err(|err| err.to_string())?;
        for node in chunk {
            let _ = insert_canvas_node(&tx, DEFAULT_CANVAS_ID, node, now)?;
        }
        tx.commit().map_err(|err| err.to_string())?;
    }
    Ok(())
}

pub(crate) fn insert_canvas_node(
    conn: &Connection,
    canvas_id: &str,
    node: &Value,
    now: i64,
) -> Result<String, String> {
    insert_canvas_node_with_z_index(
        conn,
        canvas_id,
        node,
        now,
        value_i64(node, "zIndex")
            .or_else(|| value_i64(node, "z_index"))
            .unwrap_or(0),
    )
}

pub(crate) fn insert_canvas_node_with_z_index(
    conn: &Connection,
    canvas_id: &str,
    node: &Value,
    now: i64,
    fallback_z_index: i64,
) -> Result<String, String> {
    let mut id = value_string(node, "id")
        .unwrap_or_else(|| format!("canvas-node-{}", crate::stable_hash_hex(&node.to_string())));
    if canvas_node_id_belongs_to_other_canvas(conn, &id, canvas_id)? {
        id = format!(
            "{}-{}",
            canvas_id,
            crate::stable_hash_hex(&format!("{}:{}", id, canvas_id))
        );
    }
    let item = node.get("item");
    let raw_asset_id = item.and_then(|item| value_string(item, "id"));
    let asset_id = resolve_canvas_asset_id(conn, raw_asset_id.as_deref(), item)?;
    let x = value_f64(node, "x").unwrap_or(0.0);
    let y = value_f64(node, "y").unwrap_or(0.0);
    let width = value_f64(node, "width").unwrap_or(0.0);
    let height = value_f64(node, "height").unwrap_or(0.0);
    let rotation = value_f64(node, "rotation").unwrap_or(0.0);
    let z_index = value_i64(node, "zIndex")
        .or_else(|| value_i64(node, "z_index"))
        .unwrap_or(fallback_z_index);
    let mut metadata = node.clone();
    if let Some(object) = metadata.as_object_mut() {
        object.insert("id".to_string(), Value::String(id.clone()));
    }
    if asset_id.is_none() && raw_asset_id.is_some() {
        if let Some(object) = metadata.as_object_mut() {
            object.insert(
                "orphanAssetId".to_string(),
                Value::String(raw_asset_id.unwrap_or_default()),
            );
            object.insert(
                "orphanReason".to_string(),
                Value::String("canvas asset id could not be matched to assets table".to_string()),
            );
        }
    }
    let metadata_json = serde_json::to_string(&metadata).map_err(|err| err.to_string())?;
    let updated = conn
        .execute(
            r#"
        UPDATE canvas_nodes
        SET canvas_id = ?2,
            asset_id = ?3,
            x = ?4,
            y = ?5,
            width = ?6,
            height = ?7,
            rotation = ?8,
            z_index = ?9,
            updated_at = ?10,
            deleted_at = NULL,
            metadata_json = ?11
        WHERE id = ?1 AND canvas_id = ?2
        "#,
            params![
                id,
                canvas_id,
                asset_id,
                x,
                y,
                width,
                height,
                rotation,
                z_index,
                now,
                metadata_json
            ],
        )
        .map_err(|err| err.to_string())?;
    if updated == 0 {
        conn.execute(
            r#"
            INSERT INTO canvas_nodes
            (id, canvas_id, asset_id, x, y, width, height, rotation, z_index, created_at, updated_at, deleted_at, metadata_json)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10, NULL, ?11)
            "#,
            params![id, canvas_id, asset_id, x, y, width, height, rotation, z_index, now, metadata_json],
        ).map_err(|err| err.to_string())?;
    }
    Ok(id)
}

fn canvas_node_id_belongs_to_other_canvas(
    conn: &Connection,
    id: &str,
    canvas_id: &str,
) -> Result<bool, String> {
    match conn.query_row(
        "SELECT canvas_id FROM canvas_nodes WHERE id = ?1 LIMIT 1",
        params![id],
        |row| row.get::<_, Option<String>>(0),
    ) {
        Ok(existing_canvas_id) => Ok(existing_canvas_id
            .as_deref()
            .map(|value| value != canvas_id)
            .unwrap_or(false)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(false),
        Err(err) => Err(err.to_string()),
    }
}

fn resolve_canvas_asset_id(
    conn: &Connection,
    raw_asset_id: Option<&str>,
    item: Option<&Value>,
) -> Result<Option<String>, String> {
    if let Some(id) = raw_asset_id
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if asset_exists(conn, id)? {
            return Ok(Some(id.to_string()));
        }
    }
    let Some(item) = item else {
        return Ok(raw_asset_id.map(ToOwned::to_owned));
    };
    for (column, value) in [
        (
            "file_path",
            value_string(item, "path").or_else(|| value_string(item, "url")),
        ),
        ("hash", value_string(item, "hash")),
        (
            "quick_hash",
            value_string(item, "quickHash").or_else(|| value_string(item, "fingerprint")),
        ),
    ] {
        if let Some(value) = value.filter(|value| !value.trim().is_empty()) {
            if let Some(id) = query_asset_id_by_column(conn, column, &value)? {
                return Ok(Some(id));
            }
        }
    }
    let file_name = value_string(item, "name").or_else(|| value_string(item, "content"));
    if let Some(file_name) = file_name.filter(|value| !value.trim().is_empty()) {
        let file_size = value_i64(item, "fileSize").unwrap_or(0);
        if let Some(id) = query_asset_id_by_name_size(conn, &file_name, file_size)? {
            return Ok(Some(id));
        }
    }
    Ok(None)
}

fn asset_exists(conn: &Connection, id: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM assets WHERE id = ?1)",
        params![id],
        |row| row.get::<_, i64>(0),
    )
    .map(|value| value != 0)
    .map_err(|err| err.to_string())
}

fn query_asset_id_by_column(
    conn: &Connection,
    column: &str,
    value: &str,
) -> Result<Option<String>, String> {
    let sql = format!(
        "SELECT id FROM assets WHERE {} = ?1 ORDER BY updated_at DESC LIMIT 1",
        column
    );
    match conn.query_row(&sql, params![value], |row| row.get::<_, String>(0)) {
        Ok(id) => Ok(Some(id)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

fn query_asset_id_by_name_size(
    conn: &Connection,
    file_name: &str,
    file_size: i64,
) -> Result<Option<String>, String> {
    match conn.query_row(
        "SELECT id FROM assets WHERE file_name = ?1 AND file_size = ?2 ORDER BY updated_at DESC LIMIT 1",
        params![file_name, file_size],
        |row| row.get::<_, String>(0),
    ) {
        Ok(id) => Ok(Some(id)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

fn value_string(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn value_i64(value: &Value, key: &str) -> Option<i64> {
    value.get(key).and_then(|value| {
        value
            .as_i64()
            .or_else(|| value.as_u64().map(|item| item as i64))
    })
}

fn value_f64(value: &Value, key: &str) -> Option<f64> {
    value.get(key).and_then(Value::as_f64)
}

fn file_name_from_path(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("asset")
        .to_string()
}
