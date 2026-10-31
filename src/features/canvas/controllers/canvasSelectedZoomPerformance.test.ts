import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import type { CanvasImageItem, CanvasItemBox } from '../../canvasModel';
import type { CanvasImageSourceCacheEntry } from '../../../types/canvasMedia';
import {
  beginCanvasZoomInteractionImpl,
  commitCanvasScaleSoonImpl,
  finishCanvasZoomInteractionImpl,
  getStableCanvasImageSourceImpl,
  refreshCanvasConnectionHandleOcclusionImpl,
  runCanvasImageSourceUpgradeQueueImpl,
  scheduleCanvasSelectionImageSourcesImpl,
  settleCanvasZoomBeforePointerInteractionImpl,
  syncCanvasSelectionFrameStylesImpl,
} from './canvasPersistenceActions';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: (path: string) => `asset://${path}` }));
vi.mock('../../../utils/rendererDiagnostics', () => ({
  recordCanvasZoomDiagnostic: vi.fn(), flushCanvasZoomDiagnostic: vi.fn(), shouldPromoteCanvasZoomLayer: () => false,
}));

let frames: Map<number, FrameRequestCallback>;
let requestFrame: ReturnType<typeof vi.fn>;
let cancelFrame: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  frames = new Map();
  let frameId = 0;
  requestFrame = vi.fn((callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
  cancelFrame = vi.fn((id: number) => frames.delete(id));
  vi.stubGlobal('window', { requestAnimationFrame: requestFrame, cancelAnimationFrame: cancelFrame, setTimeout, clearTimeout });
  vi.mocked(invoke).mockReset();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const flushFrames = () => {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach(callback => callback(0));
};
const flushPromises = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const image = (index: number): CanvasImageItem => ({
  id: `image-${index}`, x: index * 2048, y: 40, width: 320, height: 240,
  item: { id: `asset-${index}`, type: 'image', content: '', createdAt: 1,
    thumbnail: `https://example.test/thumb-${index}.png`, url: `https://example.test/original-${index}.png` },
});
const sources = (count = 1) => {
  const items = Array.from({ length: count }, (_, index) => image(index));
  const ctx = {
    CANVAS_IMAGE_PREVIEW_UPGRADE_ENABLED: true as const,
    applyCanvasImageSourceToElement: vi.fn(),
    canvasItemsRef: { current: items },
    canvasImageSourceCacheRef: { current: new Map<string, CanvasImageSourceCacheEntry>() },
    canvasPreviewSourceIdsRef: { current: new Set<string>() },
    canvasSelectedIdsRef: { current: [items[0].id] },
    canvasSelectionImageSourceFrameRef: { current: null as number | null },
    canvasSelectionImageSourceIdsRef: { current: new Set<string>() },
  };
  const schedule = (ids: Iterable<string> = ctx.canvasSelectedIdsRef.current) => scheduleCanvasSelectionImageSourcesImpl(ctx, ids);
  return { ctx, items, schedule };
};

// Count mutations/geometry reads, not wall-clock time: these budgets are deterministic in CI.
const styledElement = (dataset: Record<string, string> = {}) => {
  const writes = vi.fn();
  const style = new Proxy<Record<string, string>>({ left: '', top: '', width: '', height: '', transform: '', visibility: '' }, {
    set(target, key: string, value: string) { writes(key, value); target[key] = value; return true; },
  });
  return { element: { dataset, style } as unknown as HTMLElement, writes };
};
const frameContext = (items: CanvasImageItem[], selectionFrames: HTMLElement[], groupFrames: HTMLElement[] = []) => ({
  canvasContentRef: { current: { querySelectorAll: vi.fn((selector: string) => (
    selector === '[data-canvas-selection-frame="true"]' ? selectionFrames : groupFrames
  )) } as unknown as HTMLDivElement },
  canvasItemsRef: { current: items }, canvasSelectedIdsRef: { current: [items[0].id] },
  getCanvasItemRenderedBox: vi.fn((item: CanvasImageItem): CanvasItemBox => item),
});
const occlusionContext = (items: CanvasImageItem[], handles: HTMLElement[]) => ({
  CANVAS_CONNECTION_HANDLE_OUTSET: 0 as const,
  canvasContentRef: { current: { querySelectorAll: vi.fn(() => handles) } as unknown as HTMLDivElement },
  canvasItemsRef: { current: items }, canvasSelectedIdsRef: { current: [] as string[] },
  getCanvasItemRenderedBox: vi.fn((item: CanvasImageItem): CanvasItemBox => item),
});

describe('selected image source work stays bounded and idempotent', () => {
  it('does not schedule or traverse the canvas for an empty request', () => {
    const f = sources();
    const map = vi.spyOn(f.items, 'map');
    f.schedule([]);
    flushFrames();
    expect(requestFrame).not.toHaveBeenCalled();
    expect(map).not.toHaveBeenCalled();
  });

  it('coalesces duplicates and never reapplies an unchanged original across later frames', () => {
    const f = sources(500);
    const setCache = vi.spyOn(f.ctx.canvasImageSourceCacheRef.current, 'set');
    f.schedule(['image-0', 'image-0']);
    f.schedule(['image-0']);
    expect(requestFrame).toHaveBeenCalledOnce();
    flushFrames();
    const originalEntry = f.ctx.canvasImageSourceCacheRef.current.get('image-0');
    for (let i = 0; i < 20; i++) { f.schedule(); flushFrames(); }
    expect(f.ctx.applyCanvasImageSourceToElement).toHaveBeenCalledExactlyOnceWith('image-0', f.items[0].item.url);
    expect(setCache).toHaveBeenCalledOnce();
    expect(f.ctx.canvasImageSourceCacheRef.current.get('image-0')).toBe(originalEntry);
    expect(f.ctx.canvasPreviewSourceIdsRef.current).toEqual(new Set(['image-0']));
  });

  it('still updates a replaced original and releases it once after deselection', () => {
    const f = sources();
    f.schedule(); flushFrames();
    f.items[0] = { ...f.items[0], item: { ...f.items[0].item, url: 'https://example.test/replaced.png' } };
    f.schedule(); flushFrames();
    expect(f.ctx.applyCanvasImageSourceToElement).toHaveBeenLastCalledWith('image-0', 'https://example.test/replaced.png');
    f.ctx.canvasSelectedIdsRef.current = [];
    f.schedule(['image-0']); flushFrames();
    f.schedule(['image-0']); flushFrames();
    expect(f.ctx.applyCanvasImageSourceToElement).toHaveBeenCalledTimes(3);
    expect(f.ctx.applyCanvasImageSourceToElement).toHaveBeenLastCalledWith('image-0', f.items[0].item.thumbnail);
    expect(f.ctx.canvasPreviewSourceIdsRef.current.size).toBe(0);
  });

  it('uses the latest selection in the scheduled frame and preserves three selected originals', () => {
    const f = sources(8);
    f.schedule(['image-0']);
    f.ctx.canvasSelectedIdsRef.current = ['image-5', 'image-6', 'image-7'];
    f.schedule(f.ctx.canvasSelectedIdsRef.current); flushFrames();
    expect(f.ctx.applyCanvasImageSourceToElement).toHaveBeenCalledTimes(3);
    for (const item of f.items.slice(5)) expect(getStableCanvasImageSourceImpl(f.ctx, item)).toBe(item.item.url);
    expect(f.ctx.canvasImageSourceCacheRef.current.has('image-0')).toBe(false);
  });

  it('applies the existing group-original budget in the getter before the selection frame runs', () => {
    const f = sources(500);
    f.schedule(); flushFrames();
    f.ctx.canvasSelectedIdsRef.current = f.items.map(item => item.id);
    const includes = vi.spyOn(f.ctx.canvasSelectedIdsRef.current, 'includes');
    f.schedule(f.ctx.canvasSelectedIdsRef.current);
    expect(getStableCanvasImageSourceImpl(f.ctx, f.items[0])).toBe(f.items[0].item.thumbnail);
    expect(includes).not.toHaveBeenCalled();
    flushFrames();
    expect(f.ctx.canvasPreviewSourceIdsRef.current.size).toBe(0);
  });

  it('keeps an original without a thumbnail available for the selected static image', () => {
    const f = sources();
    f.items[0].item.thumbnail = '';
    f.schedule(); flushFrames();
    expect(getStableCanvasImageSourceImpl(f.ctx, f.items[0])).toBe(f.items[0].item.url);
  });

  it('does not let an in-flight ordinary preview overwrite a newer selected original', async () => {
    const f = sources();
    f.items[0].item.path = 'C:/images/full.png';
    let resolvePreview!: (result: { url: string }) => void;
    vi.mocked(invoke).mockImplementationOnce(() => new Promise(resolve => { resolvePreview = resolve; }));
    const queue = {
      ...f.ctx, CANVAS_IMAGE_SOURCE_UPGRADE_CONCURRENCY: 1 as const, CANVAS_IMAGE_SOURCE_UPGRADE_DELAY_MS: 90 as const,
      canvasImageUpgradeFailedRef: { current: new Set<string>() }, canvasImageUpgradeInFlightRef: { current: new Set<string>() },
      canvasImageUpgradeQueueRef: { current: ['image-0'] }, canvasImageUpgradeTimerRef: { current: null as number | null },
      canvasImageUpgradeTokenRef: { current: 1 }, canvasPanRef: { current: null },
      isCanvasInteractingRef: { current: false }, isCanvasModeRef: { current: true }, isCanvasZoomingRef: { current: false },
      runCanvasImageSourceUpgradeQueue: vi.fn(), shouldUpgradeCanvasImageSource: () => true,
    };
    runCanvasImageSourceUpgradeQueueImpl(queue, 1);
    expect(invoke).toHaveBeenCalledOnce();
    f.schedule(); flushFrames();
    const originalEntry = f.ctx.canvasImageSourceCacheRef.current.get('image-0');
    resolvePreview({ url: 'asset://ordinary-preview.png' }); await flushPromises();
    expect(f.ctx.canvasImageSourceCacheRef.current.get('image-0')).toBe(originalEntry);
    expect(f.ctx.applyCanvasImageSourceToElement).toHaveBeenCalledExactlyOnceWith('image-0', 'asset://C:/images/full.png');
    expect(queue.canvasImageUpgradeInFlightRef.current.size).toBe(0);
  });
});

describe('selection frame synchronization avoids unrelated geometry and redundant DOM mutations', () => {
  it('does no geometry work when no selection/group frames are mounted', () => {
    const ctx = frameContext([image(0)], []);
    syncCanvasSelectionFrameStylesImpl(ctx);
    expect(ctx.getCanvasItemRenderedBox).not.toHaveBeenCalled();
  });

  it('does not compute any group outlines when only a selection frame exists', () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({ ...image(i), canvasGroup: { id: `group-${i}`, name: 'Group' } }));
    const frame = styledElement();
    const ctx = frameContext(items, [frame.element]);
    syncCanvasSelectionFrameStylesImpl(ctx);
    expect(ctx.getCanvasItemRenderedBox.mock.calls.length).toBe(1);
    expect(ctx.getCanvasItemRenderedBox.mock.calls[0][0]).toBe(items[0]);
    expect(frame.element.style.left).toBe('-12px');
    expect(frame.element.style.width).toBe('344px');
  });

  it('writes only changed frame properties, without disturbing drag transforms', () => {
    const frame = styledElement();
    frame.element.style.transform = 'translate3d(4px, 6px, 0)';
    const ctx = frameContext([image(0)], [frame.element]);
    syncCanvasSelectionFrameStylesImpl(ctx);
    frame.writes.mockClear();
    syncCanvasSelectionFrameStylesImpl(ctx);
    expect(frame.writes).not.toHaveBeenCalled();
    ctx.canvasItemsRef.current = [{ ...ctx.canvasItemsRef.current[0], x: 90 }];
    syncCanvasSelectionFrameStylesImpl(ctx);
    expect(frame.writes).toHaveBeenCalledExactlyOnceWith('left', '78px');
    expect(frame.element.style.transform).toBe('translate3d(4px, 6px, 0)');
  });

  it('preserves multiselection bounds and only measures groups with mounted frames', () => {
    const items = [image(0), image(1), image(2)].map((item, i) => ({
      ...item, x: i * 100 - 60, y: i * 50, canvasGroup: { id: i < 2 ? 'visible' : 'unmounted', name: 'Group' },
    }));
    const selection = styledElement();
    const group = styledElement({ canvasGroupFrameId: 'visible' });
    const ctx = frameContext(items, [selection.element], [group.element]);
    ctx.canvasSelectedIdsRef.current = ['image-0', 'image-1'];
    syncCanvasSelectionFrameStylesImpl(ctx);
    expect(selection.element.style).toMatchObject({ left: '-60px', top: '0px', width: '420px', height: '290px' });
    expect(group.element.style).toMatchObject({ left: '-76px', top: '-16px', width: '452px', height: '322px' });
    expect(ctx.getCanvasItemRenderedBox.mock.calls.some(([item]) => item.id === 'image-2')).toBe(false);
    group.writes.mockClear(); selection.writes.mockClear();
    syncCanvasSelectionFrameStylesImpl(ctx);
    expect(group.writes).not.toHaveBeenCalled(); expect(selection.writes).not.toHaveBeenCalled();
  });
});

