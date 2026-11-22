//! Independent, signed Rhino component releases. Shared Chat, credentials and
//! native IPC stay in the desktop host. Never accepts a model-supplied URL/path.
use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, fs, io::Read, path::{Path, PathBuf}, sync::Mutex, time::Duration};

static UPDATE_LOCK: Mutex<()> = Mutex::new(());
const MAX_CATALOG: u64 = 256 * 1024;
const MAX_BUNDLE: u64 = 48 * 1024 * 1024;
const PLUGIN_FILES: [&str; 5] = ["InspirationDrawer.Rhino.rhp", "InspirationDrawer.Rhino.deps.json", "InspirationDrawer.Rhino.runtimeconfig.json", "InspirationDrawer.Rhino.rui", "InspirationDrawer.Rhino.svg"];

#[derive(Deserialize)]
struct Channel { schema: u32, channel: String, public_key: String, endpoints: Vec<String> }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope { signed: String, signature: String }
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Component { pub id: String, pub version: String, pub revision: u64, url: String, #[serde(default)] urls: Vec<String>, sha256: String, size: u64 }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Catalog { schema: u32, channel: String, host_api: u32, components: Vec<Component> }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Bundle { schema: u32, id: String, files: BTreeMap<String, String> }
#[derive(Clone, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
struct Reference { catalog: String, id: String }
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct State {
    schema: u32,
    current: BTreeMap<String, Reference>,
    previous: Option<BTreeMap<String, Reference>>,
    highest: BTreeMap<String, u64>,
}
impl Default for State {
    fn default() -> Self { Self { schema: 1, current: BTreeMap::new(), previous: None, highest: BTreeMap::new() } }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus { channel: String, components: Vec<ComponentVersion>, can_rollback: bool }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ComponentVersion { id: String, version: String, revision: u64, error: Option<String> }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateResult {
    pub updated: Vec<String>, pub status: UpdateStatus, pub published: bool,
    pub plugin_restart_required: bool, pub desktop_restart_required: bool,
    pub installation_error: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeLocation { path: String, version: String, sha256: String }

fn config() -> Result<Channel, String> {
    // Explicit mapping keeps the wire-format key camelCase without permissive aliases.
    #[derive(Deserialize)] #[serde(rename_all = "camelCase")]
    struct Config { schema: u32, channel: String, public_key: String, endpoints: Vec<String> }
    let value: Config = serde_json::from_str(include_str!("../../integrations/rhino/update-channel.json")).map_err(|e| e.to_string())?;
    if value.schema != 1 || value.endpoints.is_empty() { return Err("Invalid Rhino update channel".into()); }
    Ok(Channel { schema: value.schema, channel: value.channel, public_key: value.public_key, endpoints: value.endpoints })
}
fn root() -> Result<PathBuf, String> {
    Ok(PathBuf::from(std::env::var_os("LOCALAPPDATA").ok_or("LOCALAPPDATA is missing")?)
        .join("InspirationDrawer/RhinoUpdates"))
}
fn sha(bytes: &[u8]) -> String { hex::encode(Sha256::digest(bytes)) }
fn digest_name(value: &str) -> bool { value.len() == 64 && value.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) }
fn ordinary(path: &Path, directory: bool) -> bool {
    let Ok(meta) = fs::symlink_metadata(path) else { return false; };
    if meta.file_type().is_symlink() || (directory && !meta.is_dir()) || (!directory && !meta.is_file()) { return false; }
    #[cfg(windows)] { use std::os::windows::fs::MetadataExt; if meta.file_attributes() & 0x400 != 0 { return false; } }
    true
}
fn safe_parent(path: &Path) -> Result<(), String> {
    for part in path.ancestors().filter(|p| !p.as_os_str().is_empty()) {
        match fs::symlink_metadata(part) {
            Ok(_) if !ordinary(part, true) => return Err(format!("Linked or unsafe Rhino update directory: {}", part.display())),
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e.to_string()),
            _ => (),
        }
    }
    Ok(())
}
fn read_file(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    safe_parent(path.parent().ok_or("Missing file parent")?)?;
    if !ordinary(path, false) { return Err(format!("Missing or unsafe Rhino update file: {}", path.display())); }
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut bytes = Vec::new(); file.take(limit + 1).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > limit { return Err("Rhino update file exceeds size limit".into()); }
    Ok(bytes)
}
fn write_atomic(path: &Path, bytes: &[u8], immutable: bool) -> Result<(), String> {
    let parent = path.parent().ok_or("Missing update parent")?; safe_parent(parent)?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    if fs::symlink_metadata(path).is_ok() {
        if !ordinary(path, false) { return Err("Refusing linked Rhino update destination".into()); }
        if immutable { return if read_file(path, MAX_BUNDLE)? == bytes { Ok(()) } else { Err("Cached Rhino update was modified; original files were preserved".into()) }; }
    }
    let temp = parent.join(format!(".pending-{:016x}", rand::random::<u64>()));
    use std::io::Write;
    let mut file = fs::OpenOptions::new().create_new(true).write(true).open(&temp).map_err(|e| e.to_string())?;
    file.write_all(bytes).and_then(|_| file.sync_all()).map_err(|e| e.to_string())?;
    fs::rename(&temp, path).map_err(|e| e.to_string())
}
fn read_state(root: &Path) -> Result<State, String> {
    safe_parent(root)?;
    let path = root.join("state.json");
    if !path.try_exists().map_err(|e| e.to_string())? { return Ok(State::default()); }
    let state: State = serde_json::from_slice(&read_file(&path, MAX_CATALOG)?).map_err(|e| e.to_string())?;
    if state.schema != 1 || state.current.len() > 3 || state.previous.as_ref().is_some_and(|v| v.len() > 3) { return Err("Invalid Rhino component state".into()); }
    Ok(state)
}
fn save_state(root: &Path, state: &State) -> Result<(), String> {
    write_atomic(&root.join("state.json"), &serde_json::to_vec(state).map_err(|e| e.to_string())?, false)
}
fn trusted_url(value: &str) -> Result<url::Url, String> {
    let url = url::Url::parse(value).map_err(|e| e.to_string())?;
    let release = (url.host_str() == Some("github.com") && url.path().starts_with("/jiuqu1122-ops/inspiration-drawer/releases/"))
        || (url.host_str() == Some("gitee.com") && url.path().starts_with("/zibinyou/inspiration-drawer/releases/"));
    let cdn = matches!(url.host_str(), Some("release-assets.githubusercontent.com" | "objects.githubusercontent.com" | "github-releases.githubusercontent.com"));
    if url.scheme() != "https" || url.port_or_known_default() != Some(443) || !url.username().is_empty() || url.password().is_some() || url.fragment().is_some() || (!release && !cdn) {
        return Err("Rhino updates require HTTPS on the configured release service".into());
    }
    Ok(url)
}
fn verify_catalog(bytes: &[u8], channel: &Channel) -> Result<Catalog, String> {
    if bytes.len() as u64 > MAX_CATALOG { return Err("Rhino catalog exceeds size limit".into()); }
    let envelope: Envelope = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
    let signed = STANDARD.decode(envelope.signed).map_err(|e| e.to_string())?;
    let signature = Signature::from_slice(&STANDARD.decode(envelope.signature).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let key: [u8; 32] = STANDARD.decode(&channel.public_key).map_err(|e| e.to_string())?.try_into().map_err(|_| "Invalid Rhino channel key")?;
    VerifyingKey::from_bytes(&key).map_err(|e| e.to_string())?.verify_strict(&signed, &signature).map_err(|_| "Rhino update signature verification failed")?;
    let catalog: Catalog = serde_json::from_slice(&signed).map_err(|e| e.to_string())?;
    if channel.schema != 1 || catalog.schema != 1 || catalog.channel != channel.channel || catalog.host_api != 1 || catalog.components.is_empty() || catalog.components.len() > 3 {
        return Err("Rhino update channel or host API is incompatible; a desktop update is required".into());
    }
    let mut seen = std::collections::BTreeSet::new();
    for component in &catalog.components {
        if !matches!(component.id.as_str(), "runtime" | "plugin8" | "plugin9") || !seen.insert(&component.id)
            || component.version.is_empty() || component.version.len() > 80 || !component.version.bytes().all(|b| b.is_ascii_alphanumeric() || b".+-".contains(&b))
            || component.revision == 0 || component.revision > 9_007_199_254_740_991 || !digest_name(&component.sha256) || component.size == 0 || component.size > MAX_BUNDLE { return Err("Invalid Rhino component manifest".into()); }
        trusted_url(&component.url)?;
        if component.urls.len() > 4 { return Err("Too many Rhino component mirrors".into()); }
        for url in &component.urls { trusted_url(url)?; }
    }
    Ok(catalog)
}
fn decode_bundle(bytes: &[u8], component: &Component) -> Result<BTreeMap<String, Vec<u8>>, String> {
    if bytes.len() as u64 != component.size || sha(bytes) != component.sha256 { return Err("Rhino component hash/size verification failed".into()); }
    let bundle: Bundle = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
    let names: &[&str] = if component.id == "runtime" { &["runtime.js"] } else { &PLUGIN_FILES };
    if bundle.schema != 1 || bundle.id != component.id || bundle.files.len() != names.len() || bundle.files.keys().any(|name| !names.contains(&name.as_str())) { return Err("Unexpected files in Rhino update bundle".into()); }
    let files = bundle.files.into_iter().map(|(name, data)| STANDARD.decode(data).map(|bytes| (name, bytes)).map_err(|e| e.to_string())).collect::<Result<BTreeMap<_, _>, _>>()?;
    if files.values().any(|bytes| bytes.is_empty() || bytes.len() > 32 * 1024 * 1024) { return Err("Invalid Rhino update file size".into()); }
    if component.id != "runtime" {
        let major = if component.id == "plugin8" { "net7.0" } else { "net8.0" };
        let runtime: serde_json::Value = serde_json::from_slice(&files[PLUGIN_FILES[2]]).map_err(|e| e.to_string())?;
        if !files[PLUGIN_FILES[0]].starts_with(b"MZ") || runtime["runtimeOptions"]["tfm"].as_str() != Some(major) { return Err("Rhino plugin binary/runtime does not match its component".into()); }
    } else { std::str::from_utf8(&files["runtime.js"]).map_err(|_| "Runtime module must be UTF-8")?; }
    Ok(files)
}
fn extract(root: &Path, component: &Component, files: &BTreeMap<String, Vec<u8>>) -> Result<(), String> {
    let parent = root.join("components"); safe_parent(&parent)?;
    fs::create_dir_all(&parent).map_err(|e| e.to_string())?;
    let target = parent.join(&component.sha256);
    if target.try_exists().map_err(|e| e.to_string())? { return verify_extracted(&target, files); }
    let stage = parent.join(format!(".stage-{:016x}", rand::random::<u64>()));
    fs::create_dir(&stage).map_err(|e| e.to_string())?;
    for (name, bytes) in files { fs::write(stage.join(name), bytes).map_err(|e| e.to_string())?; }
    verify_extracted(&stage, files)?;
    fs::rename(stage, target).map_err(|e| e.to_string())
}
fn verify_extracted(directory: &Path, files: &BTreeMap<String, Vec<u8>>) -> Result<(), String> {
    safe_parent(directory)?;
    for (name, bytes) in files { if read_file(&directory.join(name), MAX_BUNDLE)? != *bytes { return Err("Extracted Rhino update was modified; refusing to load it".into()); } }
    Ok(())
}
fn selected(root: &Path, reference: &Reference, channel: &Channel) -> Result<(Component, BTreeMap<String, Vec<u8>>), String> {
    if !digest_name(&reference.catalog) { return Err("Invalid cached catalog reference".into()); }
    let envelope = read_file(&root.join("catalogs").join(format!("{}.json", reference.catalog)), MAX_CATALOG)?;
    if sha(&envelope) != reference.catalog { return Err("Cached catalog was modified".into()); }
    let component = verify_catalog(&envelope, channel)?.components.into_iter().find(|c| c.id == reference.id).ok_or("Missing signed Rhino component")?;
    let bytes = read_file(&root.join("bundles").join(format!("{}.json", component.sha256)), MAX_BUNDLE)?;
    let files = decode_bundle(&bytes, &component)?;
    verify_extracted(&root.join("components").join(&component.sha256), &files)?;
    Ok((component, files))
}
fn status_at(root: &Path, channel: &Channel) -> Result<UpdateStatus, String> {
    let state = read_state(root)?;
    let mut components = Vec::new();
    for (id, reference) in &state.current {
        match selected(root, reference, channel) {
            Ok((component, _)) if component.id == *id => components.push(ComponentVersion { id: component.id, version: component.version, revision: component.revision, error: None }),
            value => components.push(ComponentVersion { id: id.clone(), version: "unavailable".into(), revision: 0,
                error: Some(value.err().unwrap_or_else(|| "Rhino component identity mismatch".into())) }),
        }
    }
    Ok(UpdateStatus { channel: channel.channel.clone(), components, can_rollback: state.previous.is_some() })
}
fn apply_catalog(root: &Path, envelope: &[u8], channel: &Channel, mut download: impl FnMut(&Component) -> Result<Vec<u8>, String>) -> Result<Vec<String>, String> {
    let catalog = verify_catalog(envelope, channel)?;
    let mut state = read_state(root)?;
    let previous = state.current.clone(); let mut updated = Vec::new();
    for component in catalog.components {
        if component.revision <= *state.highest.get(&component.id).unwrap_or(&0) { continue; }
        let bytes = download(&component)?;
        let files = decode_bundle(&bytes, &component)?;
        write_atomic(&root.join("bundles").join(format!("{}.json", component.sha256)), &bytes, true)?;
        extract(root, &component, &files)?;
        state.highest.insert(component.id.clone(), component.revision);
        state.current.insert(component.id.clone(), Reference { catalog: sha(envelope), id: component.id.clone() });
        updated.push(component.id);
    }
    if !updated.is_empty() {
        write_atomic(&root.join("catalogs").join(format!("{}.json", sha(envelope))), envelope, true)?;
        state.previous = Some(previous);
        // All downloads/extractions verify before a single atomic activation.
        save_state(root, &state)?;
    }
    Ok(updated)
}
fn download(url: &str, limit: u64) -> Result<Option<Vec<u8>>, String> {
    trusted_url(url)?;
    let client = reqwest::blocking::Client::builder().timeout(Duration::from_secs(45))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 || trusted_url(attempt.url().as_str()).is_err() { attempt.error("Untrusted Rhino update redirect") } else { attempt.follow() }
        })).user_agent("InspirationDrawer-RhinoUpdates/1").build().map_err(|e| e.to_string())?;
    let response = client.get(url).send().map_err(|e| e.to_string())?;
    if response.status() == reqwest::StatusCode::NOT_FOUND { return Ok(None); }
    let response = response.error_for_status().map_err(|e| e.to_string())?;
    if response.content_length().is_some_and(|size| size > limit) { return Err("Rhino download exceeds size limit".into()); }
    let mut bytes = Vec::new(); response.take(limit + 1).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > limit { return Err("Rhino download exceeds size limit".into()); }
    Ok(Some(bytes))
}
fn apply_installed_plugins(updated: &[String]) -> (bool, Option<String>) {
    if !updated.iter().any(|id| id.starts_with("plugin")) { return (false, None); }
    match crate::rhino_installer::sync_managed_plugins() {
        Ok(result) => (result.restart_required, None), Err(error) => (false, Some(error)),
    }
}
fn download_component(component: &Component) -> Result<Vec<u8>, String> {
    let mut sources = component.urls.clone();
    if !sources.contains(&component.url) { sources.push(component.url.clone()); }
    let mut errors = Vec::new();
    for url in sources {
        match download(&url, component.size) {
            Ok(Some(bytes)) => match decode_bundle(&bytes, component) { Ok(_) => return Ok(bytes), Err(e) => errors.push(e) },
            Ok(None) => errors.push("Rhino component release asset was not found".into()),
            Err(e) => errors.push(e),
        }
    }
    Err(errors.join("; "))
}
fn check_updates(prepare_only: bool) -> Result<UpdateResult, String> {
    let _guard = UPDATE_LOCK.lock().map_err(|_| "Rhino updater is busy")?;
    let channel = config()?; let root = root()?;
    let mut errors = Vec::new(); let mut envelope = None;
    for endpoint in &channel.endpoints {
        match download(endpoint, MAX_CATALOG) {
            Ok(Some(bytes)) => match verify_catalog(&bytes, &channel) { Ok(_) => { envelope = Some(bytes); break; }, Err(e) => errors.push(e) },
            Ok(None) => (), Err(error) => errors.push(error),
        }
    }
    let published = envelope.is_some();
    if !published && !errors.is_empty() { return Err(errors.join("; ")); }
    let updated = if let Some(envelope) = envelope { apply_catalog(&root, &envelope, &channel, download_component)? } else { Vec::new() };
    // Retry any previously downloaded but incompletely registered plugin, even
    // if this catalog contains no newer revision. Matching installations skip.
    let (plugin_restart_required, installation_error) = if prepare_only {
        // The manual installer will register all detected versions in one pass.
        (false, None)
    } else {
        let selected_plugins = read_state(&root)?.current.keys().filter(|id| id.starts_with("plugin")).cloned().collect::<Vec<_>>();
        apply_installed_plugins(&selected_plugins)
    };
    Ok(UpdateResult { desktop_restart_required: updated.iter().any(|id| id == "runtime"), updated, published, plugin_restart_required, installation_error, status: status_at(&root, &channel)? })
}
pub(crate) fn plugin_payload(major: u8) -> Result<Option<BTreeMap<String, Vec<u8>>>, String> {
    let root = root()?; let state = read_state(&root)?; let id = format!("plugin{major}");
    state.current.get(&id).map(|reference| {
        let (component, files) = selected(&root, reference, &config()?)?;
        if component.id != id { return Err("Rhino plugin identity mismatch".into()); } Ok(files)
    }).transpose()
}

