import type { ChatAttachment } from '../../chat/model/chatTypes';
import { createChatVisionAttachmentResolver } from '../../chat/attachments/chatVisionAttachmentResolver';
import { requestChatCompletion, type ChatProviderResult } from '../../chat/runtime/chatStream';
import { mapSceneAnalysisToSceneSpec } from '../model/mapSceneAnalysisToSceneSpec';
import {
  parseSceneAnalysisResponse,
  SceneAnalysisResponseError,
} from '../model/threeSceneAnalysisSchema';
import type { SceneAnalysisV1 } from '../model/threeSceneAnalysisTypes';
import type { SceneSpecV1 } from '../model/threeSceneTypes';
import { repairSceneAnalysis } from './repairSceneAnalysis';
import {
  THREE_SCENE_ANALYSIS_JSON_ONLY_PROMPT,
  THREE_SCENE_ANALYSIS_SYSTEM_PROMPT,
} from './threeSceneAnalysisPrompt';

const enumSchema = (values: string[]) => ({ type: 'string', enum: values });
const normalizedPointSchema = {
  type: 'array',
  items: { type: 'number', minimum: 0, maximum: 1 },
  minItems: 2,
  maxItems: 2,
};

const sceneAnalysisTool = {
  type: 'function',
  function: {
    name: 'submit_three_scene_analysis',
    description: '提交图片的归一化二维构图分析；不包含任何 Three.js 世界坐标或 SceneSpec。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        version: { type: 'number', enum: [1] },
        composition: {
          type: 'object',
          additionalProperties: false,
          properties: {
            subjectCenter: normalizedPointSchema,
            subjectWidth: { type: 'number', minimum: 0.05, maximum: 0.95 },
            subjectHeight: { type: 'number', minimum: 0.05, maximum: 0.95 },
            subjectOrientation: enumSchema(['front', 'front-left', 'front-right', 'side-left', 'side-right', 'rear', 'unknown']),
            subjectElevation: enumSchema(['low', 'center', 'high']),
          },
          required: ['subjectCenter', 'subjectWidth', 'subjectHeight', 'subjectOrientation', 'subjectElevation'],
        },
        camera: {
          type: 'object',
          additionalProperties: false,
          properties: {
            azimuthDeg: { type: 'number', minimum: -180, maximum: 180 },
            elevationDeg: { type: 'number', minimum: -75, maximum: 75 },
            shot: enumSchema(['close', 'medium-close', 'medium', 'wide']),
            perspective: enumSchema(['flat', 'mild', 'moderate', 'strong']),
            horizonY: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['azimuthDeg', 'elevationDeg', 'shot', 'perspective', 'horizonY'],
        },
        ground: {
          type: 'object',
          additionalProperties: false,
          properties: {
            visible: { type: 'boolean' },
            horizonY: { type: 'number', minimum: 0, maximum: 1 },
            slope: enumSchema(['flat', 'slight-up', 'slight-down']),
          },
          required: ['visible', 'horizonY', 'slope'],
        },
        environment: {
          type: 'object',
          additionalProperties: false,
          properties: {
            backgroundColor: { type: 'string' },
            backgroundBrightness: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['backgroundColor', 'backgroundBrightness'],
        },
        lighting: {
          type: 'object',
          additionalProperties: false,
          properties: {
            keyDirection: enumSchema(['front', 'front-left', 'front-right', 'left', 'right', 'top', 'top-left', 'top-right', 'rear-left', 'rear-right']),
            softness: { type: 'number', minimum: 0, maximum: 1 },
            contrast: { type: 'number', minimum: 0, maximum: 1 },
            fillStrength: { type: 'number', minimum: 0, maximum: 1 },
          },
          required: ['keyDirection', 'softness', 'contrast', 'fillStrength'],
        },
        subject: {
          type: 'object',
          additionalProperties: false,
          properties: {
            shapeHint: enumSchema(['box', 'rounded-box', 'flat', 'tall', 'cylindrical', 'spherical', 'organic']),
            aspect: {
              type: 'array',
              items: { type: 'number', exclusiveMinimum: 0, maximum: 8 },
              minItems: 3,
              maxItems: 3,
            },
          },
          required: ['shapeHint', 'aspect'],
        },
        secondaryObjects: {
          type: 'array',
          maxItems: 4,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              role: { type: 'string' },
              center: normalizedPointSchema,
              width: { type: 'number', minimum: 0.02, maximum: 0.95 },
              height: { type: 'number', minimum: 0.02, maximum: 0.95 },
              depthOrder: enumSchema(['front', 'same', 'behind']),
              shapeHint: enumSchema(['box', 'flat', 'cylindrical']),
            },
            required: ['role', 'center', 'width', 'height', 'depthOrder'],
          },
        },
      },
      required: ['version', 'composition', 'camera', 'ground', 'environment', 'lighting', 'subject', 'secondaryObjects'],
    },
  },
};

export type ThreeSceneAnalysisImage = {
  id: string;
  source: string;
  name?: string;
};

export type ThreeSceneAnalysisResult = {
  analysis: SceneAnalysisV1;
  sceneSpec: SceneSpecV1;
};

export class ThreeSceneAnalysisError extends Error {
  constructor(
    public readonly stage: 'input' | 'upload' | 'vision' | 'analysis' | 'mapper',
    message: string,
  ) {
    super(message);
    this.name = 'ThreeSceneAnalysisError';
  }
}

