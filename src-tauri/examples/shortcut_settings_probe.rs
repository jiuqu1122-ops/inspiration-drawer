//! Isolated real shortcut configuration/OS registration + production settings UI.
#[cfg(not(debug_assertions))]
compile_error!("Shortcut settings probe is development-only");
#[path = "../src/shortcut_config.rs"]
mod shortcut_config;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
fn fixture_root() -> std::path::PathBuf {
    let root = std::path::PathBuf::from(std::env::args().nth(2).expect("isolated data path required"));
    let allowed = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().join("outputs").join("shortcut-verification").canonicalize().unwrap();
    let actual = root.canonicalize().expect("create isolated data directory before launching");
    assert!(actual.starts_with(&allowed) && actual != allowed, "refuse production/user data path");
    actual
}
fn get_user_data_dir(_: &tauri::AppHandle) -> std::path::PathBuf { fixture_root() }
#[tauri::command]
fn finish_shortcut_probe(app: tauri::AppHandle, result: serde_json::Value) {
    let path=std::env::args().nth(1).unwrap();
    std::fs::write(path,serde_json::to_string_pretty(&result).unwrap()).unwrap();
    capture_shortcuts(app, result["pass"] == true);
}
#[cfg(windows)]
fn capture_shortcuts(app: tauri::AppHandle, passed: bool) {
    use windows_core::Interface;
    use webview2_com::{CapturePreviewCompletedHandler, Microsoft::Web::WebView2::Win32::COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG};
    #[link(name = "shlwapi")]
    extern "system" {
        fn SHCreateStreamOnFileEx(path: *const u16, mode: u32, attributes: u32, create: i32,
            template: *mut std::ffi::c_void, stream: *mut *mut std::ffi::c_void) -> i32;
    }
    let window = app.get_webview_window("main").unwrap();
    let image = std::path::PathBuf::from(std::env::args().nth(1).unwrap()).with_extension("png");
    let path: Vec<u16> = image.to_string_lossy().encode_utf16().chain(Some(0)).collect();
    let _ = window.with_webview(move |webview| unsafe {
        let mut raw = std::ptr::null_mut();
        let status = SHCreateStreamOnFileEx(path.as_ptr(), 0x1001, 0x80, 1, std::ptr::null_mut(), &mut raw);
        if status < 0 || raw.is_null() { app.exit(3); return; }
        let stream = windows_core::IUnknown::from_raw(raw);
        let core = webview.controller().CoreWebView2().unwrap();
        let app_exit = app.clone();
        let done = CapturePreviewCompletedHandler::create(Box::new(move |status| {
            drop(stream);
            eprintln!("HTML_PREVIEW_SCREENSHOT {}", status.is_ok());
            app_exit.exit(if passed && status.is_ok() {0} else {1});
            Ok(())
        }));
        let status = (core.vtable().CapturePreview)(core.as_raw(), COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG, raw, done.as_raw());
        if status.is_err() { app.exit(3); }
    });
}
#[cfg(not(windows))]
fn capture_shortcuts(app: tauri::AppHandle, passed: bool) { app.exit(if passed {0} else {1}); }

fn main() {
    let phase=std::env::args().nth(3).unwrap_or_else(||"write".into());
    assert!(["write", "restart", "manual", "drawer"].contains(&phase.as_str()));
    let visible=phase=="manual";
    let root=fixture_root();
    let mut context=tauri::generate_context!();
    context.config_mut().app.windows.clear();
    context.config_mut().identifier="com.inspirationdrawer.shortcut-isolated-probe".into();
    context.config_mut().build.dev_url=Some("http://127.0.0.1:1468".parse().unwrap());
    context.config_mut().plugins.0.clear();
    context.config_mut().app.security.asset_protocol.enable=false;
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![shortcut_config::get_shortcut,shortcut_config::update_shortcut,finish_shortcut_probe])
        .setup(move|app| {
            WebviewWindowBuilder::new(app,"main",WebviewUrl::App(format!("scripts/shortcut-settings-probe.html?phase={phase}").into()))
                .title("ISOLATED shortcut settings test - no user data").inner_size(1000.0,820.0)
                .focused(visible).visible(visible).data_directory(root.join("webview")).build()?;
            let handle=app.handle().clone();
            std::thread::spawn(move||{std::thread::sleep(std::time::Duration::from_secs(if visible {1200}else{110}));handle.exit(2);});
            Ok(())
        }).run(context).expect("isolated shortcut settings test");
}
