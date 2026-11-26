//! URL policy for the independent Rhino channel. CDN links are never starting URLs.
use url::Url;

const GITEE_REPO: &str = "zibinyou/inspiration-drawer";
const GITHUB_REPO: &str = "jiuqu1122-ops/inspiration-drawer";
pub(super) const INDEX_FILE: &str = "latest.json";

// Check the spelling before URL parsing can normalize dot segments or backslashes.
pub(super) fn release_start(value: &str, file: &str) -> Result<Url, String> {
    let invalid = || "Untrusted Rhino release origin, tag or filename".to_string();
    let (authority, path) = value
        .strip_prefix("https://")
        .and_then(|s| s.split_once('/'))
        .ok_or_else(invalid)?;
    let repo = match authority.strip_suffix(":443").unwrap_or(authority) {
        "gitee.com" => GITEE_REPO,
        "github.com" => GITHUB_REPO,
        _ => return Err(invalid()),
    };
    if !file
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || b".+-".contains(&b))
        || !(file == INDEX_FILE || (file.starts_with("rhino-") && file.ends_with(".bundle.json")))
        || path != format!("{repo}/releases/download/rhino-updates/{file}")
    {
        return Err(invalid());
    }
    Url::parse(value).map_err(|_| invalid())
}

fn clean_https(url: &Url) -> bool {
    url.scheme() == "https"
        && url.port_or_known_default() == Some(443)
        && url.username().is_empty()
        && url.password().is_none()
        && url.fragment().is_none()
}
fn numeric_id(id: &str) -> bool {
    !id.is_empty() && id.bytes().all(|b| b.is_ascii_digit())
}
fn gitee_attachment(url: &Url, file: &str) -> bool {
    let route = url
        .path()
        .strip_prefix('/')
        .and_then(|p| p.strip_prefix(GITEE_REPO))
        .and_then(|p| p.strip_prefix("/attach_files/"));
    clean_https(url)
        && url.host_str() == Some("gitee.com")
        && url.query().is_none()
        && route
            .and_then(|p| p.split_once("/download/"))
            .is_some_and(|(id, name)| numeric_id(id) && name == file)
}

pub(super) fn allowed_redirect(start: &Url, file: &str, previous: &[Url], next: &Url) -> bool {
    if previous.first() != Some(start) || !clean_https(next) {
        return false;
    }
    match (start.host_str(), previous) {
        (Some("gitee.com"), [_]) => gitee_attachment(next, file),
        (Some("gitee.com"), [_, attachment]) if gitee_attachment(attachment, file) => {
            // The CDN object number is not the release attachment ID. Both routes bind
            // the original filename. The CDN signature query is opaque and terminal.
            next.host_str() == Some("foruda.gitee.com")
                && next
                    .path()
                    .strip_prefix("/attach_file/")
                    .and_then(|p| p.split_once('/'))
                    .is_some_and(|(id, name)| numeric_id(id) && name == file)
        }
        (Some("github.com"), [_]) => {
            matches!(
                next.host_str(),
                Some(
                    "release-assets.githubusercontent.com"
                        | "objects.githubusercontent.com"
                        | "github-releases.githubusercontent.com"
                )
            ) && next
                .path()
                .strip_prefix("/github-production-release-asset/")
                .and_then(|p| p.split_once('/'))
                .is_some_and(|(id, key)| {
                    numeric_id(id)
                        && !key.is_empty()
                        && key.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
                })
        }
        _ => false, // No redirects out of a CDN or between mirror chains.
    }
}
