// Local diagnostic for the packaged installer. Read-only unless --install is explicitly passed.
#[path = "../src/rhino_installer.rs"]
mod rhino_installer;
fn main() {
    let install = std::env::args().any(|arg| arg == "--install");
    let result = tauri::async_runtime::block_on(async {
        if install {
            rhino_installer::install_rhino_plugin().await.and_then(|v| serde_json::to_string_pretty(&v).map_err(|e| e.to_string()))
        } else {
            rhino_installer::rhino_plugin_status().await.and_then(|v| serde_json::to_string_pretty(&v).map_err(|e| e.to_string()))
        }
    });
    match result { Ok(text) => println!("{text}"), Err(error) => { eprintln!("{error}"); std::process::exit(1); } }
}
