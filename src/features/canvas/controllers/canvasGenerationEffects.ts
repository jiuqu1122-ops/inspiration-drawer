import { invoke } from '@tauri-apps/api/core';
import React from 'react';
import { CANVAS_AI_IMAGE_TASK_TIMEOUT_MINUTES,CANVAS_AI_IMAGE_TASK_TIMEOUT_MS,CANVAS_AI_VIDEO_TASK_TIMEOUT_MINUTES,CANVAS_AI_VIDEO_TASK_TIMEOUT_MS } from '../../canvasAiImage';
import { getCanvasAiMediaType } from '../../canvasAiRuntime';
import { enhancementEstimateCache,getCanvasRifeRateRequest,isCanvasAiEnhancementType,rifeEstimateCache,type RealEsrganEnhancementEstimate,type RifeFrameInterpolationEstimate } from '../../canvasLocalMediaTools';
import { type CanvasAiGeneratedOutput,type CanvasImageItem } from '../../canvasModel';
import { clamp } from '../../common';

type canvasGenerationEffectContext = { isCanvasMode: boolean; canvasItems: CanvasImageItem[]; getFrameInterpolationVideoInput: (target: CanvasImageItem) => { source: string; item: CanvasImageItem; output?: undefined; } | { source: string; item: CanvasImageItem; output: CanvasAiGeneratedOutput; } | null; getFrameInterpolationEstimateKey: (target: CanvasImageItem, source: string) => string; updateCanvasAiGeneratorData: (nodeId: string, patch: Partial<NonNullable<CanvasImageItem["ai"]>>, content?: string) => CanvasImageItem | undefined; canvasItemsRef: React.RefObject<CanvasImageItem[]>; getCanvasEnhancementInput: (target: CanvasImageItem) => { source: string; item: CanvasImageItem; output?: undefined; } | { source: string; item: CanvasImageItem; output: CanvasAiGeneratedOutput; } | null; getEnhancementEstimateKey: (target: CanvasImageItem, source: string) => string; getCanvasAiErrorSummary: (error?: string | null) => string; canvasAiRunTokensRef: React.RefObject<Map<string, string>>; showToast: (message: string) => void; };

export const runCanvasGenerationEffect01 = (ctx: Pick<canvasGenerationEffectContext, 'canvasItems' | 'canvasItemsRef' | 'getFrameInterpolationEstimateKey' | 'getFrameInterpolationVideoInput' | 'isCanvasMode' | 'updateCanvasAiGeneratorData'>) => {
  const { canvasItems, canvasItemsRef, getFrameInterpolationEstimateKey, getFrameInterpolationVideoInput, isCanvasMode, updateCanvasAiGeneratorData } = ctx;
    if (!isCanvasMode) return;
    canvasItems.forEach(item => {
      const key = item.ai?.interpolationEstimateKey;
      const estimate = item.ai?.interpolationEstimate as RifeFrameInterpolationEstimate | undefined;
      if (key && estimate && !rifeEstimateCache.has(key)) {
        rifeEstimateCache.set(key, Promise.resolve(estimate));
      }
    });
    const requests = canvasItems
      .filter(item => item.ai?.type === 'frame-interpolation' && item.ai?.status !== 'working')
      .map(item => {
        const videoInput = getFrameInterpolationVideoInput(item);
        if (!videoInput?.source) return null;
        const estimateKey = getFrameInterpolationEstimateKey(item, videoInput.source);
        if (item.ai?.interpolationEstimateKey === estimateKey) return null;
        return { item, source: videoInput.source, estimateKey };
      })
      .filter((value): value is { item: CanvasImageItem; source: string; estimateKey: string } => !!value);

    requests.forEach(({ item, source, estimateKey }) => {
      updateCanvasAiGeneratorData(item.id, {
        interpolationEstimateKey: estimateKey,
        interpolationEstimate: undefined,
      });
      let request = rifeEstimateCache.get(estimateKey);
      if (!request) {
        const rate = getCanvasRifeRateRequest(item.ai);
        request = invoke<RifeFrameInterpolationEstimate>('get_rife_frame_interpolation_estimate', {
          inputPath: source,
          factor: rate.factor,
          model: item.ai?.model || 'rife-v4.6',
          targetFps: rate.targetFps,
          cfrMode: item.ai?.videoCfrMode || 'auto',
          mode: item.ai?.interpolationMode || 'normal',
          quality: item.ai?.interpolationQuality || 'standard',
          outputFormat: item.ai?.outputFormat || 'mp4',
          progressId: item.id,
        }).catch(error => {
          rifeEstimateCache.delete(estimateKey);
          throw error;
        });
        rifeEstimateCache.set(estimateKey, request);
      }
      void request
        .then((estimate) => {
          const latest = canvasItemsRef.current.find(candidate => candidate.id === item.id);
          if (latest?.ai?.interpolationEstimateKey !== estimateKey) return;
          updateCanvasAiGeneratorData(item.id, { interpolationEstimate: estimate });
        })
        .catch(() => {
          const latest = canvasItemsRef.current.find(candidate => candidate.id === item.id);
          if (latest?.ai?.interpolationEstimateKey !== estimateKey) return;
          updateCanvasAiGeneratorData(item.id, {
            interpolationEstimate: {
              estimatedSecondsMin: null,
              estimatedSecondsMax: null,
            },
          });
        });
    });

};

