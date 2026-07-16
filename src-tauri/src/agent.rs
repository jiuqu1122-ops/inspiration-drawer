use reqwest::header::CONTENT_TYPE;
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

use crate::ai_credentials::{
    resolve_effective_api_profile, EffectiveApiProfile, StoredApiSettings,
};
use crate::ai_gateway::{self, ApiBalanceResult};
use crate::license::types::AiGatewayKind;

const AGENT_SETTINGS_FILE: &str = "agent_config.json";
const CONFIGURED_HEADER_VALUE: &str = "[configured]";
const CODEX_RPC_TIMEOUT_SECS: u64 = 45;
const CODEX_API_KEY_ENV: &str = "LINGGAN_CODEX_API_KEY";
const MANAGED_CODEX_VERSION: &str = "0.142.5";
const MANAGED_CODEX_WINDOWS_X64_URL: &str = "https://github.com/openai/codex/releases/download/rust-v0.142.5/codex-x86_64-pc-windows-msvc.exe.zip";
const MANAGED_CODEX_WINDOWS_X64_SHA256: &str =
    "9d344a41dc15408bb2cc3ed3782cde33e7b4fd4a7016b5838dfeffaf1f6e6c0d";
const MANAGED_CODEX_WINDOWS_X64_ZIP_SIZE: u64 = 109_265_503;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum CodexRuntimeMode {
    Chatgpt,
    Api,
}

impl CodexRuntimeMode {
    fn from_provider(provider: &str) -> Self {
        if provider.trim().eq_ignore_ascii_case("codex") {
            Self::Chatgpt
        } else {
            Self::Api
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Chatgpt => "chatgpt",
            Self::Api => "api",
        }
    }

    fn home_dir_name(self) -> &'static str {
        match self {
            Self::Chatgpt => "chatgpt",
            Self::Api => "api-runtime",
        }
    }
}

