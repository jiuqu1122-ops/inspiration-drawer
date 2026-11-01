import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import type { CanvasImageItem } from './canvasModel';
import { addCanvasDroppedFilesImpl, addCanvasDroppedPathsImpl } from './canvas/controllers/canvasWorkflowRuntimeActions';
import { createCanvasAudioItemFromPathImpl } from './canvas/controllers/canvasMediaActions';
import { copyCanvasAiOutputToCanvasImpl } from './canvas/controllers/canvasPersistenceActions';
import { CanvasMusicNode, generateCanvasMusic } from './canvasMusic';
import { CanvasAudioContent } from './canvasAudio';
import { estimateCanvasMusicGenerationCredits, type CanvasAiCreditPricing } from './canvasGenerationCredits';
import { isCanvasAudioBufferItem } from '../utils/localMediaPaths';
import { isCanvasDrawerMediaItem } from './canvasDrawerMedia';
import { sanitizeCanvasPersistedState } from './canvasPersistence';
import { getCanvasAiOutputPreviewSlots } from '../utils/canvasWorkflowRuntime';
import { CanvasNode } from './canvas/components/CanvasNode';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: (path: string) => `asset://localhost/${path}` }));

const audioNode = (name = 'song.mp3'): CanvasImageItem => ({
  id: name, x: 10, y: 20, width: 320, height: 112,
  item: { id: `asset-${name}`, type: 'file', name, content: name, path: `C:/cache/${name}`, createdAt: 1 },
});
const musicNode = (): CanvasImageItem => ({
  id: 'music', x: 10, y: 20, width: 400, height: 320,
  item: { id: 'music-item', type: 'text', content: '', name: '音乐生成', createdAt: 1 },
  ai: { type: 'music-generator', credentialSource: 'wallet', model: 'suno', prompt: 'Ambient piano', status: 'success', outputs: [
    { id: 'track-1', assetType: 'audio', status: 'success', url: 'https://cdn.example.test/first.mp3', name: '第一段.mp3' },
    { id: 'track-2', assetType: 'audio', status: 'success', url: 'https://cdn.example.test/second.flac', name: '第二段.flac' },
  ] },
});
const pricing: CanvasAiCreditPricing = { agentRequestCredits: '1', inspirationAnalysisCredits: '1', imageDefaultCredits: '1', videoDefaultCredits: '1', imageModels: [], videoModels: [], musicModels: [{ model: 'suno', billingType: 'music_flat', creditsPerRequest: '50.000000' }] };
const catalog = [{ id: 'suno', displayName: 'Suno', modality: 'audio' as const, aliases: [], capabilities: {} }];

