import { describe, expect, it, vi } from 'vitest';
import type { ChatProviderResult } from '../../chat/runtime/chatStream';
import { mapSceneAnalysisToSceneSpec } from '../model/mapSceneAnalysisToSceneSpec';
import { normalizeSceneAnalysis } from '../model/threeSceneAnalysisSchema';
import {
  analyzeImagesToThreeScene,
  analyzeImageToThreeScene,
  ThreeSceneAnalysisError,
} from './analyzeImageToThreeScene';

const createAnalysis = () => normalizeSceneAnalysis({
  version: 1,
  composition: {
    subjectCenter: [0.52, 0.54],
    subjectWidth: 0.58,
    subjectHeight: 0.42,
    subjectOrientation: 'front-right',
    subjectElevation: 'center',
  },
  camera: {
    azimuthDeg: 35,
    elevationDeg: 10,
    shot: 'medium-close',
    perspective: 'moderate',
    horizonY: 0.62,
  },
  ground: { visible: true, horizonY: 0.64, slope: 'flat' },
  environment: { backgroundColor: '#d8d8d8', backgroundBrightness: 0.8 },
  lighting: { keyDirection: 'top-left', softness: 0.78, contrast: 0.36, fillStrength: 0.44 },
  subject: { shapeHint: 'rounded-box', aspect: [1.7, 1, 1.1] },
  secondaryObjects: [],
});

