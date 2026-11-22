import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readPsd } from 'ag-psd';
import { getGeneratedFilesFromToolCall, type ChatMessage } from '../model/chatTypes';
import { createInspirationChatToolExecutor } from '../tools/inspirationChatToolExecutor';
import { proposeLayeredPsd } from '../tools/chatLayeredPsd';
import { useChatRuntime } from './useChatRuntime';

const h = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: h.invoke, isTauri: () => false }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('react', () => ({
  useEffect: () => {}, useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => {
    let state = typeof initial === 'function' ? initial() : initial;
    return [state, (next: unknown) => { state = typeof next === 'function' ? next(state) : next; }];
  },
  useCallback: (callback: unknown) => callback, useMemo: (factory: () => unknown) => factory(),
}));
vi.mock('../../designMemory/context', async original => ({
  ...await original<typeof import('../../designMemory/context')>(), recallDesignMemoryForTurn: async () => null,
  validateDesignMemoryMessages: async () => {}, designMemoryKindsInMessages: () => [], getDesignMemoryTurnReport: () => null,
}));
vi.mock('../../designMemory/sources', () => ({
  rememberExplicitChatDesign: async () => {}, designMemoryProjectId: (id: string) => id,
  beginChatDesignSummaryMemory: async () => null, completeChatDesignSummaryMemory: async () => {},
}));

const messages = new Map<string, ChatMessage>();
const attachment = { id: 'studio', type: 'image', path: 'C:/photos/录音室.png' };
const read = vi.fn(async () => 'data:image/png;base64,test');
const generateMedia = vi.fn();
const prompt = '将桌面音箱独立成层，保留其余背景。';
const proposal = { id: 'psd-call', name: 'create_layered_psd', arguments: JSON.stringify({
  prompt, fileName: '录音室.psd', approved: true, expectedCredits: '0',
}) };
const assistant = () => [...messages.values()].filter(m => m.role === 'assistant').pop()!;
const commands = () => h.invoke.mock.calls.map(([name]) => name);
const savedPsd = { id: 'file-1', name: '录音室.psd', path: 'fixture/录音室.psd', format: 'psd' };
const base = { width: 4, height: 3, alpha: false, transparent: false, asset: 0 };
const output = { operation: 'split', width: 4, height: 3, base, assets: ['https://fixture/base', 'https://fixture/speaker'],
  layers: [{ ...base, width: 1, height: 2, x: 2, y: 1, asset: 1, id: 'speaker', name: '音箱', order: 1, opacity: 1 }] };
const setup = () => useChatRuntime({
  model: 'fixture', approvalMode: 'auto', resolveAttachmentUrl: read,
  executeTool: createInspirationChatToolExecutor({ psdImages: { read, cacheImage: vi.fn() },
    createFile: vi.fn(), executeExistingTool: vi.fn(), listWorkflowDescriptors: () => [], searchWeb: vi.fn(), generateMedia }),
});

