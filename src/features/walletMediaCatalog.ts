import { invoke } from '@tauri-apps/api/core';
import type { CloudImageModelsResult } from '../types/license';
import type { CanvasAiProvider, CanvasImageItem } from './canvasModel';
import { cacheSuccessfulAiCatalog, getCachedAiCatalog } from './aiModelCapabilities';
import { reconcileCanvasAiModelsWithCatalog } from './canvasWalletVideoModelContext';
import { beginCatalogRefresh, isCurrentCatalogRefresh, type CatalogRefreshTicket } from './modelCatalogRefresh';

export function needsWalletMediaCatalog(hasAccount: boolean, usesWalletImages: boolean, items: CanvasImageItem[]) {
  return hasAccount && (usesWalletImages || items.some(item => item.ai?.type === 'music-generator'));
}

type WalletMediaCatalogContext = {
  provider: CanvasAiProvider;
  setCatalog: (snapshot: CloudImageModelsResult) => void;
  updateItems: (updater: (items: CanvasImageItem[]) => CanvasImageItem[]) => unknown;
};

/** Music always uses the wallet catalog, independently of image credentials. */
export async function refreshWalletMediaCatalog(
  context: WalletMediaCatalogContext,
  ticket: CatalogRefreshTicket = beginCatalogRefresh(context.setCatalog),
) {
  const result = await invoke<CloudImageModelsResult>('get_cloud_image_models', { provider: context.provider });
  if (!isCurrentCatalogRefresh(ticket)) return;
  const channels = (result.channels || []).map(channel => ({
    ...channel,
    models: Array.from(new Set([
      ...(channel.models || []).map(model => model.trim()).filter(Boolean),
      ...(String(channel.defaultModel || '').trim() ? [String(channel.defaultModel).trim()] : []),
    ])),
  }));
  const snapshot = cacheSuccessfulAiCatalog({
    ...result,
    channels,
    models: Array.from(new Set([
      ...(result.models || []).map(model => model.trim()).filter(Boolean),
      ...channels.flatMap(channel => channel.models),
    ])),
    pricing: result.pricing ?? getCachedAiCatalog()?.pricing,
  });
  context.setCatalog(snapshot);
  context.updateItems(previous => reconcileCanvasAiModelsWithCatalog(previous, snapshot));
}
