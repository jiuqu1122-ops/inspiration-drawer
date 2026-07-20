import { beforeEach, describe, expect, it } from 'vitest';
import { readAgentConversations } from './agentStorage';

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
  },
});

const STORAGE_KEY = 'drawer_agent_conversations_v1';

describe('Agent conversation workflow result storage', () => {
  beforeEach(() => values.clear());

  it('recognizes and upgrades a compact workflowResult even when message type is missing', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{
      id: 'conversation',
      title: '工业设计',
      provider: 'openai-compatible',
      createdAt: 1,
      updatedAt: 2,
      messages: [{
        id: 'result-message',
        role: 'agent',
        content: '工业设计成果',
        timestamp: 2,
        workflowResult: {
          workflowId: 'industrial-design-full-process',
          title: '工业设计成果',
          stages: [
            { stage: 'requirement', title: '需求分析', summary: '需求摘要' },
            null,
            { stage: 'unknown', title: '无效阶段', summary: '忽略' },
          ],
          references: [null, { id: 'ref', title: '产品参考', role: 'SUBJECT_REF' }],
          media: [{ id: 'output', type: 'image', url: 'https://example.com/output.jpg' }],
        },
      }],
    }]));

    const conversations = readAgentConversations();
    const message = conversations[0]?.messages[0];
    expect(message?.type).toBe('workflow_result');
    expect(message?.workflowResult?.stages).toHaveLength(1);
    expect(message?.workflowResult?.references).toHaveLength(1);
    expect(message?.workflowResult?.media).toHaveLength(1);
    expect(message?.workflowResult?.analysisResults[0]?.agentRole).toBe('requirement_analyzer');
  });

  it('prioritizes a valid workflowResult when a legacy message was stored as text', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{
      id: 'conversation',
      title: 'Industrial design',
      provider: 'openai-compatible',
      createdAt: 1,
      updatedAt: 2,
      messages: [{
        id: 'result-message',
        role: 'agent',
        type: 'text',
        content: 'Workflow completed',
        timestamp: 2,
        workflowResult: {
          workflowId: 'industrial-design-full-process',
          stages: [{ stage: 'delivery', title: 'Delivery', summary: 'Final result' }],
        },
      }],
    }]));

    const message = readAgentConversations()[0]?.messages[0];
    expect(message?.type).toBe('workflow_result');
    expect(message?.workflowResult?.stages[0]?.stage).toBe('delivery');
  });
});
