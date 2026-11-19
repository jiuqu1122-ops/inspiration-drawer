import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveCanvasPasteClient, runCanvasInteractionsEffect03, runCanvasInteractionsEffect04 } from './canvasInteractionEffects';

const rect = {
  left: 100,
  top: 50,
  right: 900,
  bottom: 650,
  width: 800,
  height: 600,
  x: 100,
  y: 50,
  toJSON: () => ({}),
} as DOMRect;

describe('canvas paste pointer placement', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the pointer inside the canvas and falls back to the visible center', () => {
    const surface = { getBoundingClientRect: () => rect } as HTMLDivElement;
    expect(resolveCanvasPasteClient(surface, { x: 420, y: 280 })).toEqual({ x: 420, y: 280 });
    expect(resolveCanvasPasteClient(surface, { x: 20, y: 20 })).toEqual({ x: 500, y: 350 });
  });

  it('keeps the latest canvas pointer position through clipboard-related window blur', () => {
    const windowListeners = new Map<string, EventListener>();
    const documentListeners = new Map<string, EventListener>();
    vi.stubGlobal('window', {
      addEventListener: (type: string, listener: EventListener) => windowListeners.set(type, listener),
      removeEventListener: (type: string) => windowListeners.delete(type),
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });
    vi.stubGlobal('document', {
      addEventListener: (type: string, listener: EventListener) => documentListeners.set(type, listener),
      removeEventListener: (type: string) => documentListeners.delete(type),
    });

    const pasteCanvasItems = vi.fn(() => 1);
    const lastCanvasPointerClientRef = { current: null as { x: number; y: number } | null };
    const surface = {
      getBoundingClientRect: () => rect,
      scrollLeft: 0,
      scrollTop: 0,
    } as HTMLDivElement;
    const cleanup = runCanvasInteractionsEffect03({
      activeThreeSceneIdRef: { current: null },
      cancelCanvasItemDragVisuals: vi.fn(),
      canvasClipboardRef: { current: [{}] },
      canvasConnectionDraft: null,
      canvasContextMenuRef: { current: null },
      canvasDragRef: { current: null },
      canvasGroupResizeRef: { current: null },
      canvasInputPickTargetIdRef: { current: null },
      canvasItemsRef: { current: [] },
      canvasPanCleanupRef: { current: null },
      canvasPanRef: { current: null },
      canvasResizeRef: { current: null },
      canvasScrollLockRef: { current: null },
      canvasSelectedIdsRef: { current: [] },
      canvasSpaceKeyCapturedRef: { current: false },
      canvasSurfaceRef: { current: surface },
      copyCanvasItemsToAvailableClipboards: vi.fn(),
      createCanvasGroup: vi.fn(),
      duplicateCanvasItems: vi.fn(),
      exitThreeSceneInteraction: vi.fn(),
      fitCanvasViewToItems: vi.fn(),
      getCanvasClipboardImageFiles: vi.fn(() => []),
      hideCanvasSelectionOverlay: vi.fn(),
      isCanvasModeRef: { current: true },
      isCanvasSpacePressedRef: { current: false },
      isTextEntryActive: vi.fn(() => false),
      lastCanvasPointerClientRef,
      pasteCanvasItems,
      pasteSystemClipboardToCanvas: vi.fn(),
      pendingCanvasFusionRoleRef: { current: null },
      preferCanvasClipboardRef: { current: true },
      removeCanvasItemsByIds: vi.fn(),
      renameCanvasGroup: vi.fn(),
      setCanvasConnectionDraft: vi.fn(),
      setCanvasContextMenu: vi.fn(),
      setCanvasInputMenuForId: vi.fn(),
      setCanvasInputPickTargetId: vi.fn(),
      setCanvasInteractionActive: vi.fn(),
      setCanvasSpacePressed: vi.fn(),
      setIsCanvasChromeHidden: vi.fn(),
      shouldRouteShortcutToDoodle: vi.fn(() => false),
      showToast: vi.fn(),
      toggleCanvasMode: vi.fn(),
      ungroupCanvasItems: vi.fn(),
      updateCanvasSelection: vi.fn(),
    } as any);

    windowListeners.get('pointermove')?.({ clientX: 460, clientY: 300 } as PointerEvent);
    windowListeners.get('blur')?.({} as Event);
    documentListeners.get('paste')?.({
      target: null,
      clipboardData: { getData: () => '' },
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as unknown as ClipboardEvent);

    expect(pasteCanvasItems).toHaveBeenCalledWith({ x: 460, y: 300 });
    cleanup?.();
  });
});

