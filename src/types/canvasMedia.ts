import type { CanvasAiGeneratedOutput, CanvasImageItem } from '../features/canvasModel';
import type { BufferItem } from './index';

export type CanvasGeneratedListEntry = {
  id: string;
  canvasItem: CanvasImageItem;
  item: BufferItem;
  ai?: NonNullable<CanvasImageItem['ai']>;
};

export type ImageThumbnailFileResult = {
  path: string;
  url?: string;
  width: number;
  height: number;
  fingerprint?: string;
  file_size?: number;
  modified_at?: number;
  cacheHit?: boolean;
};

export type CanvasImageSourceCacheEntry = {
  src: string;
  quality: 'thumb' | 'preview' | 'original';
  path?: string;
  thumbnail?: string;
  size?: number;
};

export type CanvasNavPreview = { source: string; mediaType: 'image' | 'video' };

export type CanvasNavThumbnailCacheEntry = {
  signature: string;
  thumbnail: string;
  status: 'loading' | 'ready' | 'error' | 'empty';
};

export type CanvasAiOutputThumbnailJob = {
  key: string;
  canvasItemId?: string;
  outputIndex?: number;
  outputId?: string;
  matchSources?: string[];
  drawerItemId?: string;
  source: string;
  path?: string;
  attempt?: number;
  onSettled?: (patch: Partial<CanvasAiGeneratedOutput>) => void;
};
