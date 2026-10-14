import type { ResolvedImageModelCapabilities } from './aiModelCapabilities';
import type { CanvasAiItemData } from './canvasModel';

/** A provider job count is independent of the number of assets returned by it. */
export function canvasImageOutputPlan(ai: Pick<CanvasAiItemData, 'count'>, capabilities: Pick<ResolvedImageModelCapabilities, 'maxOutputs' | 'maxOutputImages' | 'outputMode'>) {
  const requestCount = Math.max(1, Math.min(capabilities.maxOutputs, Math.round(Number(ai.count) || 1)));
  const outputCount = capabilities.outputMode === 'multiple_assets' ? capabilities.maxOutputImages : requestCount;
  return { requestCount, outputCount };
}

export function isCanvasImageRecoveryRequired(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /IMAGE_TASK_RECOVERY_REQUIRED|AMBIGUOUS_SUBMIT|IMAGE_RESULT_PERSISTENCE_FAILED/.test(message);
}

export const canvasImageNeedsRecovery = (ai?: CanvasAiItemData) => ai?.type === 'image-generator'
  && (ai.status === 'recovery' || (ai.status === 'error' && isCanvasImageRecoveryRequired(ai.error)
    && new Set(ai.outputs?.map(output => output.clientRequestId).filter(Boolean)).size <= 1));
