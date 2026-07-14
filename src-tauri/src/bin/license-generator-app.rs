// The generator is a GUI application in every build profile. Keeping this
// conditional on `debug_assertions` made the local generator profile open an
// empty Terminal window alongside the app.
#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use base64::{engine::general_purpose, Engine as _};
use chrono::{NaiveDate, SecondsFormat, Utc};
use inspiration_drawer::ai_gateway::{self, EffectiveApiProfile};
use inspiration_drawer::license::generator::{
    generate_license, public_key_from_private_key, GeneratedLicense, LicenseGeneratorInput,
};
use inspiration_drawer::license::types::{
    AiGatewayKind, LicenseAiAccess, LicenseEdition, LicenseFile, LicensePayload, ManagedApiProfile,
};
use inspiration_drawer::license::verifier::verify_license_content_with_key;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::Manager;

const SIGNING_KEY_FILE_NAME: &str = "signing-key.json";
const AUTHORIZATION_RECORDS_FILE_NAME: &str = "authorization-records.json";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LicenseGeneratorRequest {
    machine_id: String,
    customer: String,
    edition: String,
    expire_at: String,
    #[serde(default)]
    features: Vec<String>,
    product: Option<String>,
    #[serde(default)]
    ai_access: Option<LicenseAiAccess>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SigningKeyFile {
    version: u32,
    #[serde(alias = "private_key_b64", alias = "privateKey", alias = "private_key")]
    private_key_b64: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SigningIdentityStatus {
    configured: bool,
    public_key_b64: String,
    key_path: String,
    message: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthorizationRecord {
    product: String,
    customer: String,
    machine_id: String,
    edition: LicenseEdition,
    features: Vec<String>,
    expire_at: String,
    created_at: String,
    updated_at: String,
    #[serde(default = "default_issue_count")]
    issue_count: u32,
    last_output_path: Option<String>,
    #[serde(default)]
    ai_mode: Option<String>,
    #[serde(default)]
    managed_gateway_kind: Option<AiGatewayKind>,
    #[serde(default)]
    managed_provider: Option<String>,
    #[serde(default)]
    managed_base_url: Option<String>,
    #[serde(default)]
    managed_model: Option<String>,
    #[serde(default)]
    api_key_last4: Option<String>,
    #[serde(default)]
    api_key_fingerprint: Option<String>,
    #[serde(default)]
    canvas_gateway_kind: Option<AiGatewayKind>,
    #[serde(default)]
    canvas_provider: Option<String>,
    #[serde(default)]
    canvas_base_url: Option<String>,
    #[serde(default)]
    canvas_model: Option<String>,
    #[serde(default)]
    canvas_api_key_last4: Option<String>,
    #[serde(default)]
    canvas_api_key_fingerprint: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthorizationRecordsFile {
    version: u32,
    #[serde(default)]
    records: Vec<AuthorizationRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthorizationRegistrySnapshot {
    records: Vec<AuthorizationRecord>,
    data_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LicenseImportFailure {
    path: String,
    message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportedLicensesResult {
    imported_count: usize,
    added_count: usize,
    updated_count: usize,
    failed_count: usize,
    failures: Vec<LicenseImportFailure>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ManagedApiProbeResult {
    ok: bool,
    message: String,
    detail: Option<String>,
}

fn default_issue_count() -> u32 {
    1
}

fn api_key_last4(api_key: &str) -> Option<String> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return None;
    }
    let chars = trimmed.chars().collect::<Vec<_>>();
    let start = chars.len().saturating_sub(4);
    Some(chars[start..].iter().collect())
}

fn api_key_fingerprint(api_key: &str) -> Option<String> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return None;
    }
    let mut hasher = Sha256::new();
    hasher.update(trimmed.as_bytes());
    Some(hex::encode(hasher.finalize()))
}

fn ai_record_fields(
    payload: &LicensePayload,
) -> (
    Option<String>,
    Option<AiGatewayKind>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<AiGatewayKind>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
) {
    let Some(access) = payload.ai_access.as_ref() else {
        return (
            None, None, None, None, None, None, None, None, None, None, None, None, None,
        );
    };
    let profile = access.managed_profile.as_ref();
    let canvas_profile = access.canvas_profile.as_ref();
    (
        Some(
            match access.mode {
                inspiration_drawer::license::types::AiCredentialMode::Byok => "byok",
                inspiration_drawer::license::types::AiCredentialMode::LicenseManaged => {
                    "license_managed"
                }
            }
            .to_string(),
        ),
        profile.map(|value| {
            value.gateway_kind.unwrap_or_else(|| {
                AiGatewayKind::infer(&value.provider, &value.base_url, &value.headers)
            })
        }),
        profile.map(|value| value.provider.clone()),
        profile.map(|value| ai_gateway::endpoint::redact_api_base_url(&value.base_url)),
        profile.map(|value| value.model.clone()),
        profile.and_then(|value| api_key_last4(&value.api_key)),
        profile.and_then(|value| api_key_fingerprint(&value.api_key)),
        canvas_profile.map(|value| {
            value.gateway_kind.unwrap_or_else(|| {
                AiGatewayKind::infer(&value.provider, &value.base_url, &value.headers)
            })
        }),
        canvas_profile.map(|value| value.provider.clone()),
        canvas_profile.map(|value| ai_gateway::endpoint::redact_api_base_url(&value.base_url)),
        canvas_profile.map(|value| value.model.clone()),
        canvas_profile.and_then(|value| api_key_last4(&value.api_key)),
        canvas_profile.and_then(|value| api_key_fingerprint(&value.api_key)),
    )
}

fn generator_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("无法获取授权器数据目录：{err}"))?;
    fs::create_dir_all(&dir).map_err(|err| format!("无法创建授权器数据目录：{err}"))?;
    Ok(dir)
}

fn signing_key_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(generator_data_dir(app)?.join(SIGNING_KEY_FILE_NAME))
}

fn authorization_records_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(generator_data_dir(app)?.join(AUTHORIZATION_RECORDS_FILE_NAME))
}

