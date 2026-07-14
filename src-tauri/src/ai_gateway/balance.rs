use reqwest::blocking::Client;
use serde_json::Value;

use crate::ai_gateway::endpoint::join_api_endpoint;
use crate::ai_gateway::router::{
    apply_profile_headers, endpoint_for, redact_profile_secrets, response_preview,
};
use crate::ai_gateway::types::{ApiBalanceResult, EffectiveApiProfile, GatewayOperation};
use crate::license::types::AiGatewayKind;

fn number_at(value: &Value, pointers: &[&str]) -> Option<f64> {
    pointers.iter().find_map(|pointer| {
        let value = value.pointer(pointer)?;
        value
            .as_f64()
            .or_else(|| value.as_str()?.parse::<f64>().ok())
    })
}

fn bool_at(value: &Value, pointers: &[&str]) -> bool {
    pointers.iter().any(|pointer| {
        value.pointer(pointer).is_some_and(|value| {
            value.as_bool().unwrap_or(false)
                || value.as_i64().is_some_and(|value| value != 0)
                || value.as_str().is_some_and(|value| {
                    matches!(
                        value.trim().to_ascii_lowercase().as_str(),
                        "true" | "yes" | "1"
                    )
                })
        })
    })
}

fn request_json(
    client: &Client,
    profile: &EffectiveApiProfile,
    endpoint_kind: &str,
    url: &str,
    bearer_override: Option<&str>,
    new_api_user: Option<&str>,
) -> Result<Value, String> {
    let mut request = client
        .get(url)
        .header("accept", "application/json, text/plain, */*")
        .bearer_auth(bearer_override.unwrap_or(&profile.api_key));
    if let Some(user) = new_api_user {
        request = request.header("New-Api-User", user);
    }
    request = apply_profile_headers(request, profile)?;
    let response = request
        .send()
        .map_err(|error| format!("{endpoint_kind} 请求失败：{}", error))?;
    let status = response.status();
    let text = response.text().unwrap_or_default();
    if !status.is_success() {
        let text = redact_profile_secrets(&text, profile);
        return Err(format!(
            "{endpoint_kind} HTTP {}：{}",
            status.as_u16(),
            response_preview(&text)
        ));
    }
    serde_json::from_str(&text).map_err(|error| {
        let text = redact_profile_secrets(&text, profile);
        format!(
            "{endpoint_kind} JSON 解析失败：{}；响应片段：{}",
            error,
            response_preview(&text)
        )
    })
}

fn format_quota(value: Option<f64>) -> String {
    value
        .map(|value| {
            if value.fract().abs() < f64::EPSILON {
                format!("{value:.0}")
            } else {
                format!("{value:.2}")
            }
        })
        .unwrap_or_else(|| "-".to_string())
}

