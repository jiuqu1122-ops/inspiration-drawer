import { CANVAS_MAX_IMAGE_WIDTH } from '../features/canvasModel';
import type { BufferItem } from '../types';

const CANVAS_FALLBACK_IMAGE_WIDTH = 360;
const CANVAS_FALLBACK_IMAGE_HEIGHT = 260;
const CANVAS_INITIAL_IMAGE_MAX_WIDTH = 720;
const CANVAS_INITIAL_IMAGE_MAX_HEIGHT = 560;

export const getCanvasInitialImageSize = (naturalWidth = 0, naturalHeight = 0) => {
  if (naturalWidth > 0 && naturalHeight > 0) {
    const aspect = naturalWidth / Math.max(1, naturalHeight);
    let width = Math.min(naturalWidth, CANVAS_INITIAL_IMAGE_MAX_WIDTH, CANVAS_MAX_IMAGE_WIDTH);
    let height = width / aspect;
    if (height > CANVAS_INITIAL_IMAGE_MAX_HEIGHT) {
      height = CANVAS_INITIAL_IMAGE_MAX_HEIGHT;
      width = height * aspect;
    }
    return {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
    };
  }
  return { width: CANVAS_FALLBACK_IMAGE_WIDTH, height: CANVAS_FALLBACK_IMAGE_HEIGHT };
};

export const readImageDisplaySize = (src: string) => new Promise<{ width: number; height: number }>((resolve) => {
  if (!src) {
    resolve(getCanvasInitialImageSize());
    return;
  }
  const image = new window.Image();
  let settled = false;
  const finish = (size: { width: number; height: number }) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    image.onload = null;
    image.onerror = null;
    resolve(size);
  };
  const timer = window.setTimeout(() => finish(getCanvasInitialImageSize()), 1800);
  image.onload = () => finish(getCanvasInitialImageSize(image.naturalWidth, image.naturalHeight));
  image.onerror = () => finish(getCanvasInitialImageSize());
  image.decoding = 'async';
  image.src = src;
});

export const getFastCanvasImageDisplaySize = (item: BufferItem) => {
  const thumbnail = item.thumbnail || '';
  if (thumbnail.startsWith('data:image/')) {
    const match = thumbnail.match(/(?:width|w)=["']?(\d+)["']?[^>]*(?:height|h)=["']?(\d+)["']?/i);
    if (match) {
      const width = Number(match[1]);
      const height = Number(match[2]);
      if (width > 0 && height > 0) return getCanvasInitialImageSize(width, height);
    }
  }
  return getCanvasInitialImageSize();
};
