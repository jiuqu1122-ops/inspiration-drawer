/** One owned, downsampled image. Bytes estimate RGBA pixels, not GPU/decoder overhead. */
export interface SnapshotBitmap {
  readonly key: string;
  readonly drawable: CanvasImageSource;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
}

/** Ownership of the returned resource transfers to the cache, including on failure/staleness. */
export interface DecodedSnapshotBitmap {
  readonly drawable: CanvasImageSource;
  readonly width: number;
  readonly height: number;
  /** Optional for ImageBitmap (its close() is detected); required for other owned resources. */
  readonly close?: () => void;
}

export interface SnapshotBitmapLease {
  readonly bitmap: SnapshotBitmap;
  /** Idempotent. Release after drawing; a disposed cache also waits for outstanding leases. */
  release(): void;
}

export type SnapshotBitmapFailureCode =
  | 'invalid-source' | 'unavailable' | 'load' | 'decode' | 'rasterize'
  | 'invalid-bitmap' | 'capacity' | 'queue-full';

export interface SnapshotBitmapFailure {
  readonly key: string;
  readonly code: SnapshotBitmapFailureCode;
  readonly attempts: number;
  /** No automatic retry timer. null means exhausted; invalidate() permits an explicit retry. */
  readonly retryAt: number | null;
}

export interface SnapshotBitmapCacheEvent {
  readonly key: string;
  readonly status: 'ready' | 'failed';
}

export interface SnapshotBitmapCacheOptions {
  readonly maxEdge?: number;
  readonly maxBytes?: number;
  readonly maxEntries?: number;
  /** Queued plus active jobs; deduplicated callers do not occupy extra slots. */
  readonly maxPendingRequests?: number;
  readonly maxFailures?: number;
  /** Clamped to 1..2. */
  readonly concurrency?: number;
  readonly maxAttempts?: number;
  readonly retryDelayMs?: number;
  readonly now?: () => number;
  readonly decode?: (source: string, maxEdge: number) => Promise<DecodedSnapshotBitmap>;
}

export interface SnapshotBitmapCache {
  /** Borrowed result. Use acquire()/pin() if retained across an await or other cache operations. */
  request(source: string, maxEdge?: number): Promise<SnapshotBitmap | null>;
  /** Does not decode or update LRU. */
  peek(source: string, maxEdge?: number): SnapshotBitmap | null;
  /** Reserves ownership before decoding, so another completion cannot evict this result. */
  acquire(source: string, maxEdge?: number): Promise<SnapshotBitmapLease | null>;
  pin(source: string, maxEdge?: number): SnapshotBitmapLease | null;
  touch(source: string, maxEdge?: number): void;
  subscribe(listener: (event: SnapshotBitmapCacheEvent) => void): () => void;
  getFailure(source: string, maxEdge?: number): SnapshotBitmapFailure | null;
  /** Invalidates this source/tier only. Existing leases survive until released. */
  invalidate(source: string, maxEdge?: number): void;
  /** Clears entries, failures and pending requests; active decodes still occupy their queue slots. */
  clear(): void;
  dispose(): void;
  getStats(): Readonly<{
    entries: number;
    retainedEntries: number;
    bytes: number;
    active: number;
    queued: number;
    failures: number;
    disposed: boolean;
  }>;
}

export const DEFAULT_SNAPSHOT_MAX_EDGE = 1024;
export const DEFAULT_SNAPSHOT_MAX_BYTES = 96 * 1024 * 1024;

const positiveInteger = (value: number | undefined, fallback: number, maximum = Number.MAX_SAFE_INTEGER) => (
  value !== undefined && Number.isFinite(value) && value >= 1
    ? Math.min(maximum, Math.floor(value))
    : fallback
);

// An explicit ceiling prevents a malformed tier from requesting an effectively original-size texture.
const normalizeMaxEdge = (value: number | undefined, fallback = DEFAULT_SNAPSHOT_MAX_EDGE) => (
  positiveInteger(value, fallback, 4096)
);

