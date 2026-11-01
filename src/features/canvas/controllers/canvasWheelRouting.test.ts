import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error Node types are intentionally absent from the browser tsconfig.
import { readFileSync } from 'node:fs';
import * as canvasInteractionActions from './canvasInteractionActions';
import { runCanvasInteractionsEffect01 } from './canvasInteractionEffects';

const {
  getCanvasNestedWheelScrollerImpl,
  normalizeCanvasWheelDeltaImpl,
  scheduleCanvasWheelZoomImpl,
} = canvasInteractionActions;

type WheelZoomBlocker = (target: EventTarget | null) => boolean;

const readWheelZoomBlocker = (): WheelZoomBlocker => {
  const exported = (canvasInteractionActions as Record<string, unknown>).shouldBlockCanvasWheelZoomTargetImpl;
  if (typeof exported === 'function') return target => exported({}, target) as boolean;

  // Until extracted, test the actual private App callback, not a copy of its selector policy.
  const source: string = readFileSync(new URL('../../../App.tsx', import.meta.url), 'utf8');
  const match = source.match(/const shouldBlockCanvasWheelZoomTarget = \([^)]*\) => \{([\s\S]*?)\n\s*\};/);
  if (!match) throw new Error('Cannot locate the canvas wheel zoom blocker in actions or App.tsx');
  return new Function('targetValue', match[1]) as WheelZoomBlocker;
};

const shouldBlockCanvasWheelZoomTarget = readWheelZoomBlocker();

// The project uses a Node Vitest environment. Model only ancestry, selectors and
// scroll geometry, following canvasInteractionEffects.test.ts without adding a DOM dependency.
class WheelTestElement {
  parentElement: WheelTestElement | null;
  style = { overflowY: 'visible' };
  clientHeight = 200;
  scrollHeight = 200;
  scrollTop = 0;
  scrollLeft = 0;
  readonly attributes: Record<string, string>;

  constructor(
    readonly tagName = 'div',
    parent: WheelTestElement | null = null,
    attributes: Record<string, string> = {},
  ) {
    this.parentElement = parent;
    this.attributes = attributes;
  }

  contains(target: unknown): boolean {
    let current = target instanceof WheelTestElement ? target : null;
    while (current) {
      if (current === this) return true;
      current = current.parentElement;
    }
    return false;
  }

  closest(selector: string): WheelTestElement | null {
    let current: WheelTestElement | null = this;
    while (current) {
      for (const part of selector.split(',').map(value => value.trim())) {
        const attribute = part.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
        if (attribute) {
          const value = current.attributes[attribute[1]];
          if (value !== undefined && (attribute[2] === undefined || value === attribute[2])) return current;
        } else if (current.tagName.toLowerCase() === part.toLowerCase()) {
          return current;
        }
      }
      current = current.parentElement;
    }
    return null;
  }
}

const asTarget = (element: WheelTestElement): EventTarget => element as unknown as EventTarget;
const asSurface = (element: WheelTestElement): HTMLDivElement => element as unknown as HTMLDivElement;
const makeScrollable = (element: WheelTestElement, scrollTop = 300, overflowY = 'auto') => {
  element.style.overflowY = overflowY;
  element.scrollHeight = 1000;
  element.clientHeight = 200;
  element.scrollTop = scrollTop;
  return element;
};

