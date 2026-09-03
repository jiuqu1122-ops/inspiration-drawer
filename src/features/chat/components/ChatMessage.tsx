import { Check, Copy, RotateCcw } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { memo, useState } from 'react';
import { ChatAttachmentList } from './ChatAttachmentList';
import { ChatGeneratedImageCard } from './ChatGeneratedImageCard';
import { ChatGeneratedFileCard } from './ChatGeneratedFileCard';
import { ChatToolCallCard } from './ChatToolCallCard';
import { ChatMarkdown } from './ChatMarkdown';
import { getGeneratedFilesFromToolCall, getGeneratedMediaFromToolCall, type ChatGeneratedMedia, type ChatMessage as ChatMessageType } from '../model/chatTypes';

const LINK_PATTERN = /\[([^\]]+)]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+)/g;

function ChatMessageText({ content }: { content: string }) {
  const parts: Array<string | { label: string; url: string }> = [];
  let cursor = 0;
  for (const match of content.matchAll(LINK_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(content.slice(cursor, index));
    const url = match[2] || match[3];
    parts.push({ label: match[1] || url, url });
    cursor = index + match[0].length;
  }
  if (cursor < content.length) parts.push(content.slice(cursor));
  return (
    <div className="chat-message__text">
      {parts.map((part, index) => typeof part === 'string' ? part : (
        <a
          href={part.url}
          key={`${part.url}-${index}`}
          onClick={event => {
            event.preventDefault();
            void openUrl(part.url);
          }}
          title={part.url}
        >
          {part.label}
        </a>
      ))}
    </div>
  );
}

export const ChatMessage = memo(function ChatMessage({
  message,
  onResolveTool,
  onRetry,
  onAddToCanvas,
  onRegenerateMedia,
  onEditMedia,
}: {
  message: ChatMessageType;
  onResolveTool: (id: string, approved: boolean) => void;
  onRetry?: () => void;
  onAddToCanvas?: (media: ChatGeneratedMedia) => void;
  onRegenerateMedia?: (media: ChatGeneratedMedia) => void;
  onEditMedia?: (media: ChatGeneratedMedia) => void;
}) {
  const [copied, setCopied] = useState(false);
  const generated = message.toolCalls.flatMap(getGeneratedMediaFromToolCall);
  const generatedFiles = message.toolCalls.flatMap(getGeneratedFilesFromToolCall);
  const copy = async () => {
    if (!message.content.trim()) return;
    await navigator.clipboard.writeText(message.content).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1000);
  };
  return (
    <article className={`chat-message chat-message--${message.role}`}>
      <div className={`chat-message__body ${message.attachments.length > 0 ? 'has-attachments' : ''}`}>
        <ChatAttachmentList attachments={message.attachments} compact />
        {message.content && (
          message.role === 'assistant'
            ? <ChatMarkdown content={message.content} />
            : <ChatMessageText content={message.content} />
        )}
        {message.role === 'assistant' && message.status === 'streaming' && !message.content && message.toolCalls.length === 0 && (
          <div className="chat-thinking" aria-label="正在生成"><i /><i /><i /></div>
        )}
        {message.toolCalls
          .filter(call => call.toolName !== 'batch_image_operation' || (call.status !== 'awaiting-approval' && call.status !== 'declined'))
          .map(call => <ChatToolCallCard key={call.id} call={call} onResolve={onResolveTool} />)}
        {generated.map(media => (
          <ChatGeneratedImageCard
            key={media.id}
            media={media}
            onAddToCanvas={onAddToCanvas}
            onRegenerate={onRegenerateMedia}
            onEdit={onEditMedia}
          />
        ))}
        {generatedFiles.map(file => <ChatGeneratedFileCard key={file.id} file={file} />)}
        {message.role === 'assistant' && message.status === 'error' && (
          <div className="chat-message__error">请求失败，你可以直接重试。</div>
        )}
        {message.role === 'assistant' && (message.content || message.status === 'error') && (
          <div className="chat-message__actions">
            <button type="button" onClick={() => void copy()}>{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? '已复制' : '复制'}</button>
            {onRetry && message.status !== 'streaming' && <button type="button" onClick={onRetry}><RotateCcw size={12} />重新生成</button>}
          </div>
        )}
      </div>
    </article>
  );
});
