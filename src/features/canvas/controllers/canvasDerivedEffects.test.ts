import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasImageItem, CanvasWorkflowRuntimeNodeSnapshot } from '../../canvasModel';
import { runDerivedUiEffect01, runDerivedUiEffect02, runDerivedUiEffect03 } from './canvasDerivedEffects';
import { getCanvasAiOutputPreviewSlots } from '../../../utils/canvasWorkflowRuntime';

const lookups = vi.hoisted(() => ({ image: vi.fn(), video: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: (path: string) => `asset://${path}` }));
vi.mock('../../canvasAiImage', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../canvasAiImage')>(),
  getCloudWalletImageGenerationByRequest: lookups.image,
  getCloudWalletVideoStatus: lookups.video,
  getCloudWalletImageLookupImages: (lookup: { images?: string[] }) => lookup.images || [],
  getCloudWalletVideoDeliveredResults: () => [],
}));

const recoveryContext = (): Parameters<typeof runDerivedUiEffect01>[0] => {
  const node: CanvasImageItem = {
    id: 'node-1', x: 0, y: 0, width: 320, height: 300,
    item: { id: 'item-1', type: 'image', name: 'generator', content: '', createdAt: Date.now() },
    ai: {
      type: 'image-generator', credentialSource: 'wallet', status: 'error',
      outputs: [{ id: 'output-1', status: 'error', generatedAt: Date.now(), clientRequestId: 'request-123' }],
    },
  };
  return {
    isCanvasMode: true,
    activeCanvasIdRef: { current: 'default' },
    canvasItems: [node], canvasItemsRef: { current: [node] },
    canvasAiTimedOutRecoveryInFlightRef: { current: new Set() },
    canvasAiTimedOutRecoverySettledRef: { current: new Set() },
    updateCanvasItemsImmediate: vi.fn(updater => updater([node])),
    addGeneratedImagesToDrawer: vi.fn(), addGeneratedVideosToDrawer: vi.fn(),
    enqueueCanvasAiOutputThumbnailJob: vi.fn(), getCanvasAiErrorSummary: String,
    refreshCloudAccount: vi.fn(), scheduleCanvasChangedNodesPatchSave: vi.fn(),
    scheduleCanvasStateSave: vi.fn(), setCanvasAiTimedOutRecoveryTick: vi.fn(), showToast: vi.fn(),
  };
};

describe('background generation recovery scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T12:00:00Z'));
    vi.stubGlobal('window', { setTimeout });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    lookups.image.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    ['pending', null, 8_000],
    ['network failure', 'cloud_unavailable: GET 连接被重置', 8_000],
    ['rate limit', 'cloud_request_failed: HTTP 429', 60_000],
    ['gateway limit', 'cloud_request_failed: HTTP 414', 300_000],
  ])('does not let canvas rerenders bypass the %s delay', async (_, error, delay) => {
    if (error) lookups.image.mockRejectedValue(new Error(error));
    else lookups.image.mockResolvedValue({ status: 'processing', images: [] });
    const ctx = recoveryContext();
    runDerivedUiEffect01(ctx);
    await vi.advanceTimersByTimeAsync(0);
    expect(lookups.image).toHaveBeenCalledTimes(1);
    expect(ctx.canvasAiTimedOutRecoveryInFlightRef.current.size).toBe(0);
    expect(ctx.canvasAiTimedOutRecoverySettledRef.current.size).toBe(0);
    for (let update = 0; update < 10; update++) runDerivedUiEffect01(ctx);
    await vi.advanceTimersByTimeAsync(delay - 1);
    runDerivedUiEffect01(ctx);
    expect(lookups.image).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    runDerivedUiEffect01(ctx);
    expect(lookups.image).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(0);
  });

  it('stops a malformed request instead of issuing it on every canvas update', async () => {
    lookups.image.mockRejectedValue(new Error('invalid_request: 生图请求 ID 无效'));
    const ctx = recoveryContext();
    runDerivedUiEffect01(ctx);
    await vi.advanceTimersByTimeAsync(0);
    for (let update = 0; update < 10; update++) runDerivedUiEffect01(ctx);
    expect(lookups.image).toHaveBeenCalledTimes(1);
    expect(ctx.canvasAiTimedOutRecoverySettledRef.current.size).toBe(1);
  });
  it('places the corresponding image into each slot sharing a multiasset receipt', async () => {
    const ctx = recoveryContext();
    const node = ctx.canvasItems[0]!;
    node.ai!.imageOutputMode = 'multiple_assets';
    node.ai!.outputs = Array.from({ length: 4 }, (_, index) => ({ id: `output-${index}`, status: 'error',
      generatedAt: Date.now(), clientRequestId: 'request-123' }));
    ctx.updateCanvasItemsImmediate = vi.fn(updater => {
      const next = updater(ctx.canvasItemsRef.current);
      ctx.canvasItemsRef.current = next; ctx.canvasItems = next; return next;
    });
    ctx.refreshCloudAccount = vi.fn(async () => undefined as never);
    const images = Array.from({ length: 4 }, (_, index) => `https://cdn.example/image-${index}.png`);
    lookups.image.mockResolvedValue({ status: 'succeeded', images });
    runDerivedUiEffect01(ctx);
    await vi.advanceTimersByTimeAsync(0);
    runDerivedUiEffect01(ctx);
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.canvasItemsRef.current[0]?.ai?.outputs?.map(output => output.url)).toEqual(images);
  });
});

