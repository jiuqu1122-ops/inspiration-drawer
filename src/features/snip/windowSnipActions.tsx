import { convertFileSrc,invoke } from '@tauri-apps/api/core';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import { listen } from '@tauri-apps/api/event';
import { cursorPosition } from '@tauri-apps/api/window';
import { File as FileIcon,Film,FolderOpen,Image as ImageIcon,Link,Type } from 'lucide-react';
import React from 'react';
import { flushSync } from 'react-dom';
import { SNIP_CAPTURE_LOCK_STORAGE_KEY,SNIP_RESTORE_DRAWER_STORAGE_KEY } from '../../components/SnipOverlay';
import { BufferItem,FloatingNoteSnapshot } from '../../types';
import type { DrawerTabType } from '../../types/drawer';
import { isCanvasAiGeneratorType } from '../canvasAiRuntime';
import { type CanvasImageItem } from '../canvasModel';
import { clamp } from '../common';
import { getFileExtension,isProbablyUrl } from '../dragData';
import { MAX_DRAWER_HEIGHT,MAX_DRAWER_WIDTH,MIN_DRAWER_HEIGHT,MIN_DRAWER_WIDTH } from '../drawerPrefs';
import { deleteFloatingNoteSnapshot,floatingNoteStorageKey,forgetOpenFloatingNoteLabel,getStableFloatingNoteImageFields,readFloatingNoteSnapshot } from '../floatingNotes';
import { acquireTimedLocalLock,localLockKeyPart } from '../localLock';
import { LruCache } from '../lruCache';
import { getPreviewOriginalSource,getPreviewPlaceholderSource } from '../mediaSources';
import { markLaunchIntroDoneThisPage } from '../startup';
import { EDGE_WIDTH,type TriggerMode } from '../triggerModel';

type windowSnipActionContext = { selectedImageOriginalCacheRef: React.RefObject<LruCache<string, string>>; setSelectedImageGallery: React.Dispatch<React.SetStateAction<{ items: BufferItem[]; index: number; } | null>>; selectedImageReturnToCanvasRef: React.RefObject<boolean>; setSelectedImage: React.Dispatch<React.SetStateAction<string | null>>; selectedImageGallery: { items: BufferItem[]; index: number; } | null; items: BufferItem[]; index: number; openSelectedImagePreview: (sourceOrItem: string | BufferItem, options?: { fromCanvas?: boolean; galleryItems?: BufferItem[]; galleryIndex?: number; }) => void; isCanvasModeRef: React.RefObject<boolean>; closeTimerRef: React.RefObject<any>; idleAutoCloseTimerRef: React.RefObject<any>; startupAutoCloseSuppressedRef: React.RefObject<boolean>; isPointerInsideDrawerRef: React.RefObject<boolean>; setIsOpen: React.Dispatch<React.SetStateAction<boolean>>; setIsPinned: React.Dispatch<React.SetStateAction<boolean>>; isPinnedRef: React.RefObject<boolean>; setDrawerState: React.Dispatch<React.SetStateAction<"closed" | "pre_open" | "open" | "closing">>; isCanvasWorkbenchActiveRef: React.RefObject<boolean>; drawerWidthRef: React.RefObject<number>; drawerHeightRef: React.RefObject<number>; triggerModeRef: React.RefObject<TriggerMode>; canvasSurfaceRef: React.RefObject<HTMLDivElement | null>; restoreCanvasAfterMediaPreview: () => void; selectedVideoReturnToCanvasRef: React.RefObject<boolean>; setSelectedVideo: React.Dispatch<React.SetStateAction<{ url: string; path: string; fromCanvas?: boolean; } | null>>; imageSourceToDataUrl: (source: string, optimizeForAi?: boolean) => Promise<string>; copyImageDataUrlToSystemClipboard: (dataUrl: string) => Promise<void>; wait: (ms: number) => Promise<unknown>; pendingBoundsRef: React.RefObject<{ width: number; height: number; anchor?: "left" | "right"; } | null>; boundsFrameRef: React.RefObject<number | null>; snipMode: { active: boolean; bg: string; }; active: boolean; isSnipSessionActive: boolean; boundsInvokeInFlightRef: React.RefObject<boolean>; boundsSyncRequestedRef: React.RefObject<boolean>; width: number; anchor: "left" | "right" | undefined; height: number; applyWindowBounds: (width: number, height: number, anchor?: "left" | "right") => void; stateRef: React.RefObject<{ isOpen: boolean; isPinned: boolean; showTextInput: boolean; isSearchActive: boolean; isAntiTouchMode: boolean; }>; isAntiTouchMode: boolean; enforceAntiTouchClosed: (showFeedback?: boolean) => void; snipModeActiveRef: React.RefObject<boolean>; snipCaptureInFlightRef: React.RefObject<boolean>; isGlobalMouseDown: React.RefObject<boolean>; isDraggingTitleRef: React.RefObject<boolean>; setIsDraggingTitle: React.Dispatch<React.SetStateAction<boolean>>; isResizingState: React.RefObject<boolean>; setIsSnipSessionActive: React.Dispatch<React.SetStateAction<boolean>>; isOpen: boolean | undefined; isPinned: boolean | undefined; isCanvasMode: boolean | undefined; drawerState: "closed" | "pre_open" | "open" | "closing"; snipRestoreDrawerRef: React.RefObject<{ isOpen: boolean; isPinned: boolean; isCanvasMode: boolean; } | null>; setSelection: React.Dispatch<React.SetStateAction<{ x: number; y: number; w: number; h: number; } | null>>; setSnipMode: React.Dispatch<React.SetStateAction<{ active: boolean; bg: string; }>>; showToast: (message: string) => void; snipExitInFlightRef: React.RefObject<boolean>; isMouseDown: React.RefObject<boolean>; appWindow: import('@tauri-apps/api/window').Window; markShortcutReveal: () => void; setActiveTab: React.Dispatch<React.SetStateAction<DrawerTabType>>; scheduleIdleAutoClose: (delay?: number) => void; selection: { x: number; y: number; w: number; h: number; } | null; w: number; h: number; exitSnip: (reopen?: boolean) => Promise<void>; playSnipShutterSound: () => void; screenshotAutoPinNoteRef: React.RefObject<boolean>; createAssetId: () => `${string}-${string}-${string}-${string}-${string}`; getSnipPlaceholderUrl: () => string; activeFolderId: string; x: number; y: number; createFloatingNote: (item: BufferItem, options?: { topmost?: boolean; x?: number; y?: number; width?: number; height?: number; silent?: boolean; }) => Promise<{ noteLabel: string; snapshot: FloatingNoteSnapshot; } | null | undefined>; emitFloatingNoteUpdated: (label: string, snapshot: FloatingNoteSnapshot) => Promise<void>; refreshNoteManager: () => void; pushDrawerUndoSnapshot: (label: string, options?: { shareImmutableItems?: boolean; }) => void; setItems: React.Dispatch<React.SetStateAction<BufferItem[]>>; copyLocalImageToClipboard: (path: string) => Promise<void>; revealDrawerAfterSnipCopy: () => Promise<void>; finishSnipWindowSession: (_restoreTrigger?: boolean) => Promise<void>; handledSnipPathsRef: React.RefObject<Map<string, number>>; resetSnipSessionState: () => void; activeFolderIdRef: React.RefObject<string>; enqueueAutoAiTaggingForItems: (incomingItems: BufferItem[]) => void; createCanvasImageItemFromPath: (originalPath: string, index?: number, client?: { x: number; y: number; }) => Promise<CanvasImageItem | null>; addCanvasImageItems: (nextItems: CanvasImageItem[]) => void; recoverSnipWindowFromMain: (restoreDrawer: boolean) => Promise<void>; handleSnipWindowCaptured: (payload: any) => Promise<void>; drawerResizeAnchorRef: React.RefObject<"left" | "right">; setDrawerWidth: React.Dispatch<React.SetStateAction<number>>; setDrawerHeight: React.Dispatch<React.SetStateAction<number>>; shouldBlockAutoClose: () => boolean; finishResize: (anchor?: "left" | "right") => void; acceptCloudflaredDisclaimer: () => void; CLOUDFLARED_DISCLAIMER_ACCEPTED_STORAGE_KEY: "drawer_cloudflared_disclaimer_accepted"; declineCloudflaredDisclaimer: () => void; startupAutoCloseTimerRef: React.RefObject<any>; showLaunchIntroRef: React.RefObject<boolean>; isSplashVisibleRef: React.RefObject<boolean>; setShowLaunchIntro: React.Dispatch<React.SetStateAction<boolean>>; setIsSplashVisible: React.Dispatch<React.SetStateAction<boolean>>; canvasItemsRef: React.RefObject<CanvasImageItem[]>; generateCanvasWorkflowModuleNode: (targetId: string) => Promise<void>; generateCanvasAiGeneratorNode: (targetId: string) => Promise<void>; canvasRunButtonPointerRef: React.RefObject<{ targetId: string; at: number; } | null>; runCanvasAiNodeFromControl: (targetId: string) => void; targetId: string | undefined; at: number; clearIdleAutoClose: () => void; setIsSelectMode: React.Dispatch<React.SetStateAction<boolean>>; setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>; lastSelectedDrawerItemIdRef: React.RefObject<string | null>; drawerPanelInteractionHoldUntilRef: React.RefObject<number>; lastDrawerPointerDownAtRef: React.RefObject<number>; isDrawerActive: boolean; shouldBlockIdleAutoClose: () => boolean; requestAutoCloseDrawer: () => void; isCursorInsideDrawerWindow: () => Promise<boolean>; selectedImagePanRef: React.RefObject<{ x: number; y: number; }>; setSelectedImagePan: React.Dispatch<React.SetStateAction<{ x: number; y: number; }>>; previewDragActiveRef: React.RefObject<boolean>; isMainWorkbenchActiveRef: React.RefObject<boolean>; folderRailHeight: number; setFolderRailHeight: React.Dispatch<React.SetStateAction<number>>; isFolderSidebarLayout: boolean; drawerFolderSidebarWidth: number; DRAWER_FOLDER_SIDEBAR_MAX_WIDTH: 320; DRAWER_FOLDER_SIDEBAR_MIN_WIDTH: 250; setDrawerFolderSidebarWidth: React.Dispatch<React.SetStateAction<number>>; };

