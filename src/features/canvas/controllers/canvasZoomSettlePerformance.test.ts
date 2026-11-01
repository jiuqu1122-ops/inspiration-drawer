import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import type { CanvasImageItem } from '../../canvasModel';
import type { CanvasPersistedState } from '../../../types/canvasRuntime';
import {
  saveCanvasStateNowImpl,
  scheduleCanvasVisibleImageSourceUpgradesImpl,
} from './canvasPersistenceActions';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: (path: string) => `asset://${path}` }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  vi.mocked(invoke).mockReset();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const image = (index: number): CanvasImageItem => ({
  id: `image-${index}`, x: index * 100, y: 0, width: 40, height: 40,
  item: {
    id: `asset-${index}`, type: 'image', content: '', createdAt: 1,
    path: `C:/images/${index}.png`, thumbnail: `thumb-${index}`, url: `original-${index}`,
  },
});

const fixture = (count: number) => {
  const items = Array.from({ length: count }, (_, index) => image(index));
  const ctx = {
    CANVAS_IMAGE_PREVIEW_UPGRADE_ENABLED: true as const,
    CANVAS_IMAGE_SOURCE_DOWNGRADE_SCALE: 0.65 as const,
    CANVAS_IMAGE_SOURCE_UPGRADE_BATCH_SIZE: 3 as const,
    CANVAS_IMAGE_SOURCE_UPGRADE_DELAY_MS: 90 as const,
    CANVAS_IMAGE_SOURCE_UPGRADE_MAX_ACTIVE_PREVIEWS: 3 as const,
    canvasHoveredItemIdRef: { current: '' },
    canvasImageUpgradeQueueRef: { current: [] as string[] },
    canvasImageUpgradeTimerRef: { current: null as number | null },
    canvasImageUpgradeTokenRef: { current: 0 },
    canvasItemsRef: { current: items },
    canvasPanRef: { current: null },
    canvasPreviewSourceIdsRef: { current: new Set<string>() },
    canvasScaleRef: { current: 2 },
    canvasSelectedIdsRef: { current: [] as string[] },
    canvasViewportRef: { current: { x: 0, y: 0, width: count * 100, height: 100 } },
    isCanvasInteractingRef: { current: false },
    isCanvasModeRef: { current: true },
    isCanvasZoomingRef: { current: false },
    getCanvasItemRenderedBox: vi.fn((item: CanvasImageItem) => item),
    canvasRectsIntersect: vi.fn((a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height),
    shouldUpgradeCanvasImageSource: vi.fn(() => true),
    trimCanvasPreviewSourceCache: vi.fn(),
    runCanvasImageSourceUpgradeQueue: vi.fn(),
    readCanvasViewportRect: vi.fn(),
    cancelCanvasImageSourceUpgradeQueue: vi.fn(),
  };
  ctx.cancelCanvasImageSourceUpgradeQueue.mockImplementation(() => {
    ctx.canvasImageUpgradeTokenRef.current += 1;
    ctx.canvasImageUpgradeQueueRef.current = [];
    if (ctx.canvasImageUpgradeTimerRef.current !== null) {
      window.clearTimeout(ctx.canvasImageUpgradeTimerRef.current);
      ctx.canvasImageUpgradeTimerRef.current = null;
    }
  });
  const schedule = () => scheduleCanvasVisibleImageSourceUpgradesImpl(ctx);
  return { ctx, items, schedule };
};

describe('zoom settle visible-source work', () => {
  it('never traverses the canvas synchronously or over 64 nodes in one task', () => {
    const { ctx, schedule } = fixture(1025);
    schedule();
    expect(ctx.getCanvasItemRenderedBox).not.toHaveBeenCalled();
    expect(ctx.shouldUpgradeCanvasImageSource).not.toHaveBeenCalled();
    expect(ctx.trimCanvasPreviewSourceCache).not.toHaveBeenCalled();
    let previous = 0;
    for (let i = 0; i < 17; i++) {
      vi.advanceTimersToNextTimer();
      const reads = ctx.getCanvasItemRenderedBox.mock.calls.length;
      expect(reads - previous).toBeGreaterThan(0);
      expect(reads - previous).toBeLessThanOrEqual(64);
      previous = reads;
    }
    expect(previous).toBe(1025);
    expect(ctx.trimCanvasPreviewSourceCache).toHaveBeenCalledOnce();
    expect(ctx.canvasImageUpgradeQueueRef.current).toHaveLength(3);
  });

  it('retains selected, hovered, nearest priority and stable tie order', () => {
    const { ctx, schedule } = fixture(5);
    ctx.canvasSelectedIdsRef.current = ['image-0'];
    ctx.canvasHoveredItemIdRef.current = 'image-4';
    schedule();
    vi.advanceTimersToNextTimer();
    expect(ctx.canvasImageUpgradeQueueRef.current).toEqual(['image-0', 'image-4', 'image-2']);
    expect(ctx.trimCanvasPreviewSourceCache).toHaveBeenCalledExactlyOnceWith(new Set(['image-0', 'image-4', 'image-2']));
    vi.advanceTimersByTime(90);
    expect(ctx.runCanvasImageSourceUpgradeQueue).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('discards an old scan on zoom and replaces it for the latest viewport', () => {
    const { ctx, schedule } = fixture(400);
    schedule();
    vi.advanceTimersToNextTimer();
    expect(ctx.getCanvasItemRenderedBox).toHaveBeenCalledTimes(64);
    ctx.isCanvasZoomingRef.current = true;
    ctx.cancelCanvasImageSourceUpgradeQueue(); // App calls this at zoom start.
    vi.runAllTimers();
    expect(ctx.getCanvasItemRenderedBox).toHaveBeenCalledTimes(64);
    expect(ctx.trimCanvasPreviewSourceCache).not.toHaveBeenCalled();
    ctx.isCanvasZoomingRef.current = false;
    ctx.canvasViewportRef.current = { x: 39000, y: 0, width: 1000, height: 100 };
    schedule();
    vi.runAllTimers();
    expect(ctx.getCanvasItemRenderedBox).toHaveBeenCalledTimes(464);
    expect(ctx.canvasImageUpgradeQueueRef.current).toEqual(['image-395', 'image-394', 'image-396']);
    expect(ctx.runCanvasImageSourceUpgradeQueue).toHaveBeenCalledExactlyOnceWith(3);
  });

  it('cancels a pending idle callback when a newer viewport supersedes it', () => {
    const callbacks = new Map<number, IdleRequestCallback>();
    let nextId = 0;
    const cancelIdleCallback = vi.fn((id: number) => callbacks.delete(id));
    Object.assign(window, {
      requestIdleCallback: vi.fn((callback: IdleRequestCallback) => {
        callbacks.set(++nextId, callback); return nextId;
      }), cancelIdleCallback,
    });
    const { ctx, schedule } = fixture(4);
    schedule(); schedule();
    expect(cancelIdleCallback).toHaveBeenCalledExactlyOnceWith(1);
    expect(ctx.getCanvasItemRenderedBox).not.toHaveBeenCalled();
    callbacks.get(2)!({ didTimeout: false, timeRemaining: () => 50 });
    expect(ctx.getCanvasItemRenderedBox).toHaveBeenCalledTimes(4);
    expect(ctx.runCanvasImageSourceUpgradeQueue).not.toHaveBeenCalled();
  });
});

describe('optional canvas state persistence callback', () => {
  it('uses an injected view-state transport without changing default native fallback', () => {
    const state = { items: [] } as unknown as CanvasPersistedState;
    const base = {
      activeCanvasIdRef: { current: 'canvas-1' }, buildCanvasPersistedState: vi.fn(() => state),
      canvasLastSyncedNodesSignatureRef: { current: '' }, canvasPanRef: { current: null },
      canvasPersistSaveSyncNodesRef: { current: false }, canvasStateLoadedRef: { current: true },
      canvasStateSaveDeferredDuringZoomRef: { current: false },
      getCanvasNodesPersistSignature: vi.fn(() => ''),
      isCanvasInteractingRef: { current: false }, isCanvasZoomingRef: { current: false },
    };
    const persistCanvasState = vi.fn().mockResolvedValue(undefined);
    saveCanvasStateNowImpl({ ...base, persistCanvasState });
    expect(persistCanvasState).toHaveBeenCalledExactlyOnceWith(state);
    expect(invoke).not.toHaveBeenCalled();
    vi.mocked(invoke).mockResolvedValueOnce(undefined);
    saveCanvasStateNowImpl(base);
    expect(invoke).toHaveBeenCalledExactlyOnceWith('save_canvas_state', { state });
  });
});
