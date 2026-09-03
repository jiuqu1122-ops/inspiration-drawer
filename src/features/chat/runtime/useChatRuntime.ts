import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createChatId,
  getGeneratedMediaFromToolCall,
  type ChatAttachment,
  type ChatConversation,
  type ChatGeneratedMedia,
  type ChatMessage,
  type ChatSummary,
  type ChatToolCall,
  type ChatToolExecutor,
  type PendingChatAttachment,
} from '../model/chatTypes';
import {
  deleteChatConversation,
  getChatSummary,
  listChatConversations,
  listChatMessages,
  migrateLegacyAgentConversations,
  readActiveChatConversationId,
  upsertChatAttachment,
  upsertChatConversation,
  upsertChatMessage,
  upsertChatSummary,
  upsertChatToolCall,
  writeActiveChatConversationId,
} from '../storage/chatStorage';
import { buildChatContext, buildSummaryRequestMessages } from '../context/chatContextBuilder';
import { estimateChatTokens } from '../context/chatContextBudget';
import type { ChatVisionAttachmentResolver } from '../attachments/chatVisionAttachmentResolver';
import {
  getChatToolDefinitions,
  shouldDirectGenerateImage,
  shouldExposeBatchImageOperation,
  shouldExposeWebSearch,
} from '../tools/chatToolDefinitions';
import { routeChatToolCall } from '../tools/chatToolRouter';
import { compactChatToolResult, compactChatToolResultForProvider, serializeChatToolResult } from '../tools/chatToolResult';
import { selectBatchImageAttachments } from '../tools/batchImageOperation';
import { applyChatImageGenerationSettings } from './chatImageGenerationSettings';
import { summarizeCompletedBatchCall } from './chatBatchCompletion';
import { extractChatBatchImagePlan } from './chatBatchImagePlan';
import {
  fallbackBatchPlanDecision,
  parseBatchPlanDecision,
  type BatchPlanDecision,
} from './chatBatchPlanReply';
import { isHistoricalImageContinuation, selectChatImageAttachments } from './chatHistoricalAttachments';
import { resolveChatReferenceArguments } from './chatReferenceArguments';
import { normalizeVisibleChatText } from './chatVisibleText';
import {
  createKeyedSerialTaskQueue,
  normalizeChatModelSelection,
  resolveChatRequestModel,
  type KeyedSerialTaskQueue,
} from './chatModelSelection';
import { cancelChatCompletion, requestChatCompletion, type ChatProviderResult } from './chatStream';

export type ChatBatchStartedPayload = {
  batchId: string;
  name: string;
  instruction: string;
  attachmentIds: string[];
  total: number;
  outputCountPerImage: number;
  aspectRatio?: string;
};

export type ChatBatchMediaReadyPayload = {
  batchId: string;
  media: ChatGeneratedMedia;
  attachmentId: string;
  sourceIndex: number;
  outputIndex: number;
  slotIndex: number;
  total: number;
};

export type ChatBatchCompletedPayload = {
  batchId: string;
  total: number;
  completedSlots: number;
  failedSourceIndexes: number[];
  cancelled: boolean;
};

export type UseChatRuntimeOptions = {
  model: string;
  imageModel?: string;
  imageAspectRatio?: string;
  imageResolution?: string;
  approvalMode?: 'ask' | 'auto';
  executeTool: ChatToolExecutor;
  resolveAttachmentUrl?: (attachment: ChatAttachment) => Promise<string>;
  createVisionAttachmentResolver?: () => ChatVisionAttachmentResolver;
  prepareAttachment?: (attachment: PendingChatAttachment) => Promise<PendingChatAttachment>;
  onNotice?: (message: string) => void;
  onGeneratedMediaReady?: (media: ChatGeneratedMedia) => void | Promise<void>;
  onBatchStarted?: (payload: ChatBatchStartedPayload) => void | Promise<void>;
  onBatchMediaReady?: (payload: ChatBatchMediaReadyPayload) => void | Promise<void>;
  onBatchCompleted?: (payload: ChatBatchCompletedPayload) => void | Promise<void>;
};

type PendingApprovalRun = {
  conversationId: string;
  assistantMessageId: string;
  userText: string;
  requestModel: string;
  providerMessages: Array<Record<string, unknown>>;
  calls: ChatToolCall[];
  index: number;
  toolMessages: Array<Record<string, unknown>>;
  depth: number;
};

type ActiveChatRequest = {
  requestId: string;
  conversationId: string;
  messageId: string;
  streamed: boolean;
};

type ActiveBatchRun = {
  callId: string;
  messageId: string;
  controller: AbortController;
};

const PAGE_SIZE = 50;
const MAX_TOOL_ROUNDS = 6;
const SUMMARY_TRIGGER_TOKENS = 18_000;
const SUMMARY_TRIGGER_MESSAGES = 36;
const SUMMARY_KEEP_RECENT = 28;
const LEGACY_PROVIDER_MODELS = new Set(['codex', 'openai-compatible', 'default']);
const CHAT_WEB_SEARCH_ENABLED_STORAGE_KEY = 'drawer_chat_web_search_enabled';
const STREAM_RENDER_INTERVAL_MS = 64;

const classifyBatchPlanReply = async (input: {
  model: string;
  analysisSummary: string;
  userReply: string;
  hasNewAttachments: boolean;
}): Promise<BatchPlanDecision> => {
  const requestId = createChatId('chat-batch-plan-decision');
  try {
    const result = await requestChatCompletion({
      requestId,
      model: input.model,
      stream: false,
      messages: [
        {
          role: 'system',
          content: [
            '你负责判断用户对图片批处理执行方案的自然语言回复。',
            'confirm：用户认可方案、表示继续、让你开始做或开始生图，即使没有使用固定口令。',
            'revise：用户提出任何新增要求、否定项、修改意见，或带来了新的附件。',
            'cancel：用户明确表示取消、停止或暂时不做。',
            '不要回答用户，不要解释，只调用 decide_batch_plan_reply 一次。',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            `当前方案：\n${input.analysisSummary.slice(0, 6_000)}`,
            `用户回复：\n${input.userReply.slice(0, 2_000)}`,
            `用户是否新增附件：${input.hasNewAttachments ? '是' : '否'}`,
          ].join('\n\n'),
        },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'decide_batch_plan_reply',
          description: '判断用户是在确认执行、修改方案还是取消任务。',
          parameters: {
            type: 'object',
            additionalProperties: false,
            properties: {
              action: { type: 'string', enum: ['confirm', 'revise', 'cancel'] },
            },
            required: ['action'],
          },
        },
      }],
      toolChoice: {
        type: 'function',
        function: { name: 'decide_batch_plan_reply' },
      },
    });
    const toolDecision = result.toolCalls
      .find(call => call.name === 'decide_batch_plan_reply')?.arguments;
    return parseBatchPlanDecision(toolDecision)
      || parseBatchPlanDecision(result.content)
      || fallbackBatchPlanDecision(input.userReply);
  } catch (error) {
    console.warn('LLM 判断批处理方案回复失败，使用本地兜底:', error);
    return fallbackBatchPlanDecision(input.userReply);
  }
};

const createBatchGroupName = (instruction: string) => {
  const subject = instruction
    .replace(/\s+/g, ' ')
    .replace(/[。！？!?].*$/, '')
    .trim()
    .slice(0, 18);
  return subject ? `批量处理 ${subject}` : 'Chat 批量处理';
};

const createFallbackBatchImagePlan = (
  imageCount: number,
  instruction: string,
) => ({
  analysisSummary: [
    `我理解这次需要对 ${imageCount} 张图片分别执行同一个任务：${normalizeVisibleChatText(instruction) || '按当前要求处理每张图片'}。`,
    '',
    '### 执行安排',
    '',
    '- 每张原图作为独立输入并发处理，不把多张图片合并成一张。',
    '- 对每张图执行相同目标，同时根据各自的主体、构图和已有细节自适应调整具体参数。',
    '',
    '### 改动边界',
    '',
    '- 只修改用户本次明确提出的内容；没有要求排版或加字时，不擅自增加标题、文案、标签、页码或装饰元素。',
    '- 保留未要求修改的主体身份、造型、关键细节和画面信息，避免不同图片之间串图。',
    '',
    '### 结果组织',
    '',
    '- 每张图片独立处理，完成后按原图顺序排列并自动编组；模型、比例和清晰度直接使用输入框里的“图片设置”。',
  ].join('\n'),
  instruction: normalizeVisibleChatText(instruction) || '按用户当前要求分别处理每张图片。',
});

