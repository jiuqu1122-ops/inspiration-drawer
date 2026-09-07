import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { cursorPosition } from '@tauri-apps/api/window';
import React from 'react';
import { BufferItem } from '../../types';
import type { CanvasBrushEditorState } from '../../types/canvasRuntime';
import type { ConfirmDialogState,TextInputDialogState } from '../../types/dialogs';
import type { DrawerTabType,FolderContextMenuState } from '../../types/drawer';
import { type CanvasWorkflowSaveDraft } from '../canvasTemplates';
import { DRAWER_ANIM_MS } from '../drawerPrefs';
import { shouldReuseStartupDrawerAfterOverlay } from '../startup';
import { type TriggerMode } from '../triggerModel';

type windowSnipEffectContext = { isStartupOverlayActive: boolean; snipMode: { active: boolean; bg: string; }; active: boolean; isSnipSessionActive: boolean; closeTimerRef: React.RefObject<any>; startupAutoCloseTimerRef: React.RefObject<any>; setIsOpen: React.Dispatch<React.SetStateAction<boolean>>; setDrawerState: React.Dispatch<React.SetStateAction<"closed" | "pre_open" | "open" | "closing">>; drawerWidthRef: React.RefObject<number>; drawerHeightRef: React.RefObject<number>; triggerModeRef: React.RefObject<TriggerMode>; startupOverlayWasActiveRef: React.RefObject<boolean>; snipExitInFlightRef: React.RefObject<boolean>; isDrawerActive: boolean; isAntiTouchMode: boolean; handleSnipSelection: (payload: any) => Promise<void>; handleSnipWindowCaptured: (payload: any) => Promise<void>; finishSnipWindowSession: (_restoreTrigger?: boolean) => Promise<void>; showToast: (message: string) => void; resetSnipSessionState: () => void; selectedImage: string | null; closeSelectedImagePreview: () => void; selectedImageGallery: { items: BufferItem[]; index: number; } | null; items: BufferItem[]; stepSelectedImageGallery: (direction: -1 | 1) => void; showTextInput: boolean; showWebImageCollector: boolean; showFolderModal: boolean; isSearchActive: boolean; isTextEntryActive: () => boolean; createAssetId: () => `${string}-${string}-${string}-${string}-${string}`; activeFolderId: string; pushDrawerUndoSnapshot: (label: string, options?: { shareImmutableItems?: boolean; }) => void; invalidateDrawerAssetQueryForImport: () => void; prependAssetsAndPersist: (newAssets: BufferItem[]) => Promise<void>; setActiveTab: React.Dispatch<React.SetStateAction<DrawerTabType>>; enqueueAutoAiTaggingForItems: (incomingItems: BufferItem[]) => void; createTextOrUrlItem: (rawText: string, defaultName?: string) => BufferItem; showLaunchIntro: boolean; setIsSplashVisible: React.Dispatch<React.SetStateAction<boolean>>; isSplashVisibleRef: React.RefObject<boolean>; startupAutoCloseSuppressedRef: React.RefObject<boolean>; isPointerInsideDrawerRef: React.RefObject<boolean>; STARTUP_CONSENT_DELAY_MS: 15000; setIsPinned: React.Dispatch<React.SetStateAction<boolean>>; isPinnedRef: React.RefObject<boolean>; finishLaunchIntro: (manualOrEvent?: boolean | React.MouseEvent, acceptDisclaimer?: boolean) => void; drawerAutoCloseBlockRef: React.RefObject<boolean>; isDraggingTitleRef: React.RefObject<boolean>; isGlobalMouseDown: React.RefObject<boolean>; isResizingState: React.RefObject<boolean>; isDraggingOver: boolean; isCanvasWorkbenchActive: boolean; isPinned: boolean; canvasBrushEditor: CanvasBrushEditorState | null; selectedVideo: { url: string; path: string; fromCanvas?: boolean; } | null; isDrawerAgentOpen: boolean; showMoveFolderModal: boolean; showMoveExistingFolderModal: boolean; folderContextMenu: FolderContextMenuState | null; editingFolderId: string | null; textInputDialog: TextInputDialogState; confirmDialog: ConfirmDialogState; isSplashVisible: boolean; showUpdateLog: boolean; isCanvasMode: boolean; blurCanvasActiveTextEntry: (nextTarget?: EventTarget | null) => boolean; shouldRouteShortcutToDoodle: (event: Event) => boolean; isCanvasModeRef: React.RefObject<boolean>; undoLastCanvasChange: () => boolean; undoLastDrawerChange: () => void; isSelectMode: boolean; isUtilityActiveTab: boolean; displayItems: BufferItem[]; showSettings: boolean; setIsSelectMode: React.Dispatch<React.SetStateAction<boolean>>; lastSelectedDrawerItemIdRef: React.RefObject<string | null>; canvasWorkflowSaveDraft: CanvasWorkflowSaveDraft | null; closeCanvasWorkflowSaveDialog: () => void; holdDrawerForPanelInteraction: (duration?: number) => void; appWindow: import('@tauri-apps/api/window').Window; lastDrawerPointerDownAtRef: React.RefObject<number>; isOpen: boolean; shouldBlockAutoClose: () => boolean; isMainWorkbenchActiveRef: React.RefObject<boolean>; drawerState: "closed" | "pre_open" | "open" | "closing"; snipModeActiveRef: React.RefObject<boolean>; showLaunchIntroRef: React.RefObject<boolean>; showUpdateLogRef: React.RefObject<boolean>; clearIdleAutoClose: () => void; setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>; shouldBlockIdleAutoClose: () => boolean; scheduleIdleAutoClose: (delay?: number) => void; };