fn read_authorization_records(path: &Path) -> Result<AuthorizationRecordsFile, String> {
    if !path.is_file() {
        return Ok(AuthorizationRecordsFile {
            version: 1,
            records: Vec::new(),
        });
    }

    let content = fs::read_to_string(path).map_err(|err| format!("无法读取授权台账：{err}"))?;
    serde_json::from_str(&content).map_err(|err| {
        format!(
            "授权台账格式损坏，请先备份或修复 {}：{err}",
            path.to_string_lossy()
        )
    })
}

fn write_authorization_records(
    path: &Path,
    records_file: &AuthorizationRecordsFile,
) -> Result<(), String> {
    let content = serde_json::to_string_pretty(records_file)
        .map_err(|err| format!("无法编码授权台账：{err}"))?;
    let temp_path = path.with_extension("json.tmp");
    fs::write(&temp_path, content).map_err(|err| format!("无法写入授权台账：{err}"))?;
    if path.exists() {
        fs::remove_file(path).map_err(|err| format!("无法更新旧授权台账：{err}"))?;
    }
    fs::rename(&temp_path, path).map_err(|err| format!("无法保存授权台账：{err}"))
}

fn record_generated_license(
    app: &tauri::AppHandle,
    payload: &LicensePayload,
    out_path: Option<&str>,
) -> Result<(), String> {
    let path = authorization_records_path(app)?;
    let mut records_file = read_authorization_records(&path)?;
    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true);
    upsert_authorization_record(&mut records_file, payload, out_path, &now);
    write_authorization_records(&path, &records_file)
}

