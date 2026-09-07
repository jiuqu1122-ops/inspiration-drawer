import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../model/chatTypes';
import { createStreamingAssistantState, finalizeChatMessageState, upsertChatThinkingStep } from '../runtime/chatThinkingRuntime';
import { ChatThinkingPanel } from './ChatThinkingPanel';

const message = (): ChatMessage => createStreamingAssistantState({
  id: 'assistant-1',
  conversationId: 'conversation-1',
  role: 'assistant',
  content: '',
  status: 'streaming',
  createdAt: 1_000,
  attachments: [],
  toolCalls: [],
}, 1_000);

describe('ChatThinkingPanel', () => {
  it('shows a live, expanded processing panel for a streaming message', () => {
    const html = renderToStaticMarkup(<ChatThinkingPanel message={message()} />);
    expect(html).toContain('正在思考');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('正在分析问题');
    expect(html).toContain('不包含模型私有推理');
  });

  it('shows upstream reasoning separately from real tool steps', () => {
    const withReasoning = upsertChatThinkingStep({
      ...message(),
      reasoning: '这是上游公开摘要',
      reasoningStatus: 'streaming',
    }, 'tool-0', {
      type: 'search',
      title: '正在搜索素材库',
      status: 'running',
    }, 2_000);
    const html = renderToStaticMarkup(<ChatThinkingPanel message={withReasoning} />);
    expect(html).toContain('上游公开推理摘要');
    expect(html).toContain('这是上游公开摘要');
    expect(html).toContain('正在搜索素材库');
  });

  it.each([
    ['cancelled', '已停止'],
    ['error', '处理过程中断'],
  ] as const)('shows the %s terminal state', (status, label) => {
    const html = renderToStaticMarkup(
      <ChatThinkingPanel message={finalizeChatMessageState(message(), status, 4_000)} />,
    );
    expect(html).toContain(label);
    expect(html).toContain('aria-expanded="false"');
  });

  it('does not create an empty panel for an old completed message', () => {
    const oldMessage: ChatMessage = {
      ...message(),
      status: 'completed',
      thinkingSteps: undefined,
      reasoning: undefined,
      reasoningStatus: undefined,
    };
    expect(renderToStaticMarkup(<ChatThinkingPanel message={oldMessage} />)).toBe('');
  });
});
