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
    #[serde(default)]
    pub attachments: Vec<ChatAttachmentRecord>,
    #[serde(default)]
    pub tool_calls: Vec<ChatToolCallRecord>,
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
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessagePage {
    pub messages: Vec<ChatMessageRecord>,
    pub has_more: bool,
    pub next_before_created_at: Option<i64>,
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
}

impl ChatRepository {
    pub fn new(conn: Connection) -> Self {
        Self { conn }
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
        self.conn
            .execute(
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
        Ok(conversation)
    }

    pub fn delete_conversation(&self, id: &str) -> Result<bool, String> {
        self.conn
            .execute("DELETE FROM chat_conversations WHERE id = ?1", params![id])
            .map(|count| count > 0)
            .map_err(|error| error.to_string())
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
            SELECT id, conversation_id, role, content, status, created_at
            FROM chat_messages
            WHERE conversation_id = ?1 AND created_at < ?2
            ORDER BY created_at DESC, id DESC
            LIMIT ?3
            "#,
            )
            .map_err(|error| error.to_string())?;
        let rows = stmt
            .query_map(
                params![options.conversation_id, before, fetch_limit],
                |row| {
                    Ok(ChatMessageRecord {
                        id: row.get(0)?,
                        conversation_id: row.get(1)?,
                        role: row.get(2)?,
                        content: row.get(3)?,
                        status: row.get(4)?,
                        created_at: row.get(5)?,
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
        Ok(ChatMessagePage {
            messages,
            has_more,
            next_before_created_at,
        })
    }

    pub fn upsert_message(&self, message: ChatMessageRecord) -> Result<ChatMessageRecord, String> {
        self.conn
            .execute(
                r#"
            INSERT INTO chat_messages (id, conversation_id, role, content, status, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(id) DO UPDATE SET
                content = excluded.content,
                status = excluded.status
            "#,
                params![
                    message.id,
                    message.conversation_id,
                    message.role,
                    message.content,
                    message.status,
                    message.created_at
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
        let tx = self.conn.transaction().map_err(|error| error.to_string())?;
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
            tx.execute(
                "INSERT OR IGNORE INTO chat_conversations (id, title, model, created_at, updated_at, archived) VALUES (?1, ?2, ?3, ?4, ?5, 0)",
                params![id, title, model, created_at, updated_at],
            ).map_err(|error| error.to_string())?;
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
