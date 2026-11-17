import type { ReactElement, ReactNode } from 'react';
import { Children, isValidElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasImageItem } from '../../canvasModel';
import { CanvasNodeLayer } from './CanvasNodeLayer';
import { CanvasSnapshotTile } from './CanvasSnapshotLayer';
import { getSnapshotTileRasterSize } from '../snapshot/snapshotTileRendering';
import { SNAPSHOT_TOTAL_TILE_PIXELS } from '../snapshot/snapshotTileBudgets';
import { CanvasNodeRenderGate, areCanvasRenderDependenciesEqual } from '../../../components/CanvasNodeRenderGate';
type Effect = { setup: () => void | (() => void); deps?: readonly unknown[]; changed: boolean; cleanup?: void | (() => void) };
type Runtime = { index: number; slots: any[]; effects: Effect[] };
const state = vi.hoisted(() => ({ hooks: null as Runtime | null, cache: null as any }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useRef: (initial: unknown) => { const h = state.hooks!, i = h.index++; return h.slots[i] ??= { current: initial }; },
  useState: (initial: unknown) => {
    const h = state.hooks!, i = h.index++; h.slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
    return [h.slots[i].value, (update: any) => { h.slots[i].value = typeof update === 'function' ? update(h.slots[i].value) : update; }];
  },
  useMemo: (factory: () => unknown, deps: readonly unknown[]) => {
    const h = state.hooks!, i = h.index++, old = h.slots[i];
    if (!old || deps.some((value, index) => !Object.is(old.deps[index], value))) h.slots[i] = { deps, value: factory() };
    return h.slots[i].value;
  },
  useCallback: (callback: unknown, deps: readonly unknown[]) => {
    const h = state.hooks!, i = h.index++, old = h.slots[i];
    if (!old || deps.some((value, index) => !Object.is(old.deps[index], value))) h.slots[i] = { deps, value: callback };
    return h.slots[i].value;
  },
  ...Object.fromEntries(['useEffect', 'useLayoutEffect'].map(name => [name, (setup: Effect['setup'], deps?: readonly unknown[]) => {
    const h = state.hooks!, i = h.index++, old = h.effects[i];
    h.effects[i] = { setup, deps, cleanup: old?.cleanup, changed: !old || !deps || deps.some((value, index) => !Object.is(old.deps?.[index], value)) };
  }])),
}));
vi.mock('../snapshot/snapshotBitmapCache', () => ({ createSnapshotBitmapCache: () => state.cache }));
const image = (i: number): CanvasImageItem => ({ id: `n${i}`, x: i % 40 * 120, y: Math.floor(i / 40) * 100, width: 100, height: 80,
  item: { id: `a${i}`, type: 'image', content: '', createdAt: 1, thumbnail: `thumb-${i}` } });
