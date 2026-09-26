import { convertFileSrc,invoke } from '@tauri-apps/api/core';
import React from 'react';
import { DEFAULT_CANVAS_ID } from '../../../services/canvasApi';
import { createCanvasNavImageThumbnailInWebview,createCanvasNavVideoThumbnailInWebview } from '../../../services/mediaThumbnail';
import { BufferItem } from '../../../types';
import type { CanvasAiOutputThumbnailJob,CanvasNavPreview,CanvasNavThumbnailCacheEntry } from '../../../types/canvasMedia';
import type { CloudAccountSummary,LicenseStatus } from '../../../types/license';
import { CANVAS_AI_OUTPUT_SOURCE_RECOVERY_CONCURRENCY } from '../../../utils/canvasAiConfig';
import { createCanvasAiOutputBufferItem,getCanvasAiOutputDisplaySource } from '../../../utils/canvasItemSelectors';
import { getCanvasAiOutputPreviewSlots } from '../../../utils/canvasWorkflowRuntime';
import { getAutoRecoverableAiMediaResultSource } from '../../aiImageResultRecovery';
import { getCloudWalletImageGenerationByRequest,getCloudWalletImageLookupImages } from '../../canvasAiImage';
import { buildCanvasAiOutputRemoteResultPatch } from '../../canvasAiOutputs';
import { getCanvasAiMediaType } from '../../canvasAiRuntime';
import { getCanvasAiTimedOutRecoveryCandidates,isCanvasAiImageLookupPending } from '../../canvasAiTimedOutRecovery';
import { type CanvasAiGeneratedOutput,type CanvasImageItem,type CanvasItemBox } from '../../canvasModel';
import { shouldDeferLicenseGateForPostInstall,shouldInvokeLicenseGateDrawerOpen } from '../../startup';
import { type TriggerMode } from '../../triggerModel';

type derivedUiEffectContext = { isCanvasMode: boolean; canvasAiTimedOutRecoveryInFlightRef: React.RefObject<Set<string>>; canvasItems: CanvasImageItem[]; canvasAiTimedOutRecoverySettledRef: React.RefObject<Set<string>>; canvasItemsRef: React.RefObject<CanvasImageItem[]>; updateCanvasItemsImmediate: (updater: (prev: CanvasImageItem[]) => CanvasImageItem[]) => CanvasImageItem[]; addGeneratedImagesToDrawer: (generatedItems: BufferItem[], options?: { canvasId?: string; onOutputCachePatch?: (outputId: string, matchSources: string[], patch: Partial<CanvasAiGeneratedOutput>) => void; canvasOutputClientRequestId?: string; }) => void; activeCanvasIdRef: React.RefObject<string>; scheduleCanvasChangedNodesPatchSave: (ids: string[]) => void; scheduleCanvasStateSave: (options?: { syncNodes?: boolean; }) => void; enqueueCanvasAiOutputThumbnailJob: (job: CanvasAiOutputThumbnailJob) => void; refreshCloudAccount: (silent?: boolean) => Promise<CloudAccountSummary>; showToast: (message: string) => void; getCanvasAiErrorSummary: (error?: string | null) => string; setCanvasAiTimedOutRecoveryTick: React.Dispatch<React.SetStateAction<number>>; canvasAiOutputSourceRecoveryInFlightRef: React.RefObject<Set<string>>; itemsRef: React.RefObject<BufferItem[]>; canvasAiOutputSourceRecoveryRetryAtRef: React.RefObject<Map<string, number>>; canvasAiOutputSourceRecoveryAttemptedRef: React.RefObject<Set<string>>; cacheCanvasGeneratedImageSource: (source: string, name: string, options?: { throwOnFailure?: boolean; }) => Promise<{ url: string; path: string; sourceUrl: string; }>; setItems: React.Dispatch<React.SetStateAction<BufferItem[]>>; CANVAS_AI_OUTPUT_SOURCE_RECOVERY_RETRY_DELAY_MS: 8000; setCanvasAiOutputSourceRecoveryTick: React.Dispatch<React.SetStateAction<number>>; isCanvasInteractingRef: React.RefObject<boolean>; isCanvasZoomingRef: React.RefObject<boolean>; canvasPanRef: React.RefObject<{ pointerId: number; button: number; startClientX: number; startClientY: number; startScrollLeft: number; startScrollTop: number; } | null>; CANVAS_AI_OUTPUT_CACHE_STALE_MS: number; canvasRenderableItems: CanvasImageItem[]; ensureImageThumbnail: (item: BufferItem) => void; canvasAiOutputThumbnailRecoveryAttemptedRef: React.RefObject<Set<string>>; canvasNavItems: { item: CanvasImageItem; box: CanvasItemBox; }[]; canvasNavThumbnailCacheRef: React.RefObject<Map<string, CanvasNavThumbnailCacheEntry>>; isCanvasNavigatorVisible: boolean; getCanvasItemNavPreview: (canvasItem: CanvasImageItem) => CanvasNavPreview | null; getCanvasNavThumbnailSignature: (canvasItem: CanvasImageItem, preview?: CanvasNavPreview | null) => string; setCanvasNavThumbnailRevision: React.Dispatch<React.SetStateAction<number>>; setCanvasToolbarTop: React.Dispatch<React.SetStateAction<string>>; canvasToolbarRef: React.RefObject<HTMLDivElement | null>; canvasNavigatorPanelRef: React.RefObject<HTMLDivElement | null>; CANVAS_NAV_PANEL_TOP_MARGIN: 12; canvasHandleOcclusionInputsRef: React.RefObject<{ renderedItems: CanvasImageItem[]; connections: unknown; renderScale: number; selectedIds: string[]; } | null>; renderedItems: CanvasImageItem[]; connections: unknown; canvasConnections: { source: CanvasImageItem; target: CanvasImageItem; }[]; renderScale: number; canvasRenderScale: number; selectedIds: string[]; canvasSelectedIds: string[]; refreshCanvasConnectionHandleOcclusion: (options?: { renderedItems?: CanvasImageItem[]; affectedItemIds?: ReadonlySet<string>; }) => void; isLicenseGateActive: boolean; isPostInstallLaunchRef: React.RefObject<boolean>; licenseStatus: LicenseStatus | null; isPointerInsideDrawerRef: React.RefObject<boolean>; startupAutoCloseSuppressedRef: React.RefObject<boolean>; clearIdleAutoClose: () => void; closeTimerRef: React.RefObject<any>; startupAutoCloseTimerRef: React.RefObject<any>; isStartupOverlayActive: boolean; setIsOpen: React.Dispatch<React.SetStateAction<boolean>>; setDrawerState: React.Dispatch<React.SetStateAction<"closed" | "pre_open" | "open" | "closing">>; stateRef: React.RefObject<{ isOpen: boolean; isPinned: boolean; showTextInput: boolean; isSearchActive: boolean; isAntiTouchMode: boolean; }>; isOpen: boolean; drawerWidthRef: React.RefObject<number>; drawerHeightRef: React.RefObject<number>; triggerModeRef: React.RefObject<TriggerMode>; };

