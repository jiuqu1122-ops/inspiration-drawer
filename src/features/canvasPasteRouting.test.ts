import { describe, expect, it } from 'vitest';

import { resolveCanvasPasteSource } from './canvasPasteRouting';

describe('resolveCanvasPasteSource', () => {
  it('prefers a system clipboard image over stale canvas items', () => {
    expect(resolveCanvasPasteSource({
      systemImageCount: 1,
      systemText: '',
      canvasItemCount: 3,
    })).toBe('system');
  });

  it('prefers system clipboard text over stale canvas items', () => {
    expect(resolveCanvasPasteSource({
      systemImageCount: 0,
      systemText: 'external text',
      canvasItemCount: 2,
    })).toBe('system');
  });

  it('keeps a fresh in-app canvas copy ahead of older system content', () => {
    expect(resolveCanvasPasteSource({
      systemImageCount: 1,
      systemText: '',
      canvasItemCount: 2,
      preferCanvasItems: true,
    })).toBe('canvas');
  });

  it('falls back to canvas items when the system clipboard has no supported content', () => {
    expect(resolveCanvasPasteSource({
      systemImageCount: 0,
      systemText: '   ',
      canvasItemCount: 2,
    })).toBe('canvas');
  });

  it('does nothing when both clipboards are empty', () => {
    expect(resolveCanvasPasteSource({
      systemImageCount: 0,
      systemText: '',
      canvasItemCount: 0,
    })).toBe('none');
  });
});
