import { describe, expect, it } from 'vitest';
import type { CanvasImageItem } from '../../canvasModel';
import { planSnapshotResidency, SNAPSHOT_MAX_RESIDENT_SOURCES } from './snapshotResidency';
import {
  getSnapshotBitmapCacheKey, type SnapshotBitmap, type SnapshotBitmapCache,
} from './snapshotBitmapCache';
import { pickResidentSnapshotTier, planIncrementalSnapshotRequests } from './snapshotIncrementalResidency';

/** Deterministic, synchronous residency only: no decoder, DOM, timers, or requests. */
const fakeCache = () => {
  const resident = new Map<string, SnapshotBitmap>();
  const calls: Array<{ source: string; maxEdge: number | undefined }> = [];
  const admissions: Array<{ source: string; maxEdge: number }> = [];
  let version = 0;
  const cache: Pick<SnapshotBitmapCache, 'peek'> = {
    peek: (source, maxEdge) => {
      calls.push({ source, maxEdge });
      return resident.get(getSnapshotBitmapCacheKey(source, maxEdge)) ?? null;
    },
  };
  const add = (source: string, maxEdge: number) => {
    const key = getSnapshotBitmapCacheKey(source, maxEdge);
    if (resident.has(key)) return;
    resident.set(key, { key, drawable: {} as CanvasImageSource,
      width: maxEdge, height: maxEdge, bytes: maxEdge * maxEdge * 4 });
    admissions.push({ source, maxEdge });
    version += 1;
  };
  const evict = (source: string, maxEdge: number) => {
    if (resident.delete(getSnapshotBitmapCacheKey(source, maxEdge))) version += 1;
  };
  return { cache, calls, resident, admissions, add, evict, get version() { return version; } };
};

const sourceMap = (count: number): Map<string, string> => new Map(
  Array.from({ length: count }, (_, i) => [`node-${i}`, `source-${i}`]),
);

describe('pickResidentSnapshotTier', () => {
  it.each([256, 128])('retains previous 512 even when preferred %i is also resident', preferred => {
    const { cache, add } = fakeCache();
    add('original', 512); add('original', preferred);
    expect(pickResidentSnapshotTier(cache, 'original', preferred, 512)).toBe(512);
  });

  it('keeps a smaller previous tier instead of upgrading an already-ready source', () => {
    const { cache, add } = fakeCache();
    add('source', 128); add('source', 512);
    expect(pickResidentSnapshotTier(cache, 'source', 512, 128)).toBe(128);
  });

  it('prefers the preferred tier over other resident tiers without a resident previous tier', () => {
    const { cache, add } = fakeCache();
    add('source', 512); add('source', 256);
    expect(pickResidentSnapshotTier(cache, 'source', 256)).toBe(256);
    expect(pickResidentSnapshotTier(cache, 'source', 256, 128)).toBe(256);
  });

  it.each([
    { resident: [512, 256], preferred: 128, expected: 512 },
    { resident: [256, 128], preferred: 512, expected: 256 },
    { resident: [128], preferred: 256, expected: 128 },
  ])('falls back in 512/256/128 order: $resident', ({ resident, preferred, expected }) => {
    const { cache, add } = fakeCache();
    for (const tier of resident) add('source', tier);
    expect(pickResidentSnapshotTier(cache, 'source', preferred)).toBe(expected);
  });

  it.each([512, 256, 128])('returns preferred %i when all tiers are missing', preferred => {
    const { cache } = fakeCache();
    expect(pickResidentSnapshotTier(cache, 'missing', preferred, 512)).toBe(preferred);
  });

  it.each([NaN, Infinity, -Infinity, -1, 0, 129, 512.9, 1024])(
    'ignores invalid previous tier %s, including cache-key normalization aliases', previous => {
      const { cache, add, calls } = fakeCache();
      add('source', 512); add('source', 256); add('source', 1024);
      expect(pickResidentSnapshotTier(cache, 'source', 256, previous)).toBe(256);
      expect(calls).toEqual([{ source: 'source', maxEdge: 256 }]);
    },
  );

  it('ignores an invalid previous tier and still searches all valid fallback tiers', () => {
    const { cache, add } = fakeCache();
    add('source', 512);
    expect(pickResidentSnapshotTier(cache, 'source', 128, 512.9)).toBe(512);
  });
});

