use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
use std::{ffi::OsStr, os::windows::ffi::OsStrExt, ptr};
#[cfg(target_os = "windows")]
use winapi::{
    ctypes::c_void,
    shared::minwindef::LPVOID,
    um::winver::{GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW},
};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BrowserKind {
    Chrome,
    Edge,
}

impl BrowserKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Chrome => "chrome",
            Self::Edge => "edge",
        }
    }

    pub fn executable_name(self) -> &'static str {
        match self {
            Self::Chrome => "chrome.exe",
            Self::Edge => "msedge.exe",
        }
    }

    pub fn extensions_url(self) -> &'static str {
        match self {
            Self::Chrome => "chrome://extensions/",
            Self::Edge => "edge://extensions/",
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserDetection {
    pub browser: BrowserKind,
    pub installed: bool,
    pub executable_path: Option<String>,
    pub version: Option<String>,
    pub extension_supported: bool,
}

pub fn detect_browsers() -> Vec<BrowserDetection> {
    [BrowserKind::Chrome, BrowserKind::Edge]
        .into_iter()
        .map(detect_browser)
        .collect()
}

pub fn detect_browser(browser: BrowserKind) -> BrowserDetection {
    let path = browser_candidates(browser)
        .into_iter()
        .find(|candidate| candidate.is_file());
    BrowserDetection {
        browser,
        installed: path.is_some(),
        executable_path: path
            .as_ref()
            .map(|value| value.to_string_lossy().to_string()),
        version: path.as_deref().and_then(read_browser_version),
        extension_supported: path.is_some(),
    }
}

fn browser_candidates(browser: BrowserKind) -> Vec<PathBuf> {
    let mut candidates = crate::platform::browser_candidates(browser.as_str());
    #[cfg(target_os = "windows")]
    {
        candidates.extend(registry_app_paths(browser.executable_name()));
    }
    dedupe_paths(candidates)
}

fn dedupe_paths(paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    paths
        .into_iter()
        .filter(|path| seen.insert(path.to_string_lossy().to_ascii_lowercase()))
        .collect()
}

#[cfg(target_os = "windows")]
fn registry_app_paths(executable: &str) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    for hive in ["HKCU", "HKLM"] {
        let key = format!(
            r"{}\Software\Microsoft\Windows\CurrentVersion\App Paths\{}",
            hive, executable
        );
        let mut command = Command::new("reg.exe");
        command.args(["query", &key, "/ve"]);
        command.creation_flags(CREATE_NO_WINDOW);
        let Ok(output) = command.output() else {
            continue;
        };
        if !output.status.success() {
            continue;
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let Some((_, value)) = line.split_once("REG_SZ") else {
                continue;
            };
            let path = PathBuf::from(value.trim().trim_matches('"'));
            if !path.as_os_str().is_empty() {
                paths.push(path);
            }
        }
    }
    paths
}

#[cfg(not(target_os = "windows"))]
fn registry_app_paths(_executable: &str) -> Vec<PathBuf> {
    Vec::new()
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct FixedFileInfo {
    signature: u32,
    struct_version: u32,
    file_version_ms: u32,
    file_version_ls: u32,
    product_version_ms: u32,
    product_version_ls: u32,
    file_flags_mask: u32,
    file_flags: u32,
    file_os: u32,
    file_type: u32,
    file_subtype: u32,
    file_date_ms: u32,
    file_date_ls: u32,
}

fn format_file_version(version_ms: u32, version_ls: u32) -> String {
    format!(
        "{}.{}.{}.{}",
        version_ms >> 16,
        version_ms & 0xffff,
        version_ls >> 16,
        version_ls & 0xffff,
    )
}

#[cfg(target_os = "windows")]
fn read_browser_version(path: &Path) -> Option<String> {
    let wide_path = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let mut ignored_handle = 0;
    // File version APIs read PE metadata without starting the browser process.
    let size = unsafe { GetFileVersionInfoSizeW(wide_path.as_ptr(), &mut ignored_handle) };
    if size == 0 {
        return None;
    }
    let mut version_data = vec![0_u8; size as usize];
    let read_ok = unsafe {
        GetFileVersionInfoW(
            wide_path.as_ptr(),
            0,
            size,
            version_data.as_mut_ptr().cast::<c_void>(),
        )
    };
    if read_ok == 0 {
        return None;
    }

    let root = OsStr::new("\\")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let mut info_pointer: LPVOID = ptr::null_mut();
    let mut info_length = 0_u32;
    let query_ok = unsafe {
        VerQueryValueW(
            version_data.as_ptr().cast::<c_void>(),
            root.as_ptr(),
            &mut info_pointer,
            &mut info_length,
        )
    };
    if query_ok == 0
        || info_pointer.is_null()
        || info_length < std::mem::size_of::<FixedFileInfo>() as u32
    {
        return None;
    }
    let info = unsafe { &*info_pointer.cast::<FixedFileInfo>() };
    if info.signature != 0xFEEF04BD {
        return None;
    }
    Some(format_file_version(
        info.file_version_ms,
        info.file_version_ls,
    ))
}

#[cfg(not(target_os = "windows"))]
fn read_browser_version(path: &Path) -> Option<String> {
    let mut command = Command::new(path);
    command.arg("--version");
    let output = command.output().ok()?;
    let text = if output.stdout.is_empty() {
        String::from_utf8_lossy(&output.stderr).to_string()
    } else {
        String::from_utf8_lossy(&output.stdout).to_string()
    };
    let version = text
        .split_whitespace()
        .find(|part| {
            part.chars()
                .next()
                .is_some_and(|value| value.is_ascii_digit())
        })?
        .trim()
        .to_string();
    (!version.is_empty()).then_some(version)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_browser_is_a_normal_state() {
        let result = BrowserDetection {
            browser: BrowserKind::Chrome,
            installed: false,
            executable_path: None,
            version: None,
            extension_supported: false,
        };
        assert!(!result.installed);
        assert!(!result.extension_supported);
    }

    #[test]
    fn chrome_and_edge_share_the_same_kind_parser_contract() {
        assert_eq!(BrowserKind::Chrome.as_str(), "chrome");
        assert_eq!(BrowserKind::Edge.as_str(), "edge");
    }

    #[test]
    fn formats_windows_file_version_words() {
        assert_eq!(
            format_file_version((141 << 16) | 0, (7390 << 16) | 55),
            "141.0.7390.55"
        );
    }
}