const normalizeUsage = (value?: Record<string, unknown>) => {
  if (!value) return undefined;
  const details = value.input_tokens_details && typeof value.input_tokens_details === 'object'
    ? value.input_tokens_details as Record<string, unknown>
    : {};
  return {
    inputTokens: Number(value.input_tokens ?? value.prompt_tokens ?? 0) || undefined,
    outputTokens: Number(value.output_tokens ?? value.completion_tokens ?? 0) || undefined,
    cachedTokens: Number(value.cached_tokens ?? details.cached_tokens ?? 0) || undefined,
    raw: value,
  };
};

const trimConversationTitle = (text: string) => {
  const first = text.trim().split(/\r?\n/)[0] || '新对话';
  return first.length > 28 ? `${first.slice(0, 28)}…` : first;
};

const parseArguments = (value: string) => {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch (_) {
    throw new Error('工具参数不是有效 JSON');
  }
};

const latestGeneratedMedia = (messages: ChatMessage[]) => {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const calls = messages[messageIndex].toolCalls || [];
    for (let callIndex = calls.length - 1; callIndex >= 0; callIndex -= 1) {
      const media = getGeneratedMediaFromToolCall(calls[callIndex]);
      if (media.length > 0) return media[media.length - 1];
    }
  }
  return undefined;
};

const providerToolCallQueries = (
  providerMessages: Array<Record<string, unknown>>,
  toolName: string,
) => providerMessages.flatMap(message => {
  if (!Array.isArray(message.tool_calls)) return [];
  return message.tool_calls.flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const call = value as Record<string, unknown>;
    const fn = call.function && typeof call.function === 'object'
      ? call.function as Record<string, unknown>
      : {};
    if (String(fn.name || '') !== toolName) return [];
    try {
      const args = JSON.parse(String(fn.arguments || '{}')) as Record<string, unknown>;
      const query = String(args.query || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
      return query ? [query] : [];
    } catch (_) {
      return [];
    }
  });
});

const providerToolCallCount = (
  providerMessages: Array<Record<string, unknown>>,
  toolName: string,
) => providerMessages.reduce((count, message) => {
  if (!Array.isArray(message.tool_calls)) return count;
  return count + message.tool_calls.filter(value => {
    if (!value || typeof value !== 'object') return false;
    const call = value as Record<string, unknown>;
    const fn = call.function && typeof call.function === 'object'
      ? call.function as Record<string, unknown>
      : {};
    return String(fn.name || '') === toolName;
  }).length;
}, 0);

const currentLocalDateContext = () => {
  const now = new Date();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
  const date = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
  }).format(now);
  return `${date}（${timeZone}）`;
};

const flattenWebSearchContext = (
  providerMessages: Array<Record<string, unknown>>,
  materialLimit = 9_000,
) => {
  const webCallIds = new Set<string>();
  providerMessages.forEach(message => {
    if (!Array.isArray(message.tool_calls)) return;
    message.tool_calls.forEach(value => {
      if (!value || typeof value !== 'object') return;
      const call = value as Record<string, unknown>;
      const fn = call.function && typeof call.function === 'object'
        ? call.function as Record<string, unknown>
        : {};
      if (String(fn.name || '') === 'web_search') webCallIds.add(String(call.id || ''));
    });
  });
  if (webCallIds.size === 0) return providerMessages;

  const searchMaterials: string[] = [];
  const normalized = providerMessages.flatMap(message => {
    if (message.role === 'tool' && webCallIds.has(String(message.tool_call_id || ''))) {
      const content = String(message.content || '').trim();
      if (content) searchMaterials.push(content);
      return [];
    }
    if (!Array.isArray(message.tool_calls)) return [message];
    const remainingCalls = message.tool_calls.filter(value => {
      if (!value || typeof value !== 'object') return true;
      return !webCallIds.has(String((value as Record<string, unknown>).id || ''));
    });
    const content = typeof message.content === 'string' ? message.content.trim() : message.content;
    if (remainingCalls.length > 0) return [{ ...message, tool_calls: remainingCalls }];
    return content ? [{ role: message.role, content }] : [];
  });
  if (searchMaterials.length === 0) return normalized;

  const materialMessage = {
    role: 'system',
    content: [
      '以下是本轮已经取得的联网检索资料。请把它当作外部资料继续完成回答；不要把工具参数或原始 JSON 展示给用户。',
      searchMaterials.join('\n\n').slice(0, materialLimit),
    ].join('\n\n'),
  };
  const systemPrefixEnd = normalized.findIndex(message => message.role !== 'system');
  const insertAt = systemPrefixEnd < 0 ? normalized.length : systemPrefixEnd;
  return [...normalized.slice(0, insertAt), materialMessage, ...normalized.slice(insertAt)];
};

