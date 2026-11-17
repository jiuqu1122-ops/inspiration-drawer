import type { CanvasImageItem, CanvasItemBox } from '../../canvasModel';
import { isStandaloneCanvasImage } from '../canvasNodeRenderDependencies';
export const SNAPSHOT_TILE_SIZE = 768;
export const SNAPSHOT_MAX_TILES = 48;
export const SNAPSHOT_MAX_RASTER_RUNS = 6;
export type SnapshotCandidate = { item: CanvasImageItem; source: string; maxEdge?: number };
export type SnapshotRun = { id: string; beforeId: string; items: SnapshotCandidate[] };
export type SnapshotTile = { id: string; box: CanvasItemBox; items: SnapshotCandidate[] };
const isUsableBox = ({ x, y, width, height }: CanvasItemBox) => (
  [x, y, width, height, x + width, y + height].every(Number.isFinite)
  && width > 0 && height > 0 && x + width > x && y + height > y
);
// Half-open bounds exclude empty edge/corner contacts, including at the origin.
const intersects = (a: CanvasItemBox, b: CanvasItemBox) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/** Never merge across a live node. If layers are scarce, retain the complete
 * runs that replace the most DOM images; ties and output keep scene order.
 * Only retained, usable images enter rasterIds; everything else stays live. */
export const planSnapshotRuns = (
  items: readonly CanvasImageItem[],
  ready: ReadonlyMap<string, string>,
  liveIds: ReadonlySet<string>,
  maxRuns = SNAPSHOT_MAX_RASTER_RUNS,
  maxEdge = 512,
  nodeMaxEdges?: ReadonlyMap<string, number>,
): { runs: SnapshotRun[]; rasterIds: ReadonlySet<string> } => {
  const limit = Number.isFinite(maxRuns) ? Math.max(0, Math.floor(maxRuns)) : SNAPSHOT_MAX_RASTER_RUNS;
  if (!limit) return { runs: [], rasterIds: new Set() };
  const runs: SnapshotRun[] = [];
  let run: SnapshotRun | null = null;
  for (const item of items) {
    const source = ready.get(item.id);
    if (!source || liveIds.has(item.id) || !isStandaloneCanvasImage(item) || !isUsableBox(item)) { run = null; continue; }
    if (!run) { run = { id: `raster:${item.id}`, beforeId: item.id, items: [] }; runs.push(run); }
    run.items.push({ item, source, maxEdge: nodeMaxEdges?.get(item.id) ?? maxEdge });
  }
  let retained = runs;
  if (runs.length > limit) {
    const preferred = new Set(runs.map((entry, index) => ({ entry, index }))
      .sort((a, b) => b.entry.items.length - a.entry.items.length || a.index - b.index)
      .slice(0, limit).map(({ entry }) => entry));
    retained = runs.filter(entry => preferred.has(entry));
  }
  return { runs: retained, rasterIds: new Set(retained.flatMap(entry => entry.items.map(({ item }) => item.id))) };
};

/** Tile boxes are world geometry, NOT pixel-canvas dimensions. Keep the grid
 * anchored at zero and double its edge until the whole view fits the budget.
 * IDs include the actual edge: the same ID always has the same box, even when
 * a zoom crosses a grid tier (or a caller supplies another base tile size).
 * Consumers still cap pixel allocation independently of this world size. */
export const planSnapshotTiles = (items: readonly SnapshotCandidate[], viewport: CanvasItemBox, tileSize = SNAPSHOT_TILE_SIZE, maxTiles = SNAPSHOT_MAX_TILES): SnapshotTile[] => {
  if (!isUsableBox(viewport) || !Number.isFinite(tileSize) || tileSize <= 0) return [];
  const valid = items.filter(({ item, source }) => source && isUsableBox(item));
  if (!valid.some(({ item }) => intersects(item, viewport))) return [];
  const tileLimit = Number.isFinite(maxTiles) ? Math.max(1, Math.floor(maxTiles)) : SNAPSHOT_MAX_TILES;
  let size = tileSize;
  let left: number, right: number, top: number, bottom: number;
  for (;;) {
    // Overflowing world area cannot be safely consumed by the pixel budget.
    if (!Number.isFinite(size * size)) return [];
    left = Math.floor(viewport.x / size);
    right = Math.max(left, Math.ceil((viewport.x + viewport.width) / size) - 1);
    top = Math.floor(viewport.y / size);
    bottom = Math.max(top, Math.ceil((viewport.y + viewport.height) / size) - 1);
    // Safe integers also ensure x++ / y++ below always make progress for far
    // coordinates and tiny custom base sizes. Doubling terminates at overflow.
    if ([left, right, top, bottom].every(Number.isSafeInteger)
      && (right - left + 1) * (bottom - top + 1) <= tileLimit) break;
    size *= 2;
  }
  // Bucket candidates once into the bounded visible grid. The prior code
  // rescanned every image for every tile, repeating O(images * tiles) per pan.
  const membersByCell = new Map<string, SnapshotCandidate[]>();
  const visibleCells = new Set<string>();
  for (const entry of valid) {
    const { item } = entry;
    const firstX = Math.max(left, Math.floor(item.x / size));
    const lastX = Math.min(right, Math.ceil((item.x + item.width) / size) - 1);
    const firstY = Math.max(top, Math.floor(item.y / size));
    const lastY = Math.min(bottom, Math.ceil((item.y + item.height) / size) - 1);
    if (firstX > lastX || firstY > lastY) continue;
    const isVisible = intersects(item, viewport);
    for (let y = firstY; y <= lastY; y++) for (let x = firstX; x <= lastX; x++) {
      const key = x + ':' + y;
      const members = membersByCell.get(key);
      if (members) members.push(entry); else membersByCell.set(key, [entry]);
      if (isVisible) visibleCells.add(key);
    }
  }
  const tiles: SnapshotTile[] = [];
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
    const key = x + ':' + y;
    if (!visibleCells.has(key)) continue;
    const box = { x: x * size || 0, y: y * size || 0, width: size, height: size };
    tiles.push({ id: size + ':' + x + ':' + y, box, items: membersByCell.get(key) ?? [] });
  }
  return tiles;
};
/** Fixed world cells for overview navigation. Count occupied cells rather
 * than empty viewport area, otherwise a sparse/huge canvas grows the grid edge
 * repeatedly during a zoom and replaces every previously painted tile. */
