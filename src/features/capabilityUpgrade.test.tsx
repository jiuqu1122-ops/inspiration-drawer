import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { invoke } from '@tauri-apps/api/core';
import { resolveImageModelCapabilities } from './aiModelCapabilities';
import { ChatImageSettings } from './chat/components/ChatImageSettings';
import { CanvasMusicNode, generateCanvasMusic, getCanvasMusicDownloadUrl } from './canvasMusic';
import { createCanvasAiOutputBufferItem } from '../utils/canvasItemSelectors';
import { pasteCanvasItemsImpl, getCanvasImageInputBufferItemsForNodeImpl } from './canvas/controllers/canvasMediaActions';
import { readWorkflowChatBindings, saveWorkflowChatBinding, getWorkflowChatBinding } from './chat/storage/workflowChatStorage';
import { selectConversationRange } from './chat/model/conversationSelection';
import { resolveDirectVisualTool } from './chat/tools/chatToolDefinitions';
import { resolveChatReferenceArguments } from './chat/runtime/chatReferenceArguments';
import { describeCanvasImageCreditEstimate, estimateCanvasImageGenerationCredits } from './canvasGenerationCredits';
import type { CanvasImageItem } from './canvasModel';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: (path: string) => `asset://${path}` }));
const music: CanvasImageItem = { id: 'music-node', x: 24, y: 24, width: 360, height: 240, item: { id: 'music-item', type: 'text', content: '', createdAt: 1, isQuickAccess: false }, ai: { type: 'music-generator', model: 'audio-model', prompt: 'Ambient', outputs: [] } };

