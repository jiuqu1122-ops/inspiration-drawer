import { describe, expect, it } from 'vitest';
import {
  getNewApiImageModelDisplayName,
  getNewApiImageModelFamily,
  getNewApiVideoDimensions,
  formatNewApiVideoFailureMessage,
  gptImage2SizeFromAspectRatio,
  isLikelyNewApiVideoModel,
  newApiImageRequestParams,
  newApiVideoRequestParams,
  normalizeCanvasAiImageResolution,
  normalizeNewApiBaseEndpoint,
  shouldFallbackNewApiImageGenerationToChat,
  supportsCanvasAiImageResolution,
} from './canvasAiImage';

describe('NewAPI image model mapping', () => {
  it.each([
    'gemini-3-pro-image',
    'Gemini3Pro',
    'google/gemini_3_pro_image_preview',
    'models/gemini-3.1-pro-image-preview',
  ])('maps %s to Nano Banana Pro', model => {
    expect(getNewApiImageModelFamily(model)).toBe('nano-banana-pro');
    expect(getNewApiImageModelDisplayName(model)).toBe('Nano Banana Pro');
  });

  it.each([
    'gemini-3.1-flash-image',
    'Gemini31FlashImage',
    'google/gemini_3_1_flash_image_preview',
    'models/gemini-3-flash-image-preview',
  ])('maps %s to Nano Banana 2', model => {
    expect(getNewApiImageModelFamily(model)).toBe('nano-banana-2');
    expect(getNewApiImageModelDisplayName(model)).toBe('Nano Banana 2');
  });

  it.each([
    'gemini-lite-image',
    'GeminiImageLite',
    'google/lite-gemini-3-image-preview',
    'models/gemini_3_flash_image_lite',
  ])('maps %s to Nano Banana Lite 1K', model => {
    expect(getNewApiImageModelFamily(model)).toBe('nano-banana-lite');
    expect(getNewApiImageModelDisplayName(model)).toBe('Nano Banana Lite 1K');
  });

  it('does not relabel unrelated Gemini models', () => {
    expect(getNewApiImageModelFamily('gemini-2.5-flash-image')).toBeNull();
    expect(getNewApiImageModelFamily('gemini-3-image-preview')).toBeNull();
    expect(getNewApiImageModelFamily('gemini-lite-text')).toBeNull();
    expect(getNewApiImageModelFamily('imagen-lite-image')).toBeNull();
    expect(getNewApiImageModelDisplayName('imagen-4')).toBe('imagen-4');
  });

  it('uses a readable GPT Image 2 label without changing its model ID', () => {
    expect(getNewApiImageModelDisplayName('gpt_image_2')).toBe('GPT Image 2');
  });
});

describe('image resolution routing', () => {
  it('enables 2K/4K for NewAPI Gemini image families and GPT Image 2', () => {
    expect(supportsCanvasAiImageResolution('new-api', 'gemini-3-pro-image')).toBe(true);
    expect(supportsCanvasAiImageResolution('new-api', 'gemini-3.1-flash-image')).toBe(true);
    expect(supportsCanvasAiImageResolution('new-api', 'gpt-image-2')).toBe(true);
    expect(supportsCanvasAiImageResolution('custom', 'gpt_image_2_guan')).toBe(true);
    expect(supportsCanvasAiImageResolution('openai-compatible', 'gptimage2')).toBe(true);
  });

  it('leaves XAIS and unrelated image models unchanged', () => {
    expect(supportsCanvasAiImageResolution('xais-chat', 'Xais Nano Pro_2K')).toBe(false);
    expect(supportsCanvasAiImageResolution('xais-chat', 'gpt-image-2')).toBe(false);
    expect(supportsCanvasAiImageResolution('new-api', 'gpt-image-1')).toBe(false);
    expect(supportsCanvasAiImageResolution('new-api', 'gemini-lite-image')).toBe(false);
  });

  it('normalizes resolution casing and calculates GPT Image 2 sizes', () => {
    expect(normalizeCanvasAiImageResolution('4K')).toBe('4k');
    expect(normalizeCanvasAiImageResolution(undefined)).toBe('2k');
    expect(gptImage2SizeFromAspectRatio('16:9', '2K')).toBe('1920x1088');
    expect(gptImage2SizeFromAspectRatio('3:4', '4K')).toBe('2400x3200');
  });

  it('adds size and quality for mapped NewAPI models', () => {
    expect(newApiImageRequestParams('gemini-3-pro-image', 2, '16:9', '2K')).toEqual({
      n: 2,
      size: '1920x1088',
      aspect_ratio: '16:9',
      ratio: '16:9',
      quality: 'standard',
    });
    expect(newApiImageRequestParams('gemini-3.1-flash-image-preview', 1, '3:4', '4K')).toEqual({
      n: 1,
      size: '2400x3200',
      aspect_ratio: '3:4',
      ratio: '3:4',
      quality: 'high',
    });
    expect(newApiImageRequestParams('gpt_image_2', 1, '9:16', '4k')).toEqual({
      n: 1,
      size: '2160x3840',
      aspect_ratio: '9:16',
      ratio: '9:16',
      quality: 'high',
    });
  });

  it('keeps legacy NewAPI image request parameters unchanged', () => {
    expect(newApiImageRequestParams('gpt-image-1', 1, '16:9', '4K')).toEqual({
      n: 1,
      size: '1792x1024',
      aspect_ratio: '16:9',
      ratio: '16:9',
    });
  });

  it('keeps Nano Banana Lite at the normal 1K path without quality controls', () => {
    expect(newApiImageRequestParams('models/gemini_3_flash_image_lite', 1, '16:9', '4K')).toEqual({
      n: 1,
      size: '1792x1024',
      aspect_ratio: '16:9',
      ratio: '16:9',
    });
  });
});

