import { convertFileSrc,invoke } from '@tauri-apps/api/core';
import React,{ startTransition } from 'react';
import { DEFAULT_CANVAS_ID,DEFAULT_LIBRARY_ID,DEFAULT_PROJECT_ID,createCanvas,duplicateCanvas,getCanvasTrashCount,listCanvasNodes,listCanvases,patchCanvasNodes,permanentlyDeleteCanvas,renameCanvas,restoreCanvas,saveCanvasSnapshot,setActiveCanvas,softDeleteCanvas,updateCanvasNodes,type CanvasRecord } from '../../../services/canvasApi';
import { BufferItem } from '../../../types';
import type { CanvasImageSourceCacheEntry,ImageThumbnailFileResult } from '../../../types/canvasMedia';
import type { CanvasContextMenuState,CanvasPersistedState,CanvasUndoSnapshot,CanvasViewportRect } from '../../../types/canvasRuntime';
import type { ConfirmDialogState,TextInputDialogOptions } from '../../../types/dialogs';
import { CANVAS_AI_DEFAULT_ASPECT_RATIO } from '../../../utils/canvasAiAspectRatio';
import { isCanvasImageFusionAi,removeCanvasImageFusionInput,type CanvasImageFusionRole } from '../../../utils/canvasImageFusion';
import { getCanvasInitialImageSize,readImageDisplaySize } from '../../../utils/canvasImageSize';
import { CANVAS_IMAGE_SOURCE_UPGRADE_PREVIEW_SIZE,canUseCanvasItemAsImageEnhancementInput,createCanvasAiOutputBufferItem,getCanvasAiOutputDisplaySource,getCanvasAiOutputSize,getCanvasImageUpgradeFailureKey,getCanvasImageUpgradeLocalPath,getCanvasInitialImageSource,getCanvasItemDisplaySource,getCanvasOriginalImageSource,getCanvasWorkflowGroupIdForSelection,getCanvasWorkflowTemplateFromNode } from '../../../utils/canvasItemSelectors';
import { cloneDrawerValue,sanitizeCanvasPersistedState,stripCanvasItemDataImageProvenance } from '../../../utils/canvasSerialization';
import { getCanvasAiOutputPreviewSlots,getCanvasWorkflowGroup } from '../../../utils/canvasWorkflowRuntime';
import { getCanvasAiNodeAutoSize } from '../../canvasAiNodeLayout';
import { getCanvasAiVisibleOutputs } from '../../canvasAiOutputs';
import { getCanvasAiMediaType,getCanvasAiNodeAutoSizeType,isCanvasAiGeneratedType,isCanvasAiGeneratorType } from '../../canvasAiRuntime';
import { layoutCanvasItems } from '../../canvasAutoLayout';
import { expandCanvasGroupSelectionIds,getCanvasGroupId,getCanvasGroupOutlines } from '../../canvasGroups';
import { isCanvasAiLocalMediaToolType,shouldShowCanvasAiLocalMediaProgress } from '../../canvasLocalMediaTools';
import { CANVAS_BASE_HEIGHT,CANVAS_BASE_WIDTH,CANVAS_GROW_CHUNK,type CanvasAiGeneratedOutput,type CanvasImageItem,type CanvasItemBox,type CanvasResizeCorner } from '../../canvasModel';
import { getCanvasWorkflowInternalSlotNodes,isExpandedCanvasWorkflowInternalSlotNode } from '../../canvasWorkflowInternalSlots';
import { clamp } from '../../common';
import { ThreeSceneAnalysisError,analyzeImagesToThreeSceneResult } from '../../three/ai/analyzeImageToThreeScene';
import { createThreeSceneCaptureCanvasNode,createThreeSceneGeneratorCanvasNode } from '../../three/canvas/threeSceneCanvasNode';
import { saveThreeSceneCapture } from '../../three/capture/captureThreeScene';
import type { SceneAnalysisV1 } from '../../three/model/threeSceneAnalysisTypes';
import type { SceneSpecV1,ThreeSceneCameraState } from '../../three/model/threeSceneTypes';
import { createThreeScenePreview } from '../../three/preview/threeScenePreview';

type canvasPersistenceActionContext = { canvasSurfaceRef: React.RefObject<HTMLDivElement | null>; canvasScaleRef: React.RefObject<number>; canvasImageSourceCacheRef: React.RefObject<Map<string, CanvasImageSourceCacheEntry>>; canvasSelectedIdsRef: React.RefObject<string[]>; CANVAS_IMAGE_PREVIEW_UPGRADE_ENABLED: true; canvasPreviewSourceIdsRef: React.RefObject<Set<string>>; canvasSelectionImageSourceIdsRef: React.RefObject<Set<string>>; canvasSelectionImageSourceFrameRef: React.RefObject<number | null>; canvasItemsRef: React.RefObject<CanvasImageItem[]>; applyCanvasImageSourceToElement: (id: string, source: string) => void; canvasImageUpgradeFailedRef: React.RefObject<Set<string>>; CANVAS_IMAGE_SOURCE_UPGRADE_MIN_SCALE: 1.15; CANVAS_IMAGE_SOURCE_UPGRADE_PIXEL_THRESHOLD: 480; canvasImageUpgradeTokenRef: React.RefObject<number>; isCanvasModeRef: React.RefObject<boolean>; isCanvasZoomingRef: React.RefObject<boolean>; isCanvasInteractingRef: React.RefObject<boolean>; canvasPanRef: React.RefObject<{ pointerId: number; button: number; startClientX: number; startClientY: number; startScrollLeft: number; startScrollTop: number; } | null>; canvasImageUpgradeInFlightRef: React.RefObject<Set<string>>; CANVAS_IMAGE_SOURCE_UPGRADE_CONCURRENCY: 1; canvasImageUpgradeQueueRef: React.RefObject<string[]>; shouldUpgradeCanvasImageSource: (canvasItem: CanvasImageItem, scale?: number) => boolean; canvasImageUpgradeTimerRef: React.RefObject<number | null>; runCanvasImageSourceUpgradeQueue: (token: number) => void; CANVAS_IMAGE_SOURCE_UPGRADE_DELAY_MS: 90; cancelCanvasImageSourceUpgradeQueue: () => void; canvasViewportRef: React.RefObject<CanvasViewportRect | null>; readCanvasViewportRect: (surface?: HTMLDivElement | null) => CanvasViewportRect | null; canvasHoveredItemIdRef: React.RefObject<string>; CANVAS_IMAGE_SOURCE_DOWNGRADE_SCALE: 0.65; getCanvasItemRenderedBox: (canvasItem: CanvasImageItem) => CanvasItemBox; canvasRectsIntersect: (a: CanvasItemBox, b: CanvasItemBox) => boolean; CANVAS_IMAGE_SOURCE_UPGRADE_BATCH_SIZE: 3; CANVAS_IMAGE_SOURCE_UPGRADE_MAX_ACTIVE_PREVIEWS: 3; trimCanvasPreviewSourceCache: (keepIds: Set<string>) => void; canvasAiPromptEditingId: string | null; canvasAiExpandedOutputNodeIds: Set<string>; isCanvasWorkflowGroupInSingleEdit: (groupId?: string | null) => boolean; getCanvasWorkflowGroupItemIdsForSelection: (groupId: string, sourceItems?: CanvasImageItem[]) => string[]; canvasPendingSelectionDomIdsRef: React.RefObject<Set<string>>; getCanvasItemElement: (id: string) => HTMLElement | null; canvasContentRef: React.RefObject<HTMLDivElement | null>; applyCanvasSelectionDomFeedback: (currentIds: string[], nextIds: string[]) => void; activeThreeSceneIdRef: React.RefObject<string | null>; threeSceneHistoryGestureRef: React.RefObject<string | null>; setActiveThreeSceneId: React.Dispatch<React.SetStateAction<string | null>>; scheduleCanvasSelectionImageSources: (ids: Iterable<string>) => void; setCanvasSelectedIds: React.Dispatch<React.SetStateAction<string[]>>; canvasWorkflowSingleEditGroupIdsRef: React.RefObject<Set<string>>; setCanvasWorkflowSingleEditGroupIds: React.Dispatch<React.SetStateAction<string[]>>; showToast: (message: string) => void; setCanvasSelectionWithoutWorkflowExpansion: (ids: string[]) => void; canvasSessionItemsRef: React.RefObject<Map<string, CanvasImageItem[]>>; activeCanvasIdRef: React.RefObject<string>; setCanvasItems: React.Dispatch<React.SetStateAction<CanvasImageItem[]>>; canvasDragRef: React.RefObject<{ ids: string[]; pointerId: number; startClientX: number; startClientY: number; startScrollLeft: number; startScrollTop: number; startItems: Record<string, CanvasItemBox>; latestDelta: { dx: number; dy: number; }; hasMoved: boolean; hasConnections: boolean; pendingSelectionIds: string[] | null; } | null>; hasMoved: boolean | undefined; scheduleCanvasInteractionPaint: (payload: NonNullable<{ kind: "move"; ids: string[]; dx: number; dy: number; } | { kind: "resize"; boxes: Record<string, CanvasItemBox>; } | { kind: "selection"; rect: CanvasItemBox; } | null>) => void; ids: string[]; latestDelta: { dx: number; dy: number; }; dx: number; dy: number; canvasBackgroundPatchChainsRef: React.RefObject<Map<string, Promise<void>>>; hasConnections: boolean | undefined; canvasItemsById: Map<string, CanvasImageItem>; CANVAS_CONNECTION_HANDLE_OUTSET: 0; syncCanvasSelectionFrameStyles: () => void; resetCanvasDragChrome: () => void; refreshCanvasConnectionHandleOcclusion: (options?: { renderedItems?: CanvasImageItem[]; affectedItemIds?: ReadonlySet<string>; }) => void; canvasPointerInteractionCleanupRef: React.RefObject<(() => void) | null>; canvasResizeRef: React.RefObject<{ id: string; corner: CanvasResizeCorner; startClientX: number; startClientY: number; startX: number; startY: number; startWidth: number; startHeight: number; aspect: number; latestBox: CanvasItemBox | null; hasResized: boolean; } | null>; canvasGroupResizeRef: React.RefObject<{ corner: CanvasResizeCorner; startClientX: number; startClientY: number; startBounds: CanvasItemBox; startItems: Record<string, CanvasItemBox>; aspect: number; latestBoxes: Record<string, CanvasItemBox> | null; hasResized: boolean; } | null>; canvasDragDebugRef: React.RefObject<{ startNodeCount: number; pointerMoveCount: number; lastNodeCount: number; } | null>; cancelCanvasInteractionPaint: () => void; clearCanvasItemInteractionStyles: (ids: string[], refreshOcclusion?: boolean) => void; id: string; restoreCanvasItemBoxStyles: (ids: string[]) => void; startItems: Record<string, CanvasItemBox>; canvasSelectionOverlayRef: React.RefObject<HTMLDivElement | null>; canvasInteractionFrameRef: React.RefObject<number | null>; canvasInteractionPayloadRef: React.RefObject<{ kind: "move"; ids: string[]; dx: number; dy: number; } | { kind: "resize"; boxes: Record<string, CanvasItemBox>; } | { kind: "selection"; rect: CanvasItemBox; } | null>; kind: "resize" | "selection"; paintCanvasDragChrome: (ids: string[], dx: number, dy: number) => void; boxes: Record<string, CanvasItemBox>; rect: CanvasItemBox; canvasStateLoadedRef: React.RefObject<boolean>; canvasPatchSavePendingIdsRef: React.RefObject<Set<string>>; canvasPatchSaveTimerRef: React.RefObject<number | null>; scheduleCanvasChangedNodesPatchSave: (ids: string[]) => void; canvasStateSaveDeferredDuringZoomRef: React.RefObject<boolean>; canvasPersistSaveSyncNodesRef: React.RefObject<boolean>; buildCanvasPersistedState: () => CanvasPersistedState; getCanvasNodesPersistSignature: (items: CanvasImageItem[]) => string; canvasLastSyncedNodesSignatureRef: React.RefObject<string>; canvasPersistSaveTimerRef: React.RefObject<number | null>; saveCanvasStateNow: (options?: { syncNodes?: boolean; }) => void; CANVAS_STATE_SAVE_DEBOUNCE_MS: 320; sortCanvasesNewestFirst: (items: CanvasRecord[]) => CanvasRecord[]; setCanvases: React.Dispatch<React.SetStateAction<CanvasRecord[]>>; setCanvasTrashCount: React.Dispatch<React.SetStateAction<number>>; isSwitchingCanvasRef: React.RefObject<boolean>; setActiveCanvasId: React.Dispatch<React.SetStateAction<string>>; setCanvasActionMenuId: React.Dispatch<React.SetStateAction<string | null>>; setIsCanvasTrashOpen: React.Dispatch<React.SetStateAction<boolean>>; setIsLoadingCanvasTrash: React.Dispatch<React.SetStateAction<boolean>>; refreshDeletedCanvases: () => Promise<CanvasRecord[]>; waitForCanvasBackgroundPatches: (canvasId: string) => Promise<void>; getActiveCanvasRunNodeIds: (canvasId: string) => Set<string> | undefined; canvasSizeRef: React.RefObject<{ width: number; height: number; }>; setCanvasSize: React.Dispatch<React.SetStateAction<{ width: number; height: number; }>>; applyCanvasScaleStyles: (scale?: number, size?: { width: number; height: number; }, options?: { updateViewport?: boolean; }) => void; updateCanvasSelection: (ids: string[]) => void; hideCanvasSelectionOverlay: () => void; setCanvasContextMenu: React.Dispatch<React.SetStateAction<CanvasContextMenuState | null>>; setCanvasInputMenuForId: React.Dispatch<React.SetStateAction<string | null>>; setCanvasInputPickTargetId: React.Dispatch<React.SetStateAction<string | null>>; pendingCanvasFusionRoleRef: React.RefObject<{ targetId: string; role: CanvasImageFusionRole; } | null>; setCanvasConnectionDraft: React.Dispatch<React.SetStateAction<{ fromId: string; sourceIds: string[]; fromX: number; fromY: number; toX: number; toY: number; } | null>>; setCanvasInputActionDraft: React.Dispatch<React.SetStateAction<{ targetId: string; fromX: number; fromY: number; toX: number; toY: number; } | null>>; clearCanvasUndoStack: () => void; setCanvasViewport: React.Dispatch<React.SetStateAction<CanvasViewportRect | null>>; scheduleCanvasFocusNearestContentIfViewportEmpty: (canvasId: string) => void; canvasInteractionChangedNodeIdsRef: React.RefObject<Set<string>>; enqueueCanvasBackgroundWrite: (canvasId: string, write: () => Promise<void>) => Promise<void>; setIsSwitchingCanvas: React.Dispatch<React.SetStateAction<boolean>>; saveCurrentCanvasBeforeSwitch: () => Promise<void>; loadCanvasItems: (canvasId: string, options?: { knownEmpty?: boolean; }) => Promise<CanvasImageItem[]>; enterCanvasMode: () => void; openTextInputDialog: (options: TextInputDialogOptions) => Promise<string | null>; canvases: CanvasRecord[]; refreshCanvases: () => Promise<CanvasRecord[]>; switchToCanvas: (canvasId: string) => Promise<void>; isCanvasTrashOpen: boolean; copyCanvasItemsToDrawerFolder: (snapshots: CanvasImageItem[], canvas: CanvasRecord) => { savedCount: number; folderName: string; }; setConfirmDialog: React.Dispatch<React.SetStateAction<ConfirmDialogState>>; closeConfirmDialog: () => void; moveCanvasPageToTrash: (canvas: CanvasRecord) => Promise<void>; saveCanvasPageElementsToDrawer: (canvas: CanvasRecord) => Promise<{ savedCount: number; folderName: string; }>; downgradeCanvasPreviewSources: () => void; canvasViewportFrameRef: React.RefObject<number | null>; canvasViewportDeferredDuringZoomRef: React.RefObject<boolean>; canvasScaleRenderFrameRef: React.RefObject<number | null>; setCanvasScale: React.Dispatch<React.SetStateAction<number>>; canvasZoomSettleTimerRef: React.RefObject<number | null>; canvasVisualViewportRef: React.RefObject<CanvasViewportRect | null>; scheduleCanvasScaleRenderSync: () => void; writeCanvasSurfaceScroll: (surface: HTMLDivElement, left: number, top: number, updateLock?: boolean) => void; canvasScrollLockRef: React.RefObject<{ left: number; top: number; } | null>; canvasSizeCommitDeferredRef: React.RefObject<boolean>; scheduleCanvasViewportUpdate: () => void; scheduleCanvasVisibleImageSourceUpgrades: () => void; scheduleCanvasStateSave: (options?: { syncNodes?: boolean; }) => void; canvasScaleCommitTimerRef: React.RefObject<number | null>; finishCanvasZoomInteraction: () => void; beginCanvasZoomInteraction: () => void; width: number; height: number; canvasReturnScrollRef: React.RefObject<{ left: number; top: number; } | null>; left: number; top: number; canvasUndoRestoringRef: React.RefObject<boolean>; canvasUndoStackRef: React.RefObject<CanvasUndoSnapshot[]>; takeCanvasUndoSnapshot: (label: string, options?: { layoutOnly?: boolean; shareImmutableItems?: boolean; }) => CanvasUndoSnapshot; CANVAS_UNDO_LIMIT: 6; setCanvasSizeImmediate: (nextSize: { width: number; height: number; }) => void; updateCanvasItemsImmediate: (updater: (prev: CanvasImageItem[]) => CanvasImageItem[]) => CanvasImageItem[]; clampCanvasSurfaceScroll: (surface: HTMLDivElement, left: number, top: number, scale?: number, size?: { width: number; height: number; }) => { left: number; top: number; }; pushCanvasUndoSnapshot: (label: string, options?: { layoutOnly?: boolean; shareImmutableItems?: boolean; }) => void; growCanvasToFit: (right: number, bottom: number) => void; canvasItemsPatchCommitRef: React.RefObject<boolean>; updateCanvasItemsDeferred: (updater: (prev: CanvasImageItem[]) => CanvasImageItem[]) => CanvasImageItem[]; scheduleCanvasFocusItemById: (id?: string | null) => void; getCanvasAiOutputCopyPosition: (sourceItem: CanvasImageItem, size: { width: number; height: number; }, outputIndex: number) => { x: number; y: number; }; createAssetId: () => `${string}-${string}-${string}-${string}-${string}`; makeCanvasNodeId: (seed: string, kind?: string) => string; x: number; y: number; appendCanvasItems: (nextItems: CanvasImageItem[], label: string, select?: boolean) => number; markCanvasNodesChanged: (ids: string[]) => void; getCanvasImageInputBufferItemsForNode: (canvasItem: CanvasImageItem, sourceItems?: CanvasImageItem[]) => BufferItem[]; threeSceneAnalyzingIdsRef: React.RefObject<Set<string>>; getThreeSceneAnalysisImages: (node: CanvasImageItem) => { id: string; source: string; name: string; }[]; setThreeSceneRunState: (nodeId: string, status: "idle" | "working" | "success" | "error", error?: string) => void; setThreeSceneAnalyzing: (id: string, analyzing: boolean) => void; agentModelRef: React.RefObject<string>; source: string; updateThreeSceneSpec: (nodeId: string, sceneSpec: SceneSpecV1, options?: { resetAnalysisCamera?: boolean; sourceImageIds?: string[]; sourceImagePaths?: string[]; sceneAnalysis?: SceneAnalysisV1; }) => boolean; activateThreeSceneInteraction: (nodeId: string) => void; getCanvasItemsBounds: (ids: string[]) => CanvasItemBox | null; getCanvasDropPosition: (index?: number, client?: { x: number; y: number; }) => { x: number; y: number; }; exitThreeSceneInteraction: () => void; getCanvasBoundsFromItems: (sourceItems: CanvasImageItem[]) => CanvasItemBox | null; fitCanvasViewToItems: (ids?: string[]) => boolean; };

