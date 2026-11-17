import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CanvasImageItem } from '../../canvasModel';
import { CanvasNodeLayer } from './CanvasNodeLayer';
const state = vi.hoisted(() => ({ unavailable: new Set<string>(), options: {} as Record<string, unknown> }));
vi.mock('../snapshot/snapshotBitmapCache', () => ({
  createSnapshotBitmapCache: (options: Record<string, unknown>) => {
    state.options = options;
    const bitmaps = new Map<string, unknown>();
    return {
      peek: (source: string, edge: number) => {
        if (state.unavailable.has(source)) return null;
        const key = `${edge}:${source}`;
        if (!bitmaps.has(key)) bitmaps.set(key, { key, drawable: {}, width: edge, height: edge, bytes: edge * edge * 4 });
        return bitmaps.get(key);
      },
      getStats: () => ({ entries: bitmaps.size, bytes: 0 }),
    };
  },
}));
const image = (i: number): CanvasImageItem => ({ id: `n${i}`, x: (i % 40) * 120, y: Math.floor(i / 40) * 100,
  width: 100, height: 80, item: { id: `a${i}`, type: 'image', content: '', createdAt: 1, thumbnail: `thumb-${i}` } });
const fixture = (count: number, scale = .6, selected: string[] = []) => {
  const items = Array.from({ length: count }, (_, i) => image(i));
  const source = vi.fn((node: CanvasImageItem) => node.item.thumbnail || '');
  const scope = { canvasRenderableItems: items, canvasSnapshotMode: true,
    canvasSnapshotViewport: { x: -200, y: -200, width: 6000, height: 4000 }, canvasRenderScale: scale,
    canvasSelectedIdsSet: new Set(selected), canvasSelectedIdsRef: { current: selected }, threeSceneAnalyzingIds: [],
    canvasHoveredItemIdRef: { current: '' }, activeThreeSceneIdRef: { current: null }, getStableCanvasImageSource: source,
  };
  return { items, scope, source, render: () => renderToStaticMarkup(<CanvasNodeLayer scope={scope} canvasItemsRef={{ current: items }} />) };
};
beforeEach(() => state.unavailable.clear());
describe('actual snapshot node layer overview composition', () => {
  it.each([100, 500, 1000])('keeps %i warm images rasterized across a large zoomed-out viewport', count => {
    const f = fixture(count); const html = f.render();
    expect(html).toContain(`data-snapshot-static-count="${count}"`);
    expect(html).toContain('data-snapshot-live-count="0"');
    expect(html.match(/data-canvas-snapshot-static="true"/g)).toHaveLength(count);
    const tiles = html.match(/data-canvas-snapshot-tile=/g) || [];
    expect(tiles.length).toBeGreaterThan(0); expect(tiles.length).toBeLessThanOrEqual(48);
    expect(html).not.toContain('<img'); expect(f.source).not.toHaveBeenCalled();
    expect(state.options.maxEntries).toBe(1024); expect(state.options.maxPendingRequests).toBe(24);
  });
  it.each([1, 100, 500, 1000])('removes all %i ordinary image DOM roots at minimum zoom without hiding their pixels', count => {
    const f = fixture(count, .08); const html = f.render();
    expect(html).toContain('data-canvas-overview-active="true"');
    expect(html).toContain('data-snapshot-dom-count="0"');
    expect(html).not.toContain('data-canvas-item-id=');
    expect(html).not.toContain('<img');
    expect(html.match(/data-canvas-snapshot-tile=/g)?.length).toBeGreaterThan(0);
    expect(html.match(/data-canvas-snapshot-tile=/g)?.length).toBeLessThanOrEqual(24);
    expect(f.source).not.toHaveBeenCalled();
  });
  it('keeps selected images and missing-bitmap fallbacks interactive in the overview', () => {
    state.unavailable.add('thumb-1'); const f = fixture(500, .08, ['n250']); const html = f.render();
    expect(html).toContain('data-snapshot-dom-count="2"');
    expect(html).toContain('data-canvas-item-id="n1"');
    expect(html).toContain('data-canvas-item-id="n250"');
    expect(html).toContain('src="thumb-1"');
  });
  it('preserves original-image fallback for a missing bitmap without disabling every other picture', () => {
    state.unavailable.add('thumb-250'); const f = fixture(500); const html = f.render();
    expect(html).toContain('data-snapshot-static-count="499"');
    expect(html).toContain('src="thumb-250"'); expect(f.source).toHaveBeenCalledTimes(1);
  });
  it('keeps the selected picture live and the other 499 pictures cached', () => {
    const f = fixture(500, .2, ['n250']); const html = f.render();
    expect(html).toContain('data-snapshot-static-count="499"');
    expect(html).toContain('data-canvas-selected-state="true"'); expect(f.source).toHaveBeenCalledTimes(1);
  });
});
