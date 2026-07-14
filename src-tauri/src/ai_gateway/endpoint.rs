use url::Url;

const KNOWN_ENDPOINT_SUFFIXES: &[&str] = &[
    "/v1/chat/completions",
    "/v1/images/generations",
    "/v1/images/edits",
    "/v1/video/generations",
    "/v1/responses",
    "/v1/models",
    "/chat/completions",
    "/images/generations",
    "/images/edits",
    "/video/generations",
    "/responses",
    "/models",
    "/api/usage/token",
    "/api/user/self",
    "/newapi/balance",
    "/dashboard/billing/credit_grants",
    "/xais/userprofile",
    "/xais/workertaskstart",
    "/xais/workertaskwait",
    "/xais/fileattachmentuploadurl",
    "/xais/atturls",
    "/xais",
    "/v1",
];

pub fn normalize_api_root_url(input: &str) -> Result<String, String> {
    let input = input.trim();
    if input.is_empty() {
        return Err("API Base URL 不能为空".to_string());
    }
    let mut url =
        Url::parse(input).map_err(|_| "API Base URL 必须是有效的 http(s) URL".to_string())?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err("API Base URL 必须以 http:// 或 https:// 开头".to_string());
    }
    url.set_query(None);
    url.set_fragment(None);

    let mut path = url.path().trim_end_matches('/').to_string();
    loop {
        let lower = path.to_ascii_lowercase();
        let dynamic_video_endpoint = ["/v1/video/generations/", "/video/generations/"]
            .iter()
            .find_map(|marker| {
                let index = lower.rfind(marker)?;
                let task_id = &lower[index + marker.len()..];
                (!task_id.is_empty() && !task_id.contains('/')).then_some(index)
            });
        if let Some(index) = dynamic_video_endpoint {
            path.truncate(index);
            path = path.trim_end_matches('/').to_string();
            continue;
        }
        let Some(suffix) = KNOWN_ENDPOINT_SUFFIXES
            .iter()
            .find(|suffix| lower.ends_with(**suffix))
        else {
            break;
        };
        path.truncate(path.len().saturating_sub(suffix.len()));
        path = path.trim_end_matches('/').to_string();
    }
    url.set_path(if path.is_empty() { "/" } else { &path });
    Ok(url.to_string().trim_end_matches('/').to_string())
}

pub fn normalize_api_base_url(input: &str) -> Result<String, String> {
    let root = normalize_api_root_url(input)?;
    Ok(format!("{root}/v1"))
}

pub fn join_api_endpoint(base_url: &str, path: &str) -> Result<String, String> {
    let root = normalize_api_root_url(base_url)?;
    let path = path.trim();
    if path.is_empty() {
        return Ok(root);
    }
    Ok(format!("{root}/{}", path.trim_start_matches('/')))
}

pub fn same_origin(left: &str, right: &str) -> bool {
    let Ok(left) = Url::parse(left.trim()) else {
        return false;
    };
    let Ok(right) = Url::parse(right.trim()) else {
        return false;
    };
    left.scheme() == right.scheme()
        && left.host_str() == right.host_str()
        && left.port_or_known_default() == right.port_or_known_default()
}

pub fn redact_api_base_url(input: &str) -> String {
    Url::parse(input.trim())
        .ok()
        .and_then(|url| {
            let host = url.host_str()?;
            Some(match url.port() {
                Some(port) => format!("{}://{}:{}", url.scheme(), host, port),
                None => format!("{}://{}", url.scheme(), host),
            })
        })
        .unwrap_or_else(|| "[configured]".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_root_and_v1_without_duplicate_segments() {
        assert_eq!(
            normalize_api_root_url("https://api.example.com/v1/chat/completions").unwrap(),
            "https://api.example.com"
        );
        assert_eq!(
            normalize_api_base_url("https://api.example.com/v1/").unwrap(),
            "https://api.example.com/v1"
        );
        assert_eq!(
            join_api_endpoint("https://api.example.com/v1", "/v1/models").unwrap(),
            "https://api.example.com/v1/models"
        );
        assert_eq!(
            join_api_endpoint(
                "https://api.example.com/chat/completions/chat/completions",
                "/v1/chat/completions"
            )
            .unwrap(),
            "https://api.example.com/v1/chat/completions"
        );
        assert_eq!(
            join_api_endpoint(
                "https://api.example.com/v1/video/generations",
                "/v1/video/generations"
            )
            .unwrap(),
            "https://api.example.com/v1/video/generations"
        );
        assert_eq!(
            join_api_endpoint(
                "https://api.example.com/v1/video/generations/task-123",
                "/v1/video/generations"
            )
            .unwrap(),
            "https://api.example.com/v1/video/generations"
        );
    }

    #[test]
    fn preserves_custom_path_prefixes() {
        assert_eq!(
            normalize_api_base_url("https://api.example.com/proxy/v1/models").unwrap(),
            "https://api.example.com/proxy/v1"
        );
    }
}
