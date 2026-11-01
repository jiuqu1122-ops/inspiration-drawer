import { describe, expect, it, vi } from 'vitest';
import { routeChatToolCall } from './chatToolRouter';

describe('Chat tool router', () => {
  it('routes explicit agent creation to local storage without an extra approval', async () => {
    const executor = vi.fn(async () => ({ created: true, id: 'agent-1' }));
    const context = { userText: '创建一个产品设计智能体', conversationId: 'conversation-1', messageId: 'message-1', recentMessages: [] };
    const result = await routeChatToolCall({
      name: 'create_agent',
      args: { name: '产品设计师', description: '设计产品外观', triggers: ['外观'], instructions: '先分析需求。' },
      context, executor, approvalMode: 'ask',
    });
    expect(result.requiresApproval).toBe(false);
    expect(executor).toHaveBeenCalledOnce();
    await expect(routeChatToolCall({ name: 'create_agent', args: { name: '空' }, context, executor }))
      .rejects.toThrow('技能指令');
  });
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

  it('blocks a merged count request when the user asked for independent semantic variants', async () => {
    const executor = vi.fn();
    await expect(routeChatToolCall({
      name: 'generate_image',
      args: { prompt: '方向 A；方向 B；方向 C', count: 3 },
      context: {
        userText: '生成三个不同方向，每个方向各自出一张图',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        recentMessages: [],
      },
      executor,
    })).rejects.toThrow('generate_image_variants');
    expect(executor).not.toHaveBeenCalled();
  });

  it('normalizes an explicit one-board multi-option request to count one', async () => {
    const executor = vi.fn(async (_name, args: Record<string, unknown>) => args);
    await routeChatToolCall({
      name: 'generate_image',
      args: { prompt: '三个方案横向并排展示', count: 3 },
      context: {
        userText: '生成一张图，里面并排展示三个不同方案',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        recentMessages: [],
      },
      executor,
    });
    expect(executor).toHaveBeenCalledWith(
      'generate_image',
      expect.objectContaining({ count: 1 }),
      expect.any(Object),
    );
  });

  it('rejects an independent-variants tool when the user explicitly requested one comparison board', async () => {
    await expect(routeChatToolCall({
      name: 'generate_image_variants',
      args: {
        sharedRequirements: '统一布局',
        variants: [{ name: 'A', prompt: '方案 A' }, { name: 'B', prompt: '方案 B' }],
      },
      context: {
        userText: '把两个不同方向放在同一张图里对比',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        recentMessages: [],
      },
      executor: vi.fn(),
    })).rejects.toThrow('同一张图');
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

  it('routes workflow creation as a safe write and does not run it', async () => {
    const executor = vi.fn(async () => ({ workflowId: 'workflow-1' }));
    const steps = [{ id: 'image-1', type: 'image-generator', label: '主视觉', prompt: '生成产品主视觉' }];
    const result = await routeChatToolCall({
      name: 'create_workflow',
      args: { label: '产品主视觉工作流', steps },
      context: {
        userText: '创建一个产品主视觉工作流',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        recentMessages: [],
      },
      executor,
      approvalMode: 'ask',
    });
    expect(result.requiresApproval).toBe(false);
    expect(result.permission.riskLevel).toBe('safe_write');
    expect(executor).toHaveBeenCalledWith('create_workflow', { label: '产品主视觉工作流', steps }, expect.any(Object));
  });

  it('accepts the legacy selected-shapes alias from persisted Chat sessions', async () => {
    const executor = vi.fn(async (name: string) => ({ name }));
    const result = await routeChatToolCall({
      name: 'get_canvas_selected_shapes',
      args: {},
      context: {
        userText: 'read current canvas selection',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        recentMessages: [],
      },
      executor,
      approvalMode: 'auto',
    });

    expect(executor).toHaveBeenCalledWith('get_canvas_selection', {}, expect.any(Object));
    expect(result.result).toEqual({ name: 'get_canvas_selection' });
  });
});
