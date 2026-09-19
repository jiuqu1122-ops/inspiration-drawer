import { useEffect, useState } from 'react';
import { RoundedSelect, type RoundedSelectOption } from './RoundedSelect';
import {
  CANVAS_AI_NODE_CHEVRON_CLASS,
  CANVAS_AI_NODE_COUNT_SELECT_CLASS,
  CANVAS_AI_NODE_SELECT_ACTIVE_CLASS,
  CANVAS_AI_NODE_SELECT_MENU_CLASS,
  CANVAS_AI_NODE_SELECT_OPTION_CLASS,
  CANVAS_AI_NODE_TEXT_SELECT_CLASS,
} from './canvasAiNodeControlStyles';
import {
  CANVAS_AI_COUNT_OPTIONS,
  CANVAS_AI_VIDEO_INPUT_MODE_OPTIONS,
  CANVAS_VIDEO_CFR_MODE_OPTIONS,
} from '../features/canvasAiConfig';

type CanvasGeneratorControlsProps = {
  mediaType: 'image' | 'video';
  menuScale: number;
  modelValue: string;
  modelOptions: RoundedSelectOption[];
  modelTitle: string;
  onModelChange: (value: string) => void;
  aspectRatioValue: string;
  aspectRatioOptions: RoundedSelectOption[];
  aspectRatioTitle: string;
  useWideAspectRatioMenu: boolean;
  onAspectRatioChange: (value: string) => void;
  videoAspectRatioMode?: 'list' | 'any' | 'unspecified';
  supportsImageResolution: boolean;
  imageResolutionValue: string;
  imageResolutionOptions: RoundedSelectOption[];
  onImageResolutionChange: (value: string) => void;
  outputFormatValue: string;
  outputFormatOptions: RoundedSelectOption[];
  outputFormatTitle: string;
  onOutputFormatChange: (value: string) => void;
  videoResolutionValue: string;
  videoResolutionOptions: RoundedSelectOption[];
  onVideoResolutionChange: (value: string) => void;
  videoCapabilitiesAvailable?: boolean;
  videoSupportsFirstLastFrame: boolean;
  videoInputMode: 'REF' | 'FLF';
  onVideoInputModeChange: (value: string) => void;
  videoDuration: number;
  videoDurationOptions: RoundedSelectOption[];
  onVideoDurationChange: (value: string) => void;
  videoCfrMode: string;
  onVideoCfrModeChange: (value: string) => void;
  count: number;
  countOptions?: RoundedSelectOption[];
  onCountChange: (value: string) => void;
};

