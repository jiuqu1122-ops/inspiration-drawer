import { convertFileSrc,invoke } from '@tauri-apps/api/core';
import { emitTo } from '@tauri-apps/api/event';
import React,{ startTransition } from 'react';
import { getAssetCount,listAssets } from '../../../services/assetsApi';
import { type CanvasRecord } from '../../../services/canvasApi';
import { BufferItem,Folder } from '../../../types';
import type { CanvasFolderMediaPickerState,CanvasViewportRect } from '../../../types/canvasRuntime';
import type { DrawerTabType } from '../../../types/drawer';
import { getFastCanvasImageDisplaySize,readImageDisplaySize } from '../../../utils/canvasImageSize';
import { cloneDrawerValue,stripHeavyDataThumbnail } from '../../../utils/canvasSerialization';
import { getCanvasLocalPathsFromDataTransfer } from '../../../utils/localMediaPaths';
import { type AgentCanvasVisualReference } from '../../agentModel';
import { type CanvasDrawerMediaItem } from '../../canvasDrawerMedia';
import { buildCanvasFolderMediaQuery,mergeCanvasFolderMediaItems } from '../../canvasFolderMedia';
import { CANVAS_GROW_CHUNK,CANVAS_MAX_IMAGE_WIDTH,CANVAS_MAX_SCALE,CANVAS_MIN_IMAGE_WIDTH,CANVAS_MIN_SCALE,type CanvasImageItem,type CanvasItemBox,type CanvasResizeCorner } from '../../canvasModel';
import { getCanvasBoxesBounds } from '../../canvasResizeGeometry';
import { findNearestCanvasItemIdForEmptyViewport } from '../../canvasViewportNavigation';
import { clamp } from '../../common';
import { getImageFileFromDataTransfer,getNameFromUrl,getWebImageFromDataTransfer,normalizeDraggedUrl,readImageFileAsDataUrl } from '../../dragData';

type canvasInteractionsActionContext = { showToast: (message: string) => void; createAssetId: () => `${string}-${string}-${string}-${string}-${string}`; makeCanvasNodeId: (seed: string, kind?: string) => string; getCanvasDropPosition: (index?: number, client?: { x: number; y: number; }) => { x: number; y: number; }; x: number; y: number; appendCanvasItems: (nextItems: CanvasImageItem[], label: string, select?: boolean) => number; ensureImageThumbnail: (item: BufferItem) => void; canvasSearchAddingIdsRef: React.RefObject<Set<string>>; canvasSearchDropIndexRef: React.RefObject<number>; createDrawerMediaCanvasNode: (itemId: string, client?: { x: number; y: number; }, options?: { reuseExisting?: boolean; select?: boolean; toast?: boolean; label?: string; dropIndex?: number; }) => Promise<string>; canvasFolderPickerRequestRef: React.RefObject<number>; canvasFolderPickerLoadingRef: React.RefObject<boolean>; canvasFolderPickerItemsRef: React.RefObject<CanvasDrawerMediaItem[]>; setCanvasFolderPickerVisibleCount: React.Dispatch<React.SetStateAction<number>>; CANVAS_FOLDER_PICKER_INITIAL_VISIBLE: 24; setCanvasFolderPickerItems: React.Dispatch<React.SetStateAction<CanvasDrawerMediaItem[]>>; setCanvasFolderPickerTotal: React.Dispatch<React.SetStateAction<number>>; setCanvasFolderPickerHasMore: React.Dispatch<React.SetStateAction<boolean>>; setIsCanvasFolderPickerLoading: React.Dispatch<React.SetStateAction<boolean>>; setCanvasFolderPickerError: React.Dispatch<React.SetStateAction<string>>; setCanvasFolderImportPrompt: React.Dispatch<React.SetStateAction<CanvasFolderMediaPickerState | null>>; canvasFolderPickerPagingRef: React.RefObject<CanvasFolderMediaPagingState>; assetStorageMode: "initializing" | "sqlite" | "json"; getFolderMediaItemsForCanvas: (folderId?: string) => CanvasDrawerMediaItem[]; closeCanvasFolderMediaPicker: () => void; folderKey: string; imageOffset: number; imageTotal: number; videoOffset: number; videoTotal: number; folders: Folder[]; loadCanvasFolderMediaPage: (folderId?: string, reset?: boolean) => Promise<void>; lastAcceptedWebImageRef: React.RefObject<{ id: string; location: "drawer" | "canvas"; inline: boolean; at: number; } | null>; at: number; inline: boolean; supersededWebImageItemIdsRef: React.RefObject<Set<string>>; id: string; location: "canvas" | "drawer"; updateCanvasItemsImmediate: (updater: (prev: CanvasImageItem[]) => CanvasImageItem[]) => CanvasImageItem[]; setItems: React.Dispatch<React.SetStateAction<BufferItem[]>>; lastWebImageUrlRef: React.RefObject<string>; lastWebImageDropAtRef: React.RefObject<number>; claimExternalWebImageDrop: (normalizedUrl: string, itemId: string, location: "drawer" | "canvas") => boolean; getPersistentWebSourceUrl: (value?: string) => string | undefined; sourceUrl: string | undefined; captureSource: "browser-extension" | undefined; pageUrl: string | undefined; getWebCaptureSourceSite: (pageUrl?: string) => string | undefined; pageTitle: string | undefined; imageAlt: string | undefined; width: number | undefined; height: number | undefined; sourceType: string | undefined; webImageCacheDirRef: React.RefObject<string>; cacheWebImageFromCandidates: (urls: string[], name: string, dir?: string) => Promise<{ cachedPath: string; sourceUrl: string; }>; dragId: string; canvasItemsRef: React.RefObject<CanvasImageItem[]>; getCanvasPrimaryImageItem: (source?: CanvasImageItem[]) => CanvasImageItem | null; isCanvasModeRef: React.RefObject<boolean>; setIsCanvasMode: React.Dispatch<React.SetStateAction<boolean>>; setActiveFolderId: React.Dispatch<React.SetStateAction<string>>; setActiveTab: React.Dispatch<React.SetStateAction<DrawerTabType>>; setShowSettings: React.Dispatch<React.SetStateAction<boolean>>; setIsSearchActive: React.Dispatch<React.SetStateAction<boolean>>; setShowTextInput: React.Dispatch<React.SetStateAction<boolean>>; setIsSelectMode: React.Dispatch<React.SetStateAction<boolean>>; setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>; setIsOpen: React.Dispatch<React.SetStateAction<boolean>>; setIsPinned: React.Dispatch<React.SetStateAction<boolean>>; isPinnedRef: React.RefObject<boolean>; setDrawerState: React.Dispatch<React.SetStateAction<"closed" | "pre_open" | "open" | "closing">>; canvasSurfaceRef: React.RefObject<HTMLDivElement | null>; canvasReturnScrollRef: React.RefObject<{ left: number; top: number; } | null>; scheduleCanvasFocusItemById: (id?: string | null) => void; writeCanvasSurfaceScroll: (surface: HTMLDivElement, left: number, top: number, updateLock?: boolean) => void; left: number; top: number; mainDrawerLongPressTriggeredRef: React.RefObject<boolean>; clearMainDrawerLongPress: () => void; mainDrawerLongPressTimerRef: React.RefObject<number | null>; requestExitCanvasMode: () => void; enterCanvasMode: () => void; isCanvasSpacePressedRef: React.RefObject<boolean>; canvasResizeRef: React.RefObject<{ id: string; corner: CanvasResizeCorner; startClientX: number; startClientY: number; startX: number; startY: number; startWidth: number; startHeight: number; aspect: number; latestBox: CanvasItemBox | null; hasResized: boolean; } | null>; canvasInputPickTargetIdRef: React.RefObject<string | null>; pickCanvasImageForGenerator: (sourceId: string, targetId: string) => boolean; settleCanvasZoomBeforePointerInteraction: () => void; cancelCanvasImageSourceUpgradeQueue: () => void; canvasSelectedIdsRef: React.RefObject<string[]>; getCanvasSelectionIdsForItem: (id: string, sourceItems?: CanvasImageItem[]) => string[]; expandCanvasSelectionIdsWithGroups: (ids: string[], sourceItems?: CanvasImageItem[]) => string[]; applyCanvasSelectionDomFeedback: (currentIds: string[], nextIds: string[]) => void; scheduleCanvasSelectionImageSources: (ids: Iterable<string>) => void; canvasDragRef: React.RefObject<{ ids: string[]; pointerId: number; startClientX: number; startClientY: number; startScrollLeft: number; startScrollTop: number; startItems: Record<string, CanvasItemBox>; latestDelta: { dx: number; dy: number; }; hasMoved: boolean; hasConnections: boolean; pendingSelectionIds: string[] | null; } | null>; makeCanvasItemBoxMap: (ids: string[]) => Record<string, CanvasItemBox>; canvasDragDebugRef: React.RefObject<{ startNodeCount: number; pointerMoveCount: number; lastNodeCount: number; } | null>; getCanvasItemElement: (id: string) => HTMLElement | null; canvasContentRef: React.RefObject<HTMLDivElement | null>; CANVAS_INTERACTION_DEBUG: false; ids: string[]; pointerMoveCount: number | undefined; lastNodeCount: number; startNodeCount: number | undefined; autoScrollCanvasNearEdge: (event: { clientX: number; clientY: number; }) => void; canvasScaleRef: React.RefObject<number>; startScrollLeft: number; startScrollTop: number; startClientX: number; startClientY: number; hasMoved: boolean | undefined; setCanvasInteractionActive: (active: boolean, releaseDelay?: number, _options?: { preserveImageSources?: boolean; }) => void; setCanvasItemDraggingFlag: (ids: string[], active: boolean) => void; pushCanvasUndoSnapshot: (label: string, options?: { layoutOnly?: boolean; shareImmutableItems?: boolean; }) => void; latestDelta: { dx: number; dy: number; }; startItems: Record<string, CanvasItemBox>; growCanvasToFit: (right: number, bottom: number) => void; scheduleCanvasInteractionPaint: (payload: NonNullable<{ kind: "move"; ids: string[]; dx: number; dy: number; } | { kind: "resize"; boxes: Record<string, CanvasItemBox>; } | { kind: "selection"; rect: CanvasItemBox; } | null>) => void; canvasPointerInteractionCleanupRef: React.RefObject<(() => void) | null>; cancelCanvasInteractionPaint: () => void; canvasItemsPatchCommitRef: React.RefObject<boolean>; updateCanvasItemsDeferred: (updater: (prev: CanvasImageItem[]) => CanvasImageItem[]) => CanvasImageItem[]; restoreCanvasItemBoxStyles: (ids: string[]) => void; markCanvasNodesChanged: (ids: string[]) => void; clearCanvasItemInteractionStyles: (ids: string[], refreshOcclusion?: boolean) => void; pendingSelectionIds: string[]; setCanvasSelectedIds: React.Dispatch<React.SetStateAction<string[]>>; CANVAS_INTERACTION_BACKGROUND_SETTLE_MS: 900; getCanvasItemRenderedBox: (canvasItem: CanvasImageItem) => CanvasItemBox; updateCanvasSelection: (ids: string[]) => void; setCanvasItemResizingFlag: (ids: string[], active: boolean) => void; hasResized: boolean | undefined; corner: CanvasResizeCorner; startWidth: number; startHeight: number; aspect: number; startX: number; startY: number; latestBox: CanvasItemBox; canvasGroupResizeRef: React.RefObject<{ corner: CanvasResizeCorner; startClientX: number; startClientY: number; startBounds: CanvasItemBox; startItems: Record<string, CanvasItemBox>; aspect: number; latestBoxes: Record<string, CanvasItemBox> | null; hasResized: boolean; } | null>; startBounds: CanvasItemBox; latestBoxes: Record<string, CanvasItemBox>; getCanvasPointFromClient: (clientX: number, clientY: number) => { x: number; y: number; }; canvasSelectionDragRef: React.RefObject<{ pointerId: number; startX: number; startY: number; currentX: number; currentY: number; additive: boolean; baseSelectedIds: string[]; hasMoved: boolean; } | null>; hideCanvasSelectionOverlay: () => void; currentX: number; currentY: number; normalizeCanvasSelectionBox: (box: { startX: number; startY: number; currentX: number; currentY: number; }) => CanvasItemBox; additive: boolean; canvasViewportRef: React.RefObject<CanvasViewportRect | null>; canvasRectsIntersect: (a: CanvasItemBox, b: CanvasItemBox) => boolean; baseSelectedIds: string[]; canvasScrollWriteGuardRef: React.RefObject<boolean>; canvasScrollLockRef: React.RefObject<{ left: number; top: number; } | null>; isCanvasInteractingRef: React.RefObject<boolean>; isCanvasZoomingRef: React.RefObject<boolean>; canvasPanRef: React.RefObject<{ pointerId: number; button: number; startClientX: number; startClientY: number; startScrollLeft: number; startScrollTop: number; } | null>; canvasStateSaveDeferredDuringZoomRef: React.RefObject<boolean>; scheduleCanvasStateSave: (options?: { syncNodes?: boolean; }) => void; releaseCanvasScrollWriteGuard: () => void; canvasSizeRef: React.RefObject<{ width: number; height: number; }>; getCanvasBoundsFromItems: (sourceItems: CanvasImageItem[]) => CanvasItemBox | null; beginCanvasZoomInteraction: () => void; applyCanvasScaleStyles: (scale?: number, size?: { width: number; height: number; }, options?: { updateViewport?: boolean; }) => void; commitCanvasScaleSoon: () => void; pendingCanvasFocusItemIdRef: React.RefObject<string | null>; focusCanvasItemById: (id?: string | null) => boolean; activeCanvasIdRef: React.RefObject<string>; readCanvasViewportRect: (surface?: HTMLDivElement | null) => CanvasViewportRect | null; centerCanvasItemInView: (canvasItem?: CanvasImageItem | null, options?: { select?: boolean; }) => boolean; canvasPanCleanupRef: React.RefObject<(() => void) | null>; pointerId: number | undefined; button: number; expandCanvasBeforeViewport: (left: number, top: number) => void; growCanvasNearViewportEdge: (surface?: HTMLDivElement | null) => void; scheduleCanvasViewportUpdate: () => void; canvasVisualViewportRef: React.RefObject<CanvasViewportRect | null>; canvasWheelZoomPayloadRef: React.RefObject<{ clientX: number; clientY: number; deltaY: number; } | null>; deltaY: number; canvasWheelZoomFrameRef: React.RefObject<number | null>; zoomCanvasAt: (clientX: number, clientY: number, deltaY: number) => void; clientX: number; clientY: number; lastCanvasDragClientRef: React.RefObject<{ x: number; y: number; } | null>; getDraggedDrawerItemId: (dt?: DataTransfer | null) => string; addDrawerMediaItemToCanvas: (itemId: string, client?: { x: number; y: number; }) => Promise<boolean>; clearDrawerItemDragState: () => void; addCanvasWebImageUrl: (url: string, name?: string, client?: { x: number; y: number; }, fallbackUrls?: string[], captureMetadata?: WebImageCaptureMetadata) => Promise<void>; addCanvasDroppedPaths: (paths: string[], client?: { x: number; y: number; }) => Promise<void>; addCanvasDroppedFiles: (files: FileList | File[], client?: { x: number; y: number; }) => Promise<boolean>; saveCanvasStateNow: (options?: { syncNodes?: boolean; }) => void; keepCanvasSessionOnLeaveRef: React.RefObject<boolean>; setCanvasSpacePressed: (pressed: boolean) => void; appWindow: import('@tauri-apps/api/window').Window; isPointerInsideDrawerRef: React.RefObject<boolean>; buildCanvasDrawerFolderName: (canvas: CanvasRecord, now?: number) => string; itemsRef: React.RefObject<BufferItem[]>; pushDrawerUndoSnapshot: (label: string, options?: { shareImmutableItems?: boolean; }) => void; setFolders: React.Dispatch<React.SetStateAction<Folder[]>>; insertDrawerFolderAtTop: (currentFolders: Folder[], folder: Folder) => Folder[]; foldersRef: React.RefObject<Folder[]>; persistFoldersSnapshot: (nextFolders: Folder[]) => void; };

