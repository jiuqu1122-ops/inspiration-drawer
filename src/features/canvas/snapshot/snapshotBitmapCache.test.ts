import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSnapshotBitmapCache, decodeSnapshotBitmap, getSnapshotBitmapCacheKey,
  type DecodedSnapshotBitmap, type SnapshotBitmapCache, type SnapshotBitmapCacheOptions,
} from './snapshotBitmapCache';

const caches: SnapshotBitmapCache[] = [];
const cacheWith = (options: SnapshotBitmapCacheOptions = {}) => {
  const cache = createSnapshotBitmapCache(options); caches.push(cache); return cache;
};
const decoded = (name: string, width = 16, height = 8) => ({
  drawable: { name } as unknown as CanvasImageSource, width, height, close: vi.fn(),
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const flush = async () => {
  // Promise work only; no real timers or machine-speed assumptions.
  for (let index = 0; index < 16; index += 1) await Promise.resolve();
};
const controlled = () => {
  const calls: Array<ReturnType<typeof deferred<DecodedSnapshotBitmap>> & { source: string; edge: number }> = [];
  const decode = vi.fn((source: string, edge: number) => {
    const call = { ...deferred<DecodedSnapshotBitmap>(), source, edge }; calls.push(call); return call.promise;
  });
  return { calls, decode };
};
const assertBounds = (cache: SnapshotBitmapCache, entries: number, bytes: number) => {
  const stats = cache.getStats();
  expect(stats.retainedEntries).toBeLessThanOrEqual(entries);
  expect(stats.bytes).toBeLessThanOrEqual(bytes);
  expect(stats.bytes).toBeGreaterThanOrEqual(0);
  expect(stats.active).toBeLessThanOrEqual(2);
};
afterEach(() => {
  caches.splice(0).forEach(cache => cache.dispose());
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('snapshot cache admission and decoding', () => {
  it('keys exact sources and normalized tiers without rewriting or collisions', () => {
    expect(getSnapshotBitmapCacheKey('asset://a?x=1', 512)).toBe('[512,"asset://a?x=1"]');
    expect(getSnapshotBitmapCacheKey('a', 512.9)).toBe(getSnapshotBitmapCacheKey('a', 512));
    expect(getSnapshotBitmapCacheKey('a', Infinity)).toBe(getSnapshotBitmapCacheKey('a', 1024));
    expect(getSnapshotBitmapCacheKey('a', 999999)).toBe(getSnapshotBitmapCacheKey('a', 4096));
    expect(getSnapshotBitmapCacheKey('a', 512)).not.toBe(getSnapshotBitmapCacheKey('a', 1024));
    expect(getSnapshotBitmapCacheKey('a?x=1')).not.toBe(getSnapshotBitmapCacheKey('a?x=2'));
  });
  it('deduplicates in-flight request/acquire callers and caches the result', async () => {
    const control = controlled(), cache = cacheWith({ decode: control.decode });
    const first = cache.request('a'); expect(cache.request('a')).toBe(first);
    const acquired = cache.acquire('a'); await flush();
    expect(control.decode).toHaveBeenCalledTimes(1);
    control.calls[0].resolve(decoded('a'));
    const bitmap = await first, reserved = await acquired;
    expect(reserved?.bitmap).toBe(bitmap);
    expect(await cache.request('a')).toBe(bitmap); expect(cache.peek('a')).toBe(bitmap);
    expect(control.decode).toHaveBeenCalledTimes(1); expect(Object.isFrozen(bitmap)).toBe(true);
    reserved?.release();
  });
  it('normalizes the cache default and keeps explicit tiers independent', async () => {
    const decode = vi.fn(async (source: string, _edge: number) => decoded(source));
    const cache = cacheWith({ maxEdge: 512, decode });
    const low = await cache.request('a'), high = await cache.request('a', 1024);
    expect(decode.mock.calls).toEqual([['a', 512], ['a', 1024]]);
    expect(low?.key).toBe('[512,"a"]'); expect(high?.key).toBe('[1024,"a"]');
    cache.invalidate('a'); expect(cache.peek('a')).toBeNull(); expect(cache.peek('a', 1024)).toBe(high);
  });
  it.each([2, 20])('clamps requested concurrency %i to two and drains FIFO', async concurrency => {
    const control = controlled(), cache = cacheWith({ concurrency, decode: control.decode });
    const results = ['a', 'b', 'c', 'd'].map(source => cache.request(source)); await flush();
    expect(control.calls.map(call => call.source)).toEqual(['a', 'b']);
    expect(cache.getStats()).toMatchObject({ active: 2, queued: 2 });
    control.calls[1].resolve(decoded('b')); await flush();
    expect(control.calls.map(call => call.source)).toEqual(['a', 'b', 'c']);
    control.calls[0].resolve(decoded('a')); await flush();
    expect(control.calls.map(call => call.source)).toEqual(['a', 'b', 'c', 'd']);
    control.calls[2].resolve(decoded('c')); control.calls[3].resolve(decoded('d'));
    expect((await Promise.all(results)).every(Boolean)).toBe(true); await flush();
    expect(cache.getStats()).toMatchObject({ active: 0, queued: 0 });
  });
  it('honors single-flight and queued-plus-active admission without charging duplicates', async () => {
    const control = controlled(), cache = cacheWith({ concurrency: 1, maxPendingRequests: 2, decode: control.decode });
    const a = cache.request('a'), b = cache.request('b'); expect(cache.request('b')).toBe(b);
    expect(await cache.request('c')).toBeNull(); expect(cache.getFailure('c')?.code).toBe('queue-full');
    await flush(); expect(control.calls).toHaveLength(1);
    control.calls[0].resolve(decoded('a')); await a; await flush();
    expect(control.calls).toHaveLength(2); control.calls[1].resolve(decoded('b')); await b;
  });
  it('counts invalidated active decodes against the pending limit', async () => {
    const control = controlled(), cache = cacheWith({ maxPendingRequests: 2, decode: control.decode });
    const a = cache.request('a'), b = cache.request('b'); await flush();
    cache.invalidate('a'); cache.invalidate('b'); expect(await a).toBeNull(); expect(await b).toBeNull();
    expect(await cache.request('c')).toBeNull(); expect(cache.getFailure('c')?.code).toBe('queue-full');
    const lateA = decoded('a'), lateB = decoded('b');
    control.calls[0].resolve(lateA); control.calls[1].resolve(lateB); await flush();
    expect(lateA.close).toHaveBeenCalledOnce(); expect(lateB.close).toHaveBeenCalledOnce();
    expect(cache.getStats()).toMatchObject({ entries: 0, active: 0, queued: 0 });
  });
  it.each(['clear', 'dispose'] as const)('does not start canceled browser work after immediate %s', async method => {
    const decode = vi.fn(async () => decoded('unused')), cache = cacheWith({ decode });
    const first = cache.request('a'), second = cache.acquire('b'), queued = cache.request('c'); cache[method]();
    expect(await first).toBeNull(); expect(await second).toBeNull(); expect(await queued).toBeNull(); await flush();
    expect(decode).not.toHaveBeenCalled(); expect(cache.getStats()).toMatchObject({ active: 0, queued: 0, bytes: 0 });
  });
  it('rejects empty and non-string inputs without decoding', async () => {
    const decode = vi.fn(async () => decoded('unused')), cache = cacheWith({ decode });
    for (const source of ['', '  ', null as unknown as string]) {
      expect(await cache.request(source)).toBeNull();
      expect(cache.getFailure(source)).toMatchObject({ code: 'invalid-source', retryAt: null });
    }
    expect(decode).not.toHaveBeenCalled();
  });
  it.each([
    { width: 0, height: 8 }, { width: 16, height: -1 }, { width: 1.5, height: 8 },
    { width: NaN, height: 8 }, { width: 16, height: Infinity }, { width: 513, height: 8 },
  ])('closes invalid decoded dimensions $width x $height', async dimensions => {
    const resource = { ...decoded('invalid'), ...dimensions };
    const cache = cacheWith({ maxEdge: 512, decode: async () => resource });
    expect(await cache.request('invalid')).toBeNull(); expect(cache.getFailure('invalid')?.code).toBe('invalid-bitmap');
    expect(cache.getStats()).toMatchObject({ entries: 0, bytes: 0 }); expect(resource.close).toHaveBeenCalledOnce();
  });
  it('rejects missing drawables and null decoder returns without stranding slots', async () => {
    const resource = { ...decoded('invalid'), drawable: null as unknown as CanvasImageSource };
    const cache = cacheWith({ decode: async source => source === 'null' ? null as unknown as DecodedSnapshotBitmap : resource });
    expect(await cache.request('null')).toBeNull(); expect(await cache.request('invalid')).toBeNull();
    expect(cache.getFailure('null')?.code).toBe('invalid-bitmap'); expect(resource.close).toHaveBeenCalledOnce();
  });
});

describe('snapshot cache residency, pins and LRU', () => {
  it('evicts least-recently-used entries and closes each resource once', async () => {
    const resources = new Map<string, ReturnType<typeof decoded>>();
    const cache = cacheWith({ maxEntries: 2, decode: async source => {
      const resource = decoded(source); resources.set(source, resource); return resource;
    } });
    await cache.request('a'); await cache.request('b'); await cache.request('a'); await cache.request('c');
    expect(cache.peek('b')).toBeNull(); expect(cache.peek('a')).not.toBeNull();
    expect(resources.get('b')?.close).toHaveBeenCalledOnce(); cache.clear(); cache.dispose();
    for (const resource of resources.values()) expect(resource.close).toHaveBeenCalledOnce();
  });
  it('peek does not change LRU; touch does, and neither decodes missing entries', async () => {
    const decode = vi.fn(async (source: string) => decoded(source)), cache = cacheWith({ maxEntries: 2, decode });
    await cache.request('a'); await cache.request('b'); cache.peek('a'); await cache.request('c');
    expect(cache.peek('a')).toBeNull(); cache.touch('b'); cache.touch('missing'); cache.peek('missing');
    await cache.request('d'); expect(cache.peek('b')).not.toBeNull(); expect(cache.peek('c')).toBeNull();
    expect(decode).toHaveBeenCalledTimes(4);
  });
  it('retains acquisition recency after pin release', async () => {
    const cache = cacheWith({ maxEntries: 2, decode: async source => decoded(source) });
    await cache.request('a'); await cache.request('b'); const pinned = cache.pin('a');
    pinned?.release(); pinned?.release(); await cache.request('c');
    expect(cache.peek('a')).not.toBeNull(); expect(cache.peek('b')).toBeNull();
  });
  it('does not evict useful entries for an individually oversized result', async () => {
    const small = decoded('small', 4, 4), large = decoded('large', 9, 9);
    const cache = cacheWith({ maxBytes: 128, maxEntries: 10, decode: async source => source === 'large' ? large : small });
    await cache.request('small'); expect(await cache.request('large')).toBeNull();
    expect(cache.peek('small')).not.toBeNull(); expect(cache.getFailure('large')?.code).toBe('capacity');
    expect(large.close).toHaveBeenCalledOnce(); expect(small.close).not.toHaveBeenCalled();
    expect(cache.getStats().bytes).toBe(64);
  });
  it('evicts enough unpinned bytes while keeping pinned bytes inside the hard budget', async () => {
    const cache = cacheWith({ maxBytes: 128, decode: async source => decoded(source, source === 'large' ? 8 : 4, 4) });
    const pinned = await cache.acquire('a'); await cache.request('b'); expect(cache.getStats().bytes).toBe(128);
    expect(await cache.request('large')).toBeNull(); expect(cache.peek('b')).not.toBeNull();
    pinned?.release(); cache.invalidate('large'); expect(await cache.request('large')).not.toBeNull();
    expect(cache.getStats()).toMatchObject({ entries: 1, retainedEntries: 1, bytes: 128 });
  });
  it('never evicts a pinned entry and admits another resource after release', async () => {
    const resources: Array<ReturnType<typeof decoded>> = [];
    const cache = cacheWith({ maxEntries: 1, decode: async source => {
      const resource = decoded(source); resources.push(resource); return resource;
    } });
    const pinned = await cache.acquire('a'); expect(await cache.request('b')).toBeNull();
    expect(resources[0].close).not.toHaveBeenCalled(); expect(resources[1].close).toHaveBeenCalledOnce();
    pinned?.release(); cache.invalidate('b'); expect(await cache.request('b')).not.toBeNull();
    expect(resources[0].close).toHaveBeenCalledOnce(); assertBounds(cache, 1, 512);
  });
  it('reserves deduplicated acquisition leases before ready subscribers can start competitors', async () => {
    const a = decoded('a'), b = decoded('b');
    const cache = cacheWith({ maxEntries: 1, decode: async source => source === 'a' ? a : b });
    let competitor: Promise<unknown> | undefined;
    cache.subscribe(event => {
      if (event.status === 'ready' && event.key === getSnapshotBitmapCacheKey('a')) competitor = cache.request('b');
    });
    const leases = await Promise.all([cache.acquire('a'), cache.acquire('a')]); await flush();
    expect(await competitor).toBeNull(); expect(leases[0]?.bitmap).toBe(leases[1]?.bitmap);
    cache.invalidate('a'); leases[0]?.release(); leases[0]?.release(); expect(a.close).not.toHaveBeenCalled();
    leases[1]?.release(); expect(a.close).toHaveBeenCalledOnce();
  });
  it('accounts for retired leases across clear and prevents pinned generation accumulation', async () => {
    const resources: Array<ReturnType<typeof decoded>> = [];
    const cache = cacheWith({ maxEntries: 1, maxBytes: 512, decode: async source => {
      const resource = decoded(source); resources.push(resource); return resource;
    } });
    const old = await cache.acquire('a'); cache.clear();
    expect(cache.getStats()).toMatchObject({ entries: 0, retainedEntries: 1, bytes: 512 });
    expect(cache.pin('a')).toBeNull(); expect(await cache.request('a')).toBeNull();
    expect(resources[0].close).not.toHaveBeenCalled(); expect(resources[1].close).toHaveBeenCalledOnce();
    old?.release(); old?.release(); expect(cache.getStats()).toMatchObject({ retainedEntries: 0, bytes: 0 });
    cache.invalidate('a'); expect(await cache.request('a')).not.toBeNull(); assertBounds(cache, 1, 512);
  });
  it('keeps delivered leases valid through dispose and closes only on the last release', async () => {
    const resource = decoded('a'), cache = cacheWith({ decode: async () => resource });
    const first = await cache.acquire('a'), second = cache.pin('a'); cache.dispose(); cache.dispose();
    expect(cache.getStats()).toMatchObject({ disposed: true, entries: 0, retainedEntries: 1, bytes: 512 });
    expect(await cache.request('a')).toBeNull(); expect(await cache.acquire('a')).toBeNull(); expect(cache.pin('a')).toBeNull();
    first?.release(); first?.release(); expect(resource.close).not.toHaveBeenCalled();
    second?.release(); second?.release(); expect(resource.close).toHaveBeenCalledOnce(); expect(cache.getStats().bytes).toBe(0);
  });
  it('uses drawable.close only when no explicit closer exists', async () => {
    const drawableClose = vi.fn(), explicitClose = vi.fn();
    const drawable = { close: drawableClose } as unknown as CanvasImageSource;
    const cache = cacheWith({ decode: async source => ({ drawable, width: 1, height: 1,
      ...(source === 'explicit' ? { close: explicitClose } : {}) }) });
    await cache.request('explicit'); cache.invalidate('explicit');
    expect(explicitClose).toHaveBeenCalledOnce(); expect(drawableClose).not.toHaveBeenCalled();
    await cache.request('implicit'); cache.clear(); cache.dispose(); expect(drawableClose).toHaveBeenCalledOnce();
  });
  it('isolates throwing closers while releasing accounting and draining later work', async () => {
    const close = vi.fn(() => { throw new Error('driver failure'); });
    const cache = cacheWith({ maxEntries: 1, decode: async source => ({ ...decoded(source), close }) });
    await cache.request('a'); expect(await cache.request('b')).not.toBeNull(); cache.dispose();
    expect(close).toHaveBeenCalledTimes(2); expect(cache.getStats()).toMatchObject({ retainedEntries: 0, bytes: 0 });
  });
  it('does not admit a completion when an eviction closer reentrantly disposes', async () => {
    const next = decoded('b');
    const first = { ...decoded('a'), close: vi.fn(() => cache.dispose()) };
    const cache = cacheWith({ maxEntries: 1, decode: async source => source === 'a' ? first : next });
    await cache.request('a'); expect(await cache.request('b')).toBeNull();
    expect(next.close).toHaveBeenCalledOnce(); expect(cache.getStats()).toMatchObject({ disposed: true, retainedEntries: 0, bytes: 0 });
  });
  it('rejects reentrant admission while clear is releasing resources', async () => {
    let reentrant: Promise<unknown> | undefined;
    const resource = { ...decoded('a'), close: () => { reentrant = cache.request('during-clear'); cache.clear(); } };
    const decode = vi.fn(async () => resource); const cache = cacheWith({ decode });
    await cache.request('a'); cache.clear(); expect(await reentrant).toBeNull();
    expect(decode).toHaveBeenCalledTimes(1); expect(cache.getStats()).toMatchObject({ entries: 0, bytes: 0, queued: 0 });
  });
  it('maintains hard bounds through deterministic acquire/invalidate/clear churn', async () => {
    const resources: Array<ReturnType<typeof decoded>> = [];
    const cache = cacheWith({ maxEntries: 3, maxBytes: 1536, decode: async source => {
      const resource = decoded(source); resources.push(resource); return resource;
    } });
    const held = [];
    for (let index = 0; index < 60; index += 1) {
      const source = 'image-' + index % 7; cache.invalidate(source);
      const acquired = await cache.acquire(source); if (acquired) held.push(acquired);
      if (index % 3 === 0) held.shift()?.release(); if (index % 7 === 0) cache.clear(); assertBounds(cache, 3, 1536);
    }
    cache.dispose(); held.forEach(item => { item.release(); item.release(); });
    expect(cache.getStats()).toMatchObject({ entries: 0, retainedEntries: 0, bytes: 0 });
    resources.forEach(resource => expect(resource.close).toHaveBeenCalledOnce());
  });
});

describe('snapshot cache cancellation and failure delivery', () => {
  it.each(['invalidate', 'clear', 'dispose'] as const)('closes late active resources after %s and cancels queued acquirers', async method => {
    const control = controlled(), cache = cacheWith({ concurrency: 1, decode: control.decode });
    const first = cache.request('a'), acquired = cache.acquire('a'), queued = cache.acquire('b');
    const events = vi.fn(); cache.subscribe(events); await flush();
    if (method === 'invalidate') { cache.invalidate('a'); cache.invalidate('b'); } else cache[method]();
    expect(await first).toBeNull(); expect(await acquired).toBeNull(); expect(await queued).toBeNull();
    const late = decoded('a'); control.calls[0].resolve(late); await flush();
    expect(control.decode).toHaveBeenCalledTimes(1); expect(late.close).toHaveBeenCalledOnce();
    expect(events).not.toHaveBeenCalled();
    expect(cache.getStats()).toMatchObject({ entries: 0, bytes: 0, active: 0, queued: 0, failures: 0 });
  });
  it('cannot replace a new same-key entry with an obsolete completion', async () => {
    const control = controlled(), cache = cacheWith({ decode: control.decode });
    const old = cache.request('a'); await flush(); cache.invalidate('a');
    const fresh = cache.request('a'); await flush();
    const newResource = decoded('new'), oldResource = decoded('old');
    control.calls[1].resolve(newResource); const bitmap = await fresh;
    control.calls[0].resolve(oldResource); await flush();
    expect(await old).toBeNull(); expect(cache.peek('a')).toBe(bitmap);
    expect(oldResource.close).toHaveBeenCalledOnce(); expect(newResource.close).not.toHaveBeenCalled();
  });
  it.each(['clear', 'dispose', 'invalidate'] as const)('does not deliver resources invalidated by ready subscribers (%s)', async method => {
    const resource = decoded('a'), cache = cacheWith({ decode: async () => resource });
    cache.subscribe(event => {
      if (event.status !== 'ready') return;
      if (method === 'invalidate') cache.invalidate('a'); else cache[method]();
    });
    const after = vi.fn(); cache.subscribe(after);
    const borrowed = cache.request('a'), acquired = cache.acquire('a');
    expect(await borrowed).toBeNull(); expect(await acquired).toBeNull(); expect(after).not.toHaveBeenCalled();
    expect(resource.close).toHaveBeenCalledOnce(); expect(cache.getStats().retainedEntries).toBe(0);
  });
  it('does not deliver stale cached-hit results or undisclosed leases after clear', async () => {
    const resource = decoded('a'), cache = cacheWith({ decode: async () => resource });
    await cache.request('a'); const borrowed = cache.request('a'), acquired = cache.acquire('a'); cache.clear();
    expect(await borrowed).toBeNull(); expect(await acquired).toBeNull();
    expect(resource.close).toHaveBeenCalledOnce(); expect(cache.getStats().retainedEntries).toBe(0);
  });
  it('isolates sync/async subscriber errors and respects unsubscribe during delivery', async () => {
    const cache = cacheWith({ decode: async source => decoded(source) }), ignored = vi.fn(); let unsubscribe = () => {};
    cache.subscribe(() => { unsubscribe(); throw new Error('subscriber'); });
    cache.subscribe(async () => { throw new Error('async subscriber'); }); unsubscribe = cache.subscribe(ignored);
    expect(await cache.request('a')).not.toBeNull(); await flush(); expect(ignored).not.toHaveBeenCalled();
    cache.dispose(); const afterDispose = vi.fn(); cache.subscribe(afterDispose);
    expect(await cache.request('b')).toBeNull(); expect(afterDispose).not.toHaveBeenCalled();
  });
  it.each(['sync', 'async'] as const)('consumes %s decoder errors and drains later work', async kind => {
    const decode = vi.fn((source: string) => {
      if (source === 'bad') {
        if (kind === 'sync') throw new Error('private path');
        return Promise.reject(new Error('private URL'));
      }
      return Promise.resolve(decoded(source));
    });
    const cache = cacheWith({ concurrency: 1, decode }); const failure = cache.request('bad'), next = cache.request('good');
    expect(await failure).toBeNull(); expect(await next).not.toBeNull();
    expect(cache.getFailure('bad')).toMatchObject({ code: 'decode', attempts: 1 });
    expect(JSON.stringify(cache.getFailure('bad'))).not.toContain('private');
  });
  it('retries only on an explicit request, uses backoff, and exhausts attempts', async () => {
    vi.useFakeTimers(); let time = 1000;
    const decode = vi.fn(async () => { throw new Error('failed'); });
    const cache = cacheWith({ now: () => time, retryDelayMs: 100, maxAttempts: 3, decode });
    await cache.request('bad'); expect(cache.getFailure('bad')).toMatchObject({ attempts: 1, retryAt: 1100 });
    expect(vi.getTimerCount()).toBe(0);
    time = 1099; await cache.request('bad'); expect(decode).toHaveBeenCalledTimes(1);
    time = 1100; await cache.request('bad'); expect(cache.getFailure('bad')).toMatchObject({ attempts: 2, retryAt: 1300 });
    time = 1300; await cache.request('bad'); expect(cache.getFailure('bad')).toMatchObject({ attempts: 3, retryAt: null });
    time = 999999; await cache.request('bad'); expect(decode).toHaveBeenCalledTimes(3);
    cache.invalidate('bad'); await cache.request('bad'); expect(cache.getFailure('bad')?.attempts).toBe(1);
    expect(decode).toHaveBeenCalledTimes(4); expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds failure records independently and clears them with the cache', async () => {
    const cache = cacheWith({ maxFailures: 2, decode: async () => { throw new Error('failed'); } });
    await cache.request('a'); await cache.request('b'); await cache.request('c');
    expect(cache.getStats().failures).toBe(2); expect(cache.getFailure('a')).toBeNull(); cache.clear();
    expect(cache.getStats().failures).toBe(0);
  });
  it('suppresses stale failure notifications after a subscriber clears them', async () => {
    const cache = cacheWith({ decode: async () => { throw new Error('failed'); } });
    cache.subscribe(() => cache.clear()); const after = vi.fn(); cache.subscribe(after);
    expect(await cache.request('bad')).toBeNull(); expect(after).not.toHaveBeenCalled();
    expect(cache.getStats()).toMatchObject({ failures: 0, active: 0 });
  });
  it('does not strand slots when the injected clock throws', async () => {
    const cache = cacheWith({ now: () => { throw new Error('clock'); }, decode: async () => { throw new Error('decode'); } });
    expect(await cache.request('a')).toBeNull(); expect(await cache.request('b')).toBeNull(); await flush();
    expect(cache.getStats()).toMatchObject({ active: 0, queued: 0, failures: 2 });
  });
});

type BrowserHarnessOptions = {
  width?: number; height?: number; tainted?: boolean; contextMissing?: boolean;
  decodeFailure?: boolean; hangingDecode?: boolean; throwingSource?: boolean; noImageDecode?: boolean;
};
const browserHarness = (options: BrowserHarnessOptions = {}) => {
  const reads: Array<{ source: string; cors: string | null }> = [];
  const images: MockImage[] = [], surfaces: MockCanvas[] = [];
  const context = {
    imageSmoothingEnabled: false, imageSmoothingQuality: 'low', clearRect: vi.fn(), drawImage: vi.fn(),
    getImageData: vi.fn(() => {
      if (options.tainted) throw new DOMException('tainted synthetic fixture', 'SecurityError');
      return { data: new Uint8ClampedArray(4) };
    }),
  };
  class MockImage {
    onload: (() => void) | null = null; onerror: (() => void) | null = null;
    naturalWidth = options.width ?? 2048; naturalHeight = options.height ?? 1024;
    crossOrigin: string | null = null; decoding = '';
    decode = options.noImageDecode ? undefined : vi.fn(() => {
      if (options.decodeFailure) return Promise.reject(new Error('decode failed'));
      if (options.hangingDecode) return new Promise<void>(() => {});
      return Promise.resolve();
    });
    removeAttribute = vi.fn();
    constructor() { images.push(this); }
    set src(source: string) {
      reads.push({ source, cors: this.crossOrigin }); if (options.throwingSource) throw new Error('source failed');
    }
  }
  class MockCanvas {
    width: number; height: number;
    constructor(width = 0, height = 0) { this.width = width; this.height = height; surfaces.push(this); }
    getContext = vi.fn(() => options.contextMissing ? null : context);
  }
  const bitmap = { close: vi.fn() }, createBitmap = vi.fn(async () => bitmap);
  const fetch = vi.fn(), revokeObjectURL = vi.fn(), document = { createElement: vi.fn(() => new MockCanvas()) };
  vi.stubGlobal('Image', MockImage); vi.stubGlobal('OffscreenCanvas', MockCanvas);
  vi.stubGlobal('createImageBitmap', createBitmap); vi.stubGlobal('document', document);
  vi.stubGlobal('fetch', fetch); vi.stubGlobal('URL', { revokeObjectURL });
  return { reads, images, surfaces, context, bitmap, createBitmap, fetch, revokeObjectURL, document };
};

describe('production browser decoder using synthetic browser APIs only', () => {
  it('downsamples, preserves alpha, checks origin cleanliness, and releases temporary resources', async () => {
    const browser = browserHarness(), pending = decodeSnapshotBitmap('synthetic:alpha', 512);
    browser.images[0].onload?.(); const result = await pending;
    expect(result).toMatchObject({ width: 512, height: 256, drawable: browser.bitmap });
    expect(browser.context.drawImage).toHaveBeenCalledWith(browser.images[0], 0, 0, 512, 256);
    expect(browser.surfaces[0].getContext).toHaveBeenCalledWith('2d', { alpha: true });
    expect(browser.context.getImageData).toHaveBeenCalledWith(0, 0, 1, 1);
    expect(browser.context.getImageData.mock.invocationCallOrder[0]).toBeLessThan(browser.createBitmap.mock.invocationCallOrder[0]);
    expect(browser.surfaces[0]).toMatchObject({ width: 0, height: 0 });
    expect(browser.images[0].removeAttribute).toHaveBeenCalledWith('src');
    expect(browser.images[0].onload).toBeNull(); expect(browser.images[0].onerror).toBeNull();
    expect(browser.bitmap.close).not.toHaveBeenCalled(); result.close?.(); expect(browser.bitmap.close).toHaveBeenCalledOnce();
  });
  it.each(['https://example.invalid/image.png', 'http://example.invalid/image.png', '//example.invalid/image.png'])('sets anonymous CORS before assigning %s', async source => {
    const browser = browserHarness(), pending = decodeSnapshotBitmap(source, 512);
    expect(browser.reads).toEqual([{ source, cors: 'anonymous' }]); browser.images[0].onload?.(); (await pending).close?.();
    expect(browser.fetch).not.toHaveBeenCalled(); expect(browser.revokeObjectURL).not.toHaveBeenCalled();
  });
  it.each(['asset://synthetic/image', 'blob:synthetic-not-owned', 'data:image/png;base64,synthetic'])('retains local/blob/data ownership for %s', async source => {
    const browser = browserHarness(), pending = decodeSnapshotBitmap(source, 512);
    expect(browser.reads).toEqual([{ source, cors: null }]); browser.images[0].onload?.(); (await pending).close?.();
    expect(browser.revokeObjectURL).not.toHaveBeenCalled();
  });
  it.each([true, false])('rejects tainted pixels before exposing a drawable (ImageBitmap=%s)', async bitmapAvailable => {
    const browser = browserHarness({ tainted: true }); if (!bitmapAvailable) vi.stubGlobal('createImageBitmap', undefined);
    const pending = decodeSnapshotBitmap('synthetic:tainted', 512); browser.images[0].onload?.();
    await expect(pending).rejects.toMatchObject({ code: 'rasterize', message: 'Snapshot bitmap rasterize' });
    expect(browser.createBitmap).not.toHaveBeenCalled(); expect(browser.surfaces[0]).toMatchObject({ width: 0, height: 0 });
    expect(browser.images[0].removeAttribute).toHaveBeenCalledWith('src'); expect(browser.fetch).not.toHaveBeenCalled();
  });
  it('owns a clean canvas fallback until its resource closer runs', async () => {
    const browser = browserHarness(); vi.stubGlobal('createImageBitmap', undefined); vi.stubGlobal('OffscreenCanvas', undefined);
    const pending = decodeSnapshotBitmap('synthetic:fallback', 512); browser.images[0].onload?.(); const result = await pending;
    expect(browser.document.createElement).toHaveBeenCalledWith('canvas'); expect(result.drawable).toBe(browser.surfaces[0]);
    expect(browser.surfaces[0]).toMatchObject({ width: 512, height: 256 }); expect(browser.context.getImageData).toHaveBeenCalledOnce();
    result.close?.(); expect(browser.surfaces[0]).toMatchObject({ width: 0, height: 0 });
  });
  it('does not upscale small images and supports browsers without Image.decode', async () => {
    const browser = browserHarness({ width: 12, height: 8, noImageDecode: true });
    const pending = decodeSnapshotBitmap('synthetic:small', 512); browser.images[0].onload?.(); const result = await pending;
    expect(result).toMatchObject({ width: 12, height: 8 }); result.close?.();
  });
  it('retains a one-pixel minimum with extreme aspect ratios', async () => {
    const browser = browserHarness({ width: 1, height: 100000 });
    const pending = decodeSnapshotBitmap('synthetic:portrait', 512); browser.images[0].onload?.(); const result = await pending;
    expect(result).toMatchObject({ width: 1, height: 512 }); result.close?.();
  });
  it('classifies load failures without CORS bypass, proxy, or retry', async () => {
    const browser = browserHarness(), pending = decodeSnapshotBitmap('https://example.invalid/blocked', 512);
    browser.images[0].onerror?.(); await expect(pending).rejects.toMatchObject({ code: 'load' });
    expect(browser.reads).toHaveLength(1); expect(browser.surfaces).toHaveLength(0);
    expect(browser.images[0].removeAttribute).toHaveBeenCalledWith('src'); expect(browser.fetch).not.toHaveBeenCalled();
  });
  it('consumes decode failures before allocating a surface', async () => {
    const browser = browserHarness({ decodeFailure: true }), pending = decodeSnapshotBitmap('synthetic:failure', 512);
    browser.images[0].onload?.(); await expect(pending).rejects.toMatchObject({ code: 'decode' });
    expect(browser.surfaces).toHaveLength(0); expect(browser.images[0].removeAttribute).toHaveBeenCalledWith('src');
  });
  it.each(['load', 'decode'] as const)('times out stuck %s with handlers and timers removed', async phase => {
    vi.useFakeTimers(); const browser = browserHarness({ hangingDecode: phase === 'decode' });
    const pending = decodeSnapshotBitmap('synthetic:timeout', 512);
    const checked = expect(pending).rejects.toMatchObject({ code: phase }); if (phase === 'decode') browser.images[0].onload?.();
    await vi.advanceTimersByTimeAsync(15000); await checked;
    expect(vi.getTimerCount()).toBe(0); expect(browser.images[0].onload).toBeNull(); expect(browser.images[0].onerror).toBeNull();
    expect(browser.images[0].removeAttribute).toHaveBeenCalledWith('src');
  });
  it('cleans surfaces when bitmap creation rejects', async () => {
    const browser = browserHarness(); browser.createBitmap.mockRejectedValueOnce(new Error('GPU allocation failed'));
    const pending = decodeSnapshotBitmap('synthetic:allocation', 512); browser.images[0].onload?.();
    await expect(pending).rejects.toMatchObject({ code: 'rasterize' });
    expect(browser.surfaces[0]).toMatchObject({ width: 0, height: 0 });
  });
  it('cleans invalid dimensions, missing contexts and throwing source setters', async () => {
    for (const [options, code] of [
      [{ width: 0 }, 'invalid-bitmap'], [{ height: Infinity }, 'invalid-bitmap'],
      [{ contextMissing: true }, 'rasterize'], [{ throwingSource: true }, 'load'],
    ] as const) {
      const browser = browserHarness(options), pending = decodeSnapshotBitmap('synthetic:invalid', 512);
      browser.images[0].onload?.(); await expect(pending).rejects.toMatchObject({ code });
      expect(browser.images[0].removeAttribute).toHaveBeenCalledWith('src');
      browser.surfaces.forEach(surface => expect(surface).toMatchObject({ width: 0, height: 0 }));
    }
  });
  it('fails cleanly without browser image or surface APIs', async () => {
    vi.stubGlobal('Image', undefined);
    await expect(decodeSnapshotBitmap('synthetic:missing', 512)).rejects.toMatchObject({ code: 'unavailable' });
    const browser = browserHarness(); vi.stubGlobal('OffscreenCanvas', undefined); vi.stubGlobal('document', undefined);
    const pending = decodeSnapshotBitmap('synthetic:missing-surface', 512); browser.images[0].onload?.();
    await expect(pending).rejects.toMatchObject({ code: 'unavailable' });
    expect(browser.images[0].removeAttribute).toHaveBeenCalledWith('src');
  });
  it('integrates browser bitmap ownership with leased retirement and exactly-once close', async () => {
    const browser = browserHarness(), cache = cacheWith({ maxEdge: 512 });
    const pending = cache.acquire('synthetic:integration'); await flush(); browser.images[0].onload?.();
    const acquired = await pending; cache.clear(); expect(browser.bitmap.close).not.toHaveBeenCalled();
    acquired?.release(); acquired?.release(); cache.dispose(); expect(browser.bitmap.close).toHaveBeenCalledOnce();
    expect(cache.getStats().bytes).toBe(0);
  });
});
