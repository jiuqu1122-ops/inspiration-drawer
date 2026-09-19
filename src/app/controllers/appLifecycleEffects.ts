import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import React,{ startTransition } from 'react';
import { type RoundedSelectOption } from '../../components/RoundedSelect';
import { isPermanentInspirationAnalysisFailure,requeueInspirationAnalysisItemAfterRestart } from '../../features/appAgent/inspirationMemory';
import { getCanvasAiPublicImageModelName } from '../../features/canvasAiImage';
import { getAiCatalogModels } from '../../features/aiModelCapabilities';
import { resolveCanvasWalletVideoModelContext } from '../../features/canvasWalletVideoModelContext';
import { isCanvasAiEnhancementType,type RifeEngineProgress } from '../../features/canvasLocalMediaTools';
import { type CanvasAiCredentialSource,type CanvasImageItem,type CanvasItemBox } from '../../features/canvasModel';
import { findCanvasImageModelChoice } from '../../features/canvas/canvasImageRequestSettings';
import { FLOATING_NOTE_DESTROY_BRIDGE_KEY,FLOATING_NOTE_SOURCE_BRIDGE_KEY,FLOATING_NOTE_TEXT_BRIDGE_KEY,FLOATING_NOTE_TITLE_BRIDGE_KEY,OPEN_FLOATING_NOTES_STORAGE_KEY,floatingNoteStorageKey,readFloatingNoteSnapshot,readOpenFloatingNoteLabels,writeOpenFloatingNoteLabels } from '../../features/floatingNotes';
import { SILICONFLOW_DEFAULT_ENDPOINT,SILICONFLOW_DEFAULT_MODEL,isSiliconFlowProvider,type AiAnalysisConfig } from '../../features/visionAnalysisConfig';
import { ASSET_PAGE_SIZE,listAssets,updateAssetsBatch } from '../../services/assetsApi';
import { PRODUCT_RENDER_PRESET_ID,getBuiltInProductRenderPrompt,isLegacyProductRenderPrompt } from '../../services/canvasTemplateStorage';
import { BufferItem,Folder } from '../../types';
import type { CanvasImageSourceCacheEntry } from '../../types/canvasMedia';
import type { CanvasContextMenuState,CanvasFolderMediaPickerState,CanvasReferenceDragState,CanvasReferenceReplaceTarget,CanvasUndoSnapshot,CanvasViewportRect } from '../../types/canvasRuntime';
import type { CanvasAiPromptPreset } from '../../types/canvasWorkflow';
import type { CloudImageModelsResult } from '../../types/license';
import { parseCanvasAiModelChoiceValue } from '../../utils/canvasAiConfig';
import { getAiGeneratedImageFolderIds } from '../../utils/canvasGeneratedFolders';
import { type CanvasImageFusionRole } from '../../utils/canvasImageFusion';
import { normalizeCanvasWorkflowRuntimeSnapshots } from '../../utils/canvasWorkflowRuntime';

