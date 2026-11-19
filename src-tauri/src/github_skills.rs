//! Public GitHub skill packages. No shell, executable loader, or external credential access.
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant},
};

pub const MAX_FILE: u64 = 2 * 1024 * 1024;
pub const MAX_TOTAL: u64 = 24 * 1024 * 1024;
pub const MAX_FILES: usize = 512;
pub const MAX_CONTEXT: usize = 40_000;
/// Window labels and exact local origins; sandboxed/remote frame IPC is also denied by Tauri ACL.
pub fn desktop_surface_allowed(label: &str, url: &url::Url, debug: bool) -> bool {
    ["main", "canvas"].contains(&label)
        && url.username().is_empty()
        && url.password().is_none()
        && ((url.scheme() == "tauri"
            && url.host_str() == Some("localhost")
            && url.port().is_none())
            || (url.scheme() == "http"
                && url.host_str() == Some("tauri.localhost")
                && url.port().is_none())
            || (debug
                && url.scheme() == "http"
                && url.host_str() == Some("localhost")
                && url.port() == Some(1420)))
}

fn hash(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}
fn nonce() -> String {
    use rand::RngCore;
    let mut b = [0; 24];
    rand::thread_rng().fill_bytes(&mut b);
    hex::encode(b)
}
fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}
fn lock<T>(m: &Mutex<T>) -> Result<std::sync::MutexGuard<'_, T>, String> {
    m.lock().map_err(|_| "技能状态锁不可用".into())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub path: String,
    pub blob: String,
    pub size: u64,
    pub sha256: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Compatibility {
    pub level: String,
    pub notes: Vec<String>,
    pub dependencies: Vec<String>,
    #[serde(default)]
    pub script_required: bool,
    #[serde(default)]
    pub mcp_mentioned: bool,
    #[serde(default)]
    pub searchable_resources: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Package {
    pub id: String,
    pub repository: String,
    pub directory: String,
    pub original_ref: String,
    pub commit: String,
    pub name: String,
    pub description: String,
    pub source_url: String,
    pub files: Vec<FileEntry>,
    pub total_bytes: u64,
    pub license: String,
    pub compatibility: Compatibility,
    pub installed_at: i64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Installed {
    pub package: Package,
    pub enabled: bool,
    pub versions: Vec<String>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Inspection {
    pub preview_id: String,
    pub repository: String,
    pub original_ref: String,
    pub commit: String,
    pub candidates: Vec<Package>,
    pub expires_at: i64,
}
#[derive(Clone)]
struct Preview {
    view: Inspection,
    skill_texts: HashMap<String, String>,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Source {
    pub url: String,
    pub reference: Option<String>,
    pub directory: Option<String>,
}

/// Deliberately rejects names that are ambiguous or special on Windows even on Unix.
pub fn safe_relative(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 240
        || value.contains(['\\', ':', '\0', '%'])
        || value.starts_with('/')
    {
        return Err(format!("不安全的包内路径：{value}"));
    }
    for part in value.split('/') {
        let stem = part.split('.').next().unwrap_or("").to_ascii_uppercase();
        if part.is_empty()
            || part == "."
            || part == ".."
            || part.ends_with([' ', '.'])
            || part
                .chars()
                .any(|c| c.is_control() || "<>\"|?*".contains(c))
            || matches!(
                stem.as_str(),
                "CON"
                    | "PRN"
                    | "AUX"
                    | "NUL"
                    | "CONIN$"
                    | "CONOUT$"
                    | "COM¹"
                    | "COM²"
                    | "COM³"
                    | "LPT¹"
                    | "LPT²"
                    | "LPT³"
            )
            || ((stem.starts_with("COM") || stem.starts_with("LPT"))
                && stem.len() == 4
                && stem.as_bytes()[3].is_ascii_digit())
        {
            return Err(format!("不安全的包内路径：{value}"));
        }
    }
    Ok(())
}
fn no_links(path: &Path) -> Result<(), String> {
    for parent in path.ancestors() {
        if let Ok(meta) = fs::symlink_metadata(parent) {
            if meta.file_type().is_symlink() {
                return Err("技能目录中禁止符号链接".into());
            }
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                if meta.file_attributes() & 0x400 != 0 {
                    return Err("技能目录中禁止目录联接或重解析点".into());
                }
            }
        }
    }
    Ok(())
}
fn id_for(repo: &str, dir: &str) -> String {
    format!(
        "github-{}",
        &hash(format!("{}\n{}", repo.to_lowercase(), dir).as_bytes())[..32]
    )
}
fn valid_id(id: &str) -> Result<(), String> {
    if id.starts_with("github-") && id.len() == 39 && id[7..].chars().all(|c| c.is_ascii_hexdigit())
    {
        Ok(())
    } else {
        Err("无效技能 ID".into())
    }
}
fn valid_commit(id: &str) -> Result<(), String> {
    if id.len() == 40 && id.chars().all(|c| c.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err("需要固定的 40 位 commit".into())
    }
}

pub trait Remote: Send + Sync {
    fn progress(&self, _completed: u64, _total: u64) {}
    fn json(&self, path: &str, cancel: &AtomicBool) -> Result<Value, String>;
    fn file(
        &self,
        repo: &str,
        _commit: &str,
        directory: &str,
        entry: &FileEntry,
        cancel: &AtomicBool,
    ) -> Result<Vec<u8>, String> {
        let _ = directory;
        blob(self, repo, entry, cancel)
    }
}
pub struct Github {
    client: reqwest::blocking::Client,
    started: Instant,
    on_progress: Option<Box<dyn Fn(u64, u64) + Send + Sync>>,
}
impl Github {
    pub fn with_progress(mut self, callback: impl Fn(u64, u64) + Send + Sync + 'static) -> Self {
        self.on_progress = Some(Box::new(callback));
        self
    }
    pub fn new() -> Result<Self, String> {
        Ok(Self {
            client: reqwest::blocking::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .connect_timeout(Duration::from_secs(10))
                .timeout(Duration::from_secs(30))
                .user_agent("InspirationDrawer-Skills/1")
                .build()
                .map_err(|e| e.to_string())?,
            started: Instant::now(),
            on_progress: None,
        })
    }
}
fn allowed_api(url: &url::Url) -> bool {
    url.scheme() == "https"
        && url.host_str() == Some("api.github.com")
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
}
impl Remote for Github {
    fn progress(&self, completed: u64, total: u64) {
        if let Some(callback) = &self.on_progress {
            callback(completed, total);
        }
    }
    fn file(
        &self,
        repo: &str,
        commit: &str,
        directory: &str,
        entry: &FileEntry,
        cancel: &AtomicBool,
    ) -> Result<Vec<u8>, String> {
        check_cancel(cancel)?;
        valid_commit(commit)?;
        safe_relative(&entry.path)?;
        if self.started.elapsed() > Duration::from_secs(180) {
            return Err("技能下载总超时（180 秒）".into());
        }
        let path = if directory.is_empty() {
            entry.path.clone()
        } else {
            format!("{directory}/{}", entry.path)
        };
        let encoded_path = path.split('/').map(encoded).collect::<Vec<_>>().join("/");
        let url = url::Url::parse(&format!(
            "https://raw.githubusercontent.com/{repo}/{commit}/{encoded_path}"
        ))
        .map_err(|e| e.to_string())?;
        let allowed = |u: &url::Url| {
            u.scheme() == "https"
                && u.host_str() == Some("raw.githubusercontent.com")
                && u.port().is_none()
                && u.username().is_empty()
                && u.password().is_none()
        };
        if !allowed(&url) {
            return Err("禁止非官方内容下载地址".into());
        }
        let response = self
            .client
            .get(url)
            .send()
            .map_err(|e| format!("GitHub 文件下载失败：{e}"))?;
        if !allowed(response.url()) || response.status().as_u16() != 200 {
            return Err(format!(
                "GitHub 文件下载 HTTP {}（不跟随重定向）",
                response.status()
            ));
        }
        if response.content_length().is_some_and(|n| n > MAX_FILE) {
            return Err("下载文件超限".into());
        }
        let mut result = Vec::new();
        let mut reader = response.take(MAX_FILE + 1);
        let mut chunk = [0; 8192];
        loop {
            check_cancel(cancel)?;
            let n = reader.read(&mut chunk).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            result.extend_from_slice(&chunk[..n]);
            if result.len() as u64 > MAX_FILE {
                return Err("下载文件超限".into());
            }
        }
        if result.len() as u64 != entry.size {
            return Err("下载文件大小与固定快照不符（不自动下载 LFS 外链）".into());
        }
        Ok(result)
    }
    fn json(&self, path: &str, cancel: &AtomicBool) -> Result<Value, String> {
        check_cancel(cancel)?;
        if self.started.elapsed() > Duration::from_secs(180) {
            return Err("技能操作总超时（180 秒）".into());
        }
        let url =
            url::Url::parse(&format!("https://api.github.com{path}")).map_err(|e| e.to_string())?;
        if !path.starts_with("/repos/") || !allowed_api(&url) {
            return Err("禁止非 GitHub 官方 API 下载目标".into());
        }
        // No authorization/cookies, zero redirects, zero automatic retries. Never forwards wallet/model credentials.
        let response = self
            .client
            .get(url)
            .header("Accept", "application/vnd.github+json")
            .send()
            .map_err(|e| format!("GitHub 网络失败：{e}"))?;
        if !allowed_api(response.url()) {
            return Err("GitHub 最终下载域名不允许".into());
        }
        let status = response.status().as_u16();
        if status != 200 {
            let reset = response
                .headers()
                .get("x-ratelimit-reset")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("未知");
            return Err(match status {
                403 | 429 => format!(
                    "GitHub 限流或拒绝访问（HTTP {status}），重置时间戳 {reset}；请稍后再试"
                ),
                404 => "GitHub 仓库、ref 或文件不存在（仅支持公开仓库）".into(),
                300..=399 => "GitHub 重定向已阻止，请使用仓库当前的规范链接".into(),
                _ => format!("GitHub HTTP {status}"),
            });
        }
        if response
            .content_length()
            .is_some_and(|n| n > 20 * 1024 * 1024)
        {
            return Err("GitHub API 响应超限".into());
        }
        let mut bytes = Vec::new();
        let mut reader = response.take(20 * 1024 * 1024 + 1);
        let mut chunk = [0; 8192];
        loop {
            check_cancel(cancel)?;
            let n = reader.read(&mut chunk).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            bytes.extend_from_slice(&chunk[..n]);
            if bytes.len() > 20 * 1024 * 1024 {
                return Err("GitHub API 响应超限".into());
            }
        }
        serde_json::from_slice(&bytes).map_err(|e| format!("GitHub 响应无效：{e}"))
    }
}
fn check_cancel(cancel: &AtomicBool) -> Result<(), String> {
    if cancel.load(Ordering::SeqCst) {
        Err("已取消技能操作".into())
    } else {
        Ok(())
    }
}
fn encoded(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes())
        .collect::<String>()
        .replace('+', "%20")
}
fn parse_source(source: &Source) -> Result<(String, Vec<String>), String> {
    let u =
        url::Url::parse(source.url.trim()).map_err(|_| "请输入公开 GitHub 仓库或技能目录链接")?;
    if u.scheme() != "https"
        || u.host_str() != Some("github.com")
        || u.port().is_some()
        || !u.username().is_empty()
        || u.password().is_some()
        || u.query().is_some()
        || u.fragment().is_some()
    {
        return Err("仅支持 https://github.com 的公开仓库链接（无凭据、查询或片段）".into());
    }
    let mut parts: Vec<String> = u
        .path()
        .trim_matches('/')
        .split('/')
        .map(str::to_string)
        .collect();
    if parts.len() < 2 {
        return Err("GitHub 链接缺少仓库名".into());
    }
    parts[1] = parts[1].trim_end_matches(".git").to_string();
    for p in &parts[..2] {
        if p.is_empty()
            || !p
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
            || p == "."
            || p == ".."
        {
            return Err("无效 GitHub 仓库名".into());
        }
    }
    let repo = format!("{}/{}", parts[0], parts[1]);
    let tail = if parts.len() == 2 {
        vec![]
    } else if ["tree", "blob"].contains(&parts[2].as_str()) && parts.len() > 3 {
        parts[3..].to_vec()
    } else {
        return Err("请使用仓库、tree 或 SKILL.md 的 blob 链接".into());
    };
    // Percent-encoded paths/refs must be supplied explicitly, never guessed/decoded into filesystem paths.
    if tail.iter().any(|s| s.contains('%')) {
        return Err("编码链接请改用仓库根链接，并在 ref/目录字段填写未编码的原始值".into());
    }
    Ok((repo, tail))
}
fn blob<R: Remote + ?Sized>(
    remote: &R,
    repo: &str,
    file: &FileEntry,
    cancel: &AtomicBool,
) -> Result<Vec<u8>, String> {
    let value = remote.json(&format!("/repos/{repo}/git/blobs/{}", file.blob), cancel)?;
    if value["sha"].as_str() != Some(&file.blob) || value["encoding"] != "base64" {
        return Err("GitHub blob 标识或编码不匹配".into());
    }
    let encoded = value["content"].as_str().ok_or("GitHub 文件缺少内容")?;
    if encoded.len() > (MAX_FILE * 2) as usize {
        return Err("文件编码超限".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded.replace(['\n', '\r'], ""))
        .map_err(|_| "文件 Base64 校验失败")?;
    if bytes.len() as u64 != file.size || bytes.len() as u64 > MAX_FILE {
        return Err("文件大小与固定树不一致或超限".into());
    }
    Ok(bytes)
}
fn metadata(text: &str, fallback: &str) -> (String, String) {
    let mut name = fallback.to_string();
    let mut description = String::new();
    let normalized = text.trim_start_matches('\u{feff}').replace("\r\n", "\n");
    if let Some(rest) = normalized.strip_prefix("---\n") {
        if let Some((header, _)) = rest.split_once("\n---") {
            let mut block = false;
            for line in header.lines() {
                if block && line.starts_with([' ', '\t']) {
                    if !description.is_empty() {
                        description.push(' ');
                    }
                    description.push_str(line.trim());
                    continue;
                }
                block = false;
                if let Some(v) = line.strip_prefix("name:") {
                    name = v.trim().trim_matches(['\'', '"']).to_string();
                }
                if let Some(v) = line.strip_prefix("description:") {
                    let v = v.trim();
                    block = [">", "|", ">-", "|-"].contains(&v);
                    if !block {
                        description = v.trim_matches(['\'', '"']).to_string();
                    }
                }
            }
        }
    }
    (
        name.chars().take(120).collect(),
        description.chars().take(1000).collect(),
    )
}
fn searchable_resource(path: &str) -> bool {
    ["md", "txt", "csv", "json", "yaml", "yml"].contains(
        &path
            .rsplit('.')
            .next()
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str(),
    )
}
fn analyze(text: &str, files: &[FileEntry]) -> Compatibility {
    let lower = text.to_lowercase();
    let dependencies: Vec<String> = [
        "mcp", "python", "node", "bash", "terminal", "claude", "codex", "figma",
    ]
    .into_iter()
    .filter(|word| {
        lower
            .split(|c: char| !c.is_ascii_alphanumeric() && c != '-')
            .any(|token| token == *word)
    })
    .map(str::to_string)
    .collect();
    let scripts = files.iter().any(|f| {
        ["py", "sh", "js", "ts", "ps1", "bat", "cmd"]
            .contains(&f.path.rsplit('.').next().unwrap_or(""))
    });
    let script_required = scripts
        || dependencies
            .iter()
            .any(|d| ["python", "node", "bash", "terminal"].contains(&d.as_str()));
    let mcp_mentioned = dependencies.iter().any(|d| d == "mcp");
    let searchable_resources = files
        .iter()
        .filter(|f| searchable_resource(&f.path))
        .count();
    let level = if mcp_mentioned {
        "mcp_review"
    } else if script_required {
        "scripts_not_executed"
    } else if !dependencies.is_empty() {
        "methodology_only"
    } else {
        "chat_compatible"
    };
    let mut notes = vec![
        "兼容性为尽力分析，不是安全审计；是否存在可调用工具仍以本轮工具与权限为准。".into(),
        "原始脚本只保存不执行。提及 Claude/Codex 可能只是原使用环境，不等同于需要安装这些软件。"
            .into(),
    ];
    if script_required {
        notes.push("检测到脚本或终端步骤；不表示缺少 MCP。可使用 search_skill_resources/read_skill_resource 检索并阅读包内资料，但不等同于运行原脚本或其设计系统/持久化功能。".into());
    }
    if mcp_mentioned {
        notes.push("文本提及 MCP，需要进一步核实具体服务与工具；不能凭关键词判断它是必要依赖，也不会自动安装。".into());
    }
    Compatibility {
        level: level.into(),
        dependencies,
        notes,
        script_required,
        mcp_mentioned,
        searchable_resources,
    }
}

pub struct Store {
    root: PathBuf,
    previews: Mutex<HashMap<String, Preview>>,
    busy: AtomicBool,
}
struct Busy<'a>(&'a AtomicBool);
impl Drop for Busy<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}
impl Store {
    pub fn new(root: PathBuf) -> Self {
        Self {
            root,
            previews: Mutex::new(HashMap::new()),
            busy: AtomicBool::new(false),
        }
    }
    fn enter(&self) -> Result<Busy<'_>, String> {
        self.busy
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map_err(|_| "另一个技能操作正在进行，请等待或取消")?;
        let guard = Busy(&self.busy);
        no_links(&self.root)?;
        Ok(guard)
    }
    pub fn inspect(
        &self,
        remote: &dyn Remote,
        source: Source,
        cancel: &AtomicBool,
    ) -> Result<Inspection, String> {
        let _busy = self.enter()?;
        let (repo, tail) = parse_source(&source)?;
        let info = remote.json(&format!("/repos/{repo}"), cancel)?;
        if info["private"].as_bool() != Some(false) {
            return Err("只支持公开 GitHub 仓库".into());
        }
        let default = info["default_branch"]
            .as_str()
            .ok_or("GitHub 缺少默认分支")?;
        // Resolve ALL possible slash boundaries. Multiple valid interpretations require explicit fields.
        let mut resolutions = vec![];
        let explicit = source.reference.as_deref().filter(|s| !s.trim().is_empty());
        if let Some(reference) = explicit {
            if reference.len() > 240 || reference.chars().any(char::is_control) {
                return Err("ref 无效或过长".into());
            }
            let v = remote.json(
                &format!("/repos/{repo}/commits/{}", encoded(reference)),
                cancel,
            )?;
            let dir = if let Some(dir) = &source.directory {
                dir.clone()
            } else if tail.is_empty() {
                String::new()
            } else {
                let reference_parts: Vec<_> = reference.split('/').collect();
                if tail.len() < reference_parts.len()
                    || !tail.iter().zip(&reference_parts).all(|(a, b)| a == b)
                {
                    return Err("链接 ref 与显式 ref 不一致，请使用仓库根链接指定 ref/目录".into());
                }
                let mut directory = tail[reference_parts.len()..].join("/");
                if directory == "SKILL.md" {
                    directory.clear();
                } else if directory.ends_with("/SKILL.md") {
                    directory.truncate(directory.len() - 9);
                }
                directory
            };
            resolutions.push((reference.to_string(), dir, v));
        } else if tail.is_empty() {
            let v = remote.json(
                &format!("/repos/{repo}/commits/{}", encoded(default)),
                cancel,
            )?;
            resolutions.push((
                default.into(),
                source.directory.clone().unwrap_or_default(),
                v,
            ));
        } else {
            if tail.len() > 12 {
                return Err("链接过深，请使用显式 ref 和目录字段".into());
            }
            for n in 1..=tail.len() {
                let reference = tail[..n].join("/");
                match remote.json(
                    &format!("/repos/{repo}/commits/{}", encoded(&reference)),
                    cancel,
                ) {
                    Ok(v) => {
                        let mut dir = tail[n..].join("/");
                        if dir == "SKILL.md" {
                            dir.clear();
                        } else if dir.ends_with("/SKILL.md") {
                            dir.truncate(dir.len() - 9);
                        }
                        resolutions.push((reference, source.directory.clone().unwrap_or(dir), v));
                    }
                    Err(e) if e.contains("不存在") => {}
                    Err(e) => return Err(e),
                }
            }
        }
        if resolutions.len() != 1 {
            return Err("链接 ref/目录不存在或存在多种解释。请填写仓库根链接及明确的 ref、技能目录（分支可含斜杠）".into());
        }
        let (reference, directory, commit_value) = resolutions.remove(0);
        if !directory.is_empty() {
            safe_relative(&directory)?;
        }
        let commit = commit_value["sha"]
            .as_str()
            .ok_or("GitHub 缺少 commit")?
            .to_string();
        valid_commit(&commit)?;
        let tree = commit_value["commit"]["tree"]["sha"]
            .as_str()
            .ok_or("GitHub 缺少 tree")?;
        valid_commit(tree)?;
        let value = remote.json(
            &format!("/repos/{repo}/git/trees/{tree}?recursive=1"),
            cancel,
        )?;
        if value["truncated"].as_bool() != Some(false) {
            return Err("GitHub 文件树被截断，无法安全检查完整包；请使用较小仓库".into());
        }
        let entries = value["tree"].as_array().ok_or("GitHub 文件树无效")?;
        let dirs: Vec<String> = entries
            .iter()
            .filter_map(|v| v["path"].as_str())
            .filter(|p| *p == "SKILL.md" || p.ends_with("/SKILL.md"))
            .map(|p| {
                p.strip_suffix("SKILL.md")
                    .unwrap()
                    .trim_end_matches('/')
                    .to_string()
            })
            .filter(|p| directory.is_empty() || *p == directory)
            .collect();
        if dirs.is_empty() {
            return Err("所选目录没有 SKILL.md".into());
        }
        if dirs.len() > 40 {
            return Err("候选技能超过 40 个，请指定技能目录".into());
        }
        let mut candidates = vec![];
        let mut skill_texts = HashMap::new();
        for dir in dirs {
            let prefix = if dir.is_empty() {
                String::new()
            } else {
                format!("{dir}/")
            };
            let mut files = vec![];
            let mut seen = HashSet::new();
            let mut spelling = HashMap::new();
            let mut total = 0u64;
            for v in entries {
                let path = v["path"].as_str().ok_or("文件树路径无效")?;
                let Some(rel) = path.strip_prefix(&prefix) else {
                    continue;
                };
                if rel.is_empty() {
                    continue;
                }
                safe_relative(rel)?;
                let mut prefix = String::new();
                for component in rel.split('/') {
                    if !prefix.is_empty() {
                        prefix.push('/');
                    }
                    prefix.push_str(component);
                    if let Some(previous) = spelling.insert(prefix.to_lowercase(), prefix.clone()) {
                        if previous != prefix {
                            return Err(format!("包内目录大小写冲突：{rel}"));
                        }
                    }
                }
                if v["type"] == "tree" {
                    continue;
                }
                if v["type"] != "blob"
                    || !["100644", "100755"].contains(&v["mode"].as_str().unwrap_or(""))
                {
                    return Err(format!("包内符号链接、子模块或特殊文件不支持：{rel}"));
                }
                if !seen.insert(rel.to_lowercase()) {
                    return Err(format!("包内路径大小写冲突：{rel}"));
                }
                // Detect file-vs-directory collisions, not only identical names.
                let size = v["size"].as_u64().ok_or("文件大小缺失")?;
                total = total.checked_add(size).ok_or("文件总量溢出")?;
                if size > MAX_FILE || total > MAX_TOTAL || files.len() >= MAX_FILES {
                    return Err("技能包超限：单文件 2MiB / 总量 24MiB / 512 文件".into());
                }
                let sha = v["sha"].as_str().ok_or("blob 缺少校验标识")?.to_string();
                valid_commit(&sha)?;
                files.push(FileEntry {
                    path: rel.into(),
                    blob: sha,
                    size,
                    sha256: None,
                });
            }
            for file in &files {
                let mut parent = Path::new(&file.path).parent();
                while let Some(p) = parent {
                    let s = p.to_string_lossy().replace('\\', "/").to_lowercase();
                    if !s.is_empty() && seen.contains(&s) {
                        return Err("文件与目录路径冲突".into());
                    }
                    parent = p.parent();
                }
            }
            let skill = files
                .iter()
                .find(|f| f.path == "SKILL.md")
                .ok_or("缺少普通文件 SKILL.md")?;
            if skill.size > 160_000 {
                return Err("SKILL.md 超过预览上限（160KB）；请选择较小技能包".into());
            }
            let text = String::from_utf8(blob(remote, &repo, skill, cancel)?)
                .map_err(|_| "SKILL.md 必须为 UTF-8")?;
            let id = id_for(&repo, &dir);
            let (name, description) = metadata(
                &text,
                dir.rsplit('/')
                    .next()
                    .filter(|s| !s.is_empty())
                    .unwrap_or(&repo),
            );
            let license = info["license"]["spdx_id"]
                .as_str()
                .filter(|s| *s != "NOASSERTION")
                .unwrap_or("未知（仓库未声明可识别许可证；安装不代表获授使用许可）")
                .to_string();
            candidates.push(Package {
                id: id.clone(),
                repository: repo.clone(),
                directory: dir.clone(),
                original_ref: reference.clone(),
                commit: commit.clone(),
                name,
                description,
                source_url: format!(
                    "https://github.com/{repo}/tree/{commit}{}",
                    if dir.is_empty() {
                        String::new()
                    } else {
                        format!("/{dir}")
                    }
                ),
                total_bytes: total,
                license,
                compatibility: analyze(&text, &files),
                files,
                installed_at: 0,
            });
            skill_texts.insert(id, text);
        }
        check_cancel(cancel)?;
        let view = Inspection {
            preview_id: nonce(),
            repository: repo,
            original_ref: reference,
            commit,
            candidates,
            expires_at: now() + 15 * 60 * 1000,
        };
        let mut previews = lock(&self.previews)?;
        previews.retain(|_, p| p.view.expires_at > now());
        if previews.len() >= 20 {
            return Err("待确认检查过多，请稍后重试".into());
        }
        previews.insert(
            view.preview_id.clone(),
            Preview {
                view: view.clone(),
                skill_texts,
            },
        );
        Ok(view)
    }
    fn record_path(&self, id: &str) -> Result<PathBuf, String> {
        valid_id(id)?;
        Ok(self.root.join("records").join(format!("{id}.json")))
    }
    fn load_record(&self, id: &str) -> Result<Installed, String> {
        let path = self.record_path(id)?;
        no_links(&path)?;
        let bytes = fs::read(&path)
            .or_else(|_| fs::read(path.with_extension("backup")))
            .map_err(|_| "技能未安装")?;
        let mut record: Installed =
            serde_json::from_slice(&bytes).map_err(|_| "技能安装记录损坏")?;
        if record.package.id != id
            || id_for(&record.package.repository, &record.package.directory) != id
        {
            return Err("技能来源标识校验失败".into());
        }
        valid_commit(&record.package.commit)?;
        // Re-analyze legacy metadata without modifying original package files or upgrading its version.
        let dir = self.version_dir(id, &record.package.commit)?;
        if let Some(entry) = record.package.files.iter().find(|f| f.path == "SKILL.md") {
            let path = dir.join("files/SKILL.md");
            no_links(&path)?;
            if fs::metadata(&path).map_err(|e| e.to_string())?.len() > MAX_FILE {
                return Err("本地 SKILL.md 超限".into());
            }
            let content = fs::read(path).map_err(|e| e.to_string())?;
            if Some(hash(&content)) != entry.sha256 {
                return Err("本地 SKILL.md 校验失败".into());
            }
            let text = String::from_utf8(content).map_err(|_| "SKILL.md 必须是 UTF-8")?;
            record.package.compatibility = analyze(&text, &record.package.files);
        }
        Ok(record)
    }
    fn write_record(&self, record: &Installed) -> Result<(), String> {
        let path = self.record_path(&record.package.id)?;
        no_links(&path)?;
        fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
        let temp = path.with_extension("pending");
        let backup = path.with_extension("backup");
        fs::write(
            &temp,
            serde_json::to_vec_pretty(record).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        fs::OpenOptions::new()
            .write(true)
            .open(&temp)
            .and_then(|f| f.sync_all())
            .map_err(|e| e.to_string())?;
        if path.exists() {
            if backup.exists() {
                fs::remove_file(&backup).map_err(|e| e.to_string())?;
            }
            fs::rename(&path, &backup).map_err(|e| e.to_string())?;
        }
        if let Err(e) = fs::rename(&temp, &path) {
            if backup.exists() {
                let _ = fs::rename(&backup, &path);
            }
            return Err(e.to_string());
        }
        if backup.exists() {
            let _ = fs::remove_file(backup);
        }
        Ok(())
    }
    pub fn list(&self) -> Result<Vec<Installed>, String> {
        no_links(&self.root)?;
        let dir = self.root.join("records");
        if !dir.exists() {
            return Ok(vec![]);
        }
        no_links(&dir)?;
        let mut ids = HashSet::new();
        for e in fs::read_dir(dir).map_err(|e| e.to_string())? {
            let p = e.map_err(|e| e.to_string())?.path();
            if [Some("json"), Some("backup")].contains(&p.extension().and_then(|s| s.to_str())) {
                if let Some(id) = p.file_stem().and_then(|s| s.to_str()) {
                    ids.insert(id.to_string());
                }
            }
        }
        let mut result = vec![];
        for id in ids {
            result.push(self.load_record(&id)?);
        }
        result.sort_by(|a, b| a.package.name.cmp(&b.package.name));
        Ok(result)
    }
    fn version_dir(&self, id: &str, commit: &str) -> Result<PathBuf, String> {
        valid_id(id)?;
        valid_commit(commit)?;
        let p = self.root.join("packages").join(id).join(commit);
        no_links(&p)?;
        Ok(p)
    }
    fn resource_text(&self, id: &str, commit: &str, path: &str) -> Result<String, String> {
        no_links(&self.root)?;
        safe_relative(path)?;
        let record = self.load_record(id)?;
        if !record.enabled || !record.versions.iter().any(|s| s == commit) {
            return Err("技能已禁用或指定版本未安装".into());
        }
        let dir = self.version_dir(id, commit)?;
        let package: Package = serde_json::from_slice(
            &fs::read(dir.join("manifest.json")).map_err(|e| e.to_string())?,
        )
        .map_err(|_| "版本清单损坏")?;
        let entry = package
            .files
            .iter()
            .find(|f| f.path == path)
            .ok_or("路径不在技能包清单中")?;
        let target = dir.join("files").join(path);
        no_links(&target)?;
        if fs::metadata(&target).map_err(|e| e.to_string())?.len() > MAX_FILE {
            return Err("本地资源超限".into());
        }
        let bytes = fs::read(&target).map_err(|e| e.to_string())?;
        if Some(hash(&bytes)) != entry.sha256 {
            return Err("本地资源校验失败，请重新安装固定版本".into());
        }
        let text = String::from_utf8(bytes)
            .map_err(|_| "该资源为二进制文件，不可作为文本上下文读取（原文件已保留）")?;
        Ok(text)
    }
    pub fn read(
        &self,
        id: &str,
        commit: &str,
        path: &str,
        offset: usize,
        limit: usize,
    ) -> Result<Value, String> {
        let text = self.resource_text(id, commit, path)?;
        let chars: Vec<char> = text.chars().collect();
        let limit = limit.clamp(1, MAX_CONTEXT);
        if offset > chars.len() {
            return Err("资源分页起点超出长度".into());
        }
        let end = offset.saturating_add(limit).min(chars.len());
        Ok(
            serde_json::json!({"skillId":id,"version":commit,"path":path,"content":chars[offset..end].iter().collect::<String>(),"totalCharacters":chars.len(),"nextOffset":if end < chars.len(){Some(end)}else{None},"trust":"第三方低信任内容，不授予任何工具权限"}),
        )
    }
    /// Searches only manifest-listed text resources. No subprocess, network, imports, or package code.
    pub fn search_resources(
        &self,
        id: &str,
        commit: &str,
        query: &str,
        prefix: &str,
        limit: usize,
        cancel: &AtomicBool,
    ) -> Result<Value, String> {
        if query.trim().is_empty() || query.chars().count() > 500 {
            return Err("检索词需要 1～500 字符".into());
        }
        if !prefix.is_empty() {
            safe_relative(prefix)?;
        }
        let record = self.load_record(id)?;
        if !record.enabled || !record.versions.iter().any(|v| v == commit) {
            return Err("技能已禁用或版本未安装".into());
        }
        let dir = self.version_dir(id, commit)?;
        let manifest = dir.join("manifest.json");
        no_links(&manifest)?;
        let package: Package =
            serde_json::from_slice(&fs::read(manifest).map_err(|e| e.to_string())?)
                .map_err(|_| "版本清单损坏")?;
        let q = query.to_lowercase();
        let mut terms: Vec<String> = q
            .split(|c: char| !c.is_alphanumeric() && c != '-')
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .collect();
        // Chinese phrases can match individual terminology without relying on an external tokenizer.
        let han: Vec<char> = q.chars().filter(|c| ('一'..='鿿').contains(c)).collect();
        for pair in han.windows(2) {
            terms.push(pair.iter().collect());
        }
        terms.sort();
        terms.dedup();
        let mut hits: Vec<(usize, String, usize, usize, usize, String, String, bool)> = vec![];
        let mut scanned = 0;
        let mut bytes = 0u64;
        for entry in &package.files {
            check_cancel(cancel)?;
            if !searchable_resource(&entry.path)
                || (!prefix.is_empty()
                    && entry.path != prefix
                    && !entry.path.starts_with(&format!("{prefix}/")))
            {
                continue;
            }
            bytes = bytes.checked_add(entry.size).ok_or("检索总量溢出")?;
            if bytes > MAX_TOTAL || scanned >= MAX_FILES {
                return Err("技能资料检索超限，未返回不完整的检索结果".into());
            }
            let text = self.resource_text(id, commit, &entry.path)?;
            scanned += 1;
            let chars: Vec<char> = text.chars().collect();
            // CSV logical records include quoted newlines. Offsets always refer to original Unicode characters.
            let mut records = vec![];
            let mut start = 0;
            let mut quote = false;
            let mut i = 0;
            while i < chars.len() {
                if entry.path.ends_with(".csv") && chars[i] == '"' {
                    if quote && i + 1 < chars.len() && chars[i + 1] == '"' {
                        i += 2;
                        continue;
                    }
                    quote = !quote;
                }
                if chars[i] == '\n' && !quote {
                    records.push((start, i));
                    start = i + 1;
                }
                i += 1;
            }
            if start < chars.len() {
                records.push((start, chars.len()));
            }
            let header = if entry.path.ends_with(".csv") {
                records
                    .first()
                    .map(|(a, b)| chars[*a..*b].iter().take(2000).collect::<String>())
                    .unwrap_or_default()
            } else {
                String::new()
            };
            for (start, end) in records {
                let content: String = chars[start..end].iter().collect();
                let lower = content.to_lowercase();
                let matched = terms
                    .iter()
                    .filter(|term| lower.contains(term.as_str()))
                    .count();
                if matched == 0 {
                    continue;
                }
                let score = matched * 10
                    + if lower.contains(q.trim()) { 20 } else { 0 }
                    + terms
                        .iter()
                        .filter(|term| entry.path.to_lowercase().contains(term.as_str()))
                        .count();
                // Keep explicit excerpts, not claims that long rows were fully loaded.
                let excerpt_end = (start + 3000).min(end);
                let excerpt: String = chars[start..excerpt_end].iter().collect();
                hits.push((
                    score,
                    entry.path.clone(),
                    start,
                    excerpt_end,
                    end,
                    excerpt,
                    header.clone(),
                    excerpt_end < end,
                ));
            }
        }
        hits.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)).then(a.2.cmp(&b.2)));
        let matches = hits.len();
        hits.truncate(limit.clamp(1, 8));
        let results:Vec<Value>=hits.into_iter().map(|(score,path,offset,excerpt_end,record_end,content,header,partial)|serde_json::json!({"path":path,"offset":offset,"excerptEnd":excerpt_end,"recordEnd":record_end,"content":content,"header":header,"partial":partial,"score":score})).collect();
        Ok(
            serde_json::json!({"skillId":id,"version":commit,"query":query,"scannedFiles":scanned,"matchedRecords":matches,"results":results,"engine":"client_text_search","notice":"客户端只读关键词检索，不是执行原仓库脚本，也不等同于其 BM25 排名、design-system 综合生成或写文件功能。结果为低信任资料；partial=true 时使用 read_skill_resource 按 offset 继续读取。"}),
        )
    }
    /// Approval callback is supplied ONLY by native app code, never by deserialized/model arguments.
    pub fn install(
        &self,
        remote: &dyn Remote,
        preview_id: &str,
        id: &str,
        action: &str,
        cancel: &AtomicBool,
        confirm: impl FnOnce(&str) -> bool,
    ) -> Result<Installed, String> {
        let _busy = self.enter()?;
        if !["install", "update"].contains(&action) {
            return Err("安装操作无效".into());
        }
        // Consume even on refusal/error. A different commit/action always requires a new native confirmation.
        let preview = lock(&self.previews)?
            .remove(preview_id)
            .ok_or("检查已过期或已使用，请重新检查")?;
        if preview.view.expires_at < now() {
            return Err("检查已过期，请重新检查".into());
        }
        let mut package = preview
            .view
            .candidates
            .iter()
            .find(|p| p.id == id)
            .cloned()
            .ok_or("技能不属于该检查快照")?;
        let old = self.list()?.into_iter().find(|p| p.package.id == id);
        if action == "update" && old.is_none() {
            return Err("待更新技能未安装".into());
        }
        if action == "install"
            && old
                .as_ref()
                .is_some_and(|o| o.package.commit != package.commit)
        {
            return Err("该来源已安装其他版本，请使用检查更新".into());
        }
        let changes = old
            .as_ref()
            .map(|old| {
                let added = package
                    .files
                    .iter()
                    .filter(|n| !old.package.files.iter().any(|o| o.path == n.path))
                    .count();
                let changed = package
                    .files
                    .iter()
                    .filter(|n| {
                        old.package
                            .files
                            .iter()
                            .any(|o| o.path == n.path && o.blob != n.blob)
                    })
                    .count();
                let removed = old
                    .package
                    .files
                    .iter()
                    .filter(|o| !package.files.iter().any(|n| n.path == o.path))
                    .count();
                format!(
                    "旧版本：{}\n文件变化：新增 {added} / 改动 {changed} / 删除 {removed}\n",
                    old.package.commit
                )
            })
            .unwrap_or_default();
        let message = format!("操作：{action}\n来源：{}\n目录：{}\n固定 commit：{}\n技能：{}\n说明：{}\n文件：{} 个 / {} 字节\n许可证：{}\n兼容性：{} / 依赖：{}\n{}\n第三方低信任内容，兼容性不是安全审计。脚本仅保存不执行，不安装任何依赖。确认仅授权此技能、此版本、此操作；不会默认在会话启用。", package.repository, if package.directory.is_empty(){"（根目录）"}else{&package.directory},package.commit,package.name,package.description,package.files.len(),package.total_bytes,package.license,package.compatibility.level,package.compatibility.dependencies.join(", "),changes);
        check_cancel(cancel)?;
        if !confirm(&message) {
            return Err("用户拒绝了技能操作；本任务不得再次请求相同操作".into());
        }
        check_cancel(cancel)?;
        if let Some(old) = &old {
            if old.package.commit == package.commit {
                return Ok(old.clone());
            }
        }
        let staging = self.root.join("staging").join(nonce());
        no_links(&staging)?;
        fs::create_dir_all(staging.join("files")).map_err(|e| e.to_string())?;
        let result = (|| {
            let mut completed_bytes = 0;
            remote.progress(0, package.total_bytes);
            for file in &mut package.files {
                check_cancel(cancel)?;
                let bytes = remote.file(
                    &package.repository,
                    &package.commit,
                    &package.directory,
                    file,
                    cancel,
                )?;
                if file.path == "SKILL.md"
                    && bytes
                        != preview
                            .skill_texts
                            .get(id)
                            .ok_or("预览内容丢失")?
                            .as_bytes()
                {
                    return Err("下载的 SKILL.md 与用户检查快照不一致".into());
                }
                let target = staging.join("files").join(&file.path);
                no_links(&target)?;
                fs::create_dir_all(target.parent().unwrap()).map_err(|e| e.to_string())?;
                fs::write(&target, &bytes).map_err(|e| e.to_string())?;
                file.sha256 = Some(hash(&bytes));
                completed_bytes += file.size;
                remote.progress(completed_bytes, package.total_bytes);
            }
            package.installed_at = now();
            fs::write(
                staging.join("manifest.json"),
                serde_json::to_vec_pretty(&package).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
            check_cancel(cancel)?;
            let dest = self.version_dir(id, &package.commit)?;
            fs::create_dir_all(dest.parent().unwrap()).map_err(|e| e.to_string())?;
            if dest.exists() {
                // Immutable versions can be pinned by running turns. Never replace their directory.
                let existing: Package = serde_json::from_slice(
                    &fs::read(dest.join("manifest.json")).map_err(|e| e.to_string())?,
                )
                .map_err(|_| "已有版本清单损坏")?;
                if existing.files.len() != package.files.len() {
                    return Err("已有版本文件清单不一致".into());
                }
                for file in &package.files {
                    let target = dest.join("files").join(&file.path);
                    no_links(&target)?;
                    if !existing
                        .files
                        .iter()
                        .any(|f| f.path == file.path && f.sha256 == file.sha256)
                        || Some(hash(&fs::read(target).map_err(|e| e.to_string())?)) != file.sha256
                    {
                        return Err("已有版本内容损坏，未覆盖正在使用的版本".into());
                    }
                }
            } else {
                fs::rename(&staging, &dest).map_err(|e| e.to_string())?;
            }
            let mut versions = old.as_ref().map(|o| o.versions.clone()).unwrap_or_default();
            if !versions.contains(&package.commit) {
                versions.push(package.commit.clone());
            }
            let record = Installed {
                package,
                enabled: old.as_ref().map(|o| o.enabled).unwrap_or(true),
                versions,
            };
            self.write_record(&record)?;
            Ok(record)
        })();
        if staging.exists() {
            let _ = fs::remove_dir_all(staging);
        }
        result
    }
    pub fn manage(
        &self,
        id: &str,
        action: &str,
        version: Option<&str>,
        cancel: &AtomicBool,
        confirm: impl FnOnce(&str) -> bool,
    ) -> Result<Value, String> {
        let _busy = self.enter()?;
        let mut record = self.load_record(id)?;
        if !["enable", "disable", "rollback", "uninstall"].contains(&action) {
            return Err("未知技能管理操作".into());
        }
        let target = if action == "rollback" {
            let v = version.ok_or("请选择回退版本")?;
            if !record.versions.iter().any(|s| s == v) {
                return Err("回退版本未安装".into());
            }
            Some(v)
        } else {
            None
        };
        check_cancel(cancel)?;
        if !confirm(&format!("确认 {action} 技能“{}”？\n来源：{} / {}\n当前固定版本：{}\n目标版本：{}\n此操作仅影响该技能，不删除聊天、画布或其他技能。",record.package.name,record.package.repository,record.package.directory,record.package.commit,target.unwrap_or(&record.package.commit))) { return Err("用户拒绝了技能操作".into()); }
        check_cancel(cancel)?;
        match action {
            "enable" => record.enabled = true,
            "disable" => record.enabled = false,
            "rollback" => {
                let dir = self.version_dir(id, target.unwrap())?;
                record.package = serde_json::from_slice(
                    &fs::read(dir.join("manifest.json")).map_err(|e| e.to_string())?,
                )
                .map_err(|_| "回退版本清单损坏")?;
            }
            "uninstall" => {
                let path = self.record_path(id)?;
                let backup = path.with_extension("backup");
                if backup.exists() {
                    fs::remove_file(backup).map_err(|e| e.to_string())?;
                }
                fs::remove_file(path).map_err(|e| e.to_string())?;
                let packages = self.root.join("packages").join(id);
                no_links(&packages)?;
                if packages.exists() {
                    fs::remove_dir_all(packages).map_err(|e| e.to_string())?;
                }
                return Ok(serde_json::json!({"uninstalled":id}));
            }
            _ => unreachable!(),
        }
        self.write_record(&record)?;
        serde_json::to_value(record).map_err(|e| e.to_string())
    }
}