describe('connection handle occlusion has bounded sparse affected-selection work', () => {
  it('returns before DOM queries or geometry for an empty selection delta', () => {
    const ctx = occlusionContext([image(0)], []);
    refreshCanvasConnectionHandleOcclusionImpl(ctx, { affectedItemIds: new Set() });
    expect(ctx.canvasContentRef.current.querySelectorAll).not.toHaveBeenCalled();
    expect(ctx.getCanvasItemRenderedBox).not.toHaveBeenCalled();
  });

  it('indexes affected boxes instead of scanning them for each unrelated handle', () => {
    const count = 600;
    const items = Array.from({ length: count }, (_, i) => image(i));
    const handles = items.map(item => styledElement({ canvasConnectionHandleId: item.id, canvasConnectionHandleSide: 'source' }).element);
    const ctx = occlusionContext(items, handles);
    let xReads = 0;
    ctx.getCanvasItemRenderedBox.mockImplementation(item => ({
      get x() { xReads++; return item.x; }, y: item.y, width: item.width, height: item.height,
    }));
    refreshCanvasConnectionHandleOcclusionImpl(ctx, {
      renderedItems: items, affectedItemIds: new Set(items.slice(0, count / 2).map(item => item.id)),
    });
    expect(ctx.getCanvasItemRenderedBox).toHaveBeenCalledTimes(count);
    expect(xReads).toBeLessThan(count * 40);
  });

  it('preserves inclusive coverage/selection stacking and does not rewrite unchanged visibility', () => {
    const items = [image(0), { ...image(1), x: 320, y: 0, width: 100, height: 300 }];
    const handle = styledElement({ canvasConnectionHandleId: 'image-0', canvasConnectionHandleSide: 'source' });
    const ctx = occlusionContext(items, [handle.element]);
    const refresh = (affectedItemIds?: Set<string>) => refreshCanvasConnectionHandleOcclusionImpl(ctx, { renderedItems: items, affectedItemIds });
    refresh(); expect(handle.element.style.visibility).toBe('hidden');
    handle.writes.mockClear(); refresh(); expect(handle.writes).not.toHaveBeenCalled();
    ctx.canvasSelectedIdsRef.current = ['image-0'];
    refresh(new Set(['image-0'])); expect(handle.element.style.visibility).toBe('');
    ctx.canvasSelectedIdsRef.current = ['image-0', 'image-1'];
    refresh(new Set(['image-1'])); expect(handle.element.style.visibility).toBe('hidden');
    handle.writes.mockClear(); refresh(new Set(['image-1'])); expect(handle.writes).not.toHaveBeenCalled();
  });
});