type appLifecycleEffectContext = { setSelectedFolderIds: React.Dispatch<React.SetStateAction<string[]>>; folders: Folder[]; lastSelectedFolderIdRef: React.RefObject<string | null>; setIsByokUnlocked: React.Dispatch<React.SetStateAction<boolean>>; isCanvasModeRef: React.RefObject<boolean>; isCanvasMode: boolean; activeThreeSceneIdRef: React.RefObject<string | null>; threeSceneHistoryGestureRef: React.RefObject<string | null>; setActiveThreeSceneId: React.Dispatch<React.SetStateAction<string | null>>; keepCanvasSessionOnLeaveRef: React.RefObject<boolean>; isCanvasPointerInsideRef: React.RefObject<boolean>; canvasUndoStackRef: React.RefObject<CanvasUndoSnapshot[]>; canvasUndoRestoringRef: React.RefObject<boolean>; setCanvasSpacePressed: (pressed: boolean) => void; canvasSelectedIdsRef: React.RefObject<string[]>; setCanvasSelectedIds: React.Dispatch<React.SetStateAction<string[]>>; canvasViewportRef: React.RefObject<CanvasViewportRect | null>; setCanvasViewport: React.Dispatch<React.SetStateAction<CanvasViewportRect | null>>; canvasHoveredItemIdRef: React.RefObject<string>; hideCanvasSelectionOverlay: () => void; setCanvasFolderImportPrompt: React.Dispatch<React.SetStateAction<CanvasFolderMediaPickerState | null>>; setCanvasConnectionDraft: React.Dispatch<React.SetStateAction<{ fromId: string; sourceIds: string[]; fromX: number; fromY: number; toX: number; toY: number; } | null>>; setCanvasInputActionDraft: React.Dispatch<React.SetStateAction<{ targetId: string; fromX: number; fromY: number; toX: number; toY: number; } | null>>; setCanvasInteractionActive: (active: boolean, releaseDelay?: number, _options?: { preserveImageSources?: boolean; }) => void; setCanvasContextMenu: React.Dispatch<React.SetStateAction<CanvasContextMenuState | null>>; setCanvasActionMenuId: React.Dispatch<React.SetStateAction<string | null>>; setCanvasInputMenuForId: React.Dispatch<React.SetStateAction<string | null>>; setCanvasInputPickTargetId: React.Dispatch<React.SetStateAction<string | null>>; setCanvasReferenceReplaceTarget: React.Dispatch<React.SetStateAction<CanvasReferenceReplaceTarget | null>>; setCanvasReferenceDragState: React.Dispatch<React.SetStateAction<CanvasReferenceDragState | null>>; canvasReferenceReplaceTargetRef: React.RefObject<CanvasReferenceReplaceTarget | null>; pendingCanvasReferenceUploadReplaceRef: React.RefObject<CanvasReferenceReplaceTarget | null>; canvasReferenceLongPressRef: React.RefObject<{ targetId: string; inputId: string; overInputId: string; pointerId: number; startClientX: number; startClientY: number; clientX: number; clientY: number; previewSource: string; inputIndex: number; rotation: 0 | 90 | 180 | 270; activated: boolean; timer: number | null; previousBodyCursor: string; cleanup: () => void; } | null>; cleanup: (() => void) | undefined; pendingCanvasFusionRoleRef: React.RefObject<{ targetId: string; role: CanvasImageFusionRole; } | null>; setIsCanvasAiPanelOpen: React.Dispatch<React.SetStateAction<boolean>>; setIsCanvasChromeHidden: React.Dispatch<React.SetStateAction<boolean>>; canvasAiPromptDraftTimersRef: React.RefObject<Record<string, number>>; canvasTextDraftTimersRef: React.RefObject<Record<string, number>>; canvasTextOutputDraftTimersRef: React.RefObject<Record<string, number>>; canvasAiPromptDraftValuesRef: React.RefObject<Record<string, string>>; canvasTextDraftValuesRef: React.RefObject<Record<string, string>>; canvasTextOutputDraftValuesRef: React.RefObject<Record<string, string>>; cancelCanvasImageSourceUpgradeQueue: () => void; canvasSelectionImageSourceFrameRef: React.RefObject<number | null>; canvasSelectionImageSourceIdsRef: React.RefObject<Set<string>>; canvasImageSourceCacheRef: React.RefObject<Map<string, CanvasImageSourceCacheEntry>>; canvasPreviewSourceIdsRef: React.RefObject<Set<string>>; canvasPanCleanupRef: React.RefObject<(() => void) | null>; canvasPanRef: React.RefObject<{ pointerId: number; button: number; startClientX: number; startClientY: number; startScrollLeft: number; startScrollTop: number; } | null>; cancelCanvasItemDragVisuals: () => void; canvasSelectionDragRef: React.RefObject<{ pointerId: number; startX: number; startY: number; currentX: number; currentY: number; additive: boolean; baseSelectedIds: string[]; hasMoved: boolean; } | null>; canvasConnectionDragRef: React.RefObject<{ fromId: string; sourceIds: string[]; pointerId: number; fromX: number; fromY: number; } | null>; canvasInputActionDragRef: React.RefObject<{ targetId: string; pointerId: number; fromX: number; fromY: number; } | null>; canvasScrollLockRef: React.RefObject<{ left: number; top: number; } | null>; canvasSpaceKeyCapturedRef: React.RefObject<boolean>; canvasSurfaceRef: React.RefObject<HTMLDivElement | null>; canvasPendingSelectionDomIdsRef: React.RefObject<Set<string>>; canvasDragRef: React.RefObject<{ ids: string[]; pointerId: number; startClientX: number; startClientY: number; startScrollLeft: number; startScrollTop: number; startItems: Record<string, CanvasItemBox>; latestDelta: { dx: number; dy: number; }; hasMoved: boolean; hasConnections: boolean; pendingSelectionIds: string[] | null; } | null>; hasMoved: boolean | undefined; canvasContentRef: React.RefObject<HTMLDivElement | null>; paintCanvasDragChrome: (ids: string[], dx: number, dy: number) => void; ids: string[]; latestDelta: { dx: number; dy: number; }; dx: number; dy: number; canvasItems: CanvasImageItem[]; setCanvasWorkingTimerTick: React.Dispatch<React.SetStateAction<number>>; setIsCanvasPresetEditorOpen: React.Dispatch<React.SetStateAction<boolean>>; setIsCanvasWorkflowManagerOpen: React.Dispatch<React.SetStateAction<boolean>>; canvasInputPickTargetIdRef: React.RefObject<string | null>; setCustomCanvasAiPromptPresets: React.Dispatch<React.SetStateAction<CanvasAiPromptPreset[]>>; scheduleCanvasViewportUpdate: () => void; selectedImageZoomTimerRef: React.RefObject<any>; selectedImage: string | null; setSelectedImageZoom: React.Dispatch<React.SetStateAction<number>>; setSelectedImagePan: React.Dispatch<React.SetStateAction<{ x: number; y: number; }>>; selectedImagePanRef: React.RefObject<{ x: number; y: number; }>; setShowSelectedImageZoom: React.Dispatch<React.SetStateAction<boolean>>; isDataLoaded: boolean; assetStorageMode: "initializing" | "sqlite" | "json"; AUTO_INSPIRATION_ANALYSIS_RETRY_MIGRATION_KEY: "drawer_ai_analysis_retry_migration_v3"; itemsRef: React.RefObject<BufferItem[]>; autoInspirationAnalysisAttemptedRef: React.RefObject<Set<string>>; autoInspirationAnalysisPendingIdsRef: React.RefObject<Set<string>>; setItems: React.Dispatch<React.SetStateAction<BufferItem[]>>; autoInspirationAnalysisStartupRequeueRef: React.RefObject<boolean>; updateAssetsFromQuery: (updatedAssets: BufferItem[]) => void; setIsAutoAiAnalysisStartupReady: React.Dispatch<React.SetStateAction<boolean>>; setAssetStatsRevision: React.Dispatch<React.SetStateAction<number>>; setAutoAiAnalysisRetryTick: React.Dispatch<React.SetStateAction<number>>; AUTO_INSPIRATION_ANALYSIS_NOTE_PAYLOAD_FIX_KEY: "drawer_ai_analysis_note_payload_fix_v2"; isFoldersLoaded: boolean; AI_GENERATED_IMAGE_PROMPT_NOTE_CLEANUP_KEY: "drawer_ai_generated_prompt_note_cleanup_v1"; foldersRef: React.RefObject<Folder[]>; isMainDrawerWindow: boolean; canvasItemsRef: React.RefObject<CanvasImageItem[]>; updateCanvasAiGeneratorData: (nodeId: string, patch: Partial<NonNullable<CanvasImageItem["ai"]>>, content?: string) => CanvasImageItem | undefined; applyFloatingNoteDestroy: (rawPayload: any) => void; refreshNoteManager: () => void; setAiApiProvider: React.Dispatch<React.SetStateAction<string>>; setAiApiEndpoint: React.Dispatch<React.SetStateAction<string>>; setAiApiKey: React.Dispatch<React.SetStateAction<string>>; setAiApiModel: React.Dispatch<React.SetStateAction<string>>; setWebImageCacheDir: React.Dispatch<React.SetStateAction<string>>; webImageCacheDirRef: React.RefObject<string>; aiApiProvider: string; aiApiEndpoint: string; aiApiKey: string; aiApiModel: string; canvasAiUnifiedImageModelOptions: RoundedSelectOption[]; updateCanvasItemsImmediate: (updater: (prev: CanvasImageItem[]) => CanvasImageItem[]) => CanvasImageItem[]; canvasAiCredentialSource: CanvasAiCredentialSource; };

