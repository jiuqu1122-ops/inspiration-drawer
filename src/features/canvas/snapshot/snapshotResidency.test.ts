import { describe, expect, it } from 'vitest';
import type { CanvasImageItem } from '../../canvasModel';
import { createSnapshotBitmapCache } from './snapshotBitmapCache';
import { areCanvasRenderDependenciesEqual } from '../../../components/CanvasNodeRenderGate';
import { canUpdateSnapshotHover, chooseSnapshotMaxEdge, planSnapshotResidency, getSnapshotNodeDependencies, SNAPSHOT_CACHE_BYTES, SNAPSHOT_MAX_RESIDENT_SOURCES, SNAPSHOT_REQUEST_BATCH_SIZE } from './snapshotResidency';
const image = (i: number, source = `thumb-${i}`): CanvasImageItem => ({ id: `n${i}`, x: i * 120, y: 0, width: 100, height: 80,
  item: { id: `a${i}`, type: 'image', content: '', createdAt: 1, thumbnail: source } });
describe('snapshot overview residency', () => {
  it.each([100, 500, 1000])('admits all %i unique images rather than leaving everything after image 80 live', count => {
    const items = Array.from({ length: count }, (_, i) => image(i));
    const plan = planSnapshotResidency(items, null);
    expect(plan.sources.size).toBe(count);
    expect(plan.uniqueCount * plan.maxEdge ** 2 * 4).toBeLessThan(SNAPSHOT_CACHE_BYTES);
  });
  it('counts shared assets once and keeps every instance eligible', () => {
    const plan = planSnapshotResidency(Array.from({ length: 1500 }, (_, i) => image(i, 'shared')), null);
    expect(plan.sources.size).toBe(1500); expect(plan.uniqueCount).toBe(1); expect(plan.maxEdge).toBe(512);
  });
  it('prioritizes current viewport over thousands of offscreen nodes, with a hard entry cap', () => {
    const items = Array.from({ length: 2000 }, (_, i) => image(i));
    const plan = planSnapshotResidency(items, { x: 1998 * 120, y: 0, width: 300, height: 100 });
    expect(plan.sources.has('n1999')).toBe(true); expect(plan.uniqueCount).toBe(SNAPSHOT_MAX_RESIDENT_SOURCES);
    expect(plan.sources.has('n1500')).toBe(false);
  });
  it('uses hysteresis at both density thresholds', () => {
    expect(chooseSnapshotMaxEdge(81, 512)).toBe(256);
    expect(chooseSnapshotMaxEdge(79, 256)).toBe(256);
    expect(chooseSnapshotMaxEdge(56, 256)).toBe(512);
    expect(chooseSnapshotMaxEdge(257, 256)).toBe(128);
    expect(chooseSnapshotMaxEdge(255, 128)).toBe(128);
    expect(chooseSnapshotMaxEdge(192, 128)).toBe(256);
  });
  it('does not re-render cached hitboxes on 300 continuous zoom steps', () => {
    const item = image(0), bitmap = {};
    const initial = getSnapshotNodeDependencies(item, false, true, bitmap, 'src', 512, 1);
    for (let i = 0; i < 300; i++) expect(areCanvasRenderDependenciesEqual(initial,
      getSnapshotNodeDependencies(item, false, true, bitmap, 'src', 512, .1 + i / 100))).toBe(true);
  });
  it('updates live preview only when its quality threshold changes, or data/selection changes', () => {
    const item = image(0), bitmap = {};
    const deps = (scale: number, selected = false, node = item) => getSnapshotNodeDependencies(node, selected, false, bitmap, 'src', 128, scale);
    expect(areCanvasRenderDependenciesEqual(deps(.5), deps(.6))).toBe(true);
    expect(areCanvasRenderDependenciesEqual(deps(.5), deps(2))).toBe(false);
    expect(areCanvasRenderDependenciesEqual(deps(.5), deps(.5, true))).toBe(false);
    expect(areCanvasRenderDependenciesEqual(deps(.5), deps(.5, false, { ...item, x: 1 }))).toBe(false);
  });
});

describe('bounded overview cache warmup', () => {
  it.each([100, 500, 1000])('keeps every one of %i admitted images resident after bounded decode batches', async count => {
    const plan = planSnapshotResidency(Array.from({ length: count }, (_, i) => image(i)), null);
    let decoded = 0;
    const cache = createSnapshotBitmapCache({ concurrency: 2, maxEntries: SNAPSHOT_MAX_RESIDENT_SOURCES,
      maxBytes: SNAPSHOT_CACHE_BYTES, maxPendingRequests: SNAPSHOT_REQUEST_BATCH_SIZE,
      decode: async (_source, edge) => { decoded++; return { drawable: {} as CanvasImageSource, width: edge, height: edge }; },
    });
    try {
      const sources = [...plan.sources.values()];
      for (let i = 0; i < sources.length; i += SNAPSHOT_REQUEST_BATCH_SIZE) {
        const results = await Promise.all(sources.slice(i, i + SNAPSHOT_REQUEST_BATCH_SIZE).map(source => cache.request(source, plan.maxEdge)));
        expect(results.every(Boolean)).toBe(true);
      }
      expect(decoded).toBe(count); expect(cache.getStats().entries).toBe(count);
      expect(cache.getStats().bytes).toBeLessThanOrEqual(SNAPSHOT_CACHE_BYTES);
      for (const source of sources) expect(cache.peek(source, plan.maxEdge)).not.toBeNull();
      await Promise.all(sources.map(source => cache.request(source, plan.maxEdge)));
      expect(decoded).toBe(count);
    } finally { cache.dispose(); }
  });
});


describe('snapshot hover during selected-image zoom', () => {
  it('does not rebuild raster membership as scaled nodes cross a stationary pointer', () => {
    let zooming = true;
    const host = { closest: () => ({ hasAttribute: (name: string) => name === 'data-canvas-zooming' && zooming }) } as unknown as Element;
    for (let i = 0; i < 300; i++) expect(canUpdateSnapshotHover(host)).toBe(false);
    zooming = false; expect(canUpdateSnapshotHover(host)).toBe(true);
    expect(canUpdateSnapshotHover(null)).toBe(true);
  });
});
