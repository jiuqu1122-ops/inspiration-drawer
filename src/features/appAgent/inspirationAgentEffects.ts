import React,{ startTransition } from 'react';
import { ASSET_PAGE_SIZE,getInspirationAnalysisCounts,listAssets,updateAssetsBatch } from '../../services/assetsApi';
import { DEFAULT_LIBRARY_ID } from '../../services/canvasApi';
import { BufferItem } from '../../types';
import { AUTO_INSPIRATION_ANALYSIS_MAX_ATTEMPTS,getInspirationAnalysisRetryAt,shouldSkipInspirationAnalysis,type InspirationProfile } from './inspirationMemory';

type inspirationAgentEffectContext = { autoInspirationAnalysisLastUserActivityAtRef: React.RefObject<number>; AUTO_INSPIRATION_ANALYSIS_ENABLED: true; isDataLoaded: boolean; isAutoAiAnalysisStartupReady: boolean; isDraggingTitle: boolean; isResizingState: React.RefObject<boolean>; autoInspirationAnalysisRunningRef: React.RefObject<boolean>; AUTO_INSPIRATION_ANALYSIS_UI_IDLE_MS: 1200; autoInspirationAnalysisRetryTimersRef: React.RefObject<Set<number>>; setAutoAiAnalysisRetryTick: React.Dispatch<React.SetStateAction<number>>; assetStorageMode: "initializing" | "sqlite" | "json"; setSqliteAiAnalysisSummary: React.Dispatch<React.SetStateAction<{ analyzed: number; skipped: number; waitingRetry: number; total: number; } | null>>; analyzed: number; skipped: number; waitingRetry: number; total: number; setAutoAiAnalysisProgress: React.Dispatch<React.SetStateAction<{ completed: number; failed: number; total: number; } | null>>; completed: number; failed: number; itemsRef: React.RefObject<BufferItem[]>; updateAssetsFromQuery: (updatedAssets: BufferItem[]) => void; isAutoAiTaggableItem: (item: BufferItem) => boolean; scheduleAutoAiAnalysisRetry: (failure?: BufferItem["inspirationAnalysisFailure"]) => void; autoInspirationAnalysisPendingIdsRef: React.RefObject<Set<string>>; autoInspirationAnalysisAttemptedRef: React.RefObject<Set<string>>; analyzeDrawerInspirationWithLlm: (input: { itemId: string; imageSource?: string; existingProfile?: InspirationProfile; userTags?: string[]; userNotes?: string[]; forceRefresh?: boolean; }) => Promise<InspirationProfile>; recordAutoAiAnalysisFailure: (itemId: string, error: unknown) => Promise<{ attemptedAt: number; attempts: number; message: string; } | undefined>; items: BufferItem[]; };

export const runInspirationAgentEffect01 = (ctx: Pick<inspirationAgentEffectContext, 'autoInspirationAnalysisLastUserActivityAtRef'>) => {
  const { autoInspirationAnalysisLastUserActivityAtRef } = ctx;
    const recordUserActivity = () => {
      autoInspirationAnalysisLastUserActivityAtRef.current = Date.now();
    };
    window.addEventListener('pointerdown', recordUserActivity, { passive: true });
    window.addEventListener('pointermove', recordUserActivity, { passive: true });
    window.addEventListener('keydown', recordUserActivity);
    window.addEventListener('wheel', recordUserActivity, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', recordUserActivity);
      window.removeEventListener('pointermove', recordUserActivity);
      window.removeEventListener('keydown', recordUserActivity);
      window.removeEventListener('wheel', recordUserActivity);
    };

};