export const runAppLifecycleEffect01 = (ctx: Pick<appLifecycleEffectContext, 'folders' | 'lastSelectedFolderIdRef' | 'setSelectedFolderIds'>) => {
  const { folders, lastSelectedFolderIdRef, setSelectedFolderIds } = ctx;
    setSelectedFolderIds(prev => {
      const existingIds = new Set(folders.map(folder => folder.id));
      const next = prev.filter(id => existingIds.has(id));
      return next.length === prev.length ? prev : next;
    });
    if (lastSelectedFolderIdRef.current && !folders.some(folder => folder.id === lastSelectedFolderIdRef.current)) {
      lastSelectedFolderIdRef.current = null;
    }

};

export const runAppLifecycleEffect02 = (ctx: Pick<appLifecycleEffectContext, 'setIsByokUnlocked'>) => {
  const { setIsByokUnlocked } = ctx;
    let active = true;
    void invoke<boolean>('get_byok_unlock_status')
      .then(unlocked => {
        if (!active) return;
        setIsByokUnlocked(unlocked);
      })
      .catch(() => {});
    return () => {
      active = false;
    };

};

export const runAppLifecycleEffect03 = (ctx: Pick<appLifecycleEffectContext, 'activeThreeSceneIdRef' | 'cancelCanvasImageSourceUpgradeQueue' | 'cancelCanvasItemDragVisuals' | 'canvasAiPromptDraftTimersRef' | 'canvasAiPromptDraftValuesRef' | 'canvasConnectionDragRef' | 'canvasHoveredItemIdRef' | 'canvasImageSourceCacheRef' | 'canvasInputActionDragRef' | 'canvasPanCleanupRef' | 'canvasPanRef' | 'canvasPreviewSourceIdsRef' | 'canvasReferenceLongPressRef' | 'canvasReferenceReplaceTargetRef' | 'canvasScrollLockRef' | 'canvasSelectedIdsRef' | 'canvasSelectionDragRef' | 'canvasSelectionImageSourceFrameRef' | 'canvasSelectionImageSourceIdsRef' | 'canvasSpaceKeyCapturedRef' | 'canvasTextDraftTimersRef' | 'canvasTextDraftValuesRef' | 'canvasTextOutputDraftTimersRef' | 'canvasTextOutputDraftValuesRef' | 'canvasUndoRestoringRef' | 'canvasUndoStackRef' | 'canvasViewportRef' | 'hideCanvasSelectionOverlay' | 'isCanvasMode' | 'isCanvasModeRef' | 'isCanvasPointerInsideRef' | 'keepCanvasSessionOnLeaveRef' | 'pendingCanvasFusionRoleRef' | 'pendingCanvasReferenceUploadReplaceRef' | 'setActiveThreeSceneId' | 'setCanvasActionMenuId' | 'setCanvasConnectionDraft' | 'setCanvasContextMenu' | 'setCanvasFolderImportPrompt' | 'setCanvasInputActionDraft' | 'setCanvasInputMenuForId' | 'setCanvasInputPickTargetId' | 'setCanvasInteractionActive' | 'setCanvasReferenceDragState' | 'setCanvasReferenceReplaceTarget' | 'setCanvasSelectedIds' | 'setCanvasSpacePressed' | 'setCanvasViewport' | 'setIsCanvasAiPanelOpen' | 'setIsCanvasChromeHidden' | 'threeSceneHistoryGestureRef'>) => {
  const { activeThreeSceneIdRef, cancelCanvasImageSourceUpgradeQueue, cancelCanvasItemDragVisuals, canvasAiPromptDraftTimersRef, canvasAiPromptDraftValuesRef, canvasConnectionDragRef, canvasHoveredItemIdRef, canvasImageSourceCacheRef, canvasInputActionDragRef, canvasPanCleanupRef, canvasPanRef, canvasPreviewSourceIdsRef, canvasReferenceLongPressRef, canvasReferenceReplaceTargetRef, canvasScrollLockRef, canvasSelectedIdsRef, canvasSelectionDragRef, canvasSelectionImageSourceFrameRef, canvasSelectionImageSourceIdsRef, canvasSpaceKeyCapturedRef, canvasTextDraftTimersRef, canvasTextDraftValuesRef, canvasTextOutputDraftTimersRef, canvasTextOutputDraftValuesRef, canvasUndoRestoringRef, canvasUndoStackRef, canvasViewportRef, hideCanvasSelectionOverlay, isCanvasMode, isCanvasModeRef, isCanvasPointerInsideRef, keepCanvasSessionOnLeaveRef, pendingCanvasFusionRoleRef, pendingCanvasReferenceUploadReplaceRef, setActiveThreeSceneId, setCanvasActionMenuId, setCanvasConnectionDraft, setCanvasContextMenu, setCanvasFolderImportPrompt, setCanvasInputActionDraft, setCanvasInputMenuForId, setCanvasInputPickTargetId, setCanvasInteractionActive, setCanvasReferenceDragState, setCanvasReferenceReplaceTarget, setCanvasSelectedIds, setCanvasSpacePressed, setCanvasViewport, setIsCanvasAiPanelOpen, setIsCanvasChromeHidden, threeSceneHistoryGestureRef } = ctx;
    isCanvasModeRef.current = isCanvasMode;
    if (!isCanvasMode) {
      activeThreeSceneIdRef.current = null;
      threeSceneHistoryGestureRef.current = null;
      setActiveThreeSceneId(null);
      const keepCanvasSession = keepCanvasSessionOnLeaveRef.current;
      isCanvasPointerInsideRef.current = false;
      if (!keepCanvasSession) {
        canvasUndoStackRef.current = [];
        canvasUndoRestoringRef.current = false;
      }
      setCanvasSpacePressed(false);
      canvasSelectedIdsRef.current = [];
      setCanvasSelectedIds([]);
      canvasViewportRef.current = null;
      setCanvasViewport(null);
      canvasHoveredItemIdRef.current = '';
      hideCanvasSelectionOverlay();
      setCanvasFolderImportPrompt(null);
      setCanvasConnectionDraft(null);
      setCanvasInputActionDraft(null);
      setCanvasInteractionActive(false, 0);
      setCanvasContextMenu(null);
      setCanvasActionMenuId(null);
      setCanvasInputMenuForId(null);
      setCanvasInputPickTargetId(null);
      setCanvasReferenceReplaceTarget(null);
      setCanvasReferenceDragState(null);
      canvasReferenceReplaceTargetRef.current = null;
      pendingCanvasReferenceUploadReplaceRef.current = null;
      canvasReferenceLongPressRef.current?.cleanup();
      pendingCanvasFusionRoleRef.current = null;
      setIsCanvasAiPanelOpen(false);
      setIsCanvasChromeHidden(false);
      Object.values(canvasAiPromptDraftTimersRef.current).forEach(timer => window.clearTimeout(timer));
      Object.values(canvasTextDraftTimersRef.current).forEach(timer => window.clearTimeout(timer));
      Object.values(canvasTextOutputDraftTimersRef.current).forEach(timer => window.clearTimeout(timer));
      canvasAiPromptDraftTimersRef.current = {};
      canvasAiPromptDraftValuesRef.current = {};
      canvasTextDraftTimersRef.current = {};
      canvasTextDraftValuesRef.current = {};
      canvasTextOutputDraftTimersRef.current = {};
      canvasTextOutputDraftValuesRef.current = {};
      cancelCanvasImageSourceUpgradeQueue();
      if (canvasSelectionImageSourceFrameRef.current !== null) {
        window.cancelAnimationFrame(canvasSelectionImageSourceFrameRef.current);
        canvasSelectionImageSourceFrameRef.current = null;
      }
      canvasSelectionImageSourceIdsRef.current.clear();
      canvasImageSourceCacheRef.current.clear();
      canvasPreviewSourceIdsRef.current.clear();
      canvasPanCleanupRef.current?.();
      canvasPanCleanupRef.current = null;
      canvasPanRef.current = null;
      cancelCanvasItemDragVisuals();
      canvasSelectionDragRef.current = null;
      canvasConnectionDragRef.current = null;
      canvasInputActionDragRef.current = null;
      canvasScrollLockRef.current = null;
      canvasSpaceKeyCapturedRef.current = false;
      keepCanvasSessionOnLeaveRef.current = false;
    }

};