type CanvasFolderMediaPagingState = {
  folderKey: string;
  imageOffset: number;
  videoOffset: number;
  imageTotal: number;
  videoTotal: number;
};
type WebImageCaptureMetadata = {
    dragId?: string;
    sourceUrl?: string;
    pageUrl?: string;
    pageTitle?: string;
    imageAlt?: string;
    width?: number;
    height?: number;
    sourceType?: string;
    captureSource?: 'browser-extension';
    folderId?: string;
    localPath?: string;
  };

export const createWorkflowAttachmentImageCanvasNodeImpl = async (ctx: Pick<canvasInteractionsActionContext, 'appendCanvasItems' | 'createAssetId' | 'ensureImageThumbnail' | 'getCanvasDropPosition' | 'makeCanvasNodeId' | 'showToast'>, reference: AgentCanvasVisualReference, options: { select?: boolean; label?: string } = {}) => {
  const { appendCanvasItems, createAssetId, ensureImageThumbnail, getCanvasDropPosition, makeCanvasNodeId, showToast } = ctx;
    if (reference.mediaType !== 'image') return '';
    const sourceAsset = reference.source || reference.thumbnail || (reference.path ? convertFileSrc(reference.path) : '');
    if (!sourceAsset) {
      showToast('图片源丢失，无法作为 workflow 输入');
      return '';
    }
    const itemId = createAssetId();
    const item: BufferItem = {
      id: itemId,
      type: 'image',
      content: reference.name || 'workflow input image',
      name: reference.name || 'workflow input image',
      path: reference.path,
      url: reference.path ? undefined : reference.source,
      thumbnail: reference.thumbnail || (!reference.path && /^data:image\//i.test(sourceAsset) ? sourceAsset : undefined),
      sourceItemId: reference.sourceItemId,
      originalUrl: /^https?:\/\//i.test(reference.source || '') ? reference.source : undefined,
      createdAt: Date.now(),
      isQuickAccess: false,
    };
    const size = await readImageDisplaySize(sourceAsset);
    const canvasId = makeCanvasNodeId(item.id, 'image');
    const pos = getCanvasDropPosition(0);
    const canvasItem: CanvasImageItem = {
      id: canvasId,
      item,
      x: pos.x,
      y: pos.y,
      width: size.width,
      height: size.height,
    };
    if (appendCanvasItems([canvasItem], options.label || 'Agent 添加 workflow 输入图片', options.select === true) === 0) return '';
    if (!item.thumbnail) ensureImageThumbnail(item);
    return canvasId;

};

export const addCanvasSearchMediaCandidateImpl = async (ctx: Pick<canvasInteractionsActionContext, 'canvasSearchAddingIdsRef' | 'canvasSearchDropIndexRef' | 'createDrawerMediaCanvasNode' | 'showToast'>, itemId: string) => {
  const { canvasSearchAddingIdsRef, canvasSearchDropIndexRef, createDrawerMediaCanvasNode, showToast } = ctx;
    if (canvasSearchAddingIdsRef.current.has(itemId)) return;
    canvasSearchAddingIdsRef.current.add(itemId);
    try {
      const dropIndex = canvasSearchDropIndexRef.current % 12;
      canvasSearchDropIndexRef.current += 1;
      const nodeId = await createDrawerMediaCanvasNode(itemId, undefined, {
        dropIndex,
        toast: false,
        label: '从搜索结果添加素材',
      });
      if (!nodeId) showToast('搜索素材加入画布失败');
    } finally {
      canvasSearchAddingIdsRef.current.delete(itemId);
    }

};

export const closeCanvasFolderMediaPickerImpl = (ctx: Pick<canvasInteractionsActionContext, 'CANVAS_FOLDER_PICKER_INITIAL_VISIBLE' | 'canvasFolderPickerItemsRef' | 'canvasFolderPickerLoadingRef' | 'canvasFolderPickerRequestRef' | 'setCanvasFolderImportPrompt' | 'setCanvasFolderPickerError' | 'setCanvasFolderPickerHasMore' | 'setCanvasFolderPickerItems' | 'setCanvasFolderPickerTotal' | 'setCanvasFolderPickerVisibleCount' | 'setIsCanvasFolderPickerLoading'>) => {
  const { CANVAS_FOLDER_PICKER_INITIAL_VISIBLE, canvasFolderPickerItemsRef, canvasFolderPickerLoadingRef, canvasFolderPickerRequestRef, setCanvasFolderImportPrompt, setCanvasFolderPickerError, setCanvasFolderPickerHasMore, setCanvasFolderPickerItems, setCanvasFolderPickerTotal, setCanvasFolderPickerVisibleCount, setIsCanvasFolderPickerLoading } = ctx;
    canvasFolderPickerRequestRef.current += 1;
    canvasFolderPickerLoadingRef.current = false;
    canvasFolderPickerItemsRef.current = [];
    setCanvasFolderPickerVisibleCount(CANVAS_FOLDER_PICKER_INITIAL_VISIBLE);
    setCanvasFolderPickerItems([]);
    setCanvasFolderPickerTotal(0);
    setCanvasFolderPickerHasMore(false);
    setIsCanvasFolderPickerLoading(false);
    setCanvasFolderPickerError('');
    setCanvasFolderImportPrompt(null);

};

export const loadCanvasFolderMediaPageImpl = async (ctx: Pick<canvasInteractionsActionContext, 'assetStorageMode' | 'canvasFolderPickerItemsRef' | 'canvasFolderPickerLoadingRef' | 'canvasFolderPickerPagingRef' | 'canvasFolderPickerRequestRef' | 'closeCanvasFolderMediaPicker' | 'folders' | 'getFolderMediaItemsForCanvas' | 'setCanvasFolderImportPrompt' | 'setCanvasFolderPickerError' | 'setCanvasFolderPickerHasMore' | 'setCanvasFolderPickerItems' | 'setCanvasFolderPickerTotal' | 'setIsCanvasFolderPickerLoading' | 'showToast'>, folderId?: string, reset: boolean = false) => {
  const { assetStorageMode, canvasFolderPickerItemsRef, canvasFolderPickerLoadingRef, canvasFolderPickerPagingRef, canvasFolderPickerRequestRef, closeCanvasFolderMediaPicker, folders, getFolderMediaItemsForCanvas, setCanvasFolderImportPrompt, setCanvasFolderPickerError, setCanvasFolderPickerHasMore, setCanvasFolderPickerItems, setCanvasFolderPickerTotal, setIsCanvasFolderPickerLoading, showToast } = ctx;
    if (!reset && canvasFolderPickerLoadingRef.current) return;

    const folderKey = folderId || '__main_drawer__';
    const requestId = reset
      ? canvasFolderPickerRequestRef.current + 1
      : canvasFolderPickerRequestRef.current;
    if (reset) {
      canvasFolderPickerRequestRef.current = requestId;
      canvasFolderPickerItemsRef.current = [];
      canvasFolderPickerPagingRef.current = {
        folderKey,
        imageOffset: 0,
        videoOffset: 0,
        imageTotal: 0,
        videoTotal: 0,
      };
      setCanvasFolderPickerItems([]);
      setCanvasFolderPickerTotal(0);
      setCanvasFolderPickerHasMore(false);
      setCanvasFolderPickerError('');
    }

    if (assetStorageMode === 'json') {
      const mediaItems = getFolderMediaItemsForCanvas(folderId);
      canvasFolderPickerItemsRef.current = mediaItems;
      setCanvasFolderPickerItems(mediaItems);
      setCanvasFolderPickerTotal(mediaItems.length);
      setCanvasFolderPickerHasMore(false);
      setCanvasFolderImportPrompt(prev => (
        prev && prev.folderId === folderId ? { ...prev, count: mediaItems.length } : prev
      ));
      if (mediaItems.length === 0) {
        closeCanvasFolderMediaPicker();
        showToast('这个文件夹里还没有图片或视频');
      }
      return;
    }

    if (assetStorageMode !== 'sqlite') {
      setCanvasFolderPickerError('素材库仍在初始化，请稍后重试');
      return;
    }

    const paging = canvasFolderPickerPagingRef.current;
    if (!reset && paging.folderKey !== folderKey) return;
    if (!reset && paging.imageOffset >= paging.imageTotal && paging.videoOffset >= paging.videoTotal) {
      setCanvasFolderPickerHasMore(false);
      return;
    }

    canvasFolderPickerLoadingRef.current = true;
    setIsCanvasFolderPickerLoading(true);
    setCanvasFolderPickerError('');

    try {
      const imageQuery = buildCanvasFolderMediaQuery(folders, folderId, 'image', reset ? 0 : paging.imageOffset);
      const videoQuery = buildCanvasFolderMediaQuery(folders, folderId, 'video', reset ? 0 : paging.videoOffset);
      const [imagePage, videoPage, imageTotal, videoTotal] = reset
        ? await Promise.all([
          listAssets(imageQuery),
          listAssets(videoQuery),
          getAssetCount(imageQuery),
          getAssetCount(videoQuery),
        ])
        : await Promise.all([
          paging.imageOffset < paging.imageTotal ? listAssets(imageQuery) : Promise.resolve([] as BufferItem[]),
          paging.videoOffset < paging.videoTotal ? listAssets(videoQuery) : Promise.resolve([] as BufferItem[]),
          Promise.resolve(paging.imageTotal),
          Promise.resolve(paging.videoTotal),
        ]);

      if (canvasFolderPickerRequestRef.current !== requestId) return;

      const compactPage = [...imagePage, ...videoPage].map(stripHeavyDataThumbnail);
      const merged = mergeCanvasFolderMediaItems(
        reset ? [] : canvasFolderPickerItemsRef.current,
        compactPage,
      );
      const nextPaging: CanvasFolderMediaPagingState = {
        folderKey,
        imageOffset: (reset ? 0 : paging.imageOffset) + imagePage.length,
        videoOffset: (reset ? 0 : paging.videoOffset) + videoPage.length,
        imageTotal,
        videoTotal,
      };
      const total = imageTotal + videoTotal;
      const hasMore = nextPaging.imageOffset < imageTotal || nextPaging.videoOffset < videoTotal;

      canvasFolderPickerItemsRef.current = merged;
      canvasFolderPickerPagingRef.current = nextPaging;
      setCanvasFolderPickerItems(merged);
      setCanvasFolderPickerTotal(total);
      setCanvasFolderPickerHasMore(hasMore);
      setCanvasFolderImportPrompt(prev => (
        prev && prev.folderId === folderId ? { ...prev, count: total } : prev
      ));

      if (total === 0) {
        closeCanvasFolderMediaPicker();
        showToast('这个文件夹里还没有图片或视频');
      }
    } catch (err) {
      if (canvasFolderPickerRequestRef.current !== requestId) return;
      console.error('load canvas folder media failed:', err);
      setCanvasFolderPickerError('素材加载失败，点击重试');
    } finally {
      if (canvasFolderPickerRequestRef.current === requestId) {
        canvasFolderPickerLoadingRef.current = false;
        setIsCanvasFolderPickerLoading(false);
      }
    }

};

export const requestAddFolderMediaToCanvasImpl = (ctx: Pick<canvasInteractionsActionContext, 'CANVAS_FOLDER_PICKER_INITIAL_VISIBLE' | 'loadCanvasFolderMediaPage' | 'setCanvasFolderImportPrompt' | 'setCanvasFolderPickerVisibleCount'>, folderId?: string, folderName: string = '主抽屉', anchor?: { x: number; y: number }) => {
  const { CANVAS_FOLDER_PICKER_INITIAL_VISIBLE, loadCanvasFolderMediaPage, setCanvasFolderImportPrompt, setCanvasFolderPickerVisibleCount } = ctx;
    setCanvasFolderPickerVisibleCount(CANVAS_FOLDER_PICKER_INITIAL_VISIBLE);
    setCanvasFolderImportPrompt({
      folderId,
      folderName,
      count: 0,
      x: anchor?.x ?? 72,
      y: anchor?.y ?? 96,
    });
    void loadCanvasFolderMediaPage(folderId, true);

};

export const addFolderMediaToCanvasImpl = async (ctx: Pick<canvasInteractionsActionContext, 'appendCanvasItems' | 'createAssetId' | 'getCanvasDropPosition' | 'makeCanvasNodeId' | 'showToast'>, mediaItems: BufferItem[]) => {
  const { appendCanvasItems, createAssetId, getCanvasDropPosition, makeCanvasNodeId, showToast } = ctx;
    if (mediaItems.length === 0) {
      showToast('这个文件夹里还没有图片或视频');
      return;
    }

    const now = Date.now();
    const nextItems = mediaItems.map((source, index) => {
      const item: BufferItem = {
        ...source,
        id: createAssetId(),
        sourceItemId: source.id,
        createdAt: now + index,
        isQuickAccess: false,
      };
      const pos = getCanvasDropPosition(index);
      const size = source.type === 'video'
        ? source.thumbnail ? getFastCanvasImageDisplaySize(item) : { width: 320, height: 180 }
        : getFastCanvasImageDisplaySize(item);
      return {
        id: makeCanvasNodeId(item.id, source.type),
        item,
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
      } as CanvasImageItem;
    });

    const addedCount = appendCanvasItems(nextItems, '添加素材到画布');
    if (addedCount > 0) showToast(`已添加 ${addedCount} 个图片或视频素材到无限画布`);

};

export const cacheWebImageFromCandidatesImpl = async (ctx: Record<never, never>, urls: string[], name: string, dir?: string) => {
  const {  } = ctx;
    const candidates = Array.from(new Set(urls
      .map(normalizeDraggedUrl)
      .filter(value => /^(https?:|data:image\/)/i.test(value))))
      .slice(0, 7);
    let lastError: unknown = new Error('No usable image URL candidates');
    for (const candidate of candidates) {
      try {
        const cachedPath = await invoke<string>('cache_web_image', {
          url: candidate,
          name,
          dir,
        });
        if (cachedPath) return { cachedPath, sourceUrl: candidate };
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;

};

export const claimExternalWebImageDropImpl = (ctx: Pick<canvasInteractionsActionContext, 'lastAcceptedWebImageRef' | 'lastWebImageDropAtRef' | 'lastWebImageUrlRef' | 'setItems' | 'supersededWebImageItemIdsRef' | 'updateCanvasItemsImmediate'>, normalizedUrl: string, itemId: string, location: 'drawer' | 'canvas') => {
  const { lastAcceptedWebImageRef, lastWebImageDropAtRef, lastWebImageUrlRef, setItems, supersededWebImageItemIdsRef, updateCanvasItemsImmediate } = ctx;
    const now = Date.now();
    const inline = normalizedUrl.startsWith('data:image/');
    const previous = lastAcceptedWebImageRef.current;
    if (previous) {
      const elapsed = now - previous.at;
      if (previous.inline && inline && elapsed < 1200) return false;
      if (previous.inline && !inline && elapsed < 3000) return false;
      if (!previous.inline && !inline && elapsed < 500) return false;
      if (!previous.inline && inline && elapsed < 3000) {
        supersededWebImageItemIdsRef.current.add(previous.id);
        if (previous.location === 'canvas') {
          updateCanvasItemsImmediate(items => items.filter(item => item.item.id !== previous.id));
        } else {
          setItems(items => items.filter(item => item.id !== previous.id));
        }
      }
    }

    lastAcceptedWebImageRef.current = { id: itemId, location, inline, at: now };
    lastWebImageUrlRef.current = normalizedUrl;
    lastWebImageDropAtRef.current = now;
    return true;

};

export const addCanvasWebImageUrlImpl = async (ctx: Pick<canvasInteractionsActionContext, 'appendCanvasItems' | 'cacheWebImageFromCandidates' | 'claimExternalWebImageDrop' | 'createAssetId' | 'getCanvasDropPosition' | 'getPersistentWebSourceUrl' | 'getWebCaptureSourceSite' | 'makeCanvasNodeId' | 'showToast' | 'supersededWebImageItemIdsRef' | 'updateCanvasItemsImmediate' | 'webImageCacheDirRef'>, url: string, name?: string, client?: { x: number; y: number }, fallbackUrls: string[] = [], captureMetadata: WebImageCaptureMetadata = {}) => {
  const { appendCanvasItems, cacheWebImageFromCandidates, claimExternalWebImageDrop, createAssetId, getCanvasDropPosition, getPersistentWebSourceUrl, getWebCaptureSourceSite, makeCanvasNodeId, showToast, supersededWebImageItemIdsRef, updateCanvasItemsImmediate, webImageCacheDirRef } = ctx;
    const normalizedUrl = normalizeDraggedUrl(url);
    if (!normalizedUrl) return;

    const itemId = createAssetId();
    if (!claimExternalWebImageDrop(normalizedUrl, itemId, 'canvas')) return;
    const displayName = name || getNameFromUrl(normalizedUrl);
    const persistentSourceUrl = getPersistentWebSourceUrl(captureMetadata.sourceUrl)
      || (!captureMetadata.captureSource ? getPersistentWebSourceUrl(normalizedUrl) : undefined);
    const item: BufferItem = {
      id: itemId,
      type: 'image',
      content: displayName,
      name: displayName,
      url: normalizedUrl,
      path: normalizedUrl,
      sourceUrl: persistentSourceUrl,
      originalUrl: persistentSourceUrl,
      pageUrl: captureMetadata.pageUrl,
      sourceSite: getWebCaptureSourceSite(captureMetadata.pageUrl),
      pageTitle: captureMetadata.pageTitle,
      imageAlt: captureMetadata.imageAlt,
      originalWidth: captureMetadata.width,
      originalHeight: captureMetadata.height,
      captureSource: captureMetadata.captureSource,
      captureSourceType: captureMetadata.sourceType,
      createdAt: Date.now(),
      isQuickAccess: false,
    };
    const pos = getCanvasDropPosition(0, client);
    const canvasId = makeCanvasNodeId(itemId, 'web_image');
    const size = await readImageDisplaySize(normalizedUrl);
    const canvasItem = {
      id: canvasId,
      item,
      x: pos.x,
      y: pos.y,
      width: size.width,
      height: size.height,
    };
    if (appendCanvasItems([canvasItem], '添加图片到画布', false) === 0) return;
    showToast('已添加网页图片到无限画布，正在缓存');

    const latestCacheDir = (
      webImageCacheDirRef.current ||
      localStorage.getItem('drawer_web_image_cache_dir') ||
      ''
    ).trim();

    cacheWebImageFromCandidates(
      [normalizedUrl, ...fallbackUrls],
      displayName,
      latestCacheDir || undefined,
    ).then(({ cachedPath, sourceUrl }) => {
      if (supersededWebImageItemIdsRef.current.delete(itemId)) return;
      if (!cachedPath) return;
      const cachedUrl = convertFileSrc(cachedPath);
      updateCanvasItemsImmediate(prev => prev.map(canvasItem => canvasItem.id === canvasId
        ? {
            ...canvasItem,
            item: {
              ...canvasItem.item,
              url: cachedUrl,
              path: cachedPath,
              sourceUrl: persistentSourceUrl || getPersistentWebSourceUrl(sourceUrl),
              originalUrl: persistentSourceUrl || getPersistentWebSourceUrl(sourceUrl),
            },
          }
        : canvasItem));
      if (captureMetadata.dragId) {
        void emitTo('edge', 'browser-extension-image-save-succeeded', { dragId: captureMetadata.dragId });
      }
    }).catch((err) => {
      if (supersededWebImageItemIdsRef.current.delete(itemId)) return;
      console.warn('画布网页图片缓存失败:', err);
      if (captureMetadata.captureSource === 'browser-extension') {
        updateCanvasItemsImmediate(items => items.filter(canvasItem => canvasItem.id !== canvasId));
        if (captureMetadata.dragId) {
          void emitTo('edge', 'browser-extension-image-save-failed', { dragId: captureMetadata.dragId });
        }
      }
      showToast('网页图片已加入画布，缓存失败');
    });

};

export const enterCanvasModeImpl = (ctx: Pick<canvasInteractionsActionContext, 'canvasItemsRef' | 'canvasReturnScrollRef' | 'canvasSurfaceRef' | 'getCanvasPrimaryImageItem' | 'isCanvasModeRef' | 'isPinnedRef' | 'scheduleCanvasFocusItemById' | 'setActiveFolderId' | 'setActiveTab' | 'setDrawerState' | 'setIsCanvasMode' | 'setIsOpen' | 'setIsPinned' | 'setIsSearchActive' | 'setIsSelectMode' | 'setSelectedIds' | 'setShowSettings' | 'setShowTextInput' | 'showToast' | 'writeCanvasSurfaceScroll'>) => {
  const { canvasItemsRef, canvasReturnScrollRef, canvasSurfaceRef, getCanvasPrimaryImageItem, isCanvasModeRef, isPinnedRef, scheduleCanvasFocusItemById, setActiveFolderId, setActiveTab, setDrawerState, setIsCanvasMode, setIsOpen, setIsPinned, setIsSearchActive, setIsSelectMode, setSelectedIds, setShowSettings, setShowTextInput, showToast, writeCanvasSurfaceScroll } = ctx;
    const hasCanvasContent = canvasItemsRef.current.length > 0;
    const primaryImageId = getCanvasPrimaryImageItem()?.id || canvasItemsRef.current[0]?.id || null;
    isCanvasModeRef.current = true;
    setIsCanvasMode(true);
    setActiveFolderId('all');
    setActiveTab('all');
    setShowSettings(false);
    setIsSearchActive(false);
    setShowTextInput(false);
    setIsSelectMode(false);
    setSelectedIds([]);
    setIsOpen(true);
    setIsPinned(false);
    isPinnedRef.current = false;
    setDrawerState('open');
    invoke('toggle_pin', { pinned: false }).catch(()=>{});
    showToast('已进入无限画布模式');
    window.requestAnimationFrame(() => {
      const surface = canvasSurfaceRef.current;
      const scroll = canvasReturnScrollRef.current;
      if (hasCanvasContent) {
        scheduleCanvasFocusItemById(primaryImageId);
      } else if (surface && scroll) {
        writeCanvasSurfaceScroll(surface, scroll.left, scroll.top);
      }
      canvasSurfaceRef.current?.focus({ preventScroll: true });
    });

};

export const startMainDrawerLongPressImpl = (ctx: Pick<canvasInteractionsActionContext, 'clearMainDrawerLongPress' | 'enterCanvasMode' | 'isCanvasModeRef' | 'mainDrawerLongPressTimerRef' | 'mainDrawerLongPressTriggeredRef' | 'requestExitCanvasMode'>, e: React.PointerEvent) => {
  const { clearMainDrawerLongPress, enterCanvasMode, isCanvasModeRef, mainDrawerLongPressTimerRef, mainDrawerLongPressTriggeredRef, requestExitCanvasMode } = ctx;
    if (e.button !== 0) return;
    mainDrawerLongPressTriggeredRef.current = false;
    clearMainDrawerLongPress();
    mainDrawerLongPressTimerRef.current = window.setTimeout(() => {
      mainDrawerLongPressTriggeredRef.current = true;
      if (isCanvasModeRef.current) requestExitCanvasMode();
      else enterCanvasMode();
    }, 620);

};

export const startCanvasItemDragImpl = (ctx: Pick<canvasInteractionsActionContext, 'CANVAS_INTERACTION_BACKGROUND_SETTLE_MS' | 'CANVAS_INTERACTION_DEBUG' | 'applyCanvasSelectionDomFeedback' | 'autoScrollCanvasNearEdge' | 'cancelCanvasImageSourceUpgradeQueue' | 'cancelCanvasInteractionPaint' | 'canvasContentRef' | 'canvasDragDebugRef' | 'canvasDragRef' | 'canvasInputPickTargetIdRef' | 'canvasItemsPatchCommitRef' | 'canvasItemsRef' | 'canvasPointerInteractionCleanupRef' | 'canvasResizeRef' | 'canvasScaleRef' | 'canvasSelectedIdsRef' | 'canvasSurfaceRef' | 'clearCanvasItemInteractionStyles' | 'expandCanvasSelectionIdsWithGroups' | 'getCanvasItemElement' | 'getCanvasSelectionIdsForItem' | 'growCanvasToFit' | 'isCanvasSpacePressedRef' | 'makeCanvasItemBoxMap' | 'markCanvasNodesChanged' | 'pickCanvasImageForGenerator' | 'pushCanvasUndoSnapshot' | 'restoreCanvasItemBoxStyles' | 'scheduleCanvasInteractionPaint' | 'scheduleCanvasSelectionImageSources' | 'setCanvasInteractionActive' | 'setCanvasItemDraggingFlag' | 'setCanvasSelectedIds' | 'settleCanvasZoomBeforePointerInteraction' | 'updateCanvasItemsDeferred'>, e: React.PointerEvent, id: string) => {
  const { CANVAS_INTERACTION_BACKGROUND_SETTLE_MS, CANVAS_INTERACTION_DEBUG, applyCanvasSelectionDomFeedback, autoScrollCanvasNearEdge, cancelCanvasImageSourceUpgradeQueue, cancelCanvasInteractionPaint, canvasContentRef, canvasDragDebugRef, canvasDragRef, canvasInputPickTargetIdRef, canvasItemsPatchCommitRef, canvasItemsRef, canvasPointerInteractionCleanupRef, canvasResizeRef, canvasScaleRef, canvasSelectedIdsRef, canvasSurfaceRef, clearCanvasItemInteractionStyles, expandCanvasSelectionIdsWithGroups, getCanvasItemElement, getCanvasSelectionIdsForItem, growCanvasToFit, isCanvasSpacePressedRef, makeCanvasItemBoxMap, markCanvasNodesChanged, pickCanvasImageForGenerator, pushCanvasUndoSnapshot, restoreCanvasItemBoxStyles, scheduleCanvasInteractionPaint, scheduleCanvasSelectionImageSources, setCanvasInteractionActive, setCanvasItemDraggingFlag, setCanvasSelectedIds, settleCanvasZoomBeforePointerInteraction, updateCanvasItemsDeferred } = ctx;
    if (e.button !== 0) return;
    if (isCanvasSpacePressedRef.current || canvasResizeRef.current) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('[data-no-drag="true"], textarea, input, button, select, [contenteditable="true"]')) return;
    const current = canvasItemsRef.current.find(item => item.id === id);
    if (!current) return;
    const inputPickTargetId = canvasInputPickTargetIdRef.current;
    if (inputPickTargetId) {
      e.preventDefault();
      e.stopPropagation();
      pickCanvasImageForGenerator(id, inputPickTargetId);
      return;
    }
    settleCanvasZoomBeforePointerInteraction();
    e.preventDefault();
    e.stopPropagation();
    cancelCanvasImageSourceUpgradeQueue();
    const pointerCaptureTarget = e.currentTarget as HTMLElement;
    pointerCaptureTarget.setPointerCapture?.(e.pointerId);
    const currentSelected = canvasSelectedIdsRef.current;
    const isAdditive = e.shiftKey || e.ctrlKey || e.metaKey;
    const itemSelectionIds = getCanvasSelectionIdsForItem(id);
    const isItemSelectionSelected = itemSelectionIds.every(selectionId => currentSelected.includes(selectionId));
    let nextSelected = isItemSelectionSelected ? currentSelected : itemSelectionIds;
    if (isAdditive) {
      const itemSelectionSet = new Set(itemSelectionIds);
      nextSelected = isItemSelectionSelected
        ? currentSelected.filter(selectedId => !itemSelectionSet.has(selectedId))
        : [...currentSelected, ...itemSelectionIds];
      if (nextSelected.length === 0) nextSelected = itemSelectionIds;
    }
    nextSelected = expandCanvasSelectionIdsWithGroups(nextSelected);
    const selectionChanged = currentSelected.length !== nextSelected.length
      || currentSelected.some((value, index) => value !== nextSelected[index]);
    if (selectionChanged) {
      applyCanvasSelectionDomFeedback(currentSelected, nextSelected);
      canvasSelectedIdsRef.current = nextSelected;
      scheduleCanvasSelectionImageSources([...currentSelected, ...nextSelected]);
    }
    const dragIds = nextSelected.includes(id) ? nextSelected : [id];
    const dragIdSet = new Set(dragIds);
    const hasConnections = canvasItemsRef.current.some(item => (
      (dragIdSet.has(item.id) && (item.inputs || []).length > 0)
      || (item.inputs || []).some(sourceId => dragIdSet.has(sourceId))
    ));
    canvasDragRef.current = {
      ids: dragIds,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startScrollLeft: canvasSurfaceRef.current?.scrollLeft ?? 0,
      startScrollTop: canvasSurfaceRef.current?.scrollTop ?? 0,
      startItems: makeCanvasItemBoxMap(dragIds),
      latestDelta: { dx: 0, dy: 0 },
      hasMoved: false,
      hasConnections,
      pendingSelectionIds: selectionChanged ? nextSelected : null,
    };
    canvasDragDebugRef.current = {
      startNodeCount: canvasItemsRef.current.length,
      pointerMoveCount: 0,
      lastNodeCount: canvasItemsRef.current.length,
    };
    dragIds.forEach((dragId) => {
      getCanvasItemElement(dragId)?.setAttribute('data-canvas-dragging', 'true');
    });
    canvasContentRef.current
      ?.querySelectorAll<HTMLElement>('[data-canvas-selection-frame="true"], [data-canvas-group-selected="true"]')
      .forEach((frame) => { frame.style.willChange = 'transform'; });
    if (CANVAS_INTERACTION_DEBUG) {
      console.debug('[canvas-drag] start', {
        ids: dragIds,
        draggingNodeCount: dragIds.length,
        nodeCount: canvasItemsRef.current.length,
      });
    }
    const onMove = (event: PointerEvent) => {
      const drag = canvasDragRef.current;
      if (!drag || !drag.ids.includes(id)) return;
      event.preventDefault();
      event.stopPropagation();
      const debug = canvasDragDebugRef.current;
      if (CANVAS_INTERACTION_DEBUG && debug) {
        debug.pointerMoveCount += 1;
        debug.lastNodeCount = canvasItemsRef.current.length;
        if (debug.pointerMoveCount === 1 || debug.pointerMoveCount % 30 === 0) {
          console.debug('[canvas-drag] pointermove node count', {
            pointerMoveCount: debug.pointerMoveCount,
            draggingNodeCount: drag.ids.length,
            nodeCount: debug.lastNodeCount,
            createdCanvasNodeCountDuringDrag: Math.max(0, debug.lastNodeCount - debug.startNodeCount),
            duplicatedNodeCountDuringDrag: Math.max(0, debug.lastNodeCount - new Set(canvasItemsRef.current.map(item => item.id)).size),
          });
        }
      }
      autoScrollCanvasNearEdge(event);
      const scale = canvasScaleRef.current || 1;
      const surface = canvasSurfaceRef.current;
      const scrollDx = surface ? (surface.scrollLeft - drag.startScrollLeft) / scale : 0;
      const scrollDy = surface ? (surface.scrollTop - drag.startScrollTop) / scale : 0;
      const dx = (event.clientX - drag.startClientX) / scale + scrollDx;
      const dy = (event.clientY - drag.startClientY) / scale + scrollDy;
      if (!drag.hasMoved && Math.hypot(dx, dy) <= 1.5) return;
      if (!drag.hasMoved) {
        setCanvasInteractionActive(true, 120, { preserveImageSources: true });
        setCanvasItemDraggingFlag(drag.ids, true);
        pushCanvasUndoSnapshot('移动画布元素', { shareImmutableItems: true });
        drag.hasMoved = true;
      }
      drag.latestDelta = { dx, dy };
      const moved = drag.ids
        .map(dragId => drag.startItems[dragId])
        .filter((item): item is CanvasItemBox => !!item)
        .map(start => ({
          ...start,
          x: Math.max(0, start.x + dx),
          y: Math.max(0, start.y + dy),
        }));
      if (moved.length > 0) {
        growCanvasToFit(
          Math.max(...moved.map(item => item.x + item.width)),
          Math.max(...moved.map(item => item.y + item.height))
        );
      }
      scheduleCanvasInteractionPaint({ kind: 'move', ids: drag.ids, dx, dy });
    };

    const removeDragListeners = () => {
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
      if (canvasPointerInteractionCleanupRef.current === removeDragListeners) {
        canvasPointerInteractionCleanupRef.current = null;
      }
    };

    const onUp = () => {
      const drag = canvasDragRef.current;
      canvasDragRef.current = null;
      cancelCanvasInteractionPaint();
      const debug = canvasDragDebugRef.current;
      canvasDragDebugRef.current = null;
      if (drag) {
        if (drag.hasMoved) {
          const { dx, dy } = drag.latestDelta;
          const changedIds = drag.ids.filter(dragId => !!drag.startItems[dragId]);
          if (changedIds.length > 0) {
            canvasItemsPatchCommitRef.current = true;
            const changedSet = new Set(changedIds);
            updateCanvasItemsDeferred(prev => prev.map(item => {
              if (!changedSet.has(item.id)) return item;
              const start = drag.startItems[item.id];
              return start ? {
                ...item,
                x: Math.max(0, start.x + dx),
                y: Math.max(0, start.y + dy),
              } : item;
            }));
            restoreCanvasItemBoxStyles(changedIds);
            markCanvasNodesChanged(changedIds);
          }
        }
        clearCanvasItemInteractionStyles(drag.ids, drag.hasMoved);
        if (drag.pendingSelectionIds) {
          const pendingSelectionIds = drag.pendingSelectionIds;
          startTransition(() => setCanvasSelectedIds(pendingSelectionIds));
        }
        const endNodeCount = canvasItemsRef.current.length;
        if (CANVAS_INTERACTION_DEBUG) {
          console.debug('[canvas-drag] pointerup', {
            draggingNodeCount: drag.ids.length,
            nodeCount: endNodeCount,
            startNodeCount: debug?.startNodeCount ?? endNodeCount,
            pointerMoveCount: debug?.pointerMoveCount ?? 0,
            createdCanvasNodeCountDuringDrag: Math.max(0, endNodeCount - (debug?.startNodeCount ?? endNodeCount)),
            duplicatedNodeCountDuringDrag: Math.max(0, endNodeCount - new Set(canvasItemsRef.current.map(item => item.id)).size),
          });
        }
      }
      if (drag?.hasMoved) setCanvasInteractionActive(false, CANVAS_INTERACTION_BACKGROUND_SETTLE_MS);
      pointerCaptureTarget.releasePointerCapture?.(e.pointerId);
      removeDragListeners();
    };

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
    canvasPointerInteractionCleanupRef.current = removeDragListeners;

};

export const startCanvasItemResizeImpl = (ctx: Pick<canvasInteractionsActionContext, 'CANVAS_INTERACTION_BACKGROUND_SETTLE_MS' | 'cancelCanvasInteractionPaint' | 'canvasItemsPatchCommitRef' | 'canvasItemsRef' | 'canvasPointerInteractionCleanupRef' | 'canvasResizeRef' | 'canvasScaleRef' | 'canvasSelectedIdsRef' | 'clearCanvasItemInteractionStyles' | 'getCanvasItemRenderedBox' | 'growCanvasToFit' | 'markCanvasNodesChanged' | 'pushCanvasUndoSnapshot' | 'restoreCanvasItemBoxStyles' | 'scheduleCanvasInteractionPaint' | 'setCanvasInteractionActive' | 'setCanvasItemResizingFlag' | 'settleCanvasZoomBeforePointerInteraction' | 'updateCanvasItemsDeferred' | 'updateCanvasSelection'>, e: React.PointerEvent, id: string, corner: CanvasResizeCorner) => {
  const { CANVAS_INTERACTION_BACKGROUND_SETTLE_MS, cancelCanvasInteractionPaint, canvasItemsPatchCommitRef, canvasItemsRef, canvasPointerInteractionCleanupRef, canvasResizeRef, canvasScaleRef, canvasSelectedIdsRef, clearCanvasItemInteractionStyles, getCanvasItemRenderedBox, growCanvasToFit, markCanvasNodesChanged, pushCanvasUndoSnapshot, restoreCanvasItemBoxStyles, scheduleCanvasInteractionPaint, setCanvasInteractionActive, setCanvasItemResizingFlag, settleCanvasZoomBeforePointerInteraction, updateCanvasItemsDeferred, updateCanvasSelection } = ctx;
    if (e.button !== 0) return;
    const current = canvasItemsRef.current.find(item => item.id === id);
    if (!current) return;
    settleCanvasZoomBeforePointerInteraction();
    const currentBox = getCanvasItemRenderedBox(current);
    e.preventDefault();
    e.stopPropagation();
    const pointerCaptureTarget = e.currentTarget as HTMLElement;
    pointerCaptureTarget.setPointerCapture?.(e.pointerId);
    setCanvasInteractionActive(true);
    if (!canvasSelectedIdsRef.current.includes(id)) updateCanvasSelection([id]);

    canvasResizeRef.current = {
      id,
      corner,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: currentBox.x,
      startY: currentBox.y,
      startWidth: currentBox.width,
      startHeight: currentBox.height,
      aspect: currentBox.width / Math.max(1, currentBox.height),
      latestBox: null,
      hasResized: false,
    };
    setCanvasItemResizingFlag([id], true);

    const onMove = (event: PointerEvent) => {
      const resize = canvasResizeRef.current;
      if (!resize || resize.id !== id) return;
      event.preventDefault();
      event.stopPropagation();
      const scale = canvasScaleRef.current || 1;
      const dx = (event.clientX - resize.startClientX) / scale;
      const dy = (event.clientY - resize.startClientY) / scale;
      if (!resize.hasResized && Math.hypot(dx, dy) > 1.5) {
        pushCanvasUndoSnapshot('缩放画布元素', { shareImmutableItems: true });
        resize.hasResized = true;
      }
      const isWest = resize.corner.includes('w');
      const isNorth = resize.corner.includes('n');
      const rawWidth = isWest ? resize.startWidth - dx : resize.startWidth + dx;
      const rawHeight = isNorth ? resize.startHeight - dy : resize.startHeight + dy;
      const nextWidth = clamp(Math.max(rawWidth, rawHeight * resize.aspect), CANVAS_MIN_IMAGE_WIDTH, CANVAS_MAX_IMAGE_WIDTH);
      const nextHeight = nextWidth / resize.aspect;
      const nextX = isWest ? resize.startX + resize.startWidth - nextWidth : resize.startX;
      const nextY = isNorth ? resize.startY + resize.startHeight - nextHeight : resize.startY;
      const finalX = Math.max(0, nextX);
      const finalY = Math.max(0, nextY);
      const nextBox = {
        x: finalX,
        y: finalY,
        width: nextWidth,
        height: nextHeight,
      };
      resize.latestBox = nextBox;

      growCanvasToFit(finalX + nextWidth, finalY + nextHeight);
      scheduleCanvasInteractionPaint({ kind: 'resize', boxes: { [id]: nextBox } });
    };
    const removeResizeListeners = () => {
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
      if (canvasPointerInteractionCleanupRef.current === removeResizeListeners) {
        canvasPointerInteractionCleanupRef.current = null;
      }
    };

    const onUp = () => {
      const resize = canvasResizeRef.current;
      canvasResizeRef.current = null;
      cancelCanvasInteractionPaint();
      if (resize?.hasResized && resize.latestBox) {
        const nextBox = resize.latestBox;
        canvasItemsPatchCommitRef.current = true;
        updateCanvasItemsDeferred(prev => prev.map(item => item.id === id ? {
          ...item,
          x: nextBox.x,
          y: nextBox.y,
          width: nextBox.width,
          height: nextBox.height,
        } : item));
        markCanvasNodesChanged([id]);
      }
      clearCanvasItemInteractionStyles([id]);
      restoreCanvasItemBoxStyles([id]);
      setCanvasInteractionActive(false, CANVAS_INTERACTION_BACKGROUND_SETTLE_MS);
      pointerCaptureTarget.releasePointerCapture?.(e.pointerId);
      removeResizeListeners();
    };

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
    canvasPointerInteractionCleanupRef.current = removeResizeListeners;

};

export const startCanvasGroupResizeImpl = (ctx: Pick<canvasInteractionsActionContext, 'CANVAS_INTERACTION_BACKGROUND_SETTLE_MS' | 'cancelCanvasInteractionPaint' | 'canvasGroupResizeRef' | 'canvasItemsPatchCommitRef' | 'canvasItemsRef' | 'canvasPointerInteractionCleanupRef' | 'canvasScaleRef' | 'canvasSelectedIdsRef' | 'clearCanvasItemInteractionStyles' | 'getCanvasItemRenderedBox' | 'growCanvasToFit' | 'markCanvasNodesChanged' | 'pushCanvasUndoSnapshot' | 'restoreCanvasItemBoxStyles' | 'scheduleCanvasInteractionPaint' | 'setCanvasInteractionActive' | 'setCanvasItemResizingFlag' | 'settleCanvasZoomBeforePointerInteraction' | 'updateCanvasItemsDeferred'>, e: React.PointerEvent, corner: CanvasResizeCorner) => {
  const { CANVAS_INTERACTION_BACKGROUND_SETTLE_MS, cancelCanvasInteractionPaint, canvasGroupResizeRef, canvasItemsPatchCommitRef, canvasItemsRef, canvasPointerInteractionCleanupRef, canvasScaleRef, canvasSelectedIdsRef, clearCanvasItemInteractionStyles, getCanvasItemRenderedBox, growCanvasToFit, markCanvasNodesChanged, pushCanvasUndoSnapshot, restoreCanvasItemBoxStyles, scheduleCanvasInteractionPaint, setCanvasInteractionActive, setCanvasItemResizingFlag, settleCanvasZoomBeforePointerInteraction, updateCanvasItemsDeferred } = ctx;
    if (e.button !== 0) return;
    const selectedIds = canvasSelectedIdsRef.current;
    if (selectedIds.length < 2) return;
    settleCanvasZoomBeforePointerInteraction();
    const selectedIdSet = new Set(selectedIds);
    const startItems = canvasItemsRef.current
      .filter(item => selectedIdSet.has(item.id))
      .reduce<Record<string, CanvasItemBox>>((acc, item) => {
        acc[item.id] = getCanvasItemRenderedBox(item);
        return acc;
      }, {});
    const startBounds = getCanvasBoxesBounds(Object.values(startItems));
    if (!startBounds || startBounds.width <= 0 || startBounds.height <= 0) return;
    e.preventDefault();
    e.stopPropagation();
    const pointerCaptureTarget = e.currentTarget as HTMLElement;
    pointerCaptureTarget.setPointerCapture?.(e.pointerId);
    setCanvasInteractionActive(true);

    canvasGroupResizeRef.current = {
      corner,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startBounds,
      startItems,
      aspect: startBounds.width / Math.max(1, startBounds.height),
      latestBoxes: null,
      hasResized: false,
    };
    setCanvasItemResizingFlag(selectedIds, true);

    const onMove = (event: PointerEvent) => {
      const resize = canvasGroupResizeRef.current;
      if (!resize) return;
      event.preventDefault();
      event.stopPropagation();
      const scale = canvasScaleRef.current || 1;
      const dx = (event.clientX - resize.startClientX) / scale;
      const dy = (event.clientY - resize.startClientY) / scale;
      if (!resize.hasResized && Math.hypot(dx, dy) > 1.5) {
        pushCanvasUndoSnapshot('缩放画布元素', { shareImmutableItems: true });
        resize.hasResized = true;
      }
      const isWest = resize.corner.includes('w');
      const isNorth = resize.corner.includes('n');
      const rawWidth = isWest ? resize.startBounds.width - dx : resize.startBounds.width + dx;
      const rawHeight = isNorth ? resize.startBounds.height - dy : resize.startBounds.height + dy;
      const nextWidth = Math.max(120, Math.max(rawWidth, rawHeight * resize.aspect));
      const nextHeight = nextWidth / resize.aspect;
      const nextX = isWest ? resize.startBounds.x + resize.startBounds.width - nextWidth : resize.startBounds.x;
      const nextY = isNorth ? resize.startBounds.y + resize.startBounds.height - nextHeight : resize.startBounds.y;
      const factor = nextWidth / Math.max(1, resize.startBounds.width);
      const finalX = Math.max(0, nextX);
      const finalY = Math.max(0, nextY);
      const nextItemsById = Object.entries(resize.startItems).reduce<Record<string, CanvasItemBox>>((acc, [itemId, start]) => {
        acc[itemId] = {
          x: Math.max(0, finalX + (start.x - resize.startBounds.x) * factor),
          y: Math.max(0, finalY + (start.y - resize.startBounds.y) * factor),
          width: Math.max(48, start.width * factor),
          height: Math.max(36, start.height * factor),
        };
        return acc;
      }, {});
      resize.latestBoxes = nextItemsById;
      const resized = Object.values(nextItemsById);
      if (resized.length > 0) {
        growCanvasToFit(
          Math.max(...resized.map(item => item.x + item.width)),
          Math.max(...resized.map(item => item.y + item.height))
        );
      }

      scheduleCanvasInteractionPaint({ kind: 'resize', boxes: nextItemsById });
    };
    const removeGroupResizeListeners = () => {
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
      if (canvasPointerInteractionCleanupRef.current === removeGroupResizeListeners) {
        canvasPointerInteractionCleanupRef.current = null;
      }
    };

    const onUp = () => {
      const resize = canvasGroupResizeRef.current;
      const changedIds = resize ? Object.keys(resize.startItems) : [];
      canvasGroupResizeRef.current = null;
      cancelCanvasInteractionPaint();
      if (resize?.hasResized && resize.latestBoxes) {
        const latestBoxes = resize.latestBoxes;
        canvasItemsPatchCommitRef.current = true;
        updateCanvasItemsDeferred(prev => prev.map(item => {
          const next = latestBoxes[item.id];
          if (!next) return item;
          return {
            ...item,
            x: next.x,
            y: next.y,
            width: next.width,
            height: next.height,
          };
        }));
        markCanvasNodesChanged(Object.keys(latestBoxes));
      }
      clearCanvasItemInteractionStyles(changedIds);
      restoreCanvasItemBoxStyles(changedIds);
      setCanvasInteractionActive(false, CANVAS_INTERACTION_BACKGROUND_SETTLE_MS);
      pointerCaptureTarget.releasePointerCapture?.(e.pointerId);
      removeGroupResizeListeners();
    };

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
    canvasPointerInteractionCleanupRef.current = removeGroupResizeListeners;

};

export const startCanvasSelectionImpl = (ctx: Pick<canvasInteractionsActionContext, 'CANVAS_INTERACTION_BACKGROUND_SETTLE_MS' | 'autoScrollCanvasNearEdge' | 'cancelCanvasImageSourceUpgradeQueue' | 'cancelCanvasInteractionPaint' | 'canvasItemsRef' | 'canvasRectsIntersect' | 'canvasSelectedIdsRef' | 'canvasSelectionDragRef' | 'canvasViewportRef' | 'getCanvasPointFromClient' | 'hideCanvasSelectionOverlay' | 'isCanvasSpacePressedRef' | 'normalizeCanvasSelectionBox' | 'scheduleCanvasInteractionPaint' | 'setCanvasInteractionActive' | 'updateCanvasSelection'>, e: React.PointerEvent<HTMLDivElement>) => {
  const { CANVAS_INTERACTION_BACKGROUND_SETTLE_MS, autoScrollCanvasNearEdge, cancelCanvasImageSourceUpgradeQueue, cancelCanvasInteractionPaint, canvasItemsRef, canvasRectsIntersect, canvasSelectedIdsRef, canvasSelectionDragRef, canvasViewportRef, getCanvasPointFromClient, hideCanvasSelectionOverlay, isCanvasSpacePressedRef, normalizeCanvasSelectionBox, scheduleCanvasInteractionPaint, setCanvasInteractionActive, updateCanvasSelection } = ctx;
    if (e.button !== 0 || isCanvasSpacePressedRef.current) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('[data-canvas-item-id], [data-no-drag="true"], textarea, input, button, select, [contenteditable="true"]')) return;
    e.preventDefault();
    e.stopPropagation();
    cancelCanvasImageSourceUpgradeQueue();
    const start = getCanvasPointFromClient(e.clientX, e.clientY);
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    canvasSelectionDragRef.current = {
      pointerId: e.pointerId,
      startX: start.x,
      startY: start.y,
      currentX: start.x,
      currentY: start.y,
      additive,
      baseSelectedIds: canvasSelectedIdsRef.current,
      hasMoved: false,
    };
    hideCanvasSelectionOverlay();

    const onMove = (event: PointerEvent) => {
      const selection = canvasSelectionDragRef.current;
      if (!selection) return;
      event.preventDefault();
      event.stopPropagation();
      autoScrollCanvasNearEdge(event);
      const point = getCanvasPointFromClient(event.clientX, event.clientY);
      selection.currentX = point.x;
      selection.currentY = point.y;
      const rect = normalizeCanvasSelectionBox({
        startX: selection.startX,
        startY: selection.startY,
        currentX: selection.currentX,
        currentY: selection.currentY,
      });
      if (!selection.hasMoved && rect.width < 4 && rect.height < 4) return;
      if (!selection.hasMoved) {
        selection.hasMoved = true;
        setCanvasInteractionActive(true);
      }
      scheduleCanvasInteractionPaint({ kind: 'selection', rect });
    };
    const onUp = (event: PointerEvent) => {
      const selection = canvasSelectionDragRef.current;
      if (selection) {
        const point = getCanvasPointFromClient(event.clientX, event.clientY);
        const rect = normalizeCanvasSelectionBox({ startX: selection.startX, startY: selection.startY, currentX: point.x, currentY: point.y });
        if (rect.width < 4 && rect.height < 4) {
          if (!selection.additive) updateCanvasSelection([]);
        } else {
          const renderViewport = canvasViewportRef.current;
          const candidates = renderViewport
            ? canvasItemsRef.current.filter(item => canvasRectsIntersect(renderViewport, item))
            : canvasItemsRef.current;
          const hits = candidates
            .filter(item => canvasRectsIntersect(rect, item))
            .map(item => item.id);
          updateCanvasSelection(selection.additive ? [...selection.baseSelectedIds, ...hits] : hits);
        }
      }
      canvasSelectionDragRef.current = null;
      cancelCanvasInteractionPaint();
      hideCanvasSelectionOverlay();
      if (selection?.hasMoved) setCanvasInteractionActive(false, CANVAS_INTERACTION_BACKGROUND_SETTLE_MS);
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
    };

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);

};