fn result_from_value(
    profile: &EffectiveApiProfile,
    endpoint_kind: &str,
    value: &Value,
) -> ApiBalanceResult {
    if profile.gateway_kind == AiGatewayKind::Xais {
        let total_available =
            number_at(value, &["/data/balance", "/balance"]).map(|balance| balance / 10_000.0);
        let available = total_available.is_some();
        let display = total_available
            .map(|balance| format!("剩余积分 {balance:.2}"))
            .unwrap_or_else(|| "接口可访问，但响应中没有 balance 字段".to_string());
        return ApiBalanceResult {
            available,
            provider: profile.provider.clone(),
            gateway_kind: profile.gateway_kind,
            total_granted: None,
            total_used: None,
            total_available,
            unlimited: false,
            currency: Some("points".to_string()),
            expires_at: None,
            raw_summary: Some(display.clone()),
            unsupported_reason: (!available).then(|| "XAIS 响应未提供 balance 字段".to_string()),
            endpoint_kind: endpoint_kind.to_string(),
            display,
        };
    }

    let total_granted = number_at(
        value,
        &[
            "/data/total_granted",
            "/total_granted",
            "/data/quota",
            "/quota",
            "/data/total",
        ],
    );
    let total_used = number_at(
        value,
        &[
            "/data/total_used",
            "/total_used",
            "/data/used_quota",
            "/used_quota",
            "/data/used",
        ],
    );
    let total_available = number_at(
        value,
        &[
            "/data/total_available",
            "/total_available",
            "/data/balance",
            "/balance",
            "/data/quota",
            "/quota",
            "/data/credit_grants/total_available",
            "/total_available",
        ],
    )
    .or_else(|| match (total_granted, total_used) {
        (Some(granted), Some(used)) => Some(granted - used),
        _ => None,
    });
    let unlimited = bool_at(
        value,
        &[
            "/data/unlimited_quota",
            "/unlimited_quota",
            "/data/unlimited",
            "/unlimited",
        ],
    );
    let expires_at = number_at(
        value,
        &[
            "/data/expires_at",
            "/expires_at",
            "/data/expired_time",
            "/expired_time",
        ],
    )
    .map(|value| value as i64)
    .filter(|value| *value > 0);
    let available = unlimited || total_available.is_some() || total_granted.is_some();
    let display = if unlimited {
        "无限额度".to_string()
    } else if available {
        format!(
            "总额度 {} · 已使用 {} · 剩余额度 {}",
            format_quota(total_granted),
            format_quota(total_used),
            format_quota(total_available)
        )
    } else {
        "接口可访问，但响应中没有可识别的余额字段".to_string()
    };
    ApiBalanceResult {
        available,
        provider: profile.provider.clone(),
        gateway_kind: profile.gateway_kind,
        total_granted,
        total_used,
        total_available,
        unlimited,
        currency: value
            .pointer("/data/currency")
            .or_else(|| value.get("currency"))
            .and_then(Value::as_str)
            .map(str::to_string),
        expires_at,
        raw_summary: Some(display.clone()),
        unsupported_reason: (!available).then(|| "响应未提供标准余额字段".to_string()),
        endpoint_kind: endpoint_kind.to_string(),
        display,
    }
}

fn lookup_header(profile: &EffectiveApiProfile, names: &[&str]) -> Option<String> {
    profile.headers.iter().find_map(|(key, value)| {
        names
            .iter()
            .any(|name| key.eq_ignore_ascii_case(name))
            .then(|| value.trim().to_string())
            .filter(|value| !value.is_empty())
    })
}

fn bearer_token(value: &str) -> String {
    value
        .trim()
        .strip_prefix("Bearer ")
        .or_else(|| value.trim().strip_prefix("bearer "))
        .unwrap_or_else(|| value.trim())
        .trim()
        .to_string()
}

fn legacy_management_auth(profile: &EffectiveApiProfile) -> Option<(String, String)> {
    let access_token = lookup_header(
        profile,
        &[
            "X-Linggan-NewAPI-Access-Token",
            "X-NewAPI-Access-Token",
            "NewAPI-Access-Token",
            "NewAPI-User-Token",
        ],
    )
    .or_else(|| lookup_header(profile, &["Authorization"]).map(|value| bearer_token(&value)))?;
    let user_id = lookup_header(
        profile,
        &[
            "X-Linggan-NewAPI-User",
            "X-Linggan-NewAPI-User-ID",
            "X-NewAPI-User",
            "X-NewAPI-User-ID",
            "New-Api-User",
            "NewAPI-User",
            "NewAPI-User-ID",
        ],
    )?;
    Some((access_token, user_id))
}

fn legacy_candidates(profile: &EffectiveApiProfile) -> Result<Vec<(&'static str, String)>, String> {
    Ok(vec![
        (
            "OpenAI Compatible /api/user/self",
            join_api_endpoint(&profile.base_url, "/api/user/self")?,
        ),
        (
            "OpenAI Compatible /newapi/balance",
            join_api_endpoint(&profile.base_url, "/newapi/balance")?,
        ),
        (
            "OpenAI billing credit_grants",
            join_api_endpoint(&profile.base_url, "/dashboard/billing/credit_grants")?,
        ),
    ])
}