const createHarness = () => {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    const id = ++nextFrame;
    callbacks.set(id, callback);
    return id;
  });
  const getComputedStyle = vi.fn((element: WheelTestElement) => element.style);
  vi.stubGlobal('Element', WheelTestElement);
  vi.stubGlobal('HTMLElement', WheelTestElement);
  vi.stubGlobal('window', { requestAnimationFrame, getComputedStyle });

  const surface = makeScrollable(new WheelTestElement(), 600);
  surface.clientHeight = 600;
  surface.scrollHeight = 2400;
  surface.scrollLeft = 400;
  const listeners = new Map<string, EventListener>();
  const addEventListener = vi.fn((name: string, listener: EventListener, _options?: AddEventListenerOptions) => {
    listeners.set(name, listener);
  });
  const removeEventListener = vi.fn((name: string, listener: EventListener, _capture?: boolean) => {
    if (listeners.get(name) === listener) listeners.delete(name);
  });
  vi.stubGlobal('document', { addEventListener, removeEventListener });

  const canvasSurfaceRef = { current: asSurface(surface) as HTMLDivElement | null };
  const zoomCanvasAt = vi.fn();
  const zoomContext: Parameters<typeof scheduleCanvasWheelZoomImpl>[0] = {
    canvasWheelZoomFrameRef: { current: null },
    canvasWheelZoomPayloadRef: { current: null },
    zoomCanvasAt,
  };
  const nestedScroller = (target: EventTarget | null, deltaY: number) =>
    getCanvasNestedWheelScrollerImpl({}, asSurface(surface), target, deltaY);
  const cleanup = runCanvasInteractionsEffect01({
    canvasSurfaceRef,
    isCanvasMode: true,
    normalizeCanvasWheelDelta: event => normalizeCanvasWheelDeltaImpl({ canvasSurfaceRef }, event),
    getCanvasNestedWheelScroller: (owner, target, deltaY) => getCanvasNestedWheelScrollerImpl({}, owner, target, deltaY),
    shouldBlockCanvasWheelZoomTarget,
    scheduleCanvasWheelZoom: (x, y, deltaY) => scheduleCanvasWheelZoomImpl(zoomContext, x, y, deltaY),
  });

  const wheel = (target: EventTarget | null, deltaY = 40, deltaMode = 0) => {
    const event = {
      target, deltaY, deltaMode, clientX: 420, clientY: 280,
      ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
      preventDefault: vi.fn(), stopPropagation: vi.fn(), stopImmediatePropagation: vi.fn(),
    };
    const listener = listeners.get('wheel');
    if (!listener) throw new Error('No canvas wheel listener is registered');
    listener(event as unknown as Event);
    return event;
  };
  const flushFrame = () => {
    const pending = [...callbacks.entries()];
    for (const [id, callback] of pending) {
      callbacks.delete(id);
      callback(16);
    }
  };

  return {
    surface, canvasSurfaceRef, zoomCanvasAt, zoomContext, nestedScroller,
    requestAnimationFrame, getComputedStyle, addEventListener, cleanup, wheel, flushFrame,
  };
};

type Harness = ReturnType<typeof createHarness>;
let harness: Harness;
beforeEach(() => { harness = createHarness(); });
afterEach(() => {
  harness?.cleanup?.();
  vi.unstubAllGlobals();
});

type TargetCase = { name: string; tag: string; attributes: Record<string, string> };
const canvasTargets: TargetCase[] = [
  { name: 'canvas background', tag: 'div', attributes: {} },
  { name: 'ordinary image', tag: 'img', attributes: { 'data-canvas-main-media': 'true' } },
  { name: 'snapshot tile', tag: 'canvas', attributes: { 'data-canvas-snapshot-tile': 'tile-1' } },
  { name: 'static snapshot hitbox', tag: 'div', attributes: { 'data-canvas-item-id': 'image-1', 'data-canvas-snapshot-static': 'true' } },
  { name: 'static snapshot preview', tag: 'canvas', attributes: { 'data-canvas-main-media': 'true', 'data-canvas-snapshot-preview': 'true' } },
];
const editorTargets: TargetCase[] = [
  { name: 'textarea', tag: 'textarea', attributes: {} },
  { name: 'input', tag: 'input', attributes: { readonly: '' } },
  { name: 'contenteditable', tag: 'div', attributes: { contenteditable: 'true' } },
  { name: 'explicit internal scroll region', tag: 'div', attributes: { 'data-canvas-wheel-scroll': 'true' } },
];

