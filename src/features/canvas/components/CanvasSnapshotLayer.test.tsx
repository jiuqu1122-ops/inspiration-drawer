import type { ReactElement, RefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SnapshotBitmapCache, SnapshotBitmapLease } from '../snapshot/snapshotBitmapCache';
import type { SnapshotTile } from '../snapshot/snapshotScene';
import { CanvasSnapshotTile } from './CanvasSnapshotLayer';

type Effect = { setup: () => void | (() => void); deps?: readonly unknown[]; cleanup?: void | (() => void); changed: boolean };
type HookRuntime = { index: number; refs: Array<RefObject<unknown>>; effects: Effect[] };
const hooks = vi.hoisted(() => ({ current: null as HookRuntime | null }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useRef: (initial: unknown) => {
    const runtime = hooks.current!;
    const index = runtime.index++;
    return runtime.refs[index] ??= { current: initial };
  },
  useLayoutEffect: (setup: Effect['setup'], deps?: readonly unknown[]) => {
    const runtime = hooks.current!;
    const index = runtime.index++;
    const previous = runtime.effects[index];
    const changed = !previous || !deps || !previous.deps || deps.length !== previous.deps.length
      || deps.some((value, i) => !Object.is(value, previous.deps![i]));
    runtime.effects[index] = { setup, deps, cleanup: previous?.cleanup, changed };
  },
}));

type Props = Parameters<typeof CanvasSnapshotTile>[0];
const makeTile = (id = '0:0'): SnapshotTile => ({
  id, box: { x: 0, y: 0, width: 768, height: 768 },
  items: [{ source: 'one.png', item: { id: 'image', x: 20, y: 30, width: 100, height: 80,
    item: { id: 'asset', type: 'image', content: '', createdAt: 1 } } }],
});

const makeCache = () => {
  const releases: ReturnType<typeof vi.fn>[] = [];
  const pin = vi.fn((_source: string, _maxEdge?: number): SnapshotBitmapLease | null => {
    const release = vi.fn(); releases.push(release);
    return { bitmap: { key: 'key', drawable: {} as CanvasImageSource, width: 100, height: 80, bytes: 32_000 }, release };
  });
  return { cache: { pin } as unknown as SnapshotBitmapCache, pin, releases };
};