describe('NewAPI image endpoint fallback', () => {
  it.each([
    'AI request failed: HTTP 404: route not found',
    'HTTP 405 method not allowed',
    'status code: 501 endpoint not implemented',
    '当前服务不支持该接口',
  ])('falls back for an unsupported images endpoint: %s', message => {
    expect(shouldFallbackNewApiImageGenerationToChat(new Error(message))).toBe(true);
  });

  it.each([
    'request timed out after 300 seconds',
    'HTTP 500 internal server error',
    'New API images/generations did not return image data.',
    'network connection reset',
  ])('does not start a second generation request for: %s', message => {
    expect(shouldFallbackNewApiImageGenerationToChat(new Error(message))).toBe(false);
  });
});

describe('NewAPI video routing', () => {
  it('explains upstream Cloudflare channel failures without blaming local networking', () => {
    expect(formatNewApiVideoFailureMessage('list recipes failed: cloudflare 403 challenge (status=429)'))
      .toContain('NewAPI 上游视频渠道');
    expect(formatNewApiVideoFailureMessage('upstream model overloaded')).toBe('upstream model overloaded');
  });

  it.each([
    'sora-2',
    'veo3.1-fast',
    'Veo 3.1 Fast',
    'seedance-1.5-pro',
    'kling-v2.1',
    'wan2.1-i2v',
  ])('recognizes likely video model %s', model => {
    expect(isLikelyNewApiVideoModel(model)).toBe(true);
  });

  it('keeps image and text models out of the likely video group', () => {
    expect(isLikelyNewApiVideoModel('gemini-3-pro-image')).toBe(false);
    expect(isLikelyNewApiVideoModel('gpt-5.4')).toBe(false);
  });

  it('normalizes video endpoints without duplicating v1', () => {
    expect(normalizeNewApiBaseEndpoint('https://api.example.com/v1/video/generations/task-123'))
      .toBe('https://api.example.com/v1');
  });

  it('builds standard NewAPI video parameters and preserves first/last frame metadata', () => {
    expect(getNewApiVideoDimensions('16:9', '1080p')).toEqual({ width: 1920, height: 1080 });
    expect(newApiVideoRequestParams({
      model: 'seedance-1.5-pro',
      prompt: 'Camera moves around the product',
      inputImages: ['https://example.com/start.png', 'https://example.com/end.png'],
      aspectRatio: '16:9',
      resolution: '1080p',
      duration: 8,
      inputMode: 'FLF',
      count: 1,
    })).toEqual({
      model: 'seedance-1.5-pro',
      prompt: 'Camera moves around the product',
      image: 'https://example.com/start.png',
      duration: 8,
      width: 1920,
      height: 1080,
      n: 1,
      response_format: 'url',
      metadata: {
        aspect_ratio: '16:9',
        resolution: '1080p',
        input_mode: 'FLF',
        end_image: 'https://example.com/end.png',
        reference_images: ['https://example.com/start.png', 'https://example.com/end.png'],
      },
    });
  });
});