const zoomContext = () => {
  const attributes = new Map<string, string>();
  const surface = {
    scrollLeft: 0, scrollTop: 0,
    setAttribute: vi.fn((key: string, value: string) => attributes.set(key, value)),
    removeAttribute: vi.fn((key: string) => attributes.delete(key)),
  };
  const ctx = {
    cancelCanvasImageSourceUpgradeQueue: vi.fn(), downgradeCanvasPreviewSources: vi.fn(),
    canvasContentRef: { current: { style: { willChange: '' } } as HTMLDivElement },
    canvasSurfaceRef: { current: surface as unknown as HTMLDivElement },
    canvasViewportDeferredDuringZoomRef: { current: false }, canvasViewportFrameRef: { current: 91 as number | null },
    isCanvasZoomingRef: { current: false }, canvasScaleRef: { current: 1 },
    canvasSizeRef: { current: { width: 4000, height: 3000 } }, canvasSizeCommitDeferredRef: { current: false },
    canvasScaleCommitTimerRef: { current: null as number | null }, canvasZoomSettleTimerRef: { current: null as number | null },
    canvasStateSaveDeferredDuringZoomRef: { current: false }, canvasPersistSaveSyncNodesRef: { current: true },
    canvasVisualViewportRef: { current: null as { x: number; y: number; width: number; height: number } | null },
    canvasScrollLockRef: { current: null as { left: number; top: number } | null },
    applyCanvasScaleStyles: vi.fn(), scheduleCanvasScaleRenderSync: vi.fn(), scheduleCanvasStateSave: vi.fn(),
    scheduleCanvasViewportUpdate: vi.fn(), scheduleCanvasVisibleImageSourceUpgrades: vi.fn(), setCanvasSize: vi.fn(),
    writeCanvasSurfaceScroll: vi.fn((_surface: HTMLDivElement, left: number, top: number) => {
      surface.scrollLeft = left; surface.scrollTop = top;
    }),
    beginCanvasZoomInteraction: () => beginCanvasZoomInteractionImpl(ctx),
    finishCanvasZoomInteraction: () => finishCanvasZoomInteractionImpl(ctx),
  };
  return { ctx, surface, attributes };
};