export const getCanvasPointFromClientImpl = (ctx: Pick<canvasPersistenceActionContext, 'canvasScaleRef' | 'canvasSurfaceRef'>, clientX: number, clientY: number) => {
  const { canvasScaleRef, canvasSurfaceRef } = ctx;
    const surface = canvasSurfaceRef.current;
    if (!surface) return { x: 0, y: 0 };
    const rect = surface.getBoundingClientRect();
    const scale = canvasScaleRef.current || 1;
    return {
      x: Math.max(0, (clientX - rect.left + surface.scrollLeft) / scale),
      y: Math.max(0, (clientY - rect.top + surface.scrollTop) / scale),
    };

};

export const normalizeCanvasSelectionBoxImpl = (ctx: Record<never, never>, box: { startX: number; startY: number; currentX: number; currentY: number }): CanvasItemBox => {
  const {  } = ctx;
    const left = Math.min(box.startX, box.currentX);
    const top = Math.min(box.startY, box.currentY);
    return {
      x: left,
      y: top,
      width: Math.abs(box.currentX - box.startX),
      height: Math.abs(box.currentY - box.startY),
    };

};

export const getStableCanvasImageSourceImpl = (ctx: Pick<canvasPersistenceActionContext, 'CANVAS_IMAGE_PREVIEW_UPGRADE_ENABLED' | 'canvasImageSourceCacheRef' | 'canvasPreviewSourceIdsRef' | 'canvasSelectedIdsRef'>, canvasItem: CanvasImageItem) => {
  const { CANVAS_IMAGE_PREVIEW_UPGRADE_ENABLED, canvasImageSourceCacheRef, canvasPreviewSourceIdsRef, canvasSelectedIdsRef } = ctx;
    const initialSource = getCanvasInitialImageSource(canvasItem.item);
    const cached = canvasImageSourceCacheRef.current.get(canvasItem.id);
    if (cached?.src) {
      if (cached.quality === 'thumb' && cached.src === initialSource) return cached.src;
      if (
        cached.quality === 'original'
        && canvasSelectedIdsRef.current.includes(canvasItem.id)
        && cached.src === getCanvasOriginalImageSource(canvasItem.item)
        && cached.thumbnail === initialSource
      ) {
        return cached.src;
      }
      if (
        CANVAS_IMAGE_PREVIEW_UPGRADE_ENABLED
        && cached.quality === 'preview'
        && cached.path === getCanvasImageUpgradeLocalPath(canvasItem)
        && cached.thumbnail === initialSource
        && cached.size === CANVAS_IMAGE_SOURCE_UPGRADE_PREVIEW_SIZE
      ) {
        return cached.src;
      }
    }
    if (!initialSource) {
      canvasPreviewSourceIdsRef.current.delete(canvasItem.id);
      canvasImageSourceCacheRef.current.delete(canvasItem.id);
      return '';
    }
    canvasPreviewSourceIdsRef.current.delete(canvasItem.id);
    canvasImageSourceCacheRef.current.set(canvasItem.id, { src: initialSource, quality: 'thumb' });
    return initialSource;

};

export const scheduleCanvasSelectionImageSourcesImpl = (ctx: Pick<canvasPersistenceActionContext, 'applyCanvasImageSourceToElement' | 'canvasImageSourceCacheRef' | 'canvasItemsRef' | 'canvasPreviewSourceIdsRef' | 'canvasSelectedIdsRef' | 'canvasSelectionImageSourceFrameRef' | 'canvasSelectionImageSourceIdsRef'>, ids: Iterable<string>) => {
  const { applyCanvasImageSourceToElement, canvasImageSourceCacheRef, canvasItemsRef, canvasPreviewSourceIdsRef, canvasSelectedIdsRef, canvasSelectionImageSourceFrameRef, canvasSelectionImageSourceIdsRef } = ctx;
    for (const id of ids) canvasSelectionImageSourceIdsRef.current.add(id);
    if (canvasSelectionImageSourceFrameRef.current !== null) return;
    canvasSelectionImageSourceFrameRef.current = window.requestAnimationFrame(() => {
      canvasSelectionImageSourceFrameRef.current = null;
      const pendingIds = Array.from(canvasSelectionImageSourceIdsRef.current);
      canvasSelectionImageSourceIdsRef.current.clear();
      const selectedIds = new Set(canvasSelectedIdsRef.current);
      pendingIds.forEach((id) => {
        const canvasItem = canvasItemsRef.current.find(item => item.id === id);
        if (!canvasItem) {
          canvasImageSourceCacheRef.current.delete(id);
          canvasPreviewSourceIdsRef.current.delete(id);
          return;
        }
        if (canvasItem.item.type !== 'image') return;
        const initialSource = getCanvasInitialImageSource(canvasItem.item);
        const cached = canvasImageSourceCacheRef.current.get(canvasItem.id);
        if (selectedIds.has(canvasItem.id)) {
          const originalSource = getCanvasOriginalImageSource(canvasItem.item);
          if (!originalSource) return;
          canvasImageSourceCacheRef.current.set(canvasItem.id, {
            src: originalSource,
            quality: 'original',
            thumbnail: initialSource,
          });
          canvasPreviewSourceIdsRef.current.add(canvasItem.id);
          applyCanvasImageSourceToElement(canvasItem.id, originalSource);
          return;
        }
        if (cached?.quality !== 'original') return;
        if (!initialSource) {
          canvasImageSourceCacheRef.current.delete(canvasItem.id);
          canvasPreviewSourceIdsRef.current.delete(canvasItem.id);
          return;
        }
        canvasImageSourceCacheRef.current.set(canvasItem.id, { src: initialSource, quality: 'thumb' });
        canvasPreviewSourceIdsRef.current.delete(canvasItem.id);
        applyCanvasImageSourceToElement(canvasItem.id, initialSource);
      });
    });

};

export const downgradeCanvasPreviewSourcesImpl = (ctx: Pick<canvasPersistenceActionContext, 'applyCanvasImageSourceToElement' | 'canvasImageSourceCacheRef' | 'canvasItemsRef' | 'canvasPreviewSourceIdsRef'>) => {
  const { applyCanvasImageSourceToElement, canvasImageSourceCacheRef, canvasItemsRef, canvasPreviewSourceIdsRef } = ctx;
    Array.from(canvasPreviewSourceIdsRef.current).forEach((id) => {
      const cached = canvasImageSourceCacheRef.current.get(id);
      if (!cached) {
        canvasPreviewSourceIdsRef.current.delete(id);
        return;
      }
      if (cached.quality !== 'preview' && cached.quality !== 'original') {
        canvasPreviewSourceIdsRef.current.delete(id);
        return;
      }
      const latest = canvasItemsRef.current.find(item => item.id === id);
      const initialSource = latest ? getCanvasInitialImageSource(latest.item) : '';
      if (!initialSource) {
        canvasImageSourceCacheRef.current.delete(id);
        canvasPreviewSourceIdsRef.current.delete(id);
        return;
      }
      canvasImageSourceCacheRef.current.set(id, { src: initialSource, quality: 'thumb' });
      canvasPreviewSourceIdsRef.current.delete(id);
      applyCanvasImageSourceToElement(id, initialSource);
    });

};

export const trimCanvasPreviewSourceCacheImpl = (ctx: Pick<canvasPersistenceActionContext, 'applyCanvasImageSourceToElement' | 'canvasImageSourceCacheRef' | 'canvasItemsRef' | 'canvasPreviewSourceIdsRef'>, keepIds: Set<string>) => {
  const { applyCanvasImageSourceToElement, canvasImageSourceCacheRef, canvasItemsRef, canvasPreviewSourceIdsRef } = ctx;
    Array.from(canvasPreviewSourceIdsRef.current).forEach((id) => {
      if (keepIds.has(id)) return;
      const cached = canvasImageSourceCacheRef.current.get(id);
      if (!cached || (cached.quality !== 'preview' && cached.quality !== 'original')) {
        canvasPreviewSourceIdsRef.current.delete(id);
        return;
      }
      const latest = canvasItemsRef.current.find(item => item.id === id);
      const initialSource = latest ? getCanvasInitialImageSource(latest.item) : '';
      if (!initialSource) {
        canvasImageSourceCacheRef.current.delete(id);
        canvasPreviewSourceIdsRef.current.delete(id);
        return;
      }
      canvasImageSourceCacheRef.current.set(id, { src: initialSource, quality: 'thumb' });
      canvasPreviewSourceIdsRef.current.delete(id);
      applyCanvasImageSourceToElement(id, initialSource);
    });

};

export const shouldUpgradeCanvasImageSourceImpl = (ctx: Pick<canvasPersistenceActionContext, 'CANVAS_IMAGE_PREVIEW_UPGRADE_ENABLED' | 'CANVAS_IMAGE_SOURCE_UPGRADE_MIN_SCALE' | 'CANVAS_IMAGE_SOURCE_UPGRADE_PIXEL_THRESHOLD' | 'canvasImageSourceCacheRef' | 'canvasImageUpgradeFailedRef'>, canvasItem: CanvasImageItem, scale: number) => {
  const { CANVAS_IMAGE_PREVIEW_UPGRADE_ENABLED, CANVAS_IMAGE_SOURCE_UPGRADE_MIN_SCALE, CANVAS_IMAGE_SOURCE_UPGRADE_PIXEL_THRESHOLD, canvasImageSourceCacheRef, canvasImageUpgradeFailedRef } = ctx;
    if (!CANVAS_IMAGE_PREVIEW_UPGRADE_ENABLED) return false;
    if (canvasItem.item.type !== 'image') return false;
    if (isCanvasAiGeneratedType(canvasItem.ai?.type) && canvasItem.ai?.status !== 'success') return false;
    const initialSource = getCanvasInitialImageSource(canvasItem.item);
    if (!initialSource) return false;
    const localPath = getCanvasImageUpgradeLocalPath(canvasItem);
    if (!localPath) return false;
    if (canvasImageUpgradeFailedRef.current.has(getCanvasImageUpgradeFailureKey(canvasItem))) return false;
    const cached = canvasImageSourceCacheRef.current.get(canvasItem.id);
    if (cached?.quality === 'original') return false;
    if (
      cached?.quality === 'preview'
      && cached.path === localPath
      && cached.thumbnail === initialSource
      && cached.size === CANVAS_IMAGE_SOURCE_UPGRADE_PREVIEW_SIZE
    ) {
      return false;
    }
    const renderedPixels = Math.max(canvasItem.width, canvasItem.height) * scale;
    return scale > CANVAS_IMAGE_SOURCE_UPGRADE_MIN_SCALE
      && renderedPixels > CANVAS_IMAGE_SOURCE_UPGRADE_PIXEL_THRESHOLD;

};

export const runCanvasImageSourceUpgradeQueueImpl = (ctx: Pick<canvasPersistenceActionContext, 'CANVAS_IMAGE_SOURCE_UPGRADE_CONCURRENCY' | 'CANVAS_IMAGE_SOURCE_UPGRADE_DELAY_MS' | 'applyCanvasImageSourceToElement' | 'canvasImageSourceCacheRef' | 'canvasImageUpgradeFailedRef' | 'canvasImageUpgradeInFlightRef' | 'canvasImageUpgradeQueueRef' | 'canvasImageUpgradeTimerRef' | 'canvasImageUpgradeTokenRef' | 'canvasItemsRef' | 'canvasPanRef' | 'canvasPreviewSourceIdsRef' | 'isCanvasInteractingRef' | 'isCanvasModeRef' | 'isCanvasZoomingRef' | 'runCanvasImageSourceUpgradeQueue' | 'shouldUpgradeCanvasImageSource'>, token: number) => {
  const { CANVAS_IMAGE_SOURCE_UPGRADE_CONCURRENCY, CANVAS_IMAGE_SOURCE_UPGRADE_DELAY_MS, applyCanvasImageSourceToElement, canvasImageSourceCacheRef, canvasImageUpgradeFailedRef, canvasImageUpgradeInFlightRef, canvasImageUpgradeQueueRef, canvasImageUpgradeTimerRef, canvasImageUpgradeTokenRef, canvasItemsRef, canvasPanRef, canvasPreviewSourceIdsRef, isCanvasInteractingRef, isCanvasModeRef, isCanvasZoomingRef, runCanvasImageSourceUpgradeQueue, shouldUpgradeCanvasImageSource } = ctx;
    if (token !== canvasImageUpgradeTokenRef.current) return;
    if (
      !isCanvasModeRef.current ||
      isCanvasZoomingRef.current ||
      isCanvasInteractingRef.current ||
      canvasPanRef.current
    ) {
      return;
    }

    while (
      canvasImageUpgradeInFlightRef.current.size < CANVAS_IMAGE_SOURCE_UPGRADE_CONCURRENCY &&
      canvasImageUpgradeQueueRef.current.length > 0
    ) {
      const id = canvasImageUpgradeQueueRef.current.shift();
      if (!id || canvasImageUpgradeInFlightRef.current.has(id)) continue;
      const canvasItem = canvasItemsRef.current.find(item => item.id === id);
      if (!canvasItem || !shouldUpgradeCanvasImageSource(canvasItem)) continue;
      const localPath = getCanvasImageUpgradeLocalPath(canvasItem);
      const initialSource = getCanvasInitialImageSource(canvasItem.item);
      if (!localPath || !initialSource) continue;

      canvasImageUpgradeInFlightRef.current.add(id);
      void invoke<ImageThumbnailFileResult>('ensure_image_thumbnail_file', {
        path: localPath,
        size: CANVAS_IMAGE_SOURCE_UPGRADE_PREVIEW_SIZE,
      })
        .then((result) => {
          if (token !== canvasImageUpgradeTokenRef.current) return;
          const latest = canvasItemsRef.current.find(item => item.id === id);
          if (
            !latest
            || getCanvasImageUpgradeLocalPath(latest) !== localPath
            || getCanvasInitialImageSource(latest.item) !== initialSource
          ) {
            return;
          }
          const previewSource = result.url || (result.path ? convertFileSrc(result.path) : '');
          if (!previewSource) throw new Error('canvas preview thumbnail source is empty');
          canvasImageSourceCacheRef.current.set(id, {
            src: previewSource,
            quality: 'preview',
            path: localPath,
            thumbnail: initialSource,
            size: CANVAS_IMAGE_SOURCE_UPGRADE_PREVIEW_SIZE,
          });
          canvasPreviewSourceIdsRef.current.add(id);
          applyCanvasImageSourceToElement(id, previewSource);
        })
        .catch(() => {
          canvasImageUpgradeFailedRef.current.add(getCanvasImageUpgradeFailureKey(canvasItem));
        })
        .finally(() => {
          canvasImageUpgradeInFlightRef.current.delete(id);
          if (token !== canvasImageUpgradeTokenRef.current) {
            if (
              canvasImageUpgradeQueueRef.current.length > 0
              && !isCanvasInteractingRef.current
              && !isCanvasZoomingRef.current
              && !canvasPanRef.current
              && canvasImageUpgradeTimerRef.current === null
            ) {
              const currentToken = canvasImageUpgradeTokenRef.current;
              canvasImageUpgradeTimerRef.current = window.setTimeout(() => {
                canvasImageUpgradeTimerRef.current = null;
                runCanvasImageSourceUpgradeQueue(currentToken);
              }, CANVAS_IMAGE_SOURCE_UPGRADE_DELAY_MS);
            }
            return;
          }
          if (canvasImageUpgradeQueueRef.current.length === 0 && canvasImageUpgradeInFlightRef.current.size === 0) return;
          if (canvasImageUpgradeTimerRef.current !== null) return;
          canvasImageUpgradeTimerRef.current = window.setTimeout(() => {
            canvasImageUpgradeTimerRef.current = null;
            runCanvasImageSourceUpgradeQueue(token);
          }, CANVAS_IMAGE_SOURCE_UPGRADE_DELAY_MS);
        });
    }

};

