import React from 'react';
import { Play } from 'lucide-react';

type CanvasRunActionProps = {
  label: string;
  disabled: boolean;
  isWorking: boolean;
  creditLabel?: string;
  creditTitle?: string;
  onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
};

type CanvasAiRunButtonProps = Omit<CanvasRunActionProps, 'label'> & {
  recoveryRequired?: boolean;
  isFrameInterpolation: boolean;
  isEnhancement: boolean;
  isVideoEnhancement: boolean;
  isQuickVideoEnhancement: boolean;
  isWorkflow: boolean;
  hasResults: boolean;
  workingElapsedText: string;
  workingStatusText: string;
};

export function CanvasRunAction({
  label, disabled, isWorking, creditLabel, creditTitle, onPointerDown, onClick,
}: CanvasRunActionProps) {
  return (
    <button
      data-no-drag="true"
      data-canvas-run-control="true"
      type="button"
      disabled={disabled}
      aria-busy={isWorking || undefined}
      onPointerDown={onPointerDown}
      onClick={onClick}
      title={creditTitle}
      className={`ml-auto flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[11px] px-2.5 text-[12px] font-black text-stone-500 transition-colors hover:bg-stone-950/[0.05] hover:text-stone-900 disabled:opacity-45 dark:text-white/58 dark:hover:bg-white/[0.07] dark:hover:text-white ${isWorking ? 'disabled:cursor-wait' : 'disabled:cursor-not-allowed'}`}
    >
      <Play className={`h-4 w-4 fill-current ${isWorking ? 'animate-pulse' : ''}`} aria-hidden="true" />
      {label}
      {!isWorking && creditLabel && (
        <span className="whitespace-nowrap text-[10px] font-bold text-amber-600 dark:text-amber-300">
          · {creditLabel}
        </span>
      )}
    </button>
  );
}

export function CanvasAiRunButton({
  disabled,
  recoveryRequired,
  isWorking,
  isFrameInterpolation,
  isEnhancement,
  isVideoEnhancement,
  isQuickVideoEnhancement,
  isWorkflow,
  hasResults,
  workingElapsedText,
  workingStatusText,
  creditLabel,
  creditTitle,
  onPointerDown,
  onClick,
}: CanvasAiRunButtonProps) {
  const label = recoveryRequired ? '恢复原任务' : isFrameInterpolation
    ? (isWorking ? `补帧中 ${workingElapsedText}` : hasResults ? '再次补帧' : '补帧')
    : isEnhancement
      ? (isVideoEnhancement
        ? (isWorking
          ? `${isQuickVideoEnhancement ? '快速增强中' : '后台增强中'} ${workingElapsedText}`
          : (isQuickVideoEnhancement ? '快速增强' : '完整增强'))
        : (isWorking ? `增强中 ${workingElapsedText}` : hasResults ? '再次增强' : '增强'))
      : isWorking
        ? workingStatusText
        : isWorkflow
          ? (hasResults ? '再次运行' : '运行')
          : hasResults
            ? '再次生成'
            : '生成';

  return (
    <CanvasRunAction
      label={label}
      disabled={disabled}
      isWorking={isWorking}
      creditLabel={recoveryRequired ? undefined : creditLabel}
      creditTitle={creditTitle}
      onPointerDown={onPointerDown}
      onClick={onClick}
    />
  );
}
