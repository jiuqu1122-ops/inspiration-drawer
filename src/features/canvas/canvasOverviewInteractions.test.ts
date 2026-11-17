import { describe, expect, it, vi } from 'vitest';
import type { CanvasImageItem } from '../canvasModel';
import { CanvasBoxIndex } from './canvasBoxIndex';
import { bindCanvasOverviewInteractions } from './canvasOverviewInteractions';

const node: CanvasImageItem = { id: 'image', x: 0, y: 0, width: 100, height: 100,
  item: { id: 'asset', type: 'image', content: '', createdAt: 1 } };

const fixture = () => {
  const root = { dataset: { canvasItemId: 'image' }, setPointerCapture: vi.fn() };
  const handlers = new Map<string, (event: any) => void>();
  const content = {
    addEventListener: (name: string, handler: EventListenerOrEventListenerObject) => handlers.set(name, handler as any),
    removeEventListener: (name: string) => handlers.delete(name),
    hasAttribute: (name: string) => name === 'data-canvas-overview',
    closest: () => null,
    contains: () => true,
    querySelector: vi.fn(() => root),
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  } as unknown as HTMLElement;
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '.08' }));
  const drag = vi.fn((event: any) => expect(event.currentTarget).toBe(root));
  const context = vi.fn();
  const scope = { canvasSelectedIdsRef: { current: [] }, activeThreeSceneIdRef: { current: null },
    isCanvasSpacePressedRef: { current: false }, startCanvasItemDrag: drag,
    updateCanvasSelection: vi.fn(), openCanvasContextMenu: context };
  const state = { index: new CanvasBoxIndex([{ item: node, box: node }]), rasterIds: new Set(['image']), scale: .08, scope };
  const promote = vi.fn();
  const dispose = bindCanvasOverviewInteractions(content, () => state, promote);
  const dispatch = (name: string, event: any) => handlers.get(name)?.(event);
  return { content, root, drag, context, scope, state, promote, dispose, dispatch };
};
const pointer = (content: HTMLElement, button = 0, target: any = content) => {
  let defaultPrevented = false;
  let stopped = false;
  return { button, clientX: 2, clientY: 3, pointerId: 7, target,
    preventDefault: () => { defaultPrevented = true; }, stopPropagation: () => { stopped = true; },
    get defaultPrevented() { return defaultPrevented; }, get stopped() { return stopped; } };
};

describe('overview interaction bridge', () => {
  it('promotes a raster hit and forwards drag to the real node root', () => {
    const h = fixture();
    const event = pointer(h.content);
    h.dispatch('pointerdown', event);
    expect(h.promote).toHaveBeenCalledWith('image');
    expect(h.drag).toHaveBeenCalledWith(expect.anything(), 'image');
    expect(event.defaultPrevented).toBe(true);
    h.dispose(); vi.unstubAllGlobals();
  });

  it('lets a later live node win over an overlapping raster image', () => {
    const h = fixture();
    const target = { closest: (selector: string) => selector === '[data-canvas-item-id]' ? target : null, getAttribute: (name: string) => name === 'data-canvas-item-id' ? 'live' : null };
    const event = pointer(h.content, 0, target);
    h.dispatch('pointerdown', event);
    expect(h.promote).not.toHaveBeenCalled();
    expect(h.drag).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    h.dispose(); vi.unstubAllGlobals();
  });

  it('routes context menus and double clicks without leaving pinned pressed nodes', () => {
    const h = fixture();
    const context = pointer(h.content, 2);
    h.dispatch('contextmenu', context);
    expect(h.scope.updateCanvasSelection).toHaveBeenCalledWith(['image']);
    expect(h.context).toHaveBeenCalledWith(context, 'item', { itemId: 'image' });
    expect(h.promote).not.toHaveBeenCalled();
    expect(context.defaultPrevented).toBe(true);
    h.dispose(); vi.unstubAllGlobals();
  });

  it('does not steal pan, background, controls, or non-raster node events', () => {
    const h = fixture();
    const pan = pointer(h.content, 1);
    h.dispatch('pointerdown', pan);
    expect(h.promote).not.toHaveBeenCalled();
    h.state.rasterIds.clear();
    const live = pointer(h.content);
    h.dispatch('pointerdown', live);
    expect(h.promote).not.toHaveBeenCalled(); expect(h.drag).not.toHaveBeenCalled();
    h.dispose(); vi.unstubAllGlobals();
  });
});
