use base64::{engine::general_purpose, Engine as _};
use chrono::{NaiveDate, Utc};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};

use super::types::{
    FeatureCheckResult, LicenseError, LicenseErrorCode, LicenseFile, LicensePayload, LicenseStatus,
    PRODUCT_NAME,
};

const DEFAULT_PUBLIC_KEY_B64: &str = "AAS4rzI5dxFefYmQCNp1wYpYgKwMXp5+wG1WgF/UoRQ=";

pub fn runtime_public_key_b64() -> Result<&'static str, LicenseError> {
    Ok(DEFAULT_PUBLIC_KEY_B64)
}

pub fn verify_license_content(
    content: &str,
    machine_id: &str,
) -> Result<LicensePayload, LicenseError> {
    let public_key_b64 = runtime_public_key_b64()?;
    verify_license_content_with_key(content, machine_id, public_key_b64, Utc::now().date_naive())
}

pub fn verify_license_content_with_key(
    content: &str,
    machine_id: &str,
    public_key_b64: &str,
    today: NaiveDate,
) -> Result<LicensePayload, LicenseError> {
    let license_file: LicenseFile = serde_json::from_str(content)
        .map_err(|_| LicenseError::new(LicenseErrorCode::MalformedLicense, "授权文件格式无效"))?;

    let payload_bytes = general_purpose::STANDARD
        .decode(license_file.payload.as_bytes())
        .map_err(|_| {
            LicenseError::new(
                LicenseErrorCode::MalformedLicense,
                "授权 payload 不是有效 Base64",
            )
        })?;
    let signature_bytes = general_purpose::STANDARD
        .decode(license_file.signature.as_bytes())
        .map_err(|_| {
            LicenseError::new(
                LicenseErrorCode::MalformedLicense,
                "授权签名不是有效 Base64",
            )
        })?;
    let public_key_bytes = general_purpose::STANDARD
        .decode(public_key_b64.as_bytes())
        .map_err(|_| {
            LicenseError::new(
                LicenseErrorCode::InvalidPublicKey,
                "内置授权公钥不是有效 Base64",
            )
        })?;

    let public_key_array: [u8; 32] = public_key_bytes.as_slice().try_into().map_err(|_| {
        LicenseError::new(LicenseErrorCode::InvalidPublicKey, "内置授权公钥长度无效")
    })?;
    let verifying_key = VerifyingKey::from_bytes(&public_key_array)
        .map_err(|_| LicenseError::new(LicenseErrorCode::InvalidPublicKey, "内置授权公钥无效"))?;
    let signature = Signature::from_slice(&signature_bytes)
        .map_err(|_| LicenseError::new(LicenseErrorCode::InvalidSignature, "签名无效"))?;

    verifying_key
        .verify(&payload_bytes, &signature)
        .map_err(|_| LicenseError::new(LicenseErrorCode::InvalidSignature, "签名无效"))?;

    let payload: LicensePayload = serde_json::from_slice(&payload_bytes).map_err(|_| {
        LicenseError::new(
            LicenseErrorCode::MalformedLicense,
            "授权 payload 不是有效 JSON",
        )
    })?;

    validate_payload(&payload, machine_id, today)?;
    Ok(payload)
}

pub fn status_from_content(content: Option<&str>, machine_id: String) -> LicenseStatus {
    match content {
        Some(content) if !content.trim().is_empty() => {
            match verify_license_content(content, &machine_id) {
                Ok(payload) => LicenseStatus::from_payload(machine_id, payload),
                Err(err) => LicenseStatus::invalid(machine_id, err.code, err.message),
            }
        }
        _ => LicenseStatus::unlicensed(machine_id),
    }
}

pub fn check_feature_from_status(status: LicenseStatus, feature: &str) -> FeatureCheckResult {
    let normalized_feature = feature.trim().to_ascii_lowercase();
    let allowed = status.valid
        && !normalized_feature.is_empty()
        && status
            .features
            .iter()
            .any(|item| item == "*" || item.trim().eq_ignore_ascii_case(&normalized_feature));
    let message = if allowed {
        Some("功能已授权".to_string())
    } else if !status.valid {
        status
            .message
            .clone()
            .or_else(|| Some("未授权".to_string()))
    } else {
        Some(format!("功能未授权：{}", feature))
    };

    FeatureCheckResult {
        feature: feature.to_string(),
        allowed,
        status,
        message,
    }
}

