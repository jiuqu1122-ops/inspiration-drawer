use crate::repositories::chat_repository::*;
use serde::Serialize;
use std::collections::HashSet;
use std::io::Read;
use std::net::IpAddr;
use std::time::Duration;
use url::Url;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatWebSearchItem {
    title: String,
    url: String,
    snippet: String,
    published_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatWebSearchResult {
    query: String,
    provider: String,
    searched_at: String,
    results: Vec<ChatWebSearchItem>,
}

fn xml_tag(block: &str, tag: &str) -> Option<String> {
    let start_token = format!("<{tag}>");
    let end_token = format!("</{tag}>");
    let start = block.find(&start_token)? + start_token.len();
    let end = block[start..].find(&end_token)? + start;
    Some(block[start..end].trim().to_string())
}

fn decode_search_text(value: &str) -> String {
    let decoded = value
        .replace("<![CDATA[", "")
        .replace("]]>", "")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&");
    let mut plain = String::with_capacity(decoded.len());
    let mut inside_tag = false;
    for character in decoded.chars() {
        match character {
            '<' => inside_tag = true,
            '>' => {
                inside_tag = false;
                plain.push(' ');
            }
            _ if !inside_tag => plain.push(character),
            _ => {}
        }
    }
    plain.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn parse_bing_rss(body: &str, limit: usize) -> Vec<ChatWebSearchItem> {
    body.split("<item>")
        .skip(1)
        .filter_map(|block| {
            let item = block.split("</item>").next()?;
            let title = decode_search_text(&xml_tag(item, "title")?);
            let url = decode_search_text(&xml_tag(item, "link")?);
            if title.is_empty() || !url.starts_with("http") {
                return None;
            }
            Some(ChatWebSearchItem {
                title,
                url,
                snippet: xml_tag(item, "description")
                    .map(|value| decode_search_text(&value))
                    .unwrap_or_default(),
                published_at: xml_tag(item, "pubDate")
                    .map(|value| decode_search_text(&value))
                    .filter(|value| !value.is_empty()),
                content: None,
            })
        })
        .take(limit)
        .collect()
}

fn html_attribute(tag: &str, name: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    for quote in ['"', '\''] {
        let needle = format!("{name}={quote}");
        if let Some(start) = lower.find(&needle).map(|index| index + needle.len()) {
            let end = tag[start..].find(quote)? + start;
            return Some(tag[start..end].to_string());
        }
    }
    None
}

fn duckduckgo_result_url(value: &str) -> Option<String> {
    let decoded = value.replace("&amp;", "&");
    let absolute = if decoded.starts_with("//") {
        format!("https:{decoded}")
    } else {
        decoded
    };
    let url = Url::parse(&absolute).ok()?;
    if url
        .host_str()
        .is_some_and(|host| host.ends_with("duckduckgo.com"))
    {
        let target = url
            .query_pairs()
            .find_map(|(name, value)| (name == "uddg").then(|| value.into_owned()))?;
        return is_public_web_url(&target).then_some(target);
    }
    is_public_web_url(&absolute).then_some(absolute)
}

fn next_result_link_class(lower: &str, start: usize) -> Option<usize> {
    ["class='result-link'", "class=\"result-link\""]
        .iter()
        .filter_map(|needle| lower[start..].find(needle).map(|offset| start + offset))
        .min()
}

fn result_snippet(block: &str) -> String {
    let lower = block.to_ascii_lowercase();
    let Some(class_start) = ["class='result-snippet'", "class=\"result-snippet\""]
        .iter()
        .filter_map(|needle| lower.find(needle))
        .min()
    else {
        return String::new();
    };
    let Some(content_start) = lower[class_start..]
        .find('>')
        .map(|offset| class_start + offset + 1)
    else {
        return String::new();
    };
    let content_end = lower[content_start..]
        .find("</td>")
        .map(|offset| content_start + offset)
        .unwrap_or(block.len());
    decode_search_text(&block[content_start..content_end])
}

fn parse_duckduckgo_lite(body: &str, limit: usize) -> Vec<ChatWebSearchItem> {
    let lower = body.to_ascii_lowercase();
    let mut cursor = 0;
    let mut results = Vec::new();
    while results.len() < limit {
        let Some(class_start) = next_result_link_class(&lower, cursor) else {
            break;
        };
        let Some(anchor_start) = lower[..class_start].rfind("<a") else {
            cursor = class_start + 1;
            continue;
        };
        let Some(open_end) = lower[class_start..]
            .find('>')
            .map(|offset| class_start + offset)
        else {
            break;
        };
        let Some(anchor_end) = lower[open_end + 1..]
            .find("</a>")
            .map(|offset| open_end + 1 + offset)
        else {
            break;
        };
        let next_start = next_result_link_class(&lower, anchor_end + 4).unwrap_or(body.len());
        cursor = next_start;

        let Some(href) = html_attribute(&body[anchor_start..=open_end], "href") else {
            continue;
        };
        let Some(url) = duckduckgo_result_url(&href) else {
            continue;
        };
        let title = decode_search_text(&body[open_end + 1..anchor_end]);
        if title.is_empty() {
            continue;
        }
        results.push(ChatWebSearchItem {
            title,
            url,
            snippet: result_snippet(&body[anchor_end + 4..next_start]),
            published_at: None,
            content: None,
        });
    }
    results
}

fn looks_like_news_query(query: &str) -> bool {
    let lower = query.to_ascii_lowercase();
    [
        "新闻", "消息", "头条", "快讯", "发布", "进展", "动态", "事件", "发生", "今日", "今天",
        "昨天", "最近", "最新", "实时", "news", "latest", "today", "breaking",
    ]
    .iter()
    .any(|keyword| lower.contains(keyword))
}

fn private_or_local_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(value) => {
            value.is_private()
                || value.is_loopback()
                || value.is_link_local()
                || value.is_unspecified()
                || value.is_broadcast()
        }
        IpAddr::V6(value) => {
            value.is_loopback()
                || value.is_unspecified()
                || (value.segments()[0] & 0xfe00) == 0xfc00
                || (value.segments()[0] & 0xffc0) == 0xfe80
        }
    }
}

