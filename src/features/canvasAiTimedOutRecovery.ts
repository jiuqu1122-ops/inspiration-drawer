import type { CanvasAiGeneratedOutput, CanvasImageItem } from './canvasModel';

export const CANVAS_AI_TIMED_OUT_RECOVERY_MAX_AGE_MS = 30 * 60 * 1000;
export const CANVAS_AI_STALE_WORKING_RECOVERY_AGE_MS = 15 * 60 * 1000;

export type CanvasAiTimedOutRecoveryCandidate = {
  canvasItem: CanvasImageItem;
  output: CanvasAiGeneratedOutput;
  outputIndex: number;
  clientRequestId: string;
  mediaType: 'image' | 'video';
};

const hasUsableOutputSource = (output: CanvasAiGeneratedOutput) => Boolean(
  String(output.path || output.url || output.sourceUrl || '').trim(),
);

export const getCanvasAiTimedOutRecoveryCandidates = (
  canvasItems: CanvasImageItem[],
  now = Date.now(),
): CanvasAiTimedOutRecoveryCandidate[] => canvasItems.flatMap((canvasItem) => {
  if (
    (canvasItem.ai?.type !== 'image-generator' && canvasItem.ai?.type !== 'video-generator')
    || canvasItem.ai.credentialSource !== 'wallet'
    || !canvasItem.ai.outputs?.length
  ) {
    return [];
  }
  return canvasItem.ai.outputs.flatMap((output, outputIndex) => {
    const clientRequestId = String(output.clientRequestId || output.taskId || '').trim();
    const mediaType: 'image' | 'video' = canvasItem.ai?.type === 'video-generator'
      ? 'video'
      : output.mediaType || 'image';
    const generatedAt = Number(output.generatedAt || canvasItem.ai?.generatedAt || 0);
    const outputAge = generatedAt > 0 ? now - generatedAt : -1;
    const isRecoverableState = (output.status === 'error' || output.status === 'success')
      || (output.status === 'working' && outputAge >= CANVAS_AI_STALE_WORKING_RECOVERY_AGE_MS);
    // Video requests can outlive the image reconciliation window and their
    // result is persisted by the server. Keep those historical receipts
    // recoverable after an app restart; image lookups retain the old bound.
    const isRecent = generatedAt > 0
      && outputAge >= 0
      && (mediaType === 'video' || outputAge <= CANVAS_AI_TIMED_OUT_RECOVERY_MAX_AGE_MS);
    if (!clientRequestId || !isRecoverableState || !isRecent || hasUsableOutputSource(output)) {
      return [];
    }
    return [{ canvasItem, output, outputIndex, clientRequestId, mediaType }];
  });
});

export const isCanvasAiImageLookupPending = (status?: string | null) => (
  status === 'pending' || status === 'reserved' || status === 'processing'
);

const lookupErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error || '');

export const isCanvasAiLookupTerminalError = (error: unknown) => (
  /invalid_request|HTTP\s*[:：]?\s*(?:400|403|405|410|414|422|431)\b/i.test(lookupErrorMessage(error))
);

// A gateway can reject a short URI/header while the generation still exists.
// Stop foreground polling, but allow recovery after network/proxy changes.
export const isCanvasAiLookupGatewayLimitError = (error: unknown) => (
  /HTTP\s*[:：]?\s*(?:414|431)\b/i.test(lookupErrorMessage(error))
);

export const getCanvasAiLookupRetryDelay = (error?: unknown) => (
  isCanvasAiLookupGatewayLimitError(error)
    ? 300_000
    : /unauthorized|invalid.token|HTTP\s*[:：]?\s*(?:401|429)\b/i.test(lookupErrorMessage(error))
    ? 60_000
    : 8_000
);

export class CanvasAiLookupRetrySchedule {
  private retryAt = new Map<string, number>();

  canRetry(key: string, now = Date.now()) {
    return now >= (this.retryAt.get(key) || 0);
  }

  defer(key: string, delay: number, now = Date.now()) {
    for (const [candidate, at] of this.retryAt) {
      if (at <= now) this.retryAt.delete(candidate);
    }
    this.retryAt.set(key, now + delay);
  }
}

const lookupSchedules = new WeakMap<Set<string>, CanvasAiLookupRetrySchedule>();

export const getCanvasAiLookupRetrySchedule = (inFlight: Set<string>) => {
  let schedule = lookupSchedules.get(inFlight);
  if (!schedule) {
    schedule = new CanvasAiLookupRetrySchedule();
    lookupSchedules.set(inFlight, schedule);
  }
  return schedule;
};