describe('planIncrementalSnapshotRequests', () => {
  it.each([
    { before: 80, previousTier: 512, preferred: 256 },
    { before: 256, previousTier: 256, preferred: 128 },
    { before: 256, previousTier: 512, preferred: 128 },
  ])('requests only the added source at $before -> next / preferred $preferred',
    ({ before, previousTier, preferred }) => {
      const fake = fakeCache();
      const { cache, add, resident, calls, admissions } = fake;
      const sources = sourceMap(before + 1);
      const previous = new Map<string, number>();
      for (let i = 0; i < before; i++) {
        add(`source-${i}`, previousTier);
        previous.set(`source-${i}`, previousTier);
      }
      const residentBefore = [...resident];
      const versionBefore = fake.version;
      const plan = planIncrementalSnapshotRequests(cache, sources, preferred, previous);
      expect(plan.tiers.size).toBe(before + 1);
      for (let i = 0; i < before; i++) expect(plan.tiers.get(`source-${i}`)).toBe(previousTier);
      expect(plan.tiers.get(`source-${before}`)).toBe(preferred);
      expect(plan.pending).toEqual([{ source: `source-${before}`, maxEdge: preferred }]);
      expect([...resident]).toEqual(residentBefore);
      expect(fake.version).toBe(versionBefore);
      expect(admissions).toHaveLength(before);
      // Each old source needs just its previous-tier probe; the one cold source
      // probes the three distinct overview tiers, never a duplicate cache key.
      expect(calls).toHaveLength(before + 3);
      for (const request of plan.pending) add(request.source, request.maxEdge);
      expect(admissions.slice(before)).toEqual(plan.pending);
      expect(fake.version).toBe(versionBefore + 1);
      for (const [key, bitmap] of residentBefore) expect(resident.get(key)).toBe(bitmap);
      const settled = planIncrementalSnapshotRequests(cache, sources, preferred, plan.tiers);
      expect([...settled.tiers]).toEqual([...plan.tiers]);
      expect(settled.pending).toEqual([]);
      expect(calls).toHaveLength(before + 3 + sources.size);
    },
  );

  it('deduplicates 1000 repeated nodes before cache probes and preserves source insertion order', () => {
    const { cache, add, calls } = fakeCache();
    add('ready', 512);
    const sources: ReadonlyMap<string, string> = new Map(
      Array.from({ length: 1000 }, (_, i) => [`node-${i}`, i % 2 ? 'new' : 'ready']),
    );
    const previous: ReadonlyMap<string, number> = new Map([['ready', 512]]);
    const plan = planIncrementalSnapshotRequests(cache, sources, 128, previous);
    expect([...plan.tiers]).toEqual([['ready', 512], ['new', 128]]);
    expect(plan.pending).toEqual([{ source: 'new', maxEdge: 128 }]);
    expect(calls).toHaveLength(4);
    expect(sources.size).toBe(1000);
    expect([...previous]).toEqual([['ready', 512]]);
  });

  it('does not request any resident source, even without previous tier metadata', () => {
    const { cache, add } = fakeCache();
    add('large', 512); add('medium', 256); add('small', 128);
    const sources = new Map([['a', 'large'], ['b', 'medium'], ['c', 'small']]);
    const plan = planIncrementalSnapshotRequests(cache, sources, 128, new Map());
    expect([...plan.tiers]).toEqual([['large', 512], ['medium', 256], ['small', 128]]);
    expect(plan.pending).toEqual([]);
  });

  it('rechecks evicted previous tiers and requests only sources with no remaining tier', () => {
    const { cache, add, evict } = fakeCache();
    add('fallback', 512); add('fallback', 256); add('evicted', 512);
    const sources = new Map([['a', 'fallback'], ['b', 'evicted'], ['c', 'fallback']]);
    const previous = new Map([['fallback', 512], ['evicted', 512], ['removed', 512]]);
    evict('fallback', 512); evict('evicted', 512);
    const plan = planIncrementalSnapshotRequests(cache, sources, 128, previous);
    expect([...plan.tiers]).toEqual([['fallback', 256], ['evicted', 128]]);
    expect(plan.pending).toEqual([{ source: 'evicted', maxEdge: 128 }]);
    expect(previous.get('fallback')).toBe(512);
    expect(plan.tiers.has('removed')).toBe(false);
  });

  it('replans after a new source becomes resident without enqueueing it again', () => {
    const { cache, add } = fakeCache();
    const sources = new Map([['node', 'new']]);
    const first = planIncrementalSnapshotRequests(cache, sources, 256, new Map());
    expect(first.pending).toEqual([{ source: 'new', maxEdge: 256 }]);
    add('new', 256);
    const second = planIncrementalSnapshotRequests(cache, sources, 128, first.tiers);
    expect([...second.tiers]).toEqual([['new', 256]]);
    expect(second.pending).toEqual([]);
  });

  it('falls back from invalid previous metadata and requests a missing source only once', () => {
    const { cache, add } = fakeCache();
    add('ready', 512);
    const sources = new Map([['a', 'ready'], ['b', 'missing'], ['c', 'missing']]);
    const previous = new Map([['ready', NaN], ['missing', Infinity]]);
    const plan = planIncrementalSnapshotRequests(cache, sources, 256, previous);
    expect([...plan.tiers]).toEqual([['ready', 512], ['missing', 256]]);
    expect(plan.pending).toEqual([{ source: 'missing', maxEdge: 256 }]);
  });

  it('returns fresh empty collections without probing stale metadata for an empty scene', () => {
    const { cache, calls } = fakeCache();
    const previous = new Map([['old', 512]]);
    const first = planIncrementalSnapshotRequests(cache, new Map(), 128, previous);
    const second = planIncrementalSnapshotRequests(cache, new Map(), 128, previous);
    expect(first.tiers.size).toBe(0); expect(first.pending).toEqual([]);
    expect(first.tiers).not.toBe(second.tiers); expect(first.pending).not.toBe(second.pending);
    expect(calls).toEqual([]); expect([...previous]).toEqual([['old', 512]]);
  });
});

