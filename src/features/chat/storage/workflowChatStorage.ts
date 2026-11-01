import type { WorkflowResultCardData } from '../../agentModel';

const KEY = 'inspiration-workflow-chat-bindings-v1';
export type WorkflowChatBinding = { canvasId: string; nodeId: string; conversationId: string; result?: WorkflowResultCardData };

export function readWorkflowChatBindings(storage: Pick<Storage, 'getItem'> = localStorage): WorkflowChatBinding[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(KEY) || '[]');
    return Array.isArray(value) ? value.filter((item): item is WorkflowChatBinding => Boolean(item && typeof item.canvasId === 'string' && typeof item.nodeId === 'string' && typeof item.conversationId === 'string')) : [];
  } catch { return []; }
}

export function saveWorkflowChatBinding(binding: WorkflowChatBinding, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage) {
  const bindings = readWorkflowChatBindings(storage).filter(item => !(item.canvasId === binding.canvasId && item.nodeId === binding.nodeId));
  storage.setItem(KEY, JSON.stringify([...bindings, binding]));
}

export function getWorkflowChatBinding(canvasId: string, nodeId?: string, storage: Pick<Storage, 'getItem'> = localStorage) {
  return readWorkflowChatBindings(storage).filter(item => item.canvasId === canvasId && (!nodeId || item.nodeId === nodeId)).slice(-1)[0];
}
