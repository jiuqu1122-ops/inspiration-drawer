import { describe, expect, it } from 'vitest';
import { getHorizontalRailMetrics } from './CanvasHorizontalRail';

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
});
