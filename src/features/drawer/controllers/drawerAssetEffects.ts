import { invoke } from '@tauri-apps/api/core';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import { listen } from '@tauri-apps/api/event';
import { cursorPosition } from '@tauri-apps/api/window';
import React from 'react';
import { flushSync } from 'react-dom';
import { BufferItem } from '../../../types';
import type { WebImageCaptureMetadata } from '../../../types/webImageCollector';
import type { VirtualDropPayload,VirtualDropUiJob } from '../../../types/virtualDrop';
import { isCanvasTemplateJsonFileName } from '../../../utils/localMediaPaths';
import { type CanvasImageItem } from '../../canvasModel';
import { getImageFileFromDataTransfer,getWebImageFromDataTransfer,normalizeDraggedUrl,readImageFileAsDataUrl } from '../../dragData';
import { markLaunchIntroDoneThisPage } from '../../startup';
import { type TriggerMode } from '../../triggerModel';

type drawerAssetsEffectContext = { setVirtualDropJobs: React.Dispatch<React.SetStateAction<VirtualDropUiJob[]>>; showToast: (message: string) => void; appWindow: import('@tauri-apps/api/window').Window; lastCanvasDragClientRef: React.RefObject<{ x: number; y: number; } | null>; setExternalDragActive: (active: boolean) => void; isCanvasModeRef: React.RefObject<boolean>; setIsOpen: React.Dispatch<React.SetStateAction<boolean>>; setIsPinned: React.Dispatch<React.SetStateAction<boolean>>; isPinnedRef: React.RefObject<boolean>; setDrawerState: React.Dispatch<React.SetStateAction<"closed" | "pre_open" | "open" | "closing">>; stateRef: React.RefObject<{ isOpen: boolean; isPinned: boolean; showTextInput: boolean; isSearchActive: boolean; isAntiTouchMode: boolean; }>; isAntiTouchMode: boolean; isOpen: boolean; drawerWidthRef: React.RefObject<number>; drawerHeightRef: React.RefObject<number>; triggerModeRef: React.RefObject<TriggerMode>; licenseGateActiveRef: React.RefObject<boolean>; isMainWorkbenchActiveRef: React.RefObject<boolean>; showLaunchIntroRef: React.RefObject<boolean>; isSplashVisibleRef: React.RefObject<boolean>; showUpdateLogRef: React.RefObject<boolean>; lastAcceptedWebImageRef: React.RefObject<{ id: string; location: "drawer" | "canvas"; inline: boolean; at: number; } | null>; at: number; inline: boolean; supersededWebImageItemIdsRef: React.RefObject<Set<string>>; id: string; location: "canvas" | "drawer"; updateCanvasItemsImmediate: (updater: (prev: CanvasImageItem[]) => CanvasImageItem[]) => CanvasImageItem[]; setItems: React.Dispatch<React.SetStateAction<BufferItem[]>>; addCanvasWebImageUrl: (url: string, name?: string, client?: { x: number; y: number; }, fallbackUrls?: string[], captureMetadata?: WebImageCaptureMetadata) => Promise<void>; lastCanvasDropAtRef: React.RefObject<number>; addCanvasDroppedPaths: (paths: string[], client?: { x: number; y: number; }) => Promise<void>; addWebImageUrl: (url: string, name?: string, fallbackUrls?: string[], captureMetadata?: WebImageCaptureMetadata) => void; addDroppedPaths: (paths: string[]) => Promise<void>; lastWebImageDropAtRef: React.RefObject<number>; isPostInstallLaunchRef: React.RefObject<boolean>; startupAutoCloseSuppressedRef: React.RefObject<boolean>; isPointerInsideDrawerRef: React.RefObject<boolean>; setShowLaunchIntro: React.Dispatch<React.SetStateAction<boolean>>; setIsSplashVisible: React.Dispatch<React.SetStateAction<boolean>>; };