export const openSelectedImagePreviewImpl = (ctx: Pick<windowSnipActionContext, 'selectedImageOriginalCacheRef' | 'selectedImageReturnToCanvasRef' | 'setSelectedImage' | 'setSelectedImageGallery'>, sourceOrItem: string | BufferItem, options: { fromCanvas?: boolean; galleryItems?: BufferItem[]; galleryIndex?: number } = {}) => {
  const { selectedImageOriginalCacheRef, selectedImageReturnToCanvasRef, setSelectedImage, setSelectedImageGallery } = ctx;
    const item = typeof sourceOrItem === 'string' ? null : sourceOrItem;
    const originalSource = typeof sourceOrItem === 'string'
      ? String(sourceOrItem || '').trim()
      : getPreviewOriginalSource(sourceOrItem);
    const placeholderSource = item
      ? getPreviewPlaceholderSource(item)
      : originalSource;
    const cacheKey = item ? `${item.id}\n${originalSource}` : originalSource;
    const cachedSource = selectedImageOriginalCacheRef.current.get(cacheKey);
    const source = cachedSource || placeholderSource || originalSource;
    if (!source) return;
    const galleryItems = (options.galleryItems || []).filter(candidate => !!getPreviewOriginalSource(candidate));
    if (galleryItems.length > 1) {
      const requestedIndex = Number.isInteger(options.galleryIndex) ? Number(options.galleryIndex) : 0;
      setSelectedImageGallery({
        items: galleryItems,
        index: Math.max(0, Math.min(galleryItems.length - 1, requestedIndex)),
      });
    } else {
      setSelectedImageGallery(null);
    }
    selectedImageReturnToCanvasRef.current = !!options.fromCanvas;
    setSelectedImage(source);
    if (!cachedSource && originalSource && originalSource !== source) {
      const image = new Image();
      image.onload = () => {
        selectedImageOriginalCacheRef.current.set(cacheKey, originalSource);
        setSelectedImage(current => current === source ? originalSource : current);
      };
      image.onerror = (err) => {
        console.warn('preview original image load failed:', err);
      };
      image.src = originalSource;
    }

};

export const stepSelectedImageGalleryImpl = (ctx: Pick<windowSnipActionContext, 'isCanvasModeRef' | 'openSelectedImagePreview' | 'selectedImageGallery' | 'selectedImageReturnToCanvasRef'>, direction: -1 | 1) => {
  const { isCanvasModeRef, openSelectedImagePreview, selectedImageGallery, selectedImageReturnToCanvasRef } = ctx;
    if (!selectedImageGallery || selectedImageGallery.items.length < 2) return;
    const nextIndex = (
      selectedImageGallery.index + direction + selectedImageGallery.items.length
    ) % selectedImageGallery.items.length;
    openSelectedImagePreview(selectedImageGallery.items[nextIndex], {
      fromCanvas: selectedImageReturnToCanvasRef.current || isCanvasModeRef.current,
      galleryItems: selectedImageGallery.items,
      galleryIndex: nextIndex,
    });

};

export const restoreCanvasAfterMediaPreviewImpl = (ctx: Pick<windowSnipActionContext, 'canvasSurfaceRef' | 'closeTimerRef' | 'drawerHeightRef' | 'drawerWidthRef' | 'idleAutoCloseTimerRef' | 'isCanvasWorkbenchActiveRef' | 'isPinnedRef' | 'isPointerInsideDrawerRef' | 'setDrawerState' | 'setIsOpen' | 'setIsPinned' | 'startupAutoCloseSuppressedRef' | 'triggerModeRef'>) => {
  const { canvasSurfaceRef, closeTimerRef, drawerHeightRef, drawerWidthRef, idleAutoCloseTimerRef, isCanvasWorkbenchActiveRef, isPinnedRef, isPointerInsideDrawerRef, setDrawerState, setIsOpen, setIsPinned, startupAutoCloseSuppressedRef, triggerModeRef } = ctx;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (idleAutoCloseTimerRef.current) {
      clearTimeout(idleAutoCloseTimerRef.current);
      idleAutoCloseTimerRef.current = null;
    }
    startupAutoCloseSuppressedRef.current = false;
    isPointerInsideDrawerRef.current = true;
    setIsOpen(true);
    setIsPinned(true);
    isPinnedRef.current = true;
    setDrawerState('open');
    invoke('toggle_pin', { pinned: true }).catch(() => {});
    if (!isCanvasWorkbenchActiveRef.current) {
      invoke('open_drawer', {
        width: drawerWidthRef.current,
        height: drawerHeightRef.current,
        mode: triggerModeRef.current,
      }).catch(() => {});
    }
    window.requestAnimationFrame(() => {
      canvasSurfaceRef.current?.focus({ preventScroll: true });
    });

};

export const closeSelectedImagePreviewImpl = (ctx: Pick<windowSnipActionContext, 'isCanvasModeRef' | 'restoreCanvasAfterMediaPreview' | 'selectedImageReturnToCanvasRef' | 'setSelectedImage' | 'setSelectedImageGallery'>) => {
  const { isCanvasModeRef, restoreCanvasAfterMediaPreview, selectedImageReturnToCanvasRef, setSelectedImage, setSelectedImageGallery } = ctx;
    const shouldReturnToCanvas = selectedImageReturnToCanvasRef.current || isCanvasModeRef.current;
    selectedImageReturnToCanvasRef.current = false;
    setSelectedImage(null);
    setSelectedImageGallery(null);

    if (shouldReturnToCanvas && isCanvasModeRef.current) {
      restoreCanvasAfterMediaPreview();
    }

};

export const openSelectedVideoPreviewImpl = (ctx: Pick<windowSnipActionContext, 'selectedVideoReturnToCanvasRef' | 'setSelectedVideo'>, video: { url?: string | null; path?: string | null }, options: { fromCanvas?: boolean } = {}) => {
  const { selectedVideoReturnToCanvasRef, setSelectedVideo } = ctx;
    const source = String(video.url || video.path || '').trim();
    if (!source) return;
    selectedVideoReturnToCanvasRef.current = !!options.fromCanvas;
    setSelectedVideo({
      url: source,
      path: String(video.path || source),
      fromCanvas: !!options.fromCanvas,
    });

};

export const playSnipShutterSoundImpl = (ctx: Record<never, never>) => {
  const {  } = ctx;
    try {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) return;
      const audioStore = window as any;
      const ctx: AudioContext = audioStore.__drawerSnipAudioContext && audioStore.__drawerSnipAudioContext.state !== 'closed'
        ? audioStore.__drawerSnipAudioContext
        : new AudioContextCtor();
      audioStore.__drawerSnipAudioContext = ctx;

      const play = () => {
        const now = ctx.currentTime + 0.008;
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.0001, now);
        master.gain.exponentialRampToValueAtTime(0.42, now + 0.012);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        master.connect(ctx.destination);

        const click = ctx.createOscillator();
        click.type = 'square';
        click.frequency.setValueAtTime(1100, now);
        click.frequency.exponentialRampToValueAtTime(330, now + 0.075);
        click.connect(master);
        click.start(now);
        click.stop(now + 0.1);

        const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * 0.09));
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i += 1) {
          data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        const noise = ctx.createBufferSource();
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 1400;
        noise.buffer = buffer;
        noise.connect(filter);
        filter.connect(master);
        noise.start(now + 0.035);
        noise.stop(now + 0.15);

        window.setTimeout(() => {
          try { master.disconnect(); } catch (_) {}
        }, 260);
      };

      if (ctx.state === 'suspended') {
        ctx.resume().then(play).catch(() => {});
      } else {
        play();
      }
    } catch (_) {}

};

