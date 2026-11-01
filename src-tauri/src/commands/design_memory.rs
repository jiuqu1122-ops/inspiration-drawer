//! Opt-in design memory. All tables are additive; originals and chat history are never modified.
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::Emitter;

const KINDS: [&str; 2] = ["drawer-image", "chat-design"];
const COLUMNS: &str = "id, kind, source_id, scope, project_id, title, content, tags_json, evidence, attribution_json, revision, user_corrected, created_at, updated_at";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySwitch {
    pub enabled: bool,
    pub generation: i64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySettings {
    pub drawer_image: MemorySwitch,
    pub chat_design: MemorySwitch,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryAttribution {
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message_ids: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub through_message_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub analyzed_at: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryDraft {
    pub id: String,
    pub kind: String,
    pub source_id: String,
    pub scope: String,
    pub project_id: Option<String>,
    pub title: String,
    pub content: String,
    pub tags: Vec<String>,
    pub evidence: String,
    pub attribution: MemoryAttribution,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryRecord {
    #[serde(flatten)]
    pub draft: MemoryDraft,
    pub revision: i64,
    pub user_corrected: bool,
    pub created_at: i64,
    pub updated_at: i64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryLease {
    pub kind: String,
    pub source_id: String,
    pub generation: i64,
    pub source_revision: i64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryQuery {
    pub query: String,
    pub project_id: Option<String>,
    pub exclude_source_id: Option<String>,
    pub include_related_summaries: Option<bool>,
    pub limit: Option<usize>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryRecall {
    pub settings: MemorySettings,
    pub records: Vec<MemoryRecord>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryPage {
    pub records: Vec<MemoryRecord>,
    pub has_more: bool,
}
#[derive(Debug, Serialize)]
pub struct MemoryWriteResult {
    pub accepted: bool,
    pub written: usize,
}
#[derive(Clone, Serialize)]
pub struct MemoryInvalidation {
    kinds: Vec<String>,
    reason: String,
}

fn err(error: impl std::fmt::Display) -> String {
    error.to_string()
}
fn valid_kind(kind: &str) -> Result<(), String> {
    if KINDS.contains(&kind) {
        Ok(())
    } else {
        Err("未知的设计记忆类型".into())
    }
}
fn valid_text(value: &str, max: usize) -> bool {
    !value.trim().is_empty() && value.chars().count() <= max
}

pub fn ensure_memory_schema(conn: &Connection) -> Result<(), String> {
    conn.busy_timeout(Duration::from_secs(5)).map_err(err)?;
    conn.execute_batch(r#"
      CREATE TABLE IF NOT EXISTS design_memory_switches (
        kind TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, generation INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO design_memory_switches(kind) VALUES ('drawer-image'), ('chat-design');
      CREATE TABLE IF NOT EXISTS design_memory_sources (
        kind TEXT NOT NULL, source_id TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0,
        deleted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(kind, source_id)
      );
      CREATE TABLE IF NOT EXISTS design_memory_records (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, source_id TEXT NOT NULL, scope TEXT NOT NULL,
        project_id TEXT, title TEXT NOT NULL, content TEXT NOT NULL, tags_json TEXT NOT NULL,
        evidence TEXT NOT NULL, attribution_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
        user_corrected INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS design_memory_scope_idx ON design_memory_records(kind, scope, project_id, updated_at);
      CREATE INDEX IF NOT EXISTS design_memory_source_idx ON design_memory_records(kind, source_id);
      CREATE TABLE IF NOT EXISTS design_memory_tombstones (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, source_id TEXT NOT NULL
      );
    "#).map_err(err)
}
fn open(app: &tauri::AppHandle) -> Result<Connection, String> {
    let conn = crate::db::connection::open_connection(app)?;
    ensure_memory_schema(&conn)?;
    // Legacy JSON source writes cannot participate in SQLite transactions.
    // Fail closed rather than recalling deleted image sources from another mode.
    if crate::db::connection::is_json_mode_forced(app) && disable_legacy_drawer_memory(&conn)? {
        invalidate(app, vec![KINDS[0].into()], "settings");
    }
    Ok(conn)
}
fn disable_legacy_drawer_memory(conn: &Connection) -> Result<bool, String> {
    conn.execute("UPDATE design_memory_switches SET enabled=0, generation=generation+1 WHERE kind='drawer-image' AND enabled<>0", [])
        .map(|changed| changed > 0).map_err(err)
}
fn switch(conn: &Connection, kind: &str) -> Result<MemorySwitch, String> {
    conn.query_row(
        "SELECT enabled, generation FROM design_memory_switches WHERE kind=?1",
        [kind],
        |row| {
            Ok(MemorySwitch {
                enabled: row.get(0)?,
                generation: row.get(1)?,
            })
        },
    )
    .map_err(err)
}
fn settings(conn: &Connection) -> Result<MemorySettings, String> {
    Ok(MemorySettings {
        drawer_image: switch(conn, KINDS[0])?,
        chat_design: switch(conn, KINDS[1])?,
    })
}
fn invalidate(app: &tauri::AppHandle, kinds: Vec<String>, reason: &str) {
    let _ = app.emit(
        "design-memory-invalidated",
        MemoryInvalidation {
            kinds,
            reason: reason.into(),
        },
    );
}
fn set_enabled(conn: &mut Connection, kind: &str, enabled: bool) -> Result<MemorySettings, String> {
    valid_kind(kind)?;
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(err)?;
    tx.execute("UPDATE design_memory_switches SET enabled=?2, generation=generation+1 WHERE kind=?1 AND enabled<>?2", params![kind, enabled]).map_err(err)?;
    let result = settings(&tx)?;
    tx.commit().map_err(err)?;
    Ok(result)
}
fn acquire(
    conn: &mut Connection,
    kind: &str,
    source_id: &str,
) -> Result<Option<MemoryLease>, String> {
    valid_kind(kind)?;
    if !valid_text(source_id, 512) {
        return Err("记忆来源标识无效".into());
    }
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(err)?;
    let state = switch(&tx, kind)?;
    if !state.enabled {
        return Ok(None);
    }
    tx.execute(
        "INSERT OR IGNORE INTO design_memory_sources(kind, source_id) VALUES (?1, ?2)",
        params![kind, source_id],
    )
    .map_err(err)?;
    // Latest-started work owns this source revision; older completions cannot overwrite it.
    tx.execute("UPDATE design_memory_sources SET revision=revision+1 WHERE kind=?1 AND source_id=?2 AND deleted=0", params![kind, source_id]).map_err(err)?;
    let (revision, deleted): (i64, bool) = tx
        .query_row(
            "SELECT revision, deleted FROM design_memory_sources WHERE kind=?1 AND source_id=?2",
            params![kind, source_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(err)?;
    tx.commit().map_err(err)?;
    Ok((!deleted).then(|| MemoryLease {
        kind: kind.into(),
        source_id: source_id.into(),
        generation: state.generation,
        source_revision: revision,
    }))
}
fn lease_is_current(conn: &Connection, lease: &MemoryLease) -> Result<bool, String> {
    let state = switch(conn, &lease.kind)?;
    if !state.enabled || state.generation != lease.generation {
        return Ok(false);
    }
    let source = conn
        .query_row(
            "SELECT revision, deleted FROM design_memory_sources WHERE kind=?1 AND source_id=?2",
            params![lease.kind, lease.source_id],
            |r| Ok((r.get::<_, i64>(0)?, r.get::<_, bool>(1)?)),
        )
        .optional()
        .map_err(err)?;
    Ok(source.is_some_and(|(revision, deleted)| !deleted && revision == lease.source_revision))
}
fn validate_draft(draft: &MemoryDraft, lease: &MemoryLease) -> Result<(), String> {
    if draft.kind != lease.kind || draft.source_id != lease.source_id {
        return Err("记忆来源与写入令牌不一致".into());
    }
    if !valid_text(&draft.id, 1024)
        || !valid_text(&draft.title, 240)
        || !valid_text(&draft.content, 8000)
        || !valid_text(&draft.attribution.label, 240)
        || draft.tags.len() > 40
        || draft.tags.iter().any(|t| !valid_text(t, 80))
        || draft
            .attribution
            .message_ids
            .as_ref()
            .is_some_and(|ids| ids.len() > 64 || ids.iter().any(|id| !valid_text(id, 512)))
        || draft
            .attribution
            .through_message_id
            .as_ref()
            .is_some_and(|id| !valid_text(id, 512))
        || draft
            .attribution
            .analyzed_at
            .as_ref()
            .is_some_and(|date| !valid_text(date, 80))
    {
        return Err("记忆内容为空或超出安全长度限制".into());
    }
    if !["project", "long-term"].contains(&draft.scope.as_str()) {
        return Err("记忆范围无效".into());
    }
    if draft.scope == "project"
        && !draft
            .project_id
            .as_ref()
            .is_some_and(|v| valid_text(v, 512))
    {
        return Err("项目记忆需要项目标识".into());
    }
    if draft.scope == "long-term" && draft.project_id.is_some() {
        return Err("长期记忆不能绑定项目".into());
    }
    let evidence_ok = if draft.kind == "drawer-image" {
        draft.evidence == "analyzed-image"
    } else {
        ["explicit-user-statement", "conversation-summary"].contains(&draft.evidence.as_str())
    };
    if !evidence_ok {
        return Err("记忆证据类型不匹配".into());
    }
    if draft.evidence == "conversation-summary" && draft.scope != "project" {
        return Err("对话摘要不能自动成为长期偏好".into());
    }
    Ok(())
}
fn put(
    conn: &mut Connection,
    lease: MemoryLease,
    records: Vec<MemoryDraft>,
) -> Result<MemoryWriteResult, String> {
    valid_kind(&lease.kind)?;
    if records.len() > 100 {
        return Err("一次最多同步 100 条记忆".into());
    }
    for draft in &records {
        validate_draft(draft, &lease)?;
    }
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(err)?;
    if !lease_is_current(&tx, &lease)? {
        return Ok(MemoryWriteResult {
            accepted: false,
            written: 0,
        });
    }
    let mut written = 0;
    for draft in records {
        let blocked: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM design_memory_tombstones WHERE id=?1)",
                [&draft.id],
                |r| r.get(0),
            )
            .map_err(err)?;
        if blocked {
            continue;
        }
        let now = crate::current_time_millis() as i64;
        written += tx.execute(r#"INSERT INTO design_memory_records
            (id, kind, source_id, scope, project_id, title, content, tags_json, evidence, attribution_json, created_at, updated_at)
            VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?11)
            ON CONFLICT(id) DO UPDATE SET title=excluded.title, content=excluded.content,
            tags_json=excluded.tags_json, attribution_json=excluded.attribution_json,
            revision=design_memory_records.revision+1, updated_at=excluded.updated_at
            WHERE design_memory_records.user_corrected=0 AND design_memory_records.kind=excluded.kind
            AND design_memory_records.source_id=excluded.source_id AND design_memory_records.scope=excluded.scope
            AND design_memory_records.project_id IS excluded.project_id AND design_memory_records.evidence=excluded.evidence
            AND (design_memory_records.content<>excluded.content OR design_memory_records.title<>excluded.title
              OR design_memory_records.tags_json<>excluded.tags_json OR design_memory_records.attribution_json<>excluded.attribution_json)"#,
            params![draft.id, draft.kind, draft.source_id, draft.scope, draft.project_id, draft.title, draft.content, serde_json::to_string(&draft.tags).map_err(err)?, draft.evidence, serde_json::to_string(&draft.attribution).map_err(err)?, now]).map_err(err)?;
    }
    tx.commit().map_err(err)?;
    Ok(MemoryWriteResult {
        accepted: true,
        written,
    })
}
fn read_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<MemoryRecord> {
    let parse_error = |index, error| {
        rusqlite::Error::FromSqlConversionFailure(
            index,
            rusqlite::types::Type::Text,
            Box::new(error),
        )
    };
    let tags: String = row.get(7)?;
    let attribution: String = row.get(9)?;
    Ok(MemoryRecord {
        draft: MemoryDraft {
            id: row.get(0)?,
            kind: row.get(1)?,
            source_id: row.get(2)?,
            scope: row.get(3)?,
            project_id: row.get(4)?,
            title: row.get(5)?,
            content: row.get(6)?,
            tags: serde_json::from_str(&tags).map_err(|e| parse_error(7, e))?,
            evidence: row.get(8)?,
            attribution: serde_json::from_str(&attribution).map_err(|e| parse_error(9, e))?,
        },
        revision: row.get(10)?,
        user_corrected: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}
fn tokenize(query: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut latin = String::new();
    let mut previous_han: Option<char> = None;
    let finish = |latin: &mut String, tokens: &mut Vec<String>| {
        if latin.len() >= 2
            && !["design", "please", "about", "with", "this", "that"].contains(&latin.as_str())
        {
            tokens.push(latin.clone());
        }
        latin.clear();
    };
    for ch in query.chars().take(800) {
        if ch.is_ascii_alphanumeric() {
            latin.push(ch.to_ascii_lowercase());
            previous_han = None;
        } else {
            finish(&mut latin, &mut tokens);
            if ('\u{3400}'..='\u{9fff}').contains(&ch) {
                if let Some(prev) = previous_han {
                    let pair = format!("{prev}{ch}");
                    if ![
                        "设计", "帮我", "一个", "一下", "可以", "需要", "请问", "这个", "我们",
                        "希望", "记住", "喜欢",
                    ]
                    .contains(&pair.as_str())
                    {
                        tokens.push(pair);
                    }
                }
                previous_han = Some(ch);
            } else {
                previous_han = None;
            }
        }
    }
    finish(&mut latin, &mut tokens);
    let mut unique = Vec::new();
    for token in tokens {
        if !unique.contains(&token) {
            unique.push(token);
        }
        if unique.len() >= 24 {
            break;
        }
    }
    unique
}
fn recall(conn: &mut Connection, query: MemoryQuery) -> Result<MemoryRecall, String> {
    let tokens = tokenize(&query.query);
    let tx = conn.transaction().map_err(err)?;
    let current = settings(&tx)?;
    if tokens.is_empty() || (!current.drawer_image.enabled && !current.chat_design.enabled) {
        return Ok(MemoryRecall {
            settings: current,
            records: vec![],
        });
    }
    // Parameterized, bounded candidate query: never deserialize the whole library into the frontend.
    let matching = tokens
        .iter()
        .enumerate()
        .map(|(i, _)| {
            format!(
                "lower(title || ' ' || content || ' ' || tags_json) LIKE ?{} ESCAPE '\\'",
                i + 6
            )
        })
        .collect::<Vec<_>>()
        .join(" OR ");
    let sql = format!("SELECT {COLUMNS} FROM design_memory_records WHERE ((kind='drawer-image' AND ?1) OR (kind='chat-design' AND ?2)) AND (scope='long-term' OR (scope='project' AND project_id=?3) OR (?5 AND kind='chat-design' AND evidence='conversation-summary')) AND (?4 IS NULL OR source_id<>?4) AND ({matching}) ORDER BY updated_at DESC, id LIMIT 160");
    let mut values = vec![
        rusqlite::types::Value::Integer(current.drawer_image.enabled as i64),
        rusqlite::types::Value::Integer(current.chat_design.enabled as i64),
        query
            .project_id
            .map_or(rusqlite::types::Value::Null, Into::into),
        query
            .exclude_source_id
            .map_or(rusqlite::types::Value::Null, Into::into),
    ];
    values.push(rusqlite::types::Value::Integer(
        query.include_related_summaries.unwrap_or(false) as i64,
    ));
    values.extend(
        tokens
            .iter()
            .map(|token| rusqlite::types::Value::Text(format!("%{token}%"))),
    );
    let mut records = {
        let mut stmt = tx.prepare(&sql).map_err(err)?;
        let rows = stmt
            .query_map(rusqlite::params_from_iter(values.iter()), read_record)
            .map_err(err)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(err)?
    };
    let score = |record: &MemoryRecord| {
        let text = format!(
            "{} {} {}",
            record.draft.title,
            record.draft.content,
            record.draft.tags.join(" ")
        )
        .to_lowercase();
        tokens
            .iter()
            .filter(|token| text.contains(token.as_str()))
            .count()
            + if record.user_corrected { 1 } else { 0 }
    };
    records.sort_by(|a, b| {
        score(b)
            .cmp(&score(a))
            .then(b.updated_at.cmp(&a.updated_at))
            .then(a.draft.id.cmp(&b.draft.id))
    });
    records.truncate(query.limit.unwrap_or(6).clamp(1, 8));
    tx.commit().map_err(err)?;
    Ok(MemoryRecall {
        settings: current,
        records,
    })
}
fn list(
    conn: &Connection,
    kind: Option<String>,
    offset: usize,
    limit: usize,
) -> Result<MemoryPage, String> {
    if let Some(value) = &kind {
        valid_kind(value)?;
    }
    let limit = limit.clamp(1, 50);
    let mut stmt = conn.prepare(&format!("SELECT {COLUMNS} FROM design_memory_records WHERE (?1 IS NULL OR kind=?1) ORDER BY updated_at DESC, id LIMIT ?2 OFFSET ?3")).map_err(err)?;
    let mut records = stmt
        .query_map(
            params![kind, (limit + 1) as i64, offset.min(1_000_000) as i64],
            read_record,
        )
        .map_err(err)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(err)?;
    let has_more = records.len() > limit;
    records.truncate(limit);
    Ok(MemoryPage { records, has_more })
}
fn get_record(conn: &Connection, id: &str) -> Result<Option<MemoryRecord>, String> {
    conn.query_row(
        &format!("SELECT {COLUMNS} FROM design_memory_records WHERE id=?1"),
        [id],
        read_record,
    )
    .optional()
    .map_err(err)
}
fn bump_source(conn: &Connection, kind: &str, source_id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE design_memory_sources SET revision=revision+1 WHERE kind=?1 AND source_id=?2",
        params![kind, source_id],
    )
    .map_err(err)?;
    Ok(())
}
fn edit(
    conn: &mut Connection,
    id: &str,
    expected_revision: i64,
    content: &str,
) -> Result<MemoryRecord, String> {
    if !valid_text(content, 8000) {
        return Err("记忆内容为空或超出长度限制".into());
    }
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(err)?;
    let record = get_record(&tx, id)?.ok_or("记忆已删除，请刷新")?;
    if record.revision != expected_revision {
        return Err("记忆已被其他操作更新，请刷新后重试".into());
    }
    // Management is explicitly allowed while recall is OFF; automated reads/writes are not.
    tx.execute("UPDATE design_memory_records SET content=?2, tags_json='[]', user_corrected=1, revision=revision+1, updated_at=?3 WHERE id=?1", params![id, content.trim(), crate::current_time_millis() as i64]).map_err(err)?;
    bump_source(&tx, &record.draft.kind, &record.draft.source_id)?;
    let result = get_record(&tx, id)?.ok_or("记忆更新失败")?;
    tx.commit().map_err(err)?;
    Ok(result)
}
fn delete(
    conn: &mut Connection,
    id: &str,
    expected_revision: i64,
) -> Result<Option<String>, String> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(err)?;
    let Some(record) = get_record(&tx, id)? else {
        return Ok(None);
    };
    if record.revision != expected_revision {
        return Err("记忆已被更新，请刷新后重试".into());
    }
    tx.execute(
        "INSERT OR IGNORE INTO design_memory_tombstones(id, kind, source_id) VALUES (?1, ?2, ?3)",
        params![id, record.draft.kind, record.draft.source_id],
    )
    .map_err(err)?;
    tx.execute("DELETE FROM design_memory_records WHERE id=?1", [id])
        .map_err(err)?;
    bump_source(&tx, &record.draft.kind, &record.draft.source_id)?;
    tx.commit().map_err(err)?;
    Ok(Some(record.draft.kind))
}
fn clear(conn: &mut Connection, kind: &str) -> Result<usize, String> {
    valid_kind(kind)?;
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(err)?;
    tx.execute("INSERT OR IGNORE INTO design_memory_tombstones(id, kind, source_id) SELECT id, kind, source_id FROM design_memory_records WHERE kind=?1", [kind]).map_err(err)?;
    let deleted = tx
        .execute("DELETE FROM design_memory_records WHERE kind=?1", [kind])
        .map_err(err)?;
    tx.execute(
        "UPDATE design_memory_switches SET generation=generation+1 WHERE kind=?1",
        [kind],
    )
    .map_err(err)?;
    tx.commit().map_err(err)?;
    Ok(deleted)
}
/// Parent calls ensure_memory_schema BEFORE opening its original-source transaction.
/// Pass &Transaction (deref coercion to &Connection) after deleting/trashing the source.
/// This is deliberately transaction-only: a failed original deletion rolls memory invalidation back too.
pub fn invalidate_source_in_transaction(
    conn: &Connection,
    kind: &str,
    source_id: &str,
) -> Result<usize, String> {
    valid_kind(kind)?;
    if !valid_text(source_id, 512) {
        return Err("来源标识无效".into());
    }
    if conn.is_autocommit() {
        return Err("来源失效操作必须和原始来源删除处于同一事务".into());
    }
    conn.execute("INSERT INTO design_memory_sources(kind,source_id,revision,deleted) VALUES (?1,?2,1,1) ON CONFLICT(kind,source_id) DO UPDATE SET revision=revision+1,deleted=1", params![kind,source_id]).map_err(err)?;
    conn.execute(
        "DELETE FROM design_memory_records WHERE kind=?1 AND source_id=?2",
        params![kind, source_id],
    )
    .map_err(err)
}

/// Call in the same transaction that restores an original source from trash.
/// No old memory content is restored. A subsequent explicit reindex/new analysis may acquire a NEW lease.
/// User-deleted/cleared record tombstones remain, so restoring an original cannot undo those decisions.
pub fn restore_source_in_transaction(
    conn: &Connection,
    kind: &str,
    source_id: &str,
) -> Result<bool, String> {
    valid_kind(kind)?;
    if !valid_text(source_id, 512) {
        return Err("来源标识无效".into());
    }
    if conn.is_autocommit() {
        return Err("来源恢复必须和原始来源恢复处于同一事务".into());
    }
    conn.execute("UPDATE design_memory_sources SET revision=revision+1,deleted=0 WHERE kind=?1 AND source_id=?2 AND deleted=1", params![kind,source_id]).map(|updated| updated > 0).map_err(err)
}

/// Emit only AFTER the original-source transaction commits; never emit for a rollback.
pub fn notify_source_changed(app: &tauri::AppHandle, kind: &str) {
    if KINDS.contains(&kind) {
        invalidate(app, vec![kind.into()], "source-deleted");
    }
}

fn delete_source(conn: &mut Connection, kind: &str, source_id: &str) -> Result<usize, String> {
    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(err)?;
    let deleted = invalidate_source_in_transaction(&tx, kind, source_id)?;
    tx.commit().map_err(err)?;
    Ok(deleted)
}

#[tauri::command]
pub fn design_memory_get_settings(app_handle: tauri::AppHandle) -> Result<MemorySettings, String> {
    settings(&open(&app_handle)?)
}
#[tauri::command]
pub fn design_memory_set_enabled(
    app_handle: tauri::AppHandle,
    kind: String,
    enabled: bool,
) -> Result<MemorySettings, String> {
    if enabled && kind == KINDS[0] && crate::db::connection::is_json_mode_forced(&app_handle) {
        return Err("当前为兼容 JSON 存储模式；请恢复 SQLite 素材库后再开启抽屉图片记忆。已有记忆不会删除，Chat 设计记忆不受影响。".into());
    }
    let result = set_enabled(&mut open(&app_handle)?, &kind, enabled)?;
    invalidate(&app_handle, vec![kind], "settings");
    Ok(result)
}
#[tauri::command]
pub fn design_memory_acquire_lease(
    app_handle: tauri::AppHandle,
    kind: String,
    source_id: String,
) -> Result<Option<MemoryLease>, String> {
    acquire(&mut open(&app_handle)?, &kind, &source_id)
}
#[tauri::command]
pub fn design_memory_upsert(
    app_handle: tauri::AppHandle,
    lease: MemoryLease,
    records: Vec<MemoryDraft>,
) -> Result<MemoryWriteResult, String> {
    put(&mut open(&app_handle)?, lease, records)
}
#[tauri::command]
pub fn design_memory_recall(
    app_handle: tauri::AppHandle,
    query: MemoryQuery,
) -> Result<MemoryRecall, String> {
    recall(&mut open(&app_handle)?, query)
}
#[tauri::command]
pub fn design_memory_list(
    app_handle: tauri::AppHandle,
    kind: Option<String>,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<MemoryPage, String> {
    list(
        &open(&app_handle)?,
        kind,
        offset.unwrap_or(0),
        limit.unwrap_or(30),
    )
}
#[tauri::command]
pub fn design_memory_correct(
    app_handle: tauri::AppHandle,
    id: String,
    expected_revision: i64,
    content: String,
) -> Result<MemoryRecord, String> {
    let result = edit(&mut open(&app_handle)?, &id, expected_revision, &content)?;
    invalidate(&app_handle, vec![result.draft.kind.clone()], "edit");
    Ok(result)
}
#[tauri::command]
pub fn design_memory_delete(
    app_handle: tauri::AppHandle,
    id: String,
    expected_revision: i64,
) -> Result<bool, String> {
    let result = delete(&mut open(&app_handle)?, &id, expected_revision)?;
    if let Some(kind) = &result {
        invalidate(&app_handle, vec![kind.clone()], "delete");
    }
    Ok(result.is_some())
}
#[tauri::command]
pub fn design_memory_clear(app_handle: tauri::AppHandle, kind: String) -> Result<usize, String> {
    let result = clear(&mut open(&app_handle)?, &kind)?;
    invalidate(&app_handle, vec![kind], "clear");
    Ok(result)
}
#[tauri::command]
pub fn design_memory_delete_source(
    app_handle: tauri::AppHandle,
    kind: String,
    source_id: String,
) -> Result<usize, String> {
    let result = delete_source(&mut open(&app_handle)?, &kind, &source_id)?;
    invalidate(&app_handle, vec![kind], "source-deleted");
    Ok(result)
}
#[cfg(test)]
mod tests {
    use super::*;
    fn database() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        ensure_memory_schema(&conn).unwrap();
        conn
    }
    fn draft(
        id: &str,
        kind: &str,
        source: &str,
        project: Option<&str>,
        content: &str,
    ) -> MemoryDraft {
        MemoryDraft {
            id: id.into(),
            kind: kind.into(),
            source_id: source.into(),
            scope: if project.is_some() {
                "project"
            } else {
                "long-term"
            }
            .into(),
            project_id: project.map(str::to_string),
            title: "设计参考".into(),
            content: content.into(),
            tags: vec!["金属".into()],
            evidence: if kind == KINDS[0] {
                "analyzed-image"
            } else {
                "explicit-user-statement"
            }
            .into(),
            attribution: MemoryAttribution {
                label: "合成测试来源".into(),
                message_ids: Some(vec!["message-1".into()]),
                through_message_id: None,
                analyzed_at: None,
            },
        }
    }
    fn save(conn: &mut Connection, value: MemoryDraft) {
        let lease = acquire(conn, &value.kind, &value.source_id)
            .unwrap()
            .unwrap();
        assert_eq!(put(conn, lease, vec![value]).unwrap().written, 1);
    }
    fn query(conn: &mut Connection, text: &str, project: Option<&str>) -> Vec<MemoryRecord> {
        recall(
            conn,
            MemoryQuery {
                query: text.into(),
                project_id: project.map(str::to_string),
                exclude_source_id: None,
                include_related_summaries: None,
                limit: None,
            },
        )
        .unwrap()
        .records
    }
    #[test]
    fn defaults_off_and_schema_is_additive_idempotent() {
        let mut conn = database();
        conn.execute_batch("CREATE TABLE originals(id TEXT); INSERT INTO originals VALUES ('keep'); PRAGMA user_version=10;").unwrap();
        ensure_memory_schema(&conn).unwrap();
        assert!(!settings(&conn).unwrap().drawer_image.enabled);
        assert!(!settings(&conn).unwrap().chat_design.enabled);
        assert!(acquire(&mut conn, KINDS[0], "image-1").unwrap().is_none());
        assert_eq!(
            conn.query_row("SELECT id FROM originals", [], |r| r.get::<_, String>(0))
                .unwrap(),
            "keep"
        );
        assert_eq!(
            conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            10
        );
    }
    #[test]
    fn legacy_source_mode_disables_only_drawer_without_deleting_rows_and_revokes_tickets() {
        let mut conn = database();
        set_enabled(&mut conn, KINDS[0], true).unwrap();
        set_enabled(&mut conn, KINDS[1], true).unwrap();
        save(&mut conn, draft("saved", KINDS[0], "image", None, "金属参考"));
        let pending = acquire(&mut conn, KINDS[0], "image-late").unwrap().unwrap();
        assert!(disable_legacy_drawer_memory(&conn).unwrap());
        assert!(!disable_legacy_drawer_memory(&conn).unwrap());
        assert!(!settings(&conn).unwrap().drawer_image.enabled);
        assert!(settings(&conn).unwrap().chat_design.enabled);
        assert_eq!(list(&conn, None, 0, 30).unwrap().records.len(), 1);
        assert!(!put(&mut conn, pending, vec![draft("late", KINDS[0], "image-late", None, "旧任务")]).unwrap().accepted);
    }
    #[test]
    fn toggles_are_independent_and_rows_survive_reenable() {
        let mut conn = database();
        set_enabled(&mut conn, KINDS[0], true).unwrap();
        save(&mut conn, draft("a", KINDS[0], "image", None, "金属 磨砂"));
        assert!(!settings(&conn).unwrap().chat_design.enabled);
        set_enabled(&mut conn, KINDS[0], false).unwrap();
        assert!(query(&mut conn, "金属", None).is_empty());
        assert_eq!(list(&conn, None, 0, 30).unwrap().records.len(), 1);
        set_enabled(&mut conn, KINDS[0], true).unwrap();
        assert_eq!(query(&mut conn, "金属", None).len(), 1);
    }
    #[test]
    fn disable_reenable_rejects_in_flight_completion() {
        let mut conn = database();
        set_enabled(&mut conn, KINDS[1], true).unwrap();
        let lease = acquire(&mut conn, KINDS[1], "conversation")
            .unwrap()
            .unwrap();
        set_enabled(&mut conn, KINDS[1], false).unwrap();
        set_enabled(&mut conn, KINDS[1], true).unwrap();
        let result = put(
            &mut conn,
            lease,
            vec![draft("a", KINDS[1], "conversation", None, "金属材质")],
        )
        .unwrap();
        assert!(!result.accepted);
        assert_eq!(result.written, 0);
        assert!(list(&conn, None, 0, 30).unwrap().records.is_empty());
    }
    #[test]
    fn retrieval_is_related_scoped_and_cross_session_for_long_term() {
        let mut conn = database();
        set_enabled(&mut conn, KINDS[1], true).unwrap();
        save(
            &mut conn,
            draft("global", KINDS[1], "old-session", None, "耳机喜欢金属磨砂"),
        );
        save(
            &mut conn,
            draft(
                "same",
                KINDS[1],
                "another-session",
                Some("project-a"),
                "耳机采用金属磨砂",
            ),
        );
        save(
            &mut conn,
            draft(
                "other",
                KINDS[1],
                "third-session",
                Some("project-b"),
                "耳机采用金属磨砂",
            ),
        );
        let mut unrelated = draft(
            "unrelated",
            KINDS[1],
            "fourth-session",
            None,
            "香水玻璃透明",
        );
        unrelated.tags.clear();
        save(&mut conn, unrelated);
        let records = query(&mut conn, "金属磨砂耳机设计", Some("project-a"));
        let ids: Vec<_> = records.iter().map(|r| r.draft.id.as_str()).collect();
        assert!(ids.contains(&"global"));
        assert!(ids.contains(&"same"));
        assert!(!ids.contains(&"other"));
        assert!(!ids.contains(&"unrelated"));
        let records = query(&mut conn, "金属耳机", None);
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].draft.id, "global");
        assert!(query(&mut conn, "你好，请帮我设计一下", None).is_empty());
    }
    #[test]
    fn correction_survives_new_sync_and_rejects_pending_sync() {
        let mut conn = database();
        set_enabled(&mut conn, KINDS[0], true).unwrap();
        let original = draft("image-row", KINDS[0], "image", None, "金属红色");
        save(&mut conn, original.clone());
        let pending = acquire(&mut conn, KINDS[0], "image").unwrap().unwrap();
        let corrected = edit(&mut conn, "image-row", 1, "绿色磨砂").unwrap();
        assert!(corrected.user_corrected);
        assert!(corrected.draft.tags.is_empty());
        assert!(
            !put(&mut conn, pending, vec![original.clone()])
                .unwrap()
                .accepted
        );
        let new_lease = acquire(&mut conn, KINDS[0], "image").unwrap().unwrap();
        assert_eq!(
            put(&mut conn, new_lease, vec![original]).unwrap().written,
            0
        );
        assert_eq!(
            get_record(&conn, "image-row")
                .unwrap()
                .unwrap()
                .draft
                .content,
            "绿色磨砂"
        );
        assert!(edit(&mut conn, "image-row", 1, "陈旧纠正").is_err());
    }
    #[test]
    fn delete_retains_only_tombstone_and_blocks_reinsertion() {
        let mut conn = database();
        set_enabled(&mut conn, KINDS[1], true).unwrap();
        let original = draft("user-row", KINDS[1], "conversation", None, "金属风格");
        save(&mut conn, original.clone());
        let pending = acquire(&mut conn, KINDS[1], "conversation")
            .unwrap()
            .unwrap();
        assert!(delete(&mut conn, "user-row", 99).is_err());
        assert!(delete(&mut conn, "user-row", 1).unwrap().is_some());
        assert!(
            !put(&mut conn, pending, vec![original.clone()])
                .unwrap()
                .accepted
        );
        let lease = acquire(&mut conn, KINDS[1], "conversation")
            .unwrap()
            .unwrap();
        assert_eq!(put(&mut conn, lease, vec![original]).unwrap().written, 0);
        assert!(get_record(&conn, "user-row").unwrap().is_none());
    }
    #[test]
    fn clear_invalidates_jobs_and_does_not_repopulate_old_ids() {
        let mut conn = database();
        set_enabled(&mut conn, KINDS[1], true).unwrap();
        let original = draft("old", KINDS[1], "conversation", None, "金属风格");
        save(&mut conn, original.clone());
        let pending = acquire(&mut conn, KINDS[1], "conversation")
            .unwrap()
            .unwrap();
        assert_eq!(clear(&mut conn, KINDS[1]).unwrap(), 1);
        assert!(
            !put(
                &mut conn,
                pending,
                vec![draft(
                    "not-yet-written",
                    KINDS[1],
                    "conversation",
                    None,
                    "金属"
                )]
            )
            .unwrap()
            .accepted
        );
        let new_lease = acquire(&mut conn, KINDS[1], "conversation")
            .unwrap()
            .unwrap();
        assert_eq!(
            put(&mut conn, new_lease, vec![original]).unwrap().written,
            0
        );
        save(
            &mut conn,
            draft(
                "new-user-message",
                KINDS[1],
                "conversation",
                None,
                "金属新要求",
            ),
        );
        assert!(settings(&conn).unwrap().chat_design.enabled);
        assert_eq!(list(&conn, None, 0, 30).unwrap().records.len(), 1);
    }
    #[test]
    fn source_delete_blocks_jobs_even_if_no_row_has_been_written() {
        let mut conn = database();
        set_enabled(&mut conn, KINDS[0], true).unwrap();
        let lease = acquire(&mut conn, KINDS[0], "deleted-image")
            .unwrap()
            .unwrap();
        delete_source(&mut conn, KINDS[0], "deleted-image").unwrap();
        assert!(
            !put(
                &mut conn,
                lease,
                vec![draft("late", KINDS[0], "deleted-image", None, "金属")]
            )
            .unwrap()
            .accepted
        );
        assert!(acquire(&mut conn, KINDS[0], "deleted-image")
            .unwrap()
            .is_none());
        delete_source(&mut conn, KINDS[0], "never-indexed-image").unwrap();
        assert!(acquire(&mut conn, KINDS[0], "never-indexed-image")
            .unwrap()
            .is_none());
    }
    #[test]
    fn management_works_while_off_but_automatic_write_cannot() {
        let mut conn = database();
        set_enabled(&mut conn, KINDS[1], true).unwrap();
        save(
            &mut conn,
            draft("a", KINDS[1], "conversation", None, "金属风格"),
        );
        let lease = acquire(&mut conn, KINDS[1], "conversation")
            .unwrap()
            .unwrap();
        set_enabled(&mut conn, KINDS[1], false).unwrap();
        let corrected = edit(&mut conn, "a", 1, "塑料风格").unwrap();
        assert_eq!(corrected.revision, 2);
        assert!(
            !put(
                &mut conn,
                lease,
                vec![draft("late", KINDS[1], "conversation", None, "金属")]
            )
            .unwrap()
            .accepted
        );
        assert!(query(&mut conn, "塑料", None).is_empty());
        assert_eq!(clear(&mut conn, KINDS[1]).unwrap(), 1);
    }
    #[test]
    fn invalid_scope_and_cross_source_payloads_are_rejected_atomically() {
        let mut conn = database();
        set_enabled(&mut conn, KINDS[1], true).unwrap();
        let lease = acquire(&mut conn, KINDS[1], "conversation")
            .unwrap()
            .unwrap();
        assert!(put(
            &mut conn,
            lease.clone(),
            vec![draft("a", KINDS[1], "wrong-source", None, "金属")]
        )
        .is_err());
        let mut invalid = draft("a", KINDS[1], "conversation", None, "金属");
        invalid.scope = "project".into();
        assert!(put(&mut conn, lease.clone(), vec![invalid]).is_err());
        let mut summary = draft("a", KINDS[1], "conversation", None, "金属");
        summary.evidence = "conversation-summary".into();
        assert!(put(&mut conn, lease, vec![summary]).is_err());
        assert!(list(&conn, None, 0, 30).unwrap().records.is_empty());
    }
    #[test]
    fn metadata_pagination_and_relevance_limits_are_bounded() {
        let mut conn = database();
        set_enabled(&mut conn, KINDS[0], true).unwrap();
        for i in 0..12 {
            save(
                &mut conn,
                draft(
                    &format!("image-{i}"),
                    KINDS[0],
                    &format!("source-{i}"),
                    None,
                    "金属磨砂",
                ),
            );
        }
        let page = list(&conn, Some(KINDS[0].into()), 0, 5).unwrap();
        assert_eq!(page.records.len(), 5);
        assert!(page.has_more);
        let next = list(&conn, Some(KINDS[0].into()), 5, 5).unwrap();
        assert!(page
            .records
            .iter()
            .all(|a| next.records.iter().all(|b| a.draft.id != b.draft.id)));
        assert_eq!(query(&mut conn, "金属磨砂", None).len(), 6);
    }
    #[test]
    fn persisted_records_survive_connection_restart() {
        let path = std::env::temp_dir().join(format!(
            "design-memory-test-{}-{}.db",
            std::process::id(),
            crate::current_time_millis()
        ));
        {
            let mut conn = Connection::open(&path).unwrap();
            ensure_memory_schema(&conn).unwrap();
            set_enabled(&mut conn, KINDS[1], true).unwrap();
            save(
                &mut conn,
                draft("persisted", KINDS[1], "old-session", None, "金属磨砂"),
            );
        }
        {
            let mut conn = Connection::open(&path).unwrap();
            ensure_memory_schema(&conn).unwrap();
            let records = query(&mut conn, "金属", None);
            assert_eq!(records[0].draft.source_id, "old-session");
            assert_eq!(
                records[0].draft.attribution.message_ids.as_ref().unwrap()[0],
                "message-1"
            );
        }
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn newer_started_job_prevents_older_completion_overwriting_a_source() {
        let mut conn = database();
        set_enabled(&mut conn, KINDS[0], true).unwrap();
        let older = acquire(&mut conn, KINDS[0], "image").unwrap().unwrap();
        let newer = acquire(&mut conn, KINDS[0], "image").unwrap().unwrap();
        assert!(newer.source_revision > older.source_revision);
        put(
            &mut conn,
            newer,
            vec![draft("image-row", KINDS[0], "image", None, "新的金属设计")],
        )
        .unwrap();
        assert!(
            !put(
                &mut conn,
                older,
                vec![draft(
                    "image-row",
                    KINDS[0],
                    "image",
                    None,
                    "过期的塑料设计"
                )]
            )
            .unwrap()
            .accepted
        );
        assert_eq!(
            get_record(&conn, "image-row")
                .unwrap()
                .unwrap()
                .draft
                .content,
            "新的金属设计"
        );
    }
    #[test]
    fn related_old_project_summaries_are_explicit_historical_references_not_constraints() {
        let mut conn = database();
        set_enabled(&mut conn, KINDS[1], true).unwrap();
        let mut summary = draft(
            "old-summary",
            KINDS[1],
            "old-session",
            Some("old-project"),
            "耳机金属磨砂设计，助手建议尚未确认",
        );
        summary.evidence = "conversation-summary".into();
        summary.attribution.through_message_id = Some("boundary".into());
        save(&mut conn, summary);
        save(
            &mut conn,
            draft(
                "old-constraint",
                KINDS[1],
                "old-session",
                Some("old-project"),
                "耳机金属材质为硬性要求",
            ),
        );
        assert!(query(&mut conn, "金属耳机", Some("new-project")).is_empty());
        let recalled = recall(
            &mut conn,
            MemoryQuery {
                query: "金属耳机".into(),
                project_id: Some("new-project".into()),
                exclude_source_id: None,
                include_related_summaries: Some(true),
                limit: None,
            },
        )
        .unwrap()
        .records;
        assert_eq!(recalled.len(), 1);
        assert_eq!(recalled[0].draft.id, "old-summary");
        assert_eq!(recalled[0].draft.project_id.as_deref(), Some("old-project"));
        assert_eq!(recalled[0].draft.evidence, "conversation-summary");
    }
    #[test]
    fn original_deletion_and_memory_invalidation_rollback_together() {
        let mut conn = database();
        set_enabled(&mut conn, KINDS[0], true).unwrap();
        conn.execute_batch("CREATE TABLE test_originals(id TEXT PRIMARY KEY); INSERT INTO test_originals VALUES ('image');").unwrap();
        save(
            &mut conn,
            draft("image-memory", KINDS[0], "image", None, "金属设计"),
        );
        let pending = acquire(&mut conn, KINDS[0], "image").unwrap().unwrap();
        assert!(invalidate_source_in_transaction(&conn, KINDS[0], "image").is_err());
        {
            let tx = conn.transaction().unwrap();
            tx.execute("DELETE FROM test_originals WHERE id='image'", [])
                .unwrap();
            assert_eq!(
                invalidate_source_in_transaction(&tx, KINDS[0], "image").unwrap(),
                1
            );
            // Simulate failure in the original-source operation: rollback on drop.
        }
        assert!(get_record(&conn, "image-memory").unwrap().is_some());
        assert!(lease_is_current(&conn, &pending).unwrap());
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM test_originals", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
        {
            let tx = conn.transaction().unwrap();
            tx.execute("DELETE FROM test_originals WHERE id='image'", [])
                .unwrap();
            invalidate_source_in_transaction(&tx, KINDS[0], "image").unwrap();
            tx.commit().unwrap();
        }
        assert!(get_record(&conn, "image-memory").unwrap().is_none());
        assert!(!lease_is_current(&conn, &pending).unwrap());
    }
    #[test]
    fn restoring_original_allows_explicit_reindex_but_does_not_undo_clear_or_revive_jobs() {
        let mut conn = database();
        set_enabled(&mut conn, KINDS[0], true).unwrap();
        let original = draft("image-memory", KINDS[0], "image", None, "金属设计");
        save(&mut conn, original.clone());
        let pending = acquire(&mut conn, KINDS[0], "image").unwrap().unwrap();
        delete_source(&mut conn, KINDS[0], "image").unwrap();
        {
            let tx = conn.transaction().unwrap();
            assert!(restore_source_in_transaction(&tx, KINDS[0], "image").unwrap());
            tx.commit().unwrap();
        }
        assert!(get_record(&conn, "image-memory").unwrap().is_none());
        assert!(
            !put(&mut conn, pending, vec![original.clone()])
                .unwrap()
                .accepted
        );
        save(&mut conn, original.clone()); // An explicit NEW reindex can index the restored original.
        clear(&mut conn, KINDS[0]).unwrap();
        delete_source(&mut conn, KINDS[0], "image").unwrap();
        {
            let tx = conn.transaction().unwrap();
            restore_source_in_transaction(&tx, KINDS[0], "image").unwrap();
            tx.commit().unwrap();
        }
        let fresh = acquire(&mut conn, KINDS[0], "image").unwrap().unwrap();
        assert_eq!(put(&mut conn, fresh, vec![original]).unwrap().written, 0);
    }
}
