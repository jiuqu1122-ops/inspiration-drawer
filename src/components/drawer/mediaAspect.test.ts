import { describe, expect, it } from 'vitest';

import {
  buildDrawerMasonryLayout,
  getDrawerContentBoxWidth,
  getDrawerMasonryColumnMetrics,
  getItemMediaDimensions,
  getMediaAspectRatio,
  getMediaDisplayHeight,
} from './mediaAspect';

describe('drawer media aspect ratio', () => {
  it('uses the scroll container content box instead of a shrink-wrapped gallery width', () => {
    expect(getDrawerContentBoxWidth(1000, 20, 20)).toBe(960);
    expect(getDrawerContentBoxWidth(30, 20, 20)).toBe(1);
  });

  it('uses declared image or video dimensions for the displayed height', () => {
    const item = { width: 3840, height: 2400 };
    expect(getMediaAspectRatio(item)).toBe(1.6);
    expect(getMediaDisplayHeight(item, 320, 220)).toBe(200);
  });

  it('uses dimensions resolved from loaded media when metadata is missing', () => {
    expect(getItemMediaDimensions({}, { width: 1080, height: 1920 })).toEqual({ width: 1080, height: 1920 });
    expect(getMediaDisplayHeight({}, 270, 180, { width: 1080, height: 1920 })).toBe(480);
  });

  it('keeps the configured fallback until a valid ratio is known', () => {
    expect(getMediaAspectRatio({ width: 0, height: 100 })).toBeNull();
    expect(getMediaDisplayHeight({}, 320, 180)).toBe(180);
  });

  it('places the next card in the shortest column instead of leaving a row gap', () => {
    const items = [
      { id: 'wide', type: 'image', width: 200, height: 100 },
      { id: 'portrait', type: 'image', width: 100, height: 200 },
      { id: 'square', type: 'image', width: 100, height: 100 },
    ] as any[];
    const layout = buildDrawerMasonryLayout(items, {
      columnCount: 2,
      columnWidth: 100,
      gap: 16,
      fallbackMediaHeight: 80,
    });

    expect(layout.positions[0]).toMatchObject({ left: 0, top: 0, height: 88 });
    expect(layout.positions[1]).toMatchObject({ left: 116, top: 0, height: 238 });
    expect(layout.positions[2]).toMatchObject({ left: 0, top: 104, height: 138 });
  });

  it('keeps the final masonry column inside the gallery content width', () => {
    const metrics = getDrawerMasonryColumnMetrics(928, 300, 16);
    expect(metrics).toEqual({ columnCount: 2, columnWidth: 456 });
    expect(metrics.columnCount * metrics.columnWidth + 16).toBe(928);
  });
});
