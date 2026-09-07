import { convertFileSrc,invoke } from '@tauri-apps/api/core';
import { emitTo,listen } from '@tauri-apps/api/event';
import { isRegistered,register,unregister } from '@tauri-apps/plugin-global-shortcut';
import React from 'react';
import { flushSync } from 'react-dom';
import { DEFAULT_CANVAS_ID,DEFAULT_LIBRARY_ID,DEFAULT_PROJECT_ID,getActiveCanvas,getCanvasTrashCount,listCanvasNodes,listCanvases,type CanvasRecord } from '../../../services/canvasApi';
import { listFolders } from '../../../services/libraryApi';
import { createImageThumbnailInWebview,getVideoThumbnail } from '../../../services/mediaThumbnail';
import { ensureSqliteAssetLibrary } from '../../../services/migrationApi';
import { BufferItem,Folder } from '../../../types';
import type { ConfirmDialogState } from '../../../types/dialogs';
import type { DrawerTabType } from '../../../types/drawer';
import { sanitizeCanvasPersistedState,stripCanvasItemDataImageProvenance,stripHeavyDataThumbnail } from '../../../utils/canvasSerialization';
import { replaceFirstItemRemark } from '../../../utils/drawerItemSearch';
import { getCalendarNotificationBody,getLocalDateKey,type CalendarScheduleEvent } from '../../calendarModel';
import { type CanvasImageItem } from '../../canvasModel';
import { isProbablyUrl } from '../../dragData';
import { FLOATING_NOTE_TEXT_BRIDGE_KEY,FLOATING_NOTE_TITLE_BRIDGE_KEY } from '../../floatingNotes';
import { normalizeDrawerFolders } from '../../folderModel';
import { type TriggerMode } from '../../triggerModel';

type drawerCoreEffectContext = { calendarNotificationsEnabled: boolean; CALENDAR_NOTIFICATION_HOURS: number[]; calendarEventsByDay: Map<string, CalendarScheduleEvent[]>; CALENDAR_NOTIFICATION_SENT_STORAGE_PREFIX: "drawer_calendar_notification_sent_"; sendSystemNotification: (title: string, body: string, options?: { silent?: boolean; }) => Promise<boolean>; shouldAcceptMobilePayload: (data: any) => boolean; isMobileConnected: boolean; showToast: (message: string) => void; setIsMobileConnected: React.Dispatch<React.SetStateAction<boolean>>; resetDisconnectTimer: () => void; createAssetId: () => `${string}-${string}-${string}-${string}-${string}`; pushDrawerUndoSnapshot: (label: string, options?: { shareImmutableItems?: boolean; }) => void; setItems: React.Dispatch<React.SetStateAction<BufferItem[]>>; setActiveTab: React.Dispatch<React.SetStateAction<DrawerTabType>>; setActiveFolderId: React.Dispatch<React.SetStateAction<string>>; stateRef: React.RefObject<{ isOpen: boolean; isPinned: boolean; showTextInput: boolean; isSearchActive: boolean; isAntiTouchMode: boolean; }>; isAntiTouchMode: boolean; setIsOpen: React.Dispatch<React.SetStateAction<boolean>>; enqueueAutoAiTaggingForItems: (incomingItems: BufferItem[]) => void; licenseGateActiveRef: React.RefObject<boolean>; shortcut: string; isOpen: boolean; isPinned: boolean; setIsAntiTouchMode: React.Dispatch<React.SetStateAction<boolean>>; enforceAntiTouchClosed: (showFeedback?: boolean) => void; snipShortcut: string; startSnip: () => Promise<void>; textShortcut: string; showTextInput: boolean; setShowTextInput: React.Dispatch<React.SetStateAction<boolean>>; setIsPinned: React.Dispatch<React.SetStateAction<boolean>>; markShortcutReveal: () => void; setIsSearchActive: React.Dispatch<React.SetStateAction<boolean>>; setShowSettings: React.Dispatch<React.SetStateAction<boolean>>; setShowWebImageCollector: React.Dispatch<React.SetStateAction<boolean>>; setShowFolderModal: React.Dispatch<React.SetStateAction<boolean>>; searchShortcut: string; isSearchActive: boolean; setSearchQuery: React.Dispatch<React.SetStateAction<string>>; isCanvasModeRef: React.RefObject<boolean>; searchInputRef: React.RefObject<HTMLInputElement | null>; triggerShortcut: string; toggleTriggerMode: () => void; noteShortcut: string; createBlankFloatingNote: () => Promise<void>; canvasShortcut: string; requestExitCanvasMode: () => void; enterCanvasMode: () => void; startupAutoCloseSuppressedRef: React.RefObject<boolean>; isPointerInsideDrawerRef: React.RefObject<boolean>; setShowHelp: React.Dispatch<React.SetStateAction<boolean>>; setShowQR: React.Dispatch<React.SetStateAction<boolean>>; setConfirmDialog: React.Dispatch<React.SetStateAction<ConfirmDialogState>>; setShowUpdateLog: React.Dispatch<React.SetStateAction<boolean>>; drawerWidthRef: React.RefObject<number>; drawerHeightRef: React.RefObject<number>; triggerModeRef: React.RefObject<TriggerMode>; snipModeActiveRef: React.RefObject<boolean>; snipExitInFlightRef: React.RefObject<boolean>; showLaunchIntroRef: React.RefObject<boolean>; isSplashVisibleRef: React.RefObject<boolean>; showUpdateLogRef: React.RefObject<boolean>; closeTimerRef: React.RefObject<any>; clearIdleAutoClose: () => void; idleAutoCloseTimerRef: React.RefObject<any>; drawerPanelInteractionHoldUntilRef: React.RefObject<number>; drawerAutoCloseBlockRef: React.RefObject<boolean>; isMainWorkbenchActiveRef: React.RefObject<boolean>; isTextEntryActive: () => boolean; setDrawerState: React.Dispatch<React.SetStateAction<"closed" | "pre_open" | "open" | "closing">>; isPinnedRef: React.RefObject<boolean>; handleOpenTextInput: () => void; toggleSearch: () => void; isGlobalMouseDown: React.RefObject<boolean>; previewDragActiveRef: React.RefObject<boolean>; isDraggingTitleRef: React.RefObject<boolean>; setIsDraggingTitle: React.Dispatch<React.SetStateAction<boolean>>; setAssetStorageMode: React.Dispatch<React.SetStateAction<"initializing" | "sqlite" | "json">>; replaceAssetsFromQuery: (nextAssets: BufferItem[]) => void; setIsDataLoaded: React.Dispatch<React.SetStateAction<boolean>>; setAssetLibraryReady: React.Dispatch<React.SetStateAction<boolean>>; activeCanvasIdRef: React.RefObject<string>; setActiveCanvasId: React.Dispatch<React.SetStateAction<string>>; setCanvases: React.Dispatch<React.SetStateAction<CanvasRecord[]>>; canvasItemsRef: React.RefObject<CanvasImageItem[]>; canvasSessionItemsRef: React.RefObject<Map<string, CanvasImageItem[]>>; canvasLastSyncedNodesSignatureRef: React.RefObject<string>; getCanvasNodesPersistSignature: (items: CanvasImageItem[]) => string; canvasSizeRef: React.RefObject<{ width: number; height: number; }>; canvasScaleRef: React.RefObject<number>; canvasReturnScrollRef: React.RefObject<{ left: number; top: number; } | null>; canvasScrollLockRef: React.RefObject<{ left: number; top: number; } | null>; setCanvasItems: React.Dispatch<React.SetStateAction<CanvasImageItem[]>>; setCanvasSize: React.Dispatch<React.SetStateAction<{ width: number; height: number; }>>; setCanvasScale: React.Dispatch<React.SetStateAction<number>>; applyCanvasScaleStyles: (scale?: number, size?: { width: number; height: number; }, options?: { updateViewport?: boolean; }) => void; getActiveCanvasRunNodeIds: (canvasId: string) => Set<string> | undefined; sortCanvasesNewestFirst: (items: CanvasRecord[]) => CanvasRecord[]; setCanvasTrashCount: React.Dispatch<React.SetStateAction<number>>; canvasStateLoadedRef: React.RefObject<boolean>; readFoldersFromCache: () => { folders: Folder[]; isValid: boolean; updatedAt: number; }; isValid: boolean; folders: Folder[]; updatedAt: number; hasRestoredNonEmptyFoldersRef: React.RefObject<boolean>; setFolders: React.Dispatch<React.SetStateAction<Folder[]>>; setIsFoldersLoaded: React.Dispatch<React.SetStateAction<boolean>>; floatingBridgeSeenRef: React.RefObject<Record<string, number>>; applyFloatingTextPayloadToSnapshots: (payload: any) => void; beginFloatingTextUndo: (itemId: string, label: string) => void; broadcastFloatingNoteTextUpdate: (itemId: string, content?: string, name?: string, sourceLabel?: string) => void; broadcastFloatingNoteTitleUpdate: (itemId: string, name: string, sourceLabel?: string) => void; imageThumbnailDisposedRef: React.RefObject<boolean>; imageThumbnailQueueRef: React.RefObject<BufferItem[]>; imageThumbnailPendingUpdatesRef: React.RefObject<Map<string, { thumbnail: string; existingThumbnail?: string; }>>; imageThumbnailUpdateTimerRef: React.RefObject<number | null>; quickAccessItems: BufferItem[]; videoThumbnailInFlightRef: React.RefObject<Set<string>>; items: BufferItem[]; DATA_THUMBNAIL_RECOMPRESS_MIN_CHARS: number; thumbnailRecompressInFlightRef: React.RefObject<Set<string>>; };

