import { ArrowDown, MessageCircleMore } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ChatGeneratedMedia, ChatMessage as ChatMessageType } from '../model/chatTypes';
import { ChatMessage } from './ChatMessage';

export function ChatMessageList({
  messages,
  loading,
  loadingOlder,
  hasMore,
  onLoadOlder,
  onResolveTool,
  onRetry,
  onAddToCanvas,
  onRegenerateMedia,
  onEditMedia,
}: {
  messages: ChatMessageType[];
  loading: boolean;
  loadingOlder: boolean;
  hasMore: boolean;
  onLoadOlder: () => void;
  onResolveTool: (id: string, approved: boolean) => void;
  onRetry: () => void;
  onAddToCanvas?: (media: ChatGeneratedMedia) => void;
  onRegenerateMedia?: (media: ChatGeneratedMedia) => void;
  onEditMedia?: (media: ChatGeneratedMedia) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const previousLastId = useRef('');
  useEffect(() => {
    const lastId = messages[messages.length - 1]?.id || '';
    if (!lastId || lastId === previousLastId.current) return;
    previousLastId.current = lastId;
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  if (loading) return <div className="chat-empty"><div className="chat-skeleton" /><div className="chat-skeleton chat-skeleton--short" /></div>;
  if (messages.length === 0) {
    return (
      <div className="chat-empty">
        <span className="chat-empty__mark"><MessageCircleMore size={22} /></span>
        <h2>今天想聊点什么？</h2>
        <p>可以自由提问、写作和讨论创意，也可以在需要时调用画布与素材工具。</p>
      </div>
    );
  }
  return (
    <div className="chat-message-list">
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
      <div ref={endRef} />
    </div>
  );
}
