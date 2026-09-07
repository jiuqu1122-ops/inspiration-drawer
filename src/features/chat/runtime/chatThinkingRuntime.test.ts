import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../model/chatTypes';
import {
  appendChatStreamBuffers,
  createStreamingAssistantState,
  finalizeChatMessageState,
  formatChatDuration,
  upsertChatThinkingStep,
} from './chatThinkingRuntime';

const streamingMessage = (now = 1_000): ChatMessage => createStreamingAssistantState({
  id: 'assistant-1',
  conversationId: 'conversation-1',
  role: 'assistant',
  content: '',
  status: 'streaming',
  createdAt: now,
  attachments: [],
  toolCalls: [],
}, now);

describe('Chat thinking runtime', () => {
  it('batches and appends interleaved reasoning and answer deltas independently', () => {
    const reasoning = appendChatStreamBuffers(streamingMessage(), { reasoning: '公开摘要 A' }, 2_000);
    expect(reasoning.reasoning).toBe('公开摘要 A');
    expect(reasoning.content).toBe('');
    expect(reasoning.reasoningStatus).toBe('streaming');

    const answer = appendChatStreamBuffers(reasoning, { content: '正文 A' }, 3_000);
    const interleaved = appendChatStreamBuffers(answer, {
      content: '正文 B',
      reasoning: '；摘要 B',
    }, 4_000);
    expect(interleaved.reasoning).toBe('公开摘要 A；摘要 B');
    expect(interleaved.content).toBe('正文 A正文 B');
    expect(interleaved.thinkingSteps?.some(step => step.title === '正在生成回答')).toBe(true);
  });

  it('tracks a tool from running to completed without leaking its parameters', () => {
    const running = upsertChatThinkingStep(streamingMessage(), 'tool-0', {
      type: 'search',
      title: '正在搜索素材库',
      detail: '正在等待工具结果',
      status: 'running',
    }, 2_000);
    const completed = upsertChatThinkingStep(running, 'tool-0', {
      type: 'search',
      title: '搜索素材库已完成',
      status: 'completed',
    }, 3_000);
    expect(completed.thinkingSteps?.slice(-1)[0]).toMatchObject({
      title: '搜索素材库已完成',
      status: 'completed',
      completedAt: 3_000,
    });
    expect(JSON.stringify(completed.thinkingSteps)).not.toContain('query');
  });

  it.each([
    ['completed', 'completed'],
    ['cancelled', 'cancelled'],
    ['error', 'error'],
  ] as const)('finishes all live steps when the message becomes %s', (messageStatus, stepStatus) => {
    const partial = appendChatStreamBuffers(streamingMessage(), { content: '保留的部分正文' }, 2_000);
    const finished = finalizeChatMessageState(partial, messageStatus, 5_000, '连接中断');
    expect(finished.content).toBe('保留的部分正文');
    expect(finished.status).toBe(messageStatus);
    expect(finished.thinkingSteps?.every(step => !['pending', 'running'].includes(step.status))).toBe(true);
    expect(finished.thinkingSteps?.slice(-1)[0]?.status).toBe(stepStatus);
    expect(finished.generationCompletedAt).toBe(5_000);
  });

  it('formats stable elapsed time without persisting timer ticks', () => {
    expect(formatChatDuration(1_000, 8_400)).toBe('7 秒');
    expect(formatChatDuration(1_000, undefined, 3_100)).toBe('2 秒');
  });
});
