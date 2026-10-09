//! Local, bounded diagnostics. Never collect page content, messages, URLs,
//! user paths or dumps, and never reload/restart a renderer or generation task.
use serde::Deserialize;
use serde_json::{json, Value};
use std::{fs, io::Write, path::Path, sync::Mutex, time::{Duration, Instant}};
use tauri::{AppHandle, Manager, WebviewWindow};

const LOG_LIMIT: u64 = 2 * 1024 * 1024;
const HEARTBEAT_GAP: Duration = Duration::from_secs(30);
static LOG_LOCK: Mutex<()> = Mutex::new(());

#[derive(Default)]
pub struct DiagnosticState(Mutex<RendererHealth>);

#[derive(Default)]
struct RendererHealth {
    last_seen: Option<Instant>,
    last_logged: Option<Instant>,
    run_ids: Vec<String>,
    last_run_id: Option<String>,
    last_zoom_at: Option<u64>,
    page_visible: bool,
    gap_reported: bool,
    native_status: Option<(bool, bool)>,
    visible_since: Option<Instant>,
    zoom_layer_promotion: bool,
    last_process_failure: Option<ProcessFailure>,
}

struct ProcessFailure {
    kind: Option<i32>,
    reason: Option<i32>,
    exit_code: Option<i32>,
    observed_at: Instant,
}

