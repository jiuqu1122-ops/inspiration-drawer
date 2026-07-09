import type React from 'react';
import {
  Film,
  Image as ImageIcon,
  LayoutGrid,
  Link,
  Palette,
  RefreshCw,
  Send,
  Type,
  Bot,
} from 'lucide-react';
import { RoundedSelect, type RoundedSelectOption } from './RoundedSelect';

const CANVAS_SIDE_TOOL_CLASS = 'flex h-10 w-[68px] shrink-0 items-center justify-start gap-1.5 overflow-hidden rounded-full border bg-white/88 px-2 text-[10px] font-black text-stone-700 shadow-[0_8px_20px_rgba(15,23,42,0.10)] backdrop-blur-2xl transition-[transform,background-color,border-color] duration-200 hover:-translate-y-px dark:border-white/10 dark:bg-stone-950/70 dark:text-stone-100 dark:hover:bg-stone-900/90';
const CANVAS_SIDE_SELECT_CLASS = 'relative h-10 w-[68px] shrink-0 items-center justify-start gap-1.5 overflow-hidden rounded-full border bg-white/88 px-2 text-[10px] font-black text-stone-700 shadow-[0_8px_20px_rgba(15,23,42,0.10)] backdrop-blur-2xl transition-[width,transform,background-color,border-color] duration-200 hover:w-[118px] hover:-translate-y-px dark:border-white/10 dark:bg-stone-950/70 dark:text-stone-100 dark:hover:bg-stone-900/90';
const CANVAS_SIDE_CHEVRON_FLOAT_CLASS = 'pointer-events-none absolute right-2.5 top-1/2 z-10 h-3 w-3 -translate-y-1/2 rounded-full bg-white/90 opacity-0 shadow-sm ring-2 ring-white/80 transition-opacity group-hover/rounded-select:opacity-100 dark:bg-stone-950/90 dark:ring-stone-950/70';
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
        className={`${CANVAS_SIDE_TOOL_CLASS} border-violet-200/80 hover:border-violet-300 hover:bg-violet-50/90 dark:hover:border-violet-400/30`}
        title="新增 AI 生图节点"
      >
        <ImageIcon className="h-3.5 w-3.5 shrink-0 text-violet-500 dark:text-violet-300" />
        <span className="min-w-0 flex-1 truncate text-left">图片</span>
      </button>
      <button
        type="button"
        onClick={onAddVideo}
        className={`${CANVAS_SIDE_TOOL_CLASS} border-emerald-200/80 hover:border-emerald-300 hover:bg-emerald-50/90 dark:hover:border-emerald-400/30`}
        title="新增 AI 视频节点"
      >
        <Film className="h-3.5 w-3.5 shrink-0 text-emerald-500 dark:text-emerald-300" />
        <span className="min-w-0 flex-1 truncate text-left">视频</span>
      </button>
      <button
        type="button"
        onClick={onAddFrameInterpolation}
        className={`${CANVAS_SIDE_TOOL_CLASS} border-cyan-200/80 hover:border-cyan-300 hover:bg-cyan-50/90 dark:hover:border-cyan-400/30`}
        title="新增视频补帧节点"
      >
        <RefreshCw className="h-3.5 w-3.5 shrink-0 text-cyan-500 dark:text-cyan-300" />
        <span className="min-w-0 flex-1 truncate text-left">补帧</span>
      </button>
      <button
        type="button"
        onClick={() => onAddEnhancement('image')}
        className={`${CANVAS_SIDE_TOOL_CLASS} border-violet-200/80 hover:border-violet-300 hover:bg-violet-50/90 dark:hover:border-violet-400/30`}
        title="新增图片清晰度增强节点"
      >
        <ImageIcon className="h-3.5 w-3.5 shrink-0 text-violet-500 dark:text-violet-300" />
        <span className="min-w-0 flex-1 truncate text-left">图增强</span>
      </button>
      <button
        type="button"
        onClick={() => onAddEnhancement('video')}
        className={`${CANVAS_SIDE_TOOL_CLASS} border-fuchsia-200/80 hover:border-fuchsia-300 hover:bg-fuchsia-50/90 dark:hover:border-fuchsia-400/30`}
        title="新增视频清晰度增强节点"
      >
        <Film className="h-3.5 w-3.5 shrink-0 text-fuchsia-500 dark:text-fuchsia-300" />
        <span className="min-w-0 flex-1 truncate text-left">视增强</span>
      </button>
      <RoundedSelect
        data-no-drag="true"
        data-canvas-edit-control="true"
        value={promptValue}
        options={promptOptions}
        onChange={onPromptChange}
        icon={<Palette className="h-3.5 w-3.5 shrink-0 text-sky-500 dark:text-sky-300" />}
        chevronClassName={`${CANVAS_SIDE_CHEVRON_FLOAT_CLASS} text-sky-500/80 dark:text-sky-300/80`}
        labelClassName="text-left"
        collapsedLabel="节点预设"
        expandedLabel="节点预设"
        className={`${CANVAS_SIDE_SELECT_CLASS} border-sky-200/80 hover:border-sky-300 hover:bg-sky-50/90 dark:hover:border-sky-400/30`}
        menuClassName="!z-[100080] !min-w-0 !overflow-x-hidden !rounded-[18px] !border-sky-100/80 !bg-white/97 !p-1.5 !text-[12px] !font-bold !text-stone-700 shadow-2xl shadow-black/16 dark:!border-sky-400/20 dark:!bg-stone-950/97 dark:!text-stone-100"
        optionClassName="!min-w-0 !rounded-[12px] !px-3 !py-2 hover:!bg-sky-50 hover:!text-sky-800 dark:hover:!bg-white/10 dark:hover:!text-white"
        selectedOptionClassName="!bg-sky-50 !text-sky-800 dark:!bg-sky-400/12 dark:!text-sky-100"
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
        icon={<Link className="h-3.5 w-3.5 shrink-0 text-teal-500 dark:text-teal-300" />}
        chevronClassName={`${CANVAS_SIDE_CHEVRON_FLOAT_CLASS} text-teal-500/80 dark:text-teal-300/80`}
        labelClassName="text-left"
        collapsedLabel="工作流"
        expandedLabel="工作流"
        className={`${CANVAS_SIDE_SELECT_CLASS} border-teal-200/80 hover:border-teal-300 hover:bg-teal-50/90 dark:hover:border-teal-400/30`}
        menuClassName="!z-[100080] !min-w-0 !overflow-x-hidden !rounded-[18px] !border-teal-100/80 !bg-white/97 !p-1.5 !text-[12px] !font-bold !text-stone-700 shadow-2xl shadow-black/16 dark:!border-teal-400/20 dark:!bg-stone-950/97 dark:!text-stone-100"
        optionClassName="!min-w-0 !rounded-[12px] !px-3 !py-2 hover:!bg-teal-50 hover:!text-teal-800 dark:hover:!bg-white/10 dark:hover:!text-white"
        selectedOptionClassName="!bg-teal-50 !text-teal-800 dark:!bg-teal-400/12 dark:!text-teal-100"
        title="选择或保存工作流"
        menuMinWidth={CANVAS_SIDE_PRESET_MENU_WIDTH}
        menuPlacement="left"
      />
      <button
        type="button"
        onClick={() => void onRunWorkflow()}
        disabled={!hasWorkflow}
        className={`${CANVAS_SIDE_EXPAND_TOOL_CLASS} border-indigo-200/80 hover:border-indigo-300 hover:bg-indigo-50/90 dark:hover:border-indigo-400/30`}
        title="运行选中的工作流模块"
      >
        <Send className="h-3.5 w-3.5 shrink-0 text-indigo-500 dark:text-indigo-300" />
        <span className="flex min-w-0 flex-1 items-center overflow-hidden text-left">
          <span className="shrink-0">运行</span>
          <span className="shrink-0 group-hover/canvas-tool:hidden">‑</span>
          <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity] duration-200 group-hover/canvas-tool:max-w-[44px] group-hover/canvas-tool:opacity-100">工作流</span>
        </span>
      </button>
      <button
        type="button"
        onClick={onAddText}
        className={`${CANVAS_SIDE_TOOL_CLASS} border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/90 dark:hover:border-slate-400/30`}
        title="添加文字卡片"
      >
        <Type className="h-3.5 w-3.5 shrink-0 text-slate-600 dark:text-slate-300" />
        <span className="min-w-0 flex-1 truncate text-left">文字</span>
      </button>
      <button
        type="button"
        onClick={onToggleAgentChat}
        className={`${CANVAS_SIDE_TOOL_CLASS} ${
          isAgentChatOpen
            ? 'border-blue-300 bg-blue-50/95 text-blue-600 ring-2 ring-blue-100/80 dark:border-blue-400/35 dark:bg-blue-400/12 dark:text-blue-200 dark:ring-blue-400/10'
            : 'border-blue-200/80 bg-white/88 text-blue-500 dark:hover:border-blue-400/30'
        }`}
        title={isAgentChatOpen ? '关闭 Agent 聊天' : '打开 Agent 聊天'}
      >
        <Bot className="h-3.5 w-3.5 shrink-0 text-blue-500 dark:text-blue-300" />
        <span className="min-w-0 flex-1 truncate text-left">Agent</span>
      </button>
      <button
        type="button"
        onClick={onOrganize}
        disabled={!canOrganize}
        className={`${CANVAS_SIDE_TOOL_CLASS} border-orange-200/80 hover:border-orange-300 hover:bg-orange-50/90 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 dark:hover:border-orange-400/30`}
        title="一键整理画布，多选时只整理选中节点"
      >
        <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-orange-500 dark:text-orange-300" />
        <span className="min-w-0 flex-1 truncate text-left">整理</span>
      </button>
    </div>
  );
}

