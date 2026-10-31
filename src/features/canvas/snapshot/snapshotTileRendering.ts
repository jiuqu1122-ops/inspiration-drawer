import type { CanvasItemBox } from '../../canvasModel';
import { snapshotPixelRatio, type SnapshotTile } from './snapshotScene';

export type SnapshotTileRasterSize = Readonly<{ width: number; height: number }>;
// Conservative backing-store limit, independent of adaptive world-space tile size.
export const SNAPSHOT_TILE_MAX_RASTER_EDGE = 4096;

/** Floor both axes so rounding cannot overshoot the caller's hard pixel budget. */
export const getSnapshotTileRasterSize = (
  box: CanvasItemBox, scale: number, dpr: number, pixelBudget: number,
): SnapshotTileRasterSize | null => {
  const budget = Math.floor(pixelBudget);
  const area = box.width * box.height;
  if (![box.x, box.y, box.width, box.height, area, budget].every(Number.isFinite)
    || box.width <= 0 || box.height <= 0 || area <= 0 || budget < 1) return null;
  const ideal = snapshotPixelRatio(
    Number.isFinite(scale) && scale > 0 ? scale : 1,
    Number.isFinite(dpr) && dpr > 0 ? dpr : 1,
  );
  const ratio = Math.min(ideal, Math.sqrt(budget / area), SNAPSHOT_TILE_MAX_RASTER_EDGE / box.width, SNAPSHOT_TILE_MAX_RASTER_EDGE / box.height);
  // The additional clamps also cover extremely narrow tiles (minimum one pixel per axis).
  const width = Math.min(budget, Math.max(1, Math.floor(box.width * ratio)));
  const height = Math.min(Math.floor(budget / width), Math.max(1, Math.floor(box.height * ratio)));
  return { width, height };
};

export const sameSnapshotTileRasterSize = (a: SnapshotTileRasterSize, b: SnapshotTileRasterSize) => (
  a.width === b.width && a.height === b.height
);

/** Only values that affect pixels, in stacking order; no source images or leases are retained. */
export const captureSnapshotTileContent = (tile: SnapshotTile, dark: boolean) => ({
  x: tile.box.x, y: tile.box.y, width: tile.box.width, height: tile.box.height, dark,
  items: tile.items.map(({ item, source, maxEdge }) => ({
    source, maxEdge: maxEdge ?? 512,
    x: item.x, y: item.y, width: item.width, height: item.height,
    rotation: item.rotation || 0, background: !item.ai,
  })),
});

export type SnapshotTileContent = ReturnType<typeof captureSnapshotTileContent>;

export const sameSnapshotTileContent = (a: SnapshotTileContent, b: SnapshotTileContent) => (
  a === b || a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height && a.dark === b.dark
  && a.items.length === b.items.length && a.items.every((item, index) => {
    const other = b.items[index];
    return item.source === other.source && item.maxEdge === other.maxEdge && item.x === other.x
      && item.y === other.y && item.width === other.width && item.height === other.height
      && item.rotation === other.rotation && item.background === other.background;
  })
);
