use std::fs;
use std::path::PathBuf;

use rusqlite::Connection;

use crate::db::schema::ensure_schema;
use crate::get_user_data_dir;

pub fn database_path(app_handle: &tauri::AppHandle) -> PathBuf {
    get_user_data_dir(app_handle).join("library.db")
}

pub fn rollback_flag_path(app_handle: &tauri::AppHandle) -> PathBuf {
    get_user_data_dir(app_handle).join("library_storage_mode.txt")
}

pub fn is_json_mode_forced(app_handle: &tauri::AppHandle) -> bool {
    fs::read_to_string(rollback_flag_path(app_handle))
        .map(|value| value.trim().eq_ignore_ascii_case("json"))
        .unwrap_or(false)
}

pub fn set_json_mode_forced(app_handle: &tauri::AppHandle, forced: bool) -> Result<(), String> {
    let path = rollback_flag_path(app_handle);
    if forced {
        fs::write(path, b"json").map_err(|err| err.to_string())
    } else if path.exists() {
        fs::remove_file(path).map_err(|err| err.to_string())
    } else {
        Ok(())
    }
}

pub fn sqlite_database_exists(app_handle: &tauri::AppHandle) -> bool {
    database_path(app_handle).is_file()
}

pub fn should_use_sqlite(app_handle: &tauri::AppHandle) -> bool {
    sqlite_database_exists(app_handle) && !is_json_mode_forced(app_handle)
}

pub fn open_connection(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    let path = database_path(app_handle);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    backup_before_canvas_schema_migration(app_handle)?;
    let conn = Connection::open(path).map_err(|err| err.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON").map_err(|err| err.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL").map_err(|err| err.to_string())?;
    conn.pragma_update(None, "synchronous", "NORMAL").map_err(|err| err.to_string())?;
    ensure_schema(&conn)?;
    Ok(conn)
}

fn backup_before_canvas_schema_migration(app_handle: &tauri::AppHandle) -> Result<(), String> {
    let data_dir = get_user_data_dir(app_handle);
    let marker = data_dir.join("canvas_schema_v2_backup_done.txt");
    if marker.exists() {
        return Ok(());
    }

    let backup_dir = data_dir
        .join("canvas_schema_backups")
        .join(format!("before_v2_{}", crate::current_time_millis()));
    fs::create_dir_all(&backup_dir).map_err(|err| err.to_string())?;

    let db_path = database_path(app_handle);
    for source in [
        db_path.clone(),
        PathBuf::from(format!("{}-wal", db_path.to_string_lossy())),
        PathBuf::from(format!("{}-shm", db_path.to_string_lossy())),
        data_dir.join("drawer_canvas.json"),
        data_dir.join("drawer_items.json"),
        data_dir.join("drawer_folders.json"),
    ] {
        if !source.exists() {
            continue;
        }
        let Some(file_name) = source.file_name() else {
            continue;
        };
        fs::copy(&source, backup_dir.join(file_name)).map_err(|err| err.to_string())?;
    }

    fs::write(marker, backup_dir.to_string_lossy().as_bytes()).map_err(|err| err.to_string())?;
    Ok(())
}
