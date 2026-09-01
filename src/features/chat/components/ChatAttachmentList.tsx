import { File, Image as ImageIcon, X } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { ChatAttachment, PendingChatAttachment } from '../model/chatTypes';

type AttachmentLike = ChatAttachment | PendingChatAttachment;

const attachmentPreview = (attachment: AttachmentLike) => {
  const source = attachment.thumbnailPath || attachment.path;
  if (!source) return '';
  if (/^(?:https?:|data:|blob:|asset:)/i.test(source)) return source;
  try { return convertFileSrc(source); } catch (_) { return source; }
};

export function ChatAttachmentList({
  attachments,
  onRemove,
  compact = false,
}: {
  attachments: AttachmentLike[];
  onRemove?: (id: string) => void;
  compact?: boolean;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className={`chat-attachments ${compact ? 'chat-attachments--compact' : ''}`}>
      {attachments.map(attachment => {
        const preview = attachment.type === 'image' ? attachmentPreview(attachment) : '';
        const name = attachment.path.split(/[\\/]/).pop() || '附件';
        return (
          <div key={attachment.id} className="chat-attachment" title={name}>
            {preview ? (
              <img src={preview} alt={name} className="chat-attachment__image" />
            ) : (
              <span className="chat-attachment__file">
                {attachment.type === 'image' ? <ImageIcon size={14} /> : <File size={14} />}
              </span>
            )}
            {!compact && <span className="chat-attachment__name">{name}</span>}
            {onRemove && (
              <button type="button" className="chat-attachment__remove" onClick={() => onRemove(attachment.id)} aria-label={`移除 ${name}`}>
                <X size={12} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
