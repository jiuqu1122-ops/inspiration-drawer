//! Persisted shortcut commands, shared by the app and its isolated native UI probe.
use std::{fs, path::PathBuf};
use crate::get_user_data_dir;

fn shortcut_config_path(app_handle: &tauri::AppHandle) -> PathBuf {
    get_user_data_dir(app_handle).join("shortcuts.json")
}

fn default_shortcut(name: &str) -> Option<&'static str> {
    match name {
        "update_shortcut" => Some("Alt+G"),
        "update_snip_shortcut" => Some("F1"),
        "update_text_shortcut" => Some("Alt+T"),
        "update_note_shortcut" => Some("Alt+E"),
        "update_search_shortcut" => Some("Alt+S"),
        "update_trigger_shortcut" => Some("Alt+Q"),
        "update_canvas_shortcut" => Some("Alt+`"),
        _ => None,
    }
}

fn normalize_shortcut_name(name: &str) -> String {
    name.trim().replace('-', "_")
}

fn read_shortcut_map(app_handle: &tauri::AppHandle) -> serde_json::Map<String, serde_json::Value> {
    let path = shortcut_config_path(app_handle);
    if !path.exists() {
        return serde_json::Map::new();
    }

    fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str::<serde_json::Value>(&content).ok())
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default()
}

#[tauri::command]
pub fn get_shortcut(app_handle: tauri::AppHandle, name: String) -> Result<String, String> {
    let key = normalize_shortcut_name(&name);
    let saved = read_shortcut_map(&app_handle)
        .get(&key)
        .and_then(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    Ok(saved
        .or_else(|| default_shortcut(&key).map(str::to_string))
        .unwrap_or_default())
}

#[tauri::command]
pub fn update_shortcut(
    app_handle: tauri::AppHandle,
    name: String,
    shortcut: String,
) -> Result<(), String> {
    let key = normalize_shortcut_name(&name);
    if default_shortcut(&key).is_none() {
        return Err(format!("unknown shortcut name: {}", key));
    }

    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};
    let normalized = shortcut.trim().to_string();
    let parsed = normalized.parse::<Shortcut>().map_err(|e| format!("Invalid shortcut: {}", e))?;
    let mut shortcuts = read_shortcut_map(&app_handle);
    for other in ["update_shortcut", "update_snip_shortcut", "update_text_shortcut", "update_note_shortcut", "update_search_shortcut", "update_trigger_shortcut", "update_canvas_shortcut"] {
        if other == key { continue; }
        let existing = shortcuts.get(other).and_then(|v| v.as_str()).or_else(|| default_shortcut(other));
        if existing.and_then(|v| v.parse::<Shortcut>().ok()).is_some_and(|v| v == parsed) {
            return Err(format!("Shortcut is already assigned to {}", other));
        }
    }
    // Probe OS availability before saving; a failed change leaves the old config intact.
    let manager = app_handle.global_shortcut();
    if !manager.is_registered(parsed) {
        manager.register(parsed).map_err(|e| format!("Shortcut unavailable: {}", e))?;
        manager.unregister(parsed).map_err(|e| format!("Cannot release shortcut test: {}", e))?;
    }
    let path = shortcut_config_path(&app_handle);
    shortcuts.insert(key, serde_json::Value::String(normalized));

    let content = serde_json::to_string_pretty(&serde_json::Value::Object(shortcuts))
        .map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())?;
    Ok(())
}
