use std::process::Command;

pub fn collect_parts() -> Vec<String> {
    let output = Command::new("/usr/sbin/ioreg")
        .args(["-rd1", "-c", "IOPlatformExpertDevice"])
        .output();
    let Ok(output) = output else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }

    let text = String::from_utf8_lossy(&output.stdout);
    text.lines()
        .find_map(|line| {
            if !line.contains("IOPlatformUUID") {
                return None;
            }
            line.split('=')
                .nth(1)
                .map(|value| value.trim().trim_matches('"').trim().to_string())
        })
        .filter(|value| !value.is_empty())
        .map(|value| vec![format!("io_platform_uuid={value}")])
        .unwrap_or_default()
}