export const runDrawerCoreEffect01 = (ctx: Pick<drawerCoreEffectContext, 'CALENDAR_NOTIFICATION_HOURS' | 'CALENDAR_NOTIFICATION_SENT_STORAGE_PREFIX' | 'calendarEventsByDay' | 'calendarNotificationsEnabled' | 'sendSystemNotification'>) => {
  const { CALENDAR_NOTIFICATION_HOURS, CALENDAR_NOTIFICATION_SENT_STORAGE_PREFIX, calendarEventsByDay, calendarNotificationsEnabled, sendSystemNotification } = ctx;
    if (!calendarNotificationsEnabled) return;

    const checkTodaySchedules = () => {
      const now = Date.now();
      const hour = new Date(now).getHours();
      const notificationHour = [...CALENDAR_NOTIFICATION_HOURS]
        .reverse()
        .find(candidate => hour >= candidate);
      if (!notificationHour) return;

      const todayKey = getLocalDateKey(now);
      const dueEvents = (calendarEventsByDay.get(todayKey) || []).filter(event => !event.schedule.done);
      if (dueEvents.length === 0) return;

      const storageKey = `${CALENDAR_NOTIFICATION_SENT_STORAGE_PREFIX}${todayKey}_${notificationHour}`;
      if (localStorage.getItem(storageKey) === 'sent') return;

      sendSystemNotification(
        `今天有 ${dueEvents.length} 项日程`,
        getCalendarNotificationBody(dueEvents),
        { silent: true },
      ).then(sent => {
        if (sent) localStorage.setItem(storageKey, 'sent');
      });
    };

    checkTodaySchedules();
    const timer = window.setInterval(checkTodaySchedules, 60_000);
    return () => window.clearInterval(timer);

};

