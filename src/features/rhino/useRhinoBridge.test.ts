import { registerRhinoNativeTools } from './rhinoProtocol';
import { RhinoNativeMcpToolError } from './rhinoScriptPreflight';
import type { RhinoNativeBinding } from './rhinoProtocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  effects: [] as Array<() => (() => void)>,
  discover: vi.fn(), activeDocument: vi.fn(), discoverNative: vi.fn(async (_binding: unknown, _conversationId: string, onNotice?: (message: string) => void): Promise<RhinoNativeBinding | undefined> => { onNotice?.('MCPStart required'); return undefined; }), hasNativeWrites: vi.fn((binding: RhinoNativeBinding | undefined) => Boolean(binding?.tools?.some(tool => tool.readOnly === false && ['build','connect','solve','write'].includes(tool.workflowPhase || '')))), request: vi.fn(), call: vi.fn(), invoke: vi.fn(),
}));
vi.mock('react', () => ({ useRef: (value: unknown) => ({ current: value }), useEffect: (effect: () => (() => void)) => mocks.effects.push(effect) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('./rhinoClient', () => ({ discoverRhinoConnections: mocks.discover, getActiveRhinoDocument: mocks.activeDocument, discoverNativeRhino: mocks.discoverNative, hasRhinoNativeWriteTools: mocks.hasNativeWrites, rhinoRequest: mocks.request, callRhinoTool: mocks.call }));
import { getRhinoTools, isRhinoCanvasImageRequest, prepareCanvasRhinoTurn, useRhinoBridge, withRhinoTools } from './useRhinoBridge';
import { isRhinoCanvasLocked } from './rhinoProtocol';
import { RHINO_MODELING_SKILL_RESOURCE_TOOL } from './rhinoProductModelingKnowledge';
import type { useChatRuntime } from '../chat/runtime/useChatRuntime';

const connection = { protocol: 1, url: 'http://127.0.0.1:12345/', token: 'a'.repeat(64), instanceId: 'b'.repeat(32) };
let cleanup: (() => void) | undefined;
let sequence = 0;
function setup(extra: Record<string, unknown> = {}) {
  const id = `conversation-${++sequence}`;
  const imageModelOptions = Array.isArray(extra.imageModelOptions) ? extra.imageModelOptions : [{ value: 'auto', supportsMask: true }];
  const runtime: any = {
    loading: false, activeConversationId: id, conversations: [{ id, title: 'Test', model: 'vision-model' }], activeConversation: { id, model: 'vision-model' },
    busy: false, stoppable: false, messages: (extra.messages as any[]) || [], sendMessage: vi.fn().mockResolvedValue(true), stop: vi.fn().mockResolvedValue(undefined),
    deleteConversation: vi.fn().mockResolvedValue(true), setConversationModel: vi.fn(), resolveToolApproval: vi.fn().mockResolvedValue(undefined),
  };
  runtime.messagesForConversation = vi.fn((conversationId: string) => conversationId === runtime.activeConversationId ? runtime.messages : []);
  runtime.isConversationBusy = vi.fn((conversationId: string) => conversationId === runtime.activeConversationId && runtime.busy);
  runtime.isConversationStoppable = vi.fn((conversationId: string) => conversationId === runtime.activeConversationId && runtime.stoppable);
  runtime.newConversation = vi.fn(async (title: string) => {
    const nextId = `conversation-${sequence}-new-${runtime.conversations.length}`;
    const conversation = { id: nextId, title, model: 'vision-model' };
    runtime.conversations.push(conversation); runtime.activeConversationId = nextId; runtime.activeConversation = conversation;
    return conversation;
  });
  runtime.selectConversation = vi.fn(async (targetId: string) => {
    runtime.activeConversationId = targetId;
    runtime.activeConversation = runtime.conversations.find((item: any) => item.id === targetId) || { id: targetId, model: 'vision-model' };
  });
  const imageSettings = {
    imageAspectRatio: '1:1', imageAspectRatioOptions: [{ value: '1:1', label: 'Square' }, { value: '16:9', label: 'Landscape' }],
    imageResolution: '2k', imageResolutionOptions: [{ value: '2k', label: '2K' }, { value: '4k', label: '4K' }],
    imageQuality: 'high', imageQualityOptions: [{ value: 'high', label: 'High' }],
    onImageAspectRatioChange: vi.fn(), onImageResolutionChange: vi.fn(), onImageQualityChange: vi.fn(),
  };
  const onNotice = vi.fn();
  localStorage.setItem(`rhino-beta-binding-v1:${id}`, JSON.stringify({ documentId: 12, canvasId: 'canvas-one', instanceId: connection.instanceId }));
  localStorage.setItem(`rhino-beta-document-conversation-v2:${connection.instanceId}:12:canvas-one`, id);
  const command = { id: `request-${sequence}-12345`, kind: 'send', conversationId: id, content: '\u8bf7\u5206\u6790\u5bf9\u8c61', documentId: 12, ...extra };
  mocks.request.mockImplementation(async (_connection, path) => path === '/drawer/heartbeat' ? { command } : {});
  useRhinoBridge({ ...imageSettings, runtime: runtime as ReturnType<typeof useChatRuntime>, canvasId: 'canvas-one', selectedItems: () => (extra.selectedItems as any[]) || [], modelOptions: ['vision-model'], imageModel: 'auto', imageModelOptions: imageModelOptions as Array<{ value: string; supportsMask?: boolean }>, imageMaskMode: extra.imageMaskMode as 'off' | 'on' | undefined, onNotice });
  cleanup = mocks.effects[mocks.effects.length - 1]();
  return { runtime, command, onNotice, imageSettings };
}
async function settle() { await vi.advanceTimersByTimeAsync(0); }
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); mocks.effects.length = 0;
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, String(value)), removeItem: (key: string) => storage.delete(key) });
  mocks.discover.mockResolvedValue([connection]);
  mocks.activeDocument.mockResolvedValue({ documentId: 12, rhinoVersion: '9.0', name: 'Product Housing' });
  mocks.discoverNative.mockResolvedValue({ tools: [{ name: 'rhino_native_run_python', description: 'Python writes', inputSchema: { type: 'object' }, readOnly: false, destructive: true, workflowPhase: 'write' }] });
  mocks.call.mockResolvedValue([{ type: 'text', text: '{"documentId":12,"rhinoVersion":"9.0.26300.9401","rhinoMajorVersion":9,"rhinoMinorVersion":0}' }]);
  mocks.invoke.mockResolvedValue('C:/fixture/viewport.png');
});
afterEach(() => { cleanup?.(); cleanup = undefined; vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('Canvas Chat target discovery', () => {
  it('passes the explicitly requested Rhino version to the background host', async () => {
    mocks.invoke.mockResolvedValue({ rhinoVersion: '9.0.26300.9401', objects: [] });
    const target = await prepareCanvasRhinoTurn('background-rhino-nine', 'canvas-one', '帮我在rhino9用犀牛建模这个');
    try {
      expect(mocks.invoke).toHaveBeenCalledWith('rhino_headless_mcp_call', expect.objectContaining({ tool: 'context', requestedMajor: 9 }));
      expect(target.documentName).toBe('本机后台 Rhino 9.0.26300.9401');
      expect(mocks.discover).not.toHaveBeenCalled();
    } finally { target.release(); }
  });
  it('rejects an open document in a different version before discovering write tools', async () => {
    mocks.activeDocument.mockResolvedValueOnce({ documentId: 12, rhinoVersion: '8.0.23304.9001', name: 'Rhino 8 document' });
    await expect(prepareCanvasRhinoTurn('open-rhino-nine', 'canvas-one', '在当前 Rhino 9 文档建模')).rejects.toThrow('请求指定了 Rhino 9');
    expect(mocks.discoverNative).not.toHaveBeenCalled();
  });
  it('uses the background tool host without discovering or changing any open Rhino window', async () => {
    mocks.invoke.mockImplementation(async (command, args) => {
      expect(command).toBe('rhino_headless_mcp_call');
      return args.tool === 'context' ? { units: 'Millimeters', objects: [] } : { committed: true, objects: [{ id: 'part' }] };
    });
    const target = await prepareCanvasRhinoTurn('background-workspace', 'canvas-one', '根据这个图帮我建模');
    try {
      expect(mocks.discover).not.toHaveBeenCalled();
      expect(getRhinoTools('background-workspace', 'rhino').map(tool => tool.function.name)).toContain('rhino_native_headless_build');
      expect(getRhinoTools('background-workspace', 'desktop')).toHaveLength(0);
      const execute = withRhinoTools(vi.fn(), 'canvas-one');
      const request = { conversationId: 'background-workspace', messageId: 'task', executionSource: 'rhino' as const, userText: '帮我建模', recentMessages: [] };
      expect(await execute('rhino_native_headless_build', { operation: 'box', size: [1, 2, 3] }, request)).toMatchObject({ committed: true });
      expect(mocks.invoke.mock.calls[0][1].workspaceId).toBe(mocks.invoke.mock.calls[1][1].workspaceId);
    } finally { target.release(); }
  });
  it('exposes SubD cage creation, inspection and edits through the same background document', async () => {
    const id = '6bf3c007-8d6b-4d2a-b48f-59ad46386594';
    mocks.invoke.mockResolvedValue({ objects: [{ id, geometryType: 'SubD' }] });
    const conversationId = 'subd-workspace';
    const target = await prepareCanvasRhinoTurn(conversationId, 'canvas-one', '帮我用 SubD 做一个外壳');
    try {
      const build = getRhinoTools(conversationId, 'rhino').find(tool => tool.function.name === 'rhino_native_headless_build');
      expect(build?.function.parameters).toMatchObject({
        properties: { operation: { enum: expect.arrayContaining(['subd', 'edit_subd']) } },
      });
      expect(target).toMatchObject({ modelingInstruction: expect.stringContaining('native Rhino SubD') });
      const execute = withRhinoTools(vi.fn(), 'canvas-one');
      const request = { conversationId, messageId: 'task', executionSource: 'rhino' as const, userText: '帮我用 SubD 做一个外壳', recentMessages: [] };
      const cage = { operation: 'subd', cageVertices: [[0, 0, 0], [10, 0, 0], [0, 10, 0]], cageFaces: [[0, 1, 2]] };
      const edits = { operation: 'edit_subd', ids: [id], cageEdits: [{ vertexId: 1, point: [0, 0, 2] }] };
      for (const [tool, args] of [['build', cage], ['inspect', { subdId: id }], ['build', edits]] as const) {
        await execute(`rhino_native_headless_${tool}`, args, request);
        expect(mocks.invoke).toHaveBeenLastCalledWith('rhino_headless_mcp_call', expect.objectContaining({
          conversationId, tool, arguments: args, workspaceId: mocks.invoke.mock.calls[0][1].workspaceId,
        }));
      }
    } finally { target.release(); }
  });
  it('locks and pins the active document and never silently switches the same conversation to another document', async () => {
    const target = await prepareCanvasRhinoTurn('canvas-model-thread', 'canvas-one', '在当前 Rhino 文档建模');
    try {
      expect(target.documentName).toBe('Product Housing');
      expect(isRhinoCanvasLocked()).toBe(true);
      expect(mocks.discoverNative).toHaveBeenCalledWith(expect.objectContaining({ documentId: 12, canvasId: 'canvas-one' }), 'canvas-model-thread');
      await expect(prepareCanvasRhinoTurn('another-thread', 'canvas-two', '在当前 Rhino 文档建模')).rejects.toThrow('已有任务');
    } finally { target.release(); }
    mocks.activeDocument.mockResolvedValue({ documentId: 31, rhinoVersion: '9.0', name: 'Another Document' });
    await expect(prepareCanvasRhinoTurn('canvas-model-thread', 'canvas-one', '在当前 Rhino 文档建模')).rejects.toThrow('绑定的文档不同');
    expect(isRhinoCanvasLocked()).toBe(false);
  });
  it('does not guess among several Rhino instances or accept a read-only target', async () => {
    mocks.discover.mockResolvedValueOnce([connection, { ...connection, instanceId: 'c'.repeat(32) }]);
    await expect(prepareCanvasRhinoTurn('ambiguous-thread', 'canvas-one', '在当前 Rhino 文档建模')).rejects.toThrow('多个 Rhino 实例');
    expect(mocks.activeDocument).not.toHaveBeenCalled();
    mocks.discoverNative.mockResolvedValueOnce(undefined);
    await expect(prepareCanvasRhinoTurn('readonly-thread', 'canvas-one', '在当前 Rhino 文档建模')).rejects.toThrow('Rhino-MCP-Platform');
    expect(isRhinoCanvasLocked()).toBe(false);
  });
});
describe('Rhino desktop Chat bridge', () => {
  it.each([
    ['image-aspect-ratio', '16:9', 'onImageAspectRatioChange'],
    ['image-resolution', '4k', 'onImageResolutionChange'],
    ['image-quality', 'high', 'onImageQualityChange'],
  ] as const)('updates %s without running a model', async (kind, value, callback) => {
    const { runtime, imageSettings } = setup({ kind, value });
    await settle();
    expect(imageSettings[callback]).toHaveBeenCalledExactlyOnceWith(value);
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    expect(mocks.call).not.toHaveBeenCalled();
    expect(mocks.request).toHaveBeenCalledWith(connection, '/drawer/ack', expect.objectContaining({ status: 'completed' }));
  });
  it.each(['image-aspect-ratio', 'image-resolution', 'image-quality'])('rejects unsupported %s values', async kind => {
    const { runtime, imageSettings } = setup({ kind, value: 'unsupported-value' });
    await settle();
    expect(imageSettings.onImageAspectRatioChange).not.toHaveBeenCalled();
    expect(imageSettings.onImageResolutionChange).not.toHaveBeenCalled();
    expect(imageSettings.onImageQualityChange).not.toHaveBeenCalled();
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    expect(mocks.request).toHaveBeenCalledWith(connection, '/drawer/ack', expect.objectContaining({ status: 'failed' }));
  });
  it('publishes the active model image settings and supported options to the plugin', async () => {
    setup({ kind: 'image-resolution', value: '4k' }); await settle();
    expect(mocks.request).toHaveBeenCalledWith(connection, '/drawer/heartbeat', expect.objectContaining({ state: expect.objectContaining({
      imageResolution: '2k', imageAspectRatio: '1:1', imageQuality: 'high',
      imageResolutionOptions: [{ value: '2k', label: '2K' }, { value: '4k', label: '4K' }],
    }) }));
  });

  it('classifies effect image requests as visual canvas requests', () => { expect(isRhinoCanvasImageRequest('generate an effect image for the selected shell', 0)).toBe(true); });

  it('executes a repeated command once, after host acknowledgement', async () => {
    const { runtime } = setup(); await settle();
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.call).toHaveBeenCalledWith(expect.anything(), 'rhino_list_parts', { limit: 60 });
    expect(runtime.sendMessage.mock.calls[0][0]).toContain('[Rhino 真实分件清单]');
    const claimOrder = mocks.request.mock.invocationCallOrder[1];
    expect(claimOrder).toBeLessThan(runtime.sendMessage.mock.invocationCallOrder[0]);
    await vi.advanceTimersByTimeAsync(2_100);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(isRhinoCanvasLocked()).toBe(false);
  });
  it('routes native tool approval from the Rhino panel to the Rhino-scoped runtime', async () => {
    const { runtime, command } = setup();
    command.kind = 'approve-tool' as any;
    (command as any).toolCallId = 'native-call-1';
    (command as any).approved = true;
    await settle();
    expect(runtime.resolveToolApproval).toHaveBeenCalledWith('native-call-1', true);
  });
  it('deletes only the current Rhino conversation once after the request is claimed', async () => {
    const { runtime } = setup({ kind: 'delete' });
    await settle();
    expect(runtime.deleteConversation).toHaveBeenCalledExactlyOnceWith(runtime.activeConversationId);
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    expect(mocks.call).not.toHaveBeenCalled();
    expect(mocks.request).toHaveBeenCalledWith(connection, '/drawer/ack', expect.objectContaining({ status: 'completed' }));
    await vi.advanceTimersByTimeAsync(2_100);
    expect(runtime.deleteConversation).toHaveBeenCalledOnce();
  });
  it('rejects deletion of a stale or non-existent conversation', async () => {
    const { runtime } = setup({ kind: 'delete', conversationId: 'desktop-or-stale' });
    await settle();
    expect(runtime.deleteConversation).not.toHaveBeenCalled();
    expect(mocks.request).toHaveBeenCalledWith(connection, '/drawer/ack', expect.objectContaining({ status: 'failed' }));
  });
  it('does not delete a conversation while Chat is busy', async () => {
    const { runtime } = setup({ kind: 'delete' }); runtime.busy = true;
    await settle();
    expect(runtime.deleteConversation).not.toHaveBeenCalled();
    expect(mocks.request).toHaveBeenCalledWith(connection, '/drawer/ack', expect.objectContaining({ status: 'failed' }));
  });
  it('reports a refused deletion instead of acknowledging success', async () => {
    const { runtime } = setup({ kind: 'delete' }); runtime.deleteConversation.mockResolvedValue(false);
    await settle();
    expect(mocks.request).toHaveBeenCalledWith(connection, '/drawer/ack', expect.objectContaining({ status: 'failed' }));
  });
  it('stops document mutations before model dispatch when Rhino only exposes read tools', async () => {
    mocks.discoverNative.mockImplementationOnce(async (_binding, _conversationId, onNotice) => {
      onNotice?.('RhinoAI MCP connected with read-only tools');
      return { tools: [{ name: 'rhino_native_get_context', description: 'Read context', inputSchema: { type: 'object' }, readOnly: true, destructive: false, workflowPhase: 'context' }] };
    });
    mocks.call.mockResolvedValueOnce([{ type: 'text', text: '{\"documentId\":12,\"rhinoVersion\":\"8.0.23304.9001\",\"rhinoMajorVersion\":8,\"rhinoMinorVersion\":0}' }]);
    const { runtime, onNotice } = setup({ content: 'Create a real 3D model of a camera' });
    await settle();
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    expect(onNotice).toHaveBeenCalledWith(expect.stringContaining('8.19'));
    expect(mocks.request).toHaveBeenCalledWith(connection, '/drawer/ack', expect.objectContaining({ status: 'failed', error: expect.stringContaining('8.19') }));
  });
  it('warns when the native MCP listener is not discoverable for the bound Rhino document', async () => {
    mocks.discoverNative.mockImplementationOnce(async (_binding, _conversationId, onNotice) => { onNotice?.('MCPStart required'); return undefined; });
    const { onNotice } = setup(); await settle();
    expect(onNotice).toHaveBeenCalledWith(expect.stringContaining('MCPStart'));
  });
  it('does not invoke a model if claiming the request fails', async () => {
    const { runtime, command } = setup();
    mocks.request.mockImplementation(async (_connection, path) => { if (path.endsWith('ack')) throw new Error('lost acknowledgement'); return { command }; });
    await settle(); expect(runtime.sendMessage).not.toHaveBeenCalled();
  });
  it('keeps two Rhino instances with the same document serial connected and isolated while the first task runs', async () => {
    const { runtime, command } = setup();
    const firstConversationId = runtime.activeConversationId;
    const other = { ...connection, url: 'http://127.0.0.1:23456/', token: 'c'.repeat(64), instanceId: 'd'.repeat(32) };
    mocks.discover.mockResolvedValue([connection, other]);
    let firstFinished!: (value: boolean) => void;
    runtime.sendMessage.mockImplementationOnce(() => new Promise(resolve => { firstFinished = resolve; })).mockResolvedValue(true);
    const otherCommand = { ...command, id: 'other-instance-command-12345', conversationId: '', documentId: 12 };
    mocks.request.mockImplementation(async (target, path) => path === '/drawer/heartbeat' ? { command: target.instanceId === connection.instanceId ? command : otherCommand } : {});
    await settle();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(runtime.sendMessage).toHaveBeenCalledTimes(2);
    const targetIds = runtime.sendMessage.mock.calls.map((args: any[]) => args[6]);
    expect(new Set(targetIds).size).toBe(2);
    expect(targetIds).toContain(firstConversationId);
    const otherConversationId = targetIds.find((id: string) => id !== firstConversationId)!;
    expect(JSON.parse(localStorage.getItem(`rhino-beta-binding-v1:${firstConversationId}`)!)).toMatchObject({ instanceId: connection.instanceId, documentId: 12 });
    expect(JSON.parse(localStorage.getItem(`rhino-beta-binding-v1:${otherConversationId}`)!)).toMatchObject({ instanceId: other.instanceId, documentId: 12 });
    expect(localStorage.getItem(`rhino-beta-document-conversation-v2:${connection.instanceId}:12:canvas-one`)).toBe(firstConversationId);
    expect(localStorage.getItem(`rhino-beta-document-conversation-v2:${other.instanceId}:12:canvas-one`)).toBe(otherConversationId);
    const heartbeats = mocks.request.mock.calls.filter(([, path]) => path === '/drawer/heartbeat');
    for (const [target, , payload] of heartbeats) {
      for (const state of payload.state.documents) {
        for (const item of state.conversations) {
          expect(JSON.parse(localStorage.getItem(`rhino-beta-binding-v1:${item.id}`)!)).toMatchObject({ instanceId: target.instanceId });
        }
      }
      if (payload.state.conversationId) {
        expect(JSON.parse(localStorage.getItem(`rhino-beta-binding-v1:${payload.state.conversationId}`)!)).toMatchObject({ instanceId: target.instanceId });
      } else expect(payload.state.messages).toEqual([]);
    }
    expect(heartbeats.filter(([target]) => target.instanceId === connection.instanceId).length).toBeGreaterThanOrEqual(3);
    expect(heartbeats.filter(([target]) => target.instanceId === other.instanceId).length).toBeGreaterThanOrEqual(2);
    expect(runtime.newConversation.mock.calls[0][0]).toBe('\u65b0\u5bf9\u8bdd');
    firstFinished(true); await settle();
  });

  it('keeps the healthy Rhino window refreshing when another instance heartbeat never returns', async () => {
    const { command } = setup();
    const offline = { ...connection, url: 'http://127.0.0.1:23456/', instanceId: 'd'.repeat(32) };
    mocks.discover.mockResolvedValue([offline, connection]);
    let releaseOffline!: (value: object) => void;
    mocks.request.mockImplementation(async (target, path) => {
      if (path !== '/drawer/heartbeat') return {};
      if (target.instanceId === offline.instanceId) return new Promise(resolve => { releaseOffline = resolve; });
      return { command };
    });
    await settle(); await vi.advanceTimersByTimeAsync(3_000);
    expect(mocks.request.mock.calls.filter(([target, path]) => target.instanceId === connection.instanceId && path === '/drawer/heartbeat')).toHaveLength(4);
    expect(mocks.request.mock.calls.filter(([target, path]) => target.instanceId === offline.instanceId && path === '/drawer/heartbeat')).toHaveLength(1);
    releaseOffline({}); await settle();
  });

  it('runs commands concurrently in distinct Rhino documents without sharing their chat threads', async () => {
    const { runtime, command: first } = setup();
    const second = { id: 'request-doc22-12345', kind: 'send', conversationId: '', content: 'Build a box in the new file', documentId: 22 };
    const pending: Array<{ conversationId: string; resolve: (value: boolean) => void }> = [];
    runtime.sendMessage.mockImplementation((_content: string, _attachments: unknown[], _model: unknown, _accepted: unknown, _resume: unknown, _source: string, conversationId: string) => new Promise(resolve => pending.push({ conversationId, resolve })));
    let nextCommand: any = first;
    mocks.request.mockImplementation(async (_connection, path, body) => {
      if (path === '/drawer/heartbeat') return { command: nextCommand };
      if (path === '/drawer/ack' && body?.status === 'accepted' && body.id === first.id) nextCommand = second;
      return {};
    });
    await settle();
    expect(pending).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    await settle();
    expect(pending).toHaveLength(2);
    expect(pending[0].conversationId).not.toBe(pending[1].conversationId);
    expect(mocks.discoverNative).toHaveBeenCalledWith(expect.objectContaining({ documentId: 12 }), expect.any(String), expect.any(Function));
    expect(mocks.discoverNative).toHaveBeenCalledWith(expect.objectContaining({ documentId: 22 }), expect.any(String), expect.any(Function));
    pending.forEach(item => item.resolve(true));
    await settle();
    expect(mocks.request).toHaveBeenCalledWith(connection, '/drawer/ack', expect.objectContaining({ id: first.id, status: 'completed' }));
    expect(mocks.request).toHaveBeenCalledWith(connection, '/drawer/ack', expect.objectContaining({ id: second.id, status: 'completed' }));
  });

  it("keeps the user's active viewport mode as context without enabling a Mask by default", async () => {
    const { runtime } = setup({ content: 'generate an effect image for the selected shell', includeViewport: false, includeCanvasSelection: false });
    mocks.call.mockImplementation(async (_binding, name) => {
      if (name === 'rhino_capture_viewport') return [
        { type: 'image', mimeType: 'image/png', data: 'c2hhZGVk' },
        { type: 'image', mimeType: 'image/png', data: 'bWFzaw==' },
        { type: 'text', text: '{"captureMode":"current"}' },
      ];
      return [{ type: 'text', text: '{"documentId":12}' }];
    });
    mocks.invoke.mockImplementation(async (_name, args) => String(args.fileName || '').includes('mask') ? 'C:/fixture/rhino-mask.png' : 'C:/fixture/rhino-rendered.png');
    await settle();

    expect(mocks.call).toHaveBeenCalledWith(expect.anything(), 'rhino_capture_viewport', {});
    const send = runtime.sendMessage.mock.calls[0];
    expect(send[0]).toContain('Rhino canvas visual context');
    expect(send[1]).toEqual([expect.objectContaining({ path: 'C:/fixture/rhino-rendered.png', type: 'image' })]);
    expect(send[0]).toContain("viewport uses the user's active display mode");
    expect(send[0]).toContain('Decide from the users semantic request');
    expect(send[5]).toBe('rhino');
  });

  it('forces Rendered only when the user explicitly asks for Rendered viewport mode', async () => {
    const { runtime } = setup({ content: 'Switch the viewport to Rendered mode and capture it', includeViewport: true, includeCanvasSelection: false });
    mocks.call.mockImplementation(async (_binding, name) => name === 'rhino_capture_viewport'
      ? [{ type: 'image', mimeType: 'image/png', data: 'cGl4ZWxz' }, { type: 'text', text: '{"captureMode":"rendered"}' }]
      : [{ type: 'text', text: '{"documentId":12}' }]);
    await settle();
    expect(mocks.call).toHaveBeenCalledWith(expect.anything(), 'rhino_capture_viewport', { rendered: true });
    expect(runtime.sendMessage.mock.calls[0][1][0].metadataJson).toContain('\"captureMode\":\"rendered\"');
  });

  it('attaches a same-camera Mask only after explicit opt-in on a supporting route', async () => {
    const { runtime } = setup({ content: 'generate an effect image for the selected shell', includeViewport: false, includeCanvasSelection: false, imageMaskMode: 'on' });
    mocks.call.mockImplementation(async (_binding, name) => name === 'rhino_capture_viewport'
      ? [
          { type: 'image', mimeType: 'image/png', data: 'c2hhZGVk' },
          { type: 'image', mimeType: 'image/png', data: 'bWFzaw==' },
          { type: 'text', text: '{"captureMode":"current"}' },
        ]
      : [{ type: 'text', text: '{"documentId":12}' }]);
    mocks.invoke.mockImplementation(async (_name, args) => String(args.fileName || '').includes('mask') ? 'C:/fixture/rhino-mask.png' : 'C:/fixture/rhino-rendered.png');
    await settle();
    expect(mocks.call).toHaveBeenCalledWith(expect.anything(), 'rhino_capture_viewport', { includeMask: true, maskLayer: 'selection' });
    expect(runtime.sendMessage.mock.calls[0][1]).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'C:/fixture/rhino-rendered.png', type: 'image' }),
      expect.objectContaining({ path: 'C:/fixture/rhino-mask.png', type: 'image', metadataJson: expect.stringContaining('\"role\":\"mask\"') }),
    ]));
  });

  it("keeps the active visual capture mode but omits the mask when the selected image route does not support it", async () => {
    const { runtime } = setup({ content: 'generate an effect image for the selected shell', includeViewport: false, includeCanvasSelection: false, imageModelOptions: [{ value: 'auto' }] });
    mocks.call.mockImplementation(async (_binding, name) => name === 'rhino_capture_viewport'
      ? [{ type: 'image', mimeType: 'image/png', data: 'c2hhZGVk' }, { type: 'text', text: '{\"captureMode\":\"shaded\"}' }]
      : [{ type: 'text', text: '{\"documentId\":12}' }]);
    mocks.invoke.mockResolvedValue('C:/fixture/rhino-rendered.png');
    await settle();
    expect(mocks.call).toHaveBeenCalledWith(expect.anything(), 'rhino_capture_viewport', {});
    const send = runtime.sendMessage.mock.calls[0];
    expect(send[1]).toHaveLength(1);
    expect(send[1][0].metadataJson).not.toContain('\"role\":\"mask\"');
    expect(send[0]).toContain('no Mask was requested or attached');
  });

  it('includes generated canvas images in Rhino panel history when media is returned by URL', async () => {
    class PreviewImage {
      width = 1200;
      height = 800;
      naturalWidth = 1200;
      naturalHeight = 800;
      onload?: () => void;
      onerror?: () => void;
      set src(_value: string) { this.onload?.(); }
    }
    vi.stubGlobal('Image', PreviewImage);
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toDataURL: () => 'data:image/jpeg;base64,cHJldmlldw==',
      }),
    });
    const generatedMessage = {
      id: 'assistant-generated', role: 'assistant', content: 'Generated image', status: 'completed',
      attachments: [], toolCalls: [{
        id: 'generate-call', messageId: 'assistant-generated', toolName: 'generate_image',
        argumentsJson: '{}', resultJson: JSON.stringify({ media: [{ type: 'image', url: 'https://images.example/generated.png' }] }), status: 'completed', createdAt: 1,
      }], createdAt: 1,
    };
    const { command } = setup({ messages: [generatedMessage] });
    mocks.invoke.mockImplementation(async (name, args) => {
      if (name === 'cache_web_image') return 'C:/fixture/generated.png';
      if (name === 'read_local_image_data_url') { if (String(args?.path || '').startsWith('https:')) throw new Error('not local'); return 'data:image/png;base64,aW1hZ2U='; }
      return String(args?.fileName || '').includes('mask') ? 'C:/fixture/mask.png' : 'C:/fixture/viewport.png';
    });
    let panelState: any;
    mocks.request.mockImplementation(async (_connection, path, body) => {
      if (path === '/drawer/heartbeat') { panelState = body.state; return { command }; }
      return {};
    });

    await settle();

    expect(mocks.invoke).toHaveBeenCalledWith('cache_web_image', expect.objectContaining({ url: 'https://images.example/generated.png' }));
    expect(panelState.messages.find((message: any) => message.id === 'assistant-generated').images)
      .toEqual(['data:image/jpeg;base64,cHJldmlldw==']);
  });

  it('prefers the durable generated image path over a broken asset thumbnail URL', async () => {
    class PreviewImage {
      width = 640;
      height = 480;
      naturalWidth = 640;
      naturalHeight = 480;
      onload?: () => void;
      onerror?: () => void;
      set src(_value: string) { this.onload?.(); }
    }
    vi.stubGlobal('Image', PreviewImage);
    vi.stubGlobal('document', {
      createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage: vi.fn() }), toDataURL: () => 'data:image/jpeg;base64,bG9jYWw=' }),
    });
    const generatedMessage = {
      id: 'assistant-generated-path', role: 'assistant', content: 'Generated image', status: 'completed', attachments: [],
      toolCalls: [{ id: 'generate-path', messageId: 'assistant-generated-path', toolName: 'generate_image', argumentsJson: '{}',
        resultJson: JSON.stringify({ media: [{ type: 'image', path: 'C:/fixture/generated-local.jpg', thumbnail: 'http://asset.localhost/broken-thumb.jpg' }] }), status: 'completed', createdAt: 1 }], createdAt: 1,
    };
    const { command } = setup({ messages: [generatedMessage] });
    let panelState: any;
    mocks.invoke.mockImplementation(async (name, args) => {
      if (name === 'read_local_image_data_url' && args.path === 'C:/fixture/generated-local.jpg') return 'data:image/jpeg;base64,aW1hZ2U=';
      if (name === 'read_local_image_data_url') throw new Error('broken thumbnail');
      return 'C:/fixture/viewport.png';
    });
    mocks.request.mockImplementation(async (_connection, path, body) => {
      if (path === '/drawer/heartbeat') { panelState = body.state; return { command }; }
      return {};
    });

    await settle();

    expect(mocks.invoke).toHaveBeenCalledWith('read_local_image_data_url', { path: 'C:/fixture/generated-local.jpg' });
    expect(panelState.messages.find((message: any) => message.id === 'assistant-generated-path').images)
      .toEqual(['data:image/jpeg;base64,bG9jYWw=']);
  });

  it('sends selected canvas images to native Rhino modeling without requiring a viewport capture', async () => {
    const selectedImage = {
      id: 'canvas-image', type: 'image', name: 'phone reference', references: [{
        id: 'reference-1', nodeId: 'canvas-node-1', name: 'phone reference', mediaType: 'image',
        path: 'C:/fixture/selected-reference.png', source: 'C:/fixture/selected-reference.png', thumbnail: 'C:/fixture/selected-reference.png',
      }],
    };
    const { runtime } = setup({
      content: '\u6211\u5728\u753b\u5e03\u9009\u4e86\u4e00\u5f20\u56fe\u7247\uff0c\u5e2e\u6211\u5efa\u6a21',
      includeCanvasSelection: true, includeViewport: true, selectedItems: [selectedImage],
    });
    await settle();
    expect(isRhinoCanvasImageRequest('\u5e2e\u6211\u7528\u753b\u5e03\u9009\u4e2d\u7684\u56fe\u7247\u5efa\u6a21', 1)).toBe(false);
    expect(mocks.call).toHaveBeenCalledWith(expect.anything(), 'rhino_get_context');
    expect(mocks.call).toHaveBeenCalledWith(expect.anything(), 'rhino_list_parts', { limit: 60 });
    expect(mocks.call).not.toHaveBeenCalledWith(expect.anything(), 'rhino_capture_viewport', expect.anything());
    const [content, attachments] = runtime.sendMessage.mock.calls[0];
    expect(content).toContain('Attached local/canvas images are modeling references');
    expect(attachments).toEqual([expect.objectContaining({ path: 'C:/fixture/selected-reference.png', type: 'image' })]);
  });

  it('captures selected Rhino models in the current viewport mode by default', async () => {
    const { runtime } = setup({ includeViewport: false });
    mocks.call.mockImplementation(async (_binding, name) => name === 'rhino_get_context'
      ? [{ type: 'text', text: '{"documentId":12,"selection":[{"id":"selected-object"}]}' }]
      : name === 'rhino_capture_viewport'
        ? [{ type: 'image', mimeType: 'image/png', data: 'Y3VycmVudA==' }, { type: 'text', text: '{"captureMode":"current"}' }]
        : [{ type: 'text', text: '{"documentId":12}' }]);
    mocks.invoke.mockResolvedValue('C:/fixture/rhino-current.png');

    await settle();

    expect(mocks.call).toHaveBeenCalledWith(expect.anything(), 'rhino_capture_viewport', {});
    expect(runtime.sendMessage.mock.calls[0][1][0].metadataJson).toContain('"captureMode":"current"');
  });

  it('imports viewport pixels as a real Chat attachment and retains capture metadata', async () => {
    const { runtime } = setup({ includeViewport: true });
    mocks.call.mockImplementation(async (_binding, name) => name === 'rhino_capture_viewport'
      ? [{ type: 'image', mimeType: 'image/png', data: 'cGl4ZWxz' }, { type: 'text', text: '{"captureCamera":"frozen"}' }]
      : [{ type: 'text', text: '{"earlierCamera":"old"}' }]);
    await settle();
    expect(mocks.invoke).toHaveBeenCalledWith('save_dropped_file', expect.objectContaining({ dataUrl: 'data:image/png;base64,cGl4ZWxz' }));
    expect(mocks.call).toHaveBeenCalledWith(expect.anything(), 'rhino_capture_viewport', {});
    expect(runtime.sendMessage.mock.calls[0][1][0].metadataJson).toContain('\"captureMode\":\"current\"');
    expect(mocks.call).toHaveBeenCalledWith(expect.anything(), 'rhino_list_parts', { limit: 60 });
    expect(runtime.sendMessage.mock.calls[0][0]).toContain('[Rhino 真实分件清单]');
    expect(runtime.sendMessage.mock.calls[0][0]).toContain('captureCamera');
    expect(runtime.sendMessage.mock.calls[0][1][0].metadataJson).toContain('"captureMode":"current"');
    expect(runtime.sendMessage.mock.calls[0][1]).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'C:/fixture/viewport.png', type: 'image' })]));
    expect(runtime.sendMessage.mock.calls[0][5]).toBe('rhino');
    expect(runtime.sendMessage.mock.calls[0][6]).toBeTruthy();
  });
  it('allows geometry creation in an empty Rhino document even without a canvas image', async () => {
    const { runtime } = setup({ includeViewport: true, content: 'Create a real 3D model of a bracket' });
    mocks.call.mockImplementation(async (_binding, name) => {
      if (name === 'rhino_capture_viewport') throw new Error('Rhino current viewport capture is blank');
      return [{ type: 'text', text: '{"documentId":12,"selection":[]}' }];
    });
    await settle();
    expect(runtime.sendMessage).toHaveBeenCalledOnce();
    expect(mocks.call).not.toHaveBeenCalledWith(expect.anything(), 'rhino_capture_viewport', expect.anything());
    expect(runtime.sendMessage.mock.calls[0][1]).toEqual([]);
    expect(mocks.invoke).not.toHaveBeenCalledWith('save_dropped_file', expect.anything());
  });
  it.each(['帮我建一个花瓶', '我要建模，不要生成图片', '在 GH2 建模，不需要渲染', '帮我建一个模型，然后生成效果图'])('starts %s from text even when the old image Mask toggle remains on', async content => {
    const { runtime } = setup({ content, includeViewport: true, imageMaskMode: 'on', includeCanvasSelection: false });
    mocks.call.mockImplementation(async (_binding, name) => {
      if (name === 'rhino_capture_viewport') throw new Error('Rhino current viewport capture is blank');
      return [{ type: 'text', text: '{"documentId":12,"selection":[]}' }];
    });
    await settle();
    expect(runtime.sendMessage).toHaveBeenCalledOnce();
    expect(runtime.sendMessage.mock.calls[0][1]).toEqual([]);
    expect(mocks.call).not.toHaveBeenCalledWith(expect.anything(), 'rhino_capture_viewport', expect.anything());
    expect(mocks.invoke).not.toHaveBeenCalledWith('save_dropped_file', expect.anything());
    expect(mocks.request).toHaveBeenCalledWith(connection, '/drawer/ack', expect.objectContaining({ status: 'completed' }));
  });

  it('omits an optional blank viewport for ordinary document queries instead of failing the native task', async () => {
    const { runtime } = setup({ includeViewport: true, content: 'List the document layers' });
    mocks.call.mockImplementation(async (_binding, name) => {
      if (name === 'rhino_capture_viewport') throw new Error('Rhino current viewport capture is blank');
      return [{ type: 'text', text: '{"documentId":12,"selection":[]}' }];
    });
    await settle();
    expect(runtime.sendMessage).toHaveBeenCalledOnce();
    expect(runtime.sendMessage.mock.calls[0][0]).toContain('viewport was unavailable and omitted');
    expect(runtime.sendMessage.mock.calls[0][1]).toEqual([]);
    expect(mocks.invoke).not.toHaveBeenCalledWith('save_dropped_file', expect.anything());
  });

  it('stops before uploading or generating when the explicitly requested Rendered capture is blank', async () => {
    const { runtime } = setup({ includeViewport: true, content: 'capture the selected model in rendered viewport mode' });
    mocks.call.mockImplementation(async (_binding, name) => {
      if (name === 'rhino_capture_viewport') throw new Error('Rhino Rendered viewport capture is blank');
      return [{ type: 'text', text: '{"documentId":12}' }];
    });
    await settle();
    expect(mocks.call).toHaveBeenCalledWith(expect.anything(), 'rhino_capture_viewport', { rendered: true });
    expect(mocks.invoke).not.toHaveBeenCalledWith('save_dropped_file', expect.anything());
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    expect(mocks.request).toHaveBeenCalledWith(connection, '/drawer/ack', expect.objectContaining({ status: 'failed', error: expect.stringContaining('capture is blank') }));
  });
  it('rejects a stale same-document conversation before calling models', async () => {
    const { runtime } = setup({ conversationId: 'different-chat' }); await settle();
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    expect(mocks.request).toHaveBeenCalledWith(connection, '/drawer/ack', expect.objectContaining({ status: 'failed' }));
  });
  it('uses the new document conversation immediately while the React render still holds the old list', async () => {
    const { runtime, command } = setup({ kind: 'new' });
    const oldId = runtime.activeConversationId;
    const fresh = { id: oldId + '-fresh', title: '新对话', model: 'vision-model' };
    let current = { conversations: runtime.conversations, activeConversationId: oldId };
    runtime.getConversationState = () => current;
    runtime.newConversation.mockImplementation(async () => {
      current = { conversations: [fresh, ...runtime.conversations], activeConversationId: fresh.id };
      return fresh;
    });
    await settle();
    expect(runtime.conversations).not.toContainEqual(fresh);
    command.id += '-send'; command.kind = 'send'; command.conversationId = fresh.id; command.content = '帮我建一个花瓶';
    await vi.advanceTimersByTimeAsync(1100);
    expect(runtime.newConversation).toHaveBeenCalledOnce();
    expect(runtime.sendMessage).toHaveBeenCalledOnce();
    expect(runtime.sendMessage.mock.calls[0][6]).toBe(fresh.id);
    expect(mocks.request).toHaveBeenCalledWith(connection, '/drawer/heartbeat', expect.objectContaining({ state: expect.objectContaining({ conversationId: fresh.id }) }));
    expect(mocks.request).not.toHaveBeenCalledWith(connection, '/drawer/ack', expect.objectContaining({ status: 'failed' }));
  });
  it('creates an independent conversation for a new Rhino document and pins calls to that document ID', async () => {
    const { runtime, command } = setup({ documentId: 22, conversationId: '' }); await settle();
    expect(runtime.newConversation).toHaveBeenCalledOnce();
    expect(runtime.sendMessage).toHaveBeenCalledOnce();
    expect(runtime.sendMessage.mock.calls[0][6]).not.toBe('conversation-1');
    expect(mocks.discoverNative).toHaveBeenCalledWith(expect.objectContaining({ documentId: 22 }), expect.any(String), expect.any(Function));
    expect(mocks.request).toHaveBeenCalledWith(connection, '/drawer/ack', expect.objectContaining({ id: command.id, status: 'completed' }));
  });

  it('does not inject Rhino tools into the desktop-origin tool list', async () => {
    const { runtime } = setup(); await settle();
    expect(getRhinoTools(runtime.activeConversationId, 'desktop')).toEqual([]);
    expect(getRhinoTools(runtime.activeConversationId, 'rhino').length).toBeGreaterThan(0);
  });
  it('reads the bundled Skill resource locally through an allowlisted Rhino-only tool', async () => {
    const { runtime } = setup(); await settle();
    const tool = getRhinoTools(runtime.activeConversationId, 'rhino').find(item => item.function.name === RHINO_MODELING_SKILL_RESOURCE_TOOL);
    expect(tool?.function.parameters).toMatchObject({ required: ['resourcePath'], additionalProperties: false });
    const execute = vi.fn();
    mocks.call.mockClear();
    const result = await withRhinoTools(execute, 'canvas-one')(RHINO_MODELING_SKILL_RESOURCE_TOOL, {
      resourcePath: 'references/modeling-methods.md',
    }, {
      executionSource: 'rhino', conversationId: runtime.activeConversationId, messageId: 'skill-resource', userText: 'read the required skill reference', recentMessages: [],
    }) as { content: string };
    expect(result.content).toContain('NetworkSrf');
    expect(result.content).toContain('BlendSrf');
    expect(mocks.call).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
  it('does not allow the bundled Skill reader to resolve arbitrary paths', async () => {
    const { runtime } = setup(); await settle();
    await expect(withRhinoTools(vi.fn(), 'canvas-one')(RHINO_MODELING_SKILL_RESOURCE_TOOL, {
      resourcePath: '../../.ssh/id_rsa',
    }, {
      executionSource: 'rhino', conversationId: runtime.activeConversationId, messageId: 'skill-resource-invalid', userText: 'read a file', recentMessages: [],
    })).rejects.toThrow('Unknown bundled Rhino modeling Skill resource');
  });  it('blocks Rhino read tools from the desktop-origin Chat path', async () => {
    const { runtime } = setup(); await settle();
    const execute = vi.fn();
    await expect(withRhinoTools(execute, 'canvas-one')('rhino_get_context', {}, {
      conversationId: runtime.activeConversationId, messageId: 'desktop-message', userText: 'read Rhino', recentMessages: [],
    })).rejects.toThrow('已绑定文档的建模对话');
    expect(execute).not.toHaveBeenCalled();
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

describe('on-demand Rhino image preview', () => {
  it('reads a 2048px preview while modeling is busy without model dispatch or canvas locking', async () => {
    class PreviewImage { naturalWidth = 4096; naturalHeight = 2048; onload?: () => void; onerror?: () => void; set src(_value: string) { this.onload?.(); } }
    vi.stubGlobal('Image', PreviewImage);
    const sizes: number[] = [];
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage: vi.fn() }), toDataURL() { sizes.push(this.width); return 'data:image/jpeg;base64,aW1hZ2U='; } }) });
    const message = { id: 'preview-read-msg', role: 'assistant', content: '**完成**', status: 'completed', attachments: [], toolCalls: [{ id: 'preview-tool', toolName: 'generate_image', argumentsJson: '{}', resultJson: JSON.stringify({ media: [{ type: 'image', path: 'C:/fixture/on-demand-preview.jpg' }] }), status: 'completed', createdAt: 1 }], createdAt: 1 };
    mocks.invoke.mockResolvedValue('data:image/png;base64,aW1hZ2U=');
    const { runtime } = setup({ kind: 'preview-image', messageId: message.id, imageIndex: 0, messages: [message] }); runtime.busy = true;
    await settle();
    expect(runtime.sendMessage).not.toHaveBeenCalled(); expect(mocks.discoverNative).not.toHaveBeenCalled(); expect(mocks.call).not.toHaveBeenCalled();
    expect(runtime.newConversation).not.toHaveBeenCalled(); expect(isRhinoCanvasLocked()).toBe(false);
    expect(sizes).toContain(512); expect(sizes).toContain(2048);
    expect(mocks.request).toHaveBeenCalledWith(connection, '/drawer/ack', expect.objectContaining({ status: 'completed', image: 'data:image/jpeg;base64,aW1hZ2U=' }));
  });
  it.each([{ documentId: 99 }, { messageId: 'not-in-conversation' }, { imageIndex: -1 }, { imageIndex: 1.5 }])('rejects stale or mismatched image identity %j', async invalid => {
    const { runtime } = setup({ kind: 'preview-image', messageId: 'missing', imageIndex: 0, ...invalid });
    await settle(); expect(runtime.sendMessage).not.toHaveBeenCalled(); expect(mocks.invoke).not.toHaveBeenCalled();
    expect(mocks.request).toHaveBeenCalledWith(connection, '/drawer/ack', expect.objectContaining({ status: 'failed' }));
    expect(isRhinoCanvasLocked()).toBe(false);
  });
});