export const writeCanvasSurfaceScrollImpl = (ctx: Pick<canvasInteractionsActionContext, 'canvasPanRef' | 'canvasScrollLockRef' | 'canvasScrollWriteGuardRef' | 'canvasStateSaveDeferredDuringZoomRef' | 'isCanvasInteractingRef' | 'isCanvasZoomingRef' | 'releaseCanvasScrollWriteGuard' | 'scheduleCanvasStateSave'>, surface: HTMLDivElement, left: number, top: number, updateLock: boolean = true) => {
  const { canvasPanRef, canvasScrollLockRef, canvasScrollWriteGuardRef, canvasStateSaveDeferredDuringZoomRef, isCanvasInteractingRef, isCanvasZoomingRef, releaseCanvasScrollWriteGuard, scheduleCanvasStateSave } = ctx;
    canvasScrollWriteGuardRef.current = true;
    surface.scrollLeft = left;
    surface.scrollTop = top;
    if (updateLock) {
      canvasScrollLockRef.current = {
        left: surface.scrollLeft,
        top: surface.scrollTop,
      };
      if (isCanvasInteractingRef.current || isCanvasZoomingRef.current || canvasPanRef.current) {
        canvasStateSaveDeferredDuringZoomRef.current = true;
      } else {
        scheduleCanvasStateSave();
      }
    }
    releaseCanvasScrollWriteGuard();

};

