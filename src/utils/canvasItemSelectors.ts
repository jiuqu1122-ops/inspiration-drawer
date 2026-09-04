import { convertFileSrc } from '@tauri-apps/api/core';
import type { BufferItem } from '../types';
import type { CanvasNavPreview } from '../types/canvasMedia';
import type { CanvasWorkflowExpandedGroup } from '../types/canvasWorkflow';
import type { CanvasAiGeneratedOutput, CanvasImageItem } from '../features/canvasModel';
import {
  getCanvasAiMediaType,
  getCanvasAiNodeTitle,
  isCanvasAiGeneratorType,
} from '../features/canvasAiRuntime';
import { recoverCanvasAiOutputWithUsableResult } from '../features/canvasAiOutputs';
import { normalizeCanvasWorkflowUserInput } from '../features/canvasWorkflowUserInput';
import {
  DESIGN_AGENT_ROLE_LABELS,
  normalizeDesignAgentConfig,
} from '../features/designAgentNode';
import { normalizeCanvasWorkflowTemplate } from '../services/canvasTemplateStorage';
import {
  CANVAS_AI_DEFAULT_ASPECT_RATIO,
  parseCanvasAspectRatioValue,
} from './canvasAiAspectRatio';
import { isRemoteHttpImageSource } from './canvasImageData';
import { isDataMediaSourceValue } from './canvasSerialization';
import { CANVAS_BUILT_IN_WORKFLOWS } from './canvasWorkflowDefinitions';
import { isCanvasAudioFileName } from './localMediaPaths';
import { resolveLocalImageSource } from './localImageSource';

export const CANVAS_IMAGE_SOURCE_UPGRADE_PREVIEW_SIZE = 1024;

export const getCanvasItemDisplaySource = (item: BufferItem) => (
  item.url ||
  (item.path ? convertFileSrc(item.path) : '') ||
  item.thumbnail ||
  ''
);

export const getCanvasItemThumbnailSource = (item: BufferItem) => (
  item.thumbnail || ''
);

export const getCanvasInitialImageSource = (item: BufferItem) => (
  item.type === 'image'
    ? getCanvasItemThumbnailSource(item)
    : getCanvasItemDisplaySource(item)
);

export const getCanvasOriginalImageSource = (item: BufferItem) => {
  if (item.type !== 'image') return '';
  const path = String(item.path || '').trim();
  return resolveLocalImageSource(path || item.url || item.sourceUrl || item.originalUrl);
};

export const getCanvasImageUpgradeLocalPath = (canvasItem: CanvasImageItem) => {
  const path = (canvasItem.item.path || '').trim();
  if (!path || /^(?:https?:|data:|asset:|file:|blob:)/i.test(path)) return '';
  return path;
};

export const getCanvasImageUpgradeFailureKey = (canvasItem: CanvasImageItem) => (
  `${canvasItem.id}:${getCanvasImageUpgradeLocalPath(canvasItem)}:${CANVAS_IMAGE_SOURCE_UPGRADE_PREVIEW_SIZE}`
);

export const getCanvasAiOutputDisplaySource = (output?: CanvasAiGeneratedOutput | null) => (
  (output?.path ? convertFileSrc(output.path) : '') ||
  output?.url ||
  ''
);

export const getCanvasAiOutputThumbnailSource = (output?: CanvasAiGeneratedOutput | null) => (
  output?.thumbnail || getCanvasAiOutputDisplaySource(output)
);

export const getCanvasAiSuccessfulOutputs = (canvasItem?: CanvasImageItem | null) => (
  (isCanvasAiGeneratorType(canvasItem?.ai?.type) || canvasItem?.ai?.type === 'workflow')
    ? (canvasItem.ai.outputs || [])
      .map(recoverCanvasAiOutputWithUsableResult)
      .filter(output => output.status === 'success' && getCanvasAiOutputDisplaySource(output))
    : []
);

export const canUseCanvasItemAsAiInput = (canvasItem?: CanvasImageItem | null) => (
  !!canvasItem && canvasItem.item.type !== 'three-scene'
);

export const canUseCanvasItemAsFrameInterpolationVideoInput = (canvasItem?: CanvasImageItem | null) => {
  if (!canvasItem) return false;
  if (canvasItem.item.type === 'video') return true;
  return getCanvasAiSuccessfulOutputs(canvasItem).some(output => (
    (output.mediaType || getCanvasAiMediaType(canvasItem.ai)) === 'video' && !!getCanvasAiOutputDisplaySource(output)
  ));
};

export const canUseCanvasItemAsImageEnhancementInput = (canvasItem?: CanvasImageItem | null) => {
  if (!canvasItem) return false;
  if (canvasItem.item.type === 'image') return true;
  return getCanvasAiSuccessfulOutputs(canvasItem).some(output => (
    (output.mediaType || getCanvasAiMediaType(canvasItem.ai)) === 'image' && !!getCanvasAiOutputDisplaySource(output)
  ));
};