fn upsert_authorization_record(
    records_file: &mut AuthorizationRecordsFile,
    payload: &LicensePayload,
    out_path: Option<&str>,
    now: &str,
) {
    let output_path = out_path
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let (
        ai_mode,
        managed_gateway_kind,
        managed_provider,
        managed_base_url,
        managed_model,
        api_key_last4,
        api_key_fingerprint,
        canvas_gateway_kind,
        canvas_provider,
        canvas_base_url,
        canvas_model,
        canvas_api_key_last4,
        canvas_api_key_fingerprint,
    ) = ai_record_fields(payload);

    if let Some(record) = records_file.records.iter_mut().find(|record| {
        record.product.eq_ignore_ascii_case(&payload.product)
            && record.machine_id.eq_ignore_ascii_case(&payload.machine_id)
    }) {
        record.customer = payload.customer.clone();
        record.edition = payload.edition.clone();
        record.features = payload.features.clone();
        record.expire_at = payload.expire_at.clone();
        record.updated_at = now.to_string();
        record.issue_count = record.issue_count.saturating_add(1);
        record.ai_mode = ai_mode;
        record.managed_gateway_kind = managed_gateway_kind;
        record.managed_provider = managed_provider;
        record.managed_base_url = managed_base_url;
        record.managed_model = managed_model;
        record.api_key_last4 = api_key_last4;
        record.api_key_fingerprint = api_key_fingerprint;
        record.canvas_gateway_kind = canvas_gateway_kind;
        record.canvas_provider = canvas_provider;
        record.canvas_base_url = canvas_base_url;
        record.canvas_model = canvas_model;
        record.canvas_api_key_last4 = canvas_api_key_last4;
        record.canvas_api_key_fingerprint = canvas_api_key_fingerprint;
        if output_path.is_some() {
            record.last_output_path = output_path;
        }
    } else {
        records_file.records.push(AuthorizationRecord {
            product: payload.product.clone(),
            customer: payload.customer.clone(),
            machine_id: payload.machine_id.clone(),
            edition: payload.edition.clone(),
            features: payload.features.clone(),
            expire_at: payload.expire_at.clone(),
            created_at: now.to_string(),
            updated_at: now.to_string(),
            issue_count: 1,
            last_output_path: output_path,
            ai_mode,
            managed_gateway_kind,
            managed_provider,
            managed_base_url,
            managed_model,
            api_key_last4,
            api_key_fingerprint,
            canvas_gateway_kind,
            canvas_provider,
            canvas_base_url,
            canvas_model,
            canvas_api_key_last4,
            canvas_api_key_fingerprint,
        });
    }

    records_file.version = 1;
}

fn merge_imported_authorization_record(
    records_file: &mut AuthorizationRecordsFile,
    payload: &LicensePayload,
    source_path: &str,
    now: &str,
) -> bool {
    let (
        ai_mode,
        managed_gateway_kind,
        managed_provider,
        managed_base_url,
        managed_model,
        api_key_last4,
        api_key_fingerprint,
        canvas_gateway_kind,
        canvas_provider,
        canvas_base_url,
        canvas_model,
        canvas_api_key_last4,
        canvas_api_key_fingerprint,
    ) = ai_record_fields(payload);

    if let Some(record) = records_file.records.iter_mut().find(|record| {
        record.product.eq_ignore_ascii_case(&payload.product)
            && record.machine_id.eq_ignore_ascii_case(&payload.machine_id)
    }) {
        record.customer = payload.customer.clone();
        record.edition = payload.edition.clone();
        record.features = payload.features.clone();
        record.expire_at = payload.expire_at.clone();
        record.updated_at = now.to_string();
        record.last_output_path = Some(source_path.to_string());
        record.ai_mode = ai_mode;
        record.managed_gateway_kind = managed_gateway_kind;
        record.managed_provider = managed_provider;
        record.managed_base_url = managed_base_url;
        record.managed_model = managed_model;
        record.api_key_last4 = api_key_last4;
        record.api_key_fingerprint = api_key_fingerprint;
        record.canvas_gateway_kind = canvas_gateway_kind;
        record.canvas_provider = canvas_provider;
        record.canvas_base_url = canvas_base_url;
        record.canvas_model = canvas_model;
        record.canvas_api_key_last4 = canvas_api_key_last4;
        record.canvas_api_key_fingerprint = canvas_api_key_fingerprint;
        return false;
    }

    records_file.records.push(AuthorizationRecord {
        product: payload.product.clone(),
        customer: payload.customer.clone(),
        machine_id: payload.machine_id.clone(),
        edition: payload.edition.clone(),
        features: payload.features.clone(),
        expire_at: payload.expire_at.clone(),
        created_at: now.to_string(),
        updated_at: now.to_string(),
        issue_count: 1,
        last_output_path: Some(source_path.to_string()),
        ai_mode,
        managed_gateway_kind,
        managed_provider,
        managed_base_url,
        managed_model,
        api_key_last4,
        api_key_fingerprint,
        canvas_gateway_kind,
        canvas_provider,
        canvas_base_url,
        canvas_model,
        canvas_api_key_last4,
        canvas_api_key_fingerprint,
    });
    records_file.version = 1;
    true
}