export const runDrawerCoreEffect02 = (ctx: Pick<drawerCoreEffectContext, 'createAssetId' | 'enqueueAutoAiTaggingForItems' | 'isMobileConnected' | 'pushDrawerUndoSnapshot' | 'resetDisconnectTimer' | 'setActiveFolderId' | 'setActiveTab' | 'setIsMobileConnected' | 'setIsOpen' | 'setItems' | 'shouldAcceptMobilePayload' | 'showToast' | 'stateRef'>) => {
  const { createAssetId, enqueueAutoAiTaggingForItems, isMobileConnected, pushDrawerUndoSnapshot, resetDisconnectTimer, setActiveFolderId, setActiveTab, setIsMobileConnected, setIsOpen, setItems, shouldAcceptMobilePayload, showToast, stateRef } = ctx;
    let unlisten: () => void;
    listen('mobile-data-received', async (event: any) => {
      const data = event.payload || {};
      if (!shouldAcceptMobilePayload(data)) return;
      if (!isMobileConnected) showToast('📱 手机已连接');
      setIsMobileConnected(true); resetDisconnectTimer();
      const newItem: BufferItem = { id: createAssetId(), createdAt: Date.now(), ...data };
      if (newItem.type === 'image' && newItem.path && !newItem.url) {
        newItem.url = convertFileSrc(newItem.path);
      }
      if (newItem.type === 'video' && newItem.path) {
        try {
          const thumb = await getVideoThumbnail(newItem.path);
          if (thumb) newItem.thumbnail = thumb;
          if (!newItem.url) newItem.url = convertFileSrc(newItem.path);
        } catch (e) {
          if (!newItem.url) newItem.url = convertFileSrc(newItem.path);
        }
      }
      pushDrawerUndoSnapshot('接收手机素材');
      setItems(prev => [newItem, ...prev]);
      setActiveTab('all'); setActiveFolderId('all'); if (!stateRef.current.isAntiTouchMode) setIsOpen(true);
      if (newItem.type === 'image') {
        enqueueAutoAiTaggingForItems([newItem]);
      }
    }).then(f => unlisten = f);
    return () => { if (unlisten) unlisten(); };

};

export const runDrawerCoreEffect03 = (ctx: Pick<drawerCoreEffectContext, 'canvasShortcut' | 'createBlankFloatingNote' | 'enforceAntiTouchClosed' | 'enterCanvasMode' | 'isCanvasModeRef' | 'licenseGateActiveRef' | 'markShortcutReveal' | 'noteShortcut' | 'requestExitCanvasMode' | 'searchInputRef' | 'searchShortcut' | 'setIsAntiTouchMode' | 'setIsOpen' | 'setIsPinned' | 'setIsSearchActive' | 'setSearchQuery' | 'setShowFolderModal' | 'setShowSettings' | 'setShowTextInput' | 'setShowWebImageCollector' | 'shortcut' | 'showToast' | 'snipShortcut' | 'startSnip' | 'stateRef' | 'textShortcut' | 'toggleTriggerMode' | 'triggerShortcut'>) => {
  const { canvasShortcut, createBlankFloatingNote, enforceAntiTouchClosed, enterCanvasMode, isCanvasModeRef, licenseGateActiveRef, markShortcutReveal, noteShortcut, requestExitCanvasMode, searchInputRef, searchShortcut, setIsAntiTouchMode, setIsOpen, setIsPinned, setIsSearchActive, setSearchQuery, setShowFolderModal, setShowSettings, setShowTextInput, setShowWebImageCollector, shortcut, showToast, snipShortcut, startSnip, stateRef, textShortcut, toggleTriggerMode, triggerShortcut } = ctx;
    let cancelled = false;
    const setupShortcuts = async () => {
      // 封装一个极其安全的注册器
      // 🌟 带有屏幕报错反馈的注册器
      const safeRegister = async (key: string, handler: (e: any) => void) => {
        if (!key || cancelled) return;
        try {
          const isReg = await isRegistered(key);
          if (cancelled) return;
          if (isReg) await unregister(key);
          if (cancelled) return;
          await register(key, handler);
          console.log(`✅ 快捷键 ${key} 注册成功`);
        } catch (error: any) {
          const msg = error.message || String(error);
          if (msg.includes('already registered')) return; // 🌟 忽略 React 双重复挂载引起的假报错
          console.error(`❌ 快捷键 ${key} 注册失败:`, error);
          showToast(`快捷键报错: ${msg}`);
        }
      };
      const blockShortcutWhenLicenseLocked = () => {
        if (!licenseGateActiveRef.current) return false;
        showToast('请先完成邮箱注册或登录');
        return true;
      };

      await safeRegister(shortcut, (e) => {
        if (e.state === 'Pressed') {
          if (blockShortcutWhenLicenseLocked()) return;
          const next = !stateRef.current.isAntiTouchMode;
          stateRef.current = { ...stateRef.current, isAntiTouchMode: next, isOpen: next ? false : stateRef.current.isOpen, isPinned: next ? false : stateRef.current.isPinned };
          localStorage.setItem('drawer_anti_touch_mode', next ? 'true' : 'false');
          invoke('set_anti_touch_lock', { locked: next }).catch(() => {});
          emitTo('edge', 'anti-touch-changed', next).catch(() => {});
          setIsAntiTouchMode(next);
          if (next) enforceAntiTouchClosed(false);
          showToast(next ? '🔒 防误触已开启，抽屉已锁定' : '🔓 防误触已解除');
        }
      });

      await safeRegister(snipShortcut, (e) => {
  if (e.state === 'Pressed') {
    if (blockShortcutWhenLicenseLocked()) return;
    if (stateRef.current.isAntiTouchMode) {
      enforceAntiTouchClosed(true);
      return;
    }
    startSnip();
  }
});
      await safeRegister(textShortcut, (e) => {
        if (e.state === 'Pressed') {
           if (blockShortcutWhenLicenseLocked()) return;
           if (stateRef.current.isAntiTouchMode) {
               enforceAntiTouchClosed(true);
               return;
           }
           if (stateRef.current.showTextInput && stateRef.current.isOpen) {
               setShowTextInput(false); setIsOpen(false); setIsPinned(false);
               invoke('toggle_pin', { pinned: false }).catch(()=>{});
           } else {
               markShortcutReveal();
               flushSync(() => {
                 setShowTextInput(true);
                 setIsSearchActive(false);
                 setShowSettings(false);
                 setShowWebImageCollector(false);
                 setShowFolderModal(false);
                 setIsOpen(true);
               });
           }
        }
      });

      await safeRegister(searchShortcut, (e) => {
        if (e.state === 'Pressed') {
           if (blockShortcutWhenLicenseLocked()) return;
           if (stateRef.current.isAntiTouchMode) {
               enforceAntiTouchClosed(true);
               return;
           }
           if (stateRef.current.isSearchActive && stateRef.current.isOpen) {
               setIsSearchActive(false);
               setSearchQuery('');
               if (!isCanvasModeRef.current) {
                 setIsOpen(false); setIsPinned(false);
                 invoke('toggle_pin', { pinned: false }).catch(()=>{});
               }
           } else {
               markShortcutReveal();
               flushSync(() => {
                 setIsSearchActive(true);
                 setShowSettings(false);
                 setShowTextInput(false);
                 setShowWebImageCollector(false);
                 setShowFolderModal(false);
                 setIsOpen(true);
               });
               setTimeout(() => searchInputRef.current?.focus(), 180);
           }
        }
      });

      await safeRegister(triggerShortcut, (e) => {
        if (e.state === 'Pressed') {
          if (blockShortcutWhenLicenseLocked()) return;
          if (stateRef.current.isAntiTouchMode) {
            enforceAntiTouchClosed(true);
            return;
          }
          toggleTriggerMode();
        }
      });

      await safeRegister(noteShortcut, (e) => {
        if (e.state === 'Pressed') {
          if (blockShortcutWhenLicenseLocked()) return;
          if (stateRef.current.isAntiTouchMode) {
            enforceAntiTouchClosed(true);
            return;
          }
          createBlankFloatingNote();
        }
      });

      await safeRegister(canvasShortcut, (e) => {
        if (e.state === 'Pressed') {
          if (blockShortcutWhenLicenseLocked()) return;
          if (stateRef.current.isAntiTouchMode && !isCanvasModeRef.current) {
            enforceAntiTouchClosed(true);
            return;
          }
          if (isCanvasModeRef.current) requestExitCanvasMode();
          else enterCanvasMode();
        }
      });
    };

    setupShortcuts();

    // 🌟 核心修复：React 严格模式的清场钩子
    return () => {
      cancelled = true;
      const cleanup = async () => {
        try {
          await unregister(shortcut).catch(()=>{});
          await unregister(snipShortcut).catch(()=>{});
          await unregister(textShortcut).catch(()=>{});
          await unregister(searchShortcut).catch(()=>{});
          await unregister(triggerShortcut).catch(()=>{});
          await unregister(noteShortcut).catch(()=>{});
          await unregister(canvasShortcut).catch(()=>{});
        } catch (err) {}
      };
      cleanup();
    };

};

