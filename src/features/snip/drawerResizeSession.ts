/** A single native-write lane. Pointer frames are coalesced; flush bypasses rAF. */
export interface LatestResizeQueue<T> {
  enqueue: (request: T) => void;
  flush: () => Promise<void>;
  discardPending: () => void;
}

export const createLatestResizeQueue = <T>(options: {
  apply: (request: T) => Promise<unknown>;
  scheduleFrame: (callback: () => void) => number;
  cancelFrame: (id: number) => void;
  equals: (a: T, b: T) => boolean;
  onError?: (error: unknown) => void;
}): LatestResizeQueue<T> => {
  let pending: T | null = null;
  let inFlight: T | null = null;
  let lastApplied: T | null = null;
  let frame: number | null = null;
  let draining = false;
  let lastFailure: { error: unknown } | null = null;
  const waiters: { resolve: () => void; reject: (error: unknown) => void }[] = [];

  const cancelFrame = () => {
    if (frame !== null) options.cancelFrame(frame);
    frame = null;
  };
  const settle = () => {
    if (inFlight !== null || pending !== null) return;
    draining = false;
    for (const waiter of waiters.splice(0)) {
      if (lastFailure) waiter.reject(lastFailure.error);
      else waiter.resolve();
    }
  };
  const schedule = () => {
    if (frame !== null || inFlight !== null || pending === null) return;
    frame = options.scheduleFrame(() => {
      frame = null;
      pump();
    });
  };
  const pump = () => {
    if (inFlight !== null) return;
    if (pending === null) {
      settle();
      return;
    }
    const request = pending;
    pending = null;
    inFlight = request;
    // Also catches synchronous throws in an injected/native implementation.
    void Promise.resolve().then(() => options.apply(request)).then(() => {
      lastApplied = request;
      lastFailure = null;
    }, (error: unknown) => {
      lastApplied = null;
      lastFailure = { error };
      try { options.onError?.(error); } catch { /* Diagnostics must not break the write lane. */ }
    }).finally(() => {
      inFlight = null;
      if (draining) pump();
      else if (pending !== null) schedule();
      else settle();
    });
  };

  return {
    enqueue(request) {
      // A reversal to the in-flight size supersedes an older, queued size too.
      if (inFlight !== null && options.equals(request, inFlight)) pending = null;
      else if (inFlight === null && lastApplied !== null && options.equals(request, lastApplied)) pending = null;
      else pending = request;
      if (pending === null) {
        cancelFrame();
        settle();
      } else if (draining) pump();
      else schedule();
    },
    flush() {
      cancelFrame();
      const result = new Promise<void>((resolve, reject) => waiters.push({ resolve, reject }));
      draining = true;
      pump();
      return result;
    },
    discardPending() {
      // Geometry may be changed by another mode after cancellation. Do not let
      // an old successful size suppress a necessary future native request.
      lastApplied = null;
      lastFailure = null;
      pending = null;
      cancelFrame();
      settle();
    },
  };
};

export interface DrawerPhysicalBounds {
  rightAnchorPx: number;
  topAnchorPx: number;
  widthPx: number;
  heightPx: number;
}

export interface DrawerResizeGeometry {
  position: { x: number; y: number };
  size: { width: number; height: number };
  scaleFactor: number;
  workArea: { position: { x: number; y: number }; size: { width: number; height: number } };
}

export interface DrawerResizeLimits {
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}

