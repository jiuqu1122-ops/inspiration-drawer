import { describe, expect, it } from 'vitest';
import type { BufferItem } from '../types';
import { buildCanvasGeneratedItemsForList } from './canvasGeneratedList';
import type { CanvasImageItem } from './canvasModel';

const node = (id: string, type: BufferItem['type']): CanvasImageItem => ({
  id,
  item: { id: `${id}-asset`, type, content: id, name: id, createdAt: 1 },
  x: 0,
  y: 0,
  width: 320,
  height: 240,
});

describe('canvas generated list', () => {
  it('includes one Chat image and video while excluding ordinary manual media', () => {
    const chatImage = {
      ...node('chat-image', 'image'),
      chatGeneratedMedia: { mediaId: 'media-image', mediaType: 'image' as const, prompt: '图片', generatedAt: 20 },
    };
    const chatVideo = {
      ...node('chat-video', 'video'),
      chatGeneratedMedia: { mediaId: 'media-video', mediaType: 'video' as const, prompt: '视频', generatedAt: 21 },
    };
    const entries = buildCanvasGeneratedItemsForList([
      node('manual-image', 'image'),
      node('manual-video', 'video'),
      chatImage,
      chatVideo,
    ]);

    expect(entries.map(entry => [entry.item.type, entry.source])).toEqual([
      ['video', 'chat'],
      ['image', 'chat'],
    ]);
  });

  it('does not duplicate a Chat-provenance item already represented by generated output identity', () => {
    const generator: CanvasImageItem = {
      ...node('generator', 'text'),
      ai: {
        type: 'image-generator',
        status: 'success',
        outputs: [{ id: 'shared-media', mediaType: 'image', url: 'https://example.com/shared.png', status: 'success', generatedAt: 10 }],
      },
    };
    const chatCopy = {
      ...node('chat-copy', 'image'),
      item: { ...node('chat-copy', 'image').item, id: 'shared-media' },
      chatGeneratedMedia: { mediaId: 'shared-media', mediaType: 'image' as const, generatedAt: 10 },
    };

    const entries = buildCanvasGeneratedItemsForList([generator, chatCopy]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.item.id).toBe('shared-media');
  });
});
