//! Opt-in, isolated WebView2 host for the synthetic high-resolution fixture.
//! No production main/lib/setup/plugins/DB/diagnostics are imported or started.
//! rustup run 1.98.0 cargo run --locked --manifest-path src-tauri/Cargo.toml
//!   --example canvas_highres_probe -- --counts 100,250,500
#[cfg(not(debug_assertions))]
compile_error!("This isolated probe is development-only; never use production bundled frontend assets.");
use std::{
    path::PathBuf,
    sync::{atomic::{AtomicI32, Ordering}, mpsc, Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

const IDENTIFIER: &str = "com.inspirationdrawer.canvas-highres-probe";
const LABEL: &str = "canvas-highres-probe";
struct ProbeState(Mutex<mpsc::Sender<serde_json::Value>>);

#[tauri::command]
fn canvas_highres_probe_result(app: tauri::AppHandle, result: serde_json::Value) {
    // Only the isolated fixture can meaningfully supply this schema. This host
    // exposes no production commands, filesystem commands or plugin APIs.
    if result["probe"] != "canvas-highres-isolated" || result["schemaVersion"] != 1 {
        return;
    }
    let _ = app.state::<ProbeState>().0.lock().unwrap().send(result);
}

struct Options {
    frontend: url::Url,
    query: Vec<(String, String)>,
    timeout: u64,
    keep_open: bool,
}
fn options() -> Options {
    let mut args = std::env::args().skip(1);
    let mut options = Options { frontend: "http://127.0.0.1:1463".parse().unwrap(),
        query: vec![("autorun".into(), "1".into())], timeout: 1200, keep_open: false };
    while let Some(arg) = args.next() {
        if arg == "--keep-open" { options.keep_open = true; continue; }
        let value = args.next().unwrap_or_else(|| panic!("Missing value for {arg}"));
        match arg.as_str() {
            "--frontend" => options.frontend = value.parse().expect("Invalid loopback frontend URL"),
            "--counts" => {
                assert!(value.split(',').all(|n| matches!(n, "100" | "250" | "500")), "Counts must be 100,250,500");
                options.query.push(("counts".into(), value));
            }
            "--size" => options.query.push(("size".into(), value)),
            "--transform" => {
                assert!(value == "stable" || value == "legacy", "Transform must be stable or legacy");
                options.query.push(("transform".into(), value));
            }
            "--cull" => {
                assert!(value == "viewport" || value == "all", "Cull must be viewport or all");
                options.query.push(("cull".into(), value));
            }
            "--viewport" => {
                assert!(matches!(value.as_str(), "live" | "frozen" | "scheduled"), "Viewport adapter must be live, frozen or scheduled");
                options.query.push(("viewport".into(), value));
            }
            "--zoom-out" => options.query.push(("zoomOut".into(), value)),
            "--burst-ms" => options.query.push(("burstMs".into(), value)),
            "--idle-ms" => options.query.push(("idleMs".into(), value)),
            "--reveal-grace-ms" => options.query.push(("revealGraceMs".into(), value)),
            "--sample-every" => options.query.push(("sampleEvery".into(), value)),
            "--timeout-secs" => options.timeout = value.parse().expect("Invalid timeout seconds"),
            _ => panic!("Unknown option: {arg}"),
        }
    }
    assert!(options.frontend.scheme() == "http"
        && matches!(options.frontend.host_str(), Some("127.0.0.1" | "localhost" | "::1"))
        && !matches!(options.frontend.port_or_known_default(), Some(1420 | 1461))
        && options.frontend.path() == "/" && options.frontend.query().is_none()
        && options.frontend.username().is_empty() && options.frontend.password().is_none(),
        "Use a DEDICATED loopback origin, not production :1420 or the existing probe :1461");
    options
}
fn cleanup(root: &PathBuf, base: &PathBuf) {
    // Only this run's freshly generated, absolute temp directory can be removed.
    if !root.is_absolute() || root.parent() != Some(base.as_path())
        || !root.file_name().unwrap_or_default().to_string_lossy().starts_with("run-")
        || std::fs::symlink_metadata(root).map(|m| m.file_type().is_symlink()).unwrap_or(true) {
        eprintln!("PROBE_PROFILE_CLEANUP_SKIPPED unsafe target"); return;
    }
    for _ in 0..8 {
        match std::fs::remove_dir_all(root) {
            Ok(()) => { println!("PROBE_PROFILE_REMOVED"); return; }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return,
            Err(_) => std::thread::sleep(Duration::from_millis(400)),
        }
    }
    eprintln!("PROBE_PROFILE_RETAINED WebView2 still holds files: {}", root.display());
}
fn main() {
    let options = options();
    // Inherited WebView2 overrides can defeat per-run profile isolation or add
    // debugging/feature flags that make benchmark comparisons invalid. Refuse
    // them, without printing potentially private values or changing the host.
    for key in ["WEBVIEW2_USER_DATA_FOLDER", "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "WEBVIEW2_BROWSER_EXECUTABLE_FOLDER"] {
        assert!(std::env::var_os(key).is_none(), "Remove inherited {key} for this isolated probe process");
    }
    // Refuse a missing fixture / SPA fallback BEFORE creating any webview.
    // No proxy or redirects: this request can reach only the validated loopback
    // Vite server, never a remote URL or a production asset/file protocol.
    let fixture_check = options.frontend.join("scripts/canvas-highres-probe.html").unwrap();
    let client = reqwest::blocking::Client::builder().no_proxy()
        .redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(10))
        .build().expect("Create loopback-only fixture check");
    let response = client.get(fixture_check).send().expect("Start the dedicated loopback Vite server first");
    assert!(response.status().is_success(), "Isolated fixture HTTP failure");
    assert!(response.text().unwrap_or_default().contains("canvas-highres-isolated-probe"),
        "Refusing missing probe or production SPA fallback");
    let base = std::env::temp_dir().join("inspiration-drawer-canvas-highres-probe");
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let root = base.join(format!("run-{}-{nonce}", std::process::id()));
    std::fs::create_dir_all(&root).expect("Create isolated probe temp directory");
    let profile = root.join("webview2-only");
    let mut context = tauri::generate_context!();
    context.config_mut().identifier = IDENTIFIER.into();
    context.config_mut().product_name = Some("Isolated Canvas Highres Probe".into());
    context.config_mut().app.windows.clear();
    context.config_mut().app.security.asset_protocol.enable = false;
    context.config_mut().plugins.0.clear();
    context.config_mut().build.dev_url = Some(options.frontend.clone());
    // No production protocol-asset, updater, single-instance, tray, filesystem,
    // shortcuts, renderer diagnostics, cache initialisation or database setup.
    let mut relative = url::Url::parse("http://fixture.invalid/scripts/canvas-highres-probe.html").unwrap();
    relative.query_pairs_mut().extend_pairs(&options.query);
    let fixture_path = format!("{}?{}", relative.path().trim_start_matches('/'), relative.query().unwrap());
    let origin = options.frontend.origin().ascii_serialization();
    let (sender, receiver) = mpsc::channel::<serde_json::Value>();
    let exit_code = Arc::new(AtomicI32::new(2));
    let result_exit = Arc::clone(&exit_code);
    println!("PROBE_ISOLATION {}", serde_json::json!({"appIdentifier": IDENTIFIER,
        "profile": profile, "temporaryProfile": true, "noProductionDatabase": true,
        "frontend": options.frontend, "fixture": "scripts/canvas-highres-probe.html"}));
    let built = tauri::Builder::default().manage(ProbeState(Mutex::new(sender)))
        .invoke_handler(tauri::generate_handler![canvas_highres_probe_result])
        .setup(move |app| {
            let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App(fixture_path.into()))
                .title("ISOLATED high-resolution canvas probe · synthetic images")
                .inner_size(1280.0, 900.0).min_inner_size(900.0, 700.0)
                .visible(true).focused(true).data_directory(profile)
                .on_navigation(move |url| url.origin().ascii_serialization() == origin
                    && url.path() == "/scripts/canvas-highres-probe.html")
                .build()?;
            let app = app.handle().clone();
            std::thread::spawn(move || {
                let result = receiver.recv_timeout(Duration::from_secs(options.timeout));
                match result {
                    Ok(mut result) => {
                        let visible = window.is_visible().unwrap_or(false);
                        let minimized = window.is_minimized().unwrap_or(true);
                        result["nativeHost"] = serde_json::json!({"appIdentifier": IDENTIFIER,
                            "temporaryProfile": true, "noProductionSetup": true,
                            "visibleAtResult": visible, "minimizedAtResult": minimized});
                        let pass = result["checksPassed"] == true && visible && !minimized;
                        result["checksPassed"] = pass.into();
                        println!("CANVAS_HIGHRES_PROBE_RESULT {}", result);
                        println!("CANVAS_HIGHRES_PROBE_{}", if pass { "PASS" } else { "FAIL" });
                        result_exit.store(if pass { 0 } else { 1 }, Ordering::SeqCst);
                    }
                    Err(error) => {
                        println!("CANVAS_HIGHRES_PROBE_RESULT {}", serde_json::json!({"probe": "canvas-highres-isolated",
                            "checksPassed": false, "nativeError": error.to_string(),
                            "note": "Timeout/disconnect is not a successful performance result"}));
                        result_exit.store(2, Ordering::SeqCst);
                    }
                }
                if !options.keep_open { app.exit(result_exit.load(Ordering::SeqCst)); }
            });
            Ok(())
        }).build(context);
    match built {
        // App::run exits the process itself, bypassing cleanup below. run_return
        // releases the event loop first so this run's temporary profile can be
        // removed and the precise benchmark exit status retained.
        Ok(app) => { app.run_return(|_, _| {}); },
        Err(error) => eprintln!("PROBE_HOST_ERROR {error}"),
    }
    cleanup(&root, &base);
    std::process::exit(exit_code.load(Ordering::SeqCst));
}
