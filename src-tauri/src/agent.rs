use reqwest::header::{HeaderName, HeaderValue, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs::{self, File};
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{Emitter, State};

const AGENT_SETTINGS_FILE: &str = "agent_config.json";
const CODEX_RPC_TIMEOUT_SECS: u64 = 45;
const MANAGED_CODEX_VERSION: &str = "0.142.5";
const MANAGED_CODEX_WINDOWS_X64_URL: &str = "https://github.com/openai/codex/releases/download/rust-v0.142.5/codex-x86_64-pc-windows-msvc.exe.zip";
const MANAGED_CODEX_WINDOWS_X64_SHA256: &str =
    "9d344a41dc15408bb2cc3ed3782cde33e7b4fd4a7016b5838dfeffaf1f6e6c0d";
const MANAGED_CODEX_WINDOWS_X64_ZIP_SIZE: u64 = 109_265_503;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentSettingsStored {
    provider: String,
    api_base_url: String,
    api_key: String,
    api_model: String,
    #[serde(default)]
    api_headers: BTreeMap<String, String>,
    codex_executable: String,
    codex_model: String,
    codex_sandbox: String,
    codex_approval_policy: String,
    system_prompt: String,
    approval_mode: String,
    retain_history: bool,
}

impl Default for AgentSettingsStored {
    fn default() -> Self {
        Self {
            provider: "openai-compatible".to_string(),
            api_base_url: "https://api.openai.com/v1".to_string(),
            api_key: String::new(),
            api_model: "gpt-4o-mini".to_string(),
            api_headers: BTreeMap::new(),
            codex_executable: "codex".to_string(),
            codex_model: String::new(),
            codex_sandbox: "read-only".to_string(),
            codex_approval_policy: "on-request".to_string(),
            system_prompt: "你是灵感抽屉的画布 Agent。理解用户目标，优先复用已有预设和工作流；需要修改画布时只输出可验证、最小化的画布操作。".to_string(),
            approval_mode: "ask".to_string(),
            retain_history: true,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSettingsPublic {
    provider: String,
    api_base_url: String,
    api_model: String,
    api_headers: BTreeMap<String, String>,
    has_api_key: bool,
    codex_executable: String,
    codex_model: String,
    codex_sandbox: String,
    codex_approval_policy: String,
    system_prompt: String,
    approval_mode: String,
    retain_history: bool,
}

impl From<&AgentSettingsStored> for AgentSettingsPublic {
    fn from(value: &AgentSettingsStored) -> Self {
        Self {
            provider: value.provider.clone(),
            api_base_url: value.api_base_url.clone(),
            api_model: value.api_model.clone(),
            api_headers: value.api_headers.clone(),
            has_api_key: !value.api_key.trim().is_empty(),
            codex_executable: value.codex_executable.clone(),
            codex_model: normalize_codex_model(&value.codex_model),
            codex_sandbox: value.codex_sandbox.clone(),
            codex_approval_policy: value.codex_approval_policy.clone(),
            system_prompt: value.system_prompt.clone(),
            approval_mode: value.approval_mode.clone(),
            retain_history: value.retain_history,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSettingsInput {
    provider: String,
    api_base_url: String,
    api_key: Option<String>,
    #[serde(default)]
    clear_api_key: bool,
    api_model: String,
    #[serde(default)]
    api_headers: BTreeMap<String, String>,
    codex_executable: String,
    codex_model: String,
    codex_sandbox: String,
    codex_approval_policy: String,
    system_prompt: String,
    approval_mode: String,
    retain_history: bool,
}

#[derive(Clone)]
struct CodexRuntime {
    child: Arc<Mutex<Child>>,
    stdin: Arc<Mutex<ChildStdin>>,
    pending: Arc<Mutex<HashMap<String, mpsc::Sender<Value>>>>,
    next_id: Arc<AtomicU64>,
    executable: String,
    version: String,
}

impl CodexRuntime {
    fn write_message(&self, message: &Value) -> Result<(), String> {
        let encoded = serde_json::to_string(message).map_err(|error| error.to_string())?;
        let mut stdin = self
            .stdin
            .lock()
            .map_err(|_| "Codex stdin lock poisoned".to_string())?;
        stdin
            .write_all(format!("{}\n", encoded).as_bytes())
            .map_err(|error| format!("写入 Codex App Server 失败：{}", error))?;
        stdin
            .flush()
            .map_err(|error| format!("刷新 Codex App Server 输入失败：{}", error))
    }

    fn request(&self, method: &str, params: Value, timeout: Duration) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let key = id.to_string();
        let (sender, receiver) = mpsc::channel();
        self.pending
            .lock()
            .map_err(|_| "Codex pending request lock poisoned".to_string())?
            .insert(key.clone(), sender);

        if let Err(error) = self.write_message(&json!({
            "method": method,
            "id": id,
            "params": params,
        })) {
            let _ = self.pending.lock().map(|mut pending| pending.remove(&key));
            return Err(error);
        }

        let message = receiver
            .recv_timeout(timeout)
            .map_err(|_| format!("Codex 请求超时：{}", method))?;
        if let Some(error) = message.get("error") {
            let detail = error
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("未知 Codex 错误");
            return Err(format!("Codex {} 失败：{}", method, detail));
        }
        Ok(message.get("result").cloned().unwrap_or(Value::Null))
    }

    fn is_running(&self) -> bool {
        self.child
            .lock()
            .ok()
            .and_then(|mut child| child.try_wait().ok())
            .flatten()
            .is_none()
    }

    fn stop(&self) {
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[derive(Default)]
pub struct AgentRuntimeState {
    codex: Mutex<Option<CodexRuntime>>,
    openai_cancellations: Arc<Mutex<HashSet<String>>>,
}

impl Drop for AgentRuntimeState {
    fn drop(&mut self) {
        if let Ok(runtime) = self.codex.get_mut() {
            if let Some(runtime) = runtime.take() {
                runtime.stop();
            }
        }
    }
}

fn settings_path(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
    crate::get_user_data_dir(app_handle).join(AGENT_SETTINGS_FILE)
}

fn read_settings(app_handle: &tauri::AppHandle) -> AgentSettingsStored {
    fs::read_to_string(settings_path(app_handle))
        .ok()
        .and_then(|content| serde_json::from_str::<AgentSettingsStored>(&content).ok())
        .unwrap_or_default()
}

fn write_settings(
    app_handle: &tauri::AppHandle,
    settings: &AgentSettingsStored,
) -> Result<(), String> {
    let content = serde_json::to_string_pretty(settings).map_err(|error| error.to_string())?;
    fs::write(settings_path(app_handle), content).map_err(|error| error.to_string())
}

fn normalize_provider(value: &str) -> String {
    if value.trim().eq_ignore_ascii_case("codex") {
        "codex".to_string()
    } else {
        "openai-compatible".to_string()
    }
}

fn normalize_sandbox(value: &str) -> String {
    match value.trim() {
        "workspace-write" => "workspace-write".to_string(),
        "danger-full-access" => "danger-full-access".to_string(),
        _ => "read-only".to_string(),
    }
}

fn normalize_approval_policy(value: &str) -> String {
    match value.trim() {
        "never" => "never".to_string(),
        "on-failure" => "on-failure".to_string(),
        "untrusted" => "untrusted".to_string(),
        _ => "on-request".to_string(),
    }
}

fn normalize_codex_model(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let normalized = trimmed
        .to_ascii_lowercase()
        .replace(char::is_whitespace, "");
    match normalized.as_str() {
        "auto" | "default" | "recommended" | "codex" | "5.5" | "gpt5.5" | "gpt-5.5" => {
            String::new()
        }
        "5.4" | "gpt5.4" => "gpt-5.4".to_string(),
        "5.4-mini" | "gpt5.4-mini" => "gpt-5.4-mini".to_string(),
        "spark" | "codex-spark" => "gpt-5.3-codex-spark".to_string(),
        _ => trimmed.to_string(),
    }
}

#[tauri::command]
pub fn agent_load_settings(app_handle: tauri::AppHandle) -> AgentSettingsPublic {
    AgentSettingsPublic::from(&read_settings(&app_handle))
}

#[tauri::command]
pub fn agent_save_settings(
    app_handle: tauri::AppHandle,
    input: AgentSettingsInput,
) -> Result<AgentSettingsPublic, String> {
    let mut current = read_settings(&app_handle);
    current.provider = normalize_provider(&input.provider);
    current.api_base_url = input.api_base_url.trim().trim_end_matches('/').to_string();
    current.api_model = input.api_model.trim().to_string();
    current.api_headers = input
        .api_headers
        .into_iter()
        .filter_map(|(key, value)| {
            let key = key.trim().to_string();
            let value = value.trim().to_string();
            (!key.is_empty() && !value.is_empty()).then_some((key, value))
        })
        .collect();
    if input.clear_api_key {
        current.api_key.clear();
    } else if let Some(api_key) = input.api_key {
        if !api_key.trim().is_empty() {
            current.api_key = api_key.trim().to_string();
        }
    }
    current.codex_executable = if input.codex_executable.trim().is_empty() {
        "codex".to_string()
    } else {
        input.codex_executable.trim().to_string()
    };
    current.codex_model = normalize_codex_model(&input.codex_model);
    current.codex_sandbox = normalize_sandbox(&input.codex_sandbox);
    current.codex_approval_policy = normalize_approval_policy(&input.codex_approval_policy);
    current.system_prompt = input.system_prompt.trim().to_string();
    current.approval_mode = if input.approval_mode == "auto" {
        "auto".to_string()
    } else {
        "ask".to_string()
    };
    current.retain_history = input.retain_history;
    write_settings(&app_handle, &current)?;
    Ok(AgentSettingsPublic::from(&current))
}

fn chat_completions_url(base_url: &str) -> Result<String, String> {
    let base = base_url.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("请先填写 Agent API Base URL".to_string());
    }
    if base.ends_with("/chat/completions") {
        Ok(base.to_string())
    } else {
        Ok(format!("{}/chat/completions", base))
    }
}

fn models_url(base_url: &str) -> Result<String, String> {
    let base = base_url.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("请先填写 Agent API Base URL".to_string());
    }
    if base.ends_with("/models") {
        Ok(base.to_string())
    } else {
        Ok(format!("{}/models", base))
    }
}

fn add_custom_headers(
    mut request: reqwest::blocking::RequestBuilder,
    headers: &BTreeMap<String, String>,
) -> Result<reqwest::blocking::RequestBuilder, String> {
    for (key, value) in headers {
        let name = HeaderName::from_bytes(key.as_bytes())
            .map_err(|_| format!("Agent API Header 名称无效：{}", key))?;
        let value = HeaderValue::from_str(value)
            .map_err(|_| format!("Agent API Header 值无效：{}", key))?;
        request = request.header(name, value);
    }
    Ok(request)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentOpenAiChatRequest {
    request_id: String,
    messages: Vec<Value>,
    #[serde(default)]
    tools: Vec<Value>,
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenAiToolCallResult {
    id: String,
    name: String,
    arguments: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentOpenAiChatResult {
    request_id: String,
    content: String,
    tool_calls: Vec<OpenAiToolCallResult>,
    finish_reason: Option<String>,
}

#[derive(Default)]
struct OpenAiToolCallAccumulator {
    id: String,
    name: String,
    arguments: String,
}

fn merge_openai_choice(
    choice: &Value,
    content: &mut String,
    tool_calls: &mut BTreeMap<usize, OpenAiToolCallAccumulator>,
    app_handle: &tauri::AppHandle,
    request_id: &str,
) {
    let delta = choice.get("delta").or_else(|| choice.get("message"));
    if let Some(text) = delta
        .and_then(|value| value.get("content"))
        .and_then(Value::as_str)
    {
        content.push_str(text);
        let _ = app_handle.emit(
            "agent-openai-stream",
            json!({ "requestId": request_id, "kind": "delta", "delta": text }),
        );
    }
    if let Some(calls) = delta
        .and_then(|value| value.get("tool_calls"))
        .and_then(Value::as_array)
    {
        for (fallback_index, call) in calls.iter().enumerate() {
            let index = call
                .get("index")
                .and_then(Value::as_u64)
                .map(|value| value as usize)
                .unwrap_or(fallback_index);
            let entry = tool_calls.entry(index).or_default();
            if let Some(id) = call.get("id").and_then(Value::as_str) {
                entry.id.push_str(id);
            }
            if let Some(function) = call.get("function") {
                if let Some(name) = function.get("name").and_then(Value::as_str) {
                    entry.name.push_str(name);
                }
                if let Some(arguments) = function.get("arguments").and_then(Value::as_str) {
                    entry.arguments.push_str(arguments);
                }
            }
        }
    }
}

fn parse_openai_response_value(
    parsed: &Value,
    content: &mut String,
    tool_calls: &mut BTreeMap<usize, OpenAiToolCallAccumulator>,
    finish_reason: &mut Option<String>,
    app_handle: &tauri::AppHandle,
    request_id: &str,
) {
    if let Some(choice) = parsed
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
    {
        merge_openai_choice(choice, content, tool_calls, app_handle, request_id);
        if let Some(reason) = choice.get("finish_reason").and_then(Value::as_str) {
            *finish_reason = Some(reason.to_string());
        }
    }
}

#[tauri::command]
pub async fn agent_openai_chat(
    app_handle: tauri::AppHandle,
    state: State<'_, AgentRuntimeState>,
    request: AgentOpenAiChatRequest,
) -> Result<AgentOpenAiChatResult, String> {
    let settings = read_settings(&app_handle);
    let cancellations = state.openai_cancellations.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if settings.api_key.trim().is_empty() {
            return Err("请先在 Agent 设置中填写 API Key".to_string());
        }
        if settings.api_model.trim().is_empty() {
            return Err("请先在 Agent 设置中填写模型".to_string());
        }
        if let Ok(mut values) = cancellations.lock() {
            values.remove(&request.request_id);
        }

        let mut body = json!({
            "model": settings.api_model,
            "messages": request.messages,
            "stream": true,
        });
        if !request.tools.is_empty() {
            body["tools"] = Value::Array(request.tools);
            body["tool_choice"] = Value::String("auto".to_string());
        }

        let client = crate::build_http_client(Some(&app_handle), None, 600)?;
        let mut request_builder = client
            .post(chat_completions_url(&settings.api_base_url)?)
            .bearer_auth(&settings.api_key)
            .header(CONTENT_TYPE, "application/json")
            .json(&body);
        request_builder = add_custom_headers(request_builder, &settings.api_headers)?;
        let response = request_builder
            .send()
            .map_err(|error| format!("Agent API 请求失败：{}", error))?;
        let status = response.status();
        if !status.is_success() {
            let text = response.text().unwrap_or_default();
            return Err(format!("Agent API HTTP {}：{}", status, text));
        }

        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
            .to_ascii_lowercase();
        let mut content = String::new();
        let mut tool_calls = BTreeMap::<usize, OpenAiToolCallAccumulator>::new();
        let mut finish_reason = None;

        if content_type.contains("text/event-stream") {
            let reader = BufReader::new(response);
            for line in reader.lines() {
                if cancellations
                    .lock()
                    .map(|values| values.contains(&request.request_id))
                    .unwrap_or(false)
                {
                    return Err("Agent 请求已取消".to_string());
                }
                let line = line.map_err(|error| format!("读取 Agent 流失败：{}", error))?;
                let Some(data) = line.trim().strip_prefix("data:") else {
                    continue;
                };
                let data = data.trim();
                if data == "[DONE]" {
                    break;
                }
                if data.is_empty() {
                    continue;
                }
                let parsed: Value = serde_json::from_str(data)
                    .map_err(|error| format!("解析 Agent 流失败：{}", error))?;
                parse_openai_response_value(
                    &parsed,
                    &mut content,
                    &mut tool_calls,
                    &mut finish_reason,
                    &app_handle,
                    &request.request_id,
                );
            }
        } else {
            let parsed: Value = response
                .json()
                .map_err(|error| format!("解析 Agent API 响应失败：{}", error))?;
            parse_openai_response_value(
                &parsed,
                &mut content,
                &mut tool_calls,
                &mut finish_reason,
                &app_handle,
                &request.request_id,
            );
        }

        if let Ok(mut values) = cancellations.lock() {
            values.remove(&request.request_id);
        }
        let tool_calls = tool_calls
            .into_values()
            .map(|value| OpenAiToolCallResult {
                id: if value.id.is_empty() {
                    format!("call_{}", uuid_like_id())
                } else {
                    value.id
                },
                name: value.name,
                arguments: value.arguments,
            })
            .collect();
        let result = AgentOpenAiChatResult {
            request_id: request.request_id.clone(),
            content,
            tool_calls,
            finish_reason,
        };
        let _ = app_handle.emit(
            "agent-openai-stream",
            json!({ "requestId": request.request_id, "kind": "completed" }),
        );
        Ok(result)
    })
    .await
    .map_err(|error| format!("Agent API 后台任务失败：{}", error))?
}

fn uuid_like_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    format!("{:x}", nanos)
}

#[tauri::command]
pub fn agent_cancel_openai(
    state: State<'_, AgentRuntimeState>,
    request_id: String,
) -> Result<(), String> {
    state
        .openai_cancellations
        .lock()
        .map_err(|_| "Agent cancellation lock poisoned".to_string())?
        .insert(request_id);
    Ok(())
}

#[tauri::command]
pub async fn agent_list_openai_models(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    let settings = read_settings(&app_handle);
    tauri::async_runtime::spawn_blocking(move || {
        if settings.api_key.trim().is_empty() {
            return Err("请先在 Agent 设置中填写 API Key".to_string());
        }
        let client = crate::build_http_client(Some(&app_handle), None, 90)?;
        let mut request = client
            .get(models_url(&settings.api_base_url)?)
            .bearer_auth(&settings.api_key);
        request = add_custom_headers(request, &settings.api_headers)?;
        let response = request
            .send()
            .map_err(|error| format!("读取 Agent 模型列表失败：{}", error))?;
        let status = response.status();
        let text = response.text().unwrap_or_default();
        if !status.is_success() {
            return Err(format!("Agent 模型列表 HTTP {}：{}", status, text));
        }
        let parsed: Value = serde_json::from_str(&text)
            .map_err(|error| format!("Agent 模型列表格式错误：{}", error))?;
        let values = parsed
            .get("data")
            .and_then(Value::as_array)
            .or_else(|| parsed.as_array())
            .ok_or_else(|| "Agent 模型列表缺少 data 数组".to_string())?;
        let mut models: Vec<String> = values
            .iter()
            .filter_map(|value| {
                value
                    .get("id")
                    .or_else(|| value.get("name"))
                    .and_then(Value::as_str)
            })
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .collect();
        models.sort();
        models.dedup();
        Ok(models)
    })
    .await
    .map_err(|error| format!("Agent 模型列表后台任务失败：{}", error))?
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexStatus {
    installed: bool,
    running: bool,
    authenticated: bool,
    managed: bool,
    install_available: bool,
    managed_version: String,
    executable: String,
    version: String,
    auth_detail: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CodexInstallProgress {
    stage: String,
    message: String,
    loaded: u64,
    total: u64,
    progress: f64,
}

fn managed_codex_dir(app_handle: &tauri::AppHandle) -> PathBuf {
    crate::get_user_data_dir(app_handle)
        .join("agent")
        .join("codex")
        .join(MANAGED_CODEX_VERSION)
}

fn managed_codex_executable(app_handle: &tauri::AppHandle) -> PathBuf {
    managed_codex_dir(app_handle).join("codex.exe")
}

fn is_default_codex_executable(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "" | "codex" | "managed"
    )
}

fn resolve_codex_executable(app_handle: &tauri::AppHandle, configured: &str) -> String {
    if !is_default_codex_executable(configured) {
        return configured.trim().to_string();
    }
    let managed = managed_codex_executable(app_handle);
    if managed.is_file() && codex_version(&managed.to_string_lossy()).is_ok() {
        return managed.to_string_lossy().to_string();
    }
    if codex_version("codex").is_ok() {
        return "codex".to_string();
    }
    managed.to_string_lossy().to_string()
}

fn is_managed_codex_path(app_handle: &tauri::AppHandle, executable: &str) -> bool {
    let managed = managed_codex_executable(app_handle);
    fs::canonicalize(executable)
        .ok()
        .zip(fs::canonicalize(managed).ok())
        .is_some_and(|(left, right)| left == right)
}

fn emit_codex_install_progress(
    app_handle: &tauri::AppHandle,
    stage: &str,
    message: &str,
    loaded: u64,
    total: u64,
) {
    let progress = if total > 0 {
        (loaded as f64 / total as f64 * 100.0).clamp(0.0, 100.0)
    } else {
        0.0
    };
    let _ = app_handle.emit(
        "agent-codex-install-progress",
        CodexInstallProgress {
            stage: stage.to_string(),
            message: message.to_string(),
            loaded,
            total,
            progress,
        },
    );
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|error| error.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 1024 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex::encode(hasher.finalize()))
}

fn install_managed_codex(app_handle: &tauri::AppHandle) -> Result<String, String> {
    #[cfg(not(all(target_os = "windows", target_arch = "x86_64")))]
    {
        let _ = app_handle;
        return Err("当前版本只支持在 Windows x64 自动安装 Codex".to_string());
    }

    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        let install_dir = managed_codex_dir(app_handle);
        fs::create_dir_all(&install_dir).map_err(|error| error.to_string())?;
        let executable = managed_codex_executable(app_handle);
        if executable.is_file() && codex_version(&executable.to_string_lossy()).is_ok() {
            emit_codex_install_progress(app_handle, "ready", "Codex 已就绪", 1, 1);
            return Ok(executable.to_string_lossy().to_string());
        }

        let archive_path = install_dir.join("codex-download.zip");
        let archive_tmp_path = install_dir.join("codex-download.zip.tmp");
        let _ = fs::remove_file(&archive_tmp_path);

        emit_codex_install_progress(
            app_handle,
            "downloading",
            "正在下载官方 Codex 运行时",
            0,
            MANAGED_CODEX_WINDOWS_X64_ZIP_SIZE,
        );
        let client = crate::build_http_client(Some(app_handle), None, 1800)?;
        let mut response = client
            .get(MANAGED_CODEX_WINDOWS_X64_URL)
            .send()
            .map_err(|error| format!("下载 Codex 失败：{}", error))?;
        if !response.status().is_success() {
            return Err(format!("下载 Codex 失败，HTTP {}", response.status()));
        }
        let total = response
            .content_length()
            .unwrap_or(MANAGED_CODEX_WINDOWS_X64_ZIP_SIZE)
            .max(1);
        let mut output = File::create(&archive_tmp_path).map_err(|error| error.to_string())?;
        let mut loaded = 0_u64;
        let mut buffer = vec![0_u8; 256 * 1024];
        loop {
            let read = response
                .read(&mut buffer)
                .map_err(|error| format!("读取 Codex 下载数据失败：{}", error))?;
            if read == 0 {
                break;
            }
            output
                .write_all(&buffer[..read])
                .map_err(|error| format!("写入 Codex 下载文件失败：{}", error))?;
            loaded += read as u64;
            emit_codex_install_progress(
                app_handle,
                "downloading",
                "正在下载官方 Codex 运行时",
                loaded,
                total,
            );
        }
        output.flush().map_err(|error| error.to_string())?;
        drop(output);
        fs::rename(&archive_tmp_path, &archive_path).map_err(|error| error.to_string())?;

        emit_codex_install_progress(app_handle, "verifying", "正在校验 Codex", loaded, total);
        let digest = sha256_file(&archive_path)?;
        if !digest.eq_ignore_ascii_case(MANAGED_CODEX_WINDOWS_X64_SHA256) {
            let _ = fs::remove_file(&archive_path);
            return Err(format!(
                "Codex 下载校验失败：期望 {}，实际 {}",
                MANAGED_CODEX_WINDOWS_X64_SHA256, digest
            ));
        }

        emit_codex_install_progress(app_handle, "extracting", "正在解压 Codex", loaded, total);
        let archive_file = File::open(&archive_path).map_err(|error| error.to_string())?;
        let mut archive = zip::ZipArchive::new(archive_file)
            .map_err(|error| format!("打开 Codex 压缩包失败：{}", error))?;
        let mut extracted_main = false;
        for index in 0..archive.len() {
            let mut entry = archive
                .by_index(index)
                .map_err(|error| format!("读取 Codex 压缩包失败：{}", error))?;
            let file_name = entry
                .enclosed_name()
                .and_then(|path| {
                    path.file_name()
                        .and_then(|value| value.to_str())
                        .map(str::to_string)
                })
                .unwrap_or_default()
                .to_ascii_lowercase();
            let target_name = match file_name.as_str() {
                "codex-x86_64-pc-windows-msvc.exe" | "codex.exe" => "codex.exe",
                "codex-command-runner.exe" => "codex-command-runner.exe",
                "codex-windows-sandbox-setup.exe" => "codex-windows-sandbox-setup.exe",
                _ => continue,
            };
            let target = install_dir.join(target_name);
            let target_tmp = install_dir.join(format!("{}.tmp", target_name));
            let _ = fs::remove_file(&target_tmp);
            let mut target_file = File::create(&target_tmp).map_err(|error| error.to_string())?;
            std::io::copy(&mut entry, &mut target_file)
                .map_err(|error| format!("解压 Codex 失败：{}", error))?;
            target_file.flush().map_err(|error| error.to_string())?;
            drop(target_file);
            if target.exists() {
                let _ = fs::remove_file(&target);
            }
            fs::rename(&target_tmp, &target).map_err(|error| error.to_string())?;
            if target_name == "codex.exe" {
                extracted_main = true;
            }
        }
        if !extracted_main {
            return Err("Codex 压缩包里没有找到可执行文件".to_string());
        }
        let _ = fs::remove_file(&archive_path);

        codex_version(&executable.to_string_lossy())?;
        emit_codex_install_progress(app_handle, "ready", "Codex 安装完成", total, total);
        Ok(executable.to_string_lossy().to_string())
    }
}

#[cfg(target_os = "windows")]
fn hide_console(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(target_os = "windows"))]
fn hide_console(_command: &mut Command) {}

fn command_output(executable: &str, args: &[&str]) -> Result<std::process::Output, String> {
    let mut command = Command::new(executable);
    hide_console(&mut command);
    command
        .args(args)
        .output()
        .map_err(|error| format!("无法运行 {}：{}", executable, error))
}

fn codex_version(executable: &str) -> Result<String, String> {
    let output = command_output(executable, &["--version"])?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn inspect_codex_status(executable: String, running: bool, managed: bool) -> CodexStatus {
    let version = match codex_version(&executable) {
        Ok(version) => version,
        Err(_) => {
            return CodexStatus {
                installed: false,
                running: false,
                authenticated: false,
                managed: false,
                install_available: cfg!(all(target_os = "windows", target_arch = "x86_64")),
                managed_version: MANAGED_CODEX_VERSION.to_string(),
                executable,
                version: String::new(),
                auth_detail: "尚未安装 Codex 运行时".to_string(),
            }
        }
    };
    let output = command_output(&executable, &["login", "status"]);
    let (authenticated, detail) = match output {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            (
                output.status.success(),
                if stdout.is_empty() { stderr } else { stdout },
            )
        }
        Err(error) => (false, error),
    };
    CodexStatus {
        installed: true,
        running,
        authenticated,
        managed,
        install_available: cfg!(all(target_os = "windows", target_arch = "x86_64")),
        managed_version: MANAGED_CODEX_VERSION.to_string(),
        executable,
        version,
        auth_detail: detail,
    }
}

#[tauri::command]
pub async fn agent_codex_status(
    app_handle: tauri::AppHandle,
    state: State<'_, AgentRuntimeState>,
) -> Result<CodexStatus, String> {
    let settings = read_settings(&app_handle);
    let running = state
        .codex
        .lock()
        .ok()
        .and_then(|runtime| runtime.as_ref().map(CodexRuntime::is_running))
        .unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || {
        let executable = resolve_codex_executable(&app_handle, &settings.codex_executable);
        let managed = is_managed_codex_path(&app_handle, &executable);
        Ok(inspect_codex_status(executable, running, managed))
    })
    .await
    .map_err(|error| format!("检查 Codex 状态失败：{}", error))?
}

#[tauri::command]
pub async fn agent_install_codex(
    app_handle: tauri::AppHandle,
    state: State<'_, AgentRuntimeState>,
) -> Result<CodexStatus, String> {
    let running = state
        .codex
        .lock()
        .ok()
        .and_then(|runtime| runtime.as_ref().map(CodexRuntime::is_running))
        .unwrap_or(false);
    tauri::async_runtime::spawn_blocking(move || {
        let executable = install_managed_codex(&app_handle)?;
        Ok(inspect_codex_status(executable, running, true))
    })
    .await
    .map_err(|error| format!("安装 Codex 后台任务失败：{}", error))?
}

#[tauri::command]
pub fn agent_open_auth_url(url: String) -> Result<(), String> {
    let normalized = url.trim();
    if !normalized.starts_with("https://") {
        return Err("拒绝打开非 HTTPS 登录地址".to_string());
    }
    open::that(normalized).map_err(|error| format!("打开登录页面失败：{}", error))
}

fn response_id_key(value: &Value) -> Option<String> {
    value.get("id").and_then(|id| match id {
        Value::String(value) => Some(value.clone()),
        Value::Number(value) => Some(value.to_string()),
        _ => None,
    })
}

fn spawn_codex_runtime(
    app_handle: &tauri::AppHandle,
    executable: &str,
) -> Result<CodexRuntime, String> {
    let version = codex_version(executable)?;
    let mut command = Command::new(executable);
    hide_console(&mut command);
    let mut child = command
        .args(["app-server", "--listen", "stdio://"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("启动 Codex App Server 失败：{}", error))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Codex App Server 没有 stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Codex App Server 没有 stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Codex App Server 没有 stderr".to_string())?;
    let pending = Arc::new(Mutex::new(HashMap::<String, mpsc::Sender<Value>>::new()));
    let pending_reader = Arc::clone(&pending);
    let stdout_app = app_handle.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let Ok(line) = line else { break };
            let Ok(message) = serde_json::from_str::<Value>(&line) else {
                let _ = stdout_app.emit(
                    "agent-codex-log",
                    json!({ "stream": "stdout", "text": line }),
                );
                continue;
            };
            let mut delivered = false;
            if message.get("method").is_none() {
                if let Some(key) = response_id_key(&message) {
                    if let Ok(mut values) = pending_reader.lock() {
                        if let Some(sender) = values.remove(&key) {
                            let _ = sender.send(message.clone());
                            delivered = true;
                        }
                    }
                }
            }
            if !delivered || message.get("method").is_some() {
                let _ = stdout_app.emit("agent-codex-message", message);
            }
        }
        if let Ok(mut values) = pending_reader.lock() {
            values.clear();
        }
        let _ = stdout_app.emit(
            "agent-codex-process",
            json!({ "running": false, "reason": "Codex App Server 已退出" }),
        );
    });
    let stderr_app = app_handle.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().map_while(Result::ok) {
            let _ = stderr_app.emit(
                "agent-codex-log",
                json!({ "stream": "stderr", "text": line }),
            );
        }
    });

    Ok(CodexRuntime {
        child: Arc::new(Mutex::new(child)),
        stdin: Arc::new(Mutex::new(stdin)),
        pending,
        next_id: Arc::new(AtomicU64::new(1)),
        executable: executable.to_string(),
        version,
    })
}