export const runDerivedUiEffect01 = (ctx: Pick<derivedUiEffectContext, 'activeCanvasIdRef' | 'addGeneratedImagesToDrawer' | 'canvasAiTimedOutRecoveryInFlightRef' | 'canvasAiTimedOutRecoverySettledRef' | 'canvasItems' | 'canvasItemsRef' | 'enqueueCanvasAiOutputThumbnailJob' | 'getCanvasAiErrorSummary' | 'isCanvasMode' | 'refreshCloudAccount' | 'scheduleCanvasChangedNodesPatchSave' | 'scheduleCanvasStateSave' | 'setCanvasAiTimedOutRecoveryTick' | 'showToast' | 'updateCanvasItemsImmediate'>) => {
  const { activeCanvasIdRef, addGeneratedImagesToDrawer, canvasAiTimedOutRecoveryInFlightRef, canvasAiTimedOutRecoverySettledRef, canvasItems, canvasItemsRef, enqueueCanvasAiOutputThumbnailJob, getCanvasAiErrorSummary, isCanvasMode, refreshCloudAccount, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, setCanvasAiTimedOutRecoveryTick, showToast, updateCanvasItemsImmediate } = ctx;
    if (!isCanvasMode) return;
    const availableSlots = Math.max(
      0,
      2 - canvasAiTimedOutRecoveryInFlightRef.current.size,
    );
    if (availableSlots === 0) return;

    const candidates = getCanvasAiTimedOutRecoveryCandidates(canvasItems)
      .filter(({ canvasItem, output, outputIndex, clientRequestId }) => {
        const recoveryKey = `${canvasItem.id}:${output.id || outputIndex}:${clientRequestId}`;
        return !canvasAiTimedOutRecoverySettledRef.current.has(recoveryKey)
          && !canvasAiTimedOutRecoveryInFlightRef.current.has(recoveryKey);
      })
      .slice(0, availableSlots);

    candidates.forEach((candidate) => {
      const {
        canvasItem,
        output,
        outputIndex,
        clientRequestId,
      } = candidate;
      const recoveryKey = `${canvasItem.id}:${output.id || outputIndex}:${clientRequestId}`;
      canvasAiTimedOutRecoveryInFlightRef.current.add(recoveryKey);
      let shouldPollAgain = false;

      void getCloudWalletImageGenerationByRequest(clientRequestId)
        .then(async (lookup) => {
          if (isCanvasAiImageLookupPending(lookup.status)) {
            shouldPollAgain = true;
            return;
          }
          const recoveredImages = getCloudWalletImageLookupImages(lookup);
          if (recoveredImages.length === 0) {
            canvasAiTimedOutRecoverySettledRef.current.add(recoveryKey);
            return;
          }

          const source = recoveredImages[0]?.trim();
          if (!source) {
            canvasAiTimedOutRecoverySettledRef.current.add(recoveryKey);
            return;
          }
          const latestCanvasItem = canvasItemsRef.current.find(item => item.id === canvasItem.id);
          const latestOutput = latestCanvasItem?.ai?.outputs?.[outputIndex];
          if (
            !latestCanvasItem
            || !latestOutput
            || latestOutput.clientRequestId !== clientRequestId
          ) {
            canvasAiTimedOutRecoverySettledRef.current.add(recoveryKey);
            return;
          }

          const recoveredAt = Date.now();
          const remoteResult = buildCanvasAiOutputRemoteResultPatch(source);
          const recoveredOutput: CanvasAiGeneratedOutput = {
            ...latestOutput,
            taskId: clientRequestId,
            clientRequestId,
            mediaType: 'image',
            ...remoteResult,
            status: 'success',
            error: undefined,
            generatedAt: recoveredAt,
          };
          const recoveredOutputs = latestCanvasItem.ai!.outputs!.map((currentOutput, index) => (
            index === outputIndex ? recoveredOutput : currentOutput
          ));
          const allRecovered = recoveredOutputs.every(currentOutput => currentOutput.status === 'success');
          const recoveredCanvasItem: CanvasImageItem = {
            ...latestCanvasItem,
            ai: {
              ...latestCanvasItem.ai!,
              outputs: recoveredOutputs,
              status: allRecovered ? 'success' : 'error',
              error: allRecovered ? undefined : latestCanvasItem.ai?.error,
              generatedAt: recoveredAt,
            },
          };
          updateCanvasItemsImmediate(prev => prev.map(item => (
            item.id === recoveredCanvasItem.id ? recoveredCanvasItem : item
          )));
          const drawerItem = createCanvasAiOutputBufferItem(
            recoveredCanvasItem,
            recoveredOutput,
            outputIndex,
          );
          if (drawerItem) {
            addGeneratedImagesToDrawer([drawerItem], {
              canvasId: activeCanvasIdRef.current || DEFAULT_CANVAS_ID,
              canvasOutputClientRequestId: clientRequestId,
            });
          }
          scheduleCanvasChangedNodesPatchSave([recoveredCanvasItem.id]);
          scheduleCanvasStateSave({ syncNodes: false });
          enqueueCanvasAiOutputThumbnailJob({
            key: `timed-out-recovered:${recoveredCanvasItem.id}:${recoveredOutput.id}:${source}`,
            canvasItemId: recoveredCanvasItem.id,
            outputIndex,
            outputId: recoveredOutput.id,
            source,
          });
          canvasAiTimedOutRecoverySettledRef.current.add(recoveryKey);
          void refreshCloudAccount(true).catch(() => {});
          showToast('已自动找回一张此前超时的生成图片');
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error || '');
          if (/image_request_not_found|invalid_request/i.test(message)) {
            canvasAiTimedOutRecoverySettledRef.current.add(recoveryKey);
            return;
          }
          shouldPollAgain = true;
          console.warn('超时生图任务自动恢复查询失败:', getCanvasAiErrorSummary(message));
        })
        .finally(() => {
          canvasAiTimedOutRecoveryInFlightRef.current.delete(recoveryKey);
          if (shouldPollAgain) {
            window.setTimeout(() => {
              setCanvasAiTimedOutRecoveryTick(value => value + 1);
            }, 8_000);
          } else {
            window.setTimeout(() => {
              setCanvasAiTimedOutRecoveryTick(value => value + 1);
            }, 180);
          }
        });
    });

};

