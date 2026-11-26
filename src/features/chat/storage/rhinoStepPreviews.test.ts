import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const openModule = () => import('./rhinoStepPreviews');
// Genuine standalone 4x2 images. Stub only browser interfaces unavailable in Vitest's Node environment.
const png = { mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAADwyuo0AAAAFElEQVR42mOUcIljgAEmOOt56SkAFeEC5EVKX5sAAAAASUVORK5CYII=' };
const jpg = { mimeType: 'image/jpeg', data: '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAL/xAAeEAABBAEFAAAAAAAAAAAAAAABAAIDBAUHERIhYf/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGBEAAwEBAAAAAAAAAAAAAAAAAAIEM3H/2gAMAwEAAhEDEQA/AK0/xlC7gZ5LVGtPILTmh0sTXEDi3rcj0oiKXXu3RJ8lP//Z' };
const webp = { mimeType: 'image/webp', data: 'UklGRkgAAABXRUJQVlA4IDwAAACwAQCdASoEAAIAAUAmJQBOgCHfTAwAAP70x9IoNO8ndmXWthMI7IxQ7ZCVrwHBPc8vlSOd2cNx4l0EgAA=' };
const output = (size = 50) => new Blob([new Uint8Array(size)], { type: 'image/jpeg' });

function renderer(width = 4, height = 2, blob = output()) {
  const bitmap = { width, height, close: vi.fn() };
  const decode = vi.fn(async (_: Blob) => bitmap);
  const draw = vi.fn();
  const encode = vi.fn((done: BlobCallback) => done(blob));
  vi.stubGlobal('createImageBitmap', decode);
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => ({ drawImage: draw, fillRect: vi.fn() }), toBlob: encode }) });
  return { bitmap, decode, draw, encode };
}

// Minimal commit/abort model, with the backing store independent of module state.
function database() {
  let rows = new Map<string, unknown>();
  let abort = false;
  const transaction = () => {
    const staged = new Map(rows);
    const store = {
      get: (key: string) => {
        const req = { result: structuredClone(staged.get(key)), onsuccess: null as (() => void) | null };
        queueMicrotask(() => req.onsuccess?.());
        return req;
      },
      put: (value: unknown, key: string) => staged.set(key, structuredClone(value)),
      delete: (key: string) => staged.delete(key),
    };
    const tx = { objectStore: () => store, abort: vi.fn(), onabort: null as (() => void) | null, oncomplete: null as (() => void) | null };
    queueMicrotask(() => queueMicrotask(() => {
      if (abort) tx.onabort?.(); else { rows = staged; tx.oncomplete?.(); }
    }));
    return tx;
  };
  const db = { transaction, close: vi.fn() };
  vi.stubGlobal('indexedDB', { open: () => {
    const req = { result: db, onsuccess: null as (() => void) | null };
    queueMicrotask(() => req.onsuccess?.());
    return req;
  } });
  return { records: () => [...rows.values()], abort: () => { abort = true; } };
}