export const runWindowSnipEffect01 = (ctx: Pick<windowSnipEffectContext, 'closeTimerRef' | 'drawerHeightRef' | 'drawerWidthRef' | 'isSnipSessionActive' | 'isStartupOverlayActive' | 'setDrawerState' | 'setIsOpen' | 'snipMode' | 'startupAutoCloseTimerRef' | 'triggerModeRef'>) => {
  const { closeTimerRef, drawerHeightRef, drawerWidthRef, isSnipSessionActive, isStartupOverlayActive, setDrawerState, setIsOpen, snipMode, startupAutoCloseTimerRef, triggerModeRef } = ctx;
    if (!isStartupOverlayActive || snipMode.active || isSnipSessionActive) return;

    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (startupAutoCloseTimerRef.current) {
      clearTimeout(startupAutoCloseTimerRef.current);
      startupAutoCloseTimerRef.current = null;
    }

    setIsOpen(true);
    setDrawerState(prev => (prev === 'open' ? 'open' : 'pre_open'));

    invoke('open_drawer', {
      width: drawerWidthRef.current,
      height: drawerHeightRef.current,
      mode: triggerModeRef.current,
    }).catch(() => {});
    invoke('set_topmost', { topmost: true }).catch(() => {});

    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setDrawerState('open');
      });
    });

    return () => cancelAnimationFrame(frame);

};

