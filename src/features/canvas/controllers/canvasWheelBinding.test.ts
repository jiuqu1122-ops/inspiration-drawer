import { afterEach, describe, expect, it, vi } from 'vitest';
import { runCanvasInteractionsEffect01 } from './canvasInteractionEffects';

class WheelElement {
  readonly listeners = new Map<string, EventListener>();
  constructor(readonly parentElement: WheelElement | null = null, readonly threeInteractive = false) {}
  contains(target: unknown): boolean {
    return target instanceof WheelElement && (target === this || this.contains(target.parentElement));
  }
  closest(selector: string): WheelElement | null {
    if (selector === '[data-three-scene-interactive="true"]' && this.threeInteractive) return this;
    return this.parentElement?.closest(selector) ?? null;
  }
  addEventListener(name: string, listener: EventListener) { this.listeners.set(name, listener); }
  removeEventListener(name: string, listener: EventListener) {
    if (this.listeners.get(name) === listener) this.listeners.delete(name);
  }
}

const fixture = (mounted = true, enabled = true) => {
  const documentListeners = new Map<string, EventListener>();
  const addEventListener = vi.fn((name: string, listener: EventListener) => documentListeners.set(name, listener));
  const removeEventListener = vi.fn((name: string, listener: EventListener) => {
    if (documentListeners.get(name) === listener) documentListeners.delete(name);
  });
  vi.stubGlobal('Element', WheelElement);
  vi.stubGlobal('document', { addEventListener, removeEventListener });
  const surface = new WheelElement();
  const canvasSurfaceRef = { current: mounted ? surface as unknown as HTMLDivElement : null };
  const scheduleCanvasWheelZoom = vi.fn();
  const getCanvasNestedWheelScroller = vi.fn(() => null as HTMLElement | null);
  const shouldBlockCanvasWheelZoomTarget = vi.fn(() => false);
  const context = {
    canvasSurfaceRef,
    isCanvasMode: enabled,
    getCanvasNestedWheelScroller,
    shouldBlockCanvasWheelZoomTarget,
    normalizeCanvasWheelDelta: vi.fn((event: { deltaY: number }) => event.deltaY),
    scheduleCanvasWheelZoom,
  };
  const cleanup = runCanvasInteractionsEffect01(context);
  const wheel = (target: WheelElement, deltaY = 100) => {
    const event = { target, deltaY, deltaMode: 0, clientX: 230, clientY: 180, ctrlKey: false,
      preventDefault: vi.fn(), stopPropagation: vi.fn(), stopImmediatePropagation: vi.fn() };
    documentListeners.get('wheel')?.(event as unknown as Event);
    if (!event.stopImmediatePropagation.mock.calls.length) {
      let node: WheelElement | null = target;
      while (node) {
        node.listeners.get('wheel')?.(event as unknown as Event);
        if (event.stopImmediatePropagation.mock.calls.length) break;
        node = node.parentElement;
      }
    }
    return event;
  };
  return { surface, canvasSurfaceRef, context, cleanup, wheel, scheduleCanvasWheelZoom,
    getCanvasNestedWheelScroller, shouldBlockCanvasWheelZoomTarget, addEventListener, removeEventListener };
};

afterEach(() => vi.unstubAllGlobals());

describe('canvas wheel binding lifecycle', () => {
  it.each(['background', 'ordinary image', 'snapshot tile', 'snapshot hitbox'])('zooms %s with an ordinary wheel, without Ctrl', () => {
    const f = fixture();
    const target = new WheelElement(f.surface);
    const event = f.wheel(target, -120);
    expect(f.scheduleCanvasWheelZoom).toHaveBeenCalledExactlyOnceWith(230, 180, -120);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
    f.cleanup?.();
  });

  it('still binds when the surface mounts after the effect, without a canvas-mode change', () => {
    const f = fixture(false);
    f.canvasSurfaceRef.current = f.surface as unknown as HTMLDivElement;
    expect(f.wheel(new WheelElement(f.surface)).preventDefault).toHaveBeenCalledOnce();
    expect(f.scheduleCanvasWheelZoom).toHaveBeenCalledOnce();
    f.cleanup?.();
  });

  it('follows a replaced surface and does not intercept a detached old surface', () => {
    const f = fixture();
    const replacement = new WheelElement();
    f.canvasSurfaceRef.current = replacement as unknown as HTMLDivElement;
    expect(f.wheel(new WheelElement(replacement)).preventDefault).toHaveBeenCalledOnce();
    expect(f.wheel(new WheelElement(f.surface)).preventDefault).not.toHaveBeenCalled();
    expect(f.scheduleCanvasWheelZoom).toHaveBeenCalledOnce();
    f.cleanup?.();
  });

  it('does not capture Chat, drawer lists, or other content outside the actual canvas surface', () => {
    const f = fixture();
    expect(f.wheel(new WheelElement()).preventDefault).not.toHaveBeenCalled();
    expect(f.scheduleCanvasWheelZoom).not.toHaveBeenCalled();
    expect(f.context.normalizeCanvasWheelDelta).not.toHaveBeenCalled();
    f.cleanup?.();
  });

  it('does not consume events while the surface is unmounted', () => {
    const f = fixture();
    f.canvasSurfaceRef.current = null;
    expect(f.wheel(new WheelElement(f.surface)).preventDefault).not.toHaveBeenCalled();
    expect(f.scheduleCanvasWheelZoom).not.toHaveBeenCalled();
    f.cleanup?.();
  });

  it('preserves inner text/list scrolling and blocks canvas zoom at editor scroll limits', () => {
    const f = fixture();
    const target = new WheelElement(f.surface);
    f.getCanvasNestedWheelScroller.mockReturnValueOnce({} as HTMLElement);
    expect(f.wheel(target).preventDefault).not.toHaveBeenCalled();
    f.shouldBlockCanvasWheelZoomTarget.mockReturnValue(true);
    expect(f.wheel(target).preventDefault).toHaveBeenCalledOnce();
    expect(f.scheduleCanvasWheelZoom).not.toHaveBeenCalled();
    f.cleanup?.();
  });

  it('leaves an interactive Three scene to its own camera controls', () => {
    const f = fixture();
    const target = new WheelElement(new WheelElement(f.surface, true));
    expect(f.wheel(target).preventDefault).not.toHaveBeenCalled();
    expect(f.scheduleCanvasWheelZoom).not.toHaveBeenCalled();
    expect(f.getCanvasNestedWheelScroller).not.toHaveBeenCalled();
    f.cleanup?.();
  });

  it('registers a non-passive capture listener so native scrolling can always be cancelled', () => {
    const f = fixture();
    expect(f.addEventListener).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: false, capture: true });
    f.cleanup?.();
    expect(f.removeEventListener).toHaveBeenCalledWith('wheel', expect.any(Function), true);
    expect(f.wheel(new WheelElement(f.surface)).preventDefault).not.toHaveBeenCalled();
  });

  it('cleans up on leaving canvas mode and rebinds to the current surface on returning', () => {
    const f = fixture();
    f.cleanup?.();
    const disabledCleanup = runCanvasInteractionsEffect01({ ...f.context, isCanvasMode: false });
    expect(f.wheel(new WheelElement(f.surface)).preventDefault).not.toHaveBeenCalled();
    disabledCleanup?.();
    const cleanup = runCanvasInteractionsEffect01(f.context);
    expect(f.wheel(new WheelElement(f.surface)).preventDefault).toHaveBeenCalledOnce();
    expect(f.scheduleCanvasWheelZoom).toHaveBeenCalledOnce();
    cleanup?.();
  });
});
