use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatConversationRecord {
    pub id: String,
    pub title: String,
    pub model: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub archived: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatAttachmentRecord {
    pub id: String,
    pub message_id: String,
    #[serde(rename = "type")]
    pub attachment_type: String,
    pub path: String,
    pub thumbnail_path: Option<String>,
    pub mime_type: Option<String>,
    pub metadata_json: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatToolCallRecord {
    pub id: String,
    pub message_id: String,
    pub tool_name: String,
    pub arguments_json: String,
    pub result_json: Option<String>,
    pub status: String,
    pub created_at: i64,
    pub completed_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageRecord {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub status: String,
    pub created_at: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thinking_steps: Option<Vec<Value>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub generation_started_at: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub generation_completed_at: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_started_at: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_completed_at: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usage: Option<Value>,
    #[serde(default)]
    pub attachments: Vec<ChatAttachmentRecord>,
    #[serde(default)]
    pub tool_calls: Vec<ChatToolCallRecord>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatMessageMetadata {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    reasoning: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    reasoning_status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    thinking_steps: Option<Vec<Value>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    generation_started_at: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    generation_completed_at: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    reasoning_started_at: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    reasoning_completed_at: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    usage: Option<Value>,
}

impl ChatMessageMetadata {
    fn from_message(message: &ChatMessageRecord) -> Self {
        Self {
            reasoning: message.reasoning.clone(),
            reasoning_status: message.reasoning_status.clone(),
            thinking_steps: message.thinking_steps.clone(),
            generation_started_at: message.generation_started_at,
            generation_completed_at: message.generation_completed_at,
            reasoning_started_at: message.reasoning_started_at,
            reasoning_completed_at: message.reasoning_completed_at,
            usage: message.usage.clone(),
        }
    }

    fn is_empty(&self) -> bool {
        self.reasoning.is_none()
            && self.reasoning_status.is_none()
            && self.thinking_steps.is_none()
            && self.generation_started_at.is_none()
            && self.generation_completed_at.is_none()
            && self.reasoning_started_at.is_none()
            && self.reasoning_completed_at.is_none()
            && self.usage.is_none()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSummaryRecord {
    pub conversation_id: String,
    pub summary: String,
    pub through_message_id: Option<String>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatConversationListOptions {
    pub search: Option<String>,
    pub archived: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageListOptions {
    pub conversation_id: String,
    pub before_created_at: Option<i64>,
    #[serde(default)]
    pub before_id: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessagePage {
    pub messages: Vec<ChatMessageRecord>,
    pub has_more: bool,
    pub next_before_created_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_before_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyChatMigrationPayload {
    pub conversations: Vec<Value>,
    #[serde(default)]
    pub default_model: Option<String>,
}

pub struct ChatRepository {
    conn: Connection,
    memory_notifier: Option<tauri::AppHandle>,
}

impl ChatRepository {
    pub fn new(conn: Connection) -> Self {
        Self {
            conn,
            memory_notifier: None,
        }
    }

    pub fn with_memory_notifier(mut self, app: tauri::AppHandle) -> Self {
        self.memory_notifier = Some(app);
        self
    }

    fn notify_design_source_changed(&self, changed: bool) {
        if changed {
            if let Some(app) = &self.memory_notifier {
                crate::commands::design_memory::notify_source_changed(app, "chat-design");
            }
        }
    }

    fn supports_memory_id(id: &str) -> bool {
        !id.trim().is_empty() && id.chars().count() <= 512
    }

    pub fn conversation_count(&self) -> Result<i64, String> {
        self.conn
            .query_row("SELECT COUNT(*) FROM chat_conversations", [], |row| {
                row.get(0)
            })
            .map_err(|error| error.to_string())
    }

    pub fn list_conversations(
        &self,
        options: ChatConversationListOptions,
    ) -> Result<Vec<ChatConversationRecord>, String> {
        let limit = options.limit.unwrap_or(80).clamp(1, 200);
        let offset = options.offset.unwrap_or(0).max(0);
        let archived = if options.archived.unwrap_or(false) {
            1
        } else {
            0
        };
        let search = options.search.unwrap_or_default().trim().to_string();
        let pattern = format!("%{}%", search.replace('%', "\\%").replace('_', "\\_"));
        let mut stmt = self
            .conn
            .prepare(
                r#"
            SELECT id, title, model, created_at, updated_at, archived
            FROM chat_conversations
            WHERE archived = ?1
              AND (?2 = '' OR title LIKE ?3 ESCAPE '\')
            ORDER BY updated_at DESC, id DESC
            LIMIT ?4 OFFSET ?5
            "#,
            )
            .map_err(|error| error.to_string())?;
        let rows = stmt
            .query_map(params![archived, search, pattern, limit, offset], |row| {
                Ok(ChatConversationRecord {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    model: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                    archived: row.get::<_, i64>(5)? != 0,
                })
            })
            .map_err(|error| error.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())
    }

    pub fn upsert_conversation(
        &self,
        conversation: ChatConversationRecord,
    ) -> Result<ChatConversationRecord, String> {
        crate::commands::design_memory::ensure_memory_schema(&self.conn)?;
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|error| error.to_string())?;
        tx.execute(
            r#"
            INSERT INTO chat_conversations (id, title, model, created_at, updated_at, archived)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                model = excluded.model,
                updated_at = excluded.updated_at,
                archived = excluded.archived
            "#,
            params![
                conversation.id,
                conversation.title,
                conversation.model,
                conversation.created_at,
                conversation.updated_at,
                if conversation.archived { 1 } else { 0 },
            ],
        )
        .map_err(|error| error.to_string())?;
        let restored = if Self::supports_memory_id(&conversation.id) {
            crate::commands::design_memory::restore_source_in_transaction(
                &tx,
                "chat-design",
                &conversation.id,
            )?
        } else {
            false
        };
        tx.commit().map_err(|error| error.to_string())?;
        self.notify_design_source_changed(restored);
        Ok(conversation)
    }

    pub fn delete_conversation(&self, id: &str) -> Result<bool, String> {
        crate::commands::design_memory::ensure_memory_schema(&self.conn)?;
        let tx = self
            .conn
            .unchecked_transaction()
            .map_err(|error| error.to_string())?;
        let changed = tx
            .execute("DELETE FROM chat_conversations WHERE id = ?1", params![id])
            .map_err(|error| error.to_string())?;
        if changed > 0 && Self::supports_memory_id(id) {
            crate::commands::design_memory::invalidate_source_in_transaction(
                &tx,
                "chat-design",
                id,
            )?;
        }
        tx.commit().map_err(|error| error.to_string())?;
        self.notify_design_source_changed(changed > 0);
        Ok(changed > 0)
    }

    pub fn list_messages(
        &self,
        options: ChatMessageListOptions,
    ) -> Result<ChatMessagePage, String> {
        let limit = options.limit.unwrap_or(50).clamp(1, 100);
        let fetch_limit = limit + 1;
        let before = options.before_created_at.unwrap_or(i64::MAX);
        let mut stmt = self
            .conn
            .prepare(
                r#"
            SELECT id, conversation_id, role, content, status, created_at, metadata_json
            FROM chat_messages
            WHERE conversation_id = ?1
              AND (created_at < ?2 OR (?4 IS NOT NULL AND created_at = ?2 AND id < ?4))
            ORDER BY created_at DESC, id DESC
            LIMIT ?3
            "#,
            )
            .map_err(|error| error.to_string())?;
        let rows = stmt
            .query_map(
                params![
                    options.conversation_id,
                    before,
                    fetch_limit,
                    options.before_id
                ],
                |row| {
                    let metadata = row
                        .get::<_, Option<String>>(6)?
                        .and_then(|raw| serde_json::from_str::<ChatMessageMetadata>(&raw).ok())
                        .unwrap_or_default();
                    Ok(ChatMessageRecord {
                        id: row.get(0)?,
                        conversation_id: row.get(1)?,
                        role: row.get(2)?,
                        content: row.get(3)?,
                        status: row.get(4)?,
                        created_at: row.get(5)?,
                        reasoning: metadata.reasoning,
                        reasoning_status: metadata.reasoning_status,
                        thinking_steps: metadata.thinking_steps,
                        generation_started_at: metadata.generation_started_at,
                        generation_completed_at: metadata.generation_completed_at,
                        reasoning_started_at: metadata.reasoning_started_at,
                        reasoning_completed_at: metadata.reasoning_completed_at,
                        usage: metadata.usage,
                        attachments: Vec::new(),
                        tool_calls: Vec::new(),
                    })
                },
            )
            .map_err(|error| error.to_string())?;
        let mut messages = rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        let has_more = messages.len() as i64 > limit;
        messages.truncate(limit as usize);
        for message in &mut messages {
            message.attachments = self.list_attachments(&message.id)?;
            message.tool_calls = self.list_tool_calls(&message.id)?;
        }
        messages.reverse();
        let next_before_created_at = messages.first().map(|message| message.created_at);
        let next_before_id = messages.first().map(|message| message.id.clone());
        Ok(ChatMessagePage {
            messages,
            has_more,
            next_before_created_at,
            next_before_id,
        })
    }

    pub fn upsert_message(&self, message: ChatMessageRecord) -> Result<ChatMessageRecord, String> {
        let metadata = ChatMessageMetadata::from_message(&message);
        let metadata_json = if metadata.is_empty() {
            None
        } else {
            Some(serde_json::to_string(&metadata).map_err(|error| error.to_string())?)
        };
        self.conn
            .execute(
                r#"
            INSERT INTO chat_messages (id, conversation_id, role, content, status, created_at, metadata_json)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(id) DO UPDATE SET
                content = excluded.content,
                status = excluded.status,
                metadata_json = excluded.metadata_json
            "#,
                params![
                    message.id,
                    message.conversation_id,
                    message.role,
                    message.content,
                    message.status,
                    message.created_at,
                    metadata_json,
                ],
            )
            .map_err(|error| error.to_string())?;
        self.conn
            .execute(
                "UPDATE chat_conversations SET updated_at = MAX(updated_at, ?2) WHERE id = ?1",
                params![message.conversation_id, message.created_at],
            )
            .map_err(|error| error.to_string())?;
        Ok(message)
    }

    pub fn upsert_attachment(
        &self,
        attachment: ChatAttachmentRecord,
    ) -> Result<ChatAttachmentRecord, String> {
        self.conn.execute(
            r#"
            INSERT INTO chat_attachments (id, message_id, type, path, thumbnail_path, mime_type, metadata_json, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ON CONFLICT(id) DO UPDATE SET
                path = excluded.path,
                thumbnail_path = excluded.thumbnail_path,
                mime_type = excluded.mime_type,
                metadata_json = excluded.metadata_json
            "#,
            params![attachment.id, attachment.message_id, attachment.attachment_type, attachment.path, attachment.thumbnail_path, attachment.mime_type, attachment.metadata_json, attachment.created_at],
        ).map_err(|error| error.to_string())?;
        Ok(attachment)
    }

    pub fn upsert_tool_call(&self, call: ChatToolCallRecord) -> Result<ChatToolCallRecord, String> {
        self.conn.execute(
            r#"
            INSERT INTO chat_tool_calls (id, message_id, tool_name, arguments_json, result_json, status, created_at, completed_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ON CONFLICT(id) DO UPDATE SET
                arguments_json = excluded.arguments_json,
                result_json = excluded.result_json,
                status = excluded.status,
                completed_at = excluded.completed_at
            "#,
            params![call.id, call.message_id, call.tool_name, call.arguments_json, call.result_json, call.status, call.created_at, call.completed_at],
        ).map_err(|error| error.to_string())?;
        Ok(call)
    }

    pub fn get_summary(&self, conversation_id: &str) -> Result<Option<ChatSummaryRecord>, String> {
        self.conn.query_row(
            "SELECT conversation_id, summary, through_message_id, updated_at FROM chat_summaries WHERE conversation_id = ?1",
            params![conversation_id],
            |row| Ok(ChatSummaryRecord {
                conversation_id: row.get(0)?,
                summary: row.get(1)?,
                through_message_id: row.get(2)?,
                updated_at: row.get(3)?,
            }),
        ).optional().map_err(|error| error.to_string())
    }

    pub fn upsert_summary(&self, summary: ChatSummaryRecord) -> Result<ChatSummaryRecord, String> {
        self.conn
            .execute(
                r#"
            INSERT INTO chat_summaries (conversation_id, summary, through_message_id, updated_at)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(conversation_id) DO UPDATE SET
                summary = excluded.summary,
                through_message_id = excluded.through_message_id,
                updated_at = excluded.updated_at
            "#,
                params![
                    summary.conversation_id,
                    summary.summary,
                    summary.through_message_id,
                    summary.updated_at
                ],
            )
            .map_err(|error| error.to_string())?;
        Ok(summary)
    }

    pub fn migrate_legacy(&mut self, payload: LegacyChatMigrationPayload) -> Result<usize, String> {
        if self.conversation_count()? > 0 {
            return Ok(0);
        }
        crate::commands::design_memory::ensure_memory_schema(&self.conn)?;
        let tx = self.conn.transaction().map_err(|error| error.to_string())?;
        let mut restored = false;
        let mut inserted = 0usize;
        let default_model = payload.default_model.unwrap_or_default();
        for value in payload.conversations {
            let id = value.get("id").and_then(Value::as_str).unwrap_or("").trim();
            if id.is_empty() {
                continue;
            }
            let title = value
                .get("title")
                .and_then(Value::as_str)
                .unwrap_or("旧 Agent 对话");
            let model = if default_model.trim().is_empty() {
                value
                    .get("model")
                    .and_then(Value::as_str)
                    .or_else(|| value.get("provider").and_then(Value::as_str))
                    .unwrap_or("default")
            } else {
                default_model.as_str()
            };
            let created_at = value
                .get("createdAt")
                .and_then(Value::as_i64)
                .unwrap_or_else(crate::current_time_millis);
            let updated_at = value
                .get("updatedAt")
                .and_then(Value::as_i64)
                .unwrap_or(created_at);
            let created = tx.execute(
                "INSERT OR IGNORE INTO chat_conversations (id, title, model, created_at, updated_at, archived) VALUES (?1, ?2, ?3, ?4, ?5, 0)",
                params![id, title, model, created_at, updated_at],
            ).map_err(|error| error.to_string())?;
            if created > 0 && Self::supports_memory_id(id) {
                restored |= crate::commands::design_memory::restore_source_in_transaction(
                    &tx,
                    "chat-design",
                    id,
                )?;
            }
            if let Some(messages) = value.get("messages").and_then(Value::as_array) {
                for (index, message) in messages.iter().enumerate() {
                    let message_id = message
                        .get("id")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                        .unwrap_or_else(|| format!("legacy-{id}-{index}"));
                    let role = match message
                        .get("role")
                        .and_then(Value::as_str)
                        .unwrap_or("agent")
                    {
                        "agent" => "assistant",
                        other => other,
                    };
                    let content = message.get("content").and_then(Value::as_str).unwrap_or("");
                    let status = message
                        .get("status")
                        .and_then(Value::as_str)
                        .unwrap_or("completed");
                    let created = message
                        .get("timestamp")
                        .and_then(Value::as_i64)
                        .unwrap_or(created_at + index as i64);
                    tx.execute(
                        "INSERT OR IGNORE INTO chat_messages (id, conversation_id, role, content, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                        params![message_id, id, role, content, status, created],
                    ).map_err(|error| error.to_string())?;
                }
            }
            inserted += 1;
        }
        tx.commit().map_err(|error| error.to_string())?;
        self.notify_design_source_changed(restored);
        Ok(inserted)
    }

    fn list_attachments(&self, message_id: &str) -> Result<Vec<ChatAttachmentRecord>, String> {
        let mut stmt = self.conn.prepare(
            "SELECT id, message_id, type, path, thumbnail_path, mime_type, metadata_json, created_at FROM chat_attachments WHERE message_id = ?1 ORDER BY created_at ASC"
        ).map_err(|error| error.to_string())?;
        let rows = stmt
            .query_map(params![message_id], |row| {
                Ok(ChatAttachmentRecord {
                    id: row.get(0)?,
                    message_id: row.get(1)?,
                    attachment_type: row.get(2)?,
                    path: row.get(3)?,
                    thumbnail_path: row.get(4)?,
                    mime_type: row.get(5)?,
                    metadata_json: row.get(6)?,
                    created_at: row.get(7)?,
                })
            })
            .map_err(|error| error.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())
    }

    fn list_tool_calls(&self, message_id: &str) -> Result<Vec<ChatToolCallRecord>, String> {
        let mut stmt = self.conn.prepare(
            "SELECT id, message_id, tool_name, arguments_json, result_json, status, created_at, completed_at FROM chat_tool_calls WHERE message_id = ?1 ORDER BY created_at ASC"
        ).map_err(|error| error.to_string())?;
        let rows = stmt
            .query_map(params![message_id], |row| {
                Ok(ChatToolCallRecord {
                    id: row.get(0)?,
                    message_id: row.get(1)?,
                    tool_name: row.get(2)?,
                    arguments_json: row.get(3)?,
                    result_json: row.get(4)?,
                    status: row.get(5)?,
                    created_at: row.get(6)?,
                    completed_at: row.get(7)?,
                })
            })
            .map_err(|error| error.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repository() -> ChatRepository {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        crate::db::schema::ensure_schema(&conn).expect("create schema");
        ChatRepository::new(conn)
    }

    fn conversation() -> ChatConversationRecord {
        ChatConversationRecord {
            id: "conversation-1".to_string(),
            title: "通用聊天".to_string(),
            model: "gpt-test".to_string(),
            created_at: 1,
            updated_at: 1,
            archived: false,
        }
    }

    fn message(id: &str, created_at: i64) -> ChatMessageRecord {
        ChatMessageRecord {
            id: id.to_string(),
            conversation_id: "conversation-1".to_string(),
            role: "assistant".to_string(),
            content: format!("message {id}"),
            status: "completed".to_string(),
            created_at,
            reasoning: None,
            reasoning_status: None,
            thinking_steps: None,
            generation_started_at: None,
            generation_completed_at: None,
            reasoning_started_at: None,
            reasoning_completed_at: None,
            usage: None,
            attachments: Vec::new(),
            tool_calls: Vec::new(),
        }
    }

    #[test]
    fn stores_and_pages_messages_with_attachments_and_tool_calls() {
        let repository = repository();
        repository
            .upsert_conversation(conversation())
            .expect("save conversation");
        repository
            .upsert_message(message("message-1", 10))
            .expect("save first message");
        repository
            .upsert_message(message("message-2", 20))
            .expect("save second message");
        repository
            .upsert_attachment(ChatAttachmentRecord {
                id: "attachment-1".to_string(),
                message_id: "message-2".to_string(),
                attachment_type: "image".to_string(),
                path: "C:/images/example.png".to_string(),
                thumbnail_path: None,
                mime_type: Some("image/png".to_string()),
                metadata_json: None,
                created_at: 21,
            })
            .expect("save attachment");
        repository
            .upsert_tool_call(ChatToolCallRecord {
                id: "tool-1".to_string(),
                message_id: "message-2".to_string(),
                tool_name: "search_assets".to_string(),
                arguments_json: "{\"query\":\"car\"}".to_string(),
                result_json: Some("{\"items\":[]}".to_string()),
                status: "completed".to_string(),
                created_at: 22,
                completed_at: Some(23),
            })
            .expect("save tool call");

        let page = repository
            .list_messages(ChatMessageListOptions {
                conversation_id: "conversation-1".to_string(),
                before_created_at: None,
                before_id: None,
                limit: Some(1),
            })
            .expect("load page");
        assert!(page.has_more);
        assert_eq!(page.messages.len(), 1);
        assert_eq!(page.messages[0].id, "message-2");
        assert_eq!(page.messages[0].attachments.len(), 1);
        assert_eq!(page.messages[0].tool_calls.len(), 1);
        assert_eq!(page.next_before_created_at, Some(20));
    }

    #[test]
    fn keyset_cursor_keeps_same_timestamp_messages_between_pages() {
        let repo = repository();
        repo.upsert_conversation(conversation()).unwrap();
        for id in ["message-a", "message-b", "message-c"] {
            repo.upsert_message(message(id, 100)).unwrap();
        }
        repo.upsert_message(message("message-before", 99)).unwrap();
        let first = repo
            .list_messages(ChatMessageListOptions {
                conversation_id: "conversation-1".into(),
                before_created_at: None,
                before_id: None,
                limit: Some(2),
            })
            .unwrap();
        assert!(first.has_more);
        assert_eq!(
            first
                .messages
                .iter()
                .map(|m| m.id.as_str())
                .collect::<Vec<_>>(),
            ["message-b", "message-c"]
        );
        assert_eq!(first.next_before_created_at, Some(100));
        assert_eq!(first.next_before_id.as_deref(), Some("message-b"));
        let second = repo
            .list_messages(ChatMessageListOptions {
                conversation_id: "conversation-1".into(),
                before_created_at: first.next_before_created_at,
                before_id: first.next_before_id,
                limit: Some(2),
            })
            .unwrap();
        assert!(!second.has_more);
        assert_eq!(
            second
                .messages
                .iter()
                .map(|m| m.id.as_str())
                .collect::<Vec<_>>(),
            ["message-before", "message-a"]
        );
        assert_eq!(second.next_before_created_at, Some(99));
        assert_eq!(second.next_before_id.as_deref(), Some("message-before"));
    }

    #[test]
    fn keyset_cursor_exhausts_many_tied_messages_without_skips_duplicates_or_cross_conversation_rows(
    ) {
        let repo = repository();
        repo.upsert_conversation(conversation()).unwrap();
        let mut other = conversation();
        other.id = "other".into();
        repo.upsert_conversation(other).unwrap();
        let expected = (0..207)
            .map(|i| format!("message-{i:03}"))
            .collect::<Vec<_>>();
        for (i, id) in expected.iter().enumerate() {
            repo.upsert_message(message(id, 100 + i as i64 / 103))
                .unwrap();
        }
        let mut foreign = message("foreign", 101);
        foreign.conversation_id = "other".into();
        repo.upsert_message(foreign).unwrap();
        let mut seen = Vec::new();
        let mut before_created_at = None;
        let mut before_id = None;
        for _ in 0..32 {
            let page = repo
                .list_messages(ChatMessageListOptions {
                    conversation_id: "conversation-1".into(),
                    before_created_at,
                    before_id,
                    limit: Some(17),
                })
                .unwrap();
            assert!(page
                .messages
                .windows(2)
                .all(|m| (m[0].created_at, &m[0].id) < (m[1].created_at, &m[1].id)));
            before_created_at = page.next_before_created_at;
            before_id = page.next_before_id;
            seen.extend(page.messages.into_iter().map(|m| m.id));
            if !page.has_more {
                break;
            }
        }
        seen.sort();
        assert_eq!(seen, expected);
        let empty = repo
            .list_messages(ChatMessageListOptions {
                conversation_id: "conversation-1".into(),
                before_created_at,
                before_id,
                limit: Some(17),
            })
            .unwrap();
        assert!(empty.messages.is_empty());
        assert!(!empty.has_more);
        assert_eq!(empty.next_before_created_at, None);
        assert_eq!(empty.next_before_id, None);
        let json = serde_json::to_value(empty).unwrap();
        assert!(json.get("nextBeforeId").is_none());
    }

    #[test]
    fn keyset_cursor_keeps_legacy_timestamp_only_semantics_and_camel_case_contract() {
        let repo = repository();
        repo.upsert_conversation(conversation()).unwrap();
        for id in ["a", "b"] {
            repo.upsert_message(message(id, 100)).unwrap();
        }
        repo.upsert_message(message("older", 99)).unwrap();
        let options: ChatMessageListOptions = serde_json::from_value(serde_json::json!({
            "conversationId": "conversation-1", "beforeCreatedAt": 100, "limit": 5,
        }))
        .unwrap();
        assert_eq!(options.before_id, None);
        let page = repo.list_messages(options).unwrap();
        assert_eq!(
            page.messages
                .iter()
                .map(|m| m.id.as_str())
                .collect::<Vec<_>>(),
            ["older"]
        );
        let options: ChatMessageListOptions = serde_json::from_value(serde_json::json!({
            "conversationId": "conversation-1", "beforeCreatedAt": 100, "beforeId": "b", "limit": 5,
        }))
        .unwrap();
        let page = repo.list_messages(options).unwrap();
        assert_eq!(
            page.messages
                .iter()
                .map(|m| m.id.as_str())
                .collect::<Vec<_>>(),
            ["older", "a"]
        );
        let json = serde_json::to_value(page).unwrap();
        assert_eq!(json["nextBeforeCreatedAt"], 99);
        assert_eq!(json["nextBeforeId"], "older");
        let options: ChatMessageListOptions = serde_json::from_value(serde_json::json!({
            "conversationId": "conversation-1", "beforeCreatedAt": 100, "beforeId": null,
        }))
        .unwrap();
        assert_eq!(options.before_id, None);
    }

    #[test]
    fn persists_reasoning_summary_steps_timing_and_usage_without_affecting_old_messages() {
        let repository = repository();
        repository
            .upsert_conversation(conversation())
            .expect("save conversation");
        let mut rich_message = message("message-rich", 30);
        rich_message.reasoning = Some("公开推理摘要".to_string());
        rich_message.reasoning_status = Some("completed".to_string());
        rich_message.thinking_steps = Some(vec![serde_json::json!({
            "id": "step-1",
            "type": "reasoning",
            "title": "分析问题",
            "status": "completed",
            "startedAt": 30,
            "completedAt": 35
        })]);
        rich_message.generation_started_at = Some(30);
        rich_message.generation_completed_at = Some(40);
        rich_message.reasoning_started_at = Some(30);
        rich_message.reasoning_completed_at = Some(35);
        rich_message.usage = Some(serde_json::json!({ "outputTokens": 12 }));
        repository
            .upsert_message(rich_message)
            .expect("save message metadata");
        repository
            .upsert_message(message("message-old", 20))
            .expect("save legacy-compatible message");

        let page = repository
            .list_messages(ChatMessageListOptions {
                conversation_id: "conversation-1".to_string(),
                before_created_at: None,
                before_id: None,
                limit: Some(10),
            })
            .expect("load messages");
        let restored = page
            .messages
            .iter()
            .find(|value| value.id == "message-rich")
            .expect("rich message exists");
        assert_eq!(restored.reasoning.as_deref(), Some("公开推理摘要"));
        assert_eq!(restored.thinking_steps.as_ref().map(Vec::len), Some(1));
        assert_eq!(restored.generation_completed_at, Some(40));
        assert_eq!(
            restored.usage,
            Some(serde_json::json!({ "outputTokens": 12 }))
        );
        let old = page
            .messages
            .iter()
            .find(|value| value.id == "message-old")
            .expect("old message exists");
        assert!(old.reasoning.is_none());
        assert!(old.thinking_steps.is_none());
    }

    #[test]
    fn searches_conversations_and_persists_summaries() {
        let repository = repository();
        repository
            .upsert_conversation(conversation())
            .expect("save conversation");
        let matches = repository
            .list_conversations(ChatConversationListOptions {
                search: Some("通用".to_string()),
                archived: Some(false),
                limit: Some(10),
                offset: Some(0),
            })
            .expect("search conversations");
        assert_eq!(matches.len(), 1);

        repository
            .upsert_summary(ChatSummaryRecord {
                conversation_id: "conversation-1".to_string(),
                summary: "用户偏好简洁回答".to_string(),
                through_message_id: Some("message-8".to_string()),
                updated_at: 30,
            })
            .expect("save summary");
        let summary = repository
            .get_summary("conversation-1")
            .expect("load summary")
            .expect("summary exists");
        assert_eq!(summary.through_message_id.as_deref(), Some("message-8"));
    }
}

#[cfg(test)]
mod design_memory_lifecycle_tests {
    use super::*;
    use crate::commands::design_memory::ensure_memory_schema;

    fn repository() -> ChatRepository {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        crate::db::schema::ensure_schema(&conn).unwrap();
        ChatRepository::new(conn)
    }

    fn conversation(id: &str) -> ChatConversationRecord {
        ChatConversationRecord {
            id: id.into(),
            title: "synthetic".into(),
            model: "test".into(),
            created_at: 1,
            updated_at: 1,
            archived: false,
        }
    }

    fn seed_memory(conn: &Connection, id: &str) {
        ensure_memory_schema(conn).unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO design_memory_sources(kind,source_id) VALUES ('chat-design',?1)",
            params![id],
        )
        .unwrap();
        conn.execute("INSERT INTO design_memory_records(id,kind,source_id,scope,title,content,tags_json,evidence,attribution_json,created_at,updated_at) VALUES (?1,'chat-design',?2,'global','synthetic','synthetic memory','[]','synthetic','{}',1,1)", params![format!("memory-{id}"), id]).unwrap();
    }

    fn source(conn: &Connection, id: &str) -> Option<(i64, bool)> {
        conn.query_row("SELECT revision,deleted FROM design_memory_sources WHERE kind='chat-design' AND source_id=?1", params![id], |r| Ok((r.get(0)?,r.get(1)?))).optional().unwrap()
    }

    fn memories(conn: &Connection, id: &str) -> i64 {
        conn.query_row(
            "SELECT COUNT(*) FROM design_memory_records WHERE kind='chat-design' AND source_id=?1",
            params![id],
            |r| r.get(0),
        )
        .unwrap()
    }

    #[test]
    fn design_memory_hard_delete_cascades_originals_and_invalidates_only_its_memory() {
        let repo = repository();
        for id in ["a", "b"] {
            repo.upsert_conversation(conversation(id)).unwrap();
            seed_memory(&repo.conn, id);
        }
        repo.conn.execute_batch("INSERT INTO chat_messages(id,conversation_id,role,content,status,created_at) VALUES ('message','a','user','synthetic','completed',1);
            INSERT INTO chat_attachments(id,message_id,type,path,created_at) VALUES ('attachment','message','image','synthetic',1);
            INSERT INTO chat_tool_calls(id,message_id,tool_name,arguments_json,status,created_at) VALUES ('tool','message','test','{}','completed',1);
            INSERT INTO chat_summaries(conversation_id,summary,updated_at) VALUES ('a','synthetic',1);").unwrap();
        assert!(repo.delete_conversation("a").unwrap());
        assert_eq!(repo.conversation_count().unwrap(), 1);
        for table in [
            "chat_messages",
            "chat_attachments",
            "chat_tool_calls",
            "chat_summaries",
        ] {
            let count: i64 = repo
                .conn
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
                .unwrap();
            assert_eq!(count, 0, "{table} should cascade");
        }
        assert_eq!(source(&repo.conn, "a"), Some((1, true)));
        assert_eq!(memories(&repo.conn, "a"), 0);
        assert_eq!(memories(&repo.conn, "b"), 1);
        assert_eq!(source(&repo.conn, "b"), Some((0, false)));
    }

    #[test]
    fn design_memory_delete_without_prior_memory_blocks_late_jobs_and_noops_do_not_mutate() {
        let repo = repository();
        repo.conn
            .execute(
                "INSERT INTO chat_conversations VALUES ('a','synthetic','test',1,1,0)",
                [],
            )
            .unwrap();
        assert!(repo.delete_conversation("a").unwrap());
        assert_eq!(source(&repo.conn, "a"), Some((1, true)));
        assert!(!repo.delete_conversation("a").unwrap());
        assert!(!repo.delete_conversation("missing").unwrap());
        assert_eq!(source(&repo.conn, "a"), Some((1, true)));
        assert_eq!(source(&repo.conn, "missing"), None);
    }

    #[test]
    fn design_memory_original_delete_failure_keeps_memory() {
        let repo = repository();
        repo.upsert_conversation(conversation("a")).unwrap();
        seed_memory(&repo.conn, "a");
        repo.conn.execute_batch("CREATE TRIGGER fail_original BEFORE DELETE ON chat_conversations BEGIN SELECT RAISE(ABORT,'synthetic original failure'); END;").unwrap();
        assert!(repo.delete_conversation("a").is_err());
        assert_eq!(repo.conversation_count().unwrap(), 1);
        assert_eq!(memories(&repo.conn, "a"), 1);
        assert_eq!(source(&repo.conn, "a"), Some((0, false)));
    }

    #[test]
    fn design_memory_invalidation_failure_rolls_hard_delete_and_cascades_back() {
        let repo = repository();
        repo.upsert_conversation(conversation("a")).unwrap();
        seed_memory(&repo.conn, "a");
        repo.conn.execute_batch("INSERT INTO chat_messages(id,conversation_id,role,content,status,created_at) VALUES ('message','a','user','synthetic','completed',1);
            CREATE TRIGGER fail_memory BEFORE DELETE ON design_memory_records BEGIN SELECT RAISE(ABORT,'synthetic memory failure'); END;").unwrap();
        assert!(repo.delete_conversation("a").is_err());
        assert_eq!(repo.conversation_count().unwrap(), 1);
        let count: i64 = repo
            .conn
            .query_row("SELECT COUNT(*) FROM chat_messages", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
        assert_eq!(memories(&repo.conn, "a"), 1);
        assert_eq!(source(&repo.conn, "a"), Some((0, false)));
    }

    #[test]
    fn design_memory_failed_commit_rolls_hard_delete_and_invalidation_back() {
        let repo = repository();
        repo.upsert_conversation(conversation("a")).unwrap();
        seed_memory(&repo.conn, "a");
        repo.conn.execute_batch("CREATE TABLE synthetic_parent(id INTEGER PRIMARY KEY);
            CREATE TABLE synthetic_commit_guard(id INTEGER REFERENCES synthetic_parent(id) DEFERRABLE INITIALLY DEFERRED);
            CREATE TRIGGER fail_commit AFTER DELETE ON chat_conversations BEGIN INSERT INTO synthetic_commit_guard VALUES (1); END;").unwrap();
        assert!(repo.delete_conversation("a").is_err());
        assert_eq!(repo.conversation_count().unwrap(), 1);
        assert_eq!(memories(&repo.conn, "a"), 1);
        assert_eq!(source(&repo.conn, "a"), Some((0, false)));
        assert!(repo.conn.is_autocommit());
    }

    #[test]
    fn design_memory_recreate_allows_new_jobs_but_never_restores_old_memory_or_user_tombstones() {
        let repo = repository();
        repo.upsert_conversation(conversation("a")).unwrap();
        seed_memory(&repo.conn, "a");
        repo.conn.execute("INSERT INTO design_memory_tombstones(id,kind,source_id) VALUES ('user-deleted','chat-design','a')", []).unwrap();
        repo.delete_conversation("a").unwrap();
        repo.upsert_conversation(conversation("a")).unwrap();
        assert_eq!(source(&repo.conn, "a"), Some((2, false)));
        assert_eq!(memories(&repo.conn, "a"), 0);
        let count: i64 = repo
            .conn
            .query_row("SELECT COUNT(*) FROM design_memory_tombstones", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(count, 1);
        let mut archived = conversation("a");
        archived.archived = true;
        repo.upsert_conversation(archived).unwrap();
        assert_eq!(source(&repo.conn, "a"), Some((2, false)));
    }

    #[test]
    fn design_memory_restore_failure_rolls_conversation_creation_back() {
        let repo = repository();
        repo.upsert_conversation(conversation("a")).unwrap();
        repo.delete_conversation("a").unwrap();
        repo.conn.execute_batch("CREATE TRIGGER fail_restore BEFORE UPDATE OF deleted ON design_memory_sources WHEN NEW.deleted=0 BEGIN SELECT RAISE(ABORT,'synthetic restore failure'); END;").unwrap();
        assert!(repo.upsert_conversation(conversation("a")).is_err());
        assert_eq!(repo.conversation_count().unwrap(), 0);
        assert_eq!(source(&repo.conn, "a"), Some((1, true)));
    }

    #[test]
    fn design_memory_legacy_reimport_restores_source_without_old_memory() {
        let mut repo = repository();
        repo.upsert_conversation(conversation("a")).unwrap();
        seed_memory(&repo.conn, "a");
        repo.delete_conversation("a").unwrap();
        assert_eq!(repo.migrate_legacy(LegacyChatMigrationPayload {
            conversations: vec![serde_json::json!({"id":"a","title":"synthetic","messages":[{"id":"legacy","role":"user","content":"synthetic"}]})],
            default_model: Some("test".into()),
        }).unwrap(), 1);
        assert_eq!(source(&repo.conn, "a"), Some((2, false)));
        assert_eq!(memories(&repo.conn, "a"), 0);
    }

    #[test]
    fn design_memory_failed_legacy_reimport_rolls_source_and_conversation_back() {
        let mut repo = repository();
        repo.upsert_conversation(conversation("a")).unwrap();
        repo.delete_conversation("a").unwrap();
        repo.conn.execute_batch("CREATE TRIGGER fail_legacy BEFORE INSERT ON chat_messages BEGIN SELECT RAISE(ABORT,'synthetic message failure'); END;").unwrap();
        assert!(repo
            .migrate_legacy(LegacyChatMigrationPayload {
                conversations: vec![
                    serde_json::json!({"id":"a","messages":[{"role":"user","content":"synthetic"}]})
                ],
                default_model: Some("test".into()),
            })
            .is_err());
        assert_eq!(repo.conversation_count().unwrap(), 0);
        assert_eq!(source(&repo.conn, "a"), Some((1, true)));
        assert!(repo.conn.is_autocommit());
    }
}
