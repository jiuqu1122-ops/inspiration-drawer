import { afterEach, describe, expect, it, vi } from 'vitest';
import { zoomCanvasAtImpl, startCanvasItemDragImpl, startCanvasPanImpl } from './canvas/controllers/canvasInteractionActions';
import { deleteChatConversations } from './chat/storage/chatStorage';
import { invoke } from '@tauri-apps/api/core';
import { sortCanvasWorkflowRuntimeNodeIds } from '../utils/canvasWorkflowRuntime';
import type { CanvasImageItem } from './canvasModel';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: (path: string) => path }));

describe('canvas and conversation interactions', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('commits pending zoom before pan movement and continues from the current viewport', () => {
    const handlers = new Map<string, (event: any) => void>();
    vi.stubGlobal('document', { addEventListener: (name: string, callback: (event: any) => void) => handlers.set(name, callback), removeEventListener: () => {} });
    vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
    const surface = { scrollLeft: 1000, scrollTop: 1000, clientWidth: 900, clientHeight: 700, focus: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
    const context: any = { CANVAS_INTERACTION_BACKGROUND_SETTLE_MS: 100, canvasPanCleanupRef: { current: null }, canvasPanRef: { current: null }, canvasSurfaceRef: { current: surface }, canvasScaleRef: { current: 1 }, canvasSizeRef: { current: { width: 5000, height: 5000 } }, canvasScrollLockRef: { current: null }, canvasVisualViewportRef: { current: null }, isCanvasSpacePressedRef: { current: true }, pendingCanvasFocusItemIdRef: { current: null }, setCanvasInteractionActive: () => {}, growCanvasNearViewportEdge: () => {}, growCanvasToFit: () => {}, expandCanvasBeforeViewport: () => {}, beginCanvasZoomInteraction: () => {}, applyCanvasScaleStyles: () => {}, commitCanvasScaleSoon: () => {}, writeCanvasSurfaceScroll: (target: any, left: number, top: number) => { target.scrollLeft = left; target.scrollTop = top; } };
    context.settleCanvasZoomBeforePointerInteraction = () => {
      const viewport = context.canvasVisualViewportRef.current;
      if (!viewport) return;
      surface.scrollLeft = viewport.x * context.canvasScaleRef.current;
      surface.scrollTop = viewport.y * context.canvasScaleRef.current;
      context.canvasVisualViewportRef.current = null;
    };
    startCanvasPanImpl(context, { button: 0, pointerId: 1, clientX: 70, clientY: 90, currentTarget: { setPointerCapture: () => {}, addEventListener: () => {} }, preventDefault: () => {}, stopPropagation: () => {} } as any);
    for (let index = 0; index < 50; index++) {
      const anchorX = surface.scrollLeft / context.canvasScaleRef.current + 450 / context.canvasScaleRef.current;
      zoomCanvasAtImpl(context, 450, 350, index % 2 === 0 ? -10 : 10);
      const expectedLeft = anchorX * context.canvasScaleRef.current - 450 - 5;
      handlers.get('pointermove')!({ pointerId: 1, buttons: 1, clientX: 75 + index * 5, clientY: 90, preventDefault: () => {}, stopPropagation: () => {} });
      expect(surface.scrollLeft).toBeCloseTo(expectedLeft, 8);
      expect(context.canvasVisualViewportRef.current).toBeNull();
    }
  });
  it('holds the zoom anchor through repeated zooms and rebases an active pan', () => {
    const pan = { pointerId: 1, button: 0, startClientX: 70, startClientY: 90, startScrollLeft: 200, startScrollTop: 100 };
    const surface = { scrollLeft: 200, scrollTop: 100, clientWidth: 900, clientHeight: 700, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
    const context: any = { canvasPanRef: { current: pan }, canvasSurfaceRef: { current: surface }, canvasScaleRef: { current: 1 }, canvasSizeRef: { current: { width: 5000, height: 5000 } }, canvasVisualViewportRef: { current: null }, beginCanvasZoomInteraction: () => {}, applyCanvasScaleStyles: () => {}, growCanvasToFit: () => {}, commitCanvasScaleSoon: () => {} };
    for (let index = 0; index < 100; index++) {
      zoomCanvasAtImpl(context, 450, 350, index % 2 === 0 ? -10 : 10);
      const viewport = context.canvasVisualViewportRef.current;
      const scale = context.canvasScaleRef.current;
      expect(viewport.x + 450 / scale).toBeCloseTo(650, 8);
      expect(viewport.y + 350 / scale).toBeCloseTo(450, 8);
      expect(pan.startScrollLeft).toBeCloseTo(viewport.x * scale, 8);
      expect(pan.startScrollTop).toBeCloseTo(viewport.y * scale, 8);
    }
  });
  it('uses the first Shift selection as the reference for the second AI node', () => {
    const pick = vi.fn();
    const selected = { current: ['reference'] };
    const context: any = { canvasItemsRef: { current: [{ id: 'generator', ai: { type: 'image-generator' } }] }, canvasSelectedIdsRef: selected, canvasInputPickTargetIdRef: { current: null }, canvasResizeRef: { current: null }, isCanvasSpacePressedRef: { current: false }, settleCanvasZoomBeforePointerInteraction: () => {}, cancelCanvasImageSourceUpgradeQueue: () => {}, pickCanvasImageForGenerator: pick, setCanvasSelectedIds: vi.fn(), applyCanvasSelectionDomFeedback: vi.fn() };
    const event: any = { button: 0, shiftKey: true, pointerId: 1, target: { closest: () => null }, currentTarget: { setPointerCapture: () => {} }, preventDefault: () => {}, stopPropagation: () => {} };
    startCanvasItemDragImpl(context, event, 'generator');
    expect(pick).toHaveBeenCalledWith('reference', 'generator');
    expect(selected.current).toEqual(['generator']);
  });
  it('deletes each selected conversation once and retains failures for the runtime to display', async () => {
    vi.mocked(invoke).mockReset().mockImplementation(async (command, args: any) => {
      if (command !== 'chat_delete_conversation') return undefined;
      if (args.id === 'failed') throw new Error('storage unavailable');
      return args.id !== 'missing';
    });
    const onFailure = vi.fn();
    expect(await deleteChatConversations(['a', 'failed', 'a', 'missing', 'b'], onFailure)).toEqual(['a', 'b']);
    expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === 'chat_delete_conversation').map(([, args]: any) => args.id)).toEqual(['a', 'failed', 'missing', 'b']);
    expect(onFailure).toHaveBeenCalledWith('failed', expect.any(Error));
  });
  it('orders an audio generator before the video node that consumes its asset', () => {
    const audio: CanvasImageItem = { id: 'audio', x: 0, y: 0, width: 300, height: 240, item: { id: 'audio-item', type: 'text', content: '', createdAt: 1, isQuickAccess: false }, ai: { type: 'music-generator' } };
    const video: CanvasImageItem = { ...audio, id: 'video', inputs: ['audio'], ai: { type: 'video-generator' } };
    expect(sortCanvasWorkflowRuntimeNodeIds([video, audio])).toEqual(['audio', 'video']);
  });
});