export const scheduleCanvasVisibleImageSourceUpgradesImpl = (ctx: Pick<canvasPersistenceActionContext, 'CANVAS_IMAGE_PREVIEW_UPGRADE_ENABLED' | 'CANVAS_IMAGE_SOURCE_DOWNGRADE_SCALE' | 'CANVAS_IMAGE_SOURCE_UPGRADE_BATCH_SIZE' | 'CANVAS_IMAGE_SOURCE_UPGRADE_DELAY_MS' | 'CANVAS_IMAGE_SOURCE_UPGRADE_MAX_ACTIVE_PREVIEWS' | 'cancelCanvasImageSourceUpgradeQueue' | 'canvasHoveredItemIdRef' | 'canvasImageUpgradeQueueRef' | 'canvasImageUpgradeTimerRef' | 'canvasImageUpgradeTokenRef' | 'canvasItemsRef' | 'canvasPanRef' | 'canvasPreviewSourceIdsRef' | 'canvasRectsIntersect' | 'canvasScaleRef' | 'canvasSelectedIdsRef' | 'canvasViewportRef' | 'getCanvasItemRenderedBox' | 'isCanvasInteractingRef' | 'isCanvasModeRef' | 'isCanvasZoomingRef' | 'readCanvasViewportRect' | 'runCanvasImageSourceUpgradeQueue' | 'shouldUpgradeCanvasImageSource' | 'trimCanvasPreviewSourceCache'>) => {
  const { CANVAS_IMAGE_PREVIEW_UPGRADE_ENABLED, CANVAS_IMAGE_SOURCE_DOWNGRADE_SCALE, CANVAS_IMAGE_SOURCE_UPGRADE_BATCH_SIZE, CANVAS_IMAGE_SOURCE_UPGRADE_DELAY_MS, CANVAS_IMAGE_SOURCE_UPGRADE_MAX_ACTIVE_PREVIEWS, cancelCanvasImageSourceUpgradeQueue, canvasHoveredItemIdRef, canvasImageUpgradeQueueRef, canvasImageUpgradeTimerRef, canvasImageUpgradeTokenRef, canvasItemsRef, canvasPanRef, canvasPreviewSourceIdsRef, canvasRectsIntersect, canvasScaleRef, canvasSelectedIdsRef, canvasViewportRef, getCanvasItemRenderedBox, isCanvasInteractingRef, isCanvasModeRef, isCanvasZoomingRef, readCanvasViewportRect, runCanvasImageSourceUpgradeQueue, shouldUpgradeCanvasImageSource, trimCanvasPreviewSourceCache } = ctx;
    cancelCanvasImageSourceUpgradeQueue();
    if (!CANVAS_IMAGE_PREVIEW_UPGRADE_ENABLED) return;
    if (!isCanvasModeRef.current || isCanvasZoomingRef.current || isCanvasInteractingRef.current || canvasPanRef.current) return;
    const viewport = canvasViewportRef.current || readCanvasViewportRect();
    if (!viewport) return;
    const scale = canvasScaleRef.current || 1;
    const selectedIds = new Set(canvasSelectedIdsRef.current);
    const hoveredId = canvasHoveredItemIdRef.current;
    if (scale < CANVAS_IMAGE_SOURCE_DOWNGRADE_SCALE && !hoveredId && selectedIds.size === 0) return;
    const centerX = viewport.x + viewport.width / 2;
    const centerY = viewport.y + viewport.height / 2;
    const visible = canvasItemsRef.current
      .map(item => ({ item, box: getCanvasItemRenderedBox(item) }))
      .filter(entry => canvasRectsIntersect(viewport, entry.box))
      .filter(entry => shouldUpgradeCanvasImageSource(entry.item, scale))
      .sort((a, b) => {
        const aPriority = selectedIds.has(a.item.id) ? 0 : a.item.id === hoveredId ? 1 : 2;
        const bPriority = selectedIds.has(b.item.id) ? 0 : b.item.id === hoveredId ? 1 : 2;
        if (aPriority !== bPriority) return aPriority - bPriority;
        const aDx = a.box.x + a.box.width / 2 - centerX;
        const aDy = a.box.y + a.box.height / 2 - centerY;
        const bDx = b.box.x + b.box.width / 2 - centerX;
        const bDy = b.box.y + b.box.height / 2 - centerY;
        return (aDx * aDx + aDy * aDy) - (bDx * bDx + bDy * bDy);
      })
      .slice(0, CANVAS_IMAGE_SOURCE_UPGRADE_BATCH_SIZE)
      .map(entry => entry.item.id);
    const keepPreviewIds = new Set(visible.slice(0, CANVAS_IMAGE_SOURCE_UPGRADE_MAX_ACTIVE_PREVIEWS));
    Array.from(canvasPreviewSourceIdsRef.current).forEach((id) => {
      if (keepPreviewIds.size >= CANVAS_IMAGE_SOURCE_UPGRADE_MAX_ACTIVE_PREVIEWS) return;
      keepPreviewIds.add(id);
    });
    trimCanvasPreviewSourceCache(keepPreviewIds);
    if (visible.length === 0) return;
    const token = canvasImageUpgradeTokenRef.current;
    canvasImageUpgradeQueueRef.current = visible;
    canvasImageUpgradeTimerRef.current = window.setTimeout(() => {
      canvasImageUpgradeTimerRef.current = null;
      runCanvasImageSourceUpgradeQueue(token);
    }, CANVAS_IMAGE_SOURCE_UPGRADE_DELAY_MS);

};

export const getCanvasAiNodeDesignSizeForItemImpl = (ctx: Record<never, never>, canvasItem: CanvasImageItem, promptExpanded: boolean, outputsExpanded: boolean) => {
  const {  } = ctx;
    const canvasAiOutputs = getCanvasAiOutputPreviewSlots(canvasItem);
    const visibleOutputs = getCanvasAiVisibleOutputs(canvasAiOutputs, outputsExpanded);
    const canvasAiRealOutputs = canvasItem.ai?.outputs || [];
    const canvasAiOutputAspectRatio = canvasAiOutputs[0]?.width && canvasAiOutputs[0]?.height
      ? `${canvasAiOutputs[0].width}:${canvasAiOutputs[0].height}`
      : canvasItem.ai?.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO;
    return getCanvasAiNodeAutoSize({
      type: getCanvasAiNodeAutoSizeType(canvasItem.ai),
      aspectRatio: canvasAiOutputAspectRatio,
      count: canvasItem.ai?.count,
      outputCount: visibleOutputs.length || undefined,
      hasPreset: canvasItem.ai?.type !== 'workflow' && !!canvasItem.ai?.presetLabel,
      hasError: !!canvasItem.ai?.error,
      promptText: canvasItem.item.content || '',
      promptExpanded,
      showOutputPreview: canvasItem.ai?.type === 'workflow' || canvasAiRealOutputs.length > 0,
      localMediaTool: isCanvasAiLocalMediaToolType(canvasItem.ai?.type),
      showLocalMediaProgress: shouldShowCanvasAiLocalMediaProgress(canvasItem.ai),
      imageRulePanelExpanded: canvasItem.ai?.type === 'image-generator' && canvasItem.ai.imagePolicy?.panelExpanded !== false,
      imageFusion: isCanvasImageFusionAi(canvasItem.ai),
      internalSlotCount: canvasItem.ai?.type === 'workflow'
        ? getCanvasWorkflowInternalSlotNodes(getCanvasWorkflowTemplateFromNode(canvasItem)).length
        : 0,
    });

};

export const expandCanvasSelectionIdsWithGroupsImpl = (ctx: Pick<canvasPersistenceActionContext, 'getCanvasWorkflowGroupItemIdsForSelection' | 'isCanvasWorkflowGroupInSingleEdit'>, ids: string[], sourceItems: CanvasImageItem[]) => {
  const { getCanvasWorkflowGroupItemIdsForSelection, isCanvasWorkflowGroupInSingleEdit } = ctx;
    const expanded = new Set(ids.filter(Boolean));
    let previousSize = -1;
    while (previousSize !== expanded.size) {
      previousSize = expanded.size;
      Array.from(expanded).forEach(id => {
        const item = sourceItems.find(canvasItem => canvasItem.id === id);
        const groupId = getCanvasWorkflowGroupIdForSelection(item);
        if (!groupId || isCanvasWorkflowGroupInSingleEdit(groupId)) return;
        getCanvasWorkflowGroupItemIdsForSelection(groupId, sourceItems).forEach(groupItemId => {
          expanded.add(groupItemId);
        });
      });
      expandCanvasGroupSelectionIds(Array.from(expanded), sourceItems).forEach(groupItemId => {
        expanded.add(groupItemId);
      });
    }
    return Array.from(expanded);

};

export const applyCanvasSelectionDomFeedbackImpl = (ctx: Pick<canvasPersistenceActionContext, 'canvasContentRef' | 'canvasItemsRef' | 'canvasPendingSelectionDomIdsRef' | 'canvasSurfaceRef' | 'getCanvasItemElement'>, currentIds: string[], nextIds: string[]) => {
  const { canvasContentRef, canvasItemsRef, canvasPendingSelectionDomIdsRef, canvasSurfaceRef, getCanvasItemElement } = ctx;
    const currentSet = new Set(currentIds);
    const nextSet = new Set(nextIds);
    const changedIds = new Set([...currentIds, ...nextIds]);
    changedIds.forEach((id) => {
      if (currentSet.has(id) === nextSet.has(id)) return;
      canvasPendingSelectionDomIdsRef.current.add(id);
      const element = getCanvasItemElement(id);
      if (!element) return;
      if (nextSet.has(id)) {
        element.setAttribute('data-canvas-selected-state', 'true');
        element.style.zIndex = '2';
      } else {
        element.removeAttribute('data-canvas-selected-state');
        element.style.zIndex = '0';
      }
    });
    const groupMemberIds = new Map<string, string[]>();
    canvasItemsRef.current.forEach((item) => {
      const groupId = getCanvasGroupId(item);
      if (!groupId) return;
      const memberIds = groupMemberIds.get(groupId);
      if (memberIds) memberIds.push(item.id);
      else groupMemberIds.set(groupId, [item.id]);
    });
    canvasContentRef.current
      ?.querySelectorAll<HTMLElement>('[data-canvas-group-frame-id]')
      .forEach((frame) => {
        const memberIds = groupMemberIds.get(frame.dataset.canvasGroupFrameId || '') || [];
        if (memberIds.length > 0 && memberIds.every(id => nextSet.has(id))) {
          frame.setAttribute('data-canvas-group-selected', 'true');
        } else {
          frame.removeAttribute('data-canvas-group-selected');
        }
      });
    if (canvasPendingSelectionDomIdsRef.current.size > 0) {
      canvasSurfaceRef.current?.setAttribute('data-canvas-selection-pending', 'true');
    }

};

export const commitCanvasSelectionImpl = (ctx: Pick<canvasPersistenceActionContext, 'activeThreeSceneIdRef' | 'applyCanvasSelectionDomFeedback' | 'canvasItemsRef' | 'canvasSelectedIdsRef' | 'scheduleCanvasSelectionImageSources' | 'setActiveThreeSceneId' | 'setCanvasSelectedIds' | 'threeSceneHistoryGestureRef'>, unique: string[]) => {
  const { activeThreeSceneIdRef, applyCanvasSelectionDomFeedback, canvasItemsRef, canvasSelectedIdsRef, scheduleCanvasSelectionImageSources, setActiveThreeSceneId, setCanvasSelectedIds, threeSceneHistoryGestureRef } = ctx;
    const current = canvasSelectedIdsRef.current;
    if (current.length === unique.length && current.every((value, index) => value === unique[index])) return;
    applyCanvasSelectionDomFeedback(current, unique);
    canvasSelectedIdsRef.current = unique;
    const selectedThreeSceneId = unique.length === 1
      ? canvasItemsRef.current.find(item => (
        item.id === unique[0]
        && item.item.type === 'three-scene'
        && !!item.threeScene
        && (!item.threeScene.status || item.threeScene.status === 'success')
      ))?.id || null
      : null;
    if (activeThreeSceneIdRef.current !== selectedThreeSceneId) {
      activeThreeSceneIdRef.current = selectedThreeSceneId;
      threeSceneHistoryGestureRef.current = null;
      setActiveThreeSceneId(selectedThreeSceneId);
    }
    scheduleCanvasSelectionImageSources([...current, ...unique]);
    startTransition(() => setCanvasSelectedIds(unique));

};

export const enableCanvasWorkflowSingleEditForItemImpl = (ctx: Pick<canvasPersistenceActionContext, 'canvasItemsRef' | 'canvasWorkflowSingleEditGroupIdsRef' | 'setCanvasSelectionWithoutWorkflowExpansion' | 'setCanvasWorkflowSingleEditGroupIds' | 'showToast'>, id: string) => {
  const { canvasItemsRef, canvasWorkflowSingleEditGroupIdsRef, setCanvasSelectionWithoutWorkflowExpansion, setCanvasWorkflowSingleEditGroupIds, showToast } = ctx;
    const item = canvasItemsRef.current.find(canvasItem => canvasItem.id === id);
    const groupId = getCanvasWorkflowGroupIdForSelection(item);
    if (!groupId) return false;
    if (!canvasWorkflowSingleEditGroupIdsRef.current.has(groupId)) {
      canvasWorkflowSingleEditGroupIdsRef.current.add(groupId);
      setCanvasWorkflowSingleEditGroupIds(prev => prev.includes(groupId) ? prev : [...prev, groupId]);
      showToast('已进入工作流单节点编辑：可单独移动、删除内部节点');
    } else {
      showToast('当前工作流已处于单节点编辑模式');
    }
    setCanvasSelectionWithoutWorkflowExpansion([id]);
    return true;

};

export const updateCanvasItemsImmediateImpl = (ctx: Pick<canvasPersistenceActionContext, 'activeCanvasIdRef' | 'canvasDragRef' | 'canvasItemsRef' | 'canvasSessionItemsRef' | 'scheduleCanvasInteractionPaint' | 'setCanvasItems'>, updater: (prev: CanvasImageItem[]) => CanvasImageItem[]) => {
  const { activeCanvasIdRef, canvasDragRef, canvasItemsRef, canvasSessionItemsRef, scheduleCanvasInteractionPaint, setCanvasItems } = ctx;
    const next = updater(canvasItemsRef.current);
    canvasItemsRef.current = next;
    canvasSessionItemsRef.current.set(activeCanvasIdRef.current || DEFAULT_CANVAS_ID, next);
    setCanvasItems(next);
    const activeDrag = canvasDragRef.current;
    if (activeDrag?.hasMoved) {
      scheduleCanvasInteractionPaint({
        kind: 'move',
        ids: activeDrag.ids,
        dx: activeDrag.latestDelta.dx,
        dy: activeDrag.latestDelta.dy,
      });
    }
    return next;

};

export const updateCanvasItemsDeferredImpl = (ctx: Pick<canvasPersistenceActionContext, 'activeCanvasIdRef' | 'canvasItemsRef' | 'canvasSessionItemsRef' | 'setCanvasItems'>, updater: (prev: CanvasImageItem[]) => CanvasImageItem[]) => {
  const { activeCanvasIdRef, canvasItemsRef, canvasSessionItemsRef, setCanvasItems } = ctx;
    const next = updater(canvasItemsRef.current);
    if (next === canvasItemsRef.current) return next;
    canvasItemsRef.current = next;
    canvasSessionItemsRef.current.set(activeCanvasIdRef.current || DEFAULT_CANVAS_ID, next);
    startTransition(() => {
      setCanvasItems(() => canvasItemsRef.current);
    });
    return next;

};

export const enqueueCanvasBackgroundWriteImpl = (ctx: Pick<canvasPersistenceActionContext, 'canvasBackgroundPatchChainsRef'>, canvasId: string, write: () => Promise<void>) => {
  const { canvasBackgroundPatchChainsRef } = ctx;
    const normalizedCanvasId = canvasId || DEFAULT_CANVAS_ID;
    const previous = canvasBackgroundPatchChainsRef.current.get(normalizedCanvasId) || Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(write);
    canvasBackgroundPatchChainsRef.current.set(normalizedCanvasId, next);
    void next
      .catch((error) => {
        console.warn('Failed to persist a background canvas result:', error);
      })
      .finally(() => {
        if (canvasBackgroundPatchChainsRef.current.get(normalizedCanvasId) === next) {
          canvasBackgroundPatchChainsRef.current.delete(normalizedCanvasId);
        }
      });
    return next;

};

