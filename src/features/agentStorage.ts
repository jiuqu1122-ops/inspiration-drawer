import type { AgentChatMessage, AgentConversation, AgentMessageType } from './agentModel';

const AGENT_CONVERSATIONS_STORAGE_KEY = 'drawer_agent_conversations_v1';
const AGENT_ACTIVE_CONVERSATION_STORAGE_KEY = 'drawer_agent_active_conversation_v1';
const AGENT_SIDEBAR_WIDTH_STORAGE_KEY = 'drawer_agent_sidebar_width_v1';
const MAX_AGENT_CONVERSATIONS = 30;

const normalizeAgentMessage = (value: unknown): AgentChatMessage => {
  if (!value || typeof value !== 'object') return value as AgentChatMessage;
  const message = value as Record<string, unknown>;
  const rawType = message.type;
  const workflowResult = message.workflowResult && typeof message.workflowResult === 'object' && !Array.isArray(message.workflowResult)
    ? message.workflowResult as Record<string, unknown>
    : null;
  const hasWorkflowResult = !!workflowResult
    && ['success', 'partial', 'error'].includes(String(workflowResult.status || ''))
    && typeof workflowResult.workflowName === 'string'
    && Array.isArray(workflowResult.analysisResults)
    && Array.isArray(workflowResult.inspirationReferences)
    && Array.isArray(workflowResult.generationResults)
    && Array.isArray(workflowResult.nextSteps);
  let type: AgentMessageType;
  if (rawType === 'workflow_result') {
    type = hasWorkflowResult ? 'workflow_result' : 'text';
  } else if (rawType === 'text' || rawType === 'tool') {
    type = rawType;
  } else {
    type = Array.isArray(message.toolCalls) && message.toolCalls.length > 0 ? 'tool' : 'text';
  }
  return { ...message, type } as AgentChatMessage;
};

export const readAgentConversations = (): AgentConversation[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(AGENT_CONVERSATIONS_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(value => value && typeof value === 'object' && typeof value.id === 'string')
      .map(value => ({
        ...value,
        title: typeof value.title === 'string' && value.title.trim() ? value.title : '历史对话',
        provider: value.provider === 'codex' ? 'codex' : 'openai-compatible',
        messages: Array.isArray(value.messages)
          ? value.messages.map(normalizeAgentMessage)
          : [],
      }))
      .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .slice(0, MAX_AGENT_CONVERSATIONS) as AgentConversation[];
  } catch (_) {
    return [];
  }
};

export const writeAgentConversations = (conversations: AgentConversation[]) => {
  localStorage.setItem(
    AGENT_CONVERSATIONS_STORAGE_KEY,
    JSON.stringify([...conversations]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_AGENT_CONVERSATIONS)
      .map(conversation => ({
        ...conversation,
        codexThreadId: undefined,
        codexThreadKey: undefined,
      }))),
  );
};

export const clearStoredAgentConversations = () => {
  localStorage.removeItem(AGENT_CONVERSATIONS_STORAGE_KEY);
  localStorage.removeItem(AGENT_ACTIVE_CONVERSATION_STORAGE_KEY);
};

export const readActiveAgentConversationId = () => (
  localStorage.getItem(AGENT_ACTIVE_CONVERSATION_STORAGE_KEY) || ''
);

export const writeActiveAgentConversationId = (id: string) => {
  localStorage.setItem(AGENT_ACTIVE_CONVERSATION_STORAGE_KEY, id);
};

export const readAgentSidebarWidth = () => {
  const value = Number(localStorage.getItem(AGENT_SIDEBAR_WIDTH_STORAGE_KEY));
  return Number.isFinite(value) ? Math.min(620, Math.max(340, value)) : 440;
};

export const writeAgentSidebarWidth = (width: number) => {
  localStorage.setItem(
    AGENT_SIDEBAR_WIDTH_STORAGE_KEY,
    String(Math.round(Math.min(620, Math.max(340, width)))),
  );
};