export const canUseCanvasItemAsVideoEnhancementInput = (canvasItem?: CanvasImageItem | null) => (
  canUseCanvasItemAsFrameInterpolationVideoInput(canvasItem)
);

export const canUseCanvasItemAsWorkflowMaterial = (
  canvasItem: CanvasImageItem | null | undefined,
  configValue: unknown,
) => {
  if (!canvasItem) return false;
  const userInput = normalizeCanvasWorkflowUserInput(configValue);
  const isImageInput = canvasItem.item.type === 'image'
    || canvasItem.ai?.type === 'image-generator'
    || canvasItem.ai?.type === 'workflow'
    || canUseCanvasItemAsImageEnhancementInput(canvasItem);
  if (isImageInput) return userInput.acceptImages !== false;
  if (canvasItem.item.type === 'file' && !isCanvasWorkflowReferenceBridge(canvasItem)) {
    return userInput.acceptFiles === true;
  }
  return true;
};

export const isCanvasWorkflowReferenceBridge = (canvasItem?: CanvasImageItem | null) => (
  canvasItem?.workflowBridge?.type === 'reference-image'
);

export const canUseCanvasItemAsReferenceBridgeInput = (canvasItem?: CanvasImageItem | null) => (
  canUseCanvasItemAsImageEnhancementInput(canvasItem)
);

export const canUseCanvasItemAsInputForTarget = (
  source?: CanvasImageItem | null,
  target?: CanvasImageItem | null,
) => {
  if (target?.item.type === 'three-scene') {
    return canUseCanvasItemAsImageEnhancementInput(source);
  }
  if (target?.ai?.type === 'workflow') {
    if (!canUseCanvasItemAsWorkflowMaterial(source, getCanvasWorkflowTemplateFromNode(target)?.userInput)) return false;
  }
  return isCanvasWorkflowReferenceBridge(target)
    ? canUseCanvasItemAsReferenceBridgeInput(source)
    : target?.ai?.type === 'frame-interpolation'
      ? canUseCanvasItemAsFrameInterpolationVideoInput(source)
      : target?.ai?.type === 'image-enhancement'
        ? canUseCanvasItemAsImageEnhancementInput(source)
        : target?.ai?.type === 'video-enhancement'
          ? canUseCanvasItemAsVideoEnhancementInput(source)
          : canUseCanvasItemAsAiInput(source);
};

export const isCanvasAgentTextTarget = (canvasItem?: CanvasImageItem | null) => (
  !!canvasItem && canvasItem.item.type === 'text' && !canvasItem.ai && canvasItem.textMode !== 'plain'
);

export const canUseCanvasItemAsAiTarget = (canvasItem?: CanvasImageItem | null) => (
  isCanvasAiGeneratorType(canvasItem?.ai?.type)
  || canvasItem?.ai?.type === 'workflow'
  || canvasItem?.item.type === 'three-scene'
  || isCanvasAgentTextTarget(canvasItem)
  || isCanvasWorkflowReferenceBridge(canvasItem)
);

export const getCanvasInputTargetLabel = (canvasItem?: CanvasImageItem | null) => (
  canvasItem?.item.type === 'three-scene'
    ? '3D 场景节点'
    : isCanvasWorkflowReferenceBridge(canvasItem)
    ? canvasItem?.workflowBridge?.label || canvasItem?.item.name || '参考图桥接'
    : isCanvasAgentTextTarget(canvasItem)
    ? `Design Agent · ${DESIGN_AGENT_ROLE_LABELS[normalizeDesignAgentConfig(canvasItem?.designAgentConfig).agentRole]}`
    : canvasItem?.ai?.type === 'workflow'
      ? canvasItem.ai?.presetLabel || canvasItem.item.name || '工作流模块'
      : getCanvasAiNodeTitle(canvasItem?.ai)
);

export const hasCanvasAiGeneratedResults = (canvasItem?: CanvasImageItem | null) => (
  getCanvasAiSuccessfulOutputs(canvasItem).length > 0
);

export const createCanvasAiOutputBufferItem = (
  canvasItem: CanvasImageItem,
  output: CanvasAiGeneratedOutput,
  index: number
): BufferItem | null => {
  const source = getCanvasAiOutputDisplaySource(output);
  if (!source && output.status !== 'working' && output.status !== 'error') return null;
  const mediaType = output.mediaType || getCanvasAiMediaType(canvasItem.ai);
  const titleSeed = (canvasItem.ai?.presetLabel || canvasItem.item.name || canvasItem.item.content || '').trim();
  const name = output.name || (titleSeed ? `${titleSeed} #${index + 1}` : `AI generated ${mediaType} #${index + 1}`);
  const generatedAt = output.generatedAt || canvasItem.ai?.generatedAt || canvasItem.item.createdAt || Date.now();
  const rawUrl = (output.url || source).trim();
  const rawPath = (output.path || '').trim();
  const remoteSource = /^https?:\/\//i.test(rawUrl) ? rawUrl : '';
  return {
    id: output.id || `${canvasItem.item.id}-output-${index + 1}`,
    type: mediaType,
    content: name,
    name,
    url: rawUrl,
    path: rawPath || undefined,
    thumbnail: output.thumbnail || undefined,
    sourceUrl: remoteSource || undefined,
    originalUrl: remoteSource || undefined,
    createdAt: generatedAt,
    isQuickAccess: false,
  };
};

