use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::license::types::{LicenseFile, LicensePayload};
use crate::license::{
    check_feature_from_status, current_machine_id, require_feature_from_content,
    status_from_content, FeatureCheckResult, LicenseError, LicenseStatus,
};

const LICENSE_FILE_NAME: &str = "license.json";
const CLOUD_API_BASE_URL: &str = "https://api.unmind.art";
const WALLET_PROTOCOL_VERSION: &str = "1";
const CLOUD_IMAGE_GENERATION_TIMEOUT: Duration = Duration::from_secs(15 * 60);

struct CachedCloudToken {
    value: String,
    expires_at: Instant,
}

static CLOUD_TOKEN_CACHE: OnceLock<Mutex<Option<CachedCloudToken>>> = OnceLock::new();

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EmailCodeRequest<'a> {
    email: &'a str,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailCodeChallenge {
    challenge_id: String,
    expires_in: u64,
    resend_after: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EmailVerificationRequest<'a> {
    email: &'a str,
    challenge_id: &'a str,
    code: &'a str,
    machine_id: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    display_name: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    legacy_license: Option<&'a str>,
    app_version: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CloudLicenseSyncRequest<'a> {
    license: &'a str,
    machine_id: &'a str,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EmailVerificationResponse {
    license: String,
    access_token: String,
    account: CloudAccountResponse,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloudAccountResponse {
    user: CloudUserResponse,
    wallet: Option<CloudWalletSummary>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloudUserResponse {
    email: Option<String>,
    display_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudWalletSummary {
    available_credits: String,
    reserved_credits: String,
    lifetime_granted: String,
    lifetime_consumed: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudAccountSummary {
    email: Option<String>,
    display_name: Option<String>,
    wallet: CloudWalletSummary,
}

#[derive(Serialize)]
struct CreditRedemptionRequest<'a> {
    code: &'a str,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreditRedemptionResponse {
    redeemed_credits: String,
    wallet: CloudWalletSummary,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditRedemptionResult {
    redeemed_credits: String,
    account: CloudAccountSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudImageGenerationRequest {
    client_request_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    provider: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    provider_channel_id: Option<String>,
    model: String,
    prompt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    negative_prompt: Option<String>,
    input_images: Vec<String>,
    aspect_ratio: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    resolution: Option<String>,
    output_format: String,
    count: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudImageGenerationResult {
    images: Vec<String>,
    provider: String,
    model: String,
    charged_credits: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudImageGenerationLookup {
    status: String,
    completed_at: Option<i64>,
    #[serde(default)]
    images: Vec<String>,
    provider: Option<String>,
    provider_channel_id: Option<String>,
    provider_channel_name: Option<String>,
    model: Option<String>,
    charged_credits: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudImageModelsResponse {
    provider: String,
    default_model: Option<String>,
    models: Vec<String>,
    #[serde(default)]
    channels: Vec<CloudImageModelChannel>,
    #[serde(default)]
    pricing: Option<CloudAiPricing>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudAiPricing {
    agent_request_credits: String,
    inspiration_analysis_credits: String,
    image_default_credits: String,
    video_default_credits: String,
    #[serde(default)]
    image_models: Vec<CloudImageModelPricing>,
    #[serde(default)]
    video_models: Vec<CloudVideoModelPricing>,
    updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudImageModelPricing {
    model: String,
    credits1k: String,
    credits2k: String,
    credits4k: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudVideoModelPricing {
    model: String,
    credits: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudImageModelChannel {
    id: String,
    name: String,
    provider: String,
    default_model: Option<String>,
    models: Vec<String>,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudVideoGenerationRequest {
    client_request_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    provider: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    provider_channel_id: Option<String>,
    model: String,
    prompt: String,
    input_images: Vec<String>,
    aspect_ratio: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    resolution: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    duration: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    input_mode: Option<String>,
    count: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudVideoGenerationResult {
    results: Vec<serde_json::Value>,
    provider: String,
    model: String,
    charged_credits: String,
}

fn normalize_cloud_image_references(input_images: Vec<String>) -> Result<Vec<String>, String> {
    input_images
        .into_iter()
        .enumerate()
        .map(|(index, source)| {
            let normalized = crate::image_source_for_ai(&source).map_err(|error| {
                format!(
                    "invalid_request: reference image {} could not be read: {}",
                    index + 1,
                    error
                )
            })?;
            if normalized.starts_with("data:image/")
                || normalized.starts_with("http://")
                || normalized.starts_with("https://")
            {
                return Ok(normalized);
            }
            Err(format!(
                "invalid_request: reference image {} is not a readable local image, HTTP URL, or data URL",
                index + 1
            ))
        })
        .collect()
}

#[derive(Deserialize)]
struct CloudApiError {
    error: Option<String>,
    message: Option<String>,
}

fn license_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|err| format!("io_error: 无法获取应用数据目录：{err}"))?;
    fs::create_dir_all(&dir).map_err(|err| format!("io_error: 无法创建应用数据目录：{err}"))?;
    Ok(dir.join(LICENSE_FILE_NAME))
}

fn read_license_content(app_handle: &tauri::AppHandle) -> Result<Option<String>, String> {
    let path = license_path(app_handle)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path)
        .map(Some)
        .map_err(|err| format!("io_error: 无法读取授权文件：{err}"))
}

fn decode_license_payload_unverified(content: &str) -> Option<LicensePayload> {
    let license_file = serde_json::from_str::<LicenseFile>(content).ok()?;
    let payload = general_purpose::STANDARD
        .decode(license_file.payload.as_bytes())
        .ok()?;
    serde_json::from_slice(&payload).ok()
}

fn validate_display_name(value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    let length = trimmed.chars().count();
    if !(2..=32).contains(&length) || trimmed.chars().any(char::is_control) {
        return Err("invalid_display_name: 用户名需要填写 2 到 32 个字符".to_string());
    }
    Ok(trimmed.to_string())
}

fn validate_email(value: &str) -> Result<String, String> {
    let email = value.trim().to_ascii_lowercase();
    if email.len() > 254
        || !email.contains('@')
        || email.starts_with('@')
        || email.ends_with('@')
        || email.chars().any(char::is_control)
    {
        return Err("invalid_email: 请输入有效的邮箱地址".to_string());
    }
    Ok(email)
}

fn cloud_error(code: &str, fallback: &str) -> String {
    let localized_message = match code {
        "email_delivery_unavailable" => "验证码邮件服务尚未配置，请联系管理员",
        "invalid_email_code" => "验证码错误或已经过期",
        "email_code_reused" => "验证码已经使用，请重新获取",
        "automatic_license_unavailable" => "云端授权签发尚未开通，请联系管理员",
        "display_name_required" => "首次注册需要填写 2 到 32 个字符的用户名",
        "account_binding_conflict" => "邮箱、旧授权或本机已绑定到其他账户",
        "device_already_bound" => "本机已绑定到其他邮箱账户",
        "license_expired" | "expired" => "账户授权已经到期，请联系管理员续期",
        "license_revoked" => "账户授权已被停用，请联系管理员",
        "account_disabled" => "当前账户已被停用，请联系管理员",
        "rate_limit_exceeded" => "请求过于频繁，请稍后再试",
        _ => fallback,
    };
    format!("{code}: {localized_message}")
}

fn cloud_http_fallback(status: reqwest::StatusCode, body: &str) -> String {
    let compact = body
        .replace(['\r', '\n', '\t'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let detail = if compact.starts_with('<') {
        "代理服务器返回了非 JSON 错误".to_string()
    } else if compact.is_empty() {
        "服务器没有返回错误正文".to_string()
    } else {
        compact.chars().take(500).collect::<String>()
    };
    format!("云端请求失败（HTTP {}）：{detail}", status.as_u16())
}

async fn post_cloud<T: for<'de> Deserialize<'de>>(
    path: &str,
    request_body: &impl Serialize,
) -> Result<T, String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|err| format!("cloud_unavailable: 无法初始化云端连接：{err}"))?;
    let response = client
        .post(format!("{CLOUD_API_BASE_URL}{path}"))
        .header("x-client-version", env!("CARGO_PKG_VERSION"))
        .header("x-wallet-protocol", WALLET_PROTOCOL_VERSION)
        .json(request_body)
        .send()
        .await
        .map_err(|err| format!("cloud_unavailable: 无法连接授权服务器：{err}"))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|err| format!("cloud_invalid_response: 无法读取授权服务器响应：{err}"))?;
    if !status.is_success() {
        let parsed = serde_json::from_str::<CloudApiError>(&body).ok();
        let fallback = cloud_http_fallback(status, &body);
        let code = parsed
            .as_ref()
            .and_then(|value| value.error.as_deref())
            .unwrap_or("cloud_request_failed");
        let message = parsed
            .as_ref()
            .and_then(|value| value.message.as_deref())
            .unwrap_or(&fallback);
        return Err(cloud_error(code, message));
    }
    serde_json::from_str::<T>(&body)
        .map_err(|_| "cloud_invalid_response: 授权服务器返回格式无效".to_string())
}

async fn post_cloud_with_bearer<T: for<'de> Deserialize<'de>>(
    path: &str,
    access_token: &str,
    request_body: &impl Serialize,
) -> Result<T, String> {
    post_cloud_with_bearer_timeout(path, access_token, request_body, Duration::from_secs(20)).await
}

async fn post_cloud_with_bearer_timeout<T: for<'de> Deserialize<'de>>(
    path: &str,
    access_token: &str,
    request_body: &impl Serialize,
    timeout: Duration,
) -> Result<T, String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(timeout)
        .build()
        .map_err(|err| format!("cloud_unavailable: 无法初始化云端连接：{err}"))?;
    let response = client
        .post(format!("{CLOUD_API_BASE_URL}{path}"))
        .bearer_auth(access_token)
        .header("x-client-version", env!("CARGO_PKG_VERSION"))
        .header("x-wallet-protocol", WALLET_PROTOCOL_VERSION)
        .json(request_body)
        .send()
        .await
        .map_err(|err| format!("cloud_unavailable: 无法连接额度服务器：{err}"))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|err| format!("cloud_invalid_response: 无法读取额度服务器响应：{err}"))?;
    if !status.is_success() {
        let parsed = serde_json::from_str::<CloudApiError>(&body).ok();
        let fallback = cloud_http_fallback(status, &body);
        let code = parsed
            .as_ref()
            .and_then(|value| value.error.as_deref())
            .unwrap_or("cloud_request_failed");
        let message = parsed
            .as_ref()
            .and_then(|value| value.message.as_deref())
            .unwrap_or(&fallback);
        return Err(cloud_error(code, message));
    }
    serde_json::from_str::<T>(&body)
        .map_err(|_| "cloud_invalid_response: 额度服务器返回格式无效".to_string())
}

async fn get_cloud_with_bearer<T: for<'de> Deserialize<'de>>(
    path: &str,
    access_token: &str,
) -> Result<T, String> {
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|err| format!("cloud_unavailable: 无法初始化云端连接：{err}"))?;
    let response = client
        .get(format!("{CLOUD_API_BASE_URL}{path}"))
        .bearer_auth(access_token)
        .header("x-client-version", env!("CARGO_PKG_VERSION"))
        .header("x-wallet-protocol", WALLET_PROTOCOL_VERSION)
        .send()
        .await
        .map_err(|err| format!("cloud_unavailable: 无法连接额度服务器：{err}"))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|err| format!("cloud_invalid_response: 无法读取额度服务器响应：{err}"))?;
    if !status.is_success() {
        let parsed = serde_json::from_str::<CloudApiError>(&body).ok();
        let fallback = cloud_http_fallback(status, &body);
        let code = parsed
            .as_ref()
            .and_then(|value| value.error.as_deref())
            .unwrap_or("cloud_request_failed");
        let message = parsed
            .as_ref()
            .and_then(|value| value.message.as_deref())
            .unwrap_or(&fallback);
        return Err(cloud_error(code, message));
    }
    serde_json::from_str::<T>(&body)
        .map_err(|_| "cloud_invalid_response: 额度服务器返回格式无效".to_string())
}

fn summarize_cloud_account(
    response: &EmailVerificationResponse,
) -> Result<CloudAccountSummary, String> {
    let wallet = response
        .account
        .wallet
        .clone()
        .ok_or_else(|| "cloud_invalid_response: 当前账号没有钱包".to_string())?;
    Ok(CloudAccountSummary {
        email: response.account.user.email.clone(),
        display_name: response.account.user.display_name.clone(),
        wallet,
    })
}

async fn sync_cloud_account(
    app_handle: &tauri::AppHandle,
) -> Result<EmailVerificationResponse, String> {
    let current = read_license_content(app_handle)?
        .ok_or_else(|| "license_missing: 请先完成邮箱注册或登录".to_string())?;
    let payload = decode_license_payload_unverified(&current)
        .ok_or_else(|| "malformed_license: 本地授权格式无效".to_string())?;
    if payload.license_id.is_none() {
        return Err("cloud_account_required: 请先完成邮箱注册或登录".to_string());
    }
    let machine_id = current_machine_id().map_err(|err| format!("io_error: {err}"))?;
    let response = post_cloud::<EmailVerificationResponse>(
        "/v1/auth/email/sync",
        &CloudLicenseSyncRequest {
            license: &current,
            machine_id: &machine_id,
        },
    )
    .await?;
    verify_and_save_cloud_license(app_handle, machine_id, response.license.clone())?;
    Ok(response)
}

pub(crate) async fn cloud_access_token(app_handle: &tauri::AppHandle) -> Result<String, String> {
    let cache = CLOUD_TOKEN_CACHE.get_or_init(|| Mutex::new(None));
    if let Ok(guard) = cache.lock() {
        if let Some(cached) = guard
            .as_ref()
            .filter(|cached| cached.expires_at > Instant::now())
        {
            return Ok(cached.value.clone());
        }
    }
    let access_token = sync_cloud_account(app_handle).await?.access_token;
    if let Ok(mut guard) = cache.lock() {
        *guard = Some(CachedCloudToken {
            value: access_token.clone(),
            expires_at: Instant::now() + Duration::from_secs(12 * 60),
        });
    }
    Ok(access_token)
}

fn verify_and_save_cloud_license(
    app_handle: &tauri::AppHandle,
    machine_id: String,
    license_content: String,
) -> Result<LicenseStatus, String> {
    let payload = crate::license::verifier::verify_license_content(&license_content, &machine_id)
        .map_err(format_license_error)?;
    let target = license_path(app_handle)?;
    fs::write(&target, license_content)
        .map_err(|err| format!("io_error: 无法保存云端授权文件：{err}"))?;
    Ok(LicenseStatus::from_payload(machine_id, payload))
}

fn format_license_error(err: LicenseError) -> String {
    format!("{}: {}", err.code.as_str(), err.message)
}

#[tauri::command]
pub fn get_machine_id() -> Result<String, String> {
    current_machine_id().map_err(|err| format!("io_error: {err}"))
}

#[tauri::command]
pub fn get_license_status(app_handle: tauri::AppHandle) -> Result<LicenseStatus, String> {
    let machine_id = current_machine_id().map_err(|err| format!("io_error: {err}"))?;
    let content = read_license_content(&app_handle)?;
    Ok(status_from_content(content.as_deref(), machine_id))
}

#[tauri::command]
pub async fn request_email_verification(email: String) -> Result<EmailCodeChallenge, String> {
    let email = validate_email(&email)?;
    post_cloud(
        "/v1/auth/email/send-code",
        &EmailCodeRequest { email: &email },
    )
    .await
}

#[tauri::command]
pub async fn verify_email_registration(
    app_handle: tauri::AppHandle,
    email: String,
    challenge_id: String,
    code: String,
    display_name: Option<String>,
) -> Result<LicenseStatus, String> {
    let email = validate_email(&email)?;
    let display_name = match display_name {
        Some(value) if !value.trim().is_empty() => Some(validate_display_name(&value)?),
        _ => None,
    };
    let code = code.trim();
    if code.len() != 6 || !code.chars().all(|character| character.is_ascii_digit()) {
        return Err("invalid_email_code: 请输入 6 位数字验证码".to_string());
    }
    let machine_id = current_machine_id().map_err(|err| format!("io_error: {err}"))?;
    let current = read_license_content(&app_handle)?;
    let legacy_license = current.as_deref().filter(|content| {
        decode_license_payload_unverified(content).is_some_and(|payload| {
            payload.license_id.is_none() && payload.machine_id.trim() == machine_id
        })
    });
    let response = post_cloud::<EmailVerificationResponse>(
        "/v1/auth/email/verify",
        &EmailVerificationRequest {
            email: &email,
            challenge_id: challenge_id.trim(),
            code,
            machine_id: &machine_id,
            display_name: display_name.as_deref(),
            legacy_license,
            app_version: env!("CARGO_PKG_VERSION"),
        },
    )
    .await?;
    verify_and_save_cloud_license(&app_handle, machine_id, response.license)
}

#[tauri::command]
pub async fn sync_email_license(
    app_handle: tauri::AppHandle,
) -> Result<Option<LicenseStatus>, String> {
    let Some(current) = read_license_content(&app_handle)? else {
        return Ok(None);
    };
    let Some(payload) = decode_license_payload_unverified(&current) else {
        return Ok(None);
    };
    if payload.license_id.is_none() {
        return Ok(None);
    }

    let machine_id = current_machine_id().map_err(|err| format!("io_error: {err}"))?;
    let response = post_cloud::<EmailVerificationResponse>(
        "/v1/auth/email/sync",
        &CloudLicenseSyncRequest {
            license: &current,
            machine_id: &machine_id,
        },
    )
    .await;
    match response {
        Ok(response) => {
            verify_and_save_cloud_license(&app_handle, machine_id, response.license).map(Some)
        }
        Err(error)
            if error.starts_with("account_disabled:")
                || error.starts_with("license_expired:")
                || error.starts_with("license_revoked:") =>
        {
            let path = license_path(&app_handle)?;
            if path.exists() {
                fs::remove_file(path)
                    .map_err(|err| format!("io_error: 无法移除失效授权文件：{err}"))?;
            }
            Err(error)
        }
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub async fn get_cloud_account(
    app_handle: tauri::AppHandle,
) -> Result<CloudAccountSummary, String> {
    let response = sync_cloud_account(&app_handle).await?;
    summarize_cloud_account(&response)
}

#[tauri::command]
pub async fn redeem_credit_code(
    app_handle: tauri::AppHandle,
    code: String,
) -> Result<CreditRedemptionResult, String> {
    let code = code.trim();
    if code.len() < 10 || code.len() > 64 {
        return Err("invalid_code: 兑换码格式不正确".to_string());
    }
    let synced = sync_cloud_account(&app_handle).await?;
    let redeemed = post_cloud_with_bearer::<CreditRedemptionResponse>(
        "/v1/wallet/redeem",
        &synced.access_token,
        &CreditRedemptionRequest { code },
    )
    .await?;
    let mut account = summarize_cloud_account(&synced)?;
    account.wallet = redeemed.wallet;
    Ok(CreditRedemptionResult {
        redeemed_credits: redeemed.redeemed_credits,
        account,
    })
}

#[tauri::command]
pub async fn generate_cloud_images(
    app_handle: tauri::AppHandle,
    mut request: CloudImageGenerationRequest,
) -> Result<CloudImageGenerationResult, String> {
    let client_request_id = request.client_request_id.trim();
    let model = request.model.trim();
    let prompt = request.prompt.trim();
    if client_request_id.len() < 8 || client_request_id.len() > 128 {
        return Err("invalid_request: 生图请求 ID 无效".to_string());
    }
    if model.is_empty() {
        return Err("invalid_request: 生图模型为空".to_string());
    }
    if model.len() > 200 {
        return Err("invalid_request: 生图模型名称过长".to_string());
    }
    if prompt.is_empty() {
        return Err("invalid_request: 生图提示词为空".to_string());
    }
    if prompt.len() > 50_000 {
        return Err(format!(
            "invalid_request: 生图提示词过长（UTF-8 {} / 50000 字节）",
            prompt.len()
        ));
    }
    let max_reference_images = if request.provider.as_deref() == Some("xais-chat") {
        8
    } else {
        9
    };
    if !(1..=4).contains(&request.count)
        || request.input_images.len() > max_reference_images
    {
        return Err("invalid_request: 生图数量或参考图数量无效".to_string());
    }
    request.input_images =
        normalize_cloud_image_references(std::mem::take(&mut request.input_images))?;
    if request
        .input_images
        .iter()
        .any(|value| value.len() > 12_000_000)
    {
        return Err("invalid_request: 单张参考图数据过大".to_string());
    }

    let access_token = cloud_access_token(&app_handle).await?;
    post_cloud_with_bearer_timeout::<CloudImageGenerationResult>(
        "/v1/ai/images/generations",
        &access_token,
        &request,
        CLOUD_IMAGE_GENERATION_TIMEOUT,
    )
    .await
}

#[tauri::command]
pub async fn get_cloud_image_generation_by_request(
    app_handle: tauri::AppHandle,
    client_request_id: String,
) -> Result<CloudImageGenerationLookup, String> {
    let client_request_id = client_request_id.trim();
    if client_request_id.len() < 8
        || client_request_id.len() > 128
        || !client_request_id
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, '-' | '_' | '.' | ':'))
    {
        return Err("invalid_request: 生图请求 ID 无效".to_string());
    }
    let access_token = cloud_access_token(&app_handle).await?;
    let encoded_request_id =
        url::form_urlencoded::byte_serialize(client_request_id.as_bytes()).collect::<String>();
    get_cloud_with_bearer::<CloudImageGenerationLookup>(
        &format!("/v1/ai/images/generations/by-request/{encoded_request_id}"),
        &access_token,
    )
    .await
}

#[tauri::command]
pub async fn get_cloud_image_models(
    app_handle: tauri::AppHandle,
    provider: Option<String>,
) -> Result<CloudImageModelsResponse, String> {
    // Kept for compatibility with older frontends. The wallet backend owns
    // IMAGE channel selection, so the client provider must not constrain it.
    let _ = provider;
    let access_token = cloud_access_token(&app_handle).await?;
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("cloud_unavailable: 无法初始化云端连接：{error}"))?;
    let request = client
        .get(format!("{CLOUD_API_BASE_URL}/v1/ai/images/models"))
        .bearer_auth(access_token)
        .header("x-client-version", env!("CARGO_PKG_VERSION"))
        .header("x-wallet-protocol", WALLET_PROTOCOL_VERSION);
    let response = request
        .send()
        .await
        .map_err(|error| format!("cloud_unavailable: 无法连接生图模型服务：{error}"))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("cloud_invalid_response: 无法读取生图模型：{error}"))?;
    if !status.is_success() {
        let parsed = serde_json::from_str::<CloudApiError>(&body).ok();
        let code = parsed
            .as_ref()
            .and_then(|value| value.error.as_deref())
            .unwrap_or("cloud_request_failed");
        let message = parsed
            .as_ref()
            .and_then(|value| value.message.as_deref())
            .unwrap_or("读取生图模型失败");
        return Err(cloud_error(code, message));
    }
    let mut parsed = serde_json::from_str::<CloudImageModelsResponse>(&body)
        .map_err(|_| "cloud_invalid_response: 生图模型列表格式无效".to_string())?;
    let mut models = parsed
        .models
        .drain(..)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    models.sort();
    models.dedup();
    parsed.models = models;
    Ok(parsed)
}

#[tauri::command]
pub async fn generate_cloud_videos(
    app_handle: tauri::AppHandle,
    request: CloudVideoGenerationRequest,
) -> Result<CloudVideoGenerationResult, String> {
    let client_request_id = request.client_request_id.trim();
    let model = request.model.trim();
    let prompt = request.prompt.trim();
    if client_request_id.len() < 8 || client_request_id.len() > 128 {
        return Err("invalid_request: 视频请求 ID 无效".to_string());
    }
    if model.is_empty() || model.len() > 200 || prompt.is_empty() || prompt.len() > 50_000 {
        return Err("invalid_request: 视频模型或提示词无效".to_string());
    }
    if !(1..=4).contains(&request.count) || request.input_images.len() > 13 {
        return Err("invalid_request: 视频数量或参考素材数量无效".to_string());
    }
    let access_token = cloud_access_token(&app_handle).await?;
    post_cloud_with_bearer_timeout::<CloudVideoGenerationResult>(
        "/v1/ai/videos",
        &access_token,
        &request,
        Duration::from_secs(6 * 60),
    )
    .await
}

#[tauri::command]
pub async fn get_cloud_video_status(
    app_handle: tauri::AppHandle,
    task_id: String,
    provider: Option<String>,
    client_request_id: Option<String>,
    provider_channel_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let task_id = task_id.trim();
    if task_id.is_empty()
        || task_id.len() > 256
        || !task_id
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, '-' | '_' | '.' | ':'))
    {
        return Err("invalid_request: 视频任务 ID 无效".to_string());
    }
    let access_token = cloud_access_token(&app_handle).await?;
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("cloud_unavailable: 无法初始化云端连接：{error}"))?;
    let mut request = client
        .get(format!("{CLOUD_API_BASE_URL}/v1/ai/videos/{task_id}"))
        .bearer_auth(access_token)
        .header("x-client-version", env!("CARGO_PKG_VERSION"))
        .header("x-wallet-protocol", WALLET_PROTOCOL_VERSION);
    if let Some(provider) = provider.filter(|value| !value.trim().is_empty()) {
        request = request.query(&[("provider", provider)]);
    }
    if let Some(client_request_id) = client_request_id.filter(|value| !value.trim().is_empty()) {
        request = request.query(&[("clientRequestId", client_request_id)]);
    }
    if let Some(provider_channel_id) = provider_channel_id.filter(|value| !value.trim().is_empty())
    {
        request = request.query(&[("providerChannelId", provider_channel_id)]);
    }
    let response = request
        .send()
        .await
        .map_err(|error| format!("cloud_unavailable: 无法连接额度服务器：{error}"))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|error| format!("cloud_invalid_response: 无法读取视频状态：{error}"))?;
    if !status.is_success() {
        let parsed = serde_json::from_str::<CloudApiError>(&body).ok();
        let code = parsed
            .as_ref()
            .and_then(|value| value.error.as_deref())
            .unwrap_or("cloud_request_failed");
        let message = parsed
            .as_ref()
            .and_then(|value| value.message.as_deref())
            .unwrap_or("视频状态查询失败");
        return Err(cloud_error(code, message));
    }
    serde_json::from_str(&body).map_err(|_| "cloud_invalid_response: 视频状态格式无效".to_string())
}

