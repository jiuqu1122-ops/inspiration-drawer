use reqwest::blocking::{Client, RequestBuilder};
use reqwest::header::{HeaderName, HeaderValue};
use serde_json::Value;

use crate::ai_gateway::balance;
use crate::ai_gateway::custom_adapter;
use crate::ai_gateway::endpoint::normalize_api_base_url;
use crate::ai_gateway::new_api_adapter;
use crate::ai_gateway::openai_compatible_adapter;
use crate::ai_gateway::types::{
    ApiBalanceResult, EffectiveApiProfile, GatewayConnectionResult, GatewayOperation,
};
use crate::ai_gateway::xais_adapter;
use crate::license::types::AiGatewayKind;

pub fn endpoint_for(
    profile: &EffectiveApiProfile,
    operation: GatewayOperation,
) -> Result<String, String> {
    use GatewayOperation::*;
    match operation {
        XaisUserProfile => xais_adapter::user_profile_endpoint(profile),
        XaisWorkerTaskStart => xais_adapter::worker_task_start_endpoint(profile),
        XaisWorkerTaskWait => xais_adapter::worker_task_wait_endpoint(profile),
        XaisAttachmentUrls => xais_adapter::attachment_urls_endpoint(profile),
        Balance => match profile.gateway_kind {
            AiGatewayKind::NewApi => new_api_adapter::balance_endpoint(profile),
            AiGatewayKind::Xais => xais_adapter::user_profile_endpoint(profile),
            AiGatewayKind::OpenAiCompatible => {
                crate::ai_gateway::endpoint::join_api_endpoint(&profile.base_url, "/api/user/self")
            }
            AiGatewayKind::Custom => {
                crate::ai_gateway::endpoint::join_api_endpoint(&profile.base_url, "/api/user/self")
            }
        },
        Models => match profile.gateway_kind {
            AiGatewayKind::NewApi => new_api_adapter::models_endpoint(profile),
            AiGatewayKind::Xais => xais_adapter::models_endpoint(profile),
            AiGatewayKind::OpenAiCompatible => openai_compatible_adapter::models_endpoint(profile),
            AiGatewayKind::Custom => custom_adapter::models_endpoint(profile),
        },
        ChatCompletions => match profile.gateway_kind {
            AiGatewayKind::NewApi => new_api_adapter::chat_endpoint(profile),
            AiGatewayKind::Xais => xais_adapter::chat_endpoint(profile),
            AiGatewayKind::OpenAiCompatible => openai_compatible_adapter::chat_endpoint(profile),
            AiGatewayKind::Custom => custom_adapter::chat_endpoint(profile),
        },
        Responses => match profile.gateway_kind {
            AiGatewayKind::NewApi => new_api_adapter::responses_endpoint(profile),
            AiGatewayKind::Xais => xais_adapter::responses_endpoint(profile),
            AiGatewayKind::OpenAiCompatible => {
                openai_compatible_adapter::responses_endpoint(profile)
            }
            AiGatewayKind::Custom => custom_adapter::responses_endpoint(profile),
        },
        ImageGenerations => match profile.gateway_kind {
            AiGatewayKind::NewApi => new_api_adapter::image_generations_endpoint(profile),
            AiGatewayKind::Xais => xais_adapter::image_generations_endpoint(profile),
            AiGatewayKind::OpenAiCompatible => {
                openai_compatible_adapter::image_generations_endpoint(profile)
            }
            AiGatewayKind::Custom => custom_adapter::image_generations_endpoint(profile),
        },
        ImageEdits => match profile.gateway_kind {
            AiGatewayKind::NewApi => new_api_adapter::image_edits_endpoint(profile),
            AiGatewayKind::Xais => xais_adapter::image_edits_endpoint(profile),
            AiGatewayKind::OpenAiCompatible => {
                openai_compatible_adapter::image_edits_endpoint(profile)
            }
            AiGatewayKind::Custom => custom_adapter::image_edits_endpoint(profile),
        },
        VideoGenerations => match profile.gateway_kind {
            AiGatewayKind::NewApi => new_api_adapter::video_generations_endpoint(profile),
            AiGatewayKind::Xais => {
                Err("XAIS 视频继续使用 workerTaskStart/workerTaskWait".to_string())
            }
            AiGatewayKind::OpenAiCompatible => {
                openai_compatible_adapter::video_generations_endpoint(profile)
            }
            AiGatewayKind::Custom => custom_adapter::video_generations_endpoint(profile),
        },
    }
}

