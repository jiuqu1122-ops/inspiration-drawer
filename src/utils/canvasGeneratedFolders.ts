import type { Folder } from '../types';

export const AI_GENERATED_FOLDER_ID = 'ai_generated_images';
export const AI_GENERATED_FOLDER_NAME = 'AI生图';
export const AI_GENERATED_FOLDER_COLOR = '#06b6d4';

const CANVAS_GENERATED_FOLDER_ID_PREFIX = `${AI_GENERATED_FOLDER_ID}:canvas:`;

const normalizeCanvasId = (canvasId?: string | null) => canvasId?.trim() || 'default';

export const getCanvasGeneratedImageFolderId = (canvasId?: string | null) => (
  `${CANVAS_GENERATED_FOLDER_ID_PREFIX}${normalizeCanvasId(canvasId)}`
);

export const getCanvasGeneratedImageFolderName = (
  canvasName?: string | null,
  canvasId?: string | null,
) => {
  const cleanName = canvasName?.trim();
  if (cleanName) return cleanName;
  return normalizeCanvasId(canvasId) === 'default' ? '默认画布' : '未命名画布';
};

export const getAiGeneratedImageFolderIds = (folders: Folder[]) => {
  const rootIds = new Set([
    AI_GENERATED_FOLDER_ID,
    ...folders
      .filter(folder => !folder.parentId && folder.name === AI_GENERATED_FOLDER_NAME)
      .map(folder => folder.id),
  ]);
  const folderIds = new Set(rootIds);
  let changed = true;
  while (changed) {
    changed = false;
    folders.forEach(folder => {
      if (!folder.parentId || !folderIds.has(folder.parentId) || folderIds.has(folder.id)) return;
      folderIds.add(folder.id);
      changed = true;
    });
  }
  return folderIds;
};

export const ensureCanvasGeneratedImageFolders = (
  folders: Folder[],
  canvasId?: string | null,
  canvasName?: string | null,
) => {
  const existingRoot = folders.find(folder => folder.id === AI_GENERATED_FOLDER_ID)
    || folders.find(folder => !folder.parentId && folder.name === AI_GENERATED_FOLDER_NAME);
  const rootFolder: Folder = existingRoot || {
    id: AI_GENERATED_FOLDER_ID,
    name: AI_GENERATED_FOLDER_NAME,
    color: AI_GENERATED_FOLDER_COLOR,
  };
  const folderId = getCanvasGeneratedImageFolderId(canvasId);
  const folderName = getCanvasGeneratedImageFolderName(canvasName, canvasId);
  const existingCanvasFolder = folders.find(folder => folder.id === folderId);

  let nextFolders = folders;
  let changed = false;
  if (!existingRoot) {
    nextFolders = [rootFolder, ...nextFolders];
    changed = true;
  }

  if (!existingCanvasFolder) {
    const rootIndex = nextFolders.findIndex(folder => folder.id === rootFolder.id);
    const canvasFolder: Folder = {
      id: folderId,
      name: folderName,
      color: AI_GENERATED_FOLDER_COLOR,
      parentId: rootFolder.id,
    };
    nextFolders = [...nextFolders];
    nextFolders.splice(rootIndex >= 0 ? rootIndex + 1 : 0, 0, canvasFolder);
    changed = true;
  } else if (
    existingCanvasFolder.name !== folderName
    || existingCanvasFolder.parentId !== rootFolder.id
    || existingCanvasFolder.color !== AI_GENERATED_FOLDER_COLOR
  ) {
    nextFolders = nextFolders.map(folder => folder.id === folderId
      ? {
          ...folder,
          name: folderName,
          color: AI_GENERATED_FOLDER_COLOR,
          parentId: rootFolder.id,
        }
      : folder);
    changed = true;
  }

  return {
    folders: changed ? nextFolders : folders,
    folderId,
    rootFolderId: rootFolder.id,
  };
};
