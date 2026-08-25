import { invoke } from '@tauri-apps/api/core';

import type { BufferItem } from '../types';

export type AssetListOptions = {
  library_id?: string;
  folder_id?: string;
  folder_ids?: string[];
  keyword?: string;
  tags?: string[];
  file_type?: string;
  rating?: number;
  quick_access?: boolean;
  inspiration_status?: 'analyzed' | 'unprocessed' | 'retryable' | 'skipped';
  sort?: string;
  offset?: number;
  limit?: number;
};

export type ViewportOptions = {
  canvas_id: string;
  viewport_x: number;
  viewport_y: number;
  viewport_width: number;
  viewport_height: number;
  buffer?: number;
};

export type AssetUpdatePatch = {
  name?: string;
  content?: string;
  folder_id?: string;
  note?: string;
  rating?: number;
  metadata?: Record<string, unknown>;
};

export type AssetBatchUpdate = {
  ids: string[];
  patch: AssetUpdatePatch;
};

export type FolderAssetCount = {
  folderId: string | null;
  count: number;
};

export type TagAssetCount = {
  tagId: string;
  count: number;
};

export type InspirationAnalysisCounts = {
  total: number;
  analyzed: number;
  waitingRetry: number;
  skipped: number;
};

export const ASSET_PAGE_SIZE = 200;
export const ASSET_WRITE_BATCH_SIZE = 100;
export const MAX_DRAWER_ASSET_CACHE_SIZE = 2000;

export const listAssets = (options: AssetListOptions) =>
  invoke<BufferItem[]>('list_assets', { options });

export const getAssetById = (id: string) =>
  invoke<BufferItem | null>('get_asset_by_id', { id });

export const getAssetCount = (options: AssetListOptions) =>
  invoke<number>('get_asset_count', { options });

export const upsertAssets = (assets: BufferItem[]) =>
  invoke<number>('upsert_assets', { assets });

export const updateAsset = (id: string, patch: AssetUpdatePatch) =>
  invoke<BufferItem | null>('update_asset', { id, patch });

export const updateAssetsBatch = (updates: AssetBatchUpdate[]) =>
  invoke<BufferItem[]>('update_assets_batch', { updates });

export const deleteAsset = (id: string) =>
  invoke<boolean>('delete_asset', { id });

export const deleteAssetsBatch = (ids: string[]) =>
  invoke<number>('delete_assets_batch', { ids });

export const moveAssetsFromFolders = (
  sourceFolderIds: string[],
  destinationFolderId?: string,
) => invoke<number>('move_assets_from_folders', {
  sourceFolderIds,
  source_folder_ids: sourceFolderIds,
  destinationFolderId,
  destination_folder_id: destinationFolderId,
});

export const getFolderAssetCounts = (libraryId?: string) =>
  invoke<FolderAssetCount[]>('get_folder_asset_counts', { libraryId, library_id: libraryId });

export const getTagAssetCounts = (libraryId?: string) =>
  invoke<TagAssetCount[]>('get_tag_asset_counts', { libraryId, library_id: libraryId });

export const getInspirationAnalysisCounts = (libraryId?: string) =>
  invoke<InspirationAnalysisCounts>('get_inspiration_analysis_counts', {
    libraryId,
    library_id: libraryId,
  });

export const upsertAssetsInBatches = async (
  assets: BufferItem[],
  batchSize = ASSET_WRITE_BATCH_SIZE,
) => {
  let written = 0;
  for (let offset = 0; offset < assets.length; offset += batchSize) {
    written += await upsertAssets(assets.slice(offset, offset + batchSize));
  }
  return written;
};

export const deleteAssetsInBatches = async (
  ids: string[],
  batchSize = 500,
) => {
  let deleted = 0;
  for (let offset = 0; offset < ids.length; offset += batchSize) {
    deleted += await deleteAssetsBatch(ids.slice(offset, offset + batchSize));
  }
  return deleted;
};

export const getAssetsByIds = (ids: string[]) =>
  invoke<BufferItem[]>('get_assets_by_ids', { ids });

export const getAssetsInViewport = (options: ViewportOptions) =>
  invoke<unknown[]>('get_assets_in_viewport', { options });

export const debugGetAllCanvasNodes = (options: { canvas_id?: string; canvasId?: string; limit?: number } = {}) =>
  invoke<unknown>('debug_get_all_canvas_nodes', { options });

export const upsertCanvasNodes = (canvasId: string, nodes: unknown[]) =>
  invoke<number>('upsert_canvas_nodes', { canvasId, canvas_id: canvasId, nodes });

export const getAssetThumbnails = (assetId: string) =>
  invoke<unknown[]>('get_asset_thumbnails', { assetId });
