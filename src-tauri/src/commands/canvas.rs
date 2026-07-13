use serde_json::Value;

use crate::repositories::asset_repository::ViewportOptions;
use crate::repositories::canvas_repository::CanvasScope;

#[tauri::command]
pub fn list_canvases(
    app_handle: tauri::AppHandle,
    project_id: Option<String>,
    library_id: Option<String>,
) -> Result<Vec<Value>, String> {
    crate::services::canvas_service::list_canvases(
        app_handle,
        CanvasScope {
            project_id,
            library_id,
        },
    )
}

#[tauri::command]
pub fn list_deleted_canvases(
    app_handle: tauri::AppHandle,
    project_id: Option<String>,
    library_id: Option<String>,
) -> Result<Vec<Value>, String> {
    crate::services::canvas_service::list_deleted_canvases(
        app_handle,
        CanvasScope {
            project_id,
            library_id,
        },
    )
}

#[tauri::command]
pub fn get_canvas(
    app_handle: tauri::AppHandle,
    canvas_id: String,
) -> Result<Option<Value>, String> {
    crate::services::canvas_service::get_canvas(app_handle, canvas_id)
}

#[tauri::command]
pub fn create_canvas(
    app_handle: tauri::AppHandle,
    project_id: Option<String>,
    library_id: Option<String>,
    name: String,
) -> Result<Value, String> {
    crate::services::canvas_service::create_canvas(
        app_handle,
        CanvasScope {
            project_id,
            library_id,
        },
        name,
    )
}

#[tauri::command]
pub fn duplicate_canvas(
    app_handle: tauri::AppHandle,
    canvas_id: String,
    new_name: String,
) -> Result<Value, String> {
    crate::services::canvas_service::duplicate_canvas(app_handle, canvas_id, new_name)
}

#[tauri::command]
pub fn save_canvas_snapshot(
    app_handle: tauri::AppHandle,
    canvas_id: String,
    snapshot_name: String,
) -> Result<Value, String> {
    crate::services::canvas_service::save_canvas_snapshot(app_handle, canvas_id, snapshot_name)
}

#[tauri::command]
pub fn rename_canvas(
    app_handle: tauri::AppHandle,
    canvas_id: String,
    name: String,
) -> Result<Option<Value>, String> {
    crate::services::canvas_service::rename_canvas(app_handle, canvas_id, name)
}

#[tauri::command]
pub fn soft_delete_canvas(
    app_handle: tauri::AppHandle,
    canvas_id: String,
) -> Result<Value, String> {
    crate::services::canvas_service::soft_delete_canvas(app_handle, canvas_id)
}

#[tauri::command]
pub fn restore_canvas(
    app_handle: tauri::AppHandle,
    canvas_id: String,
) -> Result<Option<Value>, String> {
    crate::services::canvas_service::restore_canvas(app_handle, canvas_id)
}

#[tauri::command]
pub fn permanently_delete_canvas(
    app_handle: tauri::AppHandle,
    canvas_id: String,
) -> Result<Value, String> {
    crate::services::canvas_service::permanently_delete_canvas(app_handle, canvas_id)
}

#[tauri::command]
pub fn get_canvas_trash_count(
    app_handle: tauri::AppHandle,
    project_id: Option<String>,
    library_id: Option<String>,
) -> Result<i64, String> {
    crate::services::canvas_service::get_canvas_trash_count(
        app_handle,
        CanvasScope {
            project_id,
            library_id,
        },
    )
}

#[tauri::command]
pub fn set_active_canvas(
    app_handle: tauri::AppHandle,
    project_id: Option<String>,
    library_id: Option<String>,
    canvas_id: String,
) -> Result<Value, String> {
    crate::services::canvas_service::set_active_canvas(
        app_handle,
        CanvasScope {
            project_id,
            library_id,
        },
        canvas_id,
    )
}

#[tauri::command]
pub fn get_active_canvas(
    app_handle: tauri::AppHandle,
    project_id: Option<String>,
    library_id: Option<String>,
) -> Result<Value, String> {
    crate::services::canvas_service::get_active_canvas(
        app_handle,
        CanvasScope {
            project_id,
            library_id,
        },
    )
}

#[tauri::command]
pub fn list_canvas_nodes(
    app_handle: tauri::AppHandle,
    canvas_id: String,
) -> Result<Vec<Value>, String> {
    crate::services::canvas_service::list_canvas_nodes(app_handle, canvas_id)
}

#[tauri::command]
pub fn get_canvas_nodes_in_viewport(
    app_handle: tauri::AppHandle,
    options: ViewportOptions,
) -> Result<Vec<Value>, String> {
    crate::services::canvas_service::get_canvas_nodes_in_viewport(app_handle, options)
}

#[tauri::command]
pub fn update_canvas_nodes(
    app_handle: tauri::AppHandle,
    canvas_id: String,
    nodes: Vec<Value>,
) -> Result<usize, String> {
    crate::services::canvas_service::update_canvas_nodes(app_handle, canvas_id, nodes)
}

#[tauri::command]
pub fn patch_canvas_nodes(
    app_handle: tauri::AppHandle,
    canvas_id: String,
    nodes: Vec<Value>,
) -> Result<usize, String> {
    crate::services::canvas_service::patch_canvas_nodes(app_handle, canvas_id, nodes)
}
