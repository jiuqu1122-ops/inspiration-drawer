use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::db::connection::{
    database_path, open_connection, set_json_mode_forced, sqlite_database_exists,
};
use crate::db::schema::{DEFAULT_CANVAS_ID, DEFAULT_LIBRARY_ID, DEFAULT_PROJECT_ID};
use crate::repositories::json_asset_repository::JsonAssetRepository;

const MIGRATION_ID_JSON_TO_SQLITE: &str = "json-to-sqlite-v1";
const MIGRATION_ID_JSON_RECONCILE: &str = "json-to-sqlite-v2-reconcile";
const MIGRATION_ID_CANVAS_ASSET_VISIBILITY: &str = "canvas-only-asset-visibility-v2";
const MIGRATION_BATCH_SIZE: usize = 100;

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
         FROM migrations
         WHERE id IN (?1, ?2)
         ORDER BY CASE WHEN id = ?2 THEN 0 ELSE 1 END
         LIMIT 1",
        params![MIGRATION_ID_JSON_TO_SQLITE, MIGRATION_ID_JSON_RECONCILE],
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

pub fn ensure_sqlite_asset_library(
    app_handle: tauri::AppHandle,
) -> Result<MigrationStatus, String> {
    if crate::db::connection::is_json_mode_forced(&app_handle) {
        return get_migration_status(app_handle);
    }

    let conn = open_connection(&app_handle)?;
    ensure_migration_progress_columns(&conn)?;
    let asset_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM assets WHERE library_id = ?1 AND deleted_at IS NULL",
            params![DEFAULT_LIBRARY_ID],
            |row| row.get(0),
        )
        .map_err(|err| err.to_string())?;
    let migration_completed: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM migrations WHERE id = ?1 AND status = 'success')",
            params![MIGRATION_ID_JSON_TO_SQLITE],
            |row| row.get::<_, i64>(0),
        )
        .map(|value| value != 0)
        .map_err(|err| err.to_string())?;
    let reconciliation_completed = migration_succeeded(&conn, MIGRATION_ID_JSON_RECONCILE)?;
    let visibility_repair_completed =
        migration_succeeded(&conn, MIGRATION_ID_CANVAS_ASSET_VISIBILITY)?;

    if !visibility_repair_completed {
        let json_repo = JsonAssetRepository::new(app_handle.clone());
        let legacy_cutoff = fs::metadata(json_repo.items_path())
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis().min(i64::MAX as u128) as i64);
        match json_repo.read_items() {
            Ok(legacy_items) => {
                repair_canvas_only_asset_visibility(&conn, &legacy_items, legacy_cutoff)?;
                let finished_at = crate::current_time_millis();
                upsert_named_migration_row(
                    &conn,
                    MIGRATION_ID_CANVAS_ASSET_VISIBILITY,
                    4,
                    "Separate canvas-only references from drawer assets",
                    "success",
                    legacy_items.len() as i64,
                    legacy_items.len() as i64,
                    legacy_items.len() as i64,
                    0,
                    None,
                    None,
                    finished_at,
                    Some(finished_at),
                )?;
            }
            Err(error) => {
                eprintln!(
                    "[DrawerMigration] canvas-only visibility repair will retry: {}",
                    error
                );
            }
        }
    }

    if asset_count > 0 {
        if !migration_completed {
            let now = crate::current_time_millis();
            upsert_migration_row(
                &conn,
                "success",
                asset_count,
                asset_count,
                asset_count,
                0,
                None,
                None,
                now,
                Some(now),
            )?;
        }
        drop(conn);
        if !reconciliation_completed {
            if let Err(error) = reconcile_json_into_existing_sqlite(app_handle.clone()) {
                eprintln!(
                    "[DrawerMigration] late JSON reconciliation will retry on next startup: {}",
                    error
                );
            }
        }
        set_json_mode_forced(&app_handle, false)?;
        return get_migration_status(app_handle);
    }

    if migration_completed {
        drop(conn);
        if !reconciliation_completed {
            reconcile_json_into_existing_sqlite(app_handle.clone())?;
        }
        return get_migration_status(app_handle);
    }
    drop(conn);

    let json_repo = JsonAssetRepository::new(app_handle.clone());
    if !json_repo.read_items()?.is_empty() {
        return migrate_json_to_sqlite(app_handle);
    }

    let conn = open_connection(&app_handle)?;
    ensure_migration_progress_columns(&conn)?;
    let now = crate::current_time_millis();
    upsert_migration_row(&conn, "success", 0, 0, 0, 0, None, None, now, Some(now))?;
    upsert_reconciliation_row(&conn, "success", 0, 0, 0, 0, None, now, Some(now))?;
    drop(conn);
    set_json_mode_forced(&app_handle, false)?;
    get_migration_status(app_handle)
}

