import type { Folder } from '../types';

export type DrawerFolderTreeEntry = {
  folder: Folder;
  depth: number;
};

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
  const hasCycle = (folder: Folder) => {
    if (!folder.parentId) return false;
    let parentId: string | undefined = folder.parentId;
    const seen = new Set<string>([folder.id]);
    while (parentId) {
      if (seen.has(parentId)) return true;
      seen.add(parentId);
      parentId = byId.get(parentId)?.parentId;
    }
    return false;
  };
  return normalized.map(folder => {
    const parent = folder.parentId ? byId.get(folder.parentId) : null;
    if (!parent || parent.id === folder.id || hasCycle(folder)) {
      return { ...folder, parentId: undefined };
    }
    return folder;
  });
};

export const getDrawerFolderPathName = (folders: Folder[], folderId?: string) => {
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  const folder = folderId ? byId.get(folderId) : null;
  if (!folder) return '';
  const path: string[] = [];
  const seen = new Set<string>();
  let cursor: Folder | undefined = folder;
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    path.unshift(cursor.name);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return path.join(' / ');
};

export const getDrawerFolderScopeIds = (folders: Folder[], folderId?: string) => {
  if (!folderId) return new Set<string>();
  if (!folders.some(item => item.id === folderId)) return new Set([folderId]);
  const childrenByParent = new Map<string, Folder[]>();
  folders.forEach(folder => {
    if (!folder.parentId) return;
    childrenByParent.set(folder.parentId, [...(childrenByParent.get(folder.parentId) || []), folder]);
  });
  const ids = new Set<string>();
  const visit = (id: string) => {
    if (ids.has(id)) return;
    ids.add(id);
    (childrenByParent.get(id) || []).forEach(child => visit(child.id));
  };
  visit(folderId);
  return ids;
};

export const getDrawerFolderDeletionPlan = (folders: Folder[], folderId: string) => {
  const target = folders.find(folder => folder.id === folderId);
  if (!target) return null;
  const scopeIds = getDrawerFolderScopeIds(folders, folderId);
  scopeIds.delete(folderId);
  const childIds = Array.from(scopeIds);
  return {
    target,
    childIds,
    removedIds: new Set([folderId, ...childIds]),
    destinationId: target.parentId || undefined,
  };
};

export const isDrawerFolderDescendant = (folders: Folder[], candidateId?: string | null, ancestorId?: string | null) => {
  if (!candidateId || !ancestorId || candidateId === ancestorId) return !!candidateId && candidateId === ancestorId;
  const byId = new Map(folders.map(folder => [folder.id, folder]));
  const seen = new Set<string>();
  let cursor = byId.get(candidateId);
  while (cursor?.parentId) {
    if (cursor.parentId === ancestorId) return true;
    if (seen.has(cursor.parentId)) return false;
    seen.add(cursor.parentId);
    cursor = byId.get(cursor.parentId);
  }
  return false;
};

export const flattenDrawerFolderTree = (folders: Folder[], collapsedFolderIds: string[] = []): DrawerFolderTreeEntry[] => {
  const collapsed = new Set(collapsedFolderIds);
  const childrenByParent = new Map<string, Folder[]>();
  folders.forEach(folder => {
    const parentId = folder.parentId || '';
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) || []), folder]);
  });
  const entries: DrawerFolderTreeEntry[] = [];
  const visit = (folder: Folder, depth: number, ancestors: Set<string>) => {
    if (ancestors.has(folder.id)) return;
    entries.push({ folder, depth });
    if (collapsed.has(folder.id)) return;
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(folder.id);
    (childrenByParent.get(folder.id) || []).forEach(child => visit(child, depth + 1, nextAncestors));
  };
  (childrenByParent.get('') || []).forEach(folder => visit(folder, 0, new Set()));
  return entries;
};
