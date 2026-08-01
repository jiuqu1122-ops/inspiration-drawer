import React from 'react';
import { ArchiveRestore, Layers, MoreVertical, Trash2 } from 'lucide-react';
import type { CanvasRecord } from '../services/canvasApi';

export type CanvasActionMenuPlacement = 'floating' | 'inline' | 'plain';

const formatCanvasDeletedAt = (value?: number | null) => {
  if (!value) return '删除时间未知';
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const sameCanvasForList = (previous: CanvasRecord, next: CanvasRecord) => (
  previous.id === next.id
  && previous.name === next.name
  && previous.isSnapshot === next.isSnapshot
  && previous.deletedAt === next.deletedAt
);

export type CanvasListItemProps = {
  canvas: CanvasRecord;
  isActive: boolean;
  canDelete: boolean;
  isSwitching: boolean;
  isMenuOpen: boolean;
  onOpen: (canvasId: string) => void;
  onOpenMenu: (canvasId: string) => void;
  onToggleMenu: (canvasId: string) => void;
  onDelete: (canvas: CanvasRecord) => void;
  renderMenu: (canvas: CanvasRecord, placement: CanvasActionMenuPlacement) => React.ReactNode;
};

export const CanvasListItem = React.memo(function CanvasListItem({
  canvas,
  isActive,
  canDelete,
  isSwitching,
  isMenuOpen,
  onOpen,
  onOpenMenu,
  onToggleMenu,
  onDelete,
  renderMenu,
}: CanvasListItemProps) {
  return (
    <div className="group/canvas w-full shrink-0" data-canvas-list-item="true">
      <div className="relative">
        <button
          type="button"
          disabled={isSwitching}
          onClick={() => onOpen(canvas.id)}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpenMenu(canvas.id);
          }}
          className={`flex h-9 w-full min-w-0 items-center gap-2 rounded-[10px] px-2 pr-16 text-left text-[12px] font-bold transition-colors ${isActive ? 'bg-indigo-500 text-white dark:bg-indigo-400 dark:text-stone-950' : 'text-stone-700 hover:bg-white/70 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/[0.07] dark:hover:text-white'} disabled:cursor-wait disabled:opacity-60`}
          title={canvas.name}
        >
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] ${isActive ? 'bg-white/18 text-white dark:bg-stone-950/82 dark:text-indigo-200 dark:ring-1 dark:ring-white/15' : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-400/12 dark:text-indigo-200'}`}>
            <Layers className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1 truncate">{canvas.name || '画布'}</span>
          {canvas.isSnapshot && <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-black ${isActive ? 'bg-white/18 text-white/80 dark:text-stone-950/70' : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-200'}`}>快照</span>}
        </button>
        <button
          type="button"
          disabled={!canDelete}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onDelete(canvas);
          }}
          className="absolute right-8 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-red-500 opacity-0 ring-1 ring-stone-200 transition-opacity hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:text-stone-300 disabled:opacity-0 group-hover/canvas:opacity-100 dark:bg-stone-800/88 dark:text-red-300 dark:ring-stone-700 dark:hover:bg-red-950/35 dark:hover:text-red-200 dark:disabled:text-stone-600"
          title={canDelete ? '删除画布' : '正在切换画布'}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleMenu(canvas.id);
          }}
          className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-stone-500 opacity-0 ring-1 ring-stone-200 transition-opacity hover:text-stone-900 group-hover/canvas:opacity-100 dark:bg-stone-800/88 dark:text-stone-300 dark:ring-stone-700 dark:hover:text-white"
          title="画布菜单"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      </div>
      {isMenuOpen && renderMenu(canvas, 'inline')}
    </div>
  );
}, (previous, next) => (
  sameCanvasForList(previous.canvas, next.canvas)
  && previous.isActive === next.isActive
  && previous.canDelete === next.canDelete
  && previous.isSwitching === next.isSwitching
  && previous.isMenuOpen === next.isMenuOpen
  && previous.onOpen === next.onOpen
  && previous.onOpenMenu === next.onOpenMenu
  && previous.onToggleMenu === next.onToggleMenu
  && previous.onDelete === next.onDelete
  && previous.renderMenu === next.renderMenu
));

export type CanvasRailItemProps = Omit<CanvasListItemProps, 'canDelete' | 'onDelete'>;