export const runWindowSnipEffect02 = (ctx: Pick<windowSnipEffectContext, 'closeTimerRef' | 'drawerHeightRef' | 'drawerWidthRef' | 'isDrawerActive' | 'isSnipSessionActive' | 'isStartupOverlayActive' | 'setDrawerState' | 'snipExitInFlightRef' | 'snipMode' | 'startupOverlayWasActiveRef' | 'triggerModeRef'>) => {
  const { closeTimerRef, drawerHeightRef, drawerWidthRef, isDrawerActive, isSnipSessionActive, isStartupOverlayActive, setDrawerState, snipExitInFlightRef, snipMode, startupOverlayWasActiveRef, triggerModeRef } = ctx;
  let cancelled = false;
  let timer: any = null;
  let frame: number | null = null;
  const wasStartupOverlayActive = startupOverlayWasActiveRef.current;
  startupOverlayWasActiveRef.current = isStartupOverlayActive;

  const run = async () => {
    if (snipMode.active || isSnipSessionActive || snipExitInFlightRef.current) return;

    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (isDrawerActive) {
      // 启动覆盖层拥有独立且唯一的窗口打开/滑入序列。这里若继续调用
      // open_drawer，会和启动 useLayoutEffect 竞争并反复回写开合状态。
      if (isStartupOverlayActive) return;

      if (shouldReuseStartupDrawerAfterOverlay({
        wasStartupOverlayActive,
        isStartupOverlayActive,
        isDrawerActive,
      })) {
        setDrawerState('open');
        return;
      }

      setDrawerState(prev => (prev === 'open' ? 'open' : 'pre_open'));

      await invoke('open_drawer', {
        width: drawerWidthRef.current,
        height: drawerHeightRef.current,
        mode: triggerModeRef.current,
      }).catch(() => {});
      await invoke('set_topmost', { topmost: true }).catch(() => {});

      if (cancelled) return;
      frame = requestAnimationFrame(() => {
        if (!cancelled) setDrawerState('open');
      });
    } else {
      setDrawerState(prev => (prev === 'closed' ? 'closed' : 'closing'));

      timer = setTimeout(async () => {
        if (cancelled) return;
        await invoke('close_drawer', { mode: triggerModeRef.current }).catch(() => {});

        if (cancelled) return;
        setDrawerState('closed');
        await invoke('set_topmost', { topmost: true }).catch(() => {});
      }, DRAWER_ANIM_MS);
    }
  };

  run();

  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
    if (frame !== null) cancelAnimationFrame(frame);
  };

};

export const runWindowSnipEffect03 = (ctx: Pick<windowSnipEffectContext, 'drawerHeightRef' | 'isAntiTouchMode' | 'isDrawerActive' | 'isSnipSessionActive' | 'isStartupOverlayActive' | 'snipExitInFlightRef' | 'snipMode' | 'triggerModeRef'>) => {
  const { drawerHeightRef, isAntiTouchMode, isDrawerActive, isSnipSessionActive, isStartupOverlayActive, snipExitInFlightRef, snipMode, triggerModeRef } = ctx;
    if (
      snipMode.active ||
      isSnipSessionActive ||
      snipExitInFlightRef.current ||
      isStartupOverlayActive ||
      isDrawerActive ||
      isAntiTouchMode
    ) return;

    const timers = [120, 700].map(delay => window.setTimeout(() => {
      invoke('show_edge', {
        height: drawerHeightRef.current,
        mode: triggerModeRef.current,
      }).catch(() => {});
    }, delay));

    return () => {
      timers.forEach(timer => window.clearTimeout(timer));
    };

};

export const runWindowSnipEffect04 = (ctx: Pick<windowSnipEffectContext, 'finishSnipWindowSession' | 'handleSnipSelection' | 'handleSnipWindowCaptured' | 'resetSnipSessionState' | 'showToast'>) => {
  const { finishSnipWindowSession, handleSnipSelection, handleSnipWindowCaptured, resetSnipSessionState, showToast } = ctx;
    const unlisteners: Array<() => void> = [];
    let disposed = false;
    const addSnipListener = (listener: Promise<() => void>) => {
      listener.then(unlisten => {
        if (disposed) {
          unlisten();
        } else {
          unlisteners.push(unlisten);
        }
      }).catch(console.warn);
    };
    addSnipListener(listen('snip-selection', (event: any) => {
      void handleSnipSelection(event.payload);
    }));
    addSnipListener(listen('snip-captured', (event: any) => {
      void handleSnipWindowCaptured(event.payload);
    }));
    addSnipListener(listen('snip-cancelled', () => {
      void finishSnipWindowSession(true);
    }));
    addSnipListener(listen('snip-failed', (event: any) => {
      console.warn('snip window capture failed:', event.payload);
      showToast('截图失败');
      void finishSnipWindowSession(true);
    }));
    addSnipListener(listen('snip-recovered', () => {
      resetSnipSessionState();
    }));
    return () => {
      disposed = true;
      unlisteners.splice(0).forEach(unlisten => unlisten());
    };

};

