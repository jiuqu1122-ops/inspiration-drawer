import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createChatId,
  getGeneratedMediaFromToolCall,
  type ChatAttachment,
  type ChatConversation,
  type ChatGeneratedMedia,
  type ChatMessage,
  type ChatReasoningEffort,
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
import { getChatToolDefinitions, shouldDirectGenerateImage, shouldExposeWebSearch } from '../tools/chatToolDefinitions';
import { routeChatToolCall } from '../tools/chatToolRouter';
import { serializeChatToolResult } from '../tools/chatToolResult';
import { applyChatImageGenerationSettings } from './chatImageGenerationSettings';
import { cancelChatCompletion, requestChatCompletion, type ChatProviderResult } from './chatStream';

type UseChatRuntimeOptions = {
  model: string;
  imageModel?: string;
  imageAspectRatio?: string;
  imageResolution?: string;
  approvalMode?: 'ask' | 'auto';
  executeTool: ChatToolExecutor;
  resolveAttachmentUrl?: (attachment: ChatAttachment) => Promise<string>;
  prepareAttachment?: (attachment: PendingChatAttachment) => Promise<PendingChatAttachment>;
  onNotice?: (message: string) => void;
  onGeneratedMediaReady?: (media: ChatGeneratedMedia) => void | Promise<void>;
};

type PendingApprovalRun = {
  conversationId: string;
  assistantMessageId: string;
  userText: string;
  providerMessages: Array<Record<string, unknown>>;
  calls: ChatToolCall[];
  index: number;
  toolMessages: Array<Record<string, unknown>>;
  depth: number;
};

const PAGE_SIZE = 50;
const MAX_TOOL_ROUNDS = 6;
const SUMMARY_TRIGGER_TOKENS = 18_000;
const SUMMARY_TRIGGER_MESSAGES = 36;
const SUMMARY_KEEP_RECENT = 28;
const LEGACY_PROVIDER_MODELS = new Set(['codex', 'openai-compatible', 'default']);
const CHAT_REASONING_EFFORT_STORAGE_KEY = 'drawer_chat_reasoning_effort';
const LEGACY_CHAT_REASONING_ENABLED_STORAGE_KEY = 'drawer_chat_reasoning_enabled';
const CHAT_WEB_SEARCH_ENABLED_STORAGE_KEY = 'drawer_chat_web_search_enabled';

const CHAT_REASONING_EFFORTS = new Set<ChatReasoningEffort>(['', 'low', 'medium', 'high', 'xhigh', 'max']);
const CHAT_REASONING_INSTRUCTIONS: Record<Exclude<ChatReasoningEffort, ''>, string> = {
  low: '使用轻度推理，优先快速、直接地完成任务。',
  medium: '使用中等推理深度，在速度与严谨性之间保持平衡。',
  high: '使用高推理深度，充分检查关键假设与结论。',
  xhigh: '使用极高推理深度，进行更充分的探索、验证与复核。',
  max: '使用最高（Ultra）推理深度，优先质量并进行最充分的探索与验证。',
};

const readStoredReasoningEffort = (): ChatReasoningEffort => {
  const stored = localStorage.getItem(CHAT_REASONING_EFFORT_STORAGE_KEY) as ChatReasoningEffort | null;
  if (stored !== null && CHAT_REASONING_EFFORTS.has(stored)) return stored;
  return localStorage.getItem(LEGACY_CHAT_REASONING_ENABLED_STORAGE_KEY) === 'true' ? 'medium' : '';
};

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

