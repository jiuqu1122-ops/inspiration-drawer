import { convertFileSrc,invoke } from '@tauri-apps/api/core';
import React from 'react';
import { flushSync } from 'react-dom';
import { createImageThumbnailInWebview,getVideoThumbnail } from '../../../services/mediaThumbnail';
import { BufferItem } from '../../../types';
import type { CanvasAiOutputThumbnailJob,ImageThumbnailFileResult } from '../../../types/canvasMedia';
import type { CanvasBrushCropRect,CanvasBrushEditorMode,CanvasBrushEditorOpenOptions,CanvasBrushEditorState,CanvasBrushPoint,CanvasBrushShapeMode,CanvasContextMenuState } from '../../../types/canvasRuntime';
import type { TextInputDialogOptions } from '../../../types/dialogs';
import { CANVAS_AI_DEFAULT_ASPECT_RATIO } from '../../../utils/canvasAiAspectRatio';
import { CANVAS_AI_DEFAULT_COUNT } from '../../../utils/canvasAiConfig';
import { AI_GENERATED_FOLDER_NAME } from '../../../utils/canvasGeneratedFolders';
import { blobToDataUrl,dataUrlToBlob,getCanvasAiRemoteFallbackForRotation,imageDataUrlToJpegDataUrl,imageDataUrlToPngDataUrl,isLikelyJpegOrPngImageSource,isRemoteHttpImageSource,optimizeCanvasAiInputDataUrl,rotateImageDataUrl } from '../../../utils/canvasImageData';
import { getCanvasImageFusionInputIds,isCanvasImageFusionAi } from '../../../utils/canvasImageFusion';
import { getCanvasInitialImageSize,readImageDisplaySize } from '../../../utils/canvasImageSize';
import { createCanvasAiOutputBufferItem,getCanvasAiInputSourceCandidates,getCanvasAiOutputDisplaySource,getCanvasAiOutputSize,getCanvasAiSuccessfulOutputs,getCanvasItemDisplaySource,isCanvasAgentTextTarget,isCanvasWorkflowReferenceBridge,isDirectCanvasAiInputSource } from '../../../utils/canvasItemSelectors';
import { cloneDrawerValue,isDataMediaSourceValue } from '../../../utils/canvasSerialization';
import { applyCanvasTextContextRouting,type CanvasContextRoutingTarget } from '../../../utils/canvasTextContextRouting';
import { isCanvasAudioFileName,isCanvasImageFileName,isCanvasVideoFileName } from '../../../utils/localMediaPaths';
import { getCanvasAiSlotClientRequestId,getCanvasAiVideoReferenceSlots } from '../../canvasAiImage';
import { CANVAS_AI_MAX_OUTPUT_COUNT } from '../../canvasAiNodeLayout';
import { getCanvasAiMediaType } from '../../canvasAiRuntime';
import { cloneCanvasAiForPaste } from '../../canvasClipboard';
import { createDefaultCanvasGroupName,getCanvasGroupId,getCommonCanvasGroup,remapCanvasGroupsForPaste } from '../../canvasGroups';
import { CANVAS_EDGE_AUTOSCROLL_MARGIN,CANVAS_EDGE_AUTOSCROLL_SPEED,CANVAS_GROW_CHUNK,type CanvasAiGeneratedOutput,type CanvasImageItem,type CanvasItemBox,type CanvasResizeCorner,type DesignAgentConfig } from '../../canvasModel';
import { clamp } from '../../common';
import { normalizeDesignAgentConfig } from '../../designAgentNode';
import { writeImageSourceToClipboard,writeLocalImageFileToClipboard } from '../../imageClipboard';

type canvasMediaActionContext = { getCanvasPointFromClient: (clientX: number, clientY: number) => { x: number; y: number; }; x: number; y: number; canvasSelectedIdsRef: React.RefObject<string[]>; expandCanvasSelectionIdsWithGroups: (ids: string[], sourceItems?: CanvasImageItem[]) => string[]; showToast: (message: string) => void; canvasItemsRef: React.RefObject<CanvasImageItem[]>; openTextInputDialog: (options: TextInputDialogOptions) => Promise<string | null>; pushCanvasUndoSnapshot: (label: string, options?: { layoutOnly?: boolean; shareImmutableItems?: boolean; }) => void; canvasItemsPatchCommitRef: React.RefObject<boolean>; updateCanvasItemsImmediate: (updater: (prev: CanvasImageItem[]) => CanvasImageItem[]) => CanvasImageItem[]; markCanvasNodesChanged: (ids: string[]) => void; scheduleCanvasChangedNodesPatchSave: (ids: string[]) => void; scheduleCanvasStateSave: (options?: { syncNodes?: boolean; }) => void; updateCanvasSelection: (ids: string[]) => void; setCanvasSelectionWithoutWorkflowExpansion: (ids: string[]) => void; canvasClipboardRef: React.RefObject<CanvasImageItem[]>; preferCanvasClipboardRef: React.RefObject<boolean>; isCanvasModeRef: React.RefObject<boolean>; getCanvasBoundsFromItems: (sourceItems: CanvasImageItem[]) => CanvasItemBox | null; CANVAS_PASTE_OFFSET: 54; createAssetId: () => `${string}-${string}-${string}-${string}-${string}`; makeCanvasNodeId: (seed: string, kind?: string) => string; appendCanvasItems: (nextItems: CanvasImageItem[], label: string, select?: boolean) => number; canvasDragRef: React.RefObject<{ ids: string[]; pointerId: number; startClientX: number; startClientY: number; startScrollLeft: number; startScrollTop: number; startItems: Record<string, CanvasItemBox>; latestDelta: { dx: number; dy: number; }; hasMoved: boolean; hasConnections: boolean; pendingSelectionIds: string[] | null; } | null>; startItems: Record<string, CanvasItemBox>; canvasScaleRef: React.RefObject<number>; startScrollLeft: number; startScrollTop: number; canvasResizeRef: React.RefObject<{ id: string; corner: CanvasResizeCorner; startClientX: number; startClientY: number; startX: number; startY: number; startWidth: number; startHeight: number; aspect: number; latestBox: CanvasItemBox | null; hasResized: boolean; } | null>; startX: number; startY: number; canvasGroupResizeRef: React.RefObject<{ corner: CanvasResizeCorner; startClientX: number; startClientY: number; startBounds: CanvasItemBox; startItems: Record<string, CanvasItemBox>; aspect: number; latestBoxes: Record<string, CanvasItemBox> | null; hasResized: boolean; } | null>; startBounds: CanvasItemBox; canvasSelectionDragRef: React.RefObject<{ pointerId: number; startX: number; startY: number; currentX: number; currentY: number; additive: boolean; baseSelectedIds: string[]; hasMoved: boolean; } | null>; hideCanvasSelectionOverlay: () => void; canvasSizeRef: React.RefObject<{ width: number; height: number; }>; setCanvasSizeImmediate: (nextSize: { width: number; height: number; }) => void; width: number; height: number; shiftCanvasWorld: (deltaX: number, deltaY: number) => void; canvasSurfaceRef: React.RefObject<HTMLDivElement | null>; canvasPanRef: React.RefObject<{ pointerId: number; button: number; startClientX: number; startClientY: number; startScrollLeft: number; startScrollTop: number; } | null>; writeCanvasSurfaceScroll: (surface: HTMLDivElement, left: number, top: number, updateLock?: boolean) => void; canvasInteractionSurfaceRectRef: React.RefObject<DOMRect | null>; isCanvasInteractingRef: React.RefObject<boolean>; expandCanvasBeforeViewport: (left: number, top: number) => void; growCanvasToFit: (right: number, bottom: number) => void; getLatestFileCacheDir: () => Promise<string>; getCanvasDropPosition: (index?: number, client?: { x: number; y: number; }) => { x: number; y: number; }; getCanvasClipboardImageFiles: (clipboardData: DataTransfer) => File[]; createCanvasImageItemFromFile: (file: File, index?: number, client?: { x: number; y: number; }) => Promise<CanvasImageItem | null>; createCanvasTextItemFromContent: (content: string, index?: number, client?: { x: number; y: number; }) => CanvasImageItem | null; canvasTextDraftValuesRef: React.RefObject<Record<string, string>>; canvasTextDraftTimersRef: React.RefObject<Record<string, number>>; updateCanvasTextItem: (canvasId: string, content: string) => void; canvasTextOutputDraftValuesRef: React.RefObject<Record<string, string>>; canvasTextOutputDraftTimersRef: React.RefObject<Record<string, number>>; updateCanvasTextOutputItem: (canvasId: string, output: string) => void; canvasTextOutputAreaRefs: React.RefObject<Record<string, HTMLTextAreaElement | null>>; generatedImageCachePromisesRef: React.RefObject<Map<string, Promise<string>>>; shouldTryBackendImageCopyDirectly: (source: string) => boolean; imageSourceToDataUrl: (source: string, optimizeForAi?: boolean) => Promise<string>; copyImageDataUrlToSystemClipboard: (dataUrl: string) => Promise<void>; selectedImage: string | null; copyImageSourceToSystemClipboard: (source: string) => Promise<void>; getCopyableCanvasImageFromIds: (ids: string[]) => CanvasImageItem | null; copyCanvasItems: (ids?: string[], options?: { showToast?: boolean; }) => number; copyCanvasImageToSystemClipboard: (canvasItem?: CanvasImageItem | null, options?: { successToast?: string; missingToast?: string; failureToast?: string; }) => Promise<boolean>; canvasBrushCanvasRef: React.RefObject<HTMLCanvasElement | null>; canvasBrushBaseCanvasRef: React.RefObject<HTMLCanvasElement | null>; loadCanvasBrushImage: (source: string) => Promise<HTMLImageElement>; canvasBrushPendingMarksRef: React.RefObject<string | null>; setCanvasBrushHistory: React.Dispatch<React.SetStateAction<string[]>>; setCanvasBrushRedoHistory: React.Dispatch<React.SetStateAction<string[]>>; setCanvasBrushEditor: React.Dispatch<React.SetStateAction<CanvasBrushEditorState | null>>; canvasBrushOpenRequestRef: React.RefObject<number>; setCanvasContextMenu: React.Dispatch<React.SetStateAction<CanvasContextMenuState | null>>; setCanvasInputMenuForId: React.Dispatch<React.SetStateAction<string | null>>; CANVAS_BRUSH_EDITOR_MAX_EDGE: 2048; setCanvasBrushMode: React.Dispatch<React.SetStateAction<CanvasBrushEditorMode>>; setCanvasBrushCropRect: React.Dispatch<React.SetStateAction<CanvasBrushCropRect | null>>; hideCanvasBrushCursor: () => void; canvasBrushCropStartRef: React.RefObject<CanvasBrushPoint | null>; canvasBrushShapeStartRef: React.RefObject<CanvasBrushPoint | null>; canvasBrushShapeSnapshotRef: React.RefObject<ImageData | null>; keepDrawerOpenByPointer: () => void; openCanvasBrushEditorFromSource: (options: CanvasBrushEditorOpenOptions) => Promise<void>; canvasBrushMode: CanvasBrushEditorMode; updateCanvasBrushCursor: (nextCursor: { visible: boolean; x: number; y: number; scale: number; }) => void; canvasBrushSize: number; canvasBrushOpacity: number; canvasBrushColor: string; getCanvasBrushShapeBox: (mode: CanvasBrushShapeMode, from: CanvasBrushPoint, to: CanvasBrushPoint) => { x: number; y: number; width: number; height: number; }; canvasBrushEditor: CanvasBrushEditorState | null; canvasBrushCropRect: CanvasBrushCropRect | null; clearCanvasBrushShapeDraft: () => void; activateDoodleShortcutScope: () => void; doodleRootRef: React.RefObject<HTMLDivElement | null>; clearCanvasBrushCrop: () => void; canvasBrushDrawingRef: React.RefObject<boolean>; canvasBrushLastPointRef: React.RefObject<CanvasBrushPoint | null>; updateCanvasBrushCursorFromEvent: (event: React.PointerEvent<Element>) => void; getCanvasBrushPoint: (event: React.PointerEvent<HTMLCanvasElement>) => { x: number; y: number; }; isCanvasBrushShapeMode: (mode: CanvasBrushEditorMode) => mode is CanvasBrushShapeMode; paintCanvasBrushStroke: (from: CanvasBrushPoint, to: CanvasBrushPoint) => void; normalizeCanvasBrushCropRect: (from: CanvasBrushPoint, to: CanvasBrushPoint, width: number, height: number) => CanvasBrushCropRect | null; restoreCanvasBrushShapeSnapshot: () => boolean; paintCanvasBrushShape: (mode: CanvasBrushShapeMode, from: CanvasBrushPoint, to: CanvasBrushPoint) => void; pushCanvasBrushHistory: () => void; canvasBrushHistory: string[]; canvasBrushRedoHistory: string[]; undoCanvasBrushStroke: () => void; redoCanvasBrushStroke: () => void; imageSourceToJpegDataUrl: (source: string) => Promise<string>; webImageCacheDirRef: React.RefObject<string>; GENERATED_IMAGE_CACHE_RETRY_DELAYS_MS: number[]; isCanvasZoomingRef: React.RefObject<boolean>; settleCanvasAiOutputThumbnailJob: (job: CanvasAiOutputThumbnailJob, patch: Partial<CanvasAiGeneratedOutput>) => void; generatedImageCachePendingIdsRef: React.RefObject<Set<string>>; updateDrawerItemsDeferred: (updater: (previous: BufferItem[]) => BufferItem[]) => void; canvasAiOutputThumbnailInFlightRef: React.RefObject<Set<string>>; canvasAiOutputThumbnailQueueRef: React.RefObject<CanvasAiOutputThumbnailJob[]>; enqueueCanvasAiOutputThumbnailJob: (job: CanvasAiOutputThumbnailJob) => void; createCanvasImagePreviewThumbnail: (source: string, path?: string, allowWebviewFallback?: boolean) => Promise<string>; runNextCanvasAiOutputThumbnailJob: () => void; IMAGE_THUMBNAIL_UPDATE_BATCH_MS: 90; IMAGE_THUMBNAIL_QUEUE_LIMIT: 32; getCanvasContextRoutingTargetKeys: (canvasItem: CanvasImageItem) => string[]; getCanvasInputItemsForNode: (canvasItem: CanvasImageItem, sourceItems?: CanvasImageItem[]) => CanvasImageItem[]; };

