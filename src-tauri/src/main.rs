// src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod native_drop;

use std::collections::{HashMap, hash_map::DefaultHasher};
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Command as SysCommand, Stdio};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, LogicalPosition, LogicalSize, Manager, WebviewWindow};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(target_os = "windows")]
fn hide_console_window(cmd: &mut SysCommand) -> &mut SysCommand {
    cmd.creation_flags(CREATE_NO_WINDOW)
}

#[cfg(not(target_os = "windows"))]
fn hide_console_window(cmd: &mut SysCommand) -> &mut SysCommand {
    cmd
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
            .or_else(|| socks_value.map(|v| if v.contains("://") { v } else { format!("socks5h://{}", v) }))
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
        let subkey = auto_start_wide_null(r"Software\Microsoft\Windows\CurrentVersion\Internet Settings");
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
    fs::read_to_string(path).unwrap_or_default().trim().to_string()
}

#[tauri::command]
fn get_network_proxy(_app_handle: tauri::AppHandle) -> Result<String, String> {
    Ok(String::new())
}

#[tauri::command]
fn set_network_proxy(_app_handle: tauri::AppHandle, _proxy: String) -> Result<String, String> {
    Ok(String::new())
}

fn effective_proxy(_app_handle: Option<&tauri::AppHandle>, _explicit_proxy: Option<&str>) -> Option<String> {
    // 不再使用手动填写的代理；只自动读取系统代理或环境变量，避免旧配置继续影响网络请求。
    windows_system_proxy().or_else(env_proxy)
}

fn apply_curl_network_options(cmd: &mut SysCommand, proxy: Option<&str>) {
    hide_console_window(cmd);
    if let Some(proxy) = proxy.and_then(normalize_proxy_endpoint) {
        cmd.arg("--proxy").arg(proxy);
    }
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
fn show_in_folder(path: String) -> Result<(), String> {
    let normalized = local_path_from_url_like(&path).unwrap_or_else(|| PathBuf::from(&path));

    if !normalized.exists() {
        return Err(format!("文件位置不存在：{}", normalized.to_string_lossy()));
    }

    let resolved = fs::canonicalize(&normalized).unwrap_or_else(|_| normalized.clone());

    // /select 在部分 Windows 环境下会被 Explorer 解析失败，失败时它会退回打开“文档”或“桌面”。
    // 稳定优先：文件打开它的真实父目录；文件夹打开它本身。
    let target_dir = if resolved.is_dir() {
        resolved.clone()
    } else {
        resolved
            .parent()
            .ok_or_else(|| "无法获取文件所在目录".to_string())?
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
        return Ok(source_canon.to_string_lossy().to_string());
    }

    let file_name = source_canon
        .file_name()
        .and_then(|value| value.to_str())
        .map(|value| sanitize_file_name(value))
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| format!("local_file_{}", now_millis_u128()));

    let mut target = target_dir.join(format!("{}_{}", now_millis_u128(), file_name));
    if target.exists() {
        let stem = target
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("local_file")
            .to_string();
        let ext = target
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| format!(".{}", value))
            .unwrap_or_default();
        target = target_dir.join(format!("{}_{}{}", stem, now_millis_u128(), ext));
    }

    fs::copy(&source_canon, &target).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}

#[tauri::command]
fn save_item_source_as(
    app_handle: tauri::AppHandle,
    source: String,
    dest: String,
    content: Option<String>,
    item_type: Option<String>,
) -> Result<(), String> {
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
        fs::copy(local, dest_path).map(|_| ()).map_err(|e| e.to_string())?;
        return Ok(());
    }

    if input.starts_with("http://") || input.starts_with("https://") {
        let effective_proxy = effective_proxy(Some(&app_handle), None);
        let mut curl_cmd = SysCommand::new("curl");
        apply_curl_network_options(&mut curl_cmd, effective_proxy.as_deref());
        let status = curl_cmd
            .arg("-L")
            .arg("--fail")
            .arg("--connect-timeout")
            .arg("10")
            .arg("--max-time")
            .arg("90")
            .arg("-A")
            .arg("Mozilla/5.0")
            .arg("-o")
            .arg(&dest_path)
            .arg(input)
            .status()
            .map_err(|e| format!("调用 curl 下载失败：{}", e))?;
        if status.success() {
            return Ok(());
        }
        return Err(format!("下载失败，curl 退出码：{:?}", status.code()));
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

#[tauri::command]
fn load_items(app_handle: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = get_user_data_dir(&app_handle).join("drawer_items.json");
    if path.exists() {
        let content = fs::read_to_string(path).unwrap_or_else(|_| "[]".to_string());
        serde_json::from_str(&content).map_err(|e| e.to_string())
    } else {
        Ok(serde_json::json!([]))
    }
}

#[tauri::command]
fn save_items(app_handle: tauri::AppHandle, items: serde_json::Value) -> Result<(), String> {
    let path = get_user_data_dir(&app_handle).join("drawer_items.json");
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
    fs::write(web_image_cache_config_path(&app_handle), saved_dir.to_string_lossy().as_bytes())
        .map_err(|e| e.to_string())?;

    Ok(saved_dir.to_string_lossy().to_string())
}

fn image_ext_from_name_or_url(value: &str) -> Option<String> {
    let clean = value.split(['?', '#']).next().unwrap_or(value);
    let name = clean.split(['/', '\\']).filter(|part| !part.is_empty()).last().unwrap_or(clean);
    let ext = name.rsplit_once('.').map(|(_, ext)| ext.to_ascii_lowercase())?;
    let ext = ext.trim().trim_matches('.');
    if matches!(ext, "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg") {
        Some(ext.to_string())
    } else {
        None
    }
}

fn image_ext_from_mime(mime: &str) -> &'static str {
    let lower = mime.to_ascii_lowercase();
    if lower.contains("jpeg") || lower.contains("jpg") {
        "jpg"
    } else if lower.contains("gif") {
        "gif"
    } else if lower.contains("webp") {
        "webp"
    } else if lower.contains("bmp") {
        "bmp"
    } else if lower.contains("svg") {
        "svg"
    } else {
        "png"
    }
}

