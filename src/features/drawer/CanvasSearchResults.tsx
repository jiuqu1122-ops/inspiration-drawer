import { convertFileSrc } from '@tauri-apps/api/core';
import { motion } from 'framer-motion';
import { Check, ChevronRight, Film, Image as ImageIcon, Play, Plus } from 'lucide-react';

import type { BufferItem } from '../../types';
import {
  getCanvasDrawerMediaPreviewSource,
  isCanvasDrawerMediaItem,
} from '../canvasDrawerMedia';
import { CANVAS_SEARCH_CANDIDATE_LIMIT } from './useDrawerSearch';

type CanvasSearchResultsProps = {
  candidateLimit: number;
  candidates: BufferItem[];
  sourceItemIds: Set<string>;
  total: number;
  workflowTargetLabel?: string;
  onCancelWorkflowTarget: () => void;
  onLoadMore: () => void;
  onSelect: (candidate: BufferItem) => void;
};

export function CanvasSearchResults({
  candidateLimit,
  candidates,
  sourceItemIds,
  total,
  workflowTargetLabel,
  onCancelWorkflowTarget,
  onLoadMore,
  onSelect,
}: CanvasSearchResultsProps) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="relative z-20 shrink-0 overflow-hidden border-b border-stone-200/60 bg-white/72 backdrop-blur-xl dark:border-white/8 dark:bg-stone-900/72"
      onPointerDown={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
    >
      {workflowTargetLabel && (
        <div className="flex items-center gap-2 px-4 pt-2 text-[10px] font-black text-stone-500 dark:text-white/52">
          <ImageIcon className="h-3.5 w-3.5 text-emerald-500" />
          <span className="min-w-0 flex-1 truncate">
            正在为「{workflowTargetLabel}」选择图片
          </span>
          <button
            type="button"
            className="rounded-full px-2 py-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-white/10 dark:hover:text-white"
            onClick={onCancelWorkflowTarget}
          >
            取消
          </button>
        </div>
      )}
      {candidates.length > 0 ? (
        <div className={`${candidateLimit > CANVAS_SEARCH_CANDIDATE_LIMIT ? 'grid auto-cols-max grid-flow-col grid-rows-2' : 'flex'} w-full gap-2 overflow-x-auto px-4 pb-1.5 pt-2 [scrollbar-color:rgba(148,163,184,0.65)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300/80 dark:[&::-webkit-scrollbar-thumb]:bg-stone-600/80`}>
          {candidates.map(candidate => {
            if (!isCanvasDrawerMediaItem(candidate)) return null;
            if (workflowTargetLabel && candidate.type !== 'image') return null;
            const preview = getCanvasDrawerMediaPreviewSource(candidate)
              || (candidate.type === 'image' && candidate.path ? convertFileSrc(candidate.path) : '');
            const mediaLabel = candidate.type === 'video' ? '视频' : '图片';
            const isOnCanvas = sourceItemIds.has(candidate.id);
            return (
              <button
                key={candidate.id}
                type="button"
                onClick={() => onSelect(candidate)}
                className="group relative h-[58px] w-[58px] shrink-0 overflow-hidden rounded-[12px] border border-stone-200/80 bg-stone-100 shadow-sm transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-[0_6px_16px_rgba(43,85,145,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/45 dark:border-white/10 dark:bg-stone-800 dark:hover:border-blue-400/55"
                title={workflowTargetLabel && candidate.type === 'image'
                  ? `设置到「${workflowTargetLabel}」`
                  : `加入画布：${candidate.name || candidate.content || mediaLabel}`}
              >
                {preview ? (
                  <img
                    src={preview}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-150 group-hover:scale-105"
                    draggable={false}
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-stone-400 dark:text-stone-500">
                    <Film className="h-5 w-5" />
                  </span>
                )}
                {candidate.type === 'video' && (
                  <span className="pointer-events-none absolute bottom-1.5 left-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-white shadow-sm">
                    <Play className="h-2.5 w-2.5 fill-current" />
                  </span>
                )}
                {!isOnCanvas && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/12 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/92 text-blue-600 shadow-md backdrop-blur-sm dark:bg-stone-900/90 dark:text-blue-300">
                      <Plus className="h-4 w-4" strokeWidth={2.4} />
                    </span>
                  </span>
                )}
                {isOnCanvas && (
                  <span className="pointer-events-none absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-white/80 bg-emerald-500 text-white shadow-sm dark:border-stone-800" title="已在画布">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
          {total > candidates.length && (
            <button
              type="button"
              onClick={onLoadMore}
              className="group flex h-[58px] min-w-[84px] shrink-0 flex-col items-center justify-center rounded-[12px] border border-dashed border-blue-200/90 bg-blue-50/55 px-2 text-center text-blue-600 transition-colors hover:border-blue-300 hover:bg-blue-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/45 dark:border-blue-400/25 dark:bg-blue-400/8 dark:text-blue-300 dark:hover:border-blue-400/45 dark:hover:bg-blue-400/14"
              title="继续显示搜索结果"
            >
              <span className="flex items-center gap-0.5 text-[10px] font-black">
                加载更多 <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="mt-0.5 text-[8px] font-bold opacity-70">
                还有 {total - candidates.length} 个
              </span>
            </button>
          )}
        </div>
      ) : (
        <div className="flex h-[58px] items-center justify-center gap-2 text-[10px] font-bold text-stone-400 dark:text-stone-500">
          <ImageIcon className="h-4 w-4 opacity-65" />
          <span>没有匹配的图片或视频</span>
        </div>
      )}
    </motion.div>
  );
}
