import type { ChatMessageStatus, ChatToolCall } from '../model/chatTypes';

export type ChatBatchCompletionSummary = {
  content: string;
  status: ChatMessageStatus;
};

const parseResult = (value: string | null | undefined): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch (_) {
    return {};
  }
};

export const summarizeCompletedBatchCall = (
  call: ChatToolCall,
): ChatBatchCompletionSummary => {
  const result = parseResult(call.resultJson);
  const total = Math.max(0, Math.round(Number(result.total) || 0));
  const succeeded = Math.max(0, Math.round(Number(result.succeeded) || 0));
  const failed = Math.max(0, Math.round(Number(result.failed) || 0));
  const cancelled = call.status === 'cancelled' || result.cancelled === true;
  if (cancelled) {
    return {
      content: `批量处理已停止，已保留 ${succeeded} 张完成结果。`,
      status: 'cancelled',
    };
  }
  if (call.status === 'error' || (total > 0 && succeeded === 0)) {
    const error = String(result.error || '').trim();
    return {
      content: error ? `批量处理没有完成：${error}` : '批量处理没有完成，请直接重试。',
      status: 'error',
    };
  }
  if (failed > 0) {
    return {
      content: `**处理完成**\n\n已完成 ${succeeded}/${total || succeeded} 张，另有 ${failed} 张失败；成功结果已经加入画布并完成编组。`,
      status: 'completed',
    };
  }
  return {
    content: `**处理完成**\n\n${total || succeeded} 张图片已全部处理完成，结果已经按原顺序加入画布并完成编组。`,
    status: 'completed',
  };
};
