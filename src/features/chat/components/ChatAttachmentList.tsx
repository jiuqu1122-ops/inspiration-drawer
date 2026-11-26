import { File, Image as ImageIcon, X } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';
import type { ChatAttachment, PendingChatAttachment } from '../model/chatTypes';
import { getChatAttachmentDisplayName } from '../attachments/chatWorkflowAttachments';

type AttachmentLike = ChatAttachment | PendingChatAttachment;

const attachmentPreview = (attachment: AttachmentLike) => {
  const source = attachment.thumbnailPath || attachment.path;
  if (!source) return '';
  if (/^(?:https?:|data:|blob:|asset:)/i.test(source)) return source;
  try { return convertFileSrc(source); } catch (_) { return source; }
};

function ChatAttachmentImage({ attachment, name }: { attachment: AttachmentLike; name: string }) {
  const file = 'droppedFile' in attachment ? attachment.droppedFile : undefined;
  const [objectUrl, setObjectUrl] = useState('');
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const source = file ? objectUrl : attachmentPreview(attachment);
  return source ? <img src={source} alt={name} className="chat-attachment__image" />
    : <span className="chat-attachment__file"><ImageIcon size={14} /></span>;
}

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
        const name = getChatAttachmentDisplayName(attachment);
        return (
          <div key={attachment.id} className="chat-attachment" title={name}>
            {attachment.type === 'image' ? (
              <ChatAttachmentImage attachment={attachment} name={name} />
            ) : (
              <span className="chat-attachment__file">
                <File size={14} />
              </span>
            )}
            {(!compact || attachment.type !== 'image') && <span className="chat-attachment__name">{name}</span>}
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
