use std::collections::{HashMap, HashSet};
use std::fs;

use serde_json::{json, Value};

use crate::db::schema::DEFAULT_LIBRARY_ID;
use crate::repositories::asset_repository::{
    AssetListOptions, AssetRepository, AssetUpdatePatch, DebugCanvasNodesOptions,
    MoveFoldersOptions, ViewportOptions,
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
        Ok(self
            .read_items()?
            .into_iter()
            .find(|item| item.get("id").and_then(Value::as_str) == Some(id)))
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
        Ok(self
            .read_items()?
            .into_iter()
            .filter(|item| {
                item.get("id")
                    .and_then(Value::as_str)
                    .map(|id| id_set.contains(id))
                    .unwrap_or(false)
            })
            .collect())
    }

    fn get_assets_in_viewport(&self, _options: ViewportOptions) -> Result<Vec<Value>, String> {
        Ok(Vec::new())
    }

    fn debug_get_all_canvas_nodes(
        &self,
        options: DebugCanvasNodesOptions,
    ) -> Result<Value, String> {
        let state = self.read_canvas_state()?;
        let items = state
            .get("items")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
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

    fn replace_folders(
        &self,
        _library_id: Option<String>,
        folders: Vec<Value>,
    ) -> Result<Vec<Value>, String> {
        let now = crate::current_time_millis();
        let path = self.folders_path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }
        let content = serde_json::to_string(&folders).map_err(|err| err.to_string())?;
        let temp_path = path.with_extension(format!("json.tmp.{}", now));
        fs::write(&temp_path, content).map_err(|err| err.to_string())?;
        if path.exists() {
            fs::remove_file(&path).map_err(|err| err.to_string())?;
        }
        fs::rename(&temp_path, &path).map_err(|err| err.to_string())?;
        Ok(folders
            .into_iter()
            .filter(|folder| !json_folder_deleted(folder))
            .collect())
    }

    fn move_folders(&self, options: MoveFoldersOptions) -> Result<Vec<Value>, String> {
        let folder_ids = normalize_json_folder_ids(options.folder_ids);
        if folder_ids.is_empty() {
            return Err("folder_ids cannot be empty".to_string());
        }
        let library_id = normalize_json_library_id(options.library_id);
        let new_parent_id = normalize_json_parent_id(options.new_parent_id);
        let selected_ids = folder_ids.iter().cloned().collect::<HashSet<_>>();
        let mut folders = self.read_folders()?;
        let folder_index_by_id = folders
            .iter()
            .enumerate()
            .filter_map(|(index, folder)| json_value_string(folder, "id").map(|id| (id, index)))
            .collect::<HashMap<_, _>>();

        for folder_id in &folder_ids {
            let index = folder_index_by_id
                .get(folder_id)
                .copied()
                .ok_or_else(|| format!("folder not found: {}", folder_id))?;
            let folder = &folders[index];
            if json_folder_deleted(folder) {
                return Err(format!(
                    "folder has been deleted: {}",
                    json_value_string(folder, "name").unwrap_or_else(|| folder_id.clone())
                ));
            }
            if json_folder_library_id(folder) != library_id {
                return Err("folders must belong to the same library".to_string());
            }
        }

        let parent_by_id = folders
            .iter()
            .filter_map(|folder| {
                let id = json_value_string(folder, "id")?;
                Some((
                    id,
                    normalize_json_parent_id(json_value_string(folder, "parentId")),
                ))
            })
            .collect::<HashMap<_, _>>();

        if let Some(parent_id) = new_parent_id.as_deref() {
            if selected_ids.contains(parent_id) {
                return Err("cannot move a folder into itself".to_string());
            }
            let target_index = folder_index_by_id
                .get(parent_id)
                .copied()
                .ok_or_else(|| "target folder not found".to_string())?;
            let target = &folders[target_index];
            if json_folder_deleted(target) {
                return Err("target folder has been deleted".to_string());
            }
            if json_folder_library_id(target) != library_id {
                return Err("target folder belongs to a different library".to_string());
            }
            for folder_id in &folder_ids {
                if is_json_descendant_of(&parent_by_id, parent_id, folder_id) {
                    return Err("cannot move a folder into its own descendant".to_string());
                }
            }
        }

        let max_sibling_sort = folders
            .iter()
            .filter(|folder| {
                json_folder_library_id(folder) == library_id
                    && !json_folder_deleted(folder)
                    && json_value_string(folder, "id")
                        .map(|id| !selected_ids.contains(&id))
                        .unwrap_or(false)
                    && normalize_json_parent_id(json_value_string(folder, "parentId"))
                        == new_parent_id
            })
            .filter_map(|folder| json_value_i64(folder, "sortOrder"))
            .max();
        let start_sort_order = options
            .sort_order
            .or(options.insert_position)
            .unwrap_or_else(|| max_sibling_sort.map(|value| value + 1).unwrap_or(0))
            .max(0);
        let now = crate::current_time_millis();

        for (offset, folder_id) in folder_ids.iter().enumerate() {
            let index = folder_index_by_id
                .get(folder_id)
                .copied()
                .ok_or_else(|| format!("folder not found: {}", folder_id))?;
            let sort_order = start_sort_order + offset as i64;
            let folder = folders
                .get_mut(index)
                .ok_or_else(|| format!("folder not found: {}", folder_id))?;
            let object = folder
                .as_object_mut()
                .ok_or_else(|| format!("invalid folder payload: {}", folder_id))?;
            object.insert("libraryId".to_string(), Value::String(library_id.clone()));
            object.insert("sortOrder".to_string(), Value::Number(sort_order.into()));
            object.insert("updatedAt".to_string(), Value::Number(now.into()));
            if let Some(parent_id) = new_parent_id.as_deref() {
                object.insert("parentId".to_string(), Value::String(parent_id.to_string()));
            } else {
                object.remove("parentId");
            }
        }

        folders.sort_by(|left, right| {
            let left_sort = json_value_i64(left, "sortOrder").unwrap_or(i64::MAX);
            let right_sort = json_value_i64(right, "sortOrder").unwrap_or(i64::MAX);
            left_sort.cmp(&right_sort).then_with(|| {
                json_value_string(left, "name")
                    .unwrap_or_default()
                    .cmp(&json_value_string(right, "name").unwrap_or_default())
            })
        });

        let path = self.folders_path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }
        let content = serde_json::to_string(&folders).map_err(|err| err.to_string())?;
        let temp_path = path.with_extension(format!("json.tmp.{}", now));
        fs::write(&temp_path, content).map_err(|err| err.to_string())?;
        if path.exists() {
            fs::remove_file(&path).map_err(|err| err.to_string())?;
        }
        fs::rename(&temp_path, &path).map_err(|err| err.to_string())?;
        Ok(folders
            .into_iter()
            .filter(|folder| !json_folder_deleted(folder))
            .collect())
    }

    fn list_tags(&self, _library_id: Option<String>) -> Result<Vec<Value>, String> {
        Ok(Vec::new())
    }

    fn get_asset_thumbnails(&self, asset_id: &str) -> Result<Vec<Value>, String> {
        Ok(self
            .get_asset_by_id(asset_id)?
            .and_then(|item| {
                item.get("thumbnail")
                    .and_then(Value::as_str)
                    .map(|thumbnail| {
                        vec![json!({ "asset_id": asset_id, "size": 512, "path": thumbnail })]
                    })
            })
            .unwrap_or_default())
    }
}

