import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatThinkingPanel } from '../components/ChatThinkingPanel';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

import { buildChatContext } from './chatContextBuilder';
import { MAX_INLINE_VISION_BYTES } from './chatRequestSize';
import { requestChatCompletion } from '../runtime/chatStream';
import { createStreamingAssistantState, upsertChatThinkingStep } from '../runtime/chatThinkingRuntime';
import type { ChatAttachment, ChatMessage } from '../model/chatTypes';
import { designMemory, DesignMemoryClient, type DesignMemorySnapshot } from '../../designMemory/storage';
import { recallDesignMemoryForTurn, isDesignMemoryRecallTask } from '../../designMemory/recall';
import { buildDrawerImageMemory, isDesignMemoryTask, rememberExplicitChatDesign } from '../../designMemory/sources';
import { describeDesignMemoryTurn, designMemoryKindsInMessages, getDesignMemoryTurnReport, validateDesignMemoryMessages } from '../../designMemory/context';
import { DEFAULT_DESIGN_MEMORY_SETTINGS, memorySwitch, type DesignMemoryDraft, type DesignMemoryKind, type DesignMemoryRecord, type DesignMemoryTransport } from '../../designMemory/types';
import type { InspirationProfile } from '../../appAgent/inspirationMemory/types';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const message = (content: string, id = 'fixture-current'): ChatMessage => ({
  id, conversationId: id === 'fixture-old-user' ? 'fixture-old-chat' : 'fixture-current-chat',
  role: 'user', content, status: 'completed', createdAt: 1, attachments: [], toolCalls: [],
});
const imageDraft = () => buildDrawerImageMemory({
  itemId: 'fixture-image', analyzedAt: '2026-10-30T00:00:00Z', summary: '合成金属磨砂耳机图片分析',
} as InspirationProfile, { title: '合成图片来源' })!;

// Entirely in-memory transport: deterministic candidates, NOT a replacement test
// of Rust ranking/SQLite. No original-source, filesystem, or real model access.
const fixture = () => {
  const settings = clone(DEFAULT_DESIGN_MEMORY_SETTINGS);
  const rows = new Map<string, DesignMemoryRecord>();
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const transport: DesignMemoryTransport = async <T,>(command: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({ command, args });
    let result: unknown;
    if (command === 'design_memory_get_settings') result = clone(settings);
    else if (command === 'design_memory_set_enabled') {
      const state = memorySwitch(settings, args!.kind as DesignMemoryKind);
      state.enabled = Boolean(args!.enabled); state.generation++;
      result = clone(settings);
    } else if (command === 'design_memory_acquire_lease') {
      const kind = args!.kind as DesignMemoryKind;
      result = { kind, sourceId: args!.sourceId, generation: memorySwitch(settings, kind).generation, sourceRevision: 1 };
    } else if (command === 'design_memory_upsert') {
      const drafts = args!.records as DesignMemoryDraft[];
      drafts.forEach(draft => rows.set(draft.id, { ...clone(draft), revision: 1, userCorrected: false, createdAt: 1, updatedAt: 1 }));
      result = { accepted: true, written: drafts.length };
    } else if (command === 'design_memory_recall') {
      const query = args!.query as { excludeSourceId?: string };
      result = { settings: clone(settings), records: [...rows.values()].filter(row => memorySwitch(settings, row.kind).enabled && row.sourceId !== query.excludeSourceId).map(clone) };
    } else throw new Error('Unexpected synthetic command: ' + command);
    return result as T;
  };
  const client = new DesignMemoryClient(transport);
  vi.spyOn(designMemory, 'isCurrent').mockImplementation(snapshot => client.isCurrent(snapshot));
  vi.spyOn(designMemory, 'getSettings').mockImplementation(() => client.getSettings());
  const seed = async () => {
    await client.setEnabled('chat-design', true);
    await client.setEnabled('drawer-image', true);
    await rememberExplicitChatDesign(message('我喜欢金属磨砂设计', 'fixture-old-user'), { title: '合成旧聊天' }, client);
    const draft = imageDraft();
    await client.put(await client.acquire('drawer-image', draft.sourceId), [draft]);
  };
  return { client, rows, calls, seed };
};

