//! Move only verified, obsolete managed payloads out of the active install tree.
//! Never delete arbitrary RHPs, follow reparse points, or touch a running Rhino.
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{fs, path::{Path, PathBuf}};

const PLUGIN: &str = "InspirationDrawer.Rhino.rhp";
const GUID: &[u8] = b"b55c8d32-2c2f-4da2-84ca-b7c88c1a8de5";
const PAYLOAD_FILES: &[&str] = &[
    PLUGIN,
    "InspirationDrawer.Rhino.deps.json",
    "InspirationDrawer.Rhino.runtimeconfig.json",
    "InspirationDrawer.Rhino.rui",
    "InspirationDrawer.Rhino.svg",
];

fn ordinary(path: &Path, directory: bool) -> bool {
    let Ok(meta) = fs::symlink_metadata(path) else { return false; };
    if meta.file_type().is_symlink() || (directory && !meta.is_dir()) || (!directory && !meta.is_file()) {
        return false;
    }
    #[cfg(windows)] {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 { return false; }
    }
    true
}
fn safe_directory_chain(path: &Path) -> bool {
    path.ancestors().filter(|part| !part.as_os_str().is_empty())
        .all(|part| !part.exists() || ordinary(part, true))
}
fn verified_managed_payload(path: &Path) -> bool {
    let name = path.file_name().and_then(|value| value.to_str()).unwrap_or("");
    if name.len() != 20 || !name.bytes().all(|value| value.is_ascii_hexdigit()) || !ordinary(path, true) {
        return false;
    }
    let Ok(entries) = fs::read_dir(path) else { return false; };
    let mut count = 0;
    let mut total_bytes = 0u64;
    for entry in entries {
        let Ok(entry) = entry else { return false; };
        count += 1;
        if count > 200 || !ordinary(&entry.path(), false) { return false; }
        let Ok(metadata) = fs::symlink_metadata(entry.path()) else { return false; };
        if metadata.len() > 32 * 1024 * 1024 { return false; }
        total_bytes = total_bytes.saturating_add(metadata.len());
        if total_bytes > 64 * 1024 * 1024 { return false; }
        let name = entry.file_name();
        let Some(name) = name.to_str() else { return false; };
        let registration_backup = name.strip_prefix("previous-registration-")
            .and_then(|value| value.strip_suffix(".json"))
            .is_some_and(|value| !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit()));
        if !PAYLOAD_FILES.contains(&name) && !registration_backup { return false; }
    }
    if !PAYLOAD_FILES.iter().all(|name| ordinary(&path.join(name), false)) { return false; }
    let mut content_hash = Sha256::new();
    for name in PAYLOAD_FILES {
        let Ok(bytes) = fs::read(path.join(name)) else { return false; };
        content_hash.update(name.as_bytes());
        content_hash.update(bytes);
    }
    let expected_hash = hex::encode(content_hash.finalize());
    if !expected_hash.starts_with(name) { return false; }
    let rhp = path.join(PLUGIN);
    let Ok(meta) = fs::metadata(&rhp) else { return false; };
    if meta.len() > 32 * 1024 * 1024 { return false; }
    let Ok(bytes) = fs::read(rhp) else { return false; };
    let mut attribute = vec![1, 0, 36];
    attribute.extend_from_slice(GUID);
    attribute.extend_from_slice(&[0, 0]);
    bytes.starts_with(b"MZ") && bytes.windows(attribute.len()).any(|value| value == attribute)
}

#[derive(Debug, Serialize)]
#[serde(rename_all="camelCase")]
pub struct PayloadBackup {
    pub original_path: PathBuf,
    pub backup_path: PathBuf,
}