export const copyLocalImageToClipboardImpl = async (ctx: Pick<windowSnipActionContext, 'copyImageDataUrlToSystemClipboard' | 'imageSourceToDataUrl' | 'wait'>, path: string) => {
  const { copyImageDataUrlToSystemClipboard, imageSourceToDataUrl, wait } = ctx;
    const source = (path || '').trim();
    if (!source) throw new Error('empty screenshot path');

    const copyOnce = async () => {
      let backendError: unknown = null;
      let normalizedError: unknown = null;

      try {
        await invoke('copy_image', { dataUrl: source });
        return;
      } catch (err) {
        backendError = err;
        console.warn('backend copy_image failed:', err);
      }

      try {
        const dataUrl = await imageSourceToDataUrl(source, false);
        await copyImageDataUrlToSystemClipboard(dataUrl);
        return;
      } catch (err) {
        normalizedError = err;
        console.warn('normalized PNG clipboard image copy failed:', err);
      }

      throw normalizedError || backendError || new Error('copy image failed');
    };

    let lastError: unknown = null;
    for (let i = 0; i < 3; i += 1) {
      try {
        if (i > 0) await wait(120 + i * 120);
        await copyOnce();
        return;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('copy image failed');

};

export const applyWindowBoundsImpl = (ctx: Pick<windowSnipActionContext, 'applyWindowBounds' | 'boundsFrameRef' | 'boundsInvokeInFlightRef' | 'boundsSyncRequestedRef' | 'isSnipSessionActive' | 'pendingBoundsRef' | 'snipMode'>, width: number, height: number, anchor: 'left' | 'right' = 'right') => {
  const { applyWindowBounds, boundsFrameRef, boundsInvokeInFlightRef, boundsSyncRequestedRef, isSnipSessionActive, pendingBoundsRef, snipMode } = ctx;
    pendingBoundsRef.current = { width, height, anchor };
    if (boundsFrameRef.current !== null) return;

    boundsFrameRef.current = requestAnimationFrame(() => {
      boundsFrameRef.current = null;
      const next = pendingBoundsRef.current;
      if (!next || snipMode.active || isSnipSessionActive) return;
      pendingBoundsRef.current = null;

      if (boundsInvokeInFlightRef.current) {
        pendingBoundsRef.current = next;
        boundsSyncRequestedRef.current = true;
        return;
      }

      const mainWidth = next.width > MIN_DRAWER_WIDTH + EDGE_WIDTH ? next.width - EDGE_WIDTH : next.width;
      boundsInvokeInFlightRef.current = true;
      invoke(next.anchor === 'left' ? 'resize_drawer_from_right' : 'resize_drawer', {
        width: clamp(mainWidth, MIN_DRAWER_WIDTH, MAX_DRAWER_WIDTH),
        height: clamp(next.height, MIN_DRAWER_HEIGHT, MAX_DRAWER_HEIGHT),
      }).catch(() => {}).finally(() => {
        boundsInvokeInFlightRef.current = false;
        if (boundsSyncRequestedRef.current) {
          boundsSyncRequestedRef.current = false;
          const latest = pendingBoundsRef.current;
          if (latest) applyWindowBounds(latest.width, latest.height, latest.anchor);
        }
      });
    });

};

export const startSnipImpl = async (ctx: Pick<windowSnipActionContext, 'closeTimerRef' | 'drawerHeightRef' | 'drawerState' | 'drawerWidthRef' | 'enforceAntiTouchClosed' | 'idleAutoCloseTimerRef' | 'isCanvasMode' | 'isDraggingTitleRef' | 'isGlobalMouseDown' | 'isOpen' | 'isPinned' | 'isPinnedRef' | 'isResizingState' | 'setIsDraggingTitle' | 'setIsSnipSessionActive' | 'setSelection' | 'setSnipMode' | 'showToast' | 'snipCaptureInFlightRef' | 'snipModeActiveRef' | 'snipRestoreDrawerRef' | 'stateRef' | 'triggerModeRef'>) => {
  const { closeTimerRef, drawerHeightRef, drawerState, drawerWidthRef, enforceAntiTouchClosed, idleAutoCloseTimerRef, isCanvasMode, isDraggingTitleRef, isGlobalMouseDown, isOpen, isPinned, isPinnedRef, isResizingState, setIsDraggingTitle, setIsSnipSessionActive, setSelection, setSnipMode, showToast, snipCaptureInFlightRef, snipModeActiveRef, snipRestoreDrawerRef, stateRef, triggerModeRef } = ctx;
  let frozenBackgroundPath = '';
  try {
    if (stateRef.current.isAntiTouchMode) {
      enforceAntiTouchClosed(true);
      return;
    }
    if (snipModeActiveRef.current || snipCaptureInFlightRef.current) return;
    snipModeActiveRef.current = true;
    isGlobalMouseDown.current = false;
    isDraggingTitleRef.current = false;
    setIsDraggingTitle(false);
    isResizingState.current = false;
    setIsSnipSessionActive(true);
    const shouldRestoreVisibleDrawer = !!(
      (isOpen || isPinned || isCanvasMode) &&
      drawerState !== 'closed' &&
      drawerState !== 'closing'
    );
    const restoreSnapshot = {
      isOpen: shouldRestoreVisibleDrawer && !!isOpen,
      isPinned: shouldRestoreVisibleDrawer && !!(isPinned || isPinnedRef.current || isCanvasMode),
      isCanvasMode: shouldRestoreVisibleDrawer && !!isCanvasMode,
    };
    snipRestoreDrawerRef.current = restoreSnapshot;
    localStorage.setItem(
      SNIP_RESTORE_DRAWER_STORAGE_KEY,
      String(
        restoreSnapshot.isOpen ||
        restoreSnapshot.isPinned ||
        restoreSnapshot.isCanvasMode
      )
    );
    setSelection(null);
    setSnipMode({ active: false, bg: '' });

    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (idleAutoCloseTimerRef.current) {
      clearTimeout(idleAutoCloseTimerRef.current);
      idleAutoCloseTimerRef.current = null;
    }
    const restore = snipRestoreDrawerRef.current;

    // Freeze the desktop before the transparent selection window is shown. A persistent
    // transparent/topmost window can make hardware-decoded video disappear from later
    // desktop captures. The frozen frame stays stable however long selection takes.
    void restore;
    frozenBackgroundPath = await invoke<string>('capture_screen_to_file');
    await invoke('show_snip_window', { backgroundPath: frozenBackgroundPath });

    const prepareChrome = null;

    // 让 React 的透明遮罩先落到 DOM，再把 Tauri 主窗口切到全屏。
    void prepareChrome;
  } catch (err) {
    console.error('进入截图模式失败:', err);
    const restore = snipRestoreDrawerRef.current;
    const restoreDrawer = !!(restore?.isOpen || restore?.isPinned || restore?.isCanvasMode);
    await invoke('recover_after_snip', {
      restoreDrawer,
      width: drawerWidthRef.current,
      height: drawerHeightRef.current,
      mode: triggerModeRef.current,
      backgroundPath: frozenBackgroundPath || null,
    }).catch(async () => {
      await invoke('hide_snip_window').catch(() => {});
      await invoke('set_drawer_pass_through', { ignore: false }).catch(() => {});
      if (!restoreDrawer && !stateRef.current.isAntiTouchMode) {
        await invoke('show_edge', { height: drawerHeightRef.current, mode: triggerModeRef.current }).catch(() => {});
      }
    });
    await invoke('set_topmost', { topmost: true }).catch(() => {});
    snipModeActiveRef.current = false;
    setIsSnipSessionActive(false);
    snipRestoreDrawerRef.current = null;
    setSnipMode({ active: false, bg: '' });
    showToast('截图启动失败');
  }

};

export const exitSnipImpl = async (ctx: Pick<windowSnipActionContext, 'appWindow' | 'drawerHeightRef' | 'drawerWidthRef' | 'enforceAntiTouchClosed' | 'isMouseDown' | 'setDrawerState' | 'setIsOpen' | 'setIsPinned' | 'setSelection' | 'setSnipMode' | 'snipCaptureInFlightRef' | 'snipExitInFlightRef' | 'snipModeActiveRef' | 'stateRef' | 'triggerModeRef'>, reopen: boolean = false) => {
  const { appWindow, drawerHeightRef, drawerWidthRef, enforceAntiTouchClosed, isMouseDown, setDrawerState, setIsOpen, setIsPinned, setSelection, setSnipMode, snipCaptureInFlightRef, snipExitInFlightRef, snipModeActiveRef, stateRef, triggerModeRef } = ctx;
  snipExitInFlightRef.current = true;
  setSelection(null);
  isMouseDown.current = false;
  snipCaptureInFlightRef.current = false;

  // 保持 snipMode.active = true，让全屏截图层继续盖住内容。
  // 每一步都独立兜底，避免其中一个 IPC 失败后跳过恢复窗口/触发入口。
  await invoke('exit_snip_mode').catch((err) => {
    console.warn('exit_snip_mode failed:', err);
  });

  if (reopen) {
    if (stateRef.current.isAntiTouchMode) {
      flushSync(() => {
        setDrawerState('closed');
        setIsOpen(false);
        setIsPinned(false);
        setSnipMode({ active: false, bg: '' });
      });
      snipModeActiveRef.current = false;
      snipExitInFlightRef.current = false;
      enforceAntiTouchClosed(false);
      await invoke('set_topmost', { topmost: true }).catch(() => {});
      return;
    }

    await invoke('open_drawer', {
      width: drawerWidthRef.current,
      height: drawerHeightRef.current,
      mode: triggerModeRef.current,
    }).catch((err) => console.warn('open_drawer after snip failed:', err));

    flushSync(() => {
      setDrawerState('open');
      setIsOpen(true);
      setSnipMode({ active: false, bg: '' });
    });
    snipModeActiveRef.current = false;
    await appWindow.show().catch((err) => {
      console.warn('show main after snip failed:', err);
    });
    snipExitInFlightRef.current = false;
  } else {
    flushSync(() => {
      setDrawerState('closed');
      setIsOpen(false);
      setIsPinned(false);
      setSnipMode({ active: false, bg: '' });
    });
    snipModeActiveRef.current = false;

    await invoke('close_drawer', { mode: triggerModeRef.current }).catch(async (err) => {
      console.warn('close_drawer after snip failed:', err);
      await appWindow.hide().catch(() => {});
      await invoke('show_edge', { height: drawerHeightRef.current, mode: triggerModeRef.current }).catch((edgeErr) => {
        console.warn('show_edge after snip failed:', edgeErr);
      });
    });

    window.setTimeout(() => {
      snipExitInFlightRef.current = false;
    }, 180);
  }

  await invoke('set_topmost', { topmost: true }).catch(() => {});

};

export const revealDrawerAfterSnipCopyImpl = async (ctx: Pick<windowSnipActionContext, 'closeTimerRef' | 'drawerHeightRef' | 'drawerWidthRef' | 'enforceAntiTouchClosed' | 'isPointerInsideDrawerRef' | 'markShortcutReveal' | 'scheduleIdleAutoClose' | 'setActiveTab' | 'setDrawerState' | 'setIsOpen' | 'snipExitInFlightRef' | 'startupAutoCloseSuppressedRef' | 'stateRef' | 'triggerModeRef'>) => {
  const { closeTimerRef, drawerHeightRef, drawerWidthRef, enforceAntiTouchClosed, isPointerInsideDrawerRef, markShortcutReveal, scheduleIdleAutoClose, setActiveTab, setDrawerState, setIsOpen, snipExitInFlightRef, startupAutoCloseSuppressedRef, stateRef, triggerModeRef } = ctx;
    if (stateRef.current.isAntiTouchMode) {
      enforceAntiTouchClosed(false);
      return;
    }

    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    snipExitInFlightRef.current = false;
    markShortcutReveal();
    startupAutoCloseSuppressedRef.current = false;
    isPointerInsideDrawerRef.current = false;

    flushSync(() => {
      setActiveTab('image');
      setIsOpen(true);
      setDrawerState('pre_open');
    });
    await invoke('open_drawer', {
      width: drawerWidthRef.current,
      height: drawerHeightRef.current,
      mode: triggerModeRef.current,
    }).catch((err) => console.warn('open_drawer after snip copy failed:', err));
    setDrawerState('open');
    scheduleIdleAutoClose(3000);
    await invoke('set_topmost', { topmost: true }).catch(() => {});

};

export const getSnipPlaceholderUrlImpl = (ctx: Record<never, never>) => {
  const {  } = ctx;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
      <rect width="640" height="360" rx="24" fill="#f5f5f4"/>
      <rect x="264" y="142" width="112" height="76" rx="16" fill="#e7e5e4"/>
      <circle cx="302" cy="174" r="13" fill="#a8a29e"/>
      <path d="M280 208l45-43 35 31 18-17 46 29H280z" fill="#a8a29e"/>
      <text x="320" y="250" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#78716c">截图处理中...</text>
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

};

export const confirmSnipImpl = async (ctx: Pick<windowSnipActionContext, 'activeFolderId' | 'copyLocalImageToClipboard' | 'createAssetId' | 'createFloatingNote' | 'emitFloatingNoteUpdated' | 'exitSnip' | 'getSnipPlaceholderUrl' | 'playSnipShutterSound' | 'pushDrawerUndoSnapshot' | 'refreshNoteManager' | 'revealDrawerAfterSnipCopy' | 'screenshotAutoPinNoteRef' | 'selection' | 'setActiveTab' | 'setItems' | 'showToast' | 'snipCaptureInFlightRef'>, pointer?: { screenX: number; screenY: number; clientX: number; clientY: number }) => {
  const { activeFolderId, copyLocalImageToClipboard, createAssetId, createFloatingNote, emitFloatingNoteUpdated, exitSnip, getSnipPlaceholderUrl, playSnipShutterSound, pushDrawerUndoSnapshot, refreshNoteManager, revealDrawerAfterSnipCopy, screenshotAutoPinNoteRef, selection, setActiveTab, setItems, showToast, snipCaptureInFlightRef } = ctx;
    if (snipCaptureInFlightRef.current) return;
    const currentSelection = selection;
    if (!currentSelection || currentSelection.w < 10 || currentSelection.h < 10) return exitSnip();
    snipCaptureInFlightRef.current = true;
    playSnipShutterSound();
    const shouldAutoPinNote = screenshotAutoPinNoteRef.current;

    const createdAt = Date.now();
    const placeholderId = `snip_${createAssetId()}`;
    const placeholderItem: BufferItem = {
      id: placeholderId,
      type: 'image',
      content: '截图处理中...',
      name: `截图_${createdAt}.png`,
      url: getSnipPlaceholderUrl(),
      createdAt,
      folderId: activeFolderId !== 'all' ? activeFolderId : undefined,
    };

    const noteX = pointer
      ? pointer.screenX - (pointer.clientX - currentSelection.x)
      : currentSelection.x;
    const noteY = pointer
      ? pointer.screenY - (pointer.clientY - currentSelection.y)
      : currentSelection.y;
    let snipNoteTarget: { noteLabel: string; snapshot: FloatingNoteSnapshot } | null | undefined = null;
    let snipNotePromise: Promise<{ noteLabel: string; snapshot: FloatingNoteSnapshot } | null | undefined> | null = null;

    const openSnipNoteOnce = (item: BufferItem = placeholderItem) => {
      if (!shouldAutoPinNote) return Promise.resolve(null);
      if (!snipNotePromise) {
        snipNotePromise = createFloatingNote(item, {
          topmost: true,
          x: Math.round(noteX),
          y: Math.round(noteY),
          width: Math.round(currentSelection.w),
          height: Math.round(currentSelection.h),
          silent: true,
        }).then((target) => {
          snipNoteTarget = target;
          return target;
        });
      }
      return snipNotePromise;
    };

    const updateSnipNote = async (target: { noteLabel: string; snapshot: FloatingNoteSnapshot } | null | undefined, item: BufferItem) => {
      if (!target) return;
      const latestSnapshot = readFloatingNoteSnapshot(target.noteLabel) || target.snapshot;
      const next: FloatingNoteSnapshot = {
        ...latestSnapshot,
        name: item.name,
        content: item.content,
        ...getStableFloatingNoteImageFields(item),
        updatedAt: Date.now(),
      };
      snipNoteTarget = { ...target, snapshot: next };
      localStorage.setItem(floatingNoteStorageKey(target.noteLabel), JSON.stringify(next));
      await emitFloatingNoteUpdated(target.noteLabel, next).catch(() => {});
      refreshNoteManager();
    };

    // 先把占位卡片放进抽屉；截图窗口仍然盖着，所以不会被截进去。
    // Rust 捕获到像素后会发 snip-area-captured，前端立即恢复抽屉，
    // 后续 PNG 保存/IPC 返回完成后再把占位图替换成真实截图。
    pushDrawerUndoSnapshot('截图');
    setItems(prev => [placeholderItem, ...prev]);
    setActiveTab('image');

    let restorePromise: Promise<void> | null = null;
    let unlistenCaptured: (() => void) | undefined;
    let restoreTimer: number | null = null;
    let captureTimeout: number | null = null;

    const restoreDrawerOnce = () => {
      if (restorePromise) return restorePromise;
      if (restoreTimer !== null) {
        window.clearTimeout(restoreTimer);
        restoreTimer = null;
      }
      restorePromise = exitSnip(false).catch((err) => {
        console.warn('exit snip after capture failed:', err);
      });
      return restorePromise;
    };

    try {
      unlistenCaptured = await listen('snip-area-captured', () => {
        void openSnipNoteOnce();
        void restoreDrawerOnce();
      });

      restoreTimer = window.setTimeout(() => {
        void restoreDrawerOnce();
      }, 900);

      const capturePromise = invoke<string>('capture_screen_area_to_file', {
        x: Math.round(currentSelection.x),
        y: Math.round(currentSelection.y),
        width: Math.round(currentSelection.w),
        height: Math.round(currentSelection.h),
      });
      const timeoutPromise = new Promise<never>((_, reject) => {
        captureTimeout = window.setTimeout(() => reject(new Error('截图保存超时')), 10_000);
      });
      const savedPath = await Promise.race([capturePromise, timeoutPromise]);
      if (captureTimeout !== null) {
        window.clearTimeout(captureTimeout);
        captureTimeout = null;
      }

      if (unlistenCaptured) {
        unlistenCaptured();
        unlistenCaptured = undefined;
      }

      void copyLocalImageToClipboard(savedPath).catch((err) => {
        console.warn('early screenshot clipboard copy failed:', err);
      });

      await restoreDrawerOnce();

      const assetUrl = convertFileSrc(savedPath);
      const finalItem = {
        ...placeholderItem,
        content: '截图内容',
        name: `截图_${createdAt}.png`,
        url: assetUrl,
        path: savedPath,
      } as BufferItem;
      const clipboardResultPromise = copyLocalImageToClipboard(savedPath)
        .then(() => ({ copied: true, error: null as unknown }))
        .catch((err) => {
          console.warn('截图复制到剪贴板失败:', err);
          return { copied: false, error: err as unknown };
        });

      setItems(prev => prev.map(item => item.id === placeholderId ? {
        ...item,
        ...finalItem,
      } : item));
      const target = snipNoteTarget || (snipNotePromise ? await snipNotePromise : await openSnipNoteOnce(finalItem));
      await updateSnipNote(target, finalItem);
      await revealDrawerAfterSnipCopy();

      const clipboardResult = await clipboardResultPromise;
      if (clipboardResult.copied) {
        showToast(shouldAutoPinNote ? '截图成功，已复制并置顶为便签' : '截图成功，已复制并保存到抽屉');
      } else {
        console.warn('截图复制失败详情:', clipboardResult.error);
        showToast(shouldAutoPinNote ? '截图成功，已置顶为便签，自动复制失败' : '截图成功，已保存到抽屉，自动复制失败');
      }
    } catch (err) {
      if (captureTimeout !== null) window.clearTimeout(captureTimeout);
      if (restoreTimer !== null) window.clearTimeout(restoreTimer);
      if (unlistenCaptured) unlistenCaptured();
      let target = snipNoteTarget;
      if (!target && snipNotePromise) {
        try {
          target = await snipNotePromise;
        } catch (_) {
          target = null;
        }
      }
      const targetLabel = (target as any)?.noteLabel as string | undefined;
      if (targetLabel) {
        deleteFloatingNoteSnapshot(targetLabel);
        forgetOpenFloatingNoteLabel(targetLabel);
        await invoke('hide_note_window', { label: targetLabel }).catch(() => {});
        refreshNoteManager();
      }
      console.error('截图选区捕获失败:', err);
      setItems(prev => prev.filter(item => item.id !== placeholderId));
      showToast('截图失败');
      await exitSnip(false);
    } finally {
      snipCaptureInFlightRef.current = false;
    }

};

export const finishSnipWindowSessionImpl = async (ctx: Pick<windowSnipActionContext, 'drawerHeightRef' | 'drawerWidthRef' | 'enforceAntiTouchClosed' | 'isDraggingTitleRef' | 'isGlobalMouseDown' | 'isResizingState' | 'setDrawerState' | 'setIsDraggingTitle' | 'setIsOpen' | 'setIsPinned' | 'setIsSnipSessionActive' | 'setSelection' | 'setSnipMode' | 'snipExitInFlightRef' | 'snipModeActiveRef' | 'snipRestoreDrawerRef' | 'stateRef' | 'triggerModeRef'>, _restoreTrigger: boolean = false) => {
  const { drawerHeightRef, drawerWidthRef, enforceAntiTouchClosed, isDraggingTitleRef, isGlobalMouseDown, isResizingState, setDrawerState, setIsDraggingTitle, setIsOpen, setIsPinned, setIsSnipSessionActive, setSelection, setSnipMode, snipExitInFlightRef, snipModeActiveRef, snipRestoreDrawerRef, stateRef, triggerModeRef } = ctx;
    const restore = snipRestoreDrawerRef.current;
    await invoke('hide_snip_window').catch(() => {});
    await invoke('set_drawer_pass_through', { ignore: false }).catch(() => {});
    isGlobalMouseDown.current = false;
    isDraggingTitleRef.current = false;
    isResizingState.current = false;
    setIsDraggingTitle(false);
    document.body.style.cursor = '';
    snipModeActiveRef.current = false;
    setIsSnipSessionActive(false);
    snipExitInFlightRef.current = false;
    snipRestoreDrawerRef.current = null;
    setSelection(null);
    setSnipMode({ active: false, bg: '' });
    const shouldRestoreDrawer = !!(restore?.isOpen || restore?.isPinned || restore?.isCanvasMode);
    if (shouldRestoreDrawer && !stateRef.current.isAntiTouchMode) {
      flushSync(() => {
        setIsOpen(true);
        setIsPinned(!!(restore?.isPinned || restore?.isCanvasMode));
        setDrawerState('pre_open');
      });
      await invoke('open_drawer', {
        width: drawerWidthRef.current,
        height: drawerHeightRef.current,
        mode: triggerModeRef.current,
      }).then(() => {
        setDrawerState('open');
      }).catch(async (err) => {
        console.warn('restore drawer after snip window failed:', err);
        await invoke('show_edge', { height: drawerHeightRef.current, mode: triggerModeRef.current }).catch(() => {});
      });
    } else {
      flushSync(() => {
        setIsOpen(false);
        setIsPinned(false);
        setDrawerState('closed');
      });
      if (stateRef.current.isAntiTouchMode) {
        enforceAntiTouchClosed(false);
      } else {
        await invoke('show_edge', { height: drawerHeightRef.current, mode: triggerModeRef.current }).catch(() => {});
      }
    }
    await invoke('set_topmost', { topmost: true }).catch(() => {});

};

export const resetSnipSessionStateImpl = (ctx: Pick<windowSnipActionContext, 'isDraggingTitleRef' | 'isGlobalMouseDown' | 'isResizingState' | 'setIsDraggingTitle' | 'setIsSnipSessionActive' | 'setSelection' | 'setSnipMode' | 'snipCaptureInFlightRef' | 'snipExitInFlightRef' | 'snipModeActiveRef' | 'snipRestoreDrawerRef'>) => {
  const { isDraggingTitleRef, isGlobalMouseDown, isResizingState, setIsDraggingTitle, setIsSnipSessionActive, setSelection, setSnipMode, snipCaptureInFlightRef, snipExitInFlightRef, snipModeActiveRef, snipRestoreDrawerRef } = ctx;
    snipModeActiveRef.current = false;
    snipCaptureInFlightRef.current = false;
    snipExitInFlightRef.current = false;
    snipRestoreDrawerRef.current = null;
    isGlobalMouseDown.current = false;
    isDraggingTitleRef.current = false;
    isResizingState.current = false;
    setIsSnipSessionActive(false);
    setIsDraggingTitle(false);
    setSelection(null);
    setSnipMode({ active: false, bg: '' });
    document.body.style.cursor = '';

};

export const handleSnipWindowCapturedImpl = async (ctx: Pick<windowSnipActionContext, 'activeFolderIdRef' | 'addCanvasImageItems' | 'copyLocalImageToClipboard' | 'createAssetId' | 'createCanvasImageItemFromPath' | 'createFloatingNote' | 'enqueueAutoAiTaggingForItems' | 'finishSnipWindowSession' | 'handledSnipPathsRef' | 'isCanvasModeRef' | 'isDraggingTitleRef' | 'isGlobalMouseDown' | 'isResizingState' | 'playSnipShutterSound' | 'pushDrawerUndoSnapshot' | 'resetSnipSessionState' | 'screenshotAutoPinNoteRef' | 'setActiveTab' | 'setIsDraggingTitle' | 'setIsSnipSessionActive' | 'setItems' | 'showToast' | 'snipCaptureInFlightRef' | 'snipExitInFlightRef' | 'snipModeActiveRef'>, payload: any) => {
  const { activeFolderIdRef, addCanvasImageItems, copyLocalImageToClipboard, createAssetId, createCanvasImageItemFromPath, createFloatingNote, enqueueAutoAiTaggingForItems, finishSnipWindowSession, handledSnipPathsRef, isCanvasModeRef, isDraggingTitleRef, isGlobalMouseDown, isResizingState, playSnipShutterSound, pushDrawerUndoSnapshot, resetSnipSessionState, screenshotAutoPinNoteRef, setActiveTab, setIsDraggingTitle, setIsSnipSessionActive, setItems, showToast, snipCaptureInFlightRef, snipExitInFlightRef, snipModeActiveRef } = ctx;
    const savedPath = typeof payload?.path === 'string' ? payload.path : '';
    if (!savedPath) {
      showToast('截图失败');
      await finishSnipWindowSession(true);
      return;
    }
    const snipLockKey = `${SNIP_CAPTURE_LOCK_STORAGE_KEY}_${localLockKeyPart(savedPath)}`;
    const snipLockOwner = acquireTimedLocalLock(snipLockKey, 10_000);
    if (!snipLockOwner) return;

    const now = Date.now();
    handledSnipPathsRef.current.forEach((timestamp, path) => {
      if (now - timestamp > 30_000) handledSnipPathsRef.current.delete(path);
    });
    if (handledSnipPathsRef.current.has(savedPath) || snipCaptureInFlightRef.current) return;
    handledSnipPathsRef.current.set(savedPath, now);
    snipCaptureInFlightRef.current = true;
    try {
    playSnipShutterSound();
    resetSnipSessionState();
    snipCaptureInFlightRef.current = true;

    const createdAt = Date.now();
    const width = Number(payload?.width) || 320;
    const height = Number(payload?.height) || 220;
    const finalItem = {
      id: `snip_${createAssetId()}`,
      type: 'image',
      content: '截图内容',
      name: `截图_${createdAt}.png`,
      url: convertFileSrc(savedPath),
      path: savedPath,
      createdAt,
      folderId: activeFolderIdRef.current !== 'all' ? activeFolderIdRef.current : undefined,
    } as BufferItem;

    const copyScreenshotToClipboard = () => copyLocalImageToClipboard(savedPath)
      .then(() => ({ copied: true, error: null as unknown }))
      .catch((err) => {
        console.warn('截图复制到剪贴板失败:', err);
        return { copied: false, error: err as unknown };
      });
    const capturedInCanvasMode = isCanvasModeRef.current;
    const clipboardPromise = copyScreenshotToClipboard();

    setActiveTab('image');
    pushDrawerUndoSnapshot('截图');
    setItems(prev => [finalItem, ...prev]);
    enqueueAutoAiTaggingForItems([finalItem]);
    const shouldAutoPinNote = screenshotAutoPinNoteRef.current;
    if (capturedInCanvasMode) {
      const canvasItem = await createCanvasImageItemFromPath(savedPath, 0);
      if (canvasItem) addCanvasImageItems([canvasItem]);
    } else if (shouldAutoPinNote) {
      await createFloatingNote(finalItem, {
        topmost: true,
        x: Math.round(Number(payload?.noteX) || Number(payload?.x) || 0),
        y: Math.round(Number(payload?.noteY) || Number(payload?.y) || 0),
        width: Math.round(width),
        height: Math.round(height),
        silent: true,
      });
    }

    const clipboardResult = await clipboardPromise;
    if (clipboardResult.copied) {
      showToast(capturedInCanvasMode
        ? '截图成功，已复制并加入画布'
        : shouldAutoPinNote
          ? '截图成功，已复制并置顶为便签'
          : '截图成功，已复制并保存到抽屉');
    } else {
      console.warn('截图复制失败详情:', clipboardResult.error);
      showToast(capturedInCanvasMode
        ? '截图成功，已加入画布，自动复制失败'
        : shouldAutoPinNote
          ? '截图成功，已置顶为便签，自动复制失败'
          : '截图成功，已保存到抽屉，自动复制失败');
    }
    } catch (err) {
      console.error('snip window capture handling failed:', err);
      showToast('截图失败');
      await finishSnipWindowSession(true);
    } finally {
      snipCaptureInFlightRef.current = false;
      snipModeActiveRef.current = false;
      snipExitInFlightRef.current = false;
      isGlobalMouseDown.current = false;
      isDraggingTitleRef.current = false;
      isResizingState.current = false;
      setIsSnipSessionActive(false);
      setIsDraggingTitle(false);
      document.body.style.cursor = '';
    }

};

export const recoverSnipWindowFromMainImpl = async (ctx: Pick<windowSnipActionContext, 'drawerHeightRef' | 'drawerWidthRef' | 'triggerModeRef'>, restoreDrawer: boolean) => {
  const { drawerHeightRef, drawerWidthRef, triggerModeRef } = ctx;
    await invoke('recover_after_snip', {
      restoreDrawer,
      width: drawerWidthRef.current,
      height: drawerHeightRef.current,
      mode: triggerModeRef.current,
    }).catch(async (err) => {
      console.warn('recover after snip selection failed:', err);
      await invoke('hide_snip_window').catch(() => {});
      await invoke('set_drawer_pass_through', { ignore: false }).catch(() => {});
      await invoke('set_topmost', { topmost: true }).catch(() => {});
    });

};

export const handleSnipSelectionImpl = async (ctx: Pick<windowSnipActionContext, 'copyLocalImageToClipboard' | 'handleSnipWindowCaptured' | 'recoverSnipWindowFromMain' | 'resetSnipSessionState' | 'showToast' | 'snipCaptureInFlightRef' | 'snipRestoreDrawerRef'>, payload: any) => {
  const { copyLocalImageToClipboard, handleSnipWindowCaptured, recoverSnipWindowFromMain, resetSnipSessionState, showToast, snipCaptureInFlightRef, snipRestoreDrawerRef } = ctx;
    if (snipCaptureInFlightRef.current) return;
    snipCaptureInFlightRef.current = true;
    const restore = snipRestoreDrawerRef.current;
    const restoreDrawer = !!(restore?.isOpen || restore?.isPinned || restore?.isCanvasMode);

    try {
      const savedPath = await invoke<string>('capture_snip_window_selection_to_file', {
        x: Number(payload?.x) || 0,
        y: Number(payload?.y) || 0,
        width: Number(payload?.width) || 1,
        height: Number(payload?.height) || 1,
        viewportWidth: Number(payload?.viewportWidth) || 1,
        viewportHeight: Number(payload?.viewportHeight) || 1,
      });
      const clipboardResultPromise = copyLocalImageToClipboard(savedPath)
        .then(() => ({ copied: true, error: null as unknown }))
        .catch((err) => {
          console.warn('截图复制到剪贴板失败:', err);
          return { copied: false, error: err as unknown };
        });
      await recoverSnipWindowFromMain(restoreDrawer);
      snipCaptureInFlightRef.current = false;
      await handleSnipWindowCaptured({ ...payload, path: savedPath, clipboardResultPromise });
    } catch (err) {
      console.error('snip selection capture failed:', err);
      await recoverSnipWindowFromMain(restoreDrawer);
      resetSnipSessionState();
      showToast('截图失败');
    } finally {
      snipCaptureInFlightRef.current = false;
    }

};

export const handleTogglePinImpl = (ctx: Pick<windowSnipActionContext, 'isPinned' | 'isPinnedRef' | 'isPointerInsideDrawerRef' | 'setDrawerState' | 'setIsOpen' | 'setIsPinned'>) => {
  const { isPinned, isPinnedRef, isPointerInsideDrawerRef, setDrawerState, setIsOpen, setIsPinned } = ctx;
    if (isPinned) {
      // 收回：取消钉住，并让抽屉按当前动画缩回；关闭完成后 edge 会自动回到最右侧。
      setIsPinned(false);
      isPinnedRef.current = false;
      isPointerInsideDrawerRef.current = false;
      setIsOpen(false);
      invoke('set_topmost', { topmost: true }).catch(() => {});
    } else {
      setIsPinned(true);
      isPinnedRef.current = true;
      setIsOpen(true);
      setDrawerState('open');
      invoke('toggle_pin', { pinned: true }).catch(()=>{});
    }

};

export const finishResizeImpl = (ctx: Pick<windowSnipActionContext, 'applyWindowBounds' | 'closeTimerRef' | 'drawerHeightRef' | 'drawerResizeAnchorRef' | 'drawerWidthRef' | 'isGlobalMouseDown' | 'isPointerInsideDrawerRef' | 'isResizingState' | 'setDrawerHeight' | 'setDrawerWidth' | 'setIsOpen' | 'shouldBlockAutoClose'>, anchor: 'left' | 'right' = 'right') => {
  const { applyWindowBounds, closeTimerRef, drawerHeightRef, drawerResizeAnchorRef, drawerWidthRef, isGlobalMouseDown, isPointerInsideDrawerRef, isResizingState, setDrawerHeight, setDrawerWidth, setIsOpen, shouldBlockAutoClose } = ctx;
    const nextWidth = clamp(drawerWidthRef.current, MIN_DRAWER_WIDTH, MAX_DRAWER_WIDTH);
    const nextHeight = clamp(drawerHeightRef.current, MIN_DRAWER_HEIGHT, MAX_DRAWER_HEIGHT);
    drawerWidthRef.current = nextWidth;
    drawerHeightRef.current = nextHeight;
    drawerResizeAnchorRef.current = anchor;

    isResizingState.current = false;
    isGlobalMouseDown.current = false;
    setDrawerWidth(nextWidth);
    setDrawerHeight(nextHeight);
    applyWindowBounds(nextWidth + EDGE_WIDTH, nextHeight, anchor);
    invoke('set_topmost', { topmost: true }).catch(() => {});

    if (!isPointerInsideDrawerRef.current && !shouldBlockAutoClose()) {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(() => setIsOpen(false), 180);
    }

};

export const startResizingWidthImpl = (ctx: Pick<windowSnipActionContext, 'applyWindowBounds' | 'drawerHeightRef' | 'drawerWidthRef' | 'finishResize' | 'isGlobalMouseDown' | 'isResizingState' | 'setDrawerState' | 'setIsOpen'>, e: React.PointerEvent) => {
  const { applyWindowBounds, drawerHeightRef, drawerWidthRef, finishResize, isGlobalMouseDown, isResizingState, setDrawerState, setIsOpen } = ctx;
    e.preventDefault();
    e.stopPropagation();
    isResizingState.current = true;
    isGlobalMouseDown.current = true;
    setIsOpen(true);
    setDrawerState('open');

    const startX = e.screenX;
    const startWidth = drawerWidthRef.current;
    const startHeight = drawerHeightRef.current;

    const onMove = (me: PointerEvent) => {
      const nextWidth = clamp(startWidth - (me.screenX - startX), MIN_DRAWER_WIDTH, MAX_DRAWER_WIDTH);
      drawerWidthRef.current = nextWidth;
      applyWindowBounds(nextWidth + EDGE_WIDTH, startHeight);
    };

    const cleanup = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', cleanup);
      document.removeEventListener('pointercancel', cleanup);
      finishResize();
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', cleanup);
    document.addEventListener('pointercancel', cleanup);

};

export const startResizingHeightImpl = (ctx: Pick<windowSnipActionContext, 'applyWindowBounds' | 'drawerHeightRef' | 'drawerWidthRef' | 'finishResize' | 'isGlobalMouseDown' | 'isResizingState' | 'setDrawerState' | 'setIsOpen'>, e: React.PointerEvent) => {
  const { applyWindowBounds, drawerHeightRef, drawerWidthRef, finishResize, isGlobalMouseDown, isResizingState, setDrawerState, setIsOpen } = ctx;
    e.preventDefault();
    e.stopPropagation();
    isResizingState.current = true;
    isGlobalMouseDown.current = true;
    setIsOpen(true);
    setDrawerState('open');

    const startY = e.screenY;
    const startHeight = drawerHeightRef.current;
    const startWidth = drawerWidthRef.current;

    const onMove = (me: PointerEvent) => {
      const nextHeight = clamp(startHeight + (me.screenY - startY), MIN_DRAWER_HEIGHT, MAX_DRAWER_HEIGHT);
      drawerHeightRef.current = nextHeight;
      applyWindowBounds(startWidth + EDGE_WIDTH, nextHeight);
    };

    const cleanup = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', cleanup);
      document.removeEventListener('pointercancel', cleanup);
      finishResize();
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', cleanup);
    document.addEventListener('pointercancel', cleanup);

};

export const startResizingCornerImpl = (ctx: Pick<windowSnipActionContext, 'applyWindowBounds' | 'drawerHeightRef' | 'drawerWidthRef' | 'finishResize' | 'isGlobalMouseDown' | 'isResizingState' | 'setDrawerState' | 'setIsOpen'>, e: React.PointerEvent) => {
  const { applyWindowBounds, drawerHeightRef, drawerWidthRef, finishResize, isGlobalMouseDown, isResizingState, setDrawerState, setIsOpen } = ctx;
    e.preventDefault();
    e.stopPropagation();
    isResizingState.current = true;
    isGlobalMouseDown.current = true;
    setIsOpen(true);
    setDrawerState('open');

    const startX = e.screenX;
    const startY = e.screenY;
    const startWidth = drawerWidthRef.current;
    const startHeight = drawerHeightRef.current;

    const onMove = (me: PointerEvent) => {
      const nextWidth = clamp(startWidth - (me.screenX - startX), MIN_DRAWER_WIDTH, MAX_DRAWER_WIDTH);
      const nextHeight = clamp(startHeight + (me.screenY - startY), MIN_DRAWER_HEIGHT, MAX_DRAWER_HEIGHT);
      drawerWidthRef.current = nextWidth;
      drawerHeightRef.current = nextHeight;
      applyWindowBounds(nextWidth + EDGE_WIDTH, nextHeight);
    };

    const cleanup = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', cleanup);
      document.removeEventListener('pointercancel', cleanup);
      finishResize();
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', cleanup);
    document.addEventListener('pointercancel', cleanup);

};

export const startResizingRightCornerImpl = (ctx: Pick<windowSnipActionContext, 'applyWindowBounds' | 'drawerHeightRef' | 'drawerWidthRef' | 'finishResize' | 'isGlobalMouseDown' | 'isResizingState' | 'setDrawerState' | 'setIsOpen'>, e: React.PointerEvent) => {
  const { applyWindowBounds, drawerHeightRef, drawerWidthRef, finishResize, isGlobalMouseDown, isResizingState, setDrawerState, setIsOpen } = ctx;
    e.preventDefault();
    e.stopPropagation();
    isResizingState.current = true;
    isGlobalMouseDown.current = true;
    setIsOpen(true);
    setDrawerState('open');

    const startX = e.screenX;
    const startY = e.screenY;
    const startWidth = drawerWidthRef.current;
    const startHeight = drawerHeightRef.current;

    const onMove = (me: PointerEvent) => {
      const nextWidth = clamp(startWidth + (me.screenX - startX), MIN_DRAWER_WIDTH, MAX_DRAWER_WIDTH);
      const nextHeight = clamp(startHeight + (me.screenY - startY), MIN_DRAWER_HEIGHT, MAX_DRAWER_HEIGHT);
      drawerWidthRef.current = nextWidth;
      drawerHeightRef.current = nextHeight;
      applyWindowBounds(nextWidth + EDGE_WIDTH, nextHeight, 'left');
    };

    const cleanup = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', cleanup);
      document.removeEventListener('pointercancel', cleanup);
      finishResize('left');
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', cleanup);
    document.addEventListener('pointercancel', cleanup);

};

export const handleRecordShortcutImpl = (ctx: Record<never, never>, e: React.KeyboardEvent, setter: Function, submitterName: string) => {
  const {  } = ctx;
    e.preventDefault(); e.stopPropagation();
    const key = e.key; if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return;
    const keys: string[] = [];
    if (e.ctrlKey) keys.push('Ctrl'); if (e.altKey) keys.push('Alt'); if (e.shiftKey) keys.push('Shift');
    if (e.metaKey) keys.push('Command');
    let k = key.toUpperCase(); if (k === ' ') k = 'Space'; else if (k === 'ESCAPE') k = 'Esc'; else if (k.startsWith('ARROW')) k = k.replace('ARROW', '');
    keys.push(k); const newShortcut = keys.join('+'); setter(newShortcut);
    if (submitterName === 'update-trigger-shortcut') localStorage.setItem('drawer_trigger_shortcut', newShortcut);
    invoke('update_shortcut', { name: submitterName.replace(/-/g, '_'), shortcut: newShortcut }).catch(()=>{});

};

export const createTextOrUrlItemImpl = (ctx: Pick<windowSnipActionContext, 'activeFolderId' | 'createAssetId'>, rawText: string, defaultName: string = '文本片段'): BufferItem => {
  const { activeFolderId, createAssetId } = ctx;
    const text = rawText.trim();
    const base = {
      id: createAssetId(),
      type: 'text' as const,
      content: text,
      createdAt: Date.now(),
      folderId: activeFolderId !== 'all' ? activeFolderId : undefined,
    };

    if (isProbablyUrl(text)) {
      return {
        ...base,
        name: '网址链接',
        url: text,
        path: text,
        isUrl: true,
      } as BufferItem & { isUrl?: boolean };
    }

    return { ...base, name: defaultName };

};

export const finishLaunchIntroImpl = (ctx: Pick<windowSnipActionContext, 'CLOUDFLARED_DISCLAIMER_ACCEPTED_STORAGE_KEY' | 'acceptCloudflaredDisclaimer' | 'declineCloudflaredDisclaimer' | 'isPinnedRef' | 'isPointerInsideDrawerRef' | 'isSplashVisibleRef' | 'setDrawerState' | 'setIsOpen' | 'setIsPinned' | 'setIsSplashVisible' | 'setShowLaunchIntro' | 'showLaunchIntroRef' | 'startupAutoCloseSuppressedRef' | 'startupAutoCloseTimerRef'>, manualOrEvent?: boolean | React.MouseEvent, acceptDisclaimer: boolean = true) => {
  const { CLOUDFLARED_DISCLAIMER_ACCEPTED_STORAGE_KEY, acceptCloudflaredDisclaimer, declineCloudflaredDisclaimer, isPinnedRef, isPointerInsideDrawerRef, isSplashVisibleRef, setDrawerState, setIsOpen, setIsPinned, setIsSplashVisible, setShowLaunchIntro, showLaunchIntroRef, startupAutoCloseSuppressedRef, startupAutoCloseTimerRef } = ctx;
    const manual = manualOrEvent === true || (typeof manualOrEvent === 'object' && !!manualOrEvent);
    if (acceptDisclaimer) acceptCloudflaredDisclaimer();
    // Closing the recurring welcome screen must not revoke consent granted previously.
    // Without this guard, users who clicked the X merely to skip the intro lost access to
    // local reference-image generation on every later launch.
    else if (localStorage.getItem(CLOUDFLARED_DISCLAIMER_ACCEPTED_STORAGE_KEY) !== 'true') {
      declineCloudflaredDisclaimer();
    }

    markLaunchIntroDoneThisPage();
    startupAutoCloseSuppressedRef.current = true;
    if (startupAutoCloseTimerRef.current) {
      clearTimeout(startupAutoCloseTimerRef.current);
      startupAutoCloseTimerRef.current = null;
    }

    showLaunchIntroRef.current = false;
    isSplashVisibleRef.current = false;

    // 启动临时钉住到这里结束，同时解除后端启动锁。
    invoke('set_startup_close_lock', { ms: 0 }).catch(() => {});
    setIsPinned(false);
    isPinnedRef.current = false;
    invoke('toggle_pin', { pinned: false }).catch(() => {});

    flushSync(() => {
      setShowLaunchIntro(false);
      setIsSplashVisible(false);
      setIsPinned(false);
      setIsOpen(true);
      setDrawerState('open');
    });

    invoke('set_topmost', { topmost: true }).catch(() => {});

    if (manual) {
      isPointerInsideDrawerRef.current = true;
    }

};

export const blurCanvasActiveTextEntryImpl = (ctx: Pick<windowSnipActionContext, 'isCanvasModeRef'>, nextTarget?: EventTarget | null) => {
  const { isCanvasModeRef } = ctx;
    if (!isCanvasModeRef.current) return false;
    const element = document.activeElement as HTMLElement | null;
    if (!element || element === document.body) return false;
    const tag = element.tagName;
    const isEditable = tag === 'INPUT'
      || tag === 'TEXTAREA'
      || tag === 'SELECT'
      || element.isContentEditable
      || !!element.closest('[data-canvas-edit-control="true"]');
    if (!isEditable || typeof element.blur !== 'function') return false;
    const nextNode = nextTarget instanceof Node ? nextTarget : null;
    if (nextNode && (element === nextNode || element.contains(nextNode))) return false;
    element.blur();
    return true;

};

export const runCanvasAiNodeFromControlImpl = (ctx: Pick<windowSnipActionContext, 'canvasItemsRef' | 'generateCanvasAiGeneratorNode' | 'generateCanvasWorkflowModuleNode'>, targetId: string) => {
  const { canvasItemsRef, generateCanvasAiGeneratorNode, generateCanvasWorkflowModuleNode } = ctx;
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!target || target.ai?.status === 'working') return;
    if (target.ai?.type === 'workflow') {
      void generateCanvasWorkflowModuleNode(targetId);
      return;
    }
    if (isCanvasAiGeneratorType(target.ai?.type)) {
      void generateCanvasAiGeneratorNode(targetId);
    }

};

export const handleCanvasAiRunPointerDownImpl = (ctx: Pick<windowSnipActionContext, 'canvasRunButtonPointerRef' | 'runCanvasAiNodeFromControl'>, event: React.PointerEvent<HTMLButtonElement>, targetId: string) => {
  const { canvasRunButtonPointerRef, runCanvasAiNodeFromControl } = ctx;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.disabled) return;
    canvasRunButtonPointerRef.current = {
      targetId,
      at: window.performance.now(),
    };
    runCanvasAiNodeFromControl(targetId);

};

