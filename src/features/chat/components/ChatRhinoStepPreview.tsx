import { X, ZoomIn } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ChatToolCall } from '../model/chatTypes';
import { loadRhinoStepPreviews } from '../storage/rhinoStepPreviews';
import './chatRhinoStepPreview.css';

export const isRhinoViewportTool = (name: string) =>
  name === 'rhino_review_viewport' || name === 'rhino_native_get_viewport_image';

export function rhinoStepPreviewCount(call: ChatToolCall): 0 | 1 | 2 {
  if (call.status !== 'completed' || !isRhinoViewportTool(call.toolName) || !call.resultJson) return 0;
  try {
    const marker = JSON.parse(call.resultJson)?.rhinoStepPreview;
    return marker?.version === 1 && (marker.count === 1 || marker.count === 2) ? marker.count : 0;
  } catch { return 0; }
}

export function ChatRhinoStepPreview({ call }: { call: ChatToolCall }) {
  const count = rhinoStepPreviewCount(call);
  if (!count) return null;
  // A different receipt must never briefly render the previous thumbnails or its open dialog.
  return <RhinoStepImages key={JSON.stringify([call.messageId, call.id, call.toolName, count])}
    messageId={call.messageId} callId={call.id} count={count} />;
}

function RhinoStepImages({ messageId, callId, count }: { messageId: string; callId: string; count: 1 | 2 }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const owned = useRef(new Set<string>());

  useEffect(() => {
    let current = true;
    const resources = owned.current;
    void loadRhinoStepPreviews(messageId, callId).then(blobs => {
      if (!current) return;
      for (const blob of blobs.slice(0, count)) {
        if (!(blob instanceof Blob) || !blob.size || !['image/png', 'image/jpeg', 'image/webp'].includes(blob.type)) continue;
        try { resources.add(URL.createObjectURL(blob)); } catch { /* Skip just the unreadable frame. */ }
      }
      setUrls([...resources]);
    }).catch(() => { /* Disposable previews may no longer be available locally. */ });
    return () => {
      current = false;
      resources.forEach(url => URL.revokeObjectURL(url));
      resources.clear();
    };
  }, [messageId, callId, count]);

  const discard = (url: string) => {
    if (!owned.current.delete(url)) return;
    if (url === selected) {
      dialog.current?.close();
      setSelected(null);
    }
    URL.revokeObjectURL(url);
    setUrls(previous => previous.filter(item => item !== url));
  };

  if (!urls.length) return null;
  const label = (index: number) => `Rhino 视口图 ${index + 1}`;
  const selectedLabel = selected ? label(urls.indexOf(selected)) : 'Rhino 视口图';
  return (
    <div className="chat-rhino-preview" data-canvas-edit-control="true">
      {urls.map((url, index) => (
        <button type="button" key={url} className="chat-rhino-preview__thumb" aria-haspopup="dialog"
          aria-label={`放大${label(index)}`} onClick={event => {
            event.currentTarget.focus({ preventScroll: true });
            setSelected(url);
            dialog.current?.showModal();
          }}>
          <img src={url} alt={label(index)} onError={() => discard(url)} />
          <ZoomIn size={14} aria-hidden="true" />
        </button>
      ))}
      <dialog ref={dialog} className="chat-rhino-preview__dialog" aria-label={selectedLabel}
        onClose={event => { if (!event.currentTarget.open) setSelected(null); }} onClick={event => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}>
        <header>
          <span>{selectedLabel}</span>
          <button type="button" aria-label="关闭视口预览" onClick={() => dialog.current?.close()}><X size={17} /></button>
        </header>
        {selected && <img src={selected} alt={selectedLabel} onError={() => discard(selected)} />}
      </dialog>
    </div>
  );
}
