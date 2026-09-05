import { Bot, MessageSquarePlus, PanelLeft, Trash2, X } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentCanvasSelectionItem, WorkflowResultCardData } from '../../agentModel';
import type { ChatGeneratedMedia, ChatImageModelOption, PendingChatAttachment } from '../model/chatTypes';
import { setCanvasChatSidebarWidth } from '../runtime/canvasChatVisibility';
import { normalizeSupportedChatModel, resolveAvailableChatModels } from '../runtime/chatModelSelection';
import type { useChatRuntime } from '../runtime/useChatRuntime';
import { ChatComposer } from './ChatComposer';
import { ChatMessageList } from './ChatMessageList';
import './chat.css';

type ChatRuntime = ReturnType<typeof useChatRuntime>;

export type ChatViewProps = {
  runtime: ChatRuntime;
  variant: 'canvas' | 'drawer';
  visible?: boolean;
  width?: number;
  topOffset?: number;
  onWidthChange?: (width: number) => void;
  onClose: () => void;
  selectedItems: AgentCanvasSelectionItem[];
  modelOptions?: string[];
  modelOptionsLoading?: boolean;
  onRefreshModelOptions?: () => void | Promise<unknown>;
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
  onClearSelectedItems?: () => void;
  workflowResult?: WorkflowResultCardData;
};

const CANVAS_CHAT_HISTORY_WIDTH = 116;
const CANVAS_CHAT_EDGE_GAP = 8;

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

export const ChatView = memo(function ChatView({
  runtime,
  variant,
  visible = true,
  width,
  topOffset = 0,
  onWidthChange,
  onClose,
  selectedItems,
  modelOptions = [],
  modelOptionsLoading = false,
  onRefreshModelOptions,
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
  onClearSelectedItems,
  workflowResult,
}: ChatViewProps) {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<PendingChatAttachment[]>([]);
  const [ignoredSelectionAttachmentIds, setIgnoredSelectionAttachmentIds] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const activeConversationIdRef = useRef(runtime.activeConversationId);
  activeConversationIdRef.current = runtime.activeConversationId;
  const model = runtime.activeConversation?.model || '';
  const chatModelOptions = useMemo(
    () => resolveAvailableChatModels(modelOptions, model),
    [model, modelOptions],
  );
  const effectiveModel = normalizeSupportedChatModel(model) || chatModelOptions[0] || 'default';
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
    if (!runtime.activeConversation || model === effectiveModel) return;
    void runtime.setConversationModel(effectiveModel);
  }, [effectiveModel, model, runtime.activeConversation, runtime.setConversationModel]);
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
  const canvasMainWidth = width || 480;
  const canvasRenderedWidth = canvasMainWidth + (historyOpen ? CANVAS_CHAT_HISTORY_WIDTH : 0);
  useEffect(() => {
    if (variant !== 'canvas') return;
    setCanvasChatSidebarWidth(canvasRenderedWidth + CANVAS_CHAT_EDGE_GAP);
  }, [canvasRenderedWidth, variant]);
  const send = async () => {
    const sourceConversationId = runtime.activeConversationId;
    const pendingInput = input;
    const pendingAttachments = composerAttachments;
    const sentSelectionAttachmentIds = pendingAttachments
      .filter(attachment => selectionAttachmentIds.has(attachment.id))
      .map(attachment => attachment.id);
    setInput('');
    setAttachments([]);
    const sent = await runtime.sendMessage(
      pendingInput,
      pendingAttachments,
      effectiveModel,
      () => {
        if (sentSelectionAttachmentIds.length === 0) return;
        setIgnoredSelectionAttachmentIds(current => Array.from(new Set([
          ...current,
          ...sentSelectionAttachmentIds,
        ])));
        onClearSelectedItems?.();
      },
    );
    if (!sent && activeConversationIdRef.current === sourceConversationId) {
      setInput(current => current || pendingInput);
      setAttachments(current => current.length > 0
        ? current
        : pendingAttachments.filter(item => !selectionAttachmentIds.has(item.id)));
    }
  };
  const loadOlderMessages = useCallback(() => {
    void runtime.loadOlderMessages();
  }, [runtime.loadOlderMessages]);
  const resolveToolApproval = useCallback((id: string, approved: boolean) => {
    void runtime.resolveToolApproval(id, approved);
  }, [runtime.resolveToolApproval]);
  const retryLastMessage = useCallback(() => {
    void runtime.retryLast();
  }, [runtime.retryLast]);
  const regenerateMedia = useCallback((media: ChatGeneratedMedia) => {
    void runtime.sendMessage(`请重新生成上一张图片。保持主题不变。原提示：${media.prompt || ''}`);
  }, [runtime.sendMessage]);
  const editMedia = useCallback((media: ChatGeneratedMedia) => {
    setInput('继续编辑这张图：');
    if (media.path || media.url) {
      setAttachments([{
        id: `edit-${media.id}`,
        type: 'image',
        path: media.path || media.url || '',
        thumbnailPath: media.thumbnail,
      }]);
    }
  }, []);
  const shellStyle = variant === 'canvas' ? { width: canvasRenderedWidth, top: topOffset } : undefined;
  return (
    <section
      className={`chat-shell chat-shell--${variant} ${historyOpen ? 'is-history-open' : 'is-history-closed'}`}
      style={{ ...shellStyle, ...(visible ? {} : { visibility: 'hidden', pointerEvents: 'none' }) }}
      data-chat-view="true"
      aria-hidden={!visible}
    >
      {variant === 'canvas' && onWidthChange && (
        <div className="chat-resize" onPointerDown={event => { resizeRef.current = { startX: event.clientX, startWidth: width || 480 }; }} />
      )}
      <aside className={`chat-history ${historyOpen ? 'is-open' : ''}`}>
        <div className="chat-history__head">
          <button type="button" className="chat-new" onClick={() => void runtime.newConversation()}><MessageSquarePlus size={14} />新对话</button>
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
          visible={visible}
          loading={runtime.loading}
          loadingOlder={runtime.loadingOlder}
          hasMore={runtime.hasMoreMessages}
          onLoadOlder={loadOlderMessages}
          onResolveTool={resolveToolApproval}
          onRetry={retryLastMessage}
          onAddToCanvas={onAddGeneratedToCanvas}
          onRegenerateMedia={regenerateMedia}
          onEditMedia={editMedia}
          workflowResult={workflowResult}
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
            modelOptionsLoading={modelOptionsLoading}
            onRefreshModelOptions={onRefreshModelOptions}
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
            webSearchEnabled={runtime.webSearchEnabled}
            onWebSearchEnabledChange={runtime.setWebSearchEnabled}
          />
        </div>
      </div>
    </section>
  );
}, (previous, next) => previous.visible === false && next.visible === false);
