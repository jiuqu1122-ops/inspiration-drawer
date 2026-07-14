use std::collections::{BTreeMap, HashSet};

use base64::{engine::general_purpose, Engine as _};
use chrono::NaiveDate;
use ed25519_dalek::{Signer, SigningKey};
use rand_core::OsRng;
use serde::{Deserialize, Serialize};

use super::types::{
    AiCredentialMode, AiGatewayKind, LicenseAiAccess, LicenseEdition, LicenseFile, LicensePayload,
    ManagedApiProfile, PRODUCT_NAME,
};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseGeneratorInput {
    pub private_key: String,
    pub machine_id: String,
    pub customer: String,
    pub edition: String,
    pub expire_at: String,
    #[serde(default)]
    pub features: Vec<String>,
    pub product: Option<String>,
    #[serde(default)]
    pub ai_access: Option<LicenseAiAccess>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedKeypair {
    pub private_key_b64: String,
    pub public_key_b64: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedLicense {
    pub license_json: String,
    pub public_key_b64: String,
    pub payload: LicensePayload,
}

pub fn generate_keypair() -> GeneratedKeypair {
    let signing_key = SigningKey::generate(&mut OsRng);
    GeneratedKeypair {
        private_key_b64: general_purpose::STANDARD.encode(signing_key.to_bytes()),
        public_key_b64: general_purpose::STANDARD.encode(signing_key.verifying_key().to_bytes()),
    }
}

pub fn signing_key_from_base64(value: &str) -> Result<SigningKey, String> {
    let bytes = general_purpose::STANDARD
        .decode(value.trim().as_bytes())
        .map_err(|err| format!("私钥不是有效 Base64：{err}"))?;

    match bytes.len() {
        32 => {
            let secret: [u8; 32] = bytes
                .as_slice()
                .try_into()
                .map_err(|_| "私钥长度无效".to_string())?;
            Ok(SigningKey::from_bytes(&secret))
        }
        64 => {
            let secret: [u8; 32] = bytes[..32]
                .try_into()
                .map_err(|_| "密钥对中的私钥长度无效".to_string())?;
            let signing_key = SigningKey::from_bytes(&secret);
            if signing_key.verifying_key().to_bytes() != bytes[32..] {
                return Err("64 字节密钥对里的公钥与私钥不匹配".to_string());
            }
            Ok(signing_key)
        }
        _ => Err("私钥解码后必须是 32 字节私钥或 64 字节密钥对".to_string()),
    }
}

pub fn public_key_from_private_key(value: &str) -> Result<String, String> {
    let signing_key = signing_key_from_base64(value)?;
    Ok(general_purpose::STANDARD.encode(signing_key.verifying_key().to_bytes()))
}

pub fn parse_edition(value: &str) -> Result<LicenseEdition, String> {
    match value.trim().to_ascii_lowercase().as_str() {
        "trial" => Ok(LicenseEdition::Trial),
        "pro" => Ok(LicenseEdition::Pro),
        "enterprise" => Ok(LicenseEdition::Enterprise),
        _ => Err("版本类型必须是 trial、pro 或 enterprise".to_string()),
    }
}

pub fn normalize_features(features: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut output = Vec::new();

    for feature in features {
        let value = feature.trim().to_ascii_lowercase();
        if value == "*" {
            return vec!["*".to_string()];
        }
        if value.is_empty() || !seen.insert(value.clone()) {
            continue;
        }
        output.push(value);
    }

    if output.is_empty() {
        output.push("*".to_string());
    }

    output
}

fn normalize_headers(headers: BTreeMap<String, String>) -> BTreeMap<String, String> {
    headers
        .into_iter()
        .filter_map(|(key, value)| {
            let key = key.trim().to_string();
            let value = value.trim().to_string();
            (!key.is_empty() && !value.is_empty()).then_some((key, value))
        })
        .collect()
}

fn validate_managed_profile(profile: ManagedApiProfile) -> Result<ManagedApiProfile, String> {
    let gateway_kind = profile.gateway_kind.unwrap_or_else(|| {
        AiGatewayKind::infer(&profile.provider, &profile.base_url, &profile.headers)
    });
    let provider = profile.provider.trim().to_string();
    let base_url = profile.base_url.trim().trim_end_matches('/').to_string();
    let api_key = profile.api_key.trim().to_string();
    let model = profile.model.trim().to_string();
    if provider.is_empty() {
        return Err("高级版托管 API 必须填写 Provider".to_string());
    }
    if base_url.is_empty() {
        return Err("高级版托管 API 必须填写 API Base URL".to_string());
    }
    if api_key.is_empty() {
        return Err("高级版托管 API 必须填写 API Key".to_string());
    }
    if model.is_empty() {
        return Err("高级版托管 API 必须填写模型".to_string());
    }
    Ok(ManagedApiProfile {
        gateway_kind: Some(gateway_kind),
        provider,
        base_url,
        api_key,
        model,
        headers: normalize_headers(profile.headers),
    })
}

pub fn resolve_license_ai_access(
    edition: &LicenseEdition,
    ai_access: Option<LicenseAiAccess>,
) -> Result<Option<LicenseAiAccess>, String> {
    match edition {
        LicenseEdition::Pro => Ok(Some(LicenseAiAccess {
            mode: AiCredentialMode::Byok,
            allow_user_api: true,
            managed_profile: None,
            canvas_profile: None,
        })),
        LicenseEdition::Enterprise => {
            let access = ai_access.ok_or_else(|| "高级版授权必须包含托管 API 配置".to_string())?;
            let agent_profile = access
                .managed_profile
                .ok_or_else(|| "高级版授权必须包含 Agent 托管 API 配置".to_string())?;
            let canvas_profile = access
                .canvas_profile
                .ok_or_else(|| "高级版授权必须包含画布生图托管 API 配置".to_string())?;
            Ok(Some(LicenseAiAccess {
                mode: AiCredentialMode::LicenseManaged,
                allow_user_api: false,
                managed_profile: Some(validate_managed_profile(agent_profile)?),
                canvas_profile: Some(validate_managed_profile(canvas_profile)?),
            }))
        }
        LicenseEdition::Trial => Ok(ai_access),
    }
}

pub fn generate_license(input: LicenseGeneratorInput) -> Result<GeneratedLicense, String> {
    let signing_key = signing_key_from_base64(&input.private_key)?;
    let machine_id = input.machine_id.trim().to_string();
    if machine_id.is_empty() {
        return Err("机器码不能为空".to_string());
    }
    let customer = input.customer.trim().to_string();
    if customer.is_empty() {
        return Err("客户名称不能为空".to_string());
    }
    let expire_at = input.expire_at.trim().to_string();
    NaiveDate::parse_from_str(&expire_at, "%Y-%m-%d")
        .map_err(|_| "到期时间必须是 YYYY-MM-DD".to_string())?;

    let edition = parse_edition(&input.edition)?;
    let ai_access = resolve_license_ai_access(&edition, input.ai_access)?;

    let payload = LicensePayload {
        product: input
            .product
            .unwrap_or_else(|| PRODUCT_NAME.to_string())
            .trim()
            .to_string(),
        customer,
        machine_id,
        edition,
        features: normalize_features(input.features),
        expire_at,
        ai_access,
    };

    if payload.product.is_empty() {
        return Err("产品名不能为空".to_string());
    }

    let payload_bytes =
        serde_json::to_vec(&payload).map_err(|err| format!("编码 payload 失败：{err}"))?;
    let signature = signing_key.sign(&payload_bytes);
    let license = LicenseFile {
        payload: general_purpose::STANDARD.encode(payload_bytes),
        signature: general_purpose::STANDARD.encode(signature.to_bytes()),
    };
    let license_json = serde_json::to_string_pretty(&license)
        .map_err(|err| format!("编码 license 失败：{err}"))?;

    Ok(GeneratedLicense {
        license_json,
        public_key_b64: general_purpose::STANDARD.encode(signing_key.verifying_key().to_bytes()),
        payload,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::engine::general_purpose;

    fn private_key() -> String {
        general_purpose::STANDARD.encode([31u8; 32])
    }

    #[test]
    fn defaults_empty_features_to_full_license() {
        assert_eq!(normalize_features(Vec::new()), vec!["*".to_string()]);
        assert_eq!(
            normalize_features(vec![" ".to_string()]),
            vec!["*".to_string()]
        );
    }

    #[test]
    fn wildcard_feature_grants_full_license() {
        assert_eq!(
            normalize_features(vec!["hd_export".to_string(), "*".to_string()]),
            vec!["*".to_string()]
        );
    }

    #[test]
    fn pro_license_generation_uses_byok_without_managed_api() {
        let generated = generate_license(LicenseGeneratorInput {
            private_key: private_key(),
            machine_id: "machine-pro".to_string(),
            customer: "customer".to_string(),
            edition: "pro".to_string(),
            expire_at: "2099-01-01".to_string(),
            features: vec!["*".to_string()],
            product: Some(PRODUCT_NAME.to_string()),
            ai_access: None,
        })
        .unwrap();

        let access = generated.payload.ai_access.unwrap();
        assert_eq!(access.mode, AiCredentialMode::Byok);
        assert!(access.allow_user_api);
        assert!(access.managed_profile.is_none());
        assert!(access.canvas_profile.is_none());
    }

    #[test]
    fn enterprise_license_generation_requires_managed_api() {
        let err = generate_license(LicenseGeneratorInput {
            private_key: private_key(),
            machine_id: "machine-ent".to_string(),
            customer: "customer".to_string(),
            edition: "enterprise".to_string(),
            expire_at: "2099-01-01".to_string(),
            features: vec!["*".to_string()],
            product: Some(PRODUCT_NAME.to_string()),
            ai_access: None,
        })
        .unwrap_err();

        assert!(err.contains("高级版"));
    }

    #[test]
    fn enterprise_license_generation_embeds_managed_api() {
        let generated = generate_license(LicenseGeneratorInput {
            private_key: private_key(),
            machine_id: "machine-ent".to_string(),
            customer: "customer".to_string(),
            edition: "enterprise".to_string(),
            expire_at: "2099-01-01".to_string(),
            features: vec!["*".to_string()],
            product: Some(PRODUCT_NAME.to_string()),
            ai_access: Some(LicenseAiAccess {
                mode: AiCredentialMode::LicenseManaged,
                allow_user_api: false,
                managed_profile: Some(ManagedApiProfile {
                    gateway_kind: Some(AiGatewayKind::Xais),
                    provider: "xais-chat".to_string(),
                    base_url: "https://api.example.com/v1/".to_string(),
                    api_key: "sk-managed-secret".to_string(),
                    model: "gpt-4.1".to_string(),
                    headers: BTreeMap::from([("X-Test".to_string(), "ok".to_string())]),
                }),
                canvas_profile: Some(ManagedApiProfile {
                    gateway_kind: Some(AiGatewayKind::Xais),
                    provider: "xais-chat".to_string(),
                    base_url: "https://xais.example.com/".to_string(),
                    api_key: "sk-canvas-secret".to_string(),
                    model: "Xais Nano Pro_2K".to_string(),
                    headers: BTreeMap::new(),
                }),
            }),
        })
        .unwrap();

        let access = generated.payload.ai_access.unwrap();
        assert_eq!(access.mode, AiCredentialMode::LicenseManaged);
        assert!(!access.allow_user_api);
        let profile = access.managed_profile.unwrap();
        assert_eq!(profile.provider, "xais-chat");
        assert_eq!(profile.base_url, "https://api.example.com/v1");
        assert_eq!(profile.model, "gpt-4.1");
        assert_eq!(profile.api_key, "sk-managed-secret");
        let canvas_profile = access.canvas_profile.unwrap();
        assert_eq!(canvas_profile.provider, "xais-chat");
        assert_eq!(canvas_profile.base_url, "https://xais.example.com");
        assert_eq!(canvas_profile.api_key, "sk-canvas-secret");
    }
}