describe('normalizeCanvasWheelDeltaImpl', () => {
  it.each([
    { name: 'pixel delta', deltaY: 30, deltaMode: 0, expected: 30 },
    { name: 'fractional negative pixel delta', deltaY: -0.75, deltaMode: 0, expected: -0.75 },
    { name: 'large positive delta', deltaY: 960, deltaMode: 0, expected: 120 },
    { name: 'large negative delta', deltaY: -960, deltaMode: 0, expected: -120 },
    { name: 'positive line delta', deltaY: 2, deltaMode: 1, expected: 80 },
    { name: 'negative line delta', deltaY: -2, deltaMode: 1, expected: -80 },
    { name: 'clamped line delta', deltaY: 4, deltaMode: 1, expected: 120 },
    { name: 'positive page delta', deltaY: 0.1, deltaMode: 2, expected: 60 },
    { name: 'negative page delta', deltaY: -0.1, deltaMode: 2, expected: -60 },
    { name: 'clamped page delta', deltaY: -1, deltaMode: 2, expected: -120 },
    { name: 'zero', deltaY: 0, deltaMode: 0, expected: 0 },
    { name: 'NaN', deltaY: Number.NaN, deltaMode: 0, expected: 0 },
    { name: 'positive infinity', deltaY: Number.POSITIVE_INFINITY, deltaMode: 1, expected: 0 },
    { name: 'negative infinity', deltaY: Number.NEGATIVE_INFINITY, deltaMode: 2, expected: 0 },
  ])('normalizes $name without requiring a Ctrl modifier', ({ deltaY, deltaMode, expected }) => {
    expect(normalizeCanvasWheelDeltaImpl(harness, { deltaY, deltaMode })).toBe(expected);
  });

  it('uses a minimum page height and falls back when the surface is absent or has no height', () => {
    harness.surface.clientHeight = 100;
    expect(normalizeCanvasWheelDeltaImpl(harness, { deltaY: 0.5, deltaMode: 2 })).toBe(80);
    harness.surface.clientHeight = 0;
    expect(normalizeCanvasWheelDeltaImpl(harness, { deltaY: 0.1, deltaMode: 2 })).toBe(80);
    harness.canvasSurfaceRef.current = null;
    expect(normalizeCanvasWheelDeltaImpl(harness, { deltaY: 0.1, deltaMode: 2 })).toBe(80);
  });
});

describe('canvas wheel target classification', () => {
  it.each(canvasTargets)('does not treat $name or an unmarked overflow ancestor as internal scrolling', ({ tag, attributes }) => {
    const unmarked = makeScrollable(new WheelTestElement('div', harness.surface));
    const target = makeScrollable(new WheelTestElement(tag, unmarked, attributes));
    expect(harness.nestedScroller(asTarget(target), 40)).toBeNull();
    expect(shouldBlockCanvasWheelZoomTarget(asTarget(target))).toBe(false);
  });

  it('never offers the scrolling canvas surface itself as an internal scroller', () => {
    expect(harness.nestedScroller(asTarget(harness.surface), 40)).toBeNull();
    expect(shouldBlockCanvasWheelZoomTarget(asTarget(harness.surface))).toBe(false);
  });

  it('rejects missing, non-element and outside targets before inspecting their styles', () => {
    const outside = makeScrollable(new WheelTestElement('textarea'));
    for (const target of [null, {} as EventTarget, asTarget(outside)]) {
      expect(harness.nestedScroller(target, 40)).toBeNull();
    }
    expect(harness.getComputedStyle).not.toHaveBeenCalled();
    expect(shouldBlockCanvasWheelZoomTarget(null)).toBe(false);
    expect(shouldBlockCanvasWheelZoomTarget({} as EventTarget)).toBe(false);
  });

  it.each(editorTargets)('allows $name to scroll in either direction and blocks its descendants from canvas zoom', ({ tag, attributes }) => {
    const editor = makeScrollable(new WheelTestElement(tag, harness.surface, attributes));
    const child = new WheelTestElement('span', editor);
    for (const target of [editor, child]) {
      expect(harness.nestedScroller(asTarget(target), 40)).toBe(editor);
      expect(harness.nestedScroller(asTarget(target), -40)).toBe(editor);
      expect(shouldBlockCanvasWheelZoomTarget(asTarget(target))).toBe(true);
    }
  });

  it.each(['auto', 'scroll', 'overlay'])('recognizes explicitly allowed overflow-y: %s', overflowY => {
    const scroller = makeScrollable(new WheelTestElement('div', harness.surface, { 'data-canvas-wheel-scroll': 'true' }), 300, overflowY);
    expect(harness.nestedScroller(asTarget(new WheelTestElement('img', scroller)), 40)).toBe(scroller);
  });

  it('finds a scrollable editor ancestor but does not promote an unmarked image to that policy', () => {
    const wrapper = makeScrollable(new WheelTestElement('div', harness.surface));
    const editor = new WheelTestElement('textarea', wrapper);
    expect(harness.nestedScroller(asTarget(editor), 40)).toBe(wrapper);
    expect(harness.nestedScroller(asTarget(new WheelTestElement('img', wrapper)), 40)).toBeNull();
  });

  it.each([
    { contenteditable: 'false' },
    { 'data-canvas-wheel-scroll': 'false' },
  ] as Record<string, string>[])('does not opt in false-valued attributes: %j', attributes => {
    const target = makeScrollable(new WheelTestElement('div', harness.surface, attributes));
    expect(harness.nestedScroller(asTarget(target), 40)).toBeNull();
    expect(shouldBlockCanvasWheelZoomTarget(asTarget(target))).toBe(false);
  });

  it.each([
    { name: 'top, wheeling up', scrollTop: 0, deltaY: -40, scrolls: false },
    { name: 'top, wheeling down', scrollTop: 0, deltaY: 40, scrolls: true },
    { name: 'bottom, wheeling down', scrollTop: 800, deltaY: 40, scrolls: false },
    { name: 'bottom, wheeling up', scrollTop: 800, deltaY: -40, scrolls: true },
    { name: 'within one pixel of bottom', scrollTop: 799.5, deltaY: 40, scrolls: false },
    { name: 'zero delta', scrollTop: 300, deltaY: 0, scrolls: false },
  ])('respects the directional scroll edge: $name', ({ scrollTop, deltaY, scrolls }) => {
    const scroller = makeScrollable(new WheelTestElement('div', harness.surface, { 'data-canvas-wheel-scroll': 'true' }), scrollTop);
    expect(harness.nestedScroller(asTarget(scroller), deltaY)).toBe(scrolls ? scroller : null);
    expect(shouldBlockCanvasWheelZoomTarget(asTarget(scroller))).toBe(true);
  });

  it('does not chain from an exhausted inner scroller into an outer scroller or the canvas', () => {
    const outer = makeScrollable(new WheelTestElement('div', harness.surface, { 'data-canvas-wheel-scroll': 'true' }));
    const inner = makeScrollable(new WheelTestElement('div', outer, { 'data-canvas-wheel-scroll': 'true' }), 800);
    expect(harness.nestedScroller(asTarget(new WheelTestElement('span', inner)), 40)).toBeNull();
  });

  it.each(['hidden', 'visible', 'clip'])('does not allow native internal scrolling for overflow-y: %s', overflowY => {
    const target = makeScrollable(new WheelTestElement('textarea', harness.surface), 300, overflowY);
    expect(harness.nestedScroller(asTarget(target), 40)).toBeNull();
    expect(shouldBlockCanvasWheelZoomTarget(asTarget(target))).toBe(true);
  });
});

