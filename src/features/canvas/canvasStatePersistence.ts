import type { CanvasImageItem } from '../canvasModel';
import type { CanvasPersistedState } from '../../types/canvasRuntime';
import { stripCanvasItemDataImageProvenance } from '../../utils/canvasSerialization';
type SavedCanvasState = CanvasPersistedState & { activeCanvasId?: string };
type Invoker = (command: string, args: Record<string, unknown>) => Promise<unknown>;

/** Immutable node arrays are unchanged by zoom. Cache only one source array;
 * never cache by ID alone or re-use a changed node payload after edits. */
export const createCanvasPersistedItemsCache = () => {
  let previous: CanvasImageItem[] | undefined;
  let result: CanvasImageItem[] = [];
  return (items: CanvasImageItem[]) => {
    if (items !== previous) { result = items.map(stripCanvasItemDataImageProvenance); previous = items; }
    return result;
  };
};

/** First/edited states use the full authoritative save. Repeated view-only
 * states transport just scale/scroll/size, avoiding JSON IPC of every thumbnail.
 * Serialize sends: a slow old save cannot overwrite a later edit/view. Failed
 * full saves never authorize lightweight writes. Native verifies the view ID. */
export const createCanvasStatePersistence = (invoke: Invoker) => {
  let chain = Promise.resolve();
  let confirmed: { id: string; items: CanvasImageItem[] } | null = null;
  return (state: SavedCanvasState): Promise<void> => {
    const run = async () => {
      const id = state.activeCanvasId || '';
      if (id && confirmed?.id === id && confirmed.items === state.items) {
        const applied = await invoke('save_canvas_view_state', { view: { activeCanvasId: id,
          size: state.size, scale: state.scale, scroll: state.scroll, updatedAt: state.updatedAt } });
        if (applied === true) return;
      }
      await invoke('save_canvas_state', { state });
      confirmed = { id, items: state.items };
    };
    const result = chain.then(run);
    chain = result.catch(() => {});
    return result;
  };
};