export const createCanvasContextMenuStateImpl = (ctx: Pick<canvasMediaActionContext, 'getCanvasPointFromClient'>, event: { clientX: number; clientY: number }, type: CanvasContextMenuState['type'], patch: Partial<CanvasContextMenuState> = {}): CanvasContextMenuState => {
  const { getCanvasPointFromClient } = ctx;
    const point = getCanvasPointFromClient(event.clientX, event.clientY);
    return {
      x: event.clientX,
      y: event.clientY,
      worldX: point.x,
      worldY: point.y,
      type,
      ...patch,
    };

};

export const createCanvasGroupImpl = async (ctx: Pick<canvasMediaActionContext, 'canvasItemsPatchCommitRef' | 'canvasItemsRef' | 'expandCanvasSelectionIdsWithGroups' | 'markCanvasNodesChanged' | 'openTextInputDialog' | 'pushCanvasUndoSnapshot' | 'scheduleCanvasChangedNodesPatchSave' | 'scheduleCanvasStateSave' | 'showToast' | 'updateCanvasItemsImmediate' | 'updateCanvasSelection'>, ids: string[]) => {
  const { canvasItemsPatchCommitRef, canvasItemsRef, expandCanvasSelectionIdsWithGroups, markCanvasNodesChanged, openTextInputDialog, pushCanvasUndoSnapshot, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, showToast, updateCanvasItemsImmediate, updateCanvasSelection } = ctx;
    const groupIds = expandCanvasSelectionIdsWithGroups(ids);
    if (groupIds.length < 2) {
      showToast('请先框选至少两个节点');
      return false;
    }
    const defaultName = createDefaultCanvasGroupName(canvasItemsRef.current);
    const value = await openTextInputDialog({
      title: '命名编组',
      description: `将 ${groupIds.length} 个节点编为一组`,
      defaultValue: defaultName,
      placeholder: '输入编组名称',
      confirmLabel: '完成编组',
      icon: 'canvas',
    });
    if (value === null) return false;
    const name = value.trim().slice(0, 48);
    if (!name) {
      showToast('请输入编组名称');
      return false;
    }
    const canvasGroup = {
      id: `canvas_group_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name,
    };
    const idSet = new Set(groupIds);
    pushCanvasUndoSnapshot('编组画布节点', { shareImmutableItems: true });
    canvasItemsPatchCommitRef.current = true;
    updateCanvasItemsImmediate(items => items.map(item => (
      idSet.has(item.id) ? { ...item, canvasGroup } : item
    )));
    markCanvasNodesChanged(groupIds);
    scheduleCanvasChangedNodesPatchSave(groupIds);
    scheduleCanvasStateSave({ syncNodes: false });
    updateCanvasSelection(groupIds);
    showToast(`已创建编组“${name}”`);
    return true;

};

export const renameCanvasGroupImpl = async (ctx: Pick<canvasMediaActionContext, 'canvasItemsPatchCommitRef' | 'canvasItemsRef' | 'expandCanvasSelectionIdsWithGroups' | 'markCanvasNodesChanged' | 'openTextInputDialog' | 'pushCanvasUndoSnapshot' | 'scheduleCanvasChangedNodesPatchSave' | 'scheduleCanvasStateSave' | 'showToast' | 'updateCanvasItemsImmediate'>, ids: string[]) => {
  const { canvasItemsPatchCommitRef, canvasItemsRef, expandCanvasSelectionIdsWithGroups, markCanvasNodesChanged, openTextInputDialog, pushCanvasUndoSnapshot, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, showToast, updateCanvasItemsImmediate } = ctx;
    const expandedIds = expandCanvasSelectionIdsWithGroups(ids);
    const group = getCommonCanvasGroup(expandedIds, canvasItemsRef.current);
    if (!group) {
      showToast('请选择一个完整编组');
      return false;
    }
    const value = await openTextInputDialog({
      title: '重命名编组',
      defaultValue: group.name,
      placeholder: '输入编组名称',
      confirmLabel: '保存名称',
      icon: 'canvas',
    });
    if (value === null) return false;
    const name = value.trim().slice(0, 48);
    if (!name) {
      showToast('请输入编组名称');
      return false;
    }
    const changedIds = canvasItemsRef.current
      .filter(item => getCanvasGroupId(item) === group.id)
      .map(item => item.id);
    pushCanvasUndoSnapshot('重命名画布编组', { shareImmutableItems: true });
    canvasItemsPatchCommitRef.current = true;
    updateCanvasItemsImmediate(items => items.map(item => (
      getCanvasGroupId(item) === group.id
        ? { ...item, canvasGroup: { id: group.id, name } }
        : item
    )));
    markCanvasNodesChanged(changedIds);
    scheduleCanvasChangedNodesPatchSave(changedIds);
    scheduleCanvasStateSave({ syncNodes: false });
    showToast(`编组已重命名为“${name}”`);
    return true;

};

export const ungroupCanvasItemsImpl = (ctx: Pick<canvasMediaActionContext, 'canvasItemsPatchCommitRef' | 'canvasItemsRef' | 'expandCanvasSelectionIdsWithGroups' | 'markCanvasNodesChanged' | 'pushCanvasUndoSnapshot' | 'scheduleCanvasChangedNodesPatchSave' | 'scheduleCanvasStateSave' | 'setCanvasSelectionWithoutWorkflowExpansion' | 'showToast' | 'updateCanvasItemsImmediate'>, ids: string[]) => {
  const { canvasItemsPatchCommitRef, canvasItemsRef, expandCanvasSelectionIdsWithGroups, markCanvasNodesChanged, pushCanvasUndoSnapshot, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, setCanvasSelectionWithoutWorkflowExpansion, showToast, updateCanvasItemsImmediate } = ctx;
    const expandedIds = expandCanvasSelectionIdsWithGroups(ids);
    const selectedIdSet = new Set(expandedIds);
    const groupIdSet = new Set(
      canvasItemsRef.current
        .filter(item => selectedIdSet.has(item.id))
        .map(getCanvasGroupId)
        .filter(Boolean),
    );
    if (groupIdSet.size === 0) {
      showToast('选中的节点没有编组');
      return false;
    }
    const changedIds = canvasItemsRef.current
      .filter(item => groupIdSet.has(getCanvasGroupId(item)))
      .map(item => item.id);
    const changedIdSet = new Set(changedIds);
    pushCanvasUndoSnapshot('取消画布编组', { shareImmutableItems: true });
    canvasItemsPatchCommitRef.current = true;
    updateCanvasItemsImmediate(items => items.map(item => {
      if (!changedIdSet.has(item.id)) return item;
      const { canvasGroup: _canvasGroup, ...rest } = item;
      return rest;
    }));
    markCanvasNodesChanged(changedIds);
    scheduleCanvasChangedNodesPatchSave(changedIds);
    scheduleCanvasStateSave({ syncNodes: false });
    setCanvasSelectionWithoutWorkflowExpansion(expandedIds);
    showToast(groupIdSet.size > 1 ? `已取消 ${groupIdSet.size} 个编组` : '已取消编组');
    return true;

};

export const copyCanvasItemsImpl = (ctx: Pick<canvasMediaActionContext, 'canvasClipboardRef' | 'canvasItemsRef' | 'preferCanvasClipboardRef' | 'showToast'>, ids: string[], options: { showToast?: boolean } = {}) => {
  const { canvasClipboardRef, canvasItemsRef, preferCanvasClipboardRef, showToast } = ctx;
    const idSet = new Set(ids.filter(Boolean));
    const copied = canvasItemsRef.current.filter(item => idSet.has(item.id));
    if (copied.length === 0) return 0;
    canvasClipboardRef.current = cloneDrawerValue(copied);
    preferCanvasClipboardRef.current = true;
    if (options.showToast !== false) showToast(`已复制 ${copied.length} 个画布元素`);
    return copied.length;

};

export const pasteCanvasItemsImpl = (ctx: Pick<canvasMediaActionContext, 'CANVAS_PASTE_OFFSET' | 'appendCanvasItems' | 'canvasClipboardRef' | 'createAssetId' | 'getCanvasBoundsFromItems' | 'getCanvasPointFromClient' | 'isCanvasModeRef' | 'makeCanvasNodeId' | 'showToast'>, client?: { x: number; y: number }, label: string = '粘贴画布元素') => {
  const { CANVAS_PASTE_OFFSET, appendCanvasItems, canvasClipboardRef, createAssetId, getCanvasBoundsFromItems, getCanvasPointFromClient, isCanvasModeRef, makeCanvasNodeId, showToast } = ctx;
    if (!isCanvasModeRef.current) return 0;
    const sourceItems = cloneDrawerValue(canvasClipboardRef.current || []);
    const sourceBounds = getCanvasBoundsFromItems(sourceItems);
    if (sourceItems.length === 0 || !sourceBounds) return 0;

    const targetPoint = client ? getCanvasPointFromClient(client.x, client.y) : null;
    const offsetX = targetPoint ? targetPoint.x - sourceBounds.x : CANVAS_PASTE_OFFSET;
    const offsetY = targetPoint ? targetPoint.y - sourceBounds.y : CANVAS_PASTE_OFFSET;
    const idMap = new Map<string, string>();

    const nextItems = sourceItems.map((sourceItem, index) => {
      const nextBufferId = createAssetId();
      const nextCanvasId = makeCanvasNodeId(
        nextBufferId,
        sourceItem.id.startsWith('canvas_ai_') ? 'ai'
          : sourceItem.id.startsWith('canvas_rife_') ? 'rife'
            : sourceItem.id.startsWith('canvas_realesrgan_') ? 'realesrgan'
              : 'node'
      );
      idMap.set(sourceItem.id, nextCanvasId);
      const nextItem: CanvasImageItem = {
        ...cloneDrawerValue(sourceItem),
        id: nextCanvasId,
        x: Math.max(24, sourceItem.x + offsetX + (targetPoint ? 0 : index * 6)),
        y: Math.max(24, sourceItem.y + offsetY + (targetPoint ? 0 : index * 6)),
        item: {
          ...cloneDrawerValue(sourceItem.item),
          id: nextBufferId,
          createdAt: Date.now() + index,
        },
        ai: sourceItem.ai ? cloneCanvasAiForPaste(sourceItem.ai) : undefined,
      };
      return nextItem;
    });

    const nextItemsWithRemappedGroups = remapCanvasGroupsForPaste(
      nextItems,
      () => `canvas_group_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    );
    const remappedItems = nextItemsWithRemappedGroups.map(item => ({
      ...item,
      inputs: (item.inputs || [])
        .map(inputId => idMap.get(inputId))
        .filter((inputId): inputId is string => !!inputId),
      threeScene: item.threeScene
        ? {
          ...item.threeScene,
          sourceImageId: idMap.get(item.threeScene.sourceImageId) || item.threeScene.sourceImageId,
          sourceImageIds: (item.threeScene.sourceImageIds || [item.threeScene.sourceImageId])
            .map(sourceId => idMap.get(sourceId) || sourceId)
            .filter(Boolean),
        }
        : undefined,
    }));

    const addedCount = appendCanvasItems(remappedItems, label);
    if (addedCount > 0) showToast(`已粘贴 ${addedCount} 个画布元素`);
    return addedCount;

};

export const shiftCanvasWorldImpl = (ctx: Pick<canvasMediaActionContext, 'canvasDragRef' | 'canvasGroupResizeRef' | 'canvasResizeRef' | 'canvasScaleRef' | 'canvasSelectionDragRef' | 'hideCanvasSelectionOverlay' | 'updateCanvasItemsImmediate'>, deltaX: number, deltaY: number) => {
  const { canvasDragRef, canvasGroupResizeRef, canvasResizeRef, canvasScaleRef, canvasSelectionDragRef, hideCanvasSelectionOverlay, updateCanvasItemsImmediate } = ctx;
    if (deltaX === 0 && deltaY === 0) return;

    updateCanvasItemsImmediate(prev => prev.map(item => ({
      ...item,
      x: item.x + deltaX,
      y: item.y + deltaY,
    })));

    const drag = canvasDragRef.current;
    if (drag) {
      Object.values(drag.startItems).forEach(item => {
        item.x += deltaX;
        item.y += deltaY;
      });
      const scale = canvasScaleRef.current || 1;
      drag.startScrollLeft += deltaX * scale;
      drag.startScrollTop += deltaY * scale;
    }

    const resize = canvasResizeRef.current;
    if (resize) {
      resize.startX += deltaX;
      resize.startY += deltaY;
    }

    const groupResize = canvasGroupResizeRef.current;
    if (groupResize) {
      groupResize.startBounds.x += deltaX;
      groupResize.startBounds.y += deltaY;
      Object.values(groupResize.startItems).forEach(item => {
        item.x += deltaX;
        item.y += deltaY;
      });
    }

    const selection = canvasSelectionDragRef.current;
    if (selection) {
      selection.startX += deltaX;
      selection.startY += deltaY;
    }

    hideCanvasSelectionOverlay();

};

export const expandCanvasBeforeViewportImpl = (ctx: Pick<canvasMediaActionContext, 'canvasPanRef' | 'canvasScaleRef' | 'canvasSizeRef' | 'canvasSurfaceRef' | 'setCanvasSizeImmediate' | 'shiftCanvasWorld' | 'writeCanvasSurfaceScroll'>, left: number, top: number) => {
  const { canvasPanRef, canvasScaleRef, canvasSizeRef, canvasSurfaceRef, setCanvasSizeImmediate, shiftCanvasWorld, writeCanvasSurfaceScroll } = ctx;
    if (left <= 0 && top <= 0) return;
    const current = canvasSizeRef.current;
    setCanvasSizeImmediate({
      width: current.width + left,
      height: current.height + top,
    });
    shiftCanvasWorld(left, top);

    const surface = canvasSurfaceRef.current;
    if (surface) {
      const scale = canvasScaleRef.current || 1;
      const pan = canvasPanRef.current;
      if (pan) {
        pan.startScrollLeft += left * scale;
        pan.startScrollTop += top * scale;
      }
      writeCanvasSurfaceScroll(surface, surface.scrollLeft + left * scale, surface.scrollTop + top * scale);
    }

};

