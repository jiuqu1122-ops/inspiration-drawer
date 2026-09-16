import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveCanvasPasteClient, runCanvasInteractionsEffect03 } from './canvasInteractionEffects';

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