fn machine_id_hint_from_license(content: &str) -> Result<String, String> {
    let license_file: LicenseFile =
        serde_json::from_str(content).map_err(|_| "授权文件格式无效".to_string())?;
    let payload_bytes = general_purpose::STANDARD
        .decode(license_file.payload.as_bytes())
        .map_err(|_| "授权 payload 不是有效 Base64".to_string())?;
    let payload: LicensePayload = serde_json::from_slice(&payload_bytes)
        .map_err(|_| "授权 payload 不是有效 JSON".to_string())?;
    let machine_id = payload.machine_id.trim().to_string();
    if machine_id.is_empty() {
        return Err("授权文件内没有机器码".to_string());
    }
    Ok(machine_id)
}

fn parse_private_key(content: &str) -> Result<String, String> {
    if let Ok(file) = serde_json::from_str::<SigningKeyFile>(content) {
        let private_key = file.private_key_b64.trim().to_string();
        public_key_from_private_key(&private_key)?;
        return Ok(private_key);
    }

    for line in content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
    {
        for prefix in [
            "PRIVATE_KEY_B64=",
            "privateKeyB64=",
            "private_key_b64=",
            "privateKey=",
            "private_key=",
        ] {
            if let Some(value) = line.strip_prefix(prefix) {
                let private_key = value.trim().trim_matches('"').to_string();
                public_key_from_private_key(&private_key)?;
                return Ok(private_key);
            }
        }
    }

    let private_key = content.trim().trim_matches('"').to_string();
    public_key_from_private_key(&private_key)?;
    Ok(private_key)
}

fn load_signing_identity(app: &tauri::AppHandle) -> Result<(String, String, PathBuf), String> {
    let path = signing_key_path(app)?;
    if !path.is_file() {
        return Err(format!(
            "未配置签发密钥，请先导入 signing-key.json：{}",
            path.to_string_lossy()
        ));
    }
    let content = fs::read_to_string(&path).map_err(|err| format!("无法读取签发密钥：{err}"))?;
    let private_key = parse_private_key(&content)?;
    let public_key = public_key_from_private_key(&private_key)?;
    Ok((private_key, public_key, path))
}

fn write_signing_key(path: &Path, private_key: &str) -> Result<(), String> {
    let payload = SigningKeyFile {
        version: 1,
        private_key_b64: private_key.to_string(),
    };
    let content =
        serde_json::to_string_pretty(&payload).map_err(|err| format!("无法编码签发密钥：{err}"))?;
    let temp_path = path.with_extension("json.tmp");
    fs::write(&temp_path, content).map_err(|err| format!("无法写入签发密钥：{err}"))?;
    if path.exists() {
        fs::remove_file(path).map_err(|err| format!("无法替换旧签发密钥：{err}"))?;
    }
    fs::rename(&temp_path, path).map_err(|err| format!("无法保存签发密钥：{err}"))
}