pub fn require_feature_from_content(
    content: Option<&str>,
    machine_id: String,
    feature: &str,
) -> Result<(), LicenseError> {
    let status = status_from_content(content, machine_id);
    if !status.valid {
        return Err(LicenseError::new(
            status.error_code.unwrap_or(LicenseErrorCode::NotLicensed),
            status.message.unwrap_or_else(|| "未授权".to_string()),
        ));
    }

    let result = check_feature_from_status(status, feature);
    if result.allowed {
        Ok(())
    } else {
        Err(LicenseError::new(
            LicenseErrorCode::FeatureNotLicensed,
            result
                .message
                .unwrap_or_else(|| format!("功能未授权：{}", feature)),
        ))
    }
}

fn validate_payload(
    payload: &LicensePayload,
    machine_id: &str,
    today: NaiveDate,
) -> Result<(), LicenseError> {
    if payload.product.trim() != PRODUCT_NAME {
        return Err(LicenseError::new(
            LicenseErrorCode::ProductMismatch,
            "授权产品不匹配",
        ));
    }
    if payload.machine_id.trim() != machine_id.trim() {
        return Err(LicenseError::new(
            LicenseErrorCode::MachineMismatch,
            "机器码不匹配",
        ));
    }
    let expire_at =
        NaiveDate::parse_from_str(payload.expire_at.trim(), "%Y-%m-%d").map_err(|_| {
            LicenseError::new(LicenseErrorCode::MalformedLicense, "授权到期日期格式无效")
        })?;
    if expire_at < today {
        return Err(LicenseError::new(LicenseErrorCode::Expired, "授权过期"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::license::types::{
        AiCredentialMode, AiGatewayKind, LicenseAiAccess, LicenseEdition, ManagedApiProfile,
    };
    use ed25519_dalek::{Signer, SigningKey};

    fn signed_license(machine_id: &str, expire_at: &str, features: Vec<&str>) -> (String, String) {
        let signing_key = SigningKey::from_bytes(&[7u8; 32]);
        let verifying_key = signing_key.verifying_key();
        let public_key_b64 = general_purpose::STANDARD.encode(verifying_key.to_bytes());
        let payload = LicensePayload {
            license_id: None,
            product: PRODUCT_NAME.to_string(),
            customer: "测试客户".to_string(),
            machine_id: machine_id.to_string(),
            edition: LicenseEdition::Pro,
            features: features.into_iter().map(str::to_string).collect(),
            expire_at: expire_at.to_string(),
            ai_access: None,
        };
        let payload_bytes = serde_json::to_vec(&payload).unwrap();
        let signature = signing_key.sign(&payload_bytes);
        let file = LicenseFile {
            payload: general_purpose::STANDARD.encode(payload_bytes),
            signature: general_purpose::STANDARD.encode(signature.to_bytes()),
        };
        (serde_json::to_string(&file).unwrap(), public_key_b64)
    }

    #[test]
    fn verifies_valid_signature() {
        let (license, public_key) = signed_license("machine-a", "2099-01-01", vec!["hd_export"]);
        let payload = verify_license_content_with_key(
            &license,
            "machine-a",
            &public_key,
            NaiveDate::from_ymd_opt(2026, 6, 18).unwrap(),
        )
        .unwrap();
        assert_eq!(payload.customer, "测试客户");
    }

    #[test]
    fn rejects_modified_payload() {
        let (license, public_key) = signed_license("machine-a", "2099-01-01", vec!["hd_export"]);
        let mut parsed: LicenseFile = serde_json::from_str(&license).unwrap();
        let mut payload_bytes = general_purpose::STANDARD
            .decode(parsed.payload.as_bytes())
            .unwrap();
        payload_bytes.push(b' ');
        parsed.payload = general_purpose::STANDARD.encode(payload_bytes);
        let tampered = serde_json::to_string(&parsed).unwrap();
        let err = verify_license_content_with_key(
            &tampered,
            "machine-a",
            &public_key,
            NaiveDate::from_ymd_opt(2026, 6, 18).unwrap(),
        )
        .unwrap_err();
        assert_eq!(err.code, LicenseErrorCode::InvalidSignature);
    }

    #[test]
    fn rejects_machine_mismatch() {
        let (license, public_key) = signed_license("machine-a", "2099-01-01", vec!["hd_export"]);
        let err = verify_license_content_with_key(
            &license,
            "machine-b",
            &public_key,
            NaiveDate::from_ymd_opt(2026, 6, 18).unwrap(),
        )
        .unwrap_err();
        assert_eq!(err.code, LicenseErrorCode::MachineMismatch);
    }

    #[test]
    fn rejects_expired_license() {
        let (license, public_key) = signed_license("machine-a", "2025-01-01", vec!["hd_export"]);
        let err = verify_license_content_with_key(
            &license,
            "machine-a",
            &public_key,
            NaiveDate::from_ymd_opt(2026, 6, 18).unwrap(),
        )
        .unwrap_err();
        assert_eq!(err.code, LicenseErrorCode::Expired);
    }

    #[test]
    fn rejects_unlicensed_feature() {
        let (license, public_key) = signed_license("machine-a", "2099-01-01", vec!["hd_export"]);
        let payload = verify_license_content_with_key(
            &license,
            "machine-a",
            &public_key,
            NaiveDate::from_ymd_opt(2026, 6, 18).unwrap(),
        )
        .unwrap();
        let status = LicenseStatus::from_payload("machine-a".to_string(), payload);
        let result = check_feature_from_status(status, "batch_render");
        assert!(!result.allowed);
        assert!(result.message.unwrap().contains("功能未授权"));
    }

    #[test]
    fn old_license_payload_without_ai_access_still_verifies() {
        let signing_key = SigningKey::from_bytes(&[13u8; 32]);
        let public_key_b64 =
            general_purpose::STANDARD.encode(signing_key.verifying_key().to_bytes());
        let payload = serde_json::json!({
            "product": PRODUCT_NAME,
            "customer": "legacy",
            "machine_id": "machine-legacy",
            "edition": "enterprise",
            "features": ["*"],
            "expire_at": "2099-01-01"
        });
        let payload_bytes = serde_json::to_vec(&payload).unwrap();
        let signature = signing_key.sign(&payload_bytes);
        let file = LicenseFile {
            payload: general_purpose::STANDARD.encode(payload_bytes),
            signature: general_purpose::STANDARD.encode(signature.to_bytes()),
        };
        let content = serde_json::to_string(&file).unwrap();
        let verified = verify_license_content_with_key(
            &content,
            "machine-legacy",
            &public_key_b64,
            NaiveDate::from_ymd_opt(2026, 6, 18).unwrap(),
        )
        .unwrap();

        assert_eq!(verified.edition, LicenseEdition::Enterprise);
        assert!(verified.ai_access.is_none());
    }

    #[test]
    fn managed_api_fields_are_protected_by_signature() {
        let signing_key = SigningKey::from_bytes(&[17u8; 32]);
        let public_key_b64 =
            general_purpose::STANDARD.encode(signing_key.verifying_key().to_bytes());
        let payload = LicensePayload {
            license_id: None,
            product: PRODUCT_NAME.to_string(),
            customer: "managed".to_string(),
            machine_id: "machine-managed".to_string(),
            edition: LicenseEdition::Enterprise,
            features: vec!["*".to_string()],
            expire_at: "2099-01-01".to_string(),
            ai_access: Some(LicenseAiAccess {
                mode: AiCredentialMode::LicenseManaged,
                allow_user_api: false,
                managed_profile: Some(ManagedApiProfile {
                    gateway_kind: Some(AiGatewayKind::Xais),
                    provider: "xais-chat".to_string(),
                    base_url: "https://api.example.com/v1".to_string(),
                    api_key: "sk-original".to_string(),
                    model: "gpt-4.1".to_string(),
                    headers: Default::default(),
                }),
                canvas_profile: Some(ManagedApiProfile {
                    gateway_kind: Some(AiGatewayKind::Xais),
                    provider: "xais-chat".to_string(),
                    base_url: "https://canvas.example.com".to_string(),
                    api_key: "sk-canvas".to_string(),
                    model: "Xais Nano Pro_2K".to_string(),
                    headers: Default::default(),
                }),
            }),
        };
        let payload_bytes = serde_json::to_vec(&payload).unwrap();
        let signature = signing_key.sign(&payload_bytes);
        for (pointer, replacement) in [
            (
                "/ai_access/managed_profile/gateway_kind",
                serde_json::json!("new_api"),
            ),
            (
                "/ai_access/managed_profile/base_url",
                serde_json::json!("https://tampered.example.com/v1"),
            ),
            (
                "/ai_access/managed_profile/api_key",
                serde_json::json!("sk-tampered"),
            ),
            (
                "/ai_access/managed_profile/model",
                serde_json::json!("tampered-model"),
            ),
        ] {
            let mut tampered_payload: serde_json::Value =
                serde_json::from_slice(&payload_bytes).unwrap();
            *tampered_payload.pointer_mut(pointer).unwrap() = replacement;
            let file = LicenseFile {
                payload: general_purpose::STANDARD
                    .encode(serde_json::to_vec(&tampered_payload).unwrap()),
                signature: general_purpose::STANDARD.encode(signature.to_bytes()),
            };
            let content = serde_json::to_string(&file).unwrap();
            let err = verify_license_content_with_key(
                &content,
                "machine-managed",
                &public_key_b64,
                NaiveDate::from_ymd_opt(2026, 6, 18).unwrap(),
            )
            .unwrap_err();
            assert_eq!(err.code, LicenseErrorCode::InvalidSignature, "{pointer}");
        }
    }
}