export const runAppLifecycleEffect04 = (ctx: Pick<appLifecycleEffectContext, 'canvasSurfaceRef' | 'isCanvasMode'>) => {
  const { canvasSurfaceRef, isCanvasMode } = ctx;
    if (!isCanvasMode) return;
    const surface = canvasSurfaceRef.current;
    if (!surface) return;
    const preventNativeMiddleMouse = (event: MouseEvent) => {
      if (event.button !== 1) return;
      event.preventDefault();
    };
    surface.addEventListener('mousedown', preventNativeMiddleMouse, { capture: true, passive: false });
    surface.addEventListener('auxclick', preventNativeMiddleMouse, { capture: true, passive: false });
    return () => {
      surface.removeEventListener('mousedown', preventNativeMiddleMouse, true);
      surface.removeEventListener('auxclick', preventNativeMiddleMouse, true);
    };

};

export const runAppLifecycleEffect05 = (ctx: Pick<appLifecycleEffectContext, 'canvasContentRef' | 'canvasDragRef' | 'canvasPendingSelectionDomIdsRef' | 'canvasSurfaceRef' | 'paintCanvasDragChrome'>) => {
  const { canvasContentRef, canvasDragRef, canvasPendingSelectionDomIdsRef, canvasSurfaceRef, paintCanvasDragChrome } = ctx;
    if (canvasPendingSelectionDomIdsRef.current.size === 0) return;
    canvasPendingSelectionDomIdsRef.current.clear();
    const activeDrag = canvasDragRef.current;
    if (activeDrag?.hasMoved) {
      canvasContentRef.current
        ?.querySelectorAll<HTMLElement>('[data-canvas-selection-frame="true"]')
        .forEach((frame) => { frame.style.willChange = 'transform'; });
      paintCanvasDragChrome(activeDrag.ids, activeDrag.latestDelta.dx, activeDrag.latestDelta.dy);
    }
    canvasSurfaceRef.current?.removeAttribute('data-canvas-selection-pending');

};

export const runAppLifecycleEffect06 = (ctx: Pick<appLifecycleEffectContext, 'canvasItems' | 'setCanvasWorkingTimerTick'>) => {
  const { canvasItems, setCanvasWorkingTimerTick } = ctx;
    const hasWorkingCanvasAi = canvasItems.some(item => (
      item.ai?.status === 'working'
      || item.ai?.outputs?.some(output => output.status === 'working')
      || normalizeCanvasWorkflowRuntimeSnapshots(item.ai?.workflowRuntime)
        .some(snapshot => snapshot.ai?.status === 'working' || snapshot.ai?.outputs?.some(output => output.status === 'working'))
    ));
    if (!hasWorkingCanvasAi) return;

    setCanvasWorkingTimerTick(Date.now());
    const timer = window.setInterval(() => setCanvasWorkingTimerTick(Date.now()), 1000);
    return () => window.clearInterval(timer);

};