fn renderer_status(health: &RendererHealth) -> &'static str {
    if let Some(failure) = &health.last_process_failure {
        match failure.kind {
            Some(0 | 1) => return "renderer_or_browser_exited",
            Some(2) if health.last_seen.map(|t| t <= failure.observed_at).unwrap_or(true) => return "renderer_unresponsive",
            _ => {}
        }
    }
    if health.gap_reported { "suspected_renderer_stall" }
    else if health.last_seen.is_none() { "awaiting_renderer" }
    else { "heartbeat_observed" }
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RendererEvent {
    RendererReady, Heartbeat, Zoom, WorkflowStart, WorkflowEnd, Visibility,
    Pagehide, FrontendError, UnhandledRejection, LongtaskUnsupported,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RendererSample {
    event: RendererEvent,
    #[serde(default)] workflow_run_ids: Vec<String>,
    last_zoom_at: Option<u64>,
    #[serde(default)] page_visible: bool,
    #[serde(default)] zoom_layer_promotion: bool,
    error_name: Option<String>,
    line: Option<u32>, column: Option<u32>,
    long_task_count: Option<u32>, longest_task_ms: Option<u32>, long_task_total_ms: Option<u32>,
}

fn safe_id(value: &str) -> String {
    value.chars().filter(|c| c.is_ascii_alphanumeric() || "_-.:".contains(*c)).take(160).collect()
}

fn append_bounded(directory: &Path, line: &[u8], limit: u64) -> std::io::Result<()> {
    fs::create_dir_all(directory)?;
    let current = directory.join("renderer-diagnostics.jsonl");
    if fs::metadata(&current).map(|m| m.len()).unwrap_or(0) + line.len() as u64 > limit {
        let previous = directory.join("renderer-diagnostics.1.jsonl");
        let oldest = directory.join("renderer-diagnostics.2.jsonl");
        if oldest.exists() { fs::remove_file(&oldest)?; }
        if previous.exists() { fs::rename(&previous, &oldest)?; }
        if current.exists() { fs::rename(&current, &previous)?; }
    }
    let mut file = fs::OpenOptions::new().create(true).append(true).open(current)?;
    file.write_all(line)?;
    file.flush()
}

pub fn record(app: &AppHandle, label: &str, event: &str, details: Value) {
    let context = app.try_state::<DiagnosticState>().and_then(|state| {
        state.0.lock().ok().map(|health| json!({
            "workflowRunIds": health.run_ids, "lastZoomAt": health.last_zoom_at,
            "workflowRunId": health.run_ids.last().or(health.last_run_id.as_ref()),
            "zoomAgeMs": health.last_zoom_at.map(|t| (chrono::Utc::now().timestamp_millis().max(0) as u64).saturating_sub(t)),
            "zoomLayerPromotion": health.zoom_layer_promotion,
            "rendererStatus": renderer_status(&health),
            "lastProcessFailure": health.last_process_failure.as_ref().map(|failure| json!({
                "kind": failure.kind, "reason": failure.reason, "exitCode": failure.exit_code,
                "ageMs": failure.observed_at.elapsed().as_millis() as u64,
            })),
        }))
    }).unwrap_or(Value::Null);
    let entry = json!({ "time": chrono::Utc::now().to_rfc3339(), "event": event,
        "windowLabel": safe_id(label), "version": app.package_info().version.to_string(),
        "hostPid": std::process::id(), "context": context, "details": details });
    if let (Ok(directory), Ok(mut line), Ok(_guard)) = (
        app.path().app_local_data_dir(), serde_json::to_vec(&entry), LOG_LOCK.lock()
    ) {
        // The event schema and fixed strings keep each record small, including
        // when an untrusted error contains a very large message.
        if line.len() > 16 * 1024 { return; }
        line.push(b'\n');
        let _ = append_bounded(&directory.join("logs"), &line, LOG_LIMIT);
    }
}

#[tauri::command]
pub fn record_renderer_diagnostic(app: AppHandle, window: WebviewWindow, sample: RendererSample) {
    if window.label() != "main" { return; }
    let state = app.state::<DiagnosticState>();
    let now = Instant::now();
    let mut recovered = None;
    let mut should_log = true;
    if let Ok(mut health) = state.0.lock() {
        // Only a newly initialized renderer clears an exited-process status.
        // A delayed IPC message from the old renderer is not recovery proof.
        if matches!(sample.event, RendererEvent::RendererReady) { health.last_process_failure = None; }
        if health.gap_reported {
            recovered = health.last_seen.map(|time| time.elapsed().as_millis() as u64);
            health.gap_reported = false;
        }
        health.last_seen = Some(now);
        health.run_ids = sample.workflow_run_ids.iter().take(16).map(|id| safe_id(id)).collect();
        if let Some(id) = health.run_ids.last().cloned() { health.last_run_id = Some(id); }
        let utc_now = chrono::Utc::now().timestamp_millis().max(0) as u64;
        health.last_zoom_at = sample.last_zoom_at.filter(|t| *t <= utc_now + 5000);
        health.page_visible = sample.page_visible;
        health.zoom_layer_promotion = sample.zoom_layer_promotion;
        if matches!(sample.event, RendererEvent::Heartbeat) {
            should_log = sample.long_task_count.unwrap_or(0) > 0
                || health.last_logged.map(|time| time.elapsed() >= Duration::from_secs(30)).unwrap_or(true);
        }
        if should_log { health.last_logged = Some(now); }
    }
    if let Some(gap_ms) = recovered { record(&app, "main", "heartbeat_recovered", json!({"gapMs": gap_ms})); }
    if !should_log { return; }
    let event = match sample.event {
        RendererEvent::RendererReady => "renderer_ready", RendererEvent::Heartbeat => "heartbeat",
        RendererEvent::Zoom => "zoom", RendererEvent::WorkflowStart => "workflow_start",
        RendererEvent::WorkflowEnd => "workflow_end", RendererEvent::Visibility => "page_visibility",
        RendererEvent::Pagehide => "pagehide", RendererEvent::FrontendError => "frontend_error",
        RendererEvent::UnhandledRejection => "unhandled_rejection", RendererEvent::LongtaskUnsupported => "longtask_unsupported",
    };
    let error_name = sample.error_name.as_deref().filter(|name| matches!(*name,
        "Error" | "TypeError" | "RangeError" | "ReferenceError" | "SyntaxError" | "URIError" |
        "EvalError" | "AggregateError" | "AbortError" | "SecurityError" | "InvalidStateError" | "OtherError"));
    record(&app, "main", event, json!({ "pageVisible": sample.page_visible,
        "errorName": error_name, "line": sample.line, "column": sample.column,
        "longTaskCount": sample.long_task_count, "longestTaskMs": sample.longest_task_ms,
        "longTaskTotalMs": sample.long_task_total_ms }));
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WindowAction { Show, Hide, Minimize, Unminimize, Focus, Destroy, Close }

pub fn window_action(window: &WebviewWindow, action: WindowAction, reason: &'static str) -> tauri::Result<()> {
    let operation = match action {
        WindowAction::Show => "show", WindowAction::Hide => "hide", WindowAction::Minimize => "minimize",
        WindowAction::Destroy => "destroy", WindowAction::Close => "close",
        WindowAction::Unminimize => "unminimize", WindowAction::Focus => "focus",
    };
    record(window.app_handle(), window.label(), "window_action_requested", json!({"action": operation, "reason": reason}));
    let result = match action {
        WindowAction::Show => window.show(), WindowAction::Hide => window.hide(),
        WindowAction::Minimize => window.minimize(), WindowAction::Destroy => window.destroy(), WindowAction::Close => window.close(),
        WindowAction::Unminimize => window.unminimize(), WindowAction::Focus => window.set_focus(),
    };
    record(window.app_handle(), window.label(), "window_action_completed", json!({"action": operation, "reason": reason, "ok": result.is_ok()}));
    result
}

fn intersects(a: (i64, i64, i64, i64), b: (i64, i64, i64, i64)) -> bool {
    a.2 > 0 && a.3 > 0 && b.2 > 0 && b.3 > 0
        && a.0 < b.0 + b.2 && a.0 + a.2 > b.0
        && a.1 < b.1 + b.3 && a.1 + a.3 > b.1
}

pub fn record_window_state(window: &WebviewWindow, event: &str, reason: &'static str) {
    let position = window.outer_position().ok();
    let size = window.outer_size().ok();
    let on_screen = position.zip(size).and_then(|(p, s)| window.available_monitors().ok().map(|monitors| {
        monitors.iter().any(|m| {
            let area = m.work_area();
            intersects((p.x as i64, p.y as i64, s.width as i64, s.height as i64),
                (area.position.x as i64, area.position.y as i64, area.size.width as i64, area.size.height as i64))
        })
    }));
    record(window.app_handle(), window.label(), event, json!({
        "reason": reason, "visible": window.is_visible().ok(), "minimized": window.is_minimized().ok(),
        "focused": window.is_focused().ok(), "onScreen": on_screen,
        "position": position.map(|p| json!({"x": p.x, "y": p.y})),
        "size": size.map(|s| json!({"width": s.width, "height": s.height})),
    }));
}

/// Explicit user reopen only. Does not evaluate JS, reload, rebuild a WebView
/// or touch any execution state; also works while the renderer is blocked.
pub fn restore_main_window(window: &WebviewWindow, reason: &'static str) -> tauri::Result<()> {
    record_window_state(window, "main_reopen_before", reason);
    let result = (|| {
        window_action(window, WindowAction::Unminimize, reason)?;
        // Preserve placement unless the entire window is outside all current
        // work areas (e.g. a disconnected monitor or an interrupted snip).
        if let (Ok(position), Ok(size), Ok(monitors)) = (window.outer_position(), window.outer_size(), window.available_monitors()) {
            let rect = (position.x as i64, position.y as i64, size.width as i64, size.height as i64);
            if !monitors.is_empty() && !monitors.iter().any(|m| {
                let area = m.work_area();
                intersects(rect, (area.position.x as i64, area.position.y as i64, area.size.width as i64, area.size.height as i64))
            }) {
                let monitor = window.primary_monitor().ok().flatten().unwrap_or_else(|| monitors[0].clone());
                let area = monitor.work_area();
                window.set_position(tauri::PhysicalPosition::new(area.position.x, area.position.y))?;
                record(window.app_handle(), window.label(), "main_reopen_repositioned", json!({"reason": reason}));
            }
        }
        // A failed screenshot session may leave the main HWND ignoring input.
        let cursor_result = window.set_ignore_cursor_events(false);
        record(window.app_handle(), window.label(), "main_reopen_cursor_input", json!({"reason": reason, "ok": cursor_result.is_ok()}));
        window_action(window, WindowAction::Show, reason)?;
        window_action(window, WindowAction::Focus, reason)
    })();
    record_window_state(window, "main_reopen_after", reason);
    record(window.app_handle(), window.label(), "main_reopen_completed", json!({"reason": reason, "ok": result.is_ok()}));
    result
}

#[tauri::command]
pub fn diagnostic_minimize_window(window: WebviewWindow) -> Result<(), String> {
    window_action(&window, WindowAction::Minimize, "frontend_minimize_control").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn diagnostic_show_window(window: WebviewWindow) -> Result<(), String> {
    window_action(&window, WindowAction::Show, "frontend_show_control").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn diagnostic_hide_window(window: WebviewWindow) -> Result<(), String> {
    window_action(&window, WindowAction::Hide, "frontend_hide_control").map_err(|e| e.to_string())
}

fn heartbeat_is_overdue(health: &RendererHealth) -> bool {
    // Hidden/minimized WebViews throttle JS timers. Do not diagnose a hang
    // from that silence. On showing again allow a fresh grace period.
    if health.native_status != Some((true, false)) || !health.page_visible { return false; }
    health.visible_since.map(|t| t.elapsed() >= HEARTBEAT_GAP).unwrap_or(false)
        && health.last_seen.map(|t| t.elapsed() >= HEARTBEAT_GAP).unwrap_or(false)
}

pub fn init(app: &AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        attach_process_failed(&main);
        let event_app = app.clone();
        main.on_window_event(move |event| {
            let name = match event {
                tauri::WindowEvent::Destroyed => Some("window_destroyed"),
                tauri::WindowEvent::CloseRequested { .. } => Some("window_close_requested"),
                _ => None,
            };
            if let Some(name) = name { record(&event_app, "main", name, json!({"reason": "native_window_event"})); }
        });
        record(app, "main", "diagnostics_started", json!({"logLimitBytes": LOG_LIMIT, "fileCount": 3}));
    }
    let app = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(5));
        let Some(main) = app.get_webview_window("main") else {
            record(&app, "main", "window_missing", json!({"reason": "native_monitor"}));
            break;
        };
        let status = (main.is_visible().unwrap_or(false), main.is_minimized().unwrap_or(false));
        let state = app.state::<DiagnosticState>();
        let mut changed = false;
        let mut gap_ms = None;
        if let Ok(mut health) = state.0.lock() {
            if health.native_status != Some(status) {
                changed = true;
                health.native_status = Some(status);
                health.visible_since = if status == (true, false) { Some(Instant::now()) } else { None };
            }
            if heartbeat_is_overdue(&health) && !health.gap_reported {
                health.gap_reported = true;
                gap_ms = health.last_seen.map(|t| t.elapsed().as_millis() as u64);
            }
        }
        if changed { record(&app, "main", "native_visibility", json!({"visible": status.0, "minimized": status.1, "reason": "observed_native_state"})); }
        if let Some(gap_ms) = gap_ms {
            record(&app, "main", "heartbeat_gap", json!({"gapMs": gap_ms, "classification": "suspected_renderer_stall", "visible": status.0, "minimized": status.1}));
        }
    });
}