describe('existing Rhino conversation model updates', () => {
  it('updates the target model without creating a new chat or invoking MCP', async () => {
    const {runtime}=setup({kind:'model',value:'vision-model',messages:[{id:'old-history',role:'user',content:'Previous request',attachments:[],toolCalls:[],status:'completed',createdAt:1}]});
    runtime.setConversationModel.mockResolvedValue(true); await settle();
    expect(runtime.setConversationModel).toHaveBeenCalledExactlyOnceWith('vision-model',runtime.activeConversationId);
    expect(runtime.newConversation).not.toHaveBeenCalled(); expect(runtime.sendMessage).not.toHaveBeenCalled(); expect(mocks.call).not.toHaveBeenCalled();
    expect(mocks.request).toHaveBeenCalledWith(connection,'/drawer/ack',expect.objectContaining({status:'completed'}));
  });
  it('reports a refused model save as failure, not success', async () => {
    const {runtime}=setup({kind:'model',value:'vision-model'}); runtime.setConversationModel.mockResolvedValue(false); await settle();
    expect(runtime.newConversation).not.toHaveBeenCalled();
    expect(mocks.request).toHaveBeenCalledWith(connection,'/drawer/ack',expect.objectContaining({status:'failed',error:expect.stringContaining('无需新建对话')}));
  });
  it('recovers a missing saved document selection from the existing bound conversation', async () => {
    const {runtime}=setup({kind:'model',value:'vision-model'}); localStorage.removeItem?.('unused');
    localStorage.setItem('rhino-beta-document-conversation-v2:'+connection.instanceId+':12:canvas-one','missing-id');
    await settle(); expect(runtime.newConversation).not.toHaveBeenCalled(); expect(runtime.setConversationModel).toHaveBeenCalledWith('vision-model',runtime.activeConversationId);
  });
});