export const autoScrollCanvasNearEdgeImpl = (ctx: Pick<canvasMediaActionContext, 'canvasInteractionSurfaceRectRef' | 'canvasPanRef' | 'canvasScaleRef' | 'canvasSurfaceRef' | 'expandCanvasBeforeViewport' | 'growCanvasToFit' | 'isCanvasInteractingRef' | 'writeCanvasSurfaceScroll'>, event: { clientX: number; clientY: number }) => {
  const { canvasInteractionSurfaceRectRef, canvasPanRef, canvasScaleRef, canvasSurfaceRef, expandCanvasBeforeViewport, growCanvasToFit, isCanvasInteractingRef, writeCanvasSurfaceScroll } = ctx;
    const surface = canvasSurfaceRef.current;
    if (!surface) return;
    const rect = canvasInteractionSurfaceRectRef.current || surface.getBoundingClientRect();
    const getEdgeDelta = (position: number, start: number, end: number) => {
      const maxDelta = CANVAS_EDGE_AUTOSCROLL_SPEED * 0.42;
      if (position > end - CANVAS_EDGE_AUTOSCROLL_MARGIN) {
        const intensity = clamp((position - (end - CANVAS_EDGE_AUTOSCROLL_MARGIN)) / CANVAS_EDGE_AUTOSCROLL_MARGIN, 0, 1);
        return maxDelta * intensity * intensity;
      }
      if (position < start + CANVAS_EDGE_AUTOSCROLL_MARGIN) {
        const intensity = clamp(((start + CANVAS_EDGE_AUTOSCROLL_MARGIN) - position) / CANVAS_EDGE_AUTOSCROLL_MARGIN, 0, 1);
        return -maxDelta * intensity * intensity;
      }
      return 0;
    };

    const deltaX = getEdgeDelta(event.clientX, rect.left, rect.right);
    const deltaY = getEdgeDelta(event.clientY, rect.top, rect.bottom);

    if (deltaX === 0 && deltaY === 0) return;

    const scale = canvasScaleRef.current || 1;
    const canShiftWorldNow = !isCanvasInteractingRef.current && !canvasPanRef.current;
    const growLeft = canShiftWorldNow && deltaX < 0 && surface.scrollLeft < Math.abs(deltaX) * 1.5 ? CANVAS_GROW_CHUNK : 0;
    const growTop = canShiftWorldNow && deltaY < 0 && surface.scrollTop < Math.abs(deltaY) * 1.5 ? CANVAS_GROW_CHUNK : 0;
    if (growLeft || growTop) expandCanvasBeforeViewport(growLeft, growTop);

    const nextLeft = Math.max(0, surface.scrollLeft + deltaX);
    const nextTop = Math.max(0, surface.scrollTop + deltaY);
    const visibleRight = (nextLeft + surface.clientWidth) / scale;
    const visibleBottom = (nextTop + surface.clientHeight) / scale;
    growCanvasToFit(visibleRight + CANVAS_GROW_CHUNK * 0.8, visibleBottom + CANVAS_GROW_CHUNK * 0.8);
    writeCanvasSurfaceScroll(surface, nextLeft, nextTop);

};

export const createCanvasImageItemFromPathImpl = async (ctx: Pick<canvasMediaActionContext, 'createAssetId' | 'getCanvasDropPosition' | 'getLatestFileCacheDir' | 'makeCanvasNodeId'>, originalPath: string, index: number = 0, client?: { x: number; y: number }): Promise<CanvasImageItem | null> => {
  const { createAssetId, getCanvasDropPosition, getLatestFileCacheDir, makeCanvasNodeId } = ctx;
    let path = originalPath;
    let fileName = path.split(/[\\/]/).pop() || '画布图片';

    let kind: 'file' | 'directory' | 'missing' = 'file';
    try {
      kind = await invoke<'file' | 'directory' | 'missing'>('path_kind', { path });
    } catch (_) {
      kind = 'file';
    }
    if (kind !== 'file' || !isCanvasImageFileName(fileName)) return null;

    const originalSourcePath = path;
    const latestCacheDir = await getLatestFileCacheDir();
    try {
      const cachedPath = await invoke<string>('cache_local_file_to_dir', {
        path,
        dir: latestCacheDir || undefined,
      });
      if (cachedPath) {
        path = cachedPath;
        fileName = path.split(/[\\/]/).pop() || fileName;
      }
    } catch (err) {
      console.warn('画布图片缓存失败，保留原路径:', err);
    }

    const item: BufferItem = {
      id: createAssetId(),
      type: 'image',
      content: fileName,
      name: fileName,
      path,
      url: convertFileSrc(path),
      sourceUrl: originalSourcePath !== path ? originalSourcePath : undefined,
      originalUrl: originalSourcePath !== path ? originalSourcePath : undefined,
      createdAt: Date.now(),
      isQuickAccess: false,
    };
    const pos = getCanvasDropPosition(index, client);
    const size = await readImageDisplaySize(item.url || (item.path ? convertFileSrc(item.path) : ''));
    return {
      id: makeCanvasNodeId(item.id, 'text'),
      item,
      x: pos.x,
      y: pos.y,
      width: size.width,
      height: size.height,
    };

};

export const createCanvasVideoItemFromPathImpl = async (ctx: Pick<canvasMediaActionContext, 'createAssetId' | 'getCanvasDropPosition' | 'getLatestFileCacheDir' | 'makeCanvasNodeId'>, originalPath: string, index: number = 0, client?: { x: number; y: number }): Promise<CanvasImageItem | null> => {
  const { createAssetId, getCanvasDropPosition, getLatestFileCacheDir, makeCanvasNodeId } = ctx;
    let path = originalPath;
    let fileName = path.split(/[\\/]/).pop() || '画布视频';

    let kind: 'file' | 'directory' | 'missing' = 'file';
    try {
      kind = await invoke<'file' | 'directory' | 'missing'>('path_kind', { path });
    } catch (_) {
      kind = 'file';
    }
    if (kind !== 'file' || !isCanvasVideoFileName(fileName)) return null;

    const originalSourcePath = path;
    const latestCacheDir = await getLatestFileCacheDir();
    try {
      const cachedPath = await invoke<string>('cache_local_file_to_dir', {
        path,
        dir: latestCacheDir || undefined,
      });
      if (cachedPath) {
        path = cachedPath;
        fileName = path.split(/[\\/]/).pop() || fileName;
      }
    } catch (err) {
      console.warn('画布视频缓存失败，保留原路径:', err);
    }

    let thumbnail = '';
    try {
      thumbnail = await getVideoThumbnail(path);
    } catch (err) {
      console.warn('画布视频缩略图生成失败:', err);
    }

    const item: BufferItem = {
      id: createAssetId(),
      type: 'video',
      content: fileName,
      name: fileName,
      path,
      url: convertFileSrc(path),
      thumbnail: thumbnail || undefined,
      sourceUrl: originalSourcePath !== path ? originalSourcePath : undefined,
      originalUrl: originalSourcePath !== path ? originalSourcePath : undefined,
      createdAt: Date.now(),
      isQuickAccess: false,
    };
    const pos = getCanvasDropPosition(index, client);
    const size = thumbnail
      ? await readImageDisplaySize(thumbnail)
      : { width: 320, height: 180 };
    return {
      id: makeCanvasNodeId(item.id, 'image'),
      item,
      x: pos.x,
      y: pos.y,
      width: size.width,
      height: size.height,
    };

};

export const createCanvasAudioItemFromPathImpl = async (ctx: Pick<canvasMediaActionContext, 'createAssetId' | 'getCanvasDropPosition' | 'getLatestFileCacheDir' | 'makeCanvasNodeId'>, originalPath: string, index: number = 0, client?: { x: number; y: number }): Promise<CanvasImageItem | null> => {
  const { createAssetId, getCanvasDropPosition, getLatestFileCacheDir, makeCanvasNodeId } = ctx;
    let path = originalPath;
    let fileName = path.split(/[\\/]/).pop() || '画布音频';
    let kind: 'file' | 'directory' | 'missing' = 'file';
    try {
      kind = await invoke<'file' | 'directory' | 'missing'>('path_kind', { path });
    } catch (_) {
      kind = 'file';
    }
    if (kind !== 'file' || !isCanvasAudioFileName(fileName)) return null;

    const originalSourcePath = path;
    const latestCacheDir = await getLatestFileCacheDir();
    try {
      const cachedPath = await invoke<string>('cache_local_file_to_dir', {
        path,
        dir: latestCacheDir || undefined,
      });
      if (cachedPath) {
        path = cachedPath;
        fileName = path.split(/[\\/]/).pop() || fileName;
      }
    } catch (err) {
      console.warn('画布音频缓存失败，保留原路径:', err);
    }

    const item: BufferItem = {
      id: createAssetId(),
      type: 'file',
      content: fileName,
      name: fileName,
      path,
      url: convertFileSrc(path),
      sourceUrl: originalSourcePath !== path ? originalSourcePath : undefined,
      originalUrl: originalSourcePath !== path ? originalSourcePath : undefined,
      createdAt: Date.now(),
      isQuickAccess: false,
    };
    const pos = getCanvasDropPosition(index, client);
    return {
      id: makeCanvasNodeId(item.id, 'audio'),
      item,
      x: pos.x,
      y: pos.y,
      width: 320,
      height: 92,
    };

};

export const addCanvasTextItemImpl = (ctx: Pick<canvasMediaActionContext, 'appendCanvasItems' | 'createAssetId' | 'getCanvasDropPosition' | 'makeCanvasNodeId' | 'showToast'>, client?: { x: number; y: number }) => {
  const { appendCanvasItems, createAssetId, getCanvasDropPosition, makeCanvasNodeId, showToast } = ctx;
    const pos = getCanvasDropPosition(0, client);
    const item: BufferItem = {
      id: createAssetId(),
      type: 'text',
      content: '',
      name: '文字卡片',
      createdAt: Date.now(),
      isQuickAccess: false,
    };
    const canvasId = makeCanvasNodeId(item.id, 'text');
    const canvasItem = {
      id: canvasId,
      item,
      x: pos.x,
      y: pos.y,
      width: 560,
      height: 520,
    };
    if (appendCanvasItems([canvasItem], '新增文字卡片') > 0) {
      showToast('已添加文字卡片');
    }

};

export const addCanvasTextItemAtWorldImpl = (ctx: Pick<canvasMediaActionContext, 'appendCanvasItems' | 'createAssetId' | 'makeCanvasNodeId' | 'showToast'>, world: { x: number; y: number }) => {
  const { appendCanvasItems, createAssetId, makeCanvasNodeId, showToast } = ctx;
    const item: BufferItem = {
      id: createAssetId(),
      type: 'text',
      content: '',
      name: '文字卡片',
      createdAt: Date.now(),
      isQuickAccess: false,
    };
    const canvasItem = {
      id: makeCanvasNodeId(item.id, 'text'),
      item,
      x: Math.max(24, world.x),
      y: Math.max(24, world.y),
      width: 560,
      height: 520,
    };
    if (appendCanvasItems([canvasItem], '新增文字卡片') > 0) {
      showToast('已添加文字卡片');
    }

};

export const createCanvasTextItemFromContentImpl = (ctx: Pick<canvasMediaActionContext, 'createAssetId' | 'getCanvasDropPosition' | 'makeCanvasNodeId'>, content: string, index: number = 0, client?: { x: number; y: number }): CanvasImageItem | null => {
  const { createAssetId, getCanvasDropPosition, makeCanvasNodeId } = ctx;
    const normalized = String(content || '').replace(/\r\n?/g, '\n').trimEnd();
    if (!normalized.trim()) return null;
    const title = normalized.trim().split(/\n/)[0]?.slice(0, 32) || '剪贴板文字';
    const lines = normalized.split('\n');
    const longestLine = Math.max(4, ...lines.map(line => Array.from(line).length));
    const pos = getCanvasDropPosition(index, client);
    const item: BufferItem = {
      id: createAssetId(),
      type: 'text',
      content: normalized,
      name: title,
      createdAt: Date.now(),
      isQuickAccess: false,
    };
    return {
      id: makeCanvasNodeId(item.id, 'text'),
      item,
      x: pos.x,
      y: pos.y,
      width: clamp(longestLine * 7 + 96, 520, 760),
      height: clamp(lines.length * 20 + 260, 420, 680),
    };

};

export const getCanvasClipboardImageFilesImpl = (ctx: Record<never, never>, clipboardData: DataTransfer) => {
  const {  } = ctx;
    const files = Array.from(clipboardData.files || []).filter(file => (
      file.type.startsWith('image/') || isCanvasImageFileName(file.name)
    ));
    if (files.length > 0) return files;

    return Array.from(clipboardData.items || [])
      .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter((file): file is File => !!file);

};

export const pasteSystemClipboardToCanvasImpl = async (ctx: Pick<canvasMediaActionContext, 'appendCanvasItems' | 'createCanvasImageItemFromFile' | 'createCanvasTextItemFromContent' | 'getCanvasClipboardImageFiles' | 'showToast'>, clipboardData: DataTransfer, client?: { x: number; y: number }) => {
  const { appendCanvasItems, createCanvasImageItemFromFile, createCanvasTextItemFromContent, getCanvasClipboardImageFiles, showToast } = ctx;
    const imageFiles = getCanvasClipboardImageFiles(clipboardData);
    const text = imageFiles.length > 0 ? '' : clipboardData.getData('text/plain') || '';
    if (imageFiles.length === 0 && !text.trim()) return false;

    const createdImages = await Promise.all(imageFiles.map((file, index) => createCanvasImageItemFromFile(file, index, client)));
    const images = createdImages.filter((item): item is CanvasImageItem => !!item);
    const textItem = createCanvasTextItemFromContent(text, images.length, client);
    const nextItems = textItem ? [...images, textItem] : images;
    if (nextItems.length === 0) return false;

    const addedCount = appendCanvasItems(nextItems, '粘贴剪贴板内容');
    if (addedCount > 0) {
      const parts = [
        images.length > 0 ? `${images.length} 张图片` : '',
        textItem ? '1 段文字' : '',
      ].filter(Boolean).join('、');
      showToast(`已粘贴${parts ? ` ${parts}` : '剪贴板内容'}到画布`);
    }
    return addedCount > 0;

};

