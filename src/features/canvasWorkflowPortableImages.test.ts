import { describe, expect, it, vi } from 'vitest';
import type { CanvasWorkflowTemplate } from './canvasTemplates';
import {
  embedCanvasWorkflowFixedImages,
  materializeCanvasWorkflowFixedImages,
} from './canvasWorkflowPortableImages';

const workflow: CanvasWorkflowTemplate = {
  id: 'workflow-1',
  label: 'Portable workflow',
  hint: 'Fixed master image workflow',
  nodes: [
    {
      id: 'fixed-image',
      x: 0,
      y: 0,
      width: 320,
      height: 320,
      item: {
        type: 'image',
        content: 'master.png',
        name: 'master.png',
        path: 'C:\\cache\\master.png',
        url: 'asset://localhost/master.png',
      },
      fixedInput: true,
    },
    {
      id: 'external-image',
      x: 0,
      y: 360,
      width: 320,
      height: 180,
      item: { type: 'file', content: 'External reference' },
      acceptsExternalInputs: true,
      externalInputTypes: ['image'],
      bridgeType: 'reference_image',
    },
    {
      id: 'generator',
      x: 400,
      y: 0,
      width: 320,
      height: 320,
      item: { type: 'text', content: '' },
      inputs: ['fixed-image', 'external-image'],
      ai: { type: 'image-generator' },
    },
  ],
};

describe('portable workflow fixed images', () => {
  it('embeds fixed images without touching external reference bridges', async () => {
    const readImageDataUrl = vi.fn(async () => 'data:image/png;base64,ZmFrZQ==');
    const [embedded] = await embedCanvasWorkflowFixedImages([workflow], readImageDataUrl);
    const fixedImage = embedded?.nodes.find(node => node.id === 'fixed-image');
    const externalImage = embedded?.nodes.find(node => node.id === 'external-image');

    expect(readImageDataUrl).toHaveBeenCalledWith('asset://localhost/master.png');
    expect(fixedImage?.item.url).toBe('data:image/png;base64,ZmFrZQ==');
    expect(fixedImage?.item.path).toBeUndefined();
    expect(externalImage).toEqual(workflow.nodes[1]);
    expect(embedded?.nodes.find(node => node.id === 'generator')?.inputs)
      .toEqual(['fixed-image', 'external-image']);
  });

  it('materializes embedded images into the local cache after import', async () => {
    const [embedded] = await embedCanvasWorkflowFixedImages(
      [workflow],
      async () => 'data:image/jpeg;base64,ZmFrZQ==',
    );
    const saveImageDataUrl = vi.fn(async () => 'C:\\app\\uploads\\master.jpg');
    const [materialized] = await materializeCanvasWorkflowFixedImages(
      embedded ? [embedded] : [],
      saveImageDataUrl,
      path => `asset://${path}`,
    );
    const fixedImage = materialized?.nodes.find(node => node.id === 'fixed-image');

    expect(saveImageDataUrl).toHaveBeenCalledWith('master.jpg', 'data:image/jpeg;base64,ZmFrZQ==');
    expect(fixedImage?.item.path).toBe('C:\\app\\uploads\\master.jpg');
    expect(fixedImage?.item.url).toBe('asset://C:\\app\\uploads\\master.jpg');
  });

  it('fails export instead of silently dropping an unreadable fixed image', async () => {
    await expect(embedCanvasWorkflowFixedImages([workflow], async () => {
      throw new Error('file missing');
    })).rejects.toThrow('master.png');
  });
});