export const runWindowSnipEffect05 = (ctx: Pick<windowSnipEffectContext, 'closeSelectedImagePreview' | 'selectedImage' | 'selectedImageGallery' | 'stepSelectedImageGallery'>) => {
  const { closeSelectedImagePreview, selectedImage, selectedImageGallery, stepSelectedImageGallery } = ctx;
    const handleSelectedImageKey = (e: KeyboardEvent) => {
      if (!selectedImage) return;
      if (e.key === 'Escape') {
        closeSelectedImagePreview();
        return;
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (!selectedImageGallery || selectedImageGallery.items.length < 2) return;
      e.preventDefault();
      e.stopPropagation();
      stepSelectedImageGallery(e.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', handleSelectedImageKey);
    return () => { window.removeEventListener('keydown', handleSelectedImageKey); };

};

export const runWindowSnipEffect06 = (ctx: Pick<windowSnipEffectContext, 'activeFolderId' | 'createAssetId' | 'createTextOrUrlItem' | 'enqueueAutoAiTaggingForItems' | 'invalidateDrawerAssetQueryForImport' | 'isSearchActive' | 'isTextEntryActive' | 'prependAssetsAndPersist' | 'pushDrawerUndoSnapshot' | 'setActiveTab' | 'setIsOpen' | 'showFolderModal' | 'showTextInput' | 'showWebImageCollector'>) => {
  const { activeFolderId, createAssetId, createTextOrUrlItem, enqueueAutoAiTaggingForItems, invalidateDrawerAssetQueryForImport, isSearchActive, isTextEntryActive, prependAssetsAndPersist, pushDrawerUndoSnapshot, setActiveTab, setIsOpen, showFolderModal, showTextInput, showWebImageCollector } = ctx;
    const handlePaste = (e: any) => {
      if (showTextInput || showWebImageCollector || showFolderModal || isSearchActive || isTextEntryActive()) return;
      const clipboardItems = e.clipboardData?.items; if (!clipboardItems) return;
      for (let i = 0; i < clipboardItems.length; i++) {
        if (clipboardItems[i].type.startsWith('image/')) {
          const file = clipboardItems[i].getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
              const url = ev.target?.result as string;
              const newItem = { id: createAssetId(), type: 'image', content: '图片', name: `粘贴图 ${new Date().toLocaleTimeString()}.png`, url, createdAt: Date.now(), folderId: activeFolderId !== 'all' ? activeFolderId : undefined } as BufferItem;
              pushDrawerUndoSnapshot('粘贴图片');
              invalidateDrawerAssetQueryForImport();
              const persistImport = prependAssetsAndPersist([newItem]);
              void persistImport.then(
                () => setActiveTab('image'),
                () => setActiveTab('image'),
              );
              enqueueAutoAiTaggingForItems([newItem]);
              setIsOpen(true);
            };
            reader.readAsDataURL(file);
          }
        } else if (clipboardItems[i].type === 'text/plain') {
          clipboardItems[i].getAsString((text: string) => {
            if (text.trim()) {
              pushDrawerUndoSnapshot('粘贴文本');
              invalidateDrawerAssetQueryForImport();
              const persistImport = prependAssetsAndPersist([createTextOrUrlItem(text, '文本片段')]);
              void persistImport.then(
                () => setActiveTab('text'),
                () => setActiveTab('text'),
              );
              setIsOpen(true);
            }
          });
        }
      }
    };
    window.addEventListener('paste', handlePaste); return () => window.removeEventListener('paste', handlePaste);

};

export const runWindowSnipEffect07 = (ctx: Pick<windowSnipEffectContext, 'STARTUP_CONSENT_DELAY_MS' | 'finishLaunchIntro' | 'isPinnedRef' | 'isPointerInsideDrawerRef' | 'isSplashVisibleRef' | 'setIsPinned' | 'setIsSplashVisible' | 'showLaunchIntro' | 'startupAutoCloseSuppressedRef'>) => {
  const { STARTUP_CONSENT_DELAY_MS, finishLaunchIntro, isPinnedRef, isPointerInsideDrawerRef, isSplashVisibleRef, setIsPinned, setIsSplashVisible, showLaunchIntro, startupAutoCloseSuppressedRef } = ctx;
    if (!showLaunchIntro) {
      setIsSplashVisible(false);
      isSplashVisibleRef.current = false;
      return;
    }

    // 不要在这里标记启动动画完成；React StrictMode / Tauri dev 会重挂载，
    // 提前写入会让第二次挂载误以为动画已完成，启动瞬间就缩回。
    startupAutoCloseSuppressedRef.current = true;
    isPointerInsideDrawerRef.current = false;
    setIsSplashVisible(true);
    isSplashVisibleRef.current = true;

    // 后端启动锁：启动欢迎页期间即使有旧的 close_drawer / drawer-closed，
    // Rust 层也直接忽略，避免主窗口被真实隐藏。
    invoke('set_startup_close_lock', { ms: STARTUP_CONSENT_DELAY_MS + 1000 }).catch(() => {});

    // 启动欢迎页期间临时钉住，避免任何自动关闭事件把抽屉收回。
    // 倒计时结束或用户手动跳过时，再在 finishLaunchIntro 里恢复普通打开态。
    setIsPinned(true);
    isPinnedRef.current = true;
    invoke('toggle_pin', { pinned: true }).catch(() => {});

    // 真实窗口打开和 pre_open -> open 动画统一由上方的启动覆盖层 effect 控制。
    // 此处只维护欢迎页锁定与倒计时，避免同一轮启动重播滑入动画。

    const timer = window.setTimeout(() => finishLaunchIntro(false, true), STARTUP_CONSENT_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };

};

export const runWindowSnipEffect08 = (ctx: Pick<windowSnipEffectContext, 'canvasBrushEditor' | 'confirmDialog' | 'drawerAutoCloseBlockRef' | 'editingFolderId' | 'folderContextMenu' | 'isCanvasWorkbenchActive' | 'isDraggingOver' | 'isDraggingTitleRef' | 'isDrawerAgentOpen' | 'isGlobalMouseDown' | 'isPinned' | 'isResizingState' | 'isSearchActive' | 'isSnipSessionActive' | 'isSplashVisible' | 'isTextEntryActive' | 'selectedImage' | 'selectedVideo' | 'showFolderModal' | 'showLaunchIntro' | 'showMoveExistingFolderModal' | 'showMoveFolderModal' | 'showTextInput' | 'showUpdateLog' | 'showWebImageCollector' | 'snipMode' | 'startupAutoCloseSuppressedRef' | 'textInputDialog'>) => {
  const { canvasBrushEditor, confirmDialog, drawerAutoCloseBlockRef, editingFolderId, folderContextMenu, isCanvasWorkbenchActive, isDraggingOver, isDraggingTitleRef, isDrawerAgentOpen, isGlobalMouseDown, isPinned, isResizingState, isSearchActive, isSnipSessionActive, isSplashVisible, isTextEntryActive, selectedImage, selectedVideo, showFolderModal, showLaunchIntro, showMoveExistingFolderModal, showMoveFolderModal, showTextInput, showUpdateLog, showWebImageCollector, snipMode, startupAutoCloseSuppressedRef, textInputDialog } = ctx;
    drawerAutoCloseBlockRef.current = (
      isDraggingTitleRef.current ||
      startupAutoCloseSuppressedRef.current ||
      isGlobalMouseDown.current ||
      isResizingState.current ||
      isDraggingOver ||
      isCanvasWorkbenchActive ||
      isPinned ||
      !!canvasBrushEditor ||
      !!selectedImage ||
      !!selectedVideo ||
      isTextEntryActive() ||
      isDrawerAgentOpen ||
      showTextInput ||
      showWebImageCollector ||
      showFolderModal ||
      showMoveFolderModal ||
      showMoveExistingFolderModal ||
      !!folderContextMenu ||
      isSearchActive ||
      editingFolderId !== null ||
      textInputDialog.isOpen ||
      confirmDialog.isOpen ||
      showLaunchIntro ||
      isSplashVisible ||
      showUpdateLog ||
      snipMode.active ||
      isSnipSessionActive
    );

};

export const runWindowSnipEffect09 = (ctx: Pick<windowSnipEffectContext, 'blurCanvasActiveTextEntry' | 'isCanvasMode'>) => {
  const { blurCanvasActiveTextEntry, isCanvasMode } = ctx;
    if (!isCanvasMode) return;
    const handleCanvasPointerDownForBlur = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest([
        '[data-canvas-run-control="true"]',
        '[data-canvas-edit-control="true"]',
        '[data-canvas-floating-layer="true"]',
      ].join(','))) return;
      blurCanvasActiveTextEntry(event.target);
    };
    document.addEventListener('pointerdown', handleCanvasPointerDownForBlur, true);
    return () => {
      document.removeEventListener('pointerdown', handleCanvasPointerDownForBlur, true);
    };

};