#[tauri::command]
pub fn import_license(
    app_handle: tauri::AppHandle,
    path: Option<String>,
    content: Option<String>,
) -> Result<LicenseStatus, String> {
    let license_content = match content {
        Some(value) if !value.trim().is_empty() => value,
        _ => {
            let path = path
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| "malformed_license: 请选择授权文件".to_string())?;
            fs::read_to_string(&path).map_err(|err| format!("io_error: 无法读取授权文件：{err}"))?
        }
    };

    let machine_id = current_machine_id().map_err(|err| format!("io_error: {err}"))?;
    let payload = crate::license::verifier::verify_license_content(&license_content, &machine_id)
        .map_err(format_license_error)?;

    let target = license_path(&app_handle)?;
    fs::write(&target, license_content)
        .map_err(|err| format!("io_error: 无法保存授权文件：{err}"))?;

    Ok(LicenseStatus::from_payload(machine_id, payload))
}

#[tauri::command]
pub fn remove_license(app_handle: tauri::AppHandle) -> Result<LicenseStatus, String> {
    let path = license_path(&app_handle)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|err| format!("io_error: 无法移除授权文件：{err}"))?;
    }
    if let Some(cache) = CLOUD_TOKEN_CACHE.get() {
        if let Ok(mut guard) = cache.lock() {
            *guard = None;
        }
    }
    let machine_id = current_machine_id().map_err(|err| format!("io_error: {err}"))?;
    Ok(LicenseStatus::unlicensed(machine_id))
}

