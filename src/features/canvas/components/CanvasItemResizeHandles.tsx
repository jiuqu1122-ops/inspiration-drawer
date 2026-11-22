import type { PointerEvent } from 'react';
import type { CanvasResizeCorner } from '../../canvasModel';

const cornerClasses = {
  nw: '-left-4 -top-4 cursor-nwse-resize',
  ne: '-right-4 -top-4 cursor-nesw-resize',
  sw: '-left-4 -bottom-4 cursor-nesw-resize',
  se: '-right-4 -bottom-4 cursor-nwse-resize',
} satisfies Record<CanvasResizeCorner, string>;

export function CanvasItemResizeHandles({ itemId, scale, onResize }: {
  itemId: string;
  scale: number;
  onResize: (event: PointerEvent<HTMLButtonElement>, id: string, corner: CanvasResizeCorner) => void;
}) {
  return (['nw', 'ne', 'sw', 'se'] as const).map(corner => (
    <button key={corner} type="button" tabIndex={-1} data-no-drag="true" data-resize-corner={corner} title="拖动缩放"
      className={`pointer-events-auto absolute z-10 flex h-8 w-8 items-center justify-center ${cornerClasses[corner]}`}
      style={{ transform: `scale(${1 / Math.max(0.25, scale)})` }}
      onPointerDown={event => onResize(event, itemId, corner)}>
      <span className="h-3 w-3 rounded-[3px] border-2 border-white bg-stone-900 shadow-[0_2px_8px_rgba(24,24,27,0.28)] dark:border-stone-950 dark:bg-stone-100" />
    </button>
  ));
}
