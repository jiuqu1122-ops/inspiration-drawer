import { describe, expect, it } from 'vitest';
import {
  buildCanvasAiOutputLocalCachePatch,
  createCanvasAiOutputBufferItem,
} from './canvasAiOutputs';
import type { CanvasImageItem } from './canvasModel';

describe('canvas AI output cache patches', () => {
  it('adds the local path without replacing the remote generation URL', () => {
    const patch = buildCanvasAiOutputLocalCachePatch('C:\\cache\\generated.png');

    expect(patch).toEqual({
      path: 'C:\\cache\\generated.png',
      cacheStatus: 'pending',
    });
    expect(patch).not.toHaveProperty('url');
  });

  it('keeps the stable API result URL when the preview uses a signed OSS URL', () => {
    const apiUrl = 'https://api.unmind.art/v1/ai/image-results/result.png';
    const signedUrl = 'https://inspiration-drawer-prod.oss-cn-hongkong.aliyuncs.com/generated-images/result.png?token=temporary';
    const canvasItem = {
      id: 'node-1',
      x: 0,
      y: 0,
      width: 320,
      height: 320,
      item: {
        id: 'item-1',
        type: 'image',
        content: 'result',
        createdAt: 1,
      },
      ai: { type: 'image-generator' },
    } as CanvasImageItem;
    const item = createCanvasAiOutputBufferItem(canvasItem, {
      id: 'output-1',
      status: 'success',
      mediaType: 'image',
      url: signedUrl,
      sourceUrl: apiUrl,
    }, 0);

    expect(item).toMatchObject({
      url: signedUrl,
      sourceUrl: apiUrl,
      originalUrl: apiUrl,
    });
  });
});
