const caches = new WeakMap<HTMLElement, Map<string, HTMLElement>>();

export const getCanvasItemElementFromContent = (content: HTMLElement | null, id: string): HTMLElement | null => {
  if (!content) return null;
  let cache = caches.get(content);
  if (!cache) { cache = new Map(); caches.set(content, cache); }
  const cached = cache.get(id);
  if (cached && content.contains(cached) && cached.dataset.canvasItemId === id) return cached;
  cache.delete(id);
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id.replace(/["\\]/g, '\\$&');
  const element = content.querySelector<HTMLElement>(`[data-canvas-item-id="${escaped}"]`);
  if (element) {
    // Bound references to detached virtualized nodes during a long session.
    if (cache.size >= 1024) {
      for (const [key, value] of cache) if (!content.contains(value)) cache.delete(key);
      if (cache.size >= 1024) cache.delete(cache.keys().next().value!);
    }
    cache.set(id, element);
  }
  return element;
};
