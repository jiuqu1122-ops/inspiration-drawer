//! Isolated snapshot rendering fixture. No production setup/database or AI commands.
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
#[tauri::command]
fn probe_result(app: tauri::AppHandle, result: serde_json::Value) {
    println!("SNAPSHOT_PROBE_RESULT {}",result);
    let code=if result["checksPassed"]==true {0} else {1};
    std::thread::spawn(move||{std::thread::sleep(std::time::Duration::from_millis(300));app.exit(code);});
}
fn main(){
    let mut context=tauri::generate_context!();
    context.config_mut().app.windows.clear();
    context.config_mut().build.dev_url=Some("http://127.0.0.1:1461".parse().unwrap());
    context.config_mut().identifier="com.inspirationdrawer.snapshot-isolated-probe".into();
    context.config_mut().app.security.asset_protocol.enable=false;
    context.config_mut().plugins.0.clear();
    tauri::Builder::default().invoke_handler(tauri::generate_handler![probe_result]).setup(|app|{
        WebviewWindowBuilder::new(app,"main",WebviewUrl::App("scripts/canvas-snapshot-probe.html".into()))
            .title("ISOLATED synthetic snapshot canvas").inner_size(1100.0,900.0).focused(false).visible(true)
            .data_directory(app.path().app_local_data_dir()?.join(format!("probe-{}",std::process::id()))).build()?;
        let handle=app.handle().clone();std::thread::spawn(move||{std::thread::sleep(std::time::Duration::from_secs(100));handle.exit(2);});Ok(())
    }).run(context).expect("Isolated snapshot fixture");
}
