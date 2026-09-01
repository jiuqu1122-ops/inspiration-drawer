import { ArrowUpRight, FolderCheck, ImagePlus, RefreshCw } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { ChatGeneratedMedia } from '../model/chatTypes';

const displaySource = (media: ChatGeneratedMedia) => {
  const source = media.path || media.url || '';
  if (!source || /^(?:https?:|data:|blob:|asset:)/i.test(source)) return source;
  try { return convertFileSrc(source); } catch (_) { return source; }
};

export function ChatGeneratedImageCard({
  media,
  onAddToCanvas,
  onRegenerate,
  onEdit,
}: {
  media: ChatGeneratedMedia;
  onAddToCanvas?: (media: ChatGeneratedMedia) => void;
  onRegenerate?: (media: ChatGeneratedMedia) => void;
  onEdit?: (media: ChatGeneratedMedia) => void;
}) {
  const source = displaySource(media);
  return (
    <figure className="chat-generated-media">
      {media.type === 'video' ? (
        <video src={source} controls preload="metadata" className="chat-generated-media__asset" />
      ) : (
        <img src={source} alt={media.name || media.prompt || 'AI 生成图片'} className="chat-generated-media__asset" />
      )}
      <figcaption className="chat-generated-media__actions">
        {media.assetId && <span className="chat-generated-media__saved"><FolderCheck size={12} />已保存到素材库</span>}
        {onAddToCanvas && media.assetId && (
          <button type="button" onClick={() => onAddToCanvas(media)}><ArrowUpRight size={13} />发送到画布</button>
        )}
        {onRegenerate && <button type="button" onClick={() => onRegenerate(media)}><RefreshCw size={13} />重新生成</button>}
        {onEdit && media.type === 'image' && <button type="button" onClick={() => onEdit(media)}><ImagePlus size={13} />继续编辑</button>}
      </figcaption>
    </figure>
  );
}