describe('non-modeling MCP requests do not depend on visual preprocessing', () => {
  it.each(['把选中对象的材质改成金属','查询所有图层','把相机移到模型右侧','保存当前文档'])('continues %s when optional capture and parts readers fail', async content => {
    const {runtime}=setup({content,includeViewport:true});
    mocks.call.mockImplementation(async(_binding,name)=>{ if(name==='rhino_get_context')return [{type:'text',text:JSON.stringify({rhinoVersion:'9.0',selection:['object']})}]; throw new Error('optional context capture failed'); });
    await settle();expect(runtime.sendMessage).toHaveBeenCalledOnce();
    expect(runtime.sendMessage.mock.calls[0][0]).toContain('queries, selection, layers/materials, views/cameras, files');
    expect(runtime.sendMessage.mock.calls[0][0]).toContain('Optional parts inventory is unavailable');
    expect(mocks.request).toHaveBeenCalledWith(connection,'/drawer/ack',expect.objectContaining({status:'completed'}));
  });
});

describe('geometry inspection does not require a product-specific modeling keyword',()=>{
 it('checks the real AddBrep script for the short camera request and never replays a NameError',async()=>{
  const {runtime}=setup({content:'帮我建一个摄像头'});await settle();
  registerRhinoNativeTools(runtime.activeConversationId,[{name:'rhino_native_run_python',description:'Python',inputSchema:{type:'object'},readOnly:false,destructive:true,workflowPhase:'write'}]);
  const snapshots={version:1,documentId:12,units:'Millimeters',tolerance:0.01,objectCount:0,objects:[],documentChanged:false,readOnly:true};
  mocks.call.mockClear();mocks.call.mockImplementation(async(_binding,name)=>{
   if(name==='rhino_native_snapshot_document_geometry')return [{type:'text',text:JSON.stringify({stdout:'INSPIRATION_DOCUMENT_GEOMETRY_V1:'+JSON.stringify(snapshots),stderr:''})}];
   throw new RhinoNativeMcpToolError("Traceback (most recent call last):\n line 65\nNameError: name 'unknown_variable' is not defined");
  });
  await expect(withRhinoTools(vi.fn(),'canvas-one')('rhino_native_run_python',{script:'import Rhino\n__rhino_doc__.Objects.AddBrep(solid)'},{executionSource:'rhino',conversationId:runtime.activeConversationId,messageId:'error-model',userText:'帮我建一个摄像头',recentMessages:[]})).rejects.toMatchObject({name:'RhinoDocumentGeometryWriteError',geometryVerification:{writeFailed:true,status:'no_geometry_change'}});
  expect(mocks.call.mock.calls.map(call=>call[1])).toEqual(['rhino_native_snapshot_document_geometry','rhino_native_run_python','rhino_native_snapshot_document_geometry']);
 });
});