export const clampCanvasSurfaceScrollImpl = (ctx: Record<never, never>, surface: HTMLDivElement, left: number, top: number, scale: number, size: { width: number; height: number; }) => {
  const {  } = ctx;
    const maxLeft = Math.max(0, size.width * scale - surface.clientWidth);
    const maxTop = Math.max(0, size.height * scale - surface.clientHeight);
    return {
      left: clamp(Number.isFinite(left) ? left : surface.scrollLeft, 0, maxLeft),
      top: clamp(Number.isFinite(top) ? top : surface.scrollTop, 0, maxTop),
    };

};

export const centerCanvasItemInViewImpl = (ctx: Pick<canvasInteractionsActionContext, 'canvasReturnScrollRef' | 'canvasScaleRef' | 'canvasSurfaceRef' | 'growCanvasToFit' | 'updateCanvasSelection' | 'writeCanvasSurfaceScroll'>, canvasItem?: CanvasImageItem | null, options: { select?: boolean } = {}) => {
  const { canvasReturnScrollRef, canvasScaleRef, canvasSurfaceRef, growCanvasToFit, updateCanvasSelection, writeCanvasSurfaceScroll } = ctx;
    const surface = canvasSurfaceRef.current;
    if (!surface || !canvasItem) return false;
    const scale = canvasScaleRef.current || 1;
    growCanvasToFit(canvasItem.x + canvasItem.width, canvasItem.y + canvasItem.height);
    canvasReturnScrollRef.current = null;
    writeCanvasSurfaceScroll(
      surface,
      Math.max(0, (canvasItem.x + canvasItem.width / 2) * scale - surface.clientWidth / 2),
      Math.max(0, (canvasItem.y + canvasItem.height / 2) * scale - surface.clientHeight / 2),
    );
    if (options.select) updateCanvasSelection([canvasItem.id]);
    return true;

};

