import { rhinoPostprocessFailure } from '../../rhino/rhinoPostprocessFailure';
import { readableRhinoMcpFailure } from '../../rhino/rhinoErrorDiagnostic';
import { geometryFailureReceipt, geometryFailureSummary, MAX_GEOMETRY_PREFLIGHT_CORRECTIONS } from '../../rhino/rhinoGeometryRecovery';
import { isShortVisualFollowup, isVisualEditFollowup, isVisualRevisionFollowup } from '../context/chatVisualIntent';
import { firstRequestTitle } from '../model/chatConversationTitle';
import { RhinoDocumentGeometryWriteError } from '../../rhino/rhinoDocumentGeometry';
import { rhinoScriptFailureExplanation } from '../../rhino/rhinoScriptPreflight';
import { collectGhPythonComponentIds, splitRhinoVisionObservation, VERIFY_GH_TOOL } from '../../rhino/rhinoGhSafety';
import { GEOMETRY_PREFLIGHT_REJECTION, RhinoGeometryPreflightError, SAFE_PROFILE_TOOL } from '../../rhino/rhinoSafeModeling';
import { isRhinoGeometryOnlyRequest } from '../../rhino/rhinoRequestIntent';
import { connectDesignMemoryEvents, designMemory } from '../../designMemory/storage';
import { beginChatDesignSummaryMemory, completeChatDesignSummaryMemory, designMemoryProjectId, rememberExplicitChatDesign } from '../../designMemory/sources';
import { describeDesignMemoryTurn, designMemoryKindsInMessages, getDesignMemoryTurnReport, recallDesignMemoryForTurn, validateDesignMemoryMessages } from '../../designMemory/context';
import type { DesignMemoryKind } from '../../designMemory/types';
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
  type ChatExecutionSource,
  type PendingChatAttachment,
} from '../model/chatTypes';
import {
  chatConversationInScope,
  deleteChatConversation,
  deleteChatConversations,
  getChatSummary,
  listChatConversations,
  listChatMessages,
  migrateLegacyAgentConversations,
  readActiveChatConversationId,
  type ChatConversationScope,
  upsertChatAttachment,
  upsertChatConversation,
  upsertChatMessage,
  upsertChatSummary,
  upsertChatToolCall,
  writeActiveChatConversationId,
} from '../storage/chatStorage';
import { buildChatContext, buildSummaryRequestMessages } from '../context/chatContextBuilder';
import { getSelectedChatSkill } from '../skills/chatSkills';
import { estimateChatTokens } from '../context/chatContextBudget';
import type { ChatVisionAttachmentResolver } from '../attachments/chatVisionAttachmentResolver';
import { formatReferenceUploadFailureNotice } from '../../referenceUploadError';
import {
  getChatToolDefinitions,
  isChatAgentCreationFollowup,
  shouldForceChatAgentCreation,
  shouldExposeBatchImageOperation,
  shouldExposeWebSearch,
} from '../tools/chatToolDefinitions';
import { routeChatToolCall } from '../tools/chatToolRouter';
import { compactChatToolResult, compactChatToolResultForProvider, serializeChatToolResult } from '../tools/chatToolResult';
import { selectBatchImageAttachments } from '../tools/batchImageOperation';
import {
  normalizeImageVariants,
  resolveImageVariantToolRoute,
} from '../tools/imageVariantNormalization';
import { applyChatImageGenerationSettings } from './chatImageGenerationSettings';
import { summarizeCompletedBatchCall } from './chatBatchCompletion';
import {
  completedMediaToolIsMissingVisibleResult,
  finalizeOrphanedStreamingChatMessage,
  normalizeCompletedRhinoNativeMessage,
  summarizeCompletedVisibleToolCalls,
} from './chatVisibleToolCompletion';
import {
  buildWebSearchTurnInstruction,
  canAcceptWebSearchQuery,
  canRunChatToolRound,
  classifyChatProviderOutcome,
  EMPTY_CHAT_RESULT_ERROR,
  EMPTY_RESPONSE_RECOVERY_INSTRUCTION,
  chatToolRoundLimit,
  buildRhinoTurnInstruction,
  MAX_WEB_SEARCH_QUERIES_PER_TURN,
  normalizeWebSearchQuery,
} from './chatTurnPolicy';
import { extractChatBatchImagePlan } from './chatBatchImagePlan';
import { chatFileCreationTurnInstruction, getChatFileCreationTurn } from './chatFileCreationPolicy';
import { buildChatSearchContinuation, buildSearchSynthesisRecoveryTools, chatSearchModelFailureMessage, classifyEmptyChatContinuation, collectChatSearchEvidence } from './chatSearchContinuation';
import { isChatPresentationExportRequest } from '../presentations/chatPresentation';
import { mergePresentationToolCalls, needsPresentationDeliveryRecovery, presentationInterruptedMessage, resolvePresentationToolChoice, resolvePresentationTurnText, shouldContinuePresentationAfterMedia, validatePresentationImageCall } from '../presentations/presentationTurn';
import {
  fallbackBatchPlanDecision,
} from './chatBatchPlanReply';
import { isHistoricalImageContinuation, selectChatImageAttachments } from './chatHistoricalAttachments';
import { resolveChatReferenceArguments } from './chatReferenceArguments';
import { normalizeVisibleChatText } from './chatVisibleText';
import { repeatedGhLoopFailureAfterCorrection } from './rhinoGhFailureGuard';
import {
  appendChatStreamBuffers,
  createStreamingAssistantState,
  finalizeChatMessageState,
  upsertChatThinkingStep,
  type ChatStreamBuffers,
  type ChatThinkingStepPatch,
} from './chatThinkingRuntime';
import { getChatToolStepTitle } from '../tools/chatToolLabels';
import { buildRhinoWorkflowInstruction, isRhinoNativeRecoverableError, validateRhinoNativeArguments } from '../../rhino/rhinoWorkflow';
import { completedRhinoWriteReceipt, RHINO_SCRIPT_PREFLIGHT_REJECTION, RHINO_RUNTIME_COMPATIBILITY_REJECTION, RhinoNativeArgumentError, RhinoNativeScriptPreflightError, RhinoNativeRuntimeCompatibilityError, rhinoArgumentRejection, rhinoArgumentRepairCount, rhinoArgumentRepairInstruction, rhinoGhReflectionRecoveryState, unresolvedRhinoArgumentRejection } from '../../rhino/rhinoArgumentRecovery';
import { getRhinoNativeTool } from '../../rhino/rhinoProtocol';
import {
  createKeyedSerialTaskQueue,
  normalizeChatModelSelection,
  resolveChatRequestModel,
  type KeyedSerialTaskQueue,
} from './chatModelSelection';
import {
  resolveValidAgentModel,
  runInternalAgentModelRequest,
} from './agentModelResolution';
import {
  cancelChatCompletion,
  isChatRequestIdCurrent,
  isRecoverableChatRequestError,
  isUpstreamUnavailableChatError,
  normalizeChatStreamEvent,
  requestChatCompletion,
  type ChatProviderResult,
} from './chatStream';

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
  /** Stable design project ID, shared by related sessions. Omit for strict conversation isolation. */
  designMemoryProjectId?: string | null;
  model: string;
  modelOptions?: string[];
  serverManagedChannelFailover?: boolean;
  imageModel?: string;
  imageAspectRatio?: string;
  imageResolution?: string;
  imageQuality?: string;
  imageModelOptions?: Array<{ value: string; label?: string; hint?: string; aspectRatios?: string[]; aspectRatiosByResolution?: Record<string, string[]>; resolutions?: string[]; supportedQualities?: string[]; supportsMask?: boolean }>;
  imageMaskMode?: 'off' | 'on';
  imageMaskAttachmentId?: string;
  imageAspectRatioOptions?: string[];
  imageResolutionOptions?: string[];
  approvalMode?: 'ask' | 'auto';
  executeTool: ChatToolExecutor;
  additionalTools?: (conversationId: string, executionSource?: ChatExecutionSource) => ReturnType<typeof getChatToolDefinitions>;
  conversationScope?: ChatConversationScope;
  defaultExecutionSource?: ChatExecutionSource;
  resolveAttachmentUrl?: (attachment: ChatAttachment) => Promise<string>;
  createVisionAttachmentResolver?: () => ChatVisionAttachmentResolver;
  prepareAttachment?: (attachment: PendingChatAttachment) => Promise<PendingChatAttachment>;
  onNotice?: (message: string) => void;
  onGeneratedMediaReady?: (media: ChatGeneratedMedia, origin: { conversationId: string }) => void | Promise<void>;
  onBatchStarted?: (payload: ChatBatchStartedPayload) => void | Promise<void>;
  onBatchMediaReady?: (payload: ChatBatchMediaReadyPayload) => void | Promise<void>;
  onBatchCompleted?: (payload: ChatBatchCompletedPayload) => void | Promise<void>;
  cloudWalletMode?: boolean;
  onWalletSettlementComplete?: () => void;
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
  emptyRecoveryCount: number;
  executionSource: ChatExecutionSource;
};

type ActiveChatRequest = {
  requestId: string;
  conversationId: string;
  messageId: string;
  streamed: boolean;
  streamedContent: boolean;
  streamedReasoning: boolean;
};

type ActiveBatchRun = {
  callId: string;
  messageId: string;
  controller: AbortController;
};

const PAGE_SIZE = 50;
const SUMMARY_TRIGGER_TOKENS = 18_000;
const SUMMARY_TRIGGER_MESSAGES = 36;
const SUMMARY_KEEP_RECENT = 28;
const LEGACY_PROVIDER_MODELS = new Set(['codex', 'openai-compatible', 'default']);
const CHAT_WEB_SEARCH_ENABLED_STORAGE_KEY = 'drawer_chat_web_search_enabled';
const STREAM_RENDER_INTERVAL_MS = 64;

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

const trimConversationTitle = firstRequestTitle;

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