export const runDerivedUiEffect02 = (ctx: Pick<derivedUiEffectContext, 'CANVAS_AI_OUTPUT_SOURCE_RECOVERY_RETRY_DELAY_MS' | 'cacheCanvasGeneratedImageSource' | 'canvasAiOutputSourceRecoveryAttemptedRef' | 'canvasAiOutputSourceRecoveryInFlightRef' | 'canvasAiOutputSourceRecoveryRetryAtRef' | 'canvasItems' | 'enqueueCanvasAiOutputThumbnailJob' | 'isCanvasMode' | 'itemsRef' | 'scheduleCanvasChangedNodesPatchSave' | 'scheduleCanvasStateSave' | 'setCanvasAiOutputSourceRecoveryTick' | 'setItems' | 'updateCanvasItemsImmediate'>) => {
  const { CANVAS_AI_OUTPUT_SOURCE_RECOVERY_RETRY_DELAY_MS, cacheCanvasGeneratedImageSource, canvasAiOutputSourceRecoveryAttemptedRef, canvasAiOutputSourceRecoveryInFlightRef, canvasAiOutputSourceRecoveryRetryAtRef, canvasItems, enqueueCanvasAiOutputThumbnailJob, isCanvasMode, itemsRef, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, setCanvasAiOutputSourceRecoveryTick, setItems, updateCanvasItemsImmediate } = ctx;
    if (!isCanvasMode) return;
    const availableSlots = Math.max(
      0,
      CANVAS_AI_OUTPUT_SOURCE_RECOVERY_CONCURRENCY
        - canvasAiOutputSourceRecoveryInFlightRef.current.size,
    );
    if (availableSlots === 0) return;

    const drawerItemsById = new Map(itemsRef.current.map(item => [item.id, item]));
    const candidates = canvasItems.flatMap((canvasItem) => (
      getCanvasAiOutputPreviewSlots(canvasItem).map((output, outputIndex) => {
        const mediaType = output.mediaType || getCanvasAiMediaType(canvasItem.ai);
        const source = output.sourceUrl || output.url || '';
        const drawerItem = output.id ? drawerItemsById.get(output.id) : undefined;
        const drawerPath = drawerItem?.type === mediaType ? String(drawerItem.path || '').trim() : '';
        const drawerCanRepair = output.status === 'success' && !output.path && !!drawerPath;
        const stableSource = getAutoRecoverableAiMediaResultSource({
          mediaType,
          status: output.status,
          cacheStatus: output.cacheStatus,
          path: output.path,
          source,
        });
        const recoveryKey = drawerCanRepair
          ? `${canvasItem.id}:${output.id || outputIndex}:drawer:${drawerPath}`
          : stableSource
            ? `${canvasItem.id}:${output.id || outputIndex}:${stableSource}`
          : '';
        const retryAt = recoveryKey
          ? (canvasAiOutputSourceRecoveryRetryAtRef.current.get(recoveryKey) || 0)
          : 0;
        const shouldRecover = (drawerCanRepair || !!stableSource)
          && !!recoveryKey
          && retryAt <= Date.now()
          && !canvasAiOutputSourceRecoveryAttemptedRef.current.has(recoveryKey)
          && !canvasAiOutputSourceRecoveryInFlightRef.current.has(recoveryKey);
        return shouldRecover
          ? { canvasItem, output, outputIndex, stableSource, recoveryKey, drawerItem, drawerPath, mediaType }
          : null;
      })
    )).filter((candidate): candidate is NonNullable<typeof candidate> => !!candidate);

    candidates.slice(0, availableSlots).forEach((candidate) => {
      const {
        canvasItem,
        output,
        outputIndex,
        stableSource,
        recoveryKey,
        drawerItem,
        drawerPath,
        mediaType,
      } = candidate;
      canvasAiOutputSourceRecoveryAttemptedRef.current.add(recoveryKey);
      canvasAiOutputSourceRecoveryRetryAtRef.current.delete(recoveryKey);
      if (drawerItem && drawerPath) {
        const localUrl = convertFileSrc(drawerPath);
        updateCanvasItemsImmediate(prev => prev.map((item) => {
          if (item.id !== canvasItem.id || !item.ai?.outputs?.length) return item;
          let changed = false;
          const outputs = item.ai.outputs.map((currentOutput, currentIndex) => {
            const matches = output.id
              ? currentOutput.id === output.id
              : currentIndex === outputIndex;
            if (!matches) return currentOutput;
            changed = true;
            return {
              ...currentOutput,
              mediaType,
              url: localUrl,
              path: drawerPath,
              sourceUrl: currentOutput.sourceUrl || drawerItem.sourceUrl || drawerItem.originalUrl,
              thumbnail: currentOutput.thumbnail || drawerItem.thumbnail,
              cacheStatus: 'ready' as const,
            };
          });
          return changed ? { ...item, ai: { ...item.ai, outputs } } : item;
        }));
        scheduleCanvasChangedNodesPatchSave([canvasItem.id]);
        scheduleCanvasStateSave({ syncNodes: false });
        return;
      }
      if (!stableSource) return;
      canvasAiOutputSourceRecoveryInFlightRef.current.add(recoveryKey);
      let shouldRetrySourceRecovery = false;
      void cacheCanvasGeneratedImageSource(
        stableSource,
        output.name || output.taskId || output.id || `recovered-${outputIndex + 1}`,
      ).then((cached) => {
        if (!cached.path) throw new Error('旧节点恢复没有返回本地缓存文件');
        updateCanvasItemsImmediate(prev => prev.map((item) => {
          if (item.id !== canvasItem.id || !item.ai?.outputs?.length) return item;
          let changed = false;
          const outputs = item.ai.outputs.map((currentOutput, currentIndex) => {
            const matches = output.id
              ? currentOutput.id === output.id
              : currentIndex === outputIndex;
            if (!matches) return currentOutput;
            changed = true;
            return {
              ...currentOutput,
              url: cached.url,
              path: cached.path,
              sourceUrl: stableSource,
              cacheStatus: 'ready' as const,
            };
          });
          return changed ? { ...item, ai: { ...item.ai, outputs } } : item;
        }));
        if (output.id) {
          setItems(prev => prev.map(item => item.id === output.id
            ? {
              ...item,
              url: cached.url,
              path: cached.path,
              sourceUrl: stableSource,
              originalUrl: stableSource,
            }
            : item));
        }
        scheduleCanvasChangedNodesPatchSave([canvasItem.id]);
        scheduleCanvasStateSave({ syncNodes: false });
        if (mediaType === 'image') {
          enqueueCanvasAiOutputThumbnailJob({
            key: `recovered:${canvasItem.id}:${output.id || outputIndex}:${cached.path}`,
            canvasItemId: canvasItem.id,
            outputIndex,
            outputId: output.id,
            source: cached.url,
            path: cached.path,
          });
        }
      }).catch((error) => {
        // A paid, successful result remains recoverable for the lifetime of
        // its stable API URL. Do not permanently abandon it after a short
        // age window; reopening the canvas must be able to try again.
        shouldRetrySourceRecovery = true;
        canvasAiOutputSourceRecoveryRetryAtRef.current.set(
          recoveryKey,
          Date.now() + CANVAS_AI_OUTPUT_SOURCE_RECOVERY_RETRY_DELAY_MS,
        );
        canvasAiOutputSourceRecoveryAttemptedRef.current.delete(recoveryKey);
        updateCanvasItemsImmediate(prev => prev.map((item) => {
          if (item.id !== canvasItem.id || !item.ai?.outputs?.length) return item;
          const outputs = item.ai.outputs.map((currentOutput, currentIndex) => {
            const matches = output.id
              ? currentOutput.id === output.id
              : currentIndex === outputIndex;
            return matches && currentOutput.cacheStatus !== 'ready'
              ? { ...currentOutput, sourceUrl: stableSource, cacheStatus: 'failed' as const }
              : currentOutput;
          });
          return { ...item, ai: { ...item.ai, outputs } };
        }));
        console.warn('AI output source recovery failed; will retry from the stable API URL:', error);
      }).finally(() => {
        canvasAiOutputSourceRecoveryInFlightRef.current.delete(recoveryKey);
        window.setTimeout(() => {
          setCanvasAiOutputSourceRecoveryTick(value => value + 1);
        }, shouldRetrySourceRecovery ? CANVAS_AI_OUTPUT_SOURCE_RECOVERY_RETRY_DELAY_MS : 180);
      });
    });

};