/// Run only after the new registration/payload verifies, and only while Rhino is closed.
/// Rename is within LocalAppData. A durable journal is written before each move.
pub fn backup_obsolete_payloads(version_root: &Path, current_plugin: &Path, backup_root: &Path) -> Result<Vec<PayloadBackup>, String> {
    if !ordinary(version_root, true) || !safe_directory_chain(version_root) || !safe_directory_chain(backup_root) {
        return Err("Managed plugin or backup directory is linked/unsafe; old versions were left untouched.".into());
    }
    let root = version_root.canonicalize().map_err(|error| error.to_string())?;
    if !ordinary(current_plugin, false) { return Err("The current registered plugin is missing; no cleanup was attempted.".into()); }
    let current = current_plugin.canonicalize().map_err(|error| error.to_string())?;
    let current_directory = current.parent().ok_or("Current plugin has no parent")?;
    if current_directory.parent() != Some(root.as_path()) || !verified_managed_payload(current_directory) {
        return Err("Current registration is outside the verified managed payload root; cleanup skipped.".into());
    }
    let mut candidates = Vec::new();
    let mut count = 0;
    for entry in fs::read_dir(&root).map_err(|error| error.to_string())? {
        count += 1;
        if count > 512 { return Err("Too many managed plugin directories; automatic cleanup skipped.".into()); }
        let path = entry.map_err(|error| error.to_string())?.path();
        if !verified_managed_payload(&path) { continue; }
        let resolved = path.canonicalize().map_err(|error| error.to_string())?;
        if resolved == current_directory { continue; }
        if resolved.parent() != Some(root.as_path()) { return Err("Old payload escaped its managed root.".into()); }
        candidates.push(resolved);
    }
    if candidates.is_empty() { return Ok(vec![]); }
    candidates.sort();
    fs::create_dir_all(backup_root).map_err(|error| error.to_string())?;
    if !safe_directory_chain(backup_root) { return Err("Backup directory changed; cleanup skipped.".into()); }
    let backups = backup_root.canonicalize().map_err(|error| error.to_string())?;
    if backups.starts_with(&root) || root.starts_with(&backups) {
        return Err("Backup directory must be outside the managed version root.".into());
    }
    let batch = backups.join(format!("obsolete-{}-{:x}", std::process::id(), rand::random::<u64>()));
    fs::create_dir(&batch).map_err(|error| error.to_string())?;
    let planned: Vec<PayloadBackup> = candidates.into_iter().map(|source| PayloadBackup {
        backup_path: batch.join(source.file_name().unwrap()), original_path: source,
    }).collect();
    let journal = serde_json::to_vec_pretty(&planned).map_err(|error| error.to_string())?;
    fs::write(batch.join("RESTORE.json"), journal).map_err(|error| error.to_string())?;
    for (index, item) in planned.iter().enumerate() {
        if !safe_directory_chain(&item.original_path) || !verified_managed_payload(&item.original_path)
            || item.original_path.parent() != Some(root.as_path()) || item.backup_path.exists()
            || !safe_directory_chain(&batch) {
            return Err(format!("Payload changed during cleanup; stopped. Recovery journal: {}", batch.display()));
        }
        if let Err(error) = fs::rename(&item.original_path, &item.backup_path) {
            for moved in planned[..index].iter().rev() {
                if !moved.original_path.exists() { let _ = fs::rename(&moved.backup_path, &moved.original_path); }
            }
            return Err(format!("Old plugin could not be moved: {error}. Close Rhino and retry. Recovery journal: {}", batch.display()));
        }
    }
    Ok(planned)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn temp() -> PathBuf {
        std::env::temp_dir().join(format!("rhino-obsolete-{:x}",rand::random::<u64>()))
    }
    fn fixture(root: &Path, seed: &str, owned: bool) -> PathBuf {
        let mut files = PAYLOAD_FILES.iter().map(|name| {
            let mut bytes = format!("{seed}-{name}").into_bytes();
            if *name == PLUGIN {
                bytes = b"MZ fixture".to_vec();
                if owned { bytes.extend_from_slice(&[1,0,36]); bytes.extend_from_slice(GUID); bytes.extend_from_slice(&[0,0]); }
            }
            (*name, bytes)
        }).collect::<Vec<_>>();
        let mut digest=Sha256::new();
        for (name,bytes) in &files { digest.update(name.as_bytes()); digest.update(bytes); }
        let hash=hex::encode(digest.finalize());
        let path=root.join(&hash[..20]); fs::create_dir_all(&path).unwrap();
        for (name,bytes) in files.drain(..) { fs::write(path.join(name),bytes).unwrap(); }
        path
    }
    #[test]
    fn moves_old_versions_preserves_current_and_allows_restore() {
        let temp=temp(); let root=temp.join("plugin/9");
        let old=fixture(&root,"old",true);
        let current=fixture(&root,"current",true);
        let original=fs::read(old.join(PLUGIN)).unwrap();
        let backups=backup_obsolete_payloads(&root,&current.join(PLUGIN),&temp.join("backups/9")).unwrap();
        assert_eq!(backups.len(),1); assert!(!old.exists()); assert!(current.join(PLUGIN).exists());
        assert_eq!(fs::read(backups[0].backup_path.join(PLUGIN)).unwrap(),original);
        assert!(backups[0].backup_path.parent().unwrap().join("RESTORE.json").exists());
        assert!(backup_obsolete_payloads(&root,&current.join(PLUGIN),&temp.join("backups/9")).unwrap().is_empty());
        fs::rename(&backups[0].backup_path,&old).unwrap(); assert!(old.exists());
    }
    #[test]
    fn leaves_unknown_files_foreign_plugins_and_user_named_folders_untouched() {
        let temp=temp(); let root=temp.join("plugin/8");
        let current=fixture(&root,"current",true);
        let foreign=fixture(&root,"foreign",false);
        let user_payload=fixture(&root,"user",true);
        let user=root.join("my-plugin"); fs::rename(user_payload,&user).unwrap();
        let extra=fixture(&root,"extra",true); fs::write(extra.join("user-model.3dm"),b"keep").unwrap();
        assert!(backup_obsolete_payloads(&root,&current.join(PLUGIN),&temp.join("backups")).unwrap().is_empty());
        assert!(foreign.exists() && user.exists() && extra.exists());
    }
    #[test]
    fn rejects_missing_current_and_backup_inside_active_root() {
        let temp=temp(); let root=temp.join("plugin/9");
        let old=fixture(&root,"old",true); let current=fixture(&root,"current",true);
        assert!(backup_obsolete_payloads(&root,&root.join("missing").join(PLUGIN),&temp.join("backups")).is_err());
        assert!(backup_obsolete_payloads(&root,&current.join(PLUGIN),&root.join("backups")).is_err());
        assert!(old.exists() && current.exists());
    }
    #[test]
    fn backup_failure_leaves_old_and_current_payloads_intact() {
        let temp=temp(); let root=temp.join("plugin/9");
        let old=fixture(&root,"old",true); let current=fixture(&root,"current",true);
        let blocked=temp.join("backup-is-a-file"); fs::write(&blocked,b"keep").unwrap();
        assert!(backup_obsolete_payloads(&root,&current.join(PLUGIN),&blocked).is_err());
        assert!(old.exists() && current.exists());
    }
    #[test]
    fn does_not_touch_a_second_rhino_major_version() {
        let temp=temp(); let root=temp.join("plugin/8");
        let current=fixture(&root,"current",true); let other=fixture(&temp.join("plugin/9"),"other",true);
        assert!(backup_obsolete_payloads(&root,&current.join(PLUGIN),&temp.join("backups/8")).unwrap().is_empty());
        assert!(other.exists());
    }
}
