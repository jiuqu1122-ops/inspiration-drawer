use serde::Deserialize;
use serde_json::json;
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};
use url::Url;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use super::browser_detection::{detect_browser, detect_browsers, BrowserKind};
use super::extension_status::{
    BrowserExtensionConnectionStatus, BrowserExtensionDragPayload, BrowserExtensionInstallResult,
    BrowserExtensionStatusSnapshot, ExtensionStatusKind,
};
use super::pairing::PairingConfig;

const PROTOCOL_VERSION: u32 = 1;
const MIN_EXTENSION_VERSION: &str = "1.0.0";
const BRIDGE_PORT_START: u16 = 43951;
const BRIDGE_PORT_END: u16 = 43959;
const PAIRING_WINDOW_SECONDS: u64 = 10 * 60;
const HEARTBEAT_STALE_SECONDS: u64 = 95;
const MAX_REQUEST_BYTES: usize = 64 * 1024;
const HEARTBEAT_SECONDS: u64 = 60;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Clone, Default)]
pub struct BrowserExtensionManagerState {
    inner: Arc<ManagerInner>,
}

#[derive(Default)]
struct ManagerInner {
    config: Mutex<Option<PairingConfig>>,
    config_path: Mutex<Option<PathBuf>>,
    runtime: Mutex<RuntimeState>,
    bridge: Mutex<Option<BridgeHandle>>,
}

#[derive(Default)]
struct RuntimeState {
    port: Option<u16>,
    prepared_extension_path: Option<PathBuf>,
    bridge_error: Option<String>,
    connections: BTreeMap<BrowserKind, ConnectionRecord>,
    install_attempts: BTreeMap<BrowserKind, InstallAttempt>,
}

struct BridgeHandle {
    stop: Arc<AtomicBool>,
    join: Option<JoinHandle<()>>,
}

impl Drop for BridgeHandle {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(join) = self.join.take() {
            let _ = join.join();
        }
    }
}

#[derive(Clone)]
struct ConnectionRecord {
    extension_id: String,
    extension_version: String,
    last_seen: u64,
    outdated: bool,
}

