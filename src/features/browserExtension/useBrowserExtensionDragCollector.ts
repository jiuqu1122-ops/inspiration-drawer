import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef } from 'react';
import type { BrowserExtensionDragPayload, BrowserExtensionDropContext } from './types';

export function useBrowserExtensionDragCollector(
  onImageDropCommitted: (
    payload: BrowserExtensionDragPayload,
    context: BrowserExtensionDropContext,
  ) => void | Promise<void>,
) {
  const callbackRef = useRef(onImageDropCommitted);
  const activeDragIdRef = useRef('');
  const pendingDropContextRef = useRef<BrowserExtensionDropContext | null>(null);
  useEffect(() => { callbackRef.current = onImageDropCommitted; }, [onImageDropCommitted]);

  useEffect(() => {
    const unlisteners: Array<Promise<() => void>> = [];
    unlisteners.push(listen<{ dragId?: string }>('browser-extension-image-drag-started', event => {
      activeDragIdRef.current = String(event.payload?.dragId || '');
      pendingDropContextRef.current = null;
    }));
    unlisteners.push(listen<{ dragId?: string }>('browser-extension-image-drag-cancelled', event => {
      if (!event.payload?.dragId || activeDragIdRef.current === event.payload.dragId) {
        activeDragIdRef.current = '';
        pendingDropContextRef.current = null;
      }
    }));
    unlisteners.push(listen<BrowserExtensionDragPayload>('browser-extension-image-drop-committed', event => {
      const context = pendingDropContextRef.current || { target: 'drawer' as const };
      activeDragIdRef.current = '';
      pendingDropContextRef.current = null;
      void Promise.resolve(callbackRef.current(event.payload, context)).catch(error => {
        console.warn('browser extension image import failed:', error);
      });
    }));

    const acceptPluginDrop = (event: DragEvent) => {
      if (!activeDragIdRef.current) return;
      const target = event.target instanceof Element ? event.target : null;
      const folderDrop = target?.closest<HTMLElement>('[data-folder-drop-id]');
      const canvasDrop = target?.closest<HTMLElement>('[data-canvas-surface="true"]');
      pendingDropContextRef.current = {
        target: canvasDrop ? 'canvas' : 'drawer',
        clientX: event.clientX,
        clientY: event.clientY,
        folderId: folderDrop?.dataset.folderDropId && folderDrop.dataset.folderDropId !== 'all'
          ? folderDrop.dataset.folderDropId
          : undefined,
      };
      event.preventDefault();
      event.stopImmediatePropagation();
      void invoke<boolean>('browser_extension_accept_current_web_drag').then(accepted => {
        if (!accepted) pendingDropContextRef.current = null;
      }).catch(error => {
        pendingDropContextRef.current = null;
        console.warn('browser extension drag accept failed:', error);
      });
    };
    document.addEventListener('drop', acceptPluginDrop, true);

    return () => {
      document.removeEventListener('drop', acceptPluginDrop, true);
      unlisteners.forEach(unlisten => { void unlisten.then(dispose => dispose()); });
      activeDragIdRef.current = '';
      pendingDropContextRef.current = null;
    };
  }, []);
}
