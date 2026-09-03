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
  const previousLastId = useRef('');
  const wasVisibleRef = useRef(false);
  useLayoutEffect(() => {
    if (!visible) {
      wasVisibleRef.current = false;
      return;
    }
    const workflowProgressId = workflowResult
      ? `${workflowResult.workflowNodeId}:${workflowResult.status}:${workflowResult.completedSteps}:${workflowResult.completedAt}`
      : '';
    const lastId = workflowProgressId || messages[messages.length - 1]?.id || '';
    const firstVisibleFrame = !wasVisibleRef.current;
    wasVisibleRef.current = true;
    if (!lastId || (!firstVisibleFrame && lastId === previousLastId.current)) return;
    previousLastId.current = lastId;
    const list = listRef.current;
    if (!list) return;
    if (firstVisibleFrame) list.scrollTop = list.scrollHeight;
    else list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }, [messages, visible, workflowResult]);
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
    <div className="chat-message-list" ref={listRef}>
      {hasMore && (
        <button type="button" className="chat-load-older" onClick={onLoadOlder} disabled={loadingOlder}>
          <ArrowDown size={12} className="rotate-180" />{loadingOlder ? '正在加载' : '加载更早消息'}
        </button>
      )}
      {messages.map((message, index) => (
        <ChatMessage
          key={message.id}
          message={message}
          onResolveTool={onResolveTool}
          onRetry={message.role === 'assistant' && index === messages.length - 1 ? onRetry : undefined}
          onAddToCanvas={onAddToCanvas}
          onRegenerateMedia={onRegenerateMedia}
          onEditMedia={onEditMedia}
        />
      ))}
      {workflowResult && (
        <section className="chat-workflow-message" aria-live="polite">
          <WorkflowResultCard result={workflowResult} compact />
        </section>
      )}
    </div>
  );
}
