import { describe, expect, it, vi } from 'vitest';
import type { CanvasWorkflowTemplate } from './canvasTemplates';
import {
  embedCanvasWorkflowFixedImages,
  hasCanvasWorkflowConcreteFixedImage,
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
  it('recognizes a fixed master image as a valid workflow reference source', () => {
    expect(hasCanvasWorkflowConcreteFixedImage(workflow)).toBe(true);
    expect(hasCanvasWorkflowConcreteFixedImage({
      ...workflow,
      nodes: workflow.nodes.filter(node => node.id !== 'fixed-image'),
    })).toBe(false);
  });

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

  it('adds a display URL when the native importer already restored the local image', async () => {
    const nativeMaterialized = {
      ...workflow,
      nodes: workflow.nodes.map(node => node.id === 'fixed-image'
        ? {
            ...node,
            item: {
              ...node.item,
              url: undefined,
              path: 'C:\\app\\uploads\\master.png',
            },
          }
        : node),
    };
    const saveImageDataUrl = vi.fn(async () => 'unused');
    const [materialized] = await materializeCanvasWorkflowFixedImages(
      [nativeMaterialized],
      saveImageDataUrl,
      path => `asset://${path}`,
    );

    expect(saveImageDataUrl).not.toHaveBeenCalled();
    expect(materialized?.nodes[0]?.item.url).toBe('asset://C:\\app\\uploads\\master.png');
  });

  it('restores multiple embedded images sequentially to avoid an IPC memory spike', async () => {
    const twoImageWorkflow: CanvasWorkflowTemplate = {
      ...workflow,
      nodes: [
        workflow.nodes[0],
        {
          ...workflow.nodes[0],
          id: 'fixed-image-2',
          item: {
            ...workflow.nodes[0].item,
            id: 'fixed-image-2',
            name: 'master-2.png',
            path: undefined,
            url: 'data:image/png;base64,dHdv',
          },
        },
        ...workflow.nodes.slice(1),
      ],
    };
    let active = 0;
    let peakActive = 0;
    const saveImageDataUrl = vi.fn(async (fileName: string) => {
      active += 1;
      peakActive = Math.max(peakActive, active);
      await Promise.resolve();
      active -= 1;
      return `C:\\app\\uploads\\${fileName}`;
    });

    await materializeCanvasWorkflowFixedImages(
      [{
        ...twoImageWorkflow,
        nodes: twoImageWorkflow.nodes.map(node => node.id === 'fixed-image'
          ? {
              ...node,
              item: {
                ...node.item,
                path: undefined,
                url: 'data:image/png;base64,b25l',
              },
            }
          : node),
      }],
      saveImageDataUrl,
      path => `asset://${path}`,
    );

    expect(saveImageDataUrl).toHaveBeenCalledTimes(2);
    expect(peakActive).toBe(1);
  });

  it('fails export instead of silently dropping an unreadable fixed image', async () => {
    await expect(embedCanvasWorkflowFixedImages([workflow], async () => {
      throw new Error('file missing');
    })).rejects.toThrow('master.png');
  });
});
