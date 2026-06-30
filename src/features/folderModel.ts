import type { Folder } from '../types';

export const normalizeDrawerFolders = (value: unknown): Folder[] => {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map(entry => {
      const folder = entry && typeof entry === 'object' ? entry as Partial<Folder> : {};
      const id = typeof folder.id === 'string' ? folder.id.trim() : '';
      const name = typeof folder.name === 'string' ? folder.name.trim() : '';
      if (!id || !name) return null;
      return {
        ...folder,
        id,
        name,
        color: typeof folder.color === 'string' && folder.color ? folder.color : '#10b981',
        parentId: typeof folder.parentId === 'string' && folder.parentId.trim()
          ? folder.parentId.trim()
          : undefined,
      } as Folder;
    })
    .filter((folder): folder is Folder => !!folder);
  const byId = new Map(normalized.map(folder => [folder.id, folder]));
  return normalized.map(folder => {
    const parent = folder.parentId ? byId.get(folder.parentId) : null;
    if (!parent || parent.id === folder.id || parent.parentId) {
      return { ...folder, parentId: undefined };
    }
    return folder;
  });
};

export const getDrawerFolderPathName = (folders: Folder[], folderId?: string) => {
  const folder = folders.find(item => item.id === folderId);
  if (!folder) return '';
  const parent = folder.parentId ? folders.find(item => item.id === folder.parentId) : null;
  return parent ? `${parent.name} / ${folder.name}` : folder.name;
};

export const getDrawerFolderScopeIds = (folders: Folder[], folderId?: string) => {
  if (!folderId) return new Set<string>();
  const folder = folders.find(item => item.id === folderId);
  if (!folder || folder.parentId) return new Set([folderId]);
  return new Set([folderId, ...folders.filter(item => item.parentId === folderId).map(item => item.id)]);
};

export const getDrawerFolderDeletionPlan = (folders: Folder[], folderId: string) => {
  const target = folders.find(folder => folder.id === folderId);
  if (!target) return null;
  const childIds = target.parentId
    ? []
    : folders.filter(folder => folder.parentId === folderId).map(folder => folder.id);
  return {
    target,
    childIds,
    removedIds: new Set([folderId, ...childIds]),
    destinationId: target.parentId || undefined,
  };
};
