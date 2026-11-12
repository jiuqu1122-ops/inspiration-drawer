//! Fixed-purpose, direct loopback transport for the Rhino Beta. No public URL proxy.
use serde_json::Value;
use std::{fs, path::PathBuf, time::Duration};

fn descriptor_directory() -> Result<PathBuf, String> {
    let local = std::env::var_os("LOCALAPPDATA").ok_or("Rhino Beta requires LOCALAPPDATA")?;
    Ok(PathBuf::from(local).join("InspirationDrawer").join("RhinoBeta"))
}

fn validate(value: &Value) -> Result<(), String> {
    if value.get("protocol").and_then(Value::as_u64) != Some(1) {
        return Err("Rhino Beta 协议版本不匹配".into());
    }
    let url = url::Url::parse(value["url"].as_str().ok_or("缺少 Rhino 连接地址")?).map_err(|_| "Rhino 地址无效")?;
    if url.scheme() != "http" || url.host_str() != Some("127.0.0.1") || url.port().is_none()
        || !url.username().is_empty() || url.password().is_some() || url.path() != "/"
        || url.query().is_some() || url.fragment().is_some()
    {
        return Err("Rhino Beta 只允许本机回环连接".into());
    }
    for (key, length) in [("token", 64), ("instanceId", 32)] {
        let text = value[key].as_str().ok_or("Rhino 连接信息缺失")?;
        if text.len() != length || !text.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) {
            return Err("Rhino 连接身份无效".into());
        }
    }
    Ok(())
}

// Descriptor URLs and tokens are read only from the fixed local plugin directory.
// Resolve a request by exact instance ID, never by whichever Rhino wrote last.
fn read_connections_from(directory: &std::path::Path) -> Result<Vec<Value>, String> {
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.to_string()),
    };
    let mut paths = entries.filter_map(Result::ok).map(|entry| entry.path()).filter(|path| {
        let name = path.file_name().and_then(|name| name.to_str()).unwrap_or("");
        name == "connection.json" || (name.starts_with("connection-") && name.ends_with(".json"))
    }).collect::<Vec<_>>();
    paths.sort();
    if paths.len() > 128 { return Err("Too many Rhino instance descriptors".into()); }
    let mut connections = std::collections::BTreeMap::<String, Value>::new();
    for path in paths {
        let Ok(metadata) = fs::symlink_metadata(&path) else { continue; };
        if !metadata.file_type().is_file() || metadata.len() > 4096 { continue; }
        let Ok(bytes) = fs::read(&path) else { continue; };
        let Ok(value) = serde_json::from_slice::<Value>(&bytes) else { continue; };
        if validate(&value).is_err() { continue; }
        let instance_id = value["instanceId"].as_str().unwrap().to_string();
        if let Some(previous) = connections.get(&instance_id) {
            if previous["url"] != value["url"] || previous["token"] != value["token"] {
                return Err("Conflicting Rhino instance descriptors; refusing ambiguous routing".into());
            }
        } else { connections.insert(instance_id, value); }
    }
    Ok(connections.into_values().collect())
}

fn read_connections() -> Result<Vec<Value>, String> {
    read_connections_from(&descriptor_directory()?)
}

#[tauri::command]
pub fn rhino_beta_get_connections() -> Result<Vec<Value>, String> { read_connections() }

// Legacy single-connection callers must not silently choose the wrong window.
#[tauri::command]
pub fn rhino_beta_get_connection() -> Result<Value, String> {
    let mut values = read_connections()?;
    if values.len() != 1 { return Err("Use instance discovery: expected exactly one Rhino connection".into()); }
    Ok(values.remove(0))
}

