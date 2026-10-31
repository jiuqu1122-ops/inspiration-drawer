import { describe, expect, it } from 'vitest';
import type { SnapshotTile } from './snapshotScene';
import { captureSnapshotTileContent, getSnapshotTileRasterSize, sameSnapshotTileContent, sameSnapshotTileRasterSize } from './snapshotTileRendering';

const tile = (): SnapshotTile => ({
  id: '0:0', box: { x: 0, y: 0, width: 768, height: 768 },
  items: [{ source: 'image.png', item: {
    id: 'image', x: 20, y: 30, width: 100, height: 80,
    item: { id: 'asset', type: 'image', content: '', createdAt: 1 },
  } }],
});

describe('snapshot tile raster size', () => {
  it('keeps the same backing-store dimensions within a quantized zoom tier', () => {
    const box = tile().box;
    const size = getSnapshotTileRasterSize(box, .26, 1, 12_000_000)!;
    for (const scale of [.3, .4, .49, .5]) {
      expect(sameSnapshotTileRasterSize(size, getSnapshotTileRasterSize(box, scale, 1, 12_000_000)!)).toBe(true);
    }
    expect(size).toEqual({ width: 384, height: 384 });
    expect(getSnapshotTileRasterSize(box, .51, 1, 12_000_000)).toEqual({ width: 768, height: 768 });
    expect(getSnapshotTileRasterSize(box, .26, 2, 12_000_000)).toEqual({ width: 768, height: 768 });
  });

  it('strictly respects the pixel budget including rounding, tiny budgets and thin tiles', () => {
    for (const [width, height] of [[768, 768], [801, 97], [1e8, .01], [.01, 1e8]]) {
      for (const budget of [1, 2, 7, 500, 187_500, 375_000, 1_500_000.9]) {
        for (const scale of [.1, .4, .8, 1.4, 4]) {
          const size = getSnapshotTileRasterSize({ x: 0, y: 0, width, height }, scale, 2, budget)!;
          expect(Number.isInteger(size.width) && size.width >= 1).toBe(true);
          expect(Number.isInteger(size.height) && size.height >= 1).toBe(true);
          expect(size.width * size.height).toBeLessThanOrEqual(Math.floor(budget));
        }
      }
    }
  });

  it('caps each backing-store axis for very large adaptive tiles', () => {
    for (const [width, height] of [[3072, 3072], [100_000, 100_000], [100_000, 1], [1, 100_000]]) {
      const size = getSnapshotTileRasterSize({ x: 0, y: 0, width, height }, 3, 3, 100_000_000)!;
      expect(size.width).toBeLessThanOrEqual(4096);
      expect(size.height).toBeLessThanOrEqual(4096);
      expect(size.width * size.height).toBeLessThanOrEqual(100_000_000);
    }
  });

  it('ignores zoom tier changes when the budget already limits the resolution', () => {
    const box = tile().box;
    expect(getSnapshotTileRasterSize(box, .6, 1, 187_500)).toEqual(getSnapshotTileRasterSize(box, 2, 2, 187_500));
  });

  it('rejects invalid bounds/budgets and normalizes invalid scale/DPR without allocating', () => {
    const box = tile().box;
    for (const budget of [0, -1, .5, NaN, Infinity]) expect(getSnapshotTileRasterSize(box, 1, 1, budget)).toBeNull();
    for (const patch of [{ x: NaN }, { y: Infinity }, { width: 0 }, { height: -1 }, { width: Infinity }]) {
      expect(getSnapshotTileRasterSize({ ...box, ...patch }, 1, 1, 1_000_000)).toBeNull();
    }
    expect(getSnapshotTileRasterSize(box, NaN, NaN, 1_000_000)).toEqual({ width: 768, height: 768 });
  });
});

describe('snapshot tile pixel content identity', () => {
  it('compares paint values rather than planned tile/item object identity or metadata', () => {
    const first = tile(), second = tile();
    second.id = 'another-plan';
    second.items[0].item.item.name = 'New label';
    expect(sameSnapshotTileContent(captureSnapshotTileContent(first, false), captureSnapshotTileContent(second, false))).toBe(true);
  });

  it('defaults to tier 512 and invalidates source/tier changes even with the same item object', () => {
    const input = tile(), before = captureSnapshotTileContent(input, false);
    const entry = input.items[0] as SnapshotTile['items'][number] & { maxEdge?: number };
    entry.maxEdge = 512;
    expect(sameSnapshotTileContent(before, captureSnapshotTileContent(input, false))).toBe(true);
    entry.maxEdge = 128;
    expect(sameSnapshotTileContent(before, captureSnapshotTileContent(input, false))).toBe(false);
    entry.maxEdge = undefined;
    entry.source = 'replacement.png';
    expect(sameSnapshotTileContent(before, captureSnapshotTileContent(input, false))).toBe(false);
  });

  it.each(['x', 'y', 'width', 'height'] as const)('invalidates item %s changes without retaining mutable geometry', key => {
    const input = tile(), before = captureSnapshotTileContent(input, false);
    input.items[0].item[key] = (input.items[0].item[key] || 0) + 10;
    expect(sameSnapshotTileContent(before, captureSnapshotTileContent(input, false))).toBe(false);
  });

  it('invalidates theme, background, tile extent, membership and stacking order', () => {
    const input = tile(), before = captureSnapshotTileContent(input, false);
    expect(sameSnapshotTileContent(before, captureSnapshotTileContent(input, true))).toBe(false);
    const rotated = tile(); rotated.items[0].item.rotation = 90;
    expect(sameSnapshotTileContent(before, captureSnapshotTileContent(rotated, false))).toBe(false);
    const generated = tile(); generated.items[0].item.ai = { type: 'generated-image', status: 'success' };
    expect(sameSnapshotTileContent(before, captureSnapshotTileContent(generated, false))).toBe(false);
    const moved = tile(); moved.box.x = -768;
    expect(sameSnapshotTileContent(before, captureSnapshotTileContent(moved, false))).toBe(false);
    const resized = tile(); resized.box.width = 300;
    expect(sameSnapshotTileContent(before, captureSnapshotTileContent(resized, false))).toBe(false);
    const added = tile(); added.items.push({ ...added.items[0], source: 'second.png' });
    expect(sameSnapshotTileContent(before, captureSnapshotTileContent(added, false))).toBe(false);
    const ordered = captureSnapshotTileContent(added, false);
    added.items.reverse();
    expect(sameSnapshotTileContent(ordered, captureSnapshotTileContent(added, false))).toBe(false);
  });
});