fn require_main(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "main" { return Err("Rhino updates are only available to the main desktop window".into()); } Ok(())
}
#[tauri::command]
pub async fn rhino_update_status(window: tauri::WebviewWindow) -> Result<UpdateStatus, String> {
    require_main(&window)?;
    tauri::async_runtime::spawn_blocking(|| status_at(&root()?, &config()?)).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn check_rhino_updates(window: tauri::WebviewWindow, prepare_only: Option<bool>) -> Result<UpdateResult, String> {
    require_main(&window)?;
    tauri::async_runtime::spawn_blocking(move || check_updates(prepare_only.unwrap_or(false))).await.map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn rhino_runtime_location(window: tauri::WebviewWindow) -> Result<Option<RuntimeLocation>, String> {
    require_main(&window)?;
    tauri::async_runtime::spawn_blocking(|| runtime_at(&root()?, &config()?)).await.map_err(|e| e.to_string())?
}

fn runtime_at(root: &Path, channel: &Channel) -> Result<Option<RuntimeLocation>, String> {
    let state = read_state(root)?;
    state.current.get("runtime").map(|reference| {
        let (component, _) = selected(root, reference, channel)?;
        if component.id != "runtime" { return Err("Rhino runtime identity mismatch".into()); }
        Ok(RuntimeLocation { path: root.join("components").join(&component.sha256).join("runtime.js").to_string_lossy().into_owned(), version: component.version, sha256: component.sha256 })
    }).transpose()
}

/// Development-only end-to-end fixture. Uses a caller-created disposable cache,
/// verifies the real release key and never registers or changes Rhino plugins.
#[cfg(debug_assertions)]
pub(crate) fn prepare_runtime_probe(release: &Path, cache: &Path) -> Result<RuntimeLocation, String> {
    let channel = config()?;
    let envelope = read_file(&release.join("latest.json"), MAX_CATALOG)?;
    apply_catalog(cache, &envelope, &channel, |component| {
        let url = trusted_url(&component.url)?;
        let filename = url.path_segments().and_then(|s| s.last()).ok_or("Missing release filename")?;
        read_file(&release.join(filename), component.size)
    })?;
    runtime_at(cache, &channel)?.ok_or_else(|| "Probe release has no runtime component".into())
}
#[tauri::command]
pub async fn rollback_rhino_update(window: tauri::WebviewWindow) -> Result<UpdateResult, String> {
    require_main(&window)?;
    tauri::async_runtime::spawn_blocking(|| {
        let _guard = UPDATE_LOCK.lock().map_err(|_| "Rhino updater is busy")?;
        let root = root()?; let channel = config()?;
        let updated = rollback_at(&root, &channel)?;
        let (plugin_restart_required, installation_error) = apply_installed_plugins(&updated);
        Ok(UpdateResult { desktop_restart_required: updated.iter().any(|id| id == "runtime"), updated, published: true, plugin_restart_required, installation_error, status: status_at(&root, &channel)? })
    }).await.map_err(|e| e.to_string())?
}

fn rollback_at(root: &Path, channel: &Channel) -> Result<Vec<String>, String> {
    let mut state = read_state(root)?;
    let previous = state.previous.take().ok_or("No previous Rhino component update is available")?;
    for reference in previous.values() { selected(root, reference, channel)?; }
    let updated = state.current.keys().chain(previous.keys()).filter(|id| state.current.get(*id) != previous.get(*id)).cloned().collect::<std::collections::BTreeSet<_>>().into_iter().collect::<Vec<_>>();
    state.current = previous;
    // Keep the high-water revisions: auto-check must not undo a user rollback.
    save_state(root, &state)?;
    Ok(updated)
}

#[cfg(test)]
#[path = "rhino_updates_tests.rs"]
mod tests;
