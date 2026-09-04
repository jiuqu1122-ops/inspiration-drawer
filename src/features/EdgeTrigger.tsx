import React, { useEffect, useRef, useState } from 'react';
import { Check, Image as ImageIcon, Lightbulb, X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { LogicalPosition } from '@tauri-apps/api/dpi';
import { invoke } from '@tauri-apps/api/core';
import { listen, emitTo } from '@tauri-apps/api/event';

import { clamp } from './common';
import { clearLegacyStartupFlags } from './startup';
import { getStoredDrawerSize } from './drawerPrefs';
import { isPrimaryModifier } from '../platform/capabilities';
import {
  getImageFileFromDataTransfer,
  getWebImageFromDataTransfer,
  normalizeDraggedUrl,
  readImageFileAsDataUrl,
} from './dragData';
import {
  EDGE_HOVER_OPEN_DELAY,
  EDGE_STRIP_HEIGHT,
  FLOAT_HOVER_OPEN_DELAY,
  FLOAT_TRIGGER_SIZE,
  getStoredEdgeStripY,
  getStoredFloatPosition,
  getStoredTriggerMode,
  saveEdgeStripY,
  saveFloatPosition,
  shouldAllowTriggerHoverOpen,
  type TriggerMode,
} from './triggerModel';

const appWindow = getCurrentWindow();
const appWebview = getCurrentWebview();

export function EdgeTrigger() {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark');
  const [triggerMode, setTriggerMode] = useState<TriggerMode>(() => getStoredTriggerMode());
  const triggerModeRef = useRef<TriggerMode>(triggerMode);
  const openingRef = useRef(false);
  const dragOpenBurstRef = useRef<number | null>(null);
  const startupPreviewDoneRef = useRef(false);
  const triggerShownAtRef = useRef(Date.now());
  const floatDragRef = useRef({ active: false, moved: false, lastX: 0, lastY: 0 });
  const [isFloatDragOverlay, setIsFloatDragOverlay] = useState(false);
  const [floatVisualPos, setFloatVisualPos] = useState(() => getStoredFloatPosition());
  const floatVisualPosRef = useRef(floatVisualPos);
  useEffect(() => { floatVisualPosRef.current = floatVisualPos; }, [floatVisualPos]);
  const [floatOverlayOrigin, setFloatOverlayOrigin] = useState({ x: 0, y: 0 });
  const floatOverlayOriginRef = useRef(floatOverlayOrigin);
  useEffect(() => { floatOverlayOriginRef.current = floatOverlayOrigin; }, [floatOverlayOrigin]);

  const [isAntiTouchMode, setIsAntiTouchMode] = useState(() => localStorage.getItem('drawer_anti_touch_mode') === 'true');
  const antiTouchRef = useRef(isAntiTouchMode);
  const floatHoverOpenTimerRef = useRef<number | null>(null);
  const edgeHoverOpenTimerRef = useRef<number | null>(null);
  const edgeStripDragRef = useRef({ active: false, moved: false, lastY: 0 });
  const leftButtonDownRef = useRef(false);
  const activeBrowserDragIdRef = useRef('');
  const browserDragResetTimerRef = useRef<number | null>(null);
  const [browserDragState, setBrowserDragState] = useState<'idle' | 'ready' | 'saving' | 'success' | 'error'>('idle');
  useEffect(() => { antiTouchRef.current = isAntiTouchMode; }, [isAntiTouchMode]);

  useEffect(() => {
    const resetSoon = (delay: number) => {
      if (browserDragResetTimerRef.current !== null) window.clearTimeout(browserDragResetTimerRef.current);
      browserDragResetTimerRef.current = window.setTimeout(() => {
        browserDragResetTimerRef.current = null;
        activeBrowserDragIdRef.current = '';
        setBrowserDragState('idle');
      }, delay);
    };
    const unlisteners = [
      listen<{ dragId?: string }>('browser-extension-image-drag-started', event => {
        const dragId = String(event.payload?.dragId || '');
        if (!dragId) return;
        activeBrowserDragIdRef.current = dragId;
        setBrowserDragState('ready');
      }),
      listen<{ dragId?: string }>('browser-extension-image-drag-cancelled', event => {
        const dragId = String(event.payload?.dragId || '');
        if (dragId && activeBrowserDragIdRef.current && dragId !== activeBrowserDragIdRef.current) return;
        activeBrowserDragIdRef.current = '';
        setBrowserDragState('idle');
      }),
      listen<{ dragId?: string }>('browser-extension-image-drop-committed', event => {
        const dragId = String(event.payload?.dragId || '');
        if (dragId) activeBrowserDragIdRef.current = dragId;
        setBrowserDragState('saving');
      }),
      listen<{ dragId?: string }>('browser-extension-image-save-succeeded', event => {
        const dragId = String(event.payload?.dragId || '');
        if (dragId && activeBrowserDragIdRef.current && dragId !== activeBrowserDragIdRef.current) return;
        setBrowserDragState('success');
        resetSoon(1100);
      }),
      listen<{ dragId?: string }>('browser-extension-image-save-failed', event => {
        const dragId = String(event.payload?.dragId || '');
        if (dragId && activeBrowserDragIdRef.current && dragId !== activeBrowserDragIdRef.current) return;
        setBrowserDragState('error');
        resetSoon(1400);
      }),
    ];
    return () => {
      unlisteners.forEach(unlisten => { void unlisten.then(dispose => dispose()); });
      if (browserDragResetTimerRef.current !== null) window.clearTimeout(browserDragResetTimerRef.current);
    };
  }, []);

  const clearFloatHoverOpenTimer = () => {
    if (floatHoverOpenTimerRef.current !== null) {
      window.clearTimeout(floatHoverOpenTimerRef.current);
      floatHoverOpenTimerRef.current = null;
    }
  };

  const clearEdgeHoverOpenTimer = () => {
    if (edgeHoverOpenTimerRef.current !== null) {
      window.clearTimeout(edgeHoverOpenTimerRef.current);
      edgeHoverOpenTimerRef.current = null;
    }
  };

  useEffect(() => {
    const markLeftDown = (ev: MouseEvent | PointerEvent) => {
      if ('button' in ev && ev.button === 0) leftButtonDownRef.current = true;
    };
    const clearLeftDown = () => {
      leftButtonDownRef.current = false;
    };

    window.addEventListener('mousedown', markLeftDown, true);
    window.addEventListener('pointerdown', markLeftDown, true);
    window.addEventListener('mouseup', clearLeftDown, true);
    window.addEventListener('pointerup', clearLeftDown, true);
    window.addEventListener('pointercancel', clearLeftDown, true);
    window.addEventListener('blur', clearLeftDown, true);

    return () => {
      window.removeEventListener('mousedown', markLeftDown, true);
      window.removeEventListener('pointerdown', markLeftDown, true);
      window.removeEventListener('mouseup', clearLeftDown, true);
      window.removeEventListener('pointerup', clearLeftDown, true);
      window.removeEventListener('pointercancel', clearLeftDown, true);
      window.removeEventListener('blur', clearLeftDown, true);
    };
  }, []);

  // 悬浮方块窗口里彻底禁用右键菜单，避免右键拖动结束后弹出系统菜单。
  useEffect(() => {
    const preventContextMenu = (ev: Event) => {
      ev.preventDefault();
      ev.stopPropagation();
    };

    window.addEventListener('contextmenu', preventContextMenu, true);
    document.addEventListener('contextmenu', preventContextMenu, true);

    return () => {
      window.removeEventListener('contextmenu', preventContextMenu, true);
      document.removeEventListener('contextmenu', preventContextMenu, true);
    };
  }, []);

  useEffect(() => { triggerModeRef.current = triggerMode; }, [triggerMode]);

  const refreshEdgeDropTargetsSoon = (delay = 220) => {
    // 悬浮方块/侧边小条尺寸切换后，WebView2 的子窗口 HWND 有时会重建。
    // 只在“定位完成后”刷新 edge 的 OLE DropTarget，不在拖入文件过程中刷新，避免卡住。
    window.setTimeout(() => {
      invoke('refresh_edge_drop_targets').catch(() => {});
    }, delay);
  };

  const positionTrigger = (mode = triggerModeRef.current) => {
    if (antiTouchRef.current) {
      invoke('hide_edge').catch(() => {});
      return;
    }

    const { height } = getStoredDrawerSize();
    if (mode === 'float') {
      const { x, y } = getStoredFloatPosition();
      invoke('position_edge', { height, mode, x, y })
        .then(() => refreshEdgeDropTargetsSoon())
        .catch(() => {});
    } else {
      const y = getStoredEdgeStripY();
      invoke('position_edge', { height, mode, y })
        .then(() => refreshEdgeDropTargetsSoon())
        .catch(() => {});
    }
  };

  const openDrawer = (force = false) => {
    clearEdgeHoverOpenTimer();
    if (antiTouchRef.current) return;
    if (openingRef.current && !force) return;
    openingRef.current = true;
    const { width, height } = getStoredDrawerSize();
    invoke('open_drawer', { width, height, mode: triggerModeRef.current })
      .catch(() => {})
      .finally(() => {
        window.setTimeout(() => { openingRef.current = false; }, 80);
      });
  };

  const scheduleFloatHoverOpen = (delay = 300, allowWhileLeftButtonDown = false) => {
    // 普通鼠标移动时，如果左键正按着，说明用户可能只是按住拖动经过悬浮方块，
    // 这种情况下不要自动弹出。文件拖拽会从 drag 事件进来，显式传 allow=true。
    if (
      antiTouchRef.current ||
      triggerModeRef.current !== 'float' ||
      floatDragRef.current.active ||
      (!allowWhileLeftButtonDown && !shouldAllowTriggerHoverOpen(triggerShownAtRef.current)) ||
      (!allowWhileLeftButtonDown && leftButtonDownRef.current)
    ) return;
    clearFloatHoverOpenTimer();
    floatHoverOpenTimerRef.current = window.setTimeout(() => {
      floatHoverOpenTimerRef.current = null;
      if (
        (!allowWhileLeftButtonDown && !shouldAllowTriggerHoverOpen(triggerShownAtRef.current))
        || (!allowWhileLeftButtonDown && leftButtonDownRef.current)
      ) return;
      openDrawer(true);
    }, delay);
  };

  const hasBrowserImageDragData = (dt?: DataTransfer | null) => {
    if (!dt) return false;
    const types = Array.from(dt.types || []);
    const image = getWebImageFromDataTransfer(dt);
    const imageUrl = image?.url ? normalizeDraggedUrl(image.url) : '';
    if (/^(https?:|data:image\/)/i.test(imageUrl)) return true;

    // 从浏览器拖图片时，Chrome/Edge 常见类型是 DownloadURL 或 text/html；
    // 即使同时带有 Files，也要优先按网页图片处理，否则抽屉提前展开后会丢失 URL 数据。
    if (types.some(type => ['DownloadURL', 'text/html', 'text/x-moz-url'].includes(type))) return true;

    // 纯 URL 拖拽通常没有 Files；本地文件拖拽通常有 Files。
    if (!types.includes('Files') && types.some(type => ['text/uri-list', 'text/plain'].includes(type))) return true;

    return false;
  };

  const hasWebImageDragData = (dt?: DataTransfer | null) => hasBrowserImageDragData(dt);

  const sendWebDropToMain = async (dt?: DataTransfer | null) => {
    const image = getWebImageFromDataTransfer(dt);
    const imageUrl = image?.url ? normalizeDraggedUrl(image.url) : '';

    // 浏览器拖图时经常同时带 DownloadURL/text/html 和一个临时 Files 路径。
    // 之前先处理 Files，会把浏览器/Tauri 默认临时路径当成本地文件保存，导致自定义缓存目录完全不生效。
    // 这里必须优先按网页图片 URL 处理，让 main 侧统一调用 cache_web_image_to_dir 写入用户设置的缓存目录。
    if (image?.url && /^(https?:|data:image\/)/i.test(imageUrl)) {
      const imageFile = getImageFileFromDataTransfer(dt);
      if (imageFile && imageFile.size > 0) {
        try {
          const dataUrl = await readImageFileAsDataUrl(imageFile);
          emitTo('main', 'edge-web-image-dropped', {
            url: dataUrl,
            name: imageFile.name || image.name,
            fallbackUrls: [image.url, ...(image.fallbackUrls || [])],
          }).catch(() => {});
          return;
        } catch (_) {
          // Continue with URL candidates when the file item cannot be read.
        }
      }
      emitTo('main', 'edge-web-image-dropped', image).catch(() => {});
      return;
    }

    const directPaths = Array.from(dt?.files || [])
      .map(file => (file as any).path as string | undefined)
      .filter((path): path is string => !!path);
    if (directPaths.length > 0) {
      emitTo('main', 'edge-files-dropped', directPaths).catch(() => {});
    }
  };

  const startDragOpenBurst = (dt?: DataTransfer | null) => {
    // 文件/网页图片拖拽时，鼠标事件通常不会触发；只要 edge 窗口收到任何拖拽事件，
    // 就连续调用几次 open_drawer，避免 Windows/WebView2 第一次事件被吞掉。
    void dt;
    if (antiTouchRef.current) return;
    clearFloatHoverOpenTimer();
    if (dragOpenBurstRef.current !== null) return;

    let count = 0;
    const tick = () => {
      if (antiTouchRef.current) {
        if (dragOpenBurstRef.current !== null) {
          window.clearInterval(dragOpenBurstRef.current);
          dragOpenBurstRef.current = null;
        }
        return null;
      }
      openingRef.current = false;
      openDrawer(true);
      count += 1;
      if (count >= 16 && dragOpenBurstRef.current !== null) {
        window.clearInterval(dragOpenBurstRef.current);
        dragOpenBurstRef.current = null;
      }
    };

    tick();
    dragOpenBurstRef.current = window.setInterval(tick, 70);
  };

  useEffect(() => {
    const syncTheme = () => setIsDark(localStorage.getItem('theme') === 'dark');
    const syncAntiTouch = () => {
      const next = localStorage.getItem('drawer_anti_touch_mode') === 'true';
      setIsAntiTouchMode(next);
      antiTouchRef.current = next;
      if (next) {
        clearFloatHoverOpenTimer();
        clearEdgeHoverOpenTimer();
        if (dragOpenBurstRef.current !== null) {
          window.clearInterval(dragOpenBurstRef.current);
          dragOpenBurstRef.current = null;
        }
        invoke('hide_edge').catch(() => {});
      } else {
        window.setTimeout(() => positionTrigger(triggerModeRef.current), 30);
      }
    };
    const syncMode = () => {
      const next = getStoredTriggerMode();
      setTriggerMode(next);
      triggerModeRef.current = next;
      window.setTimeout(() => positionTrigger(next), 30);
    };

    window.addEventListener('storage', syncTheme);
    window.addEventListener('storage', syncMode);
    window.addEventListener('storage', syncAntiTouch);

    let unlistenMode: (() => void) | undefined;
    let unlistenTheme: (() => void) | undefined;
    let unlistenAntiTouch: (() => void) | undefined;
    let unlistenNativeDragEnter: (() => void) | undefined;
    let unlistenEdgeShown: (() => void) | undefined;
    listen('trigger-mode-changed', (event: any) => {
      const next = event.payload === 'float' ? 'float' : 'edge';
      localStorage.setItem('drawer_trigger_mode', next);
      setTriggerMode(next);
      triggerModeRef.current = next;
      window.setTimeout(() => positionTrigger(next), 30);
    }).then(f => unlistenMode = f);

    listen('theme-changed', (event: any) => {
      const next = event.payload === 'dark';
      localStorage.setItem('theme', next ? 'dark' : 'light');
      setIsDark(next);
    }).then(f => unlistenTheme = f);

    listen('anti-touch-changed', (event: any) => {
      const next = event.payload === true || event.payload === 'true';
      localStorage.setItem('drawer_anti_touch_mode', next ? 'true' : 'false');
      setIsAntiTouchMode(next);
      antiTouchRef.current = next;
      if (next) {
        clearFloatHoverOpenTimer();
        clearEdgeHoverOpenTimer();
        if (dragOpenBurstRef.current !== null) {
          window.clearInterval(dragOpenBurstRef.current);
          dragOpenBurstRef.current = null;
        }
        invoke('hide_edge').catch(() => {});
      } else {
        window.setTimeout(() => positionTrigger(triggerModeRef.current), 30);
      }
    }).then(f => unlistenAntiTouch = f);

    // Rust 原生 OLE DropTarget 发来的拖拽进入事件。
    // 这样网页图片和本地文件/文件夹都能触发展开，不再依赖 Tauri/WebView 内置拖拽。
    listen('native-drag-enter', () => {
      if (antiTouchRef.current) return;
      if (triggerModeRef.current === 'float') scheduleFloatHoverOpen(300, true);
      else startDragOpenBurst(null);
    }).then(f => unlistenNativeDragEnter = f);

    listen('edge-shown', () => {
      triggerShownAtRef.current = Date.now();
      clearFloatHoverOpenTimer();
      clearEdgeHoverOpenTimer();
    }).then(f => unlistenEdgeShown = f);

    positionTrigger(getStoredTriggerMode());

    // 启动欢迎页现在完全交给 main 窗口控制。
    // 这里不要再从 edge 触发旧的“展开 -> 自动缩回”预览，否则会和 main 的欢迎页启动动画打架，
    // 表现成启动时先缩回、再被倒计时逻辑打开。
    if (!startupPreviewDoneRef.current) {
      startupPreviewDoneRef.current = true;
      clearLegacyStartupFlags();
    }

    const openFromNativeOrDomDrag = (event?: DragEvent) => {
      if (antiTouchRef.current) {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
        }
        return;
      }

      if (event) {
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';

        const isDrop = event.type === 'drop';
        const isWebImageOnly = hasWebImageDragData(event.dataTransfer);

        if (triggerModeRef.current === 'float' && !isDrop) {
          scheduleFloatHoverOpen(300, true);
          return;
        }

        if (isDrop) {
          clearFloatHoverOpenTimer();
          void sendWebDropToMain(event.dataTransfer);
          // 网页图片在 edge/悬浮方块上松手后再展开抽屉，避免抽屉打开后
          // edge 被隐藏，导致 drop 事件落到 main 原生拖拽层而丢失 URL 数据。
          startDragOpenBurst(event.dataTransfer);
          return;
        }

        // 本地文件/文件夹拖拽：立即展开 main，让 Tauri 原生 drop 事件拿到源路径。
        // 网页图片拖拽：不要提前展开，保留 edge 作为 DOM drop 目标。
        if (!isWebImageOnly) startDragOpenBurst(event.dataTransfer);
        return;
      }

      if (triggerModeRef.current === 'float') scheduleFloatHoverOpen(300, true);
      else startDragOpenBurst(null);
    };

    window.addEventListener('dragenter', openFromNativeOrDomDrag, true);
    window.addEventListener('dragover', openFromNativeOrDomDrag, true);
    window.addEventListener('drop', openFromNativeOrDomDrag, true);
    document.addEventListener('dragenter', openFromNativeOrDomDrag, true);
    document.addEventListener('dragover', openFromNativeOrDomDrag, true);
    document.addEventListener('drop', openFromNativeOrDomDrag, true);

    let unlistenPromise = appWebview.onDragDropEvent((event) => {
      if (antiTouchRef.current) return;
      const type = (event.payload as any).type;
      if (type === 'enter' || type === 'over') {
        if (triggerModeRef.current === 'float') scheduleFloatHoverOpen(300, true);
        else startDragOpenBurst();
      } else if (type === 'drop') {
        clearFloatHoverOpenTimer();
        const paths = (event.payload as any).paths as string[] | undefined;
        if (paths && paths.length > 0) {
          emitTo('main', 'edge-files-dropped', paths).catch(() => {});
        }
        startDragOpenBurst();
      }
    });

    return () => {
      window.removeEventListener('storage', syncTheme);
      window.removeEventListener('storage', syncMode);
      window.removeEventListener('storage', syncAntiTouch);
      window.removeEventListener('dragenter', openFromNativeOrDomDrag, true);
      window.removeEventListener('dragover', openFromNativeOrDomDrag, true);
      window.removeEventListener('drop', openFromNativeOrDomDrag, true);
      document.removeEventListener('dragenter', openFromNativeOrDomDrag, true);
      document.removeEventListener('dragover', openFromNativeOrDomDrag, true);
      document.removeEventListener('drop', openFromNativeOrDomDrag, true);
      clearFloatHoverOpenTimer();
      clearEdgeHoverOpenTimer();
      if (dragOpenBurstRef.current !== null) {
        window.clearInterval(dragOpenBurstRef.current);
        dragOpenBurstRef.current = null;
      }
      if (unlistenMode) unlistenMode();
      if (unlistenTheme) unlistenTheme();
      if (unlistenAntiTouch) unlistenAntiTouch();
      if (unlistenNativeDragEnter) unlistenNativeDragEnter();
      if (unlistenEdgeShown) unlistenEdgeShown();
      unlistenPromise.then(unlisten => unlisten()).catch(() => {});
    };
  }, []);

  const isInsideVisibleEdgeStrip = (clientY: number) => {
    const stripHeight = 96;
    const centerY = window.innerHeight / 2;
    return Math.abs(clientY - centerY) <= stripHeight / 2;
  };

  const scheduleEdgeHoverOpen = (delay = EDGE_HOVER_OPEN_DELAY) => {
    // 普通鼠标悬停才展开；如果左键正按着经过小条，说明用户可能在拖选/拖动别的东西，不能误触发。
    if (
      antiTouchRef.current
      || triggerModeRef.current !== 'edge'
      || edgeStripDragRef.current.active
      || leftButtonDownRef.current
      || !shouldAllowTriggerHoverOpen(triggerShownAtRef.current)
    ) return;
    clearEdgeHoverOpenTimer();
    edgeHoverOpenTimerRef.current = window.setTimeout(() => {
      edgeHoverOpenTimerRef.current = null;
      if (
        edgeStripDragRef.current.active
        || antiTouchRef.current
        || triggerModeRef.current !== 'edge'
        || leftButtonDownRef.current
        || !shouldAllowTriggerHoverOpen(triggerShownAtRef.current)
      ) return;
      openDrawer(true);
    }, delay);
  };

  const handleEdgeMouseTouch = (e: React.MouseEvent | React.PointerEvent) => {
    if (antiTouchRef.current || edgeStripDragRef.current.active) return;
    if (isPrimaryModifier(e)) {
      // 按住 Ctrl 时进入“移动小条准备态”，不触发展开抽屉。
      clearEdgeHoverOpenTimer();
      return;
    }
    if ('buttons' in e && ((e.buttons & 1) === 1 || (e.buttons & 2) === 2)) {
      // 按住左键/右键经过侧边小条时不触发抽屉；文件拖拽会走 drag 事件单独展开。
      clearEdgeHoverOpenTimer();
      return;
    }
    // 普通悬停保留轻微延迟；Ctrl + 左键才允许移动小条。
    if (triggerModeRef.current === 'edge' && isInsideVisibleEdgeStrip(e.clientY)) scheduleEdgeHoverOpen();
  };

  const handleEdgeMouseLeave = () => {
    clearEdgeHoverOpenTimer();
  };

  useEffect(() => {
    const handleCtrlKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Control' || event.key === 'Meta' || isPrimaryModifier(event)) clearEdgeHoverOpenTimer();
    };
    window.addEventListener('keydown', handleCtrlKeyDown, true);
    document.addEventListener('keydown', handleCtrlKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleCtrlKeyDown, true);
      document.removeEventListener('keydown', handleCtrlKeyDown, true);
    };
  }, []);

  const startEdgeStripDrag = (e: React.PointerEvent | React.MouseEvent) => {
    if (antiTouchRef.current || triggerModeRef.current !== 'edge' || e.button !== 0 || !isPrimaryModifier(e)) return;
    clearEdgeHoverOpenTimer();
    e.preventDefault();
    e.stopPropagation();

    if (edgeStripDragRef.current.active) return;

    const startScreenY = e.screenY;
    const startY = getStoredEdgeStripY();
    const top = (window.screen as any).availTop || 0;
    const maxY = top + window.screen.availHeight - EDGE_STRIP_HEIGHT;
    let disposed = false;
    let moved = false;
    let latestY = startY;
    let frame: number | null = null;

    const applyPosition = () => {
      frame = null;
      const { height } = getStoredDrawerSize();
      void invoke('position_edge', { height, mode: 'edge', y: latestY })
        .then(() => refreshEdgeDropTargetsSoon(80))
        .catch(() => {});
    };

    const requestApplyPosition = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(applyPosition);
    };

    const cleanup = () => {
      window.removeEventListener('pointermove', handleMove, true);
      window.removeEventListener('pointerup', handleUp, true);
      window.removeEventListener('pointercancel', handleCancel, true);
      window.removeEventListener('mousemove', handleMove, true);
      window.removeEventListener('mouseup', handleUp, true);
      document.removeEventListener('pointermove', handleMove, true);
      document.removeEventListener('pointerup', handleUp, true);
      document.removeEventListener('pointercancel', handleCancel, true);
      document.removeEventListener('mousemove', handleMove, true);
      document.removeEventListener('mouseup', handleUp, true);
    };

    const finishDrag = () => {
      if (disposed) return;
      disposed = true;
      cleanup();
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      saveEdgeStripY(latestY);
      edgeStripDragRef.current = { active: false, moved, lastY: latestY };
      applyPosition();
    };

    const handleMove: EventListener = (ev) => {
      if (disposed) return;
      const me = ev as PointerEvent | MouseEvent;
      if ('buttons' in me && (me.buttons & 1) !== 1) {
        finishDrag();
        return;
      }
      const dy = me.screenY - startScreenY;
      if (!moved && Math.abs(dy) < 3) return;
      ev.preventDefault();
      ev.stopPropagation();
      moved = true;
      latestY = clamp(startY + dy, top, Math.max(top, maxY));
      edgeStripDragRef.current = { active: true, moved: true, lastY: latestY };
      requestApplyPosition();
    };

    const handleUp: EventListener = (ev) => {
      if (disposed) return;
      ev.preventDefault();
      ev.stopPropagation();
      finishDrag();
    };

    const handleCancel: EventListener = (ev) => {
      if (disposed) return;
      ev.preventDefault();
      ev.stopPropagation();
      finishDrag();
    };

    edgeStripDragRef.current = { active: true, moved: false, lastY: startY };

    try {
      const pointerEvent = e as React.PointerEvent;
      const target = e.currentTarget as HTMLElement;
      if ('pointerId' in pointerEvent && target && 'setPointerCapture' in target) {
        target.setPointerCapture(pointerEvent.pointerId);
      }
    } catch (_) {}

    window.addEventListener('pointermove', handleMove, true);
    window.addEventListener('pointerup', handleUp, true);
    window.addEventListener('pointercancel', handleCancel, true);
    window.addEventListener('mousemove', handleMove, true);
    window.addEventListener('mouseup', handleUp, true);
    document.addEventListener('pointermove', handleMove, true);
    document.addEventListener('pointerup', handleUp, true);
    document.addEventListener('pointercancel', handleCancel, true);
    document.addEventListener('mousemove', handleMove, true);
    document.addEventListener('mouseup', handleUp, true);
  };

  const handleEdgeFileDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (antiTouchRef.current) {
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
      return;
    }

    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';

    const isDrop = e.type === 'drop';
    const isWebImageOnly = hasWebImageDragData(e.dataTransfer);
    const hasPluginWebDrag = Boolean(activeBrowserDragIdRef.current);

    if (hasPluginWebDrag && isDrop) {
      clearFloatHoverOpenTimer();
      setBrowserDragState('saving');
      void invoke<boolean>('browser_extension_accept_current_web_drag')
        .then(accepted => {
          if (!accepted) {
            setBrowserDragState('error');
            void emitTo('edge', 'browser-extension-image-save-failed', { dragId: activeBrowserDragIdRef.current });
            return;
          }
          startDragOpenBurst();
        })
        .catch(error => {
          console.warn('browser extension web drag accept failed:', error);
          setBrowserDragState('error');
          void emitTo('edge', 'browser-extension-image-save-failed', { dragId: activeBrowserDragIdRef.current });
        });
      return;
    }

    if (hasPluginWebDrag) return;

    if (triggerModeRef.current === 'float' && !isDrop) {
      scheduleFloatHoverOpen(300, true);
      return;
    }

    if (isDrop) {
      clearFloatHoverOpenTimer();
      sendWebDropToMain(e.dataTransfer);
      startDragOpenBurst(e.dataTransfer);
      return;
    }

    if (!isWebImageOnly) startDragOpenBurst(e.dataTransfer);
  };

  const handleFloatHoverEnter = (e?: React.MouseEvent | React.PointerEvent) => {
    if (e && 'buttons' in e && (e.buttons & 1) === 1) return;
    // 普通鼠标悬停需要停留 0.8s 才展开；文件拖拽仍保持更快响应。
    scheduleFloatHoverOpen(FLOAT_HOVER_OPEN_DELAY, false);
  };

  const handleFloatHoverLeave = () => {
    clearFloatHoverOpenTimer();
  };

  const startFloatDrag = (e: React.PointerEvent | React.MouseEvent) => {
    // 悬浮方块：左键单击打开，左键按住拖动。
    // 这里不用原生 startDragging；透明小窗口下它容易失效。
    // 改成直接移动 edge 窗口，并用 pointer capture 保持拖动连续。
    if (antiTouchRef.current || e.button !== 0 || triggerModeRef.current !== 'float') return;
    clearFloatHoverOpenTimer();
    e.preventDefault();
    e.stopPropagation();

    if (floatDragRef.current.active) return;

    const startScreenX = e.screenX;
    const startScreenY = e.screenY;
    const startLogical = getStoredFloatPosition();

    let disposed = false;
    let moved = false;
    let latestLogical = { ...startLogical };
    let frame: number | null = null;

    const moveFloatWindowTo = (pos: { x: number; y: number }) => {
      void appWindow.setPosition(new LogicalPosition(Math.round(pos.x), Math.round(pos.y)));
    };

    const applyLatestPosition = () => {
      frame = null;
      if (disposed) return;
      moveFloatWindowTo(latestLogical);
    };

    const requestApplyPosition = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(applyLatestPosition);
    };

    const cleanupListeners = () => {
      window.removeEventListener('pointermove', handleMove, true);
      window.removeEventListener('pointerup', handleUp, true);
      window.removeEventListener('pointercancel', handleCancel, true);
      window.removeEventListener('mousemove', handleMove, true);
      window.removeEventListener('mouseup', handleUp, true);
      document.removeEventListener('pointermove', handleMove, true);
      document.removeEventListener('pointerup', handleUp, true);
      document.removeEventListener('pointercancel', handleCancel, true);
      document.removeEventListener('mousemove', handleMove, true);
      document.removeEventListener('mouseup', handleUp, true);
    };

    const finishDrag = () => {
      if (disposed) return;
      disposed = true;
      cleanupListeners();

      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
        moveFloatWindowTo(latestLogical);
      }

      saveFloatPosition(latestLogical.x, latestLogical.y);
      floatVisualPosRef.current = latestLogical;
      setFloatVisualPos(latestLogical);
      setIsFloatDragOverlay(false);
      setFloatOverlayOrigin({ x: 0, y: 0 });
      floatDragRef.current = { active: false, moved: false, lastX: 0, lastY: 0 };

      void invoke('position_edge', {
        height: FLOAT_TRIGGER_SIZE,
        mode: 'float',
        x: latestLogical.x,
        y: latestLogical.y,
      })
        .then(() => refreshEdgeDropTargetsSoon())
        .catch(() => {});
    };

    const finishAsClick = () => {
      if (disposed) return;
      disposed = true;
      cleanupListeners();
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      setIsFloatDragOverlay(false);
      setFloatOverlayOrigin({ x: 0, y: 0 });
      floatDragRef.current = { active: false, moved: false, lastX: 0, lastY: 0 };
      openDrawer(true);
    };

    const handleMove: EventListener = (ev) => {
      if (disposed) return;
      const me = ev as PointerEvent | MouseEvent;

      if ('buttons' in me && (me.buttons & 1) !== 1) {
        handleUp(ev);
        return;
      }

      const dx = me.screenX - startScreenX;
      const dy = me.screenY - startScreenY;
      const distance = Math.hypot(dx, dy);
      if (!moved && distance < 3) return;

      ev.preventDefault();
      ev.stopPropagation();

      moved = true;
      floatDragRef.current.moved = true;
      latestLogical = { x: startLogical.x + dx, y: startLogical.y + dy };
      requestApplyPosition();
    };

    const handleUp: EventListener = (ev) => {
      if (disposed) return;
      ev.preventDefault();
      ev.stopPropagation();

      if (moved) finishDrag();
      else finishAsClick();
    };

    const handleCancel: EventListener = (ev) => {
      if (disposed) return;
      ev.preventDefault();
      ev.stopPropagation();
      finishDrag();
    };

    floatDragRef.current = {
      active: true,
      moved: false,
      lastX: e.screenX,
      lastY: e.screenY,
    };
    setIsFloatDragOverlay(false);
    setFloatOverlayOrigin({ x: 0, y: 0 });

    try {
      const pointerEvent = e as React.PointerEvent;
      const target = e.currentTarget as HTMLElement;
      if ('pointerId' in pointerEvent && target && 'setPointerCapture' in target) {
        target.setPointerCapture(pointerEvent.pointerId);
      }
    } catch (_) {}

    window.addEventListener('pointermove', handleMove, true);
    window.addEventListener('pointerup', handleUp, true);
    window.addEventListener('pointercancel', handleCancel, true);
    window.addEventListener('mousemove', handleMove, true);
    window.addEventListener('mouseup', handleUp, true);
    document.addEventListener('pointermove', handleMove, true);
    document.addEventListener('pointerup', handleUp, true);
    document.addEventListener('pointercancel', handleCancel, true);
    document.addEventListener('mousemove', handleMove, true);
    document.addEventListener('mouseup', handleUp, true);
  };

  if (triggerMode === 'float') {
    const browserDragVisualClass = browserDragState === 'ready'
      ? 'bg-amber-500 border-amber-300 dark:bg-amber-400 dark:border-amber-300/55'
      : browserDragState === 'success'
      ? 'bg-emerald-500 border-emerald-300 dark:bg-emerald-400 dark:border-emerald-300/55'
      : browserDragState === 'error'
      ? 'bg-red-500 border-red-300 dark:bg-red-400 dark:border-red-300/55'
      : 'bg-blue-500 border-blue-300/80 dark:bg-blue-400 dark:border-blue-300/55';
    const BrowserDragIcon = browserDragState === 'success'
      ? Check
      : browserDragState === 'error'
      ? X
      : browserDragState === 'ready' || browserDragState === 'saving'
      ? ImageIcon
      : Lightbulb;
    return (
      <div
        className={`${isDark ? 'dark' : ''} w-screen h-screen bg-transparent relative overflow-hidden font-sans select-none pointer-events-auto ${isFloatDragOverlay ? '' : 'rounded-[22px]'}`}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onAuxClick={(e) => { if (e.button === 2) { e.preventDefault(); e.stopPropagation(); } }}
        onMouseEnter={handleFloatHoverEnter}
        onPointerEnter={handleFloatHoverEnter}
        onMouseLeave={handleFloatHoverLeave}
        onPointerLeave={handleFloatHoverLeave}
        onDragEnter={handleEdgeFileDrag}
        onDragOver={handleEdgeFileDrag}
        onDragLeave={handleFloatHoverLeave}
        onDrop={handleEdgeFileDrag}
      >
        <button
          className={`absolute rounded-[22px] overflow-hidden isolate ${browserDragVisualClass} text-white dark:text-stone-950 backdrop-blur-xl border shadow-xl shadow-black/18 flex items-center justify-center cursor-pointer opacity-100 transition-[transform,background-color,border-color] ${isFloatDragOverlay ? 'shadow-2xl' : 'hover:scale-[1.03] active:scale-95'}`}
          style={isFloatDragOverlay ? { left: floatVisualPos.x - floatOverlayOrigin.x, top: floatVisualPos.y - floatOverlayOrigin.y, width: FLOAT_TRIGGER_SIZE, height: FLOAT_TRIGGER_SIZE } : { left: 0, top: 0, width: FLOAT_TRIGGER_SIZE, height: FLOAT_TRIGGER_SIZE }}
          title={browserDragState === 'ready' ? '松开即可收取当前网页图片' : browserDragState === 'saving' ? '正在保存网页图片' : browserDragState === 'success' ? '网页图片已保存' : browserDragState === 'error' ? '网页图片保存失败' : '左键单击打开抽屉，按住左键拖动悬浮方块，拖入文件也可打开'}
          onClick={(e) => {
            // 左键单击打开已在 pointerup/mouseup 中处理，这里只阻止冒泡，避免重复打开。
            e.preventDefault();
            e.stopPropagation();
          }}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onAuxClick={(e) => { if (e.button === 2) { e.preventDefault(); e.stopPropagation(); } }}
          onMouseEnter={handleFloatHoverEnter}
          onPointerEnter={handleFloatHoverEnter}
          onMouseLeave={handleFloatHoverLeave}
          onPointerLeave={handleFloatHoverLeave}
          onPointerDown={startFloatDrag}
          onMouseDown={startFloatDrag}
          onDragEnter={handleEdgeFileDrag}
          onDragOver={handleEdgeFileDrag}
          onDragLeave={handleFloatHoverLeave}
          onDrop={handleEdgeFileDrag}
        >
          <BrowserDragIcon className={`w-5 h-5 text-white dark:text-stone-950 pointer-events-none ${browserDragState === 'saving' ? 'animate-pulse' : ''}`} />
          <span className="absolute right-2 bottom-2 w-2 h-2 rounded-full bg-cyan-200 dark:bg-cyan-100 shadow-[0_0_8px_rgba(34,211,238,0.7)] pointer-events-none" />
        </button>
      </div>
    );
  }

  const browserStripVisualClass = browserDragState === 'ready'
    ? 'bg-amber-500/95 dark:bg-amber-400/95 border-amber-300/75 dark:border-amber-300/55'
    : browserDragState === 'success'
    ? 'bg-emerald-500/95 dark:bg-emerald-400/95 border-emerald-300/75 dark:border-emerald-300/55'
    : browserDragState === 'error'
    ? 'bg-red-500/95 dark:bg-red-400/95 border-red-300/75 dark:border-red-300/55'
    : 'bg-blue-500/95 dark:bg-blue-400/95 border-blue-300/75 dark:border-blue-300/55';

  return (
    <div
      className={`${isDark ? 'dark' : ''} w-screen h-screen bg-transparent relative overflow-hidden font-sans select-none pointer-events-none`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 侧边小条窗口本身只有可见高度；Ctrl + 左键按住可沿屏幕右侧上下移动。 */}
      <div
        className={`absolute left-0 top-1/2 -translate-y-1/2 w-full h-24 flex flex-col justify-center cursor-ns-resize ${isAntiTouchMode ? 'pointer-events-none' : 'pointer-events-auto'}`}
        title="悬停打开抽屉；Ctrl + 左键按住可上下移动小条"
        onMouseEnter={handleEdgeMouseTouch}
        onMouseOver={handleEdgeMouseTouch}
        onPointerEnter={handleEdgeMouseTouch}
        onPointerOver={handleEdgeMouseTouch}
        onMouseLeave={handleEdgeMouseLeave}
        onPointerLeave={handleEdgeMouseLeave}
        onPointerDown={startEdgeStripDrag}
        onMouseDown={startEdgeStripDrag}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onAuxClick={(e) => { if (e.button === 2) { e.preventDefault(); e.stopPropagation(); } }}
        onDragEnter={handleEdgeFileDrag}
        onDragOver={handleEdgeFileDrag}
        onDrop={handleEdgeFileDrag}
      >
        <div className={`w-full h-24 ${browserStripVisualClass} backdrop-blur-2xl rounded-l-[24px] shadow-sm shadow-black/18 border border-r-0 flex items-center justify-center cursor-pointer transition-colors`}>
          <div className="w-1.5 h-10 bg-white/90 dark:bg-stone-950/85 rounded-full shadow-inner shadow-blue-200/50" />
        </div>
      </div>
    </div>
  );
}
