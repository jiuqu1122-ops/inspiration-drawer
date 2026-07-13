use crate::services::migration_service::MigrationStatus;

#[tauri::command]
pub async fn migrate_json_to_sqlite(
    app_handle: tauri::AppHandle,
) -> Result<MigrationStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        crate::services::migration_service::migrate_json_to_sqlite(app_handle)
    })
    .await
    .map_err(|err| err.to_string())?
}

#[tauri::command]
pub fn get_migration_status(app_handle: tauri::AppHandle) -> Result<MigrationStatus, String> {
    crate::services::migration_service::get_migration_status(app_handle)
}

#[tauri::command]
pub fn rollback_to_json_mode(app_handle: tauri::AppHandle) -> Result<MigrationStatus, String> {
    crate::services::migration_service::rollback_to_json_mode(app_handle)
}
