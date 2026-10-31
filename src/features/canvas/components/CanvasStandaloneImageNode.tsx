import type { SnapshotBitmap, SnapshotBitmapCache } from '../snapshot/snapshotBitmapCache';
import { Brush, Copy, Image as ImageIcon, RotateCw, RefreshCw, Sparkles, X } from 'lucide-react';
import { CanvasStableImage } from './CanvasStableImage';
import { CanvasSnapshotImage } from './CanvasSnapshotImage';
import { getCanvasItemRenderedBoxImpl } from '../../drawer/controllers/drawerRenderActions';
import type { CanvasImageItem } from '../../canvasModel';

/** The common image path deliberately never resolves AI catalogs, prices,
 * workflow outputs or generator controls. Complex/media-working nodes retain
 * CanvasNode's full renderer. Keep action routing identical to that renderer.
 */
type SnapshotPresentation = {
  static: boolean;
  bitmap?: SnapshotBitmap | null;
  cache?: SnapshotBitmapCache;
  source?: string;
  maxEdge?: number;
  enter: () => void;
  leave: () => void;
  begin: () => void;
};
export function CanvasStandaloneImageNode({ scope, canvasItem, snapshot }: { scope: Record<string, any>; canvasItem: CanvasImageItem; snapshot?: SnapshotPresentation }) {
  const {
    activeThreeSceneIdRef, canvasHoveredItemIdRef, canvasSelectedIdsRef, canvasSelectedIdsSet,
    exitThreeSceneInteraction, startCanvasItemDrag, preventCanvasNativeDrag, updateCanvasSelection,
    openCanvasContextMenu, enableCanvasWorkflowSingleEditForItem, openCanvasBrushEditor,
    copyCanvasImageToSystemClipboard, rotateCanvasImageClockwise, removeCanvasItemsByIds,
  } = scope;
  const isSelected = canvasSelectedIdsSet.has(canvasItem.id);
  // Static pixels already live in a world tile; resolving/upgrading their DOM
  // source on every viewport publication defeats the snapshot fast path.
  const source = snapshot?.static ? '' : scope.getStableCanvasImageSource(canvasItem);
  const generated = canvasItem.ai?.type === 'generated-image';
  const isPendingGenerated = generated && !source;
  const hasBackingSource = Boolean(canvasItem.item.url || canvasItem.item.path || canvasItem.item.thumbnail || canvasItem.item.sourceUrl || canvasItem.item.originalUrl);
  const rotation = canvasItem.rotation || 0;
  // Never discard the navigation bitmap when a selected image grows beyond
  // its tier: keep original inspection pixels only in the resting view.
  const useCachedPreview = Boolean(snapshot?.bitmap)
    && Math.max(canvasItem.width, canvasItem.height) * (scope.canvasRenderScale || 1) <= (snapshot?.maxEdge ?? 512);
  const renderedBox = getCanvasItemRenderedBoxImpl({ getCanvasAiNodeDesignSizeForItem: scope.getCanvasAiNodeDesignSizeForItem }, canvasItem);
  return (
    <div data-canvas-item-id={canvasItem.id} data-canvas-selected-state={isSelected ? 'true' : undefined} data-canvas-snapshot-static={snapshot?.static ? 'true' : undefined}
      className="group/canvas-item absolute isolate overflow-visible"
      style={{ left: renderedBox.x, top: renderedBox.y, width: renderedBox.width, height: renderedBox.height,
        zIndex: isSelected ? 2 : 0, touchAction: 'none' }}
      onPointerDown={event => {
        snapshot?.begin();
        if (activeThreeSceneIdRef.current && activeThreeSceneIdRef.current !== canvasItem.id) exitThreeSceneInteraction();
        startCanvasItemDrag(event, canvasItem.id);
      }}
      onPointerEnter={() => { canvasHoveredItemIdRef.current = canvasItem.id; snapshot?.enter(); }}
      onPointerLeave={() => { if (canvasHoveredItemIdRef.current === canvasItem.id) canvasHoveredItemIdRef.current = ''; snapshot?.leave(); }}
      onDragStart={preventCanvasNativeDrag}
      onContextMenu={event => {
        snapshot?.begin();
        if (!canvasSelectedIdsRef.current.includes(canvasItem.id)) updateCanvasSelection([canvasItem.id]);
        openCanvasContextMenu(event, 'item', { itemId: canvasItem.id });
      }}
      onDoubleClick={event => {
        if (!enableCanvasWorkflowSingleEditForItem(canvasItem.id)) return;
        event.preventDefault(); event.stopPropagation();
      }}>
      {!snapshot?.static && <>
      <div className={`relative h-full w-full overflow-visible transition-[box-shadow] ${generated
        ? 'bg-transparent shadow-none'
        : 'bg-white/86 shadow-[0_10px_26px_rgba(15,23,42,0.10)] hover:shadow-[0_14px_32px_rgba(15,23,42,0.12)] dark:bg-stone-900/88 dark:shadow-[0_12px_30px_rgba(0,0,0,0.24)]'}`}>
        {isPendingGenerated ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-stone-950/74 px-4 text-center text-white"><Sparkles className="h-5 w-5 animate-pulse text-cyan-300" /><div className="text-[12px] font-black">生成中</div><div className="max-h-16 max-w-full overflow-hidden px-1 text-[10px] font-medium leading-4 opacity-70">{canvasItem.item.name || '等待接口返回图片'}</div></div>
        ) : source && snapshot?.bitmap ? <CanvasSnapshotImage bitmap={snapshot.bitmap} cache={snapshot.cache} source={snapshot.source} maxEdge={snapshot.maxEdge}
          originalSource={source} showOriginalAtRest={!useCachedPreview} name={canvasItem.item.name || '画布图片'}
          style={rotation ? { imageRendering: 'auto', position: 'absolute', left: '50%', top: '50%',
            width: rotation % 180 === 0 ? canvasItem.width : canvasItem.height,
            height: rotation % 180 === 0 ? canvasItem.height : canvasItem.width,
            maxWidth: 'none', maxHeight: 'none', transform: `translate(-50%, -50%) rotate(${rotation}deg)`, transformOrigin: 'center' }
            : { imageRendering: 'auto' }} onDragStart={preventCanvasNativeDrag} /> : source ? <CanvasStableImage data-canvas-main-media="true" src={source} alt={canvasItem.item.name || '画布图片'}
          loading="lazy" decoding="async" className="h-full w-full select-none object-contain"
          style={rotation ? { imageRendering: 'auto', position: 'absolute', left: '50%', top: '50%',
            width: rotation % 180 === 0 ? canvasItem.width : canvasItem.height,
            height: rotation % 180 === 0 ? canvasItem.height : canvasItem.width,
            maxWidth: 'none', maxHeight: 'none', transform: `translate(-50%, -50%) rotate(${rotation}deg)`, transformOrigin: 'center' }
            : { imageRendering: 'auto' }} draggable={false} onDragStart={preventCanvasNativeDrag} /> : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-stone-100/75 px-4 text-center text-stone-400 dark:bg-stone-900/60 dark:text-stone-500">
            <ImageIcon className="h-6 w-6" />
            <span className="text-[11px] font-bold">{hasBackingSource ? '正在准备缩略图' : '图片源丢失'}</span>
          </div>
        )}
        {scope.threeSceneAnalyzingIds.includes(canvasItem.id) && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-stone-950/52 text-white backdrop-blur-[2px]">
            <RefreshCw className="h-5 w-5 animate-spin" /><span className="text-[11px] font-bold">正在分析图片构图…</span>
          </div>
        )}
        {!generated && <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/52 to-transparent px-2 py-1.5 text-[10px] font-bold text-white opacity-0 transition-opacity group-hover/canvas-item:opacity-100">
          <span className="block truncate">{canvasItem.item.name || canvasItem.item.content}</span>
        </div>}
      </div>
      {source && !isPendingGenerated && (
                              <div
                                data-no-drag="true"
                                className="absolute left-1.5 top-1.5 z-50 flex items-center gap-0.5 rounded-[10px] border border-white/72 bg-white/88 p-0.5 text-stone-500 opacity-0 shadow-[0_5px_16px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-[opacity,transform] focus-within:opacity-100 group-hover/canvas-item:opacity-100 dark:border-white/10 dark:bg-stone-950/82 dark:text-white/68 dark:shadow-[0_7px_20px_rgba(0,0,0,0.30)]"

                                onPointerDown={(event) => event.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  className="flex h-7 w-7 items-center justify-center rounded-[8px] transition-[color,background-color,transform] hover:bg-blue-500/10 hover:text-blue-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/65 dark:hover:bg-blue-400/12 dark:hover:text-blue-200"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    void openCanvasBrushEditor(canvasItem.id);
                                  }}
                                  title="画笔标记"
                                  aria-label="画笔标记"
                                >
                                  <Brush className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  className="flex h-7 w-7 items-center justify-center rounded-[8px] transition-[color,background-color,transform] hover:bg-blue-500/10 hover:text-blue-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/65 dark:hover:bg-blue-400/12 dark:hover:text-blue-200"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    void copyCanvasImageToSystemClipboard(canvasItem);
                                  }}
                                  title="复制图片"
                                  aria-label="复制图片"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  className="flex h-7 w-7 items-center justify-center rounded-[8px] transition-[color,background-color,transform] hover:bg-blue-500/10 hover:text-blue-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/65 dark:hover:bg-blue-400/12 dark:hover:text-blue-200"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    rotateCanvasImageClockwise(canvasItem.id);
                                  }}
                                  title="顺时针旋转 90°"
                                  aria-label="顺时针旋转 90°"
                                >
                                  <RotateCw className="h-3.5 w-3.5" />
                                </button>
                              </div>
      )}
                            <button
                              data-no-drag="true"
                              type="button"
                              className="absolute right-1.5 top-1.5 z-50 flex h-7 w-7 items-center justify-center rounded-[10px] border border-white/72 bg-white/88 text-stone-400 opacity-0 shadow-[0_5px_16px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-[opacity,color,background-color,transform] hover:bg-red-50 hover:text-red-500 active:scale-95 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 group-hover/canvas-item:opacity-100 dark:border-white/10 dark:bg-stone-950/82 dark:text-white/50 dark:shadow-[0_7px_20px_rgba(0,0,0,0.30)] dark:hover:bg-red-500/14 dark:hover:text-red-300"
                              onPointerDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                removeCanvasItemsByIds([canvasItem.id]);
                              }}
                              title="从画布移除"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
      </>}
    </div>
  );
}
