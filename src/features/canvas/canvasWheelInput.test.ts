import { describe, expect, it } from 'vitest';
import { amplifyCanvasWheelZoomDelta, resolveCanvasWheelIntent } from './canvasWheelInput';

describe('canvas wheel input', () => {
  it('uses ordinary macOS trackpad scrolling to pan the canvas', () => {
    expect(resolveCanvasWheelIntent(true, { ctrlKey: false })).toBe('pan');
  });

  it('keeps macOS pinch gestures on the canvas zoom path', () => {
    expect(resolveCanvasWheelIntent(true, { ctrlKey: true })).toBe('zoom');
  });

  it('preserves the existing Windows wheel zoom behavior', () => {
    expect(resolveCanvasWheelIntent(false, { ctrlKey: false })).toBe('zoom');
    expect(amplifyCanvasWheelZoomDelta(12, false)).toBe(12);
  });

  it('makes macOS pinch zoom respond clearly to one gesture', () => {
    expect(amplifyCanvasWheelZoomDelta(12, true)).toBe(48);
  });
});
