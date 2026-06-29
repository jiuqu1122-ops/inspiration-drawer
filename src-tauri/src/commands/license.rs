use std::fs;
use std::path::PathBuf;

use tauri::Manager;

use crate::license::{
    check_feature_from_status, current_machine_id, require_feature_from_content,
    status_from_content, FeatureCheckResult, LicenseError, LicenseStatus,
};

const LICENSE_FILE_NAME: &str = "license.json";

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
