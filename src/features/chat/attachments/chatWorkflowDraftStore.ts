import type { PendingChatAttachment } from '../model/chatTypes';

const keyFor = (conversationId: string) => `inspiration-chat-workflow-draft:${conversationId}`;

export const loadChatWorkflowDraft = (conversationId: string): PendingChatAttachment[] => {
  if (!conversationId || typeof localStorage === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(keyFor(conversationId)) || '[]');
    return Array.isArray(parsed)
      ? parsed.filter(item => item && item.type === 'workflow' && typeof item.metadataJson === 'string')
      : [];
  } catch (_) {
    return [];
  }
};

export const saveChatWorkflowDraft = (conversationId: string, attachments: PendingChatAttachment[]) => {
  if (!conversationId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(keyFor(conversationId), JSON.stringify(attachments.filter(item => item.type === 'workflow')));
  } catch (_) {
    // A full localStorage should not prevent a Chat message from being sent.
  }
};

export const clearChatWorkflowDraft = (conversationId: string) => {
  if (!conversationId || typeof localStorage === 'undefined') return;
  localStorage.removeItem(keyFor(conversationId));
};