export const runInspirationAgentEffect02 = (ctx: Pick<inspirationAgentEffectContext, 'AUTO_INSPIRATION_ANALYSIS_ENABLED' | 'AUTO_INSPIRATION_ANALYSIS_UI_IDLE_MS' | 'analyzeDrawerInspirationWithLlm' | 'assetStorageMode' | 'autoInspirationAnalysisAttemptedRef' | 'autoInspirationAnalysisLastUserActivityAtRef' | 'autoInspirationAnalysisPendingIdsRef' | 'autoInspirationAnalysisRetryTimersRef' | 'autoInspirationAnalysisRunningRef' | 'isAutoAiAnalysisStartupReady' | 'isAutoAiTaggableItem' | 'isDataLoaded' | 'isDraggingTitle' | 'isResizingState' | 'items' | 'itemsRef' | 'recordAutoAiAnalysisFailure' | 'scheduleAutoAiAnalysisRetry' | 'setAutoAiAnalysisProgress' | 'setAutoAiAnalysisRetryTick' | 'setSqliteAiAnalysisSummary' | 'updateAssetsFromQuery'>) => {
  const { AUTO_INSPIRATION_ANALYSIS_ENABLED, AUTO_INSPIRATION_ANALYSIS_UI_IDLE_MS, analyzeDrawerInspirationWithLlm, assetStorageMode, autoInspirationAnalysisAttemptedRef, autoInspirationAnalysisLastUserActivityAtRef, autoInspirationAnalysisPendingIdsRef, autoInspirationAnalysisRetryTimersRef, autoInspirationAnalysisRunningRef, isAutoAiAnalysisStartupReady, isAutoAiTaggableItem, isDataLoaded, isDraggingTitle, isResizingState, items, itemsRef, recordAutoAiAnalysisFailure, scheduleAutoAiAnalysisRetry, setAutoAiAnalysisProgress, setAutoAiAnalysisRetryTick, setSqliteAiAnalysisSummary, updateAssetsFromQuery } = ctx;
    if (
      !AUTO_INSPIRATION_ANALYSIS_ENABLED
      || !isDataLoaded
      || !isAutoAiAnalysisStartupReady
      || isDraggingTitle
      || isResizingState.current
      || autoInspirationAnalysisRunningRef.current
    ) return;

    const idleFor = Date.now() - autoInspirationAnalysisLastUserActivityAtRef.current;
    if (idleFor < AUTO_INSPIRATION_ANALYSIS_UI_IDLE_MS) {
      const timer = window.setTimeout(() => {
        autoInspirationAnalysisRetryTimersRef.current.delete(timer);
        setAutoAiAnalysisRetryTick(current => current + 1);
      }, AUTO_INSPIRATION_ANALYSIS_UI_IDLE_MS - idleFor + 50);
      autoInspirationAnalysisRetryTimersRef.current.add(timer);
      return;
    }

    if (assetStorageMode === 'sqlite') {
      autoInspirationAnalysisRunningRef.current = true;
      let activeItemId = '';
      let recordedFailure: BufferItem['inspirationAnalysisFailure'];
      let continueImmediately = false;

      const refreshDatabaseProgress = async () => {
        const { total, analyzed, waitingRetry, skipped } = await getInspirationAnalysisCounts(
          DEFAULT_LIBRARY_ID,
        );
        const summary = { analyzed, skipped, waitingRetry, total };
        setSqliteAiAnalysisSummary(current => (
          current
          && current.analyzed === summary.analyzed
          && current.skipped === summary.skipped
          && current.waitingRetry === summary.waitingRetry
          && current.total === summary.total
            ? current
            : summary
        ));
        setAutoAiAnalysisProgress(current => {
          const completed = Math.min(total, analyzed + skipped);
          if (
            current
            && current.completed === completed
            && current.failed === waitingRetry
            && current.total === total
          ) return current;
          return { completed, failed: waitingRetry, total };
        });
        return summary;
      };

      const markUnusableCandidatesSkipped = async (candidates: BufferItem[]) => {
        const now = Date.now();
        const updated = candidates.flatMap(item => {
          const hasSource = Boolean(
            item.url || item.thumbnail || item.path || item.sourceUrl || item.originalUrl,
          );
          const shouldSkip = shouldSkipInspirationAnalysis(item.inspirationAnalysisFailure);
          if (hasSource && !shouldSkip) return [];
          return [{
            ...item,
            inspirationAnalysisFailure: {
              attemptedAt: item.inspirationAnalysisFailure?.attemptedAt || now,
              attempts: AUTO_INSPIRATION_ANALYSIS_MAX_ATTEMPTS,
              message: item.inspirationAnalysisFailure?.message
                || '图片素材没有可读取的图像来源',
            },
          }];
        });
        if (updated.length === 0) return 0;
        await updateAssetsBatch(updated.map(item => ({
          ids: [item.id],
          patch: { metadata: item },
        })));
        const updatedById = new Map(updated.map(item => [item.id, item]));
        itemsRef.current = itemsRef.current.map(item => updatedById.get(item.id) || item);
        startTransition(() => updateAssetsFromQuery(updated));
        return updated.length;
      };

      void (async () => {
        await refreshDatabaseProgress();
        const unprocessed = await listAssets({
          file_type: 'image',
          inspiration_status: 'unprocessed',
          sort: 'created_at_asc',
          offset: 0,
          limit: ASSET_PAGE_SIZE,
        });
        let nextItem = unprocessed.find(isAutoAiTaggableItem);
        if (!nextItem && unprocessed.length > 0) {
          continueImmediately = await markUnusableCandidatesSkipped(unprocessed) > 0;
          return;
        }

        if (!nextItem) {
          const retryable = await listAssets({
            file_type: 'image',
            inspiration_status: 'retryable',
            sort: 'updated_at_asc',
            offset: 0,
            limit: ASSET_PAGE_SIZE,
          });
          const normalizedSkipped = await markUnusableCandidatesSkipped(retryable);
          if (normalizedSkipped > 0) {
            continueImmediately = true;
            return;
          }
          nextItem = retryable.find(isAutoAiTaggableItem);
          if (!nextItem) {
            const nextFailure = retryable
              .map(item => item.inspirationAnalysisFailure)
              .filter((failure): failure is NonNullable<typeof failure> => Boolean(failure))
              .sort((left, right) => (
                getInspirationAnalysisRetryAt(left) - getInspirationAnalysisRetryAt(right)
              ))[0];
            scheduleAutoAiAnalysisRetry(nextFailure);
            return;
          }
        }

        activeItemId = nextItem.id;
        autoInspirationAnalysisPendingIdsRef.current.add(activeItemId);
        autoInspirationAnalysisAttemptedRef.current.add(activeItemId);
        try {
          await analyzeDrawerInspirationWithLlm({ itemId: activeItemId });
        } catch (error) {
          recordedFailure = await recordAutoAiAnalysisFailure(activeItemId, error);
          console.warn('灵感素材后台分析失败:', activeItemId, error);
        }
        // The wallet API limits task creation to 20 requests per minute.
        await new Promise(resolve => window.setTimeout(resolve, 3200));
        continueImmediately = true;
      })()
        .catch(error => {
          console.warn('SQLite 全库图片分析调度失败:', error);
          const timer = window.setTimeout(() => {
            autoInspirationAnalysisRetryTimersRef.current.delete(timer);
            setAutoAiAnalysisRetryTick(current => current + 1);
          }, 12_000);
          autoInspirationAnalysisRetryTimersRef.current.add(timer);
        })
        .finally(() => {
          autoInspirationAnalysisRunningRef.current = false;
          if (activeItemId) {
            autoInspirationAnalysisPendingIdsRef.current.delete(activeItemId);
            autoInspirationAnalysisAttemptedRef.current.delete(activeItemId);
          }
          scheduleAutoAiAnalysisRetry(recordedFailure);
          if (continueImmediately) {
            setAutoAiAnalysisRetryTick(current => current + 1);
          }
        });
      return;
    }

    // Existing drawer images are queued on startup; new images join the same
    // single-file queue so visual analysis never floods the provider channel.
    const newlyQueuedIds = items
      .filter(isAutoAiTaggableItem)
      .map(item => item.id)
      .filter(itemId => (
        !autoInspirationAnalysisPendingIdsRef.current.has(itemId)
        && !autoInspirationAnalysisAttemptedRef.current.has(itemId)
      ));
    if (newlyQueuedIds.length > 0) {
      newlyQueuedIds.forEach(itemId => autoInspirationAnalysisPendingIdsRef.current.add(itemId));
      startTransition(() => {
        setAutoAiAnalysisProgress(current => (
          !current || current.completed >= current.total
            ? { completed: 0, failed: 0, total: newlyQueuedIds.length }
            : { ...current, total: current.total + newlyQueuedIds.length }
        ));
      });
    }

    const nextItem = items.find(item => (
      isAutoAiTaggableItem(item)
      && autoInspirationAnalysisPendingIdsRef.current.has(item.id)
      && !autoInspirationAnalysisAttemptedRef.current.has(item.id)
    ));
    if (!nextItem) return;
    autoInspirationAnalysisAttemptedRef.current.add(nextItem.id);
    autoInspirationAnalysisRunningRef.current = true;
    let failed = false;
    let recordedFailure: BufferItem['inspirationAnalysisFailure'];
    void analyzeDrawerInspirationWithLlm({ itemId: nextItem.id })
      .catch(async error => {
        failed = true;
        recordedFailure = await recordAutoAiAnalysisFailure(nextItem.id, error);
        console.warn('灵感素材自动分析失败:', nextItem.id, error);
      })
      .finally(async () => {
        // The wallet API limits task creation to 20 requests per minute.
        await new Promise(resolve => window.setTimeout(resolve, 3200));
        autoInspirationAnalysisRunningRef.current = false;
        autoInspirationAnalysisPendingIdsRef.current.delete(nextItem.id);
        autoInspirationAnalysisAttemptedRef.current.delete(nextItem.id);
        scheduleAutoAiAnalysisRetry(recordedFailure);
        startTransition(() => {
          setAutoAiAnalysisProgress(current => current ? {
            ...current,
            completed: Math.min(current.total, current.completed + 1),
            failed: current.failed + (failed ? 1 : 0),
          } : current);
        });
      });

};
