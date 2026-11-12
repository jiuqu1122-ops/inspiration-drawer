import { Check, ChevronDown, Image as ImageIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ChatImageModelOption } from '../model/chatTypes';

type PickerName = 'model' | 'aspect-ratio' | 'resolution' | 'quality' | 'mask';

function ImageSettingPicker({
  name,
  label,
  value,
  options,
  openPicker,
  setOpenPicker,
  onChange,
  disabled,
  wide = false,
}: {
  name: PickerName;
  label: string;
  value: string;
  options: ChatImageModelOption[];
  openPicker: PickerName | null;
  setOpenPicker: (value: PickerName | null) => void;
  onChange: (value: string) => void;
  disabled: boolean;
  wide?: boolean;
}) {
  const selected = options.find(option => option.value === value) || options[0];
  const open = openPicker === name;
  return (
    <div className={`chat-image-setting-picker ${wide ? 'is-wide' : ''}`}>
      <button
        type="button"
        className="chat-image-setting-trigger"
        disabled={disabled || options.length === 0}
        onClick={() => setOpenPicker(open ? null : name)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`${label}：${selected?.label || '自动'}`}
        aria-label={`${label}：${selected?.label || '自动'}`}
      >
        <span className="chat-image-setting-trigger__label">{label}</span>
        <strong>{selected?.label || '自动'}</strong>
        <ChevronDown size={12} className={open ? 'is-open' : ''} />
      </button>
      {open && (
        <div className="chat-image-setting-menu" role="listbox" aria-label={`选择${label}`}>
          {options.map(option => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? 'is-selected' : ''}
              key={option.value || 'auto'}
              onClick={() => {
                onChange(option.value);
                setOpenPicker(null);
              }}
              title={option.hint || option.label}
            >
              <span className="chat-model-option-copy">
                <strong>{option.label}</strong>
                {(option.meta || option.hint) && <small>{option.meta || option.hint}</small>}
              </span>
              {option.value === value && <Check size={12} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatImageSettings({
  model,
  modelOptions,
  onModelChange,
  aspectRatio,
  aspectRatioOptions,
  onAspectRatioChange,
  quality,
  qualityOptions = [],
  onQualityChange,
  resolution,
  resolutionOptions,
  onResolutionChange,
  maskMode = 'off',
  maskSupported = false,
  onMaskModeChange,
  busy,
}: {
  model: string;
  modelOptions: ChatImageModelOption[];
  onModelChange: (value: string) => void;
  aspectRatio: string;
  aspectRatioOptions: ChatImageModelOption[];
  onAspectRatioChange: (value: string) => void;
  quality?: string;
  qualityOptions?: ChatImageModelOption[];
  onQualityChange?: (value: string) => void;
  resolution: string;
  resolutionOptions: ChatImageModelOption[];
  onResolutionChange: (value: string) => void;
  maskMode?: 'off' | 'on';
  maskSupported?: boolean;
  onMaskModeChange?: (value: 'off' | 'on') => void;
  busy: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [openPicker, setOpenPicker] = useState<PickerName | null>(null);

  useEffect(() => {
    if (!openPicker) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenPicker(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenPicker(null);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [openPicker]);

  return (
    <div className="chat-image-settings" ref={rootRef}>
      <span className="chat-image-settings__title" title="图像生成设置" aria-label="图像生成设置">
        <ImageIcon size={13} aria-hidden="true" />
      </span>
      <div className="chat-image-settings__controls">
        <div className="chat-image-settings__primary">
          <ImageSettingPicker
            name="model"
            label="模型"
            value={model}
            options={modelOptions}
            openPicker={openPicker}
            setOpenPicker={setOpenPicker}
            onChange={onModelChange}
            disabled={busy}
            wide
          />
          <ImageSettingPicker
            name="aspect-ratio"
            label="比例"
            value={aspectRatio}
            options={aspectRatioOptions}
            openPicker={openPicker}
            setOpenPicker={setOpenPicker}
            onChange={onAspectRatioChange}
            disabled={busy}
          />
          <ImageSettingPicker
            name="resolution"
            label="清晰度"
            value={resolution}
            options={resolutionOptions}
            openPicker={openPicker}
            setOpenPicker={setOpenPicker}
            onChange={onResolutionChange}
            disabled={busy}
          />
        </div>
        {qualityOptions.length > 0 && <ImageSettingPicker name="quality" label="质量" value={quality || qualityOptions[0].value} options={qualityOptions} openPicker={openPicker} setOpenPicker={setOpenPicker} onChange={onQualityChange || (() => {})} disabled={busy} />}
        {maskSupported && <ImageSettingPicker
          name="mask"
          label="遮罩"
          value={maskMode}
          options={[
            { value: 'off', label: '关闭', hint: '保持当前普通生图流程' },
            { value: 'on', label: '启用', hint: '对支持遮罩的模型使用所选遮罩附件' },
          ]}
          openPicker={openPicker}
          setOpenPicker={setOpenPicker}
          onChange={value => onMaskModeChange?.(value === 'on' ? 'on' : 'off')}
          disabled={busy}
        />}
      </div>
    </div>
  );
}
