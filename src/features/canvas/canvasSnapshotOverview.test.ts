import { describe, expect, it, vi } from 'vitest';
import type { CanvasImageItem } from '../canvasModel';
import { canvasOverviewWorldPoint, createCanvasOverviewHitIndex, shouldUseCanvasSnapshotOverview } from './canvasSnapshotOverview';

const image = (id: string, x = 0): CanvasImageItem => ({
  id, x, y: 0, width: 100, height: 100,
  item: { id, type: 'image', content: '', createdAt: 1 },
});

describe('low-zoom snapshot overview', () => {
  it('activates overview earlier for dense scenes and uses hysteresis at sparse scales', () => {
    expect(shouldUseCanvasSnapshotOverview(.08, false, 1)).toBe(true);
    expect(shouldUseCanvasSnapshotOverview(.16, false, 10)).toBe(true);
    expect(shouldUseCanvasSnapshotOverview(.45, false, 64)).toBe(true);
    expect(shouldUseCanvasSnapshotOverview(.46, false, 500)).toBe(false);
    expect(shouldUseCanvasSnapshotOverview(.5, true, 500)).toBe(true);
    expect(shouldUseCanvasSnapshotOverview(.54, true, 500)).toBe(true);
    expect(shouldUseCanvasSnapshotOverview(.56, true, 500)).toBe(false);
    expect(shouldUseCanvasSnapshotOverview(.19, true, 1)).toBe(true);
    expect(shouldUseCanvasSnapshotOverview(.21, true, 1)).toBe(false);
    expect(shouldUseCanvasSnapshotOverview(.08, false, 0)).toBe(false);
    for (const scale of [0, -1, NaN, Infinity]) expect(shouldUseCanvasSnapshotOverview(scale, true, 1)).toBe(false);
  });

  it('hit-tests the original stacking order including overlapping live/special nodes', () => {
    const back = image('back');
    const dynamic = { ...image('dynamic'), ai: { type: 'image-generator' as const } };
    const front = image('front');
    const index = createCanvasOverviewHitIndex([back, dynamic, front]);
    expect(index.topAtPoint(50, 50)?.id).toBe('front');
    expect(index.topAtPoint(150, 50)).toBeNull();
    expect(index.topAtPoint(50, 50, item => item.id === 'dynamic')?.id).toBe('dynamic');
    expect(createCanvasOverviewHitIndex([back, dynamic]).topAtPoint(50, 50)?.id).toBe('dynamic');
  });

  it('uses the actual rendered boxes for special nodes and bounds point queries', () => {
    const nodes = Array.from({ length: 1000 }, (_, id) => image(String(id), id * 200));
    const index = createCanvasOverviewHitIndex(nodes, item => ({ ...item, width: item.id === '0' ? 150 : item.width }));
    const selected = vi.fn((item: CanvasImageItem) => item.id === '0');
    expect(index.topAtPoint(140, 50, selected)?.id).toBe('0');
    expect(selected.mock.calls.length).toBeLessThan(10);
  });

  it('maps pointers through the live scale, scroll and zoom offset rather than stale React scale', () => {
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '.08' }));
    const content = { getBoundingClientRect: () => ({ left: -150, top: -200 }) } as HTMLElement;
    expect(canvasOverviewWorldPoint(content, 10, 40, 1)).toEqual({ x: 2000, y: 3000 });
    vi.unstubAllGlobals();
  });
});
