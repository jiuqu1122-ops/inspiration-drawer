export const SNAPSHOT_TOTAL_TILE_PIXELS = 12_000_000;
const MAX_TILE_PIXELS = 2_000_000;

/** Preserve backing-store budgets of existing world tiles on insertion. A new
 * tile consumes headroom first; when full, shrink only the largest allocations
 * needed for admission, rather than halving every existing tile at a power of 2.
 * The returned sum stays under the hard total, including all mixed raster runs. */
export const allocateSnapshotTileBudgets = (keys: readonly string[], previous: ReadonlyMap<string, number>, total = SNAPSHOT_TOTAL_TILE_PIXELS): Map<string, number> => {
  const unique = [...new Set(keys)];
  if (!unique.length) return new Map();
  const cap = Number.isFinite(total) ? Math.max(unique.length, Math.floor(total)) : SNAPSHOT_TOTAL_TILE_PIXELS;
  const desired = Math.max(1, Math.min(MAX_TILE_PIXELS, Math.floor(cap / 2 ** Math.ceil(Math.log2(unique.length)))));
  const result = new Map<string, number>();
  const missing: string[] = [];
  let used = 0;
  for (const key of unique) {
    const budget = previous.get(key);
    if (budget !== undefined && Number.isFinite(budget) && budget >= 1) {
      const value = Math.min(MAX_TILE_PIXELS, Math.floor(budget)); result.set(key, value); used += value;
    } else missing.push(key);
  }
  let deficit = Math.max(0, used + desired * missing.length - cap);
  if (deficit) for (const [key, value] of [...result].sort((a, b) => b[1] - a[1])) {
    const freed = Math.min(deficit, value - 1);
    result.set(key, value - freed); used -= freed; deficit -= freed;
    if (!deficit) break;
  }
  const available = Math.max(0, cap - used);
  const allocation = Math.max(1, Math.min(desired, Math.floor(available / Math.max(1, missing.length))));
  for (const key of missing) result.set(key, allocation);
  return result;
};
