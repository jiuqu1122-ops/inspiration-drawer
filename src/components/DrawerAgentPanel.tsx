import {
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  Copy,
  Clock3,
  History,
  LoaderCircle,
  MessageSquarePlus,
  Square,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  AgentCanvasSelectionItem,
  AgentChatMessage,
  AgentConversation,
  AgentSendOptions,
  AgentSettings,
  CodexRuntimeStatus,
} from '../features/agentModel';
import { getCanvasAgentToolLabel } from '../features/canvasAgentTools';

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

type DrawerAgentPanelProps = {
  messages: AgentChatMessage[];
  inputValue: string;
  busy: boolean;
  settings: AgentSettings;
  codexStatus: CodexRuntimeStatus | null;
  conversations: AgentConversation[];
  activeConversationId: string;
  selectedItems: AgentCanvasSelectionItem[];
  onInputChange: (value: string) => void;
  onSendMessage: (content: string, options?: AgentSendOptions) => void;
  onCancel: () => void;
  onClose: () => void;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onClearConversation: () => void;
  onResolveToolCall: (id: string, approved: boolean) => void;
};

export function DrawerAgentPanel({
  messages,
  inputValue,
  busy,
  settings,
  codexStatus,
  conversations,
  activeConversationId,
  selectedItems,
  onInputChange,
  onSendMessage,
  onCancel,
  onClose,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
  onClearConversation,
  onResolveToolCall,
}: DrawerAgentPanelProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showPlanningMenu, setShowPlanningMenu] = useState(false);
  const [workflowPlanningMode, setWorkflowPlanningMode] = useState<WorkflowPlanningMode>('ai');
  const ready = settings.provider === 'codex' ? !!codexStatus?.authenticated : settings.hasApiKey;
  const activeConversation = conversations.find(conversation => conversation.id === activeConversationId);
  const selectedWorkflowPlanningOption = WORKFLOW_PLANNING_MODE_OPTIONS.find(option => option.value === workflowPlanningMode)
    || WORKFLOW_PLANNING_MODE_OPTIONS[0];

  useEffect(() => {
    window.setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!showHistory && !showPlanningMenu) return;
    const closeHistory = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (showHistory && !target?.closest('[data-drawer-agent-history-menu="true"], [data-drawer-agent-history-toggle="true"]')) {
        setShowHistory(false);
      }
      if (showPlanningMenu && !target?.closest('[data-drawer-agent-planning-menu="true"], [data-drawer-agent-planning-toggle="true"]')) {
        setShowPlanningMenu(false);
      }
    };
    document.addEventListener('pointerdown', closeHistory, true);
    return () => document.removeEventListener('pointerdown', closeHistory, true);
  }, [showHistory, showPlanningMenu]);

  const send = () => {
    const content = inputValue.trim();
    if (!content || busy) return;
    onSendMessage(content, workflowPlanningMode === 'quick' ? { quickPlanRequested: true } : undefined);
    setShowPlanningMenu(false);
    if (workflowPlanningMode === 'quick') setWorkflowPlanningMode('ai');
  };

  const stopAgentKeyboardEvent = (event: React.KeyboardEvent) => {
    event.stopPropagation();
  };

  const copyMessage = async (message: AgentChatMessage) => {
    const text = [message.content, message.error].filter(Boolean).join('\n\n').trim();
    if (!text) return;
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(message.id);
    window.setTimeout(() => setCopiedId(current => current === message.id ? '' : current), 1000);
  };

  return (
    <div
      data-drawer-agent-panel="true"
      className="absolute bottom-[84px] left-6 right-6 z-[125] flex h-[min(500px,70vh)] flex-col overflow-hidden rounded-[26px] border border-blue-100/80 bg-white/92 shadow-[0_26px_70px_rgba(24,58,104,0.24)] backdrop-blur-2xl dark:border-white/10 dark:bg-stone-900/94 sm:left-auto sm:w-[390px]"
      onMouseDown={event => event.stopPropagation()}
      onPointerDown={event => event.stopPropagation()}
      onKeyDown={stopAgentKeyboardEvent}
      onKeyUp={stopAgentKeyboardEvent}
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-blue-100/70 px-3 dark:border-white/8">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] bg-blue-500 text-white shadow-[0_6px_16px_rgba(59,130,246,0.25)]">
            <Bot className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[12px] font-bold text-stone-800 dark:text-stone-100">
              <span className="max-w-[180px] truncate">{activeConversation?.title || '软件 Agent'}</span>
              {busy && <LoaderCircle className="h-3 w-3 animate-spin text-blue-500" />}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[8px] text-stone-400 dark:text-stone-500">
              <span className={`h-1.5 w-1.5 rounded-full ${ready ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {settings.provider === 'codex' ? 'ChatGPT · 可控制抽屉与画布' : 'API App Server · 可控制抽屉与画布'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" data-drawer-agent-history-toggle="true" onClick={() => setShowHistory(value => !value)} className={`flex h-8 w-8 items-center justify-center rounded-[10px] transition-colors ${showHistory ? 'bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-200' : 'text-stone-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-white/7 dark:hover:text-blue-300'}`} title="会话历史"><History className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={onNewConversation} className="flex h-8 w-8 items-center justify-center rounded-[10px] text-stone-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-white/7 dark:hover:text-blue-300" title="新对话"><MessageSquarePlus className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={onClearConversation} className="flex h-8 w-8 items-center justify-center rounded-[10px] text-stone-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-white/7" title="清空对话"><Trash2 className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-[10px] text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-white/7 dark:hover:text-stone-200" title="收起 Agent"><X className="h-4 w-4" /></button>
        </div>
        {showHistory && (
          <div data-drawer-agent-history-menu="true" className="absolute left-3 right-3 top-[50px] z-20 max-h-[280px] overflow-y-auto rounded-[16px] border border-blue-100/90 bg-white/96 p-1.5 shadow-[0_18px_48px_rgba(30,64,104,0.18)] backdrop-blur-2xl dark:border-white/10 dark:bg-stone-900/96">
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

      <main className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 [scrollbar-width:thin]">
        {messages.length === 0 && (
          <div className="rounded-[18px] border border-dashed border-blue-200/80 bg-blue-50/55 px-3 py-3 text-[10px] leading-5 text-stone-500 dark:border-blue-400/20 dark:bg-blue-400/8 dark:text-stone-400">
            可以直接说“新建一个产品项目文件夹”“把选中的图片加到画布并创建生图节点”“搜索所有方向盘素材”。Agent 会实际操作软件。
          </div>
        )}
        {messages.map(message => (
          <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : ''}>
            <div className={message.role === 'user'
              ? 'max-w-[88%] rounded-[18px_18px_6px_18px] bg-blue-500 px-3 py-2 text-[11px] leading-5 text-white shadow-sm'
              : 'group/message text-[11px] leading-5 text-stone-700 dark:text-stone-200'}>
              {message.content && <div className="whitespace-pre-wrap select-text">{message.content}</div>}
              {message.selectionSnapshot && message.selectionSnapshot.length > 0 && (
                <div className={['mt-1.5 flex flex-wrap gap-1', message.role === 'user' ? 'justify-end' : ''].filter(Boolean).join(' ')}>
                  {message.selectionSnapshot.slice(0, 4).map(item => (
                    <span
                      key={item.id}
                      className={message.role === 'user'
                        ? 'max-w-[120px] truncate rounded-full bg-white/18 px-1.5 py-0.5 text-[8px] text-white/80'
                        : 'max-w-[140px] truncate rounded-full bg-blue-50 px-1.5 py-0.5 text-[8px] text-blue-600 dark:bg-blue-400/10 dark:text-blue-200'}
                    >
                      发送时选中：{item.name}
                    </span>
                  ))}
                  {message.selectionSnapshot.length > 4 && (
                    <span className={message.role === 'user'
                      ? 'rounded-full bg-white/18 px-1.5 py-0.5 text-[8px] text-white/80'
                      : 'rounded-full bg-stone-100 px-1.5 py-0.5 text-[8px] text-stone-500 dark:bg-white/7 dark:text-stone-400'}>
                      +{message.selectionSnapshot.length - 4}
                    </span>
                  )}
                </div>
              )}
              {message.error && <div className="mt-1 rounded-[12px] bg-red-50 px-2 py-1.5 text-[9px] text-red-600 dark:bg-red-400/10 dark:text-red-200">{message.error}</div>}
              {message.role !== 'user' && message.workflowPlanningFailure && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSendMessage(message.workflowPlanningFailure?.userText || '', { forceWorkflowPlanningRoute: 'remote_ai' })}
                    disabled={busy}
                    className="rounded-[9px] bg-blue-500 px-2.5 py-1 text-[8px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    重试 AI 规划
                  </button>
                  <button
                    type="button"
                    onClick={() => onSendMessage(message.workflowPlanningFailure?.userText || '', { quickPlanRequested: true })}
                    disabled={busy}
                    className="flex items-center gap-1 rounded-[9px] bg-amber-50 px-2.5 py-1 text-[8px] font-bold text-amber-700 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-amber-400/10 dark:text-amber-100"
                  >
                    <Zap className="h-3 w-3" /> 使用快速规划
                  </button>
                </div>
              )}
              {(message.toolCalls || []).map(call => (
                <div key={call.id} className="mt-2 rounded-[14px] border border-blue-100/80 bg-white/75 px-2.5 py-2 text-stone-600 shadow-sm dark:border-white/9 dark:bg-white/5 dark:text-stone-300">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[9px] font-bold">{getCanvasAgentToolLabel(call.name)}</span>
                    <span className={`text-[8px] ${call.status === 'error' || call.status === 'declined' ? 'text-red-500' : call.status === 'completed' ? 'text-emerald-500' : 'text-amber-500'}`}>
                      {call.status === 'completed' ? '已完成' : call.status === 'awaiting-approval' ? '等待确认' : call.status === 'running' ? '执行中' : call.status === 'declined' ? '已拒绝' : call.status === 'error' ? '失败' : '准备中'}
                    </span>
                  </div>
                  {call.error && <div className="mt-1 text-[8px] text-red-500">{call.error}</div>}
                  {call.status === 'awaiting-approval' && (
                    <div className="mt-2 flex gap-1.5">
                      <button type="button" onClick={() => onResolveToolCall(call.id, true)} className="rounded-[9px] bg-blue-500 px-2.5 py-1 text-[8px] font-bold text-white">允许</button>
                      <button type="button" onClick={() => onResolveToolCall(call.id, false)} className="rounded-[9px] bg-stone-100 px-2.5 py-1 text-[8px] font-bold text-stone-600 dark:bg-white/8 dark:text-stone-300">拒绝</button>
                    </div>
                  )}
                </div>
              ))}
              {message.role !== 'user' && (message.content || message.error) && (
                <button type="button" onClick={() => void copyMessage(message)} className="mt-1 flex items-center gap-1 text-[8px] text-stone-400 opacity-0 transition-opacity group-hover/message:opacity-100 hover:text-blue-500">
                  {copiedId === message.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copiedId === message.id ? '已复制' : '复制'}
                </button>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </main>

      <footer className="shrink-0 px-3 pb-3">
        {selectedItems.length > 0 && (
          <div className="mb-1.5 flex max-h-12 flex-wrap gap-1 overflow-y-auto px-1 [scrollbar-width:none]">
            {selectedItems.slice(0, 4).map(item => (
              <span key={item.id} className="flex h-6 max-w-[132px] items-center gap-1 rounded-[9px] bg-blue-50 px-2 text-[8px] font-medium text-blue-700 dark:bg-blue-400/10 dark:text-blue-200">
                <span className="truncate">{item.name}</span>
              </span>
            ))}
            {selectedItems.length > 4 && <span className="flex h-6 items-center rounded-[9px] bg-stone-100 px-2 text-[8px] text-stone-500 dark:bg-white/7 dark:text-stone-400">+{selectedItems.length - 4}</span>}
          </div>
        )}
        <div className="relative rounded-[20px] border border-blue-100/90 bg-white/92 p-2 shadow-[0_10px_28px_rgba(49,82,120,0.10)] focus-within:border-blue-300 dark:border-white/10 dark:bg-white/8">
          {showPlanningMenu && (
            <div data-drawer-agent-planning-menu="true" className="absolute bottom-12 right-11 z-30 w-[210px] overflow-hidden rounded-[16px] border border-blue-100/90 bg-white/98 p-1.5 shadow-[0_18px_48px_rgba(30,64,104,0.18)] backdrop-blur-2xl dark:border-white/10 dark:bg-stone-900/98">
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
          <textarea
            data-agent-composer-input="true"
            ref={inputRef}
            value={inputValue}
            onChange={event => onInputChange(event.target.value)}
            onKeyDown={event => {
              event.stopPropagation();
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="让 Agent 操作抽屉或画布…"
            className="max-h-24 min-h-12 w-full resize-none bg-transparent px-1.5 py-1 text-[11px] leading-5 text-stone-700 outline-none placeholder:text-stone-400 dark:text-stone-100 dark:placeholder:text-stone-500"
          />
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="min-w-0 flex-1 truncate text-[8px] text-stone-400">{ready ? '高风险操作会请求确认' : '未配置 API 时，工作流使用快速规划'}</span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                data-drawer-agent-planning-toggle="true"
                onClick={() => {
                  setShowPlanningMenu(value => !value);
                  setShowHistory(false);
                }}
                disabled={busy}
                className={`flex h-8 max-w-[86px] items-center gap-0.5 rounded-[9px] px-1.5 text-[8px] font-bold shadow-sm disabled:cursor-wait disabled:opacity-45 ${workflowPlanningMode === 'quick' ? 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-100' : 'text-stone-500 hover:bg-blue-50 hover:text-blue-700 dark:text-stone-400 dark:hover:bg-white/7 dark:hover:text-blue-200'}`}
                title={workflowPlanningMode === 'quick' ? '不调用大模型，使用本地规则快速生成可编辑工作流草案' : '使用当前 Agent API 深度分析并设计工作流'}
              >
                {workflowPlanningMode === 'quick' ? <Zap className="h-3 w-3 shrink-0" /> : <Bot className="h-3 w-3 shrink-0" />}
                <span className="truncate">{selectedWorkflowPlanningOption.label}</span>
                <ChevronDown className={`h-2.5 w-2.5 shrink-0 opacity-50 transition-transform ${showPlanningMenu ? 'rotate-180' : ''}`} />
              </button>
              {busy ? (
                <button type="button" onClick={onCancel} className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900" title="停止"><Square className="h-3 w-3 fill-current" /></button>
              ) : (
                <button type="button" onClick={send} disabled={!inputValue.trim()} className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-30" title={workflowPlanningMode === 'quick' ? '使用快速规划发送' : '使用 AI 规划发送'}><ArrowUp className="h-4 w-4" /></button>
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
