import { convertFileSrc,invoke } from '@tauri-apps/api/core';
import { Check,Clock,Tag,X } from 'lucide-react';
import React,{ startTransition } from 'react';
import type { AiGatewayKind } from '../../agentModel';
import { DEFAULT_CANVAS_ID,DEFAULT_LIBRARY_ID,type CanvasRecord } from '../../../services/canvasApi';
import { replaceFolders } from '../../../services/libraryApi';
import { createImageThumbnailInWebview,getVideoThumbnail,isLegacyImageThumbnail,readDataImageSize } from '../../../services/mediaThumbnail';
import { BufferItem,FloatingNoteScheduleItem,FloatingNoteSnapshot,Folder } from '../../../types';
import type { CanvasAiOutputThumbnailJob,CanvasImageSourceCacheEntry,ImageThumbnailFileResult } from '../../../types/canvasMedia';
import type { ConfirmDialogState } from '../../../types/dialogs';
import type { DrawerTabType } from '../../../types/drawer';
import type { CloudImageModelsResult } from '../../../types/license';
import { getCanvasAiEndpointForModels,parseCanvasAiHeaders } from '../../../utils/canvasAiConfig';
import { AI_GENERATED_FOLDER_NAME,ensureCanvasGeneratedImageFolders } from '../../../utils/canvasGeneratedFolders';
import { getCanvasAiOutputDisplaySource } from '../../../utils/canvasItemSelectors';
import { isDataImageSourceValue,stripHeavyDataThumbnail } from '../../../utils/canvasSerialization';
import { getDrawerImageLocalDeletePaths } from '../../../utils/localMediaPaths';
import { buildScheduleItemsFromText,formatScheduleDateLabel,getScheduleTextContent,normalizeSchedulePriority,startOfLocalDay,type CalendarScheduleEvent,type SchedulePriority } from '../../calendarModel';
import { buildCanvasAiOutputLocalCachePatch,recoverCanvasAiNodeWithUsableResults,recoverCanvasAiOutputWithUsableResult } from '../../canvasAiOutputs';
import { type CanvasAiGeneratedOutput,type CanvasAiProvider,type CanvasImageItem } from '../../canvasModel';
import { FLOATING_NOTE_LABELS,FLOATING_NOTE_SOURCE_BRIDGE_KEY,FOLDERS_CACHE_STORAGE_KEY,MAX_FLOATING_NOTE_COUNT,TEXT_FLOATING_NOTE_SIZES,floatingNoteStorageKey,getFolderTagIds,readFloatingNoteSnapshot,readOpenFloatingNoteLabels,rememberOpenFloatingNoteLabel } from '../../floatingNotes';
import { getGeneratedImageCacheSource,shouldCacheGeneratedImageAgain } from '../../generatedImageCache';
import { getStableAiImageResultSource,getStableAiVideoResultSource } from '../../aiImageResultRecovery';

type drawerCoreActionContext = { showToast: (message: string) => void; canvasAiUsesCloudImageModels: boolean; setIsTestingCanvasAiConnection: React.Dispatch<React.SetStateAction<boolean>>; effectiveCanvasAiProvider: CanvasAiProvider; setCanvasAiCloudImageModels: React.Dispatch<React.SetStateAction<CloudImageModelsResult | null>>; effectiveCanvasAiEndpoint: string; canvasAiEndpoint: string; isCanvasAiLicenseManaged: boolean; canvasAiApiKey: string; effectiveCanvasAiGatewayKind: AiGatewayKind; effectiveCanvasAiApiProvider: string; effectiveCanvasAiModel: string; canvasAiHeadersText: string; sendSystemNotification: (title: string, body: string, options?: { silent?: boolean; }) => Promise<boolean>; pushDrawerUndoSnapshot: (label: string, options?: { shareImmutableItems?: boolean; }) => void; syncCalendarScheduleSnapshot: (noteLabel: string, snapshot: FloatingNoteSnapshot) => Promise<FloatingNoteSnapshot>; setItems: React.Dispatch<React.SetStateAction<BufferItem[]>>; emitFloatingNoteUpdated: (label: string, snapshot: FloatingNoteSnapshot) => Promise<void>; refreshNoteManager: () => void; calendarTargetNoteLabel: string; CALENDAR_NEW_NOTE_TARGET: "__new_calendar_schedule_note__"; openFloatingNoteEntries: { label: string; snapshot: FloatingNoteSnapshot | null; }[]; label: string; snapshot: FloatingNoteSnapshot | null | undefined; setCalendarTargetNoteLabel: React.Dispatch<React.SetStateAction<string>>; calendarTagFilter: string; calendarDraftText: string; ensureCalendarScheduleNote: (targetLabel?: string) => { label: string; snapshot: FloatingNoteSnapshot; } | null; calendarDraftPriority: SchedulePriority; calendarSelectedDate: number; setCalendarDraftText: React.Dispatch<React.SetStateAction<string>>; patchCalendarScheduleItem: (noteLabel: string, scheduleId: string, patch: Partial<FloatingNoteScheduleItem>) => Promise<void>; focusFloatingNote: (label: string, snapshot?: FloatingNoteSnapshot | null) => Promise<void>; getCalendarTagName: (tagId?: string) => string; deleteCalendarScheduleItem: (event: CalendarScheduleEvent) => Promise<void>; canvasesRef: React.RefObject<CanvasRecord[]>; foldersRef: React.RefObject<Folder[]>; setFolders: React.Dispatch<React.SetStateAction<Folder[]>>; persistFoldersSnapshot: (nextFolders: Folder[]) => void; AI_GENERATED_VIDEO_FOLDER_NAME: "AI视频"; AI_GENERATED_VIDEO_FOLDER_ID: "ai_generated_videos"; AI_GENERATED_VIDEO_FOLDER_COLOR: "#10b981"; insertDrawerFolderAtTop: (currentFolders: Folder[], folder: Folder) => Folder[]; isCanvasInteractingRef: React.RefObject<boolean>; isCanvasZoomingRef: React.RefObject<boolean>; canvasPanRef: React.RefObject<{ pointerId: number; button: number; startClientX: number; startClientY: number; startScrollLeft: number; startScrollTop: number; } | null>; addGeneratedImagesToDrawer: (generatedItems: BufferItem[], options?: { canvasId?: string; onOutputCachePatch?: (outputId: string, matchSources: string[], patch: Partial<CanvasAiGeneratedOutput>) => void; canvasOutputClientRequestId?: string; }) => void; ensureCanvasAiGeneratedFolder: (canvasId?: string | null) => string; activeCanvasIdRef: React.RefObject<string>; generatedImageCachePendingIdsRef: React.RefObject<Set<string>>; updateDrawerItemsDeferred: (updater: (previous: BufferItem[]) => BufferItem[]) => void; webImageCacheDirRef: React.RefObject<string>; enqueueCanvasAiOutputThumbnailJob: (job: CanvasAiOutputThumbnailJob) => void; updateCanvasItemsImmediate: (updater: (prev: CanvasImageItem[]) => CanvasImageItem[]) => CanvasImageItem[]; GENERATED_IMAGE_CACHE_RETRY_DELAYS_MS: number[]; generatedImageCachePromisesRef: React.RefObject<Map<string, Promise<string>>>; setActiveFolderId: React.Dispatch<React.SetStateAction<string>>; setActiveTab: React.Dispatch<React.SetStateAction<DrawerTabType>>; ensureAiGeneratedVideoFolder: () => string; recentMobilePayloadsRef: React.RefObject<Record<string, number>>; isDataLoaded: boolean; assetStorageMode: "initializing" | "sqlite" | "json"; drawerItemsSaveInFlightRef: React.RefObject<boolean>; drawerItemsSaveQueuedRef: React.RefObject<boolean>; itemsRef: React.RefObject<BufferItem[]>; saveDrawerItemsNow: () => void; drawerItemsSaveTimerRef: React.RefObject<number | null>; DRAWER_ITEMS_SAVE_DEBOUNCE_MS: 360; hasRestoredNonEmptyFoldersRef: React.RefObject<boolean>; FOLDERS_CACHE_UPDATED_AT_STORAGE_KEY: "drawer_folders_cache_updated_at"; emitFloatingNoteSourceUpdated: (label: string, payload: Record<string, unknown>) => Promise<void>; removeDrawerItemsFromDrawer: (targetItems: BufferItem[], label?: string) => number; setConfirmDialog: React.Dispatch<React.SetStateAction<ConfirmDialogState>>; deleteDrawerLocalFiles: (paths: string[]) => Promise<{ deleted: number; missing: number; failed: { path: string; error: unknown; }[]; }>; failed: { path: string; error: unknown; }[]; deleted: number; imageThumbnailUpdateTimerRef: React.RefObject<number | null>; imageThumbnailDisposedRef: React.RefObject<boolean>; imageThumbnailPendingUpdatesRef: React.RefObject<Map<string, { thumbnail: string; existingThumbnail?: string; }>>; existingThumbnail: string | undefined; thumbnail: string; canvasPreviewSourceIdsRef: React.RefObject<Set<string>>; canvasImageSourceCacheRef: React.RefObject<Map<string, CanvasImageSourceCacheEntry>>; applyCanvasImageSourceToElement: (id: string, source: string) => void; scheduleCanvasChangedNodesPatchSave: (ids: string[]) => void; scheduleCanvasStateSave: (options?: { syncNodes?: boolean; }) => void; imageThumbnailActiveCountRef: React.RefObject<number>; IMAGE_THUMBNAIL_MAX_CONCURRENCY: 2; imageThumbnailQueueRef: React.RefObject<BufferItem[]>; imageThumbnailInFlightRef: React.RefObject<Set<string>>; scheduleImageThumbnailUpdate: (itemId: string, thumbnail: string, existingThumbnail?: string) => void; runNextImageThumbnailJobs: () => void; IMAGE_THUMBNAIL_QUEUE_LIMIT: 32; videoThumbnailInFlightRef: React.RefObject<Set<string>>; canvasSurfaceRef: React.RefObject<HTMLDivElement | null>; canvasScaleRef: React.RefObject<number>; canvasItemsRef: React.RefObject<CanvasImageItem[]>; };