const latestUserImageSources = (messages: ChatMessage[]) => {
  const latestUser = [...messages].reverse().find(message => message.role === 'user');
  if (!latestUser) return [];
  return latestUser.attachments
    .filter(attachment => attachment.type === 'image' && attachment.path.trim())
    .map(attachment => attachment.path.trim())
    .slice(0, 9);
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
  const [reasoningEffort, setReasoningEffort] = useState<ChatReasoningEffort>(readStoredReasoningEffort);
  const [webSearchEnabled, setWebSearchEnabled] = useState(() => (
    localStorage.getItem(CHAT_WEB_SEARCH_ENABLED_STORAGE_KEY) === 'true'
  ));

  const conversationsRef = useRef(conversations);
  const messagesRef = useRef(messages);
  const summaryRef = useRef(summary);
  const activeConversationIdRef = useRef(activeConversationId);
  const activeRequestRef = useRef<{ requestId: string; conversationId: string; messageId: string; streamed: boolean } | null>(null);
  const pendingApprovalRef = useRef<PendingApprovalRun | null>(null);
  const persistTimersRef = useRef(new Map<string, number>());

  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { summaryRef.current = summary; }, [summary]);
  useEffect(() => { activeConversationIdRef.current = activeConversationId; }, [activeConversationId]);
  useEffect(() => {
    localStorage.setItem(CHAT_REASONING_EFFORT_STORAGE_KEY, reasoningEffort);
  }, [reasoningEffort]);
  useEffect(() => {
    localStorage.setItem(CHAT_WEB_SEARCH_ENABLED_STORAGE_KEY, String(webSearchEnabled));
  }, [webSearchEnabled]);

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
    setMessages(current => {
      let patched: ChatMessage | undefined;
      const next = current.map(message => {
        if (message.id !== messageId) return message;
        patched = updater(message);
        return patched;
      });
      messagesRef.current = next;
      if (patched) persistMessageSoon(patched, immediate);
      return next;
    });
  }, [persistMessageSoon]);

  const refreshConversations = useCallback(async (query = searchQuery) => {
    const next = await listChatConversations(query, 120, 0);
    conversationsRef.current = next;
    setConversations(next);
    return next;
  }, [searchQuery]);

  const loadConversation = useCallback(async (conversationId: string) => {
    if (!conversationId) return;
    setLoading(true);
    try {
      const [page, nextSummary] = await Promise.all([
        listChatMessages(conversationId, { limit: PAGE_SIZE }),
        getChatSummary(conversationId),
      ]);
      activeConversationIdRef.current = conversationId;
      setActiveConversationId(conversationId);
      writeActiveChatConversationId(conversationId);
      messagesRef.current = page.messages;
      setMessages(page.messages);
      setHasMoreMessages(page.hasMore);
      setNextBeforeCreatedAt(page.nextBeforeCreatedAt || undefined);
      summaryRef.current = nextSummary;
      setSummary(nextSummary);
    } finally {
      setLoading(false);
    }
  }, []);

  const createConversation = useCallback(async (model = optionsRef.current.model) => {
    const now = Date.now();
    const conversation: ChatConversation = {
      id: createChatId('chat-conversation'),
      title: '新对话',
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
    return conversation;
  }, []);

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
      const active = activeRequestRef.current;
      const requestId = String(event.payload?.requestId || '');
      if (!active || requestId !== active.requestId || event.payload?.kind !== 'delta') return;
      const delta = String(event.payload?.delta || '');
      if (!delta) return;
      active.streamed = true;
      patchMessage(active.messageId, message => ({
        ...message,
        content: `${message.content}${delta}`,
        status: 'streaming',
      }));
    });
    return () => { void unlisten.then(dispose => dispose()); };
  }, [patchMessage]);

  useEffect(() => () => {
    persistTimersRef.current.forEach(timer => window.clearTimeout(timer));
  }, []);

  const loadOlderMessages = useCallback(async () => {
    if (!activeConversationIdRef.current || !hasMoreMessages || !nextBeforeCreatedAt || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await listChatMessages(activeConversationIdRef.current, {
        beforeCreatedAt: nextBeforeCreatedAt,
        limit: PAGE_SIZE,
      });
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
  }, [hasMoreMessages, loadingOlder, nextBeforeCreatedAt]);

  const maybeSummarize = useCallback(async (conversationId: string) => {
    const current = messagesRef.current.filter(message => message.status === 'completed');
    if (current.length <= SUMMARY_KEEP_RECENT) return;
    const older = current.slice(0, -SUMMARY_KEEP_RECENT);
    const through = older[older.length - 1];
    if (!through || summaryRef.current?.throughMessageId === through.id) return;
    const previousBoundary = summaryRef.current?.throughMessageId
      ? older.findIndex(message => message.id === summaryRef.current?.throughMessageId)
      : -1;
    const unsummarized = previousBoundary >= 0 ? older.slice(previousBoundary + 1) : older;
    if (unsummarized.length === 0) return;
    const tokens = unsummarized.reduce((total, message) => total + estimateChatTokens(message.content), 0);
    if (tokens < SUMMARY_TRIGGER_TOKENS && unsummarized.length < SUMMARY_TRIGGER_MESSAGES) return;
    try {
      const requestId = createChatId('chat-summary');
      const result = await requestChatCompletion({
        requestId,
        messages: buildSummaryRequestMessages(summaryRef.current, unsummarized),
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
      summaryRef.current = next;
      setSummary(next);
    } catch (error) {
      console.warn('Chat 摘要生成失败，保留完整最近消息:', error);
    }
  }, []);

  const runModelLoopRef = useRef<(
    conversationId: string,
    assistantMessageId: string,
    userText: string,
    providerMessages: Array<Record<string, unknown>>,
    depth: number,
  ) => Promise<void>>(async () => {});

  const continueToolCalls = useCallback(async (run: PendingApprovalRun, approvedCallId?: string) => {
    let index = run.index;
    const toolMessages = [...run.toolMessages];
    for (; index < run.calls.length; index += 1) {
      const call = run.calls[index];
      let args: Record<string, unknown>;
      try {
        args = parseArguments(call.argumentsJson);
        const generated = latestGeneratedMedia(messagesRef.current);
        const currentImageSources = latestUserImageSources(messagesRef.current);
        if ((call.toolName === 'generate_image' || call.toolName === 'edit_image')
          && currentImageSources.length > 0) {
          args.referenceImages = currentImageSources;
        }
        if (call.toolName === 'edit_image' && generated) {
          if (!args.sourceImageId) args.sourceImageId = generated.id;
          if (!Array.isArray(args.referenceImages) || args.referenceImages.length === 0) {
            args.referenceImages = [generated.path || generated.url].filter(Boolean);
          }
        }
        if (call.toolName === 'add_to_canvas' && generated) {
          if (!args.mediaId) args.mediaId = generated.id;
          if (!args.assetId && generated.assetId) args.assetId = generated.assetId;
        }
        if (call.toolName === 'generate_image' || call.toolName === 'edit_image') {
          args = applyChatImageGenerationSettings(args, optionsRef.current);
        }
        call.argumentsJson = JSON.stringify(args);
        const approved = approvedCallId === call.id;
        const routed = await routeChatToolCall({
          name: call.toolName,
          args,
          context: {
            userText: run.userText,
            conversationId: run.conversationId,
            messageId: run.assistantMessageId,
            recentMessages: messagesRef.current,
          },
          executor: optionsRef.current.executeTool,
          approvalMode: optionsRef.current.approvalMode,
          approved,
          onExecuting: async () => {
            call.status = 'running';
            await upsertChatToolCall(call);
            patchMessage(run.assistantMessageId, message => ({ ...message, toolCalls: [...run.calls] }));
          },
        });
        if (routed.requiresApproval) {
          call.status = 'awaiting-approval';
          await upsertChatToolCall(call);
          patchMessage(run.assistantMessageId, message => ({ ...message, toolCalls: [...run.calls] }), true);
          pendingApprovalRef.current = { ...run, calls: [...run.calls], index, toolMessages };
          setBusy(false);
          return;
        }
        const resultJson = serializeChatToolResult(routed.result);
        call.resultJson = resultJson;
        call.status = 'completed';
        call.completedAt = Date.now();
        await upsertChatToolCall(call);
        toolMessages.push({ role: 'tool', tool_call_id: call.id, content: resultJson });
        if (call.toolName === 'generate_image' || call.toolName === 'edit_image') {
          const generatedMedia = getGeneratedMediaFromToolCall(call)
            .filter(media => media.type === 'image');
          for (const media of generatedMedia) {
            try {
              await optionsRef.current.onGeneratedMediaReady?.(media);
            } catch (error) {
              console.warn('Chat 生成结果自动加入画布失败:', error);
            }
          }
        }
      } catch (error) {
        call.status = 'error';
        call.resultJson = serializeChatToolResult({ error: String(error) });
        call.completedAt = Date.now();
        await upsertChatToolCall(call).catch(() => {});
        toolMessages.push({ role: 'tool', tool_call_id: call.id, content: call.resultJson });
      }
      patchMessage(run.assistantMessageId, message => ({ ...message, toolCalls: [...run.calls] }), true);
    }
    pendingApprovalRef.current = null;
    await runModelLoopRef.current(
      run.conversationId,
      run.assistantMessageId,
      run.userText,
      [...run.providerMessages, ...toolMessages],
      run.depth + 1,
    );
  }, [patchMessage]);

  const runModelLoop = useCallback(async (
    conversationId: string,
    assistantMessageId: string,
    userText: string,
    providerMessages: Array<Record<string, unknown>>,
    depth: number,
  ) => {
    if (depth >= MAX_TOOL_ROUNDS) throw new Error('连续工具调用过多，已停止');
    const requestId = createChatId('chat-request');
    const hasRecentMedia = Boolean(latestGeneratedMedia(messagesRef.current));
    const previousWebSearchQueries = new Set(providerToolCallQueries(providerMessages, 'web_search'));
    const previousFileCreateCount = providerToolCallCount(providerMessages, 'create_file');
    const webSearchCount = previousWebSearchQueries.size;
    const webSearchRequested = webSearchEnabled || shouldExposeWebSearch(userText);
    const webSearchAvailable = webSearchRequested && webSearchCount < 2;
    const tools = previousFileCreateCount > 0
      ? []
      : getChatToolDefinitions(userText, hasRecentMedia, webSearchAvailable, webSearchCount >= 2);
    const requestInstructions: Array<Record<string, unknown>> = [];
    if (reasoningEffort) {
      requestInstructions.push({
        role: 'system',
        content: CHAT_REASONING_INSTRUCTIONS[reasoningEffort],
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
    activeRequestRef.current = { requestId, conversationId, messageId: assistantMessageId, streamed: false };
    setStoppable(true);
    const requestModel = conversationsRef.current.find(item => item.id === conversationId)?.model || optionsRef.current.model;
    let result: ChatProviderResult;
    try {
      result = await requestChatCompletion({
        requestId,
        messages: requestMessages,
        tools,
        model: requestModel,
        stream: true,
        reasoningEffort: reasoningEffort || undefined,
      });
    } catch (error) {
      const active = activeRequestRef.current;
      if (webSearchCount === 0 || active?.streamed) throw error;
      const fallbackRequestId = createChatId('chat-search-synthesis');
      activeRequestRef.current = {
        requestId: fallbackRequestId,
        conversationId,
        messageId: assistantMessageId,
        streamed: false,
      };
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
        reasoningEffort: reasoningEffort || undefined,
      });
    }
    const active = activeRequestRef.current;
    activeRequestRef.current = null;
    setStoppable(false);
    setUsage(normalizeUsage(result.usage));
    if (!active?.streamed && result.content) {
      patchMessage(assistantMessageId, message => ({ ...message, content: `${message.content}${result.content}` }));
    }
    const acceptedWebSearchQueries = new Set(previousWebSearchQueries);
    let acceptedWebSearchInResponse = false;
    let acceptedFileCreateInResponse = false;
    const toolCalls = (result.toolCalls || []).filter(call => {
      if (call.name === 'create_file') {
        if (previousFileCreateCount > 0 || acceptedFileCreateInResponse) return false;
        acceptedFileCreateInResponse = true;
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
    if (depth === 0 && toolCalls.length === 0 && shouldDirectGenerateImage(userText)) {
      const fallbackCall: ChatToolCall = {
        id: createChatId('chat-tool'),
        messageId: assistantMessageId,
        toolName: 'generate_image',
        argumentsJson: JSON.stringify(applyChatImageGenerationSettings({ prompt: userText }, optionsRef.current)),
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
      setBusy(false);
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
      providerMessages: [...providerMessages, assistantToolMessage],
      calls,
      index: 0,
      toolMessages: [],
      depth,
    });
  }, [continueToolCalls, maybeSummarize, patchMessage, reasoningEffort, webSearchEnabled]);
  runModelLoopRef.current = runModelLoop;

  const sendMessage = useCallback(async (content: string, pendingAttachments: PendingChatAttachment[] = []) => {
    const text = content.trim();
    if ((!text && pendingAttachments.length === 0) || busy || pendingApprovalRef.current) return false;
    let preparedAttachments = pendingAttachments;
    if (optionsRef.current.prepareAttachment && pendingAttachments.length > 0) {
      try {
        preparedAttachments = await Promise.all(pendingAttachments.map(optionsRef.current.prepareAttachment));
      } catch (error) {
        optionsRef.current.onNotice?.(`保存 Chat 附件失败：${String(error)}`);
        return false;
      }
    }
    let conversation = conversationsRef.current.find(item => item.id === activeConversationIdRef.current);
    if (!conversation) conversation = await createConversation();
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
    const existingMessages = messagesRef.current;
    const nextMessages = [...existingMessages, userMessage, assistantMessage];
    messagesRef.current = nextMessages;
    setMessages(nextMessages);
    setBusy(true);
    try {
      await upsertChatMessage(userMessage);
      await Promise.all(attachments.map(upsertChatAttachment));
      await upsertChatMessage(assistantMessage);
      if (conversation.title === '新对话') {
        conversation = { ...conversation, title: trimConversationTitle(text || '图片对话'), updatedAt: now };
        await upsertChatConversation(conversation);
        setConversations(current => current.map(item => item.id === conversation!.id ? conversation! : item));
      }
      const providerMessages = await buildChatContext({
        messages: nextMessages,
        latestUserMessage: userMessage,
        summary: summaryRef.current,
        resolveAttachmentUrl: optionsRef.current.resolveAttachmentUrl,
      });
      await runModelLoop(conversation.id, assistantMessage.id, userMessage.content, providerMessages, 0);
      return true;
    } catch (error) {
      const cancelled = /取消|cancel/i.test(String(error));
      patchMessage(assistantMessage.id, message => ({
        ...message,
        content: message.content.trim() || (cancelled ? '已停止生成。' : '这次请求没有完成。'),
        status: cancelled ? 'cancelled' : 'error',
      }), true);
      activeRequestRef.current = null;
      setStoppable(false);
      setBusy(false);
      if (!cancelled) optionsRef.current.onNotice?.(`Chat 请求失败：${String(error)}`);
      return cancelled;
    }
  }, [busy, createConversation, patchMessage, runModelLoop]);

  const stop = useCallback(async () => {
    const active = activeRequestRef.current;
    if (!active) return;
    await cancelChatCompletion(active.requestId).catch(() => {});
    patchMessage(active.messageId, message => ({
      ...message,
      content: message.content.trim() || '已停止生成。',
      status: 'cancelled',
    }), true);
    activeRequestRef.current = null;
    setStoppable(false);
    setBusy(false);
  }, [patchMessage]);

  const resolveToolApproval = useCallback(async (callId: string, approved: boolean) => {
    const pending = pendingApprovalRef.current;
    if (!pending) return;
    const call = pending.calls.find(value => value.id === callId);
    if (!call || call.status !== 'awaiting-approval') return;
    setBusy(true);
    try {
      if (!approved) {
        call.status = 'declined';
        call.resultJson = serializeChatToolResult({ declined: true });
        call.completedAt = Date.now();
        await upsertChatToolCall(call);
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
      await continueToolCalls({ ...pending, calls: [...pending.calls] }, callId);
    } catch (error) {
      pendingApprovalRef.current = null;
      activeRequestRef.current = null;
      setStoppable(false);
      setBusy(false);
      patchMessage(pending.assistantMessageId, message => ({
        ...message,
        content: message.content.trim() || '确认后的请求没有完成。',
        status: 'error',
      }), true);
      optionsRef.current.onNotice?.(`Chat 请求失败：${String(error)}`);
    }
  }, [continueToolCalls, patchMessage]);

  const retryLast = useCallback(async () => {
    const lastUser = [...messagesRef.current].reverse().find(message => message.role === 'user');
    if (!lastUser) return false;
    return sendMessage(lastUser.content, lastUser.attachments.map(attachment => ({ ...attachment })));
  }, [sendMessage]);

  const selectConversation = useCallback((id: string) => {
    if (id === activeConversationIdRef.current || busy || pendingApprovalRef.current) return;
    void loadConversation(id);
  }, [busy, loadConversation]);

  const removeConversation = useCallback(async (id: string) => {
    if (busy || pendingApprovalRef.current) return;
    await deleteChatConversation(id);
    const next = conversationsRef.current.filter(item => item.id !== id);
    conversationsRef.current = next;
    setConversations(next);
    if (id !== activeConversationIdRef.current) return;
    if (next[0]) await loadConversation(next[0].id);
    else await createConversation();
  }, [busy, createConversation, loadConversation]);

  const setConversationModel = useCallback(async (model: string) => {
    const conversation = conversationsRef.current.find(item => item.id === activeConversationIdRef.current);
    if (!conversation || !model.trim() || busy || pendingApprovalRef.current) return;
    const next = { ...conversation, model: model.trim(), updatedAt: Date.now() };
    conversationsRef.current = conversationsRef.current.map(item => item.id === next.id ? next : item);
    setConversations(conversationsRef.current);
    await upsertChatConversation(next);
  }, [busy]);

  const startNewConversation = useCallback(() => {
    if (busy || pendingApprovalRef.current) return Promise.resolve(undefined);
    return createConversation();
  }, [busy, createConversation]);

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
    reasoningEffort,
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
    setReasoningEffort,
    setWebSearchEnabled,
  };
}
