import type { BufferItem, FloatingNoteSnapshot, Folder, TabType } from './index';

export type DrawerTabType = TabType | 'notes' | 'calendar';

export type DrawerSidebarLayout = 'icons' | 'folders';

export type DrawerClassificationView = 'folders' | 'ai';

export type DrawerUndoSnapshot = {
  items: BufferItem[];
  folders: Folder[];
  activeFolderId: string;
  activeTab: DrawerTabType;
  openFloatingNoteLabels: string[];
  floatingNotes: Array<{ label: string; snapshot: FloatingNoteSnapshot }>;
  label: string;
  createdAt: number;
};

export type FolderContextMenuState = {
  x: number;
  y: number;
  folderId: string;
};
