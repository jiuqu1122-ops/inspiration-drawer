// src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod agent;
mod ai_credentials;
mod ai_gateway;
mod commands;
mod db;
mod license;
mod native_drag;
mod native_drop;
mod repositories;
mod services;
mod virtual_drop;

use hmac::{Hmac, Mac};
use reqwest::blocking::multipart::{Form, Part};
use reqwest::blocking::Client;
use reqwest::redirect::Policy;
use sha2::{Digest, Sha256};
use std::cmp::Ordering as CmpOrdering;
use std::collections::{hash_map::DefaultHasher, BTreeMap, HashMap, HashSet};
use std::fs;
use std::fs::File;
use std::hash::{Hash, Hasher};
use std::io::{BufRead, BufReader, BufWriter, Read, Write};
use std::net::{TcpListener, TcpStream};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command as SysCommand, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU16, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant, SystemTime};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    Emitter, LogicalPosition, LogicalSize, Manager, Monitor, PhysicalPosition, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};
use tauri_plugin_updater::UpdaterExt;
use time::{format_description, OffsetDateTime};
use url::Url;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;
const APP_USER_AGENT: &str = "inspiration-drawer";
const MAX_STORED_DATA_THUMBNAIL_CHARS: usize = 96 * 1024;
const DEFAULT_CANVAS_ID: &str = "default";

#[cfg(target_os = "windows")]
fn hide_console_window(cmd: &mut SysCommand) -> &mut SysCommand {
    cmd.creation_flags(CREATE_NO_WINDOW)
}

#[cfg(not(target_os = "windows"))]
fn hide_console_window(cmd: &mut SysCommand) -> &mut SysCommand {
    cmd
}

static STARTUP_CLOSE_LOCK_UNTIL_MS: AtomicU64 = AtomicU64::new(0);
static WINDOW_RESIZE_ANIMATION_TOKEN: AtomicU64 = AtomicU64::new(0);
static ANTI_TOUCH_LOCKED: AtomicU16 = AtomicU16::new(0);
static MAIN_WORKBENCH_ACTIVE: AtomicBool = AtomicBool::new(false);
static POST_INSTALL_LAUNCH_PENDING: AtomicBool = AtomicBool::new(false);
const POST_INSTALL_LAUNCH_MARKER: &str = ".inspiration-drawer-post-install";

struct CloudflaredShare {
    child: Child,
    dir: PathBuf,
    server_stop: Arc<AtomicBool>,
    server_thread: Option<JoinHandle<()>>,
}

#[derive(Clone, serde::Serialize)]
struct LocalVisionModelProgress {
    stage: String,
    message: String,
    file: Option<String>,
    loaded: u64,
    total: u64,
    progress: f64,
}

#[derive(Clone)]
struct AppUpdateDownloadSource {
    name: String,
    url: Url,
}

struct AppUpdateManifestProbe {
    endpoint: Url,
    raw_json: serde_json::Value,
    status_code: u16,
}

#[derive(Clone, serde::Serialize)]
struct AppUpdateProgress {
    #[serde(rename = "progressId")]
    progress_id: String,
    stage: String,
    message: String,
    #[serde(rename = "updaterKind")]
    updater_kind: Option<String>,
    #[serde(rename = "manifestEndpoint")]
    manifest_endpoint: Option<String>,
    #[serde(rename = "statusCode")]
    status_code: Option<u16>,
    version: Option<String>,
    #[serde(rename = "currentVersion")]
    current_version: Option<String>,
    available: Option<bool>,
    #[serde(rename = "sourceName")]
    source_name: Option<String>,
    #[serde(rename = "sourceUrl")]
    source_url: Option<String>,
    #[serde(rename = "selectedUrl")]
    selected_url: Option<String>,
    #[serde(rename = "errorMessage")]
    error_message: Option<String>,
    loaded: u64,
    total: u64,
    progress: f64,
}

#[derive(serde::Serialize)]
struct AppUpdateInstallResult {
    available: bool,
    version: Option<String>,
    installed: bool,
}

#[derive(serde::Serialize)]
struct LocalMediaMetadata {
    path: String,
    size: u64,
    #[serde(rename = "modifiedAt")]
    modified_at: u64,
    fingerprint: String,
}

#[derive(serde::Serialize)]
struct ImageThumbnailFileResult {
    path: String,
    size: u32,
    width: u32,
    height: u32,
    fingerprint: String,
    #[serde(rename = "fileSize")]
    file_size: u64,
    #[serde(rename = "modifiedAt")]
    modified_at: u64,
}

#[derive(Clone, serde::Deserialize)]
struct R2LocalConfig {
    #[serde(alias = "accountId")]
    account_id: String,
    #[serde(alias = "accessKeyId")]
    access_key_id: String,
    #[serde(alias = "secretAccessKey")]
    secret_access_key: String,
    bucket: String,
    #[serde(alias = "publicUrl")]
    public_url: String,
    prefix: Option<String>,
    endpoint: Option<String>,
}

#[derive(Clone)]
struct R2Share {
    config: R2LocalConfig,
    keys: Vec<String>,
}

static CLOUDFLARED_SHARES: OnceLock<Mutex<HashMap<String, CloudflaredShare>>> = OnceLock::new();
static R2_SHARES: OnceLock<Mutex<HashMap<String, R2Share>>> = OnceLock::new();
static LOCAL_MEDIA_CACHE_WRITE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static FFMPEG_TOOLS_INSTALL_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static REAL_ESRGAN_ESTIMATE_TASKS: OnceLock<Mutex<HashMap<String, RealEsrganEstimateTaskHandle>>> =
    OnceLock::new();

const REAL_ESRGAN_ESTIMATE_SAMPLE_FRAMES: usize = 3;

#[derive(Default)]
struct RealEsrganEstimateTaskState {
    cancel_requested: bool,
    child: Option<Child>,
}

type RealEsrganEstimateTaskHandle = Arc<Mutex<RealEsrganEstimateTaskState>>;

struct RealEsrganEstimateTaskGuard {
    progress_id: String,
    state: RealEsrganEstimateTaskHandle,
}

fn cloudflared_shares() -> &'static Mutex<HashMap<String, CloudflaredShare>> {
    CLOUDFLARED_SHARES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn r2_shares() -> &'static Mutex<HashMap<String, R2Share>> {
    R2_SHARES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn local_media_cache_write_lock() -> &'static Mutex<()> {
    LOCAL_MEDIA_CACHE_WRITE_LOCK.get_or_init(|| Mutex::new(()))
}

fn realesrgan_estimate_tasks() -> &'static Mutex<HashMap<String, RealEsrganEstimateTaskHandle>> {
    REAL_ESRGAN_ESTIMATE_TASKS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn command_output_to_string(label: &str, output: std::process::Output) -> Result<String, String> {
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if stderr.is_empty() { stdout } else { stderr };
    Err(if detail.is_empty() {
        format!("{} 执行失败", label)
    } else {
        format!("{} 执行失败: {}", label, detail)
    })
}

fn acquire_realesrgan_estimate_task(
    progress_id: &str,
) -> Result<RealEsrganEstimateTaskGuard, String> {
    let progress_id = progress_id.trim();
    if progress_id.is_empty() {
        return Err("Real-ESRGAN 预估任务 ID 不能为空".to_string());
    }

    let state: RealEsrganEstimateTaskHandle =
        Arc::new(Mutex::new(RealEsrganEstimateTaskState::default()));
    let previous = {
        let mut tasks = realesrgan_estimate_tasks()
            .lock()
            .map_err(|_| "Real-ESRGAN 预估任务锁定失败".to_string())?;
        tasks.insert(progress_id.to_string(), Arc::clone(&state))
    };
    if let Some(previous) = previous {
        if let Ok(mut previous_state) = previous.lock() {
            previous_state.cancel_requested = true;
            if let Some(mut child) = previous_state.child.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }

    Ok(RealEsrganEstimateTaskGuard {
        progress_id: progress_id.to_string(),
        state,
    })
}

fn cancel_realesrgan_estimate_task(progress_id: &str) -> Result<(), String> {
    let progress_id = progress_id.trim();
    if progress_id.is_empty() {
        return Ok(());
    }

    let task = {
        let tasks = realesrgan_estimate_tasks()
            .lock()
            .map_err(|_| "Real-ESRGAN 预估任务锁定失败".to_string())?;
        tasks.get(progress_id).cloned()
    };
    if let Some(task) = task {
        let child_to_kill = {
            let mut state = task
                .lock()
                .map_err(|_| "Real-ESRGAN 预估任务锁定失败".to_string())?;
            state.cancel_requested = true;
            state.child.take()
        };
        if let Some(mut child) = child_to_kill {
            let _ = child.kill();
            let _ = child.wait();
        }
        if let Ok(mut tasks) = realesrgan_estimate_tasks().lock() {
            if tasks
                .get(progress_id)
                .is_some_and(|current| Arc::ptr_eq(current, &task))
            {
                tasks.remove(progress_id);
            }
        }
    }

    Ok(())
}

fn check_realesrgan_estimate_cancelled(
    task_state: Option<&RealEsrganEstimateTaskHandle>,
) -> Result<(), String> {
    if let Some(task_state) = task_state {
        let cancelled = task_state
            .lock()
            .map_err(|_| "Real-ESRGAN 预估任务锁定失败".to_string())?
            .cancel_requested;
        if cancelled {
            return Err("Real-ESRGAN 预估已取消".to_string());
        }
    }
    Ok(())
}

fn is_realesrgan_estimate_cancel_error(error: &str) -> bool {
    error.contains("已取消")
}

impl Drop for RealEsrganEstimateTaskGuard {
    fn drop(&mut self) {
        if let Ok(mut tasks) = realesrgan_estimate_tasks().lock() {
            if tasks
                .get(&self.progress_id)
                .is_some_and(|current| Arc::ptr_eq(current, &self.state))
            {
                tasks.remove(&self.progress_id);
            }
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloudflaredPublicImageUrls {
    share_id: String,
    urls: Vec<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct OssReferenceImageUpload {
    filename: String,
    mime: String,
    data: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CollectedWebImage {
    title: String,
    image_url: String,
    page_url: String,
    path: String,
}

fn now_millis_u64() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or(0)
}

fn is_startup_close_locked() -> bool {
    STARTUP_CLOSE_LOCK_UNTIL_MS.load(Ordering::Relaxed) > now_millis_u64()
}

fn should_suppress_edge_window(startup_locked: bool, main_visible: bool) -> bool {
    startup_locked || main_visible
}

#[cfg(test)]
mod startup_window_tests {
    use super::should_suppress_edge_window;

    #[test]
    fn edge_stays_hidden_during_startup_or_while_main_is_visible() {
        assert!(should_suppress_edge_window(true, false));
        assert!(should_suppress_edge_window(false, true));
        assert!(should_suppress_edge_window(true, true));
        assert!(!should_suppress_edge_window(false, false));
    }
}

#[tauri::command]
fn set_startup_close_lock(ms: u64) {
    let until = if ms == 0 {
        0
    } else {
        now_millis_u64().saturating_add(ms)
    };
    STARTUP_CLOSE_LOCK_UNTIL_MS.store(until, Ordering::Relaxed);
}

fn take_post_install_launch_marker() -> bool {
    let marker = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|parent| parent.join(POST_INSTALL_LAUNCH_MARKER)));
    let Some(marker) = marker else {
        return false;
    };
    if !marker.is_file() {
        return false;
    }

    let _ = fs::remove_file(marker);
    true
}

fn is_anti_touch_locked() -> bool {
    ANTI_TOUCH_LOCKED.load(Ordering::Relaxed) != 0
}

#[tauri::command]
fn set_anti_touch_lock(locked: bool) {
    ANTI_TOUCH_LOCKED.store(if locked { 1 } else { 0 }, Ordering::Relaxed);
}

fn is_main_workbench_active() -> bool {
    MAIN_WORKBENCH_ACTIVE.load(Ordering::Relaxed)
}

fn apply_main_workbench_mode(main: &WebviewWindow) {
    let active = is_main_workbench_active();
    if !active {
        let _ = main.unmaximize();
    }
    let _ = main.set_resizable(active);
    let _ = main.set_skip_taskbar(!active);
    let _ = main.set_always_on_top(!active);
}

#[tauri::command]
fn set_main_workbench_active(app_handle: tauri::AppHandle, active: bool) -> Result<(), String> {
    MAIN_WORKBENCH_ACTIVE.store(active, Ordering::Relaxed);
    if let Some(main) = app_handle.get_webview_window("main") {
        apply_main_workbench_mode(&main);
    }
    Ok(())
}

fn normalize_proxy_endpoint(value: &str) -> Option<String> {
    let raw = value.trim();
    if raw.is_empty() || raw.eq_ignore_ascii_case("auto") || raw.eq_ignore_ascii_case("system") {
        return None;
    }

    let mut selected = raw.to_string();
    if raw.contains('=') {
        let mut https_value = None;
        let mut http_value = None;
        let mut socks_value = None;
        let mut first_value = None;

        for part in raw.split(';') {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }
            let (key, val) = part.split_once('=').unwrap_or(("", part));
            let key = key.trim().to_ascii_lowercase();
            let val = val.trim();
            if val.is_empty() {
                continue;
            }
            if first_value.is_none() {
                first_value = Some(val.to_string());
            }
            match key.as_str() {
                "https" => https_value = Some(val.to_string()),
                "http" => http_value = Some(val.to_string()),
                "socks" | "socks5" => socks_value = Some(val.to_string()),
                _ => {}
            }
        }

        selected = https_value
            .or(http_value)
            .or_else(|| {
                socks_value.map(|v| {
                    if v.contains("://") {
                        v
                    } else {
                        format!("socks5h://{}", v)
                    }
                })
            })
            .or(first_value)
            .unwrap_or_default();
    }

    if selected.trim().is_empty() {
        return None;
    }
    if selected.contains("://") {
        Some(selected)
    } else {
        Some(format!("http://{}", selected))
    }
}

#[cfg(target_os = "windows")]
fn windows_system_proxy() -> Option<String> {
    use std::ptr::null_mut;
    use winapi::shared::minwindef::DWORD;
    use winapi::shared::winerror::ERROR_SUCCESS;
    use winapi::um::winnt::KEY_READ;
    use winapi::um::winreg::{RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY_CURRENT_USER};

    unsafe {
        let subkey =
            auto_start_wide_null(r"Software\Microsoft\Windows\CurrentVersion\Internet Settings");
        let mut hkey = null_mut();
        let status = RegOpenKeyExW(HKEY_CURRENT_USER, subkey.as_ptr(), 0, KEY_READ, &mut hkey);
        if status != ERROR_SUCCESS as i32 {
            return None;
        }

        let enable_name = auto_start_wide_null("ProxyEnable");
        let mut enable_type: DWORD = 0;
        let mut enable_size: DWORD = std::mem::size_of::<DWORD>() as DWORD;
        let mut enable_value: DWORD = 0;
        let enable_status = RegQueryValueExW(
            hkey,
            enable_name.as_ptr(),
            null_mut(),
            &mut enable_type,
            &mut enable_value as *mut DWORD as *mut u8,
            &mut enable_size,
        );
        if enable_status != ERROR_SUCCESS as i32 || enable_value == 0 {
            RegCloseKey(hkey);
            return None;
        }

        let proxy_name = auto_start_wide_null("ProxyServer");
        let mut value_type: DWORD = 0;
        let mut size_bytes: DWORD = 0;
        let size_status = RegQueryValueExW(
            hkey,
            proxy_name.as_ptr(),
            null_mut(),
            &mut value_type,
            null_mut(),
            &mut size_bytes,
        );
        if size_status != ERROR_SUCCESS as i32 || size_bytes == 0 {
            RegCloseKey(hkey);
            return None;
        }

        let mut buffer = vec![0u16; ((size_bytes as usize) + 1) / 2];
        let value_status = RegQueryValueExW(
            hkey,
            proxy_name.as_ptr(),
            null_mut(),
            &mut value_type,
            buffer.as_mut_ptr() as *mut u8,
            &mut size_bytes,
        );
        RegCloseKey(hkey);
        if value_status != ERROR_SUCCESS as i32 {
            return None;
        }

        let end = buffer.iter().position(|c| *c == 0).unwrap_or(buffer.len());
        let proxy_text = String::from_utf16_lossy(&buffer[..end]);
        normalize_proxy_endpoint(&proxy_text)
    }
}

#[cfg(not(target_os = "windows"))]
fn windows_system_proxy() -> Option<String> {
    None
}

fn env_proxy() -> Option<String> {
    std::env::var("HTTPS_PROXY")
        .or_else(|_| std::env::var("https_proxy"))
        .or_else(|_| std::env::var("HTTP_PROXY"))
        .or_else(|_| std::env::var("http_proxy"))
        .ok()
        .and_then(|value| normalize_proxy_endpoint(&value))
}

fn network_proxy_config_path(app_handle: &tauri::AppHandle) -> PathBuf {
    get_user_data_dir(app_handle).join("network_proxy.txt")
}

fn read_network_proxy(app_handle: &tauri::AppHandle) -> String {
    let path = network_proxy_config_path(app_handle);
    fs::read_to_string(path)
        .unwrap_or_default()
        .trim()
        .to_string()
}

#[tauri::command]
fn get_network_proxy(app_handle: tauri::AppHandle) -> Result<String, String> {
    Ok(read_network_proxy(&app_handle))
}

#[tauri::command]
fn set_network_proxy(app_handle: tauri::AppHandle, proxy: String) -> Result<String, String> {
    let normalized = normalize_proxy_endpoint(&proxy).unwrap_or_default();
    let path = network_proxy_config_path(&app_handle);

    if normalized.is_empty() {
        let _ = fs::remove_file(path);
        return Ok(String::new());
    }

    fs::write(path, normalized.as_bytes()).map_err(|e| e.to_string())?;
    Ok(normalized)
}

fn effective_proxy(
    app_handle: Option<&tauri::AppHandle>,
    explicit_proxy: Option<&str>,
) -> Option<String> {
    // 优先级：请求显式代理 > App 内保存代理 > Windows 系统代理 > 环境变量
    // 这样既保留自动代理，又允许用户在特殊网络环境里手动覆盖。
    explicit_proxy
        .and_then(normalize_proxy_endpoint)
        .or_else(|| {
            app_handle
                .map(read_network_proxy)
                .and_then(|value| normalize_proxy_endpoint(&value))
        })
        .or_else(windows_system_proxy)
        .or_else(env_proxy)
}

pub(crate) fn build_http_client(
    app_handle: Option<&tauri::AppHandle>,
    explicit_proxy: Option<&str>,
    timeout_secs: u64,
) -> Result<Client, String> {
    let mut builder = Client::builder()
        .user_agent(APP_USER_AGENT)
        .redirect(Policy::limited(10))
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(timeout_secs));

    if let Some(proxy) = effective_proxy(app_handle, explicit_proxy) {
        let proxy = reqwest::Proxy::all(&proxy).map_err(|e| format!("代理配置无效：{}", e))?;
        builder = builder.proxy(proxy);
    }

    builder
        .build()
        .map_err(|e| format!("初始化网络客户端失败：{}", e))
}

fn build_direct_http_client(timeout_secs: u64) -> Result<Client, String> {
    Client::builder()
        .user_agent(APP_USER_AGENT)
        .redirect(Policy::limited(10))
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(timeout_secs))
        .no_proxy()
        .build()
        .map_err(|e| format!("初始化直连网络客户端失败：{}", e))
}

fn should_prefer_direct_generated_image_download(url: &str) -> bool {
    reqwest::Url::parse(url)
        .ok()
        .and_then(|parsed| parsed.host_str().map(str::to_ascii_lowercase))
        .is_some_and(|host| {
            host == "api.unmind.art"
                || host == "inspiration-drawer-prod.oss-cn-hongkong.aliyuncs.com"
                || host.ends_with(".oss-cn-hongkong.aliyuncs.com")
                || host == "adobe.yrzsai.com"
                || host == "xaisp3.oss-ap-southeast-1.aliyuncs.com"
        })
}

fn is_wallet_ai_image_result_url(value: &str) -> bool {
    Url::parse(value).ok().is_some_and(|url| {
        url.scheme() == "https"
            && url.host_str().is_some_and(|host| host.eq_ignore_ascii_case("api.unmind.art"))
            && url.path().starts_with("/v1/ai/image-results/")
    })
}

fn is_wallet_ai_video_result_url(value: &str) -> bool {
    Url::parse(value).ok().is_some_and(|url| {
        url.scheme() == "https"
            && url.host_str().is_some_and(|host| host.eq_ignore_ascii_case("api.unmind.art"))
            && url.path().starts_with("/v1/ai/video-results/")
    })
}

fn generated_oss_result_key(value: &str) -> Option<String> {
    let url = Url::parse(value).ok()?;
    if url.scheme() != "https"
        || !url.host_str().is_some_and(|host| {
            host.eq_ignore_ascii_case(
                "inspiration-drawer-prod.oss-cn-hongkong.aliyuncs.com",
            )
        })
    {
        return None;
    }
    let key = url.path().strip_prefix("/generated-images/")?;
    let valid = key.len() <= 80
        && key
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || value == '.' || value == '-' || value == '_');
    valid.then(|| key.to_string())
}

fn generated_oss_video_result_key(value: &str) -> Option<String> {
    let url = Url::parse(value).ok()?;
    if url.scheme() != "https"
        || !url.host_str().is_some_and(|host| {
            host.eq_ignore_ascii_case(
                "inspiration-drawer-prod.oss-cn-hongkong.aliyuncs.com",
            )
        })
    {
        return None;
    }
    let key = url.path().strip_prefix("/generated-videos/")?;
    let valid = key.len() <= 80
        && key
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || value == '.' || value == '-' || value == '_');
    valid.then(|| key.to_string())
}

fn is_wallet_ai_image_result_source(value: &str) -> bool {
    is_wallet_ai_image_result_url(value)
        || is_wallet_ai_video_result_url(value)
        || generated_oss_result_key(value).is_some()
        || generated_oss_video_result_key(value).is_some()
}

fn validate_generated_image_oss_url(value: &str) -> Result<String, String> {
    let url = Url::parse(value).map_err(|_| "OSS 签名地址格式无效".to_string())?;
    let allowed = url.scheme() == "https"
        && url.host_str().is_some_and(|host| {
            host.eq_ignore_ascii_case(
                "inspiration-drawer-prod.oss-cn-hongkong.aliyuncs.com",
            )
        })
        && (url.path().starts_with("/generated-images/")
            || url.path().starts_with("/generated-videos/"));
    if !allowed {
        return Err("OSS 签名地址不属于允许的生成结果 Bucket".to_string());
    }
    if url.query().is_none() {
        return Err("OSS 生成结果地址缺少签名参数".to_string());
    }
    Ok(url.to_string())
}

fn image_result_json_url(value: &str) -> Result<Url, String> {
    let mut url = if let Some(key) = generated_oss_video_result_key(value) {
        Url::parse(&format!(
            "https://api.unmind.art/v1/ai/video-results/{key}"
        ))
        .map_err(|error| error.to_string())?
    } else if let Some(key) = generated_oss_result_key(value) {
        Url::parse(&format!(
            "https://api.unmind.art/v1/ai/image-results/{key}"
        ))
        .map_err(|_| "AI 图片结果地址格式无效".to_string())?
    } else {
        Url::parse(value).map_err(|_| "AI 图片结果地址格式无效".to_string())?
    };
    let retained = url
        .query_pairs()
        .filter(|(key, _)| key != "redirect")
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect::<Vec<_>>();
    url.set_query(None);
    {
        let mut pairs = url.query_pairs_mut();
        pairs.extend_pairs(retained);
        pairs.append_pair("redirect", "0");
    }
    Ok(url)
}

fn resolve_ai_image_result_url_with_client(
    client: &Client,
    source: &str,
    access_token: &str,
) -> Result<String, String> {
    if !is_wallet_ai_image_result_source(source) {
        return Ok(source.trim().to_string());
    }
    let endpoint = image_result_json_url(source)?;
    let response = client
        .get(endpoint)
        .bearer_auth(access_token)
        .header("x-client-version", env!("CARGO_PKG_VERSION"))
        .header("x-wallet-protocol", "1")
        .send()
        .map_err(|error| format!("获取 OSS 图片地址失败：{error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "获取 OSS 图片地址失败，HTTP 状态码：{}",
            response.status()
        ));
    }
    let body = response
        .json::<serde_json::Value>()
        .map_err(|_| "OSS 图片地址响应格式无效".to_string())?;
    let signed_url = body
        .get("url")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "OSS 图片地址响应缺少 url".to_string())?;
    validate_generated_image_oss_url(signed_url)
}

fn resolve_ai_image_result_url_blocking(
    app_handle: &tauri::AppHandle,
    source: &str,
    access_token: &str,
) -> Result<String, String> {
    if !is_wallet_ai_image_result_source(source) {
        return Ok(source.trim().to_string());
    }
    let direct = build_direct_http_client(45)
        .and_then(|client| resolve_ai_image_result_url_with_client(&client, source, access_token));
    match direct {
        Ok(url) => Ok(url),
        Err(direct_error) => {
            if effective_proxy(Some(app_handle), None).is_none() {
                return Err(direct_error);
            }
            build_http_client(Some(app_handle), None, 45)
                .and_then(|client| {
                    resolve_ai_image_result_url_with_client(&client, source, access_token)
                })
                .map_err(|proxy_error| {
                    format!(
                        "直连获取 OSS 图片地址失败：{}；代理重试失败：{}",
                        direct_error, proxy_error
                    )
                })
        }
    }
}

#[tauri::command]
async fn resolve_ai_image_result_url(
    app_handle: tauri::AppHandle,
    url: String,
) -> Result<String, String> {
    if !is_wallet_ai_image_result_source(url.trim()) {
        return Ok(url.trim().to_string());
    }
    let access_token = commands::license::cloud_access_token(&app_handle).await?;
    tauri::async_runtime::spawn_blocking(move || {
        resolve_ai_image_result_url_blocking(&app_handle, url.trim(), &access_token)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod ai_image_result_url_tests {
    use super::{
        build_direct_http_client, download_url_to_file_with_client, image_result_json_url,
        generated_oss_result_key, generated_oss_video_result_key, is_wallet_ai_image_result_source,
        is_wallet_ai_image_result_url, is_wallet_ai_video_result_url,
        should_prefer_direct_generated_image_download, validate_generated_image_oss_url,
    };
    use std::fs;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn recognizes_wallet_result_urls_and_builds_json_mode_without_double_encoding() {
        let source = "https://api.unmind.art/v1/ai/image-results/abc.png?foo=a%2Bb";
        assert!(is_wallet_ai_image_result_url(source));
        let resolved = image_result_json_url(source).expect("json endpoint");
        assert_eq!(resolved.host_str(), Some("api.unmind.art"));
        assert_eq!(
            resolved.query_pairs()
                .find(|(key, _)| key == "foo")
                .map(|(_, value)| value.into_owned()),
            Some("a+b".to_string())
        );
        assert_eq!(
            resolved.query_pairs()
                .find(|(key, _)| key == "redirect")
                .map(|(_, value)| value.into_owned()),
            Some("0".to_string())
        );
        assert!(!resolved.as_str().contains("%252B"));
    }

    #[test]
    fn rebuilds_the_stable_api_url_from_a_generated_oss_object() {
        let source = "https://inspiration-drawer-prod.oss-cn-hongkong.aliyuncs.com/generated-images/abc.png?token=expired";
        assert_eq!(generated_oss_result_key(source).as_deref(), Some("abc.png"));
        let endpoint = image_result_json_url(source).expect("stable API endpoint");
        assert_eq!(endpoint.host_str(), Some("api.unmind.art"));
        assert_eq!(endpoint.path(), "/v1/ai/image-results/abc.png");
        assert_eq!(
            endpoint.query_pairs()
                .find(|(key, _)| key == "redirect")
                .map(|(_, value)| value.into_owned()),
            Some("0".to_string())
        );
    }

    #[test]
    fn recognizes_wallet_video_results_and_rebuilds_the_stable_api_url() {
        let stable = "https://api.unmind.art/v1/ai/video-results/abc.mp4";
        assert!(is_wallet_ai_video_result_url(stable));
        assert!(is_wallet_ai_image_result_source(stable));

        let signed = "https://inspiration-drawer-prod.oss-cn-hongkong.aliyuncs.com/generated-videos/abc.mp4?token=expired";
        assert_eq!(generated_oss_video_result_key(signed).as_deref(), Some("abc.mp4"));
        assert!(is_wallet_ai_image_result_source(signed));
        let endpoint = image_result_json_url(signed).expect("stable video API endpoint");
        assert_eq!(endpoint.path(), "/v1/ai/video-results/abc.mp4");
        assert_eq!(
            endpoint.query_pairs()
                .find(|(key, _)| key == "redirect")
                .map(|(_, value)| value.into_owned()),
            Some("0".to_string())
        );
    }

    #[test]
    fn only_accepts_https_signed_urls_from_the_generated_media_bucket() {
        let signed = "https://inspiration-drawer-prod.oss-cn-hongkong.aliyuncs.com/generated-images/a.png?token=a%2Bb";
        assert_eq!(
            validate_generated_image_oss_url(signed).expect("allowed signed URL"),
            signed
        );
        let video = "https://inspiration-drawer-prod.oss-cn-hongkong.aliyuncs.com/generated-videos/a.mp4?token=a%2Bb";
        assert_eq!(
            validate_generated_image_oss_url(video).expect("allowed signed video URL"),
            video
        );
        assert!(validate_generated_image_oss_url(
            "https://evil.example/generated-images/a.png?token=x"
        )
        .is_err());
        assert!(validate_generated_image_oss_url(
            "http://inspiration-drawer-prod.oss-cn-hongkong.aliyuncs.com/generated-images/a.png?token=x"
        )
        .is_err());
    }

    #[test]
    fn prefers_direct_connections_for_api_and_hong_kong_oss() {
        assert!(should_prefer_direct_generated_image_download(
            "https://api.unmind.art/v1/ai/image-results/a.png"
        ));
        assert!(should_prefer_direct_generated_image_download(
            "https://inspiration-drawer-prod.oss-cn-hongkong.aliyuncs.com/generated-images/a.png?token=x"
        ));
        assert!(should_prefer_direct_generated_image_download(
            "https://another.oss-cn-hongkong.aliyuncs.com/a.png"
        ));
    }

    #[test]
    fn downloads_a_redirected_image_to_a_local_file() {
        let image_listener = TcpListener::bind("127.0.0.1:0").expect("image listener");
        let image_address = image_listener.local_addr().expect("image address");
        let image_thread = thread::spawn(move || {
            let (mut stream, _) = image_listener.accept().expect("image request");
            let mut request = [0_u8; 2048];
            let _ = stream.read(&mut request);
            stream
                .write_all(
                    b"HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: 8\r\nConnection: close\r\n\r\n\x89PNG\r\n\x1a\n",
                )
                .expect("image response");
        });

        let redirect_listener = TcpListener::bind("127.0.0.1:0").expect("redirect listener");
        let redirect_address = redirect_listener.local_addr().expect("redirect address");
        let redirect_thread = thread::spawn(move || {
            let (mut stream, _) = redirect_listener.accept().expect("redirect request");
            let mut request = [0_u8; 2048];
            let _ = stream.read(&mut request);
            let response = format!(
                "HTTP/1.1 302 Found\r\nLocation: http://{image_address}/signed.png?token=a%2Bb\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            );
            stream
                .write_all(response.as_bytes())
                .expect("redirect response");
        });

        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let output = std::env::temp_dir().join(format!("oss-redirect-test-{stamp}.png"));
        let client = build_direct_http_client(5).expect("client");
        let content_type = download_url_to_file_with_client(
            &client,
            &format!("http://{redirect_address}/result.png"),
            &output,
        )
        .expect("download");

        assert_eq!(content_type.as_deref(), Some("image/png"));
        assert_eq!(fs::read(&output).expect("cached image"), b"\x89PNG\r\n\x1a\n");
        let _ = fs::remove_file(output);
        redirect_thread.join().expect("redirect thread");
        image_thread.join().expect("image thread");
    }
}

fn build_engine_download_http_client(
    app_handle: &tauri::AppHandle,
    timeout_secs: u64,
) -> Result<Client, String> {
    let mut builder = Client::builder()
        .user_agent(APP_USER_AGENT)
        .redirect(Policy::limited(10))
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(timeout_secs));

    if let Some(proxy) = effective_proxy(Some(app_handle), None) {
        let proxy = reqwest::Proxy::all(&proxy).map_err(|e| format!("代理配置无效：{}", e))?;
        builder = builder.proxy(proxy);
    }

    builder
        .build()
        .map_err(|e| format!("初始化引擎下载客户端失败：{}", e))
}

fn download_url_to_file(
    app_handle: &tauri::AppHandle,
    url: &str,
    out_path: &PathBuf,
    explicit_proxy: Option<&str>,
) -> Result<Option<String>, String> {
    download_url_to_file_with_timeout(app_handle, url, out_path, explicit_proxy, 90)
}

fn download_url_to_file_with_timeout(
    app_handle: &tauri::AppHandle,
    url: &str,
    out_path: &PathBuf,
    explicit_proxy: Option<&str>,
    timeout_secs: u64,
) -> Result<Option<String>, String> {
    let has_configured_proxy = effective_proxy(Some(app_handle), explicit_proxy).is_some();
    let allow_direct_first = has_configured_proxy
        && should_prefer_direct_generated_image_download(url);
    if allow_direct_first {
        let direct_result = build_direct_http_client(timeout_secs)
            .and_then(|client| download_url_to_file_with_client(&client, url, out_path));
        match direct_result {
            Ok(content_type) => return Ok(content_type),
            Err(direct_err) => {
                let _ = fs::remove_file(out_path);
                let _ = fs::remove_file(out_path.with_extension("download.tmp"));
                return build_http_client(Some(app_handle), explicit_proxy, timeout_secs)
                    .and_then(|client| download_url_to_file_with_client(&client, url, out_path))
                    .map_err(|proxy_err| {
                        format!(
                            "直连下载失败：{}；代理下载也失败：{}",
                            direct_err, proxy_err
                        )
                    });
            }
        }
    }

    let first_result = build_http_client(Some(app_handle), explicit_proxy, timeout_secs)
        .and_then(|client| download_url_to_file_with_client(&client, url, out_path));
    match first_result {
        Ok(content_type) => Ok(content_type),
        Err(first_err) => {
            let can_retry_direct = explicit_proxy
                .map(|value| value.trim().is_empty())
                .unwrap_or(true)
                && effective_proxy(Some(app_handle), explicit_proxy).is_some();
            if !can_retry_direct {
                return Err(first_err);
            }

            let _ = fs::remove_file(out_path);
            let _ = fs::remove_file(out_path.with_extension("download.tmp"));
            let direct_client = build_direct_http_client(timeout_secs)?;
            download_url_to_file_with_client(&direct_client, url, out_path).map_err(|second_err| {
                format!("{}；无代理直连重试也失败：{}", first_err, second_err)
            })
        }
    }
}

fn download_url_to_file_with_client(
    client: &Client,
    url: &str,
    out_path: &PathBuf,
) -> Result<Option<String>, String> {
    let mut response = client
        .get(url)
        .header(
            reqwest::header::ACCEPT,
            "image/avif,image/webp,image/apng,image/svg+xml,image/*,video/*,*/*;q=0.8",
        )
        .send()
        .map_err(|e| format!("下载请求失败：{}", e))?;

    if !response.status().is_success() {
        return Err(format!("下载失败，HTTP 状态码：{}", response.status()));
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());

    let tmp_path = out_path.with_extension("download.tmp");
    let write_result = (|| -> Result<(), String> {
        let mut file = File::create(&tmp_path).map_err(|e| e.to_string())?;
        response
            .copy_to(&mut file)
            .map_err(|e| format!("写入下载文件失败：{}", e))?;
        Ok(())
    })();
    if let Err(err) = write_result {
        let _ = fs::remove_file(&tmp_path);
        return Err(err);
    }

    fs::rename(&tmp_path, out_path)
        .or_else(|_| {
            fs::copy(&tmp_path, out_path).map(|_| ())?;
            let _ = fs::remove_file(&tmp_path);
            Ok::<(), std::io::Error>(())
        })
        .map_err(|e| e.to_string())?;
    Ok(content_type)
}

const RIFE_ENGINE_VERSION: &str = "20221029";
const RIFE_ENGINE_DIR_NAME: &str = "rife-ncnn-vulkan-20221029-windows";
const RIFE_ENGINE_ASSET_URL: &str = "https://api.unmind.art/v1/ai/client-assets/rife-ncnn-vulkan-20221029-windows-lite.zip";
const RIFE_ENGINE_ASSET_FALLBACK_URL: &str = "https://github.com/jiuqu1122-ops/inspiration-drawer/releases/download/engine-rife-20221029/rife-ncnn-vulkan-20221029-windows-lite.zip";
const RIFE_ENGINE_SHA256: &str = "A4DA55EC5629DBD5E9C6594D96225308325FC39A3DF67CD8E77010207525CE77";
const RIFE_ENGINE_ZIP_SIZE: u64 = 123_750_542;
const FFMPEG_TOOLS_DIR_NAME: &str = "ffmpeg-tools-n8.1-win64-gpl";
const FFMPEG_TOOLS_ASSET_URL: &str = "https://api.unmind.art/v1/ai/client-assets/ffmpeg-tools-n8.1-win64-gpl.zip";
const FFMPEG_TOOLS_ASSET_FALLBACK_URL: &str = "https://github.com/jiuqu1122-ops/inspiration-drawer/releases/download/engine-rife-20221029/ffmpeg-tools-n8.1-win64-gpl.zip";
const FFMPEG_TOOLS_SHA256: &str =
    "D4B1D805749E6FA174E4BE158E844AD93BACBF23C2C68EDD473EEBE96B09CA63";
const FFMPEG_TOOLS_ZIP_SIZE: u64 = 109_205_730;
const REALESRGAN_ENGINE_VERSION: &str = "20220424";
const REALESRGAN_NATIVE_SCALE: u32 = 4;
const REALESRGAN_TILE_SIZE: u32 = 256;
const REALESRGAN_SAFE_INTERMEDIATE_MAX_EDGE: u32 = 8_192;
const REALESRGAN_SAFE_INTERMEDIATE_MAX_PIXELS: u64 = 48_000_000;
const REALESRGAN_SAFE_FINAL_MAX_EDGE: u32 = 4_096;
const REALESRGAN_SAFE_FINAL_MAX_PIXELS: u64 = 16_000_000;
const REALESRGAN_ENGINE_DIR_NAME: &str = "realesrgan-ncnn-vulkan-20220424-windows";
const REALESRGAN_ENGINE_ASSET_URL: &str = "https://api.unmind.art/v1/ai/client-assets/realesrgan-ncnn-vulkan-20220424-windows.zip";
const REALESRGAN_ENGINE_ASSET_FALLBACK_URL: &str = "https://github.com/jiuqu1122-ops/inspiration-drawer/releases/download/engine-realesrgan-20220424/realesrgan-ncnn-vulkan-20220424-windows.zip";
const REALESRGAN_ENGINE_SHA256: &str =
    "ABC02804E17982A3BE33675E4D471E91EA374E65B70167ABC09E31ACB412802D";
const REALESRGAN_ENGINE_ZIP_SIZE: u64 = 45_474_481;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RifeEngineStatus {
    installed: bool,
    version: String,
    install_dir: String,
    engine_dir: String,
    exe_path: String,
    asset_url: String,
    zip_sha256: String,
    zip_size: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RifeFrameInterpolationResult {
    output_path: String,
    engine_dir: String,
    fps: f64,
    output_fps: f64,
    factor: u32,
    input_frames: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct VideoCfrNormalizationResult {
    output_path: String,
    converted: bool,
    is_vfr: bool,
    source_fps: Option<f64>,
    normalized_fps: Option<f64>,
    reason: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct VideoFrameRateAnalysis {
    avg_fps: Option<f64>,
    r_fps: Option<f64>,
    duration_sec: Option<f64>,
    frame_count: Option<u64>,
    packet_sample_count: usize,
    unstable_packet_timing: bool,
    is_vfr: bool,
    recommended_fps: Option<f64>,
    reason: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct QuickVideoEnhancementResult {
    output_path: String,
    scale: u32,
    output_format: String,
    fps: Option<f64>,
    width: Option<u32>,
    height: Option<u32>,
    encoder: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RifeEngineProgress {
    progress_id: String,
    stage: String,
    label: String,
    loaded: u64,
    total: u64,
    progress: f64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RifeFrameInterpolationEstimate {
    duration_sec: Option<f64>,
    width: Option<u32>,
    height: Option<u32>,
    fps: Option<f64>,
    frame_count: Option<u64>,
    output_fps: Option<f64>,
    output_frame_count: Option<u64>,
    sample_frames: Option<u32>,
    estimated_seconds_min: Option<f64>,
    estimated_seconds_max: Option<f64>,
    source_fps: Option<f64>,
    cfr_converted: bool,
    cfr_reason: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RealEsrganEngineStatus {
    installed: bool,
    version: String,
    install_dir: String,
    engine_dir: String,
    exe_path: String,
    asset_url: String,
    zip_sha256: String,
    zip_size: u64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RealEsrganEnhancementResult {
    output_path: String,
    engine_dir: String,
    scale: u32,
    mode: String,
    resize_mode: String,
    output_format: String,
    fps: Option<f64>,
    width: Option<u32>,
    height: Option<u32>,
    preview: bool,
    processed_duration_sec: Option<f64>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RealEsrganEnhancementEstimate {
    duration_sec: Option<f64>,
    width: Option<u32>,
    height: Option<u32>,
    fps: Option<f64>,
    frame_count: Option<u64>,
    output_width: Option<u32>,
    output_height: Option<u32>,
    preview: bool,
    preview_duration_sec: Option<f64>,
    sample_frames: Option<u32>,
    estimated_seconds_min: Option<f64>,
    estimated_seconds_max: Option<f64>,
}

struct VideoProbeInfo {
    duration_sec: Option<f64>,
    width: Option<u32>,
    height: Option<u32>,
    fps: Option<f64>,
    frame_count: Option<u64>,
}

fn app_install_dir() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("获取程序路径失败: {}", e))?;
    exe.parent()
        .map(|value| value.to_path_buf())
        .ok_or_else(|| "获取程序安装目录失败".to_string())
}

fn rife_engine_base_dir() -> Result<PathBuf, String> {
    Ok(app_install_dir()?
        .join("engines")
        .join("frame-interpolation"))
}

fn rife_engine_dir() -> Result<PathBuf, String> {
    Ok(rife_engine_base_dir()?.join(RIFE_ENGINE_DIR_NAME))
}

fn rife_engine_exe_path() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        Ok(rife_engine_dir()?.join("rife-ncnn-vulkan.exe"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(rife_engine_dir()?.join("rife-ncnn-vulkan"))
    }
}

fn realesrgan_engine_base_dir() -> Result<PathBuf, String> {
    Ok(app_install_dir()?.join("engines").join("upscaling"))
}

fn realesrgan_engine_dir() -> Result<PathBuf, String> {
    Ok(realesrgan_engine_base_dir()?.join(REALESRGAN_ENGINE_DIR_NAME))
}

fn realesrgan_engine_exe_path() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        Ok(realesrgan_engine_dir()?.join("realesrgan-ncnn-vulkan.exe"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(realesrgan_engine_dir()?.join("realesrgan-ncnn-vulkan"))
    }
}

fn media_tools_base_dir() -> Result<PathBuf, String> {
    Ok(app_install_dir()?.join("engines").join("media-tools"))
}

fn ffmpeg_tools_dir() -> Result<PathBuf, String> {
    Ok(media_tools_base_dir()?.join(FFMPEG_TOOLS_DIR_NAME))
}

fn media_tool_binary_name(tool: &str) -> String {
    #[cfg(target_os = "windows")]
    {
        format!("{}.exe", tool)
    }
    #[cfg(not(target_os = "windows"))]
    {
        tool.to_string()
    }
}

fn bundled_media_tool_path(tool: &str) -> Result<PathBuf, String> {
    Ok(ffmpeg_tools_dir()?
        .join("bin")
        .join(media_tool_binary_name(tool)))
}

fn find_system_tool_path(tool: &str) -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    let finder = "where";
    #[cfg(not(target_os = "windows"))]
    let finder = "which";

    let mut finder_cmd = SysCommand::new(finder);
    finder_cmd.arg(tool);
    if let Ok(output) = hide_console_window(&mut finder_cmd).output() {
        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                let path = PathBuf::from(trimmed);
                if path.is_file() {
                    return Some(path);
                }
            }
        }
    }

    let mut version_cmd = SysCommand::new(tool);
    version_cmd.arg("-version");
    if let Ok(output) = hide_console_window(&mut version_cmd).output() {
        if output.status.success() {
            return Some(PathBuf::from(tool));
        }
    }
    None
}

fn resolve_system_media_tools() -> Option<(PathBuf, PathBuf)> {
    let ffmpeg = find_system_tool_path("ffmpeg")?;
    let ffprobe = find_system_tool_path("ffprobe")?;
    Some((ffmpeg, ffprobe))
}

fn build_rife_engine_status() -> Result<RifeEngineStatus, String> {
    let install_dir = app_install_dir()?;
    let engine_dir = rife_engine_dir()?;
    let exe_path = rife_engine_exe_path()?;
    Ok(RifeEngineStatus {
        installed: exe_path.is_file(),
        version: RIFE_ENGINE_VERSION.to_string(),
        install_dir: display_local_path(&install_dir),
        engine_dir: display_local_path(&engine_dir),
        exe_path: display_local_path(&exe_path),
        asset_url: RIFE_ENGINE_ASSET_URL.to_string(),
        zip_sha256: RIFE_ENGINE_SHA256.to_string(),
        zip_size: RIFE_ENGINE_ZIP_SIZE,
    })
}

fn build_realesrgan_engine_status() -> Result<RealEsrganEngineStatus, String> {
    let install_dir = app_install_dir()?;
    let engine_dir = realesrgan_engine_dir()?;
    let exe_path = realesrgan_engine_exe_path()?;
    Ok(RealEsrganEngineStatus {
        installed: exe_path.is_file(),
        version: REALESRGAN_ENGINE_VERSION.to_string(),
        install_dir: display_local_path(&install_dir),
        engine_dir: display_local_path(&engine_dir),
        exe_path: display_local_path(&exe_path),
        asset_url: REALESRGAN_ENGINE_ASSET_URL.to_string(),
        zip_sha256: REALESRGAN_ENGINE_SHA256.to_string(),
        zip_size: REALESRGAN_ENGINE_ZIP_SIZE,
    })
}

fn sha256_file_upper(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| format!("读取文件失败: {}", e))?;
    let mut hasher = Sha256::new();
    // Keep large I/O buffers off the Rust thread stack. Some Tauri commands
    // already use most of the Windows main-thread stack while deserializing
    // image-bearing JSON; another 1 MB stack allocation can terminate the
    // whole process with STATUS_STACK_OVERFLOW.
    let mut buffer = vec![0u8; 1024 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|e| format!("计算 SHA256 失败: {}", e))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex::encode(hasher.finalize()).to_ascii_uppercase())
}

fn normalize_sha256_value(value: &str) -> String {
    value
        .trim()
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect::<String>()
        .to_ascii_uppercase()
}

fn sha256_bytes_upper(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes)).to_ascii_uppercase()
}

fn app_update_manifest_endpoints_from_config() -> Result<Vec<Url>, String> {
    let config: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json"))
        .map_err(|e| format!("manifest 格式不符合预期：读取 tauri.conf.json 失败: {e}"))?;
    let endpoints = config
        .get("plugins")
        .and_then(|plugins| plugins.get("updater"))
        .and_then(|updater| updater.get("endpoints"))
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "manifest 格式不符合预期：未配置 plugins.updater.endpoints".to_string())?;

    let mut urls = Vec::new();
    let mut invalid = Vec::new();
    for endpoint in endpoints {
        let Some(raw) = endpoint.as_str() else {
            invalid.push(endpoint.to_string());
            continue;
        };
        let normalized = normalize_manifest_url(raw);
        match Url::parse(&normalized) {
            Ok(url) => {
                if !urls.iter().any(|existing| existing == &url) {
                    urls.push(url);
                }
            }
            Err(err) => invalid.push(format!("{normalized} ({err})")),
        }
    }

    if urls.is_empty() {
        return Err(format!(
            "manifest 格式不符合预期：没有合法 manifest endpoint{}",
            if invalid.is_empty() {
                String::new()
            } else {
                format!("；非法项：{}", invalid.join("；"))
            }
        ));
    }
    Ok(urls)
}

fn extract_app_update_version(raw_json: &serde_json::Value) -> Option<String> {
    raw_json
        .get("version")
        .or_else(|| raw_json.get("latest"))
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn parse_app_version_segments(version: &str) -> Result<Vec<u64>, String> {
    let segments = version
        .trim()
        .trim_start_matches(['v', 'V'])
        .split(|ch: char| !ch.is_ascii_digit())
        .filter(|segment| !segment.is_empty())
        .map(|segment| {
            segment.parse::<u64>().map_err(|e| {
                format!("版本号比较失败：无法解析版本号 {version:?} 中的 {segment:?}: {e}")
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    if segments.is_empty() {
        return Err(format!(
            "版本号比较失败：无法从版本号 {version:?} 提取数字段"
        ));
    }
    Ok(segments)
}

fn compare_app_versions(remote: &str, current: &str) -> Result<CmpOrdering, String> {
    let remote_segments = parse_app_version_segments(remote)?;
    let current_segments = parse_app_version_segments(current)?;
    let len = remote_segments.len().max(current_segments.len());
    for index in 0..len {
        let left = *remote_segments.get(index).unwrap_or(&0);
        let right = *current_segments.get(index).unwrap_or(&0);
        match left.cmp(&right) {
            CmpOrdering::Equal => {}
            other => return Ok(other),
        }
    }
    Ok(CmpOrdering::Equal)
}

fn normalize_manifest_url(raw: &str) -> String {
    let trimmed = raw.trim();
    if let Some((_, rest)) = trimmed.split_once("](") {
        if trimmed.starts_with('[') && rest.ends_with(')') {
            return rest.trim_end_matches(')').trim().to_string();
        }
    }
    trimmed.to_string()
}

fn push_app_update_source(
    sources: &mut Vec<AppUpdateDownloadSource>,
    name: Option<&str>,
    raw_url: Option<&str>,
) {
    let Some(raw_url) = raw_url else {
        return;
    };
    let normalized = normalize_manifest_url(raw_url);
    if normalized.is_empty() {
        return;
    }
    let Ok(url) = Url::parse(&normalized) else {
        eprintln!("[app-update] skip invalid update url: {normalized}");
        return;
    };
    if sources.iter().any(|source| source.url == url) {
        return;
    }
    let fallback_name = if url.domain().unwrap_or("").contains("gitee.com") {
        "Gitee 国内镜像"
    } else if url.domain().unwrap_or("").contains("github.com") {
        "GitHub Release"
    } else {
        "更新源"
    };
    sources.push(AppUpdateDownloadSource {
        name: name
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or(fallback_name)
            .to_string(),
        url,
    });
}

fn push_app_update_sources_from_urls_value(
    sources: &mut Vec<AppUpdateDownloadSource>,
    urls_value: Option<&serde_json::Value>,
) {
    let Some(serde_json::Value::Array(urls)) = urls_value else {
        return;
    };
    for item in urls {
        match item {
            serde_json::Value::String(url) => push_app_update_source(sources, None, Some(url)),
            serde_json::Value::Object(entry) => push_app_update_source(
                sources,
                entry.get("name").and_then(serde_json::Value::as_str),
                entry.get("url").and_then(serde_json::Value::as_str),
            ),
            _ => {}
        }
    }
}

fn preferred_app_update_platform_keys(raw_json: &serde_json::Value) -> Vec<String> {
    let mut keys = vec![
        "windows-x86_64-nsis".to_string(),
        "windows-x86_64".to_string(),
        "windows-x86_64-msi".to_string(),
    ];
    if let Some(platforms) = raw_json
        .get("platforms")
        .and_then(serde_json::Value::as_object)
    {
        for key in platforms.keys() {
            let lower = key.to_ascii_lowercase();
            if lower.contains("windows") && !keys.iter().any(|existing| existing == key) {
                keys.push(key.clone());
            }
        }
        for key in platforms.keys() {
            if !keys.iter().any(|existing| existing == key) {
                keys.push(key.clone());
            }
        }
    }
    keys
}

fn collect_app_update_sources(
    raw_json: &serde_json::Value,
    fallback_url: Option<&Url>,
) -> Vec<AppUpdateDownloadSource> {
    let mut sources = Vec::new();
    push_app_update_sources_from_urls_value(&mut sources, raw_json.get("urls"));

    if let Some(platforms) = raw_json
        .get("platforms")
        .and_then(serde_json::Value::as_object)
    {
        for key in preferred_app_update_platform_keys(raw_json) {
            let Some(platform) = platforms.get(&key) else {
                continue;
            };
            push_app_update_sources_from_urls_value(&mut sources, platform.get("urls"));
            push_app_update_source(
                &mut sources,
                Some(&format!("{key} url")),
                platform.get("url").and_then(serde_json::Value::as_str),
            );
        }
    }

    push_app_update_source(
        &mut sources,
        Some("Legacy url"),
        raw_json.get("url").and_then(serde_json::Value::as_str),
    );

    if let Some(fallback_url) =
        fallback_url.filter(|url| !sources.iter().any(|source| source.url == **url))
    {
        push_app_update_source(
            &mut sources,
            Some("Manifest url"),
            Some(fallback_url.as_str()),
        );
    }

    sources
}

fn find_app_update_platform_field<'a>(
    raw_json: &'a serde_json::Value,
    field: &str,
) -> Option<&'a serde_json::Value> {
    let platforms = raw_json.get("platforms")?.as_object()?;
    for key in preferred_app_update_platform_keys(raw_json) {
        if let Some(value) = platforms.get(&key).and_then(|platform| platform.get(field)) {
            return Some(value);
        }
    }
    None
}

fn extract_app_update_sha256(raw_json: &serde_json::Value) -> Option<String> {
    find_app_update_platform_field(raw_json, "sha256")
        .or_else(|| raw_json.get("sha256"))
        .and_then(serde_json::Value::as_str)
        .map(normalize_sha256_value)
        .filter(|value| !value.is_empty())
}

fn extract_app_update_size(raw_json: &serde_json::Value) -> Option<u64> {
    find_app_update_platform_field(raw_json, "size")
        .or_else(|| raw_json.get("size"))
        .and_then(|value| {
            value.as_u64().or_else(|| {
                value
                    .as_str()
                    .and_then(|text| text.trim().parse::<u64>().ok())
            })
        })
}

fn app_update_manifest_for_source(raw_json: &serde_json::Value, source: &Url) -> serde_json::Value {
    let mut manifest = raw_json.clone();
    let source_url = serde_json::Value::String(source.as_str().to_string());
    if let Some(object) = manifest.as_object_mut() {
        object.insert("url".to_string(), source_url.clone());
        if let Some(platforms) = object
            .get_mut("platforms")
            .and_then(serde_json::Value::as_object_mut)
        {
            for platform in platforms.values_mut() {
                if let Some(platform_object) = platform.as_object_mut() {
                    platform_object.insert("url".to_string(), source_url.clone());
                }
            }
        }
    }
    manifest
}

fn serve_one_app_update_manifest(
    manifest: serde_json::Value,
) -> Result<(Url, JoinHandle<()>), String> {
    let body = serde_json::to_vec(&manifest).map_err(|e| format!("序列化临时更新配置失败: {e}"))?;
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|e| format!("启动本地更新配置服务失败: {e}"))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("配置本地更新配置服务失败: {e}"))?;
    let addr = listener
        .local_addr()
        .map_err(|e| format!("读取本地更新配置服务地址失败: {e}"))?;
    let endpoint = Url::parse(&format!("http://{addr}/latest.json"))
        .map_err(|e| format!("生成本地更新配置地址失败: {e}"))?;
    let handle = thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(30);
        loop {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    if let Ok(mut reader_stream) = stream.try_clone() {
                        let mut reader = BufReader::new(&mut reader_stream);
                        let mut line = String::new();
                        loop {
                            line.clear();
                            match reader.read_line(&mut line) {
                                Ok(0) | Err(_) => break,
                                Ok(_) if line == "\r\n" || line == "\n" => break,
                                Ok(_) => {}
                            }
                        }
                    }
                    let headers = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        body.len()
                    );
                    let _ = stream.write_all(headers.as_bytes());
                    let _ = stream.write_all(&body);
                    let _ = stream.flush();
                    break;
                }
                Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                    if Instant::now() >= deadline {
                        break;
                    }
                    thread::sleep(Duration::from_millis(20));
                }
                Err(_) => break,
            }
        }
    });
    Ok((endpoint, handle))
}

fn emit_app_update_progress(
    app_handle: &tauri::AppHandle,
    progress_id: &str,
    stage: &str,
    message: impl Into<String>,
    version: Option<&str>,
    source: Option<&AppUpdateDownloadSource>,
    loaded: u64,
    total: u64,
) {
    emit_app_update_progress_detail(
        app_handle,
        progress_id,
        stage,
        message,
        version,
        source,
        loaded,
        total,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
    );
}

fn emit_app_update_progress_detail(
    app_handle: &tauri::AppHandle,
    progress_id: &str,
    stage: &str,
    message: impl Into<String>,
    version: Option<&str>,
    source: Option<&AppUpdateDownloadSource>,
    loaded: u64,
    total: u64,
    updater_kind: Option<&str>,
    manifest_endpoint: Option<&str>,
    status_code: Option<u16>,
    current_version: Option<&str>,
    available: Option<bool>,
    selected_url: Option<&str>,
    error_message: Option<&str>,
) {
    let progress = if total > 0 {
        (loaded as f64 / total as f64).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let payload = AppUpdateProgress {
        progress_id: progress_id.to_string(),
        stage: stage.to_string(),
        message: message.into(),
        updater_kind: updater_kind.map(str::to_string),
        manifest_endpoint: manifest_endpoint.map(str::to_string),
        status_code,
        version: version.map(str::to_string),
        current_version: current_version.map(str::to_string),
        available,
        source_name: source.map(|source| source.name.clone()),
        source_url: source.map(|source| source.url.as_str().to_string()),
        selected_url: selected_url.map(str::to_string),
        error_message: error_message.map(str::to_string),
        loaded,
        total,
        progress,
    };
    let _ = app_handle.emit("app-update-progress", payload);
}

#[allow(dead_code)]
fn fetch_app_update_manifest_probe(
    app_handle: &tauri::AppHandle,
    progress_id: &str,
    timeout: Duration,
) -> Result<AppUpdateManifestProbe, String> {
    let endpoints = app_update_manifest_endpoints_from_config()?;
    let timeout_secs = timeout.as_secs().max(1);
    let client = build_http_client(Some(app_handle), None, timeout_secs)?;
    let mut failures = Vec::new();

    for endpoint in endpoints {
        let endpoint_text = endpoint.as_str().to_string();
        emit_app_update_progress_detail(
            app_handle,
            progress_id,
            "manifest-request",
            format!("请求 manifest: {endpoint_text}"),
            None,
            None,
            0,
            0,
            Some("自定义多源 updater"),
            Some(&endpoint_text),
            None,
            None,
            None,
            None,
            None,
        );
        eprintln!("[app-update] updater=自定义多源 updater manifest endpoint={endpoint_text}");

        let response = match client.get(endpoint.clone()).send() {
            Ok(response) => response,
            Err(err) => {
                let message = format!("manifest 请求失败：{endpoint_text}；原始错误: {err}");
                eprintln!("[app-update] {message}");
                emit_app_update_progress_detail(
                    app_handle,
                    progress_id,
                    "manifest-request-failed",
                    &message,
                    None,
                    None,
                    0,
                    0,
                    Some("自定义多源 updater"),
                    Some(&endpoint_text),
                    None,
                    None,
                    None,
                    None,
                    Some(&err.to_string()),
                );
                failures.push(message);
                continue;
            }
        };

        let status = response.status();
        let status_code = status.as_u16();
        emit_app_update_progress_detail(
            app_handle,
            progress_id,
            "manifest-response",
            format!("manifest HTTP 状态码: {status_code}"),
            None,
            None,
            0,
            0,
            Some("自定义多源 updater"),
            Some(&endpoint_text),
            Some(status_code),
            None,
            None,
            None,
            None,
        );
        eprintln!("[app-update] manifest endpoint={endpoint_text} http_status={status_code}");

        if !status.is_success() {
            let message = format!("manifest 请求失败：{endpoint_text}；HTTP 状态码: {status_code}");
            emit_app_update_progress_detail(
                app_handle,
                progress_id,
                "manifest-http-failed",
                &message,
                None,
                None,
                0,
                0,
                Some("自定义多源 updater"),
                Some(&endpoint_text),
                Some(status_code),
                None,
                None,
                None,
                Some(&message),
            );
            failures.push(message);
            continue;
        }

        let body = match response.text() {
            Ok(body) => body,
            Err(err) => {
                let message =
                    format!("manifest 请求失败：读取响应体失败 {endpoint_text}；原始错误: {err}");
                eprintln!("[app-update] {message}");
                failures.push(message.clone());
                emit_app_update_progress_detail(
                    app_handle,
                    progress_id,
                    "manifest-body-failed",
                    &message,
                    None,
                    None,
                    0,
                    0,
                    Some("自定义多源 updater"),
                    Some(&endpoint_text),
                    Some(status_code),
                    None,
                    None,
                    None,
                    Some(&err.to_string()),
                );
                continue;
            }
        };

        let raw_json = match serde_json::from_str::<serde_json::Value>(&body) {
            Ok(raw_json) => raw_json,
            Err(err) => {
                let snippet = body.chars().take(180).collect::<String>();
                let message = format!(
                    "manifest 不是合法 JSON：{endpoint_text}；原始错误: {err}；响应开头: {snippet}"
                );
                eprintln!("[app-update] {message}");
                failures.push(message.clone());
                emit_app_update_progress_detail(
                    app_handle,
                    progress_id,
                    "manifest-json-failed",
                    &message,
                    None,
                    None,
                    0,
                    0,
                    Some("自定义多源 updater"),
                    Some(&endpoint_text),
                    Some(status_code),
                    None,
                    None,
                    None,
                    Some(&err.to_string()),
                );
                continue;
            }
        };

        let parsed_version = extract_app_update_version(&raw_json);
        emit_app_update_progress_detail(
            app_handle,
            progress_id,
            "manifest-json-ok",
            "manifest JSON 解析成功",
            parsed_version.as_deref(),
            None,
            0,
            0,
            Some("自定义多源 updater"),
            Some(&endpoint_text),
            Some(status_code),
            None,
            None,
            None,
            None,
        );
        eprintln!("[app-update] manifest json parse ok endpoint={endpoint_text}");

        return Ok(AppUpdateManifestProbe {
            endpoint,
            raw_json,
            status_code,
        });
    }

    Err(format!(
        "manifest 请求失败：所有 endpoint 均不可用或不是合法 JSON。\n{}",
        failures
            .iter()
            .map(|failure| format!("- {failure}"))
            .collect::<Vec<_>>()
            .join("\n")
    ))
}

fn fetch_app_update_manifest_probe_for_current_version(
    app_handle: &tauri::AppHandle,
    progress_id: &str,
    timeout: Duration,
    current_version: &str,
) -> Result<AppUpdateManifestProbe, String> {
    let endpoints = app_update_manifest_endpoints_from_config()?;
    let timeout_secs = timeout.as_secs().max(1);
    let client = build_http_client(Some(app_handle), None, timeout_secs)?;
    let mut failures = Vec::new();
    let mut best_probe: Option<(AppUpdateManifestProbe, String)> = None;

    for endpoint in endpoints {
        let endpoint_text = endpoint.as_str().to_string();
        emit_app_update_progress_detail(
            app_handle,
            progress_id,
            "manifest-request",
            format!("请求 manifest: {endpoint_text}"),
            None,
            None,
            0,
            0,
            Some("自定义多源 updater"),
            Some(&endpoint_text),
            None,
            Some(current_version),
            None,
            None,
            None,
        );
        eprintln!("[app-update] updater=自定义多源 updater manifest endpoint={endpoint_text}");

        let response = match client.get(endpoint.clone()).send() {
            Ok(response) => response,
            Err(err) => {
                let message = format!("manifest 请求失败：{endpoint_text}；原始错误: {err}");
                eprintln!("[app-update] {message}");
                failures.push(message);
                continue;
            }
        };

        let status = response.status();
        let status_code = status.as_u16();
        emit_app_update_progress_detail(
            app_handle,
            progress_id,
            "manifest-response",
            format!("manifest HTTP 状态码: {status_code}"),
            None,
            None,
            0,
            0,
            Some("自定义多源 updater"),
            Some(&endpoint_text),
            Some(status_code),
            Some(current_version),
            None,
            None,
            None,
        );
        eprintln!("[app-update] manifest endpoint={endpoint_text} http_status={status_code}");
        if !status.is_success() {
            failures.push(format!(
                "manifest 请求失败：{endpoint_text}；HTTP 状态码: {status_code}"
            ));
            continue;
        }

        let body = match response.text() {
            Ok(body) => body,
            Err(err) => {
                failures.push(format!(
                    "manifest 请求失败：读取响应体失败 {endpoint_text}；原始错误: {err}"
                ));
                continue;
            }
        };
        let raw_json = match serde_json::from_str::<serde_json::Value>(&body) {
            Ok(raw_json) => raw_json,
            Err(err) => {
                let snippet = body.chars().take(180).collect::<String>();
                failures.push(format!(
                    "manifest 不是合法 JSON：{endpoint_text}；原始错误: {err}；响应开头: {snippet}"
                ));
                continue;
            }
        };

        let parsed_version = extract_app_update_version(&raw_json);
        emit_app_update_progress_detail(
            app_handle,
            progress_id,
            "manifest-json-ok",
            "manifest JSON 解析成功",
            parsed_version.as_deref(),
            None,
            0,
            0,
            Some("自定义多源 updater"),
            Some(&endpoint_text),
            Some(status_code),
            Some(current_version),
            None,
            None,
            None,
        );
        eprintln!("[app-update] manifest json parse ok endpoint={endpoint_text}");

        let Some(parsed_version) = parsed_version else {
            failures.push(format!(
                "manifest 格式不符合预期：缺少 version 字段 {endpoint_text}"
            ));
            continue;
        };
        let probe = AppUpdateManifestProbe {
            endpoint,
            raw_json,
            status_code,
        };
        match compare_app_versions(&parsed_version, current_version)? {
            CmpOrdering::Greater => return Ok(probe),
            _ => {
                let keep_best = best_probe
                    .as_ref()
                    .map(|(_, best_version)| {
                        compare_app_versions(&parsed_version, best_version)
                            == Ok(CmpOrdering::Greater)
                    })
                    .unwrap_or(true);
                if keep_best {
                    best_probe = Some((probe, parsed_version.clone()));
                }
                eprintln!("[app-update] manifest version {parsed_version} from {endpoint_text} is not newer than current {current_version}; trying next endpoint");
            }
        }
    }

    if let Some((probe, _)) = best_probe {
        return Ok(probe);
    }

    Err(format!(
        "manifest 请求失败：所有 endpoint 均不可用或不是合法 JSON。\n{}",
        failures
            .iter()
            .map(|failure| format!("- {failure}"))
            .collect::<Vec<_>>()
            .join("\n")
    ))
}

async fn download_app_update_from_source(
    app_handle: &tauri::AppHandle,
    progress_id: &str,
    raw_json: &serde_json::Value,
    source: &AppUpdateDownloadSource,
    version: &str,
    check_timeout: Duration,
    download_timeout: Duration,
) -> Result<(tauri_plugin_updater::Update, Vec<u8>), String> {
    let manifest = app_update_manifest_for_source(raw_json, &source.url);
    let (local_endpoint, server_handle) = serve_one_app_update_manifest(manifest)?;
    eprintln!(
        "[app-update] internal official Tauri updater check local_manifest={} selected_download_url={}",
        local_endpoint,
        source.url
    );
    let update_result = app_handle
        .updater_builder()
        .endpoints(vec![local_endpoint])
        .map_err(|e| format!("配置更新源 {} 失败: {e}", source.name))?
        .timeout(check_timeout)
        .build()
        .map_err(|e| format!("初始化更新源 {} 失败: {e}", source.name))?
        .check()
        .await;
    let _ = server_handle.join();

    let mut update = update_result
        .map_err(|e| format!("检查更新源 {} 失败: {e}", source.name))?
        .ok_or_else(|| format!("更新源 {} 未返回可安装版本", source.name))?;
    update.timeout = Some(download_timeout);

    let loaded_bytes = Arc::new(AtomicU64::new(0));
    let total_bytes = Arc::new(AtomicU64::new(0));
    let finished_loaded_bytes = Arc::clone(&loaded_bytes);
    let finished_total_bytes = Arc::clone(&total_bytes);
    let mut last_emit_at = Instant::now() - Duration::from_secs(1);
    let bytes = update
        .download(
            |chunk_length, content_length| {
                let loaded = loaded_bytes
                    .fetch_add(chunk_length as u64, Ordering::Relaxed)
                    .saturating_add(chunk_length as u64);
                if let Some(content_length) = content_length {
                    total_bytes.store(content_length, Ordering::Relaxed);
                }
                let total = total_bytes.load(Ordering::Relaxed);
                if last_emit_at.elapsed() >= Duration::from_millis(350)
                    || (total > 0 && loaded >= total)
                {
                    last_emit_at = Instant::now();
                    emit_app_update_progress(
                        app_handle,
                        progress_id,
                        "downloading",
                        format!("正在从 {} 下载更新包", source.name),
                        Some(version),
                        Some(source),
                        loaded,
                        total,
                    );
                }
            },
            || {
                let loaded = finished_loaded_bytes.load(Ordering::Relaxed);
                let total = finished_total_bytes.load(Ordering::Relaxed);
                emit_app_update_progress(
                    app_handle,
                    progress_id,
                    "download-finished",
                    format!("{} 下载完成，正在校验", source.name),
                    Some(version),
                    Some(source),
                    loaded,
                    total,
                );
            },
        )
        .await
        .map_err(|e| format!("下载更新源 {} 失败: {e}", source.name))?;

    Ok((update, bytes))
}

#[tauri::command]
async fn check_and_install_app_update_mirrors(
    app_handle: tauri::AppHandle,
    progress_id: String,
    check_timeout_ms: Option<u64>,
    download_timeout_ms: Option<u64>,
) -> Result<AppUpdateInstallResult, String> {
    let progress_id = if progress_id.trim().is_empty() {
        "app-update".to_string()
    } else {
        progress_id.trim().to_string()
    };
    let check_timeout =
        Duration::from_millis(check_timeout_ms.unwrap_or(8_000).clamp(1_000, 120_000));
    let download_timeout =
        Duration::from_millis(download_timeout_ms.unwrap_or(120_000).clamp(5_000, 900_000));

    let current_version = app_handle.package_info().version.to_string();

    emit_app_update_progress_detail(
        &app_handle,
        &progress_id,
        "checking",
        "正在检查更新（自定义多源 updater）",
        None,
        None,
        0,
        0,
        Some("自定义多源 updater"),
        None,
        None,
        Some(&current_version),
        None,
        None,
        None,
    );

    eprintln!("[app-update] updater=自定义多源 updater current_version={current_version}");

    // The manifest probe uses reqwest's blocking client. Keep its entire
    // lifecycle off Tokio worker threads so dropping the client cannot try to
    // shut down its internal runtime from inside this async command.
    let manifest_app_handle = app_handle.clone();
    let manifest_progress_id = progress_id.clone();
    let manifest_current_version = current_version.clone();
    let manifest_probe = tauri::async_runtime::spawn_blocking(move || {
        fetch_app_update_manifest_probe_for_current_version(
            &manifest_app_handle,
            &manifest_progress_id,
            check_timeout,
            &manifest_current_version,
        )
    })
    .await
    .map_err(|error| format!("更新 manifest 检查任务异常：{error}"))??;
    let manifest_endpoint = manifest_probe.endpoint.as_str().to_string();
    let raw_json = manifest_probe.raw_json;
    let version = extract_app_update_version(&raw_json).ok_or_else(|| {
        let message = "manifest 格式不符合预期：缺少 version 字段".to_string();
        emit_app_update_progress_detail(
            &app_handle,
            &progress_id,
            "manifest-format-failed",
            &message,
            None,
            None,
            0,
            0,
            Some("自定义多源 updater"),
            Some(&manifest_endpoint),
            Some(manifest_probe.status_code),
            Some(&current_version),
            None,
            None,
            Some(&message),
        );
        message
    })?;

    let version_order = compare_app_versions(&version, &current_version).map_err(|err| {
        emit_app_update_progress_detail(
            &app_handle,
            &progress_id,
            "version-compare-failed",
            &err,
            Some(&version),
            None,
            0,
            0,
            Some("自定义多源 updater"),
            Some(&manifest_endpoint),
            Some(manifest_probe.status_code),
            Some(&current_version),
            None,
            None,
            Some(&err),
        );
        err
    })?;
    let has_update = version_order == CmpOrdering::Greater;
    emit_app_update_progress_detail(
        &app_handle,
        &progress_id,
        "version-compared",
        format!(
            "版本比较完成：远端 {version} / 本地 {current_version} / 有新版本: {}",
            if has_update { "是" } else { "否" }
        ),
        Some(&version),
        None,
        0,
        0,
        Some("自定义多源 updater"),
        Some(&manifest_endpoint),
        Some(manifest_probe.status_code),
        Some(&current_version),
        Some(has_update),
        None,
        None,
    );
    eprintln!(
        "[app-update] manifest endpoint={manifest_endpoint} parsed_version={version} current_version={current_version} has_update={has_update}"
    );

    if !has_update {
        emit_app_update_progress_detail(
            &app_handle,
            &progress_id,
            "up-to-date",
            "当前已是最新版本",
            Some(&version),
            None,
            0,
            0,
            Some("自定义多源 updater"),
            Some(&manifest_endpoint),
            Some(manifest_probe.status_code),
            Some(&current_version),
            Some(false),
            None,
            None,
        );
        return Ok(AppUpdateInstallResult {
            available: false,
            version: Some(version),
            installed: false,
        });
    }

    let expected_sha256 = extract_app_update_sha256(&raw_json).ok_or_else(|| {
        let message = "manifest 格式不符合预期：更新配置缺少 sha256，已拒绝安装。自定义多源 updater 不能用 signature 替代 sha256。".to_string();
        emit_app_update_progress_detail(
            &app_handle,
            &progress_id,
            "manifest-format-failed",
            &message,
            Some(&version),
            None,
            0,
            0,
            Some("自定义多源 updater"),
            Some(&manifest_endpoint),
            Some(manifest_probe.status_code),
            Some(&current_version),
            Some(true),
            None,
            Some(&message),
        );
        message
    })?;
    let expected_size = extract_app_update_size(&raw_json);
    let sources = collect_app_update_sources(&raw_json, None);

    if sources.is_empty() {
        let message = "manifest 格式不符合预期：更新配置没有可用下载地址 urls / platforms.windows-x86_64.url / url".to_string();
        emit_app_update_progress_detail(
            &app_handle,
            &progress_id,
            "manifest-format-failed",
            &message,
            Some(&version),
            None,
            0,
            0,
            Some("自定义多源 updater"),
            Some(&manifest_endpoint),
            Some(manifest_probe.status_code),
            Some(&current_version),
            Some(true),
            None,
            Some(&message),
        );
        return Err(message);
    }

    eprintln!(
        "[app-update] manifest fields ok endpoint={manifest_endpoint} version={version} sha256={} size={} urls={}",
        expected_sha256,
        expected_size
            .map(|value| value.to_string())
            .unwrap_or_else(|| "none".to_string()),
        sources
            .iter()
            .map(|source| source.url.as_str())
            .collect::<Vec<_>>()
            .join(", ")
    );

    emit_app_update_progress_detail(
        &app_handle,
        &progress_id,
        "found",
        format!("发现新版本 {version}，准备下载"),
        Some(&version),
        None,
        0,
        expected_size.unwrap_or(0),
        Some("自定义多源 updater"),
        Some(&manifest_endpoint),
        Some(manifest_probe.status_code),
        Some(&current_version),
        Some(true),
        None,
        None,
    );

    let mut failures = Vec::new();
    for (index, source) in sources.iter().enumerate() {
        emit_app_update_progress_detail(
            &app_handle,
            &progress_id,
            "source-started",
            format!(
                "尝试更新源 {}/{}：{}",
                index + 1,
                sources.len(),
                source.name
            ),
            Some(&version),
            Some(source),
            0,
            expected_size.unwrap_or(0),
            Some("自定义多源 updater"),
            Some(&manifest_endpoint),
            Some(manifest_probe.status_code),
            Some(&current_version),
            Some(true),
            Some(source.url.as_str()),
            None,
        );
        eprintln!(
            "[app-update] selected download url source {}/{}: {} <{}>",
            index + 1,
            sources.len(),
            source.name,
            source.url
        );

        match download_app_update_from_source(
            &app_handle,
            &progress_id,
            &raw_json,
            source,
            &version,
            check_timeout,
            download_timeout,
        )
        .await
        {
            Ok((source_update, bytes)) => {
                if let Some(expected_size) = expected_size {
                    if bytes.len() as u64 != expected_size {
                        let message = format!(
                            "更新源 {} 文件大小不匹配，期望 {} 字节，实际 {} 字节",
                            source.name,
                            expected_size,
                            bytes.len()
                        );
                        eprintln!("[app-update] {message}");
                        emit_app_update_progress_detail(
                            &app_handle,
                            &progress_id,
                            "source-failed",
                            message.clone(),
                            Some(&version),
                            Some(source),
                            0,
                            expected_size,
                            Some("自定义多源 updater"),
                            Some(&manifest_endpoint),
                            Some(manifest_probe.status_code),
                            Some(&current_version),
                            Some(true),
                            Some(source.url.as_str()),
                            Some(&message),
                        );
                        failures.push(message);
                        continue;
                    }
                }

                let actual_sha256 = sha256_bytes_upper(&bytes);
                if actual_sha256 != expected_sha256 {
                    let message = format!(
                        "更新源 {} SHA256 校验失败，期望 {}，实际 {}",
                        source.name, expected_sha256, actual_sha256
                    );
                    eprintln!("[app-update] {message}");
                    emit_app_update_progress_detail(
                        &app_handle,
                        &progress_id,
                        "source-failed",
                        message.clone(),
                        Some(&version),
                        Some(source),
                        0,
                        expected_size.unwrap_or(bytes.len() as u64),
                        Some("自定义多源 updater"),
                        Some(&manifest_endpoint),
                        Some(manifest_probe.status_code),
                        Some(&current_version),
                        Some(true),
                        Some(source.url.as_str()),
                        Some(&message),
                    );
                    failures.push(message);
                    continue;
                }

                emit_app_update_progress_detail(
                    &app_handle,
                    &progress_id,
                    "sha256-verified",
                    format!("{} SHA256 校验通过", source.name),
                    Some(&version),
                    Some(source),
                    bytes.len() as u64,
                    expected_size.unwrap_or(bytes.len() as u64),
                    Some("自定义多源 updater"),
                    Some(&manifest_endpoint),
                    Some(manifest_probe.status_code),
                    Some(&current_version),
                    Some(true),
                    Some(source.url.as_str()),
                    None,
                );
                emit_app_update_progress_detail(
                    &app_handle,
                    &progress_id,
                    "installing",
                    "更新包校验通过，正在安装",
                    Some(&version),
                    Some(source),
                    bytes.len() as u64,
                    expected_size.unwrap_or(bytes.len() as u64),
                    Some("自定义多源 updater"),
                    Some(&manifest_endpoint),
                    Some(manifest_probe.status_code),
                    Some(&current_version),
                    Some(true),
                    Some(source.url.as_str()),
                    None,
                );
                eprintln!(
                    "[app-update] installing update {version} from {}",
                    source.name
                );
                if let Err(err) = source_update.install(bytes) {
                    let message = format!("安装更新失败: {err}");
                    eprintln!("[app-update] {message}");
                    emit_app_update_progress_detail(
                        &app_handle,
                        &progress_id,
                        "install-failed",
                        &message,
                        Some(&version),
                        Some(source),
                        0,
                        expected_size.unwrap_or(0),
                        Some("自定义多源 updater"),
                        Some(&manifest_endpoint),
                        Some(manifest_probe.status_code),
                        Some(&current_version),
                        Some(true),
                        Some(source.url.as_str()),
                        Some(&err.to_string()),
                    );
                    return Err(message);
                }

                return Ok(AppUpdateInstallResult {
                    available: true,
                    version: Some(version),
                    installed: true,
                });
            }
            Err(err) => {
                let message = format!("更新源 {} 失败: {err}", source.name);
                eprintln!("[app-update] {message}");
                emit_app_update_progress_detail(
                    &app_handle,
                    &progress_id,
                    "source-failed",
                    message.clone(),
                    Some(&version),
                    Some(source),
                    0,
                    expected_size.unwrap_or(0),
                    Some("自定义多源 updater"),
                    Some(&manifest_endpoint),
                    Some(manifest_probe.status_code),
                    Some(&current_version),
                    Some(true),
                    Some(source.url.as_str()),
                    Some(&err),
                );
                failures.push(message);
            }
        }
    }

    Err(format!(
        "所有更新源均下载失败，已取消安装。\n{}",
        failures
            .iter()
            .map(|failure| format!("- {failure}"))
            .collect::<Vec<_>>()
            .join("\n")
    ))
}

fn emit_rife_engine_progress(
    app_handle: &tauri::AppHandle,
    progress_id: Option<&str>,
    stage: &str,
    label: &str,
    loaded: u64,
    total: u64,
) {
    let Some(progress_id) = progress_id else {
        return;
    };
    if progress_id.trim().is_empty() {
        return;
    }
    let progress = if total > 0 {
        (loaded as f64 / total as f64).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let payload = RifeEngineProgress {
        progress_id: progress_id.to_string(),
        stage: stage.to_string(),
        label: label.to_string(),
        loaded,
        total,
        progress,
    };
    let _ = app_handle.emit("rife-engine-progress", payload);
}

fn copy_response_to_file_with_progress(
    response: &mut reqwest::blocking::Response,
    file: &mut File,
    app_handle: &tauri::AppHandle,
    progress_id: Option<&str>,
    stage: &str,
    label: &str,
    fallback_total: u64,
) -> Result<(), String> {
    let total = response.content_length().unwrap_or(fallback_total);
    let mut loaded = 0u64;
    let mut buffer = [0u8; 1024 * 1024];
    let mut last_emit_at = Instant::now() - Duration::from_secs(1);
    emit_rife_engine_progress(app_handle, progress_id, stage, label, loaded, total);
    loop {
        let read = response
            .read(&mut buffer)
            .map_err(|e| format!("读取下载内容失败: {}", e))?;
        if read == 0 {
            break;
        }
        file.write_all(&buffer[..read])
            .map_err(|e| format!("写入下载文件失败: {}", e))?;
        loaded = loaded.saturating_add(read as u64);
        if last_emit_at.elapsed() >= Duration::from_millis(220) || (total > 0 && loaded >= total) {
            last_emit_at = Instant::now();
            emit_rife_engine_progress(app_handle, progress_id, stage, label, loaded, total);
        }
    }
    emit_rife_engine_progress(app_handle, progress_id, stage, label, loaded, total);
    Ok(())
}

fn download_engine_archive_from_sources(
    app_handle: &tauri::AppHandle,
    archive_path: &Path,
    progress_id: Option<&str>,
    display_name: &str,
    connecting_stage: &str,
    downloading_stage: &str,
    sources: &[(&str, &str)],
    expected_size: u64,
    expected_sha256: &str,
) -> Result<(), String> {
    if let Some(parent) = archive_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("创建 {display_name} 下载目录失败：{e}"))?;
    }

    let temporary_path = archive_path.with_extension("download.tmp");
    let has_configured_proxy = effective_proxy(Some(app_handle), None).is_some();
    let mut failures = Vec::new();

    for (source_name, source_url) in sources {
        let prefer_direct = should_prefer_direct_generated_image_download(source_url);
        let network_modes: &[&str] = if has_configured_proxy && prefer_direct {
            &["直连", "代理"]
        } else if has_configured_proxy {
            &["代理", "直连"]
        } else {
            &["直连"]
        };

        for network_mode in network_modes {
            let _ = fs::remove_file(&temporary_path);
            emit_rife_engine_progress(
                app_handle,
                progress_id,
                connecting_stage,
                &format!("连接 {display_name} 下载源（{source_name} / {network_mode}）"),
                0,
                expected_size,
            );

            let client = match *network_mode {
                "代理" => build_engine_download_http_client(app_handle, 1800),
                _ => build_direct_http_client(1800),
            };
            let client = match client {
                Ok(value) => value,
                Err(error) => {
                    failures.push(format!("{source_name} / {network_mode}: {error}"));
                    continue;
                }
            };

            let attempt = (|| -> Result<(), String> {
                let mut response = client
                    .get(*source_url)
                    .send()
                    .map_err(|e| format!("连接失败：{e}"))?;
                if !response.status().is_success() {
                    return Err(format!("HTTP {}", response.status()));
                }
                if let Some(content_length) = response.content_length() {
                    if content_length != expected_size {
                        return Err(format!(
                            "文件大小不符：期望 {expected_size}，服务器返回 {content_length}"
                        ));
                    }
                }

                {
                    let mut file = File::create(&temporary_path)
                        .map_err(|e| format!("创建临时下载文件失败：{e}"))?;
                    copy_response_to_file_with_progress(
                        &mut response,
                        &mut file,
                        app_handle,
                        progress_id,
                        downloading_stage,
                        &format!("下载 {display_name}（{source_name}）"),
                        expected_size,
                    )?;
                    file.flush()
                        .map_err(|e| format!("写入临时下载文件失败：{e}"))?;
                }

                let actual_size = fs::metadata(&temporary_path)
                    .map_err(|e| format!("读取临时下载文件失败：{e}"))?
                    .len();
                if actual_size != expected_size {
                    return Err(format!(
                        "下载不完整：期望 {expected_size} 字节，实际 {actual_size} 字节"
                    ));
                }
                let actual_sha256 = sha256_file_upper(&temporary_path)?;
                if actual_sha256 != expected_sha256 {
                    return Err(format!(
                        "SHA-256 校验失败：期望 {expected_sha256}，实际 {actual_sha256}"
                    ));
                }

                fs::rename(&temporary_path, archive_path)
                    .or_else(|_| {
                        fs::copy(&temporary_path, archive_path).map(|_| ())?;
                        let _ = fs::remove_file(&temporary_path);
                        Ok::<(), std::io::Error>(())
                    })
                    .map_err(|e| format!("保存 {display_name} 失败：{e}"))
            })();

            match attempt {
                Ok(()) => return Ok(()),
                Err(error) => {
                    let _ = fs::remove_file(&temporary_path);
                    failures.push(format!("{source_name} / {network_mode}: {error}"));
                }
            }
        }
    }

    Err(format!(
        "{display_name} 下载失败，已尝试 OSS 主源和备用源：\n{}",
        failures
            .iter()
            .map(|failure| format!("- {failure}"))
            .collect::<Vec<_>>()
            .join("\n")
    ))
}

fn download_rife_engine_archive(
    app_handle: &tauri::AppHandle,
    archive_path: &Path,
    progress_id: Option<&str>,
) -> Result<(), String> {
    download_engine_archive_from_sources(
        app_handle,
        archive_path,
        progress_id,
        "RIFE 引擎",
        "connecting-rife",
        "downloading-rife",
        &[
            ("OSS 主源", RIFE_ENGINE_ASSET_URL),
            ("GitHub 备用源", RIFE_ENGINE_ASSET_FALLBACK_URL),
        ],
        RIFE_ENGINE_ZIP_SIZE,
        RIFE_ENGINE_SHA256,
    )
}

fn download_realesrgan_engine_archive(
    app_handle: &tauri::AppHandle,
    archive_path: &Path,
    progress_id: Option<&str>,
) -> Result<(), String> {
    download_engine_archive_from_sources(
        app_handle,
        archive_path,
        progress_id,
        "Real-ESRGAN 引擎",
        "connecting-realesrgan",
        "downloading-realesrgan",
        &[
            ("OSS 主源", REALESRGAN_ENGINE_ASSET_URL),
            ("GitHub 备用源", REALESRGAN_ENGINE_ASSET_FALLBACK_URL),
        ],
        REALESRGAN_ENGINE_ZIP_SIZE,
        REALESRGAN_ENGINE_SHA256,
    )
}

fn extract_rife_engine_archive(archive_path: &Path, base_dir: &Path) -> Result<(), String> {
    fs::create_dir_all(base_dir).map_err(|e| format!("创建引擎目录失败: {}", e))?;
    let file = File::open(archive_path).map_err(|e| format!("打开 RIFE 压缩包失败: {}", e))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("读取 RIFE 压缩包失败: {}", e))?;

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|e| format!("读取 RIFE 压缩包条目失败: {}", e))?;
        let Some(enclosed_name) = entry.enclosed_name().map(|value| value.to_path_buf()) else {
            continue;
        };
        let out_path = base_dir.join(enclosed_name);
        if !out_path.starts_with(base_dir) {
            continue;
        }
        if entry.is_dir() {
            fs::create_dir_all(&out_path).map_err(|e| format!("创建引擎目录失败: {}", e))?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("创建引擎目录失败: {}", e))?;
            }
            let mut out_file =
                File::create(&out_path).map_err(|e| format!("写入引擎文件失败: {}", e))?;
            std::io::copy(&mut entry, &mut out_file)
                .map_err(|e| format!("解压引擎文件失败: {}", e))?;
        }
    }

    Ok(())
}

fn download_ffmpeg_tools_archive(
    app_handle: &tauri::AppHandle,
    archive_path: &Path,
    progress_id: Option<&str>,
) -> Result<(), String> {
    download_engine_archive_from_sources(
        app_handle,
        archive_path,
        progress_id,
        "FFmpeg / FFprobe 工具",
        "connecting-ffmpeg-tools",
        "downloading-ffmpeg-tools",
        &[
            ("OSS 主源", FFMPEG_TOOLS_ASSET_URL),
            ("GitHub 备用源", FFMPEG_TOOLS_ASSET_FALLBACK_URL),
        ],
        FFMPEG_TOOLS_ZIP_SIZE,
        FFMPEG_TOOLS_SHA256,
    )
}

fn ensure_ffmpeg_tools_installed(
    app_handle: &tauri::AppHandle,
    progress_id: Option<&str>,
) -> Result<(), String> {
    let ffmpeg_path = bundled_media_tool_path("ffmpeg")?;
    let ffprobe_path = bundled_media_tool_path("ffprobe")?;
    if ffmpeg_path.is_file() && ffprobe_path.is_file() {
        return Ok(());
    }
    let _install_guard = FFMPEG_TOOLS_INSTALL_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "FFmpeg tools install lock is poisoned".to_string())?;
    if ffmpeg_path.is_file() && ffprobe_path.is_file() {
        return Ok(());
    }

    let base_dir = media_tools_base_dir()?;
    let tools_dir = ffmpeg_tools_dir()?;
    let download_dir = base_dir.join("_downloads");
    fs::create_dir_all(&download_dir)
        .map_err(|e| format!("创建 FFmpeg 工具下载目录失败: {}", e))?;
    let archive_path = download_dir.join("ffmpeg-tools-n8.1-win64-gpl.zip");

    let archive_ready = archive_path.is_file()
        && sha256_file_upper(&archive_path)
            .map(|value| value == FFMPEG_TOOLS_SHA256)
            .unwrap_or(false);
    if !archive_ready {
        let _ = fs::remove_file(&archive_path);
        download_ffmpeg_tools_archive(app_handle, &archive_path, progress_id)?;
    }

    let hash = sha256_file_upper(&archive_path)?;
    if hash != FFMPEG_TOOLS_SHA256 {
        let _ = fs::remove_file(&archive_path);
        return Err(format!(
            "FFmpeg 工具校验失败: 期望 {}，实际 {}",
            FFMPEG_TOOLS_SHA256, hash
        ));
    }

    if tools_dir.exists() && (!ffmpeg_path.is_file() || !ffprobe_path.is_file()) {
        fs::remove_dir_all(&tools_dir).map_err(|e| format!("清理旧 FFmpeg 工具失败: {}", e))?;
    }
    emit_rife_engine_progress(
        app_handle,
        progress_id,
        "extracting-ffmpeg-tools",
        "解压 FFmpeg / FFprobe",
        0,
        0,
    );
    extract_rife_engine_archive(&archive_path, &base_dir)?;
    let _ = fs::remove_file(&archive_path);

    if !ffmpeg_path.is_file() || !ffprobe_path.is_file() {
        return Err("FFmpeg / FFprobe 工具解压完成，但没有找到可执行文件".to_string());
    }
    emit_rife_engine_progress(
        app_handle,
        progress_id,
        "ffmpeg-tools-ready",
        "FFmpeg / FFprobe 已就绪",
        1,
        1,
    );
    Ok(())
}

fn ensure_media_tools_available(
    app_handle: &tauri::AppHandle,
    progress_id: Option<&str>,
) -> Result<(PathBuf, PathBuf), String> {
    if let Some(paths) = resolve_system_media_tools() {
        return Ok(paths);
    }

    ensure_ffmpeg_tools_installed(app_handle, progress_id)?;
    let ffmpeg_path = bundled_media_tool_path("ffmpeg")?;
    let ffprobe_path = bundled_media_tool_path("ffprobe")?;
    if ffmpeg_path.is_file() && ffprobe_path.is_file() {
        return Ok((ffmpeg_path, ffprobe_path));
    }
    Err("没有找到 FFmpeg / FFprobe，也无法安装内置工具包".to_string())
}

fn ensure_rife_engine_installed(
    app_handle: &tauri::AppHandle,
    progress_id: Option<&str>,
) -> Result<RifeEngineStatus, String> {
    let status = build_rife_engine_status()?;
    if status.installed {
        return Ok(status);
    }

    let base_dir = rife_engine_base_dir()?;
    let engine_dir = rife_engine_dir()?;
    let exe_path = rife_engine_exe_path()?;
    let download_dir = base_dir.join("_downloads");
    fs::create_dir_all(&download_dir).map_err(|e| format!("创建 RIFE 下载目录失败: {}", e))?;
    let archive_path = download_dir.join("rife-ncnn-vulkan-20221029-windows-lite.zip");

    let archive_ready = archive_path.is_file()
        && sha256_file_upper(&archive_path)
            .map(|value| value == RIFE_ENGINE_SHA256)
            .unwrap_or(false);
    if !archive_ready {
        let _ = fs::remove_file(&archive_path);
        download_rife_engine_archive(app_handle, &archive_path, progress_id)?;
    }

    let hash = sha256_file_upper(&archive_path)?;
    if hash != RIFE_ENGINE_SHA256 {
        let _ = fs::remove_file(&archive_path);
        return Err(format!(
            "RIFE 引擎校验失败: 期望 {}，实际 {}",
            RIFE_ENGINE_SHA256, hash
        ));
    }

    if engine_dir.exists() && !exe_path.is_file() {
        fs::remove_dir_all(&engine_dir).map_err(|e| format!("清理旧 RIFE 引擎失败: {}", e))?;
    }
    emit_rife_engine_progress(
        app_handle,
        progress_id,
        "extracting-rife",
        "解压 RIFE 引擎",
        0,
        0,
    );
    extract_rife_engine_archive(&archive_path, &base_dir)?;
    let _ = fs::remove_file(&archive_path);

    let status = build_rife_engine_status()?;
    if !status.installed {
        return Err("RIFE 引擎解压完成，但没有找到 rife-ncnn-vulkan.exe".to_string());
    }
    emit_rife_engine_progress(
        app_handle,
        progress_id,
        "rife-ready",
        "RIFE 引擎已就绪",
        1,
        1,
    );
    Ok(status)
}

#[tauri::command]
async fn get_rife_engine_status() -> Result<RifeEngineStatus, String> {
    build_rife_engine_status()
}

#[tauri::command]
async fn install_rife_engine(app_handle: tauri::AppHandle) -> Result<RifeEngineStatus, String> {
    ensure_rife_engine_installed(&app_handle, None)
}

fn ensure_realesrgan_engine_installed(
    app_handle: &tauri::AppHandle,
    progress_id: Option<&str>,
) -> Result<RealEsrganEngineStatus, String> {
    let status = build_realesrgan_engine_status()?;
    if status.installed {
        return Ok(status);
    }

    let base_dir = realesrgan_engine_base_dir()?;
    let engine_dir = realesrgan_engine_dir()?;
    let exe_path = realesrgan_engine_exe_path()?;
    let download_dir = base_dir.join("_downloads");
    fs::create_dir_all(&download_dir)
        .map_err(|e| format!("创建 Real-ESRGAN 下载目录失败: {}", e))?;
    let archive_path = download_dir.join("realesrgan-ncnn-vulkan-20220424-windows.zip");

    let archive_ready = archive_path.is_file()
        && sha256_file_upper(&archive_path)
            .map(|value| value == REALESRGAN_ENGINE_SHA256)
            .unwrap_or(false);
    if !archive_ready {
        let _ = fs::remove_file(&archive_path);
        download_realesrgan_engine_archive(app_handle, &archive_path, progress_id)?;
    }

    let hash = sha256_file_upper(&archive_path)?;
    if hash != REALESRGAN_ENGINE_SHA256 {
        let _ = fs::remove_file(&archive_path);
        return Err(format!(
            "Real-ESRGAN 引擎校验失败: 期望 {}，实际 {}",
            REALESRGAN_ENGINE_SHA256, hash
        ));
    }

    if engine_dir.exists() && !exe_path.is_file() {
        fs::remove_dir_all(&engine_dir)
            .map_err(|e| format!("清理旧 Real-ESRGAN 引擎失败: {}", e))?;
    }
    fs::create_dir_all(&engine_dir).map_err(|e| format!("创建 Real-ESRGAN 引擎目录失败: {}", e))?;
    emit_rife_engine_progress(
        app_handle,
        progress_id,
        "extracting-realesrgan",
        "解压 Real-ESRGAN 引擎",
        0,
        0,
    );
    extract_rife_engine_archive(&archive_path, &engine_dir)?;
    let _ = fs::remove_file(&archive_path);

    let status = build_realesrgan_engine_status()?;
    if !status.installed {
        return Err("Real-ESRGAN 引擎解压完成，但没有找到 realesrgan-ncnn-vulkan.exe".to_string());
    }
    emit_rife_engine_progress(
        app_handle,
        progress_id,
        "realesrgan-ready",
        "Real-ESRGAN 引擎已就绪",
        1,
        1,
    );
    Ok(status)
}

#[tauri::command]
async fn get_realesrgan_engine_status() -> Result<RealEsrganEngineStatus, String> {
    build_realesrgan_engine_status()
}

#[tauri::command]
async fn install_realesrgan_engine(
    app_handle: tauri::AppHandle,
) -> Result<RealEsrganEngineStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        ensure_realesrgan_engine_installed(&app_handle, None)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn cancel_realesrgan_enhancement_estimate(progress_id: String) -> Result<(), String> {
    cancel_realesrgan_estimate_task(&progress_id)
}

fn run_hidden_command(command: &mut SysCommand, label: &str) -> Result<String, String> {
    hide_console_window(command);
    let output = command
        .output()
        .map_err(|e| format!("{} 调用失败: {}", label, e))?;
    command_output_to_string(label, output)
}

fn run_hidden_command_with_timeout(
    command: &mut SysCommand,
    label: &str,
    timeout: Duration,
) -> Result<String, String> {
    hide_console_window(command);
    command.stdin(Stdio::null());
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|e| format!("{} 调用失败: {}", label, e))?;
    let started_at = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                let output = child
                    .wait_with_output()
                    .map_err(|e| format!("{} 调用失败: {}", label, e))?;
                return command_output_to_string(label, output);
            }
            Ok(None) => {
                if started_at.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!("{} 超时", label));
                }
            }
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("{} 执行失败: {}", label, e));
            }
        }
        thread::sleep(Duration::from_millis(80));
    }
}

fn run_hidden_command_cancellable(
    command: &mut SysCommand,
    label: &str,
    task_state: Option<&RealEsrganEstimateTaskHandle>,
) -> Result<String, String> {
    if task_state.is_none() {
        return run_hidden_command(command, label);
    }

    let task_state = task_state.expect("task_state checked above");
    hide_console_window(command);
    command.stdin(Stdio::null());
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());

    let child = command
        .spawn()
        .map_err(|e| format!("{} 调用失败: {}", label, e))?;
    {
        let mut state = task_state
            .lock()
            .map_err(|_| format!("{} 任务状态锁定失败", label))?;
        if state.cancel_requested {
            let mut child = child;
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("{} 已取消", label));
        }
        state.child = Some(child);
    }

    loop {
        let cancelled = {
            task_state
                .lock()
                .map_err(|_| format!("{} 任务状态锁定失败", label))?
                .cancel_requested
        };
        if cancelled {
            let child_to_kill = {
                let mut state = task_state
                    .lock()
                    .map_err(|_| format!("{} 任务状态锁定失败", label))?;
                state.child.take()
            };
            if let Some(mut child) = child_to_kill {
                let _ = child.kill();
                let _ = child.wait();
            }
            return Err(format!("{} 已取消", label));
        }

        let finished_child = {
            let mut state = task_state
                .lock()
                .map_err(|_| format!("{} 任务状态锁定失败", label))?;
            if let Some(child) = state.child.as_mut() {
                match child.try_wait() {
                    Ok(Some(_)) => state.child.take(),
                    Ok(None) => None,
                    Err(e) => {
                        let child_to_kill = state.child.take();
                        if let Some(mut child) = child_to_kill {
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                        return Err(format!("{} 执行失败: {}", label, e));
                    }
                }
            } else {
                None
            }
        };

        if let Some(child) = finished_child {
            let output = child
                .wait_with_output()
                .map_err(|e| format!("{} 调用失败: {}", label, e))?;
            return command_output_to_string(label, output);
        }

        thread::sleep(Duration::from_millis(80));
    }
}

fn parse_fps_value(value: &str) -> Option<f64> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed == "0/0" {
        return None;
    }
    if let Some((num, den)) = trimmed.split_once('/') {
        let n = num.trim().parse::<f64>().ok()?;
        let d = den.trim().parse::<f64>().ok()?;
        if n > 0.0 && d > 0.0 {
            return Some(n / d);
        }
        return None;
    }
    let parsed = trimmed.parse::<f64>().ok()?;
    (parsed > 0.0).then_some(parsed)
}

fn probe_video_info(ffprobe_path: &Path, source: &Path) -> Result<VideoProbeInfo, String> {
    let mut cmd = SysCommand::new(ffprobe_path);
    cmd.args([
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,avg_frame_rate,duration,nb_frames:format=duration",
        "-of",
        "json",
    ])
    .arg(source);
    let text = run_hidden_command(&mut cmd, "FFprobe 视频信息")?;
    let value: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("解析 FFprobe 视频信息失败: {}", e))?;
    let stream = value
        .get("streams")
        .and_then(|value| value.as_array())
        .and_then(|items| items.get(0));
    let format = value.get("format");
    let width = stream
        .and_then(|value| value.get("width"))
        .and_then(|value| value.as_u64())
        .map(|value| value as u32);
    let height = stream
        .and_then(|value| value.get("height"))
        .and_then(|value| value.as_u64())
        .map(|value| value as u32);
    let fps = stream
        .and_then(|value| value.get("avg_frame_rate"))
        .and_then(|value| value.as_str())
        .and_then(parse_fps_value);
    let stream_duration = stream
        .and_then(|value| value.get("duration"))
        .and_then(|value| value.as_str())
        .and_then(|value| value.parse::<f64>().ok());
    let format_duration = format
        .and_then(|value| value.get("duration"))
        .and_then(|value| value.as_str())
        .and_then(|value| value.parse::<f64>().ok());
    let duration_sec = stream_duration
        .or(format_duration)
        .filter(|value| value.is_finite() && *value > 0.0);
    let frame_count = stream
        .and_then(|value| value.get("nb_frames"))
        .and_then(|value| {
            value.as_u64().or_else(|| {
                value
                    .as_str()
                    .and_then(|text| text.trim().parse::<u64>().ok())
            })
        })
        .filter(|value| *value > 0)
        .or_else(|| {
            duration_sec.zip(fps).and_then(|(duration, frame_rate)| {
                let estimated = (duration * frame_rate).round();
                (estimated.is_finite() && estimated > 0.0).then_some(estimated as u64)
            })
        });

    Ok(VideoProbeInfo {
        duration_sec,
        width,
        height,
        fps,
        frame_count,
    })
}

fn analyze_video_frame_rate(
    ffprobe_path: &Path,
    source: &Path,
) -> Result<VideoFrameRateAnalysis, String> {
    let info = probe_video_info(ffprobe_path, source)?;
    let mut cmd = SysCommand::new(ffprobe_path);
    cmd.args([
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-read_intervals",
        "%+#240",
        "-show_entries",
        "stream=avg_frame_rate,r_frame_rate,duration,nb_frames:format=duration:packet=duration_time",
        "-of",
        "json",
    ])
    .arg(source);
    let text = run_hidden_command(&mut cmd, "FFprobe 帧率检测")?;
    let value: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("解析 FFprobe 帧率检测失败: {}", e))?;
    let stream = value
        .get("streams")
        .and_then(|value| value.as_array())
        .and_then(|items| items.first());
    let avg_fps = stream
        .and_then(|value| value.get("avg_frame_rate"))
        .and_then(|value| value.as_str())
        .and_then(parse_fps_value)
        .or(info.fps);
    let r_fps = stream
        .and_then(|value| value.get("r_frame_rate"))
        .and_then(|value| value.as_str())
        .and_then(parse_fps_value);
    let mut packet_durations = value
        .get("packets")
        .and_then(|value| value.as_array())
        .map(|packets| {
            packets
                .iter()
                .filter_map(|packet| {
                    packet
                        .get("duration_time")
                        .and_then(|value| value.as_str())
                        .and_then(|value| value.parse::<f64>().ok())
                        .filter(|value| value.is_finite() && *value > 0.0)
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    packet_durations.sort_by(|left, right| left.total_cmp(right));
    let packet_sample_count = packet_durations.len();
    let unstable_packet_timing = if packet_sample_count >= 12 {
        let median = packet_durations[packet_sample_count / 2].max(0.000_001);
        let outliers = packet_durations
            .iter()
            .filter(|duration| ((**duration - median).abs() / median) > 0.05)
            .count();
        outliers >= 3 && outliers as f64 / packet_sample_count as f64 > 0.08
    } else {
        false
    };
    let rate_mismatch = avg_fps
        .zip(r_fps)
        .is_some_and(|(avg, nominal)| (avg - nominal).abs() > 0.35_f64.max(avg.abs() * 0.015));
    let is_vfr = rate_mismatch || unstable_packet_timing;
    let recommended_fps = if is_vfr {
        let fps = avg_fps.unwrap_or(24.0);
        if (23.0..=25.0).contains(&fps) {
            Some(24.0)
        } else if (29.0..=31.0).contains(&fps) {
            Some(30.0)
        } else {
            Some(24.0)
        }
    } else {
        None
    };
    let reason = if rate_mismatch && unstable_packet_timing {
        "平均帧率与标称帧率不一致，且相邻帧时间间隔不稳定".to_string()
    } else if rate_mismatch {
        "平均帧率与标称帧率差异明显".to_string()
    } else if unstable_packet_timing {
        "相邻帧时间间隔不稳定，检测到 VFR".to_string()
    } else {
        "帧率与相邻帧时间间隔稳定，可跳过 CFR 转换".to_string()
    };

    Ok(VideoFrameRateAnalysis {
        avg_fps,
        r_fps,
        duration_sec: info.duration_sec,
        frame_count: info.frame_count,
        packet_sample_count,
        unstable_packet_timing,
        is_vfr,
        recommended_fps,
        reason,
    })
}

fn normalize_video_cfr_mode(mode: Option<String>) -> String {
    match mode
        .unwrap_or_else(|| "auto".to_string())
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "24" | "24fps" => "24".to_string(),
        "30" | "30fps" => "30".to_string(),
        "off" | "none" | "skip" => "off".to_string(),
        "auto-ai" | "ai" => "auto-ai".to_string(),
        _ => "auto".to_string(),
    }
}

fn cfr_target_for_analysis(mode: &str, analysis: &VideoFrameRateAnalysis) -> Option<f64> {
    match mode {
        "24" => Some(24.0),
        "30" => Some(30.0),
        "off" => None,
        "auto-ai" => {
            if analysis.is_vfr {
                analysis.recommended_fps.or(Some(24.0))
            } else {
                let fps = analysis.avg_fps.unwrap_or(24.0);
                let is_standard = [24.0, 25.0, 30.0, 50.0, 60.0]
                    .iter()
                    .any(|standard| (fps - standard).abs() <= 0.08);
                (!is_standard).then_some(24.0)
            }
        }
        _ => analysis.recommended_fps,
    }
}

fn normalize_video_cfr_impl(
    app_handle: &tauri::AppHandle,
    ffmpeg_path: &Path,
    ffprobe_path: &Path,
    source: &Path,
    mode: &str,
    output_path: &Path,
    progress_id: Option<&str>,
) -> Result<VideoCfrNormalizationResult, String> {
    let analysis = analyze_video_frame_rate(ffprobe_path, source)?;
    let target_fps = cfr_target_for_analysis(mode, &analysis);
    let source_fps = analysis.avg_fps;
    let fps_tolerance = if mode.starts_with("auto") {
        0.05
    } else {
        0.005
    };
    let should_convert = target_fps.is_some_and(|target| {
        analysis.is_vfr
            || source_fps
                .map(|fps| (fps - target).abs() > fps_tolerance)
                .unwrap_or(true)
    });
    if !should_convert {
        let reason = if mode == "off" {
            "已选择不处理帧率".to_string()
        } else if target_fps.is_some() {
            "视频已经是目标恒定帧率，无需转换".to_string()
        } else {
            analysis.reason.clone()
        };
        return Ok(VideoCfrNormalizationResult {
            output_path: display_local_path(source),
            converted: false,
            is_vfr: analysis.is_vfr,
            source_fps,
            normalized_fps: source_fps,
            reason,
        });
    }

    let target_fps = target_fps.unwrap_or(24.0);
    if let Some(parent) = output_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建 CFR 输出目录失败: {}", e))?;
    }
    emit_rife_engine_progress(
        app_handle,
        progress_id,
        "normalizing-cfr-video",
        &format!("正在标准化为 {:.0}fps CFR", target_fps),
        0,
        0,
    );
    let mut command = SysCommand::new(ffmpeg_path);
    command
        .args(["-y", "-hide_banner", "-loglevel", "error", "-i"])
        .arg(source)
        .args(["-map", "0:v:0", "-map", "0:a?"])
        .arg("-vf")
        .arg(format!("fps=fps={:.3}", target_fps))
        .args([
            "-fps_mode",
            "cfr",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "16",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            "-shortest",
        ])
        .arg(output_path);
    run_hidden_command(&mut command, "FFmpeg 自动 CFR 标准化")?;
    if !output_path.is_file() {
        return Err("CFR 标准化完成，但没有生成输出视频".to_string());
    }
    Ok(VideoCfrNormalizationResult {
        output_path: display_local_path(output_path),
        converted: true,
        is_vfr: analysis.is_vfr,
        source_fps,
        normalized_fps: Some(target_fps),
        reason: if mode == "auto-ai" && !analysis.is_vfr {
            "AI 生成视频帧率非标准，优先标准化为 24fps CFR".to_string()
        } else {
            analysis.reason
        },
    })
}

fn video_frame_count(info: &VideoProbeInfo) -> u64 {
    info.frame_count
        .or_else(|| {
            info.duration_sec.zip(info.fps).and_then(|(duration, fps)| {
                let estimated = (duration * fps).round();
                (estimated.is_finite() && estimated > 0.0).then_some(estimated as u64)
            })
        })
        .unwrap_or(1)
        .max(1)
}

fn estimate_rife_seconds(
    duration_sec: f64,
    width: u32,
    height: u32,
    fps: f64,
    output_fps: f64,
    factor: u32,
    mode: &str,
    quality: &str,
    output_format: &str,
) -> (f64, f64) {
    let pixels = (width.max(1) as f64) * (height.max(1) as f64);
    let pixel_scale = (pixels / (1920.0 * 1080.0)).clamp(0.35, 6.0);
    let generated_ratio = (output_fps / fps.max(1.0)).clamp(1.0, factor as f64);
    let frame_scale = (generated_ratio / 2.0).clamp(0.5, 2.5);
    let duration_scale = (duration_sec.max(1.0) / 15.0).clamp(0.08, 240.0);
    let mode_scale = match mode.trim() {
        "hd" | "hd-slow" => 1.35,
        "uhd" => 1.9,
        _ => 1.0,
    };
    let quality_scale = match quality.trim() {
        "fast" => 0.68,
        "high" => 1.55,
        _ => 1.0,
    };
    let format_scale = match output_format.trim().to_ascii_lowercase().as_str() {
        "webm" => 1.18,
        _ => 1.0,
    };
    let factor_scale = if factor >= 4 { 1.18 } else { 1.0 };
    let seconds = 60.0
        * duration_scale
        * pixel_scale
        * frame_scale
        * mode_scale
        * quality_scale
        * format_scale
        * factor_scale;
    let uncertainty = if pixels >= 3840.0 * 2160.0 {
        0.55
    } else {
        0.38
    };
    let min = (seconds * (1.0 - uncertainty)).max(10.0);
    let max = (seconds * (1.0 + uncertainty)).max(min + 8.0);
    (min, max)
}

fn count_frame_images(dir: &Path) -> Result<usize, String> {
    let entries = fs::read_dir(dir).map_err(|e| format!("读取视频帧目录失败: {}", e))?;
    Ok(entries
        .filter_map(Result::ok)
        .filter(|entry| {
            let path = entry.path();
            path.is_file()
                && path
                    .extension()
                    .and_then(|value| value.to_str())
                    .map(|ext| {
                        matches!(
                            ext.to_ascii_lowercase().as_str(),
                            "png" | "jpg" | "jpeg" | "webp"
                        )
                    })
                    .unwrap_or(false)
        })
        .count())
}

fn run_hidden_command_with_frame_progress(
    command: &mut SysCommand,
    command_label: &str,
    app_handle: &tauri::AppHandle,
    progress_id: Option<&str>,
    stage: &str,
    progress_label: &str,
    output_dir: &Path,
    total_frames: u64,
) -> Result<String, String> {
    if progress_id.is_none() || total_frames == 0 {
        return run_hidden_command(command, command_label);
    }

    emit_rife_engine_progress(
        app_handle,
        progress_id,
        stage,
        progress_label,
        0,
        total_frames,
    );
    let stop = Arc::new(AtomicBool::new(false));
    let monitor_stop = Arc::clone(&stop);
    let monitor_app = app_handle.clone();
    let monitor_progress_id = progress_id.map(str::to_string);
    let monitor_stage = stage.to_string();
    let monitor_label = progress_label.to_string();
    let monitor_dir = output_dir.to_path_buf();
    let monitor = thread::spawn(move || {
        let mut last_completed = u64::MAX;
        while !monitor_stop.load(Ordering::Relaxed) {
            let completed = count_frame_images(&monitor_dir)
                .unwrap_or(0)
                .min(total_frames as usize) as u64;
            if completed != last_completed {
                last_completed = completed;
                emit_rife_engine_progress(
                    &monitor_app,
                    monitor_progress_id.as_deref(),
                    &monitor_stage,
                    &monitor_label,
                    completed,
                    total_frames,
                );
            }
            thread::sleep(Duration::from_millis(240));
        }
    });

    let result = run_hidden_command(command, command_label);
    stop.store(true, Ordering::Relaxed);
    let _ = monitor.join();
    let completed = count_frame_images(output_dir)
        .unwrap_or(0)
        .min(total_frames as usize) as u64;
    emit_rife_engine_progress(
        app_handle,
        progress_id,
        stage,
        progress_label,
        completed,
        total_frames,
    );
    result
}

fn extract_video_benchmark_frames(
    ffmpeg_path: &Path,
    source: &Path,
    output_dir: &Path,
    info: &VideoProbeInfo,
    requested_samples: usize,
    task_state: Option<&RealEsrganEstimateTaskHandle>,
) -> Result<(usize, f64), String> {
    fs::create_dir_all(output_dir).map_err(|e| format!("创建测速帧目录失败: {}", e))?;
    let fps = info.fps.unwrap_or(30.0).max(1.0);
    let sample_span = requested_samples as f64 / fps;
    let start_at = info
        .duration_sec
        .map(|duration| (duration * 0.45).min((duration - sample_span - 0.1).max(0.0)))
        .unwrap_or(0.0);
    let started_at = Instant::now();
    let mut command = SysCommand::new(ffmpeg_path);
    command
        .args(["-y", "-hide_banner", "-loglevel", "error", "-ss"])
        .arg(format!("{:.3}", start_at))
        .arg("-i")
        .arg(source)
        .args(["-an", "-frames:v"])
        .arg(requested_samples.to_string())
        .arg(output_dir.join("frame_%08d.png"));
    run_hidden_command_cancellable(&mut command, "FFmpeg 抽取测速帧", task_state)?;
    let sample_frames = count_frame_images(output_dir)?;
    if sample_frames < 2 {
        return Err("视频可用于测速的帧数不足".to_string());
    }
    Ok((sample_frames, started_at.elapsed().as_secs_f64()))
}

fn measured_estimate_range(seconds: f64) -> (f64, f64) {
    let safe = seconds.max(1.0);
    ((safe * 0.86).max(1.0), (safe * 1.18).max(safe + 1.0))
}

fn append_media_engine_debug_log(base_dir: &Path, component: &str, fields: &[(&str, String)]) {
    let log_dir = base_dir.join("logs");
    if fs::create_dir_all(&log_dir).is_err() {
        return;
    }
    let log_path = log_dir.join("performance-debug.log");
    let Ok(mut file) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
    else {
        return;
    };
    let mut parts = vec![
        format!("timestamp_ms={}", now_millis_u64()),
        format!("component={}", component),
    ];
    parts.extend(
        fields
            .iter()
            .map(|(key, value)| format!("{}={}", key, value)),
    );
    let _ = writeln!(file, "{}", parts.join("\t"));
}

fn normalize_realesrgan_scale(scale: Option<u32>) -> u32 {
    match scale.unwrap_or(2) {
        4 => 4,
        _ => 2,
    }
}

fn normalize_realesrgan_mode(mode: Option<String>) -> String {
    match mode
        .unwrap_or_else(|| "general".to_string())
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "anime" | "illustration" | "anime-video" => "anime".to_string(),
        _ => "general".to_string(),
    }
}

fn normalize_realesrgan_resize_mode(resize_mode: Option<String>) -> String {
    match resize_mode
        .unwrap_or_else(|| "upscale".to_string())
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "keep" | "original" | "same-size" => "keep".to_string(),
        _ => "upscale".to_string(),
    }
}

fn normalize_realesrgan_image_format(output_format: Option<String>) -> String {
    match output_format
        .unwrap_or_else(|| "png".to_string())
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => "jpg".to_string(),
        "webp" => "webp".to_string(),
        _ => "png".to_string(),
    }
}

fn normalize_realesrgan_video_format(output_format: Option<String>) -> String {
    match output_format
        .unwrap_or_else(|| "mp4".to_string())
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "mov" => "mov".to_string(),
        "webm" => "webm".to_string(),
        _ => "mp4".to_string(),
    }
}

fn realesrgan_model_name(mode: &str) -> &'static str {
    match mode {
        "anime" => "realesr-animevideov3",
        _ => "realesrgan-x4plus",
    }
}

fn estimate_realesrgan_seconds(
    duration_sec: f64,
    width: u32,
    height: u32,
    scale: u32,
    resize_mode: &str,
    media_type: &str,
) -> (f64, f64) {
    let pixels = (width.max(1) as f64) * (height.max(1) as f64);
    let pixel_scale = (pixels / (1920.0 * 1080.0)).clamp(0.18, 8.0);
    let duration_scale = if media_type == "video" {
        (duration_sec.max(1.0) / 15.0).clamp(0.08, 240.0)
    } else {
        0.10
    };
    // The ncnn executable produces broken tile placement with `-s 2` on some
    // inputs. Both requested sizes therefore run the models at their native
    // 4x scale; 2x output is downsampled with Lanczos afterwards.
    let scale_cost = if scale >= REALESRGAN_NATIVE_SCALE {
        2.35
    } else {
        2.45
    };
    let resize_cost = if resize_mode == "keep" { 1.12 } else { 1.0 };
    let base = if media_type == "video" { 90.0 } else { 18.0 };
    let seconds = base * duration_scale * pixel_scale * scale_cost * resize_cost;
    let uncertainty = if pixels >= 3840.0 * 2160.0 {
        0.55
    } else {
        0.38
    };
    let min = (seconds * (1.0 - uncertainty)).max(if media_type == "video" { 12.0 } else { 3.0 });
    let max =
        (seconds * (1.0 + uncertainty)).max(min + if media_type == "video" { 8.0 } else { 2.0 });
    (min, max)
}

fn run_realesrgan_on_path(
    exe_path: &Path,
    engine_dir: &Path,
    input: &Path,
    output: &Path,
    mode: &str,
    _scale: u32,
    output_format: &str,
    task_state: Option<&RealEsrganEstimateTaskHandle>,
) -> Result<(), String> {
    let model_name = realesrgan_model_name(mode);
    let mut cmd = SysCommand::new(exe_path);
    cmd.current_dir(engine_dir)
        .arg("-i")
        .arg(input)
        .arg("-o")
        .arg(output)
        .arg("-n")
        .arg(model_name)
        .arg("-s")
        .arg(REALESRGAN_NATIVE_SCALE.to_string())
        .arg("-t")
        .arg(REALESRGAN_TILE_SIZE.to_string())
        .arg("-f")
        .arg(output_format);
    run_hidden_command_cancellable(&mut cmd, "Real-ESRGAN 清晰度增强", task_state)?;
    Ok(())
}

fn run_realesrgan_image_on_path(
    exe_path: &Path,
    engine_dir: &Path,
    input: &Path,
    output: &Path,
    mode: &str,
    output_format: &str,
) -> Result<(), String> {
    let model_name = realesrgan_model_name(mode);
    let mut cmd = SysCommand::new(exe_path);
    cmd.current_dir(engine_dir)
        .arg("-i")
        .arg(input)
        .arg("-o")
        .arg(output)
        .arg("-n")
        .arg(model_name)
        .arg("-s")
        .arg(REALESRGAN_NATIVE_SCALE.to_string())
        .arg("-t")
        .arg(REALESRGAN_TILE_SIZE.to_string())
        .arg("-f")
        .arg(output_format);
    run_hidden_command_with_timeout(&mut cmd, "Real-ESRGAN 图片增强", Duration::from_secs(90))?;
    Ok(())
}

fn checked_image_scale_dimension(value: u32, scale: u32) -> Result<u32, String> {
    value
        .checked_mul(scale)
        .filter(|next| *next > 0)
        .ok_or_else(|| "enhanced image size is too large".to_string())
}

fn realesrgan_fit_dimensions_to_limit(
    width: u32,
    height: u32,
    max_edge: u32,
    max_pixels: u64,
) -> (u32, u32, bool) {
    let width_f = f64::from(width.max(1));
    let height_f = f64::from(height.max(1));
    let edge_ratio = f64::from(max_edge) / width_f.max(height_f);
    let pixel_ratio = (max_pixels as f64 / (width_f * height_f)).sqrt();
    let ratio = edge_ratio.min(pixel_ratio).min(1.0);
    if ratio >= 0.999 {
        return (width.max(1), height.max(1), false);
    }
    (
        (width_f * ratio).floor().max(1.0) as u32,
        (height_f * ratio).floor().max(1.0) as u32,
        true,
    )
}

fn realesrgan_safe_input_dimensions(width: u32, height: u32) -> (u32, u32, bool) {
    let width_f = f64::from(width.max(1));
    let height_f = f64::from(height.max(1));
    let native_scale = f64::from(REALESRGAN_NATIVE_SCALE);
    let edge_ratio =
        f64::from(REALESRGAN_SAFE_INTERMEDIATE_MAX_EDGE) / (width_f.max(height_f) * native_scale);
    let pixel_ratio = (REALESRGAN_SAFE_INTERMEDIATE_MAX_PIXELS as f64
        / (width_f * height_f * native_scale * native_scale))
        .sqrt();
    let ratio = edge_ratio.min(pixel_ratio).min(1.0);
    if ratio >= 0.999 {
        return (width.max(1), height.max(1), false);
    }

    let next_width = (width_f * ratio).floor().max(1.0) as u32;
    let next_height = (height_f * ratio).floor().max(1.0) as u32;
    (next_width, next_height, true)
}

fn save_dynamic_image_with_format(
    image: &screenshots::image::DynamicImage,
    output: &Path,
    output_format: &str,
) -> Result<(), String> {
    let file = File::create(output).map_err(|e| e.to_string())?;
    let mut writer = BufWriter::new(file);
    let format = match output_format {
        "jpg" => screenshots::image::ImageFormat::Jpeg,
        _ => screenshots::image::ImageFormat::Png,
    };
    image
        .write_to(&mut writer, format)
        .map_err(|e| e.to_string())
}

fn run_local_image_resize(
    input: &Path,
    output: &Path,
    target_width: u32,
    target_height: u32,
    output_format: &str,
) -> Result<(), String> {
    let image = screenshots::image::open(input).map_err(|e| e.to_string())?;
    let resized = image.resize_exact(
        target_width.max(1),
        target_height.max(1),
        screenshots::image::imageops::FilterType::Lanczos3,
    );
    save_dynamic_image_with_format(&resized, output, output_format)
}

#[tauri::command]
async fn get_rife_frame_interpolation_estimate(
    app_handle: tauri::AppHandle,
    input_path: String,
    factor: Option<u32>,
    model: Option<String>,
    target_fps: Option<f64>,
    cfr_mode: Option<String>,
    mode: Option<String>,
    quality: Option<String>,
    output_format: Option<String>,
    progress_id: Option<String>,
) -> Result<RifeFrameInterpolationEstimate, String> {
    let mode = mode.unwrap_or_else(|| "normal".to_string());
    let fixed_2x_mode = matches!(mode.trim(), "hd" | "hd-slow" | "uhd");
    let factor = if fixed_2x_mode {
        2
    } else {
        factor.unwrap_or(2).clamp(2, 4)
    };
    let requested_target_fps = target_fps.filter(|value| value.is_finite() && *value > 0.0);
    let cfr_mode = normalize_video_cfr_mode(cfr_mode);
    let quality = quality.unwrap_or_else(|| "standard".to_string());
    let output_format = normalize_realesrgan_video_format(output_format);
    let status = ensure_rife_engine_installed(&app_handle, progress_id.as_deref())?;
    let (ffmpeg_path, ffprobe_path) =
        ensure_media_tools_available(&app_handle, progress_id.as_deref())?;
    let engine_dir = PathBuf::from(&status.engine_dir);
    let exe_path = PathBuf::from(&status.exe_path);
    let source =
        local_path_from_url_like(&input_path).unwrap_or_else(|| PathBuf::from(&input_path));
    if !source.is_file() {
        return Err(format!(
            "找不到要估算的补帧视频: {}",
            display_local_path(&source)
        ));
    }
    let info = probe_video_info(&ffprobe_path, &source)?;
    let analysis = analyze_video_frame_rate(&ffprobe_path, &source)?;
    let cfr_target = cfr_target_for_analysis(&cfr_mode, &analysis);
    let fps_tolerance = if cfr_mode.starts_with("auto") {
        0.05
    } else {
        0.005
    };
    let cfr_converted = cfr_target.is_some_and(|target| {
        analysis.is_vfr
            || analysis
                .avg_fps
                .map(|fps| (fps - target).abs() > fps_tolerance)
                .unwrap_or(true)
    });
    let source_fps = analysis.avg_fps.or(info.fps).unwrap_or(30.0).max(1.0);
    let fps = if cfr_converted {
        cfr_target.unwrap_or(source_fps)
    } else {
        source_fps
    };
    let output_fps = if fixed_2x_mode {
        fps * 2.0
    } else if let Some(target) = requested_target_fps {
        target.max(fps).min(fps * 4.0).min(240.0)
    } else {
        (fps * factor as f64).min(240.0)
    };
    let total_frames = if cfr_converted {
        info.duration_sec
            .map(|duration| (duration * fps).round().max(1.0) as u64)
            .unwrap_or_else(|| video_frame_count(&info))
    } else {
        video_frame_count(&info)
    };
    let interpolation_capacity = (output_fps / fps).ceil().clamp(2.0, 4.0) as u64;
    let output_frame_count = ((total_frames as f64) * (output_fps / fps))
        .round()
        .max(total_frames as f64)
        .min((total_frames.saturating_mul(interpolation_capacity)) as f64)
        as u64;
    let duration_for_estimate = info.duration_sec.unwrap_or(15.0).max(1.0);
    let width_for_estimate = info.width.unwrap_or(1920).max(1);
    let height_for_estimate = info.height.unwrap_or(1080).max(1);
    let mode_model = match mode.trim() {
        "hd" | "hd-slow" => "rife-HD",
        "uhd" => "rife-UHD",
        _ => "rife-v4.6",
    };
    let requested_model = model
        .unwrap_or_else(|| mode_model.to_string())
        .trim()
        .to_string();
    let model_name = if fixed_2x_mode {
        mode_model.to_string()
    } else if requested_model.contains('/') || requested_model.contains('\\') {
        "rife-v4.6".to_string()
    } else {
        requested_model
    };
    let model_path = {
        let candidate = engine_dir.join(&model_name);
        if candidate.is_dir() {
            candidate
        } else {
            engine_dir.join("rife-v4.6")
        }
    };

    let estimate_root = rife_engine_base_dir()?.join("_estimate");
    fs::create_dir_all(&estimate_root).map_err(|e| format!("创建 RIFE 测速目录失败: {}", e))?;
    let work_dir = estimate_root.join(format!("{}_{}", now_millis_u64(), std::process::id()));
    let input_frames_dir = work_dir.join("input_frames");
    let output_frames_dir = work_dir.join("output_frames");
    fs::create_dir_all(&input_frames_dir)
        .map_err(|e| format!("创建 RIFE 测速输入目录失败: {}", e))?;
    fs::create_dir_all(&output_frames_dir)
        .map_err(|e| format!("创建 RIFE 测速输出目录失败: {}", e))?;
    emit_rife_engine_progress(
        &app_handle,
        progress_id.as_deref(),
        "benchmarking-rife-speed",
        "正在用 6 帧实测补帧速度",
        0,
        0,
    );

    let benchmark = (|| -> Result<(usize, f64, f64, f64, f64), String> {
        let (sample_frames, extract_seconds) = extract_video_benchmark_frames(
            &ffmpeg_path,
            &source,
            &input_frames_dir,
            &info,
            6,
            None,
        )?;
        let sample_target_frames = ((sample_frames as f64) * (output_fps / fps))
            .round()
            .max(sample_frames as f64)
            .min((sample_frames.saturating_mul(interpolation_capacity as usize)) as f64)
            as usize;
        let mut rife_cmd = SysCommand::new(&exe_path);
        rife_cmd
            .current_dir(&engine_dir)
            .arg("-i")
            .arg(&input_frames_dir)
            .arg("-o")
            .arg(&output_frames_dir)
            .arg("-m")
            .arg(&model_path);
        if model_name == "rife-v4.6" {
            rife_cmd.arg("-n").arg(sample_target_frames.to_string());
        }
        match quality.trim() {
            "fast" => {
                rife_cmd.arg("-j").arg("2:2:2");
            }
            "high" => {
                rife_cmd.arg("-x");
            }
            _ => {}
        }
        let ai_started_at = Instant::now();
        run_hidden_command(&mut rife_cmd, "RIFE 样本测速")?;
        let ai_seconds = ai_started_at.elapsed().as_secs_f64();
        let sample_output_frames = count_frame_images(&output_frames_dir)?;
        if sample_output_frames == 0 {
            return Err("RIFE 样本测速没有生成输出帧".to_string());
        }

        let sample_video = work_dir.join(format!("sample.{}", output_format));
        let mut encode_cmd = SysCommand::new(&ffmpeg_path);
        encode_cmd
            .args(["-y", "-hide_banner", "-loglevel", "error", "-framerate"])
            .arg(format!("{:.3}", output_fps))
            .arg("-i")
            .arg(output_frames_dir.join("%08d.png"));
        if output_format == "webm" {
            let webm_crf = match quality.trim() {
                "fast" => "36",
                "high" => "24",
                _ => "30",
            };
            encode_cmd.args([
                "-c:v",
                "libvpx-vp9",
                "-b:v",
                "0",
                "-crf",
                webm_crf,
                "-pix_fmt",
                "yuv420p",
            ]);
        } else {
            let crf = match quality.trim() {
                "fast" => "23",
                "high" => "15",
                _ => "18",
            };
            encode_cmd.args(["-c:v", "libx264", "-crf", crf, "-pix_fmt", "yuv420p"]);
        }
        encode_cmd.arg(&sample_video);
        let encode_started_at = Instant::now();
        run_hidden_command(&mut encode_cmd, "FFmpeg RIFE 样本编码")?;
        let encode_seconds = encode_started_at.elapsed().as_secs_f64();
        let ai_per_frame = ai_seconds / sample_frames.max(1) as f64;
        let extract_per_frame = extract_seconds / sample_frames.max(1) as f64;
        let encode_per_frame = encode_seconds / sample_output_frames.max(1) as f64;
        let estimated_total = ai_per_frame * total_frames as f64
            + extract_per_frame * total_frames as f64
            + encode_per_frame * output_frame_count as f64;
        Ok((
            sample_frames,
            extract_seconds,
            ai_seconds,
            encode_seconds,
            estimated_total,
        ))
    })();
    let _ = fs::remove_dir_all(&work_dir);
    emit_rife_engine_progress(
        &app_handle,
        progress_id.as_deref(),
        "rife-benchmark-ready",
        "补帧速度实测完成",
        1,
        1,
    );

    let (sample_frames, estimated_seconds_min, estimated_seconds_max) = match benchmark {
        Ok((sample_frames, extract_seconds, ai_seconds, encode_seconds, estimated_total)) => {
            append_media_engine_debug_log(
                &rife_engine_base_dir()?,
                "rife-estimate",
                &[
                    ("video_frames", total_frames.to_string()),
                    (
                        "resolution",
                        format!("{}x{}", width_for_estimate, height_for_estimate),
                    ),
                    ("fps", format!("{:.3}", fps)),
                    ("model", model_name.clone()),
                    ("factor", factor.to_string()),
                    ("output_fps", format!("{:.3}", output_fps)),
                    ("sample_frames", sample_frames.to_string()),
                    ("sample_extract_seconds", format!("{:.4}", extract_seconds)),
                    ("sample_ai_seconds", format!("{:.4}", ai_seconds)),
                    ("sample_encode_seconds", format!("{:.4}", encode_seconds)),
                    (
                        "avg_ai_frame_seconds",
                        format!("{:.6}", ai_seconds / sample_frames.max(1) as f64),
                    ),
                    ("estimated_total_seconds", format!("{:.3}", estimated_total)),
                ],
            );
            let (min, max) = measured_estimate_range(estimated_total);
            (Some(sample_frames as u32), min, max)
        }
        Err(error) => {
            let (min, max) = estimate_rife_seconds(
                duration_for_estimate,
                width_for_estimate,
                height_for_estimate,
                fps,
                output_fps,
                interpolation_capacity as u32,
                &mode,
                &quality,
                &output_format,
            );
            append_media_engine_debug_log(
                &rife_engine_base_dir()?,
                "rife-estimate-fallback",
                &[
                    ("video_frames", total_frames.to_string()),
                    ("model", model_name.clone()),
                    ("error", error.replace(['\r', '\n', '\t'], " ")),
                    (
                        "estimated_total_seconds",
                        format!("{:.3}", (min + max) / 2.0),
                    ),
                ],
            );
            (None, min, max)
        }
    };

    Ok(RifeFrameInterpolationEstimate {
        duration_sec: info.duration_sec,
        width: info.width,
        height: info.height,
        fps: Some(fps),
        frame_count: Some(total_frames),
        output_fps: Some(output_fps),
        output_frame_count: Some(output_frame_count),
        sample_frames,
        estimated_seconds_min: Some(estimated_seconds_min),
        estimated_seconds_max: Some(estimated_seconds_max),
        source_fps: Some(source_fps),
        cfr_converted,
        cfr_reason: analysis.reason,
    })
}

#[tauri::command]
async fn run_rife_frame_interpolation(
    app_handle: tauri::AppHandle,
    input_path: String,
    factor: Option<u32>,
    model: Option<String>,
    target_fps: Option<f64>,
    cfr_mode: Option<String>,
    mode: Option<String>,
    quality: Option<String>,
    keep_audio: Option<bool>,
    output_format: Option<String>,
    progress_id: Option<String>,
) -> Result<RifeFrameInterpolationResult, String> {
    let mode = mode.unwrap_or_else(|| "normal".to_string());
    let fixed_2x_mode = matches!(mode.trim(), "hd" | "hd-slow" | "uhd");
    let factor = if fixed_2x_mode {
        2
    } else {
        factor.unwrap_or(2).clamp(2, 4)
    };
    let requested_target_fps = target_fps.filter(|value| value.is_finite() && *value > 0.0);
    let cfr_mode = normalize_video_cfr_mode(cfr_mode);
    let quality = quality.unwrap_or_else(|| "standard".to_string());
    let keep_audio = keep_audio.unwrap_or(true);
    let output_format = match output_format
        .unwrap_or_else(|| "mp4".to_string())
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "mov" => "mov".to_string(),
        "webm" => "webm".to_string(),
        _ => "mp4".to_string(),
    };
    let progress_id_ref = progress_id.as_deref();
    let status = ensure_rife_engine_installed(&app_handle, progress_id_ref)?;
    let (ffmpeg_path, ffprobe_path) = ensure_media_tools_available(&app_handle, progress_id_ref)?;
    let engine_dir = PathBuf::from(&status.engine_dir);
    let exe_path = PathBuf::from(&status.exe_path);
    if !exe_path.is_file() {
        return Err("RIFE 引擎不可用，请重新安装引擎".to_string());
    }

    let source =
        local_path_from_url_like(&input_path).unwrap_or_else(|| PathBuf::from(&input_path));
    if !source.is_file() {
        return Err(format!(
            "找不到要补帧的视频: {}",
            display_local_path(&source)
        ));
    }

    let base_dir = rife_engine_base_dir()?;
    let work_root = base_dir.join("_work");
    let outputs_dir = base_dir.join("outputs");
    fs::create_dir_all(&work_root).map_err(|e| format!("创建 RIFE 工作目录失败: {}", e))?;
    fs::create_dir_all(&outputs_dir).map_err(|e| format!("创建 RIFE 输出目录失败: {}", e))?;

    let run_id = format!("{}_{}", now_millis_u64(), std::process::id());
    let work_dir = work_root.join(run_id);
    let input_frames_dir = work_dir.join("input_frames");
    let output_frames_dir = work_dir.join("output_frames");
    fs::create_dir_all(&input_frames_dir).map_err(|e| format!("创建输入帧目录失败: {}", e))?;
    fs::create_dir_all(&output_frames_dir).map_err(|e| format!("创建输出帧目录失败: {}", e))?;

    let result = (|| -> Result<RifeFrameInterpolationResult, String> {
        let run_started_at = Instant::now();
        let normalized_input_path = work_dir.join("normalized_input.mp4");
        let cfr_result = normalize_video_cfr_impl(
            &app_handle,
            &ffmpeg_path,
            &ffprobe_path,
            &source,
            &cfr_mode,
            &normalized_input_path,
            progress_id_ref,
        )?;
        let processing_source = PathBuf::from(&cfr_result.output_path);
        let info = probe_video_info(&ffprobe_path, &processing_source)?;
        let fps = info.fps.unwrap_or(30.0).max(1.0);
        let estimated_input_frames = video_frame_count(&info);
        let output_fps = if fixed_2x_mode {
            fps * 2.0
        } else if let Some(target) = requested_target_fps {
            target.max(fps).min(fps * 4.0).min(240.0)
        } else {
            (fps * factor as f64).min(240.0)
        };
        let interpolation_capacity = (output_fps / fps).ceil().clamp(2.0, 4.0) as usize;
        let source_stem = source
            .file_stem()
            .and_then(|value| value.to_str())
            .map(sanitize_file_name)
            .unwrap_or_else(|| "video".to_string());
        let output_path = unique_file_path(outputs_dir.join(format!(
            "{}_rife_{}x_{}fps.{}",
            source_stem,
            factor,
            output_fps.round() as u32,
            output_format
        )));
        let audio_path = work_dir.join("audio.m4a");

        let has_audio = if keep_audio {
            let mut audio_cmd = SysCommand::new(&ffmpeg_path);
            audio_cmd
                .args(["-y", "-hide_banner", "-loglevel", "error", "-i"])
                .arg(&processing_source)
                .args(["-vn", "-acodec", "copy"])
                .arg(&audio_path);
            run_hidden_command(&mut audio_cmd, "FFmpeg 音频提取").is_ok() && audio_path.is_file()
        } else {
            false
        };

        let mut decode_cmd = SysCommand::new(&ffmpeg_path);
        decode_cmd
            .args(["-y", "-hide_banner", "-loglevel", "error", "-i"])
            .arg(&processing_source)
            .arg(input_frames_dir.join("frame_%08d.png"));
        let extract_started_at = Instant::now();
        run_hidden_command_with_frame_progress(
            &mut decode_cmd,
            "FFmpeg 视频解帧",
            &app_handle,
            progress_id_ref,
            "extracting-rife-frames",
            "正在抽取视频帧",
            &input_frames_dir,
            estimated_input_frames,
        )?;
        let extract_seconds = extract_started_at.elapsed().as_secs_f64();

        let input_frame_count = count_frame_images(&input_frames_dir)?;
        if input_frame_count == 0 {
            return Err("视频解帧失败，没有得到可用帧".to_string());
        }
        let target_frame_count = ((input_frame_count as f64) * (output_fps / fps))
            .round()
            .max(input_frame_count as f64)
            .min((input_frame_count.saturating_mul(interpolation_capacity)) as f64)
            as usize;
        let mode_model = match mode.trim() {
            "hd" | "hd-slow" => "rife-HD",
            "uhd" => "rife-UHD",
            _ => "rife-v4.6",
        };
        let requested_model = model
            .unwrap_or_else(|| mode_model.to_string())
            .trim()
            .to_string();
        let model_name = if fixed_2x_mode {
            mode_model.to_string()
        } else if requested_model.contains('/') || requested_model.contains('\\') {
            "rife-v4.6".to_string()
        } else {
            requested_model
        };
        let model_path = {
            let candidate = engine_dir.join(&model_name);
            if candidate.is_dir() {
                candidate
            } else {
                engine_dir.join("rife-v4.6")
            }
        };

        let mut rife_cmd = SysCommand::new(&exe_path);
        rife_cmd
            .current_dir(&engine_dir)
            .arg("-i")
            .arg(&input_frames_dir)
            .arg("-o")
            .arg(&output_frames_dir)
            .arg("-m")
            .arg(&model_path);
        if model_name == "rife-v4.6" {
            rife_cmd.arg("-n").arg(target_frame_count.to_string());
        }
        match quality.trim() {
            "fast" => {
                rife_cmd.arg("-j").arg("2:2:2");
            }
            "high" => {
                rife_cmd.arg("-x");
            }
            _ => {}
        }
        let ai_started_at = Instant::now();
        run_hidden_command_with_frame_progress(
            &mut rife_cmd,
            "RIFE 补帧",
            &app_handle,
            progress_id_ref,
            "interpolating-rife-frames",
            "RIFE 正在补帧",
            &output_frames_dir,
            target_frame_count as u64,
        )?;
        let ai_seconds = ai_started_at.elapsed().as_secs_f64();

        let mut encode_cmd = SysCommand::new(&ffmpeg_path);
        encode_cmd
            .args(["-y", "-hide_banner", "-loglevel", "error", "-framerate"])
            .arg(format!("{:.3}", output_fps))
            .arg("-i")
            .arg(output_frames_dir.join("%08d.png"));
        if has_audio {
            encode_cmd.arg("-i").arg(&audio_path);
        }
        if output_format == "webm" {
            let webm_crf = match quality.trim() {
                "fast" => "36",
                "high" => "24",
                _ => "30",
            };
            encode_cmd.args([
                "-c:v",
                "libvpx-vp9",
                "-b:v",
                "0",
                "-crf",
                webm_crf,
                "-pix_fmt",
                "yuv420p",
            ]);
            if has_audio {
                encode_cmd.args(["-c:a", "libopus", "-b:a", "160k", "-shortest"]);
            }
        } else {
            let crf = match quality.trim() {
                "fast" => "23",
                "high" => "15",
                _ => "18",
            };
            encode_cmd.args(["-c:v", "libx264", "-crf", crf, "-pix_fmt", "yuv420p"]);
            if has_audio {
                encode_cmd.args(["-c:a", "copy", "-shortest"]);
            }
        }
        encode_cmd.arg(&output_path);
        emit_rife_engine_progress(
            &app_handle,
            progress_id_ref,
            "encoding-rife-video",
            "正在合成补帧视频",
            0,
            0,
        );
        let encode_started_at = Instant::now();
        run_hidden_command(&mut encode_cmd, "FFmpeg 视频合成")?;
        let encode_seconds = encode_started_at.elapsed().as_secs_f64();

        if !output_path.is_file() {
            return Err("RIFE 补帧完成，但没有生成输出视频".to_string());
        }

        append_media_engine_debug_log(
            &base_dir,
            "rife-run",
            &[
                ("video_frames", input_frame_count.to_string()),
                (
                    "resolution",
                    format!("{}x{}", info.width.unwrap_or(0), info.height.unwrap_or(0)),
                ),
                ("fps", format!("{:.3}", fps)),
                ("model", model_name.clone()),
                ("factor", factor.to_string()),
                ("cfr_mode", cfr_mode.clone()),
                ("cfr_converted", cfr_result.converted.to_string()),
                ("output_fps", format!("{:.3}", output_fps)),
                ("sample_frames", "0".to_string()),
                ("extract_seconds", format!("{:.4}", extract_seconds)),
                ("ai_seconds", format!("{:.4}", ai_seconds)),
                ("encode_seconds", format!("{:.4}", encode_seconds)),
                (
                    "avg_ai_frame_seconds",
                    format!("{:.6}", ai_seconds / input_frame_count.max(1) as f64),
                ),
                (
                    "total_seconds",
                    format!("{:.4}", run_started_at.elapsed().as_secs_f64()),
                ),
            ],
        );
        emit_rife_engine_progress(
            &app_handle,
            progress_id_ref,
            "rife-video-ready",
            "视频补帧完成",
            target_frame_count as u64,
            target_frame_count as u64,
        );

        Ok(RifeFrameInterpolationResult {
            output_path: display_local_path(&output_path),
            engine_dir: status.engine_dir.clone(),
            fps,
            output_fps,
            factor: interpolation_capacity as u32,
            input_frames: input_frame_count,
        })
    })();

    let _ = fs::remove_dir_all(&work_dir);
    result
}

#[tauri::command]
async fn ensure_video_cfr_tools(
    app_handle: tauri::AppHandle,
    progress_id: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        ensure_media_tools_available(&app_handle, progress_id.as_deref()).map(|_| ())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn normalize_video_cfr_if_needed(
    app_handle: tauri::AppHandle,
    input_path: String,
    mode: Option<String>,
    progress_id: Option<String>,
) -> Result<VideoCfrNormalizationResult, String> {
    let mode = normalize_video_cfr_mode(mode);
    let progress_id_ref = progress_id.as_deref();
    let (ffmpeg_path, ffprobe_path) = ensure_media_tools_available(&app_handle, progress_id_ref)?;
    let source =
        local_path_from_url_like(&input_path).unwrap_or_else(|| PathBuf::from(&input_path));
    if !source.is_file() {
        return Err(format!(
            "找不到要检测帧率的视频: {}",
            display_local_path(&source)
        ));
    }
    let base_dir = app_install_dir()?.join("engines").join("video-cfr");
    let outputs_dir = base_dir.join("outputs");
    fs::create_dir_all(&outputs_dir).map_err(|e| format!("创建 CFR 输出目录失败: {}", e))?;
    let source_stem = source
        .file_stem()
        .and_then(|value| value.to_str())
        .map(sanitize_file_name)
        .unwrap_or_else(|| "video".to_string());
    let output_path = unique_file_path(outputs_dir.join(format!("{}_cfr.mp4", source_stem)));
    normalize_video_cfr_impl(
        &app_handle,
        &ffmpeg_path,
        &ffprobe_path,
        &source,
        &mode,
        &output_path,
        progress_id_ref,
    )
}

#[tauri::command]
async fn run_ffmpeg_quick_video_enhancement(
    app_handle: tauri::AppHandle,
    input_path: String,
    scale: Option<u32>,
    keep_audio: Option<bool>,
    output_format: Option<String>,
    progress_id: Option<String>,
) -> Result<QuickVideoEnhancementResult, String> {
    let scale = if scale.unwrap_or(2) >= 2 { 2 } else { 1 };
    let keep_audio = keep_audio.unwrap_or(true);
    let output_format = normalize_realesrgan_video_format(output_format);
    let progress_id_ref = progress_id.as_deref();
    let (ffmpeg_path, ffprobe_path) = ensure_media_tools_available(&app_handle, progress_id_ref)?;
    let source =
        local_path_from_url_like(&input_path).unwrap_or_else(|| PathBuf::from(&input_path));
    if !source.is_file() {
        return Err(format!(
            "找不到要快速增强的视频: {}",
            display_local_path(&source)
        ));
    }
    let info = probe_video_info(&ffprobe_path, &source)?;
    let base_dir = app_install_dir()?.join("engines").join("video-enhancement");
    let outputs_dir = base_dir.join("outputs");
    fs::create_dir_all(&outputs_dir).map_err(|e| format!("创建快速增强输出目录失败: {}", e))?;
    let source_stem = source
        .file_stem()
        .and_then(|value| value.to_str())
        .map(sanitize_file_name)
        .unwrap_or_else(|| "video".to_string());
    let output_path = unique_file_path(outputs_dir.join(format!(
        "{}_quick_enhance_{}x.{}",
        source_stem, scale, output_format
    )));
    let scale_filter = if scale == 2 {
        "scale=trunc(iw*2/2)*2:trunc(ih*2/2)*2:flags=lanczos"
    } else {
        "scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos"
    };
    let filters = format!(
        "hqdn3d=1.25:1.25:4.5:4.5,unsharp=5:5:0.55:5:5:0.0,eq=contrast=1.05:saturation=1.08,{}",
        scale_filter
    );

    emit_rife_engine_progress(
        &app_handle,
        progress_id_ref,
        "quick-enhancing-video",
        "快速去噪、锐化并高质量编码",
        0,
        0,
    );

    let build_command = |encoder: &str| {
        let mut command = SysCommand::new(&ffmpeg_path);
        command
            .args(["-y", "-hide_banner", "-loglevel", "error", "-i"])
            .arg(&source)
            .args(["-map", "0:v:0"]);
        if keep_audio {
            command.args(["-map", "0:a?"]);
        }
        command.arg("-vf").arg(&filters);
        if output_format == "webm" {
            command.args([
                "-c:v",
                "libvpx-vp9",
                "-b:v",
                "0",
                "-crf",
                "25",
                "-cpu-used",
                "3",
                "-row-mt",
                "1",
                "-pix_fmt",
                "yuv420p",
            ]);
            if keep_audio {
                command.args(["-c:a", "libopus", "-b:a", "160k"]);
            }
        } else if encoder == "h264_nvenc" {
            command.args([
                "-c:v",
                "h264_nvenc",
                "-preset",
                "p5",
                "-tune",
                "hq",
                "-rc",
                "vbr",
                "-cq",
                "18",
                "-b:v",
                "0",
                "-pix_fmt",
                "yuv420p",
            ]);
            if keep_audio {
                command.args(["-c:a", "aac", "-b:a", "192k"]);
            }
            command.args(["-movflags", "+faststart"]);
        } else {
            command.args([
                "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
            ]);
            if keep_audio {
                command.args(["-c:a", "aac", "-b:a", "192k"]);
            }
            command.args(["-movflags", "+faststart"]);
        }
        if keep_audio {
            command.arg("-shortest");
        }
        command.arg(&output_path);
        command
    };

    let mut encoder = if output_format == "webm" {
        "libvpx-vp9"
    } else {
        let mut encoder_check = SysCommand::new(&ffmpeg_path);
        encoder_check.args(["-hide_banner", "-encoders"]);
        if run_hidden_command(&mut encoder_check, "检测 NVENC")
            .map(|text| text.contains("h264_nvenc"))
            .unwrap_or(false)
        {
            "h264_nvenc"
        } else {
            "libx264"
        }
    };
    let mut command = build_command(encoder);
    if let Err(nvenc_error) = run_hidden_command(&mut command, "FFmpeg 快速视频增强") {
        if encoder != "h264_nvenc" {
            return Err(nvenc_error);
        }
        let _ = fs::remove_file(&output_path);
        encoder = "libx264";
        emit_rife_engine_progress(
            &app_handle,
            progress_id_ref,
            "quick-enhancing-video-cpu",
            "NVENC 不可用，切换 CPU 高质量编码",
            0,
            0,
        );
        let mut fallback = build_command(encoder);
        run_hidden_command(&mut fallback, "FFmpeg 快速视频增强 CPU 兜底")?;
    }
    if !output_path.is_file() {
        return Err("快速增强完成，但没有生成输出视频".to_string());
    }
    emit_rife_engine_progress(
        &app_handle,
        progress_id_ref,
        "quick-enhance-ready",
        "快速视频增强完成",
        1,
        1,
    );

    Ok(QuickVideoEnhancementResult {
        output_path: display_local_path(&output_path),
        scale,
        output_format,
        fps: info.fps,
        width: info.width.map(|width| width.saturating_mul(scale)),
        height: info.height.map(|height| height.saturating_mul(scale)),
        encoder: encoder.to_string(),
    })
}

#[tauri::command]
async fn get_realesrgan_enhancement_estimate(
    app_handle: tauri::AppHandle,
    input_path: String,
    media_type: Option<String>,
    scale: Option<u32>,
    mode: Option<String>,
    resize_mode: Option<String>,
    output_format: Option<String>,
    preview_seconds: Option<f64>,
    progress_id: Option<String>,
) -> Result<RealEsrganEnhancementEstimate, String> {
    let media_type = media_type
        .unwrap_or_else(|| "image".to_string())
        .trim()
        .to_ascii_lowercase();
    let is_video = media_type == "video";
    let scale = normalize_realesrgan_scale(scale);
    let mode = normalize_realesrgan_mode(mode);
    let resize_mode = normalize_realesrgan_resize_mode(resize_mode);
    let output_format = if is_video {
        normalize_realesrgan_video_format(output_format)
    } else {
        normalize_realesrgan_image_format(output_format)
    };
    let source =
        local_path_from_url_like(&input_path).unwrap_or_else(|| PathBuf::from(&input_path));
    if !source.is_file() {
        return Err(format!(
            "找不到要增强的素材: {}",
            display_local_path(&source)
        ));
    }

    if !is_video {
        let (estimated_seconds_min, estimated_seconds_max) =
            estimate_realesrgan_seconds(1.0, 1024, 1024, scale, &resize_mode, "image");
        return Ok(RealEsrganEnhancementEstimate {
            duration_sec: Some(1.0),
            width: None,
            height: None,
            fps: None,
            frame_count: None,
            output_width: None,
            output_height: None,
            preview: false,
            preview_duration_sec: None,
            sample_frames: None,
            estimated_seconds_min: Some(estimated_seconds_min),
            estimated_seconds_max: Some(estimated_seconds_max),
        });
    }

    let estimate_task = progress_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(acquire_realesrgan_estimate_task)
        .transpose()?;
    let estimate_task_state = estimate_task.as_ref().map(|task| &task.state);

    let status = ensure_realesrgan_engine_installed(&app_handle, progress_id.as_deref())?;
    let (ffmpeg_path, ffprobe_path) =
        ensure_media_tools_available(&app_handle, progress_id.as_deref())?;
    check_realesrgan_estimate_cancelled(estimate_task_state)?;
    let engine_dir = PathBuf::from(&status.engine_dir);
    let exe_path = PathBuf::from(&status.exe_path);
    let info = probe_video_info(&ffprobe_path, &source)?;
    check_realesrgan_estimate_cancelled(estimate_task_state)?;
    let duration_sec = info.duration_sec;
    let width = info.width;
    let height = info.height;
    let fps = info.fps.or(Some(30.0));
    let source_frame_count = video_frame_count(&info);
    let preview_duration_sec = preview_seconds
        .filter(|value| value.is_finite() && *value > 0.0)
        .map(|value| value.clamp(3.0, 5.0))
        .map(|value| {
            info.duration_sec
                .map(|duration| value.min(duration))
                .unwrap_or(value)
        });
    let total_frames = preview_duration_sec
        .map(|duration| {
            ((duration * fps.unwrap_or(30.0)).ceil() as u64)
                .max(1)
                .min(source_frame_count)
        })
        .unwrap_or(source_frame_count);

    let width_for_estimate = width.unwrap_or(1920).max(1);
    let height_for_estimate = height.unwrap_or(1080).max(1);
    let output_width = if resize_mode == "keep" {
        width
    } else {
        width.map(|value| value.saturating_mul(scale))
    };
    let output_height = if resize_mode == "keep" {
        height
    } else {
        height.map(|value| value.saturating_mul(scale))
    };
    let estimate_root = realesrgan_engine_base_dir()?.join("_estimate");
    fs::create_dir_all(&estimate_root)
        .map_err(|e| format!("创建 Real-ESRGAN 测速目录失败: {}", e))?;
    let work_dir = estimate_root.join(format!("{}_{}", now_millis_u64(), std::process::id()));
    let input_frames_dir = work_dir.join("input_frames");
    let enhanced_frames_dir = work_dir.join("enhanced_frames");
    fs::create_dir_all(&input_frames_dir)
        .map_err(|e| format!("创建增强测速输入目录失败: {}", e))?;
    fs::create_dir_all(&enhanced_frames_dir)
        .map_err(|e| format!("创建增强测速输出目录失败: {}", e))?;
    emit_rife_engine_progress(
        &app_handle,
        progress_id.as_deref(),
        "benchmarking-realesrgan-speed",
        &format!(
            "正在用 {} 帧实测增强速度",
            REAL_ESRGAN_ESTIMATE_SAMPLE_FRAMES
        ),
        0,
        0,
    );

    let benchmark = (|| -> Result<(usize, f64, f64, f64, f64), String> {
        let (sample_frames, extract_seconds) = extract_video_benchmark_frames(
            &ffmpeg_path,
            &source,
            &input_frames_dir,
            &info,
            REAL_ESRGAN_ESTIMATE_SAMPLE_FRAMES,
            estimate_task_state,
        )?;
        let ai_started_at = Instant::now();
        // One process handles the complete sample directory. Never spawn one
        // Real-ESRGAN process per frame; process startup would dominate timing.
        run_realesrgan_on_path(
            &exe_path,
            &engine_dir,
            &input_frames_dir,
            &enhanced_frames_dir,
            &mode,
            scale,
            "png",
            estimate_task_state,
        )?;
        let ai_seconds = ai_started_at.elapsed().as_secs_f64();
        let enhanced_sample_frames = count_frame_images(&enhanced_frames_dir)?;
        if enhanced_sample_frames == 0 {
            return Err("Real-ESRGAN 样本测速没有生成输出帧".to_string());
        }

        let sample_video = work_dir.join(format!("sample.{}", output_format));
        let mut encode_cmd = SysCommand::new(&ffmpeg_path);
        encode_cmd
            .args(["-y", "-hide_banner", "-loglevel", "error", "-framerate"])
            .arg(format!("{:.3}", fps.unwrap_or(30.0)))
            .arg("-i")
            .arg(enhanced_frames_dir.join("frame_%08d.png"));
        if resize_mode == "keep" {
            encode_cmd.args([
                "-vf",
                &format!(
                    "scale={}:{}:flags=lanczos",
                    width_for_estimate, height_for_estimate
                ),
            ]);
        } else if scale < REALESRGAN_NATIVE_SCALE {
            let divisor = REALESRGAN_NATIVE_SCALE / scale;
            encode_cmd.args([
                "-vf",
                &format!("scale=iw/{}:ih/{}:flags=lanczos", divisor, divisor),
            ]);
        }
        if output_format == "webm" {
            encode_cmd.args([
                "-c:v",
                "libvpx-vp9",
                "-b:v",
                "0",
                "-crf",
                "28",
                "-pix_fmt",
                "yuv420p",
            ]);
        } else {
            encode_cmd.args(["-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p"]);
        }
        encode_cmd.arg(&sample_video);
        let encode_started_at = Instant::now();
        run_hidden_command_cancellable(
            &mut encode_cmd,
            "FFmpeg 增强样本编码",
            estimate_task_state,
        )?;
        let encode_seconds = encode_started_at.elapsed().as_secs_f64();
        let ai_per_frame = ai_seconds / sample_frames.max(1) as f64;
        let extract_per_frame = extract_seconds / sample_frames.max(1) as f64;
        let encode_per_frame = encode_seconds / enhanced_sample_frames.max(1) as f64;
        let estimated_total =
            (ai_per_frame + extract_per_frame + encode_per_frame) * total_frames as f64;
        Ok((
            sample_frames,
            extract_seconds,
            ai_seconds,
            encode_seconds,
            estimated_total,
        ))
    })();
    let _ = fs::remove_dir_all(&work_dir);
    let benchmark_cancelled = benchmark
        .as_ref()
        .err()
        .is_some_and(|error| is_realesrgan_estimate_cancel_error(error));
    if benchmark_cancelled {
        if let Err(error) = benchmark {
            return Err(error);
        }
        unreachable!();
    }
    emit_rife_engine_progress(
        &app_handle,
        progress_id.as_deref(),
        "realesrgan-benchmark-ready",
        "增强速度实测完成",
        1,
        1,
    );

    let (sample_frames, estimated_seconds_min, estimated_seconds_max) = match benchmark {
        Ok((sample_frames, extract_seconds, ai_seconds, encode_seconds, estimated_total)) => {
            append_media_engine_debug_log(
                &realesrgan_engine_base_dir()?,
                "realesrgan-estimate",
                &[
                    ("video_frames", total_frames.to_string()),
                    ("source_video_frames", source_frame_count.to_string()),
                    (
                        "resolution",
                        format!("{}x{}", width_for_estimate, height_for_estimate),
                    ),
                    ("fps", format!("{:.3}", fps.unwrap_or(30.0))),
                    ("model", realesrgan_model_name(&mode).to_string()),
                    ("process_mode", "single-directory-batch".to_string()),
                    ("engine_processes", "1".to_string()),
                    ("scale", scale.to_string()),
                    ("tile_size", "auto".to_string()),
                    ("native_4x_then_downsample", (scale == 2).to_string()),
                    (
                        "run_scope",
                        if preview_duration_sec.is_some() {
                            "preview"
                        } else {
                            "full"
                        }
                        .to_string(),
                    ),
                    ("sample_frames", sample_frames.to_string()),
                    ("sample_extract_seconds", format!("{:.4}", extract_seconds)),
                    ("sample_ai_seconds", format!("{:.4}", ai_seconds)),
                    ("sample_encode_seconds", format!("{:.4}", encode_seconds)),
                    (
                        "avg_ai_frame_seconds",
                        format!("{:.6}", ai_seconds / sample_frames.max(1) as f64),
                    ),
                    ("estimated_total_seconds", format!("{:.3}", estimated_total)),
                ],
            );
            let (min, max) = measured_estimate_range(estimated_total);
            (Some(sample_frames as u32), min, max)
        }
        Err(error) if is_realesrgan_estimate_cancel_error(&error) => {
            append_media_engine_debug_log(
                &realesrgan_engine_base_dir()?,
                "realesrgan-estimate-cancelled",
                &[
                    ("video_frames", total_frames.to_string()),
                    ("source_video_frames", source_frame_count.to_string()),
                    ("model", realesrgan_model_name(&mode).to_string()),
                    ("scale", scale.to_string()),
                    ("tile_size", "auto".to_string()),
                ],
            );
            return Err(error);
        }
        Err(error) => {
            let (min, max) = estimate_realesrgan_seconds(
                duration_sec.unwrap_or(15.0),
                width_for_estimate,
                height_for_estimate,
                scale,
                &resize_mode,
                "video",
            );
            append_media_engine_debug_log(
                &realesrgan_engine_base_dir()?,
                "realesrgan-estimate-fallback",
                &[
                    ("video_frames", total_frames.to_string()),
                    ("source_video_frames", source_frame_count.to_string()),
                    ("model", realesrgan_model_name(&mode).to_string()),
                    ("scale", scale.to_string()),
                    ("tile_size", "auto".to_string()),
                    (
                        "error",
                        error
                            .replace('\r', " ")
                            .replace('\n', " ")
                            .replace('\t', " "),
                    ),
                    (
                        "estimated_total_seconds",
                        format!("{:.3}", (min + max) / 2.0),
                    ),
                ],
            );
            (None, min, max)
        }
    };

    Ok(RealEsrganEnhancementEstimate {
        duration_sec,
        width,
        height,
        fps,
        frame_count: Some(total_frames),
        output_width,
        output_height,
        preview: preview_duration_sec.is_some(),
        preview_duration_sec,
        sample_frames,
        estimated_seconds_min: Some(estimated_seconds_min),
        estimated_seconds_max: Some(estimated_seconds_max),
    })
}

fn run_realesrgan_image_enhancement_impl(
    app_handle: tauri::AppHandle,
    input_path: String,
    scale: Option<u32>,
    mode: Option<String>,
    resize_mode: Option<String>,
    output_format: Option<String>,
    progress_id: Option<String>,
) -> Result<RealEsrganEnhancementResult, String> {
    let scale = normalize_realesrgan_scale(scale);
    let mode = normalize_realesrgan_mode(mode);
    let resize_mode = normalize_realesrgan_resize_mode(resize_mode);
    let output_format = normalize_realesrgan_image_format(output_format);
    let progress_id_ref = progress_id.as_deref();
    let status = ensure_realesrgan_engine_installed(&app_handle, progress_id_ref)?;
    let engine_dir = PathBuf::from(&status.engine_dir);
    let exe_path = PathBuf::from(&status.exe_path);
    if !exe_path.is_file() {
        return Err("Real-ESRGAN 引擎不可用，请先安装引擎".to_string());
    }

    let source =
        local_path_from_url_like(&input_path).unwrap_or_else(|| PathBuf::from(&input_path));
    if !source.is_file() {
        return Err(format!(
            "找不到要增强的图片: {}",
            display_local_path(&source)
        ));
    }

    let base_dir = realesrgan_engine_base_dir()?;
    let work_root = base_dir.join("_work");
    let outputs_dir = base_dir.join("outputs");
    fs::create_dir_all(&work_root).map_err(|e| format!("创建 Real-ESRGAN 工作目录失败: {}", e))?;
    fs::create_dir_all(&outputs_dir)
        .map_err(|e| format!("创建 Real-ESRGAN 输出目录失败: {}", e))?;

    let run_id = format!("{}_{}", now_millis_u64(), std::process::id());
    let work_dir = work_root.join(run_id);
    fs::create_dir_all(&work_dir).map_err(|e| format!("创建图片增强临时目录失败: {}", e))?;

    let result = (|| -> Result<RealEsrganEnhancementResult, String> {
        let (source_width, source_height) =
            screenshots::image::image_dimensions(&source).map_err(|e| e.to_string())?;
        let requested_target_width = if resize_mode == "keep" {
            source_width
        } else {
            checked_image_scale_dimension(source_width, scale)?
        };
        let requested_target_height = if resize_mode == "keep" {
            source_height
        } else {
            checked_image_scale_dimension(source_height, scale)?
        };
        let (target_width, target_height, clamped_final_size) = realesrgan_fit_dimensions_to_limit(
            requested_target_width,
            requested_target_height,
            REALESRGAN_SAFE_FINAL_MAX_EDGE,
            REALESRGAN_SAFE_FINAL_MAX_PIXELS,
        );

        let (safe_input_width, safe_input_height, needs_pre_resize) =
            realesrgan_safe_input_dimensions(source_width, source_height);
        let source_stem = source
            .file_stem()
            .and_then(|value| value.to_str())
            .map(sanitize_file_name)
            .unwrap_or_else(|| "image".to_string());
        let output_path = unique_file_path(outputs_dir.join(format!(
            "{}_realesrgan_{}x_{}.{}",
            source_stem, scale, resize_mode, output_format
        )));
        let needs_post_resize = resize_mode == "keep"
            || scale < REALESRGAN_NATIVE_SCALE
            || needs_pre_resize
            || clamped_final_size;
        let realesrgan_input_path = if needs_pre_resize {
            let prepared_path = work_dir.join("source_safe_input.png");
            run_local_image_resize(
                &source,
                &prepared_path,
                safe_input_width,
                safe_input_height,
                "png",
            )?;
            prepared_path
        } else {
            source.clone()
        };
        let enhanced_path = if needs_post_resize {
            work_dir.join(format!(
                "enhanced_{}x.{}",
                REALESRGAN_NATIVE_SCALE, output_format
            ))
        } else {
            output_path.clone()
        };

        emit_rife_engine_progress(
            &app_handle,
            progress_id_ref,
            "enhancing-image",
            "Real-ESRGAN 增强图片",
            0,
            0,
        );
        run_realesrgan_image_on_path(
            &exe_path,
            &engine_dir,
            &realesrgan_input_path,
            &enhanced_path,
            &mode,
            &output_format,
        )?;

        if needs_post_resize {
            run_local_image_resize(
                &enhanced_path,
                &output_path,
                target_width,
                target_height,
                &output_format,
            )?;
        }

        if !output_path.is_file() {
            return Err("图片增强完成，但没有生成输出图片".to_string());
        }
        emit_rife_engine_progress(
            &app_handle,
            progress_id_ref,
            "realesrgan-image-ready",
            "图片增强完成",
            1,
            1,
        );
        Ok(RealEsrganEnhancementResult {
            output_path: display_local_path(&output_path),
            engine_dir: status.engine_dir.clone(),
            scale,
            mode,
            resize_mode,
            output_format,
            fps: None,
            width: None,
            height: None,
            preview: false,
            processed_duration_sec: None,
        })
    })();

    let _ = fs::remove_dir_all(&work_dir);
    result
}

#[tauri::command]
async fn run_realesrgan_image_enhancement(
    app_handle: tauri::AppHandle,
    input_path: String,
    scale: Option<u32>,
    mode: Option<String>,
    resize_mode: Option<String>,
    output_format: Option<String>,
    progress_id: Option<String>,
) -> Result<RealEsrganEnhancementResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_realesrgan_image_enhancement_impl(
            app_handle,
            input_path,
            scale,
            mode,
            resize_mode,
            output_format,
            progress_id,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn run_realesrgan_video_enhancement(
    app_handle: tauri::AppHandle,
    input_path: String,
    scale: Option<u32>,
    mode: Option<String>,
    resize_mode: Option<String>,
    keep_audio: Option<bool>,
    output_format: Option<String>,
    preview_seconds: Option<f64>,
    progress_id: Option<String>,
) -> Result<RealEsrganEnhancementResult, String> {
    let scale = normalize_realesrgan_scale(scale);
    let mode = normalize_realesrgan_mode(mode);
    let resize_mode = normalize_realesrgan_resize_mode(resize_mode);
    let keep_audio = keep_audio.unwrap_or(true);
    let output_format = normalize_realesrgan_video_format(output_format);
    let requested_preview_seconds = preview_seconds
        .filter(|value| value.is_finite() && *value > 0.0)
        .map(|value| value.clamp(3.0, 5.0));
    let progress_id_ref = progress_id.as_deref();
    let status = ensure_realesrgan_engine_installed(&app_handle, progress_id_ref)?;
    let (ffmpeg_path, ffprobe_path) = ensure_media_tools_available(&app_handle, progress_id_ref)?;
    let engine_dir = PathBuf::from(&status.engine_dir);
    let exe_path = PathBuf::from(&status.exe_path);
    if !exe_path.is_file() {
        return Err("Real-ESRGAN 引擎不可用，请重新安装引擎".to_string());
    }

    let source =
        local_path_from_url_like(&input_path).unwrap_or_else(|| PathBuf::from(&input_path));
    if !source.is_file() {
        return Err(format!(
            "找不到要增强的视频: {}",
            display_local_path(&source)
        ));
    }

    let base_dir = realesrgan_engine_base_dir()?;
    let work_root = base_dir.join("_work");
    let outputs_dir = base_dir.join("outputs");
    fs::create_dir_all(&work_root).map_err(|e| format!("创建 Real-ESRGAN 工作目录失败: {}", e))?;
    fs::create_dir_all(&outputs_dir)
        .map_err(|e| format!("创建 Real-ESRGAN 输出目录失败: {}", e))?;

    let run_id = format!("{}_{}", now_millis_u64(), std::process::id());
    let work_dir = work_root.join(run_id);
    let input_frames_dir = work_dir.join("input_frames");
    let enhanced_frames_dir = work_dir.join("enhanced_frames");
    fs::create_dir_all(&input_frames_dir).map_err(|e| format!("创建输入帧目录失败: {}", e))?;
    fs::create_dir_all(&enhanced_frames_dir).map_err(|e| format!("创建增强帧目录失败: {}", e))?;

    let result = (|| -> Result<RealEsrganEnhancementResult, String> {
        let run_started_at = Instant::now();
        let info = probe_video_info(&ffprobe_path, &source)?;
        let fps = info.fps.unwrap_or(30.0).max(1.0);
        let preview_duration_sec = requested_preview_seconds.map(|value| {
            info.duration_sec
                .map(|duration| value.min(duration))
                .unwrap_or(value)
        });
        let source_frame_count = video_frame_count(&info);
        let estimated_input_frames = preview_duration_sec
            .map(|duration| {
                ((duration * fps).ceil() as u64)
                    .max(1)
                    .min(source_frame_count)
            })
            .unwrap_or(source_frame_count);
        let source_stem = source
            .file_stem()
            .and_then(|value| value.to_str())
            .map(sanitize_file_name)
            .unwrap_or_else(|| "video".to_string());
        let output_path = unique_file_path(outputs_dir.join(format!(
            "{}_realesrgan_{}x_{}{}.{}",
            source_stem,
            scale,
            resize_mode,
            preview_duration_sec
                .map(|duration| format!("_preview_{:.0}s", duration))
                .unwrap_or_default(),
            output_format
        )));

        emit_rife_engine_progress(
            &app_handle,
            progress_id_ref,
            "decoding-video",
            "解析视频帧",
            0,
            0,
        );
        let mut decode_cmd = SysCommand::new(&ffmpeg_path);
        decode_cmd
            .args(["-y", "-hide_banner", "-loglevel", "error", "-i"])
            .arg(&source);
        if let Some(duration) = preview_duration_sec {
            decode_cmd.args(["-t", &format!("{:.3}", duration)]);
        }
        decode_cmd.arg(input_frames_dir.join("frame_%08d.png"));
        let extract_started_at = Instant::now();
        run_hidden_command_with_frame_progress(
            &mut decode_cmd,
            "FFmpeg 视频解帧",
            &app_handle,
            progress_id_ref,
            "extracting-realesrgan-frames",
            "正在抽取视频帧",
            &input_frames_dir,
            estimated_input_frames,
        )?;
        let extract_seconds = extract_started_at.elapsed().as_secs_f64();
        let input_frame_count = count_frame_images(&input_frames_dir)?;
        if input_frame_count == 0 {
            return Err("视频解帧失败，没有得到可用帧".to_string());
        }

        emit_rife_engine_progress(
            &app_handle,
            progress_id_ref,
            "enhancing-video",
            "Real-ESRGAN 增强视频帧",
            0,
            0,
        );
        let ai_started_at = Instant::now();
        // Run the entire input_frames directory in one Real-ESRGAN process.
        // The progress monitor only counts completed files; it starts no exe.
        let mut enhance_cmd = SysCommand::new(&exe_path);
        enhance_cmd
            .current_dir(&engine_dir)
            .arg("-i")
            .arg(&input_frames_dir)
            .arg("-o")
            .arg(&enhanced_frames_dir)
            .arg("-n")
            .arg(realesrgan_model_name(&mode))
            .arg("-s")
            .arg(REALESRGAN_NATIVE_SCALE.to_string())
            .arg("-f")
            .arg("png");
        run_hidden_command_with_frame_progress(
            &mut enhance_cmd,
            "Real-ESRGAN 清晰度增强",
            &app_handle,
            progress_id_ref,
            "enhancing-realesrgan-frames",
            "Real-ESRGAN 正在增强",
            &enhanced_frames_dir,
            input_frame_count as u64,
        )?;
        let ai_seconds = ai_started_at.elapsed().as_secs_f64();
        let enhanced_frame_count = count_frame_images(&enhanced_frames_dir)?;
        if enhanced_frame_count == 0 {
            return Err("视频增强完成，但没有生成增强帧".to_string());
        }

        emit_rife_engine_progress(
            &app_handle,
            progress_id_ref,
            "encoding-video",
            "合成增强视频",
            0,
            0,
        );
        let mut encode_cmd = SysCommand::new(&ffmpeg_path);
        encode_cmd
            .args(["-y", "-hide_banner", "-loglevel", "error", "-framerate"])
            .arg(format!("{:.3}", fps))
            .arg("-i")
            .arg(enhanced_frames_dir.join("frame_%08d.png"));
        if keep_audio {
            encode_cmd.arg("-i").arg(&source);
        }
        if resize_mode == "keep" {
            if let (Some(width), Some(height)) = (info.width, info.height) {
                encode_cmd.args([
                    "-vf",
                    &format!("scale={}:{}:flags=lanczos", width.max(1), height.max(1)),
                ]);
            } else {
                encode_cmd.args([
                    "-vf",
                    &format!(
                        "scale=iw/{}:ih/{}:flags=lanczos",
                        REALESRGAN_NATIVE_SCALE, REALESRGAN_NATIVE_SCALE
                    ),
                ]);
            }
        } else if scale < REALESRGAN_NATIVE_SCALE {
            let downsample_divisor = REALESRGAN_NATIVE_SCALE / scale;
            encode_cmd.args([
                "-vf",
                &format!(
                    "scale=iw/{}:ih/{}:flags=lanczos",
                    downsample_divisor, downsample_divisor
                ),
            ]);
        }
        if keep_audio {
            encode_cmd.args(["-map", "0:v:0", "-map", "1:a?"]);
        }
        if output_format == "webm" {
            encode_cmd.args([
                "-c:v",
                "libvpx-vp9",
                "-b:v",
                "0",
                "-crf",
                "28",
                "-pix_fmt",
                "yuv420p",
            ]);
            if keep_audio {
                encode_cmd.args(["-c:a", "libopus", "-b:a", "160k", "-shortest"]);
            }
        } else {
            encode_cmd.args(["-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p"]);
            if keep_audio {
                encode_cmd.args(["-c:a", "copy", "-shortest"]);
            }
        }
        encode_cmd.arg(&output_path);
        let encode_started_at = Instant::now();
        run_hidden_command(&mut encode_cmd, "FFmpeg 增强视频合成")?;
        let encode_seconds = encode_started_at.elapsed().as_secs_f64();

        if !output_path.is_file() {
            return Err("视频增强完成，但没有生成输出视频".to_string());
        }
        append_media_engine_debug_log(
            &base_dir,
            "realesrgan-run",
            &[
                ("video_frames", input_frame_count.to_string()),
                ("source_video_frames", source_frame_count.to_string()),
                (
                    "resolution",
                    format!("{}x{}", info.width.unwrap_or(0), info.height.unwrap_or(0)),
                ),
                ("fps", format!("{:.3}", fps)),
                ("model", realesrgan_model_name(&mode).to_string()),
                ("process_mode", "single-directory-batch".to_string()),
                ("engine_processes", "1".to_string()),
                ("scale", scale.to_string()),
                ("tile_size", "auto".to_string()),
                ("native_4x_then_downsample", (scale == 2).to_string()),
                (
                    "run_scope",
                    if preview_duration_sec.is_some() {
                        "preview"
                    } else {
                        "full"
                    }
                    .to_string(),
                ),
                ("extract_seconds", format!("{:.4}", extract_seconds)),
                ("ai_seconds", format!("{:.4}", ai_seconds)),
                ("encode_seconds", format!("{:.4}", encode_seconds)),
                (
                    "avg_ai_frame_seconds",
                    format!("{:.6}", ai_seconds / input_frame_count.max(1) as f64),
                ),
                (
                    "total_seconds",
                    format!("{:.4}", run_started_at.elapsed().as_secs_f64()),
                ),
            ],
        );
        emit_rife_engine_progress(
            &app_handle,
            progress_id_ref,
            "realesrgan-video-ready",
            "视频增强完成",
            1,
            1,
        );
        Ok(RealEsrganEnhancementResult {
            output_path: display_local_path(&output_path),
            engine_dir: status.engine_dir.clone(),
            scale,
            mode,
            resize_mode,
            output_format,
            fps: Some(fps),
            width: info.width,
            height: info.height,
            preview: preview_duration_sec.is_some(),
            processed_duration_sec: preview_duration_sec.or(info.duration_sec),
        })
    })();

    let _ = fs::remove_dir_all(&work_dir);
    result
}

fn apply_custom_http_headers(
    mut request: reqwest::blocking::RequestBuilder,
    headers: Option<&BTreeMap<String, String>>,
) -> Result<reqwest::blocking::RequestBuilder, String> {
    for (key, value) in headers.into_iter().flat_map(|headers| headers.iter()) {
        let key = key.trim();
        let value = value.trim();
        if key.is_empty() || value.is_empty() {
            continue;
        }
        let name = reqwest::header::HeaderName::from_bytes(key.as_bytes())
            .map_err(|_| format!("AI Header 名称无效：{}", key))?;
        let value = reqwest::header::HeaderValue::from_str(value)
            .map_err(|_| format!("AI Header 值无效：{}", key))?;
        request = request.header(name, value);
    }
    Ok(request)
}

fn redact_ai_secrets(
    text: &str,
    api_key: &str,
    headers: Option<&BTreeMap<String, String>>,
) -> String {
    let mut redacted = ai_gateway::router::redact_secret(text, api_key);
    for value in headers.into_iter().flat_map(|headers| headers.values()) {
        redacted = ai_gateway::router::redact_secret(&redacted, value);
    }
    redacted
}

fn http_get_text_with_headers(
    app_handle: &tauri::AppHandle,
    url: &str,
    api_key: &str,
    explicit_proxy: Option<&str>,
    headers: Option<&BTreeMap<String, String>>,
) -> Result<String, String> {
    let timeout_secs = 1600;
    let client = build_http_client(Some(app_handle), explicit_proxy, timeout_secs)?;
    let request = client
        .get(url)
        .header(
            "accept",
            "text/event-stream, application/json, text/plain, */*",
        )
        .bearer_auth(api_key);
    let response_result = apply_custom_http_headers(request, headers)?.send();

    let response = match response_result {
        Ok(response) => response,
        Err(first_err) => {
            let can_retry_direct = explicit_proxy
                .map(|value| value.trim().is_empty())
                .unwrap_or(true);
            if !can_retry_direct {
                return Err(format!("AI GET 请求失败：{}", first_err));
            }
            let direct_client = build_direct_http_client(timeout_secs)?;
            let request = direct_client
                .get(url)
                .header(
                    "accept",
                    "text/event-stream, application/json, text/plain, */*",
                )
                .bearer_auth(api_key);
            apply_custom_http_headers(request, headers)?
                .send()
                .map_err(|second_err| {
                    format!(
                        "AI GET 请求失败：{}；无代理直连重试也失败：{}",
                        first_err, second_err
                    )
                })?
        }
    };

    let status = response.status();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    let prefer_stream =
        url.contains("workerTaskWait") || content_type.contains("text/event-stream");
    let text = if prefer_stream {
        read_streaming_text_until_result(response)?
    } else {
        response.text().map_err(|e| e.to_string())?
    };
    if status.is_success() {
        Ok(text)
    } else {
        Err(format!(
            "AI GET 请求失败，HTTP {}：{}",
            status,
            redact_ai_secrets(&text, api_key, headers)
        ))
    }
}

fn http_get_image_content_with_headers(
    app_handle: &tauri::AppHandle,
    url: &str,
    api_key: &str,
    explicit_proxy: Option<&str>,
    headers: Option<&BTreeMap<String, String>>,
) -> Result<String, String> {
    use base64::{engine::general_purpose, Engine as _};

    let timeout_secs = 420;
    let send = |client: &Client| {
        let request = client
            .get(url)
            .header("accept", "image/*, application/json, */*")
            .bearer_auth(api_key);
        apply_custom_http_headers(request, headers)?
            .send()
            .map_err(|error| error.to_string())
    };
    let client = build_http_client(Some(app_handle), explicit_proxy, timeout_secs)?;
    let response = match send(&client) {
        Ok(response) => response,
        Err(first_err) => {
            let can_retry_direct = explicit_proxy
                .map(|value| value.trim().is_empty())
                .unwrap_or(true);
            if !can_retry_direct {
                return Err(format!("AI image content GET failed: {first_err}"));
            }
            let direct_client = build_direct_http_client(timeout_secs)?;
            send(&direct_client).map_err(|second_err| {
                format!(
                    "AI image content GET failed: {first_err}; direct retry failed: {second_err}"
                )
            })?
        }
    };

    let status = response.status();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/octet-stream")
        .split(';')
        .next()
        .unwrap_or("application/octet-stream")
        .trim()
        .to_ascii_lowercase();
    let bytes = response.bytes().map_err(|error| error.to_string())?;
    if !status.is_success() {
        let text = String::from_utf8_lossy(&bytes);
        return Err(format!(
            "AI image content GET failed: HTTP {status}: {}",
            redact_ai_secrets(&text, api_key, headers)
        ));
    }
    if content_type.contains("json") || content_type.starts_with("text/") {
        return String::from_utf8(bytes.to_vec())
            .map_err(|error| format!("AI image content text decode failed: {error}"));
    }
    let mime = if content_type.starts_with("image/") {
        content_type
    } else {
        "image/png".to_string()
    };
    Ok(format!(
        "data:{mime};base64,{}",
        general_purpose::STANDARD.encode(bytes)
    ))
}

fn xais_output_key(key: &str) -> bool {
    matches!(
        key.to_ascii_lowercase().as_str(),
        "result"
            | "results"
            | "att"
            | "atts"
            | "attachment"
            | "attachments"
            | "output"
            | "outputs"
            | "file"
            | "files"
            | "url"
            | "urls"
            | "uri"
            | "uris"
            | "href"
            | "download"
            | "downloads"
    )
}

fn xais_value_has_output(value: &serde_json::Value) -> bool {
    match value {
        serde_json::Value::String(text) => {
            let trimmed = text.trim();
            !trimmed.is_empty()
                && !trimmed.eq_ignore_ascii_case("null")
                && !trimmed.eq_ignore_ascii_case("undefined")
                && !trimmed.eq_ignore_ascii_case("unknown error")
                && !matches!(
                    trimmed.to_ascii_lowercase().as_str(),
                    "pending"
                        | "queued"
                        | "queue"
                        | "running"
                        | "processing"
                        | "in_progress"
                        | "progress"
                        | "waiting"
                        | "created"
                        | "submitted"
                )
        }
        serde_json::Value::Array(items) => items.iter().any(xais_value_has_output),
        serde_json::Value::Object(object) => object
            .iter()
            .any(|(key, nested)| xais_output_key(key) && xais_value_has_output(nested)),
        _ => false,
    }
}

fn xais_status_is_failure(status: &str) -> bool {
    matches!(
        status.trim().to_ascii_lowercase().as_str(),
        "fail" | "failed" | "failure" | "error" | "exception" | "cancelled" | "canceled"
    )
}

fn xais_payload_is_terminal(value: &serde_json::Value) -> bool {
    match value {
        serde_json::Value::Array(items) => items.iter().any(xais_payload_is_terminal),
        serde_json::Value::Object(object) => {
            for key in ["status", "state"] {
                if let Some(status) = object.get(key).and_then(|value| value.as_str()) {
                    if xais_status_is_failure(status) {
                        return true;
                    }
                }
            }
            object
                .iter()
                .any(|(key, nested)| xais_output_key(key) && xais_value_has_output(nested))
                || object.values().any(xais_payload_is_terminal)
        }
        _ => false,
    }
}

fn xais_stream_payload_from_line(line: &str) -> Option<&str> {
    let trimmed = line.trim();
    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("data:") {
        return Some(trimmed[5..].trim());
    }
    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        return Some(trimmed);
    }
    None
}

fn read_streaming_text_until_result(
    response: reqwest::blocking::Response,
) -> Result<String, String> {
    let mut reader = BufReader::new(response);
    let mut text = String::new();
    let mut line = String::new();
    loop {
        line.clear();
        let read = reader.read_line(&mut line).map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        text.push_str(&line);
        if let Some(payload) = xais_stream_payload_from_line(&line) {
            if payload.eq_ignore_ascii_case("[done]") {
                break;
            }
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(payload) {
                if xais_payload_is_terminal(&value) {
                    break;
                }
            }
        }
        if text.len() > 2 * 1024 * 1024 {
            break;
        }
    }
    Ok(text)
}

#[derive(Clone)]
struct AiImageRequestTrace {
    model: String,
    endpoint_protocol: String,
    client_request_id: String,
    reference_host: String,
    reference_ready_duration_ms: u64,
    is_first_request: bool,
}

const AI_HTTP_REQUEST_MAX_TIMEOUT_SECS: u64 = 15 * 60;

#[derive(Clone)]
struct AiHttpRequestOptions {
    timeout_secs: u64,
    single_attempt: bool,
    trace: Option<AiImageRequestTrace>,
}

impl Default for AiHttpRequestOptions {
    fn default() -> Self {
        Self {
            timeout_secs: AI_HTTP_REQUEST_MAX_TIMEOUT_SECS,
            single_attempt: false,
            trace: None,
        }
    }
}

fn sanitize_ai_request_log_field(value: &str, max_chars: usize) -> String {
    value
        .chars()
        .filter(|ch| !ch.is_control())
        .take(max_chars)
        .collect::<String>()
        .trim()
        .to_string()
}

fn ai_response_request_id(response: &reqwest::blocking::Response) -> String {
    ["x-request-id", "request-id", "cf-ray"]
        .iter()
        .find_map(|name| {
            response
                .headers()
                .get(*name)
                .and_then(|value| value.to_str().ok())
                .map(|value| sanitize_ai_request_log_field(value, 120))
                .filter(|value| !value.is_empty())
        })
        .unwrap_or_default()
}

fn log_ai_image_request(
    trace: Option<&AiImageRequestTrace>,
    status: &str,
    request_id: &str,
    elapsed: Duration,
    response_bytes: usize,
) {
    let Some(trace) = trace else {
        return;
    };
    eprintln!(
        "[newapi_image_request] model={} protocol={} status={} request_id={} client_request_id={} elapsed_ms={} response_bytes={} reference_host={} reference_ready_duration_ms={} first_request={}",
        sanitize_ai_request_log_field(&trace.model, 160),
        sanitize_ai_request_log_field(&trace.endpoint_protocol, 48),
        sanitize_ai_request_log_field(status, 48),
        sanitize_ai_request_log_field(request_id, 120),
        sanitize_ai_request_log_field(&trace.client_request_id, 160),
        elapsed.as_millis(),
        response_bytes,
        sanitize_ai_request_log_field(&trace.reference_host, 240),
        trace.reference_ready_duration_ms,
        trace.is_first_request,
    );
}

fn apply_ai_client_request_id(
    mut request: reqwest::blocking::RequestBuilder,
    trace: Option<&AiImageRequestTrace>,
) -> reqwest::blocking::RequestBuilder {
    if let Some(value) = trace
        .map(|trace| trace.client_request_id.trim())
        .filter(|value| !value.is_empty())
    {
        request = request.header("x-client-request-id", value);
    }
    request
}

fn build_ai_http_request_options(
    model: &str,
    single_attempt: Option<bool>,
    timeout_secs: Option<u64>,
    client_request_id: Option<String>,
    endpoint_protocol: Option<String>,
    reference_host: Option<String>,
    reference_ready_duration_ms: Option<u64>,
    is_first_request: Option<bool>,
) -> AiHttpRequestOptions {
    let client_request_id = client_request_id.unwrap_or_default();
    let endpoint_protocol = endpoint_protocol.unwrap_or_default();
    let trace = if client_request_id.trim().is_empty() && endpoint_protocol.trim().is_empty() {
        None
    } else {
        Some(AiImageRequestTrace {
            model: model.to_string(),
            endpoint_protocol,
            client_request_id,
            reference_host: reference_host.unwrap_or_default(),
            reference_ready_duration_ms: reference_ready_duration_ms.unwrap_or_default(),
            is_first_request: is_first_request.unwrap_or(true),
        })
    };
    AiHttpRequestOptions {
        timeout_secs: timeout_secs
            .unwrap_or(AI_HTTP_REQUEST_MAX_TIMEOUT_SECS)
            .clamp(30, AI_HTTP_REQUEST_MAX_TIMEOUT_SECS),
        single_attempt: single_attempt.unwrap_or(false),
        trace,
    }
}

fn http_post_json_with_headers(
    app_handle: &tauri::AppHandle,
    url: &str,
    api_key: &str,
    body: &serde_json::Value,
    explicit_proxy: Option<&str>,
    headers: Option<&BTreeMap<String, String>>,
    options: &AiHttpRequestOptions,
) -> Result<String, String> {
    let timeout_secs = options
        .timeout_secs
        .clamp(30, AI_HTTP_REQUEST_MAX_TIMEOUT_SECS);
    let client = build_http_client(Some(app_handle), explicit_proxy, timeout_secs)?;
    let started_at = Instant::now();
    let request = apply_ai_client_request_id(
        client.post(url).bearer_auth(api_key).json(body),
        options.trace.as_ref(),
    );
    let response_result = apply_custom_http_headers(request, headers)?.send();

    let response = match response_result {
        Ok(response) => response,
        Err(first_err) => {
            if options.single_attempt {
                log_ai_image_request(
                    options.trace.as_ref(),
                    "transport_error",
                    "",
                    started_at.elapsed(),
                    0,
                );
                return Err(format!("AI 请求失败：{}", first_err));
            }
            let can_retry_direct = explicit_proxy
                .map(|value| value.trim().is_empty())
                .unwrap_or(true);
            if !can_retry_direct {
                return Err(format!("AI 请求失败：{}", first_err));
            }
            let direct_client = build_direct_http_client(timeout_secs)?;
            let request = apply_ai_client_request_id(
                direct_client.post(url).bearer_auth(api_key).json(body),
                options.trace.as_ref(),
            );
            apply_custom_http_headers(request, headers)?
                .send()
                .map_err(|second_err| {
                    format!(
                        "AI 请求失败：{}；无代理直连重试也失败：{}",
                        first_err, second_err
                    )
                })?
        }
    };

    let status = response.status();
    let request_id = ai_response_request_id(&response);
    let text = response.text().map_err(|e| e.to_string())?;
    log_ai_image_request(
        options.trace.as_ref(),
        &status.as_u16().to_string(),
        &request_id,
        started_at.elapsed(),
        text.len(),
    );
    if status.is_success() {
        Ok(text)
    } else {
        Err(format!(
            "AI 请求失败，HTTP {}：{}",
            status,
            redact_ai_secrets(&text, api_key, headers)
        ))
    }
}
fn image_mime_extension(mime: &str) -> &'static str {
    match mime.to_ascii_lowercase().as_str() {
        "image/jpeg" | "image/jpg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        "image/bmp" => "bmp",
        "image/svg+xml" => "svg",
        _ => "png",
    }
}

// Keep the raw file below provider limits even after Base64/JSON overhead.
const AI_REFERENCE_IMAGE_TARGET_BYTES: usize = 6 * 1024 * 1024;

fn is_ai_upload_compatible_image_mime(mime: &str) -> bool {
    matches!(
        mime.to_ascii_lowercase().as_str(),
        "image/png" | "image/jpeg" | "image/jpg" | "image/webp"
    )
}

fn should_normalize_ai_reference_image(mime: &str, byte_len: usize) -> bool {
    !is_ai_upload_compatible_image_mime(mime) || byte_len > AI_REFERENCE_IMAGE_TARGET_BYTES
}

fn flatten_dynamic_image_to_rgb(
    image: &screenshots::image::DynamicImage,
    background: impl Fn(u32, u32) -> [u8; 3],
) -> screenshots::image::RgbImage {
    let rgba = image.to_rgba8();
    let mut rgb = screenshots::image::RgbImage::new(rgba.width(), rgba.height());
    for (index, (target, source)) in rgb.pixels_mut().zip(rgba.pixels()).enumerate() {
        let x = (index as u32) % rgba.width().max(1);
        let y = (index as u32) / rgba.width().max(1);
        let background = background(x, y);
        let alpha = u32::from(source[3]);
        for channel in 0..3 {
            target[channel] = ((u32::from(source[channel]) * alpha
                + u32::from(background[channel]) * (255 - alpha)
                + 127)
                / 255) as u8;
        }
    }
    rgb
}

fn flatten_dynamic_image_to_white_rgb(
    image: &screenshots::image::DynamicImage,
) -> screenshots::image::RgbImage {
    flatten_dynamic_image_to_rgb(image, |_, _| [255, 255, 255])
}

fn flatten_dynamic_image_to_transparency_preview_rgb(
    image: &screenshots::image::DynamicImage,
) -> screenshots::image::RgbImage {
    // Keep transparent thumbnails readable without exposing the magenta matte
    // that some PNG encoders store in fully transparent pixels.
    const LIGHT: [u8; 3] = [230, 230, 230];
    const DARK: [u8; 3] = [207, 207, 207];
    const TILE_SIZE: u32 = 16;
    flatten_dynamic_image_to_rgb(image, |x, y| {
        if ((x / TILE_SIZE) + (y / TILE_SIZE)) % 2 == 0 {
            LIGHT
        } else {
            DARK
        }
    })
}

fn encode_ai_reference_jpeg(
    image: &screenshots::image::DynamicImage,
    quality: u8,
) -> Result<Vec<u8>, String> {
    let rgb = flatten_dynamic_image_to_white_rgb(image);
    let mut bytes = Vec::new();
    let encoder = screenshots::image::codecs::jpeg::JpegEncoder::new_with_quality(
        &mut bytes,
        quality,
    );
    screenshots::image::ImageEncoder::write_image(
        encoder,
        rgb.as_raw(),
        rgb.width(),
        rgb.height(),
        screenshots::image::ColorType::Rgb8,
    )
    .map_err(|error| format!("参考图 JPEG 压缩失败：{error}"))?;
    Ok(bytes)
}

fn normalize_ai_reference_image_bytes(
    bytes: Vec<u8>,
    mime: String,
) -> Result<(Vec<u8>, String), String> {
    if !should_normalize_ai_reference_image(&mime, bytes.len()) {
        return Ok((bytes, mime));
    }

    let image = screenshots::image::load_from_memory(&bytes)
        .map_err(|error| format!("参考图格式转换失败：{error}"))?;
    let original_max_edge = image.width().max(image.height()).max(1);
    let max_edges = [4096_u32, 3072, 2560, 2048, 1600, 1280, 1024];
    let qualities = [92_u8, 86, 80, 72, 64];
    let mut smallest: Option<Vec<u8>> = None;
    let mut last_dimensions: Option<(u32, u32)> = None;

    for max_edge in max_edges {
        let prepared = if original_max_edge > max_edge {
            image.resize(
                max_edge,
                max_edge,
                screenshots::image::imageops::FilterType::Lanczos3,
            )
        } else {
            image.clone()
        };
        let dimensions = (prepared.width(), prepared.height());
        if last_dimensions == Some(dimensions) {
            continue;
        }
        last_dimensions = Some(dimensions);
        for quality in qualities {
            let candidate = encode_ai_reference_jpeg(&prepared, quality)?;
            if candidate.len() <= AI_REFERENCE_IMAGE_TARGET_BYTES {
                return Ok((candidate, "image/jpeg".to_string()));
            }
            if smallest
                .as_ref()
                .map(|current| candidate.len() < current.len())
                .unwrap_or(true)
            {
                smallest = Some(candidate);
            }
        }
    }

    smallest
        .map(|candidate| (candidate, "image/jpeg".to_string()))
        .ok_or_else(|| "参考图压缩没有生成可用文件".to_string())
}

#[cfg(test)]
mod ai_reference_image_preparation_tests {
    use super::{
        normalize_ai_reference_image_bytes, should_normalize_ai_reference_image,
        AI_REFERENCE_IMAGE_TARGET_BYTES,
    };

    #[test]
    fn normalizes_bmp_reference_images_to_jpeg() {
        let image = screenshots::image::RgbaImage::from_pixel(
            4,
            3,
            screenshots::image::Rgba([30, 80, 140, 255]),
        );
        let mut bmp = Vec::new();
        let encoder = screenshots::image::codecs::bmp::BmpEncoder::new(&mut bmp);
        screenshots::image::ImageEncoder::write_image(
            encoder,
            image.as_raw(),
            image.width(),
            image.height(),
            screenshots::image::ColorType::Rgba8,
        )
        .expect("encode bmp fixture");

        let (prepared, mime) =
            normalize_ai_reference_image_bytes(bmp, "image/bmp".to_string())
                .expect("normalize bmp");

        assert_eq!(mime, "image/jpeg");
        assert_eq!(&prepared[..2], &[0xff, 0xd8]);
        assert!(prepared.len() <= AI_REFERENCE_IMAGE_TARGET_BYTES);
    }

    #[test]
    fn only_reencodes_compatible_images_when_they_are_too_large() {
        assert!(!should_normalize_ai_reference_image("image/png", 1024));
        assert!(should_normalize_ai_reference_image(
            "image/png",
            AI_REFERENCE_IMAGE_TARGET_BYTES + 1,
        ));
        assert!(should_normalize_ai_reference_image("image/gif", 1024));
        assert!(should_normalize_ai_reference_image("image/bmp", 1024));
    }

    #[test]
    fn compresses_an_oversized_png_below_the_upload_target() {
        let width = 1920;
        let height = 1440;
        let mut seed = 0x1234_5678_u32;
        let image = screenshots::image::RgbaImage::from_fn(width, height, |_x, _y| {
            seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            let red = (seed >> 24) as u8;
            seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            let green = (seed >> 24) as u8;
            seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            let blue = (seed >> 24) as u8;
            screenshots::image::Rgba([red, green, blue, 255])
        });
        let mut png = Vec::new();
        let encoder = screenshots::image::codecs::png::PngEncoder::new_with_quality(
            &mut png,
            screenshots::image::codecs::png::CompressionType::Fast,
            screenshots::image::codecs::png::FilterType::NoFilter,
        );
        screenshots::image::ImageEncoder::write_image(
            encoder,
            image.as_raw(),
            image.width(),
            image.height(),
            screenshots::image::ColorType::Rgba8,
        )
        .expect("encode oversized png fixture");
        assert!(png.len() > AI_REFERENCE_IMAGE_TARGET_BYTES);

        let (prepared, mime) =
            normalize_ai_reference_image_bytes(png, "image/png".to_string())
                .expect("compress oversized png");

        assert_eq!(mime, "image/jpeg");
        assert!(prepared.len() <= AI_REFERENCE_IMAGE_TARGET_BYTES);
    }
}

fn decode_data_image(input: &str) -> Result<(Vec<u8>, String), String> {
    let value = input.trim();
    let Some((header, payload)) = value.split_once(',') else {
        return Err("参考图不是 data URL".to_string());
    };
    if !header.starts_with("data:image/") {
        return Err("参考图不是图片 data URL".to_string());
    }
    let mime = header
        .strip_prefix("data:")
        .and_then(|rest| rest.split(';').next())
        .filter(|mime| mime.starts_with("image/"))
        .unwrap_or("image/png")
        .to_string();
    use base64::{engine::general_purpose, Engine as _};
    let bytes = general_purpose::STANDARD
        .decode(payload)
        .map_err(|e| format!("参考图 Base64 解析失败：{}", e))?;
    Ok((bytes, mime))
}

fn image_edit_source_to_bytes(client: &Client, input: &str) -> Result<(Vec<u8>, String), String> {
    let value = input.trim();
    let loaded = if value.starts_with("data:image/") {
        decode_data_image(value)
    } else if let Some(path) = local_path_from_url_like(value) {
        if path.is_file() {
            let bytes = fs::read(&path).map_err(|e| format!("读取参考图失败：{}", e))?;
            Ok((bytes, guess_mime_from_path(&path).to_string()))
        } else {
            Err("参考图本地文件不存在".to_string())
        }
    } else if value.starts_with("http://") || value.starts_with("https://") {
        let response = client
            .get(value)
            .header("accept", "image/*,*/*")
            .send()
            .map_err(|e| format!("下载参考图失败：{}", e))?;
        let status = response.status();
        if !status.is_success() {
            return Err(format!("下载参考图失败，HTTP {}", status));
        }
        let mime = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.split(';').next())
            .filter(|value| value.starts_with("image/"))
            .map(str::to_string)
            .or_else(|| {
                image_ext_from_name_or_url(value).map(|ext| match ext.as_str() {
                    "jpg" | "jpeg" => "image/jpeg".to_string(),
                    "webp" => "image/webp".to_string(),
                    "gif" => "image/gif".to_string(),
                    "bmp" => "image/bmp".to_string(),
                    "svg" => "image/svg+xml".to_string(),
                    _ => "image/png".to_string(),
                })
            })
            .unwrap_or_else(|| "image/png".to_string());
        let bytes = response
            .bytes()
            .map_err(|e| format!("读取参考图失败：{}", e))?
            .to_vec();
        Ok((bytes, mime))
    } else {
        let path = PathBuf::from(value);
        if path.is_file() {
            let bytes = fs::read(&path).map_err(|e| format!("读取参考图失败：{}", e))?;
            Ok((bytes, guess_mime_from_path(&path).to_string()))
        } else {
            Err("参考图必须是公网 URL、data URL 或本地图片路径".to_string())
        }
    }?;

    normalize_ai_reference_image_bytes(loaded.0, loaded.1)
}

#[derive(Clone)]
struct XaisUploadUrlResponse {
    url: String,
    name: String,
}

fn find_xais_upload_url_response(value: &serde_json::Value) -> Option<XaisUploadUrlResponse> {
    match value {
        serde_json::Value::Object(object) => {
            let url = object
                .get("url")
                .or_else(|| object.get("uploadUrl"))
                .or_else(|| object.get("upload_url"))
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .trim();
            let name = object
                .get("name")
                .or_else(|| object.get("att"))
                .or_else(|| object.get("attachment"))
                .or_else(|| object.get("key"))
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .trim();
            if !url.is_empty() && !name.is_empty() {
                return Some(XaisUploadUrlResponse {
                    url: url.to_string(),
                    name: name.to_string(),
                });
            }
            for key in ["data", "result", "upload", "attachment"] {
                if let Some(nested) = object.get(key) {
                    if let Some(found) = find_xais_upload_url_response(nested) {
                        return Some(found);
                    }
                }
            }
            None
        }
        serde_json::Value::Array(items) => {
            for item in items {
                if let Some(found) = find_xais_upload_url_response(item) {
                    return Some(found);
                }
            }
            None
        }
        _ => None,
    }
}

fn parse_xais_upload_url_response(
    raw: &str,
    profile: &ai_credentials::EffectiveApiProfile,
) -> Result<XaisUploadUrlResponse, String> {
    let preview = ai_gateway::router::response_preview(
        &ai_gateway::router::redact_profile_secrets(raw, profile),
    );
    let value: serde_json::Value = serde_json::from_str(raw).map_err(|e| {
        format!(
            "XAIS reference upload URL JSON parse failed: {}; raw: {}",
            e, preview
        )
    })?;
    find_xais_upload_url_response(&value).ok_or_else(|| {
        format!(
            "XAIS reference upload URL response missing url/name: {}",
            preview
        )
    })
}

fn xais_registration_contains_url(value: &serde_json::Value) -> bool {
    match value {
        serde_json::Value::String(value) => {
            let value = value.trim();
            value.starts_with("http://") || value.starts_with("https://")
        }
        serde_json::Value::Array(items) => items.iter().any(xais_registration_contains_url),
        serde_json::Value::Object(object) => object.values().any(xais_registration_contains_url),
        _ => false,
    }
}

fn validate_xais_attachment_registration_response(raw: &str) -> Result<(), String> {
    let trimmed = raw.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return Ok(());
    }
    let value: serde_json::Value = serde_json::from_str(trimmed)
        .map_err(|error| format!("invalid registration response: {error}"))?;
    if xais_registration_contains_url(&value) {
        Ok(())
    } else {
        Err("registration response did not resolve an image URL".to_string())
    }
}

fn xais_upload_reference_image(
    app_handle: &tauri::AppHandle,
    profile: &ai_credentials::EffectiveApiProfile,
    source: &str,
    explicit_proxy: Option<&str>,
) -> Result<String, String> {
    let timeout_secs = 300;
    let client = build_http_client(Some(app_handle), explicit_proxy, timeout_secs)?;
    let (bytes, mime) = image_edit_source_to_bytes(&client, source).or_else(|first_err| {
        let can_retry_direct = explicit_proxy
            .map(|value| value.trim().is_empty())
            .unwrap_or(true);
        if !can_retry_direct {
            return Err(first_err);
        }
        let direct_client = build_direct_http_client(timeout_secs)?;
        image_edit_source_to_bytes(&direct_client, source).map_err(|second_err| {
            format!(
                "XAIS reference image read failed: {}; direct retry also failed: {}",
                first_err, second_err
            )
        })
    })?;
    let ext = image_mime_extension(&mime);
    let upload_endpoint =
        ai_gateway::xais_adapter::file_attachment_upload_url_endpoint(profile, ext)?;
    let upload_url_raw = http_get_text_with_headers(
        app_handle,
        &upload_endpoint,
        &profile.api_key,
        explicit_proxy,
        Some(&profile.headers),
    )?;
    let upload = parse_xais_upload_url_response(&upload_url_raw, profile)?;
    let upload_result = client
        .put(&upload.url)
        .header(reqwest::header::CONTENT_TYPE, "application/octet-stream")
        .body(bytes.clone())
        .send();
    let response = match upload_result {
        Ok(response) => response,
        Err(first_err) => {
            let can_retry_direct = explicit_proxy
                .map(|value| value.trim().is_empty())
                .unwrap_or(true);
            if !can_retry_direct {
                return Err(format!("XAIS reference image upload failed: {}", first_err));
            }
            let direct_client = build_direct_http_client(timeout_secs)?;
            direct_client
                .put(&upload.url)
                .header(reqwest::header::CONTENT_TYPE, "application/octet-stream")
                .body(bytes)
                .send()
                .map_err(|second_err| {
                    format!(
                        "XAIS reference image upload failed: {}; direct retry also failed: {}",
                        first_err, second_err
                    )
                })?
        }
    };
    let status = response.status();
    let text = response.text().unwrap_or_default();
    if !status.is_success() {
        return Err(format!(
            "XAIS reference image upload failed: HTTP {}; {}",
            status,
            ai_gateway::router::response_preview(&ai_gateway::router::redact_profile_secrets(
                &text, profile
            ))
        ));
    }

    let name = upload.name.trim().to_string();
    let registration_endpoint =
        ai_gateway::xais_adapter::attachment_registration_endpoint(profile, &name)?;
    let mut registration_error = None;
    for attempt in 0..4 {
        if attempt > 0 {
            std::thread::sleep(Duration::from_millis(600 * attempt));
        }
        let registered = http_get_text_with_headers(
            app_handle,
            &registration_endpoint,
            &profile.api_key,
            explicit_proxy,
            Some(&profile.headers),
        )
        .and_then(|raw| validate_xais_attachment_registration_response(&raw));
        match registered {
            Ok(()) => {
                registration_error = None;
                break;
            }
            Err(error) => registration_error = Some(error),
        }
    }
    if let Some(error) = registration_error {
        return Err(format!(
            "XAIS reference attachment registration failed: {}",
            error
        ));
    }
    Ok(name)
}

#[cfg(test)]
mod xais_reference_registration_tests {
    use super::validate_xais_attachment_registration_response;

    #[test]
    fn registration_requires_a_resolved_http_url() {
        assert!(validate_xais_attachment_registration_response(
            r#"{"data":{"url":"https://xais.example.test/reference.png"}}"#
        )
        .is_ok());
        assert!(validate_xais_attachment_registration_response(
            r#"["https://xais.example.test/reference.png"]"#
        )
        .is_ok());
        assert!(
            validate_xais_attachment_registration_response(r#"{"success":true,"data":{}}"#)
                .is_err()
        );
        assert!(validate_xais_attachment_registration_response("not-json").is_err());
    }
}

fn build_ai_image_edit_form(
    client: &Client,
    model: &str,
    prompt: &str,
    n: u32,
    size: Option<&str>,
    quality: Option<&str>,
    response_format: Option<&str>,
    aspect_ratio: Option<&str>,
    output_resolution: Option<&str>,
    image_size: Option<&str>,
    output_format: Option<&str>,
    background: Option<&str>,
    images: &[String],
    async_task: Option<bool>,
    stream: Option<bool>,
    repeat_image_field: bool,
) -> Result<Form, String> {
    let mut form = Form::new()
        .text("model", model.to_string())
        .text("prompt", prompt.to_string())
        .text("n", n.to_string());
    if let Some(value) = size.filter(|value| !value.trim().is_empty()) {
        form = form.text("size", value.to_string());
    }
    if let Some(value) = quality.filter(|value| !value.trim().is_empty()) {
        form = form.text("quality", value.to_string());
    }
    if let Some(value) = response_format.filter(|value| !value.trim().is_empty()) {
        form = form.text("response_format", value.to_string());
    }
    if let Some(value) = aspect_ratio.filter(|value| !value.trim().is_empty()) {
        form = form.text("aspect_ratio", value.to_string());
    }
    if let Some(value) = output_resolution.filter(|value| !value.trim().is_empty()) {
        form = form.text("output_resolution", value.to_string());
    }
    if let Some(value) = image_size.filter(|value| !value.trim().is_empty()) {
        form = form.text("image_size", value.to_string());
    }
    if let Some(value) = output_format.filter(|value| !value.trim().is_empty()) {
        form = form.text("output_format", value.to_string());
    }
    if let Some(value) = background.filter(|value| !value.trim().is_empty()) {
        form = form.text("background", value.to_string());
    }
    if let Some(value) = async_task {
        form = form.text("async", value.to_string());
    }
    if let Some(value) = stream {
        form = form.text("stream", value.to_string());
    }

    let max_images = if repeat_image_field { 9 } else { 8 };
    for (index, image) in images.iter().take(max_images).enumerate() {
        let (bytes, mime) = image_edit_source_to_bytes(client, image)?;
        let ext = image_mime_extension(&mime);
        let part = Part::bytes(bytes)
            .file_name(format!("input-{}.{}", index + 1, ext))
            .mime_str(&mime)
            .map_err(|e| format!("参考图 MIME 设置失败：{}", e))?;
        let field_name = if repeat_image_field || index == 0 {
            "image"
        } else {
            "image[]"
        };
        form = form.part(field_name, part);
    }

    Ok(form)
}

fn http_post_image_edit_with_headers(
    app_handle: &tauri::AppHandle,
    url: &str,
    api_key: &str,
    model: &str,
    prompt: &str,
    n: u32,
    size: Option<&str>,
    quality: Option<&str>,
    response_format: Option<&str>,
    aspect_ratio: Option<&str>,
    output_resolution: Option<&str>,
    image_size: Option<&str>,
    output_format: Option<&str>,
    background: Option<&str>,
    images: &[String],
    async_task: Option<bool>,
    stream: Option<bool>,
    repeat_image_field: bool,
    explicit_proxy: Option<&str>,
    headers: Option<&BTreeMap<String, String>>,
    options: &AiHttpRequestOptions,
) -> Result<String, String> {
    if images.is_empty() {
        return Err("缺少参考图".to_string());
    }

    let timeout_secs = options
        .timeout_secs
        .clamp(30, AI_HTTP_REQUEST_MAX_TIMEOUT_SECS);
    let client = build_http_client(Some(app_handle), explicit_proxy, timeout_secs)?;
    let started_at = Instant::now();
    let request = apply_ai_client_request_id(
        client
            .post(url)
            .bearer_auth(api_key)
            .multipart(build_ai_image_edit_form(
                &client,
                model,
                prompt,
                n,
                size,
                quality,
                response_format,
                aspect_ratio,
                output_resolution,
                image_size,
                output_format,
                background,
                images,
                async_task,
                stream,
                repeat_image_field,
            )?),
        options.trace.as_ref(),
    );
    let response_result = apply_custom_http_headers(request, headers)?.send();

    let response = match response_result {
        Ok(response) => response,
        Err(first_err) => {
            if options.single_attempt {
                log_ai_image_request(
                    options.trace.as_ref(),
                    "transport_error",
                    "",
                    started_at.elapsed(),
                    0,
                );
                return Err(format!("AI 图片上传失败：{}", first_err));
            }
            let can_retry_direct = explicit_proxy
                .map(|value| value.trim().is_empty())
                .unwrap_or(true);
            if !can_retry_direct {
                return Err(format!("AI 图片上传失败：{}", first_err));
            }
            let direct_client = build_direct_http_client(timeout_secs)?;
            let request = apply_ai_client_request_id(
                direct_client
                    .post(url)
                    .bearer_auth(api_key)
                    .multipart(build_ai_image_edit_form(
                        &direct_client,
                        model,
                        prompt,
                        n,
                        size,
                        quality,
                        response_format,
                        aspect_ratio,
                        output_resolution,
                        image_size,
                        output_format,
                        background,
                        images,
                        async_task,
                        stream,
                        repeat_image_field,
                    )?),
                options.trace.as_ref(),
            );
            apply_custom_http_headers(request, headers)?
                .send()
                .map_err(|second_err| {
                    format!(
                        "AI 图片上传失败：{}；无代理直连重试也失败：{}",
                        first_err, second_err
                    )
                })?
        }
    };

    let status = response.status();
    let request_id = ai_response_request_id(&response);
    let text = response.text().map_err(|e| e.to_string())?;
    log_ai_image_request(
        options.trace.as_ref(),
        &status.as_u16().to_string(),
        &request_id,
        started_at.elapsed(),
        text.len(),
    );
    if status.is_success() {
        Ok(text)
    } else {
        Err(format!(
            "AI 图片上传失败，HTTP {}：{}",
            status,
            redact_ai_secrets(&text, api_key, headers)
        ))
    }
}

fn canvas_request_profile(
    app_handle: &tauri::AppHandle,
    provider: Option<String>,
    gateway_kind: Option<license::types::AiGatewayKind>,
    base_url: &str,
    api_key: &str,
    model: &str,
    headers: Option<BTreeMap<String, String>>,
) -> Result<ai_credentials::EffectiveApiProfile, String> {
    let provider = provider.unwrap_or_else(|| "canvas-ai".to_string());
    let headers = headers.unwrap_or_default();
    let gateway_kind = gateway_kind
        .unwrap_or_else(|| license::types::AiGatewayKind::infer(&provider, base_url, &headers));
    let profile = ai_credentials::resolve_effective_canvas_api_profile(
        app_handle,
        ai_credentials::StoredApiSettings {
            gateway_kind: Some(gateway_kind),
            provider: provider.clone(),
            base_url: base_url.to_string(),
            api_key: api_key.to_string(),
            model: model.to_string(),
            headers: headers.clone(),
        },
    )?;
    if is_license_managed_profile(&profile) {
        let redacted_base = ai_gateway::endpoint::redact_api_base_url(&profile.base_url);
        let same_managed_origin = ai_gateway::endpoint::same_origin(base_url, &profile.base_url)
            || base_url.trim().trim_end_matches('/') == redacted_base;
        if !api_key.trim().is_empty()
            || !headers.is_empty()
            || (!base_url.trim().is_empty() && !same_managed_origin)
            || (!model.trim().is_empty() && model.trim() != profile.model.trim())
            || gateway_kind != profile.gateway_kind
            || (!provider.trim().is_empty() && provider.trim() != profile.provider.trim())
        {
            return Err(
                "高级版授权已托管 Canvas API，不能覆盖 Gateway、Base URL、API Key、模型或 Headers"
                    .to_string(),
            );
        }
    }
    Ok(profile)
}

fn is_license_managed_profile(profile: &ai_credentials::EffectiveApiProfile) -> bool {
    profile.source == "license_managed"
}

fn rewrite_canvas_ai_url(
    original_url: &str,
    profile: &ai_credentials::EffectiveApiProfile,
) -> String {
    ai_gateway::router::route_existing_url(profile, original_url)
        .unwrap_or_else(|_| original_url.to_string())
}

fn apply_canvas_managed_model(
    mut body: serde_json::Value,
    profile: &ai_credentials::EffectiveApiProfile,
) -> serde_json::Value {
    if is_license_managed_profile(profile)
        && profile.gateway_kind != license::types::AiGatewayKind::Xais
        && !profile.model.trim().is_empty()
    {
        if let Some(object) = body.as_object_mut() {
            if object.contains_key("model") {
                object.insert(
                    "model".to_string(),
                    serde_json::Value::String(profile.model.clone()),
                );
            }
        }
    }
    body
}

#[tauri::command]
async fn post_ai_json(
    app_handle: tauri::AppHandle,
    url: String,
    api_key: String,
    body: serde_json::Value,
    proxy: Option<String>,
    provider: Option<String>,
    gateway_kind: Option<license::types::AiGatewayKind>,
    model: Option<String>,
    headers: Option<BTreeMap<String, String>>,
    client_request_id: Option<String>,
    endpoint_protocol: Option<String>,
    reference_host: Option<String>,
    reference_ready_duration_ms: Option<u64>,
    is_first_request: Option<bool>,
    single_attempt: Option<bool>,
    timeout_secs: Option<u64>,
) -> Result<serde_json::Value, String> {
    let fallback_model = model
        .or_else(|| {
            body.get("model")
                .and_then(|value| value.as_str())
                .map(str::to_string)
        })
        .unwrap_or_default();
    let profile = canvas_request_profile(
        &app_handle,
        provider,
        gateway_kind,
        &url,
        &api_key,
        &fallback_model,
        headers,
    )?;
    let request_url = rewrite_canvas_ai_url(&url, &profile);
    let request_key = profile.api_key.clone();
    let request_headers = profile.headers.clone();
    let body = apply_canvas_managed_model(body, &profile);
    let request_options = build_ai_http_request_options(
        &fallback_model,
        single_attempt,
        timeout_secs,
        client_request_id,
        endpoint_protocol,
        reference_host,
        reference_ready_duration_ms,
        is_first_request,
    );
    tauri::async_runtime::spawn_blocking(move || {
        if request_key.trim().is_empty() {
            return Err("请先填写 API Key".to_string());
        }
        let raw = http_post_json_with_headers(
            &app_handle,
            &request_url,
            &request_key,
            &body,
            proxy.as_deref().filter(|value| !value.trim().is_empty()),
            Some(&request_headers),
            &request_options,
        )?;
        serde_json::from_str(&raw).map_err(|e| {
            format!(
                "AI 响应 JSON 解析失败：{}；原始返回：{}",
                e,
                redact_ai_secrets(&raw, &request_key, Some(&request_headers))
            )
        })
    })
    .await
    .map_err(|e| format!("AI 请求任务失败：{}", e))?
}

#[tauri::command]
async fn post_ai_text(
    app_handle: tauri::AppHandle,
    url: String,
    api_key: String,
    body: serde_json::Value,
    proxy: Option<String>,
    provider: Option<String>,
    gateway_kind: Option<license::types::AiGatewayKind>,
    model: Option<String>,
    headers: Option<BTreeMap<String, String>>,
) -> Result<String, String> {
    let fallback_model = model
        .or_else(|| {
            body.get("model")
                .and_then(|value| value.as_str())
                .map(str::to_string)
        })
        .unwrap_or_default();
    let profile = canvas_request_profile(
        &app_handle,
        provider,
        gateway_kind,
        &url,
        &api_key,
        &fallback_model,
        headers,
    )?;
    let request_url = rewrite_canvas_ai_url(&url, &profile);
    let request_key = profile.api_key.clone();
    let request_headers = profile.headers.clone();
    let body = apply_canvas_managed_model(body, &profile);
    tauri::async_runtime::spawn_blocking(move || {
        if request_key.trim().is_empty() {
            return Err("请先填写 API Key".to_string());
        }
        http_post_json_with_headers(
            &app_handle,
            &request_url,
            &request_key,
            &body,
            proxy.as_deref().filter(|value| !value.trim().is_empty()),
            Some(&request_headers),
            &AiHttpRequestOptions::default(),
        )
    })
    .await
    .map_err(|e| format!("AI 请求任务失败：{}", e))?
}

#[tauri::command]
async fn post_ai_image_edit(
    app_handle: tauri::AppHandle,
    url: String,
    api_key: String,
    model: String,
    prompt: String,
    n: u32,
    size: Option<String>,
    quality: Option<String>,
    response_format: Option<String>,
    aspect_ratio: Option<String>,
    output_resolution: Option<String>,
    image_size: Option<String>,
    output_format: Option<String>,
    background: Option<String>,
    images: Vec<String>,
    async_task: Option<bool>,
    stream: Option<bool>,
    repeat_image_field: Option<bool>,
    proxy: Option<String>,
    provider: Option<String>,
    gateway_kind: Option<license::types::AiGatewayKind>,
    headers: Option<BTreeMap<String, String>>,
    client_request_id: Option<String>,
    endpoint_protocol: Option<String>,
    reference_host: Option<String>,
    reference_ready_duration_ms: Option<u64>,
    is_first_request: Option<bool>,
    single_attempt: Option<bool>,
    timeout_secs: Option<u64>,
) -> Result<serde_json::Value, String> {
    let profile = canvas_request_profile(
        &app_handle,
        provider,
        gateway_kind,
        &url,
        &api_key,
        &model,
        headers,
    )?;
    let request_url = rewrite_canvas_ai_url(&url, &profile);
    let request_key = profile.api_key.clone();
    let request_headers = profile.headers.clone();
    let model = if is_license_managed_profile(&profile)
        && profile.gateway_kind != license::types::AiGatewayKind::Xais
        && !profile.model.trim().is_empty()
    {
        profile.model.clone()
    } else {
        model
    };
    let request_options = build_ai_http_request_options(
        &model,
        single_attempt,
        timeout_secs,
        client_request_id,
        endpoint_protocol,
        reference_host,
        reference_ready_duration_ms,
        is_first_request,
    );
    tauri::async_runtime::spawn_blocking(move || {
        if request_key.trim().is_empty() {
            return Err("请先填写 API Key".to_string());
        }
        let raw = http_post_image_edit_with_headers(
            &app_handle,
            &request_url,
            &request_key,
            &model,
            &prompt,
            n,
            size.as_deref(),
            quality.as_deref(),
            response_format.as_deref(),
            aspect_ratio.as_deref(),
            output_resolution.as_deref(),
            image_size.as_deref(),
            output_format.as_deref(),
            background.as_deref(),
            &images,
            async_task,
            stream,
            repeat_image_field.unwrap_or(false),
            proxy.as_deref().filter(|value| !value.trim().is_empty()),
            Some(&request_headers),
            &request_options,
        )?;
        serde_json::from_str(&raw).map_err(|e| {
            format!(
                "AI 图片响应 JSON 解析失败：{}；原始返回：{}",
                e,
                redact_ai_secrets(&raw, &request_key, Some(&request_headers))
            )
        })
    })
    .await
    .map_err(|e| format!("AI 图片上传任务失败：{}", e))?
}

#[tauri::command]
async fn upload_xais_reference_images(
    app_handle: tauri::AppHandle,
    endpoint: String,
    api_key: String,
    sources: Vec<String>,
    proxy: Option<String>,
    provider: Option<String>,
    gateway_kind: Option<license::types::AiGatewayKind>,
    model: Option<String>,
    headers: Option<BTreeMap<String, String>>,
) -> Result<Vec<String>, String> {
    let profile = canvas_request_profile(
        &app_handle,
        provider.or_else(|| Some("xais-chat".to_string())),
        gateway_kind,
        &endpoint,
        &api_key,
        model.as_deref().unwrap_or(""),
        headers,
    )?;
    tauri::async_runtime::spawn_blocking(move || {
        if profile.api_key.trim().is_empty() {
            return Err("Please enter XAIS API Key first.".to_string());
        }
        let clean_sources: Vec<String> = sources
            .into_iter()
            .map(|source| source.trim().to_string())
            .filter(|source| !source.is_empty())
            .take(8)
            .collect();
        if clean_sources.is_empty() {
            return Ok(Vec::new());
        }
        let explicit_proxy = proxy
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .map(str::to_string);
        thread::scope(|scope| {
            let handles = clean_sources
                .into_iter()
                .map(|source| {
                    let app_handle = &app_handle;
                    let profile = &profile;
                    let explicit_proxy = explicit_proxy.as_deref();
                    scope.spawn(move || {
                        xais_upload_reference_image(app_handle, profile, &source, explicit_proxy)
                    })
                })
                .collect::<Vec<_>>();

            handles
                .into_iter()
                .map(|handle| {
                    handle
                        .join()
                        .map_err(|_| "XAIS reference image upload worker panicked".to_string())?
                })
                .collect::<Result<Vec<_>, _>>()
        })
    })
    .await
    .map_err(|e| format!("XAIS reference image upload task failed: {}", e))?
}

#[tauri::command]
async fn get_ai_json(
    app_handle: tauri::AppHandle,
    url: String,
    api_key: String,
    proxy: Option<String>,
    provider: Option<String>,
    gateway_kind: Option<license::types::AiGatewayKind>,
    model: Option<String>,
    headers: Option<BTreeMap<String, String>>,
) -> Result<serde_json::Value, String> {
    let profile = canvas_request_profile(
        &app_handle,
        provider,
        gateway_kind,
        &url,
        &api_key,
        model.as_deref().unwrap_or(""),
        headers,
    )?;
    let request_url = rewrite_canvas_ai_url(&url, &profile);
    let request_key = profile.api_key.clone();
    let request_headers = profile.headers.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if request_key.trim().is_empty() {
            return Err("Please enter API Key first.".to_string());
        }
        let raw = http_get_text_with_headers(
            &app_handle,
            &request_url,
            &request_key,
            proxy.as_deref().filter(|value| !value.trim().is_empty()),
            Some(&request_headers),
        )?;
        serde_json::from_str(&raw).map_err(|e| {
            format!(
                "AI response JSON parse failed: {}; raw response: {}",
                e,
                redact_ai_secrets(&raw, &request_key, Some(&request_headers))
            )
        })
    })
    .await
    .map_err(|e| format!("AI GET request task failed: {}", e))?
}

#[tauri::command]
async fn get_ai_text(
    app_handle: tauri::AppHandle,
    url: String,
    api_key: String,
    proxy: Option<String>,
    provider: Option<String>,
    gateway_kind: Option<license::types::AiGatewayKind>,
    model: Option<String>,
    headers: Option<BTreeMap<String, String>>,
) -> Result<String, String> {
    let profile = canvas_request_profile(
        &app_handle,
        provider,
        gateway_kind,
        &url,
        &api_key,
        model.as_deref().unwrap_or(""),
        headers,
    )?;
    let request_url = rewrite_canvas_ai_url(&url, &profile);
    let request_key = profile.api_key.clone();
    let request_headers = profile.headers.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if request_key.trim().is_empty() {
            return Err("Please enter API Key first.".to_string());
        }
        http_get_text_with_headers(
            &app_handle,
            &request_url,
            &request_key,
            proxy.as_deref().filter(|value| !value.trim().is_empty()),
            Some(&request_headers),
        )
    })
    .await
    .map_err(|e| format!("AI GET request task failed: {}", e))?
}

#[tauri::command]
async fn get_ai_image_content(
    app_handle: tauri::AppHandle,
    url: String,
    api_key: String,
    proxy: Option<String>,
    provider: Option<String>,
    gateway_kind: Option<license::types::AiGatewayKind>,
    model: Option<String>,
    headers: Option<BTreeMap<String, String>>,
) -> Result<String, String> {
    let profile = canvas_request_profile(
        &app_handle,
        provider,
        gateway_kind,
        &url,
        &api_key,
        model.as_deref().unwrap_or(""),
        headers,
    )?;
    let request_url = rewrite_canvas_ai_url(&url, &profile);
    let request_key = profile.api_key.clone();
    let request_headers = profile.headers.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if request_key.trim().is_empty() {
            return Err("Please enter API Key first.".to_string());
        }
        http_get_image_content_with_headers(
            &app_handle,
            &request_url,
            &request_key,
            proxy.as_deref().filter(|value| !value.trim().is_empty()),
            Some(&request_headers),
        )
    })
    .await
    .map_err(|e| format!("AI image content GET task failed: {e}"))?
}

#[tauri::command]
fn path_kind(path: String) -> Result<String, String> {
    let normalized = local_path_from_url_like(&path).unwrap_or_else(|| PathBuf::from(path));
    if normalized.is_dir() {
        Ok("directory".to_string())
    } else if normalized.is_file() {
        Ok("file".to_string())
    } else {
        Ok("missing".to_string())
    }
}

fn is_supported_drop_media_path(path: &Path) -> bool {
    matches!(
        local_file_extension(path).as_str(),
        "png"
            | "jpg"
            | "jpeg"
            | "webp"
            | "gif"
            | "bmp"
            | "avif"
            | "svg"
            | "mp4"
            | "mov"
            | "avi"
            | "mkv"
            | "webm"
            | "m4v"
    )
}

fn collect_media_paths_recursive(path: &Path, output: &mut Vec<String>) -> Result<(), String> {
    if path.is_file() {
        if is_supported_drop_media_path(path) {
            output.push(path.to_string_lossy().to_string());
        }
        return Ok(());
    }
    if !path.is_dir() {
        return Ok(());
    }
    let entries = fs::read_dir(path).map_err(|err| err.to_string())?;
    for entry in entries.flatten() {
        collect_media_paths_recursive(&entry.path(), output)?;
    }
    Ok(())
}

#[tauri::command]
fn collect_drop_media_paths(paths: Vec<String>) -> Result<Vec<String>, String> {
    let mut output = Vec::new();
    let mut seen = HashSet::new();
    for value in paths {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            continue;
        }
        collect_media_paths_recursive(Path::new(trimmed), &mut output)?;
    }
    output.retain(|path| seen.insert(path.to_ascii_lowercase()));
    Ok(output)
}

const MAX_CANVAS_TEMPLATE_JSON_BYTES: u64 = 128 * 1024 * 1024;
const MAX_CANVAS_TEMPLATE_EMBEDDED_IMAGE_CHARS: usize = 96 * 1024 * 1024;

fn is_canvas_template_embedded_image(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.starts_with("data:image/")
        && trimmed
            .split_once(',')
            .is_some_and(|(metadata, payload)| metadata.ends_with(";base64") && !payload.is_empty())
}

fn canvas_template_embedded_image_extension(data_url: &str) -> &'static str {
    let mime = data_url
        .trim()
        .strip_prefix("data:image/")
        .and_then(|value| value.split_once(';'))
        .map(|(mime, _)| mime.to_ascii_lowercase())
        .unwrap_or_default();
    match mime.as_str() {
        "jpeg" | "jpg" => "jpg",
        "webp" => "webp",
        "gif" => "gif",
        "bmp" | "x-ms-bmp" => "bmp",
        "svg+xml" => "svg",
        _ => "png",
    }
}

fn canvas_template_embedded_image_file_name(
    node: &serde_json::Map<String, serde_json::Value>,
    item: &serde_json::Map<String, serde_json::Value>,
    data_url: &str,
) -> String {
    let raw_name = item
        .get("name")
        .and_then(serde_json::Value::as_str)
        .or_else(|| item.get("content").and_then(serde_json::Value::as_str))
        .or_else(|| node.get("id").and_then(serde_json::Value::as_str))
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("workflow-reference");
    let safe_name = sanitize_file_name(raw_name);
    let stem = Path::new(&safe_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("workflow-reference");
    format!(
        "{}.{}",
        sanitize_file_name(stem),
        canvas_template_embedded_image_extension(data_url)
    )
}

fn materialize_canvas_template_embedded_images<F>(
    value: &mut serde_json::Value,
    save_image: &mut F,
) -> Result<usize, String>
where
    F: FnMut(&str, &str) -> Result<String, String>,
{
    let mut restored = 0usize;
    match value {
        serde_json::Value::Array(values) => {
            for value in values {
                restored += materialize_canvas_template_embedded_images(value, save_image)?;
            }
        }
        serde_json::Value::Object(record) => {
            let is_fixed_image_node = record
                .get("item")
                .and_then(serde_json::Value::as_object)
                .and_then(|item| item.get("type"))
                .and_then(serde_json::Value::as_str)
                .is_some_and(|value| value == "image")
                && record
                    .get("acceptsExternalInputs")
                    .and_then(serde_json::Value::as_bool)
                    != Some(true)
                && record.get("bridgeType").and_then(serde_json::Value::as_str)
                    != Some("reference_image")
                && (record
                    .get("fixedInput")
                    .and_then(serde_json::Value::as_bool)
                    == Some(true)
                    || record.get("ai").is_none()
                    || record.get("ai").is_some_and(serde_json::Value::is_null));

            if is_fixed_image_node {
                let embedded_key = record
                    .get("item")
                    .and_then(serde_json::Value::as_object)
                    .and_then(|item| {
                        ["url", "path", "sourceUrl", "originalUrl", "thumbnail"]
                            .into_iter()
                            .find(|key| {
                                item.get(*key)
                                    .and_then(serde_json::Value::as_str)
                                    .is_some_and(is_canvas_template_embedded_image)
                            })
                    });

                if let Some(embedded_key) = embedded_key {
                    let file_name = {
                        let item = record
                            .get("item")
                            .and_then(serde_json::Value::as_object)
                            .ok_or_else(|| "工作流固定参考图数据无效".to_string())?;
                        let data_url = item
                            .get(embedded_key)
                            .and_then(serde_json::Value::as_str)
                            .ok_or_else(|| "工作流固定参考图数据无效".to_string())?;
                        if data_url.len() > MAX_CANVAS_TEMPLATE_EMBEDDED_IMAGE_CHARS {
                            return Err("单张工作流内嵌图片过大，不能超过 96 MB".to_string());
                        }
                        canvas_template_embedded_image_file_name(record, item, data_url)
                    };

                    let data_url = record
                        .get_mut("item")
                        .and_then(serde_json::Value::as_object_mut)
                        .and_then(|item| item.remove(embedded_key))
                        .and_then(|value| match value {
                            serde_json::Value::String(value) => Some(value),
                            _ => None,
                        })
                        .ok_or_else(|| "工作流固定参考图数据无效".to_string())?;
                    let path = save_image(&file_name, &data_url)?;
                    let item = record
                        .get_mut("item")
                        .and_then(serde_json::Value::as_object_mut)
                        .ok_or_else(|| "工作流固定参考图数据无效".to_string())?;
                    for key in ["url", "path", "sourceUrl", "originalUrl", "thumbnail"] {
                        item.remove(key);
                    }
                    item.insert("path".to_string(), serde_json::Value::String(path));
                    restored += 1;
                }
            }

            for child in record.values_mut() {
                restored += materialize_canvas_template_embedded_images(child, save_image)?;
            }
        }
        _ => {}
    }
    Ok(restored)
}

#[tauri::command]
async fn read_canvas_template_json(
    app_handle: tauri::AppHandle,
    path: String,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        read_canvas_template_json_impl(&app_handle, path)
    })
    .await
    .map_err(|error| format!("读取画布模板任务失败：{}", error))?
}

fn read_canvas_template_json_impl(
    app_handle: &tauri::AppHandle,
    path: String,
) -> Result<serde_json::Value, String> {
    let normalized = local_path_from_url_like(&path).unwrap_or_else(|| PathBuf::from(&path));
    if !normalized.is_file() {
        return Err("画布模板 JSON 文件不存在".to_string());
    }
    let is_json = normalized
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.eq_ignore_ascii_case("json"))
        .unwrap_or(false);
    if !is_json {
        return Err("画布模板文件必须是 JSON 格式".to_string());
    }
    let metadata = fs::metadata(&normalized).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_CANVAS_TEMPLATE_JSON_BYTES {
        return Err("画布模板 JSON 文件不能超过 128 MB".to_string());
    }
    let file =
        File::open(&normalized).map_err(|error| format!("读取画布模板 JSON 失败：{}", error))?;
    let mut parsed: serde_json::Value = serde_json::from_reader(BufReader::new(file))
        .map_err(|error| format!("解析画布模板 JSON 失败：{}", error))?;
    materialize_canvas_template_embedded_images(&mut parsed, &mut |file_name, data_url| {
        save_dropped_data_url_impl(app_handle, file_name, data_url)
    })?;
    Ok(parsed)
}

#[cfg(test)]
mod canvas_template_import_tests {
    use super::*;

    #[test]
    fn file_hashing_does_not_require_a_megabyte_of_thread_stack() {
        let path = std::env::temp_dir().join(format!(
            "inspiration-drawer-small-stack-hash-{}-{}.bin",
            std::process::id(),
            current_time_millis()
        ));
        let bytes = vec![42u8; 2 * 1024 * 1024];
        fs::write(&path, &bytes).unwrap();
        let thread_path = path.clone();

        let hash = std::thread::Builder::new()
            .name("small-stack-file-hash".to_string())
            .stack_size(512 * 1024)
            .spawn(move || sha256_file_upper(&thread_path))
            .unwrap()
            .join()
            .unwrap()
            .unwrap();

        assert_eq!(hash, sha256_bytes_upper(&bytes));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn materializes_embedded_fixed_images_before_returning_json_to_the_webview() {
        let mut value = serde_json::json!({
            "workflows": [{
                "label": "带图工作流",
                "nodes": [
                    {
                        "id": "master",
                        "fixedInput": true,
                        "item": {
                            "type": "image",
                            "name": "母版.png",
                            "url": "data:image/jpeg;base64,ZmFrZQ=="
                        }
                    },
                    {
                        "id": "external",
                        "fixedInput": false,
                        "acceptsExternalInputs": true,
                        "bridgeType": "reference_image",
                        "item": {
                            "type": "image",
                            "url": "data:image/png;base64,ZXh0ZXJuYWw="
                        }
                    }
                ]
            }]
        });
        let mut saved = Vec::new();

        let restored =
            materialize_canvas_template_embedded_images(&mut value, &mut |file_name, data_url| {
                saved.push((file_name.to_string(), data_url.to_string()));
                Ok(r"C:\cache\master.jpg".to_string())
            })
            .unwrap();

        assert_eq!(restored, 1);
        assert_eq!(saved.len(), 1);
        assert_eq!(saved[0].0, "母版.jpg");
        assert_eq!(
            value["workflows"][0]["nodes"][0]["item"]["path"],
            r"C:\cache\master.jpg"
        );
        assert!(value["workflows"][0]["nodes"][0]["item"]
            .get("url")
            .is_none());
        assert_eq!(
            value["workflows"][0]["nodes"][1]["item"]["url"],
            "data:image/png;base64,ZXh0ZXJuYWw="
        );
    }

    #[test]
    fn strips_large_embedded_image_payloads_before_webview_serialization() {
        let payload = "A".repeat(5 * 1024 * 1024);
        let mut value = serde_json::json!({
            "workflow": {
                "label": "大图工作流",
                "nodes": [{
                    "id": "master",
                    "fixedInput": true,
                    "item": {
                        "type": "image",
                        "url": format!("data:image/png;base64,{payload}")
                    }
                }]
            }
        });
        assert!(serde_json::to_vec(&value).unwrap().len() > 4 * 1024 * 1024);

        let restored = materialize_canvas_template_embedded_images(
            &mut value,
            &mut |_, _| Ok(r"C:\cache\large-master.png".to_string()),
        )
        .unwrap();

        assert_eq!(restored, 1);
        assert!(serde_json::to_vec(&value).unwrap().len() < 1024);
        assert_eq!(
            value["workflow"]["nodes"][0]["item"]["path"],
            r"C:\cache\large-master.png"
        );
    }
}

fn local_media_metadata_impl(path: String) -> Result<LocalMediaMetadata, String> {
    let normalized = local_path_from_url_like(&path).unwrap_or_else(|| PathBuf::from(&path));
    if !normalized.is_file() {
        return Err("not a local file".to_string());
    }
    let resolved = normalized
        .canonicalize()
        .unwrap_or_else(|_| normalized.clone());
    let metadata = fs::metadata(&resolved).map_err(|e| e.to_string())?;
    let size = metadata.len();
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or(0);

    let mut file = File::open(&resolved).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    hasher.update(b"inspiration-drawer-fast-fingerprint-v1");
    hasher.update(size.to_le_bytes());
    hasher.update(modified_at.to_le_bytes());

    let mut head = vec![0u8; 64 * 1024];
    let head_len = file.read(&mut head).map_err(|e| e.to_string())?;
    hasher.update(&head[..head_len]);

    if size > 128 * 1024 {
        use std::io::Seek;
        use std::io::SeekFrom;
        let tail_start = size.saturating_sub(64 * 1024);
        file.seek(SeekFrom::Start(tail_start))
            .map_err(|e| e.to_string())?;
        let mut tail = vec![0u8; 64 * 1024];
        let tail_len = file.read(&mut tail).map_err(|e| e.to_string())?;
        hasher.update(&tail[..tail_len]);
    }

    Ok(LocalMediaMetadata {
        path: resolved.to_string_lossy().to_string(),
        size,
        modified_at,
        fingerprint: hex::encode(hasher.finalize()),
    })
}

#[tauri::command]
async fn get_local_media_metadata(path: String) -> Result<LocalMediaMetadata, String> {
    tauri::async_runtime::spawn_blocking(move || local_media_metadata_impl(path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn delete_local_file(path: String) -> Result<bool, String> {
    let normalized = local_path_from_url_like(&path).unwrap_or_else(|| PathBuf::from(&path));
    if !normalized.exists() {
        return Ok(false);
    }
    if !normalized.is_file() {
        return Err(format!(
            "不是可删除的文件：{}",
            normalized.to_string_lossy()
        ));
    }
    let resolved = fs::canonicalize(&normalized).unwrap_or_else(|_| normalized.clone());
    fs::remove_file(&resolved).map_err(|e| format!("删除本地文件失败：{}", e))?;
    Ok(true)
}

#[tauri::command]
fn show_in_folder(path: String) -> Result<(), String> {
    let normalized = local_path_from_url_like(&path).unwrap_or_else(|| PathBuf::from(&path));

    if !normalized.exists() {
        return Err(format!("文件位置不存在：{}", normalized.to_string_lossy()));
    }

    let resolved = fs::canonicalize(&normalized).unwrap_or_else(|_| normalized.clone());

    // /select 在部分 Windows 环境下会让 Explorer 解析失败，失败时它会回退到“文档”或“桌面”。
    // 稳定优先：文件打开它的真实父目录；文件夹打开它本身。
    let target_dir = if resolved.is_dir() {
        resolved.clone()
    } else {
        resolved
            .parent()
            .ok_or_else(|| "cannot resolve containing folder".to_string())?
            .to_path_buf()
    };

    if !target_dir.exists() {
        return Err(format!("文件夹不存在：{}", target_dir.to_string_lossy()));
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg(&target_dir)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        if resolved.is_dir() {
            std::process::Command::new("open")
                .arg(&target_dir)
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            std::process::Command::new("open")
                .arg("-R")
                .arg(&resolved)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    #[cfg(target_os = "linux")]
    {
        open::that(target_dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn copy_local_file(src: String, dest: String) -> Result<(), String> {
    std::fs::copy(src, dest)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

fn local_file_extension(path: &Path) -> String {
    path.extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
}

fn find_identical_file_in_dir(
    source: &Path,
    target_dir: &Path,
    excluded_path: Option<&Path>,
) -> Result<Option<PathBuf>, String> {
    let source_metadata = fs::metadata(source).map_err(|e| e.to_string())?;
    let source_len = source_metadata.len();
    let source_ext = local_file_extension(source);
    let source_canon = source
        .canonicalize()
        .unwrap_or_else(|_| source.to_path_buf());
    let excluded_canon =
        excluded_path.map(|path| path.canonicalize().unwrap_or_else(|_| path.to_path_buf()));
    let mut source_hash: Option<String> = None;

    let entries = fs::read_dir(target_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let candidate = entry.path();
        if !candidate.is_file() || local_file_extension(&candidate) != source_ext {
            continue;
        }
        let candidate_canon = candidate
            .canonicalize()
            .unwrap_or_else(|_| candidate.clone());
        if candidate_canon == source_canon
            || excluded_canon
                .as_ref()
                .is_some_and(|excluded| excluded == &candidate_canon)
        {
            continue;
        }
        let Ok(candidate_metadata) = fs::metadata(&candidate_canon) else {
            continue;
        };
        if candidate_metadata.len() != source_len {
            continue;
        }
        if source_hash.is_none() {
            source_hash = Some(sha256_file_upper(&source_canon)?);
        }
        let source_hash = source_hash.as_deref().unwrap_or_default();
        if sha256_file_upper(&candidate_canon)
            .map(|candidate_hash| candidate_hash == source_hash)
            .unwrap_or(false)
        {
            return Ok(Some(candidate_canon));
        }
    }

    Ok(None)
}

fn find_identical_bytes_in_dir(
    bytes: &[u8],
    extension: &str,
    target_dir: &Path,
) -> Result<Option<PathBuf>, String> {
    let normalized_ext = extension
        .trim()
        .trim_start_matches('.')
        .to_ascii_lowercase();
    let source_hash = hex::encode(Sha256::digest(bytes)).to_ascii_uppercase();
    let entries = fs::read_dir(target_dir).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let candidate = entry.path();
        if !candidate.is_file() || local_file_extension(&candidate) != normalized_ext {
            continue;
        }
        let Ok(metadata) = fs::metadata(&candidate) else {
            continue;
        };
        if metadata.len() != bytes.len() as u64 {
            continue;
        }
        if sha256_file_upper(&candidate)
            .map(|candidate_hash| candidate_hash == source_hash)
            .unwrap_or(false)
        {
            return Ok(Some(candidate.canonicalize().unwrap_or(candidate)));
        }
    }

    Ok(None)
}

#[tauri::command]
async fn cache_local_file_to_dir(
    app_handle: tauri::AppHandle,
    path: String,
    dir: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        cache_local_file_to_dir_impl(app_handle, path, dir)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn cache_local_file_to_dir_impl(
    app_handle: tauri::AppHandle,
    path: String,
    dir: Option<String>,
) -> Result<String, String> {
    let source = local_path_from_url_like(&path).unwrap_or_else(|| PathBuf::from(&path));
    if !source.is_file() {
        return Ok(path);
    }

    let source_canon = source.canonicalize().unwrap_or_else(|_| source.clone());
    let target_dir_raw = dir
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| normalize_web_image_cache_dir(&app_handle, value))
        .unwrap_or_else(|| read_web_image_cache_dir(&app_handle));

    fs::create_dir_all(&target_dir_raw).map_err(|e| e.to_string())?;
    let target_dir = target_dir_raw
        .canonicalize()
        .unwrap_or_else(|_| target_dir_raw.clone());

    if source_canon.starts_with(&target_dir) {
        return Ok(display_local_path(&source_canon));
    }

    let _cache_guard = local_media_cache_write_lock()
        .lock()
        .map_err(|_| "local media cache lock poisoned".to_string())?;
    if let Some(existing) = find_identical_file_in_dir(&source_canon, &target_dir, None)? {
        return Ok(display_local_path(&existing));
    }

    let file_name = source_canon
        .file_name()
        .and_then(|value| value.to_str())
        .map(|value| sanitize_file_name(value))
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| format!("local_file_{}", now_millis_u128()));

    let target = unique_file_path(target_dir.join(file_name));

    fs::copy(&source_canon, &target).map_err(|e| e.to_string())?;
    Ok(display_local_path(&target))
}

fn is_allowed_eagle_api_url(url: &str) -> bool {
    url.trim().starts_with("http://127.0.0.1:41595/api/")
}

#[tauri::command]
async fn eagle_api_get(url: String) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let trimmed = url.trim();
        if !is_allowed_eagle_api_url(trimmed) {
            return Err("Eagle API 只允许访问本机 127.0.0.1:41595".to_string());
        }

        let client = Client::builder()
            .user_agent(APP_USER_AGENT)
            .connect_timeout(Duration::from_millis(1500))
            .timeout(Duration::from_millis(1500))
            .redirect(Policy::none())
            .build()
            .map_err(|e| e.to_string())?;

        let response = client
            .get(trimmed)
            .send()
            .map_err(|e| format!("连接 Eagle 本地 API 失败：{}", e))?;
        let status = response.status();
        if !status.is_success() {
            return Err(format!("Eagle API 返回 HTTP {}", status.as_u16()));
        }
        response
            .json::<serde_json::Value>()
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn eagle_probe_port() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let address = "127.0.0.1:41595"
            .parse()
            .map_err(|error| format!("Eagle 端口地址无效：{}", error))?;
        Ok(TcpStream::connect_timeout(&address, Duration::from_millis(1500)).is_ok())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
async fn eagle_probe_process() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(target_os = "windows")]
        {
            let mut command = SysCommand::new("tasklist.exe");
            hide_console_window(&mut command);
            let output = command
                .args(["/FI", "IMAGENAME eq Eagle.exe", "/FO", "CSV", "/NH"])
                .output()
                .map_err(|error| format!("检测 Eagle 进程失败：{}", error))?;
            let text = String::from_utf8_lossy(&output.stdout).to_ascii_lowercase();
            return Ok(output.status.success() && text.contains("eagle.exe"));
        }
        #[cfg(not(target_os = "windows"))]
        {
            let output = SysCommand::new("pgrep")
                .args(["-x", "Eagle"])
                .output()
                .map_err(|error| format!("检测 Eagle 进程失败：{}", error))?;
            Ok(output.status.success())
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

fn read_eagle_json(path: &Path) -> Option<serde_json::Value> {
    fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
}

fn eagle_offline_item_file(info_dir: &Path, metadata: &serde_json::Value) -> Option<PathBuf> {
    let name = metadata
        .get("name")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("");
    let ext = metadata
        .get("ext")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("");
    if !name.is_empty() && !ext.is_empty() {
        let preferred = info_dir.join(format!("{}.{}", name, ext.trim_start_matches('.')));
        if preferred.is_file() {
            return Some(preferred);
        }
    }

    fs::read_dir(info_dir)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .find(|path| {
            if !path.is_file() {
                return false;
            }
            let file_name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            file_name != "metadata.json"
                && !file_name.contains("thumbnail")
                && !file_name.contains("preview")
        })
}

fn eagle_offline_thumbnail_file(info_dir: &Path) -> Option<PathBuf> {
    fs::read_dir(info_dir)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .find(|path| {
            if !path.is_file() {
                return false;
            }
            let file_name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            file_name.contains("thumbnail") || file_name.contains("preview")
        })
}

#[tauri::command]
async fn eagle_read_offline_library(path: String) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let library_path = fs::canonicalize(path.trim())
            .map_err(|error| format!("无法打开 Eagle 资料库：{}", error))?;
        let is_library = library_path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("library"));
        if !is_library || !library_path.is_dir() {
            return Err("请选择以 .library 结尾的 Eagle 资料库目录".to_string());
        }
        let images_dir = library_path.join("images");
        if !images_dir.is_dir() {
            return Err("所选 .library 中没有 images 目录".to_string());
        }

        let library_metadata = read_eagle_json(&library_path.join("metadata.json"))
            .unwrap_or_else(|| serde_json::json!({}));
        let folders = library_metadata
            .get("folders")
            .cloned()
            .unwrap_or_else(|| serde_json::json!([]));
        let mut items = Vec::new();
        for entry in fs::read_dir(&images_dir)
            .map_err(|error| format!("读取 Eagle images 目录失败：{}", error))?
            .filter_map(Result::ok)
        {
            let info_dir = entry.path();
            if !info_dir.is_dir()
                || !info_dir
                    .file_name()
                    .and_then(|value| value.to_str())
                    .is_some_and(|value| value.to_ascii_lowercase().ends_with(".info"))
            {
                continue;
            }
            let Some(mut metadata) = read_eagle_json(&info_dir.join("metadata.json")) else {
                continue;
            };
            let Some(file_path) = eagle_offline_item_file(&info_dir, &metadata) else {
                continue;
            };
            let thumbnail_path = eagle_offline_thumbnail_file(&info_dir);
            let Some(record) = metadata.as_object_mut() else {
                continue;
            };
            if !record.contains_key("id") {
                let id = info_dir
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("")
                    .trim_end_matches(".info")
                    .to_string();
                record.insert("id".to_string(), serde_json::Value::String(id));
            }
            record.insert(
                "filePath".to_string(),
                serde_json::Value::String(display_local_path(&file_path)),
            );
            if let Some(thumbnail_path) = thumbnail_path {
                record.insert(
                    "thumbnailPath".to_string(),
                    serde_json::Value::String(display_local_path(&thumbnail_path)),
                );
            }
            items.push(metadata);
        }

        let library_name = library_metadata
            .get("name")
            .and_then(serde_json::Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .map(str::to_string)
            .or_else(|| {
                library_path
                    .file_stem()
                    .and_then(|value| value.to_str())
                    .map(str::to_string)
            })
            .unwrap_or_else(|| "Eagle Library".to_string());

        Ok(serde_json::json!({
            "library": {
                "name": library_name,
                "path": display_local_path(&library_path),
            },
            "folders": folders,
            "items": items,
        }))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod eagle_import_tests {
    use super::*;

    #[test]
    fn eagle_api_only_allows_loopback_v1_and_v2_paths() {
        assert!(is_allowed_eagle_api_url(
            "http://127.0.0.1:41595/api/v2/app/info"
        ));
        assert!(is_allowed_eagle_api_url(
            "http://127.0.0.1:41595/api/application/info"
        ));
        assert!(!is_allowed_eagle_api_url(
            "http://localhost:41595/api/v2/app/info"
        ));
        assert!(!is_allowed_eagle_api_url(
            "http://127.0.0.1:41596/api/v2/app/info"
        ));
    }

    #[test]
    fn eagle_offline_item_prefers_original_over_thumbnail() {
        let root = std::env::temp_dir().join(format!(
            "inspiration-drawer-eagle-test-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("metadata.json"), "{}").unwrap();
        fs::write(root.join("Product.png"), b"image").unwrap();
        fs::write(root.join("Product_thumbnail.png"), b"thumbnail").unwrap();
        let metadata = serde_json::json!({ "name": "Product", "ext": "png" });

        assert_eq!(
            eagle_offline_item_file(&root, &metadata).unwrap(),
            root.join("Product.png")
        );
        assert_eq!(
            eagle_offline_thumbnail_file(&root).unwrap(),
            root.join("Product_thumbnail.png")
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn scans_a_read_only_eagle_library_directory() {
        let root = std::env::temp_dir().join(format!(
            "inspiration-drawer-eagle-library-test-{}.library",
            std::process::id()
        ));
        let info_dir = root.join("images").join("ITEM-1.info");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&info_dir).unwrap();
        fs::write(
            root.join("metadata.json"),
            r#"{"name":"Design","folders":[{"id":"F1","name":"Products"}]}"#,
        )
        .unwrap();
        fs::write(
            info_dir.join("metadata.json"),
            r#"{"id":"ITEM-1","name":"Wheel","ext":"png","folders":["F1"]}"#,
        )
        .unwrap();
        fs::write(info_dir.join("Wheel.png"), b"image").unwrap();

        let result = tauri::async_runtime::block_on(eagle_read_offline_library(
            root.to_string_lossy().to_string(),
        ))
        .unwrap();
        assert_eq!(
            result
                .pointer("/library/name")
                .and_then(|value| value.as_str()),
            Some("Design")
        );
        assert_eq!(
            result
                .pointer("/items/0/id")
                .and_then(|value| value.as_str()),
            Some("ITEM-1")
        );
        assert!(result
            .pointer("/items/0/filePath")
            .and_then(|value| value.as_str())
            .is_some_and(|value| value.ends_with("Wheel.png")));
        let _ = fs::remove_dir_all(root);
    }

    fn managed_canvas_profile(provider: &str) -> ai_credentials::EffectiveApiProfile {
        ai_credentials::EffectiveApiProfile {
            source: "license_managed".to_string(),
            gateway_kind: license::types::AiGatewayKind::infer(
                provider,
                "https://xais.dchai.cn",
                &BTreeMap::new(),
            ),
            provider: provider.to_string(),
            base_url: "https://xais.dchai.cn".to_string(),
            api_key: "sk-managed".to_string(),
            model: "Xais Nano Pro_2K".to_string(),
            headers: BTreeMap::new(),
            editable: false,
            key_last4: Some("aged".to_string()),
        }
    }

    #[test]
    fn managed_xais_keeps_professional_worker_url() {
        let profile = managed_canvas_profile("xais-chat");
        let url = "https://xais.dchai.cn/xais/workerTaskStart";
        assert_eq!(rewrite_canvas_ai_url(url, &profile), url);
    }

    #[test]
    fn managed_xais_preserves_worker_request_model() {
        let profile = managed_canvas_profile("xais-chat");
        let body = serde_json::json!({
            "model": "nano_banana_pro_2k_0",
            "prompt": "test"
        });
        let next = apply_canvas_managed_model(body, &profile);
        assert_eq!(
            next.get("model").and_then(|value| value.as_str()),
            Some("nano_banana_pro_2k_0")
        );
    }
}

fn display_local_path(path: &std::path::Path) -> String {
    let value = path.to_string_lossy();
    if let Some(rest) = value.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{}", rest)
    } else if let Some(rest) = value.strip_prefix(r"\\?\") {
        rest.to_string()
    } else {
        value.to_string()
    }
}

fn save_item_source_as_impl(
    app_handle: tauri::AppHandle,
    source: String,
    dest: String,
    content: Option<String>,
    item_type: Option<String>,
    feature: Option<String>,
) -> Result<(), String> {
    if let Some(feature) = feature
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        commands::license::require_feature(&app_handle, feature)?;
    }

    let dest_path = PathBuf::from(dest);
    let kind = item_type.unwrap_or_default();

    if kind == "text" {
        fs::write(dest_path, content.unwrap_or_default()).map_err(|e| e.to_string())?;
        return Ok(());
    }

    let input = source.trim();
    if input.is_empty() {
        if let Some(text) = content {
            fs::write(dest_path, text).map_err(|e| e.to_string())?;
            return Ok(());
        }
        return Err("empty source".to_string());
    }

    if input.starts_with("data:") {
        let (_mime, bytes) = decode_data_url(input)?;
        fs::write(dest_path, bytes).map_err(|e| e.to_string())?;
        return Ok(());
    }

    let local = local_path_from_url_like(input).unwrap_or_else(|| PathBuf::from(input));
    if local.exists() && local.is_file() {
        fs::copy(local, dest_path)
            .map(|_| ())
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    if input.starts_with("http://") || input.starts_with("https://") {
        let _ = download_url_to_file(&app_handle, input, &dest_path, None)?;
        return Ok(());
    }

    Err(format!("unsupported source: {}", input))
}

#[tauri::command]
async fn save_item_source_as(
    app_handle: tauri::AppHandle,
    source: String,
    dest: String,
    content: Option<String>,
    item_type: Option<String>,
    feature: Option<String>,
) -> Result<(), String> {
    let source = if is_wallet_ai_image_result_source(source.trim()) {
        let access_token = commands::license::cloud_access_token(&app_handle).await?;
        let resolver_handle = app_handle.clone();
        tauri::async_runtime::spawn_blocking(move || {
            resolve_ai_image_result_url_blocking(&resolver_handle, source.trim(), &access_token)
        })
        .await
        .map_err(|error| error.to_string())??
    } else {
        source
    };
    tauri::async_runtime::spawn_blocking(move || {
        save_item_source_as_impl(app_handle, source, dest, content, item_type, feature)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn sanitize_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();

    let trimmed = cleaned.trim().trim_matches('.').trim();
    if trimmed.is_empty() {
        "dropped_file".to_string()
    } else {
        trimmed.chars().take(120).collect()
    }
}

fn unique_file_path(path: PathBuf) -> PathBuf {
    if !path.exists() {
        return path;
    }

    let parent = path
        .parent()
        .map(|value| value.to_path_buf())
        .unwrap_or_else(std::env::temp_dir);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("local_file")
        .to_string();
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_string());

    for index in 2..1000 {
        let file_name = match &ext {
            Some(ext) if !ext.is_empty() => format!("{}_{}.{}", stem, index, ext),
            _ => format!("{}_{}", stem, index),
        };
        let candidate = parent.join(file_name);
        if !candidate.exists() {
            return candidate;
        }
    }

    path
}

#[tauri::command]
fn save_dropped_file(
    app_handle: tauri::AppHandle,
    file_name: String,
    data_url: String,
) -> Result<String, String> {
    save_dropped_data_url_impl(&app_handle, &file_name, &data_url)
}

fn save_dropped_data_url_impl(
    app_handle: &tauri::AppHandle,
    file_name: &str,
    data_url: &str,
) -> Result<String, String> {
    let comma_index = data_url
        .find(',')
        .ok_or_else(|| "invalid data url".to_string())?;
    let encoded = &data_url[(comma_index + 1)..];

    use base64::{engine::general_purpose, Engine as _};
    let bytes = general_purpose::STANDARD
        .decode(encoded)
        .map_err(|e| e.to_string())?;

    let uploads_dir = get_user_data_dir(&app_handle).join("uploads");
    fs::create_dir_all(&uploads_dir).map_err(|e| e.to_string())?;

    let safe_name = sanitize_file_name(file_name);
    let extension = local_file_extension(Path::new(&safe_name));
    let _cache_guard = local_media_cache_write_lock()
        .lock()
        .map_err(|_| "local media cache lock poisoned".to_string())?;
    if let Some(existing) = find_identical_bytes_in_dir(&bytes, &extension, &uploads_dir)? {
        return Ok(display_local_path(&existing));
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let out_path = uploads_dir.join(format!("{}_{}", stamp, safe_name));

    fs::write(&out_path, bytes).map_err(|e| e.to_string())?;
    Ok(out_path.to_string_lossy().to_string())
}

pub(crate) fn get_user_data_dir(app_handle: &tauri::AppHandle) -> PathBuf {
    let path = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }
    path
}

pub(crate) fn current_time_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(i64::MAX as u128) as i64)
        .unwrap_or(0)
}

pub(crate) fn stable_hash_hex(value: &str) -> String {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn emit_local_vision_model_progress(
    app_handle: &tauri::AppHandle,
    stage: &str,
    message: String,
    file: Option<String>,
    loaded: u64,
    total: u64,
    progress: f64,
) {
    let payload = LocalVisionModelProgress {
        stage: stage.to_string(),
        message,
        file,
        loaded,
        total,
        progress: progress.clamp(0.0, 100.0),
    };
    let _ = app_handle.emit("local-vision-model-progress", payload);
}

#[tauri::command]
fn get_local_vision_model_status(model: Option<String>) -> Result<serde_json::Value, String> {
    let model = normalize_ollama_vision_model(model);
    match read_ollama_model_ready(&model) {
        Ok(true) => Ok(serde_json::json!({
            "ready": true,
            "model": model,
            "progress": 100.0,
        })),
        Ok(false) => Ok(serde_json::json!({
            "ready": false,
            "model": model,
            "progress": 0.0,
        })),
        Err(err) => Err(err),
    }
}

#[tauri::command]
async fn install_ollama_silent(app_handle: tauri::AppHandle) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        emit_local_vision_model_progress(
            &app_handle,
            "installing",
            "正在静默安装 Ollama".to_string(),
            None,
            0,
            100,
            2.0,
        );

        if read_ollama_model_ready(OLLAMA_DEFAULT_VISION_MODEL).is_ok() {
            emit_local_vision_model_progress(
                &app_handle,
                "starting",
                "Ollama 已安装并正在运行".to_string(),
                None,
                100,
                100,
                100.0,
            );
            return Ok(serde_json::json!({ "installed": true, "alreadyRunning": true }));
        }

        if try_spawn_ollama_service().is_ok() {
            thread::sleep(Duration::from_millis(1200));
            if read_ollama_model_ready(OLLAMA_DEFAULT_VISION_MODEL).is_ok() {
                emit_local_vision_model_progress(
                    &app_handle,
                    "starting",
                    "Ollama 已安装并已启动".to_string(),
                    None,
                    100,
                    100,
                    100.0,
                );
                return Ok(serde_json::json!({ "installed": true, "alreadyRunning": false }));
            }
        }

        #[cfg(target_os = "windows")]
        {
            let mut cmd = SysCommand::new("winget");
            hide_console_window(&mut cmd);
            let output = cmd
                .args([
                    "install",
                    "--id",
                    "Ollama.Ollama",
                    "-e",
                    "--silent",
                    "--accept-package-agreements",
                    "--accept-source-agreements",
                    "--disable-interactivity",
                ])
                .stdin(Stdio::null())
                .output()
                .map_err(|e| {
                    format!(
                        "无法启动 winget 静默安装 Ollama：{}。请确认系统已安装 winget，或点击“下载页”手动安装。",
                        e
                    )
                })?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let detail = if stderr.is_empty() { stdout } else { stderr };
                return Err(if detail.is_empty() {
                    "winget 静默安装 Ollama 失败，请打开下载页手动安装。".to_string()
                } else {
                    format!("winget 静默安装 Ollama 失败：{}", detail)
                });
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            return Err("当前仅支持在 Windows 上通过 winget 静默安装 Ollama。".to_string());
        }

        emit_local_vision_model_progress(
            &app_handle,
            "starting",
            "Ollama 已安装，正在启动服务".to_string(),
            None,
            90,
            100,
            90.0,
        );

        wait_for_ollama_service_ready(Duration::from_secs(18))
            .map_err(|e| format!("Ollama 已安装，但服务暂未启动：{}。请稍后重试。", e))?;

        Ok(serde_json::json!({ "installed": true, "alreadyRunning": false }))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn ensure_ollama_vision_model(
    app_handle: tauri::AppHandle,
    model: Option<String>,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let model = normalize_ollama_vision_model(model);
        emit_local_vision_model_progress(
            &app_handle,
            "checking",
            format!("正在检查本地大模型：{}", model),
            Some(model.clone()),
            0,
            100,
            3.0,
        );

        let ready = match read_ollama_model_ready(&model) {
            Ok(value) => value,
            Err(_) => {
                emit_local_vision_model_progress(
                    &app_handle,
                    "starting",
                    "正在尝试启动 Ollama 服务".to_string(),
                    Some(model.clone()),
                    0,
                    100,
                    3.0,
                );
                let _ = try_spawn_ollama_service();
                thread::sleep(Duration::from_millis(1200));
                read_ollama_model_ready(&model)?
            }
        };

        if ready {
            emit_local_vision_model_progress(
                &app_handle,
                "ready",
                "本地大模型已就绪".to_string(),
                Some(model.clone()),
                100,
                100,
                100.0,
            );
            return Ok(serde_json::json!({ "ready": true, "model": model }));
        }

        emit_local_vision_model_progress(
            &app_handle,
            "downloading",
            format!("正在下载本地大模型增量包：{}", model),
            Some(model.clone()),
            3,
            100,
            3.0,
        );

        pull_ollama_vision_model(&app_handle, &model)?;

        emit_local_vision_model_progress(
            &app_handle,
            "ready",
            "本地大模型已下载完成".to_string(),
            Some(model.clone()),
            100,
            100,
            100.0,
        );
        Ok(serde_json::json!({ "ready": true, "model": model }))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn is_data_image_string(value: &str) -> bool {
    let trimmed = value.trim_start();
    let prefix = "data:image/";
    trimmed
        .get(..prefix.len())
        .map(|head| head.eq_ignore_ascii_case(prefix))
        .unwrap_or(false)
}

fn remove_data_image_field(
    object: &mut serde_json::Map<String, serde_json::Value>,
    key: &str,
    max_chars: Option<usize>,
) {
    let should_remove = object
        .get(key)
        .and_then(|value| value.as_str())
        .map(|value| {
            is_data_image_string(value)
                && max_chars.map(|limit| value.len() > limit).unwrap_or(true)
        })
        .unwrap_or(false);

    if should_remove {
        object.remove(key);
    }
}

fn compact_item_json_object(object: &mut serde_json::Map<String, serde_json::Value>) {
    remove_data_image_field(object, "sourceUrl", None);
    remove_data_image_field(object, "originalUrl", None);
    remove_data_image_field(object, "thumbnail", Some(MAX_STORED_DATA_THUMBNAIL_CHARS));
    remove_data_image_field(object, "cover", Some(MAX_STORED_DATA_THUMBNAIL_CHARS));
}

fn compact_item_like_json(value: &mut serde_json::Value) {
    if let Some(object) = value.as_object_mut() {
        compact_item_json_object(object);
        if let Some(item) = object.get_mut("item") {
            compact_item_like_json(item);
        }
    }
}

pub(crate) fn compact_items_payload(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Array(items) => {
            for item in items {
                compact_item_like_json(item);
            }
        }
        serde_json::Value::Object(object) => {
            compact_item_json_object(object);
            if let Some(items) = object
                .get_mut("items")
                .and_then(|value| value.as_array_mut())
            {
                for item in items {
                    compact_item_like_json(item);
                }
            }
            if let Some(item) = object.get_mut("item") {
                compact_item_like_json(item);
            }
        }
        _ => {}
    }
}

fn write_text_file_atomically(path: &Path, content: &str) -> Result<(), String> {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("drawer_items.json");
    let nonce = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let temporary_path = path.with_file_name(format!(".{file_name}.{}.{}.tmp", std::process::id(), nonce));

    fs::write(&temporary_path, content).map_err(|error| error.to_string())?;
    if let Err(error) = fs::rename(&temporary_path, path) {
        let _ = fs::remove_file(&temporary_path);
        return Err(error.to_string());
    }
    Ok(())
}

#[tauri::command]
fn load_items(app_handle: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = get_user_data_dir(&app_handle).join("drawer_items.json");
    if path.exists() {
        let content = fs::read_to_string(path).unwrap_or_else(|_| "[]".to_string());
        let mut value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        compact_items_payload(&mut value);
        Ok(value)
    } else {
        Ok(serde_json::json!([]))
    }
}

#[tauri::command]
fn save_items(app_handle: tauri::AppHandle, mut items: serde_json::Value) -> Result<(), String> {
    let path = get_user_data_dir(&app_handle).join("drawer_items.json");
    compact_items_payload(&mut items);
    let content = serde_json::to_string(&items).map_err(|e| e.to_string())?;
    write_text_file_atomically(&path, &content)
}

#[tauri::command]
fn load_folders(app_handle: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = get_user_data_dir(&app_handle).join("drawer_folders.json");
    if is_folder_empty_state_confirmed(&app_handle, if path.exists() { Some(&path) } else { None })
    {
        return Ok(serde_json::json!([]));
    }

    if let Some(current) = folder_payload_candidate_from_path(&path)? {
        let payload = current.payload;
        if let Some(folder_array) = payload.as_array() {
            let _ = crate::services::asset_service::replace_folders(
                app_handle.clone(),
                Some(crate::db::schema::DEFAULT_LIBRARY_ID.to_string()),
                folder_array.clone(),
            );
        }
        let _ = fs::remove_file(folder_empty_marker_path(&app_handle));
        return Ok(payload);
    }

    let mut candidates = Vec::new();
    collect_folder_backup_candidates(
        &get_user_data_dir(&app_handle).join("json_backups"),
        &mut candidates,
    )?;
    collect_folder_backup_candidates(
        &get_user_data_dir(&app_handle).join("canvas_schema_backups"),
        &mut candidates,
    )?;

    if crate::db::connection::should_use_sqlite(&app_handle) {
        if let Ok(sqlite_folders) = crate::services::asset_service::list_folders(
            app_handle.clone(),
            Some(crate::db::schema::DEFAULT_LIBRARY_ID.to_string()),
        ) {
            let payload = serde_json::Value::Array(sqlite_folders);
            let count = folder_payload_count(&payload);
            if count > 0 {
                candidates.push(FolderPayloadCandidate {
                    payload,
                    count,
                    modified_at: current_time_millis(),
                });
            }
        }
    }

    sort_folder_payload_candidates(&mut candidates);

    let Some(best) = candidates.first() else {
        return Ok(serde_json::json!([]));
    };
    let recovered = merge_folder_payload_candidates(&best.payload, &candidates);
    write_folders_payload(&path, &recovered)?;
    if let Some(folder_array) = recovered.as_array() {
        let _ = crate::services::asset_service::replace_folders(
            app_handle.clone(),
            Some(crate::db::schema::DEFAULT_LIBRARY_ID.to_string()),
            folder_array.clone(),
        );
    }
    let _ = fs::remove_file(folder_empty_marker_path(&app_handle));
    Ok(recovered)
}

#[tauri::command]
fn save_folders(
    app_handle: tauri::AppHandle,
    folders: serde_json::Value,
    allow_empty: Option<bool>,
) -> Result<(), String> {
    let path = get_user_data_dir(&app_handle).join("drawer_folders.json");
    let next_count = folder_payload_count(&folders);
    if next_count == 0
        && !allow_empty.unwrap_or(false)
        && has_recoverable_folder_payloads(&app_handle)?
    {
        let backup_path = path.with_file_name(format!(
            "drawer_folders.empty-save-blocked.{}.json",
            current_time_millis()
        ));
        let content = serde_json::to_string(&folders).map_err(|e| e.to_string())?;
        let _ = fs::write(backup_path, content);
        return Ok(());
    }
    if next_count == 0 {
        let _ = fs::write(
            folder_empty_marker_path(&app_handle),
            current_time_millis().to_string(),
        );
    } else {
        let _ = fs::remove_file(folder_empty_marker_path(&app_handle));
    }
    write_folders_payload(&path, &folders)?;
    if let Some(folder_array) = folders.as_array() {
        crate::services::asset_service::replace_folders(
            app_handle,
            Some(crate::db::schema::DEFAULT_LIBRARY_ID.to_string()),
            folder_array.clone(),
        )
        .map(|_| ())
    } else {
        Ok(())
    }
}

fn folder_empty_marker_path(app_handle: &tauri::AppHandle) -> PathBuf {
    get_user_data_dir(app_handle).join("drawer_folders.empty_confirmed.txt")
}

fn is_folder_empty_state_confirmed(
    app_handle: &tauri::AppHandle,
    folders_path: Option<&Path>,
) -> bool {
    let marker_path = folder_empty_marker_path(app_handle);
    if !marker_path.is_file() {
        return false;
    }
    let marker_modified = modified_time_millis(&marker_path);
    let folders_modified = folders_path.map(modified_time_millis).unwrap_or(0);
    marker_modified >= folders_modified
}

fn folder_payload_count(value: &serde_json::Value) -> usize {
    value
        .as_array()
        .map(|folders| {
            folders
                .iter()
                .filter(|folder| {
                    json_value_string(folder, "id").is_some()
                        && json_value_string(folder, "name").is_some()
                        && !json_folder_deleted(folder)
                })
                .count()
        })
        .unwrap_or(0)
}

fn folder_payload_score(value: &serde_json::Value) -> i64 {
    let Some(folders) = value.as_array() else {
        return 0;
    };
    let ids = folders
        .iter()
        .filter_map(|folder| json_value_string(folder, "id"))
        .collect::<HashSet<_>>();
    let child_links = folders
        .iter()
        .filter_map(|folder| json_value_string(folder, "parentId"))
        .filter(|parent_id| ids.contains(parent_id))
        .count();
    (folders.len() as i64 * 100) + (child_links as i64 * 1000)
}

fn merge_folder_payload_candidates(
    primary: &serde_json::Value,
    candidates: &[FolderPayloadCandidate],
) -> serde_json::Value {
    let mut merged_by_id: HashMap<String, (serde_json::Value, i32)> = HashMap::new();
    let mut ordered_ids = Vec::new();
    let mut apply_candidate = |payload: &serde_json::Value| {
        let Some(folders) = payload.as_array() else {
            return;
        };
        let ids = folders
            .iter()
            .filter_map(|folder| json_value_string(folder, "id"))
            .collect::<HashSet<_>>();
        for folder in folders {
            let Some(id) = json_value_string(folder, "id") else {
                continue;
            };
            let parent_score = json_value_string(folder, "parentId")
                .map(|parent_id| if ids.contains(&parent_id) { 2 } else { 1 })
                .unwrap_or(0);
            match merged_by_id.get(&id) {
                None => {
                    ordered_ids.push(id.clone());
                    merged_by_id.insert(id, (folder.clone(), parent_score));
                }
                Some((_, existing_parent_score)) if parent_score > *existing_parent_score => {
                    merged_by_id.insert(id, (folder.clone(), parent_score));
                }
                _ => {}
            }
        }
    };

    apply_candidate(primary);
    for candidate in candidates {
        apply_candidate(&candidate.payload);
    }
    serde_json::Value::Array(
        ordered_ids
            .into_iter()
            .filter_map(|id| merged_by_id.remove(&id).map(|(folder, _)| folder))
            .collect(),
    )
}

fn has_recoverable_folder_payloads(app_handle: &tauri::AppHandle) -> Result<bool, String> {
    let path = get_user_data_dir(app_handle).join("drawer_folders.json");
    if folder_payload_from_path(&path)?.is_some() {
        return Ok(true);
    }
    Ok(recover_folders_from_latest_backup(app_handle)?.is_some())
}

fn recover_folders_from_latest_backup(
    app_handle: &tauri::AppHandle,
) -> Result<Option<serde_json::Value>, String> {
    let data_dir = get_user_data_dir(app_handle);
    let mut candidates = Vec::new();
    collect_folder_backup_candidates(&data_dir.join("json_backups"), &mut candidates)?;
    collect_folder_backup_candidates(&data_dir.join("canvas_schema_backups"), &mut candidates)?;
    for entry in fs::read_dir(&data_dir)
        .map_err(|err| err.to_string())?
        .flatten()
    {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if path.is_file()
            && name.starts_with("drawer_folders.empty-save-blocked.")
            && name.ends_with(".json")
        {
            if let Some(candidate) = folder_payload_candidate_from_path(&path)? {
                candidates.push(candidate);
            }
        }
    }
    sort_folder_payload_candidates(&mut candidates);
    Ok(candidates
        .into_iter()
        .next()
        .map(|candidate| candidate.payload))
}

fn sort_folder_payload_candidates(candidates: &mut [FolderPayloadCandidate]) {
    candidates.sort_by(|left, right| {
        folder_payload_score(&right.payload)
            .cmp(&folder_payload_score(&left.payload))
            .then_with(|| right.count.cmp(&left.count))
            .then_with(|| right.modified_at.cmp(&left.modified_at))
    });
}

struct FolderPayloadCandidate {
    payload: serde_json::Value,
    count: usize,
    modified_at: i64,
}

fn collect_folder_backup_candidates(
    root: &Path,
    candidates: &mut Vec<FolderPayloadCandidate>,
) -> Result<(), String> {
    if !root.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(root).map_err(|err| err.to_string())?.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_folder_backup_candidates(&path, candidates)?;
            continue;
        }
        if path.file_name().and_then(|value| value.to_str()) != Some("drawer_folders.json") {
            continue;
        }
        if let Some(candidate) = folder_payload_candidate_from_path(&path)? {
            candidates.push(candidate);
        }
    }
    Ok(())
}

fn folder_payload_from_path(path: &Path) -> Result<Option<serde_json::Value>, String> {
    Ok(folder_payload_candidate_from_path(path)?.map(|candidate| candidate.payload))
}

fn folder_payload_candidate_from_path(
    path: &Path,
) -> Result<Option<FolderPayloadCandidate>, String> {
    if !path.is_file() {
        return Ok(None);
    }
    let content = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) else {
        return Ok(None);
    };
    let Some(folders) = value.as_array() else {
        return Ok(None);
    };
    let payload = serde_json::Value::Array(
        folders
            .iter()
            .filter(|folder| {
                json_value_string(folder, "id").is_some()
                    && json_value_string(folder, "name").is_some()
                    && !json_folder_deleted(folder)
            })
            .cloned()
            .collect(),
    );
    let count = folder_payload_count(&payload);
    if count == 0 {
        return Ok(None);
    }
    Ok(Some(FolderPayloadCandidate {
        payload,
        count,
        modified_at: modified_time_millis(&path),
    }))
}

fn write_folders_payload(path: &Path, folders: &serde_json::Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let content = serde_json::to_string(folders).map_err(|e| e.to_string())?;
    let temp_path = path.with_extension(format!("json.tmp.{}", current_time_millis()));
    fs::write(&temp_path, content).map_err(|e| e.to_string())?;
    if path.exists() {
        let _ = fs::remove_file(path);
    }
    fs::rename(&temp_path, path).map_err(|e| e.to_string())
}

fn modified_time_millis(path: &Path) -> i64 {
    path.metadata()
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis().min(i64::MAX as u128) as i64)
        .unwrap_or(0)
}

fn json_value_string(value: &serde_json::Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn json_value_i64(value: &serde_json::Value, key: &str) -> Option<i64> {
    value.get(key).and_then(|value| {
        value
            .as_i64()
            .or_else(|| value.as_u64().map(|item| item as i64))
    })
}

fn json_folder_deleted(folder: &serde_json::Value) -> bool {
    json_value_i64(folder, "deletedAt")
        .or_else(|| json_value_i64(folder, "deleted_at"))
        .map(|value| value > 0)
        .unwrap_or(false)
}

#[tauri::command]
fn load_canvas_state(app_handle: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = get_user_data_dir(&app_handle).join("drawer_canvas.json");
    if path.exists() {
        let content = fs::read_to_string(path).unwrap_or_else(|_| "{}".to_string());
        let mut value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        compact_items_payload(&mut value);
        if canvas_state_item_count(&value) > 0 {
            return Ok(value);
        }
        if let Some(recovered) = recover_canvas_state_from_sqlite_or_backup(&app_handle)? {
            return Ok(recovered);
        }
        Ok(value)
    } else {
        Ok(recover_canvas_state_from_sqlite_or_backup(&app_handle)?
            .unwrap_or_else(|| serde_json::json!({})))
    }
}

fn canvas_state_item_count(value: &serde_json::Value) -> usize {
    value
        .get("items")
        .and_then(|items| items.as_array())
        .map(|items| items.len())
        .unwrap_or(0)
}

fn existing_canvas_node_count(app_handle: &tauri::AppHandle) -> Result<i64, String> {
    if !db::connection::sqlite_database_exists(app_handle) {
        return Ok(0);
    }
    let conn = db::connection::open_connection(app_handle)?;
    conn.query_row(
        "SELECT COUNT(*) FROM canvas_nodes WHERE canvas_id = ?1",
        rusqlite::params![DEFAULT_CANVAS_ID],
        |row| row.get(0),
    )
    .map_err(|err| err.to_string())
}

fn recover_canvas_state_from_sqlite_or_backup(
    app_handle: &tauri::AppHandle,
) -> Result<Option<serde_json::Value>, String> {
    if let Some(state) = recover_canvas_state_from_latest_backup(app_handle)? {
        return Ok(Some(state));
    }
    recover_canvas_state_from_sqlite(app_handle)
}

fn recover_canvas_state_from_sqlite(
    app_handle: &tauri::AppHandle,
) -> Result<Option<serde_json::Value>, String> {
    if !db::connection::sqlite_database_exists(app_handle) {
        return Ok(None);
    }
    let conn = db::connection::open_connection(app_handle)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT metadata_json
            FROM canvas_nodes
            WHERE canvas_id = ?1
            ORDER BY z_index ASC, created_at ASC
            "#,
        )
        .map_err(|err| err.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![DEFAULT_CANVAS_ID], |row| {
            row.get::<_, String>(0)
        })
        .map_err(|err| err.to_string())?;
    let mut items = Vec::new();
    for row in rows {
        let metadata = row.map_err(|err| err.to_string())?;
        if let Ok(mut node) = serde_json::from_str::<serde_json::Value>(&metadata) {
            compact_items_payload(&mut node);
            items.push(node);
        }
    }
    if items.is_empty() {
        return Ok(None);
    }
    let mut state = serde_json::json!({
        "items": items,
        "scale": 1,
        "scroll": { "left": 0, "top": 0 },
        "size": { "width": 20000, "height": 20000 },
        "updatedAt": current_time_millis(),
        "recoveredFrom": "sqlite_canvas_nodes",
    });
    fit_recovered_canvas_view(&mut state);
    Ok(Some(state))
}

fn recover_canvas_state_from_latest_backup(
    app_handle: &tauri::AppHandle,
) -> Result<Option<serde_json::Value>, String> {
    let backup_root = get_user_data_dir(app_handle).join("json_backups");
    if !backup_root.is_dir() {
        return Ok(None);
    }
    let mut candidates = Vec::new();
    for entry in fs::read_dir(backup_root)
        .map_err(|err| err.to_string())?
        .flatten()
    {
        let canvas_path = entry.path().join("drawer_canvas.json");
        if !canvas_path.is_file() {
            continue;
        }
        let modified = canvas_path
            .metadata()
            .and_then(|metadata| metadata.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH);
        candidates.push((modified, canvas_path));
    }
    candidates.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, canvas_path) in candidates {
        let Ok(content) = fs::read_to_string(&canvas_path) else {
            continue;
        };
        let Ok(mut state) = serde_json::from_str::<serde_json::Value>(&content) else {
            continue;
        };
        compact_items_payload(&mut state);
        if canvas_state_item_count(&state) == 0 {
            continue;
        }
        if let Some(object) = state.as_object_mut() {
            object.insert(
                "recoveredFrom".to_string(),
                serde_json::Value::String(canvas_path.to_string_lossy().to_string()),
            );
        }
        ensure_recovered_canvas_size(&mut state);
        return Ok(Some(state));
    }
    Ok(None)
}

fn fit_recovered_canvas_view(state: &mut serde_json::Value) {
    let Some(items) = state.get("items").and_then(|value| value.as_array()) else {
        return;
    };
    if items.is_empty() {
        return;
    }
    let mut min_x = f64::MAX;
    let mut min_y = f64::MAX;
    let mut max_x = 0.0_f64;
    let mut max_y = 0.0_f64;
    for item in items {
        let x = item
            .get("x")
            .and_then(|value| value.as_f64())
            .unwrap_or(0.0);
        let y = item
            .get("y")
            .and_then(|value| value.as_f64())
            .unwrap_or(0.0);
        let width = item
            .get("width")
            .and_then(|value| value.as_f64())
            .unwrap_or(0.0)
            .max(1.0);
        let height = item
            .get("height")
            .and_then(|value| value.as_f64())
            .unwrap_or(0.0)
            .max(1.0);
        min_x = min_x.min(x);
        min_y = min_y.min(y);
        max_x = max_x.max(x + width);
        max_y = max_y.max(y + height);
    }
    if !min_x.is_finite() || !min_y.is_finite() {
        return;
    }
    let margin = 800.0_f64;
    let scale = 0.2_f64;
    state["scroll"] = serde_json::json!({
        "left": (min_x - margin).max(0.0) * scale,
        "top": (min_y - margin).max(0.0) * scale,
    });
    state["scale"] = serde_json::json!(scale);
    state["size"] = serde_json::json!({
        "width": (max_x + margin).max(20000.0).ceil(),
        "height": (max_y + margin).max(20000.0).ceil(),
    });
}

fn ensure_recovered_canvas_size(state: &mut serde_json::Value) {
    let Some(items) = state.get("items").and_then(|value| value.as_array()) else {
        return;
    };
    if items.is_empty() {
        return;
    }
    let mut max_x = 0.0_f64;
    let mut max_y = 0.0_f64;
    for item in items {
        let x = item
            .get("x")
            .and_then(|value| value.as_f64())
            .unwrap_or(0.0);
        let y = item
            .get("y")
            .and_then(|value| value.as_f64())
            .unwrap_or(0.0);
        let width = item
            .get("width")
            .and_then(|value| value.as_f64())
            .unwrap_or(0.0)
            .max(1.0);
        let height = item
            .get("height")
            .and_then(|value| value.as_f64())
            .unwrap_or(0.0)
            .max(1.0);
        max_x = max_x.max(x + width);
        max_y = max_y.max(y + height);
    }
    let current_width = state
        .get("size")
        .and_then(|value| value.get("width"))
        .and_then(|value| value.as_f64())
        .unwrap_or(20000.0);
    let current_height = state
        .get("size")
        .and_then(|value| value.get("height"))
        .and_then(|value| value.as_f64())
        .unwrap_or(20000.0);
    state["size"] = serde_json::json!({
        "width": current_width.max(max_x + 800.0).ceil(),
        "height": current_height.max(max_y + 800.0).ceil(),
    });
}

#[tauri::command]
fn save_canvas_state(
    app_handle: tauri::AppHandle,
    mut state: serde_json::Value,
) -> Result<(), String> {
    let path = get_user_data_dir(&app_handle).join("drawer_canvas.json");
    compact_items_payload(&mut state);
    if canvas_state_item_count(&state) == 0
        && has_recoverable_canvas_state(&app_handle).unwrap_or(false)
    {
        let backup_path = path.with_file_name(format!(
            "drawer_canvas.empty-save-blocked.{}.json",
            current_time_millis()
        ));
        let content = serde_json::to_string(&state).map_err(|e| e.to_string())?;
        let _ = fs::write(backup_path, content);
        return Ok(());
    }
    let content = serde_json::to_string(&state).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}

fn has_recoverable_canvas_state(app_handle: &tauri::AppHandle) -> Result<bool, String> {
    if existing_canvas_node_count(app_handle).unwrap_or(0) > 0 {
        return Ok(true);
    }
    Ok(recover_canvas_state_from_latest_backup(app_handle)?
        .as_ref()
        .map(canvas_state_item_count)
        .unwrap_or(0)
        > 0)
}

#[tauri::command]
fn append_ai_debug_log(
    app_handle: tauri::AppHandle,
    name: String,
    line: String,
) -> Result<(), String> {
    let safe_name = sanitize_file_name(&name);
    let dir = get_user_data_dir(&app_handle).join("logs");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}.log", safe_name));
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    writeln!(file, "{}", line).map_err(|e| e.to_string())
}

fn web_image_cache_config_path(app_handle: &tauri::AppHandle) -> PathBuf {
    get_user_data_dir(app_handle).join("web_image_cache_dir.txt")
}

fn default_web_image_cache_dir(app_handle: &tauri::AppHandle) -> PathBuf {
    get_user_data_dir(app_handle).join("web_image_cache")
}

fn normalize_web_image_cache_dir(app_handle: &tauri::AppHandle, value: &str) -> PathBuf {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return default_web_image_cache_dir(app_handle);
    }

    let path = local_path_from_url_like(trimmed).unwrap_or_else(|| PathBuf::from(trimmed));
    if path.is_absolute() {
        path
    } else {
        get_user_data_dir(app_handle).join(path)
    }
}

fn read_web_image_cache_dir(app_handle: &tauri::AppHandle) -> PathBuf {
    let config_path = web_image_cache_config_path(app_handle);
    if let Ok(value) = fs::read_to_string(config_path) {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return normalize_web_image_cache_dir(app_handle, trimmed);
        }
    }
    default_web_image_cache_dir(app_handle)
}

fn normalize_thumbnail_size(size: Option<u32>) -> u32 {
    match size.unwrap_or(512) {
        0..=256 => 256,
        257..=512 => 512,
        513..=1024 => 1024,
        _ => 2048,
    }
}

fn save_thumbnail_jpeg(
    image: &screenshots::image::DynamicImage,
    path: &Path,
) -> Result<(), String> {
    flatten_dynamic_image_to_transparency_preview_rgb(image)
        .save_with_format(path, screenshots::image::ImageFormat::Jpeg)
        .map_err(|e| e.to_string())
}

fn ensure_image_thumbnail_file_impl(
    app_handle: tauri::AppHandle,
    path: String,
    size: Option<u32>,
) -> Result<ImageThumbnailFileResult, String> {
    let thumb_size = normalize_thumbnail_size(size);
    let metadata = local_media_metadata_impl(path)?;
    let cache_root = read_web_image_cache_dir(&app_handle)
        .join("thumbs")
        .join(thumb_size.to_string());
    fs::create_dir_all(&cache_root).map_err(|e| e.to_string())?;

    // Bump the filename when thumbnail compositing changes so old JPEGs with
    // baked-in transparent magenta mattes are not reused.
    let out_path = cache_root.join(format!("{}.alpha-v2.jpg", metadata.fingerprint));
    if out_path.is_file() {
        if let Ok((thumb_width, thumb_height)) = screenshots::image::image_dimensions(&out_path) {
            if thumb_width > 0 && thumb_height > 0 {
                return Ok(ImageThumbnailFileResult {
                    path: out_path.to_string_lossy().to_string(),
                    size: thumb_size,
                    width: thumb_width,
                    height: thumb_height,
                    fingerprint: metadata.fingerprint,
                    file_size: metadata.size,
                    modified_at: metadata.modified_at,
                });
            }
        }
        let _ = fs::remove_file(&out_path);
    }

    let image = screenshots::image::open(&metadata.path).map_err(|e| e.to_string())?;
    let width = image.width().max(1);
    let height = image.height().max(1);
    let scale = (thumb_size as f32 / width.max(height) as f32).min(1.0);
    let next_width = ((width as f32 * scale).round() as u32).max(1);
    let next_height = ((height as f32 * scale).round() as u32).max(1);
    let resized = image.resize(
        next_width,
        next_height,
        screenshots::image::imageops::FilterType::Triangle,
    );
    save_thumbnail_jpeg(&resized, &out_path)?;

    Ok(ImageThumbnailFileResult {
        path: out_path.to_string_lossy().to_string(),
        size: thumb_size,
        width: next_width,
        height: next_height,
        fingerprint: metadata.fingerprint,
        file_size: metadata.size,
        modified_at: metadata.modified_at,
    })
}

#[cfg(test)]
mod image_thumbnail_tests {
    use super::*;

    #[test]
    fn jpeg_thumbnail_writer_accepts_rgba_images() {
        let output = std::env::temp_dir().join(format!(
            "inspiration-drawer-rgba-thumbnail-{}-{}.jpg",
            std::process::id(),
            now_millis_u64()
        ));
        let rgba = screenshots::image::RgbaImage::from_pixel(
            32,
            24,
            screenshots::image::Rgba([24, 48, 72, 120]),
        );
        let image = screenshots::image::DynamicImage::ImageRgba8(rgba);

        save_thumbnail_jpeg(&image, &output).unwrap();
        assert_eq!(
            screenshots::image::image_dimensions(&output).unwrap(),
            (32, 24)
        );
        let _ = fs::remove_file(output);
    }

    #[test]
    fn jpeg_thumbnail_writer_neutralizes_transparent_magenta_pixels() {
        let output = std::env::temp_dir().join(format!(
            "inspiration-drawer-transparent-thumbnail-{}-{}.jpg",
            std::process::id(),
            now_millis_u64()
        ));
        let rgba = screenshots::image::RgbaImage::from_pixel(
            32,
            16,
            screenshots::image::Rgba([255, 0, 255, 0]),
        );
        let image = screenshots::image::DynamicImage::ImageRgba8(rgba);

        save_thumbnail_jpeg(&image, &output).unwrap();
        let preview = screenshots::image::open(&output).unwrap().to_rgb8();
        let first = preview.get_pixel(0, 0).0;
        let second_tile = preview.get_pixel(16, 0).0;
        assert!(first[0] > 205 && first[1] > 205 && first[2] > 205);
        assert!(second_tile[0] > 180 && second_tile[1] > 180 && second_tile[2] > 180);
        assert!((i16::from(first[0]) - i16::from(first[1])).abs() < 12);
        assert!((i16::from(first[1]) - i16::from(first[2])).abs() < 12);
        let _ = fs::remove_file(output);
    }
}

#[tauri::command]
async fn ensure_image_thumbnail_file(
    app_handle: tauri::AppHandle,
    path: String,
    size: Option<u32>,
) -> Result<ImageThumbnailFileResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        ensure_image_thumbnail_file_impl(app_handle, path, size)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn get_web_image_cache_dir(app_handle: tauri::AppHandle) -> Result<String, String> {
    let dir = read_web_image_cache_dir(&app_handle);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn set_web_image_cache_dir(app_handle: tauri::AppHandle, dir: String) -> Result<String, String> {
    let next_dir = normalize_web_image_cache_dir(&app_handle, &dir);

    fs::create_dir_all(&next_dir).map_err(|e| e.to_string())?;
    let saved_dir = next_dir.canonicalize().unwrap_or_else(|_| next_dir.clone());
    fs::write(
        web_image_cache_config_path(&app_handle),
        saved_dir.to_string_lossy().as_bytes(),
    )
    .map_err(|e| e.to_string())?;

    Ok(saved_dir.to_string_lossy().to_string())
}

fn image_ext_from_name_or_url(value: &str) -> Option<String> {
    let clean = value.split(['?', '#']).next().unwrap_or(value);
    let name = clean
        .split(['/', '\\'])
        .filter(|part| !part.is_empty())
        .last()
        .unwrap_or(clean);
    let ext = name
        .rsplit_once('.')
        .map(|(_, ext)| ext.to_ascii_lowercase())?;
    let ext = ext.trim().trim_matches('.');
    if matches!(
        ext,
        "png"
            | "jpg"
            | "jpeg"
            | "gif"
            | "webp"
            | "bmp"
            | "svg"
            | "mp4"
            | "webm"
            | "mov"
            | "m4v"
            | "avi"
            | "mkv"
    ) {
        Some(ext.to_string())
    } else {
        None
    }
}

fn media_ext_from_mime(mime: &str) -> Option<&'static str> {
    let lower = mime.to_ascii_lowercase();
    if lower.contains("jpeg") || lower.contains("jpg") {
        Some("jpg")
    } else if lower.contains("gif") {
        Some("gif")
    } else if lower.contains("webp") {
        Some("webp")
    } else if lower.contains("bmp") {
        Some("bmp")
    } else if lower.contains("svg") {
        Some("svg")
    } else if lower.contains("png") || lower.contains("image/") {
        Some("png")
    } else if lower.contains("webm") {
        Some("webm")
    } else if lower.contains("quicktime") || lower.contains("mov") {
        Some("mov")
    } else if lower.contains("x-m4v") || lower.contains("m4v") {
        Some("m4v")
    } else if lower.contains("avi") {
        Some("avi")
    } else if lower.contains("matroska") || lower.contains("mkv") {
        Some("mkv")
    } else if lower.contains("audio/mp4") || lower.contains("mp4a") || lower.contains("m4a") {
        Some("m4a")
    } else if lower.contains("mp4") || lower.contains("video/") {
        Some("mp4")
    } else if lower.contains("mpeg") || lower.contains("mp3") {
        Some("mp3")
    } else if lower.contains("wav") || lower.contains("wave") {
        Some("wav")
    } else if lower.contains("ogg") || lower.contains("opus") {
        Some("ogg")
    } else if lower.contains("flac") {
        Some("flac")
    } else if lower.contains("aac") {
        Some("aac")
    } else if lower.contains("aiff") {
        Some("aiff")
    } else if lower.contains("wma") {
        Some("wma")
    } else if lower.contains("audio/") {
        Some("bin")
    } else {
        None
    }
}

fn image_ext_from_mime(mime: &str) -> &'static str {
    media_ext_from_mime(mime).unwrap_or("png")
}

fn is_supported_media_ext(ext: &str) -> bool {
    matches!(
        ext.to_ascii_lowercase().as_str(),
        "png"
            | "jpg"
            | "jpeg"
            | "gif"
            | "webp"
            | "bmp"
            | "svg"
            | "mp4"
            | "webm"
            | "mov"
            | "m4v"
            | "avi"
            | "mkv"
            | "mp3"
            | "wav"
            | "ogg"
            | "opus"
            | "flac"
            | "aac"
            | "m4a"
            | "aiff"
            | "wma"
    )
}

fn replace_media_extension(path: &Path, ext: &str) -> PathBuf {
    let normalized_ext = ext.trim().trim_start_matches('.');
    if normalized_ext.is_empty() {
        return path.to_path_buf();
    }
    let current = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if current == normalized_ext.to_ascii_lowercase() {
        return path.to_path_buf();
    }
    path.with_extension(normalized_ext)
}

fn cloudflared_ref_stem(index: usize) -> String {
    const STEMS: [&str; 26] = [
        "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r",
        "s", "t", "u", "v", "w", "x", "y", "z",
    ];
    STEMS
        .get(index)
        .map(|value| value.to_string())
        .unwrap_or_else(|| format!("r{}", index + 1))
}

fn source_to_cloudflared_image_file(
    source: &str,
    dir: &PathBuf,
    index: usize,
) -> Result<String, String> {
    let trimmed = source.trim();
    if trimmed.is_empty() {
        return Err("参考文件为空".to_string());
    }

    if trimmed.starts_with("data:image/")
        || trimmed.starts_with("data:video/")
        || trimmed.starts_with("data:audio/")
    {
        let (mime, bytes) = decode_data_url(trimmed)?;
        let (bytes, mime) = if mime.starts_with("image/") {
            normalize_ai_reference_image_bytes(bytes, mime)?
        } else {
            (bytes, mime)
        };
        let ext = media_ext_from_mime(&mime).unwrap_or_else(|| image_ext_from_mime(&mime));
        let file_name = format!("{}.{}", cloudflared_ref_stem(index), ext);
        fs::write(dir.join(&file_name), bytes).map_err(|e| e.to_string())?;
        return Ok(file_name);
    }

    let local = local_path_from_url_like(trimmed).unwrap_or_else(|| PathBuf::from(trimmed));
    if !local.is_file() {
        return Err("本地参考需要本地图片、视频或 data URL".to_string());
    }

    let mime = guess_mime_from_path(&local).to_string();
    let fallback_ext = local
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .filter(|value| is_supported_media_ext(value))
        .unwrap_or_else(|| "jpg".to_string());
    if !mime.starts_with("image/") {
        let file_name = format!("{}.{}", cloudflared_ref_stem(index), fallback_ext);
        fs::copy(local, dir.join(&file_name)).map_err(|e| e.to_string())?;
        return Ok(file_name);
    }
    let bytes = fs::read(&local).map_err(|e| e.to_string())?;
    let (bytes, mime) = normalize_ai_reference_image_bytes(bytes, mime)?;
    let ext = media_ext_from_mime(&mime)
        .map(str::to_string)
        .unwrap_or(fallback_ext);
    let file_name = format!("{}.{}", cloudflared_ref_stem(index), ext);
    fs::write(dir.join(&file_name), bytes).map_err(|e| e.to_string())?;
    Ok(file_name)
}

struct R2PreparedObject {
    bytes: Vec<u8>,
    content_type: String,
    ext: String,
}

fn push_r2_config_candidate(candidates: &mut Vec<PathBuf>, path: PathBuf) {
    if !candidates.iter().any(|candidate| candidate == &path) {
        candidates.push(path);
    }
}

fn r2_config_candidates(app_handle: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    push_r2_config_candidate(
        &mut candidates,
        get_user_data_dir(app_handle).join("r2.local.json"),
    );

    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        push_r2_config_candidate(&mut candidates, resource_dir.join("r2.local.json"));
        push_r2_config_candidate(
            &mut candidates,
            resource_dir.join("_up_").join("r2.local.json"),
        );
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(dir) = current_exe.parent() {
            push_r2_config_candidate(&mut candidates, dir.join("r2.local.json"));
            push_r2_config_candidate(&mut candidates, dir.join("_up_").join("r2.local.json"));
            if let Some(parent) = dir.parent() {
                push_r2_config_candidate(&mut candidates, parent.join("r2.local.json"));
            }
        }
    }

    if let Ok(current_dir) = std::env::current_dir() {
        push_r2_config_candidate(&mut candidates, current_dir.join("r2.local.json"));
        push_r2_config_candidate(
            &mut candidates,
            current_dir.join("src-tauri").join("r2.local.json"),
        );
    }

    #[cfg(debug_assertions)]
    {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        push_r2_config_candidate(&mut candidates, manifest_dir.join("r2.local.json"));
        if let Some(parent) = manifest_dir.parent() {
            push_r2_config_candidate(&mut candidates, parent.join("r2.local.json"));
        }
    }

    candidates
}

fn read_r2_local_config(app_handle: &tauri::AppHandle) -> Result<R2LocalConfig, String> {
    let candidates = r2_config_candidates(app_handle);
    for path in &candidates {
        if !path.is_file() {
            continue;
        }
        let text = fs::read_to_string(path)
            .map_err(|e| format!("读取 R2 配置失败：{}：{}", path.to_string_lossy(), e))?;
        let mut config: R2LocalConfig = serde_json::from_str(&text)
            .map_err(|e| format!("解析 R2 配置失败：{}：{}", path.to_string_lossy(), e))?;
        config.account_id = config.account_id.trim().to_string();
        config.access_key_id = config.access_key_id.trim().to_string();
        config.secret_access_key = config.secret_access_key.trim().to_string();
        config.bucket = config.bucket.trim().to_string();
        config.public_url = config.public_url.trim().trim_end_matches('/').to_string();
        config.endpoint = config
            .endpoint
            .map(|value| value.trim().trim_end_matches('/').to_string())
            .filter(|value| !value.is_empty());
        config.prefix = config
            .prefix
            .map(|value| value.trim().trim_matches('/').replace('\\', "/"))
            .filter(|value| !value.is_empty());
        if config.account_id.is_empty()
            || config.access_key_id.is_empty()
            || config.secret_access_key.is_empty()
            || config.bucket.is_empty()
            || config.public_url.is_empty()
        {
            return Err(format!("R2 配置不完整：{}", path.to_string_lossy()));
        }
        return Ok(config);
    }

    let checked = candidates
        .iter()
        .take(8)
        .map(|path| path.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join("；");
    Err(format!("没有找到 r2.local.json。已检查：{}", checked))
}

fn source_to_r2_object(source: &str) -> Result<R2PreparedObject, String> {
    let trimmed = source.trim();
    if trimmed.is_empty() {
        return Err("R2 参考文件为空".to_string());
    }

    if trimmed.starts_with("data:image/")
        || trimmed.starts_with("data:video/")
        || trimmed.starts_with("data:audio/")
    {
        let (mime, bytes) = decode_data_url(trimmed)?;
        let (bytes, mime) = if mime.starts_with("image/") {
            normalize_ai_reference_image_bytes(bytes, mime)?
        } else {
            (bytes, mime)
        };
        let ext = media_ext_from_mime(&mime).unwrap_or("png").to_string();
        return Ok(R2PreparedObject {
            bytes,
            content_type: mime,
            ext,
        });
    }

    let path = local_path_from_url_like(trimmed).unwrap_or_else(|| PathBuf::from(trimmed));
    if !path.is_file() {
        return Err("R2 参考文件需要本地图片、视频或 data URL".to_string());
    }

    let bytes = fs::read(&path).map_err(|e| format!("读取 R2 参考文件失败：{}", e))?;
    let content_type = guess_mime_from_path(&path).to_string();
    let fallback_ext = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .filter(|value| is_supported_media_ext(value))
        .unwrap_or_else(|| image_ext_from_mime(&content_type).to_string());
    let (bytes, content_type) = if content_type.starts_with("image/") {
        normalize_ai_reference_image_bytes(bytes, content_type)?
    } else {
        (bytes, content_type)
    };
    let ext = media_ext_from_mime(&content_type)
        .map(str::to_string)
        .unwrap_or(fallback_ext);
    Ok(R2PreparedObject {
        bytes,
        content_type,
        ext,
    })
}

fn base36_u128(mut value: u128) -> String {
    const DIGITS: &[u8; 36] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if value == 0 {
        return "0".to_string();
    }
    let mut output = Vec::new();
    while value > 0 {
        output.push(DIGITS[(value % 36) as usize] as char);
        value /= 36;
    }
    output.iter().rev().collect()
}

fn short_r2_share_suffix() -> String {
    let text = base36_u128(now_millis_u128());
    let len = text.len();
    text[len.saturating_sub(5)..].to_string()
}

fn r2_object_key(config: &R2LocalConfig, suffix: &str, index: usize, ext: &str) -> String {
    let safe_ext = ext.trim().trim_start_matches('.').to_ascii_lowercase();
    let file_name = format!(
        "{}{}.{}",
        suffix,
        cloudflared_ref_stem(index),
        if safe_ext.is_empty() {
            "png"
        } else {
            safe_ext.as_str()
        }
    );
    match config.prefix.as_deref() {
        Some(prefix) if !prefix.is_empty() => format!("{}/{}", prefix.trim_matches('/'), file_name),
        _ => file_name,
    }
}

fn r2_endpoint(config: &R2LocalConfig) -> String {
    config
        .endpoint
        .clone()
        .unwrap_or_else(|| format!("https://{}.r2.cloudflarestorage.com", config.account_id))
}

fn r2_object_api_url(config: &R2LocalConfig, key: &str) -> String {
    format!(
        "{}/{}/{}",
        r2_endpoint(config).trim_end_matches('/'),
        config.bucket.trim_matches('/'),
        key.trim_start_matches('/')
    )
}

fn r2_object_public_url(config: &R2LocalConfig, key: &str) -> String {
    format!(
        "{}/{}",
        config.public_url.trim_end_matches('/'),
        key.trim_start_matches('/')
    )
}

type HmacSha256 = Hmac<Sha256>;

fn hmac_sha256(key: &[u8], data: &str) -> Result<Vec<u8>, String> {
    let mut mac = HmacSha256::new_from_slice(key).map_err(|e| e.to_string())?;
    mac.update(data.as_bytes());
    Ok(mac.finalize().into_bytes().to_vec())
}

fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn r2_amz_dates() -> Result<(String, String), String> {
    let now = OffsetDateTime::now_utc();
    let full_format = format_description::parse("[year][month][day]T[hour][minute][second]Z")
        .map_err(|e| e.to_string())?;
    let date_format = format_description::parse("[year][month][day]").map_err(|e| e.to_string())?;
    let amz_date = now.format(&full_format).map_err(|e| e.to_string())?;
    let date_stamp = now.format(&date_format).map_err(|e| e.to_string())?;
    Ok((amz_date, date_stamp))
}

fn r2_host_header(url: &reqwest::Url) -> Result<String, String> {
    let host = url
        .host_str()
        .ok_or_else(|| "R2 URL 缺少 host".to_string())?;
    Ok(match url.port() {
        Some(port) => format!("{}:{}", host, port),
        None => host.to_string(),
    })
}

fn r2_authorization_header(
    config: &R2LocalConfig,
    method: &str,
    url: &reqwest::Url,
    payload_hash: &str,
    amz_date: &str,
    date_stamp: &str,
    host: &str,
) -> Result<String, String> {
    let canonical_headers = format!(
        "host:{}\nx-amz-content-sha256:{}\nx-amz-date:{}\n",
        host, payload_hash, amz_date
    );
    let signed_headers = "host;x-amz-content-sha256;x-amz-date";
    let canonical_request = format!(
        "{}\n{}\n{}\n{}\n{}\n{}",
        method,
        url.path(),
        url.query().unwrap_or(""),
        canonical_headers,
        signed_headers,
        payload_hash
    );
    let credential_scope = format!("{}/auto/s3/aws4_request", date_stamp);
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{}\n{}\n{}",
        amz_date,
        credential_scope,
        sha256_hex(canonical_request.as_bytes())
    );
    let date_key = hmac_sha256(
        format!("AWS4{}", config.secret_access_key).as_bytes(),
        date_stamp,
    )?;
    let region_key = hmac_sha256(&date_key, "auto")?;
    let service_key = hmac_sha256(&region_key, "s3")?;
    let signing_key = hmac_sha256(&service_key, "aws4_request")?;
    let signature = hex::encode(hmac_sha256(&signing_key, &string_to_sign)?);
    Ok(format!(
        "AWS4-HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
        config.access_key_id, credential_scope, signed_headers, signature
    ))
}

fn send_r2_signed_request(
    client: &Client,
    config: &R2LocalConfig,
    method: &str,
    key: &str,
    bytes: &[u8],
    content_type: Option<&str>,
) -> Result<(), String> {
    let url = r2_object_api_url(config, key);
    let parsed_url = reqwest::Url::parse(&url).map_err(|e| format!("R2 URL 无效：{}", e))?;
    let payload_hash = sha256_hex(bytes);
    let (amz_date, date_stamp) = r2_amz_dates()?;
    let host = r2_host_header(&parsed_url)?;
    let authorization = r2_authorization_header(
        config,
        method,
        &parsed_url,
        &payload_hash,
        &amz_date,
        &date_stamp,
        &host,
    )?;

    let builder = match method {
        "PUT" => client.put(parsed_url.clone()).body(bytes.to_vec()),
        "DELETE" => client.delete(parsed_url.clone()),
        _ => return Err(format!("不支持的 R2 请求方法：{}", method)),
    };
    let mut builder = builder
        .header(reqwest::header::HOST, host)
        .header("x-amz-content-sha256", payload_hash)
        .header("x-amz-date", amz_date)
        .header(reqwest::header::AUTHORIZATION, authorization);
    if let Some(content_type) = content_type {
        builder = builder.header(reqwest::header::CONTENT_TYPE, content_type);
    }
    let response = builder.send().map_err(|e| format!("R2 请求失败：{}", e))?;
    let status = response.status();
    if status.is_success() {
        return Ok(());
    }
    let text = response.text().unwrap_or_default();
    Err(format!("R2 请求失败，HTTP {}：{}", status, text))
}

fn upload_r2_object(
    client: &Client,
    config: &R2LocalConfig,
    key: &str,
    object: &R2PreparedObject,
) -> Result<(), String> {
    send_r2_signed_request(
        client,
        config,
        "PUT",
        key,
        &object.bytes,
        Some(&object.content_type),
    )
}

fn delete_r2_object(client: &Client, config: &R2LocalConfig, key: &str) -> Result<(), String> {
    send_r2_signed_request(client, config, "DELETE", key, &[], None)
}

fn litterbox_file_name(suffix: &str, index: usize, ext: &str) -> String {
    let safe_ext = ext.trim().trim_start_matches('.').to_ascii_lowercase();
    format!(
        "{}{}.{}",
        suffix,
        cloudflared_ref_stem(index),
        if safe_ext.is_empty() {
            "png"
        } else {
            safe_ext.as_str()
        }
    )
}

fn normalize_litterbox_expiration(value: Option<String>) -> String {
    match value.as_deref().map(str::trim) {
        Some("12h") => "12h".to_string(),
        Some("24h") => "24h".to_string(),
        Some("72h") => "72h".to_string(),
        _ => "1h".to_string(),
    }
}

fn upload_litterbox_object(
    client: &Client,
    object: R2PreparedObject,
    file_name: String,
    expiration: &str,
) -> Result<String, String> {
    let part = Part::bytes(object.bytes)
        .file_name(file_name)
        .mime_str(&object.content_type)
        .map_err(|e| format!("Litterbox MIME 设置失败：{}", e))?;
    let form = Form::new()
        .text("reqtype", "fileupload")
        .text("time", expiration.to_string())
        .part("fileToUpload", part);
    let response = client
        .post("https://litterbox.catbox.moe/resources/internals/api.php")
        .multipart(form)
        .send()
        .map_err(|e| format!("Litterbox 上传失败：{}", e))?;
    let status = response.status();
    let text = response
        .text()
        .map_err(|e| format!("读取 Litterbox 响应失败：{}", e))?;
    if !status.is_success() {
        return Err(format!("Litterbox 上传失败，HTTP {}：{}", status, text));
    }
    let url = text.trim().trim_matches('"').to_string();
    if url.starts_with("http://") || url.starts_with("https://") {
        return Ok(url);
    }
    Err(format!("Litterbox 没有返回公网 URL：{}", text))
}

fn tmpfiles_direct_url(url: &str) -> String {
    let trimmed = url.trim().trim_matches('"');
    if trimmed.contains("://tmpfiles.org/dl/") {
        return trimmed.to_string();
    }
    if let Some(rest) = trimmed.strip_prefix("https://tmpfiles.org/") {
        return format!("https://tmpfiles.org/dl/{}", rest.trim_start_matches('/'));
    }
    if let Some(rest) = trimmed.strip_prefix("http://tmpfiles.org/") {
        return format!("https://tmpfiles.org/dl/{}", rest.trim_start_matches('/'));
    }
    trimmed.to_string()
}

fn upload_tmpfiles_object(
    client: &Client,
    object: R2PreparedObject,
    file_name: String,
) -> Result<String, String> {
    let part = Part::bytes(object.bytes)
        .file_name(file_name)
        .mime_str(&object.content_type)
        .map_err(|e| format!("Tmpfiles MIME 设置失败：{}", e))?;
    let form = Form::new().part("file", part);
    let response = client
        .post("https://tmpfiles.org/api/v1/upload")
        .multipart(form)
        .send()
        .map_err(|e| format!("Tmpfiles 上传失败：{}", e))?;
    let status = response.status();
    let text = response
        .text()
        .map_err(|e| format!("读取 Tmpfiles 响应失败：{}", e))?;
    if !status.is_success() {
        return Err(format!("Tmpfiles 上传失败，HTTP {}：{}", status, text));
    }

    let parsed: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("解析 Tmpfiles 响应失败：{}：{}", e, text))?;
    let raw_url = parsed
        .get("data")
        .and_then(|value| value.get("url"))
        .and_then(|value| value.as_str())
        .or_else(|| parsed.get("url").and_then(|value| value.as_str()))
        .ok_or_else(|| format!("Tmpfiles 没有返回公网 URL：{}", text))?;
    let direct_url = tmpfiles_direct_url(raw_url);
    if direct_url.starts_with("http://") || direct_url.starts_with("https://") {
        return Ok(direct_url);
    }
    Err(format!("Tmpfiles 返回的 URL 无效：{}", raw_url))
}

fn extract_trycloudflare_url(line: &str) -> Option<String> {
    line.split_whitespace()
        .map(|part| {
            part.trim_matches(|c: char| {
                matches!(
                    c,
                    '"' | '\'' | '`' | '<' | '>' | '(' | ')' | '[' | ']' | ','
                )
            })
        })
        .map(|part| part.trim_end_matches(['.', ',', ';']).to_string())
        .filter(|part| part.starts_with("https://") && part.contains("trycloudflare.com"))
        .find(|url| url.contains("trycloudflare.com"))
}

fn compact_cloudflared_output(lines: &[String]) -> String {
    let useful = lines
        .iter()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty()
                || trimmed.contains("Thank you for trying Cloudflare Tunnel")
                || trimmed.contains("without a Cloudflare account")
                || trimmed.contains("Online Services Terms of Use")
                || trimmed.contains("account-less Tunnels have no uptime guarantee")
            {
                return None;
            }
            Some(trimmed.to_string())
        })
        .take(5)
        .collect::<Vec<_>>();

    if useful.is_empty() {
        "没有拿到 trycloudflare 公网 URL，可能是 Cloudflare quick tunnel 暂时不可用或当前网络阻止了连接。".to_string()
    } else {
        useful.join("；")
    }
}

fn push_cloudflared_candidate(candidates: &mut Vec<PathBuf>, path: PathBuf) {
    if !candidates.iter().any(|candidate| candidate == &path) {
        candidates.push(path);
    }
}

fn add_cloudflared_candidates_from_dir(candidates: &mut Vec<PathBuf>, dir: &Path, exe_name: &str) {
    let mut current = Some(dir);
    while let Some(dir) = current {
        push_cloudflared_candidate(candidates, dir.join(exe_name));
        push_cloudflared_candidate(candidates, dir.join("bin").join(exe_name));
        push_cloudflared_candidate(candidates, dir.join("_up_").join(exe_name));
        push_cloudflared_candidate(candidates, dir.join("resources").join(exe_name));
        push_cloudflared_candidate(
            candidates,
            dir.join("resources").join("_up_").join(exe_name),
        );
        current = dir.parent();
    }
}

fn cloudflared_binary(app_handle: &tauri::AppHandle) -> (PathBuf, String) {
    let exe_name = if cfg!(target_os = "windows") {
        "cloudflared.exe"
    } else {
        "cloudflared"
    };
    let mut candidates = Vec::new();

    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        add_cloudflared_candidates_from_dir(&mut candidates, &resource_dir, exe_name);
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(dir) = current_exe.parent() {
            add_cloudflared_candidates_from_dir(&mut candidates, dir, exe_name);
        }
    }

    if let Ok(current_dir) = std::env::current_dir() {
        add_cloudflared_candidates_from_dir(&mut candidates, &current_dir, exe_name);
    }

    #[cfg(debug_assertions)]
    {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        add_cloudflared_candidates_from_dir(&mut candidates, &manifest_dir, exe_name);
    }

    for path in &candidates {
        if path.is_file() {
            return (
                fs::canonicalize(path).unwrap_or_else(|_| path.clone()),
                String::new(),
            );
        }
    }

    let checked = candidates
        .iter()
        .take(12)
        .map(|path| path.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join("；");
    (PathBuf::from(exe_name), checked)
}

fn parse_http_range_header(value: &str, total_len: usize) -> Option<(usize, usize)> {
    if total_len == 0 {
        return None;
    }
    let lower = value.trim().to_ascii_lowercase();
    let range = lower.strip_prefix("bytes=")?;
    let (start_text, end_text) = range.split_once('-')?;
    let start = start_text.trim().parse::<usize>().ok()?;
    if start >= total_len {
        return None;
    }
    let end = end_text
        .trim()
        .parse::<usize>()
        .ok()
        .unwrap_or(total_len.saturating_sub(1))
        .min(total_len.saturating_sub(1));
    if end < start {
        return None;
    }
    Some((start, end))
}

fn serve_cloudflared_file(mut stream: TcpStream, dir: &PathBuf) -> std::io::Result<()> {
    let mut request_line = String::new();
    let mut header_lines: Vec<String> = Vec::new();
    {
        let mut reader = BufReader::new(stream.try_clone()?);
        reader.read_line(&mut request_line)?;
        loop {
            let mut line = String::new();
            let read = reader.read_line(&mut line)?;
            if read == 0 || line == "\r\n" || line == "\n" {
                break;
            }
            header_lines.push(line);
        }
    }

    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let raw_path = parts.next().unwrap_or("/");
    if method != "GET" && method != "HEAD" {
        stream.write_all(
            b"HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        )?;
        return Ok(());
    }

    let file_name = raw_path
        .split(['?', '#'])
        .next()
        .unwrap_or("/")
        .trim_start_matches('/');

    if file_name.is_empty()
        || file_name.contains('/')
        || file_name.contains('\\')
        || file_name.contains("..")
    {
        stream.write_all(
            b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        )?;
        return Ok(());
    }

    let path = dir.join(file_name);
    if !path.is_file() {
        stream.write_all(
            b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        )?;
        return Ok(());
    }

    let bytes = fs::read(&path)?;
    let content_type = guess_mime_from_path(&path);
    let range = header_lines.iter().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        if name.trim().eq_ignore_ascii_case("range") {
            parse_http_range_header(value, bytes.len())
        } else {
            None
        }
    });

    if method == "GET" {
        if let Some((start, end)) = range {
            let body = &bytes[start..=end];
            let headers = format!(
                "HTTP/1.1 206 Partial Content\r\nContent-Type: {}\r\nContent-Length: {}\r\nContent-Range: bytes {}-{}/{}\r\nAccept-Ranges: bytes\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
                content_type,
                body.len(),
                start,
                end,
                bytes.len()
            );
            stream.write_all(headers.as_bytes())?;
            stream.write_all(body)?;
            return Ok(());
        }
    }

    let headers = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nAccept-Ranges: bytes\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        content_type,
        bytes.len()
    );
    stream.write_all(headers.as_bytes())?;
    if method == "GET" {
        stream.write_all(&bytes)?;
    }
    Ok(())
}

fn start_cloudflared_file_server(
    dir: PathBuf,
) -> Result<(u16, Arc<AtomicBool>, JoinHandle<()>), String> {
    let listener =
        TcpListener::bind(("127.0.0.1", 0)).map_err(|e| format!("启动本地图片服务失败：{}", e))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| format!("设置本地图片服务失败：{}", e))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let stop = Arc::new(AtomicBool::new(false));
    let thread_stop = stop.clone();

    let handle = thread::spawn(move || {
        while !thread_stop.load(Ordering::Relaxed) {
            match listener.accept() {
                Ok((stream, _)) => {
                    let _ = serve_cloudflared_file(stream, &dir);
                }
                Err(err) if err.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(40));
                }
                Err(_) => break,
            }
        }
    });

    Ok((port, stop, handle))
}

fn spawn_cloudflared_tunnel(
    app_handle: &tauri::AppHandle,
    port: u16,
) -> Result<(String, Child), String> {
    let (binary, checked_paths) = cloudflared_binary(app_handle);
    let url = format!("http://127.0.0.1:{}", port);
    let mut cmd = SysCommand::new(&binary);
    hide_console_window(&mut cmd);
    let mut child = cmd
        .args(["tunnel", "--no-autoupdate", "--protocol", "http2", "--url"])
        .arg(&url)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            let checked_note = if checked_paths.is_empty() {
                String::new()
            } else {
                format!("已检查：{}。", checked_paths)
            };
            format!(
                "无法启动 cloudflared：{}。请将 cloudflared.exe 放到项目根目录、应用资源目录、程序同目录或系统 PATH。{}",
                e, checked_note
            )
        })?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let (tx, rx) = mpsc::channel::<String>();

    if let Some(stdout) = stdout {
        let tx = tx.clone();
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().flatten() {
                let _ = tx.send(line);
            }
        });
    }

    if let Some(stderr) = stderr {
        let tx = tx.clone();
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                let _ = tx.send(line);
            }
        });
    }

    let started_at = Instant::now();
    let mut recent_output: Vec<String> = Vec::new();
    while started_at.elapsed() < Duration::from_secs(25) {
        while let Ok(line) = rx.try_recv() {
            if recent_output.len() > 12 {
                recent_output.remove(0);
            }
            recent_output.push(line.clone());
            if let Some(url) = extract_trycloudflare_url(&line) {
                return Ok((url, child));
            }
        }

        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            return Err(format!(
                "cloudflared 隧道进程已退出（{}）。{}",
                status,
                compact_cloudflared_output(&recent_output)
            ));
        }

        match rx.recv_timeout(Duration::from_millis(200)) {
            Ok(line) => {
                if recent_output.len() > 12 {
                    recent_output.remove(0);
                }
                recent_output.push(line.clone());
                if let Some(url) = extract_trycloudflare_url(&line) {
                    return Ok((url, child));
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }

    let _ = child.kill();
    let _ = child.wait();
    Err("cloudflared 启动超时：25 秒内没有拿到 trycloudflare 公网 URL，请确认网络可用".to_string())
}

fn probe_cloudflared_public_url(client: &Client, url: &str) -> Result<bool, String> {
    let head_result = client
        .head(url)
        .header(reqwest::header::CACHE_CONTROL, "no-cache")
        .send();

    match head_result {
        Ok(response) if response.status().is_success() || response.status().as_u16() == 405 => {}
        Ok(_) => {
            return Ok(false);
        }
        Err(err) => {
            return Err(format!("{} 访问失败：{}", url, err));
        }
    }

    client
        .get(url)
        .header(reqwest::header::CACHE_CONTROL, "no-cache")
        .header(reqwest::header::RANGE, "bytes=0-31")
        .send()
        .map(|response| response.status().is_success())
        .map_err(|err| format!("{} 访问失败：{}", url, err))
}

fn warm_up_cloudflared_public_urls(
    app_handle: &tauri::AppHandle,
    urls: &[String],
) -> Option<String> {
    if urls.is_empty() {
        return None;
    }

    let client = build_http_client(Some(app_handle), None, 10)
        .or_else(|_| build_direct_http_client(10))
        .ok()?;
    let started_at = Instant::now();
    let mut last_error = String::new();
    let mut ready_rounds = 0;

    while started_at.elapsed() < Duration::from_secs(18) {
        let mut all_ready = true;
        for url in urls {
            match probe_cloudflared_public_url(&client, url) {
                Ok(true) => {}
                Ok(false) => {
                    all_ready = false;
                    last_error = format!("{} 尚未返回可用图片", url);
                    break;
                }
                Err(err) => {
                    all_ready = false;
                    last_error = err;
                    break;
                }
            }
        }

        if all_ready {
            ready_rounds += 1;
            if ready_rounds >= 2 {
                return None;
            }
        } else {
            ready_rounds = 0;
        }
        thread::sleep(Duration::from_millis(800));
    }

    Some(format!(
        "cloudflared 公网图片 URL 预热未确认完成。{}",
        last_error
    ))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NewApiReferenceReadiness {
    ready_duration_ms: u64,
    reference_hosts: Vec<String>,
}

fn newapi_reference_response_ready(response: &reqwest::blocking::Response) -> bool {
    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    matches!(status, 200 | 206) && content_type.starts_with("image/")
}

fn probe_newapi_reference_url(
    client: &Client,
    url: &str,
    timeout: Duration,
) -> Result<bool, String> {
    let host = Url::parse(url)
        .ok()
        .and_then(|value| value.host_str().map(str::to_string))
        .unwrap_or_else(|| "unknown-host".to_string());
    let head = client
        .head(url)
        .timeout(timeout)
        .header(reqwest::header::CACHE_CONTROL, "no-cache")
        .send()
        .map_err(|err| format!("{} HEAD 失败：{}", host, err))?;
    if newapi_reference_response_ready(&head) {
        return Ok(true);
    }
    if !matches!(head.status().as_u16(), 200 | 206 | 405 | 501) {
        return Ok(false);
    }
    let response = client
        .get(url)
        .timeout(timeout)
        .header(reqwest::header::CACHE_CONTROL, "no-cache")
        .header(reqwest::header::RANGE, "bytes=0-31")
        .send()
        .map_err(|err| format!("{} Range GET 失败：{}", host, err))?;
    Ok(newapi_reference_response_ready(&response))
}

fn wait_for_newapi_reference_urls(
    app_handle: &tauri::AppHandle,
    urls: &[String],
    max_wait_ms: u64,
) -> Result<NewApiReferenceReadiness, String> {
    let started_at = Instant::now();
    let max_wait = Duration::from_millis(max_wait_ms.clamp(500, 5000));
    let client =
        build_http_client(Some(app_handle), None, 5).or_else(|_| build_direct_http_client(5))?;
    let reference_hosts = urls
        .iter()
        .filter_map(|url| Url::parse(url).ok())
        .filter_map(|url| url.host_str().map(|host| host.to_ascii_lowercase()))
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    let mut ready_rounds = 0;
    let mut last_error = "参考图尚未返回 200/206 image/*".to_string();

    while started_at.elapsed() < max_wait {
        let mut all_ready = true;
        for url in urls {
            let remaining = max_wait.saturating_sub(started_at.elapsed());
            if remaining.is_zero() {
                all_ready = false;
                break;
            }
            let request_timeout = remaining.min(Duration::from_millis(1200));
            match probe_newapi_reference_url(&client, url, request_timeout) {
                Ok(true) => {}
                Ok(false) => {
                    all_ready = false;
                    last_error = "参考图状态或 Content-Type 尚未就绪".to_string();
                    break;
                }
                Err(error) => {
                    all_ready = false;
                    last_error = error;
                    break;
                }
            }
        }
        if all_ready {
            ready_rounds += 1;
            if ready_rounds >= 2 {
                return Ok(NewApiReferenceReadiness {
                    ready_duration_ms: started_at.elapsed().as_millis() as u64,
                    reference_hosts,
                });
            }
        } else {
            ready_rounds = 0;
        }
        let remaining = max_wait.saturating_sub(started_at.elapsed());
        if remaining.is_zero() {
            break;
        }
        thread::sleep(remaining.min(Duration::from_millis(250)));
    }

    Err(format!(
        "5 秒内未连续两次确认 Cloudflare 参考图可用：{}",
        last_error
    ))
}

#[tauri::command]
async fn check_newapi_reference_urls_ready(
    app_handle: tauri::AppHandle,
    urls: Vec<String>,
    max_wait_ms: Option<u64>,
) -> Result<NewApiReferenceReadiness, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if urls.is_empty() {
            return Ok(NewApiReferenceReadiness {
                ready_duration_ms: 0,
                reference_hosts: Vec::new(),
            });
        }
        wait_for_newapi_reference_urls(&app_handle, &urls, max_wait_ms.unwrap_or(5000))
    })
    .await
    .map_err(|error| format!("Cloudflare 参考图就绪检查失败：{}", error))?
}

#[tauri::command]
async fn create_cloudflared_public_image_urls(
    app_handle: tauri::AppHandle,
    sources: Vec<String>,
    dir: Option<String>,
    max_url_length: Option<usize>,
) -> Result<CloudflaredPublicImageUrls, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if sources.is_empty() {
            return Err("没有需要公开的本地参考图".to_string());
        }

        let cache_dir = dir
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| normalize_web_image_cache_dir(&app_handle, value))
            .unwrap_or_else(|| read_web_image_cache_dir(&app_handle));
        fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;

        let share_id = format!("cloudflared_ai_{}", now_millis_u128());
        let share_dir = cache_dir.join("cloudflared-ai-refs").join(&share_id);
        fs::create_dir_all(&share_dir).map_err(|e| e.to_string())?;

        let mut file_names = Vec::new();
        for (index, source) in sources.iter().take(13).enumerate() {
            file_names.push(source_to_cloudflared_image_file(source, &share_dir, index)?);
        }

        let (port, server_stop, server_thread) =
            match start_cloudflared_file_server(share_dir.clone()) {
                Ok(value) => value,
                Err(err) => {
                    let _ = fs::remove_dir_all(&share_dir);
                    return Err(err);
                }
            };

        let max_url_length = max_url_length.unwrap_or(64).clamp(64, 2048);
        let tunnel_attempts = if max_url_length > 64 { 1 } else { 5 };
        let mut selected_tunnel: Option<(String, Child, Vec<String>)> = None;
        let mut last_tunnel_error = String::new();
        for attempt in 0..tunnel_attempts {
            let (base_url, mut child) = match spawn_cloudflared_tunnel(&app_handle, port) {
                Ok(value) => value,
                Err(err) => {
                    last_tunnel_error = err;
                    break;
                }
            };
            let base = base_url.trim_end_matches('/').to_string();
            let urls = file_names
                .iter()
                .map(|name| format!("{}/{}", base, name))
                .collect::<Vec<_>>();
            if urls.iter().all(|url| url.len() <= max_url_length) {
                if let Some(warning) = warm_up_cloudflared_public_urls(&app_handle, &urls) {
                    last_tunnel_error = warning;
                    let _ = child.kill();
                    let _ = child.wait();
                    thread::sleep(Duration::from_millis(500));
                    continue;
                }
                selected_tunnel = Some((base, child, urls));
                break;
            }
            last_tunnel_error = format!(
                "cloudflared 第 {} 次生成的公网 URL 超过 {} 字符，已重试",
                attempt + 1,
                max_url_length,
            );
            let _ = child.kill();
            let _ = child.wait();
            thread::sleep(Duration::from_millis(500));
        }

        let (_base_url, child, urls) = match selected_tunnel {
            Some(value) => value,
            None => {
                server_stop.store(true, Ordering::Relaxed);
                let _ = server_thread.join();
                let _ = fs::remove_dir_all(&share_dir);
                return Err(if last_tunnel_error.is_empty() {
                    format!(
                        "cloudflared 没有生成符合 {} 字符限制的公网 URL",
                        max_url_length
                    )
                } else {
                    last_tunnel_error
                });
            }
        };

        cloudflared_shares()
            .lock()
            .map_err(|_| "cloudflared 分享状态锁定失败".to_string())?
            .insert(
                share_id.clone(),
                CloudflaredShare {
                    child,
                    dir: share_dir,
                    server_stop,
                    server_thread: Some(server_thread),
                },
            );

        Ok(CloudflaredPublicImageUrls { share_id, urls })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn stop_cloudflared_share(share_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let share = cloudflared_shares()
            .lock()
            .map_err(|_| "cloudflared 分享状态锁定失败".to_string())?
            .remove(&share_id);

        if let Some(mut share) = share {
            let _ = share.child.kill();
            let _ = share.child.wait();
            share.server_stop.store(true, Ordering::Relaxed);
            if let Some(handle) = share.server_thread.take() {
                let _ = handle.join();
            }
            let _ = fs::remove_dir_all(share.dir);
        }

        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn create_r2_public_image_urls(
    app_handle: tauri::AppHandle,
    sources: Vec<String>,
) -> Result<CloudflaredPublicImageUrls, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if sources.is_empty() {
            return Err("没有需要上传到 R2 的本地参考图".to_string());
        }

        let config = read_r2_local_config(&app_handle)?;
        let client = build_http_client(Some(&app_handle), None, 30)?;
        let suffix = short_r2_share_suffix();
        let share_id = format!("r2_{}", suffix);
        let mut keys: Vec<String> = Vec::new();
        let mut urls: Vec<String> = Vec::new();

        for (index, source) in sources.iter().take(13).enumerate() {
            let object = match source_to_r2_object(source) {
                Ok(value) => value,
                Err(err) => {
                    for key in &keys {
                        let _ = delete_r2_object(&client, &config, key);
                    }
                    return Err(err);
                }
            };
            let key = r2_object_key(&config, &suffix, index, &object.ext);
            if let Err(err) = upload_r2_object(&client, &config, &key, &object) {
                for key in &keys {
                    let _ = delete_r2_object(&client, &config, key);
                }
                return Err(err);
            }
            urls.push(r2_object_public_url(&config, &key));
            keys.push(key);
        }

        if urls.is_empty() {
            return Err("R2 没有返回可用公网 URL".to_string());
        }

        r2_shares()
            .lock()
            .map_err(|_| "R2 临时分享状态锁定失败".to_string())?
            .insert(share_id.clone(), R2Share { config, keys });

        Ok(CloudflaredPublicImageUrls { share_id, urls })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn create_oss_public_image_urls(
    app_handle: tauri::AppHandle,
    sources: Vec<String>,
) -> Result<CloudflaredPublicImageUrls, String> {
    if sources.is_empty() {
        return Err("没有需要上传到 OSS 的本地参考图".to_string());
    }
    let images = tauri::async_runtime::spawn_blocking(move || {
        use base64::{engine::general_purpose, Engine as _};
        sources.iter().take(13).enumerate().map(|(index, source)| {
            let object = source_to_r2_object(source)?;
            if !object.content_type.starts_with("image/") {
                return Err("OSS 参考图桥接仅支持图片".to_string());
            }
            Ok(OssReferenceImageUpload {
                filename: format!("reference-{}.{}", index, object.ext),
                mime: object.content_type,
                data: general_purpose::STANDARD.encode(object.bytes),
            })
        }).collect::<Result<Vec<_>, String>>()
    }).await.map_err(|error| error.to_string())??;

    let access_token = commands::license::cloud_access_token(&app_handle).await?;
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|error| format!("OSS 参考图连接初始化失败：{error}"))?;
    let response = client
        .post("https://api.unmind.art/v1/ai/reference-images")
        .bearer_auth(access_token)
        .header("x-client-version", env!("CARGO_PKG_VERSION"))
        .header("x-wallet-protocol", "1")
        .json(&serde_json::json!({ "images": images }))
        .send().await
        .map_err(|error| format!("OSS 参考图上传失败：{error}"))?;
    let status = response.status();
    let body = response.text().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(format!("OSS 参考图上传失败（{}）：{}", status.as_u16(), body));
    }
    serde_json::from_str(&body).map_err(|error| format!("OSS 参考图响应无效：{error}"))
}

#[tauri::command]
async fn delete_oss_public_image_urls(
    app_handle: tauri::AppHandle,
    share_id: String,
) -> Result<(), String> {
    if !share_id.chars().all(|value| value.is_ascii_alphanumeric() || value == '-') {
        return Err("OSS 临时分享 ID 无效".to_string());
    }
    let access_token = commands::license::cloud_access_token(&app_handle).await?;
    let response = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(30))
        .build().map_err(|error| error.to_string())?
        .delete(format!("https://api.unmind.art/v1/ai/reference-images/{share_id}"))
        .bearer_auth(access_token)
        .header("x-client-version", env!("CARGO_PKG_VERSION"))
        .header("x-wallet-protocol", "1")
        .send().await
        .map_err(|error| format!("OSS 临时参考图清理失败：{error}"))?;
    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!("OSS 临时参考图清理失败（{}）", response.status().as_u16()))
    }
}

#[tauri::command]
async fn delete_r2_public_image_urls(
    app_handle: tauri::AppHandle,
    share_id: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let share = r2_shares()
            .lock()
            .map_err(|_| "R2 临时分享状态锁定失败".to_string())?
            .remove(&share_id);

        let Some(share) = share else {
            return Ok(());
        };

        let client = build_http_client(Some(&app_handle), None, 90)?;
        let mut last_error = String::new();
        for key in &share.keys {
            if let Err(err) = delete_r2_object(&client, &share.config, key) {
                last_error = err;
            }
        }
        if last_error.is_empty() {
            Ok(())
        } else {
            Err(format!("R2 临时参考图清理失败：{}", last_error))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn create_litterbox_public_image_urls(
    app_handle: tauri::AppHandle,
    sources: Vec<String>,
    time: Option<String>,
) -> Result<CloudflaredPublicImageUrls, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if sources.is_empty() {
            return Err("没有需要上传到 Litterbox 的本地参考图".to_string());
        }

        let client = build_http_client(Some(&app_handle), None, 30)?;
        let suffix = short_r2_share_suffix();
        let expiration = normalize_litterbox_expiration(time);
        let mut urls: Vec<String> = Vec::new();

        for (index, source) in sources.iter().take(13).enumerate() {
            let object = source_to_r2_object(source)?;
            let file_name = litterbox_file_name(&suffix, index, &object.ext);
            let url = upload_litterbox_object(&client, object, file_name, &expiration)?;
            urls.push(url);
        }

        if urls.is_empty() {
            return Err("Litterbox 没有返回可用公网 URL".to_string());
        }

        Ok(CloudflaredPublicImageUrls {
            share_id: format!("litterbox_{}", suffix),
            urls,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn create_tmpfiles_public_image_urls(
    app_handle: tauri::AppHandle,
    sources: Vec<String>,
) -> Result<CloudflaredPublicImageUrls, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if sources.is_empty() {
            return Err("没有需要上传到 Tmpfiles 的本地参考图".to_string());
        }

        let client = build_http_client(Some(&app_handle), None, 180)?;
        let suffix = short_r2_share_suffix();
        let mut urls: Vec<String> = Vec::new();

        for (index, source) in sources.iter().take(13).enumerate() {
            let object = source_to_r2_object(source)?;
            let file_name = litterbox_file_name(&suffix, index, &object.ext);
            let url = upload_tmpfiles_object(&client, object, file_name)?;
            urls.push(url);
        }

        if urls.is_empty() {
            return Err("Tmpfiles 没有返回可用的公网图片 URL".to_string());
        }

        Ok(CloudflaredPublicImageUrls {
            share_id: format!("tmpfiles_{}", suffix),
            urls,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cache_web_image(
    app_handle: tauri::AppHandle,
    url: String,
    name: Option<String>,
    dir: Option<String>,
    proxy: Option<String>,
) -> Result<String, String> {
    let url = if is_wallet_ai_image_result_source(url.trim()) {
        let access_token = commands::license::cloud_access_token(&app_handle).await?;
        let resolver_handle = app_handle.clone();
        tauri::async_runtime::spawn_blocking(move || {
            resolve_ai_image_result_url_blocking(&resolver_handle, url.trim(), &access_token)
        })
        .await
        .map_err(|error| error.to_string())??
    } else {
        url
    };
    tauri::async_runtime::spawn_blocking(move || {
        cache_web_image_impl(app_handle, url, name, dir, proxy)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cache_web_image_to_dir(
    app_handle: tauri::AppHandle,
    url: String,
    name: Option<String>,
    dir: String,
    proxy: Option<String>,
) -> Result<String, String> {
    // 专门给“设置里的网页图片缓存路径”使用，参数名保持简单的 dir。
    // 避开 cache_dir / cacheDir 在 Tauri 参数映射里的歧义。
    tauri::async_runtime::spawn_blocking(move || {
        cache_web_image_impl(app_handle, url, name, Some(dir), proxy)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn url_encode_component(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.as_bytes() {
        let c = *byte as char;
        if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '~') {
            encoded.push(c);
        } else if c == ' ' {
            encoded.push('+');
        } else {
            encoded.push_str(&format!("%{:02X}", byte));
        }
    }
    encoded
}

fn extract_between<'a>(text: &'a str, start: &str, end: char) -> Option<&'a str> {
    let start_index = text.find(start)? + start.len();
    let rest = &text[start_index..];
    let end_index = rest.find(end)?;
    Some(&rest[..end_index])
}

fn extract_duckduckgo_vqd(page: &str) -> Option<String> {
    for pattern in ["vqd=\"", "vqd='", "vqd="] {
        if let Some(value) = extract_between(
            page,
            pattern,
            if pattern.ends_with('"') {
                '"'
            } else if pattern.ends_with('\'') {
                '\''
            } else {
                '&'
            },
        ) {
            let clean = value
                .trim()
                .trim_matches('"')
                .trim_matches('\'')
                .trim_matches(';')
                .trim_matches(',')
                .to_string();
            if !clean.is_empty() {
                return Some(clean);
            }
        }
    }
    None
}

fn collect_duckduckgo_image_candidates(
    app_handle: &tauri::AppHandle,
    query: &str,
    limit: usize,
    explicit_proxy: Option<&str>,
) -> Result<Vec<(String, String, String)>, String> {
    let encoded_query = url_encode_component(query);
    let client = build_http_client(Some(app_handle), explicit_proxy, 45)?;
    let page_url = format!(
        "https://duckduckgo.com/?q={}&iax=images&ia=images",
        encoded_query
    );
    let page = client
        .get(&page_url)
        .header(
            reqwest::header::ACCEPT,
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .send()
        .map_err(|e| format!("打开搜图页失败：{}", e))?
        .text()
        .map_err(|e| format!("读取搜图页失败：{}", e))?;
    let vqd =
        extract_duckduckgo_vqd(&page).ok_or_else(|| "没有拿到搜图令牌，请稍后重试".to_string())?;
    let api_url = format!(
        "https://duckduckgo.com/i.js?l=wt-wt&o=json&q={}&vqd={}&f=,,,&p=1",
        encoded_query,
        url_encode_component(&vqd)
    );
    let value: serde_json::Value = client
        .get(&api_url)
        .header(reqwest::header::ACCEPT, "application/json, text/plain, */*")
        .header(reqwest::header::REFERER, page_url)
        .send()
        .map_err(|e| format!("请求搜图结果失败：{}", e))?
        .json()
        .map_err(|e| format!("解析搜图结果失败：{}", e))?;

    let mut seen = HashSet::new();
    let mut out = Vec::new();
    if let Some(results) = value.get("results").and_then(|value| value.as_array()) {
        for item in results {
            let Some(object) = item.as_object() else {
                continue;
            };
            let image_url = get_json_string(object, &["image", "url", "thumbnail"]);
            let Some(image_url) = image_url else {
                continue;
            };
            let image_url = image_url.trim().to_string();
            if !image_url.starts_with("http://") && !image_url.starts_with("https://") {
                continue;
            }
            if !seen.insert(image_url.clone()) {
                continue;
            }
            let title = get_json_string(object, &["title"])
                .unwrap_or_else(|| query.to_string())
                .trim()
                .chars()
                .take(80)
                .collect::<String>();
            let page_url = get_json_string(object, &["url", "source", "host"]).unwrap_or_default();
            out.push((title, image_url, page_url));
            if out.len() >= limit {
                break;
            }
        }
    }

    if out.is_empty() {
        Err("没有找到可用图片结果".to_string())
    } else {
        Ok(out)
    }
}

#[tauri::command]
async fn collect_web_images(
    app_handle: tauri::AppHandle,
    query: String,
    count: Option<u32>,
    dir: Option<String>,
    proxy: Option<String>,
) -> Result<Vec<CollectedWebImage>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let clean_query = query.trim();
        if clean_query.is_empty() {
            return Err("请输入要收集的图片关键词".to_string());
        }
        let target_count = count.unwrap_or(10).clamp(1, 30) as usize;
        let candidates = collect_duckduckgo_image_candidates(
            &app_handle,
            clean_query,
            (target_count * 4).max(20),
            proxy.as_deref(),
        )?;

        let mut collected = Vec::new();
        let mut last_error = String::new();
        for (index, (title, image_url, page_url)) in candidates.into_iter().enumerate() {
            if collected.len() >= target_count {
                break;
            }
            let ext = image_ext_from_name_or_url(&image_url).unwrap_or_else(|| "jpg".to_string());
            let name = format!(
                "{}_{:02}.{}",
                sanitize_file_name(clean_query),
                index + 1,
                ext
            );
            match cache_web_image_impl(
                app_handle.clone(),
                image_url.clone(),
                Some(name),
                dir.clone(),
                proxy.clone(),
            ) {
                Ok(path) => collected.push(CollectedWebImage {
                    title: if title.trim().is_empty() {
                        clean_query.to_string()
                    } else {
                        title
                    },
                    image_url,
                    page_url,
                    path,
                }),
                Err(err) => {
                    last_error = err;
                }
            }
        }

        if collected.is_empty() {
            Err(if last_error.is_empty() {
                "没有成功缓存图片，请换个关键词再试".to_string()
            } else {
                format!("没有成功缓存图片：{}", last_error)
            })
        } else {
            Ok(collected)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

fn huaban_pin_id_from_url(input: &str) -> Option<String> {
    let parsed = Url::parse(input.trim()).ok()?;
    let host = parsed.host_str()?.to_ascii_lowercase();
    if host != "huaban.com" && !host.ends_with(".huaban.com") {
        return None;
    }
    let mut segments = parsed.path_segments()?;
    if segments.next()? != "pins" {
        return None;
    }
    let pin_id = segments.next()?.trim();
    if pin_id.is_empty() || !pin_id.chars().all(|ch| ch.is_ascii_digit()) {
        return None;
    }
    Some(pin_id.to_string())
}

fn huaban_image_url_from_api_json(value: &serde_json::Value) -> Option<String> {
    let file = value.get("pin")?.get("file")?;
    let file_type = file
        .get("type")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("");
    if !file_type.to_ascii_lowercase().starts_with("image/") {
        return None;
    }
    file.get("url")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|url| url.starts_with("http://") || url.starts_with("https://"))
        .map(str::to_string)
}

fn resolve_huaban_pin_image_url(
    app_handle: &tauri::AppHandle,
    input: &str,
    explicit_proxy: Option<&str>,
) -> Result<Option<String>, String> {
    let Some(pin_id) = huaban_pin_id_from_url(input) else {
        return Ok(None);
    };
    let api_url = format!("https://api.huaban.com/pins/{pin_id}");
    let client = build_http_client(Some(app_handle), explicit_proxy, 45)?;
    let response = client
        .get(&api_url)
        .header(reqwest::header::ACCEPT, "application/json, text/plain, */*")
        .header(reqwest::header::REFERER, input)
        .send()
        .map_err(|e| format!("解析花瓣图片地址失败：{}", e))?;
    if !response.status().is_success() {
        return Err(format!(
            "解析花瓣图片地址失败：HTTP 状态码 {}",
            response.status()
        ));
    }
    let value = response
        .json::<serde_json::Value>()
        .map_err(|e| format!("解析花瓣图片 JSON 失败：{}", e))?;
    let image_url = huaban_image_url_from_api_json(&value)
        .ok_or_else(|| "花瓣 pin 没有返回可用图片地址".to_string())?;
    Ok(Some(image_url))
}

fn is_obvious_non_media_content_type(content_type: &str) -> bool {
    let lower = content_type.to_ascii_lowercase();
    lower.starts_with("text/html")
        || lower.starts_with("text/plain")
        || lower.starts_with("application/json")
        || lower.starts_with("application/xml")
        || lower.starts_with("text/xml")
}

fn cache_web_image_impl(
    app_handle: tauri::AppHandle,
    url: String,
    name: Option<String>,
    cache_dir: Option<String>,
    proxy: Option<String>,
) -> Result<String, String> {
    let input = url.trim();
    if input.is_empty() {
        return Err("empty web image url".to_string());
    }
    let nested_input = extract_nested_image_url(input);
    let input = nested_input.as_deref().unwrap_or(input);
    let resolved_input = resolve_huaban_pin_image_url(&app_handle, input, proxy.as_deref())?;
    let input = resolved_input.as_deref().unwrap_or(input);

    // 优先使用前端传来的最新缓存路径；如果没有传，再读取后端保存的设置。
    // 这样可以避免拖拽监听和配置文件不同步时继续写入默认缓存目录。
    let dir = cache_dir
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| normalize_web_image_cache_dir(&app_handle, value))
        .unwrap_or_else(|| read_web_image_cache_dir(&app_handle));

    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let saved_dir = dir.canonicalize().unwrap_or_else(|_| dir.clone());
    let _ = fs::write(
        web_image_cache_config_path(&app_handle),
        saved_dir.to_string_lossy().as_bytes(),
    );
    let dir = saved_dir;

    let requested_name = name
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "网页图片".to_string());
    let mut safe_name = sanitize_file_name(&requested_name);

    let ext = if let Some(ext) = image_ext_from_name_or_url(&safe_name) {
        ext
    } else if input.starts_with("data:") {
        let comma = input
            .find(',')
            .ok_or_else(|| "invalid data url".to_string())?;
        image_ext_from_mime(&input[..comma]).to_string()
    } else {
        image_ext_from_name_or_url(input)
            .or_else(|| {
                image_ext_from_name_or_url(&requested_name)
                    .filter(|value| is_supported_media_ext(value))
            })
            .unwrap_or_else(|| "png".to_string())
    };

    if image_ext_from_name_or_url(&safe_name).is_none() {
        safe_name = format!("{}.{}", safe_name, ext);
    }

    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let mut out_path = dir.join(format!("{}_{}", stamp, safe_name));

    if input.starts_with("data:") {
        let (mime, bytes) = decode_data_url(input)?;
        let mime_ext = image_ext_from_mime(&mime);
        out_path = replace_media_extension(&out_path, mime_ext);
        let _cache_guard = local_media_cache_write_lock()
            .lock()
            .map_err(|_| "local media cache lock poisoned".to_string())?;
        if let Some(existing) = find_identical_bytes_in_dir(&bytes, mime_ext, &dir)? {
            return Ok(display_local_path(&existing));
        }
        fs::write(&out_path, bytes).map_err(|e| e.to_string())?;
        return Ok(display_local_path(&out_path));
    }

    if input.starts_with("http://") || input.starts_with("https://") {
        let content_type = match download_url_to_file_with_timeout(
            &app_handle,
            input,
            &out_path,
            proxy.as_deref(),
            45,
        ) {
            Ok(value) => value,
            Err(err) => {
                let _ = fs::remove_file(&out_path);
                return Err(format!("缓存网页图片失败：{}", err));
            }
        };
        if content_type
            .as_deref()
            .map(is_obvious_non_media_content_type)
            .unwrap_or(false)
        {
            let _ = fs::remove_file(&out_path);
            return Err(format!(
                "下载结果不是图片或视频：{}",
                content_type.unwrap_or_default()
            ));
        }
        if let Some(mime_ext) = content_type.as_deref().and_then(media_ext_from_mime) {
            let next_path = replace_media_extension(&out_path, mime_ext);
            if next_path != out_path {
                if let Err(err) = fs::rename(&out_path, &next_path) {
                    let _ = fs::copy(&out_path, &next_path).map_err(|copy_err| {
                        format!("{}；fallback copy failed: {}", err, copy_err)
                    })?;
                    let _ = fs::remove_file(&out_path);
                }
                out_path = next_path;
            }
        }
        let _cache_guard = local_media_cache_write_lock()
            .lock()
            .map_err(|_| "local media cache lock poisoned".to_string())?;
        if let Some(existing) = find_identical_file_in_dir(&out_path, &dir, Some(&out_path))? {
            let _ = fs::remove_file(&out_path);
            return Ok(display_local_path(&existing));
        }
        return Ok(display_local_path(&out_path));
    }

    Err(format!("unsupported web image source: {}", input))
}

#[tauri::command]
fn relocate_web_cache_file(
    app_handle: tauri::AppHandle,
    path: String,
    dir: String,
) -> Result<String, String> {
    let source = local_path_from_url_like(&path).unwrap_or_else(|| PathBuf::from(&path));
    if !source.is_file() {
        return Ok(path);
    }

    let ext = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !matches!(
        ext.as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg"
    ) {
        return Ok(source.to_string_lossy().to_string());
    }

    let source_canon = source.canonicalize().unwrap_or_else(|_| source.clone());
    let app_data_dir = get_user_data_dir(&app_handle)
        .canonicalize()
        .unwrap_or_else(|_| get_user_data_dir(&app_handle));
    let default_cache_dir = default_web_image_cache_dir(&app_handle)
        .canonicalize()
        .unwrap_or_else(|_| default_web_image_cache_dir(&app_handle));
    let temp_dir = std::env::temp_dir()
        .canonicalize()
        .unwrap_or_else(|_| std::env::temp_dir());

    let target_dir_raw = normalize_web_image_cache_dir(&app_handle, &dir);
    fs::create_dir_all(&target_dir_raw).map_err(|e| e.to_string())?;
    let target_dir = target_dir_raw
        .canonicalize()
        .unwrap_or_else(|_| target_dir_raw.clone());

    if source_canon.starts_with(&target_dir) {
        return Ok(source_canon.to_string_lossy().to_string());
    }

    // 只移动 App 自己生成或接收的网页临时图片，不移动用户真实文件。
    // 某些 Windows OLE/browser 拖拽链路不会给 URL，而是先把网页图保存到 App 默认缓存目录。
    // 然后把这个临时 path 发给前端。这里把这类临时文件移动到用户设置的缓存目录。
    let under_default_cache = source_canon.starts_with(&default_cache_dir);
    let under_app_data = source_canon.starts_with(&app_data_dir);
    let under_temp = source_canon.starts_with(&temp_dir);
    if !under_default_cache && !under_app_data && !under_temp {
        return Ok(source_canon.to_string_lossy().to_string());
    }

    let _cache_guard = local_media_cache_write_lock()
        .lock()
        .map_err(|_| "local media cache lock poisoned".to_string())?;
    if let Some(existing) = find_identical_file_in_dir(&source_canon, &target_dir, None)? {
        let _ = fs::remove_file(&source_canon);
        return Ok(display_local_path(&existing));
    }

    let file_name = source_canon
        .file_name()
        .and_then(|value| value.to_str())
        .map(|value| sanitize_file_name(value))
        .unwrap_or_else(|| format!("web_image_{}.{}", now_millis_u128(), ext));

    let mut target = target_dir.join(&file_name);
    if target.exists() {
        let stem = target
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("web_image")
            .to_string();
        let ext_part = target
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| format!(".{}", value))
            .unwrap_or_default();
        target = target_dir.join(format!("{}_{}{}", stem, now_millis_u128(), ext_part));
    }

    match fs::rename(&source_canon, &target) {
        Ok(_) => Ok(target.to_string_lossy().to_string()),
        Err(_) => {
            fs::copy(&source_canon, &target).map_err(|e| e.to_string())?;
            let _ = fs::remove_file(&source_canon);
            Ok(target.to_string_lossy().to_string())
        }
    }
}

#[tauri::command]
fn load_ai_analysis_config(app_handle: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = get_user_data_dir(&app_handle).join("ai_analysis_config.json");
    if path.exists() {
        let content = fs::read_to_string(path).unwrap_or_else(|_| "{}".to_string());
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(serde_json::json!({
            "provider": "siliconflow",
            "endpoint": "https://api.siliconflow.cn/v1",
            "apiKey": "",
            "model": "Qwen/Qwen3-VL-32B-Instruct"
        }))
    }
}

#[tauri::command]
fn save_ai_analysis_config(
    app_handle: tauri::AppHandle,
    config: serde_json::Value,
) -> Result<(), String> {
    let path = get_user_data_dir(&app_handle).join("ai_analysis_config.json");
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}

fn value_as_string(config: &serde_json::Value, key: &str) -> String {
    config
        .get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

fn guess_mime_from_path(path: &std::path::Path) -> &'static str {
    match path
        .extension()
        .and_then(|v| v.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "avi" => "video/x-msvideo",
        "mkv" => "video/x-matroska",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" | "opus" => "audio/ogg",
        "flac" => "audio/flac",
        "aac" => "audio/aac",
        "m4a" => "audio/mp4",
        "aiff" => "audio/aiff",
        "wma" => "audio/x-ms-wma",
        "json" => "application/json; charset=utf-8",
        "wasm" => "application/wasm",
        "onnx" => "application/octet-stream",
        "txt" => "text/plain; charset=utf-8",
        _ => "image/png",
    }
}

fn is_ai_supported_image_mime(mime: &str) -> bool {
    matches!(
        mime.to_ascii_lowercase().as_str(),
        "image/png" | "image/jpeg" | "image/jpg" | "image/webp" | "image/gif"
    )
}

fn image_bytes_to_png_data_url(bytes: &[u8]) -> Result<String, String> {
    let image = screenshots::image::load_from_memory(bytes)
        .map_err(|e| format!("参考图格式转换失败：{}", e))?
        .to_rgba8();
    let mut png_bytes = Vec::new();
    let encoder = screenshots::image::codecs::png::PngEncoder::new_with_quality(
        &mut png_bytes,
        screenshots::image::codecs::png::CompressionType::Fast,
        screenshots::image::codecs::png::FilterType::NoFilter,
    );
    screenshots::image::ImageEncoder::write_image(
        encoder,
        image.as_raw(),
        image.width(),
        image.height(),
        screenshots::image::ColorType::Rgba8,
    )
    .map_err(|e| format!("参考图 PNG 编码失败：{}", e))?;
    use base64::{engine::general_purpose, Engine as _};
    Ok(format!(
        "data:image/png;base64,{}",
        general_purpose::STANDARD.encode(png_bytes)
    ))
}

fn image_source_for_ai(input: &str) -> Result<String, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("empty image source".to_string());
    }

    if trimmed.starts_with("data:image/") {
        let (bytes, mime) = decode_data_image(trimmed)?;
        if is_ai_supported_image_mime(&mime) {
            return Ok(trimmed.to_string());
        }
        return image_bytes_to_png_data_url(&bytes);
    }

    let local_path = local_path_from_url_like(trimmed);
    if let Some(path) = local_path.as_ref() {
        if !path.exists() || !path.is_file() {
            return Err("local image source does not exist or is not a file".to_string());
        }
    }

    if local_path.is_none() && (trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
        return Ok(trimmed.to_string());
    }

    let path = local_path.unwrap_or_else(|| PathBuf::from(trimmed));
    if path.exists() && path.is_file() {
        let bytes = fs::read(&path).map_err(|e| e.to_string())?;
        let mime = guess_mime_from_path(&path);
        if !is_ai_supported_image_mime(mime) {
            return image_bytes_to_png_data_url(&bytes);
        }
        use base64::{engine::general_purpose, Engine as _};
        let b64 = general_purpose::STANDARD.encode(bytes);
        return Ok(format!("data:{};base64,{}", mime, b64));
    }

    Ok(trimmed.to_string())
}

#[tauri::command]
async fn read_local_image_data_url(path: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let data_url = image_source_for_ai(&path)?;
        if data_url.starts_with("data:image/") {
            Ok(data_url)
        } else {
            Err("local image could not be converted to a data URL".to_string())
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

fn build_siliconflow_image_search_query_body(
    model: &str,
    image_url: &str,
    hint: &str,
) -> Result<serde_json::Value, String> {
    let user_text = format!(
        "请根据参考图做图片检索标签识别，只输出严格 JSON 对象，不要 Markdown，不要解释。JSON 字段：subject=图片里最主要的东西，必须是具体物件/空间/人物/建筑/平面视觉等；style=图片风格，无法判断则为空字符串；materials=材质标签数组；colors=色彩标签数组；composition=构图/光线/关键元素标签数组；tags=最终用于搜图的 4-8 个短标签，第一项必须是 subject，第二项优先是 style，不要写“设计”“图片”“参考图”这类泛词；query=把 tags 组合成一行适合网络搜图的简体中文关键词。只有画面明显是文字排版、广告、展览视觉或印刷物时，subject 才能写海报/平面海报。用户补充：{}",
        if hint.trim().is_empty() { "无" } else { hint.trim() }
    );

    Ok(serde_json::json!({
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "你是视觉检索标签生成器。你的输出会直接用于网络搜图和用户可编辑标签，只能返回一个严格 JSON 对象。"
            },
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": image_url,
                            "detail": "high"
                        }
                    },
                    {
                        "type": "text",
                        "text": user_text
                    }
                ]
            }
        ],
        "temperature": 0.2,
        "top_p": 0.7,
        "max_tokens": 320,
        "stream": false
    }))
}

fn clean_image_search_query(text: &str) -> String {
    let mut clean = text
        .trim()
        .trim_matches('`')
        .trim_matches('"')
        .trim_matches('\'')
        .trim_matches('“')
        .trim_matches('”')
        .replace(['\r', '\n', '\t'], " ");

    for prefix in [
        "关键词：",
        "搜索词：",
        "检索词：",
        "关键词:",
        "搜索词:",
        "检索词:",
    ] {
        if let Some(rest) = clean.trim_start().strip_prefix(prefix) {
            clean = rest.trim().to_string();
        }
    }

    clean
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(96)
        .collect::<String>()
        .trim()
        .to_string()
}

fn clean_image_search_tag(text: &str) -> String {
    let clean = text
        .trim()
        .trim_matches('`')
        .trim_matches('"')
        .trim_matches('\'')
        .trim_matches('“')
        .trim_matches('”')
        .trim_matches('「')
        .trim_matches('」')
        .trim_matches('《')
        .trim_matches('》')
        .replace(['\r', '\n', '\t', ',', '，', '、'], " ");

    clean
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(24)
        .collect::<String>()
        .trim()
        .to_string()
}

fn push_image_search_tag(tags: &mut Vec<String>, value: &str) {
    let tag = clean_image_search_tag(value);
    if tag.is_empty() || tags.len() >= 8 || tags.iter().any(|existing| existing == &tag) {
        return;
    }
    tags.push(tag);
}

fn collect_image_search_tags(tags: &mut Vec<String>, value: Option<&serde_json::Value>) {
    match value {
        Some(serde_json::Value::String(text)) => push_image_search_tag(tags, text),
        Some(serde_json::Value::Array(items)) => {
            for item in items {
                collect_image_search_tags(tags, Some(item));
            }
        }
        _ => {}
    }
}

fn split_image_search_tags_from_query(query: &str) -> Vec<String> {
    let mut tags = Vec::new();
    for part in query.split(|ch: char| ch.is_whitespace() || matches!(ch, ',' | '，' | '、')) {
        push_image_search_tag(&mut tags, part);
    }
    tags
}

fn normalize_image_search_description(content: &str) -> serde_json::Value {
    let parsed = extract_json_object_text(content)
        .and_then(|json_text| serde_json::from_str::<serde_json::Value>(&json_text).ok())
        .filter(|value| value.is_object());

    let subject = parsed
        .as_ref()
        .map(|value| clean_image_search_tag(&value_as_string(value, "subject")))
        .unwrap_or_default();
    let style = parsed
        .as_ref()
        .map(|value| clean_image_search_tag(&value_as_string(value, "style")))
        .unwrap_or_default();

    let mut tags = Vec::new();
    push_image_search_tag(&mut tags, &subject);
    push_image_search_tag(&mut tags, &style);

    if let Some(value) = parsed.as_ref() {
        collect_image_search_tags(&mut tags, value.get("tags"));
        collect_image_search_tags(&mut tags, value.get("keywords"));
        collect_image_search_tags(&mut tags, value.get("materials"));
        collect_image_search_tags(&mut tags, value.get("material"));
        collect_image_search_tags(&mut tags, value.get("colors"));
        collect_image_search_tags(&mut tags, value.get("color"));
        collect_image_search_tags(&mut tags, value.get("composition"));
        collect_image_search_tags(&mut tags, value.get("elements"));
    }

    let model_query = parsed
        .as_ref()
        .map(|value| value_as_string(value, "query"))
        .unwrap_or_default();
    let mut query = clean_image_search_query(if model_query.trim().is_empty() {
        content
    } else {
        &model_query
    });

    if tags.is_empty() {
        tags = split_image_search_tags_from_query(&query);
    }
    if query.is_empty() && !tags.is_empty() {
        query = tags.join(" ");
    }

    serde_json::json!({
        "subject": subject,
        "style": style,
        "tags": tags,
        "query": query,
    })
}

const OLLAMA_VISION_CHAT_URL: &str = "http://127.0.0.1:11434/api/chat";
const OLLAMA_TAGS_URL: &str = "http://127.0.0.1:11434/api/tags";
const OLLAMA_PULL_URL: &str = "http://127.0.0.1:11434/api/pull";
const OLLAMA_DEFAULT_VISION_MODEL: &str = "qwen2.5vl:3b";
const OLLAMA_UNAVAILABLE_MESSAGE: &str =
    "未检测到 Ollama 服务，无法下载本地大模型。请先安装并启动 Ollama，然后重试。";

fn normalize_ollama_vision_model(model: Option<String>) -> String {
    let model = model.unwrap_or_else(|| OLLAMA_DEFAULT_VISION_MODEL.to_string());
    let model = model.trim();
    if model.is_empty() {
        OLLAMA_DEFAULT_VISION_MODEL.to_string()
    } else {
        model.to_string()
    }
}

fn ollama_model_names_equal(left: &str, right: &str) -> bool {
    let normalize = |value: &str| {
        let trimmed = value.trim().to_ascii_lowercase();
        if trimmed.contains(':') {
            trimmed
        } else {
            format!("{}:latest", trimmed)
        }
    };
    normalize(left) == normalize(right)
}

fn read_ollama_model_ready(model: &str) -> Result<bool, String> {
    let client = build_direct_http_client(8)?;
    let response = client
        .get(OLLAMA_TAGS_URL)
        .send()
        .map_err(|e| format!("{} 原因：{}", OLLAMA_UNAVAILABLE_MESSAGE, e))?;
    let status = response.status();
    let raw = response
        .text()
        .map_err(|e| format!("读取 Ollama 模型列表失败：{}", e))?;
    if !status.is_success() {
        return Err(format!("读取 Ollama 模型列表失败 HTTP {}：{}", status, raw));
    }
    let parsed: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| format!("解析 Ollama 模型列表失败：{}；原始返回：{}", e, raw))?;
    let models = parsed
        .get("models")
        .and_then(|value| value.as_array())
        .ok_or_else(|| format!("Ollama 模型列表格式异常：{}", parsed))?;
    Ok(models.iter().any(|item| {
        item.get("name")
            .and_then(|value| value.as_str())
            .map(|name| ollama_model_names_equal(name, model))
            .unwrap_or(false)
    }))
}

fn ollama_executable_candidates() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    paths.push(PathBuf::from("ollama"));

    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            paths.push(
                PathBuf::from(local_app_data)
                    .join("Programs")
                    .join("Ollama")
                    .join("ollama.exe"),
            );
        }
        if let Ok(program_files) = std::env::var("ProgramFiles") {
            paths.push(
                PathBuf::from(program_files)
                    .join("Ollama")
                    .join("ollama.exe"),
            );
        }
        if let Ok(program_files_x86) = std::env::var("ProgramFiles(x86)") {
            paths.push(
                PathBuf::from(program_files_x86)
                    .join("Ollama")
                    .join("ollama.exe"),
            );
        }
    }

    paths
}

fn try_spawn_ollama_service() -> Result<(), String> {
    let mut errors = Vec::new();
    for path in ollama_executable_candidates() {
        let mut cmd = SysCommand::new(&path);
        hide_console_window(&mut cmd);
        cmd.arg("serve")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());

        match cmd.spawn() {
            Ok(_) => return Ok(()),
            Err(err) => errors.push(format!("{}: {}", path.display(), err)),
        }
    }

    Err(if errors.is_empty() {
        OLLAMA_UNAVAILABLE_MESSAGE.to_string()
    } else {
        format!(
            "{} 尝试启动失败：{}",
            OLLAMA_UNAVAILABLE_MESSAGE,
            errors.join("；")
        )
    })
}

fn wait_for_ollama_service_ready(timeout: Duration) -> Result<(), String> {
    let started_at = Instant::now();
    let mut last_error = String::new();
    while started_at.elapsed() < timeout {
        match read_ollama_model_ready(OLLAMA_DEFAULT_VISION_MODEL) {
            Ok(_) => return Ok(()),
            Err(err) => {
                last_error = err;
                let _ = try_spawn_ollama_service();
                thread::sleep(Duration::from_millis(1000));
            }
        }
    }

    Err(if last_error.is_empty() {
        OLLAMA_UNAVAILABLE_MESSAGE.to_string()
    } else {
        last_error
    })
}

fn ollama_model_ready(model: &str) -> Result<bool, String> {
    match read_ollama_model_ready(model) {
        Ok(ready) => Ok(ready),
        Err(first_err) => {
            let _ = try_spawn_ollama_service();
            thread::sleep(Duration::from_millis(1200));
            read_ollama_model_ready(model).map_err(|second_err| {
                format!(
                    "{} 首次连接失败：{}；重试失败：{}",
                    OLLAMA_UNAVAILABLE_MESSAGE, first_err, second_err
                )
            })
        }
    }
}

fn pull_ollama_vision_model(app_handle: &tauri::AppHandle, model: &str) -> Result<(), String> {
    let client = build_direct_http_client(3600)?;
    let response = client
        .post(OLLAMA_PULL_URL)
        .json(&serde_json::json!({
            "name": model,
            "stream": true
        }))
        .send()
        .map_err(|e| {
            format!(
                "启动本地大模型下载失败：{}。{}",
                e, OLLAMA_UNAVAILABLE_MESSAGE
            )
        })?;

    let status = response.status();
    if !status.is_success() {
        let raw = response.text().unwrap_or_default();
        return Err(format!("本地大模型下载失败 HTTP {}：{}", status, raw));
    }

    let mut reader = BufReader::new(response);
    let mut line = String::new();
    let mut last_progress = 3.0;
    loop {
        line.clear();
        let read = reader
            .read_line(&mut line)
            .map_err(|e| format!("读取本地大模型下载进度失败：{}", e))?;
        if read == 0 {
            break;
        }
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let value: serde_json::Value = serde_json::from_str(trimmed)
            .map_err(|e| format!("解析本地大模型下载进度失败：{}；内容：{}", e, trimmed))?;
        if let Some(error) = value.get("error").and_then(|item| item.as_str()) {
            return Err(format!("本地大模型下载失败：{}", error));
        }

        let completed = value
            .get("completed")
            .and_then(|item| item.as_u64())
            .unwrap_or(0);
        let total = value
            .get("total")
            .and_then(|item| item.as_u64())
            .unwrap_or(0);
        let status_text = value
            .get("status")
            .and_then(|item| item.as_str())
            .unwrap_or("正在下载");
        let progress = if total > 0 {
            (completed as f64 * 100.0 / total as f64).clamp(last_progress, 99.0)
        } else if status_text.contains("success") {
            100.0
        } else {
            (last_progress + 0.4).min(12.0)
        };
        last_progress = progress;

        emit_local_vision_model_progress(
            app_handle,
            "downloading",
            format!("正在下载本地大模型增量包：{}", model),
            Some(model.to_string()),
            completed,
            total.max(100),
            progress,
        );
    }

    if ollama_model_ready(model)? {
        Ok(())
    } else {
        Err(format!("Ollama 下载结束，但没有在模型列表中找到 {}", model))
    }
}

fn image_source_to_ollama_base64(source: &str) -> Result<String, String> {
    let normalized = image_source_for_ai(source)?;
    if normalized.starts_with("data:image/") {
        let Some((_, payload)) = normalized.split_once(',') else {
            return Err("本地图像 data URL 格式不正确".to_string());
        };
        return Ok(payload.trim().to_string());
    }

    if normalized.starts_with("http://") || normalized.starts_with("https://") {
        let client = build_direct_http_client(120)?;
        let bytes = client
            .get(&normalized)
            .send()
            .map_err(|e| format!("读取远程参考图失败：{}", e))?
            .bytes()
            .map_err(|e| format!("读取远程参考图内容失败：{}", e))?;
        use base64::{engine::general_purpose, Engine as _};
        return Ok(general_purpose::STANDARD.encode(bytes));
    }

    Err("参考图无法转换为本地大模型需要的 Base64 图片".to_string())
}

fn ollama_image_search_prompt(hint: &str) -> String {
    format!(
        "请识别参考图并返回严格 JSON，不要 Markdown，不要解释。字段：subject=图片里最主要的具体东西；style=图片风格；materials=材质数组；colors=色彩数组；composition=构图/光线/关键元素数组；tags=4-8 个中文短标签，第一项必须是 subject，第二项优先是 style；query=把 tags 组合成适合网络搜图的一行中文关键词。不要把所有图都说成海报，只有画面明显是文字排版/广告/印刷物才写海报。用户补充：{}",
        if hint.trim().is_empty() { "无" } else { hint.trim() }
    )
}

#[tauri::command]
async fn describe_image_for_search_local_vlm(
    image_source: String,
    hint: Option<String>,
    model: Option<String>,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let model = model
            .unwrap_or_else(|| OLLAMA_DEFAULT_VISION_MODEL.to_string())
            .trim()
            .to_string();
        let model = if model.is_empty() {
            OLLAMA_DEFAULT_VISION_MODEL.to_string()
        } else {
            model
        };
        let image = image_source_to_ollama_base64(&image_source)?;
        let body = serde_json::json!({
            "model": model.clone(),
            "messages": [
                {
                    "role": "user",
                    "content": ollama_image_search_prompt(hint.as_deref().unwrap_or("")),
                    "images": [image]
                }
            ],
            "stream": false,
            "format": "json",
            "options": {
                "temperature": 0.1,
                "top_p": 0.8
            }
        });

        let client = build_direct_http_client(300)?;
        let response = client
            .post(OLLAMA_VISION_CHAT_URL)
            .json(&body)
            .send()
            .map_err(|e| {
                format!(
                    "本地 Ollama 视觉模型不可用：{}。请确认 Ollama 已启动，并已执行 ollama pull {}",
                    e, model
                )
            })?;

        let status = response.status();
        let raw = response
            .text()
            .map_err(|e| format!("读取 Ollama 响应失败：{}", e))?;
        if !status.is_success() {
            return Err(format!("Ollama 视觉模型请求失败 HTTP {}：{}", status, raw));
        }

        let parsed: serde_json::Value = serde_json::from_str(&raw)
            .map_err(|e| format!("解析 Ollama 响应失败：{}；原始返回：{}", e, raw))?;
        let content = parsed
            .get("message")
            .and_then(|message| message.get("content"))
            .and_then(|value| value.as_str())
            .or_else(|| parsed.get("response").and_then(|value| value.as_str()))
            .ok_or_else(|| format!("Ollama 响应缺少 message.content：{}", parsed))?;
        let description = normalize_image_search_description(content);
        let query = description
            .get("query")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .trim();
        if query.is_empty() {
            Err("本地 Ollama 视觉模型没有生成可用标签".to_string())
        } else {
            Ok(description)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

fn is_siliconflow_vision_model_id(id: &str) -> bool {
    let model = id.to_ascii_lowercase();
    model.contains("qwen3-vl")
        || model.contains("qwen2.5-vl")
        || model.contains("qwen2-vl")
        || model.contains("qvq")
        || model.contains("qwen3-omni")
        || model.contains("glm-4.1v")
        || model.contains("glm-4.5v")
        || model.contains("glm-v")
        || model.contains("deepseek-vl")
        || model.contains("deepseek-ocr")
        || model.contains("paddleocr-vl")
        || model.contains("step3")
        || model.contains("vision")
}

#[tauri::command]
async fn get_siliconflow_vision_models(
    app_handle: tauri::AppHandle,
    endpoint: String,
    api_key: String,
) -> Result<Vec<String>, String> {
    let config = serde_json::json!({
        "provider": "siliconflow",
        "endpoint": endpoint,
        "apiKey": api_key,
        "model": "vision-model"
    });
    let profile = resolve_vision_api_profile(&app_handle, &config)?;
    tauri::async_runtime::spawn_blocking(move || {
        let client = build_http_client(Some(&app_handle), None, 45)?;
        let mut models: Vec<String> = ai_gateway::router::list_models(&client, &profile)?
            .into_iter()
            .filter(|id| is_siliconflow_vision_model_id(id))
            .collect();
        models.sort();
        models.dedup();
        Ok(models)
    })
    .await
    .map_err(|e| format!("刷新模型列表任务失败：{}", e))?
}

#[tauri::command]
async fn get_openai_compatible_models(
    app_handle: tauri::AppHandle,
    endpoint: String,
    api_key: String,
    provider: Option<String>,
    gateway_kind: Option<license::types::AiGatewayKind>,
    model: Option<String>,
    headers: Option<BTreeMap<String, String>>,
) -> Result<Vec<String>, String> {
    let profile = canvas_request_profile(
        &app_handle,
        provider,
        gateway_kind,
        &endpoint,
        &api_key,
        model.as_deref().unwrap_or(""),
        headers,
    )?;
    tauri::async_runtime::spawn_blocking(move || {
        let client = build_http_client(Some(&app_handle), None, 45)?;
        ai_gateway::router::list_models(&client, &profile)
    })
    .await
    .map_err(|e| format!("Refresh model list task failed: {}", e))?
}

#[tauri::command]
async fn query_canvas_api_balance(
    app_handle: tauri::AppHandle,
    endpoint: String,
    api_key: String,
    provider: Option<String>,
    gateway_kind: Option<license::types::AiGatewayKind>,
    model: Option<String>,
    headers: Option<BTreeMap<String, String>>,
) -> Result<ai_gateway::ApiBalanceResult, String> {
    let profile = canvas_request_profile(
        &app_handle,
        provider,
        gateway_kind,
        &endpoint,
        &api_key,
        model.as_deref().unwrap_or(""),
        headers,
    )?;
    tauri::async_runtime::spawn_blocking(move || {
        let client = build_http_client(Some(&app_handle), None, 45)?;
        ai_gateway::router::query_api_balance(&client, &profile)
    })
    .await
    .map_err(|error| format!("查询 Canvas API 余额任务失败：{error}"))?
}

#[tauri::command]
async fn test_canvas_api_connection(
    app_handle: tauri::AppHandle,
    endpoint: String,
    api_key: String,
    provider: Option<String>,
    gateway_kind: Option<license::types::AiGatewayKind>,
    model: Option<String>,
    headers: Option<BTreeMap<String, String>>,
) -> Result<ai_gateway::GatewayConnectionResult, String> {
    let profile = canvas_request_profile(
        &app_handle,
        provider,
        gateway_kind,
        &endpoint,
        &api_key,
        model.as_deref().unwrap_or(""),
        headers,
    )?;
    tauri::async_runtime::spawn_blocking(move || {
        let client = build_http_client(Some(&app_handle), None, 45)?;
        ai_gateway::router::test_connection(&client, &profile)
    })
    .await
    .map_err(|error| format!("测试 Canvas API 连接任务失败：{error}"))?
}

fn extract_json_object_text(text: &str) -> Option<String> {
    let trimmed = text.trim();
    if trimmed.starts_with('{') && trimmed.ends_with('}') {
        return Some(trimmed.to_string());
    }

    if let Some(start) = trimmed.find("```") {
        let after = &trimmed[start + 3..];
        let after = after.strip_prefix("json").unwrap_or(after).trim_start();
        if let Some(end) = after.find("```") {
            let fenced = after[..end].trim();
            if fenced.starts_with('{') && fenced.ends_with('}') {
                return Some(fenced.to_string());
            }
        }
    }

    let start = trimmed.find('{')?;
    let end = trimmed.rfind('}')?;
    if end > start {
        Some(trimmed[start..=end].to_string())
    } else {
        None
    }
}

fn get_chat_message_content(response: &serde_json::Value) -> Result<String, String> {
    response
        .get("choices")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "Vision 响应缺少 message.content".to_string())
}

fn api_headers_from_config(config: &serde_json::Value) -> BTreeMap<String, String> {
    config
        .get("headers")
        .and_then(serde_json::Value::as_object)
        .map(|headers| {
            headers
                .iter()
                .filter_map(|(key, value)| {
                    let key = key.trim().to_string();
                    let value = value.as_str().unwrap_or_default().trim().to_string();
                    (!key.is_empty() && !value.is_empty()).then_some((key, value))
                })
                .collect()
        })
        .unwrap_or_default()
}

fn resolve_vision_api_profile(
    app_handle: &tauri::AppHandle,
    config: &serde_json::Value,
) -> Result<ai_gateway::EffectiveApiProfile, String> {
    let current = agent::resolve_current_agent_api_profile(app_handle)?;
    if current.source == "license_managed"
        || (!current.api_key.trim().is_empty()
            && !current.base_url.trim().is_empty()
            && !current.model.trim().is_empty())
    {
        return Ok(current);
    }

    let provider = value_as_string(config, "provider");
    let endpoint = value_as_string(config, "endpoint");
    let api_key = value_as_string(config, "apiKey");
    let model = value_as_string(config, "model");
    let headers = api_headers_from_config(config);
    ai_credentials::resolve_effective_api_profile(
        app_handle,
        ai_credentials::StoredApiSettings {
            gateway_kind: None,
            provider: if provider.trim().is_empty() {
                "openai-compatible".to_string()
            } else {
                provider
            },
            base_url: endpoint,
            api_key,
            model,
            headers,
        },
    )
}

#[tauri::command]
async fn describe_image_for_search(
    app_handle: tauri::AppHandle,
    image_source: String,
    hint: Option<String>,
    api_config: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        describe_image_for_search_impl(app_handle, image_source, hint, api_config)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn describe_image_for_search_impl(
    app_handle: tauri::AppHandle,
    image_source: String,
    hint: Option<String>,
    api_config: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let config = api_config.unwrap_or_else(|| serde_json::json!({}));
    let proxy = value_as_string(&config, "proxy");
    let profile = resolve_vision_api_profile(&app_handle, &config)?;
    if profile.api_key.trim().is_empty() {
        return Err("请先配置可用于 Vision 的 Agent API Key，才能按参考图收图".to_string());
    }
    if profile.model.trim().is_empty() {
        return Err("请先配置可用于 Vision 的模型，才能按参考图收图".to_string());
    }
    let url =
        ai_gateway::router::endpoint_for(&profile, ai_gateway::GatewayOperation::ChatCompletions)?;
    let image_url = image_source_for_ai(&image_source)?;
    let body = build_siliconflow_image_search_query_body(
        &profile.model,
        &image_url,
        hint.as_deref().unwrap_or(""),
    )?;
    let raw = http_post_json_with_headers(
        &app_handle,
        &url,
        &profile.api_key,
        &body,
        if proxy.trim().is_empty() {
            None
        } else {
            Some(proxy.as_str())
        },
        Some(&profile.headers),
        &AiHttpRequestOptions::default(),
    )?;
    let response: serde_json::Value = serde_json::from_str(&raw).map_err(|e| {
        format!(
            "解析 Vision 响应失败：{}；原始返回：{}",
            e,
            ai_gateway::router::redact_profile_secrets(&raw, &profile)
        )
    })?;
    let content = get_chat_message_content(&response)?;
    let description = normalize_image_search_description(&content);
    let query = description
        .get("query")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if query.is_empty() {
        Err("模型没有生成可用的搜图关键词".to_string())
    } else {
        Ok(description)
    }
}

// src-tauri/src/main.rs

#[tauri::command]
fn sys_update_bounds(
    window: WebviewWindow,
    width: f64,
    height: f64,
    keep_right: bool,
) -> Result<(), String> {
    let factor = window.scale_factor().map_err(|e| e.to_string())?;

    let current_pos = window
        .outer_position()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(factor);

    let new_x = if keep_right {
        if let Some(monitor) = window.current_monitor().map_err(|e| e.to_string())? {
            let (work_area_pos, work_area_size, _) = monitor_work_area(&monitor);
            work_area_pos.x + work_area_size.width - width
        } else {
            current_pos.x
        }
    } else {
        current_pos.x
    };

    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|e| e.to_string())?;

    window
        .set_position(LogicalPosition::new(new_x, current_pos.y))
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn set_topmost(window: WebviewWindow, topmost: bool) -> Result<(), String> {
    if window.label() == "main" && is_main_workbench_active() {
        apply_main_workbench_mode(&window);
        return Ok(());
    }
    window.set_always_on_top(topmost).map_err(|e| e.to_string())
}

#[tauri::command]
fn sys_drag_window(window: WebviewWindow, dx: f64, dy: f64) {
    if let Ok(factor) = window.scale_factor() {
        if let Ok(pos) = window.outer_position() {
            let logical_pos = pos.to_logical::<f64>(factor);
            let _ =
                window.set_position(LogicalPosition::new(logical_pos.x + dx, logical_pos.y + dy));
        }
    }
}

#[tauri::command]
fn snap_to_right(window: WebviewWindow, width: f64, height: f64) {
    if let Ok(Some(monitor)) = window.current_monitor() {
        if let Ok(factor) = window.scale_factor() {
            let (work_area_pos, work_area_size, _) = monitor_work_area(&monitor);

            if let Ok(current_pos) = window.outer_position() {
                let logical_pos: LogicalPosition<f64> = current_pos.to_logical(factor);
                let new_x = work_area_pos.x + work_area_size.width - width;

                let _ = window.set_size(LogicalSize::new(width, height));
                let _ = window.set_position(LogicalPosition::new(new_x, logical_pos.y));
            }
        }
    }
}

#[tauri::command]
fn toggle_pin(window: WebviewWindow, pinned: bool) {
    // pinned 只表示锁定展开/不自动缩回，不要在这里控制窗口位置。
    // 取消钉住后的复位/缩回由前端 close_drawer + trigger mode 处理。
    if window.label() == "main" {
        apply_main_workbench_mode(&window);
    } else {
        let _ = window.set_always_on_top(true);
    }
    let _ = pinned;
}

#[tauri::command]
fn get_local_ip() -> Result<String, String> {
    local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .map_err(|e| e.to_string())
}

static RECENT_MOBILE_SIGNATURES: OnceLock<Mutex<HashMap<String, u128>>> = OnceLock::new();

fn now_millis_u128() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn mobile_should_accept(signature: &str) -> bool {
    let store = RECENT_MOBILE_SIGNATURES.get_or_init(|| Mutex::new(HashMap::new()));
    let now = now_millis_u128();
    let Ok(mut recent) = store.lock() else {
        return true;
    };

    // 手机端某些实现会对同一次发送动作连续调用 /send、/upload 或重试一次。
    // 这里用短时间内的签名去重，避免抽屉里出现两张或两个完全相同的卡片。
    recent.retain(|_, last_seen| now.saturating_sub(*last_seen) <= 8_000);
    if let Some(last_seen) = recent.get_mut(signature) {
        if now.saturating_sub(*last_seen) <= 2_500 {
            *last_seen = now;
            return false;
        }
    }

    recent.insert(signature.to_string(), now);
    true
}

fn hash_u64<T: Hash + ?Sized>(value: &T) -> u64 {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    hasher.finish()
}

fn mobile_bytes_signature(item_type: &str, bytes: &[u8]) -> String {
    let mut hasher = DefaultHasher::new();
    item_type.hash(&mut hasher);
    bytes.len().hash(&mut hasher);
    bytes.hash(&mut hasher);
    format!(
        "mobile-bytes:{}:{}:{:016x}",
        item_type,
        bytes.len(),
        hasher.finish()
    )
}

fn mobile_text_signature(text: &str) -> String {
    let normalized = text.trim();
    format!(
        "mobile-text:{}:{:016x}",
        normalized.len(),
        hash_u64(normalized)
    )
}

fn mobile_url_signature(url: &str) -> String {
    let normalized = url.trim();
    format!(
        "mobile-url:{}:{:016x}",
        normalized.len(),
        hash_u64(normalized)
    )
}

static MOBILE_SERVER_PORT: AtomicU16 = AtomicU16::new(0);
const MOBILE_SERVER_PORT_CANDIDATES: [u16; 4] = [1420, 17890, 17891, 17892];

#[tauri::command]
fn get_mobile_pair_url() -> Result<String, String> {
    let ip = get_local_ip()?;
    let port = MOBILE_SERVER_PORT.load(Ordering::Relaxed);
    let port = if port == 0 { 1420 } else { port };
    Ok(format!("http://{}:{}/pair", ip, port))
}

fn start_mobile_server(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut listener_opt = None;
        let mut bound_port = 0u16;

        for port in MOBILE_SERVER_PORT_CANDIDATES {
            match TcpListener::bind(("0.0.0.0", port)) {
                Ok(listener) => {
                    bound_port = port;
                    listener_opt = Some(listener);
                    break;
                }
                Err(err) => {
                    eprintln!("mobile server bind 0.0.0.0:{port} failed: {err}");
                }
            }
        }

        let Some(listener) = listener_opt else {
            eprintln!("mobile server failed: no available port");
            return;
        };

        MOBILE_SERVER_PORT.store(bound_port, Ordering::Relaxed);
        let _ = app_handle.emit(
            "mobile-server-ready",
            get_mobile_pair_url().unwrap_or_default(),
        );
        eprintln!("mobile server listening on 0.0.0.0:{bound_port}");

        for stream in listener.incoming() {
            match stream {
                Ok(stream) => {
                    let app = app_handle.clone();
                    std::thread::spawn(move || handle_mobile_connection(stream, app));
                }
                Err(err) => eprintln!("mobile server accept error: {err}"),
            }
        }
    });
}

#[derive(Debug)]
struct MobileHttpRequest {
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

fn handle_mobile_connection(mut stream: TcpStream, app_handle: tauri::AppHandle) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(8)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(8)));

    let request = match read_mobile_http_request(&mut stream) {
        Ok(req) => req,
        Err(err) => {
            let _ = write_mobile_response(
                &mut stream,
                "400 Bad Request",
                "application/json",
                &format!(r#"{{"ok":false,"error":"{}"}}"#, json_escape(&err)),
            );
            return;
        }
    };

    if request.method.eq_ignore_ascii_case("OPTIONS") {
        let _ = write_mobile_response(&mut stream, "204 No Content", "text/plain", "");
        return;
    }

    let route = request
        .path
        .split('?')
        .next()
        .unwrap_or("/")
        .trim_end_matches('/');
    let query = request
        .path
        .split_once('?')
        .map(|(_, q)| parse_query(q))
        .unwrap_or_default();

    let result = if request.method.eq_ignore_ascii_case("GET") {
        handle_mobile_get(route, &query, &app_handle)
    } else if request.method.eq_ignore_ascii_case("POST")
        || request.method.eq_ignore_ascii_case("PUT")
    {
        handle_mobile_post(route, &query, &request, &app_handle)
    } else {
        Err(format!("unsupported method: {}", request.method))
    };

    match result {
        Ok(message) => {
            let body = format!(r#"{{"ok":true,"message":"{}"}}"#, json_escape(&message));
            let _ = write_mobile_response(
                &mut stream,
                "200 OK",
                "application/json; charset=utf-8",
                &body,
            );
        }
        Err(err) => {
            let body = format!(r#"{{"ok":false,"error":"{}"}}"#, json_escape(&err));
            let _ = write_mobile_response(
                &mut stream,
                "500 Internal Server Error",
                "application/json; charset=utf-8",
                &body,
            );
        }
    }
}

fn read_mobile_http_request(stream: &mut TcpStream) -> Result<MobileHttpRequest, String> {
    let mut buf = Vec::new();
    let mut tmp = [0u8; 8192];
    let header_end;

    loop {
        let n = stream.read(&mut tmp).map_err(|e| e.to_string())?;
        if n == 0 {
            return Err("empty request".to_string());
        }
        buf.extend_from_slice(&tmp[..n]);
        if let Some(pos) = find_subslice(&buf, b"\r\n\r\n") {
            header_end = pos + 4;
            break;
        }
        if buf.len() > 1024 * 1024 {
            return Err("request headers too large".to_string());
        }
    }

    let header_text = String::from_utf8_lossy(&buf[..header_end]).to_string();
    let mut lines = header_text.split("\r\n");
    let request_line = lines
        .next()
        .ok_or_else(|| "missing request line".to_string())?;
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts.next().unwrap_or("").to_string();
    let path = request_parts.next().unwrap_or("/").to_string();

    let mut headers = HashMap::new();
    for line in lines {
        if line.trim().is_empty() {
            continue;
        }
        if let Some((k, v)) = line.split_once(':') {
            headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
        }
    }

    let content_length = headers
        .get("content-length")
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(0);

    while buf.len() < header_end + content_length {
        let n = stream.read(&mut tmp).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&tmp[..n]);
    }

    let available = buf.len().saturating_sub(header_end);
    let body_len = content_length.min(available);
    let body = buf[header_end..header_end + body_len].to_vec();

    Ok(MobileHttpRequest {
        method,
        path,
        headers,
        body,
    })
}

fn write_mobile_response(
    stream: &mut TcpStream,
    status: &str,
    content_type: &str,
    body: &str,
) -> std::io::Result<()> {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET,POST,PUT,OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, X-File-Name, X-Requested-With\r\nConnection: close\r\n\r\n{}",
        body.as_bytes().len(),
        body
    );
    stream.write_all(response.as_bytes())
}

fn handle_mobile_get(
    route: &str,
    query: &HashMap<String, String>,
    app_handle: &tauri::AppHandle,
) -> Result<String, String> {
    let _ = app_handle.emit("mobile-connected", ());

    let text = query
        .get("text")
        .or_else(|| query.get("content"))
        .or_else(|| query.get("message"))
        .cloned()
        .unwrap_or_default();

    if !text.trim().is_empty() {
        if text.trim().starts_with("data:") {
            emit_mobile_data_url(
                app_handle,
                &text,
                query
                    .get("name")
                    .or_else(|| query.get("filename"))
                    .map(String::as_str),
            )?;
            return Ok("file received".to_string());
        }
        emit_mobile_text(app_handle, &text)?;
        return Ok("text received".to_string());
    }

    match route {
        "" | "/" | "/pair" | "/connect" | "/ping" | "/health" => Ok("connected".to_string()),
        _ => Ok("connected".to_string()),
    }
}

fn emit_mobile_data_url(
    app_handle: &tauri::AppHandle,
    data_url: &str,
    fallback_name: Option<&str>,
) -> Result<(), String> {
    let trimmed = data_url.trim();
    let (mime, bytes) = decode_data_url(trimmed)?;
    let name = fallback_name
        .filter(|name| !name.trim().is_empty() && *name != "手机内容")
        .map(|name| name.to_string())
        .unwrap_or_else(|| default_mobile_file_name(&mime));
    let item_type = guess_mobile_item_type(&mime, &name);
    emit_mobile_bytes(app_handle, &item_type, &name, &bytes)
}

fn first_data_url_field<'a>(fields: &'a HashMap<String, String>) -> Option<(&'a str, &'a str)> {
    for key in [
        "dataUrl", "data_url", "data", "image", "file", "content", "text", "message",
    ] {
        if let Some(value) = fields.get(key) {
            let trimmed = value.trim();
            if trimmed.starts_with("data:") {
                return Some((key, trimmed));
            }
        }
    }

    fields.iter().find_map(|(key, value)| {
        let trimmed = value.trim();
        if trimmed.starts_with("data:") {
            Some((key.as_str(), trimmed))
        } else {
            None
        }
    })
}

fn handle_mobile_post(
    _route: &str,
    query: &HashMap<String, String>,
    request: &MobileHttpRequest,
    app_handle: &tauri::AppHandle,
) -> Result<String, String> {
    let _ = app_handle.emit("mobile-connected", ());

    let content_type = request
        .headers
        .get("content-type")
        .cloned()
        .unwrap_or_default();
    let lower_content_type = content_type.to_ascii_lowercase();

    if lower_content_type.contains("multipart/form-data") {
        let boundary = extract_boundary(&content_type)
            .ok_or_else(|| "missing multipart boundary".to_string())?;
        let count = handle_mobile_multipart(app_handle, &request.body, &boundary)?;
        return Ok(format!("{} item(s) received", count));
    }

    if lower_content_type.contains("application/json") {
        let value: serde_json::Value =
            serde_json::from_slice(&request.body).map_err(|e| e.to_string())?;
        let count = handle_mobile_json(app_handle, &value)?;
        return Ok(format!("{} item(s) received", count));
    }

    if lower_content_type.contains("application/x-www-form-urlencoded") {
        let text = String::from_utf8_lossy(&request.body).to_string();
        let fields = parse_query(&text);
        if let Some((_key, data_url)) = first_data_url_field(&fields) {
            let fallback_name = fields
                .get("name")
                .or_else(|| fields.get("filename"))
                .or_else(|| fields.get("fileName"))
                .map(String::as_str);
            emit_mobile_data_url(app_handle, data_url, fallback_name)?;
            return Ok("file received".to_string());
        }
        if let Some(value) = fields
            .get("text")
            .or_else(|| fields.get("content"))
            .or_else(|| fields.get("message"))
        {
            emit_mobile_text(app_handle, value)?;
            return Ok("text received".to_string());
        }
    }

    if lower_content_type.starts_with("text/") || lower_content_type.is_empty() {
        let text = String::from_utf8_lossy(&request.body).trim().to_string();
        if !text.is_empty() {
            if text.starts_with("data:") {
                let fallback_name = query
                    .get("name")
                    .or_else(|| query.get("filename"))
                    .or_else(|| request.headers.get("x-file-name"))
                    .map(String::as_str);
                emit_mobile_data_url(app_handle, &text, fallback_name)?;
                return Ok("file received".to_string());
            }
            emit_mobile_text(app_handle, &text)?;
            return Ok("text received".to_string());
        }
    }

    if !request.body.is_empty() {
        let name = query
            .get("name")
            .or_else(|| query.get("filename"))
            .cloned()
            .or_else(|| request.headers.get("x-file-name").cloned())
            .unwrap_or_else(|| default_mobile_file_name(&lower_content_type));
        let item_type = guess_mobile_item_type(&lower_content_type, &name);
        emit_mobile_bytes(app_handle, &item_type, &name, &request.body)?;
        return Ok("file received".to_string());
    }

    Err("empty mobile request".to_string())
}

fn handle_mobile_json(
    app_handle: &tauri::AppHandle,
    value: &serde_json::Value,
) -> Result<usize, String> {
    if let Some(items) = value.as_array() {
        let mut count = 0;
        for item in items {
            count += handle_mobile_json(app_handle, item)?;
        }
        return Ok(count);
    }

    if let Some(items) = value.get("items").and_then(|v| v.as_array()) {
        let mut count = 0;
        for item in items {
            count += handle_mobile_json(app_handle, item)?;
        }
        return Ok(count);
    }

    let obj = value
        .as_object()
        .ok_or_else(|| "json body must be object or array".to_string())?;

    let text = get_json_string(obj, &["text", "content", "message"]);
    let url = get_json_string(
        obj,
        &["url", "imageUrl", "image_url", "fileUrl", "file_url"],
    );
    let name = get_json_string(obj, &["name", "filename", "fileName", "title"])
        .unwrap_or_else(|| "手机内容".to_string());
    let explicit_type = get_json_string(obj, &["type", "kind"]).unwrap_or_default();
    let mime = get_json_string(obj, &["mime", "mimeType", "contentType"]).unwrap_or_default();
    let data_url = get_json_string(obj, &["dataUrl", "data_url", "data"]);
    let base64_data = get_json_string(obj, &["base64", "base64Data", "fileBase64"]);

    if let Some(data) = data_url.filter(|s| s.starts_with("data:")) {
        let (mime_from_data, bytes) = decode_data_url(&data)?;
        let mime_used = if mime.is_empty() {
            mime_from_data
        } else {
            mime
        };
        let file_name = if name == "手机内容" {
            default_mobile_file_name(&mime_used)
        } else {
            name
        };
        let item_type = if explicit_type.is_empty() {
            guess_mobile_item_type(&mime_used, &file_name)
        } else {
            normalize_mobile_item_type(&explicit_type)
        };
        emit_mobile_bytes(app_handle, &item_type, &file_name, &bytes)?;
        return Ok(1);
    }

    if let Some(b64) = base64_data {
        use base64::{engine::general_purpose, Engine as _};
        let bytes = general_purpose::STANDARD
            .decode(b64.trim())
            .map_err(|e| e.to_string())?;
        let file_name = if name == "手机内容" {
            default_mobile_file_name(&mime)
        } else {
            name
        };
        let item_type = if explicit_type.is_empty() {
            guess_mobile_item_type(&mime, &file_name)
        } else {
            normalize_mobile_item_type(&explicit_type)
        };
        emit_mobile_bytes(app_handle, &item_type, &file_name, &bytes)?;
        return Ok(1);
    }

    if let Some(url) = url {
        let item_type = if explicit_type.is_empty() {
            guess_mobile_item_type(&mime, &name)
        } else {
            normalize_mobile_item_type(&explicit_type)
        };
        let item_type = if item_type == "file" && looks_like_image_url(&url) {
            "image".to_string()
        } else {
            item_type
        };
        let signature = mobile_url_signature(&url);
        if !mobile_should_accept(&signature) {
            return Ok(1);
        }
        let payload = serde_json::json!({
            "type": item_type,
            "content": text.clone().unwrap_or_else(|| name.clone()),
            "name": name,
            "url": url,
            "path": url,
            "mobileSignature": signature,
            "isQuickAccess": false
        });
        app_handle
            .emit("mobile-data-received", payload)
            .map_err(|e| e.to_string())?;
        return Ok(1);
    }

    if let Some(text) = text {
        if text.trim().starts_with("data:") {
            emit_mobile_data_url(app_handle, &text, Some(&name))?;
            return Ok(1);
        }
        emit_mobile_text(app_handle, &text)?;
        return Ok(1);
    }

    Err("unsupported json payload".to_string())
}

fn handle_mobile_multipart(
    app_handle: &tauri::AppHandle,
    body: &[u8],
    boundary: &str,
) -> Result<usize, String> {
    let marker = format!("--{}", boundary).into_bytes();
    let mut fields: HashMap<String, String> = HashMap::new();
    let mut count = 0usize;
    let mut cursor = 0usize;

    while let Some(rel_start) = find_subslice(&body[cursor..], &marker) {
        let mut start = cursor + rel_start + marker.len();
        if body.get(start..start + 2) == Some(b"--") {
            break;
        }
        if body.get(start..start + 2) == Some(b"\r\n") {
            start += 2;
        }
        let next = find_subslice(&body[start..], &marker)
            .map(|p| start + p)
            .unwrap_or(body.len());
        let mut part = &body[start..next];
        if part.ends_with(b"\r\n") {
            part = &part[..part.len().saturating_sub(2)];
        }
        cursor = next;

        let Some(header_end) = find_subslice(part, b"\r\n\r\n") else {
            continue;
        };
        let header_text = String::from_utf8_lossy(&part[..header_end]).to_string();
        let content = &part[header_end + 4..];
        let disposition = header_text
            .lines()
            .find(|line| {
                line.to_ascii_lowercase()
                    .starts_with("content-disposition:")
            })
            .unwrap_or("");
        let content_type = header_text
            .lines()
            .find(|line| line.to_ascii_lowercase().starts_with("content-type:"))
            .and_then(|line| line.split_once(':').map(|(_, v)| v.trim().to_string()))
            .unwrap_or_default();
        let field_name = extract_quoted_param(disposition, "name").unwrap_or_default();
        let file_name = extract_quoted_param(disposition, "filename").unwrap_or_default();

        if !file_name.is_empty() {
            let item_type = guess_mobile_item_type(&content_type, &file_name);
            emit_mobile_bytes(app_handle, &item_type, &file_name, content)?;
            count += 1;
        } else if !field_name.is_empty() {
            fields.insert(
                field_name,
                String::from_utf8_lossy(content).trim().to_string(),
            );
        }
    }

    if count == 0 {
        if let Some((_key, data_url)) = first_data_url_field(&fields) {
            let fallback_name = fields
                .get("name")
                .or_else(|| fields.get("filename"))
                .or_else(|| fields.get("fileName"))
                .map(String::as_str);
            emit_mobile_data_url(app_handle, data_url, fallback_name)?;
            count += 1;
        } else if let Some(text) = fields
            .get("text")
            .or_else(|| fields.get("content"))
            .or_else(|| fields.get("message"))
        {
            if !text.trim().is_empty() {
                emit_mobile_text(app_handle, text)?;
                count += 1;
            }
        }
    }

    Ok(count)
}

fn emit_mobile_text(app_handle: &tauri::AppHandle, text: &str) -> Result<(), String> {
    let signature = mobile_text_signature(text);
    if !mobile_should_accept(&signature) {
        return Ok(());
    }

    let payload = serde_json::json!({
        "type": "text",
        "content": text,
        "name": "手机文本",
        "mobileSignature": signature,
        "isQuickAccess": false
    });
    app_handle
        .emit("mobile-data-received", payload)
        .map_err(|e| e.to_string())
}

fn emit_mobile_file_with_signature(
    app_handle: &tauri::AppHandle,
    item_type: &str,
    name: &str,
    path: &str,
    signature: &str,
) -> Result<(), String> {
    let payload = serde_json::json!({
        "type": item_type,
        "content": name,
        "name": name,
        "path": path,
        "mobileSignature": signature,
        "isQuickAccess": false
    });
    app_handle
        .emit("mobile-data-received", payload)
        .map_err(|e| e.to_string())
}

fn emit_mobile_bytes(
    app_handle: &tauri::AppHandle,
    item_type: &str,
    name: &str,
    bytes: &[u8],
) -> Result<(), String> {
    let signature = mobile_bytes_signature(item_type, bytes);
    if !mobile_should_accept(&signature) {
        return Ok(());
    }

    let path = save_mobile_bytes(app_handle, name, bytes)?;
    emit_mobile_file_with_signature(app_handle, item_type, name, &path, &signature)
}

fn save_mobile_bytes(
    app_handle: &tauri::AppHandle,
    name: &str,
    bytes: &[u8],
) -> Result<String, String> {
    let out_dir = get_user_data_dir(app_handle).join("mobile_uploads");
    fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;
    let safe_name = sanitize_file_name(name);
    let extension = local_file_extension(Path::new(&safe_name));
    let _cache_guard = local_media_cache_write_lock()
        .lock()
        .map_err(|_| "local media cache lock poisoned".to_string())?;
    if let Some(existing) = find_identical_bytes_in_dir(bytes, &extension, &out_dir)? {
        return Ok(display_local_path(&existing));
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_nanos();
    let out_path = out_dir.join(format!("{}_{}", stamp, safe_name));
    fs::write(&out_path, bytes).map_err(|e| e.to_string())?;
    Ok(out_path.to_string_lossy().to_string())
}

fn decode_data_url(data_url: &str) -> Result<(String, Vec<u8>), String> {
    let comma = data_url
        .find(',')
        .ok_or_else(|| "invalid data url".to_string())?;
    let meta = &data_url[..comma];
    let encoded = &data_url[comma + 1..];
    let mime = meta
        .trim_start_matches("data:")
        .split(';')
        .next()
        .unwrap_or("application/octet-stream")
        .to_string();
    use base64::{engine::general_purpose, Engine as _};
    let bytes = general_purpose::STANDARD
        .decode(encoded)
        .map_err(|e| e.to_string())?;
    Ok((mime, bytes))
}

fn get_json_string(
    obj: &serde_json::Map<String, serde_json::Value>,
    keys: &[&str],
) -> Option<String> {
    for key in keys {
        if let Some(value) = obj.get(*key) {
            if let Some(s) = value.as_str() {
                if !s.trim().is_empty() {
                    return Some(s.to_string());
                }
            } else if value.is_number() || value.is_boolean() {
                return Some(value.to_string());
            }
        }
    }
    None
}

fn parse_query(query: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for pair in query.split('&') {
        if pair.is_empty() {
            continue;
        }
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        out.insert(url_decode_component(k), url_decode_component(v));
    }
    out
}

fn url_decode_component(value: &str) -> String {
    percent_decode_lossy(&value.replace('+', " "))
}

fn extract_boundary(content_type: &str) -> Option<String> {
    content_type.split(';').find_map(|part| {
        let part = part.trim();
        part.strip_prefix("boundary=")
            .map(|v| v.trim_matches('"').to_string())
    })
}

fn extract_quoted_param(header: &str, key: &str) -> Option<String> {
    let pattern = format!("{}=\"", key);
    let start = header.find(&pattern)? + pattern.len();
    let end = header[start..].find('"')? + start;
    Some(header[start..end].to_string())
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() {
        return Some(0);
    }
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn json_escape(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
}

fn normalize_mobile_item_type(value: &str) -> String {
    let v = value.to_ascii_lowercase();
    if v.contains("image") || v == "photo" || v == "picture" {
        "image".to_string()
    } else if v.contains("video") {
        "video".to_string()
    } else if v.contains("text") {
        "text".to_string()
    } else {
        "file".to_string()
    }
}

fn guess_mobile_item_type(mime: &str, name: &str) -> String {
    let mime = mime.to_ascii_lowercase();
    let ext = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    if mime.starts_with("image/")
        || ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].contains(&ext.as_str())
    {
        "image".to_string()
    } else if mime.starts_with("video/")
        || ["mp4", "mov", "avi", "mkv", "webm"].contains(&ext.as_str())
    {
        "video".to_string()
    } else if mime.starts_with("text/") {
        "text".to_string()
    } else {
        "file".to_string()
    }
}

fn default_mobile_file_name(mime: &str) -> String {
    let ext = if mime.contains("png") {
        "png"
    } else if mime.contains("jpeg") || mime.contains("jpg") {
        "jpg"
    } else if mime.contains("gif") {
        "gif"
    } else if mime.contains("webp") {
        "webp"
    } else if mime.contains("mp4") {
        "mp4"
    } else if mime.starts_with("text/") {
        "txt"
    } else {
        "bin"
    };
    format!(
        "手机文件_{}.{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0),
        ext
    )
}

fn looks_like_image_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    lower.starts_with("data:image/")
        || has_image_extension_in_url(&lower)
        || lower.ends_with(".png")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".gif")
        || lower.ends_with(".webp")
        || lower.ends_with(".avif")
        || lower.ends_with(".bmp")
        || lower.ends_with(".svg")
        || lower.contains(".png?")
        || lower.contains(".png#")
        || lower.contains(".jpg?")
        || lower.contains(".jpg#")
        || lower.contains(".jpeg?")
        || lower.contains(".jpeg#")
        || lower.contains(".gif?")
        || lower.contains(".gif#")
        || lower.contains(".webp?")
        || lower.contains(".webp#")
        || lower.contains(".avif?")
        || lower.contains(".avif#")
        || lower.contains(".bmp?")
        || lower.contains(".bmp#")
        || lower.contains(".svg?")
        || lower.contains(".svg#")
        || lower.contains("format=jpg")
        || lower.contains("format=jpeg")
        || lower.contains("format=png")
        || lower.contains("format=webp")
        || lower.contains("format=gif")
        || lower.contains("format=avif")
        || contains_image_format_parameter(&lower)
        || (image_like_url_host(&lower) && !is_baidu_search_page_url(&lower))
        || looks_like_image_endpoint(&lower)
}

fn extract_nested_image_url(value: &str) -> Option<String> {
    let parsed = Url::parse(value.trim()).ok()?;
    let mut candidates = Vec::new();
    for (key, param_value) in parsed.query_pairs() {
        if !is_nested_image_url_param(&key) {
            continue;
        }
        let decoded = decode_url_component_loose(&param_value)
            .trim()
            .trim_matches(['\'', '"'])
            .to_string();
        if decoded.starts_with("http://") || decoded.starts_with("https://") {
            candidates.push(decoded);
        }
    }
    candidates
        .into_iter()
        .find(|candidate| looks_like_image_url(candidate) || has_image_extension_in_url(candidate))
}

fn is_nested_image_url_param(key: &str) -> bool {
    matches!(
        key.to_ascii_lowercase().as_str(),
        "objurl"
            | "imgurl"
            | "imageurl"
            | "mediaurl"
            | "thumbnail"
            | "thumburl"
            | "picurl"
            | "hoverurl"
            | "middleurl"
            | "originalurl"
            | "replaceurl"
            | "src"
    )
}

fn decode_url_component_loose(value: &str) -> String {
    let mut current = value.to_string();
    for _ in 0..3 {
        let decoded = percent_decode_once(&current);
        if decoded == current {
            break;
        }
        current = decoded;
    }
    current
}

fn percent_decode_once(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0usize;
    let mut changed = false;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(high), Some(low)) =
                (hex_value(bytes[index + 1]), hex_value(bytes[index + 2]))
            {
                out.push((high << 4) | low);
                index += 3;
                changed = true;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }
    if changed {
        String::from_utf8_lossy(&out).to_string()
    } else {
        value.to_string()
    }
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn has_image_extension_in_url(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    [
        ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".bmp", ".svg",
    ]
    .iter()
    .any(|ext| {
        lower
            .find(ext)
            .map(|idx| {
                let next = lower.as_bytes().get(idx + ext.len()).copied();
                matches!(
                    next,
                    None | Some(b'/')
                        | Some(b'?')
                        | Some(b'#')
                        | Some(b'!')
                        | Some(b'&')
                        | Some(b':')
                )
            })
            .unwrap_or(false)
    })
}

fn looks_like_image_endpoint(lower_url: &str) -> bool {
    let Some(rest) = lower_url
        .strip_prefix("https://")
        .or_else(|| lower_url.strip_prefix("http://"))
    else {
        return false;
    };
    let host_end = rest
        .find(|c| matches!(c, '/' | '?' | '#'))
        .unwrap_or(rest.len());
    let host = &rest[..host_end];
    let suffix = &rest[host_end..];

    if (host == "mm.bing.net" || host.ends_with(".mm.bing.net"))
        && (suffix.contains("/th/id/") || suffix.contains("pid=imgdetmain"))
    {
        return true;
    }
    if is_baidu_image_cdn(host, suffix) {
        return true;
    }
    if host == "huabanimg.com" || host.ends_with(".huabanimg.com") || host.contains("hbimg") {
        return true;
    }
    if (host == "huaban.com" || host.ends_with(".huaban.com"))
        && looks_like_huaban_pin_suffix(suffix)
    {
        return true;
    }
    if is_image_like_host(host) && contains_image_format_parameter(suffix) {
        return true;
    }

    suffix.contains("imgurl=")
        || suffix.contains("mediaurl=")
        || suffix.contains("imageurl=")
        || suffix.contains("thumbnail=")
        || contains_image_format_parameter(suffix)
        || suffix.contains("/image/")
        || suffix.contains("/images/")
        || suffix.contains("/img/")
        || suffix.contains("/thumb/")
        || suffix.contains("/thumbnail/")
}

fn is_baidu_image_cdn(host: &str, suffix: &str) -> bool {
    host.strip_prefix("img")
        .and_then(|rest| rest.strip_suffix(".baidu.com"))
        .map(|middle| middle.is_empty() || middle.chars().all(|ch| ch.is_ascii_digit()))
        .unwrap_or(false)
        && suffix.starts_with("/it/")
}

fn is_image_like_host(host: &str) -> bool {
    host.starts_with("img") || host.contains(".img.") || host.contains("image")
}

fn image_like_url_host(lower_url: &str) -> bool {
    Url::parse(lower_url)
        .ok()
        .and_then(|parsed| parsed.host_str().map(is_image_like_host))
        .unwrap_or(false)
}

fn is_baidu_search_page_url(value: &str) -> bool {
    Url::parse(value)
        .ok()
        .map(|parsed| {
            parsed.host_str() == Some("image.baidu.com")
                && (parsed.path().starts_with("/search/index")
                    || parsed.path().starts_with("/search/detail"))
        })
        .unwrap_or(false)
}

fn contains_image_format_parameter(value: &str) -> bool {
    value.split(['?', '&', ';']).any(|part| {
        let Some((raw_key, raw_value)) = part.split_once('=') else {
            return false;
        };
        let key = raw_key
            .rsplit('/')
            .next()
            .unwrap_or(raw_key)
            .trim()
            .to_ascii_lowercase();
        matches!(
            key.as_str(),
            "format"
                | "fmt"
                | "f"
                | "type"
                | "mime"
                | "mimetype"
                | "content-type"
                | "filetype"
                | "ext"
        ) && has_image_format_hint(raw_value)
    })
}

fn has_image_format_hint(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    if lower.contains("image/") || lower.contains("image%2f") {
        return true;
    }
    lower
        .split(|ch: char| !ch.is_ascii_alphanumeric())
        .any(|token| {
            matches!(
                token,
                "png" | "jpg" | "jpeg" | "gif" | "webp" | "avif" | "bmp" | "svg"
            )
        })
}

fn looks_like_huaban_pin_suffix(suffix: &str) -> bool {
    let path = suffix.split(['?', '#']).next().unwrap_or(suffix);
    let mut parts = path.trim_start_matches('/').split('/');
    matches!(parts.next(), Some("pins"))
        && parts
            .next()
            .map(|pin_id| !pin_id.is_empty() && pin_id.chars().all(|ch| ch.is_ascii_digit()))
            .unwrap_or(false)
}

#[cfg(test)]
mod web_image_url_tests {
    use super::{
        extract_nested_image_url, huaban_image_url_from_api_json, huaban_pin_id_from_url,
        looks_like_image_url, should_prefer_direct_generated_image_download,
    };

    #[test]
    fn generated_image_hosts_prefer_direct_downloads() {
        assert!(should_prefer_direct_generated_image_download(
            "https://adobe.yrzsai.com/generated/example.png"
        ));
        assert!(should_prefer_direct_generated_image_download(
            "https://xaisp3.oss-ap-southeast-1.aliyuncs.com/example.png"
        ));
        assert!(!should_prefer_direct_generated_image_download(
            "https://gd-hbimg-edge.huaban.com/example.png"
        ));
    }

    #[test]
    fn recognizes_bing_thumbnail_image_without_extension() {
        assert!(looks_like_image_url(
            "https://tse3.mm.bing.net/th/id/OIP.UMzDkGvA3qc16jOUUeZuSgAAAA?r=0&rs=1&pid=ImgDetMain&o=7&rm=3"
        ));
    }

    #[test]
    fn recognizes_baidu_image_cdn_url_without_extension() {
        assert!(looks_like_image_url(
            "https://img2.baidu.com/it/u=3840004386,1451325835&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=700"
        ));
    }

    #[test]
    fn recognizes_image_format_query_parameter_without_extension() {
        assert!(looks_like_image_url(
            "https://cdn.example.com/render?id=42&fmt=webp&w=500&h=700"
        ));
        assert!(looks_like_image_url(
            "https://cdn.example.com/render/type=image%2Fpng?id=42"
        ));
    }

    #[test]
    fn extracts_double_encoded_baidu_detail_objurl() {
        let detail_url = "https://image.baidu.com/search/detail?tn=baiduimagedetail&objurl=https%253A%252F%252Fimg95.699pic.com%252Fxsj%252F0p%252Fb3%252Fur.jpg%2521%252Ffh%252F300&word=s";
        assert_eq!(
            extract_nested_image_url(detail_url).as_deref(),
            Some("https://img95.699pic.com/xsj/0p/b3/ur.jpg!/fh/300")
        );
        assert!(looks_like_image_url(
            "https://img95.699pic.com/xsj/0p/b3/ur.jpg!/fh/300"
        ));
    }

    #[test]
    fn recognizes_huaban_pin_page_and_cdn_without_extension() {
        assert!(looks_like_image_url("https://huaban.com/pins/5796954824"));
        assert!(looks_like_image_url(
            "https://gd-hbimg-edge.huaban.com/70e5f7001150d73db4d8b065f7977648c7af77f46536f-f9s7kc?auth_key=x"
        ));
        assert_eq!(
            huaban_pin_id_from_url("https://huaban.com/pins/5796954824?foo=bar").as_deref(),
            Some("5796954824")
        );
    }

    #[test]
    fn extracts_huaban_image_url_from_api_json() {
        let value = serde_json::json!({
            "pin": {
                "file": {
                    "type": "image/jpeg",
                    "url": "https://gd-hbimg-edge.huaban.com/example"
                }
            }
        });
        assert_eq!(
            huaban_image_url_from_api_json(&value).as_deref(),
            Some("https://gd-hbimg-edge.huaban.com/example")
        );
    }
}

#[tauri::command]
fn open_file(app_handle: tauri::AppHandle, path: String) -> Result<(), String> {
    if path == "SYSTEM_DESKTOP" {
        if let Ok(desktop_path) = app_handle.path().desktop_dir() {
            return open::that(desktop_path).map_err(|e| e.to_string());
        }
    } else if path == "SYSTEM_COMPUTER" {
        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("explorer")
                .arg("::{20D04FE0-3AEA-1069-A2D8-08002B30309D}")
                .spawn()
                .map_err(|e| e.to_string())?;
            return Ok(());
        }
        #[cfg(not(target_os = "windows"))]
        {
            return open::that("/").map_err(|e| e.to_string());
        }
    }
    open::that(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_video_thumb(path: String) -> Result<String, String> {
    let source = local_path_from_url_like(&path).unwrap_or_else(|| PathBuf::from(&path));
    if !source.is_file() {
        return Err(format!(
            "video file not found: {}",
            display_local_path(&source)
        ));
    }

    let temp_dir = std::env::temp_dir();
    let file_name = format!(
        "thumb_{}.jpg",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    );
    let out_path = temp_dir.join(&file_name);

    let mut last_error = String::new();
    for seek in ["00:00:01.000", "00:00:00.250", "00:00:00.000"] {
        let _ = fs::remove_file(&out_path);
        let mut cmd = SysCommand::new("ffmpeg");
        hide_console_window(&mut cmd);
        let output = cmd
            .args([
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-ss",
                seek,
                "-i",
            ])
            .arg(&source)
            .args([
                "-frames:v",
                "1",
                "-vf",
                "scale=360:-2",
                "-q:v",
                "6",
                out_path.to_str().unwrap_or("thumb.jpg"),
            ])
            .output()
            .map_err(|e| format!("FFmpeg 调用失败: {}", e))?;

        if output.status.success() && out_path.exists() {
            break;
        }

        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        last_error = if stderr.is_empty() { stdout } else { stderr };
    }

    if out_path.exists() {
        let img_bytes = fs::read(&out_path).map_err(|e| e.to_string())?;
        use base64::{engine::general_purpose, Engine as _};
        let b64 = general_purpose::STANDARD.encode(&img_bytes);
        let _ = fs::remove_file(&out_path);
        Ok(format!("data:image/jpeg;base64,{}", b64))
    } else {
        Err(if last_error.is_empty() {
            "video thumbnail generation failed".to_string()
        } else {
            format!("video thumbnail generation failed: {}", last_error)
        })
    }
}

pub struct SnipState {
    pub pre_snip_bounds:
        std::sync::Mutex<Option<(tauri::PhysicalPosition<i32>, tauri::PhysicalSize<u32>)>>,
}

fn shortcut_config_path(app_handle: &tauri::AppHandle) -> PathBuf {
    get_user_data_dir(app_handle).join("shortcuts.json")
}

fn default_shortcut(name: &str) -> Option<&'static str> {
    match name {
        "update_shortcut" => Some("Alt+G"),
        "update_snip_shortcut" => Some("F1"),
        "update_text_shortcut" => Some("Alt+T"),
        "update_note_shortcut" => Some("Alt+E"),
        "update_search_shortcut" => Some("Alt+S"),
        "update_trigger_shortcut" => Some("Alt+Q"),
        "update_canvas_shortcut" => Some("Alt+`"),
        _ => None,
    }
}

fn normalize_shortcut_name(name: &str) -> String {
    name.trim().replace('-', "_")
}

fn read_shortcut_map(app_handle: &tauri::AppHandle) -> serde_json::Map<String, serde_json::Value> {
    let path = shortcut_config_path(app_handle);
    if !path.exists() {
        return serde_json::Map::new();
    }

    fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default()
}

#[tauri::command]
fn get_shortcut(app_handle: tauri::AppHandle, name: String) -> Result<String, String> {
    let key = normalize_shortcut_name(&name);
    let saved = read_shortcut_map(&app_handle)
        .get(&key)
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    Ok(saved
        .or_else(|| default_shortcut(&key).map(str::to_string))
        .unwrap_or_default())
}

#[tauri::command]
fn update_shortcut(
    app_handle: tauri::AppHandle,
    name: String,
    shortcut: String,
) -> Result<(), String> {
    let key = normalize_shortcut_name(&name);
    if default_shortcut(&key).is_none() {
        return Err(format!("unknown shortcut name: {}", key));
    }

    let normalized = shortcut.trim().to_string();
    if normalized.is_empty() {
        return Err("shortcut cannot be empty".to_string());
    }

    let path = shortcut_config_path(&app_handle);
    let mut shortcuts = read_shortcut_map(&app_handle);
    shortcuts.insert(key, serde_json::Value::String(normalized));

    let content = serde_json::to_string_pretty(&serde_json::Value::Object(shortcuts))
        .map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn refresh_edge_drop_targets(app_handle: tauri::AppHandle) -> Result<(), String> {
    native_drop::refresh_edge_native_drop(&app_handle)
}

#[tauri::command]
fn cancel_virtual_drop(job_id: String) -> Result<(), String> {
    native_drop::cancel_virtual_drop(&job_id)
}

const AUTO_START_REG_SUBKEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const AUTO_START_VALUE_NAME: &str = "InspirationDrawer";

#[cfg(target_os = "windows")]
fn auto_start_wide_null(value: &str) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    std::ffi::OsStr::new(value)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

#[cfg(target_os = "windows")]
fn quote_windows_arg(path: &std::path::Path) -> String {
    format!("\"{}\"", path.to_string_lossy().replace('"', "\\\""))
}

#[cfg(target_os = "windows")]
fn parse_windows_run_exe_path(value: &str) -> std::path::PathBuf {
    let trimmed = value.trim();
    if let Some(rest) = trimmed.strip_prefix('"') {
        if let Some(end) = rest.find('"') {
            return std::path::PathBuf::from(&rest[..end]);
        }
    }

    std::path::PathBuf::from(trimmed.split_whitespace().next().unwrap_or(""))
}

#[cfg(target_os = "windows")]
fn normalize_windows_path(path: &std::path::Path) -> String {
    let normalized = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    normalized
        .to_string_lossy()
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_ascii_lowercase()
}

#[cfg(target_os = "windows")]
fn auto_start_value_matches_current_exe(value: &str) -> Result<bool, String> {
    let registered = parse_windows_run_exe_path(value);
    if registered.as_os_str().is_empty() {
        return Ok(false);
    }

    let current = std::env::current_exe().map_err(|e| e.to_string())?;
    Ok(normalize_windows_path(&registered) == normalize_windows_path(&current))
}

#[cfg(target_os = "windows")]
fn read_auto_start_value_impl() -> Result<Option<String>, String> {
    use std::ptr::null_mut;
    use winapi::shared::minwindef::DWORD;
    use winapi::shared::winerror::ERROR_SUCCESS;
    use winapi::um::winnt::{KEY_READ, REG_EXPAND_SZ, REG_SZ};
    use winapi::um::winreg::{RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY_CURRENT_USER};

    unsafe {
        let subkey = auto_start_wide_null(AUTO_START_REG_SUBKEY);
        let mut hkey = null_mut();
        let status = RegOpenKeyExW(HKEY_CURRENT_USER, subkey.as_ptr(), 0, KEY_READ, &mut hkey);
        if status != ERROR_SUCCESS as i32 {
            return Ok(None);
        }

        let name = auto_start_wide_null(AUTO_START_VALUE_NAME);
        let mut value_type: DWORD = 0;
        let mut size_bytes: DWORD = 0;
        let status = RegQueryValueExW(
            hkey,
            name.as_ptr(),
            null_mut(),
            &mut value_type,
            null_mut(),
            &mut size_bytes,
        );

        if status != ERROR_SUCCESS as i32 || size_bytes == 0 {
            RegCloseKey(hkey);
            return Ok(None);
        }

        let mut buffer = vec![0u16; ((size_bytes as usize) + 1) / 2];
        let status = RegQueryValueExW(
            hkey,
            name.as_ptr(),
            null_mut(),
            &mut value_type,
            buffer.as_mut_ptr() as *mut u8,
            &mut size_bytes,
        );
        RegCloseKey(hkey);

        if status != ERROR_SUCCESS as i32 {
            return Ok(None);
        }

        if value_type != REG_SZ && value_type != REG_EXPAND_SZ {
            return Ok(None);
        }

        let end = buffer.iter().position(|c| *c == 0).unwrap_or(buffer.len());
        Ok(Some(String::from_utf16_lossy(&buffer[..end])))
    }
}

#[cfg(all(target_os = "windows", debug_assertions))]
fn auto_start_value_points_to_existing_same_named_exe(value: &str) -> bool {
    let registered = parse_windows_run_exe_path(value);
    if registered.as_os_str().is_empty() || !registered.exists() {
        return false;
    }

    let Ok(current) = std::env::current_exe() else {
        return false;
    };

    registered.file_name().is_some() && registered.file_name() == current.file_name()
}

#[cfg(target_os = "windows")]
fn get_auto_start_impl() -> Result<bool, String> {
    let Some(value) = read_auto_start_value_impl()? else {
        return Ok(false);
    };

    if auto_start_value_matches_current_exe(&value)? {
        return Ok(true);
    }

    #[cfg(debug_assertions)]
    {
        // In `tauri dev`, the current executable is target/debug/inspiration-drawer.exe.
        // Treat an existing installed app Run entry as enabled so the dev UI does not
        // wrongly suggest that startup is off.
        if auto_start_value_points_to_existing_same_named_exe(&value) {
            return Ok(true);
        }
    }

    Ok(false)
}

#[cfg(not(target_os = "windows"))]
fn get_auto_start_impl() -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
async fn get_auto_start() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(get_auto_start_impl)
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(target_os = "windows")]
fn set_auto_start_impl(auto_start: bool) -> Result<(), String> {
    use std::ptr::null_mut;
    use winapi::shared::minwindef::DWORD;
    use winapi::shared::winerror::ERROR_SUCCESS;
    use winapi::um::winnt::{KEY_SET_VALUE, REG_SZ};
    use winapi::um::winreg::{
        RegCloseKey, RegCreateKeyExW, RegDeleteValueW, RegSetValueExW, HKEY_CURRENT_USER,
    };

    #[cfg(debug_assertions)]
    if auto_start {
        if let Some(existing) = read_auto_start_value_impl()? {
            if auto_start_value_points_to_existing_same_named_exe(&existing) {
                return Ok(());
            }
        }

        return Err(
            "开发模式不会写入开机启动，避免把启动项指向 debug exe；请用正式安装版开启。"
                .to_string(),
        );
    }

    unsafe {
        let subkey = auto_start_wide_null(AUTO_START_REG_SUBKEY);
        let mut hkey = null_mut();
        let status = RegCreateKeyExW(
            HKEY_CURRENT_USER,
            subkey.as_ptr(),
            0,
            null_mut(),
            0,
            KEY_SET_VALUE,
            null_mut(),
            &mut hkey,
            null_mut(),
        );
        if status != ERROR_SUCCESS as i32 {
            return Err(format!(
                "open autostart registry key failed: 0x{:08X}",
                status as u32
            ));
        }

        let name = auto_start_wide_null(AUTO_START_VALUE_NAME);
        let result = if auto_start {
            let exe = std::env::current_exe().map_err(|e| e.to_string())?;
            let exe_arg = quote_windows_arg(&exe);
            let value = auto_start_wide_null(&exe_arg);
            let status = RegSetValueExW(
                hkey,
                name.as_ptr(),
                0,
                REG_SZ,
                value.as_ptr() as *const u8,
                (value.len() * 2) as DWORD,
            );
            if status == ERROR_SUCCESS as i32 {
                Ok(())
            } else {
                Err(format!(
                    "write autostart registry value failed: 0x{:08X}",
                    status as u32
                ))
            }
        } else {
            let status = RegDeleteValueW(hkey, name.as_ptr());
            // 2 = ERROR_FILE_NOT_FOUND。目标本来不存在时，也视为已经关闭。
            if status == ERROR_SUCCESS as i32 || status == 2 {
                Ok(())
            } else {
                Err(format!(
                    "delete autostart registry value failed: 0x{:08X}",
                    status as u32
                ))
            }
        };

        RegCloseKey(hkey);
        result?;

        let persisted = get_auto_start_impl()?;
        if persisted == auto_start {
            Ok(())
        } else if auto_start {
            Err("autostart registry value did not match current executable after write".to_string())
        } else {
            Err("autostart registry value still exists after delete".to_string())
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn set_auto_start_impl(auto_start: bool) -> Result<(), String> {
    let _ = auto_start;
    Err("autostart currently only supports Windows".to_string())
}

#[tauri::command]
async fn set_auto_start(auto_start: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || set_auto_start_impl(auto_start))
        .await
        .map_err(|e| e.to_string())?
}
fn percent_decode_lossy(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(value) = u8::from_str_radix(&input[i + 1..i + 3], 16) {
                out.push(value);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn local_path_from_url_like(input: &str) -> Option<PathBuf> {
    let trimmed = input.trim();

    if trimmed.starts_with("file:///") {
        let mut path = percent_decode_lossy(trimmed.trim_start_matches("file:///"));
        if cfg!(target_os = "windows") {
            path = path.replace('/', "\\");
            if path.starts_with("?\\") {
                path = path[2..].to_string();
            } else if path.starts_with("\\?\\") {
                path = path[3..].to_string();
            }
        }
        return Some(PathBuf::from(path));
    }

    if trimmed.starts_with("file://") {
        let mut path = percent_decode_lossy(trimmed.trim_start_matches("file://"));
        if cfg!(target_os = "windows") {
            path = path.replace('/', "\\");
            if path.starts_with("?\\") {
                path = path[2..].to_string();
            } else if path.starts_with("\\?\\") {
                path = path[3..].to_string();
            }
        }
        return Some(PathBuf::from(path));
    }

    if trimmed.contains("asset.localhost") || trimmed.starts_with("asset://") {
        let after_host = if let Some(idx) = trimmed.find("asset.localhost") {
            &trimmed[(idx + "asset.localhost".len())..]
        } else if let Some(idx) = trimmed.find("localhost") {
            &trimmed[(idx + "localhost".len())..]
        } else {
            trimmed
        };
        let path_part = after_host
            .split(['?', '#'])
            .next()
            .unwrap_or(after_host)
            .trim_start_matches('/');
        if !path_part.is_empty() {
            let mut decoded = percent_decode_lossy(path_part);
            if cfg!(target_os = "windows") {
                decoded = decoded.replace('/', "\\");
                if decoded.len() >= 4 && decoded.starts_with('\\') && decoded.as_bytes()[2] == b':'
                {
                    decoded = decoded.trim_start_matches('\\').to_string();
                }
            }
            return Some(PathBuf::from(decoded));
        }
    }

    None
}

fn decode_data_image_bytes(data_url: &str) -> Result<(String, Vec<u8>), String> {
    let comma_index = data_url
        .find(',')
        .ok_or_else(|| "invalid data url".to_string())?;
    let encoded = &data_url[(comma_index + 1)..];

    use base64::{engine::general_purpose, Engine as _};
    let bytes = general_purpose::STANDARD
        .decode(encoded)
        .map_err(|e| e.to_string())?;

    let meta = data_url[..comma_index].to_lowercase();
    Ok((meta, bytes))
}

#[cfg(target_os = "windows")]
fn set_clipboard_image_from_file(path: &str) -> Result<(), String> {
    let image = screenshots::image::open(path).map_err(|e| e.to_string())?;
    set_clipboard_dynamic_image(image)
}

#[cfg(target_os = "windows")]
fn set_clipboard_image_from_url(url: &str) -> Result<(), String> {
    let bytes = Client::builder()
        .user_agent(APP_USER_AGENT)
        .build()
        .map_err(|e| e.to_string())?
        .get(url)
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|e| e.to_string())?
        .bytes()
        .map_err(|e| e.to_string())?;
    set_clipboard_image_from_bytes(&bytes)
}

#[cfg(target_os = "windows")]
fn set_clipboard_image_from_bytes(bytes: &[u8]) -> Result<(), String> {
    let image = screenshots::image::load_from_memory(bytes).map_err(|e| e.to_string())?;
    set_clipboard_dynamic_image(image)
}

#[cfg(target_os = "windows")]
fn encode_clipboard_png(image: &screenshots::image::RgbaImage) -> Result<Vec<u8>, String> {
    let mut png = Vec::new();
    let encoder = screenshots::image::codecs::png::PngEncoder::new_with_quality(
        &mut png,
        screenshots::image::codecs::png::CompressionType::Fast,
        screenshots::image::codecs::png::FilterType::Adaptive,
    );
    screenshots::image::ImageEncoder::write_image(
        encoder,
        image.as_raw(),
        image.width(),
        image.height(),
        screenshots::image::ColorType::Rgba8,
    )
    .map_err(|e| format!("clipboard PNG encoding failed: {e}"))?;
    Ok(png)
}

#[cfg(target_os = "windows")]
fn encode_clipboard_dib(image: &screenshots::image::RgbaImage) -> Result<Vec<u8>, String> {
    use std::mem::size_of;
    use std::ptr::copy_nonoverlapping;
    use winapi::shared::minwindef::DWORD;
    use winapi::um::wingdi::{BITMAPINFOHEADER, BI_RGB};

    let width = usize::try_from(image.width()).map_err(|_| "image width is too large")?;
    let height = usize::try_from(image.height()).map_err(|_| "image height is too large")?;
    if width == 0 || height == 0 {
        return Err("empty image".to_string());
    }
    let width_i32 = i32::try_from(width).map_err(|_| "image width is too large")?;
    let height_i32 = i32::try_from(height).map_err(|_| "image height is too large")?;
    let row_bytes = width
        .checked_mul(3)
        .ok_or_else(|| "image is too large for clipboard".to_string())?;
    let row_stride = row_bytes
        .checked_add(3)
        .map(|value| value & !3)
        .ok_or_else(|| "image is too large for clipboard".to_string())?;
    let pixel_size = row_stride
        .checked_mul(height)
        .ok_or_else(|| "image is too large for clipboard".to_string())?;
    let header_size = size_of::<BITMAPINFOHEADER>();
    let total_size = header_size
        .checked_add(pixel_size)
        .ok_or_else(|| "image is too large for clipboard".to_string())?;
    let size_image =
        DWORD::try_from(pixel_size).map_err(|_| "image is too large for clipboard".to_string())?;

    let header = BITMAPINFOHEADER {
        biSize: header_size as DWORD,
        biWidth: width_i32,
        biHeight: height_i32,
        biPlanes: 1,
        biBitCount: 24,
        biCompression: BI_RGB,
        biSizeImage: size_image,
        biXPelsPerMeter: 0,
        biYPelsPerMeter: 0,
        biClrUsed: 0,
        biClrImportant: 0,
    };
    let mut dib = vec![0u8; total_size];
    unsafe {
        copy_nonoverlapping(
            &header as *const BITMAPINFOHEADER as *const u8,
            dib.as_mut_ptr(),
            header_size,
        );
    }

    let source = image.as_raw();
    let source_row_bytes = width
        .checked_mul(4)
        .ok_or_else(|| "image is too large for clipboard".to_string())?;
    for target_y in 0..height {
        let source_y = height - 1 - target_y;
        let source_row_start = source_y * source_row_bytes;
        let source_row = &source[source_row_start..source_row_start + source_row_bytes];
        let target_row = header_size + target_y * row_stride;
        let target_row = &mut dib[target_row..target_row + row_bytes];
        for (pixel, target) in source_row
            .chunks_exact(4)
            .zip(target_row.chunks_exact_mut(3))
        {
            match pixel[3] {
                255 => {
                    target[0] = pixel[2];
                    target[1] = pixel[1];
                    target[2] = pixel[0];
                }
                0 => target.copy_from_slice(&[255, 255, 255]),
                alpha => {
                    let alpha = u32::from(alpha);
                    let composite = |channel: u8| -> u8 {
                        ((u32::from(channel) * alpha + 255 * (255 - alpha) + 127) / 255) as u8
                    };
                    target[0] = composite(pixel[2]);
                    target[1] = composite(pixel[1]);
                    target[2] = composite(pixel[0]);
                }
            }
        }
    }
    Ok(dib)
}

#[cfg(target_os = "windows")]
fn create_clipboard_bitmap(
    image: &screenshots::image::RgbaImage,
    dib: &[u8],
) -> Result<winapi::shared::windef::HBITMAP, String> {
    use std::mem::{size_of, zeroed};
    use std::ptr::{copy_nonoverlapping, null_mut};
    use winapi::ctypes::c_void;
    use winapi::um::wingdi::{
        CreateDIBSection, DeleteObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    };
    use winapi::um::winuser::{GetDC, ReleaseDC};

    let header_size = size_of::<BITMAPINFOHEADER>();
    let pixel_bytes = dib
        .get(header_size..)
        .ok_or_else(|| "invalid clipboard DIB".to_string())?;
    let width = i32::try_from(image.width()).map_err(|_| "image width is too large")?;
    let height = i32::try_from(image.height()).map_err(|_| "image height is too large")?;
    let size_image = u32::try_from(pixel_bytes.len())
        .map_err(|_| "image is too large for clipboard".to_string())?;

    let mut info: BITMAPINFO = unsafe { zeroed() };
    info.bmiHeader.biSize = header_size as u32;
    info.bmiHeader.biWidth = width;
    info.bmiHeader.biHeight = height;
    info.bmiHeader.biPlanes = 1;
    info.bmiHeader.biBitCount = 24;
    info.bmiHeader.biCompression = BI_RGB;
    info.bmiHeader.biSizeImage = size_image;

    unsafe {
        let screen_dc = GetDC(null_mut());
        let mut target: *mut c_void = null_mut();
        let bitmap = CreateDIBSection(screen_dc, &info, DIB_RGB_COLORS, &mut target, null_mut(), 0);
        if !screen_dc.is_null() {
            ReleaseDC(null_mut(), screen_dc);
        }
        if bitmap.is_null() {
            return Err("CreateDIBSection failed".to_string());
        }
        if target.is_null() {
            DeleteObject(bitmap as *mut c_void);
            return Err("CreateDIBSection returned no pixels".to_string());
        }
        copy_nonoverlapping(pixel_bytes.as_ptr(), target as *mut u8, pixel_bytes.len());
        Ok(bitmap)
    }
}

#[cfg(target_os = "windows")]
fn set_clipboard_dynamic_image(image: screenshots::image::DynamicImage) -> Result<(), String> {
    use std::ptr::{copy_nonoverlapping, null_mut};
    use winapi::ctypes::c_void;
    use winapi::shared::minwindef::HGLOBAL;
    use winapi::um::winbase::{GlobalAlloc, GlobalFree, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
    use winapi::um::wingdi::DeleteObject;
    use winapi::um::winuser::{
        CloseClipboard, EmptyClipboard, OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
        CF_BITMAP, CF_DIB,
    };

    let rgba = image.into_rgba8();
    let pixel_count = u64::from(rgba.width()) * u64::from(rgba.height());
    let dib = encode_clipboard_dib(&rgba)?;
    let bitmap = (pixel_count <= 8_000_000)
        .then(|| create_clipboard_bitmap(&rgba, &dib).ok())
        .flatten();
    let png = (pixel_count <= 1_000_000)
        .then(|| encode_clipboard_png(&rgba).ok())
        .flatten();

    unsafe fn allocate_global(bytes: &[u8]) -> Result<HGLOBAL, String> {
        let handle = GlobalAlloc(GMEM_MOVEABLE, bytes.len());
        if handle.is_null() {
            return Err("GlobalAlloc failed".to_string());
        }
        let target = GlobalLock(handle) as *mut u8;
        if target.is_null() {
            GlobalFree(handle);
            return Err("GlobalLock failed".to_string());
        }
        copy_nonoverlapping(bytes.as_ptr(), target, bytes.len());
        GlobalUnlock(handle);
        Ok(handle)
    }

    unsafe {
        let png_handle = png.as_ref().and_then(|bytes| allocate_global(bytes).ok());
        let dib_handle = match allocate_global(&dib) {
            Ok(handle) => handle,
            Err(error) => {
                if let Some(handle) = bitmap {
                    DeleteObject(handle as *mut c_void);
                }
                if let Some(handle) = png_handle {
                    GlobalFree(handle);
                }
                return Err(error);
            }
        };

        let mut open = false;
        for _ in 0..8 {
            if OpenClipboard(null_mut()) != 0 {
                open = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        if !open {
            if let Some(handle) = bitmap {
                DeleteObject(handle as *mut c_void);
            }
            GlobalFree(dib_handle);
            if let Some(handle) = png_handle {
                GlobalFree(handle);
            }
            return Err("OpenClipboard failed".to_string());
        }

        if EmptyClipboard() == 0 {
            CloseClipboard();
            if let Some(handle) = bitmap {
                DeleteObject(handle as *mut c_void);
            }
            GlobalFree(dib_handle);
            if let Some(handle) = png_handle {
                GlobalFree(handle);
            }
            return Err("EmptyClipboard failed".to_string());
        }

        let bitmap_published = bitmap
            .map(|handle| {
                let published = !SetClipboardData(CF_BITMAP, handle as *mut c_void).is_null();
                if !published {
                    DeleteObject(handle as *mut c_void);
                }
                published
            })
            .unwrap_or(false);

        let dib_published = !SetClipboardData(CF_DIB, dib_handle as *mut c_void).is_null();
        if !dib_published {
            GlobalFree(dib_handle);
        }

        let mut png_published = false;
        if let Some(handle) = png_handle {
            let name: Vec<u16> = "PNG".encode_utf16().chain(std::iter::once(0)).collect();
            let format = RegisterClipboardFormatW(name.as_ptr());
            if format != 0 {
                png_published = !SetClipboardData(format, handle as *mut c_void).is_null();
            }
            if !png_published {
                GlobalFree(handle);
            }
        }

        CloseClipboard();
        if !bitmap_published && !dib_published {
            return Err("standard bitmap clipboard formats failed".to_string());
        }
    }

    Ok(())
}

#[cfg(all(test, target_os = "windows"))]
mod clipboard_image_tests {
    use super::encode_clipboard_dib;

    #[test]
    fn clipboard_dib_is_bottom_up_24_bit_and_white_composites_alpha() {
        let image =
            screenshots::image::RgbaImage::from_raw(1, 2, vec![255, 0, 0, 255, 0, 0, 255, 0])
                .unwrap();
        let dib = encode_clipboard_dib(&image).unwrap();
        assert_eq!(u16::from_le_bytes([dib[14], dib[15]]), 24);
        assert_eq!(i32::from_le_bytes([dib[8], dib[9], dib[10], dib[11]]), 2);
        assert_eq!(&dib[40..43], &[255, 255, 255]);
        assert_eq!(&dib[44..47], &[0, 0, 255]);
    }

    #[test]
    fn clipboard_dib_composites_partial_alpha_without_overflow() {
        let image = screenshots::image::RgbaImage::from_raw(1, 1, vec![10, 20, 30, 128]).unwrap();
        let dib = encode_clipboard_dib(&image).unwrap();
        assert_eq!(&dib[40..43], &[142, 137, 132]);
    }
}

#[tauri::command]
async fn copy_image(data_url: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || copy_image_impl(data_url))
        .await
        .map_err(|e| e.to_string())?
}

fn copy_image_impl(data_url: String) -> Result<(), String> {
    let input = data_url.trim();
    if input.is_empty() {
        return Err("empty image source".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        if input.starts_with("data:image/") {
            let (_meta, bytes) = decode_data_image_bytes(input)?;
            return set_clipboard_image_from_bytes(&bytes);
        }

        if let Some(path) = local_path_from_url_like(input) {
            if path.exists() {
                return set_clipboard_image_from_file(&path.to_string_lossy());
            }
        }

        let direct_path = PathBuf::from(input);
        if direct_path.exists() {
            return set_clipboard_image_from_file(&direct_path.to_string_lossy());
        }

        if input.starts_with("http://") || input.starts_with("https://") {
            return set_clipboard_image_from_url(input);
        }

        Err(format!("unsupported image source: {}", input))
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = input;
        Err("copy_image currently supports Windows only".to_string())
    }
}

#[tauri::command]
fn start_file_drag(app_handle: tauri::AppHandle, paths: Vec<String>) -> Result<(), String> {
    let cancel_rect = app_handle.get_webview_window("main").and_then(|main| {
        let pos = main.outer_position().ok()?;
        let size = main.outer_size().ok()?;
        Some(native_drag::CancelRect {
            left: pos.x,
            top: pos.y,
            right: pos.x.saturating_add(size.width as i32),
            bottom: pos.y.saturating_add(size.height as i32),
        })
    });
    native_drag::start_file_drag(paths, cancel_rect)
}

#[tauri::command]
fn copy_files_to_clipboard(paths: Vec<String>) -> Result<(), String> {
    native_drag::copy_files_to_clipboard(paths)
}

#[tauri::command]
fn capture_screen_area(
    window: WebviewWindow,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<String, String> {
    let saved_path = capture_screen_area_to_file_impl(None, window, x, y, width, height)?;
    let img_bytes = fs::read(&saved_path).map_err(|e| e.to_string())?;
    use base64::{engine::general_purpose, Engine as _};
    let b64 = general_purpose::STANDARD.encode(&img_bytes);
    Ok(format!("data:image/png;base64,{}", b64))
}

#[tauri::command]
async fn capture_screen_to_file(
    app_handle: tauri::AppHandle,
    window: WebviewWindow,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let current_monitor = window
            .current_monitor()
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "no current monitor".to_string())?;
        let monitor_pos = current_monitor.position();
        let screens = screenshots::Screen::all().map_err(|e| e.to_string())?;
        if screens.is_empty() {
            return Err("no screen available".to_string());
        }
        let screen = screens
            .iter()
            .find(|s| s.display_info.x == monitor_pos.x && s.display_info.y == monitor_pos.y)
            .unwrap_or(&screens[0])
            .clone();
        let image = screen.capture().map_err(|e| e.to_string())?;
        let out_dir = read_web_image_cache_dir(&app_handle);
        fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;
        let file_name = format!(
            "drawer_snip_background_{}.jpg",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_millis()
        );
        let out_path = out_dir.join(file_name);
        let file = File::create(&out_path).map_err(|e| e.to_string())?;
        let mut file = BufWriter::new(file);
        image
            .write_to(&mut file, screenshots::image::ImageFormat::Jpeg)
            .map_err(|e| e.to_string())?;
        Ok(out_path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn crop_image_file_to_file(
    app_handle: tauri::AppHandle,
    path: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    viewport_width: f64,
    viewport_height: f64,
    file_name: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let source = local_path_from_url_like(&path).unwrap_or_else(|| PathBuf::from(&path));
        let image = screenshots::image::open(&source).map_err(|e| e.to_string())?;
        let image_w = image.width().max(1);
        let image_h = image.height().max(1);
        let scale_x = image_w as f64 / viewport_width.max(1.0);
        let scale_y = image_h as f64 / viewport_height.max(1.0);

        let sx = (x * scale_x).round().max(0.0).min((image_w - 1) as f64) as u32;
        let sy = (y * scale_y).round().max(0.0).min((image_h - 1) as f64) as u32;
        let max_w = image_w.saturating_sub(sx).max(1);
        let max_h = image_h.saturating_sub(sy).max(1);
        let sw = (width * scale_x).round().max(1.0).min(max_w as f64) as u32;
        let sh = (height * scale_y).round().max(1.0).min(max_h as f64) as u32;

        let cropped = image.crop_imm(sx, sy, sw, sh);
        let out_dir = read_web_image_cache_dir(&app_handle);
        fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;
        let fallback_name = format!(
            "drawer_snip_area_{}.png",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_millis()
        );
        let safe_name = file_name
            .as_deref()
            .map(sanitize_file_name)
            .filter(|name| !name.trim().is_empty())
            .unwrap_or(fallback_name);
        let out_path = unique_file_path(out_dir.join(safe_name));
        cropped.save(&out_path).map_err(|e| e.to_string())?;
        Ok(out_path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn capture_screen_area_to_file(
    app_handle: tauri::AppHandle,
    window: WebviewWindow,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        capture_screen_area_to_file_impl(Some(app_handle), window, x, y, width, height)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn capture_screen_area_absolute_to_file(
    app_handle: tauri::AppHandle,
    window: WebviewWindow,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let scale = window.scale_factor().map_err(|e| e.to_string())?;
        let physical_x = (x * scale).round() as i32;
        let physical_y = (y * scale).round() as i32;
        let physical_w = (width * scale).round().max(1.0) as u32;
        let physical_h = (height * scale).round().max(1.0) as u32;

        window.hide().map_err(|e| e.to_string())?;
        let _ = window.set_position(LogicalPosition::new(-32000.0, -32000.0));
        std::thread::sleep(std::time::Duration::from_millis(16));

        let _ = window.emit("snip-area-captured", ());
        capture_physical_area_to_file(
            Some(&app_handle),
            physical_x,
            physical_y,
            physical_w,
            physical_h,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn capture_snip_selection_to_file(
    app_handle: tauri::AppHandle,
    window: WebviewWindow,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    viewport_width: f64,
    viewport_height: f64,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let window_pos = window.outer_position().map_err(|e| e.to_string())?;
        let window_size = window.outer_size().map_err(|e| e.to_string())?;
        let scale_x = window_size.width as f64 / viewport_width.max(1.0);
        let scale_y = window_size.height as f64 / viewport_height.max(1.0);
        let physical_x = window_pos.x + (x * scale_x).round() as i32;
        let physical_y = window_pos.y + (y * scale_y).round() as i32;
        let physical_w = (width * scale_x).round().max(1.0) as u32;
        let physical_h = (height * scale_y).round().max(1.0) as u32;

        window.hide().map_err(|e| e.to_string())?;
        let _ = window.set_position(LogicalPosition::new(-32000.0, -32000.0));
        std::thread::sleep(std::time::Duration::from_millis(16));

        capture_physical_area_to_file(
            Some(&app_handle),
            physical_x,
            physical_y,
            physical_w,
            physical_h,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn capture_snip_window_selection_to_file(
    app_handle: tauri::AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    viewport_width: f64,
    viewport_height: f64,
) -> Result<String, String> {
    let snip = app_handle
        .get_webview_window("snip")
        .ok_or_else(|| "snip window not found".to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let window_pos = snip.outer_position().map_err(|e| e.to_string())?;
        let window_size = snip.outer_size().map_err(|e| e.to_string())?;
        let scale_x = window_size.width as f64 / viewport_width.max(1.0);
        let scale_y = window_size.height as f64 / viewport_height.max(1.0);
        let physical_x = window_pos.x + (x * scale_x).round() as i32;
        let physical_y = window_pos.y + (y * scale_y).round() as i32;
        let physical_w = (width * scale_x).round().max(1.0) as u32;
        let physical_h = (height * scale_y).round().max(1.0) as u32;

        snip.hide().map_err(|e| e.to_string())?;
        let _ = snip.set_position(LogicalPosition::new(-32000.0, -32000.0));
        std::thread::sleep(std::time::Duration::from_millis(16));

        capture_physical_area_to_file(
            Some(&app_handle),
            physical_x,
            physical_y,
            physical_w,
            physical_h,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn complete_snip_selection(
    app_handle: tauri::AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    viewport_width: f64,
    viewport_height: f64,
    note_x: f64,
    note_y: f64,
    restore_drawer: bool,
    drawer_width: f64,
    drawer_height: f64,
    mode: Option<String>,
) -> Result<(), String> {
    let snip = app_handle
        .get_webview_window("snip")
        .ok_or_else(|| "snip window not found".to_string())?;
    let window_pos = snip.outer_position().map_err(|e| e.to_string())?;
    let window_size = snip.outer_size().map_err(|e| e.to_string())?;
    let scale_x = window_size.width as f64 / viewport_width.max(1.0);
    let scale_y = window_size.height as f64 / viewport_height.max(1.0);
    let physical_x = window_pos.x + (x * scale_x).round() as i32;
    let physical_y = window_pos.y + (y * scale_y).round() as i32;
    let physical_w = (width * scale_x).round().max(1.0) as u32;
    let physical_h = (height * scale_y).round().max(1.0) as u32;

    let _ = snip.hide();
    let _ = snip.set_position(LogicalPosition::new(-32000.0, -32000.0));
    if let Some(main) = app_handle.get_webview_window("main") {
        let _ = main.set_ignore_cursor_events(false);
        apply_main_workbench_mode(&main);
    }

    let app_for_capture = app_handle.clone();
    let capture_result = tauri::async_runtime::spawn_blocking(move || {
        capture_physical_area_to_file(
            Some(&app_for_capture),
            physical_x,
            physical_y,
            physical_w,
            physical_h,
        )
    })
    .await
    .map_err(|e| e.to_string())?;

    match capture_result {
        Ok(path) => {
            if let Some(main) = app_handle.get_webview_window("main") {
                let _ = main.emit(
                    "snip-captured",
                    serde_json::json!({
                        "path": path,
                        "x": x,
                        "y": y,
                        "width": width,
                        "height": height,
                        "noteX": note_x,
                        "noteY": note_y,
                    }),
                );
                let _ = main.emit("snip-recovered", ());
            }
            Ok(())
        }
        Err(err) => {
            let _ = recover_after_snip(
                app_handle.clone(),
                restore_drawer,
                drawer_width,
                drawer_height,
                mode.clone(),
            );
            Err(err)
        }
    }
}

fn capture_screen_area_to_file_impl(
    app_handle: Option<tauri::AppHandle>,
    window: WebviewWindow,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<String, String> {
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let window_pos = window.outer_position().map_err(|e| e.to_string())?;

    let physical_x = window_pos.x + (x * scale).round() as i32;
    let physical_y = window_pos.y + (y * scale).round() as i32;
    let physical_w = (width * scale).round().max(1.0) as u32;
    let physical_h = (height * scale).round().max(1.0) as u32;

    // 先隐藏并移走全屏截图窗口，避免 DWM 还没完成 hide 时把选区框截进去。
    window.hide().map_err(|e| e.to_string())?;
    let _ = window.set_position(LogicalPosition::new(-32000.0, -32000.0));
    std::thread::sleep(std::time::Duration::from_millis(16));

    capture_physical_area_to_file(
        app_handle.as_ref(),
        physical_x,
        physical_y,
        physical_w,
        physical_h,
    )
}

fn capture_physical_area_to_file(
    app_handle: Option<&tauri::AppHandle>,
    physical_x: i32,
    physical_y: i32,
    physical_w: u32,
    physical_h: u32,
) -> Result<String, String> {
    let screen =
        screenshots::Screen::from_point(physical_x, physical_y).map_err(|e| e.to_string())?;
    let display = screen.display_info;
    let rel_x = physical_x - display.x;
    let rel_y = physical_y - display.y;

    let max_w = (display.width as i32 - rel_x).max(1) as u32;
    let max_h = (display.height as i32 - rel_y).max(1) as u32;
    let safe_w = physical_w.min(max_w).max(1);
    let safe_h = physical_h.min(max_h).max(1);

    let image = screen
        .capture_area(rel_x.max(0), rel_y.max(0), safe_w, safe_h)
        .map_err(|e| e.to_string())?;

    // 像素已经捕获完成，可以立刻通知前端恢复抽屉。
    // 后面的 PNG 落盘不再阻塞用户看到抽屉。
    let file_name = format!(
        "drawer_snip_area_{}.png",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_millis()
    );
    let out_dir = app_handle
        .map(read_web_image_cache_dir)
        .unwrap_or_else(std::env::temp_dir);
    fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;
    let out_path = out_dir.join(file_name);
    let file = File::create(&out_path).map_err(|e| e.to_string())?;
    let writer = BufWriter::new(file);
    let encoder = screenshots::image::codecs::png::PngEncoder::new_with_quality(
        writer,
        screenshots::image::codecs::png::CompressionType::Fast,
        screenshots::image::codecs::png::FilterType::NoFilter,
    );
    screenshots::image::ImageEncoder::write_image(
        encoder,
        image.as_raw(),
        image.width(),
        image.height(),
        screenshots::image::ColorType::Rgba8,
    )
    .map_err(|e| e.to_string())?;

    Ok(out_path.to_string_lossy().to_string())
}

const EDGE_WINDOW_WIDTH: f64 = 20.0;
const EDGE_STRIP_HEIGHT: f64 = 96.0;
const FLOAT_TRIGGER_SIZE: f64 = 56.0;
const FLOAT_MARGIN: f64 = 12.0;
const DRAWER_MIN_WIDTH: f64 = 880.0;
const DRAWER_MIN_HEIGHT: f64 = 560.0;
const DRAWER_EDGE_MARGIN: f64 = 12.0;
static EDGE_STRIP_Y: OnceLock<Mutex<Option<f64>>> = OnceLock::new();

type LogicalWorkArea = (LogicalPosition<f64>, LogicalSize<f64>, f64);

fn monitor_work_area(monitor: &Monitor) -> LogicalWorkArea {
    let factor = monitor.scale_factor();
    let pos = monitor.work_area().position.to_logical::<f64>(factor);
    let size = monitor.work_area().size.to_logical::<f64>(factor);
    (pos, size, factor)
}

fn window_work_area(window: &WebviewWindow) -> Result<LogicalWorkArea, String> {
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "no monitor".to_string())?;
    Ok(monitor_work_area(&monitor))
}

fn window_work_area_with_fallback(
    primary: &WebviewWindow,
    fallback: Option<&WebviewWindow>,
) -> Result<LogicalWorkArea, String> {
    if let Ok(area) = window_work_area(primary) {
        return Ok(area);
    }
    if let Some(fallback) = fallback {
        if let Ok(area) = window_work_area(fallback) {
            return Ok(area);
        }
    }
    let monitor = primary
        .available_monitors()
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| "no monitor".to_string())?;
    Ok(monitor_work_area(&monitor))
}

fn window_work_area_for_point(
    window: &WebviewWindow,
    x: f64,
    y: f64,
) -> Result<LogicalWorkArea, String> {
    if !x.is_finite() || !y.is_finite() {
        return window_work_area(window);
    }

    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    let mut nearest: Option<(LogicalWorkArea, f64)> = None;

    for monitor in monitors {
        let area = monitor_work_area(&monitor);
        let (pos, size, _) = area;
        let left = pos.x;
        let top = pos.y;
        let right = pos.x + size.width;
        let bottom = pos.y + size.height;

        if x >= left && x <= right && y >= top && y <= bottom {
            return Ok(area);
        }

        let dx = if x < left {
            left - x
        } else if x > right {
            x - right
        } else {
            0.0
        };
        let dy = if y < top {
            top - y
        } else if y > bottom {
            y - bottom
        } else {
            0.0
        };
        let distance = dx * dx + dy * dy;

        match nearest {
            Some((_, best_distance)) if best_distance <= distance => {}
            _ => nearest = Some((area, distance)),
        }
    }

    nearest
        .map(|(area, _)| area)
        .ok_or_else(|| "no monitor".to_string())
}

fn preferred_note_work_area(
    app_handle: &tauri::AppHandle,
    note: &WebviewWindow,
) -> Option<LogicalWorkArea> {
    app_handle
        .get_webview_window("main")
        .and_then(|main| main.current_monitor().ok().flatten())
        .or_else(|| note.current_monitor().ok().flatten())
        .map(|monitor| monitor_work_area(&monitor))
}

fn clamp_f64(value: f64, min: f64, max: f64) -> f64 {
    value.max(min).min(max)
}

#[cfg(not(target_os = "windows"))]
fn set_window_bounds_atomic(
    window: &WebviewWindow,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|e| e.to_string())?;
    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
fn resize_window_preserve_right_physical(
    window: &WebviewWindow,
    work_pos: LogicalPosition<f64>,
    work_size: LogicalSize<f64>,
    factor: f64,
    width: f64,
    height: f64,
    right_anchor_px: Option<i32>,
) -> Result<(), String> {
    use std::ptr::null_mut;
    use winapi::shared::windef::RECT;
    use winapi::um::winuser::{
        GetWindowRect, SetWindowPos, SWP_NOACTIVATE, SWP_NOOWNERZORDER, SWP_NOZORDER,
    };

    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as winapi::shared::windef::HWND;

    let mut rect = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    let got_rect = unsafe { GetWindowRect(hwnd, &mut rect) };
    if got_rect == 0 {
        return Err(format!(
            "GetWindowRect failed: {}",
            std::io::Error::last_os_error()
        ));
    }

    let width_px = (width * factor).round().max(1.0) as i32;
    let height_px = (height * factor).round().max(1.0) as i32;
    let work_left_px = (work_pos.x * factor).round() as i32;
    let work_top_px = (work_pos.y * factor).round() as i32;
    let work_right_px = ((work_pos.x + work_size.width) * factor).round() as i32;
    let work_bottom_px = ((work_pos.y + work_size.height) * factor).round() as i32;

    // Anchor to a physical right edge. Computing this in logical space and converting
    // x/width separately causes ±1px drift on fractional DPI scales.
    let right_anchor_px = right_anchor_px.unwrap_or(rect.right);
    let max_x_px = work_right_px - width_px;
    let max_y_px = work_bottom_px - height_px;
    let x_px = (right_anchor_px - width_px)
        .max(work_left_px)
        .min(max_x_px.max(work_left_px));
    let y_px = rect.top.max(work_top_px).min(max_y_px.max(work_top_px));

    let ok = unsafe {
        SetWindowPos(
            hwnd,
            null_mut(),
            x_px,
            y_px,
            width_px,
            height_px,
            SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOOWNERZORDER,
        )
    };

    if ok == 0 {
        Err(format!(
            "SetWindowPos failed: {}",
            std::io::Error::last_os_error()
        ))
    } else {
        Ok(())
    }
}

#[cfg(target_os = "windows")]
fn resize_window_preserve_left_physical(
    window: &WebviewWindow,
    work_pos: LogicalPosition<f64>,
    work_size: LogicalSize<f64>,
    factor: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    use std::ptr::null_mut;
    use winapi::shared::windef::RECT;
    use winapi::um::winuser::{
        GetWindowRect, SetWindowPos, SWP_NOACTIVATE, SWP_NOOWNERZORDER, SWP_NOZORDER,
    };

    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as winapi::shared::windef::HWND;

    let mut rect = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    let got_rect = unsafe { GetWindowRect(hwnd, &mut rect) };
    if got_rect == 0 {
        return Err(format!(
            "GetWindowRect failed: {}",
            std::io::Error::last_os_error()
        ));
    }

    let width_px = (width * factor).round().max(1.0) as i32;
    let height_px = (height * factor).round().max(1.0) as i32;
    let work_left_px = (work_pos.x * factor).round() as i32;
    let work_top_px = (work_pos.y * factor).round() as i32;
    let work_bottom_px = ((work_pos.y + work_size.height) * factor).round() as i32;

    let max_y_px = work_bottom_px - height_px;
    let x_px = rect.left.max(work_left_px);
    let y_px = rect.top.max(work_top_px).min(max_y_px.max(work_top_px));

    let ok = unsafe {
        SetWindowPos(
            hwnd,
            null_mut(),
            x_px,
            y_px,
            width_px,
            height_px,
            SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOOWNERZORDER,
        )
    };

    if ok == 0 {
        Err(format!(
            "SetWindowPos failed: {}",
            std::io::Error::last_os_error()
        ))
    } else {
        Ok(())
    }
}

fn edge_strip_y_store() -> &'static Mutex<Option<f64>> {
    EDGE_STRIP_Y.get_or_init(|| Mutex::new(None))
}

fn get_saved_edge_strip_y() -> Option<f64> {
    edge_strip_y_store().lock().ok().and_then(|value| *value)
}

fn set_saved_edge_strip_y(y: f64) {
    if let Ok(mut value) = edge_strip_y_store().lock() {
        *value = Some(y);
    }
}

fn is_float_mode(mode: Option<&str>) -> bool {
    matches!(mode, Some("float"))
}

fn position_side_edge(
    app_handle: tauri::AppHandle,
    height: f64,
    y: Option<f64>,
) -> Result<(), String> {
    let edge = app_handle
        .get_webview_window("edge")
        .ok_or_else(|| "edge window not found".to_string())?;
    let main = app_handle.get_webview_window("main");

    let (work_pos, work_size, _) = window_work_area_with_fallback(&edge, main.as_ref())?;
    let edge_x = work_pos.x + work_size.width - EDGE_WINDOW_WIDTH;
    let edge_h = EDGE_STRIP_HEIGHT.min(work_size.height.max(1.0));
    let default_y = work_pos.y + ((work_size.height - edge_h) / 2.0).max(0.0);
    let max_y = work_pos.y + work_size.height - edge_h;
    let raw_y = y.or_else(get_saved_edge_strip_y).unwrap_or(default_y);
    let edge_y = clamp_f64(raw_y, work_pos.y, max_y.max(work_pos.y));
    set_saved_edge_strip_y(edge_y);

    // 侧边小条模式：系统窗口本身只保留小条的命中区域。
    // 右键拖动时只改变 y，x 永远锁在屏幕最右侧。
    edge.set_min_size(Some(LogicalSize::new(1.0, 1.0))).ok();
    edge.set_size(LogicalSize::new(EDGE_WINDOW_WIDTH, edge_h))
        .map_err(|e| e.to_string())?;
    edge.set_position(LogicalPosition::new(edge_x, edge_y))
        .map_err(|e| e.to_string())?;
    edge.set_always_on_top(true).ok();
    edge.show().map_err(|e| e.to_string())?;
    let _ = height;
    Ok(())
}

fn position_float_edge(
    app_handle: tauri::AppHandle,
    x: Option<f64>,
    y: Option<f64>,
) -> Result<(), String> {
    let edge = app_handle
        .get_webview_window("edge")
        .ok_or_else(|| "edge window not found".to_string())?;
    let main = app_handle.get_webview_window("main");

    let (initial_work_pos, initial_work_size, factor) =
        window_work_area_with_fallback(&edge, main.as_ref())?;
    let current_pos = edge
        .outer_position()
        .ok()
        .map(|pos| pos.to_logical::<f64>(factor));

    let default_x = initial_work_pos.x + initial_work_size.width - FLOAT_TRIGGER_SIZE - 24.0;
    let default_y = initial_work_pos.y + initial_work_size.height - FLOAT_TRIGGER_SIZE - 24.0;
    let raw_x = x.or_else(|| current_pos.map(|p| p.x)).unwrap_or(default_x);
    let raw_y = y.or_else(|| current_pos.map(|p| p.y)).unwrap_or(default_y);

    let (work_pos, work_size, _) = if x.is_some() || y.is_some() {
        window_work_area_for_point(
            &edge,
            raw_x + FLOAT_TRIGGER_SIZE / 2.0,
            raw_y + FLOAT_TRIGGER_SIZE / 2.0,
        )
        .or_else(|_| Ok::<LogicalWorkArea, String>((initial_work_pos, initial_work_size, factor)))?
    } else {
        (initial_work_pos, initial_work_size, factor)
    };

    let max_x = work_pos.x + work_size.width - FLOAT_TRIGGER_SIZE;
    let max_y = work_pos.y + work_size.height - FLOAT_TRIGGER_SIZE;
    let next_x = clamp_f64(raw_x, work_pos.x, max_x.max(work_pos.x));
    let next_y = clamp_f64(raw_y, work_pos.y, max_y.max(work_pos.y));

    edge.set_min_size(Some(LogicalSize::new(1.0, 1.0))).ok();
    edge.set_size(LogicalSize::new(FLOAT_TRIGGER_SIZE, FLOAT_TRIGGER_SIZE))
        .map_err(|e| e.to_string())?;
    edge.set_position(LogicalPosition::new(next_x, next_y))
        .map_err(|e| e.to_string())?;
    edge.set_always_on_top(true).ok();
    edge.show().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn position_edge(
    app_handle: tauri::AppHandle,
    height: f64,
    mode: Option<String>,
    x: Option<f64>,
    y: Option<f64>,
) -> Result<(), String> {
    let suppress_for_drawer = should_suppress_edge_window(
        is_startup_close_locked(),
        window_is_visible(&app_handle, "main"),
    );
    if is_anti_touch_locked() || suppress_for_drawer {
        if let Some(edge) = app_handle.get_webview_window("edge") {
            let _ = edge.hide();
        }
        return Ok(());
    }

    let result = if is_float_mode(mode.as_deref()) {
        position_float_edge(app_handle.clone(), x, y)
    } else {
        position_side_edge(app_handle.clone(), height, y)
    };
    if result.is_ok() {
        if let Some(edge) = app_handle.get_webview_window("edge") {
            let _ = edge.emit("edge-shown", ());
        }
    }
    result
}

#[tauri::command]
fn show_edge(
    app_handle: tauri::AppHandle,
    height: f64,
    mode: Option<String>,
    x: Option<f64>,
    y: Option<f64>,
) -> Result<(), String> {
    position_edge(app_handle, height, mode, x, y)
}

#[tauri::command]
fn hide_edge(app_handle: tauri::AppHandle) -> Result<(), String> {
    let edge = app_handle
        .get_webview_window("edge")
        .ok_or_else(|| "edge window not found".to_string())?;
    edge.hide().map_err(|e| e.to_string())
}

#[tauri::command]
fn show_snip_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    let snip = app_handle
        .get_webview_window("snip")
        .ok_or_else(|| "snip window not found".to_string())?;
    let main = app_handle.get_webview_window("main");
    let anchor = app_handle
        .get_webview_window("main")
        .or_else(|| app_handle.get_webview_window("edge"))
        .ok_or_else(|| "anchor window not found".to_string())?;
    let monitor = anchor
        .current_monitor()
        .map_err(|e| e.to_string())?
        .or_else(|| {
            anchor
                .available_monitors()
                .ok()
                .and_then(|mut monitors| monitors.pop())
        })
        .ok_or_else(|| "no current monitor".to_string())?;

    if let Some(main) = main.as_ref() {
        let _ = main.set_ignore_cursor_events(true);
    }

    snip.set_min_size(Some(LogicalSize::new(1.0, 1.0))).ok();
    snip.set_ignore_cursor_events(false).ok();
    snip.set_always_on_top(true).ok();
    snip.set_shadow(false).ok();
    snip.set_position(*monitor.position())
        .map_err(|e| e.to_string())?;
    snip.set_size(*monitor.size()).map_err(|e| e.to_string())?;
    snip.show().map_err(|e| e.to_string())?;
    let _ = snip.set_focus();

    #[cfg(target_os = "windows")]
    {
        use winapi::um::winuser::{
            SetForegroundWindow, SetWindowPos, HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW,
        };

        if let Ok(hwnd) = snip.hwnd() {
            let hwnd = hwnd.0 as winapi::shared::windef::HWND;
            unsafe {
                SetWindowPos(
                    hwnd,
                    HWND_TOPMOST,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
                );
                SetForegroundWindow(hwnd);
            }
        }
    }

    if let Some(main) = main.as_ref() {
        let _ = main.set_ignore_cursor_events(true);
    }
    let _ = snip.emit("snip-reset", ());
    Ok(())
}

#[tauri::command]
fn hide_snip_window(app_handle: tauri::AppHandle) -> Result<(), String> {
    if let Some(snip) = app_handle.get_webview_window("snip") {
        let _ = snip.hide();
        let _ = snip.set_position(LogicalPosition::new(-32000.0, -32000.0));
    }
    if let Some(main) = app_handle.get_webview_window("main") {
        let _ = main.set_ignore_cursor_events(false);
        apply_main_workbench_mode(&main);
    }
    Ok(())
}

#[tauri::command]
fn recover_after_snip(
    app_handle: tauri::AppHandle,
    restore_drawer: bool,
    width: f64,
    height: f64,
    mode: Option<String>,
) -> Result<(), String> {
    let _ = width;
    if let Some(snip) = app_handle.get_webview_window("snip") {
        let _ = snip.hide();
        let _ = snip.set_position(LogicalPosition::new(-32000.0, -32000.0));
    }
    if let Some(main) = app_handle.get_webview_window("main") {
        let _ = main.set_ignore_cursor_events(false);
    }

    if restore_drawer {
        if let Some(main) = app_handle.get_webview_window("main") {
            apply_main_workbench_mode(&main);
            let _ = main.show();
            let _ = main.emit("drawer-opened", ());
        }
    } else {
        show_edge(app_handle.clone(), height, mode, None, None)?;
    }

    if let Some(main) = app_handle.get_webview_window("main") {
        apply_main_workbench_mode(&main);
        let _ = main.emit("snip-recovered", ());
    }
    Ok(())
}

#[tauri::command]
fn open_drawer(
    app_handle: tauri::AppHandle,
    width: f64,
    height: f64,
    mode: Option<String>,
) -> Result<(), String> {
    if POST_INSTALL_LAUNCH_PENDING.load(Ordering::Acquire) {
        if let Some(main) = app_handle.get_webview_window("main") {
            let _ = main.hide();
        }
        if let Some(edge) = app_handle.get_webview_window("edge") {
            let _ = edge.hide();
        }
        return Ok(());
    }

    if is_anti_touch_locked() && !is_startup_close_locked() {
        if let Some(main) = app_handle.get_webview_window("main") {
            let _ = main.emit("drawer-closed", ());
            let _ = main.hide();
        }
        if let Some(edge) = app_handle.get_webview_window("edge") {
            let _ = edge.hide();
        }
        return Ok(());
    }

    let main = app_handle
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let edge = app_handle.get_webview_window("edge");

    if is_main_workbench_active() {
        apply_main_workbench_mode(&main);
        main.show().map_err(|e| e.to_string())?;
        let _ = main.emit("drawer-opened", ());
        if let Some(edge_window) = edge {
            let _ = edge_window.hide();
        }
        return Ok(());
    }

    let (work_pos, work_size, factor) = if let Some(edge_window) = edge.as_ref() {
        window_work_area_with_fallback(edge_window, Some(&main))?
    } else {
        window_work_area_with_fallback(&main, None)?
    };

    let w = width
        .max(DRAWER_MIN_WIDTH)
        .min((work_size.width - 40.0).max(DRAWER_MIN_WIDTH));
    let desired_h = height
        .max(DRAWER_MIN_HEIGHT)
        .min(work_size.height.max(DRAWER_MIN_HEIGHT));
    let mut h = desired_h;
    let max_x = work_pos.x + work_size.width - w;
    let max_y = work_pos.y + work_size.height - h;

    let current_visible_size = main
        .outer_size()
        .ok()
        .map(|size| size.to_logical::<f64>(factor));
    let looks_like_snip_fullscreen = current_visible_size
        .map(|size| size.width >= work_size.width - 4.0 && size.height >= work_size.height - 4.0)
        .unwrap_or(false);
    let preserve_current_position = main.is_visible().unwrap_or(false)
        && !looks_like_snip_fullscreen
        && !is_startup_close_locked();

    let (x, y) = if preserve_current_position {
        // 如果 main 已经显示，说明抽屉可能被用户手动拖到了别的位置。
        // 外部拖入文件或网页图片时只保证窗口尺寸正确，不再把它吸附回屏幕右侧。
        // 但截图全屏窗口不是用户摆放的位置，避免截图弹出后保留全屏左上角。
        let current_pos = main
            .outer_position()
            .ok()
            .map(|pos| pos.to_logical::<f64>(factor))
            .unwrap_or(LogicalPosition::new(
                work_pos.x + work_size.width - w,
                work_pos.y,
            ));
        (
            clamp_f64(current_pos.x, work_pos.x, max_x.max(work_pos.x)),
            clamp_f64(current_pos.y, work_pos.y, max_y.max(work_pos.y)),
        )
    } else if is_float_mode(mode.as_deref()) {
        if let Some(edge_window) = edge.as_ref() {
            let edge_pos = edge_window
                .outer_position()
                .ok()
                .map(|pos| pos.to_logical::<f64>(factor));
            let edge_size = edge_window
                .outer_size()
                .ok()
                .map(|size| size.to_logical::<f64>(factor));

            if let (Some(ep), Some(es)) = (edge_pos, edge_size) {
                let left_x = ep.x - w - FLOAT_MARGIN;
                let right_x = ep.x + es.width + FLOAT_MARGIN;
                let chosen_x = if left_x >= work_pos.x {
                    left_x
                } else if right_x <= max_x {
                    right_x
                } else {
                    left_x
                };
                let chosen_y = ep.y + es.height / 2.0 - h / 2.0;
                (
                    clamp_f64(chosen_x, work_pos.x, max_x.max(work_pos.x)),
                    clamp_f64(chosen_y, work_pos.y, max_y.max(work_pos.y)),
                )
            } else {
                (
                    work_pos.x + work_size.width - w,
                    work_pos.y + ((work_size.height - h) / 2.0).max(0.0),
                )
            }
        } else {
            (
                work_pos.x + work_size.width - w,
                work_pos.y + ((work_size.height - h) / 2.0).max(0.0),
            )
        }
    } else {
        // 侧边小条模式：抽屉主体跟随小条的垂直中心展开。
        // 如果小条靠近屏幕上下边缘，就自动降低抽屉高度，避免主体超出屏幕。
        let edge_h = EDGE_STRIP_HEIGHT.min(work_size.height.max(1.0));
        let default_center_y = work_pos.y + work_size.height / 2.0;
        let strip_center_y = get_saved_edge_strip_y()
            .map(|value| value + edge_h / 2.0)
            .or_else(|| {
                edge.as_ref().and_then(|edge_window| {
                    let pos = edge_window
                        .outer_position()
                        .ok()
                        .map(|pos| pos.to_logical::<f64>(factor));
                    let size = edge_window
                        .outer_size()
                        .ok()
                        .map(|size| size.to_logical::<f64>(factor));
                    match (pos, size) {
                        (Some(pos), Some(size)) => Some(pos.y + size.height / 2.0),
                        _ => None,
                    }
                })
            })
            .unwrap_or(default_center_y);

        let available_h = (work_size.height - DRAWER_EDGE_MARGIN * 2.0).max(1.0);
        let min_h = DRAWER_MIN_HEIGHT.min(available_h);
        let top_space = (strip_center_y - work_pos.y - DRAWER_EDGE_MARGIN).max(0.0);
        let bottom_space =
            (work_pos.y + work_size.height - DRAWER_EDGE_MARGIN - strip_center_y).max(0.0);
        let max_centered_h = (top_space.min(bottom_space) * 2.0).max(1.0);

        h = if max_centered_h >= min_h {
            desired_h.min(max_centered_h).max(min_h).min(available_h)
        } else {
            desired_h.min(available_h).max(min_h)
        };

        let min_y = work_pos.y + DRAWER_EDGE_MARGIN.min((work_size.height - h).max(0.0) / 2.0);
        let max_y = work_pos.y + work_size.height
            - h
            - DRAWER_EDGE_MARGIN.min((work_size.height - h).max(0.0) / 2.0);

        (
            work_pos.x + work_size.width - w,
            clamp_f64(strip_center_y - h / 2.0, min_y, max_y.max(min_y)),
        )
    };

    main.set_min_size(Some(LogicalSize::new(DRAWER_MIN_WIDTH, DRAWER_MIN_HEIGHT)))
        .ok();
    main.set_size(LogicalSize::new(w, h))
        .map_err(|e| e.to_string())?;
    main.set_position(LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    apply_main_workbench_mode(&main);
    main.show().map_err(|e| e.to_string())?;
    let _ = main.emit("drawer-opened", ());

    // 抽屉打开期间隐藏 edge，避免移动主体时经过触发器又重新展开。
    if let Some(edge_window) = edge {
        let _ = edge_window.hide();
    }

    Ok(())
}

#[tauri::command]
fn consume_post_install_launch(
    app_handle: tauri::AppHandle,
    width: f64,
    height: f64,
    mode: Option<String>,
) -> Result<bool, String> {
    if !POST_INSTALL_LAUNCH_PENDING.swap(false, Ordering::AcqRel) {
        return Ok(false);
    }

    set_startup_close_lock(0);
    open_drawer(app_handle, width, height, mode)?;
    Ok(true)
}

#[tauri::command]
fn close_drawer(app_handle: tauri::AppHandle, mode: Option<String>) -> Result<(), String> {
    let main = app_handle
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    let height = if let Ok(size) = main.outer_size() {
        let factor = main.scale_factor().unwrap_or(1.0);
        size.to_logical::<f64>(factor).height
    } else {
        800.0
    };

    // 在欢迎页显示期间，前端会设置一个短暂的后端关闭锁。
    // 任何旧的 edge 预热、mouseleave 或定时器触发 close_drawer，都不能真的 hide 主窗口。
    if is_startup_close_locked() {
        apply_main_workbench_mode(&main);
        main.show().map_err(|e| e.to_string())?;
        let _ = main.emit("drawer-opened", ());
        return Ok(());
    }

    let _ = main.emit("drawer-closed", ());
    main.hide().map_err(|e| e.to_string())?;
    position_edge(app_handle, height, mode, None, None).ok();
    Ok(())
}

#[tauri::command]
fn get_drawer_right_edge(app_handle: tauri::AppHandle) -> Result<f64, String> {
    let main = app_handle
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;

    #[cfg(target_os = "windows")]
    {
        use winapi::shared::windef::RECT;
        use winapi::um::winuser::GetWindowRect;

        let hwnd = main.hwnd().map_err(|e| e.to_string())?.0 as winapi::shared::windef::HWND;
        let mut rect = RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };
        let got_rect = unsafe { GetWindowRect(hwnd, &mut rect) };
        if got_rect == 0 {
            return Err(format!(
                "GetWindowRect failed: {}",
                std::io::Error::last_os_error()
            ));
        }
        return Ok(rect.right as f64);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let factor = main.scale_factor().unwrap_or(1.0);
        let pos = main
            .outer_position()
            .map_err(|e| e.to_string())?
            .to_logical::<f64>(factor);
        let size = main
            .outer_size()
            .map_err(|e| e.to_string())?
            .to_logical::<f64>(factor);
        Ok(pos.x + size.width)
    }
}

#[tauri::command]
fn resize_drawer(app_handle: tauri::AppHandle, width: f64, height: f64) -> Result<(), String> {
    let main = app_handle
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let (work_pos, work_size, factor) = window_work_area(&main)?;

    let w = width
        .max(DRAWER_MIN_WIDTH)
        .min((work_size.width - 40.0).max(DRAWER_MIN_WIDTH));
    let h = height
        .max(DRAWER_MIN_HEIGHT)
        .min(work_size.height.max(DRAWER_MIN_HEIGHT));

    #[cfg(target_os = "windows")]
    {
        resize_window_preserve_right_physical(&main, work_pos, work_size, factor, w, h, None)?;
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let current_pos = main
            .outer_position()
            .ok()
            .map(|pos| pos.to_logical::<f64>(factor))
            .unwrap_or(LogicalPosition::new(
                work_pos.x + work_size.width - w,
                work_pos.y,
            ));
        let current_size = main
            .outer_size()
            .ok()
            .map(|size| size.to_logical::<f64>(factor))
            .unwrap_or(LogicalSize::new(w, h));

        // 保持当前右边缘不移动，而不是每次缩放都吸附回屏幕最右侧。
        // 这样移动后自动钉住的抽屉，缩放时仍会留在用户放置的位置附近。
        let desired_right = current_pos.x + current_size.width;
        let max_x = work_pos.x + work_size.width - w;
        let max_y = work_pos.y + work_size.height - h;
        let x = clamp_f64(desired_right - w, work_pos.x, max_x.max(work_pos.x));
        let y = clamp_f64(current_pos.y, work_pos.y, max_y.max(work_pos.y));

        set_window_bounds_atomic(&main, x, y, w, h)?;
        Ok(())
    }
}

#[tauri::command]
fn resize_drawer_at_right(
    app_handle: tauri::AppHandle,
    width: f64,
    height: f64,
    right_edge: f64,
) -> Result<(), String> {
    let main = app_handle
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let (work_pos, work_size, factor) = window_work_area(&main)?;

    let w = width
        .max(DRAWER_MIN_WIDTH)
        .min((work_size.width - 40.0).max(DRAWER_MIN_WIDTH));
    let h = height
        .max(DRAWER_MIN_HEIGHT)
        .min(work_size.height.max(DRAWER_MIN_HEIGHT));

    #[cfg(target_os = "windows")]
    {
        resize_window_preserve_right_physical(
            &main,
            work_pos,
            work_size,
            factor,
            w,
            h,
            Some(right_edge.round() as i32),
        )?;
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let current_pos = main
            .outer_position()
            .ok()
            .map(|pos| pos.to_logical::<f64>(factor))
            .unwrap_or(LogicalPosition::new(
                work_pos.x + work_size.width - w,
                work_pos.y,
            ));
        let max_x = work_pos.x + work_size.width - w;
        let max_y = work_pos.y + work_size.height - h;
        let x = clamp_f64(right_edge - w, work_pos.x, max_x.max(work_pos.x));
        let y = clamp_f64(current_pos.y, work_pos.y, max_y.max(work_pos.y));

        set_window_bounds_atomic(&main, x, y, w, h)?;
        Ok(())
    }
}

#[tauri::command]
fn resize_drawer_from_right(
    app_handle: tauri::AppHandle,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let main = app_handle
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let (work_pos, work_size, factor) = window_work_area(&main)?;

    let w = width
        .max(DRAWER_MIN_WIDTH)
        .min((work_size.width - 40.0).max(DRAWER_MIN_WIDTH));
    let h = height
        .max(DRAWER_MIN_HEIGHT)
        .min(work_size.height.max(DRAWER_MIN_HEIGHT));

    main.set_min_size(Some(LogicalSize::new(DRAWER_MIN_WIDTH, DRAWER_MIN_HEIGHT)))
        .ok();

    #[cfg(target_os = "windows")]
    {
        resize_window_preserve_left_physical(&main, work_pos, work_size, factor, w, h)?;
        return Ok(());
    }

    #[cfg(not(target_os = "windows"))]
    {
        let current_pos = main
            .outer_position()
            .ok()
            .map(|pos| pos.to_logical::<f64>(factor))
            .unwrap_or(LogicalPosition::new(work_pos.x, work_pos.y));

        let max_y = work_pos.y + work_size.height - h;
        let x = current_pos.x.max(work_pos.x);
        let y = clamp_f64(current_pos.y, work_pos.y, max_y.max(work_pos.y));

        set_window_bounds_atomic(&main, x, y, w, h)?;
        Ok(())
    }
}

#[tauri::command]
fn sync_drawer_bounds(app_handle: tauri::AppHandle, width: f64, height: f64) -> Result<(), String> {
    resize_drawer(app_handle, width, height)
}

const MAX_FLOATING_NOTE_WINDOWS: u32 = 8;
const MAX_PREWARMED_NOTE_WINDOWS: u32 = 2;

fn note_window_index(label: &str) -> Result<Option<u32>, String> {
    if label == "note" {
        return Ok(None);
    }

    let Some(raw_index) = label.strip_prefix("note_") else {
        return Err(format!("invalid note window label: {}", label));
    };

    raw_index
        .parse::<u32>()
        .map(Some)
        .map_err(|_| format!("invalid note window label: {}", label))
}

fn validate_note_window_label(label: &str) -> Result<(), String> {
    if let Some(index) = note_window_index(label)? {
        if !(1..=MAX_FLOATING_NOTE_WINDOWS).contains(&index) {
            return Err(format!(
                "桌面便签最多同时保留 {} 个，请先关闭一个便签。",
                MAX_FLOATING_NOTE_WINDOWS
            ));
        }
    }

    Ok(())
}

fn can_prewarm_note_window(label: &str) -> Result<bool, String> {
    match note_window_index(label)? {
        Some(index) => Ok(index <= MAX_PREWARMED_NOTE_WINDOWS),
        None => Ok(MAX_PREWARMED_NOTE_WINDOWS > 0),
    }
}

fn enforce_note_window_limit(
    app_handle: &tauri::AppHandle,
    target_label: &str,
) -> Result<(), String> {
    let visible_count = (1..=MAX_FLOATING_NOTE_WINDOWS)
        .filter(|index| {
            let label = format!("note_{}", index);
            if label == target_label {
                return true;
            }
            app_handle
                .get_webview_window(&label)
                .and_then(|window| window.is_visible().ok())
                .unwrap_or(false)
        })
        .count() as u32;

    if visible_count > MAX_FLOATING_NOTE_WINDOWS {
        return Err(format!(
            "桌面便签最多同时保留 {} 个，请先关闭一个便签。",
            MAX_FLOATING_NOTE_WINDOWS
        ));
    }

    Ok(())
}

fn build_hidden_note_window(
    app_handle: &tauri::AppHandle,
    label: String,
) -> Result<WebviewWindow, String> {
    WebviewWindowBuilder::new(app_handle, label, WebviewUrl::App("note.html".into()))
        .title("Desktop note")
        .inner_size(360.0, 320.0)
        .min_inner_size(48.0, 48.0)
        .resizable(true)
        .fullscreen(false)
        .transparent(true)
        .decorations(false)
        .always_on_top(false)
        .skip_taskbar(true)
        .visible(false)
        .shadow(false)
        .drag_and_drop(false)
        .build()
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn prewarm_note_window(app_handle: tauri::AppHandle, label: Option<String>) -> Result<(), String> {
    let label = label.unwrap_or_else(|| "note_1".to_string());
    validate_note_window_label(&label)?;
    if !can_prewarm_note_window(&label)? {
        return Ok(());
    }
    if app_handle.get_webview_window(&label).is_none() {
        let _ = build_hidden_note_window(&app_handle, label)?;
    }
    Ok(())
}

#[tauri::command]
fn show_note_window(
    app_handle: tauri::AppHandle,
    label: Option<String>,
    width: Option<f64>,
    height: Option<f64>,
    x: Option<f64>,
    y: Option<f64>,
    topmost: Option<bool>,
) -> Result<(), String> {
    let label = label.unwrap_or_else(|| "note_1".to_string());
    validate_note_window_label(&label)?;
    enforce_note_window_limit(&app_handle, &label)?;
    thread::spawn(move || {
        if let Err(err) = show_note_window_impl(app_handle, label, width, height, x, y, topmost) {
            eprintln!("show note window failed: {err}");
        }
    });
    Ok(())
}

fn show_note_window_impl(
    app_handle: tauri::AppHandle,
    label: String,
    width: Option<f64>,
    height: Option<f64>,
    x: Option<f64>,
    y: Option<f64>,
    topmost: Option<bool>,
) -> Result<(), String> {
    let note = if let Some(note) = app_handle.get_webview_window(&label) {
        note
    } else {
        build_hidden_note_window(&app_handle, label.clone())?
    };

    note.set_min_size(Some(LogicalSize::new(48.0, 48.0))).ok();

    let w = width.unwrap_or(360.0).max(48.0);
    let h = height.unwrap_or(320.0).max(48.0);

    let _ = note.set_size(LogicalSize::new(w, h));
    let _ = note.set_always_on_top(topmost.unwrap_or(false));

    if let (Some(x), Some(y)) = (x, y) {
        if let Some((work_pos, work_size, _)) = preferred_note_work_area(&app_handle, &note) {
            let max_x = work_pos.x + work_size.width - w;
            let max_y = work_pos.y + work_size.height - h;
            let _ = note.set_position(LogicalPosition::new(
                x.max(work_pos.x).min(max_x.max(work_pos.x)),
                y.max(work_pos.y).min(max_y.max(work_pos.y)),
            ));
        } else {
            let _ = note.set_position(LogicalPosition::new(x, y));
        }
    } else if !note.is_visible().unwrap_or(false) {
        if let Some((work_pos, work_size, _)) = preferred_note_work_area(&app_handle, &note) {
            let offset = label
                .trim_start_matches("note_")
                .parse::<f64>()
                .unwrap_or(1.0)
                .max(1.0);
            let x = work_pos.x + (work_size.width - w) / 2.0 + ((offset - 1.0) * 28.0);
            let y = work_pos.y + (work_size.height - h) / 2.0 + ((offset - 1.0) * 24.0);
            let max_x = work_pos.x + work_size.width - w;
            let max_y = work_pos.y + work_size.height - h;
            let _ = note.set_position(LogicalPosition::new(
                x.max(work_pos.x).min(max_x.max(work_pos.x)),
                y.max(work_pos.y).min(max_y.max(work_pos.y)),
            ));
        }
    }

    note.show().map_err(|e| e.to_string())?;
    let _ = note.set_focus();
    Ok(())
}

#[tauri::command]
fn hide_note_window(app_handle: tauri::AppHandle, label: String) -> Result<(), String> {
    validate_note_window_label(&label)?;

    let Some(note) = app_handle.get_webview_window(&label) else {
        return Ok(());
    };

    note.hide().map_err(|e| e.to_string())?;
    if can_prewarm_note_window(&label)? {
        return Ok(());
    }
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(160));
        let _ = note.close();
    });
    Ok(())
}

const NOTE_SNAP_THRESHOLD_LOGICAL: f64 = 7.0;

#[derive(Clone, Copy)]
struct NoteSnapRect {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

fn is_note_window_label(label: &str) -> bool {
    label == "note" || label.starts_with("note_")
}

fn ranges_near_or_overlap(
    a_start: i32,
    a_end: i32,
    b_start: i32,
    b_end: i32,
    threshold: i32,
) -> bool {
    a_start <= b_end.saturating_add(threshold) && b_start <= a_end.saturating_add(threshold)
}

fn consider_snap_candidate(best: &mut Option<(i32, i32)>, candidate: i32, distance: i32) {
    match *best {
        Some((_, best_distance)) if best_distance <= distance => {}
        _ => *best = Some((candidate, distance)),
    }
}

fn is_detaching_from_snap(current: i32, candidate: i32, delta: i32) -> bool {
    delta.abs() > 1 && (current - candidate).abs() <= 1
}

fn snapped_note_window_position(
    app_handle: &tauri::AppHandle,
    window: &WebviewWindow,
    current_x: i32,
    current_y: i32,
    target_x: i32,
    target_y: i32,
    move_x: i32,
    move_y: i32,
) -> (i32, i32) {
    let current_label = window.label().to_string();
    if !is_note_window_label(&current_label) {
        return (target_x, target_y);
    }

    let size = match window.outer_size() {
        Ok(size) => size,
        Err(_) => return (target_x, target_y),
    };
    let width = size.width.min(i32::MAX as u32) as i32;
    let height = size.height.min(i32::MAX as u32) as i32;
    let target = NoteSnapRect {
        left: target_x,
        top: target_y,
        right: target_x.saturating_add(width),
        bottom: target_y.saturating_add(height),
    };

    let threshold = (NOTE_SNAP_THRESHOLD_LOGICAL * window.scale_factor().unwrap_or(1.0))
        .round()
        .max(4.0) as i32;
    let mut best_x: Option<(i32, i32)> = None;
    let mut best_y: Option<(i32, i32)> = None;

    for index in 0..=50 {
        let label = if index == 0 {
            "note".to_string()
        } else {
            format!("note_{}", index)
        };
        if label == current_label {
            continue;
        }

        let Some(other) = app_handle.get_webview_window(&label) else {
            continue;
        };
        if !other.is_visible().unwrap_or(false) {
            continue;
        }

        let other_pos = match other.outer_position() {
            Ok(pos) => pos,
            Err(_) => continue,
        };
        let other_size = match other.outer_size() {
            Ok(size) => size,
            Err(_) => continue,
        };
        let other_width = other_size.width.min(i32::MAX as u32) as i32;
        let other_height = other_size.height.min(i32::MAX as u32) as i32;
        let other_rect = NoteSnapRect {
            left: other_pos.x,
            top: other_pos.y,
            right: other_pos.x.saturating_add(other_width),
            bottom: other_pos.y.saturating_add(other_height),
        };

        let vertical_near = ranges_near_or_overlap(
            target.top,
            target.bottom,
            other_rect.top,
            other_rect.bottom,
            threshold,
        );
        if vertical_near {
            let candidates = [
                (other_rect.left, (target.left - other_rect.left).abs()),
                (other_rect.right, (target.left - other_rect.right).abs()),
                (
                    other_rect.left.saturating_sub(width),
                    (target.right - other_rect.left).abs(),
                ),
                (
                    other_rect.right.saturating_sub(width),
                    (target.right - other_rect.right).abs(),
                ),
            ];
            for (candidate, distance) in candidates {
                if is_detaching_from_snap(current_x, candidate, move_x) {
                    continue;
                }
                if distance <= threshold {
                    consider_snap_candidate(&mut best_x, candidate, distance);
                }
            }
        }

        let horizontal_near = ranges_near_or_overlap(
            target.left,
            target.right,
            other_rect.left,
            other_rect.right,
            threshold,
        );
        if horizontal_near {
            let candidates = [
                (other_rect.top, (target.top - other_rect.top).abs()),
                (other_rect.bottom, (target.top - other_rect.bottom).abs()),
                (
                    other_rect.top.saturating_sub(height),
                    (target.bottom - other_rect.top).abs(),
                ),
                (
                    other_rect.bottom.saturating_sub(height),
                    (target.bottom - other_rect.bottom).abs(),
                ),
            ];
            for (candidate, distance) in candidates {
                if is_detaching_from_snap(current_y, candidate, move_y) {
                    continue;
                }
                if distance <= threshold {
                    consider_snap_candidate(&mut best_y, candidate, distance);
                }
            }
        }
    }

    (
        best_x.map(|(candidate, _)| candidate).unwrap_or(target_x),
        best_y.map(|(candidate, _)| candidate).unwrap_or(target_y),
    )
}

#[tauri::command]
fn move_current_window_by(
    app_handle: tauri::AppHandle,
    window: WebviewWindow,
    dx: f64,
    dy: f64,
) -> Result<(), String> {
    if !dx.is_finite() || !dy.is_finite() {
        return Err("invalid move delta".to_string());
    }
    let factor = window.scale_factor().map_err(|e| e.to_string())?;
    let current = window.outer_position().map_err(|e| e.to_string())?;
    let move_x = (dx * factor)
        .round()
        .clamp(i32::MIN as f64, i32::MAX as f64) as i32;
    let move_y = (dy * factor)
        .round()
        .clamp(i32::MIN as f64, i32::MAX as f64) as i32;
    let target_x = current.x.saturating_add(move_x);
    let target_y = current.y.saturating_add(move_y);
    let (x, y) = snapped_note_window_position(
        &app_handle,
        &window,
        current.x,
        current.y,
        target_x,
        target_y,
        move_x,
        move_y,
    );

    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn resize_current_window(window: WebviewWindow, width: f64, height: f64) -> Result<(), String> {
    let label = window.label();
    let is_note = label == "note" || label.starts_with("note_");
    let min_width = if is_note { 48.0 } else { 220.0 };
    let min_height = if is_note { 48.0 } else { 160.0 };
    let max_width = if is_note { f64::MAX } else { 920.0 };
    let max_height = if is_note { f64::MAX } else { 820.0 };
    if is_note {
        window
            .set_min_size(Some(LogicalSize::new(min_width, min_height)))
            .ok();
    }
    let w = clamp_f64(width, min_width, max_width);
    let h = clamp_f64(height, min_height, max_height);
    window
        .set_size(LogicalSize::new(w, h))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn cancel_current_window_resize_animation() {
    WINDOW_RESIZE_ANIMATION_TOKEN.fetch_add(1, Ordering::Relaxed);
}

#[tauri::command]
fn animate_current_window_resize(
    window: WebviewWindow,
    width: f64,
    height: f64,
    duration_ms: Option<u64>,
) -> Result<(), String> {
    let label = window.label();
    let is_note = label == "note" || label.starts_with("note_");
    let min_width = if is_note { 48.0 } else { 220.0 };
    let min_height = if is_note { 48.0 } else { 160.0 };
    let max_width = if is_note { f64::MAX } else { 920.0 };
    let max_height = if is_note { f64::MAX } else { 820.0 };
    if is_note {
        window
            .set_min_size(Some(LogicalSize::new(min_width, min_height)))
            .ok();
    }

    let factor = window.scale_factor().map_err(|e| e.to_string())?;
    let start_size = window
        .outer_size()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(factor);
    let start_w = start_size.width;
    let start_h = start_size.height;
    let target_w = clamp_f64(width, min_width, max_width);
    let target_h = clamp_f64(height, min_height, max_height);
    let duration = duration_ms.unwrap_or(110).max(1);
    let token = WINDOW_RESIZE_ANIMATION_TOKEN.fetch_add(1, Ordering::Relaxed) + 1;
    let window_for_animation = window.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let started_at = std::time::Instant::now();
        loop {
            if WINDOW_RESIZE_ANIMATION_TOKEN.load(Ordering::Relaxed) != token {
                break;
            }

            let elapsed = started_at.elapsed().as_millis() as f64;
            let progress = (elapsed / duration as f64).clamp(0.0, 1.0);
            let eased = 1.0 - (1.0 - progress).powi(3);
            let next_w = start_w + (target_w - start_w) * eased;
            let next_h = start_h + (target_h - start_h) * eased;
            let _ = window_for_animation.set_size(LogicalSize::new(next_w.round(), next_h.round()));

            if progress >= 1.0 {
                break;
            }

            std::thread::sleep(Duration::from_millis(16));
        }

        if WINDOW_RESIZE_ANIMATION_TOKEN.load(Ordering::Relaxed) == token {
            let _ = window_for_animation.set_size(LogicalSize::new(target_w, target_h));
        }
    });

    Ok(())
}

fn powershell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

#[cfg(target_os = "windows")]
fn encode_powershell_script(script: &str) -> String {
    use base64::{engine::general_purpose, Engine as _};
    let mut bytes = Vec::with_capacity(script.len() * 2);
    for unit in script.encode_utf16() {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    general_purpose::STANDARD.encode(bytes)
}

#[cfg(target_os = "windows")]
fn show_windows_toast(title: &str, body: &str) -> Result<(), String> {
    let title = title.trim().chars().take(96).collect::<String>();
    let body = body.trim().chars().take(420).collect::<String>();
    let title = if title.is_empty() {
        "灵感抽屉".to_string()
    } else {
        title
    };
    let body = if body.is_empty() {
        "你有新的日程提醒".to_string()
    } else {
        body
    };
    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
$title = {title}
$body = {body}
$xmlTitle = [System.Security.SecurityElement]::Escape($title)
$xmlBody = [System.Security.SecurityElement]::Escape($body)
$toastXml = @"
<toast>
  <visual>
    <binding template="ToastGeneric">
      <text>$xmlTitle</text>
      <text>$xmlBody</text>
    </binding>
  </visual>
</toast>
"@
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
$doc = [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime]::new()
$doc.LoadXml($toastXml)
$toast = [Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime]::new($doc)
$lastError = $null
foreach ($appId in @('com.inspirationdrawer.app', 'Inspiration Drawer', 'Windows PowerShell')) {{
  try {{
    $notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId)
    $notifier.Show($toast)
    exit 0
  }} catch {{
    $lastError = $_
  }}
}}
if ($lastError) {{ throw $lastError }}
"#,
        title = powershell_single_quote(&title),
        body = powershell_single_quote(&body),
    );
    let encoded = encode_powershell_script(&script);
    let mut cmd = SysCommand::new("powershell.exe");
    hide_console_window(&mut cmd);
    let output = cmd
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-EncodedCommand",
            &encoded,
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Err(if stderr.is_empty() { stdout } else { stderr })
    }
}

#[cfg(not(target_os = "windows"))]
fn show_windows_toast(_title: &str, _body: &str) -> Result<(), String> {
    Err("system notifications are only wired for Windows right now".to_string())
}

#[tauri::command]
fn show_system_notification(title: String, body: String) -> Result<(), String> {
    show_windows_toast(&title, &body)
}

fn current_or_default_drawer_size(app: &tauri::AppHandle) -> (f64, f64) {
    app.get_webview_window("main")
        .and_then(|main| {
            let factor = main.scale_factor().ok()?;
            let size = main.outer_size().ok()?.to_logical::<f64>(factor);
            if size.width >= DRAWER_MIN_WIDTH && size.height >= DRAWER_MIN_HEIGHT {
                Some((size.width, size.height))
            } else {
                None
            }
        })
        .unwrap_or((400.0, 800.0))
}

fn request_force_rescue(app: &tauri::AppHandle) {
    set_startup_close_lock(0);
    ANTI_TOUCH_LOCKED.store(0, Ordering::Relaxed);

    let (width, height) = current_or_default_drawer_size(app);
    let _ = open_drawer(app.clone(), width, height, None);
    let _ = app.emit("force-rescue", ());
}

fn window_is_visible(app: &tauri::AppHandle, label: &str) -> bool {
    app.get_webview_window(label)
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false)
}

fn schedule_startup_edge_rescue(app: tauri::AppHandle) {
    let _ = thread::spawn(move || {
        thread::sleep(Duration::from_millis(1800));

        // During an overwrite install, the frontend owns the first stable open.
        // Give WebView startup enough time before falling back to the edge trigger.
        if POST_INSTALL_LAUNCH_PENDING.load(Ordering::Acquire) {
            thread::sleep(Duration::from_millis(8200));
            POST_INSTALL_LAUNCH_PENDING.store(false, Ordering::Release);
        }

        if is_anti_touch_locked()
            || window_is_visible(&app, "main")
            || window_is_visible(&app, "edge")
        {
            return;
        }

        // Frontend failed to show the startup drawer within the rescue window.
        // Release the startup guard so the edge fallback can become visible.
        set_startup_close_lock(0);

        let height = app
            .get_webview_window("main")
            .and_then(|main| {
                let factor = main.scale_factor().ok()?;
                Some(main.outer_size().ok()?.to_logical::<f64>(factor).height)
            })
            .unwrap_or(800.0);

        let _ = show_edge(app.clone(), height, None, None, None);
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            request_force_rescue(app);
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(agent::AgentRuntimeState::default())
        .manage(SnipState {
            pre_snip_bounds: std::sync::Mutex::new(None),
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            load_items,
            commands::assets::list_assets,
            commands::assets::get_asset_by_id,
            commands::assets::get_asset_count,
            commands::assets::upsert_assets,
            commands::assets::update_asset,
            commands::assets::delete_asset,
            commands::assets::get_assets_by_ids,
            commands::assets::get_assets_in_viewport,
            commands::assets::debug_get_all_canvas_nodes,
            commands::assets::upsert_canvas_nodes,
            commands::assets::list_folders,
            commands::assets::replace_folders,
            commands::assets::move_folders,
            commands::assets::list_tags,
            commands::assets::get_asset_thumbnails,
            commands::canvas::list_canvases,
            commands::canvas::list_deleted_canvases,
            commands::canvas::get_canvas,
            commands::canvas::create_canvas,
            commands::canvas::duplicate_canvas,
            commands::canvas::save_canvas_snapshot,
            commands::canvas::rename_canvas,
            commands::canvas::soft_delete_canvas,
            commands::canvas::restore_canvas,
            commands::canvas::permanently_delete_canvas,
            commands::canvas::get_canvas_trash_count,
            commands::canvas::set_active_canvas,
            commands::canvas::get_active_canvas,
            commands::canvas::list_canvas_nodes,
            commands::canvas::get_canvas_nodes_in_viewport,
            commands::canvas::update_canvas_nodes,
            commands::canvas::patch_canvas_nodes,
            commands::migration::migrate_json_to_sqlite,
            commands::migration::get_migration_status,
            commands::migration::rollback_to_json_mode,
            agent::agent_load_settings,
            agent::agent_save_settings,
            agent::get_byok_unlock_status,
            agent::activate_byok_unlock,
            agent::deactivate_byok_unlock,
            agent::agent_openai_chat,
            agent::agent_analyze_inspiration,
            agent::agent_cancel_openai,
            agent::agent_list_openai_models,
            agent::agent_test_api_connection,
            agent::agent_query_api_balance,
            agent::agent_codex_status,
            agent::agent_install_codex,
            agent::agent_codex_start,
            agent::agent_codex_restart,
            agent::agent_codex_request,
            agent::agent_codex_respond,
            agent::agent_codex_stop,
            agent::agent_open_auth_url,
            save_items,
            load_folders,
            save_folders,
            load_canvas_state,
            save_canvas_state,
            append_ai_debug_log,
            load_ai_analysis_config,
            save_ai_analysis_config,
            get_web_image_cache_dir,
            set_web_image_cache_dir,
            ensure_image_thumbnail_file,
            get_local_vision_model_status,
            install_ollama_silent,
            ensure_ollama_vision_model,
            get_rife_engine_status,
            install_rife_engine,
            get_rife_frame_interpolation_estimate,
            run_rife_frame_interpolation,
            ensure_video_cfr_tools,
            normalize_video_cfr_if_needed,
            get_realesrgan_engine_status,
            install_realesrgan_engine,
            cancel_realesrgan_enhancement_estimate,
            get_realesrgan_enhancement_estimate,
            run_realesrgan_image_enhancement,
            run_realesrgan_video_enhancement,
            run_ffmpeg_quick_video_enhancement,
            get_network_proxy,
            set_network_proxy,
            get_siliconflow_vision_models,
            get_openai_compatible_models,
            query_canvas_api_balance,
            test_canvas_api_connection,
            get_ai_json,
            post_ai_json,
            post_ai_text,
            post_ai_image_edit,
            upload_xais_reference_images,
            get_ai_text,
            get_ai_image_content,
            check_newapi_reference_urls_ready,
            create_cloudflared_public_image_urls,
            stop_cloudflared_share,
            create_tmpfiles_public_image_urls,
            create_litterbox_public_image_urls,
            create_r2_public_image_urls,
            delete_r2_public_image_urls,
            create_oss_public_image_urls,
            delete_oss_public_image_urls,
            resolve_ai_image_result_url,
            read_local_image_data_url,
            collect_web_images,
            cache_web_image,
            cache_web_image_to_dir,
            relocate_web_cache_file,
            describe_image_for_search_local_vlm,
            describe_image_for_search,
            sys_update_bounds,
            set_topmost,
            set_main_workbench_active,
            sys_drag_window,
            snap_to_right,
            toggle_pin,
            get_local_ip,
            get_mobile_pair_url,
            open_file,
            get_video_thumb,
            check_and_install_app_update_mirrors,
            path_kind,
            collect_drop_media_paths,
            read_canvas_template_json,
            get_local_media_metadata,
            delete_local_file,
            show_in_folder,
            copy_local_file,
            cache_local_file_to_dir,
            eagle_api_get,
            eagle_probe_port,
            eagle_probe_process,
            eagle_read_offline_library,
            save_item_source_as,
            save_dropped_file,
            commands::license::get_machine_id,
            commands::license::get_license_status,
            commands::license::request_email_verification,
            commands::license::verify_email_registration,
            commands::license::sync_email_license,
            commands::license::get_cloud_account,
            commands::license::redeem_credit_code,
            commands::license::generate_cloud_images,
            commands::license::get_cloud_image_generation_by_request,
            commands::license::get_cloud_image_models,
            commands::license::generate_cloud_videos,
            commands::license::get_cloud_video_status,
            commands::license::import_license,
            commands::license::remove_license,
            commands::license::check_feature,
            commands::drag_window,
            commands::update_bounds,
            commands::set_ignore_mouse,
            commands::set_drawer_pass_through,
            commands::capture_screen,
            commands::enter_snip_mode,
            commands::exit_snip_mode,
            capture_screen_area,
            capture_screen_area_to_file,
            capture_screen_area_absolute_to_file,
            capture_snip_selection_to_file,
            capture_snip_window_selection_to_file,
            complete_snip_selection,
            get_shortcut,
            update_shortcut,
            refresh_edge_drop_targets,
            cancel_virtual_drop,
            get_auto_start,
            set_auto_start,
            copy_image,
            start_file_drag,
            copy_files_to_clipboard,
            set_startup_close_lock,
            consume_post_install_launch,
            set_anti_touch_lock,
            open_drawer,
            close_drawer,
            get_drawer_right_edge,
            resize_drawer,
            resize_drawer_at_right,
            resize_drawer_from_right,
            position_edge,
            show_edge,
            hide_edge,
            show_snip_window,
            hide_snip_window,
            recover_after_snip,
            sync_drawer_bounds,
            prewarm_note_window,
            show_note_window,
            hide_note_window,
            move_current_window_by,
            resize_current_window,
            animate_current_window_resize,
            cancel_current_window_resize_animation,
            show_system_notification,
        ])
        .setup(|app| {
            POST_INSTALL_LAUNCH_PENDING.store(take_post_install_launch_marker(), Ordering::Release);
            set_startup_close_lock(16_000);

            if let Some(main) = app.get_webview_window("main") {
                let _ = main.set_shadow(false);
                apply_main_workbench_mode(&main);
                let _ = main.set_min_size(Some(tauri::LogicalSize::new(
                    DRAWER_MIN_WIDTH,
                    DRAWER_MIN_HEIGHT,
                )));
            }

            if let Some(edge) = app.get_webview_window("edge") {
                let _ = edge.set_shadow(false);
                let _ = edge.set_always_on_top(true);
                let _ = edge.set_min_size(Some(tauri::LogicalSize::new(1.0, 1.0)));
                let _ = position_edge(app.handle().clone(), 800.0, None, None, None);
            }
            schedule_startup_edge_rescue(app.handle().clone());

            if let Some(snip) = app.get_webview_window("snip") {
                let _ = snip.set_shadow(false);
                let _ = snip.set_always_on_top(true);
                let _ = snip.set_min_size(Some(tauri::LogicalSize::new(1.0, 1.0)));
                let _ = snip.hide();
            }

            if let Err(err) = native_drop::init_native_drop(app) {
                eprintln!("native drop init failed: {err}");
            }

            start_mobile_server(app.handle().clone());

            if let Some(icon) = app.default_window_icon().cloned() {
                let open_item =
                    MenuItem::with_id(app, "open_drawer", "打开抽屉", true, None::<&str>)?;
                let trigger_item =
                    MenuItem::with_id(app, "toggle_trigger", "切换入口", true, None::<&str>)?;
                let theme_item =
                    MenuItem::with_id(app, "toggle_theme", "切换主题", true, None::<&str>)?;
                let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
                let tray_menu =
                    Menu::with_items(app, &[&open_item, &trigger_item, &theme_item, &quit_item])?;

                let _ = TrayIconBuilder::new()
                    .icon(icon)
                    .tooltip("Inspiration drawer")
                    .menu(&tray_menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        "open_drawer" => {
                            request_force_rescue(app);
                        }
                        "toggle_trigger" => {
                            let _ = app.emit("tray-toggle-trigger-mode", ());
                        }
                        "toggle_theme" => {
                            let _ = app.emit("tray-toggle-theme", ());
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            request_force_rescue(&app);
                        }
                    })
                    .build(app);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
