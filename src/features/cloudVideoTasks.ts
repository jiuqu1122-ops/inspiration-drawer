export type WalletVideoTask = {
  taskId: string;
  outputIndex: number;
  status: 'processing' | 'succeeded' | 'failed';
  resultUrl?: string | null;
  pollAfterMs?: number | null;
  isRecovering?: boolean;
  error?: string;
};

export type WalletVideoRequest = {
  requestId: string;
  clientRequestId: string;
  status: 'processing' | 'succeeded' | 'failed';
  tasks: WalletVideoTask[];
  results?: unknown[];
  error?: string;
};

export class WalletVideoRecoveryPendingError extends Error {
  readonly code = 'VIDEO_TASK_RECOVERY_PENDING';
  constructor() {
    super('视频任务仍在后台处理或等待核验，联网后会继续查找原任务。');
  }
}

export const isVideoLookupMissing = (error: unknown) => /\bvideo_request_not_found\b/.test(String(error));

export const isVideoLookupUnsupported = (error: unknown) => /(?:^|Error:\s*)not_found\b/.test(String(error));

export const isUncertainVideoSubmit = (error: unknown) => (
  !/\bvideo_admission_expired\b/.test(String(error))
  && /cloud_unavailable|cloud_invalid_response|duplicate_request|video_task_pending_confirmation|video_generation_failed|fetch failed|network|failed to fetch|timed?\s*out|超时|断开|HTTP\s*[:：]?\s*(?:408|425|429|5\d\d)\b/i.test(String(error))
);

export function getRecoveredVideoTask(request: WalletVideoRequest, taskId: string, outputIndex: number) {
  return request.tasks.find(task => task.taskId === taskId)
    ?? (request.tasks.length === 1 ? request.tasks[0] : request.tasks.find(task => task.outputIndex === outputIndex));
}

export async function waitForWalletVideoRequest(options: {
  lookup: () => Promise<WalletVideoRequest>;
  wait: (ms: number) => Promise<unknown>;
  deadline: number;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  let retryDelay = 2_500;
  while (now() < options.deadline) {
    let request: WalletVideoRequest | undefined;
    try { request = await options.lookup(); }
    catch (error) {
      if (!isVideoLookupMissing(error) && !isUncertainVideoSubmit(error)) throw error;
      retryDelay = Math.min(30_000, retryDelay * 2);
    }
    if (request) {
      if (request.status !== 'processing') return request;
      const delays = request.tasks
        .filter(task => task.status === 'processing')
        .map(task => task.pollAfterMs)
        .filter((ms): ms is number => typeof ms === 'number' && Number.isFinite(ms));
      retryDelay = delays.length ? Math.max(2_500, Math.min(30_000, ...delays)) : 8_000;
    }
    await options.wait(Math.max(0, Math.min(retryDelay, options.deadline - now())));
  }
  throw new WalletVideoRecoveryPendingError();
}
