use serde::Serialize;
use std::path::PathBuf;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformCapabilities {
    pub platform: &'static str,
    pub native_file_drag: bool,
    pub native_drop: bool,
    pub virtual_drop: bool,
    pub browser_extension_auto_install: bool,
    pub browser_extension_bridge: bool,
    pub global_shortcut: bool,
    pub auto_start: bool,
    pub auto_updater: bool,
    pub managed_codex: bool,
    pub cloudflared_tunnel: bool,
    pub local_media_engines: bool,
}

pub fn capabilities() -> PlatformCapabilities {
    #[cfg(target_os = "windows")]
    {
        return PlatformCapabilities {
            platform: "windows",
            native_file_drag: true,
            native_drop: true,
            virtual_drop: true,
            browser_extension_auto_install: true,
            browser_extension_bridge: true,
            global_shortcut: true,
            auto_start: true,
            auto_updater: true,
            managed_codex: cfg!(target_arch = "x86_64"),
            cloudflared_tunnel: true,
            local_media_engines: true,
        };
    }

    #[cfg(target_os = "macos")]
    {
        return PlatformCapabilities {
            platform: "macos",
            native_file_drag: false,
            native_drop: true,
            virtual_drop: false,
            browser_extension_auto_install: false,
            browser_extension_bridge: true,
            global_shortcut: true,
            auto_start: false,
            auto_updater: false,
            managed_codex: false,
            cloudflared_tunnel: false,
            local_media_engines: false,
        };
    }

    #[allow(unreachable_code)]
    PlatformCapabilities {
        platform: "unknown",
        native_file_drag: false,
        native_drop: false,
        virtual_drop: false,
        browser_extension_auto_install: false,
        browser_extension_bridge: false,
        global_shortcut: false,
        auto_start: false,
        auto_updater: false,
        managed_codex: false,
        cloudflared_tunnel: false,
        local_media_engines: false,
    }
}

#[tauri::command]
pub fn get_platform_capabilities() -> PlatformCapabilities {
    capabilities()
}

pub fn unsupported_error(feature: &str) -> String {
    serde_json::json!({
        "code": "UNSUPPORTED_PLATFORM",
        "feature": feature,
        "platform": capabilities().platform,
    })
    .to_string()
}

pub fn start_file_drag(
    paths: Vec<String>,
    cancel_rect: Option<crate::native_drag::CancelRect>,
) -> Result<(), String> {
    if !capabilities().native_file_drag {
        return Err(unsupported_error("native_file_drag"));
    }
    crate::native_drag::start_file_drag(paths, cancel_rect)
}

pub fn copy_files_to_clipboard(paths: Vec<String>) -> Result<(), String> {
    if !capabilities().native_file_drag {
        return Err(unsupported_error("native_file_clipboard"));
    }
    crate::native_drag::copy_files_to_clipboard(paths)
}

pub fn init_native_drop(app: &tauri::App) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    return windows::drag::init_native_drop(app);

    #[cfg(target_os = "macos")]
    return macos::drag::init_native_drop(app);

    #[allow(unreachable_code)]
    {
        let _ = app;
        Ok(())
    }
}

pub fn refresh_native_drop(app_handle: &tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    return windows::drag::refresh_native_drop(app_handle);

    #[cfg(target_os = "macos")]
    return macos::drag::refresh_native_drop(app_handle);

    #[allow(unreachable_code)]
    {
        let _ = app_handle;
        Ok(())
    }
}

pub fn cancel_virtual_drop(job_id: &str) -> Result<(), String> {
    if !capabilities().virtual_drop {
        return Err(unsupported_error("virtual_drop"));
    }
    crate::native_drop::cancel_virtual_drop(job_id)
}

pub fn browser_candidates(browser: &str) -> Vec<PathBuf> {
    #[cfg(target_os = "windows")]
    return windows::browser::candidates(browser);

    #[cfg(target_os = "macos")]
    return macos::browser::candidates(browser);

    #[allow(unreachable_code)]
    {
        let _ = browser;
        Vec::new()
    }
}

pub fn machine_fingerprint(app_handle: &tauri::AppHandle) -> Result<String, String> {
    crate::license::machine_id::current_machine_id(app_handle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capabilities_match_the_compiling_platform() {
        let value = capabilities();
        assert!(!value.platform.is_empty());
        #[cfg(target_os = "windows")]
        assert!(value.native_file_drag);
        #[cfg(target_os = "macos")]
        assert_eq!(value.platform, "macos");
    }
}
