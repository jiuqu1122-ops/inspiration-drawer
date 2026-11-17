//! Isolated UI checks: synthetic image, no app database, no production commands.
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
#[tauri::command]
fn probe_result(app: tauri::AppHandle, result: serde_json::Value) {
    println!("PROBE_RESULT {}", result);
    let pass = result["checksPassed"] == true;
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(300));
        app.exit(if pass { 0 } else { 1 });
    });
}
fn main() {
    let mut context = tauri::generate_context!();
    context.config_mut().app.windows.clear();
    context.config_mut().build.dev_url = Some("http://127.0.0.1:1461".parse().unwrap());
    context.config_mut().identifier = "com.inspirationdrawer.interaction-repair-probe".into();
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![probe_result])
        .setup(|app| {
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("scripts/drawer-interaction-probe.html".into()))
                .title("Isolated drawer interaction checks")
                .inner_size(960.0, 740.0).focused(false)
                .data_directory(app.path().app_local_data_dir()?.join("probe-webview"))
                .build()?;
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(60));
                handle.exit(2);
            });
            Ok(())
        }).run(context).expect("isolated interaction probe");
}
