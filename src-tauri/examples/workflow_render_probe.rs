//! Explicit opt-in Windows/WebView2 probe. It has a distinct app identifier,
//! profile and local-only frontend fixture; it never opens the production App.
#[path = "../src/renderer_diagnostics.rs"]
mod renderer_diagnostics;
use renderer_diagnostics::{record, record_window_state, restore_main_window, window_action, WindowAction};
use std::sync::{mpsc, Mutex};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

struct ProbeState(Mutex<mpsc::Sender<serde_json::Value>>);
#[tauri::command]
fn probe_result(app: tauri::AppHandle, result: serde_json::Value) {
    let mut result = result;
    if let Some(window) = app.get_webview_window("main") {
        result["nativeVisible"] = window.is_visible().unwrap_or(false).into();
        result["nativeMinimized"] = window.is_minimized().unwrap_or(true).into();
    }
    println!("PROBE_RESULT {}", result);
    record(&app, "main", "probe_result", result.clone());
    let _ = app.state::<ProbeState>().0.lock().unwrap().send(result);
}

fn main() {
    let performance = std::env::args().any(|arg| arg == "--performance");
    let promotion = std::env::args().any(|arg| arg == "--promote");
    let diagnostics = std::env::args().any(|arg| arg == "--diagnostics");
    let reopen = std::env::args().any(|arg| arg == "--reopen");
    let no_zoom = std::env::args().any(|arg| arg == "--no-zoom");
    let quick = std::env::args().any(|arg| arg == "--diagnostics-only" || arg == "--quick") || reopen || performance;
    let mut context = tauri::generate_context!();
    context.config_mut().app.windows.clear();
    context.config_mut().build.dev_url = Some("http://localhost:1461".parse().unwrap());
    context.config_mut().identifier = if performance { "com.inspirationdrawer.canvas-performance-probe".into() }
        else { format!("com.inspirationdrawer.workflow-probe-{}", if promotion { "promoted" } else { "default" }) };
    let (sender, receiver) = mpsc::channel();
    tauri::Builder::default()
        .manage(renderer_diagnostics::DiagnosticState::default())
        .manage(ProbeState(Mutex::new(sender)))
        .invoke_handler(tauri::generate_handler![renderer_diagnostics::record_renderer_diagnostic,
            renderer_diagnostics::diagnostic_minimize_window, probe_result])
        .setup(move |app| {
            let profile = app.path().app_local_data_dir()?.join("probe-webview");
            let main = WebviewWindowBuilder::new(app, "main", WebviewUrl::App(
                (if performance { "scripts/canvas-performance-probe.html".to_string() }
                else { format!("scripts/workflow-render-probe.html?promote={promotion}&quick={quick}&nozoom={no_zoom}") }).into()))
                .title("Workflow / WebView2 isolated probe")
                .inner_size(980.0, 740.0).focused(false).data_directory(profile).build()?;
            renderer_diagnostics::init(app.handle());
            let app = app.handle().clone();
            std::thread::spawn(move || {
                // Ensure the actual zoom burst is painted in a visible WebView,
                // independent of the shell's background launch flags.
                std::thread::sleep(std::time::Duration::from_secs(if quick { 1 } else { 90 }));
                let _ = main.unminimize();
                let _ = window_action(&main, WindowAction::Show, "probe_visible_zoom");
                let result = receiver.recv_timeout(std::time::Duration::from_secs(90));
                let mut pass = result.as_ref().map(|r| if performance {
                    r["checksPassed"] == true && r["nativeVisible"] == true && r["nativeMinimized"] == false
                } else { r["submissions"] == 1 && r["instances"] == 1
                    && r["previewCacheMisses"] == 0 && r["sizeCacheMisses"] == 0
                    && r["status"] == "success" && r["resultPresent"] == true
                    && r["sameImageElement"] == true && r["sameImageSource"] == true
                    && r["imageDecoded"] == true && r["ordinaryImageDecoded"] == true
                    && r["nativeVisible"] == true && r["nativeMinimized"] == false
                    && r["errors"].as_array().map(|v| v.is_empty()).unwrap_or(false) }).unwrap_or(false);
                if pass && reopen {
                    let _ = window_action(&main, WindowAction::Minimize, "probe_reopen_minimize");
                    std::thread::sleep(std::time::Duration::from_millis(600));
                    let _ = window_action(&main, WindowAction::Show, "probe_original_show_only");
                    std::thread::sleep(std::time::Duration::from_millis(600));
                    let show_only_minimized = main.is_minimized().unwrap_or(false);
                    record_window_state(&main, "probe_show_only_state", "probe_original_show_only");
                    let restored = restore_main_window(&main, "probe_explicit_reopen").is_ok();
                    let _ = window_action(&main, WindowAction::Hide, "probe_reopen_hidden_offscreen");
                    let _ = main.set_position(tauri::PhysicalPosition::new(-32000, -32000));
                    let _ = main.set_ignore_cursor_events(true);
                    let offscreen_restored = restore_main_window(&main, "probe_offscreen_reopen").is_ok();
                    // Native reopen while JS is busy must not need a renderer
                    // callback. A later read proves the workflow was untouched.
                    let _ = main.eval("setTimeout(() => { const until = performance.now() + 15000; while(performance.now() < until) {} }, 0);");
                    std::thread::sleep(std::time::Duration::from_secs(2));
                    let _ = window_action(&main, WindowAction::Minimize, "probe_blocked_renderer_minimize");
                    let native_restore_started = std::time::Instant::now();
                    let blocked_restored = restore_main_window(&main, "probe_blocked_renderer_reopen").is_ok();
                    let restore_ms = native_restore_started.elapsed().as_millis() as u64;
                    let native_visible = main.is_visible().unwrap_or(false) && !main.is_minimized().unwrap_or(true);
                    std::thread::sleep(std::time::Duration::from_secs(15));
                    let _ = main.eval("window.reportReopenProbe()");
                    let unchanged = receiver.recv_timeout(std::time::Duration::from_secs(10)).ok()
                        .map(|r| r["submissions"] == 1 && r["instances"] == 1 && r["status"] == "success" && r["resultPresent"] == true).unwrap_or(false);
                    pass = restored && offscreen_restored && blocked_restored && native_visible && restore_ms < 5000 && unchanged;
                    println!("REOPEN_RESULT {}", serde_json::json!({"originalShowStillMinimized": show_only_minimized,
                        "restored": restored, "offscreenRestored": offscreen_restored, "blockedRestored": blocked_restored,
                        "nativeVisible": native_visible, "restoreMs": restore_ms, "workflowUnchanged": unchanged}));
                    // A showable native HWND does not imply a live renderer.
                    let _ = main.navigate("chrome://crash".parse().unwrap());
                    std::thread::sleep(std::time::Duration::from_secs(6));
                    let _ = restore_main_window(&main, "probe_exited_renderer_reopen");
                    record(&app, "main", "probe_host_alive_after_renderer_failure", serde_json::json!({}));
                }
                if pass && diagnostics {
                    let _ = main.eval("setTimeout(() => { throw new TypeError('fixture error'); }, 0); Promise.reject(new RangeError('fixture rejection'));");
                    std::thread::sleep(std::time::Duration::from_secs(6));
                    let _ = window_action(&main, WindowAction::Hide, "probe_hidden_timer_throttling");
                    std::thread::sleep(std::time::Duration::from_secs(40));
                    let _ = window_action(&main, WindowAction::Show, "probe_restore");
                    let _ = main.unminimize();
                    std::thread::sleep(std::time::Duration::from_secs(8));
                    let _ = main.eval("setTimeout(() => { const until = performance.now() + 42000; while(performance.now() < until) {} }, 0);");
                    std::thread::sleep(std::time::Duration::from_secs(50));
                    // Intentionally exit only this isolated renderer. The host
                    // remains alive to write ProcessFailed; no reload follows.
                    let _ = main.navigate("chrome://crash".parse().unwrap());
                    std::thread::sleep(std::time::Duration::from_secs(8));
                    record(&app, "main", "probe_host_alive_after_renderer_failure", serde_json::json!({}));
                }
                println!("PROBE_{}", if pass { "PASS" } else { "FAIL" });
                let _ = window_action(&main, WindowAction::Destroy, "probe_complete");
                app.exit(if pass { 0 } else { 1 });
            });
            Ok(())
        }).run(context).expect("isolated WebView2 probe");
}