export const runWindowSnipEffect10 = (ctx: Pick<windowSnipEffectContext, 'isCanvasModeRef' | 'isDrawerActive' | 'isTextEntryActive' | 'shouldRouteShortcutToDoodle' | 'undoLastCanvasChange' | 'undoLastDrawerChange'>) => {
  const { isCanvasModeRef, isDrawerActive, isTextEntryActive, shouldRouteShortcutToDoodle, undoLastCanvasChange, undoLastDrawerChange } = ctx;
    const handleDrawerUndoKeyDown = (event: KeyboardEvent) => {
      if (shouldRouteShortcutToDoodle(event)) return;
      if (event.repeat || event.shiftKey || event.altKey) return;
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
      if (!isDrawerActive || isTextEntryActive()) return;

      event.preventDefault();
      event.stopPropagation();
      if (isCanvasModeRef.current && undoLastCanvasChange()) return;
      undoLastDrawerChange();
    };

    window.addEventListener('keydown', handleDrawerUndoKeyDown, true);
    document.addEventListener('keydown', handleDrawerUndoKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleDrawerUndoKeyDown, true);
      document.removeEventListener('keydown', handleDrawerUndoKeyDown, true);
    };

};

export const runWindowSnipEffect11 = (ctx: Pick<windowSnipEffectContext, 'confirmDialog' | 'displayItems' | 'isDrawerActive' | 'isSearchActive' | 'isSelectMode' | 'isSnipSessionActive' | 'isTextEntryActive' | 'isUtilityActiveTab' | 'lastSelectedDrawerItemIdRef' | 'selectedImage' | 'selectedVideo' | 'setIsSelectMode' | 'showFolderModal' | 'showMoveExistingFolderModal' | 'showMoveFolderModal' | 'showSettings' | 'showTextInput' | 'showWebImageCollector' | 'snipMode' | 'textInputDialog'>) => {
  const { confirmDialog, displayItems, isDrawerActive, isSearchActive, isSelectMode, isSnipSessionActive, isTextEntryActive, isUtilityActiveTab, lastSelectedDrawerItemIdRef, selectedImage, selectedVideo, setIsSelectMode, showFolderModal, showMoveExistingFolderModal, showMoveFolderModal, showSettings, showTextInput, showWebImageCollector, snipMode, textInputDialog } = ctx;
    const handleShiftToSelect = (event: KeyboardEvent) => {
      if (event.key !== 'Shift' || event.repeat) return;
      if (
        !isDrawerActive ||
        isSelectMode ||
        isUtilityActiveTab ||
        displayItems.length === 0 ||
        showSettings ||
        showTextInput ||
        showWebImageCollector ||
        showFolderModal ||
        showMoveFolderModal ||
        showMoveExistingFolderModal ||
        isSearchActive ||
        textInputDialog.isOpen ||
        confirmDialog.isOpen ||
        !!selectedImage ||
        !!selectedVideo ||
        snipMode.active ||
        isSnipSessionActive ||
        isTextEntryActive()
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setIsSelectMode(true);
      lastSelectedDrawerItemIdRef.current = null;
    };

    window.addEventListener('keydown', handleShiftToSelect, true);
    return () => window.removeEventListener('keydown', handleShiftToSelect, true);

};

export const runWindowSnipEffect12 = (ctx: Pick<windowSnipEffectContext, 'canvasWorkflowSaveDraft' | 'closeCanvasWorkflowSaveDialog'>) => {
  const { canvasWorkflowSaveDraft, closeCanvasWorkflowSaveDialog } = ctx;
    if (!canvasWorkflowSaveDraft) return;
    const handleCanvasWorkflowSaveKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closeCanvasWorkflowSaveDialog();
    };
    window.addEventListener('keydown', handleCanvasWorkflowSaveKeyDown, true);
    return () => window.removeEventListener('keydown', handleCanvasWorkflowSaveKeyDown, true);

};

