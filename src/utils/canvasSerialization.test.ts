import { describe, expect, it } from 'vitest';
import type { BufferItem } from '../types';
import type { CanvasImageItem } from '../features/canvasModel';
import {
  cloneDrawerValue,
  sanitizeCanvasPersistedState,
  stripHeavyDataThumbnail,
} from './canvasSerialization';

const createCanvasNode = (ai: CanvasImageItem['ai']): CanvasImageItem => ({
  id: 'node-1',
  x: 0,
  y: 0,
  width: 320,
  height: 320,
  item: {
    id: 'item-1',
    type: 'image',
    content: 'generated media',
    createdAt: 1,
  },
  ai,
});

describe('canvas serialization', () => {
  it('removes legacy local analysis data without touching AI inspiration profiles', () => {
    const inspirationProfile = {
      itemId: 'item-1',
      summary: 'AI analyzed industrial design reference',
      objects: [],
      category: 'product',
      form: { silhouette: [], geometry: [], proportion: [] },
      cmf: { colors: ['charcoal'], materials: ['aluminum'], finishes: ['matte'] },
      style: [],
      interaction: [],
      scene: [],
      mood: [],
      userTags: [],
      userNotes: [],
      aiTags: [],
    } satisfies NonNullable<BufferItem['inspirationProfile']>;
    const item = {
      id: 'item-1',
      type: 'image',
      content: 'image',
      createdAt: 1,
      inspirationProfile,
      alchemy: { state: 'alchemy', result: { colors: ['#ffffff'] } },
    } as BufferItem & { alchemy: unknown };

    const stripped = stripHeavyDataThumbnail(item);

    expect('alchemy' in stripped).toBe(false);
    expect(stripped.inspirationProfile).toBe(inspirationProfile);
    expect('alchemy' in item).toBe(true);
  });

  it('removes oversized data thumbnails and data provenance without mutating the input', () => {
    const thumbnail = `data:image/png;base64,${'a'.repeat(96 * 1024)}`;
    const item = {
      id: 'item-1',
      type: 'image',
      content: 'image',
      createdAt: 1,
      thumbnail,
      sourceUrl: 'data:image/png;base64,source',
      originalUrl: 'data:image/png;base64,original',
    } as BufferItem;

    const stripped = stripHeavyDataThumbnail(item);

    expect(stripped).not.toBe(item);
    expect(stripped.thumbnail).toBeUndefined();
    expect(stripped.sourceUrl).toBeUndefined();
    expect(stripped.originalUrl).toBeUndefined();
    expect(item.thumbnail).toBe(thumbnail);
  });

  it('keeps the active canvas size cap and treats AVIF as an invalid video result', () => {
    const node = createCanvasNode({
      type: 'video-generator',
      status: 'success',
      generatedAt: 1,
      outputs: [{
        id: 'output-1',
        mediaType: 'video',
        status: 'success',
        url: 'https://example.com/generated.avif',
        generatedAt: 1,
      }],
    });

    const restored = sanitizeCanvasPersistedState({
      items: [node],
      size: { width: 999_999, height: 999_999 },
      scale: 1,
      scroll: { left: -20, top: -10 },
      updatedAt: 1,
    });

    expect(restored.size).toEqual({ width: 20_000, height: 20_000 });
    expect(restored.scroll).toEqual({ left: 0, top: 0 });
    expect(restored.items[0]?.ai?.status).toBe('error');
    expect(restored.items[0]?.ai?.outputs?.[0]?.status).toBe('error');
  });

  it('does not promote an interrupted working node from a usable output', () => {
    const node = createCanvasNode({
      type: 'image-generator',
      status: 'working',
      generatedAt: 1,
      outputs: [{
        id: 'output-1',
        mediaType: 'image',
        status: 'success',
        url: 'https://example.com/generated.png',
        generatedAt: 1,
      }],
    });

    const restored = sanitizeCanvasPersistedState({ items: [node] });

    expect(restored.items[0]?.ai?.status).toBe('error');
    expect(restored.items[0]?.ai?.outputs?.[0]?.status).toBe('success');
  });

  it('keeps registered background runs working across canvas switches', () => {
    const node = createCanvasNode({
      type: 'image-generator',
      status: 'working',
      generatedAt: 1,
      outputs: [],
    });

    const restored = sanitizeCanvasPersistedState(
      { items: [node] },
      { activeRunNodeIds: new Set(['node-1']) },
    );

    expect(restored.items[0]?.ai?.status).toBe('working');
  });

  it('deep-clones drawer values', () => {
    const source = { folders: [{ id: 'folder-1' }] };
    const cloned = cloneDrawerValue(source);

    expect(cloned).toEqual(source);
    expect(cloned).not.toBe(source);
    expect(cloned.folders).not.toBe(source.folders);
  });
});
