//! Reversible migration of this plugin's legacy per-user YAK installs.
//! Never loads an RHP, executes package content, or touches unrelated packages.
use std::{fs, path::{Path, PathBuf}};
use serde::{Serialize, Deserialize};
const PACKAGE: &str = "inspiration-drawer-rhino";
const RHP: &str = "InspirationDrawer.Rhino.rhp";
const GUID: &[u8] = b"b55c8d32-2c2f-4da2-84ca-b7c88c1a8de5";

fn ordinary_dir(path: &Path) -> bool {
    let Ok(meta) = fs::symlink_metadata(path) else { return false; };
    if !meta.is_dir() || meta.file_type().is_symlink() { return false; }
    #[cfg(windows)] {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 { return false; }
    }
    true
}
fn owned_rhp(path: &Path) -> bool {
    let Ok(meta) = fs::symlink_metadata(path) else { return false; };
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > 32 * 1024 * 1024 { return false; }
    #[cfg(windows)] {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 { return false; }
    }
    let Ok(bytes) = fs::read(path) else { return false; };
    // Serialized assembly GuidAttribute: prolog 01 00, UTF8 string length 24h,
    // exact plugin identity, and zero named args. Read metadata, never load code.
    let mut attribute = vec![1, 0, 36]; attribute.extend_from_slice(GUID); attribute.extend_from_slice(&[0,0]);
    bytes.starts_with(b"MZ") && bytes.windows(attribute.len()).any(|value| value == attribute)
}
pub fn find_legacy_packages(packages: &Path) -> Result<Vec<PathBuf>, String> {
    if !packages.exists() { return Ok(vec![]); }
    if !ordinary_dir(packages) { return Err("Rhino package directory is linked or unsafe; no packages were changed.".into()); }
    let package = packages.join(PACKAGE);
    if !package.exists() { return Ok(vec![]); }
    if !ordinary_dir(&package) { return Err("Legacy plugin package is linked; repair it manually without changing other plugins.".into()); }
    let root = package.canonicalize().map_err(|e|e.to_string())?;
    let mut result = vec![];
    for entry in fs::read_dir(&root).map_err(|e| e.to_string())?.take(100) {
        let candidate = entry.map_err(|e|e.to_string())?.path();
        if !ordinary_dir(&candidate) { continue; }
        let canonical = candidate.canonicalize().map_err(|e|e.to_string())?;
        if canonical.parent() != Some(root.as_path()) { return Err("Legacy package escaped its validated root.".into()); }
        let version = canonical.file_name().and_then(|n|n.to_str()).unwrap_or("");
        if version.is_empty() || !version.chars().all(|c| c.is_ascii_alphanumeric() || ".-+_".contains(c)) { continue; }
        let manifest = canonical.join("manifest.yml");
        let meta = match fs::symlink_metadata(&manifest) { Ok(v) => v, Err(_) => continue };
        if meta.file_type().is_symlink() || meta.len() > 128 * 1024 { continue; }
        let text = fs::read_to_string(&manifest).unwrap_or_default();
        if !text.lines().any(|line| line.trim_start_matches('\u{feff}').trim().strip_prefix("name:")
            .is_some_and(|value| value.trim().trim_matches(['\'', '"']) == PACKAGE)) { continue; }
        let matching = [canonical.join(RHP), canonical.join("net7.0").join(RHP), canonical.join("net8.0").join(RHP)]
            .iter().any(|file| file.parent().is_some_and(ordinary_dir) && owned_rhp(file));
        if matching { result.push(canonical); }
    }
    result.sort(); Ok(result)
}
#[derive(Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct PackageBackup { pub original_path: PathBuf, pub backup_path: PathBuf }

