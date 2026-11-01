/** Keep one transform shape throughout a wheel burst and its settle phase.
 * Live CSS variables are not overwritten by an unrelated React commit.
 * Deliberately use 2D translate: a huge 3D canvas can exhaust GPU tile memory.
 */
export const CANVAS_CONTENT_TRANSFORM = 'translate(var(--canvas-offset-x, 0px), var(--canvas-offset-y, 0px)) scale(var(--canvas-live-scale, var(--canvas-render-scale, 1)))';
export const applyCanvasContentTransform = (
  content: HTMLElement,
  scale: number,
  offsetX = 0,
  offsetY = 0,
) => {
  content.style.setProperty('--canvas-live-scale', String(scale));
  content.style.setProperty('--canvas-offset-x', `${offsetX}px`);
  content.style.setProperty('--canvas-offset-y', `${offsetY}px`);
  // Also serves isolated callers and restored DOM nodes, without changing shape.
  if (content.style.transform !== CANVAS_CONTENT_TRANSFORM) content.style.transform = CANVAS_CONTENT_TRANSFORM;
};

type Swap = { source: string; promise: Promise<boolean>; cancel: () => void };
const swaps = new WeakMap<HTMLImageElement, Swap>();
export const cancelCanvasImageSwap = (element: HTMLImageElement) => swaps.get(element)?.cancel();

/** Decode offscreen before replacing visible pixels. Last request wins. */
export const swapCanvasImageAfterDecode = (element: HTMLImageElement, source: string): Promise<boolean> => {
  if (!source || !element.isConnected) return Promise.resolve(false);
  const pending = swaps.get(element);
  if (pending?.source === source) return pending.promise;
  pending?.cancel();
  if (element.getAttribute('src') === source) return Promise.resolve(true);
  const previousSource = element.getAttribute('src');
  const image = new Image();
  image.decoding = 'async';
  let finish: (ok: boolean) => void = () => {};
  const promise = new Promise<boolean>(resolve => { finish = resolve; });
  const state: Swap = { source, promise, cancel: () => settle(false) };
  let settled = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const settle = (ok: boolean) => {
    if (settled) return;
    settled = true;
    if (timeout !== undefined) clearTimeout(timeout);
    const current = swaps.get(element) === state;
    const canApply = current && ok && element.isConnected && element.getAttribute('src') === previousSource;
    if (canApply) element.setAttribute('src', source);
    if (current) swaps.delete(element);
    image.onload = null;
    image.onerror = null;
    image.removeAttribute('src');
    finish(canApply);
  };
  swaps.set(element, state);
  timeout = setTimeout(() => settle(false), 15_000);
  image.onerror = () => settle(false);
  image.onload = () => {
    if (typeof image.decode !== 'function') settle(true);
  };
  image.src = source;
  if (typeof image.decode === 'function') {
    void image.decode().then(() => settle(true), () => settle(false));
  }
  return promise;
};


/** A snapshot canvas is pixels, never an <img> source-upgrade target. The
 * selected node can contain both a cached canvas and its resting original;
 * query the actual media type instead of writing a meaningless src on canvas. */
export const applyCanvasMediaSourceToNode = (root: Element | null | undefined, source: string): void => {
  const media = root?.querySelector<HTMLImageElement | HTMLVideoElement>(
    'img[data-canvas-main-media="true"], video[data-canvas-main-media="true"]',
  );
  if (!media || !source) return;
  if (media.tagName === 'IMG') void swapCanvasImageAfterDecode(media as HTMLImageElement, source);
  else if (media.tagName === 'VIDEO' && media.getAttribute('src') !== source) media.setAttribute('src', source);
};