describe('incremental snapshot planning work', () => {
  it.each([128, 256, 512])('probes each cold tier once when previous equals preferred %i', preferred => {
    const { cache, calls } = fakeCache();
    expect(pickResidentSnapshotTier(cache, 'cold', preferred, preferred)).toBe(preferred);
    expect(calls.map(call => call.maxEdge)).toEqual([
      preferred, ...[512, 256, 128].filter(tier => tier !== preferred),
    ]);
  });

  it.each([false, true])('handles 1000 aliases of an exact large data URL (resident: %s)', ready => {
    const fake = fakeCache();
    const source = `data:image/png;base64,${'Ab+/'.repeat(16_384)}==`;
    const sources = new Map(Array.from({ length: 1000 }, (_, i) => [`alias-${i}`, source]));
    const previous = new Map([[source, 512]]);
    if (ready) fake.add(source, 512);
    const plan = planIncrementalSnapshotRequests(fake.cache, sources, 128, previous);
    expect([...plan.tiers]).toEqual([[source, ready ? 512 : 128]]);
    expect(plan.pending).toEqual(ready ? [] : [{ source, maxEdge: 128 }]);
    expect(fake.calls).toHaveLength(ready ? 1 : 3);
    expect(fake.calls.every(call => call.source === source)).toBe(true);
    expect(fake.admissions).toHaveLength(ready ? 1 : 0);
  });

  it('only plans sources admitted upstream, including aliases beyond the unique-source cap', () => {
    const image = (i: number, source = `source-${i}`): CanvasImageItem => ({
      id: `node-${i}`, x: i * 120, y: 0, width: 100, height: 80,
      item: { id: `asset-${i}`, type: 'image', content: '', createdAt: 1, thumbnail: source },
    });
    const items = Array.from({ length: SNAPSHOT_MAX_RESIDENT_SOURCES + 20 }, (_, i) => image(i));
    items.push(...Array.from({ length: 1000 }, (_, i) => image(items.length + i, 'source-0')));
    const residency = planSnapshotResidency(items, null);
    const previous = new Map([
      ['source-0', 512], ['removed', 512], [`source-${SNAPSHOT_MAX_RESIDENT_SOURCES}`, 256],
    ]);
    const fake = fakeCache();
    fake.add('source-0', 512);
    fake.add('removed', 512);
    fake.add(`source-${SNAPSHOT_MAX_RESIDENT_SOURCES}`, 256);
    const plan = planIncrementalSnapshotRequests(fake.cache, residency.sources, residency.maxEdge, previous);
    expect(residency.sources.size).toBe(SNAPSHOT_MAX_RESIDENT_SOURCES + 1000);
    expect(plan.tiers.size).toBe(SNAPSHOT_MAX_RESIDENT_SOURCES);
    expect(plan.pending).toHaveLength(SNAPSHOT_MAX_RESIDENT_SOURCES - 1);
    expect(plan.tiers.get('source-0')).toBe(512);
    expect(plan.tiers.has('removed')).toBe(false);
    expect(plan.tiers.has(`source-${SNAPSHOT_MAX_RESIDENT_SOURCES}`)).toBe(false);
    expect(fake.calls).toHaveLength(1 + (SNAPSHOT_MAX_RESIDENT_SOURCES - 1) * 3);
    const admitted = new Set(residency.sources.values());
    expect(fake.calls.every(call => admitted.has(call.source))).toBe(true);
    expect(fake.admissions).toHaveLength(3);
  });

  it('pumps only pending admissions across ready versions without re-reading node source getters', () => {
    let sourceReads = 0;
    let allowSourceReads = true;
    const items: CanvasImageItem[] = Array.from({ length: 83 }, (_, i) => ({
      id: `node-${i}`, x: i * 120, y: 0, width: 100, height: 80,
      item: {
        id: `asset-${i}`, type: 'image', content: '', createdAt: 1,
        get thumbnail() {
          if (!allowSourceReads) throw new Error('Source metadata was read after structural planning');
          sourceReads += 1;
          return `source-${i}`;
        },
      },
    }));
    const fake = fakeCache();
    const previous = new Map<string, number>();
    for (let i = 0; i < 80; i++) {
      fake.add(`source-${i}`, 512);
      previous.set(`source-${i}`, 512);
    }
    const residency = planSnapshotResidency(items, null, 512);
    expect(residency.maxEdge).toBe(256);
    expect(sourceReads).toBe(83);
    allowSourceReads = false;
    const plan = planIncrementalSnapshotRequests(fake.cache, residency.sources, residency.maxEdge, previous);
    const probesAfterPlanning = fake.calls.length;
    const readyVersion = fake.version;
    expect(plan.pending).toEqual([80, 81, 82].map(i => ({ source: `source-${i}`, maxEdge: 256 })));
    expect(probesAfterPlanning).toBe(80 + 3 * 3);
    for (const [index, request] of plan.pending.entries()) {
      fake.add(request.source, request.maxEdge);
      expect(fake.version).toBe(readyVersion + index + 1);
      expect(fake.calls).toHaveLength(probesAfterPlanning);
      expect(sourceReads).toBe(83);
    }
    expect(fake.admissions.slice(80)).toEqual(plan.pending);
    // A consumer projects source-keyed tiers back to node IDs for mixed-tier scenes.
    const readyTiers = new Map<string, number>();
    for (const [id, source] of residency.sources) {
      const tier = plan.tiers.get(source)!;
      if (fake.cache.peek(source, tier)) readyTiers.set(id, tier);
    }
    expect(readyTiers.size).toBe(83);
    for (let i = 0; i < 80; i++) expect(readyTiers.get(`node-${i}`)).toBe(512);
    for (let i = 80; i < 83; i++) expect(readyTiers.get(`node-${i}`)).toBe(256);
    expect(sourceReads).toBe(83);
    expect(fake.version).toBe(readyVersion + 3);
  });

  it('reads only peek, not cache version or bitmap metadata getters', () => {
    let forbiddenReads = 0;
    const forbiddenRead = () => {
      forbiddenReads += 1;
      throw new Error('Planning must only check bitmap presence');
    };
    const bitmap = Object.defineProperties({}, Object.fromEntries(
      ['key', 'drawable', 'width', 'height', 'bytes'].map(key => [key, { get: forbiddenRead }]),
    )) as SnapshotBitmap;
    const cache = {
      peek: () => bitmap,
      get version() { return forbiddenRead(); },
      get request() { return forbiddenRead(); },
      get touch() { return forbiddenRead(); },
      get getStats() { return forbiddenRead(); },
    };
    expect(pickResidentSnapshotTier(cache, 'source', 128, 512)).toBe(512);
    const plan = planIncrementalSnapshotRequests(cache, new Map([['node', 'source']]), 128,
      new Map([['source', 512]]));
    expect([...plan.tiers]).toEqual([['source', 512]]);
    expect(plan.pending).toEqual([]);
    expect(forbiddenReads).toBe(0);
  });
});


