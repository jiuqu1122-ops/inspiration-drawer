import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CanvasHorizontalRail,
  getHorizontalRailMetrics,
  shouldRenderCanvasVideoReferenceRail,
} from './CanvasHorizontalRail';

describe('getHorizontalRailMetrics', () => {
  it('maps scroll progress onto the custom thumb', () => {
    expect(getHorizontalRailMetrics({
      clientWidth: 300,
      scrollWidth: 600,
      scrollLeft: 150,
      trackWidth: 280,
    })).toEqual({
      scrollable: true,
      thumbWidth: 140,
      thumbLeft: 70,
      canScrollLeft: true,
      canScrollRight: true,
    });
  });

  it('uses the full track when content does not overflow', () => {
    expect(getHorizontalRailMetrics({
      clientWidth: 300,
      scrollWidth: 280,
      scrollLeft: 0,
      trackWidth: 280,
    })).toEqual({
      scrollable: false,
      thumbWidth: 280,
      thumbLeft: 0,
      canScrollLeft: false,
      canScrollRight: false,
    });
  });

  it('keeps a long multi-media rail scrollable inside a capped viewport', () => {
    const metrics = getHorizontalRailMetrics({
      clientWidth: 320,
      scrollWidth: 840,
      scrollLeft: 0,
      trackWidth: 312,
    });
    expect(metrics.scrollable).toBe(true);
    expect(metrics.canScrollLeft).toBe(false);
    expect(metrics.canScrollRight).toBe(true);
    expect(metrics.thumbWidth).toBeLessThan(312);
  });

  it.each([
    ['FLF', ['first-frame', 'last-frame']],
    ['single REF image', ['reference-image-1']],
  ])('uses intrinsic fit-content sizing for %s slots', (_, slots) => {
    const html = renderToStaticMarkup(createElement(
      CanvasHorizontalRail,
      {
        fitContent: true,
        children: slots.map(slot => createElement('span', { key: slot, 'data-slot': slot })),
      },
    ));
    expect(html).toContain('data-canvas-horizontal-rail="fit-content"');
    expect(html).toContain('data-canvas-horizontal-rail-viewport="fit-content"');
    expect(html).toContain('w-fit max-w-full min-w-0');
    expect(html).toContain('flex w-max items-center gap-1.5 px-1');
    expect(html).not.toContain('data-canvas-horizontal-rail="full"');
  });

  it('preserves full-width sizing as the default for existing image rails', () => {
    const html = renderToStaticMarkup(createElement(
      CanvasHorizontalRail,
      { children: createElement('span', { 'data-slot': 'image' }) },
    ));
    expect(html).toContain('data-canvas-horizontal-rail="full"');
    expect(html).toContain('data-canvas-horizontal-rail-viewport="full"');
  });

  it('omits a video reference rail when the model exposes no slots', () => {
    expect(shouldRenderCanvasVideoReferenceRail(0)).toBe(false);
    expect(shouldRenderCanvasVideoReferenceRail(1)).toBe(true);
    expect(shouldRenderCanvasVideoReferenceRail(2)).toBe(true);
    expect(shouldRenderCanvasVideoReferenceRail(15)).toBe(true);
  });
});