export const runDrawerCoreEffect04 = (ctx: Pick<drawerCoreEffectContext, 'drawerHeightRef' | 'drawerWidthRef' | 'isPointerInsideDrawerRef' | 'setConfirmDialog' | 'setIsAntiTouchMode' | 'setIsOpen' | 'setIsPinned' | 'setShowFolderModal' | 'setShowHelp' | 'setShowQR' | 'setShowSettings' | 'setShowTextInput' | 'setShowUpdateLog' | 'setShowWebImageCollector' | 'startupAutoCloseSuppressedRef' | 'stateRef' | 'triggerModeRef'>) => {
  const { drawerHeightRef, drawerWidthRef, isPointerInsideDrawerRef, setConfirmDialog, setIsAntiTouchMode, setIsOpen, setIsPinned, setShowFolderModal, setShowHelp, setShowQR, setShowSettings, setShowTextInput, setShowUpdateLog, setShowWebImageCollector, startupAutoCloseSuppressedRef, stateRef, triggerModeRef } = ctx;
    let unlisten: () => void;
    listen('force-rescue', async () => {
      if (stateRef.current.isAntiTouchMode) {
        stateRef.current = {
          ...stateRef.current,
          isAntiTouchMode: false,
          isOpen: true,
          isPinned: false,
        };
        localStorage.setItem('drawer_anti_touch_mode', 'false');
        await invoke('set_anti_touch_lock', { locked: false }).catch(() => {});
        emitTo('edge', 'anti-touch-changed', false).catch(() => {});
        setIsAntiTouchMode(false);
      }

      startupAutoCloseSuppressedRef.current = false;
      isPointerInsideDrawerRef.current = true;
      setIsPinned(false); setIsOpen(true); setShowSettings(false);
      setShowHelp(false); setShowQR(false); setConfirmDialog(prev => ({...prev, isOpen: false}));
      setShowTextInput(false); setShowWebImageCollector(false); setShowFolderModal(false); setShowUpdateLog(false);
      invoke('toggle_pin', { pinned: false }).catch(() => {});
      await invoke('open_drawer', {
        width: drawerWidthRef.current,
        height: drawerHeightRef.current,
        mode: triggerModeRef.current,
      }).catch(() => {});
    }).then(f => unlisten = f);
    return () => { if (unlisten) unlisten(); };

};

