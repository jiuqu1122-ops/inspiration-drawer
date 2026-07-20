import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://${path}`,
}));

import {
  getImageListSource,
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
});