#[cfg(target_os = "windows")]
pub fn attach_process_failed(window: &WebviewWindow) {
    use webview2_com::{Microsoft::Web::WebView2::Win32::ICoreWebView2ProcessFailedEventArgs2, ProcessFailedEventHandler};
    use windows_core::Interface;
    let app = window.app_handle().clone();
    let label = window.label().to_string();
    let dispatch_app = app.clone();
    let result = window.with_webview(move |native| {
        let callback_app = app.clone();
        let callback_label = label.clone();
        let attach = || -> webview2_com::Result<()> {
            unsafe {
                let webview = native.controller().CoreWebView2()?;
                let mut token = 0;
                webview.add_ProcessFailed(&ProcessFailedEventHandler::create(Box::new(move |_, args| {
                    if let Some(args) = args {
                        let mut kind = Default::default();
                        let kind = args.ProcessFailedKind(&mut kind).ok().map(|_| kind.0);
                        let mut reason = None;
                        let mut exit_code = None;
                        if let Ok(extended) = args.cast::<ICoreWebView2ProcessFailedEventArgs2>() {
                            let mut value = Default::default();
                            if extended.Reason(&mut value).is_ok() { reason = Some(value.0); }
                            let mut value = 0;
                            if extended.ExitCode(&mut value).is_ok() { exit_code = Some(value); }
                        }
                        if let Some(state) = callback_app.try_state::<DiagnosticState>() {
                            if let Ok(mut health) = state.0.lock() {
                                health.last_process_failure = Some(ProcessFailure { kind, reason, exit_code, observed_at: Instant::now() });
                            }
                        }
                        record(&callback_app, &callback_label, "webview_process_failed", json!({
                            "kind": kind, "reason": reason, "exitCode": exit_code,
                            "classification": match kind { Some(0) => "browser_process_exited", Some(1) => "renderer_process_exited", Some(2) => "renderer_unresponsive", Some(3) => "frame_renderer_exited", Some(4) => "utility_process_exited", Some(5) => "sandbox_helper_exited", Some(6) => "gpu_process_exited", _ => "other_process_failure" },
                        }));
                        if let Some(main) = callback_app.get_webview_window(&callback_label) {
                            record_window_state(&main, "process_failed_window_state", "process_failed_callback");
                        }
                    }
                    Ok(())
                })), &mut token)?;
            }
            Ok(())
        };
        match attach() {
            Ok(()) => record(&app, &label, "process_failed_hook_attached", json!({})),
            Err(_) => record(&app, &label, "process_failed_hook_error", json!({"stage": "add_handler"})),
        }
    });
    if result.is_err() { record(&dispatch_app, window.label(), "process_failed_hook_error", json!({"stage": "dispatch"})); }
}