export const runDrawerCoreEffect05 = (ctx: Pick<drawerCoreEffectContext, 'clearIdleAutoClose' | 'closeTimerRef' | 'drawerAutoCloseBlockRef' | 'drawerPanelInteractionHoldUntilRef' | 'enforceAntiTouchClosed' | 'idleAutoCloseTimerRef' | 'isMainWorkbenchActiveRef' | 'isPinnedRef' | 'isPointerInsideDrawerRef' | 'isSplashVisibleRef' | 'isTextEntryActive' | 'licenseGateActiveRef' | 'setDrawerState' | 'setIsOpen' | 'setIsPinned' | 'showLaunchIntroRef' | 'showUpdateLogRef' | 'snipExitInFlightRef' | 'snipModeActiveRef' | 'startupAutoCloseSuppressedRef' | 'stateRef'>) => {
  const { clearIdleAutoClose, closeTimerRef, drawerAutoCloseBlockRef, drawerPanelInteractionHoldUntilRef, enforceAntiTouchClosed, idleAutoCloseTimerRef, isMainWorkbenchActiveRef, isPinnedRef, isPointerInsideDrawerRef, isSplashVisibleRef, isTextEntryActive, licenseGateActiveRef, setDrawerState, setIsOpen, setIsPinned, showLaunchIntroRef, showUpdateLogRef, snipExitInFlightRef, snipModeActiveRef, startupAutoCloseSuppressedRef, stateRef } = ctx;
    let unlistenOpen: (() => void) | undefined;
    let unlistenClose: (() => void) | undefined;
    let unlistenStartup: (() => void) | undefined;

    const handleOpened = (fromStartup = false) => {
      if (snipModeActiveRef.current || snipExitInFlightRef.current) return;
      const isStartupPreview = fromStartup || showLaunchIntroRef.current || isSplashVisibleRef.current || showUpdateLogRef.current;
      if (stateRef.current.isAntiTouchMode && !isStartupPreview) {
        enforceAntiTouchClosed(false);
        return;
      }

      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }

      // 不再在窗口打开事件里假定鼠标已经进入抽屉。
      // 程序自动弹出、快捷键打开、截图后弹出都可能没有真实 pointerenter。
      if (!isStartupPreview) {
        startupAutoCloseSuppressedRef.current = false;
        isPointerInsideDrawerRef.current = false;
        clearIdleAutoClose();
        idleAutoCloseTimerRef.current = window.setTimeout(() => {
          idleAutoCloseTimerRef.current = null;
          const isPanelInteractionHeld = Date.now() < drawerPanelInteractionHoldUntilRef.current;
          if (
            !isPointerInsideDrawerRef.current &&
            !isPanelInteractionHeld &&
            !drawerAutoCloseBlockRef.current &&
            !licenseGateActiveRef.current &&
            !isMainWorkbenchActiveRef.current &&
            !isTextEntryActive()
          ) {
            setIsOpen(false);
            setIsPinned(false);
          }
        }, 3000);
      }

      setIsOpen(true);
      invoke('set_topmost', { topmost: true }).catch(() => {});
    };

    listen('drawer-opened', () => handleOpened(false)).then(f => unlistenOpen = f);
    listen('startup-preview-open', () => handleOpened(true)).then(f => unlistenStartup = f);

    listen('drawer-closed', () => {
      // 启动欢迎/更新日志弹窗还在时，不响应自动关闭事件。
      if (licenseGateActiveRef.current || showLaunchIntroRef.current || isSplashVisibleRef.current || showUpdateLogRef.current) {
        setIsOpen(true);
        setDrawerState('open');
        return;
      }

      isPointerInsideDrawerRef.current = false;
      if (!isPinnedRef.current) {
        setDrawerState('closed');
        setIsOpen(false);
      }
    }).then(f => unlistenClose = f);

    return () => {
      if (unlistenOpen) unlistenOpen();
      if (unlistenClose) unlistenClose();
      if (unlistenStartup) unlistenStartup();
    };

};

export const runDrawerCoreEffect06 = (ctx: Pick<drawerCoreEffectContext, 'enforceAntiTouchClosed' | 'handleOpenTextInput' | 'isCanvasModeRef' | 'isSearchActive' | 'setIsOpen' | 'setIsSearchActive' | 'setSearchQuery' | 'setShowTextInput' | 'showTextInput' | 'stateRef' | 'toggleSearch'>) => {
  const { enforceAntiTouchClosed, handleOpenTextInput, isCanvasModeRef, isSearchActive, setIsOpen, setIsSearchActive, setSearchQuery, setShowTextInput, showTextInput, stateRef, toggleSearch } = ctx;
    let unlisten1: () => void; let unlisten2: () => void;
    listen('open-text-input', () => {
      if (stateRef.current.isAntiTouchMode) {
        enforceAntiTouchClosed(true);
        return;
      }
      if (showTextInput) { setShowTextInput(false); setIsOpen(false); }
      else { handleOpenTextInput(); setIsOpen(true); }
    }).then(f => unlisten1 = f);

    listen('open-search-bar', () => {
      if (stateRef.current.isAntiTouchMode) {
        enforceAntiTouchClosed(true);
        return;
      }
      if (isSearchActive) {
        setIsSearchActive(false);
        setSearchQuery('');
        if (!isCanvasModeRef.current) setIsOpen(false);
      }
      else { toggleSearch(); setIsOpen(true); }
    }).then(f => unlisten2 = f);
    return () => { if (unlisten1) unlisten1(); if (unlisten2) unlisten2(); };

};

