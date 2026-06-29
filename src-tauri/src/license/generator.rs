use std::collections::HashSet;

use base64::{engine::general_purpose, Engine as _};
use chrono::NaiveDate;
use ed25519_dalek::{Signer, SigningKey};
use rand_core::OsRng;
use serde::{Deserialize, Serialize};

use super::types::{LicenseEdition, LicenseFile, LicensePayload, PRODUCT_NAME};

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

    let payload = LicensePayload {
        product: input
            .product
            .unwrap_or_else(|| PRODUCT_NAME.to_string())
            .trim()
            .to_string(),
        customer,
        machine_id,
        edition: parse_edition(&input.edition)?,
        features: normalize_features(input.features),
        expire_at,
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
}
