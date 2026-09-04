pub fn init_native_drop(app: &tauri::App) -> Result<(), String> {
    crate::native_drop::init_native_drop(app)
}

pub fn refresh_native_drop(app_handle: &tauri::AppHandle) -> Result<(), String> {
    crate::native_drop::refresh_edge_native_drop(app_handle)
}
