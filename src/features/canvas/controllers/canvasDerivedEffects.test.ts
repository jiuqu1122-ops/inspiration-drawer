import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasImageItem, CanvasWorkflowRuntimeNodeSnapshot } from '../../canvasModel';
import { runDerivedUiEffect01, runDerivedUiEffect03 } from './canvasDerivedEffects';
import { getCanvasAiOutputPreviewSlots } from '../../../utils/canvasWorkflowRuntime';

const lookups = vi.hoisted(() => ({ image: vi.fn(), video: vi.fn() }));
vi.mock('../../canvasAiImage', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../canvasAiImage')>(),
  getCloudWalletImageGenerationByRequest: lookups.image,
  getCloudWalletVideoStatus: lookups.video,
  getCloudWalletImageLookupImages: () => [],
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
