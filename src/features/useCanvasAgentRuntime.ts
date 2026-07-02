import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_AGENT_SETTINGS,
  createAgentConversation,
  createAgentId,
  normalizeCodexModelOverride,
  type AgentCanvasContext,
  type AgentCanvasToolExecutor,
  type AgentChatMessage,
  type AgentCodexApproval,
  type AgentConversation,
  type AgentProvider,
  type AgentSettings,
  type AgentToolCall,
  type CodexInstallProgress,
  type CodexLoginInfo,
  type CodexRateLimits,
  type CodexRateLimitWindow,
  type CodexRuntimeStatus,
} from './agentModel';
import {
  CANVAS_AGENT_ACTION_SCHEMA,
  CANVAS_AGENT_TOOL_DEFINITIONS,
  buildCanvasAgentSystemPrompt,
  getCanvasAgentToolLabel,
  isCanvasAgentToolReadOnly,
  isCanvasAgentToolSensitive,
  parseAgentArguments,
  parseCodexCanvasEnvelope,
} from './canvasAgentTools';
import {
  clearStoredAgentConversations,
  readActiveAgentConversationId,
  readAgentConversations,
  writeActiveAgentConversationId,
  writeAgentConversations,
} from './agentStorage';

type RuntimeOptions = {
  getContext: () => AgentCanvasContext;
  executeTool: AgentCanvasToolExecutor;
  onNotice?: (message: string) => void;
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
  providerMessages?: Array<Record<string, unknown>>;
  calls: AgentToolCall[];
  depth: number;
};

type PendingCodexTurn = {
  conversationId: string;
  assistantMessageId: string;
  threadId: string;
  turnId?: string;
  raw: string;
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timeoutId: number;
};

