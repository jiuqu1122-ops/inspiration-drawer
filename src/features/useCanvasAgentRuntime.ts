import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_AGENT_SETTINGS,
  DEFAULT_AGENT_SYSTEM_PROMPT,
  createAgentConversation,
  createAgentId,
  normalizeCodexModelOverride,
  normalizeCodexReasoningEffort,
  isBuiltInAgentSystemPrompt,
  type AgentCanvasContext,
  type AgentCanvasSelectionItem,
  type AgentCanvasVisualReference,
  type AgentApiBalanceResult,
  type AgentApiConnectionResult,
  type AgentCanvasToolExecutor,
  type AgentChatMessage,
  type AgentCodexApproval,
  type AgentConversation,
  type AgentProvider,
  type AgentSendOptions,
  type AgentSettings,
  type AgentThinkingStep,
  type AgentThinkingStepStatus,
  type AgentToolCall,
  type CodexInstallProgress,
  type CodexLoginInfo,
  type CodexModelOption,
  type CodexRateLimits,
  type CodexRateLimitWindow,
  type CodexRuntimeStatus,
  type WorkflowResultCardData,
} from './agentModel';
import {
  CANVAS_AGENT_ACTION_SCHEMA,
  CANVAS_AGENT_TOOL_DEFINITIONS,
  buildCanvasAgentSystemPrompt,
  getCanvasAgentToolLabel,
  isCanvasAgentToolReadOnly,
  parseAgentArguments,
  parseCodexCanvasEnvelope,
} from './canvasAgentTools';
import { repairLegacyAgentAction, validateLegacyAgentAction } from './appAgent/commands/commandValidator';
import type { LegacyAgentAction } from './appAgent/commands/commandTypes';
import { evaluateLegacyActionPermission } from './appAgent/commands/permissionGate';
import { prepareAppAgentTurn } from './appAgent/runtime/useAppAgentRuntime';
import {
  buildWorkflowDraftProposalMessages,
  detectWorkflowDesignIntent,
  parseWorkflowDraftProposal,
  resolveWorkflowPlanningRoute,
  workflowDraftProposalToRecipeDraft,
  type WorkflowPlanningAvailability,
  type WorkflowPlanningRoute,
} from './appAgent/workflows/workflowPlanning';
import {
  bindPlanStepResult,
  createPlanStepBindingState,
  resolvePlanStepActionInputs,
  withCreatedNodesInContext,
} from './appAgent/runtime/planStepExecutor';
import type { AppAgentTraceRecord } from './appAgent/trace/appAgentTrace';
import { appendAppAgentTrace, upsertAppAgentTrace } from './appAgent/trace/traceStore';
import {
  clearStoredAgentConversations,
  readActiveAgentConversationId,
  readAgentConversations,
  writeActiveAgentConversationId,
  writeAgentConversations,
} from './agentStorage';
import { upsertWorkflowResultMessage } from './workflowResult';

type RuntimeOptions = {
  getContext: () => AgentCanvasContext;
  getActiveDraft?: () => import('./appAgent/workflows/workflowRecipeTypes').WorkflowRecipeDraft | null;
  prepareVisualReferences?: (
    context: AgentCanvasContext,
    provider: AgentProvider,
  ) => Promise<AgentCanvasVisualReference[]>;
  executeTool: AgentCanvasToolExecutor;
  onNotice?: (message: string) => void;
};

type AgentSendSnapshot = {
  context: AgentCanvasContext;
  selectedItems: AgentCanvasSelectionItem[];
  selectedIds: string[];
  visualReferences: AgentCanvasVisualReference[];
  userRequest?: string;
  appAgentTrace?: AppAgentTraceRecord;
};

type OpenAiToolCallResult = {
  id: string;
  name: string;
  arguments: string;
};

type OpenAiChatResult = {
  requestId: string;
  content: string;
  toolCalls: OpenAiToolCallResult[];
  finishReason?: string;
};

type PendingToolRun = {
  conversationId: string;
  assistantMessageId: string;
  provider: AgentProvider;
  snapshot?: AgentSendSnapshot;
  providerMessages?: Array<Record<string, unknown>>;
  calls: AgentToolCall[];
  depth: number;
  userRequest?: string;
  trace?: AppAgentTraceRecord;
  repaired?: boolean;
  deterministicActionsUsed?: boolean;
};

type PendingCodexTurn = {
  conversationId: string;
  assistantMessageId: string;
  threadId: string;
  turnId?: string;
  raw: string;
  deltaChars: number;
  deltaReceived: boolean;
  lastDeltaUiAt: number;
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timeoutId: number;
  noticeTimeoutId?: number;
  fallbackTimeoutId?: number;
  fallbackStarted?: boolean;
};

const createToolCallFromLegacyAction = (
  action: LegacyAgentAction,
  idPrefix: string,
): AgentToolCall => ({
  id: createAgentId(idPrefix),
  name: action.tool,
  arguments: action.arguments,
  status: 'pending',
  stepId: action.stepId,
  createsNode: action.createsNode,
  outputRef: action.outputRef,
  sourceCommandId: action.sourceCommandId,
});

const toolCallToLegacyAction = (call: AgentToolCall): LegacyAgentAction => ({
  tool: call.name,
  arguments: call.arguments,
  stepId: call.stepId,
  createsNode: call.createsNode,
  outputRef: call.outputRef,
  sourceCommandId: call.sourceCommandId,
});

const collectWorkflowTraceFromCalls = (calls: AgentToolCall[]) => {
  const imageNodeIds = new Set<string>();
  const missingInputs = new Set<string>();
  const connections = new Map<string, { sourceId: string; targetId: string }>();
  const selectedCanvasImageNodeIds = new Set<string>();
  const reusedExistingImageNodes = new Set<string>();
  const createdImageNodes = new Set<string>();
  const unresolvedThumbnailNodes = new Set<string>();
  let duplicateImageNodesPrevented = 0;
  let thumbnailPlaceholdersCreated = 0;
  calls.forEach(call => {
    const result = call.result && typeof call.result === 'object' && !Array.isArray(call.result)
      ? call.result as Record<string, unknown>
      : {};
    const addIds = (value: unknown) => {
      if (!Array.isArray(value)) return;
      value.map(String).filter(Boolean).forEach(id => imageNodeIds.add(id));
    };
    addIds(result.workflowResolvedImageNodeIds);
    if (Array.isArray(result.workflowAutoConnections)) {
      result.workflowAutoConnections.forEach(connection => {
        const record = connection && typeof connection === 'object' && !Array.isArray(connection)
          ? connection as Record<string, unknown>
          : {};
        const sourceId = String(record.sourceId || '');
        const targetId = String(record.targetId || '');
        if (!sourceId || !targetId) return;
        connections.set(`${sourceId}->${targetId}`, { sourceId, targetId });
        imageNodeIds.add(sourceId);
      });
    }
    if (Array.isArray(result.workflowMissingRequiredInputs)) {
      result.workflowMissingRequiredInputs.map(String).filter(Boolean).forEach(message => missingInputs.add(message));
    }
    if (Array.isArray(result.inputs) && Array.isArray(result.workflowAutoConnections)) {
      addIds(result.inputs);
    }
    const resolutions = Array.isArray(result.workflowInputResolution)
      ? result.workflowInputResolution
      : [result.workflowInputResolution];
    resolutions
      .map(value => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null)
      .filter((value): value is Record<string, unknown> => !!value)
      .forEach(resolution => {
      [
        [resolution.selectedCanvasImageNodeIds, selectedCanvasImageNodeIds],
        [resolution.reusedExistingImageNodes, reusedExistingImageNodes],
        [resolution.createdImageNodes, createdImageNodes],
        [resolution.unresolvedThumbnailNodes, unresolvedThumbnailNodes],
      ].forEach(([value, target]) => {
        if (!Array.isArray(value)) return;
        value.map(String).filter(Boolean).forEach(id => (target as Set<string>).add(id));
      });
      duplicateImageNodesPrevented += Number(resolution.duplicateImageNodesPrevented || 0);
      thumbnailPlaceholdersCreated += Number(resolution.thumbnailPlaceholdersCreated || 0);
    });
  });
  return {
    workflowResolvedImageNodeIds: Array.from(imageNodeIds),
    workflowAutoConnections: Array.from(connections.values()),
    workflowMissingRequiredInputs: Array.from(missingInputs),
    workflowInputResolution: {
      selectedCanvasImageNodeIds: Array.from(selectedCanvasImageNodeIds),
      reusedExistingImageNodes: Array.from(reusedExistingImageNodes),
      createdImageNodes: Array.from(createdImageNodes),
      duplicateImageNodesPrevented,
      thumbnailPlaceholdersCreated,
      unresolvedThumbnailNodes: Array.from(unresolvedThumbnailNodes),
    },
  };
};

const CANVAS_AGENT_CODEX_THREAD_PROTOCOL = 'software-agent-full-control-v5';
const AGENT_MAX_TOOL_ROUNDS = 10;
const AGENT_THINKING_STEP_LIMIT = 24;
const AGENT_THINKING_TERMINAL_STATUSES = new Set<AgentThinkingStepStatus>([
  'completed',
  'cancelled',
  'error',
]);

const clearPendingCodexTimers = (pending: PendingCodexTurn) => {
  window.clearTimeout(pending.timeoutId);
  if (pending.noticeTimeoutId !== undefined) window.clearTimeout(pending.noticeTimeoutId);
  if (pending.fallbackTimeoutId !== undefined) window.clearTimeout(pending.fallbackTimeoutId);
};

const buildThinkingStepId = (messageId: string, key: string) => (
  `${messageId}:thinking:${key}`
);

const getEffectiveCodexModel = (
  settings: AgentSettings,
  forceDefaultModel = false,
) => {
  if (settings.provider === 'openai-compatible') return settings.apiModel.trim();
  return forceDefaultModel ? '' : normalizeCodexModelOverride(settings.codexModel);
};

const getEffectiveCodexReasoningEffort = (settings: AgentSettings) => (
  settings.provider === 'openai-compatible'
    ? 'medium'
    : normalizeCodexReasoningEffort(settings.codexReasoningEffort)
);

const getEffectiveCodexSandbox = (settings: AgentSettings) => (
  settings.provider === 'openai-compatible' ? 'workspace-write' : settings.codexSandbox
);

const getEffectiveCodexApprovalPolicy = (settings: AgentSettings) => (
  settings.provider === 'openai-compatible' ? 'on-request' : settings.codexApprovalPolicy
);

const resolveAgentPlanningAvailability = (
  settings: AgentSettings,
  codexStatus: CodexRuntimeStatus | null,
): WorkflowPlanningAvailability => {
  if (settings.provider === 'codex') {
    const modelLabel = getEffectiveCodexModel(settings) || 'Codex 默认模型';
    return {
      provider: settings.provider,
      modelLabel,
      canPlanWorkflow: codexStatus?.authenticated === true,
      reason: codexStatus?.authenticated === true ? undefined : '未登录 ChatGPT / Codex',
    };
  }

  const hasBaseUrl = !!settings.apiBaseUrl.trim();
  const hasModel = !!settings.apiModel.trim();
  const isCloudWallet = settings.apiCredentialSource === 'cloud_wallet'
    || settings.apiProvider === 'unmind-wallet';
  const canPlanWorkflow = (settings.hasApiKey || isCloudWallet) && hasBaseUrl && hasModel;
  return {
    provider: settings.provider,
    modelLabel: settings.apiModel.trim() || 'API 模型',
    canPlanWorkflow,
    reason: canPlanWorkflow
      ? undefined
      : !settings.hasApiKey && !isCloudWallet
        ? '未配置 Agent API Key'
        : !hasBaseUrl
          ? '未配置 Agent API Base URL'
          : '未配置 Agent API 模型',
  };
};

const buildCodexThreadKey = (
  settings: AgentSettings,
  forceDefaultModel = false,
  systemPrompt = settings.systemPrompt,
) => JSON.stringify({
  protocol: CANVAS_AGENT_CODEX_THREAD_PROTOCOL,
  provider: settings.provider,
  model: getEffectiveCodexModel(settings, forceDefaultModel),
  reasoningEffort: getEffectiveCodexReasoningEffort(settings),
  sandbox: getEffectiveCodexSandbox(settings),
  approvalPolicy: getEffectiveCodexApprovalPolicy(settings),
  ...(settings.provider === 'openai-compatible' ? {
    apiBaseUrl: settings.apiBaseUrl,
    apiHeaders: settings.apiHeaders,
  } : {}),
  systemPrompt,
});

