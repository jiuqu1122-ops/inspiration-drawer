use std::{fs, path::PathBuf};

fn main() {
    // Tauri 2.10 defaults to allowing unmanifested custom commands, even for
    // foreign frames. HTML previews must NEVER inherit the parent's native IPC.
    // Keep the local allow-list in sync with the actual production registration
    // rather than maintaining a second handwritten list that can drift.
    println!("cargo:rerun-if-changed=src/main.rs");
    let source = fs::read_to_string("src/main.rs").expect("read app command registry");
    let handler = source.split(".invoke_handler(tauri::generate_handler![").nth(1)
        .and_then(|value| value.split("])").next()).expect("find app command registry");
    let mut commands: Vec<String> = handler.split(',').map(str::trim).filter(|value| !value.is_empty())
        .map(|value| value.rsplit("::").next().unwrap().to_string()).collect();
    assert!(commands.len() > 100, "app command registry was not parsed completely");
    assert!(commands.iter().all(|name| name.chars().all(|character| character.is_ascii_alphanumeric() || character == '_')),
        "unexpected syntax in app command registry; update ACL generation before building");
    // Existing isolated examples expose harmless test-only command handlers.
    // Include those only in debug manifests so security hardening does not
    // disable the project's native regression fixtures.
    if std::env::var("PROFILE").as_deref() == Ok("debug") {
        println!("cargo:rerun-if-changed=examples");
        for entry in fs::read_dir("examples").expect("read isolated examples").flatten() {
            if entry.path().extension().and_then(|value| value.to_str()) != Some("rs") { continue; }
            let example = fs::read_to_string(entry.path()).expect("read example commands");
            for definition in example.split("#[tauri::command]").skip(1) {
                if let Some(name) = definition.split("fn ").nth(1).and_then(|value| value.split('(').next()) {
                    let name = name.trim();
                    assert!(name.chars().all(|character| character.is_ascii_alphanumeric() || character == '_'));
                    commands.push(name.to_string());
                }
            }
        }
    }
    commands.sort_unstable(); commands.dedup();
    let content = format!("# Generated from src/main.rs by build.rs. Local origins only.\n[[permission]]\nidentifier = \"local-app-commands\"\ndescription = \"Allow registered app commands from trusted local windows, never remote/sandboxed HTML.\"\ncommands.allow = [{}]\n",
        commands.iter().map(|name| format!("{name:?}")).collect::<Vec<_>>().join(", "));
    let directory = PathBuf::from(std::env::var_os("OUT_DIR").expect("build output directory")).join("app-permissions");
    let path = directory.join("local-app-commands.toml");
    fs::create_dir_all(path.parent().unwrap()).expect("create app ACL directory");
    if fs::read_to_string(&path).ok().as_deref() != Some(content.as_str()) {
        fs::write(&path, content).expect("write local app command ACL");
    }
    let pattern: &'static str = Box::leak(directory.join("*.toml").to_string_lossy().replace('\\', "/").into_boxed_str());
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().permissions_path_pattern(pattern)
    )).expect("build local-only app command permissions");
}
