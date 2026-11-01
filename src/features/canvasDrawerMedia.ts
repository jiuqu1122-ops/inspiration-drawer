import type { BufferItem } from '../types';
import { isCanvasAudioBufferItem } from '../utils/localMediaPaths';

export type CanvasDrawerMediaItem = BufferItem & {
  type: 'image' | 'video' | 'file';
};

export const isCanvasDrawerMediaItem = (item: BufferItem): item is CanvasDrawerMediaItem => (
  item.type === 'image'
    ? Boolean(item.thumbnail || item.url || item.path || item.sourceUrl || item.originalUrl)
    : item.type === 'video'
      ? Boolean(item.url || item.path || item.sourceUrl || item.originalUrl)
      : isCanvasAudioBufferItem(item) && Boolean(item.url || item.path || item.sourceUrl || item.originalUrl)
);

export const getCanvasDrawerMediaPreviewSource = (item: CanvasDrawerMediaItem) => (
  item.thumbnail
  || (item.type === 'image' ? item.url || item.sourceUrl || item.originalUrl : '')
  || ''
);

export const getCanvasDrawerMediaSource = (item: CanvasDrawerMediaItem) => (
  item.type !== 'image'
    ? item.url || item.path || item.sourceUrl || item.originalUrl || ''
    : item.url || item.thumbnail || item.path || item.sourceUrl || item.originalUrl || ''
);