export const sendSystemNotificationImpl = async (ctx: Pick<drawerCoreActionContext, 'showToast'>, title: string, body: string, options: { silent?: boolean } = {}) => {
  const { showToast } = ctx;
    try {
      await invoke('show_system_notification', { title, body });
      if (!options.silent) showToast('已发送 Windows 通知');
      return true;
    } catch (err) {
      console.error('Windows notification failed:', err);
      if (!options.silent) showToast('Windows 通知发送失败');
      return false;
    }

};

export const testCanvasAiConnectionImpl = async (ctx: Pick<drawerCoreActionContext, 'canvasAiApiKey' | 'canvasAiEndpoint' | 'canvasAiHeadersText' | 'canvasAiUsesCloudImageModels' | 'effectiveCanvasAiApiProvider' | 'effectiveCanvasAiEndpoint' | 'effectiveCanvasAiGatewayKind' | 'effectiveCanvasAiModel' | 'effectiveCanvasAiProvider' | 'isCanvasAiLicenseManaged' | 'setCanvasAiCloudImageModels' | 'setIsTestingCanvasAiConnection' | 'showToast'>) => {
  const { canvasAiApiKey, canvasAiEndpoint, canvasAiHeadersText, canvasAiUsesCloudImageModels, effectiveCanvasAiApiProvider, effectiveCanvasAiEndpoint, effectiveCanvasAiGatewayKind, effectiveCanvasAiModel, effectiveCanvasAiProvider, isCanvasAiLicenseManaged, setCanvasAiCloudImageModels, setIsTestingCanvasAiConnection, showToast } = ctx;
    if (canvasAiUsesCloudImageModels) {
      setIsTestingCanvasAiConnection(true);
      try {
        const result = await invoke<CloudImageModelsResult>('get_cloud_image_models', {
          provider: effectiveCanvasAiProvider,
        });
        const channels = result.channels || [];
        const successfulChannels = channels.filter(channel => !channel.error);
        const models = Array.from(new Set((channels.length > 0
          ? successfulChannels.flatMap(channel => channel.models || [])
          : result.models || []).map(model => model.trim()).filter(Boolean)));
        if (channels.length > 0 && successfulChannels.length === 0) {
          throw new Error(channels.map(channel => `${channel.name}：${channel.error || '读取失败'}`).join('；'));
        }
        setCanvasAiCloudImageModels({ ...result, models });
        showToast(channels.length > 0
          ? `连接成功，读取到 ${successfulChannels.length}/${channels.length} 条生图渠道、${models.length} 个模型`
          : `连接成功，读取到 ${models.length} 个模型`);
      } catch (error) {
        showToast(`授权钱包渠道测试失败：${String(error)}`);
      } finally {
        setIsTestingCanvasAiConnection(false);
      }
      return;
    }
    const endpoint = getCanvasAiEndpointForModels(
      effectiveCanvasAiProvider,
      effectiveCanvasAiEndpoint || canvasAiEndpoint,
    ).trim();
    const apiKey = isCanvasAiLicenseManaged ? '' : canvasAiApiKey.trim();
    if (!endpoint || (!apiKey && !isCanvasAiLicenseManaged)) {
      showToast('请先填写 Canvas API Base URL 和 API Key');
      return;
    }
    setIsTestingCanvasAiConnection(true);
    try {
      const result = await invoke<{ message: string }>('test_canvas_api_connection', {
        endpoint,
        apiKey,
        gatewayKind: effectiveCanvasAiGatewayKind,
        provider: effectiveCanvasAiApiProvider,
        model: effectiveCanvasAiModel,
        headers: isCanvasAiLicenseManaged ? undefined : parseCanvasAiHeaders(canvasAiHeadersText),
      });
      showToast(result.message || 'Canvas API 连接成功');
    } catch (error) {
      showToast(`Canvas API 连接失败：${String(error)}`);
    } finally {
      setIsTestingCanvasAiConnection(false);
    }

};

export const notifyCanvasAiGenerationResultImpl = (ctx: Pick<drawerCoreActionContext, 'sendSystemNotification'>, options: {
    status: 'success' | 'partial' | 'error';
    label: string;
    mediaType: 'image' | 'video';
    generatedCount?: number;
    requestedCount?: number;
    error?: string;
  }) => {
  const { sendSystemNotification } = ctx;
    const label = (options.label || 'AI 节点').trim();
    const unit = options.mediaType === 'video' ? '条视频' : '张图片';
    const generatedCount = Math.max(0, Math.round(Number(options.generatedCount || 0)));
    const requestedCount = Math.max(0, Math.round(Number(options.requestedCount || 0)));
    const title = options.status === 'success'
      ? `${label}生成完成`
      : options.status === 'partial'
        ? `${label}部分完成`
        : `${label}生成失败`;
    const body = options.status === 'success'
      ? `已生成 ${generatedCount} ${unit}，结果已保存到抽屉。`
      : options.status === 'partial'
        ? `已生成 ${generatedCount}/${requestedCount || generatedCount} ${unit}，部分输出失败。`
        : (options.error || '生成失败，请打开灵感抽屉查看详情。');
    void sendSystemNotification(title, body, { silent: true });

};

