import type React from 'react';
import {
  Film,
  Image as ImageIcon,
  LayoutGrid,
  Layers,
  Link,
  Palette,
  RefreshCw,
  Send,
  Type,
  Bot,
} from 'lucide-react';
import { RoundedSelect, type RoundedSelectOption } from './RoundedSelect';

const CANVAS_SIDE_TOOL_CLASS = 'flex h-9 w-[72px] shrink-0 items-center justify-start gap-1.5 overflow-hidden rounded-[10px] border border-stone-200 bg-white px-2.5 text-[10px] font-semibold text-stone-700 shadow-[0_2px_8px_rgba(24,24,27,0.06)] transition-[background-color,border-color,color] duration-150 hover:border-stone-300 hover:bg-stone-100 hover:text-stone-950 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-stone-600 dark:hover:bg-stone-800 dark:hover:text-white';
const CANVAS_SIDE_SELECT_CLASS = 'relative h-9 w-[72px] shrink-0 items-center justify-start gap-1.5 overflow-hidden rounded-[10px] border border-stone-200 bg-white px-2.5 text-[10px] font-semibold text-stone-700 shadow-[0_2px_8px_rgba(24,24,27,0.06)] transition-[width,background-color,border-color,color] duration-150 hover:w-[118px] hover:border-stone-300 hover:bg-stone-100 hover:text-stone-950 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:border-stone-600 dark:hover:bg-stone-800 dark:hover:text-white';
const CANVAS_SIDE_CHEVRON_FLOAT_CLASS = 'pointer-events-none absolute right-2.5 top-1/2 z-10 h-3 w-3 -translate-y-1/2 opacity-0 transition-opacity group-hover/rounded-select:opacity-100';
const CANVAS_SIDE_EXPAND_TOOL_CLASS = `group/canvas-tool ${CANVAS_SIDE_TOOL_CLASS} transition-[width,transform,background-color,border-color] hover:w-[118px] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45`;
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
  canOrganize: boolean;
  isAgentChatOpen: boolean;
  onToggleAgentChat: () => void;
  onAddImage: () => void;
  onAddFusion: () => void;
  onAddVideo: () => void;
  onAddFrameInterpolation: () => void;
  onAddEnhancement: (mediaType: 'image' | 'video') => void;
  onPromptChange: (value: string) => void;
  onWorkflowChange: (value: string) => void;
  onRunWorkflow: () => void | Promise<void>;
  onAddText: () => void;
  onOrganize: () => void;
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
  canOrganize,
  isAgentChatOpen,
  onToggleAgentChat,
  onAddImage,
  onAddFusion,
  onAddVideo,
  onAddFrameInterpolation,
  onAddEnhancement,
  onPromptChange,
  onWorkflowChange,
  onRunWorkflow,
  onAddText,
  onOrganize,
}: CanvasToolbarProps) {
  return (
    <div
      ref={toolbarRef}
      data-no-drag="true"
      data-canvas-toolbar="true"
      className="absolute z-[100055] flex -translate-y-1/2 flex-col items-end gap-1.5 bg-transparent transition-[top,right] duration-200"
      style={{ top, right }}
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
        <ImageIcon className="h-3.5 w-3.5 shrink-0 text-stone-500 dark:text-stone-400" />
        <span className="min-w-0 flex-1 truncate text-left">图片</span>
      </button>
      <button
        type="button"
        onClick={onAddFusion}
        className={CANVAS_SIDE_TOOL_CLASS}
        title="新增 AI 溶图节点"
      >
        <Layers className="h-3.5 w-3.5 shrink-0 text-stone-500 dark:text-stone-400" />
        <span className="min-w-0 flex-1 truncate text-left">溶图</span>
      </button>
      <button
        type="button"
        onClick={onAddVideo}
        className={CANVAS_SIDE_TOOL_CLASS}
        title="新增 AI 视频节点"
      >
        <Film className="h-3.5 w-3.5 shrink-0 text-stone-500 dark:text-stone-400" />
        <span className="min-w-0 flex-1 truncate text-left">视频</span>
      </button>
      <button
        type="button"
        onClick={onAddFrameInterpolation}
        className={CANVAS_SIDE_TOOL_CLASS}
        title="新增视频补帧节点"
      >
        <RefreshCw className="h-3.5 w-3.5 shrink-0 text-stone-500 dark:text-stone-400" />
        <span className="min-w-0 flex-1 truncate text-left">补帧</span>
      </button>
      <button
        type="button"
        onClick={() => onAddEnhancement('image')}
        className={CANVAS_SIDE_TOOL_CLASS}
        title="新增图片清晰度增强节点"
      >
        <ImageIcon className="h-3.5 w-3.5 shrink-0 text-stone-500 dark:text-stone-400" />
        <span className="min-w-0 flex-1 truncate text-left">图增强</span>
      </button>
      <button
        type="button"
        onClick={() => onAddEnhancement('video')}
        className={CANVAS_SIDE_TOOL_CLASS}
        title="新增视频清晰度增强节点"
      >
        <Film className="h-3.5 w-3.5 shrink-0 text-stone-500 dark:text-stone-400" />
        <span className="min-w-0 flex-1 truncate text-left">视增强</span>
      </button>
      <RoundedSelect
        data-no-drag="true"
        data-canvas-edit-control="true"
        value={promptValue}
        options={promptOptions}
        onChange={onPromptChange}
        icon={<Palette className="h-3.5 w-3.5 shrink-0 text-stone-500 dark:text-stone-400" />}
        chevronClassName={`${CANVAS_SIDE_CHEVRON_FLOAT_CLASS} text-stone-400`}
        labelClassName="text-left"
        collapsedLabel="节点预设"
        expandedLabel="节点预设"
        className={CANVAS_SIDE_SELECT_CLASS}
        menuClassName="!z-[100080] !min-w-0 !overflow-x-hidden !rounded-[12px] !border-stone-200 !bg-white !p-1.5 !text-[12px] !font-semibold !text-stone-700 shadow-xl shadow-black/10 dark:!border-stone-700 dark:!bg-stone-950 dark:!text-stone-100"
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
        icon={<Link className="h-3.5 w-3.5 shrink-0 text-stone-500 dark:text-stone-400" />}
        chevronClassName={`${CANVAS_SIDE_CHEVRON_FLOAT_CLASS} text-stone-400`}
        labelClassName="text-left"
        collapsedLabel="工作流"
        expandedLabel="工作流"
        className={CANVAS_SIDE_SELECT_CLASS}
        menuClassName="!z-[100080] !min-w-0 !overflow-x-hidden !rounded-[12px] !border-stone-200 !bg-white !p-1.5 !text-[12px] !font-semibold !text-stone-700 shadow-xl shadow-black/10 dark:!border-stone-700 dark:!bg-stone-950 dark:!text-stone-100"
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
        <Send className="h-3.5 w-3.5 shrink-0 text-stone-500 dark:text-stone-400" />
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
        <Type className="h-3.5 w-3.5 shrink-0 text-stone-500 dark:text-stone-400" />
        <span className="min-w-0 flex-1 truncate text-left">文字</span>
      </button>
      <button
        type="button"
        onClick={onToggleAgentChat}
        className={`${CANVAS_SIDE_TOOL_CLASS} ${
          isAgentChatOpen
            ? '!border-stone-900 !bg-stone-900 !text-white dark:!border-stone-100 dark:!bg-stone-100 dark:!text-stone-950'
            : ''
        }`}
        title={isAgentChatOpen ? '关闭 Agent 聊天' : '打开 Agent 聊天'}
      >
        <Bot className={`h-3.5 w-3.5 shrink-0 ${isAgentChatOpen ? 'text-current' : 'text-stone-500 dark:text-stone-400'}`} />
        <span className="min-w-0 flex-1 truncate text-left">Agent</span>
      </button>
      <button
        type="button"
        onClick={onOrganize}
        disabled={!canOrganize}
        className={`${CANVAS_SIDE_TOOL_CLASS} disabled:cursor-not-allowed disabled:opacity-45`}
        title="一键整理画布，多选时只整理选中节点"
      >
        <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-stone-500 dark:text-stone-400" />
        <span className="min-w-0 flex-1 truncate text-left">整理</span>
      </button>
    </div>
  );
}

