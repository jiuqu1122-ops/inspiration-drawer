import { invoke } from '@tauri-apps/api/core';
import { protectChatProviderRequest } from '../context/chatRequestSize';
import type { AgentModelUsageContext } from './agentModelResolution';

export type ChatProviderToolCall = { id: string; name: string; arguments: string };
export type ChatProviderResult = {
  requestId: string;
  content: string;
  reasoning?: string;
  toolCalls: ChatProviderToolCall[];
  finishReason?: string;
  usage?: Record<string, unknown>;
};

export type ChatStreamEventKind =
  | 'content_delta'
  | 'reasoning_delta'
  | 'tool_call_delta'
  | 'tool_started'
  | 'tool_completed'
  | 'status'
  | 'usage'
  | 'completed'
  | 'error';

export type ChatStreamEvent = {
  requestId: string;
  kind: ChatStreamEventKind;
  delta?: string;
  toolCallId?: string;
  toolName?: string;
  toolIndex?: number;
  toolStatus?: string;
  stage?: string;
  status?: string;
  progress?: number;
  usage?: Record<string, unknown>;
  error?: string;
  timestamp?: number;
};

export const normalizeChatStreamEvent = (payload: unknown): ChatStreamEvent | null => {
  if (!payload || typeof payload !== 'object') return null;
  const value = payload as Record<string, unknown>;
  const requestId = String(value.requestId || '').trim();
  if (!requestId) return null;
  const rawKind = String(value.kind || '').trim();
  const kind = rawKind === 'delta' ? 'content_delta' : rawKind;
  const supported = new Set<ChatStreamEventKind>([
    'content_delta',
    'reasoning_delta',
    'tool_call_delta',
    'tool_started',
    'tool_completed',
    'status',
    'usage',
    'completed',
    'error',
  ]);
  if (!supported.has(kind as ChatStreamEventKind)) return null;
  const toolCall = value.toolCall && typeof value.toolCall === 'object'
    ? value.toolCall as Record<string, unknown>
    : {};
  return {
    requestId,
    kind: kind as ChatStreamEventKind,
    delta: typeof value.delta === 'string' ? value.delta : undefined,
    toolCallId: String(value.toolCallId || toolCall.id || '').trim() || undefined,
    toolName: String(value.toolName || toolCall.name || '').trim() || undefined,
    toolIndex: Number.isFinite(Number(value.toolIndex ?? toolCall.index))
      ? Number(value.toolIndex ?? toolCall.index)
      : undefined,
    toolStatus: String(value.toolStatus || '').trim() || undefined,
    stage: String(value.stage || '').trim() || undefined,
    status: String(value.status || '').trim() || undefined,
    progress: Number.isFinite(Number(value.progress)) ? Number(value.progress) : undefined,
    usage: value.usage && typeof value.usage === 'object'
      ? value.usage as Record<string, unknown>
      : undefined,
    error: String(value.error || value.message || '').trim() || undefined,
    timestamp: Number.isFinite(Number(value.timestamp)) ? Number(value.timestamp) : undefined,
  };
};

export const isChatStreamEventForRequest = (
  event: ChatStreamEvent,
  activeRequestId: string,
) => isChatRequestIdCurrent(activeRequestId, event.requestId);

export const isChatRequestIdCurrent = (
  activeRequestId: string | undefined,
  expectedRequestId: string,
) => Boolean(activeRequestId) && activeRequestId === expectedRequestId;

export const friendlyChatRequestError = (error: unknown) => {
  const text = String(error instanceof Error ? error.message : error || '');
  if (/\b413\b|payload too large|content too large|request entity too large/i.test(text)) {
    console.error('Chat provider rejected an oversized request:', text);
    return new Error('发送内容过大，请减少附件数量或稍后重试。');
  }
  return error instanceof Error ? error : new Error(text || 'Chat 请求失败');
};

export const isUpstreamUnavailableChatError = (error: unknown) => {
  const text = String(error instanceof Error ? error.message : error || '');
  return /UPSTREAM_UNAVAILABLE|Agent 渠道请求失败|上游.{0,24}(?:超时|不可用|失败)|upstream.{0,24}(?:timed?\s*out|timeout|unavailable|failed)/i.test(text);
};

export const isRecoverableChatRequestError = (error: unknown) => {
  const text = String(error instanceof Error ? error.message : error || '');
  if (/MODEL_FALLBACK_EXHAUSTED/i.test(text)) return false;
  if (isUpstreamUnavailableChatError(text)) return false;
  if (/\b(?:400|401|403|413)\b|unauthori[sz]ed|forbidden|invalid api|payload too large|content too large|余额|配额|quota/i.test(text)) {
    return false;
  }
  return /timed?\s*out|timeout|network|connection|connect|socket|dns|reset|closed|broken pipe|\b(?:429|500|502|503|504|524)\b|后台任务查询|响应.*解析|网络|连接|超时|断开|暂时无法/i.test(text);
};

export const requestChatCompletion = (input: {
  requestId: string;
  messages: Array<Record<string, unknown>>;
  tools: Array<Record<string, unknown>>;
  toolChoice?: string | Record<string, unknown>;
  model?: string;
  stream?: boolean;
  usageContext?: AgentModelUsageContext;
}) => {
  const protectedRequest = protectChatProviderRequest({
    messages: input.messages,
    tools: input.tools,
    model: input.model,
  });
  const invokeRequest = () => invoke<ChatProviderResult>('agent_openai_chat', {
    request: {
      requestId: input.requestId,
      messages: protectedRequest.messages,
      tools: input.tools,
      toolChoice: input.toolChoice,
      model: input.model,
      stream: input.stream !== false,
      usageContext: input.usageContext,
    },
  });
  const requestWithRecovery = invokeRequest().catch(async error => {
    const friendly = friendlyChatRequestError(error);
    if (!isRecoverableChatRequestError(friendly)) throw friendly;
    // The backend requestId is idempotent. Reusing it lets Rust resume a
    // persisted task whose submission response or polling connection was lost.
    try {
      return await invokeRequest();
    } catch (retryError) {
      throw friendlyChatRequestError(retryError);
    }
  });
  return requestWithRecovery.then(async result => {
    // Keep a completed wallet task resumable until its result crossed the IPC
    // boundary successfully. Acknowledgement is intentionally best-effort for
    // non-wallet providers and must never hide an already received answer.
    try {
      await invoke('agent_ack_wallet_task', { requestId: input.requestId });
    } catch (error) {
      console.warn('确认 Chat 后台任务结果失败，将保留任务用于恢复:', error);
    }
    return result;
  });
};

export const cancelChatCompletion = (requestId: string) => invoke('agent_cancel_openai', { requestId });
