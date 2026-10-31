import { describe, expect, it, vi } from 'vitest';
import type { CanvasImageItem, CanvasItemBox } from '../../canvasModel';
import {
  drawSnapshotImage,
  planSnapshotRuns,
  planSnapshotTiles,
  SNAPSHOT_MAX_RASTER_RUNS,
  SNAPSHOT_MAX_TILES,
  SNAPSHOT_TILE_SIZE,
  snapshotPixelRatio,
  type SnapshotCandidate,
  type SnapshotTile,
} from './snapshotScene';

const node = (id: string, x = 0, y = 0): CanvasImageItem => ({
  id, x, y, width: 100, height: 80, item: { id, type: 'image', content: '', createdAt: 1 },
});
const candidate = (item: CanvasImageItem, maxEdge?: number): SnapshotCandidate => ({ item, source: `source:${item.id}`, maxEdge });
const readyFor = (items: readonly CanvasImageItem[]) => new Map(items.map(item => [item.id, `source:${item.id}`]));
const tileIds = (tiles: readonly SnapshotTile[]) => new Set(tiles.flatMap(tile => tile.items.map(({ item }) => item.id)));
const grid = (count: number) => Array.from({ length: count }, (_, i) => node(`image:${i}`, (i % 40) * 400 - 8000, Math.floor(i / 40) * 300 - 4000));
const overlaps = (a: CanvasItemBox, b: CanvasItemBox) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

// Covers every visible pixel, not just "an image occurred in some tile".
const expectVisibleCoverage = (items: readonly SnapshotCandidate[], viewport: CanvasItemBox, tiles: readonly SnapshotTile[]) => {
  for (const { item } of items) {
    if (!overlaps(item, viewport)) continue;
    const clip = {
      x: Math.max(item.x, viewport.x), y: Math.max(item.y, viewport.y),
      width: Math.min(item.x + item.width, viewport.x + viewport.width) - Math.max(item.x, viewport.x),
      height: Math.min(item.y + item.height, viewport.y + viewport.height) - Math.max(item.y, viewport.y),
    };
    const area = tiles.filter(tile => tile.items.some(entry => entry.item === item) && overlaps(tile.box, clip))
      .reduce((sum, { box }) => sum
        + (Math.min(box.x + box.width, clip.x + clip.width) - Math.max(box.x, clip.x))
        * (Math.min(box.y + box.height, clip.y + clip.height) - Math.max(box.y, clip.y)), 0);
    expect(area, `${item.id} visible coverage`).toBeCloseTo(clip.width * clip.height, 5);
  }
};