export interface DrawerResizeSnapshot extends DrawerPhysicalBounds {
  scaleFactor: number;
  minWidthPx: number;
  maxWidthPx: number;
  minHeightPx: number;
  maxHeightPx: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Freeze one physical rect/work area/DPI for the entire gesture, never per frame. */
export const createDrawerResizeSnapshot = (geometry: DrawerResizeGeometry, limits: DrawerResizeLimits): DrawerResizeSnapshot => {
  const { position, size, scaleFactor, workArea } = geometry;
  if (![
    position.x, position.y, size.width, size.height, scaleFactor,
    workArea.position.x, workArea.position.y, workArea.size.width, workArea.size.height,
    limits.minWidth, limits.maxWidth, limits.minHeight, limits.maxHeight,
  ].every(Number.isFinite) || scaleFactor <= 0 || size.width <= 0 || size.height <= 0
    || workArea.size.width <= 0 || workArea.size.height <= 0
    || limits.minWidth <= 0 || limits.minHeight <= 0
    || limits.maxWidth < limits.minWidth || limits.maxHeight < limits.minHeight) {
    throw new Error('Invalid drawer resize geometry');
  }
  const left = Math.round(workArea.position.x);
  const top = Math.round(workArea.position.y);
  const right = left + Math.round(workArea.size.width);
  const bottom = top + Math.round(workArea.size.height);
  if (right <= left || bottom <= top) throw new Error('Empty drawer resize work area');

  // Normalize an already off-screen window ONCE. In-bounds edges stay exact.
  // Work-area constraints take precedence on monitors smaller than the UI minimum.
  const minimumWidth = Math.min(Math.ceil(limits.minWidth * scaleFactor), right - left);
  const minimumHeight = Math.min(Math.ceil(limits.minHeight * scaleFactor), bottom - top);
  const initialRight = Math.round(position.x + size.width);
  const initialTop = Math.round(position.y);
  const rightAnchorPx = initialRight > left && initialRight <= right
    ? initialRight : clamp(initialRight, left + minimumWidth, right);
  const topAnchorPx = initialTop >= top && initialTop < bottom
    ? initialTop : clamp(initialTop, top, bottom - minimumHeight);
  const maxWidthPx = Math.min(Math.max(minimumWidth, Math.floor(limits.maxWidth * scaleFactor)), rightAnchorPx - left);
  const maxHeightPx = Math.min(Math.max(minimumHeight, Math.floor(limits.maxHeight * scaleFactor)), bottom - topAnchorPx);
  return {
    rightAnchorPx,
    topAnchorPx,
    widthPx: Math.round(size.width),
    heightPx: Math.round(size.height),
    scaleFactor,
    minWidthPx: Math.min(minimumWidth, maxWidthPx),
    maxWidthPx,
    minHeightPx: Math.min(minimumHeight, maxHeightPx),
    maxHeightPx,
  };
};

/** screenX/Y are CSS screen coordinates; native window APIs return physical pixels. */
export const calculateDrawerResizeBounds = (
  snapshot: DrawerResizeSnapshot,
  deltaX: number,
  deltaY: number,
): DrawerPhysicalBounds => {
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) throw new Error('Invalid drawer resize pointer');
  return {
    rightAnchorPx: snapshot.rightAnchorPx,
    topAnchorPx: snapshot.topAnchorPx,
    widthPx: clamp(snapshot.widthPx - Math.round(deltaX * snapshot.scaleFactor), snapshot.minWidthPx, snapshot.maxWidthPx),
    heightPx: clamp(snapshot.heightPx + Math.round(deltaY * snapshot.scaleFactor), snapshot.minHeightPx, snapshot.maxHeightPx),
  };
};

export interface DrawerResizeSession {
  ready: Promise<void>;
  move: (deltaX: number, deltaY: number) => void;
  finish: () => Promise<void>;
  cancel: () => Promise<void>;
}

