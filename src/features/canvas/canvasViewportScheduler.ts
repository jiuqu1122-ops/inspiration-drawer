import type { CanvasViewportRect } from '../../types/canvasRuntime';

export const CANVAS_LIVE_VIEWPORT_INTERVAL_MS = 32;

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

/** Publish bounded membership changes while the visual transform/scroll remains
 * per-frame. Deferring all panning updates leaves newly exposed tiles blank. */
export function scheduleCanvasViewportPublication(context: {
  active: boolean;
  interacting: boolean;
  zooming: boolean;
  panning: boolean;
  frame: { current: number | null };
  deferred: { current: boolean };
  live: ReturnType<typeof createCanvasViewportScheduler>;
  publish: () => void;
  requestFrame: (callback: FrameRequestCallback) => number;
}) {
  if (!context.active || context.frame.current !== null) return;
  if (context.interacting || context.zooming || context.panning) {
    context.deferred.current = true;
    context.live.request(context.publish);
    return;
  }
  context.live.cancel();
  context.frame.current = context.requestFrame(context.publish);
}