#[tauri::command]
pub async fn agent_codex_start(
    app_handle: tauri::AppHandle,
    state: State<'_, AgentRuntimeState>,
) -> Result<CodexStatus, String> {
    let settings = read_settings(&app_handle);
    let executable = resolve_codex_executable(&app_handle, &settings.codex_executable);
    let managed = is_managed_codex_path(&app_handle, &executable);
    let existing = state
        .codex
        .lock()
        .map_err(|_| "Codex runtime lock poisoned".to_string())?
        .clone();
    let runtime = if let Some(runtime) = existing
        .as_ref()
        .filter(|runtime| runtime.is_running() && runtime.executable == executable)
        .cloned()
    {
        runtime
    } else {
        if let Some(runtime) = existing {
            runtime.stop();
        }
        let runtime = spawn_codex_runtime(&app_handle, &executable).map_err(|error| {
            if is_default_codex_executable(&settings.codex_executable) {
                format!("{}。请先安装 Codex 运行时", error)
            } else {
                error
            }
        })?;
        *state
            .codex
            .lock()
            .map_err(|_| "Codex runtime lock poisoned".to_string())? = Some(runtime.clone());
        let initialize = runtime.clone();
        let init_result = tauri::async_runtime::spawn_blocking(move || {
            initialize.request(
                "initialize",
                json!({
                    "clientInfo": {
                        "name": "inspiration_drawer",
                        "title": "Inspiration Drawer",
                        "version": "4.2.5"
                    }
                }),
                Duration::from_secs(20),
            )
        })
        .await
        .map_err(|error| format!("初始化 Codex App Server 失败：{}", error))??;
        let _ = init_result;
        runtime.write_message(&json!({ "method": "initialized", "params": {} }))?;
        let _ = app_handle.emit(
            "agent-codex-process",
            json!({ "running": true, "version": runtime.version }),
        );
        runtime
    };

    let account_runtime = runtime.clone();
    let account = tauri::async_runtime::spawn_blocking(move || {
        account_runtime.request(
            "account/read",
            json!({ "refreshToken": false }),
            Duration::from_secs(15),
        )
    })
    .await
    .ok()
    .and_then(Result::ok)
    .unwrap_or(Value::Null);
    let authenticated = account.get("account").is_some_and(|value| !value.is_null());
    let auth_detail = account
        .pointer("/account/email")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| {
            account
                .pointer("/account/type")
                .and_then(Value::as_str)
                .unwrap_or("未登录")
                .to_string()
        });
    Ok(CodexStatus {
        installed: true,
        running: runtime.is_running(),
        authenticated,
        managed,
        install_available: cfg!(all(target_os = "windows", target_arch = "x86_64")),
        managed_version: MANAGED_CODEX_VERSION.to_string(),
        executable: runtime.executable,
        version: runtime.version,
        auth_detail,
    })
}

