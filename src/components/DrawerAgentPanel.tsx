import {
  ArrowUp,
  Bot,
  Check,
  Copy,
  LoaderCircle,
  MessageSquarePlus,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  AgentCanvasSelectionItem,
  AgentChatMessage,
  AgentSettings,
  CodexRuntimeStatus,
} from '../features/agentModel';
import { getCanvasAgentToolLabel } from '../features/canvasAgentTools';

type DrawerAgentPanelProps = {
  messages: AgentChatMessage[];
  inputValue: string;
  busy: boolean;
  settings: AgentSettings;
  codexStatus: CodexRuntimeStatus | null;
  selectedItems: AgentCanvasSelectionItem[];
  onInputChange: (value: string) => void;
  onSendMessage: (content: string) => void;
  onCancel: () => void;
  onClose: () => void;
  onNewConversation: () => void;
  onClearConversation: () => void;
  onResolveToolCall: (id: string, approved: boolean) => void;
};

export function DrawerAgentPanel({
  messages,
  inputValue,
  busy,
  settings,
  codexStatus,
  selectedItems,
  onInputChange,
  onSendMessage,
  onCancel,
  onClose,
  onNewConversation,
  onClearConversation,
  onResolveToolCall,
}: DrawerAgentPanelProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState('');
  const ready = settings.provider === 'codex' ? !!codexStatus?.authenticated : settings.hasApiKey;

  useEffect(() => {
    window.setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    const content = inputValue.trim();
    if (content && ready && !busy) onSendMessage(content);
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
    >
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-blue-100/70 px-3 dark:border-white/8">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] bg-blue-500 text-white shadow-[0_6px_16px_rgba(59,130,246,0.25)]">
            <Bot className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[12px] font-bold text-stone-800 dark:text-stone-100">
              软件 Agent
              {busy && <LoaderCircle className="h-3 w-3 animate-spin text-blue-500" />}
            </div>
            <div className="mt-0.5 flex items-center gap-1 text-[8px] text-stone-400 dark:text-stone-500">
              <span className={`h-1.5 w-1.5 rounded-full ${ready ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {settings.provider === 'codex' ? 'Codex · 可控制抽屉与画布' : 'API · 可控制抽屉与画布'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={onNewConversation} className="flex h-8 w-8 items-center justify-center rounded-[10px] text-stone-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-white/7 dark:hover:text-blue-300" title="新对话"><MessageSquarePlus className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={onClearConversation} className="flex h-8 w-8 items-center justify-center rounded-[10px] text-stone-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-white/7" title="清空对话"><Trash2 className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-[10px] text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-white/7 dark:hover:text-stone-200" title="收起 Agent"><X className="h-4 w-4" /></button>
        </div>
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
        <div className="rounded-[20px] border border-blue-100/90 bg-white/92 p-2 shadow-[0_10px_28px_rgba(49,82,120,0.10)] focus-within:border-blue-300 dark:border-white/10 dark:bg-white/8">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={event => onInputChange(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="让 Agent 操作抽屉或画布…"
            className="max-h-24 min-h-12 w-full resize-none bg-transparent px-1.5 py-1 text-[11px] leading-5 text-stone-700 outline-none placeholder:text-stone-400 dark:text-stone-100 dark:placeholder:text-stone-500"
          />
          <div className="flex items-center justify-between px-1">
            <span className="text-[8px] text-stone-400">{ready ? '高风险操作会请求确认' : '请先在设置中配置 Agent'}</span>
            {busy ? (
              <button type="button" onClick={onCancel} className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900" title="停止"><Square className="h-3 w-3 fill-current" /></button>
            ) : (
              <button type="button" onClick={send} disabled={!inputValue.trim() || !ready} className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-30" title="发送"><ArrowUp className="h-4 w-4" /></button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
