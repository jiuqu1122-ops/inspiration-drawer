use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

use base64::{engine::general_purpose, Engine as _};
use chrono::NaiveDate;
use tauri::Manager;

pub use crate::ai_gateway::{EffectiveApiProfile, StoredApiSettings};
use crate::license::current_machine_id;
use crate::license::types::AiGatewayKind;
use crate::license::types::{
    AiCredentialMode, LicenseEdition, LicenseError, LicenseErrorCode, LicenseFile, LicensePayload,
    ManagedApiProfile,
};
use crate::license::verifier::{verify_license_content, verify_license_content_with_key};

const LICENSE_FILE_NAME: &str = "license.json";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ApiProfileScope {
    Agent,
    Canvas,
}

pub fn api_key_last4(api_key: &str) -> Option<String> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return None;
    }
    let chars = trimmed.chars().collect::<Vec<_>>();
    let start = chars.len().saturating_sub(4);
    Some(chars[start..].iter().collect())
}

fn license_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|err| format!("io_error: 无法获取应用数据目录：{err}"))?;
    Ok(dir.join(LICENSE_FILE_NAME))
}

fn read_license_content(app_handle: &tauri::AppHandle) -> Result<Option<String>, String> {
    let path = license_path(app_handle)?;
    if !path.is_file() {
        return Ok(None);
    }
    fs::read_to_string(&path)
        .map(Some)
        .map_err(|err| format!("io_error: 无法读取授权文件：{err}"))
}

pub fn decode_license_payload_unverified(content: &str) -> Option<LicensePayload> {
    let file: LicenseFile = serde_json::from_str(content).ok()?;
    let payload_bytes = general_purpose::STANDARD
        .decode(file.payload.as_bytes())
        .ok()?;
    serde_json::from_slice(&payload_bytes).ok()
}

pub fn is_license_managed_payload(payload: &LicensePayload) -> bool {
    payload.edition == LicenseEdition::Enterprise
        && payload
            .ai_access
            .as_ref()
            .is_some_and(|access| access.mode == AiCredentialMode::LicenseManaged)
}

fn sanitize_headers(headers: BTreeMap<String, String>) -> BTreeMap<String, String> {
    headers
        .into_iter()
        .filter_map(|(key, value)| {
            let key = key.trim().to_string();
            let value = value.trim().to_string();
            (!key.is_empty() && !value.is_empty()).then_some((key, value))
        })
        .collect()
}

fn managed_profile_to_effective(profile: ManagedApiProfile) -> Result<EffectiveApiProfile, String> {
    let gateway_kind = profile.gateway_kind.unwrap_or_else(|| {
        AiGatewayKind::infer(&profile.provider, &profile.base_url, &profile.headers)
    });
    let provider = profile.provider.trim().to_string();
    let base_url = profile.base_url.trim().trim_end_matches('/').to_string();
    let api_key = profile.api_key.trim().to_string();
    let model = profile.model.trim().to_string();
    if provider.is_empty() || base_url.is_empty() || api_key.is_empty() || model.is_empty() {
        return Err("高级版授权缺少托管 API 配置，不能回退到旧 BYOK".to_string());
    }
    Ok(EffectiveApiProfile {
        source: "license_managed".to_string(),
        gateway_kind,
        provider,
        base_url,
        key_last4: api_key_last4(&api_key),
        api_key,
        model,
        headers: sanitize_headers(profile.headers),
        editable: false,
    })
}

fn user_settings_to_effective(settings: StoredApiSettings) -> EffectiveApiProfile {
    let gateway_kind = settings.gateway_kind.unwrap_or_else(|| {
        AiGatewayKind::infer(&settings.provider, &settings.base_url, &settings.headers)
    });
    let api_key = settings.api_key.trim().to_string();
    EffectiveApiProfile {
        source: "user_settings".to_string(),
        gateway_kind,
        provider: settings.provider.trim().to_string(),
        base_url: settings.base_url.trim().trim_end_matches('/').to_string(),
        key_last4: api_key_last4(&api_key),
        api_key,
        model: settings.model.trim().to_string(),
        headers: sanitize_headers(settings.headers),
        editable: true,
    }
}

fn managed_payload_to_effective(
    payload: LicensePayload,
    scope: ApiProfileScope,
) -> Result<EffectiveApiProfile, String> {
    let access = payload
        .ai_access
        .ok_or_else(|| "高级版授权缺少 AI 访问配置，不能回退到旧 BYOK".to_string())?;
    if access.mode != AiCredentialMode::LicenseManaged {
        return Err("高级版授权 AI 模式无效，不能回退到旧 BYOK".to_string());
    }
    let profile = match scope {
        ApiProfileScope::Agent => access
            .managed_profile
            .ok_or_else(|| "高级版授权缺少 Agent 托管 API 配置，不能回退到旧 BYOK".to_string())?,
        ApiProfileScope::Canvas => access
            .canvas_profile
            .or(access.managed_profile)
            .ok_or_else(|| "高级版授权缺少画布生图托管 API 配置，不能回退到旧 BYOK".to_string())?,
    };
    managed_profile_to_effective(profile)
}

