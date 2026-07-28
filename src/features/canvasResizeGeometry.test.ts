import { describe, expect, it } from 'vitest';
import {
  fitCanvasBoxToDesign,
  getCanvasBoxesBounds,
  getCanvasDesignScale,
} from './canvasResizeGeometry';

describe('canvas resize geometry', () => {
  it('uses the actually rendered AI node box instead of its stale outer box', () => {
    const rendered = fitCanvasBoxToDesign(
      { x: 120, y: 80, width: 1000, height: 500 },
      { width: 600, height: 800 },
    );

    expect(rendered).toEqual({
      x: 120,
      y: 80,
      width: 375,
      height: 500,
    });
  });

  it('keeps a user-downscaled node below its design size', () => {
    expect(getCanvasDesignScale(
      { width: 295, height: 400 },
      { width: 590, height: 800 },
    )).toBe(0.5);
  });

  it('builds group resize bounds from rendered boxes', () => {
    expect(getCanvasBoxesBounds([
      { x: 100, y: 80, width: 200, height: 160 },
      { x: 420, y: 120, width: 180, height: 300 },
    ])).toEqual({
      x: 100,
      y: 80,
      width: 500,
      height: 340,
    });
  });
});
