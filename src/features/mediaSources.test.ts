import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}));

import {
  getImageListSource,
  getImagePreviewGallery,
  getPreviewOriginalSource,
  getPreviewPlaceholderSource,
} from './mediaSources';

describe('media preview sources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers a completed local cache over a remote original URL', () => {
    const item = {
      path: 'C:/cache/generated.png',
      url: 'https://images.example.com/generated.png',
      thumbnail: 'data:image/jpeg;base64,thumb',
    };

    expect(getPreviewOriginalSource(item)).toBe('asset://C:/cache/generated.png');
    expect(getPreviewPlaceholderSource(item)).toBe('data:image/jpeg;base64,thumb');
  });

  it('falls back to the remote original while the local cache is unavailable', () => {
    const item = {
      url: 'https://images.example.com/generated.png',
      thumbnail: 'data:image/jpeg;base64,thumb',
    };

    expect(getPreviewOriginalSource(item)).toBe('https://images.example.com/generated.png');
    expect(getPreviewPlaceholderSource(item)).toBe('data:image/jpeg;base64,thumb');
  });

  it('keeps list cards on their thumbnail', () => {
    const item = {
      path: 'C:/cache/generated.png',
      url: 'https://images.example.com/generated.png',
      thumbnail: 'data:image/jpeg;base64,thumb',
    };

    expect(getImageListSource(item, { allowOriginalFallback: true })).toBe('data:image/jpeg;base64,thumb');
  });

  it('builds a preview gallery from the visible image items and keeps the selected index', () => {
    const items = [
      { id: 'image-1', type: 'image', path: 'C:/images/one.png' },
      { id: 'text-1', type: 'text', content: 'note' },
      { id: 'image-empty', type: 'image' },
      { id: 'image-2', type: 'image', url: 'https://images.example.com/two.png' },
    ] as any[];

    expect(getImagePreviewGallery(items, 'image-2')).toEqual({
      galleryItems: [items[0], items[3]],
      galleryIndex: 1,
    });
    expect(getImagePreviewGallery(items, 'text-1')).toBeNull();
  });
});