const normalizeAgentSettings = (value: unknown): AgentSettings => {
  const record = value && typeof value === 'object' ? value as Partial<AgentSettings> : {};
  const rawSystemPrompt = typeof record.systemPrompt === 'string' ? record.systemPrompt : '';
  const systemPrompt = isBuiltInAgentSystemPrompt(rawSystemPrompt)
    ? DEFAULT_AGENT_SYSTEM_PROMPT
    : rawSystemPrompt;
  return {
    ...DEFAULT_AGENT_SETTINGS,
    ...record,
    systemPrompt,
    provider: record.provider === 'codex' ? 'codex' : 'openai-compatible',
    apiGatewayKind: ['new_api', 'xais', 'openai_compatible', 'custom'].includes(String(record.apiGatewayKind))
      ? record.apiGatewayKind as AgentSettings['apiGatewayKind']
      : 'openai_compatible',
    apiProvider: typeof record.apiProvider === 'string' && record.apiProvider.trim()
      ? record.apiProvider.trim()
      : 'openai-compatible',
    apiHeaders: record.apiHeaders && typeof record.apiHeaders === 'object' ? record.apiHeaders : {},
    apiEditable: record.apiEditable !== false,
    apiCredentialSource: typeof record.apiCredentialSource === 'string' ? record.apiCredentialSource : 'user_settings',
    apiKeyLast4: typeof record.apiKeyLast4 === 'string' ? record.apiKeyLast4 : null,
    apiError: typeof record.apiError === 'string' ? record.apiError : null,
    codexModel: normalizeCodexModelOverride(record.codexModel),
    codexReasoningEffort: normalizeCodexReasoningEffort(record.codexReasoningEffort),
    codexSandbox: ['workspace-write', 'danger-full-access'].includes(String(record.codexSandbox))
      ? record.codexSandbox as AgentSettings['codexSandbox']
      : 'read-only',
    codexApprovalPolicy: ['untrusted', 'on-failure', 'never'].includes(String(record.codexApprovalPolicy))
      ? record.codexApprovalPolicy as AgentSettings['codexApprovalPolicy']
      : 'on-request',
    approvalMode: record.approvalMode === 'auto' ? 'auto' : 'ask',
  };
};

const trimConversationTitle = (text: string) => {
  const firstLine = text.trim().split(/\r?\n/)[0] || '新对话';
  return firstLine.length > 24 ? `${firstLine.slice(0, 24)}…` : firstLine;
};

const makeProviderHistory = (conversation: AgentConversation) => conversation.messages
  .filter(message => (message.role === 'user' || message.role === 'agent') && message.content.trim())
  .filter(message => message.status !== 'error' && message.status !== 'cancelled')
  .slice(-40)
  .map(message => ({
    role: message.role === 'agent' ? 'assistant' : 'user',
    content: message.content,
  }));

const buildLocalConversationHistoryPrompt = (
  conversation: AgentConversation,
  currentAssistantMessageId?: string,
) => {
  const lines = conversation.messages
    .filter(message => message.id !== currentAssistantMessageId)
    .filter(message => (message.role === 'user' || message.role === 'agent') && message.content.trim())
    .filter(message => message.status !== 'error' && message.status !== 'cancelled')
    .slice(-18)
    .map(message => {
      const role = message.role === 'user' ? '用户' : 'Agent';
      const content = message.content.trim().replace(/\s+/g, ' ');
      const compact = content.length > 600 ? content.slice(0, 600) + '…' : content;
      return role + ': ' + compact;
    });
  if (lines.length === 0) return '';
  return [
    '以下是灵感抽屉软件本地保存的当前对话历史。它是权威历史来源；不要依赖 Codex CLI thread 是否存在或是否连续。',
    ...lines,
  ].join('\n');
};

