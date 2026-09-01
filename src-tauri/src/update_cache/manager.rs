use super::state::{InstallerTempEnvironment, UpdateCacheState};
use std::collections::BTreeSet;
use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, SystemTime};

const STATE_FILE_NAME: &str = "state.json";
const DOWNLOADED_DIR_NAME: &str = "downloaded";
const PENDING_DIR_NAME: &str = "pending";
const STALE_TEMP_FILE_AGE: Duration = Duration::from_secs(7 * 24 * 60 * 60);

fn is_link_like(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
        return metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0;
    }
    #[cfg(not(target_os = "windows"))]
    false
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct CleanupReport {
    pub removed: usize,
    pub skipped: usize,
    pub failed: usize,
}

pub struct UpdateCacheManager {
    root: PathBuf,
    state_path: PathBuf,
    state: UpdateCacheState,
}

impl UpdateCacheManager {
    pub fn new(root: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&root)
            .map_err(|error| format!("create update cache directory failed: {error}"))?;
        reject_symlink_or_non_directory(&root)?;

        let root = fs::canonicalize(&root)
            .map_err(|error| format!("resolve update cache directory failed: {error}"))?;
        let downloaded_dir = root.join(DOWNLOADED_DIR_NAME);
        let pending_dir = root.join(PENDING_DIR_NAME);
        ensure_managed_directory(&downloaded_dir)?;
        ensure_managed_directory(&pending_dir)?;

        let state_path = root.join(STATE_FILE_NAME);
        validate_optional_regular_file(&state_path)?;
        let state = load_state(&state_path);