export const handleCanvasAiRunClickImpl = (ctx: Pick<windowSnipActionContext, 'canvasRunButtonPointerRef' | 'runCanvasAiNodeFromControl'>, event: React.MouseEvent<HTMLButtonElement>, targetId: string) => {
  const { canvasRunButtonPointerRef, runCanvasAiNodeFromControl } = ctx;
    event.preventDefault();
    event.stopPropagation();
    const pointerRun = canvasRunButtonPointerRef.current;
    if (pointerRun?.targetId === targetId && window.performance.now() - pointerRun.at < 5000) {
      canvasRunButtonPointerRef.current = null;
      return;
    }
    canvasRunButtonPointerRef.current = null;
    if (event.currentTarget.disabled) return;
    runCanvasAiNodeFromControl(targetId);

};

export const isCursorInsideDrawerWindowImpl = async (ctx: Pick<windowSnipActionContext, 'appWindow' | 'isPointerInsideDrawerRef'>) => {
  const { appWindow, isPointerInsideDrawerRef } = ctx;
    try {
      const [cursor, position, size] = await Promise.all([
        cursorPosition(),
        appWindow.outerPosition(),
        appWindow.outerSize(),
      ]);
      return (
        cursor.x >= position.x &&
        cursor.y >= position.y &&
        cursor.x <= position.x + size.width &&
        cursor.y <= position.y + size.height
      );
    } catch (_) {
      return isPointerInsideDrawerRef.current;
    }

};

