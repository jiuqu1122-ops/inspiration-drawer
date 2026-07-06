use rusqlite::Connection;

pub const DEFAULT_LIBRARY_ID: &str = "default";
pub const SCHEMA_VERSION: i64 = 1;

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

        CREATE INDEX IF NOT EXISTS idx_asset_tags_asset_id ON asset_tags(asset_id);
        CREATE INDEX IF NOT EXISTS idx_asset_tags_tag_id ON asset_tags(tag_id);

        CREATE INDEX IF NOT EXISTS idx_canvas_nodes_canvas_id ON canvas_nodes(canvas_id);
        CREATE INDEX IF NOT EXISTS idx_canvas_nodes_asset_id ON canvas_nodes(asset_id);
        CREATE INDEX IF NOT EXISTS idx_canvas_nodes_x ON canvas_nodes(x);
        CREATE INDEX IF NOT EXISTS idx_canvas_nodes_y ON canvas_nodes(y);
        CREATE INDEX IF NOT EXISTS idx_canvas_nodes_xy ON canvas_nodes(x, y);
        CREATE INDEX IF NOT EXISTS idx_canvas_nodes_canvas_xy ON canvas_nodes(canvas_id, x, y);

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
    conn.pragma_update(None, "user_version", SCHEMA_VERSION).map_err(|err| err.to_string())?;
    Ok(())
}
