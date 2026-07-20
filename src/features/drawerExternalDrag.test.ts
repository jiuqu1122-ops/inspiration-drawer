import { describe, expect, it } from 'vitest';
import {
  getDrawerExternalDragCacheCandidates,
  getDrawerExternalDragLocalCandidates,
} from './drawerExternalDrag';

const imageItem = {
  id: 'image-1',
  type: 'image' as const,
  content: 'product.png',
  name: 'product.png',
  createdAt: 1,
};

describe('drawer external drag sources', () => {
  it('keeps checking local candidates after a stale primary path', () => {
    expect(getDrawerExternalDragLocalCandidates({
      ...imageItem,
      path: 'C:\\missing\\product.png',
      url: 'asset://localhost/C%3A/cache/product.png',
      thumbnail: 'data:image/jpeg;base64,thumb',
    })).toEqual([
      'C:\\missing\\product.png',
      'asset://localhost/C%3A/cache/product.png',
      'product.png',
    ]);
  });

  it('prefers original web sources over thumbnails when rebuilding the cache', () => {
    expect(getDrawerExternalDragCacheCandidates({
      ...imageItem,
      path: 'C:\\missing\\product.png',
      url: 'https://cdn.example.com/preview.jpg',
      sourceUrl: 'https://cdn.example.com/original.jpg',
      originalUrl: 'https://cdn.example.com/original.jpg',
      thumbnail: 'data:image/jpeg;base64,thumb',
    })).toEqual([
      'https://cdn.example.com/original.jpg',
      'https://cdn.example.com/preview.jpg',
      'data:image/jpeg;base64,thumb',
    ]);
  });

  it('does not try to rebuild non-image files through the image cache', () => {
    expect(getDrawerExternalDragCacheCandidates({
      ...imageItem,
      type: 'file',
      url: 'https://example.com/document.pdf',
    })).toEqual([]);
  });
});