describe('follow-up image references are hidden only in Rhino history presentation',()=>{
 it('keeps auto-attached inputs in Chat storage while showing only new generated images',async()=>{
  class PreviewImage {naturalWidth=640;naturalHeight=480;onload?:()=>void;set src(_value:string){this.onload?.();}}
  vi.stubGlobal('Image',PreviewImage);vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>({drawImage:vi.fn()}),toDataURL:()=> 'data:image/jpeg;base64,cHJldmlldw=='})});
  mocks.invoke.mockResolvedValue('data:image/png;base64,aW1hZ2U=');
  const messages:any[]=[
   {id:'first',role:'user',content:'给模型效果图',status:'completed',attachments:[{id:'selection-original',type:'image',path:'C:/fixture/source.jpg',metadataJson:JSON.stringify({nodeId:'a'})}],toolCalls:[],createdAt:1},
   {id:'generated',role:'assistant',content:'完成',status:'completed',attachments:[],toolCalls:[{id:'g',toolName:'generate_image',status:'completed',resultJson:JSON.stringify({media:[{type:'image',path:'C:/fixture/out.jpg'}]})}],createdAt:2},
   {id:'followup',role:'user',content:'不要改变角度',status:'completed',attachments:[{id:'selection-again',type:'image',path:'C:/fixture/source.jpg',metadataJson:JSON.stringify({nodeId:'a'})},{id:'rhino-current',type:'image',path:'C:/fixture/view.jpg',metadataJson:JSON.stringify({source:'rhino'})},{id:'user-explicit',type:'image',path:'C:/fixture/manual.jpg',metadataJson:'{}'}],toolCalls:[],createdAt:3},
  ];
  const {runtime,command}=setup({messages});let panel:any;
  mocks.request.mockImplementation(async(_connection,path,body)=>{if(path==='/drawer/heartbeat'){panel=body.state;return {command};}return {};});await settle();
  expect(runtime.messages[2].attachments).toHaveLength(3);expect(panel.messages.find((item:any)=>item.id==='first').images).toHaveLength(1);
  expect(panel.messages.find((item:any)=>item.id==='generated').images).toHaveLength(1);
  expect(panel.messages.find((item:any)=>item.id==='followup')).toMatchObject({hiddenReferenceCount:2,imageIndices:[2],images:['data:image/jpeg;base64,cHJldmlldw==']});
 });
});

