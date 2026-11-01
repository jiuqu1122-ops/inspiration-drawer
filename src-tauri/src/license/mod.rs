pub mod types;
pub mod verifier;

pub use types::{FeatureCheckResult, LicenseError, LicenseStatus};
pub use verifier::{check_feature_from_status, require_feature_from_content, status_from_content};