class ClipboardTestElement {
  constructor(readonly kind = 'canvas') {}
  closest(selector: string) {
    if (selector.includes('input')) return this.kind === 'editor' ? this : null;
    return this.kind === 'chat' ? this : null;
  }
}

const clipboardHarness = () => {
  const listeners = new Map<string, (event: any) => void>();
  const canvas = new ClipboardTestElement();
  const chat = new ClipboardTestElement('chat');
  const body = new ClipboardTestElement('body');
  const editor = new ClipboardTestElement('editor');
  let selectedText = '';
  vi.stubGlobal('Element', ClipboardTestElement);
  vi.stubGlobal('HTMLElement', ClipboardTestElement);
  vi.stubGlobal('window', {
    addEventListener: (name: string, cb: any) => listeners.set(name, cb),
    removeEventListener: vi.fn(),
    getSelection: () => ({ rangeCount: selectedText ? 1 : 0, isCollapsed: !selectedText, toString: () => selectedText }),
  });
  vi.stubGlobal('document', {
    body, documentElement: body, activeElement: body,
    addEventListener: (name: string, cb: any) => listeners.set(name, cb), removeEventListener: vi.fn(),
  });
  const copy = vi.fn();
  const prefer = { current: true };
  const cleanup = runCanvasInteractionsEffect03({
    canvasSurfaceRef: { current: { contains: (target: any) => target === canvas || target === chat || target === editor } },
    isCanvasModeRef: { current: true }, isTextEntryActive: () => false,
    shouldRouteShortcutToDoodle: () => false,
    canvasSelectedIdsRef: { current: ['selected-image'] },
    copyCanvasItemsToAvailableClipboards: copy, preferCanvasClipboardRef: prefer,
  } as any);
  const key = (target: ClipboardTestElement) => {
    const e = { key: 'c', ctrlKey: true, metaKey: false, altKey: false, isComposing: false,
      defaultPrevented: false, target, preventDefault: vi.fn(), stopPropagation: vi.fn(), stopImmediatePropagation: vi.fn() };
    listeners.get('keydown')?.(e);
    return e;
  };
  return { listeners, canvas, chat, body, editor, copy, prefer, cleanup, key, select: (text: string) => { selectedText = text; } };
};

describe('canvas Ctrl+C integration', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('does not consume selected Chat text even while a canvas image is selected', () => {
    const h = clipboardHarness();
    h.select('已确认的设计要求');
    const e = h.key(h.chat);
    expect(h.copy).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(e.stopImmediatePropagation).not.toHaveBeenCalled();
    expect(h.prefer.current).toBe(false);
    h.cleanup?.();
  });
  it('preserves text outputs and editors, including a read-only input without selected text', () => {
    const h = clipboardHarness();
    h.select('const design = "CMF";');
    expect(h.key(h.canvas).preventDefault).not.toHaveBeenCalled();
    h.select('');
    expect(h.key(h.editor).preventDefault).not.toHaveBeenCalled();
    expect(h.copy).not.toHaveBeenCalled();
    h.cleanup?.();
  });
  it('copies nodes on the canvas and only uses body fallback for the last canvas interaction', () => {
    const h = clipboardHarness();
    expect(h.key(h.canvas).preventDefault).toHaveBeenCalledOnce();
    expect(h.copy).toHaveBeenLastCalledWith(['selected-image']);
    h.listeners.get('pointerdown')?.({ target: h.canvas });
    h.key(h.body);
    expect(h.copy).toHaveBeenCalledTimes(2);
    h.listeners.get('pointerdown')?.({ target: h.chat });
    expect(h.key(h.body).preventDefault).not.toHaveBeenCalled();
    expect(h.key(h.chat).preventDefault).not.toHaveBeenCalled();
    expect(h.copy).toHaveBeenCalledTimes(2);
    h.cleanup?.();
  });
  it('resets internal clipboard priority after native copy without clearing the node selection', () => {
    const h = clipboardHarness();
    h.listeners.get('copy')?.({ target: h.chat });
    expect(h.prefer.current).toBe(false);
    h.key(h.canvas);
    expect(h.copy).toHaveBeenCalledWith(['selected-image']);
    h.cleanup?.();
  });
});