export const runDrawerCoreEffect07 = (ctx: Pick<drawerCoreEffectContext, 'isDraggingTitleRef' | 'isGlobalMouseDown' | 'previewDragActiveRef' | 'setIsDraggingTitle'>) => {
  const { isDraggingTitleRef, isGlobalMouseDown, previewDragActiveRef, setIsDraggingTitle } = ctx;
    const handleDown = () => { isGlobalMouseDown.current = true; };
    const resetPointerFlags = () => {
      previewDragActiveRef.current = false;
      isGlobalMouseDown.current = false;
      isDraggingTitleRef.current = false;
      setIsDraggingTitle(false);
    };
    window.addEventListener('mousedown', handleDown);
    window.addEventListener('mouseup', resetPointerFlags);
    window.addEventListener('pointerup', resetPointerFlags);
    window.addEventListener('blur', resetPointerFlags);
    return () => {
      window.removeEventListener('mousedown', handleDown);
      window.removeEventListener('mouseup', resetPointerFlags);
      window.removeEventListener('pointerup', resetPointerFlags);
      window.removeEventListener('blur', resetPointerFlags);
    };

};

export const runDrawerCoreEffect08 = (ctx: Pick<drawerCoreEffectContext, 'activeCanvasIdRef' | 'applyCanvasScaleStyles' | 'canvasItemsRef' | 'canvasLastSyncedNodesSignatureRef' | 'canvasReturnScrollRef' | 'canvasScaleRef' | 'canvasScrollLockRef' | 'canvasSessionItemsRef' | 'canvasSizeRef' | 'canvasStateLoadedRef' | 'getActiveCanvasRunNodeIds' | 'getCanvasNodesPersistSignature' | 'hasRestoredNonEmptyFoldersRef' | 'readFoldersFromCache' | 'replaceAssetsFromQuery' | 'setActiveCanvasId' | 'setAssetLibraryReady' | 'setAssetStorageMode' | 'setCanvasItems' | 'setCanvasScale' | 'setCanvasSize' | 'setCanvasTrashCount' | 'setCanvases' | 'setFolders' | 'setIsDataLoaded' | 'setIsFoldersLoaded' | 'sortCanvasesNewestFirst'>) => {
  const { activeCanvasIdRef, applyCanvasScaleStyles, canvasItemsRef, canvasLastSyncedNodesSignatureRef, canvasReturnScrollRef, canvasScaleRef, canvasScrollLockRef, canvasSessionItemsRef, canvasSizeRef, canvasStateLoadedRef, getActiveCanvasRunNodeIds, getCanvasNodesPersistSignature, hasRestoredNonEmptyFoldersRef, readFoldersFromCache, replaceAssetsFromQuery, setActiveCanvasId, setAssetLibraryReady, setAssetStorageMode, setCanvasItems, setCanvasScale, setCanvasSize, setCanvasTrashCount, setCanvases, setFolders, setIsDataLoaded, setIsFoldersLoaded, sortCanvasesNewestFirst } = ctx;
    const initializeAssetLibrary = async () => {
      try {
        const status = await ensureSqliteAssetLibrary();
        const mode = status.mode === 'json' ? 'json' : 'sqlite';
        setAssetStorageMode(mode);
        if (mode === 'json') {
          const savedItems = await invoke<BufferItem[]>('load_items');
          replaceAssetsFromQuery((savedItems || []).map(stripHeavyDataThumbnail));
          setIsDataLoaded(true);
        }
      } catch (error) {
        console.warn('SQLite 素材库初始化失败，回退到旧 JSON 兼容模式:', error);
        await invoke('rollback_to_json_mode').catch(() => undefined);
        setAssetStorageMode('json');
        try {
          const savedItems = await invoke<BufferItem[]>('load_items');
          replaceAssetsFromQuery((savedItems || []).map(stripHeavyDataThumbnail));
        } catch (legacyError) {
          console.warn('旧素材数据恢复失败:', legacyError);
          replaceAssetsFromQuery([]);
        }
        setIsDataLoaded(true);
      } finally {
        setAssetLibraryReady(true);
      }
    };
    const restoreLegacyCanvasState = async () => {
      const savedState = await invoke('load_canvas_state');
      const restored = sanitizeCanvasPersistedState(savedState);
      const now = Date.now();
      const fallbackCanvas: CanvasRecord = {
        id: DEFAULT_CANVAS_ID,
        projectId: DEFAULT_PROJECT_ID,
        libraryId: DEFAULT_LIBRARY_ID,
        name: '默认画布',
        sortOrder: 0,
        isActive: true,
        isSnapshot: false,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
      };
      activeCanvasIdRef.current = DEFAULT_CANVAS_ID;
      setActiveCanvasId(DEFAULT_CANVAS_ID);
      setCanvases(previous => previous.length > 0 ? previous : [fallbackCanvas]);
      canvasItemsRef.current = restored.items;
      canvasSessionItemsRef.current.set(DEFAULT_CANVAS_ID, restored.items);
      canvasLastSyncedNodesSignatureRef.current = getCanvasNodesPersistSignature(restored.items.map(stripCanvasItemDataImageProvenance));
      canvasSizeRef.current = restored.size;
      canvasScaleRef.current = restored.scale;
      canvasReturnScrollRef.current = restored.scroll;
      canvasScrollLockRef.current = restored.scroll;
      setCanvasItems(restored.items);
      setCanvasSize(restored.size);
      setCanvasScale(restored.scale);
      applyCanvasScaleStyles(restored.scale, restored.size);
    };
    const restoreActiveCanvas = async () => {
      try {
        const [active, canvasList, trashCount] = await Promise.all([
          getActiveCanvas(DEFAULT_PROJECT_ID, DEFAULT_LIBRARY_ID),
          listCanvases(DEFAULT_PROJECT_ID, DEFAULT_LIBRARY_ID),
          getCanvasTrashCount(DEFAULT_PROJECT_ID, DEFAULT_LIBRARY_ID),
        ]);
        const nodes = await listCanvasNodes(active.id);
        const restored = sanitizeCanvasPersistedState(
          { items: nodes },
          { activeRunNodeIds: getActiveCanvasRunNodeIds(active.id) },
        );
        activeCanvasIdRef.current = active.id;
        setActiveCanvasId(active.id);
        setCanvases(sortCanvasesNewestFirst(canvasList.length > 0 ? canvasList : [active]));
        setCanvasTrashCount(trashCount);
        canvasItemsRef.current = restored.items;
        canvasSessionItemsRef.current.set(active.id, restored.items);
        canvasLastSyncedNodesSignatureRef.current = getCanvasNodesPersistSignature(restored.items.map(stripCanvasItemDataImageProvenance));
        setCanvasItems(restored.items);
        canvasSizeRef.current = restored.size;
        setCanvasSize(restored.size);
        applyCanvasScaleStyles(canvasScaleRef.current || restored.scale, restored.size);
      } catch (err) {
        console.warn('恢复 SQLite 画布失败，尝试旧画布状态:', err);
        await restoreLegacyCanvasState();
      } finally {
        canvasStateLoadedRef.current = true;
      }
    };
    const restoreFolders = async () => {
      const cachedSnapshot = readFoldersFromCache();
      const cachedFolders = cachedSnapshot.isValid
        ? normalizeDrawerFolders(cachedSnapshot.folders)
        : [];
      let restoredFolders: Folder[] | null = null;
      let restoredFromTrustedCache = false;
      try {
        const savedFolders = await invoke('load_folders');
        if (Array.isArray(savedFolders) && savedFolders.length > 0) {
          restoredFolders = normalizeDrawerFolders(savedFolders);
        }
      } catch (err) {
        console.warn('恢复旧文件夹状态失败，尝试后端文件夹:', err);
      }
      try {
        if (!restoredFolders || restoredFolders.length === 0) {
          const backendFolders = await listFolders(DEFAULT_LIBRARY_ID);
          if (backendFolders && backendFolders.length > 0) {
            restoredFolders = normalizeDrawerFolders(backendFolders);
          }
        }
      } catch (err) {
        console.warn('恢复后端文件夹失败:', err);
      } finally {
        if (cachedSnapshot.isValid && cachedSnapshot.updatedAt > 0) {
          restoredFolders = cachedFolders;
          restoredFromTrustedCache = true;
        } else if ((!restoredFolders || restoredFolders.length === 0) && cachedFolders.length > 0) {
          restoredFolders = cachedFolders;
        }
        if (restoredFromTrustedCache || (restoredFolders && restoredFolders.length > 0)) {
          hasRestoredNonEmptyFoldersRef.current = true;
          setFolders(restoredFolders || []);
        }
        setIsFoldersLoaded(true);
      }
    };
    // 6.0.15 started the SQLite migration and canvas restore concurrently.
    // On a large upgrade the canvas query could lose the database lock race,
    // leaving the in-memory canvas list empty even though its rows were intact.
    // Finish storage initialization first, then restore canvas/folder state.
    void (async () => {
      await initializeAssetLibrary();
      await Promise.all([restoreActiveCanvas(), restoreFolders()]);
    })();

};

