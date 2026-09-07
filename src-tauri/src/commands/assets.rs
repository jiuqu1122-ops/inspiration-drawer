use serde_json::Value;

use crate::repositories::asset_repository::{
    AssetBatchUpdate, AssetListOptions, AssetUpdatePatch, DebugCanvasNodesOptions,
    EagleDuplicateLookupResult, EagleImportBatchRequest, EagleImportBatchResult,
    EagleImportFinishRequest, EagleImportStartRequest, EagleSourceIdentity, MoveFoldersOptions,
    ViewportOptions,
};

#[tauri::command]
pub fn list_assets(
    app_handle: tauri::AppHandle,
    options: AssetListOptions,
) -> Result<Vec<Value>, String> {
    crate::services::asset_service::list_assets(app_handle, options)
}

#[tauri::command]
pub fn get_asset_by_id(app_handle: tauri::AppHandle, id: String) -> Result<Option<Value>, String> {
    crate::services::asset_service::get_asset_by_id(app_handle, id)
}

#[tauri::command]
pub fn get_asset_count(
    app_handle: tauri::AppHandle,
    options: AssetListOptions,
) -> Result<i64, String> {
    crate::services::asset_service::get_asset_count(app_handle, options)
}

#[tauri::command]
pub fn upsert_assets(app_handle: tauri::AppHandle, assets: Vec<Value>) -> Result<usize, String> {
    crate::services::asset_service::upsert_assets(app_handle, assets)
}

#[tauri::command]
pub fn start_eagle_import(
    app_handle: tauri::AppHandle,
    request: EagleImportStartRequest,
) -> Result<(), String> {
    crate::services::asset_service::start_eagle_import(app_handle, request)
}

#[tauri::command]
pub fn find_eagle_duplicates(
    app_handle: tauri::AppHandle,
    identities: Vec<EagleSourceIdentity>,
) -> Result<EagleDuplicateLookupResult, String> {
    crate::services::asset_service::find_eagle_duplicates(app_handle, identities)
}

#[tauri::command]
pub fn import_eagle_assets_batch(
    app_handle: tauri::AppHandle,
    request: EagleImportBatchRequest,
) -> Result<EagleImportBatchResult, String> {
    crate::services::asset_service::import_eagle_assets_batch(app_handle, request)
}

#[tauri::command]
pub fn finish_eagle_import(
    app_handle: tauri::AppHandle,
    request: EagleImportFinishRequest,
) -> Result<(), String> {
    crate::services::asset_service::finish_eagle_import(app_handle, request)
}

#[tauri::command]
pub fn update_asset(
    app_handle: tauri::AppHandle,
    id: String,
    patch: AssetUpdatePatch,
) -> Result<Option<Value>, String> {
    crate::services::asset_service::update_asset(app_handle, id, patch)
}

#[tauri::command]
pub fn update_assets_batch(
    app_handle: tauri::AppHandle,
    updates: Vec<AssetBatchUpdate>,
) -> Result<Vec<Value>, String> {
    crate::services::asset_service::update_assets_batch(app_handle, updates)
}

#[tauri::command]
pub fn delete_asset(app_handle: tauri::AppHandle, id: String) -> Result<bool, String> {
    crate::services::asset_service::delete_asset(app_handle, id)
}

#[tauri::command]
pub fn delete_assets_batch(
    app_handle: tauri::AppHandle,
    ids: Vec<String>,
) -> Result<usize, String> {
    crate::services::asset_service::delete_assets_batch(app_handle, ids)
}

#[tauri::command]
pub fn move_assets_from_folders(
    app_handle: tauri::AppHandle,
    source_folder_ids: Vec<String>,
    destination_folder_id: Option<String>,
) -> Result<usize, String> {
    crate::services::asset_service::move_assets_from_folders(
        app_handle,
        source_folder_ids,
        destination_folder_id,
    )
}

#[tauri::command]
pub fn get_assets_by_ids(
    app_handle: tauri::AppHandle,
    ids: Vec<String>,
) -> Result<Vec<Value>, String> {
    crate::services::asset_service::get_assets_by_ids(app_handle, ids)
}

#[tauri::command]
pub fn get_assets_in_viewport(
    app_handle: tauri::AppHandle,
    options: ViewportOptions,
) -> Result<Vec<Value>, String> {
    crate::services::asset_service::get_assets_in_viewport(app_handle, options)
}

#[tauri::command]
pub fn debug_get_all_canvas_nodes(
    app_handle: tauri::AppHandle,
    options: DebugCanvasNodesOptions,
) -> Result<Value, String> {
    crate::services::asset_service::debug_get_all_canvas_nodes(app_handle, options)
}

#[tauri::command]
pub fn upsert_canvas_nodes(
    app_handle: tauri::AppHandle,
    canvas_id: String,
    nodes: Vec<Value>,
) -> Result<usize, String> {
    crate::services::asset_service::upsert_canvas_nodes(app_handle, canvas_id, nodes)
}

#[tauri::command]
pub fn list_folders(
    app_handle: tauri::AppHandle,
    library_id: Option<String>,
) -> Result<Vec<Value>, String> {
    crate::services::asset_service::list_folders(app_handle, library_id)
}

#[tauri::command]
pub fn replace_folders(
    app_handle: tauri::AppHandle,
    library_id: Option<String>,
    folders: Vec<Value>,
) -> Result<Vec<Value>, String> {
    crate::services::asset_service::replace_folders(app_handle, library_id, folders)
}

#[tauri::command]
pub fn move_folders(
    app_handle: tauri::AppHandle,
    options: MoveFoldersOptions,
) -> Result<Vec<Value>, String> {
    crate::services::asset_service::move_folders(app_handle, options)
}

#[tauri::command]
pub fn list_tags(
    app_handle: tauri::AppHandle,
    library_id: Option<String>,
) -> Result<Vec<Value>, String> {
    crate::services::asset_service::list_tags(app_handle, library_id)
}

#[tauri::command]
pub fn get_folder_asset_counts(
    app_handle: tauri::AppHandle,
    library_id: Option<String>,
) -> Result<Vec<Value>, String> {
    crate::services::asset_service::get_folder_asset_counts(app_handle, library_id)
}

#[tauri::command]
pub fn get_tag_asset_counts(
    app_handle: tauri::AppHandle,
    library_id: Option<String>,
) -> Result<Vec<Value>, String> {
    crate::services::asset_service::get_tag_asset_counts(app_handle, library_id)
}

#[tauri::command]
pub fn get_inspiration_analysis_counts(
    app_handle: tauri::AppHandle,
    library_id: Option<String>,
) -> Result<Value, String> {
    crate::services::asset_service::get_inspiration_analysis_counts(app_handle, library_id)
}

#[tauri::command]
pub fn get_asset_thumbnails(
    app_handle: tauri::AppHandle,
    asset_id: String,
) -> Result<Vec<Value>, String> {
    crate::services::asset_service::get_asset_thumbnails(app_handle, asset_id)
}
