import { describe, expect, it, vi } from 'vitest';
import type { BufferItem } from '../types';
import type { CanvasImageItem } from '../features/canvasModel';
import type { CanvasWorkflowTemplate } from '../features/canvasTemplates';
import { CANVAS_BUILT_IN_WORKFLOWS } from './canvasWorkflowDefinitions';
import {
  CANVAS_IMAGE_SOURCE_UPGRADE_PREVIEW_SIZE,
  canUseCanvasItemAsAiTarget,
  canUseCanvasItemAsFrameInterpolationVideoInput,
  canUseCanvasItemAsImageEnhancementInput,
  canUseCanvasItemAsInputForTarget,
  createCanvasAiOutputBufferItem,
  getCanvasAiInputSourceCandidates,
  getCanvasAiOutputSize,
  getCanvasAiOutputDisplaySource,
  getCanvasAiSuccessfulOutputs,
  getCanvasBufferItemNavPreview,
  getCanvasImageUpgradeFailureKey,
  getCanvasInitialImageSource,
  getCanvasInputTargetLabel,
  getCanvasItemDisplaySource,
  getCanvasOriginalImageSource,
  getCanvasOutputNavPreview,
  getCanvasWorkflowGroupIdForSelection,
  getCanvasWorkflowTemplateFromNode,
  isDirectCanvasAiInputSource,
} from './canvasItemSelectors';

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://converted/${path}`,
  invoke: vi.fn(),
}));

const createCanvasItem = (
  patch: Omit<Partial<CanvasImageItem>, 'item'> & { item?: Partial<BufferItem> } = {},
): CanvasImageItem => {
  const { item, ...canvasPatch } = patch;
  return {
    id: 'node-1',
    x: 10,
    y: 20,
    width: 320,
    height: 240,
    ...canvasPatch,
    item: {
      id: 'item-1',
      type: 'image',
      content: 'canvas item',
      createdAt: 100,
      ...item,
    },
  };
};

const createWorkflow = (
  userInput?: CanvasWorkflowTemplate['userInput'],
): CanvasWorkflowTemplate => ({
  id: 'workflow-test',
  label: 'Workflow Test',
  hint: 'Selector test workflow',
  userInput,
  nodes: [{
    id: 'workflow-node-1',
    x: 0,
    y: 0,
    width: 320,
    height: 200,
    item: {
      type: 'text',
      content: 'workflow node',
    },
    ai: { type: 'image-generator' },
  }],
});

