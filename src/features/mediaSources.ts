import { convertFileSrc } from '@tauri-apps/api/core';
import type { BufferItem } from '../types';

export type ImageSourceOptions = {
  allowOriginalFallback?: boolean;
};

export const isDataImageSource = (value?: unknown) => (
  /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(String(value || '').trim())
);

export const isHttpImageSource = (value?: unknown) => (
  /^https?:\/\//i.test(String(value || '').trim())
);

export const getOriginalMediaSource = (item?: Partial<BufferItem> | null) => {
  if (!item) return '';
  return (
    item.url
    || (item.path ? convertFileSrc(item.path) : '')
    || item.thumbnail
    || item.content
    || ''
  ).trim();
};

export const getThumbnailSource = (item?: Partial<BufferItem> | null) => (
  String(item?.thumbnail || '').trim()
);

export const getImageListSource = (
  item?: Partial<BufferItem> | null,
  options: ImageSourceOptions = {},
) => {
  const thumbnail = getThumbnailSource(item);
  if (thumbnail) return thumbnail;
  return options.allowOriginalFallback ? getOriginalMediaSource(item) : '';
};

export const getPreviewPlaceholderSource = (item?: Partial<BufferItem> | null) => (
  getThumbnailSource(item) || getOriginalMediaSource(item)
);

export const getPreviewOriginalSource = (item?: Partial<BufferItem> | null) => (
  getOriginalMediaSource(item) || getThumbnailSource(item)
);
