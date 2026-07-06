import { invoke } from '@tauri-apps/api/core';

import type { BufferItem } from '../types';

export type AssetListOptions = {
  library_id?: string;
  folder_id?: string;
  folder_ids?: string[];
  keyword?: string;
  tags?: string[];
  file_type?: string;
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
  folder_id?: string;
  note?: string;
  rating?: number;
  metadata?: Record<string, unknown>;
};

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

export const deleteAsset = (id: string) =>
  invoke<boolean>('delete_asset', { id });

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
