/** Reuse a committed render array only when its ordered contents are unchanged.
 * This helper never mutates either input or stores a render-time cache.
 * Callers publish the returned array after commit, not during render.
 */
export const reuseCanvasRenderArray = <T>(
  previous: T[] | null,
  next: T[],
  sameEntry: (previous: T, next: T) => boolean = Object.is,
): T[] => {
  if (previous === null || previous.length !== next.length) return next;
  if (previous === next) return previous;
  return previous.every((entry, index) => sameEntry(entry, next[index])) ? previous : next;
};

/** Connection wrappers are rebuilt when unrelated nodes change. The ordered
 * endpoint object references, not IDs, determine whether render data changed.
 */
export const haveSameCanvasConnectionEndpoints = (
  previous: { source: unknown; target: unknown },
  next: { source: unknown; target: unknown },
): boolean => previous.source === next.source && previous.target === next.target;