export const runDrawerAssetsEffect01 = (ctx: Pick<drawerAssetsEffectContext, 'setVirtualDropJobs' | 'showToast'>) => {
  const { setVirtualDropJobs, showToast } = ctx;
    const eventNames = [
      'virtual-drop://queued',
      'virtual-drop://metadata',
      'virtual-drop://progress',
      'virtual-drop://completed',
      'virtual-drop://failed',
      'virtual-drop://cancelled',
      'virtual-drop://timed-out',
    ];
    const unlisteners: Array<() => void> = [];
    const cleanupTimers = new Map<string, number>();
    let disposed = false;

    const scheduleCleanup = (jobId: string, delay = 4200) => {
      const existing = cleanupTimers.get(jobId);
      if (existing) window.clearTimeout(existing);
      const timer = window.setTimeout(() => {
        cleanupTimers.delete(jobId);
        setVirtualDropJobs(prev => prev.filter(job => job.id !== jobId));
      }, delay);
      cleanupTimers.set(jobId, timer);
    };

    const handleVirtualDropEvent = (payload: VirtualDropPayload) => {
      const jobId = payload.job_id || payload.jobId || '';
      if (!jobId) return;
      const status = payload.status || 'queued';
      const loaded = Math.max(0, Number(payload.loaded || 0));
      const total = payload.total == null ? undefined : Math.max(0, Number(payload.total || 0));
      const progress = payload.progress == null
        ? (total && total > 0 ? Math.min(1, loaded / total) : undefined)
        : Math.min(1, Math.max(0, Number(payload.progress)));
      const fileName = payload.file_name || payload.fileName || payload.path?.split(/[\\/]/).pop() || '网页图片';
      const message = payload.message || undefined;

      setVirtualDropJobs(prev => {
        const current = prev.find(job => job.id === jobId);
        const next: VirtualDropUiJob = {
          id: jobId,
          status,
          fileName: fileName || current?.fileName || '网页图片',
          loaded,
          total,
          progress,
          message,
          createdAt: current?.createdAt || Date.now(),
        };
        return [next, ...prev.filter(job => job.id !== jobId)].slice(0, 4);
      });

      if (status === 'queued') showToast('正在导入网页图片...');
      if (status === 'completed') scheduleCleanup(jobId, 1800);
      if (status === 'failed' || status === 'cancelled' || status === 'timed_out') {
        showToast(status === 'cancelled' ? '已取消网页图片导入' : '网页图片导入失败');
        scheduleCleanup(jobId);
      }
    };

    Promise.all(eventNames.map(name => listen<VirtualDropPayload>(name, (event) => {
      handleVirtualDropEvent(event.payload);
    }))).then(listeners => {
      if (disposed) listeners.forEach(unlisten => unlisten());
      else unlisteners.push(...listeners);
    }).catch((err) => {
      console.warn('listen virtual drop events failed:', err);
    });

    return () => {
      disposed = true;
      unlisteners.forEach(unlisten => unlisten());
      cleanupTimers.forEach(timer => window.clearTimeout(timer));
    };

};