const createRequestId = () => `three-analysis-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const providerResponseValue = (result: ChatProviderResult) => (
  result.toolCalls.find(call => call.name === 'submit_three_scene_analysis')?.arguments
  || result.content
);

export const analyzeImagesToThreeSceneResult = async (input: {
  images: ThreeSceneAnalysisImage[];
  model?: string;
  resolveImage?: (attachment: ChatAttachment) => Promise<{ url?: string; error?: string }>;
  requestCompletion?: (request: Parameters<typeof requestChatCompletion>[0]) => Promise<ChatProviderResult>;
}): Promise<ThreeSceneAnalysisResult> => {
  const images = input.images.filter(image => image.source.trim()).slice(0, 8);
  if (images.length === 0) {
    throw new ThreeSceneAnalysisError('input', '请先添加至少一张参考图片');
  }

  const resolver = input.resolveImage ? null : createChatVisionAttachmentResolver();
  try {
    const attachments: ChatAttachment[] = images.map((image, index) => ({
      id: `three-source-${image.id}-${index}`,
      messageId: `three-analysis-${image.id}-${index}`,
      type: 'image',
      path: image.source,
      createdAt: Date.now() + index,
    }));
    const resolved = await Promise.all(attachments.map(attachment => (
      (input.resolveImage || resolver!.resolve)(attachment)
    )));
    const failed = resolved.find(result => !result.url);
    if (failed) {
      console.error('Three scene reference preparation failed:', failed.error);
      throw new ThreeSceneAnalysisError('upload', '参考图片处理失败，请重试。');
    }

    const content: Array<Record<string, unknown>> = [{
      type: 'text',
      text: images.length > 1
        ? `以下 ${images.length} 张图片是同一主体的不同角度。请融合视角，只分析统一的二维构图语义和主体整体比例，不要进行部件建模。图片顺序：${images.map((image, index) => `${index + 1}. ${image.name || '未命名图片'}`).join('；')}`
        : `分析这张图片的二维构图关系：${images[0].name || '未命名图片'}`,
    }];
    resolved.forEach((result, index) => {
      content.push({ type: 'text', text: `参考视角 ${index + 1}` });
      content.push({ type: 'image_url', image_url: { url: result.url, detail: 'high' } });
    });
    const messages = [
      { role: 'system', content: THREE_SCENE_ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content },
    ];
    const request = input.requestCompletion || requestChatCompletion;
    let providerResult: ChatProviderResult;
    try {
      providerResult = await request({
        requestId: createRequestId(),
        model: input.model,
        stream: false,
        messages,
        tools: [sceneAnalysisTool],
        toolChoice: { type: 'function', function: { name: 'submit_three_scene_analysis' } },
      });
    } catch (structuredError) {
      console.warn('SceneAnalysis structured request failed, trying JSON-only compatibility mode:', structuredError);
      try {
        providerResult = await request({
          requestId: createRequestId(),
          model: input.model,
          stream: false,
          messages: [...messages, { role: 'system', content: THREE_SCENE_ANALYSIS_JSON_ONLY_PROMPT }],
          tools: [],
        });
      } catch (fallbackError) {
        console.error('SceneAnalysis vision request failed:', fallbackError);
        throw new ThreeSceneAnalysisError('vision', '图片分析失败，请重试。');
      }
    }

    const rawAnalysis = providerResponseValue(providerResult);
    let analysis: SceneAnalysisV1;
    try {
      analysis = parseSceneAnalysisResponse(rawAnalysis);
    } catch (parseError) {
      if (!(parseError instanceof SceneAnalysisResponseError)) throw parseError;
      console.warn('SceneAnalysis validation failed, attempting one JSON repair:', parseError.details);
      try {
        analysis = await repairSceneAnalysis({
          rawResponse: rawAnalysis,
          parseError,
          model: input.model,
          requestCompletion: request,
        });
      } catch (repairError) {
        console.error('SceneAnalysis JSON repair failed:', repairError);
        throw new ThreeSceneAnalysisError('analysis', '图片构图分析结果异常，请重试。');
      }
    }

    try {
      return {
        analysis,
        sceneSpec: mapSceneAnalysisToSceneSpec(analysis),
      };
    } catch (mapperError) {
      console.error('Deterministic three scene mapper failed:', mapperError);
      throw new ThreeSceneAnalysisError('mapper', '3D 场景生成失败。');
    }
  } finally {
    await resolver?.dispose().catch(() => {});
  }
};

/** Existing callers that only need the mapped SceneSpec keep the old return shape. */
export const analyzeImagesToThreeScene = async (
  input: Parameters<typeof analyzeImagesToThreeSceneResult>[0],
) => (await analyzeImagesToThreeSceneResult(input)).sceneSpec;

export const analyzeImageToThreeScene = (input: {
  imageId: string;
  imageSource: string;
  imageName?: string;
  model?: string;
  resolveImage?: (attachment: ChatAttachment) => Promise<{ url?: string; error?: string }>;
  requestCompletion?: (request: Parameters<typeof requestChatCompletion>[0]) => Promise<ChatProviderResult>;
}) => analyzeImagesToThreeScene({
  images: [{ id: input.imageId, source: input.imageSource, name: input.imageName }],
  model: input.model,
  resolveImage: input.resolveImage,
  requestCompletion: input.requestCompletion,
});