export const getCanvasItemNavSource = (item: BufferItem) => (
  (item.type === 'image' || item.type === 'video')
    ? item.thumbnail || ''
    : getCanvasItemDisplaySource(item)
);

export const getCanvasBufferItemNavPreview = (item?: BufferItem | null): CanvasNavPreview | null => {
  if (!item) return null;
  if (item.type === 'three-scene') {
    return item.thumbnail ? { source: item.thumbnail, mediaType: 'image' } : null;
  }
  if (item.type === 'image') {
    const source = getCanvasItemNavSource(item);
    return source ? { source, mediaType: 'image' } : null;
  }
  if (item.type === 'video') {
    if (item.thumbnail) return { source: item.thumbnail, mediaType: 'image' };
    const source = getCanvasItemDisplaySource(item);
    return source ? { source, mediaType: 'video' } : null;
  }
  return null;
};

export const getCanvasOutputNavPreview = (
  canvasItem: CanvasImageItem,
  output?: CanvasAiGeneratedOutput | null
): CanvasNavPreview | null => {
  const mediaType = output?.mediaType || getCanvasAiMediaType(canvasItem.ai);
  const source = mediaType === 'image'
    ? getCanvasAiOutputThumbnailSource(output)
    : getCanvasAiOutputDisplaySource(output);
  if (!source || output?.status === 'error') return null;
  return {
    source,
    mediaType,
  };
};

export const getCanvasWorkflowGroupIdForSelection = (canvasItem?: CanvasImageItem | null) => {
  const group = canvasItem?.workflowGroup;
  if (!group || typeof group !== 'object') return '';
  return String((group as Partial<CanvasWorkflowExpandedGroup>).groupId || '');
};

export const getCanvasAiInputSourceCandidates = (item: BufferItem) => {
  const path = String(item.path || '').trim();
  if (item.type === 'video' || (item.type === 'file' && isCanvasAudioFileName(item.name || path))) {
    const seen = new Set<string>();
    const remoteCandidates = [
      item.sourceUrl,
      item.originalUrl,
      item.url,
      path,
    ].filter(source => isRemoteHttpImageSource(source));
    return [
      ...remoteCandidates,
      path,
      item.url,
      item.sourceUrl,
      item.originalUrl,
    ]
      .map(value => String(value || '').trim())
      .filter((value) => {
        if (!value || seen.has(value)) return false;
        seen.add(value);
        return true;
      });
  }
  const pathPreviewSource = path
    && !/^(data:(?:image|video)\/|https?:\/\/|asset:|file:\/\/)/i.test(path)
    ? convertFileSrc(path)
    : '';
  const seen = new Set<string>();
  return [
    getCanvasItemDisplaySource(item),
    item.url,
    pathPreviewSource,
    item.path,
    item.sourceUrl,
    item.originalUrl,
    item.thumbnail,
  ]
    .map(value => String(value || '').trim())
    .filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
};

export const isDirectCanvasAiInputSource = (source?: string | null) => {
  const value = String(source || '').trim();
  return isDataMediaSourceValue(value)
    || /^asset:/i.test(value)
    || /^file:\/\//i.test(value)
    || /^https?:\/\/(?:asset\.localhost|localhost|127\.0\.0\.1)/i.test(value)
    || /^[a-zA-Z]:[\\/]/.test(value)
    || /^\\\\/.test(value);
};

export const getCanvasAiOutputSize = (aspectRatio = CANVAS_AI_DEFAULT_ASPECT_RATIO) => {
  const ratio = parseCanvasAspectRatioValue(aspectRatio);
  if (ratio >= 1) {
    const width = 320;
    return { width, height: Math.round(width / ratio) };
  }
  const height = 300;
  return { width: Math.round(height * ratio), height };
};

export const getCanvasWorkflowTemplateFromNode = (canvasItem?: CanvasImageItem | null) => {
  if (canvasItem?.ai?.type !== 'workflow') return null;
  const snapshot = normalizeCanvasWorkflowTemplate(canvasItem.ai.workflow);
  const builtInWorkflow = canvasItem.ai.presetId
    ? CANVAS_BUILT_IN_WORKFLOWS.find(workflow => workflow.id === canvasItem.ai?.presetId)
    : null;
  return snapshot?.builtin && builtInWorkflow ? builtInWorkflow : snapshot;
};