#[cfg(not(target_os = "windows"))]
pub fn attach_process_failed(_window: &WebviewWindow) {}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reports_exited_renderer_even_if_delayed_heartbeat_arrives() {
        let mut health = RendererHealth { last_seen: Some(Instant::now()), ..Default::default() };
        let observed_at = Instant::now();
        health.last_process_failure = Some(ProcessFailure { kind: Some(1), reason: Some(3), exit_code: Some(-1), observed_at });
        health.last_seen = Some(Instant::now());
        assert_eq!(renderer_status(&health), "renderer_or_browser_exited");
        health.last_process_failure.as_mut().unwrap().kind = Some(2);
        health.last_seen = Some(observed_at - Duration::from_secs(1));
        assert_eq!(renderer_status(&health), "renderer_unresponsive");
        health.last_seen = Some(Instant::now());
        assert_eq!(renderer_status(&health), "heartbeat_observed");
    }
    #[test]
    fn only_repositions_windows_fully_outside_work_areas() {
        let monitor = (-1920, 0, 1920, 1080);
        assert!(intersects((-1500, 80, 980, 740), monitor));
        assert!(intersects((-80, 80, 980, 740), monitor));
        assert!(!intersects((-32000, -32000, 980, 740), monitor));
        assert!(!intersects((0, 80, 980, 740), monitor));
        assert!(!intersects((-1500, 80, 0, 740), monitor));
    }
    #[test]
    fn ignores_hidden_and_minimized_timer_silence_and_grants_show_grace() {
        let old = Instant::now() - Duration::from_secs(120);
        let mut health = RendererHealth { last_seen: Some(old), visible_since: Some(old), page_visible: true, ..Default::default() };
        for status in [(false, false), (true, true)] {
            health.native_status = Some(status);
            assert!(!heartbeat_is_overdue(&health));
        }
        health.native_status = Some((true, false));
        assert!(heartbeat_is_overdue(&health));
        health.page_visible = false;
        assert!(!heartbeat_is_overdue(&health));
        health.page_visible = true;
        health.visible_since = Some(Instant::now());
        assert!(!heartbeat_is_overdue(&health));
    }
    #[test]
    fn rotates_at_fixed_limit_without_unbounded_backups() {
        let directory = std::env::temp_dir().join(format!("inspiration-diag-test-{}", std::process::id()));
        for _ in 0..12 { append_bounded(&directory, b"0123456789\n", 24).unwrap(); }
        let entries: Vec<_> = fs::read_dir(&directory).unwrap().map(|e| e.unwrap().path()).collect();
        assert_eq!(entries.len(), 3);
        assert!(entries.iter().all(|path| fs::metadata(path).unwrap().len() <= 24));
        for path in entries { fs::remove_file(path).unwrap(); }
        fs::remove_dir(directory).unwrap();
    }
}
