import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDelayedHover } from './delayedHover';

afterEach(() => vi.useRealTimers());
describe('analysis hover delay', () => {
  it('opens only after 500ms and does not restart for duplicate enter events', () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    const hover = createDelayedHover(changed);
    hover.enter();
    vi.advanceTimersByTime(250);
    hover.enter();
    vi.advanceTimersByTime(249);
    expect(changed).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(changed).toHaveBeenCalledExactlyOnceWith(true);
    hover.enter();
    vi.advanceTimersByTime(1000);
    expect(changed).toHaveBeenCalledOnce();
  });
  it('cancels a brief visit and starts a full new delay on re-entry', () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    const hover = createDelayedHover(changed);
    hover.enter();
    vi.advanceTimersByTime(400);
    hover.leave();
    vi.advanceTimersByTime(1000);
    expect(changed).toHaveBeenCalledExactlyOnceWith(false);
    hover.enter();
    vi.advanceTimersByTime(499);
    expect(changed).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1);
    expect(changed).toHaveBeenLastCalledWith(true);
    hover.leave();
    expect(changed).toHaveBeenLastCalledWith(false);
  });
  it('cancels on unmount or material changes and remains reusable after cleanup', () => {
    vi.useFakeTimers();
    const changed = vi.fn();
    const hover = createDelayedHover(changed);
    hover.enter();
    hover.cancel();
    vi.advanceTimersByTime(1000);
    expect(changed).not.toHaveBeenCalled();
    hover.enter();
    vi.advanceTimersByTime(500);
    expect(changed).toHaveBeenCalledExactlyOnceWith(true);
  });
});
