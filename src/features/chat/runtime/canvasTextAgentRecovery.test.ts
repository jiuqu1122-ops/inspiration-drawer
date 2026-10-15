import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { buildCanvasTextAgentUserContentImpl, runCanvasTextAgentNodeImpl, runCanvasTextAgentTargetImpl } from './chatCanvasActions';
import type { CanvasImageItem } from '../../canvasModel';
import type { AgentCanvasVisualReference } from '../../agentModel';
import { MAX_INLINE_VISION_BYTES } from '../context/chatRequestSize';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('../../cloudAccountQuotaRefresh', () => ({ scheduleCloudAccountQuotaRefresh: vi.fn() }));
beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.stubGlobal('window', { clearTimeout });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const connectTimeout = '提交后台任务失败：超时错误：client error (Connect); operation timed out';
const previousOutput = '之前已完成的文字';

function scenario(wallet = true, references: AgentCanvasVisualReference[] = []) {
  const target: CanvasImageItem = { id: 'text-node', x: 0, y: 0, width: 400, height: 320, textMode: 'agent',
    item: { id: 'text-asset', type: 'text', content: '写一个产品展示脚本', remark: previousOutput, createdAt: 1 } };
  const ref = { current: [target] };
  const notices = vi.fn();
  const write = vi.fn((_id: string, output: string) => { target.item.remark = output; });
  const running = vi.fn();
  const context = {
    agentModelRef: { current: 'saved-direct-model' }, canvasItemsRef: ref,
    canvasAgent: { settings: { apiProvider: wallet ? 'unmind-wallet' : 'openai-compatible',
      apiCredentialSource: wallet ? 'cloud_wallet' : 'user_settings', systemPrompt: '' } },
    getCanvasTextInputsForNode: () => [], getCanvasAgentVisualReferencesForNodeInputs: () => references,
    prepareCanvasAgentVisualReferences: async () => references, getCanvasContextRoutingTargetsForAgent: () => [],
    buildCanvasTextAgentUserContent: (text: string, references: Parameters<typeof buildCanvasTextAgentUserContentImpl>[2]) => buildCanvasTextAgentUserContentImpl({}, text, references),
    showToast: notices,
  } as unknown as Parameters<typeof runCanvasTextAgentTargetImpl>[0];
  const run = () => runCanvasTextAgentNodeImpl({
    canvasItemsRef: ref, canvasTextAgentRunningIds: [],
    canvasTextAreaRefs: { current: {} }, canvasTextOutputAreaRefs: { current: {} },
    canvasTextOutputDraftTimersRef: { current: {} }, canvasTextOutputDraftValuesRef: { current: {} },
    commitCanvasTextDraft: vi.fn(), getCanvasAiErrorSummary: String, pushCanvasUndoSnapshot: vi.fn(),
    setCanvasTextAgentRunning: running, showToast: notices, updateCanvasSelection: vi.fn(), updateCanvasTextOutputItem: write,
    runCanvasTextAgentTarget: (node, options) => runCanvasTextAgentTargetImpl(context, node, options),
  }, target.id);
  const requests = () => vi.mocked(invoke).mock.calls.filter(([command]) => command === 'agent_openai_chat');
  const acknowledgements = () => vi.mocked(invoke).mock.calls.filter(([command]) => command === 'agent_ack_wallet_task');
  return { target, ref, run, write, running, notices, requests, acknowledgements };
}