export const runCanvasGenerationEffect02 = (ctx: Pick<canvasGenerationEffectContext, 'canvasItems' | 'canvasItemsRef' | 'getCanvasAiErrorSummary' | 'getCanvasEnhancementInput' | 'getEnhancementEstimateKey' | 'isCanvasMode' | 'updateCanvasAiGeneratorData'>) => {
  const { canvasItems, canvasItemsRef, getCanvasAiErrorSummary, getCanvasEnhancementInput, getEnhancementEstimateKey, isCanvasMode, updateCanvasAiGeneratorData } = ctx;
    if (!isCanvasMode) return;
    canvasItems.forEach(item => {
      const key = item.ai?.enhancementEstimateKey;
      const estimate = item.ai?.enhancementEstimate as RealEsrganEnhancementEstimate | undefined;
      if (key && estimate && !enhancementEstimateCache.has(key)) {
        enhancementEstimateCache.set(key, Promise.resolve(estimate));
      }
    });
    const requests = canvasItems
      .filter(item => (
        isCanvasAiEnhancementType(item.ai?.type)
        && item.ai?.status !== 'working'
        && !(item.ai?.type === 'video-enhancement' && item.ai?.enhancementEngine === 'quick')
      ))
      .map(item => {
        const input = getCanvasEnhancementInput(item);
        if (!input?.source) return null;
        const estimateKey = getEnhancementEstimateKey(item, input.source);
        if (item.ai?.enhancementEstimateKey === estimateKey) return null;
        return { item, source: input.source, estimateKey };
      })
      .filter((value): value is { item: CanvasImageItem; source: string; estimateKey: string } => !!value);

    requests.forEach(({ item, source, estimateKey }) => {
      updateCanvasAiGeneratorData(item.id, {
        enhancementEstimateKey: estimateKey,
        enhancementEstimate: undefined,
      });
      let request = enhancementEstimateCache.get(estimateKey);
      if (!request) {
        request = invoke<RealEsrganEnhancementEstimate>('get_realesrgan_enhancement_estimate', {
          inputPath: source,
          mediaType: getCanvasAiMediaType(item.ai),
          scale: clamp(Math.round(Number(item.ai?.enhancementScale) || 2), 2, 4),
          mode: item.ai?.enhancementMode || 'general',
          resizeMode: item.ai?.enhancementResizeMode || 'upscale',
          outputFormat: item.ai?.outputFormat || (getCanvasAiMediaType(item.ai) === 'video' ? 'mp4' : 'png'),
          progressId: item.id,
        }).catch(error => {
          enhancementEstimateCache.delete(estimateKey);
          throw error;
        });
        enhancementEstimateCache.set(estimateKey, request);
      }
      void request
        .then((estimate) => {
          const latest = canvasItemsRef.current.find(candidate => candidate.id === item.id);
          if (latest?.ai?.enhancementEstimateKey !== estimateKey) return;
          updateCanvasAiGeneratorData(item.id, { enhancementEstimate: estimate });
        })
        .catch((error) => {
          const latest = canvasItemsRef.current.find(candidate => candidate.id === item.id);
          const message = getCanvasAiErrorSummary(error instanceof Error ? error.message : String(error));
          if (message.includes('已取消')) return;
          if (latest?.ai?.enhancementEstimateKey !== estimateKey) return;
          if (latest?.ai?.enhancementEngine === 'quick') return;
          updateCanvasAiGeneratorData(item.id, {
            enhancementEstimate: {
              estimatedSecondsMin: null,
              estimatedSecondsMax: null,
            },
          });
        });
    });

};

export const runCanvasGenerationEffect03 = (ctx: Pick<canvasGenerationEffectContext, 'canvasAiRunTokensRef' | 'canvasItemsRef' | 'isCanvasMode' | 'showToast' | 'updateCanvasAiGeneratorData'>) => {
  const { canvasAiRunTokensRef, canvasItemsRef, isCanvasMode, showToast, updateCanvasAiGeneratorData } = ctx;
    if (!isCanvasMode) return;
    const settleStaleGeneratorNodes = () => {
      const now = Date.now();
      const generalizedStaleNodes = canvasItemsRef.current.filter(item => {
        const ai = item.ai;
        if (
          (ai?.type !== 'image-generator' && ai?.type !== 'video-generator')
          || ai.status !== 'working'
          || !ai.generatedAt
        ) return false;
        const timeoutMs = ai.type === 'image-generator'
          ? CANVAS_AI_IMAGE_TASK_TIMEOUT_MS
          : CANVAS_AI_VIDEO_TASK_TIMEOUT_MS;
        return now - ai.generatedAt >= timeoutMs;
      });
      if (generalizedStaleNodes.length > 0) {
        generalizedStaleNodes.forEach(item => {
          for (const key of canvasAiRunTokensRef.current.keys()) {
            if (key === item.id || key.endsWith(`:${item.id}`)) canvasAiRunTokensRef.current.delete(key);
          }
          const isVideo = item.ai?.type === 'video-generator';
          const timeoutMinutes = isVideo
            ? CANVAS_AI_VIDEO_TASK_TIMEOUT_MINUTES
            : CANVAS_AI_IMAGE_TASK_TIMEOUT_MINUTES;
          const mediaLabel = isVideo ? '视频' : '图片';
          const error = `${mediaLabel}生成任务等待超过 ${timeoutMinutes} 分钟，已自动取消，请手动重试。`;
          updateCanvasAiGeneratorData(item.id, {
            status: 'error',
            error,
            generatedAt: now,
            outputs: (item.ai?.outputs || []).map(output => output.status === 'working'
              ? { ...output, status: 'error' as const, error, generatedAt: output.generatedAt || now }
              : output),
          });
        });
        showToast(`已自动取消 ${generalizedStaleNodes.length} 个超时的图片/视频生成任务，可手动重试`);
      }
    };
    settleStaleGeneratorNodes();
    const timer = window.setInterval(settleStaleGeneratorNodes, 5000);
    return () => window.clearInterval(timer);

};
