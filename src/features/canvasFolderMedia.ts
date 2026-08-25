import type { BufferItem, Folder } from '../types';
import type { AssetListOptions } from '../services/assetsApi';
import {
  isCanvasDrawerMediaItem,
  type CanvasDrawerMediaItem,
} from './canvasDrawerMedia';
import { getDrawerFolderScopeIds } from './folderModel';

export const CANVAS_FOLDER_MEDIA_PAGE_SIZE = 24;

export const buildCanvasFolderMediaQuery = (
  folders: Folder[],
  folderId: string | undefined,
  fileType: 'image' | 'video',
  offset: number,
): AssetListOptions => ({
  ...(folderId
    ? { folder_ids: [...getDrawerFolderScopeIds(folders, folderId)].sort() }
    : { folder_id: 'all' }),
  file_type: fileType,
  sort: 'created_at_desc',
  offset,
  limit: CANVAS_FOLDER_MEDIA_PAGE_SIZE,
});

export const mergeCanvasFolderMediaItems = (
  current: BufferItem[],
  incoming: BufferItem[],
) => {
  const byId = new Map<string, CanvasDrawerMediaItem>();
  [...current, ...incoming]
    .filter(isCanvasDrawerMediaItem)
    .forEach(item => byId.set(item.id, item));
  return [...byId.values()].sort((a, b) => b.createdAt - a.createdAt);
};