export const runWindowSnipEffect13 = (ctx: Pick<windowSnipEffectContext, 'confirmDialog' | 'folderContextMenu' | 'holdDrawerForPanelInteraction' | 'isDrawerAgentOpen' | 'showFolderModal' | 'showMoveExistingFolderModal' | 'showMoveFolderModal' | 'showTextInput' | 'showWebImageCollector' | 'textInputDialog'>) => {
  const { confirmDialog, folderContextMenu, holdDrawerForPanelInteraction, isDrawerAgentOpen, showFolderModal, showMoveExistingFolderModal, showMoveFolderModal, showTextInput, showWebImageCollector, textInputDialog } = ctx;
    if (
      showTextInput ||
      showWebImageCollector ||
      showFolderModal ||
      showMoveFolderModal ||
      showMoveExistingFolderModal ||
      isDrawerAgentOpen ||
      !!folderContextMenu ||
      textInputDialog.isOpen ||
      confirmDialog.isOpen
    ) {
      holdDrawerForPanelInteraction(1800);
    }

};

export const runWindowSnipEffect14 = (ctx: Pick<windowSnipEffectContext, 'appWindow' | 'clearIdleAutoClose' | 'closeTimerRef' | 'drawerState' | 'isDraggingOver' | 'isDraggingTitleRef' | 'isMainWorkbenchActiveRef' | 'isOpen' | 'isPinnedRef' | 'isPointerInsideDrawerRef' | 'isResizingState' | 'isSelectMode' | 'isSnipSessionActive' | 'isSplashVisibleRef' | 'lastDrawerPointerDownAtRef' | 'lastSelectedDrawerItemIdRef' | 'setIsOpen' | 'setIsPinned' | 'setIsSelectMode' | 'setSelectedIds' | 'shouldBlockAutoClose' | 'showLaunchIntroRef' | 'showUpdateLogRef' | 'snipExitInFlightRef' | 'snipModeActiveRef'>) => {
  const { appWindow, clearIdleAutoClose, closeTimerRef, drawerState, isDraggingOver, isDraggingTitleRef, isMainWorkbenchActiveRef, isOpen, isPinnedRef, isPointerInsideDrawerRef, isResizingState, isSelectMode, isSnipSessionActive, isSplashVisibleRef, lastDrawerPointerDownAtRef, lastSelectedDrawerItemIdRef, setIsOpen, setIsPinned, setIsSelectMode, setSelectedIds, shouldBlockAutoClose, showLaunchIntroRef, showUpdateLogRef, snipExitInFlightRef, snipModeActiveRef } = ctx;
    let disposed = false;
    let unlistenFocusChanged: (() => void) | undefined;
    let closeFrame: number | null = null;

    const closeUnpinnedDrawerFromOutside = () => {
      if (closeFrame !== null) cancelAnimationFrame(closeFrame);
      closeFrame = requestAnimationFrame(() => {
        closeFrame = null;
        void (async () => {
          let pointerInsideForClose = isPointerInsideDrawerRef.current;
          if (isSelectMode && pointerInsideForClose) {
            try {
              const [cursor, position, size] = await Promise.all([
                cursorPosition(),
                appWindow.outerPosition(),
                appWindow.outerSize(),
              ]);
              pointerInsideForClose =
                cursor.x >= position.x &&
                cursor.y >= position.y &&
                cursor.x <= position.x + size.width &&
                cursor.y <= position.y + size.height;
            } catch (_) {}
          }

          const wasInternalInteraction = Date.now() - lastDrawerPointerDownAtRef.current < 500 && pointerInsideForClose;
          if (
            !isOpen ||
            shouldBlockAutoClose() ||
            isMainWorkbenchActiveRef.current ||
            isPinnedRef.current ||
            pointerInsideForClose ||
            wasInternalInteraction ||
            drawerState === 'closed' ||
            drawerState === 'closing' ||
            snipModeActiveRef.current ||
            snipExitInFlightRef.current ||
            isSnipSessionActive ||
            isDraggingTitleRef.current ||
            isResizingState.current ||
            isDraggingOver ||
            showLaunchIntroRef.current ||
            isSplashVisibleRef.current ||
            showUpdateLogRef.current
          ) {
            return;
          }

          isPointerInsideDrawerRef.current = false;
          if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
          }
          clearIdleAutoClose();
          setIsOpen(false);
          setIsPinned(false);
          setIsSelectMode(false);
          setSelectedIds([]);
          lastSelectedDrawerItemIdRef.current = null;
          isPinnedRef.current = false;
          invoke('toggle_pin', { pinned: false }).catch(() => {});
        })();
      });
    };

    const handleWindowBlur = () => closeUnpinnedDrawerFromOutside();

    window.addEventListener('blur', handleWindowBlur, true);
    appWindow.onFocusChanged((event) => {
      if (!event.payload) closeUnpinnedDrawerFromOutside();
    }).then((unlisten) => {
      if (disposed) unlisten();
      else unlistenFocusChanged = unlisten;
    }).catch(() => {});

    return () => {
      disposed = true;
      if (closeFrame !== null) cancelAnimationFrame(closeFrame);
      window.removeEventListener('blur', handleWindowBlur, true);
      if (unlistenFocusChanged) unlistenFocusChanged();
    };

};

