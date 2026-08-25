use rusqlite::Connection;

pub const DEFAULT_LIBRARY_ID: &str = "default";
pub const DEFAULT_PROJECT_ID: &str = "default";
pub const DEFAULT_CANVAS_ID: &str = "default";
pub const SCHEMA_VERSION: i64 = 7;
const INSPIRATION_REQUEST_RECOVERY_MIGRATION_ID: &str =
    "inspiration-analysis-request-schema-recovery-v1";

pub fn ensure_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS libraries (
            id TEXT PRIMARY KEY,
            name TEXT,
            path TEXT,
            created_at INTEGER,
            updated_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS assets (
            id TEXT PRIMARY KEY,
            library_id TEXT,
            folder_id TEXT,
            file_path TEXT,
            file_name TEXT,
            file_ext TEXT,
            file_type TEXT,
            file_size INTEGER,
            width INTEGER,
            height INTEGER,
            duration REAL,
            hash TEXT,
            quick_hash TEXT,
            source_url TEXT,
            note TEXT,
            rating INTEGER,
            created_at INTEGER,
            updated_at INTEGER,
            imported_at INTEGER,
            modified_at INTEGER,
            deleted_at INTEGER,
            drawer_visible INTEGER NOT NULL DEFAULT 1,
            metadata_json TEXT
        );

        CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            library_id TEXT,
            parent_id TEXT,
            name TEXT,
            sort_order INTEGER,
            created_at INTEGER,
            updated_at INTEGER,
            deleted_at INTEGER,
            metadata_json TEXT
        );

        CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY,
            library_id TEXT,
            name TEXT,
            color TEXT,
            created_at INTEGER,
            updated_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS asset_tags (
            asset_id TEXT,
            tag_id TEXT,
            PRIMARY KEY(asset_id, tag_id)
        );

        CREATE TABLE IF NOT EXISTS thumbnails (
            id TEXT PRIMARY KEY,
            asset_id TEXT,
            size INTEGER,
            path TEXT,
            width INTEGER,
            height INTEGER,
            format TEXT,
            file_size INTEGER,
            created_at INTEGER,
            source_modified_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS canvases (
            id TEXT PRIMARY KEY,
            project_id TEXT,
            library_id TEXT,
            name TEXT,
            description TEXT,
            thumbnail_path TEXT,
            sort_order INTEGER,
            is_active INTEGER,
            is_snapshot INTEGER,
            source_canvas_id TEXT,
            created_at INTEGER,
            updated_at INTEGER,
            last_opened_at INTEGER,
            deleted_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS canvas_nodes (
            id TEXT PRIMARY KEY,
            canvas_id TEXT,
            asset_id TEXT,
            x REAL,
            y REAL,
            width REAL,
            height REAL,
            rotation REAL,
            z_index INTEGER,
            created_at INTEGER,
            updated_at INTEGER,
            deleted_at INTEGER,
            metadata_json TEXT
        );

        CREATE TABLE IF NOT EXISTS import_logs (
            id TEXT PRIMARY KEY,
            library_id TEXT,
            status TEXT,
            total_count INTEGER,
            success_count INTEGER,
            skipped_count INTEGER,
            failed_count INTEGER,
            started_at INTEGER,
            finished_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS import_errors (
            id TEXT PRIMARY KEY,
            import_log_id TEXT,
            file_path TEXT,
            reason TEXT,
            created_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS migrations (
            id TEXT PRIMARY KEY,
            version INTEGER,
            name TEXT,
            status TEXT,
            started_at INTEGER,
            finished_at INTEGER,
            error TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_assets_library_id ON assets(library_id);
        CREATE INDEX IF NOT EXISTS idx_assets_folder_id ON assets(folder_id);
        CREATE INDEX IF NOT EXISTS idx_assets_file_type ON assets(file_type);
        CREATE INDEX IF NOT EXISTS idx_assets_hash ON assets(hash);
        CREATE INDEX IF NOT EXISTS idx_assets_quick_hash ON assets(quick_hash);
        CREATE INDEX IF NOT EXISTS idx_assets_created_at ON assets(created_at);
        CREATE INDEX IF NOT EXISTS idx_assets_updated_at ON assets(updated_at);
        CREATE INDEX IF NOT EXISTS idx_assets_imported_at ON assets(imported_at);
        CREATE INDEX IF NOT EXISTS idx_assets_file_name ON assets(file_name);
        CREATE INDEX IF NOT EXISTS idx_assets_file_size ON assets(file_size);
        CREATE INDEX IF NOT EXISTS idx_assets_deleted_at ON assets(deleted_at);
        CREATE INDEX IF NOT EXISTS idx_assets_library_deleted_created ON assets(library_id, deleted_at, created_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_assets_library_folder_deleted_created ON assets(library_id, folder_id, deleted_at, created_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_assets_library_type_deleted_created ON assets(library_id, file_type, deleted_at, created_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_assets_library_rating_deleted_created ON assets(library_id, rating, deleted_at, created_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_assets_library_type_analysis ON assets(
            library_id,
            file_type,
            deleted_at,
            COALESCE(json_array_length(json_extract(metadata_json, '$.inspirationProfile.aiTags')), 0),
            COALESCE(json_extract(metadata_json, '$.inspirationAnalysisFailure.attempts'), -1),
            updated_at,
            id
        );

        CREATE INDEX IF NOT EXISTS idx_asset_tags_asset_id ON asset_tags(asset_id);
        CREATE INDEX IF NOT EXISTS idx_asset_tags_tag_id ON asset_tags(tag_id);

        CREATE INDEX IF NOT EXISTS idx_thumbnails_asset_id ON thumbnails(asset_id);
        CREATE INDEX IF NOT EXISTS idx_thumbnails_size ON thumbnails(size);
        CREATE INDEX IF NOT EXISTS idx_thumbnails_source_modified_at ON thumbnails(source_modified_at);

        CREATE INDEX IF NOT EXISTS idx_folders_library_id ON folders(library_id);
        CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);

        CREATE INDEX IF NOT EXISTS idx_tags_library_id ON tags(library_id);
        CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
        "#,
    )
    .map_err(|err| err.to_string())?;

    let now = crate::current_time_millis();
    conn.execute(
        "INSERT OR IGNORE INTO libraries (id, name, path, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![DEFAULT_LIBRARY_ID, "Default Library", "", now, now],
    )
    .map_err(|err| err.to_string())?;

    ensure_canvas_schema_migrations(conn)?;
    ensure_folder_schema_migrations(conn)?;
    ensure_asset_schema_migrations(conn)?;
    conn.pragma_update(None, "user_version", SCHEMA_VERSION)
        .map_err(|err| err.to_string())?;
    Ok(())
}

fn ensure_asset_schema_migrations(conn: &Connection) -> Result<(), String> {
    add_column_if_missing(
        conn,
        "assets",
        "drawer_visible",
        "INTEGER NOT NULL DEFAULT 1",
    )?;
    conn.execute_batch(
        r#"
        CREATE INDEX IF NOT EXISTS idx_assets_library_drawer_deleted_created
            ON assets(library_id, drawer_visible, deleted_at, created_at DESC, id DESC);
        "#,
    )
    .map_err(|err| err.to_string())?;
    recover_incompatible_inspiration_requests(conn)?;
    Ok(())
}

fn recover_incompatible_inspiration_requests(conn: &Connection) -> Result<(), String> {
    let completed: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM migrations WHERE id = ?1 AND status = 'success'",
            rusqlite::params![INSPIRATION_REQUEST_RECOVERY_MIGRATION_ID],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if completed > 0 {
        return Ok(());
    }

    let repaired = conn
        .execute(
            r#"
            UPDATE assets
            SET metadata_json = json_remove(metadata_json, '$.inspirationAnalysisFailure')
            WHERE json_type(metadata_json, '$.inspirationAnalysisFailure') IS NOT NULL
              AND COALESCE(json_extract(metadata_json, '$.inspirationAnalysisFailure.message'), '') LIKE '%异步任务请求格式无效%'
              AND COALESCE(json_array_length(json_extract(metadata_json, '$.inspirationProfile.aiTags')), 0) = 0
              AND COALESCE(json_extract(metadata_json, '$.inspirationProfile.analysisVersion'), 0) < 2
            "#,
            [],
        )
        .map_err(|err| err.to_string())?;
    let now = crate::current_time_millis();
    conn.execute(
        "INSERT OR REPLACE INTO migrations (id, version, name, status, started_at, finished_at, error) VALUES (?1, ?2, ?3, 'success', ?4, ?4, ?5)",
        rusqlite::params![
            INSPIRATION_REQUEST_RECOVERY_MIGRATION_ID,
            SCHEMA_VERSION,
            "Recover inspiration requests rejected by the incompatible client payload",
            now,
            format!("Cleared incompatible request failures: {repaired}"),
        ],
    )
    .map_err(|err| err.to_string())?;
    Ok(())
}

fn ensure_folder_schema_migrations(conn: &Connection) -> Result<(), String> {
    add_column_if_missing(conn, "folders", "deleted_at", "INTEGER")?;
    conn.execute_batch(
        r#"
        CREATE INDEX IF NOT EXISTS idx_folders_library_id ON folders(library_id);
        CREATE INDEX IF NOT EXISTS idx_folders_parent_id ON folders(parent_id);
        CREATE INDEX IF NOT EXISTS idx_folders_deleted_at ON folders(deleted_at);
        "#,
    )
    .map_err(|err| err.to_string())?;
    Ok(())
}

fn ensure_canvas_schema_migrations(conn: &Connection) -> Result<(), String> {
    add_column_if_missing(conn, "canvas_nodes", "id", "TEXT")?;
    add_column_if_missing(conn, "canvas_nodes", "canvas_id", "TEXT")?;
    add_column_if_missing(conn, "canvas_nodes", "asset_id", "TEXT")?;
    add_column_if_missing(conn, "canvas_nodes", "x", "REAL")?;
    add_column_if_missing(conn, "canvas_nodes", "y", "REAL")?;
    add_column_if_missing(conn, "canvas_nodes", "width", "REAL")?;
    add_column_if_missing(conn, "canvas_nodes", "height", "REAL")?;
    add_column_if_missing(conn, "canvas_nodes", "rotation", "REAL")?;
    add_column_if_missing(conn, "canvas_nodes", "z_index", "INTEGER")?;
    add_column_if_missing(conn, "canvas_nodes", "created_at", "INTEGER")?;
    add_column_if_missing(conn, "canvas_nodes", "updated_at", "INTEGER")?;
    add_column_if_missing(conn, "canvas_nodes", "deleted_at", "INTEGER")?;
    add_column_if_missing(conn, "canvas_nodes", "metadata_json", "TEXT")?;
    migrate_legacy_canvas_nodes(conn)?;
    conn.execute(
        "UPDATE canvas_nodes SET id = 'canvas-node-' || rowid WHERE id IS NULL OR TRIM(id) = ''",
        [],
    )
    .map_err(|err| err.to_string())?;
    ensure_canvas_indexes(conn)?;
    Ok(())
}

fn ensure_canvas_indexes(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE INDEX IF NOT EXISTS idx_canvas_nodes_canvas_id ON canvas_nodes(canvas_id);
        CREATE INDEX IF NOT EXISTS idx_canvas_nodes_asset_id ON canvas_nodes(asset_id);
        CREATE INDEX IF NOT EXISTS idx_canvas_nodes_x ON canvas_nodes(x);
        CREATE INDEX IF NOT EXISTS idx_canvas_nodes_y ON canvas_nodes(y);
        CREATE INDEX IF NOT EXISTS idx_canvas_nodes_xy ON canvas_nodes(x, y);
        CREATE INDEX IF NOT EXISTS idx_canvas_nodes_canvas_xy ON canvas_nodes(canvas_id, x, y);
        CREATE INDEX IF NOT EXISTS idx_canvas_nodes_deleted_at ON canvas_nodes(deleted_at);

        CREATE INDEX IF NOT EXISTS idx_canvases_project_id ON canvases(project_id);
        CREATE INDEX IF NOT EXISTS idx_canvases_library_id ON canvases(library_id);
        CREATE INDEX IF NOT EXISTS idx_canvases_is_active ON canvases(is_active);
        CREATE INDEX IF NOT EXISTS idx_canvases_deleted_at ON canvases(deleted_at);
        CREATE INDEX IF NOT EXISTS idx_canvases_sort_order ON canvases(sort_order);
        CREATE INDEX IF NOT EXISTS idx_canvases_updated_at ON canvases(updated_at);
        CREATE INDEX IF NOT EXISTS idx_canvases_scope_deleted_sort ON canvases(project_id, library_id, deleted_at, sort_order, created_at);
        CREATE INDEX IF NOT EXISTS idx_canvases_scope_deleted_opened ON canvases(project_id, library_id, deleted_at, last_opened_at, updated_at);
        "#,
    )
    .map_err(|err| err.to_string())?;
    Ok(())
}

fn add_column_if_missing(
    conn: &Connection,
    table: &str,
    column: &str,
    ty: &str,
) -> Result<(), String> {
    let sql = format!(
        "SELECT COUNT(*) FROM pragma_table_info('{}') WHERE name = ?1",
        table.replace('\'', "''")
    );
    let exists: i64 = conn
        .query_row(&sql, rusqlite::params![column], |row| row.get(0))
        .map_err(|err| err.to_string())?;
    if exists == 0 {
        conn.execute(
            &format!("ALTER TABLE {} ADD COLUMN {} {}", table, column, ty),
            [],
        )
        .map_err(|err| err.to_string())?;
    }
    Ok(())
}

fn migrate_legacy_canvas_nodes(conn: &Connection) -> Result<(), String> {
    let now = crate::current_time_millis();
    backup_canvas_storage(conn, now)?;
    conn.execute(
        "UPDATE canvas_nodes SET canvas_id = ?1 WHERE canvas_id IS NULL OR TRIM(canvas_id) = ''",
        rusqlite::params![DEFAULT_CANVAS_ID],
    )
    .map_err(|err| err.to_string())?;
    ensure_canvas_row(
        conn,
        DEFAULT_CANVAS_ID,
        DEFAULT_PROJECT_ID,
        DEFAULT_LIBRARY_ID,
        "默认画布",
        0,
        1,
        0,
        None,
        now,
    )?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT DISTINCT canvas_id
            FROM canvas_nodes
            WHERE canvas_id IS NOT NULL
              AND TRIM(canvas_id) != ''
              AND canvas_id NOT IN (SELECT id FROM canvases)
            ORDER BY canvas_id ASC
            "#,
        )
        .map_err(|err| err.to_string())?;
    let ids = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;
    drop(stmt);
    for (index, canvas_id) in ids.iter().enumerate() {
        let name = if canvas_id == DEFAULT_CANVAS_ID {
            "默认画布".to_string()
        } else {
            format!("画布 {}", canvas_id)
        };
        ensure_canvas_row(
            conn,
            canvas_id,
            DEFAULT_PROJECT_ID,
            DEFAULT_LIBRARY_ID,
            &name,
            (index as i64) + 1,
            0,
            0,
            None,
            now,
        )?;
    }
    let active_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM canvases WHERE project_id = ?1 AND deleted_at IS NULL AND is_active = 1",
            rusqlite::params![DEFAULT_PROJECT_ID],
            |row| row.get(0),
        )
        .map_err(|err| err.to_string())?;
    if active_count == 0 {
        conn.execute(
            "UPDATE canvases SET is_active = CASE WHEN id = ?1 THEN 1 ELSE 0 END, updated_at = ?2 WHERE project_id = ?3 AND deleted_at IS NULL",
            rusqlite::params![DEFAULT_CANVAS_ID, now, DEFAULT_PROJECT_ID],
        )
        .map_err(|err| err.to_string())?;
    } else if active_count > 1 {
        let active_id: String = conn
            .query_row(
                "SELECT id FROM canvases WHERE project_id = ?1 AND deleted_at IS NULL AND is_active = 1 ORDER BY last_opened_at DESC, updated_at DESC LIMIT 1",
                rusqlite::params![DEFAULT_PROJECT_ID],
                |row| row.get(0),
            )
            .map_err(|err| err.to_string())?;
        conn.execute(
            "UPDATE canvases SET is_active = CASE WHEN id = ?1 THEN 1 ELSE 0 END, updated_at = ?2 WHERE project_id = ?3 AND deleted_at IS NULL",
            rusqlite::params![active_id, now, DEFAULT_PROJECT_ID],
        )
        .map_err(|err| err.to_string())?;
    }
    Ok(())
}

fn backup_canvas_storage(conn: &Connection, now: i64) -> Result<(), String> {
    let backup_id = "canvas-schema-v2-backup";
    let existing: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM migrations WHERE id = ?1 AND status = 'success'",
            rusqlite::params![backup_id],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if existing > 0 {
        return Ok(());
    }
    let node_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM canvas_nodes", [], |row| row.get(0))
        .unwrap_or(0);
    conn.execute(
        "INSERT OR REPLACE INTO migrations (id, version, name, status, started_at, finished_at, error) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            backup_id,
            SCHEMA_VERSION,
            "Canvas schema v2 safety marker",
            "success",
            now,
            now,
            format!("Schema migration is non-destructive; existing canvas_nodes rows observed: {}", node_count),
        ],
    )
    .map_err(|err| err.to_string())?;
    Ok(())
}

fn ensure_canvas_row(
    conn: &Connection,
    id: &str,
    project_id: &str,
    library_id: &str,
    name: &str,
    sort_order: i64,
    is_active: i64,
    is_snapshot: i64,
    source_canvas_id: Option<&str>,
    now: i64,
) -> Result<(), String> {
    conn.execute(
        r#"
        INSERT OR IGNORE INTO canvases
        (id, project_id, library_id, name, description, thumbnail_path, sort_order, is_active, is_snapshot, source_canvas_id, created_at, updated_at, last_opened_at, deleted_at)
        VALUES (?1, ?2, ?3, ?4, '', NULL, ?5, ?6, ?7, ?8, ?9, ?9, ?9, NULL)
        "#,
        rusqlite::params![
            id,
            project_id,
            library_id,
            name,
            sort_order,
            is_active,
            is_snapshot,
            source_canvas_id,
            now,
        ],
    )
    .map_err(|err| err.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use rusqlite::{params, Connection};
    use serde_json::{json, Value};

    use super::{ensure_schema, INSPIRATION_REQUEST_RECOVERY_MIGRATION_ID};

    #[test]
    fn incompatible_inspiration_request_failures_are_requeued_once() {
        let conn = Connection::open_in_memory().expect("open database");
        ensure_schema(&conn).expect("create schema");
        conn.execute(
            "DELETE FROM migrations WHERE id = ?1",
            params![INSPIRATION_REQUEST_RECOVERY_MIGRATION_ID],
        )
        .expect("reset recovery marker");

        for (id, metadata) in [
            (
                "invalid-unprocessed",
                json!({ "inspirationAnalysisFailure": { "attempts": 3, "message": "提交后台任务 HTTP 400 Bad Request：异步任务请求格式无效" } }),
            ),
            (
                "unrelated-failure",
                json!({ "inspirationAnalysisFailure": { "attempts": 3, "message": "image decode failed" } }),
            ),
            (
                "already-analyzed",
                json!({
                    "inspirationProfile": { "aiTags": [{ "name": "音箱", "category": "产品类别", "confidence": 0.9 }] },
                    "inspirationAnalysisFailure": { "attempts": 3, "message": "异步任务请求格式无效" },
                }),
            ),
        ] {
            conn.execute(
                "INSERT INTO assets (id, file_type, metadata_json) VALUES (?1, 'image', ?2)",
                params![id, metadata.to_string()],
            )
            .expect("seed asset");
        }

        ensure_schema(&conn).expect("run recovery");
        let metadata = |id: &str| -> Value {
            let raw: String = conn
                .query_row(
                    "SELECT metadata_json FROM assets WHERE id = ?1",
                    params![id],
                    |row| row.get(0),
                )
                .expect("read metadata");
            serde_json::from_str(&raw).expect("parse metadata")
        };

        assert!(metadata("invalid-unprocessed")
            .get("inspirationAnalysisFailure")
            .is_none());
        assert!(metadata("unrelated-failure")
            .get("inspirationAnalysisFailure")
            .is_some());
        assert!(metadata("already-analyzed")
            .get("inspirationAnalysisFailure")
            .is_some());
        let marker_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM migrations WHERE id = ?1 AND status = 'success'",
                params![INSPIRATION_REQUEST_RECOVERY_MIGRATION_ID],
                |row| row.get(0),
            )
            .expect("read migration marker");
        assert_eq!(marker_count, 1);
    }
}
