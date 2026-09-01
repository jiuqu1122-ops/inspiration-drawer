import type { AgentChatMessage, AgentConversation, AgentMessageType } from './agentModel';
import { normalizeWorkflowResultCardData } from './workflowResult';

const AGENT_CONVERSATIONS_STORAGE_KEY = 'drawer_agent_conversations_v1';
const AGENT_ACTIVE_CONVERSATION_STORAGE_KEY = 'drawer_agent_active_conversation_v1';
const AGENT_SIDEBAR_WIDTH_STORAGE_KEY = 'drawer_agent_sidebar_width_v2';
const AGENT_SIDEBAR_MIN_WIDTH = 420;
const AGENT_SIDEBAR_MAX_WIDTH = 640;
const AGENT_SIDEBAR_DEFAULT_WIDTH = 480;
const MAX_AGENT_CONVERSATIONS = 30;

const normalizeAgentMessage = (value: unknown): AgentChatMessage => {
  if (!value || typeof value !== 'object') return value as AgentChatMessage;
  const message = value as Record<string, unknown>;
  const rawType = message.type;
  const workflowResult = normalizeWorkflowResultCardData(message.workflowResult);
  const hasWorkflowResult = !!workflowResult;
  let type: AgentMessageType;
  if (hasWorkflowResult) {
    type = 'workflow_result';
  } else if (rawType === 'workflow_result') {
    type = 'text';
  } else if (rawType === 'text' || rawType === 'tool') {
    type = rawType;
  } else {
    type = Array.isArray(message.toolCalls) && message.toolCalls.length > 0 ? 'tool' : 'text';
  }
  return {
    ...message,
    type,
    ...(workflowResult ? { workflowResult } : {}),
  } as AgentChatMessage;
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
  return Number.isFinite(value)
    ? Math.min(AGENT_SIDEBAR_MAX_WIDTH, Math.max(AGENT_SIDEBAR_MIN_WIDTH, value))
    : AGENT_SIDEBAR_DEFAULT_WIDTH;
};

export const writeAgentSidebarWidth = (width: number) => {
  localStorage.setItem(
    AGENT_SIDEBAR_WIDTH_STORAGE_KEY,
    String(Math.round(Math.min(AGENT_SIDEBAR_MAX_WIDTH, Math.max(AGENT_SIDEBAR_MIN_WIDTH, width)))),
  );
};