export const planSnapshotOverviewTiles = (
  items: readonly SnapshotCandidate[], viewport: CanvasItemBox, tileSize = 3072, maxTiles = 24,
): SnapshotTile[] => {
  if (!isUsableBox(viewport) || !Number.isFinite(tileSize) || tileSize <= 0) return [];
  const limit = Number.isFinite(maxTiles) ? Math.max(1, Math.min(48, Math.floor(maxTiles))) : 24;
  const cells = new Map<string, { x: number; y: number; items: SnapshotCandidate[] }>();
  const required = new Map<SnapshotCandidate, string[]>();
  const left = Math.floor(viewport.x / tileSize), right = Math.ceil((viewport.x + viewport.width) / tileSize) - 1;
  const top = Math.floor(viewport.y / tileSize), bottom = Math.ceil((viewport.y + viewport.height) / tileSize) - 1;
  if (![left, right, top, bottom].every(Number.isSafeInteger)) return [];
  for (const entry of items) {
    if (!entry.source || !isUsableBox(entry.item)) continue;
    const { item } = entry;
    const firstX = Math.max(left, Math.floor(item.x / tileSize));
    const lastX = Math.min(right, Math.ceil((item.x + item.width) / tileSize) - 1);
    const firstY = Math.max(top, Math.floor(item.y / tileSize));
    const lastY = Math.min(bottom, Math.ceil((item.y + item.height) / tileSize) - 1);
    const count = (lastX - firstX + 1) * (lastY - firstY + 1);
    // Oversized nodes keep the live fallback instead of allocating thousands of
    // cells or hiding an image after admitting only part of its visible area.
    if (firstX > lastX || firstY > lastY || count > limit || count < 1) continue;
    const keys: string[] = [];
    for (let y = firstY; y <= lastY; y++) for (let x = firstX; x <= lastX; x++) {
      const key = `${x}:${y}`;
      keys.push(key);
      const cell = cells.get(key);
      if (cell) cell.items.push(entry); else cells.set(key, { x, y, items: [entry] });
    }
    required.set(entry, keys);
  }
  let retained = [...cells.entries()];
  if (retained.length > limit) {
    const cx = (viewport.x + viewport.width / 2) / tileSize, cy = (viewport.y + viewport.height / 2) / tileSize;
    const distance = (cell: { x: number; y: number }) => (cell.x + .5 - cx) ** 2 + (cell.y + .5 - cy) ** 2;
    retained.sort((a, b) => distance(a[1]) - distance(b[1]) || a[1].y - b[1].y || a[1].x - b[1].x);
    retained = retained.slice(0, limit);
  }
  const retainedKeys = new Set(retained.map(([key]) => key));
  const complete = new Set([...required].filter(([, keys]) => keys.every(key => retainedKeys.has(key))).map(([entry]) => entry));
  return retained.sort((a, b) => a[1].y - b[1].y || a[1].x - b[1].x).flatMap(([, cell]) => {
    const members = cell.items.filter(entry => complete.has(entry));
    if (!members.length || !members.some(({ item }) => intersects(item, viewport))) return [];
    return [{ id: `${tileSize}:${cell.x}:${cell.y}`, box: {
      x: cell.x * tileSize || 0, y: cell.y * tileSize || 0, width: tileSize, height: tileSize,
    }, items: members }];
  });
};

export const snapshotPixelRatio = (scale: number, dpr = 1) => {
  const value = Math.max(.125, Math.min(1.5, scale * Math.max(1, dpr)));
  return value <= .25 ? .25 : value <= .5 ? .5 : value <= 1 ? 1 : 1.5;
};
export const drawSnapshotImage = (ctx: CanvasRenderingContext2D, drawable: CanvasImageSource, width: number, height: number, item: CanvasImageItem) => {
  if (!(width > 0 && height > 0 && item.width > 0 && item.height > 0)) return;
  const rotation = item.rotation || 0;
  const swapped = rotation % 180 !== 0;
  const frameWidth = swapped ? item.height : item.width;
  const frameHeight = swapped ? item.width : item.height;
  const ratio = Math.min(frameWidth / width, frameHeight / height);
  ctx.save();
  try {
    ctx.translate(item.x + item.width / 2, item.y + item.height / 2);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.drawImage(drawable, -width * ratio / 2, -height * ratio / 2, width * ratio, height * ratio);
  } finally { ctx.restore(); }
};