export const runAppLifecycleEffect07 = (ctx: Pick<appLifecycleEffectContext, 'canvasInputPickTargetIdRef' | 'canvasReferenceReplaceTargetRef' | 'isCanvasMode' | 'pendingCanvasFusionRoleRef' | 'setCanvasContextMenu' | 'setCanvasFolderImportPrompt' | 'setCanvasInputMenuForId' | 'setCanvasReferenceReplaceTarget' | 'setIsCanvasAiPanelOpen' | 'setIsCanvasPresetEditorOpen' | 'setIsCanvasWorkflowManagerOpen'>) => {
  const { canvasInputPickTargetIdRef, canvasReferenceReplaceTargetRef, isCanvasMode, pendingCanvasFusionRoleRef, setCanvasContextMenu, setCanvasFolderImportPrompt, setCanvasInputMenuForId, setCanvasReferenceReplaceTarget, setIsCanvasAiPanelOpen, setIsCanvasPresetEditorOpen, setIsCanvasWorkflowManagerOpen } = ctx;
    if (!isCanvasMode) return;
    const closeCanvasClickWindows = (preserveReferenceReplacement = false) => {
      setCanvasContextMenu(null);
      setCanvasInputMenuForId(null);
      if (!preserveReferenceReplacement) {
        setCanvasReferenceReplaceTarget(null);
        canvasReferenceReplaceTargetRef.current = null;
      }
      pendingCanvasFusionRoleRef.current = null;
      setCanvasFolderImportPrompt(null);
      setIsCanvasAiPanelOpen(false);
      setIsCanvasPresetEditorOpen(false);
      setIsCanvasWorkflowManagerOpen(false);
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-canvas-floating-layer="true"]')) return;
      closeCanvasClickWindows(!!canvasInputPickTargetIdRef.current);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCanvasClickWindows(false);
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };

};

export const runAppLifecycleEffect08 = (ctx: Pick<appLifecycleEffectContext, 'setCustomCanvasAiPromptPresets'>) => {
  const { setCustomCanvasAiPromptPresets } = ctx;
    const builtInPrompt = getBuiltInProductRenderPrompt();
    if (!builtInPrompt) return;

    setCustomCanvasAiPromptPresets(prev => {
      let changed = false;
      const next = prev.map(preset => {
        if (preset.id !== PRODUCT_RENDER_PRESET_ID || !isLegacyProductRenderPrompt(preset.prompt || '')) return preset;
        changed = true;
        return {
          ...preset,
          hint: '自动选择深浅场景',
          prompt: builtInPrompt,
        };
      });
      return changed ? next : prev;
    });

};

export const runAppLifecycleEffect09 = (ctx: Pick<appLifecycleEffectContext, 'canvasSurfaceRef' | 'isCanvasMode' | 'scheduleCanvasViewportUpdate'>) => {
  const { canvasSurfaceRef, isCanvasMode, scheduleCanvasViewportUpdate } = ctx;
    if (!isCanvasMode) return;
    const surface = canvasSurfaceRef.current;
    scheduleCanvasViewportUpdate();
    const handleResize = () => scheduleCanvasViewportUpdate();
    window.addEventListener('resize', handleResize);
    const observer = typeof ResizeObserver !== 'undefined' && surface
      ? new ResizeObserver(handleResize)
      : null;
    if (observer && surface) observer.observe(surface);
    return () => {
      window.removeEventListener('resize', handleResize);
      observer?.disconnect();
    };

};

export const runAppLifecycleEffect10 = (ctx: Pick<appLifecycleEffectContext, 'selectedImage' | 'selectedImagePanRef' | 'selectedImageZoomTimerRef' | 'setSelectedImagePan' | 'setSelectedImageZoom' | 'setShowSelectedImageZoom'>) => {
  const { selectedImage, selectedImagePanRef, selectedImageZoomTimerRef, setSelectedImagePan, setSelectedImageZoom, setShowSelectedImageZoom } = ctx;
    if (selectedImageZoomTimerRef.current) {
      clearTimeout(selectedImageZoomTimerRef.current);
      selectedImageZoomTimerRef.current = null;
    }

    if (selectedImage) {
      setSelectedImageZoom(1);
      setSelectedImagePan({ x: 0, y: 0 });
      selectedImagePanRef.current = { x: 0, y: 0 };
      setShowSelectedImageZoom(false);
    }

};

export const runAppLifecycleEffect11 = (ctx: Pick<appLifecycleEffectContext, 'AUTO_INSPIRATION_ANALYSIS_RETRY_MIGRATION_KEY' | 'assetStorageMode' | 'autoInspirationAnalysisAttemptedRef' | 'autoInspirationAnalysisPendingIdsRef' | 'isDataLoaded' | 'itemsRef' | 'setItems'>) => {
  const { AUTO_INSPIRATION_ANALYSIS_RETRY_MIGRATION_KEY, assetStorageMode, autoInspirationAnalysisAttemptedRef, autoInspirationAnalysisPendingIdsRef, isDataLoaded, itemsRef, setItems } = ctx;
    if (
      !isDataLoaded
      || assetStorageMode !== 'json'
      || localStorage.getItem(AUTO_INSPIRATION_ANALYSIS_RETRY_MIGRATION_KEY) === '1'
    ) return;
    let changed = false;
    const nextItems = itemsRef.current.map(item => {
      if (
        item.inspirationProfile
        || !item.inspirationAnalysisFailure
        || isPermanentInspirationAnalysisFailure(item.inspirationAnalysisFailure.message)
      ) return item;
      changed = true;
      autoInspirationAnalysisAttemptedRef.current.delete(item.id);
      autoInspirationAnalysisPendingIdsRef.current.delete(item.id);
      return { ...item, inspirationAnalysisFailure: undefined };
    });
    localStorage.setItem(AUTO_INSPIRATION_ANALYSIS_RETRY_MIGRATION_KEY, '1');
    if (!changed) return;
    itemsRef.current = nextItems;
    startTransition(() => setItems(nextItems));

};