describe('ordinary wheel routing through the real canvas effect and zoom helpers', () => {
  it('registers a non-passive capture listener so ordinary native scrolling can be prevented', () => {
    expect(harness.addEventListener).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: false, capture: true });
  });

  describe.each([40, -40])('without Ctrl, deltaY = %s', deltaY => {
    it.each(canvasTargets)('zooms over $name instead of allowing native canvas scrolling', ({ tag, attributes }) => {
      const node = new WheelTestElement('div', harness.surface, { 'data-canvas-item-id': 'image-1', 'data-canvas-snapshot-static': 'true' });
      const target = tag === 'div' && Object.keys(attributes).length === 0
        ? harness.surface : new WheelTestElement(tag, node, attributes);
      const event = harness.wheel(asTarget(target), deltaY);
      expect(event.ctrlKey).toBe(false);
      expect(event.metaKey).toBe(false);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(event.stopPropagation).toHaveBeenCalledOnce();
      expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
      expect(harness.requestAnimationFrame).toHaveBeenCalledOnce();
      expect(harness.zoomCanvasAt).not.toHaveBeenCalled();
      harness.flushFrame();
      expect(harness.zoomCanvasAt).toHaveBeenCalledExactlyOnceWith(420, 280, deltaY);
      expect([harness.surface.scrollLeft, harness.surface.scrollTop]).toEqual([400, 600]);
    });
  });

  it.each(editorTargets)('preserves native scrolling inside a scrollable $name', ({ tag, attributes }) => {
    const editor = makeScrollable(new WheelTestElement(tag, harness.surface, attributes));
    const event = harness.wheel(asTarget(new WheelTestElement('span', editor)));
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    expect(harness.requestAnimationFrame).not.toHaveBeenCalled();
    harness.flushFrame();
    expect(harness.zoomCanvasAt).not.toHaveBeenCalled();
  });

  describe.each([
    { name: 'top', scrollTop: 0, deltaY: -40 },
    { name: 'bottom', scrollTop: 800, deltaY: 40 },
  ])('at the $name scroll edge', ({ scrollTop, deltaY }) => {
    it.each(editorTargets)('neither scrolls the canvas nor zooms over $name', ({ tag, attributes }) => {
      const editor = makeScrollable(new WheelTestElement(tag, harness.surface, attributes), scrollTop);
      const event = harness.wheel(asTarget(new WheelTestElement('span', editor)), deltaY);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(event.stopPropagation).toHaveBeenCalledOnce();
      expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
      expect(harness.requestAnimationFrame).not.toHaveBeenCalled();
      harness.flushFrame();
      expect(harness.zoomCanvasAt).not.toHaveBeenCalled();
      expect([harness.surface.scrollLeft, harness.surface.scrollTop]).toEqual([400, 600]);
    });
  });

  it.each(editorTargets)('does not leak wheel scrolling or zoom from a non-scrollable $name', ({ tag, attributes }) => {
    const editor = new WheelTestElement(tag, harness.surface, attributes);
    const event = harness.wheel(asTarget(editor));
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(harness.requestAnimationFrame).not.toHaveBeenCalled();
    expect(harness.zoomCanvasAt).not.toHaveBeenCalled();
  });

  it.each([
    { deltaY: 2, deltaMode: 1, expected: 80 },
    { deltaY: -1, deltaMode: 2, expected: -120 },
  ])('routes normalized deltaMode=$deltaMode to zoom', ({ deltaY, deltaMode, expected }) => {
    harness.wheel(asTarget(harness.surface), deltaY, deltaMode);
    harness.flushFrame();
    expect(harness.zoomCanvasAt).toHaveBeenCalledExactlyOnceWith(420, 280, expected);
  });
});

