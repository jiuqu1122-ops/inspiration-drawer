import type { CanvasAiGeneratedOutput, CanvasImageItem } from './canvasModel';

export const CANVAS_AI_TIMED_OUT_RECOVERY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const CANVAS_AI_STALE_WORKING_RECOVERY_AGE_MS = 15 * 60 * 1000;

export type CanvasAiTimedOutRecoveryCandidate = {
  canvasItem: CanvasImageItem;
  output: CanvasAiGeneratedOutput;
  outputIndex: number;
  clientRequestId: string;
};

const hasUsableOutputSource = (output: CanvasAiGeneratedOutput) => Boolean(
  String(output.path || output.url || output.sourceUrl || '').trim(),
);

export const getCanvasAiTimedOutRecoveryCandidates = (
  canvasItems: CanvasImageItem[],
  now = Date.now(),
): CanvasAiTimedOutRecoveryCandidate[] => canvasItems.flatMap((canvasItem) => {
  if (
    canvasItem.ai?.type !== 'image-generator'
    || canvasItem.ai.credentialSource !== 'wallet'
    || !canvasItem.ai.outputs?.length
  ) {
    return [];
  }
  return canvasItem.ai.outputs.flatMap((output, outputIndex) => {
    const clientRequestId = String(output.clientRequestId || output.taskId || '').trim();
    const generatedAt = Number(output.generatedAt || canvasItem.ai?.generatedAt || 0);
    const outputAge = generatedAt > 0 ? now - generatedAt : -1;
    const isRecoverableState = output.status === 'error'
      || (output.status === 'working' && outputAge >= CANVAS_AI_STALE_WORKING_RECOVERY_AGE_MS);
    const isRecent = generatedAt > 0
      && outputAge >= 0
      && outputAge <= CANVAS_AI_TIMED_OUT_RECOVERY_MAX_AGE_MS;
    if (!clientRequestId || !isRecoverableState || !isRecent || hasUsableOutputSource(output)) {
      return [];
    }
    return [{ canvasItem, output, outputIndex, clientRequestId }];
  });
});

export const isCanvasAiImageLookupPending = (status?: string | null) => (
  status === 'pending' || status === 'reserved' || status === 'processing'
);