export const paintCanvasDragChromeImpl = (ctx: Pick<canvasPersistenceActionContext, 'CANVAS_CONNECTION_HANDLE_OUTSET' | 'canvasContentRef' | 'canvasDragRef' | 'canvasItemsById' | 'getCanvasItemRenderedBox'>, ids: string[], dx: number, dy: number) => {
  const { CANVAS_CONNECTION_HANDLE_OUTSET, canvasContentRef, canvasDragRef, canvasItemsById, getCanvasItemRenderedBox } = ctx;
    const content = canvasContentRef.current;
    if (!content) return;
    const movedIds = new Set(ids);
    const transform = `translate3d(${dx}px, ${dy}px, 0)`;

    content.querySelectorAll<HTMLElement>('[data-canvas-selection-frame="true"], [data-canvas-group-selected="true"]').forEach((element) => {
      element.style.transform = transform;
    });

    const activeDrag = canvasDragRef.current;
    if (!activeDrag?.hasConnections) return;
    const connectionSelector = ids.flatMap((id) => {
      const selectorId = typeof CSS !== 'undefined' && CSS.escape
        ? CSS.escape(id)
        : id.replace(/["\\]/g, '\\$&');
      return [
        `[data-canvas-connection-source-id="${selectorId}"]`,
        `[data-canvas-connection-target-id="${selectorId}"]`,
      ];
    }).join(',');
    if (!connectionSelector) return;

    content.querySelectorAll<SVGGElement>(connectionSelector).forEach((group) => {
      const sourceId = group.dataset.canvasConnectionSourceId || '';
      const targetId = group.dataset.canvasConnectionTargetId || '';
      const source = canvasItemsById.get(sourceId);
      const target = canvasItemsById.get(targetId);
      if (!source || !target) return;
      const sourceBox = getCanvasItemRenderedBox(source);
      const targetBox = getCanvasItemRenderedBox(target);
      const sourceDx = movedIds.has(sourceId) ? dx : 0;
      const sourceDy = movedIds.has(sourceId) ? dy : 0;
      const targetDx = movedIds.has(targetId) ? dx : 0;
      const targetDy = movedIds.has(targetId) ? dy : 0;
      const sourceX = sourceBox.x + sourceBox.width + CANVAS_CONNECTION_HANDLE_OUTSET + sourceDx;
      const sourceY = sourceBox.y + sourceBox.height / 2 + sourceDy;
      const targetX = targetBox.x - CANVAS_CONNECTION_HANDLE_OUTSET + targetDx;
      const targetY = targetBox.y + targetBox.height / 2 + targetDy;
      const bend = Math.max(80, Math.abs(targetX - sourceX) * 0.45);
      const direction = targetX >= sourceX ? 1 : -1;
      const path = `M ${sourceX} ${sourceY} C ${sourceX + bend * direction} ${sourceY}, ${targetX - bend * direction} ${targetY}, ${targetX} ${targetY}`;
      group.querySelectorAll<SVGPathElement>('path').forEach(element => element.setAttribute('d', path));
      const endpoints = group.querySelectorAll<SVGCircleElement>('circle');
      if (endpoints[0]) {
        endpoints[0].setAttribute('cx', String(sourceX));
        endpoints[0].setAttribute('cy', String(sourceY));
      }
      if (endpoints[1]) {
        endpoints[1].setAttribute('cx', String(targetX));
        endpoints[1].setAttribute('cy', String(targetY));
      }
    });

};

export const syncCanvasSelectionFrameStylesImpl = (ctx: Pick<canvasPersistenceActionContext, 'canvasContentRef' | 'canvasItemsRef' | 'canvasSelectedIdsRef' | 'getCanvasItemRenderedBox'>) => {
  const { canvasContentRef, canvasItemsRef, canvasSelectedIdsRef, getCanvasItemRenderedBox } = ctx;
    const content = canvasContentRef.current;
    if (!content) return;
    const selectedIdSet = new Set(canvasSelectedIdsRef.current);
    const selectedItems = canvasItemsRef.current.filter(item => selectedIdSet.has(item.id));
    if (selectedItems.length === 0) return;
    const boxes = selectedItems.map(getCanvasItemRenderedBox);
    const frameBox = selectedItems.length === 1
      ? {
          x: boxes[0].x - 12,
          y: boxes[0].y - 12,
          width: boxes[0].width + 24,
          height: boxes[0].height + 24,
        }
      : {
          x: Math.min(...boxes.map(box => box.x)),
          y: Math.min(...boxes.map(box => box.y)),
          width: Math.max(...boxes.map(box => box.x + box.width)) - Math.min(...boxes.map(box => box.x)),
          height: Math.max(...boxes.map(box => box.y + box.height)) - Math.min(...boxes.map(box => box.y)),
        };
    content.querySelectorAll<HTMLElement>('[data-canvas-selection-frame="true"]').forEach((element) => {
      element.style.left = `${frameBox.x}px`;
      element.style.top = `${frameBox.y}px`;
      element.style.width = `${frameBox.width}px`;
      element.style.height = `${frameBox.height}px`;
    });
    const groupOutlines = new Map(
      getCanvasGroupOutlines(canvasItemsRef.current, getCanvasItemRenderedBox)
        .map(outline => [outline.id, outline]),
    );
    content.querySelectorAll<HTMLElement>('[data-canvas-group-frame-id]').forEach((element) => {
      const outline = groupOutlines.get(element.dataset.canvasGroupFrameId || '');
      if (!outline) return;
      element.style.left = `${outline.bounds.x}px`;
      element.style.top = `${outline.bounds.y}px`;
      element.style.width = `${outline.bounds.width}px`;
      element.style.height = `${outline.bounds.height}px`;
    });

};

export const resetCanvasDragChromeImpl = (ctx: Pick<canvasPersistenceActionContext, 'CANVAS_CONNECTION_HANDLE_OUTSET' | 'canvasContentRef' | 'canvasItemsRef' | 'getCanvasItemRenderedBox' | 'syncCanvasSelectionFrameStyles'>) => {
  const { CANVAS_CONNECTION_HANDLE_OUTSET, canvasContentRef, canvasItemsRef, getCanvasItemRenderedBox, syncCanvasSelectionFrameStyles } = ctx;
    const content = canvasContentRef.current;
    if (!content) return;
    content.querySelectorAll<HTMLElement>('[data-canvas-selection-frame="true"], [data-canvas-group-selected="true"], [data-canvas-connection-handle-id]').forEach((element) => {
      element.style.transform = '';
      if (element.dataset.canvasSelectionFrame === 'true') element.style.willChange = '';
    });
    syncCanvasSelectionFrameStyles();

    const itemsById = new Map(canvasItemsRef.current.map(item => [item.id, item]));
    content.querySelectorAll<SVGGElement>('[data-canvas-connection-source-id][data-canvas-connection-target-id]').forEach((group) => {
      const source = itemsById.get(group.dataset.canvasConnectionSourceId || '');
      const target = itemsById.get(group.dataset.canvasConnectionTargetId || '');
      if (!source || !target) return;
      const sourceBox = getCanvasItemRenderedBox(source);
      const targetBox = getCanvasItemRenderedBox(target);
      const sourceX = sourceBox.x + sourceBox.width + CANVAS_CONNECTION_HANDLE_OUTSET;
      const sourceY = sourceBox.y + sourceBox.height / 2;
      const targetX = targetBox.x - CANVAS_CONNECTION_HANDLE_OUTSET;
      const targetY = targetBox.y + targetBox.height / 2;
      const bend = Math.max(80, Math.abs(targetX - sourceX) * 0.45);
      const direction = targetX >= sourceX ? 1 : -1;
      const path = `M ${sourceX} ${sourceY} C ${sourceX + bend * direction} ${sourceY}, ${targetX - bend * direction} ${targetY}, ${targetX} ${targetY}`;
      group.querySelectorAll<SVGPathElement>('path').forEach(element => element.setAttribute('d', path));
      const endpoints = group.querySelectorAll<SVGCircleElement>('circle');
      if (endpoints[0]) {
        endpoints[0].setAttribute('cx', String(sourceX));
        endpoints[0].setAttribute('cy', String(sourceY));
      }
      if (endpoints[1]) {
        endpoints[1].setAttribute('cx', String(targetX));
        endpoints[1].setAttribute('cy', String(targetY));
      }
    });

};

export const refreshCanvasConnectionHandleOcclusionImpl = (ctx: Pick<canvasPersistenceActionContext, 'CANVAS_CONNECTION_HANDLE_OUTSET' | 'canvasContentRef' | 'canvasItemsRef' | 'canvasSelectedIdsRef' | 'getCanvasItemRenderedBox'>, options: {
    renderedItems?: CanvasImageItem[];
    affectedItemIds?: ReadonlySet<string>;
  } = {}) => {
  const { CANVAS_CONNECTION_HANDLE_OUTSET, canvasContentRef, canvasItemsRef, canvasSelectedIdsRef, getCanvasItemRenderedBox } = ctx;
    const content = canvasContentRef.current;
    if (!content) return;
    const items = options.renderedItems || (() => {
      const renderedIds = new Set(
        Array.from(content.querySelectorAll<HTMLElement>('[data-canvas-item-id]'))
          .map(element => element.dataset.canvasItemId || '')
          .filter(Boolean),
      );
      return canvasItemsRef.current.filter(item => renderedIds.has(item.id));
    })();
    const itemsById = new Map(items.map(item => [item.id, item]));
    const itemOrder = new Map(items.map((item, index) => [item.id, index]));
    const selectedIds = new Set(canvasSelectedIdsRef.current);
    const liveBoxes = new Map(items.map(item => [item.id, getCanvasItemRenderedBox(item)] as const));
    const affectedBoxes = options.affectedItemIds
      ? Array.from(options.affectedItemIds)
        .map(id => liveBoxes.get(id))
        .filter((box): box is CanvasItemBox => !!box)
      : null;
    const isAbove = (candidate: CanvasImageItem, owner: CanvasImageItem) => {
      const candidateSelected = selectedIds.has(candidate.id);
      const ownerSelected = selectedIds.has(owner.id);
      if (candidateSelected !== ownerSelected) return candidateSelected;
      return (itemOrder.get(candidate.id) || 0) > (itemOrder.get(owner.id) || 0);
    };
    content.querySelectorAll<HTMLElement>('[data-canvas-connection-handle-id]').forEach((handle) => {
      const itemId = handle.dataset.canvasConnectionHandleId || '';
      const owner = itemsById.get(itemId);
      if (!owner) {
        handle.style.visibility = '';
        return;
      }
      const ownerBox = liveBoxes.get(owner.id);
      if (!ownerBox) return;
      const side = handle.dataset.canvasConnectionHandleSide;
      const centerX = side === 'source'
        ? ownerBox.x + ownerBox.width + CANVAS_CONNECTION_HANDLE_OUTSET
        : ownerBox.x - CANVAS_CONNECTION_HANDLE_OUTSET;
      const centerY = ownerBox.y + ownerBox.height / 2;
      if (
        options.affectedItemIds
        && !options.affectedItemIds.has(owner.id)
        && !affectedBoxes?.some(box => (
          centerX >= box.x
          && centerX <= box.x + box.width
          && centerY >= box.y
          && centerY <= box.y + box.height
        ))
      ) return;
      const isCovered = items.some((candidate) => {
        if (candidate.id === owner.id || !isAbove(candidate, owner)) return false;
        const candidateBox = liveBoxes.get(candidate.id);
        if (!candidateBox) return false;
        return centerX >= candidateBox.x
          && centerX <= candidateBox.x + candidateBox.width
          && centerY >= candidateBox.y
          && centerY <= candidateBox.y + candidateBox.height;
      });
      handle.style.visibility = isCovered ? 'hidden' : '';
    });

};

export const setCanvasItemDraggingFlagImpl = (ctx: Pick<canvasPersistenceActionContext, 'canvasContentRef' | 'getCanvasItemElement'>, ids: string[], active: boolean) => {
  const { canvasContentRef, getCanvasItemElement } = ctx;
    const content = canvasContentRef.current;
    ids.forEach((id) => {
      const element = getCanvasItemElement(id);
      if (element) {
        if (active) element.setAttribute('data-canvas-dragging', 'true');
        else element.removeAttribute('data-canvas-dragging');
      }
      if (!content) return;
      const selectorId = typeof CSS !== 'undefined' && CSS.escape
        ? CSS.escape(id)
        : id.replace(/["\\]/g, '\\$&');
      content.querySelectorAll<HTMLElement>(`[data-canvas-connection-handle-id="${selectorId}"]`)
        .forEach((handle) => { handle.style.visibility = active ? 'hidden' : ''; });
    });

};

export const clearCanvasItemInteractionStylesImpl = (ctx: Pick<canvasPersistenceActionContext, 'canvasItemsRef' | 'canvasPendingSelectionDomIdsRef' | 'canvasSurfaceRef' | 'getCanvasItemElement' | 'refreshCanvasConnectionHandleOcclusion' | 'resetCanvasDragChrome'>, ids: string[], refreshOcclusion: boolean = true) => {
  const { canvasItemsRef, canvasPendingSelectionDomIdsRef, canvasSurfaceRef, getCanvasItemElement, refreshCanvasConnectionHandleOcclusion, resetCanvasDragChrome } = ctx;
    canvasSurfaceRef.current?.removeAttribute('data-canvas-node-moving');
    if (canvasPendingSelectionDomIdsRef.current.size === 0) {
      canvasSurfaceRef.current?.removeAttribute('data-canvas-selection-pending');
    }
    ids.forEach((id) => {
      const element = getCanvasItemElement(id);
      if (!element) return;
      element.style.transform = '';
      element.removeAttribute('data-canvas-dragging');
      element.removeAttribute('data-canvas-resizing');
    });
    resetCanvasDragChrome();
    if (refreshOcclusion) {
      refreshCanvasConnectionHandleOcclusion({
        renderedItems: canvasItemsRef.current,
        affectedItemIds: new Set(ids),
      });
    }

};

export const restoreCanvasItemBoxStylesImpl = (ctx: Pick<canvasPersistenceActionContext, 'canvasItemsRef' | 'getCanvasItemElement'>, ids: string[]) => {
  const { canvasItemsRef, getCanvasItemElement } = ctx;
    ids.forEach((id) => {
      const element = getCanvasItemElement(id);
      const item = canvasItemsRef.current.find(canvasItem => canvasItem.id === id);
      if (!element || !item) return;
      element.style.left = `${item.x}px`;
      element.style.top = `${item.y}px`;
      element.style.width = `${item.width}px`;
      element.style.height = `${item.height}px`;
    });

};

export const cancelCanvasItemDragVisualsImpl = (ctx: Pick<canvasPersistenceActionContext, 'cancelCanvasInteractionPaint' | 'canvasDragDebugRef' | 'canvasDragRef' | 'canvasGroupResizeRef' | 'canvasPointerInteractionCleanupRef' | 'canvasResizeRef' | 'clearCanvasItemInteractionStyles' | 'restoreCanvasItemBoxStyles'>) => {
  const { cancelCanvasInteractionPaint, canvasDragDebugRef, canvasDragRef, canvasGroupResizeRef, canvasPointerInteractionCleanupRef, canvasResizeRef, clearCanvasItemInteractionStyles, restoreCanvasItemBoxStyles } = ctx;
    canvasPointerInteractionCleanupRef.current?.();
    canvasPointerInteractionCleanupRef.current = null;
    const drag = canvasDragRef.current;
    const resize = canvasResizeRef.current;
    const groupResize = canvasGroupResizeRef.current;
    canvasDragRef.current = null;
    canvasResizeRef.current = null;
    canvasGroupResizeRef.current = null;
    canvasDragDebugRef.current = null;
    cancelCanvasInteractionPaint();
    if (drag) clearCanvasItemInteractionStyles(drag.ids);
    if (resize) {
      clearCanvasItemInteractionStyles([resize.id]);
      restoreCanvasItemBoxStyles([resize.id]);
    }
    if (groupResize) {
      const ids = Object.keys(groupResize.startItems);
      clearCanvasItemInteractionStyles(ids);
      restoreCanvasItemBoxStyles(ids);
    }

};

export const hideCanvasSelectionOverlayImpl = (ctx: Pick<canvasPersistenceActionContext, 'canvasSelectionOverlayRef'>) => {
  const { canvasSelectionOverlayRef } = ctx;
    const overlay = canvasSelectionOverlayRef.current;
    if (!overlay) return;
    overlay.style.display = 'none';
    overlay.style.transform = '';
    overlay.style.left = '0px';
    overlay.style.top = '0px';
    overlay.style.width = '0px';
    overlay.style.height = '0px';

};

export const flushCanvasInteractionFrameImpl = (ctx: Pick<canvasPersistenceActionContext, 'canvasInteractionFrameRef' | 'canvasInteractionPayloadRef' | 'canvasSelectionOverlayRef' | 'getCanvasItemElement' | 'paintCanvasDragChrome'>) => {
  const { canvasInteractionFrameRef, canvasInteractionPayloadRef, canvasSelectionOverlayRef, getCanvasItemElement, paintCanvasDragChrome } = ctx;
    canvasInteractionFrameRef.current = null;
    const payload = canvasInteractionPayloadRef.current;
    if (!payload) return;

    if (payload.kind === 'move') {
      payload.ids.forEach((id) => {
        const element = getCanvasItemElement(id);
        if (!element) return;
        element.style.transform = `translate3d(${payload.dx}px, ${payload.dy}px, 0)`;
      });
      paintCanvasDragChrome(payload.ids, payload.dx, payload.dy);
      return;
    }

    if (payload.kind === 'resize') {
      Object.entries(payload.boxes).forEach(([id, box]) => {
        const element = getCanvasItemElement(id);
        if (!element) return;
        element.style.left = `${box.x}px`;
        element.style.top = `${box.y}px`;
        element.style.width = `${box.width}px`;
        element.style.height = `${box.height}px`;
      });
      return;
    }

    const overlay = canvasSelectionOverlayRef.current;
    if (!overlay) return;
    overlay.style.display = payload.rect.width < 4 && payload.rect.height < 4 ? 'none' : 'block';
    overlay.style.transform = `translate3d(${payload.rect.x}px, ${payload.rect.y}px, 0)`;
    overlay.style.width = `${payload.rect.width}px`;
    overlay.style.height = `${payload.rect.height}px`;

};

export const scheduleCanvasChangedNodesPatchSaveImpl = (ctx: Pick<canvasPersistenceActionContext, 'activeCanvasIdRef' | 'canvasItemsRef' | 'canvasPanRef' | 'canvasPatchSavePendingIdsRef' | 'canvasPatchSaveTimerRef' | 'canvasStateLoadedRef' | 'isCanvasInteractingRef' | 'isCanvasZoomingRef' | 'scheduleCanvasChangedNodesPatchSave'>, ids: string[]) => {
  const { activeCanvasIdRef, canvasItemsRef, canvasPanRef, canvasPatchSavePendingIdsRef, canvasPatchSaveTimerRef, canvasStateLoadedRef, isCanvasInteractingRef, isCanvasZoomingRef, scheduleCanvasChangedNodesPatchSave } = ctx;
    if (!canvasStateLoadedRef.current) return;
    ids.filter(Boolean).forEach(id => canvasPatchSavePendingIdsRef.current.add(id));
    if (canvasPatchSavePendingIdsRef.current.size === 0) return;
    if (isCanvasInteractingRef.current || isCanvasZoomingRef.current || canvasPanRef.current) return;
    if (canvasPatchSaveTimerRef.current !== null) {
      window.clearTimeout(canvasPatchSaveTimerRef.current);
    }
    canvasPatchSaveTimerRef.current = window.setTimeout(() => {
      canvasPatchSaveTimerRef.current = null;
      if (isCanvasInteractingRef.current || isCanvasZoomingRef.current || canvasPanRef.current) {
        scheduleCanvasChangedNodesPatchSave([]);
        return;
      }
      const pendingIds = Array.from(canvasPatchSavePendingIdsRef.current);
      canvasPatchSavePendingIdsRef.current.clear();
      const pendingSet = new Set(pendingIds);
      const changedNodes = canvasItemsRef.current
        .filter(item => pendingSet.has(item.id))
        .map(stripCanvasItemDataImageProvenance);
      if (changedNodes.length === 0) return;
      const targetCanvasId = activeCanvasIdRef.current || DEFAULT_CANVAS_ID;
      patchCanvasNodes(targetCanvasId, changedNodes)
        .catch((err) => {
          pendingIds.forEach(id => canvasPatchSavePendingIdsRef.current.add(id));
          console.warn('保存变更画布节点失败:', err);
        });
    }, 700);

};

export const saveCanvasStateNowImpl = (ctx: Pick<canvasPersistenceActionContext, 'activeCanvasIdRef' | 'buildCanvasPersistedState' | 'canvasLastSyncedNodesSignatureRef' | 'canvasPanRef' | 'canvasPersistSaveSyncNodesRef' | 'canvasStateLoadedRef' | 'canvasStateSaveDeferredDuringZoomRef' | 'getCanvasNodesPersistSignature' | 'isCanvasInteractingRef' | 'isCanvasZoomingRef'>, options: { syncNodes?: boolean } = {}) => {
  const { activeCanvasIdRef, buildCanvasPersistedState, canvasLastSyncedNodesSignatureRef, canvasPanRef, canvasPersistSaveSyncNodesRef, canvasStateLoadedRef, canvasStateSaveDeferredDuringZoomRef, getCanvasNodesPersistSignature, isCanvasInteractingRef, isCanvasZoomingRef } = ctx;
    if (!canvasStateLoadedRef.current) return;
    if (isCanvasInteractingRef.current || isCanvasZoomingRef.current || canvasPanRef.current) {
      canvasStateSaveDeferredDuringZoomRef.current = true;
      canvasPersistSaveSyncNodesRef.current = canvasPersistSaveSyncNodesRef.current || !!options.syncNodes;
      return;
    }
    const state = buildCanvasPersistedState();
    invoke('save_canvas_state', { state }).catch((err) => {
      console.warn('保存画布状态失败:', err);
    });
    if (!options.syncNodes) return;
    const nodesSignature = getCanvasNodesPersistSignature(state.items);
    if (canvasLastSyncedNodesSignatureRef.current === nodesSignature) return;
    const targetCanvasId = activeCanvasIdRef.current || DEFAULT_CANVAS_ID;
    updateCanvasNodes(targetCanvasId, state.items)
      .then(() => {
        canvasLastSyncedNodesSignatureRef.current = nodesSignature;
      })
      .catch((err) => {
        console.warn('同步画布节点到 SQLite 失败:', err);
      });

};

export const scheduleCanvasStateSaveImpl = (ctx: Pick<canvasPersistenceActionContext, 'CANVAS_STATE_SAVE_DEBOUNCE_MS' | 'canvasPanRef' | 'canvasPersistSaveSyncNodesRef' | 'canvasPersistSaveTimerRef' | 'canvasStateLoadedRef' | 'canvasStateSaveDeferredDuringZoomRef' | 'isCanvasInteractingRef' | 'isCanvasZoomingRef' | 'saveCanvasStateNow'>, options: { syncNodes?: boolean } = {}) => {
  const { CANVAS_STATE_SAVE_DEBOUNCE_MS, canvasPanRef, canvasPersistSaveSyncNodesRef, canvasPersistSaveTimerRef, canvasStateLoadedRef, canvasStateSaveDeferredDuringZoomRef, isCanvasInteractingRef, isCanvasZoomingRef, saveCanvasStateNow } = ctx;
    if (!canvasStateLoadedRef.current) return;
    if (isCanvasInteractingRef.current || isCanvasZoomingRef.current || canvasPanRef.current) {
      canvasStateSaveDeferredDuringZoomRef.current = true;
      canvasPersistSaveSyncNodesRef.current = canvasPersistSaveSyncNodesRef.current || !!options.syncNodes;
      return;
    }
    canvasPersistSaveSyncNodesRef.current = canvasPersistSaveSyncNodesRef.current || !!options.syncNodes;
    if (canvasPersistSaveTimerRef.current !== null) {
      window.clearTimeout(canvasPersistSaveTimerRef.current);
    }
    canvasPersistSaveTimerRef.current = window.setTimeout(() => {
      canvasPersistSaveTimerRef.current = null;
      if (isCanvasInteractingRef.current || isCanvasZoomingRef.current || canvasPanRef.current) {
        canvasStateSaveDeferredDuringZoomRef.current = true;
        return;
      }
      const shouldSyncNodes = canvasPersistSaveSyncNodesRef.current;
      canvasPersistSaveSyncNodesRef.current = false;
      saveCanvasStateNow({ syncNodes: shouldSyncNodes });
    }, CANVAS_STATE_SAVE_DEBOUNCE_MS);

};

export const refreshCanvasesImpl = async (ctx: Pick<canvasPersistenceActionContext, 'activeCanvasIdRef' | 'isSwitchingCanvasRef' | 'setActiveCanvasId' | 'setCanvasTrashCount' | 'setCanvases' | 'sortCanvasesNewestFirst'>) => {
  const { activeCanvasIdRef, isSwitchingCanvasRef, setActiveCanvasId, setCanvasTrashCount, setCanvases, sortCanvasesNewestFirst } = ctx;
    const [canvasList, trashCount] = await Promise.all([
      listCanvases(DEFAULT_PROJECT_ID, DEFAULT_LIBRARY_ID),
      getCanvasTrashCount(DEFAULT_PROJECT_ID, DEFAULT_LIBRARY_ID),
    ]);
    const sortedCanvasList = sortCanvasesNewestFirst(canvasList);
    setCanvases(sortedCanvasList);
    setCanvasTrashCount(trashCount);
    const active = sortedCanvasList.find(canvas => canvas.isActive) || sortedCanvasList[0];
    if (active && active.id !== activeCanvasIdRef.current && !isSwitchingCanvasRef.current) {
      activeCanvasIdRef.current = active.id;
      setActiveCanvasId(active.id);
    }
    return sortedCanvasList;

};

export const openCanvasTrashImpl = async (ctx: Pick<canvasPersistenceActionContext, 'refreshDeletedCanvases' | 'setCanvasActionMenuId' | 'setIsCanvasTrashOpen' | 'setIsLoadingCanvasTrash' | 'showToast'>) => {
  const { refreshDeletedCanvases, setCanvasActionMenuId, setIsCanvasTrashOpen, setIsLoadingCanvasTrash, showToast } = ctx;
    setCanvasActionMenuId(null);
    setIsCanvasTrashOpen(true);
    setIsLoadingCanvasTrash(true);
    try {
      await refreshDeletedCanvases();
    } catch (err) {
      console.warn('读取画布回收站失败:', err);
      showToast('读取回收站失败');
    } finally {
      setIsLoadingCanvasTrash(false);
    }

};

export const loadCanvasItemsImpl = async (ctx: Pick<canvasPersistenceActionContext, 'applyCanvasScaleStyles' | 'cancelCanvasImageSourceUpgradeQueue' | 'canvasImageSourceCacheRef' | 'canvasImageUpgradeFailedRef' | 'canvasItemsRef' | 'canvasLastSyncedNodesSignatureRef' | 'canvasPreviewSourceIdsRef' | 'canvasScaleRef' | 'canvasSelectionImageSourceFrameRef' | 'canvasSelectionImageSourceIdsRef' | 'canvasSessionItemsRef' | 'canvasSizeRef' | 'canvasViewportRef' | 'clearCanvasUndoStack' | 'getActiveCanvasRunNodeIds' | 'getCanvasNodesPersistSignature' | 'hideCanvasSelectionOverlay' | 'isCanvasModeRef' | 'pendingCanvasFusionRoleRef' | 'scheduleCanvasFocusNearestContentIfViewportEmpty' | 'setCanvasConnectionDraft' | 'setCanvasContextMenu' | 'setCanvasInputActionDraft' | 'setCanvasInputMenuForId' | 'setCanvasInputPickTargetId' | 'setCanvasItems' | 'setCanvasSize' | 'setCanvasViewport' | 'updateCanvasSelection' | 'waitForCanvasBackgroundPatches'>, canvasId: string, options: { knownEmpty?: boolean } = {}) => {
  const { applyCanvasScaleStyles, cancelCanvasImageSourceUpgradeQueue, canvasImageSourceCacheRef, canvasImageUpgradeFailedRef, canvasItemsRef, canvasLastSyncedNodesSignatureRef, canvasPreviewSourceIdsRef, canvasScaleRef, canvasSelectionImageSourceFrameRef, canvasSelectionImageSourceIdsRef, canvasSessionItemsRef, canvasSizeRef, canvasViewportRef, clearCanvasUndoStack, getActiveCanvasRunNodeIds, getCanvasNodesPersistSignature, hideCanvasSelectionOverlay, isCanvasModeRef, pendingCanvasFusionRoleRef, scheduleCanvasFocusNearestContentIfViewportEmpty, setCanvasConnectionDraft, setCanvasContextMenu, setCanvasInputActionDraft, setCanvasInputMenuForId, setCanvasInputPickTargetId, setCanvasItems, setCanvasSize, setCanvasViewport, updateCanvasSelection, waitForCanvasBackgroundPatches } = ctx;
    cancelCanvasImageSourceUpgradeQueue();
    if (canvasSelectionImageSourceFrameRef.current !== null) {
      window.cancelAnimationFrame(canvasSelectionImageSourceFrameRef.current);
      canvasSelectionImageSourceFrameRef.current = null;
    }
    canvasSelectionImageSourceIdsRef.current.clear();
    canvasImageSourceCacheRef.current.clear();
    canvasPreviewSourceIdsRef.current.clear();
    canvasImageUpgradeFailedRef.current.clear();
    await waitForCanvasBackgroundPatches(canvasId);
    const nodes = options.knownEmpty ? [] : await listCanvasNodes(canvasId);
    const activeRunNodeIds = getActiveCanvasRunNodeIds(canvasId);
    const sessionItems = canvasSessionItemsRef.current.get(canvasId) || [];
    const sessionItemsById = new Map(sessionItems.map(item => [item.id, item]));
    const mergedNodes = activeRunNodeIds?.size
      ? [
        ...nodes.map((node) => {
          const nodeId = String((node as Partial<CanvasImageItem>)?.id || '');
          return activeRunNodeIds.has(nodeId) ? sessionItemsById.get(nodeId) || node : node;
        }),
        ...sessionItems.filter(item => (
          activeRunNodeIds.has(item.id)
          && !nodes.some(node => String((node as Partial<CanvasImageItem>)?.id || '') === item.id)
        )),
      ]
      : nodes;
    const restored = sanitizeCanvasPersistedState(
      { items: mergedNodes },
      { activeRunNodeIds },
    );
    const fitSize = restored.items.reduce((size, item) => ({
      width: Math.max(size.width, Math.ceil((item.x + item.width + CANVAS_GROW_CHUNK * 0.35) / CANVAS_GROW_CHUNK) * CANVAS_GROW_CHUNK),
      height: Math.max(size.height, Math.ceil((item.y + item.height + CANVAS_GROW_CHUNK * 0.35) / CANVAS_GROW_CHUNK) * CANVAS_GROW_CHUNK),
    }), { width: CANVAS_BASE_WIDTH, height: CANVAS_BASE_HEIGHT });
    canvasItemsRef.current = restored.items;
    canvasSessionItemsRef.current.set(canvasId, restored.items);
    canvasLastSyncedNodesSignatureRef.current = getCanvasNodesPersistSignature(restored.items.map(stripCanvasItemDataImageProvenance));
    setCanvasItems(restored.items);
    canvasSizeRef.current = fitSize;
    setCanvasSize(fitSize);
    applyCanvasScaleStyles(canvasScaleRef.current || 1, fitSize);
    updateCanvasSelection([]);
    hideCanvasSelectionOverlay();
    setCanvasContextMenu(null);
    setCanvasInputMenuForId(null);
    setCanvasInputPickTargetId(null);
    pendingCanvasFusionRoleRef.current = null;
    setCanvasConnectionDraft(null);
    setCanvasInputActionDraft(null);
    clearCanvasUndoStack();
    canvasViewportRef.current = null;
    setCanvasViewport(null);
    if (isCanvasModeRef.current && restored.items.length > 0) {
      scheduleCanvasFocusNearestContentIfViewportEmpty(canvasId);
    }
    return restored.items;

};

export const saveCurrentCanvasBeforeSwitchImpl = async (ctx: Pick<canvasPersistenceActionContext, 'activeCanvasIdRef' | 'buildCanvasPersistedState' | 'canvasInteractionChangedNodeIdsRef' | 'canvasLastSyncedNodesSignatureRef' | 'canvasPatchSavePendingIdsRef' | 'canvasPatchSaveTimerRef' | 'canvasPersistSaveTimerRef' | 'canvasSessionItemsRef' | 'enqueueCanvasBackgroundWrite' | 'getCanvasNodesPersistSignature' | 'waitForCanvasBackgroundPatches'>) => {
  const { activeCanvasIdRef, buildCanvasPersistedState, canvasInteractionChangedNodeIdsRef, canvasLastSyncedNodesSignatureRef, canvasPatchSavePendingIdsRef, canvasPatchSaveTimerRef, canvasPersistSaveTimerRef, canvasSessionItemsRef, enqueueCanvasBackgroundWrite, getCanvasNodesPersistSignature, waitForCanvasBackgroundPatches } = ctx;
    if (canvasPersistSaveTimerRef.current !== null) {
      window.clearTimeout(canvasPersistSaveTimerRef.current);
      canvasPersistSaveTimerRef.current = null;
    }
    // A node patch is intentionally delayed while the user is interacting. If it
    // survives a canvas switch it would read the new canvas refs when the timer
    // fires and can write old pending changes into the newly active canvas.
    // The full snapshot below already contains those changes, so discard the
    // delayed patch before changing activeCanvasIdRef.
    if (canvasPatchSaveTimerRef.current !== null) {
      window.clearTimeout(canvasPatchSaveTimerRef.current);
      canvasPatchSaveTimerRef.current = null;
    }
    canvasPatchSavePendingIdsRef.current.clear();
    canvasInteractionChangedNodeIdsRef.current.clear();
    const state = buildCanvasPersistedState();
    const currentCanvasId = activeCanvasIdRef.current || DEFAULT_CANVAS_ID;
    const nodesSignature = getCanvasNodesPersistSignature(state.items);
    if (nodesSignature === canvasLastSyncedNodesSignatureRef.current) {
      invoke('save_canvas_state', { state }).catch(() => {});
      await waitForCanvasBackgroundPatches(currentCanvasId);
      return;
    }
    let latestItems = state.items;
    await enqueueCanvasBackgroundWrite(currentCanvasId, async () => {
      latestItems = (canvasSessionItemsRef.current.get(currentCanvasId) || state.items)
        .map(stripCanvasItemDataImageProvenance);
      await updateCanvasNodes(currentCanvasId, latestItems);
    });
    const latestSignature = getCanvasNodesPersistSignature(latestItems);
    canvasLastSyncedNodesSignatureRef.current = latestSignature;
    invoke('save_canvas_state', { state: { ...state, items: latestItems } }).catch(() => {});

};

export const switchToCanvasImpl = async (ctx: Pick<canvasPersistenceActionContext, 'activeCanvasIdRef' | 'enterCanvasMode' | 'isCanvasModeRef' | 'isSwitchingCanvasRef' | 'loadCanvasItems' | 'saveCurrentCanvasBeforeSwitch' | 'setActiveCanvasId' | 'setCanvasActionMenuId' | 'setCanvases' | 'setIsSwitchingCanvas' | 'showToast' | 'sortCanvasesNewestFirst'>, canvasId: string) => {
  const { activeCanvasIdRef, enterCanvasMode, isCanvasModeRef, isSwitchingCanvasRef, loadCanvasItems, saveCurrentCanvasBeforeSwitch, setActiveCanvasId, setCanvasActionMenuId, setCanvases, setIsSwitchingCanvas, showToast, sortCanvasesNewestFirst } = ctx;
    if (!canvasId || canvasId === activeCanvasIdRef.current || isSwitchingCanvasRef.current) return;
    const previousCanvasId = activeCanvasIdRef.current;
    isSwitchingCanvasRef.current = true;
    setIsSwitchingCanvas(true);
    setCanvasActionMenuId(null);
    try {
      await saveCurrentCanvasBeforeSwitch();
      const active = await setActiveCanvas(canvasId, DEFAULT_PROJECT_ID, DEFAULT_LIBRARY_ID);
      activeCanvasIdRef.current = active.id;
      setActiveCanvasId(active.id);
      await loadCanvasItems(active.id);
      setCanvases(prev => {
        const next = prev.map(item => (
          item.id === active.id
            ? { ...item, ...active, isActive: true }
            : item.isActive ? { ...item, isActive: false } : item
        ));
        return sortCanvasesNewestFirst(
          next.some(item => item.id === active.id) ? next : [...next, active]
        );
      });
      if (!isCanvasModeRef.current) enterCanvasMode();
      showToast(`已切换到「${active.name || '画布'}」`);
    } catch (err) {
      activeCanvasIdRef.current = previousCanvasId;
      setActiveCanvasId(previousCanvasId);
      console.warn('切换画布失败:', err);
      showToast('切换画布失败，原画布内容已保留');
    } finally {
      isSwitchingCanvasRef.current = false;
      setIsSwitchingCanvas(false);
    }

};

export const createNewCanvasPageImpl = async (ctx: Pick<canvasPersistenceActionContext, 'activeCanvasIdRef' | 'canvases' | 'enterCanvasMode' | 'isCanvasModeRef' | 'isSwitchingCanvasRef' | 'loadCanvasItems' | 'openTextInputDialog' | 'saveCurrentCanvasBeforeSwitch' | 'setActiveCanvasId' | 'setCanvasActionMenuId' | 'setCanvases' | 'setIsSwitchingCanvas' | 'showToast' | 'sortCanvasesNewestFirst'>) => {
  const { activeCanvasIdRef, canvases, enterCanvasMode, isCanvasModeRef, isSwitchingCanvasRef, loadCanvasItems, openTextInputDialog, saveCurrentCanvasBeforeSwitch, setActiveCanvasId, setCanvasActionMenuId, setCanvases, setIsSwitchingCanvas, showToast, sortCanvasesNewestFirst } = ctx;
    const name = await openTextInputDialog({
      title: '新建画布',
      description: '为新的画布起一个容易辨认的名字。',
      defaultValue: `画布 ${canvases.length + 1}`,
      placeholder: '输入画布名称',
      confirmLabel: '创建画布',
      icon: 'canvas',
    });
    if (!name?.trim()) return;
    const previousCanvasId = activeCanvasIdRef.current;
    isSwitchingCanvasRef.current = true;
    setIsSwitchingCanvas(true);
    setCanvasActionMenuId(null);
    try {
      await saveCurrentCanvasBeforeSwitch();
      const canvas = await createCanvas(name.trim(), DEFAULT_PROJECT_ID, DEFAULT_LIBRARY_ID);
      const active = await setActiveCanvas(canvas.id, DEFAULT_PROJECT_ID, DEFAULT_LIBRARY_ID);
      const nextCanvas = { ...canvas, ...active, isActive: true };
      setCanvases(prev => sortCanvasesNewestFirst([
        ...prev.map(item => item.isActive ? { ...item, isActive: false } : item),
        nextCanvas,
      ]));
      activeCanvasIdRef.current = nextCanvas.id;
      setActiveCanvasId(nextCanvas.id);
      await loadCanvasItems(nextCanvas.id, { knownEmpty: true });
      if (!isCanvasModeRef.current) enterCanvasMode();
      showToast(`已新建画布「${nextCanvas.name || name.trim()}」`);
    } catch (err) {
      activeCanvasIdRef.current = previousCanvasId;
      setActiveCanvasId(previousCanvasId);
      console.warn('新建画布失败:', err);
      showToast('新建画布失败');
    } finally {
      isSwitchingCanvasRef.current = false;
      setIsSwitchingCanvas(false);
    }

};

export const renameCanvasPageImpl = async (ctx: Pick<canvasPersistenceActionContext, 'openTextInputDialog' | 'setCanvases' | 'showToast'>, canvas: CanvasRecord) => {
  const { openTextInputDialog, setCanvases, showToast } = ctx;
    const name = await openTextInputDialog({
      title: '重命名画布',
      description: '修改后会同步到画布列表和切换菜单。',
      defaultValue: canvas.name || '画布',
      placeholder: '输入画布名称',
      confirmLabel: '保存名称',
      icon: 'rename',
    });
    if (!name?.trim() || name.trim() === canvas.name) return;
    try {
      const next = await renameCanvas(canvas.id, name.trim());
      setCanvases(prev => prev.map(item => item.id === canvas.id && next ? next : item));
      showToast('画布已重命名');
    } catch (err) {
      console.warn('重命名画布失败:', err);
      showToast('重命名画布失败');
    }

};

export const duplicateCanvasPageImpl = async (ctx: Pick<canvasPersistenceActionContext, 'openTextInputDialog' | 'refreshCanvases' | 'saveCurrentCanvasBeforeSwitch' | 'showToast'>, canvas: CanvasRecord) => {
  const { openTextInputDialog, refreshCanvases, saveCurrentCanvasBeforeSwitch, showToast } = ctx;
    const name = await openTextInputDialog({
      title: '复制画布',
      description: '复制当前画布内容，并保存为新的画布。',
      defaultValue: `${canvas.name || '画布'} 副本`,
      placeholder: '输入副本名称',
      confirmLabel: '复制画布',
      icon: 'copy',
    });
    if (!name?.trim()) return;
    try {
      await saveCurrentCanvasBeforeSwitch();
      const copied = await duplicateCanvas(canvas.id, name.trim());
      await refreshCanvases();
      showToast(`已复制画布「${copied.name || name.trim()}」`);
    } catch (err) {
      console.warn('复制画布失败:', err);
      showToast('复制画布失败');
    }

};

export const saveCurrentCanvasAsSnapshotImpl = async (ctx: Pick<canvasPersistenceActionContext, 'openTextInputDialog' | 'refreshCanvases' | 'saveCurrentCanvasBeforeSwitch' | 'showToast' | 'switchToCanvas'>, canvas: CanvasRecord, switchAfterSave: boolean = false) => {
  const { openTextInputDialog, refreshCanvases, saveCurrentCanvasBeforeSwitch, showToast, switchToCanvas } = ctx;
    const defaultName = `快照 ${new Date().toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).replace(/\//g, '-').replace(/\s+/g, ' ')}`;
    const name = await openTextInputDialog({
      title: '保存快照',
      description: '快照会保留当前画布状态，之后可从画布列表恢复。',
      defaultValue: defaultName,
      placeholder: '输入快照名称',
      confirmLabel: '保存快照',
      icon: 'snapshot',
    });
    if (!name?.trim()) return;
    try {
      await saveCurrentCanvasBeforeSwitch();
      const snapshot = await saveCanvasSnapshot(canvas.id, name.trim());
      await refreshCanvases();
      showToast(`已保存快照「${snapshot.name || name.trim()}」`);
      if (switchAfterSave) await switchToCanvas(snapshot.id);
    } catch (err) {
      console.warn('保存画布快照失败:', err);
      showToast('保存画布快照失败');
    }

};

export const moveCanvasPageToTrashImpl = async (ctx: Pick<canvasPersistenceActionContext, 'activeCanvasIdRef' | 'isCanvasTrashOpen' | 'loadCanvasItems' | 'refreshCanvases' | 'refreshDeletedCanvases' | 'saveCurrentCanvasBeforeSwitch' | 'setActiveCanvasId'>, canvas: CanvasRecord) => {
  const { activeCanvasIdRef, isCanvasTrashOpen, loadCanvasItems, refreshCanvases, refreshDeletedCanvases, saveCurrentCanvasBeforeSwitch, setActiveCanvasId } = ctx;
    if (canvas.id === activeCanvasIdRef.current) {
      await saveCurrentCanvasBeforeSwitch();
    }
    const result = await softDeleteCanvas(canvas.id);
    const canvasList = await refreshCanvases();
    const nextCanvasId = result.activeCanvasId || canvasList.find(item => item.isActive)?.id || canvasList[0]?.id || DEFAULT_CANVAS_ID;
    if (canvas.id === activeCanvasIdRef.current || nextCanvasId !== activeCanvasIdRef.current) {
      activeCanvasIdRef.current = nextCanvasId;
      setActiveCanvasId(nextCanvasId);
      await loadCanvasItems(nextCanvasId);
    }
    if (isCanvasTrashOpen) {
      await refreshDeletedCanvases();
    }

};

export const saveCanvasPageElementsToDrawerImpl = async (ctx: Pick<canvasPersistenceActionContext, 'activeCanvasIdRef' | 'canvasItemsRef' | 'copyCanvasItemsToDrawerFolder' | 'getActiveCanvasRunNodeIds' | 'saveCurrentCanvasBeforeSwitch' | 'waitForCanvasBackgroundPatches'>, canvas: CanvasRecord) => {
  const { activeCanvasIdRef, canvasItemsRef, copyCanvasItemsToDrawerFolder, getActiveCanvasRunNodeIds, saveCurrentCanvasBeforeSwitch, waitForCanvasBackgroundPatches } = ctx;
    if (canvas.id === activeCanvasIdRef.current) {
      await saveCurrentCanvasBeforeSwitch();
      return copyCanvasItemsToDrawerFolder(canvasItemsRef.current, canvas);
    }
    await waitForCanvasBackgroundPatches(canvas.id);
    const nodes = await listCanvasNodes(canvas.id);
    const restored = sanitizeCanvasPersistedState(
      { items: nodes },
      { activeRunNodeIds: getActiveCanvasRunNodeIds(canvas.id) },
    );
    return copyCanvasItemsToDrawerFolder(restored.items, canvas);

};

export const confirmSoftDeleteCanvasPageImpl = (ctx: Pick<canvasPersistenceActionContext, 'activeCanvasIdRef' | 'canvasItemsRef' | 'closeConfirmDialog' | 'moveCanvasPageToTrash' | 'saveCanvasPageElementsToDrawer' | 'setCanvasActionMenuId' | 'setConfirmDialog' | 'showToast'>, canvas: CanvasRecord) => {
  const { activeCanvasIdRef, canvasItemsRef, closeConfirmDialog, moveCanvasPageToTrash, saveCanvasPageElementsToDrawer, setCanvasActionMenuId, setConfirmDialog, showToast } = ctx;
    setCanvasActionMenuId(null);
    const knownItemCount = canvas.id === activeCanvasIdRef.current ? canvasItemsRef.current.length : null;
    const itemCountPrefix = typeof knownItemCount === 'number'
      ? `当前画布有 ${knownItemCount} 个元素。`
      : '';
    setConfirmDialog({
      isOpen: true,
      title: '删除画布',
      message: `${itemCountPrefix}删除「${canvas.name || '画布'}」前，可以先把这个画布里的元素复制到抽屉；也可以不保存，直接移到回收站。`,
      onConfirm: () => {},
      actions: [
        {
          label: '不保存，删除',
          className: 'rounded-[16px] bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 transition-colors hover:bg-red-100 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/45',
          onClick: async () => {
            closeConfirmDialog();
            try {
              await moveCanvasPageToTrash(canvas);
              showToast('画布已移到回收站');
            } catch (err) {
              console.warn('删除画布失败:', err);
              showToast('删除画布失败');
            }
          },
        },
        {
          label: '保存元素并删除',
          className: 'rounded-[16px] bg-blue-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-blue-600',
          onClick: async () => {
            closeConfirmDialog();
            let savedResult: { savedCount: number; folderName: string } | null = null;
            try {
              savedResult = await saveCanvasPageElementsToDrawer(canvas);
              await moveCanvasPageToTrash(canvas);
              if (savedResult.savedCount > 0) {
                showToast(`已保存 ${savedResult.savedCount} 个元素到「${savedResult.folderName}」，画布已移到回收站`);
              } else {
                showToast('该画布没有可保存的元素，已移到回收站');
              }
            } catch (err) {
              console.warn('保存并删除画布失败:', err);
              showToast(savedResult ? '画布元素已保存，但删除失败' : '保存画布元素失败，已取消删除');
            }
          },
        },
      ],
    });

};

export const restoreDeletedCanvasPageImpl = async (ctx: Pick<canvasPersistenceActionContext, 'refreshCanvases' | 'refreshDeletedCanvases' | 'showToast'>, canvas: CanvasRecord) => {
  const { refreshCanvases, refreshDeletedCanvases, showToast } = ctx;
    try {
      const restored = await restoreCanvas(canvas.id);
      await Promise.all([
        refreshCanvases(),
        refreshDeletedCanvases(),
      ]);
      showToast(`已恢复「${restored?.name || canvas.name || '画布'}」`);
    } catch (err) {
      console.warn('恢复画布失败:', err);
      showToast('恢复画布失败');
    }

};

export const confirmPermanentlyDeleteCanvasPageImpl = (ctx: Pick<canvasPersistenceActionContext, 'closeConfirmDialog' | 'refreshDeletedCanvases' | 'setConfirmDialog' | 'showToast'>, canvas: CanvasRecord) => {
  const { closeConfirmDialog, refreshDeletedCanvases, setConfirmDialog, showToast } = ctx;
    setConfirmDialog({
      isOpen: true,
      title: '永久删除画布',
      message: '永久删除后无法恢复，但不会删除素材文件。确定继续吗？',
      onConfirm: async () => {
        closeConfirmDialog();
        try {
          await permanentlyDeleteCanvas(canvas.id);
          await refreshDeletedCanvases();
          showToast('画布已永久删除');
        } catch (err) {
          console.warn('永久删除画布失败:', err);
          showToast('永久删除失败');
        }
      },
    });

};

export const beginCanvasZoomInteractionImpl = (ctx: Pick<canvasPersistenceActionContext, 'cancelCanvasImageSourceUpgradeQueue' | 'canvasContentRef' | 'canvasSurfaceRef' | 'canvasViewportDeferredDuringZoomRef' | 'canvasViewportFrameRef' | 'downgradeCanvasPreviewSources' | 'isCanvasZoomingRef'>) => {
  const { cancelCanvasImageSourceUpgradeQueue, canvasContentRef, canvasSurfaceRef, canvasViewportDeferredDuringZoomRef, canvasViewportFrameRef, downgradeCanvasPreviewSources, isCanvasZoomingRef } = ctx;
    if (isCanvasZoomingRef.current) return;
    cancelCanvasImageSourceUpgradeQueue();
    downgradeCanvasPreviewSources();
    isCanvasZoomingRef.current = true;
    canvasSurfaceRef.current?.setAttribute('data-canvas-zooming', 'true');
    if (canvasContentRef.current) canvasContentRef.current.style.willChange = 'transform';
    if (canvasViewportFrameRef.current !== null) {
      window.cancelAnimationFrame(canvasViewportFrameRef.current);
      canvasViewportFrameRef.current = null;
      canvasViewportDeferredDuringZoomRef.current = true;
    }

};

export const scheduleCanvasScaleRenderSyncImpl = (ctx: Pick<canvasPersistenceActionContext, 'canvasScaleRef' | 'canvasScaleRenderFrameRef' | 'setCanvasScale'>) => {
  const { canvasScaleRef, canvasScaleRenderFrameRef, setCanvasScale } = ctx;
    if (canvasScaleRenderFrameRef.current !== null) return;
    canvasScaleRenderFrameRef.current = window.requestAnimationFrame(() => {
      canvasScaleRenderFrameRef.current = null;
      const nextScale = canvasScaleRef.current || 1;
      startTransition(() => {
        setCanvasScale(current => (Math.abs(current - nextScale) < 0.001 ? current : nextScale));
      });
    });

};

export const finishCanvasZoomInteractionImpl = (ctx: Pick<canvasPersistenceActionContext, 'applyCanvasScaleStyles' | 'canvasContentRef' | 'canvasPersistSaveSyncNodesRef' | 'canvasScaleRef' | 'canvasScrollLockRef' | 'canvasSizeCommitDeferredRef' | 'canvasSizeRef' | 'canvasStateSaveDeferredDuringZoomRef' | 'canvasSurfaceRef' | 'canvasViewportDeferredDuringZoomRef' | 'canvasVisualViewportRef' | 'canvasZoomSettleTimerRef' | 'isCanvasZoomingRef' | 'scheduleCanvasScaleRenderSync' | 'scheduleCanvasStateSave' | 'scheduleCanvasViewportUpdate' | 'scheduleCanvasVisibleImageSourceUpgrades' | 'setCanvasSize' | 'writeCanvasSurfaceScroll'>) => {
  const { applyCanvasScaleStyles, canvasContentRef, canvasPersistSaveSyncNodesRef, canvasScaleRef, canvasScrollLockRef, canvasSizeCommitDeferredRef, canvasSizeRef, canvasStateSaveDeferredDuringZoomRef, canvasSurfaceRef, canvasViewportDeferredDuringZoomRef, canvasVisualViewportRef, canvasZoomSettleTimerRef, isCanvasZoomingRef, scheduleCanvasScaleRenderSync, scheduleCanvasStateSave, scheduleCanvasViewportUpdate, scheduleCanvasVisibleImageSourceUpgrades, setCanvasSize, writeCanvasSurfaceScroll } = ctx;
    canvasZoomSettleTimerRef.current = null;
    if (!isCanvasZoomingRef.current) return;
    isCanvasZoomingRef.current = false;
    canvasSurfaceRef.current?.removeAttribute('data-canvas-zooming');
    if (canvasContentRef.current) canvasContentRef.current.style.willChange = '';
    const visualViewport = canvasVisualViewportRef.current;
    canvasVisualViewportRef.current = null;
    scheduleCanvasScaleRenderSync();
    applyCanvasScaleStyles(canvasScaleRef.current || 1, canvasSizeRef.current, { updateViewport: false });
    if (visualViewport && canvasSurfaceRef.current) {
      const scale = canvasScaleRef.current || 1;
      writeCanvasSurfaceScroll(
        canvasSurfaceRef.current,
        visualViewport.x * scale,
        visualViewport.y * scale,
        false
      );
      canvasScrollLockRef.current = {
        left: canvasSurfaceRef.current.scrollLeft,
        top: canvasSurfaceRef.current.scrollTop,
      };
    }
    if (canvasSizeCommitDeferredRef.current) {
      canvasSizeCommitDeferredRef.current = false;
      setCanvasSize(canvasSizeRef.current);
    }
    if (canvasViewportDeferredDuringZoomRef.current) {
      canvasViewportDeferredDuringZoomRef.current = false;
    }
    scheduleCanvasViewportUpdate();
    scheduleCanvasVisibleImageSourceUpgrades();
    if (canvasStateSaveDeferredDuringZoomRef.current) {
      canvasStateSaveDeferredDuringZoomRef.current = false;
      scheduleCanvasStateSave({ syncNodes: canvasPersistSaveSyncNodesRef.current });
    } else {
      scheduleCanvasStateSave();
    }

};

export const settleCanvasZoomBeforePointerInteractionImpl = (ctx: Pick<canvasPersistenceActionContext, 'canvasScaleCommitTimerRef' | 'canvasZoomSettleTimerRef' | 'finishCanvasZoomInteraction' | 'isCanvasZoomingRef'>) => {
  const { canvasScaleCommitTimerRef, canvasZoomSettleTimerRef, finishCanvasZoomInteraction, isCanvasZoomingRef } = ctx;
    if (canvasScaleCommitTimerRef.current !== null) {
      window.clearTimeout(canvasScaleCommitTimerRef.current);
      canvasScaleCommitTimerRef.current = null;
    }
    if (canvasZoomSettleTimerRef.current !== null) {
      window.clearTimeout(canvasZoomSettleTimerRef.current);
      canvasZoomSettleTimerRef.current = null;
    }
    if (isCanvasZoomingRef.current) finishCanvasZoomInteraction();

};

export const commitCanvasScaleSoonImpl = (ctx: Pick<canvasPersistenceActionContext, 'beginCanvasZoomInteraction' | 'canvasScaleCommitTimerRef' | 'canvasZoomSettleTimerRef' | 'finishCanvasZoomInteraction'>) => {
  const { beginCanvasZoomInteraction, canvasScaleCommitTimerRef, canvasZoomSettleTimerRef, finishCanvasZoomInteraction } = ctx;
    beginCanvasZoomInteraction();
    if (canvasScaleCommitTimerRef.current !== null) {
      window.clearTimeout(canvasScaleCommitTimerRef.current);
    }
    if (canvasZoomSettleTimerRef.current !== null) {
      window.clearTimeout(canvasZoomSettleTimerRef.current);
    }

    canvasScaleCommitTimerRef.current = window.setTimeout(() => {
      canvasScaleCommitTimerRef.current = null;
      canvasZoomSettleTimerRef.current = null;
      finishCanvasZoomInteraction();
    }, 220);
    canvasZoomSettleTimerRef.current = canvasScaleCommitTimerRef.current;

};

export const setCanvasSizeImmediateImpl = (ctx: Pick<canvasPersistenceActionContext, 'applyCanvasScaleStyles' | 'canvasPanRef' | 'canvasScaleRef' | 'canvasSizeCommitDeferredRef' | 'canvasSizeRef' | 'isCanvasInteractingRef' | 'isCanvasZoomingRef' | 'setCanvasSize'>, nextSize: { width: number; height: number }) => {
  const { applyCanvasScaleStyles, canvasPanRef, canvasScaleRef, canvasSizeCommitDeferredRef, canvasSizeRef, isCanvasInteractingRef, isCanvasZoomingRef, setCanvasSize } = ctx;
    const current = canvasSizeRef.current;
    if (current.width === nextSize.width && current.height === nextSize.height) return;
    canvasSizeRef.current = nextSize;
    applyCanvasScaleStyles(canvasScaleRef.current || 1, nextSize, { updateViewport: !isCanvasZoomingRef.current && !isCanvasInteractingRef.current && !canvasPanRef.current });
    if (isCanvasZoomingRef.current || isCanvasInteractingRef.current || canvasPanRef.current) {
      canvasSizeCommitDeferredRef.current = true;
      return;
    }
    setCanvasSize(nextSize);

};

export const takeCanvasUndoSnapshotImpl = (ctx: Pick<canvasPersistenceActionContext, 'canvasItemsRef' | 'canvasReturnScrollRef' | 'canvasScrollLockRef' | 'canvasSelectedIdsRef' | 'canvasSizeRef' | 'canvasSurfaceRef'>, label: string, options: { layoutOnly?: boolean; shareImmutableItems?: boolean } = {}): CanvasUndoSnapshot => {
  const { canvasItemsRef, canvasReturnScrollRef, canvasScrollLockRef, canvasSelectedIdsRef, canvasSizeRef, canvasSurfaceRef } = ctx;
    const surface = canvasSurfaceRef.current;
    const fallbackScroll = canvasScrollLockRef.current || canvasReturnScrollRef.current || { left: 0, top: 0 };
    return {
      items: options.layoutOnly
        ? canvasItemsRef.current.map(item => ({ ...item }))
        : options.shareImmutableItems
          ? canvasItemsRef.current.slice()
          : cloneDrawerValue(canvasItemsRef.current.map(stripCanvasItemDataImageProvenance)),
      selectedIds: cloneDrawerValue(canvasSelectedIdsRef.current),
      size: cloneDrawerValue(canvasSizeRef.current),
      scroll: {
        left: surface?.scrollLeft ?? fallbackScroll.left,
        top: surface?.scrollTop ?? fallbackScroll.top,
      },
      label,
      createdAt: Date.now(),
    };

};

export const pushCanvasUndoSnapshotImpl = (ctx: Pick<canvasPersistenceActionContext, 'CANVAS_UNDO_LIMIT' | 'canvasUndoRestoringRef' | 'canvasUndoStackRef' | 'isCanvasModeRef' | 'takeCanvasUndoSnapshot'>, label: string, options: { layoutOnly?: boolean; shareImmutableItems?: boolean } = {}) => {
  const { CANVAS_UNDO_LIMIT, canvasUndoRestoringRef, canvasUndoStackRef, isCanvasModeRef, takeCanvasUndoSnapshot } = ctx;
    if (canvasUndoRestoringRef.current || !isCanvasModeRef.current) return;
    canvasUndoStackRef.current = [
      ...canvasUndoStackRef.current,
      takeCanvasUndoSnapshot(label, options),
    ].slice(-CANVAS_UNDO_LIMIT);

};

export const restoreCanvasUndoSnapshotImpl = (ctx: Pick<canvasPersistenceActionContext, 'canvasReturnScrollRef' | 'canvasScaleRef' | 'canvasScrollLockRef' | 'canvasSurfaceRef' | 'canvasUndoRestoringRef' | 'clampCanvasSurfaceScroll' | 'hideCanvasSelectionOverlay' | 'isCanvasModeRef' | 'setCanvasSizeImmediate' | 'updateCanvasItemsImmediate' | 'updateCanvasSelection' | 'writeCanvasSurfaceScroll'>, snapshot: CanvasUndoSnapshot) => {
  const { canvasReturnScrollRef, canvasScaleRef, canvasScrollLockRef, canvasSurfaceRef, canvasUndoRestoringRef, clampCanvasSurfaceScroll, hideCanvasSelectionOverlay, isCanvasModeRef, setCanvasSizeImmediate, updateCanvasItemsImmediate, updateCanvasSelection, writeCanvasSurfaceScroll } = ctx;
    canvasUndoRestoringRef.current = true;
    const surface = canvasSurfaceRef.current;
    const currentScroll = cloneDrawerValue(surface
      ? { left: surface.scrollLeft, top: surface.scrollTop }
      : canvasScrollLockRef.current || canvasReturnScrollRef.current || snapshot.scroll
    );
    setCanvasSizeImmediate(cloneDrawerValue(snapshot.size));
    updateCanvasItemsImmediate(() => cloneDrawerValue(snapshot.items));
    updateCanvasSelection(cloneDrawerValue(snapshot.selectedIds));
    hideCanvasSelectionOverlay();
    canvasScrollLockRef.current = currentScroll;
    window.requestAnimationFrame(() => {
      if (!isCanvasModeRef.current) return;
      const nextSurface = canvasSurfaceRef.current;
      if (!nextSurface) return;
      const clampedScroll = clampCanvasSurfaceScroll(
        nextSurface,
        currentScroll.left,
        currentScroll.top,
        canvasScaleRef.current || 1,
        snapshot.size
      );
      writeCanvasSurfaceScroll(nextSurface, clampedScroll.left, clampedScroll.top);
    });
    window.setTimeout(() => {
      canvasUndoRestoringRef.current = false;
    }, 0);

};

export const appendCanvasItemsImpl = (ctx: Pick<canvasPersistenceActionContext, 'canvasImageSourceCacheRef' | 'canvasItemsPatchCommitRef' | 'growCanvasToFit' | 'isCanvasModeRef' | 'pushCanvasUndoSnapshot' | 'scheduleCanvasChangedNodesPatchSave' | 'scheduleCanvasFocusItemById' | 'updateCanvasItemsDeferred' | 'updateCanvasSelection'>, nextItems: CanvasImageItem[], label: string, select: boolean = true) => {
  const { canvasImageSourceCacheRef, canvasItemsPatchCommitRef, growCanvasToFit, isCanvasModeRef, pushCanvasUndoSnapshot, scheduleCanvasChangedNodesPatchSave, scheduleCanvasFocusItemById, updateCanvasItemsDeferred, updateCanvasSelection } = ctx;
    if (!isCanvasModeRef.current) return 0;
    const clean = nextItems.filter(Boolean);
    if (clean.length === 0) return 0;
    pushCanvasUndoSnapshot(label, { shareImmutableItems: true });
    growCanvasToFit(
      Math.max(...clean.map(item => item.x + item.width)),
      Math.max(...clean.map(item => item.y + item.height))
    );
    clean.forEach(item => {
      if (item.item.type === 'image' && item.item.thumbnail) {
        canvasImageSourceCacheRef.current.set(item.id, {
          src: getCanvasInitialImageSource(item.item),
          quality: 'thumb',
        });
      }
    });
    canvasItemsPatchCommitRef.current = true;
    updateCanvasItemsDeferred(prev => [...prev, ...clean]);
    scheduleCanvasChangedNodesPatchSave(clean.map(item => item.id));
    if (select) {
      updateCanvasSelection(clean.map(item => item.id));
      scheduleCanvasFocusItemById(clean[0].id);
    }
    return clean.length;

};

export const getCanvasAiOutputCopyPositionImpl = (ctx: Pick<canvasPersistenceActionContext, 'canvasItemsRef' | 'canvasRectsIntersect'>, sourceItem: CanvasImageItem, size: { width: number; height: number }, outputIndex: number) => {
  const { canvasItemsRef, canvasRectsIntersect } = ctx;
    const gap = 64;
    const step = 44;
    let x = Math.max(24, sourceItem.x + sourceItem.width + gap);
    let y = Math.max(24, sourceItem.y + Math.min(outputIndex * step, 260));
    const items = canvasItemsRef.current;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const box = { x, y, width: size.width, height: size.height };
      const overlaps = items.some(item => item.id !== sourceItem.id && canvasRectsIntersect(box, item));
      if (!overlaps) return { x, y };
      y += step;
      if (attempt === 9) {
        x += step;
        y = Math.max(24, sourceItem.y + step);
      }
    }

    return { x, y };

};

export const copyCanvasAiOutputToCanvasImpl = async (ctx: Pick<canvasPersistenceActionContext, 'appendCanvasItems' | 'createAssetId' | 'getCanvasAiOutputCopyPosition' | 'makeCanvasNodeId' | 'showToast'>, sourceCanvasItem: CanvasImageItem, output: CanvasAiGeneratedOutput, outputIndex: number) => {
  const { appendCanvasItems, createAssetId, getCanvasAiOutputCopyPosition, makeCanvasNodeId, showToast } = ctx;
    const outputSource = getCanvasAiOutputDisplaySource(output);
    const outputMediaType = output.mediaType || getCanvasAiMediaType(sourceCanvasItem.ai);
    if (!outputSource || output.status === 'error') {
      showToast(outputMediaType === 'video' ? '这条视频还不能复制到画布' : '这张图还不能复制到画布');
      return false;
    }

    const outputItem = createCanvasAiOutputBufferItem(sourceCanvasItem, output, outputIndex);
    if (!outputItem) {
      showToast(outputMediaType === 'video' ? '这条视频还不能复制到画布' : '这张图还不能复制到画布');
      return false;
    }

    const size = output.width && output.height
      ? getCanvasInitialImageSize(output.width, output.height)
      : outputMediaType === 'image'
        ? await readImageDisplaySize(outputSource)
        : getCanvasAiOutputSize(sourceCanvasItem.ai?.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO);
    const pos = getCanvasAiOutputCopyPosition(sourceCanvasItem, size, outputIndex);
    const now = Date.now();
    const itemId = createAssetId();
    const canvasItem: CanvasImageItem = {
      id: makeCanvasNodeId(itemId, 'media'),
      item: {
        ...cloneDrawerValue(outputItem),
        id: itemId,
        type: outputMediaType,
        url: outputItem.url || outputSource,
        path: outputItem.path,
        createdAt: now,
        isQuickAccess: false,
      },
      x: pos.x,
      y: pos.y,
      width: size.width,
      height: size.height,
      ai: {
        type: outputMediaType === 'video' ? 'generated-video' : 'generated-image',
        prompt: output.prompt || sourceCanvasItem.ai?.prompt || sourceCanvasItem.item.content || '',
        status: 'success',
        generatedAt: output.generatedAt || sourceCanvasItem.ai?.generatedAt || now,
      },
    };

    const addedCount = appendCanvasItems(
      [canvasItem],
      outputMediaType === 'video' ? '复制输出视频到画布' : '复制输出图片到画布'
    );
    if (addedCount > 0) {
      showToast(outputMediaType === 'video' ? '已复制这条视频到画布' : '已复制这张图到画布');
    }
    return addedCount > 0;

};

export const updateThreeSceneSpecImpl = (ctx: Pick<canvasPersistenceActionContext, 'canvasItemsPatchCommitRef' | 'markCanvasNodesChanged' | 'scheduleCanvasChangedNodesPatchSave' | 'scheduleCanvasStateSave' | 'updateCanvasItemsImmediate'>, nodeId: string, sceneSpec: SceneSpecV1, options: {
      resetAnalysisCamera?: boolean;
      sourceImageIds?: string[];
      sourceImagePaths?: string[];
      sceneAnalysis?: SceneAnalysisV1;
    } = {}) => {
  const { canvasItemsPatchCommitRef, markCanvasNodesChanged, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, updateCanvasItemsImmediate } = ctx;
    const generatedPreview = options.resetAnalysisCamera ? createThreeScenePreview(sceneSpec) : undefined;
    const now = Date.now();
    let changed = false;
    canvasItemsPatchCommitRef.current = true;
    updateCanvasItemsImmediate(items => items.map((item) => {
      if (item.id !== nodeId || item.item.type !== 'three-scene' || !item.threeScene) return item;
      changed = true;
      const preview = generatedPreview || item.threeScene.preview || createThreeScenePreview(sceneSpec);
      const analysisCamera: ThreeSceneCameraState | undefined = options.resetAnalysisCamera
        ? {
          position: [...sceneSpec.camera.position],
          target: [...sceneSpec.camera.target],
          fov: sceneSpec.camera.fov,
        }
        : item.threeScene.analysisCamera;
      return {
        ...item,
        item: {
          ...item.item,
          thumbnail: preview,
          updatedAt: now,
        },
        threeScene: {
          ...item.threeScene,
          sceneSpec,
          preview,
          analysisCamera,
          sceneAnalysis: options.sceneAnalysis || item.threeScene.sceneAnalysis,
          status: 'success',
          error: undefined,
          ...(options.sourceImageIds ? {
            sourceImageId: options.sourceImageIds[0] || '',
            sourceImageIds: options.sourceImageIds,
          } : {}),
          ...(options.sourceImagePaths ? {
            sourceImagePath: options.sourceImagePaths[0],
            sourceImagePaths: options.sourceImagePaths,
          } : {}),
          updatedAt: now,
        },
      };
    }));
    if (!changed) return false;
    markCanvasNodesChanged([nodeId]);
    scheduleCanvasChangedNodesPatchSave([nodeId]);
    scheduleCanvasStateSave({ syncNodes: false });
    return true;

};

export const updateThreeScenePreviewImpl = (ctx: Pick<canvasPersistenceActionContext, 'markCanvasNodesChanged' | 'scheduleCanvasChangedNodesPatchSave' | 'scheduleCanvasStateSave' | 'updateCanvasItemsImmediate'>, nodeId: string, preview: string) => {
  const { markCanvasNodesChanged, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, updateCanvasItemsImmediate } = ctx;
    if (!/^data:image\/(?:png|webp);base64,/i.test(preview)) return false;
    let changed = false;
    updateCanvasItemsImmediate(items => items.map((item) => {
      if (item.id !== nodeId || item.item.type !== 'three-scene' || !item.threeScene) return item;
      if (item.threeScene.preview === preview) return item;
      changed = true;
      return {
        ...item,
        item: { ...item.item, thumbnail: preview, updatedAt: Date.now() },
        threeScene: { ...item.threeScene, preview, updatedAt: Date.now() },
      };
    }));
    if (!changed) return false;
    markCanvasNodesChanged([nodeId]);
    scheduleCanvasChangedNodesPatchSave([nodeId]);
    scheduleCanvasStateSave({ syncNodes: false });
    return true;

};

export const updateThreeSceneReferenceOverlayImpl = (ctx: Pick<canvasPersistenceActionContext, 'canvasItemsPatchCommitRef' | 'markCanvasNodesChanged' | 'scheduleCanvasChangedNodesPatchSave' | 'scheduleCanvasStateSave' | 'updateCanvasItemsImmediate'>, nodeId: string, patch: Partial<{ visible: boolean; opacity: number; guides: boolean }>) => {
  const { canvasItemsPatchCommitRef, markCanvasNodesChanged, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, updateCanvasItemsImmediate } = ctx;
    let changed = false;
    canvasItemsPatchCommitRef.current = true;
    updateCanvasItemsImmediate(items => items.map((item) => {
      if (item.id !== nodeId || item.item.type !== 'three-scene' || !item.threeScene) return item;
      const current = item.threeScene.referenceOverlay || { visible: true, opacity: 0.4, guides: false };
      const next = {
        visible: patch.visible ?? current.visible,
        opacity: clamp(Number(patch.opacity ?? current.opacity), 0, 1),
        guides: patch.guides ?? current.guides,
      };
      if (
        current.visible === next.visible
        && current.opacity === next.opacity
        && current.guides === next.guides
      ) return item;
      changed = true;
      return {
        ...item,
        threeScene: { ...item.threeScene, referenceOverlay: next, updatedAt: Date.now() },
      };
    }));
    if (!changed) return false;
    markCanvasNodesChanged([nodeId]);
    scheduleCanvasChangedNodesPatchSave([nodeId]);
    scheduleCanvasStateSave({ syncNodes: false });
    return true;

};

export const setThreeSceneRunStateImpl = (ctx: Pick<canvasPersistenceActionContext, 'canvasItemsPatchCommitRef' | 'markCanvasNodesChanged' | 'scheduleCanvasChangedNodesPatchSave' | 'scheduleCanvasStateSave' | 'updateCanvasItemsImmediate'>, nodeId: string, status: 'idle' | 'working' | 'success' | 'error', error?: string) => {
  const { canvasItemsPatchCommitRef, markCanvasNodesChanged, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, updateCanvasItemsImmediate } = ctx;
    canvasItemsPatchCommitRef.current = true;
    updateCanvasItemsImmediate(items => items.map(item => (
      item.id === nodeId && item.threeScene
        ? {
          ...item,
          threeScene: {
            ...item.threeScene,
            status,
            error,
            updatedAt: Date.now(),
          },
        }
        : item
    )));
    markCanvasNodesChanged([nodeId]);
    scheduleCanvasChangedNodesPatchSave([nodeId]);
    scheduleCanvasStateSave({ syncNodes: false });

};

export const getThreeSceneAnalysisImagesImpl = (ctx: Pick<canvasPersistenceActionContext, 'canvasItemsRef' | 'getCanvasImageInputBufferItemsForNode'>, node: CanvasImageItem) => {
  const { canvasItemsRef, getCanvasImageInputBufferItemsForNode } = ctx;
    const connected = getCanvasImageInputBufferItemsForNode(node, canvasItemsRef.current)
      .filter(item => item.type === 'image')
      .map((item, index) => ({
        id: item.id || `${node.id}-reference-${index}`,
        source: getCanvasOriginalImageSource(item) || getCanvasItemDisplaySource(item),
        name: item.name || item.content || `参考图 ${index + 1}`,
      }))
      .filter(image => !!image.source);
    if (connected.length > 0) return connected.slice(0, 8);
    if (node.threeScene?.status === 'idle' || node.threeScene?.status === 'error') return [];
    return (node.threeScene?.sourceImagePaths || [node.threeScene?.sourceImagePath])
      .map(value => String(value || '').trim())
      .filter(Boolean)
      .slice(0, 8)
      .map((source, index) => ({
        id: `${node.id}-saved-reference-${index}`,
        source,
        name: `已保存参考图 ${index + 1}`,
      }));

};

export const analyzeCanvasThreeSceneNodeImpl = async (ctx: Pick<canvasPersistenceActionContext, 'activateThreeSceneInteraction' | 'agentModelRef' | 'canvasItemsRef' | 'getThreeSceneAnalysisImages' | 'pushCanvasUndoSnapshot' | 'setThreeSceneAnalyzing' | 'setThreeSceneRunState' | 'showToast' | 'threeSceneAnalyzingIdsRef' | 'updateThreeSceneSpec'>, nodeId: string) => {
  const { activateThreeSceneInteraction, agentModelRef, canvasItemsRef, getThreeSceneAnalysisImages, pushCanvasUndoSnapshot, setThreeSceneAnalyzing, setThreeSceneRunState, showToast, threeSceneAnalyzingIdsRef, updateThreeSceneSpec } = ctx;
    if (threeSceneAnalyzingIdsRef.current.has(nodeId)) return;
    const node = canvasItemsRef.current.find(item => (
      item.id === nodeId && item.item.type === 'three-scene' && item.threeScene
    ));
    if (!node?.threeScene) return;
    const images = getThreeSceneAnalysisImages(node);
    if (images.length === 0) {
      setThreeSceneRunState(nodeId, 'error', '请先添加至少一张参考图片');
      showToast('请先给 3D 场景节点添加参考图片');
      return;
    }

    setThreeSceneAnalyzing(nodeId, true);
    setThreeSceneRunState(nodeId, 'working');
    showToast(images.length > 1 ? `正在综合分析 ${images.length} 个参考视角…` : '正在分析参考图片…');
    try {
      const { analysis, sceneSpec } = await analyzeImagesToThreeSceneResult({
        images,
        model: agentModelRef.current,
      });
      const latest = canvasItemsRef.current.find(item => item.id === nodeId);
      if (!latest?.threeScene) return;
      const sourceImageIds = (latest.inputs || []).slice(0, 8);
      const sourceImagePaths = images
        .map(image => image.source)
        .filter(source => !/^data:/i.test(source));
      pushCanvasUndoSnapshot('生成 3D 场景', { shareImmutableItems: true });
      updateThreeSceneSpec(nodeId, sceneSpec, {
        resetAnalysisCamera: true,
        sourceImageIds,
        sourceImagePaths,
        sceneAnalysis: analysis,
      });
      activateThreeSceneInteraction(nodeId);
      showToast(`3D 场景已生成${images.length > 1 ? `，已综合 ${images.length} 个视角` : ''}`);
    } catch (error) {
      console.error('generate three scene failed:', error);
      const message = error instanceof ThreeSceneAnalysisError
        ? error.message
        : '3D 场景生成失败，请重试';
      setThreeSceneRunState(nodeId, 'error', message);
      showToast(message);
    } finally {
      setThreeSceneAnalyzing(nodeId, false);
    }

};

export const addCanvasThreeSceneGeneratorNodeImpl = (ctx: Pick<canvasPersistenceActionContext, 'appendCanvasItems' | 'canvasItemsRef' | 'canvasSelectedIdsRef' | 'createAssetId' | 'getCanvasDropPosition' | 'getCanvasItemsBounds' | 'makeCanvasNodeId' | 'showToast' | 'updateCanvasSelection'>, client?: { x: number; y: number }, requestedSourceIds?: string[]) => {
  const { appendCanvasItems, canvasItemsRef, canvasSelectedIdsRef, createAssetId, getCanvasDropPosition, getCanvasItemsBounds, makeCanvasNodeId, showToast, updateCanvasSelection } = ctx;
    const selectedSourceIds = requestedSourceIds || canvasSelectedIdsRef.current;
    const sources = selectedSourceIds
      .map(id => canvasItemsRef.current.find(item => item.id === id))
      .filter((item): item is CanvasImageItem => !!item && canUseCanvasItemAsImageEnhancementInput(item))
      .slice(0, 8);
    const inputBounds = sources.length > 0 ? getCanvasItemsBounds(sources.map(item => item.id)) : null;
    const position = inputBounds && !client
      ? { x: inputBounds.x + inputBounds.width + 72, y: inputBounds.y }
      : getCanvasDropPosition(0, client);
    const bufferId = createAssetId();
    const node = createThreeSceneGeneratorCanvasNode({
      id: makeCanvasNodeId(bufferId, 'three'),
      bufferId,
      sources,
      position,
    });
    if (appendCanvasItems([node], '新增 3D 场景节点') > 0) {
      updateCanvasSelection([node.id]);
      showToast(sources.length > 0
        ? `已新建 3D 场景节点，并连接 ${sources.length} 张参考图`
        : '已新建 3D 场景节点');
    }

};

export const captureThreeSceneViewImpl = async (ctx: Pick<canvasPersistenceActionContext, 'appendCanvasItems' | 'canvasItemsRef' | 'createAssetId' | 'getCanvasAiOutputCopyPosition' | 'makeCanvasNodeId' | 'showToast'>, nodeId: string, dataUrl: string) => {
  const { appendCanvasItems, canvasItemsRef, createAssetId, getCanvasAiOutputCopyPosition, makeCanvasNodeId, showToast } = ctx;
    const sourceNode = canvasItemsRef.current.find(item => item.id === nodeId && item.threeScene);
    if (!sourceNode) return;
    try {
      const createdAt = Date.now();
      const fileName = `three-scene-view-${createdAt}.png`;
      const savedPath = await saveThreeSceneCapture(dataUrl, fileName);
      const displayUrl = convertFileSrc(savedPath);
      const size = await readImageDisplaySize(displayUrl);
      const position = getCanvasAiOutputCopyPosition(sourceNode, size, 0);
      const bufferId = createAssetId();
      const canvasItem = createThreeSceneCaptureCanvasNode({
        id: makeCanvasNodeId(bufferId, 'image'),
        bufferId,
        path: savedPath,
        url: displayUrl,
        fileName,
        position,
        size,
        createdAt,
      });
      if (appendCanvasItems([canvasItem], '生成 3D 当前视角') > 0) {
        showToast('当前视角已保存为普通图片节点');
      }
    } catch (error) {
      console.error('capture three scene failed:', error);
      showToast('当前视角保存失败，请重试');
    }

};

export const removeCanvasItemsByIdsImpl = (ctx: Pick<canvasPersistenceActionContext, 'activeThreeSceneIdRef' | 'canvasContentRef' | 'canvasImageSourceCacheRef' | 'canvasImageUpgradeFailedRef' | 'canvasImageUpgradeInFlightRef' | 'canvasImageUpgradeQueueRef' | 'canvasItemsRef' | 'canvasPreviewSourceIdsRef' | 'canvasSelectedIdsRef' | 'exitThreeSceneInteraction' | 'getCanvasItemElement' | 'isCanvasModeRef' | 'pushCanvasUndoSnapshot' | 'showToast' | 'updateCanvasItemsDeferred' | 'updateCanvasSelection'>, ids: string[], label: string = '从画布移除节点') => {
  const { activeThreeSceneIdRef, canvasContentRef, canvasImageSourceCacheRef, canvasImageUpgradeFailedRef, canvasImageUpgradeInFlightRef, canvasImageUpgradeQueueRef, canvasItemsRef, canvasPreviewSourceIdsRef, canvasSelectedIdsRef, exitThreeSceneInteraction, getCanvasItemElement, isCanvasModeRef, pushCanvasUndoSnapshot, showToast, updateCanvasItemsDeferred, updateCanvasSelection } = ctx;
    if (!isCanvasModeRef.current) return 0;
    const requestedIds = Array.from(new Set(ids.filter(Boolean)));
    const protectedSlotIds = new Set(requestedIds.filter(id => {
      const item = canvasItemsRef.current.find(candidate => candidate.id === id);
      const group = getCanvasWorkflowGroup(item);
      const workflow = getCanvasWorkflowTemplateFromNode(group?.module);
      return isExpandedCanvasWorkflowInternalSlotNode(item, workflow);
    }));
    const uniqueIds = requestedIds.filter(id => !protectedSlotIds.has(id));
    if (protectedSlotIds.size > 0) {
      showToast('工作流内部槽位节点不能删除，可清空或替换槽位图片');
    }
    if (uniqueIds.length === 0) return 0;
    const idSet = new Set(uniqueIds);
    if (activeThreeSceneIdRef.current && idSet.has(activeThreeSceneIdRef.current)) {
      exitThreeSceneInteraction();
    }
    pushCanvasUndoSnapshot(label, { shareImmutableItems: true });
    uniqueIds.forEach(id => {
      canvasImageSourceCacheRef.current.delete(id);
      canvasPreviewSourceIdsRef.current.delete(id);
      canvasImageUpgradeFailedRef.current.delete(id);
      canvasImageUpgradeInFlightRef.current.delete(id);
    });
    canvasImageUpgradeQueueRef.current = canvasImageUpgradeQueueRef.current.filter(id => !idSet.has(id));
    uniqueIds.forEach((id) => {
      const element = getCanvasItemElement(id);
      if (element) element.style.visibility = 'hidden';
      const content = canvasContentRef.current;
      if (!content) return;
      const selectorId = typeof CSS !== 'undefined' && CSS.escape
        ? CSS.escape(id)
        : id.replace(/["\\]/g, '\\$&');
      content.querySelectorAll<SVGGElement>(
        `[data-canvas-connection-source-id="${selectorId}"], [data-canvas-connection-target-id="${selectorId}"]`,
      ).forEach((connection) => { connection.style.visibility = 'hidden'; });
    });
    updateCanvasItemsDeferred(prev => prev
      .filter(item => !idSet.has(item.id))
      .map(item => item.inputs?.some(inputId => idSet.has(inputId))
        ? { ...item, inputs: item.inputs.filter(inputId => !idSet.has(inputId)) }
        : item));
    updateCanvasSelection(canvasSelectedIdsRef.current.filter(selectedId => !idSet.has(selectedId)));
    return uniqueIds.length;

};

export const organizeCanvasItemsImpl = (ctx: Pick<canvasPersistenceActionContext, 'canvasItemsRef' | 'canvasSelectedIdsRef' | 'fitCanvasViewToItems' | 'getCanvasBoundsFromItems' | 'growCanvasToFit' | 'hideCanvasSelectionOverlay' | 'isCanvasModeRef' | 'pushCanvasUndoSnapshot' | 'showToast' | 'updateCanvasItemsImmediate' | 'updateCanvasSelection'>, ids?: string[]) => {
  const { canvasItemsRef, canvasSelectedIdsRef, fitCanvasViewToItems, getCanvasBoundsFromItems, growCanvasToFit, hideCanvasSelectionOverlay, isCanvasModeRef, pushCanvasUndoSnapshot, showToast, updateCanvasItemsImmediate, updateCanvasSelection } = ctx;
    if (!isCanvasModeRef.current) return 0;
    const sourceItems = canvasItemsRef.current;
    const selectedIds = canvasSelectedIdsRef.current;
    const requestedIds = ids?.length
      ? ids
      : (selectedIds.length > 1 ? selectedIds : sourceItems.map(item => item.id));
    const existingIds = new Set(sourceItems.map(item => item.id));
    const targetIds = Array.from(new Set(requestedIds.filter(id => existingIds.has(id))));
    const targetIdSet = new Set(targetIds);
    const targetItems = sourceItems.filter(item => targetIdSet.has(item.id));

    if (targetItems.length < 2) {
      showToast(targetItems.length === 0 ? '画布里还没有可整理的元素' : '至少需要 2 个元素才能整理');
      return 0;
    }

    const bounds = getCanvasBoundsFromItems(targetItems);
    const snap = (value: number) => Math.max(24, Math.round(value / 8) * 8);
    const startX = snap(Math.max(72, bounds?.x ?? 120));
    const startY = snap(Math.max(72, bounds?.y ?? 120));
    const sortedItems = [...targetItems].sort((a, b) => (
      a.y - b.y ||
      a.x - b.x ||
      (a.item.createdAt || 0) - (b.item.createdAt || 0)
    ));
    const normalizeLayoutMediaSource = (source?: string | null) => {
      const value = String(source || '').trim();
      if (!value) return '';
      return /^[a-z]:[\\/]/i.test(value)
        ? value.replace(/\\/g, '/').toLowerCase()
        : value;
    };
    const outputOwnerBySource = new Map<string, string>();
    sortedItems.forEach(item => {
      if (!isCanvasAiGeneratorType(item.ai?.type) && item.ai?.type !== 'workflow') return;
      (item.ai.outputs || []).forEach(output => {
        [output.path, output.url, output.sourceUrl].forEach(source => {
          const key = normalizeLayoutMediaSource(source);
          if (key && !outputOwnerBySource.has(key)) outputOwnerBySource.set(key, item.id);
        });
      });
    });
    const layoutItems = sortedItems.map(item => {
      const isGenerator = isCanvasAiGeneratorType(item.ai?.type) || item.ai?.type === 'workflow';
      const outputOf = isCanvasAiGeneratedType(item.ai?.type)
        ? [item.item.path, item.item.url, item.item.sourceUrl, item.item.originalUrl]
          .map(normalizeLayoutMediaSource)
          .filter(Boolean)
          .map(source => outputOwnerBySource.get(source))
          .find((ownerId): ownerId is string => !!ownerId)
        : undefined;
      return {
        ...item,
        layoutRole: isGenerator ? 'generator' as const : outputOf ? 'output' as const : undefined,
        outputOf,
      };
    });
    const { placements, bounds: arrangedBounds } = layoutCanvasItems(layoutItems, {
      startX,
      startY,
      columnGap: 104,
      masonryColumnGap: 56,
      rowGap: 46,
      sectionGap: 120,
      maxLayerHeight: 1800,
      maxMasonryWidth: 2400,
      maxMasonryColumns: 5,
      maxReferenceColumns: 3,
      maxGroupColumns: 3,
      looseGroupSize: 9,
      groupColumnGap: 176,
      groupRowGap: 152,
      gridSize: 8,
    });

    const arrangedIds = sortedItems.map(item => item.id);
    const previousSelection = [...selectedIds];

    pushCanvasUndoSnapshot('一键整理画布');
    updateCanvasItemsImmediate(prev => prev.map(item => {
      const pos = placements.get(item.id);
      return pos ? { ...item, x: pos.x, y: pos.y } : item;
    }));
    hideCanvasSelectionOverlay();
    if (selectedIds.length > 1 || ids?.length) {
      updateCanvasSelection(arrangedIds);
    } else {
      updateCanvasSelection(previousSelection.filter(id => existingIds.has(id)));
    }
    if (arrangedBounds) {
      growCanvasToFit(arrangedBounds.x + arrangedBounds.width + 160, arrangedBounds.y + arrangedBounds.height + 160);
    }
    window.requestAnimationFrame(() => {
      fitCanvasViewToItems(arrangedIds);
    });
    showToast(`已整理 ${targetItems.length} 个画布元素`);
    return targetItems.length;

};

export const removeCanvasConnectionImpl = (ctx: Pick<canvasPersistenceActionContext, 'canvasItemsRef' | 'pushCanvasUndoSnapshot' | 'updateCanvasItemsImmediate'>, targetId: string, sourceId: string, label: string = '删除连接线') => {
  const { canvasItemsRef, pushCanvasUndoSnapshot, updateCanvasItemsImmediate } = ctx;
    if (!targetId || !sourceId) return false;
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!target?.inputs?.includes(sourceId)) return false;
    pushCanvasUndoSnapshot(label);
    updateCanvasItemsImmediate(prev => prev.map(item => {
      if (item.id !== targetId) return item;
      if (!isCanvasImageFusionAi(item.ai)) {
        return { ...item, inputs: (item.inputs || []).filter(inputId => inputId !== sourceId) };
      }
      const fusion = removeCanvasImageFusionInput(item.ai?.imageFusion, item.inputs || [], sourceId);
      return {
        ...item,
        inputs: fusion.inputs,
        ai: item.ai ? {
          ...item.ai,
          imageFusion: fusion.config,
          sourceImageNodeId: fusion.config.baseNodeId,
          referenceImageNodeIds: fusion.config.styleNodeId ? [fusion.config.styleNodeId] : [],
          referenceRoles: fusion.referenceRoles,
        } : item.ai,
      };
    }));
    return true;

};