#[derive(Clone)]
struct InstallAttempt {
    status: ExtensionStatusKind,
    expires_at: u64,
    message: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeMessage {
    #[serde(rename = "type")]
    message_type: String,
    extension_id: String,
    browser: BrowserKind,
    extension_version: String,
    protocol_version: u32,
    credential: Option<String>,
    payload: Option<ImageDragMessage>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImageDragMessage {
    image_url: String,
    page_url: Option<String>,
    page_title: Option<String>,
    image_title: Option<String>,
    alt: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
}

struct HttpRequest {
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

impl BrowserExtensionManagerState {
    pub fn start(&self, app: AppHandle) -> Result<(), String> {
        if self
            .inner
            .bridge
            .lock()
            .map_err(|error| error.to_string())?
            .is_some()
        {
            return Ok(());
        }
        let config_path = app
            .path()
            .app_config_dir()
            .map_err(|error| error.to_string())?
            .join("browser-extension.json");
        let config = PairingConfig::load_or_create(&config_path)?;
        *self
            .inner
            .config
            .lock()
            .map_err(|error| error.to_string())? = Some(config);
        *self
            .inner
            .config_path
            .lock()
            .map_err(|error| error.to_string())? = Some(config_path);

        let listener = match bind_bridge_listener() {
            Ok(listener) => listener,
            Err(error) => {
                self.inner
                    .runtime
                    .lock()
                    .map_err(|value| value.to_string())?
                    .bridge_error = Some(error.clone());
                return Err(error);
            }
        };
        listener
            .set_nonblocking(true)
            .map_err(|error| error.to_string())?;
        let port = listener
            .local_addr()
            .map_err(|error| error.to_string())?
            .port();
        {
            let mut runtime = self
                .inner
                .runtime
                .lock()
                .map_err(|error| error.to_string())?;
            runtime.port = Some(port);
            runtime.bridge_error = None;
        }

        let stop = Arc::new(AtomicBool::new(false));
        let thread_stop = stop.clone();
        let inner = self.inner.clone();
        let join = thread::Builder::new()
            .name("browser-extension-bridge".to_string())
            .spawn(move || bridge_loop(listener, port, inner, app, thread_stop))
            .map_err(|error| error.to_string())?;
        *self
            .inner
            .bridge
            .lock()
            .map_err(|error| error.to_string())? = Some(BridgeHandle {
            stop,
            join: Some(join),
        });
        Ok(())
    }

    pub fn snapshot(&self) -> Result<BrowserExtensionStatusSnapshot, String> {
        let browsers = detect_browsers();
        let runtime = self
            .inner
            .runtime
            .lock()
            .map_err(|error| error.to_string())?;
        let now = unix_time();
        let extensions = browsers
            .iter()
            .map(|detection| {
                if !detection.installed {
                    return BrowserExtensionConnectionStatus {
                        browser: detection.browser,
                        status: ExtensionStatusKind::BrowserNotInstalled,
                        extension_id: None,
                        extension_version: None,
                        last_seen: None,
                        message: None,
                    };
                }
                if let Some(connection) = runtime.connections.get(&detection.browser) {
                    let status = if connection.outdated {
                        ExtensionStatusKind::Outdated
                    } else if now.saturating_sub(connection.last_seen) > HEARTBEAT_STALE_SECONDS {
                        ExtensionStatusKind::TemporarilyDisconnected
                    } else {
                        ExtensionStatusKind::Connected
                    };
                    return BrowserExtensionConnectionStatus {
                        browser: detection.browser,
                        status,
                        extension_id: Some(connection.extension_id.clone()),
                        extension_version: Some(connection.extension_version.clone()),
                        last_seen: Some(connection.last_seen),
                        message: (status == ExtensionStatusKind::Outdated)
                            .then(|| "网页采集插件需要更新".to_string()),
                    };
                }
                if let Some(attempt) = runtime.install_attempts.get(&detection.browser) {
                    if attempt.expires_at > now {
                        return BrowserExtensionConnectionStatus {
                            browser: detection.browser,
                            status: attempt.status,
                            extension_id: None,
                            extension_version: None,
                            last_seen: None,
                            message: attempt.message.clone(),
                        };
                    }
                }
                let (status, message) = if runtime.port.is_none() {
                    if let Some(error) = runtime.bridge_error.clone() {
                        (ExtensionStatusKind::Error, Some(error))
                    } else {
                        (
                            ExtensionStatusKind::NotDetected,
                            Some("本地配对服务尚未初始化".to_string()),
                        )
                    }
                } else {
                    (ExtensionStatusKind::ExtensionNotInstalled, None)
                };
                BrowserExtensionConnectionStatus {
                    browser: detection.browser,
                    status,
                    extension_id: None,
                    extension_version: None,
                    last_seen: None,
                    message,
                }
            })
            .collect();
        Ok(BrowserExtensionStatusSnapshot {
            browsers,
            extensions,
            bridge_port: runtime.port,
            protocol_version: PROTOCOL_VERSION,
            desktop_version: env!("CARGO_PKG_VERSION").to_string(),
            prepared_extension_path: runtime
                .prepared_extension_path
                .as_ref()
                .map(|path| path.to_string_lossy().to_string()),
        })
    }

    pub fn begin_install(
        &self,
        app: &AppHandle,
        browser: BrowserKind,
    ) -> Result<BrowserExtensionInstallResult, String> {
        let detection = detect_browser(browser);
        let executable = detection
            .executable_path
            .as_deref()
            .filter(|_| detection.installed)
            .ok_or_else(|| format!("未检测到 {}", browser.as_str()))?;
        self.set_install_attempt(
            browser,
            ExtensionStatusKind::Installing,
            Some("正在准备扩展文件".to_string()),
        );
        let prepared = match self.prepare_extension(app) {
            Ok(path) => path,
            Err(error) => {
                self.set_install_attempt(browser, ExtensionStatusKind::Error, Some(error.clone()));
                return Err(error);
            }
        };
        let store_url = browser_store_url(browser);
        let (mode, opened_url, instruction) = if let Some(url) = store_url {
            launch_browser(executable, url)?;
            (
                "store".to_string(),
                url.to_string(),
                match browser {
                    BrowserKind::Chrome => {
                        "请在 Chrome 官方页面点击“添加至 Chrome”，安装后会自动连接。"
                    }
                    BrowserKind::Edge => "请在 Edge 官方页面点击“获取”，安装后会自动连接。",
                }
                .to_string(),
            )
        } else {
            launch_browser(executable, browser.extensions_url())?;
            (
                "development".to_string(),
                browser.extensions_url().to_string(),
                "开发测试：开启开发者模式，点击“加载已解压的扩展”，再用下方按钮打开扩展目录。"
                    .to_string(),
            )
        };
        self.set_install_attempt(
            browser,
            ExtensionStatusKind::WaitingForBrowserConfirmation,
            Some(instruction.clone()),
        );
        Ok(BrowserExtensionInstallResult {
            browser,
            mode,
            status: ExtensionStatusKind::WaitingForBrowserConfirmation,
            prepared_extension_path: prepared.to_string_lossy().to_string(),
            opened_url,
            instruction,
        })
    }

    pub fn begin_pairing(&self, browser: BrowserKind) {
        self.set_install_attempt(
            browser,
            ExtensionStatusKind::WaitingForPairing,
            Some("等待浏览器扩展自动连接".to_string()),
        );
    }

    pub fn open_extension_page(&self, browser: BrowserKind) -> Result<(), String> {
        let detection = detect_browser(browser);
        let executable = detection
            .executable_path
            .as_deref()
            .filter(|_| detection.installed)
            .ok_or_else(|| format!("未检测到 {}", browser.as_str()))?;
        launch_browser(executable, browser.extensions_url())
    }

    pub fn open_prepared_folder(&self, app: &AppHandle) -> Result<String, String> {
        let path = self.prepare_extension(app)?;
        open::that(&path).map_err(|error| error.to_string())?;
        Ok(path.to_string_lossy().to_string())
    }

    pub fn dismiss_setup_prompt(&self) -> Result<(), String> {
        let path = self
            .inner
            .config_path
            .lock()
            .map_err(|error| error.to_string())?
            .clone()
            .ok_or_else(|| "配对配置尚未初始化".to_string())?;
        let mut config = self
            .inner
            .config
            .lock()
            .map_err(|error| error.to_string())?;
        let config = config
            .as_mut()
            .ok_or_else(|| "配对配置尚未初始化".to_string())?;
        config.setup_prompt_dismissed = true;
        config.save(&path)
    }

    fn prepare_extension(&self, app: &AppHandle) -> Result<PathBuf, String> {
        let source = locate_bundled_extension(app)?;
        let target = app
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?
            .join("browser-extension")
            .join("development");
        if target.exists() {
            fs::remove_dir_all(&target).map_err(|error| error.to_string())?;
        }
        copy_directory(&source, &target)?;
        if !target.join("manifest.json").is_file() {
            return Err("扩展资源缺少 manifest.json".to_string());
        }
        self.inner
            .runtime
            .lock()
            .map_err(|error| error.to_string())?
            .prepared_extension_path = Some(target.clone());
        Ok(target)
    }

    fn set_install_attempt(
        &self,
        browser: BrowserKind,
        status: ExtensionStatusKind,
        message: Option<String>,
    ) {
        if let Ok(mut runtime) = self.inner.runtime.lock() {
            runtime.install_attempts.insert(
                browser,
                InstallAttempt {
                    status,
                    expires_at: unix_time() + PAIRING_WINDOW_SECONDS,
                    message,
                },
            );
        }
    }
}

fn bridge_loop(
    listener: TcpListener,
    port: u16,
    inner: Arc<ManagerInner>,
    app: AppHandle,
    stop: Arc<AtomicBool>,
) {
    while !stop.load(Ordering::Acquire) {
        match listener.accept() {
            Ok((stream, address)) => {
                if !address.ip().is_loopback() {
                    continue;
                }
                let inner = inner.clone();
                let app = app.clone();
                thread::spawn(move || handle_connection(stream, port, inner, app));
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(80));
            }
            Err(_) => thread::sleep(Duration::from_millis(160)),
        }
    }
}

fn handle_connection(mut stream: TcpStream, port: u16, inner: Arc<ManagerInner>, app: AppHandle) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(4)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(4)));
    let request = match read_http_request(&mut stream) {
        Ok(request) => request,
        Err(error) => {
            let _ = write_json_response(&mut stream, 400, None, json!({ "error": error }));
            return;
        }
    };
    let (origin, extension_id) = match validate_request_identity(&request, port) {
        Ok(identity) => identity,
        Err(error) => {
            let _ = write_json_response(&mut stream, 403, None, json!({ "error": error }));
            return;
        }
    };
    if request.method == "OPTIONS" {
        let _ = write_json_response(&mut stream, 204, Some(&origin), json!({}));
        return;
    }
    if request.method != "POST"
        || !request
            .headers
            .get("content-type")
            .is_some_and(|value| value.to_ascii_lowercase().starts_with("application/json"))
    {
        let _ = write_json_response(
            &mut stream,
            405,
            Some(&origin),
            json!({ "error": "json_post_required" }),
        );
        return;
    }
    let message: BridgeMessage = match serde_json::from_slice(&request.body) {
        Ok(message) => message,
        Err(error) => {
            let _ = write_json_response(
                &mut stream,
                400,
                Some(&origin),
                json!({ "error": error.to_string() }),
            );
            return;
        }
    };
    if message.extension_id != extension_id || !valid_extension_id(&message.extension_id) {
        let _ = write_json_response(
            &mut stream,
            403,
            Some(&origin),
            json!({ "error": "extension_id_mismatch" }),
        );
        return;
    }
    let response = route_bridge_request(&request.path, message, inner, app);
    let _ = write_json_response(&mut stream, response.0, Some(&origin), response.1);
}

