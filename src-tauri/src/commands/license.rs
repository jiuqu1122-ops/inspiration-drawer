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
struct TrialRegistrationRequest<'a> {
    display_name: &'a str,
    machine_id: &'a str,
    app_version: &'a str,
}

#[derive(Deserialize)]
struct TrialRegistrationResponse {
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

async fn request_trial_license(display_name: &str, machine_id: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|err| format!("cloud_unavailable: 无法初始化云端连接：{err}"))?;
    let response = client
        .post(format!("{CLOUD_API_BASE_URL}/v1/auth/trial/register"))
        .json(&TrialRegistrationRequest {
            display_name,
            machine_id,
            app_version: env!("CARGO_PKG_VERSION"),
        })
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
            .unwrap_or("trial_registration_failed");
        let message = parsed
            .as_ref()
            .and_then(|value| value.message.as_deref())
            .unwrap_or("自动试用注册失败");
        let localized_message = match code {
            "automatic_trial_unavailable" => "自动试用尚未开通，请联系管理员",
            "existing_license_requires_import" => "此设备已有授权记录，请导入原授权或联系管理员续期",
            "license_expired" | "expired" => "本机试用已经到期，请联系管理员续期",
            "license_revoked" => "本机授权已被停用，请联系管理员",
            "account_disabled" => "当前账户已被停用，请联系管理员",
            "rate_limit_exceeded" => "请求过于频繁，请稍后再试",
            _ => message,
        };
        return Err(format!("{code}: {localized_message}"));
    }
    serde_json::from_str::<TrialRegistrationResponse>(&body)
        .map(|value| value.license)
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
pub async fn register_trial(
    app_handle: tauri::AppHandle,
    display_name: String,
) -> Result<LicenseStatus, String> {
    let display_name = validate_display_name(&display_name)?;
    let machine_id = current_machine_id().map_err(|err| format!("io_error: {err}"))?;
    let current = read_license_content(&app_handle)?;
    let current_status = status_from_content(current.as_deref(), machine_id.clone());
    if current_status.valid {
        return Ok(current_status);
    }
    let license_content = request_trial_license(&display_name, &machine_id).await?;
    verify_and_save_cloud_license(&app_handle, machine_id, license_content)
}

#[tauri::command]
pub async fn sync_server_license(
    app_handle: tauri::AppHandle,
) -> Result<Option<LicenseStatus>, String> {
    let Some(current) = read_license_content(&app_handle)? else {
        return Ok(None);
    };
    let Some(payload) = decode_license_payload_unverified(&current) else {
        return Ok(None);
    };
    if !matches!(payload.license_id.as_deref(), Some(value) if value.starts_with("trial_")) {
        return Ok(None);
    }

    let machine_id = current_machine_id().map_err(|err| format!("io_error: {err}"))?;
    let license_content = request_trial_license(&payload.customer, &machine_id).await?;
    verify_and_save_cloud_license(&app_handle, machine_id, license_content).map(Some)
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
    use super::validate_display_name;

    #[test]
    fn validates_trial_display_names() {
        assert_eq!(
            validate_display_name("  测试设计师  ").unwrap(),
            "测试设计师"
        );
        assert!(validate_display_name("a").is_err());
        assert!(validate_display_name("a\nb").is_err());
    }
}