const collect = (tree: ReactElement, type: unknown): ReactElement<any>[] => {
  const result: ReactElement<any>[] = [];
  for (const child of Children.toArray((tree.props as { children?: ReactNode }).children)) {
    if (!isValidElement(child)) continue;
    if (child.type === type) result.push(child as ReactElement<any>);
  }
  return result;
};
const fixture = (count: number, tier: number, initiallyWarm = true) => {
  const entries = new Map<string, { key: string; width: number; height: number; drawable: CanvasImageSource; bytes: number }>();
  const listeners = new Set<() => void>();
  const add = (source: string, edge: number) => {
    const value = { key: `${edge}:${source}`, width: edge, height: edge, drawable: {} as CanvasImageSource, bytes: edge ** 2 * 4 };
    entries.set(value.key, value); return value;
  };
  const items = Array.from({ length: count }, (_, i) => image(i));
  if (initiallyWarm) items.forEach(item => add(item.item.thumbnail!, tier));
  state.cache = {
    peek: (source: string, edge: number) => entries.get(`${edge}:${source}`) || null,
    touch: vi.fn(), prioritize: vi.fn(), request: vi.fn(async (source: string, edge: number) => { const value = add(source, edge); listeners.forEach(listener => listener()); return value; }),
    subscribe: (callback: () => void) => { listeners.add(callback); return () => listeners.delete(callback); },
    dispose: vi.fn(), getStats: () => ({ entries: entries.size, bytes: [...entries.values()].reduce((sum, value) => sum + value.bytes, 0) }),
  };
  const runtime: Runtime = { index: 0, slots: [], effects: [] };
  let nodes = items;
  let documentItems = items;
  const ref = { current: nodes };
  const scope = { canvasItems: documentItems, canvasRenderableItems: nodes, canvasSnapshotViewport: { x: -100, y: -100, width: 30000, height: 4000 },
    canvasSelectedIdsSet: new Set<string>(), canvasSelectedIdsRef: { current: [] }, threeSceneAnalyzingIds: [], canvasRenderScale: .6,
    canvasTextAgentRunningIds: [], canvasAiExpandedOutputNodeIds: new Set<string>(), canvasAgent: { settings: {} } };
  const render = (next = nodes, fullDocument = next) => {
    nodes = next; documentItems = fullDocument; ref.current = next; scope.canvasItems = fullDocument; scope.canvasRenderableItems = next;
    runtime.index = 0; state.hooks = runtime;
    let tree: ReactElement;
    try { tree = CanvasNodeLayer({ scope, canvasItemsRef: ref }); } finally { state.hooks = null; }
    for (const effect of runtime.effects) if (effect?.changed) { effect.changed = false; effect.cleanup?.(); effect.cleanup = effect.setup(); }
    return { tree: tree!, tiles: collect(tree!, CanvasSnapshotTile), gates: collect(tree!, CanvasNodeRenderGate) };
  };
  const dispose = () => { runtime.effects.forEach(effect => effect?.cleanup?.()); };
  return { render, items, scope, cache: state.cache, dispose };
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); state.hooks = null; });
describe('actual node layer incremental image insertion', () => {
  it('retains distant world tiles when rapid culling changes the first image in a run', () => {
    const f = fixture(80, 512); const before = f.render();
    const after = f.render(f.items.filter(item => item.x > 500));
    let matched = 0;
    for (const oldTile of before.tiles) {
      // Only cells whose complete content survives the cull can be reused.
      if (oldTile.props.tile.items.some((entry: any) => entry.item.x <= 500)) continue;
      const tile = after.tiles.find(candidate => candidate.props.tile.id === oldTile.props.tile.id);
      if (!tile) continue;
      expect(tile.key).toBe(oldTile.key); expect(tile.props.tile).toBe(oldTile.props.tile);
      expect(tile.props.pixelBudget).toBe(oldTile.props.pixelBudget); matched++;
    }
    expect(matched).toBeGreaterThan(0); f.dispose();
  });

  it('stages a dense overview without dropping source nodes before their tiles are admitted', async () => {
    const f = fixture(500, 128);
    const liveScale = { current: .08 };
    Object.assign(f.scope, { canvasLiveScaleRef: liveScale });
    const before = f.render();
    expect(before.gates.length).toBe(500);
    await vi.advanceTimersByTimeAsync(5);
    const overview = f.render();
    expect(overview.tiles.length).toBeGreaterThan(0);
    expect(overview.gates).toHaveLength(0);
    const oldTiles = overview.tiles.map(tile => tile.props.tile);
    f.scope.canvasSnapshotViewport = { x: 1000, y: 1000, width: 1000, height: 1000 };
    const panned = f.render(f.items.slice(0, 5), f.items);
    expect(panned.gates).toHaveLength(0);
    expect(panned.tiles.length).toBeGreaterThan(0);
    for (const tile of panned.tiles) {
      const previous = oldTiles.find(candidate => candidate.id === tile.props.tile.id);
      expect(tile.props.tile).toBe(previous);
    }
    f.dispose();
  });

  it('spends overview pixels on the current view, not a mostly empty giant canvas', async () => {
    const f = fixture(500, 128);
    Object.assign(f.scope, { canvasLiveScaleRef: { current: .08 },
      canvasSnapshotOverviewSize: { width: 1_000_000, height: 1_000_000 } });
    f.scope.canvasSnapshotViewport = { x: -100, y: -100, width: 6000, height: 4000 };
    f.render(); await vi.advanceTimersByTimeAsync(20);
    const overview = f.render();
    expect(overview.tiles.length).toBeGreaterThan(0);
    let pixels = 0;
    for (const tile of overview.tiles) {
      expect(tile.props.tile.box.width).toBeLessThanOrEqual(12288);
      const size = getSnapshotTileRasterSize(tile.props.tile.box, .08, 1.5, tile.props.pixelBudget)!;
      const physicalDensity = size.width / (tile.props.tile.box.width * .08 * 1.5);
      expect(physicalDensity).toBeGreaterThanOrEqual(.75);
      pixels += size.width * size.height;
    }
    expect(pixels).toBeLessThanOrEqual(SNAPSHOT_TOTAL_TILE_PIXELS);
    f.dispose();
  });

  it('inserts a new special node into the overview without replacing unchanged image tiles', async () => {
    const f = fixture(500, 128);
    Object.assign(f.scope, { canvasLiveScaleRef: { current: .08 } });
    f.render(); await vi.advanceTimersByTimeAsync(20);
    const before = f.render();
    const added = { ...image(501), item: { ...image(501).item, type: 'text' as const, content: 'new text' } };
    const after = f.render([...f.items, added]);
    expect(after.gates).toHaveLength(1);
    expect(after.gates[0].key).toContain(added.id);
    expect(after.tiles).toHaveLength(before.tiles.length);
    for (let index = 0; index < before.tiles.length; index++) {
      expect(after.tiles[index].key).toBe(before.tiles[index].key);
      expect(after.tiles[index].props.tile).toBe(before.tiles[index].props.tile);
      expect(after.tiles[index].props.pixelBudget).toBe(before.tiles[index].props.pixelBudget);
    }
    expect(f.cache.request).not.toHaveBeenCalled();
    f.dispose();
  });

  it('prewarms the full document cache while rendering only the small current viewport', async () => {
    const f = fixture(500, 128, false);
    const visible = f.items.slice(0, 12);
    f.scope.canvasSnapshotViewport = { x: -100, y: -100, width: 1600, height: 500 };
    const rendered = f.render(visible, f.items);
    const host = Children.toArray((rendered.tree.props as { children?: ReactNode }).children)
      .find(child => isValidElement(child) && (child.props as Record<string, unknown>)['data-canvas-snapshot-host'] === 'true') as ReactElement<any> | undefined;
    expect(host?.props['data-snapshot-source-count']).toBe(500);
    expect(rendered.gates).toHaveLength(12);
    const priorityCalls = f.cache.prioritize.mock.calls;
    const priority = priorityCalls[priorityCalls.length - 1][0] as string[];
    expect(priority).toContain('thumb-0');
    expect(priority).not.toContain('thumb-499');
    await vi.advanceTimersByTimeAsync(500);
    expect(f.cache.request).toHaveBeenCalledTimes(500);
    expect(f.cache.request.mock.calls[0][0]).toBe('thumb-0');
    for (const item of f.items) expect(f.cache.peek(item.item.thumbnail!, 128)).not.toBeNull();
    f.dispose();
  });

  it.each([[80, 512, 256], [256, 256, 128], [500, 128, 128]])('inserting after %i images only decodes the new source, preserving all old gates and distant tiles', async (count, tier, nextTier) => {
    const f = fixture(count, tier);
    const before = f.render(); await vi.advanceTimersByTimeAsync(1);
    expect(f.cache.request).not.toHaveBeenCalled();
    const added = { ...image(count), x: 23000, y: 200 };
    const changed = f.render([...f.items, added]);
    for (let i = 0; i < count; i++) expect(areCanvasRenderDependenciesEqual(before.gates[i].props.dependencies, changed.gates[i].props.dependencies)).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    const after = f.render();
    expect(f.cache.request).toHaveBeenCalledExactlyOnceWith(`thumb-${count}`, nextTier);
    for (let i = 0; i < count; i++) expect(areCanvasRenderDependenciesEqual(before.gates[i].props.dependencies, after.gates[i].props.dependencies)).toBe(true);
    for (const tile of before.tiles) {
      const retained = after.tiles.find(candidate => candidate.key === tile.key);
      expect(retained).toBeDefined(); expect(retained!.props.tile).toBe(tile.props.tile);
      expect(retained!.props.pixelBudget).toBe(tile.props.pixelBudget);
    }
    f.dispose();
  });
});
