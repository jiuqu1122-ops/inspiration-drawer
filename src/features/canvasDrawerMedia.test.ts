import { describe, expect, it } from 'vitest';
import type { BufferItem } from '../types';
import {
  getCanvasDrawerMediaPreviewSource,
  getCanvasDrawerMediaSource,
  isCanvasDrawerMediaItem,
} from './canvasDrawerMedia';

const makeItem = (patch: Partial<BufferItem>): BufferItem => ({
  id: 'item-1',
  type: 'image',
  content: '',
  createdAt: 1,
  ...patch,
});

describe('canvas drawer media', () => {
  it('accepts sourced images and videos, while rejecting unrelated items', () => {
    expect(isCanvasDrawerMediaItem(makeItem({ type: 'image', path: 'C:\\images\\one.png' }))).toBe(true);
    expect(isCanvasDrawerMediaItem(makeItem({ type: 'video', path: 'C:\\videos\\one.mp4' }))).toBe(true);
    expect(isCanvasDrawerMediaItem(makeItem({ type: 'video', url: 'https://example.com/one.mp4' }))).toBe(true);
    expect(isCanvasDrawerMediaItem(makeItem({ type: 'video', thumbnail: 'data:image/webp;base64,preview' }))).toBe(false);
    expect(isCanvasDrawerMediaItem(makeItem({ type: 'video' }))).toBe(false);
    expect(isCanvasDrawerMediaItem(makeItem({ type: 'file', path: 'C:\\files\\one.pdf' }))).toBe(false);
  });

  it('keeps a video thumbnail for preview but returns the playable source for canvas', () => {
    const item = makeItem({
      type: 'video',
      thumbnail: 'data:image/webp;base64,preview',
      path: 'C:\\videos\\one.mp4',
    });
    if (!isCanvasDrawerMediaItem(item)) throw new Error('expected video media');

    expect(getCanvasDrawerMediaPreviewSource(item)).toBe('data:image/webp;base64,preview');
    expect(getCanvasDrawerMediaSource(item)).toBe('C:\\videos\\one.mp4');
  });

  it('can use an image URL as both the canvas source and search preview', () => {
    const item = makeItem({ type: 'image', url: 'https://example.com/one.png' });
    if (!isCanvasDrawerMediaItem(item)) throw new Error('expected image media');

    expect(getCanvasDrawerMediaPreviewSource(item)).toBe('https://example.com/one.png');
    expect(getCanvasDrawerMediaSource(item)).toBe('https://example.com/one.png');
  });
});