fn validate_request_identity(
    request: &HttpRequest,
    port: u16,
) -> Result<(String, String), &'static str> {
    let expected_host = format!("127.0.0.1:{port}");
    if request.headers.get("host").map(String::as_str) != Some(expected_host.as_str()) {
        return Err("loopback_host_required");
    }
    let origin = request
        .headers
        .get("origin")
        .cloned()
        .ok_or("extension_origin_required")?;
    let extension_id = extension_id_from_origin(&origin)
        .ok_or("extension_origin_required")?
        .to_string();
    if request.method != "OPTIONS"
        && request
            .headers
            .get("x-inspiration-extension-id")
            .map(String::as_str)
            != Some(extension_id.as_str())
    {
        return Err("extension_id_mismatch");
    }
    Ok((origin, extension_id))
}

fn route_bridge_request(
    path: &str,
    message: BridgeMessage,
    inner: Arc<ManagerInner>,
    app: AppHandle,
) -> (u16, serde_json::Value) {
    let expected_type = match path {
        "/v1/pair" => "pair_request",
        "/v1/hello" => "extension_hello",
        "/v1/heartbeat" => "heartbeat",
        "/v1/image-drag-started" => "image_drag_started",
        _ => return (404, json!({ "error": "unknown_endpoint" })),
    };
    if message.message_type != expected_type {
        return (400, json!({ "error": "message_type_mismatch" }));
    }
    if message.extension_version.len() > 64 {
        return (400, json!({ "error": "invalid_extension_version" }));
    }
    if path == "/v1/pair" {
        if message.protocol_version != PROTOCOL_VERSION {
            record_connection(&inner, &app, &message, true);
            return (
                426,
                json!({ "error": "extension_outdated", "protocolVersion": PROTOCOL_VERSION }),
            );
        }
        if !pairing_is_allowed(&inner, message.browser, &message.extension_id) {
            return (403, json!({ "error": "pairing_not_active" }));
        }
        let config_path = match inner
            .config_path
            .lock()
            .ok()
            .and_then(|value| value.clone())
        {
            Some(path) => path,
            None => return (500, json!({ "error": "pairing_config_unavailable" })),
        };
        let credential = {
            let mut config = match inner.config.lock() {
                Ok(config) => config,
                Err(_) => return (500, json!({ "error": "pairing_config_unavailable" })),
            };
            let Some(config) = config.as_mut() else {
                return (500, json!({ "error": "pairing_config_unavailable" }));
            };
            let credential = match config.credential(message.browser, &message.extension_id) {
                Ok(value) => value,
                Err(error) => return (500, json!({ "error": error })),
            };
            config.record_pairing(message.browser, &message.extension_id, unix_time());
            if let Err(error) = config.save(&config_path) {
                return (500, json!({ "error": error }));
            }
            credential
        };
        if let Ok(mut runtime) = inner.runtime.lock() {
            runtime.install_attempts.insert(
                message.browser,
                InstallAttempt {
                    status: ExtensionStatusKind::WaitingForPairing,
                    expires_at: unix_time() + PAIRING_WINDOW_SECONDS,
                    message: Some("扩展已授权，正在建立连接".to_string()),
                },
            );
        }
        return (
            200,
            json!({
                "credential": credential,
                "desktopVersion": env!("CARGO_PKG_VERSION"),
                "protocolVersion": PROTOCOL_VERSION,
                "heartbeatSeconds": HEARTBEAT_SECONDS,
            }),
        );
    }

    let credential = message.credential.as_deref().unwrap_or_default();
    if !authenticated(&inner, message.browser, &message.extension_id, credential) {
        return (401, json!({ "error": "invalid_pairing_credential" }));
    }
    let outdated = message.protocol_version != PROTOCOL_VERSION
        || version_is_older(&message.extension_version, MIN_EXTENSION_VERSION);
    record_connection(&inner, &app, &message, outdated);
    if outdated {
        return (
            426,
            json!({ "error": "extension_outdated", "protocolVersion": PROTOCOL_VERSION }),
        );
    }
    if path == "/v1/image-drag-started" {
        let Some(payload) = message.payload else {
            return (400, json!({ "error": "image_payload_required" }));
        };
        if !valid_web_url(&payload.image_url)
            || payload
                .page_url
                .as_deref()
                .is_some_and(|value| !valid_web_url(value))
        {
            return (400, json!({ "error": "http_image_url_required" }));
        }
        let event = BrowserExtensionDragPayload {
            browser: message.browser,
            extension_id: message.extension_id,
            image_url: truncate(payload.image_url, 8192),
            page_url: payload.page_url.map(|value| truncate(value, 8192)),
            page_title: payload.page_title.map(|value| truncate(value, 512)),
            image_title: payload.image_title.map(|value| truncate(value, 512)),
            alt: payload.alt.map(|value| truncate(value, 512)),
            width: payload.width,
            height: payload.height,
        };
        let _ = app.emit("browser-extension-image-drag-started", event);
    }
    (
        200,
        json!({
            "ok": true,
            "desktopVersion": env!("CARGO_PKG_VERSION"),
            "protocolVersion": PROTOCOL_VERSION,
            "heartbeatSeconds": HEARTBEAT_SECONDS,
        }),
    )
}