fn normalize_json_library_id(library_id: Option<String>) -> String {
    library_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_LIBRARY_ID)
        .to_string()
}

fn normalize_json_parent_id(parent_id: Option<String>) -> Option<String> {
    parent_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value != "all")
        .map(ToOwned::to_owned)
}

fn normalize_json_folder_ids(folder_ids: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    folder_ids
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty() && seen.insert(value.clone()))
        .collect()
}

fn json_value_string(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn json_value_i64(value: &Value, key: &str) -> Option<i64> {
    value.get(key).and_then(|value| {
        value
            .as_i64()
            .or_else(|| value.as_u64().map(|item| item as i64))
    })
}

fn json_folder_library_id(folder: &Value) -> String {
    json_value_string(folder, "libraryId").unwrap_or_else(|| DEFAULT_LIBRARY_ID.to_string())
}

fn json_folder_deleted(folder: &Value) -> bool {
    json_value_i64(folder, "deletedAt")
        .or_else(|| json_value_i64(folder, "deleted_at"))
        .map(|value| value > 0)
        .unwrap_or(false)
}

fn is_json_descendant_of(
    parent_by_id: &HashMap<String, Option<String>>,
    candidate_parent_id: &str,
    folder_id: &str,
) -> bool {
    let mut cursor = Some(candidate_parent_id.to_string());
    let mut seen = HashSet::new();
    while let Some(current_id) = cursor {
        if current_id == folder_id {
            return true;
        }
        if !seen.insert(current_id.clone()) {
            return true;
        }
        cursor = parent_by_id.get(&current_id).cloned().flatten();
    }
    false
}

fn apply_json_filters(items: &mut Vec<Value>, options: &AssetListOptions) {
    if let Some(folder_ids) = options
        .folder_ids
        .as_ref()
        .map(|ids| {
            ids.iter()
                .map(|value| value.trim())
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
                .collect::<std::collections::HashSet<_>>()
        })
        .filter(|ids| !ids.is_empty())
    {
        items.retain(|item| {
            item.get("folderId")
                .and_then(Value::as_str)
                .map(|id| folder_ids.contains(id))
                .unwrap_or(false)
        });
    } else if let Some(folder_id) = options
        .folder_id
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        if folder_id == "all" {
            items.retain(|item| {
                item.get("folderId")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .is_empty()
            });
        } else {
            items.retain(|item| item.get("folderId").and_then(Value::as_str) == Some(folder_id));
        }
    }
    if let Some(file_type) = options
        .file_type
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
    {
        items.retain(|item| item.get("type").and_then(Value::as_str) == Some(file_type));
    }
    if let Some(keyword) = options
        .keyword
        .as_ref()
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty())
    {
        items.retain(|item| {
            ["name", "content", "remark", "sourceUrl", "originalUrl"]
                .iter()
                .any(|key| {
                    item.get(*key)
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_lowercase()
                        .contains(&keyword)
                })
        });
    }
}
