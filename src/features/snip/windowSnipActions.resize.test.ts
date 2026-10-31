import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  invoke: vi.fn(),
  outerPosition: vi.fn(), outerSize: vi.fn(), scaleFactor: vi.fn(), currentMonitor: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke, convertFileSrc: (path: string) => path }));
vi.mock('@tauri-apps/api/window', async (original) => ({
  ...await original<typeof import('@tauri-apps/api/window')>(),
  getCurrentWindow: () => ({ outerPosition: native.outerPosition, outerSize: native.outerSize, scaleFactor: native.scaleFactor }),
  currentMonitor: native.currentMonitor,
}));

const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
};
const tick = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
class Surface {
  listeners = new Map<string, Set<(event: any) => void>>();
  style = { cursor: 'auto', userSelect: '' };
  body = { style: this.style };
  screen = { availWidth: 1920, availHeight: 1080 };
  captured = new Set<number>();
  addEventListener(type: string, callback: (event: any) => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(callback); this.listeners.set(type, listeners);
  }
  removeEventListener(type: string, callback: (event: any) => void) { this.listeners.get(type)?.delete(callback); }
  emit(type: string, event: any = {}) { [...this.listeners.get(type) ?? []].forEach((listener) => listener(event)); }
  setPointerCapture(pointerId: number) { this.captured.add(pointerId); }
  hasPointerCapture(pointerId: number) { return this.captured.has(pointerId); }
  releasePointerCapture(pointerId: number) { this.captured.delete(pointerId); }
  count() { return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0); }
}

let actions: typeof import('./windowSnipActions');
let eventWindow: Surface;
let eventDocument: Surface;
let handle: Surface;
let callbacks: Map<number, () => void>;
const frame = () => { const batch = [...callbacks.values()]; callbacks.clear(); batch.forEach((callback) => callback()); };
const point = (x: number, y: number, pointerId = 7) => ({ pointerId, screenX: x, screenY: y });
const down = () => ({
  ...point(1000, 800), button: 0, isPrimary: true, currentTarget: handle,
  preventDefault: vi.fn(), stopPropagation: vi.fn(),
}) as unknown as import('react').PointerEvent;

const context = () => {
  const ctx: any = {
    drawerWidthRef: { current: 960 }, drawerHeightRef: { current: 600 },
    drawerResizeAnchorRef: { current: 'right' },
    isResizingState: { current: false }, isGlobalMouseDown: { current: false },
    isPointerInsideDrawerRef: { current: true }, closeTimerRef: { current: null },
    setDrawerState: vi.fn(), setIsOpen: vi.fn(), setDrawerWidth: vi.fn(), setDrawerHeight: vi.fn(),
    shouldBlockAutoClose: () => false,
    snipMode: { active: false }, isSnipSessionActive: false,
    boundsFrameRef: { current: null }, boundsInvokeInFlightRef: { current: false },
    boundsSyncRequestedRef: { current: false }, pendingBoundsRef: { current: null },
  };
  ctx.applyWindowBounds = (width: number, height: number, anchor?: 'left' | 'right') => actions.applyWindowBoundsImpl(ctx, width, height, anchor);
  ctx.finishResize = (anchor?: 'left' | 'right') => actions.finishResizeImpl(ctx, anchor);
  return ctx;
};
const resizes = () => native.invoke.mock.calls.filter(([command]) => command.startsWith('resize_drawer'));

