import { describe, expect, it } from 'vitest';
import { getThreeSceneCaptureSize } from './captureThreeSceneCanvas';

describe('3D scene capture size', () => {
  it('keeps a normal 2x viewport unchanged', () => {
    expect(getThreeSceneCaptureSize(1200, 800)).toEqual({ width: 1200, height: 800 });
  });

  it('limits the longest edge to 4096 while preserving aspect ratio', () => {
    expect(getThreeSceneCaptureSize(8192, 4096)).toEqual({ width: 4096, height: 2048 });
    expect(getThreeSceneCaptureSize(3000, 6000)).toEqual({ width: 2048, height: 4096 });
  });
});