export const CanvasRailItem = React.memo(function CanvasRailItem({
  canvas,
  isActive,
  isSwitching,
  isMenuOpen,
  onOpen,
  onOpenMenu,
  onToggleMenu,
  renderMenu,
}: CanvasRailItemProps) {
  return (
    <div className="group/canvas-rail relative flex w-full shrink-0 flex-col items-center" data-canvas-list-item="true">
      <button
        type="button"
        disabled={isSwitching}
        onClick={() => onOpen(canvas.id)}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenMenu(canvas.id);
        }}
        className={`mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border transition-colors ${isActive ? 'border-indigo-300 bg-indigo-500 text-white dark:bg-indigo-400 dark:text-stone-950' : 'border-white/70 bg-white/65 text-indigo-500 hover:bg-indigo-50 dark:border-stone-700/60 dark:bg-stone-800/65 dark:text-indigo-200 dark:hover:bg-indigo-400/12'} disabled:cursor-wait disabled:opacity-60`}
        title={canvas.name}
      >
        <Layers className="h-5 w-5" />
      </button>
      <span className={`w-14 truncate px-0.5 pb-1 text-center text-[10px] ${isActive ? 'font-bold text-indigo-700 dark:text-indigo-200' : 'text-stone-500 dark:text-stone-400'}`}>
        {canvas.name || '画布'}
      </span>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggleMenu(canvas.id);
        }}
        className="absolute right-0 top-0 hidden h-5 w-5 items-center justify-center rounded-full bg-white/88 text-stone-500 ring-1 ring-stone-200 group-hover/canvas-rail:flex dark:bg-stone-800/88 dark:text-stone-300 dark:ring-stone-700"
        title="画布菜单"
      >
        <MoreVertical className="h-3 w-3" />
      </button>
      {isMenuOpen && (
        <div className="absolute left-10 top-0 z-[100060]">
          {renderMenu(canvas, 'plain')}
        </div>
      )}
    </div>
  );
}, (previous, next) => (
  sameCanvasForList(previous.canvas, next.canvas)
  && previous.isActive === next.isActive
  && previous.isSwitching === next.isSwitching
  && previous.isMenuOpen === next.isMenuOpen
  && previous.onOpen === next.onOpen
  && previous.onOpenMenu === next.onOpenMenu
  && previous.onToggleMenu === next.onToggleMenu
  && previous.renderMenu === next.renderMenu
));

export type CanvasTrashListItemProps = {
  canvas: CanvasRecord;
  onRestore: (canvas: CanvasRecord) => void;
  onPermanentlyDelete: (canvas: CanvasRecord) => void;
};

export const CanvasTrashListItem = React.memo(function CanvasTrashListItem({
  canvas,
  onRestore,
  onPermanentlyDelete,
}: CanvasTrashListItemProps) {
  return (
    <div className="rounded-[10px] border border-stone-200/80 bg-white/70 p-2 text-stone-700 dark:border-stone-700/70 dark:bg-stone-900/50 dark:text-stone-200">
      <div className="flex items-start gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-300">
          <Layers className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-bold">{canvas.name || '画布'}</div>
          <div className="mt-0.5 truncate text-[10px] font-medium text-stone-400 dark:text-stone-500">
            {formatCanvasDeletedAt(canvas.deletedAt)}
          </div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => onRestore(canvas)}
          className="inline-flex h-7 items-center justify-center gap-1 rounded-[8px] bg-emerald-50 text-[10px] font-black text-emerald-700 transition-colors hover:bg-emerald-100 dark:bg-emerald-400/12 dark:text-emerald-200 dark:hover:bg-emerald-400/20"
        >
          <ArchiveRestore className="h-3 w-3" />
          恢复
        </button>
        <button
          type="button"
          onClick={() => onPermanentlyDelete(canvas)}
          className="inline-flex h-7 items-center justify-center gap-1 rounded-[8px] bg-red-50 text-[10px] font-black text-red-600 transition-colors hover:bg-red-100 dark:bg-red-400/12 dark:text-red-200 dark:hover:bg-red-400/20"
        >
          <Trash2 className="h-3 w-3" />
          永久删除
        </button>
      </div>
    </div>
  );
}, (previous, next) => (
  sameCanvasForList(previous.canvas, next.canvas)
  && previous.onRestore === next.onRestore
  && previous.onPermanentlyDelete === next.onPermanentlyDelete
));
