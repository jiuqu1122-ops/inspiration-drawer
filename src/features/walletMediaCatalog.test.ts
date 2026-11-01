import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CloudImageModelsResult } from '../types/license';
import type { CanvasImageItem } from './canvasModel';
import { clearCachedAiCatalogForTests, getAiCatalogModels, getCachedAiCatalog } from './aiModelCapabilities';
import { beginCatalogRefresh, cancelCatalogRefresh } from './modelCatalogRefresh';
import { needsWalletMediaCatalog, refreshWalletMediaCatalog } from './walletMediaCatalog';
import { CanvasMusicNode } from './canvasMusic';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

const desktopResponse = (): CloudImageModelsResult => ({
  provider: 'NEW_API', models: [], channels: [], videoChannels: [],
  catalog: [{ id: 'configured-music', displayName: 'Music', modality: 'audio', aliases: [], isDefault: true, enabled: true, visible: true, capabilities: { billingMode: 'per_request' } }],
});

const musicNode = (): CanvasImageItem => ({
  id: 'music', x: 0, y: 0, width: 400, height: 320,
  item: { id: 'music', type: 'text', content: '', name: 'Music', createdAt: 1, isQuickAccess: false },
  ai: { type: 'music-generator', credentialSource: 'wallet', model: '', status: 'idle' },
});

describe('wallet music catalog loading', () => {
  beforeEach(() => { vi.resetAllMocks(); clearCachedAiCatalogForTests(); });

  it('loads music with local image credentials and waits for an account', () => {
    expect(needsWalletMediaCatalog(true, false, [musicNode()])).toBe(true);
    expect(needsWalletMediaCatalog(false, false, [musicNode()])).toBe(false);
    expect(needsWalletMediaCatalog(true, false, [])).toBe(false);
    expect(needsWalletMediaCatalog(true, true, [])).toBe(true);
  });

  it('renders audio from the desktop response and selects a model on an existing empty node', async () => {
    vi.mocked(invoke).mockResolvedValue(desktopResponse());
    let items = [musicNode()];
    const setCatalog = vi.fn();
    await refreshWalletMediaCatalog({ provider: 'new-api', setCatalog, updateItems: updater => { items = updater(items); } });
    expect(invoke).toHaveBeenCalledWith('get_cloud_image_models', { provider: 'new-api' });
    const snapshot = setCatalog.mock.calls[0][0] as CloudImageModelsResult;
    expect(getAiCatalogModels(snapshot, 'audio').map(model => model.id)).toEqual(['configured-music']);
    expect(getAiCatalogModels(snapshot, 'image')).toEqual([]);
    expect(items[0].ai?.model).toBe('configured-music');
    items[0].ai!.prompt = 'Ambient piano';
    const html = renderToStaticMarkup(React.createElement(CanvasMusicNode, {
      item: items[0], catalog: getAiCatalogModels(snapshot, 'audio'),
      update: () => {}, onRun: () => {}, onDrag: () => {},
    }));
    expect(html).toContain('Music');
    expect(html).not.toContain('暂无音乐模型');
    const runButton = html.match(/<button[^>]*data-canvas-run-control="true"[^>]*>/)?.[0];
    expect(runButton).toBeDefined();
    expect(runButton).not.toMatch(/\sdisabled(?:=|\s|>)/);
  });

  it('keeps the catalog and selected node when a later refresh fails', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(desktopResponse()).mockRejectedValueOnce(new Error('offline'));
    let items = [musicNode()];
    const context = { provider: 'new-api' as const, setCatalog: vi.fn(), updateItems: (updater: (items: CanvasImageItem[]) => CanvasImageItem[]) => { items = updater(items); } };
    await refreshWalletMediaCatalog(context);
    await expect(refreshWalletMediaCatalog(context)).rejects.toThrow('offline');
    expect(context.setCatalog).toHaveBeenCalledTimes(1);
    expect(items[0].ai?.model).toBe('configured-music');
    expect(getCachedAiCatalog()?.catalog?.[0].id).toBe('configured-music');
  });

  it('does not let an old request overwrite a newer music catalog', async () => {
    let finishOld!: (result: CloudImageModelsResult) => void;
    vi.mocked(invoke).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }));
    vi.mocked(invoke).mockResolvedValueOnce(desktopResponse());
    const context = { provider: 'new-api' as const, setCatalog: vi.fn(), updateItems: vi.fn() };
    const old = refreshWalletMediaCatalog(context);
    await refreshWalletMediaCatalog(context);
    finishOld({ provider: 'NEW_API', models: [], catalog: [] });
    await old;
    expect(context.setCatalog).toHaveBeenCalledTimes(1);
    expect(getCachedAiCatalog()?.catalog?.[0].id).toBe('configured-music');
  });

  it('discards a response after effect cleanup cancels its ticket', async () => {
    vi.mocked(invoke).mockResolvedValue(desktopResponse());
    const context = { provider: 'new-api' as const, setCatalog: vi.fn(), updateItems: vi.fn() };
    const ticket = beginCatalogRefresh(context.setCatalog);
    const refresh = refreshWalletMediaCatalog(context, ticket);
    cancelCatalogRefresh(ticket);
    await refresh;
    expect(context.setCatalog).not.toHaveBeenCalled();
    expect(context.updateItems).not.toHaveBeenCalled();
  });
});
