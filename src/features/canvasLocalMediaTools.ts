import type { CanvasImageItem } from './canvasModel';
import { clamp } from './common';

export type RifeFrameInterpolationResult = {
  outputPath: string;
  engineDir?: string;
  fps?: number;
  outputFps?: number;
  factor?: number;
  inputFrames?: number;
};
export type VideoCfrNormalizationResult = {
  outputPath: string;
  converted?: boolean;
  isVfr?: boolean;
  sourceFps?: number | null;
  normalizedFps?: number | null;
  reason?: string;
};
export type QuickVideoEnhancementResult = RealEsrganEnhancementResult & {
  encoder?: string;
};
export type RifeFrameInterpolationEstimate = {
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  frameCount?: number | null;
  outputFps?: number | null;
  outputFrameCount?: number | null;
  sampleFrames?: number | null;
  estimatedSecondsMin?: number | null;
  estimatedSecondsMax?: number | null;
  sourceFps?: number | null;
  cfrConverted?: boolean;
  cfrReason?: string;
};
export type RealEsrganEnhancementResult = {
  outputPath: string;
  engineDir?: string;
  scale?: number;
  mode?: string;
  resizeMode?: string;
  outputFormat?: string;
  fps?: number | null;
  width?: number | null;
  height?: number | null;
  preview?: boolean;
  processedDurationSec?: number | null;
};
export type RealEsrganEnhancementEstimate = RifeFrameInterpolationEstimate & {
  outputWidth?: number | null;
  outputHeight?: number | null;
};
export type RifeEngineProgress = {
  progressId?: string;
  stage?: string;
  label?: string;
  loaded?: number;
  total?: number;
  progress?: number;
};
export const rifeEstimateCache = new Map<string, Promise<RifeFrameInterpolationEstimate>>();
export const enhancementEstimateCache = new Map<string, Promise<RealEsrganEnhancementEstimate>>();
export const getRifeEngineProgressPercent = (progress?: RifeEngineProgress | null) => (
  Math.max(0, Math.min(100, Math.round(Number(progress?.progress || 0) * 100)))
);
export const shouldShowRifeEngineProgress = (progress?: RifeEngineProgress | null) => {
  if (!progress?.stage) return false;
  if (progress.stage.endsWith('-ready')) return false;
  if (progress.stage.startsWith('downloading-')) return getRifeEngineProgressPercent(progress) < 100;
  return true;
};
export const isFrameProcessingProgress = (progress?: RifeEngineProgress | null) => (
  !!progress?.stage && /(?:extracting|interpolating|enhancing)-.*frames/.test(progress.stage)
);
export const isRifeFixed2xMode = (mode?: string | null) => (
  mode === 'hd' || mode === 'uhd' || mode === 'hd-slow'
);
export const getCanvasRifeRateValue = (ai?: CanvasImageItem['ai'] | null) => (
  ai?.interpolationRateMode === 'target-fps'
    ? `target-${Math.round(Number(ai?.interpolationTargetFps) || 60)}`
    : `factor-${clamp(Math.round(Number(ai?.interpolationFactor) || 2), 2, 4)}`
);
export const getCanvasRifeRateRequest = (ai?: CanvasImageItem['ai'] | null) => {
  if (isRifeFixed2xMode(ai?.interpolationMode)) {
    return { factor: 2, targetFps: undefined as number | undefined };
  }
  if (ai?.interpolationRateMode === 'target-fps') {
    return {
      factor: 4,
      targetFps: clamp(Math.round(Number(ai?.interpolationTargetFps) || 60), 1, 240),
    };
  }
  return {
    factor: clamp(Math.round(Number(ai?.interpolationFactor) || 2), 2, 4),
    targetFps: undefined as number | undefined,
  };
};
export const formatRifeEstimateSeconds = (seconds?: number | null) => {
  if (!Number.isFinite(Number(seconds)) || Number(seconds) <= 0) return '';
  const safeSeconds = Math.max(1, Math.round(Number(seconds)));
  if (safeSeconds < 60) return `${safeSeconds}秒`;
  const minutes = Math.max(1, Math.round(safeSeconds / 60));
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours}小时${rest}分钟` : `${hours}小时`;
};
export const formatCanvasWorkingElapsed = (startedAt?: number | null, now = Date.now()) => {
  const start = Number(startedAt) || 0;
  if (!start) return '0秒';
  const elapsed = Math.max(0, Math.floor((now - start) / 1000));
  return `${elapsed}秒`;
};
export const formatRifeEstimateRange = (estimate?: RifeFrameInterpolationEstimate | null) => {
  const min = Number(estimate?.estimatedSecondsMin);
  const max = Number(estimate?.estimatedSecondsMax);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max <= 0) return '接入视频后自动估算';
  const minText = formatRifeEstimateSeconds(min);
  const maxText = formatRifeEstimateSeconds(max);
  return minText && maxText && minText !== maxText ? `约 ${minText}～${maxText}` : `约 ${maxText || minText}`;
};
export const formatRifeEstimateVideoMeta = (estimate?: RifeFrameInterpolationEstimate | null) => {
  const parts: string[] = [];
  if (Number.isFinite(Number(estimate?.durationSec)) && Number(estimate?.durationSec) > 0) {
    parts.push(formatRifeEstimateSeconds(estimate?.durationSec));
  }
  if (Number.isFinite(Number(estimate?.width)) && Number.isFinite(Number(estimate?.height)) && Number(estimate?.width) > 0 && Number(estimate?.height) > 0) {
    parts.push(`${Math.round(Number(estimate?.width))}×${Math.round(Number(estimate?.height))}`);
  }
  if (Number.isFinite(Number(estimate?.fps)) && Number(estimate?.fps) > 0) {
    const fps = Number(estimate?.fps);
    const sourceFps = Number(estimate?.sourceFps);
    if (estimate?.cfrConverted && Number.isFinite(sourceFps) && sourceFps > 0) {
      parts.push(`${sourceFps.toFixed(sourceFps >= 10 ? 0 : 1)}fps → CFR ${fps.toFixed(fps >= 10 ? 0 : 1)}fps`);
    } else {
      parts.push(`${fps.toFixed(fps >= 10 ? 0 : 1)}fps`);
    }
  }
  if (Number.isFinite(Number(estimate?.outputFps)) && Number(estimate?.outputFps) > 0) {
    parts.push(`→ ${Number(estimate?.outputFps).toFixed(0)}fps`);
  }
  if (Number.isFinite(Number(estimate?.frameCount)) && Number(estimate?.frameCount) > 0) {
    parts.push(`${Math.round(Number(estimate?.frameCount))}帧`);
  }
  return parts.join(' · ');
};
export const formatEnhancementEstimateVideoMeta = (estimate?: RealEsrganEnhancementEstimate | null) => {
  const parts: string[] = [];
  if (Number.isFinite(Number(estimate?.durationSec)) && Number(estimate?.durationSec) > 0) {
    parts.push(formatRifeEstimateSeconds(estimate?.durationSec));
  }
  const hasInputResolution = Number(estimate?.width) > 0 && Number(estimate?.height) > 0;
  const hasOutputResolution = Number(estimate?.outputWidth) > 0 && Number(estimate?.outputHeight) > 0;
  if (hasInputResolution) {
    const inputResolution = `${Math.round(Number(estimate?.width))}×${Math.round(Number(estimate?.height))}`;
    const outputResolution = hasOutputResolution
      ? `${Math.round(Number(estimate?.outputWidth))}×${Math.round(Number(estimate?.outputHeight))}`
      : '';
    parts.push(outputResolution ? `${inputResolution} → ${outputResolution}` : inputResolution);
  }
  if (Number.isFinite(Number(estimate?.fps)) && Number(estimate?.fps) > 0) {
    parts.push(`${Number(estimate?.fps).toFixed(Number(estimate?.fps) >= 10 ? 0 : 1)}fps`);
  }
  if (Number.isFinite(Number(estimate?.frameCount)) && Number(estimate?.frameCount) > 0) {
    parts.push(`${Math.round(Number(estimate?.frameCount))}帧`);
  }
  return parts.join(' · ');
};
export const isCanvasAiFrameInterpolationType = (type?: string | null) => type === 'frame-interpolation';
export const isCanvasAiEnhancementType = (type?: string | null) => type === 'image-enhancement' || type === 'video-enhancement';
export const isCanvasAiLocalMediaToolType = (type?: string | null) => (
  isCanvasAiFrameInterpolationType(type) || isCanvasAiEnhancementType(type)
);
export const getCanvasAiLocalMediaProgress = (ai?: CanvasImageItem['ai'] | null): RifeEngineProgress | undefined => {
  if (ai?.type === 'frame-interpolation') return ai.interpolationProgress as RifeEngineProgress | undefined;
  if (isCanvasAiEnhancementType(ai?.type)) return ai.enhancementProgress as RifeEngineProgress | undefined;
  return undefined;
};
export const shouldShowCanvasAiLocalMediaProgress = (ai?: CanvasImageItem['ai'] | null) => (
  shouldShowRifeEngineProgress(getCanvasAiLocalMediaProgress(ai))
);

// Enhancement engines consume local files, not URLs or thumbnail previews.
export type EnhancementImageCache = (
  source: string,
  name: string,
  options?: { throwOnFailure?: boolean },
) => Promise<{ path: string; url?: string; sourceUrl?: string }>;

const isEnhancementLocalSource = (source: string) => (
  /^(?:file|asset):/i.test(source)
  || /^https?:\/\/asset\.localhost(?:[/:]|$)/i.test(source)
  || /^[a-z]:[\\/]/i.test(source)
  || !/^[a-z][a-z0-9+.-]*:/i.test(source)
);

export const prepareEnhancementImageInput = async (
  source: string,
  name: string,
  cache?: EnhancementImageCache,
): Promise<string> => {
  const trimmed = source.trim();
  if (!trimmed) throw new Error('图片增强[准备输入]：没有可用原图，请重新接入图片');
  if (isEnhancementLocalSource(trimmed)) return trimmed;
  if (!/^https?:\/\//i.test(trimmed) && !/^data:image\//i.test(trimmed)) {
    throw new Error('图片增强[准备输入]：图片源不可直接读取，请先保存原图并重新接入');
  }
  if (!cache) throw new Error('图片增强[准备输入]：本地缓存服务不可用，请重新打开画布后重试');
  try {
    const cached = await cache(trimmed, name, { throwOnFailure: true });
    const path = (cached.path || '').trim();
    if (path && isEnhancementLocalSource(path)) return path;
  } catch {
    // Cache errors can include private URLs, query tokens, and filesystem paths.
    throw new Error('图片增强[准备输入]：原图下载或本地缓存失败，请检查网络、文件权限及剩余空间后重试');
  }
  throw new Error('图片增强[准备输入]：原图缓存未返回本地文件，请重新接入图片后重试');
};

export const getEnhancementOutputDimensions = (
  result: Pick<RealEsrganEnhancementResult, 'width' | 'height'>,
): { width: number; height: number } | undefined => (
  typeof result.width === 'number' && Number.isSafeInteger(result.width) && result.width > 0
  && typeof result.height === 'number' && Number.isSafeInteger(result.height) && result.height > 0
    ? { width: result.width, height: result.height }
    : undefined
);