const memoryData = (messages: Array<Record<string, unknown>>): Array<Record<string, unknown>> => {
  const reference = messages.find(item => item.role === 'user' && typeof item.content === 'string' && item.content.startsWith('以下是与本轮任务相关的本地设计记忆'));
  return reference ? JSON.parse(String(reference.content).split('\n')[1]) : [];
};
const capturedRequest = () => {
  const call = invoke.mock.calls.find(([command]) => command === 'agent_openai_chat');
  expect(call).toBeDefined();
  // Simulate the actual JSON/IPC boundary, not merely an in-memory marker.
  return JSON.parse(JSON.stringify(call![1].request)) as { messages: Array<Record<string, unknown>> };
};
beforeEach(() => {
  invoke.mockReset();
  invoke.mockImplementation(async (command: string) => {
    if (command !== 'agent_openai_chat') throw new Error('Unexpected native call: ' + command);
    return { requestId: 'fixture-request', content: 'synthetic response', toolCalls: [] };
  });
});
afterEach(() => vi.restoreAllMocks());

describe('design memory at the final provider request boundary (synthetic only)', () => {
  it.each(['你能看到以往我们的聊天记录吗', '历史会话你能读取吗', '参考先前聊过的方案', '你能看聊天历史吗', '你还记得我以前的偏好吗', '参考之前收藏的图片', 'Can you read my chat history?'])(
    'attempts bounded recall for a memory meta-question: %s', async query => {
      const f = fixture(); await f.seed();
      expect(isDesignMemoryTask(query)).toBe(false);
      expect(isDesignMemoryRecallTask(query)).toBe(true);
      const recall = await recallDesignMemoryForTurn(query, 'fixture-project', 'fixture-current-chat', f.client);
      expect(recall.status).toBe('matched');
      expect(f.calls.find(call => call.command === 'design_memory_recall')?.args).toEqual({ query: {
        query, projectId: 'fixture-project', excludeSourceId: 'fixture-current-chat', includeRelatedSummaries: true, limit: 6,
      } });
    },
  );

  it('writes synthetic sources, recalls them, and injects actual text + provenance into agent_openai_chat, never pixels', async () => {
    const f = fixture(); await f.seed();
    const latest = message('你能看聊天历史吗');
    const recall = await recallDesignMemoryForTurn(latest.content, 'fixture-project', latest.conversationId, f.client);
    const messages = await buildChatContext({ messages: [latest], latestUserMessage: latest, designMemoryRecall: recall });
    await validateDesignMemoryMessages(messages);
    await requestChatCompletion({ requestId: 'fixture-request', messages, tools: [], stream: false, acknowledgeResult: false });
    const payload = capturedRequest();
    const data = memoryData(payload.messages);
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ id: 'chat-user:fixture-old-user', sourceId: 'fixture-old-chat', content: '我喜欢金属磨砂设计', representation: 'historical-chat-text' });
    expect(data[1]).toMatchObject({ id: 'drawer-image:fixture-image', sourceId: 'fixture-image', representation: 'historical-image-analysis-text-only', originalImageAttached: false });
    expect(String(data[1].content)).toContain('合成金属磨砂耳机图片分析');
    expect(JSON.stringify(payload)).not.toContain('"type":"image_url"');
    expect(JSON.stringify(payload)).not.toContain('data:image');
    expect(payload.messages.some(item => item.role === 'system' && String(item.content).includes('status=matched'))).toBe(true);
    expect(payload.messages[payload.messages.length - 1]).toEqual({ role: 'user', content: latest.content });
    const report = getDesignMemoryTurnReport(messages)!;
    expect(report.sources.map(source => source.id)).toEqual(data.map(row => row.id));
    expect(report.attachedImageCount).toBe(0);
    const trace = describeDesignMemoryTurn(report);
    const assistant = createStreamingAssistantState({ ...message('', 'fixture-assistant'), role: 'assistant', status: 'streaming' });
    const visible = upsertChatThinkingStep(assistant, 'design-memory', { type: 'context', ...trace, status: 'completed' });
    expect(visible.thinkingSteps?.find(step => step.id.endsWith(':design-memory'))?.detail).toContain('[记忆:drawer-image:fixture-image] drawer-image / fixture-image / 合成图片来源');
    expect(trace.detail).toContain('记忆本身不附原图');
    const html = renderToStaticMarkup(createElement(ChatThinkingPanel, { message: visible }));
    expect(html).toContain('已注入 2 条设计记忆（文字）');
    expect(html).toContain('[记忆:drawer-image:fixture-image]');
    expect(html).toContain('合成图片来源');
    expect(f.calls.every(call => call.command.startsWith('design_memory_'))).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it.each(['skipped', 'disabled', 'no-match', 'unavailable'] as const)('reports %s explicitly without claiming all history is absent', async expected => {
    const f = fixture();
    if (expected === 'no-match') await f.client.setEnabled('chat-design', true);
    if (expected === 'unavailable') vi.spyOn(f.client, 'recall').mockRejectedValue(new Error('fixture storage failure'));
    const latest = message(expected === 'skipped' ? '你好，今天天气如何' : '你能看聊天历史吗');
    const recall = await recallDesignMemoryForTurn(latest.content, 'fixture-project', latest.conversationId, f.client);
    expect(recall.status).toBe(expected);
    const messages = await buildChatContext({ messages: [latest], latestUserMessage: latest, designMemoryRecall: recall });
    expect(getDesignMemoryTurnReport(messages)).toMatchObject({ status: expected, sources: [] });
    expect(messages.some(item => item.role === 'system' && String(item.content).includes('status=' + expected))).toBe(true);
    expect(memoryData(messages)).toEqual([]);
    if (expected === 'skipped') expect(f.calls).toEqual([]);
    if (expected === 'disabled') expect(f.calls.map(call => call.command)).toEqual(['design_memory_get_settings']);
    expect(JSON.stringify(messages)).not.toContain('fixture storage failure');
  });

  it('counts actual vision payload separately from remembered image text, including resolver failures', async () => {
    const f = fixture(); await f.seed();
    const latest = message('参考以前的金属图片');
    const attachments: ChatAttachment[] = ['attached', 'failed'].map(id => ({ id, messageId: latest.id, type: 'image', path: 'synthetic://' + id, createdAt: 1 }));
    latest.attachments = attachments;
    const recall = await recallDesignMemoryForTurn(latest.content, 'fixture-project', latest.conversationId, f.client);
    const messages = await buildChatContext({ messages: [latest], latestUserMessage: latest, designMemoryRecall: recall,
      resolveAttachmentUrl: async attachment => attachment.id === 'attached' ? 'data:image/png;base64,AAAA' : '',
    });
    await requestChatCompletion({ requestId: 'fixture-request', messages, tools: [], acknowledgeResult: false });
    expect(getDesignMemoryTurnReport(messages)).toMatchObject({ attachedImageCount: 1, unavailableImageCount: 1 });
    const payload = capturedRequest();
    const parts = payload.messages[payload.messages.length - 1]!.content as Array<Record<string, unknown>>;
    expect(parts.filter(part => part.type === 'image_url')).toHaveLength(1);
    expect(parts.some(part => String(part.text).includes('本轮未收到该图片像素'))).toBe(true);
    expect(memoryData(payload.messages).find(row => row.source === 'drawer-image')?.originalImageAttached).toBe(false);
  });

  it('does not silently count an unresolved attachment as seen', async () => {
    const latest = message('你能看历史图片吗');
    latest.attachments = [{ id: 'unresolved', messageId: latest.id, type: 'image', path: 'synthetic://unresolved', createdAt: 1 }];
    const messages = await buildChatContext({ messages: [latest], latestUserMessage: latest, designMemoryRecall: { status: 'unavailable', snapshot: null } });
    expect(getDesignMemoryTurnReport(messages)).toMatchObject({ attachedImageCount: 0, unavailableImageCount: 1 });
    expect(JSON.stringify(messages)).toContain('本轮未收到该图片像素');
  });

  it('accounts for oversized inline images before emitting the receipt, consistent with final request protection', async () => {
    const latest = message('查看历史图片');
    latest.attachments = [{ id: 'oversized', messageId: latest.id, type: 'image', path: 'synthetic://oversized', createdAt: 1 }];
    const messages = await buildChatContext({ messages: [latest], latestUserMessage: latest,
      designMemoryRecall: { status: 'skipped', snapshot: null },
      resolveAttachmentUrl: async () => 'data:image/png;base64,' + 'A'.repeat(Math.ceil(MAX_INLINE_VISION_BYTES * 4 / 3) + 8),
    });
    await requestChatCompletion({ requestId: 'fixture-request', messages, tools: [], acknowledgeResult: false });
    expect(getDesignMemoryTurnReport(messages)).toMatchObject({ attachedImageCount: 0, unavailableImageCount: 1 });
    expect(JSON.stringify(capturedRequest())).not.toContain('"type":"image_url"');
  });

  it('reports stale instead of an ordinary no-match when recall crosses local revocation', async () => {
    const f = fixture(); await f.seed();
    const realRecall = f.client.recall.bind(f.client);
    vi.spyOn(f.client, 'recall').mockImplementation(async query => {
      const snapshot = await realRecall(query);
      f.client.invalidate({ kinds: ['drawer-image'], reason: 'clear' });
      return snapshot;
    });
    const latest = message('金属设计');
    const recall = await recallDesignMemoryForTurn(latest.content, 'fixture-project', latest.conversationId, f.client);
    expect(recall.status).toBe('stale');
    // A stale candidate must not be serialized, even if its original records exist.
    const messages = await buildChatContext({ messages: [latest], latestUserMessage: latest, designMemoryRecall: recall });
    expect(getDesignMemoryTurnReport(messages)?.status).toBe('stale');
    expect(memoryData(messages)).toEqual([]);
  });

  it('receipts and revocation dependencies contain only the records actually fitting the escaped JSON budget', async () => {
    const f = fixture(); await f.seed();
    const latest = message('金属设计');
    const recall = await recallDesignMemoryForTurn(latest.content, 'fixture-project', latest.conversationId, f.client);
    const first = recall.snapshot!.records[0];
    const snapshot: DesignMemorySnapshot = { ...recall.snapshot!, records: [first, { ...recall.snapshot!.records[1], content: '<'.repeat(900) }] };
    const messages = await buildChatContext({ messages: [latest], latestUserMessage: latest, designMemoryRecall: { status: 'matched', snapshot } });
    const data = memoryData(messages);
    expect(data.map(row => row.id)).toEqual([first.id]);
    expect(getDesignMemoryTurnReport(messages)).toMatchObject({ status: 'matched', retrievedCount: 2, sources: [{ id: first.id }] });
    expect(designMemoryKindsInMessages(messages)).toEqual(['chat-design']);
    f.client.invalidate({ kinds: ['drawer-image'], reason: 'clear' });
    await expect(validateDesignMemoryMessages([...messages, { role: 'tool', content: 'fixture continuation' }])).resolves.toBeUndefined();
    f.client.invalidate({ kinds: ['chat-design'], reason: 'clear' });
    await expect(validateDesignMemoryMessages(messages)).rejects.toThrow('本轮已取消');
  });
});
