import type { SnapshotBitmapCache } from './snapshotBitmapCache';

const SNAPSHOT_TIERS = [512, 256, 128] as const;

/** Return residency separately from a cold source's preferred tier so planning
 * never repeats a peek (and its potentially large data-URL cache key). */
const findResidentSnapshotTier = (
  cache: Pick<SnapshotBitmapCache, 'peek'>,
  source: string,
  preferred: number,
  previous?: number,
): number | undefined => {
  const previousTier = SNAPSHOT_TIERS.find(tier => tier === previous);
  if (previousTier !== undefined && cache.peek(source, previousTier)) return previousTier;
  if (preferred !== previousTier && cache.peek(source, preferred)) return preferred;
  for (const tier of SNAPSHOT_TIERS) {
    if (tier !== preferred && tier !== previousTier && cache.peek(source, tier)) return tier;
  }
  return undefined;
};

/** Keep a resident previous tier across density changes, then prefer preferred,
 * then the highest resident overview tier. Never trust stale previous metadata.
 * Only peeks: no decoding, LRU updates, or reads of bitmap properties. */
export const pickResidentSnapshotTier = (
  cache: Pick<SnapshotBitmapCache, 'peek'>,
  source: string,
  preferred: number,
  previous?: number,
): number => findResidentSnapshotTier(cache, source, preferred, previous) ?? preferred;

/** Plan once per structural/admission change, not on every cache-ready version.
 * sources is the already-capped id -> source map from planSnapshotResidency;
 * previousTiers and returned tiers are keyed by exact source, not node id.
 * Prune departed sources and probe aliases only once without serializing URLs.
 * A tier entry may still be pending; callers must peek before marking it ready. */
export const planIncrementalSnapshotRequests = (
  cache: Pick<SnapshotBitmapCache, 'peek'>,
  sources: ReadonlyMap<string, string>,
  preferred: number,
  previousTiers: ReadonlyMap<string, number>,
): { tiers: Map<string, number>; pending: Array<{ source: string; maxEdge: number }> } => {
  const tiers = new Map<string, number>();
  const pending: Array<{ source: string; maxEdge: number }> = [];
  for (const source of sources.values()) {
    if (tiers.has(source)) continue;
    const resident = findResidentSnapshotTier(cache, source, preferred, previousTiers.get(source));
    const tier = resident ?? preferred;
    tiers.set(source, tier);
    if (resident === undefined) pending.push({ source, maxEdge: preferred });
  }
  return { tiers, pending };
};
