import { describe, expect, it } from 'vitest';
import {
  NEW_API_IMAGE_RESPONSE_FORMAT,
  NEW_API_IMAGE_REQUEST_TIMEOUT_SECS,
  executeNewApiImageProtocol,
  formatNewApiImageProtocolError,
  getCanvasAiImageModelFamily,
  getCanvasAiPublicImageModelName,
  getCanvasAiImageResolutionValues,
  getDefaultNewApiImageProtocol,
  getNewApiImageModelDisplayName,
  getNewApiImageModelFamily,
  getNewApiVideoDimensions,
  getXaisImageModelDisplayName,
  formatNewApiVideoFailureMessage,
  gptImage2SizeFromAspectRatio,
  isLikelyNewApiVideoModel,
  isNewApiImageProtocolUnsupportedError,
  isHiddenCanvasAiImageModel,
  isCanvasAiPublicImageModel,
  newApiImageRequestParams,
  newApiVideoRequestParams,
  normalizeCanvasAiImageResolution,
  normalizeCanvasAiImageResolutionForModel,
  normalizeNewApiBaseEndpoint,
  selectCanvasAiImageCandidatesForResolution,
  sortCanvasAiImageCandidatesByChannelPriority,
  shouldTryNextCanvasAiImageCandidate,
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

describe('unified wallet image model families', () => {
  it('merges XAIS resolution variants into the public model families', () => {
    expect(getXaisImageModelDisplayName('Xais Nano Pro_2K')).toBe('Nano Banana Pro');
    expect(getXaisImageModelDisplayName('Nano_Banana_Pro_4K_0')).toBe('Nano Banana Pro');
    expect(getXaisImageModelDisplayName('Xais Nano2_4K')).toBe('Nano Banana 2');
    expect(getXaisImageModelDisplayName('Xais img2_1k')).toBe('GPT Image 2');
    expect(getXaisImageModelDisplayName('Xais Img2_4K')).toBe('GPT Image 2');
    expect(getXaisImageModelDisplayName('Xais_Img2_2K_H')).toBe('GPT Image 2 H');
  });

  it('removes the dedicated XAIS png model aliases from the model picker', () => {
    expect(isHiddenCanvasAiImageModel('xais-chat', 'Xais Nano Pro_4K_png')).toBe(true);
    expect(isHiddenCanvasAiImageModel('xais-chat', 'Nano_Banana_2_4K_5')).toBe(true);
    expect(isHiddenCanvasAiImageModel('xais-chat', 'Xais Nano Pro_4K')).toBe(false);
  });

  it('only exposes unified public image names in the image model picker', () => {
    expect(getCanvasAiPublicImageModelName('new-api', 'gemini-3-pro-image')).toBe('Nano Banana Pro');
    expect(getCanvasAiPublicImageModelName('xais-chat', 'Xais Img2_4K')).toBe('GPT Image 2');
    expect(isCanvasAiPublicImageModel('new-api', 'seedance-2.0')).toBe(false);
    expect(isCanvasAiPublicImageModel('new-api', 'raw-upstream-model-id')).toBe(false);
    expect(isCanvasAiPublicImageModel('xais-chat', 'Xais Nano Pro_4K_png')).toBe(false);
    expect(isCanvasAiPublicImageModel('xais-chat', 'Xais Nano2_2K')).toBe(true);
  });

  it('exposes the expected clarity choices for each unified family', () => {
    expect(getCanvasAiImageResolutionValues('xais-chat', 'Xais Nano Pro_2K')).toEqual(['2k', '4k']);
    expect(getCanvasAiImageResolutionValues('xais-chat', 'Xais Nano2_4K')).toEqual(['2k', '4k']);
    expect(getCanvasAiImageResolutionValues('xais-chat', 'Xais img2_1k')).toEqual(['1k', '2k', '4k']);
    expect(getCanvasAiImageResolutionValues('xais-chat', 'Xais_Img2_2K_H')).toEqual(['2k', '4k']);
    expect(normalizeCanvasAiImageResolutionForModel('xais-chat', 'Xais Nano Pro_2K', '1k')).toBe('2k');
  });

  it('keeps channel priority while selecting the XAIS model matching clarity', () => {
    const candidates = [
      { source: 'wallet' as const, provider: 'xais-chat' as const, providerChannelId: 'primary', model: 'Xais Nano Pro_2K' },
      { source: 'wallet' as const, provider: 'xais-chat' as const, providerChannelId: 'primary', model: 'Xais Nano Pro_4K' },
      { source: 'wallet' as const, provider: 'new-api' as const, providerChannelId: 'fallback', model: 'gemini-3-pro-image' },
    ];
    expect(selectCanvasAiImageCandidatesForResolution(candidates, '4k')).toEqual([
      expect.objectContaining({ providerChannelId: 'primary', model: 'Xais Nano Pro_4K' }),
      expect.objectContaining({ providerChannelId: 'fallback', model: 'gemini-3-pro-image' }),
    ]);
  });

  it('keeps NewAPI first when its channel priority is higher than XAIS', () => {
    const candidates = [
      { source: 'wallet' as const, provider: 'new-api' as const, providerChannelId: 'primary', model: 'gemini-3-pro-image' },
      { source: 'wallet' as const, provider: 'xais-chat' as const, providerChannelId: 'fallback', model: 'Xais Nano Pro_2K' },
      { source: 'wallet' as const, provider: 'xais-chat' as const, providerChannelId: 'fallback', model: 'Xais Nano Pro_4K' },
    ];
    expect(selectCanvasAiImageCandidatesForResolution(candidates, '4k')).toEqual([
      expect.objectContaining({ providerChannelId: 'primary', model: 'gemini-3-pro-image' }),
      expect.objectContaining({ providerChannelId: 'fallback', model: 'Xais Nano Pro_4K' }),
    ]);
  });

  it('applies the latest server channel priority to cached node candidates', () => {
    const candidates = [
      { source: 'wallet' as const, provider: 'new-api' as const, providerChannelId: 'old-first', model: 'gemini-3-pro-image' },
      { source: 'wallet' as const, provider: 'xais-chat' as const, providerChannelId: 'new-first', model: 'Xais Nano Pro_2K' },
      { source: 'wallet' as const, provider: 'xais-chat' as const, providerChannelId: 'new-first', model: 'Xais Nano Pro_4K' },
    ];
    expect(sortCanvasAiImageCandidatesByChannelPriority(candidates, ['new-first', 'old-first']))
      .toEqual([
        expect.objectContaining({ providerChannelId: 'new-first', model: 'Xais Nano Pro_2K' }),
        expect.objectContaining({ providerChannelId: 'new-first', model: 'Xais Nano Pro_4K' }),
        expect.objectContaining({ providerChannelId: 'old-first', model: 'gemini-3-pro-image' }),
      ]);
  });

  it('only fails over after an explicit rejection', () => {
    expect(shouldTryNextCanvasAiImageCandidate(new Error('status_code=400, invalid reference image'))).toBe(true);
    expect(shouldTryNextCanvasAiImageCandidate(new Error('HTTP 402: insufficient_credits'))).toBe(true);
    expect(shouldTryNextCanvasAiImageCandidate(new Error('provider_unavailable'))).toBe(true);
    expect(shouldTryNextCanvasAiImageCandidate(new Error('上游算力紧张，请稍后再试'))).toBe(true);
    expect(shouldTryNextCanvasAiImageCandidate(new Error('service overloaded: no available worker'))).toBe(true);
    expect(shouldTryNextCanvasAiImageCandidate(new Error('status_code=500, operation copy failed: source path does not exist'))).toBe(true);
    expect(shouldTryNextCanvasAiImageCandidate(new Error('status_code=500, Provided image is not valid'))).toBe(true);
    expect(shouldTryNextCanvasAiImageCandidate(new Error('status_code=500, internal server error'))).toBe(false);
    expect(shouldTryNextCanvasAiImageCandidate(new Error('channel returned no image data'))).toBe(false);
    expect(shouldTryNextCanvasAiImageCandidate(new Error('request timed out after upstream accepted it'))).toBe(false);
  });

  it('routes GPT Image 2 and GPT Image 2 H to their matching XAIS clarity variants', () => {
    const standard = [
      { source: 'wallet' as const, provider: 'xais-chat' as const, providerChannelId: 'xais', model: 'Xais img2_1k' },
      { source: 'wallet' as const, provider: 'xais-chat' as const, providerChannelId: 'xais', model: 'Xais Img2_2K' },
      { source: 'wallet' as const, provider: 'xais-chat' as const, providerChannelId: 'xais', model: 'Xais Img2_4K' },
      { source: 'wallet' as const, provider: 'new-api' as const, providerChannelId: 'newapi', model: 'gpt-image-2' },
    ];
    expect(selectCanvasAiImageCandidatesForResolution(standard, '1k')[0]?.model).toBe('Xais img2_1k');
    expect(selectCanvasAiImageCandidatesForResolution(standard, '4k')[0]?.model).toBe('Xais Img2_4K');

    const highQuality = [
      { source: 'wallet' as const, provider: 'xais-chat' as const, providerChannelId: 'xais-h', model: 'Xais Img2_2K(高画质)' },
      { source: 'wallet' as const, provider: 'xais-chat' as const, providerChannelId: 'xais-h', model: 'Xais Img2_4K(高画质)' },
    ];
    expect(selectCanvasAiImageCandidatesForResolution(highQuality, '4k')[0]?.model)
      .toBe('Xais Img2_4K(高画质)');
  });

  it('recognizes the shared family without changing provider-specific model IDs', () => {
    expect(getCanvasAiImageModelFamily('new-api', 'gemini-3-pro-image')).toBe('nano-banana-pro');
    expect(getCanvasAiImageModelFamily('xais-chat', 'Image2_2K')).toBe('gpt-image-2');
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

  it('enables clarity routing for XAIS families and leaves unrelated models unchanged', () => {
    expect(supportsCanvasAiImageResolution('xais-chat', 'Xais Nano Pro_2K')).toBe(true);
    expect(supportsCanvasAiImageResolution('xais-chat', 'Xais img2_1k')).toBe(true);
    expect(supportsCanvasAiImageResolution('xais-chat', 'gpt-image-2')).toBe(true);
    expect(supportsCanvasAiImageResolution('new-api', 'gpt-image-1')).toBe(false);
    expect(supportsCanvasAiImageResolution('new-api', 'gemini-lite-image')).toBe(false);
  });

  it('normalizes resolution casing and calculates GPT Image 2 sizes', () => {
    expect(normalizeCanvasAiImageResolution('1K')).toBe('1k');
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

describe('NewAPI image protocol errors', () => {
  it('prefers URL responses so large 2K/4K payloads can cache in the background', () => {
    expect(NEW_API_IMAGE_RESPONSE_FORMAT).toBe('url');
  });

  it('keeps the synchronous request open long enough for slow upstream image jobs', () => {
    expect(NEW_API_IMAGE_REQUEST_TIMEOUT_SECS).toBeGreaterThan(267);
  });

  it('routes all current NewAPI image models through chat/completions', () => {
    expect(getDefaultNewApiImageProtocol('gemini-3.1-flash-image', true)).toBe('chat_completions');
    expect(getDefaultNewApiImageProtocol('gpt-image-2', true)).toBe('chat_completions');
    expect(getDefaultNewApiImageProtocol('gpt-image-2', false)).toBe('chat_completions');
    expect(getDefaultNewApiImageProtocol('custom-image-model', false)).toBe('chat_completions');
  });

  it.each([
    'AI request failed: HTTP 404: route not found',
    'HTTP 405 method not allowed',
    'status code: 501 endpoint not implemented',
    '当前服务不支持该接口',
  ])('recognizes an unsupported configured endpoint: %s', message => {
    expect(isNewApiImageProtocolUnsupportedError(new Error(message))).toBe(true);
  });

  it('shows a concise upstream message for transient server failures', () => {
    expect(formatNewApiImageProtocolError('chat_completions', new Error('HTTP 502 bad gateway')))
      .toBe('上游渠道暂时不可用（chat/completions，HTTP 502），请稍后手动重试。');
  });

  it('does not call images/edits after chat/completions returns 502', async () => {
    let chatCalls = 0;
    let editCalls = 0;
    await expect(executeNewApiImageProtocol('chat_completions', [], {
      ensureReferencesReady: async () => ({ readyDurationMs: 0, referenceHosts: [] }),
      chatCompletions: async () => {
        chatCalls += 1;
        throw new Error('HTTP 502 bad gateway');
      },
      imagesEdits: async () => {
        editCalls += 1;
        return {};
      },
      imagesGenerations: async () => ({}),
    })).rejects.toThrow('HTTP 502');
    expect(chatCalls).toBe(1);
    expect(editCalls).toBe(0);
  });

  it('does not retry images/edits after a 502', async () => {
    let editCalls = 0;
    await expect(executeNewApiImageProtocol('images_edits', [], {
      ensureReferencesReady: async () => ({ readyDurationMs: 0, referenceHosts: [] }),
      chatCompletions: async () => ({}),
      imagesEdits: async () => {
        editCalls += 1;
        throw new Error('HTTP 502 bad gateway');
      },
      imagesGenerations: async () => ({}),
    })).rejects.toThrow('HTTP 502');
    expect(editCalls).toBe(1);
  });

  it('does not submit a paid request while a Cloudflare reference URL is unready', async () => {
    let submitCalls = 0;
    await expect(executeNewApiImageProtocol('chat_completions', ['https://ref.trycloudflare.com/a.png'], {
      ensureReferencesReady: async () => {
        throw new Error('reference not ready');
      },
      chatCompletions: async () => {
        submitCalls += 1;
        return {};
      },
      imagesEdits: async () => ({}),
      imagesGenerations: async () => ({}),
    })).rejects.toThrow('reference not ready');
    expect(submitCalls).toBe(0);
  });

  it('submits exactly once after the reference URL is ready', async () => {
    let submitCalls = 0;
    const result = await executeNewApiImageProtocol<{ readyDurationMs: number; referenceHosts: string[] }>(
      'images_generations',
      ['https://ref.trycloudflare.com/a.png'],
      {
        ensureReferencesReady: async () => ({ readyDurationMs: 420, referenceHosts: ['ref.trycloudflare.com'] }),
        chatCompletions: async () => ({ readyDurationMs: 0, referenceHosts: [] }),
        imagesEdits: async () => ({ readyDurationMs: 0, referenceHosts: [] }),
        imagesGenerations: async (readiness) => {
          submitCalls += 1;
          return readiness;
        },
      },
    );
    expect(submitCalls).toBe(1);
    expect(result.readyDurationMs).toBe(420);
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
