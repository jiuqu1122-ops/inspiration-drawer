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

export const listTags = (libraryId?: string) =>
  invoke<LibraryTag[]>('list_tags', { libraryId, library_id: libraryId });
