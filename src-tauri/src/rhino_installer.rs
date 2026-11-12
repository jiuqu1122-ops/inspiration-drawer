//! Offline, per-user Rhino 8/9 installation. Payloads are embedded in both the
//! installer and portable EXE: never depend on the developer's desktop or SDK.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

#[path = "rhino_package_conflicts.rs"]
mod package_conflicts;

static INSTALL_LOCK: Mutex<()> = Mutex::new(());
const PLUGIN: &str = "InspirationDrawer.Rhino.rhp";
const TOOLBAR: &str = "InspirationDrawer.Rhino.rui";
const TOOLBAR_ICON: &str = "InspirationDrawer.Rhino.svg";
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RhinoInstallation {
    pub major_version: u8,
    pub exe_path: String,
    pub running: bool,
    pub plugin_path: Option<String>,
    #[serde(default)]
    pub installed: bool,
    #[serde(default)]
    pub conflicting_package_paths: Vec<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RhinoInstallResult {
    pub installed: Vec<RhinoInstallation>,
    pub restart_required: bool,
    pub repaired_conflicts: usize,
    pub conflict_backups: Vec<String>,
}

fn payload(version: u8) -> Result<[(&'static str, &'static [u8]); 5], String> {
    match version {
        8 => Ok([
            (
                PLUGIN,
                include_bytes!("../resources/rhino/8/InspirationDrawer.Rhino.rhp"),
            ),
            (
                "InspirationDrawer.Rhino.deps.json",
                include_bytes!("../resources/rhino/8/InspirationDrawer.Rhino.deps.json"),
            ),
            (
                "InspirationDrawer.Rhino.runtimeconfig.json",
                include_bytes!("../resources/rhino/8/InspirationDrawer.Rhino.runtimeconfig.json"),
            ),
            (
                TOOLBAR,
                include_bytes!("../resources/rhino/8/InspirationDrawer.Rhino.rui"),
            ),
            (
                TOOLBAR_ICON,
                include_bytes!("../resources/rhino/8/InspirationDrawer.Rhino.svg"),
            ),
        ]),
        9 => Ok([
            (
                PLUGIN,
                include_bytes!("../resources/rhino/9/InspirationDrawer.Rhino.rhp"),
            ),
            (
                "InspirationDrawer.Rhino.deps.json",
                include_bytes!("../resources/rhino/9/InspirationDrawer.Rhino.deps.json"),
            ),
            (
                "InspirationDrawer.Rhino.runtimeconfig.json",
                include_bytes!("../resources/rhino/9/InspirationDrawer.Rhino.runtimeconfig.json"),
            ),
            (
                TOOLBAR,
                include_bytes!("../resources/rhino/9/InspirationDrawer.Rhino.rui"),
            ),
            (
                TOOLBAR_ICON,
                include_bytes!("../resources/rhino/9/InspirationDrawer.Rhino.svg"),
            ),
        ]),
        _ => Err("Only Rhino 8 and Rhino 9 are supported.".into()),
    }
}

// Immutable content-addressed directories prevent replacing files loaded in Rhino.
fn prepare_payload(root: &Path, version: u8) -> Result<PathBuf, String> {
    let files = payload(version)?;
    let mut hash = Sha256::new();
    for (name, bytes) in files {
        hash.update(name.as_bytes());
        hash.update(bytes);
    }
    let digest = hex::encode(hash.finalize());
    let parent = root.join(version.to_string());
    let target = parent.join(&digest[..20]);
    fs::create_dir_all(&parent).map_err(|e| e.to_string())?;
    if !target.exists() {
        let staging = parent.join(format!(
            ".staging-{}-{:x}",
            std::process::id(),
            rand::random::<u64>()
        ));
        fs::create_dir(&staging).map_err(|e| e.to_string())?;
        for (name, bytes) in files {
            fs::write(staging.join(name), bytes).map_err(|e| e.to_string())?;
        }
        fs::rename(&staging, &target).map_err(|e| e.to_string())?;
    }
    for (name, bytes) in files {
        if fs::read(target.join(name)).map_err(|e| e.to_string())? != bytes {
            return Err("The installed Rhino payload failed its integrity check; no registration was changed.".into());
        }
    }
    Ok(target.join(PLUGIN))
}

#[cfg(windows)]
fn run_powershell(script: &str, env: &[(&str, &std::ffi::OsStr)]) -> Result<String, String> {
    use base64::Engine;
    use std::os::windows::process::CommandExt;
    let bytes: Vec<u8> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    let system = std::env::var_os("SystemRoot").ok_or("Windows SystemRoot is missing")?;
    let mut command = std::process::Command::new(
        PathBuf::from(system).join("System32/WindowsPowerShell/v1.0/powershell.exe"),
    );
    command.args([
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        &encoded,
    ]);
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    for (key, value) in env {
        command.env(key, value);
    }
    let output = command.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .trim_start_matches('\u{feff}')
        .trim()
        .to_string())
}

fn package_directory(version: u8) -> Result<PathBuf, String> {
    Ok(PathBuf::from(std::env::var_os("APPDATA").ok_or("APPDATA is missing")?)
        .join("McNeel").join("Rhinoceros").join("packages").join(format!("{version}.0")))
}