        Ok(Self {
            root,
            state_path,
            state,
        })
    }

    pub fn package_path(&self, version: &str) -> PathBuf {
        let safe_version = sanitize_filename_component(version);
        let nonce = rand::random::<u64>();
        self.root.join(DOWNLOADED_DIR_NAME).join(format!(
            "inspiration-drawer-{safe_version}-{nonce:016x}.update"
        ))
    }

    pub fn prepare_installer_temp_dir(&mut self, version: &str) -> Result<PathBuf, String> {
        let safe_version = sanitize_filename_component(version);
        let nonce = rand::random::<u64>();
        let path = self
            .root
            .join(PENDING_DIR_NAME)
            .join(format!("tauri-installer-{safe_version}-{nonce:016x}"));
        fs::create_dir(&path)
            .map_err(|error| format!("create managed installer temp directory failed: {error}"))?;
        reject_symlink_or_non_directory(&path)?;

        let relative = self.path_to_relative(&path)?;
        validate_managed_installer_dir_relative_path(Path::new(&relative))?;
        self.state.pending_installer_dirs.push(relative.clone());
        self.state.active_installer_dir = Some(relative);
        if let Err(error) = self.save_state() {
            let _ = fs::remove_dir(&path);
            return Err(error);
        }
        Ok(path)
    }

    pub fn register_downloaded_package(&mut self, package_path: &Path) -> Result<(), String> {
        let relative = self.path_to_relative(package_path)?;
        validate_managed_package_relative_path(Path::new(&relative))?;
        if !self.state.managed_packages.contains(&relative) {
            self.state.managed_packages.push(relative.clone());
        }
        self.state.active_package = Some(relative);
        self.save_state()
    }

    pub fn store_downloaded_package(
        &self,
        package_path: &Path,
        bytes: &[u8],
    ) -> Result<(), String> {
        let relative = self.path_to_relative(package_path)?;
        validate_managed_package_relative_path(Path::new(&relative))?;
        if !self.state.managed_packages.contains(&relative) {
            return Err("update package was not registered in the managed cache".to_string());
        }

        validate_write_target(&self.root, package_path)?;
        let partial_path = append_extension(package_path, ".partial");
        remove_existing_regular_file(&self.root, &partial_path)?;

        let write_result = (|| -> Result<(), String> {
            let mut file = OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&partial_path)
                .map_err(|error| format!("create update cache package failed: {error}"))?;
            file.write_all(bytes)
                .map_err(|error| format!("write update cache package failed: {error}"))?;
            file.sync_all()
                .map_err(|error| format!("flush update cache package failed: {error}"))?;

            remove_existing_regular_file(&self.root, package_path)?;
            fs::rename(&partial_path, package_path)
                .map_err(|error| format!("finalize update cache package failed: {error}"))?;
            Ok(())
        })();

        if write_result.is_err() {
            let _ = remove_existing_regular_file(&self.root, &partial_path);
        }
        write_result
    }

    pub fn mark_package_for_cleanup(
        &mut self,
        package_path: &Path,
        installed_version: Option<&str>,
    ) -> Result<(), String> {
        let relative = self.path_to_relative(package_path)?;
        validate_managed_package_relative_path(Path::new(&relative))?;
        if !self.state.managed_packages.contains(&relative) {
            self.state.managed_packages.push(relative.clone());
        }
        if !self.state.pending_cleanup.contains(&relative) {
            self.state.pending_cleanup.push(relative);
        }
        if let Some(version) = installed_version {
            self.state.last_installed_version = Some(version.to_string());
        }
        self.save_state()
    }

    pub fn clear_active_package(&mut self) -> Result<(), String> {
        self.state.active_package = None;
        self.save_state()
    }

    pub fn clear_active_installer_dir(&mut self) -> Result<(), String> {
        self.state.active_installer_dir = None;
        self.save_state()
    }

    pub fn record_installer_temp_environment(&mut self) -> Result<(), String> {
        self.state.installer_temp_environment = Some(InstallerTempEnvironment {
            temp: environment_value("TEMP"),
            tmp: environment_value("TMP"),
            tmpdir: environment_value("TMPDIR"),
        });
        self.save_state()
    }

    pub fn restore_installer_temp_environment(&mut self) -> Result<(), String> {
        let Some(environment) = self.state.installer_temp_environment.clone() else {
            return Ok(());
        };
        let active_dir = self
            .state
            .active_installer_dir
            .as_deref()
            .and_then(|relative| self.resolve_installer_dir_relative(relative).ok());
        let inherited_managed_temp = active_dir.as_ref().is_some_and(|active_dir| {
            ["TEMP", "TMP", "TMPDIR"].into_iter().any(|name| {
                std::env::var_os(name)
                    .map(PathBuf::from)
                    .is_some_and(|value| paths_equivalent(&value, active_dir))
            })
        });
        if inherited_managed_temp {
            restore_environment_value("TEMP", environment.temp.as_deref());
            restore_environment_value("TMP", environment.tmp.as_deref());
            restore_environment_value("TMPDIR", environment.tmpdir.as_deref());
        }
        self.state.installer_temp_environment = None;
        self.save_state()
    }

    pub fn clear_installer_temp_environment_record(&mut self) -> Result<(), String> {
        self.state.installer_temp_environment = None;
        self.save_state()
    }

    pub fn cleanup_update_cache(&mut self, exclude_path: Option<&Path>) -> CleanupReport {
        let mut report = CleanupReport::default();
        let exclude_relative = exclude_path.and_then(|path| match self.path_to_relative(path) {
            Ok(relative) => Some(relative),
            Err(error) => {
                report.skipped += 1;
                eprintln!("[update-cache] ignored unsafe cleanup exclusion: {error}");
                None
            }
        });
        let active_relative = self.state.active_package.clone();
        let active_installer_dir = self.state.active_installer_dir.clone();
        let tracked = self
            .state
            .managed_packages
            .iter()
            .chain(self.state.pending_cleanup.iter())
            .cloned()
            .collect::<BTreeSet<_>>();
        let mut completed = BTreeSet::new();
        let mut invalid = BTreeSet::new();

        for relative in tracked {
            if active_relative.as_deref() == Some(relative.as_str())
                || exclude_relative.as_deref() == Some(relative.as_str())
            {
                report.skipped += 1;
                continue;
            }

            let package_path = match self.resolve_relative(&relative) {
                Ok(path) => path,
                Err(error) => {
                    report.skipped += 1;
                    invalid.insert(relative.clone());
                    eprintln!("[update-cache] rejected unsafe state path {relative:?}: {error}");
                    continue;
                }
            };

            match delete_managed_file(&self.root, &package_path) {
                Ok(DeleteResult::Removed | DeleteResult::Missing) => {
                    report.removed += 1;
                    completed.insert(relative);
                }
                Err(error) => {
                    report.failed += 1;
                    eprintln!(
                        "[update-cache] cleanup failed for {}: {error}",
                        package_path.display()
                    );
                }
            }
        }

        let finished = completed.union(&invalid).cloned().collect::<BTreeSet<_>>();
        self.state
            .managed_packages
            .retain(|entry| !finished.contains(entry));
        self.state
            .pending_cleanup
            .retain(|entry| !finished.contains(entry));
        if self
            .state
            .active_package
            .as_ref()
            .is_some_and(|entry| invalid.contains(entry))
        {
            self.state.active_package = None;
        }

        let installer_dirs = self
            .state
            .pending_installer_dirs
            .iter()
            .cloned()
            .collect::<BTreeSet<_>>();
        let mut completed_dirs = BTreeSet::new();
        let mut invalid_dirs = BTreeSet::new();
        for relative in installer_dirs {
            if active_installer_dir.as_deref() == Some(relative.as_str()) {
                report.skipped += 1;
                continue;
            }

            let installer_dir = match self.resolve_installer_dir_relative(&relative) {
                Ok(path) => path,
                Err(error) => {
                    report.skipped += 1;
                    invalid_dirs.insert(relative.clone());
                    eprintln!(
                        "[update-cache] rejected unsafe installer directory state {relative:?}: {error}"
                    );
                    continue;
                }
            };
            match delete_managed_directory(&self.root, &installer_dir) {
                Ok(DeleteResult::Removed | DeleteResult::Missing) => {
                    report.removed += 1;
                    completed_dirs.insert(relative);
                }
                Err(error) => {
                    report.failed += 1;
                    eprintln!(
                        "[update-cache] installer directory cleanup failed for {}: {error}",
                        installer_dir.display()
                    );
                }
            }
        }

        let finished_dirs = completed_dirs
            .union(&invalid_dirs)
            .cloned()
            .collect::<BTreeSet<_>>();
        self.state
            .pending_installer_dirs
            .retain(|entry| !finished_dirs.contains(entry));
        if self
            .state
            .active_installer_dir
            .as_ref()
            .is_some_and(|entry| invalid_dirs.contains(entry))
        {
            self.state.active_installer_dir = None;
        }

        self.cleanup_stale_temp_files(
            active_relative.as_deref(),
            exclude_relative.as_deref(),
            &mut report,
        );
        if let Err(error) = self.save_state() {
            report.failed += 1;
            eprintln!("[update-cache] persist cleanup state failed: {error}");
        }

        eprintln!(
            "[update-cache] cleanup: removed {} files, skipped {} files, failed {} files",
            report.removed, report.skipped, report.failed
        );
        report
    }

    fn cleanup_stale_temp_files(
        &self,
        active_relative: Option<&str>,
        exclude_relative: Option<&str>,
        report: &mut CleanupReport,
    ) {
        let now = SystemTime::now();
        for directory_name in [DOWNLOADED_DIR_NAME, PENDING_DIR_NAME] {
            let directory = self.root.join(directory_name);
            let entries = match fs::read_dir(&directory) {
                Ok(entries) => entries,
                Err(error) => {
                    report.failed += 1;
                    eprintln!(
                        "[update-cache] read stale-file directory {} failed: {error}",
                        directory.display()
                    );
                    continue;
                }
            };

            for entry in entries.flatten() {
                let path = entry.path();
                let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
                if !name.ends_with(".tmp") && !name.ends_with(".partial") {
                    continue;
                }
                let relative = match self.path_to_relative(&path) {
                    Ok(relative) => relative,
                    Err(error) => {
                        report.skipped += 1;
                        eprintln!(
                            "[update-cache] rejected unsafe temporary path {}: {error}",
                            path.display()
                        );
                        continue;
                    }
                };
                if is_active_or_partial(&relative, active_relative)
                    || is_active_or_partial(&relative, exclude_relative)
                {
                    report.skipped += 1;
                    continue;
                }

                let is_stale = entry
                    .metadata()
                    .and_then(|metadata| metadata.modified())
                    .ok()
                    .and_then(|modified| now.duration_since(modified).ok())
                    .is_some_and(|age| age >= STALE_TEMP_FILE_AGE);
                if !is_stale {
                    continue;
                }

                match delete_managed_file(&self.root, &path) {
                    Ok(DeleteResult::Removed | DeleteResult::Missing) => report.removed += 1,
                    Err(error) => {
                        report.failed += 1;
                        eprintln!(
                            "[update-cache] stale temporary cleanup failed for {}: {error}",
                            path.display()
                        );
                    }
                }
            }
        }
    }

    fn path_to_relative(&self, path: &Path) -> Result<String, String> {
        if !path.is_absolute() {
            return Err(format!("path is not absolute: {}", path.display()));
        }
        if path
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::CurDir))
        {
            return Err(format!(
                "path contains traversal components: {}",
                path.display()
            ));
        }

        let parent = path
            .parent()
            .ok_or_else(|| format!("path has no parent: {}", path.display()))?;
        let file_name = path
            .file_name()
            .ok_or_else(|| format!("path has no file name: {}", path.display()))?;
        let canonical_parent = fs::canonicalize(parent)
            .map_err(|error| format!("resolve path parent failed: {error}"))?;
        if !canonical_parent.starts_with(&self.root) {
            return Err(format!("path is outside update cache: {}", path.display()));
        }

        let normalized = canonical_parent.join(file_name);
        let relative = normalized
            .strip_prefix(&self.root)
            .map_err(|_| format!("path is outside update cache: {}", path.display()))?;
        validate_relative_path(relative)?;
        Ok(relative.to_string_lossy().to_string())
    }

    fn resolve_relative(&self, relative: &str) -> Result<PathBuf, String> {
        let relative_path = Path::new(relative);
        validate_managed_package_relative_path(relative_path)?;
        let target = self.root.join(relative_path);
        let parent = target
            .parent()
            .ok_or_else(|| "managed path has no parent".to_string())?;
        let canonical_parent = fs::canonicalize(parent)
            .map_err(|error| format!("resolve managed path parent failed: {error}"))?;
        if !canonical_parent.starts_with(&self.root) {
            return Err("managed path parent escaped update cache".to_string());
        }
        Ok(canonical_parent.join(
            target
                .file_name()
                .ok_or_else(|| "managed path has no file name".to_string())?,
        ))
    }

    fn resolve_installer_dir_relative(&self, relative: &str) -> Result<PathBuf, String> {
        let relative_path = Path::new(relative);
        validate_managed_installer_dir_relative_path(relative_path)?;
        let target = self.root.join(relative_path);
        let parent = target
            .parent()
            .ok_or_else(|| "installer directory has no parent".to_string())?;
        let canonical_parent = fs::canonicalize(parent)
            .map_err(|error| format!("resolve installer directory parent failed: {error}"))?;
        if !canonical_parent.starts_with(&self.root) {
            return Err("installer directory parent escaped update cache".to_string());
        }
        Ok(canonical_parent.join(
            target
                .file_name()
                .ok_or_else(|| "installer directory has no file name".to_string())?,
        ))
    }

    fn save_state(&mut self) -> Result<(), String> {
        self.state.normalize();
        validate_optional_regular_file(&self.state_path)?;
        let bytes = serde_json::to_vec_pretty(&self.state)
            .map_err(|error| format!("serialize update cache state failed: {error}"))?;
        let mut file = OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&self.state_path)
            .map_err(|error| format!("open update cache state failed: {error}"))?;
        file.write_all(&bytes)
            .map_err(|error| format!("write update cache state failed: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("flush update cache state failed: {error}"))
    }
}

