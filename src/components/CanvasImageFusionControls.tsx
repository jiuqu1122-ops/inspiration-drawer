import { Image as ImageIcon, Layers, X } from 'lucide-react';
import type { CanvasImageFusionRole } from '../utils/canvasImageFusion';

type FusionSlotProps = {
  role: CanvasImageFusionRole;
  label: string;
  hint: string;
  previewSource?: string;
  connected: boolean;
  weight: number;
  disabled?: boolean;
  onOpen: (role: CanvasImageFusionRole) => void;
  onRemove: () => void;
  onWeightChange: (value: number) => void;
};

function FusionSlot({
  role,
  label,
  hint,
  previewSource,
  connected,
  weight,
  disabled,
  onOpen,
  onRemove,
  onWeightChange,
}: FusionSlotProps) {
  const isBase = role === 'BASE';
  const accent = isBase
    ? 'text-blue-600 dark:text-blue-200'
    : 'text-fuchsia-600 dark:text-fuchsia-200';
  const trackAccent = isBase ? 'accent-blue-500' : 'accent-fuchsia-500';
  return (
    <div
      data-no-drag="true"
      className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-[15px] border border-stone-950/[0.055] bg-white/54 p-2 dark:border-white/[0.07] dark:bg-white/[0.035]"
      onPointerDown={event => event.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpen(role);
          }}
          className="group/fusion-slot relative flex h-14 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-dashed border-stone-300/70 bg-stone-100/55 text-stone-400 transition-colors hover:border-stone-400 hover:text-stone-600 disabled:cursor-not-allowed disabled:opacity-55 dark:border-white/[0.13] dark:bg-black/15 dark:text-white/38 dark:hover:border-white/25 dark:hover:text-white/65"
          title={connected ? `更换${label}` : `选择${label}`}
        >
          {previewSource ? (
            <img
              src={previewSource}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              className="h-full w-full object-cover"
            />
          ) : connected ? (
            <Layers className="h-4 w-4" />
          ) : (
            <span className="flex flex-col items-center gap-0.5 text-[9px] font-black">
              <ImageIcon className="h-3.5 w-3.5" />
              选择图片
            </span>
          )}
          <span className={`pointer-events-none absolute bottom-1 left-1 rounded bg-black/72 px-1 py-0.5 text-[8px] font-black leading-none text-white`}>
            {isBase ? 'BASE' : 'STYLE'}
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className={`truncate text-[10px] font-black ${accent}`}>{label}</span>
            {connected && (
              <button
                type="button"
                className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-red-500/10 hover:text-red-500 dark:text-white/38 dark:hover:text-red-300"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRemove();
                }}
                title={`移除${label}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-[8px] font-bold leading-[11px] text-stone-400 dark:text-white/34">
            {hint}
          </p>
        </div>
      </div>
      <label className="flex items-center gap-2 text-[9px] font-black text-stone-500 dark:text-white/52">
        <span className="w-11 shrink-0">{isBase ? '保留度' : '融合度'}</span>
        <input
          data-no-drag="true"
          type="range"
          min="0"
          max="100"
          step="1"
          value={weight}
          disabled={disabled}
          className={`h-1.5 min-w-0 flex-1 cursor-pointer disabled:cursor-not-allowed ${trackAccent}`}
          onPointerDown={event => event.stopPropagation()}
          onChange={event => onWeightChange(Number(event.target.value))}
        />
        <span className="w-8 shrink-0 text-right tabular-nums">{weight}%</span>
      </label>
    </div>
  );
}

type CanvasImageFusionControlsProps = {
  basePreviewSource?: string;
  stylePreviewSource?: string;
  baseConnected: boolean;
  styleConnected: boolean;
  baseWeight: number;
  styleWeight: number;
  disabled?: boolean;
  onOpenSlot: (role: CanvasImageFusionRole) => void;
  onRemoveBase: () => void;
  onRemoveStyle: () => void;
  onBaseWeightChange: (value: number) => void;
  onStyleWeightChange: (value: number) => void;
};

export function CanvasImageFusionControls({
  basePreviewSource,
  stylePreviewSource,
  baseConnected,
  styleConnected,
  baseWeight,
  styleWeight,
  disabled,
  onOpenSlot,
  onRemoveBase,
  onRemoveStyle,
  onBaseWeightChange,
  onStyleWeightChange,
}: CanvasImageFusionControlsProps) {
  return (
    <div className="flex min-w-0 flex-1 items-stretch gap-2">
      <FusionSlot
        role="BASE"
        label="基图"
        hint="核心产品、结构与功能依据"
        previewSource={basePreviewSource}
        connected={baseConnected}
        weight={baseWeight}
        disabled={disabled}
        onOpen={onOpenSlot}
        onRemove={onRemoveBase}
        onWeightChange={onBaseWeightChange}
      />
      <FusionSlot
        role="STYLE_REF"
        label="意向图"
        hint="形态、CMF、光影与氛围参考"
        previewSource={stylePreviewSource}
        connected={styleConnected}
        weight={styleWeight}
        disabled={disabled}
        onOpen={onOpenSlot}
        onRemove={onRemoveStyle}
        onWeightChange={onStyleWeightChange}
      />
    </div>
  );
}
