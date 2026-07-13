use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

pub const PRODUCT_NAME: &str = "Inspiration Drawer";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LicenseEdition {
    Trial,
    Pro,
    Enterprise,
}

impl LicenseEdition {
    pub fn status_state(&self) -> LicenseState {
        match self {
            LicenseEdition::Trial => LicenseState::Trial,
            LicenseEdition::Pro => LicenseState::Pro,
            LicenseEdition::Enterprise => LicenseState::Enterprise,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LicenseState {
    Unlicensed,
    Trial,
    Pro,
    Enterprise,
    Expired,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LicenseErrorCode {
    NotLicensed,
    MalformedLicense,
    InvalidSignature,
    MachineMismatch,
    ProductMismatch,
    Expired,
    FeatureNotLicensed,
    IoError,
    InvalidPublicKey,
}

impl LicenseErrorCode {
    pub fn as_str(&self) -> &'static str {
        match self {
            LicenseErrorCode::NotLicensed => "not_licensed",
            LicenseErrorCode::MalformedLicense => "malformed_license",
            LicenseErrorCode::InvalidSignature => "invalid_signature",
            LicenseErrorCode::MachineMismatch => "machine_mismatch",
            LicenseErrorCode::ProductMismatch => "product_mismatch",
            LicenseErrorCode::Expired => "expired",
            LicenseErrorCode::FeatureNotLicensed => "feature_not_licensed",
            LicenseErrorCode::IoError => "io_error",
            LicenseErrorCode::InvalidPublicKey => "invalid_public_key",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AiCredentialMode {
    Byok,
    LicenseManaged,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ManagedApiProfile {
    pub provider: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LicenseAiAccess {
    pub mode: AiCredentialMode,
    pub allow_user_api: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub managed_profile: Option<ManagedApiProfile>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub canvas_profile: Option<ManagedApiProfile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseAiAccessSummary {
    pub mode: AiCredentialMode,
    pub allow_user_api: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub managed_provider: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub managed_base_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub managed_model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key_last4: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub canvas_provider: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub canvas_base_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub canvas_model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub canvas_api_key_last4: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LicensePayload {
    pub product: String,
    pub customer: String,
    pub machine_id: String,
    pub edition: LicenseEdition,
    #[serde(default)]
    pub features: Vec<String>,
    pub expire_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ai_access: Option<LicenseAiAccess>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LicenseFile {
    pub payload: String,
    pub signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseStatus {
    pub state: LicenseState,
    pub valid: bool,
    pub machine_id: String,
    pub customer: Option<String>,
    pub edition: Option<LicenseEdition>,
    pub expire_at: Option<String>,
    pub features: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ai_access: Option<LicenseAiAccessSummary>,
    pub message: Option<String>,
    pub error_code: Option<LicenseErrorCode>,
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

impl From<&LicenseAiAccess> for LicenseAiAccessSummary {
    fn from(value: &LicenseAiAccess) -> Self {
        let managed_profile = value.managed_profile.as_ref();
        let canvas_profile = value.canvas_profile.as_ref();
        Self {
            mode: value.mode.clone(),
            allow_user_api: value.allow_user_api,
            managed_provider: managed_profile.map(|profile| profile.provider.clone()),
            managed_base_url: managed_profile.map(|profile| profile.base_url.clone()),
            managed_model: managed_profile.map(|profile| profile.model.clone()),
            api_key_last4: managed_profile.and_then(|profile| api_key_last4(&profile.api_key)),
            canvas_provider: canvas_profile.map(|profile| profile.provider.clone()),
            canvas_base_url: canvas_profile.map(|profile| profile.base_url.clone()),
            canvas_model: canvas_profile.map(|profile| profile.model.clone()),
            canvas_api_key_last4: canvas_profile
                .and_then(|profile| api_key_last4(&profile.api_key)),
        }
    }
}

impl LicenseStatus {
    pub fn unlicensed(machine_id: String) -> Self {
        Self {
            state: LicenseState::Unlicensed,
            valid: false,
            machine_id,
            customer: None,
            edition: None,
            expire_at: None,
            features: Vec::new(),
            ai_access: None,
            message: Some("未导入授权文件".to_string()),
            error_code: Some(LicenseErrorCode::NotLicensed),
        }
    }

    pub fn from_payload(machine_id: String, payload: LicensePayload) -> Self {
        let ai_access = payload.ai_access.as_ref().map(LicenseAiAccessSummary::from);
        Self {
            state: payload.edition.status_state(),
            valid: true,
            machine_id,
            customer: Some(payload.customer),
            edition: Some(payload.edition),
            expire_at: Some(payload.expire_at),
            features: payload.features,
            ai_access,
            message: Some("授权有效".to_string()),
            error_code: None,
        }
    }

    pub fn invalid(machine_id: String, code: LicenseErrorCode, message: String) -> Self {
        let state = if code == LicenseErrorCode::Expired {
            LicenseState::Expired
        } else {
            LicenseState::Unlicensed
        };
        Self {
            state,
            valid: false,
            machine_id,
            customer: None,
            edition: None,
            expire_at: None,
            features: Vec::new(),
            ai_access: None,
            message: Some(message),
            error_code: Some(code),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureCheckResult {
    pub feature: String,
    pub allowed: bool,
    pub status: LicenseStatus,
    pub message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LicenseError {
    pub code: LicenseErrorCode,
    pub message: String,
}

impl LicenseError {
    pub fn new(code: LicenseErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

impl std::fmt::Display for LicenseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for LicenseError {}
