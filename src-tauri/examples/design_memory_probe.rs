//! Isolated design-memory settings UI smoke. NEVER imports production main/setup/db.
//! The real commands module is compiled against an app-state-only synthetic DB stub.
//! Run with scripts/run-design-memory-probe.ps1 (Rust 1.98.0 + CommonControls manifest).
#[cfg(not(debug_assertions))]
compile_error!("Design-memory probe is development-only; do not bundle production frontend assets.");

use std::{
    path::PathBuf,
    sync::{atomic::{AtomicI32, AtomicUsize, Ordering}, mpsc, Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{ipc::CapabilityBuilder, Manager, WebviewUrl, WebviewWindowBuilder};

#[path = "../src/commands/design_memory.rs"]
mod design_memory;

const IDENTIFIER: &str = "com.inspirationdrawer.design-memory-probe";
const LABEL: &str = "design-memory-probe";
const MARKER: &str = "design-memory-isolated-probe";
struct ProbeDatabase {
    root: PathBuf,
    file: PathBuf,
    profile: PathBuf,
    run_id: String,
    opens: AtomicUsize,
}
struct ProbeResult(Mutex<mpsc::Sender<serde_json::Value>>);

// Compile the actual backend module with this exact production connection API,
// but no production DB path resolution, migrations, services or configuration.
mod db {
    pub mod connection {
        use tauri::Manager;
        // The parent command module guards SQLite-only drawer lifecycle hooks
        // when production JSON compatibility mode is active. This isolated host
        // creates only synthetic SQLite and never queries app settings/history.
        pub fn is_json_mode_forced(_: &tauri::AppHandle) -> bool { false }
        pub fn open_connection(app: &tauri::AppHandle) -> Result<rusqlite::Connection, String> {
            if app.config().identifier != crate::IDENTIFIER {
                return Err("Probe refused non-isolated app identity".into());
            }
            let state = app.state::<crate::ProbeDatabase>();
            if state.file.parent() != Some(state.root.as_path())
                || state.file.file_name().and_then(|s| s.to_str()) != Some("synthetic-only.sqlite")
                || !state.root.is_absolute()
                || !state.root.file_name().unwrap_or_default().to_string_lossy().starts_with("run-")
                || state.root.parent() != Some(std::env::temp_dir().join("inspiration-drawer-design-memory-probe").as_path()) {
                return Err("Probe synthetic SQLite boundary rejected".into());
            }
            state.opens.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            rusqlite::Connection::open_with_flags(&state.file,
                rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX)
                .map_err(|_| "Could not open this run's pre-created synthetic SQLite".into())
        }
    }
}
pub(crate) fn current_time_millis() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as i64
}

#[tauri::command]
fn design_memory_probe_info(app: tauri::AppHandle) -> serde_json::Value {
    let state = app.state::<ProbeDatabase>();
    serde_json::json!({
        "probe": "design-memory-isolated", "runId": state.run_id,
        "appIdentifier": app.config().identifier, "syntheticOnly": true, "noProductionSetup": true,
        "database": state.file, "profile": state.profile, "freshRecordCount": 0,
        "source": "real DesignMemorySettingsPanel + #[path] real commands/design_memory.rs",
        "jsonCompatibilityMode": db::connection::is_json_mode_forced(&app),
    })
}
#[tauri::command]
fn design_memory_probe_result(app: tauri::AppHandle, result: serde_json::Value) -> Result<(), String> {
    if result["probe"] != "design-memory-isolated" || result["schemaVersion"] != 1
        || result["runId"] != app.state::<ProbeDatabase>().run_id {
        return Err("Probe result identity/schema mismatch".into());
    }
    app.state::<ProbeResult>().0.lock().map_err(|_| "Probe result lock poisoned")?
        .send(result).map_err(|_| "Probe result receiver closed".into())
}
fn audit_database(app: &tauri::AppHandle) -> Result<serde_json::Value, String> {
    let conn = db::connection::open_connection(app)?;
    let integrity: String = conn.query_row("PRAGMA integrity_check", [], |row| row.get(0)).map_err(|e| e.to_string())?;
    let sentinel: String = conn.query_row("SELECT content FROM fixture_originals WHERE id='synthetic-original'", [], |row| row.get(0)).map_err(|e| e.to_string())?;
    let all: i64 = conn.query_row("SELECT COUNT(*) FROM design_memory_records", [], |row| row.get(0)).map_err(|e| e.to_string())?;
    let image: i64 = conn.query_row("SELECT COUNT(*) FROM design_memory_records WHERE kind='drawer-image'", [], |row| row.get(0)).map_err(|e| e.to_string())?;
    let chat: i64 = conn.query_row("SELECT COUNT(*) FROM design_memory_records WHERE kind='chat-design' AND id='synthetic-chat-design-a'", [], |row| row.get(0)).map_err(|e| e.to_string())?;
    let foreign: i64 = conn.query_row("SELECT COUNT(*) FROM design_memory_records WHERE id NOT LIKE 'synthetic-%' OR source_id NOT LIKE 'synthetic-%'", [], |row| row.get(0)).map_err(|e| e.to_string())?;
    let tables = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map_err(|e| e.to_string())?
        .query_map([], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    let only_fixture_tables = tables.iter().all(|name| name.starts_with("design_memory_") || name == "fixture_originals");
    let passed = integrity == "ok" && sentinel == "SYNTHETIC ORIGINAL UNCHANGED" && all == 1 && image == 0 && chat == 1
        && foreign == 0 && only_fixture_tables;
    Ok(serde_json::json!({"passed": passed, "integrityCheck": integrity, "syntheticOriginalUnchanged": sentinel == "SYNTHETIC ORIGINAL UNCHANGED",
        "totalRecords": all, "drawerRecords": image, "retainedChatRecords": chat,
        "nonSyntheticRecords": foreign, "tables": tables, "onlyFixtureTables": only_fixture_tables}))
}
struct Options { frontend: url::Url, timeout: u64, keep_open: bool }
fn options() -> Options {
    let mut options = Options { frontend: "http://127.0.0.1:1465/".parse().unwrap(), timeout: 120, keep_open: false };
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--frontend" => options.frontend = args.next().expect("--frontend value required").parse().expect("valid frontend URL"),
            "--timeout" => options.timeout = args.next().expect("--timeout value required").parse().expect("integer seconds"),
            "--keep-open" => options.keep_open = true,
            _ => panic!("Unknown probe argument: {arg}"),
        }
    }
    assert!(options.frontend.scheme() == "http" && options.frontend.host_str() == Some("127.0.0.1")
        && !matches!(options.frontend.port_or_known_default(), Some(80 | 1420 | 1461 | 1463))
        && options.frontend.path() == "/" && options.frontend.query().is_none() && options.frontend.fragment().is_none()
        && options.frontend.username().is_empty() && options.frontend.password().is_none(),
        "Use a dedicated 127.0.0.1 origin, never production/probe ports 1420/1461/1463");
    assert!((15..=600).contains(&options.timeout), "Timeout must be 15..600 seconds");
    options
}
fn main() {
    let options = options();
    for key in ["WEBVIEW2_USER_DATA_FOLDER", "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "WEBVIEW2_BROWSER_EXECUTABLE_FOLDER"] {
        assert!(std::env::var_os(key).is_none(), "Remove inherited {key} for isolated profile");
    }
    // Verify a dedicated fixture, not production index.html or Vite SPA fallback,
    // before creating SQLite/profile or any visible native window.
    let client = reqwest::blocking::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(10)).build().unwrap();
    let response = client.get(options.frontend.join("scripts/design-memory-probe.html").unwrap()).send()
        .expect("Start the dedicated loopback Vite server first");
    assert!(response.status().is_success() && response.text().unwrap_or_default().contains(MARKER), "Isolated fixture missing or SPA fallback");
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let run_id = format!("run-{}-{nonce}", std::process::id());
    let root = std::env::temp_dir().join("inspiration-drawer-design-memory-probe").join(&run_id);
    std::fs::create_dir_all(&root).expect("Create per-run synthetic temp directory");
    let file = root.join("synthetic-only.sqlite");
    let profile = root.join("webview2-only");
    {
        let conn = rusqlite::Connection::open(&file).expect("Create synthetic SQLite");
        design_memory::ensure_memory_schema(&conn).unwrap();
        conn.execute_batch("CREATE TABLE fixture_originals(id TEXT PRIMARY KEY,content TEXT NOT NULL); INSERT INTO fixture_originals VALUES('synthetic-original','SYNTHETIC ORIGINAL UNCHANGED');").unwrap();
    }
    let mut context = tauri::generate_context!();
    context.config_mut().identifier = IDENTIFIER.into();
    context.config_mut().product_name = Some("Isolated Design Memory Probe".into());
    context.config_mut().app.windows.clear();
    context.config_mut().app.security.asset_protocol.enable = false;
    context.config_mut().plugins.0.clear();
    context.config_mut().build.dev_url = Some(options.frontend.clone());
    let origin = options.frontend.origin().ascii_serialization();
    let (sender, receiver) = mpsc::channel::<serde_json::Value>();
    let exit_code = Arc::new(AtomicI32::new(2));
    let result_exit = Arc::clone(&exit_code);
    println!("DESIGN_MEMORY_PROBE_ISOLATION {}", serde_json::json!({"appIdentifier": IDENTIFIER, "root": root,
        "database": file, "profile": profile, "frontend": options.frontend, "noProductionSetup": true, "syntheticOnly": true}));
    let built = tauri::Builder::default()
        .manage(ProbeDatabase { root: root.clone(), file, profile: profile.clone(), run_id, opens: AtomicUsize::new(0) })
        .manage(ProbeResult(Mutex::new(sender)))
        .invoke_handler(tauri::generate_handler![
            design_memory::design_memory_get_settings,
            design_memory::design_memory_set_enabled,
            design_memory::design_memory_acquire_lease,
            design_memory::design_memory_upsert,
            design_memory::design_memory_recall,
            design_memory::design_memory_list,
            design_memory::design_memory_correct,
            design_memory::design_memory_delete,
            design_memory::design_memory_clear,
            design_memory::design_memory_delete_source,
            design_memory_probe_info, design_memory_probe_result,
        ])
        .setup(move |app| {
            // Unique window label matches no production capability. Only event
            // subscribe/unsubscribe are granted; no FS/shell/provider plugins.
            app.add_capability(CapabilityBuilder::new("design-memory-probe-events").window(LABEL)
                .permission("core:event:allow-listen").permission("core:event:allow-unlisten"))?;
            let window = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("scripts/design-memory-probe.html".into()))
                .title("ISOLATED Design Memory · SYNTHETIC SQLITE ONLY")
                .inner_size(1180.0, 920.0).min_inner_size(880.0, 680.0)
                .visible(true).focused(true).data_directory(profile)
                .on_navigation(move |url| url.origin().ascii_serialization() == origin && url.path() == "/scripts/design-memory-probe.html")
                .build()?;
            let app = app.handle().clone();
            std::thread::spawn(move || {
                let received = receiver.recv_timeout(Duration::from_secs(options.timeout));
                let mut result = received.unwrap_or_else(|error| serde_json::json!({"probe":"design-memory-isolated", "schemaVersion":1,
                    "checksPassed":false,"nativeError":error.to_string(),"note":"Timeout/disconnect is NOT a passing UI test"}));
                let visible = window.is_visible().unwrap_or(false);
                let minimized = window.is_minimized().unwrap_or(true);
                let audit = audit_database(&app).unwrap_or_else(|error| serde_json::json!({"passed":false,"error":error}));
                let state = app.state::<ProbeDatabase>();
                result["nativeHost"] = serde_json::json!({"appIdentifier": IDENTIFIER,"windowLabel": LABEL,
                    "temporaryProfile":true,"syntheticDatabaseOnly":true,"noProductionSetup":true,
                    "visibleAtResult":visible,"minimizedAtResult":minimized,"databaseOpens":state.opens.load(Ordering::Relaxed),
                    "artifactDirectory":state.root,"humanVisualVerification":false});
                let pass = result["checksPassed"] == true && visible && !minimized && audit["passed"] == true;
                result["nativeDatabaseAudit"] = audit;
                result["checksPassed"] = pass.into();
                let json = serde_json::to_string_pretty(&result).unwrap();
                if let Err(error) = std::fs::write(state.root.join("result.json"), &json) {
                    eprintln!("PROBE_RESULT_SAVE_FAILED {error}");
                }
                println!("DESIGN_MEMORY_PROBE_RESULT {}", result);
                println!("DESIGN_MEMORY_PROBE_{}", if pass {"PASS"} else {"FAIL"});
                result_exit.store(if pass {0} else {1}, Ordering::SeqCst);
                if !options.keep_open { std::thread::sleep(Duration::from_millis(1200)); app.exit(if pass {0} else {1}); }
            });
            Ok(())
        }).build(context);
    match built {
        Ok(app) => { app.run_return(|_, _| {}); }
        Err(error) => eprintln!("DESIGN_MEMORY_PROBE_HOST_ERROR {error}"),
    }
    // Keep ONLY this synthetic run's SQLite/profile/result for auditable evidence.
    // No production data directory is located, read, copied, deleted or migrated.
    println!("DESIGN_MEMORY_PROBE_ARTIFACTS {}", root.display());
    std::process::exit(exit_code.load(Ordering::SeqCst));
}
