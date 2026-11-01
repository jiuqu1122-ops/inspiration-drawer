import { describe, expect, it, vi } from 'vitest';
import {
  bindDrawerResizePointerEvents,
  calculateDrawerResizeBounds,
  createDrawerResizeSession,
  createDrawerResizeSnapshot,
  createLatestResizeQueue,
  type DrawerPhysicalBounds,
  type DrawerResizeGeometry,
} from './drawerResizeSession';

const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const frames = () => {
  let id = 0;
  const callbacks = new Map<number, () => void>();
  return {
    scheduleFrame: (callback: () => void) => { callbacks.set(++id, callback); return id; },
    cancelFrame: (frame: number) => { callbacks.delete(frame); },
    run: () => { const batch = [...callbacks.values()]; callbacks.clear(); batch.forEach((callback) => callback()); },
    count: () => callbacks.size,
  };
};
const geometry = (overrides: Partial<DrawerResizeGeometry> = {}): DrawerResizeGeometry => ({
  position: { x: 500, y: 100 },
  size: { width: 1200, height: 750 },
  scaleFactor: 1.25,
  workArea: { position: { x: 0, y: 0 }, size: { width: 2400, height: 1500 } },
  ...overrides,
});
const limits = { minWidth: 880, maxWidth: 1800, minHeight: 560, maxHeight: 1200 };
const bounds = (widthPx: number): DrawerPhysicalBounds => ({ rightAnchorPx: 1700, topAnchorPx: 100, widthPx, heightPx: 750 });

const sessionFixture = (readGeometry = vi.fn(async () => geometry())) => {
  const raf = frames();
  const applied: DrawerPhysicalBounds[] = [];
  const pendingNative: ReturnType<typeof deferred<void>>[] = [];
  const queue = createLatestResizeQueue<DrawerPhysicalBounds>({
    ...raf,
    equals: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    apply: vi.fn((value) => {
      applied.push(value);
      const native = deferred();
      pendingNative.push(native);
      return native.promise;
    }),
  });
  const onBounds = vi.fn();
  const session = createDrawerResizeSession({ queue, limits, readGeometry, onBounds });
  return { raf, queue, applied, pendingNative, session, readGeometry, onBounds };
};