const visibleChatRequestError = (error: unknown) => {
  const detail = String(error instanceof Error ? error.message : error || '未知错误')
    .replace(/^Error:\s*/i, '')
    .trim();
  return `请求未完成：${(detail || '未知错误').slice(0, 500)}`;
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
    const query = normalizeWebSearchQuery(String(fn.arguments || '{}'));
    return query ? [query] : [];
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

const RHINO_RECOVERABLE_NATIVE_READ_TOOLS = new Set([
  'get_context', 'get_selection', 'get_commands', 'list_objects', 'get_viewport_image',
  'g1_search_components', 'g1_describe_component', 'g1_get_canvas_graph',
  'g2_search_components', 'g2_describe_component', 'g2_get_canvas_graph',
]);
const isRecoverableRhinoNativeReadFailure = (toolName: string, conversationId?: string) => {
  const registered = conversationId ? getRhinoNativeTool(toolName, conversationId) : undefined;
  return registered ? isRhinoNativeRecoverableError(registered) : isRhinoNativeRecoverableError(toolName)
    || (toolName.startsWith('rhino_native_') && RHINO_RECOVERABLE_NATIVE_READ_TOOLS.has(toolName.slice('rhino_native_'.length)));
};

const inferRhinoComponentQuery = (userText: string) => {
  const text = userText.toLocaleLowerCase();
  if (text.includes('sphere') || text.includes('\u7403')) return 'Sphere';
  if (text.includes('square') || text.includes('\u6b63\u65b9\u5f62')) return 'Square';
  if (text.includes('circle') || text.includes('\u5706')) return 'Circle';
  if (text.includes('line') || text.includes('\u76f4\u7ebf')) return 'Line';
  if (text.includes('rectangle') || text.includes('\u77e9\u5f62')) return 'Rectangle';
  return '';
};

const normalizeRhinoNativeArguments = (toolName: string, args: Record<string, unknown>, userText: string) => {
  if (toolName === 'rhino_native_g1_search_components' || toolName === 'rhino_native_g2_search_components') {
    if (!String(args.query || '').trim()) {
      const query = inferRhinoComponentQuery(userText);
      if (query) return { ...args, query, limit: Number(args.limit) > 0 ? args.limit : 10 };
    }
  }
  if (toolName === 'rhino_native_g1_describe_component' || toolName === 'rhino_native_g2_describe_component') {
    if (!String(args.name || '').trim()) {
      const name = inferRhinoComponentQuery(userText);
      if (name) return { ...args, name };
    }
  }
  return args;
};

const rhinoVisualToolNames = new Set(['generate_image', 'edit_image']);
const findAttachmentRole = (attachments: ChatAttachment[], role: string) => attachments.find(attachment => {
  try { return JSON.parse(attachment.metadataJson || '{}').role === role; } catch { return false; }
});

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

export function useChatRuntime(options: UseChatRuntimeOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const conversationScope = options.conversationScope || 'desktop';

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
  const [nextBeforeId, setNextBeforeId] = useState<string | undefined>();
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
  const designMemoryTurnsRef = useRef(new Map<string, DesignMemoryKind[]>());
  const recoverableRequestIdsRef = useRef(new Map<string, string>());
  const activeBatchRunsRef = useRef(new Map<string, ActiveBatchRun>());
  const pendingApprovalsRef = useRef(new Map<string, PendingApprovalRun>());
  const activeToolMessagesRef = useRef(new Map<string, string>());
  const cancelledToolRunsRef = useRef(new Set<string>());
  const persistTimersRef = useRef(new Map<string, number>());
  const streamBuffersRef = useRef(new Map<string, ChatStreamBuffers>());
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
      || (activeToolMessagesRef.current.has(conversationId) && !cancelledToolRunsRef.current.has(conversationId))
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

  const setConversationModel = useCallback((model: string, targetConversationId?: string) => {
    const conversation = conversationsRef.current.find(
      item => item.id === (targetConversationId || activeConversationIdRef.current),
    );
    if (!conversation
      || busyConversationIdsRef.current.has(conversation.id)
      || pendingApprovalsRef.current.has(conversation.id)) {
      return Promise.resolve(false);
    }
    return applyConversationModel(conversation, model);
  }, [applyConversationModel]);

  const authoritativeModelOptions = options.modelOptions;
  useEffect(() => {
    if (!authoritativeModelOptions || authoritativeModelOptions.length === 0) return;
    const staleConversations = conversationsRef.current.flatMap(conversation => {
      const resolution = resolveValidAgentModel({
        savedModel: conversation.model,
        availableModels: authoritativeModelOptions,
        usageContext: 'chat',
      });
      return conversation.model !== resolution.resolvedModel
        ? [{ conversation, model: resolution.resolvedModel }]
        : [];
    });
    staleConversations.forEach(({ conversation, model }) => {
      void applyConversationModel(conversation, model);
    });
  }, [applyConversationModel, authoritativeModelOptions, conversations]);

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

  const patchThinkingStep = useCallback((
    messageId: string,
    key: string,
    step: ChatThinkingStepPatch,
    immediate = false,
  ) => {
    patchMessage(messageId, message => upsertChatThinkingStep(message, key, step), immediate);
  }, [patchMessage]);

  const flushStreamDelta = useCallback((messageId: string) => {
    const timer = streamFlushTimersRef.current.get(messageId);
    if (timer !== undefined) window.clearTimeout(timer);
    streamFlushTimersRef.current.delete(messageId);
    const buffered = streamBuffersRef.current.get(messageId) || {};
    streamBuffersRef.current.delete(messageId);
    if (!buffered.content && !buffered.reasoning) return;
    patchMessage(messageId, message => appendChatStreamBuffers(message, buffered));
  }, [patchMessage]);

  // Memory revocation is immediate locally and propagated across native webviews.
  useEffect(() => {
    void connectDesignMemoryEvents();
    return designMemory.subscribe(event => {
      for (const [conversationId, usedKinds] of designMemoryTurnsRef.current) {
        if (!event.kinds.some(kind => usedKinds.includes(kind))) continue;
        designMemoryTurnsRef.current.delete(conversationId);
        const active = activeRequestsRef.current.get(conversationId);
        const pending = pendingApprovalsRef.current.get(conversationId);
        activeRequestsRef.current.delete(conversationId);
        pendingApprovalsRef.current.delete(conversationId);
        recoverableRequestIdsRef.current.delete(conversationId);
        if (pending) {
          pending.calls.forEach(call => {
            if (call.status !== 'pending' && call.status !== 'awaiting-approval') return;
            call.status = 'cancelled'; call.completedAt = Date.now();
            call.resultJson = serializeChatToolResult({ cancelled: true, reason: '设计记忆已关闭或更新' });
            void upsertChatToolCall(call).catch(() => {});
          });
        }
        const messageId = active?.messageId || pending?.assistantMessageId;
        if (messageId) {
          flushStreamDelta(messageId);
          patchMessage(messageId, message => finalizeChatMessageState({
            ...message,
            content: message.content.trim() || '设计记忆已关闭或更新，已停止本轮回复。',
          }, 'cancelled', Date.now(), '设计记忆已更新'), true);
          if (!activeBatchRunsRef.current.has(conversationId)) updateConversationBusy(conversationId, false);
        }
        if (active) void cancelChatCompletion(active.requestId).catch(() => {});
      }
    });
  }, [flushStreamDelta, patchMessage, updateConversationBusy]);

  const queueStreamDelta = useCallback((
    messageId: string,
    kind: 'content' | 'reasoning',
    delta: string,
  ) => {
    const current = streamBuffersRef.current.get(messageId) || {};
    streamBuffersRef.current.set(messageId, {
      ...current,
      [kind]: `${current[kind] || ''}${delta}`,
    });
    if (streamFlushTimersRef.current.has(messageId)) return;
    const timer = window.setTimeout(() => flushStreamDelta(messageId), STREAM_RENDER_INTERVAL_MS);
    streamFlushTimersRef.current.set(messageId, timer);
  }, [flushStreamDelta]);

  const refreshConversations = useCallback(async (query = searchQuery) => {
    const next = (await listChatConversations(query, 500, 0)).filter(conversation => chatConversationInScope(conversation, conversationScope));
    conversationsRef.current = next;
    setConversations(next);
    return next;
  }, [conversationScope, searchQuery]);

  const loadConversation = useCallback(async (conversationId: string) => {
    if (!conversationId) return;
    const scopedConversation = conversationsRef.current.find(item => item.id === conversationId);
    if (!scopedConversation || !chatConversationInScope(scopedConversation, conversationScope)) {
      optionsRef.current.onNotice?.('???????? Chat ????????????');
      return;
    }
    const loadVersion = conversationLoadVersionRef.current + 1;
    conversationLoadVersionRef.current = loadVersion;
    setLoading(true);
    try {
      const [page, nextSummary] = await Promise.all([
        listChatMessages(conversationId, { limit: PAGE_SIZE }),
        getChatSummary(conversationId),
      ]);
      if (conversationLoadVersionRef.current !== loadVersion) return;
      const resolvedMessages = page.messages.map(message => {
        const resolved = messageCacheRef.current.get(message.id) || message;
        const activeRequest = activeRequestsRef.current.get(conversationId);
        const activeBatch = activeBatchRunsRef.current.get(conversationId);
        const isStillActive = activeRequest?.messageId === resolved.id
          || activeBatch?.messageId === resolved.id
          || activeToolMessagesRef.current.get(conversationId) === resolved.id
          || pendingApprovalsRef.current.get(conversationId)?.assistantMessageId === resolved.id;
        if (isStillActive) return resolved;
        const latestUserText = [...page.messages].reverse().find(previous => previous.role === 'user' && previous.createdAt <= resolved.createdAt)?.content || '';
        const recovered = normalizeCompletedRhinoNativeMessage(finalizeOrphanedStreamingChatMessage(
          resolved, Date.now(), resolvePresentationTurnText(latestUserText, page.messages.filter(previous => previous.createdAt <= resolved.createdAt)),
        ));
        if (recovered !== resolved) {
          persistMessageSoon(recovered, true);
          recovered.toolCalls.forEach((call, index) => {
            if (call === resolved.toolCalls[index]) return;
            void upsertChatToolCall(call).catch(error => console.warn('Failed to persist interrupted Chat tool state:', error));
          });
        }
        return recovered;
      });
      cacheMessages(resolvedMessages);
      activeConversationIdRef.current = conversationId;
      setActiveConversationId(conversationId);
      writeActiveChatConversationId(conversationId, optionsRef.current.conversationScope || 'desktop');
      messagesRef.current = resolvedMessages;
      setMessages(resolvedMessages);
      setHasMoreMessages(page.hasMore);
      setNextBeforeCreatedAt(page.nextBeforeCreatedAt ?? undefined);
      setNextBeforeId(page.nextBeforeId ?? undefined);
      summaryRef.current = nextSummary;
      setSummary(nextSummary);
      syncActiveConversationActivity(conversationId);
    } finally {
      if (conversationLoadVersionRef.current === loadVersion) setLoading(false);
    }
  }, [cacheMessages, conversationScope, persistMessageSoon, syncActiveConversationActivity]);

  const createConversation = useCallback(async (
    model = optionsRef.current.model,
    title = '新对话',
  ) => {
    conversationLoadVersionRef.current += 1;
    setLoading(false);
    const now = Date.now();
    const conversation: ChatConversation = {
      id: createChatId(optionsRef.current.conversationScope === 'rhino' ? 'rhino-chat-conversation' : 'chat-conversation'),
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
    writeActiveChatConversationId(conversation.id, optionsRef.current.conversationScope || 'desktop');
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
        let next = (await listChatConversations('', 500, 0)).filter(conversation => chatConversationInScope(conversation, conversationScope));
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
        const storedId = readActiveChatConversationId(conversationScope);
        const activeId = next.some(item => item.id === storedId) ? storedId : next[0].id;
        await loadConversation(activeId);
      } catch (error) {
        optionsRef.current.onNotice?.(`读取本地聊天失败：${String(error)}`);
        setLoading(false);
      }
    })();
    return () => { disposed = true; };
  }, [conversationScope, createConversation, loadConversation]);

  useEffect(() => {
    const unlisten = listen<Record<string, unknown>>('agent-openai-stream', event => {
      const streamEvent = normalizeChatStreamEvent(event.payload);
      if (!streamEvent) return;
      const requestId = streamEvent.requestId;
      const active = [...activeRequestsRef.current.values()]
        .find(request => request.requestId === requestId);
      if (!active) return;
      if (streamEvent.kind === 'content_delta' || streamEvent.kind === 'reasoning_delta') {
        const delta = streamEvent.delta || '';
        if (!delta) return;
        active.streamed = true;
        if (streamEvent.kind === 'content_delta') active.streamedContent = true;
        else active.streamedReasoning = true;
        queueStreamDelta(
          active.messageId,
          streamEvent.kind === 'content_delta' ? 'content' : 'reasoning',
          delta,
        );
        return;
      }
      if (streamEvent.kind === 'tool_call_delta' || streamEvent.kind === 'tool_started') {
        const toolName = streamEvent.toolName || '';
        const toolIndex = Math.max(0, streamEvent.toolIndex || 0);
        patchThinkingStep(active.messageId, `tool-${toolIndex}`, {
          type: toolName === 'web_search' ? 'search' : 'tool',
          title: getChatToolStepTitle(toolName, 'running'),
          detail: '模型正在准备工具调用',
          status: 'running',
        });
        return;
      }
      if (streamEvent.kind === 'tool_completed') {
        const toolName = streamEvent.toolName || '';
        const toolIndex = Math.max(0, streamEvent.toolIndex || 0);
        patchThinkingStep(active.messageId, `tool-${toolIndex}`, {
          type: toolName === 'web_search' ? 'search' : 'tool',
          title: getChatToolStepTitle(toolName, 'completed'),
          status: 'completed',
        });
        return;
      }
      if (streamEvent.kind === 'status') {
        const stage = streamEvent.stage || 'running';
        const title = stage === 'queued'
          ? '请求已进入后台队列'
          : stage === 'reconnecting'
            ? '正在恢复服务连接'
            : '正在等待上游处理';
        patchThinkingStep(active.messageId, 'provider-status', {
          type: 'context',
          title,
          detail: streamEvent.progress && streamEvent.progress > 0
            ? `处理进度 ${Math.round(streamEvent.progress)}%`
            : undefined,
          status: streamEvent.status === 'failed'
            ? 'error'
            : streamEvent.status === 'cancelled'
              ? 'cancelled'
              : streamEvent.status === 'succeeded'
                ? 'completed'
                : 'running',
        });
        return;
      }
      if (streamEvent.kind === 'usage' && streamEvent.usage) {
        const nextUsage = normalizeUsage(streamEvent.usage);
        if (activeConversationIdRef.current === active.conversationId) setUsage(nextUsage);
        patchMessage(active.messageId, message => ({ ...message, usage: nextUsage }));
        return;
      }
      if (streamEvent.kind === 'completed') {
        patchThinkingStep(active.messageId, 'answer', {
          type: 'finalizing',
          title: '正在整理回答',
          status: 'running',
        });
        return;
      }
      if (streamEvent.kind === 'error') {
        flushStreamDelta(active.messageId);
        patchThinkingStep(active.messageId, 'connection', {
          type: 'context',
          title: '连接中断',
          detail: streamEvent.error || '流式响应提前结束',
          status: 'error',
        }, true);
      }
    });
    return () => { void unlisten.then(dispose => dispose()); };
  }, [flushStreamDelta, patchMessage, patchThinkingStep, queueStreamDelta]);

  useEffect(() => () => {
    persistTimersRef.current.forEach(timer => window.clearTimeout(timer));
    streamFlushTimersRef.current.forEach(timer => window.clearTimeout(timer));
    streamFlushTimersRef.current.clear();
    streamBuffersRef.current.clear();
  }, []);

  const loadOlderMessages = useCallback(async () => {
    const conversationId = activeConversationIdRef.current;
    if (!conversationId || !hasMoreMessages || nextBeforeCreatedAt === undefined || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await listChatMessages(conversationId, {
        beforeCreatedAt: nextBeforeCreatedAt,
        beforeId: nextBeforeId,
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
      setNextBeforeCreatedAt(page.nextBeforeCreatedAt ?? undefined);
      setNextBeforeId(page.nextBeforeId ?? undefined);
    } finally {
      setLoadingOlder(false);
    }
  }, [cacheMessages, hasMoreMessages, loadingOlder, nextBeforeCreatedAt, nextBeforeId]);

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
      const memoryTicket = await beginChatDesignSummaryMemory(conversationId, unsummarized).catch(() => null);
      const memoryProjectId = optionsRef.current.designMemoryProjectId;
      const memoryTitle = conversationsRef.current.find(item => item.id === conversationId)?.title;
      const requestId = createChatId('chat-summary');
      const savedModel = conversationsRef.current.find(item => item.id === conversationId)?.model
        || optionsRef.current.model;
      const result = await runInternalAgentModelRequest({
        savedModel,
        usageContext: 'system_internal',
        requestId,
        createRequestId: () => createChatId('chat-summary-model-fallback'),
        request: requestModel => requestChatCompletion({
          requestId: requestModel.requestId,
          messages: buildSummaryRequestMessages(currentSummary, unsummarized),
          tools: [],
          model: requestModel.model,
          usageContext: requestModel.usageContext,
          stream: false,
        }),
      });
      if (!result.content.trim()) return;
      const next: ChatSummary = {
        conversationId,
        summary: result.content.trim(),
        throughMessageId: through.id,
        updatedAt: Date.now(),
      };
      await upsertChatSummary(next);
      await completeChatDesignSummaryMemory(memoryTicket, next, { title: memoryTitle, projectId: memoryProjectId }).catch(() => {});
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
    resumeRequestId?: string,
    emptyRecoveryCount?: number,
    executionSource?: ChatExecutionSource,
  ) => Promise<void>>(async () => {});

  const continueToolCalls = useCallback(async (run: PendingApprovalRun, approvedCallId?: string) => {
    activeToolMessagesRef.current.set(run.conversationId, run.assistantMessageId);
    if (activeConversationIdRef.current === run.conversationId) syncActiveConversationActivity(run.conversationId);
    try {
      let index = run.index;
      const toolMessages = [...run.toolMessages];
      const rhinoVisionMessages: Array<Record<string, unknown>> = [];
      for (; index < run.calls.length; index += 1) {
        if (cancelledToolRunsRef.current.has(run.conversationId)) {
          for (const skipped of run.calls.slice(index).filter(item => item.status === 'pending')) {
            skipped.status = 'cancelled';
            skipped.completedAt = Date.now();
            skipped.resultJson = serializeChatToolResult({ cancelled: true, error: 'Cancelled before dispatch; an already-running Rhino tool was not replayed.' });
            await upsertChatToolCall(skipped).catch(() => {});
          }
          patchMessage(run.assistantMessageId, message => finalizeChatMessageState({
            ...message,
            toolCalls: mergePresentationToolCalls(message.toolCalls, run.calls),
            content: message.content.trim() || 'Rhino ?????????????????????????????',
          }, 'cancelled', Date.now(), 'Rhino workflow stopped after the current native call'), true);
          cancelledToolRunsRef.current.delete(run.conversationId);
          updateConversationBusy(run.conversationId, false);
          return;
        }
        if (run.executionSource === 'rhino' && index > run.index) {
          const priorCalls = getConversationMessages(run.conversationId).find(message => message.id === run.assistantMessageId)?.toolCalls || [];
          if (repeatedGhLoopFailureAfterCorrection(priorCalls, run.calls.slice(run.index, index))) {
            for (const skipped of run.calls.slice(index)) {
              skipped.status = 'cancelled';
              skipped.completedAt = Date.now();
              skipped.resultJson = serializeChatToolResult({ cancelled: true, error: 'Stopped before dispatch because the GH loop-closure error persisted after correction.' });
              await upsertChatToolCall(skipped).catch(() => {});
            }
            break;
          }
        }
        await validateDesignMemoryMessages(run.providerMessages);
        const call = run.calls[index];
        patchThinkingStep(run.assistantMessageId, `tool-${index}`, {
          type: call.toolName === 'web_search' ? 'search' : 'tool',
          title: getChatToolStepTitle(call.toolName, 'pending'),
          detail: '工具调用已准备',
          status: 'pending',
        });
        const batchController = ['batch_image_operation', 'generate_image_variants'].includes(call.toolName)
          ? new AbortController()
          : null;
        const notifiedMediaIds = new Set<string>();
        let batchAttachments: ChatAttachment[] = [];
        let batchOutputCount = 1;
        let batchTotal = 0;
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
                    await optionsRef.current.onGeneratedMediaReady?.(media, { conversationId: run.conversationId });
                  }
                } catch (error) {
                  console.warn('Chat 批量生成结果加入画布失败:', error);
                }
              }
            }
            return;
          }
          if (call.toolName === 'generate_image_variants' && batchStarted) {
            let parsed: Record<string, unknown> = {};
            try {
              parsed = JSON.parse(call.resultJson || '{}') as Record<string, unknown>;
            } catch (_) {
              return;
            }
            const results = (Array.isArray(parsed.results) ? parsed.results : [])
              .filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object'))
              .sort((left, right) => Number(left.variantIndex) - Number(right.variantIndex));
            for (const result of results) {
              const sourceIndex = Number(result.variantIndex);
              if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= batchTotal) continue;
              const generatedMedia = getGeneratedMediaFromToolCall({
                ...call,
                resultJson: serializeChatToolResult({ media: result.media }),
              }).filter(media => media.type === 'image').slice(0, 1);
              for (const media of generatedMedia) {
                const enrichedMedia = {
                  ...media,
                  name: media.name || String(result.name || '').trim() || `方案 ${sourceIndex + 1}`,
                  prompt: media.prompt || String(result.prompt || '').trim() || undefined,
                };
                const notificationId = `variant:${sourceIndex}:${media.id}`;
                if (notifiedMediaIds.has(notificationId)) continue;
                notifiedMediaIds.add(notificationId);
                try {
                  if (optionsRef.current.onBatchMediaReady) {
                    await optionsRef.current.onBatchMediaReady({
                      batchId: call.id,
                      media: enrichedMedia,
                      attachmentId: `variant-${sourceIndex}`,
                      sourceIndex,
                      outputIndex: 0,
                      slotIndex: sourceIndex,
                      total: batchTotal,
                    });
                  } else {
                    await optionsRef.current.onGeneratedMediaReady?.(enrichedMedia, { conversationId: run.conversationId });
                  }
                } catch (error) {
                  console.warn('Chat 独立方案结果加入画布失败:', error);
                }
              }
            }
            return;
          }
          const generatedMedia = getGeneratedMediaFromToolCall(call);
          for (const media of generatedMedia) {
            if (notifiedMediaIds.has(media.id)) continue;
            notifiedMediaIds.add(media.id);
            try {
              await optionsRef.current.onGeneratedMediaReady?.(media, { conversationId: run.conversationId });
            } catch (error) {
              console.warn('Chat 生成结果自动加入画布失败:', error);
            }
          }
        };
        const notifyBatchCompleted = async (cancelled: boolean) => {
          if (!['batch_image_operation', 'generate_image_variants'].includes(call.toolName) || !batchStarted) return;
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
            if (call.toolName === 'generate_image_variants') {
              const variantIndex = Number(result.variantIndex);
              return Number.isInteger(variantIndex) && variantIndex >= 0 ? [variantIndex] : [];
            }
            const sourceIndex = attachmentIndexById.get(String(result.attachmentId || '').trim());
            return sourceIndex === undefined ? [] : [sourceIndex];
          });
          const completedSlots = results.reduce((total, result) => (
            total + (Array.isArray(result.media) ? result.media.length : 0)
          ), 0);
          try {
            await optionsRef.current.onBatchCompleted?.({
              batchId: call.id,
              total: batchTotal,
              completedSlots,
              failedSourceIndexes,
              cancelled,
            });
          } catch (error) {
            console.warn('Chat 批量画布编组收尾失败:', error);
          }
        };
        let args: Record<string, unknown> = {};
        const native = run.executionSource === 'rhino' ? getRhinoNativeTool(call.toolName, run.conversationId) : undefined;
        let nativeDispatched = false;
        let rejectedNativeArguments = false;
        let rejectedGeometry = false;
        let compatibilityRejected = false;
        let scriptRejected = false;
        try {
          try { args = parseArguments(call.argumentsJson); }
          catch (error) {
            if (native) throw new RhinoNativeArgumentError(String(error));
            throw error;
          }
          if (run.executionSource === 'rhino') {
            args = normalizeRhinoNativeArguments(call.toolName, args, run.userText);
            if (call.toolName === VERIFY_GH_TOOL && (!Array.isArray(args.componentIds) || args.componentIds.length === 0)) {
              const priorCalls=getConversationMessages(run.conversationId).find(message=>message.id===run.assistantMessageId)?.toolCalls||[];
              args={...args,componentIds:collectGhPythonComponentIds(priorCalls)};
            }
            if (native) {
              const validation = validateRhinoNativeArguments(native, args);
              if (!validation.valid) throw new RhinoNativeArgumentError(validation.message);
            }
          }
          const conversationMessages = getConversationMessages(run.conversationId);
          const presentationText = resolvePresentationTurnText(run.userText, conversationMessages);
          const previousCalls = conversationMessages.find(message => message.id === run.assistantMessageId)?.toolCalls || [];
          validatePresentationImageCall(presentationText, call.toolName, args, previousCalls.filter(previous => previous.id !== call.id));
          const generated = latestGeneratedMedia(conversationMessages);
          const currentImageAttachments = selectChatImageAttachments(
            conversationMessages,
            run.userText,
          ).attachments;
          const rhinoMaskAttachment = run.executionSource === 'rhino' ? findAttachmentRole(currentImageAttachments, 'mask') : undefined;
          const forceRhinoCanvasMask = Boolean(rhinoMaskAttachment && rhinoVisualToolNames.has(call.toolName));
          if ((optionsRef.current.imageMaskMode === 'on' || forceRhinoCanvasMask)
            && !String(optionsRef.current.imageMaskAttachmentId || '').trim()
            && !String(args.maskAttachmentId || '').trim()) {
            if (rhinoMaskAttachment) args.maskAttachmentId = rhinoMaskAttachment.id;
          }
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
          if (call.toolName === 'generate_image_variants') {
            const route = resolveImageVariantToolRoute({ args, requireMultiple: false });
            call.toolName = route.toolName;
            args = route.args;
          }
          if (call.toolName === 'generate_image' || call.toolName === 'generate_image_variants' || call.toolName === 'edit_image' || call.toolName === 'generate_video' || call.toolName === 'batch_image_operation') {
            if ((optionsRef.current.imageMaskMode === 'on' || forceRhinoCanvasMask)
              && (call.toolName === 'generate_image_variants' || call.toolName === 'batch_image_operation' || call.toolName === 'generate_video')) {
              throw new Error('当前 Beta 的 Mask 编辑仅支持单张图片生成/编辑；请关闭 Mask 或改为单张图片任务。');
            }
            const imageSettings = forceRhinoCanvasMask
              ? { ...optionsRef.current, imageMaskMode: 'on' as const, imageMaskAttachmentId: rhinoMaskAttachment?.id }
              : optionsRef.current;
            args = applyChatImageGenerationSettings(args, imageSettings);
            const maskAttachmentId = String(args.maskAttachmentId || '').trim();
            if (maskAttachmentId) {
              const maskAttachment = currentImageAttachments.find(attachment => attachment.id === maskAttachmentId)
                || currentImageAttachments.find(attachment => {
                  try { return JSON.parse(attachment.metadataJson || '{}').role === 'mask'; } catch { return false; }
                });
              if (!maskAttachment) throw new Error('所选 Mask 图片不在本轮附件中，请重新附加后再试。');
              args.maskImage = maskAttachment.path;
              if (Array.isArray(args.referenceImages)) {
                args.referenceImages = args.referenceImages.map(String).filter(source => source.trim() !== maskAttachment.path.trim());
              }
              delete args.maskAttachmentId;
            }
          }
          call.argumentsJson = JSON.stringify(args);
          if (call.toolName === 'batch_image_operation') {
            batchAttachments = selectBatchImageAttachments(
              currentImageAttachments,
              Array.isArray(args.attachmentIds) ? args.attachmentIds.map(String) : undefined,
            );
            batchOutputCount = Math.min(4, Math.max(1, Math.round(Number(args.outputCountPerImage) || 1)));
            batchTotal = batchAttachments.length * batchOutputCount;
            batchStarted = true;
            try {
              await optionsRef.current.onBatchStarted?.({
                batchId: call.id,
                name: createBatchGroupName(String(args.instruction || run.userText)),
                instruction: String(args.instruction || run.userText).trim(),
                attachmentIds: batchAttachments.map(attachment => attachment.id),
                total: batchTotal,
                outputCountPerImage: batchOutputCount,
                aspectRatio: String(args.aspectRatio || '').trim() || undefined,
              });
            } catch (error) {
              console.warn('Chat 批量画布占位编组创建失败:', error);
            }
          }
          if (call.toolName === 'generate_image_variants') {
            const variants = normalizeImageVariants(args.variants);
            if (variants.length >= 2) {
              batchOutputCount = 1;
              batchTotal = variants.length;
              batchStarted = true;
              try {
                await optionsRef.current.onBatchStarted?.({
                  batchId: call.id,
                  name: createBatchGroupName(variants.map(variant => variant.name).join('、')),
                  instruction: String(args.sharedRequirements || run.userText).trim(),
                  attachmentIds: variants.map((_, variantIndex) => `variant-${variantIndex}`),
                  total: batchTotal,
                  outputCountPerImage: 1,
                  aspectRatio: String(args.aspectRatio || '').trim() || undefined,
                });
              } catch (error) {
                console.warn('Chat 独立方案画布占位编组创建失败:', error);
              }
            }
          }
          const approved = approvedCallId === call.id;
          const routed = await routeChatToolCall({
            name: call.toolName,
            args,
            context: {
              userText: run.userText,
              executionSource: run.executionSource,
              conversationId: run.conversationId,
              messageId: run.assistantMessageId,
              recentMessages: conversationMessages,
              currentUserAttachments: currentImageAttachments,
              signal: batchController?.signal,
              onProgress: value => {
                progressQueue = progressQueue.then(async () => {
                  call.resultJson = serializeChatToolResult(compactChatToolResult(call.toolName, value));
                  await upsertChatToolCall(call);
                  patchMessage(run.assistantMessageId, message => ({ ...message, toolCalls: mergePresentationToolCalls(message.toolCalls, run.calls) }));
                  await notifyGeneratedMedia();
                });
                return progressQueue;
              },
            },
            executor: async (name, finalArgs, context) => {
              const previous = native && completedRhinoWriteReceipt(
                getConversationMessages(run.conversationId).find(message => message.id === run.assistantMessageId)?.toolCalls || [], native, finalArgs,
              );
              if (previous) return { ...JSON.parse(previous.resultJson!), reusedCompletedReceipt: true, originalToolCallId: previous.id };
              nativeDispatched = Boolean(native);
              return optionsRef.current.executeTool(name, finalArgs, context);
            },
            approvalMode: optionsRef.current.approvalMode,
            approved,
            onExecuting: async () => {
              call.status = 'running';
              patchThinkingStep(run.assistantMessageId, `tool-${index}`, {
                type: call.toolName === 'web_search' ? 'search' : 'tool',
                title: getChatToolStepTitle(call.toolName, 'running'),
                detail: '正在等待工具结果',
                status: 'running',
              });
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
              patchMessage(run.assistantMessageId, message => ({ ...message, toolCalls: mergePresentationToolCalls(message.toolCalls, run.calls) }));
            },
          });
          if (routed.requiresApproval) {
            call.status = 'awaiting-approval';
            patchThinkingStep(run.assistantMessageId, `tool-${index}`, {
              type: call.toolName === 'web_search' ? 'search' : 'tool',
              title: getChatToolStepTitle(call.toolName, 'awaiting-approval'),
              detail: '需要用户确认后继续',
              status: 'awaiting-approval',
            }, true);
            await upsertChatToolCall(call);
            patchMessage(run.assistantMessageId, message => ({ ...message, toolCalls: mergePresentationToolCalls(message.toolCalls, run.calls) }), true);
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
          const observed = splitRhinoVisionObservation(call.toolName, routed.result);
          if (observed.observation && run.executionSource === 'rhino') rhinoVisionMessages.push(observed.observation);
          const resultJson = serializeChatToolResult(observed.result);
          call.resultJson = resultJson;
          const resultRecord = observed.result && typeof observed.result === 'object'
            ? observed.result as Record<string, unknown>
            : {};
          call.status = resultRecord.cancelled === true ? 'cancelled' : 'completed';
          if (completedMediaToolIsMissingVisibleResult(call)) {
            call.status = 'error';
            call.resultJson = serializeChatToolResult({
              ...resultRecord,
              incomplete: true,
              error: '媒体工具未返回有效的图片或视频结果',
            });
          }
          call.completedAt = Date.now();
          patchThinkingStep(run.assistantMessageId, `tool-${index}`, {
            type: call.toolName === 'web_search' ? 'search' : 'tool',
            title: getChatToolStepTitle(call.toolName, call.status),
            status: call.status,
          });
          await upsertChatToolCall(call);
          toolMessages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: call.status === 'error'
              ? call.resultJson
              : serializeChatToolResult(compactChatToolResultForProvider(call.toolName, observed.result)),
          });
          if (call.toolName === 'generate_image' || call.toolName === 'generate_image_variants' || call.toolName === 'edit_image' || call.toolName === 'batch_image_operation') {
            await notifyGeneratedMedia();
          }
          await notifyBatchCompleted(call.status === 'cancelled');
        } catch (error) {
          call.status = batchController?.signal.aborted ? 'cancelled' : 'error';
          const geometryRejected = rejectedGeometry = Boolean(native && call.toolName === SAFE_PROFILE_TOOL && error instanceof RhinoGeometryPreflightError);
          compatibilityRejected = Boolean(native && nativeDispatched && error instanceof RhinoNativeRuntimeCompatibilityError);
          scriptRejected = Boolean(native && error instanceof RhinoNativeScriptPreflightError);
          rejectedNativeArguments = geometryRejected || compatibilityRejected || scriptRejected || Boolean(native && !nativeDispatched && error instanceof RhinoNativeArgumentError);
          call.resultJson = serializeChatToolResult(batchController?.signal.aborted
            ? { cancelled: true, error: '???????????' }
            : geometryRejected ? { kind: GEOMETRY_PREFLIGHT_REJECTION, toolName: call.toolName, correctionTool: call.toolName,
              ...geometryFailureReceipt((error as RhinoGeometryPreflightError).receipt, args), error: String(error), instruction: 'A typed local or trusted-kernel preflight confirms zero document writes. Read inputPaths, priorIssues and repairPolicy; correct the actual conflicting geometry within the bounded budget. Preserve intended dimensions, holes and minimum walls. No blind replay of commits or uncertain raw scripts.' }
            : compatibilityRejected ? { kind: RHINO_RUNTIME_COMPATIBILITY_REJECTION, toolName: call.toolName,
              correctionTool: (error as RhinoNativeRuntimeCompatibilityError).correctionTool, dispatched: true, scriptExecuted: false,
              documentChanged: false, geometryVerification: (error as RhinoNativeRuntimeCompatibilityError).geometryVerification,
              error: String(error), instruction: 'Rhino confirmed the C# script failed during host assembly loading before script execution and the document geometry snapshot is unchanged. Do not call run_csharp again. Translate the intended geometry operation to rhino_native_run_python once, then verify.' }
            : rejectedNativeArguments ? rhinoArgumentRejection(native!, error as Error) : { error: String(error), ...(error instanceof RhinoDocumentGeometryWriteError ? { geometryVerification: error.geometryVerification } : {}) });
          call.completedAt = Date.now();
          patchThinkingStep(run.assistantMessageId, `tool-${index}`, {
            type: call.toolName === 'web_search' ? 'search' : 'tool',
            title: getChatToolStepTitle(call.toolName, call.status),
            detail: call.status === 'error' ? '工具执行未完成' : '用户停止执行',
            status: call.status,
          }, true);
          await upsertChatToolCall(call).catch(() => {});
          toolMessages.push({ role: 'tool', tool_call_id: call.id, content: call.resultJson });
          await notifyBatchCompleted(call.status === 'cancelled');
        }
        if (rejectedNativeArguments) {
          const priorCalls = getConversationMessages(run.conversationId).find(message => message.id === run.assistantMessageId)?.toolCalls || [];
          const exhausted = rhinoArgumentRepairCount(priorCalls.filter(previous => previous.id !== call.id), call.toolName) >= (rejectedGeometry ? MAX_GEOMETRY_PREFLIGHT_CORRECTIONS : 1);
          // A later call in the same batch may depend on the rejected write. Do not dispatch it.
          for (const skipped of run.calls.slice(index + 1)) {
            skipped.status = 'cancelled';
            skipped.completedAt = Date.now();
            skipped.resultJson = serializeChatToolResult({ kind: 'rhino_native_dependency_skipped', dispatched: false, error: 'Not dispatched because an earlier call needs corrected arguments. Resubmit only after correcting it.' });
            await upsertChatToolCall(skipped);
            toolMessages.push({ role: 'tool', tool_call_id: skipped.id, content: skipped.resultJson });
          }
          patchMessage(run.assistantMessageId, message => ({ ...message, toolCalls: mergePresentationToolCalls(message.toolCalls, run.calls) }), true);
          if (exhausted) {
            patchMessage(run.assistantMessageId, message => finalizeChatMessageState({
              ...message,
              content: [message.content.trim(), scriptRejected ? `Rhino \u811a\u672c\u7c7b\u578b\u9884\u68c0\u4ecd\u672a\u901a\u8fc7: ${call.toolName}\n\u5df2\u81ea\u52a8\u4fee\u6b63\u4e00\u6b21\uff0c\u4ecd\u5b58\u5728 API \u7c7b\u578b\u95ee\u9898\u3002\u672c\u6b21\u811a\u672c\u672a\u6267\u884c\uff0c\u5148\u524d\u6210\u529f\u7684\u6b65\u9aa4\u5df2\u4fdd\u7559\uff1b\u9519\u8bef\u4f4d\u7f6e\u548c\u4fee\u6b63\u8981\u6c42\u89c1\u5de5\u5177\u56de\u6267\u3002` : rejectedGeometry ? `Rhino \u51e0\u4f55\u9884\u68c0\u4ecd\u672a\u901a\u8fc7: ${call.toolName}\n${geometryFailureSummary(JSON.parse(call.resultJson || '{}'))}\n\u5df2\u8fbe\u5230\u672c\u8f6e\u9884\u68c0\u4fee\u6b63\u4e0a\u9650\uff0c\u6ca1\u6709\u5199\u5165\u5bf9\u8c61\u3002\u65e0\u6548\u8ba1\u5212\u4e0d\u4f1a\u91cd\u590d\u6267\u884c\uff0c\u5df2\u5b8c\u6210\u7684\u6b65\u9aa4\u4fdd\u7559\u3002` : compatibilityRejected ? `Rhino C# \u8fd0\u884c\u73af\u5883\u4e0d\u517c\u5bb9: ${call.toolName}\n\u5df2\u6838\u5b9e\u9519\u8bef\u53d1\u751f\u5728\u811a\u672c\u6267\u884c\u4e4b\u524d\uff0c\u4e14\u6587\u6863\u51e0\u4f55\u672a\u53d8\u5316\uff1b\u5df2\u81ea\u52a8\u6362\u7528 Python \u5efa\u6a21\u4e00\u6b21\uff0c\u672a\u91cd\u653e C# \u811a\u672c\u3002` : `Rhino MCP \u53c2\u6570\u8865\u5168\u5931\u8d25: ${call.toolName}\n\u5df2\u81ea\u52a8\u8865\u5168\u4e00\u6b21\uff0c\u4ecd\u4e0d\u7b26\u5408\u5de5\u5177\u53c2\u6570\u8981\u6c42\u3002\u672c\u6b21\u65e0\u6548\u8c03\u7528\u672a\u53d1\u9001\u5230 Rhino\uff1b\u5148\u524d\u6210\u529f\u7684\u6b65\u9aa4\u5df2\u4fdd\u7559\u3002`].filter(Boolean).join('\n\n'),
            }, 'error', Date.now(), 'Native Rhino argument repair exhausted'), true);
            updateConversationBusy(run.conversationId, false);
            return;
          }
          patchThinkingStep(run.assistantMessageId, `tool-${index}`, { type: 'tool',
            title: scriptRejected ? '\u6b63\u5728\u4fee\u6b63 Rhino \u811a\u672c\u7c7b\u578b' : rejectedGeometry ? '\u6b63\u5728\u81ea\u52a8\u4fee\u6b63\u51e0\u4f55\u51b2\u7a81' : '\u6b63\u5728\u81ea\u52a8\u8865\u5168 MCP \u53c2\u6570',
            detail: scriptRejected ? '\u811a\u672c\u5c1a\u672a\u6267\u884c\uff1b\u6839\u636e\u786e\u5207 API \u7c7b\u578b\u95ee\u9898\u81ea\u52a8\u4fee\u6b63\u4e00\u6b21' : rejectedGeometry ? '\u5185\u5b58\u51e0\u4f55\u9884\u68c0\u672a\u901a\u8fc7\uff0c\u5c1a\u672a\u5199\u5165\u5bf9\u8c61\uff1b\u6839\u636e\u5177\u4f53\u51b2\u7a81\u4fee\u6b63\u4e00\u6b21' : '\u53c2\u6570\u6821\u9a8c\u672a\u901a\u8fc7\uff0c\u5c1a\u672a\u53d1\u9001\u5230 Rhino\uff1b\u5141\u8bb8\u6a21\u578b\u8865\u5168\u4e00\u6b21', status: 'running' });
          await runModelLoopRef.current(
            run.conversationId, run.assistantMessageId, run.userText, run.requestModel,
            [...run.providerMessages, ...toolMessages, ...rhinoVisionMessages, { role: 'system', content: rhinoArgumentRepairInstruction(call.toolName) + (scriptRejected ? '\nThe local script checker rejected the script before dispatch. Read issues and fix the exact missing import/binding or incompatible API/type once. Import every referenced Python/.NET namespace explicitly; do not depend on globals from previous tool calls. Preserve holes and three-dimensional design intent. Do not repeat any earlier completed write, remove requested features, or ask for user approval.' : '') + (compatibilityRejected ? '\nThe native MCP returned System.Collections.Immutable version 9 load failure. Snapshot verification proves zero geometry changes. Do not retry C#; translate to Python exactly once, preserve target dimensions and holes, and verify the committed geometry.' : '') + (rejectedGeometry ? '\nTrusted geometry preflight executed in memory but made no document writes. Correct the exact inputPaths from the receipt, retain requested holes/dimensions/wall constraints, and resubmit only a genuinely changed plan. Crossing boundaries require boundary edits; changing minWall alone cannot fix them. At most two zero-write preflight corrections are allowed, never a commit replay.' : '') }],
            run.depth + 1, undefined, run.emptyRecoveryCount, run.executionSource,
          );
          return;
        }
        if (run.executionSource === 'rhino' && call.toolName.startsWith('rhino_native_') && call.status === 'error'
          && !isRecoverableRhinoNativeReadFailure(call.toolName, run.conversationId)) {
          for (const skipped of run.calls.slice(index + 1)) {
            skipped.status = 'cancelled';
            skipped.completedAt = Date.now();
            skipped.resultJson = serializeChatToolResult({ cancelled: true, error: 'Skipped after a failed native Rhino call; no automatic replay.' });
            await upsertChatToolCall(skipped).catch(() => {});
          }
          let errorDetail = call.resultJson || '';
          let inspectedFailure = false;
          try {
            const failureReceipt = JSON.parse(errorDetail);
            errorDetail = rhinoScriptFailureExplanation(failureReceipt.error) || readableRhinoMcpFailure(failureReceipt.error || errorDetail);
            const verification = failureReceipt.geometryVerification;
            inspectedFailure = Boolean(verification?.writeFailed && verification.status !== 'inspection_failed');
            if (verification?.writeFailed) errorDetail += verification.status === 'inspection_failed'
              ? '\n\u6267\u884c\u540e\u7684\u6587\u6863\u68c0\u67e5\u672a\u5b8c\u6210\uff0c\u65e0\u6cd5\u786e\u8ba4\u662f\u5426\u5df2\u5199\u5165\u90e8\u5206\u5bf9\u8c61\u3002'
              : verification.documentChanged === true
                ? '\n\u5df2\u8bfb\u53d6\u6587\u6863\uff1a\u68c0\u6d4b\u5230\u90e8\u5206\u51e0\u4f55\u53d8\u5316\uff0c\u73b0\u6709\u5bf9\u8c61\u5df2\u4fdd\u7559\uff0c\u4e0d\u91cd\u590d\u5efa\u6a21\u3002'
                : '\n\u5df2\u8bfb\u53d6\u6587\u6863\uff1a\u672a\u68c0\u6d4b\u5230\u51e0\u4f55\u53d8\u5316\uff1b\u8fd9\u4e0d\u4ee3\u8868\u811a\u672c\u6ca1\u6709\u5176\u4ed6\u526f\u4f5c\u7528\u3002';
          } catch { /* Keep the original error. */ }
          const visibleCalls = getConversationMessages(run.conversationId).find(item => item.id === run.assistantMessageId)?.toolCalls || [];
          const postprocess = rhinoPostprocessFailure(mergePresentationToolCalls(visibleCalls, run.calls), call);
          patchMessage(run.assistantMessageId, message => finalizeChatMessageState({
            ...message,
            toolCalls: mergePresentationToolCalls(message.toolCalls, run.calls),
            content: postprocess
              ? [message.content.trim(), postprocess.summary, '未完成的工具：' + call.toolName + '\n' + errorDetail, postprocess.limitation].filter(Boolean).join('\n\n')
              : [message.content.trim(), `Rhino MCP \u6267\u884c\u5931\u8d25\uff1a${call.toolName}\n${errorDetail}\n${inspectedFailure ? '\u5df2\u505c\u6b62\u672c\u6b21\u8c03\u7528\uff0c\u4e0d\u4f1a\u81ea\u52a8\u91cd\u653e\u5efa\u6a21\u6307\u4ee4\u3002\u8be6\u7ec6\u9519\u8bef\u548c\u6587\u6863\u68c0\u67e5\u7ed3\u679c\u89c1\u5de5\u5177\u56de\u6267\u3002' : '\u5df2\u505c\u6b62\u672c\u6b21\u8c03\u7528\uff0c\u4e0d\u4f1a\u81ea\u52a8\u91cd\u653e\u5efa\u6a21\u6307\u4ee4\uff1b\u8bf7\u5148\u68c0\u67e5 Rhino \u6587\u6863\u72b6\u6001\u3002'}`].filter(Boolean).join('\n\n'),
          }, postprocess ? 'completed' : 'error', Date.now(), postprocess ? undefined : 'Native Rhino MCP execution failed'), true);
          pendingApprovalsRef.current.delete(run.conversationId);
          updateConversationBusy(run.conversationId, false);
          return;
        }
        if (activeBatchRunsRef.current.get(run.conversationId)?.callId === call.id) {
          activeBatchRunsRef.current.delete(run.conversationId);
          if (activeConversationIdRef.current === run.conversationId) {
            syncActiveConversationActivity(run.conversationId);
          }
        }
        patchMessage(run.assistantMessageId, message => ({ ...message, toolCalls: mergePresentationToolCalls(message.toolCalls, run.calls) }), true);
      }
      pendingApprovalsRef.current.delete(run.conversationId);
      if (run.executionSource === 'rhino') {
        const currentCalls = getConversationMessages(run.conversationId).find(message => message.id === run.assistantMessageId)?.toolCalls || [];
        if (repeatedGhLoopFailureAfterCorrection(currentCalls, run.calls)) {
          const skippedCalls = run.calls.filter(call => call.status === 'pending');
          for (const skipped of skippedCalls) {
            skipped.status = 'cancelled';
            skipped.completedAt = Date.now();
            skipped.resultJson = serializeChatToolResult({ cancelled: true, error: 'Stopped after the GH loop-closure error persisted across a correction; this tool was not dispatched.' });
            await upsertChatToolCall(skipped).catch(() => {});
          }
          patchMessage(run.assistantMessageId, message => finalizeChatMessageState({
            ...message,
            toolCalls: mergePresentationToolCalls(message.toolCalls, run.calls),
            content: [normalizeVisibleChatText(message.content), 'GH 轮廓/孔环闭合检查在一次定向修正后仍然失败（Rhino 报告 Invalid hole loop 或等价未闭合环错误）。为避免继续循环改写图，本轮自动停止；已执行步骤和现有 GH 定义保留，未重放先前写入。请检查报错组件的外轮廓与孔环是否各自闭合、共面且无自交。'].filter(Boolean).join('\n\n'),
          }, 'error', Date.now(), 'Grasshopper loop closure still invalid after one correction'), true);
          updateConversationBusy(run.conversationId, false);
          return;
        }
      }
      if (run.calls.some(call => call.status === 'cancelled')) {
        patchMessage(run.assistantMessageId, message => finalizeChatMessageState({
          ...message,
          content: message.content.trim() || '已停止批量处理，已完成的图片结果已保留。',
        }, 'cancelled', Date.now(), '用户停止生成'), true);
        updateConversationBusy(run.conversationId, false);
        return;
      }
      if (cancelledToolRunsRef.current.has(run.conversationId)) {
        patchMessage(run.assistantMessageId, message => finalizeChatMessageState({
          ...message,
          toolCalls: mergePresentationToolCalls(message.toolCalls, run.calls),
          content: message.content.trim() || 'Rhino ?????????????????????????????????',
        }, 'cancelled', Date.now(), 'Rhino workflow stopped after the current native call'), true);
        cancelledToolRunsRef.current.delete(run.conversationId);
        updateConversationBusy(run.conversationId, false);
        return;
      }
      // Native success is a step receipt, not a turn-completion signal. Feed it
      // back to the model so startup/search/place/connect/solve chains continue.
      const presentationText = resolvePresentationTurnText(run.userText, getConversationMessages(run.conversationId));
      const completedBatchCall = !presentationText && run.calls.find(call => call.toolName === 'batch_image_operation');
      if (completedBatchCall) {
        const summary = summarizeCompletedBatchCall(completedBatchCall);
        patchMessage(run.assistantMessageId, message => finalizeChatMessageState({
          ...message,
          content: [normalizeVisibleChatText(message.content), summary.content]
            .filter(Boolean)
            .join('\n\n'),
        }, summary.status, Date.now(), summary.status === 'error' ? '批量处理未完全完成' : undefined), true);
        updateConversationBusy(run.conversationId, false);
        void maybeSummarize(run.conversationId);
        return;
      }
      const visibleCompletion = summarizeCompletedVisibleToolCalls(run.calls);
      if (visibleCompletion && !shouldContinuePresentationAfterMedia(presentationText, run.calls)) {
        patchMessage(run.assistantMessageId, message => finalizeChatMessageState({
          ...message,
          content: [normalizeVisibleChatText(message.content), visibleCompletion.content]
            .filter(Boolean)
            .join('\n\n'),
        }, 'completed'), true);
        updateConversationBusy(run.conversationId, false);
        void maybeSummarize(run.conversationId);
        return;
      }
      await runModelLoopRef.current(
        run.conversationId,
        run.assistantMessageId,
        run.userText,
        run.requestModel,
        [...run.providerMessages, ...toolMessages, ...rhinoVisionMessages],
        run.depth + 1,
        undefined,
        run.emptyRecoveryCount,
        run.executionSource,
      );
    } finally {
      if (activeToolMessagesRef.current.get(run.conversationId) === run.assistantMessageId) {
        activeToolMessagesRef.current.delete(run.conversationId);
        if (activeConversationIdRef.current === run.conversationId) syncActiveConversationActivity(run.conversationId);
      }
    }
  }, [
    getConversationMessages,
    maybeSummarize,
    patchMessage,
    syncActiveConversationActivity,
    patchThinkingStep,
    updateConversationBusy,
  ]);

  const runModelLoop = useCallback(async (
    conversationId: string,
    assistantMessageId: string,
    userText: string,
    requestModel: string,
    providerMessages: Array<Record<string, unknown>>,
    depth: number,
    resumeRequestId?: string,
    emptyRecoveryCount = 0,
    executionSource: ChatExecutionSource = optionsRef.current.defaultExecutionSource || 'desktop',
  ) => {
    await validateDesignMemoryMessages(providerMessages);
    const memoryKinds = designMemoryKindsInMessages(providerMessages);
    if (memoryKinds.length) designMemoryTurnsRef.current.set(conversationId, memoryKinds);
    else designMemoryTurnsRef.current.delete(conversationId);

    const providerRequestModel = resolveValidAgentModel({
      savedModel: requestModel,
      availableModels: optionsRef.current.modelOptions,
      usageContext: 'chat',
    }).requestedModel;
    const requestId = resumeRequestId || createChatId('chat-request');
    const conversationMessages = getConversationMessages(conversationId);
    const imageSelection = selectChatImageAttachments(conversationMessages, userText);
    const hasRecentMedia = Boolean(latestGeneratedMedia(conversationMessages));
    const currentImageAttachmentCount = imageSelection.attachments.length;
    const presentationText = resolvePresentationTurnText(userText, conversationMessages);
    const toolIntentText = presentationText || imageSelection.toolIntentText;
    if (!presentationText && !canRunChatToolRound(depth, executionSource)) throw new Error(`\u8fde\u7eed\u5de5\u5177\u8c03\u7528\u8d85\u8fc7 ${chatToolRoundLimit(executionSource)} \u8f6e\uff0c\u5df2\u505c\u6b62`);
    const agentCreationFollowup = isChatAgentCreationFollowup(conversationMessages, userText);
    const rhinoGeometryRequest = executionSource === 'rhino' && isRhinoGeometryOnlyRequest(userText);
    const batchImageOperationRequested = !rhinoGeometryRequest && shouldExposeBatchImageOperation(
      toolIntentText,
      currentImageAttachmentCount,
      userText,
    );
    // Tool calls in older conversation history must not block a new user turn.
    const previousWebSearchQueries = new Set(
      depth === 0 ? [] : providerToolCallQueries(providerMessages, 'web_search'),
    );
    const fileCreationTurn = getChatFileCreationTurn(depth === 0 ? [] : providerMessages);
    const agentCreatedThisTurn = depth > 0 && conversationMessages.some(message => (
      message.id === assistantMessageId
      && message.toolCalls.some(call => call.toolName === 'create_agent' && call.status === 'completed')
    ));
    const previousBatchImageOperationCount = depth === 0
      ? 0
      : providerToolCallCount(providerMessages, 'batch_image_operation');
    const previousImageVariantCount = depth === 0
      ? 0
      : providerToolCallCount(providerMessages, 'generate_image_variants');
    const webSearchCount = previousWebSearchQueries.size;
    const searchEvidence = collectChatSearchEvidence(providerMessages);
    const searchResultCount = searchEvidence.reduce((sum, item) => sum + item.results.length, 0);
    const recoverSearchSynthesis = emptyRecoveryCount > 0 && searchResultCount > 0;
    const lastProviderMessage = providerMessages[providerMessages.length - 1];
    const repairingRhinoArguments = executionSource === 'rhino' && lastProviderMessage?.role === 'system'
      && String(lastProviderMessage.content || '').startsWith('A typed Rhino preflight/runtime compatibility check ');
    const recoverPresentationDelivery = Boolean(presentationText && emptyRecoveryCount > 0);
    const webSearchRequested = webSearchEnabled || shouldExposeWebSearch(userText);
    const webSearchAvailable = webSearchRequested
      && webSearchCount < MAX_WEB_SEARCH_QUERIES_PER_TURN && !recoverSearchSynthesis;
    const batchImageOperationAvailable = batchImageOperationRequested
      && previousBatchImageOperationCount === 0;
    const tools = !fileCreationTurn.canAttempt || agentCreatedThisTurn
      ? []
      : getChatToolDefinitions(
        toolIntentText,
        hasRecentMedia,
        webSearchAvailable,
        webSearchCount >= MAX_WEB_SEARCH_QUERIES_PER_TURN,
        currentImageAttachmentCount,
        Boolean(getSelectedChatSkill(conversationId)),
        agentCreationFollowup,
        userText,
        currentImageAttachmentCount > 0 || (hasRecentMedia && (isShortVisualFollowup(userText) || isVisualRevisionFollowup(userText) || isVisualEditFollowup(userText))),
      ).filter(tool => (
        (!rhinoGeometryRequest || !['generate_image', 'edit_image', 'generate_image_variants', 'generate_video', 'batch_image_operation'].includes(tool.function.name))
        && (!(recoverSearchSynthesis || recoverPresentationDelivery) || tool.function.name === 'create_file')
        && (previousBatchImageOperationCount === 0 || tool.function.name !== 'batch_image_operation')
        && (presentationText || previousImageVariantCount === 0 || tool.function.name !== 'generate_image_variants')
      ));
    const requestInstructions: Array<Record<string, unknown>> = [];
    tools.push(...(optionsRef.current.additionalTools?.(conversationId, executionSource) || []));
    if (executionSource === 'rhino') requestInstructions.push({ role: 'system', content: `${buildRhinoTurnInstruction()}\n${buildRhinoWorkflowInstruction()}` });
    if (rhinoGeometryRequest) requestInstructions.push({ role: 'system', content: 'This is a native Rhino geometry task. Use the attached canvas images as shape references for actual Rhino/Grasshopper modeling. Do not substitute generated images, and do not require a non-empty Rhino viewport before building geometry. Verify real objects/graph results before reporting completion.' });
    if (presentationText) requestInstructions.push({ role: 'system', content: [
      '本轮最终交付是可下载的 PPTX，不是配图。纯数据或已有素材足够时不要额外生图；工业设计研究先找与当前研究对象相关、可核验的参考图；仅有必要且用户允许时生成并标注 AI 概念示意。已有合适附件时优先复用，不为了视觉装饰强制付费生图。无图片时用原生图示解释结构，不把示意图冒充真实产品照片。',
      'PPT 配图不设每份调用次数或图片总数上限，按真实内容需要决定，不为凑图重复生成；单次请求仍遵守所选生图模型的规格。',
      '如需生图，先完成图片工具，再根据返回的真实媒体 id 填写 presentation.slides[].imageAttachmentId；不要在尚未取得图片 ID 时猜测或同时提交 create_file。',
      '配图失败时使用已有附件或纯文字版继续；明确说明缺图，不无限重试，不自动改用其它付费工具。取得配图后必须继续调用 create_file(format=pptx)，不能只以图片结果结束。',
      '图片设置为自动时，省略 model、aspectRatio 和 resolution，让运行时依据当前素材用途选择可用模型、画幅和清晰度；按真实画面用途选择比例和清晰度；若完成了生图，明确以对应的真实 imageAttachmentId 放入概念页并标为 AI 概念示意，不把不相关历史图片自动放进封面。',
      '研究检索先拆成 2～4 个具体问题：对象与范围、代表产品/车型及年款、造型/按键/调节/CMF 的同口径证据，优先官方产品页、手册和有出处的图片，避免一条关键词堆满多个品牌后就收尾。过滤配件商城、重复版本和无关结果；只有一个有效案例时收敛为研究启动稿，不伪装成完整竞品调研。',
      '联网检索必须先做研究综合再做排版：每页只保留一个结论、2～4 条短证据和必要来源；优先合并同一事实的多个来源，区分已证实事实、推断和待验证项。禁止把搜索结果、网页摘要、JSON、URL 列表或长段原文直接塞进 body/items/notes；长细节放讲稿 notes 也必须压缩成要点。',
    ].join('\n') });
    if (!rhinoGeometryRequest && tools.some(tool => ['generate_image', 'generate_image_variants', 'edit_image'].includes(tool.function.name))) {
      requestInstructions.push({ role: 'system', content: [
        'Judge visual intent semantically from the latest user request, relevant conversation context, and actual attachments. Do not require words such as generate, image, render, or any fixed subject/domain vocabulary; users may express a visual goal indirectly or in specialist language.',
        'Call an image tool only when the user actually wants a new visual deliverable or an edit to an existing image. Do not call one for discussion, analysis, evaluation, explanations, advice, brainstorming alone, capability questions, unrelated text work, or explicit requests to wait or defer. Tool visibility, an attachment, or an assistant suggestion is not authorization.',
        'Writing, drafting, translating, polishing, explaining, or improving an image-generation prompt is a text-only deliverable. A prompt that describes an image, says "generate an image", or names an image model is not permission to render it. Generate the actual image only when the user separately asks for image output (for example, "write the prompt, then render it").',
        'Choose between generation, editing the current attachment, editing a relevant recent result, one composite image, or separate variants based on context. Reuse prior images only when relevant; respect model, aspect-ratio, resolution, and other user settings; never invent attachment paths.',
        'If the user previously asked to wait for a reference, continue that visual task only when the new message actually supplies the reference and the task remains active. An assistant suggestion alone is not authorization.',
        'If image tools are unavailable or fail, say so accurately. Never claim an image was generated or edited until a real image is returned.',
      ].join('\n') });
    }
    if (agentCreationFollowup && !agentCreatedThisTurn) {
      requestInstructions.push({
        role: 'system',
        content: '当前消息是在补充此前创建智能体/技能的需求。结合前文判断用途是否已足够明确：足够明确就调用 create_agent 真正保存；若仍缺少职责或目标，继续询问。不要只给出技能文本却声称已创建。',
      });
    }
    if (!presentationText && previousImageVariantCount > 0) {
      requestInstructions.push({
        role: 'system',
        content: 'The independent-variant image task has already run this turn. Do not call image-generation tools again; summarize success and failure from the actual tool results.',
      });
    }
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
      requestInstructions.push({
        role: 'system',
        content: buildWebSearchTurnInstruction(webSearchCount, currentLocalDateContext()),
      });
    }
    if (emptyRecoveryCount > 0) {
      requestInstructions.push({
        role: 'system',
        content: EMPTY_RESPONSE_RECOVERY_INSTRUCTION,
      });
    }
    if (recoverPresentationDelivery) {
      requestInstructions.push({ role: 'system', content:
        '本轮已明确要求交付 PPTX，但上一轮没有调用文件工具。当前 tools 中已提供 create_file，请根据当前用户需求及已取得资料调用它创建真实可编辑文件；不要再只输出大纲或声称缺少文件工具，不要重搜或重新生图。来源不充分处如实标注，不得编造事实、配图或文件链接。' });
    }
    if (fileCreationTurn.attempts > 0) {
      requestInstructions.push({ role: 'system', content: chatFileCreationTurnInstruction(fileCreationTurn) });
    }
    if (agentCreatedThisTurn) {
      requestInstructions.push({
        role: 'system',
        content: '本轮智能体创建工具已经执行。不要再调用工具；根据工具结果准确告诉用户是否新建成功，以及可在 Chat 顶部的“智能体”入口查看和选择。不要声称已启用，除非工具结果中的 activated 为 true。',
      });
    }
    const normalizedProviderMessages = buildChatSearchContinuation(
      providerMessages,
      Boolean(presentationText) || recoverSearchSynthesis,
      presentationText ? 7_000 : 10_000,
      Boolean(presentationText),
    );
    if (searchResultCount > 0) {
      patchThinkingStep(assistantMessageId, 'search-results', { type: 'context', title: `已取得 ${searchResultCount} 条联网资料`,
        detail: recoverSearchSynthesis ? '检索已成功；正在用精简资料和非流式请求恢复模型整理，不重复搜索' : '检索已成功；正在交给模型整理与继续任务', status: 'completed' });
      patchThinkingStep(assistantMessageId, 'search-synthesis', { type: 'finalizing', title: presentationText ? '正在整理资料并制作 PPT' : '正在根据检索资料整理回答',
        detail: recoverSearchSynthesis ? '模型上一轮未返回有效内容，本轮切换兼容续接格式' : '搜索结果非空，等待模型输出', status: 'running' });
    }
    const requestMessages = requestInstructions.length > 0
      ? [...requestInstructions, ...normalizedProviderMessages]
      : normalizedProviderMessages;
    activeRequestsRef.current.set(conversationId, {
      requestId,
      conversationId,
      messageId: assistantMessageId,
      streamed: false,
      streamedContent: false,
      streamedReasoning: false,
    });
    if (activeConversationIdRef.current === conversationId) {
      syncActiveConversationActivity(conversationId);
    }
    const presentationHasImageResults = conversationMessages.find(message => message.id === assistantMessageId)?.toolCalls
      .some(call => ['generate_image', 'generate_image_variants'].includes(call.toolName) && call.status !== 'pending');
    const presentationToolChoice = resolvePresentationToolChoice({
      requested: Boolean(presentationText),
      createFileAvailable: tools.some(tool => tool.function.name === 'create_file'),
      explicitExport: isChatPresentationExportRequest(userText),
      fileAttempts: fileCreationTurn.attempts,
      recoveryCount: emptyRecoveryCount,
    });
    const continuePresentationTools = Boolean(presentationText && presentationHasImageResults && tools.length);
    const currentTurnToolCalls = conversationMessages.find(message => message.id === assistantMessageId)?.toolCalls || [];
    const ghRecoveryState = executionSource === 'rhino'
      ? rhinoGhReflectionRecoveryState(currentTurnToolCalls, false)
      : 'none';
    const repairRejection = repairingRhinoArguments ? unresolvedRhinoArgumentRejection(currentTurnToolCalls) : undefined;
    const repairToolName = ghRecoveryState === 'inspect'
      ? 'rhino_native_g2_get_canvas_graph'
      : ghRecoveryState === 'continue' || ghRecoveryState === 'complete' || ghRecoveryState === 'failed'
        ? undefined
        : repairRejection?.toolName;
    const requiresGhVerificationRound = executionSource === 'rhino' && providerMessages.some(message => message.role === 'system' && String(message.content || '').startsWith('Grasshopper completion requires structural verification.'));
    const toolChoice = requiresGhVerificationRound && tools.some(tool => tool.function.name === VERIFY_GH_TOOL)
      ? {type:'function',function:{name:VERIFY_GH_TOOL}}
      : repairToolName && tools.some(tool => tool.function.name === repairToolName)
      ? { type: 'function', function: { name: repairToolName } }
      : executionSource === 'rhino' && String(lastProviderMessage?.content || '').startsWith('Controlled profile validation is not a commit.') && tools.some(tool => tool.function.name === SAFE_PROFILE_TOOL)
        ? { type: 'function', function: { name: SAFE_PROFILE_TOOL } }
      : presentationToolChoice ? presentationToolChoice
      : continuePresentationTools ? 'required'
      : shouldForceChatAgentCreation(userText)
      && !agentCreatedThisTurn && tools.some(tool => tool.function.name === 'create_agent')
      ? { type: 'function', function: { name: 'create_agent' } }
      : undefined;
    let result: ChatProviderResult | undefined;
    let expectedRequestId = requestId;
    try {
      await validateDesignMemoryMessages(providerMessages);
      result = await requestChatCompletion({
        requestId,
        messages: requestMessages,
        tools,
        toolChoice,
        model: providerRequestModel,
        usageContext: 'chat',
        stream: !(recoverSearchSynthesis || recoverPresentationDelivery || repairingRhinoArguments),
      });
    } catch (initialError) {
      let recoveryError = initialError;
      let active = activeRequestsRef.current.get(conversationId);
      if (active && active.requestId === requestId && !active.streamed
        && optionsRef.current.serverManagedChannelFailover
        && isUpstreamUnavailableChatError(initialError)) {
        const fallbackRequestId = createChatId('chat-channel-fallback');
        expectedRequestId = fallbackRequestId;
        activeRequestsRef.current.set(conversationId, {
          requestId: fallbackRequestId,
          conversationId,
          messageId: assistantMessageId,
          streamed: false,
          streamedContent: false,
          streamedReasoning: false,
        });
        optionsRef.current.onNotice?.(
          '当前上游渠道暂时不可用，正在切换服务端备用渠道…',
        );
        try {
          await validateDesignMemoryMessages(providerMessages);
          result = await requestChatCompletion({
            requestId: fallbackRequestId,
            messages: requestMessages,
            tools,
            toolChoice,
            // `default` is normalized to no explicit wallet model by Rust.
            // This deliberately hands routing back to the wallet service so it
            // can select a different healthy backend channel instead of merely
            // retrying the failed public model/channel pair from the first task.
            model: 'default',
            usageContext: 'chat',
            stream: true,
          });
        } catch (fallbackError) {
          recoveryError = fallbackError;
        }
      }
      if (!result) {
        active = activeRequestsRef.current.get(conversationId);
        if (!isChatRequestIdCurrent(active?.requestId, expectedRequestId)
          || searchResultCount === 0 || active?.streamed || !isRecoverableChatRequestError(recoveryError) && !isUpstreamUnavailableChatError(recoveryError)) throw recoveryError;
        const fallbackRequestId = createChatId('chat-search-synthesis');
        expectedRequestId = fallbackRequestId;
        activeRequestsRef.current.set(conversationId, {
          requestId: fallbackRequestId,
          conversationId,
          messageId: assistantMessageId,
          streamed: false,
          streamedContent: false,
          streamedReasoning: false,
        });
        const fallbackMessages = [
          ...requestInstructions,
          ...buildChatSearchContinuation(providerMessages, true, 6000),
          {
            role: 'system',
            content: presentationText
              ? '联网资料已经取得。请根据已有资料调用 create_file(format=pptx) 生成真实演示文稿，不重复搜索或生图，不编造数据；不明确处标注待确认。'
              : '联网资料已经取得。请立即根据已有资料给出完整回答；资料不足的部分明确说明，不要中断在搜索过程，也不要说搜索失败。',
          },
        ];
        await validateDesignMemoryMessages(providerMessages);
        result = await requestChatCompletion({
          requestId: fallbackRequestId,
          messages: fallbackMessages,
          tools: buildSearchSynthesisRecoveryTools(tools, Boolean(presentationText)),
          toolChoice: presentationText && tools.some(tool => tool.function.name === 'create_file') ? { type: 'function', function: { name: 'create_file' } } : undefined,
          model: providerRequestModel,
          usageContext: 'chat',
          stream: false,
        });
      }
    }
    await validateDesignMemoryMessages(providerMessages);
    if (!result) throw new Error('Chat 请求没有返回结果');
    const active = activeRequestsRef.current.get(conversationId);
    if (!active || !isChatRequestIdCurrent(active.requestId, expectedRequestId)) {
      throw new Error('Chat 请求已取消');
    }
    activeRequestsRef.current.delete(conversationId);
    if (activeConversationIdRef.current === conversationId) {
      syncActiveConversationActivity(conversationId);
    }
    flushStreamDelta(assistantMessageId);
    if (activeConversationIdRef.current === conversationId) {
      setUsage(normalizeUsage(result.usage));
    }
    if (!active.streamedContent && result.content) {
      patchMessage(assistantMessageId, message => ({ ...message, content: `${message.content}${result.content}` }));
    }
    if (!active.streamedReasoning && result.reasoning) {
      patchMessage(assistantMessageId, message => appendChatStreamBuffers(message, {
        reasoning: result.reasoning,
      }));
    }
    const acceptedWebSearchQueries = new Set(previousWebSearchQueries);
    let acceptedWebSearchInResponse = false;
    let acceptedFileCreateInResponse = false;
    let acceptedBatchImageOperationInResponse = previousBatchImageOperationCount > 0;
    let acceptedImageVariantInResponse = !presentationText && previousImageVariantCount > 0;
    const toolCalls = (result.toolCalls || []).filter(call => {
      if (call.name === 'create_file') {
        if (!fileCreationTurn.canAttempt || acceptedFileCreateInResponse) return false;
        acceptedFileCreateInResponse = true;
        return true;
      }
      if (call.name === 'batch_image_operation') {
        if (acceptedBatchImageOperationInResponse) return false;
        acceptedBatchImageOperationInResponse = true;
        return true;
      }
      if (call.name === 'generate_image_variants') {
        if (acceptedImageVariantInResponse) return false;
        acceptedImageVariantInResponse = true;
        return true;
      }
      if (call.name !== 'web_search') return true;
      const query = normalizeWebSearchQuery(call.arguments || '{}');
      if (
        !query
        || acceptedWebSearchInResponse
        || !canAcceptWebSearchQuery(acceptedWebSearchQueries, call.arguments || '{}')
      ) {
        return false;
      }
      acceptedWebSearchInResponse = true;
      acceptedWebSearchQueries.add(query);
      return true;
    });
    if (toolCalls.length === 0) {
      const ghTurnCalls = getConversationMessages(conversationId).find(message => message.id === assistantMessageId)?.toolCalls || [];
      const needsGhVerification = executionSource === 'rhino' && Boolean(getRhinoNativeTool(VERIFY_GH_TOOL, conversationId)) && collectGhPythonComponentIds(ghTurnCalls).length>0;
      if (needsGhVerification) {
        const lastGhCheck = [...ghTurnCalls].reverse().find(call => call.toolName === VERIFY_GH_TOOL && call.status === 'completed');
        let checkPassed = false;
        try { checkPassed = JSON.parse(lastGhCheck?.resultJson || '{}').ghVerification?.status === 'passed'; } catch { /* No verified receipt. */ }
        const lastMutation = [...ghTurnCalls].reverse().find(call => call.toolName !== VERIFY_GH_TOOL && !/get_|search|describe/.test(call.toolName) && call.status === 'completed');
        const fresh = lastGhCheck && (!lastMutation || (lastGhCheck.completedAt || 0) >= (lastMutation.completedAt || 0));
        if (!checkPassed || !fresh) {
          const alreadyChecked = providerMessages.some(message => message.role === 'system' && String(message.content || '').startsWith('Grasshopper completion requires structural verification.'));
          if (!alreadyChecked) {
            await runModelLoopRef.current(conversationId, assistantMessageId, userText, requestModel,
              [...providerMessages, {role:'system',content:'Grasshopper completion requires structural verification. Call rhino_native_verify_gh_geometry; runtime supplies exact component IDs from successful code-change receipts. The helper is read-only and checks actual outward solids, bounds, volumes, Boolean guard reports and component errors. If verification needs attention, inspect and correct the graph; never claim completion from one closed Brep alone. This does NOT establish photo fidelity.'}],
              depth+1,undefined,emptyRecoveryCount,executionSource);
            return;
          }
          patchMessage(assistantMessageId,message=>finalizeChatMessageState({...message,content:'GH \u4efb\u52a1\u5c1a\u672a\u901a\u8fc7\u7ed3\u6784\u5b8c\u6574\u6027\u9a8c\u8bc1\u3002\u5fc5\u987b\u68c0\u67e5\u5b9e\u4f53\u671d\u5411\u3001\u4f53\u79ef\u548c\u5305\u56f4\u76d2\uff0c\u4e0d\u80fd\u53ea\u51ed\u4e00\u4e2a\u5c01\u95ed Brep \u5224\u65ad\u5efa\u6a21\u5b8c\u6210\u3002\u5f53\u524d GH \u5df2\u4fdd\u7559\uff0c\u672a\u81ea\u52a8\u91cd\u653e\u6216\u6e05\u7a7a\u3002'},'error',Date.now(),'GH structural verification incomplete'),true);
          updateConversationBusy(conversationId,false);
          return;
        }
      }
      const currentNativeCalls = getConversationMessages(conversationId).find(message => message.id === assistantMessageId)?.toolCalls || [];
      const documentGeometryWrites=currentNativeCalls.filter(call=>call.status==='completed'&&['rhino_native_run_command','rhino_native_run_python','rhino_native_run_csharp'].includes(call.toolName)&&(()=>{try{return Boolean(JSON.parse(call.resultJson||'{}').geometryVerification)}catch{return false}})());
      if(executionSource==='rhino'&&documentGeometryWrites.length>0){
        const latest=documentGeometryWrites[documentGeometryWrites.length-1];
        let geometryReport:Record<string,unknown>={status:'inspection_failed'};
        try{geometryReport=JSON.parse(latest.resultJson||'{}').geometryVerification||geometryReport}catch{/* preserve unknown state */}
        if(geometryReport.status!=='passed'){
          const hadRecovery=providerMessages.some(message=>message.role==='system'&&String(message.content||'').startsWith('Rhino document geometry validation requires a correction.'));
          if(!hadRecovery){
            await runModelLoopRef.current(conversationId,assistantMessageId,userText,requestModel,
              [...providerMessages,{role:'system',content:'Rhino document geometry validation requires a correction. The previous native write WAS dispatched and must NEVER be replayed. Exact before/after geometry verification: '+JSON.stringify(geometryReport)+'. Inspect current Rhino objects and viewport; do not repeat the same command/script. If the original geometry is absent or invalid, issue a deliberate new corrective edit once. Preserve unrelated existing objects. The bridge will snapshot and compare that correction. Structural validity/bounds do not establish photo fidelity; compare actual viewport to the reference.'}],
              depth+1,undefined,emptyRecoveryCount,executionSource);
            return;
          }
          patchMessage(assistantMessageId,message=>finalizeChatMessageState({...message,content:'Rhino \u5b9e\u4f53\u5efa\u6a21\u672a\u901a\u8fc7\u524d\u540e\u7ed3\u6784\u6821\u9a8c\uff1a'+String(geometryReport.explanation||geometryReport.status)+'. \u5df2\u6267\u884c\u7684\u5bf9\u8c61\u4fdd\u7559\uff0c\u672a\u91cd\u653e\u811a\u672c\u3002'},'error',Date.now(),'Rhino document geometry verification failed'),true);
          updateConversationBusy(conversationId,false);
          return;
        }
      }
      const profileCalls = currentNativeCalls.filter(call => call.toolName === SAFE_PROFILE_TOOL && call.status === 'completed');
      const validatedOnly = rhinoGeometryRequest && profileCalls.length > 0 && !profileCalls.some(call => {
        try { return JSON.parse(call.resultJson || '{}').status === 'committed'; } catch { return false; }
      });
      if (validatedOnly) {
        const alreadyContinued = providerMessages.some(message => message.role === 'system' && String(message.content || '').startsWith('Controlled profile validation is not a commit.'));
        if (!alreadyContinued) {
          await runModelLoopRef.current(conversationId, assistantMessageId, userText, requestModel,
            [...providerMessages, { role:'system', content:'Controlled profile validation is not a commit. The user asked to build actual Rhino geometry. Use rhino_native_safe_profile_solids with mode commit and the complete validated plan once, then verify returned object IDs. Validation alone must not be reported as modeling complete.' }],
            depth + 1, undefined, emptyRecoveryCount, executionSource);
          return;
        }
        patchMessage(assistantMessageId, message => finalizeChatMessageState({ ...message, content:'Rhino \u51e0\u4f55\u9884\u68c0\u5df2\u901a\u8fc7\uff0c\u4f46\u6a21\u578b\u672a\u5b8c\u6210\u5b9e\u4f53\u5199\u5165\u3002\u5f53\u524d\u4e0d\u80fd\u6807\u8bb0\u4e3a\u5efa\u6a21\u5b8c\u6210\u3002' }, 'error',Date.now(),'Safe profile plan not committed'),true);
        updateConversationBusy(conversationId,false);
        return;
      }
      const currentTurnToolCalls = getConversationMessages(conversationId).find(message => message.id === assistantMessageId)?.toolCalls || [];
      const ghRecoveryContinuationIssued = providerMessages.some(message => message.role === 'system'
        && String(message.content || '').startsWith('GH reflection recovery continuation issued.'));
      const ghRecoveryState = executionSource === 'rhino'
        ? rhinoGhReflectionRecoveryState(currentTurnToolCalls, ghRecoveryContinuationIssued)
        : 'none';
      if (ghRecoveryState === 'continue' && !ghRecoveryContinuationIssued) {
        await runModelLoopRef.current(conversationId, assistantMessageId, userText, requestModel,
          [...providerMessages, { role: 'system', content: 'GH reflection recovery continuation issued. The read-only GH2 canvas inspection succeeded. Use this single continuation to perform the requested modeling with native GH2 tools: preserve the existing graph, discover components as needed, add/connect components, solve, read diagnostics, and verify. Do not call run_python to enumerate assemblies or repeat the failed probe.' }],
          depth + 1, undefined, emptyRecoveryCount, executionSource);
        return;
      }
      if (ghRecoveryState === 'failed' || (ghRecoveryState === 'continue' && ghRecoveryContinuationIssued)) {
        patchMessage(assistantMessageId, message => finalizeChatMessageState({
          ...message,
          content: [normalizeVisibleChatText(message.content), 'GH ???????????? GH2 ?????????????????????????????????? Rhino??????????????'].filter(Boolean).join('\n\n'),
        }, 'error', Date.now(), 'GH2 recovery round did not build a graph'), true);
        updateConversationBusy(conversationId, false);
        return;
      }
      const unresolvedArguments = ghRecoveryState === 'complete' ? undefined
        : executionSource === 'rhino' ? unresolvedRhinoArgumentRejection(currentTurnToolCalls) : undefined;
      if (unresolvedArguments) {
        patchMessage(assistantMessageId, message => finalizeChatMessageState({
          ...message,
          content: JSON.parse(unresolvedArguments.resultJson || '{}').kind === RHINO_SCRIPT_PREFLIGHT_REJECTION ? `Rhino 脚本预检未通过：${unresolvedArguments.toolName}\n本次被拒绝的脚本没有发送到 Rhino，尚未执行。请查看工具回执中的导入或 API 诊断；先前成功的步骤已保留，不会重放。` : JSON.parse(unresolvedArguments.resultJson || '{}').kind === GEOMETRY_PREFLIGHT_REJECTION ? `Rhino 几何预检未通过：${unresolvedArguments.toolName}\n本次几何计划未提交；请查看具体冲突，现有模型保持不变。` : `Rhino MCP 参数检查未通过：${unresolvedArguments.toolName}\n本次调用未发送到 Rhino，请查看工具参数诊断。`,
        }, 'error', Date.now(), 'Native Rhino arguments remain unresolved'), true);
        updateConversationBusy(conversationId, false);
        return;
      }
      const missingPresentationFile = needsPresentationDeliveryRecovery({
        requested: Boolean(presentationText),
        createFileAvailable: tools.some(tool => tool.function.name === 'create_file'),
        explicitExport: isChatPresentationExportRequest(userText),
        content: result.content,
      });
      if (missingPresentationFile) {
        if (emptyRecoveryCount === 0) {
          // Discard this turn's non-delivery draft, not the user's conversation
          // or the successful tool receipts, before a single file-only retry.
          patchMessage(assistantMessageId, message => ({ ...message, content: '' }));
          patchThinkingStep(assistantMessageId, 'presentation-delivery', { type: 'finalizing',
            title: '正在补全 PPT 文件交付', detail: '已提供文件工具；保留现有检索资料和配图，仅重试文件生成', status: 'running' });
          await runModelLoopRef.current(conversationId, assistantMessageId, userText, requestModel,
            providerMessages, depth, undefined, emptyRecoveryCount + 1, executionSource);
          return;
        }
        patchMessage(assistantMessageId, message => finalizeChatMessageState({
          ...message,
          content: 'PPT 尚未生成可下载文件。客户端已提供文件创建工具，但模型未返回有效的文件调用；一次自动续接仍未完成。已有检索资料和配图已保留，可重试或更换 Chat 模型。',
          usage: normalizeUsage(result.usage) || message.usage,
        }, 'error', Date.now(), '模型未完成文件交付'), true);
        updateConversationBusy(conversationId, false);
        return;
      }
      const outcome = classifyChatProviderOutcome({
        content: result.content,
        toolCallCount: 0,
        emptyRecoveryCount,
      });
      if (outcome === 'complete') {
        patchMessage(assistantMessageId, message => finalizeChatMessageState({
          ...message,
          content: normalizeVisibleChatText(message.content),
          usage: normalizeUsage(result.usage) || message.usage,
        }, 'completed'), true);
        updateConversationBusy(conversationId, false);
        void maybeSummarize(conversationId);
        return;
      }
      const emptyCause = classifyEmptyChatContinuation(result.toolCalls?.length || 0, toolCalls.length);
      console.warn(emptyCause === 'filtered-tools' ? 'Chat continuation contained only blocked duplicate/quota tool calls' : 'Chat provider returned an empty successful result', {
        requestId: result.requestId || expectedRequestId,
        model: requestModel,
        finishReason: result.finishReason,
        contentLength: result.content.length,
        reasoningLength: result.reasoning?.length || 0,
        toolCallCount: result.toolCalls?.length || 0,
        hasUsage: Boolean(result.usage),
        emptyRecoveryCount,
      });
      if (outcome === 'recover-empty') {
        patchThinkingStep(assistantMessageId, 'model-recovery', { type: 'finalizing',
          title: emptyCause === 'filtered-tools' ? '已拦截重复工具，正在恢复后续任务' : '模型未返回有效内容，正在恢复',
          detail: searchResultCount > 0 ? '已有检索资料保留；切换精简非流式续接，不再次执行搜索' : '未重复执行已完成工具', status: 'running' });
        await runModelLoopRef.current(
          conversationId,
          assistantMessageId,
          userText,
          requestModel,
          providerMessages,
          depth,
          undefined,
          emptyRecoveryCount + 1,
          executionSource,
        );
        return;
      }
      patchThinkingStep(assistantMessageId, 'model-output-diagnostic', { type: 'context',
        title: '模型输出诊断', status: 'error', detail: `stage=${searchResultCount > 0 ? 'post-search' : 'reply'}; cause=${emptyCause}; finishReason=${result.finishReason || 'unknown'}; contentChars=${result.content?.length || 0}; reasoningChars=${result.reasoning?.length || 0}; rawToolCalls=${result.toolCalls?.length || 0}; acceptedToolCalls=${toolCalls.length}` });
      patchMessage(assistantMessageId, message => finalizeChatMessageState({
        ...message,
        content: searchResultCount > 0 ? chatSearchModelFailureMessage(providerMessages, Boolean(presentationText), emptyCause === 'filtered-tools') : EMPTY_CHAT_RESULT_ERROR,
        usage: normalizeUsage(result.usage) || message.usage,
      }, 'error', Date.now(), emptyCause === 'filtered-tools' ? '重复工具已拦截，模型未完成后续任务' : searchResultCount > 0 ? '搜索已成功，模型整理阶段连续返回空响应' : '上游连续返回空结果'), true);
      updateConversationBusy(conversationId, false);
      return;
    }
    const preparedToolCalls = toolCalls.map(call => {
      if (call.name !== 'generate_image_variants') return call;
      try {
        const args = parseArguments(call.arguments || '{}');
        const route = resolveImageVariantToolRoute({ args, requireMultiple: false });
        return {
          ...call,
          name: route.toolName,
          arguments: JSON.stringify(route.args),
        };
      } catch (_) {
        return call;
      }
    });
    const calls: ChatToolCall[] = preparedToolCalls.map(call => ({
      id: call.id || createChatId('chat-tool'),
      messageId: assistantMessageId,
      toolName: call.name,
      argumentsJson: call.arguments || '{}',
      status: 'pending',
      createdAt: Date.now(),
    }));
    calls.forEach((call, callIndex) => {
      patchThinkingStep(assistantMessageId, `tool-${callIndex}`, {
        type: call.toolName === 'web_search' ? 'search' : 'tool',
        title: getChatToolStepTitle(call.toolName, 'pending'),
        detail: '工具调用已准备',
        status: 'pending',
      });
    });
    const proposedBatchCall = calls.find(call => call.toolName === 'batch_image_operation');
    if (proposedBatchCall) {
      const batchPlan = extractChatBatchImagePlan(
        { ...result, toolCalls: preparedToolCalls },
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
      const proposedBatchIndex = calls.indexOf(proposedBatchCall);
      patchThinkingStep(assistantMessageId, `tool-${Math.max(0, proposedBatchIndex)}`, {
        type: 'tool',
        title: getChatToolStepTitle(proposedBatchCall.toolName, 'awaiting-approval'),
        detail: '方案已生成，等待自然语言确认或修改',
        status: 'awaiting-approval',
      });
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
        reasoningStatus: message.reasoning?.trim() ? 'completed' : 'unavailable',
        reasoningCompletedAt: message.reasoningCompletedAt || Date.now(),
        generationCompletedAt: Date.now(),
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
        emptyRecoveryCount,
        executionSource,
      });
      updateConversationBusy(conversationId, false);
      return;
    }
    await Promise.all(calls.map(call => upsertChatToolCall(call)));
    patchMessage(assistantMessageId, message => ({ ...message, toolCalls: mergePresentationToolCalls(message.toolCalls, calls) }), true);
    const assistantToolMessage = {
      role: 'assistant',
      content: result.content || null,
      tool_calls: preparedToolCalls.map(call => ({
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
      emptyRecoveryCount,
      executionSource,
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
    resumeRequestId?: string,
    executionSource: ChatExecutionSource = 'desktop',
    targetConversationId?: string,
  ) => {
    const text = content.trim();
    if (!text && pendingAttachments.length === 0) return false;
    let conversation = conversationsRef.current.find(item => item.id === (targetConversationId || activeConversationIdRef.current));
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
      // This reply is deliberately classified locally.  A second internal LLM
      // request here used to leave the composer spinning indefinitely when that
      // request stalled, even though the user had already submitted a reply.
      // The deterministic matcher is also safer for the explicit confirmation
      // and cancellation phrases shown in the plan message.
      const planDecision = pendingAttachments.length > 0
        ? 'revise'
        : fallbackBatchPlanDecision(text);
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
        const executionMessage: ChatMessage = createStreamingAssistantState({
          id: executionMessageId,
          conversationId,
          role: 'assistant',
          content: '',
          status: 'streaming',
          createdAt: now + 2,
          attachments: [],
          toolCalls: [executionCall],
        }, now + 2);
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
          if (optionsRef.current.cloudWalletMode) {
            optionsRef.current.onWalletSettlementComplete?.();
          }
          return true;
        } catch (error) {
          activeRequestsRef.current.delete(conversationId);
          activeBatchRunsRef.current.delete(conversationId);
          updateConversationBusy(conversationId, false);
          patchMessage(executionMessageId, message => finalizeChatMessageState({
            ...message,
            content: normalizeVisibleChatText(message.content) || '确认后的批量任务没有完成。',
          }, 'error', Date.now(), '批量任务执行中断'), true);
          optionsRef.current.onNotice?.(`Chat 请求失败：${String(error)}`);
          return false;
        }
      }
    }
    if (conversation && (
      busyConversationIdsRef.current.has(conversation.id)
      || pendingApprovalsRef.current.has(conversation.id)
    )) return false;
    const selectedRequestModel = resolveChatRequestModel(
      selectedModel,
      conversation?.model,
      optionsRef.current.model,
    );
    const requestModel = resolveValidAgentModel({
      savedModel: selectedRequestModel,
      availableModels: optionsRef.current.modelOptions,
      usageContext: 'chat',
    }).resolvedModel;
    if (conversation && conversation.model !== requestModel && (
      normalizeChatModelSelection(selectedModel)
      || selectedRequestModel !== requestModel
    )) {
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
    if (!resumeRequestId) {
      recoverableRequestIdsRef.current.delete(conversationId);
      cancelledToolRunsRef.current.delete(conversationId);
    }
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
    const assistantMessage: ChatMessage = createStreamingAssistantState({
      id: createChatId('chat-assistant'),
      conversationId: conversation.id,
      role: 'assistant',
      content: '',
      status: 'streaming',
      createdAt: now + 1,
      attachments: [],
      toolCalls: [],
    }, now + 1);
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
      if (imageSelection.attachments.length > 0) {
        patchThinkingStep(assistantMessage.id, 'attachments', {
          type: 'attachment',
          title: '正在处理参考图片',
          detail: `${imageSelection.attachments.length} 张图片`,
          status: 'running',
        });
      }
      if (existingMessages.length > 0 || requestSummary) {
        patchThinkingStep(assistantMessage.id, 'context', {
          type: 'context',
          title: '正在读取对话上下文',
          detail: requestSummary ? '包含历史摘要与最近消息' : '包含最近消息',
          status: 'running',
        });
      }
      const memoryOptions = { title: conversation.title, projectId: optionsRef.current.designMemoryProjectId };
      await rememberExplicitChatDesign(userMessage, memoryOptions).catch(() => {});
      const recalledDesignMemory = await recallDesignMemoryForTurn(
        userMessage.content,
        designMemoryProjectId(conversationId, memoryOptions.projectId),
        conversationId,
      );
      const providerMessages = await buildChatContext({
        messages: nextMessages,
        latestUserMessage: userMessage,
        summary: requestSummary,
        designMemoryRecall: recalledDesignMemory,
        presentationBrief: resolvePresentationTurnText(userMessage.content, getConversationMessages(conversationId)),
        resolveAttachmentUrl: visionResolver?.resolve || optionsRef.current.resolveAttachmentUrl,
        visionAttachments: imageSelection.attachments,
        reusedVisionAttachments: imageSelection.reusedFromHistory,
        skill: getSelectedChatSkill(conversation.id),
      });
      const memoryReport = getDesignMemoryTurnReport(providerMessages);
      if (memoryReport) {
        patchThinkingStep(assistantMessage.id, 'design-memory', {
          type: 'context', ...describeDesignMemoryTurn(memoryReport), status: 'completed',
        });
      }
      if (imageSelection.attachments.length > 0) {
        patchThinkingStep(assistantMessage.id, 'attachments', {
          type: 'attachment',
          title: memoryReport?.unavailableImageCount ? '部分参考图片未成功提供' : '参考图片已就绪',
          detail: memoryReport
            ? `${memoryReport.attachedImageCount} 张图片已提供，${memoryReport.unavailableImageCount} 张未成功提供`
            : `${imageSelection.attachments.length} 张图片`,
          status: 'completed',
        });
      }
      if (existingMessages.length > 0 || requestSummary) {
        patchThinkingStep(assistantMessage.id, 'context', {
          type: 'context',
          title: '对话上下文已读取',
          status: 'completed',
        });
      }
      const visionFailures = visionResolver?.failures() || [];
      if (visionFailures.length > 0) {
        optionsRef.current.onNotice?.(
          formatReferenceUploadFailureNotice(visionFailures.map(failure => failure.error)),
        );
      }
      await runModelLoop(
        conversation.id,
        assistantMessage.id,
        userMessage.content,
        requestModel,
        providerMessages,
        0,
        resumeRequestId,
        0,
        executionSource,
      );
      if (optionsRef.current.cloudWalletMode) {
        optionsRef.current.onWalletSettlementComplete?.();
      }
      recoverableRequestIdsRef.current.delete(conversationId);
      return true;
    } catch (error) {
      const cancelled = /取消|cancel/i.test(String(error));
      flushStreamDelta(assistantMessage.id);
      const currentAssistantMessage = messageCacheRef.current.get(assistantMessage.id);
      const interruptedPresentation = resolvePresentationTurnText(userMessage.content, getConversationMessages(conversationId));
      const pendingPresentation = shouldContinuePresentationAfterMedia(interruptedPresentation, currentAssistantMessage?.toolCalls || []);
      const hasNativeCheckpoint = executionSource === 'rhino' && currentAssistantMessage?.toolCalls.some(call => (
        call.toolName.startsWith('rhino_native_') && call.status === 'completed'
      ));
      const visibleCompletion = pendingPresentation ? null : summarizeCompletedVisibleToolCalls(
        currentAssistantMessage?.toolCalls || [],
      );
      patchMessage(assistantMessage.id, message => visibleCompletion
        ? finalizeChatMessageState({
          ...message,
          content: [normalizeVisibleChatText(message.content), visibleCompletion.content]
            .filter(Boolean)
            .join('\n\n'),
          thinkingSteps: message.thinkingSteps?.filter(step => (
            !step.id.endsWith(':thinking:connection')
            && !step.id.endsWith(':thinking:provider-status')
          )),
        }, 'completed')
        : finalizeChatMessageState({
          ...message,
          content: hasNativeCheckpoint && !cancelled
            ? [message.content.trim(), `Rhino MCP \u540e\u7eed\u6b65\u9aa4\u672a\u5b8c\u6210\uff1a${visibleChatRequestError(error)}\n\u5df2\u6267\u884c\u7684\u5de5\u5177\u6b65\u9aa4\u5df2\u4fdd\u7559\uff0c\u4e0d\u4f1a\u81ea\u52a8\u91cd\u653e\u3002`].filter(Boolean).join('\n\n')
            : pendingPresentation ? presentationInterruptedMessage(message.toolCalls) + '\n' + visibleChatRequestError(error) : message.content.trim() || (cancelled ? '已停止生成。' : visibleChatRequestError(error)),
        }, cancelled ? 'cancelled' : 'error', Date.now(), cancelled ? '用户停止生成' : '连接中断'), true);
      const failedRequest = activeRequestsRef.current.get(conversationId);
      if (failedRequest?.messageId === assistantMessage.id) {
        if (!visibleCompletion && !cancelled && isRecoverableChatRequestError(error)) {
          recoverableRequestIdsRef.current.set(conversationId, failedRequest.requestId);
        }
        activeRequestsRef.current.delete(conversationId);
      }
      const failedBatch = activeBatchRunsRef.current.get(conversationId);
      if (failedBatch?.messageId === assistantMessage.id) {
        activeBatchRunsRef.current.delete(conversationId);
      }
      if (!activeRequestsRef.current.has(conversationId)
        && !activeBatchRunsRef.current.has(conversationId)) {
        updateConversationBusy(conversationId, false);
      } else if (activeConversationIdRef.current === conversationId) {
        syncActiveConversationActivity(conversationId);
      }
      if (!visibleCompletion && !cancelled) {
        optionsRef.current.onNotice?.(`Chat 请求失败：${String(error)}`);
      }
      return Boolean(visibleCompletion || cancelled);
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
    flushStreamDelta,
    patchMessage,
    patchThinkingStep,
    runModelLoop,
    syncActiveConversationActivity,
    updateConversationBusy,
  ]);

  const stop = useCallback(async (targetConversationId?: string) => {
    const conversationId = targetConversationId || activeConversationIdRef.current;
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
    if (!active) {
      if (activeToolMessagesRef.current.has(conversationId)) {
        cancelledToolRunsRef.current.add(conversationId);
        syncActiveConversationActivity(conversationId);
      }
      return;
    }
    activeRequestsRef.current.delete(conversationId);
    flushStreamDelta(active.messageId);
    patchMessage(active.messageId, message => finalizeChatMessageState({
      ...message,
      content: message.content.trim() || '已停止生成。',
    }, 'cancelled', Date.now(), '用户停止生成'), true);
    updateConversationBusy(conversationId, false);
    await cancelChatCompletion(active.requestId).catch(() => {});
  }, [flushStreamDelta, patchMessage, syncActiveConversationActivity, updateConversationBusy]);

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
        if (optionsRef.current.cloudWalletMode) {
          optionsRef.current.onWalletSettlementComplete?.();
        }
        return;
      }
      call.status = 'pending';
      call.resultJson = null;
      call.completedAt = null;
      await continueToolCalls({ ...pending, calls: [...pending.calls] }, callId);
      if (optionsRef.current.cloudWalletMode) {
        optionsRef.current.onWalletSettlementComplete?.();
      }
    } catch (error) {
      pendingApprovalsRef.current.delete(conversationId);
      activeRequestsRef.current.delete(conversationId);
      activeBatchRunsRef.current.delete(conversationId);
      updateConversationBusy(conversationId, false);
      patchMessage(pending.assistantMessageId, message => finalizeChatMessageState({
        ...message,
        content: message.content.trim() || '确认后的请求没有完成。',
      }, 'error', Date.now(), '工具确认后的请求中断'), true);
      optionsRef.current.onNotice?.(`Chat 请求失败：${String(error)}`);
    }
  }, [continueToolCalls, patchMessage, updateConversationBusy]);

  const retryLast = useCallback(async () => {
    const lastUser = [...messagesRef.current].reverse().find(message => message.role === 'user');
    if (!lastUser) return false;
    const resumeRequestId = recoverableRequestIdsRef.current.get(lastUser.conversationId);
    return sendMessage(lastUser.content, lastUser.attachments.map((attachment, index) => ({
      ...attachment,
      id: createChatId(`chat-retry-attachment-${index}`),
      messageId: undefined,
      createdAt: undefined,
    })), undefined, undefined, resumeRequestId);
  }, [sendMessage]);

  const selectConversation = useCallback(async (id: string) => {
    if (id === activeConversationIdRef.current) return;
    const conversation = conversationsRef.current.find(item => item.id === id);
    if (!conversation || !chatConversationInScope(conversation, conversationScope)) {
      optionsRef.current.onNotice?.('? Chat ??????????????');
      return;
    }
    await loadConversation(id);
  }, [conversationScope, loadConversation]);

  const removeConversation = useCallback(async (id: string) => {
    const conversation = conversationsRef.current.find(item => item.id === id);
    if (!conversation || !chatConversationInScope(conversation, conversationScope)) return false;
    if (busyConversationIdsRef.current.has(id) || pendingApprovalsRef.current.has(id) || activeToolMessagesRef.current.has(id)) {
      optionsRef.current.onNotice?.('\u8be5\u5bf9\u8bdd\u4ecd\u6709\u4efb\u52a1\u5728\u8fd0\u884c\uff0c\u8bf7\u7b49\u5f85\u5b8c\u6210\u6216\u5148\u505c\u6b62\u4efb\u52a1\u3002');
      return false;
    }
    if (!await deleteChatConversation(id)) return false;
    for (const [messageId, message] of messageCacheRef.current) {
      if (message.conversationId !== id) continue;
      const persistTimer = persistTimersRef.current.get(messageId);
      const streamTimer = streamFlushTimersRef.current.get(messageId);
      if (persistTimer !== undefined) window.clearTimeout(persistTimer);
      if (streamTimer !== undefined) window.clearTimeout(streamTimer);
      persistTimersRef.current.delete(messageId);
      streamFlushTimersRef.current.delete(messageId);
      streamBuffersRef.current.delete(messageId);
      messageCacheRef.current.delete(messageId);
    }
    const next = conversationsRef.current.filter(item => item.id !== id);
    conversationsRef.current = next;
    setConversations(next);
    if (id === activeConversationIdRef.current) {
      if (next[0]) await loadConversation(next[0].id);
      else await createConversation(optionsRef.current.model, conversationScope === 'rhino' ? 'Rhino \u5bf9\u8bdd' : undefined);
    }
    return true;
  }, [conversationScope, createConversation, loadConversation]);

  const removeConversations = useCallback(async (ids: string[]) => {
    const requested = new Set(ids);
    const deletable = conversationsRef.current.filter(item => requested.has(item.id) && !busyConversationIdsRef.current.has(item.id) && !pendingApprovalsRef.current.has(item.id));
    if (deletable.length !== requested.size) optionsRef.current.onNotice?.('正在运行的对话已保留。');
    const deleted = new Set(await deleteChatConversations(deletable.map(item => item.id), (_id, error) => optionsRef.current.onNotice?.(`删除会话失败：${String(error)}`)));
    for (const [id, message] of messageCacheRef.current) if (deleted.has(message.conversationId)) messageCacheRef.current.delete(id);
    const next = conversationsRef.current.filter(item => !deleted.has(item.id));
    conversationsRef.current = next;
    setConversations(next);
    if (deleted.has(activeConversationIdRef.current)) {
      if (next[0]) await loadConversation(next[0].id); else await createConversation();
    }
    return [...deleted];
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
    deleteConversations: removeConversations,
    loadOlderMessages,
    setConversationModel,
    searchConversations,
    setWebSearchEnabled,
    messagesForConversation: (id: string) => getConversationMessages(id),
    isConversationBusy: (id: string) => busyConversationIdsRef.current.has(id) || pendingApprovalsRef.current.has(id),
    isConversationStoppable: (id: string) => activeRequestsRef.current.has(id) || activeBatchRunsRef.current.has(id)
      || (activeToolMessagesRef.current.has(id) && !cancelledToolRunsRef.current.has(id)),
  };
}
