use std::collections::HashSet;
use std::ffi::OsStr;
use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

const MAX_SAFE_NAME_CHARS: usize = 120;

pub fn safe_virtual_file_name(raw_name: &str, index: usize) -> String {
    let fallback = format!("web_image_{}", index + 1);
    let raw = raw_name.trim();
    let basename = Path::new(raw)
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or(raw)
        .trim();

    if is_device_path(raw) || basename.is_empty() {
        return fallback;
    }

    let cleaned: String = basename
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();

    let mut trimmed: String = cleaned
        .trim()
        .trim_matches('.')
        .chars()
        .take(MAX_SAFE_NAME_CHARS)
        .collect();

    while trimmed.contains("..") {
        trimmed = trimmed.replace("..", "_");
    }

    if trimmed.is_empty() || is_reserved_windows_name(&trimmed) || Path::new(&trimmed).is_absolute()
    {
        fallback
    } else {
        trimmed
    }
}

pub fn with_detected_extension(mut name: String, detected_ext: &str) -> String {
    let current = extension_lower(&name);
    let detected = detected_ext
        .trim()
        .trim_start_matches('.')
        .to_ascii_lowercase();
    if detected.is_empty() {
        return name;
    }

    if current.as_deref() == Some(detected.as_str()) {
        return name;
    }

    if current
        .as_deref()
        .map(extensions_compatible)
        .unwrap_or(false)
        && extensions_compatible_pair(current.as_deref().unwrap_or_default(), &detected)
    {
        return name;
    }

    let stem = Path::new(&name)
        .file_stem()
        .and_then(OsStr::to_str)
        .unwrap_or("web_image")
        .trim_matches('.');
    name = if stem.is_empty() {
        format!("web_image.{detected}")
    } else {
        format!("{stem}.{detected}")
    };
    name
}

pub fn extension_lower(name: &str) -> Option<String> {
    Path::new(name)
        .extension()
        .and_then(OsStr::to_str)
        .map(|ext| ext.trim_start_matches('.').to_ascii_lowercase())
        .filter(|ext| !ext.is_empty())
}

pub fn detect_image_extension(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Some("png");
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("jpg");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("gif");
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some("webp");
    }
    if bytes.starts_with(b"BM") {
        return Some("bmp");
    }
    if bytes.len() >= 12 && &bytes[4..8] == b"ftyp" {
        let brand = &bytes[8..12];
        if brand == b"avif" || brand == b"avis" || brand == b"mif1" || brand == b"msf1" {
            return Some("avif");
        }
        if bytes
            .windows(4)
            .any(|window| window == b"avif" || window == b"avis")
        {
            return Some("avif");
        }
    }

    let probe_len = bytes.len().min(2048);
    let text = String::from_utf8_lossy(&bytes[..probe_len]).to_ascii_lowercase();
    let trimmed = text.trim_start_matches('\u{feff}').trim_start();
    if trimmed.starts_with("<svg") || trimmed.contains("<svg") {
        return Some("svg");
    }

    None
}

pub fn validate_completed_image(path: &Path) -> Result<&'static str, String> {
    let mut file = fs::File::open(path).map_err(|err| err.to_string())?;
    let mut head = vec![0u8; 4096];
    let read = file.read(&mut head).map_err(|err| err.to_string())?;
    head.truncate(read);
    file.seek(SeekFrom::Start(0)).ok();

    detect_image_extension(&head)
        .ok_or_else(|| "unsupported or unrecognized image data".to_string())
}

pub fn partial_path_for(final_path: &Path) -> PathBuf {
    let file_name = final_path
        .file_name()
        .and_then(OsStr::to_str)
        .unwrap_or("web_image");
    final_path.with_file_name(format!("{file_name}.partial"))
}

pub fn unique_path(path: PathBuf) -> PathBuf {
    if !path.exists() {
        return path;
    }

    let parent = path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(std::env::temp_dir);
    let stem = path
        .file_stem()
        .and_then(OsStr::to_str)
        .unwrap_or("web_image")
        .to_string();
    let ext = path.extension().and_then(OsStr::to_str).map(str::to_string);

    let mut used = HashSet::new();
    for i in 1..10_000 {
        let file_name = match &ext {
            Some(ext) if !ext.is_empty() => format!("{stem}_{i}.{ext}"),
            _ => format!("{stem}_{i}"),
        };
        if !used.insert(file_name.clone()) {
            continue;
        }
        let candidate = parent.join(file_name);
        if !candidate.exists() {
            return candidate;
        }
    }

    path
}

fn extensions_compatible(ext: &str) -> bool {
    matches!(ext, "jpg" | "jpeg")
}

fn extensions_compatible_pair(a: &str, b: &str) -> bool {
    matches!((a, b), ("jpg", "jpeg") | ("jpeg", "jpg"))
}

fn is_device_path(value: &str) -> bool {
    let lower = value.trim().to_ascii_lowercase();
    lower.starts_with(r"\\?\")
        || lower.starts_with(r"\\.\")
        || lower.starts_with(r"\??\")
        || lower.starts_with("con:")
        || lower.starts_with("nul:")
}

fn is_reserved_windows_name(name: &str) -> bool {
    let stem = Path::new(name)
        .file_stem()
        .and_then(OsStr::to_str)
        .unwrap_or(name)
        .trim_end_matches('.')
        .to_ascii_uppercase();
    matches!(
        stem.as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    )
}
