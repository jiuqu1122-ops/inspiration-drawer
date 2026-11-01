import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyCanvasContentTransform, applyCanvasMediaSourceToNode, CANVAS_CONTENT_TRANSFORM, swapCanvasImageAfterDecode } from './canvasImagePresentation';

afterEach(() => vi.unstubAllGlobals());
describe('stable canvas presentation', () => {
  it('keeps the same transform shape while zooming, reversing and settling', () => {
    const values = new Map<string, string>();
    const style = { transform: '', setProperty: (key: string, value: string) => values.set(key, value) };
    const content = { style } as unknown as HTMLElement;
    for (const [scale, x, y] of [[.5, 20, 30], [.2, -10, 7], [.8, 9, 4], [.8, 0, 0]]) {
      applyCanvasContentTransform(content, scale, x, y);
      expect(style.transform).toBe(CANVAS_CONTENT_TRANSFORM);
      expect(values.get('--canvas-live-scale')).toBe(String(scale));
      expect(values.get('--canvas-offset-x')).toBe(`${x}px`);
    }
    expect(style.transform).not.toContain('3d');
  });
  const fixture = () => {
    const images: Array<{ resolve: () => void; reject: () => void }> = [];
    class Decoder {
      decoding = ''; src = ''; onload = null; onerror = null;
      removeAttribute = vi.fn();
      decode() { return new Promise<void>((resolve, reject) => images.push({ resolve, reject: () => reject(new Error('bad image')) })); }
    }
    vi.stubGlobal('Image', Decoder);
    let source = 'thumb.png';
    const element = { isConnected: true, getAttribute: () => source, setAttribute: vi.fn((_key, value) => { source = value; }) };
    return { images, element: element as unknown as HTMLImageElement, source: () => source };
  };
  it('keeps old pixels until the replacement has decoded and coalesces duplicates', async () => {
    const f = fixture();
    const swap = swapCanvasImageAfterDecode(f.element, 'original.png');
    expect(swapCanvasImageAfterDecode(f.element, 'original.png')).toBe(swap);
    expect(f.source()).toBe('thumb.png');
    expect(f.images).toHaveLength(1);
    f.images[0].resolve();
    expect(await swap).toBe(true);
    expect(f.source()).toBe('original.png');
  });
  it('rejects stale completions, decode errors and replaced or unmounted elements', async () => {
    const f = fixture();
    const first = swapCanvasImageAfterDecode(f.element, 'first.png');
    const second = swapCanvasImageAfterDecode(f.element, 'second.png');
    expect(await first).toBe(false);
    f.images[0].resolve();
    f.images[1].reject();
    expect(await second).toBe(false);
    expect(f.source()).toBe('thumb.png');
    const third = swapCanvasImageAfterDecode(f.element, 'third.png');
    f.element.setAttribute('src', 'new-node.png');
    f.images[2].resolve();
    expect(await third).toBe(false);
    const fourth = swapCanvasImageAfterDecode(f.element, 'fourth.png');
    Object.assign(f.element, { isConnected: false });
    f.images[3].resolve();
    expect(await fourth).toBe(false);
  });
  it('cancels a pending upgrade when asked to retain the already displayed thumbnail', async () => {
    const f = fixture();
    const original = swapCanvasImageAfterDecode(f.element, 'original.png');
    expect(await swapCanvasImageAfterDecode(f.element, 'thumb.png')).toBe(true);
    f.images[0].resolve();
    expect(await original).toBe(false);
    expect(f.source()).toBe('thumb.png');
  });
  it('expires unreadable pending sources without clearing old pixels or allowing a late replacement', async () => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      const pending = swapCanvasImageAfterDecode(f.element, 'stalled.png');
      await vi.advanceTimersByTimeAsync(15_000);
      expect(await pending).toBe(false);
      f.images[0].resolve(); await Promise.resolve();
      expect(f.source()).toBe('thumb.png');
    } finally { vi.useRealTimers(); }
  });

});


describe('selected snapshot media source routing', () => {
  it('targets only an image/video when the cached canvas is the first main-media child', () => {
    const canvas = { tagName: 'CANVAS', setAttribute: vi.fn() };
    const video = { tagName: 'VIDEO', getAttribute: () => 'old.mp4', setAttribute: vi.fn() };
    const querySelector = vi.fn((selector: string) => selector.startsWith('img[') ? video : canvas);
    applyCanvasMediaSourceToNode({ querySelector } as unknown as Element, 'new.mp4');
    expect(querySelector).toHaveBeenCalledWith('img[data-canvas-main-media="true"], video[data-canvas-main-media="true"]');
    expect(video.setAttribute).toHaveBeenCalledWith('src', 'new.mp4');
    expect(canvas.setAttribute).not.toHaveBeenCalled();
  });
  it('still predecodes a resting original instead of directly changing its source', async () => {
    let resolve!: () => void;
    class Decoder {
      decoding = ''; src = ''; onload = null; onerror = null;
      decode() { return new Promise<void>(done => { resolve = done; }); }
      removeAttribute() {}
    }
    vi.stubGlobal('Image', Decoder);
    let src = 'thumb.png';
    const img = { tagName: 'IMG', isConnected: true, getAttribute: () => src,
      setAttribute: vi.fn((_key: string, value: string) => { src = value; }) };
    applyCanvasMediaSourceToNode({ querySelector: () => img } as unknown as Element, 'original.png');
    expect(src).toBe('thumb.png'); resolve();
    await Promise.resolve(); await Promise.resolve();
    expect(src).toBe('original.png');
  });
  it('does nothing for a canvas-only snapshot without starting a source decode', () => {
    const decoder = vi.fn(); vi.stubGlobal('Image', decoder);
    const querySelector = vi.fn(() => null);
    applyCanvasMediaSourceToNode({ querySelector } as unknown as Element, 'original.png');
    applyCanvasMediaSourceToNode(null, 'original.png');
    expect(decoder).not.toHaveBeenCalled();
  });
  it('does not reset an unchanged video source', () => {
    const video = { tagName: 'VIDEO', getAttribute: () => 'same.mp4', setAttribute: vi.fn() };
    applyCanvasMediaSourceToNode({ querySelector: () => video } as unknown as Element, 'same.mp4');
    expect(video.setAttribute).not.toHaveBeenCalled();
  });
});