export const runDerivedUiEffect03 = (ctx: Pick<derivedUiEffectContext, 'CANVAS_AI_OUTPUT_CACHE_STALE_MS' | 'canvasAiOutputThumbnailRecoveryAttemptedRef' | 'canvasPanRef' | 'canvasRenderableItems' | 'enqueueCanvasAiOutputThumbnailJob' | 'ensureImageThumbnail' | 'isCanvasInteractingRef' | 'isCanvasMode' | 'isCanvasZoomingRef' | 'scheduleCanvasChangedNodesPatchSave' | 'scheduleCanvasStateSave' | 'updateCanvasItemsImmediate'>) => {
  const { CANVAS_AI_OUTPUT_CACHE_STALE_MS, canvasAiOutputThumbnailRecoveryAttemptedRef, canvasPanRef, canvasRenderableItems, enqueueCanvasAiOutputThumbnailJob, ensureImageThumbnail, isCanvasInteractingRef, isCanvasMode, isCanvasZoomingRef, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, updateCanvasItemsImmediate } = ctx;
    if (!isCanvasMode) return;
    if (isCanvasInteractingRef.current || isCanvasZoomingRef.current || canvasPanRef.current) return;
    const reconcilePendingOutputs = () => {
      const cutoff = Date.now() - CANVAS_AI_OUTPUT_CACHE_STALE_MS;
      const changedIds = new Set<string>();
      updateCanvasItemsImmediate(prev => prev.map(canvasItem => {
        if (!canvasItem.ai?.outputs?.length) return canvasItem;
        let changed = false;
        const outputs = canvasItem.ai.outputs.map((output) => {
          if (output.cacheStatus !== 'pending') return output;
          if (output.thumbnail) {
            changed = true;
            return { ...output, cacheStatus: 'ready' as const };
          }
          if (output.path || !output.generatedAt || output.generatedAt > cutoff) return output;
          changed = true;
          return { ...output, cacheStatus: 'failed' as const };
        });
        if (changed) changedIds.add(canvasItem.id);
        return changed ? { ...canvasItem, ai: { ...canvasItem.ai, outputs } } : canvasItem;
      }));
      if (changedIds.size > 0) {
        scheduleCanvasChangedNodesPatchSave(Array.from(changedIds));
        scheduleCanvasStateSave({ syncNodes: false });
      }
    };
    const pendingWithoutPath = canvasRenderableItems
      .flatMap(canvasItem => getCanvasAiOutputPreviewSlots(canvasItem))
      .filter(output => output.status === 'success' && output.cacheStatus === 'pending' && !output.path && !!output.generatedAt);
    const hasCompletedPendingOutput = canvasRenderableItems
      .flatMap(canvasItem => getCanvasAiOutputPreviewSlots(canvasItem))
      .some(output => output.status === 'success' && output.cacheStatus === 'pending' && !!output.thumbnail);
    const staleDelay = pendingWithoutPath.length > 0
      ? Math.max(0, Math.min(...pendingWithoutPath.map(output => (
        (output.generatedAt || Date.now()) + CANVAS_AI_OUTPUT_CACHE_STALE_MS - Date.now()
      ))))
      : null;
    canvasRenderableItems.forEach((canvasItem) => {
      const hasImageSourceAsset = !!(canvasItem.item.url || canvasItem.item.path || canvasItem.item.sourceUrl || canvasItem.item.originalUrl || canvasItem.item.thumbnail);
      if (canvasItem.item.type === 'image' && !canvasItem.item.thumbnail && hasImageSourceAsset) ensureImageThumbnail(canvasItem.item);
      getCanvasAiOutputPreviewSlots(canvasItem).forEach((output, outputIndex) => {
        const mediaType = output.mediaType || getCanvasAiMediaType(canvasItem.ai);
        if (mediaType !== 'image' || output.thumbnail || output.status !== 'success') return;
        const recoveryKey = `${canvasItem.id}:${output.id || outputIndex}:${output.path || output.url || ''}`;
        if (output.cacheStatus === 'failed') {
          if (!output.path || canvasAiOutputThumbnailRecoveryAttemptedRef.current.has(recoveryKey)) return;
          canvasAiOutputThumbnailRecoveryAttemptedRef.current.add(recoveryKey);
        }
        if (output.cacheStatus === 'pending' && !output.path) return;
        const source = getCanvasAiOutputDisplaySource(output);
        if (!source) return;
        enqueueCanvasAiOutputThumbnailJob({
          key: output.id && output.path
            ? `output:${output.id}:${output.path}`
            : `${canvasItem.id}:${output.id || outputIndex}:${source}`,
          canvasItemId: canvasItem.id,
          outputIndex,
          outputId: output.id,
          source,
          path: output.path,
        });
      });
    });
    if (hasCompletedPendingOutput || staleDelay === 0) reconcilePendingOutputs();
    if (staleDelay === null || staleDelay === 0) return;
    const staleTimer = window.setTimeout(reconcilePendingOutputs, staleDelay);
    return () => window.clearTimeout(staleTimer);

};