/// Must be called only after Rhino is closed. Paths are revalidated before rename.
/// Backup destination is deliberately outside Rhino's package scanner.
pub fn backup_legacy_packages(packages: &Path, backup_root: &Path) -> Result<Vec<PackageBackup>, String> {
    let candidates=find_legacy_packages(packages)?;
    if candidates.is_empty() { return Ok(vec![]); }
    fs::create_dir_all(backup_root).map_err(|e|e.to_string())?;
    if !ordinary_dir(backup_root) { return Err("Backup root is linked or unsafe.".into()); }
    let backup_root=backup_root.canonicalize().map_err(|e|e.to_string())?;
    let package_root=packages.join(PACKAGE).canonicalize().map_err(|e|e.to_string())?;
    if backup_root.starts_with(packages.canonicalize().map_err(|e|e.to_string())?) { return Err("Backup must be outside Rhino's scan directory.".into()); }
    let batch=backup_root.join(format!("migration-{}-{:x}",std::process::id(),rand::random::<u64>()));
    fs::create_dir(&batch).map_err(|e|e.to_string())?;
    let mut moved:Vec<PackageBackup>=vec![];
    for source in candidates {
        let resolved=source.canonicalize().map_err(|e|e.to_string())?;
        if resolved.parent()!=Some(package_root.as_path()) || !ordinary_dir(&resolved) { return Err("Package source changed during migration.".into()); }
        let target=batch.join(resolved.file_name().ok_or("Missing package version")?);
        if target.parent()!=Some(batch.as_path()) || target.exists() { return Err("Backup destination is invalid.".into()); }
        if let Err(error)=fs::rename(&resolved,&target) {
            // No deletion: restore already moved versions where possible.
            let mut rollback_failed=false;
            for item in moved.iter().rev() { if item.original_path.exists() || fs::rename(&item.backup_path,&item.original_path).is_err() { rollback_failed=true; } }
            return Err(format!("Could not move duplicate plugin to backup: {error}. Close Rhino and retry. Backups: {}. Restore incomplete: {rollback_failed}",batch.display()));
        }
        moved.push(PackageBackup{original_path:resolved,backup_path:target});
        // Record each completed rename so a partial failure remains recoverable.
        let journal=serde_json::to_string_pretty(&moved).map_err(|e|e.to_string())?;
        fs::write(batch.join("RESTORE.json"),journal).map_err(|e|format!("Backup is safe at {}, but journal write failed: {e}",batch.display()))?;
    }
    Ok(moved)
}

#[cfg(test)] mod tests {
 use super::*;
 fn fixture(root:&Path,version:&str,owned:bool) -> PathBuf {
  let base=root.join(PACKAGE).join(version);fs::create_dir_all(base.join("net8.0")).unwrap();
  fs::write(base.join("manifest.yml"),"name: inspiration-drawer-rhino\nversion: 0.1.0-beta.1\n").unwrap();
  let mut bytes=b"MZ fixture ".to_vec();if owned {bytes.extend_from_slice(&[1,0,36]);bytes.extend_from_slice(GUID);bytes.extend_from_slice(&[0,0]);}
  fs::write(base.join("net8.0").join(RHP),bytes).unwrap();base
 }
 #[test] fn migrates_only_verified_same_id_packages_and_preserves_restore_journal(){
  let temp=std::env::temp_dir().join(format!("rhino-migrate-{:x}",rand::random::<u64>()));let packages=temp.join("packages/9.0");
  let old=fixture(&packages,"0.1.0-beta.1",true);let current=fixture(&packages,"0.1.0-beta.23",true);let foreign=fixture(&packages,"custom",false);
  let original=fs::read(old.join("net8.0").join(RHP)).unwrap();
  let backups=backup_legacy_packages(&packages,&temp.join("backups")).unwrap();assert_eq!(backups.len(),2);assert!(!old.exists()&&!current.exists());assert!(foreign.exists());
  assert_eq!(fs::read(backups[0].backup_path.join("net8.0").join(RHP)).unwrap(),original);
  let journal:Vec<PackageBackup>=serde_json::from_str(&fs::read_to_string(backups[0].backup_path.parent().unwrap().join("RESTORE.json")).unwrap()).unwrap();assert_eq!(journal.len(),2);
  assert!(find_legacy_packages(&packages).unwrap().is_empty());assert!(backup_legacy_packages(&packages,&temp.join("backups")).unwrap().is_empty());
  for item in backups {fs::rename(item.backup_path,item.original_path).unwrap();}assert!(old.exists());
 }
 #[test] fn refuses_backups_inside_package_scanner(){
  let temp=std::env::temp_dir().join(format!("rhino-migrate-{:x}",rand::random::<u64>()));let packages=temp.join("packages/8.0");let old=fixture(&packages,"0.1.0-beta.1",true);
  assert!(backup_legacy_packages(&packages,&packages.join("backups")).is_err());assert!(old.exists());
 }
 #[test] fn ignores_unrelated_manifests_even_with_matching_guid(){
  let temp=std::env::temp_dir().join(format!("rhino-migrate-{:x}",rand::random::<u64>()));let base=fixture(&temp,"0.1.0-beta.1",true);fs::write(base.join("manifest.yml"),"name: other-plugin").unwrap();assert!(find_legacy_packages(&temp).unwrap().is_empty());assert!(base.exists());
 }
}