export const fitCanvasViewToItemsImpl = (ctx: Pick<canvasInteractionsActionContext, 'applyCanvasScaleStyles' | 'beginCanvasZoomInteraction' | 'canvasItemsRef' | 'canvasScaleRef' | 'canvasSizeRef' | 'canvasSurfaceRef' | 'commitCanvasScaleSoon' | 'getCanvasBoundsFromItems' | 'growCanvasToFit' | 'writeCanvasSurfaceScroll'>, ids?: string[]) => {
  const { applyCanvasScaleStyles, beginCanvasZoomInteraction, canvasItemsRef, canvasScaleRef, canvasSizeRef, canvasSurfaceRef, commitCanvasScaleSoon, getCanvasBoundsFromItems, growCanvasToFit, writeCanvasSurfaceScroll } = ctx;
    const surface = canvasSurfaceRef.current;
    if (!surface) return false;
    const sourceItems = ids?.length
      ? canvasItemsRef.current.filter(item => ids.includes(item.id))
      : canvasItemsRef.current;
    const bounds = getCanvasBoundsFromItems(sourceItems);
    if (!bounds) return false;

    const padding = 160;
    const nextScale = clamp(
      Math.min(
        (surface.clientWidth - 56) / Math.max(1, bounds.width + padding * 2),
        (surface.clientHeight - 56) / Math.max(1, bounds.height + padding * 2)
      ),
      CANVAS_MIN_SCALE,
      Math.min(1.6, CANVAS_MAX_SCALE)
    );
    beginCanvasZoomInteraction();
    growCanvasToFit(bounds.x + bounds.width + padding, bounds.y + bounds.height + padding);
    canvasScaleRef.current = nextScale;
    applyCanvasScaleStyles(nextScale, canvasSizeRef.current, { updateViewport: false });
    commitCanvasScaleSoon();
    writeCanvasSurfaceScroll(
      surface,
      Math.max(0, (bounds.x + bounds.width / 2) * nextScale - surface.clientWidth / 2),
      Math.max(0, (bounds.y + bounds.height / 2) * nextScale - surface.clientHeight / 2)
    );
    return true;

};