export const runDrawerAssetsEffect02 = (ctx: Pick<drawerAssetsEffectContext, 'addCanvasDroppedPaths' | 'addCanvasWebImageUrl' | 'addDroppedPaths' | 'addWebImageUrl' | 'appWindow' | 'drawerHeightRef' | 'drawerWidthRef' | 'isCanvasModeRef' | 'isMainWorkbenchActiveRef' | 'isPinnedRef' | 'isSplashVisibleRef' | 'lastAcceptedWebImageRef' | 'lastCanvasDragClientRef' | 'lastCanvasDropAtRef' | 'licenseGateActiveRef' | 'setDrawerState' | 'setExternalDragActive' | 'setIsOpen' | 'setIsPinned' | 'setItems' | 'showLaunchIntroRef' | 'showUpdateLogRef' | 'stateRef' | 'supersededWebImageItemIdsRef' | 'triggerModeRef' | 'updateCanvasItemsImmediate'>) => {
  const { addCanvasDroppedPaths, addCanvasWebImageUrl, addDroppedPaths, addWebImageUrl, appWindow, drawerHeightRef, drawerWidthRef, isCanvasModeRef, isMainWorkbenchActiveRef, isPinnedRef, isSplashVisibleRef, lastAcceptedWebImageRef, lastCanvasDragClientRef, lastCanvasDropAtRef, licenseGateActiveRef, setDrawerState, setExternalDragActive, setIsOpen, setIsPinned, setItems, showLaunchIntroRef, showUpdateLogRef, stateRef, supersededWebImageItemIdsRef, triggerModeRef, updateCanvasItemsImmediate } = ctx;
    let unlistenNativeDrop: (() => void) | undefined;
    let unlistenNativeDragEnter: (() => void) | undefined;
    let unlistenNativeDragLeave: (() => void) | undefined;

    const readCurrentCanvasDropClient = async () => {
      try {
        const [cursor, innerPosition, scaleFactor] = await Promise.all([
          cursorPosition(),
          appWindow.innerPosition(),
          appWindow.scaleFactor(),
        ]);
        const scale = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
        const client = {
          x: (cursor.x - innerPosition.x) / scale,
          y: (cursor.y - innerPosition.y) / scale,
        };
        lastCanvasDragClientRef.current = client;
        return client;
      } catch (_) {
        return lastCanvasDragClientRef.current || undefined;
      }
    };

    listen('native-drag-enter', () => {
      setExternalDragActive(true);
      if (isCanvasModeRef.current) {
        setIsOpen(true);
        setIsPinned(true);
        isPinnedRef.current = true;
        setDrawerState('open');
        return;
      }
      if (!stateRef.current.isAntiTouchMode) {
        setIsOpen(true);
        // 如果抽屉已经打开/钉住，说明用户可能已经把它拖到别的位置了。
        // 不再调用后端 open_drawer，避免外部拖入文件时把窗口重新吸附回屏幕右侧。
        if (!stateRef.current.isOpen && !isPinnedRef.current) {
          invoke('open_drawer', { width: drawerWidthRef.current, height: drawerHeightRef.current, mode: triggerModeRef.current }).catch(() => {});
        }
      }
    }).then(f => unlistenNativeDragEnter = f);

    listen('native-drag-leave', () => {
      setExternalDragActive(false);
      if (isCanvasModeRef.current) return;
      if (!licenseGateActiveRef.current && !isPinnedRef.current && !isMainWorkbenchActiveRef.current && !showLaunchIntroRef.current && !isSplashVisibleRef.current && !showUpdateLogRef.current) setIsOpen(false);
    }).then(f => unlistenNativeDragLeave = f);

    listen('native-drop', async (event: any) => {
      setExternalDragActive(false);
      if (stateRef.current.isAntiTouchMode) return;
      const payload = event.payload as {
        source?: string;
        paths?: string[];
        web_images?: { url?: string; name?: string; fallback_urls?: string[] }[];
        texts?: string[];
      };

      const isVirtualWebFallback = payload.source?.endsWith('/web-fallback') === true;
      if (isVirtualWebFallback && Array.isArray(payload.paths) && payload.paths.length > 0) {
        const previous = lastAcceptedWebImageRef.current;
        if (previous && Date.now() - previous.at < 60000) {
          if (previous.inline) return;
          supersededWebImageItemIdsRef.current.add(previous.id);
          if (previous.location === 'canvas') {
            updateCanvasItemsImmediate(items => items.filter(item => item.item.id !== previous.id));
          } else {
            setItems(items => items.filter(item => item.id !== previous.id));
          }
          lastAcceptedWebImageRef.current = null;
        }
      }

      const webImages = Array.isArray(payload.web_images)
        ? payload.web_images.filter(image => image?.url)
        : [];

      // 原生 OLE 拖网页图片时可能同时返回 paths + web_images。
      // 有 web_images 时只走网页图片缓存链路，避免把临时文件路径误加入抽屉。
      if (isCanvasModeRef.current) {
        const client = await readCurrentCanvasDropClient();
        if (webImages.length > 0) {
          for (const image of webImages) {
            void addCanvasWebImageUrl(image.url as string, image.name, client, image.fallback_urls);
          }
        } else if (Array.isArray(payload.paths) && payload.paths.length > 0) {
          if (
            Date.now() - lastCanvasDropAtRef.current < 700
            && !payload.paths.some(isCanvasTemplateJsonFileName)
          ) return;
          void addCanvasDroppedPaths(payload.paths, client);
        }
      } else if (webImages.length > 0) {
        for (const image of webImages) {
          addWebImageUrl(image.url as string, image.name, image.fallback_urls);
        }
      } else if (Array.isArray(payload.paths) && payload.paths.length > 0) {
        void addDroppedPaths(payload.paths);
      }

      if ((payload.paths?.length || 0) > 0 || (payload.web_images?.length || 0) > 0) {
        setIsOpen(true);
      }
    }).then(f => unlistenNativeDrop = f);

    return () => {
      if (unlistenNativeDrop) unlistenNativeDrop();
      if (unlistenNativeDragEnter) unlistenNativeDragEnter();
      if (unlistenNativeDragLeave) unlistenNativeDragLeave();
    };

};

