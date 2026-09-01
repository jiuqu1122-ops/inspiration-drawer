import { invoke } from '@tauri-apps/api/core';

export type ChatProviderToolCall = { id: string; name: string; arguments: string };
export type ChatProviderResult = {
  requestId: string;
  content: string;
  toolCalls: ChatProviderToolCall[];
  finishReason?: string;
  usage?: Record<string, unknown>;
};

export const requestChatCompletion = (input: {
  requestId: string;
  messages: Array<Record<string, unknown>>;
  tools: Array<Record<string, unknown>>;
  model?: string;
  stream?: boolean;
}) => invoke<ChatProviderResult>('agent_openai_chat', {
  request: {
    requestId: input.requestId,
    messages: input.messages,
    tools: input.tools,
    model: input.model,
    stream: input.stream !== false,
  },
});

export const cancelChatCompletion = (requestId: string) => invoke('agent_cancel_openai', { requestId });