#[tauri::command]
async fn cache_web_image(
    app_handle: tauri::AppHandle,
    url: String,
    name: Option<String>,
    cache_dir: Option<String>,
    proxy: Option<String>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        cache_web_image_impl(app_handle, url, name, cache_dir, proxy)
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
    // 专门给“设置里的网页图片缓存路径”使用。参数名保持简单的 dir，
    // 避开 cache_dir / cacheDir 在 Tauri 参数映射里的歧义。
    tauri::async_runtime::spawn_blocking(move || {
        cache_web_image_impl(app_handle, url, name, Some(dir), proxy)
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
    // 这样可避免拖拽监听器/配置文件不同步时继续写入默认缓存目录。
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
        let comma = input.find(',').ok_or_else(|| "invalid data url".to_string())?;
        image_ext_from_mime(&input[..comma]).to_string()
    } else {
        image_ext_from_name_or_url(input).unwrap_or_else(|| "png".to_string())
    };

    if image_ext_from_name_or_url(&safe_name).is_none() {
        safe_name = format!("{}.{}", safe_name, ext);
    }

    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let out_path = dir.join(format!("{}_{}", stamp, safe_name));

    if input.starts_with("data:") {
        let (_mime, bytes) = decode_data_url(input)?;
        fs::write(&out_path, bytes).map_err(|e| e.to_string())?;
        return Ok(out_path.to_string_lossy().to_string());
    }

    if input.starts_with("http://") || input.starts_with("https://") {
        let effective_proxy = effective_proxy(Some(&app_handle), proxy.as_deref());
        let mut curl_cmd = SysCommand::new("curl");
        apply_curl_network_options(&mut curl_cmd, effective_proxy.as_deref());
        let status = curl_cmd
            .arg("-L")
            .arg("--fail")
            .arg("--connect-timeout")
            .arg("10")
            .arg("--max-time")
            .arg("90")
            .arg("-A")
            .arg("Mozilla/5.0")
            .arg("-o")
            .arg(&out_path)
            .arg(input)
            .status()
            .map_err(|e| format!("调用 curl 缓存网页图片失败：{}", e))?;

        if status.success() {
            return Ok(out_path.to_string_lossy().to_string());
        }

        let _ = fs::remove_file(&out_path);
        return Err(format!("缓存网页图片失败，curl 退出码：{:?}", status.code()));
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
    if !matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg") {
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

    // 只迁移 App 自己生成/接管的网页临时图片，不碰用户真实本地文件。
    // 某些 Windows OLE/browser 拖拽链路不会给 URL，而是先把网页图保存到 App 默认目录，
    // 然后只把这个临时 path 发给前端。这里把这种临时文件搬到用户设置的缓存目录。
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
fn save_ai_analysis_config(app_handle: tauri::AppHandle, config: serde_json::Value) -> Result<(), String> {
    let path = get_user_data_dir(&app_handle).join("ai_analysis_config.json");
    let content = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}

fn cmf_palette_for_name(name: &str) -> serde_json::Value {
    let palettes = [
        serde_json::json!({
            "colors": ["#e7dfd2", "#b8aea1", "#6f6a63", "#f0a45a"],
            "keywords": ["低饱和", "暖灰金属", "柔和倒角", "家居科技"],
            "materials": ["喷砂阳极氧化铝", "低光泽 PC/ABS", "细织物网布", "硅胶脚垫"]
        }),
        serde_json::json!({
            "colors": ["#ebe7df", "#9aa0a3", "#5e696f", "#1f2528"],
            "keywords": ["半透明", "轻科技", "层次感", "克制"],
            "materials": ["烟灰透明 PC", "雾面银喷涂件", "黑色 TPU 密封圈", "半透磨砂纹理"]
        }),
        serde_json::json!({
            "colors": ["#f1eadf", "#c9b8a2", "#8d7d6f", "#4b4038"],
            "keywords": ["温暖", "织物", "弱科技感", "亲和"],
            "materials": ["针织声学布", "暖灰磨砂 PC", "咖色橡胶", "微纹理喷涂"]
        }),
        serde_json::json!({
            "colors": ["#e8ece9", "#aeb8b2", "#65736b", "#23312c"],
            "keywords": ["冷静", "专业", "细节秩序", "耐用感"],
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
    match path.extension().and_then(|v| v.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        _ => "image/png",
    }
}

fn image_source_for_ai(input: &str) -> Result<String, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("empty image source".to_string());
    }

    if trimmed.starts_with("data:image/") || trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return Ok(trimmed.to_string());
    }

    let path = local_path_from_url_like(trimmed).unwrap_or_else(|| PathBuf::from(trimmed));
    if path.exists() && path.is_file() {
        let bytes = fs::read(&path).map_err(|e| e.to_string())?;
        use base64::{engine::general_purpose, Engine as _};
        let b64 = general_purpose::STANDARD.encode(bytes);
        let mime = guess_mime_from_path(&path);
        return Ok(format!("data:{};base64,{}", mime, b64));
    }

    // 如果传进来的是无法解析的 asset/url，就原样交给模型；前端失败时会降级到本地色板。
    Ok(trimmed.to_string())
}

fn model_supports_image(model: &str) -> bool {
    is_siliconflow_vision_model_id(model)
        || {
            let lower = model.to_ascii_lowercase();
            lower.contains("vision") || lower.contains("omni") || lower.contains("ocr") || lower.contains("qvq")
        }
}

fn cmf_system_prompt() -> &'static str {
    "你是工业设计 CMF 分析助手。只输出严格 JSON，不要 Markdown，不要代码块。字段必须是：title:string, colors:string[], keywords:string[], summary:string, form:string, cmf:string, borrow:string[], avoid:string[], materials:string[]。colors 必须是 4 到 6 个十六进制色值；keywords 4 到 8 个中文设计风格短标签，例如极简主义、科技感、家居感、轻盈感；summary 必须是 AI 分析介绍的第一句话，建议 20 到 60 个中文字符，以句号结尾；borrow/avoid/materials 每项 3 到 6 条。请基于参考图做工业设计、消费电子、家居产品方向的 CMF / 造型 / 材料 / 借鉴判断，不要编造品牌，不要照搬原图造型。"
}

fn cmf_user_text(item_name: &str, note: &str, with_image: bool) -> String {
    format!(
        "请分析这张参考图，名称：{}。备注：{}。{}请输出可直接用于灵感抽屉的 CMF 炼金卡 JSON：1) 主色板；2) 配色/材质 CMF 方向；3) 造型语言；4) 可借鉴判断；5) 不适合照搬；6) 材料建议。",
        item_name,
        if note.trim().is_empty() { "无" } else { note.trim() },
        if with_image { "" } else { "当前模型可能无法看图，请主要根据名称和备注给出保守分析；" }
    )
}

fn build_siliconflow_request_body(model: &str, image_url: &str, item_name: &str, note: &str) -> serde_json::Value {
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

fn run_curl_get_json(url: &str, api_key: &str, proxy: Option<&str>) -> Result<String, String> {
    let auth_header = format!("Authorization: Bearer {}", api_key);
    let mut curl_cmd = SysCommand::new("curl");
    apply_curl_network_options(&mut curl_cmd, proxy);
    let output = curl_cmd
        .arg("-sS")
        .arg("--connect-timeout")
        .arg("20")
        .arg("--max-time")
        .arg("90")
        .arg("-H")
        .arg("accept: application/json")
        .arg("-H")
        .arg(auth_header)
        .arg(url)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("调用 curl 获取模型列表失败：{}", e))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(format!("模型列表请求失败：{} {}", stdout, stderr).trim().to_string())
    }
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
    let proxy = effective_proxy(Some(&app_handle), None);

    tauri::async_runtime::spawn_blocking(move || {
        let raw = run_curl_get_json(&url, &api_key, proxy.as_deref())?;
        let parsed: serde_json::Value = serde_json::from_str(&raw)
            .map_err(|e| format!("模型列表 JSON 解析失败：{}", e))?;
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

fn run_curl_post_json(url: &str, api_key: &str, body: &serde_json::Value, proxy: Option<&str>) -> Result<String, String> {
    let body_text = serde_json::to_string(body).map_err(|e| e.to_string())?;
    let auth_header = format!("Authorization: Bearer {}", api_key);
    let mut curl_cmd = SysCommand::new("curl");
    apply_curl_network_options(&mut curl_cmd, proxy);
    let mut child = curl_cmd
        .arg("-sS")
        .arg("--connect-timeout")
        .arg("20")
        .arg("--max-time")
        .arg("120")
        .arg("-X")
        .arg("POST")
        .arg(url)
        .arg("-H")
        .arg("Content-Type: application/json")
        .arg("-H")
        .arg(auth_header)
        .arg("--data-binary")
        .arg("@-")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("调用 curl 失败：{}。请确认系统可执行 curl，或先使用本地配色分析。", e))?;

    if let Some(stdin) = child.stdin.as_mut() {
        stdin.write_all(body_text.as_bytes()).map_err(|e| e.to_string())?;
    }

    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stdout.is_empty() {
            stderr
        } else if stderr.is_empty() {
            stdout
        } else {
            format!("{}\n{}", stdout, stderr)
        })
    }
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
        .ok_or_else(|| format!("AI 返回结构中没有 message.content：{}", response))
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
        .unwrap_or_else(|| palette.get("colors").and_then(|v| v.as_array()).cloned().unwrap_or_default());
    let keywords = value
        .get("keywords")
        .and_then(|v| v.as_array())
        .filter(|arr| !arr.is_empty())
        .cloned()
        .unwrap_or_else(|| palette.get("keywords").and_then(|v| v.as_array()).cloned().unwrap_or_default());
    let materials = value
        .get("materials")
        .and_then(|v| v.as_array())
        .filter(|arr| !arr.is_empty())
        .cloned()
        .unwrap_or_else(|| palette.get("materials").and_then(|v| v.as_array()).cloned().unwrap_or_default());

    let get_str = |key: &str, fallback: &str| {
        value.get(key).and_then(|v| v.as_str()).filter(|s| !s.trim().is_empty()).unwrap_or(fallback).to_string()
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
        "form": get_str("form", "保留参考图的大面关系、体量比例和关键识别细节，避免直接照搬轮廓。"),
        "summary": first_sentence_or_fallback(&get_str("summary", "整体呈现克制的科技感，适合做产品 CMF 方向延展。"), "整体呈现克制的科技感，适合做产品 CMF 方向延展。"),
        "cmf": get_str("cmf", "基于参考图生成 CMF 方向：提取主色与辅助色比例，并结合低光泽、微纹理和可量产材料做产品化表达。"),
        "borrow": get_arr("borrow", vec!["借鉴主色和辅色比例", "借鉴材质对比关系", "借鉴局部细节作为识别点"]),
        "avoid": get_arr("avoid", vec!["不要直接复制原图造型", "高饱和点缀色需要克制", "量产前需评估耐脏和耐刮"]),
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
    let proxy = effective_proxy(Some(app_handle), explicit_proxy);
    let raw = run_curl_post_json(&url, api_key, &body, proxy.as_deref())?;
    let response: serde_json::Value = serde_json::from_str(&raw).map_err(|e| format!("解析硅基流动响应失败：{}；原始返回：{}", e, raw))?;
    let content = get_chat_message_content(&response)?;
    let Some(json_text) = extract_json_object_text(&content) else {
        return Err(format!("模型没有返回 JSON：{}", content));
    };
    let parsed: serde_json::Value = serde_json::from_str(&json_text).map_err(|e| format!("解析模型 JSON 失败：{}；内容：{}", e, json_text))?;
    Ok(normalize_ai_result_json(item_name, parsed))
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
    let provider = if provider.is_empty() { "openai-compatible".to_string() } else { provider };
    let note_text = note.unwrap_or_default();

    if provider == "siliconflow" {
        return call_siliconflow_cmf(
            &app_handle,
            if endpoint.is_empty() { "https://api.siliconflow.cn/v1" } else { &endpoint },
            &api_key,
            if model.is_empty() { "Qwen/Qwen3-VL-32B-Instruct" } else { &model },
            &image_source,
            &item_name,
            &note_text,
            if proxy.trim().is_empty() { None } else { Some(proxy.as_str()) },
        );
    }

    // 这里保留给其他 AI 分析软件的稳定后端入口。
    // endpoint 为空时，前端会优先走本地 Canvas 配色算法；如果仍调用到这里，
    // 也只返回“配色分析”结构，不伪造造型/材料/借鉴判断。
    // endpoint 不为空时，后续可在此处把 image_source / item_name / note / config 组装成对应 HTTP 请求，
    // 并返回同样的 JSON 字段：colors、keywords、form、cmf、borrow、avoid、materials。
    let palette = cmf_palette_for_name(&item_name);
    let colors = palette.get("colors").cloned().unwrap_or_else(|| serde_json::json!([]));
    let keywords = palette.get("keywords").cloned().unwrap_or_else(|| serde_json::json!([]));

    if endpoint.is_empty() {
        return Ok(serde_json::json!({
            "title": item_name,
            "colors": colors,
            "keywords": keywords,
            "summary": "本地配色算法只提取主色板，不生成造型和材料判断。",
            "form": "",
            "cmf": "未配置 AI 接口：这里只返回配色分析结构；前端会优先使用本地像素算法提取真实色板。",
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

    let materials = palette.get("materials").cloned().unwrap_or_else(|| serde_json::json!([]));

    Ok(serde_json::json!({
        "title": item_name,
        "colors": colors,
        "keywords": keywords,
        "summary": "整体呈现克制的科技感，适合做产品 CMF 方向延展。",
        "form": format!("从「{}」中提取到偏克制的体量关系：优先保留大面简洁、边缘柔和、局部细节形成记忆点的造型逻辑。{}", item_name, if note_text.trim().is_empty() { "".to_string() } else { format!(" 备注提示：{}", note_text.trim()) }),
        "cmf": format!("基于当前参考图生成的 CMF 占位分析：主色保持低饱和，材料以雾面、微纹理和可量产的塑胶/金属/织物组合为主。{}", if model.is_empty() { "".to_string() } else { format!("预留模型：{}。", model) }),
        "borrow": ["借鉴主色和辅色的比例关系", "借鉴材质之间的粗细/冷暖对比", "借鉴局部细节作为记忆点，而不是照搬整体造型"],
        "avoid": ["不要直接复制原图轮廓或装饰比例", "高亮点缀色需要克制使用", "若用于量产产品，需要重新评估耐脏、耐刮和装配分件线"],
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
            let work_area_pos = monitor.work_area().position.to_logical::<f64>(factor);
            let work_area_size = monitor.work_area().size.to_logical::<f64>(factor);
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
            let work_area_size: LogicalSize<f64> = monitor.work_area().size.to_logical(factor);
            let work_area_pos: LogicalPosition<f64> =
                monitor.work_area().position.to_logical(factor);

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
    // pinned 只表示"锁定展开/不自动缩回"，不要在这里控制窗口位置。
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

    // 手机端有些实现会对同一个发送动作连续打 /send、/upload 或重试一次。
    // 这里用短时间内容签名去重，避免抽屉里出现两张/两个完全相同的卡片。
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
    format!("mobile-bytes:{}:{}:{:016x}", item_type, bytes.len(), hasher.finish())
}

fn mobile_text_signature(text: &str) -> String {
    let normalized = text.trim();
    format!("mobile-text:{}:{:016x}", normalized.len(), hash_u64(normalized))
}

fn mobile_url_signature(url: &str) -> String {
    let normalized = url.trim();
    format!("mobile-url:{}:{:016x}", normalized.len(), hash_u64(normalized))
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
        let _ = app_handle.emit("mobile-server-ready", get_mobile_pair_url().unwrap_or_default());
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
            let _ = write_mobile_response(&mut stream, "400 Bad Request", "application/json", &format!(r#"{{"ok":false,"error":"{}"}}"#, json_escape(&err)));
            return;
        }
    };

    if request.method.eq_ignore_ascii_case("OPTIONS") {
        let _ = write_mobile_response(&mut stream, "204 No Content", "text/plain", "");
        return;
    }

    let route = request.path.split('?').next().unwrap_or("/").trim_end_matches('/');
    let query = request.path.split_once('?').map(|(_, q)| parse_query(q)).unwrap_or_default();

    let result = if request.method.eq_ignore_ascii_case("GET") {
        handle_mobile_get(route, &query, &app_handle)
    } else if request.method.eq_ignore_ascii_case("POST") || request.method.eq_ignore_ascii_case("PUT") {
        handle_mobile_post(route, &query, &request, &app_handle)
    } else {
        Err(format!("unsupported method: {}", request.method))
    };

    match result {
        Ok(message) => {
            let body = format!(r#"{{"ok":true,"message":"{}"}}"#, json_escape(&message));
            let _ = write_mobile_response(&mut stream, "200 OK", "application/json; charset=utf-8", &body);
        }
        Err(err) => {
            let body = format!(r#"{{"ok":false,"error":"{}"}}"#, json_escape(&err));
            let _ = write_mobile_response(&mut stream, "500 Internal Server Error", "application/json; charset=utf-8", &body);
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
    let request_line = lines.next().ok_or_else(|| "missing request line".to_string())?;
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

    Ok(MobileHttpRequest { method, path, headers, body })
}

fn write_mobile_response(stream: &mut TcpStream, status: &str, content_type: &str, body: &str) -> std::io::Result<()> {
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET,POST,PUT,OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, X-File-Name, X-Requested-With\r\nConnection: close\r\n\r\n{}",
        body.as_bytes().len(),
        body
    );
    stream.write_all(response.as_bytes())
}

fn handle_mobile_get(route: &str, query: &HashMap<String, String>, app_handle: &tauri::AppHandle) -> Result<String, String> {
    let _ = app_handle.emit("mobile-connected", ());

    let text = query
        .get("text")
        .or_else(|| query.get("content"))
        .or_else(|| query.get("message"))
        .cloned()
        .unwrap_or_default();

    if !text.trim().is_empty() {
        if text.trim().starts_with("data:") {
            emit_mobile_data_url(app_handle, &text, query.get("name").or_else(|| query.get("filename")).map(String::as_str))?;
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

fn emit_mobile_data_url(app_handle: &tauri::AppHandle, data_url: &str, fallback_name: Option<&str>) -> Result<(), String> {
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
    for key in ["dataUrl", "data_url", "data", "image", "file", "content", "text", "message"] {
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

    let content_type = request.headers.get("content-type").cloned().unwrap_or_default();
    let lower_content_type = content_type.to_ascii_lowercase();

    if lower_content_type.contains("multipart/form-data") {
        let boundary = extract_boundary(&content_type).ok_or_else(|| "missing multipart boundary".to_string())?;
        let count = handle_mobile_multipart(app_handle, &request.body, &boundary)?;
        return Ok(format!("{} item(s) received", count));
    }

    if lower_content_type.contains("application/json") {
        let value: serde_json::Value = serde_json::from_slice(&request.body).map_err(|e| e.to_string())?;
        let count = handle_mobile_json(app_handle, &value)?;
        return Ok(format!("{} item(s) received", count));
    }

    if lower_content_type.contains("application/x-www-form-urlencoded") {
        let text = String::from_utf8_lossy(&request.body).to_string();
        let fields = parse_query(&text);
        if let Some((_key, data_url)) = first_data_url_field(&fields) {
            let fallback_name = fields.get("name").or_else(|| fields.get("filename")).or_else(|| fields.get("fileName")).map(String::as_str);
            emit_mobile_data_url(app_handle, data_url, fallback_name)?;
            return Ok("file received".to_string());
        }
        if let Some(value) = fields.get("text").or_else(|| fields.get("content")).or_else(|| fields.get("message")) {
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

fn handle_mobile_json(app_handle: &tauri::AppHandle, value: &serde_json::Value) -> Result<usize, String> {
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

    let obj = value.as_object().ok_or_else(|| "json body must be object or array".to_string())?;

    let text = get_json_string(obj, &["text", "content", "message"]);
    let url = get_json_string(obj, &["url", "imageUrl", "image_url", "fileUrl", "file_url"]);
    let name = get_json_string(obj, &["name", "filename", "fileName", "title"]).unwrap_or_else(|| "手机内容".to_string());
    let explicit_type = get_json_string(obj, &["type", "kind"]).unwrap_or_default();
    let mime = get_json_string(obj, &["mime", "mimeType", "contentType"]).unwrap_or_default();
    let data_url = get_json_string(obj, &["dataUrl", "data_url", "data"]);
    let base64_data = get_json_string(obj, &["base64", "base64Data", "fileBase64"]);

    if let Some(data) = data_url.filter(|s| s.starts_with("data:")) {
        let (mime_from_data, bytes) = decode_data_url(&data)?;
        let mime_used = if mime.is_empty() { mime_from_data } else { mime };
        let file_name = if name == "手机内容" { default_mobile_file_name(&mime_used) } else { name };
        let item_type = if explicit_type.is_empty() { guess_mobile_item_type(&mime_used, &file_name) } else { normalize_mobile_item_type(&explicit_type) };
        emit_mobile_bytes(app_handle, &item_type, &file_name, &bytes)?;
        return Ok(1);
    }

    if let Some(b64) = base64_data {
        use base64::{engine::general_purpose, Engine as _};
        let bytes = general_purpose::STANDARD.decode(b64.trim()).map_err(|e| e.to_string())?;
        let file_name = if name == "手机内容" { default_mobile_file_name(&mime) } else { name };
        let item_type = if explicit_type.is_empty() { guess_mobile_item_type(&mime, &file_name) } else { normalize_mobile_item_type(&explicit_type) };
        emit_mobile_bytes(app_handle, &item_type, &file_name, &bytes)?;
        return Ok(1);
    }

    if let Some(url) = url {
        let item_type = if explicit_type.is_empty() { guess_mobile_item_type(&mime, &name) } else { normalize_mobile_item_type(&explicit_type) };
        let item_type = if item_type == "file" && looks_like_image_url(&url) { "image".to_string() } else { item_type };
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
        app_handle.emit("mobile-data-received", payload).map_err(|e| e.to_string())?;
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

fn handle_mobile_multipart(app_handle: &tauri::AppHandle, body: &[u8], boundary: &str) -> Result<usize, String> {
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
        let next = find_subslice(&body[start..], &marker).map(|p| start + p).unwrap_or(body.len());
        let mut part = &body[start..next];
        if part.ends_with(b"\r\n") {
            part = &part[..part.len().saturating_sub(2)];
        }
        cursor = next;

        let Some(header_end) = find_subslice(part, b"\r\n\r\n") else { continue };
        let header_text = String::from_utf8_lossy(&part[..header_end]).to_string();
        let content = &part[header_end + 4..];
        let disposition = header_text
            .lines()
            .find(|line| line.to_ascii_lowercase().starts_with("content-disposition:"))
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
            fields.insert(field_name, String::from_utf8_lossy(content).trim().to_string());
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
        } else if let Some(text) = fields.get("text").or_else(|| fields.get("content")).or_else(|| fields.get("message")) {
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
    app_handle.emit("mobile-data-received", payload).map_err(|e| e.to_string())
}

fn emit_mobile_file_with_signature(app_handle: &tauri::AppHandle, item_type: &str, name: &str, path: &str, signature: &str) -> Result<(), String> {
    let payload = serde_json::json!({
        "type": item_type,
        "content": name,
        "name": name,
        "path": path,
        "mobileSignature": signature,
        "isQuickAccess": false
    });
    app_handle.emit("mobile-data-received", payload).map_err(|e| e.to_string())
}

fn emit_mobile_bytes(app_handle: &tauri::AppHandle, item_type: &str, name: &str, bytes: &[u8]) -> Result<(), String> {
    let signature = mobile_bytes_signature(item_type, bytes);
    if !mobile_should_accept(&signature) {
        return Ok(());
    }

    let path = save_mobile_bytes(app_handle, name, bytes)?;
    emit_mobile_file_with_signature(app_handle, item_type, name, &path, &signature)
}

fn save_mobile_bytes(app_handle: &tauri::AppHandle, name: &str, bytes: &[u8]) -> Result<String, String> {
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
    let comma = data_url.find(',').ok_or_else(|| "invalid data url".to_string())?;
    let meta = &data_url[..comma];
    let encoded = &data_url[comma + 1..];
    let mime = meta.trim_start_matches("data:").split(';').next().unwrap_or("application/octet-stream").to_string();
    use base64::{engine::general_purpose, Engine as _};
    let bytes = general_purpose::STANDARD.decode(encoded).map_err(|e| e.to_string())?;
    Ok((mime, bytes))
}

fn get_json_string(obj: &serde_json::Map<String, serde_json::Value>, keys: &[&str]) -> Option<String> {
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
        part.strip_prefix("boundary=").map(|v| v.trim_matches('"').to_string())
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
    haystack.windows(needle.len()).position(|window| window == needle)
}

fn first_sentence_or_fallback(value: &str, fallback: &str) -> String {
    let clean = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let source = if clean.trim().is_empty() { fallback } else { clean.trim() };
    for (idx, ch) in source.char_indices() {
        if matches!(ch, '。' | '！' | '!' | '？' | '?') {
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
    if mime.starts_with("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].contains(&ext.as_str()) {
        "image".to_string()
    } else if mime.starts_with("video/") || ["mp4", "mov", "avi", "mkv", "webm"].contains(&ext.as_str()) {
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
    format!("手机文件_{}.{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0), ext)
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
    let temp_dir = std::env::temp_dir();
    let file_name = format!(
        "thumb_{}.png",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    );
    let out_path = temp_dir.join(&file_name);

    let status = SysCommand::new("ffmpeg")
        .args([
            "-i",
            &path,
            "-ss",
            "00:00:01.000",
            "-vframes",
            "1",
            "-s",
            "640x360",
            out_path.to_str().unwrap(),
        ])
        .status()
        .map_err(|e| format!("FFmpeg 调用失败: {}", e))?;

    if status.success() {
        let img_bytes = fs::read(&out_path).map_err(|e| e.to_string())?;
        use base64::{engine::general_purpose, Engine as _};
        let b64 = general_purpose::STANDARD.encode(&img_bytes);
        let _ = fs::remove_file(&out_path);
        Ok(format!("data:image/png;base64,{}", b64))
    } else {
        Err("视频截帧失败".into())
    }
}

pub struct SnipState {
    pub pre_snip_bounds:
        std::sync::Mutex<Option<(tauri::PhysicalPosition<i32>, tauri::PhysicalSize<u32>)>>,
}

// 占位函数
#[tauri::command]
fn get_shortcut(_name: String) -> Result<String, String> {
    Ok("".to_string())
}
#[tauri::command]
fn update_shortcut(_name: String, _shortcut: String) -> Result<(), String> {
    Ok(())
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
fn get_auto_start_impl() -> Result<bool, String> {
    use std::ptr::null_mut;
    use winapi::shared::minwindef::DWORD;
    use winapi::shared::winerror::ERROR_SUCCESS;
    use winapi::um::winreg::{RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY_CURRENT_USER};
    use winapi::um::winnt::KEY_READ;

    unsafe {
        let subkey = auto_start_wide_null(AUTO_START_REG_SUBKEY);
        let mut hkey = null_mut();
        let status = RegOpenKeyExW(HKEY_CURRENT_USER, subkey.as_ptr(), 0, KEY_READ, &mut hkey);
        if status != ERROR_SUCCESS as i32 {
            return Ok(false);
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
            return Ok(false);
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
            return Ok(false);
        }

        let end = buffer.iter().position(|c| *c == 0).unwrap_or(buffer.len());
        let value = String::from_utf16_lossy(&buffer[..end]);
        Ok(!value.trim().is_empty())
    }
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
    use winapi::um::winreg::{
        RegCloseKey, RegCreateKeyExW, RegDeleteValueW, RegSetValueExW, HKEY_CURRENT_USER,
    };
    use winapi::um::winnt::{KEY_SET_VALUE, REG_SZ};

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
            return Err(format!("open autostart registry key failed: 0x{:08X}", status as u32));
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
                Err(format!("write autostart registry value failed: 0x{:08X}", status as u32))
            }
        } else {
            let status = RegDeleteValueW(hkey, name.as_ptr());
            // 2 = ERROR_FILE_NOT_FOUND。目标值本来不存在时，也视为已经关闭。
            if status == ERROR_SUCCESS as i32 || status == 2 {
                Ok(())
            } else {
                Err(format!("delete autostart registry value failed: 0x{:08X}", status as u32))
            }
        };

        RegCloseKey(hkey);
        result
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
        }
        return Some(PathBuf::from(path));
    }

    if trimmed.starts_with("file://") {
        let mut path = percent_decode_lossy(trimmed.trim_start_matches("file://"));
        if cfg!(target_os = "windows") {
            path = path.replace('/', "\\");
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
        .args(["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", script, path])
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
$wc.Headers.Add('User-Agent', 'Mozilla/5.0')
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
        .args(["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-Command", script, url])
        .output()
        .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

#[tauri::command]
fn copy_image(data_url: String) -> Result<(), String> {
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
fn capture_screen_area(window: WebviewWindow, x: f64, y: f64, width: f64, height: f64) -> Result<String, String> {
    let saved_path = capture_screen_area_to_file_impl(None, window, x, y, width, height)?;
    let img_bytes = fs::read(&saved_path).map_err(|e| e.to_string())?;
    use base64::{engine::general_purpose, Engine as _};
    let b64 = general_purpose::STANDARD.encode(&img_bytes);
    Ok(format!("data:image/png;base64,{}", b64))
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

    // 先隐藏全屏截图窗口，避免把半透明遮罩和选区框一起截进去。
    window.hide().map_err(|e| e.to_string())?;
    std::thread::sleep(std::time::Duration::from_millis(24));

    let screen = screenshots::Screen::from_point(physical_x, physical_y).map_err(|e| e.to_string())?;
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
    let _ = window.emit("snip-area-captured", ());

    let file_name = format!(
        "drawer_snip_area_{}.png",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_millis()
    );
    let out_dir = if let Some(app) = app_handle.as_ref() {
        get_user_data_dir(app).join("screenshots")
    } else {
        std::env::temp_dir()
    };
    fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;
    let out_path = out_dir.join(file_name);
    image.save(&out_path).map_err(|e| e.to_string())?;

    Ok(out_path.to_string_lossy().to_string())
}



const EDGE_WINDOW_WIDTH: f64 = 20.0;
const EDGE_STRIP_HEIGHT: f64 = 96.0;
const FLOAT_TRIGGER_SIZE: f64 = 56.0;
const FLOAT_MARGIN: f64 = 12.0;
const DRAWER_MIN_WIDTH: f64 = 240.0;
const DRAWER_MIN_HEIGHT: f64 = 220.0;
const DRAWER_EDGE_MARGIN: f64 = 12.0;
static EDGE_STRIP_Y: OnceLock<Mutex<Option<f64>>> = OnceLock::new();

fn window_work_area(window: &WebviewWindow) -> Result<(LogicalPosition<f64>, LogicalSize<f64>, f64), String> {
    let factor = window.scale_factor().map_err(|e| e.to_string())?;
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "no monitor".to_string())?;
    let pos = monitor.work_area().position.to_logical::<f64>(factor);
    let size = monitor.work_area().size.to_logical::<f64>(factor);
    Ok((pos, size, factor))
}

fn clamp_f64(value: f64, min: f64, max: f64) -> f64 {
    value.max(min).min(max)
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

fn position_side_edge(app_handle: tauri::AppHandle, height: f64, y: Option<f64>) -> Result<(), String> {
    let edge = app_handle
        .get_webview_window("edge")
        .ok_or_else(|| "edge window not found".to_string())?;

    let (work_pos, work_size, _) = window_work_area(&edge)?;
    let edge_x = work_pos.x + work_size.width - EDGE_WINDOW_WIDTH;
    let edge_h = EDGE_STRIP_HEIGHT.min(work_size.height.max(1.0));
    let default_y = work_pos.y + ((work_size.height - edge_h) / 2.0).max(0.0);
    let max_y = work_pos.y + work_size.height - edge_h;
    let raw_y = y.or_else(get_saved_edge_strip_y).unwrap_or(default_y);
    let edge_y = clamp_f64(raw_y, work_pos.y, max_y.max(work_pos.y));
    set_saved_edge_strip_y(edge_y);

    // 侧边小条模式：系统窗口本身只保留可见小条的命中区。
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

    let (work_pos, work_size, factor) = window_work_area(&edge)?;
    let current_pos = edge
        .outer_position()
        .ok()
        .map(|pos| pos.to_logical::<f64>(factor));

    let default_x = work_pos.x + work_size.width - FLOAT_TRIGGER_SIZE - 24.0;
    let default_y = work_pos.y + work_size.height * 0.38;
    let raw_x = x.or_else(|| current_pos.map(|p| p.x)).unwrap_or(default_x);
    let raw_y = y.or_else(|| current_pos.map(|p| p.y)).unwrap_or(default_y);
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
fn open_drawer(
    app_handle: tauri::AppHandle,
    width: f64,
    height: f64,
    mode: Option<String>,
) -> Result<(), String> {
    let main = app_handle
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let edge = app_handle.get_webview_window("edge");

    let (work_pos, work_size, factor) = if let Some(edge_window) = edge.as_ref() {
        window_work_area(edge_window)?
    } else {
        window_work_area(&main)?
    };

    let w = width.max(DRAWER_MIN_WIDTH).min((work_size.width - 40.0).max(DRAWER_MIN_WIDTH));
    let desired_h = height.max(DRAWER_MIN_HEIGHT).min(work_size.height.max(DRAWER_MIN_HEIGHT));
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
    let preserve_current_position = main.is_visible().unwrap_or(false) && !looks_like_snip_fullscreen;

    let (x, y) = if preserve_current_position {
        // 如果 main 已经可见，说明抽屉可能被用户手动拖到了别的位置。
        // 外部拖入文件/网页图片时只保证窗口尺寸正确，不再把它吸附回屏幕右侧。
        // 但截图全屏窗口不算"用户摆放的位置"，避免截图退出后保留全屏左上角。
        let current_pos = main
            .outer_position()
            .ok()
            .map(|pos| pos.to_logical::<f64>(factor))
            .unwrap_or(LogicalPosition::new(work_pos.x + work_size.width - w, work_pos.y));
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
        // 如果小条太靠近屏幕上下边缘，就自动降低抽屉高度，避免主体超出屏幕。
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
        let bottom_space = (work_pos.y + work_size.height - DRAWER_EDGE_MARGIN - strip_center_y).max(0.0);
        let max_centered_h = (top_space.min(bottom_space) * 2.0).max(1.0);

        h = if max_centered_h >= min_h {
            desired_h.min(max_centered_h).max(min_h).min(available_h)
        } else {
            desired_h.min(available_h).max(min_h)
        };

        let min_y = work_pos.y + DRAWER_EDGE_MARGIN.min((work_size.height - h).max(0.0) / 2.0);
        let max_y = work_pos.y + work_size.height - h - DRAWER_EDGE_MARGIN.min((work_size.height - h).max(0.0) / 2.0);

        (
            work_pos.x + work_size.width - w,
            clamp_f64(strip_center_y - h / 2.0, min_y, max_y.max(min_y)),
        )
    };

    main.set_min_size(Some(LogicalSize::new(1.0, 1.0))).ok();
    main.set_size(LogicalSize::new(w, h)).map_err(|e| e.to_string())?;
    main.set_position(LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
    main.set_always_on_top(true).ok();
    main.show().map_err(|e| e.to_string())?;
    let _ = main.emit("drawer-opened", ());

    // 抽屉打开期间隐藏 edge，避免离开主体时经过触发器又重新展开。
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

    let _ = main.emit("drawer-closed", ());
    main.hide().map_err(|e| e.to_string())?;
    position_edge(app_handle, height, mode, None, None).ok();
    Ok(())
}

#[tauri::command]
fn resize_drawer(app_handle: tauri::AppHandle, width: f64, height: f64) -> Result<(), String> {
    let main = app_handle
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let (work_pos, work_size, factor) = window_work_area(&main)?;

    let w = width.max(DRAWER_MIN_WIDTH).min((work_size.width - 40.0).max(DRAWER_MIN_WIDTH));
    let h = height.max(DRAWER_MIN_HEIGHT).min(work_size.height.max(DRAWER_MIN_HEIGHT));
    let current_pos = main
        .outer_position()
        .ok()
        .map(|pos| pos.to_logical::<f64>(factor))
        .unwrap_or(LogicalPosition::new(work_pos.x + work_size.width - w, work_pos.y));
    let current_size = main
        .outer_size()
        .ok()
        .map(|size| size.to_logical::<f64>(factor))
        .unwrap_or(LogicalSize::new(w, h));

    // 保持当前右边缘不动，而不是每次缩放都吸附回屏幕最右侧。
    // 这样移动后自动钉住的抽屉，缩放时仍会留在用户放置的位置附近。
    let desired_right = current_pos.x + current_size.width;
    let max_x = work_pos.x + work_size.width - w;
    let max_y = work_pos.y + work_size.height - h;
    let x = clamp_f64(desired_right - w, work_pos.x, max_x.max(work_pos.x));
    let y = clamp_f64(
        current_pos.y + (current_size.height - h) / 2.0,
        work_pos.y,
        max_y.max(work_pos.y),
    );

    main.set_size(LogicalSize::new(w, h)).map_err(|e| e.to_string())?;
    main.set_position(LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    main.set_always_on_top(true).ok();
    Ok(())
}

#[tauri::command]
fn sync_drawer_bounds(app_handle: tauri::AppHandle, width: f64, height: f64) -> Result<(), String> {
    resize_drawer(app_handle, width, height)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
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
            load_ai_analysis_config,
            save_ai_analysis_config,
            get_web_image_cache_dir,
            set_web_image_cache_dir,
            get_network_proxy,
            set_network_proxy,
            get_siliconflow_vision_models,
            cache_web_image,
            cache_web_image_to_dir,
            relocate_web_cache_file,
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
            show_in_folder,
            copy_local_file,
            cache_local_file_to_dir,
            save_item_source_as,
            save_dropped_file,
            commands::drag_window,
            commands::update_bounds,
            commands::set_ignore_mouse,
            commands::set_drawer_pass_through,
            commands::capture_screen,
            commands::enter_snip_mode,
            commands::exit_snip_mode,
            capture_screen_area,
            capture_screen_area_to_file,
            get_shortcut,
            update_shortcut,
            get_auto_start,
            set_auto_start,
            copy_image,
        
            open_drawer,
            close_drawer,
            resize_drawer,
            position_edge,
            show_edge,
            hide_edge,
            sync_drawer_bounds,])
        .setup(|app| {
            if let Some(main) = app.get_webview_window("main") {
                let _ = main.set_shadow(false);
                let _ = main.set_always_on_top(true);
                let _ = main.set_min_size(Some(tauri::LogicalSize::new(1.0, 1.0)));
                let _ = main.hide();
            }

            if let Some(edge) = app.get_webview_window("edge") {
                let _ = edge.set_shadow(false);
                let _ = edge.set_always_on_top(true);
                let _ = edge.set_min_size(Some(tauri::LogicalSize::new(1.0, 1.0)));
                let _ = position_edge(app.handle().clone(), 800.0, None, None, None);
            }

            if let Err(err) = native_drop::init_native_drop(app) {
                eprintln!("native drop init failed: {err}");
            }

            start_mobile_server(app.handle().clone());

            if let Some(icon) = app.default_window_icon().cloned() {
                let open_item = MenuItem::with_id(app, "open_drawer", "打开抽屉", true, None::<&str>)?;
                let trigger_item = MenuItem::with_id(app, "toggle_trigger", "切换触发入口", true, None::<&str>)?;
                let theme_item = MenuItem::with_id(app, "toggle_theme", "切换色彩主题", true, None::<&str>)?;
                let quit_item = MenuItem::with_id(app, "quit", "退出程序", true, None::<&str>)?;
                let tray_menu = Menu::with_items(app, &[&open_item, &trigger_item, &theme_item, &quit_item])?;

                let _ = TrayIconBuilder::new()
                    .icon(icon)
                    .tooltip("灵感抽屉")
                    .menu(&tray_menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        "open_drawer" => {
                            let _ = open_drawer(app.clone(), 400.0, 800.0, None);
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
                            let _ = open_drawer(app.clone(), 400.0, 800.0, None);
                        }
                    })
                    .build(app);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
