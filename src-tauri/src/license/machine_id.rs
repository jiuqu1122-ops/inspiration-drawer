use sha2::{Digest, Sha256};
use std::process::Command;

pub trait MachineFingerprintProvider {
    fn collect_parts(&self) -> Vec<String>;
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
        return Err("无法获取机器码：未读取到可用的设备信息".to_string());
    }

    let mut hasher = Sha256::new();
    hasher.update(b"inspiration-drawer-machine-id-v1");
    for part in normalized {
        hasher.update(b"\n");
        hasher.update(part.as_bytes());
    }
    Ok(hex::encode(hasher.finalize()))
}

pub fn current_machine_id() -> Result<String, String> {
    let provider = default_provider();
    hash_machine_parts(&provider.collect_parts())
}

fn default_provider() -> Box<dyn MachineFingerprintProvider> {
    #[cfg(target_os = "windows")]
    {
        Box::new(WindowsMachineFingerprintProvider)
    }
    #[cfg(not(target_os = "windows"))]
    {
        Box::new(PortableMachineFingerprintProvider)
    }
}

#[cfg(target_os = "windows")]
struct WindowsMachineFingerprintProvider;

#[cfg(target_os = "windows")]
impl MachineFingerprintProvider for WindowsMachineFingerprintProvider {
    fn collect_parts(&self) -> Vec<String> {
        let mut parts = Vec::new();
        if let Some(value) =
            query_windows_registry_value(r"HKLM\SOFTWARE\Microsoft\Cryptography", "MachineGuid")
        {
            parts.push(format!("machine_guid={value}"));
        }
        if let Some(value) = query_wmic_single_value("csproduct", "uuid") {
            parts.push(format!("board_uuid={value}"));
        }
        if let Some(value) = query_wmic_single_value("bios", "serialnumber") {
            parts.push(format!("bios_serial={value}"));
        }
        parts
    }
}

#[cfg(not(target_os = "windows"))]
struct PortableMachineFingerprintProvider;

#[cfg(not(target_os = "windows"))]
impl MachineFingerprintProvider for PortableMachineFingerprintProvider {
    fn collect_parts(&self) -> Vec<String> {
        let mut parts = Vec::new();
        if let Ok(value) = std::env::var("HOSTNAME") {
            parts.push(format!("hostname={value}"));
        }
        parts
    }
}

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(target_os = "windows")]
fn command_output(program: &str, args: &[&str]) -> Option<String> {
    use std::os::windows::process::CommandExt;
    let output = Command::new(program)
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        None
    } else {
        Some(stdout)
    }
}

fn normalize_machine_part(value: &str) -> String {
    value
        .trim()
        .to_ascii_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn is_placeholder_machine_value(value: &str) -> bool {
    let lower = normalize_machine_part(value);
    lower.is_empty()
        || matches!(
            lower.as_str(),
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

fn is_placeholder_machine_part(part: &str) -> bool {
    let value = part
        .rsplit_once('=')
        .map(|(_, value)| value)
        .unwrap_or(part);
    is_placeholder_machine_value(value)
}

#[cfg(target_os = "windows")]
fn query_windows_registry_value(key: &str, name: &str) -> Option<String> {
    let output = command_output("reg", &["query", key, "/v", name])?;
    output.lines().find_map(|line| {
        let trimmed = line.trim();
        if !trimmed
            .to_ascii_lowercase()
            .starts_with(&name.to_ascii_lowercase())
        {
            return None;
        }
        trimmed
            .split_whitespace()
            .last()
            .map(|value| value.trim().to_string())
            .filter(|value| !is_placeholder_machine_value(value))
    })
}

#[cfg(target_os = "windows")]
fn query_wmic_single_value(alias: &str, field: &str) -> Option<String> {
    let output = command_output("wmic", &[alias, "get", field])?;
    output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter(|line| !line.eq_ignore_ascii_case(field))
        .find(|line| !is_placeholder_machine_value(line))
        .map(|line| line.to_string())
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
        let err = hash_machine_parts(&[
            "bios_serial=unknown".to_string(),
            "board_uuid=00000000-0000-0000-0000-000000000000".to_string(),
        ])
        .unwrap_err();
        assert!(err.contains("无法获取机器码"));
    }
}