describe('late local image cache completion', () => {
  beforeEach(() => { vi.stubGlobal('window', { setTimeout: vi.fn() }); });
  afterEach(() => { vi.unstubAllGlobals(); });
  it.each([false, true])('applies a finished cache only to its original request (replaced: %s)', async replaced => {
    let finish!: (value: { url: string; path: string; sourceUrl: string }) => void;
    const oldSource = 'https://api.unmind.art/v1/ai/image-results/old.png';
    const newSource = 'https://api.unmind.art/v1/ai/image-results/new.png';
    let nodes: CanvasImageItem[] = [{
      id: 'node', x: 0, y: 0, width: 320, height: 300,
      item: { id: 'item', type: 'text', content: '', createdAt: 0 },
      ai: { type: 'image-generator', status: 'success', imageClientRequestId: 'old-request',
        outputs: [{ id: 'slot', clientRequestId: 'old-request', status: 'success', url: oldSource, sourceUrl: oldSource }] },
    }];
    let drawerItems = [{ id: 'slot', type: 'image' as const, content: '', createdAt: 0, sourceUrl: oldSource, url: oldSource }];
    const ctx: Parameters<typeof runDerivedUiEffect02>[0] = {
      isCanvasMode: true, canvasItems: nodes, itemsRef: { current: [] },
      CANVAS_AI_OUTPUT_SOURCE_RECOVERY_RETRY_DELAY_MS: 8000,
      canvasAiOutputSourceRecoveryAttemptedRef: { current: new Set() },
      canvasAiOutputSourceRecoveryInFlightRef: { current: new Set() },
      canvasAiOutputSourceRecoveryRetryAtRef: { current: new Map() },
      cacheCanvasGeneratedImageSource: vi.fn(() => new Promise<{ url: string; path: string; sourceUrl: string }>(resolve => { finish = resolve; })),
      updateCanvasItemsImmediate: updater => { nodes = updater(nodes); return nodes; },
      setItems: updater => { drawerItems = typeof updater === 'function' ? updater(drawerItems) as typeof drawerItems : updater as typeof drawerItems; },
      enqueueCanvasAiOutputThumbnailJob: vi.fn(), scheduleCanvasChangedNodesPatchSave: vi.fn(),
      scheduleCanvasStateSave: vi.fn(), setCanvasAiOutputSourceRecoveryTick: vi.fn(),
    };
    runDerivedUiEffect02(ctx);
    expect(ctx.cacheCanvasGeneratedImageSource).toHaveBeenCalledOnce();
    if (replaced) {
      nodes = [{ ...nodes[0], ai: { ...nodes[0].ai!, imageClientRequestId: 'new-request',
        outputs: [{ id: 'slot', clientRequestId: 'new-request', status: 'success', url: newSource, sourceUrl: newSource }] } }];
      drawerItems = [{ ...drawerItems[0], sourceUrl: newSource, url: newSource }];
    }
    finish({ path: 'old.png', url: 'asset://old.png', sourceUrl: oldSource });
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    if (replaced) {
      expect(nodes[0].ai?.outputs?.[0]).toMatchObject({ clientRequestId: 'new-request', url: newSource, sourceUrl: newSource });
      expect(nodes[0].ai?.outputs?.[0].path).toBeUndefined();
      expect(drawerItems[0].url).toBe(newSource);
      expect(ctx.enqueueCanvasAiOutputThumbnailJob).not.toHaveBeenCalled();
    } else {
      expect(nodes[0].ai?.outputs?.[0]).toMatchObject({ clientRequestId: 'old-request', path: 'old.png', url: 'asset://old.png' });
      expect(drawerItems[0]).toMatchObject({ path: 'old.png', url: 'asset://old.png' });
      expect(ctx.enqueueCanvasAiOutputThumbnailJob).toHaveBeenCalledOnce();
    }
  });
  it('does not repair a current result from a different old drawer source sharing its ID', () => {
    const currentSource = 'https://api.unmind.art/v1/ai/image-results/new.png';
    let nodes: CanvasImageItem[] = [{
      id: 'node', x: 0, y: 0, width: 320, height: 300,
      item: { id: 'item', type: 'text', content: '', createdAt: 0 },
      ai: { type: 'image-generator', status: 'success', outputs: [
        { id: 'slot', clientRequestId: 'new-request', status: 'success', url: currentSource, sourceUrl: currentSource },
      ] },
    }];
    const cache = vi.fn(async () => ({ path: '', url: currentSource, sourceUrl: currentSource }));
    const ctx: Parameters<typeof runDerivedUiEffect02>[0] = {
      isCanvasMode: true, canvasItems: nodes,
      itemsRef: { current: [{ id: 'slot', type: 'image', content: '', createdAt: 0,
        path: 'old.png', url: 'asset://old.png', sourceUrl: 'https://api.unmind.art/v1/ai/image-results/old.png' }] },
      CANVAS_AI_OUTPUT_SOURCE_RECOVERY_RETRY_DELAY_MS: 8000,
      canvasAiOutputSourceRecoveryAttemptedRef: { current: new Set() },
      canvasAiOutputSourceRecoveryInFlightRef: { current: new Set() },
      canvasAiOutputSourceRecoveryRetryAtRef: { current: new Map() },
      cacheCanvasGeneratedImageSource: cache,
      updateCanvasItemsImmediate: updater => { nodes = updater(nodes); return nodes; },
      setItems: vi.fn(), enqueueCanvasAiOutputThumbnailJob: vi.fn(),
      scheduleCanvasChangedNodesPatchSave: vi.fn(), scheduleCanvasStateSave: vi.fn(),
      setCanvasAiOutputSourceRecoveryTick: vi.fn(),
    };
    runDerivedUiEffect02(ctx);
    expect(nodes[0].ai?.outputs?.[0].path).toBeUndefined();
    expect(cache).toHaveBeenCalledWith(currentSource, expect.any(String));
  });
});

