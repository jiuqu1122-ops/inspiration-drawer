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
pub struct LicensePayload {
    pub product: String,
    pub customer: String,
    pub machine_id: String,
    pub edition: LicenseEdition,
    #[serde(default)]
    pub features: Vec<String>,
    pub expire_at: String,
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
    pub message: Option<String>,
    pub error_code: Option<LicenseErrorCode>,
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
            message: Some("未导入授权文件".to_string()),
            error_code: Some(LicenseErrorCode::NotLicensed),
        }
    }

    pub fn from_payload(machine_id: String, payload: LicensePayload) -> Self {
        Self {
            state: payload.edition.status_state(),
            valid: true,
            machine_id,
            customer: Some(payload.customer),
            edition: Some(payload.edition),
            expire_at: Some(payload.expire_at),
            features: payload.features,
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