beforeEach(async () => {
  eventWindow = new Surface(); eventDocument = new Surface(); handle = new Surface();
  callbacks = new Map(); let nextFrame = 0;
  vi.stubGlobal('window', eventWindow);
  vi.stubGlobal('document', eventDocument);
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => { callbacks.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { callbacks.delete(id); });
  native.invoke.mockReset().mockResolvedValue(undefined);
  native.outerPosition.mockReset().mockResolvedValue({ x: 500, y: 100 });
  native.outerSize.mockReset().mockResolvedValue({ width: 1200, height: 750 });
  native.scaleFactor.mockReset().mockResolvedValue(1.25);
  native.currentMonitor.mockReset().mockResolvedValue({ workArea: { position: { x: 0, y: 0 }, size: { width: 2400, height: 1500 } } });
  actions ??= await import('./windowSnipActions');
  await actions.cancelDrawerResize();
});
afterEach(async () => {
  await actions?.cancelDrawerResize();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('drawer left resize actions and native contract', () => {
  it('sends one immutable physical right/top anchor, serializes reversal and finishes only after the final write', async () => {
    const first = deferred(); const last = deferred();
    native.invoke.mockImplementation((command: string) => {
      if (command !== 'resize_drawer_anchored') return Promise.resolve();
      return resizes().length === 1 ? first.promise : last.promise;
    });
    const ctx = context();
    actions.startResizingCornerImpl(ctx, down()); await tick();
    expect(handle.captured.has(7)).toBe(true);
    eventWindow.emit('pointermove', point(960, 820)); frame(); await tick();
    native.outerPosition.mockResolvedValue({ x: 499, y: 101 });
    native.scaleFactor.mockResolvedValue(1.5);
    eventWindow.emit('pointermove', point(800, 900));
    eventWindow.emit('pointermove', point(1040, 810));
    eventWindow.emit('pointerup', point(976, 812));
    await tick();
    expect(ctx.isResizingState.current).toBe(true);
    expect(actions.isDrawerResizeActive()).toBe(true);
    expect(ctx.setDrawerWidth).not.toHaveBeenCalled();
    expect(resizes()).toEqual([['resize_drawer_anchored', { rightAnchorPx: 1700, topAnchorPx: 100, widthPx: 1250, heightPx: 775 }]]);
    first.resolve(); await tick();
    expect(resizes()).toEqual([
      ['resize_drawer_anchored', { rightAnchorPx: 1700, topAnchorPx: 100, widthPx: 1250, heightPx: 775 }],
      ['resize_drawer_anchored', { rightAnchorPx: 1700, topAnchorPx: 100, widthPx: 1230, heightPx: 765 }],
    ]);
    expect(ctx.setDrawerWidth).not.toHaveBeenCalled();
    last.resolve(); await tick();
    expect(ctx.setDrawerWidth).toHaveBeenCalledExactlyOnceWith(984);
    expect(ctx.setDrawerHeight).toHaveBeenCalledExactlyOnceWith(612);
    expect(ctx.isResizingState.current).toBe(false);
    expect(ctx.isGlobalMouseDown.current).toBe(false);
    expect(actions.isDrawerResizeActive()).toBe(false);
    expect(native.outerPosition).toHaveBeenCalledOnce();
    expect(native.scaleFactor).toHaveBeenCalledOnce();
    expect(handle.count() + eventWindow.count() + eventDocument.count()).toBe(0);
    ctx.applyWindowBounds(1004, 612); frame(); await tick();
    expect(resizes()).toHaveLength(2); // No post-gesture unanchored reapplication.
  });

  it('left-only resize preserves height and takes pointerup coordinates even without a pointermove', async () => {
    const ctx = context();
    actions.startResizingWidthImpl(ctx, down());
    eventWindow.emit('pointerup', point(900, 1000)); await tick();
    expect(resizes()).toEqual([['resize_drawer_anchored', { rightAnchorPx: 1700, topAnchorPx: 100, widthPx: 1325, heightPx: 750 }]]);
    expect(ctx.setDrawerWidth).toHaveBeenCalledWith(1060);
    expect(ctx.setDrawerHeight).toHaveBeenCalledWith(600);
    expect(callbacks.size).toBe(0);
  });

  it('does not allow a regular bounds effect to overwrite an active anchored gesture', async () => {
    const ctx = context();
    actions.startResizingWidthImpl(ctx, down()); await tick();
    ctx.applyWindowBounds(1320, 800, 'left'); frame(); await tick();
    expect(resizes()).toEqual([]);
    eventWindow.emit('pointerup', point(960, 800)); await tick();
    expect(resizes()).toEqual([['resize_drawer_anchored', { rightAnchorPx: 1700, topAnchorPx: 100, widthPx: 1250, heightPx: 750 }]]);
  });

  it('drains an earlier ordinary resize before collecting geometry, not concurrently', async () => {
    const previous = deferred();
    native.invoke.mockImplementation((command: string) => command === 'resize_drawer' ? previous.promise : Promise.resolve());
    const ctx = context(); ctx.applyWindowBounds(980, 600); frame(); await tick();
    actions.startResizingWidthImpl(ctx, down()); eventWindow.emit('pointerup', point(960, 800)); await tick();
    expect(native.outerPosition).not.toHaveBeenCalled();
    previous.resolve(); await tick();
    expect(native.outerPosition).toHaveBeenCalledOnce();
    expect(resizes()).toEqual([
      ['resize_drawer', { width: 960, height: 600 }],
      ['resize_drawer_anchored', { rightAnchorPx: 1700, topAnchorPx: 100, widthPx: 1250, heightPx: 750 }],
    ]);
  });

  it('discards queued final motion on explicit mode/unmount cancellation and awaits in-flight writes', async () => {
    const inFlight = deferred();
    native.invoke.mockImplementation((command: string) => command === 'resize_drawer_anchored' ? inFlight.promise : Promise.resolve());
    const ctx = context(); actions.startResizingCornerImpl(ctx, down()); await tick();
    eventWindow.emit('pointermove', point(960, 820)); frame(); await tick();
    eventWindow.emit('pointerup', point(800, 900));
    const cancelled = actions.cancelDrawerResize();
    expect(actions.cancelDrawerResize()).toBe(cancelled);
    const done = vi.fn(); void cancelled.then(done);
    await tick(); expect(done).not.toHaveBeenCalled();
    expect(handle.count() + eventWindow.count() + eventDocument.count()).toBe(0);
    inFlight.resolve(); await cancelled; frame(); await tick();
    expect(resizes()).toHaveLength(1);
    expect(ctx.setDrawerWidth).not.toHaveBeenCalled();
    expect(ctx.setDrawerHeight).not.toHaveBeenCalled();
    expect(actions.isDrawerResizeActive()).toBe(false);
    expect(ctx.isResizingState.current).toBe(false);
  });

  it('cancels initialization without a late resize or late React setter', async () => {
    const position = deferred<{ x: number; y: number }>();
    native.outerPosition.mockReturnValue(position.promise);
    const ctx = context(); actions.startResizingWidthImpl(ctx, down()); await tick();
    eventWindow.emit('pointermove', point(800, 800));
    const cancelled = actions.cancelDrawerResize();
    position.resolve({ x: 500, y: 100 }); await cancelled; frame(); await tick();
    expect(resizes()).toEqual([]);
    expect(ctx.setDrawerWidth).not.toHaveBeenCalled();
    expect(ctx.setDrawerHeight).not.toHaveBeenCalled();
    expect(actions.isDrawerResizeActive()).toBe(false);
  });

  it.each(['pointercancel', 'blur', 'lostpointercapture'])('commits last motion rather than zero coordinates on %s', async (type) => {
    const ctx = context(); actions.startResizingWidthImpl(ctx, down()); await tick();
    eventWindow.emit('pointermove', point(960, 800));
    if (type === 'lostpointercapture') handle.emit(type, { pointerId: 7 });
    else eventWindow.emit(type, point(0, 0));
    await tick();
    expect(resizes()).toEqual([['resize_drawer_anchored', { rightAnchorPx: 1700, topAnchorPx: 100, widthPx: 1250, heightPx: 750 }]]);
    expect(actions.isDrawerResizeActive()).toBe(false);
  });

  it('fits a small screen without the final ordinary sync expanding beyond it', async () => {
    native.currentMonitor.mockResolvedValue({ workArea: { position: { x: 0, y: 0 }, size: { width: 900, height: 600 } } });
    native.outerPosition.mockResolvedValue({ x: 0, y: 0 }); native.outerSize.mockResolvedValue({ width: 900, height: 600 });
    const ctx = context(); actions.startResizingCornerImpl(ctx, down());
    eventWindow.emit('pointerup', point(800, 1000)); await tick();
    expect(resizes()).toEqual([['resize_drawer_anchored', { rightAnchorPx: 900, topAnchorPx: 0, widthPx: 900, heightPx: 600 }]]);
    expect(ctx.drawerWidthRef.current).toBe(720);
    expect(ctx.drawerHeightRef.current).toBe(480);
    ctx.applyWindowBounds(740, 480); frame(); await tick();
    expect(resizes()).toHaveLength(1);
  });

  it('recovers state after native failure without issuing a dangerous unanchored fallback', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    native.invoke.mockImplementation((command: string) => command === 'resize_drawer_anchored'
      ? Promise.reject(new Error('SetWindowPos failed')) : Promise.resolve());
    const ctx = context(); actions.startResizingWidthImpl(ctx, down());
    eventWindow.emit('pointerup', point(900, 800)); await tick();
    expect(actions.isDrawerResizeActive()).toBe(false);
    expect(ctx.setDrawerWidth).toHaveBeenCalledWith(960);
    expect(ctx.setDrawerHeight).toHaveBeenCalledWith(600);
    expect(resizes().every(([command]) => command === 'resize_drawer_anchored')).toBe(true);
  });

  it.each([
    ['height', 'resize_drawer', 960, 620],
    ['right-corner', 'resize_drawer_from_right', 1000, 620],
  ] as const)('preserves the existing %s handle and final state', async (handleType, command, width, height) => {
    const ctx = context();
    if (handleType === 'height') actions.startResizingHeightImpl(ctx, down());
    else actions.startResizingRightCornerImpl(ctx, down());
    eventDocument.emit('pointermove', point(1040, 820)); frame(); await tick();
    eventDocument.emit('pointerup', point(1040, 820)); frame(); await tick();
    expect(resizes()).toEqual([[command, { width, height }]]);
    expect(ctx.setDrawerWidth).toHaveBeenCalledWith(width);
    expect(ctx.setDrawerHeight).toHaveBeenCalledWith(height);
    expect(ctx.isResizingState.current).toBe(false);
    expect(ctx.drawerResizeAnchorRef.current).toBe(handleType === 'height' ? 'right' : 'left');
    expect(eventDocument.count()).toBe(0);
  });

  it('does not persist Infinity or NaN if native geometry collection is invalid', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    native.scaleFactor.mockResolvedValue(0);
    const ctx = context(); actions.startResizingWidthImpl(ctx, down());
    eventWindow.emit('pointerup', point(900, 800)); await tick();
    expect(actions.isDrawerResizeActive()).toBe(false);
    expect(ctx.setDrawerWidth).toHaveBeenCalledWith(960);
    expect(ctx.setDrawerHeight).toHaveBeenCalledWith(600);
    expect(resizes()).toEqual([]);
  });

  it('keeps normal height/right resize commands, subtracts the edge strip at minimum, and respects snip mode', async () => {
    const ctx = context();
    ctx.applyWindowBounds(900, 560); frame(); await tick();
    expect(resizes()).toEqual([['resize_drawer', { width: 880, height: 560 }]]);
    ctx.applyWindowBounds(1020, 650, 'left'); frame(); await tick();
    expect(resizes()[1]).toEqual(['resize_drawer_from_right', { width: 1000, height: 650 }]);
    ctx.snipMode.active = true; ctx.applyWindowBounds(1320, 800); frame(); await tick();
    expect(resizes()).toHaveLength(2);
  });
});