describe('canvas item selectors', () => {
  it('prefers a completed local output cache over a remote preview URL', () => {
    expect(getCanvasAiOutputDisplaySource({
      id: 'output-1',
      status: 'success',
      mediaType: 'image',
      url: 'https://api.unmind.art/v1/ai/image-results/result.png',
      path: 'C:\\cache\\result.png',
    })).toBe('asset://converted/C:\\cache\\result.png');
  });

  it('preserves display, initial, original, and upgrade source rules', () => {
    const image = {
      id: 'image-1',
      type: 'image',
      content: 'image',
      createdAt: 1,
      path: 'C:\\images\\source.png',
      url: 'https://example.com/source.png',
      thumbnail: 'data:image/png;base64,thumb',
    } satisfies BufferItem;

    expect(getCanvasItemDisplaySource(image)).toBe('https://example.com/source.png');
    expect(getCanvasInitialImageSource(image)).toBe('data:image/png;base64,thumb');
    expect(getCanvasOriginalImageSource(image)).toBe('asset://converted/C:\\images\\source.png');

    const canvasItem = createCanvasItem({ id: 'canvas-image', item: image });
    expect(getCanvasImageUpgradeFailureKey(canvasItem)).toBe(
      `canvas-image:C:\\images\\source.png:${CANVAS_IMAGE_SOURCE_UPGRADE_PREVIEW_SIZE}`,
    );
  });

  it('recovers usable generated outputs and keeps media input predicates', () => {
    const generated = createCanvasItem({
      item: { type: 'text' },
      ai: {
        type: 'image-generator',
        outputs: [{
          id: 'late-output',
          mediaType: 'video',
          status: 'error',
          error: 'timed out',
          url: 'https://example.com/result.mp4',
        }],
      },
    });

    expect(getCanvasAiSuccessfulOutputs(generated)).toMatchObject([{
      id: 'late-output',
      status: 'success',
    }]);
    expect(canUseCanvasItemAsFrameInterpolationVideoInput(generated)).toBe(true);
    expect(canUseCanvasItemAsImageEnhancementInput(generated)).toBe(false);
  });

  it('preserves workflow input policy and special target routing', () => {
    const image = createCanvasItem({ item: { type: 'image' } });
    const file = createCanvasItem({ id: 'file-node', item: { id: 'file-item', type: 'file' } });
    const workflowTarget = createCanvasItem({
      id: 'workflow-target',
      ai: {
        type: 'workflow',
        workflow: createWorkflow({ enabled: true, acceptImages: false, acceptFiles: true }),
      },
    });

    expect(canUseCanvasItemAsInputForTarget(image, workflowTarget)).toBe(false);
    expect(canUseCanvasItemAsInputForTarget(file, workflowTarget)).toBe(true);

    const bridgeTarget = createCanvasItem({
      id: 'bridge-target',
      workflowBridge: { type: 'reference-image', label: 'Reference' },
    });
    expect(canUseCanvasItemAsInputForTarget(image, bridgeTarget)).toBe(true);
    expect(canUseCanvasItemAsInputForTarget(file, bridgeTarget)).toBe(false);

    const textAgent = createCanvasItem({ item: { type: 'text' }, textMode: 'agent' });
    expect(canUseCanvasItemAsAiTarget(textAgent)).toBe(true);
    expect(getCanvasInputTargetLabel(bridgeTarget)).toBe('Reference');
  });

  it('keeps generated drawer item and navigator preview mappings', () => {
    const generator = createCanvasItem({
      item: { id: 'generator-item', name: 'Product Render' },
      ai: { type: 'image-generator', generatedAt: 50 },
    });
    const output = {
      id: 'output-1',
      mediaType: 'image' as const,
      status: 'success' as const,
      url: 'https://example.com/generated.png',
      thumbnail: 'data:image/png;base64,preview',
    };

    expect(createCanvasAiOutputBufferItem(generator, output, 0)).toEqual({
      id: 'output-1',
      type: 'image',
      content: 'Product Render #1',
      name: 'Product Render #1',
      url: 'https://example.com/generated.png',
      path: undefined,
      thumbnail: 'data:image/png;base64,preview',
      sourceUrl: 'https://example.com/generated.png',
      originalUrl: 'https://example.com/generated.png',
      createdAt: 50,
      isQuickAccess: false,
    });

    expect(getCanvasBufferItemNavPreview({
      id: 'video-1',
      type: 'video',
      content: 'video',
      createdAt: 1,
      url: 'https://example.com/video.mp4',
    })).toEqual({ source: 'https://example.com/video.mp4', mediaType: 'video' });
    expect(getCanvasOutputNavPreview(generator, output)).toEqual({
      source: 'data:image/png;base64,preview',
      mediaType: 'image',
    });
    expect(getCanvasOutputNavPreview(generator, { ...output, status: 'error' })).toBeNull();
  });

  it('keeps candidate ordering, deduplication, and direct-source detection', () => {
    const image = {
      id: 'image-1',
      type: 'image',
      content: 'image',
      createdAt: 1,
      path: 'C:\\images\\source.png',
      url: 'https://example.com/source.png',
      sourceUrl: 'https://example.com/source.png',
      thumbnail: 'data:image/png;base64,thumb',
    } satisfies BufferItem;

    expect(getCanvasAiInputSourceCandidates(image)).toEqual([
      'https://example.com/source.png',
      'asset://converted/C:\\images\\source.png',
      'C:\\images\\source.png',
      'data:image/png;base64,thumb',
    ]);
    expect(isDirectCanvasAiInputSource('data:image/png;base64,AAAA')).toBe(true);
    expect(isDirectCanvasAiInputSource('asset://localhost/image.png')).toBe(true);
    expect(isDirectCanvasAiInputSource('https://example.com/image.png')).toBe(false);
  });

  it('keeps output sizing, workflow groups, and built-in workflow resolution', () => {
    expect(getCanvasAiOutputSize('16:9')).toEqual({ width: 320, height: 180 });
    expect(getCanvasAiOutputSize('9:16')).toEqual({ width: 169, height: 300 });

    const grouped = createCanvasItem({ workflowGroup: { groupId: 'group-1' } });
    expect(getCanvasWorkflowGroupIdForSelection(grouped)).toBe('group-1');

    const builtIn = CANVAS_BUILT_IN_WORKFLOWS[0];
    const workflowNode = createCanvasItem({
      ai: {
        type: 'workflow',
        presetId: builtIn.id,
        workflow: builtIn,
      },
    });
    expect(getCanvasWorkflowTemplateFromNode(workflowNode)).toBe(builtIn);
    expect(getCanvasWorkflowTemplateFromNode(createCanvasItem())).toBeNull();
  });
});