describe('visual requests keep both uploaded canvas references and correctly-modeled Rhino captures',()=>{
 it('preserves the model inputs while rendering only assistant output images in chat history',async()=>{
  const selectedImage={id:'selected-speaker-reference',type:'image',references:[{id:'speaker-ref-1',nodeId:'speaker-canvas-node',name:'reference',mediaType:'image',path:'C:/fixture/speaker-reference.png',source:'C:/fixture/speaker-reference.png',thumbnail:'C:/fixture/speaker-reference.png'}]};
  const {runtime}=setup({content:'参考画布图片为选中的音箱模型生成效果图',includeCanvasSelection:true,includeViewport:true,selectedItems:[selectedImage]});
  mocks.call.mockImplementation(async(_binding,name)=> name==='rhino_get_context'
    ? [{type:'text',text:JSON.stringify({documentId:12,selection:[{id:'speaker-object'}]})}]
    : name==='rhino_capture_viewport'
      ? [{type:'image',mimeType:'image/png',data:'Y3VycmVudA=='},{type:'text',text:'{"captureMode":"current"}'}]
      : [{type:'text',text:'{}'}]);
  await settle();
  expect(mocks.call).toHaveBeenCalledWith(expect.anything(),'rhino_capture_viewport',{});
  const attachments=runtime.sendMessage.mock.calls[0][1];
  expect(attachments).toEqual(expect.arrayContaining([
    expect.objectContaining({path:'C:/fixture/speaker-reference.png',type:'image'}),
    expect.objectContaining({path:'C:/fixture/viewport.png',type:'image',metadataJson:expect.stringContaining('"captureMode":"current"')}),
  ]));
  const source=(await import('./useRhinoBridge')).rhinoMessageImageSources;
  const priorUser={attachments,toolCalls:[],role:'user'} as any;
  expect(source(priorUser)).toHaveLength(2);
 });
});


