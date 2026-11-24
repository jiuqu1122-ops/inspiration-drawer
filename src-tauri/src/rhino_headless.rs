//! Fixed-purpose local MCP host. Its workspace is selected by the desktop, not by model arguments.
use serde_json::Value;

#[tauri::command]
pub async fn rhino_headless_mcp_call(
    app_handle: tauri::AppHandle,
    conversation_id: String,
    workspace_id: String,
    tool: String,
    arguments: Value,
) -> Result<Value, String> {
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(move || windows_host::call(app_handle, conversation_id, workspace_id, tool, arguments))
            .await.map_err(|_| "Rhino 后台任务异常退出".to_owned())?
    }
    #[cfg(not(windows))]
    {
        let _ = (app_handle, conversation_id, workspace_id, tool, arguments);
        Err("本机后台 Rhino 建模当前支持 Windows。".to_owned())
    }
}

#[cfg(windows)]
mod windows_host {
    use super::Value;
    use serde_json::json;
    use std::{ffi::OsString, fs, io::{BufRead, BufReader, Read, Write}, os::windows::{ffi::OsStringExt, process::CommandExt}, path::{Path, PathBuf}, process::{Command, Stdio}, sync::Mutex, thread, time::{Duration, Instant}};
    use tauri::{path::BaseDirectory, Manager};
    use winapi::um::winreg::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ, RRF_SUBKEY_WOW6464KEY};

    const WORKER: &str = "InspirationDrawer.Rhino.Headless.exe";
    const RESPONSE_LIMIT: usize = 4 * 1024 * 1024;
    static KERNEL: Mutex<()> = Mutex::new(());

    fn installed_system(major: u8) -> Option<PathBuf> {
        let subkey: Vec<u16> = format!(r"SOFTWARE\McNeel\Rhinoceros\{major}.0\Install").encode_utf16().chain([0]).collect();
        let name: Vec<u16> = "Path".encode_utf16().chain([0]).collect();
        let mut value = [0u16; 4096];
        let mut bytes = (value.len() * 2) as u32;
        // McNeel registers a 64-bit local installation, even when queried by a 32-bit client.
        let status = unsafe { RegGetValueW(HKEY_LOCAL_MACHINE, subkey.as_ptr(), name.as_ptr(), RRF_RT_REG_SZ | RRF_SUBKEY_WOW6464KEY,
            std::ptr::null_mut(), value.as_mut_ptr().cast(), &mut bytes) };
        if status != 0 || bytes < 2 { return None; }
        let path = PathBuf::from(OsString::from_wide(&value[..(bytes as usize / 2) - 1]));
        (path.is_absolute() && path.join("RhinoCommon.dll").is_file() && path.join("RhinoCore.dll").is_file()).then_some(path)
    }

    fn worker_path(app: &tauri::AppHandle, major: u8) -> Result<PathBuf, String> {
        let relative = format!("rhino-headless/{major}/{WORKER}");
        let installed = app.path().resolve(&relative, BaseDirectory::Resource).map_err(|err| err.to_string())?;
        if installed.is_file() { return Ok(installed); }
        #[cfg(debug_assertions)]
        {
            let dev = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources").join(relative);
            if dev.is_file() { return Ok(dev); }
        }
        Err(format!("安装包缺少 Rhino {major} 后台建模组件，请重新安装桌面客户端。"))
    }

    fn execute(worker: &Path, system: &Path, folder: &Path, request: &[u8]) -> Result<Value, String> {
        let mut child = Command::new(worker)
            .arg(system).arg(folder)
            .current_dir(system)
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null())
            .spawn().map_err(|_| "无法启动 Rhino 后台进程，请确认 Rhino 和对应的 .NET 桌面运行时已安装。".to_owned())?;
        let mut pipe = child.stdin.take().expect("piped input");
        let output = child.stdout.take().expect("piped output");
        let reader = thread::spawn(move || {
            let mut stream = BufReader::new(output).take(RESPONSE_LIMIT as u64 + 1);
            let mut data = Vec::new();
            stream.read_to_end(&mut data).map(|_| data)
        });
        let payload = request.to_vec();
        let writer = thread::spawn(move || {
            pipe.write_all(&payload).and_then(|_| pipe.write_all(b"\n"))
        });
        let timeout = Instant::now() + Duration::from_secs(75);
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break Ok(status),
                Ok(None) if Instant::now() < timeout => thread::sleep(Duration::from_millis(30)),
                _ => {
                    let _ = child.kill();
                    let _ = child.wait();
                    break Err("Rhino 后台工具未在规定时间内完成。请检查 Rhino 授权，已保存的建模步骤可继续使用。".to_owned());
                }
            }
        };
        let _ = writer.join();
        let data = reader.join().ok().and_then(Result::ok).unwrap_or_default();
        status?;
        if data.len() > RESPONSE_LIMIT { return Err("Rhino 后台响应过大。".into()); }
        for line in BufReader::new(data.as_slice()).lines().map_while(Result::ok) {
            let Some(reply) = line.strip_prefix("IDRAW_MCP ") else { continue };
            let reply: Value = serde_json::from_str(reply).map_err(|_| "Rhino 后台没有返回有效结果".to_owned())?;
            if let Some(error) = reply["error"]["message"].as_str() { return Err(error.chars().take(500).collect()); }
            return reply.get("result").cloned().ok_or_else(|| "Rhino 后台没有返回结果".into());
        }
        Err("Rhino 后台进程未能初始化。请确认本机 Rhino 可正常授权，并已安装对应的 .NET 桌面运行时。".into())
    }

    pub(super) fn call(app: tauri::AppHandle, conversation: String, workspace: String, tool: String, args: Value) -> Result<Value, String> {
        let valid_id = |value: &str| !value.is_empty() && value.len() <= 128 && value.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b,b'-'|b'_'));
        if !valid_id(&conversation) || !valid_id(&workspace)
            || !matches!(tool.as_str(), "context" | "inspect" | "build" | "preview" | "export")
            || !args.is_object() {
            return Err("Rhino 后台请求无效".into());
        }
        let _kernel = KERNEL.lock().map_err(|_| "Rhino 后台任务未能获取运行权限".to_owned())?;
        let folder = crate::commands::chat_files::generated_root(&app)?.join(conversation).join("rhino").join(workspace);
        fs::create_dir_all(&folder).map_err(|_| "无法创建 Rhino 模型保存目录".to_owned())?;
        let request = serde_json::to_vec(&json!({"jsonrpc":"2.0","method":"tools/call","id":1,"params":{"name":tool,"arguments":args}})).map_err(|e|e.to_string())?;
        if request.len() > 64 * 1024 { return Err("Rhino 后台工具参数过大".into()); }
        let candidates: Vec<_> = [9, 8].into_iter().filter_map(|major| installed_system(major).map(|system| (major, system))).collect();
        if candidates.is_empty() { return Err("后台建模需要此电脑安装并授权 Rhino 8 或 Rhino 9。安装后可直接在画布 Chat 建模。".into()); }
        if tool != "context" {
            let major: u8 = fs::read_to_string(folder.join("kernel-version")).ok().and_then(|text| text.parse().ok())
                .ok_or("请先连接 Rhino 后台任务")?;
            let (_, system) = candidates.iter().find(|(value, _)| *value == major).ok_or("原模型使用的 Rhino 版本已卸载。")?;
            return execute(&worker_path(&app, major)?, system, &folder, &request);
        }
        // Choose a usable kernel before exposing any write, and persist the choice for follow-ups.
        let mut last_error = String::new();
        let existing = fs::read_to_string(folder.join("kernel-version")).ok().and_then(|text| text.parse::<u8>().ok());
        for (major, system) in candidates {
            if existing.is_some_and(|value| value != major) { continue; }
            match worker_path(&app, major).and_then(|worker| execute(&worker, &system, &folder, &request)) {
                Ok(context) => {
                    fs::write(folder.join("kernel-version"), major.to_string()).map_err(|_| "无法保存 Rhino 后台会话".to_owned())?;
                    return Ok(context);
                }
                Err(error) => last_error = error,
            }
        }
        Err(if last_error.is_empty() { "原模型使用的 Rhino 版本已卸载。".to_owned() } else { last_error })
    }
}
