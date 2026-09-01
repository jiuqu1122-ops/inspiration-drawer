import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getCanvasChatVisibility,
  setCanvasChatSidebarWidth,
  setCanvasChatVisibility,
  subscribeCanvasChatVisibility,
  toggleCanvasChatVisibility,
} from './canvasChatVisibility';

describe('canvas chat visibility', () => {
  afterEach(() => {
    setCanvasChatVisibility(false);
    vi.restoreAllMocks();
  });

  it('notifies only the isolated chat subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCanvasChatVisibility(listener);
    setCanvasChatVisibility(true);
    expect(getCanvasChatVisibility()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    toggleCanvasChatVisibility();
    expect(getCanvasChatVisibility()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('updates the shared sidebar offset without another visibility notification', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCanvasChatVisibility(listener);
    setCanvasChatVisibility(true);
    listener.mockClear();
    setCanvasChatSidebarWidth(536);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
