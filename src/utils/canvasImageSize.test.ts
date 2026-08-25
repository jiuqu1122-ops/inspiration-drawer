import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getCanvasInitialImageSize,
  getFastCanvasImageDisplaySize,
  readImageDisplaySize,
} from './canvasImageSize';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('canvas image display size', () => {
  it('preserves fallback and initial-size limits', () => {
    expect(getCanvasInitialImageSize()).toEqual({ width: 360, height: 260 });
    expect(getCanvasInitialImageSize(1440, 720)).toEqual({ width: 720, height: 360 });
    expect(getCanvasInitialImageSize(800, 1600)).toEqual({ width: 280, height: 560 });
  });

  it('only reads embedded dimensions in the existing width-before-height form', () => {
    const item = (thumbnail: string) => ({ thumbnail }) as Parameters<typeof getFastCanvasImageDisplaySize>[0];

    expect(getFastCanvasImageDisplaySize(item(
      'data:image/svg+xml,<svg width="1440" height="720">',
    ))).toEqual({ width: 720, height: 360 });
    expect(getFastCanvasImageDisplaySize(item(
      'data:image/svg+xml,<svg height="720" width="1440">',
    ))).toEqual({ width: 360, height: 260 });
  });

  it('loads natural dimensions and clears the fallback timer', async () => {
    let createdImage: MockImage | null = null;

    class MockImage {
      naturalWidth = 1600;
      naturalHeight = 800;
      decoding = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor() {
        createdImage = this;
      }

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }

    const setTimeoutMock = vi.fn(() => 7);
    const clearTimeoutMock = vi.fn();
    vi.stubGlobal('window', {
      Image: MockImage,
      setTimeout: setTimeoutMock,
      clearTimeout: clearTimeoutMock,
    });

    await expect(readImageDisplaySize('image://sample')).resolves.toEqual({ width: 720, height: 360 });
    expect(setTimeoutMock).toHaveBeenCalledWith(expect.any(Function), 1800);
    expect(clearTimeoutMock).toHaveBeenCalledWith(7);
    expect(createdImage).toMatchObject({ decoding: 'async', onload: null, onerror: null });
  });
});