const describeReferenceSource = (source?: string) => {
  const value = String(source || '').trim();
  if (!value) return undefined;
  if (/^data:image\//i.test(value)) return '[attached image data]';
  return value.length > 180 ? `${value.slice(0, 180)}…` : value;
};

const sanitizeVisualReferenceForPrompt = (reference: AgentCanvasVisualReference) => ({
  id: reference.id,
  nodeId: reference.nodeId,
  outputId: reference.outputId,
  name: reference.name,
  mediaType: reference.mediaType,
  source: describeReferenceSource(reference.source || reference.thumbnail),
  hasLocalPath: !!reference.path,
});

const sanitizeCanvasContextForPrompt = (context: AgentCanvasContext): AgentCanvasContext => ({
  ...context,
  selectedItems: context.selectedItems?.map(item => ({
    id: item.id,
    name: item.name,
    type: item.type,
    status: item.status,
    prompt: item.prompt,
    thumbnail: describeReferenceSource(item.thumbnail),
    referenceCount: item.referenceCount || item.references?.length || 0,
    references: item.references?.map(sanitizeVisualReferenceForPrompt),
  })),
  visualReferences: context.visualReferences?.map(sanitizeVisualReferenceForPrompt),
});

const visualReferenceNotice = (references: AgentCanvasVisualReference[]) => {
  const usable = references.filter(reference => reference.mediaType === 'image');
  if (usable.length === 0) return '';
  return [
    '当前可用参考图已随本轮消息附加：',
    ...usable.slice(0, 6).map((reference, index) => (
      `${index + 1}. ${reference.name}（nodeId: ${reference.nodeId}${reference.outputId ? `, outputId: ${reference.outputId}` : ''}）`
    )),
  ].join('\n');
};

const buildOpenAiUserContent = (
  text: string,
  references: AgentCanvasVisualReference[],
) => {
  const imageReferences = references
    .filter(reference => reference.mediaType === 'image' && /^data:image\/|^https?:\/\//i.test(reference.source || ''))
    .slice(0, 6);
  const notice = visualReferenceNotice(imageReferences);
  const textPart = [text, notice].filter(Boolean).join('\n\n');
  if (imageReferences.length === 0) return textPart;
  return [
    { type: 'text', text: textPart },
    ...imageReferences.map(reference => ({
      type: 'image_url',
      image_url: {
        url: reference.source,
        detail: 'low',
      },
    })),
  ];
};

const buildCodexUserInput = (
  text: string,
  references: AgentCanvasVisualReference[],
) => {
  const input: Array<Record<string, unknown>> = [{ type: 'text', text, text_elements: [] }];
  references
    .filter(reference => reference.mediaType === 'image')
    .slice(0, 6)
    .forEach(reference => {
      if (reference.path) {
        input.push({ type: 'localImage', path: reference.path, detail: 'low' });
        return;
      }
      const url = (reference.source || '').trim();
      if (/^data:image\/|^https?:\/\//i.test(url)) {
        input.push({ type: 'image', url, detail: 'low' });
      }
    });
  return input;
};

const codexApprovalDetail = (method: string, params: Record<string, unknown>) => {
  if (typeof params.command === 'string') return params.command;
  if (Array.isArray(params.changes)) return `${params.changes.length} 个文件修改`;
  if (typeof params.reason === 'string') return params.reason;
  if (typeof params.tool === 'string') return String(params.tool);
  return method;
};

const extractCodexTurnText = (turn: Record<string, unknown>) => {
  const items = Array.isArray(turn.items) ? turn.items : [];
  return items
    .filter(item => item && typeof item === 'object' && (item as Record<string, unknown>).type === 'agentMessage')
    .map(item => String((item as Record<string, unknown>).text || ''))
    .filter(Boolean)
    .join('\n');
};

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const normalizeCodexModelOption = (value: unknown): CodexModelOption | null => {
  const record = asRecord(value);
  const model = String(record.model || record.id || '').trim();
  if (!model) return null;
  const supportedReasoningEfforts = (Array.isArray(record.supportedReasoningEfforts)
    ? record.supportedReasoningEfforts
    : [])
    .map(option => {
      const optionRecord = asRecord(option);
      const reasoningEffort = normalizeCodexReasoningEffort(optionRecord.reasoningEffort as string);
      if (!reasoningEffort) return null;
      return {
        reasoningEffort,
        description: String(optionRecord.description || '').trim(),
      };
    })
    .filter((option): option is NonNullable<typeof option> => !!option);
  const catalogDefault = normalizeCodexReasoningEffort(record.defaultReasoningEffort as string);
  return {
    id: String(record.id || model),
    model,
    displayName: String(record.displayName || model).trim(),
    description: String(record.description || '').trim(),
    hidden: record.hidden === true,
    supportedReasoningEfforts,
    defaultReasoningEffort: catalogDefault || supportedReasoningEfforts[0]?.reasoningEffort || 'medium',
    inputModalities: Array.isArray(record.inputModalities)
      ? record.inputModalities.map(item => String(item))
      : [],
    isDefault: record.isDefault === true,
  };
};

const normalizeCodexRateLimitWindow = (
  value: unknown,
  fallback: CodexRateLimitWindow | null = null,
): CodexRateLimitWindow | null => {
  const record = asRecord(value);
  if (Object.keys(record).length === 0) return fallback;
  const usedPercent = typeof record.usedPercent === 'number' ? record.usedPercent : Number.NaN;
  if (!Number.isFinite(usedPercent)) return fallback;
  const windowDurationMins = typeof record.windowDurationMins === 'number'
    ? record.windowDurationMins
    : Number.NaN;
  const resetsAt = typeof record.resetsAt === 'number' ? record.resetsAt : Number.NaN;
  return {
    usedPercent: Math.min(100, Math.max(0, Math.round(usedPercent))),
    windowDurationMins: Number.isFinite(windowDurationMins) ? windowDurationMins : null,
    resetsAt: Number.isFinite(resetsAt) ? resetsAt : null,
  };
};

const normalizeCodexRateLimits = (
  value: unknown,
  fallback: CodexRateLimits | null = null,
): CodexRateLimits | null => {
  const record = asRecord(value);
  if (Object.keys(record).length === 0) return fallback;
  const credits = asRecord(record.credits);
  const individualLimit = asRecord(record.individualLimit);
  const primary = normalizeCodexRateLimitWindow(record.primary, fallback?.primary || null);
  const secondary = normalizeCodexRateLimitWindow(record.secondary, fallback?.secondary || null);
  const individualRemaining = typeof individualLimit.remainingPercent === 'number'
    ? individualLimit.remainingPercent
    : Number.NaN;
  const remainingPercent = primary
    ? Math.max(0, 100 - primary.usedPercent)
    : Number.isFinite(individualRemaining)
      ? Math.min(100, Math.max(0, Math.round(individualRemaining)))
      : fallback?.remainingPercent ?? null;
  return {
    limitId: typeof record.limitId === 'string' ? record.limitId : fallback?.limitId || '',
    limitName: typeof record.limitName === 'string' ? record.limitName : fallback?.limitName || '',
    planType: typeof record.planType === 'string' ? record.planType : fallback?.planType || '',
    primary,
    secondary,
    remainingPercent,
    creditsBalance: typeof credits.balance === 'string' ? credits.balance : fallback?.creditsBalance || '',
    creditsUnlimited: typeof credits.unlimited === 'boolean' ? credits.unlimited : fallback?.creditsUnlimited || false,
    rateLimitReachedType: typeof record.rateLimitReachedType === 'string'
      ? record.rateLimitReachedType
      : fallback?.rateLimitReachedType || '',
    updatedAt: Date.now(),
  };
};

const getCodexTurnError = (turn: Record<string, unknown>) => {
  const error = asRecord(turn.error);
  const message = typeof error.message === 'string' ? error.message.trim() : '';
  const details = typeof error.additionalDetails === 'string' ? error.additionalDetails.trim() : '';
  return [message, details].filter(Boolean).join('：') || 'Codex 回合执行失败';
};

const isCodexLiteUnsupportedModelError = (error: unknown) => {
  const text = String(error || '');
  return /(unsupported_value|invalid_request_error)/i.test(text)
    && /model/i.test(text)
    && /(X-OpenAI-Internal-Codex-Responses-Lite|not supported)/i.test(text);
};

export function useCanvasAgentRuntime(options: RuntimeOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const initialConversationsRef = useRef<AgentConversation[] | null>(null);
  if (!initialConversationsRef.current) {
    const stored = readAgentConversations();
    initialConversationsRef.current = stored.length > 0
      ? stored
      : [createAgentConversation(DEFAULT_AGENT_SETTINGS.provider)];
  }
  const initialConversations = initialConversationsRef.current;
  const storedActiveId = readActiveAgentConversationId();
  const initialActiveId = initialConversations.some(item => item.id === storedActiveId)
    ? storedActiveId
    : initialConversations[0].id;

  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_AGENT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [conversations, setConversations] = useState<AgentConversation[]>(initialConversations);
  const [activeConversationId, setActiveConversationId] = useState(initialActiveId);
  const [busy, setBusy] = useState(false);
  const [codexStatus, setCodexStatus] = useState<CodexRuntimeStatus | null>(null);
  const [codexInstallProgress, setCodexInstallProgress] = useState<CodexInstallProgress | null>(null);
  const [codexLoginInfo, setCodexLoginInfo] = useState<CodexLoginInfo | null>(null);
  const [codexApprovals, setCodexApprovals] = useState<AgentCodexApproval[]>([]);
  const [codexRateLimits, setCodexRateLimits] = useState<CodexRateLimits | null>(null);
  const [codexRateLimitsLoading, setCodexRateLimitsLoading] = useState(false);
  const [codexRateLimitsError, setCodexRateLimitsError] = useState('');
  const [codexModels, setCodexModels] = useState<CodexModelOption[]>([]);
  const [codexModelsLoading, setCodexModelsLoading] = useState(false);
  const [codexModelsError, setCodexModelsError] = useState('');

  const conversationsRef = useRef(conversations);
  const activeConversationIdRef = useRef(activeConversationId);
  const settingsRef = useRef(settings);
  const activeOpenAiRequestsRef = useRef(new Map<string, {
    conversationId: string;
    messageId: string;
    streamed: boolean;
  }>());
  const pendingToolRunsRef = useRef(new Map<string, PendingToolRun>());
  const pendingCodexTurnsRef = useRef(new Map<string, PendingCodexTurn>());
  const loadedCodexThreadsRef = useRef(new Set<string>());
  const activeRequestRef = useRef<{
    provider: AgentProvider;
    conversationId: string;
    requestId?: string;
    threadId?: string;
    turnId?: string;
    assistantMessageId: string;
  } | null>(null);

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
    writeActiveAgentConversationId(activeConversationId);
  }, [activeConversationId]);

  const commitConversations = useCallback((updater: (current: AgentConversation[]) => AgentConversation[]) => {
    setConversations(current => {
      const next = updater(current);
      conversationsRef.current = next;
      return next;
    });
  }, []);

  const patchConversation = useCallback((
    conversationId: string,
    updater: (conversation: AgentConversation) => AgentConversation,
  ) => {
    commitConversations(current => current.map(conversation => (
      conversation.id === conversationId ? updater(conversation) : conversation
    )));
  }, [commitConversations]);

  const patchMessage = useCallback((
    conversationId: string,
    messageId: string,
    updater: (message: AgentChatMessage) => AgentChatMessage,
  ) => {
    patchConversation(conversationId, conversation => ({
      ...conversation,
      updatedAt: Date.now(),
      messages: conversation.messages.map(message => message.id === messageId ? updater(message) : message),
    }));
  }, [patchConversation]);

  const upsertThinkingStep = useCallback((
    conversationId: string,
    messageId: string,
    key: string,
    step: {
      title: string;
      detail?: string;
      status?: AgentThinkingStepStatus;
      completedAt?: number;
    },
  ) => {
    const now = Date.now();
    const stepId = buildThinkingStepId(messageId, key);
    patchMessage(conversationId, messageId, message => {
      const currentSteps = message.thinkingSteps || [];
      let found = false;
      const nextSteps = currentSteps.map(currentStep => {
        if (currentStep.id !== stepId) return currentStep;
        found = true;
        const status = step.status || currentStep.status;
        return {
          ...currentStep,
          title: step.title,
          detail: step.detail ?? currentStep.detail,
          status,
          completedAt: step.completedAt
            ?? (AGENT_THINKING_TERMINAL_STATUSES.has(status) && !currentStep.completedAt
              ? now
              : currentStep.completedAt),
        };
      });
      if (!found) {
        const status = step.status || 'running';
        const nextStep: AgentThinkingStep = {
          id: stepId,
          title: step.title,
          detail: step.detail,
          status,
          timestamp: now,
          completedAt: step.completedAt
            ?? (AGENT_THINKING_TERMINAL_STATUSES.has(status) ? now : undefined),
        };
        nextSteps.push(nextStep);
      }
      return {
        ...message,
        thinkingSteps: nextSteps.slice(-AGENT_THINKING_STEP_LIMIT),
      };
    });
  }, [patchMessage]);

  const finishThinkingSteps = useCallback((
    conversationId: string,
    messageId: string,
    status: AgentThinkingStepStatus = 'completed',
    detail?: string,
  ) => {
    const now = Date.now();
    patchMessage(conversationId, messageId, message => ({
      ...message,
      thinkingSteps: message.thinkingSteps?.map(step => (
        AGENT_THINKING_TERMINAL_STATUSES.has(step.status)
          ? step
          : {
            ...step,
            status,
            detail: detail ?? step.detail,
            completedAt: step.completedAt || now,
          }
      )),
    }));
  }, [patchMessage]);

  const refreshSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const next = normalizeAgentSettings(await invoke('agent_load_settings'));
      settingsRef.current = next;
      setSettings(next);
      return next;
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSettings().catch(error => {
      optionsRef.current.onNotice?.(`读取 Agent 设置失败：${String(error)}`);
    });
  }, [refreshSettings]);

  useEffect(() => {
    if (settingsLoading) return;
    void invoke<CodexRuntimeStatus>('agent_codex_status').then(setCodexStatus).catch(() => {});
  }, [settings.provider, settingsLoading]);

  useEffect(() => {
    if (settings.retainHistory) writeAgentConversations(conversations);
    else clearStoredAgentConversations();
  }, [conversations, settings.retainHistory]);

  const readCodexRateLimits = useCallback(async () => {
    const result = await invoke<Record<string, unknown>>('agent_codex_request', {
      method: 'account/rateLimits/read',
      params: null,
    });
    const next = normalizeCodexRateLimits(result.rateLimits);
    setCodexRateLimits(current => next || current);
    return next;
  }, []);

  useEffect(() => {
    const unlisteners = [
      listen<Record<string, unknown>>('agent-openai-stream', event => {
        const requestId = String(event.payload?.requestId || '');
        const active = activeOpenAiRequestsRef.current.get(requestId);
        if (!active || event.payload?.kind !== 'delta') return;
        const delta = String(event.payload?.delta || '');
        if (!delta) return;
        active.streamed = true;
        upsertThinkingStep(active.conversationId, active.messageId, 'api-response', {
          title: '正在接收模型回复',
          detail: 'OpenAI-compatible API 已开始返回内容',
          status: 'running',
        });
        patchMessage(active.conversationId, active.messageId, message => ({
          ...message,
          content: `${message.content}${delta}`,
          status: 'streaming',
        }));
      }),
      listen<Record<string, unknown>>('agent-codex-message', event => {
        const payload = event.payload || {};
        const method = String(payload.method || '');
        const params = payload.params && typeof payload.params === 'object'
          ? payload.params as Record<string, unknown>
          : {};

        if (method === 'item/agentMessage/delta') {
          const threadId = String(params.threadId || '');
          const pending = pendingCodexTurnsRef.current.get(threadId);
          if (!pending) return;
          const delta = String(params.delta || '');
          if (!delta) return;
          pending.raw += delta;
          pending.deltaChars += delta.length;
          pending.deltaReceived = true;
          const now = Date.now();
          if (now - pending.lastDeltaUiAt > 700) {
            pending.lastDeltaUiAt = now;
            upsertThinkingStep(pending.conversationId, pending.assistantMessageId, 'codex-response', {
              title: '正在接收 Codex 回复',
              detail: `已收到约 ${pending.deltaChars} 个字符`,
              status: 'running',
            });
            patchMessage(pending.conversationId, pending.assistantMessageId, message => ({
              ...message,
              content: message.content.trim() || 'Codex 正在理解画布并生成操作计划…',
              status: 'streaming',
            }));
          }
          return;
        }

        if (method === 'item/completed') {
          const threadId = String(params.threadId || '');
          const pending = pendingCodexTurnsRef.current.get(threadId);
          const item = asRecord(params.item);
          if (!pending || item.type !== 'agentMessage') return;
          const text = typeof item.text === 'string' ? item.text : '';
          if (text) pending.raw = text;
          upsertThinkingStep(pending.conversationId, pending.assistantMessageId, 'codex-response', {
            title: 'Codex 回复已生成',
            detail: text ? `共约 ${text.length} 个字符` : '回复片段已接收完成',
            status: 'completed',
          });
          return;
        }

        if (method === 'turn/started') {
          const threadId = String(params.threadId || '');
          const pending = pendingCodexTurnsRef.current.get(threadId);
          const turn = params.turn && typeof params.turn === 'object'
            ? params.turn as Record<string, unknown>
            : {};
          if (pending) {
            pending.turnId = String(turn.id || '');
            upsertThinkingStep(pending.conversationId, pending.assistantMessageId, 'codex-turn', {
              title: 'Codex 回合已开始',
              detail: pending.turnId ? `turnId: ${pending.turnId}` : undefined,
              status: 'running',
            });
            if (activeRequestRef.current?.threadId === threadId) {
              activeRequestRef.current.turnId = pending.turnId;
            }
          }
          return;
        }

        if (method === 'turn/completed') {
          const threadId = String(params.threadId || '');
          const pending = pendingCodexTurnsRef.current.get(threadId);
          if (!pending) return;
          pendingCodexTurnsRef.current.delete(threadId);
          clearPendingCodexTimers(pending);
          const turn = params.turn && typeof params.turn === 'object'
            ? params.turn as Record<string, unknown>
            : {};
          const status = String(turn.status || 'completed');
          if (status === 'failed') {
            upsertThinkingStep(pending.conversationId, pending.assistantMessageId, 'codex-turn', {
              title: 'Codex 回合失败',
              detail: getCodexTurnError(turn),
              status: 'error',
            });
            pending.reject(new Error(getCodexTurnError(turn)));
          } else {
            upsertThinkingStep(pending.conversationId, pending.assistantMessageId, 'codex-turn', {
              title: status === 'interrupted' ? 'Codex 回合已停止' : 'Codex 回合已完成',
              detail: pending.deltaReceived ? `已接收约 ${pending.deltaChars} 个字符` : '回合结束',
              status: status === 'interrupted' ? 'cancelled' : 'completed',
            });
            pending.resolve({
              turn,
              raw: pending.raw || extractCodexTurnText(turn),
              interrupted: status === 'interrupted',
            });
          }
          void readCodexRateLimits().catch(() => {});
          return;
        }

        if (method === 'account/rateLimits/updated') {
          setCodexRateLimits(current => normalizeCodexRateLimits(params.rateLimits, current));
          setCodexRateLimitsError('');
          return;
        }

        if (method === 'account/login/completed' || method === 'account/updated') {
          setCodexLoginInfo(null);
          void invoke<CodexRuntimeStatus>('agent_codex_status').then(setCodexStatus).catch(() => {});
          void readCodexRateLimits().catch(() => {});
          return;
        }

        if (payload.id !== undefined && method) {
          const pendingThreadId = String(params.threadId || activeRequestRef.current?.threadId || '');
          const pending = pendingThreadId ? pendingCodexTurnsRef.current.get(pendingThreadId) : undefined;
          const approval: AgentCodexApproval = {
            id: payload.id as string | number,
            method,
            params,
            title: method.includes('fileChange')
              ? 'Codex 请求修改文件'
              : method.includes('commandExecution') || method.includes('execCommand')
                ? 'Codex 请求执行命令'
                : 'Codex 请求确认',
            detail: codexApprovalDetail(method, params),
          };
          if (pending) {
            upsertThinkingStep(pending.conversationId, pending.assistantMessageId, `codex-approval-${String(approval.id)}`, {
              title: approval.title,
              detail: approval.detail,
              status: 'waiting',
            });
          }
          setCodexApprovals(current => current.some(item => String(item.id) === String(approval.id))
            ? current
            : [...current, approval]);
        }
      }),
      listen<Record<string, unknown>>('agent-codex-process', event => {
        if (event.payload?.running === false) {
          setCodexStatus(current => current ? { ...current, running: false } : current);
        }
      }),
      listen<CodexInstallProgress>('agent-codex-install-progress', event => {
        setCodexInstallProgress(event.payload);
      }),
    ];
    return () => {
      unlisteners.forEach(promise => void promise.then(unlisten => unlisten()).catch(() => {}));
    };
  }, [patchMessage, readCodexRateLimits, upsertThinkingStep]);

  const activeConversation = useMemo(() => (
    conversations.find(conversation => conversation.id === activeConversationId)
    || conversations[0]
  ), [activeConversationId, conversations]);

  const updateToolCalls = useCallback((run: PendingToolRun) => {
    patchMessage(run.conversationId, run.assistantMessageId, message => ({
      ...message,
      type: 'tool',
      toolCalls: run.calls.map(call => ({ ...call })),
      status: run.calls.some(call => call.status === 'awaiting-approval' || call.status === 'running')
        ? 'streaming'
        : message.status,
    }));
  }, [patchMessage]);

  const appendWorkflowResult = useCallback((result: WorkflowResultCardData) => {
    const preferredConversationId = activeRequestRef.current?.conversationId
      || activeConversationIdRef.current;
    const conversationId = conversationsRef.current.some(item => item.id === preferredConversationId)
      ? preferredConversationId
      : conversationsRef.current[0]?.id;
    if (!conversationId) return;
    const timestamp = Date.now();
    const resultMessage: AgentChatMessage = {
      id: createAgentId('agent-workflow-result'),
      role: 'agent',
      type: 'workflow_result',
      content: result.summary,
      timestamp,
      status: result.status === 'running'
        ? 'streaming'
        : result.status === 'error'
          ? 'error'
          : 'completed',
      error: result.error,
      workflowResult: result,
    };
    patchConversation(conversationId, conversation => ({
      ...conversation,
      updatedAt: timestamp,
      messages: upsertWorkflowResultMessage(conversation.messages, resultMessage),
    }));
  }, [patchConversation]);

  const executeToolCall = useCallback(async (run: PendingToolRun, call: AgentToolCall) => {
    call.status = 'running';
    upsertThinkingStep(run.conversationId, run.assistantMessageId, `tool-${call.id}`, {
      title: `正在执行：${getCanvasAgentToolLabel(call.name)}`,
      detail: JSON.stringify(call.arguments),
      status: 'running',
    });
    updateToolCalls(run);
    try {
      call.result = await optionsRef.current.executeTool(call.name, call.arguments, {
        snapshot: run.snapshot?.context,
        userRequest: run.userRequest || run.snapshot?.userRequest,
      });
      call.status = 'completed';
      upsertThinkingStep(run.conversationId, run.assistantMessageId, `tool-${call.id}`, {
        title: `已执行：${getCanvasAgentToolLabel(call.name)}`,
        detail: '软件操作已返回结果',
        status: 'completed',
      });
    } catch (error) {
      call.status = 'error';
      call.error = String(error);
      call.result = { error: String(error) };
      upsertThinkingStep(run.conversationId, run.assistantMessageId, `tool-${call.id}`, {
        title: `执行失败：${getCanvasAgentToolLabel(call.name)}`,
        detail: String(error),
        status: 'error',
      });
    }
    updateToolCalls(run);
  }, [updateToolCalls, upsertThinkingStep]);

  const runOpenAiLoopRef = useRef<(
    conversationId: string,
    assistantMessageId: string,
    snapshot: AgentSendSnapshot,
    providerMessages: Array<Record<string, unknown>>,
    depth: number,
  ) => Promise<void>>(async () => {});
  const continueCodexAfterToolsRef = useRef<(
    run: PendingToolRun,
    toolMessages: Array<Record<string, unknown>>,
  ) => Promise<void>>(async () => {});

  const continueAfterTools = useCallback(async (run: PendingToolRun) => {
    const toolMessages = run.calls.map(call => ({
      role: 'tool',
      tool_call_id: call.id,
      content: JSON.stringify(call.status === 'declined'
        ? { declined: true }
        : (call.result ?? { error: call.error || '工具没有返回结果' })),
    }));

    if (run.provider === 'codex') {
      await continueCodexAfterToolsRef.current(run, toolMessages);
      return;
    }

    if (run.provider !== 'openai-compatible' || !run.providerMessages) {
      const pendingInspirationCandidates = Array.from(new Map(run.calls.flatMap(call => {
        const result = call.result && typeof call.result === 'object' && !Array.isArray(call.result)
          ? call.result as Record<string, unknown>
          : {};
        return Array.isArray(result.inspirationCandidates)
          ? result.inspirationCandidates.filter(candidate => (
            candidate && typeof candidate === 'object'
            && String((candidate as Record<string, unknown>).state || '') === 'candidate'
          )) as Array<Record<string, unknown>>
          : [];
      }).map(candidate => [String(candidate.itemId || ''), candidate])).values());
      const inspirationConfirmationText = pendingInspirationCandidates.length > 0
        ? [
          '找到以下灵感候选，需要你确认后才会作为生成参考：',
          ...pendingInspirationCandidates.slice(0, 8).map((candidate, index) => (
            `${index + 1}. ${String(candidate.itemId || '')} · ${Math.round(Number(candidate.confidence || 0) * 100)}% · ${String(candidate.referenceRole || '')}\n${String(candidate.reason || '')}`
          )),
          '回复要采用的 itemId；未确认的候选不会接入生成节点。',
        ].join('\n')
        : '';
      finishThinkingSteps(
        run.conversationId,
        run.assistantMessageId,
        run.calls.some(call => call.status === 'error') ? 'error' : 'completed',
      );
      patchMessage(run.conversationId, run.assistantMessageId, message => ({
        ...message,
        ...(inspirationConfirmationText ? { content: inspirationConfirmationText } : {}),
        status: run.calls.some(call => call.status === 'error') ? 'error' : 'completed',
      }));
      setBusy(false);
      activeRequestRef.current = null;
      return;
    }

    upsertThinkingStep(run.conversationId, run.assistantMessageId, 'api-loop-' + (run.depth + 1), {
      title: '正在把工具结果发回模型',
      detail: '第 ' + (run.depth + 2) + ' 轮推理',
      status: 'running',
    });
    await runOpenAiLoopRef.current(
      run.conversationId,
      run.assistantMessageId,
      run.snapshot || {
        context: optionsRef.current.getContext(),
        selectedItems: [],
        selectedIds: [],
        visualReferences: [],
      },
      [...run.providerMessages, ...toolMessages],
      run.depth + 1,
    );
  }, [finishThinkingSteps, patchMessage, upsertThinkingStep]);

  const processToolCalls = useCallback(async (
    run: PendingToolRun,
  ) => {
    const settingsNow = settingsRef.current;
    const stepBindingState = createPlanStepBindingState(run.calls.map(toolCallToLegacyAction));
    for (const call of run.calls) {
      const resolvedStepAction = resolvePlanStepActionInputs(
        toolCallToLegacyAction(call),
        stepBindingState,
        { context: run.snapshot?.context },
      );
      if (JSON.stringify(resolvedStepAction.action.arguments) !== JSON.stringify(call.arguments)) {
        call.arguments = resolvedStepAction.action.arguments;
      }
      if (
        resolvedStepAction.unresolvedInputIds.length > 0
        && !resolvedStepAction.fallbackUsed
        && ['canvas_connect_nodes', 'canvas_update_prompt', 'canvas_run_text_agent', 'canvas_run_workflow'].includes(call.name)
      ) {
        call.status = 'error';
        call.error = `无法解析输入引用：${resolvedStepAction.unresolvedInputIds.join('；')}`;
        call.result = { error: call.error, unresolvedInputIds: resolvedStepAction.unresolvedInputIds };
        upsertThinkingStep(run.conversationId, run.assistantMessageId, `tool-${call.id}`, {
          title: `输入绑定失败：${getCanvasAgentToolLabel(call.name)}`,
          detail: call.error,
          status: 'error',
        });
        continue;
      }
      const validationContext = withCreatedNodesInContext(run.snapshot?.context, stepBindingState.createdNodeIds);
      const originalAction: LegacyAgentAction = toolCallToLegacyAction(call);
      const repairedAction = repairLegacyAgentAction(originalAction, run.userRequest || run.snapshot?.userRequest || '');
      if (JSON.stringify(repairedAction.arguments) !== JSON.stringify(call.arguments)) {
        run.repaired = true;
        call.arguments = repairedAction.arguments;
      }
      const validation = validateLegacyAgentAction(
        toolCallToLegacyAction(call),
        validationContext,
        run.userRequest || run.snapshot?.userRequest || '',
      );
      if (!validation.valid) {
        call.status = 'error';
        call.error = validation.errors.join('；');
        call.result = { error: call.error, validationErrors: validation.errors };
        upsertThinkingStep(run.conversationId, run.assistantMessageId, `tool-${call.id}`, {
          title: `校验失败：${getCanvasAgentToolLabel(call.name)}`,
          detail: call.error,
          status: 'error',
        });
        continue;
      }
      const permission = evaluateLegacyActionPermission(
        { tool: call.name, arguments: call.arguments },
        {
          userText: run.userRequest || run.snapshot?.userRequest || '',
          approvalMode: settingsNow.approvalMode,
        },
      );
      const requiresApproval = !isCanvasAgentToolReadOnly(call.name) && permission.requiresConfirmation;
      if (requiresApproval) {
        call.status = 'awaiting-approval';
        upsertThinkingStep(run.conversationId, run.assistantMessageId, `tool-${call.id}`, {
          title: `等待确认：${getCanvasAgentToolLabel(call.name)}`,
          detail: JSON.stringify({ riskLevel: permission.riskLevel, reasons: permission.reasons, arguments: call.arguments }),
          status: 'waiting',
        });
      } else {
        await executeToolCall(run, call);
        if (call.status === 'completed') bindPlanStepResult(stepBindingState, toolCallToLegacyAction(call), call.result);
      }
    }
    updateToolCalls(run);
    if (run.trace) {
      const legacyActions = run.calls.map(toolCallToLegacyAction);
      const workflowTrace = collectWorkflowTraceFromCalls(run.calls);
      upsertAppAgentTrace({
        ...run.trace,
        ...(run.deterministicActionsUsed
          ? { executedLegacyActions: legacyActions }
          : { llmGeneratedActions: legacyActions }),
        deterministicActionsUsed: run.deterministicActionsUsed === true,
        plannedStepRefs: stepBindingState.plannedStepRefs,
        resolvedStepRefs: stepBindingState.resolvedStepRefs,
        createdNodeIds: stepBindingState.createdNodeIds,
        unresolvedInputIds: stepBindingState.unresolvedInputIds,
        fallbackUsed: stepBindingState.fallbackUsed,
        fallbackReason: stepBindingState.fallbackReason,
        workflowResolvedImageNodeIds: workflowTrace.workflowResolvedImageNodeIds,
        workflowAutoConnections: workflowTrace.workflowAutoConnections,
        workflowMissingRequiredInputs: workflowTrace.workflowMissingRequiredInputs,
        workflowInputResolution: workflowTrace.workflowInputResolution,
        confirmationRequired: run.calls.some(call => call.status === 'awaiting-approval'),
        executionResults: run.calls.map(call => call.result).filter(Boolean),
        errors: run.calls.map(call => call.error).filter((error): error is string => !!error),
        repaired: run.repaired === true,
      });
    }
    if (run.calls.some(call => call.status === 'awaiting-approval')) {
      pendingToolRunsRef.current.set(run.conversationId, run);
      setBusy(false);
      return;
    }
    await continueAfterTools(run);
  }, [continueAfterTools, executeToolCall, updateToolCalls, upsertThinkingStep]);

  const runOpenAiLoop = useCallback(async (
    conversationId: string,
    assistantMessageId: string,
    snapshot: AgentSendSnapshot,
    providerMessages: Array<Record<string, unknown>>,
    depth: number,
  ) => {
    if (depth >= AGENT_MAX_TOOL_ROUNDS) throw new Error('Agent 连续工具调用过多，已停止');
    if (depth > 0) {
      patchMessage(conversationId, assistantMessageId, message => ({
        ...message,
        content: message.content.trim() ? `${message.content.trimEnd()}\n\n` : '',
        status: 'streaming',
      }));
    }
    upsertThinkingStep(conversationId, assistantMessageId, `api-request-${depth}`, {
      title: depth > 0 ? '继续请求模型整理结果' : '正在请求模型',
      detail: `已发送 ${providerMessages.length} 条上下文消息`,
      status: 'running',
    });
    const requestId = createAgentId('agent-api');
    activeOpenAiRequestsRef.current.set(requestId, {
      conversationId,
      messageId: assistantMessageId,
      streamed: false,
    });
    activeRequestRef.current = {
      provider: 'openai-compatible',
      conversationId,
      requestId,
      assistantMessageId,
    };
    let result: OpenAiChatResult;
    let activeStream: { conversationId: string; messageId: string; streamed: boolean } | undefined;
    try {
      result = await invoke<OpenAiChatResult>('agent_openai_chat', {
        request: {
          requestId,
          messages: providerMessages,
          tools: CANVAS_AGENT_TOOL_DEFINITIONS,
          model: settingsRef.current.apiModel,
        },
      });
      activeStream = activeOpenAiRequestsRef.current.get(requestId);
    } finally {
      activeStream ??= activeOpenAiRequestsRef.current.get(requestId);
      activeOpenAiRequestsRef.current.delete(requestId);
    }
    upsertThinkingStep(conversationId, assistantMessageId, `api-request-${depth}`, {
      title: '模型请求已返回',
      detail: result.finishReason ? `finishReason: ${result.finishReason}` : undefined,
      status: 'completed',
    });
    if (!activeStream?.streamed && result.content) {
      patchMessage(conversationId, assistantMessageId, message => ({
        ...message,
        content: `${message.content}${result.content}`,
      }));
    }
    if (!result.toolCalls?.length) {
      const fallbackEnvelope = parseCodexCanvasEnvelope(result.content || '');
      if (fallbackEnvelope) {
        patchMessage(conversationId, assistantMessageId, message => ({
          ...message,
          content: fallbackEnvelope.reply || message.content || result.content,
          status: 'streaming',
        }));
        if (fallbackEnvelope.actions.length > 0) {
          await processToolCalls({
            conversationId,
            assistantMessageId,
            provider: 'codex',
            snapshot,
            calls: fallbackEnvelope.actions.map(action => ({
              id: createAgentId('agent-tool'),
              name: action.tool,
              arguments: action.arguments,
              status: 'pending' as const,
            })),
            depth,
            userRequest: snapshot.userRequest,
            trace: snapshot.appAgentTrace,
          });
          return;
        }
      }
      patchMessage(conversationId, assistantMessageId, message => ({
        ...message,
        content: message.content.trim() || '已完成。',
        status: 'completed',
      }));
      finishThinkingSteps(conversationId, assistantMessageId, 'completed');
      setBusy(false);
      activeRequestRef.current = null;
      return;
    }

    const calls = result.toolCalls.map(call => ({
      id: call.id || createAgentId('agent-tool'),
      name: call.name,
      arguments: parseAgentArguments(call.arguments),
      status: 'pending' as const,
    }));
    const assistantProviderMessage = {
      role: 'assistant',
      content: result.content || null,
      tool_calls: result.toolCalls.map(call => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: call.arguments },
      })),
    };
    await processToolCalls({
      conversationId,
      assistantMessageId,
      provider: 'openai-compatible',
      snapshot,
      providerMessages: [...providerMessages, assistantProviderMessage],
      calls,
      depth,
      userRequest: snapshot.userRequest,
      trace: snapshot.appAgentTrace,
    });
  }, [finishThinkingSteps, patchMessage, processToolCalls, upsertThinkingStep]);
  runOpenAiLoopRef.current = runOpenAiLoop;

  const installCodex = useCallback(async () => {
    setCodexInstallProgress({
      stage: 'downloading',
      message: '正在准备下载官方 Codex 运行时',
      loaded: 0,
      total: 0,
      progress: 0,
    });
    try {
      const status = await invoke<CodexRuntimeStatus>('agent_install_codex');
      setCodexStatus(status);
      return status;
    } catch (error) {
      setCodexInstallProgress(current => ({
        stage: 'error',
        message: String(error),
        loaded: current?.loaded || 0,
        total: current?.total || 0,
        progress: current?.progress || 0,
      }));
      throw error;
    }
  }, []);

  const ensureCodexStarted = useCallback(async () => {
    const currentStatus = await invoke<CodexRuntimeStatus>('agent_codex_status');
    setCodexStatus(currentStatus);
    if (!currentStatus.installed && currentStatus.installAvailable) {
      await installCodex();
    }
    const status = await invoke<CodexRuntimeStatus>('agent_codex_start');
    setCodexStatus(status);
    return status;
  }, [installCodex]);

  const refreshCodexModels = useCallback(async () => {
    setCodexModelsLoading(true);
    setCodexModelsError('');
    try {
      const status = await ensureCodexStarted();
      if (!status.authenticated) throw new Error('请先登录 ChatGPT 账户');
      const values: CodexModelOption[] = [];
      let cursor = '';
      for (let page = 0; page < 5; page += 1) {
        const result = await invoke<Record<string, unknown>>('agent_codex_request', {
          method: 'model/list',
          params: {
            limit: 100,
            includeHidden: false,
            ...(cursor ? { cursor } : {}),
          },
        });
        const pageValues = (Array.isArray(result.data) ? result.data : [])
          .map(normalizeCodexModelOption)
          .filter((model): model is CodexModelOption => !!model && !model.hidden);
        values.push(...pageValues);
        cursor = typeof result.nextCursor === 'string' ? result.nextCursor : '';
        if (!cursor) break;
      }
      const seen = new Set<string>();
      const next = values.filter(model => {
        if (seen.has(model.model)) return false;
        seen.add(model.model);
        return true;
      });
      if (next.length === 0) throw new Error('Codex 没有返回可选模型');
      setCodexModels(next);
      return next;
    } catch (error) {
      setCodexModelsError(String(error));
      throw error;
    } finally {
      setCodexModelsLoading(false);
    }
  }, [ensureCodexStarted]);

  const refreshCodexRateLimits = useCallback(async () => {
    setCodexRateLimitsLoading(true);
    setCodexRateLimitsError('');
    try {
      const status = await ensureCodexStarted();
      if (!status.authenticated) throw new Error('请先登录 ChatGPT 账户');
      const next = await readCodexRateLimits();
      if (!next) throw new Error('Codex 没有返回用量信息');
      return next;
    } catch (error) {
      const message = String(error);
      setCodexRateLimitsError(message);
      throw error;
    } finally {
      setCodexRateLimitsLoading(false);
    }
  }, [ensureCodexStarted, readCodexRateLimits]);

  const startOrResumeCodexThread = useCallback(async (
    conversation: AgentConversation,
    systemPrompt: string,
    options: { forceNew?: boolean; forceDefaultModel?: boolean } = {},
  ) => {
    await ensureCodexStarted();
    const current = settingsRef.current;
    const threadKey = buildCodexThreadKey(current, options.forceDefaultModel === true, systemPrompt);
    const canResumeThread = !options.forceNew
      && conversation.codexThreadId
      && conversation.codexThreadKey === threadKey;
    if (canResumeThread && conversation.codexThreadId && !loadedCodexThreadsRef.current.has(conversation.codexThreadId)) {
      try {
        await invoke('agent_codex_request', {
          method: 'thread/resume',
          params: { threadId: conversation.codexThreadId },
        });
        loadedCodexThreadsRef.current.add(conversation.codexThreadId);
        return conversation.codexThreadId;
      } catch (_) {
        // Persisted thread can be missing after a Codex reset; start a replacement below.
      }
    } else if (canResumeThread && conversation.codexThreadId) {
      return conversation.codexThreadId;
    }

    const codexModel = getEffectiveCodexModel(current, options.forceDefaultModel === true);
    const reasoningEffort = getEffectiveCodexReasoningEffort(current);
    const result = await invoke<Record<string, unknown>>('agent_codex_request', {
      method: 'thread/start',
      params: {
        ...(codexModel ? { model: codexModel } : {}),
        ...(reasoningEffort ? { config: { model_reasoning_effort: reasoningEffort } } : {}),
        sandbox: getEffectiveCodexSandbox(current),
        approvalPolicy: getEffectiveCodexApprovalPolicy(current),
        baseInstructions: systemPrompt,
        personality: 'friendly',
      },
    });
    const thread = result.thread && typeof result.thread === 'object'
      ? result.thread as Record<string, unknown>
      : {};
    const threadId = String(thread.id || '');
    if (!threadId) throw new Error('Codex 没有返回 threadId');
    loadedCodexThreadsRef.current.add(threadId);
    patchConversation(conversation.id, value => ({ ...value, codexThreadId: threadId, codexThreadKey: threadKey }));
    return threadId;
  }, [ensureCodexStarted, patchConversation]);

  const waitForCodexTurn = useCallback((
    conversationId: string,
    assistantMessageId: string,
    threadId: string,
    options: {
      onFallback?: () => void;
    } = {},
  ) => new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      const pending = pendingCodexTurnsRef.current.get(threadId);
      if (pending) clearPendingCodexTimers(pending);
      pendingCodexTurnsRef.current.delete(threadId);
      reject(new Error('Codex 会话等待超时'));
    }, 15 * 60 * 1000);
    const noticeTimeoutId = window.setTimeout(() => {
      const pending = pendingCodexTurnsRef.current.get(threadId);
      if (!pending || pending.deltaReceived || pending.fallbackStarted) return;
      upsertThinkingStep(conversationId, assistantMessageId, 'codex-slow-notice', {
        title: '正在等待 Codex',
        detail: '正在等待 Codex，可取消或改用快速规划',
        status: 'waiting',
      });
      patchMessage(conversationId, assistantMessageId, message => ({
        ...message,
        content: message.content.trim() || '正在等待 Codex，可取消或改用快速规划',
        status: 'streaming',
      }));
    }, 30 * 1000);
    const fallbackTimeoutId = options.onFallback
      ? window.setTimeout(() => {
        const pending = pendingCodexTurnsRef.current.get(threadId);
        if (!pending || pending.deltaReceived || pending.fallbackStarted) return;
        pending.fallbackStarted = true;
        upsertThinkingStep(conversationId, assistantMessageId, 'codex-fast-plan-fallback', {
          title: '改用快速规划',
          detail: 'Codex 60 秒内没有返回有效响应，正在执行确定性计划',
          status: 'running',
        });
        options.onFallback?.();
        pendingCodexTurnsRef.current.delete(threadId);
        clearPendingCodexTimers(pending);
        resolve({ fallbackStarted: true, raw: '' });
      }, 60 * 1000)
      : undefined;
    pendingCodexTurnsRef.current.set(threadId, {
      conversationId,
      assistantMessageId,
      threadId,
      raw: '',
      deltaChars: 0,
      deltaReceived: false,
      lastDeltaUiAt: 0,
      resolve,
      reject,
      timeoutId,
      noticeTimeoutId,
      fallbackTimeoutId,
    });
  }), [patchMessage, upsertThinkingStep]);

  const markWorkflowPlanningFailure = useCallback((
    conversationId: string,
    assistantMessageId: string,
    userText: string,
    error: unknown,
  ) => {
    finishThinkingSteps(conversationId, assistantMessageId, 'error', String(error));
    patchMessage(conversationId, assistantMessageId, message => ({
      ...message,
      content: 'AI 规划失败',
      status: 'error',
      error: String(error),
      workflowPlanningFailure: { userText },
    }));
    setBusy(false);
    activeRequestRef.current = null;
    optionsRef.current.onNotice?.(`AI 规划失败：${String(error)}`);
  }, [finishThinkingSteps, patchMessage]);

  const runWorkflowRemotePlanning = useCallback(async (input: {
    conversation: AgentConversation;
    assistantMessageId: string;
    userText: string;
    snapshot: AgentSendSnapshot;
    availability: WorkflowPlanningAvailability;
  }) => {
    const { conversation, assistantMessageId, userText, snapshot, availability } = input;
    upsertThinkingStep(conversation.id, assistantMessageId, 'workflow-planning-route', {
      title: '规划方式：AI 深度设计',
      detail: `使用模型：${availability.modelLabel}`,
      status: 'running',
    });

    const plannerMessages = buildWorkflowDraftProposalMessages({
      userText,
      context: snapshot.context,
      activeWorkflowDraft: optionsRef.current.getActiveDraft?.() ?? null,
    });

    let raw = '';
    if (availability.provider === 'codex') {
      const systemPrompt = String(plannerMessages[0]?.content || '');
      const userPrompt = String(plannerMessages[1]?.content || userText);
      upsertThinkingStep(conversation.id, assistantMessageId, 'workflow-codex-thread', {
        title: '正在连接 AI 规划器',
        detail: availability.modelLabel,
        status: 'running',
      });
      const threadId = await startOrResumeCodexThread(conversation, systemPrompt, { forceNew: true });
      activeRequestRef.current = {
        provider: 'codex',
        conversationId: conversation.id,
        threadId,
        assistantMessageId,
      };
      upsertThinkingStep(conversation.id, assistantMessageId, 'workflow-codex-thread', {
        title: 'AI 规划器已连接',
        detail: `threadId: ${threadId}`,
        status: 'completed',
      });
      upsertThinkingStep(conversation.id, assistantMessageId, 'workflow-ai-request', {
        title: '正在请求 AI 生成 Workflow Draft Proposal',
        detail: '模型只返回结构化 proposal，不直接操作画布',
        status: 'running',
      });
      const completion = waitForCodexTurn(conversation.id, assistantMessageId, threadId);
      const response = await invoke<Record<string, unknown>>('agent_codex_request', {
        method: 'turn/start',
        params: {
          threadId,
          input: buildCodexUserInput(userPrompt, snapshot.visualReferences),
          approvalPolicy: 'never',
          ...(getEffectiveCodexModel(settingsRef.current) ? { model: getEffectiveCodexModel(settingsRef.current) } : {}),
          ...(getEffectiveCodexReasoningEffort(settingsRef.current) ? { effort: getEffectiveCodexReasoningEffort(settingsRef.current) } : {}),
        },
      });
      const turn = asRecord(response.turn);
      const turnId = String(turn.id || '');
      const pending = pendingCodexTurnsRef.current.get(threadId);
      if (pending && turnId) pending.turnId = turnId;
      if (activeRequestRef.current) activeRequestRef.current.turnId = turnId;
      const completed = await completion;
      if (completed.interrupted === true) throw new Error('AI 规划已取消');
      raw = String(completed.raw || '').trim();
    } else {
      const requestId = createAgentId('workflow-planner-api');
      activeRequestRef.current = {
        provider: 'openai-compatible',
        conversationId: conversation.id,
        requestId,
        assistantMessageId,
      };
      upsertThinkingStep(conversation.id, assistantMessageId, 'workflow-ai-request', {
        title: '正在请求 AI 生成 Workflow Draft Proposal',
        detail: '模型只返回结构化 proposal，不直接操作画布',
        status: 'running',
      });
      const result = await invoke<OpenAiChatResult>('agent_openai_chat', {
        request: {
          requestId,
          messages: plannerMessages,
          tools: [],
          model: settingsRef.current.apiModel,
        },
      });
      raw = String(result.content || '').trim();
    }

    if (!raw) throw new Error('AI 规划没有返回内容');
    upsertThinkingStep(conversation.id, assistantMessageId, 'workflow-ai-request', {
      title: 'AI Draft Proposal 已返回',
      detail: `共 ${raw.length} 个字符`,
      status: 'completed',
    });
    upsertThinkingStep(conversation.id, assistantMessageId, 'workflow-proposal-validate', {
      title: '正在校验 Workflow Draft Proposal',
      detail: '校验 schema、ID、输入引用和 prompt 原始请求',
      status: 'running',
    });
    const proposal = parseWorkflowDraftProposal(raw);
    const draft = workflowDraftProposalToRecipeDraft({ proposal, userText });
    const selectedReferenceImageNodeIds = Array.from(new Set(
      snapshot.visualReferences
        .filter(reference => reference.mediaType === 'image')
        .map(reference => reference.nodeId)
        .filter(Boolean),
    ));
    const inputBindings = selectedReferenceImageNodeIds.length > 0
      ? {
        product_reference_image: selectedReferenceImageNodeIds.length === 1
          ? { kind: 'canvas_node', nodeId: selectedReferenceImageNodeIds[0] }
          : { kind: 'canvas_nodes', nodeIds: selectedReferenceImageNodeIds },
      }
      : { product_reference_image: { kind: 'unbound', nodeId: null } };
    const calls: AgentToolCall[] = [{
      id: createAgentId('workflow-planner-tool'),
      name: 'canvas_create_workflow_draft',
      arguments: {
        workflowDraft: draft,
        languagePolicy: draft.languagePolicy,
        selectedReferenceImageNodeIds,
        inputBindings,
      },
      status: 'pending',
    }];
    upsertThinkingStep(conversation.id, assistantMessageId, 'workflow-proposal-validate', {
      title: 'Workflow Draft Proposal 校验完成',
      detail: `准备创建 ${draft.outputs.filter(output => output.enabled !== false).length} 个输出的草案`,
      status: 'completed',
    });
    patchMessage(conversation.id, assistantMessageId, message => ({
      ...message,
      content: [
        '规划方式：AI 深度设计',
        `使用模型：${availability.modelLabel}`,
        '已生成结构化 Workflow Draft，正在创建可编辑草案。',
      ].join('\n'),
      status: 'streaming',
      toolCalls: calls,
    }));
    await processToolCalls({
      conversationId: conversation.id,
      assistantMessageId,
      provider: 'openai-compatible',
      calls,
      depth: 0,
      snapshot,
      userRequest: userText,
      trace: snapshot.appAgentTrace,
      deterministicActionsUsed: false,
    });
  }, [finishThinkingSteps, patchMessage, processToolCalls, startOrResumeCodexThread, upsertThinkingStep, waitForCodexTurn]);

  const runCodexContinuation = useCallback(async (
    run: PendingToolRun,
    toolMessages: Array<Record<string, unknown>>,
  ) => {
    if (run.depth + 1 >= AGENT_MAX_TOOL_ROUNDS) {
      finishThinkingSteps(run.conversationId, run.assistantMessageId, 'completed');
      patchMessage(run.conversationId, run.assistantMessageId, message => ({
        ...message,
        status: run.calls.some(call => call.status === 'error') ? 'error' : 'completed',
      }));
      setBusy(false);
      activeRequestRef.current = null;
      return;
    }

    const conversation = conversationsRef.current.find(item => item.id === run.conversationId);
    const threadId = conversation?.codexThreadId;
    if (!conversation || !threadId) {
      finishThinkingSteps(run.conversationId, run.assistantMessageId, run.calls.some(call => call.status === 'error') ? 'error' : 'completed');
      patchMessage(run.conversationId, run.assistantMessageId, message => ({
        ...message,
        status: run.calls.some(call => call.status === 'error') ? 'error' : 'completed',
      }));
      setBusy(false);
      activeRequestRef.current = null;
      return;
    }

    const nextContext = sanitizeCanvasContextForPrompt(optionsRef.current.getContext());
    const toolResults = toolMessages.map(message => ({
      toolCallId: message.tool_call_id,
      result: message.content,
    }));
    const nextDepth = run.depth + 1;
    upsertThinkingStep(run.conversationId, run.assistantMessageId, 'codex-loop-' + nextDepth, {
      title: '正在基于工具结果继续推理',
      detail: '第 ' + (nextDepth + 1) + ' 轮，已更新软件上下文',
      status: 'running',
    });

    activeRequestRef.current = {
      provider: 'codex',
      conversationId: run.conversationId,
      threadId,
      assistantMessageId: run.assistantMessageId,
    };

    const completion = waitForCodexTurn(run.conversationId, run.assistantMessageId, threadId);
    const doneExample = '{\"reply\":\"简短中文总结\",\"actions\":[]}';
    const historyPrompt = buildLocalConversationHistoryPrompt(conversation, run.assistantMessageId);
    const followupText = (historyPrompt ? historyPrompt + '\n\n' : '') + '上一轮软件工具已经执行完成。工具结果如下：\n' + JSON.stringify(toolResults)
      + '\n\n最新软件上下文：' + JSON.stringify(nextContext)
      + '\n\n请判断目标是否已经完成：如果已完成，返回 ' + doneExample
      + '；如果还需要继续执行，返回下一批 actions。不要运行 shell，不要修改本地文件。';
    const response = await invoke<Record<string, unknown>>('agent_codex_request', {
      method: 'turn/start',
      params: {
        threadId,
        input: buildCodexUserInput(followupText, run.snapshot?.visualReferences || []),
        outputSchema: CANVAS_AGENT_ACTION_SCHEMA,
        approvalPolicy: getEffectiveCodexApprovalPolicy(settingsRef.current),
        ...(getEffectiveCodexModel(settingsRef.current) ? { model: getEffectiveCodexModel(settingsRef.current) } : {}),
        ...(getEffectiveCodexReasoningEffort(settingsRef.current) ? { effort: getEffectiveCodexReasoningEffort(settingsRef.current) } : {}),
      },
    });
    const turn = asRecord(response.turn);
    const turnId = String(turn.id || '');
    const pending = pendingCodexTurnsRef.current.get(threadId);
    if (pending && turnId) pending.turnId = turnId;
    if (activeRequestRef.current) activeRequestRef.current.turnId = turnId;

    const completed = await completion;
    if (completed.interrupted === true) {
      finishThinkingSteps(run.conversationId, run.assistantMessageId, 'cancelled');
      patchMessage(run.conversationId, run.assistantMessageId, message => ({
        ...message,
        content: message.content.trim() || '已停止。',
        status: 'cancelled',
      }));
      setBusy(false);
      activeRequestRef.current = null;
      return;
    }

    const raw = String(completed.raw || '').trim();
    if (!raw) {
      finishThinkingSteps(run.conversationId, run.assistantMessageId, 'completed');
      patchMessage(run.conversationId, run.assistantMessageId, message => ({
        ...message,
        status: run.calls.some(call => call.status === 'error') ? 'error' : 'completed',
      }));
      setBusy(false);
      activeRequestRef.current = null;
      return;
    }

    const envelope = parseCodexCanvasEnvelope(raw);
    const reply = envelope?.reply || raw;
    const calls: AgentToolCall[] = (envelope?.actions || []).map(action => ({
      id: createAgentId('codex-canvas-tool'),
      name: action.tool,
      arguments: action.arguments,
      status: 'pending',
    }));
    upsertThinkingStep(run.conversationId, run.assistantMessageId, 'codex-loop-' + nextDepth, {
      title: calls.length > 0 ? '已决定继续执行软件操作' : '软件目标已完成',
      detail: calls.length > 0 ? '继续执行 ' + calls.length + ' 个软件操作' : '没有后续软件操作',
      status: 'completed',
    });
    patchMessage(run.conversationId, run.assistantMessageId, message => ({
      ...message,
      content: reply || message.content,
      status: calls.length > 0 ? 'streaming' : 'completed',
      toolCalls: [...(message.toolCalls || []), ...calls],
    }));
    if (calls.length > 0) {
      await processToolCalls({
        conversationId: run.conversationId,
        assistantMessageId: run.assistantMessageId,
        provider: 'codex',
        calls,
        depth: nextDepth,
        snapshot: run.snapshot,
        userRequest: run.userRequest || run.snapshot?.userRequest,
        trace: run.trace || run.snapshot?.appAgentTrace,
      });
      return;
    }
    finishThinkingSteps(run.conversationId, run.assistantMessageId, 'completed');
    setBusy(false);
    activeRequestRef.current = null;
  }, [finishThinkingSteps, patchMessage, processToolCalls, upsertThinkingStep, waitForCodexTurn]);
  continueCodexAfterToolsRef.current = runCodexContinuation;
  const runCodexTurn = useCallback(async (
    conversation: AgentConversation,
    assistantMessageId: string,
    userText: string,
    context: AgentCanvasContext,
    visualReferences: AgentCanvasVisualReference[],
    forceDefaultCodexModel = false,
    snapshot?: AgentSendSnapshot,
    appAgentTurn?: ReturnType<typeof prepareAppAgentTurn>,
  ) => {
    const contextForPrompt = appAgentTurn?.compactContext || sanitizeCanvasContextForPrompt(context);
    const systemPrompt = buildCanvasAgentSystemPrompt(
      settingsRef.current.systemPrompt,
      contextForPrompt,
      appAgentTurn?.activeSkillPrompt || '',
    );
    let threadId = '';
    upsertThinkingStep(conversation.id, assistantMessageId, 'codex-prepare', {
      title: '正在整理软件上下文',
      detail: `界面 ${context.surface || '未知'}，抽屉 ${context.drawer?.items.length || 0} 项，日程 ${context.calendar?.events?.length || 0} 条，画布节点 ${context.nodes.length} 个，参考图 ${visualReferences.length} 张`,
      status: 'running',
    });
    try {
      upsertThinkingStep(conversation.id, assistantMessageId, 'codex-thread', {
        title: conversation.codexThreadId ? '正在恢复 Codex 会话' : '正在启动 Codex 会话',
        detail: forceDefaultCodexModel ? '使用账户默认模型重试' : undefined,
        status: 'running',
      });
      threadId = await startOrResumeCodexThread(conversation, systemPrompt, {
        forceNew: forceDefaultCodexModel,
        forceDefaultModel: forceDefaultCodexModel,
      });
      upsertThinkingStep(conversation.id, assistantMessageId, 'codex-thread', {
        title: 'Codex 会话已连接',
        detail: `threadId: ${threadId}`,
        status: 'completed',
      });
    } catch (error) {
      if (
        settingsRef.current.provider === 'codex'
        && !forceDefaultCodexModel
        && isCodexLiteUnsupportedModelError(error)
      ) {
        upsertThinkingStep(conversation.id, assistantMessageId, 'codex-thread', {
          title: '当前模型不兼容',
          detail: '正在切换为账户默认模型重试',
          status: 'completed',
        });
        patchMessage(conversation.id, assistantMessageId, message => ({
          ...message,
          content: 'Codex 当前模型不兼容，正在切换为默认模型重试…',
          status: 'streaming',
          error: undefined,
        }));
        return runCodexTurn(
          { ...conversation, codexThreadId: undefined },
          assistantMessageId,
          userText,
          context,
          visualReferences,
          true,
          snapshot,
          appAgentTurn,
        );
      }
      throw error;
    }
    upsertThinkingStep(conversation.id, assistantMessageId, 'codex-prepare', {
      title: '软件上下文已准备',
      detail: `界面 ${context.surface || '未知'}，抽屉 ${context.drawer?.items.length || 0} 项，日程 ${context.calendar?.events?.length || 0} 条，画布节点 ${context.nodes.length} 个，参考图 ${visualReferences.length} 张`,
      status: 'completed',
    });
    activeRequestRef.current = {
      provider: 'codex',
      conversationId: conversation.id,
      threadId,
      assistantMessageId,
    };
    try {
      const turnModel = getEffectiveCodexModel(settingsRef.current, forceDefaultCodexModel);
      const reasoningEffort = getEffectiveCodexReasoningEffort(settingsRef.current);
      let deterministicFallbackStarted = false;
      const runDeterministicFallback = () => {
        const fallbackTurn = appAgentTurn;
        if (
          deterministicFallbackStarted
          || !fallbackTurn
          || fallbackTurn.deterministicLegacyActions.length === 0
          || fallbackTurn.plan.riskLevel === 'destructive'
          || fallbackTurn.plan.riskLevel === 'system_process'
        ) return;
        deterministicFallbackStarted = true;
        void (async () => {
          try {
            const active = activeRequestRef.current;
            const turnId = active?.turnId || pendingCodexTurnsRef.current.get(threadId)?.turnId || '';
            if (active?.threadId && turnId) {
              await invoke('agent_codex_request', {
                method: 'turn/interrupt',
                params: { threadId: active.threadId, turnId },
              });
            }
          } catch (_) {
            // The fallback can still execute locally even if the remote turn has already settled.
          }
          const calls: AgentToolCall[] = fallbackTurn.deterministicLegacyActions
            .map(action => createToolCallFromLegacyAction(action, 'app-agent-fallback-tool'));
          patchMessage(conversation.id, assistantMessageId, message => ({
            ...message,
            content: 'Codex 等待超时，已改用快速规划执行基础操作。',
            status: 'streaming',
            toolCalls: calls,
          }));
          await processToolCalls({
            conversationId: conversation.id,
            assistantMessageId,
            provider: 'openai-compatible',
            calls,
            depth: 0,
            snapshot,
            userRequest: userText,
            trace: fallbackTurn.trace || snapshot?.appAgentTrace,
            deterministicActionsUsed: true,
          });
        })();
      };
      const startTurn = async (text: string, withOutputSchema: boolean) => {
        upsertThinkingStep(conversation.id, assistantMessageId, 'codex-send', {
          title: withOutputSchema ? '正在发送请求给 Codex' : '正在发送重试请求给 Codex',
          detail: `上下文约 ${text.length} 个字符${visualReferences.length ? `，参考图 ${visualReferences.length} 张` : ''}`,
          status: 'running',
        });
        const completion = waitForCodexTurn(conversation.id, assistantMessageId, threadId, {
          onFallback: appAgentTurn?.shouldUseDeterministicPlan ? runDeterministicFallback : undefined,
        });
        const response = await invoke<Record<string, unknown>>('agent_codex_request', {
          method: 'turn/start',
          params: {
            threadId,
            input: buildCodexUserInput(text, visualReferences),
            ...(withOutputSchema ? { outputSchema: CANVAS_AGENT_ACTION_SCHEMA } : {}),
            approvalPolicy: getEffectiveCodexApprovalPolicy(settingsRef.current),
            ...(turnModel ? { model: turnModel } : {}),
            ...(reasoningEffort ? { effort: reasoningEffort } : {}),
          },
        });
        const turn = asRecord(response.turn);
        const turnId = String(turn.id || '');
        const pending = pendingCodexTurnsRef.current.get(threadId);
        if (pending && turnId) pending.turnId = turnId;
        if (activeRequestRef.current) activeRequestRef.current.turnId = turnId;
        upsertThinkingStep(conversation.id, assistantMessageId, 'codex-send', {
          title: '请求已送达 Codex',
          detail: turnId ? `turnId: ${turnId}` : '正在等待回合事件',
          status: 'completed',
        });
        return completion;
      };

      const codexNotice = visualReferenceNotice(visualReferences);
      const localHistoryPrompt = buildLocalConversationHistoryPrompt(conversation, assistantMessageId);
      const codexUserText = (localHistoryPrompt ? localHistoryPrompt + '\n\n' : '')
        + userText
        + (codexNotice ? '\n\n' + codexNotice : '')
        + (appAgentTurn?.activeSkillIds.length ? '\n\nActive skill ids: ' + appAgentTurn.activeSkillIds.join(', ') : '')
        + (appAgentTurn?.activeSkillPrompt ? '\n\nActive skill prompt:\n' + appAgentTurn.activeSkillPrompt : '')
        + '\n\n你现在是全局软件 Agent。请自己判断要操作抽屉、日历、画布、设置还是可见界面；可以一次返回多个 actions 连续完成任务。能执行就执行，不要只给步骤。'
        + '\n\n应用提供的当前软件上下文：' + JSON.stringify(contextForPrompt)
        + '\n\n请只返回 reply 和 actions。reply 用简短中文说明结果或下一步；actions 使用应用工具。不要运行 shell、不要修改本地文件。';
      let completed = await startTurn(codexUserText, true);
      if (completed.fallbackStarted === true) return;
      if (completed.interrupted === true) {
        finishThinkingSteps(conversation.id, assistantMessageId, 'cancelled');
        patchMessage(conversation.id, assistantMessageId, message => ({
          ...message,
          content: message.content.trim() || '已停止。',
          status: 'cancelled',
        }));
        setBusy(false);
        activeRequestRef.current = null;
        return;
      }

      let raw = String(completed.raw || '').trim();
      if (!raw) {
        patchMessage(conversation.id, assistantMessageId, message => ({
          ...message,
          content: 'Codex 正在重新整理软件操作…',
          status: 'streaming',
        }));
        upsertThinkingStep(conversation.id, assistantMessageId, 'codex-retry', {
          title: '没有收到可见结果',
          detail: '正在要求 Codex 重新整理软件操作',
          status: 'running',
        });
        completed = await startTurn(
          '上一轮没有生成可见结果。请以全局软件 Agent 身份重新完成用户刚才的软件操作请求，只输出一个 JSON 对象，包含字符串 reply 和数组 actions；每个 action 包含 tool 与 arguments。可以跨抽屉、日历、画布、设置和可见界面调用应用工具。不要运行 shell，不要修改本地文件。',
          false,
        );
        if (completed.fallbackStarted === true) return;
        if (completed.interrupted === true) {
          finishThinkingSteps(conversation.id, assistantMessageId, 'cancelled');
          patchMessage(conversation.id, assistantMessageId, message => ({
            ...message,
            content: message.content.trim() || '已停止。',
            status: 'cancelled',
          }));
          setBusy(false);
          activeRequestRef.current = null;
          return;
        }
        raw = String(completed.raw || '').trim();
        upsertThinkingStep(conversation.id, assistantMessageId, 'codex-retry', {
          title: '重试结果已返回',
          detail: raw ? `共约 ${raw.length} 个字符` : '仍未返回可见内容',
          status: raw ? 'completed' : 'error',
        });
      }
      if (!raw) throw new Error('Codex 连续两次完成回合，但没有返回可用内容');

      const envelope = parseCodexCanvasEnvelope(raw);
      const reply = envelope?.reply || raw;
      const calls: AgentToolCall[] = (envelope?.actions || []).map(action => ({
        id: createAgentId('codex-canvas-tool'),
        name: action.tool,
        arguments: action.arguments,
        status: 'pending',
      }));
      upsertThinkingStep(conversation.id, assistantMessageId, 'codex-parse', {
        title: calls.length > 0 ? '已解析软件操作计划' : '已生成回复',
        detail: calls.length > 0 ? `准备执行 ${calls.length} 个软件操作` : '没有需要执行的软件操作',
        status: 'completed',
      });
      patchMessage(conversation.id, assistantMessageId, message => ({
        ...message,
        content: reply,
        status: calls.length > 0 ? 'streaming' : 'completed',
        toolCalls: calls,
      }));
      if (calls.length > 0) {
        await processToolCalls({
          conversationId: conversation.id,
          assistantMessageId,
          provider: 'codex',
          calls,
          depth: 0,
          snapshot,
          userRequest: userText,
          trace: appAgentTurn?.trace || snapshot?.appAgentTrace,
        });
      } else {
        setBusy(false);
        activeRequestRef.current = null;
        finishThinkingSteps(conversation.id, assistantMessageId, 'completed');
      }
    } catch (error) {
      const pending = pendingCodexTurnsRef.current.get(threadId);
      if (pending) {
        clearPendingCodexTimers(pending);
        pendingCodexTurnsRef.current.delete(threadId);
      }
      if (
        settingsRef.current.provider === 'codex'
        && !forceDefaultCodexModel
        && isCodexLiteUnsupportedModelError(error)
      ) {
        loadedCodexThreadsRef.current.delete(threadId);
        patchConversation(conversation.id, value => ({ ...value, codexThreadId: undefined }));
        upsertThinkingStep(conversation.id, assistantMessageId, 'codex-thread', {
          title: '当前模型不兼容',
          detail: '正在切换为账户默认模型重试',
          status: 'completed',
        });
        patchMessage(conversation.id, assistantMessageId, message => ({
          ...message,
          content: 'Codex 当前模型不兼容，正在切换为默认模型重试…',
          status: 'streaming',
          error: undefined,
        }));
        return runCodexTurn(
          { ...conversation, codexThreadId: undefined },
          assistantMessageId,
          userText,
          context,
          visualReferences,
          true,
          snapshot,
          appAgentTurn,
        );
      }
      finishThinkingSteps(conversation.id, assistantMessageId, 'error', String(error));
      throw error;
    }
  }, [finishThinkingSteps, patchConversation, patchMessage, processToolCalls, startOrResumeCodexThread, upsertThinkingStep, waitForCodexTurn]);

  const sendMessage = useCallback(async (content: string, sendOptions: AgentSendOptions = {}) => {
    const text = content.trim();
    if (!text || busy) return false;
    if (pendingToolRunsRef.current.has(activeConversationIdRef.current)) {
      optionsRef.current.onNotice?.('请先确认或拒绝当前软件操作');
      return false;
    }
    const conversation = conversationsRef.current.find(item => item.id === activeConversationIdRef.current)
      || conversationsRef.current[0];
    if (!conversation) return false;
    const provider = settingsRef.current.provider;
    const context = optionsRef.current.getContext();
    const selectedItems = context.selectedItems || [];
    const selectedIds = context.selectedIds || selectedItems.map(item => item.id);
    const initialVisualReferences = context.visualReferences || selectedItems.flatMap(item => item.references || []);
    const selectionSnapshot = selectedItems.map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      referenceCount: item.referenceCount,
    }));
    const userMessage: AgentChatMessage = {
      id: createAgentId('agent-user'),
      role: 'user',
      type: 'text',
      content: text,
      timestamp: Date.now(),
      status: 'completed',
      selectionSurface: context.surface,
      selectionSnapshot: selectionSnapshot.length > 0 ? selectionSnapshot : undefined,
    };
    const assistantMessageId = createAgentId('agent-assistant');
    const assistantMessage: AgentChatMessage = {
      id: assistantMessageId,
      role: 'agent',
      type: 'text',
      content: '',
      timestamp: Date.now() + 1,
      status: 'streaming',
      thinkingSteps: [{
        id: buildThinkingStepId(assistantMessageId, 'queued'),
        title: '请求已进入队列',
        detail: provider === 'codex'
          ? '准备连接 ChatGPT Codex App Server'
          : '准备连接自定义 API Chat Completions',
        status: 'running',
        timestamp: Date.now() + 1,
      }],
    };
    patchConversation(conversation.id, current => ({
      ...current,
      provider,
      title: current.messages.length === 0 ? trimConversationTitle(text) : current.title,
      updatedAt: Date.now(),
      messages: [...current.messages, userMessage, assistantMessage],
    }));
    setBusy(true);
    try {
      upsertThinkingStep(conversation.id, assistantMessage.id, 'queued', {
        title: '正在收集软件上下文',
        detail: '准备抽屉、日历、节点和已选参考图',
        status: 'running',
      });
      let visualReferences = initialVisualReferences;
      if (optionsRef.current.prepareVisualReferences) {
        try {
          visualReferences = await optionsRef.current.prepareVisualReferences(context, 'codex');
          upsertThinkingStep(conversation.id, assistantMessage.id, 'references', {
            title: visualReferences.length > 0 ? '参考图已准备' : '没有可用参考图',
            detail: visualReferences.length > 0 ? `本轮附加 ${visualReferences.length} 张参考图` : '将仅使用节点文字和结构信息',
            status: 'completed',
          });
        } catch (error) {
          console.warn('prepare canvas agent visual references failed:', error);
          optionsRef.current.onNotice?.('选中节点图片准备失败，本轮将仅使用节点信息。');
          visualReferences = [];
          upsertThinkingStep(conversation.id, assistantMessage.id, 'references', {
            title: '参考图准备失败',
            detail: String(error),
            status: 'error',
          });
        }
      }
      upsertThinkingStep(conversation.id, assistantMessage.id, 'queued', {
        title: '软件上下文已收集',
        detail: `抽屉素材 ${context.drawer?.items.length || 0} 个，节点 ${context.nodes.length} 个`,
        status: 'completed',
      });
      const contextWithVisualReferences = {
        ...context,
        selectedIds,
        selectedItems,
        visualReferences,
      };
      const activeDraft = optionsRef.current.getActiveDraft?.() ?? null;
      const workflowDesignIntent = detectWorkflowDesignIntent({
        userText: text,
        activeWorkflowDraft: activeDraft ?? undefined,
      });
      const aiAvailability = resolveAgentPlanningAvailability(settingsRef.current, codexStatus);
      const workflowPlanningRoute: WorkflowPlanningRoute = workflowDesignIntent
        ? sendOptions.forceWorkflowPlanningRoute
          || resolveWorkflowPlanningRoute({
            quickPlanRequested: sendOptions.quickPlanRequested === true,
            aiAvailability,
          })
        : 'unavailable';
      const appAgentTurn = prepareAppAgentTurn({
        userText: text,
        context: contextWithVisualReferences,
        activeDraft,
      });
      if (workflowDesignIntent) {
        appAgentTurn.trace.deterministicActionsUsed = workflowPlanningRoute === 'local_deterministic';
      }
      appendAppAgentTrace(appAgentTurn.trace);
      upsertThinkingStep(conversation.id, assistantMessage.id, 'skills', {
        title: appAgentTurn.activeSkillIds.length > 0 ? '已匹配 App Agent Skill' : '使用基础 App Agent',
        detail: appAgentTurn.activeSkillIds.length > 0
          ? `${appAgentTurn.activeSkillIds.join(', ')}；context scopes: ${appAgentTurn.contextScopes.join(', ')}`
          : `context scopes: ${appAgentTurn.contextScopes.join(', ')}`,
        status: 'completed',
      });
      const snapshot: AgentSendSnapshot = {
        context: contextWithVisualReferences,
        selectedItems,
        selectedIds,
        visualReferences,
        userRequest: text,
        appAgentTrace: appAgentTurn.trace,
      };
      if (workflowDesignIntent && workflowPlanningRoute === 'remote_ai') {
        try {
          await runWorkflowRemotePlanning({
            conversation,
            assistantMessageId: assistantMessage.id,
            userText: text,
            snapshot,
            availability: aiAvailability,
          });
        } catch (error) {
          markWorkflowPlanningFailure(conversation.id, assistantMessage.id, text, error);
        }
        return true;
      }
      if (
        appAgentTurn.shouldUseDeterministicPlan
        && appAgentTurn.deterministicLegacyActions.length > 0
        && (!workflowDesignIntent || workflowPlanningRoute === 'local_deterministic')
      ) {
        const calls: AgentToolCall[] = appAgentTurn.deterministicLegacyActions
          .map(action => createToolCallFromLegacyAction(action, 'app-agent-deterministic-tool'));
        const localWorkflowPlanning = workflowDesignIntent && workflowPlanningRoute === 'local_deterministic';
        const localWorkflowReason = localWorkflowPlanning
          && !sendOptions.quickPlanRequested
          && sendOptions.forceWorkflowPlanningRoute !== 'local_deterministic'
          && !aiAvailability.canPlanWorkflow
          ? '未配置可用 API，已使用快速规划'
          : '';
        patchMessage(conversation.id, assistantMessage.id, message => ({
          ...message,
          content: localWorkflowPlanning
            ? [
              localWorkflowReason,
              '规划方式：本地快速规划',
              '不调用大模型',
            ].filter(Boolean).join('\n')
            : '正在执行本地软件操作。',
          status: 'streaming',
          toolCalls: calls,
        }));
        upsertThinkingStep(conversation.id, assistantMessage.id, 'deterministic-plan', {
          title: localWorkflowPlanning ? '规划方式：本地快速规划' : '正在执行本地软件操作',
          detail: localWorkflowPlanning ? '不调用大模型' : `准备执行 ${calls.length} 个软件操作`,
          status: 'running',
        });
        await processToolCalls({
          conversationId: conversation.id,
          assistantMessageId: assistantMessage.id,
          provider: 'openai-compatible',
          calls,
          depth: 0,
          snapshot,
          userRequest: text,
          trace: appAgentTurn.trace,
          deterministicActionsUsed: true,
        });
        return true;
      }
      if (workflowDesignIntent && workflowPlanningRoute === 'local_deterministic') {
        throw new Error('本地快速规划没有生成可执行的 Workflow Draft');
      }
      if (provider === 'codex') {
        await runCodexTurn(conversation, assistantMessage.id, text, contextWithVisualReferences, visualReferences, false, snapshot, appAgentTurn);
      } else {
        const systemPrompt = [
          buildCanvasAgentSystemPrompt(
            settingsRef.current.systemPrompt,
            appAgentTurn.compactContext,
            appAgentTurn.activeSkillPrompt,
          ),
          'OpenAI-compatible 兼容提示：优先使用 tools/function calling。若当前 API 或模型不返回 tool_calls，请只输出一个 JSON 对象：{"reply":"给用户看的简短说明","actions":[{"tool":"app_get_context","arguments":{}}]}。actions 可使用 app_navigate、analyze_inspiration、analyze_inspirations_batch、get_inspiration_analysis_job、drawer_search_inspirations、drawer_manage、calendar_manage、canvas_manage、canvas_create_text_agent、canvas_create_generator、canvas_apply_workflow 等已列工具；tool 与 arguments 必须对应可用软件工具。',
        ].join('\n\n');
        const providerMessages: Array<Record<string, unknown>> = [
          { role: 'system', content: systemPrompt },
          ...makeProviderHistory(conversation),
          { role: 'user', content: buildOpenAiUserContent(text, visualReferences) },
        ];
        await runOpenAiLoop(conversation.id, assistantMessage.id, snapshot, providerMessages, 0);
      }
      return true;
    } catch (error) {
      finishThinkingSteps(conversation.id, assistantMessage.id, 'error', String(error));
      patchMessage(conversation.id, assistantMessage.id, message => ({
        ...message,
        content: message.content.trim() || '这次请求没有完成。',
        status: 'error',
        error: String(error),
      }));
      setBusy(false);
      activeRequestRef.current = null;
      optionsRef.current.onNotice?.(`Agent 请求失败：${String(error)}`);
      return false;
    }
  }, [busy, codexStatus, markWorkflowPlanningFailure, patchConversation, patchMessage, runCodexTurn, runOpenAiLoop, runWorkflowRemotePlanning]);

  const resolveToolCall = useCallback(async (toolCallId: string, approved: boolean) => {
    const run = [...pendingToolRunsRef.current.values()]
      .find(value => value.calls.some(call => call.id === toolCallId));
    if (!run) return;
    const call = run.calls.find(value => value.id === toolCallId);
    if (!call || call.status !== 'awaiting-approval') return;
    setBusy(true);
    if (approved) {
      upsertThinkingStep(run.conversationId, run.assistantMessageId, `tool-${call.id}`, {
        title: `已确认：${getCanvasAgentToolLabel(call.name)}`,
        detail: '开始执行软件操作',
        status: 'running',
      });
      await executeToolCall(run, call);
    } else {
      call.status = 'declined';
      call.result = { declined: true };
      upsertThinkingStep(run.conversationId, run.assistantMessageId, `tool-${call.id}`, {
        title: `已拒绝：${getCanvasAgentToolLabel(call.name)}`,
        detail: '用户拒绝执行此操作',
        status: 'cancelled',
      });
      updateToolCalls(run);
    }
    if (run.calls.every(value => ['completed', 'declined', 'error'].includes(value.status))) {
      pendingToolRunsRef.current.delete(run.conversationId);
      await continueAfterTools(run);
    } else {
      setBusy(false);
    }
  }, [continueAfterTools, executeToolCall, updateToolCalls, upsertThinkingStep]);

  const cancelCurrent = useCallback(async () => {
    const active = activeRequestRef.current;
    if (!active) return;
    try {
      if (active.provider === 'openai-compatible' && active.requestId) {
        await invoke('agent_cancel_openai', { requestId: active.requestId });
      } else if (active.threadId) {
        const pending = pendingCodexTurnsRef.current.get(active.threadId);
        const turnId = active.turnId || pending?.turnId || '';
        try {
          if (turnId) {
            await invoke('agent_codex_request', {
              method: 'turn/interrupt',
              params: { threadId: active.threadId, turnId },
            });
          }
        } finally {
          if (pending) {
            pendingCodexTurnsRef.current.delete(active.threadId);
            clearPendingCodexTimers(pending);
            pending.resolve({ interrupted: true, raw: '' });
          }
        }
      }
    } catch (_) {
      // The completion event or request error below will still settle the UI.
    }
    const conversationId = active.conversationId || activeConversationIdRef.current;
    finishThinkingSteps(conversationId, active.assistantMessageId, 'cancelled');
    patchMessage(conversationId, active.assistantMessageId, message => ({
      ...message,
      status: 'cancelled',
      content: message.content.trim() || '已停止。',
    }));
    activeRequestRef.current = null;
    setBusy(false);
  }, [patchMessage]);

  const retryLast = useCallback(async () => {
    const conversation = conversationsRef.current.find(item => item.id === activeConversationIdRef.current);
    const lastUser = [...(conversation?.messages || [])].reverse().find(message => message.role === 'user');
    if (lastUser) await sendMessage(lastUser.content);
  }, [sendMessage]);

  const newConversation = useCallback(() => {
    const conversation = createAgentConversation(settingsRef.current.provider);
    commitConversations(current => [conversation, ...current]);
    setActiveConversationId(conversation.id);
    return conversation.id;
  }, [commitConversations]);

  const selectConversation = useCallback((id: string) => {
    if (conversationsRef.current.some(item => item.id === id)) setActiveConversationId(id);
  }, []);

  const deleteConversation = useCallback((id: string) => {
    commitConversations(current => {
      const remaining = current.filter(item => item.id !== id);
      if (remaining.length > 0) {
        if (activeConversationIdRef.current === id) setActiveConversationId(remaining[0].id);
        return remaining;
      }
      const replacement = createAgentConversation(settingsRef.current.provider);
      setActiveConversationId(replacement.id);
      return [replacement];
    });
  }, [commitConversations]);

  const clearConversation = useCallback(() => {
    const id = activeConversationIdRef.current;
    patchConversation(id, conversation => ({
      ...conversation,
      title: '新对话',
      messages: [],
      codexThreadId: undefined,
      codexThreadKey: undefined,
      updatedAt: Date.now(),
    }));
  }, [patchConversation]);

  const clearAllHistory = useCallback(() => {
    const replacement = createAgentConversation(settingsRef.current.provider);
    clearStoredAgentConversations();
    commitConversations(() => [replacement]);
    setActiveConversationId(replacement.id);
  }, [commitConversations]);

  const saveSettings = useCallback(async (
    input: AgentSettings & { apiKey?: string; clearApiKey?: boolean },
  ) => {
    const previous = settingsRef.current;
    const saved = normalizeAgentSettings(await invoke('agent_save_settings', { input }));
    settingsRef.current = saved;
    setSettings(saved);
    const runtimeProfileChanged = previous.provider !== saved.provider
      || previous.codexExecutable !== saved.codexExecutable
      || (
        saved.provider === 'openai-compatible'
        && (
          previous.apiBaseUrl !== saved.apiBaseUrl
          || previous.apiGatewayKind !== saved.apiGatewayKind
          || previous.apiProvider !== saved.apiProvider
          || previous.apiModel !== saved.apiModel
          || JSON.stringify(previous.apiHeaders) !== JSON.stringify(saved.apiHeaders)
          || !!input.apiKey?.trim()
          || input.clearApiKey === true
        )
      );
    if (!runtimeProfileChanged) return saved;

    loadedCodexThreadsRef.current.clear();
    commitConversations(current => current.map(conversation => ({
      ...conversation,
      codexThreadId: undefined,
      codexThreadKey: undefined,
    })));
    if (saved.apiCredentialSource === 'cloud_wallet' || saved.apiProvider === 'unmind-wallet') {
      return saved;
    }
    const mode = saved.provider === 'codex' ? 'chatgpt' : 'api';
    try {
      let status = await invoke<CodexRuntimeStatus>('agent_codex_status');
      if (!status.installed && status.installAvailable) status = await installCodex();
      const restarted = await invoke<CodexRuntimeStatus>('agent_codex_restart', { mode });
      setCodexStatus(restarted);
    } catch (error) {
      throw new Error(`设置已保存，但切换到 ${mode === 'chatgpt' ? 'ChatGPT 登录' : '自定义 API'} 模式失败：${String(error)}`);
    }
    return saved;
  }, [commitConversations, installCodex]);

  const listOpenAiModels = useCallback(async () => (
    invoke<string[]>('agent_list_openai_models')
  ), []);

  const testAgentApiConnection = useCallback(async () => (
    invoke<AgentApiConnectionResult>('agent_test_api_connection')
  ), []);

  const queryAgentApiBalance = useCallback(async () => (
    invoke<AgentApiBalanceResult>('agent_query_api_balance')
  ), []);

  const refreshCodexStatus = useCallback(async () => {
    const status = await invoke<CodexRuntimeStatus>('agent_codex_status');
    setCodexStatus(status);
    return status;
  }, []);

  const openCodexLoginUrl = useCallback(async (url: string) => {
    if (!url.trim()) return;
    try {
      await invoke('agent_open_auth_url', { url });
    } catch (_) {
      await openUrl(url);
    }
  }, []);

  const startCodexLogin = useCallback(async (mode: 'chatgpt' | 'chatgptDeviceCode') => {
    await ensureCodexStarted();
    const result = await invoke<Record<string, unknown>>('agent_codex_request', {
      method: 'account/login/start',
      params: { type: mode, ...(mode === 'chatgpt' ? { codexStreamlinedLogin: true } : {}) },
    });
    const info: CodexLoginInfo = {
      type: mode,
      authUrl: typeof result.authUrl === 'string' ? result.authUrl : undefined,
      verificationUrl: typeof result.verificationUrl === 'string' ? result.verificationUrl : undefined,
      userCode: typeof result.userCode === 'string' ? result.userCode : undefined,
    };
    setCodexLoginInfo(info);
    const url = info.authUrl || info.verificationUrl;
    if (url) await openCodexLoginUrl(url);
    return info;
  }, [ensureCodexStarted, openCodexLoginUrl]);

  const logoutCodex = useCallback(async () => {
    await ensureCodexStarted();
    await invoke('agent_codex_request', { method: 'account/logout', params: {} });
    setCodexLoginInfo(null);
    setCodexRateLimits(null);
    setCodexRateLimitsError('');
    setCodexModels([]);
    setCodexModelsError('');
    await refreshCodexStatus();
  }, [ensureCodexStarted, refreshCodexStatus]);

  const resolveCodexApproval = useCallback(async (
    approval: AgentCodexApproval,
    approved: boolean,
  ) => {
    let result: Record<string, unknown> = { decision: approved ? 'accept' : 'decline' };
    if (approval.method === 'item/tool/requestUserInput') result = { answers: {} };
    await invoke('agent_codex_respond', { id: approval.id, result });
    const threadId = String(approval.params.threadId || activeRequestRef.current?.threadId || '');
    const pending = threadId ? pendingCodexTurnsRef.current.get(threadId) : undefined;
    if (pending) {
      upsertThinkingStep(
        pending.conversationId,
        pending.assistantMessageId,
        `codex-approval-${String(approval.id)}`,
        {
          title: approved ? 'Codex 操作已确认' : 'Codex 操作已拒绝',
          detail: approval.detail,
          status: approved ? 'completed' : 'cancelled',
        },
      );
    }
    setCodexApprovals(current => current.filter(item => String(item.id) !== String(approval.id)));
  }, [upsertThinkingStep]);

  return {
    settings,
    settingsLoading,
    saveSettings,
    refreshSettings,
    listOpenAiModels,
    testAgentApiConnection,
    queryAgentApiBalance,
    codexStatus,
    codexRateLimits,
    codexRateLimitsLoading,
    codexRateLimitsError,
    codexModels,
    codexModelsLoading,
    codexModelsError,
    codexInstallProgress,
    codexLoginInfo,
    installCodex,
    refreshCodexStatus,
    refreshCodexRateLimits,
    refreshCodexModels,
    startCodexLogin,
    openCodexLoginUrl,
    logoutCodex,
    codexApprovals,
    resolveCodexApproval,
    conversations,
    activeConversation,
    activeConversationId,
    busy,
    sendMessage,
    cancelCurrent,
    retryLast,
    resolveToolCall,
    appendWorkflowResult,
    newConversation,
    selectConversation,
    deleteConversation,
    clearConversation,
    clearAllHistory,
    getToolLabel: getCanvasAgentToolLabel,
  };
}
