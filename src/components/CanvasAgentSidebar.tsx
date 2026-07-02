import {
  Bot,
  Check,
  ChevronLeft,
  Clock3,
  History,
  LoaderCircle,
  MessageSquarePlus,
  RotateCcw,
  Send,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  AgentChatMessage,
  AgentCodexApproval,
  AgentConversation,
  AgentSettings,
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
  conversations: AgentConversation[];
  activeConversationId: string;
  codexApprovals: AgentCodexApproval[];
  onWidthChange: (width: number) => void;
  onClose: () => void;
  onInputChange: (value: string) => void;
  onSendMessage: (content: string) => void;
  onCancel: () => void;
  onRetry: () => void;
  onResolveToolCall: (id: string, approved: boolean) => void;
  onResolveCodexApproval: (approval: AgentCodexApproval, approved: boolean) => void;
  onNewConversation: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onClearConversation: () => void;
};

export function CanvasAgentSidebar({
  width,
  messages,
  inputValue,
  busy,
  settings,
  codexStatus,
  conversations,
  activeConversationId,
  codexApprovals,
  onWidthChange,
  onClose,
  onInputChange,
  onSendMessage,
  onCancel,
  onRetry,
  onResolveToolCall,
  onResolveCodexApproval,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
  onClearConversation,
}: CanvasAgentSidebarProps) {
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, codexApprovals]);

  useEffect(() => {
    window.setTimeout(() => inputRef.current?.focus(), 120);
  }, []);

  const startResize = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = width;
    const move = (moveEvent: PointerEvent) => {
      onWidthChange(Math.min(520, Math.max(300, startWidth + startX - moveEvent.clientX)));
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

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (inputValue.trim() && !busy) onSendMessage(inputValue.trim());
  };

  const providerReady = settings.provider === 'codex'
    ? !!codexStatus?.authenticated
    : settings.hasApiKey;

  return (
    <aside
      data-no-drag="true"
      data-canvas-agent-sidebar="true"
      className="relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-l border-stone-200/70 bg-white/92 text-stone-800 shadow-[-12px_0_34px_rgba(15,23,42,0.08)] backdrop-blur-2xl dark:border-stone-700/70 dark:bg-stone-950/92 dark:text-stone-100"
      style={{ width }}
      onPointerDown={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
      onWheel={event => event.stopPropagation()}
    >
      <div
        className="absolute inset-y-0 left-0 z-20 w-1.5 cursor-col-resize transition-colors hover:bg-blue-400/35"
        onPointerDown={startResize}
        title="拖动调整侧边栏宽度"
      />
      <header className="relative flex items-center justify-between gap-2 border-b border-stone-200/70 px-3 py-2.5 dark:border-stone-700/70">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] bg-blue-500 text-white shadow-sm">
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-black">画布 Agent</div>
            <div className="mt-0.5 flex items-center gap-1 text-[9px] font-bold text-stone-400 dark:text-stone-500">
              <span className={`h-1.5 w-1.5 rounded-full ${providerReady ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {settings.provider === 'codex' ? 'Codex' : settings.apiModel || 'OpenAI-compatible'}
              {!providerReady && ' · 待配置'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setShowHistory(value => !value)}
            className={`flex h-7 w-7 items-center justify-center rounded-[9px] transition-colors ${showHistory ? 'bg-blue-50 text-blue-600 dark:bg-blue-400/12 dark:text-blue-200' : 'text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-200'}`}
            title="会话历史"
          >
            <History className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onNewConversation}
            className="flex h-7 w-7 items-center justify-center rounded-[9px] text-stone-400 transition-colors hover:bg-stone-100 hover:text-blue-600 dark:hover:bg-stone-800 dark:hover:text-blue-200"
            title="新对话"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClearConversation}
            className="flex h-7 w-7 items-center justify-center rounded-[9px] text-stone-400 transition-colors hover:bg-stone-100 hover:text-red-500 dark:hover:bg-stone-800"
            title="清空当前对话"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-[9px] text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-200"
            title="收起 Agent"
          >
            <ChevronLeft className="h-4 w-4 rotate-180" />
          </button>
        </div>

        {showHistory && (
          <div className="absolute left-2 right-2 top-[52px] z-30 max-h-[280px] overflow-y-auto rounded-[16px] border border-stone-200 bg-white p-1.5 shadow-xl dark:border-stone-700 dark:bg-stone-900">
            {conversations.map(conversation => (
              <div
                key={conversation.id}
                className={`group/history flex items-center gap-1 rounded-[11px] ${conversation.id === activeConversationId ? 'bg-blue-50 dark:bg-blue-400/10' : 'hover:bg-stone-50 dark:hover:bg-stone-800'}`}
              >
                <button
                  type="button"
                  onClick={() => { onSelectConversation(conversation.id); setShowHistory(false); }}
                  className="min-w-0 flex-1 px-2 py-2 text-left"
                >
                  <div className="truncate text-[10px] font-bold text-stone-700 dark:text-stone-200">{conversation.title}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-[8px] text-stone-400">
                    <Clock3 className="h-2.5 w-2.5" />
                    {new Date(conversation.updatedAt).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    <span>· {conversation.provider === 'codex' ? 'Codex' : 'API'}</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteConversation(conversation.id)}
                  className="mr-1 flex h-6 w-6 items-center justify-center rounded-[8px] text-stone-300 opacity-0 hover:bg-red-50 hover:text-red-500 group-hover/history:opacity-100 dark:hover:bg-red-400/10"
                  title="删除会话"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 [scrollbar-width:thin]">
        {messages.length === 0 && codexApprovals.length === 0 ? (
          <div className="flex min-h-full flex-col items-center justify-center px-4 py-10 text-center text-stone-400 dark:text-stone-500">
            <Bot className="mb-3 h-10 w-10 opacity-35" />
            <p className="text-xs font-black text-stone-500 dark:text-stone-400">直接告诉我你想做什么</p>
            <div className="mt-3 grid w-full gap-1.5 text-left text-[10px] leading-4">
              {[
                '把选中的产品图做成一套详情页',
                '用已有工作流生成多角度设计图',
                '整理画布并把上游图片接到生图节点',
              ].map(example => (
                <button
                  type="button"
                  key={example}
                  onClick={() => onInputChange(example)}
                  className="rounded-[13px] border border-stone-200/80 bg-white/70 px-3 py-2 font-bold text-stone-500 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-stone-700 dark:bg-stone-900/45 dark:text-stone-400 dark:hover:border-blue-400/25 dark:hover:bg-blue-400/10 dark:hover:text-blue-200"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map(message => {
              const isUser = message.role === 'user';
              return (
                <div key={message.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[92%] ${isUser ? 'rounded-[17px_17px_5px_17px] bg-blue-500 px-3 py-2 text-white' : 'w-full'}`}>
                    {!isUser && (
                      <div className="mb-1 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide text-stone-400 dark:text-stone-500">
                        <Bot className="h-3 w-3 text-blue-500" /> Agent
                        {message.status === 'streaming' && <LoaderCircle className="h-3 w-3 animate-spin text-blue-500" />}
                      </div>
                    )}
                    <p className={`whitespace-pre-wrap text-xs leading-[1.65] ${!isUser ? 'text-stone-700 dark:text-stone-200' : ''}`}>
                      {message.content || (message.status === 'streaming' ? '正在思考…' : '')}
                    </p>
                    {message.toolCalls && message.toolCalls.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {message.toolCalls.map(call => (
                          <div key={call.id} className="rounded-[13px] border border-stone-200 bg-stone-50/85 p-2 dark:border-stone-700 dark:bg-stone-900/55">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-[10px] font-black text-stone-700 dark:text-stone-200">
                                {getCanvasAgentToolLabel(call.name)}
                              </span>
                              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold ${
                                call.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200'
                                  : call.status === 'error' || call.status === 'declined' ? 'bg-red-100 text-red-600 dark:bg-red-400/15 dark:text-red-200'
                                    : 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200'
                              }`}>
                                {call.status === 'completed' ? '已完成' : call.status === 'error' ? '失败' : call.status === 'declined' ? '已拒绝' : call.status === 'running' ? '执行中' : '等待确认'}
                              </span>
                            </div>
                            <div className="mt-1 max-h-16 overflow-hidden break-all font-mono text-[8px] leading-3 text-stone-400 dark:text-stone-500">
                              {JSON.stringify(call.arguments)}
                            </div>
                            {call.error && <div className="mt-1 text-[9px] text-red-500">{call.error}</div>}
                            {call.status === 'awaiting-approval' && (
                              <div className="mt-2 flex gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => onResolveToolCall(call.id, true)}
                                  className="flex items-center gap-1 rounded-[10px] bg-blue-500 px-2.5 py-1 text-[9px] font-bold text-white"
                                >
                                  <Check className="h-3 w-3" /> 执行
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onResolveToolCall(call.id, false)}
                                  className="rounded-[10px] bg-stone-200 px-2.5 py-1 text-[9px] font-bold text-stone-600 dark:bg-stone-700 dark:text-stone-300"
                                >
                                  拒绝
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {message.error && (
                      <div className="mt-2 rounded-[11px] bg-red-50 px-2 py-1.5 text-[9px] leading-4 text-red-600 dark:bg-red-400/10 dark:text-red-200">
                        {message.error}
                      </div>
                    )}
                    <div className={`mt-1 text-[8px] ${isUser ? 'text-right text-white/60' : 'text-stone-300 dark:text-stone-600'}`}>
                      {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              );
            })}

            {codexApprovals.map(approval => (
              <div key={String(approval.id)} className="rounded-[15px] border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-400/20 dark:bg-amber-400/10">
                <div className="text-[10px] font-black text-amber-800 dark:text-amber-100">{approval.title}</div>
                <div className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[9px] leading-4 text-amber-700/80 dark:text-amber-100/70">{approval.detail}</div>
                <div className="mt-2 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => onResolveCodexApproval(approval, true)}
                    className="rounded-[10px] bg-amber-500 px-2.5 py-1 text-[9px] font-bold text-white"
                  >
                    允许
                  </button>
                  <button
                    type="button"
                    onClick={() => onResolveCodexApproval(approval, false)}
                    className="rounded-[10px] bg-white/80 px-2.5 py-1 text-[9px] font-bold text-amber-700 dark:bg-stone-900/45 dark:text-amber-100"
                  >
                    拒绝
                  </button>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <footer className="border-t border-stone-200/70 p-3 dark:border-stone-700/70">
        {!providerReady && (
          <div className="mb-2 rounded-[11px] bg-amber-50 px-2 py-1.5 text-[9px] leading-4 text-amber-700 dark:bg-amber-400/10 dark:text-amber-100">
            请先在设置 → AGENT 设置中完成{settings.provider === 'codex' ? ' Codex 登录' : ' API 配置'}。
          </div>
        )}
        <div className="rounded-[17px] border border-stone-200 bg-stone-50/85 p-1.5 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100 dark:border-stone-700 dark:bg-stone-900/62 dark:focus-within:border-blue-400/35 dark:focus-within:ring-blue-400/10">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={event => onInputChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="告诉 Agent 如何处理画布…"
            rows={3}
            className="max-h-32 min-h-[58px] w-full resize-none bg-transparent px-2 py-1.5 text-xs leading-5 text-stone-700 outline-none placeholder:text-stone-400 dark:text-stone-100 dark:placeholder:text-stone-600"
          />
          <div className="flex items-center justify-between gap-2 px-1 pb-0.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onRetry}
                disabled={busy || !messages.some(message => message.role === 'user')}
                className="flex h-7 items-center gap-1 rounded-[10px] px-2 text-[9px] font-bold text-stone-400 transition-colors hover:bg-stone-200 hover:text-stone-600 disabled:opacity-35 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                title="重试上一条指令"
              >
                <RotateCcw className="h-3 w-3" /> 重试
              </button>
            </div>
            {busy ? (
              <button
                type="button"
                onClick={onCancel}
                className="flex h-8 items-center gap-1.5 rounded-[12px] bg-stone-800 px-3 text-[10px] font-bold text-white dark:bg-stone-100 dark:text-stone-900"
              >
                <Square className="h-3 w-3 fill-current" /> 停止
              </button>
            ) : (
              <button
                type="button"
                onClick={() => inputValue.trim() && onSendMessage(inputValue.trim())}
                disabled={!inputValue.trim() || !providerReady}
                className="flex h-8 items-center gap-1.5 rounded-[12px] bg-blue-500 px-3 text-[10px] font-bold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" /> 发送
              </button>
            )}
          </div>
        </div>
        <div className="mt-1.5 text-center text-[8px] text-stone-300 dark:text-stone-600">
          画布修改会按 Agent 设置请求确认
        </div>
      </footer>
    </aside>
  );
}
