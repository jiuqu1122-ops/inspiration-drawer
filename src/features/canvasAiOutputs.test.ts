import { describe, expect, it } from 'vitest';
import {
  CANVAS_AI_COLLAPSED_OUTPUT_PREVIEW_LIMIT,
  buildCanvasAiOutputLocalCachePatch,
  buildCanvasAiOutputRemoteResultPatch,
  createCanvasAiOutputBufferItem,
  getCanvasAiVisibleOutputs,
  isCanvasAiImageOutputReadyForWorkflowDependency,
  recoverCanvasAiNodeWithUsableResults,
  recoverCanvasAiOutputWithUsableResult,
} from './canvasAiOutputs';
import type { CanvasImageItem } from './canvasModel';

describe('canvas AI output cache patches', () => {
  it('keeps generator nodes compact until the user expands all outputs', () => {
    const outputs = Array.from({ length: 20 }, (_, index) => index);
    expect(CANVAS_AI_COLLAPSED_OUTPUT_PREVIEW_LIMIT).toBe(6);
    expect(getCanvasAiVisibleOutputs(outputs)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(getCanvasAiVisibleOutputs(outputs, true)).toEqual(outputs);
  });

  it('adds the local path without replacing the remote generation URL', () => {
    const patch = buildCanvasAiOutputLocalCachePatch('C:\\cache\\generated.png');

    expect(patch).toEqual({
      path: 'C:\\cache\\generated.png',
      cacheStatus: 'pending',
    });
    expect(patch).not.toHaveProperty('url');
  });

  it('publishes a remote generation result while local caching is still pending', () => {
    expect(buildCanvasAiOutputRemoteResultPatch(' https://example.com/generated.png ')).toEqual({
      url: 'https://example.com/generated.png',
      sourceUrl: 'https://example.com/generated.png',
      path: undefined,
      cacheStatus: 'pending',
    });
  });

  it('does not release a workflow image dependency until the local file exists', () => {
    expect(isCanvasAiImageOutputReadyForWorkflowDependency({
      id: 'remote-output',
      status: 'success',
      url: 'https://example.com/generated.png',
      cacheStatus: 'pending',
    })).toBe(false);

    expect(isCanvasAiImageOutputReadyForWorkflowDependency({
      id: 'local-output',
      status: 'success',
      url: 'asset://localhost/generated.png',
      path: 'C:\\cache\\generated.png',
      cacheStatus: 'pending',
    })).toBe(true);
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

  it('does not copy generation prompts into drawer image notes', () => {
    const canvasItem = {
      id: 'node-1',
      x: 0,
      y: 0,
      width: 320,
      height: 320,
      item: {
        id: 'item-1',
        type: 'image',
        content: 'canvas prompt',
        createdAt: 1,
      },
      ai: {
        type: 'image-generator',
        prompt: 'node prompt',
      },
    } as CanvasImageItem;

    const item = createCanvasAiOutputBufferItem(canvasItem, {
      id: 'output-1',
      status: 'success',
      mediaType: 'image',
      url: 'https://example.com/generated.png',
      prompt: 'output prompt',
    }, 0);

    expect(item).not.toHaveProperty('remark');
    expect(item).not.toHaveProperty('remarks');
  });

  it('recovers a late image result that arrived after the output timed out', () => {
    const recovered = recoverCanvasAiOutputWithUsableResult({
      id: 'output-1',
      status: 'error',
      error: '图片生成任务等待超过 6 分钟，已自动取消',
      url: 'asset://localhost/generated.png',
    });

    expect(recovered).toMatchObject({
      id: 'output-1',
      status: 'success',
      url: 'asset://localhost/generated.png',
    });
    expect(recovered.error).toBeUndefined();
  });

  it('keeps a failed output failed when no usable image arrived', () => {
    const output = {
      id: 'output-1',
      status: 'error' as const,
      error: '生成失败',
    };

    expect(recoverCanvasAiOutputWithUsableResult(output)).toBe(output);
  });

  it('recovers the node only after every requested output has a usable result', () => {
    const baseItem = {
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
      ai: {
        type: 'image-generator',
        status: 'error',
        error: '生成超时',
        outputs: [
          { id: 'output-1', status: 'error', error: '生成超时', url: 'asset://localhost/one.png' },
          { id: 'output-2', status: 'error', error: '生成超时' },
        ],
      },
    } as CanvasImageItem;

    const partial = recoverCanvasAiNodeWithUsableResults(baseItem);
    expect(partial.ai?.status).toBe('error');
    expect(partial.ai?.outputs?.[0].status).toBe('success');
    expect(partial.ai?.outputs?.[1].status).toBe('error');

    const complete = recoverCanvasAiNodeWithUsableResults({
      ...baseItem,
      ai: {
        ...baseItem.ai!,
        outputs: [
          ...baseItem.ai!.outputs!.slice(0, 1),
          { ...baseItem.ai!.outputs![1], url: 'https://example.com/two.png' },
        ],
      },
    });
    expect(complete.ai?.status).toBe('success');
    expect(complete.ai?.error).toBeUndefined();
    expect(complete.ai?.outputs?.every(output => output.status === 'success')).toBe(true);
  });
});