export const updateCanvasTextItemImpl = (ctx: Pick<canvasMediaActionContext, 'canvasItemsPatchCommitRef' | 'scheduleCanvasChangedNodesPatchSave' | 'updateCanvasItemsImmediate'>, canvasId: string, content: string) => {
  const { canvasItemsPatchCommitRef, scheduleCanvasChangedNodesPatchSave, updateCanvasItemsImmediate } = ctx;
    canvasItemsPatchCommitRef.current = true;
    updateCanvasItemsImmediate(prev => prev.map(canvasItem => (
      canvasItem.id === canvasId
        ? {
          ...canvasItem,
          item: {
            ...canvasItem.item,
            content,
            name: content.trim().split(/\r?\n/)[0]?.slice(0, 24) || '文字卡片',
          },
        }
        : canvasItem
    )));
    scheduleCanvasChangedNodesPatchSave([canvasId]);

};

export const updateCanvasTextOutputItemImpl = (ctx: Pick<canvasMediaActionContext, 'canvasItemsPatchCommitRef' | 'scheduleCanvasChangedNodesPatchSave' | 'updateCanvasItemsImmediate'>, canvasId: string, output: string) => {
  const { canvasItemsPatchCommitRef, scheduleCanvasChangedNodesPatchSave, updateCanvasItemsImmediate } = ctx;
    canvasItemsPatchCommitRef.current = true;
    updateCanvasItemsImmediate(prev => prev.map(canvasItem => (
      canvasItem.id === canvasId
        ? {
          ...canvasItem,
          item: {
            ...canvasItem.item,
            remark: output,
          },
        }
        : canvasItem
    )));
    scheduleCanvasChangedNodesPatchSave([canvasId]);

};

export const setCanvasDesignAgentConfigImpl = (ctx: Pick<canvasMediaActionContext, 'canvasItemsRef' | 'pushCanvasUndoSnapshot' | 'updateCanvasItemsImmediate'>, canvasId: string, config: DesignAgentConfig) => {
  const { canvasItemsRef, pushCanvasUndoSnapshot, updateCanvasItemsImmediate } = ctx;
    const normalized = normalizeDesignAgentConfig(config);
    const current = canvasItemsRef.current.find(item => item.id === canvasId);
    if (!current || !isCanvasAgentTextTarget(current)) return;
    const previous = normalizeDesignAgentConfig(current.designAgentConfig);
    if (
      previous.agentRole === normalized.agentRole
      && previous.outputArtifactType === normalized.outputArtifactType
      && previous.thinkingMode === normalized.thinkingMode
    ) return;
    pushCanvasUndoSnapshot('更新 Design Agent 配置');
    updateCanvasItemsImmediate(items => items.map(item => (
      item.id === canvasId && isCanvasAgentTextTarget(item)
        ? { ...item, designAgentConfig: normalized }
        : item
    )));

};

export const setCanvasTextContextRoutingImpl = (ctx: Pick<canvasMediaActionContext, 'canvasItemsRef' | 'pushCanvasUndoSnapshot' | 'showToast' | 'updateCanvasItemsImmediate'>, canvasId: string, mode: 'full' | 'auto') => {
  const { canvasItemsRef, pushCanvasUndoSnapshot, showToast, updateCanvasItemsImmediate } = ctx;
    const current = canvasItemsRef.current.find(item => item.id === canvasId);
    if (!current || !isCanvasAgentTextTarget(current)) return;
    const contextRouting = mode === 'auto' ? 'auto' as const : undefined;
    if (current.contextRouting === contextRouting) return;
    pushCanvasUndoSnapshot(mode === 'auto' ? '开启 Agent 下游上下文自动分流' : '关闭 Agent 下游上下文自动分流');
    updateCanvasItemsImmediate(items => items.map(item => (
      item.id === canvasId && isCanvasAgentTextTarget(item)
        ? { ...item, contextRouting }
        : item
    )));
    showToast(mode === 'auto'
      ? '已开启自动分流，连接下游生图节点后生效'
      : '已改为向下游传递完整 Agent 输出');

};

export const commitCanvasTextDraftImpl = (ctx: Pick<canvasMediaActionContext, 'canvasItemsRef' | 'canvasTextDraftTimersRef' | 'canvasTextDraftValuesRef' | 'updateCanvasTextItem'>, canvasId: string, content?: string, sync: boolean = false) => {
  const { canvasItemsRef, canvasTextDraftTimersRef, canvasTextDraftValuesRef, updateCanvasTextItem } = ctx;
    const nextContent = content ?? canvasTextDraftValuesRef.current[canvasId];
    if (nextContent === undefined) return;
    const timer = canvasTextDraftTimersRef.current[canvasId];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete canvasTextDraftTimersRef.current[canvasId];
    }
    delete canvasTextDraftValuesRef.current[canvasId];
    const current = canvasItemsRef.current.find(item => item.id === canvasId);
    if (!current) return;
    if ((current?.item.content || '') === nextContent) return;
    const commit = () => updateCanvasTextItem(canvasId, nextContent);
    if (sync) flushSync(commit);
    else commit();

};

export const commitCanvasTextOutputDraftImpl = (ctx: Pick<canvasMediaActionContext, 'canvasItemsRef' | 'canvasTextOutputDraftTimersRef' | 'canvasTextOutputDraftValuesRef' | 'updateCanvasTextOutputItem'>, canvasId: string, output?: string, sync: boolean = false) => {
  const { canvasItemsRef, canvasTextOutputDraftTimersRef, canvasTextOutputDraftValuesRef, updateCanvasTextOutputItem } = ctx;
    const nextOutput = output ?? canvasTextOutputDraftValuesRef.current[canvasId];
    if (nextOutput === undefined) return;
    const timer = canvasTextOutputDraftTimersRef.current[canvasId];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete canvasTextOutputDraftTimersRef.current[canvasId];
    }
    delete canvasTextOutputDraftValuesRef.current[canvasId];
    const current = canvasItemsRef.current.find(item => item.id === canvasId);
    if (!current) return;
    if ((current.item.remark || '') === nextOutput) return;
    const commit = () => updateCanvasTextOutputItem(canvasId, nextOutput);
    if (sync) flushSync(commit);
    else commit();

};

export const copyCanvasTextOutputImpl = async (ctx: Pick<canvasMediaActionContext, 'canvasItemsRef' | 'canvasTextOutputAreaRefs' | 'showToast'>, canvasId: string) => {
  const { canvasItemsRef, canvasTextOutputAreaRefs, showToast } = ctx;
    const output = (canvasTextOutputAreaRefs.current[canvasId]?.value
      ?? canvasItemsRef.current.find(item => item.id === canvasId)?.item.remark
      ?? '').trim();
    if (!output) {
      showToast('还没有可复制的生成结果');
      return;
    }
    try {
      await navigator.clipboard.writeText(output);
      showToast('已复制生成文本');
    } catch (error) {
      console.warn('复制文字节点结果失败:', error);
      showToast('复制失败');
    }

};

export const imageSourceToDataUrlImpl = async (ctx: Pick<canvasMediaActionContext, 'generatedImageCachePromisesRef'>, source: string, optimizeForAi: boolean = false) => {
  const { generatedImageCachePromisesRef } = ctx;
    if (!source) return '';
    if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(source)) {
      return optimizeForAi ? optimizeCanvasAiInputDataUrl(source) : source;
    }

    if (source.includes('asset.localhost') || /^asset:/i.test(source)) {
      const dataUrl = await invoke<string>('read_local_image_data_url', { path: source });
      return optimizeForAi ? optimizeCanvasAiInputDataUrl(dataUrl) : dataUrl;
    }

    const isLocalFilePath = !/^(?:https?:|data:|asset:)/i.test(source)
      && !source.includes('asset.localhost');
    if (isLocalFilePath) {
      const dataUrl = await invoke<string>('read_local_image_data_url', { path: source });
      return optimizeForAi ? optimizeCanvasAiInputDataUrl(dataUrl) : dataUrl;
    }

    let readableSource = source;
    if (/^https?:\/\//i.test(source)) {
      try {
        const cachedPath = await (
          generatedImageCachePromisesRef.current.get(source)
          || invoke<string>('cache_web_image', {
            url: source,
            name: 'local-vision-reference',
          })
        );
        if (cachedPath) readableSource = convertFileSrc(cachedPath);
      } catch (err) {
        console.warn('缓存本地模型参考图失败，尝试直接读取:', err);
      }
    }

    const response = await fetch(readableSource);
    if (!response.ok) throw new Error('读取参考图失败');
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error('参考图不是可用图片');
    const dataUrl = await blobToDataUrl(blob);
    return optimizeForAi ? optimizeCanvasAiInputDataUrl(dataUrl) : dataUrl;

};

export const copyImageDataUrlToSystemClipboardImpl = async (ctx: Record<never, never>, dataUrl: string) => {
  const {  } = ctx;
    if (!/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(dataUrl)) {
      throw new Error('invalid image data url');
    }
    let backendError: unknown = null;
    let pluginError: unknown = null;
    let browserError: unknown = null;

    try {
      await invoke('copy_image', { dataUrl });
      return;
    } catch (err) {
      backendError = err;
      console.warn('backend copy canvas image failed:', err);
    }

    let pngDataUrl = '';
    try {
      pngDataUrl = await imageDataUrlToPngDataUrl(dataUrl);
    } catch (err) {
      console.warn('canvas image PNG conversion failed:', err);
      throw err || backendError;
    }

    try {
      await writeImageSourceToClipboard(pngDataUrl);
      return;
    } catch (err) {
      pluginError = err;
      console.warn('clipboard-manager copy canvas image failed:', err);
    }

    try {
      const blob = await dataUrlToBlob(pngDataUrl);
      const ClipboardItemCtor = (window as any).ClipboardItem;
      if (!navigator.clipboard || !ClipboardItemCtor) throw new Error('ClipboardItem unavailable');
      await navigator.clipboard.write([
        new ClipboardItemCtor({ 'image/png': blob })
      ]);
      return;
    } catch (err) {
      browserError = err;
      console.warn('browser clipboard canvas image copy failed:', err);
    }

    throw backendError || pluginError || browserError || new Error('copy canvas image failed');

};

export const copyImageSourceToSystemClipboardImpl = async (ctx: Pick<canvasMediaActionContext, 'copyImageDataUrlToSystemClipboard' | 'imageSourceToDataUrl' | 'shouldTryBackendImageCopyDirectly'>, source: string) => {
  const { copyImageDataUrlToSystemClipboard, imageSourceToDataUrl, shouldTryBackendImageCopyDirectly } = ctx;
    let backendError: unknown = null;
    let dataUrlError: unknown = null;

    if (await writeLocalImageFileToClipboard(source)) {
      return;
    }

    if (shouldTryBackendImageCopyDirectly(source)) {
      try {
        await invoke('copy_image', { dataUrl: source });
        return;
      } catch (err) {
        backendError = err;
        console.warn('backend copy canvas image source failed:', err);
      }
    }

    try {
      const dataUrl = await imageSourceToDataUrl(source, false);
      await copyImageDataUrlToSystemClipboard(dataUrl);
      return;
    } catch (err) {
      dataUrlError = err;
      console.warn('copy canvas image source via data url failed:', err);
    }

    throw dataUrlError || backendError || new Error('copy image source failed');

};

export const copySelectedImagePreviewToClipboardImpl = async (ctx: Pick<canvasMediaActionContext, 'copyImageSourceToSystemClipboard' | 'selectedImage' | 'showToast'>) => {
  const { copyImageSourceToSystemClipboard, selectedImage, showToast } = ctx;
    const source = String(selectedImage || '').trim();
    if (!source) {
      showToast('没有可复制的预览图片');
      return false;
    }

    try {
      await copyImageSourceToSystemClipboard(source);
      showToast('图片已复制，可粘贴到微信等程序');
      return true;
    } catch (err) {
      console.warn('copy selected image preview failed:', err);
      showToast('图片复制失败');
      return false;
    }

};

export const copyCanvasImageToSystemClipboardImpl = async (ctx: Pick<canvasMediaActionContext, 'copyImageSourceToSystemClipboard' | 'showToast'>, canvasItem?: CanvasImageItem | null, options: { successToast?: string; missingToast?: string; failureToast?: string } = {}) => {
  const { copyImageSourceToSystemClipboard, showToast } = ctx;
    if (!canvasItem || canvasItem.item.type !== 'image') {
      showToast(options.missingToast || '请选择画布里的图片');
      return false;
    }

    const source = canvasItem.item.path || getCanvasItemDisplaySource(canvasItem.item);
    if (!source) {
      showToast(options.missingToast || '这张图片没有可复制的来源');
      return false;
    }

    try {
      await copyImageSourceToSystemClipboard(source);
      showToast(options.successToast || '图片已复制，可粘贴到微信等程序');
      return true;
    } catch (err) {
      console.warn('copy canvas image to system clipboard failed:', err);
      showToast(options.failureToast || '图片复制失败');
      return false;
    }

};