// A real cache with a synthetic decoder exercises incremental LRU convergence;
// no browser image/network/real user files are involved.
describe('incremental cache under actual hard-budget pressure', () => {
  it('repairs only evicted oversized sources at the new tier without an unbounded decode loop', async () => {
    const { createSnapshotBitmapCache } = await import('./snapshotBitmapCache');
    const calls: Array<{ source: string; edge: number }> = [];
    const cache = createSnapshotBitmapCache({ maxBytes: 96 * 1024 * 1024, maxEntries: 1024, maxPendingRequests: 24,
      decode: async (source, edge) => { calls.push({ source, edge }); return { drawable: {} as CanvasImageSource, width: edge, height: edge }; } });
    try {
      const sources = new Map(Array.from({ length: 150 }, (_, i) => [`n${i}`, `s${i}`]));
      for (let i = 0; i < 80; i += 20) await Promise.all(Array.from({ length: 20 }, (_, j) => cache.request(`s${i + j}`, 512)));
      let previous = new Map(Array.from({ length: 80 }, (_, i) => [`s${i}`, 512]));
      let passes = 0;
      for (;;) {
        const plan = planIncrementalSnapshotRequests(cache, sources, 256, previous); previous = plan.tiers;
        if (!plan.pending.length) break;
        if (++passes > 20) throw new Error('Incremental cache did not converge');
        for (let i = 0; i < plan.pending.length; i += 24) {
          const batch = plan.pending.slice(i, i + 24);
          const results = await Promise.all(batch.map(item => cache.request(item.source, item.maxEdge)));
          expect(results.every(Boolean)).toBe(true);
        }
      }
      expect(cache.getStats().bytes).toBeLessThanOrEqual(96 * 1024 * 1024);
      expect(planIncrementalSnapshotRequests(cache, sources, 256, previous).pending).toHaveLength(0);
      expect(calls.length).toBeLessThan(80 + 150);
      expect(calls.filter(call => call.edge === 512)).toHaveLength(80);
      expect([...previous.values()].filter(edge => edge === 512).length).toBeGreaterThan(0);
    } finally { cache.dispose(); }
  });
});
