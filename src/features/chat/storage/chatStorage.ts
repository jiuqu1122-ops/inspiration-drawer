import { invoke } from '@tauri-apps/api/core';
import type {
  ChatAttachment,
  ChatConversation,
  ChatMessage,
  ChatMessagePage,
  ChatSummary,
  ChatToolCall,
} from '../model/chatTypes';

const LEGACY_CONVERSATIONS_KEY = 'drawer_agent_conversations_v1';
const LEGACY_MIGRATION_MARKER = 'drawer_chat_sqlite_migration_v1';
const ACTIVE_CHAT_KEY = 'drawer_chat_active_conversation_v1';

export const listChatConversations = (search = '', limit = 100, offset = 0) => (
  invoke<ChatConversation[]>('chat_list_conversations', {
    options: { search, archived: false, limit, offset },
  })
);

export const countChatConversations = () => invoke<number>('chat_conversation_count');

export const upsertChatConversation = (conversation: ChatConversation) => (
  invoke<ChatConversation>('chat_upsert_conversation', { conversation })
);

export const deleteChatConversation = (id: string) => (
  invoke<boolean>('chat_delete_conversation', { id })
);

export const listChatMessages = (
  conversationId: string,
  options: { beforeCreatedAt?: number; limit?: number } = {},
) => invoke<ChatMessagePage>('chat_list_messages', {
  options: {
    conversationId,
    beforeCreatedAt: options.beforeCreatedAt,
    limit: options.limit || 50,
  },
});

export const upsertChatMessage = (message: ChatMessage) => (
  invoke<ChatMessage>('chat_upsert_message', { message })
);

export const upsertChatAttachment = (attachment: ChatAttachment) => (
  invoke<ChatAttachment>('chat_upsert_attachment', { attachment })
);

export const upsertChatToolCall = (call: ChatToolCall) => (
  invoke<ChatToolCall>('chat_upsert_tool_call', { call })
);

export const getChatSummary = (conversationId: string) => (
  invoke<ChatSummary | null>('chat_get_summary', { conversationId })
);

export const upsertChatSummary = (summary: ChatSummary) => (
  invoke<ChatSummary>('chat_upsert_summary', { summary })
);

export const readActiveChatConversationId = () => localStorage.getItem(ACTIVE_CHAT_KEY) || '';
export const writeActiveChatConversationId = (id: string) => localStorage.setItem(ACTIVE_CHAT_KEY, id);

export const migrateLegacyAgentConversations = async (defaultModel = '') => {
  if (localStorage.getItem(LEGACY_MIGRATION_MARKER) === 'completed') return 0;
  if (await countChatConversations() > 0) {
    localStorage.setItem(LEGACY_MIGRATION_MARKER, 'completed');
    return 0;
  }
  const raw = localStorage.getItem(LEGACY_CONVERSATIONS_KEY);
  if (!raw) {
    localStorage.setItem(LEGACY_MIGRATION_MARKER, 'completed');
    return 0;
  }
  let conversations: unknown;
  try { conversations = JSON.parse(raw); } catch (_) { return 0; }
  if (!Array.isArray(conversations)) return 0;
  const migrated = await invoke<number>('chat_migrate_legacy', { payload: { conversations, defaultModel } });
  localStorage.setItem(LEGACY_MIGRATION_MARKER, 'completed');
  return migrated;
};