fn repair_canvas_only_asset_visibility(
    conn: &Connection,
    legacy_drawer_items: &[Value],
    legacy_cutoff: Option<i64>,
) -> Result<usize, String> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|err| err.to_string())?;
    tx.execute_batch(
        "CREATE TEMP TABLE IF NOT EXISTS legacy_drawer_asset_ids (id TEXT PRIMARY KEY); DELETE FROM legacy_drawer_asset_ids;",
    )
    .map_err(|err| err.to_string())?;
    {
        let mut insert = tx
            .prepare("INSERT OR IGNORE INTO legacy_drawer_asset_ids (id) VALUES (?1)")
            .map_err(|err| err.to_string())?;
        for id in legacy_drawer_items
            .iter()
            .filter_map(|item| value_string(item, "id"))
        {
            insert.execute(params![id]).map_err(|err| err.to_string())?;
        }
    }

    let mut hidden = tx
        .execute(
            r#"
            UPDATE assets
            SET drawer_visible = 0
            WHERE (
                  file_type IN ('text', 'file')
                  OR (
                      file_type IN ('image', 'video')
                      AND (folder_id IS NULL OR TRIM(folder_id) = '')
                  )
              )
              AND EXISTS (
                  SELECT 1
                  FROM canvas_nodes
                  WHERE canvas_nodes.asset_id = assets.id
                    AND json_extract(canvas_nodes.metadata_json, '$.item.id') = assets.id
                    AND COALESCE(json_extract(canvas_nodes.metadata_json, '$.item.sourceItemId'), '') = ''
              )
              AND NOT EXISTS (
                  SELECT 1 FROM legacy_drawer_asset_ids WHERE legacy_drawer_asset_ids.id = assets.id
              )
            "#,
            [],
        )
        .map_err(|err| err.to_string())?;

    // Before asset IDs became UUIDs, private canvas items used seven-character
    // lowercase IDs. Full-canvas saves left some of those rows behind after the
    // corresponding node was removed. A legacy drawer snapshot and its mtime let
    // us distinguish those stale rows without hiding real drawer notes/files.
    if !legacy_drawer_items.is_empty() {
        if let Some(cutoff) = legacy_cutoff {
            hidden += tx
                .execute(
                    r#"
                    UPDATE assets
                    SET drawer_visible = 0
                    WHERE file_type IN ('text', 'file')
                      AND (folder_id IS NULL OR TRIM(folder_id) = '')
                      AND LENGTH(id) = 7
                      AND id NOT GLOB '*[^0-9a-z]*'
                      AND COALESCE(created_at, 0) <= ?1
                      AND NOT EXISTS (
                          SELECT 1 FROM legacy_drawer_asset_ids WHERE legacy_drawer_asset_ids.id = assets.id
                      )
                    "#,
                    params![cutoff],
                )
                .map_err(|err| err.to_string())?;
        }
    }

    tx.execute(
        "UPDATE assets SET drawer_visible = 1 WHERE id IN (SELECT id FROM legacy_drawer_asset_ids)",
        [],
    )
    .map_err(|err| err.to_string())?;
    tx.execute_batch("DROP TABLE legacy_drawer_asset_ids;")
        .map_err(|err| err.to_string())?;
    tx.commit().map_err(|err| err.to_string())?;
    Ok(hidden)
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
            if failed > 0 {
                set_json_mode_forced(&app_handle, true)?;
                return finish_migration_error(
                    &conn,
                    total,
                    processed,
                    success,
                    failed,
                    started_at,
                    format!(
                        "migration preserved JSON mode because {failed} assets failed to import"
                    ),
                );
            }
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
                set_json_mode_forced(&app_handle, true)?;
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
            upsert_reconciliation_row(
                &conn,
                "success",
                total,
                processed,
                success,
                failed,
                None,
                started_at,
                Some(finished_at),
            )?;
            set_json_mode_forced(&app_handle, false)?;
            get_migration_status(app_handle)
        }
        Err(err) => {
            set_json_mode_forced(&app_handle, true)?;
            finish_migration_error(&conn, total, 0, 0, total, started_at, err)
        }
    }
}