#[cfg(windows)]
fn detect() -> Result<Vec<RhinoInstallation>, String> {
    let text = run_powershell(include_str!("rhino_installer_detect.ps1"), &[])?;
    let mut versions: Vec<RhinoInstallation> = serde_json::from_str(&text)
        .map_err(|e| format!("Could not read Rhino installation status: {e}"))?;
    for item in &mut versions {
        item.conflicting_package_paths = package_conflicts::find_legacy_packages(&package_directory(item.major_version)?)?
            .into_iter().map(|path| path.to_string_lossy().into_owned()).collect();
        let files = payload(item.major_version)?;
        item.installed = item.plugin_path.as_ref().is_some_and(|p| {
            let dir = Path::new(p).parent();
            dir.is_some_and(|dir| {
                files
                    .iter()
                    .all(|(name, bytes)| fs::read(dir.join(name)).is_ok_and(|v| v == *bytes))
            })
        });
    }
    Ok(versions)
}
#[cfg(not(windows))]
fn detect() -> Result<Vec<RhinoInstallation>, String> {
    Err("Rhino plugin installation currently supports Windows only.".into())
}

fn install() -> Result<RhinoInstallResult, String> {
    let _lock = INSTALL_LOCK.lock().map_err(|_| "Rhino installer is busy")?;
    let versions = detect()?;
    if versions.is_empty() {
        return Err("Rhino 8 or Rhino 9 was not found. Install Rhino first, then refresh.".into());
    }
    if versions.iter().any(|item| item.running && !item.conflicting_package_paths.is_empty()) {
        return Err("检测到旧版 YAK 插件与一键安装版使用相同 ID。请先保存工程并完全退出对应 Rhino，再点击一键安装 / 更新。旧包会备份后移出扫描目录，不会删除。".into());
    }
    let root = PathBuf::from(std::env::var_os("LOCALAPPDATA").ok_or("LOCALAPPDATA is missing")?)
        .join("InspirationDrawer")
        .join("RhinoPlugin");
    for item in &versions {
        let plugin_path = prepare_payload(&root, item.major_version)?;
        #[cfg(windows)]
        {
            let version = item.major_version.to_string();
            // All script text is constant. No user path is interpolated into shell commands.
            run_powershell(
                include_str!("rhino_installer_register.ps1"),
                &[
                    ("DRAWER_RHINO_VERSION", std::ffi::OsStr::new(&version)),
                    ("DRAWER_RHINO_PLUGIN", plugin_path.as_os_str()),
                ],
            )?;
        }
        #[cfg(not(windows))]
        let _ = plugin_path;
    }
    let mut backups = Vec::new();
    let backup_root = root.parent().ok_or("Missing backup parent")?.join("RhinoPluginBackups");
    for item in &versions {
        let migrated = package_conflicts::backup_legacy_packages(&package_directory(item.major_version)?, &backup_root.join(item.major_version.to_string()))?;
        backups.extend(migrated.into_iter().map(|item| item.backup_path.to_string_lossy().into_owned()));
    }
    let installed = detect()?;
    if installed.iter().any(|item| !item.installed || !item.conflicting_package_paths.is_empty()) {
        return Err("Rhino registration verification failed. Existing models and conversations were not changed.".into());
    }
    Ok(RhinoInstallResult {
        restart_required: installed.iter().any(|v| v.running),
        repaired_conflicts: backups.len(),
        conflict_backups: backups,
        installed,
    })
}

#[tauri::command]
pub async fn rhino_plugin_status() -> Result<Vec<RhinoInstallation>, String> {
    tauri::async_runtime::spawn_blocking(detect)
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn install_rhino_plugin() -> Result<RhinoInstallResult, String> {
    tauri::async_runtime::spawn_blocking(install)
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ships_distinct_runtime_compatible_payloads() {
        for (v, framework) in [(8, "net7.0"), (9, "net8.0")] {
            let files = payload(v).unwrap();
            assert!(files[0].1.starts_with(b"MZ"));
            assert!(String::from_utf8_lossy(files[2].1).contains(framework));
            assert_eq!(files[3].0, TOOLBAR);
            assert!(String::from_utf8_lossy(files[3].1).contains("_InspirationDrawer"));
            assert_eq!(files[4].0, TOOLBAR_ICON);
            assert!(String::from_utf8_lossy(files[4].1).contains("<svg"));
        }
        assert!(payload(7).is_err());
        assert!(payload(10).is_err());
    }
    #[test]
    fn installs_idempotently_without_overwriting_existing_payload() {
        let root = std::env::temp_dir().join(format!(
            "rhino-payload-{}-{}",
            std::process::id(),
            rand::random::<u64>()
        ));
        let first = prepare_payload(&root, 8).unwrap();
        let second = prepare_payload(&root, 8).unwrap();
        assert_eq!(first, second);
        fs::write(&first, b"corrupted").unwrap();
        assert!(prepare_payload(&root, 8).is_err());
        assert_eq!(fs::read(first).unwrap(), b"corrupted");
        assert!(prepare_payload(&root, 9).unwrap().is_file());
        // Preserve the isolated temp directory as a diagnostic; never recursively delete user paths.
    }
    #[test]
    fn registration_is_current_user_only_and_contains_no_model_or_chat_actions() {
        let script = include_str!("rhino_installer_register.ps1");
        assert!(script.contains("Registry]::CurrentUser"));
        assert!(!script.contains("Registry]::LocalMachine"));
        assert!(!script.contains("Remove-Item"));
        assert!(script.contains("previousRegistration"));
        assert!(script.contains("CommandList"));
    }
}