fn is_public_web_url(value: &str) -> bool {
    let Ok(url) = Url::parse(value) else {
        return false;
    };
    if !matches!(url.scheme(), "http" | "https") {
        return false;
    }
    let Some(host) = url
        .host_str()
        .map(|value| value.trim().to_ascii_lowercase())
    else {
        return false;
    };
    if host == "localhost" || host.ends_with(".localhost") || host.ends_with(".local") {
        return false;
    }
    host.parse::<IpAddr>()
        .map(|ip| !private_or_local_ip(ip))
        .unwrap_or(true)
}

fn remove_html_block(mut html: String, tag: &str) -> String {
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    loop {
        let lower = html.to_ascii_lowercase();
        let Some(start) = lower.find(&open) else {
            break;
        };
        let end = lower[start..]
            .find(&close)
            .map(|offset| start + offset + close.len())
            .unwrap_or(html.len());
        html.replace_range(start..end, " ");
    }
    html
}

fn html_tag_fragment<'a>(html: &'a str, tag: &str) -> Option<&'a str> {
    let lower = html.to_ascii_lowercase();
    let open = format!("<{tag}");
    let start = lower.find(&open)?;
    let content_start = lower[start..].find('>')? + start + 1;
    let close = format!("</{tag}>");
    let content_end = lower[content_start..]
        .find(&close)
        .map(|offset| content_start + offset)
        .unwrap_or(html.len());
    Some(&html[content_start..content_end])
}

fn extract_page_text(html: &str, max_chars: usize) -> String {
    let primary = html_tag_fragment(html, "article")
        .or_else(|| html_tag_fragment(html, "main"))
        .or_else(|| html_tag_fragment(html, "body"))
        .unwrap_or(html);
    let cleaned = ["script", "style", "svg", "noscript", "template"]
        .iter()
        .fold(primary.to_string(), |value, tag| {
            remove_html_block(value, tag)
        });
    let text = decode_search_text(&cleaned);
    text.chars().take(max_chars).collect::<String>()
}

fn fetch_page_excerpt(client: &reqwest::blocking::Client, url: &str) -> Option<String> {
    if !is_public_web_url(url) {
        return None;
    }
    let mut response = client
        .get(url)
        .timeout(Duration::from_secs(12))
        .header(
            "accept",
            "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.2",
        )
        .send()
        .ok()?;
    if !response.status().is_success() || !is_public_web_url(response.url().as_str()) {
        return None;
    }
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !content_type.is_empty()
        && !content_type.contains("text/html")
        && !content_type.contains("application/xhtml+xml")
        && !content_type.contains("text/plain")
    {
        return None;
    }
    if response.content_length().unwrap_or_default() > 2_000_000 {
        return None;
    }
    let mut bytes = Vec::new();
    response
        .by_ref()
        .take(1_500_000)
        .read_to_end(&mut bytes)
        .ok()?;
    let text = extract_page_text(&String::from_utf8_lossy(&bytes), 4_200);
    (text.chars().count() >= 160).then_some(text)
}

