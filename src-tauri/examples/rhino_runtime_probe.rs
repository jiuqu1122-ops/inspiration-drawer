//! Isolated signed-package -> native verifier -> WebView asset ESM -> host facade probe.
#[cfg(not(debug_assertions))]
compile_error!("Rhino runtime probe is development-only");
#[path = "../src/rhino_installer.rs"] mod rhino_installer;
#[path = "../src/rhino_updates.rs"] mod rhino_updates;
use std::path::PathBuf;
use tauri::{WebviewUrl, WebviewWindowBuilder};
struct Probe { output: PathBuf }
#[tauri::command]
fn finish_runtime_probe(app: tauri::AppHandle, state: tauri::State<Probe>, mut report: serde_json::Value) {
    report["nativeSignatureAndAssetVerification"] = true.into();
    let passed = report["pass"] == true;
    fs_write(&state.output, &report);
    println!("RHINO_RUNTIME_PROBE {}", report); app.exit(if passed {0} else {1});
}
fn fs_write(path: &std::path::Path, value: &serde_json::Value) {
    std::fs::write(path, serde_json::to_vec_pretty(value).unwrap()).unwrap();
}
fn main() {
    let release = PathBuf::from(std::env::args().nth(1).expect("release directory"));
    let output = PathBuf::from(std::env::args().nth(2).expect("result JSON"));
    let cache = std::env::temp_dir().join(format!("rhino-runtime-webview-{}", std::process::id()));
    // This affects this disposable probe process only, never the user's app.
    std::env::set_var("LOCALAPPDATA", &cache);
    rhino_updates::prepare_runtime_probe(&release, &cache.join("InspirationDrawer/RhinoUpdates")).expect("Verify signed independent release");
    let mut context = tauri::generate_context!();
    context.config_mut().app.windows.clear();
    context.config_mut().build.dev_url = Some("http://127.0.0.1:1469".parse().unwrap());
    context.config_mut().identifier = format!("com.inspirationdrawer.rhino-runtime-probe-{}", std::process::id());
    context.config_mut().plugins.0.clear();
    tauri::Builder::default().manage(Probe { output })
        .invoke_handler(tauri::generate_handler![rhino_updates::rhino_runtime_location, finish_runtime_probe]).setup(move |app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("scripts/rhino-runtime-update-probe.html".into()))
                .title("Isolated Rhino module verification").inner_size(600.0, 400.0).visible(false)
                .data_directory(cache.join("webview")).build()?;
            let handle = app.handle().clone();
            std::thread::spawn(move || { std::thread::sleep(std::time::Duration::from_secs(45)); handle.exit(2); });
            Ok(())
        }).run(context).expect("Rhino runtime probe");
}
