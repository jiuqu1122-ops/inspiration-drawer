import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../model/chatTypes';

// Drive the real sendMessage -> model loop -> executor -> persisted message
// path. Effects/UI and the IPC backend are mocked; no network, billing or user
// data is touched, and provider replies are explicitly synthetic fixtures.
const harness = vi.hoisted(() => ({
  invoke: vi.fn(), execute: vi.fn(), replies: [] as Array<Record<string, unknown>>,
  requests: [] as Array<Record<string, any>>, messages: new Map<string, ChatMessage>(),
}));
vi.mock('react', () => ({
  useEffect: () => {},
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => {
    let value = typeof initial === 'function' ? initial() : initial;
    return [value, (next: unknown) => { value = typeof next === 'function' ? next(value) : next; }];
  },
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: harness.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('../../designMemory/context', async importOriginal => ({
  ...await importOriginal<typeof import('../../designMemory/context')>(),
  recallDesignMemoryForTurn: vi.fn(async () => null),
  validateDesignMemoryMessages: vi.fn(async () => {}),
  designMemoryKindsInMessages: () => [],
  getDesignMemoryTurnReport: () => null,
}));
vi.mock('../../designMemory/sources', () => ({
  rememberExplicitChatDesign: vi.fn(async () => {}),
  designMemoryProjectId: (id: string) => id,
  beginChatDesignSummaryMemory: vi.fn(async () => null),
  completeChatDesignSummaryMemory: vi.fn(async () => {}),
}));
import { useChatRuntime } from './useChatRuntime';

const fixtureFile = { files: [{ id: 'synthetic-file', format: 'pptx', name: 'fixture.pptx', path: 'C:/synthetic/fixture.pptx', slideCount: 1 }] };
const fileReply = () => ({ content: '', toolCalls: [{ id: 'synthetic-create', name: 'create_file', arguments: JSON.stringify({ fileName: 'fixture.pptx', format: 'pptx', presentation: { title: 'Synthetic fixture', slides: [{ title: 'Fixture only', body: 'Synthetic evidence' }] } }) }] });
const textReply = (content: string) => ({ content, toolCalls: [] });
const lastAssistant = () => [...harness.messages.values()].filter(message => message.role === 'assistant').slice(-1)[0]!;
const setupRuntime = () => useChatRuntime({ model: 'default', approvalMode: 'auto', executeTool: harness.execute });

beforeEach(() => {
  let now = 1000;
  vi.spyOn(Date, 'now').mockImplementation(() => now++);
  harness.invoke.mockReset(); harness.execute.mockReset(); harness.replies.length = 0;
  harness.requests.length = 0; harness.messages.clear();
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value) });
  vi.stubGlobal('window', { setTimeout: () => 1, clearTimeout: () => {} });
  harness.execute.mockResolvedValue(fixtureFile);
  harness.invoke.mockImplementation(async (command: string, args: Record<string, any>) => {
    if (command === 'agent_openai_chat') {
      harness.requests.push(args.request);
      const reply = harness.replies.shift();
      if (!reply) throw new Error('Unexpected extra model call');
      return { requestId: args.request.requestId, ...reply };
    }
    if (command === 'chat_list_messages') return { messages: [...harness.messages.values()], hasMore: false };
    if (command === 'chat_upsert_message') { harness.messages.set(args.message.id, args.message); return args.message; }
    if (command === 'chat_upsert_conversation') return args.conversation;
    if (command === 'chat_upsert_tool_call') return args.call;
    if (command === 'chat_get_summary') return null;
    return null;
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('PPT delivery through the real runtime (synthetic IPC)', () => {
  it('passes create_file for the exact screenshot wording 出ppt and produces a successful file receipt', async () => {
    const runtime = setupRuntime();
    harness.replies.push(fileReply());
    expect(await runtime.sendMessage('出ppt')).toBe(true);
    expect(harness.requests).toHaveLength(1);
    expect(harness.requests[0].tools.some((tool: any) => tool.function.name === 'create_file')).toBe(true);
    expect(harness.requests[0].toolChoice).toEqual({ type: 'function', function: { name: 'create_file' } });
    expect(harness.execute).toHaveBeenCalledWith('create_file', expect.objectContaining({ format: 'pptx' }), expect.anything());
    expect(lastAssistant().status).toBe('completed');
    expect(lastAssistant().toolCalls[0].status).toBe('completed');
    expect(lastAssistant().toolCalls[0].resultJson).toContain('fixture.pptx');
  });

  it.each(['模拟器', '实车', '医疗设备'])('retains %s only in this conversation across clarification and 开始做吧', async answer => {
    const runtime = setupRuntime();
    harness.replies.push(textReply('请确认具体研究对象？'), textReply('范围明确，可以开始制作。'), fileReply());
    await runtime.sendMessage('做一份产品工业设计调研PPT，不用AI生图');
    expect(harness.execute).not.toHaveBeenCalled();
    expect(harness.requests[0].toolChoice).toBeUndefined();
    await runtime.sendMessage(answer);
    expect(harness.requests[1].tools).toEqual([]);
    await runtime.sendMessage('开始做吧');
    const request = harness.requests[2];
    expect(request.tools.some((tool: any) => tool.function.name === 'create_file')).toBe(true);
    expect(request.tools.some((tool: any) => tool.function.name === 'generate_image')).toBe(false);
    expect(request.messages).toContainEqual({ role: 'user', content: answer });
    expect(lastAssistant().status).toBe('completed');
    expect(lastAssistant().toolCalls[0].toolName).toBe('create_file');
  });

  it('recovers a false missing-file-tool refusal once, without repeating search or image generation', async () => {
    const runtime = setupRuntime();
    harness.replies.push(textReply('当前会话没有提供文件创建工具，我无法生成真实的PPTX。'), fileReply());
    await runtime.sendMessage('出ppt');
    expect(harness.requests).toHaveLength(2);
    const retry = harness.requests[1];
    expect(retry.tools.map((tool: any) => tool.function.name)).toEqual(['create_file']);
    expect(retry.toolChoice).toEqual({ type: 'function', function: { name: 'create_file' } });
    expect(retry.stream).toBe(false);
    expect(harness.execute).toHaveBeenCalledTimes(1);
    expect(lastAssistant().content).not.toContain('没有提供文件创建工具');
    expect(lastAssistant().status).toBe('completed');
  });

  it('keeps retrieved evidence through a text-only refusal and retries only file creation', async () => {
    const runtime = setupRuntime();
    harness.execute.mockImplementation(async (name: string) => name === 'web_search'
      ? { query: 'synthetic product specifications', results: [{ title: 'Synthetic official specifications', url: 'https://manufacturer.example/spec', content: 'Fixture only: official source evidence.', snippet: 'Synthetic excerpt.' }] }
      : fixtureFile);
    harness.replies.push({ content: '', toolCalls: [{ id: 'synthetic-search', name: 'web_search', arguments: '{"query":"synthetic product specifications"}' }] },
      textReply('当前会话没有提供文件创建工具，以下仅为文字稿。'), fileReply());
    await runtime.sendMessage('联网做一份方向盘工业设计调研PPT，不要AI生图');
    expect(harness.requests).toHaveLength(3);
    const retry = harness.requests[2];
    expect(retry.tools.map((tool: any) => tool.function.name)).toEqual(['create_file']);
    expect(JSON.stringify(retry.messages)).toContain('https://manufacturer.example/spec');
    expect(harness.execute.mock.calls.map(([name]) => name)).toEqual(['web_search', 'create_file']);
    expect(lastAssistant().toolCalls.map(call => call.toolName)).toEqual(['web_search', 'create_file']);
    expect(lastAssistant().status).toBe('completed');
  });

  it('does not transfer a confirmed subject to a new conversation', async () => {
    const runtime = setupRuntime();
    harness.replies.push(textReply('请确认具体研究对象？'), textReply('范围已明确。'));
    await runtime.sendMessage('做一份产品设计调研PPT');
    await runtime.sendMessage('实车');
    await runtime.newConversation();
    harness.replies.push(textReply('请说明本次研究对象？'));
    await runtime.sendMessage('做一份产品设计调研PPT');
    expect(JSON.stringify(harness.requests[2].messages)).not.toContain('实车');
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it('keeps a short style revision attached to the real deck, without topic-to-style routing', async () => {
    const runtime = setupRuntime(); harness.replies.push(fileReply(), fileReply());
    await runtime.sendMessage('做一份产品设计调研PPT');
    await runtime.sendMessage('换一种风格');
    expect(harness.requests).toHaveLength(2);
    expect(harness.requests[1].tools.some((tool: any) => tool.function.name === 'create_file')).toBe(true);
    expect(harness.requests[1].tools.some((tool: any) => tool.function.name === 'edit_image')).toBe(false);
    expect(lastAssistant().toolCalls.some(call => call.toolName === 'create_file' && call.status === 'completed')).toBe(true);
  });

  it('reports failure rather than success when the provider twice ignores the file request', async () => {
    const runtime = setupRuntime();
    harness.replies.push(textReply('以下是10页文字稿'), textReply('仍然无法创建文件'));
    await runtime.sendMessage('出ppt');
    expect(harness.requests).toHaveLength(2);
    expect(harness.execute).not.toHaveBeenCalled();
    expect(lastAssistant().status).toBe('error');
    expect(lastAssistant().content).toContain('PPT 尚未生成可下载文件');
    expect(lastAssistant().content).not.toContain('仍然无法创建文件');
  });
});