export const requestAutoCloseDrawerImpl = (ctx: Pick<windowSnipActionContext, 'clearIdleAutoClose' | 'closeTimerRef' | 'isPinnedRef' | 'isPointerInsideDrawerRef' | 'lastSelectedDrawerItemIdRef' | 'setIsOpen' | 'setIsPinned' | 'setIsSelectMode' | 'setSelectedIds' | 'shouldBlockAutoClose'>) => {
  const { clearIdleAutoClose, closeTimerRef, isPinnedRef, isPointerInsideDrawerRef, lastSelectedDrawerItemIdRef, setIsOpen, setIsPinned, setIsSelectMode, setSelectedIds, shouldBlockAutoClose } = ctx;
    if (shouldBlockAutoClose()) return;
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

};

export const holdDrawerForPanelInteractionImpl = (ctx: Pick<windowSnipActionContext, 'clearIdleAutoClose' | 'closeTimerRef' | 'drawerPanelInteractionHoldUntilRef' | 'lastDrawerPointerDownAtRef'>, duration: number = 1400) => {
  const { clearIdleAutoClose, closeTimerRef, drawerPanelInteractionHoldUntilRef, lastDrawerPointerDownAtRef } = ctx;
    drawerPanelInteractionHoldUntilRef.current = Math.max(
      drawerPanelInteractionHoldUntilRef.current,
      Date.now() + duration
    );
    lastDrawerPointerDownAtRef.current = Date.now();
    clearIdleAutoClose();
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

};

