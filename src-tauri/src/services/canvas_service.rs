use serde_json::Value;

use crate::db::connection::open_connection;
use crate::repositories::asset_repository::ViewportOptions;
use crate::repositories::canvas_repository::{CanvasRepository, CanvasScope};
use crate::repositories::sqlite_canvas_repository::SqliteCanvasRepository;

fn repository(app_handle: &tauri::AppHandle) -> Result<Box<dyn CanvasRepository>, String> {
    Ok(Box::new(SqliteCanvasRepository::new(open_connection(app_handle)?)))
}

pub fn list_canvases(app_handle: tauri::AppHandle, scope: CanvasScope) -> Result<Vec<Value>, String> {
    repository(&app_handle)?.list_canvases(scope)
}

pub fn list_deleted_canvases(app_handle: tauri::AppHandle, scope: CanvasScope) -> Result<Vec<Value>, String> {
    repository(&app_handle)?.list_deleted_canvases(scope)
}

pub fn get_canvas(app_handle: tauri::AppHandle, canvas_id: String) -> Result<Option<Value>, String> {
    repository(&app_handle)?.get_canvas(&canvas_id)
}

pub fn create_canvas(app_handle: tauri::AppHandle, scope: CanvasScope, name: String) -> Result<Value, String> {
    repository(&app_handle)?.create_canvas(scope, name)
}

pub fn duplicate_canvas(app_handle: tauri::AppHandle, canvas_id: String, new_name: String) -> Result<Value, String> {
    repository(&app_handle)?.duplicate_canvas(&canvas_id, new_name)
}

pub fn save_canvas_snapshot(app_handle: tauri::AppHandle, canvas_id: String, snapshot_name: String) -> Result<Value, String> {
    repository(&app_handle)?.save_canvas_snapshot(&canvas_id, snapshot_name)
}

pub fn rename_canvas(app_handle: tauri::AppHandle, canvas_id: String, name: String) -> Result<Option<Value>, String> {
    repository(&app_handle)?.rename_canvas(&canvas_id, name)
}

pub fn soft_delete_canvas(app_handle: tauri::AppHandle, canvas_id: String) -> Result<Value, String> {
    repository(&app_handle)?.soft_delete_canvas(&canvas_id)
}

pub fn restore_canvas(app_handle: tauri::AppHandle, canvas_id: String) -> Result<Option<Value>, String> {
    repository(&app_handle)?.restore_canvas(&canvas_id)
}

pub fn permanently_delete_canvas(app_handle: tauri::AppHandle, canvas_id: String) -> Result<Value, String> {
    repository(&app_handle)?.permanently_delete_canvas(&canvas_id)
}

pub fn get_canvas_trash_count(app_handle: tauri::AppHandle, scope: CanvasScope) -> Result<i64, String> {
    repository(&app_handle)?.get_trash_count(scope)
}

pub fn set_active_canvas(app_handle: tauri::AppHandle, scope: CanvasScope, canvas_id: String) -> Result<Value, String> {
    repository(&app_handle)?.set_active_canvas(scope, &canvas_id)
}

pub fn get_active_canvas(app_handle: tauri::AppHandle, scope: CanvasScope) -> Result<Value, String> {
    repository(&app_handle)?.get_active_canvas(scope)
}

pub fn list_canvas_nodes(app_handle: tauri::AppHandle, canvas_id: String) -> Result<Vec<Value>, String> {
    repository(&app_handle)?.list_canvas_nodes(&canvas_id)
}

pub fn get_canvas_nodes_in_viewport(app_handle: tauri::AppHandle, options: ViewportOptions) -> Result<Vec<Value>, String> {
    repository(&app_handle)?.get_canvas_nodes_in_viewport(options)
}

pub fn update_canvas_nodes(app_handle: tauri::AppHandle, canvas_id: String, nodes: Vec<Value>) -> Result<usize, String> {
    repository(&app_handle)?.update_canvas_nodes(canvas_id, nodes)
}

pub fn patch_canvas_nodes(app_handle: tauri::AppHandle, canvas_id: String, nodes: Vec<Value>) -> Result<usize, String> {
    repository(&app_handle)?.patch_canvas_nodes(canvas_id, nodes)
}
