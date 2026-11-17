import type { CanvasImageItem } from '../canvasModel';
import { CanvasBoxIndex } from './canvasBoxIndex';

export const CANVAS_SNAPSHOT_OVERVIEW_ENTER_SCALE = .16;
export const CANVAS_SNAPSHOT_OVERVIEW_DENSE_ENTER_SCALE = .45;
export const CANVAS_SNAPSHOT_OVERVIEW_EXIT_SCALE = .2;
export const CANVAS_SNAPSHOT_OVERVIEW_DENSE_EXIT_SCALE = .55;
export const CANVAS_SNAPSHOT_OVERVIEW_TILE_SIZE = 3072;
export const CANVAS_SNAPSHOT_OVERVIEW_MAX_TILES = 24;
export const CANVAS_MATERIALIZE_ITEMS_EVENT = 'canvas-materialize-items';

/** Hysteresis avoids switching DOM/raster presentation repeatedly near a tier. */
export const shouldUseCanvasSnapshotOverview = (scale: number, wasActive = false, visibleItemCount = 1) => {
  if (!(Number.isFinite(scale) && scale > 0 && visibleItemCount > 0)) return false;
  if (wasActive) {
    const exitScale = visibleItemCount >= 64 ? CANVAS_SNAPSHOT_OVERVIEW_DENSE_EXIT_SCALE : CANVAS_SNAPSHOT_OVERVIEW_EXIT_SCALE;
    return scale <= exitScale;
  }
  const enterScale = visibleItemCount >= 64 ? CANVAS_SNAPSHOT_OVERVIEW_DENSE_ENTER_SCALE : CANVAS_SNAPSHOT_OVERVIEW_ENTER_SCALE;
  return scale <= enterScale;
};

export const createCanvasOverviewHitIndex = (
  items: readonly CanvasImageItem[],
  getBox: (item: CanvasImageItem) => { x: number; y: number; width: number; height: number } = item => item,
) => new CanvasBoxIndex(items.map(item => ({ item, box: getBox(item) })));

/** Promote group/multi-selection members before the existing drag controller
 * looks up their DOM elements. No effect outside the compressed overview. */
export const materializeCanvasOverviewItems = (content: HTMLElement | null, ids: readonly string[]) => {
  if (!content?.hasAttribute?.('data-canvas-overview')) return;
  content.dispatchEvent(new CustomEvent(CANVAS_MATERIALIZE_ITEMS_EVENT, { detail: ids }));
};

/** The transformed content rect includes live wheel offsets and native scroll.
 * Read the live CSS scale, not React's deliberately throttled render scale. */
export const canvasOverviewWorldPoint = (content: HTMLElement, clientX: number, clientY: number, fallbackScale: number) => {
  const scale = Number.parseFloat(getComputedStyle(content).getPropertyValue('--canvas-live-scale')) || fallbackScale;
  if (!(Number.isFinite(scale) && scale > 0)) return null;
  const rect = content.getBoundingClientRect();
  return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
};
