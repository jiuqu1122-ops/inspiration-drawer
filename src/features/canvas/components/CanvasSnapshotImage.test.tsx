import type { ReactElement, ReactNode } from 'react';
import { Children, isValidElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error Tests run in Node; the browser tsconfig intentionally excludes Node declarations.
import { readFileSync } from 'node:fs';
import type { SnapshotBitmap, SnapshotBitmapCache } from '../snapshot/snapshotBitmapCache';
import { CanvasSnapshotImage } from './CanvasSnapshotImage';

type Effect = { setup: () => void; deps: readonly unknown[]; changed: boolean };
type Runtime = { index: number; slots: any[]; effects: Effect[]; dirty: boolean };
const hooks = vi.hoisted(() => ({ current: null as Runtime | null }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useRef: (initial: unknown) => {
    const h = hooks.current!, i = h.index++;
    return h.slots[i] ??= { current: initial };
  },
  useState: (initial: unknown) => {
    const h = hooks.current!, i = h.index++;
    h.slots[i] ??= { value: initial };
    return [h.slots[i].value, (value: unknown) => {
      if (!Object.is(h.slots[i].value, value)) { h.slots[i].value = value; h.dirty = true; }
    }];
  },
  useLayoutEffect: (setup: () => void, deps: readonly unknown[]) => {
    const h = hooks.current!, i = h.index++, previous = h.effects[i];
    h.effects[i] = { setup, deps, changed: !previous || deps.some((value, k) => !Object.is(previous.deps[k], value)) };
  },
}));
const find = (node: ReactElement, test: (props: any) => boolean): ReactElement<any> | undefined => {
  if (test(node.props)) return node as ReactElement<any>;
  for (const child of Children.toArray((node.props as { children?: ReactNode }).children)) {
    if (isValidElement(child)) { const result = find(child, test); if (result) return result; }
  }
};
const fixture = () => {
  const runtime: Runtime = { index: 0, slots: [], effects: [], dirty: false };
  const ctx = { clearRect: vi.fn(), drawImage: vi.fn() };
  const canvas = { width: 1, height: 1, getContext: vi.fn(() => ctx) };
  const bitmap: SnapshotBitmap = { key: 'bitmap128', drawable: {} as CanvasImageSource, width: 128, height: 96, bytes: 49152 };
  const release = vi.fn();
  const pin = vi.fn(() => ({ bitmap, release }));
  const cache = { pin } as unknown as SnapshotBitmapCache;
  let props: Parameters<typeof CanvasSnapshotImage>[0] = { bitmap, cache, source: 'thumb.png', maxEdge: 128,
    originalSource: 'original-6000px.png', showOriginalAtRest: true, style: {}, name: 'test', onDragStart: vi.fn() };
  let tree: ReactElement<any>;
  const render = (patch: Partial<typeof props> = {}) => {
    props = { ...props, ...patch };
    let count = 0;
    do {
      if (++count > 5) throw new Error('Hook fixture failed to settle');
      runtime.index = 0; runtime.dirty = false; hooks.current = runtime;
      try { tree = CanvasSnapshotImage(props); } finally { hooks.current = null; }
      const element = find(tree!, p => p['data-canvas-snapshot-preview'] === 'true');
      if (element) element.props.ref.current = canvas;
      for (const effect of runtime.effects) if (effect?.changed) { effect.changed = false; effect.setup(); }
    } while (runtime.dirty);
    return tree!;
  };
  render();
  return { canvas, ctx, bitmap, release, pin, render };
};
afterEach(() => { hooks.current = null; vi.unstubAllGlobals(); });
describe('selected-image navigation bitmap', () => {
  it('paints the small cached bitmap once and preserves it over 300 rerenders/zoom-state changes', () => {
    const addEventListener = vi.fn(); vi.stubGlobal('window', { addEventListener });
    const f = fixture();
    const originalSize = [f.canvas.width, f.canvas.height];
    for (let i = 0; i < 300; i++) {
      const tree = f.render({ showOriginalAtRest: i % 2 === 0, style: { imageRendering: 'auto' } });
      expect(tree.props['data-canvas-snapshot-ready']).toBe('true');
    }
    expect(f.ctx.drawImage).toHaveBeenCalledTimes(1); expect(f.pin).toHaveBeenCalledExactlyOnceWith('thumb.png', 128);
    expect(f.release).toHaveBeenCalledOnce(); expect([f.canvas.width, f.canvas.height]).toEqual(originalSize);
    expect(originalSize).toEqual([128, 96]); expect(addEventListener).not.toHaveBeenCalled();
  });
  it('keeps the original at rest without letting it replace or remove the navigation canvas', () => {
    const f = fixture(); const first = f.render();
    expect(find(first, p => p['data-canvas-snapshot-original'] === 'true')).toBeDefined();
    expect(find(first, p => p.src === 'original-6000px.png')).toBeDefined();
    const second = f.render({ showOriginalAtRest: false });
    expect(find(second, p => p['data-canvas-snapshot-original'] === 'true')).toBeUndefined();
    expect(find(second, p => p['data-canvas-snapshot-preview'] === 'true')!.props.ref.current).toBe(f.canvas);
    expect(f.ctx.drawImage).toHaveBeenCalledOnce();
  });
  it('repaints on a source/tier change and releases the lease after a drawing failure', () => {
    const f = fixture(); f.ctx.drawImage.mockImplementationOnce(() => { throw new Error('canvas lost'); });
    const replacement = { ...f.bitmap, key: 'new256', width: 256, height: 192 };
    const tree = f.render({ bitmap: replacement, source: 'new.png', maxEdge: 256 });
    expect(tree.props.src).toBe('original-6000px.png');
    expect(f.pin).toHaveBeenLastCalledWith('new.png', 256); expect(f.release).toHaveBeenCalledTimes(2);
  });
  it('falls back to original pixels when its cached bitmap was evicted', () => {
    const f = fixture(); f.pin.mockReturnValueOnce(null as any);
    const tree = f.render({ bitmap: { ...f.bitmap, key: 'evicted' } });
    expect(tree.props.src).toBe('original-6000px.png'); expect(f.ctx.drawImage).toHaveBeenCalledTimes(1);
  });
  it('uses CSS readiness plus the existing surface zoom flag, not per-node wheel state', () => {
    const css: string = readFileSync(new URL('../snapshot/canvasSnapshotImage.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\[data-canvas-surface\]\[data-canvas-zooming="true"\][^{]+\[data-canvas-snapshot-ready="true"\][^{]+\[data-canvas-snapshot-original\]\s*\{\s*display: none;/);
    expect(css).toMatch(/\[data-canvas-snapshot-ready="true"\][^{]+canvas\[data-canvas-snapshot-preview\]\s*\{\s*visibility: visible;/);
  });
});
