use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default)]
pub struct InstallerTempEnvironment {
    pub temp: Option<String>,
    pub tmp: Option<String>,
    pub tmpdir: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default)]
pub struct UpdateCacheState {
    pub managed_packages: Vec<String>,
    pub pending_cleanup: Vec<String>,
    pub active_package: Option<String>,
    pub pending_installer_dirs: Vec<String>,
    pub active_installer_dir: Option<String>,
    pub installer_temp_environment: Option<InstallerTempEnvironment>,
    pub last_installed_version: Option<String>,
}

impl UpdateCacheState {
    pub fn normalize(&mut self) {
        self.managed_packages.sort();
        self.managed_packages.dedup();
        self.pending_cleanup.sort();
        self.pending_cleanup.dedup();
        self.pending_installer_dirs.sort();
        self.pending_installer_dirs.dedup();
    }
}
