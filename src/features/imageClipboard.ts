import { Image as TauriImage } from '@tauri-apps/api/image';
import { convertFileSrc } from '@tauri-apps/api/core';
import { writeImage } from '@tauri-apps/plugin-clipboard-manager';

const MAX_CLIPBOARD_IMAGE_CACHE_SIZE = 12;

type CachedClipboardImage = {
  promise: Promise<TauriImage>;
  lastUsed: number;
};

const clipboardImageCache = new Map<string, CachedClipboardImage>();

const isLocalImagePath = (source: string) => (
  /^[a-zA-Z]:[\\/]/.test(source)
  || /^\\\\/.test(source)
  || /^\//.test(source)
  || /^file:/i.test(source)
);

const getFetchableImageSource = (source: string) => {
  const value = source.trim();
  if (!value) throw new Error('empty image source');
  if (!isLocalImagePath(value)) return value;
  const localPath = value.replace(/^file:\/\/+?/i, '').replace(/^\/([a-zA-Z]:[\\/])/, '$1');
  return convertFileSrc(localPath);
};

const getCacheKey = (source: string) => {
  const value = source.trim();
  if (!value) return '';
  if (!/^data:image\//i.test(value)) return value;
  return `${value.slice(0, 96)}:${value.length}:${value.slice(-96)}`;
};

const trimClipboardImageCache = () => {
  if (clipboardImageCache.size <= MAX_CLIPBOARD_IMAGE_CACHE_SIZE) return;
  const entries = Array.from(clipboardImageCache.entries()).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  const removeCount = entries.length - MAX_CLIPBOARD_IMAGE_CACHE_SIZE;
  entries.slice(0, removeCount).forEach(([key, cached]) => {
    clipboardImageCache.delete(key);
    cached.promise.then(image => image.close()).catch(() => {});
  });
};

const canvasToPngBytes = async (canvas: HTMLCanvasElement) => {
  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error('png conversion failed'));
    }, 'image/png');
  });
  return new Uint8Array(await pngBlob.arrayBuffer());
};

const blobToPngBytesWithImageBitmap = async (blob: Blob) => {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  try {
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas context unavailable');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    return await canvasToPngBytes(canvas);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    bitmap.close();
  }
};

const blobToPngBytesWithImageElement = async (blob: Blob) => {
  const objectUrl = URL.createObjectURL(blob);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const next = new Image();
    next.onload = () => resolve(next);
    next.onerror = () => reject(new Error('image decode failed'));
    next.decoding = 'async';
    next.src = objectUrl;
  });
  const canvas = document.createElement('canvas');
  try {
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error('empty image');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas context unavailable');
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0);
    return await canvasToPngBytes(canvas);
  } finally {
    URL.revokeObjectURL(objectUrl);
    canvas.width = 0;
    canvas.height = 0;
  }
};

const blobToPngBytes = async (blob: Blob) => {
  if (typeof createImageBitmap === 'function') {
    try {
      return await blobToPngBytesWithImageBitmap(blob);
    } catch (error) {
      console.warn('createImageBitmap png conversion failed:', error);
    }
  }
  return await blobToPngBytesWithImageElement(blob);
};

const createClipboardImageFromSource = async (source: string) => {
  const response = await fetch(getFetchableImageSource(source));
  if (!response.ok) throw new Error(`读取图片失败: ${response.status}`);
  const blob = await response.blob();
  if (blob.size === 0) throw new Error('empty image bytes');
  if (!blob.type.startsWith('image/') && !/^data:image\//i.test(source.trim())) {
    throw new Error('source is not an image');
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  try {
    return await TauriImage.fromBytes(bytes);
  } catch (directError) {
    if (typeof document === 'undefined') throw directError;
    const pngBytes = await blobToPngBytes(blob);
    return await TauriImage.fromBytes(pngBytes);
  }
};

/**
 * Fast image clipboard path. This keeps normal image copies in the Tauri
 * clipboard plugin, converts non-PNG sources before falling back elsewhere,
 * and caches decoded image resources for repeated preview copies.
 */
export const writeImageSourceToClipboard = async (source: string) => {
  const key = getCacheKey(source);
  const cached = clipboardImageCache.get(key);
  const promise = cached?.promise || createClipboardImageFromSource(source);
  clipboardImageCache.set(key, { promise, lastUsed: Date.now() });
  trimClipboardImageCache();

  try {
    await writeImage(await promise);
  } catch {
    clipboardImageCache.delete(key);
    const freshPromise = createClipboardImageFromSource(source);
    clipboardImageCache.set(key, { promise: freshPromise, lastUsed: Date.now() });
    await writeImage(await freshPromise);
    trimClipboardImageCache();
  }
};