export const scheduleCanvasFocusItemByIdImpl = (ctx: Pick<canvasInteractionsActionContext, 'canvasPanRef' | 'focusCanvasItemById' | 'isCanvasInteractingRef' | 'isCanvasModeRef' | 'isCanvasZoomingRef' | 'pendingCanvasFocusItemIdRef'>, id?: string | null) => {
  const { canvasPanRef, focusCanvasItemById, isCanvasInteractingRef, isCanvasModeRef, isCanvasZoomingRef, pendingCanvasFocusItemIdRef } = ctx;
    if (!id) return;
    pendingCanvasFocusItemIdRef.current = id;
    let frameAttempts = 0;
    const tryFocus = () => {
      if (!isCanvasModeRef.current || pendingCanvasFocusItemIdRef.current !== id) return;
      if (isCanvasInteractingRef.current || isCanvasZoomingRef.current || canvasPanRef.current) {
        pendingCanvasFocusItemIdRef.current = null;
        return;
      }
      if (focusCanvasItemById(id)) {
        pendingCanvasFocusItemIdRef.current = null;
        return;
      }
      frameAttempts += 1;
      if (frameAttempts < 12) {
        window.requestAnimationFrame(tryFocus);
      }
    };
    window.requestAnimationFrame(() => window.requestAnimationFrame(tryFocus));
    window.setTimeout(tryFocus, 80);
    window.setTimeout(tryFocus, 220);

};

