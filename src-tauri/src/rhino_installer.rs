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
#[path = "rhino_payload_cleanup.rs"]
mod payload_cleanup;

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
    #[serde(default)]
    pub running_state_uncertain: bool,
    #[serde(default)]
    pub runtime_modes: Vec<String>,
    pub plugin_path: Option<String>,
    #[serde(default)]
    pub installed: bool,
    #[serde(default)]
    pub load_mode: Option<u32>,
    #[serde(default)]
    pub load_protection: Option<u32>,
    #[serde(default)]
    pub running_as_current_user: Option<bool>,
    #[serde(default)]
    pub command_registered: Option<bool>,
    #[serde(default)]
    pub plugin_load_state: Option<String>,
    #[serde(default)]
    pub conflicting_package_paths: Vec<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RhinoAutoUpdateResult {
    pub updated_versions: Vec<u8>,
    pub skipped_disabled_versions: Vec<u8>,
    pub restart_required: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RhinoInstallResult {
    pub installed: Vec<RhinoInstallation>,
    pub restart_required: bool,
    pub repaired_conflicts: usize,
    pub conflict_backups: Vec<String>,
    pub cleaned_versions: usize,
    pub cleanup_backups: Vec<String>,
    pub cleanup_deferred: bool,
    pub cleanup_warnings: Vec<String>,
}

fn embedded_payload(version: u8) -> Result<[(&'static str, &'static [u8]); 5], String> {
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

fn payload(version: u8) -> Result<Vec<(&'static str, Vec<u8>)>, String> {
    let embedded = embedded_payload(version)?;
    let selected = crate::rhino_updates::plugin_payload(version).unwrap_or_else(|_| {
        eprintln!("[rhino-installer] Invalid cached Rhino {version} package; using the embedded package.");
        None
    });
    // A newer desktop may embed a plugin newer than the previously cached
    // independent release. Never downgrade it during post-upgrade sync.
    let embedded_version = plugin_version(embedded[1].1)?;
    let selected = selected.filter(|files| {
        files.get("InspirationDrawer.Rhino.deps.json")
            .and_then(|bytes| plugin_version(bytes).ok())
            .is_some_and(|version| version >= embedded_version)
    });
    embedded.into_iter().map(|(name, fallback)| {
        let bytes = match &selected {
            Some(files) => files.get(name).ok_or_else(|| format!("Signed Rhino payload is missing {name}"))?.clone(),
            None => fallback.to_vec(),
        };
        Ok((name, bytes))
    }).collect()
}

fn plugin_version(deps: &[u8]) -> Result<semver::Version, String> {
    let value: serde_json::Value = serde_json::from_slice(deps).map_err(|e| e.to_string())?;
    let names = value["libraries"].as_object().ok_or("Rhino plugin dependency metadata is missing")?;
    let version = names.keys().find_map(|name| name.strip_prefix("InspirationDrawer.Rhino/")).ok_or("Rhino plugin version is missing")?;
    semver::Version::parse(version).map_err(|e| e.to_string())
}

fn payload_directory_matches(directory: &Path, files: &[(&'static str, Vec<u8>)]) -> bool {
    if !payload_cleanup::safe_directory_chain(directory) { return false; }
    files.iter().all(|(name, bytes)| {
        let path = directory.join(name);
        let Ok(metadata) = fs::symlink_metadata(&path) else { return false; };
        if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() != bytes.len() as u64 { return false; }
        #[cfg(windows)] {
            use std::os::windows::fs::MetadataExt;
            if metadata.file_attributes() & 0x400 != 0 { return false; }
        }
        fs::read(path).is_ok_and(|actual| actual == *bytes)
    })
}

fn discard_staging(staging: &Path, target: &Path, files: &[(&'static str, Vec<u8>)]) {
    // Only remove known files in our exact sibling staging directory. Never recurse.
    if staging.parent() != target.parent()
        || !staging.file_name().and_then(|name| name.to_str()).is_some_and(|name| name.starts_with(".staging-"))
        || !payload_cleanup::safe_directory_chain(staging) { return; }
    for (name, _) in files { let _ = fs::remove_file(staging.join(name)); }
    let _ = fs::remove_dir(staging);
}

fn commit_staged_payload(
    staging: &Path,
    target: &Path,
    files: &[(&'static str, Vec<u8>)],
) -> Result<(), String> {
    match fs::rename(staging, target) {
        Ok(()) => Ok(()),
        Err(_) if payload_directory_matches(target, files) => {
            // A concurrent installer committed this exact immutable snapshot first.
            discard_staging(staging, target, files);
            Ok(())
        }
        Err(error) => {
            discard_staging(staging, target, files);
            Err(format!("Could not commit Rhino plugin payload to {}: {error}", target.display()))
        }
    }
}

// A damaged immutable directory is left untouched; repair installs a verified sibling.
fn prepare_payload(root: &Path, version: u8) -> Result<PathBuf, String> {
    let files = payload(version)?;
    let mut hash = Sha256::new();
    for (name, bytes) in &files { hash.update(name.as_bytes()); hash.update(bytes); }
    let digest = hex::encode(hash.finalize());
    let parent = root.join(version.to_string());
    if !payload_cleanup::safe_directory_chain(&parent) {
        return Err(format!("Rhino {version} payload directory is linked or unsafe: {}", parent.display()));
    }
    fs::create_dir_all(&parent).map_err(|error| format!("Could not create Rhino {version} payload directory {}: {error}", parent.display()))?;
    let mut target = parent.join(&digest[..20]);
    if payload_directory_matches(&target, &files) { return Ok(target.join(PLUGIN)); }
    if fs::symlink_metadata(&target).is_ok() {
        // Antivirus, interrupted legacy installs or manual edits must not make repair impossible.
        // Reuse a valid previous repair, while retaining corrupt/loaded files for diagnostics.
        for entry in fs::read_dir(&parent).map_err(|error| error.to_string())?.take(512) {
            let entry = entry.map_err(|error| error.to_string())?;
            let name = entry.file_name();
            if name.to_str().and_then(payload_cleanup::managed_payload_hash) == Some(&digest[..20])
                && payload_directory_matches(&entry.path(), &files) { return Ok(entry.path().join(PLUGIN)); }
        }
        target = parent.join(format!("{}-repair-{:016x}", &digest[..20], rand::random::<u64>()));
    }
    let staging = parent.join(format!(".staging-{}-{:016x}", std::process::id(), rand::random::<u64>()));
    fs::create_dir(&staging).map_err(|error| format!("Could not create temporary Rhino {version} payload directory {}: {error}", staging.display()))?;
    for (name, bytes) in &files {
        if let Err(error) = fs::write(staging.join(name), bytes) {
            discard_staging(&staging, &target, &files);
            return Err(format!("Could not stage Rhino {version} payload file {name}: {error}"));
        }
    }
    if !payload_directory_matches(&staging, &files) {
        discard_staging(&staging, &target, &files);
        return Err(format!("Rhino {version} payload verification failed before registration; check antivirus or file permissions."));
    }
    commit_staged_payload(&staging, &target, &files)?;
    if !payload_directory_matches(&target, &files) {
        return Err(format!("Rhino {version} payload integrity check failed at {}; no registration was changed.", target.display()));
    }
    Ok(target.join(PLUGIN))
}

fn readable_powershell_error(stderr: &[u8]) -> String {
    let raw = String::from_utf8_lossy(stderr).trim().to_string();
    if !raw.contains("CLIXML") { return raw; }
    let mut output = Vec::new();
    let mut remaining = raw.as_str();
    while let Some(start) = remaining.find("<S S=\"Error\">") {
        remaining = &remaining[start + "<S S=\"Error\">".len()..];
        let Some(end) = remaining.find("</S>") else { break; };
        let message = remaining[..end]
            .replace("_x000D__x000A_", "\n")
            .replace("_x000D_", "\r")
            .replace("_x000A_", "\n")
            .replace("&quot;", "\"")
            .replace("&apos;", "'")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&amp;", "&");
        if !message.trim().is_empty() { output.push(message); }
        remaining = &remaining[end + "</S>".len()..];
    }
    if output.is_empty() { raw } else { output.join("\n") }
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
        return Err(readable_powershell_error(&output.stderr));
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .trim_start_matches('\u{feff}')
        .trim()
        .to_string())
}

fn registration_matches_payload(plugin_path: &str, files: &[(&'static str, Vec<u8>)]) -> bool {
    let path = Path::new(plugin_path);
    let is_expected_plugin = path.file_name().and_then(|name| name.to_str())
        .is_some_and(|name| name.eq_ignore_ascii_case(PLUGIN));
    if !is_expected_plugin { return false; }
    let Some(directory) = path.parent() else { return false; };
    files.iter().all(|(name, bytes)| {
        let file = if *name == PLUGIN { path.to_path_buf() } else { directory.join(name) };
        fs::read(file).is_ok_and(|actual| actual == *bytes)
    })
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
        item.installed = item.plugin_path.as_ref()
            .is_some_and(|path| registration_matches_payload(path, &files));
    }
    Ok(versions)
}
#[cfg(not(windows))]
fn detect() -> Result<Vec<RhinoInstallation>, String> {
    Err("Rhino plugin installation currently supports Windows only.".into())
}

fn managed_payload_path_matches(plugin_path: &str, root: &Path, major_version: u8) -> bool {
    if !payload_cleanup::safe_directory_chain(root) { return false; }
    let Ok(canonical_root) = root.canonicalize() else { return false; };
    let path = Path::new(plugin_path);
    if !path.file_name().and_then(|name| name.to_str()).is_some_and(|name| name.eq_ignore_ascii_case(PLUGIN)) {
        return false;
    }
    let relative = if let Ok(relative) = path.strip_prefix(root) {
        Some(relative.to_path_buf())
    } else {
        path.parent().and_then(|parent| parent.canonicalize().ok())
            .and_then(|parent| parent.join(PLUGIN).strip_prefix(&canonical_root).ok().map(Path::to_path_buf))
    };
    let Some(relative) = relative else { return false; };
    let components = relative.components().collect::<Vec<_>>();
    let version_name = major_version.to_string();
    if components.len() != 3
        || components[0].as_os_str().to_str() != Some(version_name.as_str())
        || components[2].as_os_str().to_str() != Some(PLUGIN) { return false; }
    let Some(hash) = components[1].as_os_str().to_str() else { return false; };
    if payload_cleanup::managed_payload_hash(hash).is_none()
        || !payload_cleanup::safe_directory_chain(path.parent().unwrap_or(path)) { return false; }
    if let Ok(metadata) = fs::symlink_metadata(path) {
        if !metadata.is_file() || metadata.file_type().is_symlink() { return false; }
        #[cfg(windows)] {
            use std::os::windows::fs::MetadataExt;
            if metadata.file_attributes() & 0x400 != 0 { return false; }
        }
    }
    true
}

pub(crate) fn install() -> Result<RhinoInstallResult, String> {
    let _lock = INSTALL_LOCK.lock().map_err(|_| "Rhino installer is busy")?;
    let versions = detect().map_err(|error| format!("Rhino installation detection failed: {error}"))?;
    if versions.is_empty() {
        return Err("Rhino 8 or Rhino 9 was not found. Install Rhino first, then refresh.".into());
    }
    install_versions(versions, true)
}

pub(crate) fn sync_managed_plugins() -> Result<RhinoAutoUpdateResult, String> {
    let _lock = INSTALL_LOCK.lock().map_err(|_| "Rhino installer is busy")?;
    let detected = detect().map_err(|error| format!("Rhino installation detection failed during post-update plugin sync: {error}"))?;
    let root = PathBuf::from(std::env::var_os("LOCALAPPDATA").ok_or("LOCALAPPDATA is missing")?)
        .join("InspirationDrawer")
        .join("RhinoPlugin");
    let (outdated, skipped_disabled_versions) = outdated_managed(detected, &root);
    if outdated.is_empty() {
        return Ok(RhinoAutoUpdateResult {
            updated_versions: Vec::new(), skipped_disabled_versions, restart_required: false,
        });
    }
    let updated_versions = outdated.iter().map(|item| item.major_version).collect::<Vec<_>>();
    let install_result = install_versions(outdated, false)?;
    Ok(RhinoAutoUpdateResult {
        updated_versions,
        skipped_disabled_versions,
        restart_required: install_result.restart_required,
    })
}

fn outdated_managed(detected: Vec<RhinoInstallation>, root: &Path) -> (Vec<RhinoInstallation>, Vec<u8>) {
    let mut outdated = Vec::new(); let mut disabled = Vec::new();
    for item in detected {
        let managed = item.plugin_path.as_deref().is_some_and(|path| managed_payload_path_matches(path, root, item.major_version));
        if !managed || item.installed { continue; }
        if item.load_mode == Some(0) { disabled.push(item.major_version); } else { outdated.push(item); }
    }
    (outdated, disabled)
}

fn install_versions(versions: Vec<RhinoInstallation>, enable_on_install: bool) -> Result<RhinoInstallResult, String> {
    if versions.is_empty() {
        return Err("No Rhino versions were selected for plugin installation.".into());
    }
    if versions.iter().any(|item| item.running && !item.conflicting_package_paths.is_empty()) {
        return Err("检测到旧版 YAK 插件与一键安装版使用相同 ID。请先保存工程并完全退出对应 Rhino，再点击一键安装 / 更新。旧包会备份后移出扫描目录，不会删除。".into());
    }
    let selected_versions = versions.iter().map(|item| item.major_version).collect::<Vec<_>>();
    let root = PathBuf::from(std::env::var_os("LOCALAPPDATA").ok_or("LOCALAPPDATA is missing")?)
        .join("InspirationDrawer")
        .join("RhinoPlugin");
    let prepared_payloads = versions.iter().map(|item| {
        prepare_payload(&root, item.major_version)
            .map_err(|error| format!("Rhino {} payload preparation failed: {error}", item.major_version))
    }).collect::<Result<Vec<_>, _>>()?;
    #[cfg(windows)]
    {
        let registrations = versions.iter().zip(prepared_payloads.iter()).map(|(item, plugin_path)| {
            serde_json::json!({ "version": item.major_version, "pluginPath": plugin_path, "enableOnInstall": enable_on_install })
        }).collect::<Vec<_>>();
        let registrations = serde_json::to_string(&registrations).map_err(|error| error.to_string())?;
        run_powershell(
            include_str!("rhino_installer_register.ps1"),
            &[("DRAWER_RHINO_REGISTRATIONS", std::ffi::OsStr::new(&registrations))],
        ).map_err(|error| format!("Transactional current-user Rhino registration failed: {error}"))?;
    }
    #[cfg(not(windows))]
    let _ = prepared_payloads;
    let mut backups = Vec::new();
    let backup_root = root.parent().ok_or("Missing backup parent")?.join("RhinoPluginBackups");
    for item in &versions {
        let package_root = package_directory(item.major_version)?;
        let migrated = package_conflicts::backup_legacy_packages(&package_root, &backup_root.join(item.major_version.to_string()))
            .map_err(|error| format!("Rhino {} legacy package migration failed at {}: {error}", item.major_version, package_root.display()))?;
        backups.extend(migrated.into_iter().map(|item| item.backup_path.to_string_lossy().into_owned()));
    }
    let installed = detect().map_err(|error| format!("Rhino post-install verification failed: {error}"))?;
    let selected_installed = installed.iter().filter(|item| selected_versions.contains(&item.major_version)).collect::<Vec<_>>();
    let invalid = |item: &&RhinoInstallation| !item.installed
        || (enable_on_install && (item.load_mode != Some(1) || item.load_protection != Some(1)))
        || item.command_registered != Some(true) || !item.conflicting_package_paths.is_empty();
    if selected_installed.len() != selected_versions.len() || selected_installed.iter().any(invalid) {
        let details = selected_installed.iter().filter(|item| invalid(item))
            .map(|item| format!("Rhino {}: files verified={}, command registered={:?}, load mode={:?}, load protection={:?}, duplicate packages={}", item.major_version, item.installed, item.command_registered, item.load_mode, item.load_protection, item.conflicting_package_paths.len()))
            .collect::<Vec<_>>().join("; ");
        return Err(format!("Rhino registration verification failed after writing payloads. {details}. Existing models and conversations were not changed."));
    }
    // Cleanup is a post-verification step only. Never move an assembly loaded by
    // Rhino; a running version is left intact and the UI reports deferred cleanup.
    let mut cleanup_backups = Vec::new();
    let mut cleanup_warnings = Vec::new();
    let cleanup_deferred = selected_installed.iter().any(|item| item.running);
    for item in &selected_installed {
        if item.running { continue; }
        let Some(plugin) = item.plugin_path.as_deref() else { continue; };
        match payload_cleanup::backup_obsolete_payloads(
            &root.join(item.major_version.to_string()),
            Path::new(plugin),
            &backup_root.join(item.major_version.to_string()).join("managed-versions"),
        ) {
            Ok(moved) => cleanup_backups.extend(moved.into_iter().map(|item| item.backup_path.to_string_lossy().into_owned())),
            Err(error) => cleanup_warnings.push(format!("Rhino {}: {error}", item.major_version)),
        }
    }
    Ok(RhinoInstallResult {
        restart_required: selected_installed.iter().any(|item| item.running),
        repaired_conflicts: backups.len(),
        conflict_backups: backups,
        cleaned_versions: cleanup_backups.len(),
        cleanup_backups,
        cleanup_deferred,
        cleanup_warnings,
        installed,
    })
}

#[tauri::command]
pub async fn auto_update_managed_rhino_plugins(window: tauri::WebviewWindow) -> Result<RhinoAutoUpdateResult, String> {
    if window.label() != "main" { return Err("Rhino plugin auto-update is only available to the main desktop window.".into()); }
    tauri::async_runtime::spawn_blocking(sync_managed_plugins)
        .await
        .map_err(|error| error.to_string())?
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
    fn upgrade_sync_plans_no_reinstall_for_current_payload_and_preserves_disabled_plugins() {
        let root = std::env::temp_dir().join(format!("rhino-upgrade-sync-{:016x}", rand::random::<u64>()));
        let current = prepare_payload(&root, 8).unwrap();
        let fixture = |installed: bool, load_mode: u8| serde_json::from_value::<RhinoInstallation>(serde_json::json!({
            "majorVersion":8,"exePath":"fixture.exe","running":false,"pluginPath":current,"installed":installed,"loadMode":load_mode
        })).unwrap();
        let before = fs::read(&current).unwrap();
        let (updates, disabled) = outdated_managed(vec![fixture(true, 1)], &root);
        assert!(updates.is_empty() && disabled.is_empty());
        assert_eq!(fs::read(&current).unwrap(), before);
        let (updates, disabled) = outdated_managed(vec![fixture(false, 0)], &root);
        assert!(updates.is_empty()); assert_eq!(disabled, vec![8]);
        let (updates, disabled) = outdated_managed(vec![fixture(false, 1)], &root);
        assert_eq!(updates.len(), 1); assert!(disabled.is_empty());
    }

    #[test]
    fn newer_embedded_plugin_versions_outrank_old_independent_cache_versions() {
        let deps = |version: &str| serde_json::to_vec(&serde_json::json!({"libraries":{format!("InspirationDrawer.Rhino/{version}"): {}}})).unwrap();
        assert!(plugin_version(&deps("0.1.0-beta.37")).unwrap() > plugin_version(&deps("0.1.0-beta.36.5")).unwrap());
        assert!(plugin_version(&deps("0.1.0")).unwrap() > plugin_version(&deps("0.1.0-beta.37")).unwrap());
        assert!(plugin_version(b"{}").is_err());
    }
    #[test]
    fn formats_powershell_clixml_errors_for_the_install_ui() {
        let raw = br#"#< CLIXML<Objs><S S="Error">Registration failed_x000D__x000A_second line &amp; detail</S></Objs>"#;
        assert_eq!(readable_powershell_error(raw), "Registration failed\nsecond line & detail");
        assert_eq!(readable_powershell_error(b"plain powershell error"), "plain powershell error");
    }

    #[test]
    fn ships_distinct_runtime_compatible_payloads() {
        for (v, framework) in [(8, "net7.0"), (9, "net8.0")] {
            let files = payload(v).unwrap();
            assert!(files[0].1.starts_with(b"MZ"));
            assert!(String::from_utf8_lossy(&files[2].1).contains(framework));
            assert_eq!(files[3].0, TOOLBAR);
            assert!(String::from_utf8_lossy(&files[3].1).contains("_InspirationDrawer"));
            assert_eq!(files[4].0, TOOLBAR_ICON);
            assert!(String::from_utf8_lossy(&files[4].1).contains("<svg"));
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
        let repaired = prepare_payload(&root, 8).unwrap();
        assert_ne!(first, repaired);
        assert_eq!(fs::read(&first).unwrap(), b"corrupted");
        assert_eq!(prepare_payload(&root, 8).unwrap(), repaired);
        assert!(registration_matches_payload(repaired.to_str().unwrap(), &payload(8).unwrap()));
        assert!(prepare_payload(&root, 9).unwrap().is_file());
        // Preserve the isolated temp directory as a diagnostic; never recursively delete user paths.
    }
    #[test]
    fn automatic_sync_only_recognizes_exact_managed_content_addressed_paths() {
        let root = std::env::temp_dir().join(format!(
            "rhino-managed-sync-{}-{}", std::process::id(), rand::random::<u64>()
        ));
        let plugin = prepare_payload(&root, 8).unwrap();
        assert!(managed_payload_path_matches(plugin.to_str().unwrap(), &root, 8));
        assert!(!managed_payload_path_matches(plugin.to_str().unwrap(), &root, 9));
        fs::remove_file(&plugin).unwrap();
        assert!(managed_payload_path_matches(plugin.to_str().unwrap(), &root, 8));
        let external = root.join("external").join(PLUGIN);
        fs::create_dir_all(external.parent().unwrap()).unwrap();
        fs::write(&external, b"not managed").unwrap();
        assert!(!managed_payload_path_matches(external.to_str().unwrap(), &root, 8));
    }

    #[test]
    fn concurrent_install_accepts_another_processes_verified_content_addressed_commit() {
        let root = std::env::temp_dir().join(format!(
            "rhino-concurrent-install-{}-{}", std::process::id(), rand::random::<u64>()
        ));
        let target = root.join("9").join("0123456789abcdefabcd");
        let staging = root.join("9").join(".staging-loser");
        fs::create_dir_all(&target).unwrap();
        fs::create_dir_all(&staging).unwrap();
        let files = payload(9).unwrap();
        for (name, bytes) in &files {
            fs::write(target.join(name), bytes).unwrap();
            fs::write(staging.join(name), bytes).unwrap();
        }
        commit_staged_payload(&staging, &target, &files).unwrap();
        assert!(payload_directory_matches(&target, &files));
        assert!(!staging.exists());
        // This fixture simulates the first installer winning the atomic directory rename.
    }

    #[test]
    fn installed_status_requires_the_registered_path_to_be_the_verified_plugin_file() {
        let root = std::env::temp_dir().join(format!(
            "rhino-registration-{}-{}", std::process::id(), rand::random::<u64>()
        ));
        fs::create_dir_all(&root).unwrap();
        let files = payload(8).unwrap();
        for (name, bytes) in &files { fs::write(root.join(name), bytes).unwrap(); }
        assert!(registration_matches_payload(root.join(PLUGIN).to_str().unwrap(), &files));
        assert!(!registration_matches_payload(root.join("stale-plugin.rhp").to_str().unwrap(), &files));
        fs::write(root.join(PLUGIN), b"stale assembly").unwrap();
        assert!(!registration_matches_payload(root.join(PLUGIN).to_str().unwrap(), &files));
        // Keep the fixture for diagnostics rather than recursively deleting a temp path.
    }

    #[test]
    fn registration_is_current_user_only_and_contains_no_model_or_chat_actions() {
        let script = include_str!("rhino_installer_register.ps1");
        assert!(script.contains("Registry]::CurrentUser"));
        assert!(!script.contains("Registry]::LocalMachine"));
        assert!(!script.contains("Remove-Item"));
        assert!(script.contains("DRAWER_RHINO_REGISTRATIONS"));
        assert!(script.contains("Registration rollback incomplete"));
        assert!(script.contains("all touched current-user registry values were restored"));
        assert!(script.contains("foreach ($plan in $plans)"));
        assert!(script.contains("CommandList"));
        let detect = include_str!("rhino_installer_detect.ps1");
        assert!(detect.contains("LoadMode"));
        assert!(detect.contains("LoadProtection"));
        assert!(detect.contains("runningAsCurrentUser"));
        assert!(detect.contains("GetOwnerSid"));
    }
}
