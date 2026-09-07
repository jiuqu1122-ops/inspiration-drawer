use std::collections::HashMap;
use std::fs::{self, ReadDir};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};

use serde::Serialize;
use serde_json::{json, Value};

const MAX_OFFLINE_PAGE_SIZE: usize = 500;
static SESSION_SEQUENCE: AtomicU64 = AtomicU64::new(1);
static OFFLINE_SESSIONS: OnceLock<Mutex<HashMap<String, EagleOfflineSession>>> = OnceLock::new();

struct EagleOfflineSession {
    entries: ReadDir,
    scanned: usize,
    total: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EagleOfflineStartResult {
    pub session_id: String,
    pub library: Value,
    pub folders: Value,
    pub total: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EagleOfflinePageResult {
    pub items: Vec<Value>,
    pub failures: Vec<EagleOfflineFailure>,
    pub scanned: usize,
    pub total: usize,
    pub done: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EagleOfflineFailure {
    pub file_path: String,
    pub reason: String,
}

fn sessions() -> &'static Mutex<HashMap<String, EagleOfflineSession>> {
    OFFLINE_SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn read_eagle_json(path: &Path) -> Option<Value> {
    fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
}

fn is_eagle_info_dir(path: &Path) -> bool {
    path.is_dir()
        && path
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.to_ascii_lowercase().ends_with(".info"))
}

fn eagle_offline_item_file(info_dir: &Path, metadata: &Value) -> Option<PathBuf> {
    let name = metadata.get("name").and_then(Value::as_str).unwrap_or("");
    let ext = metadata.get("ext").and_then(Value::as_str).unwrap_or("");
    if !name.is_empty() && !ext.is_empty() {
        let preferred = info_dir.join(format!("{}.{}", name, ext.trim_start_matches('.')));
        if preferred.is_file() {
            return Some(preferred);
        }
    }

    fs::read_dir(info_dir)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .find(|path| {
            if !path.is_file() {
                return false;
            }
            let file_name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            file_name != "metadata.json"
                && !file_name.contains("thumbnail")
                && !file_name.contains("preview")
        })
}

fn eagle_offline_thumbnail_file(info_dir: &Path) -> Option<PathBuf> {
    fs::read_dir(info_dir)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .find(|path| {
            if !path.is_file() {
                return false;
            }
            let file_name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            file_name.contains("thumbnail") || file_name.contains("preview")
        })
}

pub fn start_offline_library(path: String) -> Result<EagleOfflineStartResult, String> {
    let library_path =
        fs::canonicalize(path.trim()).map_err(|error| format!("无法打开 Eagle 资料库：{error}"))?;
    let is_library = library_path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("library"));
    if !is_library || !library_path.is_dir() {
        return Err("请选择以 .library 结尾的 Eagle 资料库目录".to_string());
    }
    let images_dir = library_path.join("images");
    if !images_dir.is_dir() {
        return Err("所选 .library 中没有 images 目录".to_string());
    }

    let library_metadata =
        read_eagle_json(&library_path.join("metadata.json")).unwrap_or_else(|| json!({}));
    let folders = library_metadata
        .get("folders")
        .cloned()
        .unwrap_or_else(|| json!([]));
    let total = fs::read_dir(&images_dir)
        .map_err(|error| format!("读取 Eagle images 目录失败：{error}"))?
        .filter_map(Result::ok)
        .filter(|entry| is_eagle_info_dir(&entry.path()))
        .count();
    let entries = fs::read_dir(&images_dir)
        .map_err(|error| format!("读取 Eagle images 目录失败：{error}"))?;
    let library_name = library_metadata
        .get("name")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .or_else(|| {
            library_path
                .file_stem()
                .and_then(|value| value.to_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| "Eagle Library".to_string());
    let session_id = format!(
        "eagle-offline-{}-{}",
        crate::current_time_millis(),
        SESSION_SEQUENCE.fetch_add(1, Ordering::Relaxed)
    );
    sessions()
        .lock()
        .map_err(|_| "Eagle 离线导入会话不可用".to_string())?
        .insert(
            session_id.clone(),
            EagleOfflineSession {
                entries,
                scanned: 0,
                total,
            },
        );

    Ok(EagleOfflineStartResult {
        session_id,
        library: json!({
            "name": library_name,
            "path": crate::display_local_path(&library_path),
        }),
        folders,
        total,
    })
}

pub fn read_offline_page(
    session_id: String,
    limit: Option<usize>,
) -> Result<EagleOfflinePageResult, String> {
    let limit = limit.unwrap_or(200).clamp(1, MAX_OFFLINE_PAGE_SIZE);
    let mut sessions = sessions()
        .lock()
        .map_err(|_| "Eagle 离线导入会话不可用".to_string())?;
    let session = sessions
        .get_mut(session_id.trim())
        .ok_or_else(|| "Eagle 离线导入会话已结束".to_string())?;
    let mut items = Vec::with_capacity(limit);
    let mut failures = Vec::new();
    let mut done = false;
    while items.len() + failures.len() < limit {
        let Some(entry) = session.entries.next() else {
            done = true;
            break;
        };
        let Ok(entry) = entry else {
            continue;
        };
        let info_dir = entry.path();
        if !is_eagle_info_dir(&info_dir) {
            continue;
        }
        session.scanned += 1;
        let Some(mut metadata) = read_eagle_json(&info_dir.join("metadata.json")) else {
            failures.push(EagleOfflineFailure {
                file_path: crate::display_local_path(&info_dir),
                reason: "无法读取 Eagle 素材 metadata.json".to_string(),
            });
            continue;
        };
        let Some(file_path) = eagle_offline_item_file(&info_dir, &metadata) else {
            failures.push(EagleOfflineFailure {
                file_path: crate::display_local_path(&info_dir),
                reason: "Eagle 原始素材文件缺失".to_string(),
            });
            continue;
        };
        let thumbnail_path = eagle_offline_thumbnail_file(&info_dir);
        let Some(record) = metadata.as_object_mut() else {
            failures.push(EagleOfflineFailure {
                file_path: crate::display_local_path(&info_dir),
                reason: "Eagle 素材 metadata.json 格式无效".to_string(),
            });
            continue;
        };
        if !record.contains_key("id") {
            let id = info_dir
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("")
                .trim_end_matches(".info")
                .to_string();
            record.insert("id".to_string(), Value::String(id));
        }
        record.insert(
            "filePath".to_string(),
            Value::String(crate::display_local_path(&file_path)),
        );
        if let Some(thumbnail_path) = thumbnail_path {
            record.insert(
                "thumbnailPath".to_string(),
                Value::String(crate::display_local_path(&thumbnail_path)),
            );
        }
        items.push(metadata);
    }

    Ok(EagleOfflinePageResult {
        items,
        failures,
        scanned: session.scanned,
        total: session.total,
        done,
    })
}

pub fn finish_offline_library(session_id: String) -> Result<(), String> {
    sessions()
        .lock()
        .map_err(|_| "Eagle 离线导入会话不可用".to_string())?
        .remove(session_id.trim());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_library(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "inspiration-drawer-{name}-{}-{}.library",
            std::process::id(),
            SESSION_SEQUENCE.fetch_add(1, Ordering::Relaxed),
        ))
    }

    #[test]
    fn offline_reader_streams_pages_and_reports_missing_files() {
        let root = test_library("eagle-stream");
        let images = root.join("images");
        fs::create_dir_all(&images).unwrap();
        fs::write(
            root.join("metadata.json"),
            r#"{"name":"Design","folders":[{"id":"F1","name":"Products"}]}"#,
        )
        .unwrap();
        for index in 0..3 {
            let info = images.join(format!("ITEM-{index}.info"));
            fs::create_dir_all(&info).unwrap();
            fs::write(
                info.join("metadata.json"),
                format!(r#"{{"id":"ITEM-{index}","name":"Asset-{index}","ext":"png"}}"#),
            )
            .unwrap();
            if index < 2 {
                fs::write(info.join(format!("Asset-{index}.png")), b"image").unwrap();
            }
        }

        let started = start_offline_library(root.to_string_lossy().to_string()).unwrap();
        assert_eq!(started.total, 3);
        assert_eq!(started.library["name"], "Design");
        let first = read_offline_page(started.session_id.clone(), Some(1)).unwrap();
        assert_eq!(first.items.len() + first.failures.len(), 1);
        assert!(!first.done);
        let second = read_offline_page(started.session_id.clone(), Some(1)).unwrap();
        assert_eq!(second.items.len() + second.failures.len(), 1);
        let third = read_offline_page(started.session_id.clone(), Some(1)).unwrap();
        assert_eq!(third.items.len() + third.failures.len(), 1);
        assert_eq!(third.failures.len(), 1);
        let done = read_offline_page(started.session_id.clone(), Some(1)).unwrap();
        assert!(done.done);
        assert_eq!(done.scanned, 3);
        finish_offline_library(started.session_id).unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn offline_item_prefers_original_over_thumbnail() {
        let root = std::env::temp_dir().join(format!(
            "inspiration-drawer-eagle-item-{}",
            SESSION_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("metadata.json"), "{}").unwrap();
        fs::write(root.join("Product.png"), b"image").unwrap();
        fs::write(root.join("Product_thumbnail.png"), b"thumbnail").unwrap();
        let metadata = json!({ "name": "Product", "ext": "png" });
        assert_eq!(
            eagle_offline_item_file(&root, &metadata).unwrap(),
            root.join("Product.png")
        );
        assert_eq!(
            eagle_offline_thumbnail_file(&root).unwrap(),
            root.join("Product_thumbnail.png")
        );
        fs::remove_dir_all(root).unwrap();
    }
}
