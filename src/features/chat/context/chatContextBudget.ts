import type { ChatAttachment, ChatMessage, ChatSummary } from '../model/chatTypes';

export type ChatContextBudget = {
  maxContextTokens: number;
  recentMessagesBudget: number;
  summaryBudget: number;
};

export const DEFAULT_CHAT_CONTEXT_BUDGET: ChatContextBudget = {
  maxContextTokens: 24_000,
  recentMessagesBudget: 16_000,
  summaryBudget: 2_500,
};

export const estimateChatTokens = (value: string) => Math.max(1, Math.ceil(value.length / 3.2));

export const estimateVisionTransportBytes = (url: string) => {
  const value = url.trim();
  if (!value) return 0;
  if (!value.startsWith('data:')) return new TextEncoder().encode(value).byteLength;
  const comma = value.indexOf(',');
  if (comma < 0) return new TextEncoder().encode(value).byteLength;
  const payload = value.slice(comma + 1).replace(/\s/g, '');
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(payload.length * 3 / 4) - padding);
};

export const trimTextToTokenBudget = (value: string, budget: number) => {
  if (estimateChatTokens(value) <= budget) return value;
  return value.slice(Math.max(0, value.length - Math.floor(budget * 3.2)));
};

const messageCost = (message: ChatMessage) => (
  estimateChatTokens(message.content)
  + message.attachments.length * 180
  + message.toolCalls.reduce((total, call) => total + estimateChatTokens(call.resultJson || ''), 0)
  + 12
);

export const selectRecentMessagesForBudget = (
  messages: ChatMessage[],
  budget: number,
) => {
  const selected: ChatMessage[] = [];
  let used = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const cost = messageCost(message);
    if (selected.length > 0 && used + cost > budget) break;
    selected.unshift(message);
    used += cost;
  }
  return selected;
};

export const getChatContextBudgetUsage = (input: {
  systemPrompt: string;
  messages: ChatMessage[];
  summary?: ChatSummary | null;
  attachments?: ChatAttachment[];
  visionTransports?: string[];
}) => ({
  system: estimateChatTokens(input.systemPrompt),
  recent: input.messages.reduce((total, message) => total + messageCost(message), 0),
  summary: estimateChatTokens(input.summary?.summary || ''),
  attachments: input.visionTransports
    ? input.visionTransports.reduce((total, value) => total + estimateVisionTransportBytes(value), 0)
    : (input.attachments || []).length * 180,
});