beforeEach(() => {
  vi.clearAllMocks();
  messages.clear();
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal('window', { dispatchEvent: vi.fn(), setTimeout: () => 1, clearTimeout: vi.fn() });
  vi.stubGlobal('Image', class { onload?: () => void; set src(_: string) { this.onload?.(); } });
  const context = { drawImage: vi.fn(), scale: vi.fn(), getImageData: (_x: number, _y: number, width: number, height: number) =>
    ({ width, height, data: new Uint8ClampedArray(width * height * 4).fill(255) }) };
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => context }) });
  h.invoke.mockImplementation(async (name, args) => {
    if (name === 'agent_openai_chat') {
      const first = commands().filter(key => key === name).length === 1;
      expect(!first || args.request.tools.some((tool: { function: { name: string } }) => tool.function.name === proposal.name)).toBe(true);
      return { requestId: args.request.requestId, content: first ? '' : '请指定源图。',
        toolCalls: first ? [proposal, proposal, { id: 'spurious', name: 'generate_image', arguments: '{"prompt":"extra"}' }] : [] };
    }
    if (name === 'chat_upsert_message') { messages.set(args.message.id, args.message); return args.message; }
    if (name === 'chat_list_messages') return { messages: [...messages.values()], hasMore: false };
    if (name === 'chat_upsert_conversation') return args.conversation;
    if (name === 'chat_upsert_attachment') return args.attachment;
    if (name === 'chat_upsert_tool_call') return args.call;
    if (name === 'github_skills_request') return [];
    if (name === 'cloud_canvas_layer_catalog') return { split: [{ creditsPerRequest: '340', creditsPerOutputImage: '20', maxOutputImages: 17 }] };
    if (name === 'submit_cloud_canvas_layer' || name === 'get_cloud_canvas_layer') return { status: 'success', result: output, chargedCredits: '40' };
    if (name === 'chat_save_layered_psd') return { files: [savedPsd] };
    return null;
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('Chat 分层 PSD', () => {
  it.each([false, true])('在自动模式等待确认，用户选择 %s', async approve => {
    const chat = setup();
    await chat.sendMessage('把这张图做成 PSD，音箱单独一层', [attachment]);
    const calls = assistant().toolCalls;
    expect(calls, assistant().content + ' — ' + commands().join(',')).toHaveLength(1);
    expect(calls[0].status).toBe('awaiting-approval');
    const { proposal: plan } = JSON.parse(calls[0].resultJson!);
    expect(plan).toMatchObject({ sourceId: attachment.id, sourceName: '录音室.png', prompt, offer: { creditsPerRequest: '340' } });
    expect(commands()).not.toContain('submit_cloud_canvas_layer');
    await Promise.all([chat.resolveToolApproval(calls[0].id, approve), chat.resolveToolApproval(calls[0].id, approve)]);
    expect(generateMedia).not.toHaveBeenCalled();
    if (!approve) {
      expect(assistant().toolCalls[0].status).toBe('declined');
      expect(commands()).not.toContain('submit_cloud_canvas_layer');
      expect(commands()).not.toContain('chat_save_layered_psd');
      return;
    }
    expect(commands().filter(key => key === 'submit_cloud_canvas_layer')).toHaveLength(1);
    expect(h.invoke).toHaveBeenCalledWith('submit_cloud_canvas_layer', { request: expect.objectContaining({
      prompt, clientRequestId: plan.requestId, expectedCredits: '340', expectedCreditsPerOutputImage: '20',
    }) });
    const save = h.invoke.mock.calls.find(([key]) => key === 'chat_save_layered_psd');
    expect(save, assistant().toolCalls[0].resultJson || '').toBeDefined();
    const psd = readPsd(save![1], { skipCompositeImageData: true, skipLayerImageData: true });
    expect(psd.children?.map(layer => layer.name)).toEqual(['底图', '音箱']);
    expect(psd.children?.[1]).toMatchObject({ left: 2, top: 1, right: 3, bottom: 3 });
    expect(getGeneratedFilesFromToolCall(assistant().toolCalls[0])[0]).toMatchObject(savedPsd);
  });

  it.each([[], [attachment, { ...attachment, id: 'second', path: 'second.png' }]])('源图缺失或不明确时不提交任务', async (...attachments) => {
    await setup().sendMessage('生成 PSD', attachments);
    expect(assistant().toolCalls[0].status).toBe('error');
    expect(commands()).not.toContain('submit_cloud_canvas_layer');
  });

  it('可以指定历史生成图片，确认时使用稳定的图片 ID', async () => {
    const message: ChatMessage = { id: 'old', conversationId: 'chat', role: 'assistant', content: '', createdAt: 1,
      status: 'completed', attachments: [], toolCalls: [{ id: 'call-1', toolName: 'generate_image', messageId: 'old',
        argumentsJson: '{}', createdAt: 1, status: 'completed', resultJson: JSON.stringify({ media: [
          { path: 'C:/images/desk.png', name: '桌子' }, { id: 'speaker', path: 'C:/images/speaker.png', name: '音箱' },
        ] }) }] };
    const context = { userText: '第一张做 PSD', conversationId: 'chat', messageId: 'now', recentMessages: [message] };
    const plan = await proposeLayeredPsd({ sourceId: 'call-1:media:0', prompt }, context);
    expect(plan.sourceName).toBe('桌子');
    await expect(proposeLayeredPsd({ sourceId: 'speaker', prompt }, { ...context, conversationId: 'other' })).rejects.toThrow('源图');
    expect(commands()).not.toContain('submit_cloud_canvas_layer');
  });

  it('拆分成功但写入失败时显示实际扣费和原请求，不自动重做', async () => {
    const normal = h.invoke.getMockImplementation()!;
    h.invoke.mockImplementation((name, ...args) => name === 'chat_save_layered_psd'
      ? Promise.reject(Error('磁盘空间不足')) : normal(name, ...args));
    const chat = setup();
    await chat.sendMessage('导出分层 PSD', [attachment]);
    await chat.resolveToolApproval(assistant().toolCalls[0].id, true);
    expect(assistant().status).toBe('error');
    expect(assistant().content).toContain('实扣 40 积分');
    expect(assistant().content).toContain('磁盘空间不足');
    expect(assistant().content).toContain('canvas-layer-');
    expect(getGeneratedFilesFromToolCall(assistant().toolCalls[0])).toEqual([]);
    expect(commands().filter(key => key === 'submit_cloud_canvas_layer')).toHaveLength(1);
    expect(commands().filter(key => key === 'agent_openai_chat')).toHaveLength(1);
  });
});