#[derive(Clone, Debug)]
struct CodexRuntimeProfile {
    mode: CodexRuntimeMode,
    codex_home: PathBuf,
    api_key: Option<String>,
    api_base_url: Option<String>,
    api_key_configured: bool,
    profile_key: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentSettingsStored {
    provider: String,
    #[serde(default)]
    api_gateway_kind: Option<AiGatewayKind>,
    #[serde(default)]
    api_provider: String,
    api_base_url: String,
    api_key: String,
    api_model: String,
    #[serde(default)]
    api_headers: BTreeMap<String, String>,
    codex_executable: String,
    codex_model: String,
    #[serde(default)]
    codex_reasoning_effort: String,
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
            api_gateway_kind: Some(AiGatewayKind::Custom),
            api_provider: "unmind-wallet".to_string(),
            api_base_url: "https://api.unmind.art/v1".to_string(),
            api_key: String::new(),
            api_model: "unmind-agent".to_string(),
            api_headers: BTreeMap::new(),
            codex_executable: "codex".to_string(),
            codex_model: String::new(),
            codex_reasoning_effort: String::new(),
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
    api_gateway_kind: AiGatewayKind,
    api_provider: String,
    api_base_url: String,
    api_model: String,
    api_headers: BTreeMap<String, String>,
    has_api_key: bool,
    api_editable: bool,
    api_credential_source: String,
    api_key_last4: Option<String>,
    api_error: Option<String>,
    codex_executable: String,
    codex_model: String,
    codex_reasoning_effort: String,
    codex_sandbox: String,
    codex_approval_policy: String,
    system_prompt: String,
    approval_mode: String,
    retain_history: bool,
}

impl From<&AgentSettingsStored> for AgentSettingsPublic {
    fn from(value: &AgentSettingsStored) -> Self {
        Self {
            provider: normalize_provider(&value.provider),
            api_gateway_kind: value.api_gateway_kind.unwrap_or_else(|| {
                AiGatewayKind::infer(
                    stored_api_provider(value),
                    &value.api_base_url,
                    &value.api_headers,
                )
            }),
            api_provider: stored_api_provider(value).to_string(),
            api_base_url: crate::ai_gateway::endpoint::redact_api_base_url(&value.api_base_url),
            api_model: normalize_api_model(&value.api_model),
            api_headers: value
                .api_headers
                .keys()
                .map(|key| (key.clone(), CONFIGURED_HEADER_VALUE.to_string()))
                .collect(),
            has_api_key: !value.api_key.trim().is_empty(),
            api_editable: true,
            api_credential_source: "user_settings".to_string(),
            api_key_last4: crate::ai_credentials::api_key_last4(&value.api_key),
            api_error: None,
            codex_executable: value.codex_executable.clone(),
            codex_model: normalize_codex_model(&value.codex_model),
            codex_reasoning_effort: normalize_codex_reasoning_effort(&value.codex_reasoning_effort),
            codex_sandbox: value.codex_sandbox.clone(),
            codex_approval_policy: value.codex_approval_policy.clone(),
            system_prompt: value.system_prompt.clone(),
            approval_mode: value.approval_mode.clone(),
            retain_history: value.retain_history,
        }
    }
}

fn public_settings_from_stored(
    app_handle: &tauri::AppHandle,
    settings: &AgentSettingsStored,
) -> AgentSettingsPublic {
    let mut public = AgentSettingsPublic::from(settings);
    match resolve_agent_api_profile(app_handle, settings) {
        Ok(profile) => {
            public.api_gateway_kind = profile.gateway_kind;
            public.api_provider = profile.provider.clone();
            if !profile.editable {
                public.provider = "openai-compatible".to_string();
                public.api_base_url =
                    crate::ai_gateway::endpoint::redact_api_base_url(&profile.base_url);
                public.api_model = normalize_api_model(&profile.model);
                public.api_headers.clear();
                public.has_api_key = !profile.api_key.trim().is_empty();
            }
            public.api_editable = profile.editable;
            public.api_credential_source = profile.source;
            public.api_key_last4 = profile.key_last4;
            public.api_error = None;
        }
        Err(error) => {
            public.provider = "openai-compatible".to_string();
            public.api_gateway_kind = AiGatewayKind::OpenAiCompatible;
            public.api_provider = "openai-compatible".to_string();
            public.has_api_key = false;
            public.api_editable = false;
            public.api_credential_source = "license_managed_error".to_string();
            public.api_key_last4 = None;
            public.api_error = Some(error);
        }
    }
    if normalize_provider(&settings.provider) == "openai-compatible"
        && stored_api_provider(settings).eq_ignore_ascii_case("unmind-wallet")
    {
        public.api_gateway_kind = AiGatewayKind::Custom;
        public.api_provider = "unmind-wallet".to_string();
        public.api_base_url = "https://api.unmind.art/v1".to_string();
        public.api_model = "unmind-agent".to_string();
        public.api_headers.clear();
        public.has_api_key = true;
        public.api_editable = false;
        public.api_credential_source = "cloud_wallet".to_string();
        public.api_key_last4 = None;
        public.api_error = None;
    }
    public
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentSettingsInput {
    provider: String,
    #[serde(default)]
    api_gateway_kind: Option<AiGatewayKind>,
    #[serde(default)]
    api_provider: String,
    api_base_url: String,
    api_key: Option<String>,
    #[serde(default)]
    clear_api_key: bool,
    api_model: String,
    #[serde(default)]
    api_headers: BTreeMap<String, String>,
    codex_executable: String,
    codex_model: String,
    #[serde(default)]
    codex_reasoning_effort: String,
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
    mode: CodexRuntimeMode,
    codex_home: PathBuf,
    profile_key: String,
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

fn get_codex_home(app_handle: &tauri::AppHandle, mode: CodexRuntimeMode) -> PathBuf {
    crate::get_user_data_dir(app_handle)
        .join("codex")
        .join(mode.home_dir_name())
}

fn normalize_base_url(base_url: &str) -> Result<String, String> {
    crate::ai_gateway::endpoint::normalize_api_base_url(base_url)
}

fn escape_toml_string(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

fn build_codex_runtime_config(profile: &EffectiveApiProfile) -> Result<String, String> {
    let model = normalize_api_model(&profile.model);
    if model.is_empty() {
        return Err("自定义 API 模式需要填写模型名".to_string());
    }
    let base_url = ai_gateway::router::codex_v1_base_url(profile)?;
    let mut lines = vec![
        format!("model = \"{}\"", escape_toml_string(&model)),
        "model_provider = \"custom\"".to_string(),
        String::new(),
        "approval_policy = \"on-request\"".to_string(),
        "sandbox_mode = \"workspace-write\"".to_string(),
        "model_reasoning_effort = \"medium\"".to_string(),
        String::new(),
        "[model_providers.custom]".to_string(),
        "name = \"Custom API\"".to_string(),
        format!("base_url = \"{}\"", escape_toml_string(&base_url)),
        format!("env_key = \"{}\"", CODEX_API_KEY_ENV),
        "wire_api = \"responses\"".to_string(),
    ];
    if !profile.headers.is_empty() {
        let headers = profile
            .headers
            .iter()
            .map(|(key, value)| {
                format!(
                    "\"{}\" = \"{}\"",
                    escape_toml_string(key),
                    escape_toml_string(value)
                )
            })
            .collect::<Vec<_>>()
            .join(", ");
        lines.push(format!("http_headers = {{ {} }}", headers));
    }
    lines.push(String::new());
    Ok(lines.join("\n"))
}

fn write_codex_runtime_config(
    app_handle: &tauri::AppHandle,
    profile: &EffectiveApiProfile,
) -> Result<PathBuf, String> {
    let codex_home = get_codex_home(app_handle, CodexRuntimeMode::Api);
    fs::create_dir_all(&codex_home)
        .map_err(|error| format!("创建自定义 API CODEX_HOME 失败：{}", error))?;
    let path = codex_home.join("config.toml");
    fs::write(&path, build_codex_runtime_config(profile)?)
        .map_err(|error| format!("写入自定义 API Codex 配置失败：{}", error))?;
    Ok(path)
}

fn stored_api_settings(settings: &AgentSettingsStored) -> StoredApiSettings {
    StoredApiSettings {
        gateway_kind: settings.api_gateway_kind,
        provider: stored_api_provider(settings).to_string(),
        base_url: settings.api_base_url.clone(),
        api_key: settings.api_key.clone(),
        model: settings.api_model.clone(),
        headers: settings.api_headers.clone(),
    }
}

fn stored_api_provider(settings: &AgentSettingsStored) -> &str {
    let configured = settings.api_provider.trim();
    if !configured.is_empty() {
        return configured;
    }
    let legacy = settings.provider.trim();
    if !legacy.is_empty() && !matches!(legacy, "codex" | "openai-compatible") {
        legacy
    } else {
        "openai-compatible"
    }
}

fn normalize_api_provider(value: &str, gateway_kind: AiGatewayKind) -> String {
    let value = value.trim();
    if !value.is_empty() {
        return value.to_string();
    }
    match gateway_kind {
        AiGatewayKind::NewApi => "new-api".to_string(),
        AiGatewayKind::Xais => "xais-chat".to_string(),
        AiGatewayKind::OpenAiCompatible => "openai-compatible".to_string(),
        AiGatewayKind::Custom => "custom".to_string(),
    }
}

fn resolve_agent_api_profile(
    app_handle: &tauri::AppHandle,
    settings: &AgentSettingsStored,
) -> Result<EffectiveApiProfile, String> {
    resolve_effective_api_profile(app_handle, stored_api_settings(settings))
}

pub fn resolve_current_agent_api_profile(
    app_handle: &tauri::AppHandle,
) -> Result<EffectiveApiProfile, String> {
    let settings = read_settings(app_handle);
    resolve_agent_api_profile(app_handle, &settings)
}

fn build_codex_runtime_profile(
    app_handle: &tauri::AppHandle,
    settings: &AgentSettingsStored,
    prepare: bool,
) -> Result<CodexRuntimeProfile, String> {
    let api_profile = resolve_agent_api_profile(app_handle, settings)?;
    let mode = if normalize_provider(&settings.provider) == "codex" {
        CodexRuntimeMode::Chatgpt
    } else {
        CodexRuntimeMode::Api
    };
    let codex_home = get_codex_home(app_handle, mode);
    fs::create_dir_all(&codex_home)
        .map_err(|error| format!("创建 Codex 运行目录失败：{}", error))?;
    let api_key = if mode == CodexRuntimeMode::Api {
        if prepare {
            if api_profile.api_key.trim().is_empty() {
                return Err("自定义 API 模式尚未配置 API Key".to_string());
            }
            write_codex_runtime_config(app_handle, &api_profile)?;
        }
        Some(api_profile.api_key.trim().to_string())
    } else {
        None
    };
    let mut hasher = Sha256::new();
    hasher.update(mode.as_str().as_bytes());
    hasher.update(codex_home.to_string_lossy().as_bytes());
    if mode == CodexRuntimeMode::Api {
        hasher.update(api_profile.base_url.as_bytes());
        hasher.update(api_profile.model.as_bytes());
        hasher.update(api_profile.api_key.as_bytes());
        for (key, value) in &api_profile.headers {
            hasher.update(key.as_bytes());
            hasher.update(value.as_bytes());
        }
    }
    Ok(CodexRuntimeProfile {
        mode,
        codex_home,
        api_key,
        api_base_url: (mode == CodexRuntimeMode::Api).then(|| api_profile.base_url.clone()),
        api_key_configured: mode == CodexRuntimeMode::Api && !api_profile.api_key.trim().is_empty(),
        profile_key: hex::encode(hasher.finalize()),
    })
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
        "auto" | "default" | "recommended" | "codex" => String::new(),
        "5.5" | "gpt5.5" => "gpt-5.5".to_string(),
        "5.4" | "gpt5.4" => "gpt-5.4".to_string(),
        "5.4-mini" | "gpt5.4-mini" => "gpt-5.4-mini".to_string(),
        "spark" | "codex-spark" => "gpt-5.3-codex-spark".to_string(),
        _ => trimmed.to_string(),
    }
}

fn normalize_api_model(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let normalized = trimmed
        .to_ascii_lowercase()
        .replace(char::is_whitespace, "");
    match normalized.as_str() {
        "5.5" | "gpt5.5" => "gpt-5.5".to_string(),
        "5.4" | "gpt5.4" => "gpt-5.4".to_string(),
        "5.4-mini" | "gpt5.4-mini" => "gpt-5.4-mini".to_string(),
        "4.1" | "gpt4.1" => "gpt-4.1".to_string(),
        "4.1-mini" | "gpt4.1-mini" => "gpt-4.1-mini".to_string(),
        "4.1-nano" | "gpt4.1-nano" => "gpt-4.1-nano".to_string(),
        _ => trimmed.to_string(),
    }
}

fn normalize_codex_reasoning_effort(value: &str) -> String {
    match value.trim().to_ascii_lowercase().as_str() {
        "minimal" => "minimal".to_string(),
        "low" => "low".to_string(),
        "medium" => "medium".to_string(),
        "high" => "high".to_string(),
        "xhigh" => "xhigh".to_string(),
        _ => String::new(),
    }
}

fn sanitize_api_headers(headers: BTreeMap<String, String>) -> BTreeMap<String, String> {
    headers
        .into_iter()
        .filter_map(|(key, value)| {
            let key = key.trim().to_string();
            let value = value.trim().to_string();
            (!key.is_empty() && !value.is_empty()).then_some((key, value))
        })
        .collect()
}

fn merge_api_headers(
    current: &BTreeMap<String, String>,
    headers: BTreeMap<String, String>,
) -> BTreeMap<String, String> {
    sanitize_api_headers(headers)
        .into_iter()
        .filter_map(|(key, value)| {
            if value == CONFIGURED_HEADER_VALUE {
                current.get(&key).cloned().map(|value| (key, value))
            } else {
                Some((key, value))
            }
        })
        .collect()
}

fn merge_api_base_url(current: &str, input: &str) -> Result<String, String> {
    let input = input.trim();
    if input == crate::ai_gateway::endpoint::redact_api_base_url(current) {
        return Ok(current.trim().trim_end_matches('/').to_string());
    }
    crate::ai_gateway::endpoint::normalize_api_root_url(input)
}

fn input_changes_managed_api(profile: &EffectiveApiProfile, input: &AgentSettingsInput) -> bool {
    if input.clear_api_key
        || input
            .api_key
            .as_ref()
            .is_some_and(|value| !value.trim().is_empty())
    {
        return true;
    }
    let input_gateway = input.api_gateway_kind.unwrap_or(profile.gateway_kind);
    let input_base = input.api_base_url.trim().trim_end_matches('/');
    let profile_base = profile.base_url.trim().trim_end_matches('/');
    let redacted_base = crate::ai_gateway::endpoint::redact_api_base_url(profile_base);
    input_gateway != profile.gateway_kind
        || normalize_api_provider(&input.api_provider, input_gateway) != profile.provider
        || (input_base != profile_base && input_base != redacted_base)
        || normalize_api_model(&input.api_model) != normalize_api_model(&profile.model)
        || (!input.api_headers.is_empty()
            && sanitize_api_headers(input.api_headers.clone()) != profile.headers)
}

fn input_changes_stored_api(current: &AgentSettingsStored, input: &AgentSettingsInput) -> bool {
    if input.clear_api_key
        || input
            .api_key
            .as_ref()
            .is_some_and(|value| !value.trim().is_empty())
    {
        return true;
    }
    normalize_provider(&input.provider) != normalize_provider(&current.provider)
        || input.api_gateway_kind != current.api_gateway_kind
        || normalize_api_provider(
            &input.api_provider,
            input.api_gateway_kind.unwrap_or_default(),
        ) != stored_api_provider(current)
        || merge_api_base_url(&current.api_base_url, &input.api_base_url)
            .map(|value| value != current.api_base_url.trim().trim_end_matches('/'))
            .unwrap_or(true)
        || normalize_api_model(&input.api_model) != normalize_api_model(&current.api_model)
        || merge_api_headers(&current.api_headers, input.api_headers.clone()) != current.api_headers
}

#[tauri::command]
pub fn agent_load_settings(app_handle: tauri::AppHandle) -> AgentSettingsPublic {
    let mut settings = read_settings(&app_handle);
    if normalize_provider(&settings.provider) == "openai-compatible"
        && !stored_api_provider(&settings).eq_ignore_ascii_case("unmind-wallet")
    {
        settings.api_gateway_kind = Some(AiGatewayKind::Custom);
        settings.api_provider = "unmind-wallet".to_string();
        settings.api_base_url = "https://api.unmind.art/v1".to_string();
        settings.api_model = "unmind-agent".to_string();
        settings.api_headers.clear();
        let _ = write_settings(&app_handle, &settings);
    }
    public_settings_from_stored(&app_handle, &settings)
}

#[tauri::command]
pub fn agent_save_settings(
    app_handle: tauri::AppHandle,
    input: AgentSettingsInput,
) -> Result<AgentSettingsPublic, String> {
    let mut current = read_settings(&app_handle);
    let resolved_profile = resolve_agent_api_profile(&app_handle, &current);
    if let Some(profile) = resolved_profile
        .as_ref()
        .ok()
        .filter(|profile| !profile.editable)
    {
        if input_changes_managed_api(profile, &input) {
            return Err(
                "高级版授权已托管 Agent API，不能修改 Gateway、Provider、Base URL、API Key、模型或 Headers"
                    .to_string(),
            );
        }
        if normalize_provider(&input.provider) != "openai-compatible" {
            return Err("高级版必须使用设备授权中的托管 Agent API".to_string());
        }
        current.provider = "openai-compatible".to_string();
    } else if let Err(error) = &resolved_profile {
        if error.contains("不能回退") && input_changes_stored_api(&current, &input) {
            return Err("高级版授权当前无效，不能修改 Agent API 设置或回退到 BYOK".to_string());
        }
    } else {
        current.provider = normalize_provider(&input.provider);
        let gateway_kind = input.api_gateway_kind.unwrap_or_else(|| {
            AiGatewayKind::infer(&input.api_provider, &input.api_base_url, &input.api_headers)
        });
        current.api_gateway_kind = Some(gateway_kind);
        current.api_provider = normalize_api_provider(&input.api_provider, gateway_kind);
        current.api_base_url = merge_api_base_url(&current.api_base_url, &input.api_base_url)?;
        current.api_model = normalize_api_model(&input.api_model);
        current.api_headers = merge_api_headers(&current.api_headers, input.api_headers);
        if input.clear_api_key {
            current.api_key.clear();
        } else if let Some(api_key) = input.api_key {
            if !api_key.trim().is_empty() {
                current.api_key = api_key.trim().to_string();
            }
        }
    }
    current.codex_executable = if input.codex_executable.trim().is_empty() {
        "codex".to_string()
    } else {
        input.codex_executable.trim().to_string()
    };
    current.codex_model = normalize_codex_model(&input.codex_model);
    current.codex_reasoning_effort =
        normalize_codex_reasoning_effort(&input.codex_reasoning_effort);
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
    Ok(public_settings_from_stored(&app_handle, &current))
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

#[tauri::command]
pub async fn agent_query_api_balance(
    app_handle: tauri::AppHandle,
) -> Result<ApiBalanceResult, String> {
    let settings = read_settings(&app_handle);
    let api_profile = resolve_agent_api_profile(&app_handle, &settings)?;
    tauri::async_runtime::spawn_blocking(move || {
        let client = crate::build_http_client(Some(&app_handle), None, 90)?;
        ai_gateway::router::query_api_balance(&client, &api_profile)
    })
    .await
    .map_err(|error| format!("Agent API 余额查询后台任务失败：{}", error))?
}

#[tauri::command]
pub async fn agent_test_api_connection(
    app_handle: tauri::AppHandle,
) -> Result<ai_gateway::GatewayConnectionResult, String> {
    let settings = read_settings(&app_handle);
    let api_profile = resolve_agent_api_profile(&app_handle, &settings)?;
    tauri::async_runtime::spawn_blocking(move || {
        let client = crate::build_http_client(Some(&app_handle), None, 90)?;
        ai_gateway::router::test_connection(&client, &api_profile)
    })
    .await
    .map_err(|error| format!("Agent API 连接测试后台任务失败：{}", error))?
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

fn preview_response_text(text: &str) -> String {
    let clean = text
        .chars()
        .map(|ch| {
            if ch.is_control() && ch != '\n' && ch != '\r' && ch != '\t' {
                ' '
            } else {
                ch
            }
        })
        .collect::<String>()
        .trim()
        .to_string();
    let mut preview = clean.chars().take(800).collect::<String>();
    if clean.chars().count() > 800 {
        preview.push('…');
    }
    preview
}

fn parse_openai_sse_data(
    data: &str,
    content: &mut String,
    tool_calls: &mut BTreeMap<usize, OpenAiToolCallAccumulator>,
    finish_reason: &mut Option<String>,
    app_handle: &tauri::AppHandle,
    request_id: &str,
) -> Result<(), String> {
    let parsed: Value = serde_json::from_str(data).map_err(|error| {
        format!(
            "解析 Agent 流失败：{}；响应片段：{}",
            error,
            preview_response_text(data)
        )
    })?;
    parse_openai_response_value(
        &parsed,
        content,
        tool_calls,
        finish_reason,
        app_handle,
        request_id,
    );
    Ok(())
}

fn parse_openai_buffered_text(
    text: &str,
    content: &mut String,
    tool_calls: &mut BTreeMap<usize, OpenAiToolCallAccumulator>,
    finish_reason: &mut Option<String>,
    app_handle: &tauri::AppHandle,
    request_id: &str,
) -> Result<(), String> {
    if text
        .lines()
        .any(|line| line.trim_start().starts_with("data:"))
    {
        for line in text.lines() {
            let Some(data) = line.trim().strip_prefix("data:") else {
                continue;
            };
            let data = data.trim();
            if data.is_empty() || data == "[DONE]" {
                continue;
            }
            parse_openai_sse_data(
                data,
                content,
                tool_calls,
                finish_reason,
                app_handle,
                request_id,
            )?;
        }
        return Ok(());
    }

    let parsed: Value = serde_json::from_str(text).map_err(|error| {
        format!(
            "解析 Agent API 响应失败：{}；响应片段：{}",
            error,
            preview_response_text(text)
        )
    })?;
    parse_openai_response_value(
        &parsed,
        content,
        tool_calls,
        finish_reason,
        app_handle,
        request_id,
    );
    Ok(())
}

#[tauri::command]
pub async fn agent_openai_chat(
    app_handle: tauri::AppHandle,
    state: State<'_, AgentRuntimeState>,
    request: AgentOpenAiChatRequest,
) -> Result<AgentOpenAiChatResult, String> {
    let settings = read_settings(&app_handle);
    if stored_api_provider(&settings).eq_ignore_ascii_case("unmind-wallet") {
        return agent_wallet_chat(app_handle, request).await;
    }
    let api_profile = resolve_agent_api_profile(&app_handle, &settings)?;
    let cancellations = state.openai_cancellations.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if api_profile.api_key.trim().is_empty() {
            return Err("请先在 Agent 设置中填写 API Key".to_string());
        }
        let api_model = normalize_api_model(&api_profile.model);
        if api_model.trim().is_empty() {
            return Err("请先在 Agent 设置中填写模型".to_string());
        }
        if let Ok(mut values) = cancellations.lock() {
            values.remove(&request.request_id);
        }

        let mut body = json!({
            "model": api_model,
            "messages": request.messages,
            // 画布 Agent 依赖 tool_calls。许多 OpenAI-compatible 中转在流式模式下
            // 不完整支持工具调用增量，非流式返回的兼容性更高。
            "stream": false,
        });
        if !request.tools.is_empty() {
            body["tools"] = Value::Array(request.tools);
            body["tool_choice"] = Value::String("auto".to_string());
        }

        let client = crate::build_http_client(Some(&app_handle), None, 600)?;
        let mut request_builder = client
            .post(ai_gateway::router::endpoint_for(
                &api_profile,
                ai_gateway::GatewayOperation::ChatCompletions,
            )?)
            .bearer_auth(&api_profile.api_key)
            .header(CONTENT_TYPE, "application/json")
            .json(&body);
        request_builder = ai_gateway::router::apply_profile_headers(request_builder, &api_profile)?;
        let response = request_builder
            .send()
            .map_err(|error| format!("Agent API 请求失败：{}", error))?;
        let status = response.status();
        if !status.is_success() {
            let text = response.text().unwrap_or_default();
            return Err(format!(
                "Agent API HTTP {}：{}",
                status,
                ai_gateway::router::response_preview(&ai_gateway::router::redact_profile_secrets(
                    &text,
                    &api_profile
                ))
            ));
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
                parse_openai_sse_data(
                    data,
                    &mut content,
                    &mut tool_calls,
                    &mut finish_reason,
                    &app_handle,
                    &request.request_id,
                )?;
            }
        } else {
            let text = response
                .text()
                .map_err(|error| format!("读取 Agent API 响应失败：{}", error))?;
            parse_openai_buffered_text(
                &text,
                &mut content,
                &mut tool_calls,
                &mut finish_reason,
                &app_handle,
                &request.request_id,
            )?;
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

async fn agent_wallet_chat(
    app_handle: tauri::AppHandle,
    request: AgentOpenAiChatRequest,
) -> Result<AgentOpenAiChatResult, String> {
    let access_token = crate::commands::license::cloud_access_token(&app_handle).await?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5 * 60))
        .build()
        .map_err(|error| format!("无法初始化钱包 Agent 连接：{error}"))?;
    let response = client
        .post("https://api.unmind.art/v1/ai/chat/completions")
        .bearer_auth(access_token)
        .json(&json!({
            "clientRequestId": request.request_id,
            "messages": request.messages,
            "tools": request.tools,
        }))
        .send()
        .await
        .map_err(|error| format!("钱包 Agent 请求失败：{error}"))?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| format!("读取钱包 Agent 响应失败：{error}"))?;
    if !status.is_success() {
        let message = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|value| {
                value
                    .get("message")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .unwrap_or_else(|| preview_response_text(&text));
        return Err(format!("钱包 Agent HTTP {status}：{message}"));
    }

    let mut content = String::new();
    let mut tool_calls = BTreeMap::<usize, OpenAiToolCallAccumulator>::new();
    let mut finish_reason = None;
    parse_openai_buffered_text(
        &text,
        &mut content,
        &mut tool_calls,
        &mut finish_reason,
        &app_handle,
        &request.request_id,
    )?;
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
    let api_profile = resolve_agent_api_profile(&app_handle, &settings)?;
    tauri::async_runtime::spawn_blocking(move || {
        let client = crate::build_http_client(Some(&app_handle), None, 90)?;
        ai_gateway::router::list_models(&client, &api_profile)
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
    runtime_mode: String,
    codex_home: String,
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

fn command_output_with_codex_home(
    executable: &str,
    args: &[&str],
    codex_home: &Path,
) -> Result<std::process::Output, String> {
    let mut command = Command::new(executable);
    hide_console(&mut command);
    command.env("CODEX_HOME", codex_home);
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

fn inspect_codex_status(
    executable: String,
    running: bool,
    managed: bool,
    profile: &CodexRuntimeProfile,
    _settings: &AgentSettingsStored,
) -> CodexStatus {
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
                runtime_mode: profile.mode.as_str().to_string(),
                codex_home: profile.codex_home.to_string_lossy().to_string(),
            }
        }
    };
    let (authenticated, detail) = if profile.mode == CodexRuntimeMode::Api {
        let detail = normalize_base_url(profile.api_base_url.as_deref().unwrap_or(""))
            .map(|base_url| format!("Custom API · {}", base_url))
            .unwrap_or_else(|error| error);
        (profile.api_key_configured, detail)
    } else {
        let output =
            command_output_with_codex_home(&executable, &["login", "status"], &profile.codex_home);
        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                (
                    output.status.success(),
                    if stdout.is_empty() { stderr } else { stdout },
                )
            }
            Err(error) => (false, error),
        }
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
        runtime_mode: profile.mode.as_str().to_string(),
        codex_home: profile.codex_home.to_string_lossy().to_string(),
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
        let profile = build_codex_runtime_profile(&app_handle, &settings, false)?;
        Ok(inspect_codex_status(
            executable, running, managed, &profile, &settings,
        ))
    })
    .await
    .map_err(|error| format!("检查 Codex 状态失败：{}", error))?
}

#[tauri::command]
pub async fn agent_install_codex(
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
        let executable = install_managed_codex(&app_handle)?;
        let profile = build_codex_runtime_profile(&app_handle, &settings, false)?;
        Ok(inspect_codex_status(
            executable, running, true, &profile, &settings,
        ))
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
    profile: &CodexRuntimeProfile,
) -> Result<CodexRuntime, String> {
    let version = codex_version(executable)?;
    let mut command = Command::new(executable);
    hide_console(&mut command);
    command.env("CODEX_HOME", &profile.codex_home);
    if let Some(api_key) = &profile.api_key {
        command.env(CODEX_API_KEY_ENV, api_key);
    }
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
        mode: profile.mode,
        codex_home: profile.codex_home.clone(),
        profile_key: profile.profile_key.clone(),
    })
}