fn status_from_identity(app: &tauri::AppHandle) -> SigningIdentityStatus {
    let fallback_path =
        signing_key_path(app).unwrap_or_else(|_| PathBuf::from(SIGNING_KEY_FILE_NAME));
    match load_signing_identity(app) {
        Ok((_private_key, public_key, path)) => SigningIdentityStatus {
            configured: true,
            public_key_b64: public_key,
            key_path: path.to_string_lossy().to_string(),
            message: None,
        },
        Err(message) => SigningIdentityStatus {
            configured: false,
            public_key_b64: String::new(),
            key_path: fallback_path.to_string_lossy().to_string(),
            message: Some(message),
        },
    }
}

#[tauri::command]
fn get_generator_signing_status(app_handle: tauri::AppHandle) -> SigningIdentityStatus {
    status_from_identity(&app_handle)
}

#[tauri::command]
fn get_authorization_registry(
    app_handle: tauri::AppHandle,
) -> Result<AuthorizationRegistrySnapshot, String> {
    let path = authorization_records_path(&app_handle)?;
    let mut records_file = read_authorization_records(&path)?;
    records_file.records.sort_by(|left, right| {
        left.expire_at
            .cmp(&right.expire_at)
            .then_with(|| left.customer.cmp(&right.customer))
    });
    Ok(AuthorizationRegistrySnapshot {
        records: records_file.records,
        data_path: path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn import_generator_signing_key(
    app_handle: tauri::AppHandle,
    source_path: String,
) -> Result<SigningIdentityStatus, String> {
    let source = PathBuf::from(source_path.trim());
    if !source.is_file() {
        return Err("请选择有效的签发密钥文件".to_string());
    }
    let content =
        fs::read_to_string(&source).map_err(|err| format!("无法读取所选密钥文件：{err}"))?;
    let private_key = parse_private_key(&content)?;
    let target = signing_key_path(&app_handle)?;
    write_signing_key(&target, &private_key)?;
    Ok(status_from_identity(&app_handle))
}

#[tauri::command]
fn import_issued_licenses(
    app_handle: tauri::AppHandle,
    source_paths: Vec<String>,
) -> Result<ImportedLicensesResult, String> {
    if source_paths.is_empty() {
        return Err("请选择至少一个已签发的 license 文件".to_string());
    }

    let (_private_key, public_key, _key_path) = load_signing_identity(&app_handle)?;
    let records_path = authorization_records_path(&app_handle)?;
    let mut records_file = read_authorization_records(&records_path)?;
    let now = Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true);
    let mut added_count = 0usize;
    let mut updated_count = 0usize;
    let mut failures = Vec::new();

    for source_path in source_paths {
        let trimmed_path = source_path.trim().to_string();
        let result = (|| -> Result<bool, String> {
            let source = PathBuf::from(&trimmed_path);
            if !source.is_file() {
                return Err("文件不存在或不是普通文件".to_string());
            }
            let content =
                fs::read_to_string(&source).map_err(|err| format!("无法读取文件：{err}"))?;
            let machine_id = machine_id_hint_from_license(&content)?;
            let payload =
                verify_license_content_with_key(&content, &machine_id, &public_key, NaiveDate::MIN)
                    .map_err(|err| format!("验签失败：{}", err.message))?;
            Ok(merge_imported_authorization_record(
                &mut records_file,
                &payload,
                &trimmed_path,
                &now,
            ))
        })();

        match result {
            Ok(true) => added_count += 1,
            Ok(false) => updated_count += 1,
            Err(message) => failures.push(LicenseImportFailure {
                path: trimmed_path,
                message,
            }),
        }
    }

    let imported_count = added_count + updated_count;
    if imported_count > 0 {
        write_authorization_records(&records_path, &records_file)?;
    }

    Ok(ImportedLicensesResult {
        imported_count,
        added_count,
        updated_count,
        failed_count: failures.len(),
        failures,
    })
}

fn sanitize_probe_profile(profile: ManagedApiProfile) -> Result<ManagedApiProfile, String> {
    let gateway_kind = profile.gateway_kind.unwrap_or_else(|| {
        AiGatewayKind::infer(&profile.provider, &profile.base_url, &profile.headers)
    });
    let provider = profile.provider.trim().to_string();
    let base_url = profile.base_url.trim().trim_end_matches('/').to_string();
    let api_key = profile.api_key.trim().to_string();
    let model = profile.model.trim().to_string();
    if provider.is_empty() || base_url.is_empty() || api_key.is_empty() || model.is_empty() {
        return Err("请先填写 Provider、API Base URL、API Key 和模型".to_string());
    }
    let headers = profile
        .headers
        .into_iter()
        .filter_map(|(key, value)| {
            let key = key.trim().to_string();
            let value = value.trim().to_string();
            (!key.is_empty() && !value.is_empty()).then_some((key, value))
        })
        .collect();
    Ok(ManagedApiProfile {
        gateway_kind: Some(gateway_kind),
        provider,
        base_url,
        api_key,
        model,
        headers,
    })
}

fn effective_probe_profile(profile: ManagedApiProfile) -> Result<EffectiveApiProfile, String> {
    let profile = sanitize_probe_profile(profile)?;
    let gateway_kind = profile.gateway_kind.unwrap_or_else(|| {
        AiGatewayKind::infer(&profile.provider, &profile.base_url, &profile.headers)
    });
    let key_last4 = api_key_last4(&profile.api_key);
    Ok(EffectiveApiProfile {
        source: "license_generator".to_string(),
        gateway_kind,
        provider: profile.provider,
        base_url: profile.base_url,
        api_key: profile.api_key,
        model: profile.model,
        headers: profile.headers,
        editable: true,
        key_last4,
    })
}

fn probe_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|err| format!("创建 HTTP 客户端失败：{err}"))
}