describe('Rhino local reference bridge', () => {
  it('passes locally uploaded images into the normal native-modeling turn without an empty viewport prerequisite', async () => {
    const { runtime } = setup({ content: '根据参考图片建模', includeViewport: true, includeCanvasSelection: false,
      localImages: [{ name: 'reference.png', dataUrl: 'data:image/png;base64,QUJD' }] });
    await settle();
    expect(mocks.invoke).toHaveBeenCalledWith('save_dropped_file', expect.objectContaining({ dataUrl: 'data:image/png;base64,QUJD' }));
    expect(mocks.call).not.toHaveBeenCalledWith(expect.anything(), 'rhino_capture_viewport', expect.anything());
    const attachments = runtime.sendMessage.mock.calls[0][1];
    expect(attachments).toHaveLength(1);
    expect(JSON.parse(attachments[0].metadataJson)).toMatchObject({ source: 'rhino-local', documentId: 12 });
  });
  it('rejects malformed local uploads instead of submitting an attachment-less modeling request', async () => {
    const { runtime } = setup({ content: '根据参考图片建模', localImages: [{ name: 'bad.svg', dataUrl: 'data:image/svg+xml;base64,QUJD' }] });
    await settle(); expect(runtime.sendMessage).not.toHaveBeenCalled();
    expect(mocks.request).toHaveBeenCalledWith(connection, '/drawer/ack', expect.objectContaining({ status: 'failed' }));
  });
});


