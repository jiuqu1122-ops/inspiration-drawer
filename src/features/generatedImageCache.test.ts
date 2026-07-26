import { describe, expect, it } from 'vitest';
import {
  getGeneratedImageCacheSource,
  isLocalGeneratedImageSource,
  shouldCacheGeneratedImageAgain,
} from './generatedImageCache';

describe('generated image cache planning', () => {
  it('does not cache an image twice when a durable local path already exists', () => {
    const item = {
      path: 'C:\\cache\\task-123.png',
      url: 'http://asset.localhost/C%3A/cache/task-123.png',
      sourceUrl: 'https://example.com/temporary-result.png',
    };

    expect(getGeneratedImageCacheSource(item)).toBe('https://example.com/temporary-result.png');
    expect(shouldCacheGeneratedImageAgain(item)).toBe(false);
  });

  it('recognizes Tauri asset URLs and local file paths', () => {
    expect(isLocalGeneratedImageSource('http://asset.localhost/C%3A/cache/result.png')).toBe(true);
    expect(isLocalGeneratedImageSource('asset://localhost/C%3A/cache/result.png')).toBe(true);
    expect(isLocalGeneratedImageSource('C:\\cache\\result.png')).toBe(true);
    expect(shouldCacheGeneratedImageAgain({ url: 'asset://localhost/result.png' })).toBe(false);
  });

  it('still caches actual remote and embedded generated images', () => {
    expect(shouldCacheGeneratedImageAgain({ url: 'https://example.com/result.png' })).toBe(true);
    expect(shouldCacheGeneratedImageAgain({ url: 'data:image/png;base64,AAAA' })).toBe(true);
  });
});
