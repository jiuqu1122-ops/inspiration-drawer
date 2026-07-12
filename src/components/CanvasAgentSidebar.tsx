import {
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  Clock3,
  Copy,
  Gauge,
  History,
  Image as ImageIcon,
  Film,
  LoaderCircle,
  MessageSquarePlus,
  Monitor,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Square,
  Trash2,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AgentChatMessage,
  AgentCanvasSelectionItem,
  AgentCodexApproval,
  AgentConversation,
  AgentSendOptions,
  AgentSettings,
  CodexModelOption,
  CodexRateLimits,
  CodexReasoningEffort,
  CodexRuntimeStatus,
} from '../features/agentModel';
import { getCanvasAgentToolLabel } from '../features/canvasAgentTools';

type CanvasAgentSidebarProps = {
  width: number;
  messages: AgentChatMessage[];
  inputValue: string;
  busy: boolean;
  settings: AgentSettings;
  codexStatus: CodexRuntimeStatus | null;
  codexRateLimits: CodexRateLimits | null;
  codexRateLimitsLoading: boolean;
  codexRateLimitsError: string;
  codexModels: CodexModelOption[];
  codexModelsLoading: boolean;
  codexModelsError: string;
  conversations: AgentConversation[];
  activeConversationId: string;
  codexApprovals: AgentCodexApproval[];
  selectedItems: AgentCanvasSelectionItem[];
  onWidthChange: (width: number) => void;
  onClose: () => void;
  onFocusCanvasItem: (id: string) => void;
  onInputChange: (value: string) => void;
  onSendMessage: (content: string, options?: AgentSendOptions) => void;
  onCancel: () => void;
  onRetry: () => void;
  onRefreshCodexRateLimits: () => Promise<unknown>;
  onRefreshCodexModels: () => Promise<CodexModelOption[]>;
  onSaveSettings: (settings: AgentSettings) => Promise<AgentSettings>;
  onRequestCodexLogin: () => void;
  onResolveToolCall: (id: string, approved: boolean) => void;
  onResolveCodexApproval: (approval: AgentCodexApproval, approved: boolean) => void;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onClearConversation: () => void;
};

const formatWindowLabel = (minutes: number | null) => {
  if (!minutes) return '额度窗口';
  if (minutes === 300) return '5 小时额度';
  if (minutes === 10080) return '每周额度';
  if (minutes % 1440 === 0) return `${minutes / 1440} 天额度`;
  if (minutes % 60 === 0) return `${minutes / 60} 小时额度`;
  return `${minutes} 分钟额度`;
};

