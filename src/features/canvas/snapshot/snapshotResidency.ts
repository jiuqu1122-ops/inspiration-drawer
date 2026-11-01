import type { CanvasImageItem, CanvasItemBox } from '../../canvasModel';
import { getCanvasInitialImageSource } from '../../../utils/canvasItemSelectors';

export const SNAPSHOT_MAX_RESIDENT_SOURCES = 1024;
export const SNAPSHOT_REQUEST_BATCH_SIZE = 24;
export const SNAPSHOT_CACHE_BYTES = 96 * 1024 * 1024;

/** Hysteresis avoids re-decoding every picture when viewport membership oscillates
 * at a density boundary. Large scenes spend pixels on the overview, not originals;
 * selected/zoomed inspection still has the original-image renderer. */
export const chooseSnapshotMaxEdge = (count: number, previous = 512): number => {
  if (count > 256) return 128;
  if (count > 80) return previous <= 128 && count > 192 ? 128 : 256;
  if (previous < 512 && count > 56) return previous;
  return 512;
};
const intersects = (a: CanvasItemBox, b: CanvasItemBox) => a.x <= b.x + b.width && a.x + a.width >= b.x
  && a.y <= b.y + b.height && a.y + a.height >= b.y;

/** Admit unique sources, not the first N nodes. Prioritize the actual viewport;
 * offscreen selected nodes must not evict the entire visible overview. */
export const planSnapshotResidency = (items: readonly CanvasImageItem[], viewport: CanvasItemBox | null, previousMaxEdge = 512) => {
  const sources = new Map<string, string>();
  const admitted = new Set<string>();
  const append = (item: CanvasImageItem) => {
    const source = getCanvasInitialImageSource(item.item);
    if (!source || (!admitted.has(source) && admitted.size >= SNAPSHOT_MAX_RESIDENT_SOURCES)) return;
    admitted.add(source); sources.set(item.id, source);
  };
  if (viewport) for (const item of items) if (intersects(item, viewport)) append(item);
  for (const item of items) if (!sources.has(item.id)) append(item);
  return { sources, maxEdge: chooseSnapshotMaxEdge(admitted.size, previousMaxEdge), uniqueCount: admitted.size };
};

/** Compare only values used to paint a simple image. Event callbacks use the
 * committed action ref, so a viewport update must not re-render 1000 hitboxes. */
export const getSnapshotNodeDependencies = (item: CanvasImageItem, selected: boolean, raster: boolean,
  bitmap: unknown, source: string | undefined, maxEdge: number, scale: number, analyzing = false): readonly unknown[] => [
  item, selected, raster, bitmap, source, maxEdge, analyzing,
  raster ? false : Math.max(item.width, item.height) * (scale || 1) <= maxEdge,
];


/** Scaled nodes may pass under a stationary pointer during wheel zoom. Do not
 * promote/demote a different image and rebuild raster runs for each such hover. */
export const canUpdateSnapshotHover = (host: Element | null) => (
  !host?.closest('[data-canvas-surface="true"]')?.hasAttribute('data-canvas-zooming')
);