describe('GH bake write verification is not suppressed by Grasshopper imports',()=>{
 it('takes the same bound-document baseline and readback for a staged mesh bake',async()=>{
  const {runtime}=setup({content:'查询一下当前对象'});await settle();
  registerRhinoNativeTools(runtime.activeConversationId,[{name:'rhino_native_run_python',description:'Python',inputSchema:{type:'object'},readOnly:false,destructive:true,workflowPhase:'write'}]);
  const before={version:1,documentId:12,units:'Millimeters',tolerance:0.01,objectCount:0,objects:[],documentChanged:false,readOnly:true};
  const after={...before,objectCount:1,objects:[{id:'mesh-baked',type:'Mesh',geometryType:'Rhino.Geometry.Mesh',valid:true,isValid:true,isMesh:true,isBrep:false,isClosed:false,isSolid:false,solidOrientation:'None',fingerprint:'crc-mesh'}]};let snapshots=0;
  mocks.call.mockClear();mocks.call.mockImplementation(async(_binding,name)=>name==='rhino_native_snapshot_document_geometry'?[{type:'text',text:JSON.stringify({stdout:'INSPIRATION_DOCUMENT_GEOMETRY_V1:'+JSON.stringify(snapshots++?after:before),stderr:''})}]:[{type:'text',text:'{"stdout":"baked","stderr":""}'}]);
  const result=await withRhinoTools(vi.fn(),'canvas-one')('rhino_native_run_python',{script:'import Grasshopper as gh\nstage=DrawerGeometryStage()\nstage.add_tree("selected",output.VolatileData)\nstage.commit()'},{executionSource:'rhino',conversationId:runtime.activeConversationId,messageId:'bake-mesh',userText:'把当前结果烘焙到 Rhino，保留开放网格。',recentMessages:[]});
  expect(result).toMatchObject({geometryVerification:{status:'passed',addedCount:1,openMeshCount:1}});
  expect(mocks.call.mock.calls.map(call=>call[1])).toEqual(['rhino_native_snapshot_document_geometry','rhino_native_run_python','rhino_native_snapshot_document_geometry']);
  expect(mocks.call.mock.calls.every(call=>call[0].documentId===12)).toBe(true);
 });
});


