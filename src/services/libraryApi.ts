import { invoke } from '@tauri-apps/api/core';

import type { Folder } from '../types';

export type LibraryTag = {
  id: string;
  name: string;
  color?: string;
  createdAt?: number;
  updatedAt?: number;
};

export const listFolders = (libraryId?: string) =>
  invoke<Folder[]>('list_folders', { libraryId, library_id: libraryId });

export const replaceFolders = (folders: Folder[], libraryId?: string) =>
  invoke<Folder[]>('replace_folders', { folders, libraryId, library_id: libraryId });

export type MoveFoldersOptions = {
  folderIds: string[];
  newParentId?: string | null;
  libraryId?: string;
  insertPosition?: number;
  sortOrder?: number;
};

export const moveFolders = (options: MoveFoldersOptions) =>
  invoke<Folder[]>('move_folders', {
    options: {
      ...options,
      folder_ids: options.folderIds,
      new_parent_id: options.newParentId,
      library_id: options.libraryId,
      insert_position: options.insertPosition,
      sort_order: options.sortOrder,
    },
  });

export const listTags = (libraryId?: string) =>
  invoke<LibraryTag[]>('list_tags', { libraryId, library_id: libraryId });