pub fn resolve_effective_api_profile_from_content(
    license_content: Option<&str>,
    machine_id: &str,
    settings: StoredApiSettings,
) -> Result<EffectiveApiProfile, String> {
    resolve_effective_api_profile_from_content_with_date(
        license_content,
        machine_id,
        settings,
        ApiProfileScope::Agent,
        None,
        None,
    )
}

pub fn resolve_effective_api_profile_from_content_with_date(
    license_content: Option<&str>,
    machine_id: &str,
    settings: StoredApiSettings,
    scope: ApiProfileScope,
    today: Option<NaiveDate>,
    public_key_b64: Option<&str>,
) -> Result<EffectiveApiProfile, String> {
    let Some(content) = license_content.filter(|value| !value.trim().is_empty()) else {
        return Ok(user_settings_to_effective(settings));
    };
    let decoded_payload = decode_license_payload_unverified(content);
    let is_managed = decoded_payload
        .as_ref()
        .is_some_and(is_license_managed_payload);
    if !is_managed {
        return Ok(user_settings_to_effective(settings));
    }

    let verified = match (today, public_key_b64) {
        (Some(today), Some(public_key_b64)) => {
            verify_license_content_with_key(content, machine_id, public_key_b64, today)
        }
        _ => verify_license_content(content, machine_id),
    }
    .map_err(|err| managed_license_error(err))?;

    managed_payload_to_effective(verified, scope)
}

fn managed_license_error(err: LicenseError) -> String {
    let reason = match err.code {
        LicenseErrorCode::Expired => "高级版授权已过期",
        LicenseErrorCode::MachineMismatch => "高级版授权不属于本机",
        LicenseErrorCode::InvalidSignature => "高级版授权签名无效",
        LicenseErrorCode::MalformedLicense => "高级版授权文件格式无效",
        _ => "高级版授权无效",
    };
    format!("{reason}，不能回退到旧 BYOK：{}", err.message)
}

pub fn resolve_effective_api_profile(
    app_handle: &tauri::AppHandle,
    settings: StoredApiSettings,
) -> Result<EffectiveApiProfile, String> {
    let machine_id = current_machine_id().map_err(|err| format!("io_error: {err}"))?;
    let content = read_license_content(app_handle)?;
    resolve_effective_api_profile_from_content(content.as_deref(), &machine_id, settings)
}

