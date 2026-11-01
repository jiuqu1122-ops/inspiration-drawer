import { afterEach, describe, expect, it, vi } from 'vitest';
import { runDerivedUiEffect04 } from './canvasDerivedEffects';

const media = vi.hoisted(() => ({ image: vi.fn(), video: vi.fn() }));
vi.mock('../../../services/mediaThumbnail', () => ({ createCanvasNavImageThumbnailInWebview: media.image, createCanvasNavVideoThumbnailInWebview: media.video }));
const flush = async () => { for (let i = 0; i < 150; i++) await Promise.resolve(); };
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const context = (count = 20) => ({
  canvasNavItems: Array.from({ length: count }, (_, i) => ({ item: { id: `image-${i}` } })),
  canvasNavThumbnailCacheRef: { current: new Map() }, canvasPanRef: { current: null },
  getCanvasItemNavPreview: (item: any) => ({ source: item.id, mediaType: 'image' }),
  getCanvasNavThumbnailSignature: (item: any) => item.id,
  isCanvasInteractingRef: { current: false }, isCanvasMode: true, isCanvasNavigatorVisible: true,
  isCanvasZoomingRef: { current: false }, setCanvasNavThumbnailRevision: vi.fn(),
});
describe('navigator thumbnail scheduling', () => {
  it('limits decoding across large lists and discards results from a replaced effect', async () => {
    const releases: Array<(value: string) => void> = [];
    media.image.mockImplementation(() => new Promise<string>(resolve => releases.push(resolve)));
    const ctx = context();
    const stop = runDerivedUiEffect04(ctx as any);
    await flush();
    expect(media.image).toHaveBeenCalledTimes(2);
    expect(ctx.setCanvasNavThumbnailRevision).toHaveBeenCalledOnce();
    stop?.();
    const stopNew = runDerivedUiEffect04(ctx as any);
    expect(ctx.canvasNavThumbnailCacheRef.current.get('image-0').status).toBe('loading');
    releases[0]('stale'); releases[1]('stale'); await flush();
    expect(media.image).toHaveBeenCalledTimes(4);
    expect(ctx.canvasNavThumbnailCacheRef.current.get('image-0').status).toBe('loading');
    releases[2]('new-thumb-0'); releases[3]('new-thumb-1'); await flush();
    expect(ctx.canvasNavThumbnailCacheRef.current.get('image-0').thumbnail).toBe('new-thumb-0');
    stopNew?.();
    releases.slice(4).forEach(resolve => resolve('cancelled')); await flush();
  });
  it('waits until zoom stops before starting queued decodes', async () => {
    vi.useFakeTimers(); vi.stubGlobal('window', { setTimeout });
    media.image.mockResolvedValue('thumb');
    const ctx = context(2); ctx.isCanvasZoomingRef.current = true;
    const stop = runDerivedUiEffect04(ctx as any);
    await flush();
    expect(media.image).not.toHaveBeenCalled();
    ctx.isCanvasZoomingRef.current = false;
    await vi.advanceTimersByTimeAsync(120); await flush();
    expect(media.image).toHaveBeenCalledTimes(2);
    expect(ctx.canvasNavThumbnailCacheRef.current.get('image-0').status).toBe('ready');
    stop?.();
  });
});
