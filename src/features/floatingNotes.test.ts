import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://current/${encodeURIComponent(path)}`,
}));

import {
  getFloatingNoteImageSourceDetails,
  getStableFloatingNoteImageFields,
} from './floatingNotes';

describe('floating image note sources', () => {
  it('persists a stable local path instead of a generated display URL', () => {
    expect(getStableFloatingNoteImageFields({
      path: '/Users/artist/图片/hero #100%.png',
      url: 'asset://localhost/%2FUsers%2Fartist%2F%E5%9B%BE%E7%89%87%2Fhero%20%23100%25.png',
      thumbnail: undefined,
    })).toEqual({
      path: '/Users/artist/图片/hero #100%.png',
      url: undefined,
      thumbnail: undefined,
    });
  });

  it('recovers the raw path from a legacy Windows asset.localhost-only snapshot', () => {
    expect(getStableFloatingNoteImageFields({
      url: 'http://asset.localhost/C%3A%5CImages%5Clegacy%20note.png',
    })).toEqual({
      path: 'C:\\Images\\legacy note.png',
      url: undefined,
      thumbnail: undefined,
    });
  });

  it('moves a direct local URL into the stable path field', () => {
    expect(getStableFloatingNoteImageFields({
      url: '/Users/artist/Images/direct local.png',
    })).toEqual({
      path: '/Users/artist/Images/direct local.png',
      url: undefined,
      thumbnail: undefined,
    });
  });

  it('keeps durable remote and data sources but never persists blob URLs', () => {
    expect(getStableFloatingNoteImageFields({ url: 'https://example.com/image.png' }).url)
      .toBe('https://example.com/image.png');
    expect(getStableFloatingNoteImageFields({ url: 'data:image/png;base64,AAAA' }).url)
      .toBe('data:image/png;base64,AAAA');
    expect(getStableFloatingNoteImageFields({ url: 'blob:https://app.local/temporary' }).url)
      .toBeUndefined();
  });

  it('prefers the repository path, then the stored raw path, over stale display URLs', () => {
    const note = {
      id: 'note-window-1',
      itemId: 'asset-1',
      type: 'image' as const,
      path: '/Users/artist/Images/stored.png',
      url: 'http://asset.localhost/C%3A%5CImages%5Cstale.png',
      createdAt: 1,
    };

    expect(getFloatingNoteImageSourceDetails(note).resolvedSource)
      .toBe(`asset://current/${encodeURIComponent(note.path)}`);
    expect(getFloatingNoteImageSourceDetails(note, {
      path: '/Users/artist/Images/current.png',
      sourceUrl: '/Users/artist/Desktop/original.png',
    })).toMatchObject({
      assetId: 'asset-1',
      originalSource: '/Users/artist/Desktop/original.png',
      storedSource: '/Users/artist/Images/stored.png',
      resolvedSource: `asset://current/${encodeURIComponent('/Users/artist/Images/current.png')}`,
    });
  });
});