export const runWindowSnipEffect15 = (ctx: Pick<windowSnipEffectContext, 'clearIdleAutoClose' | 'drawerState' | 'isDrawerActive' | 'isPointerInsideDrawerRef' | 'scheduleIdleAutoClose' | 'shouldBlockIdleAutoClose'>) => {
  const { clearIdleAutoClose, drawerState, isDrawerActive, isPointerInsideDrawerRef, scheduleIdleAutoClose, shouldBlockIdleAutoClose } = ctx;
    if (
      !isDrawerActive ||
      drawerState !== 'open' ||
      isPointerInsideDrawerRef.current ||
      shouldBlockIdleAutoClose()
    ) {
      clearIdleAutoClose();
      return;
    }

    scheduleIdleAutoClose(3000);
    return clearIdleAutoClose;

};

export const runWindowSnipEffect16 = (ctx: Pick<windowSnipEffectContext, 'clearIdleAutoClose' | 'isPointerInsideDrawerRef' | 'scheduleIdleAutoClose'>) => {
  const { clearIdleAutoClose, isPointerInsideDrawerRef, scheduleIdleAutoClose } = ctx;
    const handleFocusIn = () => {
      if (isPointerInsideDrawerRef.current) return;
      clearIdleAutoClose();
    };
    const handleFocusOut = () => {
      window.setTimeout(() => {
        if (!isPointerInsideDrawerRef.current) scheduleIdleAutoClose(3000);
      }, 0);
    };

    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);
    return () => {
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
    };

};