export function useChatRuntime(options: UseChatRuntimeOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [summary, setSummary] = useState<ChatSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [stoppable, setStoppable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [nextBeforeCreatedAt, setNextBeforeCreatedAt] = useState<number | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [usage, setUsage] = useState<ReturnType<typeof normalizeUsage>>();
  const [webSearchEnabled, setWebSearchEnabled] = useState(() => (
    localStorage.getItem(CHAT_WEB_SEARCH_ENABLED_STORAGE_KEY) === 'true'
  ));

  const conversationsRef = useRef(conversations);
  const messagesRef = useRef(messages);
  const messageCacheRef = useRef(new Map<string, ChatMessage>());
  const summaryRef = useRef(summary);
  const activeConversationIdRef = useRef(activeConversationId);
  const busyConversationIdsRef = useRef(new Set<string>());
  const activeRequestsRef = useRef(new Map<string, ActiveChatRequest>());
  const activeBatchRunsRef = useRef(new Map<string, ActiveBatchRun>());
  const pendingApprovalsRef = useRef(new Map<string, PendingApprovalRun>());
  const persistTimersRef = useRef(new Map<string, number>());
  const streamBuffersRef = useRef(new Map<string, string>());
  const streamFlushTimersRef = useRef(new Map<string, number>());
  const conversationPersistQueueRef = useRef<KeyedSerialTaskQueue | null>(null);
  const modelUpdateVersionsRef = useRef(new Map<string, number>());
  const conversationLoadVersionRef = useRef(0);
  if (!conversationPersistQueueRef.current) {
    conversationPersistQueueRef.current = createKeyedSerialTaskQueue();
  }

  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => {
    messagesRef.current = messages;
    messages.forEach(message => messageCacheRef.current.set(message.id, message));
  }, [messages]);
  useEffect(() => { summaryRef.current = summary; }, [summary]);
  useEffect(() => {
    localStorage.setItem(CHAT_WEB_SEARCH_ENABLED_STORAGE_KEY, String(webSearchEnabled));
  }, [webSearchEnabled]);

  const syncActiveConversationActivity = useCallback((conversationId = activeConversationIdRef.current) => {
    const pendingApproval = pendingApprovalsRef.current.get(conversationId);
    const waitsForBatchPlanReply = pendingApproval?.calls.some(call => (
      call.toolName === 'batch_image_operation' && call.status === 'awaiting-approval'
    )) === true;
    const locked = Boolean(conversationId) && (
      busyConversationIdsRef.current.has(conversationId)
      || (Boolean(pendingApproval) && !waitsForBatchPlanReply)
    );
    setBusy(locked);
    setStoppable(Boolean(
      activeRequestsRef.current.has(conversationId)
      || activeBatchRunsRef.current.has(conversationId)
    ));
  }, []);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
    syncActiveConversationActivity(activeConversationId);
  }, [activeConversationId, syncActiveConversationActivity]);

  const updateConversationBusy = useCallback((conversationId: string, value: boolean) => {
    if (!conversationId) return;
    if (value) busyConversationIdsRef.current.add(conversationId);
    else busyConversationIdsRef.current.delete(conversationId);
    if (activeConversationIdRef.current === conversationId) {
      syncActiveConversationActivity(conversationId);
    }
  }, [syncActiveConversationActivity]);

  const getConversationMessages = useCallback((conversationId: string) => (
    [...messageCacheRef.current.values()]
      .filter(message => message.conversationId === conversationId)
      .sort((left, right) => left.createdAt - right.createdAt)
  ), []);

  const cacheMessages = useCallback((values: ChatMessage[]) => {
    values.forEach(message => messageCacheRef.current.set(message.id, message));
  }, []);

  const enqueueConversationPersist = useCallback((conversation: ChatConversation) => (
    conversationPersistQueueRef.current!(
      conversation.id,
      () => upsertChatConversation(conversation),
    )
  ), []);

  const applyConversationModel = useCallback(async (
    conversation: ChatConversation,
    model: string,
  ) => {
    const normalizedModel = normalizeChatModelSelection(model);
    if (!normalizedModel) return false;
    if (conversation.model === normalizedModel) return true;

    const version = (modelUpdateVersionsRef.current.get(conversation.id) || 0) + 1;
    modelUpdateVersionsRef.current.set(conversation.id, version);
    const next = { ...conversation, model: normalizedModel, updatedAt: Date.now() };
    conversationsRef.current = conversationsRef.current.map(item => (
      item.id === next.id ? next : item
    ));
    setConversations(conversationsRef.current);

    try {
      await enqueueConversationPersist(next);
      return true;
    } catch (error) {
      const currentVersion = modelUpdateVersionsRef.current.get(conversation.id);
      const current = conversationsRef.current.find(item => item.id === conversation.id);
      if (currentVersion === version && current?.model === normalizedModel) {
        const rollback = { ...current, model: conversation.model, updatedAt: Date.now() };
        conversationsRef.current = conversationsRef.current.map(item => (
          item.id === rollback.id ? rollback : item
        ));
        setConversations(conversationsRef.current);
        optionsRef.current.onNotice?.(`保存 Chat 模型选择失败：${String(error)}`);
      }
      return false;
    }
  }, [enqueueConversationPersist]);

  const setConversationModel = useCallback((model: string) => {
    const conversation = conversationsRef.current.find(
      item => item.id === activeConversationIdRef.current,
    );
    if (!conversation
      || busyConversationIdsRef.current.has(conversation.id)
      || pendingApprovalsRef.current.has(conversation.id)) {
      return Promise.resolve(false);
    }
    return applyConversationModel(conversation, model);
  }, [applyConversationModel]);

  const persistMessageSoon = useCallback((message: ChatMessage, immediate = false) => {
    const existing = persistTimersRef.current.get(message.id);
    if (existing !== undefined) window.clearTimeout(existing);
    const persist = () => {
      persistTimersRef.current.delete(message.id);
      void upsertChatMessage(message).catch(error => console.warn('保存 Chat 消息失败:', error));
    };
    if (immediate) persist();
    else persistTimersRef.current.set(message.id, window.setTimeout(persist, 180));
  }, []);

  const patchMessage = useCallback((messageId: string, updater: (message: ChatMessage) => ChatMessage, immediate = false) => {
    const currentMessage = messageCacheRef.current.get(messageId)
      || messagesRef.current.find(message => message.id === messageId);
    if (!currentMessage) return;
    const patched = updater(currentMessage);
    messageCacheRef.current.set(messageId, patched);
    persistMessageSoon(patched, immediate);
    if (patched.conversationId !== activeConversationIdRef.current) return;
    setMessages(current => {
      if (!current.some(message => message.id === messageId)) return current;
      const next = current.map(message => message.id === messageId ? patched : message);
      messagesRef.current = next;
      return next;
    });
  }, [persistMessageSoon]);

  const flushStreamDelta = useCallback((messageId: string) => {
    const timer = streamFlushTimersRef.current.get(messageId);
    if (timer !== undefined) window.clearTimeout(timer);
    streamFlushTimersRef.current.delete(messageId);
    const delta = streamBuffersRef.current.get(messageId) || '';
    streamBuffersRef.current.delete(messageId);
    if (!delta) return;
    patchMessage(messageId, message => ({
      ...message,
      content: `${message.content}${delta}`,
      status: 'streaming',
    }));
  }, [patchMessage]);

  const queueStreamDelta = useCallback((messageId: string, delta: string) => {
    streamBuffersRef.current.set(messageId, `${streamBuffersRef.current.get(messageId) || ''}${delta}`);
    if (streamFlushTimersRef.current.has(messageId)) return;
    const timer = window.setTimeout(() => flushStreamDelta(messageId), STREAM_RENDER_INTERVAL_MS);
    streamFlushTimersRef.current.set(messageId, timer);
  }, [flushStreamDelta]);

  const refreshConversations = useCallback(async (query = searchQuery) => {
    const next = await listChatConversations(query, 120, 0);
    conversationsRef.current = next;
    setConversations(next);
    return next;
  }, [searchQuery]);

  const loadConversation = useCallback(async (conversationId: string) => {
    if (!conversationId) return;
    const loadVersion = conversationLoadVersionRef.current + 1;
    conversationLoadVersionRef.current = loadVersion;
    setLoading(true);
    try {
      const [page, nextSummary] = await Promise.all([
        listChatMessages(conversationId, { limit: PAGE_SIZE }),
        getChatSummary(conversationId),
      ]);
      if (conversationLoadVersionRef.current !== loadVersion) return;
      const resolvedMessages = page.messages.map(message => (
        messageCacheRef.current.get(message.id) || message
      ));
      cacheMessages(resolvedMessages);
      activeConversationIdRef.current = conversationId;
      setActiveConversationId(conversationId);
      writeActiveChatConversationId(conversationId);
      messagesRef.current = resolvedMessages;
      setMessages(resolvedMessages);
      setHasMoreMessages(page.hasMore);
      setNextBeforeCreatedAt(page.nextBeforeCreatedAt || undefined);
      summaryRef.current = nextSummary;
      setSummary(nextSummary);
      syncActiveConversationActivity(conversationId);
    } finally {
      if (conversationLoadVersionRef.current === loadVersion) setLoading(false);
    }
  }, [cacheMessages, syncActiveConversationActivity]);

  const createConversation = useCallback(async (
    model = optionsRef.current.model,
    title = '新对话',
  ) => {
    conversationLoadVersionRef.current += 1;
    setLoading(false);
    const now = Date.now();
    const conversation: ChatConversation = {
      id: createChatId('chat-conversation'),
      title: title.trim().slice(0, 80) || '新对话',
      model: model || 'default',
      createdAt: now,
      updatedAt: now,
      archived: false,
    };
    await upsertChatConversation(conversation);
    setConversations(current => {
      const next = [conversation, ...current];
      conversationsRef.current = next;
      return next;
    });
    activeConversationIdRef.current = conversation.id;
    setActiveConversationId(conversation.id);
    writeActiveChatConversationId(conversation.id);
    messagesRef.current = [];
    setMessages([]);
    summaryRef.current = null;
    setSummary(null);
    setHasMoreMessages(false);
    setNextBeforeCreatedAt(undefined);
    syncActiveConversationActivity(conversation.id);
    return conversation;
  }, [syncActiveConversationActivity]);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        await migrateLegacyAgentConversations(optionsRef.current.model);
        let next = await listChatConversations('', 120, 0);
        const configuredModel = optionsRef.current.model.trim();
        if (configuredModel) {
          next = await Promise.all(next.map(conversation => (
            LEGACY_PROVIDER_MODELS.has(conversation.model.trim().toLowerCase())
              ? upsertChatConversation({ ...conversation, model: configuredModel })
              : conversation
          )));
        }
        if (disposed) return;
        if (next.length === 0) {
          const created = await createConversation();
          next = [created];
        }
        conversationsRef.current = next;
        setConversations(next);
        const storedId = readActiveChatConversationId();
        const activeId = next.some(item => item.id === storedId) ? storedId : next[0].id;
        await loadConversation(activeId);
      } catch (error) {
        optionsRef.current.onNotice?.(`读取本地聊天失败：${String(error)}`);
        setLoading(false);
      }
    })();
    return () => { disposed = true; };
  }, [createConversation, loadConversation]);

  useEffect(() => {
    const unlisten = listen<Record<string, unknown>>('agent-openai-stream', event => {
      const requestId = String(event.payload?.requestId || '');
      const active = [...activeRequestsRef.current.values()]
        .find(request => request.requestId === requestId);
      if (!active || event.payload?.kind !== 'delta') return;
      const delta = String(event.payload?.delta || '');
      if (!delta) return;
      active.streamed = true;
      queueStreamDelta(active.messageId, delta);
    });
    return () => { void unlisten.then(dispose => dispose()); };
  }, [queueStreamDelta]);

  useEffect(() => () => {
    persistTimersRef.current.forEach(timer => window.clearTimeout(timer));
    streamFlushTimersRef.current.forEach(timer => window.clearTimeout(timer));
    streamFlushTimersRef.current.clear();
    streamBuffersRef.current.clear();
  }, []);

  const loadOlderMessages = useCallback(async () => {
    const conversationId = activeConversationIdRef.current;
    if (!conversationId || !hasMoreMessages || !nextBeforeCreatedAt || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await listChatMessages(conversationId, {
        beforeCreatedAt: nextBeforeCreatedAt,
        limit: PAGE_SIZE,
      });
      cacheMessages(page.messages);
      if (activeConversationIdRef.current !== conversationId) return;
      setMessages(current => {
        const known = new Set(current.map(message => message.id));
        const next = [...page.messages.filter(message => !known.has(message.id)), ...current];
        messagesRef.current = next;
        return next;
      });
      setHasMoreMessages(page.hasMore);
      setNextBeforeCreatedAt(page.nextBeforeCreatedAt || undefined);
    } finally {
      setLoadingOlder(false);
    }
  }, [cacheMessages, hasMoreMessages, loadingOlder, nextBeforeCreatedAt]);

  const maybeSummarize = useCallback(async (conversationId: string) => {
    const current = getConversationMessages(conversationId)
      .filter(message => message.status === 'completed');
    if (current.length <= SUMMARY_KEEP_RECENT) return;
    const older = current.slice(0, -SUMMARY_KEEP_RECENT);
    const through = older[older.length - 1];
    const currentSummary = summaryRef.current?.conversationId === conversationId
      ? summaryRef.current
      : await getChatSummary(conversationId);
    if (!through || currentSummary?.throughMessageId === through.id) return;
    const previousBoundary = currentSummary?.throughMessageId
      ? older.findIndex(message => message.id === currentSummary.throughMessageId)
      : -1;
    const unsummarized = previousBoundary >= 0 ? older.slice(previousBoundary + 1) : older;
    if (unsummarized.length === 0) return;
    const tokens = unsummarized.reduce((total, message) => total + estimateChatTokens(message.content), 0);
    if (tokens < SUMMARY_TRIGGER_TOKENS && unsummarized.length < SUMMARY_TRIGGER_MESSAGES) return;
    try {
      const requestId = createChatId('chat-summary');
      const result = await requestChatCompletion({
        requestId,
        messages: buildSummaryRequestMessages(currentSummary, unsummarized),
        tools: [],
        model: conversationsRef.current.find(item => item.id === conversationId)?.model || optionsRef.current.model,
        stream: false,
      });
      if (!result.content.trim()) return;
      const next: ChatSummary = {
        conversationId,
        summary: result.content.trim(),
        throughMessageId: through.id,
        updatedAt: Date.now(),
      };
      await upsertChatSummary(next);
      if (activeConversationIdRef.current === conversationId) {
        summaryRef.current = next;
        setSummary(next);
      }
    } catch (error) {
      console.warn('Chat 摘要生成失败，保留完整最近消息:', error);
    }
  }, [getConversationMessages]);

  const runModelLoopRef = useRef<(
    conversationId: string,
    assistantMessageId: string,
    userText: string,
    requestModel: string,
    providerMessages: Array<Record<string, unknown>>,
    depth: number,
  ) => Promise<void>>(async () => {});

  const continueToolCalls = useCallback(async (run: PendingApprovalRun, approvedCallId?: string) => {
    let index = run.index;
    const toolMessages = [...run.toolMessages];
    for (; index < run.calls.length; index += 1) {
      const call = run.calls[index];
      const batchController = call.toolName === 'batch_image_operation' ? new AbortController() : null;
      const notifiedMediaIds = new Set<string>();
      let batchAttachments: ChatAttachment[] = [];
      let batchOutputCount = 1;
      let batchStarted = false;
      let progressQueue = Promise.resolve();
      const notifyGeneratedMedia = async () => {
        if (call.toolName === 'batch_image_operation' && batchAttachments.length > 0) {
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(call.resultJson || '{}') as Record<string, unknown>;
          } catch (_) {
            return;
          }
          const attachmentIndexById = new Map(batchAttachments.map((attachment, sourceIndex) => (
            [attachment.id, sourceIndex] as const
          )));
          const results = Array.isArray(parsed.results) ? parsed.results : [];
          for (const value of results) {
            if (!value || typeof value !== 'object') continue;
            const result = value as Record<string, unknown>;
            const attachmentId = String(result.attachmentId || '').trim();
            const sourceIndex = attachmentIndexById.get(attachmentId);
            if (sourceIndex === undefined || !Array.isArray(result.media)) continue;
            const generatedMedia = getGeneratedMediaFromToolCall({
              ...call,
              resultJson: serializeChatToolResult({ media: result.media }),
            }).filter(media => media.type === 'image');
            for (let outputIndex = 0; outputIndex < generatedMedia.length; outputIndex += 1) {
              const media = generatedMedia[outputIndex];
              const notificationId = `${attachmentId}:${media.id}`;
              if (notifiedMediaIds.has(notificationId)) continue;
              notifiedMediaIds.add(notificationId);
              try {
                if (optionsRef.current.onBatchMediaReady) {
                  await optionsRef.current.onBatchMediaReady({
                    batchId: call.id,
                    media,
                    attachmentId,
                    sourceIndex,
                    outputIndex,
                    slotIndex: sourceIndex * batchOutputCount + outputIndex,
                    total: batchAttachments.length * batchOutputCount,
                  });
                } else {
                  await optionsRef.current.onGeneratedMediaReady?.(media);
                }
              } catch (error) {
                console.warn('Chat 批量生成结果加入画布失败:', error);
              }
            }
          }
          return;
        }
        const generatedMedia = getGeneratedMediaFromToolCall(call).filter(media => media.type === 'image');
        for (const media of generatedMedia) {
          if (notifiedMediaIds.has(media.id)) continue;
          notifiedMediaIds.add(media.id);
          try {
            await optionsRef.current.onGeneratedMediaReady?.(media);
          } catch (error) {
            console.warn('Chat 生成结果自动加入画布失败:', error);
          }
        }
      };
      const notifyBatchCompleted = async (cancelled: boolean) => {
        if (call.toolName !== 'batch_image_operation' || !batchStarted) return;
        let results: Array<Record<string, unknown>> = [];
        try {
          const parsed = JSON.parse(call.resultJson || '{}') as Record<string, unknown>;
          results = (Array.isArray(parsed.results) ? parsed.results : [])
            .filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object'));
        } catch (_) {
          results = [];
        }
        const attachmentIndexById = new Map(batchAttachments.map((attachment, sourceIndex) => (
          [attachment.id, sourceIndex] as const
        )));
        const failedSourceIndexes = results.flatMap(result => {
          if (result.status !== 'error' && result.status !== 'cancelled') return [];
          const sourceIndex = attachmentIndexById.get(String(result.attachmentId || '').trim());
          return sourceIndex === undefined ? [] : [sourceIndex];
        });
        const completedSlots = results.reduce((total, result) => (
          total + (Array.isArray(result.media) ? result.media.length : 0)
        ), 0);
        try {
          await optionsRef.current.onBatchCompleted?.({
            batchId: call.id,
            total: batchAttachments.length * batchOutputCount,
            completedSlots,
            failedSourceIndexes,
            cancelled,
          });
        } catch (error) {
          console.warn('Chat 批量画布编组收尾失败:', error);
        }
      };
      let args: Record<string, unknown>;
      try {
        args = parseArguments(call.argumentsJson);
        const conversationMessages = getConversationMessages(run.conversationId);
        const generated = latestGeneratedMedia(conversationMessages);
        const currentImageAttachments = selectChatImageAttachments(
          conversationMessages,
          run.userText,
        ).attachments;
        args = resolveChatReferenceArguments({
          toolName: call.toolName,
          args,
          currentImageAttachments,
          latestGenerated: generated,
        });
        if (call.toolName === 'add_to_canvas' && generated) {
          if (!args.mediaId) args.mediaId = generated.id;
          if (!args.assetId && generated.assetId) args.assetId = generated.assetId;
        }
        if (call.toolName === 'generate_image' || call.toolName === 'edit_image' || call.toolName === 'batch_image_operation') {
          args = applyChatImageGenerationSettings(args, optionsRef.current);
        }
        call.argumentsJson = JSON.stringify(args);
        if (call.toolName === 'batch_image_operation') {
          batchAttachments = selectBatchImageAttachments(
            currentImageAttachments,
            Array.isArray(args.attachmentIds) ? args.attachmentIds.map(String) : undefined,
          );
          batchOutputCount = Math.min(4, Math.max(1, Math.round(Number(args.outputCountPerImage) || 1)));
          batchStarted = true;
          try {
            await optionsRef.current.onBatchStarted?.({
              batchId: call.id,
              name: createBatchGroupName(String(args.instruction || run.userText)),
              instruction: String(args.instruction || run.userText).trim(),
              attachmentIds: batchAttachments.map(attachment => attachment.id),
              total: batchAttachments.length * batchOutputCount,
              outputCountPerImage: batchOutputCount,
              aspectRatio: String(args.aspectRatio || '').trim() || undefined,
            });
          } catch (error) {
            console.warn('Chat 批量画布占位编组创建失败:', error);
          }
        }
        const approved = approvedCallId === call.id;
        const routed = await routeChatToolCall({
          name: call.toolName,
          args,
          context: {
            userText: run.userText,
            conversationId: run.conversationId,
            messageId: run.assistantMessageId,
            recentMessages: conversationMessages,
            currentUserAttachments: currentImageAttachments,
            signal: batchController?.signal,
            onProgress: value => {
              progressQueue = progressQueue.then(async () => {
                call.resultJson = serializeChatToolResult(compactChatToolResult(call.toolName, value));
                await upsertChatToolCall(call);
                patchMessage(run.assistantMessageId, message => ({ ...message, toolCalls: [...run.calls] }));
                await notifyGeneratedMedia();
              });
              return progressQueue;
            },
          },
          executor: optionsRef.current.executeTool,
          approvalMode: optionsRef.current.approvalMode,
          approved,
          onExecuting: async () => {
            call.status = 'running';
            if (batchController) {
              activeBatchRunsRef.current.set(run.conversationId, {
                callId: call.id,
                messageId: run.assistantMessageId,
                controller: batchController,
              });
              if (activeConversationIdRef.current === run.conversationId) {
                syncActiveConversationActivity(run.conversationId);
              }
            }
            await upsertChatToolCall(call);
            patchMessage(run.assistantMessageId, message => ({ ...message, toolCalls: [...run.calls] }));
          },
        });
        if (routed.requiresApproval) {
          call.status = 'awaiting-approval';
          await upsertChatToolCall(call);
          patchMessage(run.assistantMessageId, message => ({ ...message, toolCalls: [...run.calls] }), true);
          pendingApprovalsRef.current.set(run.conversationId, {
            ...run,
            calls: [...run.calls],
            index,
            toolMessages,
          });
          updateConversationBusy(run.conversationId, false);
          return;
        }
        await progressQueue;
        const resultJson = serializeChatToolResult(routed.result);
        call.resultJson = resultJson;
        const resultRecord = routed.result && typeof routed.result === 'object'
          ? routed.result as Record<string, unknown>
          : {};
        call.status = resultRecord.cancelled === true ? 'cancelled' : 'completed';
        call.completedAt = Date.now();
        await upsertChatToolCall(call);
        toolMessages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: serializeChatToolResult(compactChatToolResultForProvider(call.toolName, routed.result)),
        });
        if (call.toolName === 'generate_image' || call.toolName === 'edit_image' || call.toolName === 'batch_image_operation') {
          await notifyGeneratedMedia();
        }
        await notifyBatchCompleted(call.status === 'cancelled');
      } catch (error) {
        call.status = batchController?.signal.aborted ? 'cancelled' : 'error';
        call.resultJson = serializeChatToolResult(batchController?.signal.aborted
          ? { cancelled: true, error: '批量图片任务已停止' }
          : { error: String(error) });
        call.completedAt = Date.now();
        await upsertChatToolCall(call).catch(() => {});
        toolMessages.push({ role: 'tool', tool_call_id: call.id, content: call.resultJson });
        await notifyBatchCompleted(call.status === 'cancelled');
      }
      if (activeBatchRunsRef.current.get(run.conversationId)?.callId === call.id) {
        activeBatchRunsRef.current.delete(run.conversationId);
        if (activeConversationIdRef.current === run.conversationId) {
          syncActiveConversationActivity(run.conversationId);
        }
      }
      patchMessage(run.assistantMessageId, message => ({ ...message, toolCalls: [...run.calls] }), true);
    }
    pendingApprovalsRef.current.delete(run.conversationId);
    if (run.calls.some(call => call.status === 'cancelled')) {
      patchMessage(run.assistantMessageId, message => ({
        ...message,
        content: message.content.trim() || '已停止批量处理，已完成的图片结果已保留。',
        status: 'cancelled',
      }), true);
      updateConversationBusy(run.conversationId, false);
      return;
    }
    const completedBatchCall = run.calls.find(call => call.toolName === 'batch_image_operation');
    if (completedBatchCall) {
      const summary = summarizeCompletedBatchCall(completedBatchCall);
      patchMessage(run.assistantMessageId, message => ({
        ...message,
        content: [normalizeVisibleChatText(message.content), summary.content]
          .filter(Boolean)
          .join('\n\n'),
        status: summary.status,
      }), true);
      updateConversationBusy(run.conversationId, false);
      void maybeSummarize(run.conversationId);
      return;
    }
    await runModelLoopRef.current(
      run.conversationId,
      run.assistantMessageId,
      run.userText,
      run.requestModel,
      [...run.providerMessages, ...toolMessages],
      run.depth + 1,
    );
  }, [
    getConversationMessages,
    maybeSummarize,
    patchMessage,
    syncActiveConversationActivity,
    updateConversationBusy,
  ]);

  const runModelLoop = useCallback(async (
    conversationId: string,
    assistantMessageId: string,
    userText: string,
    requestModel: string,
    providerMessages: Array<Record<string, unknown>>,
    depth: number,
  ) => {
    if (depth >= MAX_TOOL_ROUNDS) throw new Error('连续工具调用过多，已停止');
    const requestId = createChatId('chat-request');
    const conversationMessages = getConversationMessages(conversationId);
    const imageSelection = selectChatImageAttachments(conversationMessages, userText);
    const hasRecentMedia = Boolean(latestGeneratedMedia(conversationMessages));
    const currentImageAttachmentCount = imageSelection.attachments.length;
    const toolIntentText = imageSelection.toolIntentText;
    const batchImageOperationRequested = shouldExposeBatchImageOperation(
      toolIntentText,
      currentImageAttachmentCount,
    );
    // Tool calls in older conversation history must not block a new user turn.
    const previousWebSearchQueries = new Set(
      depth === 0 ? [] : providerToolCallQueries(providerMessages, 'web_search'),
    );
    const previousFileCreateCount = depth === 0
      ? 0
      : providerToolCallCount(providerMessages, 'create_file');
    const previousBatchImageOperationCount = depth === 0
      ? 0
      : providerToolCallCount(providerMessages, 'batch_image_operation');
    const webSearchCount = previousWebSearchQueries.size;
    const webSearchRequested = webSearchEnabled || shouldExposeWebSearch(userText);
    const webSearchAvailable = webSearchRequested && webSearchCount < 2;
    const batchImageOperationAvailable = batchImageOperationRequested
      && previousBatchImageOperationCount === 0;
    const tools = previousFileCreateCount > 0
      ? []
      : getChatToolDefinitions(
        toolIntentText,
        hasRecentMedia,
        webSearchAvailable,
        webSearchCount >= 2,
        currentImageAttachmentCount,
      ).filter(tool => (
        previousBatchImageOperationCount === 0
        || tool.function.name !== 'batch_image_operation'
      ));
    const requestInstructions: Array<Record<string, unknown>> = [];
    if (batchImageOperationAvailable) {
      requestInstructions.push({
        role: 'system',
        content: [
          `当前对话可使用 batch_image_operation 处理这 ${currentImageAttachmentCount} 张图片。`,
          '你首先仍是正常的 Chat 助手：结合上下文和图片理解用户真正想做什么，自主判断此刻是继续讨论，还是已经适合提出可执行方案。不要因为检测到多张图片就机械调用工具。',
          '只有当用户确实希望对多张图片分别执行同一项图像任务时，才调用一次 batch_image_operation；任务可能是排版、换背景、移除或增加元素、修复增强、风格转换、改色、扩图或其他编辑，不要预设为排版。',
          '如果用户要把多张图片合并为共同参考并只生成一组新结果，应选择普通 generate_image 或 edit_image；只有每张图需要相互隔离、各自输出时才选择 batch_image_operation。由你根据对话语义判断，不依赖固定口令。',
          `该调用只会把方案展示给用户并进入对话式确认，此时不会立即执行。调用时必须逐张查看图片并填写全部方案字段，同时给出恰好 ${currentImageAttachmentCount} 条 perImageInstructions；所有内容都要根据用户实际目标动态制定。`,
          '如果是排版任务，说明版式、图文内容和视觉系统；如果是换背景或改色，说明目标背景/颜色、光影适配和边缘处理；如果是修图、移除元素或增强，说明具体区域、保留内容和质量标准；其他任务按其真实需求给出对应步骤。不要写与任务无关的排版术语。',
          '不要分析、推荐或规划生图模型、宽高比、分辨率、清晰度等图片设置，这些默认由输入框中的“图片设置”提供。只有用户在对话里明确指定了不同设置时，才把对应值写入 model、aspectRatio 或 resolution 参数以覆盖当前设置；不要把这些参数写进展示方案正文。',
          '禁止只复述用户原话，禁止输出“处理对象、执行内容、输出方式”式泛化摘要，禁止把多张原图合并为一张。',
        ].join('\n'),
      });
    } else if (batchImageOperationRequested) {
      requestInstructions.push({
        role: 'system',
        content: '本轮批量图片工具已经执行过。禁止再次调用图片处理工具；请以“**生成结果**”开头，根据已有工具结果简洁汇总完成数量和失败情况。',
      });
    }
    if (webSearchRequested) {
      const remainingSearches = Math.max(0, 2 - webSearchCount);
      requestInstructions.push({
        role: 'system',
        content: [
          `当前本地日期是 ${currentLocalDateContext()}。解析“今天、昨天、最近”等相对日期时必须以此为准，并把具体日期写入搜索词。`,
          webSearchCount === 0
            ? '本轮用户已开启联网搜索。先调用一次 web_search；只有首轮结果明显缺失、歧义或关键词错误时，才可换一个不同关键词再搜索一次。'
            : remainingSearches > 0
              ? '本轮已有一次联网搜索结果。结果足够时直接回答；仅在结果明显不足时可再用一个不同关键词纠错，禁止重复原关键词。'
              : '本轮已用完两次联网搜索。禁止再次调用 web_search，必须基于已有结果回答并说明仍存在的不确定性。',
          '回答必须综合搜索结果中的摘要、正文摘录、发布时间，并用 Markdown 链接标注来源。不要只给用户一组链接。',
        ].join('\n'),
      });
    }
    if (previousFileCreateCount > 0) {
      requestInstructions.push({
        role: 'system',
        content: '请求的文件已经成功生成。不要再调用任何工具；用一句简洁的话告诉用户文件已生成，并提示可通过文件卡片打开或另存为。',
      });
    }
    const normalizedProviderMessages = webSearchCount > 0
      ? flattenWebSearchContext(providerMessages)
      : providerMessages;
    const requestMessages = requestInstructions.length > 0
      ? [...requestInstructions, ...normalizedProviderMessages]
      : normalizedProviderMessages;
    activeRequestsRef.current.set(conversationId, {
      requestId,
      conversationId,
      messageId: assistantMessageId,
      streamed: false,
    });
    if (activeConversationIdRef.current === conversationId) {
      syncActiveConversationActivity(conversationId);
    }
    let result: ChatProviderResult;
    try {
      result = await requestChatCompletion({
        requestId,
        messages: requestMessages,
        tools,
        model: requestModel,
        stream: true,
      });
    } catch (error) {
      const active = activeRequestsRef.current.get(conversationId);
      if (!active || active.requestId !== requestId || webSearchCount === 0 || active.streamed) throw error;
      const fallbackRequestId = createChatId('chat-search-synthesis');
      activeRequestsRef.current.set(conversationId, {
        requestId: fallbackRequestId,
        conversationId,
        messageId: assistantMessageId,
        streamed: false,
      });
      const fallbackMessages = [
        ...requestInstructions,
        ...flattenWebSearchContext(providerMessages, 4_000),
        {
          role: 'system',
          content: '不要再调用任何工具。请立即根据已有联网资料给出完整回答；资料不足的部分明确说明，不要中断在搜索过程。',
        },
      ];
      result = await requestChatCompletion({
        requestId: fallbackRequestId,
        messages: fallbackMessages,
        tools: [],
        model: requestModel,
        stream: true,
      });
    }
    const active = activeRequestsRef.current.get(conversationId);
    if (!active) throw new Error('Chat 请求已取消');
    activeRequestsRef.current.delete(conversationId);
    if (activeConversationIdRef.current === conversationId) {
      syncActiveConversationActivity(conversationId);
    }
    flushStreamDelta(assistantMessageId);
    if (activeConversationIdRef.current === conversationId) {
      setUsage(normalizeUsage(result.usage));
    }
    if (!active.streamed && result.content) {
      patchMessage(assistantMessageId, message => ({ ...message, content: `${message.content}${result.content}` }));
    }
    const acceptedWebSearchQueries = new Set(previousWebSearchQueries);
    let acceptedWebSearchInResponse = false;
    let acceptedFileCreateInResponse = false;
    let acceptedBatchImageOperationInResponse = previousBatchImageOperationCount > 0;
    const toolCalls = (result.toolCalls || []).filter(call => {
      if (call.name === 'create_file') {
        if (previousFileCreateCount > 0 || acceptedFileCreateInResponse) return false;
        acceptedFileCreateInResponse = true;
        return true;
      }
      if (call.name === 'batch_image_operation') {
        if (acceptedBatchImageOperationInResponse) return false;
        acceptedBatchImageOperationInResponse = true;
        return true;
      }
      if (call.name !== 'web_search') return true;
      let query = '';
      try {
        query = String((JSON.parse(call.arguments || '{}') as Record<string, unknown>).query || '')
          .trim()
          .replace(/\s+/g, ' ')
          .toLocaleLowerCase();
      } catch (_) {
        return false;
      }
      if (!query || acceptedWebSearchInResponse || acceptedWebSearchQueries.has(query) || acceptedWebSearchQueries.size >= 2) {
        return false;
      }
      acceptedWebSearchInResponse = true;
      acceptedWebSearchQueries.add(query);
      return true;
    });
    if (
      depth === 0
      && toolCalls.length === 0
      && !batchImageOperationRequested
      && shouldDirectGenerateImage(toolIntentText)
    ) {
      const fallbackCall: ChatToolCall = {
        id: createChatId('chat-tool'),
        messageId: assistantMessageId,
        toolName: 'generate_image',
        argumentsJson: JSON.stringify(applyChatImageGenerationSettings({ prompt: toolIntentText }, optionsRef.current)),
        status: 'pending',
        createdAt: Date.now(),
      };
      await upsertChatToolCall(fallbackCall);
      patchMessage(assistantMessageId, message => ({ ...message, content: '', toolCalls: [fallbackCall] }), true);
      const fallbackAssistantToolMessage = {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: fallbackCall.id,
          type: 'function',
          function: { name: fallbackCall.toolName, arguments: fallbackCall.argumentsJson },
        }],
      };
      await continueToolCalls({
        conversationId,
        assistantMessageId,
        userText,
        requestModel,
        providerMessages: [...providerMessages, fallbackAssistantToolMessage],
        calls: [fallbackCall],
        index: 0,
        toolMessages: [],
        depth,
      });
      return;
    }
    if (toolCalls.length === 0) {
      patchMessage(assistantMessageId, message => ({
        ...message,
        content: message.content.trim() || '已完成。',
        status: 'completed',
      }), true);
      updateConversationBusy(conversationId, false);
      void maybeSummarize(conversationId);
      return;
    }
    const calls: ChatToolCall[] = toolCalls.map(call => ({
      id: call.id || createChatId('chat-tool'),
      messageId: assistantMessageId,
      toolName: call.name,
      argumentsJson: call.arguments || '{}',
      status: 'pending',
      createdAt: Date.now(),
    }));
    const proposedBatchCall = calls.find(call => call.toolName === 'batch_image_operation');
    if (proposedBatchCall) {
      const batchPlan = extractChatBatchImagePlan(
        { ...result, toolCalls },
        createFallbackBatchImagePlan(currentImageAttachmentCount, toolIntentText),
      );
      let proposedArguments: Record<string, unknown> = {};
      try {
        proposedArguments = parseArguments(proposedBatchCall.argumentsJson);
      } catch (error) {
        console.warn('批量图片方案参数无效，使用可见兜底方案:', error);
      }
      proposedBatchCall.argumentsJson = JSON.stringify({
        ...proposedArguments,
        analysisSummary: batchPlan.analysisSummary,
        instruction: batchPlan.instruction,
        mode: 'one_per_image',
        outputCountPerImage: Number(proposedArguments.outputCountPerImage) || 1,
      });
      proposedBatchCall.status = 'awaiting-approval';
      await upsertChatToolCall(proposedBatchCall);
      const conversationalLead = normalizeVisibleChatText(result.content);
      const analysisMessageContent = [
        conversationalLead,
        batchPlan.analysisSummary,
        '这是我准备执行的方案。你可以直接告诉我哪里要改；如果没问题，也可以用你习惯的说法让我继续。',
      ].filter(Boolean).join('\n\n');
      patchMessage(assistantMessageId, message => ({
        ...message,
        content: analysisMessageContent,
        status: 'completed',
        toolCalls: [proposedBatchCall],
      }), true);
      const assistantToolMessage = {
        role: 'assistant',
        content: conversationalLead || batchPlan.analysisSummary,
        tool_calls: [{
          id: proposedBatchCall.id,
          type: 'function',
          function: {
            name: proposedBatchCall.toolName,
            arguments: proposedBatchCall.argumentsJson,
          },
        }],
      };
      pendingApprovalsRef.current.set(conversationId, {
        conversationId,
        assistantMessageId,
        userText,
        requestModel,
        providerMessages: [...providerMessages, assistantToolMessage],
        calls: [proposedBatchCall],
        index: 0,
        toolMessages: [],
        depth,
      });
      updateConversationBusy(conversationId, false);
      return;
    }
    await Promise.all(calls.map(call => upsertChatToolCall(call)));
    patchMessage(assistantMessageId, message => ({ ...message, toolCalls: calls }), true);
    const assistantToolMessage = {
      role: 'assistant',
      content: result.content || null,
      tool_calls: toolCalls.map(call => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: call.arguments },
      })),
    };
    await continueToolCalls({
      conversationId,
      assistantMessageId,
      userText,
      requestModel,
      providerMessages: [...providerMessages, assistantToolMessage],
      calls,
      index: 0,
      toolMessages: [],
      depth,
    });
  }, [
    continueToolCalls,
    flushStreamDelta,
    getConversationMessages,
    maybeSummarize,
    patchMessage,
    syncActiveConversationActivity,
    updateConversationBusy,
    webSearchEnabled,
  ]);
  runModelLoopRef.current = runModelLoop;

  const sendMessage = useCallback(async (
    content: string,
    pendingAttachments: PendingChatAttachment[] = [],
    selectedModel?: string,
    onAccepted?: () => void,
  ) => {
    const text = content.trim();
    if (!text && pendingAttachments.length === 0) return false;
    let conversation = conversationsRef.current.find(item => item.id === activeConversationIdRef.current);
    const pendingPlan = conversation
      ? pendingApprovalsRef.current.get(conversation.id)
      : undefined;
    const pendingBatchCall = pendingPlan?.calls.find(call => (
      call.toolName === 'batch_image_operation' && call.status === 'awaiting-approval'
    ));
    if (conversation && pendingPlan && pendingBatchCall) {
      const planArguments = parseArguments(pendingBatchCall.argumentsJson);
      const analysisSummary = normalizeVisibleChatText(planArguments.analysisSummary);
      updateConversationBusy(conversation.id, true);
      const planDecision = await classifyBatchPlanReply({
        model: pendingPlan.requestModel,
        analysisSummary,
        userReply: text || '我补充了新的图片附件。',
        hasNewAttachments: pendingAttachments.length > 0,
      });
      const confirmsPlan = planDecision === 'confirm' && pendingAttachments.length === 0;
      pendingApprovalsRef.current.delete(conversation.id);
      if (!confirmsPlan) {
        pendingBatchCall.status = 'declined';
        pendingBatchCall.resultJson = serializeChatToolResult({
          declined: true,
          revisionRequested: planDecision === 'revise',
          cancelledByUser: planDecision === 'cancel',
        });
        pendingBatchCall.completedAt = Date.now();
        await upsertChatToolCall(pendingBatchCall).catch(() => {});
        patchMessage(pendingPlan.assistantMessageId, message => ({
          ...message,
          status: 'completed',
          toolCalls: [...pendingPlan.calls],
        }), true);
        updateConversationBusy(conversation.id, false);
      } else {
        const conversationId = conversation.id;
        const now = Date.now();
        const confirmationMessage: ChatMessage = {
          id: createChatId('chat-user'),
          conversationId,
          role: 'user',
          content: text,
          status: 'completed',
          createdAt: now,
          attachments: [],
          toolCalls: [],
        };
        const executionMessageId = createChatId('chat-assistant');
        const executionCall: ChatToolCall = {
          ...pendingBatchCall,
          id: createChatId('chat-tool'),
          messageId: executionMessageId,
          status: 'pending',
          resultJson: null,
          createdAt: now + 1,
          completedAt: null,
        };
        const executionMessage: ChatMessage = {
          id: executionMessageId,
          conversationId,
          role: 'assistant',
          content: '',
          status: 'streaming',
          createdAt: now + 2,
          attachments: [],
          toolCalls: [executionCall],
        };
        pendingBatchCall.status = 'declined';
        pendingBatchCall.resultJson = serializeChatToolResult({ declined: true, planApproved: true });
        pendingBatchCall.completedAt = now;
        const nextMessages = [
          ...getConversationMessages(conversationId),
          confirmationMessage,
          executionMessage,
        ];
        cacheMessages([confirmationMessage, executionMessage]);
        if (activeConversationIdRef.current === conversationId) {
          messagesRef.current = nextMessages;
          setMessages(nextMessages);
        }
        updateConversationBusy(conversationId, true);
        try {
          await Promise.all([
            upsertChatToolCall(pendingBatchCall),
            upsertChatMessage(confirmationMessage),
            upsertChatMessage(executionMessage),
          ]);
          await upsertChatToolCall(executionCall);
          patchMessage(pendingPlan.assistantMessageId, message => ({
            ...message,
            status: 'completed',
            toolCalls: [...pendingPlan.calls],
          }), true);
          try {
            onAccepted?.();
          } catch (error) {
            console.warn('Chat 消息发送后的界面清理失败:', error);
          }
          const providerBeforePlannedCall = pendingPlan.providerMessages.filter(message => (
            !Array.isArray(message.tool_calls)
            || !message.tool_calls.some(value => (
              Boolean(value && typeof value === 'object')
              && String((value as Record<string, unknown>).id || '') === pendingBatchCall.id
            ))
          ));
          const executionAssistantMessage = {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: executionCall.id,
              type: 'function',
              function: { name: executionCall.toolName, arguments: executionCall.argumentsJson },
            }],
          };
          await continueToolCalls({
            ...pendingPlan,
            assistantMessageId: executionMessageId,
            userText: text,
            providerMessages: [
              ...providerBeforePlannedCall,
              ...(analysisSummary ? [{ role: 'assistant', content: analysisSummary }] : []),
              { role: 'user', content: text },
              executionAssistantMessage,
            ],
            calls: [executionCall],
            index: 0,
            toolMessages: [],
          }, executionCall.id);
          return true;
        } catch (error) {
          activeRequestsRef.current.delete(conversationId);
          activeBatchRunsRef.current.delete(conversationId);
          updateConversationBusy(conversationId, false);
          patchMessage(executionMessageId, message => ({
            ...message,
            content: normalizeVisibleChatText(message.content) || '确认后的批量任务没有完成。',
            status: 'error',
          }), true);
          optionsRef.current.onNotice?.(`Chat 请求失败：${String(error)}`);
          return false;
        }
      }
    }
    if (conversation && (
      busyConversationIdsRef.current.has(conversation.id)
      || pendingApprovalsRef.current.has(conversation.id)
    )) return false;
    const requestModel = resolveChatRequestModel(
      selectedModel,
      conversation?.model,
      optionsRef.current.model,
    );
    if (conversation && normalizeChatModelSelection(selectedModel) && conversation.model !== requestModel) {
      void applyConversationModel(conversation, requestModel);
      conversation = conversationsRef.current.find(item => item.id === conversation!.id) || conversation;
    }
    if (!conversation) {
      try {
        conversation = await createConversation(requestModel);
      } catch (error) {
        optionsRef.current.onNotice?.(`创建 Chat 会话失败：${String(error)}`);
        return false;
      }
    }
    const conversationId = conversation.id;
    const requestSummary = summaryRef.current?.conversationId === conversationId
      ? summaryRef.current
      : null;
    updateConversationBusy(conversationId, true);

    let preparedAttachments = pendingAttachments;
    if (optionsRef.current.prepareAttachment && pendingAttachments.length > 0) {
      try {
        preparedAttachments = await Promise.all(pendingAttachments.map(optionsRef.current.prepareAttachment));
      } catch (error) {
        updateConversationBusy(conversationId, false);
        optionsRef.current.onNotice?.(`保存 Chat 附件失败：${String(error)}`);
        return false;
      }
    }
    const now = Date.now();
    const userMessageId = createChatId('chat-user');
    const attachments: ChatAttachment[] = preparedAttachments.map((attachment, index) => ({
      ...attachment,
      id: attachment.id || createChatId(`chat-attachment-${index}`),
      messageId: userMessageId,
      createdAt: attachment.createdAt || now + index,
    }));
    const userMessage: ChatMessage = {
      id: userMessageId,
      conversationId: conversation.id,
      role: 'user',
      content: text || '请查看附件。',
      status: 'completed',
      createdAt: now,
      attachments,
      toolCalls: [],
    };
    const assistantMessage: ChatMessage = {
      id: createChatId('chat-assistant'),
      conversationId: conversation.id,
      role: 'assistant',
      content: '',
      status: 'streaming',
      createdAt: now + 1,
      attachments: [],
      toolCalls: [],
    };
    let existingMessages = getConversationMessages(conversationId);
    if (attachments.length === 0 && isHistoricalImageContinuation(userMessage.content)) {
      try {
        const persistedPage = await listChatMessages(conversationId, { limit: PAGE_SIZE });
        const hydratedMessages = persistedPage.messages.map(persistedMessage => {
          const cachedMessage = messageCacheRef.current.get(persistedMessage.id);
          if (!cachedMessage) return persistedMessage;
          return {
            ...cachedMessage,
            attachments: persistedMessage.attachments.length > cachedMessage.attachments.length
              ? persistedMessage.attachments
              : cachedMessage.attachments,
            toolCalls: cachedMessage.toolCalls.length > 0
              ? cachedMessage.toolCalls
              : persistedMessage.toolCalls,
          };
        });
        cacheMessages(hydratedMessages);
        existingMessages = getConversationMessages(conversationId);
      } catch (error) {
        console.warn('刷新 Chat 历史图片附件失败，将继续使用内存会话:', error);
      }
    }
    const nextMessages = [...existingMessages, userMessage, assistantMessage];
    const imageSelection = selectChatImageAttachments(nextMessages, userMessage.content);
    cacheMessages([userMessage, assistantMessage]);
    if (activeConversationIdRef.current === conversationId) {
      messagesRef.current = nextMessages;
      setMessages(nextMessages);
    }
    const visionResolver = imageSelection.attachments.length > 0
      ? optionsRef.current.createVisionAttachmentResolver?.()
      : undefined;
    try {
      await upsertChatMessage(userMessage);
      await Promise.all(attachments.map(upsertChatAttachment));
      await upsertChatMessage(assistantMessage);
      try {
        onAccepted?.();
      } catch (error) {
        console.warn('Chat 消息发送后的界面清理失败:', error);
      }
      if (conversation.title === '新对话') {
        const latestConversation = conversationsRef.current.find(item => item.id === conversation!.id)
          || conversation;
        conversation = {
          ...latestConversation,
          title: trimConversationTitle(text || '图片对话'),
          updatedAt: now,
        };
        conversationsRef.current = conversationsRef.current.map(item => (
          item.id === conversation!.id ? conversation! : item
        ));
        setConversations(conversationsRef.current);
        await enqueueConversationPersist(conversation);
      }
      const providerMessages = await buildChatContext({
        messages: nextMessages,
        latestUserMessage: userMessage,
        summary: requestSummary,
        resolveAttachmentUrl: visionResolver?.resolve || optionsRef.current.resolveAttachmentUrl,
        visionAttachments: imageSelection.attachments,
        reusedVisionAttachments: imageSelection.reusedFromHistory,
      });
      const visionFailures = visionResolver?.failures() || [];
      if (visionFailures.length > 0) {
        optionsRef.current.onNotice?.(
          `${visionFailures.length} 张图片暂时无法上传，已跳过这些图片以避免发送过大的内容。`,
        );
      }
      await runModelLoop(
        conversation.id,
        assistantMessage.id,
        userMessage.content,
        requestModel,
        providerMessages,
        0,
      );
      return true;
    } catch (error) {
      const cancelled = /取消|cancel/i.test(String(error));
      patchMessage(assistantMessage.id, message => ({
        ...message,
        content: message.content.trim() || (cancelled ? '已停止生成。' : '这次请求没有完成。'),
        status: cancelled ? 'cancelled' : 'error',
      }), true);
      if (activeRequestsRef.current.get(conversationId)?.messageId === assistantMessage.id) {
        activeRequestsRef.current.delete(conversationId);
      }
      activeBatchRunsRef.current.delete(conversationId);
      updateConversationBusy(conversationId, false);
      if (!cancelled) optionsRef.current.onNotice?.(`Chat 请求失败：${String(error)}`);
      return cancelled;
    } finally {
      await visionResolver?.dispose().catch(error => {
        console.warn('清理 Chat Vision 临时图片失败:', error);
      });
    }
  }, [
    applyConversationModel,
    cacheMessages,
    createConversation,
    enqueueConversationPersist,
    getConversationMessages,
    patchMessage,
    runModelLoop,
    updateConversationBusy,
  ]);

  const stop = useCallback(async () => {
    const conversationId = activeConversationIdRef.current;
    const activeBatch = activeBatchRunsRef.current.get(conversationId);
    if (activeBatch) {
      activeBatch.controller.abort();
      activeBatchRunsRef.current.delete(conversationId);
      if (activeConversationIdRef.current === conversationId) {
        syncActiveConversationActivity(conversationId);
      }
      return;
    }
    const active = activeRequestsRef.current.get(conversationId);
    if (!active) return;
    await cancelChatCompletion(active.requestId).catch(() => {});
    patchMessage(active.messageId, message => ({
      ...message,
      content: message.content.trim() || '已停止生成。',
      status: 'cancelled',
    }), true);
    activeRequestsRef.current.delete(conversationId);
    if (activeConversationIdRef.current === conversationId) {
      syncActiveConversationActivity(conversationId);
    }
  }, [patchMessage, syncActiveConversationActivity]);

  const resolveToolApproval = useCallback(async (callId: string, approved: boolean) => {
    const pendingEntry = [...pendingApprovalsRef.current.entries()]
      .find(([, run]) => run.calls.some(call => call.id === callId));
    if (!pendingEntry) return;
    const [conversationId, pending] = pendingEntry;
    const call = pending.calls.find(value => value.id === callId);
    if (!call || call.status !== 'awaiting-approval') return;
    pendingApprovalsRef.current.delete(conversationId);
    updateConversationBusy(conversationId, true);
    try {
      if (!approved) {
        call.status = 'declined';
        const isBatchRevision = call.toolName === 'batch_image_operation';
        call.resultJson = serializeChatToolResult({
          declined: true,
          ...(isBatchRevision ? { revisionRequested: true } : {}),
        });
        call.completedAt = Date.now();
        await upsertChatToolCall(call);
        if (isBatchRevision) {
          patchMessage(pending.assistantMessageId, message => ({
            ...message,
            status: 'completed',
            toolCalls: [...pending.calls],
          }), true);
          updateConversationBusy(conversationId, false);
          return;
        }
        const nextRun = {
          ...pending,
          calls: [...pending.calls],
          index: pending.index + 1,
          toolMessages: [...pending.toolMessages, { role: 'tool', tool_call_id: call.id, content: call.resultJson }],
        };
        patchMessage(pending.assistantMessageId, message => ({ ...message, toolCalls: [...pending.calls] }), true);
        await continueToolCalls(nextRun);
        return;
      }
      call.status = 'pending';
      call.resultJson = null;
      call.completedAt = null;
      await continueToolCalls({ ...pending, calls: [...pending.calls] }, callId);
    } catch (error) {
      pendingApprovalsRef.current.delete(conversationId);
      activeRequestsRef.current.delete(conversationId);
      activeBatchRunsRef.current.delete(conversationId);
      updateConversationBusy(conversationId, false);
      patchMessage(pending.assistantMessageId, message => ({
        ...message,
        content: message.content.trim() || '确认后的请求没有完成。',
        status: 'error',
      }), true);
      optionsRef.current.onNotice?.(`Chat 请求失败：${String(error)}`);
    }
  }, [continueToolCalls, patchMessage, updateConversationBusy]);

  const retryLast = useCallback(async () => {
    const lastUser = [...messagesRef.current].reverse().find(message => message.role === 'user');
    if (!lastUser) return false;
    return sendMessage(lastUser.content, lastUser.attachments.map(attachment => ({ ...attachment })));
  }, [sendMessage]);

  const selectConversation = useCallback((id: string) => {
    if (id === activeConversationIdRef.current) return;
    void loadConversation(id);
  }, [loadConversation]);

  const removeConversation = useCallback(async (id: string) => {
    if (busyConversationIdsRef.current.has(id) || pendingApprovalsRef.current.has(id)) {
      optionsRef.current.onNotice?.('该对话仍有任务在运行，请等待完成或先停止任务。');
      return;
    }
    await deleteChatConversation(id);
    for (const [messageId, message] of messageCacheRef.current) {
      if (message.conversationId === id) messageCacheRef.current.delete(messageId);
    }
    const next = conversationsRef.current.filter(item => item.id !== id);
    conversationsRef.current = next;
    setConversations(next);
    if (id !== activeConversationIdRef.current) return;
    if (next[0]) await loadConversation(next[0].id);
    else await createConversation();
  }, [createConversation, loadConversation]);

  const startNewConversation = useCallback((title?: string) => {
    return createConversation(optionsRef.current.model, title);
  }, [createConversation]);

  const searchConversations = useCallback((query: string) => {
    setSearchQuery(query);
    void refreshConversations(query);
  }, [refreshConversations]);

  const activeConversation = useMemo(
    () => conversations.find(item => item.id === activeConversationId),
    [activeConversationId, conversations],
  );

  return {
    conversations,
    activeConversation,
    activeConversationId,
    messages,
    summary,
    busy,
    stoppable,
    loading,
    loadingOlder,
    hasMoreMessages,
    searchQuery,
    usage,
    webSearchEnabled,
    sendMessage,
    stop,
    retryLast,
    resolveToolApproval,
    newConversation: startNewConversation,
    selectConversation,
    deleteConversation: removeConversation,
    loadOlderMessages,
    setConversationModel,
    searchConversations,
    setWebSearchEnabled,
  };
}