beforeEach(() => { vi.resetModules(); vi.stubGlobal('indexedDB', undefined); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Rhino step previews', () => {
  it.each([png, jpg, webp])('decodes local $mimeType bytes, draws the whole bitmap and stores only the new blob', async image => {
    const { saveRhinoStepPreviews: save, loadRhinoStepPreviews: load } = await openModule();
    const { bitmap, decode, draw } = renderer(1080, 1920);
    expect(await save('message', 'call', [image])).toBe(1);
    const input = decode.mock.calls[0][0];
    expect(input.type).toBe(image.mimeType);
    expect(btoa(String.fromCharCode(...new Uint8Array(await input.arrayBuffer())))).toBe(image.data);
    expect(draw).toHaveBeenCalledWith(bitmap, 0, 0, 540, 960);
    expect(bitmap.close).toHaveBeenCalledOnce();
    const [thumb] = await load('message', 'call');
    expect([thumb.type, thumb.size]).toEqual(['image/jpeg', 50]);
  });

  it('does not enlarge small inputs, inspect a third image, or return the internal blob array', async () => {
    const { saveRhinoStepPreviews: save, loadRhinoStepPreviews: load } = await openModule();
    const { draw, bitmap, decode, encode } = renderer();
    encode.mockImplementationOnce(cb => cb(output(3))).mockImplementationOnce(cb => cb(output(5)));
    expect(await save('m', 'c', [png, jpg, webp])).toBe(2);
    expect(decode).toHaveBeenCalledTimes(2);
    expect(draw).toHaveBeenCalledWith(bitmap, 0, 0, 4, 2);
    const loaded = await load('m', 'c');
    expect(loaded.map(b => b.size)).toEqual([3, 5]);
    loaded.pop();
    expect(await load('m', 'c')).toHaveLength(2);
  });

  it('treats unsupported APIs, bad bytes, unsafe dimensions and missing images as misses', async () => {
    const { saveRhinoStepPreviews: save, loadRhinoStepPreviews: load } = await openModule();
    vi.stubGlobal('createImageBitmap', undefined);
    vi.stubGlobal('Image', undefined);
    expect(await save('m', 'c', [png])).toBe(0);
    const { decode } = renderer();
    const huge = Uint8Array.from(atob(png.data), ch => ch.charCodeAt(0));
    const header = new DataView(huge.buffer);
    header.setUint32(16, 8193);
    for (const image of [{ ...png, data: 'not base64!' }, { ...png, data: 'aGVsbG8=' }, { ...png, data: '' },
      { ...png, mimeType: 'image/jpeg' }, { ...png, mimeType: 'image/svg+xml' }, { ...png, data: 'A'.repeat(6_000_000) },
      { ...png, data: btoa(String.fromCharCode(...huge)) }]) expect(await save('m', 'c', [image])).toBe(0);
    header.setUint32(16, 5000); header.setUint32(20, 5000);
    expect(await save('m', 'c', [{ ...png, data: btoa(String.fromCharCode(...huge)) }])).toBe(0);
    expect(await save('m', 'c', [])).toBe(0);
    expect(await save(' ', 'c', [png])).toBe(0);
    expect(decode).not.toHaveBeenCalled();
    expect(await load('m', 'c')).toEqual([]);
    decode.mockRejectedValueOnce(new Error('corrupt raster'));
    expect(await save('m', 'c', [png, jpg])).toBe(1);
    expect(await save('m', 'c', [])).toBe(0);
    expect(await load('m', 'c')).toHaveLength(1);
  });

  it('retries oversized output at lower resolution and never saves oversized or empty blobs', async () => {
    const { saveRhinoStepPreviews: save } = await openModule();
    const { draw, bitmap, encode } = renderer(1800, 900, output(262145));
    encode.mockImplementationOnce(cb => cb(output(262145))).mockImplementationOnce(cb => cb(output(262144)));
    expect(await save('m', 'ok', [png])).toBe(1);
    expect(draw).toHaveBeenCalledWith(bitmap, 0, 0, 720, 360);
    expect(await save('m', 'oversize', [png])).toBe(0);
    encode.mockImplementation(cb => cb(output(0)));
    expect(await save('m', 'empty', [png])).toBe(0);
  });

  it.each(['memory', 'indexedDB'])('isolates compound keys and deletes only exact conversation matches (%s)', async mode => {
    const db = mode === 'indexedDB' ? database() : undefined;
    let api = await openModule(); renderer();
    for (const [m, c, owner] of [['m:c', 'x', 'A'], ['m', 'c:x', 'A-long'], ['m', 'x', 'A'], ['n', 'x', undefined]] as const) {
      expect(await api.saveRhinoStepPreviews(m, c, [png], owner)).toBe(1);
    }
    if (db) {
      expect(JSON.stringify(db.records())).not.toContain(png.data);
      vi.resetModules(); api = await openModule(); // No memory entries survive this reload.
      expect(await api.loadRhinoStepPreviews('m:c', 'x')).toHaveLength(1);
    }
    await api.deleteRhinoConversationPreviews('A');
    expect(await api.loadRhinoStepPreviews('m:c', 'x')).toEqual([]);
    expect(await api.loadRhinoStepPreviews('m', 'x')).toEqual([]);
    expect(await api.loadRhinoStepPreviews('m', 'c:x')).toHaveLength(1);
    expect(await api.loadRhinoStepPreviews('n', 'x')).toHaveLength(1);
  });

  it.each([['memory', 24, 1], ['memory', 8, 262144], ['disk', 128, 1], ['disk', 32, 262144]] as const)(
    'evicts oldest on the %s count/byte boundary (%i steps of two %i-byte images)', async (mode, capacity, size) => {
      if (mode === 'disk') database();
      const { saveRhinoStepPreviews: save, loadRhinoStepPreviews: load } = await openModule();
      renderer(4, 2, output(size));
      for (let i = 0; i < capacity; i++) expect(await save('m', String(i), [png, jpg])).toBe(2);
      expect(await save('m', '0', [jpg, png])).toBe(2); // refresh, not a duplicate
      expect(await load('m', '1')).toHaveLength(2);
      expect(await save('m', 'new', [png, jpg])).toBe(2);
      expect(await load('m', '1')).toEqual([]);
      expect(await load('m', '0')).toHaveLength(2);
      expect(await load('m', 'new')).toHaveLength(2);
    });

  it('falls back after a failed DB commit', async () => {
    const db = database(); db.abort(); renderer();
    const { saveRhinoStepPreviews: save, loadRhinoStepPreviews: load } = await openModule();
    expect(await save('m', 'c', [png])).toBe(1);
    expect(await load('m', 'c')).toHaveLength(1);
    expect(db.records()).toEqual([]);
  });

  it.each(['blocked', 'silent'])('bounds a %s IDB open and closes late connections without starting writes', async mode => {
    const { saveRhinoStepPreviews: save, loadRhinoStepPreviews: load } = await openModule();
    vi.useFakeTimers(); renderer();
    const db = { close: vi.fn(), transaction: vi.fn() };
    const req = { result: db, onblocked: vi.fn(), onsuccess: vi.fn() };
    vi.stubGlobal('indexedDB', { open: () => { if (mode === 'blocked') queueMicrotask(() => req.onblocked()); return req; } });
    const result = save('m', 'c', [png]);
    await vi.advanceTimersByTimeAsync(mode === 'silent' ? 900 : 0);
    expect(await result).toBe(1);
    req.onsuccess();
    expect(db.close).toHaveBeenCalledOnce();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(await load('m', 'c')).toHaveLength(1);
  });

  it('aborts stalled transactions without letting a concurrent delete repopulate the memory fallback', async () => {
    const { saveRhinoStepPreviews: save, loadRhinoStepPreviews: load, deleteRhinoConversationPreviews: del } = await openModule();
    vi.useFakeTimers(); renderer();
    const abort = vi.fn();
    const db = { close: vi.fn(), transaction: () => ({ abort, objectStore: () => ({ get: () => ({}) }) }) };
    vi.stubGlobal('indexedDB', { open: () => {
      const req = { result: db, onsuccess: vi.fn() };
      queueMicrotask(() => req.onsuccess());
      return req;
    } });
    const saved = save('m', 'c', [png], 'owner');
    await vi.advanceTimersByTimeAsync(0); // The readwrite transaction has begun but has not committed.
    const deleted = del('owner');
    await vi.advanceTimersByTimeAsync(900);
    await deleted;
    expect(await saved).toBe(0);
    expect(abort).toHaveBeenCalledTimes(2);
    vi.stubGlobal('indexedDB', undefined);
    expect(await load('m', 'c')).toEqual([]);
  });

  it('bounds pending decoder and encoder callbacks, closing a late bitmap', async () => {
    const { saveRhinoStepPreviews: save } = await openModule();
    vi.useFakeTimers();
    const { bitmap, decode, encode, draw } = renderer();
    let resume!: (value: typeof bitmap) => void;
    decode.mockImplementationOnce(() => new Promise(resolve => { resume = resolve; }));
    const slow = save('m', 'c', [png]);
    await vi.advanceTimersByTimeAsync(1300);
    expect(await slow).toBe(0);
    resume(bitmap); await Promise.resolve();
    expect(bitmap.close).toHaveBeenCalledOnce(); expect(draw).not.toHaveBeenCalled();
    encode.mockImplementation(() => undefined);
    const slowEncoder = save('m', 'c', [png]);
    await vi.advanceTimersByTimeAsync(800);
    expect(await slowEncoder).toBe(0);
    expect(bitmap.close).toHaveBeenCalledTimes(2);
  });

  it('does not let saves during deletion or late decoder results resurrect the deleted conversation', async () => {
    const { saveRhinoStepPreviews: save, loadRhinoStepPreviews: load, deleteRhinoConversationPreviews: del } = await openModule();
    const { bitmap, decode } = renderer();
    let resume!: (value: typeof bitmap) => void;
    decode.mockImplementationOnce(() => new Promise(resolve => { resume = resolve; }));
    const before = save('m', 'c', [png], 'A');
    const deletion = del('A');
    expect(await save('m', 'other-call', [png], 'A')).toBe(0);
    await deletion; resume(bitmap);
    expect(await before).toBe(0);
    expect(await load('m', 'c')).toEqual([]);
  });
});