export const runDerivedUiEffect04 = (ctx: Pick<derivedUiEffectContext, 'canvasNavItems' | 'canvasNavThumbnailCacheRef' | 'canvasPanRef' | 'getCanvasItemNavPreview' | 'getCanvasNavThumbnailSignature' | 'isCanvasInteractingRef' | 'isCanvasMode' | 'isCanvasNavigatorVisible' | 'isCanvasZoomingRef' | 'setCanvasNavThumbnailRevision'>) => {
  const { canvasNavItems, canvasNavThumbnailCacheRef, canvasPanRef, getCanvasItemNavPreview, getCanvasNavThumbnailSignature, isCanvasInteractingRef, isCanvasMode, isCanvasNavigatorVisible, isCanvasZoomingRef, setCanvasNavThumbnailRevision } = ctx;
    if (!isCanvasMode) return;
    const activeIds = new Set(canvasNavItems.map(({ item }) => item.id));
    for (const cacheId of canvasNavThumbnailCacheRef.current.keys()) {
      if (!activeIds.has(cacheId)) {
        canvasNavThumbnailCacheRef.current.delete(cacheId);
      }
    }
    if (!isCanvasNavigatorVisible) return;
    if (isCanvasInteractingRef.current || isCanvasZoomingRef.current || canvasPanRef.current) return;

    canvasNavItems.forEach(({ item }) => {
      const preview = getCanvasItemNavPreview(item);
      const signature = getCanvasNavThumbnailSignature(item, preview);
      const current = canvasNavThumbnailCacheRef.current.get(item.id);
      if (current?.signature === signature) return;
      if (!preview?.source) {
        canvasNavThumbnailCacheRef.current.set(item.id, {
          signature,
          thumbnail: '',
          status: 'empty',
        });
        setCanvasNavThumbnailRevision(value => value + 1);
        return;
      }

      canvasNavThumbnailCacheRef.current.set(item.id, {
        signature,
        thumbnail: '',
        status: 'loading',
      });
      setCanvasNavThumbnailRevision(value => value + 1);
      const loader = preview.mediaType === 'video'
        ? createCanvasNavVideoThumbnailInWebview
        : createCanvasNavImageThumbnailInWebview;
      void loader(preview.source)
        .then((thumbnail) => {
          const latest = canvasNavThumbnailCacheRef.current.get(item.id);
          if (!latest || latest.signature !== signature) return;
          canvasNavThumbnailCacheRef.current.set(item.id, {
            signature,
            thumbnail,
            status: thumbnail ? 'ready' : 'error',
          });
          setCanvasNavThumbnailRevision(value => value + 1);
        })
        .catch((err) => {
          console.warn('画布导航缩略图缓存失败:', err);
          const latest = canvasNavThumbnailCacheRef.current.get(item.id);
          if (!latest || latest.signature !== signature) return;
          canvasNavThumbnailCacheRef.current.set(item.id, {
            signature,
            thumbnail: '',
            status: 'error',
          });
          setCanvasNavThumbnailRevision(value => value + 1);
      });
    });

};

