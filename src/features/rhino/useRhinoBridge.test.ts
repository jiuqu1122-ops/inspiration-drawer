import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  effects: [] as Array<() => (() => void)>,
  discover: vi.fn(), request: vi.fn(), call: vi.fn(), invoke: vi.fn(),
}));
vi.mock('react', () => ({ useRef: (value: unknown) => ({ current: value }), useEffect: (effect: () => (() => void)) => mocks.effects.push(effect) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('./rhinoClient', () => ({ discoverRhino: mocks.discover, rhinoRequest: mocks.request, callRhinoTool: mocks.call }));
import { useRhinoBridge, withRhinoTools } from './useRhinoBridge';
import { isRhinoCanvasLocked } from './rhinoProtocol';
import type { useChatRuntime } from '../chat/runtime/useChatRuntime';

const connection = { protocol: 1, url: 'http://127.0.0.1:12345/', token: 'a'.repeat(64), instanceId: 'b'.repeat(32) };
let cleanup: (() => void) | undefined;
let sequence = 0;
function setup(extra: Record<string, unknown> = {}) {
  const id = `conversation-${++sequence}`;
  const runtime = {
    loading: false, activeConversationId: id, conversations: [{ id, title: 'Test' }], activeConversation: { id, model: 'vision-model' },
    busy: false, stoppable: false, messages: [], sendMessage: vi.fn().mockResolvedValue(true), stop: vi.fn().mockResolvedValue(undefined),
    newConversation: vi.fn().mockResolvedValue({ id }), selectConversation: vi.fn(), setConversationModel: vi.fn(),
  };
  const command = { id: `request-${sequence}-12345`, kind: 'send', conversationId: id, content: '请分析对象', documentId: 12, ...extra };
  mocks.request.mockImplementation(async (_connection, path) => path === '/drawer/heartbeat' ? { command } : {});
  useRhinoBridge({ runtime: runtime as unknown as ReturnType<typeof useChatRuntime>, canvasId: 'canvas-one', selectedItems: () => [], modelOptions: ['vision-model'], imageModel: 'auto', imageModelOptions: [{ value: 'auto' }] });
  cleanup = mocks.effects[mocks.effects.length - 1]();
  return { runtime, command };
}
async function settle() { await vi.advanceTimersByTimeAsync(0); }
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); mocks.effects.length = 0;
  mocks.discover.mockResolvedValue(connection);
  mocks.call.mockResolvedValue([{ type: 'text', text: '{"documentId":12}' }]);
  mocks.invoke.mockResolvedValue('C:/fixture/viewport.png');
});
afterEach(() => { cleanup?.(); cleanup = undefined; vi.useRealTimers(); });
describe('Rhino desktop Chat bridge', () => {
  it('executes a repeated command once, after host acknowledgement', async () => {
    const { runtime } = setup(); await settle();
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
    const claimOrder = mocks.request.mock.invocationCallOrder[1];
    expect(claimOrder).toBeLessThan(runtime.sendMessage.mock.invocationCallOrder[0]);
    await vi.advanceTimersByTimeAsync(2_100);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(isRhinoCanvasLocked()).toBe(false);
  });
  it('does not invoke a model if claiming the request fails', async () => {
    const { runtime, command } = setup();
    mocks.request.mockImplementation(async (_connection, path) => { if (path.endsWith('ack')) throw new Error('lost acknowledgement'); return { command }; });
    await settle(); expect(runtime.sendMessage).not.toHaveBeenCalled();
  });
  it('imports viewport pixels as a real Chat attachment and retains capture metadata', async () => {
    const { runtime } = setup({ includeViewport: true });
    mocks.call.mockImplementation(async (_binding, name) => name === 'rhino_capture_viewport'
      ? [{ type: 'image', mimeType: 'image/png', data: 'cGl4ZWxz' }, { type: 'text', text: '{"captureCamera":"frozen"}' }]
      : [{ type: 'text', text: '{"earlierCamera":"old"}' }]);
    await settle();
    expect(mocks.invoke).toHaveBeenCalledWith('save_dropped_file', expect.objectContaining({ dataUrl: 'data:image/png;base64,cGl4ZWxz' }));
    expect(runtime.sendMessage).toHaveBeenCalledWith(expect.stringContaining('captureCamera'), [expect.objectContaining({ path: 'C:/fixture/viewport.png', type: 'image' })]);
  });
  it('refuses a stale active conversation before calling models', async () => {
    const { runtime } = setup({ conversationId: 'different-chat' }); await settle();
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    expect(mocks.request).toHaveBeenCalledWith(connection, '/drawer/ack', expect.objectContaining({ status: 'failed' }));
  });
  it('enforces the original canvas for later tool calls', async () => {
    const { runtime } = setup(); await settle();
    const execute = vi.fn();
    await expect(withRhinoTools(execute, 'wrong-canvas')('generate_image', {}, { conversationId: runtime.activeConversationId, messageId: 'message', userText: '', recentMessages: [] })).rejects.toThrow('画布已切换');
    expect(execute).not.toHaveBeenCalled();
  });
  it('keeps heartbeats alive during a long model request and releases the canvas afterwards', async () => {
    const { runtime, command } = setup();
    let finish!: (value: boolean) => void;
    runtime.sendMessage.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await settle(); expect(isRhinoCanvasLocked()).toBe(true);
    command.kind = 'stop'; command.id += '-stop';
    await vi.advanceTimersByTimeAsync(1_100);
    expect(runtime.stop).toHaveBeenCalledOnce();
    expect(isRhinoCanvasLocked()).toBe(true);
    finish(true); await settle(); expect(isRhinoCanvasLocked()).toBe(false);
  });
});
