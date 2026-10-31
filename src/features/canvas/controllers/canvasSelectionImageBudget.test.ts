import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleCanvasSelectionImageSourcesImpl } from './canvasPersistenceActions';
import type { CanvasImageItem } from '../../canvasModel';

const fixture = (count: number) => {
  let frame: (() => void) | undefined;
  vi.stubGlobal('window', { requestAnimationFrame: (cb: () => void) => { frame = cb; return 1; } });
  const items = Array.from({ length: count }, (_, i) => ({
    id: `image-${i}`, x: 0, y: 0, width: 320, height: 240,
    item: { id: `asset-${i}`, type: 'image', content: '', createdAt: 1,
      thumbnail: `https://example.test/thumb-${i}.png`, url: `https://example.test/original-${i}.png` },
  })) as CanvasImageItem[];
  const context = {
    applyCanvasImageSourceToElement: vi.fn(), canvasImageSourceCacheRef: { current: new Map() },
    canvasItemsRef: { current: items }, canvasPreviewSourceIdsRef: { current: new Set<string>() },
    canvasSelectedIdsRef: { current: items.map(item => item.id) },
    canvasSelectionImageSourceFrameRef: { current: null as number | null },
    canvasSelectionImageSourceIdsRef: { current: new Set<string>() },
  };
  return { context, frame: () => frame?.(), items };
};
afterEach(() => vi.unstubAllGlobals());
describe('bounded original images on canvas selection', () => {
  it('does not promote 500 selected previews to full-resolution originals', () => {
    const f = fixture(500);
    scheduleCanvasSelectionImageSourcesImpl(f.context as any, f.items.map(item => item.id)); f.frame();
    expect(f.context.applyCanvasImageSourceToElement).not.toHaveBeenCalled();
    expect(f.context.canvasPreviewSourceIdsRef.current.size).toBe(0);
  });
  it('keeps single selection full-resolution and releases it on group selection', () => {
    const f = fixture(5); f.context.canvasSelectedIdsRef.current = ['image-0'];
    scheduleCanvasSelectionImageSourcesImpl(f.context as any, ['image-0']); f.frame();
    expect(f.context.applyCanvasImageSourceToElement).toHaveBeenLastCalledWith('image-0', 'https://example.test/original-0.png');
    expect(f.context.canvasImageSourceCacheRef.current.get('image-0').quality).toBe('original');
    f.context.canvasSelectedIdsRef.current = f.items.map(item => item.id);
    scheduleCanvasSelectionImageSourcesImpl(f.context as any, f.items.map(item => item.id)); f.frame();
    expect(f.context.applyCanvasImageSourceToElement).toHaveBeenLastCalledWith('image-0', 'https://example.test/thumb-0.png');
    expect(f.context.canvasImageSourceCacheRef.current.get('image-0').quality).toBe('thumb');
    expect(f.items[0].item.url).toBe('https://example.test/original-0.png');
  });
  it('coalesces rapid selection changes and keeps the bounded last selection only', () => {
    const f = fixture(8);
    scheduleCanvasSelectionImageSourcesImpl(f.context as any, f.items.map(item => item.id));
    f.context.canvasSelectedIdsRef.current = ['image-7'];
    scheduleCanvasSelectionImageSourcesImpl(f.context as any, ['image-7']); f.frame();
    expect(f.context.applyCanvasImageSourceToElement).toHaveBeenCalledExactlyOnceWith('image-7', 'https://example.test/original-7.png');
  });
});
