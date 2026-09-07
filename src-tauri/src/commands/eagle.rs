use serde_json::Value;

#[tauri::command]
pub async fn eagle_start_offline_library(path: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        serde_json::to_value(crate::services::eagle_service::start_offline_library(path)?)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn eagle_read_offline_page(
    session_id: String,
    limit: Option<usize>,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        serde_json::to_value(crate::services::eagle_service::read_offline_page(
            session_id, limit,
        )?)
        .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn eagle_finish_offline_library(session_id: String) -> Result<(), String> {
    crate::services::eagle_service::finish_offline_library(session_id)
}