export const createDrawerResizeSession = (options: {
  queue: LatestResizeQueue<DrawerPhysicalBounds>;
  readGeometry: () => Promise<DrawerResizeGeometry>;
  limits: DrawerResizeLimits;
  onBounds: (bounds: DrawerPhysicalBounds, scaleFactor: number) => void;
}): DrawerResizeSession => {
  let accepting = true;
  let cancelled = false;
  let snapshot: DrawerResizeSnapshot | null = null;
  let latestDelta: { x: number; y: number } | null = null;
  let finishPromise: Promise<void> | null = null;
  let cancelPromise: Promise<void> | null = null;
  const submit = () => {
    if (cancelled || !snapshot || !latestDelta) return;
    const bounds = calculateDrawerResizeBounds(snapshot, latestDelta.x, latestDelta.y);
    options.onBounds(bounds, snapshot.scaleFactor);
    options.queue.enqueue(bounds);
  };
  options.queue.discardPending();
  const ready = (async () => {
    // An earlier ordinary resize must finish BEFORE taking our immutable rect.
    // A failed earlier write is not fatal: read the actual native geometry instead.
    await options.queue.flush().catch(() => {});
    if (cancelled) return;
    const geometry = await options.readGeometry();
    if (cancelled) return;
    snapshot = createDrawerResizeSnapshot(geometry, options.limits);
    submit();
  })();
  // The owner reports initialization errors; avoid an unhandled rejection if the
  // pointer has not been released yet when native geometry collection fails.
  void ready.catch(() => {});
  return {
    ready,
    move(deltaX, deltaY) {
      if (!accepting || !Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;
      latestDelta = { x: deltaX, y: deltaY };
      submit();
    },
    finish() {
      accepting = false;
      finishPromise ??= (async () => {
        await ready;
        if (cancelled) return;
        // Capture pointerup even if no rAF fired (or no pointermove was delivered).
        submit();
        await options.queue.flush();
      })();
      return finishPromise;
    },
    cancel() {
      accepting = false;
      cancelled = true;
      options.queue.discardPending();
      cancelPromise ??= Promise.all([
        ready.catch(() => {}),
        options.queue.flush().catch(() => {}),
      ]).then(() => {});
      return cancelPromise;
    },
  };
};

/** DOM binding kept separate so capture loss/cancellation is deterministic in tests. */
export const bindDrawerResizePointerEvents = (options: {
  target: Element;
  eventWindow: Window;
  eventDocument: Document;
  pointerId: number;
  cursor?: 'ew-resize' | 'nesw-resize';
  onMove: (event: PointerEvent) => void;
  onFinish: (event?: PointerEvent) => void;
  onAbort: () => void;
}): (() => void) => {
  const { target, eventWindow, eventDocument, pointerId } = options;
  let disposed = false;
  const previousCursor = eventDocument.body.style.cursor;
  const previousUserSelect = eventDocument.body.style.userSelect;
  eventDocument.body.style.cursor = options.cursor ?? 'nesw-resize';
  eventDocument.body.style.userSelect = 'none';
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    eventWindow.removeEventListener('pointermove', move, true);
    eventWindow.removeEventListener('pointerup', up, true);
    eventWindow.removeEventListener('pointercancel', cancel, true);
    eventWindow.removeEventListener('blur', finish);
    eventWindow.removeEventListener('pagehide', abort);
    eventDocument.removeEventListener('visibilitychange', visibility);
    target.removeEventListener('lostpointercapture', lost);
    try {
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
    } catch { /* The WebView may already have released capture. */ }
    eventDocument.body.style.cursor = previousCursor;
    eventDocument.body.style.userSelect = previousUserSelect;
  };
  const move = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return;
    if (event.cancelable) event.preventDefault();
    options.onMove(event);
  };
  const finish = () => {
    if (disposed) return;
    dispose();
    options.onFinish();
  };
  const up = (event: PointerEvent) => {
    if (event.pointerId !== pointerId || disposed) return;
    dispose();
    options.onFinish(event);
  };
  const cancel = (event: PointerEvent) => {
    if (event.pointerId === pointerId) finish(); // Commit last move, not cancel's often-zero coordinates.
  };
  const lost: EventListener = (event) => {
    if ((event as PointerEvent).pointerId === pointerId) finish();
  };
  const abort = () => {
    if (disposed) return;
    dispose();
    options.onAbort();
  };
  const visibility = () => {
    if (eventDocument.visibilityState === 'hidden') finish();
  };
  eventWindow.addEventListener('pointermove', move, true);
  eventWindow.addEventListener('pointerup', up, true);
  eventWindow.addEventListener('pointercancel', cancel, true);
  eventWindow.addEventListener('blur', finish);
  eventWindow.addEventListener('pagehide', abort);
  eventDocument.addEventListener('visibilitychange', visibility);
  target.addEventListener('lostpointercapture', lost);
  try { target.setPointerCapture(pointerId); } catch { /* Window listeners are the fallback. */ }
  return dispose;
};