describe('wallet text-node control execution', () => {
  it('preserves a prepared inline reference unchanged in both same-ID attempts', async () => {
    const source = `data:image/png;base64,${'A'.repeat(Math.ceil((MAX_INLINE_VISION_BYTES + 1) * 4 / 3) + 8)}`;
    const state = scenario(true, [{ id: 'reference', nodeId: 'reference-node', name: 'Prepared reference', mediaType: 'image', source }]);
    vi.mocked(invoke).mockRejectedValueOnce(new Error(connectTimeout)).mockResolvedValueOnce({ content: '已按参考图生成', toolCalls: [] });
    await state.run();
    const requests = state.requests();
    expect(requests).toHaveLength(2);
    expect(JSON.stringify(requests[0][1]) === JSON.stringify(requests[1][1])).toBe(true);
    for (const [, args] of requests) {
      const request = (args as { request: { messages: Array<{ content: unknown }> } }).request;
      const parts = request.messages[1].content as Array<{ type: string; image_url?: { url: string } }>;
      const image = parts.find(part => part.type === 'image_url');
      expect(image?.image_url?.url === source).toBe(true);
    }
    expect(state.target.item.remark).toBe('已按参考图生成');
    expect(state.acknowledgements()).toHaveLength(1);
  });

  it('automatically resumes a submission timeout once with the same identity and acknowledges only after writing the result', async () => {
    const state = scenario();
    vi.mocked(invoke)
      .mockRejectedValueOnce(new Error(connectTimeout))
      .mockResolvedValueOnce({ content: '  已恢复的脚本  ', toolCalls: [] })
      .mockImplementationOnce(async command => {
        expect(command).toBe('agent_ack_wallet_task');
        expect(state.target.item.remark).toBe('已恢复的脚本');
      });
    await state.run();
    const requests = state.requests();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
    const request = (requests[0][1] as { request: Record<string, unknown> }).request;
    expect(request).toMatchObject({ model: 'default', usageContext: 'canvas_text_agent', tools: [], stream: false });
    expect(request.requestId).toMatch(/^canvas_text_agent_/);
    expect(state.write).toHaveBeenCalledExactlyOnceWith('text-node', '已恢复的脚本');
    expect(state.acknowledgements()).toEqual([['agent_ack_wallet_task', { requestId: request.requestId }]]);
    expect(state.running.mock.calls).toEqual([['text-node', true], ['text-node', false]]);
  });

  it('stops after one automatic recovery attempt and retains old text when both connections fail', async () => {
    const state = scenario();
    vi.mocked(invoke).mockRejectedValue(new Error(connectTimeout));
    await state.run();
    expect(state.requests()).toHaveLength(2);
    expect(state.requests()[1]).toEqual(state.requests()[0]);
    expect(state.target.item.remark).toBe(previousOutput);
    expect(state.write).not.toHaveBeenCalled();
    expect(state.acknowledgements()).toEqual([]);
    expect(state.running).toHaveBeenLastCalledWith('text-node', false);
  });

  it('does not retry an HTTP 401 or acknowledge an unwritten result', async () => {
    const state = scenario();
    vi.mocked(invoke).mockRejectedValue(new Error('提交后台任务 HTTP 401：登录凭证失效'));
    await state.run();
    expect(state.requests()).toHaveLength(1);
    expect(state.write).not.toHaveBeenCalled();
    expect(state.target.item.remark).toBe(previousOutput);
    expect(state.acknowledgements()).toEqual([]);
    expect(state.running).toHaveBeenLastCalledWith('text-node', false);
  });

  it('retains old text and its resumable native task when the completed response has no usable content', async () => {
    const state = scenario();
    vi.mocked(invoke).mockResolvedValue({ content: '   ', reasoning: 'reasoning only', toolCalls: [] });
    await state.run();
    expect(state.requests()).toHaveLength(1);
    expect(state.write).not.toHaveBeenCalled();
    expect(state.target.item.remark).toBe(previousOutput);
    expect(state.acknowledgements()).toEqual([]);
    expect(state.notices).toHaveBeenLastCalledWith(expect.stringContaining('没有返回可写入的文字结果'));
  });

  it('does not acknowledge when writing the result fails', async () => {
    const state = scenario();
    state.write.mockImplementationOnce(() => { throw new Error('写回失败'); });
    vi.mocked(invoke).mockResolvedValue({ content: '新结果', toolCalls: [] });
    await state.run();
    expect(state.target.item.remark).toBe(previousOutput);
    expect(state.acknowledgements()).toEqual([]);
    expect(state.running).toHaveBeenLastCalledWith('text-node', false);
  });

  it('does not acknowledge a result that cannot be applied after the original node leaves the current canvas', async () => {
    const state = scenario();
    let finish!: (value: unknown) => void;
    vi.mocked(invoke).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = state.run();
    state.ref.current = [];
    finish({ content: '原节点的结果', toolCalls: [] });
    await pending;
    expect(state.write).not.toHaveBeenCalled();
    expect(state.acknowledgements()).toEqual([]);
    expect(state.target.item.remark).toBe(previousOutput);
  });

  it('keeps the successfully written text when acknowledgement itself fails', async () => {
    const state = scenario();
    vi.mocked(invoke).mockResolvedValueOnce({ content: '已写回结果', toolCalls: [] }).mockRejectedValueOnce(new Error('ack connection failed'));
    await state.run();
    expect(state.target.item.remark).toBe('已写回结果');
    expect(state.requests()).toHaveLength(1);
    expect(state.acknowledgements()).toHaveLength(1);
    expect(state.notices).toHaveBeenLastCalledWith('文字节点已由 Agent 生成结果');
    expect(state.running).toHaveBeenLastCalledWith('text-node', false);
  });
});

describe('direct text-node execution compatibility', () => {
  it('does not automatically repeat a direct provider request after the same timeout', async () => {
    const state = scenario(false);
    vi.mocked(invoke).mockRejectedValue(new Error(connectTimeout));
    await state.run();
    expect(state.requests()).toHaveLength(1);
    expect(state.target.item.remark).toBe(previousOutput);
    expect(state.acknowledgements()).toEqual([]);
  });

  it('preserves the direct model and original request fields without a wallet acknowledgement', async () => {
    const state = scenario(false);
    vi.mocked(invoke).mockResolvedValue({ content: '自定义渠道结果', toolCalls: [] });
    await state.run();
    expect(state.target.item.remark).toBe('自定义渠道结果');
    expect(state.requests()).toHaveLength(1);
    const request = (state.requests()[0][1] as { request: Record<string, unknown> }).request;
    expect(request.model).toBe('saved-direct-model');
    expect(request.usageContext).toBe('canvas_text_agent');
    expect(request).not.toHaveProperty('stream');
    expect(request).not.toHaveProperty('tools');
    expect(state.acknowledgements()).toEqual([]);
  });
});