export const copyCanvasItemsToAvailableClipboardsImpl = async (ctx: Pick<canvasMediaActionContext, 'copyCanvasImageToSystemClipboard' | 'copyCanvasItems' | 'getCopyableCanvasImageFromIds'>, ids: string[]) => {
  const { copyCanvasImageToSystemClipboard, copyCanvasItems, getCopyableCanvasImageFromIds } = ctx;
    const imageTarget = ids.length === 1 ? getCopyableCanvasImageFromIds(ids) : null;
    const copiedCount = copyCanvasItems(ids, { showToast: !imageTarget });
    if (copiedCount === 0) return false;
    if (!imageTarget) return true;
    return copyCanvasImageToSystemClipboard(imageTarget, {
      successToast: '已复制，可在画布或微信等程序粘贴',
      failureToast: '已复制到画布，系统图片剪贴板写入失败',
    });

};

export const drawCanvasBrushEditorBaseImpl = async (ctx: Pick<canvasMediaActionContext, 'canvasBrushBaseCanvasRef' | 'canvasBrushCanvasRef' | 'canvasBrushPendingMarksRef' | 'loadCanvasBrushImage' | 'setCanvasBrushEditor' | 'setCanvasBrushHistory' | 'setCanvasBrushRedoHistory' | 'showToast'>, editor: CanvasBrushEditorState | null) => {
  const { canvasBrushBaseCanvasRef, canvasBrushCanvasRef, canvasBrushPendingMarksRef, loadCanvasBrushImage, setCanvasBrushEditor, setCanvasBrushHistory, setCanvasBrushRedoHistory, showToast } = ctx;
    const canvas = canvasBrushCanvasRef.current;
    const baseCanvas = canvasBrushBaseCanvasRef.current;
    if (!canvas || !editor) return;
    const canvasContext = canvas.getContext('2d');
    if (!canvasContext) return;
    canvas.width = editor.width;
    canvas.height = editor.height;
    canvasContext.clearRect(0, 0, editor.width, editor.height);
    if (baseCanvas) {
      baseCanvas.width = editor.width;
      baseCanvas.height = editor.height;
    }
    try {
      const image = await loadCanvasBrushImage(editor.baseDataUrl);
      const baseCtx = baseCanvas?.getContext('2d');
      if (baseCtx) {
        baseCtx.clearRect(0, 0, editor.width, editor.height);
        baseCtx.fillStyle = '#ffffff';
        baseCtx.fillRect(0, 0, editor.width, editor.height);
        baseCtx.imageSmoothingEnabled = true;
        baseCtx.imageSmoothingQuality = 'high';
        baseCtx.drawImage(image, 0, 0, editor.width, editor.height);
      }
      canvasContext.clearRect(0, 0, editor.width, editor.height);
      const pendingMarks = canvasBrushPendingMarksRef.current;
      canvasBrushPendingMarksRef.current = null;
      if (pendingMarks) {
        try {
          const marksImage = await loadCanvasBrushImage(pendingMarks);
          canvasContext.drawImage(marksImage, 0, 0, editor.width, editor.height);
        } catch (err) {
          console.warn('恢复裁剪标记层失败:', err);
        }
      }
      setCanvasBrushHistory([canvas.toDataURL('image/png')]);
      setCanvasBrushRedoHistory([]);
    } catch (err) {
      console.warn('画笔编辑器加载图片失败:', err);
      showToast('图片加载失败，无法编辑');
      setCanvasBrushEditor(null);
    }

};

export const openCanvasBrushEditorFromSourceImpl = async (ctx: Pick<canvasMediaActionContext, 'CANVAS_BRUSH_EDITOR_MAX_EDGE' | 'canvasBrushCanvasRef' | 'canvasBrushCropStartRef' | 'canvasBrushOpenRequestRef' | 'canvasBrushPendingMarksRef' | 'canvasBrushShapeSnapshotRef' | 'canvasBrushShapeStartRef' | 'canvasItemsRef' | 'hideCanvasBrushCursor' | 'imageSourceToDataUrl' | 'keepDrawerOpenByPointer' | 'loadCanvasBrushImage' | 'setCanvasBrushCropRect' | 'setCanvasBrushEditor' | 'setCanvasBrushHistory' | 'setCanvasBrushMode' | 'setCanvasBrushRedoHistory' | 'setCanvasContextMenu' | 'setCanvasInputMenuForId' | 'updateCanvasSelection'>, options: CanvasBrushEditorOpenOptions) => {
  const { CANVAS_BRUSH_EDITOR_MAX_EDGE, canvasBrushCanvasRef, canvasBrushCropStartRef, canvasBrushOpenRequestRef, canvasBrushPendingMarksRef, canvasBrushShapeSnapshotRef, canvasBrushShapeStartRef, canvasItemsRef, hideCanvasBrushCursor, imageSourceToDataUrl, keepDrawerOpenByPointer, loadCanvasBrushImage, setCanvasBrushCropRect, setCanvasBrushEditor, setCanvasBrushHistory, setCanvasBrushMode, setCanvasBrushRedoHistory, setCanvasContextMenu, setCanvasInputMenuForId, updateCanvasSelection } = ctx;
    const { targetId, source, name, x, y, nodeWidth, nodeHeight } = options;
    const requestId = canvasBrushOpenRequestRef.current + 1;
    canvasBrushOpenRequestRef.current = requestId;
    setCanvasContextMenu(null);
    setCanvasInputMenuForId(null);
    if (canvasItemsRef.current.some(item => item.id === targetId)) {
      updateCanvasSelection([targetId]);
    }
    const initialWidth = Math.max(1, Math.round(nodeWidth));
    const initialHeight = Math.max(1, Math.round(nodeHeight));
    const initialScale = Math.min(1, CANVAS_BRUSH_EDITOR_MAX_EDGE / Math.max(initialWidth, initialHeight));
    const immediateWidth = Math.max(1, Math.round(initialWidth * initialScale));
    const immediateHeight = Math.max(1, Math.round(initialHeight * initialScale));

    setCanvasBrushEditor({
      targetId,
      source,
      baseDataUrl: source,
      name: name || '画布图片',
      x,
      y,
      nodeWidth,
      nodeHeight,
      width: immediateWidth,
      height: immediateHeight,
    });
    setCanvasBrushMode('brush');
    setCanvasBrushHistory([]);
    setCanvasBrushRedoHistory([]);
    setCanvasBrushCropRect(null);
    hideCanvasBrushCursor();
    canvasBrushCropStartRef.current = null;
    canvasBrushShapeStartRef.current = null;
    canvasBrushShapeSnapshotRef.current = null;
    canvasBrushPendingMarksRef.current = null;
    keepDrawerOpenByPointer();

    try {
      const baseDataUrl = await imageSourceToDataUrl(source, false);
      const image = await loadCanvasBrushImage(baseDataUrl);
      if (canvasBrushOpenRequestRef.current !== requestId) return;
      const naturalWidth = image.naturalWidth || image.width || Math.round(nodeWidth);
      const naturalHeight = image.naturalHeight || image.height || Math.round(nodeHeight);
      const scale = Math.min(1, CANVAS_BRUSH_EDITOR_MAX_EDGE / Math.max(naturalWidth, naturalHeight));
      const width = Math.max(1, Math.round(naturalWidth * scale));
      const height = Math.max(1, Math.round(naturalHeight * scale));

      const marksCanvas = canvasBrushCanvasRef.current;
      if (marksCanvas) {
        try {
          canvasBrushPendingMarksRef.current = marksCanvas.toDataURL('image/png');
        } catch (err) {
          console.warn('暂存涂鸦标记失败:', err);
        }
      }

      setCanvasBrushEditor(prev => {
        if (!prev || prev.targetId !== targetId || prev.source !== source) return prev;
        return {
          ...prev,
          baseDataUrl,
          width,
          height,
        };
      });
    } catch (err) {
      console.warn('校准画笔编辑器图片失败，保留即时预览:', err);
    }

};

export const openCanvasBrushEditorImpl = async (ctx: Pick<canvasMediaActionContext, 'canvasItemsRef' | 'openCanvasBrushEditorFromSource' | 'showToast'>, targetId: string) => {
  const { canvasItemsRef, openCanvasBrushEditorFromSource, showToast } = ctx;
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!target || target.item.type !== 'image') {
      showToast('请选择画布里的图片进行标记');
      return;
    }

    const source = getCanvasItemDisplaySource(target.item);
    if (!source) {
      showToast('这张图片没有可编辑的来源');
      return;
    }

    await openCanvasBrushEditorFromSource({
      targetId: target.id,
      source,
      name: target.item.name || target.item.content || '画布图片',
      x: target.x,
      y: target.y,
      nodeWidth: target.width,
      nodeHeight: target.height,
    });

};

export const updateCanvasBrushCursorFromEventImpl = (ctx: Pick<canvasMediaActionContext, 'canvasBrushCanvasRef' | 'canvasBrushMode' | 'hideCanvasBrushCursor' | 'updateCanvasBrushCursor'>, event: React.PointerEvent<Element>) => {
  const { canvasBrushCanvasRef, canvasBrushMode, hideCanvasBrushCursor, updateCanvasBrushCursor } = ctx;
    const canvas = canvasBrushCanvasRef.current;
    if (!canvas || (canvasBrushMode !== 'brush' && canvasBrushMode !== 'eraser')) {
      hideCanvasBrushCursor();
      return;
    }
    const rect = canvas.getBoundingClientRect();
    updateCanvasBrushCursor({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      scale: rect.width / Math.max(1, canvas.width),
    });

};

export const paintCanvasBrushStrokeImpl = (ctx: Pick<canvasMediaActionContext, 'canvasBrushCanvasRef' | 'canvasBrushColor' | 'canvasBrushMode' | 'canvasBrushOpacity' | 'canvasBrushSize'>, from: CanvasBrushPoint, to: CanvasBrushPoint) => {
  const { canvasBrushCanvasRef, canvasBrushColor, canvasBrushMode, canvasBrushOpacity, canvasBrushSize } = ctx;
    const canvas = canvasBrushCanvasRef.current;
    const canvasContext = canvas?.getContext('2d');
    if (!canvas || !canvasContext) return;
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    canvasContext.save();
    canvasContext.lineCap = 'round';
    canvasContext.lineJoin = 'round';
    if (canvasBrushMode === 'eraser') {
      canvasContext.lineWidth = canvasBrushSize;
      canvasContext.globalAlpha = 1;
      canvasContext.globalCompositeOperation = 'destination-out';
      canvasContext.strokeStyle = 'rgba(0,0,0,1)';
      canvasContext.fillStyle = 'rgba(0,0,0,1)';
    } else {
      canvasContext.lineWidth = canvasBrushSize;
      canvasContext.globalAlpha = canvasBrushOpacity;
      canvasContext.globalCompositeOperation = 'source-over';
      canvasContext.strokeStyle = canvasBrushColor;
      canvasContext.fillStyle = canvasBrushColor;
    }
    const radius = canvasContext.lineWidth / 2;
    if (distance < 0.5) {
      canvasContext.beginPath();
      canvasContext.arc(to.x, to.y, radius, 0, Math.PI * 2);
      canvasContext.fill();
    } else {
      canvasContext.beginPath();
      canvasContext.moveTo(from.x, from.y);
      canvasContext.lineTo(to.x, to.y);
      canvasContext.stroke();
    }
    canvasContext.restore();

};

export const getCanvasBrushShapeBoxImpl = (ctx: Pick<canvasMediaActionContext, 'canvasBrushSize'>, mode: CanvasBrushShapeMode, from: CanvasBrushPoint, to: CanvasBrushPoint) => {
  const { canvasBrushSize } = ctx;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) {
      const size = Math.max(16, canvasBrushSize);
      const height = mode === 'ellipse' ? size * 0.62 : size;
      return {
        x: from.x - size / 2,
        y: from.y - height / 2,
        width: size,
        height,
      };
    }

    if (mode === 'circle') {
      const size = Math.max(1, Math.min(Math.abs(dx), Math.abs(dy)));
      return {
        x: dx >= 0 ? from.x : from.x - size,
        y: dy >= 0 ? from.y : from.y - size,
        width: size,
        height: size,
      };
    }

    const x = Math.min(from.x, to.x);
    const y = Math.min(from.y, to.y);
    const width = Math.max(1, Math.abs(dx));
    const height = Math.max(1, Math.abs(dy));
    return { x, y, width, height };

};

export const paintCanvasBrushShapeImpl = (ctx: Pick<canvasMediaActionContext, 'canvasBrushCanvasRef' | 'canvasBrushColor' | 'canvasBrushOpacity' | 'getCanvasBrushShapeBox'>, mode: CanvasBrushShapeMode, from: CanvasBrushPoint, to: CanvasBrushPoint) => {
  const { canvasBrushCanvasRef, canvasBrushColor, canvasBrushOpacity, getCanvasBrushShapeBox } = ctx;
    const canvas = canvasBrushCanvasRef.current;
    const canvasContext = canvas?.getContext('2d');
    if (!canvas || !canvasContext) return;
    const box = getCanvasBrushShapeBox(mode, from, to);
    canvasContext.save();
    canvasContext.globalAlpha = canvasBrushOpacity;
    canvasContext.globalCompositeOperation = 'source-over';
    canvasContext.fillStyle = canvasBrushColor;
    canvasContext.strokeStyle = canvasBrushColor;
    canvasContext.lineWidth = 1;

    if (mode === 'rectangle') {
      canvasContext.fillRect(box.x, box.y, box.width, box.height);
    } else {
      canvasContext.beginPath();
      canvasContext.ellipse(
        box.x + box.width / 2,
        box.y + box.height / 2,
        Math.max(0.5, box.width / 2),
        Math.max(0.5, box.height / 2),
        0,
        0,
        Math.PI * 2
      );
      canvasContext.fill();
    }
    canvasContext.restore();

};

export const normalizeCanvasBrushCropRectImpl = (ctx: Record<never, never>, from: CanvasBrushPoint, to: CanvasBrushPoint, width: number, height: number): CanvasBrushCropRect | null => {
  const {  } = ctx;
    const left = clamp(Math.min(from.x, to.x), 0, width);
    const top = clamp(Math.min(from.y, to.y), 0, height);
    const right = clamp(Math.max(from.x, to.x), 0, width);
    const bottom = clamp(Math.max(from.y, to.y), 0, height);
    const cropWidth = right - left;
    const cropHeight = bottom - top;
    if (cropWidth < 4 || cropHeight < 4) return null;
    return {
      x: Math.round(left),
      y: Math.round(top),
      width: Math.round(cropWidth),
      height: Math.round(cropHeight),
    };

};

