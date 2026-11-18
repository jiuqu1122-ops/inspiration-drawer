//! Isolated production ChatView/HTML sandbox verification. No DB, AI or app setup.
#[cfg(not(debug_assertions))]
compile_error!("The HTML preview probe is development-only");
use std::sync::atomic::{AtomicUsize, Ordering};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
static FORBIDDEN: AtomicUsize = AtomicUsize::new(0);
#[tauri::command]
fn chat_create_file() { FORBIDDEN.fetch_add(1, Ordering::SeqCst); }
#[tauri::command]
fn chat_copy_generated_file(app: tauri::AppHandle, mut result: serde_json::Value) {
    result["nativeInvocationsIncludingOneTrustedControl"] = FORBIDDEN.load(Ordering::SeqCst).into();
    let passed = result["pass"] == true && FORBIDDEN.load(Ordering::SeqCst) == 1;
    println!("HTML_PREVIEW_PROBE_RESULT {}", result);
    if let Some(path) = std::env::args().nth(1) { let _ = std::fs::write(path, serde_json::to_string_pretty(&result).unwrap()); }
    capture_preview(app, passed);
}

#[cfg(windows)]
fn capture_preview(app: tauri::AppHandle, passed: bool) {
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
fn capture_preview(app: tauri::AppHandle, passed: bool) { app.exit(if passed {0} else {1}); }

fn main() {
    let width = std::env::args().nth(2).and_then(|value| value.parse::<f64>().ok()).unwrap_or(1240.0);
    let mode=std::env::args().nth(3).unwrap_or_default();
    let height = std::env::args().nth(4).and_then(|value| value.parse::<f64>().ok()).unwrap_or(820.0);
    let theme = if std::env::args().nth(5).as_deref() == Some("dark") { "dark" } else { "light" };
    let frontend = match mode.as_str() {
        "prototype"=>"scripts/prototype-preview-probe.html".to_string(),
        "rhino-panel"=>format!("scripts/rhino-panel-layout-probe.html?documentId=7&theme={theme}"),
        _=>"scripts/chat-html-preview-probe.html?autorun=1".to_string(),
    };
    let mut context=tauri::generate_context!();
    context.config_mut().app.windows.clear();
    context.config_mut().build.dev_url=Some("http://127.0.0.1:1468".parse().unwrap());
    context.config_mut().identifier=format!("com.inspirationdrawer.html-isolated-probe-{}",std::process::id());
    context.config_mut().app.security.asset_protocol.enable=false;
    context.config_mut().plugins.0.clear();
    tauri::Builder::default().invoke_handler(tauri::generate_handler![chat_copy_generated_file,chat_create_file]).setup(move |app|{
        WebviewWindowBuilder::new(app,"main",WebviewUrl::App(frontend.into()))
            .title("ISOLATED HTML Canvas preview test").inner_size(width,height).focused(false).visible(false)
            .data_directory(app.path().app_local_data_dir()?.join(format!("probe-{}",std::process::id()))).build()?;
        let handle=app.handle().clone();std::thread::spawn(move||{std::thread::sleep(std::time::Duration::from_secs(90));handle.exit(2);});Ok(())
    }).run(context).expect("Isolated HTML fixture");
}
