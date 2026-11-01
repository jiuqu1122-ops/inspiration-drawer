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
    setCanvasChatSidebarWidth(480);
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

  it('keeps document-flow panels clear of the canvas chat by updating margin-right', () => {
    const panel = {
      dataset: { canvasChatMarginBase: '0' },
      style: { marginRight: '' },
    };
    vi.stubGlobal('document', {
      querySelectorAll: (selector: string) => (
        selector.includes('data-canvas-chat-margin-base') ? [panel] : []
      ),
    });
    setCanvasChatSidebarWidth(520);
    setCanvasChatVisibility(true);
    expect(panel.style.marginRight).toBe('520px');
    setCanvasChatVisibility(false);
    expect(panel.style.marginRight).toBe('0px');
  });
});