describe('capability upgrade client flows', () => {
  beforeEach(() => vi.mocked(invoke).mockReset());
  it('reads quality from the server and never invents it for a familiar model name', () => {
    expect(resolveImageModelCapabilities({ canonical: { supportedQualities: ['high', 'max'], qualityParameter: 'render_quality', outputMode: 'multiple_assets', maxOutputImages: 4, billingMode: 'per_request' } })).toMatchObject({ supportedQualities: ['high', 'max'], outputMode: 'multiple_assets', billingMode: 'per_request' });
    expect(resolveImageModelCapabilities({ canonical: {} }).supportedQualities).toEqual([]);
  });
  it('shows the quality dropdown only for configured quality options', () => {
    const props = { model: 'arbitrary-model', modelOptions: [{ value: 'arbitrary-model', label: 'Model' }], onModelChange: () => {}, aspectRatio: '1:1', aspectRatioOptions: [{ value: '1:1', label: '1:1' }], onAspectRatioChange: () => {}, resolution: '2k', resolutionOptions: [{ value: '2k', label: '2K' }], onResolutionChange: () => {}, busy: false };
    expect(renderToStaticMarkup(<ChatImageSettings {...props} quality="high" qualityOptions={[{ value: 'high', label: 'high' }]} />)).toContain('质量');
    expect(renderToStaticMarkup(<ChatImageSettings {...props} qualityOptions={[]} />)).not.toContain('质量');
  });
  it('generates music with one bridge call and displays every playable audio asset', async () => {
    vi.mocked(invoke).mockResolvedValue({ audioUrls: ['https://cdn.example.com/a.mp3', 'https://cdn.example.com/b.mp3'], chargedCredits: '12' });
    const updateAi = vi.fn();
    const outputs = await generateCanvasMusic(music, { updateAi, clientRequestId: 'music-request' });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('generate_cloud_music', { request: { clientRequestId: 'music-request', model: 'audio-model', prompt: 'Ambient' } });
    const item = { ...music, ai: { ...music.ai!, outputs, status: 'success' as const } };
    const html = renderToStaticMarkup(<CanvasMusicNode item={item} catalog={[{ id: 'audio-model', displayName: 'Music', modality: 'audio' }]} update={() => {}} onRun={() => {}} onDrag={() => {}} />);
    expect((html.match(/<audio /g) || []).length).toBe(2);
    expect((html.match(/download=/g) || []).length).toBe(2);
    expect(createCanvasAiOutputBufferItem(item, outputs[0], 0)).toMatchObject({ type: 'file', name: '音乐 1.mp3', url: 'https://cdn.example.com/a.mp3' });
  });
  it('does not retry a failed music POST', async () => {
    vi.mocked(invoke).mockImplementation(async (command) => { if (command === 'generate_cloud_music') throw new Error('timeout'); return undefined; });
    expect(await generateCanvasMusic(music, { updateAi: vi.fn() })).toEqual([]);
    expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === 'generate_cloud_music')).toHaveLength(1);
  });
  it('downloads durable music through an attachment URL without altering legacy signed links', () => {
    const url = `https://api.example.test/v1/ai/audio-results/${'a'.repeat(64)}.mp3`;
    expect(getCanvasMusicDownloadUrl(url)).toBe(`${url}?download=1`);
    expect(getCanvasMusicDownloadUrl('https://vendor.test/song.mp3?signature=x')).toBe('https://vendor.test/song.mp3?signature=x');
  });
  it('recovers music storage by GET and preserves the returned audio format', async () => {
    vi.mocked(invoke).mockResolvedValue({ audioUrls: ['https://api.example.test/v1/ai/audio-results/asset.wav'], assets: [{ url: 'https://api.example.test/v1/ai/audio-results/asset.wav', name: '音乐 1.wav' }] });
    const updateAi = vi.fn();
    const pending = { ...music, ai: { ...music.ai!, musicClientRequestId: 'pending-receipt' } };
    const outputs = await generateCanvasMusic(pending, { updateAi });
    expect(invoke).toHaveBeenCalledWith('get_cloud_music_generation_by_request', { clientRequestId: 'pending-receipt' });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(outputs[0]).toMatchObject({ name: '音乐 1.wav', assetType: 'audio', clientRequestId: 'pending-receipt' });
    expect(updateAi).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'success', musicClientRequestId: undefined }));
  });
  it('retains the receipt after a COS failure and offers recovery without another POST', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('music_storage_pending: upload failed'));
    const updateAi = vi.fn();
    const pending = { ...music, ai: { ...music.ai! } };
    updateAi.mockImplementation(patch => Object.assign(pending.ai!, patch));
    await generateCanvasMusic(pending, { updateAi, clientRequestId: 'pending-storage' });
    expect(pending.ai!.musicClientRequestId).toBe('pending-storage');
    const html = renderToStaticMarkup(<CanvasMusicNode item={pending} catalog={[]} update={() => {}} onRun={() => {}} onDrag={() => {}} />);
    expect(html).toContain('恢复结果');
    vi.mocked(invoke).mockResolvedValueOnce({ status: 'processing' });
    await generateCanvasMusic(pending, { updateAi });
    expect(vi.mocked(invoke).mock.calls.map(([command]) => command)).toEqual(['generate_cloud_music', 'get_cloud_music_generation_by_request']);
    expect(pending.ai!.musicClientRequestId).toBe('pending-storage');
  });
  it('exposes audio as a video reference only when the server grants audio input', () => {
    const source = { ...music, ai: { ...music.ai!, outputs: [{ id: 'audio-asset', assetType: 'audio' as const, status: 'success' as const, url: 'https://cdn.example.com/song.mp3', name: 'song.mp3' }] } };
    const target: CanvasImageItem = { ...music, id: 'video-node', inputs: [source.id], ai: { type: 'video-generator', model: 'video-model', providerCandidates: [{ source: 'local', provider: 'custom', model: 'video-model', modelCapabilities: { supportsAudioReference: true, maxReferenceAudios: 1 } }] } };
    const context = { getCanvasInputItemsForNode: () => [source] } as any;
    expect(getCanvasImageInputBufferItemsForNodeImpl(context, target, [source, target])).toEqual([expect.objectContaining({ id: 'audio-asset', type: 'file', url: 'https://cdn.example.com/song.mp3' })]);
    target.ai!.providerCandidates![0].modelCapabilities = { supportsAudioReference: false, maxReferenceAudios: 0 };
    expect(getCanvasImageInputBufferItemsForNodeImpl(context, target, [source, target])).toEqual([]);
  });
  it('copies generated images with the same resource identity, cached path and thumbnail', () => {
    const source: CanvasImageItem = { ...music, id: 'old-node', item: { ...music.item, id: 'asset-id', type: 'image', path: 'C:/cache/image.png', url: 'asset://image', thumbnail: 'data:image/png;base64,AA' }, ai: { type: 'generated-image' } };
    const append = vi.fn((_items: CanvasImageItem[]) => 1);
    pasteCanvasItemsImpl({ canvasClipboardRef: { current: [source] }, isCanvasModeRef: { current: true }, CANVAS_PASTE_OFFSET: 48, createAssetId: () => 'new-buffer', makeCanvasNodeId: () => 'new-node', getCanvasBoundsFromItems: () => ({ x: 24, y: 24, width: 360, height: 240 }), getCanvasPointFromClient: () => ({ x: 100, y: 100 }), appendCanvasItems: append, showToast: () => {} } as any);
    expect(append.mock.calls[0][0][0]).toMatchObject({ id: 'new-node', item: { id: 'asset-id', path: 'C:/cache/image.png', thumbnail: source.item.thumbnail } });
    expect(invoke).not.toHaveBeenCalled();
  });
  it('restores workflow bindings across sessions and keeps different canvases separate', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) || null, setItem: (key: string, value: string) => { data.set(key, value); } };
    saveWorkflowChatBinding({ canvasId: 'canvas-a', nodeId: 'workflow', conversationId: 'chat-a' }, storage);
    saveWorkflowChatBinding({ canvasId: 'canvas-b', nodeId: 'workflow', conversationId: 'chat-b' }, storage);
    expect(readWorkflowChatBindings(storage)).toHaveLength(2);
    expect(getWorkflowChatBinding('canvas-a', 'workflow', storage)?.conversationId).toBe('chat-a');
  });
  it('selects conversation ranges and routes attached image removal to editing with the reference intact', () => {
    expect(selectConversationRange(['a', 'b', 'c', 'd'], 'c', 'a', [])).toEqual(['a', 'b', 'c']);
    expect(resolveDirectVisualTool('删除蓝圈里的部件', false, 1)).toBe('edit_image');
    expect(resolveChatReferenceArguments({ toolName: 'edit_image', args: { prompt: '删除蓝圈里的部件' }, currentImageAttachments: [{ id: 'attachment', messageId: 'message', type: 'image', path: 'C:/cache/reference.png', createdAt: 1 }] })).toMatchObject({ referenceImages: ['C:/cache/reference.png'] });
  });
  it('shows the quality price and the configured per-request estimate', () => {
    const pricing = { agentRequestCredits: '1', inspirationAnalysisCredits: '0', imageDefaultCredits: '0', videoDefaultCredits: '0', imageModels: [{ model: 'arbitrary', billingType: 'image_resolution' as const, creditsByResolution: { '2k': '10' }, creditsByResolutionQuality: { '2k': { high: '20' } } }], videoModels: [] };
    expect(estimateCanvasImageGenerationCredits({ model: 'arbitrary', resolution: '2k', quality: 'high', count: 4, supportedResolutions: ['2k'], serverDriven: true, billingMode: 'per_request' }, pricing).totalCredits).toBe(20);
    expect(estimateCanvasImageGenerationCredits({ model: 'arbitrary', resolution: '2k', quality: 'high', count: 4, supportedResolutions: ['2k'], serverDriven: true, billingMode: 'per_image' }, pricing).totalCredits).toBe(80);
    const multi = estimateCanvasImageGenerationCredits({ model: 'arbitrary', resolution: '2k', quality: 'high', count: 1, supportedResolutions: ['2k'], serverDriven: true, billingMode: 'per_image', outputMode: 'multiple_assets', maxOutputImages: 4 }, pricing);
    expect(multi).toMatchObject({ outputCount: 4, totalCredits: 80 });
    const flat = estimateCanvasImageGenerationCredits({ model: 'arbitrary', resolution: '2k', quality: 'high', count: 1, supportedResolutions: ['2k'], serverDriven: true, billingMode: 'per_request', outputMode: 'multiple_assets', maxOutputImages: 4 }, pricing);
    expect(describeCanvasImageCreditEstimate(flat)).toContain('20 积分/次');
  });
});