fn migration_succeeded(conn: &Connection, migration_id: &str) -> Result<bool, String> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM migrations WHERE id = ?1 AND status = 'success')",
        params![migration_id],
        |row| row.get::<_, i64>(0),
    )
    .map(|value| value != 0)
    .map_err(|err| err.to_string())
}

/// Older builds could keep writing drawer_items.json after the first SQLite migration.
/// Reconcile only IDs that SQLite has never seen so current edits and soft-deletes remain
/// authoritative while late legacy records (including folder assignments) are recovered.
fn reconcile_json_into_existing_sqlite(app_handle: tauri::AppHandle) -> Result<(), String> {
    let repo = JsonAssetRepository::new(app_handle.clone());
    let items = repo.read_items()?;
    let folders = repo.read_folders()?;
    let started_at = crate::current_time_millis();
    let conn = open_connection(&app_handle)?;
    ensure_migration_progress_columns(&conn)?;

    if items.is_empty() && folders.is_empty() {
        return upsert_reconciliation_row(
            &conn,
            "success",
            0,
            0,
            0,
            0,
            None,
            started_at,
            Some(started_at),
        );
    }

    backup_json_files(&app_handle, &repo)?;
    upsert_reconciliation_row(
        &conn,
        "running",
        items.len() as i64,
        0,
        0,
        0,
        None,
        started_at,
        None,
    )?;

    match reconcile_payloads(&conn, &items, &folders, started_at) {
        Ok((processed, inserted)) => {
            let finished_at = crate::current_time_millis();
            upsert_reconciliation_row(
                &conn,
                "success",
                items.len() as i64,
                processed,
                inserted,
                0,
                None,
                started_at,
                Some(finished_at),
            )
        }
        Err(error) => {
            let finished_at = crate::current_time_millis();
            upsert_reconciliation_row(
                &conn,
                "failed",
                items.len() as i64,
                0,
                0,
                items.len() as i64,
                Some(error.clone()),
                started_at,
                Some(finished_at),
            )?;
            Err(error)
        }
    }
}