describe('mixed canvas snapshot runs', () => {
  it('keeps raster runs on their side of interleaved text, video and workflow nodes', () => {
    const text = { ...node('text'), item: { ...node('text').item, type: 'text' as const } };
    const video = { ...node('video'), item: { ...node('video').item, type: 'video' as const } };
    const workflow = { ...node('workflow'), workflowGroup: {} };
    const nodes = [node('a'), text, node('b'), video, node('c'), workflow, node('d')];
    const plan = planSnapshotRuns(nodes, readyFor(nodes), new Set());
    expect(plan.runs.map(run => run.beforeId)).toEqual(['a', 'b', 'c', 'd']);
    expect([...plan.rasterIds]).toEqual(['a', 'b', 'c', 'd']);
  });

  it('leaves selected, hovered, pending, failed, unready and workflow pictures live without mutation', () => {
    const nodes: CanvasImageItem[] = [
      node('selected'), node('hover'), node('unready'),
      { ...node('work'), ai: { type: 'generated-image', status: 'working' } },
      { ...node('failed'), ai: { type: 'generated-image', status: 'error' } },
      { ...node('slot'), workflowSlotAssets: [] },
      { ...node('bridge'), workflowBridge: { type: 'reference-image' } },
      { ...node('template'), workflowTemplateNodeId: 'template' },
    ];
    const original = JSON.stringify(nodes);
    const ready = readyFor(nodes);
    ready.delete('unready');
    const plan = planSnapshotRuns(nodes, ready, new Set(['selected', 'hover']));
    expect(plan.runs).toEqual([]);
    expect(plan.rasterIds.size).toBe(0);
    expect(JSON.stringify(nodes)).toBe(original);
    expect(ready).toEqual(new Map(nodes.filter(item => item.id !== 'unready').map(item => [item.id, `source:${item.id}`])));
  });

  it('keeps a bounded subset instead of falling back for excessive interleaving', () => {
    const nodes = Array.from({ length: 20 }, (_, i) => node(`n${i}`));
    const ready = readyFor(nodes.filter((_, i) => i % 2 === 0));
    const plan = planSnapshotRuns(nodes, ready, new Set(), 6);
    expect(plan.runs.map(run => run.beforeId)).toEqual(['n0', 'n2', 'n4', 'n6', 'n8', 'n10']);
    expect([...plan.rasterIds]).toEqual(['n0', 'n2', 'n4', 'n6', 'n8', 'n10']);
    expect(nodes.filter(item => !plan.rasterIds.has(item.id))).toHaveLength(14);
  });

  it('retains the most useful complete runs without moving one across any live barrier', () => {
    const sizes = [1, 5, 2, 4, 3, 8, 7, 6];
    const groups = sizes.map((size, group) => Array.from({ length: size }, (_, i) => node(`g${group}:${i}`)));
    const nodes = groups.flatMap((images, group) => [...images, node(`live:${group}`)]);
    const ready = readyFor(groups.flat());
    const original = JSON.stringify(nodes);
    const plan = planSnapshotRuns(nodes, ready, new Set(), 3);
    expect(plan.runs.map(run => run.beforeId)).toEqual(['g5:0', 'g6:0', 'g7:0']);
    expect(plan.runs.map(run => run.items.map(({ item }) => item))).toEqual(groups.slice(5));
    expect(plan.rasterIds.size).toBe(21);
    // Rebuild the mixed raster/live stack; no omitted image disappears and no
    // live node is swallowed by a retained bitmap layer.
    const atId = new Map(plan.runs.map(run => [run.beforeId, run]));
    const stack = nodes.flatMap(item => [
      ...(atId.get(item.id)?.items.map(entry => entry.item.id) ?? []),
      ...(plan.rasterIds.has(item.id) ? [] : [item.id]),
    ]);
    expect(stack).toEqual(nodes.map(item => item.id));
    expect(JSON.stringify(nodes)).toBe(original);
  });

  it.each([128, 256, 512])('passes uniform bitmap tier %i as the fifth argument without changing maxRuns', maxEdge => {
    const nodes = [node('a'), node('live'), node('b')];
    const plan = planSnapshotRuns(nodes, readyFor(nodes), new Set(['live']), 1, maxEdge);
    expect(plan.runs).toHaveLength(1);
    expect(plan.runs[0].items).toEqual([{ item: nodes[0], source: 'source:a', maxEdge }]);
    expect([...plan.rasterIds]).toEqual(['a']);
  });

  it('defaults maxEdge to 512 and preserves candidate/item identity through tiling', () => {
    const image = node('a');
    const plan = planSnapshotRuns([image], readyFor([image]), new Set());
    expect(plan.runs[0].items[0]).toEqual({ item: image, source: 'source:a', maxEdge: 512 });
    const tiles = planSnapshotTiles(plan.runs[0].items, { x: 0, y: 0, width: 500, height: 500 });
    expect(tiles[0].items[0]).toBe(plan.runs[0].items[0]);
    expect(tiles[0].items[0].item).toBe(image);
    // Old callers may still omit maxEdge on manually created candidates.
    expect(planSnapshotTiles([{ item: image, source: 'legacy' }], tiles[0].box)[0].items[0].maxEdge).toBeUndefined();
  });

  it.each([0, -1, 0.9])('keeps everything live when the layer budget is %s', maxRuns => {
    const nodes = [node('a')];
    expect(planSnapshotRuns(nodes, readyFor(nodes), new Set(), maxRuns)).toEqual({ runs: [], rasterIds: new Set() });
  });

  it.each([NaN, Infinity, -Infinity])('bounds an invalid layer budget %s using the default', maxRuns => {
    const nodes = Array.from({ length: 30 }, (_, i) => node(`n${i}`));
    const plan = planSnapshotRuns(nodes, readyFor(nodes.filter((_, i) => i % 2 === 0)), new Set(), maxRuns);
    expect(plan.runs).toHaveLength(SNAPSHOT_MAX_RASTER_RUNS);
  });

  it('keeps invalid geometry live and treats it as an ordering barrier', () => {
    const invalid = [
      { ...node('nan'), x: NaN }, { ...node('infinite'), y: Infinity },
      { ...node('zero'), width: 0 }, { ...node('negative'), height: -1 },
      { ...node('overflow'), x: Number.MAX_VALUE, width: Number.MAX_VALUE },
      { ...node('no-extent'), x: 1e30 },
    ];
    const nodes = [node('a'), ...invalid, node('b')];
    const plan = planSnapshotRuns(nodes, readyFor(nodes), new Set());
    expect(plan.runs.map(run => run.beforeId)).toEqual(['a', 'b']);
    expect([...plan.rasterIds]).toEqual(['a', 'b']);
  });
});