export const runDrawerCoreEffect09 = (ctx: Pick<drawerCoreEffectContext, 'applyFloatingTextPayloadToSnapshots' | 'beginFloatingTextUndo' | 'broadcastFloatingNoteTextUpdate' | 'broadcastFloatingNoteTitleUpdate' | 'floatingBridgeSeenRef' | 'setItems'>) => {
  const { applyFloatingTextPayloadToSnapshots, beginFloatingTextUndo, broadcastFloatingNoteTextUpdate, broadcastFloatingNoteTitleUpdate, floatingBridgeSeenRef, setItems } = ctx;
    let unlistenFloatingText: (() => void) | undefined;
    let unlistenFloatingTitle: (() => void) | undefined;

    const applyFloatingTextUpdate = (rawPayload: any) => {
      const payload = rawPayload || {};
      const itemId = typeof payload.itemId === 'string' ? payload.itemId : '';
      const hasContent = typeof payload.content === 'string';
      const nextText = hasContent ? payload.content : '';
      const hasName = typeof payload.name === 'string';
      const nextName = hasName ? payload.name.trim() : '';
      if (!itemId || (!hasContent && !hasName)) return;
      const textKey = `text:${itemId}:${payload.sourceLabel || ''}:${payload.updatedAt || ''}`;
      const textSeenAt = payload.updatedAt ? floatingBridgeSeenRef.current[textKey] : undefined;
      if (textSeenAt && Date.now() - textSeenAt < 4000) return;
      if (payload.updatedAt) floatingBridgeSeenRef.current[textKey] = Date.now();

      applyFloatingTextPayloadToSnapshots(payload);
      beginFloatingTextUndo(itemId, '修改便签内容');
      setItems(prev => prev.map(i => {
        if (i.id !== itemId || i.type !== 'text') return i;
        const current: any = i;
        if (!hasContent) {
          return {
            ...i,
            ...replaceFirstItemRemark(i, nextName),
          } as BufferItem;
        }

        const trimmed = nextText.trim();
        const urlLike = isProbablyUrl(trimmed);
        if (urlLike) {
          return {
            ...i,
            type: 'text',
            content: trimmed,
            name: '网址链接',
            ...(hasName ? replaceFirstItemRemark(i, nextName) : {}),
            url: trimmed,
            path: trimmed,
            isUrl: true,
          } as BufferItem;
        }

        return {
          ...i,
          type: 'text',
          content: nextText,
          name: current.isUrl || i.name === '网址链接' ? '文本片段' : i.name,
          ...(hasName ? replaceFirstItemRemark(i, nextName) : {}),
          url: undefined,
          path: undefined,
          sourceUrl: undefined,
          pageUrl: undefined,
          originalUrl: undefined,
          isUrl: false,
        } as BufferItem;
      }));

      broadcastFloatingNoteTextUpdate(itemId, hasContent ? nextText : undefined, hasName ? nextName : undefined, typeof payload.sourceLabel === 'string' ? payload.sourceLabel : undefined);
    };

    const applyFloatingTitleUpdate = (rawPayload: any) => {
      const payload = rawPayload || {};
      const itemId = typeof payload.itemId === 'string' ? payload.itemId : '';
      const nextName = typeof payload.name === 'string' ? payload.name.trim() : '';
      if (!itemId) return;
      const titleKey = `title:${itemId}:${payload.sourceLabel || ''}:${payload.updatedAt || ''}`;
      const titleSeenAt = payload.updatedAt ? floatingBridgeSeenRef.current[titleKey] : undefined;
      if (titleSeenAt && Date.now() - titleSeenAt < 4000) return;
      if (payload.updatedAt) floatingBridgeSeenRef.current[titleKey] = Date.now();

      beginFloatingTextUndo(itemId, '修改便签标题');
      setItems(prev => prev.map(i => (
        i.id === itemId && i.type === 'text'
          ? { ...i, ...replaceFirstItemRemark(i, nextName) } as BufferItem
          : i
      )));

      broadcastFloatingNoteTitleUpdate(itemId, nextName, typeof payload.sourceLabel === 'string' ? payload.sourceLabel : undefined);
    };

    const onStorage = (event: StorageEvent) => {
      if (!event.newValue) return;
      try {
        if (event.key === FLOATING_NOTE_TEXT_BRIDGE_KEY) {
          applyFloatingTextUpdate(JSON.parse(event.newValue));
        }
        if (event.key === FLOATING_NOTE_TITLE_BRIDGE_KEY) {
          applyFloatingTitleUpdate(JSON.parse(event.newValue));
        }
      } catch (_) {}
    };

    listen('floating-note-text-updated', (event: any) => {
      applyFloatingTextUpdate(event.payload);
    }).then((fn) => { unlistenFloatingText = fn; }).catch(() => {});
    listen('floating-note-title-updated', (event: any) => {
      applyFloatingTitleUpdate(event.payload);
    }).then((fn) => { unlistenFloatingTitle = fn; }).catch(() => {});

    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('storage', onStorage);
      if (unlistenFloatingText) unlistenFloatingText();
      if (unlistenFloatingTitle) unlistenFloatingTitle();
    };

};