describe('latest native resize request queue', () => {
  it('coalesces a burst into one frame and skips a completed duplicate', async () => {
    const raf = frames();
    const apply = vi.fn(async (_request: number) => {});
    const queue = createLatestResizeQueue({ ...raf, apply, equals: (a, b) => a === b });
    queue.enqueue(1); queue.enqueue(2); queue.enqueue(3);
    expect(raf.count()).toBe(1);
    raf.run(); await tick();
    expect(apply.mock.calls).toEqual([[3]]);
    queue.enqueue(3);
    expect(raf.count()).toBe(0);
    await queue.flush();
    expect(apply).toHaveBeenCalledOnce();
  });

  it('serializes delayed native calls and only applies the latest rapid reversal', async () => {
    const raf = frames();
    const first = deferred();
    const second = deferred();
    const apply = vi.fn<(request: number) => Promise<void>>()
      .mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const queue = createLatestResizeQueue({ ...raf, apply, equals: (a, b) => a === b });
    queue.enqueue(1400); raf.run(); await tick();
    queue.enqueue(1500); queue.enqueue(1300); queue.enqueue(1450);
    raf.run(); await tick();
    expect(apply.mock.calls).toEqual([[1400]]);
    first.resolve(); await tick();
    expect(apply.mock.calls).toEqual([[1400]]);
    raf.run(); await tick();
    expect(apply.mock.calls).toEqual([[1400], [1450]]);
    second.resolve(); await queue.flush();
  });

  it('cancels a stale pending reversal when the final size matches the in-flight call', async () => {
    const raf = frames();
    const native = deferred();
    const apply = vi.fn((_value: number) => native.promise);
    const queue = createLatestResizeQueue({ ...raf, apply, equals: (a, b) => a === b });
    queue.enqueue(1200); raf.run(); await tick();
    queue.enqueue(1500); queue.enqueue(1200);
    const final = queue.flush();
    native.resolve(); await final;
    expect(apply.mock.calls).toEqual([[1200]]);
    expect(raf.count()).toBe(0);
  });

  it('flushes without another animation frame, waits for in-flight and final writes', async () => {
    const raf = frames();
    const native = [deferred(), deferred()];
    const apply = vi.fn<(value: number) => Promise<void>>()
      .mockReturnValueOnce(native[0].promise).mockReturnValueOnce(native[1].promise);
    const queue = createLatestResizeQueue({ ...raf, apply, equals: (a, b) => a === b });
    queue.enqueue(1200); raf.run(); await tick();
    queue.enqueue(1350);
    const completed = vi.fn();
    const final = queue.flush().then(completed);
    await tick();
    expect(completed).not.toHaveBeenCalled();
    native[0].resolve(); await tick();
    expect(apply.mock.calls).toEqual([[1200], [1350]]);
    expect(completed).not.toHaveBeenCalled();
    native[1].resolve(); await final;
    expect(completed).toHaveBeenCalledOnce();
    expect(raf.count()).toBe(0);
  });

  it('discards queued frames on cancellation but waits for an unavoidable native call', async () => {
    const raf = frames();
    const native = deferred();
    const apply = vi.fn((_value: number) => native.promise);
    const queue = createLatestResizeQueue({ ...raf, apply, equals: (a, b) => a === b });
    queue.enqueue(1200); raf.run(); await tick();
    queue.enqueue(1500); queue.discardPending();
    const done = vi.fn();
    const cancel = queue.flush().then(done);
    await tick(); expect(done).not.toHaveBeenCalled();
    native.resolve(); await cancel;
    raf.run(); await tick();
    expect(apply.mock.calls).toEqual([[1200]]);
    queue.discardPending();
    queue.enqueue(1200); await queue.flush();
    expect(apply.mock.calls).toEqual([[1200], [1200]]);
  });

  it('reports a final failure, recovers on the next request, and diagnostics cannot break the lane', async () => {
    const raf = frames();
    const error = new Error('SetWindowPos failed');
    const onError = vi.fn(() => { throw new Error('diagnostic failure'); });
    const apply = vi.fn<(value: number) => Promise<void>>()
      .mockRejectedValueOnce(error).mockResolvedValue(undefined);
    const queue = createLatestResizeQueue({ ...raf, apply, onError, equals: (a, b) => a === b });
    queue.enqueue(1200);
    await expect(queue.flush()).rejects.toBe(error);
    expect(onError).toHaveBeenCalledWith(error);
    queue.enqueue(1300);
    await queue.flush();
    expect(apply.mock.calls).toEqual([[1200], [1300]]);
  });
});