describe('analyzeImageToThreeScene', () => {
  it('uses the existing vision gateway and maps semantic analysis locally', async () => {
    const analysis = createAnalysis();
    const resolveImage = vi.fn(async () => ({ url: 'reference-images/source-123.jpg' }));
    const requestCompletion = vi.fn(async (request): Promise<ChatProviderResult> => ({
      requestId: request.requestId,
      content: '',
      toolCalls: [{
        id: 'call-1',
        name: 'submit_three_scene_analysis',
        arguments: JSON.stringify(analysis),
      }],
      finishReason: 'tool_calls',
    }));

    await expect(analyzeImageToThreeScene({
      imageId: 'canvas-image',
      imageSource: 'asset://local-large-image.jpg',
      imageName: '产品图',
      model: 'gpt-5.6-sol',
      resolveImage,
      requestCompletion,
    })).resolves.toEqual(mapSceneAnalysisToSceneSpec(analysis));

    expect(resolveImage).toHaveBeenCalledWith(expect.objectContaining({
      path: 'asset://local-large-image.jpg',
      type: 'image',
    }));
    const request = requestCompletion.mock.calls[0][0];
    const serialized = JSON.stringify(request);
    expect(serialized).toContain('reference-images/source-123.jpg');
    expect(serialized).not.toContain('data:image');
    expect(serialized).not.toContain('asset://local-large-image.jpg');
    expect(request.model).toBe('gpt-5.6-sol');
    expect(request.toolChoice).toEqual({
      type: 'function',
      function: { name: 'submit_three_scene_analysis' },
    });
    const toolParameters = JSON.stringify(request.tools);
    expect(toolParameters).not.toContain('camera.position');
    expect(toolParameters).not.toContain('fov');
    expect(toolParameters).not.toContain('scale');
  });

  it('sends multiple ordered views as one semantic-analysis request', async () => {
    const analysis = createAnalysis();
    const resolveImage = vi.fn(async (attachment: { id: string }) => ({
      url: `reference-images/${attachment.id}.jpg`,
    }));
    const requestCompletion = vi.fn(async (request): Promise<ChatProviderResult> => ({
      requestId: request.requestId,
      content: JSON.stringify(analysis),
      toolCalls: [],
    }));

    await expect(analyzeImagesToThreeScene({
      images: [
        { id: 'front', source: 'asset://front.jpg', name: '正面' },
        { id: 'side', source: 'asset://side.jpg', name: '侧面' },
        { id: 'back', source: 'asset://back.jpg', name: '背面' },
      ],
      resolveImage,
      requestCompletion,
    })).resolves.toEqual(mapSceneAnalysisToSceneSpec(analysis));

    expect(resolveImage).toHaveBeenCalledTimes(3);
    const serialized = JSON.stringify(requestCompletion.mock.calls[0][0]);
    expect(serialized).toContain('同一主体的不同角度');
    expect(serialized).toContain('reference-images/three-source-front-0.jpg');
    expect(serialized).toContain('reference-images/three-source-side-1.jpg');
    expect(serialized).toContain('reference-images/three-source-back-2.jpg');
  });

  it('falls back to JSON-only semantic analysis when tool calls are unsupported', async () => {
    const analysis = createAnalysis();
    const requestCompletion = vi.fn()
      .mockRejectedValueOnce(new Error('tool_choice is unsupported'))
      .mockResolvedValueOnce({
        requestId: 'fallback',
        content: JSON.stringify(analysis),
        toolCalls: [],
      } satisfies ChatProviderResult);

    await expect(analyzeImagesToThreeScene({
      images: [{ id: 'front', source: 'https://example.com/front.jpg' }],
      resolveImage: async () => ({ url: 'https://example.com/front.jpg' }),
      requestCompletion,
    })).resolves.toEqual(mapSceneAnalysisToSceneSpec(analysis));

    expect(requestCompletion).toHaveBeenCalledTimes(2);
    expect(requestCompletion.mock.calls[1][0].tools).toEqual([]);
  });

  it('repairs malformed SceneAnalysis JSON once without asking the user', async () => {
    const analysis = createAnalysis();
    const requestCompletion = vi.fn()
      .mockResolvedValueOnce({ requestId: 'invalid', content: 'not-json', toolCalls: [] } satisfies ChatProviderResult)
      .mockResolvedValueOnce({ requestId: 'repair', content: JSON.stringify(analysis), toolCalls: [] } satisfies ChatProviderResult);

    await expect(analyzeImagesToThreeScene({
      images: [{ id: 'front', source: 'https://example.com/front.jpg' }],
      resolveImage: async () => ({ url: 'https://example.com/front.jpg' }),
      requestCompletion,
    })).resolves.toEqual(mapSceneAnalysisToSceneSpec(analysis));

    expect(requestCompletion).toHaveBeenCalledTimes(2);
    const repairRequest = JSON.stringify(requestCompletion.mock.calls[1][0]);
    expect(repairRequest).toContain('只负责修复 JSON 结构');
    expect(repairRequest).not.toContain('image_url');
  });

  it('returns a friendly analysis error when the single repair also fails', async () => {
    const requestCompletion = vi.fn()
      .mockResolvedValueOnce({ requestId: 'invalid', content: 'not-json', toolCalls: [] } satisfies ChatProviderResult)
      .mockResolvedValueOnce({ requestId: 'repair-invalid', content: 'still-not-json', toolCalls: [] } satisfies ChatProviderResult);

    await expect(analyzeImagesToThreeScene({
      images: [{ id: 'front', source: 'https://example.com/front.jpg' }],
      resolveImage: async () => ({ url: 'https://example.com/front.jpg' }),
      requestCompletion,
    })).rejects.toMatchObject({
      stage: 'analysis',
      message: '图片构图分析结果异常，请重试。',
    } satisfies Partial<ThreeSceneAnalysisError>);
    expect(requestCompletion).toHaveBeenCalledTimes(2);
  });

  it('reports reference preparation failures separately from vision failures', async () => {
    const requestCompletion = vi.fn();
    await expect(analyzeImagesToThreeScene({
      images: [{ id: 'front', source: 'asset://front.jpg' }],
      resolveImage: async () => ({ error: 'upload unavailable' }),
      requestCompletion,
    })).rejects.toMatchObject({
      stage: 'upload',
      message: '参考图片处理失败，请重试。',
    } satisfies Partial<ThreeSceneAnalysisError>);
    expect(requestCompletion).not.toHaveBeenCalled();
  });
});