pub fn operation_from_url(url: &str) -> Option<GatewayOperation> {
    let path = url
        .split(['?', '#'])
        .next()
        .unwrap_or(url)
        .to_ascii_lowercase();
    if path.ends_with("/xais/userprofile") {
        Some(GatewayOperation::XaisUserProfile)
    } else if path.ends_with("/xais/workertaskstart") || path.ends_with("/workertaskstart") {
        Some(GatewayOperation::XaisWorkerTaskStart)
    } else if path.ends_with("/xais/workertaskwait") || path.ends_with("/workertaskwait") {
        Some(GatewayOperation::XaisWorkerTaskWait)
    } else if path.ends_with("/xais/atturls") || path.ends_with("/atturls") {
        Some(GatewayOperation::XaisAttachmentUrls)
    } else if path.ends_with("/chat/completions") {
        Some(GatewayOperation::ChatCompletions)
    } else if path.ends_with("/responses") {
        Some(GatewayOperation::Responses)
    } else if path.ends_with("/images/generations") {
        Some(GatewayOperation::ImageGenerations)
    } else if path.ends_with("/images/edits") {
        Some(GatewayOperation::ImageEdits)
    } else if path.ends_with("/video/generations") || path.contains("/video/generations/") {
        Some(GatewayOperation::VideoGenerations)
    } else if path.ends_with("/models") {
        Some(GatewayOperation::Models)
    } else {
        None
    }
}

pub fn route_existing_url(
    profile: &EffectiveApiProfile,
    original_url: &str,
) -> Result<String, String> {
    let Some(operation) = operation_from_url(original_url) else {
        return Ok(original_url.to_string());
    };
    let mut routed = endpoint_for(profile, operation)?;
    if operation == GatewayOperation::VideoGenerations {
        let path = original_url
            .split(['?', '#'])
            .next()
            .unwrap_or(original_url);
        if let Some((_, task_id)) = path.rsplit_once("/video/generations/") {
            if !task_id.is_empty() {
                routed.push('/');
                routed.push_str(task_id);
            }
        }
    }
    if matches!(
        operation,
        GatewayOperation::XaisWorkerTaskWait | GatewayOperation::XaisAttachmentUrls
    ) {
        if let Some(query) = original_url.split_once('?').map(|(_, query)| query) {
            let query = query.split('#').next().unwrap_or(query);
            if !query.is_empty() {
                routed.push('?');
                routed.push_str(query);
            }
        }
    }
    Ok(routed)
}

pub fn apply_profile_headers(
    mut request: RequestBuilder,
    profile: &EffectiveApiProfile,
) -> Result<RequestBuilder, String> {
    for (key, value) in &profile.headers {
        if key.eq_ignore_ascii_case("authorization") {
            continue;
        }
        let name = HeaderName::from_bytes(key.as_bytes())
            .map_err(|_| format!("Header 名称无效：{key}"))?;
        let value = HeaderValue::from_str(value).map_err(|_| format!("Header 值无效：{key}"))?;
        request = request.header(name, value);
    }
    Ok(request)
}

pub fn response_preview(text: &str) -> String {
    let compact = text.split_whitespace().collect::<Vec<_>>().join(" ");
    compact.chars().take(240).collect()
}

pub fn redact_secret(text: &str, secret: &str) -> String {
    let secret = secret.trim();
    if secret.len() < 4 {
        return text.to_string();
    }
    text.replace(secret, "[redacted]")
}

pub fn redact_profile_secrets(text: &str, profile: &EffectiveApiProfile) -> String {
    let mut redacted = redact_secret(text, &profile.api_key);
    for value in profile.headers.values() {
        redacted = redact_secret(&redacted, value);
    }
    redacted
}