describe('immutable physical drawer resize geometry', () => {
  it.each([1, 1.25, 1.5, 1.75, 2, 1.3333333333])('never recomputes the right/top edge at DPI %s', (scaleFactor) => {
    const snapshot = createDrawerResizeSnapshot(geometry({ scaleFactor }), limits);
    for (const deltaX of [-200.25, -40.5, 0, 71.3, -99.7, 0]) {
      const next = calculateDrawerResizeBounds(snapshot, deltaX, 20.7);
      expect(next.rightAnchorPx).toBe(1700);
      expect(next.topAnchorPx).toBe(100);
      const x = next.rightAnchorPx - next.widthPx;
      expect(x + next.widthPx).toBe(1700);
      expect(Number.isInteger(x)).toBe(true);
      expect(Number.isInteger(next.widthPx)).toBe(true);
      expect(Number.isInteger(next.heightPx)).toBe(true);
    }
  });

  it('rounds pointer deltas once in physical space and returns to the original rect', () => {
    const snapshot = createDrawerResizeSnapshot(geometry(), limits);
    expect(calculateDrawerResizeBounds(snapshot, -31.6, 20.4)).toEqual({
      rightAnchorPx: 1700, topAnchorPx: 100, widthPx: 1239, heightPx: 776,
    });
    expect(calculateDrawerResizeBounds(snapshot, 0, 0)).toEqual(bounds(1200));
  });

  it('stops growing at the left/bottom screen bounds instead of moving the fixed anchors', () => {
    const snapshot = createDrawerResizeSnapshot(geometry(), limits);
    expect(calculateDrawerResizeBounds(snapshot, -10000, 10000)).toEqual({
      rightAnchorPx: 1700, topAnchorPx: 100, widthPx: 1700, heightPx: 1400,
    });
    expect(calculateDrawerResizeBounds(snapshot, 10000, -10000)).toEqual({
      rightAnchorPx: 1700, topAnchorPx: 100, widthPx: 1100, heightPx: 700,
    });
  });

  it('handles negative monitor coordinates and taskbar work-area insets', () => {
    const snapshot = createDrawerResizeSnapshot(geometry({
      position: { x: -1700, y: -200 },
      workArea: { position: { x: -1920, y: -300 }, size: { width: 1920, height: 1380 } },
    }), limits);
    const next = calculateDrawerResizeBounds(snapshot, -10000, 10000);
    expect(next).toEqual({ rightAnchorPx: -500, topAnchorPx: -200, widthPx: 1420, heightPx: 1280 });
    expect(next.rightAnchorPx - next.widthPx).toBe(-1920);
    expect(next.topAnchorPx + next.heightPx).toBe(1080);
  });

  it('normalizes offscreen anchors once and fits a work area smaller than UI minimums', () => {
    const snapshot = createDrawerResizeSnapshot(geometry({
      position: { x: -100, y: 800 },
      workArea: { position: { x: 0, y: 0 }, size: { width: 900, height: 600 } },
    }), limits);
    expect(calculateDrawerResizeBounds(snapshot, -1000, 1000)).toEqual({
      rightAnchorPx: 900, topAnchorPx: 0, widthPx: 900, heightPx: 600,
    });
  });

  it.each([0, -1, NaN, Infinity])('rejects invalid DPI %s rather than silently using CSS pixels', (scaleFactor) => {
    expect(() => createDrawerResizeSnapshot(geometry({ scaleFactor }), limits)).toThrow('Invalid drawer resize geometry');
  });
});

