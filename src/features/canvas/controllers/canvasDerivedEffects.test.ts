import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasImageItem } from '../../canvasModel';
import { runDerivedUiEffect01 } from './canvasDerivedEffects';

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