export const pushCanvasBrushHistoryImpl = (ctx: Pick<canvasMediaActionContext, 'canvasBrushCanvasRef' | 'setCanvasBrushHistory' | 'setCanvasBrushRedoHistory'>) => {
  const { canvasBrushCanvasRef, setCanvasBrushHistory, setCanvasBrushRedoHistory } = ctx;
    const canvas = canvasBrushCanvasRef.current;
    if (!canvas) return;
    const snapshot = canvas.toDataURL('image/png');
    setCanvasBrushRedoHistory([]);
    setCanvasBrushHistory(prev => {
      const last = prev[prev.length - 1];
      if (last === snapshot) return prev;
      return [...prev, snapshot].slice(-24);
    });

};

export const applyCanvasBrushCropImpl = (ctx: Pick<canvasMediaActionContext, 'canvasBrushBaseCanvasRef' | 'canvasBrushCanvasRef' | 'canvasBrushCropRect' | 'canvasBrushEditor' | 'canvasBrushPendingMarksRef' | 'clearCanvasBrushShapeDraft' | 'setCanvasBrushCropRect' | 'setCanvasBrushEditor' | 'setCanvasBrushHistory' | 'setCanvasBrushMode' | 'setCanvasBrushRedoHistory' | 'showToast'>) => {
  const { canvasBrushBaseCanvasRef, canvasBrushCanvasRef, canvasBrushCropRect, canvasBrushEditor, canvasBrushPendingMarksRef, clearCanvasBrushShapeDraft, setCanvasBrushCropRect, setCanvasBrushEditor, setCanvasBrushHistory, setCanvasBrushMode, setCanvasBrushRedoHistory, showToast } = ctx;
    const editor = canvasBrushEditor;
    const rect = canvasBrushCropRect;
    const canvas = canvasBrushCanvasRef.current;
    const baseCanvas = canvasBrushBaseCanvasRef.current;
    if (!editor || !rect || !canvas || !baseCanvas || rect.width < 4 || rect.height < 4) return;

    const sourceMarks = document.createElement('canvas');
    sourceMarks.width = canvas.width;
    sourceMarks.height = canvas.height;
    sourceMarks.getContext('2d')?.drawImage(canvas, 0, 0);

    const sourceBase = document.createElement('canvas');
    sourceBase.width = baseCanvas.width;
    sourceBase.height = baseCanvas.height;
    sourceBase.getContext('2d')?.drawImage(baseCanvas, 0, 0);

    canvas.width = rect.width;
    canvas.height = rect.height;
    const markCtx = canvas.getContext('2d');
    markCtx?.clearRect(0, 0, rect.width, rect.height);
    markCtx?.drawImage(sourceMarks, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);

    baseCanvas.width = rect.width;
    baseCanvas.height = rect.height;
    const baseCtx = baseCanvas.getContext('2d');
    if (baseCtx) {
      baseCtx.clearRect(0, 0, rect.width, rect.height);
      baseCtx.drawImage(sourceBase, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    }

    const nextBaseDataUrl = baseCanvas.toDataURL('image/png');
    canvasBrushPendingMarksRef.current = canvas.toDataURL('image/png');
    setCanvasBrushEditor({
      ...editor,
      baseDataUrl: nextBaseDataUrl,
      width: rect.width,
      height: rect.height,
      nodeWidth: rect.width,
      nodeHeight: rect.height,
    });
    setCanvasBrushCropRect(null);
    setCanvasBrushMode('brush');
    clearCanvasBrushShapeDraft();
    setCanvasBrushHistory([canvas.toDataURL('image/png')]);
    setCanvasBrushRedoHistory([]);
    showToast('已应用裁剪');

};

export const activateCanvasBrushToolImpl = (ctx: Pick<canvasMediaActionContext, 'activateDoodleShortcutScope' | 'canvasBrushDrawingRef' | 'canvasBrushLastPointRef' | 'clearCanvasBrushCrop' | 'clearCanvasBrushShapeDraft' | 'doodleRootRef' | 'hideCanvasBrushCursor' | 'setCanvasBrushMode'>, mode: CanvasBrushEditorMode) => {
  const { activateDoodleShortcutScope, canvasBrushDrawingRef, canvasBrushLastPointRef, clearCanvasBrushCrop, clearCanvasBrushShapeDraft, doodleRootRef, hideCanvasBrushCursor, setCanvasBrushMode } = ctx;
    activateDoodleShortcutScope();
    doodleRootRef.current?.focus({ preventScroll: true });
    setCanvasBrushMode(mode);
    if (mode !== 'crop') clearCanvasBrushCrop();
    if (mode !== 'brush' && mode !== 'eraser') hideCanvasBrushCursor();
    clearCanvasBrushShapeDraft();
    canvasBrushDrawingRef.current = false;
    canvasBrushLastPointRef.current = null;

};

export const handleCanvasBrushPointerDownImpl = (ctx: Pick<canvasMediaActionContext, 'activateDoodleShortcutScope' | 'canvasBrushCanvasRef' | 'canvasBrushCropStartRef' | 'canvasBrushDrawingRef' | 'canvasBrushLastPointRef' | 'canvasBrushMode' | 'canvasBrushShapeSnapshotRef' | 'canvasBrushShapeStartRef' | 'doodleRootRef' | 'getCanvasBrushPoint' | 'isCanvasBrushShapeMode' | 'paintCanvasBrushStroke' | 'setCanvasBrushCropRect' | 'updateCanvasBrushCursorFromEvent'>, event: React.PointerEvent<HTMLCanvasElement>) => {
  const { activateDoodleShortcutScope, canvasBrushCanvasRef, canvasBrushCropStartRef, canvasBrushDrawingRef, canvasBrushLastPointRef, canvasBrushMode, canvasBrushShapeSnapshotRef, canvasBrushShapeStartRef, doodleRootRef, getCanvasBrushPoint, isCanvasBrushShapeMode, paintCanvasBrushStroke, setCanvasBrushCropRect, updateCanvasBrushCursorFromEvent } = ctx;
    event.preventDefault();
    event.stopPropagation();
    activateDoodleShortcutScope();
    doodleRootRef.current?.focus({ preventScroll: true });
    updateCanvasBrushCursorFromEvent(event);
    const canvas = canvasBrushCanvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture?.(event.pointerId);
    const point = getCanvasBrushPoint(event);
    if (canvasBrushMode === 'crop') {
      canvasBrushCropStartRef.current = point;
      setCanvasBrushCropRect(null);
      return;
    }
    canvasBrushDrawingRef.current = true;
    canvasBrushLastPointRef.current = point;
    if (isCanvasBrushShapeMode(canvasBrushMode)) {
      const ctx = canvas.getContext('2d');
      canvasBrushShapeStartRef.current = point;
      canvasBrushShapeSnapshotRef.current = ctx?.getImageData(0, 0, canvas.width, canvas.height) || null;
      return;
    }
    paintCanvasBrushStroke(point, point);

};

export const handleCanvasBrushPointerMoveImpl = (ctx: Pick<canvasMediaActionContext, 'canvasBrushCanvasRef' | 'canvasBrushCropStartRef' | 'canvasBrushDrawingRef' | 'canvasBrushLastPointRef' | 'canvasBrushMode' | 'canvasBrushShapeStartRef' | 'getCanvasBrushPoint' | 'isCanvasBrushShapeMode' | 'normalizeCanvasBrushCropRect' | 'paintCanvasBrushShape' | 'paintCanvasBrushStroke' | 'restoreCanvasBrushShapeSnapshot' | 'setCanvasBrushCropRect' | 'updateCanvasBrushCursorFromEvent'>, event: React.PointerEvent<HTMLCanvasElement>) => {
  const { canvasBrushCanvasRef, canvasBrushCropStartRef, canvasBrushDrawingRef, canvasBrushLastPointRef, canvasBrushMode, canvasBrushShapeStartRef, getCanvasBrushPoint, isCanvasBrushShapeMode, normalizeCanvasBrushCropRect, paintCanvasBrushShape, paintCanvasBrushStroke, restoreCanvasBrushShapeSnapshot, setCanvasBrushCropRect, updateCanvasBrushCursorFromEvent } = ctx;
    updateCanvasBrushCursorFromEvent(event);
    if (!canvasBrushDrawingRef.current && canvasBrushMode !== 'crop') return;
    event.preventDefault();
    event.stopPropagation();
    const point = getCanvasBrushPoint(event);
    if (canvasBrushMode === 'crop') {
      const start = canvasBrushCropStartRef.current;
      const canvas = canvasBrushCanvasRef.current;
      if (start && canvas) setCanvasBrushCropRect(normalizeCanvasBrushCropRect(start, point, canvas.width, canvas.height));
      return;
    }
    if (isCanvasBrushShapeMode(canvasBrushMode)) {
      const start = canvasBrushShapeStartRef.current;
      if (!start) return;
      restoreCanvasBrushShapeSnapshot();
      paintCanvasBrushShape(canvasBrushMode, start, point);
      canvasBrushLastPointRef.current = point;
      return;
    }
    const last = canvasBrushLastPointRef.current || point;
    paintCanvasBrushStroke(last, point);
    canvasBrushLastPointRef.current = point;

};

export const finishCanvasBrushStrokeImpl = (ctx: Pick<canvasMediaActionContext, 'canvasBrushCropStartRef' | 'canvasBrushDrawingRef' | 'canvasBrushLastPointRef' | 'canvasBrushMode' | 'canvasBrushShapeStartRef' | 'clearCanvasBrushShapeDraft' | 'doodleRootRef' | 'getCanvasBrushPoint' | 'hideCanvasBrushCursor' | 'isCanvasBrushShapeMode' | 'paintCanvasBrushShape' | 'pushCanvasBrushHistory' | 'restoreCanvasBrushShapeSnapshot'>, event?: React.PointerEvent<HTMLCanvasElement>) => {
  const { canvasBrushCropStartRef, canvasBrushDrawingRef, canvasBrushLastPointRef, canvasBrushMode, canvasBrushShapeStartRef, clearCanvasBrushShapeDraft, doodleRootRef, getCanvasBrushPoint, hideCanvasBrushCursor, isCanvasBrushShapeMode, paintCanvasBrushShape, pushCanvasBrushHistory, restoreCanvasBrushShapeSnapshot } = ctx;
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      if (event.type === 'pointercancel') hideCanvasBrushCursor();
      if (event.type === 'pointerleave') {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !doodleRootRef.current?.contains(nextTarget)) {
          hideCanvasBrushCursor();
        }
      }
    }
    if (canvasBrushMode === 'crop') {
      canvasBrushCropStartRef.current = null;
      return;
    }
    if (!canvasBrushDrawingRef.current) return;
    if (isCanvasBrushShapeMode(canvasBrushMode)) {
      const start = canvasBrushShapeStartRef.current;
      const end = event ? getCanvasBrushPoint(event) : canvasBrushLastPointRef.current || start;
      canvasBrushDrawingRef.current = false;
      canvasBrushLastPointRef.current = null;
      if (start && end) {
        restoreCanvasBrushShapeSnapshot();
        paintCanvasBrushShape(canvasBrushMode, start, end);
        pushCanvasBrushHistory();
      }
      clearCanvasBrushShapeDraft();
      return;
    }
    canvasBrushDrawingRef.current = false;
    canvasBrushLastPointRef.current = null;
    pushCanvasBrushHistory();

};

export const undoCanvasBrushStrokeImpl = (ctx: Pick<canvasMediaActionContext, 'canvasBrushCanvasRef' | 'canvasBrushHistory' | 'setCanvasBrushHistory' | 'setCanvasBrushRedoHistory'>) => {
  const { canvasBrushCanvasRef, canvasBrushHistory, setCanvasBrushHistory, setCanvasBrushRedoHistory } = ctx;
    const canvas = canvasBrushCanvasRef.current;
    const canvasContext = canvas?.getContext('2d');
    if (!canvas || !canvasContext || canvasBrushHistory.length <= 1) return;
    const current = canvasBrushHistory[canvasBrushHistory.length - 1];
    const nextHistory = canvasBrushHistory.slice(0, -1);
    const previous = nextHistory[nextHistory.length - 1];
    const image = new window.Image();
    image.onload = () => {
      canvasContext.clearRect(0, 0, canvas.width, canvas.height);
      canvasContext.drawImage(image, 0, 0, canvas.width, canvas.height);
      setCanvasBrushHistory(nextHistory);
      setCanvasBrushRedoHistory(prev => [current, ...prev].slice(0, 24));
    };
    image.src = previous;

};

export const redoCanvasBrushStrokeImpl = (ctx: Pick<canvasMediaActionContext, 'canvasBrushCanvasRef' | 'canvasBrushRedoHistory' | 'setCanvasBrushHistory' | 'setCanvasBrushRedoHistory'>) => {
  const { canvasBrushCanvasRef, canvasBrushRedoHistory, setCanvasBrushHistory, setCanvasBrushRedoHistory } = ctx;
    const canvas = canvasBrushCanvasRef.current;
    const canvasContext = canvas?.getContext('2d');
    const next = canvasBrushRedoHistory[0];
    if (!canvas || !canvasContext || !next) return;
    const image = new window.Image();
    image.onload = () => {
      canvasContext.clearRect(0, 0, canvas.width, canvas.height);
      canvasContext.drawImage(image, 0, 0, canvas.width, canvas.height);
      setCanvasBrushHistory(prev => [...prev, next].slice(-24));
      setCanvasBrushRedoHistory(prev => prev.slice(1));
    };
    image.src = next;

};