const mounted = new Set<ReturnType<typeof mountTile>>();
function mountTile(overrides: Partial<Props> = {}) {
  const cached = makeCache();
  let props: Props = { tile: makeTile(), cache: cached.cache, scale: .4, dark: false, pixelBudget: 12_000_000, onFailure: vi.fn(), ...overrides };
  const runtime: HookRuntime = { index: 0, refs: [], effects: [] };
  const context = {
    setTransform: vi.fn(), clearRect: vi.fn(), fillRect: vi.fn(), save: vi.fn(), restore: vi.fn(),
    translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn(), fillStyle: '',
  };
  const surface = { hasAttribute: vi.fn(() => zooming) };
  let zooming = false, width = 1, height = 1;
  const allocations: Array<[number, number]> = [];
  const canvas = {
    dataset: {} as Record<string, string>,
    get width() { return width; }, set width(value: number) { width = value; allocations.push([width, height]); },
    get height() { return height; }, set height(value: number) { height = value; allocations.push([width, height]); },
    getContext: vi.fn(() => context), closest: vi.fn(() => surface),
  };
  const render = () => {
    runtime.index = 0;
    hooks.current = runtime;
    let tree: ReactElement<{ ref: RefObject<HTMLCanvasElement | null> }>;
    try {
      // memo() normally wraps this render; call it directly to commit every scale
      // update and exercise the actual component effects, without any DOM package.
      const component = CanvasSnapshotTile as unknown as { type: (input: Props) => typeof tree };
      tree = component.type(props);
    } finally { hooks.current = null; }
    tree.props.ref.current = canvas as unknown as HTMLCanvasElement;
    for (const effect of runtime.effects) {
      if (!effect?.changed) continue;
      effect.cleanup?.();
      effect.cleanup = effect.setup();
      effect.changed = false;
    }
  };
  const harness = {
    cached, context, canvas, allocations,
    get props() { return props; },
    get drawCount() { return Number(canvas.dataset.snapshotDrawCount || 0); },
    setZooming(value: boolean) { zooming = value; },
    update(patch: Partial<Props>) { props = { ...props, ...patch }; render(); },
    replayEffects() {
      for (const effect of runtime.effects) effect?.cleanup?.();
      for (const effect of runtime.effects) if (effect) effect.cleanup = effect.setup();
    },
    unmount() {
      for (const ref of runtime.refs) if (ref?.current === canvas) ref.current = null;
      for (const effect of runtime.effects) effect?.cleanup?.();
      mounted.delete(harness);
    },
  };
  render();
  mounted.add(harness);
  return harness;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  vi.stubGlobal('getComputedStyle', vi.fn(() => { throw new Error('Unexpected synchronous style read'); }));
});
afterEach(() => {
  for (const harness of mounted) harness.unmount();
  expect(vi.getTimerCount()).toBe(0);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('CanvasSnapshotTile actual effect hot path (deterministic hook commits)', () => {
  it('does not repaint, allocate, pin or read styles in 300 same-tier scale commits', () => {
    const h = mountTile();
    const allocations = h.allocations.length;
    for (let i = 0; i < 300; i++) h.update({ scale: .251 + i / 1500 });
    expect(h.drawCount).toBe(1);
    expect(h.context.clearRect).toHaveBeenCalledTimes(1);
    expect(h.canvas.getContext).toHaveBeenCalledTimes(1);
    expect(h.allocations).toHaveLength(allocations);
    expect(h.cached.pin).toHaveBeenCalledTimes(1);
    expect(h.cached.releases[0]).toHaveBeenCalledOnce();
    expect(h.canvas.closest).not.toHaveBeenCalled();
    expect(getComputedStyle).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps old pixels across a tier boundary, coalesces updates and distributes tiles over separate turns', () => {
    const tiles = Array.from({ length: 12 }, (_, i) => mountTile({ tile: makeTile(String(i)) }));
    const allocations = tiles.map(h => h.allocations.length);
    for (const h of tiles) h.update({ scale: .6 });
    expect(tiles.map(h => h.drawCount)).toEqual(Array(12).fill(1));
    expect(tiles.map(h => h.allocations.length)).toEqual(allocations);
    expect(tiles.map(h => h.canvas.width)).toEqual(Array(12).fill(384));
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(149);
    // A same-tier update during the gesture postpones the entire shared queue.
    for (const h of tiles) h.update({ scale: .7 });
    vi.advanceTimersByTime(149);
    expect(tiles.every(h => h.drawCount === 1)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(tiles.filter(h => h.drawCount === 2)).toHaveLength(1);
    vi.advanceTimersByTime(15);
    expect(tiles.filter(h => h.drawCount === 2)).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(tiles.filter(h => h.drawCount === 2)).toHaveLength(2);
    vi.advanceTimersByTime(16 * 10);
    expect(tiles.map(h => h.drawCount)).toEqual(Array(12).fill(2));
    expect(tiles.map(h => h.canvas.width)).toEqual(Array(12).fill(768));
    expect(tiles.every(h => h.cached.releases.every(release => release.mock.calls.length === 1))).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a pending resolution change when zoom reverses into the painted tier', () => {
    const h = mountTile();
    const allocations = h.allocations.length;
    h.update({ scale: .7 });
    vi.advanceTimersByTime(80);
    h.update({ scale: .45 });
    vi.advanceTimersByTime(1000);
    expect(h.drawCount).toBe(1);
    expect(h.allocations).toHaveLength(allocations);
    expect(h.cached.pin).toHaveBeenCalledOnce();
  });

  it('coalesces multiple crossed tiers to the latest resolution instead of replaying stale work', () => {
    const h = mountTile();
    h.update({ scale: .7 });
    vi.advanceTimersByTime(100);
    h.update({ scale: 1.3 });
    vi.advanceTimersByTime(149);
    expect(h.drawCount).toBe(1);
    vi.advanceTimersByTime(1);
    expect(h.drawCount).toBe(2);
    expect(h.canvas.width).toBe(1152);
    expect(h.cached.pin).toHaveBeenCalledTimes(2);
  });

  it('waits for live zoom metadata even if React scale commits have already stopped', () => {
    const h = mountTile();
    h.setZooming(true);
    h.update({ scale: .7 });
    vi.advanceTimersByTime(600);
    expect(h.drawCount).toBe(1);
    expect(h.cached.pin).toHaveBeenCalledOnce();
    expect(getComputedStyle).not.toHaveBeenCalled();
    h.setZooming(false);
    vi.advanceTimersByTime(150);
    expect(h.drawCount).toBe(2);
    expect(h.canvas.width).toBe(768);
  });

  it('uses cancellable browser idle work when available, still only one tile per turn', () => {
    let callback: IdleRequestCallback | null = null;
    const requestIdleCallback = vi.fn((run: IdleRequestCallback) => { callback = run; return 7; });
    const cancelIdleCallback = vi.fn(() => { callback = null; });
    Object.assign(window, { requestIdleCallback, cancelIdleCallback });
    const first = mountTile(), second = mountTile();
    first.update({ scale: .7 }); second.update({ scale: .7 });
    vi.advanceTimersByTime(150);
    expect(requestIdleCallback).toHaveBeenCalledOnce();
    expect(first.drawCount + second.drawCount).toBe(2);
    const run = callback! as IdleRequestCallback;
    run({ didTimeout: false, timeRemaining: () => 50 });
    expect(first.drawCount + second.drawCount).toBe(3);
    vi.advanceTimersByTime(16);
    expect(requestIdleCallback).toHaveBeenCalledTimes(2);
    first.unmount(); second.unmount();
    expect(cancelIdleCallback).toHaveBeenCalledWith(7);
    expect(callback).toBeNull();
  });

  it('paints new source/tier content immediately at the old resolution, then upgrades only latest content', () => {
    const h = mountTile();
    const allocations = h.allocations.length;
    h.update({ scale: .7 });
    const changed = makeTile();
    changed.items[0] = { ...changed.items[0], source: 'replacement.png', maxEdge: 128 };
    h.update({ tile: changed });
    expect(h.drawCount).toBe(2);
    expect(h.allocations).toHaveLength(allocations);
    expect(h.cached.pin).toHaveBeenLastCalledWith('replacement.png', 128);
    vi.advanceTimersByTime(150);
    expect(h.drawCount).toBe(3);
    expect(h.cached.pin).toHaveBeenLastCalledWith('replacement.png', 128);
    expect(h.cached.pin.mock.calls.map(([source]) => source)).toEqual(['one.png', 'replacement.png', 'replacement.png']);
    expect(h.canvas.width).toBe(768);
  });

  it('invalidates tier-only changes and defaults unspecified maxEdge to 512', () => {
    const h = mountTile();
    expect(h.cached.pin).toHaveBeenLastCalledWith('one.png', 512);
    const changed = makeTile(); changed.items[0].maxEdge = 256;
    h.update({ tile: changed });
    expect(h.drawCount).toBe(2);
    expect(h.cached.pin).toHaveBeenLastCalledWith('one.png', 256);
    h.update({ tile: { ...changed, items: [{ ...changed.items[0], maxEdge: 128 }] } });
    expect(h.drawCount).toBe(3);
    expect(h.cached.pin).toHaveBeenLastCalledWith('one.png', 128);
  });

  it('does not repaint equal planned content or a changed failure callback, but uses the newest callback on failure', () => {
    const h = mountTile();
    const onFailure = vi.fn();
    h.update({ tile: makeTile(), onFailure, scale: .7 });
    expect(h.drawCount).toBe(1);
    h.cached.pin.mockReturnValueOnce(null);
    vi.advanceTimersByTime(150);
    expect(onFailure).toHaveBeenCalledOnce();
    expect(h.props.onFailure).toBe(onFailure);
    expect(h.drawCount).toBe(1);
  });

  it('updates theme/geometry/stacking changes synchronously, including during active zoom', () => {
    const h = mountTile(); h.setZooming(true);
    h.update({ dark: true });
    expect(h.drawCount).toBe(2);
    expect(h.context.fillStyle).toBe('rgba(28,25,23,.88)');
    const moved = makeTile(); moved.items[0].item.x = 50;
    h.update({ tile: moved });
    expect(h.drawCount).toBe(3);
    expect(h.context.fillRect).toHaveBeenLastCalledWith(50, 30, 100, 80);
    const added = makeTile(); added.items.push({ ...added.items[0], source: 'two.png' });
    h.update({ tile: added });
    expect(h.drawCount).toBe(4);
    const reversed = { ...added, items: [...added.items].reverse() };
    h.update({ tile: reversed });
    expect(h.drawCount).toBe(5);
    expect(h.cached.pin.mock.calls.slice(-2).map(([source]) => source)).toEqual(['two.png', 'one.png']);
  });

  it('immediately enforces reduced per-tile/global budgets rather than retaining oversize old pixels', () => {
    const tiles = Array.from({ length: 24 }, () => mountTile({ scale: 1.2, pixelBudget: 1_500_000 }));
    for (const h of tiles) { h.setZooming(true); h.update({ pixelBudget: Math.floor(12_000_000 / 64) }); }
    expect(tiles.every(h => h.drawCount === 2 && h.canvas.width * h.canvas.height <= 187_500)).toBe(true);
    expect(tiles.reduce((sum, h) => sum + h.canvas.width * h.canvas.height, 0)).toBeLessThanOrEqual(12_000_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps very large adaptive backing stores within budget and single-axis limits', () => {
    const input = makeTile(); input.box.width = 100_000; input.box.height = 100_000;
    const h = mountTile({ tile: input, scale: 10, pixelBudget: 12_000_000 });
    expect(h.canvas.width * h.canvas.height).toBeLessThanOrEqual(12_000_000);
    expect(h.canvas.width).toBeLessThanOrEqual(4096);
    expect(h.canvas.height).toBeLessThanOrEqual(4096);
    const wide = { ...input, box: { ...input.box, height: 1 } };
    h.update({ tile: wide });
    vi.advanceTimersByTime(150);
    expect(h.canvas.width).toBe(4096);
    expect(h.canvas.height).toBe(1);
    expect(h.allocations.every(([width, height]) => width * height <= 12_000_000)).toBe(true);
  });

  it('does not repaint budget-capped zoom or DPR changes until the actual target size changes', () => {
    const h = mountTile({ scale: .7, pixelBudget: 187_500 });
    h.update({ scale: 2 });
    Object.assign(window, { devicePixelRatio: 2 }); h.update({ scale: 3 });
    expect(h.drawCount).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases all pins on missing sources before clearing or reallocating visible pixels', () => {
    const h = mountTile();
    const next = makeTile(); next.items.push({ ...next.items[0], source: 'missing.png' });
    h.cached.pin.mockImplementationOnce(() => {
      const release = vi.fn(); h.cached.releases.push(release);
      return { bitmap: { key: 'key', drawable: {} as CanvasImageSource, width: 100, height: 80, bytes: 32_000 }, release };
    }).mockReturnValueOnce(null);
    h.update({ tile: next });
    expect(h.props.onFailure).toHaveBeenCalledOnce();
    expect(h.context.clearRect).toHaveBeenCalledTimes(1);
    expect(h.cached.releases.every(release => release.mock.calls.length === 1)).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(h.cached.pin).toHaveBeenCalledTimes(3);
  });

  it('releases leases and reports drawing/context exceptions in synchronous and deferred paths', () => {
    const h = mountTile();
    h.context.drawImage.mockImplementationOnce(() => { throw new Error('GPU'); });
    h.update({ dark: true });
    expect(h.props.onFailure).toHaveBeenCalledOnce();
    expect(h.cached.releases.every(release => release.mock.calls.length === 1)).toBe(true);
    h.update({ dark: false });
    h.update({ scale: .7 });
    h.canvas.getContext.mockImplementationOnce(() => { throw new Error('lost context'); });
    vi.advanceTimersByTime(150);
    expect(h.props.onFailure).toHaveBeenCalledTimes(2);
    expect(h.cached.releases.every(release => release.mock.calls.length === 1)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses the replacement cache immediately and does not hold any leases while queued', () => {
    const h = mountTile(); const next = makeCache();
    h.update({ scale: .7 });
    expect(h.cached.releases.every(release => release.mock.calls.length === 1)).toBe(true);
    h.update({ cache: next.cache });
    expect(next.pin).toHaveBeenCalledOnce();
    expect(h.drawCount).toBe(2);
    vi.advanceTimersByTime(150);
    expect(next.pin).toHaveBeenCalledTimes(2);
    expect(next.releases.every(release => release.mock.calls.length === 1)).toBe(true);
    expect(h.cached.pin).toHaveBeenCalledOnce();
  });

  it('cancels deferred work on unmount and survives StrictMode effect cleanup/setup replay', () => {
    const first = mountTile(); first.update({ scale: .7 }); first.unmount();
    vi.advanceTimersByTime(1000);
    expect(first.drawCount).toBe(1);
    expect(first.cached.pin).toHaveBeenCalledOnce();
    const second = mountTile(); second.update({ scale: .7 });
    second.replayEffects();
    expect(second.drawCount).toBe(2);
    expect(second.canvas.width).toBe(768);
    expect(vi.getTimerCount()).toBe(0);
    expect(second.cached.releases.every(release => release.mock.calls.length === 1)).toBe(true);
  });
});