fn fetch_bing_feed(
    client: &reqwest::blocking::Client,
    endpoint: &str,
    query: &str,
    limit: usize,
) -> Result<Vec<ChatWebSearchItem>, String> {
    let mut request = client
        .get(endpoint)
        .query(&[("format", "RSS"), ("q", query)]);
    if !endpoint.contains("/news/") {
        request = request.query(&[("setlang", "zh-hans"), ("cc", "CN")]);
    }
    let response = request
        .header("accept", "application/rss+xml, application/xml, text/xml")
        .header("accept-language", "zh-CN,zh;q=0.9,en;q=0.8")
        .send()
        .map_err(|error| format!("联网搜索失败：{error}"))?;
    let status = response.status();
    let body = response
        .text()
        .map_err(|error| format!("读取联网搜索结果失败：{error}"))?;
    if !status.is_success() {
        return Err(format!("联网搜索服务返回 HTTP {}", status.as_u16()));
    }
    Ok(parse_bing_rss(&body, limit))
}

fn fetch_duckduckgo_lite(
    client: &reqwest::blocking::Client,
    query: &str,
    limit: usize,
) -> Result<Vec<ChatWebSearchItem>, String> {
    let response = client
        .get("https://lite.duckduckgo.com/lite/")
        .query(&[("q", query)])
        .header(
            "user-agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36",
        )
        .header("accept", "text/html,application/xhtml+xml")
        .header("accept-language", "zh-CN,zh;q=0.9,en;q=0.8")
        .send()
        .map_err(|error| format!("联网网页搜索失败：{error}"))?;
    let status = response.status();
    let body = response
        .text()
        .map_err(|error| format!("读取联网网页搜索结果失败：{error}"))?;
    if !status.is_success() {
        return Err(format!("联网网页搜索服务返回 HTTP {}", status.as_u16()));
    }
    Ok(parse_duckduckgo_lite(&body, limit))
}

#[tauri::command]
pub async fn chat_web_search(
    app_handle: tauri::AppHandle,
    query: String,
    limit: Option<usize>,
) -> Result<ChatWebSearchResult, String> {
    let query = query.trim().to_string();
    if query.is_empty() || query.chars().count() > 500 {
        return Err("联网搜索词不能为空或超过 500 个字符".to_string());
    }
    let result_limit = limit.unwrap_or(6).clamp(1, 8);
    tauri::async_runtime::spawn_blocking(move || {
        let client = crate::build_http_client(Some(&app_handle), None, 25)?;
        let mut candidates = Vec::new();
        if let Ok(web) = fetch_duckduckgo_lite(&client, &query, result_limit) {
            candidates.extend(web);
        }
        if looks_like_news_query(&query) {
            if let Ok(news) = fetch_bing_feed(
                &client,
                "https://www.bing.com/news/search",
                &query,
                result_limit,
            ) {
                candidates.extend(news);
            }
        }
        candidates.extend(
            fetch_bing_feed(&client, "https://www.bing.com/search", &query, result_limit)
                .unwrap_or_default(),
        );
        let mut seen = HashSet::new();
        let mut results = candidates
            .into_iter()
            .filter(|item| seen.insert(item.url.trim_end_matches('/').to_ascii_lowercase()))
            .take(result_limit)
            .collect::<Vec<_>>();
        if results.is_empty() {
            return Err("联网搜索没有返回可用结果，请更换关键词重试".to_string());
        }
        for item in results.iter_mut().take(4) {
            item.content = fetch_page_excerpt(&client, &item.url);
        }
        Ok(ChatWebSearchResult {
            query,
            provider: "DuckDuckGo Web + Bing News + 页面正文".to_string(),
            searched_at: chrono::Utc::now().to_rfc3339(),
            results,
        })
    })
    .await
    .map_err(|error| format!("联网搜索后台任务失败：{error}"))?
}

#[tauri::command]
pub fn chat_conversation_count(app_handle: tauri::AppHandle) -> Result<i64, String> {
    crate::services::chat_service::conversation_count(app_handle)
}

#[cfg(test)]
mod tests {
    use super::{
        extract_page_text, is_public_web_url, looks_like_news_query, parse_bing_rss,
        parse_duckduckgo_lite,
    };

