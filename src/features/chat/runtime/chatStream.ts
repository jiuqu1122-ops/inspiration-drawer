import { invoke } from '@tauri-apps/api/core';
import { protectChatProviderRequest } from '../context/chatRequestSize';

export type ChatProviderToolCall = { id: string; name: string; arguments: string };
export type ChatProviderResult = {
  requestId: string;
  content: string;
  toolCalls: ChatProviderToolCall[];
  finishReason?: string;
  usage?: Record<string, unknown>;
};

export const friendlyChatRequestError = (error: unknown) => {
  const text = String(error instanceof Error ? error.message : error || '');
  if (/\b413\b|payload too large|content too large|request entity too large/i.test(text)) {
    console.error('Chat provider rejected an oversized request:', text);
    return new Error('发送内容过大，请减少附件数量或稍后重试。');
  }
  return error instanceof Error ? error : new Error(text || 'Chat 请求失败');
};

export const requestChatCompletion = (input: {
  requestId: string;
  messages: Array<Record<string, unknown>>;
  tools: Array<Record<string, unknown>>;
  toolChoice?: string | Record<string, unknown>;
  model?: string;
  stream?: boolean;
}) => {
  const protectedRequest = protectChatProviderRequest({
    messages: input.messages,
    tools: input.tools,
    model: input.model,
  });
  return invoke<ChatProviderResult>('agent_openai_chat', {
    request: {
      requestId: input.requestId,
      messages: protectedRequest.messages,
      tools: input.tools,
      toolChoice: input.toolChoice,
      model: input.model,
      stream: input.stream !== false,
    },
  }).catch(error => Promise.reject(friendlyChatRequestError(error)));
};

export const cancelChatCompletion = (requestId: string) => invoke('agent_cancel_openai', { requestId });
