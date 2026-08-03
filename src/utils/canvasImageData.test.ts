import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  blobToDataUrl,
  dataUrlToBlob,
  getDataUrlByteSize,
  imageDataUrlToJpegDataUrl,
  imageDataUrlToPngDataUrl,
  isLikelyJpegOrPngImageSource,
  isRemoteHttpImageSource,
  isXaisAttachmentImageRef,
  optimizeCanvasAiInputDataUrl,
} from './canvasImageData';

afterEach(() => {
  vi.unstubAllGlobals();
});

const installImageCanvasMocks = (outputByType: Record<string, string>) => {
  class MockImage {
    naturalWidth = 1600;
    naturalHeight = 800;
    width = 1600;
    height = 800;
    decoding = '';
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }

  const context = {
    fillStyle: '',
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toDataURL: vi.fn((type: string) => outputByType[type] || ''),
  };
  const createElement = vi.fn(() => canvas);

  vi.stubGlobal('window', { Image: MockImage });
  vi.stubGlobal('document', { createElement });

  return { canvas, context, createElement };
};

describe('canvas image data utilities', () => {
  it('preserves image source classification rules', () => {
    expect(isRemoteHttpImageSource('https://example.com/image.png')).toBe(true);
    expect(isRemoteHttpImageSource('http://127.0.0.1/image.png')).toBe(false);
    expect(isRemoteHttpImageSource('asset://localhost/image.png')).toBe(false);

    expect(isLikelyJpegOrPngImageSource('data:image/jpeg;base64,AAAA')).toBe(true);
    expect(isLikelyJpegOrPngImageSource('https://example.com/image.PNG?size=2')).toBe(true);
    expect(isLikelyJpegOrPngImageSource('https://example.com/image.webp')).toBe(false);

    expect(isXaisAttachmentImageRef('bucket/path/image.webp')).toBe(true);
    expect(isXaisAttachmentImageRef('https://example.com/image.webp')).toBe(false);
    expect(isXaisAttachmentImageRef('C:\\images\\image.png')).toBe(false);
  });

  it('keeps the existing base64 size estimate', () => {
    expect(getDataUrlByteSize('data:image/png;base64,AAAA')).toBe(3);
    expect(getDataUrlByteSize('AAAAA')).toBe(4);
  });

  it('converts blobs and data URLs through the existing browser APIs', async () => {
    class MockFileReader {
      result: string | ArrayBuffer | null = null;
      error: DOMException | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      readAsDataURL(_blob: Blob) {
        this.result = 'data:image/png;base64,AAAA';
        this.onload?.();
      }
    }

    const blob = new Blob(['image'], { type: 'image/png' });
    const fetchMock = vi.fn(async () => ({ blob: async () => blob }));
    vi.stubGlobal('FileReader', MockFileReader);
    vi.stubGlobal('fetch', fetchMock);

    await expect(blobToDataUrl(blob)).resolves.toBe('data:image/png;base64,AAAA');
    await expect(dataUrlToBlob('data:image/png;base64,AAAA')).resolves.toBe(blob);
    expect(fetchMock).toHaveBeenCalledWith('data:image/png;base64,AAAA');
  });

  it('passes through non-image data and keeps the existing optimization path', async () => {
    await expect(optimizeCanvasAiInputDataUrl('https://example.com/image.png')).resolves.toBe(
      'https://example.com/image.png',
    );

    const optimized = 'data:image/jpeg;base64,AAAA';
    const { canvas, context } = installImageCanvasMocks({ 'image/jpeg': optimized });
    const source = `data:image/png;base64,${'A'.repeat(200)}`;

    await expect(optimizeCanvasAiInputDataUrl(source, { maxEdge: 100, targetBytes: 10 })).resolves.toBe(optimized);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 100, 50);
    expect(context.drawImage).toHaveBeenCalledTimes(1);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });

  it('keeps JPEG conversion validation and canvas cleanup', async () => {
    await expect(imageDataUrlToJpegDataUrl('not-an-image')).rejects.toThrow('invalid image data url');

    const jpeg = 'data:image/jpeg;base64,AAAA';
    const { canvas, context } = installImageCanvasMocks({ 'image/jpeg': jpeg });

    await expect(imageDataUrlToJpegDataUrl('data:image/webp;base64,BBBB')).resolves.toBe(jpeg);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1600, 800);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });

  it('keeps PNG pass-through, validation, and conversion behavior', async () => {
    const png = 'data:image/png;base64,AAAA';
    await expect(imageDataUrlToPngDataUrl(png)).resolves.toBe(png);
    await expect(imageDataUrlToPngDataUrl('not-an-image')).rejects.toThrow('invalid image data url');

    const { canvas, context } = installImageCanvasMocks({ 'image/png': png });
    await expect(imageDataUrlToPngDataUrl('data:image/webp;base64,BBBB')).resolves.toBe(png);
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 1600, 800);
    expect(context.drawImage).toHaveBeenCalledTimes(1);
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });
});