fn load_state(state_path: &Path) -> UpdateCacheState {
    match fs::read(state_path) {
        Ok(bytes) => {
            match serde_json::from_slice::<UpdateCacheState>(&bytes) {
                Ok(mut state) => {
                    state.normalize();
                    state
                }
                Err(error) => {
                    eprintln!("[update-cache] state is corrupt; starting safely with empty state: {error}");
                    UpdateCacheState::default()
                }
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => UpdateCacheState::default(),
        Err(error) => {
            eprintln!(
                "[update-cache] read state failed; starting safely with empty state: {error}"
            );
            UpdateCacheState::default()
        }
    }
}

fn ensure_managed_directory(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path)
        .map_err(|error| format!("create managed update cache directory failed: {error}"))?;
    reject_symlink_or_non_directory(path)
}

fn reject_symlink_or_non_directory(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("inspect directory {} failed: {error}", path.display()))?;
    if is_link_like(&metadata) || !metadata.is_dir() {
        return Err(format!(
            "managed update cache directory is not a real directory: {}",
            path.display()
        ));
    }
    Ok(())
}

fn reject_symlink_or_non_file(path: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("inspect file {} failed: {error}", path.display()))?;
    if is_link_like(&metadata) || !metadata.is_file() {
        return Err(format!(
            "managed update cache state is not a real file: {}",
            path.display()
        ));
    }
    Ok(())
}

