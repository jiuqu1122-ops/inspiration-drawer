export const CANVAS_CHAT_TOP_VAR = '--canvas-chat-top';

export function syncCanvasChatTop(main: HTMLElement, chrome: HTMLElement) {
  const height = Math.max(0, Math.round(chrome.getBoundingClientRect().height));
  main.style.setProperty(CANVAS_CHAT_TOP_VAR, `${height}px`);
}

export function observeCanvasChatTop(chrome: HTMLElement): () => void {
  const main = chrome.closest('[data-drawer-main="true"]') as HTMLElement | null;
  if (!main) return () => {};

  const sync = () => syncCanvasChatTop(main, chrome);
  sync();

  if (typeof ResizeObserver === 'undefined') {
    return () => {
      main.style.removeProperty(CANVAS_CHAT_TOP_VAR);
    };
  }

  const observer = new ResizeObserver(sync);
  observer.observe(chrome);
  return () => {
    observer.disconnect();
    main.style.removeProperty(CANVAS_CHAT_TOP_VAR);
  };
}
