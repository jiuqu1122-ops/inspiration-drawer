import { invoke } from '@tauri-apps/api/core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { addGeneratedImagesToDrawerImpl } from './drawerCoreActions';
import type { CanvasImageItem } from '../../canvasModel';
import type { BufferItem } from '../../../types';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: (path: string) => `asset://${path}` }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.stubGlobal('localStorage', { getItem: () => null });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each(['same', 'new-source', 'old-download-fails'] as const)(
  'applies a delayed drawer image cache result only to its source (%s)', async change => {
    const oldSource = 'https://api.unmind.art/v1/ai/image-results/old.png';
    const newSource = 'https://api.unmind.art/v1/ai/image-results/new.png';
    const image: BufferItem = { id: 'slot', type: 'image', content: '', createdAt: 0, url: oldSource, sourceUrl: oldSource };
    let nodes: CanvasImageItem[] = [{ id: 'node', x: 0, y: 0, width: 320, height: 300,
      item: { ...image, id: 'node-item' }, ai: { type: 'image-generator', outputs: [
        { id: 'slot', clientRequestId: 'old-request', status: 'success', url: oldSource, sourceUrl: oldSource },
      ] } }];
    let drawer: BufferItem[] = [];
    let finish!: (path: string) => void;
    let reject!: (reason: Error) => void;
    vi.mocked(invoke).mockImplementation(() => new Promise((resolve, fail) => { finish = resolve; reject = fail; }));
    const ctx: Parameters<typeof addGeneratedImagesToDrawerImpl>[0] = {
      GENERATED_IMAGE_CACHE_RETRY_DELAYS_MS: [], activeCanvasIdRef: { current: 'canvas' },
      canvasPanRef: { current: null }, isCanvasInteractingRef: { current: false }, isCanvasZoomingRef: { current: false },
      generatedImageCachePendingIdsRef: { current: new Set() }, generatedImageCachePromisesRef: { current: new Map() },
      webImageCacheDirRef: { current: '' }, ensureCanvasAiGeneratedFolder: () => 'generated',
      addGeneratedImagesToDrawer: vi.fn(), enqueueCanvasAiOutputThumbnailJob: vi.fn(),
      setActiveFolderId: vi.fn(), setActiveTab: vi.fn(),
      updateCanvasItemsImmediate: updater => { nodes = updater(nodes); return nodes; },
      updateDrawerItemsDeferred: updater => { drawer = updater(drawer); },
    };
    addGeneratedImagesToDrawerImpl(ctx, [image], { canvasOutputClientRequestId: 'old-request' });
    expect(invoke).toHaveBeenCalledOnce();
    if (change !== 'same') {
      drawer = [{ ...image, url: newSource, sourceUrl: newSource }];
      nodes[0].ai!.outputs = [{ id: 'slot', clientRequestId: 'new-request', status: 'success', url: newSource, sourceUrl: newSource }];
    }
    if (change === 'old-download-fails') reject(new Error('old download failed'));
    else finish('old.png');
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    if (change === 'same') {
      expect(drawer[0].path).toBe('old.png');
      expect(nodes[0].ai?.outputs?.[0].path).toBe('old.png');
    } else {
      expect(drawer[0]).toMatchObject({ url: newSource, sourceUrl: newSource });
      expect(drawer[0].path).toBeUndefined();
      expect(nodes[0].ai?.outputs?.[0]).toMatchObject({ clientRequestId: 'new-request', url: newSource, sourceUrl: newSource });
      expect(nodes[0].ai?.outputs?.[0].path).toBeUndefined();
    }
  },
);