export const scheduleIdleAutoCloseImpl = (ctx: Pick<windowSnipActionContext, 'clearIdleAutoClose' | 'drawerState' | 'idleAutoCloseTimerRef' | 'isDrawerActive' | 'isPointerInsideDrawerRef' | 'requestAutoCloseDrawer' | 'shouldBlockIdleAutoClose'>, delay: number = 3000) => {
  const { clearIdleAutoClose, drawerState, idleAutoCloseTimerRef, isDrawerActive, isPointerInsideDrawerRef, requestAutoCloseDrawer, shouldBlockIdleAutoClose } = ctx;
    clearIdleAutoClose();
    if (!isDrawerActive || drawerState !== 'open' || isPointerInsideDrawerRef.current || shouldBlockIdleAutoClose()) return;
    idleAutoCloseTimerRef.current = setTimeout(() => {
      idleAutoCloseTimerRef.current = null;
      if (!isPointerInsideDrawerRef.current && !shouldBlockIdleAutoClose()) {
        requestAutoCloseDrawer();
      }
    }, delay);

};

export const scheduleAutoCloseImpl = (ctx: Pick<windowSnipActionContext, 'clearIdleAutoClose' | 'closeTimerRef' | 'isCursorInsideDrawerWindow' | 'isPointerInsideDrawerRef' | 'requestAutoCloseDrawer'>, delay: number = 180) => {
  const { clearIdleAutoClose, closeTimerRef, isCursorInsideDrawerWindow, isPointerInsideDrawerRef, requestAutoCloseDrawer } = ctx;
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    clearIdleAutoClose();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      void (async () => {
        const isCursorInside = await isCursorInsideDrawerWindow();
        isPointerInsideDrawerRef.current = isCursorInside;
        if (!isCursorInside) requestAutoCloseDrawer();
      })();
    }, delay);

};

