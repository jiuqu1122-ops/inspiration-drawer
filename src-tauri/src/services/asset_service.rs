use serde_json::Value;

use crate::db::connection::{open_connection, should_use_sqlite};
use crate::repositories::asset_repository::{
    AssetListOptions, AssetRepository, AssetUpdatePatch, DebugCanvasNodesOptions, MoveFoldersOptions, ViewportOptions,
};
use crate::repositories::json_asset_repository::JsonAssetRepository;
use crate::repositories::sqlite_asset_repository::SqliteAssetRepository;

fn repository(app_handle: &tauri::AppHandle) -> Result<Box<dyn AssetRepository>, String> {
    if should_use_sqlite(app_handle) {
        Ok(Box::new(SqliteAssetRepository::new(open_connection(app_handle)?)))
    } else {
        Ok(Box::new(JsonAssetRepository::new(app_handle.clone())))
    }
}

pub fn list_assets(app_handle: tauri::AppHandle, options: AssetListOptions) -> Result<Vec<Value>, String> {
    repository(&app_handle)?.list_assets(options)
}

pub fn get_asset_by_id(app_handle: tauri::AppHandle, id: String) -> Result<Option<Value>, String> {
    repository(&app_handle)?.get_asset_by_id(&id)
}

pub fn get_asset_count(app_handle: tauri::AppHandle, options: AssetListOptions) -> Result<i64, String> {
    repository(&app_handle)?.get_asset_count(options)
}

pub fn upsert_assets(app_handle: tauri::AppHandle, assets: Vec<Value>) -> Result<usize, String> {
    repository(&app_handle)?.upsert_assets(assets)
}

pub fn update_asset(app_handle: tauri::AppHandle, id: String, patch: AssetUpdatePatch) -> Result<Option<Value>, String> {
    repository(&app_handle)?.update_asset(&id, patch)
}

pub fn delete_asset(app_handle: tauri::AppHandle, id: String) -> Result<bool, String> {
    repository(&app_handle)?.delete_asset(&id)
}

pub fn get_assets_by_ids(app_handle: tauri::AppHandle, ids: Vec<String>) -> Result<Vec<Value>, String> {
    repository(&app_handle)?.get_assets_by_ids(ids)
}

pub fn get_assets_in_viewport(app_handle: tauri::AppHandle, options: ViewportOptions) -> Result<Vec<Value>, String> {
    repository(&app_handle)?.get_assets_in_viewport(options)
}

pub fn debug_get_all_canvas_nodes(app_handle: tauri::AppHandle, options: DebugCanvasNodesOptions) -> Result<Value, String> {
    repository(&app_handle)?.debug_get_all_canvas_nodes(options)
}

pub fn upsert_canvas_nodes(app_handle: tauri::AppHandle, canvas_id: String, nodes: Vec<Value>) -> Result<usize, String> {
    repository(&app_handle)?.upsert_canvas_nodes(canvas_id, nodes)
}

pub fn list_folders(app_handle: tauri::AppHandle, library_id: Option<String>) -> Result<Vec<Value>, String> {
    repository(&app_handle)?.list_folders(library_id)
}

pub fn replace_folders(app_handle: tauri::AppHandle, library_id: Option<String>, folders: Vec<Value>) -> Result<Vec<Value>, String> {
    repository(&app_handle)?.replace_folders(library_id, folders)
}

pub fn move_folders(app_handle: tauri::AppHandle, options: MoveFoldersOptions) -> Result<Vec<Value>, String> {
    repository(&app_handle)?.move_folders(options)
}

pub fn list_tags(app_handle: tauri::AppHandle, library_id: Option<String>) -> Result<Vec<Value>, String> {
    repository(&app_handle)?.list_tags(library_id)
}

pub fn get_asset_thumbnails(app_handle: tauri::AppHandle, asset_id: String) -> Result<Vec<Value>, String> {
    repository(&app_handle)?.get_asset_thumbnails(&asset_id)
}
