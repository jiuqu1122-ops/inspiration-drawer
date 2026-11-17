import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';
import type { CanvasImageItem } from '../canvasModel';
import { getCanvasItemElementFromContent } from './canvasDomLookup';
import { canvasOverviewWorldPoint } from './canvasSnapshotOverview';
import type { CanvasBoxIndex } from './canvasBoxIndex';

export type CanvasOverviewInteractionState = {
  index: CanvasBoxIndex<CanvasImageItem> | null;
  rasterIds: ReadonlySet<string>;
  scale: number;
  scope: Record<string, any>;
};

/** Native capture is intentional: a compressed image can cover a live sibling.
 * The capture handler ignores live nodes and interactive controls; snapshot-only
 * hits are promoted just before the standard selection/drag controller runs. */
export const bindCanvasOverviewInteractions = (
  content: HTMLElement,
  getState: () => CanvasOverviewInteractionState,
  promote: (id: string) => void,
) => {
  const hit = (event: MouseEvent) => {
    const state = getState();
    const target = event.target as Element | null;
    if (!target?.closest) return null;
    const itemRoot = target.closest('[data-canvas-item-id]');
    // A live node already owns this pointer event and its React interactions.
    if (itemRoot) return null;
    // Menus, connection handles and group chrome retain their existing actions.
    if (target.closest('[data-no-drag="true"], [data-canvas-group-frame-id], button, input, textarea, select, [contenteditable="true"]')) return null;
    if (target !== content && !target.closest('[data-canvas-snapshot-host="true"]')) return null;
    const point = canvasOverviewWorldPoint(content, event.clientX, event.clientY, state.scale);
    const rasterTop = point ? state.index?.topAtPoint(point.x, point.y) : null;
    if (!rasterTop || !state.rasterIds.has(rasterTop.id)) return null;
    return { item: rasterTop, state };
  };
  const pointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const result = hit(event);
    if (!result || !result.state.rasterIds.has(result.item.id)) return;
    const { item, state } = result;
    if (state.scope.isCanvasSpacePressedRef?.current) return;
    event.preventDefault();
    event.stopPropagation();
    // The promotion commits synchronously before the old drag controller queries
    // per-node elements. Pointer capture belongs to the promoted node, never to
    // an overlay that could be removed by that same commit.
    promote(item.id);
    const element = getCanvasItemElementFromContent(content, item.id);
    if (!element) return;
    if (state.scope.activeThreeSceneIdRef?.current && state.scope.activeThreeSceneIdRef.current !== item.id) state.scope.exitThreeSceneInteraction?.();
    const forwarded = new Proxy(event, {
      get(target, key) {
        if (key === 'currentTarget' || key === 'target') return element;
        if (key === 'nativeEvent') return event;
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    state.scope.startCanvasItemDrag?.(forwarded as unknown as ReactPointerEvent, item.id);
  };
  const doubleClick = (event: MouseEvent) => {
    const result = hit(event);
    if (!result || !result.state.rasterIds.has(result.item.id)) return;
    if (result.state.scope.enableCanvasWorkflowSingleEditForItem?.(result.item.id)) {
      event.preventDefault(); event.stopPropagation();
    }
  };
  const contextMenu = (event: MouseEvent) => {
    const result = hit(event);
    if (!result || !result.state.rasterIds.has(result.item.id)) return;
    const { item, state } = result;
    event.preventDefault(); event.stopPropagation();
    if (!state.scope.canvasSelectedIdsRef?.current?.includes(item.id)) state.scope.updateCanvasSelection?.([item.id]);
    state.scope.openCanvasContextMenu?.(event as unknown as ReactMouseEvent, 'item', { itemId: item.id });
  };
  content.addEventListener('pointerdown', pointerDown, true);
  content.addEventListener('contextmenu', contextMenu, true);
  content.addEventListener('dblclick', doubleClick, true);
  return () => {
    content.removeEventListener('pointerdown', pointerDown, true);
    content.removeEventListener('contextmenu', contextMenu, true);
    content.removeEventListener('dblclick', doubleClick, true);
  };
};