fn validate_optional_regular_file(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(_) => reject_symlink_or_non_file(path),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("inspect file {} failed: {error}", path.display())),
    }
}

fn validate_relative_path(path: &Path) -> Result<(), String> {
    if path.as_os_str().is_empty() || path.is_absolute() {
        return Err("managed state path must be a non-empty relative path".to_string());
    }
    let components = path.components().collect::<Vec<_>>();
    if components
        .iter()
        .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(format!("managed state path is unsafe: {}", path.display()));
    }
    if components.len() != 2 {
        return Err(format!(
            "managed state path must point directly inside a package directory: {}",
            path.display()
        ));
    }
    let directory = match components[0] {
        Component::Normal(value) => value,
        _ => unreachable!(),
    };
    if directory != DOWNLOADED_DIR_NAME && directory != PENDING_DIR_NAME {
        return Err(format!(
            "managed state path uses an unknown directory: {}",
            path.display()
        ));
    }
    Ok(())
}

fn validate_managed_package_relative_path(path: &Path) -> Result<(), String> {
    validate_relative_path(path)?;
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "managed package file name is not valid UTF-8".to_string())?;
    if !file_name.starts_with("inspiration-drawer-") || !file_name.ends_with(".update") {
        return Err(format!(
            "managed package file name is not updater-owned: {}",
            path.display()
        ));
    }
    Ok(())
}