/** Exact source string + normalized tier; no hashing collisions, URL rewriting or filesystem access. */
export const getSnapshotBitmapCacheKey = (source: string, maxEdge = DEFAULT_SNAPSHOT_MAX_EDGE) => (
  JSON.stringify([normalizeMaxEdge(maxEdge), source])
);

class BrowserSnapshotError extends Error {
  constructor(readonly code: SnapshotBitmapFailureCode) {
    super(`Snapshot bitmap ${code}`);
  }
}

const loadBrowserImage = (image: HTMLImageElement, source: string): Promise<void> => new Promise((resolve, reject) => {
  let finished = false;
  let loaded = false;
  const finish = (code?: SnapshotBitmapFailureCode) => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    image.onload = null;
    image.onerror = null;
    if (code) reject(new BrowserSnapshotError(code));
    else resolve();
  };
  const timeout = setTimeout(() => finish(loaded ? 'decode' : 'load'), 15_000);
  image.onload = () => {
    if (loaded || finished) return;
    loaded = true;
    if (typeof image.decode === 'function') {
      void Promise.resolve().then(() => image.decode()).then(() => finish(), () => finish('decode'));
    } else finish();
  };
  image.onerror = () => finish('load');
  try {
    image.decoding = 'async';
    // Preserve custom asset/data/blob handling. Remote URLs must be accessible under browser CORS.
    if (/^(?:https?:)?\/\//i.test(source)) image.crossOrigin = 'anonymous';
    image.src = source;
  } catch {
    finish('load');
  }
});

/**
 * Loads only the supplied URL via an unattached Image, then copies pixels into an owned surface.
 * No fetch, object-URL revocation, DOM attachment, original-resource mutation or server proxy.
 * Alpha is preserved. A tainted canvas is rejected rather than contaminating the drawing layer.
 */
export const decodeSnapshotBitmap = async (source: string, maxEdge: number): Promise<DecodedSnapshotBitmap> => {
  if (typeof Image === 'undefined') throw new BrowserSnapshotError('unavailable');
  const image = new Image();
  let canvas: OffscreenCanvas | HTMLCanvasElement | undefined;
  try {
    await loadBrowserImage(image, source);
    const sourceWidth = image.naturalWidth;
    const sourceHeight = image.naturalHeight;
    if (!(sourceWidth > 0 && sourceHeight > 0 && Number.isFinite(sourceWidth) && Number.isFinite(sourceHeight))) {
      throw new BrowserSnapshotError('invalid-bitmap');
    }
    const ratio = Math.min(1, normalizeMaxEdge(maxEdge) / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * ratio));
    const height = Math.max(1, Math.round(sourceHeight * ratio));
    if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(width, height);
    else if (typeof document !== 'undefined') {
      canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
    } else throw new BrowserSnapshotError('unavailable');
    const context = canvas.getContext('2d', { alpha: true }) as (
      CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
    );
    if (!context) throw new BrowserSnapshotError('rasterize');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    // createImageBitmap can propagate a tainted canvas instead of rejecting it. Check both
    // output paths before any drawable is allowed into the shared snapshot drawing layer.
    context.getImageData(0, 0, 1, 1);
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(canvas);
      return { drawable: bitmap, width, height, close: () => bitmap.close() };
    }
    // Older WebViews can retain the owned canvas directly. Never retain the source Image.
    const retained = canvas;
    canvas = undefined;
    return { drawable: retained, width, height, close: () => { retained.width = 0; retained.height = 0; } };
  } catch (error) {
    throw error instanceof BrowserSnapshotError ? error : new BrowserSnapshotError('rasterize');
  } finally {
    image.onload = null;
    image.onerror = null;
    image.removeAttribute('src');
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
};

type Entry = {
  bitmap: SnapshotBitmap;
  close: () => void;
  pins: number;
  retired: boolean;
};
type Job = {
  key: string;
  source: string;
  maxEdge: number;
  state: 'queued' | 'active' | 'finished';
  promise: Promise<SnapshotBitmap | null>;
  resolve: (bitmap: SnapshotBitmap | null) => void;
  acquirers: Array<(lease: SnapshotBitmapLease | null) => void>;
};