describe('scheduleCanvasWheelZoomImpl', () => {
  it.each([1, -1])('coalesces a wheel burst, clamps its sum and uses the latest pointer (direction %s)', direction => {
    const schedule = (x: number, y: number) => scheduleCanvasWheelZoomImpl(harness.zoomContext, x, y, direction * 120);
    schedule(100, 150);
    schedule(200, 250);
    schedule(300, 350);
    expect(harness.requestAnimationFrame).toHaveBeenCalledOnce();
    expect(harness.zoomContext.canvasWheelZoomPayloadRef.current).toEqual({ clientX: 300, clientY: 350, deltaY: direction * 240 });
    expect(harness.zoomCanvasAt).not.toHaveBeenCalled();
    harness.flushFrame();
    expect(harness.zoomCanvasAt).toHaveBeenCalledExactlyOnceWith(300, 350, direction * 240);
    expect(harness.zoomContext.canvasWheelZoomFrameRef.current).toBeNull();
    expect(harness.zoomContext.canvasWheelZoomPayloadRef.current).toBeNull();
  });

  it('accumulates signed deltas and permits a fresh frame after a completed burst', () => {
    scheduleCanvasWheelZoomImpl(harness.zoomContext, 100, 150, 80);
    scheduleCanvasWheelZoomImpl(harness.zoomContext, 200, 250, -30);
    harness.flushFrame();
    expect(harness.zoomCanvasAt).toHaveBeenLastCalledWith(200, 250, 50);
    scheduleCanvasWheelZoomImpl(harness.zoomContext, 400, 450, -40);
    expect(harness.requestAnimationFrame).toHaveBeenCalledTimes(2);
    harness.flushFrame();
    expect(harness.zoomCanvasAt).toHaveBeenCalledTimes(2);
    expect(harness.zoomCanvasAt).toHaveBeenLastCalledWith(400, 450, -40);
  });

  it('does not apply a discarded payload when its frame runs', () => {
    scheduleCanvasWheelZoomImpl(harness.zoomContext, 100, 150, 40);
    harness.zoomContext.canvasWheelZoomPayloadRef.current = null;
    harness.flushFrame();
    expect(harness.zoomCanvasAt).not.toHaveBeenCalled();
    expect(harness.zoomContext.canvasWheelZoomFrameRef.current).toBeNull();
  });
});