#[tauri::command]
fn test_managed_api_connection(
    profile: ManagedApiProfile,
) -> Result<ManagedApiProbeResult, String> {
    let profile = effective_probe_profile(profile)?;
    let result = ai_gateway::router::test_connection(&probe_client()?, &profile)?;
    Ok(ManagedApiProbeResult {
        ok: result.ok,
        message: result.message,
        detail: Some(result.endpoint_kind),
    })
}

#[tauri::command]
fn list_managed_api_models(profile: ManagedApiProfile) -> Result<Vec<String>, String> {
    let profile = effective_probe_profile(profile)?;
    ai_gateway::router::list_models(&probe_client()?, &profile)
}

#[tauri::command]
fn query_managed_api_balance(profile: ManagedApiProfile) -> Result<ManagedApiProbeResult, String> {
    let profile = effective_probe_profile(profile)?;
    let result = ai_gateway::router::query_api_balance(&probe_client()?, &profile)?;
    Ok(ManagedApiProbeResult {
        ok: result.available,
        message: result.display,
        detail: Some(result.endpoint_kind),
    })
}

#[tauri::command]
fn generate_license_file(
    app_handle: tauri::AppHandle,
    input: LicenseGeneratorRequest,
    out_path: Option<String>,
) -> Result<GeneratedLicense, String> {
    let (private_key, expected_public_key, _path) = load_signing_identity(&app_handle)?;
    let generated = generate_license(LicenseGeneratorInput {
        private_key,
        machine_id: input.machine_id,
        customer: input.customer,
        edition: input.edition,
        expire_at: input.expire_at,
        features: input.features,
        product: input.product,
        ai_access: input.ai_access,
    })?;
    if generated.public_key_b64 != expected_public_key {
        return Err("签发密钥校验失败".to_string());
    }

    if let Some(out_path) = out_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let path = PathBuf::from(out_path);
        if let Some(parent) = path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
        {
            fs::create_dir_all(parent).map_err(|err| format!("无法创建输出目录：{err}"))?;
        }
        fs::write(&path, &generated.license_json)
            .map_err(|err| format!("无法保存 license 文件：{err}"))?;
    }

    record_generated_license(&app_handle, &generated.payload, out_path.as_deref())?;
    Ok(generated)
}