    #[test]
    fn parses_bing_rss_search_items() {
        let xml = r#"<rss><channel><item><title>Example &amp; title</title><link>https://example.com/a</link><description>A &lt;b&gt;useful&lt;/b&gt; result.</description><pubDate>Tue, 01 Sep 2026 00:00:00 GMT</pubDate></item></channel></rss>"#;
        let results = parse_bing_rss(xml, 6);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "Example & title");
        assert_eq!(results[0].snippet, "A useful result.");
        assert_eq!(results[0].url, "https://example.com/a");
        assert!(results[0].content.is_none());
    }

    #[test]
    fn extracts_article_text_without_scripts() {
        let html = r#"<html><body><nav>menu</nav><article><h1>标题</h1><script>ignore me</script><p>这是正文内容，包含足够可靠的新闻信息。</p></article></body></html>"#;
        let text = extract_page_text(html, 200);
        assert!(text.contains("标题"));
        assert!(text.contains("这是正文内容"));
        assert!(!text.contains("ignore me"));
        assert!(!text.contains("menu"));
    }

    #[test]
    fn parses_duckduckgo_lite_results_and_resolves_target_url() {
        let html = r#"<table><tr><td><a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fnews%3Fa%3D1&amp;rut=abc" class='result-link'>A股 &amp; 市场收评</a></td></tr><tr><td class='result-snippet'>指数&lt;b&gt;上涨&lt;/b&gt; 0.86%</td></tr></table>"#;
        let results = parse_duckduckgo_lite(html, 6);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "A股 & 市场收评");
        assert_eq!(results[0].url, "https://example.com/news?a=1");
        assert_eq!(results[0].snippet, "指数 上涨 0.86%");
    }

    #[test]
    fn identifies_news_queries_and_blocks_local_urls() {
        assert!(looks_like_news_query("今天的 AI 新闻"));
        assert!(looks_like_news_query("latest OpenAI updates"));
        assert!(!looks_like_news_query("Rust Vec 文档"));
        assert!(is_public_web_url("https://example.com/news"));
        assert!(!is_public_web_url("http://127.0.0.1:8080/private"));
        assert!(!is_public_web_url("file:///C:/secret.txt"));
    }
}

#[tauri::command]
pub fn chat_list_conversations(
    app_handle: tauri::AppHandle,
    options: ChatConversationListOptions,
) -> Result<Vec<ChatConversationRecord>, String> {
    crate::services::chat_service::list_conversations(app_handle, options)
}

#[tauri::command]
pub fn chat_upsert_conversation(
    app_handle: tauri::AppHandle,
    conversation: ChatConversationRecord,
) -> Result<ChatConversationRecord, String> {
    crate::services::chat_service::upsert_conversation(app_handle, conversation)
}

#[tauri::command]
pub fn chat_delete_conversation(app_handle: tauri::AppHandle, id: String) -> Result<bool, String> {
    crate::services::chat_service::delete_conversation(app_handle, id)
}

#[tauri::command]
pub fn chat_list_messages(
    app_handle: tauri::AppHandle,
    options: ChatMessageListOptions,
) -> Result<ChatMessagePage, String> {
    crate::services::chat_service::list_messages(app_handle, options)
}

#[tauri::command]
pub fn chat_upsert_message(
    app_handle: tauri::AppHandle,
    message: ChatMessageRecord,
) -> Result<ChatMessageRecord, String> {
    crate::services::chat_service::upsert_message(app_handle, message)
}

#[tauri::command]
pub fn chat_upsert_attachment(
    app_handle: tauri::AppHandle,
    attachment: ChatAttachmentRecord,
) -> Result<ChatAttachmentRecord, String> {
    crate::services::chat_service::upsert_attachment(app_handle, attachment)
}

#[tauri::command]
pub fn chat_upsert_tool_call(
    app_handle: tauri::AppHandle,
    call: ChatToolCallRecord,
) -> Result<ChatToolCallRecord, String> {
    crate::services::chat_service::upsert_tool_call(app_handle, call)
}

#[tauri::command]
pub fn chat_get_summary(
    app_handle: tauri::AppHandle,
    conversation_id: String,
) -> Result<Option<ChatSummaryRecord>, String> {
    crate::services::chat_service::get_summary(app_handle, conversation_id)
}

#[tauri::command]
pub fn chat_upsert_summary(
    app_handle: tauri::AppHandle,
    summary: ChatSummaryRecord,
) -> Result<ChatSummaryRecord, String> {
    crate::services::chat_service::upsert_summary(app_handle, summary)
}

#[tauri::command]
pub fn chat_migrate_legacy(
    app_handle: tauri::AppHandle,
    payload: LegacyChatMigrationPayload,
) -> Result<usize, String> {
    crate::services::chat_service::migrate_legacy(app_handle, payload)
}
