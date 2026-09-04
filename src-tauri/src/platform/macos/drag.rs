// Finder -> app imports use Tauri's cross-platform drag/drop events. Native
// NSDraggingSource support for app -> Finder is intentionally deferred.
pub fn init_native_drop(_app: &tauri::App) -> Result<(), String> {
    Ok(())
}

pub fn refresh_native_drop(_app_handle: &tauri::AppHandle) -> Result<(), String> {
    Ok(())
}
