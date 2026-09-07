import { convertFileSrc } from '@tauri-apps/api/core';

import type { BufferItem, Folder } from '../../types';
import type { EagleFolderPayload, EagleImportMode, EagleItemPayload } from '../../types/eagle';
import { getFileExtension } from '../dragData';
import { normalizeLocalDragPath } from '../../utils/localMediaPaths';

const localFileUrl = (path: string) => (
  typeof window === 'undefined' ? path : convertFileSrc(path)
);

export type EagleFolderPlan = {
  folders: Folder[];
  newFolders: Folder[];
  folderIdMap: Map<string, string>;
};

export const planEagleFolders = (
  eagleFolders: EagleFolderPayload[],
  existingFolders: Folder[],
): EagleFolderPlan => {
  const folders = [...existingFolders];
  const newFolders: Folder[] = [];
  const folderIdMap = new Map<string, string>();
  const visit = (folder: EagleFolderPayload, parentId?: string) => {
    const name = String(folder.name || 'Eagle 文件夹').trim() || 'Eagle 文件夹';
    const existing = folders.find(candidate => (
      (candidate.parentId || '') === (parentId || '')
      && candidate.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()
    ));
    const resolved = existing || {
      id: globalThis.crypto.randomUUID(),
      name,
      color: '#f59e0b',
      parentId,
    };
    if (!existing) {
      folders.push(resolved);
      newFolders.push(resolved);
    }
    if (folder.id) folderIdMap.set(String(folder.id), resolved.id);
    folder.children?.forEach(child => visit(child, resolved.id));
  };
  eagleFolders.forEach(folder => visit(folder));
  return { folders, newFolders, folderIdMap };
};

const getFolderIds = (item: EagleItemPayload) => {
  const rawFolders = item.folders ?? item.folderIds ?? item.folderId ?? item.folder ?? [];
  const values = Array.isArray(rawFolders) ? rawFolders : [rawFolders];
  return values
    .map(value => typeof value === 'object' && value ? value.id : value)
    .map(value => String(value || '').trim())
    .filter(Boolean);
};

const getLocalPath = (item: EagleItemPayload, libraryPath?: string) => {
  const directPath = [
    item.filePath,
    item.path,
    item.url && /^file:/i.test(String(item.url)) ? item.url : '',
    item.metadataFilePath,
  ]
    .map(value => typeof value === 'string' ? normalizeLocalDragPath(value) : '')
    .find(Boolean) || '';
  if (directPath) return directPath;
  const id = String(item.id || item._id || '').trim();
  const name = String(item.name || '').trim();
  const ext = String(item.ext || item.extension || '').trim().replace(/^\./, '');
  const root = normalizeLocalDragPath(libraryPath || '').replace(/[\\/]+$/g, '');
  if (!root || !id || !name || !ext) return '';
  const separator = root.includes('\\') ? '\\' : '/';
  return `${root}${separator}images${separator}${id}.info${separator}${name}.${ext}`;
};

const getThumbnailPath = (item: EagleItemPayload) => (
  [item.thumbnailPath, item.thumbPath, item.previewPath]
    .map(value => typeof value === 'string' ? normalizeLocalDragPath(value) : '')
    .find(Boolean) || ''
);

const getItemType = (item: EagleItemPayload, filePath: string): BufferItem['type'] => {
  const ext = String(
    item.ext || item.extension || getFileExtension(filePath || item.name || '') || '',
  ).toLowerCase().replace(/^\./, '');
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'].includes(ext)) return 'video';
  return 'file';
};

const normalizeTimestamp = (value: unknown, fallback: number) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

export const normalizeEaglePage = (options: {
  entries: EagleItemPayload[];
  folderIdMap: Map<string, string>;
  libraryPath?: string;
  startedAt: number;
  startIndex: number;
  mode: EagleImportMode;
}) => {
  const assets: BufferItem[] = [];
  const failures: Array<{ filePath: string; reason: string }> = [];
  options.entries.forEach((entry, index) => {
    const externalId = String(entry.id || entry._id || '').trim();
    const filePath = normalizeLocalDragPath(getLocalPath(entry, options.libraryPath));
    if (!filePath) {
      failures.push({
        filePath: String(entry.filePath || entry.path || entry.name || externalId),
        reason: 'Eagle 素材缺少可用的原始路径',
      });
      return;
    }
    const thumbnailPath = getThumbnailPath(entry);
    const folderId = getFolderIds(entry).map(id => options.folderIdMap.get(id)).find(Boolean);
    const name = String(
      entry.name || filePath.split(/[\\/]/).pop() || `Eagle 素材 ${options.startIndex + index + 1}`,
    ).trim();
    const tags = Array.isArray(entry.tags)
      ? entry.tags.map((tag: unknown) => String(tag || '').trim()).filter(Boolean)
      : [];
    const sourceUrl = typeof entry.url === 'string' && /^https?:\/\//i.test(entry.url)
      ? entry.url
      : undefined;
    const remarks = [
      entry.annotation,
      tags.length > 0 ? `#${tags.join(' #')}` : '',
      entry.url ? `来源：${entry.url}` : '',
    ].filter((value): value is string => typeof value === 'string' && Boolean(value.trim()));
    const createdAt = normalizeTimestamp(
      entry.importedAt || entry.createdAt || entry.modificationTime || entry.modifiedAt,
      options.startedAt + options.startIndex + index,
    );
    assets.push({
      id: globalThis.crypto.randomUUID(),
      type: getItemType(entry, filePath),
      content: name,
      name,
      path: filePath,
      url: localFileUrl(filePath),
      thumbnail: thumbnailPath ? localFileUrl(thumbnailPath) : undefined,
      sourceUrl,
      originalUrl: sourceUrl,
      remark: remarks.join('\n') || undefined,
      remarks: remarks.length > 0 ? remarks : undefined,
      folderId,
      createdAt,
      isQuickAccess: false,
      externalProvider: 'eagle',
      externalId: externalId || undefined,
      externalPath: filePath,
      eagleId: externalId || undefined,
      eagleSourcePath: filePath,
      eagleSourceUrl: sourceUrl || (typeof entry.url === 'string' ? entry.url : undefined),
      eagleThumbnailPath: thumbnailPath || undefined,
      eagleImportMode: options.mode,
      sourceAvailability: entry.sourceAvailability === 'missing' ? 'missing' : 'available',
    });
  });
  return { assets, failures };
};
