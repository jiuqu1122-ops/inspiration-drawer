import { getMessageHtmlArtifacts } from '../html/chatHtmlArtifacts';
import { hasSuccessfulSearchToolReceipt } from '../runtime/chatSearchContinuation';
import { Check, Copy, RotateCcw, Square, PanelsTopLeft } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { memo, useState } from 'react';
import { ChatAttachmentList } from './ChatAttachmentList';
import { ChatGeneratedImageCard } from './ChatGeneratedImageCard';
import { ChatGeneratedFileCard } from './ChatGeneratedFileCard';
import { ChatToolCallList } from './ChatToolCallList';
import { ChatMarkdown } from './ChatMarkdown';
import { ChatThinkingPanel } from './ChatThinkingPanel';
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
  onStop,
  onPreviewHtml,
}: {
  message: ChatMessageType;
  onResolveTool: (id: string, approved: boolean) => void;
  onRetry?: () => void;
  onAddToCanvas?: (media: ChatGeneratedMedia) => void;
  onRegenerateMedia?: (media: ChatGeneratedMedia) => void;
  onEditMedia?: (media: ChatGeneratedMedia) => void;
  onStop?: () => void;
  onPreviewHtml?: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const generated = message.toolCalls.flatMap(getGeneratedMediaFromToolCall);
  const htmlArtifacts = getMessageHtmlArtifacts(message);
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
        {message.role === 'assistant' && <ChatThinkingPanel message={message} />}
        {message.content && (
          message.role === 'assistant'
            ? <ChatMarkdown content={message.content} messageId={message.id} onPreviewHtml={onPreviewHtml} />
            : <ChatMessageText content={message.content} />
        )}
        {onPreviewHtml && htmlArtifacts.filter(artifact => (artifact.id.endsWith(':document') || artifact.id.includes(':draft:'))).map(artifact => (
          <button type="button" key={artifact.id} className="chat-html-artifact-trigger" onClick={() => onPreviewHtml(artifact.id)}><PanelsTopLeft size={14} />{artifact.name}<span>预览</span></button>
        ))}
        {message.role === 'assistant' && message.status === 'streaming' && !message.content && message.toolCalls.length === 0 && !(message.thinkingSteps?.length) && (
          <div className="chat-thinking" aria-label="正在生成"><i /><i /><i /></div>
        )}
        <ChatToolCallList messageId={message.id} calls={message.toolCalls} onResolve={onResolveTool} />
        {generated.map(media => (
          <ChatGeneratedImageCard
            key={media.id}
            media={media}
            onAddToCanvas={onAddToCanvas}
            onRegenerate={onRegenerateMedia}
            onEdit={onEditMedia}
          />
        ))}
        {generatedFiles.map(file => {
          const artifact = htmlArtifacts.find(item => item.file?.id === file.id);
          return <ChatGeneratedFileCard key={file.id} file={file} onPreview={onPreviewHtml && artifact ? () => onPreviewHtml(artifact.id) : undefined} />;
        })}
        {message.role === 'assistant' && message.status === 'error' && (
          <div className="chat-message__error">{hasSuccessfulSearchToolReceipt(message.toolCalls)
            ? '检索步骤已完成，但后续回答或文件生成未完成。可重试或更换 Chat 模型。'
            : '请求失败，你可以直接重试。'}</div>
        )}
        {message.role === 'assistant' && (message.content || message.status === 'error') && (
          <div className="chat-message__actions">
            <button type="button" onClick={() => void copy()}>{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? '已复制' : '复制'}</button>
            {onRetry && message.status !== 'streaming' && <button type="button" onClick={onRetry}><RotateCcw size={12} />重新生成</button>}
          </div>
        )}
        {message.role === 'assistant' && message.status === 'streaming' && onStop && (
          <button type="button" className="chat-message__stop" onClick={onStop}><Square size={10} />停止生成</button>
        )}
      </div>
    </article>
  );
});
