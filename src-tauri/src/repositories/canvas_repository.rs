use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::db::schema::{DEFAULT_LIBRARY_ID, DEFAULT_PROJECT_ID};
use crate::repositories::asset_repository::ViewportOptions;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CanvasScope {
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub library_id: Option<String>,
}

impl CanvasScope {
    pub fn normalized_project_id(&self) -> String {
        self.project_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(DEFAULT_PROJECT_ID)
            .to_string()
    }

    pub fn normalized_library_id(&self) -> String {
        self.library_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(DEFAULT_LIBRARY_ID)
            .to_string()
    }
}

pub trait CanvasRepository {
    fn list_canvases(&self, scope: CanvasScope) -> Result<Vec<Value>, String>;
    fn list_deleted_canvases(&self, scope: CanvasScope) -> Result<Vec<Value>, String>;
    fn get_canvas(&self, canvas_id: &str) -> Result<Option<Value>, String>;
    fn create_canvas(&self, scope: CanvasScope, name: String) -> Result<Value, String>;
    fn duplicate_canvas(&self, canvas_id: &str, new_name: String) -> Result<Value, String>;
    fn save_canvas_snapshot(&self, canvas_id: &str, snapshot_name: String)
        -> Result<Value, String>;
    fn rename_canvas(&self, canvas_id: &str, name: String) -> Result<Option<Value>, String>;
    fn soft_delete_canvas(&self, canvas_id: &str) -> Result<Value, String>;
    fn restore_canvas(&self, canvas_id: &str) -> Result<Option<Value>, String>;
    fn permanently_delete_canvas(&self, canvas_id: &str) -> Result<Value, String>;
    fn get_trash_count(&self, scope: CanvasScope) -> Result<i64, String>;
    fn set_active_canvas(&self, scope: CanvasScope, canvas_id: &str) -> Result<Value, String>;
    fn get_active_canvas(&self, scope: CanvasScope) -> Result<Value, String>;
    fn list_canvas_nodes(&self, canvas_id: &str) -> Result<Vec<Value>, String>;
    fn get_canvas_nodes_in_viewport(&self, options: ViewportOptions) -> Result<Vec<Value>, String>;
    fn update_canvas_nodes(&self, canvas_id: String, nodes: Vec<Value>) -> Result<usize, String>;
    fn patch_canvas_nodes(&self, canvas_id: String, nodes: Vec<Value>) -> Result<usize, String>;
}
