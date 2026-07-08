use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AssetListOptions {
    #[serde(default)]
    pub library_id: Option<String>,
    #[serde(default)]
    pub folder_id: Option<String>,
    #[serde(default)]
    pub folder_ids: Option<Vec<String>>,
    #[serde(default)]
    pub keyword: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub file_type: Option<String>,
    #[serde(default)]
    pub sort: Option<String>,
    #[serde(default)]
    pub offset: Option<i64>,
    #[serde(default)]
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ViewportOptions {
    pub canvas_id: String,
    pub viewport_x: f64,
    pub viewport_y: f64,
    pub viewport_width: f64,
    pub viewport_height: f64,
    #[serde(default)]
    pub buffer: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DebugCanvasNodesOptions {
    #[serde(default)]
    pub canvas_id: Option<String>,
    #[serde(default)]
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AssetUpdatePatch {
    #[serde(default)]
    pub folder_id: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub rating: Option<i64>,
    #[serde(default)]
    pub metadata: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MoveFoldersOptions {
    #[serde(default, alias = "folder_ids")]
    pub folder_ids: Vec<String>,
    #[serde(default, alias = "new_parent_id")]
    pub new_parent_id: Option<String>,
    #[serde(default, alias = "library_id")]
    pub library_id: Option<String>,
    #[serde(default, alias = "insert_position")]
    pub insert_position: Option<i64>,
    #[serde(default, alias = "sort_order")]
    pub sort_order: Option<i64>,
}

pub trait AssetRepository {
    fn list_assets(&self, options: AssetListOptions) -> Result<Vec<Value>, String>;
    fn get_asset_by_id(&self, id: &str) -> Result<Option<Value>, String>;
    fn get_asset_count(&self, options: AssetListOptions) -> Result<i64, String>;
    fn upsert_assets(&self, assets: Vec<Value>) -> Result<usize, String>;
    fn update_asset(&self, id: &str, patch: AssetUpdatePatch) -> Result<Option<Value>, String>;
    fn delete_asset(&self, id: &str) -> Result<bool, String>;
    fn get_assets_by_ids(&self, ids: Vec<String>) -> Result<Vec<Value>, String>;
    fn get_assets_in_viewport(&self, options: ViewportOptions) -> Result<Vec<Value>, String>;
    fn debug_get_all_canvas_nodes(&self, options: DebugCanvasNodesOptions) -> Result<Value, String>;
    fn upsert_canvas_nodes(&self, canvas_id: String, nodes: Vec<Value>) -> Result<usize, String>;
    fn list_folders(&self, library_id: Option<String>) -> Result<Vec<Value>, String>;
    fn move_folders(&self, options: MoveFoldersOptions) -> Result<Vec<Value>, String>;
    fn list_tags(&self, library_id: Option<String>) -> Result<Vec<Value>, String>;
    fn get_asset_thumbnails(&self, asset_id: &str) -> Result<Vec<Value>, String>;
}
