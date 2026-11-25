//! Fixed-purpose local MCP host. Its workspace is selected by the desktop, not by model arguments.
use serde_json::Value;

#[tauri::command]
pub async fn rhino_headless_mcp_call(
    app_handle: tauri::AppHandle,
    conversation_id: String,
    workspace_id: String,
    tool: String,
    arguments: Value,
    requested_major: Option<u8>,
) -> Result<Value, String> {
    #[cfg(windows)]
    {
        windows_host::call(app_handle, conversation_id, workspace_id, tool, arguments, requested_major).await
    }
    #[cfg(not(windows))]
    {
        let _ = (app_handle, conversation_id, workspace_id, tool, arguments, requested_major);
        Err("本机后台 Rhino 建模当前支持 Windows。".to_owned())
    }
}

#[cfg(windows)]
mod windows_host {
    use super::Value;
    use serde::{Deserialize, Serialize};
    use serde_json::json;
    use std::{ffi::OsString, fs, io::{BufRead, BufReader, Read, Write}, os::windows::{ffi::OsStringExt, process::CommandExt}, path::{Path, PathBuf}, process::{Command, Stdio}, thread, time::{Duration, Instant}};
    use tauri::{path::BaseDirectory, Manager};
    use tokio::sync::Mutex;
    use winapi::um::winreg::{RegGetValueW, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ, RRF_SUBKEY_WOW6464KEY};
    use winapi::shared::minwindef::HKEY;

    const WORKER: &str = "InspirationDrawer.Rhino.Headless.exe";
    const RESPONSE_LIMIT: usize = 4 * 1024 * 1024;
    static KERNEL: Mutex<()> = Mutex::const_new(());
    static LAUNCHED_RHINO9: Mutex<Option<u64>> = Mutex::const_new(None);

    #[derive(Serialize, Deserialize)]
    struct KernelBinding {
        major: u8,
        instance: Option<String>,
    }

    fn registry_path(root: HKEY, subkey: &str, value_name: &str) -> Option<PathBuf> {
        let subkey: Vec<u16> = subkey.encode_utf16().chain([0]).collect();
        let name: Vec<u16> = value_name.encode_utf16().chain([0]).collect();
        let mut value = [0u16; 4096];
        let mut bytes = (value.len() * 2) as u32;
        // McNeel registers a 64-bit local installation, even when queried by a 32-bit client.
        let status = unsafe { RegGetValueW(root, subkey.as_ptr(), name.as_ptr(), RRF_RT_REG_SZ | RRF_SUBKEY_WOW6464KEY,
            std::ptr::null_mut(), value.as_mut_ptr().cast(), &mut bytes) };
        if status != 0 || bytes < 2 { return None; }
        let path = PathBuf::from(OsString::from_wide(&value[..(bytes as usize / 2) - 1]));
        path.is_absolute().then_some(path)
    }

    fn installed_system(major: u8) -> Option<PathBuf> {
        let key = format!(r"SOFTWARE\McNeel\Rhinoceros\{major}.0\Install");
        registry_path(HKEY_LOCAL_MACHINE, &key, "Path")
            .filter(|path| path.join("RhinoCommon.dll").is_file() && path.join("RhinoCore.dll").is_file())
    }

    fn launch_rhino9(system: PathBuf) -> Result<u64, String> {
        let registration = r"SOFTWARE\McNeel\Rhinoceros\9.0\Plug-Ins\b55c8d32-2c2f-4da2-84ca-b7c88c1a8de5\PlugIn";
        if !registry_path(HKEY_CURRENT_USER, registration, "FileName").is_some_and(|path| path.is_file()) {
            return Err("请先在设置中安装或更新 Rhino 9 插件。".into());
        }
        let exe = system.join("Rhino.exe");
        if !exe.is_file() { return Err("找不到 Rhino 9 启动程序。".into()); }
        let powershell = PathBuf::from(std::env::var_os("SystemRoot").ok_or("找不到 Windows 系统目录。")?)
            .join(r"System32\WindowsPowerShell\v1.0\powershell.exe");
        let output = Command::new(powershell)
            .args(["-NoProfile", "-NonInteractive", "-Command",
                "$ErrorActionPreference = 'Stop'; (Start-Process -FilePath $env:DRAWER_RHINO_APP_EXE -WorkingDirectory $env:DRAWER_RHINO_APP_DIR -ArgumentList '/nosplash','/notemplate' -WindowStyle Hidden -PassThru).Id"])
            .env("DRAWER_RHINO_BACKGROUND_PARENT", std::process::id().to_string())
            .env("DRAWER_RHINO_APP_EXE", exe)
            .env("DRAWER_RHINO_APP_DIR", system)
            .creation_flags(0x08000000)
            .output().map_err(|_| "无法启动 Rhino 9 隐藏进程。".to_owned())?;
        if !output.status.success() { return Err("启动 Rhino 9 隐藏进程失败。".into()); }
        String::from_utf8_lossy(&output.stdout).trim().parse::<u64>()
            .ok().filter(|pid| *pid > 0).ok_or_else(|| "启动器未返回 Rhino 9 进程 ID。".to_owned())
    }