export const handleDoodleKeyDownImpl = (ctx: Pick<canvasMediaActionContext, 'activateDoodleShortcutScope' | 'redoCanvasBrushStroke' | 'undoCanvasBrushStroke'>, event: React.KeyboardEvent<HTMLDivElement>) => {
  const { activateDoodleShortcutScope, redoCanvasBrushStroke, undoCanvasBrushStroke } = ctx;
    const key = event.key.toLowerCase();
    const isMod = event.ctrlKey || event.metaKey;
    const isUndo = isMod && !event.shiftKey && !event.altKey && key === 'z';
    const isRedo = (
      (isMod && event.shiftKey && !event.altKey && key === 'z') ||
      (isMod && !event.shiftKey && !event.altKey && key === 'y')
    );

    if (isUndo) {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation?.();
      activateDoodleShortcutScope();
      undoCanvasBrushStroke();
      return;
    }

    if (isRedo) {
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation?.();
      activateDoodleShortcutScope();
      redoCanvasBrushStroke();
    }

};

export const saveCanvasBrushEditedImageImpl = async (ctx: Pick<canvasMediaActionContext, 'appendCanvasItems' | 'canvasBrushBaseCanvasRef' | 'canvasBrushCanvasRef' | 'canvasBrushEditor' | 'createAssetId' | 'loadCanvasBrushImage' | 'makeCanvasNodeId' | 'setCanvasBrushEditor' | 'showToast'>) => {
  const { appendCanvasItems, canvasBrushBaseCanvasRef, canvasBrushCanvasRef, canvasBrushEditor, createAssetId, loadCanvasBrushImage, makeCanvasNodeId, setCanvasBrushEditor, showToast } = ctx;
    const canvas = canvasBrushCanvasRef.current;
    const baseCanvas = canvasBrushBaseCanvasRef.current;
    const editor = canvasBrushEditor;
    if (!canvas || !editor) return;
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = editor.width;
    outputCanvas.height = editor.height;
    const outputCtx = outputCanvas.getContext('2d');
    if (!outputCtx) {
      showToast('保存标记图失败');
      return;
    }
    if (baseCanvas) outputCtx.drawImage(baseCanvas, 0, 0, editor.width, editor.height);
    else {
      const baseImage = await loadCanvasBrushImage(editor.baseDataUrl);
      outputCtx.fillStyle = '#ffffff';
      outputCtx.fillRect(0, 0, editor.width, editor.height);
      outputCtx.drawImage(baseImage, 0, 0, editor.width, editor.height);
    }
    outputCtx.drawImage(canvas, 0, 0, editor.width, editor.height);
    const dataUrl = outputCanvas.toDataURL('image/png');
    const item: BufferItem = {
      id: createAssetId(),
      type: 'image',
      content: `${editor.name} 标记`,
      name: `${editor.name} 标记.png`,
      url: dataUrl,
      path: dataUrl,
      sourceUrl: editor.source,
      originalUrl: editor.source,
      remark: '画布画笔标记 / AI 修改参考图',
      createdAt: Date.now(),
      isQuickAccess: false,
    };
    const displaySize = getCanvasInitialImageSize(editor.width, editor.height);
    const canvasItem: CanvasImageItem = {
      id: makeCanvasNodeId(item.id, 'image'),
      item,
      x: editor.x + Math.min(editor.nodeWidth + 48, 360),
      y: editor.y + 28,
      width: displaySize.width,
      height: displaySize.height,
    };
    if (appendCanvasItems([canvasItem], '保存画布标记图') > 0) {
      showToast('已生成标记图，可直接连接到 AI 节点');
      setCanvasBrushEditor(null);
    }

};

export const prepareCanvasAiInputSourceImpl = async (ctx: Pick<canvasMediaActionContext, 'imageSourceToDataUrl' | 'imageSourceToJpegDataUrl'>, item: BufferItem, mode: 'stable' | 'remote-first' = 'stable', delivery: 'auto' | 'direct' | 'remote-only' = 'auto', referenceFormat: 'any' | 'jpeg' = 'any') => {
  const { imageSourceToDataUrl, imageSourceToJpegDataUrl } = ctx;
    const candidates = getCanvasAiInputSourceCandidates(item);
    const remoteFallback = candidates.find(source => isRemoteHttpImageSource(source));
    const forceJpegReference = referenceFormat === 'jpeg' && item.type === 'image';
    const canvasRotation = item.type === 'image' && (
      item.canvasRotation === 90 || item.canvasRotation === 180 || item.canvasRotation === 270
    ) ? item.canvasRotation : 0;
    const hasCanvasRotation = canvasRotation !== 0;
    const rotationSafeRemoteFallback = getCanvasAiRemoteFallbackForRotation(remoteFallback, canvasRotation);
    if (mode === 'remote-first' && remoteFallback && !forceJpegReference && !hasCanvasRotation) {
      return { source: remoteFallback, remoteFallback, usedRemoteFirst: true };
    }
    const localCandidates = candidates.filter(source => !isRemoteHttpImageSource(source));
    const directSource = localCandidates.find(source => isDirectCanvasAiInputSource(source));
    const publishableDirectSource = localCandidates.find(source => (
      isDirectCanvasAiInputSource(source) && !isDataMediaSourceValue(source)
    ));
    if (item.type === 'video' || (item.type === 'file' && isCanvasAudioFileName(item.name || item.path))) {
      if (directSource) return { source: directSource, remoteFallback, usedRemoteFirst: false };
      if (remoteFallback) return { source: remoteFallback, remoteFallback, usedRemoteFirst: false };
      throw new Error(item.type === 'video' ? '参考视频没有可用视频源' : '参考音频没有可用音频源');
    }

    if (delivery === 'remote-only' && publishableDirectSource && !forceJpegReference && !hasCanvasRotation) {
      return { source: publishableDirectSource, remoteFallback, usedRemoteFirst: false };
    }

    let lastError: unknown = null;
    if (forceJpegReference && !hasCanvasRotation) {
      const compatibleRemoteSource = remoteFallback && isLikelyJpegOrPngImageSource(remoteFallback)
        ? remoteFallback
        : '';
      const compatibleDirectSource = localCandidates.find(source => (
        !isDataMediaSourceValue(source) &&
        isDirectCanvasAiInputSource(source) &&
        isLikelyJpegOrPngImageSource(source)
      ));
      const compatibleDataSource = localCandidates.find(source => (
        isDataMediaSourceValue(source) &&
        isLikelyJpegOrPngImageSource(source)
      ));
      const compatibleSource = delivery === 'remote-only'
        ? compatibleDirectSource || compatibleRemoteSource || compatibleDataSource
        : compatibleRemoteSource || compatibleDirectSource || compatibleDataSource;
      if (compatibleSource) {
        return {
          source: compatibleSource,
          remoteFallback,
          usedRemoteFirst: compatibleSource === remoteFallback,
        };
      }
    }
    const readableCandidates = forceJpegReference || hasCanvasRotation
      ? Array.from(new Set([...localCandidates, remoteFallback].filter((source): source is string => !!source)))
      : localCandidates;

    for (const source of readableCandidates) {
      try {
        const sourceDataUrl = hasCanvasRotation
          ? await imageSourceToDataUrl(source, false)
          : '';
        const rotatedDataUrl = hasCanvasRotation
          ? await rotateImageDataUrl(sourceDataUrl, canvasRotation)
          : '';
        const dataUrl = forceJpegReference
          ? hasCanvasRotation
            ? await imageDataUrlToJpegDataUrl(rotatedDataUrl)
            : await imageSourceToJpegDataUrl(source)
          : hasCanvasRotation
            ? await optimizeCanvasAiInputDataUrl(rotatedDataUrl)
            : await imageSourceToDataUrl(source, true);
        if (dataUrl) return {
          source: dataUrl,
          remoteFallback: rotationSafeRemoteFallback,
          usedRemoteFirst: false,
        };
      } catch (err) {
        lastError = err;
      }
    }

    if (hasCanvasRotation) {
      throw lastError || new Error('旋转后的参考图读取失败');
    }

    if (forceJpegReference) {
      const compatibleDirectSource = localCandidates.find(source => isLikelyJpegOrPngImageSource(source));
      if (compatibleDirectSource) return { source: compatibleDirectSource, remoteFallback, warning: lastError, usedRemoteFirst: false };
      if (remoteFallback && isLikelyJpegOrPngImageSource(remoteFallback)) {
        return { source: remoteFallback, remoteFallback, warning: lastError, usedRemoteFirst: false };
      }
      throw lastError || new Error('Image2 reference image must be readable as JPG or PNG');
    }
    if (directSource) return { source: directSource, remoteFallback, warning: lastError, usedRemoteFirst: false };
    if (remoteFallback) return { source: remoteFallback, remoteFallback, usedRemoteFirst: false };
    throw lastError || new Error('参考图没有可用图片源');

};

export const cacheCanvasGeneratedImageSourceImpl = async (ctx: Pick<canvasMediaActionContext, 'GENERATED_IMAGE_CACHE_RETRY_DELAYS_MS' | 'webImageCacheDirRef'>, source: string, name: string, options?: { throwOnFailure?: boolean }) => {
  const { GENERATED_IMAGE_CACHE_RETRY_DELAYS_MS, webImageCacheDirRef } = ctx;
    const trimmed = source.trim();
    if (!trimmed || (!/^data:(?:image|video)\//i.test(trimmed) && !/^https?:\/\//i.test(trimmed))) {
      return { url: trimmed, path: '', sourceUrl: trimmed };
    }

    const latestCacheDir = (
      webImageCacheDirRef.current ||
      localStorage.getItem('drawer_web_image_cache_dir') ||
      ''
    ).trim();
    const retryDelays = /^https?:\/\//i.test(trimmed)
      ? GENERATED_IMAGE_CACHE_RETRY_DELAYS_MS
      : [];
    let lastError: unknown = new Error('AI 生成媒体本地缓存没有返回文件路径');
    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      try {
        const cachedPath = await invoke<string>('cache_web_image', {
          // Rust follows the stable URL's bounded HTTPS redirect natively.
          url: trimmed,
          name: name || AI_GENERATED_FOLDER_NAME,
          dir: latestCacheDir || undefined,
        });
        if (cachedPath) {
          return { url: convertFileSrc(cachedPath), path: cachedPath, sourceUrl: trimmed };
        }
        lastError = new Error('AI 生成媒体本地缓存没有返回文件路径');
      } catch (err) {
        lastError = err;
      }
      if (attempt < retryDelays.length) {
        await new Promise<void>(resolve => window.setTimeout(resolve, retryDelays[attempt]));
      }
    }

    if (options?.throwOnFailure) {
      throw lastError;
    }
    console.warn('AI 生成媒体本地缓存失败，保留远程预览:', lastError);
    return { url: trimmed, path: '', sourceUrl: trimmed };

};

export const createCanvasImagePreviewThumbnailImpl = async (ctx: Record<never, never>, source: string, path?: string, allowWebviewFallback: boolean = false) => {
  const {  } = ctx;
    const trimmedSource = source.trim();
    const trimmedPath = (path || '').trim();
    if (trimmedPath) {
      try {
        const result = await invoke<ImageThumbnailFileResult>('ensure_image_thumbnail_file', { path: trimmedPath, size: 512 });
        const thumbnail = result.url || (result.path ? convertFileSrc(result.path) : '');
        if (thumbnail) return thumbnail;
      } catch (err) {
        console.warn('画布输出缩略图文件生成失败:', err);
      }
      if (!allowWebviewFallback) return '';
    }
    return trimmedSource ? createImageThumbnailInWebview(trimmedSource) : '';

};

export const settleCanvasAiOutputThumbnailJobImpl = (ctx: Pick<canvasMediaActionContext, 'canvasPanRef' | 'generatedImageCachePendingIdsRef' | 'isCanvasInteractingRef' | 'isCanvasZoomingRef' | 'scheduleCanvasChangedNodesPatchSave' | 'scheduleCanvasStateSave' | 'settleCanvasAiOutputThumbnailJob' | 'updateCanvasItemsImmediate' | 'updateDrawerItemsDeferred'>, job: CanvasAiOutputThumbnailJob, patch: Partial<CanvasAiGeneratedOutput>) => {
  const { canvasPanRef, generatedImageCachePendingIdsRef, isCanvasInteractingRef, isCanvasZoomingRef, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, settleCanvasAiOutputThumbnailJob, updateCanvasItemsImmediate, updateDrawerItemsDeferred } = ctx;
    if (isCanvasInteractingRef.current || isCanvasZoomingRef.current || canvasPanRef.current) {
      window.setTimeout(() => settleCanvasAiOutputThumbnailJob(job, patch), 160);
      return;
    }
    const thumbnail = patch.thumbnail;
    const matchSources = new Set((job.matchSources || []).filter(Boolean));
    const changedCanvasIds = new Set<string>();
    updateCanvasItemsImmediate(prev => prev.map(canvasItem => {
      if ((job.canvasItemId && canvasItem.id !== job.canvasItemId) || !canvasItem.ai?.outputs?.length) return canvasItem;
      let changed = false;
      const outputs = canvasItem.ai.outputs.map((output, index) => {
        const isTarget = job.outputId
          ? output.id === job.outputId || matchSources.has(getCanvasAiOutputDisplaySource(output))
          : job.outputIndex !== undefined && index === job.outputIndex;
        if (!isTarget || (thumbnail && output.thumbnail === thumbnail && output.cacheStatus === 'ready')) return output;
        changed = true;
        return { ...output, ...patch };
      });
      if (changed) changedCanvasIds.add(canvasItem.id);
      return changed ? { ...canvasItem, ai: { ...canvasItem.ai, outputs } } : canvasItem;
    }));
    if (job.drawerItemId) {
      generatedImageCachePendingIdsRef.current.delete(job.drawerItemId);
      updateDrawerItemsDeferred(prev => prev.map(item => item.id === job.drawerItemId
        ? { ...item, ...(thumbnail ? { thumbnail } : {}) }
        : item));
    }
    try {
      job.onSettled?.(patch);
    } catch (err) {
      console.warn('AI 输出预览状态同步失败:', err);
    }
    if (changedCanvasIds.size > 0) {
      const changedIds = Array.from(changedCanvasIds);
      scheduleCanvasChangedNodesPatchSave(changedIds);
      scheduleCanvasStateSave({ syncNodes: false });
    }

};

