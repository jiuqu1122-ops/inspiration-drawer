/** Local, disposable UI previews. Only canvas-encoded blobs cross the storage boundary. */
type InputImage = { mimeType: string; data: string };
type Entry = { key: string; conversationId?: string; bytes: number };
type MemoryEntry = Entry & { blobs: Blob[] };

const MiB = 1024 * 1024;
const MAX_SOURCE = 4 * MiB;
const MAX_PREVIEW = 256 * 1024;
const STORE = 'previews';
const MANIFEST = 'manifest'; // Step keys are JSON-encoded pairs, never this string.
const memory: MemoryEntry[] = [];
const pending = new Map<string, { conversationId?: string }>();
const deleting = new Map<string, number>();
const validId = (id: string) => typeof id === 'string' && !!id.trim() && id.length <= 512;
const validSize = (w: number, h: number) => w > 0 && h > 0 && w <= 8192 && h <= 8192 && w * h <= 16 * MiB;

// Check the declared raster dimensions before allowing a small compressed file to allocate a bitmap.
// The browser decoder, not this header check, determines whether the image actually decodes.
function validHeader(b: Uint8Array, mime: string) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tag = (i: number) => v.getUint32(i);
  if (mime === 'image/png') {
    return b.length >= 33 && tag(0) === 0x89504e47 && tag(4) === 0x0d0a1a0a && tag(8) === 13
      && tag(12) === 0x49484452 && validSize(tag(16), tag(20));
  }
  if (mime === 'image/webp') {
    if (b.length < 25 || tag(0) !== 0x52494646 || tag(8) !== 0x57454250) return false;
    const chunk = tag(12);
    if (chunk === 0x56503858 && b.length >= 30) { // VP8X: two little-endian 24-bit fields
      const u24 = (i: number) => v.getUint16(i, true) + b[i + 2] * 65536;
      return validSize(1 + u24(24), 1 + u24(27));
    }
    if (chunk === 0x5650384c && b[20] === 0x2f) { // VP8L
      const bits = v.getUint32(21, true);
      return validSize(1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff));
    }
    return chunk === 0x56503820 && b.length >= 30 && b[23] === 0x9d && b[24] === 1 && b[25] === 0x2a
      && validSize(v.getUint16(26, true) & 0x3fff, v.getUint16(28, true) & 0x3fff);
  }
  if (mime !== 'image/jpeg' || b[0] !== 0xff || b[1] !== 0xd8) return false;
  for (let i = 2; i + 4 < b.length && b[i] === 0xff;) {
    while (b[i] === 0xff) i++;
    const marker = b[i++];
    if (marker === 0xda || marker === 0xd9 || i + 2 > b.length) break;
    const size = v.getUint16(i);
    if (size < 2 || i + size > b.length) break;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return size >= 8 && validSize(v.getUint16(i + 5), v.getUint16(i + 3));
    }
    i += size;
  }
  return false;
}

// Some webviews never settle a decoder/encoder callback. Release even a bitmap delivered too late.
function bounded<T>(work: Promise<T>, ms: number, discard?: (value: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let expired = false;
    const timer = setTimeout(() => { expired = true; reject(new Error('Preview timed out')); }, ms);
    work.then(value => { clearTimeout(timer); if (expired) discard?.(value); else resolve(value); },
      error => { clearTimeout(timer); reject(error); });
  });
}

async function thumbnail(image: InputImage): Promise<Blob | undefined> {
  let bitmap: ImageBitmap | undefined;
  try {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined' || !image
      || !['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType) || typeof image.data !== 'string'
      || !image.data.length || image.data.length > 4 * Math.ceil(MAX_SOURCE / 3)) return;
    const binary = atob(image.data);
    if (!binary.length || binary.length > MAX_SOURCE) return;
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < bytes.length; i++) bytes[i] = binary.charCodeAt(i);
    if (!validHeader(bytes, image.mimeType)) return;
    bitmap = await bounded(createImageBitmap(new Blob([bytes], { type: image.mimeType })), 1200, late => late.close());
    if (!validSize(bitmap.width, bitmap.height)) return;
    const canvas = document.createElement('canvas');
    for (const [edge, quality] of [[960, 0.85], [720, 0.72]]) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#fff'; // JPEG has no alpha: keep transparent line drawings readable.
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await bounded(new Promise<Blob | null>(done => canvas.toBlob(done, 'image/jpeg', quality)), 750);
      if (blob && blob.size && blob.size <= MAX_PREVIEW) return blob;
    }
  } catch { /* Optional UI only: malformed input, unavailable decoder or encoder. */ }
  finally { bitmap?.close(); }
}