fn reconcile_payloads(
    conn: &Connection,
    items: &[Value],
    folders: &[Value],
    started_at: i64,
) -> Result<(i64, i64), String> {
    let (existing_asset_ids, existing_assets_by_identity) = {
        let mut statement = conn
            .prepare(
                "SELECT id, file_path, hash, quick_hash, source_url, folder_id, deleted_at FROM assets",
            )
            .map_err(|err| err.to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<i64>>(6)?,
                ))
            })
            .map_err(|err| err.to_string())?;
        let mut ids = HashSet::new();
        let mut identities = HashMap::new();
        for row in rows {
            let (id, file_path, hash, quick_hash, source_url, folder_id, deleted_at) =
                row.map_err(|err| err.to_string())?;
            ids.insert(id.clone());
            for key in database_asset_identity_keys(
                file_path.as_deref(),
                hash.as_deref(),
                quick_hash.as_deref(),
                source_url.as_deref(),
            ) {
                identities
                    .entry(key)
                    .or_insert_with(|| (id.clone(), folder_id.clone(), deleted_at.is_some()));
            }
        }
        (ids, identities)
    };
    let existing_folder_ids = {
        let mut statement = conn
            .prepare("SELECT id FROM folders")
            .map_err(|err| err.to_string())?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<HashSet<_>, _>>()
            .map_err(|err| err.to_string())?
    };

    let missing_folders = folders
        .iter()
        .filter(|folder| {
            value_string(folder, "id")
                .map(|id| !existing_folder_ids.contains(&id))
                .unwrap_or(false)
        })
        .collect::<Vec<_>>();
    for (chunk_index, chunk) in missing_folders.chunks(MIGRATION_BATCH_SIZE).enumerate() {
        let tx = conn
            .unchecked_transaction()
            .map_err(|err| err.to_string())?;
        for (offset, folder) in chunk.iter().enumerate() {
            insert_folder(
                &tx,
                folder,
                (chunk_index * MIGRATION_BATCH_SIZE + offset) as i64,
                started_at,
            )?;
        }
        tx.commit().map_err(|err| err.to_string())?;
    }

    let mut missing_items = Vec::new();
    let mut folder_repairs = HashMap::<String, String>::new();
    for item in items {
        if value_string(item, "id")
            .map(|id| existing_asset_ids.contains(&id))
            .unwrap_or(false)
        {
            continue;
        }
        let identity_match = json_asset_identity_keys(item)
            .into_iter()
            .find_map(|key| existing_assets_by_identity.get(&key));
        if let Some((matched_id, current_folder_id, is_deleted)) = identity_match {
            if !is_deleted && current_folder_id.as_deref().unwrap_or_default().is_empty() {
                if let Some(folder_id) = value_string(item, "folderId") {
                    folder_repairs
                        .entry(matched_id.clone())
                        .or_insert(folder_id);
                }
            }
            continue;
        }
        missing_items.push(item);
    }

    for chunk in folder_repairs
        .into_iter()
        .collect::<Vec<_>>()
        .chunks(MIGRATION_BATCH_SIZE)
    {
        let tx = conn
            .unchecked_transaction()
            .map_err(|err| err.to_string())?;
        for (asset_id, folder_id) in chunk {
            tx.execute(
                "UPDATE assets SET folder_id = ?2, updated_at = ?3, metadata_json = json_set(metadata_json, '$.folderId', ?2, '$.updatedAt', ?3) WHERE id = ?1 AND deleted_at IS NULL AND (folder_id IS NULL OR folder_id = '')",
                params![asset_id, folder_id, started_at],
            )
            .map_err(|err| err.to_string())?;
        }
        tx.commit().map_err(|err| err.to_string())?;
    }

    let mut inserted = 0_i64;
    for chunk in missing_items.chunks(MIGRATION_BATCH_SIZE) {
        let tx = conn
            .unchecked_transaction()
            .map_err(|err| err.to_string())?;
        for item in chunk {
            insert_asset(&tx, item, started_at)?;
            inserted += 1;
        }
        tx.commit().map_err(|err| err.to_string())?;
    }

    conn.execute(
        r#"
        UPDATE assets
        SET folder_id = NULL,
            updated_at = ?1,
            metadata_json = json_remove(json_set(metadata_json, '$.updatedAt', ?1), '$.folderId')
        WHERE deleted_at IS NULL
          AND folder_id IS NOT NULL
          AND folder_id <> ''
          AND NOT EXISTS (
              SELECT 1 FROM folders
              WHERE folders.id = assets.folder_id
                AND folders.deleted_at IS NULL
          )
        "#,
        params![started_at],
    )
    .map_err(|err| err.to_string())?;

    Ok((items.len() as i64, inserted))
}

fn normalized_identity_key(kind: &str, value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| format!("{}:{}", kind, value.to_lowercase()))
}