#[tauri::command]
pub fn check_feature(
    app_handle: tauri::AppHandle,
    feature: String,
) -> Result<FeatureCheckResult, String> {
    let status = get_license_status(app_handle)?;
    Ok(check_feature_from_status(status, &feature))
}

pub fn require_feature(app_handle: &tauri::AppHandle, feature: &str) -> Result<(), String> {
    let feature = feature.trim();
    if feature.is_empty() {
        return Ok(());
    }

    let machine_id = current_machine_id().map_err(|err| format!("io_error: {err}"))?;
    let content = read_license_content(app_handle)?;
    require_feature_from_content(content.as_deref(), machine_id, feature)
        .map_err(format_license_error)
}

#[cfg(test)]
mod tests {
    use super::{
        normalize_cloud_image_references, validate_display_name, validate_email,
        CloudImageModelsResponse,
    };
    use base64::Engine as _;
    use std::fs;

    #[test]
    fn validates_trial_display_names() {
        assert_eq!(
            validate_display_name("  测试设计师  ").unwrap(),
            "测试设计师"
        );
        assert!(validate_display_name("a").is_err());
        assert!(validate_display_name("a\nb").is_err());
    }

    #[test]
    fn validates_registration_emails() {
        assert_eq!(
            validate_email(" Designer@Example.COM ").unwrap(),
            "designer@example.com"
        );
        assert!(validate_email("not-an-email").is_err());
    }