fn validate_managed_installer_dir_relative_path(path: &Path) -> Result<(), String> {
    validate_relative_path(path)?;
    if path.parent() != Some(Path::new(PENDING_DIR_NAME)) {
        return Err(format!(
            "managed installer directory must be inside pending: {}",
            path.display()
        ));
    }
    let directory_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "managed installer directory name is not valid UTF-8".to_string())?;
    if !directory_name.starts_with("tauri-installer-") {
        return Err(format!(
            "managed installer directory name is not updater-owned: {}",
            path.display()
        ));
    }
    Ok(())
}

fn validate_write_target(root: &Path, path: &Path) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("write target has no parent: {}", path.display()))?;
    let canonical_parent = fs::canonicalize(parent)
        .map_err(|error| format!("resolve write target parent failed: {error}"))?;
    if !canonical_parent.starts_with(root) {
        return Err(format!(
            "write target escaped update cache: {}",
            path.display()
        ));
    }
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            if is_link_like(&metadata) || !metadata.is_file() {
                return Err(format!(
                    "write target is not a regular file: {}",
                    path.display()
                ));
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(format!("inspect write target failed: {error}")),
    }
    Ok(())
}

fn remove_existing_regular_file(root: &Path, path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            if is_link_like(&metadata) || !metadata.is_file() {
                return Err(format!(
                    "refused to replace non-regular file: {}",
                    path.display()
                ));
            }
            let canonical = fs::canonicalize(path)
                .map_err(|error| format!("resolve existing managed file failed: {error}"))?;
            if !canonical.starts_with(root) {
                return Err(format!(
                    "existing managed file escaped update cache: {}",
                    path.display()
                ));
            }
            fs::remove_file(path)
                .map_err(|error| format!("remove existing managed file failed: {error}"))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("inspect existing managed file failed: {error}")),
    }
}

