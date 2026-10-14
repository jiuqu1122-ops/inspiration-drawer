import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runNextCanvasAiOutputThumbnailJobImpl, settleCanvasAiOutputThumbnailJobImpl } from './canvasMediaActions';
import type { CanvasImageItem } from '../../canvasModel';
import type { BufferItem } from '../../../types';
import type { CanvasAiOutputThumbnailJob } from '../../../types/canvasMedia';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: (path: string) => `asset://${path}` }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
beforeEach(() => { vi.stubGlobal('window', { setTimeout: vi.fn() }); });
afterEach(() => { vi.unstubAllGlobals(); });

it.each(['same', 'new-request', 'new-path', 'new-source'] as const)(
  'settles a delayed thumbnail only for its original media (%s)', async change => {
    const remote = change === 'new-source';
    const oldSource = remote ? 'https://cdn.example/old.png' : 'asset://old.png';
    let nodes: CanvasImageItem[] = [{ id: 'node', x: 0, y: 0, width: 320, height: 300,
      item: { id: 'node-item', type: 'text', content: '', createdAt: 0 },
      ai: { type: 'image-generator', imageClientRequestId: 'old-request', outputs: [{
        id: 'slot', clientRequestId: 'old-request', status: 'success', cacheStatus: 'pending',
        url: oldSource, ...(remote ? {} : { path: 'old.png' }),
      }] } }];
    let drawer: BufferItem[] = [{ id: 'slot', type: 'image', content: '', createdAt: 0,
      url: oldSource, ...(remote ? {} : { path: 'old.png' }) }];
    const job = { key: 'old-job', canvasItemId: 'node', outputId: 'slot', drawerItemId: 'slot',
      source: oldSource, ...(remote ? {} : { path: 'old.png' }), clientRequestId: 'old-request' };
    let finish!: (thumbnail: string) => void;
    const settlement: Parameters<typeof settleCanvasAiOutputThumbnailJobImpl>[0] = {
      canvasPanRef: { current: null }, isCanvasInteractingRef: { current: false }, isCanvasZoomingRef: { current: false },
      generatedImageCachePendingIdsRef: { current: new Set(['slot']) },
      scheduleCanvasChangedNodesPatchSave: vi.fn(), scheduleCanvasStateSave: vi.fn(),
      updateCanvasItemsImmediate: updater => { nodes = updater(nodes); return nodes; },
      updateDrawerItemsDeferred: updater => { drawer = updater(drawer); },
      settleCanvasAiOutputThumbnailJob: vi.fn(),
    };
    const runner: Parameters<typeof runNextCanvasAiOutputThumbnailJobImpl>[0] = {
      IMAGE_THUMBNAIL_UPDATE_BATCH_MS: 90,
      canvasAiOutputThumbnailInFlightRef: { current: new Set() },
      canvasAiOutputThumbnailQueueRef: { current: [job as CanvasAiOutputThumbnailJob] },
      canvasPanRef: { current: null }, isCanvasInteractingRef: { current: false }, isCanvasZoomingRef: { current: false },
      createCanvasImagePreviewThumbnail: () => new Promise(resolve => { finish = resolve; }),
      enqueueCanvasAiOutputThumbnailJob: vi.fn(), runNextCanvasAiOutputThumbnailJob: vi.fn(),
      settleCanvasAiOutputThumbnailJob: (currentJob, patch) => settleCanvasAiOutputThumbnailJobImpl(settlement, currentJob, patch),
    };
    runNextCanvasAiOutputThumbnailJobImpl(runner);
    const output = nodes[0].ai!.outputs![0];
    if (change === 'new-request') output.clientRequestId = 'new-request';
    if (change === 'new-path') { output.path = 'new.png'; output.url = 'asset://new.png'; drawer[0].path = 'new.png'; drawer[0].url = 'asset://new.png'; }
    if (change === 'new-source') { output.url = 'https://cdn.example/new.png'; drawer[0].url = output.url; }
    finish('asset://old-thumbnail.jpg');
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    if (change === 'same') {
      expect(nodes[0].ai?.outputs?.[0].thumbnail).toBe('asset://old-thumbnail.jpg');
      expect(drawer[0].thumbnail).toBe('asset://old-thumbnail.jpg');
    } else {
      expect(nodes[0].ai?.outputs?.[0].thumbnail).toBeUndefined();
      if (change !== 'new-request') expect(drawer[0].thumbnail).toBeUndefined();
      expect(settlement.scheduleCanvasChangedNodesPatchSave).not.toHaveBeenCalled();
    }
  },
);
