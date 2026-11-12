import { describe, expect, it, vi } from 'vitest';
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
import { chatConversationInScope } from './chatStorage';
import type { ChatConversation } from '../model/chatTypes';

const conversation = (id: string, title: string): ChatConversation => ({
  id, title, model: 'model', createdAt: 1, updatedAt: 1, archived: false,
});

describe('chat conversation scope isolation', () => {
  it('keeps Rhino conversations out of desktop history and vice versa', () => {
    const desktop = conversation('chat-conversation-desktop', 'Desktop discussion');
    const rhino = conversation('rhino-chat-conversation-rhino', 'Rhino 对话');
    expect(chatConversationInScope(desktop, 'desktop')).toBe(true);
    expect(chatConversationInScope(desktop, 'rhino')).toBe(false);
    expect(chatConversationInScope(rhino, 'desktop')).toBe(false);
    expect(chatConversationInScope(rhino, 'rhino')).toBe(true);
  });

  it('classifies legacy shared Rhino chats by their title to keep them out of desktop Chat', () => {
    const legacyRhino = conversation('chat-conversation-legacy', 'Rhino 对话');
    expect(chatConversationInScope(legacyRhino, 'desktop')).toBe(false);
    expect(chatConversationInScope(legacyRhino, 'rhino')).toBe(true);
  });
});