export const runDrawerAssetsEffect03 = (ctx: Pick<drawerAssetsEffectContext, 'addCanvasDroppedPaths' | 'addDroppedPaths' | 'appWindow' | 'drawerHeightRef' | 'drawerWidthRef' | 'isCanvasModeRef' | 'isMainWorkbenchActiveRef' | 'isPinnedRef' | 'isSplashVisibleRef' | 'lastCanvasDragClientRef' | 'lastCanvasDropAtRef' | 'lastWebImageDropAtRef' | 'licenseGateActiveRef' | 'setDrawerState' | 'setExternalDragActive' | 'setIsOpen' | 'setIsPinned' | 'showLaunchIntroRef' | 'showUpdateLogRef' | 'stateRef' | 'triggerModeRef'>) => {
  const { addCanvasDroppedPaths, addDroppedPaths, appWindow, drawerHeightRef, drawerWidthRef, isCanvasModeRef, isMainWorkbenchActiveRef, isPinnedRef, isSplashVisibleRef, lastCanvasDragClientRef, lastCanvasDropAtRef, lastWebImageDropAtRef, licenseGateActiveRef, setDrawerState, setExternalDragActive, setIsOpen, setIsPinned, showLaunchIntroRef, showUpdateLogRef, stateRef, triggerModeRef } = ctx;
    let nativeDragScaleFactor = window.devicePixelRatio || 1;
    void appWindow.scaleFactor()
      .then(scaleFactor => {
        if (Number.isFinite(scaleFactor) && scaleFactor > 0) nativeDragScaleFactor = scaleFactor;
      })
      .catch(() => {});

    const updateCanvasDragClientFromNativePosition = (position?: PhysicalPosition) => {
      if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
        return lastCanvasDragClientRef.current || undefined;
      }
      const logical = position.toLogical(nativeDragScaleFactor);
      const client = { x: logical.x, y: logical.y };
      lastCanvasDragClientRef.current = client;
      return client;
    };

    const unlistenPromise = appWindow.onDragDropEvent((event) => {
      const { type } = event.payload;
      if (type === 'enter' || type === 'over') {
        if (isCanvasModeRef.current) {
          updateCanvasDragClientFromNativePosition(event.payload.position);
        }
        setExternalDragActive(true);
        if (isCanvasModeRef.current) {
          setIsOpen(true);
          setIsPinned(true);
          isPinnedRef.current = true;
          setDrawerState('open');
          return;
        }
        if (!stateRef.current.isAntiTouchMode) {
          setIsOpen(true);
          // 兜底：Tauri 原生监听如果仍然触发，也不要在已打开/钉住时重置窗口位置。
          if (!stateRef.current.isOpen && !isPinnedRef.current) {
            invoke('open_drawer', { width: drawerWidthRef.current, height: drawerHeightRef.current, mode: triggerModeRef.current }).catch(() => {});
          }
        }
      } else if (type === 'leave') {
        setExternalDragActive(false);
        if (isCanvasModeRef.current) return;
        if (!licenseGateActiveRef.current && !isPinnedRef.current && !isMainWorkbenchActiveRef.current && !showLaunchIntroRef.current && !isSplashVisibleRef.current && !showUpdateLogRef.current) setIsOpen(false);
      } else if (type === 'drop') {
        setExternalDragActive(false);
        if (stateRef.current.isAntiTouchMode) return;
        // DOM/edge/native 网页图片 drop 之后，Tauri 可能还会紧接着派发一次临时文件 paths。
        // 这时不要再把临时文件当成本地图片加入抽屉，否则会绕过自定义网页缓存目录。
        if (Date.now() - lastWebImageDropAtRef.current < 1500) return;
        const paths = event.payload.paths;
        if (isCanvasModeRef.current) {
          if (
            Date.now() - lastCanvasDropAtRef.current < 700
            && !(paths || []).some(isCanvasTemplateJsonFileName)
          ) return;
          const client = updateCanvasDragClientFromNativePosition(event.payload.position);
          void addCanvasDroppedPaths(paths || [], client);
        } else {
          void addDroppedPaths(paths || []);
        }
      }
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten()).catch(() => {});
    };

};