fn database_asset_identity_keys(
    file_path: Option<&str>,
    hash: Option<&str>,
    quick_hash: Option<&str>,
    source_url: Option<&str>,
) -> Vec<String> {
    [
        normalized_identity_key("path", file_path),
        normalized_identity_key("hash", hash),
        normalized_identity_key("quick", quick_hash),
        normalized_identity_key("source", source_url),
    ]
    .into_iter()
    .flatten()
    .collect()
}

fn json_asset_identity_keys(item: &Value) -> Vec<String> {
    let file_path = value_string(item, "path").or_else(|| value_string(item, "url"));
    let hash = value_string(item, "hash");
    let quick_hash = value_string(item, "quickHash").or_else(|| value_string(item, "fingerprint"));
    let source_url = value_string(item, "sourceUrl").or_else(|| value_string(item, "originalUrl"));
    database_asset_identity_keys(
        file_path.as_deref(),
        hash.as_deref(),
        quick_hash.as_deref(),
        source_url.as_deref(),
    )
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
    upsert_named_migration_row(
        conn,
        MIGRATION_ID_JSON_TO_SQLITE,
        1,
        "JSON to SQLite migration",
        status,
        total,
        processed,
        success,
        failed,
        current_file,
        error,
        started_at,
        finished_at,
    )
}

fn upsert_reconciliation_row(
    conn: &Connection,
    status: &str,
    total: i64,
    processed: i64,
    success: i64,
    failed: i64,
    error: Option<String>,
    started_at: i64,
    finished_at: Option<i64>,
) -> Result<(), String> {
    upsert_named_migration_row(
        conn,
        MIGRATION_ID_JSON_RECONCILE,
        2,
        "Late JSON asset reconciliation",
        status,
        total,
        processed,
        success,
        failed,
        None,
        error,
        started_at,
        finished_at,
    )
}

