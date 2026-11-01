import { describe, expect, it, vi } from 'vitest';
import { runCanvasPasteWithViewportPreserved } from './canvasPasteViewport';

describe('canvas paste viewport preservation', () => {
  it('restores the same scroll position immediately and after the render frame', () => {
    const surface = { scrollLeft: 320, scrollTop: 180 } as HTMLDivElement;
    const surfaceRef = { current: surface };
    const writeScroll = vi.fn((target: HTMLDivElement, left: number, top: number) => {
      target.scrollLeft = left;
      target.scrollTop = top;
    });
    const scheduled: { current?: FrameRequestCallback } = {};

    const count = runCanvasPasteWithViewportPreserved(
      surfaceRef,
      writeScroll,
      () => {
        surface.scrollLeft = 0;
        surface.scrollTop = 0;
        return 1;
      },
      callback => {
        scheduled.current = callback;
        return 1;
      },
    );

    expect(count).toBe(1);
    expect([surface.scrollLeft, surface.scrollTop]).toEqual([320, 180]);
    surface.scrollLeft = 12;
    surface.scrollTop = 34;
    scheduled.current?.(0);
    expect([surface.scrollLeft, surface.scrollTop]).toEqual([320, 180]);
    expect(writeScroll).toHaveBeenCalledTimes(2);
  });
});
