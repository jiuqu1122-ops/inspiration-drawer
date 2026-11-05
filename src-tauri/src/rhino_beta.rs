//! Fixed-purpose, direct loopback transport for the Rhino Beta. No public URL proxy.
use serde_json::Value;
use std::{fs, path::PathBuf, time::Duration};

fn descriptor_path() -> Result<PathBuf, String> {
    let local = std::env::var_os("LOCALAPPDATA").ok_or("Rhino Beta 目前仅支持 Windows")?;
    Ok(PathBuf::from(local).join("InspirationDrawer").join("RhinoBeta").join("connection.json"))
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

fn read_connection() -> Result<Value, String> {
    let path = descriptor_path()?;
    let metadata = fs::metadata(&path).map_err(|_| "请先在 Rhino 中打开灵感抽屉 Beta 面板")?;
    if metadata.len() > 4096 { return Err("Rhino 连接文件过大".into()); }
    let value: Value = serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?).map_err(|_| "Rhino 连接文件无效")?;
    validate(&value)?;
    Ok(value)
}

#[tauri::command]
pub fn rhino_beta_get_connection() -> Result<Value, String> { read_connection() }

#[tauri::command]
pub async fn rhino_beta_request(instance_id: String, path: String, body: Value) -> Result<Value, String> {
    if !matches!(path.as_str(), "/drawer/heartbeat" | "/drawer/ack" | "/mcp") {
        return Err("Rhino Beta 接口不允许".into());
    }
    let connection = read_connection()?;
    if connection["instanceId"].as_str() != Some(instance_id.as_str()) {
        return Err("Rhino 实例已变化，请从新面板建立会话".into());
    }
    let data = serde_json::to_vec(&body).map_err(|e| e.to_string())?;
    if data.len() > 8 * 1024 * 1024 { return Err("Rhino 请求过大".into()); }
    let client = reqwest::Client::builder().no_proxy()
        .redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(25))
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
    use super::validate;
    use serde_json::json;
    #[test]
    fn restricts_transport_to_authenticated_loopback() {
        let mut value = json!({"protocol": 1, "url": "http://127.0.0.1:12345/", "token": "a".repeat(64), "instanceId": "b".repeat(32)});
        assert!(validate(&value).is_ok());
        for url in ["https://example.org/", "http://127.0.0.1:12345/mcp", "http://localhost:12345/", "http://user@127.0.0.1:12345/"] {
            value["url"] = json!(url); assert!(validate(&value).is_err());
        }
    }
}
