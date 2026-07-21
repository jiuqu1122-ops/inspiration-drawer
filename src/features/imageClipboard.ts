import { Image as TauriImage } from '@tauri-apps/api/image';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { writeImage } from '@tauri-apps/plugin-clipboard-manager';

const isLocalImagePath = (source: string) => (
  /^[a-zA-Z]:[\\/]/.test(source)
  || /^\\\\/.test(source)
  || /^\//.test(source)
  || /^file:/i.test(source)
);

const isNativeLocalImageSource = (source: string) => (
  isLocalImagePath(source)
  || /^asset:\/\//i.test(source)
  || /asset\.localhost/i.test(source)
);

export const writeLocalImageFileToClipboard = async (source: string) => {
  const value = source.trim();
  if (!value || !isNativeLocalImageSource(value)) return false;
  try {
    await invoke('copy_files_to_clipboard', { paths: [value] });
    return true;
  } catch (error) {
    console.warn('local image file clipboard copy failed:', error);
    return false;
  }
};

const getFetchableImageSource = (source: string) => {
  const value = source.trim();
  if (!value) throw new Error('empty image source');
  if (!isLocalImagePath(value)) return value;
  const localPath = value.replace(/^file:\/\/+?/i, '').replace(/^\/([a-zA-Z]:[\\/])/, '$1');
  return convertFileSrc(localPath);
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

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error || new Error('data url conversion failed'));
  reader.readAsDataURL(blob);
});

const readImageSourceBlob = async (source: string) => {
  const response = await fetch(getFetchableImageSource(source));
  if (!response.ok) throw new Error(`failed to read image: ${response.status}`);
  const blob = await response.blob();
  if (blob.size === 0) throw new Error('empty image bytes');
  if (!blob.type.startsWith('image/') && !/^data:image\//i.test(source.trim())) {
    throw new Error('source is not an image');
  }
  return blob;
};

export const imageSourceToPngDataUrl = async (source: string) => {
  const blob = await readImageSourceBlob(source);
  const pngBytes = await blobToPngBytes(blob);
  return await blobToDataUrl(new Blob([pngBytes], { type: 'image/png' }));
};

const createClipboardImageFromSource = async (source: string) => {
  const blob = await readImageSourceBlob(source);
  const pngBytes = await blobToPngBytes(blob);
  return await TauriImage.fromBytes(pngBytes);
};

/**
 * Clipboard-plugin fallback. Decoded native image resources are closed after
 * each write so repeated copies of large images cannot accumulate in memory.
 */
export const writeImageSourceToClipboard = async (source: string) => {
  const image = await createClipboardImageFromSource(source);
  try {
    await writeImage(image);
  } finally {
    await image.close().catch(() => {});
  }
};