export const patchCalendarScheduleItemImpl = async (ctx: Pick<drawerCoreActionContext, 'pushDrawerUndoSnapshot' | 'syncCalendarScheduleSnapshot'>, noteLabel: string, scheduleId: string, patch: Partial<FloatingNoteScheduleItem>) => {
  const { pushDrawerUndoSnapshot, syncCalendarScheduleSnapshot } = ctx;
    const snapshot = readFloatingNoteSnapshot(noteLabel);
    if (!snapshot || !Array.isArray(snapshot.scheduleItems)) return;
    pushDrawerUndoSnapshot('修改日程');
    const next = {
      ...snapshot,
      noteMode: 'schedule' as const,
      scheduleItems: snapshot.scheduleItems.map(item => (
        item.id === scheduleId ? { ...item, ...patch, updatedAt: Date.now() } : item
      )),
      updatedAt: Date.now(),
    };
    await syncCalendarScheduleSnapshot(noteLabel, next);

};

export const syncCalendarScheduleSnapshotImpl = async (ctx: Pick<drawerCoreActionContext, 'emitFloatingNoteUpdated' | 'refreshNoteManager' | 'setItems'>, noteLabel: string, snapshot: FloatingNoteSnapshot) => {
  const { emitFloatingNoteUpdated, refreshNoteManager, setItems } = ctx;
    const content = snapshot.type === 'text' && snapshot.noteMode === 'schedule'
      ? getScheduleTextContent(snapshot.scheduleItems)
      : (snapshot.content || '');
    const next = {
      ...snapshot,
      content,
      updatedAt: Date.now(),
    } as FloatingNoteSnapshot;

    localStorage.setItem(floatingNoteStorageKey(noteLabel), JSON.stringify(next));
    if (next.type === 'text') {
      setItems(prev => {
        let found = false;
        const updated = prev.map(item => {
          if (item.id !== next.itemId || item.type !== 'text') return item;
          found = true;
          return {
            ...item,
            type: 'text',
            content,
            name: next.name || item.name || '日程便签',
            url: undefined,
            path: undefined,
            sourceUrl: undefined,
            pageUrl: undefined,
            originalUrl: undefined,
            isUrl: false,
          } as BufferItem;
        });

        if (found || !next.itemId.startsWith('calendar_schedule_')) return updated;
        return [{
          id: next.itemId,
          type: 'text',
          content,
          name: next.name || '日程便签',
          remark: next.name || '日程便签',
          remarks: next.name ? [next.name] : undefined,
          createdAt: next.createdAt || Date.now(),
          folderId: next.folderId,
        } as BufferItem, ...updated];
      });
    }
    await emitFloatingNoteUpdated(noteLabel, next).catch(() => {});
    refreshNoteManager();
    return next;

};

export const deleteCalendarScheduleItemImpl = async (ctx: Pick<drawerCoreActionContext, 'pushDrawerUndoSnapshot' | 'syncCalendarScheduleSnapshot'>, event: CalendarScheduleEvent) => {
  const { pushDrawerUndoSnapshot, syncCalendarScheduleSnapshot } = ctx;
    const snapshot = readFloatingNoteSnapshot(event.noteLabel);
    if (!snapshot || !Array.isArray(snapshot.scheduleItems)) return;
    pushDrawerUndoSnapshot('删除日程');

    const next = {
      ...snapshot,
      noteMode: 'schedule' as const,
      scheduleItems: snapshot.scheduleItems.filter(item => item.id !== event.schedule.id),
      updatedAt: Date.now(),
    };
    await syncCalendarScheduleSnapshot(event.noteLabel, next);

};

export const ensureCalendarScheduleNoteImpl = (ctx: Pick<drawerCoreActionContext, 'CALENDAR_NEW_NOTE_TARGET' | 'calendarTagFilter' | 'openFloatingNoteEntries' | 'setCalendarTargetNoteLabel' | 'showToast'>, targetLabel: string) => {
  const { CALENDAR_NEW_NOTE_TARGET, calendarTagFilter, openFloatingNoteEntries, setCalendarTargetNoteLabel, showToast } = ctx;
    if (targetLabel !== CALENDAR_NEW_NOTE_TARGET) {
      const target = openFloatingNoteEntries.find(entry => entry.label === targetLabel);
      const snapshot = readFloatingNoteSnapshot(targetLabel) || target?.snapshot;
      if (
        snapshot?.type === 'text' &&
        snapshot.noteMode === 'schedule' &&
        Array.isArray(snapshot.scheduleItems)
      ) {
        return { label: targetLabel, snapshot };
      }
      setCalendarTargetNoteLabel(CALENDAR_NEW_NOTE_TARGET);
      showToast('这个日程便签不可用，已改为新建');
    }

    const openLabels = readOpenFloatingNoteLabels();
    const label = FLOATING_NOTE_LABELS.find(item => !openLabels.includes(item));
    if (!label) {
      showToast(`最多同时保存 ${MAX_FLOATING_NOTE_COUNT} 个桌面便签，请先关闭一个`);
      return null;
    }

    const now = Date.now();
    const tagIds = calendarTagFilter !== 'all' && calendarTagFilter !== 'untagged' ? [calendarTagFilter] : [];
    const snapshot: FloatingNoteSnapshot = {
      id: `calendar_schedule_${now}`,
      itemId: `calendar_schedule_${now}`,
      type: 'text',
      name: '日程便签',
      content: '',
      noteMode: 'schedule',
      scheduleItems: [],
      tagIds,
      createdAt: now,
      updatedAt: now,
      width: TEXT_FLOATING_NOTE_SIZES.large.width,
      height: TEXT_FLOATING_NOTE_SIZES.large.height,
    };

    localStorage.setItem(floatingNoteStorageKey(label), JSON.stringify(snapshot));
    rememberOpenFloatingNoteLabel(label);
    return { label, snapshot };

};

export const addCalendarScheduleItemImpl = async (ctx: Pick<drawerCoreActionContext, 'CALENDAR_NEW_NOTE_TARGET' | 'calendarDraftPriority' | 'calendarDraftText' | 'calendarSelectedDate' | 'calendarTagFilter' | 'calendarTargetNoteLabel' | 'ensureCalendarScheduleNote' | 'pushDrawerUndoSnapshot' | 'setCalendarDraftText' | 'setCalendarTargetNoteLabel' | 'syncCalendarScheduleSnapshot'>) => {
  const { CALENDAR_NEW_NOTE_TARGET, calendarDraftPriority, calendarDraftText, calendarSelectedDate, calendarTagFilter, calendarTargetNoteLabel, ensureCalendarScheduleNote, pushDrawerUndoSnapshot, setCalendarDraftText, setCalendarTargetNoteLabel, syncCalendarScheduleSnapshot } = ctx;
    const text = calendarDraftText.trim();
    if (!text) return;

    const requestedTargetLabel = calendarTargetNoteLabel;
    const target = ensureCalendarScheduleNote(requestedTargetLabel);
    if (!target) return;
    pushDrawerUndoSnapshot('新增日程');

    const tagIds = calendarTagFilter === 'untagged'
      ? []
      : (calendarTagFilter !== 'all'
        ? [calendarTagFilter]
        : getFolderTagIds(target.snapshot.folderId, target.snapshot.tagIds));
    const now = Date.now();
    const nextItem: FloatingNoteScheduleItem = {
      id: `schedule_${now}_${Math.random().toString(36).slice(2, 7)}`,
      text,
      done: false,
      priority: calendarDraftPriority,
      startAt: startOfLocalDay(calendarSelectedDate),
      allDay: true,
      tagIds,
      sourceItemId: target.snapshot.itemId,
      createdAt: now,
    };
    const next = {
      ...target.snapshot,
      type: 'text' as const,
      noteMode: 'schedule' as const,
      scheduleItems: [...(target.snapshot.scheduleItems || []), nextItem],
      updatedAt: now,
    };

    await syncCalendarScheduleSnapshot(target.label, next);
    if (requestedTargetLabel === CALENDAR_NEW_NOTE_TARGET) {
      setCalendarTargetNoteLabel(target.label);
    }
    setCalendarDraftText('');

};

