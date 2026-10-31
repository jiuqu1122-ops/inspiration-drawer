import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import type { CanvasImageItem } from '../../canvasModel';
import { getCanvasEnhancementInputImpl, runCanvasEnhancementNodeImpl } from './canvasGenerationActions';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: (path: string) => `asset://localhost/` + path }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('../../drawerPrefs', () => ({ MIN_DRAWER_WIDTH: 880, MAX_DRAWER_WIDTH: 1920, MIN_DRAWER_HEIGHT: 560, MAX_DRAWER_HEIGHT: 1080 }));

beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.stubGlobal('window', { setTimeout, clearTimeout, performance: { now: () => 0 } });
  vi.stubGlobal('localStorage', { getItem: () => null });
  vi.mocked(invoke).mockResolvedValue({ outputPath: 'C:/outputs/enhanced.jpg', scale: 2, width: 3024, height: 1764 });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function fixture(source = 'C:/images/原图无后缀', mediaType: 'image' | 'video' = 'image') {
  const input: CanvasImageItem = { id: 'input', x: 0, y: 0, width: 320, height: 200,
    item: { id: 'source', type: mediaType, name: '原图', content: '', path: source, createdAt: 0 } };
  const target: CanvasImageItem = { id: 'enhancement', x: 0, y: 0, width: 600, height: 500,
    inputs: [input.id], item: { id: 'generator', type: 'text', content: '', createdAt: 0 },
    ai: { type: mediaType === 'image' ? 'image-enhancement' : 'video-enhancement', outputFormat: mediaType === 'image' ? 'jpg' : 'mp4', enhancementScale: 2, aspectRatio: '16:9' } };
  const canvasItemsRef = { current: [input, target] };
  const ctx = {
    activeCanvasIdRef: { current: 'canvas' }, canvasItemsRef,
    getCanvasEnhancementInput: (node: CanvasImageItem) => getCanvasEnhancementInputImpl({ canvasItemsRef }, node),
    cacheCanvasGeneratedImageSource: vi.fn(async () => ({ path: 'C:/cache/original', url: 'asset://original', sourceUrl: source })),
    createCanvasImagePreviewThumbnail: vi.fn(async () => 'asset://thumbnail'),
    getCanvasAiErrorSummary: (message?: string | null) => message || '',
    addGeneratedImagesToDrawer: vi.fn(), addGeneratedVideosToDrawer: vi.fn(),
    updateCanvasSelection: vi.fn(), showToast: vi.fn(),
    updateCanvasAiGeneratorData: vi.fn((_id: string, patch: Partial<NonNullable<CanvasImageItem['ai']>>) => {
      target.ai = { ...target.ai!, ...patch }; return target;
    }),
  } satisfies Parameters<typeof runCanvasEnhancementNodeImpl>[0];
  return { input, target, ctx };
}

describe('Real-ESRGAN image controller', () => {
  it('sends the original local file to native enhancement and saves true pixel dimensions', async () => {
    const { ctx, target } = fixture();
    await runCanvasEnhancementNodeImpl(ctx, target.id);
    expect(ctx.cacheCanvasGeneratedImageSource).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith('run_realesrgan_image_enhancement', expect.objectContaining({ inputPath: 'C:/images/原图无后缀', scale: 2, outputFormat: 'jpg' }));
    expect(target.ai?.outputs?.[0]).toMatchObject({ status: 'success', width: 3024, height: 1764 });
    expect(ctx.addGeneratedImagesToDrawer.mock.calls[0][0][0]).toMatchObject({ width: 3024, height: 1764 });
  });

  it.each(['https://cdn.example/image', 'data:image/png;base64,iVBORw0KGgo='])('caches %s before invoking the engine', async source => {
    const { ctx, target } = fixture(source);
    await runCanvasEnhancementNodeImpl(ctx, target.id);
    expect(ctx.cacheCanvasGeneratedImageSource).toHaveBeenCalledWith(source, expect.stringContaining('enhancement_input_'), { throwOnFailure: true });
    expect(invoke).toHaveBeenCalledWith('run_realesrgan_image_enhancement', expect.objectContaining({ inputPath: 'C:/cache/original' }));
    expect(ctx.cacheCanvasGeneratedImageSource.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(invoke).mock.invocationCallOrder[0]);
  });

  it('fails before invoking the engine when caching fails, without leaking private URLs', async () => {
    const { ctx, target } = fixture('https://private.example?token=secret');
    ctx.cacheCanvasGeneratedImageSource.mockRejectedValue(new Error('download private.example?token=secret to C:/Users/Private'));
    await runCanvasEnhancementNodeImpl(ctx, target.id);
    expect(invoke).not.toHaveBeenCalled();
    expect(target.ai).toMatchObject({ status: 'error', enhancementProgress: undefined });
    expect(target.ai?.error).toContain('原图下载或本地缓存失败');
    expect(target.ai?.error).not.toMatch(/secret|Private|private.example/);
    expect(ctx.addGeneratedImagesToDrawer).not.toHaveBeenCalled();
  });

  it('does not fabricate node-sized metadata if a legacy backend omits pixel dimensions', async () => {
    vi.mocked(invoke).mockResolvedValue({ outputPath: 'C:/outputs/enhanced.png', scale: 2 });
    const { ctx, target } = fixture();
    await runCanvasEnhancementNodeImpl(ctx, target.id);
    expect(target.ai?.outputs?.[0]).toMatchObject({ status: 'success' });
    expect(target.ai?.outputs?.[0].width).toBeUndefined();
    expect(target.ai?.outputs?.[0].height).toBeUndefined();
  });

  it('keeps native stage errors visible and clears working progress', async () => {
    vi.mocked(invoke).mockRejectedValue('图片增强[识别格式]：图片内容损坏');
    const { ctx, target } = fixture();
    await runCanvasEnhancementNodeImpl(ctx, target.id);
    expect(target.ai).toMatchObject({ status: 'error', error: '图片增强[识别格式]：图片内容损坏', enhancementProgress: undefined });
    expect(target.ai?.outputs?.[0]).toMatchObject({ status: 'error', error: '图片增强[识别格式]：图片内容损坏' });
  });

  it('does not route videos through the image-cache preparation step', async () => {
    const { ctx, target } = fixture('C:/videos/source.mp4', 'video');
    await runCanvasEnhancementNodeImpl(ctx, target.id);
    expect(ctx.cacheCanvasGeneratedImageSource).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledWith('run_realesrgan_video_enhancement', expect.objectContaining({ inputPath: 'C:/videos/source.mp4' }));
    expect(ctx.addGeneratedVideosToDrawer).toHaveBeenCalledOnce();
  });

  it('uses a generated original URL, never its thumbnail', () => {
    const { ctx, input, target } = fixture();
    input.item.type = 'text'; delete input.item.path;
    input.ai = { type: 'image-generator', outputs: [{ id: 'output', status: 'success', url: 'https://cdn.example/original', thumbnail: 'data:image/png;base64,thumbnail' }] };
    expect(getCanvasEnhancementInputImpl(ctx, target)?.source).toBe('https://cdn.example/original');
    delete input.ai.outputs![0].url;
    expect(getCanvasEnhancementInputImpl(ctx, target)).toBeNull();
  });
});
