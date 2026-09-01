import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useRef } from 'react';
import type { BrowserExtensionDragPayload } from './types';

export function useBrowserExtensionDragCollector(
  onImageDragStarted: (payload: BrowserExtensionDragPayload) => void,
) {
  const callbackRef = useRef(onImageDragStarted);
  useEffect(() => { callbackRef.current = onImageDragStarted; }, [onImageDragStarted]);

  useEffect(() => {
    const unlisten = listen<BrowserExtensionDragPayload>('browser-extension-image-drag-started', async event => {
      await invoke('open_drawer').catch(() => {});
      callbackRef.current(event.payload);
    });
    return () => { void unlisten.then(dispose => dispose()); };
  }, []);
}
