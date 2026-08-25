import { describe, expect, it } from 'vitest';
import {
  CANVAS_AI_DEFAULT_ASPECT_RATIO,
  CANVAS_AI_NEW_API_VIDEO_ASPECT_RATIO_OPTIONS,
  getCanvasAiAspectRatioOptionsForModel,
  normalizeCanvasAiAspectRatioForModel,
  parseCanvasAspectRatioValue,
  usesCanvasAiImage2DimensionOptions,
} from './canvasAiAspectRatio';

describe('canvas AI aspect ratios', () => {
  it('parses supported separators and keeps the default fallback', () => {
    expect(parseCanvasAspectRatioValue('16:9')).toBeCloseTo(16 / 9);
    expect(parseCanvasAspectRatioValue('800x600')).toBeCloseTo(4 / 3);
    expect(parseCanvasAspectRatioValue('800×600')).toBeCloseTo(4 / 3);
    expect(parseCanvasAspectRatioValue('invalid')).toBeCloseTo(16 / 9);
    expect(CANVAS_AI_DEFAULT_ASPECT_RATIO).toBe('16:9');
  });

  it('maps arbitrary dimensions to the closest standard ratio', () => {
    expect(normalizeCanvasAiAspectRatioForModel(null, '1200x800')).toBe('4:3');
    expect(normalizeCanvasAiAspectRatioForModel(null, 'invalid')).toBe('16:9');
  });

  it('uses dimension options for Image 2 only above 1K', () => {
    expect(usesCanvasAiImage2DimensionOptions('Xais Img2_2K', '2k')).toBe(true);
    expect(usesCanvasAiImage2DimensionOptions('Xais Img2_4K', '4k')).toBe(true);
    expect(usesCanvasAiImage2DimensionOptions('Xais Img2_2K', '1k')).toBe(false);

    const options = getCanvasAiAspectRatioOptionsForModel('Xais Img2_2K', '2k');
    expect(options[0]).toEqual({ value: '2048x2048', label: '2048×2048 (1:1)' });
    expect(options).toContainEqual({ value: '2048x1152', label: '2048×1152 (16:9)' });
  });

  it('normalizes Image 2 ratios against the selected resolution', () => {
    expect(normalizeCanvasAiAspectRatioForModel('Xais Img2_2K', '16:9', '1k')).toBe('16:9');
    expect(normalizeCanvasAiAspectRatioForModel('Xais Img2_2K', '16:9', '2k')).toBe('2048x1152');
    expect(normalizeCanvasAiAspectRatioForModel('Xais Img2_2K', '16:9', '4k')).toBe('3840x2160');
  });

  it('keeps the New API video ratio choices unchanged', () => {
    expect(CANVAS_AI_NEW_API_VIDEO_ASPECT_RATIO_OPTIONS).toEqual([
      { value: '16:9', label: '16:9' },
      { value: '9:16', label: '9:16' },
    ]);
  });
});
