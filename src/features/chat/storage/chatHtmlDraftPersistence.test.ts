import { expect, it, vi } from 'vitest';
const invoke = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
import { upsertChatMessage } from './chatStorage';
import type { ChatMessage } from '../model/chatTypes';
it('never persists or transmits ephemeral streamed tool-argument previews', async () => {
  const message: ChatMessage = { id: 'm', conversationId: 'c', role: 'assistant', content: '生成页面', status: 'streaming', createdAt: 1, attachments: [], toolCalls: [], htmlDrafts: [{ id: 'draft', name: 'p.html', source: '<html>ephemeral</html>' }] };
  await upsertChatMessage(message);
  expect(invoke.mock.calls[0]).toEqual(['chat_upsert_message', { message: { id: 'm', conversationId: 'c', role: 'assistant', content: '生成页面', status: 'streaming', createdAt: 1, attachments: [], toolCalls: [] } }]);
  expect(message.htmlDrafts).toHaveLength(1);
});
