import { invoke } from '@tauri-apps/api/core';

export type CanvasRecord = {
  id: string;
  projectId: string;
  libraryId: string;
  name: string;
  description?: string;
  thumbnailPath?: string | null;
  sortOrder: number;
  isActive: boolean;
  isSnapshot: boolean;
  sourceCanvasId?: string | null;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  deletedAt?: number | null;
};

export type CanvasDeleteResult = {
  deletedCanvasId: string;
  activeCanvasId?: string | null;
};

export type CanvasViewportOptions = {
  canvas_id: string;
  viewport_x: number;
  viewport_y: number;
  viewport_width: number;
  viewport_height: number;
  buffer?: number;
};

export const DEFAULT_PROJECT_ID = 'default';
export const DEFAULT_LIBRARY_ID = 'default';
export const DEFAULT_CANVAS_ID = 'default';

export const listCanvases = (projectId = DEFAULT_PROJECT_ID, libraryId = DEFAULT_LIBRARY_ID) =>
  invoke<CanvasRecord[]>('list_canvases', { projectId, project_id: projectId, libraryId, library_id: libraryId });

export const listDeletedCanvases = (projectId = DEFAULT_PROJECT_ID, libraryId = DEFAULT_LIBRARY_ID) =>
  invoke<CanvasRecord[]>('list_deleted_canvases', { projectId, project_id: projectId, libraryId, library_id: libraryId });

export const getCanvas = (canvasId: string) =>
  invoke<CanvasRecord | null>('get_canvas', { canvasId, canvas_id: canvasId });

export const createCanvas = (name: string, projectId = DEFAULT_PROJECT_ID, libraryId = DEFAULT_LIBRARY_ID) =>
  invoke<CanvasRecord>('create_canvas', { projectId, project_id: projectId, libraryId, library_id: libraryId, name });

export const duplicateCanvas = (canvasId: string, newName: string) =>
  invoke<CanvasRecord>('duplicate_canvas', { canvasId, canvas_id: canvasId, newName, new_name: newName });

export const saveCanvasSnapshot = (canvasId: string, snapshotName: string) =>
  invoke<CanvasRecord>('save_canvas_snapshot', { canvasId, canvas_id: canvasId, snapshotName, snapshot_name: snapshotName });

export const renameCanvas = (canvasId: string, name: string) =>
  invoke<CanvasRecord | null>('rename_canvas', { canvasId, canvas_id: canvasId, name });

export const softDeleteCanvas = (canvasId: string) =>
  invoke<CanvasDeleteResult>('soft_delete_canvas', { canvasId, canvas_id: canvasId });

export const restoreCanvas = (canvasId: string) =>
  invoke<CanvasRecord | null>('restore_canvas', { canvasId, canvas_id: canvasId });

export const permanentlyDeleteCanvas = (canvasId: string) =>
  invoke<{ deletedCanvasId: string; deletedNodeCount: number }>('permanently_delete_canvas', { canvasId, canvas_id: canvasId });

export const getCanvasTrashCount = (projectId = DEFAULT_PROJECT_ID, libraryId = DEFAULT_LIBRARY_ID) =>
  invoke<number>('get_canvas_trash_count', { projectId, project_id: projectId, libraryId, library_id: libraryId });

export const setActiveCanvas = (canvasId: string, projectId = DEFAULT_PROJECT_ID, libraryId = DEFAULT_LIBRARY_ID) =>
  invoke<CanvasRecord>('set_active_canvas', { projectId, project_id: projectId, libraryId, library_id: libraryId, canvasId, canvas_id: canvasId });

export const getActiveCanvas = (projectId = DEFAULT_PROJECT_ID, libraryId = DEFAULT_LIBRARY_ID) =>
  invoke<CanvasRecord>('get_active_canvas', { projectId, project_id: projectId, libraryId, library_id: libraryId });

export const listCanvasNodes = (canvasId: string) =>
  invoke<unknown[]>('list_canvas_nodes', { canvasId, canvas_id: canvasId });

export const getCanvasNodesInViewport = (options: CanvasViewportOptions) =>
  invoke<unknown[]>('get_canvas_nodes_in_viewport', { options });

export const updateCanvasNodes = (canvasId: string, nodes: unknown[]) =>
  invoke<number>('update_canvas_nodes', { canvasId, canvas_id: canvasId, nodes });

export const patchCanvasNodes = (canvasId: string, nodes: unknown[]) =>
  invoke<number>('patch_canvas_nodes', { canvasId, canvas_id: canvasId, nodes });
