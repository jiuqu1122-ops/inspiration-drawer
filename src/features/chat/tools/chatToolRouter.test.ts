import { describe, expect, it, vi } from 'vitest';
import { routeChatToolCall } from './chatToolRouter';

describe('Chat tool router', () => {
  it('runs an explicit batch image operation without a second confirmation', async () => {
    const executor = vi.fn(async () => ({ ok: true }));
    const onExecuting = vi.fn();
    const result = await routeChatToolCall({
      name: 'batch_image_operation',
      args: {
        analysisSummary: '分别保持主体并统一增加英文说明。',
        instruction: '为每张图片独立排版并增加英文说明',
        mode: 'one_per_image',
      },
      context: {
        userText: '帮我把这几张图都排一下版',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        recentMessages: [],
      },
      executor,
      approvalMode: 'ask',
      onExecuting,
    });

    expect(result.requiresApproval).toBe(false);
    expect(onExecuting).toHaveBeenCalledOnce();
    expect(executor).toHaveBeenCalledOnce();
  });

  it('runs image generation after a short continuation without a second confirmation', async () => {
    const executor = vi.fn(async () => ({ ok: true }));
    const result = await routeChatToolCall({
      name: 'generate_image',
      args: { prompt: '按前面的方案制作完整作品集展板' },
      context: {
        userText: '开始',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        recentMessages: [],
      },
      executor,
      approvalMode: 'ask',
    });

    expect(result.requiresApproval).toBe(false);
    expect(executor).toHaveBeenCalledOnce();
  });

  it('still confirms workflow runs that may incur cost', async () => {
    const executor = vi.fn(async () => ({ ok: true }));
    const result = await routeChatToolCall({
      name: 'run_workflow',
      args: { workflowId: 'workflow-1', inputIds: [] },
      context: {
        userText: '看看这个工作流',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        recentMessages: [],
      },
      executor,
      approvalMode: 'ask',
    });

    expect(result.requiresApproval).toBe(true);
    expect(executor).not.toHaveBeenCalled();
  });
});
