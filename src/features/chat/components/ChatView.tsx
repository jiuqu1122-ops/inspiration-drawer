import { Bot, MessageSquarePlus, PanelLeft, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentCanvasSelectionItem } from '../../agentModel';
import type { ChatGeneratedMedia, ChatImageModelOption, PendingChatAttachment } from '../model/chatTypes';
import type { useChatRuntime } from '../runtime/useChatRuntime';
import { ChatComposer } from './ChatComposer';
import { ChatMessageList } from './ChatMessageList';
import './chat.css';

type ChatRuntime = ReturnType<typeof useChatRuntime>;

const GPT_56_MODEL_PATTERN = /^gpt-5\.6(?:-|$)/i;
const GPT_56_MODEL_ORDER = ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.6'];

const selectionToAttachments = (items: AgentCanvasSelectionItem[]): PendingChatAttachment[] => items
  .flatMap(item => item.references || [])
  .filter(reference => reference.mediaType === 'image' && Boolean(reference.path || reference.source))
  .slice(0, 6)
  .map(reference => ({
    id: `selection-${reference.id}`,
    type: 'image',
    path: reference.path || reference.source || '',
    thumbnailPath: reference.thumbnail,
    mimeType: 'image/jpeg',
    metadataJson: JSON.stringify({ nodeId: reference.nodeId, sourceItemId: reference.sourceItemId }),
  }));

