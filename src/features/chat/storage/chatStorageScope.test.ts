import { describe, expect, it, vi } from 'vitest';
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
import { invoke } from '@tauri-apps/api/core';
import { deleteRhinoConversationPreviews } from './rhinoStepPreviews';
import { chatConversationInScope, deleteChatConversation, deleteChatConversations } from './chatStorage';
vi.mock('./rhinoStepPreviews', () => ({deleteRhinoConversationPreviews: vi.fn(async()=>{})}));
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

it('purges only the thumbnails of successfully deleted chats, including batch deletion',async()=>{
  vi.mocked(invoke).mockResolvedValueOnce(false).mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('busy'));
  await expect(deleteChatConversations(['kept','removed','busy'])).resolves.toEqual(['removed']);
  expect(vi.mocked(deleteRhinoConversationPreviews).mock.calls).toEqual([['removed']]);
  vi.mocked(invoke).mockResolvedValueOnce(true);vi.mocked(deleteRhinoConversationPreviews).mockRejectedValueOnce(new Error('unavailable'));
  await expect(deleteChatConversation('another')).resolves.toBe(true);
});