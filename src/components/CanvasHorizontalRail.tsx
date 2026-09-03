import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent,
} from 'react';

const MIN_THUMB_WIDTH = 32;

export type HorizontalRailMetrics = {
  scrollable: boolean;
  thumbWidth: number;
  thumbLeft: number;
  canScrollLeft: boolean;
  canScrollRight: boolean;
};

export const getHorizontalRailMetrics = ({
  clientWidth,
  scrollWidth,
  scrollLeft,
  trackWidth,
}: {
  clientWidth: number;
  scrollWidth: number;
  scrollLeft: number;
  trackWidth: number;
}): HorizontalRailMetrics => {
  const safeClientWidth = Math.max(0, clientWidth);
  const safeScrollWidth = Math.max(safeClientWidth, scrollWidth);
  const safeTrackWidth = Math.max(0, trackWidth);
  const maxScrollLeft = Math.max(0, safeScrollWidth - safeClientWidth);
  const normalizedScrollLeft = Math.min(maxScrollLeft, Math.max(0, scrollLeft));
  const scrollable = maxScrollLeft > 1 && safeTrackWidth > 0;
  const thumbWidth = scrollable
    ? Math.min(safeTrackWidth, Math.max(
      MIN_THUMB_WIDTH,
      safeTrackWidth * (safeClientWidth / safeScrollWidth),
    ))
    : safeTrackWidth;
  const thumbTravel = Math.max(0, safeTrackWidth - thumbWidth);
  const thumbLeft = scrollable && maxScrollLeft > 0
    ? thumbTravel * (normalizedScrollLeft / maxScrollLeft)
    : 0;
  return {
    scrollable,
    thumbWidth,
    thumbLeft,
    canScrollLeft: scrollable && normalizedScrollLeft > 1,
    canScrollRight: scrollable && normalizedScrollLeft < maxScrollLeft - 1,
  };
};

const EMPTY_METRICS: HorizontalRailMetrics = {
  scrollable: false,
  thumbWidth: 0,
  thumbLeft: 0,
  canScrollLeft: false,
  canScrollRight: false,
};

export function CanvasHorizontalRail({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const viewportRef = useRef<HTMLSpanElement | null>(null);
  const trackRef = useRef<HTMLSpanElement | null>(null);
  const [metrics, setMetrics] = useState<HorizontalRailMetrics>(EMPTY_METRICS);

  const syncMetrics = useCallback(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;
    const next = getHorizontalRailMetrics({
      clientWidth: viewport.clientWidth,
      scrollWidth: viewport.scrollWidth,
      scrollLeft: viewport.scrollLeft,
      trackWidth: track.clientWidth,
    });
    setMetrics(previous => (
      previous.scrollable === next.scrollable
      && Math.abs(previous.thumbWidth - next.thumbWidth) < 0.5
      && Math.abs(previous.thumbLeft - next.thumbLeft) < 0.5
      && previous.canScrollLeft === next.canScrollLeft
      && previous.canScrollRight === next.canScrollRight
        ? previous
        : next
    ));
  }, []);

  useLayoutEffect(() => {
    syncMetrics();
  }, [children, syncMetrics]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const frame = window.requestAnimationFrame(syncMetrics);
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(syncMetrics)
      : null;
    resizeObserver?.observe(viewport);
    if (viewport.firstElementChild) resizeObserver?.observe(viewport.firstElementChild);
    const mutationObserver = typeof MutationObserver !== 'undefined'
      ? new MutationObserver(syncMetrics)
      : null;
    mutationObserver?.observe(viewport, { childList: true, subtree: true });
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [syncMetrics]);

  const setScrollFromThumbLeft = (thumbLeft: number) => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;
    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const thumbTravel = Math.max(0, track.clientWidth - metrics.thumbWidth);
    viewport.scrollLeft = thumbTravel > 0
      ? Math.min(maxScrollLeft, Math.max(0, thumbLeft / thumbTravel * maxScrollLeft))
      : 0;
  };

  const handleThumbPointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const viewport = viewportRef.current;
    if (!viewport || !metrics.scrollable) return;
    event.preventDefault();
    event.stopPropagation();
    const pointerTarget = event.currentTarget;
    pointerTarget.setPointerCapture?.(event.pointerId);
    const startClientX = event.clientX;
    const startThumbLeft = metrics.thumbLeft;

    const handleMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      setScrollFromThumbLeft(startThumbLeft + moveEvent.clientX - startClientX);
    };
    const finish = (upEvent: PointerEvent) => {
      upEvent.preventDefault();
      upEvent.stopPropagation();
      pointerTarget.releasePointerCapture?.(event.pointerId);
      document.removeEventListener('pointermove', handleMove, true);
      document.removeEventListener('pointerup', finish, true);
      document.removeEventListener('pointercancel', finish, true);
    };
    document.addEventListener('pointermove', handleMove, true);
    document.addEventListener('pointerup', finish, true);
    document.addEventListener('pointercancel', finish, true);
  };

  const handleTrackPointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (!metrics.scrollable || event.target !== event.currentTarget) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setScrollFromThumbLeft(event.clientX - rect.left - metrics.thumbWidth / 2);
  };

  const handleWheel = (event: WheelEvent<HTMLSpanElement>) => {
    const viewport = viewportRef.current;
    if (!viewport || viewport.scrollWidth <= viewport.clientWidth + 1) return;
    const delta = Math.abs(event.deltaX) >= Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY;
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    viewport.scrollLeft += delta;
  };

  return (
    <span className={`relative flex h-[58px] w-full min-w-0 pb-[7px] ${className}`}>
      <span
        ref={viewportRef}
        className="flex h-[51px] w-full min-w-0 items-center gap-1.5 overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-[11px] bg-stone-950/[0.025] px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:bg-white/[0.025]"
        onScroll={syncMetrics}
        onWheel={handleWheel}
      >
        {children}
      </span>
      {metrics.scrollable && (
        <>
          <span
            className={`pointer-events-none absolute bottom-[7px] left-0 top-0 z-20 w-5 bg-gradient-to-r from-white/90 to-transparent transition-opacity dark:from-[#2a2a2a]/95 ${
              metrics.canScrollLeft ? 'opacity-100' : 'opacity-0'
            }`}
          />
          <span
            className={`pointer-events-none absolute bottom-[7px] right-0 top-0 z-20 w-5 bg-gradient-to-l from-white/90 to-transparent transition-opacity dark:from-[#2a2a2a]/95 ${
              metrics.canScrollRight ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </>
      )}
      <span
        ref={trackRef}
        className={`absolute inset-x-1 bottom-[1px] z-30 h-[4px] cursor-pointer rounded-[2px] bg-stone-300/45 transition-opacity dark:bg-white/10 ${
          metrics.scrollable ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onPointerDown={handleTrackPointerDown}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <span
          className="absolute inset-y-0 cursor-grab rounded-[2px] bg-stone-500/72 shadow-[0_1px_3px_rgba(41,37,36,0.14)] transition-[background-color] hover:bg-stone-600/82 active:cursor-grabbing active:bg-stone-700 dark:bg-white/38 dark:hover:bg-white/58 dark:active:bg-white/72"
          style={{
            left: metrics.thumbLeft,
            width: metrics.thumbWidth,
          }}
          onPointerDown={handleThumbPointerDown}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        />
      </span>
    </span>
  );
}
