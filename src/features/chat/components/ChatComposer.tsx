import { ArrowUp, Check, ChevronDown, Globe2, LoaderCircle, Paperclip, SlidersHorizontal, Square, X } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useEffect, useRef, useState } from 'react';
import type { ChatImageModelOption, PendingChatAttachment } from '../model/chatTypes';
import { createChatId } from '../model/chatTypes';
import { ChatAttachmentList } from './ChatAttachmentList';
import { ChatImageSettings } from './ChatImageSettings';

const compactModelLabel = (value: string) => value
  .replace(/^gpt-/i, '')
  .replace(/-codex-spark$/i, ' Spark')
  .replace(/-mini$/i, ' Mini')
  .replace(/-sol$/i, ' Sol')
  .replace(/-terra$/i, ' Terra')
  .replace(/-luna$/i, ' Luna');

export function ChatComposer({
  value,
  onChange,
  attachments,
  onAttachmentsChange,
  onSend,
  onStop,
  busy,
  stoppable,
  model,
  modelOptions,
  modelOptionsLoading = false,
  onRefreshModelOptions,
  onModelChange,
  imageModel,
  imageModelOptions,
  onImageModelChange,
  imageAspectRatio,
  imageAspectRatioOptions,
  onImageAspectRatioChange,
  imageResolution,
  imageResolutionOptions,
  onImageResolutionChange,
  webSearchEnabled,
  onWebSearchEnabledChange,
}: {
  value: string;
  onChange: (value: string) => void;
  attachments: PendingChatAttachment[];
  onAttachmentsChange: (value: PendingChatAttachment[]) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  stoppable: boolean;
  model: string;
  modelOptions: string[];
  modelOptionsLoading?: boolean;
  onRefreshModelOptions?: () => void | Promise<unknown>;
  onModelChange: (model: string) => void;
  imageModel: string;
  imageModelOptions: ChatImageModelOption[];
  onImageModelChange: (value: string) => void;
  imageAspectRatio: string;
  imageAspectRatioOptions: ChatImageModelOption[];
  onImageAspectRatioChange: (value: string) => void;
  imageResolution: string;
  imageResolutionOptions: ChatImageModelOption[];
  onImageResolutionChange: (value: string) => void;
  webSearchEnabled: boolean;
  onWebSearchEnabledChange: (value: boolean) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [imageSettingsOpen, setImageSettingsOpen] = useState(false);
  useEffect(() => {
    if (!modelOpen) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!modelPickerRef.current?.contains(target)) setModelOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModelOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [modelOpen]);
  const addPaths = (paths: string[]) => {
    const known = new Set(attachments.map(item => item.path));
    const added = paths.filter(path => path && !known.has(path)).slice(0, 6 - attachments.length).map(path => ({
      id: createChatId('chat-attachment'),
      type: /\.(?:png|jpe?g|webp|gif|bmp|avif)$/i.test(path) ? 'image' : 'file',
      path,
      mimeType: /\.png$/i.test(path) ? 'image/png' : /\.webp$/i.test(path) ? 'image/webp' : 'image/jpeg',
    } satisfies PendingChatAttachment));
    onAttachmentsChange([...attachments, ...added]);
  };
  const chooseFiles = async () => {
    const selected = await open({ multiple: true, filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'] }] });
    if (!selected) return;
    addPaths(Array.isArray(selected) ? selected : [selected]);
  };
  return (
    <div
      className={`chat-composer ${dragging ? 'is-dragging' : ''} ${imageSettingsOpen ? 'has-image-settings' : ''}`}
      onDragEnter={event => { event.preventDefault(); setDragging(true); }}
      onDragOver={event => event.preventDefault()}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={event => {
        event.preventDefault();
        setDragging(false);
        addPaths(Array.from(event.dataTransfer.files)
          .map(file => (file as File & { path?: string }).path || '')
          .filter(Boolean));
      }}
    >
      {dragging && <div className="chat-composer__drop">松开以添加图片</div>}
      <ChatAttachmentList attachments={attachments} onRemove={id => onAttachmentsChange(attachments.filter(item => item.id !== id))} />
      <textarea
        ref={textareaRef}
        data-chat-composer-input="true"
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={event => {
          event.stopPropagation();
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (!busy) onSend();
          }
        }}
        rows={2}
        placeholder="发消息，或让 AI 使用灵感抽屉工具"
        aria-label="聊天消息"
      />
      {imageSettingsOpen && (
        <div className="chat-composer__image-settings" id="chat-image-settings-panel">
          <ChatImageSettings
            model={imageModel}
            modelOptions={imageModelOptions}
            onModelChange={onImageModelChange}
            aspectRatio={imageAspectRatio}
            aspectRatioOptions={imageAspectRatioOptions}
            onAspectRatioChange={onImageAspectRatioChange}
            resolution={imageResolution}
            resolutionOptions={imageResolutionOptions}
            onResolutionChange={onImageResolutionChange}
            busy={busy}
          />
        </div>
      )}
      <div className="chat-composer__footer">
        <div className="chat-composer__tools">
          <button type="button" onClick={() => void chooseFiles()} title="上传图片"><Paperclip size={15} /></button>
          <button
            type="button"
            className={`chat-capability-toggle ${webSearchEnabled ? 'is-active' : ''}`}
            disabled={busy}
            onClick={() => onWebSearchEnabledChange(!webSearchEnabled)}
            aria-pressed={webSearchEnabled}
            aria-label={webSearchEnabled ? '关闭联网搜索' : '开启联网搜索'}
            title={webSearchEnabled ? '联网搜索已开启' : '开启联网搜索'}
          >
            <Globe2 size={14} />
          </button>
          <button
            type="button"
            className="chat-image-settings-toggle"
            disabled={busy}
            onClick={() => setImageSettingsOpen(value => !value)}
            aria-expanded={imageSettingsOpen}
            aria-controls="chat-image-settings-panel"
            aria-label="图像生成设置"
            title="图像生成设置"
          >
            <SlidersHorizontal size={14} />
            <span>图片</span>
          </button>
          <div className="chat-model-picker" ref={modelPickerRef}>
            <button
              type="button"
              className="chat-model-trigger"
              disabled={busy}
              onClick={() => {
                if (!modelOpen) void onRefreshModelOptions?.();
                setModelOpen(value => !value);
              }}
              aria-haspopup="menu"
              aria-expanded={modelOpen}
              title={`模型：${model || '默认模型'}`}
            >
              <span>{compactModelLabel(model || '默认模型')}</span>
              <ChevronDown size={12} className={modelOpen ? 'is-open' : ''} />
            </button>
            {modelOpen && (
              <div className="chat-model-menu" role="menu" aria-label="选择模型">
                {modelOptionsLoading && (
                  <div className="chat-model-menu__status">
                    <LoaderCircle size={11} className="chat-spin" />
                    <span>正在刷新模型…</span>
                  </div>
                )}
                {modelOptions.map(option => (
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={option === model}
                    className={option === model ? 'is-selected' : ''}
                    key={option}
                    onClick={() => {
                      onModelChange(option);
                      setModelOpen(false);
                    }}
                  >
                    <span>{option || '默认模型'}</span>
                    {option === model && <Check size={12} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {busy && stoppable ? (
          <button type="button" className="chat-composer__send is-stop" onClick={onStop} title="停止生成"><Square size={13} fill="currentColor" /></button>
        ) : busy ? (
          <button type="button" className="chat-composer__send is-stop" disabled title="正在执行工具"><LoaderCircle size={14} className="chat-spin" /></button>
        ) : (
          <button type="button" className="chat-composer__send" onClick={onSend} disabled={!value.trim() && attachments.length === 0} title="发送"><ArrowUp size={16} /></button>
        )}
      </div>
      {attachments.length >= 6 && <div className="chat-composer__limit"><X size={11} />每次最多 6 个附件</div>}
    </div>
  );
}
