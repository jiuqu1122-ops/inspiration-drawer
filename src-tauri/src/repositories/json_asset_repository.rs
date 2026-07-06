use std::fs;

use serde_json::{json, Value};

use crate::repositories::asset_repository::{
    AssetListOptions, AssetRepository, AssetUpdatePatch, DebugCanvasNodesOptions, ViewportOptions,
};

pub struct JsonAssetRepository {
    app_handle: tauri::AppHandle,
}

impl JsonAssetRepository {
    pub fn new(app_handle: tauri::AppHandle) -> Self {
        Self { app_handle }
    }

    pub fn items_path(&self) -> std::path::PathBuf {
        crate::get_user_data_dir(&self.app_handle).join("drawer_items.json")
    }

    pub fn folders_path(&self) -> std::path::PathBuf {
        crate::get_user_data_dir(&self.app_handle).join("drawer_folders.json")
    }

    pub fn canvas_path(&self) -> std::path::PathBuf {
        crate::get_user_data_dir(&self.app_handle).join("drawer_canvas.json")
    }

    pub fn read_items(&self) -> Result<Vec<Value>, String> {
        let path = self.items_path();
        if !path.exists() {
            return Ok(Vec::new());
        }
        let content = fs::read_to_string(path).map_err(|err| err.to_string())?;
        let mut value: Value = serde_json::from_str(&content).map_err(|err| err.to_string())?;
        crate::compact_items_payload(&mut value);
        Ok(value.as_array().cloned().unwrap_or_default())
    }

    pub fn read_folders(&self) -> Result<Vec<Value>, String> {
        let path = self.folders_path();
        if !path.exists() {
            return Ok(Vec::new());
        }
        let content = fs::read_to_string(path).map_err(|err| err.to_string())?;
        let value: Value = serde_json::from_str(&content).map_err(|err| err.to_string())?;
        Ok(value.as_array().cloned().unwrap_or_default())
    }

    pub fn read_canvas_state(&self) -> Result<Value, String> {
        let path = self.canvas_path();
        if !path.exists() {
            return Ok(json!({}));
        }
        let content = fs::read_to_string(path).map_err(|err| err.to_string())?;
        let mut value: Value = serde_json::from_str(&content).map_err(|err| err.to_string())?;
        crate::compact_items_payload(&mut value);
        Ok(value)
    }
}

impl AssetRepository for JsonAssetRepository {
    fn list_assets(&self, options: AssetListOptions) -> Result<Vec<Value>, String> {
        let mut items = self.read_items()?;
        apply_json_filters(&mut items, &options);
        let offset = options.offset.unwrap_or(0).max(0) as usize;
        let limit = options.limit.unwrap_or(200).clamp(1, 1000) as usize;
        Ok(items.into_iter().skip(offset).take(limit).collect())
    }

    fn get_asset_by_id(&self, id: &str) -> Result<Option<Value>, String> {
        Ok(self.read_items()?.into_iter().find(|item| item.get("id").and_then(Value::as_str) == Some(id)))
    }

    fn get_asset_count(&self, options: AssetListOptions) -> Result<i64, String> {
        let mut items = self.read_items()?;
        apply_json_filters(&mut items, &options);
        Ok(items.len() as i64)
    }

    fn upsert_assets(&self, _assets: Vec<Value>) -> Result<usize, String> {
        Err("JSON repository is read-only for command upserts; use legacy save_items for rollback mode".to_string())
    }

    fn update_asset(&self, _id: &str, _patch: AssetUpdatePatch) -> Result<Option<Value>, String> {
        Err("JSON repository is read-only for command updates; use legacy save_items for rollback mode".to_string())
    }

    fn delete_asset(&self, _id: &str) -> Result<bool, String> {
        Err("JSON repository is read-only for command deletes; use legacy save_items for rollback mode".to_string())
    }

    fn get_assets_by_ids(&self, ids: Vec<String>) -> Result<Vec<Value>, String> {
        let id_set: std::collections::HashSet<String> = ids.into_iter().collect();
        Ok(self.read_items()?.into_iter().filter(|item| {
            item.get("id").and_then(Value::as_str).map(|id| id_set.contains(id)).unwrap_or(false)
        }).collect())
    }

    fn get_assets_in_viewport(&self, _options: ViewportOptions) -> Result<Vec<Value>, String> {
        Ok(Vec::new())
    }

    fn debug_get_all_canvas_nodes(&self, options: DebugCanvasNodesOptions) -> Result<Value, String> {
        let state = self.read_canvas_state()?;
        let items = state.get("items").and_then(Value::as_array).cloned().unwrap_or_default();
        let limit = options.limit.unwrap_or(20).clamp(1, 200) as usize;
        Ok(json!({
            "mode": "json",
            "canvasId": options.canvas_id.unwrap_or_else(|| "default".to_string()),
            "count": items.len(),
            "nodes": items.into_iter().take(limit).collect::<Vec<_>>(),
        }))
    }

    fn upsert_canvas_nodes(&self, _canvas_id: String, _nodes: Vec<Value>) -> Result<usize, String> {
        Err("JSON repository is read-only for canvas node upserts; use legacy save_canvas_state for rollback mode".to_string())
    }

    fn list_folders(&self, _library_id: Option<String>) -> Result<Vec<Value>, String> {
        self.read_folders()
    }

    fn list_tags(&self, _library_id: Option<String>) -> Result<Vec<Value>, String> {
        Ok(Vec::new())
    }

    fn get_asset_thumbnails(&self, asset_id: &str) -> Result<Vec<Value>, String> {
        Ok(self.get_asset_by_id(asset_id)?.and_then(|item| {
            item.get("thumbnail").and_then(Value::as_str).map(|thumbnail| {
                vec![json!({ "asset_id": asset_id, "size": 512, "path": thumbnail })]
            })
        }).unwrap_or_default())
    }
}

fn apply_json_filters(items: &mut Vec<Value>, options: &AssetListOptions) {
    if let Some(folder_ids) = options.folder_ids.as_ref().map(|ids| {
        ids.iter()
            .map(|value| value.trim())
            .filter(|value| !value.is_empty())
            .map(ToOwned::to_owned)
            .collect::<std::collections::HashSet<_>>()
    }).filter(|ids| !ids.is_empty()) {
        items.retain(|item| item.get("folderId").and_then(Value::as_str).map(|id| folder_ids.contains(id)).unwrap_or(false));
    } else if let Some(folder_id) = options.folder_id.as_ref().map(|value| value.trim()).filter(|value| !value.is_empty()) {
        if folder_id == "all" {
            items.retain(|item| item.get("folderId").and_then(Value::as_str).unwrap_or("").is_empty());
        } else {
            items.retain(|item| item.get("folderId").and_then(Value::as_str) == Some(folder_id));
        }
    }
    if let Some(file_type) = options.file_type.as_ref().map(|value| value.trim()).filter(|value| !value.is_empty()) {
        items.retain(|item| item.get("type").and_then(Value::as_str) == Some(file_type));
    }
    if let Some(keyword) = options.keyword.as_ref().map(|value| value.trim().to_lowercase()).filter(|value| !value.is_empty()) {
        items.retain(|item| {
            ["name", "content", "remark", "sourceUrl", "originalUrl"]
                .iter()
                .any(|key| item.get(*key).and_then(Value::as_str).unwrap_or("").to_lowercase().contains(&keyword))
        });
    }
}
