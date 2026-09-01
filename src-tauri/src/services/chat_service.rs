use crate::db::connection::open_connection;
use crate::repositories::chat_repository::*;

fn repository(app_handle: &tauri::AppHandle) -> Result<ChatRepository, String> {
    Ok(ChatRepository::new(open_connection(app_handle)?))
}

pub fn conversation_count(app_handle: tauri::AppHandle) -> Result<i64, String> {
    repository(&app_handle)?.conversation_count()
}

pub fn list_conversations(
    app_handle: tauri::AppHandle,
    options: ChatConversationListOptions,
) -> Result<Vec<ChatConversationRecord>, String> {
    repository(&app_handle)?.list_conversations(options)
}

pub fn upsert_conversation(
    app_handle: tauri::AppHandle,
    conversation: ChatConversationRecord,
) -> Result<ChatConversationRecord, String> {
    repository(&app_handle)?.upsert_conversation(conversation)
}

pub fn delete_conversation(app_handle: tauri::AppHandle, id: String) -> Result<bool, String> {
    repository(&app_handle)?.delete_conversation(&id)
}

pub fn list_messages(
    app_handle: tauri::AppHandle,
    options: ChatMessageListOptions,
) -> Result<ChatMessagePage, String> {
    repository(&app_handle)?.list_messages(options)
}

pub fn upsert_message(
    app_handle: tauri::AppHandle,
    message: ChatMessageRecord,
) -> Result<ChatMessageRecord, String> {
    repository(&app_handle)?.upsert_message(message)
}

pub fn upsert_attachment(
    app_handle: tauri::AppHandle,
    attachment: ChatAttachmentRecord,
) -> Result<ChatAttachmentRecord, String> {
    repository(&app_handle)?.upsert_attachment(attachment)
}

pub fn upsert_tool_call(
    app_handle: tauri::AppHandle,
    call: ChatToolCallRecord,
) -> Result<ChatToolCallRecord, String> {
    repository(&app_handle)?.upsert_tool_call(call)
}

pub fn get_summary(
    app_handle: tauri::AppHandle,
    conversation_id: String,
) -> Result<Option<ChatSummaryRecord>, String> {
    repository(&app_handle)?.get_summary(&conversation_id)
}

pub fn upsert_summary(
    app_handle: tauri::AppHandle,
    summary: ChatSummaryRecord,
) -> Result<ChatSummaryRecord, String> {
    repository(&app_handle)?.upsert_summary(summary)
}

pub fn migrate_legacy(
    app_handle: tauri::AppHandle,
    payload: LegacyChatMigrationPayload,
) -> Result<usize, String> {
    repository(&app_handle)?.migrate_legacy(payload)
}