fn record_connection(
    inner: &Arc<ManagerInner>,
    app: &AppHandle,
    message: &BridgeMessage,
    outdated: bool,
) {
    if let Ok(mut runtime) = inner.runtime.lock() {
        runtime.connections.insert(
            message.browser,
            ConnectionRecord {
                extension_id: message.extension_id.clone(),
                extension_version: message.extension_version.clone(),
                last_seen: unix_time(),
                outdated,
            },
        );
        runtime.install_attempts.remove(&message.browser);
    }
    let _ = app.emit("browser-extension-status-changed", ());
}

fn authenticated(
    inner: &Arc<ManagerInner>,
    browser: BrowserKind,
    extension_id: &str,
    credential: &str,
) -> bool {
    let Ok(config) = inner.config.lock() else {
        return false;
    };
    let Some(config) = config.as_ref() else {
        return false;
    };
    config.is_paired(browser, extension_id)
        && config.verify_credential(browser, extension_id, credential)
}

fn pairing_is_allowed(inner: &Arc<ManagerInner>, browser: BrowserKind, extension_id: &str) -> bool {
    if trusted_store_extension(browser, extension_id) {
        return true;
    }
    let Ok(runtime) = inner.runtime.lock() else {
        return false;
    };
    runtime
        .install_attempts
        .get(&browser)
        .is_some_and(|attempt| attempt.expires_at > unix_time())
}

