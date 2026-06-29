#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::{Path, PathBuf};

use inspiration_drawer::license::generator::{
    generate_license, public_key_from_private_key, GeneratedLicense, LicenseGeneratorInput,
};
use serde::{Deserialize, Serialize};
use tauri::Manager;

const SIGNING_KEY_FILE_NAME: &str = "signing-key.json";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LicenseGeneratorRequest {
    machine_id: String,
    customer: String,
    edition: String,
    expire_at: String,
    #[serde(default)]
    features: Vec<String>,
    product: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SigningKeyFile {
    version: u32,
    #[serde(alias = "private_key_b64", alias = "privateKey", alias = "private_key")]
    private_key_b64: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SigningIdentityStatus {
    configured: bool,
    public_key_b64: String,
    key_path: String,
    message: Option<String>,
}

fn signing_key_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("无法获取授权器数据目录：{err}"))?;
    fs::create_dir_all(&dir).map_err(|err| format!("无法创建授权器数据目录：{err}"))?;
    Ok(dir.join(SIGNING_KEY_FILE_NAME))
}

fn parse_private_key(content: &str) -> Result<String, String> {
    if let Ok(file) = serde_json::from_str::<SigningKeyFile>(content) {
        let private_key = file.private_key_b64.trim().to_string();
        public_key_from_private_key(&private_key)?;
        return Ok(private_key);
    }

    for line in content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
    {
        for prefix in [
            "PRIVATE_KEY_B64=",
            "privateKeyB64=",
            "private_key_b64=",
            "privateKey=",
            "private_key=",
        ] {
            if let Some(value) = line.strip_prefix(prefix) {
                let private_key = value.trim().trim_matches('"').to_string();
                public_key_from_private_key(&private_key)?;
                return Ok(private_key);
            }
        }
    }

    let private_key = content.trim().trim_matches('"').to_string();
    public_key_from_private_key(&private_key)?;
    Ok(private_key)
}

fn load_signing_identity(app: &tauri::AppHandle) -> Result<(String, String, PathBuf), String> {
    let path = signing_key_path(app)?;
    if !path.is_file() {
        return Err(format!(
            "未配置签发密钥，请先导入 signing-key.json：{}",
            path.to_string_lossy()
        ));
    }
    let content = fs::read_to_string(&path).map_err(|err| format!("无法读取签发密钥：{err}"))?;
    let private_key = parse_private_key(&content)?;
    let public_key = public_key_from_private_key(&private_key)?;
    Ok((private_key, public_key, path))
}

fn write_signing_key(path: &Path, private_key: &str) -> Result<(), String> {
    let payload = SigningKeyFile {
        version: 1,
        private_key_b64: private_key.to_string(),
    };
    let content =
        serde_json::to_string_pretty(&payload).map_err(|err| format!("无法编码签发密钥：{err}"))?;
    let temp_path = path.with_extension("json.tmp");
    fs::write(&temp_path, content).map_err(|err| format!("无法写入签发密钥：{err}"))?;
    if path.exists() {
        fs::remove_file(path).map_err(|err| format!("无法替换旧签发密钥：{err}"))?;
    }
    fs::rename(&temp_path, path).map_err(|err| format!("无法保存签发密钥：{err}"))
}

fn status_from_identity(app: &tauri::AppHandle) -> SigningIdentityStatus {
    let fallback_path =
        signing_key_path(app).unwrap_or_else(|_| PathBuf::from(SIGNING_KEY_FILE_NAME));
    match load_signing_identity(app) {
        Ok((_private_key, public_key, path)) => SigningIdentityStatus {
            configured: true,
            public_key_b64: public_key,
            key_path: path.to_string_lossy().to_string(),
            message: None,
        },
        Err(message) => SigningIdentityStatus {
            configured: false,
            public_key_b64: String::new(),
            key_path: fallback_path.to_string_lossy().to_string(),
            message: Some(message),
        },
    }
}

#[tauri::command]
fn get_generator_signing_status(app_handle: tauri::AppHandle) -> SigningIdentityStatus {
    status_from_identity(&app_handle)
}

#[tauri::command]
fn import_generator_signing_key(
    app_handle: tauri::AppHandle,
    source_path: String,
) -> Result<SigningIdentityStatus, String> {
    let source = PathBuf::from(source_path.trim());
    if !source.is_file() {
        return Err("请选择有效的签发密钥文件".to_string());
    }
    let content =
        fs::read_to_string(&source).map_err(|err| format!("无法读取所选密钥文件：{err}"))?;
    let private_key = parse_private_key(&content)?;
    let target = signing_key_path(&app_handle)?;
    write_signing_key(&target, &private_key)?;
    Ok(status_from_identity(&app_handle))
}

#[tauri::command]
fn generate_license_file(
    app_handle: tauri::AppHandle,
    input: LicenseGeneratorRequest,
    out_path: Option<String>,
) -> Result<GeneratedLicense, String> {
    let (private_key, expected_public_key, _path) = load_signing_identity(&app_handle)?;
    let generated = generate_license(LicenseGeneratorInput {
        private_key,
        machine_id: input.machine_id,
        customer: input.customer,
        edition: input.edition,
        expire_at: input.expire_at,
        features: input.features,
        product: input.product,
    })?;
    if generated.public_key_b64 != expected_public_key {
        return Err("签发密钥校验失败".to_string());
    }

    if let Some(out_path) = out_path
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let path = PathBuf::from(out_path);
        if let Some(parent) = path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
        {
            fs::create_dir_all(parent).map_err(|err| format!("无法创建输出目录：{err}"))?;
        }
        fs::write(&path, &generated.license_json)
            .map_err(|err| format!("无法保存 license 文件：{err}"))?;
    }

    Ok(generated)
}

fn show_license_generator_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("license_generator") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_license_generator_window(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            show_license_generator_window(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_generator_signing_status,
            import_generator_signing_key,
            generate_license_file
        ])
        .run(tauri::generate_context!("tauri.generator.conf.json"))
        .expect("error while running license generator application");
}