describe('whole pointer gesture session', () => {
  it('waits for an older ordinary/native resize before reading the initial rect', async () => {
    const raf = frames();
    const native = deferred();
    const readGeometry = vi.fn(async () => geometry());
    const apply = vi.fn((_value: DrawerPhysicalBounds) => native.promise);
    const queue = createLatestResizeQueue({ ...raf, apply, equals: (a, b) => a === b });
    queue.enqueue(bounds(1200)); raf.run(); await tick();
    const session = createDrawerResizeSession({ queue, limits, readGeometry, onBounds: vi.fn() });
    session.move(-10, 0);
    await tick(); expect(readGeometry).not.toHaveBeenCalled();
    native.resolve(); await session.ready;
    expect(readGeometry).toHaveBeenCalledOnce();
    await session.finish();
  });

  it('retains moves made while geometry is loading and captures pointerup before readiness', async () => {
    const geometryReady = deferred<DrawerResizeGeometry>();
    const fixture = sessionFixture(vi.fn(() => geometryReady.promise));
    fixture.session.move(-10, 2);
    fixture.session.move(-40, 20);
    const done = vi.fn();
    const finish = fixture.session.finish().then(done);
    await tick();
    expect(fixture.applied).toEqual([]);
    geometryReady.resolve(geometry()); await tick();
    expect(fixture.applied).toEqual([{ rightAnchorPx: 1700, topAnchorPx: 100, widthPx: 1250, heightPx: 775 }]);
    expect(done).not.toHaveBeenCalled();
    fixture.pendingNative[0].resolve(); await finish;
    expect(done).toHaveBeenCalledOnce();
    expect(fixture.raf.count()).toBe(0);
  });

  it('keeps one snapshot across delayed writes, rapid reversal and release in-flight', async () => {
    const fixture = sessionFixture();
    await fixture.session.ready;
    fixture.session.move(-60, 30); fixture.raf.run(); await tick();
    fixture.session.move(-120, 50);
    fixture.session.move(50, 10);
    fixture.session.move(-24, 12);
    const done = vi.fn();
    const finish = fixture.session.finish().then(done);
    fixture.pendingNative[0].resolve(); await tick();
    expect(fixture.applied).toEqual([
      { rightAnchorPx: 1700, topAnchorPx: 100, widthPx: 1275, heightPx: 788 },
      { rightAnchorPx: 1700, topAnchorPx: 100, widthPx: 1230, heightPx: 765 },
    ]);
    expect(fixture.readGeometry).toHaveBeenCalledOnce();
    expect(done).not.toHaveBeenCalled();
    fixture.pendingNative[1].resolve(); await finish;
    fixture.session.move(-200, 100); fixture.raf.run(); await tick();
    expect(fixture.applied).toHaveLength(2);
  });

  it('cancels before geometry is ready without late writes or onBounds notifications', async () => {
    const geometryReady = deferred<DrawerResizeGeometry>();
    const fixture = sessionFixture(vi.fn(() => geometryReady.promise));
    fixture.session.move(-100, 50);
    await tick();
    const cancelled = fixture.session.cancel();
    geometryReady.resolve(geometry()); await cancelled;
    await fixture.session.finish(); fixture.raf.run(); await tick();
    expect(fixture.applied).toEqual([]);
    expect(fixture.onBounds).not.toHaveBeenCalled();
  });

  it('cancels pending work while a native write is in-flight without applying a stale final frame', async () => {
    const fixture = sessionFixture();
    await fixture.session.ready;
    fixture.session.move(-10, 0); fixture.raf.run(); await tick();
    fixture.session.move(-100, 50);
    const done = vi.fn();
    const cancelled = fixture.session.cancel().then(done);
    await tick(); expect(done).not.toHaveBeenCalled();
    fixture.pendingNative[0].resolve(); await cancelled;
    fixture.raf.run(); await tick();
    expect(fixture.applied).toEqual([bounds(1212)]);
  });

  it('does not resize a stationary click and has an idempotent finish', async () => {
    const fixture = sessionFixture();
    await fixture.session.ready;
    const finish = fixture.session.finish();
    expect(fixture.session.finish()).toBe(finish);
    await finish;
    expect(fixture.applied).toEqual([]);
  });

  it('surfaces a geometry failure and can still be cancelled cleanly', async () => {
    const error = new Error('window closed');
    const fixture = sessionFixture(vi.fn(async () => { throw error; }));
    await expect(fixture.session.ready).rejects.toBe(error);
    await expect(fixture.session.finish()).rejects.toBe(error);
    await fixture.session.cancel();
    expect(fixture.applied).toEqual([]);
  });
});

class EventSurface {
  listeners = new Map<string, Set<(event: any) => void>>();
  style = { cursor: 'auto', userSelect: 'text' };
  body = { style: this.style };
  visibilityState = 'visible';
  captured = new Set<number>();
  addEventListener(type: string, callback: (event: any) => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(callback); this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, callback: (event: any) => void) { this.listeners.get(type)?.delete(callback); }
  emit(type: string, event: any = {}) { [...this.listeners.get(type) ?? []].forEach((listener) => listener(event)); }
  setPointerCapture(pointerId: number) { this.captured.add(pointerId); }
  hasPointerCapture(pointerId: number) { return this.captured.has(pointerId); }
  releasePointerCapture(pointerId: number) { this.captured.delete(pointerId); this.emit('lostpointercapture', { pointerId }); }
  count() { return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0); }
}
const pointerFixture = () => {
  const target = new EventSurface();
  const eventWindow = new EventSurface();
  const eventDocument = new EventSurface();
  const onMove = vi.fn(); const onFinish = vi.fn(); const onAbort = vi.fn();
  const unbind = bindDrawerResizePointerEvents({
    target: target as unknown as Element, eventWindow: eventWindow as unknown as Window,
    eventDocument: eventDocument as unknown as Document, pointerId: 3, onMove, onFinish, onAbort,
  });
  return { target, eventWindow, eventDocument, onMove, onFinish, onAbort, unbind };
};