export const runDrawerCoreEffect10 = (ctx: Pick<drawerCoreEffectContext, 'imageThumbnailDisposedRef' | 'imageThumbnailPendingUpdatesRef' | 'imageThumbnailQueueRef' | 'imageThumbnailUpdateTimerRef'>) => {
  const { imageThumbnailDisposedRef, imageThumbnailPendingUpdatesRef, imageThumbnailQueueRef, imageThumbnailUpdateTimerRef } = ctx;
    imageThumbnailDisposedRef.current = false;
    return () => {
      imageThumbnailDisposedRef.current = true;
      imageThumbnailQueueRef.current = [];
      imageThumbnailPendingUpdatesRef.current.clear();
      if (imageThumbnailUpdateTimerRef.current !== null) {
        window.clearTimeout(imageThumbnailUpdateTimerRef.current);
        imageThumbnailUpdateTimerRef.current = null;
      }
    };

};

export const runDrawerCoreEffect11 = (ctx: Pick<drawerCoreEffectContext, 'quickAccessItems' | 'setItems' | 'videoThumbnailInFlightRef'>) => {
  const { quickAccessItems, setItems, videoThumbnailInFlightRef } = ctx;
    const pending = quickAccessItems.find(item =>
      item.type === 'video' &&
      item.path &&
      !item.thumbnail &&
      !videoThumbnailInFlightRef.current.has(item.id)
    );
    if (!pending?.path) return;

    videoThumbnailInFlightRef.current.add(pending.id);
    let cancelled = false;
    getVideoThumbnail(pending.path).then((thumbnail) => {
      if (cancelled || !thumbnail) return;
      setItems(prev => prev.map(item => item.id === pending.id && !item.thumbnail ? { ...item, thumbnail } : item));
    }).catch((err) => {
      console.warn('已有视频缩略图补全失败:', err);
    }).finally(() => {
      videoThumbnailInFlightRef.current.delete(pending.id);
    });

    return () => {
      cancelled = true;
    };

};

export const runDrawerCoreEffect12 = (ctx: Pick<drawerCoreEffectContext, 'DATA_THUMBNAIL_RECOMPRESS_MIN_CHARS' | 'items' | 'setItems' | 'thumbnailRecompressInFlightRef'>) => {
  const { DATA_THUMBNAIL_RECOMPRESS_MIN_CHARS, items, setItems, thumbnailRecompressInFlightRef } = ctx;
    const pending = items.find(item =>
      (item.type === 'image' || item.type === 'video') &&
      typeof item.thumbnail === 'string' &&
      item.thumbnail.startsWith('data:image/') &&
      item.thumbnail.length > DATA_THUMBNAIL_RECOMPRESS_MIN_CHARS &&
      !thumbnailRecompressInFlightRef.current.has(item.id)
    );
    if (!pending?.thumbnail) return;

    thumbnailRecompressInFlightRef.current.add(pending.id);
    let cancelled = false;
    createImageThumbnailInWebview(pending.thumbnail)
      .then((thumbnail) => {
        if (cancelled || !thumbnail || thumbnail.length >= (pending.thumbnail?.length || 0)) return;
        setItems(prev => prev.map(item => item.id === pending.id && item.thumbnail === pending.thumbnail
          ? { ...item, thumbnail }
          : item
        ));
      })
      .catch((err) => console.warn('旧缩略图压缩失败:', err))
      .finally(() => {
        thumbnailRecompressInFlightRef.current.delete(pending.id);
      });

    return () => {
      cancelled = true;
    };

};