export const runAppLifecycleEffect12 = (ctx: Pick<appLifecycleEffectContext, 'assetStorageMode' | 'autoInspirationAnalysisAttemptedRef' | 'autoInspirationAnalysisPendingIdsRef' | 'autoInspirationAnalysisStartupRequeueRef' | 'isDataLoaded' | 'itemsRef' | 'setAssetStatsRevision' | 'setAutoAiAnalysisRetryTick' | 'setIsAutoAiAnalysisStartupReady' | 'setItems' | 'updateAssetsFromQuery'>) => {
  const { assetStorageMode, autoInspirationAnalysisAttemptedRef, autoInspirationAnalysisPendingIdsRef, autoInspirationAnalysisStartupRequeueRef, isDataLoaded, itemsRef, setAssetStatsRevision, setAutoAiAnalysisRetryTick, setIsAutoAiAnalysisStartupReady, setItems, updateAssetsFromQuery } = ctx;
    if (
      !isDataLoaded
      || assetStorageMode === 'initializing'
      || autoInspirationAnalysisStartupRequeueRef.current
    ) return;
    autoInspirationAnalysisStartupRequeueRef.current = true;

    const applyRequeuedItems = (requeuedItems: BufferItem[]) => {
      if (requeuedItems.length === 0) return;
      const requeuedById = new Map(requeuedItems.map(item => [item.id, item]));
      requeuedItems.forEach(item => {
        autoInspirationAnalysisAttemptedRef.current.delete(item.id);
        autoInspirationAnalysisPendingIdsRef.current.delete(item.id);
      });
      const nextItems = itemsRef.current.map(item => requeuedById.get(item.id) || item);
      itemsRef.current = nextItems;
      startTransition(() => {
        if (assetStorageMode === 'sqlite') updateAssetsFromQuery(requeuedItems);
        else setItems(nextItems);
      });
    };

    if (assetStorageMode === 'json') {
      const requeuedItems = itemsRef.current.flatMap((item) => {
        const requeued = requeueInspirationAnalysisItemAfterRestart(item);
        return requeued === item ? [] : [requeued];
      });
      applyRequeuedItems(requeuedItems);
      setIsAutoAiAnalysisStartupReady(true);
      return;
    }

    void (async () => {
      const requeuedItems: BufferItem[] = [];
      for (const inspirationStatus of ['retryable', 'skipped'] as const) {
        const processedIds = new Set<string>();
        while (true) {
          const failedItems = await listAssets({
            file_type: 'image',
            inspiration_status: inspirationStatus,
            sort: 'updated_at_asc',
            offset: 0,
            limit: ASSET_PAGE_SIZE,
          });
          if (failedItems.length === 0) break;
          const ids = failedItems
            .map(item => item.id)
            .filter(id => !processedIds.has(id));
          if (ids.length === 0) {
            throw new Error(`图片分析重试队列未能清除 ${inspirationStatus} 状态`);
          }
          ids.forEach(id => processedIds.add(id));
          const updated = await updateAssetsBatch([{
            ids,
            patch: { clear_inspiration_analysis_failure: true },
          }]);
          requeuedItems.push(...updated);
        }
      }
      applyRequeuedItems(requeuedItems);
      if (requeuedItems.length > 0) {
        setAssetStatsRevision(revision => revision + 1);
        setAutoAiAnalysisRetryTick(current => current + 1);
      }
    })()
      .catch(error => console.warn('重启后恢复图片分析队列失败:', error))
      .finally(() => setIsAutoAiAnalysisStartupReady(true));

};

export const runAppLifecycleEffect13 = (ctx: Pick<appLifecycleEffectContext, 'AUTO_INSPIRATION_ANALYSIS_NOTE_PAYLOAD_FIX_KEY' | 'assetStorageMode' | 'isDataLoaded' | 'itemsRef' | 'setItems'>) => {
  const { AUTO_INSPIRATION_ANALYSIS_NOTE_PAYLOAD_FIX_KEY, assetStorageMode, isDataLoaded, itemsRef, setItems } = ctx;
    if (
      !isDataLoaded
      || assetStorageMode !== 'json'
      || localStorage.getItem(AUTO_INSPIRATION_ANALYSIS_NOTE_PAYLOAD_FIX_KEY) === '1'
    ) return;
    localStorage.setItem(AUTO_INSPIRATION_ANALYSIS_NOTE_PAYLOAD_FIX_KEY, '1');
    let changed = false;
    const nextItems = itemsRef.current.map(item => {
      if (!item.inspirationAnalysisFailure?.message.includes('异步任务请求格式无效')) return item;
      changed = true;
      return { ...item, inspirationAnalysisFailure: undefined };
    });
    if (!changed) return;
    itemsRef.current = nextItems;
    startTransition(() => setItems(nextItems));

};

export const runAppLifecycleEffect14 = (ctx: Pick<appLifecycleEffectContext, 'AI_GENERATED_IMAGE_PROMPT_NOTE_CLEANUP_KEY' | 'foldersRef' | 'isDataLoaded' | 'isFoldersLoaded' | 'itemsRef' | 'setItems'>) => {
  const { AI_GENERATED_IMAGE_PROMPT_NOTE_CLEANUP_KEY, foldersRef, isDataLoaded, isFoldersLoaded, itemsRef, setItems } = ctx;
    if (
      !isDataLoaded
      || !isFoldersLoaded
      || localStorage.getItem(AI_GENERATED_IMAGE_PROMPT_NOTE_CLEANUP_KEY) === '1'
    ) return;
    const generatedImageFolderIds = getAiGeneratedImageFolderIds(foldersRef.current);
    let changed = false;
    const nextItems = itemsRef.current.map(item => {
      const isLegacyGeneratedImage = item.type === 'image' && (
        generatedImageFolderIds.has(item.folderId || '')
        || /^canvas_ai_output_/i.test(item.id)
        || /^canvas_realesrgan_.*_output_/i.test(item.id)
        || /^AI\s*生图(?:\s|[-·:：]|$)/i.test(item.name || item.content || '')
        || /^AI generated(?:\s|[-·:：]|$)/i.test(item.name || item.content || '')
      );
      if (!isLegacyGeneratedImage || (!item.remark && !item.remarks?.length)) return item;
      changed = true;
      const { remark: _promptRemark, remarks: _promptRemarks, ...itemWithoutPromptNotes } = item;
      return itemWithoutPromptNotes as BufferItem;
    });
    localStorage.setItem(AI_GENERATED_IMAGE_PROMPT_NOTE_CLEANUP_KEY, '1');
    if (!changed) return;
    itemsRef.current = nextItems;
    startTransition(() => setItems(nextItems));

};