export const runDerivedUiEffect05 = (ctx: Pick<derivedUiEffectContext, 'CANVAS_NAV_PANEL_TOP_MARGIN' | 'canvasNavigatorPanelRef' | 'canvasToolbarRef' | 'isCanvasMode' | 'isCanvasNavigatorVisible' | 'setCanvasToolbarTop'>) => {
  const { CANVAS_NAV_PANEL_TOP_MARGIN, canvasNavigatorPanelRef, canvasToolbarRef, isCanvasMode, isCanvasNavigatorVisible, setCanvasToolbarTop } = ctx;
    if (!isCanvasMode) {
      setCanvasToolbarTop('50%');
      return;
    }
    if (!isCanvasNavigatorVisible) {
      setCanvasToolbarTop('50%');
      return;
    }

    const updateCanvasToolbarTop = () => {
      const toolbarHeight = canvasToolbarRef.current?.getBoundingClientRect().height || 40;
      const panelHeight = canvasNavigatorPanelRef.current?.getBoundingClientRect().height || 0;
      const minTop = CANVAS_NAV_PANEL_TOP_MARGIN + panelHeight + (toolbarHeight / 2) + 8;
      const nextTop = Math.max(window.innerHeight * 0.5, minTop);
      setCanvasToolbarTop(`${Math.round(nextTop)}px`);
    };

    updateCanvasToolbarTop();

    const handleResize = () => updateCanvasToolbarTop();
    window.addEventListener('resize', handleResize);
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(handleResize)
      : null;
    if (observer) {
      if (canvasToolbarRef.current) observer.observe(canvasToolbarRef.current);
      if (canvasNavigatorPanelRef.current) observer.observe(canvasNavigatorPanelRef.current);
    }
    return () => {
      window.removeEventListener('resize', handleResize);
      observer?.disconnect();
    };

};

