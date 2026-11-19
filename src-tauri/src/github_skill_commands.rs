use crate::github_skills::{Github, Service, Source};
use serde::Deserialize;
use serde_json::Value;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

#[derive(Deserialize)]
#[serde(tag = "operation", rename_all = "snake_case", deny_unknown_fields)]
pub enum Request {
    List,
    Inspect {
        source: Source,
    },
    Install {
        preview_id: String,
        skill_id: String,
        action: String,
        #[serde(default)]
        use_in_current_conversation: bool,
    },
    Read {
        skill_id: String,
        version: String,
        path: String,
        offset: usize,
        limit: usize,
    },
    Manage {
        skill_id: String,
        action: String,
        version: Option<String>,
    },
}
fn trusted(window: &tauri::WebviewWindow) -> Result<(), String> {
    let url = window.url().map_err(|e| e.to_string())?;
    // Rhino HTTP panel, HTML preview children, remote pages and auxiliary windows cannot invoke these commands.
    if !crate::github_skills::desktop_surface_allowed(window.label(), &url, cfg!(debug_assertions))
    {
        return Err("GitHub Skills 仅向桌面 Chat 主窗口开放".into());
    }
    Ok(())
}
fn service(app: &tauri::AppHandle) -> Result<(), String> {
    if app.try_state::<Arc<Service>>().is_none() {
        // Fail closed instead of falling back to cwd if the system app-data directory is unavailable.
        let root = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("skills");
        app.manage(Arc::new(Service::new(root)));
    }
    Ok(())
}
#[tauri::command]
pub async fn github_skills_request(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    request_id: String,
    request: Request,
) -> Result<Value, String> {
    trusted(&window)?;
    service(&app)?;
    if request_id.len() < 8 || request_id.len() > 100 {
        return Err("技能请求 ID 无效".into());
    }
    let service = app.state::<Arc<Service>>().inner().clone();
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut requests = service.requests.lock().map_err(|_| "技能状态不可用")?;
        if requests.len() >= 8 || requests.contains_key(&request_id) {
            return Err("技能请求重复或并发超限".into());
        }
        requests.insert(request_id.clone(), cancel.clone());
    }
    let done = service.clone();
    let done_id = request_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        let confirm = |message: &str| {
            app.dialog()
                .message(message)
                .title("GitHub Skills · 本地操作确认")
                .buttons(MessageDialogButtons::OkCancelCustom(
                    "确认此操作".into(),
                    "取消".into(),
                ))
                .blocking_show()
        };
        let remote = || -> Result<Github, String> {
            let progress_app = app.clone();
            let id = request_id.clone();
            Ok(Github::new()?.with_progress(move |completed, total| {
                let _ = progress_app.emit(
                    "github-skills-progress",
                    serde_json::json!({"requestId":id,"completed":completed,"total":total}),
                );
            }))
        };
        match request {
            Request::List => serde_json::to_value(service.store.list()?).map_err(|e| e.to_string()),
            Request::Inspect { source } => {
                serde_json::to_value(service.store.inspect(&remote()?, source, &cancel)?)
                    .map_err(|e| e.to_string())
            }
            Request::Install {
                preview_id,
                skill_id,
                action,
                use_in_current_conversation,
            } => serde_json::to_value(service.store.install(
                &remote()?,
                &preview_id,
                &skill_id,
                &action,
                &cancel,
                |message| confirm(&format!("{message}\n会话使用：{}", if use_in_current_conversation { "用户确认安装后还将请求在当前对话使用此固定技能；不覆盖已选其他技能。" } else { "仅安装，不在当前对话启用。" })),
            )?)
            .map_err(|e| e.to_string()),
            Request::Read {
                skill_id,
                version,
                path,
                offset,
                limit,
            } => service
                .store
                .read(&skill_id, &version, &path, offset, limit),
            Request::Manage {
                skill_id,
                action,
                version,
            } => service
                .store
                .manage(&skill_id, &action, version.as_deref(), &cancel, confirm),
        }
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|r| r);
    if let Ok(mut requests) = done.requests.lock() {
        requests.remove(&done_id);
    }
    result
}
#[tauri::command]
pub fn github_skills_cancel(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    request_id: String,
) -> Result<(), String> {
    trusted(&window)?;
    service(&app)?;
    if let Some(flag) = app
        .state::<Arc<Service>>()
        .requests
        .lock()
        .map_err(|_| "技能状态不可用")?
        .get(&request_id)
    {
        flag.store(true, Ordering::SeqCst);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn model_cannot_deserialize_an_authorization_or_native_path() {
        assert!(serde_json::from_value::<Request>(serde_json::json!({"operation":"install","preview_id":"p","skill_id":"s","action":"install","approved":true})).is_err());
        assert!(serde_json::from_value::<Request>(serde_json::json!({"operation":"read","skill_id":"s","version":"v","path":"x","offset":0,"limit":100,"absolutePath":"C:/secret"})).is_err());
        assert!(serde_json::from_value::<Request>(
            serde_json::json!({"operation":"shell","command":"anything"})
        )
        .is_err());
    }
}