describe('pointer capture and resize teardown', () => {
  it('captures the initiating pointer, ignores others and uses the pointerup final coordinates', () => {
    const fixture = pointerFixture();
    expect(fixture.target.captured.has(3)).toBe(true);
    fixture.eventWindow.emit('pointermove', { pointerId: 4 });
    fixture.eventWindow.emit('pointerup', { pointerId: 4 });
    expect(fixture.onMove).not.toHaveBeenCalled();
    expect(fixture.onFinish).not.toHaveBeenCalled();
    const pointer = { pointerId: 3, screenX: 100, screenY: 900, cancelable: true, preventDefault: vi.fn() };
    fixture.eventWindow.emit('pointermove', pointer);
    fixture.eventWindow.emit('pointerup', pointer);
    expect(fixture.onMove).toHaveBeenCalledWith(pointer);
    expect(fixture.onFinish).toHaveBeenCalledExactlyOnceWith(pointer);
    expect(pointer.preventDefault).toHaveBeenCalledOnce();
    expect(fixture.target.captured.size).toBe(0);
    expect(fixture.target.count() + fixture.eventWindow.count() + fixture.eventDocument.count()).toBe(0);
    expect(fixture.eventDocument.style).toEqual({ cursor: 'auto', userSelect: 'text' });
  });

  it.each(['pointercancel', 'lostpointercapture', 'blur', 'visibilitychange'])('commits the last move and cleans up exactly once on %s', (type) => {
    const fixture = pointerFixture();
    fixture.eventWindow.emit('pointermove', { pointerId: 3, screenX: -200, screenY: 300 });
    if (type === 'lostpointercapture') fixture.target.emit(type, { pointerId: 3 });
    else if (type === 'visibilitychange') {
      fixture.eventDocument.visibilityState = 'hidden'; fixture.eventDocument.emit(type);
    } else fixture.eventWindow.emit(type, { pointerId: 3, screenX: 0, screenY: 0 });
    fixture.eventWindow.emit('pointerup', { pointerId: 3 }); fixture.unbind();
    expect(fixture.onFinish).toHaveBeenCalledExactlyOnceWith();
    expect(fixture.onMove).toHaveBeenCalledOnce();
    expect(fixture.onAbort).not.toHaveBeenCalled();
    expect(fixture.target.count() + fixture.eventWindow.count() + fixture.eventDocument.count()).toBe(0);
  });

  it('discards work on page teardown and removes all capture/listeners/styles', () => {
    const fixture = pointerFixture();
    fixture.eventWindow.emit('pagehide'); fixture.eventWindow.emit('pagehide');
    expect(fixture.onAbort).toHaveBeenCalledOnce();
    expect(fixture.onFinish).not.toHaveBeenCalled();
    expect(fixture.target.count() + fixture.eventWindow.count() + fixture.eventDocument.count()).toBe(0);
    expect(fixture.eventDocument.style).toEqual({ cursor: 'auto', userSelect: 'text' });
  });

  it('retains window-listener fallback if native pointer capture is unavailable', () => {
    const target = new EventSurface(); target.setPointerCapture = () => { throw new Error('capture unavailable'); };
    const eventWindow = new EventSurface(); const eventDocument = new EventSurface();
    const onFinish = vi.fn();
    bindDrawerResizePointerEvents({
      target: target as unknown as Element, eventWindow: eventWindow as unknown as Window,
      eventDocument: eventDocument as unknown as Document, pointerId: 3,
      onMove: vi.fn(), onFinish, onAbort: vi.fn(),
    });
    eventWindow.emit('pointerup', { pointerId: 3, screenX: 20 });
    expect(onFinish).toHaveBeenCalledOnce();
    expect(target.count() + eventWindow.count() + eventDocument.count()).toBe(0);
  });
});