enum DeleteResult {
    Removed,
    Missing,
}

fn delete_managed_file(root: &Path, path: &Path) -> Result<DeleteResult, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(DeleteResult::Missing)
        }
        Err(error) => return Err(format!("inspect managed file failed: {error}")),
    };
    if is_link_like(&metadata) || !metadata.is_file() {
        return Err("refused to delete a symlink, junction, or non-file entry".to_string());
    }

    let canonical =
        fs::canonicalize(path).map_err(|error| format!("resolve managed file failed: {error}"))?;
    let canonical_parent = canonical
        .parent()
        .ok_or_else(|| "managed file has no parent".to_string())?;
    if !canonical.starts_with(root) || !canonical_parent.starts_with(root) {
        return Err("managed file escaped update cache".to_string());
    }

    match fs::remove_file(path) {
        Ok(()) => Ok(DeleteResult::Removed),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(DeleteResult::Missing),
        Err(error) => Err(format!("remove managed file failed: {error}")),
    }
}

fn delete_managed_directory(root: &Path, path: &Path) -> Result<DeleteResult, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(DeleteResult::Missing)
        }
        Err(error) => return Err(format!("inspect managed directory failed: {error}")),
    };
    if is_link_like(&metadata) || !metadata.is_dir() {
        return Err("refused to delete a symlink, junction, or non-directory entry".to_string());
    }

    let canonical = fs::canonicalize(path)
        .map_err(|error| format!("resolve managed directory failed: {error}"))?;
    if canonical == root || !canonical.starts_with(root) {
        return Err("managed directory escaped update cache".to_string());
    }
    validate_directory_tree(root, path)?;

    match fs::remove_dir_all(path) {
        Ok(()) => Ok(DeleteResult::Removed),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(DeleteResult::Missing),
        Err(error) => Err(format!("remove managed directory failed: {error}")),
    }
}

fn validate_directory_tree(root: &Path, directory: &Path) -> Result<(), String> {
    let entries = fs::read_dir(directory)
        .map_err(|error| format!("read managed directory failed: {error}"))?;
    for entry in entries {
        let entry =
            entry.map_err(|error| format!("read managed directory entry failed: {error}"))?;
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)
            .map_err(|error| format!("inspect managed directory entry failed: {error}"))?;
        if is_link_like(&metadata) {
            return Err(format!(
                "managed directory contains a symlink or junction: {}",
                path.display()
            ));
        }
        let canonical = fs::canonicalize(&path)
            .map_err(|error| format!("resolve managed directory entry failed: {error}"))?;
        if !canonical.starts_with(root) {
            return Err(format!(
                "managed directory entry escaped update cache: {}",
                path.display()
            ));
        }
        if metadata.is_dir() {
            validate_directory_tree(root, &path)?;
        } else if !metadata.is_file() {
            return Err(format!(
                "managed directory contains an unsupported entry: {}",
                path.display()
            ));
        }
    }
    Ok(())
}

fn append_extension(path: &Path, suffix: &str) -> PathBuf {
    let mut value = OsString::from(path.as_os_str());
    value.push(suffix);
    PathBuf::from(value)
}

fn is_active_or_partial(relative: &str, protected: Option<&str>) -> bool {
    protected.is_some_and(|protected| {
        relative == protected || relative == format!("{protected}.partial")
    })
}

fn sanitize_filename_component(value: &str) -> String {
    let mut output = value
        .chars()
        .take(64)
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_') {
                character
            } else {
                '_'
            }
        })
        .collect::<String>();
    if output.is_empty() {
        output.push_str("unknown");
    }
    output
}

fn environment_value(name: &str) -> Option<String> {
    std::env::var_os(name).map(|value| value.to_string_lossy().to_string())
}

fn restore_environment_value(name: &str, value: Option<&str>) {
    if let Some(value) = value {
        std::env::set_var(name, value);
    } else {
        std::env::remove_var(name);
    }
}