#[tauri::command]
pub async fn agent_codex_start(
    app_handle: tauri::AppHandle,
    state: State<'_, AgentRuntimeState>,
) -> Result<CodexStatus, String> {
    let settings = read_settings(&app_handle);
    let profile = build_codex_runtime_profile(&app_handle, &settings, true).map_err(|error| {
        format!(
            "准备 {} Codex 运行环境失败：{}",
            CodexRuntimeMode::from_provider(&settings.provider).as_str(),
            error
        )
    })?;
    let executable = resolve_codex_executable(&app_handle, &settings.codex_executable);
    let managed = is_managed_codex_path(&app_handle, &executable);
    let existing = state
        .codex
        .lock()
        .map_err(|_| "Codex runtime lock poisoned".to_string())?
        .clone();
    let runtime = if let Some(runtime) = existing
        .as_ref()
        .filter(|runtime| {
            runtime.is_running()
                && runtime.executable == executable
                && runtime.profile_key == profile.profile_key
                && runtime.mode == profile.mode
                && runtime.codex_home == profile.codex_home
        })
        .cloned()
    {
        runtime
    } else {
        if let Some(runtime) = existing {
            runtime.stop();
        }
        let runtime = spawn_codex_runtime(&app_handle, &executable, &profile).map_err(|error| {
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
                        "version": "4.3.9"
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

    let (authenticated, auth_detail) = if profile.mode == CodexRuntimeMode::Api {
        (
            profile.api_key_configured,
            format!(
                "Custom API · {}",
                normalize_base_url(profile.api_base_url.as_deref().unwrap_or(""))
                    .unwrap_or_else(|_| profile.api_base_url.clone().unwrap_or_default())
            ),
        )
    } else {
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
        (authenticated, auth_detail)
    };
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
        runtime_mode: profile.mode.as_str().to_string(),
        codex_home: profile.codex_home.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn agent_codex_restart(
    app_handle: tauri::AppHandle,
    state: State<'_, AgentRuntimeState>,
    mode: String,
) -> Result<CodexStatus, String> {
    let settings = read_settings(&app_handle);
    let configured_mode = CodexRuntimeMode::from_provider(&settings.provider);
    let requested_mode = match mode.trim().to_ascii_lowercase().as_str() {
        "chatgpt" | "codex" => CodexRuntimeMode::Chatgpt,
        "api" | "openai-compatible" => CodexRuntimeMode::Api,
        _ => return Err(format!("未知 Codex 运行模式：{}", mode)),
    };
    if requested_mode != configured_mode {
        return Err(format!(
            "Codex 模式切换失败：设置页当前为 {}，请求重启为 {}",
            configured_mode.as_str(),
            requested_mode.as_str()
        ));
    }
    if let Some(runtime) = state
        .codex
        .lock()
        .map_err(|_| "Codex runtime lock poisoned".to_string())?
        .take()
    {
        runtime.stop();
    }
    agent_codex_start(app_handle, state).await.map_err(|error| {
        format!(
            "重启 {} Codex App Server 失败：{}",
            requested_mode.as_str(),
            error
        )
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
    fn normalizes_custom_codex_provider_base_urls() {
        assert_eq!(CodexRuntimeMode::Chatgpt.home_dir_name(), "chatgpt");
        assert_eq!(CodexRuntimeMode::Api.home_dir_name(), "api-runtime");
        assert_eq!(
            normalize_base_url("https://api.example.com/").unwrap(),
            "https://api.example.com/v1"
        );
        assert_eq!(
            normalize_base_url("https://api.example.com/v1/responses").unwrap(),
            "https://api.example.com/v1"
        );
        assert!(normalize_base_url("api.example.com").is_err());
    }

    #[test]
    fn custom_codex_config_uses_env_key_and_never_embeds_api_key() {
        let mut stored = AgentSettingsStored::default();
        stored.api_base_url = "https://api.example.com/".to_string();
        stored.api_model = "custom-model".to_string();
        stored.api_key = "super-secret-key".to_string();
        stored
            .api_headers
            .insert("X-Tenant".to_string(), "drawer".to_string());

        let profile = EffectiveApiProfile {
            source: "user_settings".to_string(),
            gateway_kind: AiGatewayKind::OpenAiCompatible,
            provider: stored.provider.clone(),
            base_url: stored.api_base_url.clone(),
            api_key: stored.api_key.clone(),
            model: stored.api_model.clone(),
            headers: stored.api_headers.clone(),
            editable: true,
            key_last4: crate::ai_credentials::api_key_last4(&stored.api_key),
        };
        let config = build_codex_runtime_config(&profile).unwrap();
        assert!(config.contains("model = \"custom-model\""));
        assert!(config.contains("base_url = \"https://api.example.com/v1\""));
        assert!(config.contains("env_key = \"LINGGAN_CODEX_API_KEY\""));
        assert!(config.contains("wire_api = \"responses\""));
        assert!(config.contains("http_headers = { \"X-Tenant\" = \"drawer\" }"));
        assert!(!config.contains("super-secret-key"));
    }

    #[test]
    fn public_settings_never_include_the_api_key() {
        let mut stored = AgentSettingsStored::default();
        stored.api_key = "secret-key".to_string();
        stored.api_base_url = "https://gateway.example.com/private/tenant/v1".to_string();
        stored
            .api_headers
            .insert("X-Secret-Token".to_string(), "secret-header".to_string());
        let public = AgentSettingsPublic::from(&stored);
        let serialized = serde_json::to_string(&public).unwrap();
        assert!(public.has_api_key);
        assert_eq!(public.api_key_last4.as_deref(), Some("-key"));
        assert!(!serialized.contains("secret-key"));
        assert!(!serialized.contains("secret-header"));
        assert_eq!(public.api_base_url, "https://gateway.example.com");
        assert!(!serialized.contains("private/tenant"));
        assert_eq!(
            public.api_headers.get("X-Secret-Token").map(String::as_str),
            Some(CONFIGURED_HEADER_VALUE)
        );
        assert!(serialized.contains("apiKeyLast4"));
    }

    #[test]
    fn configured_header_placeholders_preserve_existing_secret_values() {
        let current = BTreeMap::from([
            ("X-Secret-Token".to_string(), "secret-header".to_string()),
            ("X-Remove-Me".to_string(), "old".to_string()),
        ]);
        let merged = merge_api_headers(
            &current,
            BTreeMap::from([
                (
                    "X-Secret-Token".to_string(),
                    CONFIGURED_HEADER_VALUE.to_string(),
                ),
                ("X-New".to_string(), "new-value".to_string()),
            ]),
        );

        assert_eq!(
            merged.get("X-Secret-Token").map(String::as_str),
            Some("secret-header")
        );
        assert_eq!(merged.get("X-New").map(String::as_str), Some("new-value"));
        assert!(!merged.contains_key("X-Remove-Me"));
    }

    #[test]
    fn redacted_base_url_preserves_current_path_until_user_replaces_it() {
        let current = "https://gateway.example.com/private/tenant/v1";
        assert_eq!(
            merge_api_base_url(current, "https://gateway.example.com").unwrap(),
            current
        );
        assert_eq!(
            merge_api_base_url(current, "https://gateway.example.com/").unwrap(),
            "https://gateway.example.com"
        );
        assert_eq!(
            merge_api_base_url(current, "https://other.example.com/v1").unwrap(),
            "https://other.example.com"
        );
    }

    #[test]
    fn legacy_agent_settings_without_gateway_kind_still_deserialize_and_infer_xais() {
        let mut value = serde_json::to_value(AgentSettingsStored::default()).unwrap();
        let object = value.as_object_mut().unwrap();
        object.remove("apiGatewayKind");
        object.insert("apiProvider".to_string(), json!("xais-chat"));
        object.insert(
            "apiBaseUrl".to_string(),
            json!("https://xais.example.com/v1"),
        );

        let stored: AgentSettingsStored = serde_json::from_value(value).unwrap();
        let public = AgentSettingsPublic::from(&stored);
        assert_eq!(public.api_gateway_kind, AiGatewayKind::Xais);
    }

    #[test]
    fn dangerous_agent_values_are_normalized() {
        assert_eq!(normalize_provider("unknown"), "openai-compatible");
        assert_eq!(normalize_sandbox("unknown"), "read-only");
        assert_eq!(normalize_approval_policy("unknown"), "on-request");
    }

    #[test]
    fn api_model_aliases_are_normalized() {
        assert_eq!(normalize_api_model("gpt5.5"), "gpt-5.5");
        assert_eq!(normalize_api_model("5.4-mini"), "gpt-5.4-mini");
        assert_eq!(normalize_api_model("custom-model"), "custom-model");
    }

    #[test]
    fn codex_model_normalization_preserves_explicit_catalog_models() {
        assert_eq!(normalize_codex_model(""), "");
        assert_eq!(normalize_codex_model("default"), "");
        assert_eq!(normalize_codex_model("5.5"), "gpt-5.5");
        assert_eq!(normalize_codex_model("gpt-5.5"), "gpt-5.5");
        assert_eq!(normalize_codex_model("5.4"), "gpt-5.4");
        assert_eq!(normalize_codex_model("codex-spark"), "gpt-5.3-codex-spark");
    }

    #[test]
    fn codex_reasoning_effort_only_accepts_supported_values() {
        assert_eq!(normalize_codex_reasoning_effort("xhigh"), "xhigh");
        assert_eq!(normalize_codex_reasoning_effort(" HIGH "), "high");
        assert_eq!(normalize_codex_reasoning_effort("default"), "");
    }
}