#[allow(clippy::too_many_arguments)]
fn upsert_named_migration_row(
    conn: &Connection,
    migration_id: &str,
    version: i64,
    name: &str,
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
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
        ON CONFLICT(id) DO UPDATE SET
            version = excluded.version,
            name = excluded.name,
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
            migration_id,
            version,
            name,
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
        INSERT INTO assets
        (id, library_id, folder_id, file_path, file_name, file_ext, file_type, file_size, width, height, duration, hash, quick_hash, source_url, note, rating, created_at, updated_at, imported_at, modified_at, deleted_at, metadata_json)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, NULL, ?20)
        ON CONFLICT(id) DO UPDATE SET
            library_id = excluded.library_id,
            folder_id = excluded.folder_id,
            file_path = excluded.file_path,
            file_name = excluded.file_name,
            file_ext = excluded.file_ext,
            file_type = excluded.file_type,
            file_size = excluded.file_size,
            width = excluded.width,
            height = excluded.height,
            duration = excluded.duration,
            hash = excluded.hash,
            quick_hash = excluded.quick_hash,
            source_url = excluded.source_url,
            note = excluded.note,
            rating = excluded.rating,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            imported_at = excluded.imported_at,
            modified_at = excluded.modified_at,
            deleted_at = NULL,
            metadata_json = excluded.metadata_json
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

    conn.execute("DELETE FROM asset_tags WHERE asset_id = ?1", params![id])
        .map_err(|err| err.to_string())?;

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
    let source_asset_id = item.and_then(|item| value_string(item, "sourceItemId"));
    let asset_id = resolve_canvas_asset_id(
        conn,
        source_asset_id.as_deref(),
        raw_asset_id.as_deref(),
        item,
    )?;
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
    source_asset_id: Option<&str>,
    raw_asset_id: Option<&str>,
    item: Option<&Value>,
) -> Result<Option<String>, String> {
    for candidate in [source_asset_id, raw_asset_id] {
        if let Some(id) = candidate.map(str::trim).filter(|value| !value.is_empty()) {
            if asset_exists(conn, id)? {
                return Ok(Some(id.to_string()));
            }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reconciliation_restores_only_missing_legacy_assets_with_folder_links() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        crate::db::schema::ensure_schema(&conn).expect("create schema");
        let now = 1_700_000_000_000_i64;
        conn.execute(
            "INSERT OR IGNORE INTO libraries (id, name, path, created_at, updated_at) VALUES (?1, 'Default', '', ?2, ?2)",
            params![DEFAULT_LIBRARY_ID, now],
        )
        .expect("create library");

        insert_asset(
            &conn,
            &json!({ "id": "existing", "type": "image", "name": "Current", "createdAt": now }),
            now,
        )
        .expect("seed current asset");
        insert_asset(
            &conn,
            &json!({ "id": "same-file-current", "type": "image", "name": "Same file", "path": "C:\\assets\\same.png", "createdAt": now }),
            now,
        )
        .expect("seed identity-matched asset");

        let folders = vec![json!({ "id": "legacy-folder", "name": "Legacy" })];
        let items = vec![
            json!({ "id": "existing", "type": "image", "name": "Old copy", "folderId": "legacy-folder", "createdAt": now - 1 }),
            json!({ "id": "same-file-old", "type": "image", "name": "Same file legacy ID", "path": "C:\\assets\\same.png", "folderId": "legacy-folder", "createdAt": now - 1 }),
            json!({ "id": "missing", "type": "image", "name": "Recovered", "folderId": "legacy-folder", "createdAt": now - 1 }),
            json!({ "id": "orphan", "type": "image", "name": "Visible in main", "folderId": "deleted-folder", "createdAt": now - 1 }),
        ];

        let (processed, inserted) =
            reconcile_payloads(&conn, &items, &folders, now).expect("reconcile payloads");
        assert_eq!((processed, inserted), (4, 2));

        let existing_folder: Option<String> = conn
            .query_row(
                "SELECT folder_id FROM assets WHERE id = 'existing'",
                [],
                |row| row.get(0),
            )
            .expect("read current asset");
        assert_eq!(existing_folder, None, "current SQLite edits must win");

        let recovered_folder: Option<String> = conn
            .query_row(
                "SELECT folder_id FROM assets WHERE id = 'missing'",
                [],
                |row| row.get(0),
            )
            .expect("read recovered asset");
        assert_eq!(recovered_folder.as_deref(), Some("legacy-folder"));

        let identity_matched_folder: Option<String> = conn
            .query_row(
                "SELECT folder_id FROM assets WHERE id = 'same-file-current'",
                [],
                |row| row.get(0),
            )
            .expect("read identity-matched asset");
        assert_eq!(identity_matched_folder.as_deref(), Some("legacy-folder"));

        let asset_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM assets", [], |row| row.get(0))
            .expect("count assets");
        assert_eq!(
            asset_count, 4,
            "identity matches must not create duplicates"
        );

        let orphan_folder: Option<String> = conn
            .query_row(
                "SELECT folder_id FROM assets WHERE id = 'orphan'",
                [],
                |row| row.get(0),
            )
            .expect("read orphaned asset");
        assert_eq!(
            orphan_folder, None,
            "deleted folders must not hide recovered assets"
        );
    }

    #[test]
    fn canvas_visibility_repair_hides_private_nodes_but_preserves_legacy_drawer_items() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        crate::db::schema::ensure_schema(&conn).expect("create schema");
        let now = 1_700_000_000_000_i64;
        for item in [
            json!({ "id": "prompt1", "type": "text", "name": "Canvas prompt", "createdAt": now }),
            json!({ "id": "bridge1", "type": "file", "name": "Canvas bridge", "createdAt": now }),
            json!({ "id": "note001", "type": "text", "name": "Real drawer note", "createdAt": now }),
            json!({ "id": "refimg1", "type": "image", "name": "Canvas reference", "createdAt": now }),
            json!({ "id": "refvid1", "type": "video", "name": "Canvas reference video", "createdAt": now }),
            json!({ "id": "legacyimg", "type": "image", "name": "Legacy drawer image", "createdAt": now }),
            json!({ "id": "savedimg", "type": "image", "name": "Saved canvas image", "folderId": "saved-canvas", "createdAt": now }),
            json!({ "id": "sourcedimg", "type": "image", "name": "Drawer source image", "createdAt": now }),
        ] {
            insert_asset(&conn, &item, now).expect("seed asset");
        }
        for node in [
            json!({
                "id": "canvas_text_prompt1",
                "item": { "id": "prompt1", "type": "text", "name": "Canvas prompt", "createdAt": now },
                "x": 0, "y": 0, "width": 100, "height": 100
            }),
            json!({
                "id": "canvas_image_refimg1",
                "item": { "id": "refimg1", "type": "image", "name": "Canvas reference", "createdAt": now },
                "x": 0, "y": 0, "width": 100, "height": 100
            }),
            json!({
                "id": "canvas_video_refvid1",
                "item": { "id": "refvid1", "type": "video", "name": "Canvas reference video", "createdAt": now },
                "x": 0, "y": 0, "width": 100, "height": 100
            }),
            json!({
                "id": "canvas_image_legacyimg",
                "item": { "id": "legacyimg", "type": "image", "name": "Legacy drawer image", "createdAt": now },
                "x": 0, "y": 0, "width": 100, "height": 100
            }),
            json!({
                "id": "canvas_image_savedimg",
                "item": { "id": "savedimg", "type": "image", "name": "Saved canvas image", "folderId": "saved-canvas", "createdAt": now },
                "x": 0, "y": 0, "width": 100, "height": 100
            }),
            json!({
                "id": "canvas_image_source_copy",
                "item": { "id": "source-copy", "sourceItemId": "sourcedimg", "type": "image", "name": "Drawer source image", "createdAt": now },
                "x": 0, "y": 0, "width": 100, "height": 100
            }),
        ] {
            insert_canvas_node(&conn, DEFAULT_CANVAS_ID, &node, now).expect("seed canvas node");
        }

        let legacy_items = vec![
            json!({ "id": "note001", "type": "text", "name": "Real drawer note", "createdAt": now }),
            json!({ "id": "legacyimg", "type": "image", "name": "Legacy drawer image", "createdAt": now }),
        ];
        repair_canvas_only_asset_visibility(&conn, &legacy_items, Some(now + 1))
            .expect("repair visibility");

        let rows = conn
            .prepare("SELECT id, drawer_visible FROM assets ORDER BY id")
            .and_then(|mut statement| {
                statement
                    .query_map([], |row| {
                        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
                    })?
                    .collect::<Result<Vec<_>, _>>()
            })
            .expect("read visibility");
        assert_eq!(
            rows,
            vec![
                ("bridge1".to_string(), 0),
                ("legacyimg".to_string(), 1),
                ("note001".to_string(), 1),
                ("prompt1".to_string(), 0),
                ("refimg1".to_string(), 0),
                ("refvid1".to_string(), 0),
                ("savedimg".to_string(), 1),
                ("sourcedimg".to_string(), 1),
            ]
        );
    }

    #[test]
    fn asset_metadata_upsert_preserves_hidden_canvas_visibility() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        crate::db::schema::ensure_schema(&conn).expect("create schema");
        let now = 1_700_000_000_000_i64;
        insert_asset(
            &conn,
            &json!({ "id": "canvas-reference", "type": "image", "name": "Before", "createdAt": now }),
            now,
        )
        .expect("seed asset");
        conn.execute(
            "UPDATE assets SET drawer_visible = 0 WHERE id = 'canvas-reference'",
            [],
        )
        .expect("hide canvas reference");

        insert_asset(
            &conn,
            &json!({ "id": "canvas-reference", "type": "image", "name": "After", "createdAt": now }),
            now + 1,
        )
        .expect("update hidden asset metadata");

        let (drawer_visible, file_name): (i64, String) = conn
            .query_row(
                "SELECT drawer_visible, file_name FROM assets WHERE id = 'canvas-reference'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read updated asset");
        assert_eq!(drawer_visible, 0);
        assert_eq!(file_name, "After");
    }
}