export const runDerivedUiEffect06 = (ctx: Pick<derivedUiEffectContext, 'canvasConnections' | 'canvasHandleOcclusionInputsRef' | 'canvasRenderScale' | 'canvasRenderableItems' | 'canvasSelectedIds' | 'isCanvasMode' | 'refreshCanvasConnectionHandleOcclusion'>) => {
  const { canvasConnections, canvasHandleOcclusionInputsRef, canvasRenderScale, canvasRenderableItems, canvasSelectedIds, isCanvasMode, refreshCanvasConnectionHandleOcclusion } = ctx;
    if (!isCanvasMode) {
      canvasHandleOcclusionInputsRef.current = null;
      return;
    }
    const previous = canvasHandleOcclusionInputsRef.current;
    const selectionOnlyUpdate = !!previous
      && previous.renderedItems === canvasRenderableItems
      && previous.connections === canvasConnections
      && previous.renderScale === canvasRenderScale;
    const affectedItemIds = selectionOnlyUpdate
      ? new Set([
        ...previous.selectedIds.filter(id => !canvasSelectedIds.includes(id)),
        ...canvasSelectedIds.filter(id => !previous.selectedIds.includes(id)),
      ])
      : undefined;
    canvasHandleOcclusionInputsRef.current = {
      renderedItems: canvasRenderableItems,
      connections: canvasConnections,
      renderScale: canvasRenderScale,
      selectedIds: canvasSelectedIds,
    };
    const frame = window.requestAnimationFrame(() => refreshCanvasConnectionHandleOcclusion({
      renderedItems: canvasRenderableItems,
      affectedItemIds,
    }));
    return () => window.cancelAnimationFrame(frame);

};