pub fn query_api_balance(
    client: &Client,
    profile: &EffectiveApiProfile,
) -> Result<ApiBalanceResult, String> {
    if profile.api_key.trim().is_empty() {
        return Err("API Key 尚未配置".to_string());
    }

    let mut candidates = Vec::new();
    match profile.gateway_kind {
        AiGatewayKind::NewApi => {
            candidates.push((
                "NewAPI /api/usage/token/",
                endpoint_for(profile, GatewayOperation::Balance)?,
            ));
            candidates.extend(legacy_candidates(profile)?);
        }
        AiGatewayKind::Xais => {
            candidates.push((
                "XAIS /xais/userProfile",
                endpoint_for(profile, GatewayOperation::Balance)?,
            ));
        }
        AiGatewayKind::OpenAiCompatible | AiGatewayKind::Custom => {
            candidates.extend(legacy_candidates(profile)?);
        }
    }

    let mut errors = Vec::new();
    let mut unavailable_result = None;
    for (endpoint_kind, url) in candidates {
        let management_auth = endpoint_kind
            .contains("/api/user/self")
            .then(|| legacy_management_auth(profile))
            .flatten();
        match request_json(
            client,
            profile,
            endpoint_kind,
            &url,
            management_auth.as_ref().map(|(token, _)| token.as_str()),
            management_auth.as_ref().map(|(_, user)| user.as_str()),
        ) {
            Ok(value) => {
                let result = result_from_value(profile, endpoint_kind, &value);
                if result.available {
                    return Ok(result);
                }
                errors.push(format!("{endpoint_kind} 响应中没有可识别的余额字段"));
                unavailable_result = Some(result);
            }
            Err(error) => errors.push(error),
        }
    }
    if let Some(result) = unavailable_result {
        return Ok(result);
    }
    if matches!(
        profile.gateway_kind,
        AiGatewayKind::OpenAiCompatible | AiGatewayKind::Custom
    ) {
        return Ok(ApiBalanceResult {
            available: false,
            provider: profile.provider.clone(),
            gateway_kind: profile.gateway_kind,
            total_granted: None,
            total_used: None,
            total_available: None,
            unlimited: false,
            currency: None,
            expires_at: None,
            raw_summary: None,
            unsupported_reason: Some("该服务未提供可识别的标准余额接口".to_string()),
            endpoint_kind: "unsupported".to_string(),
            display: "该服务未提供标准余额接口".to_string(),
        });
    }
    Err(format!("余额查询失败：{}", errors.join("；")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::mpsc::{self, Receiver};
    use std::thread::{self, JoinHandle};
    use std::time::Duration;

    fn profile(kind: AiGatewayKind) -> EffectiveApiProfile {
        EffectiveApiProfile {
            source: "test".to_string(),
            gateway_kind: kind,
            provider: kind.as_str().to_string(),
            base_url: "https://api.example.com/v1".to_string(),
            api_key: "sk-secret-value".to_string(),
            model: "model".to_string(),
            headers: BTreeMap::new(),
            editable: true,
            key_last4: Some("alue".to_string()),
        }
    }

    fn mock_json_server(
        responses: Vec<(u16, &'static str)>,
    ) -> (String, Receiver<String>, JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let (sender, receiver) = mpsc::channel();
        let handle = thread::spawn(move || {
            for (status, body) in responses {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut bytes = Vec::new();
                let mut buffer = [0_u8; 4096];
                loop {
                    let read = stream.read(&mut buffer).unwrap();
                    if read == 0 {
                        break;
                    }
                    bytes.extend_from_slice(&buffer[..read]);
                    if bytes.windows(4).any(|window| window == b"\r\n\r\n") {
                        break;
                    }
                }
                sender
                    .send(String::from_utf8_lossy(&bytes).to_string())
                    .unwrap();
                let reason = if status == 200 { "OK" } else { "Not Found" };
                write!(
                    stream,
                    "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                )
                .unwrap();
                stream.flush().unwrap();
            }
        });
        (format!("http://{address}"), receiver, handle)
    }

    #[test]
    fn parses_nested_balance_without_exposing_api_key() {
        let result = result_from_value(
            &profile(AiGatewayKind::NewApi),
            "NewAPI /api/usage/token/",
            &serde_json::json!({
                "data": {
                    "total_granted": 1000,
                    "total_used": 250,
                    "currency": "USD"
                }
            }),
        );
        assert!(result.available);
        assert_eq!(result.total_available, Some(750.0));
        assert!(!serde_json::to_string(&result)
            .unwrap()
            .contains("sk-secret-value"));
    }

    #[test]
    fn preserves_xais_balance_scale() {
        let result = result_from_value(
            &profile(AiGatewayKind::Xais),
            "XAIS /xais/userProfile",
            &serde_json::json!({ "balance": 123456 }),
        );
        assert_eq!(result.total_available, Some(12.3456));
        assert_eq!(result.display, "剩余积分 12.35");
    }

    #[test]
    fn new_api_balance_uses_configured_base_url_and_bearer_token() {
        let (base_url, requests, server) =
            mock_json_server(vec![(200, r#"{"data":{"total_available":12.5}}"#)]);
        let mut profile = profile(AiGatewayKind::NewApi);
        profile.base_url = format!("{base_url}/tenant/v1");

        let result = query_api_balance(&Client::new(), &profile).unwrap();
        let request = requests.recv_timeout(Duration::from_secs(5)).unwrap();
        server.join().unwrap();

        assert_eq!(result.total_available, Some(12.5));
        assert!(request.starts_with("GET /tenant/api/usage/token/ HTTP/1.1"));
        assert!(request
            .to_ascii_lowercase()
            .contains("authorization: bearer sk-secret-value"));
    }

    #[test]
    fn xais_balance_preserves_special_headers_and_user_profile_path() {
        let (base_url, requests, server) = mock_json_server(vec![(200, r#"{"balance":250000}"#)]);
        let mut profile = profile(AiGatewayKind::Xais);
        profile.base_url = format!("{base_url}/v1");
        profile.headers = BTreeMap::from([
            (
                "X-Linggan-NewAPI-Access-Token".to_string(),
                "xais-access-token".to_string(),
            ),
            ("X-Linggan-NewAPI-User".to_string(), "42".to_string()),
        ]);

        let result = query_api_balance(&Client::new(), &profile).unwrap();
        let request = requests.recv_timeout(Duration::from_secs(5)).unwrap();
        server.join().unwrap();
        let request = request.to_ascii_lowercase();

        assert_eq!(result.total_available, Some(25.0));
        assert!(request.starts_with("get /xais/userprofile http/1.1"));
        assert!(request.contains("authorization: bearer sk-secret-value"));
        assert!(request.contains("x-linggan-newapi-access-token: xais-access-token"));
        assert!(request.contains("x-linggan-newapi-user: 42"));
    }

    #[test]
    fn legacy_user_self_candidate_uses_management_auth_without_affecting_xais() {
        let (base_url, requests, server) = mock_json_server(vec![(200, r#"{"balance":3}"#)]);
        let mut profile = profile(AiGatewayKind::OpenAiCompatible);
        profile.base_url = format!("{base_url}/v1");
        profile.headers = BTreeMap::from([
            (
                "X-Linggan-NewAPI-Access-Token".to_string(),
                "management-token".to_string(),
            ),
            ("X-Linggan-NewAPI-User".to_string(), "42".to_string()),
        ]);

        let result = query_api_balance(&Client::new(), &profile).unwrap();
        let request = requests.recv_timeout(Duration::from_secs(5)).unwrap();
        server.join().unwrap();
        let request = request.to_ascii_lowercase();

        assert_eq!(result.total_available, Some(3.0));
        assert!(request.starts_with("get /api/user/self http/1.1"));
        assert!(request.contains("authorization: bearer management-token"));
        assert!(request.contains("new-api-user: 42"));
    }

    #[test]
    fn openai_compatible_balance_continues_after_candidate_404s() {
        let (base_url, requests, server) = mock_json_server(vec![
            (404, r#"{"error":"missing"}"#),
            (404, r#"{"error":"missing"}"#),
            (200, r#"{"total_available":7}"#),
        ]);
        let mut profile = profile(AiGatewayKind::OpenAiCompatible);
        profile.base_url = format!("{base_url}/proxy/v1");

        let result = query_api_balance(&Client::new(), &profile).unwrap();
        let paths = (0..3)
            .map(|_| {
                requests
                    .recv_timeout(Duration::from_secs(5))
                    .unwrap()
                    .lines()
                    .next()
                    .unwrap()
                    .to_string()
            })
            .collect::<Vec<_>>();
        server.join().unwrap();

        assert_eq!(result.total_available, Some(7.0));
        assert_eq!(
            paths,
            vec![
                "GET /proxy/api/user/self HTTP/1.1",
                "GET /proxy/newapi/balance HTTP/1.1",
                "GET /proxy/dashboard/billing/credit_grants HTTP/1.1",
            ]
        );
    }
}
