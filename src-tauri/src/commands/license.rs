use std::fs;
use std::path::PathBuf;
use std::time::Duration;

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
struct EmailVerificationResponse {
    license: String,
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

async fn post_cloud<T: for<'de> Deserialize<'de>>(
    path: &str,
    request_body: &impl Serialize,
) -> Result<T, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|err| format!("cloud_unavailable: 无法初始化云端连接：{err}"))?;
    let response = client
        .post(format!("{CLOUD_API_BASE_URL}{path}"))
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
        let code = parsed
            .as_ref()
            .and_then(|value| value.error.as_deref())
            .unwrap_or("cloud_request_failed");
        let message = parsed
            .as_ref()
            .and_then(|value| value.message.as_deref())
            .unwrap_or("云端请求失败");
        return Err(cloud_error(code, message));
    }
    serde_json::from_str::<T>(&body)
        .map_err(|_| "cloud_invalid_response: 授权服务器返回格式无效".to_string())
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
    use super::{validate_display_name, validate_email};

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
}