export const runDerivedUiEffect07 = (ctx: Pick<derivedUiEffectContext, 'clearIdleAutoClose' | 'closeTimerRef' | 'drawerHeightRef' | 'drawerWidthRef' | 'isLicenseGateActive' | 'isPointerInsideDrawerRef' | 'isPostInstallLaunchRef' | 'isStartupOverlayActive' | 'licenseStatus' | 'setDrawerState' | 'setIsOpen' | 'startupAutoCloseSuppressedRef' | 'startupAutoCloseTimerRef' | 'stateRef' | 'triggerModeRef'>) => {
  const { clearIdleAutoClose, closeTimerRef, drawerHeightRef, drawerWidthRef, isLicenseGateActive, isPointerInsideDrawerRef, isPostInstallLaunchRef, isStartupOverlayActive, licenseStatus, setDrawerState, setIsOpen, startupAutoCloseSuppressedRef, startupAutoCloseTimerRef, stateRef, triggerModeRef } = ctx;
    // Do not keep the startup registration gate above the browser/email window.
    // Restore the normal drawer behavior after the gate is dismissed.
    void invoke('set_topmost', { topmost: !isLicenseGateActive }).catch(() => {});
    if (!isLicenseGateActive) return;
    if (shouldDeferLicenseGateForPostInstall({
      isPostInstallLaunch: isPostInstallLaunchRef.current,
      isLicenseLoaded: licenseStatus !== null,
    })) return;

    isPointerInsideDrawerRef.current = true;
    startupAutoCloseSuppressedRef.current = true;
    clearIdleAutoClose();
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (startupAutoCloseTimerRef.current) {
      clearTimeout(startupAutoCloseTimerRef.current);
      startupAutoCloseTimerRef.current = null;
    }
    if (!isStartupOverlayActive) {
      setIsOpen(true);
      setDrawerState('open');
    }
    if (shouldInvokeLicenseGateDrawerOpen({
      isLicenseGateActive,
      isStartupOverlayActive,
      isDrawerAlreadyOpen: stateRef.current.isOpen,
    })) {
      void invoke('open_drawer', {
        width: drawerWidthRef.current,
        height: drawerHeightRef.current,
        mode: triggerModeRef.current,
      }).catch(() => {});
    }

    const blockWhenOutsideLicenseGate = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-license-gate="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const events = [
      'keydown',
      'keyup',
      'keypress',
      'paste',
      'drop',
      'dragover',
      'dragenter',
      'pointerdown',
      'mousedown',
      'mouseup',
      'click',
      'dblclick',
      'contextmenu',
      'wheel',
    ];

    events.forEach(eventName => {
      window.addEventListener(eventName, blockWhenOutsideLicenseGate, true);
      document.addEventListener(eventName, blockWhenOutsideLicenseGate, true);
    });

    return () => {
      events.forEach(eventName => {
        window.removeEventListener(eventName, blockWhenOutsideLicenseGate, true);
        document.removeEventListener(eventName, blockWhenOutsideLicenseGate, true);
      });
    };

};