describe('canvas pointer-up focus cleanup', () => {
  afterEach(() => vi.unstubAllGlobals());
  function setup({ settings = false, recorder = false, canvas = true } = {}) {
    const events = new Map<string, (event: unknown) => void>();
    const frames: FrameRequestCallback[] = [];
    class ElementFixture {
      blur = vi.fn();
      closest(selector: string): ElementFixture | null {
        if (selector === 'button, a, [role="button"]') return this;
        if (selector.includes('data-drawer-settings-panel') && settings) return this;
        if (selector.includes('data-shortcut-recording') && recorder) return this;
        return null;
      }
    }
    const button = new ElementFixture();
    vi.stubGlobal('Element', ElementFixture); vi.stubGlobal('HTMLElement', ElementFixture);
    vi.stubGlobal('document', { activeElement: button });
    vi.stubGlobal('window', { addEventListener: (key: string, fn: (event: unknown) => void) => events.set(key, fn),
      removeEventListener: (key: string) => events.delete(key), requestAnimationFrame: (fn: FrameRequestCallback) => { frames.push(fn); return frames.length; } });
    const cleanup = runCanvasInteractionsEffect04({ isCanvasModeRef: { current: canvas } } as Parameters<typeof runCanvasInteractionsEffect04>[0]);
    return { button, cleanup, frames, pointerUp: () => events.get('pointerup')?.({ target: button }) };
  }
  it('does not blur the settings shortcut button on the frame after click starts recording', () => {
    const h = setup({ settings: true, recorder: true });
    h.pointerUp(); for (const frame of h.frames) frame(0);
    expect(h.button.blur).not.toHaveBeenCalled(); h.cleanup?.();
  });
  it('preserves recorder focus before its recording attribute switches from false to true', () => {
    const h = setup({ recorder: true });
    h.pointerUp(); for (const frame of h.frames) frame(0);
    expect(h.button.blur).not.toHaveBeenCalled(); h.cleanup?.();
  });
  it('preserves focus of other settings controls for keyboard interaction', () => {
    const h = setup({ settings: true });
    h.pointerUp(); for (const frame of h.frames) frame(0);
    expect(h.button.blur).not.toHaveBeenCalled(); h.cleanup?.();
  });
  it('still blurs ordinary canvas action buttons after pointer-up', () => {
    const h = setup(); h.pointerUp();
    expect(h.button.blur).not.toHaveBeenCalled(); for (const frame of h.frames) frame(0);
    expect(h.button.blur).toHaveBeenCalledOnce(); h.cleanup?.();
  });
  it('does not steal focus from a new active element or a non-canvas window', () => {
    const h = setup(); h.pointerUp(); (document as unknown as {activeElement:unknown}).activeElement = null;
    for (const frame of h.frames) frame(0); expect(h.button.blur).not.toHaveBeenCalled(); h.cleanup?.();
    const normal = setup({ canvas: false }); normal.pointerUp();
    expect(normal.frames).toHaveLength(0); normal.cleanup?.();
  });
});
