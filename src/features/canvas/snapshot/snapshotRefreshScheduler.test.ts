import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSnapshotRefreshScheduler } from './snapshotRefreshScheduler';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const setup = (shouldDefer: () => boolean, publish = vi.fn()) => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  return { publish, scheduler: createSnapshotRefreshScheduler(shouldDefer, publish) };
};

describe('snapshot refresh during live zoom', () => {
  it('coalesces ready events and commits once after zoom settles', () => {
    let zooming = true;
    const { publish, scheduler } = setup(() => zooming);
    scheduler.request(); scheduler.request(); scheduler.request();
    vi.advanceTimersByTime(80);
    expect(publish).not.toHaveBeenCalled();
    vi.advanceTimersByTime(240);
    expect(publish).not.toHaveBeenCalled();
    zooming = false;
    vi.advanceTimersByTime(80);
    expect(publish).toHaveBeenCalledOnce();
    scheduler.dispose();
  });
  it('publishes in one animation frame when no zoom is active', () => {
    const { publish, scheduler } = setup(() => false);
    scheduler.request(); scheduler.request();
    expect(publish).not.toHaveBeenCalled();
    vi.advanceTimersByTime(80);
    expect(publish).toHaveBeenCalledOnce();
    scheduler.dispose();
  });
  it('disposes deferred cache publications and pending frames', () => {
    let zooming = true;
    const { publish, scheduler } = setup(() => zooming);
    scheduler.request(); vi.advanceTimersByTime(80); scheduler.dispose();
    zooming = false; vi.advanceTimersByTime(500);
    expect(publish).not.toHaveBeenCalled();
  });
});
