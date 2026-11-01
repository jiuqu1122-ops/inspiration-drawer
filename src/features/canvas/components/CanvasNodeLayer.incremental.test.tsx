import type { ReactElement, ReactNode } from 'react';
import { Children, isValidElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasImageItem } from '../../canvasModel';
import { CanvasNodeLayer } from './CanvasNodeLayer';
import { CanvasSnapshotTile } from './CanvasSnapshotLayer';
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
const fixture = (count: number, tier: number) => {
  const entries = new Map<string, { key: string; width: number; height: number; drawable: CanvasImageSource; bytes: number }>();
  const listeners = new Set<() => void>();
  const add = (source: string, edge: number) => {
    const value = { key: `${edge}:${source}`, width: edge, height: edge, drawable: {} as CanvasImageSource, bytes: edge ** 2 * 4 };
    entries.set(value.key, value); return value;
  };
  const items = Array.from({ length: count }, (_, i) => image(i));
  items.forEach(item => add(item.item.thumbnail!, tier));
  state.cache = {
    peek: (source: string, edge: number) => entries.get(`${edge}:${source}`) || null,
    touch: vi.fn(), request: vi.fn(async (source: string, edge: number) => { const value = add(source, edge); listeners.forEach(listener => listener()); return value; }),
    subscribe: (callback: () => void) => { listeners.add(callback); return () => listeners.delete(callback); },
    dispose: vi.fn(), getStats: () => ({ entries: entries.size, bytes: [...entries.values()].reduce((sum, value) => sum + value.bytes, 0) }),
  };
  const runtime: Runtime = { index: 0, slots: [], effects: [] };
  let nodes = items;
  const ref = { current: nodes };
  const scope = { canvasRenderableItems: nodes, canvasSnapshotViewport: { x: -100, y: -100, width: 30000, height: 4000 },
    canvasSelectedIdsSet: new Set<string>(), canvasSelectedIdsRef: { current: [] }, threeSceneAnalyzingIds: [], canvasRenderScale: .2 };
  const render = (next = nodes) => {
    nodes = next; ref.current = next; scope.canvasRenderableItems = next;
    runtime.index = 0; state.hooks = runtime;
    let tree: ReactElement;
    try { tree = CanvasNodeLayer({ scope, canvasItemsRef: ref }); } finally { state.hooks = null; }
    for (const effect of runtime.effects) if (effect?.changed) { effect.changed = false; effect.cleanup?.(); effect.cleanup = effect.setup(); }
    return { tree: tree!, tiles: collect(tree!, CanvasSnapshotTile), gates: collect(tree!, CanvasNodeRenderGate) };
  };
  const dispose = () => { runtime.effects.forEach(effect => effect?.cleanup?.()); };
  return { render, items, cache: state.cache, dispose };
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); state.hooks = null; });
describe('actual node layer incremental image insertion', () => {
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