fn bind_bridge_listener() -> Result<TcpListener, String> {
    for port in BRIDGE_PORT_START..=BRIDGE_PORT_END {
        let address = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);
        if let Ok(listener) = TcpListener::bind(address) {
            return Ok(listener);
        }
    }
    Err(format!(
        "无法在 127.0.0.1:{}-{} 启动浏览器扩展 bridge",
        BRIDGE_PORT_START, BRIDGE_PORT_END
    ))
}

fn read_http_request(stream: &mut TcpStream) -> Result<HttpRequest, String> {
    let mut buffer = Vec::with_capacity(4096);
    let header_end = loop {
        if buffer.len() > MAX_REQUEST_BYTES {
            return Err("request_too_large".to_string());
        }
        if let Some(position) = find_bytes(&buffer, b"\r\n\r\n") {
            break position + 4;
        }
        let mut chunk = [0u8; 4096];
        let read = stream.read(&mut chunk).map_err(|error| error.to_string())?;
        if read == 0 {
            return Err("incomplete_request".to_string());
        }
        buffer.extend_from_slice(&chunk[..read]);
    };
    let header_text =
        String::from_utf8(buffer[..header_end].to_vec()).map_err(|error| error.to_string())?;
    let mut lines = header_text.split("\r\n");
    let request_line = lines
        .next()
        .ok_or_else(|| "missing_request_line".to_string())?;
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts.next().unwrap_or_default().to_string();
    let path = request_parts.next().unwrap_or_default().to_string();
    let mut headers = HashMap::new();
    for line in lines {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_string());
    }
    let content_length = headers
        .get("content-length")
        .map(|value| value.parse::<usize>().map_err(|error| error.to_string()))
        .transpose()?
        .unwrap_or(0);
    if content_length > MAX_REQUEST_BYTES {
        return Err("request_too_large".to_string());
    }
    while buffer.len() < header_end + content_length {
        let mut chunk = [0u8; 4096];
        let read = stream.read(&mut chunk).map_err(|error| error.to_string())?;
        if read == 0 {
            return Err("incomplete_request".to_string());
        }
        buffer.extend_from_slice(&chunk[..read]);
    }
    Ok(HttpRequest {
        method,
        path,
        headers,
        body: buffer[header_end..header_end + content_length].to_vec(),
    })
}

