import { describe, expect, it } from 'vitest';
import { layoutCanvasItems, type CanvasAutoLayoutItem } from './canvasAutoLayout';

const overlaps = (
  left: CanvasAutoLayoutItem,
  right: CanvasAutoLayoutItem,
  placements: Map<string, { x: number; y: number }>,
) => {
  const a = { ...left, ...placements.get(left.id)! };
  const b = { ...right, ...placements.get(right.id)! };
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
};

const expectNoOverlaps = (
  items: CanvasAutoLayoutItem[],
  placements: Map<string, { x: number; y: number }>,
) => {
  items.forEach((item, index) => items.slice(index + 1).forEach(other => {
    expect(overlaps(item, other, placements), `${item.id} overlaps ${other.id}`).toBe(false);
  }));
};

describe('canvas auto layout', () => {
  it('uses real item dimensions for an isolated masonry layout', () => {
    const items: CanvasAutoLayoutItem[] = [
      { id: 'portrait', x: 0, y: 0, width: 180, height: 420 },
      { id: 'wide', x: 10, y: 10, width: 420, height: 160 },
      { id: 'square', x: 20, y: 20, width: 240, height: 240 },
      { id: 'short', x: 30, y: 30, width: 220, height: 120 },
    ];
    const result = layoutCanvasItems(items, {
      startX: 80,
      startY: 80,
      maxMasonryColumns: 2,
      maxMasonryWidth: 700,
    });
    expect(result.placements.size).toBe(items.length);
    expectNoOverlaps(items, result.placements);
    expect(result.bounds?.height).toBeLessThan(900);
    expect(result.bounds?.width).toBeLessThanOrEqual(700);
  });

  it('lays out DAG levels from left to right and wraps a tall level into lanes', () => {
    const items: CanvasAutoLayoutItem[] = [
      { id: 'root', x: 0, y: 0, width: 220, height: 160 },
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `middle-${index}`,
        x: 0,
        y: index * 10,
        width: 260,
        height: 220,
        inputs: ['root'],
      })),
      { id: 'result', x: 0, y: 0, width: 300, height: 180, inputs: ['middle-0'] },
    ];
    const result = layoutCanvasItems(items, {
      startX: 80,
      startY: 80,
      maxLayerHeight: 620,
      rowGap: 40,
      columnGap: 80,
    });
    expectNoOverlaps(items, result.placements);
    expect(result.placements.get('middle-0')!.x).toBeGreaterThan(result.placements.get('root')!.x);
    expect(result.placements.get('result')!.x).toBeGreaterThan(result.placements.get('middle-5')!.x);
    const middleXs = new Set(Array.from({ length: 6 }, (_, index) => result.placements.get(`middle-${index}`)!.x));
    expect(middleXs.size).toBeGreaterThan(1);
    middleXs.forEach(x => {
      const lane = items.filter(item => item.id.startsWith('middle-') && result.placements.get(item.id)!.x === x);
      const top = Math.min(...lane.map(item => result.placements.get(item.id)!.y));
      const bottom = Math.max(...lane.map(item => result.placements.get(item.id)!.y + item.height));
      expect(bottom - top).toBeLessThanOrEqual(620);
    });
  });

  it('places isolated media in a masonry section below a connected graph', () => {
    const items: CanvasAutoLayoutItem[] = [
      { id: 'source', x: 0, y: 0, width: 200, height: 160 },
      { id: 'target', x: 0, y: 0, width: 300, height: 220, inputs: ['source'] },
      { id: 'loose-a', x: 0, y: 0, width: 180, height: 360 },
      { id: 'loose-b', x: 0, y: 0, width: 360, height: 180 },
    ];
    const result = layoutCanvasItems(items, { startX: 80, startY: 80, sectionGap: 96 });
    const connectedBottom = Math.max(
      result.placements.get('source')!.y + 160,
      result.placements.get('target')!.y + 220,
    );
    expect(result.placements.get('loose-a')!.y).toBeGreaterThan(connectedBottom);
    expect(result.placements.get('loose-b')!.y).toBeGreaterThan(connectedBottom);
    expectNoOverlaps(items, result.placements);
  });
});