const formatResetTime = (seconds: number | null) => {
  if (!seconds) return '重置时间未知';
  return `重置于 ${new Date(seconds * 1000).toLocaleString([], {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

const planLabel = (planType: string) => ({
  free: 'Free',
  go: 'Go',
  plus: 'Plus',
  pro: 'Pro',
  prolite: 'Pro Lite',
  team: 'Team',
  business: 'Business',
  enterprise: 'Enterprise',
  edu: 'Edu',
}[planType] || planType || 'ChatGPT');

const CODEX_SANDBOX_OPTIONS: Array<{
  value: AgentSettings['codexSandbox'];
  label: string;
  description: string;
}> = [
  {
    value: 'read-only',
    label: '只读模式',
    description: 'Codex 只能读取上下文，适合纯画布规划。',
  },
  {
    value: 'workspace-write',
    label: '工作区访问',
    description: '允许在当前工作区写入，适合需要落地文件的任务。',
  },
  {
    value: 'danger-full-access',
    label: '完全访问',
    description: '允许访问本机文件；只在你明确需要时开启。',
  },
];

const AGENT_PROVIDER_OPTIONS: Array<{
  value: AgentSettings['provider'];
  label: string;
  description: string;
}> = [
  {
    value: 'openai-compatible',
    label: 'API 模式',
    description: '使用自定义 OpenAI 兼容 API。',
  },
  {
    value: 'codex',
    label: 'ChatGPT 登录',
    description: '使用 GPT 登录的 Codex App Server。',
  },
];

type WorkflowPlanningMode = 'ai' | 'quick';

const WORKFLOW_PLANNING_MODE_OPTIONS: Array<{
  value: WorkflowPlanningMode;
  label: string;
  description: string;
}> = [
  {
    value: 'ai',
    label: 'AI 规划',
    description: '使用当前 Agent API 深度分析并设计工作流。',
  },
  {
    value: 'quick',
    label: '快速规划',
    description: '不调用大模型，使用本地规则生成草案。',
  },
];

const CODEX_REASONING_LABELS: Record<Exclude<CodexReasoningEffort, ''>, string> = {
  minimal: '最低',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '超高',
};

const compactCodexModelLabel = (value: string) => value
  .replace(/^GPT-/i, '')
  .replace(/^gpt-/i, '')
  .replace(/-mini$/i, ' Mini')
  .replace(/-codex-spark$/i, ' Spark');

const THINKING_STATUS_LABELS = {
  running: '进行中',
  waiting: '等待确认',
  completed: '已完成',
  cancelled: '已停止',
  error: '异常',
};

const thinkingStatusClassName = (status: string) => {
  if (status === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200';
  if (status === 'error') return 'border-red-200 bg-red-50 text-red-600 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200';
  if (status === 'cancelled') return 'border-stone-200 bg-stone-50 text-stone-500 dark:border-white/10 dark:bg-white/6 dark:text-stone-400';
  if (status === 'waiting') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100';
  return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200';
};

const thinkingDotClassName = (status: string) => {
  if (status === 'completed') return 'bg-emerald-400';
  if (status === 'error') return 'bg-red-400';
  if (status === 'cancelled') return 'bg-stone-300 dark:bg-stone-600';
  if (status === 'waiting') return 'bg-amber-400';
  return 'bg-blue-500';
};

const formatThinkingDuration = (start: number, end: number) => {
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds <= 1) return '刚刚';
  if (seconds < 60) return seconds + 's';
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return remain ? minutes + 'm ' + remain + 's' : minutes + 'm';
};

export function CanvasAgentSidebar({
  width,
  messages,
  inputValue,
  busy,
  settings,
  codexStatus,
  codexRateLimits,
  codexRateLimitsLoading,
  codexRateLimitsError,
  codexModels,
  codexModelsLoading,
  codexModelsError,
  conversations,
  activeConversationId,
  codexApprovals,
  selectedItems,
  onWidthChange,
  onClose,
  onFocusCanvasItem,
  onInputChange,
  onSendMessage,
  onCancel,
  onRetry,
  onRefreshCodexRateLimits,
  onRefreshCodexModels,
  onSaveSettings,
  onRequestCodexLogin,
  onResolveToolCall,
  onResolveCodexApproval,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
  onClearConversation,
}: CanvasAgentSidebarProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [showAccessMenu, setShowAccessMenu] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showPlanningMenu, setShowPlanningMenu] = useState(false);
  const [workflowPlanningMode, setWorkflowPlanningMode] = useState<WorkflowPlanningMode>('ai');
  const [savingAccess, setSavingAccess] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState('');
  const [expandedThinkingMessageIds, setExpandedThinkingMessageIds] = useState<string[]>([]);
  const [thinkingNow, setThinkingNow] = useState(Date.now());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, codexApprovals]);

  useEffect(() => {
    window.setTimeout(() => inputRef.current?.focus(), 120);
  }, []);

  useEffect(() => {
    if (!messages.some(message => message.status === 'streaming' && message.thinkingSteps?.length)) return;
    const id = window.setInterval(() => setThinkingNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [messages]);

  useEffect(() => {
    if (settings.provider === 'codex' && codexStatus?.authenticated) {
      void onRefreshCodexRateLimits().catch(() => {});
    }
  }, [codexStatus?.authenticated, onRefreshCodexRateLimits, settings.provider]);

  useEffect(() => {
    if (!showHistory && !showUsage && !showAccessMenu && !showModelMenu && !showPlanningMenu) return;
    const closePopovers = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (showHistory && !target.closest('[data-agent-history-menu="true"], [data-agent-history-toggle="true"]')) {
        setShowHistory(false);
      }
      if (showUsage && !target.closest('[data-codex-usage-popover="true"], [data-codex-usage-toggle="true"]')) {
        setShowUsage(false);
      }
      if (showAccessMenu && !target.closest('[data-agent-access-menu="true"], [data-agent-access-toggle="true"]')) {
        setShowAccessMenu(false);
      }
      if (showModelMenu && !target.closest('[data-agent-model-menu="true"], [data-agent-model-toggle="true"]')) {
        setShowModelMenu(false);
      }
      if (showPlanningMenu && !target.closest('[data-agent-planning-menu="true"], [data-agent-planning-toggle="true"]')) {
        setShowPlanningMenu(false);
      }
    };
    document.addEventListener('pointerdown', closePopovers, true);
    return () => document.removeEventListener('pointerdown', closePopovers, true);
  }, [showAccessMenu, showHistory, showModelMenu, showPlanningMenu, showUsage]);

  const providerReady = settings.provider === 'codex'
    ? !!codexStatus?.authenticated
    : settings.hasApiKey;
  const primaryRemaining = codexRateLimits?.primary
    ? Math.max(0, 100 - codexRateLimits.primary.usedPercent)
    : codexRateLimits?.remainingPercent;
  const accessLabel = settings.codexSandbox === 'danger-full-access'
    ? '完全访问'
    : settings.codexSandbox === 'workspace-write'
      ? '工作区访问'
      : '只读模式';
  const selectedCodexModel = useMemo(() => {
    const configured = settings.codexModel.trim();
    if (configured) {
      return codexModels.find(model => model.model === configured || model.id === configured) || null;
    }
    return codexModels.find(model => model.isDefault) || codexModels[0] || null;
  }, [codexModels, settings.codexModel]);
  const selectedReasoningEffort = settings.codexReasoningEffort
    || selectedCodexModel?.defaultReasoningEffort
    || 'medium';
  const reasoningOptions = selectedCodexModel?.supportedReasoningEfforts.length
    ? selectedCodexModel.supportedReasoningEfforts
    : (['low', 'medium', 'high', 'xhigh'] as const).map(reasoningEffort => ({
      reasoningEffort,
      description: '',
    }));
  const modelLabel = settings.provider === 'codex'
    ? selectedCodexModel?.displayName || settings.codexModel || 'Codex 默认'
    : settings.apiModel || 'API 模型';
  const modelControlLabel = settings.provider === 'codex'
    ? `${compactCodexModelLabel(modelLabel)} · ${CODEX_REASONING_LABELS[selectedReasoningEffort]}`
    : modelLabel;
  const activeConversation = useMemo(
    () => conversations.find(item => item.id === activeConversationId),
    [activeConversationId, conversations],
  );
  const visibleSelectedItems = selectedItems.slice(0, 5);
  const hiddenSelectedCount = Math.max(0, selectedItems.length - visibleSelectedItems.length);
  const selectedWorkflowPlanningOption = WORKFLOW_PLANNING_MODE_OPTIONS.find(option => option.value === workflowPlanningMode)
    || WORKFLOW_PLANNING_MODE_OPTIONS[0];

  const startResize = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = width;
    const move = (moveEvent: PointerEvent) => {
      onWidthChange(Math.min(620, Math.max(340, startWidth + startX - moveEvent.clientX)));
    };
    const stop = () => {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', stop, true);
      document.removeEventListener('pointercancel', stop, true);
    };
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', stop, true);
    document.addEventListener('pointercancel', stop, true);
  };

  const sendCurrentMessage = () => {
    const content = inputValue.trim();
    if (!content || busy) return;
    const options = workflowPlanningMode === 'quick'
      ? { quickPlanRequested: true }
      : undefined;
    onSendMessage(content, options);
    setShowPlanningMenu(false);
    if (workflowPlanningMode === 'quick') setWorkflowPlanningMode('ai');
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation();
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    sendCurrentMessage();
  };

  const copyMessageText = async (message: AgentChatMessage) => {
    const text = [message.content, message.error].filter(Boolean).join('\n\n').trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    setCopiedMessageId(message.id);
    window.setTimeout(() => {
      setCopiedMessageId(current => (current === message.id ? '' : current));
    }, 1200);
  };

  const toggleThinkingExpanded = (messageId: string) => {
    setExpandedThinkingMessageIds(current => (
      current.includes(messageId)
        ? current.filter(id => id !== messageId)
        : [...current, messageId]
    ));
  };

  const updateCodexSandbox = async (codexSandbox: AgentSettings['codexSandbox']) => {
    if (settings.provider !== 'codex' || codexSandbox === settings.codexSandbox || savingAccess) {
      setShowAccessMenu(false);
      return;
    }
    setSavingAccess(true);
    try {
      await onSaveSettings({ ...settings, codexSandbox });
      setShowAccessMenu(false);
    } finally {
      setSavingAccess(false);
    }
  };

  const updateAgentProvider = async (provider: AgentSettings['provider']) => {
    if (provider === settings.provider || savingAccess || busy) {
      setShowAccessMenu(false);
      return;
    }
    setSavingAccess(true);
    try {
      const shouldRequestLogin = provider === 'codex' && codexStatus?.authenticated !== true;
      await onSaveSettings({ ...settings, provider });
      setShowAccessMenu(false);
      setShowUsage(false);
      setShowModelMenu(false);
      setShowHistory(false);
      setShowPlanningMenu(false);
      if (shouldRequestLogin) onRequestCodexLogin();
    } finally {
      setSavingAccess(false);
    }
  };

  const updateCodexModel = async (model: CodexModelOption) => {
    if (settings.provider !== 'codex' || savingModel || busy) return;
    const supportedEfforts = model.supportedReasoningEfforts.map(option => option.reasoningEffort);
    const nextEffort = settings.codexReasoningEffort
      && supportedEfforts.includes(settings.codexReasoningEffort)
      ? settings.codexReasoningEffort
      : model.defaultReasoningEffort;
    setSavingModel(true);
    try {
      await onSaveSettings({
        ...settings,
        codexModel: model.model,
        codexReasoningEffort: nextEffort,
      });
    } finally {
      setSavingModel(false);
    }
  };

  const updateCodexReasoningEffort = async (
    codexReasoningEffort: Exclude<CodexReasoningEffort, ''>,
  ) => {
    if (settings.provider !== 'codex' || savingModel || busy) return;
    setSavingModel(true);
    try {
      await onSaveSettings({ ...settings, codexReasoningEffort });
      setShowModelMenu(false);
    } finally {
      setSavingModel(false);
    }
  };

  return (
    <aside
      data-no-drag="true"
      data-canvas-agent-sidebar="true"
      className="relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-l border-blue-100/80 bg-blue-50/30 text-stone-800 shadow-[-18px_0_42px_rgba(52,86,124,0.08)] dark:border-blue-400/18 dark:bg-stone-950/40 dark:text-stone-100"
      style={{
        width,
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(96,122,158,0.10) 1px, transparent 0)',
        backgroundSize: '26px 26px',
      }}
      onPointerDown={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
      onWheel={event => event.stopPropagation()}
    >
      <div className="pointer-events-none absolute inset-0 bg-white/58 backdrop-blur-2xl dark:bg-stone-950/74" />
      <div
        className="absolute inset-y-0 left-0 z-30 w-1.5 cursor-col-resize transition-colors hover:bg-blue-400/35"
        onPointerDown={startResize}
        title="拖动调整侧边栏宽度"
      />

      <header className="relative z-40 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-blue-100/70 px-3.5 dark:border-white/8">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] border border-blue-200/70 bg-blue-500 text-white shadow-[0_5px_14px_rgba(59,130,246,0.22)] dark:border-blue-300/15 dark:bg-blue-500/90">
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-semibold tracking-[-0.01em]">{activeConversation?.title || '画布 Agent'}</span>
              {busy && <LoaderCircle className="h-3 w-3 animate-spin text-blue-500" />}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[9px] font-medium text-stone-400 dark:text-stone-500">
              <span className={`h-1.5 w-1.5 rounded-full ${providerReady ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {settings.provider === 'codex' ? 'ChatGPT · 本地 App Server' : '自定义 API · 本地 App Server'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          <button type="button" data-agent-history-toggle="true" onClick={() => { setShowHistory(value => !value); setShowUsage(false); setShowAccessMenu(false); setShowModelMenu(false); }} className={`flex h-8 w-8 items-center justify-center rounded-[10px] transition-colors ${showHistory ? 'bg-blue-500/10 text-blue-600 dark:text-blue-300' : 'text-stone-400 hover:bg-white/75 hover:text-stone-700 dark:hover:bg-white/8 dark:hover:text-stone-200'}`} title="会话历史">
            <History className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onNewConversation} className="flex h-8 w-8 items-center justify-center rounded-[10px] text-stone-400 transition-colors hover:bg-white/75 hover:text-blue-600 dark:hover:bg-white/8 dark:hover:text-blue-300" title="新对话">
            <MessageSquarePlus className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onClearConversation} className="flex h-8 w-8 items-center justify-center rounded-[10px] text-stone-400 transition-colors hover:bg-white/75 hover:text-red-500 dark:hover:bg-white/8" title="清空当前对话">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-[10px] text-stone-400 transition-colors hover:bg-white/75 hover:text-stone-700 dark:hover:bg-white/8 dark:hover:text-stone-200" title="收起 Agent">
            <ChevronLeft className="h-4 w-4 rotate-180" />
          </button>
        </div>

        {showHistory && (
          <div data-agent-history-menu="true" className="absolute left-3 right-3 top-[50px] z-50 max-h-[320px] overflow-y-auto rounded-[16px] border border-blue-100/90 bg-white/96 p-1.5 shadow-[0_18px_48px_rgba(30,64,104,0.18)] backdrop-blur-2xl dark:border-white/10 dark:bg-stone-900/96">
            {conversations.map(conversation => (
              <div key={conversation.id} className={`group/history flex items-center gap-1 rounded-[11px] ${conversation.id === activeConversationId ? 'bg-blue-50 dark:bg-blue-400/10' : 'hover:bg-stone-50 dark:hover:bg-white/6'}`}>
                <button
                  type="button"
                  onClick={() => { onSelectConversation(conversation.id); setShowHistory(false); }}
                  className="min-w-0 flex-1 px-2.5 py-2 text-left"
                  title="切换到此对话"
                >
                  <div className="truncate text-[10px] font-semibold text-stone-700 dark:text-stone-200">{conversation.title}</div>
                  <div className="mt-1 flex items-center gap-1 text-[8px] text-stone-400">
                    <Clock3 className="h-2.5 w-2.5" />
                    {new Date(conversation.updatedAt).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    <span>· {conversation.provider === 'codex' ? 'Codex' : 'API'}</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    onDeleteConversation(conversation.id);
                  }}
                  className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] text-stone-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:text-stone-500 dark:hover:bg-red-400/10 dark:hover:text-red-200"
                  title="删除会话"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </header>

      <main className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-5 [scrollbar-width:thin]">
        {messages.length === 0 && codexApprovals.length === 0 ? (
          <div className="flex min-h-full flex-col items-center justify-center px-3 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-blue-100 bg-white/75 text-blue-500 shadow-sm dark:border-white/8 dark:bg-white/5 dark:text-blue-300">
              <Bot className="h-5 w-5" />
            </div>
            <p className="mt-4 text-[14px] font-semibold tracking-[-0.02em] text-stone-700 dark:text-stone-200">在画布里开始创作</p>
            <p className="mt-1 max-w-[260px] text-[10px] leading-5 text-stone-400 dark:text-stone-500">告诉 Codex 你的目标，它会组合已有节点、预设和工作流。</p>
            <div className="mt-5 grid w-full gap-2 text-left text-[10px] leading-4">
              {[
                '把选中的产品图做成一套详情页',
                '给选中的图片创建一张炫酷渲染图',
                '整理画布并连接现有工作流',
              ].map(example => (
                <button type="button" key={example} onClick={() => { onInputChange(example); inputRef.current?.focus(); }} className="rounded-[14px] border border-blue-100/85 bg-white/58 px-3 py-2.5 font-medium text-stone-500 transition-all hover:border-blue-200 hover:bg-white hover:text-blue-700 hover:shadow-sm dark:border-white/8 dark:bg-white/4 dark:text-stone-400 dark:hover:border-blue-300/15 dark:hover:bg-white/7 dark:hover:text-blue-200">
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {messages.map(message => {
              const isUser = message.role === 'user';
              const thinkingSteps = !isUser ? (message.thinkingSteps || []) : [];
              const latestThinkingStep = thinkingSteps[thinkingSteps.length - 1];
              const hasActiveThinkingStep = thinkingSteps.some(step => step.status === 'running' || step.status === 'waiting');
              const thinkingExpanded = message.status === 'streaming'
                || expandedThinkingMessageIds.includes(message.id);
              return (
                <section key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div className={isUser ? 'max-w-[90%] rounded-[22px] bg-blue-500 px-3.5 py-2.5 text-white shadow-sm' : 'w-full'}>
                    {!isUser && (
                      <div className="mb-2 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-stone-400 dark:text-stone-500">
                        <Bot className="h-3 w-3 text-blue-500 dark:text-blue-300" /> Codex
                        {message.status === 'streaming' && <LoaderCircle className="h-3 w-3 animate-spin text-blue-500" />}
                      </div>
                    )}
                    <p className={`select-text whitespace-pre-wrap text-[12px] leading-[1.72] ${isUser ? 'text-white' : 'text-stone-700 dark:text-stone-200'}`}>
                      {message.content || (message.status === 'streaming' ? '正在思考…' : '')}
                    </p>

                    {message.selectionSnapshot && message.selectionSnapshot.length > 0 && (
                      <div className={['mt-2 flex flex-wrap gap-1', isUser ? 'justify-end' : ''].filter(Boolean).join(' ')}>
                        {message.selectionSnapshot.slice(0, 5).map(item => (
                          <span
                            key={item.id}
                            className={isUser
                              ? 'max-w-[142px] truncate rounded-full bg-white/16 px-2 py-0.5 text-[8px] font-medium text-white/78'
                              : 'max-w-[160px] truncate rounded-full bg-blue-50 px-2 py-0.5 text-[8px] font-medium text-blue-600 dark:bg-blue-400/10 dark:text-blue-200'}
                          >
                            发送时选中：{item.name}
                          </span>
                        ))}
                        {message.selectionSnapshot.length > 5 && (
                          <span className={isUser
                            ? 'rounded-full bg-white/16 px-2 py-0.5 text-[8px] font-medium text-white/78'
                            : 'rounded-full bg-stone-100 px-2 py-0.5 text-[8px] font-medium text-stone-500 dark:bg-white/7 dark:text-stone-400'}>
                            +{message.selectionSnapshot.length - 5}
                          </span>
                        )}
                      </div>
                    )}

                    {thinkingSteps.length > 0 && (
                      <div className="mt-3 overflow-hidden rounded-[15px] border border-blue-100/85 bg-white/62 shadow-sm dark:border-white/8 dark:bg-white/4">
                        <button
                          type="button"
                          onClick={() => toggleThinkingExpanded(message.id)}
                          className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left transition-colors hover:bg-blue-50/70 dark:hover:bg-white/6"
                        >
                          <span className="min-w-0">
                            <span className="flex items-center gap-1.5 text-[10px] font-semibold text-stone-700 dark:text-stone-200">
                              <span
                                className={[
                                  'h-1.5 w-1.5 rounded-full',
                                  thinkingDotClassName(latestThinkingStep?.status || 'running'),
                                  hasActiveThinkingStep ? 'animate-pulse' : '',
                                ].filter(Boolean).join(' ')}
                              />
                              <span>{message.status === 'streaming' ? '思考与执行过程' : '过程摘要'}</span>
                              <span
                                className={[
                                  'rounded-full border px-1.5 py-0.5 text-[8px] font-medium',
                                  thinkingStatusClassName(latestThinkingStep?.status || 'running'),
                                ].join(' ')}
                              >
                                {THINKING_STATUS_LABELS[(latestThinkingStep?.status || 'running') as keyof typeof THINKING_STATUS_LABELS] || '进行中'}
                              </span>
                            </span>
                            <span className="mt-1 block truncate text-[9px] text-stone-400 dark:text-stone-500">
                              {latestThinkingStep?.title || '正在处理'} · {thinkingSteps.length} 步 · 公开进度，不含模型私有推理
                            </span>
                          </span>
                          <ChevronDown
                            className={[
                              'h-3.5 w-3.5 shrink-0 text-stone-400 transition-transform',
                              thinkingExpanded ? 'rotate-180' : '',
                            ].filter(Boolean).join(' ')}
                          />
                        </button>
                        {thinkingExpanded && (
                          <div className="border-t border-blue-50/90 px-2.5 py-2 dark:border-white/7">
                            <div className="space-y-2">
                              {thinkingSteps.map((step, index) => {
                                const running = step.status === 'running' || step.status === 'waiting';
                                const elapsed = formatThinkingDuration(
                                  step.timestamp,
                                  step.completedAt || (running ? thinkingNow : step.timestamp),
                                );
                                return (
                                  <div key={step.id} className="flex gap-2">
                                    <div className="flex flex-col items-center">
                                      <span
                                        className={[
                                          'mt-1 h-2 w-2 rounded-full',
                                          thinkingDotClassName(step.status),
                                          running ? 'animate-pulse' : '',
                                        ].filter(Boolean).join(' ')}
                                      />
                                      {index < thinkingSteps.length - 1 && <span className="mt-1 h-full min-h-[14px] w-px bg-blue-100 dark:bg-white/9" />}
                                    </div>
                                    <div className="min-w-0 flex-1 pb-1">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="truncate text-[10px] font-medium text-stone-600 dark:text-stone-200">{step.title}</span>
                                        <span className="shrink-0 text-[8px] text-stone-400 dark:text-stone-600">{elapsed}</span>
                                      </div>
                                      {step.detail && (
                                        <div className="mt-0.5 max-h-12 overflow-hidden break-all text-[8px] leading-3.5 text-stone-400 dark:text-stone-500">
                                          {step.detail}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {message.toolCalls && message.toolCalls.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {message.toolCalls.map(call => (
                          <div key={call.id} className="rounded-[14px] border border-blue-100/80 bg-white/62 p-2.5 shadow-sm dark:border-white/8 dark:bg-white/4">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-[10px] font-semibold text-stone-700 dark:text-stone-200">{getCanvasAgentToolLabel(call.name)}</span>
                              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-medium ${call.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200' : call.status === 'error' || call.status === 'declined' ? 'bg-red-100 text-red-600 dark:bg-red-400/15 dark:text-red-200' : 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200'}`}>
                                {call.status === 'completed' ? '已完成' : call.status === 'error' ? '失败' : call.status === 'declined' ? '已拒绝' : call.status === 'running' ? '执行中' : '等待确认'}
                              </span>
                            </div>
                            <div className="mt-1.5 max-h-20 overflow-hidden break-all font-mono text-[8px] leading-3.5 text-stone-400 dark:text-stone-500">{JSON.stringify(call.arguments)}</div>
                            {call.error && <div className="mt-1.5 text-[9px] text-red-500">{call.error}</div>}
                            {call.status === 'awaiting-approval' && (
                              <div className="mt-2.5 flex gap-1.5">
                                <button type="button" onClick={() => onResolveToolCall(call.id, true)} className="flex items-center gap-1 rounded-[10px] bg-blue-500 px-2.5 py-1 text-[9px] font-medium text-white"><Check className="h-3 w-3" /> 执行</button>
                                <button type="button" onClick={() => onResolveToolCall(call.id, false)} className="rounded-[10px] bg-stone-200/80 px-2.5 py-1 text-[9px] font-medium text-stone-600 dark:bg-white/8 dark:text-stone-300">拒绝</button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {message.error && <div className="mt-2.5 select-text rounded-[12px] border border-red-100 bg-red-50/80 px-2.5 py-2 text-[9px] leading-4 text-red-600 dark:border-red-400/15 dark:bg-red-400/8 dark:text-red-200">{message.error}</div>}
                    {message.workflowPlanningFailure && !isUser && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSendMessage(message.workflowPlanningFailure?.userText || '', { forceWorkflowPlanningRoute: 'remote_ai' })}
                          disabled={busy}
                          className="rounded-[10px] bg-blue-500 px-2.5 py-1.5 text-[9px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          重试 AI 规划
                        </button>
                        <button
                          type="button"
                          onClick={() => onSendMessage(message.workflowPlanningFailure?.userText || '', { quickPlanRequested: true })}
                          disabled={busy}
                          className="flex items-center gap-1 rounded-[10px] border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[9px] font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100"
                        >
                          <Zap className="h-3 w-3" /> 使用快速规划
                        </button>
                      </div>
                    )}
                    <div className={`mt-1.5 flex items-center gap-1.5 text-[8px] ${isUser ? 'justify-end text-white/65' : 'text-stone-300 dark:text-stone-600'}`}>
                      <button
                        type="button"
                        onClick={() => void copyMessageText(message)}
                        disabled={!message.content.trim() && !message.error?.trim()}
                        className={`flex h-5 items-center gap-1 rounded-[7px] px-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${isUser ? 'hover:bg-white/12 hover:text-white' : 'hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-white/7 dark:hover:text-stone-300'}`}
                        title="复制消息"
                      >
                        {copiedMessageId === message.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        <span>{copiedMessageId === message.id ? '已复制' : '复制'}</span>
                      </button>
                      <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                </section>
              );
            })}

            {codexApprovals.map(approval => (
              <div key={String(approval.id)} className="rounded-[16px] border border-amber-200/90 bg-amber-50/85 p-3 shadow-sm dark:border-amber-400/20 dark:bg-amber-400/9">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-800 dark:text-amber-100"><ShieldCheck className="h-3.5 w-3.5" />{approval.title}</div>
                <div className="mt-1.5 max-h-24 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[9px] leading-4 text-amber-700/80 dark:text-amber-100/70">{approval.detail}</div>
                <div className="mt-2.5 flex gap-1.5">
                  <button type="button" onClick={() => onResolveCodexApproval(approval, true)} className="rounded-[10px] bg-amber-500 px-2.5 py-1 text-[9px] font-medium text-white">允许</button>
                  <button type="button" onClick={() => onResolveCodexApproval(approval, false)} className="rounded-[10px] bg-white/80 px-2.5 py-1 text-[9px] font-medium text-amber-700 dark:bg-white/8 dark:text-amber-100">拒绝</button>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      <footer className="relative z-20 shrink-0 px-3 pb-2.5 pt-1">
        {!providerReady && (
          <div className="mb-2 rounded-[12px] border border-amber-200/80 bg-amber-50/90 px-2.5 py-2 text-[9px] leading-4 text-amber-700 dark:border-amber-400/15 dark:bg-amber-400/8 dark:text-amber-100">未配置可用 API；工作流设计会使用本地快速规划。</div>
        )}

        {showUsage && settings.provider === 'codex' && (
          <div data-codex-usage-popover="true" className="absolute left-3 right-3 z-30 rounded-[16px] border border-blue-100/90 bg-white/96 p-3 shadow-[0_18px_50px_rgba(30,64,104,0.20)] backdrop-blur-2xl dark:border-white/10 dark:bg-stone-900/96" style={{ bottom: visibleSelectedItems.length > 0 ? 204 : 132 }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-semibold text-stone-700 dark:text-stone-200">Codex 剩余用量</div>
                <div className="mt-0.5 text-[8px] text-stone-400">{planLabel(codexRateLimits?.planType || '')} 账户</div>
              </div>
              <button type="button" onClick={() => void onRefreshCodexRateLimits().catch(() => {})} disabled={codexRateLimitsLoading} className="flex h-7 w-7 items-center justify-center rounded-[9px] text-stone-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-45 dark:hover:bg-white/7 dark:hover:text-blue-300" title="刷新用量"><RefreshCw className={`h-3.5 w-3.5 ${codexRateLimitsLoading ? 'animate-spin' : ''}`} /></button>
            </div>
            {codexRateLimits ? (
              <div className="mt-3 space-y-3">
                {[codexRateLimits.primary, codexRateLimits.secondary].filter(Boolean).map((window, index) => {
                  const remaining = Math.max(0, 100 - (window?.usedPercent || 0));
                  return (
                    <div key={`${window?.windowDurationMins}-${index}`}>
                      <div className="flex items-center justify-between text-[9px]">
                        <span className="font-medium text-stone-500 dark:text-stone-400">{formatWindowLabel(window?.windowDurationMins || null)}</span>
                        <span className="font-semibold text-stone-700 dark:text-stone-200">剩余 {remaining}%</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-white/8"><div className={`h-full rounded-full ${remaining <= 15 ? 'bg-red-400' : remaining <= 35 ? 'bg-amber-400' : 'bg-blue-500'}`} style={{ width: `${remaining}%` }} /></div>
                      <div className="mt-1 text-[8px] text-stone-400 dark:text-stone-500">{formatResetTime(window?.resetsAt || null)}</div>
                    </div>
                  );
                })}
                {codexRateLimits.creditsBalance && <div className="border-t border-stone-100 pt-2 text-[9px] text-stone-500 dark:border-white/8 dark:text-stone-400">Credits：{codexRateLimits.creditsBalance}</div>}
              </div>
            ) : (
              <div className="mt-3 rounded-[11px] bg-stone-50 px-2.5 py-2 text-[9px] text-stone-400 dark:bg-white/5 dark:text-stone-500">{codexRateLimitsLoading ? '正在读取用量…' : codexRateLimitsError || '暂无用量信息'}</div>
            )}
          </div>
        )}

        <div className="relative rounded-[22px] border border-blue-100/90 bg-white/82 p-1.5 shadow-[0_12px_34px_rgba(49,82,120,0.13)] backdrop-blur-2xl transition-all focus-within:border-blue-300 focus-within:shadow-[0_14px_38px_rgba(59,130,246,0.16)] dark:border-white/11 dark:bg-stone-900/84 dark:focus-within:border-blue-400/38">
          {visibleSelectedItems.length > 0 && (
            <div className="mb-1.5 flex max-h-[58px] flex-wrap gap-1.5 overflow-y-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {visibleSelectedItems.map((item, index) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => onFocusCanvasItem(item.id)}
                  className="group/selected flex h-7 max-w-[156px] items-center gap-1.5 rounded-[10px] border border-stone-200/80 bg-stone-50/86 px-1.5 text-[10px] font-medium text-stone-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-white/10 dark:bg-white/6 dark:text-stone-200 dark:hover:border-blue-300/20 dark:hover:bg-blue-400/10 dark:hover:text-blue-200"
                  title={`当前选中：${item.name}`}
                >
                  <span className="relative flex h-5 w-5 shrink-0 overflow-hidden rounded-[7px] bg-stone-200 text-stone-500 dark:bg-stone-800 dark:text-stone-300">
                    {item.thumbnail ? (
                      <img src={item.thumbnail} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center">
                        {item.type.includes('video') ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
                      </span>
                    )}
                    {selectedItems.length > 1 && <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-blue-500 px-0.5 text-[8px] leading-none text-white">{index + 1}</span>}
                  </span>
                  <span className="truncate">{item.name}</span>
                </button>
              ))}
              {hiddenSelectedCount > 0 && (
                <span className="flex h-7 items-center rounded-[10px] bg-stone-100 px-2 text-[10px] font-semibold text-stone-500 dark:bg-white/7 dark:text-stone-400">+{hiddenSelectedCount}</span>
              )}
            </div>
          )}
          {showAccessMenu && (
            <div data-agent-access-menu="true" className="absolute bottom-12 left-2 z-40 max-h-[320px] w-[236px] overflow-y-auto rounded-[16px] border border-amber-100/90 bg-white/96 p-1.5 shadow-[0_18px_50px_rgba(30,64,104,0.18)] backdrop-blur-2xl [scrollbar-width:thin] dark:border-white/10 dark:bg-stone-900/96">
              <div className="px-2 pb-1 pt-1 text-[9px] font-semibold text-stone-400 dark:text-stone-500">Agent 模式</div>
              {AGENT_PROVIDER_OPTIONS.map(option => {
                const active = option.value === settings.provider;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => void updateAgentProvider(option.value)}
                    disabled={savingAccess || busy}
                    className={`flex w-full items-start gap-2 rounded-[12px] px-2.5 py-2 text-left transition-colors disabled:cursor-wait disabled:opacity-70 ${active ? 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-100' : 'text-stone-600 hover:bg-stone-50 dark:text-stone-300 dark:hover:bg-white/6'}`}
                  >
                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${active ? 'border-amber-400 bg-amber-400 text-white' : 'border-stone-200 text-transparent dark:border-white/15'}`}>
                      <Check className="h-2.5 w-2.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[10px] font-black">{option.label}</span>
                      <span className="mt-0.5 block text-[8px] leading-3.5 opacity-70">{option.description}</span>
                    </span>
                  </button>
                );
              })}
              {settings.provider === 'codex' && (
                <>
                  <div className="mx-2 my-1 border-t border-stone-100 dark:border-white/8" />
                  <div className="px-2 pb-1 pt-1 text-[9px] font-semibold text-stone-400 dark:text-stone-500">Codex 权限</div>
                  {CODEX_SANDBOX_OPTIONS.map(option => {
                    const active = option.value === settings.codexSandbox;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => void updateCodexSandbox(option.value)}
                        disabled={savingAccess}
                        className={`flex w-full items-start gap-2 rounded-[12px] px-2.5 py-2 text-left transition-colors disabled:cursor-wait disabled:opacity-70 ${active ? 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-100' : 'text-stone-600 hover:bg-stone-50 dark:text-stone-300 dark:hover:bg-white/6'}`}
                      >
                        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${active ? 'border-amber-400 bg-amber-400 text-white' : 'border-stone-200 text-transparent dark:border-white/15'}`}>
                          <Check className="h-2.5 w-2.5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[10px] font-black">{option.label}</span>
                          <span className="mt-0.5 block text-[8px] leading-3.5 opacity-70">{option.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          )}
          {showModelMenu && settings.provider === 'codex' && (
            <div data-agent-model-menu="true" className="absolute bottom-12 right-2 z-50 w-[268px] overflow-hidden rounded-[18px] border border-blue-100/90 bg-white/98 p-1.5 shadow-[0_20px_56px_rgba(30,64,104,0.22)] backdrop-blur-2xl dark:border-white/10 dark:bg-stone-900/98">
              <div className="flex items-center justify-between px-2 pb-1 pt-1">
                <span className="text-[9px] font-semibold text-stone-400 dark:text-stone-500">推理</span>
                {savingModel && <LoaderCircle className="h-3 w-3 animate-spin text-blue-500" />}
              </div>
              <div className="grid grid-cols-4 gap-1 px-1 pb-1.5">
                {reasoningOptions.map(option => {
                  const active = option.reasoningEffort === selectedReasoningEffort;
                  return (
                    <button
                      key={option.reasoningEffort}
                      type="button"
                      onClick={() => void updateCodexReasoningEffort(option.reasoningEffort)}
                      disabled={savingModel || busy}
                      title={option.description || `推理强度：${CODEX_REASONING_LABELS[option.reasoningEffort]}`}
                      className={`flex h-8 items-center justify-center rounded-[10px] text-[10px] font-semibold transition-colors disabled:cursor-wait disabled:opacity-55 ${active ? 'bg-blue-500 text-white shadow-sm' : 'text-stone-600 hover:bg-blue-50 hover:text-blue-700 dark:text-stone-300 dark:hover:bg-white/7 dark:hover:text-blue-200'}`}
                    >
                      {CODEX_REASONING_LABELS[option.reasoningEffort]}
                    </button>
                  );
                })}
              </div>

              <div className="border-t border-stone-100 px-1 pt-1.5 dark:border-white/8">
                <div className="flex items-center justify-between px-1 pb-1">
                  <span className="text-[9px] font-semibold text-stone-400 dark:text-stone-500">模型</span>
                  <button
                    type="button"
                    onClick={() => void onRefreshCodexModels().catch(() => {})}
                    disabled={codexModelsLoading}
                    className="flex h-6 w-6 items-center justify-center rounded-[8px] text-stone-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-45 dark:hover:bg-white/7 dark:hover:text-blue-300"
                    title="刷新可用模型"
                  >
                    <RefreshCw className={`h-3 w-3 ${codexModelsLoading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="max-h-[190px] space-y-0.5 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
                  {codexModels.map(model => {
                    const active = selectedCodexModel?.model === model.model;
                    return (
                      <button
                        key={model.id || model.model}
                        type="button"
                        onClick={() => void updateCodexModel(model)}
                        disabled={savingModel || busy}
                        className={`flex w-full items-center gap-2 rounded-[11px] px-2 py-1.5 text-left transition-colors disabled:cursor-wait disabled:opacity-55 ${active ? 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200' : 'text-stone-600 hover:bg-stone-50 dark:text-stone-300 dark:hover:bg-white/6'}`}
                        title={model.description || model.model}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[10px] font-semibold">{model.displayName}</span>
                          <span className="mt-0.5 block truncate text-[8px] font-normal opacity-55">{model.model}</span>
                        </span>
                        {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                      </button>
                    );
                  })}
                  {codexModelsLoading && codexModels.length === 0 && (
                    <div className="flex items-center justify-center gap-1.5 px-2 py-4 text-[9px] text-stone-400">
                      <LoaderCircle className="h-3 w-3 animate-spin" /> 正在读取账户可用模型…
                    </div>
                  )}
                  {!codexModelsLoading && codexModels.length === 0 && (
                    <div className="px-2 py-3 text-[9px] leading-4 text-stone-400 dark:text-stone-500">
                      {codexModelsError || '暂无可用模型，请刷新后重试。'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {showPlanningMenu && (
            <div data-agent-planning-menu="true" className="absolute bottom-12 right-12 z-50 w-[220px] overflow-hidden rounded-[16px] border border-blue-100/90 bg-white/98 p-1.5 shadow-[0_18px_50px_rgba(30,64,104,0.20)] backdrop-blur-2xl dark:border-white/10 dark:bg-stone-900/98">
              <div className="px-2 pb-1 pt-1 text-[9px] font-semibold text-stone-400 dark:text-stone-500">本次规划方式</div>
              {WORKFLOW_PLANNING_MODE_OPTIONS.map(option => {
                const active = option.value === workflowPlanningMode;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setWorkflowPlanningMode(option.value);
                      setShowPlanningMenu(false);
                    }}
                    disabled={busy}
                    className={`flex w-full items-start gap-2 rounded-[12px] px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${active ? 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200' : 'text-stone-600 hover:bg-stone-50 dark:text-stone-300 dark:hover:bg-white/6'}`}
                  >
                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${active ? 'border-blue-500 bg-blue-500 text-white' : 'border-stone-200 text-transparent dark:border-white/15'}`}>
                      <Check className="h-2.5 w-2.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1 text-[10px] font-black">
                        {option.value === 'quick' ? <Zap className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-[8px] leading-3.5 opacity-70">{option.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <textarea data-agent-composer-input="true" ref={inputRef} value={inputValue} onChange={event => onInputChange(event.target.value)} onKeyDown={handleKeyDown} onKeyUp={event => event.stopPropagation()} placeholder="告诉 Codex 如何处理画布…" rows={3} className="max-h-32 min-h-[58px] w-full resize-none bg-transparent px-2 py-1.5 text-[11px] leading-[18px] text-stone-700 outline-none placeholder:text-stone-400 dark:text-stone-100 dark:placeholder:text-stone-600" />
          <div className="flex items-center justify-between gap-1.5 px-0.5 pb-0.5">
            <div className="flex min-w-0 items-center gap-1">
              <button type="button" onClick={() => inputRef.current?.focus()} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-white/7 dark:hover:text-blue-300" title="当前选中的画布节点会自动作为上下文"><Plus className="h-3.5 w-3.5" /></button>
              <button
                type="button"
                data-agent-access-toggle="true"
                onClick={() => {
                  setShowAccessMenu(value => !value);
                  setShowHistory(false);
                  setShowUsage(false);
                  setShowModelMenu(false);
                  setShowPlanningMenu(false);
                }}
                disabled={savingAccess || busy}
                className={`flex h-7 max-w-[88px] items-center gap-0.5 rounded-[9px] px-1 text-[8px] font-medium transition-colors disabled:cursor-wait disabled:opacity-70 ${showAccessMenu ? 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-100' : 'text-stone-500 hover:bg-amber-50 hover:text-amber-700 dark:text-stone-400 dark:hover:bg-white/7 dark:hover:text-amber-100'}`}
                title="切换 API / ChatGPT 登录模式"
              >
                <ShieldCheck className="h-3 w-3 shrink-0 text-amber-500" />
                <span className="truncate">{settings.provider === 'codex' ? accessLabel : 'API 模式'}</span>
                {savingAccess ? <LoaderCircle className="h-2.5 w-2.5 shrink-0 animate-spin opacity-70" /> : <ChevronDown className={`h-2.5 w-2.5 shrink-0 opacity-45 transition-transform ${showAccessMenu ? 'rotate-180' : ''}`} />}
              </button>
            </div>

            <div className="flex min-w-0 shrink-0 items-center justify-end gap-1">
              {settings.provider === 'codex' && (
                <button type="button" data-codex-usage-toggle="true" onClick={() => { setShowUsage(value => !value); setShowHistory(false); setShowAccessMenu(false); setShowModelMenu(false); setShowPlanningMenu(false); }} className={`flex h-7 items-center gap-1 rounded-[9px] px-1 text-[8px] font-medium transition-colors ${showUsage ? 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200' : 'text-stone-500 hover:bg-blue-50 hover:text-blue-700 dark:text-stone-400 dark:hover:bg-white/7 dark:hover:text-blue-200'}`} title="查看 Codex 剩余用量">
                  <span className="relative flex h-3.5 w-3.5 items-center justify-center rounded-full" style={{ background: `conic-gradient(rgb(59 130 246) ${Math.max(0, primaryRemaining || 0)}%, rgba(148,163,184,.22) 0)` }}><span className="h-2 w-2 rounded-full bg-white dark:bg-stone-900" /></span>
                  <span>{primaryRemaining == null ? '用量' : `${primaryRemaining}%`}</span>
                </button>
              )}
              {settings.provider === 'codex' ? (
                <button
                  type="button"
                  data-agent-model-toggle="true"
                  onClick={() => {
                    setShowModelMenu(value => !value);
                    setShowHistory(false);
                    setShowUsage(false);
                    setShowAccessMenu(false);
                    setShowPlanningMenu(false);
                    if (codexModels.length === 0 && !codexModelsLoading) {
                      void onRefreshCodexModels().catch(() => {});
                    }
                  }}
                  disabled={savingModel || busy || !providerReady}
                  className={`flex h-7 max-w-[104px] items-center gap-0.5 rounded-[9px] px-1 text-[8px] font-medium transition-colors disabled:opacity-45 ${showModelMenu ? 'bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200' : 'text-stone-500 hover:bg-blue-50 hover:text-blue-700 dark:text-stone-400 dark:hover:bg-white/7 dark:hover:text-blue-200'}`}
                  title={`模型：${modelLabel}；推理：${CODEX_REASONING_LABELS[selectedReasoningEffort]}`}
                >
                  {savingModel ? <LoaderCircle className="h-3 w-3 shrink-0 animate-spin" /> : <Gauge className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{modelControlLabel}</span>
                  <ChevronDown className={`h-2.5 w-2.5 shrink-0 opacity-45 transition-transform ${showModelMenu ? 'rotate-180' : ''}`} />
                </button>
              ) : (
                <div className="flex h-7 max-w-[74px] items-center gap-0.5 rounded-[9px] px-1 text-[8px] font-medium text-stone-500 dark:text-stone-400" title={modelLabel}><Gauge className="h-3 w-3 shrink-0" /><span className="truncate">{modelLabel}</span></div>
              )}
              <button
                type="button"
                data-agent-planning-toggle="true"
                onClick={() => {
                  setShowPlanningMenu(value => !value);
                  setShowHistory(false);
                  setShowUsage(false);
                  setShowAccessMenu(false);
                  setShowModelMenu(false);
                }}
                disabled={busy}
                className={`flex h-7 max-w-[82px] items-center gap-0.5 rounded-[9px] px-1 text-[8px] font-semibold transition-colors disabled:cursor-wait disabled:opacity-45 ${workflowPlanningMode === 'quick' ? 'border border-amber-200/80 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100 dark:hover:bg-amber-400/15' : 'text-stone-500 hover:bg-blue-50 hover:text-blue-700 dark:text-stone-400 dark:hover:bg-white/7 dark:hover:text-blue-200'}`}
                title={workflowPlanningMode === 'quick' ? '不调用大模型，使用本地规则快速生成可编辑工作流草案' : '使用当前 Agent API 深度分析并设计工作流'}
              >
                {workflowPlanningMode === 'quick' ? <Zap className="h-3 w-3 shrink-0" /> : <Bot className="h-3 w-3 shrink-0" />}
                <span className="truncate">{selectedWorkflowPlanningOption.label}</span>
                <ChevronDown className={`h-2.5 w-2.5 shrink-0 opacity-45 transition-transform ${showPlanningMenu ? 'rotate-180' : ''}`} />
              </button>
              {busy ? (
                <button type="button" onClick={onCancel} className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-800 text-white shadow-sm transition-transform hover:scale-105 dark:bg-stone-100 dark:text-stone-900" title="停止"><Square className="h-2.5 w-2.5 fill-current" /></button>
              ) : (
                <button type="button" onClick={sendCurrentMessage} disabled={!inputValue.trim()} className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-800 text-white shadow-sm transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-30 dark:bg-stone-100 dark:text-stone-900" title={workflowPlanningMode === 'quick' ? '使用快速规划发送' : '使用 AI 规划发送'}><ArrowUp className="h-3.5 w-3.5" /></button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between px-1 text-[8px] text-stone-400 dark:text-stone-600">
          <span className="flex items-center gap-1"><Monitor className="h-3 w-3" /> 本地模式 · 全局上下文</span>
          <button type="button" onClick={onRetry} disabled={busy || !messages.some(message => message.role === 'user')} className="flex items-center gap-1 rounded-[8px] px-1.5 py-1 transition-colors hover:bg-white/70 hover:text-stone-600 disabled:opacity-30 dark:hover:bg-white/6 dark:hover:text-stone-300"><RotateCcw className="h-3 w-3" /> 重试</button>
        </div>
      </footer>
    </aside>
  );
}