fn write_json_response(
    stream: &mut TcpStream,
    status: u16,
    origin: Option<&str>,
    value: serde_json::Value,
) -> Result<(), String> {
    let body = if status == 204 {
        Vec::new()
    } else {
        serde_json::to_vec(&value).map_err(|error| error.to_string())?
    };
    let reason = match status {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        426 => "Upgrade Required",
        _ => "Internal Server Error",
    };
    let cors = origin
        .map(|value| {
            format!(
                "Access-Control-Allow-Origin: {value}\r\nAccess-Control-Allow-Methods: POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, X-Inspiration-Extension-Id\r\nAccess-Control-Allow-Private-Network: true\r\nVary: Origin\r\n"
            )
        })
        .unwrap_or_default();
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n{cors}Connection: close\r\n\r\n",
        body.len()
    );
    stream
        .write_all(response.as_bytes())
        .map_err(|error| error.to_string())?;
    stream.write_all(&body).map_err(|error| error.to_string())
}

fn locate_bundled_extension(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("browser-extension"));
        candidates.push(resource_dir.join("browser-extension/build"));
        candidates.push(resource_dir.join("_up_/browser-extension/build"));
    }
    if cfg!(debug_assertions) {
        if let Some(root) = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent() {
            candidates.push(root.join("browser-extension/build"));
        }
    }
    candidates
        .into_iter()
        .find(|path| path.join("manifest.json").is_file())
        .ok_or_else(|| "安装包中没有找到浏览器扩展资源，请先运行扩展构建".to_string())
}

