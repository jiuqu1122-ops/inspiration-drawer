import { convertFileSrc } from '@tauri-apps/api/core';
import type { BufferItem } from '../types';
import type { CanvasAiGeneratedOutput, CanvasImageItem } from './canvasModel';
import {
  getCanvasAiMediaType,
  isCanvasAiGeneratorType,
} from './canvasAiRuntime';

export const getCanvasItemDisplaySource = (item: BufferItem) => (
  item.url
  || (item.path ? convertFileSrc(item.path) : '')
  || item.thumbnail
  || ''
);

export const getCanvasAiOutputDisplaySource = (output?: CanvasAiGeneratedOutput | null) => (
  output?.url
  || (output?.path ? convertFileSrc(output.path) : '')
  || ''
);

const hasCanvasAiOutputUsableSource = (output?: CanvasAiGeneratedOutput | null) => (
  !!(output?.url || output?.path)
);

export const recoverCanvasAiOutputWithUsableResult = (
  output: CanvasAiGeneratedOutput
): CanvasAiGeneratedOutput => {
  if (output.status !== 'error' || !hasCanvasAiOutputUsableSource(output)) return output;
  return {
    ...output,
    status: 'success',
    error: undefined,
  };
};

export const recoverCanvasAiNodeWithUsableResults = (
  canvasItem: CanvasImageItem
): CanvasImageItem => {
  if (!canvasItem.ai?.outputs?.length) return canvasItem;
  let outputsChanged = false;
  const outputs = canvasItem.ai.outputs.map((output) => {
    const recovered = recoverCanvasAiOutputWithUsableResult(output);
    if (recovered !== output) outputsChanged = true;
    return recovered;
  });
  const expectedOutputCount = Math.max(
    1,
    Math.round(Number(canvasItem.ai.count) || outputs.length)
  );
  const allOutputsSucceeded = outputs.length >= expectedOutputCount && outputs.every(output => (
    output.status === 'success' && hasCanvasAiOutputUsableSource(output)
  ));
  const shouldRecoverNode = canvasItem.ai.status === 'error' && allOutputsSucceeded;
  if (!outputsChanged && !shouldRecoverNode) return canvasItem;
  return {
    ...canvasItem,
    ai: {
      ...canvasItem.ai,
      outputs,
      ...(shouldRecoverNode ? { status: 'success' as const, error: undefined } : {}),
    },
  };
};

export const buildCanvasAiOutputLocalCachePatch = (path: string) => ({
  path,
  cacheStatus: 'pending' as const,
});

export const getCanvasAiSuccessfulOutputs = (canvasItem?: CanvasImageItem | null) => (
  (isCanvasAiGeneratorType(canvasItem?.ai?.type) || canvasItem?.ai?.type === 'workflow')
    ? (canvasItem.ai.outputs || []).map(recoverCanvasAiOutputWithUsableResult).filter(
      output => output.status === 'success' && getCanvasAiOutputDisplaySource(output)
    )
    : []
);

export const canUseCanvasItemAsAiInput = (canvasItem?: CanvasImageItem | null) => !!canvasItem;

export const canUseCanvasItemAsFrameInterpolationVideoInput = (
  canvasItem?: CanvasImageItem | null
) => {
  if (!canvasItem) return false;
  if (canvasItem.item.type === 'video') return true;
  return getCanvasAiSuccessfulOutputs(canvasItem).some(output => (
    (output.mediaType || getCanvasAiMediaType(canvasItem.ai)) === 'video'
    && !!getCanvasAiOutputDisplaySource(output)
  ));
};

export const canUseCanvasItemAsImageEnhancementInput = (
  canvasItem?: CanvasImageItem | null
) => {
  if (!canvasItem) return false;
  if (canvasItem.item.type === 'image') return true;
  return getCanvasAiSuccessfulOutputs(canvasItem).some(output => (
    (output.mediaType || getCanvasAiMediaType(canvasItem.ai)) === 'image'
    && !!getCanvasAiOutputDisplaySource(output)
  ));
};

export const canUseCanvasItemAsVideoEnhancementInput = (
  canvasItem?: CanvasImageItem | null
) => canUseCanvasItemAsFrameInterpolationVideoInput(canvasItem);

export const canUseCanvasItemAsInputForTarget = (
  source?: CanvasImageItem | null,
  target?: CanvasImageItem | null,
) => (
  target?.ai?.type === 'frame-interpolation'
    ? canUseCanvasItemAsFrameInterpolationVideoInput(source)
    : target?.ai?.type === 'image-enhancement'
      ? canUseCanvasItemAsImageEnhancementInput(source)
      : target?.ai?.type === 'video-enhancement'
        ? canUseCanvasItemAsVideoEnhancementInput(source)
        : canUseCanvasItemAsAiInput(source)
);

export const canUseCanvasItemAsAiTarget = (canvasItem?: CanvasImageItem | null) => (
  isCanvasAiGeneratorType(canvasItem?.ai?.type) || canvasItem?.ai?.type === 'workflow'
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
  const titleSeed = (
    canvasItem.ai?.presetLabel
    || canvasItem.item.name
    || canvasItem.item.content
    || ''
  ).trim();
  const taskName = (output.taskId || output.clientRequestId || '').trim();
  const name = output.name
    || (taskName ? `${taskName}${index > 0 ? `_${index + 1}` : ''}` : '')
    || (titleSeed ? `${titleSeed} #${index + 1}` : `AI generated ${mediaType} #${index + 1}`);
  const generatedAt = output.generatedAt
    || canvasItem.ai?.generatedAt
    || canvasItem.item.createdAt
    || Date.now();
  const rawUrl = (output.url || source).trim();
  const rawPath = (output.path || '').trim();
  const durableRemoteSource = (output.sourceUrl || '').trim();
  const remoteSource = durableRemoteSource || (/^https?:\/\//i.test(rawUrl) ? rawUrl : '');
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
