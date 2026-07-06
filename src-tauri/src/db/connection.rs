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
    let conn = Connection::open(path).map_err(|err| err.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON").map_err(|err| err.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL").map_err(|err| err.to_string())?;
    conn.pragma_update(None, "synchronous", "NORMAL").map_err(|err| err.to_string())?;
    ensure_schema(&conn)?;
    Ok(conn)
}