// One deadline covers both opening and committing. Never start late work after a blocked/timed-out open.
function access<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    let db: IDBDatabase | undefined, tx: IDBTransaction | undefined, finished = false;
    const fail = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { tx?.abort(); } catch { /* already inactive */ }
      db?.close();
      reject(new Error('Preview store unavailable'));
    };
    const timer = setTimeout(fail, 800);
    try {
      const open = indexedDB.open('drawer-rhino-step-previews', 1);
      open.onerror = open.onblocked = fail;
      open.onupgradeneeded = () => {
        if (finished) open.transaction?.abort();
        else open.result.createObjectStore(STORE);
      };
      open.onsuccess = () => {
        db = open.result;
        if (finished) { db.close(); return; }
        try {
          tx = db.transaction(STORE, mode);
          tx.onabort = fail;
          const req = run(tx.objectStore(STORE));
          tx.oncomplete = () => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            db?.close();
            resolve(req.result);
          };
        } catch { fail(); }
      };
    } catch { fail(); }
  });
}

// Manifest and blobs change in the same readwrite transaction (also across windows).
function editManifest(edit: (rows: Entry[], store: IDBObjectStore) => void) {
  return access('readwrite', store => {
    const req: IDBRequest<Entry[] | undefined> = store.get(MANIFEST);
    req.onsuccess = () => {
      const rows = req.result ?? [];
      edit(rows, store);
      store.put(rows, MANIFEST);
    };
    return req;
  });
}

function remove<T>(rows: T[], matches: (row: T) => boolean) {
  for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i])) rows.splice(i, 1);
}

// FIFO by last successful save; reads do not rewrite the database or load unrelated blobs.
function retain<T extends Entry>(rows: T[], entry: T, count: number, budget: number, evict?: (key: string) => void) {
  remove(rows, row => row.key === entry.key);
  rows.push(entry);
  let bytes = rows.reduce((sum, row) => sum + row.bytes, 0);
  while (rows.length > count || bytes > budget) {
    const oldest = rows.shift()!;
    bytes -= oldest.bytes;
    evict?.(oldest.key);
  }
}

/** First two inputs only. Returns the number actually retained; empty/invalid input is a no-op.
 * Pass the conversation ID on every save that should participate in conversation deletion. */
export async function saveRhinoStepPreviews(messageId: string, callId: string, images: readonly InputImage[], conversationId?: string): Promise<number> {
  if (!validId(messageId) || !validId(callId) || !Array.isArray(images) || !images.length
    || (conversationId !== undefined && (!validId(conversationId) || deleting.has(conversationId)))) return 0;
  const key = JSON.stringify([messageId, callId]);
  const token = { conversationId };
  pending.set(key, token);
  const current = () => pending.get(key) === token;
  try {
    const blobs = (await Promise.all(images.slice(0, 2).map(thumbnail))).filter((b): b is Blob => !!b);
    if (!blobs.length || !current()) return 0;
    const entry = { key, conversationId, bytes: blobs.reduce((sum, b) => sum + b.size, 0) };
    try {
      await editManifest((rows, store) => {
        if (!current()) return;
        retain(rows, entry, 128, 16 * MiB, old => store.delete(old));
        store.put(blobs, key);
      });
      if (current()) remove(memory, row => row.key === key);
    } catch {
      if (current()) retain(memory, { ...entry, blobs }, 24, 4 * MiB);
    }
    return current() ? blobs.length : 0;
  } catch { return 0; }
  finally { if (current()) pending.delete(key); }
}

export async function loadRhinoStepPreviews(messageId: string, callId: string): Promise<Blob[]> {
  if (!validId(messageId) || !validId(callId)) return [];
  const key = JSON.stringify([messageId, callId]);
  const cached = memory.find(row => row.key === key);
  if (cached) return cached.blobs.slice();
  try { return (await access<Blob[] | undefined>('readonly', store => store.get(key))) ?? []; }
  catch { return []; }
}

/** Best effort; invalidate in-flight saves before starting deletion, including their memory fallbacks. */
export async function deleteRhinoConversationPreviews(conversationId: string): Promise<void> {
  if (!validId(conversationId)) return;
  deleting.set(conversationId, (deleting.get(conversationId) ?? 0) + 1);
  for (const [key, token] of pending) if (token.conversationId === conversationId) pending.delete(key);
  remove(memory, row => row.conversationId === conversationId);
  try {
    await editManifest((rows, store) => remove(rows, row => {
      if (row.conversationId !== conversationId) return false;
      store.delete(row.key);
      return true;
    }));
  } catch { /* May be memory-only. */ }
  finally {
    const remaining = deleting.get(conversationId)! - 1;
    if (remaining) deleting.set(conversationId, remaining); else deleting.delete(conversationId);
  }
}