fn paths_equivalent(left: &Path, right: &Path) -> bool {
    match (fs::canonicalize(left), fs::canonicalize(right)) {
        (Ok(left), Ok(right)) => left == right,
        _ => left == right,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::panic::{catch_unwind, AssertUnwindSafe};

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(label: &str) -> Self {
            let path = std::env::temp_dir().join(format!(
                "inspiration-drawer-update-cache-{label}-{}-{:016x}",
                std::process::id(),
                rand::random::<u64>()
            ));
            fs::create_dir_all(&path).expect("create test directory");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn create_package(manager: &mut UpdateCacheManager, version: &str) -> PathBuf {
        let path = manager.package_path(version);
        manager
            .register_downloaded_package(&path)
            .expect("register package");
        manager
            .store_downloaded_package(&path, b"signed updater bytes")
            .expect("store package");
        path
    }

    #[test]
    fn removes_old_managed_update_package() {
        let directory = TestDirectory::new("old-package");
        let mut manager = UpdateCacheManager::new(directory.path().join("update-cache")).unwrap();
        let package = create_package(&mut manager, "6.0.21");
        manager.clear_active_package().unwrap();

        let report = manager.cleanup_update_cache(None);

        assert_eq!(report.removed, 1);
        assert!(!package.exists());
    }

    #[test]
    fn keeps_active_package_during_cleanup() {
        let directory = TestDirectory::new("active-package");
        let mut manager = UpdateCacheManager::new(directory.path().join("update-cache")).unwrap();
        let package = create_package(&mut manager, "6.0.21");

        let report = manager.cleanup_update_cache(None);

        assert!(package.exists());
        assert_eq!(report.skipped, 1);
    }

    #[test]
    fn clears_missing_pending_package_from_state() {
        let directory = TestDirectory::new("missing-pending");
        let root = directory.path().join("update-cache");
        let mut manager = UpdateCacheManager::new(root.clone()).unwrap();
        let package = manager.package_path("6.0.21");
        manager.register_downloaded_package(&package).unwrap();
        manager
            .mark_package_for_cleanup(&package, Some("6.0.21"))
            .unwrap();
        manager.clear_active_package().unwrap();

        manager.cleanup_update_cache(None);
        let reloaded = UpdateCacheManager::new(root).unwrap();

        assert!(reloaded.state.pending_cleanup.is_empty());
        assert!(reloaded.state.managed_packages.is_empty());
    }

    #[test]
    fn rejects_polluted_state_path_outside_cache() {
        let directory = TestDirectory::new("outside-path");
        let outside = directory.path().join("outside-installer.exe");
        fs::write(&outside, b"user installer").unwrap();
        let mut manager = UpdateCacheManager::new(directory.path().join("update-cache")).unwrap();
        let internal_metadata = manager.root.join("keep-metadata.txt");
        fs::write(&internal_metadata, b"not an update package").unwrap();
        let outside_text = outside.to_string_lossy().to_string();
        manager.state.managed_packages.push(outside_text.clone());
        manager.state.pending_cleanup.push(outside_text);
        manager
            .state
            .managed_packages
            .push("keep-metadata.txt".to_string());
        manager.save_state().unwrap();

        let report = manager.cleanup_update_cache(None);

        assert!(outside.exists());
        assert!(internal_metadata.exists());
        assert!(report.skipped >= 1);
    }

    #[test]
    fn cleanup_failure_does_not_panic() {
        let directory = TestDirectory::new("cleanup-failure");
        let mut manager = UpdateCacheManager::new(directory.path().join("update-cache")).unwrap();
        let package = manager.package_path("6.0.21");
        manager.register_downloaded_package(&package).unwrap();
        manager.clear_active_package().unwrap();
        fs::create_dir_all(&package).unwrap();

        let result = catch_unwind(AssertUnwindSafe(|| manager.cleanup_update_cache(None)));

        assert!(result.is_ok());
        assert!(result.unwrap().failed >= 1);
    }

    #[test]
    fn cleanup_before_download_does_not_block_new_package() {
        let directory = TestDirectory::new("before-download");
        let mut manager = UpdateCacheManager::new(directory.path().join("update-cache")).unwrap();
        let old_package = create_package(&mut manager, "6.0.20");
        manager.clear_active_package().unwrap();
        manager.cleanup_update_cache(None);

        let new_package = create_package(&mut manager, "6.0.21");

        assert!(!old_package.exists());
        assert!(new_package.exists());
    }

    #[test]
    fn install_ready_package_is_persisted_as_pending_cleanup() {
        let directory = TestDirectory::new("install-success");
        let root = directory.path().join("update-cache");
        let mut manager = UpdateCacheManager::new(root.clone()).unwrap();
        let package = create_package(&mut manager, "6.0.21");
        manager
            .mark_package_for_cleanup(&package, Some("6.0.21"))
            .unwrap();

        let reloaded = UpdateCacheManager::new(root).unwrap();
        let relative = reloaded.path_to_relative(&package).unwrap();
        assert!(reloaded.state.pending_cleanup.contains(&relative));
        assert_eq!(
            reloaded.state.last_installed_version.as_deref(),
            Some("6.0.21")
        );
    }

    #[test]
    fn next_startup_removes_pending_package() {
        let directory = TestDirectory::new("next-startup");
        let root = directory.path().join("update-cache");
        let mut manager = UpdateCacheManager::new(root.clone()).unwrap();
        let package = create_package(&mut manager, "6.0.21");
        manager
            .mark_package_for_cleanup(&package, Some("6.0.21"))
            .unwrap();
        let installer_dir = manager.prepare_installer_temp_dir("6.0.21").unwrap();
        let tauri_temp_dir = installer_dir.join("Inspiration Drawer-6.0.21-updater-abc123");
        fs::create_dir(&tauri_temp_dir).unwrap();
        let extracted_installer = tauri_temp_dir.join("Inspiration Drawer Setup.exe");
        fs::write(&extracted_installer, b"installer").unwrap();
        drop(manager);

        let mut next_start = UpdateCacheManager::new(root).unwrap();
        next_start.clear_active_package().unwrap();
        next_start.clear_active_installer_dir().unwrap();
        next_start.cleanup_update_cache(None);

        assert!(!package.exists());
        assert!(!installer_dir.exists());
    }

    #[test]
    fn keeps_active_installer_directory_during_cleanup() {
        let directory = TestDirectory::new("active-installer-dir");
        let mut manager = UpdateCacheManager::new(directory.path().join("update-cache")).unwrap();
        let installer_dir = manager.prepare_installer_temp_dir("6.0.21").unwrap();
        fs::write(installer_dir.join("installer.exe"), b"installer").unwrap();

        let report = manager.cleanup_update_cache(None);

        assert!(installer_dir.exists());
        assert!(report.skipped >= 1);
    }

    #[test]
    fn removes_multiple_historical_versions() {
        let directory = TestDirectory::new("history");
        let mut manager = UpdateCacheManager::new(directory.path().join("update-cache")).unwrap();
        let packages = ["6.0.21", "6.0.22", "6.0.23"]
            .into_iter()
            .map(|version| {
                let package = create_package(&mut manager, version);
                manager.clear_active_package().unwrap();
                package
            })
            .collect::<Vec<_>>();

        let report = manager.cleanup_update_cache(None);

        assert_eq!(report.removed, packages.len());
        assert!(packages.iter().all(|package| !package.exists()));
    }

    #[test]
    fn never_touches_user_downloads_or_desktop_files() {
        let directory = TestDirectory::new("user-directories");
        let downloads = directory.path().join("Downloads");
        let desktop = directory.path().join("Desktop");
        fs::create_dir_all(&downloads).unwrap();
        fs::create_dir_all(&desktop).unwrap();
        let downloaded_installer = downloads.join("Inspiration Drawer Setup 6.0.23.exe");
        let desktop_installer = desktop.join("Inspiration Drawer Setup 6.0.22.exe");
        fs::write(&downloaded_installer, b"user download").unwrap();
        fs::write(&desktop_installer, b"user desktop file").unwrap();

        let mut manager = UpdateCacheManager::new(directory.path().join("update-cache")).unwrap();
        manager.cleanup_update_cache(None);

        assert!(downloaded_installer.exists());
        assert!(desktop_installer.exists());
    }
}
