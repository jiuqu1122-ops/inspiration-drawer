import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { emitTo, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getStoredDrawerSize } from '../features/drawerPrefs';
import { getStoredTriggerMode } from '../features/triggerModel';
import { acquireTimedLocalLock, localLockKeyPart } from '../features/localLock';

export const SNIP_RESTORE_DRAWER_STORAGE_KEY = 'drawer_snip_restore_drawer';
export const SNIP_CAPTURE_LOCK_STORAGE_KEY = 'drawer_snip_capture_lock';

const appWindow = getCurrentWindow();

export function SnipOverlay() {
  const [selection, setSelection] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [isCaptureOverlayHidden, setIsCaptureOverlayHidden] = useState(false);
  const isMouseDownRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });
  const captureInFlightRef = useRef(false);

  const waitForTransparentSnipFrame = () => new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      window.setTimeout(resolve, 0);
    });
  });

  const recoverAfterSnip = async () => {
    const size = getStoredDrawerSize();
    const mode = getStoredTriggerMode();
    const restoreDrawer = localStorage.getItem(SNIP_RESTORE_DRAWER_STORAGE_KEY) === 'true';
    await invoke('recover_after_snip', {
      restoreDrawer,
      width: size.width,
      height: size.height,
      mode,
    }).catch(() => invoke('hide_snip_window').catch(() => appWindow.hide().catch(() => {})));
  };

  const cancelSnip = async () => {
    if (captureInFlightRef.current) return;
    isMouseDownRef.current = false;
    setIsCaptureOverlayHidden(false);
    setSelection(null);
    await emitTo('main', 'snip-cancelled', {}).catch(() => {});
    await recoverAfterSnip();
  };

  useEffect(() => {
    const unlisteners: Array<() => void> = [];
    listen('snip-reset', () => {
      captureInFlightRef.current = false;
      isMouseDownRef.current = false;
      setIsCaptureOverlayHidden(false);
      setSelection(null);
    }).then(unlisten => unlisteners.push(unlisten));

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      void cancelSnip();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      unlisteners.forEach(unlisten => unlisten());
    };
  }, []);

  const finishSelection = async (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isMouseDownRef.current || captureInFlightRef.current) return;
    isMouseDownRef.current = false;
    const rect = selection;
    if (!rect || rect.w < 10 || rect.h < 10) {
      await cancelSnip();
      return;
    }
    const selectionLockKey = `${SNIP_CAPTURE_LOCK_STORAGE_KEY}_selection_${localLockKeyPart([
      Math.round(rect.x),
      Math.round(rect.y),
      Math.round(rect.w),
      Math.round(rect.h),
      Math.round(window.innerWidth),
      Math.round(window.innerHeight),
    ].join('_'))}`;
    const selectionLockOwner = acquireTimedLocalLock(selectionLockKey, 5000);
    if (!selectionLockOwner) return;

    const noteX = event.screenX - (event.clientX - rect.x);
    const noteY = event.screenY - (event.clientY - rect.y);
    captureInFlightRef.current = true;
    flushSync(() => {
      setIsCaptureOverlayHidden(true);
      setSelection(null);
    });
    await waitForTransparentSnipFrame();

    const payload = {
      x: rect.x,
      y: rect.y,
      width: rect.w,
      height: rect.h,
      noteX,
      noteY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
    try {
      const size = getStoredDrawerSize();
      const mode = getStoredTriggerMode();
      const restoreDrawer = localStorage.getItem(SNIP_RESTORE_DRAWER_STORAGE_KEY) === 'true';
      await invoke('complete_snip_selection', {
        ...payload,
        restoreDrawer,
        drawerWidth: size.width,
        drawerHeight: size.height,
        mode,
      });
    } catch (err) {
      await emitTo('main', 'snip-failed', { message: err instanceof Error ? err.message : String(err) }).catch(() => {});
      await recoverAfterSnip();
    } finally {
      captureInFlightRef.current = false;
      setIsCaptureOverlayHidden(false);
      setSelection(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] cursor-crosshair select-none bg-transparent"
      onContextMenu={(event) => {
        event.preventDefault();
        void cancelSnip();
      }}
      onMouseDown={(event) => {
        if (event.button !== 0 || captureInFlightRef.current) return;
        isMouseDownRef.current = true;
        setIsCaptureOverlayHidden(false);
        startRef.current = { x: event.clientX, y: event.clientY };
        setSelection({ x: event.clientX, y: event.clientY, w: 0, h: 0 });
      }}
      onMouseMove={(event) => {
        if (!isMouseDownRef.current || captureInFlightRef.current) return;
        const x = Math.min(event.clientX, startRef.current.x);
        const y = Math.min(event.clientY, startRef.current.y);
        const w = Math.abs(event.clientX - startRef.current.x);
        const h = Math.abs(event.clientY - startRef.current.y);
        setSelection({ x, y, w, h });
      }}
      onMouseUp={finishSelection}
    >
      {isCaptureOverlayHidden ? null : selection ? (
        <>
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute left-0 right-0 top-0 bg-black/38" style={{ height: selection.y }} />
            <div className="absolute left-0 bg-black/38" style={{ top: selection.y, width: selection.x, height: selection.h }} />
            <div className="absolute right-0 bg-black/38" style={{ top: selection.y, left: selection.x + selection.w, height: selection.h }} />
            <div className="absolute left-0 right-0 bottom-0 bg-black/38" style={{ top: selection.y + selection.h }} />
          </div>
          <div
            className="absolute pointer-events-none rounded-[4px] border-2 border-emerald-400 shadow-[0_0_0_1px_rgba(255,255,255,0.7)]"
            style={{ left: selection.x, top: selection.y, width: selection.w, height: selection.h }}
          >
            <div className="absolute inset-0 bg-white/10" />
            <div className="absolute -top-7 right-0 rounded-md bg-emerald-500/95 px-2 py-1 text-[10px] font-semibold text-white shadow-lg whitespace-nowrap">
              {Math.max(0, Math.round(selection.w))} x {Math.max(0, Math.round(selection.h))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="absolute inset-0 bg-black/38 pointer-events-none" />
          <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-black/55 px-4 py-2 text-[12px] font-medium text-white shadow-lg pointer-events-none backdrop-blur-sm">
            Drag to capture, Esc to cancel
          </div>
        </>
      )}
    </div>
  );
}