export const runAppLifecycleEffect15 = (ctx: Pick<appLifecycleEffectContext, 'canvasItemsRef' | 'isMainDrawerWindow' | 'updateCanvasAiGeneratorData'>) => {
  const { canvasItemsRef, isMainDrawerWindow, updateCanvasAiGeneratorData } = ctx;
    if (!isMainDrawerWindow) return;
    let disposed = false;
    const unlistenPromise = listen<RifeEngineProgress>('rife-engine-progress', (event) => {
      if (disposed) return;
      const progress = event.payload;
      const progressId = (progress?.progressId || '').trim();
      if (!progressId) return;
      const target = canvasItemsRef.current.find(item => item.id === progressId);
      if (target?.ai?.type === 'frame-interpolation') {
        updateCanvasAiGeneratorData(progressId, { interpolationProgress: progress });
      } else if (isCanvasAiEnhancementType(target?.ai?.type)) {
        updateCanvasAiGeneratorData(progressId, { enhancementProgress: progress });
      }
    });
    return () => {
      disposed = true;
      void unlistenPromise.then(unlisten => unlisten()).catch(() => {});
    };

};

export const runAppLifecycleEffect16 = (ctx: Record<never, never>) => {
  const {  } = ctx;
    const seenItemIds = new Set<string>();
    const cleanLabels: string[] = [];
    readOpenFloatingNoteLabels().forEach(label => {
      const snapshot = readFloatingNoteSnapshot(label);
      if (!snapshot?.itemId) return;
      if (seenItemIds.has(snapshot.itemId)) {
        localStorage.removeItem(floatingNoteStorageKey(label));
        void invoke('hide_note_window', { label }).catch(() => {});
        return;
      }
      seenItemIds.add(snapshot.itemId);
      cleanLabels.push(label);
    });
    writeOpenFloatingNoteLabels(cleanLabels);

};