export const runDrawerAssetsEffect04 = (ctx: Pick<drawerAssetsEffectContext, 'addCanvasDroppedPaths' | 'addCanvasWebImageUrl' | 'addDroppedPaths' | 'addWebImageUrl' | 'isCanvasModeRef' | 'lastCanvasDragClientRef' | 'lastCanvasDropAtRef' | 'lastWebImageDropAtRef' | 'setExternalDragActive' | 'stateRef'>) => {
  const { addCanvasDroppedPaths, addCanvasWebImageUrl, addDroppedPaths, addWebImageUrl, isCanvasModeRef, lastCanvasDragClientRef, lastCanvasDropAtRef, lastWebImageDropAtRef, setExternalDragActive, stateRef } = ctx;
    let unlistenFiles: (() => void) | undefined;
    let unlistenWebImage: (() => void) | undefined;
    listen('edge-files-dropped', (event: any) => {
      setExternalDragActive(false);
      if (stateRef.current.isAntiTouchMode) return;
      if (Date.now() - lastWebImageDropAtRef.current < 1500) return;
      const paths = event.payload as string[];
      if (Array.isArray(paths) && paths.length > 0) {
        if (isCanvasModeRef.current) {
          if (
            Date.now() - lastCanvasDropAtRef.current < 700
            && !paths.some(isCanvasTemplateJsonFileName)
          ) return;
          void addCanvasDroppedPaths(paths, lastCanvasDragClientRef.current || undefined);
        }
        else void addDroppedPaths(paths);
      }
    }).then(f => unlistenFiles = f);
    listen('edge-web-image-dropped', (event: any) => {
      setExternalDragActive(false);
      if (stateRef.current.isAntiTouchMode) return;
      const payload = event.payload as { url?: string; name?: string; fallbackUrls?: string[] };
      if (payload?.url) {
        if (isCanvasModeRef.current) {
          void addCanvasWebImageUrl(
            payload.url,
            payload.name,
            lastCanvasDragClientRef.current || undefined,
            payload.fallbackUrls,
          );
        } else addWebImageUrl(payload.url, payload.name, payload.fallbackUrls);
      }
    }).then(f => unlistenWebImage = f);
    return () => {
      if (unlistenFiles) unlistenFiles();
      if (unlistenWebImage) unlistenWebImage();
    };

};

