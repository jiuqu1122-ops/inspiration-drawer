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

  it('keeps reference inputs, a generator, and copied outputs in one compact work unit', () => {
    const references: CanvasAutoLayoutItem[] = Array.from({ length: 7 }, (_, index) => ({
      id: `reference-${index}`,
      x: index * 10,
      y: index * 10,
      width: index % 2 === 0 ? 180 : 240,
      height: index % 3 === 0 ? 260 : 180,
    }));
    const generator: CanvasAutoLayoutItem = {
      id: 'generator',
      x: 0,
      y: 0,
      width: 360,
      height: 520,
      inputs: references.map(item => item.id),
      layoutRole: 'generator',
    };
    const outputs: CanvasAutoLayoutItem[] = Array.from({ length: 3 }, (_, index) => ({
      id: `output-${index}`,
      x: 0,
      y: 0,
      width: 220,
      height: 220,
      layoutRole: 'output',
      outputOf: generator.id,
    }));
    const items = [...references, generator, ...outputs];
    const result = layoutCanvasItems(items, { startX: 80, startY: 80 });
    const generatorPosition = result.placements.get(generator.id)!;
    const referenceRight = Math.max(...references.map(item => (
      result.placements.get(item.id)!.x + item.width
    )));
    const outputLeft = Math.min(...outputs.map(item => result.placements.get(item.id)!.x));

    expect(referenceRight).toBeLessThan(generatorPosition.x);
    expect(outputLeft).toBeGreaterThan(generatorPosition.x + generator.width);
    expect(new Set(references.map(item => result.placements.get(item.id)!.x)).size).toBe(3);
    expectNoOverlaps(items, result.placements);
  });

  it('wraps multiple generator work units into balanced rows and columns', () => {
    const items: CanvasAutoLayoutItem[] = [];
    for (let groupIndex = 0; groupIndex < 6; groupIndex += 1) {
      const inputIds = Array.from({ length: 2 }, (_, inputIndex) => `g${groupIndex}-ref-${inputIndex}`);
      inputIds.forEach((id, inputIndex) => items.push({
        id,
        x: groupIndex * 30,
        y: inputIndex * 30,
        width: 180,
        height: 180,
      }));
      items.push({
        id: `generator-${groupIndex}`,
        x: groupIndex * 20,
        y: groupIndex * 20,
        width: 300,
        height: 320,
        inputs: inputIds,
        layoutRole: 'generator',
      });
    }

    const result = layoutCanvasItems(items, {
      startX: 80,
      startY: 80,
      maxGroupColumns: 3,
    });
    const generatorPositions = Array.from({ length: 6 }, (_, index) => (
      result.placements.get(`generator-${index}`)!
    ));
    const distinctXs = new Set(generatorPositions.map(position => position.x));
    const distinctYs = new Set(generatorPositions.map(position => position.y));

    expect(distinctXs.size).toBeGreaterThan(1);
    expect(distinctXs.size).toBeLessThanOrEqual(3);
    expect(distinctYs.size).toBeGreaterThan(1);
    expect(result.bounds!.width / result.bounds!.height).toBeLessThan(3);
    expectNoOverlaps(items, result.placements);
  });

  it('places a shared reference once while keeping both generator groups valid', () => {
    const items: CanvasAutoLayoutItem[] = [
      { id: 'shared', x: 0, y: 0, width: 220, height: 220 },
      {
        id: 'generator-a',
        x: 0,
        y: 0,
        width: 320,
        height: 360,
        inputs: ['shared'],
        layoutRole: 'generator',
      },
      {
        id: 'generator-b',
        x: 0,
        y: 0,
        width: 320,
        height: 360,
        inputs: ['shared'],
        layoutRole: 'generator',
      },
    ];
    const result = layoutCanvasItems(items, { startX: 80, startY: 80 });

    expect(result.placements.size).toBe(items.length);
    expect(result.placements.get('shared')!.x).toBeLessThan(result.placements.get('generator-a')!.x);
    expectNoOverlaps(items, result.placements);
  });
});