describe('explicit GH component preference prevents silent script substitution',()=>{
 it('refuses a run_python call and leaves the graph untouched when the user explicitly requested components',async()=>{
  const nativeBinding={tools:[{name:'rhino_native_run_python',rawName:'run_python',description:'Python write',inputSchema:{type:'object'},readOnly:false,destructive:true,workflowPhase:'write'}]};
  mocks.discoverNative.mockResolvedValueOnce(nativeBinding as any);
  const {runtime}=setup({content:'you use GH components, not code'});await settle();
  registerRhinoNativeTools(runtime.activeConversationId,nativeBinding.tools as any);
  const execute=vi.fn();
  await expect(withRhinoTools(execute,'canvas-one')('rhino_native_run_python',{script:'doc.Objects.AddMesh(mesh)'},{executionSource:'rhino',conversationId:runtime.activeConversationId,messageId:'component-only',userText:'you use GH components, not code',recentMessages:[]})).rejects.toThrow('explicitly requests native Grasshopper components');
  expect(mocks.call).not.toHaveBeenCalledWith(expect.anything(),'rhino_native_run_python',expect.anything());expect(execute).not.toHaveBeenCalled();
 });
});


describe('six Rhino user references are not evicted by host context',()=>{
 it('retains six canvas references plus current viewport and mask',async()=>{
  mocks.call.mockImplementation(async(_binding:unknown,name:string)=>name==='rhino_capture_viewport' ? [{type:'image',mimeType:'image/png',data:'QUJD'},{type:'image',mimeType:'image/png',data:'REVG'},{type:'text',text:'{"captureMode":"current"}'}] : [{type:'text',text:'{"documentId":12,"rhinoVersion":"9.0.26300.9401"}'}]);
  const references=Array.from({length:6},(_,i)=>({id:'ref-'+i,nodeId:'node-'+i,mediaType:'image',path:'C:/fixture/ref-'+i+'.png'}));
  const {runtime}=setup({content:'用这些参考做新的效果图',includeCanvasSelection:true,includeViewport:true,imageMaskMode:'on',selectedItems:[{id:'selected',references}]});
  await settle();expect(runtime.sendMessage).toHaveBeenCalledOnce();const attached=runtime.sendMessage.mock.calls[0][1];
  expect(attached).toHaveLength(8);for(const ref of references)expect(attached.some((a:any)=>a.path===ref.path)).toBe(true);
 });
 it('retains all six local references during native modeling',async()=>{
  const {runtime}=setup({content:'根据参考图片建模',includeViewport:true,localImages:Array.from({length:6},(_,i)=>({name:'ref-'+i+'.png',dataUrl:'data:image/png;base64,QUJD'}))});
  await settle();expect(runtime.sendMessage.mock.calls[0][1]).toHaveLength(6);
 });
});


it('publishes all six saved reference thumbnails with stable preview indices', async () => {
  const { summarizeRhinoMessages } = await import('./useRhinoBridge');
  vi.stubGlobal('Image', class {
    naturalWidth=512; naturalHeight=512;
    onload?: () => void;
    set src(_source: string) { this.onload?.(); }
  });
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ drawImage: vi.fn() }), toDataURL: () => 'data:image/jpeg;base64,QUJD' }) });
  mocks.invoke.mockImplementation(async (command) => command === 'read_local_image_data_url' ? 'data:image/png;base64,QUJD' : null);
  const attachments = Array.from({length:6}, (_,i) => ({id:'fixture-six-'+i, type:'image' as const, path:'C:/fixture/six-ui-'+i+'.png', messageId:'message-six', createdAt:i}));
  const [message] = await summarizeRhinoMessages([{id:'message-six',conversationId:'test',role:'user',status:'completed',content:'建模',createdAt:1,attachments,toolCalls:[]}]);
  expect(message.attachmentImageCount).toBe(6);
  expect(message.images).toHaveLength(6);
  expect(message.imageIndices).toEqual([0,1,2,3,4,5]);
  const [, followUp] = await summarizeRhinoMessages([
    {id:'generated',conversationId:'test',role:'assistant',status:'completed',content:'Generated',createdAt:0,attachments:[],toolCalls:[{id:'gen',messageId:'generated',toolName:'generate_image',status:'completed',argumentsJson:'{}',resultJson:'{"media":[{"type":"image","path":"C:/fixture/six-ui-0.png"}]}',createdAt:0}]},
    {id:'new-refs',conversationId:'test',role:'user',status:'completed',content:'建模',createdAt:1,attachments:attachments.map(item=>({...item,id:'selection-'+item.id,metadataJson:'{"nodeId":"new-node"}'})),toolCalls:[]},
  ]);
  expect(followUp.hiddenReferenceCount).toBe(0);
  expect(followUp.images).toHaveLength(6);
});

it.each([false, true])('reports an uncertain model reply without resending (completed tool: %s)', async completed => {
  const { runtime } = setup();
  runtime.sendMessage.mockImplementation(async () => {
    runtime.messages.push({ id: 'this-turn', role: 'assistant', status: 'error', content: 'UPSTREAM_RESULT_UNKNOWN', toolCalls: completed ? [{ status: 'completed' }] : [] }); return false;
  });
  await settle();
  expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
  expect(mocks.request).toHaveBeenCalledWith(connection, '/drawer/ack', expect.objectContaining({ status: 'failed', error: expect.stringContaining(completed ? '已执行的工具步骤已保留' : '本轮没有已完成的工具步骤') }));
});
it('never silently substitutes new canvas images when the preview selection changed before send', async () => {
  const { runtime } = setup({ includeCanvasSelection: true, canvasReferenceIds: ['selection-no-longer-selected'] });
  await settle(); expect(runtime.sendMessage).not.toHaveBeenCalled();
  expect(mocks.request).toHaveBeenCalledWith(connection, '/drawer/ack', expect.objectContaining({ status: 'failed', error: expect.stringContaining('画布选择已变化') }));
});
it('routes an explicitly isolated panel draft through the scoped background preparation callback, without native MCP or viewport reads', async () => {
  const {runtime}=setup({kind:'send',modelingTarget:'draft',content:'帮我建模一个独立外壳',includeViewport:true});
  await settle(); expect(mocks.discoverNative).not.toHaveBeenCalled(); expect(mocks.call).not.toHaveBeenCalled();
  expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
  const [text,attachments,,,,source,conversationId,prepare]=runtime.sendMessage.mock.calls[0];
  expect(text).toBe('帮我建模一个独立外壳');expect(attachments).toEqual([]);expect(source).toBe('rhino');expect(prepare).toBeTypeOf('function');
  mocks.invoke.mockResolvedValueOnce({rhinoVersion:'9.0',objects:[]}); const target=await prepare(conversationId);
  try { expect(mocks.invoke).toHaveBeenCalledWith('rhino_headless_mcp_call',expect.objectContaining({tool:'context',conversationId})); } finally {target.release()}
});