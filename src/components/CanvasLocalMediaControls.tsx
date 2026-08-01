import { invoke } from '@tauri-apps/api/core';
import { Maximize2, RefreshCw } from 'lucide-react';
import { RoundedSelect } from './RoundedSelect';
import type { CanvasImageItem } from '../features/canvasModel';
import {
  CANVAS_ESRGAN_IMAGE_FORMAT_OPTIONS,
  CANVAS_ESRGAN_MODE_OPTIONS,
  CANVAS_ESRGAN_RESIZE_MODE_OPTIONS,
  CANVAS_ESRGAN_SCALE_OPTIONS,
  CANVAS_QUICK_ENHANCEMENT_SCALE_OPTIONS,
  CANVAS_RIFE_AUTO_TARGET_FPS_OPTIONS,
  CANVAS_RIFE_KEEP_AUDIO_OPTIONS,
  CANVAS_RIFE_MODE_OPTIONS,
  CANVAS_RIFE_OUTPUT_FORMAT_OPTIONS,
  CANVAS_RIFE_QUALITY_OPTIONS,
  CANVAS_RIFE_RATE_OPTIONS,
  CANVAS_VIDEO_CFR_MODE_OPTIONS,
  CANVAS_VIDEO_ENHANCEMENT_ENGINE_OPTIONS,
} from '../features/canvasAiConfig';
import {
  getCanvasRifeRateValue,
  isRifeFixed2xMode,
} from '../features/canvasLocalMediaTools';
import {
  CANVAS_AI_NODE_CHEVRON_CLASS,
  CANVAS_AI_NODE_SELECT_ACTIVE_CLASS,
  CANVAS_AI_NODE_SELECT_MENU_CLASS,
  CANVAS_AI_NODE_SELECT_OPTION_CLASS,
  CANVAS_AI_NODE_TEXT_SELECT_CLASS,
} from './canvasAiNodeControlStyles';

type CanvasLocalMediaControlsProps = {
  canvasItem: CanvasImageItem;
  isCanvasFrameInterpolationItem: boolean;
  isFrameInterpolationFixed2xMode: boolean;
  isCanvasEnhancementItem: boolean;
  isCanvasVideoEnhancementItem: boolean;
  isQuickVideoEnhancementItem: boolean;
  canvasAiMenuScale: number;
  updateCanvasAiGeneratorData: (
    nodeId: string,
    patch: Partial<NonNullable<CanvasImageItem['ai']>>,
    content?: string,
  ) => CanvasImageItem | undefined;
  cancelCanvasEnhancementEstimate: (canvasId: string) => Promise<void>;
};