export const startSelectedImagePanDragImpl = (ctx: Pick<windowSnipActionContext, 'isGlobalMouseDown' | 'selectedImagePanRef' | 'setSelectedImagePan'>, e: React.MouseEvent | React.PointerEvent) => {
  const { isGlobalMouseDown, selectedImagePanRef, setSelectedImagePan } = ctx;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startY = e.clientY;
    const startPan = selectedImagePanRef.current;
    let latestPan = { ...startPan };
    let moved = false;
    let disposed = false;
    let frame: number | null = null;

    isGlobalMouseDown.current = true;

    const applyLatestPan = () => {
      frame = null;
      if (disposed) return;
      selectedImagePanRef.current = latestPan;
      setSelectedImagePan(latestPan);
    };

    const requestApplyPan = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(applyLatestPan);
    };

    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      selectedImagePanRef.current = latestPan;
      setSelectedImagePan(latestPan);
      isGlobalMouseDown.current = false;
      document.removeEventListener('pointermove', onMove as EventListener, true);
      document.removeEventListener('pointerup', onUp as EventListener, true);
      document.removeEventListener('pointercancel', onCancel as EventListener, true);
      document.removeEventListener('mousemove', onMove as EventListener, true);
      document.removeEventListener('mouseup', onUp as EventListener, true);
    };

    const onMove = (ev: PointerEvent | MouseEvent) => {
      if (disposed) return;
      if ('buttons' in ev && (ev.buttons & 1) !== 1) {
        cleanup();
        return;
      }

      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 2) return;
      moved = true;

      ev.preventDefault();
      ev.stopPropagation();
      latestPan = { x: startPan.x + dx, y: startPan.y + dy };
      requestApplyPan();
    };

    const onUp = (ev: PointerEvent | MouseEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      cleanup();
    };

    const onCancel = (ev: PointerEvent | MouseEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      cleanup();
    };

    document.addEventListener('pointermove', onMove as EventListener, true);
    document.addEventListener('pointerup', onUp as EventListener, true);
    document.addEventListener('pointercancel', onCancel as EventListener, true);
    document.addEventListener('mousemove', onMove as EventListener, true);
    document.addEventListener('mouseup', onUp as EventListener, true);

};

export const startPreviewWindowDragImpl = (ctx: Pick<windowSnipActionContext, 'appWindow' | 'isDraggingTitleRef' | 'isGlobalMouseDown' | 'previewDragActiveRef' | 'setIsDraggingTitle' | 'setIsOpen'>, e: React.MouseEvent | React.PointerEvent) => {
  const { appWindow, isDraggingTitleRef, isGlobalMouseDown, previewDragActiveRef, setIsDraggingTitle, setIsOpen } = ctx;
    if (e.button !== 2 || previewDragActiveRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    previewDragActiveRef.current = true;
    isGlobalMouseDown.current = true;
    isDraggingTitleRef.current = true;
    setIsDraggingTitle(true);
    setIsOpen(true);
    invoke('set_topmost', { topmost: true }).catch(() => {});

    let lastX = e.screenX;
    let lastY = e.screenY;
    let pendingDx = 0;
    let pendingDy = 0;
    let frame: number | null = null;
    let disposed = false;

    const preventContextMenu = (ev: Event) => {
      ev.preventDefault();
      ev.stopPropagation();
    };

    const moveWindowBy = (dx: number, dy: number) => {
      // 优先走 Rust 增量移动命令；如果用户当前 main.rs 还没包含这个命令，则回退到前端 setPosition。
      invoke('sys_drag_window', { dx, dy }).catch(async () => {
        try {
          const pos = await appWindow.outerPosition();
          await appWindow.setPosition(new PhysicalPosition(
            Math.round(pos.x + dx),
            Math.round(pos.y + dy)
          ));
        } catch (_) {}
      });
    };

    const flushMove = () => {
      frame = null;
      if (disposed) return;
      const dx = pendingDx;
      const dy = pendingDy;
      pendingDx = 0;
      pendingDy = 0;
      if (dx === 0 && dy === 0) return;

      // 使用增量移动窗口，比 startDragging 更适合右键拖动。
      moveWindowBy(dx, dy);
    };

    const onMove = (me: PointerEvent | MouseEvent) => {
      if (disposed) return;
      // 右键没有按住时立即结束，避免松手后继续跟随。
      // MouseEvent.buttons: 左键=1，右键=2；预览窗口移动用的是右键拖动。
      if ('buttons' in me && (me.buttons & 2) !== 2) {
        cleanup();
        return;
      }

      me.preventDefault();
      me.stopPropagation();

      const dx = me.screenX - lastX;
      const dy = me.screenY - lastY;
      lastX = me.screenX;
      lastY = me.screenY;
      if (dx === 0 && dy === 0) return;

      pendingDx += dx;
      pendingDy += dy;
      if (frame === null) frame = requestAnimationFrame(flushMove);
    };

    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      if (pendingDx !== 0 || pendingDy !== 0) {
        const dx = pendingDx;
        const dy = pendingDy;
        pendingDx = 0;
        pendingDy = 0;
        moveWindowBy(dx, dy);
      }
      document.removeEventListener('pointermove', onMove as EventListener, true);
      document.removeEventListener('pointerup', cleanup, true);
      document.removeEventListener('mousemove', onMove as EventListener, true);
      document.removeEventListener('mouseup', cleanup, true);
      document.removeEventListener('contextmenu', preventContextMenu, true);
      previewDragActiveRef.current = false;
      isGlobalMouseDown.current = false;
      isDraggingTitleRef.current = false;
      setIsDraggingTitle(false);
    };

    document.addEventListener('pointermove', onMove as EventListener, true);
    document.addEventListener('pointerup', cleanup, true);
    document.addEventListener('mousemove', onMove as EventListener, true);
    document.addEventListener('mouseup', cleanup, true);
    document.addEventListener('contextmenu', preventContextMenu, true);

};