    #[test]
    fn converts_local_cloud_image_references_to_data_urls() {
        let path = std::env::temp_dir().join(format!(
            "inspiration-drawer-cloud-reference-{}.png",
            std::process::id()
        ));
        let png = base64::engine::general_purpose::STANDARD
            .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nYQAAAAASUVORK5CYII=")
            .unwrap();
        fs::write(&path, png).unwrap();

        let raw_path = path.to_string_lossy().to_string();
        let source = if cfg!(target_os = "windows") {
            format!("http://asset.localhost/{}", raw_path.replace('\\', "/"))
        } else {
            raw_path
        };
        let result = normalize_cloud_image_references(vec![source]).unwrap();
        let _ = fs::remove_file(path);

        assert_eq!(result.len(), 1);
        assert!(result[0].starts_with("data:image/png;base64,"));
    }

    #[test]
    fn keeps_portable_cloud_image_references_unchanged() {
        let references = vec![
            "https://assets.example.test/reference.png".to_string(),
            "data:image/png;base64,aGVsbG8=".to_string(),
        ];
        assert_eq!(
            normalize_cloud_image_references(references.clone()).unwrap(),
            references
        );
    }

    #[test]
    fn preserves_cloud_pricing_in_the_model_response() {
        let response: CloudImageModelsResponse = serde_json::from_value(serde_json::json!({
            "provider": "NEW_API",
            "defaultModel": "gpt-image-2",
            "models": ["gpt-image-2"],
            "channels": [],
            "pricing": {
                "agentRequestCredits": "7",
                "inspirationAnalysisCredits": "3",
                "imageDefaultCredits": "55",
                "videoDefaultCredits": "500",
                "imageModels": [{
                    "model": "gpt-image-2",
                    "credits1k": "4",
                    "credits2k": "6",
                    "credits4k": "9"
                }],
                "videoModels": [],
                "updatedAt": "2026-07-27T00:00:00.000Z"
            }
        }))
        .unwrap();
        let value = serde_json::to_value(response).unwrap();
        assert_eq!(
            value["pricing"]["imageModels"][0]["credits4k"],
            serde_json::json!("9")
        );
        assert_eq!(
            value["pricing"]["inspirationAnalysisCredits"],
            serde_json::json!("3")
        );
    }
}
