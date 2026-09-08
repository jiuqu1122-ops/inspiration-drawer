import { describe, expect, it } from 'vitest';
import type { ChatToolCall } from '../model/chatTypes';
import type { ChatMessage } from '../model/chatTypes';
import {
  completedMediaToolIsMissingVisibleResult,
  finalizeOrphanedStreamingChatMessage,
  summarizeCompletedVisibleToolCalls,
} from './chatVisibleToolCompletion';

const call = (
  toolName: string,
  status: ChatToolCall['status'],
  result: Record<string, unknown>,
): ChatToolCall => ({
  id: `call-${toolName}`,
  messageId: 'message-1',
  toolName,
  argumentsJson: '{}',
  resultJson: JSON.stringify(result),
  status,
  createdAt: 1,
});

describe('visible Chat tool completion', () => {
  it('treats completed generated media as the terminal user-visible result', () => {
    const summary = summarizeCompletedVisibleToolCalls([
      call('edit_image', 'completed', {
        media: [{ id: 'image-1', type: 'image', path: 'C:\\outputs\\image.png' }],
      }),
    ]);

    expect(summary).toEqual({
      content: '**生成完成**\n\n1 张图片已生成，结果已保留。',
      mediaCount: 1,
      fileCount: 0,
    });
  });

  it('does not hide a real tool failure behind a success summary', () => {
    expect(summarizeCompletedVisibleToolCalls([
      call('generate_image', 'error', {
        media: [{ id: 'partial', type: 'image', path: 'C:\\outputs\\partial.png' }],
      }),
    ])).toBeNull();
  });

  it('rejects a completed media tool that has no real media result', () => {
    const completedWithoutMedia = call('generate_image', 'completed', {
      message: '图片生成已完成',
      media: [],
    });

    expect(completedMediaToolIsMissingVisibleResult(completedWithoutMedia)).toBe(true);
    expect(summarizeCompletedVisibleToolCalls([completedWithoutMedia])).toBeNull();
  });

  it('deduplicates visible artifacts returned by multiple progress snapshots', () => {
    const summary = summarizeCompletedVisibleToolCalls([
      call('generate_image_variants', 'completed', {
        media: [
          { id: 'image-1', type: 'image', path: 'C:\\outputs\\one.png' },
          { id: 'image-1', type: 'image', path: 'C:\\outputs\\one.png' },
          { id: 'image-2', type: 'image', path: 'C:\\outputs\\two.png' },
        ],
      }),
    ]);

    expect(summary?.mediaCount).toBe(2);
    expect(summary?.content).toContain('2 张图片');
  });

  it('repairs a persisted streaming message after its visible result already completed', () => {
    const completedCall = call('edit_image', 'completed', {
      media: [{ id: 'image-1', type: 'image', path: 'C:\\outputs\\image.png' }],
    });
    const message: ChatMessage = {
      id: 'assistant-1',
      conversationId: 'conversation-1',
      role: 'assistant',
      content: '正在为你出图。',
      status: 'streaming',
      createdAt: 1,
      attachments: [],
      toolCalls: [completedCall],
      thinkingSteps: [{
        id: 'assistant-1:thinking:provider-status',
        type: 'context',
        title: '正在等待上游处理',
        status: 'running',
      }],
    };

    const repaired = finalizeOrphanedStreamingChatMessage(message, 5_000);
    expect(repaired.status).toBe('completed');
    expect(repaired.content).toContain('1 张图片已生成');
    expect(repaired.thinkingSteps).toEqual([]);
  });

  it('marks an orphaned request without a visible result as interrupted', () => {
    const message: ChatMessage = {
      id: 'assistant-1',
      conversationId: 'conversation-1',
      role: 'assistant',
      content: '',
      status: 'streaming',
      createdAt: 1,
      attachments: [],
      toolCalls: [],
    };
    const repaired = finalizeOrphanedStreamingChatMessage(message, 5_000);
    expect(repaired.status).toBe('error');
    expect(repaired.content).toContain('上次生成意外中断');
  });
});