    async fn wait_for_hidden_rhino9(system: PathBuf) -> Result<String, String> {
        let mut launched = LAUNCHED_RHINO9.lock().await;
        let pid = match launched.filter(|pid| crate::rhino_beta::live_rhino_process(*pid)) {
            Some(pid) => pid,
            None => {
                let pid = tauri::async_runtime::spawn_blocking(move || launch_rhino9(system))
                    .await.map_err(|_| "Rhino 9 启动任务异常退出。".to_owned())??;
                *launched = Some(pid);
                pid
            }
        };
        let deadline = Instant::now() + Duration::from_secs(35);
        while Instant::now() < deadline {
            if let Some(instance) = crate::rhino_beta::rhino_background_connections()?.into_iter()
                .find(|connection| connection["processId"].as_u64() == Some(pid)
                    && connection["backgroundRhinoMajor"].as_u64() == Some(9)
                    && connection["backgroundOnly"].as_bool() == Some(true))
                .and_then(|connection| connection["instanceId"].as_str().map(str::to_owned)) {
                return Ok(instance);
            }
            if !crate::rhino_beta::live_rhino_process(pid) {
                return Err("Rhino 9 在后台连接就绪前退出，请检查本机授权。".into());
            }
            tokio::time::sleep(Duration::from_millis(300)).await;
        }
        Err("Rhino 9 隐藏进程未在启动时限内连接。请确认 Rhino 已授权，且已更新灵感抽屉插件。".into())
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

    async fn use_plugin(instance: &str, major: u8, conversation: &str, workspace: &str, tool: &str, args: &Value) -> Result<Value, String> {
        let reply = crate::rhino_beta::rhino_beta_request(instance.to_owned(), "/mcp".to_owned(), json!({
            "jsonrpc": "2.0", "id": 1, "method": "drawer/backgroundModel",
            "params": {"conversationId": conversation, "workspaceId": workspace, "rhinoMajor": major, "tool": tool, "arguments": args}
        })).await?;
        if let Some(error) = reply["error"]["message"].as_str() {
            return Err(error.chars().take(500).collect());
        }
        reply.get("result").cloned().ok_or_else(|| "Rhino 插件未返回后台建模结果。".to_owned())
    }

    async fn use_standalone(app: &tauri::AppHandle, major: u8, system: PathBuf, folder: &Path, request: Vec<u8>) -> Result<Value, String> {
        let worker = worker_path(app, major)?;
        let folder = folder.to_path_buf();
        tauri::async_runtime::spawn_blocking(move || execute(&worker, &system, &folder, &request))
            .await.map_err(|_| "Rhino 后台任务异常退出".to_owned())?
    }

    pub(super) async fn call(app: tauri::AppHandle, conversation: String, workspace: String, tool: String, args: Value, requested_major: Option<u8>) -> Result<Value, String> {
        let valid_id = |value: &str| !value.is_empty() && value.len() <= 128 && value.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b,b'-'|b'_'));
        if !valid_id(&conversation) || !valid_id(&workspace)
            || !matches!(tool.as_str(), "context" | "inspect" | "build" | "preview" | "export")
            || requested_major.is_some_and(|major| !matches!(major, 8 | 9) || tool != "context")
            || !args.is_object() {
            return Err("Rhino 后台请求无效".into());
        }
        let _kernel = KERNEL.lock().await;
        let folder = crate::commands::chat_files::generated_root(&app)?.join(&conversation).join("rhino").join(&workspace);
        fs::create_dir_all(&folder).map_err(|_| "无法创建 Rhino 模型保存目录".to_owned())?;
        let request = serde_json::to_vec(&json!({"jsonrpc":"2.0","method":"tools/call","id":1,"params":{"name":tool,"arguments":args}})).map_err(|e|e.to_string())?;
        if request.len() > 64 * 1024 { return Err("Rhino 后台工具参数过大".into()); }
        let binding_path = folder.join("kernel-binding.json");
        let existing: Option<KernelBinding> = match fs::read(&binding_path) {
            Ok(bytes) => Some(serde_json::from_slice(&bytes).map_err(|_| "后台 Rhino 会话绑定损坏。".to_owned())?),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => fs::read_to_string(folder.join("kernel-version")).ok()
                .and_then(|text| text.parse::<u8>().ok())
                .map(|major| KernelBinding { major, instance: None }),
            Err(error) => return Err(error.to_string()),
        };
        if tool != "context" {
            let bound = existing.ok_or("请先连接 Rhino 后台任务")?;
            if let Some(instance) = bound.instance {
                return use_plugin(&instance, bound.major, &conversation, &workspace, &tool, &args).await;
            }
            let system = installed_system(bound.major).ok_or("原模型使用的 Rhino 版本已卸载。")?;
            return use_standalone(&app, bound.major, system, &folder, request).await;
        }
        let previous_major = existing.as_ref().map(|bound| bound.major);
        if let (Some(requested), Some(bound)) = (requested_major, previous_major) {
            if requested != bound && folder.join("working.3dm").exists() {
                return Err(format!("此对话的已保存模型绑定了 Rhino {bound}。请新建对话使用 Rhino {requested} 后台建模。"));
            }
        }
        // An explicit version restricts the probe; automatic mode prefers Rhino 9.
        let selected = requested_major.or(previous_major);
        let connections = crate::rhino_beta::rhino_background_connections()?;
        let mut failures = Vec::new();
        for major in [9u8, 8].into_iter().filter(|major| selected.is_none_or(|version| *major == version)) {
            // Reuse an already authorized Rhino process when available. The plugin
            // opens a separate workspace 3DM; it never uses the active Rhino document.
            let plugins: Vec<_> = connections.iter()
                .filter(|conn| conn["backgroundRhinoMajor"].as_u64() == Some(u64::from(major)))
                .filter_map(|conn| conn["instanceId"].as_str()).collect();
            let mut instance = existing.as_ref().and_then(|bound| bound.instance.as_deref())
                .filter(|instance| plugins.contains(instance)).or_else(|| plugins.first().copied()).map(str::to_owned);
            let result = match &instance {
                Some(instance) => use_plugin(instance, major, &conversation, &workspace, &tool, &args).await,
                None => match installed_system(major) {
                    Some(system) => match use_standalone(&app, major, system.clone(), &folder, request.clone()).await {
                        Err(standalone_error) if major == 9 => {
                            match wait_for_hidden_rhino9(system).await {
                                Ok(host) => {
                                    let result = use_plugin(&host, major, &conversation, &workspace, &tool, &args).await;
                                    instance = Some(host);
                                    result
                                }
                                Err(startup_error) => Err(format!("{standalone_error}\n{startup_error}")),
                            }
                        }
                        result => result,
                    },
                    None => continue,
                },
            };
            match result {
                Ok(mut context) => {
                    if let Some(record) = context.as_object_mut() {
                        record.insert("kernelHost".into(), json!(if instance.is_some() { "rhino-plugin" } else { "standalone" }));
                    }
                    let binding = serde_json::to_vec(&KernelBinding { major, instance }).map_err(|e| e.to_string())?;
                    let pending = folder.join("kernel-binding.tmp");
                    fs::write(&pending, binding).and_then(|_| fs::rename(&pending, &binding_path))
                        .map_err(|_| "无法保存 Rhino 后台会话".to_owned())?;
                    return Ok(context);
                }
                Err(error) => failures.push(if error.starts_with(&format!("Rhino {major}")) { error } else { format!("Rhino {major}：{error}") }),
            }
        }
        if failures.is_empty() {
            return Err(match selected {
                Some(major) => format!("未检测到 Rhino {major}。请确认此版本已安装。"),
                None => "后台建模需要此电脑安装并授权 Rhino 8 或 Rhino 9。安装后可直接在画布 Chat 建模。".to_owned(),
            });
        }
        Err(format!("{}\n如果独立后台进程未能使用授权，请启动对应版本的 Rhino，更新并加载灵感抽屉插件，然后重试。", failures.join("\n")))
    }
}