export const renderCalendarEventImpl = (ctx: Pick<drawerCoreActionContext, 'deleteCalendarScheduleItem' | 'focusFloatingNote' | 'getCalendarTagName' | 'patchCalendarScheduleItem'>, event: CalendarScheduleEvent) => {
  const { deleteCalendarScheduleItem, focusFloatingNote, getCalendarTagName, patchCalendarScheduleItem } = ctx;
    const primaryTagId = event.tagIds[0];
    const priority = normalizeSchedulePriority(event.schedule.priority);
    return (
      <div
        key={event.id}
        data-calendar-event="true"
        className="group/calendar-event rounded-[14px] border border-stone-200 bg-white px-3 py-2.5 shadow-none transition-[background-color,border-color] hover:border-stone-300 hover:bg-stone-50/80 dark:border-stone-700 dark:bg-stone-900/72 dark:hover:border-stone-600 dark:hover:bg-stone-800/72"
      >
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => patchCalendarScheduleItem(event.noteLabel, event.schedule.id, { done: !event.schedule.done })}
            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[6px] border transition-colors ${
              event.schedule.done
                ? 'border-stone-800 bg-stone-800 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900'
                : 'border-stone-300 bg-white/75 text-transparent dark:border-stone-600 dark:bg-stone-950'
            }`}
            title={event.schedule.done ? '标记为未完成' : '标记为完成'}
          >
            <Check className="h-3 w-3" strokeWidth={3} />
          </button>
          <button
            type="button"
            onClick={() => focusFloatingNote(event.noteLabel, event.note)}
            className="min-w-0 flex-1 text-left"
            title="打开来源便签"
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <span
                data-calendar-priority={priority}
                className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-[5px] px-1 text-[9px] font-black leading-none"
              >
                {priority}
              </span>
              <div className={`min-w-0 flex-1 truncate text-xs font-bold ${event.schedule.done ? 'text-stone-400 line-through dark:text-stone-500' : 'text-stone-800 dark:text-stone-100'}`}>
                {event.title}
              </div>
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-semibold">
              <span className="inline-flex items-center gap-1 text-stone-500 dark:text-stone-400">
                <Clock className="h-3 w-3" />
                {formatScheduleDateLabel(event.schedule.startAt)}
              </span>
              <span className="inline-flex items-center gap-1 text-stone-500 dark:text-stone-400">
                <Tag className="h-3 w-3" />
                {getCalendarTagName(primaryTagId)}
              </span>
              <span className="min-w-0 truncate text-stone-400/90 dark:text-stone-500">{event.sourceTitle}</span>
            </div>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              deleteCalendarScheduleItem(event);
            }}
            className="shrink-0 rounded-[10px] p-1 text-stone-300 opacity-70 transition-all hover:bg-red-50 hover:text-red-500 hover:opacity-100 dark:text-stone-600 dark:hover:bg-red-900/25 dark:hover:text-red-300"
            title="删除待办"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );

};

export const ensureCanvasAiGeneratedFolderImpl = (ctx: Pick<drawerCoreActionContext, 'canvasesRef' | 'foldersRef' | 'persistFoldersSnapshot' | 'setFolders'>, canvasId?: string | null) => {
  const { canvasesRef, foldersRef, persistFoldersSnapshot, setFolders } = ctx;
    const normalizedCanvasId = canvasId?.trim() || DEFAULT_CANVAS_ID;
    const canvasName = canvasesRef.current.find(canvas => canvas.id === normalizedCanvasId)?.name;
    const current = ensureCanvasGeneratedImageFolders(
      foldersRef.current,
      normalizedCanvasId,
      canvasName,
    );
    if (current.folders === foldersRef.current) return current.folderId;

    foldersRef.current = current.folders;
    setFolders(prev => {
      const ensured = ensureCanvasGeneratedImageFolders(
        prev,
        normalizedCanvasId,
        canvasName,
      );
      if (ensured.folders === prev) return prev;
      foldersRef.current = ensured.folders;
      persistFoldersSnapshot(ensured.folders);
      return ensured.folders;
    });
    return current.folderId;

};

export const ensureAiGeneratedVideoFolderImpl = (ctx: Pick<drawerCoreActionContext, 'AI_GENERATED_VIDEO_FOLDER_COLOR' | 'AI_GENERATED_VIDEO_FOLDER_ID' | 'AI_GENERATED_VIDEO_FOLDER_NAME' | 'foldersRef' | 'insertDrawerFolderAtTop' | 'persistFoldersSnapshot' | 'setFolders'>) => {
  const { AI_GENERATED_VIDEO_FOLDER_COLOR, AI_GENERATED_VIDEO_FOLDER_ID, AI_GENERATED_VIDEO_FOLDER_NAME, foldersRef, insertDrawerFolderAtTop, persistFoldersSnapshot, setFolders } = ctx;
    const existing = foldersRef.current.find(folder => folder.name === AI_GENERATED_VIDEO_FOLDER_NAME);
    if (existing) return existing.id;

    const newFolder: Folder = {
      id: AI_GENERATED_VIDEO_FOLDER_ID,
      name: AI_GENERATED_VIDEO_FOLDER_NAME,
      color: AI_GENERATED_VIDEO_FOLDER_COLOR,
    };
    setFolders(prev => {
      if (prev.some(folder => folder.id === newFolder.id || folder.name === newFolder.name)) return prev;
      const nextFolders = insertDrawerFolderAtTop(prev, newFolder);
      persistFoldersSnapshot(nextFolders);
      return nextFolders;
    });
    return newFolder.id;

};

export const addGeneratedImagesToDrawerImpl = (ctx: Pick<drawerCoreActionContext, 'GENERATED_IMAGE_CACHE_RETRY_DELAYS_MS' | 'activeCanvasIdRef' | 'addGeneratedImagesToDrawer' | 'canvasPanRef' | 'enqueueCanvasAiOutputThumbnailJob' | 'ensureCanvasAiGeneratedFolder' | 'generatedImageCachePendingIdsRef' | 'generatedImageCachePromisesRef' | 'isCanvasInteractingRef' | 'isCanvasZoomingRef' | 'setActiveFolderId' | 'setActiveTab' | 'updateCanvasItemsImmediate' | 'updateDrawerItemsDeferred' | 'webImageCacheDirRef'>, generatedItems: BufferItem[], options?: {
      canvasId?: string;
      onOutputCachePatch?: (
        outputId: string,
        matchSources: string[],
        patch: Partial<CanvasAiGeneratedOutput>
      ) => void;
      canvasOutputClientRequestId?: string;
    }) => {
  const { GENERATED_IMAGE_CACHE_RETRY_DELAYS_MS, activeCanvasIdRef, addGeneratedImagesToDrawer, canvasPanRef, enqueueCanvasAiOutputThumbnailJob, ensureCanvasAiGeneratedFolder, generatedImageCachePendingIdsRef, generatedImageCachePromisesRef, isCanvasInteractingRef, isCanvasZoomingRef, setActiveFolderId, setActiveTab, updateCanvasItemsImmediate, updateDrawerItemsDeferred, webImageCacheDirRef } = ctx;
    if (isCanvasInteractingRef.current || isCanvasZoomingRef.current || canvasPanRef.current) {
      window.setTimeout(() => addGeneratedImagesToDrawer(generatedItems, options), 180);
      return;
    }
    const cleanItems = generatedItems.filter(item => item.type === 'image');
    if (cleanItems.length === 0) return;

    const folderId = ensureCanvasAiGeneratedFolder(
      options?.canvasId || activeCanvasIdRef.current || DEFAULT_CANVAS_ID,
    );
    const now = Date.now();
    const savedItems = cleanItems.map((item, index) => {
      const savedItem = stripHeavyDataThumbnail(item);
      const { remark: _promptRemark, remarks: _promptRemarks, ...itemWithoutPromptNotes } = savedItem;
      return {
        ...itemWithoutPromptNotes,
        folderId,
        createdAt: item.createdAt || now + index,
        isQuickAccess: false,
      } as BufferItem;
    });
    const savedIds = new Set(savedItems.map(item => item.id));
    savedItems.forEach((item) => {
      if (shouldCacheGeneratedImageAgain(item)) {
        generatedImageCachePendingIdsRef.current.add(item.id);
      }
    });
    updateDrawerItemsDeferred(prev => [
      ...savedItems.filter(item => !prev.some(existing => existing.id === item.id)),
      ...prev,
    ]);
    const latestCacheDir = (
      webImageCacheDirRef.current ||
      localStorage.getItem('drawer_web_image_cache_dir') ||
      ''
    ).trim();

    savedItems.forEach((item) => {
      const source = getStableAiImageResultSource(getGeneratedImageCacheSource(item))
        || getStableAiVideoResultSource(getGeneratedImageCacheSource(item))
        || getGeneratedImageCacheSource(item);
      if (!source) return;
      if (!shouldCacheGeneratedImageAgain(item)) {
        if (item.thumbnail) return;
        const localPreviewSource = item.url || (item.path ? convertFileSrc(item.path) : source);
        enqueueCanvasAiOutputThumbnailJob({
          key: `drawer-local:${item.id}:${item.path || localPreviewSource}`,
          outputId: item.id,
          drawerItemId: item.id,
          source: localPreviewSource,
          path: item.path,
        });
        return;
      }

      const patchMatchingOutputs = (patch: Partial<CanvasAiGeneratedOutput>, matchSources = [source]) => {
        const sourceSet = new Set(matchSources.filter(Boolean));
        if (!options?.onOutputCachePatch) {
          updateCanvasItemsImmediate(prev => prev.map(canvasItem => {
            if (!canvasItem.ai?.outputs?.length) return canvasItem;
            let changed = false;
            const outputs = canvasItem.ai.outputs.map((output) => {
              const outputSource = getCanvasAiOutputDisplaySource(output);
              const matchesOutput = output.id === item.id || sourceSet.has(outputSource);
              const matchesGeneration = !options?.canvasOutputClientRequestId
                || output.id === item.id
                || output.clientRequestId === options.canvasOutputClientRequestId
                || output.taskId === options.canvasOutputClientRequestId;
              if (!matchesOutput || !matchesGeneration) return output;
              changed = true;
              return recoverCanvasAiOutputWithUsableResult({ ...output, ...patch });
            });
            return changed
              ? recoverCanvasAiNodeWithUsableResults({ ...canvasItem, ai: { ...canvasItem.ai, outputs } })
              : canvasItem;
          }));
        }
        options?.onOutputCachePatch?.(item.id, Array.from(sourceSet), patch);
      };

      const cacheGeneratedImage = async () => {
        let lastError: unknown = new Error('网页图片缓存没有返回文件路径');
        const retryDelays = /^https?:\/\//i.test(source)
          ? GENERATED_IMAGE_CACHE_RETRY_DELAYS_MS
          : [];
        for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
          try {
            const cachedPath = await invoke<string>('cache_web_image', {
              // Keep the stable result URL intact. The native downloader follows
              // its short-lived HTTPS storage redirect without exposing that URL.
              url: source,
              name: item.name || item.content || AI_GENERATED_FOLDER_NAME,
              dir: latestCacheDir || undefined,
            });
            if (cachedPath) return cachedPath;
            lastError = new Error('网页图片缓存没有返回文件路径');
          } catch (err) {
            lastError = err;
          }
          if (attempt < retryDelays.length) {
            await new Promise<void>(resolve => window.setTimeout(resolve, retryDelays[attempt]));
          }
        }
        throw lastError;
      };

      const cachePromise = cacheGeneratedImage();
      generatedImageCachePromisesRef.current.set(source, cachePromise);
      cachePromise
        .then((cachedPath) => {
          if (!cachedPath) {
            generatedImageCachePendingIdsRef.current.delete(item.id);
            updateDrawerItemsDeferred(prev => prev.map(existing => existing.id === item.id ? { ...existing } : existing));
            patchMatchingOutputs({ cacheStatus: 'failed' });
            return;
          }
          const cachedUrl = convertFileSrc(cachedPath);
          const sourceIsDataImage = isDataImageSourceValue(source);
          const originalUrl = sourceIsDataImage || isDataImageSourceValue(item.originalUrl)
            ? undefined
            : item.originalUrl || source;
          const cachedItem = {
            ...item,
            url: cachedUrl,
            path: cachedPath,
            sourceUrl: sourceIsDataImage ? undefined : source,
            originalUrl,
          } as BufferItem;
          updateDrawerItemsDeferred(prev => prev.map(existing => existing.id === item.id ? cachedItem : existing));
          if (!options?.onOutputCachePatch) {
            updateCanvasItemsImmediate(prev => prev.map(canvasItem => (
              canvasItem.item.id === item.id
                ? { ...canvasItem, item: cachedItem }
                : canvasItem
            )));
          }
          const matchSources = [source, cachedUrl];
          patchMatchingOutputs(buildCanvasAiOutputLocalCachePatch(cachedPath), matchSources);
          enqueueCanvasAiOutputThumbnailJob({
            key: `output:${item.id}:${cachedPath}`,
            outputId: item.id,
            matchSources,
            drawerItemId: item.id,
            source: cachedUrl,
            path: cachedPath,
            onSettled: (patch) => {
              options?.onOutputCachePatch?.(item.id, matchSources, patch);
            },
          });
        })
        .catch((err) => {
          console.warn('AI 生图缓存失败:', err);
          generatedImageCachePendingIdsRef.current.delete(item.id);
          updateDrawerItemsDeferred(prev => prev.map(existing => existing.id === item.id
            ? {
              ...existing,
              url: source,
              sourceUrl: source,
              originalUrl: source,
            }
            : existing));
          patchMatchingOutputs({
            url: source,
            sourceUrl: source,
            cacheStatus: 'failed',
          });
        })
        .finally(() => {
          if (generatedImageCachePromisesRef.current.get(source) === cachePromise) {
            generatedImageCachePromisesRef.current.delete(source);
          }
        });
    });

    if (savedIds.size > 0) {
      startTransition(() => {
        setActiveFolderId(folderId);
        setActiveTab('image');
      });
    }

};

export const addGeneratedVideosToDrawerImpl = (ctx: Pick<drawerCoreActionContext, 'ensureAiGeneratedVideoFolder' | 'setActiveFolderId' | 'setActiveTab' | 'updateDrawerItemsDeferred'>, generatedItems: BufferItem[]) => {
  const { ensureAiGeneratedVideoFolder, setActiveFolderId, setActiveTab, updateDrawerItemsDeferred } = ctx;
    const cleanItems = generatedItems.filter(item => item.type === 'video');
    if (cleanItems.length === 0) return;

    const folderId = ensureAiGeneratedVideoFolder();
    const now = Date.now();
    const savedItems = cleanItems.map((item, index) => ({
      ...stripHeavyDataThumbnail(item),
      folderId,
      createdAt: item.createdAt || now + index,
      isQuickAccess: false,
    } as BufferItem));
    const savedIds = new Set(savedItems.map(item => item.id));
    updateDrawerItemsDeferred(prev => [
      ...savedItems.filter(item => !prev.some(existing => existing.id === item.id)),
      ...prev,
    ]);
    if (savedIds.size > 0) {
      startTransition(() => {
        setActiveFolderId(folderId);
        setActiveTab('video');
      });
    }

};

export const shouldAcceptMobilePayloadImpl = (ctx: Pick<drawerCoreActionContext, 'recentMobilePayloadsRef'>, data: any) => {
  const { recentMobilePayloadsRef } = ctx;
    const explicitSignature = typeof data?.mobileSignature === 'string' ? data.mobileSignature : '';
    const fallbackSignature = [
      data?.type || '',
      data?.name || '',
      data?.path || '',
      data?.url || '',
      data?.content || '',
    ].join('\n');
    const signature = explicitSignature || fallbackSignature;
    if (!signature.trim()) return true;

    const now = Date.now();
    const recent = recentMobilePayloadsRef.current;
    Object.keys(recent).forEach(key => {
      if (now - recent[key] > 8000) delete recent[key];
    });

    if (recent[signature] && now - recent[signature] < 2500) {
      recent[signature] = now;
      return false;
    }

    recent[signature] = now;
    return true;

};

export const saveDrawerItemsNowImpl = (ctx: Pick<drawerCoreActionContext, 'assetStorageMode' | 'drawerItemsSaveInFlightRef' | 'drawerItemsSaveQueuedRef' | 'isDataLoaded' | 'itemsRef' | 'saveDrawerItemsNow'>) => {
  const { assetStorageMode, drawerItemsSaveInFlightRef, drawerItemsSaveQueuedRef, isDataLoaded, itemsRef, saveDrawerItemsNow } = ctx;
    if (!isDataLoaded || assetStorageMode !== 'json') return;
    if (drawerItemsSaveInFlightRef.current) {
      drawerItemsSaveQueuedRef.current = true;
      return;
    }
    drawerItemsSaveInFlightRef.current = true;
    const snapshot = itemsRef.current.map(stripHeavyDataThumbnail);
    void invoke('save_items', { items: snapshot })
      .catch(error => console.warn('保存抽屉素材失败:', error))
      .finally(() => {
        drawerItemsSaveInFlightRef.current = false;
        if (!drawerItemsSaveQueuedRef.current) return;
        drawerItemsSaveQueuedRef.current = false;
        saveDrawerItemsNow();
      });

};

export const scheduleDrawerItemsSaveImpl = (ctx: Pick<drawerCoreActionContext, 'DRAWER_ITEMS_SAVE_DEBOUNCE_MS' | 'drawerItemsSaveTimerRef' | 'isDataLoaded' | 'saveDrawerItemsNow'>) => {
  const { DRAWER_ITEMS_SAVE_DEBOUNCE_MS, drawerItemsSaveTimerRef, isDataLoaded, saveDrawerItemsNow } = ctx;
    if (!isDataLoaded) return;
    if (drawerItemsSaveTimerRef.current !== null) {
      window.clearTimeout(drawerItemsSaveTimerRef.current);
    }
    drawerItemsSaveTimerRef.current = window.setTimeout(() => {
      drawerItemsSaveTimerRef.current = null;
      saveDrawerItemsNow();
    }, DRAWER_ITEMS_SAVE_DEBOUNCE_MS);

};

export const persistFoldersSnapshotImpl = (ctx: Pick<drawerCoreActionContext, 'FOLDERS_CACHE_UPDATED_AT_STORAGE_KEY' | 'hasRestoredNonEmptyFoldersRef'>, nextFolders: Folder[]) => {
  const { FOLDERS_CACHE_UPDATED_AT_STORAGE_KEY, hasRestoredNonEmptyFoldersRef } = ctx;
    if (nextFolders.length > 0) {
      hasRestoredNonEmptyFoldersRef.current = true;
    }
    if (nextFolders.length === 0 && !hasRestoredNonEmptyFoldersRef.current) {
      return;
    }
    localStorage.setItem(FOLDERS_CACHE_STORAGE_KEY, JSON.stringify(nextFolders));
    localStorage.setItem(FOLDERS_CACHE_UPDATED_AT_STORAGE_KEY, String(Date.now()));
    invoke('save_folders', { folders: nextFolders, allowEmpty: true, allow_empty: true }).catch(err => {
      console.warn('保存文件夹树失败:', err);
    });
    replaceFolders(nextFolders, DEFAULT_LIBRARY_ID).catch(err => {
      console.warn('同步文件夹树到后端失败:', err);
    });

};

export const broadcastFloatingNoteTextUpdateImpl = (ctx: Pick<drawerCoreActionContext, 'emitFloatingNoteSourceUpdated'>, itemId: string, content?: string, name?: string, sourceLabel?: string) => {
  const { emitFloatingNoteSourceUpdated } = ctx;
    const labels = readOpenFloatingNoteLabels();

    labels.forEach((label) => {
      try {
        if (sourceLabel && label === sourceLabel) return;
        const snapshot = readFloatingNoteSnapshot(label);
        if (!snapshot || snapshot.itemId !== itemId || snapshot.type !== 'text') return;

        const nextContent = typeof content === 'string' ? content : snapshot.content;
        const nextScheduleItems = typeof content === 'string' && snapshot.noteMode === 'schedule'
          ? buildScheduleItemsFromText(nextContent || '', snapshot.scheduleItems || [], {
            tagIds: getFolderTagIds(snapshot.folderId, snapshot.tagIds),
            sourceItemId: itemId,
            defaultPriority: 'B',
          })
          : snapshot.scheduleItems;
        const nextSnapshot = {
          ...snapshot,
          content: nextContent,
          name: typeof name === 'string' ? name : snapshot.name,
          scheduleItems: nextScheduleItems,
          updatedAt: Date.now(),
        };

        localStorage.setItem(floatingNoteStorageKey(label), JSON.stringify(nextSnapshot));
        const payload = {
          itemId,
          ...(typeof content === 'string' ? { content } : {}),
          ...(typeof name === 'string' ? { name } : {}),
          ...(typeof content === 'string' && snapshot.noteMode === 'schedule' ? { scheduleItems: nextScheduleItems } : {}),
          updatedAt: Date.now(),
        };
        localStorage.setItem(FLOATING_NOTE_SOURCE_BRIDGE_KEY, JSON.stringify(payload));
        emitFloatingNoteSourceUpdated(label, payload).catch(() => {});
      } catch (_) {}
    });

};

export const broadcastFloatingNoteTitleUpdateImpl = (ctx: Pick<drawerCoreActionContext, 'emitFloatingNoteSourceUpdated'>, itemId: string, name: string, sourceLabel?: string) => {
  const { emitFloatingNoteSourceUpdated } = ctx;
    const labels = readOpenFloatingNoteLabels();

    labels.forEach((label) => {
      try {
        if (sourceLabel && label === sourceLabel) return;
        const snapshot = readFloatingNoteSnapshot(label);
        if (!snapshot || snapshot.itemId !== itemId || snapshot.type !== 'text') return;

        const nextSnapshot = {
          ...snapshot,
          name,
          updatedAt: Date.now(),
        };

        localStorage.setItem(floatingNoteStorageKey(label), JSON.stringify(nextSnapshot));
        const payload = {
          itemId,
          name,
          updatedAt: Date.now(),
        };
        localStorage.setItem(FLOATING_NOTE_SOURCE_BRIDGE_KEY, JSON.stringify(payload));
        emitFloatingNoteSourceUpdated(label, payload).catch(() => {});
      } catch (_) {}
    });

};

export const applyFloatingTextPayloadToSnapshotsImpl = (ctx: Pick<drawerCoreActionContext, 'refreshNoteManager'>, payload: any) => {
  const { refreshNoteManager } = ctx;
    const itemId = typeof payload?.itemId === 'string' ? payload.itemId : '';
    const hasContent = typeof payload?.content === 'string';
    const hasName = typeof payload?.name === 'string';
    const payloadScheduleItems = Array.isArray(payload?.scheduleItems)
      ? payload.scheduleItems as FloatingNoteScheduleItem[]
      : undefined;
    const payloadNoteMode = payload?.noteMode === 'schedule' || payload?.noteMode === 'text'
      ? payload.noteMode as FloatingNoteSnapshot['noteMode']
      : undefined;
    if (!itemId || (!hasContent && !hasName && !payloadScheduleItems && !payloadNoteMode)) return;

    let didUpdateSnapshot = false;
    readOpenFloatingNoteLabels().forEach((label) => {
      try {
        const snapshot = readFloatingNoteSnapshot(label);
        if (!snapshot || snapshot.itemId !== itemId || snapshot.type !== 'text') return;

        const nextContent = hasContent ? payload.content : snapshot.content;
        const nextName = hasName ? payload.name.trim() : snapshot.name;
        const nextNoteMode = payloadNoteMode || snapshot.noteMode;
        const nextScheduleItems = payloadScheduleItems || (
          hasContent && nextNoteMode === 'schedule'
            ? buildScheduleItemsFromText(nextContent || '', snapshot.scheduleItems || [], {
              tagIds: getFolderTagIds(snapshot.folderId, snapshot.tagIds),
              sourceItemId: itemId,
              defaultPriority: 'B',
            })
            : snapshot.scheduleItems
        );

        const nextSnapshot = {
          ...snapshot,
          ...(hasContent ? { content: nextContent } : {}),
          ...(hasName ? { name: nextName } : {}),
          ...(payloadNoteMode ? { noteMode: nextNoteMode } : {}),
          ...(nextScheduleItems ? { scheduleItems: nextScheduleItems } : {}),
          updatedAt: Date.now(),
        } as FloatingNoteSnapshot;

        localStorage.setItem(floatingNoteStorageKey(label), JSON.stringify(nextSnapshot));
        didUpdateSnapshot = true;
      } catch (_) {}
    });

    if (didUpdateSnapshot) refreshNoteManager();

};

export const deleteDrawerLocalFilesImpl = async (ctx: Record<never, never>, paths: string[]) => {
  const {  } = ctx;
    let deleted = 0;
    let missing = 0;
    const failed: Array<{ path: string; error: unknown }> = [];

    for (const path of Array.from(new Set(paths.filter(Boolean)))) {
      try {
        const didDelete = await invoke<boolean>('delete_local_file', { path });
        if (didDelete) deleted += 1;
        else missing += 1;
      } catch (error) {
        console.warn('删除本地文件失败:', path, error);
        failed.push({ path, error });
      }
    }

    return { deleted, missing, failed };

};

export const requestDeleteDrawerItemsImpl = (ctx: Pick<drawerCoreActionContext, 'deleteDrawerLocalFiles' | 'removeDrawerItemsFromDrawer' | 'setConfirmDialog' | 'showToast'>, targetItems: BufferItem[], options: { label?: string; afterDelete?: () => void } = {}) => {
  const { deleteDrawerLocalFiles, removeDrawerItemsFromDrawer, setConfirmDialog, showToast } = ctx;
    const deletableItems = targetItems.filter(item => item && !item.isQuickAccess);
    if (deletableItems.length === 0) {
      showToast('已开启星标保护，请先取消星标再删除');
      return;
    }

    const label = options.label || (deletableItems.length > 1 ? '批量删除' : '删除卡片');
    const localPaths = Array.from(new Set(deletableItems.flatMap(getDrawerImageLocalDeletePaths)));
    const imageCount = deletableItems.filter(item => item.type === 'image').length;
    const singleItem = deletableItems.length === 1 ? deletableItems[0] : null;
    const singleName = singleItem ? (singleItem.name || singleItem.content || '这张图片') : '';

    const finishDrawerDelete = (toastText: string) => {
      const removedCount = removeDrawerItemsFromDrawer(deletableItems, label);
      options.afterDelete?.();
      setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      if (removedCount > 0) showToast(toastText);
    };

    const deleteDrawerOnly = () => {
      finishDrawerDelete(deletableItems.length > 1 ? `已从抽屉删除 ${deletableItems.length} 个卡片` : '已从抽屉删除');
    };

    const deleteDrawerAndLocal = async () => {
      const result = await deleteDrawerLocalFiles(localPaths);
      finishDrawerDelete(
        result.failed.length > 0
          ? `抽屉卡片已删除，本地文件 ${result.failed.length} 个删除失败`
          : `已删除抽屉卡片和 ${result.deleted} 个本地文件`
      );
    };

    if (localPaths.length > 0) {
      const message = singleItem
        ? `要删除「${singleName}」吗？可以只从抽屉移除，也可以同时删除 ${localPaths.length} 个本地文件。`
        : `要删除 ${deletableItems.length} 个卡片吗？其中 ${imageCount} 张图片可同时删除 ${localPaths.length} 个本地文件。`;
      setConfirmDialog({
        isOpen: true,
        title: singleItem ? '删除图片' : '批量删除',
        message,
        onConfirm: deleteDrawerOnly,
        actions: [
          {
            label: '只删抽屉卡片',
            onClick: deleteDrawerOnly,
            className: 'rounded-[16px] bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-600 transition-colors hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700',
          },
          {
            label: '本地也删除',
            onClick: deleteDrawerAndLocal,
            className: 'rounded-[16px] bg-red-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-600',
            title: '会删除本地源文件，无法通过抽屉撤销恢复',
          },
        ],
      });
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: singleItem?.type === 'image' ? '删除图片' : (deletableItems.length > 1 ? '批量删除' : '删除卡片'),
      message: singleItem?.type === 'image'
        ? `要从抽屉删除「${singleName}」吗？没有检测到可删除的本地文件。`
        : `确定从抽屉删除 ${deletableItems.length} 个卡片吗？`,
      onConfirm: deleteDrawerOnly,
    });

};

export const flushImageThumbnailUpdatesImpl = (ctx: Pick<drawerCoreActionContext, 'applyCanvasImageSourceToElement' | 'canvasImageSourceCacheRef' | 'canvasPreviewSourceIdsRef' | 'imageThumbnailDisposedRef' | 'imageThumbnailPendingUpdatesRef' | 'imageThumbnailUpdateTimerRef' | 'scheduleCanvasChangedNodesPatchSave' | 'scheduleCanvasStateSave' | 'setItems' | 'updateCanvasItemsImmediate'>) => {
  const { applyCanvasImageSourceToElement, canvasImageSourceCacheRef, canvasPreviewSourceIdsRef, imageThumbnailDisposedRef, imageThumbnailPendingUpdatesRef, imageThumbnailUpdateTimerRef, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, setItems, updateCanvasItemsImmediate } = ctx;
    imageThumbnailUpdateTimerRef.current = null;
    if (imageThumbnailDisposedRef.current || imageThumbnailPendingUpdatesRef.current.size === 0) return;
    const updates = new Map(imageThumbnailPendingUpdatesRef.current);
    imageThumbnailPendingUpdatesRef.current.clear();
    const updatedCanvasNodeIds: string[] = [];
    setItems(prev => {
      let changed = false;
      const next = prev.map(current => {
        const update = updates.get(current.id);
        if (!update || current.type !== 'image' || current.thumbnail !== update.existingThumbnail) return current;
        changed = true;
        return { ...current, thumbnail: update.thumbnail };
      });
      return changed ? next : prev;
    });
    updateCanvasItemsImmediate(prev => {
      let changed = false;
      const next = prev.map(canvasItem => {
        if (canvasItem.item.type !== 'image') return canvasItem;
        const update = updates.get(canvasItem.item.id) || (canvasItem.item.sourceItemId ? updates.get(canvasItem.item.sourceItemId) : undefined);
        if (!update || canvasItem.item.thumbnail === update.thumbnail) return canvasItem;
        if (canvasItem.item.thumbnail && canvasItem.item.thumbnail !== update.existingThumbnail) return canvasItem;
        changed = true;
        updatedCanvasNodeIds.push(canvasItem.id);
        canvasPreviewSourceIdsRef.current.delete(canvasItem.id);
        canvasImageSourceCacheRef.current.set(canvasItem.id, { src: update.thumbnail, quality: 'thumb' });
        applyCanvasImageSourceToElement(canvasItem.id, update.thumbnail);
        return {
          ...canvasItem,
          item: {
            ...canvasItem.item,
            thumbnail: update.thumbnail,
          },
        };
      });
      return changed ? next : prev;
    });
    if (updatedCanvasNodeIds.length > 0) {
      scheduleCanvasChangedNodesPatchSave(updatedCanvasNodeIds);
      scheduleCanvasStateSave({ syncNodes: false });
    }

};

export const runNextImageThumbnailJobsImpl = (ctx: Pick<drawerCoreActionContext, 'IMAGE_THUMBNAIL_MAX_CONCURRENCY' | 'imageThumbnailActiveCountRef' | 'imageThumbnailDisposedRef' | 'imageThumbnailInFlightRef' | 'imageThumbnailQueueRef' | 'runNextImageThumbnailJobs' | 'scheduleImageThumbnailUpdate'>) => {
  const { IMAGE_THUMBNAIL_MAX_CONCURRENCY, imageThumbnailActiveCountRef, imageThumbnailDisposedRef, imageThumbnailInFlightRef, imageThumbnailQueueRef, runNextImageThumbnailJobs, scheduleImageThumbnailUpdate } = ctx;
    while (
      !imageThumbnailDisposedRef.current
      && imageThumbnailActiveCountRef.current < IMAGE_THUMBNAIL_MAX_CONCURRENCY
      && imageThumbnailQueueRef.current.length > 0
    ) {
      const item = imageThumbnailQueueRef.current.shift();
      if (!item) break;
      const source = item.url || (item.path ? convertFileSrc(item.path) : '');
      const existingThumbnail = item.thumbnail;
      if (!source) {
        imageThumbnailInFlightRef.current.delete(item.id);
        continue;
      }

      imageThumbnailActiveCountRef.current += 1;
      const shouldRefresh = existingThumbnail
        ? isLegacyImageThumbnail(existingThumbnail)
        : Promise.resolve(true);

      void shouldRefresh
        .then((refresh) => {
          if (!refresh) return '';
          if (item.path) {
            return invoke<ImageThumbnailFileResult>('ensure_image_thumbnail_file', { path: item.path, size: 512 })
              .then(result => {
                if (import.meta.env.DEV) {
                  console.debug('[DrawerPerf] thumbnail', { assetId: item.id, cacheHit: result.cacheHit === true });
                }
                return result.url || (result.path ? convertFileSrc(result.path) : '');
              })
              .catch(() => createImageThumbnailInWebview(source));
          }
          return createImageThumbnailInWebview(source);
        })
        .then(async (thumbnail) => {
          if (!thumbnail) return;
          if (existingThumbnail) {
            const [existingSize, nextSize] = await Promise.all([
              readDataImageSize(existingThumbnail),
              readDataImageSize(thumbnail),
            ]);
            if (
              existingSize
              && nextSize
              && nextSize.width <= existingSize.width + 8
              && nextSize.height <= existingSize.height + 8
            ) {
              return;
            }
          }
          scheduleImageThumbnailUpdate(item.id, thumbnail, existingThumbnail);
        })
        .catch((err) => console.warn('图片缩略图补全失败:', err))
        .finally(() => {
          imageThumbnailActiveCountRef.current = Math.max(0, imageThumbnailActiveCountRef.current - 1);
          imageThumbnailInFlightRef.current.delete(item.id);
          runNextImageThumbnailJobs();
        });
    }

};

export const ensureImageThumbnailImpl = (ctx: Pick<drawerCoreActionContext, 'IMAGE_THUMBNAIL_QUEUE_LIMIT' | 'generatedImageCachePendingIdsRef' | 'imageThumbnailInFlightRef' | 'imageThumbnailQueueRef' | 'runNextImageThumbnailJobs'>, item: BufferItem) => {
  const { IMAGE_THUMBNAIL_QUEUE_LIMIT, generatedImageCachePendingIdsRef, imageThumbnailInFlightRef, imageThumbnailQueueRef, runNextImageThumbnailJobs } = ctx;
    if (
      item.type !== 'image'
      || item.isDirectory
      || generatedImageCachePendingIdsRef.current.has(item.id)
      || imageThumbnailInFlightRef.current.has(item.id)
    ) {
      return;
    }
    const source = item.url || (item.path ? convertFileSrc(item.path) : '');
    if (!source) return;

    imageThumbnailInFlightRef.current.add(item.id);
    while (imageThumbnailQueueRef.current.length >= IMAGE_THUMBNAIL_QUEUE_LIMIT) {
      const dropped = imageThumbnailQueueRef.current.shift();
      if (dropped) imageThumbnailInFlightRef.current.delete(dropped.id);
    }
    imageThumbnailQueueRef.current.push(item);
    runNextImageThumbnailJobs();

};

export const ensureVideoThumbnailImpl = (ctx: Pick<drawerCoreActionContext, 'setItems' | 'videoThumbnailInFlightRef'>, item: BufferItem) => {
  const { setItems, videoThumbnailInFlightRef } = ctx;
    if (
      item.type !== 'video' ||
      !item.path ||
      item.thumbnail ||
      videoThumbnailInFlightRef.current.has(item.id)
    ) {
      return;
    }

    videoThumbnailInFlightRef.current.add(item.id);
    getVideoThumbnail(item.path).then((thumbnail) => {
      if (!thumbnail) return;
      setItems(prev => prev.map(current => (
        current.id === item.id && current.type === 'video' && !current.thumbnail
          ? { ...current, thumbnail }
          : current
      )));
    }).catch((err) => {
      console.warn('video thumbnail generation failed:', err);
    }).finally(() => {
      videoThumbnailInFlightRef.current.delete(item.id);
    });

};

export const getCanvasDropPositionImpl = (ctx: Pick<drawerCoreActionContext, 'canvasItemsRef' | 'canvasScaleRef' | 'canvasSurfaceRef'>, index: number = 0, client?: { x: number; y: number }) => {
  const { canvasItemsRef, canvasScaleRef, canvasSurfaceRef } = ctx;
    const surface = canvasSurfaceRef.current;
    if (surface && client) {
      const rect = surface.getBoundingClientRect();
      const scale = canvasScaleRef.current || 1;
      return {
        x: Math.max(24, (client.x - rect.left + surface.scrollLeft) / scale - 92 + index * 22),
        y: Math.max(24, (client.y - rect.top + surface.scrollTop) / scale - 64 + index * 22),
      };
    }

    if (surface) {
      const scale = canvasScaleRef.current || 1;
      return {
        x: Math.max(24, (surface.scrollLeft + surface.clientWidth * 0.32) / scale + index * 22),
        y: Math.max(24, (surface.scrollTop + surface.clientHeight * 0.24) / scale + index * 22),
      };
    }

    return {
      x: 180 + (canvasItemsRef.current.length + index) * 26,
      y: 150 + (canvasItemsRef.current.length + index) * 22,
    };

};
