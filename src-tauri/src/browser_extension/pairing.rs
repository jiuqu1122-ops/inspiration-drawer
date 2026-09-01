use hmac::{Hmac, Mac};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use super::browser_detection::BrowserKind;

type HmacSha256 = Hmac<Sha256>;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairedExtension {
    pub browser: BrowserKind,
    pub extension_id: String,
    pub paired_at: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingConfig {
    pub extension_pairing_token: String,
    #[serde(default)]
    pub paired_extensions: BTreeMap<String, PairedExtension>,
    #[serde(default)]
    pub setup_prompt_dismissed: bool,
}

impl PairingConfig {
    pub fn load_or_create(path: &Path) -> Result<Self, String> {
        if path.is_file() {
            let raw = fs::read_to_string(path).map_err(|error| error.to_string())?;
            let parsed: PairingConfig =
                serde_json::from_str(&raw).map_err(|error| error.to_string())?;
            if parsed.extension_pairing_token.len() >= 32 {
                return Ok(parsed);
            }
        }
        let config = Self {
            extension_pairing_token: random_hex(32),
            paired_extensions: BTreeMap::new(),
            setup_prompt_dismissed: false,
        };
        config.save(path)?;
        Ok(config)
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let raw = serde_json::to_vec_pretty(self).map_err(|error| error.to_string())?;
        fs::write(path, raw).map_err(|error| error.to_string())
    }

    pub fn credential(&self, browser: BrowserKind, extension_id: &str) -> Result<String, String> {
        let key = hex::decode(&self.extension_pairing_token).map_err(|error| error.to_string())?;
        let mut mac = HmacSha256::new_from_slice(&key).map_err(|error| error.to_string())?;
        mac.update(format!("v1:{}:{}", browser.as_str(), extension_id).as_bytes());
        Ok(hex::encode(mac.finalize().into_bytes()))
    }

    pub fn verify_credential(
        &self,
        browser: BrowserKind,
        extension_id: &str,
        credential: &str,
    ) -> bool {
        let (Ok(key), Ok(provided)) = (
            hex::decode(&self.extension_pairing_token),
            hex::decode(credential),
        ) else {
            return false;
        };
        let Ok(mut mac) = HmacSha256::new_from_slice(&key) else {
            return false;
        };
        mac.update(format!("v1:{}:{}", browser.as_str(), extension_id).as_bytes());
        mac.verify_slice(&provided).is_ok()
    }

    pub fn record_pairing(&mut self, browser: BrowserKind, extension_id: &str, paired_at: u64) {
        self.paired_extensions.insert(
            pairing_key(browser, extension_id),
            PairedExtension {
                browser,
                extension_id: extension_id.to_string(),
                paired_at,
            },
        );
    }

    pub fn is_paired(&self, browser: BrowserKind, extension_id: &str) -> bool {
        self.paired_extensions
            .contains_key(&pairing_key(browser, extension_id))
    }
}

fn pairing_key(browser: BrowserKind, extension_id: &str) -> String {
    format!("{}:{}", browser.as_str(), extension_id)
}

fn random_hex(bytes: usize) -> String {
    let mut value = vec![0u8; bytes];
    OsRng.fill_bytes(&mut value);
    hex::encode(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> PairingConfig {
        PairingConfig {
            extension_pairing_token: "11".repeat(32),
            paired_extensions: BTreeMap::new(),
            setup_prompt_dismissed: false,
        }
    }

    #[test]
    fn generated_token_is_at_least_128_bits() {
        assert!(random_hex(32).len() >= 32);
    }

    #[test]
    fn wrong_extension_credential_is_rejected() {
        let config = test_config();
        let credential = config
            .credential(BrowserKind::Chrome, "a".repeat(32).as_str())
            .unwrap();
        assert!(config.verify_credential(
            BrowserKind::Chrome,
            "a".repeat(32).as_str(),
            &credential
        ));
        assert!(!config.verify_credential(BrowserKind::Edge, "a".repeat(32).as_str(), &credential));
        assert!(!config.verify_credential(
            BrowserKind::Chrome,
            "b".repeat(32).as_str(),
            &credential
        ));
        assert!(!config.verify_credential(BrowserKind::Chrome, "a".repeat(32).as_str(), "bad"));
    }

    #[test]
    fn derived_credential_survives_desktop_restart() {
        let config = test_config();
        let serialized = serde_json::to_string(&config).unwrap();
        let restored: PairingConfig = serde_json::from_str(&serialized).unwrap();
        assert_eq!(
            config
                .credential(BrowserKind::Edge, "b".repeat(32).as_str())
                .unwrap(),
            restored
                .credential(BrowserKind::Edge, "b".repeat(32).as_str())
                .unwrap(),
        );
    }

    #[test]
    fn pairing_config_can_be_saved_more_than_once_on_windows() {
        let path = std::env::temp_dir().join(format!(
            "inspiration-drawer-browser-extension-{}-{}.json",
            std::process::id(),
            random_hex(6)
        ));
        let mut config = test_config();
        config.save(&path).unwrap();
        config.record_pairing(BrowserKind::Chrome, "a".repeat(32).as_str(), 42);
        config.save(&path).unwrap();
        let restored = PairingConfig::load_or_create(&path).unwrap();
        assert!(restored.is_paired(BrowserKind::Chrome, "a".repeat(32).as_str()));
        let _ = fs::remove_file(path);
    }
}
