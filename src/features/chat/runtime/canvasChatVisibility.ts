import { useSyncExternalStore } from 'react';

let canvasChatVisible = false;
let canvasChatSidebarWidth = 480;
const listeners = new Set<() => void>();

const syncCanvasChatOffset = () => {
  if (typeof document === 'undefined') return;
  const offset = canvasChatVisible ? canvasChatSidebarWidth : 0;
  document.querySelectorAll<HTMLElement>('[data-canvas-chat-offset-base]').forEach(element => {
    const base = Number(element.dataset.canvasChatOffsetBase || 0);
    element.style.right = `${Math.max(0, base + offset)}px`;
  });
};

export const getCanvasChatVisibility = () => canvasChatVisible;
export const getCanvasChatSidebarWidth = () => canvasChatSidebarWidth;
export const getCanvasChatOffsetRight = (base: number) => (
  base + (canvasChatVisible ? canvasChatSidebarWidth : 0)
);

export const subscribeCanvasChatVisibility = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const setCanvasChatVisibility = (visible: boolean) => {
  if (canvasChatVisible === visible) return;
  canvasChatVisible = visible;
  syncCanvasChatOffset();
  listeners.forEach(listener => listener());
};

export const toggleCanvasChatVisibility = () => {
  setCanvasChatVisibility(!canvasChatVisible);
};

export const setCanvasChatSidebarWidth = (width: number) => {
  if (!Number.isFinite(width) || width <= 0 || canvasChatSidebarWidth === width) return;
  canvasChatSidebarWidth = width;
  if (canvasChatVisible) syncCanvasChatOffset();
};

export const useCanvasChatVisibility = () => useSyncExternalStore(
  subscribeCanvasChatVisibility,
  getCanvasChatVisibility,
  () => false,
);

syncCanvasChatOffset();
