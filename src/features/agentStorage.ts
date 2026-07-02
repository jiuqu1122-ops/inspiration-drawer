import type { AgentConversation } from './agentModel';

const AGENT_CONVERSATIONS_STORAGE_KEY = 'drawer_agent_conversations_v1';
const AGENT_ACTIVE_CONVERSATION_STORAGE_KEY = 'drawer_agent_active_conversation_v1';
const AGENT_SIDEBAR_WIDTH_STORAGE_KEY = 'drawer_agent_sidebar_width_v1';
const MAX_AGENT_CONVERSATIONS = 30;

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
        messages: Array.isArray(value.messages) ? value.messages : [],
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
      .slice(0, MAX_AGENT_CONVERSATIONS)),
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
  return Number.isFinite(value) ? Math.min(620, Math.max(340, value)) : 420;
};

export const writeAgentSidebarWidth = (width: number) => {
  localStorage.setItem(
    AGENT_SIDEBAR_WIDTH_STORAGE_KEY,
    String(Math.round(Math.min(620, Math.max(340, width)))),
  );
};