describe('zoom session lifecycle keeps selected sources stable', () => {
  it('performs setup once for 120 scale updates and defers all settle work until idle', () => {
    const f = sources(); f.schedule(); flushFrames();
    const cache = f.ctx.canvasImageSourceCacheRef.current.get('image-0');
    const z = zoomContext();
    for (let i = 0; i < 120; i++) {
      z.ctx.beginCanvasZoomInteraction();
      z.ctx.canvasScaleRef.current = 1 + i / 100;
      commitCanvasScaleSoonImpl(z.ctx);
      expect(getStableCanvasImageSourceImpl(f.ctx, f.items[0])).toBe(f.items[0].item.url);
      vi.advanceTimersByTime(8);
    }
    expect(z.ctx.cancelCanvasImageSourceUpgradeQueue).toHaveBeenCalledOnce();
    expect(cancelFrame).toHaveBeenCalledExactlyOnceWith(91);
    expect(z.surface.setAttribute).toHaveBeenCalledExactlyOnceWith('data-canvas-zooming', 'true');
    expect(z.attributes.get('data-canvas-zooming')).toBe('true');
    expect(z.ctx.downgradeCanvasPreviewSources).not.toHaveBeenCalled();
    expect(z.ctx.scheduleCanvasScaleRenderSync).not.toHaveBeenCalled();
    expect(z.ctx.scheduleCanvasVisibleImageSourceUpgrades).not.toHaveBeenCalled();
    expect(z.ctx.applyCanvasScaleStyles).not.toHaveBeenCalled();
    vi.advanceTimersByTime(212);
    expect(z.ctx.isCanvasZoomingRef.current).toBe(false);
    expect(z.surface.removeAttribute).toHaveBeenCalledExactlyOnceWith('data-canvas-zooming');
    expect(z.ctx.scheduleCanvasScaleRenderSync).toHaveBeenCalledOnce();
    expect(z.ctx.scheduleCanvasViewportUpdate).toHaveBeenCalledOnce();
    expect(z.ctx.scheduleCanvasVisibleImageSourceUpgrades).toHaveBeenCalledOnce();
    expect(z.ctx.scheduleCanvasStateSave).toHaveBeenCalledOnce();
    z.ctx.finishCanvasZoomInteraction();
    expect(z.ctx.scheduleCanvasStateSave).toHaveBeenCalledOnce();
    expect(f.ctx.canvasImageSourceCacheRef.current.get('image-0')).toBe(cache);
    expect(f.ctx.applyCanvasImageSourceToElement).toHaveBeenCalledOnce();
  });

  it('settles synchronously before pointer input, commits deferred state once and cancels the idle timer', () => {
    const z = zoomContext();
    commitCanvasScaleSoonImpl(z.ctx);
    z.ctx.canvasScaleRef.current = 2;
    z.ctx.canvasVisualViewportRef.current = { x: 10, y: 20, width: 800, height: 600 };
    z.ctx.canvasSizeCommitDeferredRef.current = true;
    z.ctx.canvasStateSaveDeferredDuringZoomRef.current = true;
    settleCanvasZoomBeforePointerInteractionImpl(z.ctx);
    expect(z.ctx.isCanvasZoomingRef.current).toBe(false);
    expect(z.ctx.canvasScaleCommitTimerRef.current).toBeNull();
    expect(z.ctx.canvasZoomSettleTimerRef.current).toBeNull();
    expect(z.ctx.canvasVisualViewportRef.current).toBeNull();
    expect(z.ctx.canvasScrollLockRef.current).toEqual({ left: 20, top: 40 });
    expect(z.ctx.setCanvasSize).toHaveBeenCalledExactlyOnceWith(z.ctx.canvasSizeRef.current);
    expect(z.ctx.scheduleCanvasStateSave).toHaveBeenCalledExactlyOnceWith({ syncNodes: true });
    vi.advanceTimersByTime(1000);
    expect(z.ctx.scheduleCanvasStateSave).toHaveBeenCalledOnce();
    expect(z.ctx.downgradeCanvasPreviewSources).not.toHaveBeenCalled();
  });
});