export function ChatView({
  runtime,
  variant,
  width,
  onWidthChange,
  onClose,
  selectedItems,
  modelOptions = [],
  imageModel,
  imageModelOptions = [],
  onImageModelChange,
  imageAspectRatio,
  imageAspectRatioOptions = [],
  onImageAspectRatioChange,
  imageResolution,
  imageResolutionOptions = [],
  onImageResolutionChange,
  onAddGeneratedToCanvas,
}: {
  runtime: ChatRuntime;
  variant: 'canvas' | 'drawer';
  width?: number;
  onWidthChange?: (width: number) => void;
  onClose: () => void;
  selectedItems: AgentCanvasSelectionItem[];
  modelOptions?: string[];
  imageModel: string;
  imageModelOptions?: ChatImageModelOption[];
  onImageModelChange: (model: string) => void;
  imageAspectRatio: string;
  imageAspectRatioOptions?: ChatImageModelOption[];
  onImageAspectRatioChange: (aspectRatio: string) => void;
  imageResolution: string;
  imageResolutionOptions?: ChatImageModelOption[];
  onImageResolutionChange: (resolution: string) => void;
  onAddGeneratedToCanvas?: (media: ChatGeneratedMedia) => void;
}) {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<PendingChatAttachment[]>([]);
  const [ignoredSelectionAttachmentIds, setIgnoredSelectionAttachmentIds] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const model = runtime.activeConversation?.model || '';
  const chatModelOptions = useMemo(() => {
    const available = Array.from(new Set(modelOptions.filter(option => GPT_56_MODEL_PATTERN.test(option.trim()))));
    if (available.length === 0) return ['gpt-5.6-sol'];
    return available.sort((left, right) => {
      const leftIndex = GPT_56_MODEL_ORDER.indexOf(left.toLowerCase());
      const rightIndex = GPT_56_MODEL_ORDER.indexOf(right.toLowerCase());
      return (leftIndex < 0 ? GPT_56_MODEL_ORDER.length : leftIndex)
        - (rightIndex < 0 ? GPT_56_MODEL_ORDER.length : rightIndex);
    });
  }, [modelOptions]);
  const effectiveModel = GPT_56_MODEL_PATTERN.test(model) ? model : chatModelOptions[0];
  const selectionAttachments = useMemo(() => selectionToAttachments(selectedItems), [selectedItems]);
  const selectionAttachmentIds = useMemo(
    () => new Set(selectionAttachments.map(item => item.id)),
    [selectionAttachments],
  );
  const composerAttachments = useMemo(() => {
    const visibleSelectionAttachments = selectionAttachments
      .filter(item => !ignoredSelectionAttachmentIds.includes(item.id));
    return [...visibleSelectionAttachments, ...attachments.filter(item => !selectionAttachmentIds.has(item.id))]
      .filter((item, index, items) => items.findIndex(candidate => candidate.path === item.path) === index)
      .slice(0, 6);
  }, [attachments, ignoredSelectionAttachmentIds, selectionAttachmentIds, selectionAttachments]);
  const selectionAttachmentKey = selectionAttachments.map(item => item.id).join('|');
  useEffect(() => {
    const currentIds = new Set(selectionAttachmentKey ? selectionAttachmentKey.split('|') : []);
    setIgnoredSelectionAttachmentIds(current => {
      const next = current.filter(id => currentIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [selectionAttachmentKey]);
  useEffect(() => {
    if (!model || GPT_56_MODEL_PATTERN.test(model)) return;
    void runtime.setConversationModel(chatModelOptions[0]);
  }, [chatModelOptions, model, runtime.setConversationModel]);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!resizeRef.current || !onWidthChange) return;
       onWidthChange(Math.max(420, Math.min(640, resizeRef.current.startWidth + resizeRef.current.startX - event.clientX)));
    };
    const up = () => { resizeRef.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [onWidthChange]);
  const send = async () => {
    const pendingInput = input;
    const pendingAttachments = composerAttachments;
    setInput('');
    setAttachments([]);
    const sent = await runtime.sendMessage(pendingInput, pendingAttachments);
    if (!sent) {
      setInput(current => current || pendingInput);
      setAttachments(current => current.length > 0
        ? current
        : pendingAttachments.filter(item => !selectionAttachmentIds.has(item.id)));
    }
  };
  const shellStyle = variant === 'canvas' ? { width: width || 480 } : undefined;
  return (
    <section className={`chat-shell chat-shell--${variant} ${historyOpen ? 'is-history-open' : 'is-history-closed'}`} style={shellStyle} data-chat-view="true">
      {variant === 'canvas' && onWidthChange && (
        <div className="chat-resize" onPointerDown={event => { resizeRef.current = { startX: event.clientX, startWidth: width || 480 }; }} />
      )}
      <aside className={`chat-history ${historyOpen ? 'is-open' : ''}`}>
        <div className="chat-history__head">
          <button type="button" className="chat-new" disabled={runtime.busy} onClick={() => void runtime.newConversation()}><MessageSquarePlus size={14} />新对话</button>
          {variant === 'drawer' && <button type="button" className="chat-icon-button" onClick={() => setHistoryOpen(false)}><X size={14} /></button>}
        </div>
        <div className="chat-history__list">
          {runtime.conversations.map(conversation => (
            <div key={conversation.id} className={`chat-history__item ${conversation.id === runtime.activeConversationId ? 'is-active' : ''}`}>
              <button type="button" onClick={() => { runtime.selectConversation(conversation.id); if (variant === 'drawer') setHistoryOpen(false); }}>
                <span>{conversation.title}</span><small>{new Date(conversation.updatedAt).toLocaleDateString()}</small>
              </button>
              <button type="button" className="chat-history__delete" onClick={() => void runtime.deleteConversation(conversation.id)} title="删除会话"><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      </aside>
      {variant === 'drawer' && historyOpen && <button type="button" className="chat-history-backdrop" onClick={() => setHistoryOpen(false)} aria-label="关闭会话列表" />}
      <div className="chat-main">
        <header className="chat-header">
          <div className="chat-header__title">
            <button
              type="button"
              className="chat-icon-button chat-history-toggle"
              onPointerDown={event => event.stopPropagation()}
              onClick={() => setHistoryOpen(value => !value)}
              title="会话历史"
              aria-label={historyOpen ? '收起会话历史' : '展开会话历史'}
            ><PanelLeft size={16} /></button>
            <span className="chat-brand"><Bot size={15} /></span>
            <div><strong>{runtime.activeConversation?.title || '新对话'}</strong><small>通用 AI Chat</small></div>
          </div>
          <button type="button" className="chat-icon-button" onClick={onClose} title="关闭聊天"><X size={16} /></button>
        </header>
        <ChatMessageList
          messages={runtime.messages}
          loading={runtime.loading}
          loadingOlder={runtime.loadingOlder}
          hasMore={runtime.hasMoreMessages}
          onLoadOlder={() => void runtime.loadOlderMessages()}
          onResolveTool={(id, approved) => void runtime.resolveToolApproval(id, approved)}
          onRetry={() => void runtime.retryLast()}
          onAddToCanvas={onAddGeneratedToCanvas}
          onRegenerateMedia={media => void runtime.sendMessage(`请重新生成上一张图片。保持主题不变。原提示：${media.prompt || ''}`)}
          onEditMedia={media => {
            setInput(`继续编辑这张图：`);
            if (media.path || media.url) setAttachments([{ id: `edit-${media.id}`, type: 'image', path: media.path || media.url || '', thumbnailPath: media.thumbnail }]);
          }}
        />
        <div className="chat-composer-wrap">
          <ChatComposer
            value={input}
            onChange={setInput}
            attachments={composerAttachments}
            onAttachmentsChange={next => {
              const nextIds = new Set(next.map(item => item.id));
              setIgnoredSelectionAttachmentIds(selectionAttachments
                .filter(item => !nextIds.has(item.id))
                .map(item => item.id));
              setAttachments(next.filter(item => !selectionAttachmentIds.has(item.id)));
            }}
            onSend={() => void send()}
            onStop={() => void runtime.stop()}
            busy={runtime.busy}
            stoppable={runtime.stoppable}
            model={effectiveModel}
            modelOptions={chatModelOptions}
            onModelChange={value => void runtime.setConversationModel(value)}
            imageModel={imageModel}
            imageModelOptions={imageModelOptions}
            onImageModelChange={onImageModelChange}
            imageAspectRatio={imageAspectRatio}
            imageAspectRatioOptions={imageAspectRatioOptions}
            onImageAspectRatioChange={onImageAspectRatioChange}
            imageResolution={imageResolution}
            imageResolutionOptions={imageResolutionOptions}
            onImageResolutionChange={onImageResolutionChange}
            reasoningEffort={runtime.reasoningEffort}
            onReasoningEffortChange={runtime.setReasoningEffort}
            webSearchEnabled={runtime.webSearchEnabled}
            onWebSearchEnabledChange={runtime.setWebSearchEnabled}
          />
        </div>
      </div>
    </section>
  );
}
