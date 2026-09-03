mod manager;
mod state;

pub use manager::UpdateCacheManager;

use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};
use tauri::Manager;

static INSTALLER_TEMP_ENV_LOCK: Mutex<()> = Mutex::new(());

pub struct InstallerTempDirGuard {
    _lock: MutexGuard<'static, ()>,
    previous_temp: Option<std::ffi::OsString>,
    previous_tmp: Option<std::ffi::OsString>,
    previous_tmpdir: Option<std::ffi::OsString>,
}

impl Drop for InstallerTempDirGuard {
    fn drop(&mut self) {
        restore_environment_variable("TEMP", self.previous_temp.take());
        restore_environment_variable("TMP", self.previous_tmp.take());
        restore_environment_variable("TMPDIR", self.previous_tmpdir.take());
    }
}

pub fn override_installer_temp_dir(path: &std::path::Path) -> InstallerTempDirGuard {
    let lock = INSTALLER_TEMP_ENV_LOCK
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let guard = InstallerTempDirGuard {
        _lock: lock,
        previous_temp: std::env::var_os("TEMP"),
        previous_tmp: std::env::var_os("TMP"),
        previous_tmpdir: std::env::var_os("TMPDIR"),
    };
    let environment_path = installer_environment_path(path);
    std::env::set_var("TEMP", &environment_path);
    std::env::set_var("TMP", &environment_path);
    std::env::set_var("TMPDIR", &environment_path);
    guard
}

fn installer_environment_path(path: &std::path::Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let value = path.to_string_lossy();
        if let Some(value) = value.strip_prefix(r"\\?\UNC\") {
            return PathBuf::from(format!(r"\\{value}"));
        }
        if let Some(value) = value.strip_prefix(r"\\?\") {
            return PathBuf::from(value);
        }
    }
    path.to_path_buf()
}

fn restore_environment_variable(name: &str, value: Option<std::ffi::OsString>) {
    if let Some(value) = value {
        std::env::set_var(name, value);
    } else {
        std::env::remove_var(name);
    }
}

pub fn get_update_cache_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    app_handle
        .path()
        .app_cache_dir()
        .or_else(|_| app_handle.path().app_local_data_dir())
        .map(|path| path.join("update-cache"))
        .map_err(|error| format!("resolve application update cache directory failed: {error}"))
}

pub fn manager_for_app(app_handle: &tauri::AppHandle) -> Result<UpdateCacheManager, String> {
    UpdateCacheManager::new(get_update_cache_dir(app_handle)?)
}

pub fn cleanup_update_cache_on_startup(app_handle: &tauri::AppHandle) {
    let mut manager = match manager_for_app(app_handle) {
        Ok(manager) => manager,
        Err(error) => {
            eprintln!("[update-cache] startup initialization failed: {error}");
            return;
        }
    };

    if let Err(error) = manager.restore_installer_temp_environment() {
        eprintln!("[update-cache] restore installer temp environment failed: {error}");
    }

    // Persisted active entries belong to the updater process that has exited.
    if let Err(error) = manager.clear_active_package() {
        eprintln!("[update-cache] clear stale active package failed: {error}");
    }
    if let Err(error) = manager.clear_active_installer_dir() {
        eprintln!("[update-cache] clear stale active installer directory failed: {error}");
    }
    manager.cleanup_update_cache(None);

    // Older updater releases extracted their installer directly into the system
    // temp directory and left it behind after launching the new application.
    // The newest directory may still contain the running installer, so retain it
    // and remove only older, strictly validated Inspiration Drawer updater dirs.
    manager::cleanup_legacy_tauri_updater_dirs(&std::env::temp_dir());
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::installer_environment_path;
    use std::path::Path;

    #[test]
    fn removes_windows_verbatim_prefix_for_installer_environment() {
        assert_eq!(
            installer_environment_path(Path::new(r"\\?\C:\Users\Test\update-cache")),
            Path::new(r"C:\Users\Test\update-cache")
        );
        assert_eq!(
            installer_environment_path(Path::new(r"\\?\UNC\server\share\update-cache")),
            Path::new(r"\\server\share\update-cache")
        );
    }
}