pub fn resolve_effective_canvas_api_profile(
    app_handle: &tauri::AppHandle,
    settings: StoredApiSettings,
) -> Result<EffectiveApiProfile, String> {
    let machine_id = current_machine_id().map_err(|err| format!("io_error: {err}"))?;
    let content = read_license_content(app_handle)?;
    resolve_effective_api_profile_from_content_with_date(
        content.as_deref(),
        &machine_id,
        settings,
        ApiProfileScope::Canvas,
        None,
        None,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::license::types::{LicenseAiAccess, PRODUCT_NAME};
    use ed25519_dalek::{Signer, SigningKey};

    fn settings() -> StoredApiSettings {
        StoredApiSettings {
            gateway_kind: Some(AiGatewayKind::OpenAiCompatible),
            provider: "openai-compatible".to_string(),
            base_url: "https://byok.example.com/v1".to_string(),
            api_key: "sk-byok".to_string(),
            model: "byok-model".to_string(),
            headers: BTreeMap::new(),
        }
    }

    fn public_key() -> String {
        let signing_key = SigningKey::from_bytes(&[37u8; 32]);
        general_purpose::STANDARD.encode(signing_key.verifying_key().to_bytes())
    }

    fn managed_license(machine_id: &str, expire_at: &str) -> String {
        let signing_key = SigningKey::from_bytes(&[37u8; 32]);
        let payload = LicensePayload {
            product: PRODUCT_NAME.to_string(),
            customer: "managed".to_string(),
            machine_id: machine_id.to_string(),
            edition: LicenseEdition::Enterprise,
            features: vec!["*".to_string()],
            expire_at: expire_at.to_string(),
            ai_access: Some(LicenseAiAccess {
                mode: AiCredentialMode::LicenseManaged,
                allow_user_api: false,
                managed_profile: Some(ManagedApiProfile {
                    gateway_kind: Some(AiGatewayKind::Xais),
                    provider: "xais-chat".to_string(),
                    base_url: "https://api.example.com/v1".to_string(),
                    api_key: "sk-managed".to_string(),
                    model: "managed-model".to_string(),
                    headers: BTreeMap::from([("X-Test".to_string(), "ok".to_string())]),
                }),
                canvas_profile: Some(ManagedApiProfile {
                    gateway_kind: Some(AiGatewayKind::Xais),
                    provider: "xais-chat".to_string(),
                    base_url: "https://canvas.example.com".to_string(),
                    api_key: "sk-canvas".to_string(),
                    model: "Xais Nano Pro_2K".to_string(),
                    headers: BTreeMap::new(),
                }),
            }),
        };
        let payload_bytes = serde_json::to_vec(&payload).unwrap();
        let signature = signing_key.sign(&payload_bytes);
        serde_json::to_string(&LicenseFile {
            payload: general_purpose::STANDARD.encode(payload_bytes),
            signature: general_purpose::STANDARD.encode(signature.to_bytes()),
        })
        .unwrap()
    }

    #[test]
    fn old_enterprise_without_ai_access_uses_byok() {
        let legacy = serde_json::json!({
            "payload": general_purpose::STANDARD.encode(serde_json::to_vec(&serde_json::json!({
                "product": PRODUCT_NAME,
                "customer": "legacy",
                "machine_id": "machine-a",
                "edition": "enterprise",
                "features": ["*"],
                "expire_at": "2099-01-01"
            })).unwrap()),
            "signature": "not-needed-for-unmanaged-compat"
        })
        .to_string();

        let profile = resolve_effective_api_profile_from_content_with_date(
            Some(&legacy),
            "machine-a",
            settings(),
            ApiProfileScope::Agent,
            Some(NaiveDate::from_ymd_opt(2026, 7, 12).unwrap()),
            Some(&public_key()),
        )
        .unwrap();

        assert_eq!(profile.source, "user_settings");
        assert_eq!(profile.api_key, "sk-byok");
        assert!(profile.editable);
    }

    #[test]
    fn valid_managed_license_uses_license_api() {
        let license = managed_license("machine-a", "2099-01-01");
        let profile = resolve_effective_api_profile_from_content_with_date(
            Some(&license),
            "machine-a",
            settings(),
            ApiProfileScope::Agent,
            Some(NaiveDate::from_ymd_opt(2026, 7, 12).unwrap()),
            Some(&public_key()),
        )
        .unwrap();

        assert_eq!(profile.source, "license_managed");
        assert_eq!(profile.gateway_kind, AiGatewayKind::Xais);
        assert_eq!(profile.api_key, "sk-managed");
        assert_eq!(profile.base_url, "https://api.example.com/v1");
        assert_eq!(profile.model, "managed-model");
        assert!(!profile.editable);
    }

    #[test]
    fn legacy_managed_profile_without_gateway_kind_is_inferred() {
        let profile = managed_profile_to_effective(ManagedApiProfile {
            gateway_kind: None,
            provider: "xais-chat".to_string(),
            base_url: "https://xais.example.com/v1".to_string(),
            api_key: "sk-managed".to_string(),
            model: "legacy-model".to_string(),
            headers: BTreeMap::new(),
        })
        .unwrap();

        assert_eq!(profile.gateway_kind, AiGatewayKind::Xais);
        assert_eq!(profile.source, "license_managed");
    }

    #[test]
    fn canvas_reuses_managed_profile_when_legacy_license_has_no_canvas_profile() {
        let payload = LicensePayload {
            product: PRODUCT_NAME.to_string(),
            customer: "legacy-managed".to_string(),
            machine_id: "machine-a".to_string(),
            edition: LicenseEdition::Enterprise,
            features: vec!["*".to_string()],
            expire_at: "2099-01-01".to_string(),
            ai_access: Some(LicenseAiAccess {
                mode: AiCredentialMode::LicenseManaged,
                allow_user_api: false,
                managed_profile: Some(ManagedApiProfile {
                    gateway_kind: None,
                    provider: "new-api".to_string(),
                    base_url: "https://gateway.example.com/v1".to_string(),
                    api_key: "sk-managed".to_string(),
                    model: "image-model".to_string(),
                    headers: BTreeMap::new(),
                }),
                canvas_profile: None,
            }),
        };

        let profile = managed_payload_to_effective(payload, ApiProfileScope::Canvas).unwrap();
        assert_eq!(profile.gateway_kind, AiGatewayKind::NewApi);
        assert_eq!(profile.api_key, "sk-managed");
        assert_eq!(profile.model, "image-model");
        assert!(!profile.editable);
    }

    #[test]
    fn managed_license_machine_mismatch_does_not_fallback_to_byok() {
        let license = managed_license("machine-a", "2099-01-01");
        let err = resolve_effective_api_profile_from_content_with_date(
            Some(&license),
            "machine-b",
            settings(),
            ApiProfileScope::Agent,
            Some(NaiveDate::from_ymd_opt(2026, 7, 12).unwrap()),
            Some(&public_key()),
        )
        .unwrap_err();

        assert!(err.contains("不能回退"));
        assert!(err.contains("本机"));
    }

    #[test]
    fn expired_managed_license_does_not_fallback_to_byok() {
        let license = managed_license("machine-a", "2025-01-01");
        let err = resolve_effective_api_profile_from_content_with_date(
            Some(&license),
            "machine-a",
            settings(),
            ApiProfileScope::Agent,
            Some(NaiveDate::from_ymd_opt(2026, 7, 12).unwrap()),
            Some(&public_key()),
        )
        .unwrap_err();

        assert!(err.contains("过期"));
        assert!(err.contains("不能回退"));
    }
}
