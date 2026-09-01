mod browser_detection;
mod extension_status;
mod manager;
mod pairing;

use tauri::{AppHandle, State};

pub use browser_detection::BrowserKind;
pub use extension_status::{BrowserExtensionInstallResult, BrowserExtensionStatusSnapshot};
pub use manager::BrowserExtensionManagerState;

#[tauri::command]
pub fn browser_extension_get_status(
    state: State<'_, BrowserExtensionManagerState>,
) -> Result<BrowserExtensionStatusSnapshot, String> {
    state.snapshot()
}

#[tauri::command]
pub fn browser_extension_begin_install(
    app: AppHandle,
    state: State<'_, BrowserExtensionManagerState>,
    browser: BrowserKind,
) -> Result<BrowserExtensionInstallResult, String> {
    state.begin_install(&app, browser)
}

#[tauri::command]
pub fn browser_extension_retry_pairing(
    state: State<'_, BrowserExtensionManagerState>,
    browser: BrowserKind,
) -> Result<BrowserExtensionStatusSnapshot, String> {
    state.begin_pairing(browser);
    state.snapshot()
}

#[tauri::command]
pub fn browser_extension_open_extension_page(
    state: State<'_, BrowserExtensionManagerState>,
    browser: BrowserKind,
) -> Result<(), String> {
    state.open_extension_page(browser)
}

#[tauri::command]
pub fn browser_extension_open_prepared_folder(
    app: AppHandle,
    state: State<'_, BrowserExtensionManagerState>,
) -> Result<String, String> {
    state.open_prepared_folder(&app)
}

#[tauri::command]
pub fn browser_extension_dismiss_setup_prompt(
    state: State<'_, BrowserExtensionManagerState>,
) -> Result<(), String> {
    state.dismiss_setup_prompt()
}