export const scheduleCanvasFocusNearestContentIfViewportEmptyImpl = (ctx: Pick<canvasInteractionsActionContext, 'activeCanvasIdRef' | 'canvasItemsRef' | 'canvasPanRef' | 'canvasSurfaceRef' | 'centerCanvasItemInView' | 'isCanvasInteractingRef' | 'isCanvasModeRef' | 'isCanvasZoomingRef' | 'readCanvasViewportRect'>, canvasId: string) => {
  const { activeCanvasIdRef, canvasItemsRef, canvasPanRef, canvasSurfaceRef, centerCanvasItemInView, isCanvasInteractingRef, isCanvasModeRef, isCanvasZoomingRef, readCanvasViewportRect } = ctx;
    let frameAttempts = 0;
    const tryFocus = () => {
      if (!isCanvasModeRef.current || activeCanvasIdRef.current !== canvasId) return;
      if (isCanvasInteractingRef.current || isCanvasZoomingRef.current || canvasPanRef.current) return;
      const surface = canvasSurfaceRef.current;
      if (!surface || surface.clientWidth <= 0 || surface.clientHeight <= 0) {
        frameAttempts += 1;
        if (frameAttempts < 8) window.requestAnimationFrame(tryFocus);
        return;
      }
      const targetId = findNearestCanvasItemIdForEmptyViewport(
        canvasItemsRef.current,
        readCanvasViewportRect(surface),
      );
      if (!targetId) return;
      centerCanvasItemInView(
        canvasItemsRef.current.find(item => item.id === targetId),
      );
    };
    window.requestAnimationFrame(() => window.requestAnimationFrame(tryFocus));

};

export const startCanvasPanImpl = (ctx: Pick<canvasInteractionsActionContext, 'CANVAS_INTERACTION_BACKGROUND_SETTLE_MS' | 'canvasPanCleanupRef' | 'canvasPanRef' | 'canvasScaleRef' | 'canvasScrollLockRef' | 'canvasSurfaceRef' | 'expandCanvasBeforeViewport' | 'growCanvasNearViewportEdge' | 'growCanvasToFit' | 'isCanvasSpacePressedRef' | 'pendingCanvasFocusItemIdRef' | 'scheduleCanvasStateSave' | 'scheduleCanvasViewportUpdate' | 'setCanvasInteractionActive' | 'writeCanvasSurfaceScroll'>, e: React.PointerEvent<HTMLDivElement>) => {
  const { CANVAS_INTERACTION_BACKGROUND_SETTLE_MS, canvasPanCleanupRef, canvasPanRef, canvasScaleRef, canvasScrollLockRef, canvasSurfaceRef, expandCanvasBeforeViewport, growCanvasNearViewportEdge, growCanvasToFit, isCanvasSpacePressedRef, pendingCanvasFocusItemIdRef, scheduleCanvasStateSave, scheduleCanvasViewportUpdate, setCanvasInteractionActive, writeCanvasSurfaceScroll } = ctx;
    if (!isCanvasSpacePressedRef.current && e.button !== 1 && !e.shiftKey) return;
    if (e.button !== 0 && e.button !== 1) return;
    const surface = canvasSurfaceRef.current;
    if (!surface) return;
    e.preventDefault();
    e.stopPropagation();
    canvasPanCleanupRef.current?.();
    pendingCanvasFocusItemIdRef.current = null;
    surface.focus({ preventScroll: true });
    const pointerCaptureTarget = e.currentTarget;
    try {
      pointerCaptureTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // The WebView can revoke an active pointer while the window is changing focus.
    }
    setCanvasInteractionActive(true);
    canvasPanRef.current = {
      pointerId: e.pointerId,
      button: e.button,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startScrollLeft: surface.scrollLeft,
      startScrollTop: surface.scrollTop,
    };
    canvasScrollLockRef.current = {
      left: surface.scrollLeft,
      top: surface.scrollTop,
    };

    const onMove = (event: PointerEvent) => {
      const pan = canvasPanRef.current;
      const targetSurface = canvasSurfaceRef.current;
      if (!pan || !targetSurface) return;
      if (event.pointerId !== pan.pointerId) return;
      const pressedButtonMask = pan.button === 1 ? 4 : 1;
      if ((event.buttons & pressedButtonMask) === 0) {
        onUp();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const scale = canvasScaleRef.current || 1;
      let nextLeft = pan.startScrollLeft - (event.clientX - pan.startClientX);
      let nextTop = pan.startScrollTop - (event.clientY - pan.startClientY);
      if (nextLeft < 0 || nextTop < 0) {
        expandCanvasBeforeViewport(
          nextLeft < 0 ? CANVAS_GROW_CHUNK : 0,
          nextTop < 0 ? CANVAS_GROW_CHUNK : 0,
        );
        const shiftedPan = canvasPanRef.current;
        if (!shiftedPan) return;
        nextLeft = shiftedPan.startScrollLeft - (event.clientX - shiftedPan.startClientX);
        nextTop = shiftedPan.startScrollTop - (event.clientY - shiftedPan.startClientY);
      }
      nextLeft = Math.max(0, nextLeft);
      nextTop = Math.max(0, nextTop);
      growCanvasToFit(
        (nextLeft + targetSurface.clientWidth) / scale + CANVAS_GROW_CHUNK * 0.8,
        (nextTop + targetSurface.clientHeight) / scale + CANVAS_GROW_CHUNK * 0.8
      );
      writeCanvasSurfaceScroll(targetSurface, nextLeft, nextTop);
      growCanvasNearViewportEdge(targetSurface);
    };
    let finished = false;
    const onUp = () => {
      if (finished) return;
      finished = true;
      if (canvasPanRef.current?.pointerId === e.pointerId) {
        canvasPanRef.current = null;
      }
      if (canvasPanCleanupRef.current === onUp) {
        canvasPanCleanupRef.current = null;
      }
      const finalSurface = canvasSurfaceRef.current;
      if (finalSurface) {
        canvasScrollLockRef.current = {
          left: finalSurface.scrollLeft,
          top: finalSurface.scrollTop,
        };
      }
      scheduleCanvasViewportUpdate();
      scheduleCanvasStateSave();
      setCanvasInteractionActive(false, CANVAS_INTERACTION_BACKGROUND_SETTLE_MS);
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
      document.removeEventListener('mouseup', onMouseUp, true);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onUp);
      pointerCaptureTarget.removeEventListener('lostpointercapture', onUp);
      try {
        if (pointerCaptureTarget.hasPointerCapture?.(e.pointerId)) {
          pointerCaptureTarget.releasePointerCapture?.(e.pointerId);
        }
      } catch {
        // Pointer capture may already be gone after a window blur/cancel.
      }
    };
    const onMouseUp = (event: MouseEvent) => {
      if (event.button === e.button) onUp();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') onUp();
    };

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
    document.addEventListener('mouseup', onMouseUp, true);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onUp);
    pointerCaptureTarget.addEventListener('lostpointercapture', onUp);
    canvasPanCleanupRef.current = onUp;

};

export const zoomCanvasAtImpl = (ctx: Pick<canvasInteractionsActionContext, 'applyCanvasScaleStyles' | 'beginCanvasZoomInteraction' | 'canvasScaleRef' | 'canvasSizeRef' | 'canvasSurfaceRef' | 'canvasVisualViewportRef' | 'commitCanvasScaleSoon' | 'growCanvasToFit'>, clientX: number, clientY: number, deltaY: number) => {
  const { applyCanvasScaleStyles, beginCanvasZoomInteraction, canvasScaleRef, canvasSizeRef, canvasSurfaceRef, canvasVisualViewportRef, commitCanvasScaleSoon, growCanvasToFit } = ctx;
    const surface = canvasSurfaceRef.current;
    if (!surface) return;

    const previousScale = canvasScaleRef.current || 1;
    const nextScale = clamp(previousScale * Math.exp(-deltaY * 0.0008), CANVAS_MIN_SCALE, CANVAS_MAX_SCALE);
    if (Math.abs(nextScale - previousScale) < 0.001) return;
    beginCanvasZoomInteraction();

    const rect = surface.getBoundingClientRect();
    const localX = clamp(clientX - rect.left, 0, surface.clientWidth);
    const localY = clamp(clientY - rect.top, 0, surface.clientHeight);
    const currentViewport = canvasVisualViewportRef.current;
    const currentViewportX = currentViewport?.x ?? surface.scrollLeft / previousScale;
    const currentViewportY = currentViewport?.y ?? surface.scrollTop / previousScale;
    const canvasX = currentViewportX + localX / previousScale;
    const canvasY = currentViewportY + localY / previousScale;
    const targetLeft = canvasX * nextScale - localX;
    const targetTop = canvasY * nextScale - localY;
    const visualX = Math.max(0, targetLeft / nextScale);
    const visualY = Math.max(0, targetTop / nextScale);

    canvasScaleRef.current = nextScale;
    canvasVisualViewportRef.current = {
      x: visualX,
      y: visualY,
      width: surface.clientWidth / nextScale,
      height: surface.clientHeight / nextScale,
    };
    growCanvasToFit(
      (Math.max(0, targetLeft) + surface.clientWidth) / nextScale + CANVAS_GROW_CHUNK * 0.4,
      (Math.max(0, targetTop) + surface.clientHeight) / nextScale + CANVAS_GROW_CHUNK * 0.4
    );
    applyCanvasScaleStyles(nextScale, canvasSizeRef.current, { updateViewport: false });
    commitCanvasScaleSoon();

};

