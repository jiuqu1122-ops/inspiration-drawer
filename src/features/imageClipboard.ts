import { Image as TauriImage } from '@tauri-apps/api/image';
import { convertFileSrc } from '@tauri-apps/api/core';
import { writeImage } from '@tauri-apps/plugin-clipboard-manager';

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

/**
 * Fast image clipboard path. This stays inside the Tauri process and avoids
 * starting a PowerShell process for every copy operation.
 */
export const writeImageSourceToClipboard = async (source: string) => {
  const response = await fetch(getFetchableImageSource(source));
  if (!response.ok) throw new Error(`读取图片失败: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error('empty image bytes');
  const image = await TauriImage.fromBytes(bytes);
  await writeImage(image);
};
