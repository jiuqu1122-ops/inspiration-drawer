import { useSyncExternalStore } from 'react';
import type { WorkflowResultCardData } from '../../agentModel';

let workflowResult: WorkflowResultCardData | undefined;
const listeners = new Set<() => void>();
let conversationRequest: { id: string; title: string } | undefined;
const conversationListeners = new Set<() => void>();
let conversationSequence = 0;

export const setCanvasWorkflowProgress = (result?: WorkflowResultCardData) => {
  workflowResult = result;
  listeners.forEach(listener => listener());
};

export const getCanvasWorkflowProgress = () => workflowResult;

export const subscribeCanvasWorkflowProgress = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useCanvasWorkflowProgress = () => useSyncExternalStore(
  subscribeCanvasWorkflowProgress,
  getCanvasWorkflowProgress,
  getCanvasWorkflowProgress,
);

export const requestCanvasWorkflowConversation = (workflowName: string) => {
  conversationSequence += 1;
  conversationRequest = {
    id: `workflow-conversation-${Date.now()}-${conversationSequence}`,
    title: workflowName.trim().slice(0, 72) || '工作流运行',
  };
  conversationListeners.forEach(listener => listener());
};

const getCanvasWorkflowConversationRequest = () => conversationRequest;

const subscribeCanvasWorkflowConversationRequest = (listener: () => void) => {
  conversationListeners.add(listener);
  return () => conversationListeners.delete(listener);
};

export const useCanvasWorkflowConversationRequest = () => useSyncExternalStore(
  subscribeCanvasWorkflowConversationRequest,
  getCanvasWorkflowConversationRequest,
  getCanvasWorkflowConversationRequest,
);
