import type React from 'react';
import {
  Box,
  Film,
  Image as ImageIcon,
  Lightbulb,
  Layers,
  Link,
  Palette,
  RefreshCw,
  Send,
  Type,
  Bot,
} from 'lucide-react';
import {
  getCanvasChatOffsetRight,
  toggleCanvasChatVisibility,
  useCanvasChatVisibility,
} from '../features/chat/runtime/canvasChatVisibility';
import { RoundedSelect, type RoundedSelectOption } from './RoundedSelect';

const CANVAS_SIDE_SURFACE_CLASS = 'border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-100 hover:text-stone-950 dark:border-[#454545] dark:bg-[#303030] dark:text-[#d4d4d4] dark:hover:border-[#565656] dark:hover:bg-[#383838] dark:hover:text-white';
const CANVAS_SIDE_TOOL_CLASS = `flex h-9 w-[72px] shrink-0 items-center justify-start gap-1.5 overflow-hidden rounded-[10px] border px-2.5 text-[10px] font-semibold transition-[background-color,border-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/35 ${CANVAS_SIDE_SURFACE_CLASS}`;
const CANVAS_SIDE_SELECT_CLASS = `relative h-9 w-[72px] shrink-0 items-center justify-start gap-1.5 overflow-hidden rounded-[10px] border px-2.5 text-[10px] font-semibold transition-[width,background-color,border-color,color] duration-150 hover:w-[118px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/35 ${CANVAS_SIDE_SURFACE_CLASS}`;
const CANVAS_SIDE_CHEVRON_FLOAT_CLASS = 'pointer-events-none absolute right-2.5 top-1/2 z-10 h-3 w-3 -translate-y-1/2 opacity-0 transition-opacity group-hover/rounded-select:opacity-100';
const CANVAS_SIDE_EXPAND_TOOL_CLASS = `group/canvas-tool ${CANVAS_SIDE_TOOL_CLASS} transition-[width,background-color,border-color,color] hover:w-[118px] disabled:cursor-not-allowed disabled:opacity-45`;
const CANVAS_SIDE_PRESET_MENU_WIDTH = 360;

type CanvasToolbarProps = {
  toolbarRef: React.RefObject<HTMLDivElement | null>;
  top: string;
  right?: number;
  navigator: React.ReactNode;
  promptValue: string;
  promptOptions: RoundedSelectOption[];
  workflowValue: string;
  workflowOptions: RoundedSelectOption[];
  hasWorkflow: boolean;
  onAddImage: () => void;
  showThreeScene?: boolean;
  onCreateThreeScene: () => void;
  onAddFusion: () => void;
  onAddVideo: () => void;
  onAddFrameInterpolation: () => void;
  onAddEnhancement: (mediaType: 'image' | 'video') => void;
  onPromptChange: (value: string) => void;
  onWorkflowChange: (value: string) => void;
  onRunWorkflow: () => void | Promise<void>;
  onAddText: () => void;
  onOpenInspirationSpace: () => void | Promise<void>;
};

