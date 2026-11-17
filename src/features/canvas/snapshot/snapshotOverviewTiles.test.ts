import { describe, expect, it } from 'vitest';
import type { CanvasImageItem } from '../../canvasModel';
import { planSnapshotOverviewTiles, type SnapshotCandidate } from './snapshotScene';

const candidate = (id: string, x = 20, y = 20, width = 100): SnapshotCandidate => ({
  source: `${id}.png`, maxEdge: 256,
  item: { id, x, y, width, height: 80,
    item: { id, type: 'image', content: '', createdAt: 1 } } as CanvasImageItem,
});

describe('fixed occupied overview cells', () => {
  it('does not turn a sparse million-unit canvas into giant low-resolution tiles', () => {
    const near = candidate('near'), far = candidate('far', 999000, 999000);
    const small = planSnapshotOverviewTiles([near, far], { x: 0, y: 0, width: 6000, height: 4000 });
    const huge = planSnapshotOverviewTiles([near, far], { x: 0, y: 0, width: 1e6, height: 1e6 });
    expect(small).toHaveLength(1); expect(huge).toHaveLength(2);
    expect(small[0].box).toEqual({ x: 0, y: 0, width: 3072, height: 3072 });
    expect(huge[0].box).toEqual(small[0].box);
    expect(huge[0].id).toBe(small[0].id);
    expect(huge[0].items[0]).toBe(near);
  });

  it('keeps complete cell content and stacking order as a viewport moves inside it', () => {
    const back = candidate('back'), front = candidate('front', 2000), entries = [back, front];
    const left = planSnapshotOverviewTiles(entries, { x: 0, y: 0, width: 300, height: 300 });
    const right = planSnapshotOverviewTiles(entries, { x: 1900, y: 0, width: 300, height: 300 });
    expect(left[0].id).toBe(right[0].id);
    expect(left[0].items).toEqual([back, front]);
    expect(right[0].items).toEqual([back, front]);
  });

  it('caps actual occupied cells without partially rasterizing a visible image', () => {
    const wide = candidate('wide', 3000, 20, 5000);
    const entries = [wide, ...Array.from({ length: 40 }, (_, id) => candidate(String(id), id * 3072 + 20))];
    const tiles = planSnapshotOverviewTiles(entries, { x: 0, y: 0, width: 130000, height: 4000 }, 3072, 2);
    expect(tiles.length).toBeGreaterThan(0); expect(tiles.length).toBeLessThanOrEqual(2);
    expect(tiles.flatMap(tile => tile.items)).not.toContain(wide);
    expect(tiles.every(tile => tile.items.length > 0)).toBe(true);
  });

  it('covers both sides of a split image before it may replace the live node', () => {
    const split = candidate('split', -50, 20, 100);
    const tiles = planSnapshotOverviewTiles([split], { x: -100, y: 0, width: 200, height: 200 });
    expect(tiles.map(tile => tile.id)).toEqual(['3072:-1:0', '3072:0:0']);
    expect(tiles.every(tile => tile.items[0] === split)).toBe(true);
  });

  it('agrees with a full cell scan on randomized scenes when the cap does not clip', () => {
    let seed = 1559;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const entries = Array.from({ length: 160 }, (_, id) => candidate(String(id), random() * 10000 - 1000, random() * 6000 - 1000, 50 + random() * 500));
    for (let sample = 0; sample < 20; sample++) {
      const view = { x: random() * 6000 - 1000, y: random() * 3000 - 1000, width: 2000, height: 1500 };
      const tiles = planSnapshotOverviewTiles(entries, view, 3072, 24);
      const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof view) =>
        a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
      for (const tile of tiles) expect(tile.items).toEqual(entries.filter(entry => overlap(entry.item, tile.box)));
      const rasterIds = new Set(tiles.flatMap(tile => tile.items.map(entry => entry.item.id)));
      for (const entry of entries.filter(entry => overlap(entry.item, view))) expect(rasterIds.has(entry.item.id)).toBe(true);
    }
  });

  it('rejects invalid or impractically large coordinate grids without traversal', () => {
    const entries = [candidate('one')];
    expect(planSnapshotOverviewTiles(entries, { x: 1e30, y: 0, width: 1000, height: 1000 })).toEqual([]);
    expect(planSnapshotOverviewTiles(entries, { x: 0, y: 0, width: 0, height: 1000 })).toEqual([]);
    expect(planSnapshotOverviewTiles(entries, { x: 0, y: 0, width: 1000, height: 1000 }, Infinity)).toEqual([]);
  });
});