describe('canvas audio import, price and individual outputs', () => {
  beforeEach(() => vi.resetAllMocks());
  const dropContext = () => ({
    addCanvasImageItems: vi.fn(), addCanvasDroppedTemplateJsonSources: vi.fn(async () => false),
    createCanvasImageItemFromFile: vi.fn(async () => null), createCanvasImageItemFromPath: vi.fn(async () => null),
    createCanvasVideoItemFromPath: vi.fn(async () => null), createCanvasAudioItemFromPath: vi.fn(async (path: string, _index = 0, _client?: { x: number; y: number }) => audioNode(path.split('/').pop())),
    lastCanvasDropAtRef: { current: 0 }, lastCanvasDroppedPathsKeyRef: { current: '' }, showToast: vi.fn(),
  });

  it('imports audio paths and folder contents using the audio creator', async () => {
    const context = dropContext();
    vi.mocked(invoke).mockResolvedValue(['C:/media/song.MP3', 'C:/media/song.wav']);
    await addCanvasDroppedPathsImpl(context, ['C:/media'], { x: 100, y: 200 });
    expect(context.createCanvasAudioItemFromPath.mock.calls).toEqual([
      ['C:/media/song.MP3', 0, { x: 100, y: 200 }], ['C:/media/song.wav', 1, { x: 100, y: 200 }],
    ]);
    expect(context.addCanvasImageItems.mock.calls[0][0]).toHaveLength(2);
    expect(context.createCanvasImageItemFromPath).not.toHaveBeenCalled();
    expect(context.showToast).not.toHaveBeenCalled();
  });

  it('does not let a DOM image import suppress the audio from the same native drop', async () => {
    const context = dropContext();
    context.createCanvasImageItemFromFile.mockResolvedValueOnce({ ...audioNode('image.png'), item: { ...audioNode('image.png').item, type: 'image' } } as never);
    const files = [{ name: 'image.png', type: 'image/png' }, { name: 'song.mp3', type: 'audio/mpeg' }] as File[];
    expect(await addCanvasDroppedFilesImpl(context, files)).toBe(true);
    vi.mocked(invoke).mockResolvedValue(['C:/media/song.mp3']);
    await addCanvasDroppedPathsImpl(context, ['C:/media/image.png', 'C:/media/song.mp3']);
    expect(context.createCanvasAudioItemFromPath).toHaveBeenCalledOnce();
    expect(context.createCanvasAudioItemFromPath.mock.calls[0][1]).toBe(1);
    expect(context.createCanvasImageItemFromPath).not.toHaveBeenCalled();
    expect(context.addCanvasImageItems.mock.calls.flatMap(([items]) => items).map(item => item.item.type)).toEqual(['image', 'file']);
  });

  it('defers pathless audio to the native event without marking it consumed', async () => {
    const context = dropContext();
    expect(await addCanvasDroppedFilesImpl(context, [{ name: 'song.mp3', type: 'audio/mpeg' } as File])).toBe(true);
    expect(context.lastCanvasDropAtRef.current).toBe(0);
    vi.mocked(invoke).mockResolvedValue(['C:/media/song.mp3']);
    await addCanvasDroppedPathsImpl(context, ['C:/media/song.mp3']);
    expect(context.createCanvasAudioItemFromPath).toHaveBeenCalledOnce();
  });

  it('deduplicates the DOM and native events when the audio file path was already imported', async () => {
    const context = dropContext();
    const file = { name: 'song.mp3', type: 'audio/mpeg', path: 'C:/media/song.mp3' } as File & { path: string };
    await addCanvasDroppedFilesImpl(context, [file]);
    await addCanvasDroppedPathsImpl(context, [file.path]);
    expect(context.createCanvasAudioItemFromPath).toHaveBeenCalledOnce();
    expect(context.addCanvasImageItems).toHaveBeenCalledOnce();
  });

  it('caches an imported local audio and preserves its original source', async () => {
    vi.mocked(invoke).mockImplementation(async command => command === 'path_kind' ? 'file' : 'C:/cache/song.mp3');
    const node = await createCanvasAudioItemFromPathImpl({ createAssetId: () => 'asset-import-audio-test-1', makeCanvasNodeId: () => 'canvas-id', getLatestFileCacheDir: async () => 'C:/cache', getCanvasDropPosition: () => ({ x: 100, y: 200 }) }, 'C:/original/song.mp3');
    expect(node).toMatchObject({ id: 'canvas-id', x: 100, y: 200, item: { type: 'file', path: 'C:/cache/song.mp3', sourceUrl: 'C:/original/song.mp3' } });
    expect(isCanvasAudioBufferItem(node!.item)).toBe(true);
    expect(isCanvasDrawerMediaItem(node!.item)).toBe(true);
  });

  it('shows the flat price and one insertion button for each of two tracks', () => {
    const html = renderToStaticMarkup(<CanvasMusicNode item={musicNode()} catalog={catalog} pricing={pricing} onCopyOutput={() => {}} update={() => {}} onRun={() => {}} onDrag={() => {}} />);
    expect(html).toContain('50积分');
    expect(html).not.toContain('100 积分');
    expect(html).toContain('将音乐 1 放到画布');
    expect(html).toContain('将音乐 2 放到画布');
    expect(html.match(/<audio /g)).toHaveLength(2);
    const oldPricing = { ...pricing, musicModels: undefined };
    const missingPrice = renderToStaticMarkup(<CanvasMusicNode item={musicNode()} catalog={catalog} pricing={oldPricing} update={() => {}} onRun={() => {}} onDrag={() => {}} />);
    expect(missingPrice).toContain('价格待同步');
    expect(missingPrice).not.toContain('价格未配置');
    expect(estimateCanvasMusicGenerationCredits('unknown', pricing)).toMatchObject({ available: false, reason: 'pricing_unavailable' });
    expect(estimateCanvasMusicGenerationCredits('suno')).toMatchObject({ available: false, reason: 'pricing_loading' });
    expect(estimateCanvasMusicGenerationCredits('suno', { ...pricing, musicModels: [{ model: 'suno', billingType: 'music_flat', creditsPerRequest: '0' }] })).toMatchObject({ available: true, totalCredits: 0 });
  });

  it('passes the selected track and its index through the actual canvas node callback', () => {
    const source = musicNode();
    const copy = vi.fn();
    const element = CanvasNode({ canvasItem: source, scope: { copyCanvasAiOutputToCanvas: copy, canvasAiCloudImageModels: { provider: 'NEW_API', models: [], catalog, pricing }, canvasItemsRef: { current: [source] } } } as any) as React.ReactElement<any>;
    element.props.onCopyOutput(source.ai!.outputs![1], 1);
    expect(copy).toHaveBeenCalledWith(source, source.ai!.outputs![1], 1);
    expect(element.props.pricing).toEqual(pricing);
  });

  it('copies only the selected audio, retains its asset identity, plays and survives persistence', async () => {
    const source = musicNode();
    const append = vi.fn(() => 1);
    expect(await copyCanvasAiOutputToCanvasImpl({ appendCanvasItems: append, createAssetId: () => 'asset-copy-audio-test-2', makeCanvasNodeId: () => 'canvas-audio', getCanvasAiOutputCopyPosition: () => ({ x: 500, y: 20 }), showToast: vi.fn() }, source, source.ai!.outputs![1], 1)).toBe(true);
    const [nodes] = append.mock.calls[0] as unknown as [CanvasImageItem[]];
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ id: 'canvas-audio', item: { id: 'track-2', type: 'file', name: '第二段.flac', url: 'https://cdn.example.test/second.flac' } });
    expect(nodes[0].ai).toBeUndefined();
    expect(invoke).not.toHaveBeenCalled();
    const restored = sanitizeCanvasPersistedState(JSON.parse(JSON.stringify({ items: nodes }))).items[0];
    expect(isCanvasAudioBufferItem(restored.item)).toBe(true);
    const html = renderToStaticMarkup(<CanvasAudioContent item={restored.item} source={restored.item.url!} />);
    expect(html).toContain('<audio');
    expect(html).toContain('second.flac');
    expect(html).not.toContain('first.mp3');
    expect(getCanvasAiOutputPreviewSlots(source)[1].assetType).toBe('audio');
  });

  it('retains the server charge once for both returned audio tracks', async () => {
    vi.mocked(invoke).mockResolvedValue({ audioUrls: ['https://cdn.test/a.mp3', 'https://cdn.test/b.mp3'], chargedCredits: '50.000000' });
    const update = vi.fn();
    expect(await generateCanvasMusic(musicNode(), { updateAi: update, clientRequestId: 'music-request' })).toHaveLength(2);
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ musicChargedCredits: '50.000000', status: 'success' }));
  });
});