export function CanvasGeneratorControls({
  mediaType,
  menuScale,
  modelValue,
  modelOptions,
  modelTitle,
  onModelChange,
  aspectRatioValue,
  aspectRatioOptions,
  aspectRatioTitle,
  useWideAspectRatioMenu,
  onAspectRatioChange,
  videoAspectRatioMode,
  supportsImageResolution,
  imageResolutionValue,
  imageResolutionOptions,
  onImageResolutionChange,
  outputFormatValue,
  outputFormatOptions,
  outputFormatTitle,
  onOutputFormatChange,
  videoResolutionValue,
  videoResolutionOptions,
  onVideoResolutionChange,
  videoCapabilitiesAvailable = true,
  videoSupportsFirstLastFrame,
  videoInputMode,
  onVideoInputModeChange,
  videoDuration,
  videoDurationOptions,
  onVideoDurationChange,
  videoCfrMode,
  onVideoCfrModeChange,
  count,
  countOptions = CANVAS_AI_COUNT_OPTIONS,
  onCountChange,
}: CanvasGeneratorControlsProps) {
  const [customAspectRatio, setCustomAspectRatio] = useState(aspectRatioValue);
  useEffect(() => {
    if (videoAspectRatioMode === 'any') setCustomAspectRatio(aspectRatioValue);
  }, [aspectRatioValue, videoAspectRatioMode]);

  const commitCustomAspectRatio = (value: string) => {
    const normalized = value.trim();
    if (/^[1-9]\d{0,4}:[1-9]\d{0,4}$/.test(normalized)) {
      onAspectRatioChange(normalized);
      return;
    }
    setCustomAspectRatio(aspectRatioValue);
  };

  return (
    <>
      <RoundedSelect
        data-no-drag="true"
        data-canvas-edit-control="true"
        deferChange
        value={modelValue}
        options={modelOptions}
        onChange={onModelChange}
        labelClassName={`${mediaType === 'video' ? 'max-w-[104px]' : 'max-w-[150px]'} truncate text-center leading-none`}
        chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
        title={modelTitle}
        className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} ${mediaType === 'video' ? 'max-w-[132px]' : 'max-w-[178px]'}`}
        menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
        optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
        selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
        menuMinWidth={260}
        menuScale={menuScale}
      />
      {mediaType === 'video' && !videoCapabilitiesAvailable ? (
        <span
          className="truncate text-[10px] font-semibold text-amber-700 dark:text-amber-100"
          title="模型能力尚未加载，请刷新模型"
        >
          能力未加载
        </span>
      ) : (
      <>
      <RoundedSelect
        data-no-drag="true"
        deferChange
        value={aspectRatioValue}
        options={aspectRatioOptions}
        onChange={onAspectRatioChange}
        labelClassName="text-center leading-none"
        chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
        title={aspectRatioTitle}
        className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} ${useWideAspectRatioMenu ? 'w-[156px]' : 'w-[62px]'}`}
        menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
        optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
        selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
        menuMinWidth={useWideAspectRatioMenu ? 188 : 104}
        menuScale={menuScale}
        optionVisual="aspect-ratio"
      />
      {mediaType === 'video' && videoAspectRatioMode === 'any' && (
        <input
          data-no-drag="true"
          data-canvas-edit-control="true"
          value={customAspectRatio}
          onChange={(event) => {
            const value = event.target.value;
            setCustomAspectRatio(value);
            if (/^[1-9]\d{0,4}:[1-9]\d{0,4}$/.test(value.trim())) onAspectRatioChange(value.trim());
          }}
          onBlur={(event) => commitCustomAspectRatio(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitCustomAspectRatio(event.currentTarget.value);
          }}
          placeholder="W:H"
          aria-label="自定义视频比例"
          title="自定义比例，例如 2:1 或 5:4"
          className="h-[28px] w-[58px] rounded-full border border-stone-950/10 bg-transparent px-2 text-center text-[11px] outline-none focus:border-violet-500/50 dark:border-white/10"
        />
      )}
      {supportsImageResolution && (
        <RoundedSelect
          data-no-drag="true"
          deferChange
          value={imageResolutionValue}
          options={imageResolutionOptions}
          onChange={onImageResolutionChange}
          labelClassName="text-center leading-none"
          chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
          title={`清晰度：${imageResolutionValue.toUpperCase()}`}
          className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} w-[62px]`}
          menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
          optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
          selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
          menuMinWidth={78}
          menuScale={menuScale}
        />
      )}
      {mediaType !== 'video' ? (
        <RoundedSelect
          data-no-drag="true"
          deferChange
          value={outputFormatValue}
          options={outputFormatOptions}
          onChange={onOutputFormatChange}
          labelClassName="text-center leading-none uppercase"
          chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
          title={outputFormatTitle}
          className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} w-[68px]`}
          menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
          optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
          selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
          menuMinWidth={78}
          menuScale={menuScale}
        />
      ) : (
        <>
          {videoResolutionOptions.length > 0 && <RoundedSelect
            data-no-drag="true"
            deferChange
            value={videoResolutionValue}
            options={videoResolutionOptions}
            onChange={onVideoResolutionChange}
            labelClassName="text-center leading-none"
            chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
            title={`分辨率：${videoResolutionValue}`}
            className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} w-[70px]`}
            menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
            optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
            selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
            menuMinWidth={86}
            menuScale={menuScale}
          />}
          {videoSupportsFirstLastFrame && (
            <RoundedSelect
              data-no-drag="true"
              deferChange
              value={videoInputMode}
              options={CANVAS_AI_VIDEO_INPUT_MODE_OPTIONS}
              onChange={onVideoInputModeChange}
              labelClassName="text-center leading-none"
              chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
              title={`参考模式：${videoInputMode === 'FLF' ? '首尾帧' : '参考图'}`}
              className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} w-[76px]`}
              menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
              optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
              selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
              menuMinWidth={92}
              menuScale={menuScale}
            />
          )}
          {videoDurationOptions.length > 0 && <RoundedSelect
            data-no-drag="true"
            deferChange
            value={String(videoDuration)}
            options={videoDurationOptions}
            onChange={onVideoDurationChange}
            labelClassName="text-center leading-none"
            chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
            title={`时长：${videoDuration} 秒`}
            className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} w-[64px]`}
            menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
            optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
            selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
            menuMinWidth={82}
            menuScale={menuScale}
          />}
          <RoundedSelect
            data-no-drag="true"
            data-canvas-edit-control="true"
            deferChange
            value={videoCfrMode}
            options={CANVAS_VIDEO_CFR_MODE_OPTIONS}
            onChange={onVideoCfrModeChange}
            labelClassName="text-center leading-none"
            chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
            title="生成后检测帧率；自动模式只在需要时转 CFR"
            className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} w-[96px]`}
            menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
            optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
            selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
            menuMinWidth={132}
            menuScale={menuScale}
          />
        </>
      )}
      <RoundedSelect
        data-no-drag="true"
        deferChange
        value={String(count)}
        options={countOptions}
        onChange={onCountChange}
        labelClassName="text-center text-[11px] leading-none"
        chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
        title={`${mediaType === 'video' ? '条数' : '张数'}：${count}`}
        className={CANVAS_AI_NODE_COUNT_SELECT_CLASS}
        menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
        optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
        selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS}
        menuMinWidth={86}
        menuScale={menuScale}
      />
      </>
      )}
    </>
  );
}