/** Never let driver/resource cleanup exceptions strand queue slots or reject caller promises. */
const ownedRelease = (decoded: DecodedSnapshotBitmap | null | undefined) => {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    try {
      if (typeof decoded?.close === 'function') decoded.close();
      else {
        const bitmap = decoded?.drawable as (CanvasImageSource & { close?: () => void }) | undefined;
        if (typeof bitmap?.close === 'function') bitmap.close();
      }
    } catch { /* Best effort, once. */ }
  };
};

/**
 * Per-layer bounded LRU. Eviction explicitly allows later reloading, not "decode once forever".
 * Resident accounting includes invalidated/disposed-but-leased resources. Temporary browser decode,
 * canvas, and GPU allocations are not represented by the RGBA estimate. No background retry timers.
 */
export const createSnapshotBitmapCache = (options: SnapshotBitmapCacheOptions = {}): SnapshotBitmapCache => {
  const defaultMaxEdge = normalizeMaxEdge(options.maxEdge);
  const maxBytes = positiveInteger(options.maxBytes, DEFAULT_SNAPSHOT_MAX_BYTES);
  const maxEntries = positiveInteger(options.maxEntries, 256);
  const maxPending = positiveInteger(options.maxPendingRequests, 256);
  const maxFailures = positiveInteger(options.maxFailures, 256);
  const concurrency = positiveInteger(options.concurrency, 2, 2);
  const maxAttempts = positiveInteger(options.maxAttempts, 3);
  const retryDelayMs = options.retryDelayMs !== undefined && Number.isFinite(options.retryDelayMs)
    ? Math.max(1, options.retryDelayMs) : 5_000;
  const now = options.now ?? Date.now;
  const decode = options.decode ?? decodeSnapshotBitmap;
  const entries = new Map<string, Entry>(); // insertion order is LRU order
  const retained = new Set<Entry>();
  const jobs = new Map<string, Job>();
  const failures = new Map<string, SnapshotBitmapFailure>();
  const listeners = new Set<(event: SnapshotBitmapCacheEvent) => void>();
  const queue: Job[] = [];
  let active = 0;
  let bytes = 0;
  let disposed = false;
  let clearing = false;
  const readNow = () => {
    try {
      const value = now();
      if (Number.isFinite(value)) return value;
    } catch { /* A clock failure must not strand a job or reject a caller. */ }
    return Date.now();
  };
  const keyFor = (source: string, maxEdge?: number) => (
    getSnapshotBitmapCacheKey(source, normalizeMaxEdge(maxEdge, defaultMaxEdge))
  );
  const isCurrentEntry = (entry: Entry) => (
    !disposed && !clearing && !entry.retired && entries.get(entry.bitmap.key) === entry
  );
  const notify = (event: SnapshotBitmapCacheEvent, isCurrent: () => boolean) => {
    for (const listener of [...listeners]) {
      if (disposed || clearing || !isCurrent()) break;
      // A prior listener may have unsubscribed another listener during this same notification.
      if (listeners.has(listener)) {
        // Also consume a rejection from an accidentally async subscriber.
        try { void Promise.resolve(listener(event)).catch(() => {}); } catch { /* Isolated subscriber. */ }
      }
    }
  };
  const touchEntry = (entry: Entry) => {
    if (!isCurrentEntry(entry)) return;
    entries.delete(entry.bitmap.key);
    entries.set(entry.bitmap.key, entry);
  };
  const destroy = (entry: Entry) => {
    if (!retained.delete(entry)) return;
    bytes -= entry.bitmap.bytes;
    entry.close();
  };
  const retire = (entry: Entry) => {
    if (entry.retired) return;
    entry.retired = true;
    entries.delete(entry.bitmap.key);
    if (entry.pins === 0) destroy(entry);
  };
  const lease = (entry: Entry): SnapshotBitmapLease => {
    entry.pins += 1;
    touchEntry(entry);
    let released = false;
    return Object.freeze({
      bitmap: entry.bitmap,
      release: () => {
        if (released) return;
        released = true;
        entry.pins -= 1;
        if (entry.retired && entry.pins === 0) destroy(entry);
      },
    });
  };
  const deliverLease = (entry: Entry) => {
    const reserved = lease(entry);
    return Promise.resolve().then(() => {
      if (isCurrentEntry(entry)) return reserved;
      reserved.release();
      return null;
    });
  };
  const settle = (job: Job, entry: Entry | null) => {
    if (job.state === 'finished') return;
    if (jobs.get(job.key) === job) jobs.delete(job.key);
    job.state = 'finished';
    // Reserve every requested lease before notifying subscribers or starting another decode.
    const acquirers = job.acquirers.splice(0);
    const leases = acquirers.map(() => entry ? lease(entry) : null);
    // A ready listener may synchronously clear/invalidate/dispose. Do not then deliver a
    // destroyed bitmap or an undisclosed lease that keeps an obsolete entry alive forever.
    void Promise.resolve().then(() => {
      const current = entry && isCurrentEntry(entry);
      if (!current) leases.forEach(reserved => reserved?.release());
      job.resolve(current ? entry.bitmap : null);
      acquirers.forEach((resolve, index) => resolve(current ? leases[index] : null));
    });
  };
  const rememberFailure = (key: string, code: SnapshotBitmapFailureCode) => {
    const attempts = (failures.get(key)?.attempts ?? 0) + 1;
    const terminal = code === 'invalid-source' || attempts >= maxAttempts;
    const failure: SnapshotBitmapFailure = Object.freeze({
      key, code, attempts,
      retryAt: terminal ? null : readNow() + retryDelayMs * Math.min(16, 2 ** (attempts - 1)),
    });
    failures.delete(key);
    failures.set(key, failure);
    while (failures.size > maxFailures) failures.delete(failures.keys().next().value!);
    return failure;
  };
  const fail = (job: Job, code: SnapshotBitmapFailureCode) => {
    if (disposed || jobs.get(job.key) !== job) return;
    const failure = rememberFailure(job.key, code);
    settle(job, null);
    notify({ key: job.key, status: 'failed' }, () => failures.get(job.key) === failure);
  };
  const makeRoom = (neededBytes: number) => {
    let pinnedBytes = bytes;
    let pinnedCount = retained.size;
    for (const entry of entries.values()) {
      if (entry.pins === 0) { pinnedBytes -= entry.bitmap.bytes; pinnedCount -= 1; }
    }
    // Never evict a resource in use and never exceed either residency budget.
    if (pinnedBytes + neededBytes > maxBytes || pinnedCount + 1 > maxEntries) return false;
    for (const entry of entries.values()) {
      if (bytes + neededBytes <= maxBytes && retained.size + 1 <= maxEntries) break;
      if (entry.pins === 0) retire(entry);
    }
    return bytes + neededBytes <= maxBytes && retained.size + 1 <= maxEntries;
  };
  const complete = (job: Job, decoded: DecodedSnapshotBitmap) => {
    const close = ownedRelease(decoded);
    if (disposed || jobs.get(job.key) !== job) { close(); return; }
    const width = decoded?.width;
    const height = decoded?.height;
    if (!decoded?.drawable || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
      || width < 1 || height < 1 || Math.max(width, height) > job.maxEdge) {
      close();
      fail(job, 'invalid-bitmap');
      return;
    }
    const neededBytes = width * height * 4;
    if (!makeRoom(neededBytes)) { close(); fail(job, 'capacity'); return; }
    // Eviction closes driver resources; a custom close callback may reenter the cache.
    if (disposed || clearing || jobs.get(job.key) !== job) { close(); return; }
    const bitmap: SnapshotBitmap = Object.freeze({ key: job.key, drawable: decoded.drawable, width, height, bytes: neededBytes });
    const entry: Entry = { bitmap, close, pins: 0, retired: false };
    entries.set(job.key, entry);
    retained.add(entry);
    bytes += neededBytes;
    failures.delete(job.key);
    settle(job, entry);
    notify({ key: job.key, status: 'ready' }, () => isCurrentEntry(entry));
  };
  const drain = () => {
    while (!disposed && active < concurrency && queue.length > 0) {
      const job = queue.shift()!;
      if (jobs.get(job.key) !== job || job.state !== 'queued') continue;
      job.state = 'active';
      active += 1;
      // The slot is reserved immediately, but a canceled job need not start browser I/O.
      void Promise.resolve().then(async () => {
        try {
          if (disposed || clearing || jobs.get(job.key) !== job) return;
          const decoded = await decode(job.source, job.maxEdge);
          complete(job, decoded);
        } catch (error) {
          fail(job, error instanceof BrowserSnapshotError ? error.code : 'decode');
        } finally {
          active -= 1;
          drain();
        }
      });
    }
  };
  const getJob = (source: string, requestedMaxEdge?: number): Job | null => {
    if (disposed || clearing) return null;
    const maxEdge = normalizeMaxEdge(requestedMaxEdge, defaultMaxEdge);
    const key = keyFor(source, maxEdge);
    const existing = jobs.get(key);
    if (existing) return existing;
    const failure = failures.get(key);
    if (failure && (failure.retryAt === null || readNow() < failure.retryAt)) return null;
    if (typeof source !== 'string' || source.trim().length === 0) {
      rememberFailure(key, 'invalid-source');
      return null;
    }
    // Canceled active decodes still own a slot until they actually finish. Counting only
    // the current-key map lets repeated clear/invalidate bypass this admission bound.
    if (active + queue.length >= maxPending) {
      rememberFailure(key, 'queue-full');
      return null;
    }
    let resolve: Job['resolve'] = () => {};
    const promise = new Promise<SnapshotBitmap | null>(done => { resolve = done; });
    const job: Job = { key, source, maxEdge, state: 'queued', promise, resolve, acquirers: [] };
    jobs.set(key, job);
    queue.push(job);
    drain();
    return job;
  };
  const cancel = (job: Job) => {
    if (job.state === 'queued') {
      const index = queue.indexOf(job);
      if (index !== -1) queue.splice(index, 1);
    }
    settle(job, null);
  };
  const clear = () => {
    if (clearing) return;
    clearing = true;
    try {
      for (const job of [...jobs.values()]) cancel(job);
      queue.length = 0;
      for (const entry of entries.values()) retire(entry);
      failures.clear();
    } finally {
      clearing = false;
    }
  };
  const findEntry = (source: string, maxEdge?: number) => (
    disposed || clearing ? undefined : entries.get(keyFor(source, maxEdge))
  );

  return {
    request: (source, maxEdge) => {
      const entry = findEntry(source, maxEdge);
      if (entry) {
        touchEntry(entry);
        return Promise.resolve().then(() => isCurrentEntry(entry) ? entry.bitmap : null);
      }
      return getJob(source, maxEdge)?.promise ?? Promise.resolve(null);
    },
    peek: (source, maxEdge) => findEntry(source, maxEdge)?.bitmap ?? null,
    acquire: (source, maxEdge) => {
      const entry = findEntry(source, maxEdge);
      if (entry) return deliverLease(entry);
      const job = getJob(source, maxEdge);
      return job ? new Promise(resolve => { job.acquirers.push(resolve); }) : Promise.resolve(null);
    },
    pin: (source, maxEdge) => {
      const entry = findEntry(source, maxEdge);
      return entry ? lease(entry) : null;
    },
    touch: (source, maxEdge) => {
      const entry = findEntry(source, maxEdge);
      if (entry) touchEntry(entry);
    },
    subscribe: listener => {
      if (!disposed) listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getFailure: (source, maxEdge) => failures.get(keyFor(source, maxEdge)) ?? null,
    invalidate: (source, maxEdge) => {
      const key = keyFor(source, maxEdge);
      const job = jobs.get(key);
      if (job) cancel(job);
      const entry = entries.get(key);
      if (entry) retire(entry);
      failures.delete(key);
    },
    clear,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      clear();
    },
    getStats: () => ({
      entries: entries.size,
      retainedEntries: retained.size,
      bytes,
      active,
      queued: queue.length,
      failures: failures.size,
      disposed,
    }),
  };
};
