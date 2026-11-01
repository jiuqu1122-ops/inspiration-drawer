import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCanvasViewportScheduler, readCanvasVisualViewport } from './canvasViewportScheduler';
afterEach(() => vi.useRealTimers());
describe('live canvas viewport', () => {
  it('updates during a continuous gesture, coalescing to the latest callback rather than debouncing forever', () => {
    vi.useFakeTimers();
    const queue = createCanvasViewportScheduler();
    const first = vi.fn(), latest = vi.fn();
    queue.request(first);
    vi.advanceTimersByTime(40); queue.request(latest);
    vi.advanceTimersByTime(39); expect(latest).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(latest).toHaveBeenCalledOnce(); expect(first).not.toHaveBeenCalled();
    queue.request(first); vi.advanceTimersByTime(80); expect(first).toHaveBeenCalledOnce();
  });
  it('cancels old-canvas callbacks on teardown and permits a fresh gesture', () => {
    vi.useFakeTimers();
    const queue = createCanvasViewportScheduler(); const old = vi.fn(), next = vi.fn();
    queue.request(old); queue.cancel(); vi.advanceTimersByTime(100); expect(old).not.toHaveBeenCalled();
    queue.request(next); vi.advanceTimersByTime(80); expect(next).toHaveBeenCalledOnce();
  });
  it('uses visual world coordinates while native scroll is frozen and accounts for Chat occlusion', () => {
    const surface = { clientWidth: 1000, clientHeight: 700, scrollLeft: 800, scrollTop: 600 };
    expect(readCanvasVisualViewport(surface, .25, { x: 320, y: 240, width: 4000, height: 2800 }, 300))
      .toEqual({ x: 320, y: 240, width: 2800, height: 2800 });
    expect(readCanvasVisualViewport(surface, 2, null)).toEqual({ x: 400, y: 300, width: 500, height: 350 });
  });
});