export const startDrawerTitleDragImpl = (ctx: Pick<windowSnipActionContext, 'appWindow' | 'closeTimerRef' | 'isDraggingTitleRef' | 'isGlobalMouseDown' | 'isMainWorkbenchActiveRef' | 'isPinnedRef' | 'isPointerInsideDrawerRef' | 'setDrawerState' | 'setIsDraggingTitle' | 'setIsOpen' | 'setIsPinned'>, e: React.PointerEvent) => {
  const { appWindow, closeTimerRef, isDraggingTitleRef, isGlobalMouseDown, isMainWorkbenchActiveRef, isPinnedRef, isPointerInsideDrawerRef, setDrawerState, setIsDraggingTitle, setIsOpen, setIsPinned } = ctx;
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button,input,textarea,select,a,[role="button"],[contenteditable="true"],[data-no-drag="true"]')) return;

    e.preventDefault();
    e.stopPropagation();

    if (isMainWorkbenchActiveRef.current) {
      isDraggingTitleRef.current = true;
      isGlobalMouseDown.current = true;
      void appWindow.startDragging()
        .catch((error) => {
          console.warn('原生窗口拖动启动失败:', error);
        })
        .finally(() => {
          isGlobalMouseDown.current = false;
          isDraggingTitleRef.current = false;
        });
      return;
    }

    setIsDraggingTitle(true);
    isDraggingTitleRef.current = true;
    isGlobalMouseDown.current = true;
    if (!isMainWorkbenchActiveRef.current) {
      setIsPinned(true);
      isPinnedRef.current = true;
      invoke('toggle_pin', { pinned: true }).catch(() => {});
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    isPointerInsideDrawerRef.current = true;
    setIsOpen(true);
    setDrawerState('open');
    invoke('set_topmost', { topmost: true }).catch(() => {});

    let lastX = e.screenX;
    let lastY = e.screenY;
    let pendingDx = 0;
    let pendingDy = 0;
    let frame: number | null = null;
    let disposed = false;

    const moveWindowBy = (dx: number, dy: number) => {
      invoke('sys_drag_window', { dx, dy }).catch(async () => {
        try {
          const pos = await appWindow.outerPosition();
          await appWindow.setPosition(new PhysicalPosition(
            Math.round(pos.x + dx),
            Math.round(pos.y + dy),
          ));
        } catch (_) {}
      });
    };

    const flushMove = () => {
      frame = null;
      if (disposed) return;
      const dx = pendingDx;
      const dy = pendingDy;
      pendingDx = 0;
      pendingDy = 0;
      if (dx !== 0 || dy !== 0) moveWindowBy(dx, dy);
    };

    const isLeftInputActive = (event: PointerEvent | MouseEvent) => {
      if (!('buttons' in event)) return true;
      if ((event.buttons & 1) === 1) return true;
      return (
        'pointerType' in event &&
        event.pointerType === 'pen' &&
        typeof event.pressure === 'number' &&
        event.pressure > 0
      );
    };

    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      if (pendingDx !== 0 || pendingDy !== 0) {
        const dx = pendingDx;
        const dy = pendingDy;
        pendingDx = 0;
        pendingDy = 0;
        moveWindowBy(dx, dy);
      }
      document.removeEventListener('pointermove', onMove as EventListener, true);
      document.removeEventListener('pointerup', cleanup, true);
      document.removeEventListener('pointercancel', cleanup, true);
      document.removeEventListener('mousemove', onMove as EventListener, true);
      document.removeEventListener('mouseup', cleanup, true);
      isGlobalMouseDown.current = false;
      isDraggingTitleRef.current = false;
      setIsDraggingTitle(false);
      appWindow.setResizable(isMainWorkbenchActiveRef.current).catch(() => {});
    };

    const onMove = (event: PointerEvent | MouseEvent) => {
      if (disposed) return;
      if (!isLeftInputActive(event)) {
        cleanup();
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const dx = event.screenX - lastX;
      const dy = event.screenY - lastY;
      lastX = event.screenX;
      lastY = event.screenY;
      if (dx === 0 && dy === 0) return;

      pendingDx += dx;
      pendingDy += dy;
      if (frame === null) frame = requestAnimationFrame(flushMove);
    };

    try {
      const currentTarget = e.currentTarget as HTMLElement | null;
      if (currentTarget && 'setPointerCapture' in currentTarget) {
        currentTarget.setPointerCapture(e.pointerId);
      }
    } catch (_) {}

    document.addEventListener('pointermove', onMove as EventListener, true);
    document.addEventListener('pointerup', cleanup, true);
    document.addEventListener('pointercancel', cleanup, true);
    document.addEventListener('mousemove', onMove as EventListener, true);
    document.addEventListener('mouseup', cleanup, true);

};

export const getQuickAccessVisualImpl = (ctx: Record<never, never>, item: BufferItem & { isDirectory?: boolean; isUrl?: boolean }) => {
  const {  } = ctx;
    const ext = getFileExtension(item.name || item.path || item.content || '');
    const pathOrUrl = item.path || item.url || item.content || '';

    if (item.isDirectory) {
      return { icon: <FolderOpen className="w-5 h-5 text-blue-500 dark:text-blue-300" />, label: '文件夹' };
    }
    if (item.type === 'image') {
      return { icon: <ImageIcon className="w-5 h-5 text-pink-500 dark:text-pink-400" />, label: '图片' };
    }
    if (item.type === 'video') {
      return { icon: <Film className="w-5 h-5 text-violet-500 dark:text-violet-400" />, label: '视频' };
    }
    if (item.type === 'text' && (item.isUrl || isProbablyUrl(pathOrUrl))) {
      return { icon: <Link className="w-5 h-5 text-sky-500 dark:text-sky-400" />, label: '网址' };
    }
    if (item.type === 'text') {
      return { icon: <Type className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />, label: '文本' };
    }

    const officeExts = ['ppt', 'pptx', 'doc', 'docx', 'xls', 'xlsx', 'pdf'];
    const archiveExts = ['zip', 'rar', '7z', 'tar', 'gz'];
    const audioExts = ['mp3', 'wav', 'aac', 'flac', 'm4a'];
    const codeExts = ['js', 'ts', 'tsx', 'jsx', 'rs', 'py', 'html', 'css', 'json', 'md'];

    if (officeExts.includes(ext)) {
      return { icon: <FileIcon className="w-5 h-5 text-orange-500 dark:text-orange-400" />, label: ext.toUpperCase() || '文档' };
    }
    if (archiveExts.includes(ext)) {
      return { icon: <FileIcon className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />, label: '压缩包' };
    }
    if (audioExts.includes(ext)) {
      return { icon: <FileIcon className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />, label: '音频' };
    }
    if (codeExts.includes(ext)) {
      return { icon: <FileIcon className="w-5 h-5 text-cyan-500 dark:text-cyan-400" />, label: '代码' };
    }

    return { icon: <FileIcon className="w-5 h-5 text-stone-500 dark:text-stone-400" />, label: '文件' };

};

export const openQuickAccessItemImpl = (ctx: Pick<windowSnipActionContext, 'openSelectedImagePreview' | 'showToast'>, item: BufferItem & { isDirectory?: boolean; isUrl?: boolean }, e: React.MouseEvent) => {
  const { openSelectedImagePreview, showToast } = ctx;
    e.preventDefault();
    e.stopPropagation();

    if (item.type === 'image' && getPreviewOriginalSource(item)) {
      openSelectedImagePreview(item);
      return;
    }

    const target = item.path || item.url || item.content || '';
    if (target) {
      invoke('open_file', { path: target }).catch(() => showToast('无法打开项目'));
    }

};

export const startResizingSidebarAreasImpl = (ctx: Pick<windowSnipActionContext, 'folderRailHeight' | 'setFolderRailHeight'>, e: React.PointerEvent) => {
  const { folderRailHeight, setFolderRailHeight } = ctx;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const startY = e.clientY;
    const startHeight = folderRailHeight;
    const minHeight = 220;
    const maxHeight = clamp(window.innerHeight - 260, 260, 620);

    const onMove = (me: PointerEvent) => {
      const nextHeight = clamp(startHeight + (me.clientY - startY), minHeight, maxHeight);
      setFolderRailHeight(nextHeight);
    };

    const cleanup = () => {
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', cleanup, true);
      document.removeEventListener('pointercancel', cleanup, true);
    };

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', cleanup, true);
    document.addEventListener('pointercancel', cleanup, true);

};

export const startResizingFolderSidebarWidthImpl = (ctx: Pick<windowSnipActionContext, 'DRAWER_FOLDER_SIDEBAR_MAX_WIDTH' | 'DRAWER_FOLDER_SIDEBAR_MIN_WIDTH' | 'drawerFolderSidebarWidth' | 'drawerWidthRef' | 'isFolderSidebarLayout' | 'setDrawerFolderSidebarWidth'>, e: React.PointerEvent) => {
  const { DRAWER_FOLDER_SIDEBAR_MAX_WIDTH, DRAWER_FOLDER_SIDEBAR_MIN_WIDTH, drawerFolderSidebarWidth, drawerWidthRef, isFolderSidebarLayout, setDrawerFolderSidebarWidth } = ctx;
    if (e.button !== 0 || !isFolderSidebarLayout) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = drawerFolderSidebarWidth;
    const maxWidth = Math.min(DRAWER_FOLDER_SIDEBAR_MAX_WIDTH, Math.max(DRAWER_FOLDER_SIDEBAR_MIN_WIDTH, drawerWidthRef.current - 220));

    const onMove = (event: PointerEvent) => {
      const nextWidth = clamp(startWidth + (event.clientX - startX), DRAWER_FOLDER_SIDEBAR_MIN_WIDTH, maxWidth);
      setDrawerFolderSidebarWidth(nextWidth);
    };

    const cleanup = () => {
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', cleanup, true);
      document.removeEventListener('pointercancel', cleanup, true);
    };

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', cleanup, true);
    document.addEventListener('pointercancel', cleanup, true);

};