describe('adaptive world-space snapshot tiles', () => {
  it('allocates only intersecting tiles, ignores distant images and handles negative coordinates', () => {
    const entries = [candidate(node('neg', -50)), candidate(node('distant', 1000000))];
    const viewport = { x: -100, y: -100, width: 1000, height: 1000 };
    const tiles = planSnapshotTiles(entries, viewport);
    expect(tiles.map(tile => tile.id)).toEqual(['768:-1:0', '768:0:0']);
    expect(tiles.every(tile => tile.items.every(({ item }) => item.id === 'neg'))).toBe(true);
    expectVisibleCoverage(entries, viewport, tiles);
  });

  it('coarsens a formerly rejected million-unit viewport instead of returning an empty plan', () => {
    const entries = [candidate(node('a')), candidate(node('b', 999900, 999900))];
    const viewport = { x: 0, y: 0, width: 1000000, height: 1000000 };
    const tiles = planSnapshotTiles(entries, viewport);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThanOrEqual(SNAPSHOT_MAX_TILES);
    expect(tiles.every(tile => tile.box.width === 196608 && tile.box.height === 196608)).toBe(true);
    expect(tileIds(tiles)).toEqual(new Set(['a', 'b']));
    expectVisibleCoverage(entries, viewport, tiles);
  });

  it.each([100, 500, 1000])('keeps all %i ready images rasterizable at small scales', count => {
    const nodes = grid(count);
    for (const scale of [0.08, 0.01, 0.001]) {
      const viewport = { x: -9000, y: -5000, width: 1440 / scale, height: 900 / scale };
      const plan = planSnapshotRuns(nodes, readyFor(nodes), new Set(), undefined, 128);
      expect(plan.rasterIds.size).toBe(count);
      const tiles = planSnapshotTiles(plan.runs[0].items, viewport);
      expect(tiles.length).toBeGreaterThan(0);
      expect(tiles.length).toBeLessThanOrEqual(SNAPSHOT_MAX_TILES);
      expect(tileIds(tiles).size).toBe(count);
      expect(tiles.every(tile => tile.items.every(entry => entry.maxEdge === 128))).toBe(true);
      const multiplier = tiles[0].box.width / SNAPSHOT_TILE_SIZE;
      expect(Number.isInteger(Math.log2(multiplier))).toBe(true);
      expect(multiplier).toBeGreaterThan(1);
      expectVisibleCoverage(plan.runs[0].items, viewport, tiles);
    }
  });

  it.each([100, 500, 1000])('retains useful raster layers and a complete live fallback in an interleaved %i-image scene', count => {
    const images = grid(count);
    const groups = Array.from({ length: 10 }, (_, i) => images.slice(i * count / 10, (i + 1) * count / 10));
    const live = groups.map((_, i) => ({ ...node(`text:${i}`), item: { ...node(`text:${i}`).item, type: 'text' as const } }));
    const nodes = groups.flatMap((group, i) => [...group, live[i]]);
    const plan = planSnapshotRuns(nodes, readyFor(images), new Set(), undefined, 256);
    const viewport = { x: -9000, y: -5000, width: 144000, height: 90000 };
    const plans = plan.runs.map(run => ({ ...run, tiles: planSnapshotTiles(run.items, viewport) }));
    expect(plans).toHaveLength(SNAPSHOT_MAX_RASTER_RUNS);
    expect(plans.every(run => run.tiles.length > 0 && run.tiles.length <= SNAPSHOT_MAX_TILES)).toBe(true);
    const rasterized = new Set(plans.flatMap(run => [...tileIds(run.tiles)]));
    expect(rasterized).toEqual(plan.rasterIds);
    expect(rasterized.size).toBe(count * 0.6);
    const fallback = nodes.filter(item => !plan.rasterIds.has(item.id));
    expect(fallback).toHaveLength(count * 0.4 + live.length);
    expect(live.every(item => fallback.includes(item))).toBe(true);
    expect(new Set([...rasterized, ...fallback.map(item => item.id)])).toEqual(new Set(nodes.map(item => item.id)));
  });

  it('bounds full-grid occupancy at 48 while preserving within-tile scene order', () => {
    const entries = [candidate({ ...node('under', -100000), y: -100000, width: 200000, height: 200000 }),
      candidate({ ...node('over', -100000), y: -100000, width: 200000, height: 200000 })];
    const viewport = { x: -12288, y: -6144, width: 49152, height: 36864 };
    const tiles = planSnapshotTiles(entries, viewport);
    expect(tiles).toHaveLength(48);
    expect(tiles.every(tile => tile.items[0] === entries[0] && tile.items[1] === entries[1])).toBe(true);
    expectVisibleCoverage(entries, viewport, tiles);
  });

  it('uses half-open boundaries so a 48-cell view does not needlessly double its grid', () => {
    const entries = [candidate({ ...node('cover'), width: 8 * 768, height: 6 * 768 })];
    const viewport = { x: 0, y: 0, width: 8 * 768, height: 6 * 768 };
    const tiles = planSnapshotTiles(entries, viewport);
    expect(tiles).toHaveLength(48);
    expect(tiles.every(tile => tile.box.width === SNAPSHOT_TILE_SIZE)).toBe(true);
    expect(tiles[0].id).toBe('768:0:0');
    expect(tiles[47].id).toBe('768:7:5');
    expectVisibleCoverage(entries, viewport, tiles);
  });

  it('covers origin-crossing images without duplicating edge-only contacts', () => {
    const entries = [candidate(node('neg', -768, -768)), candidate(node('origin')), candidate(node('corner', -50, -40))];
    const viewport = { x: -768, y: -768, width: 1536, height: 1536 };
    const tiles = planSnapshotTiles(entries, viewport);
    expect(tiles.map(tile => tile.id)).toEqual(['768:-1:-1', '768:0:-1', '768:-1:0', '768:0:0']);
    expect(tiles.filter(tile => tile.items.includes(entries[0]))).toHaveLength(1);
    expect(tiles.filter(tile => tile.items.includes(entries[1]))).toHaveLength(1);
    expect(tiles.filter(tile => tile.items.includes(entries[2]))).toHaveLength(4);
    expectVisibleCoverage(entries, viewport, tiles);
  });

  it.each([-768, 0])('keeps complete tile members stable when disjoint viewports move within the world cell at %i', origin => {
    // Input order is deliberately opposite to spatial order: it is z-order.
    const later = candidate(node('later', origin + 600, origin + 600), 128);
    const earlier = candidate(node('earlier', origin + 20, origin + 20), 256);
    const entries = [later, earlier, candidate(node('other-cell', origin + 900, origin + 900))];
    const firstView = { x: origin + 10, y: origin + 10, width: 150, height: 120 };
    const nextView = { x: origin + 590, y: origin + 590, width: 150, height: 120 };
    const first = planSnapshotTiles(entries, firstView);
    const next = planSnapshotTiles(entries, nextView);
    expect(first).toHaveLength(1);
    expect(first[0].box).toEqual({ x: origin, y: origin, width: 768, height: 768 });
    expect(first[0].items).toEqual([later, earlier]);
    expect(first[0].items[0]).toBe(later);
    expect(first[0].items[1]).toBe(earlier);
    expect(next).toEqual(first);
    expectVisibleCoverage(entries, firstView, first);
    expectVisibleCoverage(entries, nextView, next);
  });

  it('keeps complete members stable in an adaptively doubled edge tile while its visible subset changes', () => {
    const entries = [candidate(node('edge', 50, 50), 128), candidate(node('inside', 700, 700), 128)];
    const firstView = { x: -100, y: -100, width: 6000, height: 6000 };
    const nextView = { ...firstView, x: 200, y: 200 };
    const first = planSnapshotTiles(entries, firstView);
    const next = planSnapshotTiles(entries, nextView);
    expect(first).toHaveLength(1);
    expect(first[0].id).toBe('1536:0:0');
    expect(first[0].items).toEqual(entries);
    expect(next).toEqual(first);
    expectVisibleCoverage(entries, firstView, first);
    expectVisibleCoverage(entries, nextView, next);
  });

  it('fills only tiles needed by visible images, not cells containing offscreen-only or invalid images', () => {
    const visible = candidate(node('visible', 10, 10));
    const sameCell = candidate(node('same-cell-offscreen', 600, 600));
    const entries = [visible, sameCell,
      candidate(node('offscreen-cell-1', 800, 600)), candidate(node('offscreen-cell-2', 1600, 600)),
      { item: node('empty-source', 1550, 10), source: '' },
      candidate({ ...node('invalid', 2000, 10), width: 0 }),
    ];
    const viewport = { x: 0, y: 0, width: 2304, height: 100 };
    const tiles = planSnapshotTiles(entries, viewport);
    expect(tiles).toHaveLength(1);
    expect(tiles[0].id).toBe('768:0:0');
    expect(tiles[0].items).toEqual([visible, sameCell]);
    expectVisibleCoverage(entries.filter(({ source, item }) => source && item.width > 0), viewport, tiles);
    // Having valid content somewhere in a cell must not allocate it when the
    // viewport sees no image at all.
    expect(planSnapshotTiles(entries, { ...viewport, y: 200 })).toEqual([]);
  });

  it('preserves ID/box geometry through small pans, zooms and bitmap-tier changes', () => {
    const image = { ...node('cover', -10000, -10000), width: 30000, height: 30000 };
    const viewport = { x: -1000, y: -1000, width: 10000, height: 6000 };
    const first = planSnapshotTiles([candidate(image, 128)], viewport);
    const next = planSnapshotTiles([candidate(image, 256)], { ...viewport, x: -990, y: -995, width: 10100, height: 6050 });
    expect(next.map(tile => ({ id: tile.id, box: tile.box }))).toEqual(first.map(tile => ({ id: tile.id, box: tile.box })));
    expect(first.every(tile => tile.items[0].maxEdge === 128)).toBe(true);
    expect(next.every(tile => tile.items[0].maxEdge === 256)).toBe(true);
  });

  it('cannot reuse a stale box when the grid tier or custom base edge changes', () => {
    const entries = [candidate({ ...node('cover', -10000, -10000), width: 50000, height: 50000 })];
    const small = planSnapshotTiles(entries, { x: 0, y: 0, width: 500, height: 500 });
    const large = planSnapshotTiles(entries, { x: 0, y: 0, width: 6000, height: 6000 });
    const custom = planSnapshotTiles(entries, { x: 0, y: 0, width: 500, height: 500 }, 512);
    expect(small[0].id).toBe('768:0:0');
    expect(large[0].id).toBe('1536:0:0');
    expect(custom[0].id).toBe('512:0:0');
    const boxesById = new Map<string, CanvasItemBox>();
    for (const tile of [...small, ...large, ...custom]) {
      if (boxesById.has(tile.id)) expect(tile.box).toEqual(boxesById.get(tile.id));
      boxesById.set(tile.id, tile.box);
    }
    expect(planSnapshotTiles(entries, { x: 0, y: 0, width: 500, height: 500 })).toEqual(small);
  });

  it('does not let distant outliers inflate a sparse visible scene or produce empty tiles', () => {
    const viewport = { x: -1e8, y: -1e8, width: 2e8, height: 2e8 };
    const entries = [candidate(node('near-origin', -50, -40)), candidate(node('isolated', 5e7, 5e7))];
    const tiles = planSnapshotTiles(entries, viewport);
    const withOutlier = planSnapshotTiles([...entries, candidate(node('outlier', 1e12, 1e12))], viewport);
    expect(withOutlier).toEqual(tiles);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThanOrEqual(5);
    expect(tileIds(tiles)).toEqual(new Set(['near-origin', 'isolated']));
    expect(tiles.every(tile => tile.items.length > 0)).toBe(true);
    expectVisibleCoverage(entries, viewport, tiles);
    expect(planSnapshotTiles([], viewport)).toEqual([]);
    expect(planSnapshotTiles([candidate(node('outside', 1e12))], viewport)).toEqual([]);
  });

  it.each([
    { x: NaN }, { y: Infinity }, { width: -1 }, { height: 0 },
    { width: Infinity }, { x: Number.MAX_VALUE, width: Number.MAX_VALUE },
    { x: 1e30, width: 100 },
  ])('rejects unusable viewport geometry %j', patch => {
    expect(planSnapshotTiles([candidate(node('a'))], { x: 0, y: 0, width: 100, height: 100, ...patch })).toEqual([]);
  });

  it.each([NaN, Infinity, -Infinity, 0, -768])('rejects unusable base tile size %s', tileSize => {
    expect(planSnapshotTiles([candidate(node('a'))], { x: 0, y: 0, width: 100, height: 100 }, tileSize)).toEqual([]);
  });

  it('ignores invalid candidate geometry without discarding a usable neighbor', () => {
    const invalid = [
      { ...node('nan'), x: NaN }, { ...node('infinite'), height: Infinity },
      { ...node('zero'), width: 0 }, { ...node('negative'), height: -1 },
      { ...node('overflow'), x: Number.MAX_VALUE, width: Number.MAX_VALUE },
    ];
    const tiles = planSnapshotTiles([candidate(node('valid')), ...invalid.map(item => candidate(item)), { item: node('empty-source'), source: '' }],
      { x: -100, y: -100, width: 100000, height: 100000 });
    expect(tiles.length).toBeGreaterThan(0);
    expect(tileIds(tiles)).toEqual(new Set(['valid']));
  });

  it('terminates safely for unsafe grid indices, subnormal base sizes and overflowing world area', () => {
    const far = { ...node('far', 1e18, -1e18), width: 4096, height: 4096 };
    const tiles = planSnapshotTiles([candidate(far)], { x: far.x, y: far.y, width: 8192, height: 8192 }, 1);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThanOrEqual(SNAPSHOT_MAX_TILES);
    expect(tiles.every(tile => Object.values(tile.box).every(Number.isFinite))).toBe(true);
    expectVisibleCoverage([candidate(far)], { x: far.x, y: far.y, width: 8192, height: 8192 }, tiles);
    expect(planSnapshotTiles([candidate(node('a'))], { x: 0, y: 0, width: 500, height: 500 }, Number.MIN_VALUE).length).toBeGreaterThan(0);
    expect(planSnapshotTiles([candidate(node('a'))], { x: 0, y: 0, width: 1e300, height: 1e300 })).toEqual([]);
  });

  it('only plans world geometry: even giant world tiles do not allocate pixel canvases', () => {
    const createElement = vi.fn(() => { throw new Error('planner must not allocate'); });
    vi.stubGlobal('document', { createElement });
    try {
      const tiles = planSnapshotTiles([candidate(node('a'))], { x: 0, y: 0, width: 1e9, height: 1e9 });
      expect(tiles.length).toBeGreaterThan(0);
      expect(tiles[0].box.width).toBeGreaterThan(1e8);
      expect(createElement).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('snapshot drawing geometry', () => {
  it('keeps texture scale tier stable under small zoom movements and bounds pixels', () => {
    expect(snapshotPixelRatio(.44, 1)).toBe(snapshotPixelRatio(.46, 1));
    expect(snapshotPixelRatio(10, 3)).toBe(1.5);
    expect(snapshotPixelRatio(.01, 1)).toBe(.25);
  });

  it('draws each quarter-turn with the original object-contain geometry', () => {
    const ctx = { save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn() };
    drawSnapshotImage(ctx as unknown as CanvasRenderingContext2D, {} as CanvasImageSource, 200, 100, { ...node('a', 10), rotation: 90 });
    expect(ctx.translate).toHaveBeenCalledWith(60, 40);
    expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(ctx.drawImage).toHaveBeenCalledWith({}, -40, -20, 80, 40);
    expect(ctx.restore).toHaveBeenCalledOnce();
  });
});