pub fn list_models(client: &Client, profile: &EffectiveApiProfile) -> Result<Vec<String>, String> {
    if profile.api_key.trim().is_empty() {
        return Err("API Key 尚未配置".to_string());
    }
    let url = endpoint_for(profile, GatewayOperation::Models)?;
    let request = client.get(&url).bearer_auth(&profile.api_key);
    let response = apply_profile_headers(request, profile)?
        .send()
        .map_err(|error| format!("模型列表请求失败：{}", error))?;
    let status = response.status();
    let text = response.text().unwrap_or_default();
    if !status.is_success() {
        return Err(format!(
            "模型列表 HTTP {}：{}",
            status.as_u16(),
            response_preview(&redact_profile_secrets(&text, profile))
        ));
    }
    let parsed: Value = serde_json::from_str(&text)
        .map_err(|error| format!("模型列表 JSON 解析失败：{}", error))?;
    let values = parsed
        .get("data")
        .and_then(Value::as_array)
        .or_else(|| parsed.get("models").and_then(Value::as_array))
        .or_else(|| parsed.as_array())
        .ok_or_else(|| "模型列表缺少 data/models 数组".to_string())?;
    let mut models = values
        .iter()
        .filter_map(|value| {
            value.as_str().or_else(|| {
                value
                    .get("id")
                    .or_else(|| value.get("name"))
                    .and_then(Value::as_str)
            })
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    models.sort();
    models.dedup();
    Ok(models)
}

pub fn test_connection(
    client: &Client,
    profile: &EffectiveApiProfile,
) -> Result<GatewayConnectionResult, String> {
    let models = list_models(client, profile)?;
    Ok(GatewayConnectionResult {
        ok: true,
        gateway_kind: profile.gateway_kind,
        provider: profile.provider.clone(),
        model_count: models.len(),
        message: format!("连接成功，读取到 {} 个模型", models.len()),
        endpoint_kind: format!("{} /v1/models", profile.gateway_kind.as_str()),
    })
}

pub fn query_api_balance(
    client: &Client,
    profile: &EffectiveApiProfile,
) -> Result<ApiBalanceResult, String> {
    balance::query_api_balance(client, profile)
}

pub fn codex_v1_base_url(profile: &EffectiveApiProfile) -> Result<String, String> {
    normalize_api_base_url(&profile.base_url)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    fn profile(kind: AiGatewayKind, base_url: &str) -> EffectiveApiProfile {
        EffectiveApiProfile {
            source: "test".to_string(),
            gateway_kind: kind,
            provider: kind.as_str().to_string(),
            base_url: base_url.to_string(),
            api_key: "sk-test".to_string(),
            model: "model".to_string(),
            headers: BTreeMap::new(),
            editable: true,
            key_last4: Some("test".to_string()),
        }
    }

    #[test]
    fn routes_new_api_without_duplicate_v1() {
        let base_profile = profile(AiGatewayKind::NewApi, "https://api.example.com/v1");
        assert_eq!(
            endpoint_for(&base_profile, GatewayOperation::ChatCompletions).unwrap(),
            "https://api.example.com/v1/chat/completions"
        );
        assert_eq!(
            endpoint_for(&base_profile, GatewayOperation::Balance).unwrap(),
            "https://api.example.com/api/usage/token/"
        );
        assert_eq!(
            route_existing_url(
                &base_profile,
                "https://old.example/v1/video/generations/task-123"
            )
            .unwrap(),
            "https://api.example.com/v1/video/generations/task-123"
        );
        let submit_profile = profile(
            AiGatewayKind::NewApi,
            "https://api.example.com/v1/video/generations",
        );
        assert_eq!(
            route_existing_url(
                &submit_profile,
                "https://api.example.com/v1/video/generations"
            )
            .unwrap(),
            "https://api.example.com/v1/video/generations"
        );
        let polling_profile = profile(
            AiGatewayKind::NewApi,
            "https://api.example.com/v1/video/generations/task-123",
        );
        assert_eq!(
            route_existing_url(
                &polling_profile,
                "https://api.example.com/v1/video/generations/task-123"
            )
            .unwrap(),
            "https://api.example.com/v1/video/generations/task-123"
        );
    }

    #[test]
    fn preserves_xais_paths() {
        let profile = profile(AiGatewayKind::Xais, "https://xais.dchai.cn");
        assert_eq!(
            endpoint_for(&profile, GatewayOperation::XaisUserProfile).unwrap(),
            "https://xais.dchai.cn/xais/userProfile"
        );
        assert_eq!(
            endpoint_for(&profile, GatewayOperation::XaisWorkerTaskStart).unwrap(),
            "https://xais.dchai.cn/xais/workerTaskStart"
        );
        assert_eq!(
            route_existing_url(
                &profile,
                "https://xais.dchai.cn/workerTaskWait?json=1&id=task-1"
            )
            .unwrap(),
            "https://xais.dchai.cn/xais/workerTaskWait?json=1&id=task-1"
        );
        assert_eq!(
            xais_adapter::file_attachment_upload_url_endpoint(&profile, "png").unwrap(),
            "https://xais.dchai.cn/xais/fileAttachmentUploadUrl?ext=png"
        );
        assert_eq!(
            xais_adapter::attachment_registration_endpoint(&profile, "a b.png").unwrap(),
            "https://xais.dchai.cn/xais/attUrls?att=a+b.png"
        );
    }

    #[test]
    fn redacts_api_key_and_header_secrets_from_gateway_errors() {
        let mut profile = profile(AiGatewayKind::Custom, "https://api.example.com/v1");
        profile.api_key = "sk-super-secret".to_string();
        profile
            .headers
            .insert("X-Tenant-Token".to_string(), "tenant-secret".to_string());
        let redacted =
            redact_profile_secrets("failed for sk-super-secret and tenant-secret", &profile);
        assert_eq!(redacted, "failed for [redacted] and [redacted]");
    }
}