export const runDrawerAssetsEffect05 = (ctx: Pick<drawerAssetsEffectContext, 'addCanvasWebImageUrl' | 'addWebImageUrl' | 'isCanvasModeRef' | 'setExternalDragActive' | 'stateRef'>) => {
  const { addCanvasWebImageUrl, addWebImageUrl, isCanvasModeRef, setExternalDragActive, stateRef } = ctx;
    const hasLocalFileLikeData = (dt?: DataTransfer | null) => {
      if (!dt) return false;
      return (dt.files?.length || 0) > 0 || Array.from(dt.items || []).some(item => item.kind === 'file');
    };

    const getExternalWebImage = (dt?: DataTransfer | null) => {
      const image = getWebImageFromDataTransfer(dt);
      const imageUrl = image?.url ? normalizeDraggedUrl(image.url) : '';
      if (image?.url && /^(https?:|data:image\/)/i.test(imageUrl)) return image;
      return null;
    };

    const hasPotentialWebImageData = (dt?: DataTransfer | null) => {
      if (!dt) return false;
      const image = getExternalWebImage(dt);
      if (image?.url) return true;
      if (hasLocalFileLikeData(dt)) return false;
      const types = Array.from(dt.types || []);
      return types.some(type => [
        'DownloadURL',
        'text/html',
        'text/uri-list',
        'text/x-moz-url',
        'text/plain',
      ].includes(type));
    };

    const handleDomDragOver = (event: DragEvent) => {
      if (stateRef.current.isAntiTouchMode) return;
      if (!hasPotentialWebImageData(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    };

    const handleDomDrop = (event: DragEvent) => {
      if (stateRef.current.isAntiTouchMode) return;
      const image = getExternalWebImage(event.dataTransfer);
      if (!image) return;

      event.preventDefault();
      event.stopPropagation();
      setExternalDragActive(false);
      const client = { x: event.clientX, y: event.clientY };
      const imageFile = getImageFileFromDataTransfer(event.dataTransfer);
      void (async () => {
        if (imageFile && imageFile.size > 0) {
          try {
            const dataUrl = await readImageFileAsDataUrl(imageFile);
            if (isCanvasModeRef.current) {
              await addCanvasWebImageUrl(
                dataUrl,
                imageFile.name || image.name,
                client,
                [image.url, ...(image.fallbackUrls || [])],
              );
            } else {
              addWebImageUrl(
                dataUrl,
                imageFile.name || image.name,
                [image.url, ...(image.fallbackUrls || [])],
              );
            }
            return;
          } catch (_) {
            // Continue with URL candidates if this browser's file item cannot be read.
          }
        }
        if (isCanvasModeRef.current) {
          await addCanvasWebImageUrl(image.url, image.name, client, image.fallbackUrls);
        } else {
          addWebImageUrl(image.url, image.name, image.fallbackUrls);
        }
      })();
    };

    window.addEventListener('dragenter', handleDomDragOver, true);
    window.addEventListener('dragover', handleDomDragOver, true);
    window.addEventListener('drop', handleDomDrop, true);
    document.addEventListener('dragenter', handleDomDragOver, true);
    document.addEventListener('dragover', handleDomDragOver, true);
    document.addEventListener('drop', handleDomDrop, true);
    return () => {
      window.removeEventListener('dragenter', handleDomDragOver, true);
      window.removeEventListener('dragover', handleDomDragOver, true);
      window.removeEventListener('drop', handleDomDrop, true);
      document.removeEventListener('dragenter', handleDomDragOver, true);
      document.removeEventListener('dragover', handleDomDragOver, true);
      document.removeEventListener('drop', handleDomDrop, true);
    };

};

export const runDrawerAssetsEffect06 = (ctx: Pick<drawerAssetsEffectContext, 'drawerHeightRef' | 'drawerWidthRef' | 'isPinnedRef' | 'isPointerInsideDrawerRef' | 'isPostInstallLaunchRef' | 'isSplashVisibleRef' | 'setDrawerState' | 'setIsOpen' | 'setIsPinned' | 'setIsSplashVisible' | 'setShowLaunchIntro' | 'showLaunchIntroRef' | 'startupAutoCloseSuppressedRef' | 'triggerModeRef'>) => {
  const { drawerHeightRef, drawerWidthRef, isPinnedRef, isPointerInsideDrawerRef, isPostInstallLaunchRef, isSplashVisibleRef, setDrawerState, setIsOpen, setIsPinned, setIsSplashVisible, setShowLaunchIntro, showLaunchIntroRef, startupAutoCloseSuppressedRef, triggerModeRef } = ctx;
    let disposed = false;

    void invoke<boolean>('consume_post_install_launch', {
      width: drawerWidthRef.current,
      height: drawerHeightRef.current,
      mode: triggerModeRef.current,
    }).then((isPostInstallLaunch) => {
      if (disposed || !isPostInstallLaunch) return;

      isPostInstallLaunchRef.current = true;
      markLaunchIntroDoneThisPage();
      startupAutoCloseSuppressedRef.current = true;
      isPointerInsideDrawerRef.current = false;
      showLaunchIntroRef.current = false;
      isSplashVisibleRef.current = false;
      isPinnedRef.current = false;

      flushSync(() => {
        setShowLaunchIntro(false);
        setIsSplashVisible(false);
        setIsPinned(false);
        setIsOpen(true);
        setDrawerState('open');
      });

      void invoke('toggle_pin', { pinned: false }).catch(() => {});
    }).catch((error) => {
      console.warn('resolve post-install launch failed:', error);
    });

    return () => {
      disposed = true;
    };

};