export function CanvasLocalMediaControls({
  canvasItem,
  isCanvasFrameInterpolationItem,
  isFrameInterpolationFixed2xMode,
  isCanvasEnhancementItem,
  isCanvasVideoEnhancementItem,
  isQuickVideoEnhancementItem,
  canvasAiMenuScale,
  updateCanvasAiGeneratorData,
  cancelCanvasEnhancementEstimate,
}: CanvasLocalMediaControlsProps) {
  if (isCanvasFrameInterpolationItem) {
    return (
      <>
        <RoundedSelect
          data-no-drag="true"
          data-canvas-edit-control="true"
          value={isFrameInterpolationFixed2xMode ? 'auto-2x' : getCanvasRifeRateValue(canvasItem.ai)}
          options={isFrameInterpolationFixed2xMode ? CANVAS_RIFE_AUTO_TARGET_FPS_OPTIONS : CANVAS_RIFE_RATE_OPTIONS}
          onChange={(value) => {
            if (value.startsWith('target-')) {
              updateCanvasAiGeneratorData(canvasItem.id, {
                interpolationRateMode: 'target-fps',
                interpolationTargetFps: Number(value.slice('target-'.length)) || 60,
              });
            } else {
              updateCanvasAiGeneratorData(canvasItem.id, {
                interpolationRateMode: 'multiplier',
                interpolationFactor: Number(value.slice('factor-'.length)) || 2,
              });
            }
          }}
          disabled={isFrameInterpolationFixed2xMode}
          icon={<RefreshCw className="h-3.5 w-3.5" />}
          labelClassName="text-center leading-none"
          chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
          title={isFrameInterpolationFixed2xMode ? 'HD / UHD 固定使用原帧率 × 2' : '倍率补帧与目标帧率二选一'}
          className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} w-[112px] ${isFrameInterpolationFixed2xMode ? 'cursor-not-allowed opacity-45 hover:bg-transparent dark:hover:bg-transparent' : ''}`}
          menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
          optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
          selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
          menuMinWidth={138}
          menuScale={canvasAiMenuScale}
        />
        <RoundedSelect
          data-no-drag="true"
          data-canvas-edit-control="true"
          value={canvasItem.ai?.videoCfrMode || 'auto'}
          options={CANVAS_VIDEO_CFR_MODE_OPTIONS}
          onChange={(value) => {
            const videoCfrMode = value === '24' || value === '30' || value === 'off' ? value : 'auto';
            updateCanvasAiGeneratorData(canvasItem.id, { videoCfrMode });
            if (videoCfrMode !== 'off') {
              void invoke<void>('ensure_video_cfr_tools', { progressId: canvasItem.id })
                .catch(error => console.warn('FFmpeg / FFprobe 后台准备失败:', error));
            }
          }}
          labelClassName="text-center leading-none"
          chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
          title="补帧前检测 VFR；自动模式只在需要时标准化"
          className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} w-[104px]`}
          menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
          optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
          selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
          menuMinWidth={132}
          menuScale={canvasAiMenuScale}
        />
        <RoundedSelect
          data-no-drag="true"
          data-canvas-edit-control="true"
          value={canvasItem.ai?.interpolationMode || 'normal'}
          options={CANVAS_RIFE_MODE_OPTIONS}
          onChange={(value) => updateCanvasAiGeneratorData(canvasItem.id, {
            interpolationMode: value,
            ...(isRifeFixed2xMode(value) ? { interpolationFactor: 2 } : {}),
          })}
          labelClassName="text-center leading-none"
          chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
          title={`模式：${CANVAS_RIFE_MODE_OPTIONS.find(option => option.value === (canvasItem.ai?.interpolationMode || 'normal'))?.label || '普通'}`}
          className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} w-[82px]`}
          menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
          optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
          selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
          menuMinWidth={118}
          menuScale={canvasAiMenuScale}
        />
        <RoundedSelect
          data-no-drag="true"
          data-canvas-edit-control="true"
          value={canvasItem.ai?.interpolationQuality || 'standard'}
          options={CANVAS_RIFE_QUALITY_OPTIONS}
          onChange={(value) => updateCanvasAiGeneratorData(canvasItem.id, { interpolationQuality: value })}
          labelClassName="text-center leading-none"
          chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
          title={`质量：${CANVAS_RIFE_QUALITY_OPTIONS.find(option => option.value === (canvasItem.ai?.interpolationQuality || 'standard'))?.label || '标准'}`}
          className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} w-[76px]`}
          menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
          optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
          selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
          menuMinWidth={104}
          menuScale={canvasAiMenuScale}
        />
        <RoundedSelect
          data-no-drag="true"
          data-canvas-edit-control="true"
          value={canvasItem.ai?.interpolationKeepAudio === false ? 'no' : 'yes'}
          options={CANVAS_RIFE_KEEP_AUDIO_OPTIONS}
          onChange={(value) => updateCanvasAiGeneratorData(canvasItem.id, { interpolationKeepAudio: value !== 'no' })}
          labelClassName="text-center leading-none"
          chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
          title={canvasItem.ai?.interpolationKeepAudio === false ? '不保留音频' : '保留音频'}
          className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} w-[88px]`}
          menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
          optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
          selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
          menuMinWidth={112}
          menuScale={canvasAiMenuScale}
        />
        <RoundedSelect
          data-no-drag="true"
          data-canvas-edit-control="true"
          value={String(canvasItem.ai?.outputFormat || 'mp4').toLowerCase()}
          options={CANVAS_RIFE_OUTPUT_FORMAT_OPTIONS}
          onChange={(value) => updateCanvasAiGeneratorData(canvasItem.id, { outputFormat: value })}
          labelClassName="text-center leading-none uppercase"
          chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
          title={`输出格式：${String(canvasItem.ai?.outputFormat || 'mp4').toUpperCase()}`}
          className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} w-[66px]`}
          menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
          optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
          selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
          menuMinWidth={88}
          menuScale={canvasAiMenuScale}
        />
      </>
    );
  }

  if (isCanvasEnhancementItem) {
    return (
      <>
        {isCanvasVideoEnhancementItem && (
          <RoundedSelect
            data-no-drag="true"
            data-canvas-edit-control="true"
            value={canvasItem.ai?.enhancementEngine || 'ai'}
            options={CANVAS_VIDEO_ENHANCEMENT_ENGINE_OPTIONS}
            onChange={(value) => {
              if (value === 'quick') {
                void cancelCanvasEnhancementEstimate(canvasItem.id);
              }
              updateCanvasAiGeneratorData(canvasItem.id, {
                enhancementEngine: value === 'quick' ? 'quick' : 'ai',
                enhancementEstimate: undefined,
                enhancementEstimateKey: undefined,
                enhancementProgress: undefined,
              });
            }}
            labelClassName="text-center leading-none"
            chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
            title={isQuickVideoEnhancementItem ? 'FFmpeg 滤镜 + NVENC 优先' : 'Real-ESRGAN AI 清晰度增强'}
            className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} w-[104px]`}
            menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
            optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
            selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
            menuMinWidth={132}
          menuScale={canvasAiMenuScale}
          />
        )}
        {isQuickVideoEnhancementItem ? (
          <RoundedSelect
            data-no-drag="true"
            data-canvas-edit-control="true"
            value={String(canvasItem.ai?.quickEnhancementScale || 2)}
            options={CANVAS_QUICK_ENHANCEMENT_SCALE_OPTIONS}
            onChange={(value) => updateCanvasAiGeneratorData(canvasItem.id, { quickEnhancementScale: Number(value) >= 2 ? 2 : 1 })}
            icon={<Maximize2 className="h-3.5 w-3.5" />}
            labelClassName="text-center leading-none"
            chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
            title="快速增强输出分辨率"
            className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} w-[112px]`}
            menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
            optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
            selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
            menuMinWidth={132}
          menuScale={canvasAiMenuScale}
          />
        ) : (
          <>
        <RoundedSelect
          data-no-drag="true"
          data-canvas-edit-control="true"
          value={String(canvasItem.ai?.enhancementScale || 2)}
          options={CANVAS_ESRGAN_SCALE_OPTIONS}
          onChange={(value) => updateCanvasAiGeneratorData(canvasItem.id, { enhancementScale: Number(value) || 2 })}
          icon={<Maximize2 className="h-3.5 w-3.5" />}
          labelClassName="text-center leading-none"
          chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
          title={`增强倍率：${canvasItem.ai?.enhancementScale || 2}×`}
          className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} w-[102px]`}
          menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
          optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
          selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
          menuMinWidth={118}
          menuScale={canvasAiMenuScale}
        />
        <RoundedSelect
          data-no-drag="true"
          data-canvas-edit-control="true"
          value={canvasItem.ai?.enhancementMode || 'general'}
          options={CANVAS_ESRGAN_MODE_OPTIONS}
          onChange={(value) => updateCanvasAiGeneratorData(canvasItem.id, {
            enhancementMode: value,
            model: value === 'anime' ? 'realesr-animevideov3' : 'realesrgan-x4plus',
          })}
          labelClassName="text-center leading-none"
          chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
          title={`模式：${CANVAS_ESRGAN_MODE_OPTIONS.find(option => option.value === (canvasItem.ai?.enhancementMode || 'general'))?.label || '通用增强'}`}
          className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} w-[96px]`}
          menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
          optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
          selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
          menuMinWidth={128}
          menuScale={canvasAiMenuScale}
        />
        <RoundedSelect
          data-no-drag="true"
          data-canvas-edit-control="true"
          value={canvasItem.ai?.enhancementResizeMode || 'upscale'}
          options={CANVAS_ESRGAN_RESIZE_MODE_OPTIONS}
          onChange={(value) => updateCanvasAiGeneratorData(canvasItem.id, { enhancementResizeMode: value })}
          labelClassName="text-center leading-none"
          chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
          title={`增强方式：${CANVAS_ESRGAN_RESIZE_MODE_OPTIONS.find(option => option.value === (canvasItem.ai?.enhancementResizeMode || 'upscale'))?.label || '放大并增强'}`}
          className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} w-[112px]`}
          menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
          optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
          selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
          menuMinWidth={142}
          menuScale={canvasAiMenuScale}
        />
          </>
        )}
        {isCanvasVideoEnhancementItem && (
          <RoundedSelect
            data-no-drag="true"
            data-canvas-edit-control="true"
            value={canvasItem.ai?.enhancementKeepAudio === false ? 'no' : 'yes'}
            options={CANVAS_RIFE_KEEP_AUDIO_OPTIONS}
            onChange={(value) => updateCanvasAiGeneratorData(canvasItem.id, { enhancementKeepAudio: value !== 'no' })}
            labelClassName="text-center leading-none"
            chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
            title={canvasItem.ai?.enhancementKeepAudio === false ? '不保留音频' : '保留音频'}
            className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} w-[88px]`}
            menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
            optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
            selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
            menuMinWidth={112}
          menuScale={canvasAiMenuScale}
          />
        )}
        <RoundedSelect
          data-no-drag="true"
          data-canvas-edit-control="true"
          value={String(canvasItem.ai?.outputFormat || (isCanvasVideoEnhancementItem ? 'mp4' : 'png')).toLowerCase()}
          options={isCanvasVideoEnhancementItem ? CANVAS_RIFE_OUTPUT_FORMAT_OPTIONS : CANVAS_ESRGAN_IMAGE_FORMAT_OPTIONS}
          onChange={(value) => updateCanvasAiGeneratorData(canvasItem.id, { outputFormat: value })}
          labelClassName="text-center leading-none uppercase"
          chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
          title={`输出格式：${String(canvasItem.ai?.outputFormat || (isCanvasVideoEnhancementItem ? 'mp4' : 'png')).toUpperCase()}`}
          className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} w-[68px]`}
          menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
          optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
          selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
          menuMinWidth={88}
          menuScale={canvasAiMenuScale}
        />
      </>
    );
  }

  return null;
}

