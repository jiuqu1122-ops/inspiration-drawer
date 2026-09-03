import { describe, expect, it } from 'vitest';
import type { ChatToolCall } from '../model/chatTypes';
import { summarizeCompletedBatchCall } from './chatBatchCompletion';

const call = (status: ChatToolCall['status'], result: Record<string, unknown>): ChatToolCall => ({
  id: 'call-1',
  messageId: 'message-1',
  toolName: 'batch_image_operation',
  argumentsJson: '{}',
  resultJson: JSON.stringify(result),
  status,
  createdAt: 1,
});

describe('Chat batch completion summary', () => {
  it('does not turn a completed 6/6 batch into a Chat request failure', () => {
    expect(summarizeCompletedBatchCall(call('completed', {
      phase: 'completed', total: 6, succeeded: 6, failed: 0,
    }))).toEqual({
      content: '**处理完成**\n\n6 张图片已全部处理完成，结果已经按原顺序加入画布并完成编组。',
      status: 'completed',
    });
  });

  it('reports partial and real failures accurately', () => {
    expect(summarizeCompletedBatchCall(call('completed', {
      total: 6, succeeded: 5, failed: 1,
    })).status).toBe('completed');
    expect(summarizeCompletedBatchCall(call('error', {
      total: 6, succeeded: 0, failed: 6, error: '渠道不可用',
    }))).toEqual({
      content: '批量处理没有完成：渠道不可用',
      status: 'error',
    });
  });
});
