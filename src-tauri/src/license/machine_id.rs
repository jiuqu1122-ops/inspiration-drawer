use rand::{rngs::OsRng, RngCore};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;
use tauri::Manager;

#[cfg(target_os = "macos")]
#[path = "../platform/macos/machine_id.rs"]
mod os_machine_id;
#[cfg(target_os = "windows")]
#[path = "../platform/windows/machine_id.rs"]
mod os_machine_id;

const MACHINE_FINGERPRINT_CACHE_FILE: &str = "machine-fingerprint-v1";
const MACHINE_FALLBACK_UUID_FILE: &str = "machine-fallback-uuid-v1";

pub fn current_machine_id(app_handle: &tauri::AppHandle) -> Result<String, String> {
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve application data directory failed: {error}"))?;
    fs::create_dir_all(&data_dir)
        .map_err(|error| format!("create application data directory failed: {error}"))?;

    let cache_path = data_dir.join(MACHINE_FINGERPRINT_CACHE_FILE);
    if let Some(cached) = read_valid_fingerprint(&cache_path) {
        return Ok(cached);
    }

    let mut parts = platform_machine_parts();
    if parts.is_empty() {
        let fallback = read_or_create_fallback_uuid(&data_dir)?;
        parts.push(format!("persisted_uuid={fallback}"));
    }

    let fingerprint = hash_machine_parts(&parts)?;
    persist_private_value(&cache_path, &fingerprint)?;
    Ok(fingerprint)
}

pub fn hash_machine_parts(parts: &[String]) -> Result<String, String> {
    let mut normalized = parts
        .iter()
        .map(|part| normalize_machine_part(part))
        .filter(|part| !part.is_empty())
        .filter(|part| !is_placeholder_machine_part(part))
        .collect::<Vec<_>>();
    normalized.sort();
    normalized.dedup();

    if normalized.is_empty() {
        return Err(
            "unable to create machine fingerprint: no stable device identifiers".to_string(),
        );
    }

    let mut hasher = Sha256::new();
    hasher.update(b"inspiration-drawer-machine-id-v1");
    for part in normalized {
        hasher.update(b"\n");
        hasher.update(part.as_bytes());
    }
    Ok(hex::encode(hasher.finalize()))
}

fn platform_machine_parts() -> Vec<String> {
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    return os_machine_id::collect_parts();

    #[allow(unreachable_code)]
    {
        let mut parts = Vec::new();
        for path in ["/etc/machine-id", "/var/lib/dbus/machine-id"] {
            if let Ok(value) = fs::read_to_string(path) {
                parts.push(format!("machine_id={}", value.trim()));
                break;
            }
        }
        parts
    }
}

fn read_or_create_fallback_uuid(data_dir: &Path) -> Result<String, String> {
    let path = data_dir.join(MACHINE_FALLBACK_UUID_FILE);
    if let Ok(value) = fs::read_to_string(&path) {
        let value = value.trim();
        if is_uuid_like(value) {
            return Ok(value.to_ascii_lowercase());
        }
    }

    let mut bytes = [0_u8; 16];
    OsRng.fill_bytes(&mut bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let value = format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
        bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
    );
    persist_private_value(&path, &value)?;
    Ok(value)
}

fn persist_private_value(path: &Path, value: &str) -> Result<(), String> {
    let temp = path.with_extension(format!("tmp-{}", std::process::id()));
    fs::write(&temp, format!("{value}\n"))
        .map_err(|error| format!("write machine identifier failed: {error}"))?;
    fs::rename(&temp, path)
        .or_else(|rename_error| {
            if path.is_file() {
                let _ = fs::remove_file(&temp);
                Ok(())
            } else {
                Err(rename_error)
            }
        })
        .map_err(|error| format!("persist machine identifier failed: {error}"))
}

fn read_valid_fingerprint(path: &Path) -> Option<String> {
    let value = fs::read_to_string(path).ok()?;
    let value = value.trim();
    (value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit()))
        .then(|| value.to_ascii_lowercase())
}

fn is_uuid_like(value: &str) -> bool {
    value.len() == 36
        && value
            .chars()
            .enumerate()
            .all(|(index, character)| match index {
                8 | 13 | 18 | 23 => character == '-',
                _ => character.is_ascii_hexdigit(),
            })
}

fn normalize_machine_part(value: &str) -> String {
    value
        .trim()
        .to_ascii_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn is_placeholder_machine_part(part: &str) -> bool {
    let value = part
        .rsplit_once('=')
        .map(|(_, value)| value)
        .unwrap_or(part);
    let value = normalize_machine_part(value);
    value.is_empty()
        || matches!(
            value.as_str(),
            "to be filled by o.e.m."
                | "to be filled by oem"
                | "default string"
                | "system serial number"
                | "none"
                | "unknown"
                | "not specified"
                | "not applicable"
                | "n/a"
                | "0"
                | "00000000-0000-0000-0000-000000000000"
                | "ffffffff-ffff-ffff-ffff-ffffffffffff"
        )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashes_parts_without_leaking_raw_values() {
        let first = hash_machine_parts(&["A".to_string(), "B".to_string()]).unwrap();
        let second = hash_machine_parts(&["a".to_string(), "b".to_string()]).unwrap();
        assert_eq!(first, second);
        assert_eq!(first.len(), 64);
        assert!(!first.contains('A'));
    }

    #[test]
    fn hashes_parts_in_stable_order() {
        let first =
            hash_machine_parts(&["board_uuid=A".to_string(), "bios_serial=B".to_string()]).unwrap();
        let second =
            hash_machine_parts(&["bios_serial=B".to_string(), "board_uuid=A".to_string()]).unwrap();
        assert_eq!(first, second);
    }

    #[test]
    fn rejects_placeholder_only_parts() {
        assert!(hash_machine_parts(&[
            "bios_serial=unknown".to_string(),
            "board_uuid=00000000-0000-0000-0000-000000000000".to_string(),
        ])
        .is_err());
    }

    #[test]
    fn validates_fallback_uuid_shape() {
        assert!(is_uuid_like("123e4567-e89b-42d3-a456-426614174000"));
        assert!(!is_uuid_like("not-a-uuid"));
    }
}
