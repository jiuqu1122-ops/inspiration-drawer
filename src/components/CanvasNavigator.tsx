import type React from 'react';
import { Compass, LayoutGrid, Maximize2, Minimize2, X } from 'lucide-react';
import type { CanvasImageItem, CanvasItemBox } from '../features/canvasModel';
import { getCanvasAiMediaType, isCanvasAiGeneratorType } from '../features/canvasAiRuntime';

const CANVAS_NAV_WIDTH = 188;
const CANVAS_NAV_HEIGHT = 116;

export type CanvasNavigatorPreview = {
  source: string;
  mediaType: 'image' | 'video';
};

export type CanvasNavigatorItem = {
  item: CanvasImageItem;
  box: CanvasItemBox;
};

type CanvasNavigatorProps = {
  visible: boolean;
  panelRef: React.RefObject<HTMLDivElement | null>;
  items: CanvasNavigatorItem[];
  selectedIds: ReadonlySet<string>;
  zoomPercent: number;
  getPreview: (item: CanvasImageItem) => CanvasNavigatorPreview | null;
  getThumbnailSource: (
    item: CanvasImageItem,
    preview: CanvasNavigatorPreview | null
  ) => string;
  onToggle: () => void;
  onClose: () => void;
  onSelectItem: (item: CanvasImageItem) => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onFit: () => void;
  onZoomIn: () => void;
  onLocatePrimary: () => void;
};