#[tauri::command]
pub async fn agent_codex_request(
    state: State<'_, AgentRuntimeState>,
    method: String,
    params: Value,
) -> Result<Value, String> {
    let runtime = state
        .codex
        .lock()
        .map_err(|_| "Codex runtime lock poisoned".to_string())?
        .clone()
        .filter(CodexRuntime::is_running)
        .ok_or_else(|| "Codex App Server 尚未启动".to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        runtime.request(&method, params, Duration::from_secs(CODEX_RPC_TIMEOUT_SECS))
    })
    .await
    .map_err(|error| format!("Codex RPC 后台任务失败：{}", error))?
}

#[tauri::command]
pub fn agent_codex_respond(
    state: State<'_, AgentRuntimeState>,
    id: Value,
    result: Value,
) -> Result<(), String> {
    let runtime = state
        .codex
        .lock()
        .map_err(|_| "Codex runtime lock poisoned".to_string())?
        .clone()
        .filter(CodexRuntime::is_running)
        .ok_or_else(|| "Codex App Server 尚未启动".to_string())?;
    runtime.write_message(&json!({ "id": id, "result": result }))
}

#[tauri::command]
pub fn agent_codex_stop(state: State<'_, AgentRuntimeState>) -> Result<(), String> {
    if let Some(runtime) = state
        .codex
        .lock()
        .map_err(|_| "Codex runtime lock poisoned".to_string())?
        .take()
    {
        runtime.stop();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_openai_compatible_urls_without_duplicate_suffixes() {
        assert_eq!(
            chat_completions_url("https://api.example.com/v1").unwrap(),
            "https://api.example.com/v1/chat/completions"
        );
        assert_eq!(
            chat_completions_url("https://api.example.com/v1/chat/completions").unwrap(),
            "https://api.example.com/v1/chat/completions"
        );
        assert_eq!(
            models_url("https://api.example.com/v1/").unwrap(),
            "https://api.example.com/v1/models"
        );
    }

    #[test]
    fn public_settings_never_include_the_api_key() {
        let mut stored = AgentSettingsStored::default();
        stored.api_key = "secret-key".to_string();
        let public = AgentSettingsPublic::from(&stored);
        let serialized = serde_json::to_string(&public).unwrap();
        assert!(public.has_api_key);
        assert!(!serialized.contains("secret-key"));
        assert!(!serialized.contains("apiKey"));
    }

    #[test]
    fn dangerous_agent_values_are_normalized() {
        assert_eq!(normalize_provider("unknown"), "openai-compatible");
        assert_eq!(normalize_sandbox("unknown"), "read-only");
        assert_eq!(normalize_approval_policy("unknown"), "on-request");
    }

    #[test]
    fn codex_model_overrides_default_for_lite_incompatible_values() {
        assert_eq!(normalize_codex_model(""), "");
        assert_eq!(normalize_codex_model("default"), "");
        assert_eq!(normalize_codex_model("5.5"), "");
        assert_eq!(normalize_codex_model("gpt-5.5"), "");
        assert_eq!(normalize_codex_model("5.4"), "gpt-5.4");
        assert_eq!(normalize_codex_model("codex-spark"), "gpt-5.3-codex-spark");
    }
}