const normalizeAgentSettings = (value: unknown): AgentSettings => {
  const record = value && typeof value === 'object' ? value as Partial<AgentSettings> : {};
  return {
    ...DEFAULT_AGENT_SETTINGS,
    ...record,
    provider: record.provider === 'codex' ? 'codex' : 'openai-compatible',
    apiHeaders: record.apiHeaders && typeof record.apiHeaders === 'object' ? record.apiHeaders : {},
    codexModel: normalizeCodexModelOverride(record.codexModel),
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
    if (settingsLoading || settings.provider !== 'codex') return;
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
          pending.raw += String(params.delta || '');
          patchMessage(pending.conversationId, pending.assistantMessageId, message => ({
            ...message,
            content: 'Codex 正在理解画布并生成操作计划…',
            status: 'streaming',
          }));
          return;
        }

        if (method === 'item/completed') {
          const threadId = String(params.threadId || '');
          const pending = pendingCodexTurnsRef.current.get(threadId);
          const item = asRecord(params.item);
          if (!pending || item.type !== 'agentMessage') return;
          const text = typeof item.text === 'string' ? item.text : '';
          if (text) pending.raw = text;
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
          window.clearTimeout(pending.timeoutId);
          const turn = params.turn && typeof params.turn === 'object'
            ? params.turn as Record<string, unknown>
            : {};
          const status = String(turn.status || 'completed');
          if (status === 'failed') {
            pending.reject(new Error(getCodexTurnError(turn)));
          } else {
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
  }, [patchMessage, readCodexRateLimits]);

  const activeConversation = useMemo(() => (
    conversations.find(conversation => conversation.id === activeConversationId)
    || conversations[0]
  ), [activeConversationId, conversations]);

  const updateToolCalls = useCallback((run: PendingToolRun) => {
    patchMessage(run.conversationId, run.assistantMessageId, message => ({
      ...message,
      toolCalls: run.calls.map(call => ({ ...call })),
      status: run.calls.some(call => call.status === 'awaiting-approval' || call.status === 'running')
        ? 'streaming'
        : message.status,
    }));
  }, [patchMessage]);

  const executeToolCall = useCallback(async (run: PendingToolRun, call: AgentToolCall) => {
    call.status = 'running';
    updateToolCalls(run);
    try {
      call.result = await optionsRef.current.executeTool(call.name, call.arguments);
      call.status = 'completed';
    } catch (error) {
      call.status = 'error';
      call.error = String(error);
      call.result = { error: String(error) };
    }
    updateToolCalls(run);
  }, [updateToolCalls]);

  const runOpenAiLoopRef = useRef<(
    conversationId: string,
    assistantMessageId: string,
    providerMessages: Array<Record<string, unknown>>,
    depth: number,
  ) => Promise<void>>(async () => {});

  const continueAfterTools = useCallback(async (run: PendingToolRun) => {
    if (run.provider !== 'openai-compatible' || !run.providerMessages) {
      patchMessage(run.conversationId, run.assistantMessageId, message => ({
        ...message,
        status: run.calls.some(call => call.status === 'error') ? 'error' : 'completed',
      }));
      setBusy(false);
      activeRequestRef.current = null;
      return;
    }
    const toolMessages = run.calls.map(call => ({
      role: 'tool',
      tool_call_id: call.id,
      content: JSON.stringify(call.status === 'declined'
        ? { declined: true }
        : (call.result ?? { error: call.error || '工具没有返回结果' })),
    }));
    await runOpenAiLoopRef.current(
      run.conversationId,
      run.assistantMessageId,
      [...run.providerMessages, ...toolMessages],
      run.depth + 1,
    );
  }, [patchMessage]);

  const processToolCalls = useCallback(async (
    run: PendingToolRun,
  ) => {
    const settingsNow = settingsRef.current;
    for (const call of run.calls) {
      const requiresApproval = !isCanvasAgentToolReadOnly(call.name)
        && settingsNow.approvalMode === 'ask'
        && isCanvasAgentToolSensitive(call.name);
      if (requiresApproval) {
        call.status = 'awaiting-approval';
      } else {
        await executeToolCall(run, call);
      }
    }
    updateToolCalls(run);
    if (run.calls.some(call => call.status === 'awaiting-approval')) {
      pendingToolRunsRef.current.set(run.conversationId, run);
      setBusy(false);
      return;
    }
    await continueAfterTools(run);
  }, [continueAfterTools, executeToolCall, updateToolCalls]);

  const runOpenAiLoop = useCallback(async (
    conversationId: string,
    assistantMessageId: string,
    providerMessages: Array<Record<string, unknown>>,
    depth: number,
  ) => {
    if (depth >= 6) throw new Error('Agent 连续工具调用过多，已停止');
    if (depth > 0) {
      patchMessage(conversationId, assistantMessageId, message => ({
        ...message,
        content: message.content.trim() ? `${message.content.trimEnd()}\n\n` : '',
        status: 'streaming',
      }));
    }
    const requestId = createAgentId('agent-api');
    activeOpenAiRequestsRef.current.set(requestId, {
      conversationId,
      messageId: assistantMessageId,
      streamed: false,
    });
    activeRequestRef.current = {
      provider: 'openai-compatible',
      requestId,
      assistantMessageId,
    };
    const result = await invoke<OpenAiChatResult>('agent_openai_chat', {
      request: {
        requestId,
        messages: providerMessages,
        tools: CANVAS_AGENT_TOOL_DEFINITIONS,
      },
    });
    const activeStream = activeOpenAiRequestsRef.current.get(requestId);
    activeOpenAiRequestsRef.current.delete(requestId);
    if (!activeStream?.streamed && result.content) {
      patchMessage(conversationId, assistantMessageId, message => ({
        ...message,
        content: `${message.content}${result.content}`,
      }));
    }
    if (!result.toolCalls?.length) {
      patchMessage(conversationId, assistantMessageId, message => ({
        ...message,
        content: message.content.trim() || '已完成。',
        status: 'completed',
      }));
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
      providerMessages: [...providerMessages, assistantProviderMessage],
      calls,
      depth,
    });
  }, [patchMessage, processToolCalls]);
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
    if (!options.forceNew && conversation.codexThreadId && !loadedCodexThreadsRef.current.has(conversation.codexThreadId)) {
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
    } else if (!options.forceNew && conversation.codexThreadId) {
      return conversation.codexThreadId;
    }

    const current = settingsRef.current;
    const codexModel = options.forceDefaultModel ? '' : normalizeCodexModelOverride(current.codexModel);
    const result = await invoke<Record<string, unknown>>('agent_codex_request', {
      method: 'thread/start',
      params: {
        ...(codexModel ? { model: codexModel } : {}),
        sandbox: current.codexSandbox,
        approvalPolicy: current.codexApprovalPolicy,
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
    patchConversation(conversation.id, value => ({ ...value, codexThreadId: threadId }));
    return threadId;
  }, [ensureCodexStarted, patchConversation]);

  const waitForCodexTurn = useCallback((
    conversationId: string,
    assistantMessageId: string,
    threadId: string,
  ) => new Promise<Record<string, unknown>>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      pendingCodexTurnsRef.current.delete(threadId);
      reject(new Error('Codex 会话等待超时'));
    }, 15 * 60 * 1000);
    pendingCodexTurnsRef.current.set(threadId, {
      conversationId,
      assistantMessageId,
      threadId,
      raw: '',
      resolve,
      reject,
      timeoutId,
    });
  }), []);

  const runCodexTurn = useCallback(async (
    conversation: AgentConversation,
    assistantMessageId: string,
    userText: string,
    context: AgentCanvasContext,
    forceDefaultCodexModel = false,
  ) => {
    const systemPrompt = buildCanvasAgentSystemPrompt(settingsRef.current.systemPrompt, context);
    let threadId = '';
    try {
      threadId = await startOrResumeCodexThread(conversation, systemPrompt, {
        forceNew: forceDefaultCodexModel,
        forceDefaultModel: forceDefaultCodexModel,
      });
    } catch (error) {
      if (!forceDefaultCodexModel && isCodexLiteUnsupportedModelError(error)) {
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
          true,
        );
      }
      throw error;
    }
    activeRequestRef.current = {
      provider: 'codex',
      threadId,
      assistantMessageId,
    };
    try {
      const startTurn = async (text: string, withOutputSchema: boolean) => {
        const completion = waitForCodexTurn(conversation.id, assistantMessageId, threadId);
        const response = await invoke<Record<string, unknown>>('agent_codex_request', {
          method: 'turn/start',
          params: {
            threadId,
            input: [{ type: 'text', text }],
            ...(withOutputSchema ? { outputSchema: CANVAS_AGENT_ACTION_SCHEMA } : {}),
            approvalPolicy: settingsRef.current.codexApprovalPolicy,
          },
        });
        const turn = asRecord(response.turn);
        const turnId = String(turn.id || '');
        const pending = pendingCodexTurnsRef.current.get(threadId);
        if (pending && turnId) pending.turnId = turnId;
        if (activeRequestRef.current) activeRequestRef.current.turnId = turnId;
        return completion;
      };

      let completed = await startTurn(
        `${userText}\n\n应用提供的当前画布上下文：${JSON.stringify(context)}\n\n请返回 reply 和 actions。不要运行 shell、不要修改本地文件。`,
        true,
      );
      if (completed.interrupted === true) {
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
          content: 'Codex 正在重新整理画布操作…',
          status: 'streaming',
        }));
        completed = await startTurn(
          '上一轮没有生成可见结果。请重新完成用户刚才的画布请求，只输出一个 JSON 对象，包含字符串 reply 和数组 actions；每个 action 包含 tool 与 arguments。不要运行 shell，不要修改本地文件。',
          false,
        );
        if (completed.interrupted === true) {
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
        });
      } else {
        setBusy(false);
        activeRequestRef.current = null;
      }
    } catch (error) {
      const pending = pendingCodexTurnsRef.current.get(threadId);
      if (pending) {
        window.clearTimeout(pending.timeoutId);
        pendingCodexTurnsRef.current.delete(threadId);
      }
      if (!forceDefaultCodexModel && isCodexLiteUnsupportedModelError(error)) {
        loadedCodexThreadsRef.current.delete(threadId);
        patchConversation(conversation.id, value => ({ ...value, codexThreadId: undefined }));
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
          true,
        );
      }
      throw error;
    }
  }, [patchConversation, patchMessage, processToolCalls, startOrResumeCodexThread, waitForCodexTurn]);

  const sendMessage = useCallback(async (content: string) => {
    const text = content.trim();
    if (!text || busy) return false;
    if (pendingToolRunsRef.current.has(activeConversationIdRef.current)) {
      optionsRef.current.onNotice?.('请先确认或拒绝当前画布操作');
      return false;
    }
    const conversation = conversationsRef.current.find(item => item.id === activeConversationIdRef.current)
      || conversationsRef.current[0];
    if (!conversation) return false;
    const provider = settingsRef.current.provider;
    const userMessage: AgentChatMessage = {
      id: createAgentId('agent-user'),
      role: 'user',
      content: text,
      timestamp: Date.now(),
      status: 'completed',
    };
    const assistantMessage: AgentChatMessage = {
      id: createAgentId('agent-assistant'),
      role: 'agent',
      content: '',
      timestamp: Date.now() + 1,
      status: 'streaming',
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
      const context = optionsRef.current.getContext();
      if (provider === 'codex') {
        await runCodexTurn(conversation, assistantMessage.id, text, context);
      } else {
        const systemPrompt = buildCanvasAgentSystemPrompt(settingsRef.current.systemPrompt, context);
        const providerMessages: Array<Record<string, unknown>> = [
          { role: 'system', content: systemPrompt },
          ...makeProviderHistory(conversation),
          { role: 'user', content: text },
        ];
        await runOpenAiLoop(conversation.id, assistantMessage.id, providerMessages, 0);
      }
      return true;
    } catch (error) {
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
  }, [busy, patchConversation, patchMessage, runCodexTurn, runOpenAiLoop]);

  const resolveToolCall = useCallback(async (toolCallId: string, approved: boolean) => {
    const run = [...pendingToolRunsRef.current.values()]
      .find(value => value.calls.some(call => call.id === toolCallId));
    if (!run) return;
    const call = run.calls.find(value => value.id === toolCallId);
    if (!call || call.status !== 'awaiting-approval') return;
    setBusy(true);
    if (approved) {
      await executeToolCall(run, call);
    } else {
      call.status = 'declined';
      call.result = { declined: true };
      updateToolCalls(run);
    }
    if (run.calls.every(value => ['completed', 'declined', 'error'].includes(value.status))) {
      pendingToolRunsRef.current.delete(run.conversationId);
      await continueAfterTools(run);
    } else {
      setBusy(false);
    }
  }, [continueAfterTools, executeToolCall, updateToolCalls]);

  const cancelCurrent = useCallback(async () => {
    const active = activeRequestRef.current;
    if (!active) return;
    try {
      if (active.provider === 'openai-compatible' && active.requestId) {
        await invoke('agent_cancel_openai', { requestId: active.requestId });
      } else if (active.threadId && active.turnId) {
        await invoke('agent_codex_request', {
          method: 'turn/interrupt',
          params: { threadId: active.threadId, turnId: active.turnId },
        });
      }
    } catch (_) {
      // The completion event or request error below will still settle the UI.
    }
    const conversationId = activeConversationIdRef.current;
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
    const saved = normalizeAgentSettings(await invoke('agent_save_settings', { input }));
    settingsRef.current = saved;
    setSettings(saved);
    return saved;
  }, []);

  const listOpenAiModels = useCallback(async () => (
    invoke<string[]>('agent_list_openai_models')
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
    await refreshCodexStatus();
  }, [ensureCodexStarted, refreshCodexStatus]);

  const resolveCodexApproval = useCallback(async (
    approval: AgentCodexApproval,
    approved: boolean,
  ) => {
    let result: Record<string, unknown> = { decision: approved ? 'accept' : 'decline' };
    if (approval.method === 'item/tool/requestUserInput') result = { answers: {} };
    await invoke('agent_codex_respond', { id: approval.id, result });
    setCodexApprovals(current => current.filter(item => String(item.id) !== String(approval.id)));
  }, []);

  return {
    settings,
    settingsLoading,
    saveSettings,
    refreshSettings,
    listOpenAiModels,
    codexStatus,
    codexRateLimits,
    codexRateLimitsLoading,
    codexRateLimitsError,
    codexInstallProgress,
    codexLoginInfo,
    installCodex,
    refreshCodexStatus,
    refreshCodexRateLimits,
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
    newConversation,
    selectConversation,
    deleteConversation,
    clearConversation,
    clearAllHistory,
    getToolLabel: getCanvasAgentToolLabel,
  };
}