pub struct Service {
    pub store: Store,
    pub requests: Mutex<HashMap<String, Arc<AtomicBool>>>,
}
impl Service {
    pub fn new(root: PathBuf) -> Self {
        Self {
            store: Store::new(root),
            requests: Mutex::new(HashMap::new()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    struct Fixture {
        values: Mutex<HashMap<String, Value>>,
        calls: Mutex<Vec<String>>,
    }
    const V1: &str = "1111111111111111111111111111111111111111";
    const V2: &str = "2222222222222222222222222222222222222222";
    const TREE: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    fn cancel() -> AtomicBool {
        AtomicBool::new(false)
    }
    impl Remote for Fixture {
        fn json(&self, path: &str, flag: &AtomicBool) -> Result<Value, String> {
            check_cancel(flag)?;
            self.calls.lock().unwrap().push(path.into());
            self.values
                .lock()
                .unwrap()
                .get(path)
                .cloned()
                .ok_or_else(|| "GitHub 仓库、ref 或文件不存在".into())
        }
    }
    impl Fixture {
        fn new(repo: &str, reference: &str, commit: &str, files: Vec<(&str, &str)>) -> Self {
            let mut values = HashMap::new();
            values.insert(
                format!("/repos/{repo}"),
                json!({"private":false,"default_branch":reference,"license":{"spdx_id":"MIT"}}),
            );
            let snapshot = json!({"sha":commit,"commit":{"tree":{"sha":TREE}}});
            values.insert(
                format!("/repos/{repo}/commits/{}", encoded(reference)),
                snapshot.clone(),
            );
            values.insert(format!("/repos/{repo}/commits/{commit}"), snapshot);
            let mut entries = vec![];
            for (i, (path, text)) in files.into_iter().enumerate() {
                let sha = format!("{:040x}", i + 100);
                entries.push(
                    json!({"path":path,"type":"blob","mode":"100644","size":text.len(),"sha":sha}),
                );
                values.insert(format!("/repos/{repo}/git/blobs/{sha}"), json!({"sha":sha,"encoding":"base64","content":base64::engine::general_purpose::STANDARD.encode(text)}));
            }
            values.insert(
                format!("/repos/{repo}/git/trees/{TREE}?recursive=1"),
                json!({"truncated":false,"tree":entries}),
            );
            Self {
                values: Mutex::new(values),
                calls: Mutex::new(vec![]),
            }
        }
        fn mutate_tree(&self, f: impl FnOnce(&mut Value)) {
            f(self
                .values
                .lock()
                .unwrap()
                .get_mut(&format!("/repos/acme/skills/git/trees/{TREE}?recursive=1"))
                .unwrap());
        }
    }
    struct Temp(PathBuf);
    impl Temp {
        fn new() -> Self {
            let dir = std::env::temp_dir().join(format!("drawer-skills-test-{}", nonce()));
            Self(dir)
        }
    }
    impl Drop for Temp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    fn source() -> Source {
        Source {
            url: "https://github.com/acme/skills".into(),
            reference: None,
            directory: None,
        }
    }
    fn fixture() -> Fixture {
        Fixture::new("acme/skills","trunk",V1,vec![("SKILL.md","---\nname: Design\ndescription: >\n  useful method\n  second line\n---\nDo good work.\n"),("references/nested/a.md","reference text"),("scripts/probe.sh","touch /never-execute-this-test")])
    }
    fn inspect(store: &Store, remote: &Fixture) -> Inspection {
        store.inspect(remote, source(), &cancel()).unwrap()
    }
    fn install(store: &Store, remote: &Fixture) -> Installed {
        let view = inspect(store, remote);
        store
            .install(
                remote,
                &view.preview_id,
                &view.candidates[0].id,
                "install",
                &cancel(),
                |_| true,
            )
            .unwrap()
    }
    #[test]
    fn parses_root_metadata_and_keeps_nested_resources_and_scripts_without_execution() {
        let temp = Temp::new();
        let store = Store::new(temp.0.clone());
        let remote = fixture();
        let value = install(&store, &remote);
        assert_eq!(value.package.name, "Design");
        assert_eq!(value.package.description, "useful method second line");
        assert_eq!(value.package.license, "MIT");
        assert_eq!(value.package.original_ref, "trunk");
        assert_eq!(value.package.commit, V1);
        assert_eq!(value.package.files.len(), 3);
        let resource = store
            .read(&value.package.id, V1, "scripts/probe.sh", 0, 40_000)
            .unwrap();
        assert_eq!(resource["content"], "touch /never-execute-this-test");
        assert!(value.package.files.iter().all(|f| f.sha256.is_some()));
        assert_eq!(
            store
                .read(&value.package.id, V1, "references/nested/a.md", 0, 40_000)
                .unwrap()["content"],
            "reference text"
        );
    }
    #[test]
    fn supports_subdirectories_multiple_skills_slash_branch_and_fixed_commit() {
        let remote = Fixture::new(
            "acme/skills",
            "feature/design",
            V1,
            vec![("skills/a/SKILL.md", "# A"), ("skills/b/SKILL.md", "# B")],
        );
        let temp = Temp::new();
        let store = Store::new(temp.0.clone());
        let view = inspect(&store, &remote);
        assert_eq!(view.candidates.len(), 2);
        let mut s = source();
        s.url = "https://github.com/acme/skills/tree/feature/design/skills/a".into();
        let sub = store.inspect(&remote, s, &cancel()).unwrap();
        assert_eq!(sub.original_ref, "feature/design");
        assert_eq!(sub.candidates.len(), 1);
        assert_eq!(sub.candidates[0].directory, "skills/a");
        let mut fixed = source();
        fixed.reference = Some(V1.into());
        fixed.directory = Some("skills/b".into());
        assert_eq!(store.inspect(&remote, fixed, &cancel()).unwrap().commit, V1);
    }
    #[test]
    fn ambiguous_slash_branch_requires_explicit_fields() {
        let remote = Fixture::new(
            "acme/skills",
            "feature/design",
            V1,
            vec![("SKILL.md", "# A")],
        );
        remote.values.lock().unwrap().insert(
            "/repos/acme/skills/commits/feature".into(),
            json!({"sha":V2,"commit":{"tree":{"sha":TREE}}}),
        );
        let temp = Temp::new();
        let store = Store::new(temp.0.clone());
        let mut s = source();
        s.url = "https://github.com/acme/skills/tree/feature/design".into();
        assert!(store
            .inspect(&remote, s, &cancel())
            .unwrap_err()
            .contains("多种解释"));
    }
    #[test]
    fn confirmation_is_single_use_refusal_writes_nothing() {
        let temp = Temp::new();
        let store = Store::new(temp.0.clone());
        let remote = fixture();
        let view = inspect(&store, &remote);
        let id = &view.candidates[0].id;
        let error = store
            .install(
                &remote,
                &view.preview_id,
                id,
                "install",
                &cancel(),
                |message| {
                    assert!(message.contains(V1));
                    assert!(message.contains("脚本"));
                    false
                },
            )
            .unwrap_err();
        assert!(error.contains("拒绝"));
        assert!(store.list().unwrap().is_empty());
        assert!(!temp.0.exists());
        assert!(store
            .install(
                &remote,
                &view.preview_id,
                id,
                "install",
                &cancel(),
                |_| panic!("cannot re-prompt")
            )
            .is_err());
    }
    #[test]
    fn idempotent_and_same_name_different_source_never_overwrites() {
        let temp = Temp::new();
        let store = Store::new(temp.0.clone());
        let remote = fixture();
        let first = install(&store, &remote);
        let again = install(&store, &remote);
        assert_eq!(first.package.installed_at, again.package.installed_at);
        assert_eq!(store.list().unwrap().len(), 1);
        let other = Fixture::new(
            "other/skills",
            "trunk",
            V1,
            vec![("SKILL.md", "---\nname: Design\n---\nhello")],
        );
        let mut s = source();
        s.url = "https://github.com/other/skills".into();
        let view = store.inspect(&other, s, &cancel()).unwrap();
        let second = store
            .install(
                &other,
                &view.preview_id,
                &view.candidates[0].id,
                "install",
                &cancel(),
                |_| true,
            )
            .unwrap();
        assert_ne!(first.package.id, second.package.id);
        assert_eq!(store.list().unwrap().len(), 2);
    }
    #[test]
    fn snapshot_does_not_follow_branch_movement_after_preview() {
        let temp = Temp::new();
        let store = Store::new(temp.0.clone());
        let remote = fixture();
        let view = inspect(&store, &remote);
        remote.values.lock().unwrap().insert(
            "/repos/acme/skills/commits/trunk".into(),
            json!({"sha":V2,"commit":{"tree":{"sha":TREE}}}),
        );
        let result = store
            .install(
                &remote,
                &view.preview_id,
                &view.candidates[0].id,
                "install",
                &cancel(),
                |_| true,
            )
            .unwrap();
        assert_eq!(result.package.commit, V1);
    }
    #[test]
    fn changed_preview_content_is_rejected_transactionally() {
        let temp = Temp::new();
        let store = Store::new(temp.0.clone());
        let remote = fixture();
        let view = inspect(&store, &remote);
        let blob = view.candidates[0].files[0].blob.clone();
        let key = format!("/repos/acme/skills/git/blobs/{blob}");
        remote.values.lock().unwrap().get_mut(&key).unwrap()["content"] =
            json!(base64::engine::general_purpose::STANDARD
                .encode("X".repeat(view.candidates[0].files[0].size as usize)));
        assert!(store
            .install(
                &remote,
                &view.preview_id,
                &view.candidates[0].id,
                "install",
                &cancel(),
                |_| true
            )
            .unwrap_err()
            .contains("快照不一致"));
        assert!(store.list().unwrap().is_empty());
        assert_eq!(fs::read_dir(temp.0.join("staging")).unwrap().count(), 0);
    }
    #[test]
    fn failed_update_preserves_old_then_update_rollback_and_uninstall() {
        let temp = Temp::new();
        let store = Store::new(temp.0.clone());
        let old = install(&store, &fixture());
        let remote = Fixture::new(
            "acme/skills",
            "trunk",
            V2,
            vec![("SKILL.md", "# Version two"), ("references/new.md", "new")],
        );
        let view = inspect(&store, &remote);
        let broken_key = format!(
            "/repos/acme/skills/git/blobs/{}",
            view.candidates[0].files[1].blob
        );
        let saved = remote.values.lock().unwrap().remove(&broken_key).unwrap();
        assert!(store
            .install(
                &remote,
                &view.preview_id,
                &old.package.id,
                "update",
                &cancel(),
                |m| {
                    assert!(m.contains("新增"));
                    true
                }
            )
            .is_err());
        assert_eq!(store.list().unwrap()[0].package.commit, V1);
        remote.values.lock().unwrap().insert(broken_key, saved);
        let view = inspect(&store, &remote);
        let new = store
            .install(
                &remote,
                &view.preview_id,
                &old.package.id,
                "update",
                &cancel(),
                |_| true,
            )
            .unwrap();
        assert_eq!(new.versions.len(), 2);
        assert_eq!(new.package.commit, V2);
        assert!(store
            .read(&old.package.id, V1, "SKILL.md", 0, 40_000)
            .is_ok()); // pinned old version stays readable
        store
            .manage(&old.package.id, "rollback", Some(V1), &cancel(), |_| true)
            .unwrap();
        assert_eq!(store.list().unwrap()[0].package.commit, V1);
        store
            .manage(&old.package.id, "disable", None, &cancel(), |_| true)
            .unwrap();
        assert!(store.read(&old.package.id, V1, "SKILL.md", 0, 100).is_err());
        store
            .manage(&old.package.id, "enable", None, &cancel(), |_| true)
            .unwrap();
        store
            .manage(&old.package.id, "uninstall", None, &cancel(), |_| true)
            .unwrap();
        assert!(store.list().unwrap().is_empty());
    }
    #[test]
    fn cancellation_after_confirmation_leaves_no_usable_install() {
        let temp = Temp::new();
        let store = Store::new(temp.0.clone());
        let remote = fixture();
        let view = inspect(&store, &remote);
        let flag = cancel();
        assert!(store
            .install(
                &remote,
                &view.preview_id,
                &view.candidates[0].id,
                "install",
                &flag,
                |_| {
                    flag.store(true, Ordering::SeqCst);
                    true
                }
            )
            .unwrap_err()
            .contains("取消"));
        assert!(store.list().unwrap().is_empty());
        assert!(!temp.0.exists());
    }
    #[test]
    fn rejects_dangerous_urls_and_windows_paths() {
        for url in [
            "http://github.com/acme/skills",
            "https://localhost/a/b",
            "file:///a/b",
            "https://github.com.evil.test/a/b",
            "https://u:pw@github.com/a/b",
            "https://github.com:443/a/b?token=x",
            "https://github.com/a/b/issues",
        ] {
            let mut s = source();
            s.url = url.into();
            assert!(parse_source(&s).is_err(), "{url}");
        }
        for path in [
            "../secret",
            "/etc/passwd",
            "C:/file",
            "a\\b",
            "CON.txt",
            "x/LPT1.txt",
            "a/../b",
            "a%2fb",
            "x.",
            "x/ y/..",
            "COM¹.txt",
        ] {
            assert!(safe_relative(path).is_err(), "{path}");
        }
    }
    #[test]
    fn rejects_symlinks_submodules_case_conflicts_and_truncated_trees() {
        for mode in ["120000", "160000"] {
            let temp = Temp::new();
            let store = Store::new(temp.0.clone());
            let remote = fixture();
            remote.mutate_tree(|t| t["tree"][1]["mode"] = json!(mode));
            assert!(store.inspect(&remote, source(), &cancel()).is_err());
        }
        let temp = Temp::new();
        let store = Store::new(temp.0.clone());
        let remote = fixture();
        remote.mutate_tree(|t| t["truncated"] = json!(true));
        assert!(store
            .inspect(&remote, source(), &cancel())
            .unwrap_err()
            .contains("截断"));
        let remote = Fixture::new(
            "acme/skills",
            "trunk",
            V1,
            vec![("SKILL.md", "# A"), ("Refs/a.md", "a"), ("refs/b.md", "b")],
        );
        assert!(store
            .inspect(&remote, source(), &cancel())
            .unwrap_err()
            .contains("大小写"));
    }
    #[test]
    fn rejects_oversize_file_count_path_traversal_and_rate_limit() {
        let temp = Temp::new();
        let store = Store::new(temp.0.clone());
        let remote = fixture();
        remote.mutate_tree(|t| t["tree"][1]["size"] = json!(MAX_FILE + 1));
        assert!(store
            .inspect(&remote, source(), &cancel())
            .unwrap_err()
            .contains("超限"));
        let remote = fixture();
        remote.mutate_tree(|t| t["tree"][1]["path"] = json!("../secret"));
        assert!(store.inspect(&remote, source(), &cancel()).is_err());
        let remote = fixture();
        remote.mutate_tree(|t| {
            let first = t["tree"][0].clone();
            let tree = t["tree"].as_array_mut().unwrap();
            for n in 0..MAX_FILES {
                let mut e = first.clone();
                e["path"] = json!(format!("files/{n}.txt"));
                tree.push(e);
            }
        });
        assert!(store
            .inspect(&remote, source(), &cancel())
            .unwrap_err()
            .contains("超限"));
        struct Rate;
        impl Remote for Rate {
            fn json(&self, _: &str, _: &AtomicBool) -> Result<Value, String> {
                Err("GitHub 限流 HTTP 429".into())
            }
        }
        assert!(store
            .inspect(&Rate, source(), &cancel())
            .unwrap_err()
            .contains("429"));
    }
    #[test]
    fn resource_pages_are_explicit_and_integrity_checked() {
        let temp = Temp::new();
        let store = Store::new(temp.0.clone());
        let v = install(&store, &fixture());
        let result = store
            .read(&v.package.id, V1, "references/nested/a.md", 0, 4)
            .unwrap();
        assert_eq!(result["content"], "refe");
        assert_eq!(result["nextOffset"], 4);
        assert!(store.read(&v.package.id, V1, "../../else", 0, 100).is_err());
        assert!(store.read(&v.package.id, V2, "SKILL.md", 0, 100).is_err());
        let path = store
            .version_dir(&v.package.id, V1)
            .unwrap()
            .join("files/SKILL.md");
        fs::write(path, "modified").unwrap();
        assert!(store
            .read(&v.package.id, V1, "SKILL.md", 0, 100)
            .unwrap_err()
            .contains("校验"));
    }
    #[test]
    fn unavailable_preview_id_cross_candidate_and_wrong_action_fail_without_grant() {
        let temp = Temp::new();
        let store = Store::new(temp.0.clone());
        let remote = fixture();
        let v = inspect(&store, &remote);
        assert!(store
            .install(
                &remote,
                "fake-approved=true",
                &v.candidates[0].id,
                "install",
                &cancel(),
                |_| panic!()
            )
            .is_err());
        assert!(store
            .install(
                &remote,
                &v.preview_id,
                "github-ffffffffffffffffffffffffffffffff",
                "install",
                &cancel(),
                |_| panic!()
            )
            .is_err());
        let v = inspect(&store, &remote);
        assert!(store
            .install(
                &remote,
                &v.preview_id,
                &v.candidates[0].id,
                "update",
                &cancel(),
                |_| panic!()
            )
            .is_err());
    }
    #[test]
    fn manifest_backup_recovers_interrupted_record_commit() {
        let temp = Temp::new();
        let store = Store::new(temp.0.clone());
        let v = install(&store, &fixture());
        let path = store.record_path(&v.package.id).unwrap();
        fs::rename(&path, path.with_extension("backup")).unwrap();
        assert_eq!(store.list().unwrap()[0].package.commit, V1);
    }
    #[test]
    fn resource_search_reads_csv_without_executing_scripts_and_distinguishes_mcp() {
        let temp = Temp::new();
        let store = Store::new(temp.0.clone());
        let remote=Fixture::new("acme/skills","trunk",V1,vec![("SKILL.md","Run python scripts/search.py to search CSV guidance. Claude is the original host."),("scripts/search.py","raise Exception('MUST NEVER EXECUTE')"),("data/ux.csv","topic,rule\nkeyboard,visible focus\nanimation,reduce motion\nchart,readable labels\n"),("references/readme.md","Read real records, do not invent matches.")]);
        let installed = install(&store, &remote);
        let compat = &store.list().unwrap()[0].package.compatibility;
        assert_eq!(compat.level, "scripts_not_executed");
        assert!(!compat.mcp_mentioned);
        assert!(compat.script_required);
        let result = store
            .search_resources(
                &installed.package.id,
                V1,
                "reduce motion",
                "data",
                5,
                &cancel(),
            )
            .unwrap();
        assert_eq!(result["scannedFiles"], 1);
        assert_eq!(result["matchedRecords"], 1);
        assert_eq!(result["results"][0]["header"], "topic,rule");
        assert!(result["results"][0]["content"]
            .as_str()
            .unwrap()
            .contains("reduce motion"));
        assert_eq!(
            store
                .search_resources(
                    &installed.package.id,
                    V1,
                    "nonexistent-qwerty",
                    "",
                    5,
                    &cancel()
                )
                .unwrap()["matchedRecords"],
            0
        );
        assert!(store
            .search_resources(
                &installed.package.id,
                V1,
                "motion",
                "../secret",
                5,
                &cancel()
            )
            .is_err());
        assert!(store
            .search_resources(&installed.package.id, V2, "motion", "", 5, &cancel())
            .is_err());
        let flag = cancel();
        flag.store(true, Ordering::SeqCst);
        assert!(store
            .search_resources(&installed.package.id, V1, "motion", "", 5, &flag)
            .is_err());
        let mcp = analyze("Use the Figma MCP server", &[]);
        assert!(mcp.mcp_mentioned);
        assert_eq!(mcp.level, "mcp_review");
    }
    #[test]
    fn quoted_multiline_csv_and_unicode_offsets_stay_readable() {
        let temp = Temp::new();
        let store = Store::new(temp.0.clone());
        let remote = Fixture::new(
            "acme/skills",
            "trunk",
            V1,
            vec![
                ("SKILL.md", "Use attached data"),
                (
                    "data/rules.csv",
                    "名称,规则\n动画,\"保持连贯\n尊重减少动态效果\"\n图表,清晰标注\n",
                ),
            ],
        );
        let installed = install(&store, &remote);
        let result = store
            .search_resources(
                &installed.package.id,
                V1,
                "减少动态效果",
                "data",
                3,
                &cancel(),
            )
            .unwrap();
        assert_eq!(result["matchedRecords"], 1);
        let hit = &result["results"][0];
        let offset = hit["offset"].as_u64().unwrap() as usize;
        let original = store
            .read(&installed.package.id, V1, "data/rules.csv", offset, 40_000)
            .unwrap();
        assert!(original["content"]
            .as_str()
            .unwrap()
            .starts_with(hit["content"].as_str().unwrap()));
    }
    #[test]
    fn missing_license_is_explicit_and_dependencies_are_not_execution_authority() {
        let temp = Temp::new();
        let store = Store::new(temp.0.clone());
        let remote = fixture();
        remote
            .values
            .lock()
            .unwrap()
            .get_mut("/repos/acme/skills")
            .unwrap()["license"] = Value::Null;
        let v = inspect(&store, &remote);
        assert!(v.candidates[0].license.starts_with("未知"));
        assert_eq!(v.candidates[0].compatibility.level, "scripts_not_executed");
        assert!(!allowed_api(
            &url::Url::parse("https://api.github.com.evil.test/repos/a/b").unwrap()
        ));
        assert!(!allowed_api(
            &url::Url::parse("http://api.github.com/repos/a/b").unwrap()
        ));
    }
}

#[cfg(test)]
mod additional_security_tests {
    use super::*;
    #[test]
    fn desktop_only_surface_and_exact_origins() {
        assert!(desktop_surface_allowed(
            "main",
            &url::Url::parse("tauri://localhost/").unwrap(),
            false
        ));
        assert!(desktop_surface_allowed(
            "main",
            &url::Url::parse("http://tauri.localhost/").unwrap(),
            false
        ));
        assert!(desktop_surface_allowed(
            "main",
            &url::Url::parse("http://localhost:1420/").unwrap(),
            true
        ));
        for (label, address) in [
            ("main", "http://localhost:1420/"),
            ("main", "https://evil.test/"),
            ("main", "http://127.0.0.1:54321/rhino"),
            ("rhino", "tauri://localhost/"),
            ("html-preview", "tauri://localhost/"),
            ("note_1", "tauri://localhost/"),
            ("main", "file:///C:/preview.html"),
        ] {
            assert!(
                !desktop_surface_allowed(label, &url::Url::parse(address).unwrap(), false),
                "{label} {address}"
            );
        }
    }
    #[test]
    fn local_symlink_directory_is_never_traversed() {
        let base = std::env::temp_dir().join(format!("drawer-skills-links-{}", nonce()));
        fs::create_dir_all(base.join("outside")).unwrap();
        #[cfg(windows)]
        let linked = std::os::windows::fs::symlink_dir(base.join("outside"), base.join("skills"));
        #[cfg(unix)]
        let linked = std::os::unix::fs::symlink(base.join("outside"), base.join("skills"));
        if linked.is_ok() {
            let store = Store::new(base.join("skills"));
            assert!(store.list().unwrap_err().contains("链接"));
            #[cfg(windows)]
            fs::remove_dir(base.join("skills")).unwrap();
            #[cfg(unix)]
            fs::remove_file(base.join("skills")).unwrap();
        } else {
            eprintln!(
                "symlink creation unavailable on this OS; remote symlink rejection still covered"
            );
        }
        fs::remove_dir_all(base).unwrap();
    }
}
