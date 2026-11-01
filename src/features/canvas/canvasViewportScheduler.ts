import type { CanvasViewportRect } from '../../types/canvasRuntime';

/** Bounded updates during wheel gestures: transforms stay per-frame, while
 * newly revealed nodes are mounted without waiting for the wheel to stop. */
export const createCanvasViewportScheduler = (delay = 80) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: (() => void) | null = null;
  return {
    request(update: () => void) {
      latest = update;
      if (timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        const run = latest; latest = null;
        run?.();
      }, delay);
    },
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null; latest = null;
    },
  };
};

export const readCanvasVisualViewport = (
  surface: Pick<HTMLDivElement, 'clientWidth' | 'clientHeight' | 'scrollLeft' | 'scrollTop'>,
  scale: number,
  visual: CanvasViewportRect | null,
  chatWidth = 0,
): CanvasViewportRect => ({
  x: visual?.x ?? surface.scrollLeft / scale,
  y: visual?.y ?? surface.scrollTop / scale,
  width: Math.max(1, surface.clientWidth - Math.min(Math.max(0, chatWidth), surface.clientWidth - 1)) / scale,
  height: surface.clientHeight / scale,
});
