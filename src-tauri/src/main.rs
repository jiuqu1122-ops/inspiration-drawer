// src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod license;
mod native_drag;
mod native_drop;

use hmac::{Hmac, Mac};
use reqwest::blocking::multipart::{Form, Part};
use reqwest::blocking::Client;
use reqwest::redirect::Policy;
use sha2::{Digest, Sha256};
use std::collections::{hash_map::DefaultHasher, HashMap, HashSet};
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
use std::time::{Duration, Instant};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    Emitter, LogicalPosition, LogicalSize, Manager, Monitor, PhysicalPosition, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};
use time::{format_description, OffsetDateTime};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;
const APP_USER_AGENT: &str = "inspiration-drawer";
const MAX_STORED_DATA_THUMBNAIL_CHARS: usize = 96 * 1024;

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

fn cloudflared_shares() -> &'static Mutex<HashMap<String, CloudflaredShare>> {
    CLOUDFLARED_SHARES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn r2_shares() -> &'static Mutex<HashMap<String, R2Share>> {
    R2_SHARES.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CloudflaredPublicImageUrls {
    share_id: String,
    urls: Vec<String>,
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

#[tauri::command]
fn set_startup_close_lock(ms: u64) {
    let until = if ms == 0 {
        0
    } else {
        now_millis_u64().saturating_add(ms)
    };
    STARTUP_CLOSE_LOCK_UNTIL_MS.store(until, Ordering::Relaxed);
}

fn is_anti_touch_locked() -> bool {
    ANTI_TOUCH_LOCKED.load(Ordering::Relaxed) != 0
}

#[tauri::command]
fn set_anti_touch_lock(locked: bool) {
    ANTI_TOUCH_LOCKED.store(if locked { 1 } else { 0 }, Ordering::Relaxed);
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

fn build_http_client(
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
        .build()
        .map_err(|e| format!("初始化直连网络客户端失败：{}", e))
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
    let client = build_http_client(Some(app_handle), explicit_proxy, 90)?;
    let mut response = client
        .get(url)
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
    {
        let mut file = File::create(&tmp_path).map_err(|e| e.to_string())?;
        response
            .copy_to(&mut file)
            .map_err(|e| format!("写入下载文件失败：{}", e))?;
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
const RIFE_ENGINE_ASSET_URL: &str = "https://github.com/jiuqu1122-ops/inspiration-drawer/releases/download/engine-rife-20221029/rife-ncnn-vulkan-20221029-windows-lite.zip";
const RIFE_ENGINE_SHA256: &str = "A4DA55EC5629DBD5E9C6594D96225308325FC39A3DF67CD8E77010207525CE77";
const RIFE_ENGINE_ZIP_SIZE: u64 = 123_750_542;
const FFMPEG_TOOLS_DIR_NAME: &str = "ffmpeg-tools-n8.1-win64-gpl";
const FFMPEG_TOOLS_ASSET_URL: &str = "https://github.com/jiuqu1122-ops/inspiration-drawer/releases/download/engine-rife-20221029/ffmpeg-tools-n8.1-win64-gpl.zip";
const FFMPEG_TOOLS_SHA256: &str =
    "D4B1D805749E6FA174E4BE158E844AD93BACBF23C2C68EDD473EEBE96B09CA63";
const FFMPEG_TOOLS_ZIP_SIZE: u64 = 109_205_730;
const REALESRGAN_ENGINE_VERSION: &str = "20220424";
const REALESRGAN_ENGINE_DIR_NAME: &str = "realesrgan-ncnn-vulkan-20220424-windows";
const REALESRGAN_ENGINE_ASSET_URL: &str = "https://github.com/jiuqu1122-ops/inspiration-drawer/releases/download/engine-realesrgan-20220424/realesrgan-ncnn-vulkan-20220424-windows.zip";
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
    output_fps: Option<f64>,
    estimated_seconds_min: Option<f64>,
    estimated_seconds_max: Option<f64>,
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
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RealEsrganEnhancementEstimate {
    duration_sec: Option<f64>,
    width: Option<u32>,
    height: Option<u32>,
    fps: Option<f64>,
    output_width: Option<u32>,
    output_height: Option<u32>,
    estimated_seconds_min: Option<f64>,
    estimated_seconds_max: Option<f64>,
}

struct VideoProbeInfo {
    duration_sec: Option<f64>,
    width: Option<u32>,
    height: Option<u32>,
    fps: Option<f64>,
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
    let mut buffer = [0u8; 1024 * 1024];
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

fn download_rife_engine_archive(
    app_handle: &tauri::AppHandle,
    archive_path: &Path,
    progress_id: Option<&str>,
) -> Result<(), String> {
    if let Some(parent) = archive_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建引擎下载目录失败: {}", e))?;
    }
    emit_rife_engine_progress(
        app_handle,
        progress_id,
        "connecting-rife",
        "连接 RIFE 下载源",
        0,
        0,
    );
    let client = build_engine_download_http_client(app_handle, 1800)?;
    let mut response = client
        .get(RIFE_ENGINE_ASSET_URL)
        .send()
        .map_err(|e| format!("下载 RIFE 引擎失败: {}。请检查网络/代理后重试，或稍后再试。", e))?;
    if !response.status().is_success() {
        return Err(format!(
            "下载 RIFE 引擎失败，HTTP 状态码: {}",
            response.status()
        ));
    }

    let tmp_path = archive_path.with_extension("download.tmp");
    {
        let mut file = File::create(&tmp_path).map_err(|e| format!("创建下载文件失败: {}", e))?;
        copy_response_to_file_with_progress(
            &mut response,
            &mut file,
            app_handle,
            progress_id,
            "downloading-rife",
            "下载 RIFE 引擎",
            RIFE_ENGINE_ZIP_SIZE,
        )?;
    }
    fs::rename(&tmp_path, archive_path)
        .or_else(|_| {
            fs::copy(&tmp_path, archive_path).map(|_| ())?;
            let _ = fs::remove_file(&tmp_path);
            Ok::<(), std::io::Error>(())
        })
        .map_err(|e| format!("保存 RIFE 引擎失败: {}", e))
}

fn download_realesrgan_engine_archive(
    app_handle: &tauri::AppHandle,
    archive_path: &Path,
    progress_id: Option<&str>,
) -> Result<(), String> {
    if let Some(parent) = archive_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建 Real-ESRGAN 下载目录失败: {}", e))?;
    }
    emit_rife_engine_progress(
        app_handle,
        progress_id,
        "connecting-realesrgan",
        "连接 Real-ESRGAN 下载源",
        0,
        0,
    );
    let client = build_engine_download_http_client(app_handle, 1800)?;
    let mut response = client
        .get(REALESRGAN_ENGINE_ASSET_URL)
        .send()
        .map_err(|e| format!("下载 Real-ESRGAN 引擎失败: {}。请检查网络/代理后重试，或稍后再试。", e))?;
    if !response.status().is_success() {
        return Err(format!(
            "下载 Real-ESRGAN 引擎失败，HTTP 状态码: {}",
            response.status()
        ));
    }

    let tmp_path = archive_path.with_extension("download.tmp");
    {
        let mut file = File::create(&tmp_path).map_err(|e| format!("创建下载文件失败: {}", e))?;
        copy_response_to_file_with_progress(
            &mut response,
            &mut file,
            app_handle,
            progress_id,
            "downloading-realesrgan",
            "下载 Real-ESRGAN 引擎",
            REALESRGAN_ENGINE_ZIP_SIZE,
        )?;
    }
    fs::rename(&tmp_path, archive_path)
        .or_else(|_| {
            fs::copy(&tmp_path, archive_path).map(|_| ())?;
            let _ = fs::remove_file(&tmp_path);
            Ok::<(), std::io::Error>(())
        })
        .map_err(|e| format!("保存 Real-ESRGAN 引擎失败: {}", e))
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
    if let Some(parent) = archive_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建 FFmpeg 工具下载目录失败: {}", e))?;
    }
    emit_rife_engine_progress(
        app_handle,
        progress_id,
        "connecting-ffmpeg-tools",
        "连接 FFmpeg / FFprobe 下载源",
        0,
        0,
    );
    let client = build_engine_download_http_client(app_handle, 1800)?;
    let mut response = client
        .get(FFMPEG_TOOLS_ASSET_URL)
        .send()
        .map_err(|e| format!("下载 FFmpeg / FFprobe 工具失败: {}。请检查网络/代理后重试，或稍后再试。", e))?;
    if !response.status().is_success() {
        return Err(format!(
            "下载 FFmpeg / FFprobe 工具失败，HTTP 状态码: {}",
            response.status()
        ));
    }

    let tmp_path = archive_path.with_extension("download.tmp");
    {
        let mut file =
            File::create(&tmp_path).map_err(|e| format!("创建工具下载文件失败: {}", e))?;
        copy_response_to_file_with_progress(
            &mut response,
            &mut file,
            app_handle,
            progress_id,
            "downloading-ffmpeg-tools",
            "下载 FFmpeg / FFprobe",
            FFMPEG_TOOLS_ZIP_SIZE,
        )?;
    }
    fs::rename(&tmp_path, archive_path)
        .or_else(|_| {
            fs::copy(&tmp_path, archive_path).map(|_| ())?;
            let _ = fs::remove_file(&tmp_path);
            Ok::<(), std::io::Error>(())
        })
        .map_err(|e| format!("保存 FFmpeg / FFprobe 工具失败: {}", e))
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
    ensure_realesrgan_engine_installed(&app_handle, None)
}

fn run_hidden_command(command: &mut SysCommand, label: &str) -> Result<String, String> {
    hide_console_window(command);
    let output = command
        .output()
        .map_err(|e| format!("{} 调用失败: {}", label, e))?;
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

fn probe_video_fps(ffprobe_path: &Path, source: &Path) -> Option<f64> {
    let mut cmd = SysCommand::new(ffprobe_path);
    cmd.args([
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=avg_frame_rate",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
    ])
    .arg(source);
    run_hidden_command(&mut cmd, "FFprobe")
        .ok()
        .and_then(|text| parse_fps_value(text.lines().next().unwrap_or("")))
}

fn probe_video_info(ffprobe_path: &Path, source: &Path) -> Result<VideoProbeInfo, String> {
    let mut cmd = SysCommand::new(ffprobe_path);
    cmd.args([
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,avg_frame_rate,duration:format=duration",
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

    Ok(VideoProbeInfo {
        duration_sec,
        width,
        height,
        fps,
    })
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

fn realesrgan_model_name(mode: &str, _scale: u32) -> &'static str {
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
    let scale_cost = if scale >= 4 { 2.35 } else { 1.0 };
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
    scale: u32,
    output_format: &str,
) -> Result<(), String> {
    let model_name = realesrgan_model_name(mode, scale);
    let mut cmd = SysCommand::new(exe_path);
    cmd.current_dir(engine_dir)
        .arg("-i")
        .arg(input)
        .arg("-o")
        .arg(output)
        .arg("-n")
        .arg(model_name)
        .arg("-s")
        .arg(scale.to_string())
        .arg("-f")
        .arg(output_format);
    run_hidden_command(&mut cmd, "Real-ESRGAN 清晰度增强")?;
    Ok(())
}

#[tauri::command]
async fn get_rife_frame_interpolation_estimate(
    app_handle: tauri::AppHandle,
    input_path: String,
    factor: Option<u32>,
    target_fps: Option<f64>,
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
    let target_fps = target_fps.unwrap_or(60.0).clamp(1.0, 240.0);
    let quality = quality.unwrap_or_else(|| "standard".to_string());
    let output_format = output_format.unwrap_or_else(|| "mp4".to_string());
    let (_ffmpeg_path, ffprobe_path) =
        ensure_media_tools_available(&app_handle, progress_id.as_deref())?;
    let source =
        local_path_from_url_like(&input_path).unwrap_or_else(|| PathBuf::from(&input_path));
    if !source.is_file() {
        return Err(format!(
            "找不到要估算的补帧视频: {}",
            display_local_path(&source)
        ));
    }
    let info = probe_video_info(&ffprobe_path, &source)?;
    let fps = info.fps.unwrap_or(30.0).max(1.0);
    let output_fps = if fixed_2x_mode {
        fps * 2.0
    } else {
        target_fps.min(fps * factor as f64).max(fps).min(240.0)
    };
    let duration_for_estimate = info.duration_sec.unwrap_or(15.0).max(1.0);
    let width_for_estimate = info.width.unwrap_or(1920).max(1);
    let height_for_estimate = info.height.unwrap_or(1080).max(1);
    let (estimated_seconds_min, estimated_seconds_max) = estimate_rife_seconds(
        duration_for_estimate,
        width_for_estimate,
        height_for_estimate,
        fps,
        output_fps,
        factor,
        &mode,
        &quality,
        &output_format,
    );

    Ok(RifeFrameInterpolationEstimate {
        duration_sec: info.duration_sec,
        width: info.width,
        height: info.height,
        fps: Some(fps),
        output_fps: Some(output_fps),
        estimated_seconds_min: Some(estimated_seconds_min),
        estimated_seconds_max: Some(estimated_seconds_max),
    })
}

#[tauri::command]
async fn run_rife_frame_interpolation(
    app_handle: tauri::AppHandle,
    input_path: String,
    factor: Option<u32>,
    model: Option<String>,
    target_fps: Option<f64>,
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
    let target_fps = target_fps.unwrap_or(60.0).clamp(1.0, 240.0);
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
        let fps = probe_video_fps(&ffprobe_path, &source).unwrap_or(30.0);
        let output_fps = if fixed_2x_mode {
            fps * 2.0
        } else {
            target_fps.min(fps * factor as f64).max(fps).min(240.0)
        };
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
                .arg(&source)
                .args(["-vn", "-acodec", "copy"])
                .arg(&audio_path);
            run_hidden_command(&mut audio_cmd, "FFmpeg 音频提取").is_ok() && audio_path.is_file()
        } else {
            false
        };

        let mut decode_cmd = SysCommand::new(&ffmpeg_path);
        decode_cmd
            .args(["-y", "-hide_banner", "-loglevel", "error", "-i"])
            .arg(&source)
            .arg(input_frames_dir.join("frame_%08d.png"));
        run_hidden_command(&mut decode_cmd, "FFmpeg 视频解帧")?;

        let input_frame_count = count_frame_images(&input_frames_dir)?;
        if input_frame_count == 0 {
            return Err("视频解帧失败，没有得到可用帧".to_string());
        }
        let target_frame_count = ((input_frame_count as f64) * (output_fps / fps))
            .round()
            .max(input_frame_count as f64)
            .min((input_frame_count.saturating_mul(factor as usize)) as f64)
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
        run_hidden_command(&mut rife_cmd, "RIFE 补帧")?;

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
        run_hidden_command(&mut encode_cmd, "FFmpeg 视频合成")?;

        if !output_path.is_file() {
            return Err("RIFE 补帧完成，但没有生成输出视频".to_string());
        }

        Ok(RifeFrameInterpolationResult {
            output_path: display_local_path(&output_path),
            engine_dir: status.engine_dir.clone(),
            fps,
            output_fps,
            factor,
            input_frames: input_frame_count,
        })
    })();

    let _ = fs::remove_dir_all(&work_dir);
    result
}

#[tauri::command]
async fn get_realesrgan_enhancement_estimate(
    _app_handle: tauri::AppHandle,
    input_path: String,
    media_type: Option<String>,
    scale: Option<u32>,
    resize_mode: Option<String>,
    _progress_id: Option<String>,
) -> Result<RealEsrganEnhancementEstimate, String> {
    let media_type = media_type
        .unwrap_or_else(|| "image".to_string())
        .trim()
        .to_ascii_lowercase();
    let is_video = media_type == "video";
    let scale = normalize_realesrgan_scale(scale);
    let resize_mode = normalize_realesrgan_resize_mode(resize_mode);
    let source =
        local_path_from_url_like(&input_path).unwrap_or_else(|| PathBuf::from(&input_path));
    if !source.is_file() {
        return Err(format!(
            "找不到要增强的素材: {}",
            display_local_path(&source)
        ));
    }

    let (duration_sec, width, height, fps) = if is_video {
        if let Some((_ffmpeg_path, ffprobe_path)) = resolve_system_media_tools().or_else(|| {
            bundled_media_tool_path("ffmpeg")
                .ok()
                .zip(bundled_media_tool_path("ffprobe").ok())
                .filter(|(ffmpeg_path, ffprobe_path)| ffmpeg_path.is_file() && ffprobe_path.is_file())
        }) {
            match probe_video_info(&ffprobe_path, &source) {
                Ok(info) => (
                    info.duration_sec,
                    info.width,
                    info.height,
                    info.fps.or(Some(30.0)),
                ),
                Err(_) => (Some(15.0), None, None, Some(30.0)),
            }
        } else {
            (Some(15.0), None, None, Some(30.0))
        }
    } else {
        (Some(1.0), None, None, None)
    };

    let width_for_estimate = width.unwrap_or(if is_video { 1920 } else { 1024 }).max(1);
    let height_for_estimate = height.unwrap_or(if is_video { 1080 } else { 1024 }).max(1);
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
    let (estimated_seconds_min, estimated_seconds_max) = estimate_realesrgan_seconds(
        duration_sec.unwrap_or(if is_video { 15.0 } else { 1.0 }),
        width_for_estimate,
        height_for_estimate,
        scale,
        &resize_mode,
        if is_video { "video" } else { "image" },
    );

    Ok(RealEsrganEnhancementEstimate {
        duration_sec,
        width,
        height,
        fps,
        output_width,
        output_height,
        estimated_seconds_min: Some(estimated_seconds_min),
        estimated_seconds_max: Some(estimated_seconds_max),
    })
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
    let scale = normalize_realesrgan_scale(scale);
    let mode = normalize_realesrgan_mode(mode);
    let resize_mode = normalize_realesrgan_resize_mode(resize_mode);
    let output_format = normalize_realesrgan_image_format(output_format);
    let progress_id_ref = progress_id.as_deref();
    let status = ensure_realesrgan_engine_installed(&app_handle, progress_id_ref)?;
    let engine_dir = PathBuf::from(&status.engine_dir);
    let exe_path = PathBuf::from(&status.exe_path);
    if !exe_path.is_file() {
        return Err("Real-ESRGAN 引擎不可用，请重新安装引擎".to_string());
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
        let source_stem = source
            .file_stem()
            .and_then(|value| value.to_str())
            .map(sanitize_file_name)
            .unwrap_or_else(|| "image".to_string());
        let output_path = unique_file_path(outputs_dir.join(format!(
            "{}_realesrgan_{}x_{}.{}",
            source_stem, scale, resize_mode, output_format
        )));
        let enhanced_path = if resize_mode == "keep" {
            work_dir.join(format!("enhanced.{}", output_format))
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
        run_realesrgan_on_path(
            &exe_path,
            &engine_dir,
            &source,
            &enhanced_path,
            &mode,
            scale,
            &output_format,
        )?;

        if resize_mode == "keep" {
            let (ffmpeg_path, _ffprobe_path) =
                ensure_media_tools_available(&app_handle, progress_id_ref)?;
            let mut resize_cmd = SysCommand::new(&ffmpeg_path);
            resize_cmd
                .args(["-y", "-hide_banner", "-loglevel", "error", "-i"])
                .arg(&enhanced_path)
                .args([
                    "-vf",
                    &format!("scale=iw/{}:ih/{}", scale, scale),
                    "-frames:v",
                    "1",
                ]);
            if output_format == "jpg" {
                resize_cmd.args(["-q:v", "2"]);
            }
            resize_cmd.arg(&output_path);
            run_hidden_command(&mut resize_cmd, "FFmpeg 图片缩回原尺寸")?;
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
        })
    })();

    let _ = fs::remove_dir_all(&work_dir);
    result
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
    progress_id: Option<String>,
) -> Result<RealEsrganEnhancementResult, String> {
    let scale = normalize_realesrgan_scale(scale);
    let mode = normalize_realesrgan_mode(mode);
    let resize_mode = normalize_realesrgan_resize_mode(resize_mode);
    let keep_audio = keep_audio.unwrap_or(true);
    let output_format = normalize_realesrgan_video_format(output_format);
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
        let info = probe_video_info(&ffprobe_path, &source)?;
        let fps = info.fps.unwrap_or(30.0).max(1.0);
        let source_stem = source
            .file_stem()
            .and_then(|value| value.to_str())
            .map(sanitize_file_name)
            .unwrap_or_else(|| "video".to_string());
        let output_path = unique_file_path(outputs_dir.join(format!(
            "{}_realesrgan_{}x_{}.{}",
            source_stem, scale, resize_mode, output_format
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
            .arg(&source)
            .arg(input_frames_dir.join("frame_%08d.png"));
        run_hidden_command(&mut decode_cmd, "FFmpeg 视频解帧")?;
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
        run_realesrgan_on_path(
            &exe_path,
            &engine_dir,
            &input_frames_dir,
            &enhanced_frames_dir,
            &mode,
            scale,
            "png",
        )?;
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
                encode_cmd.args(["-vf", &format!("scale={}:{}", width.max(1), height.max(1))]);
            } else {
                encode_cmd.args(["-vf", &format!("scale=iw/{}:ih/{}", scale, scale)]);
            }
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
        run_hidden_command(&mut encode_cmd, "FFmpeg 增强视频合成")?;

        if !output_path.is_file() {
            return Err("视频增强完成，但没有生成输出视频".to_string());
        }
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
        })
    })();

    let _ = fs::remove_dir_all(&work_dir);
    result
}