export const runNextCanvasAiOutputThumbnailJobImpl = (ctx: Pick<canvasMediaActionContext, 'IMAGE_THUMBNAIL_UPDATE_BATCH_MS' | 'canvasAiOutputThumbnailInFlightRef' | 'canvasAiOutputThumbnailQueueRef' | 'canvasPanRef' | 'createCanvasImagePreviewThumbnail' | 'enqueueCanvasAiOutputThumbnailJob' | 'isCanvasInteractingRef' | 'isCanvasZoomingRef' | 'runNextCanvasAiOutputThumbnailJob' | 'settleCanvasAiOutputThumbnailJob'>) => {
  const { IMAGE_THUMBNAIL_UPDATE_BATCH_MS, canvasAiOutputThumbnailInFlightRef, canvasAiOutputThumbnailQueueRef, canvasPanRef, createCanvasImagePreviewThumbnail, enqueueCanvasAiOutputThumbnailJob, isCanvasInteractingRef, isCanvasZoomingRef, runNextCanvasAiOutputThumbnailJob, settleCanvasAiOutputThumbnailJob } = ctx;
    if (canvasAiOutputThumbnailInFlightRef.current.size > 0) return;
    if (isCanvasInteractingRef.current || isCanvasZoomingRef.current || canvasPanRef.current) return;
    const job = canvasAiOutputThumbnailQueueRef.current.shift();
    if (!job || canvasAiOutputThumbnailInFlightRef.current.has(job.key)) return;
    canvasAiOutputThumbnailInFlightRef.current.add(job.key);
    const attempt = job.attempt || 0;
    const retryJob = () => {
      if (!job.path || attempt >= 2) return false;
      window.setTimeout(() => {
        enqueueCanvasAiOutputThumbnailJob({ ...job, attempt: attempt + 1 });
      }, 240 * (attempt + 1));
      return true;
    };
    void createCanvasImagePreviewThumbnail(job.source, job.path, attempt >= 2)
      .then((thumbnail) => {
        if (!thumbnail && retryJob()) return;
        const patch: Partial<CanvasAiGeneratedOutput> = thumbnail
          ? { thumbnail, cacheStatus: 'ready' }
          : { cacheStatus: 'failed' };
        settleCanvasAiOutputThumbnailJob(job, patch);
      })
      .catch((err) => {
        console.warn('AI 输出预览缩略图补全失败:', err);
        if (retryJob()) return;
        settleCanvasAiOutputThumbnailJob(job, { cacheStatus: 'failed' });
      })
      .finally(() => {
        canvasAiOutputThumbnailInFlightRef.current.delete(job.key);
        if (canvasAiOutputThumbnailQueueRef.current.length > 0) {
          window.setTimeout(runNextCanvasAiOutputThumbnailJob, IMAGE_THUMBNAIL_UPDATE_BATCH_MS);
        }
      });

};

export const enqueueCanvasAiOutputThumbnailJobImpl = (ctx: Pick<canvasMediaActionContext, 'IMAGE_THUMBNAIL_QUEUE_LIMIT' | 'canvasAiOutputThumbnailInFlightRef' | 'canvasAiOutputThumbnailQueueRef' | 'runNextCanvasAiOutputThumbnailJob' | 'settleCanvasAiOutputThumbnailJob'>, job: CanvasAiOutputThumbnailJob) => {
  const { IMAGE_THUMBNAIL_QUEUE_LIMIT, canvasAiOutputThumbnailInFlightRef, canvasAiOutputThumbnailQueueRef, runNextCanvasAiOutputThumbnailJob, settleCanvasAiOutputThumbnailJob } = ctx;
    if (canvasAiOutputThumbnailInFlightRef.current.has(job.key)) return;
    if (canvasAiOutputThumbnailQueueRef.current.some(item => item.key === job.key)) return;
    while (canvasAiOutputThumbnailQueueRef.current.length >= IMAGE_THUMBNAIL_QUEUE_LIMIT) {
      const droppedJob = canvasAiOutputThumbnailQueueRef.current.shift();
      if (droppedJob) settleCanvasAiOutputThumbnailJob(droppedJob, { cacheStatus: 'failed' });
    }
    canvasAiOutputThumbnailQueueRef.current.push(job);
    runNextCanvasAiOutputThumbnailJob();

};

export const createCanvasAiOutputDraftsImpl = (ctx: Pick<canvasMediaActionContext, 'createAssetId'>, target: CanvasImageItem, prompt: string, clientRequestId?: string): CanvasAiGeneratedOutput[] => {
  const { createAssetId } = ctx;
    const count = clamp(Math.round(Number(target.ai?.count) || CANVAS_AI_DEFAULT_COUNT), 1, CANVAS_AI_MAX_OUTPUT_COUNT);
    const size = getCanvasAiOutputSize(target.ai?.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO);
    const now = Date.now();
    const mediaType = getCanvasAiMediaType(target.ai);
    return Array.from({ length: count }, (_, index) => ({
      id: `canvas_ai_output_${createAssetId()}`,
      mediaType,
      name: `AI generated ${mediaType} #${index + 1}`,
      prompt,
      status: 'working',
      clientRequestId: clientRequestId
        ? getCanvasAiSlotClientRequestId(clientRequestId, index, count)
        : undefined,
      generatedAt: now + index,
      width: size.width,
      height: size.height,
    }));

};

export const getCanvasContextRoutingTargetsForAgentImpl = (ctx: Pick<canvasMediaActionContext, 'getCanvasContextRoutingTargetKeys'>, agentItem: CanvasImageItem, sourceItems: CanvasImageItem[]): CanvasContextRoutingTarget[] => {
  const { getCanvasContextRoutingTargetKeys } = ctx;
    if (agentItem.contextRouting !== 'auto') return [];
    const targets: CanvasContextRoutingTarget[] = [];
    const queuedIds = [agentItem.id];
    const visitedIds = new Set<string>(queuedIds);

    while (queuedIds.length > 0 && targets.length < 32) {
      const sourceId = queuedIds.shift() || '';
      sourceItems.forEach(candidate => {
        if (!(candidate.inputs || []).includes(sourceId) || visitedIds.has(candidate.id)) return;
        visitedIds.add(candidate.id);
        if (candidate.ai?.type === 'image-generator') {
          const stableId = getCanvasContextRoutingTargetKeys(candidate)[0];
          if (!stableId) return;
          targets.push({
            id: stableId,
            label: candidate.ai.presetLabel || candidate.item.name || stableId,
            task: candidate.ai.presetPrompt || candidate.ai.prompt || candidate.item.content || '',
          });
          return;
        }
        if (!candidate.ai && !isCanvasAgentTextTarget(candidate)) queuedIds.push(candidate.id);
      });
    }
    return targets;

};

export const getCanvasTextInputsForNodeImpl = (ctx: Pick<canvasMediaActionContext, 'getCanvasContextRoutingTargetKeys' | 'getCanvasInputItemsForNode'>, canvasItem: CanvasImageItem, sourceItems: CanvasImageItem[]) => {
  const { getCanvasContextRoutingTargetKeys, getCanvasInputItemsForNode } = ctx;
    const targetKeys = getCanvasContextRoutingTargetKeys(canvasItem);
    const textInputs: string[] = [];
    const seenTextKeys = new Set<string>();
    const pushTextInput = (inputItem: CanvasImageItem) => {
      if (isCanvasWorkflowReferenceBridge(inputItem)) return;
      if ((inputItem.item.type !== 'text' && inputItem.item.type !== 'file') || inputItem.ai) return;
      const rawContent = ((inputItem.item.remark || '').trim() || inputItem.item.content || '').trim();
      const content = isCanvasAgentTextTarget(inputItem)
        ? applyCanvasTextContextRouting(rawContent, {
          bindings: canvasItem.ai?.strategyBindings,
          targetKeys,
        })
        : rawContent;
      if (!content) return;
      const key = content;
      if (seenTextKeys.has(key)) return;
      seenTextKeys.add(key);
      textInputs.push(content);
    };
    const visitInputItem = (inputItem: CanvasImageItem, seenNodeIds: Set<string>) => {
      if (seenNodeIds.has(inputItem.id)) return;
      seenNodeIds.add(inputItem.id);
      pushTextInput(inputItem);
      if (!inputItem.ai && (inputItem.inputs || []).length > 0) {
        getCanvasInputItemsForNode(inputItem, sourceItems).forEach(upstreamItem => visitInputItem(upstreamItem, seenNodeIds));
      }
    };
    getCanvasInputItemsForNode(canvasItem, sourceItems)
      .forEach(inputItem => visitInputItem(inputItem, new Set([canvasItem.id])));
    return textInputs;

};

export const getCanvasImageInputBufferItemsForNodeImpl = (ctx: Pick<canvasMediaActionContext, 'getCanvasInputItemsForNode'>, canvasItem: CanvasImageItem, sourceItems: CanvasImageItem[]) => {
  const { getCanvasInputItemsForNode } = ctx;
    const mediaInputs: BufferItem[] = [];
    const isVideoGenerator = canvasItem.ai?.type === 'video-generator';
    const isImageFusion = isCanvasImageFusionAi(canvasItem.ai);
    const canvasVideoReferenceSlots = isVideoGenerator
      ? getCanvasAiVideoReferenceSlots(canvasItem.ai?.model, canvasItem.ai?.videoInputMode, canvasItem.ai?.provider)
      : null;
    const maxImageInputs = isImageFusion ? 2 : isVideoGenerator ? (canvasVideoReferenceSlots?.imageSlots || 9) : 8;
    const maxVideoInputs = isVideoGenerator ? (canvasVideoReferenceSlots?.videoSlots || 0) : 0;
    const maxAudioInputs = isVideoGenerator ? (canvasVideoReferenceSlots?.audioSlots || 0) : 0;
    let imageInputCount = 0;
    let videoInputCount = 0;
    let audioInputCount = 0;
    let currentSourceImageLimit = maxImageInputs;
    const seenMediaKeys = new Set<string>();
    const pushInput = (item: BufferItem) => {
      const key = item.id || item.path || item.url || item.thumbnail || item.content;
      if (key && seenMediaKeys.has(key)) return;
      if (item.type === 'image' && imageInputCount < maxImageInputs && imageInputCount < currentSourceImageLimit) {
        if (key) seenMediaKeys.add(key);
        mediaInputs.push(item);
        imageInputCount += 1;
      } else if (item.type === 'video' && videoInputCount < maxVideoInputs) {
        if (key) seenMediaKeys.add(key);
        mediaInputs.push(item);
        videoInputCount += 1;
      } else if (item.type === 'file' && isCanvasAudioFileName(item.name || item.path) && audioInputCount < maxAudioInputs) {
        if (key) seenMediaKeys.add(key);
        mediaInputs.push(item);
        audioInputCount += 1;
      }
    };
    const visitInputItem = (inputItem: CanvasImageItem, seenNodeIds: Set<string>) => {
      if (seenNodeIds.has(inputItem.id)) return;
      seenNodeIds.add(inputItem.id);
      if (isCanvasWorkflowReferenceBridge(inputItem)) {
        getCanvasInputItemsForNode(inputItem, sourceItems).forEach(upstreamItem => visitInputItem(upstreamItem, seenNodeIds));
      } else if (
        inputItem.item.type === 'image'
        || inputItem.item.type === 'video'
        || (inputItem.item.type === 'file' && isCanvasAudioFileName(inputItem.item.name || inputItem.item.path))
      ) {
        const applyInputRotation = (item: BufferItem): BufferItem => inputItem.rotation
          ? { ...item, canvasRotation: inputItem.rotation }
          : item;
        if (inputItem.item.type === 'image' && (inputItem.workflowSlotAssets || []).length > 0) {
          inputItem.workflowSlotAssets?.forEach((asset, assetIndex) => {
            pushInput(applyInputRotation({
              ...inputItem.item,
              id: asset.sourceItemId || `${inputItem.item.id}:slot:${assetIndex}`,
              type: 'image',
              name: asset.name || inputItem.item.name,
              path: asset.path,
              url: asset.url,
              thumbnail: asset.thumbnail,
              sourceUrl: asset.originalUrl,
              originalUrl: asset.originalUrl,
              sourceItemId: asset.sourceItemId,
            }));
          });
        } else {
          pushInput(applyInputRotation(inputItem.item));
        }
      } else if (inputItem.ai?.type === 'image-generator' || inputItem.ai?.type === 'workflow') {
        getCanvasAiSuccessfulOutputs(inputItem).slice(0, isImageFusion ? 1 : undefined).forEach((output, index) => {
          const outputItem = createCanvasAiOutputBufferItem(inputItem, output, index);
          if (outputItem) pushInput(outputItem);
        });
      } else if (inputItem.ai?.type === 'video-generator') {
        getCanvasAiSuccessfulOutputs(inputItem).slice(0, isImageFusion ? 1 : undefined).forEach((output, index) => {
          const outputItem = createCanvasAiOutputBufferItem(inputItem, output, index);
          if (outputItem) pushInput(outputItem);
        });
      } else if (!inputItem.ai && (inputItem.inputs || []).length > 0) {
        getCanvasInputItemsForNode(inputItem, sourceItems).forEach(upstreamItem => visitInputItem(upstreamItem, seenNodeIds));
      }
    };
    const orderedCanvasItem = isImageFusion
      ? { ...canvasItem, inputs: getCanvasImageFusionInputIds(canvasItem.ai?.imageFusion, canvasItem.inputs || []) }
      : canvasItem;
    for (const inputItem of getCanvasInputItemsForNode(orderedCanvasItem, sourceItems)) {
      currentSourceImageLimit = isImageFusion ? Math.min(maxImageInputs, imageInputCount + 1) : maxImageInputs;
      visitInputItem(inputItem, new Set([canvasItem.id]));
      if (
        imageInputCount >= maxImageInputs
        && videoInputCount >= maxVideoInputs
        && audioInputCount >= maxAudioInputs
      ) break;
    }
    return mediaInputs;

};