export const runAppLifecycleEffect17 = (ctx: Pick<appLifecycleEffectContext, 'applyFloatingNoteDestroy' | 'refreshNoteManager'>) => {
  const { applyFloatingNoteDestroy, refreshNoteManager } = ctx;
    const handleStorage = (event: StorageEvent) => {
      if (event.key === FLOATING_NOTE_DESTROY_BRIDGE_KEY && event.newValue) {
        try {
          applyFloatingNoteDestroy(JSON.parse(event.newValue));
        } catch (_) {}
        return;
      }

      if (
        event.key === OPEN_FLOATING_NOTES_STORAGE_KEY ||
        event.key === FLOATING_NOTE_TEXT_BRIDGE_KEY ||
        event.key === FLOATING_NOTE_TITLE_BRIDGE_KEY ||
        event.key === FLOATING_NOTE_SOURCE_BRIDGE_KEY ||
        event.key === FLOATING_NOTE_DESTROY_BRIDGE_KEY ||
        (typeof event.key === 'string' && event.key.startsWith('drawer_floating_note_'))
      ) {
        refreshNoteManager();
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);

};

export const runAppLifecycleEffect18 = (ctx: Pick<appLifecycleEffectContext, 'setAiApiEndpoint' | 'setAiApiKey' | 'setAiApiModel' | 'setAiApiProvider'>) => {
  const { setAiApiEndpoint, setAiApiKey, setAiApiModel, setAiApiProvider } = ctx;
    invoke('load_ai_analysis_config')
      .then((config: any) => {
        if (!config || typeof config !== 'object') return;
        const nextProvider = typeof config.provider === 'string' && config.provider ? config.provider : 'siliconflow';
        setAiApiProvider(nextProvider);
        if (typeof config.endpoint === 'string' && config.endpoint) {
          setAiApiEndpoint(config.endpoint);
        } else if (isSiliconFlowProvider(nextProvider)) {
          setAiApiEndpoint(SILICONFLOW_DEFAULT_ENDPOINT);
        }
        if (typeof config.apiKey === 'string' && config.apiKey) setAiApiKey(config.apiKey);
        if (typeof config.model === 'string' && config.model) {
          setAiApiModel(config.model);
        } else if (isSiliconFlowProvider(nextProvider)) {
          setAiApiModel(SILICONFLOW_DEFAULT_MODEL);
        }
      })
      .catch(() => {});

};

export const runAppLifecycleEffect19 = (ctx: Pick<appLifecycleEffectContext, 'setWebImageCacheDir' | 'webImageCacheDirRef'>) => {
  const { setWebImageCacheDir, webImageCacheDirRef } = ctx;
    const storedDir = (localStorage.getItem('drawer_web_image_cache_dir') || '').trim();
    const request = storedDir
      ? invoke<string>('set_web_image_cache_dir', { dir: storedDir })
      : invoke<string>('get_web_image_cache_dir');

    request
      .then((dir) => {
        if (dir) {
          setWebImageCacheDir(dir);
          webImageCacheDirRef.current = dir;
          localStorage.setItem('drawer_web_image_cache_dir', dir);
        }
      })
      .catch(() => {});

};

export const runAppLifecycleEffect20 = (ctx: Pick<appLifecycleEffectContext, 'aiApiEndpoint' | 'aiApiKey' | 'aiApiModel' | 'aiApiProvider'>) => {
  const { aiApiEndpoint, aiApiKey, aiApiModel, aiApiProvider } = ctx;
    const config: AiAnalysisConfig = {
      provider: aiApiProvider,
      endpoint: aiApiEndpoint.trim(),
      apiKey: aiApiKey.trim(),
      model: aiApiModel.trim(),
      proxy: '',
    };
    localStorage.setItem('drawer_ai_provider', config.provider);
    localStorage.setItem('drawer_ai_endpoint', config.endpoint);
    localStorage.setItem('drawer_ai_key', config.apiKey);
    localStorage.setItem('drawer_ai_model', config.model);
    invoke('save_ai_analysis_config', { config }).catch(() => {});

};

type appLifecycleCatalogEffectContext = appLifecycleEffectContext & {
  canvasAiCloudImageModels: CloudImageModelsResult | null;
};

export const runAppLifecycleEffect21 = (ctx: Pick<appLifecycleCatalogEffectContext, 'canvasAiCloudImageModels' | 'canvasAiCredentialSource' | 'canvasAiUnifiedImageModelOptions' | 'isCanvasMode' | 'updateCanvasItemsImmediate'>) => {
  const { canvasAiCloudImageModels, canvasAiCredentialSource, canvasAiUnifiedImageModelOptions, isCanvasMode, updateCanvasItemsImmediate } = ctx;
    if (!isCanvasMode) return;
    const availableChoices = canvasAiUnifiedImageModelOptions
      .map(option => parseCanvasAiModelChoiceValue(option.value))
      .filter((choice): choice is NonNullable<ReturnType<typeof parseCanvasAiModelChoiceValue>> => !!choice);
    const videoCatalog = canvasAiCredentialSource === 'wallet'
      ? getAiCatalogModels(canvasAiCloudImageModels, 'video')
      : [];
    updateCanvasItemsImmediate(previous => {
      let changed = false;
      const next = previous.map(item => {
        if (item.ai?.type === 'video-generator' && videoCatalog.length > 0) {
          const videoContext = resolveCanvasWalletVideoModelContext(
            item.ai,
            canvasAiCloudImageModels,
            canvasAiCredentialSource,
          );
          const firstCandidate = videoContext.selectedCandidate;
          if (videoContext.capabilityStatus !== 'resolved'
            || !videoContext.canonicalModelId
            || !firstCandidate) return item;
          const nextCandidates = videoContext.providerCandidates;
          const sameCandidates = JSON.stringify(item.ai.providerCandidates || [])
            === JSON.stringify(nextCandidates);
          const alreadySynchronized = item.ai.credentialSource === 'wallet'
            && item.ai.provider === firstCandidate.provider
            && item.ai.model === videoContext.canonicalModelId
            && (item.ai.providerChannelId || '') === (firstCandidate.providerChannelId || '')
            && sameCandidates;
          if (alreadySynchronized) return item;
          changed = true;
          return {
            ...item,
            ai: {
              ...item.ai,
              provider: firstCandidate.provider,
              model: videoContext.canonicalModelId,
              providerChannelId: firstCandidate.providerChannelId,
              credentialSource: 'wallet' as const,
              providerCandidates: nextCandidates,
            },
          };
        }
        if (item.ai?.type !== 'image-generator' || availableChoices.length === 0) return item;
        const hasSuccessfulOutput = (item.ai.outputs || []).some(output => (
          output.status === 'success' && Boolean(output.url || output.path)
        ));
        if (hasSuccessfulOutput) return item;
        const candidates = item.ai.providerCandidates || [];
        const preferredSource = canvasAiCredentialSource;
        const sourceChoices = availableChoices.filter(choice => choice.source === preferredSource);
        const currentCanonicalModelId = candidates.find(candidate => candidate.canonicalModelId)?.canonicalModelId;
        const rawCurrentPublicModel = getCanvasAiPublicImageModelName(item.ai.provider, item.ai.model);
        const currentPublicModel = rawCurrentPublicModel === 'GPT Image 2 H'
          ? 'GPT Image 2'
          : rawCurrentPublicModel;
        const matchingChoice = findCanvasImageModelChoice(sourceChoices, {
          canonicalModelId: currentCanonicalModelId,
          provider: item.ai.provider || 'new-api',
          model: item.ai.model,
          providerChannelId: item.ai.providerChannelId,
          publicModel: currentPublicModel,
        });
        const hasExplicitModel = Boolean(currentCanonicalModelId || String(item.ai.model || '').trim());
        const selectedChoice = matchingChoice || (!hasExplicitModel
          ? sourceChoices[0] || availableChoices[0]
          : undefined);
        if (!selectedChoice) return item;
        const nextCandidates = selectedChoice.providerCandidates || [];
        const sameCandidates = candidates.length === nextCandidates.length
          && candidates.every((candidate, index) => {
            const next = nextCandidates[index];
            return next
              && candidate.source === next.source
              && candidate.provider === next.provider
              && candidate.model === next.model
              && (candidate.canonicalModelId || '') === (next.canonicalModelId || '')
              && (candidate.displayName || '') === (next.displayName || '')
              && (candidate.providerChannelId || '') === (next.providerChannelId || '')
              && (candidate.providerChannelName || '') === (next.providerChannelName || '')
              && JSON.stringify(candidate.capabilities || null) === JSON.stringify(next.capabilities || null)
              && JSON.stringify(candidate.modelCapabilities || null) === JSON.stringify(next.modelCapabilities || null);
          });
        const alreadySynchronized = item.ai.credentialSource === selectedChoice.source
          && item.ai.provider === selectedChoice.provider
          && item.ai.model === selectedChoice.model
          && (item.ai.providerChannelId || '') === (selectedChoice.providerChannelId || '')
          && sameCandidates;
        if (alreadySynchronized) return item;
        changed = true;
        return {
          ...item,
          ai: {
            ...item.ai,
            provider: selectedChoice.provider,
            model: selectedChoice.model,
            providerChannelId: selectedChoice.providerChannelId,
            credentialSource: selectedChoice.source,
            providerCandidates: selectedChoice.providerCandidates,
          },
        };
      });
      return changed ? next : previous;
    });

};
