//! Development-only, isolated WebView2 + native physical-coordinate validation.
//! Never imports production setup, repositories, plugins or App.
#[cfg(not(debug_assertions))]
compile_error!("This fixture must not run against bundled production assets.");
#[cfg(not(target_os = "windows"))]
compile_error!("This fixture specifically validates Windows GetWindowRect.");
#[path = "../src/drawer_bounds.rs"]
mod drawer_bounds;
use std::{path::PathBuf, sync::{mpsc, Mutex}, time::{Duration, SystemTime, UNIX_EPOCH}};
use tauri::{Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use serde_json::{json, Value};
const IDENTIFIER: &str = "com.inspirationdrawer.prompt-resize-anchor-probe";
const LABEL: &str = "prompt-resize-anchor-probe";
struct Results(Mutex<mpsc::Sender<Value>>);

fn read_rect(window: &WebviewWindow) -> Result<[i32; 4], String> {
    use winapi::{shared::windef::RECT, um::winuser::GetWindowRect};
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as winapi::shared::windef::HWND;
    let mut rect = RECT { left: 0, top: 0, right: 0, bottom: 0 };
    if unsafe { GetWindowRect(hwnd, &mut rect) } == 0 { return Err(std::io::Error::last_os_error().to_string()); }
    Ok([rect.left, rect.top, rect.right, rect.bottom])
}
fn on_ui<T: Send + 'static>(window: &WebviewWindow, task: impl FnOnce(WebviewWindow) -> Result<T, String> + Send + 'static) -> Result<T, String> {
    let (tx, rx) = mpsc::channel();
    let target = window.clone();
    window.run_on_main_thread(move || { let _ = tx.send(task(target)); }).map_err(|e| e.to_string())?;
    rx.recv_timeout(Duration::from_secs(8)).map_err(|e| e.to_string())?
}
#[tauri::command]
async fn prompt_resize_probe_anchor(window: WebviewWindow) -> Result<Value, String> {
    if window.label() != LABEL { return Err("Only isolated fixture window may move".into()); }
    tauri::async_runtime::spawn_blocking(move || {
        let original = on_ui(&window, |w| read_rect(&w))?;
        let dpi = on_ui(&window, |w| w.scale_factor().map_err(|e| e.to_string()))?;
        let mut samples = vec![];
        let sizes = [(780, 620), (941, 681), (1103, 743), (1001, 703), (807, 629), (521, 477), (807, 629), (1001, 703), (780, 620)];
        // Includes synthetic fractional-DPI size requests and negative desktop coordinates.
        // This does NOT change the physical monitor's DPI or simulate the App pointer scheduler.
        for (group, (right, top, size_factor)) in [
            (original[2], original[1], 1.0_f64),
            (original[2], original[1], 1.25),
            (original[2], original[1], 1.5),
            (0, -125, 1.0),
            (-250, -40, 1.0),
        ].into_iter().enumerate() {
            for cycle in 0..3 {
                for &(width, height) in &sizes {
                    let width = (width as f64 * size_factor).round() as i32;
                    let height = (height as f64 * size_factor).round() as i32;
                    let rect = drawer_bounds::anchored_rect(right, top, width, height)?;
                    let actual = on_ui(&window, move |w| {
                        drawer_bounds::apply(&w, rect)?;
                        read_rect(&w)
                    })?;
                    std::thread::sleep(Duration::from_millis(8));
                    let settled = on_ui(&window, |w| read_rect(&w))?;
                    let matches = |r: [i32; 4]| r[0] == right - width && r[1] == top && r[2] == right
                        && r[3] == top + height && r[2] - r[0] == width;
                    samples.push(json!({ "group": group, "cycle": cycle, "rightAnchorPx": right, "topAnchorPx": top,
                        "syntheticSizeFactor": size_factor, "widthPx": width, "heightPx": height,
                        "immediateRect": actual, "settledRect": settled,
                        "rightErrorPx": actual[2] - right, "topErrorPx": actual[1] - top,
                        "settledRightErrorPx": settled[2] - right, "settledTopErrorPx": settled[1] - top,
                        "passed": matches(actual) && matches(settled) }));
                }
            }
        }
        let restored = on_ui(&window, move |w| {
            drawer_bounds::apply(&w, drawer_bounds::AnchoredRect { x: original[0], y: original[1],
                width: original[2] - original[0], height: original[3] - original[1] })?;
            read_rect(&w)
        })?;
        let invalid_sizes_rejected = drawer_bounds::anchored_rect(1000, 0, 0, 100).is_err()
            && drawer_bounds::anchored_rect(1000, 0, 100, 32769).is_err()
            && drawer_bounds::anchored_rect(i32::MIN, 0, 100, 100).is_err()
            && drawer_bounds::anchored_rect(1000, i32::MAX, 100, 100).is_err();
        let all = samples.len() == 135 && samples.iter().all(|s| s["passed"] == true)
            && original == restored && invalid_sizes_rejected;
        Ok(json!({ "checksPassed": all, "method": "production atomic drawer_bounds::apply + immediate and settled GetWindowRect",
            "osScaleFactor": dpi, "originalRect": original, "restoredRect": restored,
            "invalidSizesRejected": invalid_sizes_rejected, "samples": samples,
            "onlyWindowMoved": LABEL, "noAppSchedulerOrHumanDragTest": true }))
    }).await.map_err(|e| e.to_string())?
}
#[tauri::command]
fn prompt_resize_probe_result(window: WebviewWindow, app: tauri::AppHandle, result: Value) -> Result<(), String> {
    if window.label() != LABEL || result["probe"] != "prompt-resize-isolated" || result["schemaVersion"] != 1 {
        return Err("Incorrect isolated fixture result".into());
    }
    app.state::<Results>().0.lock().map_err(|e| e.to_string())?.send(result).map_err(|e| e.to_string())
}
fn main() {
    let mut frontend = "http://127.0.0.1:1461".to_owned();
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let temp = std::env::temp_dir();
    let mut output = temp.join(format!("prompt-resize-probe-{}-{nonce}", std::process::id()));
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        let value = args.next().unwrap_or_else(|| panic!("Missing value for {arg}"));
        match arg.as_str() { "--frontend" => frontend = value, "--output-dir" => output = PathBuf::from(value), _ => panic!("Unknown argument {arg}") }
    }
    let base: url::Url = frontend.parse().expect("Loopback fixture URL");
    assert!(base.scheme() == "http" && base.host_str() == Some("127.0.0.1") && base.path() == "/"
        && base.port().is_some() && base.port() != Some(1420) && base.query().is_none()
        && base.username().is_empty() && base.password().is_none(), "Refusing production/non-loopback origin");
    assert!(output.is_absolute() && output.parent() == Some(temp.as_path())
        && output.file_name().unwrap().to_string_lossy().starts_with("prompt-resize-probe-"), "Output must be a new direct temp child");
    std::fs::create_dir_all(&output).expect("Create probe outputs");
    let profile = output.join("webview2-profile");
    assert!(!profile.exists(), "Refusing an existing WebView2 profile");
    let client = reqwest::blocking::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(10)).build().unwrap();
    let response = client.get(base.join("scripts/prompt-resize-probe.html").unwrap()).send().expect("Fixture HTTP preflight");
    assert!(response.status().is_success() && response.text().unwrap_or_default().contains("prompt-resize-isolated-v1"),
        "Refusing missing fixture/production SPA fallback");
    let mut context = tauri::generate_context!();
    context.config_mut().identifier = IDENTIFIER.into();
    context.config_mut().product_name = Some("Isolated Prompt Resize Anchor Probe".into());
    context.config_mut().app.windows.clear();
    context.config_mut().app.security.asset_protocol.enable = false;
    context.config_mut().plugins.0.clear();
    context.config_mut().build.dev_url = Some(base.clone());
    let (tx, rx) = mpsc::channel();
    let (exit_tx, exit_rx) = mpsc::channel();
    let origin = base.origin().ascii_serialization();
    println!("PROBE_ISOLATION {}", json!({ "identifier": IDENTIFIER, "label": LABEL, "profile": profile,
        "outputs": output, "noProductionDatabase": true, "noProductionSetup": true }));
    let app = tauri::Builder::default().manage(Results(Mutex::new(tx)))
        .invoke_handler(tauri::generate_handler![prompt_resize_probe_anchor, prompt_resize_probe_result])
        .setup(move |app| {
            let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("scripts/prompt-resize-probe.html".into()))
                .title("ISOLATED synthetic prompt resize + physical anchor checks")
                .inner_size(1200.0, 900.0).min_inner_size(1.0, 1.0).decorations(false)
                .resizable(false).shadow(false).focused(false).visible(true)
                .data_directory(profile)
                .on_navigation(move |url| url.origin().ascii_serialization() == origin && url.path() == "/scripts/prompt-resize-probe.html")
                .build()?;
            let app = app.handle().clone();
            std::thread::spawn(move || {
                let mut result = rx.recv_timeout(Duration::from_secs(240)).unwrap_or_else(|error| json!({
                    "schemaVersion": 1, "probe": "prompt-resize-isolated", "checksPassed": false,
                    "fatal": format!("Native timeout/disconnect: {error}"), "notAPassingMeasurement": true }));
                result["nativeHost"] = json!({ "identifier": IDENTIFIER, "windowLabel": LABEL,
                    "visibleAtResult": window.is_visible().unwrap_or(false), "temporaryProfileOnly": true,
                    "noProductionSetup": true, "noProductionDatabase": true, "profileRetainedInTempForDiagnostics": true });
                let code = if result["checksPassed"] == true { 0 } else { 1 };
                if let Err(error) = std::fs::write(output.join("result.json"), serde_json::to_vec_pretty(&result).unwrap()) {
                    eprintln!("RESULT_WRITE_FAILED {error}");
                }
                println!("PROMPT_RESIZE_PROBE_RESULT {result}");
                println!("PROMPT_RESIZE_PROBE_{}", if code == 0 { "PASS" } else { "FAIL" });
                let _ = exit_tx.send(code);
                // No process/window enumeration or other-user-window cleanup.
                app.exit(code);
            });
            Ok(())
        }).build(context).expect("Build isolated native fixture");
    app.run(|_, _| {});
    std::process::exit(exit_rx.try_recv().unwrap_or(2));
}