fn http_get_text(
    app_handle: &tauri::AppHandle,
    url: &str,
    api_key: &str,
    explicit_proxy: Option<&str>,
) -> Result<String, String> {
    let timeout_secs = 1600;
    let client = build_http_client(Some(app_handle), explicit_proxy, timeout_secs)?;
    let response_result = client
        .get(url)
        .header(
            "accept",
            "text/event-stream, application/json, text/plain, */*",
        )
        .bearer_auth(api_key)
        .send();

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
            direct_client
                .get(url)
                .header(
                    "accept",
                    "text/event-stream, application/json, text/plain, */*",
                )
                .bearer_auth(api_key)
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
        Err(format!("AI GET 请求失败，HTTP {}：{}", status, text))
    }
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

fn http_post_json(
    app_handle: &tauri::AppHandle,
    url: &str,
    api_key: &str,
    body: &serde_json::Value,
    explicit_proxy: Option<&str>,
) -> Result<String, String> {
    let timeout_secs = 300;
    let client = build_http_client(Some(app_handle), explicit_proxy, timeout_secs)?;
    let response_result = client.post(url).bearer_auth(api_key).json(body).send();

    let response = match response_result {
        Ok(response) => response,
        Err(first_err) => {
            let can_retry_direct = explicit_proxy
                .map(|value| value.trim().is_empty())
                .unwrap_or(true);
            if !can_retry_direct {
                return Err(format!("AI 请求失败：{}", first_err));
            }
            let direct_client = build_direct_http_client(timeout_secs)?;
            direct_client
                .post(url)
                .bearer_auth(api_key)
                .json(body)
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
    let text = response.text().map_err(|e| e.to_string())?;
    if status.is_success() {
        Ok(text)
    } else {
        Err(format!("AI 请求失败，HTTP {}：{}", status, text))
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
    if value.starts_with("data:image/") {
        return decode_data_image(value);
    }

    if value.starts_with("http://") || value.starts_with("https://") {
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
        return Ok((bytes, mime));
    }

    let path = local_path_from_url_like(value).unwrap_or_else(|| PathBuf::from(value));
    if path.is_file() {
        let bytes = fs::read(&path).map_err(|e| format!("读取参考图失败：{}", e))?;
        return Ok((bytes, guess_mime_from_path(&path).to_string()));
    }

    Err("参考图必须是公网 URL、data URL 或本地图片路径".to_string())
}

fn build_ai_image_edit_form(
    client: &Client,
    model: &str,
    prompt: &str,
    n: u32,
    size: &str,
    images: &[String],
) -> Result<Form, String> {
    let mut form = Form::new()
        .text("model", model.to_string())
        .text("prompt", prompt.to_string())
        .text("n", n.to_string())
        .text("size", size.to_string());

    for (index, image) in images.iter().take(8).enumerate() {
        let (bytes, mime) = image_edit_source_to_bytes(client, image)?;
        let ext = image_mime_extension(&mime);
        let part = Part::bytes(bytes)
            .file_name(format!("input-{}.{}", index + 1, ext))
            .mime_str(&mime)
            .map_err(|e| format!("参考图 MIME 设置失败：{}", e))?;
        let field_name = if index == 0 { "image" } else { "image[]" };
        form = form.part(field_name, part);
    }

    Ok(form)
}

fn http_post_image_edit(
    app_handle: &tauri::AppHandle,
    url: &str,
    api_key: &str,
    model: &str,
    prompt: &str,
    n: u32,
    size: &str,
    images: &[String],
    explicit_proxy: Option<&str>,
) -> Result<String, String> {
    if images.is_empty() {
        return Err("缺少参考图".to_string());
    }

    let timeout_secs = 300;
    let client = build_http_client(Some(app_handle), explicit_proxy, timeout_secs)?;
    let response_result = client
        .post(url)
        .bearer_auth(api_key)
        .multipart(build_ai_image_edit_form(
            &client, model, prompt, n, size, images,
        )?)
        .send();

    let response = match response_result {
        Ok(response) => response,
        Err(first_err) => {
            let can_retry_direct = explicit_proxy
                .map(|value| value.trim().is_empty())
                .unwrap_or(true);
            if !can_retry_direct {
                return Err(format!("AI 图片上传失败：{}", first_err));
            }
            let direct_client = build_direct_http_client(timeout_secs)?;
            direct_client
                .post(url)
                .bearer_auth(api_key)
                .multipart(build_ai_image_edit_form(
                    &direct_client,
                    model,
                    prompt,
                    n,
                    size,
                    images,
                )?)
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
    let text = response.text().map_err(|e| e.to_string())?;
    if status.is_success() {
        Ok(text)
    } else {
        Err(format!("AI 图片上传失败，HTTP {}：{}", status, text))
    }
}

#[tauri::command]
async fn post_ai_json(
    app_handle: tauri::AppHandle,
    url: String,
    api_key: String,
    body: serde_json::Value,
    proxy: Option<String>,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if api_key.trim().is_empty() {
            return Err("请先填写 API Key".to_string());
        }
        let raw = http_post_json(
            &app_handle,
            &url,
            &api_key,
            &body,
            proxy.as_deref().filter(|value| !value.trim().is_empty()),
        )?;
        serde_json::from_str(&raw)
            .map_err(|e| format!("AI 响应 JSON 解析失败：{}；原始返回：{}", e, raw))
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
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if api_key.trim().is_empty() {
            return Err("请先填写 API Key".to_string());
        }
        http_post_json(
            &app_handle,
            &url,
            &api_key,
            &body,
            proxy.as_deref().filter(|value| !value.trim().is_empty()),
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
    size: String,
    images: Vec<String>,
    proxy: Option<String>,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if api_key.trim().is_empty() {
            return Err("请先填写 API Key".to_string());
        }
        let raw = http_post_image_edit(
            &app_handle,
            &url,
            &api_key,
            &model,
            &prompt,
            n,
            &size,
            &images,
            proxy.as_deref().filter(|value| !value.trim().is_empty()),
        )?;
        serde_json::from_str(&raw)
            .map_err(|e| format!("AI 图片响应 JSON 解析失败：{}；原始返回：{}", e, raw))
    })
    .await
    .map_err(|e| format!("AI 图片上传任务失败：{}", e))?
}

#[tauri::command]
async fn get_ai_json(
    app_handle: tauri::AppHandle,
    url: String,
    api_key: String,
    proxy: Option<String>,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if api_key.trim().is_empty() {
            return Err("Please enter API Key first.".to_string());
        }
        let raw = http_get_text(
            &app_handle,
            &url,
            &api_key,
            proxy.as_deref().filter(|value| !value.trim().is_empty()),
        )?;
        serde_json::from_str(&raw).map_err(|e| {
            format!(
                "AI response JSON parse failed: {}; raw response: {}",
                e, raw
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
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if api_key.trim().is_empty() {
            return Err("Please enter API Key first.".to_string());
        }
        http_get_text(
            &app_handle,
            &url,
            &api_key,
            proxy.as_deref().filter(|value| !value.trim().is_empty()),
        )
    })
    .await
    .map_err(|e| format!("AI GET request task failed: {}", e))?
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

#[tauri::command]
fn save_item_source_as(
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

    let safe_name = sanitize_file_name(&file_name);
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let out_path = uploads_dir.join(format!("{}_{}", stamp, safe_name));

    fs::write(&out_path, bytes).map_err(|e| e.to_string())?;
    Ok(out_path.to_string_lossy().to_string())
}

fn get_user_data_dir(app_handle: &tauri::AppHandle) -> PathBuf {
    let path = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }
    path
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

fn compact_items_payload(value: &mut serde_json::Value) {
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
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_folders(app_handle: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = get_user_data_dir(&app_handle).join("drawer_folders.json");
    if path.exists() {
        let content = fs::read_to_string(path).unwrap_or_else(|_| "[]".to_string());
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(serde_json::json!([]))
    }
}

#[tauri::command]
fn save_folders(app_handle: tauri::AppHandle, folders: serde_json::Value) -> Result<(), String> {
    let path = get_user_data_dir(&app_handle).join("drawer_folders.json");
    let content = serde_json::to_string(&folders).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_canvas_state(app_handle: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = get_user_data_dir(&app_handle).join("drawer_canvas.json");
    if path.exists() {
        let content = fs::read_to_string(path).unwrap_or_else(|_| "{}".to_string());
        let mut value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        compact_items_payload(&mut value);
        Ok(value)
    } else {
        Ok(serde_json::json!({}))
    }
}

#[tauri::command]
fn save_canvas_state(
    app_handle: tauri::AppHandle,
    mut state: serde_json::Value,
) -> Result<(), String> {
    let path = get_user_data_dir(&app_handle).join("drawer_canvas.json");
    compact_items_payload(&mut state);
    let content = serde_json::to_string(&state).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
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
    } else if lower.contains("mp4") || lower.contains("video/") {
        Some("mp4")
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

    if trimmed.starts_with("data:image/") || trimmed.starts_with("data:video/") {
        let (mime, bytes) = decode_data_url(trimmed)?;
        let ext = image_ext_from_mime(&mime);
        let file_name = format!("{}.{}", cloudflared_ref_stem(index), ext);
        fs::write(dir.join(&file_name), bytes).map_err(|e| e.to_string())?;
        return Ok(file_name);
    }

    let local = local_path_from_url_like(trimmed).unwrap_or_else(|| PathBuf::from(trimmed));
    if !local.is_file() {
        return Err("本地参考需要本地图片、视频或 data URL".to_string());
    }

    let ext = local
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .filter(|value| is_supported_media_ext(value))
        .unwrap_or_else(|| "jpg".to_string());
    let file_name = format!("{}.{}", cloudflared_ref_stem(index), ext);
    fs::copy(local, dir.join(&file_name)).map_err(|e| e.to_string())?;
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

    if trimmed.starts_with("data:image/") || trimmed.starts_with("data:video/") {
        let (mime, bytes) = decode_data_url(trimmed)?;
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
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .filter(|value| is_supported_media_ext(value))
        .unwrap_or_else(|| image_ext_from_mime(&content_type).to_string());
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

#[tauri::command]
async fn create_cloudflared_public_image_urls(
    app_handle: tauri::AppHandle,
    sources: Vec<String>,
    dir: Option<String>,
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

        let mut selected_tunnel: Option<(String, Child, Vec<String>)> = None;
        let mut last_tunnel_error = String::new();
        for attempt in 0..5 {
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
            if urls.iter().all(|url| url.len() <= 64) {
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
                "cloudflared 第 {} 次生成的公网 URL 超过 64 字符，已重试",
                attempt + 1
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
                    "cloudflared 没有生成符合 Xais 64 字符限制的公网 URL".to_string()
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
        let client = build_http_client(Some(&app_handle), None, 180)?;
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

        let client = build_http_client(Some(&app_handle), None, 180)?;
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
        .as_millis();
    let mut out_path = dir.join(format!("{}_{}", stamp, safe_name));

    if input.starts_with("data:") {
        let (mime, bytes) = decode_data_url(input)?;
        let mime_ext = image_ext_from_mime(&mime);
        out_path = replace_media_extension(&out_path, mime_ext);
        fs::write(&out_path, bytes).map_err(|e| e.to_string())?;
        return Ok(out_path.to_string_lossy().to_string());
    }

    if input.starts_with("http://") || input.starts_with("https://") {
        let content_type =
            match download_url_to_file(&app_handle, input, &out_path, proxy.as_deref()) {
                Ok(value) => value,
                Err(err) => {
                    let _ = fs::remove_file(&out_path);
                    return Err(format!("缓存网页图片失败：{}", err));
                }
            };
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
        return Ok(out_path.to_string_lossy().to_string());
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

fn cmf_palette_for_name(name: &str) -> serde_json::Value {
    let palettes = [
        serde_json::json!({
            "colors": ["#e7dfd2", "#b8aea1", "#6f6a63", "#f0a45a"],
            "keywords": ["暖中性色", "柔和金属", "圆润边缘", "家居科技"],
            "materials": ["哑光铝材", "暖灰 PC/ABS", "柔软橡胶", "织物点缀"]
        }),
        serde_json::json!({
            "colors": ["#ebe7df", "#9aa0a3", "#5e696f", "#1f2528"],
            "keywords": ["半透明", "轻科技", "层次感", "克制"],
            "materials": ["烟灰透明 PC", "雾银喷涂", "黑色 TPU 密封件", "半透明磨砂纹理"]
        }),
        serde_json::json!({
            "colors": ["#f1eadf", "#c9b8a2", "#8d7d6f", "#4b4038"],
            "keywords": ["安静", "温暖", "触感友好", "家居感"],
            "materials": ["针织声学布", "暖灰磨砂 PC", "咖色橡胶", "细砂纹喷涂"]
        }),
        serde_json::json!({
            "colors": ["#e8ece9", "#aeb8b2", "#65736b", "#23312c"],
            "keywords": ["冷静", "专业", "细节秩序", "耐用"],
            "materials": ["微砂纹喷涂", "雾面金属饰条", "防滑 TPU", "深灰阻燃 PC"]
        }),
    ];

    let index = (hash_u64(name) as usize) % palettes.len();
    palettes[index].clone()
}

fn value_as_string(config: &serde_json::Value, key: &str) -> String {
    config
        .get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string()
}

fn normalize_siliconflow_endpoint(endpoint: &str) -> String {
    let trimmed = endpoint.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return "https://api.siliconflow.cn/v1/chat/completions".to_string();
    }
    if trimmed.ends_with("/chat/completions") {
        trimmed.to_string()
    } else if trimmed.ends_with("/v1") {
        format!("{}/chat/completions", trimmed)
    } else {
        format!("{}/v1/chat/completions", trimmed)
    }
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

    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return Ok(trimmed.to_string());
    }

    let path = local_path_from_url_like(trimmed).unwrap_or_else(|| PathBuf::from(trimmed));
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

fn model_supports_image(model: &str) -> bool {
    is_siliconflow_vision_model_id(model) || {
        let lower = model.to_ascii_lowercase();
        lower.contains("vision")
            || lower.contains("omni")
            || lower.contains("ocr")
            || lower.contains("qvq")
    }
}

fn cmf_system_prompt() -> &'static str {
    "你是一名资深产品 CMF 与造型语言分析师。必须只返回严格 JSON，不要 Markdown，不要解释。除 colors 中的十六进制色值外，所有文本字段必须使用简体中文。必需字段：title:string, colors:string[], keywords:string[], summary:string, form:string, cmf:string, borrow:string[], avoid:string[], materials:string[]。colors 保持 4-6 个十六进制色值；keywords 保持 4-8 个中文短语；summary 保持 20-60 个中文词；borrow/avoid/materials 保持 3-6 条中文短句。"
}

fn cmf_user_text(item_name: &str, note: &str, with_image: bool) -> String {
    format!(
        "请分析这张参考图。名称：{}。备注：{}。{}请只返回 JSON，内容包括：1）主色与辅助色；2）配色、材料和表面处理逻辑；3）造型语言；4）可以借鉴的设计动作；5）不应照搬的风险；6）材料建议。所有描述必须使用简体中文。",
        item_name,
        if note.trim().is_empty() { "无" } else { note.trim() },
        if with_image { "" } else { "当前模型没有图像能力，请根据名称和备注推断。" }
    )
}

fn build_siliconflow_request_body(
    model: &str,
    image_url: &str,
    item_name: &str,
    note: &str,
) -> serde_json::Value {
    let with_image = model_supports_image(model);
    let user_text = cmf_user_text(item_name, note, with_image);

    let user_content = if with_image {
        serde_json::json!([
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
        ])
    } else {
        serde_json::json!(format!("图片来源：{}\n{}", image_url, user_text))
    };

    serde_json::json!({
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": cmf_system_prompt()
            },
            {
                "role": "user",
                "content": user_content
            }
        ],
        "temperature": 0.25,
        "top_p": 0.7,
        "max_tokens": 1200,
        "stream": false
    })
}

fn build_siliconflow_image_search_query_body(
    model: &str,
    image_url: &str,
    hint: &str,
) -> Result<serde_json::Value, String> {
    if !model_supports_image(model) {
        return Err(
            "当前模型看起来不支持图片理解，请在设置里选择硅基流动视觉模型后再按参考图收图"
                .to_string(),
        );
    }

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
    let api_key = api_key.trim().to_string();
    if api_key.is_empty() {
        return Err("请先填写硅基流动 API Key".to_string());
    }

    let base = endpoint.trim().trim_end_matches('/').to_string();
    let url = if base.ends_with("/models") {
        base
    } else {
        format!("{}/models", base)
    };
    tauri::async_runtime::spawn_blocking(move || {
        let raw = http_get_text(&app_handle, &url, &api_key, None)?;
        let parsed: serde_json::Value =
            serde_json::from_str(&raw).map_err(|e| format!("模型列表 JSON 解析失败：{}", e))?;
        let data = parsed
            .get("data")
            .and_then(|value| value.as_array())
            .ok_or_else(|| "模型列表返回格式不正确：缺少 data 数组".to_string())?;

        let mut models: Vec<String> = data
            .iter()
            .filter_map(|item| item.get("id").and_then(|id| id.as_str()))
            .filter(|id| is_siliconflow_vision_model_id(id))
            .map(|id| id.to_string())
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
) -> Result<Vec<String>, String> {
    let api_key = api_key.trim().to_string();
    if api_key.is_empty() {
        return Err("Please enter API Key first.".to_string());
    }

    let base = endpoint.trim().trim_end_matches('/').to_string();
    if base.is_empty() {
        return Err("Please enter API Base URL first.".to_string());
    }

    let url = if base.ends_with("/models") {
        base
    } else {
        format!("{}/models", base)
    };

    tauri::async_runtime::spawn_blocking(move || {
        let raw = http_get_text(&app_handle, &url, &api_key, None)?;
        let parsed: serde_json::Value = serde_json::from_str(&raw)
            .map_err(|e| format!("Model list JSON parse failed: {}; raw response: {}", e, raw))?;
        let data = parsed
            .get("data")
            .and_then(|value| value.as_array())
            .or_else(|| parsed.as_array())
            .ok_or_else(|| "Model list response is missing a data array.".to_string())?;

        let mut models: Vec<String> = data
            .iter()
            .filter_map(|item| {
                item.get("id")
                    .or_else(|| item.get("name"))
                    .and_then(|value| value.as_str())
            })
            .map(|id| id.trim().to_string())
            .filter(|id| !id.is_empty())
            .collect();
        models.sort();
        models.dedup();
        if models.is_empty() {
            Err("No models found in /models response.".to_string())
        } else {
            Ok(models)
        }
    })
    .await
    .map_err(|e| format!("Refresh model list task failed: {}", e))?
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
        .ok_or_else(|| format!("AI response missing message.content: {}", response))
}

fn normalize_ai_result_json(item_name: &str, mut value: serde_json::Value) -> serde_json::Value {
    if !value.is_object() {
        value = serde_json::json!({});
    }

    let palette = cmf_palette_for_name(item_name);
    let colors = value
        .get("colors")
        .and_then(|v| v.as_array())
        .filter(|arr| !arr.is_empty())
        .cloned()
        .unwrap_or_else(|| {
            palette
                .get("colors")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default()
        });
    let keywords = value
        .get("keywords")
        .and_then(|v| v.as_array())
        .filter(|arr| !arr.is_empty())
        .cloned()
        .unwrap_or_else(|| {
            palette
                .get("keywords")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default()
        });
    let materials = value
        .get("materials")
        .and_then(|v| v.as_array())
        .filter(|arr| !arr.is_empty())
        .cloned()
        .unwrap_or_else(|| {
            palette
                .get("materials")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_default()
        });

    let get_str = |key: &str, fallback: &str| {
        value
            .get(key)
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(fallback)
            .to_string()
    };
    let get_arr = |key: &str, fallback: Vec<&str>| {
        value
            .get(key)
            .and_then(|v| v.as_array())
            .filter(|arr| !arr.is_empty())
            .cloned()
            .unwrap_or_else(|| fallback.into_iter().map(|s| serde_json::json!(s)).collect())
    };

    serde_json::json!({
        "title": get_str("title", item_name),
        "colors": colors,
        "keywords": keywords,
        "form": get_str("form", "保留参考图中的整体比例、柔和边缘和可识别的局部细节，同时让产品语言保持简洁并便于量产。"),
        "summary": first_sentence_or_fallback(&get_str("summary", "这张参考图呈现出克制的科技感，可延展为一套产品 CMF 方向。"), "这张参考图呈现出克制的科技感，可延展为一套产品 CMF 方向。"),
        "cmf": get_str("cmf", "围绕主色与辅助色建立 CMF 方向，并结合低光泽、细纹理和适合量产的材料组合。"),
        "borrow": get_arr("borrow", vec!["借鉴主色与强调色的比例关系", "借鉴材料之间的粗细与冷暖对比", "借鉴局部细节作为识别点"]),
        "avoid": get_arr("avoid", vec!["不要直接复制原图轮廓", "高饱和点缀色需要克制使用", "量产前需要验证耐磨和耐刮表现"]),
        "materials": materials,
        "analysisMode": "ai",
        "apiStatus": "siliconflow_ok",
        "generatedAt": now_millis_u128()
    })
}

fn call_siliconflow_cmf(
    app_handle: &tauri::AppHandle,
    endpoint: &str,
    api_key: &str,
    model: &str,
    image_source: &str,
    item_name: &str,
    note: &str,
    explicit_proxy: Option<&str>,
) -> Result<serde_json::Value, String> {
    if api_key.trim().is_empty() {
        return Err("请先填写硅基流动 API Key".to_string());
    }
    if model.trim().is_empty() {
        return Err("请先选择硅基流动模型".to_string());
    }

    let url = normalize_siliconflow_endpoint(endpoint);
    let image_url = image_source_for_ai(image_source)?;
    let body = build_siliconflow_request_body(model, &image_url, item_name, note);
    let raw = http_post_json(app_handle, &url, api_key, &body, explicit_proxy)?;
    let response: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| format!("解析硅基流动响应失败：{}；原始返回：{}", e, raw))?;
    let content = get_chat_message_content(&response)?;
    let Some(json_text) = extract_json_object_text(&content) else {
        return Err(format!("模型没有返回 JSON：{}", content));
    };
    let parsed: serde_json::Value = serde_json::from_str(&json_text)
        .map_err(|e| format!("解析模型 JSON 失败：{}；内容：{}", e, json_text))?;
    Ok(normalize_ai_result_json(item_name, parsed))
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
    let provider = value_as_string(&config, "provider");
    let endpoint = value_as_string(&config, "endpoint");
    let model = value_as_string(&config, "model");
    let api_key = value_as_string(&config, "apiKey");
    let proxy = value_as_string(&config, "proxy");

    if provider != "siliconflow" {
        return Err("请先在设置里配置硅基流动视觉模型，才能按参考图收图".to_string());
    }
    if api_key.trim().is_empty() {
        return Err("请先填写硅基流动 API Key，才能按参考图收图".to_string());
    }
    if model.trim().is_empty() {
        return Err("请先选择硅基流动视觉模型，才能按参考图收图".to_string());
    }
    if !model_supports_image(&model) {
        return Err(
            "当前模型看起来不支持图片理解，请在设置里选择硅基流动视觉模型后再按参考图收图"
                .to_string(),
        );
    }

    let url = normalize_siliconflow_endpoint(if endpoint.is_empty() {
        "https://api.siliconflow.cn/v1"
    } else {
        &endpoint
    });
    let image_url = image_source_for_ai(&image_source)?;
    let body = build_siliconflow_image_search_query_body(
        &model,
        &image_url,
        hint.as_deref().unwrap_or(""),
    )?;
    let raw = http_post_json(
        &app_handle,
        &url,
        &api_key,
        &body,
        if proxy.trim().is_empty() {
            None
        } else {
            Some(proxy.as_str())
        },
    )?;
    let response: serde_json::Value = serde_json::from_str(&raw)
        .map_err(|e| format!("解析硅基流动响应失败：{}；原始返回：{}", e, raw))?;
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

#[tauri::command]
async fn analyze_cmf_card(
    app_handle: tauri::AppHandle,
    image_source: String,
    item_name: String,
    note: Option<String>,
    api_config: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        analyze_cmf_card_impl(app_handle, image_source, item_name, note, api_config)
    })
    .await
    .map_err(|e| e.to_string())?
}

fn analyze_cmf_card_impl(
    app_handle: tauri::AppHandle,
    image_source: String,
    item_name: String,
    note: Option<String>,
    api_config: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let config = api_config.unwrap_or_else(|| serde_json::json!({}));
    let endpoint = value_as_string(&config, "endpoint");
    let model = value_as_string(&config, "model");
    let provider = value_as_string(&config, "provider");
    let api_key = value_as_string(&config, "apiKey");
    let proxy = value_as_string(&config, "proxy");
    let provider = if provider.is_empty() {
        "openai-compatible".to_string()
    } else {
        provider
    };
    let note_text = note.unwrap_or_default();

    if provider == "siliconflow" {
        return call_siliconflow_cmf(
            &app_handle,
            if endpoint.is_empty() {
                "https://api.siliconflow.cn/v1"
            } else {
                &endpoint
            },
            &api_key,
            if model.is_empty() {
                "Qwen/Qwen3-VL-32B-Instruct"
            } else {
                &model
            },
            &image_source,
            &item_name,
            &note_text,
            if proxy.trim().is_empty() {
                None
            } else {
                Some(proxy.as_str())
            },
        );
    }

    let palette = cmf_palette_for_name(&item_name);
    let colors = palette
        .get("colors")
        .cloned()
        .unwrap_or_else(|| serde_json::json!([]));
    let keywords = palette
        .get("keywords")
        .cloned()
        .unwrap_or_else(|| serde_json::json!([]));

    if endpoint.is_empty() {
        return Ok(serde_json::json!({
            "title": item_name,
            "colors": colors,
            "keywords": keywords,
            "summary": "当前没有配置 AI 接口，此结果仅提供基于色板的本地分析结构。",
            "form": "",
            "cmf": "当前没有配置 AI 接口，可先将本地提取的色板作为初步 CMF 方向。",
            "borrow": [],
            "avoid": [],
            "materials": [],
            "analysisMode": "palette",
            "apiStatus": "no_ai_palette_only",
            "provider": provider,
            "endpoint": endpoint,
            "source": image_source,
            "generatedAt": now_millis_u128()
        }));
    }

    let materials = palette
        .get("materials")
        .cloned()
        .unwrap_or_else(|| serde_json::json!([]));

    Ok(serde_json::json!({
        "title": item_name,
        "colors": colors,
        "keywords": keywords,
        "summary": "这张参考图呈现出克制的科技感，可继续延展为产品 CMF 方向。",
        "form": format!("将「{}」作为克制的造型参考：大面保持简洁，边缘处理柔和，并让局部细节形成记忆点。{}", item_name, if note_text.trim().is_empty() { "".to_string() } else { format!(" 备注：{}", note_text.trim()) }),
        "cmf": format!("基于当前参考建立 CMF 方向：控制色彩饱和度，结合哑光表面、细腻纹理和适合量产的材料组合。{}", if model.is_empty() { "".to_string() } else { format!(" 已保留模型配置：{}。", model) }),
        "borrow": ["借鉴主色与强调色的比例关系", "借鉴材料之间的对比关系", "借鉴局部细节作为识别点"],
        "avoid": ["不要直接复制原图造型", "高饱和点缀色需要克制使用", "量产前需要验证耐用性和耐刮表现"],
        "materials": materials,
        "analysisMode": "ai",
        "apiStatus": "reserved_mock",
        "provider": provider,
        "endpoint": endpoint,
        "source": image_source,
        "generatedAt": now_millis_u128()
    }))
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
    let _ = window.set_always_on_top(true);
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
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
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

fn first_sentence_or_fallback(value: &str, fallback: &str) -> String {
    let clean = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let source = if clean.trim().is_empty() {
        fallback
    } else {
        clean.trim()
    };
    for (idx, ch) in source.char_indices() {
        if matches!(ch, '.' | '!' | '?') {
            return source[..idx + ch.len_utf8()].trim().to_string();
        }
    }
    source.trim().to_string()
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
        || lower.ends_with(".png")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".gif")
        || lower.ends_with(".webp")
        || lower.contains("image")
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
            }
            return Some(PathBuf::from(decoded));
        }
    }

    None
}

fn write_data_image_to_temp(data_url: &str) -> Result<PathBuf, String> {
    let comma_index = data_url
        .find(',')
        .ok_or_else(|| "invalid data url".to_string())?;
    let encoded = &data_url[(comma_index + 1)..];

    use base64::{engine::general_purpose, Engine as _};
    let bytes = general_purpose::STANDARD
        .decode(encoded)
        .map_err(|e| e.to_string())?;

    let meta = data_url[..comma_index].to_lowercase();
    let ext = if meta.contains("image/jpeg") || meta.contains("image/jpg") {
        "jpg"
    } else if meta.contains("image/bmp") {
        "bmp"
    } else if meta.contains("image/gif") {
        "gif"
    } else {
        "png"
    };

    let file_name = format!(
        "drawer_clip_{}.{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_millis(),
        ext
    );
    let out_path = std::env::temp_dir().join(file_name);
    fs::write(&out_path, bytes).map_err(|e| e.to_string())?;
    Ok(out_path)
}

#[cfg(target_os = "windows")]
fn set_clipboard_image_from_file(path: &str) -> Result<(), String> {
    let script = r#"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$path = $args[0]
$last = $null
for ($i = 0; $i -lt 12; $i++) {
  try {
    $img = [System.Drawing.Image]::FromFile($path)
    $bmp = New-Object System.Drawing.Bitmap($img)
    $img.Dispose()
    [System.Windows.Forms.Clipboard]::SetDataObject($bmp, $true)
    Start-Sleep -Milliseconds 120
    $bmp.Dispose()
    exit 0
  } catch {
    $last = $_
    Start-Sleep -Milliseconds 90
  }
}
throw $last
"#;
    let mut ps_cmd = SysCommand::new("powershell.exe");
    hide_console_window(&mut ps_cmd);
    let output = ps_cmd
        .args([
            "-NoProfile",
            "-STA",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
            path,
        ])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[cfg(target_os = "windows")]
fn set_clipboard_image_from_url(url: &str) -> Result<(), String> {
    let script = r#"
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls11 -bor [System.Net.SecurityProtocolType]::Tls
$uri = $args[0]
$wc = New-Object System.Net.WebClient
$wc.Headers.Add('User-Agent', 'inspiration-drawer')
$bytes = $wc.DownloadData($uri)
$ms = New-Object System.IO.MemoryStream(,$bytes)
$img = [System.Drawing.Image]::FromStream($ms)
$bmp = New-Object System.Drawing.Bitmap($img)
$img.Dispose()
$ms.Dispose()
$wc.Dispose()
$last = $null
for ($i = 0; $i -lt 12; $i++) {
  try {
    [System.Windows.Forms.Clipboard]::SetDataObject($bmp, $true)
    Start-Sleep -Milliseconds 120
    $bmp.Dispose()
    exit 0
  } catch {
    $last = $_
    Start-Sleep -Milliseconds 90
  }
}
$bmp.Dispose()
throw $last
"#;
    let mut ps_cmd = SysCommand::new("powershell.exe");
    hide_console_window(&mut ps_cmd);
    let output = ps_cmd
        .args([
            "-NoProfile",
            "-STA",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
            url,
        ])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
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
            let temp_path = write_data_image_to_temp(input)?;
            let result = set_clipboard_image_from_file(&temp_path.to_string_lossy());
            let _ = fs::remove_file(temp_path);
            return result;
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
        let _ = main.set_always_on_top(true);
    }

    let app_for_capture = app_handle.clone();
    let capture_result = tauri::async_runtime::spawn_blocking(move || {
        capture_physical_area_to_bmp_file(
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

fn capture_physical_area_to_bmp_file(
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
    let file_name = format!(
        "drawer_snip_area_{}.bmp",
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
    let mut writer = BufWriter::new(file);
    let encoder = screenshots::image::codecs::bmp::BmpEncoder::new(&mut writer);
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
const DRAWER_MIN_WIDTH: f64 = 360.0;
const DRAWER_MIN_HEIGHT: f64 = 220.0;
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
    if is_anti_touch_locked() {
        if let Some(edge) = app_handle.get_webview_window("edge") {
            let _ = edge.hide();
        }
        return Ok(());
    }

    if is_float_mode(mode.as_deref()) {
        position_float_edge(app_handle, x, y)
    } else {
        position_side_edge(app_handle, height, y)
    }
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
        let _ = main.set_always_on_top(true);
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
            let _ = main.set_always_on_top(true);
            let _ = main.show();
            let _ = main.emit("drawer-opened", ());
        }
    } else {
        show_edge(app_handle.clone(), height, mode, None, None)?;
    }

    if let Some(main) = app_handle.get_webview_window("main") {
        let _ = main.set_always_on_top(true);
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
    main.set_always_on_top(true).ok();
    main.show().map_err(|e| e.to_string())?;
    let _ = main.emit("drawer-opened", ());

    // 抽屉打开期间隐藏 edge，避免移动主体时经过触发器又重新展开。
    if let Some(edge_window) = edge {
        let _ = edge_window.hide();
    }

    Ok(())
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
        main.set_always_on_top(true).ok();
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

        if is_anti_touch_locked()
            || window_is_visible(&app, "main")
            || window_is_visible(&app, "edge")
        {
            return;
        }

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
            get_local_vision_model_status,
            install_ollama_silent,
            ensure_ollama_vision_model,
            get_rife_engine_status,
            install_rife_engine,
            get_rife_frame_interpolation_estimate,
            run_rife_frame_interpolation,
            get_realesrgan_engine_status,
            install_realesrgan_engine,
            get_realesrgan_enhancement_estimate,
            run_realesrgan_image_enhancement,
            run_realesrgan_video_enhancement,
            get_network_proxy,
            set_network_proxy,
            get_siliconflow_vision_models,
            get_openai_compatible_models,
            get_ai_json,
            post_ai_json,
            post_ai_text,
            post_ai_image_edit,
            get_ai_text,
            create_cloudflared_public_image_urls,
            stop_cloudflared_share,
            create_tmpfiles_public_image_urls,
            create_litterbox_public_image_urls,
            create_r2_public_image_urls,
            delete_r2_public_image_urls,
            collect_web_images,
            cache_web_image,
            cache_web_image_to_dir,
            relocate_web_cache_file,
            describe_image_for_search_local_vlm,
            describe_image_for_search,
            analyze_cmf_card,
            sys_update_bounds,
            set_topmost,
            sys_drag_window,
            snap_to_right,
            toggle_pin,
            get_local_ip,
            get_mobile_pair_url,
            open_file,
            get_video_thumb,
            path_kind,
            delete_local_file,
            show_in_folder,
            copy_local_file,
            cache_local_file_to_dir,
            save_item_source_as,
            save_dropped_file,
            commands::license::get_machine_id,
            commands::license::get_license_status,
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
            get_auto_start,
            set_auto_start,
            copy_image,
            start_file_drag,
            copy_files_to_clipboard,
            set_startup_close_lock,
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
            set_startup_close_lock(16_000);

            if let Some(main) = app.get_webview_window("main") {
                let _ = main.set_shadow(false);
                let _ = main.set_always_on_top(true);
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
