import {
  Brush,
  Download,
  Film,
  Image as ImageIcon,
  LayoutGrid,
  Sparkles,
  X,
} from 'lucide-react';
import type { BufferItem } from '../types';
import type { CanvasImageItem } from '../features/canvasModel';

const CANVAS_GENERATED_LIST_RENDER_LIMIT = 60;

export type CanvasGeneratedListEntry = {
  id: string;
  canvasItem: CanvasImageItem;
  item: BufferItem;
  ai?: NonNullable<CanvasImageItem['ai']>;
};

type CanvasGeneratedListProps = {
  visible: boolean;
  items: CanvasGeneratedListEntry[];
  selectedIds: ReadonlySet<string>;
  getSource: (item: BufferItem) => string;
  getErrorSummary: (error?: string | null) => string;
  onOpen: () => void;
  onClose: () => void;
  onFitItems: (ids: string[]) => void;
  onSelectItem: (item: CanvasImageItem) => void;
  onOpenBrush: (canvasItemId: string) => void | Promise<void>;
  onDownload: (item: BufferItem) => void | Promise<void>;
};

export function CanvasGeneratedList({
  visible,
  items,
  selectedIds,
  getSource,
  getErrorSummary,
  onOpen,
  onClose,
  onFitItems,
  onSelectItem,
  onOpenBrush,
  onDownload,
}: CanvasGeneratedListProps) {
  if (!visible) {
    return (
      <button
        type="button"
        data-no-drag="true"
        onClick={onOpen}
        className="absolute bottom-4 left-4 z-[100050] flex h-9 items-center gap-1.5 rounded-full border border-white/45 bg-white/76 px-3 text-[11px] font-black text-cyan-700 shadow-[0_8px_20px_rgba(0,0,0,0.13)] backdrop-blur-xl transition-colors hover:bg-white dark:border-stone-700/70 dark:bg-stone-900/76 dark:text-cyan-200 dark:hover:bg-stone-800"
        title="显示已生成列表"
      >
        <ImageIcon className="h-3.5 w-3.5" />
        已生成 {items.length}
      </button>
    );
  }

  const renderItems = items.slice(0, CANVAS_GENERATED_LIST_RENDER_LIMIT);
  return (
    <div
      data-no-drag="true"
      className="absolute bottom-4 left-4 z-[100050] flex max-h-[42vh] w-[292px] flex-col rounded-[20px] border border-white/60 bg-white/80 p-2.5 text-stone-700 shadow-[0_14px_36px_rgba(0,0,0,0.15)] backdrop-blur-2xl dark:border-stone-700/70 dark:bg-stone-900/78 dark:text-stone-200"
      onPointerDown={event => event.stopPropagation()}
      onMouseDown={event => event.stopPropagation()}
      onWheel={event => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-black">
          <ImageIcon className="h-3.5 w-3.5 text-cyan-500" />
          <span>已生成</span>
          <span className="rounded-full bg-cyan-100 px-1.5 py-0.5 font-mono text-[9px] text-cyan-700 dark:bg-cyan-400/14 dark:text-cyan-200">
            {items.length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => onFitItems(items.map(entry => entry.canvasItem.id))}
              className="flex h-[18px] w-[18px] items-center justify-center rounded-[7px] text-stone-400 transition-colors hover:bg-stone-100 hover:text-cyan-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-cyan-200"
              title="适配全部已生成内容"
            >
              <LayoutGrid className="h-2.5 w-2.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex h-[18px] w-[18px] items-center justify-center rounded-[7px] text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-200"
            title="隐藏已生成列表"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      </div>
      {items.length > CANVAS_GENERATED_LIST_RENDER_LIMIT && (
        <div className="mt-1.5 px-1 text-[9px] font-bold text-stone-400 dark:text-stone-500">
          为保持流畅，仅显示最近 {CANVAS_GENERATED_LIST_RENDER_LIMIT} 条
        </div>
      )}
      <div className="mt-2 min-h-0 overflow-y-auto pr-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.length === 0 ? (
          <div className="flex h-24 flex-col items-center justify-center gap-1 rounded-[14px] border border-dashed border-stone-200/80 bg-white/52 text-center text-[10px] font-bold text-stone-400 dark:border-stone-700/70 dark:bg-stone-950/36 dark:text-stone-500">
            <Sparkles className="h-4 w-4 text-cyan-400" />
            暂无生成内容
          </div>
        ) : (
          <div className="grid gap-1.5">
            {renderItems.map(generatedItem => {
              const source = getSource(generatedItem.item);
              const isPending = generatedItem.ai?.status === 'working' || !source;
              const isError = generatedItem.ai?.status === 'error';
              const prompt = (generatedItem.ai?.prompt || generatedItem.item.remark || '').trim();
              const generatedAt = generatedItem.ai?.generatedAt || generatedItem.item.createdAt || 0;
              return (
                <div
                  key={`canvas-generated-list-${generatedItem.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onSelectItem(generatedItem.canvasItem);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    event.stopPropagation();
                    onSelectItem(generatedItem.canvasItem);
                  }}
                  className={`group/generated flex w-full cursor-pointer items-center gap-2 rounded-[14px] border p-1.5 text-left transition-colors ${
                    selectedIds.has(generatedItem.canvasItem.id)
                      ? 'border-cyan-200 bg-cyan-50/76 dark:border-cyan-400/24 dark:bg-cyan-400/12'
                      : 'border-white/70 bg-white/58 hover:bg-white/90 dark:border-stone-700/60 dark:bg-stone-950/28 dark:hover:bg-stone-800/70'
                  }`}
                  title={prompt || generatedItem.item.name || '定位已生成内容'}
                >
                  <div className="h-12 w-14 shrink-0 overflow-hidden rounded-[10px] bg-stone-900/8 dark:bg-white/8">
                    {isPending || isError ? (
                      <div className={`flex h-full w-full items-center justify-center ${
                        isError ? 'bg-red-500/12 text-red-500' : 'bg-cyan-500/10 text-cyan-500'
                      }`}>
                        <Sparkles className={`h-4 w-4 ${isPending && !isError ? 'animate-pulse' : ''}`} />
                      </div>
                    ) : generatedItem.item.type === 'video' && source && !/^data:image\//i.test(source) ? (
                      source ? (
                        <video
                          src={source}
                          muted
                          loop
                          playsInline
                          preload="metadata"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-emerald-500">
                          <Film className="h-4 w-4" />
                        </div>
                      )
                    ) : (
                      <img
                        src={source}
                        alt={generatedItem.item.name || '已生成图片'}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-black ${
                        isError
                          ? 'bg-red-100 text-red-600 dark:bg-red-400/16 dark:text-red-200'
                          : isPending
                            ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-400/16 dark:text-cyan-200'
                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/16 dark:text-emerald-200'
                      }`}>
                        {isError ? '失败' : isPending ? '生成中' : '完成'}
                      </span>
                      <span className="truncate text-[10px] font-black text-stone-700 dark:text-stone-200">
                        {generatedItem.item.name || (generatedItem.item.type === 'video' ? 'AI 视频' : 'AI 生图')}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[9px] font-medium text-stone-400 dark:text-stone-500">
                      {prompt || (isError ? getErrorSummary(generatedItem.ai?.error) : '无 Prompt 记录')}
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-1">
                      <span className="font-mono text-[9px] font-bold text-stone-400 dark:text-stone-500">
                        {generatedAt
                          ? new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : '--:--'}
                      </span>
                      <span className="flex items-center gap-1">
                        {!isPending && !isError && generatedItem.item.type === 'image' && (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              void onOpenBrush(generatedItem.canvasItem.id);
                            }}
                            className="flex h-5 w-5 items-center justify-center rounded-[8px] text-stone-400 opacity-0 transition-all hover:bg-blue-100 hover:text-blue-700 group-hover/generated:opacity-100 dark:hover:bg-blue-400/14 dark:hover:text-blue-200"
                            title="画笔标记"
                          >
                            <Brush className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void onDownload(generatedItem.item);
                          }}
                          className="flex h-5 w-5 items-center justify-center rounded-[8px] text-stone-400 opacity-0 transition-all hover:bg-cyan-100 hover:text-cyan-700 group-hover/generated:opacity-100 dark:hover:bg-cyan-400/14 dark:hover:text-cyan-200"
                          title="下载"
                        >
                          <Download className="h-3 w-3" />
                        </button>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