describe('visible output cache reconciliation', () => {
  const contextFor = (node: CanvasImageItem) => {
    let items = [node];
    let updates = 0;
    const ctx: Parameters<typeof runDerivedUiEffect03>[0] = {
      isCanvasMode: true,
      CANVAS_AI_OUTPUT_CACHE_STALE_MS: 1_000,
      canvasRenderableItems: items,
      canvasAiOutputThumbnailRecoveryAttemptedRef: { current: new Set() },
      canvasPanRef: { current: null },
      isCanvasInteractingRef: { current: false },
      isCanvasZoomingRef: { current: false },
      ensureImageThumbnail: vi.fn(), enqueueCanvasAiOutputThumbnailJob: vi.fn(),
      scheduleCanvasChangedNodesPatchSave: vi.fn(), scheduleCanvasStateSave: vi.fn(),
      updateCanvasItemsImmediate: updater => {
        const next = updater(items);
        if (next !== items) updates++;
        items = next;
        ctx.canvasRenderableItems = items;
        return next;
      },
    };
    return { ctx, read: () => ({ items, updates }) };
  };

  it('does not coalesce thumbnail jobs for different requests sharing a local media path', () => {
    const node: CanvasImageItem = { id: 'node', x: 0, y: 0, width: 320, height: 300,
      item: { id: 'item', type: 'text', content: '', createdAt: 0 },
      ai: { type: 'image-generator', outputs: [{ id: 'slot', clientRequestId: 'old-request', status: 'success',
        path: 'cached.png', url: 'asset://cached.png', cacheStatus: 'pending' }] } };
    const { ctx } = contextFor(node);
    runDerivedUiEffect03(ctx);
    ctx.canvasRenderableItems = [{ ...node, ai: { ...node.ai!, outputs: [{ ...node.ai!.outputs![0], clientRequestId: 'new-request' }] } }];
    runDerivedUiEffect03(ctx);
    const calls = vi.mocked(ctx.enqueueCanvasAiOutputThumbnailJob).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0].clientRequestId).toBe('old-request');
    expect(calls[1][0].clientRequestId).toBe('new-request');
    expect(calls[1][0].key).not.toBe(calls[0][0].key);
  });

  it.each([
    ['thumbnail', 'legacy'], ['stale', 'legacy'],
    ['thumbnail', 'current'], ['stale', 'current'],
  ] as const)(
    'does not loop on a %s pending output in a %s workflow runtime snapshot', (mode, format) => {
      const snapshot: CanvasWorkflowRuntimeNodeSnapshot = {
        templateId: 'internal-generator',
        ai: { outputs: [{
          id: 'runtime-output', status: 'success', cacheStatus: 'pending',
          url: 'https://example.com/result.png', generatedAt: Date.now() - 10_000,
          ...(mode === 'thumbnail' ? { thumbnail: 'data:image/png;base64,test' } : {}),
        }] },
      };
      const node: CanvasImageItem = {
        id: 'workflow-module', x: 0, y: 0, width: 320, height: 300,
        item: { id: 'module-item', type: 'text', content: '', createdAt: 1 },
        ai: {
          type: 'workflow', workflowOutputMode: 'all', outputs: [],
          workflow: {
            id: 'workflow', label: 'Workflow', hint: '',
            nodes: [{
              id: 'internal-generator', x: 0, y: 0, width: 320, height: 300,
              item: { type: 'text', name: 'Generator', content: '' },
              ai: { type: 'image-generator', count: 1 },
            }],
          },
          workflowRuntime: format === 'legacy'
            ? [snapshot]
            : { nodeSnapshots: { 'internal-generator': snapshot } },
        },
      };
      expect(getCanvasAiOutputPreviewSlots(node)[0]).toMatchObject({ cacheStatus: 'pending' });
      const { ctx, read } = contextFor(node);
      const originalItems = read().items;
      // A changed array reruns the effect in App. Even when panning keeps
      // exposing this node, a projection must not create a state-update loop.
      for (let render = 0; render < 60; render++) runDerivedUiEffect03(ctx);
      expect(read().updates).toBe(0);
      expect(read().items).toBe(originalItems);
      expect(ctx.scheduleCanvasChangedNodesPatchSave).not.toHaveBeenCalled();
      expect(ctx.scheduleCanvasStateSave).not.toHaveBeenCalled();
    },
  );

  it.each(['thumbnail', 'stale'] as const)('settles a canonical %s output once', mode => {
    const node: CanvasImageItem = {
      id: 'generator', x: 0, y: 0, width: 320, height: 300,
      item: { id: 'generator-item', type: 'text', content: '', createdAt: 1 },
      ai: {
        type: 'image-generator', outputs: [{
          id: 'output', status: 'success', cacheStatus: 'pending',
          url: 'https://example.com/result.png', generatedAt: Date.now() - 10_000,
          ...(mode === 'thumbnail' ? { thumbnail: 'data:image/png;base64,test' } : {}),
        }],
      },
    };
    const { ctx, read } = contextFor(node);
    for (let render = 0; render < 60; render++) runDerivedUiEffect03(ctx);
    expect(read().updates).toBe(1);
    expect(read().items[0].ai?.outputs?.[0].cacheStatus).toBe(mode === 'thumbnail' ? 'ready' : 'failed');
    expect(ctx.scheduleCanvasChangedNodesPatchSave).toHaveBeenCalledExactlyOnceWith(['generator']);
    expect(ctx.scheduleCanvasStateSave).toHaveBeenCalledTimes(1);
  });
});