fn copy_directory(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|error| error.to_string())?;
    for entry in fs::read_dir(source).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        if entry
            .file_type()
            .map_err(|error| error.to_string())?
            .is_dir()
        {
            copy_directory(&source_path, &target_path)?;
        } else {
            fs::copy(&source_path, &target_path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn launch_browser(executable: &str, target: &str) -> Result<(), String> {
    let mut command = Command::new(executable);
    command.arg(target);
    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

fn browser_store_url(browser: BrowserKind) -> Option<&'static str> {
    let value = match browser {
        BrowserKind::Chrome => option_env!("INSPIRATION_DRAWER_CHROME_EXTENSION_URL"),
        BrowserKind::Edge => option_env!("INSPIRATION_DRAWER_EDGE_EXTENSION_URL"),
    }?;
    (!value.trim().is_empty()).then_some(value)
}

fn trusted_store_extension(browser: BrowserKind, extension_id: &str) -> bool {
    let configured = match browser {
        BrowserKind::Chrome => option_env!("INSPIRATION_DRAWER_CHROME_EXTENSION_ID"),
        BrowserKind::Edge => option_env!("INSPIRATION_DRAWER_EDGE_EXTENSION_ID"),
    };
    configured.is_some_and(|value| !value.is_empty() && value == extension_id)
}

fn extension_id_from_origin(origin: &str) -> Option<&str> {
    let id = origin.strip_prefix("chrome-extension://")?;
    valid_extension_id(id).then_some(id)
}

fn valid_extension_id(value: &str) -> bool {
    value.len() == 32 && value.bytes().all(|byte| (b'a'..=b'p').contains(&byte))
}

fn valid_web_url(value: &str) -> bool {
    Url::parse(value)
        .ok()
        .is_some_and(|url| matches!(url.scheme(), "http" | "https"))
}

fn version_is_older(current: &str, minimum: &str) -> bool {
    let parse = |value: &str| -> Vec<u64> {
        value
            .split('.')
            .take(4)
            .map(|part| {
                part.split(|character: char| !character.is_ascii_digit())
                    .next()
                    .unwrap_or("0")
            })
            .map(|part| part.parse::<u64>().unwrap_or(0))
            .collect()
    };
    let mut current = parse(current);
    let mut minimum = parse(minimum);
    let length = current.len().max(minimum.len());
    current.resize(length, 0);
    minimum.resize(length, 0);
    current < minimum
}

fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn truncate(value: String, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

fn unix_time() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bridge_listener_only_binds_loopback() {
        let listener = bind_bridge_listener().unwrap();
        assert_eq!(
            listener.local_addr().unwrap().ip(),
            IpAddr::V4(Ipv4Addr::LOCALHOST)
        );
    }

    #[test]
    fn ordinary_web_origins_are_rejected() {
        assert!(extension_id_from_origin("https://example.com").is_none());
        assert!(extension_id_from_origin("http://127.0.0.1").is_none());
        assert!(
            extension_id_from_origin("chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
                .is_some()
        );
    }

    #[test]
    fn extension_cors_preflight_allows_the_browser_to_ask_for_custom_headers() {
        let request = HttpRequest {
            method: "OPTIONS".to_string(),
            path: "/v1/pair".to_string(),
            headers: HashMap::from([
                ("host".to_string(), "127.0.0.1:43951".to_string()),
                (
                    "origin".to_string(),
                    "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_string(),
                ),
            ]),
            body: Vec::new(),
        };
        assert!(validate_request_identity(&request, 43951).is_ok());
    }

    #[test]
    fn extension_posts_require_an_identity_header_matching_the_origin() {
        let request = HttpRequest {
            method: "POST".to_string(),
            path: "/v1/pair".to_string(),
            headers: HashMap::from([
                ("host".to_string(), "127.0.0.1:43951".to_string()),
                (
                    "origin".to_string(),
                    "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa".to_string(),
                ),
            ]),
            body: Vec::new(),
        };
        assert_eq!(
            validate_request_identity(&request, 43951),
            Err("extension_id_mismatch")
        );
    }

    #[test]
    fn old_extension_version_is_detected() {
        assert!(version_is_older("0.9.9", "1.0.0"));
        assert!(!version_is_older("1.0.0", "1.0.0"));
        assert!(!version_is_older("1.2.0", "1.0.0"));
    }

    #[test]
    fn only_http_image_sources_are_accepted() {
        assert!(valid_web_url("https://example.com/image.png"));
        assert!(!valid_web_url("file:///C:/secret.png"));
        assert!(!valid_web_url("javascript:alert(1)"));
    }
}