#[tauri::command]
pub async fn rhino_beta_request(instance_id: String, path: String, body: Value) -> Result<Value, String> {
    if !matches!(path.as_str(), "/drawer/heartbeat" | "/drawer/ack" | "/mcp") {
        return Err("Rhino Beta 接口不允许".into());
    }
    let connection = read_connections()?.into_iter()
        .find(|value| value["instanceId"].as_str() == Some(instance_id.as_str()))
        .ok_or("The requested Rhino instance is no longer registered")?;
    let data = serde_json::to_vec(&body).map_err(|e| e.to_string())?;
    if data.len() > 8 * 1024 * 1024 { return Err("Rhino 请求过大".into()); }
    let client = reqwest::Client::builder().no_proxy()
        .redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(if path == "/mcp" { 125 } else { 5 }))
        .build().map_err(|e| e.to_string())?;
    let response = client.post(format!("{}{}", connection["url"].as_str().unwrap().trim_end_matches('/'), path))
        .bearer_auth(connection["token"].as_str().unwrap()).header("Content-Type", "application/json")
        .body(data).send().await.map_err(|_| "Rhino 本机连接中断或正忙，请检查面板和文档")?;
    let status = response.status();
    if response.content_length().is_some_and(|length| length > 32 * 1024 * 1024) {
        return Err("Rhino 响应过大".into());
    }
    let mut response = response;
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        if bytes.len() + chunk.len() > 32 * 1024 * 1024 { return Err("Rhino 响应过大".into()); }
        bytes.extend_from_slice(&chunk);
    }
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| "Rhino 没有返回有效 JSON")?;
    if !status.is_success() { return Err(value["error"].as_str().unwrap_or("Rhino 请求失败").into()); }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::{validate, read_connections_from};
    use serde_json::json;
    #[test]
    fn restricts_transport_to_authenticated_loopback() {
        let mut value = json!({"protocol": 1, "url": "http://127.0.0.1:12345/", "token": "a".repeat(64), "instanceId": "b".repeat(32)});
        assert!(validate(&value).is_ok());
        for url in ["https://example.org/", "http://127.0.0.1:12345/mcp", "http://localhost:12345/", "http://user@127.0.0.1:12345/"] {
            value["url"] = json!(url); assert!(validate(&value).is_err());
        }
    }
    fn fixture(instance: char, port: u16) -> serde_json::Value {
        json!({"protocol":1,"url":format!("http://127.0.0.1:{port}/"),"token":"a".repeat(64),"instanceId":instance.to_string().repeat(32)})
    }
    fn isolated_directory() -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("rhino-multi-instance-{}-{}",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&path).unwrap(); path
    }
    #[test]
    fn discovers_both_instances_despite_a_newer_legacy_descriptor() {
        let root=isolated_directory();
        let a=fixture('b',12345); let b=fixture('c',12346);
        std::fs::write(root.join("connection-1.json"),a.to_string()).unwrap();
        std::fs::write(root.join("connection-2.json"),b.to_string()).unwrap();
        std::fs::write(root.join("connection.json"),b.to_string()).unwrap();
        let connections=read_connections_from(&root).unwrap();
        assert_eq!(connections,vec![a,b]);
    }
    #[test]
    fn ignores_invalid_descriptors_without_losing_healthy_instances() {
        let root=isolated_directory();let good=fixture('b',12345);
        std::fs::write(root.join("connection-good.json"),good.to_string()).unwrap();
        std::fs::write(root.join("connection-broken.json"),"{").unwrap();
        let mut external=fixture('c',12346); external["url"]=json!("https://example.invalid/");
        std::fs::write(root.join("connection-external.json"),external.to_string()).unwrap();
        std::fs::write(root.join("unrelated.json"),fixture('d',12347).to_string()).unwrap();
        assert_eq!(read_connections_from(&root).unwrap(),vec![good]);
    }
    #[test]
    fn rejects_conflicting_endpoints_for_the_same_instance() {
        let root=isolated_directory();
        std::fs::write(root.join("connection-1.json"),fixture('b',12345).to_string()).unwrap();
        std::fs::write(root.join("connection-2.json"),fixture('b',12346).to_string()).unwrap();
        assert!(read_connections_from(&root).unwrap_err().contains("Conflicting"));
    }

}
