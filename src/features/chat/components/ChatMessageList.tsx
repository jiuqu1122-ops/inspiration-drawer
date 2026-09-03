import { ArrowDown, MessageCircleMore } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import type { WorkflowResultCardData } from '../../agentModel';
import { WorkflowResultCard } from '../../../components/WorkflowResultCard';
import type { ChatGeneratedMedia, ChatMessage as ChatMessageType } from '../model/chatTypes';
import { ChatMessage } from './ChatMessage';

export function ChatMessageList({
  messages,
  visible,
  loading,
  loadingOlder,
  hasMore,
  onLoadOlder,
  onResolveTool,
  onRetry,
  onAddToCanvas,
  onRegenerateMedia,
  onEditMedia,
  workflowResult,
}: {
  messages: ChatMessageType[];
  visible: boolean;
  loading: boolean;
  loadingOlder: boolean;
  hasMore: boolean;
  onLoadOlder: () => void;
  onResolveTool: (id: string, approved: boolean) => void;
  onRetry: () => void;
  onAddToCanvas?: (media: ChatGeneratedMedia) => void;
  onRegenerateMedia?: (media: ChatGeneratedMedia) => void;
  onEditMedia?: (media: ChatGeneratedMedia) => void;
  workflowResult?: WorkflowResultCardData;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousRenderSignature = useRef('');
  const wasVisibleRef = useRef(false);
  const stickToBottomRef = useRef(true);
  const lastMessage = messages[messages.length - 1];
  const workflowProgressId = workflowResult
    ? `${workflowResult.workflowNodeId}:${workflowResult.status}:${workflowResult.completedSteps}:${workflowResult.completedAt}`
    : '';
  const messageRenderSignature = lastMessage
    ? [
      lastMessage.id,
      lastMessage.status,
      lastMessage.content.length,
      ...lastMessage.toolCalls.flatMap(call => [call.id, call.status, call.resultJson || '']),
    ].join(':')
    : '';
  const renderSignature = [workflowProgressId, messageRenderSignature].filter(Boolean).join('|');
  const showsMessageList = Boolean(workflowResult) || (!loading && messages.length > 0);
  useLayoutEffect(() => {
    if (!visible) {
      wasVisibleRef.current = false;
      return;
    }
    const firstVisibleFrame = !wasVisibleRef.current;
    wasVisibleRef.current = true;
    if (!renderSignature || (!firstVisibleFrame && renderSignature === previousRenderSignature.current)) return;
    previousRenderSignature.current = renderSignature;
    const list = listRef.current;
    if (!list) return;
    if (firstVisibleFrame || stickToBottomRef.current) {
      list.scrollTop = list.scrollHeight;
      stickToBottomRef.current = true;
    }
  }, [renderSignature, visible]);
  useLayoutEffect(() => {
    const list = listRef.current;
    const content = contentRef.current;
    if (!visible || !list || !content || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (stickToBottomRef.current) list.scrollTop = list.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [showsMessageList, visible]);
  if (loading && !workflowResult) return <div className="chat-empty"><div className="chat-skeleton" /><div className="chat-skeleton chat-skeleton--short" /></div>;
  if (messages.length === 0 && !workflowResult) {
    return (
      <div className="chat-empty">
        <span className="chat-empty__mark"><MessageCircleMore size={22} /></span>
        <h2>今天想聊点什么？</h2>
        <p>可以自由提问、写作和讨论创意，也可以在需要时调用画布与素材工具。</p>
      </div>
    );
  }
  return (
    <div
      className="chat-message-list"
      ref={listRef}
      onScroll={event => {
        const list = event.currentTarget;
        stickToBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 96;
      }}
    >
      <div className="chat-message-list__content" ref={contentRef}>
        {hasMore && (
          <button type="button" className="chat-load-older" onClick={onLoadOlder} disabled={loadingOlder}>
            <ArrowDown size={12} className="rotate-180" />{loadingOlder ? '正在加载' : '加载更早消息'}
          </button>
        )}
        {messages.map((message, index) => {
          return (
            <ChatMessage
              key={message.id}
              message={message}
              onResolveTool={onResolveTool}
              onRetry={message.role === 'assistant' && index === messages.length - 1 ? onRetry : undefined}
              onAddToCanvas={onAddToCanvas}
              onRegenerateMedia={onRegenerateMedia}
              onEditMedia={onEditMedia}
            />
          );
        })}
        {workflowResult && (
          <section className="chat-workflow-message" aria-live="polite">
            <WorkflowResultCard result={workflowResult} compact />
          </section>
        )}
      </div>
    </div>
  );
}