export function CanvasToolbar({
  toolbarRef,
  top,
  right = 16,
  navigator,
  promptValue,
  promptOptions,
  workflowValue,
  workflowOptions,
  hasWorkflow,
  onAddImage,
  showThreeScene = false,
  onCreateThreeScene,
  onAddFusion,
  onAddVideo,
  onAddFrameInterpolation,
  onAddEnhancement,
  onPromptChange,
  onWorkflowChange,
  onRunWorkflow,
  onAddText,
  onOpenInspirationSpace,
}: CanvasToolbarProps) {
  const isAgentChatOpen = useCanvasChatVisibility();
  return (
    <div
      ref={toolbarRef}
      data-no-drag="true"
      data-canvas-toolbar="true"
      className="absolute z-[100055] flex -translate-y-1/2 flex-col items-end gap-1.5 bg-transparent transition-[top,right] duration-200"
      data-canvas-chat-offset-base={right}
      style={{ top, right: getCanvasChatOffsetRight(right) }}
      onPointerDown={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
    >
      {navigator}
      <button
        type="button"
        onClick={onAddImage}
        className={CANVAS_SIDE_TOOL_CLASS}
        title="新增 AI 生图节点"
      >
        <ImageIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">图片</span>
      </button>
      {showThreeScene && (
        <button
          type="button"
          onClick={onCreateThreeScene}
          className={CANVAS_SIDE_TOOL_CLASS}
          title="新增 3D 场景节点"
        >
          <Box className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">3D</span>
        </button>
      )}
      <button
        type="button"
        onClick={onAddFusion}
        className={CANVAS_SIDE_TOOL_CLASS}
        title="新增 AI 溶图节点"
      >
        <Layers className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">溶图</span>
      </button>
      <button
        type="button"
        onClick={onAddVideo}
        className={CANVAS_SIDE_TOOL_CLASS}
        title="新增 AI 视频节点"
      >
        <Film className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">视频</span>
      </button>
      <button
        type="button"
        onClick={onAddFrameInterpolation}
        className={CANVAS_SIDE_TOOL_CLASS}
        title="新增视频补帧节点"
      >
        <RefreshCw className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">补帧</span>
      </button>
      <button
        type="button"
        onClick={() => onAddEnhancement('image')}
        className={CANVAS_SIDE_TOOL_CLASS}
        title="新增图片清晰度增强节点"
      >
        <ImageIcon className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">图增强</span>
      </button>
      <button
        type="button"
        onClick={() => onAddEnhancement('video')}
        className={CANVAS_SIDE_TOOL_CLASS}
        title="新增视频清晰度增强节点"
      >
        <Film className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">视增强</span>
      </button>
      <RoundedSelect
        data-no-drag="true"
        data-canvas-edit-control="true"
        value={promptValue}
        options={promptOptions}
        onChange={onPromptChange}
        icon={<Palette className="h-3.5 w-3.5 shrink-0" />}
        chevronClassName={`${CANVAS_SIDE_CHEVRON_FLOAT_CLASS} text-stone-400`}
        labelClassName="text-left"
        collapsedLabel="节点预设"
        expandedLabel="节点预设"
        className={CANVAS_SIDE_SELECT_CLASS}
        menuClassName="!z-[100080] !min-w-0 !overflow-x-hidden !rounded-[12px] !border-stone-200 !bg-white !p-1.5 !text-[12px] !font-semibold !text-stone-700 shadow-[0_12px_28px_rgba(24,24,27,0.10)] dark:!border-[#484848] dark:!bg-[#303030] dark:!text-stone-100"
        optionClassName="!min-w-0 !rounded-[8px] !px-3 !py-2 hover:!bg-stone-100 hover:!text-stone-950 dark:hover:!bg-stone-800 dark:hover:!text-white"
        selectedOptionClassName="!bg-stone-900 !text-white dark:!bg-stone-100 dark:!text-stone-950"
        title="选择节点预设"
        menuMinWidth={CANVAS_SIDE_PRESET_MENU_WIDTH}
        menuPlacement="left"
      />
      <RoundedSelect
        data-no-drag="true"
        data-canvas-edit-control="true"
        value={workflowValue}
        options={workflowOptions}
        onChange={onWorkflowChange}
        icon={<Link className="h-3.5 w-3.5 shrink-0" />}
        chevronClassName={`${CANVAS_SIDE_CHEVRON_FLOAT_CLASS} text-stone-400`}
        labelClassName="text-left"
        collapsedLabel="工作流"
        expandedLabel="工作流"
        className={CANVAS_SIDE_SELECT_CLASS}
        menuClassName="!z-[100080] !min-w-0 !overflow-x-hidden !rounded-[12px] !border-stone-200 !bg-white !p-1.5 !text-[12px] !font-semibold !text-stone-700 shadow-[0_12px_28px_rgba(24,24,27,0.10)] dark:!border-[#484848] dark:!bg-[#303030] dark:!text-stone-100"
        optionClassName="!min-w-0 !rounded-[8px] !px-3 !py-2 hover:!bg-stone-100 hover:!text-stone-950 dark:hover:!bg-stone-800 dark:hover:!text-white"
        selectedOptionClassName="!bg-stone-900 !text-white dark:!bg-stone-100 dark:!text-stone-950"
        title="选择或保存工作流"
        menuMinWidth={CANVAS_SIDE_PRESET_MENU_WIDTH}
        menuPlacement="left"
      />
      <button
        type="button"
        onClick={() => void onRunWorkflow()}
        disabled={!hasWorkflow}
        className={CANVAS_SIDE_EXPAND_TOOL_CLASS}
        title="运行选中的工作流模块"
      >
        <Send className="h-3.5 w-3.5 shrink-0" />
        <span className="flex min-w-0 flex-1 items-center overflow-hidden text-left">
          <span className="shrink-0">运行</span>
          <span className="shrink-0 group-hover/canvas-tool:hidden">‑</span>
          <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity] duration-200 group-hover/canvas-tool:max-w-[44px] group-hover/canvas-tool:opacity-100">工作流</span>
        </span>
      </button>
      <button
        type="button"
        onClick={onAddText}
        className={CANVAS_SIDE_TOOL_CLASS}
        title="添加文字卡片"
      >
        <Type className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">文字</span>
      </button>
      <button
        type="button"
        onClick={toggleCanvasChatVisibility}
        className={`${CANVAS_SIDE_TOOL_CLASS} ${
          isAgentChatOpen
            ? '!border-[#262626] !bg-[#262626] !text-white dark:!border-[#e5e5e5] dark:!bg-[#e5e5e5] dark:!text-[#202020]'
            : ''
        }`}
        title={isAgentChatOpen ? '关闭 Chat' : '打开 Chat'}
      >
        <Bot className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">Chat</span>
      </button>
      <button
        type="button"
        onClick={() => void onOpenInspirationSpace()}
        className={`${CANVAS_SIDE_TOOL_CLASS} !w-[88px]`}
        title="打开灵感空间，浏览和分享节点预设、工作流与提示词"
      >
        <Lightbulb className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">灵感空间</span>
      </button>
    </div>
  );
}