export function CanvasNavigator({
  visible,
  panelRef,
  items,
  selectedIds,
  zoomPercent,
  getPreview,
  getThumbnailSource,
  onToggle,
  onClose,
  onSelectItem,
  onZoomOut,
  onResetZoom,
  onFit,
  onZoomIn,
  onLocatePrimary,
}: CanvasNavigatorProps) {
  const bounds = items.length > 0 ? {
    left: Math.min(...items.map(entry => entry.box.x)),
    top: Math.min(...items.map(entry => entry.box.y)),
    right: Math.max(...items.map(entry => entry.box.x + entry.box.width)),
    bottom: Math.max(...items.map(entry => entry.box.y + entry.box.height)),
  } : null;
  const scale = bounds
    ? Math.min(
      (CANVAS_NAV_WIDTH - 18) / Math.max(1, bounds.right - bounds.left),
      (CANVAS_NAV_HEIGHT - 18) / Math.max(1, bounds.bottom - bounds.top)
    )
    : 1;

  return (
    <>
      <button
        type="button"
        data-no-drag="true"
        onClick={onToggle}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border shadow-[0_8px_20px_rgba(15,23,42,0.10)] backdrop-blur-2xl transition-[transform,background-color,border-color] duration-200 hover:-translate-y-px hover:border-blue-300 hover:bg-blue-50/90 dark:border-white/10 dark:bg-stone-950/70 dark:text-blue-300 dark:hover:border-blue-400/30 dark:hover:bg-stone-900/90 ${
          visible
            ? 'border-blue-300 bg-blue-50/95 text-blue-600 ring-2 ring-blue-100/80 dark:border-blue-400/35 dark:bg-blue-400/12 dark:text-blue-200 dark:ring-blue-400/10'
            : 'border-blue-200/80 bg-white/88 text-blue-500'
        }`}
        title={visible ? '隐藏导航' : '显示导航'}
      >
        <Compass className="h-3.5 w-3.5" />
      </button>
      {visible && (
        <div
          data-no-drag="true"
          ref={panelRef}
          className="absolute bottom-full right-0 z-[100070] mb-2 w-[220px] rounded-[20px] border border-white/60 bg-white/78 p-2.5 text-stone-700 shadow-[0_14px_36px_rgba(0,0,0,0.15)] backdrop-blur-2xl dark:border-stone-600/80 dark:bg-stone-900/88 dark:text-stone-200"
          onPointerDown={event => event.stopPropagation()}
          onMouseDown={event => event.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-2 px-0.5">
            <div className="flex items-center gap-1.5 text-[11px] font-black">
              <Compass className="h-3.5 w-3.5 text-blue-500 dark:text-blue-300" />
              导航
            </div>
            <div className="flex items-center gap-1">
              <span className="font-mono text-[10px] font-bold text-stone-400 dark:text-stone-500">
                {items.length}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="flex h-[18px] w-[18px] items-center justify-center rounded-[7px] text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                title="隐藏导航"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          </div>
          <div
            className="relative mt-2 h-[116px] w-full overflow-hidden rounded-[14px] border border-blue-100/80 bg-blue-50/45 dark:border-stone-700/70 dark:bg-stone-950/45"
            title="点击缩略图定位"
          >
            {items.length === 0 ? (
              <div className="flex h-full items-center justify-center text-[10px] font-bold text-stone-400 dark:text-stone-500">
                暂无节点
              </div>
            ) : bounds && items.map(({ item, box }) => {
              const left = 9 + (box.x - bounds.left) * scale;
              const top = 9 + (box.y - bounds.top) * scale;
              const width = Math.max(10, box.width * scale);
              const height = Math.max(10, box.height * scale);
              const selected = selectedIds.has(item.id);
              const preview = getPreview(item);
              const source = getThumbnailSource(item, preview);
              const label = item.ai?.type === 'workflow'
                ? item.ai?.presetLabel || '工作流'
                : isCanvasAiGeneratorType(item.ai?.type)
                  ? item.ai?.presetLabel || (getCanvasAiMediaType(item.ai) === 'video' ? '视频' : '生图')
                  : item.item.type === 'text'
                    ? '文字'
                    : item.item.name || item.item.type || '节点';
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`absolute overflow-hidden rounded-[6px] border bg-white shadow-sm transition-transform hover:scale-110 dark:bg-stone-800 ${
                    selected
                      ? 'border-blue-500 ring-2 ring-blue-300/70'
                      : 'border-white/85 dark:border-stone-600/80'
                  }`}
                  style={{ left, top, width, height }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onSelectItem(item);
                  }}
                  title={item.item.name || item.item.content || label}
                >
                  {source ? (
                    <img
                      src={source}
                      alt={item.item.name || '导航缩略图'}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <div className={`flex h-full w-full items-center justify-center px-1 text-[7px] font-black leading-none ${
                      item.item.type === 'video' || getCanvasAiMediaType(item.ai) === 'video'
                        ? 'bg-violet-100 text-violet-600 dark:bg-violet-950/70 dark:text-violet-300'
                        : item.item.type === 'image'
                          ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/70 dark:text-cyan-300'
                          : 'bg-white/70 text-stone-500 dark:bg-stone-800 dark:text-stone-300'
                    }`}>
                      <span className="truncate">{item.item.type === 'video' ? '视频' : label}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between gap-1.5">
            <button
              type="button"
              onClick={onZoomOut}
              className="flex h-7 w-7 items-center justify-center rounded-[11px] bg-stone-100 text-stone-600 transition-colors hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
              title="缩小"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onResetZoom}
              className="h-7 min-w-[58px] rounded-[11px] bg-stone-100 px-2 font-mono text-[10px] font-black text-stone-600 transition-colors hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
              title="重置缩放"
            >
              {zoomPercent}%
            </button>
            <button
              type="button"
              onClick={onFit}
              className="flex h-7 w-7 items-center justify-center rounded-[11px] bg-cyan-100 text-cyan-700 transition-colors hover:bg-cyan-200 dark:bg-cyan-900/38 dark:text-cyan-300 dark:hover:bg-cyan-900/55"
              title="适配全部 / 选中"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onZoomIn}
              className="flex h-7 w-7 items-center justify-center rounded-[11px] bg-stone-100 text-stone-600 transition-colors hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
              title="放大"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onLocatePrimary}
              className="flex h-7 w-7 items-center justify-center rounded-[11px] bg-blue-100 text-blue-700 transition-colors hover:bg-blue-200 dark:bg-blue-900/38 dark:text-blue-300 dark:hover:bg-blue-900/55"
              title="定位最近图片"
            >
              <Compass className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
