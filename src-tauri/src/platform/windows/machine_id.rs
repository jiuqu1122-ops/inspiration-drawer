use std::process::Command;

const CREATE_NO_WINDOW: u32 = 0x08000000;

pub fn collect_parts() -> Vec<String> {
    let mut parts = Vec::new();
    if let Some(value) =
        query_registry_value(r"HKLM\SOFTWARE\Microsoft\Cryptography", "MachineGuid")
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
    (!stdout.is_empty()).then_some(stdout)
}

fn query_registry_value(key: &str, name: &str) -> Option<String> {
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
    })
}

fn query_wmic_single_value(alias: &str, field: &str) -> Option<String> {
    let output = command_output("wmic", &[alias, "get", field])?;
    output
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter(|line| !line.eq_ignore_ascii_case(field))
        .next()
        .map(str::to_string)
}