export const scheduleCanvasWheelZoomImpl = (ctx: Pick<canvasInteractionsActionContext, 'canvasWheelZoomFrameRef' | 'canvasWheelZoomPayloadRef' | 'zoomCanvasAt'>, clientX: number, clientY: number, deltaY: number) => {
  const { canvasWheelZoomFrameRef, canvasWheelZoomPayloadRef, zoomCanvasAt } = ctx;
    const pending = canvasWheelZoomPayloadRef.current;
    canvasWheelZoomPayloadRef.current = pending
      ? { clientX, clientY, deltaY: clamp(pending.deltaY + deltaY, -240, 240) }
      : { clientX, clientY, deltaY };
    if (canvasWheelZoomFrameRef.current !== null) return;
    canvasWheelZoomFrameRef.current = window.requestAnimationFrame(() => {
      canvasWheelZoomFrameRef.current = null;
      const payload = canvasWheelZoomPayloadRef.current;
      canvasWheelZoomPayloadRef.current = null;
      if (!payload) return;
      zoomCanvasAt(payload.clientX, payload.clientY, payload.deltaY);
    });

};

export const normalizeCanvasWheelDeltaImpl = (ctx: Pick<canvasInteractionsActionContext, 'canvasSurfaceRef'>, event: { deltaY: number; deltaMode: number }) => {
  const { canvasSurfaceRef } = ctx;
    let deltaY = event.deltaY;
    if (event.deltaMode === 1) {
      deltaY *= 40;
    } else if (event.deltaMode === 2) {
      deltaY *= Math.max(160, canvasSurfaceRef.current?.clientHeight || 800);
    }
    if (!Number.isFinite(deltaY)) return 0;
    return clamp(deltaY, -120, 120);

};

export const getCanvasNestedWheelScrollerImpl = (ctx: Record<never, never>, surface: HTMLDivElement, targetValue: EventTarget | null, deltaY: number) => {
  const {  } = ctx;
    const target = targetValue instanceof Element ? targetValue : null;
    if (!target || !surface.contains(target)) return null;
    const markedScroller = target.closest('[data-canvas-wheel-scroll="true"]');
    if (!markedScroller && !target.closest('textarea, input, [contenteditable="true"]')) return null;
    let current: HTMLElement | null = markedScroller instanceof HTMLElement
      ? markedScroller
      : target instanceof HTMLElement ? target : target.parentElement;
    while (current && current !== surface) {
      const style = window.getComputedStyle(current);
      const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY) && current.scrollHeight > current.clientHeight + 1;
      if (canScrollY) {
        const canScrollUp = deltaY < 0 && current.scrollTop > 0;
        const canScrollDown = deltaY > 0 && current.scrollTop + current.clientHeight < current.scrollHeight - 1;
        return canScrollUp || canScrollDown ? current : null;
      }
      current = current.parentElement;
    }
    return null;

};

export const handleCanvasDropImpl = async (ctx: Pick<canvasInteractionsActionContext, 'addCanvasDroppedFiles' | 'addCanvasDroppedPaths' | 'addCanvasWebImageUrl' | 'addDrawerMediaItemToCanvas' | 'clearDrawerItemDragState' | 'getDraggedDrawerItemId' | 'lastCanvasDragClientRef' | 'showToast'>, e: React.DragEvent<HTMLDivElement>) => {
  const { addCanvasDroppedFiles, addCanvasDroppedPaths, addCanvasWebImageUrl, addDrawerMediaItemToCanvas, clearDrawerItemDragState, getDraggedDrawerItemId, lastCanvasDragClientRef, showToast } = ctx;
    e.preventDefault();
    e.stopPropagation();
    const eventTarget = e.target as HTMLElement | null;
    if (eventTarget?.closest('[data-canvas-item-id]')) {
      return;
    }
    const client = { x: e.clientX, y: e.clientY };
    lastCanvasDragClientRef.current = client;

    const drawerItemId = getDraggedDrawerItemId(e.dataTransfer);
    if (drawerItemId && await addDrawerMediaItemToCanvas(drawerItemId, client)) {
      clearDrawerItemDragState();
      return;
    }

    const image = getWebImageFromDataTransfer(e.dataTransfer);
    const imageUrl = image?.url ? normalizeDraggedUrl(image.url) : '';
    const imageFile = image ? getImageFileFromDataTransfer(e.dataTransfer) : null;
    if (imageFile && imageFile.size > 0) {
      try {
        const dataUrl = await readImageFileAsDataUrl(imageFile);
        await addCanvasWebImageUrl(
          dataUrl,
          imageFile.name || image?.name,
          client,
          [imageUrl, ...(image?.fallbackUrls || [])],
        );
        return;
      } catch (_) {
        // Fall through to URL candidates when the browser exposes an unreadable file item.
      }
    }
    if (imageUrl && /^(https?:|data:image\/)/i.test(imageUrl)) {
      await addCanvasWebImageUrl(imageUrl, image?.name, client, image?.fallbackUrls);
      return;
    }

    const paths = getCanvasLocalPathsFromDataTransfer(e.dataTransfer);
    if (paths.length > 0) {
      await addCanvasDroppedPaths(paths, client);
      return;
    }

    if ((e.dataTransfer.files?.length || 0) > 0) {
      const added = await addCanvasDroppedFiles(e.dataTransfer.files, client);
      if (added) return;
    }

    showToast('无限画布只接收图片或视频');

};

export const leaveCanvasToDrawerImpl = (ctx: Pick<canvasInteractionsActionContext, 'canvasItemsRef' | 'canvasReturnScrollRef' | 'canvasScrollLockRef' | 'canvasSurfaceRef' | 'isCanvasModeRef' | 'isPinnedRef' | 'keepCanvasSessionOnLeaveRef' | 'saveCanvasStateNow' | 'setCanvasSpacePressed' | 'setIsCanvasMode' | 'setIsPinned' | 'showToast' | 'updateCanvasSelection'>) => {
  const { canvasItemsRef, canvasReturnScrollRef, canvasScrollLockRef, canvasSurfaceRef, isCanvasModeRef, isPinnedRef, keepCanvasSessionOnLeaveRef, saveCanvasStateNow, setCanvasSpacePressed, setIsCanvasMode, setIsPinned, showToast, updateCanvasSelection } = ctx;
    const surface = canvasSurfaceRef.current;
    canvasReturnScrollRef.current = surface
      ? { left: surface.scrollLeft, top: surface.scrollTop }
      : canvasScrollLockRef.current;
    saveCanvasStateNow({ syncNodes: true });
    keepCanvasSessionOnLeaveRef.current = true;
    isCanvasModeRef.current = false;
    setIsCanvasMode(false);
    setCanvasSpacePressed(false);
    updateCanvasSelection([]);
    setIsPinned(false);
    isPinnedRef.current = false;
    invoke('toggle_pin', { pinned: false }).catch(() => {});
    showToast(canvasItemsRef.current.length > 0 ? '已切回抽屉，画布内容已保留' : '已切回抽屉');

};

export const runCanvasWorkbenchWindowActionImpl = (ctx: Pick<canvasInteractionsActionContext, 'appWindow' | 'requestExitCanvasMode' | 'showToast'>, action: 'minimize' | 'maximize' | 'close') => {
  const { appWindow, requestExitCanvasMode, showToast } = ctx;
    if (action === 'minimize') {
      appWindow.minimize().catch((err) => {
        console.warn('minimize canvas workbench failed:', err);
        showToast('最小化失败');
      });
      return;
    }
    if (action === 'maximize') {
      appWindow.toggleMaximize().catch((err) => {
        console.warn('maximize canvas workbench failed:', err);
        showToast('最大化失败');
      });
      return;
    }
    requestExitCanvasMode();

};

export const runDrawerWorkbenchWindowActionImpl = (ctx: Pick<canvasInteractionsActionContext, 'appWindow' | 'isPinnedRef' | 'isPointerInsideDrawerRef' | 'setIsOpen' | 'setIsPinned' | 'showToast'>, action: 'minimize' | 'maximize' | 'close') => {
  const { appWindow, isPinnedRef, isPointerInsideDrawerRef, setIsOpen, setIsPinned, showToast } = ctx;
    if (action === 'minimize') {
      appWindow.minimize().catch((err) => {
        console.warn('minimize drawer workbench failed:', err);
        showToast('最小化失败');
      });
      return;
    }
    if (action === 'maximize') {
      appWindow.toggleMaximize().catch((err) => {
        console.warn('maximize drawer workbench failed:', err);
        showToast('最大化失败');
      });
      return;
    }

    isPointerInsideDrawerRef.current = false;
    isPinnedRef.current = false;
    setIsPinned(false);
    setIsOpen(false);
    invoke('toggle_pin', { pinned: false }).catch(() => {});

};

export const buildCanvasDrawerFolderNameImpl = (ctx: Record<never, never>, canvas: CanvasRecord, now: number = Date.now()) => {
  const {  } = ctx;
    const canvasName = (canvas.name || '画布').trim() || '画布';
    const shortName = canvasName.length > 18 ? `${canvasName.slice(0, 18)}...` : canvasName;
    return `${shortName} 元素 ${new Date(now).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).replace(/[/:]/g, '-').replace(/\s+/g, ' ')}`;

};

export const copyCanvasItemsToDrawerFolderImpl = (ctx: Pick<canvasInteractionsActionContext, 'buildCanvasDrawerFolderName' | 'createAssetId' | 'foldersRef' | 'insertDrawerFolderAtTop' | 'itemsRef' | 'persistFoldersSnapshot' | 'pushDrawerUndoSnapshot' | 'setActiveFolderId' | 'setActiveTab' | 'setFolders' | 'setItems'>, snapshots: CanvasImageItem[], canvas: CanvasRecord) => {
  const { buildCanvasDrawerFolderName, createAssetId, foldersRef, insertDrawerFolderAtTop, itemsRef, persistFoldersSnapshot, pushDrawerUndoSnapshot, setActiveFolderId, setActiveTab, setFolders, setItems } = ctx;
    const validSnapshots = snapshots.filter((snapshot): snapshot is CanvasImageItem => !!snapshot?.item);
    if (validSnapshots.length === 0) {
      return { savedCount: 0, folderName: '' };
    }
    const now = Date.now();
    const folderName = buildCanvasDrawerFolderName(canvas, now);
    const newFolder: Folder = {
      id: createAssetId(),
      name: folderName,
      color: '#f59e0b',
    };
    const existingDrawerIds = new Set(itemsRef.current.map(item => item.id));
    const usedSavedIds = new Set<string>();
    const savedItems = validSnapshots.map(snapshot => {
      const sourceItem = cloneDrawerValue(snapshot.item);
      const desiredId = sourceItem.id || '';
      const needsFreshId = !desiredId || existingDrawerIds.has(desiredId) || usedSavedIds.has(desiredId);
      const id = needsFreshId ? createAssetId() : desiredId;
      usedSavedIds.add(id);
      return {
        ...sourceItem,
        id,
        folderId: newFolder.id,
        createdAt: sourceItem.createdAt || now,
      } as BufferItem;
    });

    pushDrawerUndoSnapshot('保存画布元素');
    setFolders(prev => {
      const nextFolders = insertDrawerFolderAtTop(prev, newFolder);
      foldersRef.current = nextFolders;
      persistFoldersSnapshot(nextFolders);
      return nextFolders;
    });
    setItems(prev => {
      const nextItems = [...savedItems, ...prev];
      itemsRef.current = nextItems;
      return nextItems;
    });
    setActiveFolderId(newFolder.id);
    setActiveTab('all');
    return { savedCount: savedItems.length, folderName };

};