fn show_license_generator_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("license_generator") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_license_generator_window(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            show_license_generator_window(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_generator_signing_status,
            get_authorization_registry,
            import_generator_signing_key,
            import_issued_licenses,
            test_managed_api_connection,
            list_managed_api_models,
            query_managed_api_balance,
            generate_license_file
        ])
        .run(tauri::generate_context!("tauri.generator.conf.json"))
        .expect("error while running license generator application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload(customer: &str, machine_id: &str, expire_at: &str) -> LicensePayload {
        LicensePayload {
            product: "Inspiration Drawer".to_string(),
            customer: customer.to_string(),
            machine_id: machine_id.to_string(),
            edition: LicenseEdition::Pro,
            features: vec!["*".to_string()],
            expire_at: expire_at.to_string(),
            ai_access: None,
        }
    }

    #[test]
    fn records_a_new_machine_once() {
        let mut file = AuthorizationRecordsFile {
            version: 1,
            records: Vec::new(),
        };
        upsert_authorization_record(
            &mut file,
            &payload("客户甲", "MACHINE-A", "2027-06-29"),
            Some("C:\\licenses\\customer-a.json"),
            "2026-06-29T10:00:00Z",
        );

        assert_eq!(file.records.len(), 1);
        assert_eq!(file.records[0].issue_count, 1);
        assert_eq!(file.records[0].customer, "客户甲");
        assert_eq!(
            file.records[0].last_output_path.as_deref(),
            Some("C:\\licenses\\customer-a.json")
        );
    }

    #[test]
    fn reissuing_same_product_and_machine_updates_the_existing_record() {
        let mut file = AuthorizationRecordsFile {
            version: 1,
            records: Vec::new(),
        };
        upsert_authorization_record(
            &mut file,
            &payload("旧客户名", "MACHINE-A", "2027-06-29"),
            Some("C:\\licenses\\original.json"),
            "2026-06-29T10:00:00Z",
        );
        upsert_authorization_record(
            &mut file,
            &payload("新客户名", "machine-a", "2028-06-29"),
            None,
            "2027-06-29T10:00:00Z",
        );

        assert_eq!(file.records.len(), 1);
        assert_eq!(file.records[0].issue_count, 2);
        assert_eq!(file.records[0].customer, "新客户名");
        assert_eq!(file.records[0].expire_at, "2028-06-29");
        assert_eq!(file.records[0].created_at, "2026-06-29T10:00:00Z");
        assert_eq!(file.records[0].updated_at, "2027-06-29T10:00:00Z");
        assert_eq!(
            file.records[0].last_output_path.as_deref(),
            Some("C:\\licenses\\original.json")
        );
    }

    #[test]
    fn reads_machine_id_from_a_signed_license_before_verification() {
        let private_key = general_purpose::STANDARD.encode([23u8; 32]);
        let generated = generate_license(LicenseGeneratorInput {
            private_key,
            machine_id: "machine-import".to_string(),
            customer: "导入客户".to_string(),
            edition: "pro".to_string(),
            expire_at: "2025-01-01".to_string(),
            features: vec!["*".to_string()],
            product: Some("Inspiration Drawer".to_string()),
            ai_access: None,
        })
        .unwrap();

        let machine_id = machine_id_hint_from_license(&generated.license_json).unwrap();
        assert_eq!(machine_id, "machine-import");
        let verified = verify_license_content_with_key(
            &generated.license_json,
            &machine_id,
            &generated.public_key_b64,
            NaiveDate::MIN,
        )
        .unwrap();
        assert_eq!(verified.customer, "导入客户");
    }

    #[test]
    fn importing_an_existing_record_does_not_inflate_issue_count() {
        let mut file = AuthorizationRecordsFile {
            version: 1,
            records: Vec::new(),
        };
        let original = payload("客户甲", "MACHINE-A", "2027-06-29");
        upsert_authorization_record(
            &mut file,
            &original,
            Some("C:\\licenses\\original.json"),
            "2026-06-29T10:00:00Z",
        );
        upsert_authorization_record(&mut file, &original, None, "2026-07-01T10:00:00Z");

        let imported = payload("客户甲", "machine-a", "2028-06-29");
        let was_added = merge_imported_authorization_record(
            &mut file,
            &imported,
            "D:\\archive\\customer-a.license.json",
            "2027-06-29T10:00:00Z",
        );

        assert!(!was_added);
        assert_eq!(file.records.len(), 1);
        assert_eq!(file.records[0].issue_count, 2);
        assert_eq!(file.records[0].expire_at, "2028-06-29");
        assert_eq!(
            file.records[0].last_output_path.as_deref(),
            Some("D:\\archive\\customer-a.license.json")
        );
    }

    #[test]
    fn authorization_record_never_stores_full_managed_api_key() {
        let mut file = AuthorizationRecordsFile {
            version: 1,
            records: Vec::new(),
        };
        let mut managed = payload("customer", "MACHINE-A", "2027-06-29");
        managed.edition = LicenseEdition::Enterprise;
        managed.ai_access = Some(LicenseAiAccess {
            mode: inspiration_drawer::license::types::AiCredentialMode::LicenseManaged,
            allow_user_api: false,
            managed_profile: Some(inspiration_drawer::license::types::ManagedApiProfile {
                gateway_kind: Some(AiGatewayKind::Xais),
                provider: "xais-chat".to_string(),
                base_url: "https://api.example.com/v1".to_string(),
                api_key: "sk-managed-super-secret".to_string(),
                model: "gpt-4.1".to_string(),
                headers: Default::default(),
            }),
            canvas_profile: Some(inspiration_drawer::license::types::ManagedApiProfile {
                gateway_kind: Some(AiGatewayKind::Xais),
                provider: "xais-chat".to_string(),
                base_url: "https://canvas.example.com".to_string(),
                api_key: "sk-canvas-super-secret".to_string(),
                model: "Xais Nano Pro_2K".to_string(),
                headers: Default::default(),
            }),
        });

        upsert_authorization_record(&mut file, &managed, None, "2026-06-29T10:00:00Z");
        let serialized = serde_json::to_string(&file).unwrap();

        assert!(!serialized.contains("sk-managed-super-secret"));
        assert!(!serialized.contains("sk-canvas-super-secret"));
        assert_eq!(file.records[0].api_key_last4.as_deref(), Some("cret"));
        assert_eq!(
            file.records[0].canvas_api_key_last4.as_deref(),
            Some("cret")
        );
        assert_eq!(file.records[0].ai_mode.as_deref(), Some("license_managed"));
        assert_eq!(
            file.records[0].managed_gateway_kind,
            Some(AiGatewayKind::Xais)
        );
        assert_eq!(
            file.records[0].managed_base_url.as_deref(),
            Some("https://api.example.com")
        );
        assert_eq!(
            file.records[0].canvas_base_url.as_deref(),
            Some("https://canvas.example.com")
        );
        assert_eq!(file.records[0].managed_model.as_deref(), Some("gpt-4.1"));
        assert_eq!(
            file.records[0].canvas_model.as_deref(),
            Some("Xais Nano Pro_2K")
        );
        assert!(file.records[0].api_key_fingerprint.is_some());
        assert!(file.records[0].canvas_api_key_fingerprint.is_some());
    }
}
