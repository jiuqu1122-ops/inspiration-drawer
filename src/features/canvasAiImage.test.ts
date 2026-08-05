import { describe, expect, it } from 'vitest';
import {
  CANVAS_AI_IMAGE_TASK_TIMEOUT_MINUTES,
  CANVAS_AI_IMAGE_TASK_TIMEOUT_MS,
  CANVAS_AI_VIDEO_TASK_TIMEOUT_MINUTES,
  CANVAS_AI_VIDEO_TASK_TIMEOUT_MS,
  CANVAS_AI_PUBLIC_IMAGE_MODEL_NAMES,
  CANVAS_AI_VIDEO_MODEL_OPTIONS,
  NEW_API_SEEDANCE_2_FAST_MODEL,
  NEW_API_SEEDANCE_2_MODEL,
  NEW_API_VIDEO_MODEL_DEFAULT,
  NEW_API_IMAGE_TASK_MAX_WAIT_MS,
  NEW_API_IMAGE_RESPONSE_FORMAT,
  NEW_API_IMAGE_REQUEST_TIMEOUT_SECS,
  buildNewApiVideoPrompt,
  buildCanvasAiIndexedReferencePrompt,
  collectVideoStrings,
  executeNewApiImageProtocol,
  formatNewApiImageProtocolError,
  getCanvasAiImageModelFamily,
  getCanvasAiPublicImageModelPriority,
  getCanvasAiPublicImageModelName,
  getCanvasAiPublicImageModelId,
  getCanvasAiImageResolutionValues,
  getCanvasAiImageResolutionValuesForCandidates,
  hydrateCanvasAiModelCandidateCapabilities,
  getCanvasAiSlotClientRequestId,
  getCanvasAiVideoReferenceSlotLabels,
  getCanvasAiVideoReferenceSlots,
  getCanvasAiVideoModelCandidates,
  getCanvasAiVideoModelOptionValue,
  getCanvasAiVideoProviderForModel,
  isSeedance20VideoModel,
  getCloudWalletImageLookupImages,
  getDefaultNewApiImageProtocol,
  getNewApiImageModelDisplayName,
  getNewApiImageModelFamily,
  getNewApiVideoDimensions,
  getNewApiVideoDurationValues,
  getNewApiVideoReferenceLimit,
  getNewApiVideoResolutionValues,
  getMikotoVideoResolutionValues,
  getMikotoVideoDurationValues,
  normalizeMikotoVideoResolution,
  normalizeMikotoVideoDuration,
  getXaisImageModelDisplayName,
  formatNewApiVideoFailureMessage,
  getNewApiVideoTaskState,
  isNewApiVideoFailureState,
  gptImage2SizeFromAspectRatio,
  isLikelyNewApiVideoModel,
  isNewApiImageProtocolUnsupportedError,
  isHiddenCanvasAiImageModel,
  isCanvasAiPublicImageModel,
  mergeCanvasAiReferenceSourceItems,
  newApiImageRequestParams,
  newApiVideoRequestParams,
  normalizeCanvasAiImageResolution,
  normalizeCanvasAiImageResolutionForModel,
  normalizeCanvasAiImageResolutionForCandidates,
  normalizeCloudWalletImageAspectRatio,
  normalizeCloudWalletImageProvider,
  normalizeCloudWalletVideoProvider,
  normalizeNewApiBaseEndpoint,
  normalizeSeedanceVideoAspectRatio,
  normalizeNewApiVideoDurationForModel,
  validateCanvasAiVideoReferences,
  orderCanvasAiReferenceSources,
  reconcileWalletImageCandidates,
  resolveCanvasAiReferenceProvider,
  resolveCanvasAiCandidateInputImages,
  selectCanvasAiImageCandidatesForResolution,
  sortCanvasAiImageCandidatesByChannelPriority,
  shouldRetrySameCanvasAiImageCandidate,
  shouldUseCanvasAiNativeImageBatchRequest,
  getCanvasAiReferencePublicationMaxUrlLength,
  shouldTryNextCanvasAiImageCandidate,
  shouldUsePortableWalletImageReferences,
  normalizeCanvasAiOutputFormat,
  supportsCanvasAiTransparentPng,
  supportsCanvasAiImageResolution,
} from './canvasAiImage';

describe('wallet provider protocol compatibility', () => {
  it('omits newer channel labels from the legacy image request provider field', () => {
    expect(normalizeCloudWalletImageProvider('mikoto')).toBeUndefined();
    expect(normalizeCloudWalletImageProvider('bigmodel')).toBeUndefined();
    expect(normalizeCloudWalletImageProvider('new-api')).toBe('new-api');
  });

  it('preserves the selected video channel provider', () => {
    expect(normalizeCloudWalletVideoProvider('mikoto')).toBe('mikoto');
    expect(normalizeCloudWalletVideoProvider('bigmodel')).toBeUndefined();
    expect(normalizeCloudWalletVideoProvider('xais-chat')).toBe('xais-chat');
  });
});

describe('cloud wallet video result parsing', () => {
  it('prefers mirrored OSS results without duplicating upstream video URLs', () => {
    expect(collectVideoStrings({
      walletVideoResults: [
        'https://api.unmind.art/v1/ai/video-results/stable-1.mp4',
        'https://api.unmind.art/v1/ai/video-results/stable-2.mp4',
      ],
      upstream: {
        results: [
          'https://upstream.example/video-1.mp4',
          'https://upstream.example/video-2.mp4',
        ],
      },
    })).toEqual([
      'https://api.unmind.art/v1/ai/video-results/stable-1.mp4',
      'https://api.unmind.art/v1/ai/video-results/stable-2.mp4',
    ]);
  });
});

describe('NewAPI image model mapping', () => {
  it('keeps the canvas model menu fixed to the three public image models', () => {
    expect(CANVAS_AI_PUBLIC_IMAGE_MODEL_NAMES).toEqual([
      'Nano Banana Pro',
      'Nano Banana 2',
      'GPT Image 2',
    ]);
    expect(getCanvasAiPublicImageModelId('new-api', 'Nano Banana 2')).toBe('gemini-3.1-flash-image');
    expect(getCanvasAiPublicImageModelId('xais-chat', 'GPT Image 2')).toBe('Xais Img2_2K');
    expect(getCanvasAiPublicImageModelId('bigmodel', 'Nano Banana Pro')).toBe('gemini-3-pro-image-preview');
    expect(getCanvasAiPublicImageModelId('bigmodel', 'GPT Image 2')).toBe('gpt-image-2');
  });

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
  it('binds prompt image numbers to attachment order for multi-reference requests', () => {
    const prompt = buildCanvasAiIndexedReferencePrompt('使用图1的脸和图2的服装', 2);

    expect(prompt).toContain('第1个附件 = 图1（Image 1）');
    expect(prompt).toContain('第2个附件 = 图2（Image 2）');
    expect(prompt).toContain('不要交换、重排');
  });

  it('does not add numbering instructions to a single-reference request', () => {
    expect(buildCanvasAiIndexedReferencePrompt('保留参考图主体', 1)).toBe('保留参考图主体');
  });

  it('restores attachment order after local and remote references finish in different groups', () => {
    expect(orderCanvasAiReferenceSources(2, [
      [1, 'https://example.com/image-2.webp'],
      [0, 'https://oss.example.com/image-1.png'],
    ])).toEqual([
      'https://oss.example.com/image-1.png',
      'https://example.com/image-2.webp',
    ]);
  });

  it('keeps duplicate sources in separate numbered attachment slots', () => {
    expect(orderCanvasAiReferenceSources(2, [
      [0, 'https://example.com/shared.png'],
      [1, 'https://example.com/shared.png'],
    ])).toEqual([
      'https://example.com/shared.png',
      'https://example.com/shared.png',
    ]);
  });

  it('puts Nano Banana Pro before GPT Image 2 in the unified picker', () => {
    expect(getCanvasAiPublicImageModelPriority('xais-chat', 'Xais Nano Pro_2K'))
      .toBeLessThan(getCanvasAiPublicImageModelPriority('new-api', 'gpt-image-2'));
  });

  it('uses separate concurrent requests when more than one output is requested', () => {
    expect(shouldUseCanvasAiNativeImageBatchRequest('new-api', false, 1)).toBe(true);
    expect(shouldUseCanvasAiNativeImageBatchRequest('new-api', false, 2)).toBe(false);
    expect(shouldUseCanvasAiNativeImageBatchRequest('xais-chat', true, 2)).toBe(false);
    expect(getCanvasAiSlotClientRequestId('request-1', 0, 2)).toBe('request-1:slot:1');
    expect(getCanvasAiSlotClientRequestId('request-1', 1, 2)).toBe('request-1:slot:2');
    expect(getCanvasAiSlotClientRequestId('request-1', 0, 1)).toBe('request-1');
  });

  it('uses the runtime provider when an old node retains a different provider', () => {
    expect(resolveCanvasAiReferenceProvider('xais-chat', 'new-api', 'openai-compatible'))
      .toBe('xais-chat');
    expect(resolveCanvasAiReferenceProvider(undefined, 'new-api', 'openai-compatible'))
      .toBe('new-api');
  });

  it('rebuilds stale wallet model and channel pairs from the latest channel snapshot', () => {
    const refreshed = reconcileWalletImageCandidates([
      {
        source: 'wallet',
        provider: 'xais-chat',
        model: 'Xais Nano Pro_2K',
        providerChannelId: 'old-priority',
      },
      {
        source: 'wallet',
        provider: 'new-api',
        model: 'gemini-3-pro-image',
        providerChannelId: 'new-priority',
      },
    ], [
      {
        id: 'new-priority',
        provider: 'XAIS',
        models: ['Xais Nano Pro_4K'],
      },
      {
        id: 'old-priority',
        provider: 'NEW_API',
        models: ['gemini-3-pro-image'],
      },
    ]);

    expect(refreshed).toEqual([
      {
        source: 'wallet',
        provider: 'xais-chat',
        model: 'Xais Nano Pro_4K',
        providerChannelId: 'new-priority',
      },
      {
        source: 'wallet',
        provider: 'new-api',
        model: 'gemini-3-pro-image',
        providerChannelId: 'old-priority',
      },
    ]);
  });

  it('keeps current canvas references missing from a runtime snapshot', () => {
    const currentItems = [
      { id: 'reference', value: 'current reference' },
      { id: 'target', value: 'old target' },
    ];
    const runtimeItems = [
      { id: 'target', value: 'runtime target' },
    ];

    expect(mergeCanvasAiReferenceSourceItems(currentItems, runtimeItems)).toEqual([
      { id: 'reference', value: 'current reference' },
      { id: 'target', value: 'runtime target' },
    ]);
  });

  it('re-prepares reference images for each provider candidate', async () => {
    const candidate = {
      source: 'local' as const,
      provider: 'xais-chat' as const,
      model: 'Xais Nano Pro_2K',
    };
    let preparedFor = '';

    const images = await resolveCanvasAiCandidateInputImages(
      ['data:image/png;base64,old-provider-format'],
      candidate,
      async current => {
        preparedFor = current.provider;
        return ['xais-uploaded-reference.jpg'];
      },
    );

    expect(preparedFor).toBe('xais-chat');
    expect(images).toEqual(['xais-uploaded-reference.jpg']);
  });

  it('uses portable OSS references for every wallet image request', () => {
    expect(shouldUsePortableWalletImageReferences(true, 'image', 'xais-chat')).toBe(true);
    expect(shouldUsePortableWalletImageReferences(true, 'image', 'new-api')).toBe(true);
    expect(shouldUsePortableWalletImageReferences(true, 'image', 'openai-compatible')).toBe(true);
    expect(shouldUsePortableWalletImageReferences(false, 'image', 'xais-chat')).toBe(false);
    expect(shouldUsePortableWalletImageReferences(true, 'video', 'xais-chat')).toBe(false);
  });

  it('relaxes the legacy XAIS URL length limit only for wallet-side attachment uploads', () => {
    expect(getCanvasAiReferencePublicationMaxUrlLength(true, 'xais-chat')).toBe(512);
    expect(getCanvasAiReferencePublicationMaxUrlLength(true, 'new-api')).toBe(64);
    expect(getCanvasAiReferencePublicationMaxUrlLength(false, 'xais-chat')).toBe(64);
  });

  it('merges XAIS resolution variants into the public model families', () => {
    expect(getXaisImageModelDisplayName('Xais Nano Pro_2K')).toBe('Nano Banana Pro');
    expect(getXaisImageModelDisplayName('Nano_Banana_Pro_4K_0')).toBe('Nano Banana Pro');
    expect(getXaisImageModelDisplayName('Xais Nano2_4K')).toBe('Nano Banana 2');
    expect(getXaisImageModelDisplayName('Xais img2_1k')).not.toBe('GPT Image 2');
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

  it('allows transparent PNG only for Image2 models', () => {
    expect(supportsCanvasAiTransparentPng('new-api', 'gpt-image-2')).toBe(true);
    expect(supportsCanvasAiTransparentPng('xais-chat', 'Xais Img2_2K')).toBe(true);
    expect(supportsCanvasAiTransparentPng('new-api', 'gemini-3-pro-image')).toBe(false);
    expect(normalizeCanvasAiOutputFormat('new-api', 'gemini-3-pro-image', 'png')).toBe('jpg');
    expect(normalizeCanvasAiOutputFormat('new-api', 'gpt-image-2', 'png')).toBe('png');
  });

  it('exposes the expected clarity choices for each unified family', () => {
    expect(getCanvasAiImageResolutionValues('xais-chat', 'Xais Nano Pro_2K')).toEqual(['2k', '4k']);
    expect(getCanvasAiImageResolutionValues('xais-chat', 'Xais Nano2_4K')).toEqual(['2k', '4k']);
    expect(getCanvasAiImageResolutionValues('xais-chat', 'Xais img2_1k')).toEqual([]);
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

  it('preserves Mikoto wallet channels when refreshing candidate routes', () => {
    const candidates = [{
      source: 'wallet' as const,
      provider: 'mikoto' as const,
      providerChannelId: 'mikoto-image2',
      model: 'gpt-image-2',
    }];
    expect(reconcileWalletImageCandidates(candidates, [{
      id: 'mikoto-image2',
      provider: 'MIKOTO',
      models: ['gpt-image-2'],
    }])).toEqual(candidates);
  });

  it('keeps Mikoto native Gemini Banana models visible to the canvas', () => {
    const candidates = [{
      source: 'wallet' as const,
      provider: 'mikoto' as const,
      providerChannelId: 'mikoto-banana',
      model: 'gemini-3-pro-image-preview',
    }];
    expect(reconcileWalletImageCandidates(candidates, [{
      id: 'mikoto-banana',
      provider: 'MIKOTO',
      models: ['gemini-3-pro-image-preview'],
    }])).toEqual(candidates);
  });

  it('preserves Bigmodel Gemini wallet channels when refreshing candidate routes', () => {
    const candidates = [{
      source: 'wallet' as const,
      provider: 'bigmodel' as const,
      providerChannelId: 'bigmodel-banana-pro',
      model: 'gemini-3-pro-image-preview',
    }];
    expect(reconcileWalletImageCandidates(candidates, [{
      id: 'bigmodel-banana-pro',
      provider: 'BIGMODEL',
      models: ['gemini-3-pro-image-preview'],
    }])).toEqual(candidates);
  });

  it('keeps Bigmodel Banana Pro and Image2 models on the same wallet channel', () => {
    const candidates = [
      {
        source: 'wallet' as const,
        provider: 'bigmodel' as const,
        providerChannelId: 'bigmodel-main',
        model: 'gemini-3-pro-image-preview',
      },
      {
        source: 'wallet' as const,
        provider: 'bigmodel' as const,
        providerChannelId: 'bigmodel-main',
        model: 'gpt-image-2',
      },
    ];
    expect(reconcileWalletImageCandidates(candidates, [{
      id: 'bigmodel-main',
      provider: 'BIGMODEL',
      models: ['gemini-3-pro-image-preview', 'gpt-image-2'],
      capabilities: ['IMAGE', 'IMAGE_NANO_BANANA_PRO'],
    }])).toEqual(candidates.map(candidate => ({
      ...candidate,
      capabilities: ['IMAGE', 'IMAGE_NANO_BANANA_PRO'],
    })));
  });

  it('skips Image2 channels that only advertise the 1K capability for higher resolutions', () => {
    const candidates = [
      {
        source: 'wallet' as const,
        provider: 'mikoto' as const,
        providerChannelId: 'mikoto-1k',
        model: 'gpt-image-2',
        capabilities: ['IMAGE_GPT_1K'],
      },
      {
        source: 'wallet' as const,
        provider: 'new-api' as const,
        providerChannelId: 'new-api-full',
        model: 'gpt-image-2',
        capabilities: ['IMAGE_GPT'],
      },
    ];
    expect(selectCanvasAiImageCandidatesForResolution(candidates, '1k'))
      .toHaveLength(2);
    expect(selectCanvasAiImageCandidatesForResolution(candidates, '4k'))
      .toEqual([expect.objectContaining({ providerChannelId: 'new-api-full' })]);
  });

  it('routes Banana Pro 1K channels independently from full-resolution channels', () => {
    const candidates = [
      {
        source: 'wallet' as const,
        provider: 'bigmodel' as const,
        providerChannelId: 'bigmodel-1k',
        model: 'gemini-3-pro-image-preview',
        capabilities: ['IMAGE_NANO_BANANA_PRO_1K'],
      },
      {
        source: 'wallet' as const,
        provider: 'new-api' as const,
        providerChannelId: 'new-api-full',
        model: 'gemini-3-pro-image',
        capabilities: ['IMAGE_NANO_BANANA_PRO'],
      },
    ];
    expect(selectCanvasAiImageCandidatesForResolution(candidates, '1k'))
      .toEqual([expect.objectContaining({ providerChannelId: 'bigmodel-1k' })]);
    expect(selectCanvasAiImageCandidatesForResolution(candidates, '4k'))
      .toEqual([expect.objectContaining({ providerChannelId: 'new-api-full' })]);
    expect(getCanvasAiImageResolutionValuesForCandidates(candidates)).toEqual(['1k', '2k', '4k']);
    expect(normalizeCanvasAiImageResolutionForCandidates(candidates, '4k')).toBe('4k');
  });

  it('rehydrates dedicated 1K capabilities for legacy node candidates', () => {
    const candidates = [{
      source: 'wallet' as const,
      provider: 'bigmodel' as const,
      providerChannelId: 'banana-1k',
      model: 'gemini-3-pro-image-preview',
    }];
    const hydrated = hydrateCanvasAiModelCandidateCapabilities(candidates, [{
      id: 'banana-1k',
      capabilities: ['IMAGE_NANO_BANANA_PRO_1K'],
    }]);
    expect(getCanvasAiImageResolutionValuesForCandidates(hydrated)).toEqual(['1k']);
    expect(normalizeCanvasAiImageResolutionForCandidates(hydrated, '4k')).toBe('1k');
  });

  it('only fails over after an explicit rejection', () => {
    expect(shouldTryNextCanvasAiImageCandidate(new Error('status_code=400, invalid reference image'))).toBe(true);
    expect(shouldTryNextCanvasAiImageCandidate(new Error('HTTP 402: insufficient_credits'))).toBe(true);
    expect(shouldTryNextCanvasAiImageCandidate(new Error('provider_unavailable'))).toBe(true);
    expect(shouldTryNextCanvasAiImageCandidate(new Error('provider_model_family_mismatch: selected model does not match channel family'))).toBe(true);
    expect(shouldTryNextCanvasAiImageCandidate(new Error('上游算力紧张，请稍后再试'))).toBe(true);
    expect(shouldTryNextCanvasAiImageCandidate(new Error('service overloaded: no available worker'))).toBe(true);
    expect(shouldTryNextCanvasAiImageCandidate(new Error('status_code=500, operation copy failed: source path does not exist'))).toBe(true);
    expect(shouldTryNextCanvasAiImageCandidate(new Error('status_code=500, Provided image is not valid'))).toBe(true);
    expect(shouldTryNextCanvasAiImageCandidate(new Error('status_code=500, internal server error'))).toBe(true);
    expect(shouldTryNextCanvasAiImageCandidate(new Error('HTTP 502: upstream provider failed'))).toBe(true);
    expect(shouldTryNextCanvasAiImageCandidate(new Error('channel returned no image data'))).toBe(false);
    expect(shouldTryNextCanvasAiImageCandidate(new Error('request timed out after upstream accepted it'))).toBe(false);
  });

  it('retries a temporarily busy preferred channel before falling back', () => {
    expect(shouldRetrySameCanvasAiImageCandidate(new Error('HTTP 429: rate limit exceeded'))).toBe(true);
    expect(shouldRetrySameCanvasAiImageCandidate(new Error('status_code=503, service unavailable'))).toBe(true);
    expect(shouldRetrySameCanvasAiImageCandidate(new Error('上游算力紧张，请稍后再试'))).toBe(true);
    expect(shouldRetrySameCanvasAiImageCandidate(new Error('HTTP 402: insufficient credits'))).toBe(false);
    expect(shouldRetrySameCanvasAiImageCandidate(new Error('request timed out after upstream accepted it'))).toBe(false);
  });

  it('routes GPT Image 2 and GPT Image 2 H to their matching XAIS clarity variants', () => {
    const standard = [
      { source: 'wallet' as const, provider: 'xais-chat' as const, providerChannelId: 'xais', model: 'Xais Img2_2K' },
      { source: 'wallet' as const, provider: 'xais-chat' as const, providerChannelId: 'xais', model: 'Xais Img2_4K' },
      { source: 'wallet' as const, provider: 'new-api' as const, providerChannelId: 'newapi', model: 'gpt-image-2' },
    ];
    expect(selectCanvasAiImageCandidatesForResolution(standard, '1k'))
      .toContainEqual(expect.objectContaining({ provider: 'new-api', model: 'gpt-image-2' }));
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

describe('cloud wallet image recovery', () => {
  it('only treats a terminal lookup with usable image URLs as success', () => {
    expect(getCloudWalletImageLookupImages({
      status: 'processing',
      images: ['https://example.com/pending.png'],
    })).toEqual([]);
    expect(getCloudWalletImageLookupImages({
      status: 'succeeded',
      images: [' https://example.com/result.png ', 'https://example.com/result.png', ''],
    })).toEqual(['https://example.com/result.png']);
    expect(getCloudWalletImageLookupImages({
      status: 'failed',
      images: ['https://example.com/failed.png'],
    })).toEqual(['https://example.com/failed.png']);
    expect(getCloudWalletImageLookupImages({
      status: 'processing',
      images: ['https://example.com/partial.png'],
    })).toEqual([]);
  });
});

describe('image resolution routing', () => {
  it('enables 2K/4K for NewAPI Gemini image families and GPT Image 2', () => {
    expect(supportsCanvasAiImageResolution('new-api', 'gemini-3-pro-image')).toBe(true);
    expect(supportsCanvasAiImageResolution('new-api', 'gemini-3.1-flash-image')).toBe(true);
    expect(supportsCanvasAiImageResolution('new-api', 'gpt-image-2')).toBe(true);
    expect(supportsCanvasAiImageResolution('custom', 'gpt_image_2_guan')).toBe(true);
    expect(supportsCanvasAiImageResolution('openai-compatible', 'gptimage2')).toBe(true);
    expect(getCanvasAiImageModelFamily('bigmodel', 'gemini-3-pro-image-preview')).toBe('nano-banana-pro');
    expect(getCanvasAiImageModelFamily('mikoto', 'gemini-3-pro-image-preview')).toBe('nano-banana-pro');
    expect(getCanvasAiImageModelFamily('mikoto', 'gemini-3.1-flash-image-preview')).toBe('nano-banana-2');
    expect(getCanvasAiImageModelFamily('bigmodel', 'gpt-image-2')).toBe('gpt-image-2');
    expect(getCanvasAiImageModelFamily('bigmodel', 'gpt_image_2')).toBe('gpt-image-2');
  });

  it('enables clarity routing for XAIS families and leaves unrelated models unchanged', () => {
    expect(supportsCanvasAiImageResolution('xais-chat', 'Xais Nano Pro_2K')).toBe(true);
    expect(supportsCanvasAiImageResolution('xais-chat', 'Xais img2_1k')).toBe(false);
    expect(supportsCanvasAiImageResolution('xais-chat', 'gpt-image-2')).toBe(true);
    expect(supportsCanvasAiImageResolution('new-api', 'gpt-image-1')).toBe(false);
    expect(supportsCanvasAiImageResolution('new-api', 'gemini-lite-image')).toBe(false);
    expect(supportsCanvasAiImageResolution('mikoto', 'gpt-image-2', ['IMAGE_GPT_1K'])).toBe(true);
    expect(getCanvasAiImageResolutionValues('mikoto', 'gpt-image-2', ['IMAGE_GPT_1K'])).toEqual(['1k']);
    expect(normalizeCanvasAiImageResolutionForModel('mikoto', 'gpt-image-2', '4k', ['IMAGE_GPT_1K'])).toBe('1k');
  });

  it('uses Mikoto-specific Kling duration choices', () => {
    expect(getMikotoVideoDurationValues('kling-video')).toEqual([5, 10, 15]);
    expect(normalizeMikotoVideoDuration('kling-video', 4)).toBe(5);
    expect(normalizeMikotoVideoDuration('seedance2', 4)).toBe(4);
  });

  it('exposes Banana Pro 1K only when the dedicated channel capability is present', () => {
    const model = 'gemini-3-pro-image-preview';
    expect(getCanvasAiImageResolutionValues('bigmodel', model, ['IMAGE_NANO_BANANA_PRO_1K']))
      .toEqual(['1k']);
    expect(normalizeCanvasAiImageResolutionForModel(
      'bigmodel', model, '4k', ['IMAGE_NANO_BANANA_PRO_1K'],
    )).toBe('1k');
    expect(getCanvasAiImageResolutionValues(
      'bigmodel', model, ['IMAGE_NANO_BANANA_PRO_1K', 'IMAGE_NANO_BANANA_PRO'],
    )).toEqual(['1k', '2k', '4k']);
    expect(getCanvasAiImageResolutionValues('bigmodel', model, ['IMAGE_NANO_BANANA_PRO']))
      .toEqual(['2k', '4k']);
  });

  it('normalizes resolution casing and calculates GPT Image 2 sizes', () => {
    expect(normalizeCanvasAiImageResolution('1K')).toBe('1k');
    expect(normalizeCanvasAiImageResolution('4K')).toBe('4k');
    expect(normalizeCanvasAiImageResolution(undefined)).toBe('2k');
    expect(gptImage2SizeFromAspectRatio('16:9', '1K')).toBe('1280x720');
    expect(gptImage2SizeFromAspectRatio('16:9', '2K')).toBe('2048x1152');
    expect(gptImage2SizeFromAspectRatio('3:4', '4K')).toBe('2400x3200');
    expect(gptImage2SizeFromAspectRatio('2064x1376', '2K')).toBe('2064x1376');
    expect(gptImage2SizeFromAspectRatio('3520x2352', '4K')).toBe('3520x2352');
  });

  it('converts GPT Image 2 dimension options into wallet aspect ratios', () => {
    expect(normalizeCloudWalletImageAspectRatio('2048x1152')).toBe('16:9');
    expect(normalizeCloudWalletImageAspectRatio('1152×2048')).toBe('9:16');
    expect(normalizeCloudWalletImageAspectRatio('2048x2048')).toBe('1:1');
    expect(normalizeCloudWalletImageAspectRatio('1536x2048')).toBe('3:4');
    expect(normalizeCloudWalletImageAspectRatio('2048x1536')).toBe('4:3');
  });

  it('adds size and quality for mapped NewAPI models', () => {
    expect(newApiImageRequestParams('gemini-3-pro-image', 2, '16:9', '2K')).toEqual({
      n: 2,
      aspect_ratio: '16:9',
      output_resolution: '2K',
      image_size: '2K',
    });
    expect(newApiImageRequestParams('gemini-3.1-flash-image-preview', 1, '3:4', '4K')).toEqual({
      n: 1,
      aspect_ratio: '3:4',
      output_resolution: '4K',
      image_size: '4K',
    });
    expect(newApiImageRequestParams('gpt_image_2', 1, '9:16', '4k')).toEqual({
      n: 1,
      size: '2160x3840',
      aspect_ratio: '9:16',
      quality: 'medium',
    });
    expect(newApiImageRequestParams('gpt-image-2', 1, '1:1', '2K', 'png')).toEqual({
      n: 1,
      size: '2048x2048',
      aspect_ratio: '1:1',
      quality: 'medium',
      output_format: 'png',
      background: 'transparent',
    });
    expect(newApiImageRequestParams('gpt-image-2', 1, '3520x2352', '4K')).toEqual({
      n: 1,
      size: '3520x2352',
      quality: 'medium',
    });
  });

  it('keeps legacy NewAPI image request parameters unchanged', () => {
    expect(newApiImageRequestParams('gpt-image-1', 1, '16:9', '4K')).toEqual({
      n: 1,
      size: '1792x1024',
      aspect_ratio: '16:9',
    });
  });

  it('keeps Nano Banana Lite at the normal 1K path without quality controls', () => {
    expect(newApiImageRequestParams('models/gemini_3_flash_image_lite', 1, '16:9', '4K')).toEqual({
      n: 1,
      size: '1792x1024',
      aspect_ratio: '16:9',
    });
  });
});

describe('NewAPI image protocol errors', () => {
  it('prefers URL responses so large 2K/4K payloads can cache in the background', () => {
    expect(NEW_API_IMAGE_RESPONSE_FORMAT).toBe('url');
  });

  it('keeps every image task timeout aligned at fifteen minutes', () => {
    expect(CANVAS_AI_IMAGE_TASK_TIMEOUT_MINUTES).toBe(15);
    expect(CANVAS_AI_IMAGE_TASK_TIMEOUT_MS).toBe(15 * 60 * 1000);
    expect(NEW_API_IMAGE_REQUEST_TIMEOUT_SECS).toBe(15 * 60);
    expect(NEW_API_IMAGE_TASK_MAX_WAIT_MS).toBe(15 * 60 * 1000);
  });

  it('routes NewAPI text-to-image and image edits through the current image endpoints', () => {
    expect(getDefaultNewApiImageProtocol('gemini-3.1-flash-image', true)).toBe('images_edits');
    expect(getDefaultNewApiImageProtocol('gpt-image-2', true)).toBe('images_edits');
    expect(getDefaultNewApiImageProtocol('gpt-image-2', false)).toBe('images_generations');
    expect(getDefaultNewApiImageProtocol('custom-image-model', false)).toBe('images_generations');
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
  it('uses a bounded total timeout for image and video generator nodes', () => {
    expect(CANVAS_AI_VIDEO_TASK_TIMEOUT_MINUTES).toBe(30);
    expect(CANVAS_AI_VIDEO_TASK_TIMEOUT_MS).toBe(30 * 60 * 1000);
  });

  it('recognizes nested terminal failure states from provider status payloads', () => {
    expect(getNewApiVideoTaskState({
      status: 'processing',
      payload: { job: { taskStatus: 'FAILED', errorMessage: 'upstream rejected' } },
    })).toBe('failed');
    expect(isNewApiVideoFailureState('task_failed')).toBe(true);
    expect(isNewApiVideoFailureState('timed-out')).toBe(true);
    expect(formatNewApiVideoFailureMessage('upstream model overloaded')).toBe('upstream model overloaded');
  });

  it('limits Mikoto Seedance resolutions by the public model family', () => {
    expect(getMikotoVideoResolutionValues('seedance2')).toEqual(['720p', '1080p']);
    expect(getMikotoVideoResolutionValues('seedance2fast')).toEqual(['480p', '720p']);
    expect(normalizeMikotoVideoResolution('seedance2fast', '1080p')).toBe('480p');
    expect(normalizeMikotoVideoResolution('seedance2', '480p')).toBe('720p');
  });

  it('exposes one fixed video model list and resolves its underlying provider', () => {
    expect(NEW_API_VIDEO_MODEL_DEFAULT).toBe('veo-3.1');
    expect(CANVAS_AI_VIDEO_MODEL_OPTIONS.map(option => option.value)).toEqual([
      'seedance2',
      'seedance2fast',
      'sora-2',
      'veo-3.1',
      'veo-3.1-fast',
      'kling-video',
      'kling-omni-video',
    ]);
    expect(getCanvasAiVideoProviderForModel('seedance2')).toBe('xais-chat');
    expect(getCanvasAiVideoProviderForModel('seedance2.0')).toBe('xais-chat');
    expect(getCanvasAiVideoModelOptionValue('seedance2.0')).toBe('seedance2');
    expect(isSeedance20VideoModel('seedance2.0')).toBe(true);
    expect(isSeedance20VideoModel('SourceMix2.0-fast')).toBe(true);
    expect(getCanvasAiVideoProviderForModel(NEW_API_SEEDANCE_2_MODEL)).toBe('new-api');
    expect(getCanvasAiVideoProviderForModel(NEW_API_SEEDANCE_2_FAST_MODEL)).toBe('new-api');
    expect(getCanvasAiVideoProviderForModel('veo-3.1-fast')).toBe('new-api');
    expect(getCanvasAiVideoModelOptionValue('seedance2')).toBe('seedance2');
    expect(getCanvasAiVideoModelCandidates('seedance2', 'wallet')).toEqual([
      { source: 'wallet', provider: 'new-api', model: 'SourceMix2.0' },
      { source: 'wallet', provider: 'xais-chat', model: 'seedance2' },
    ]);
    expect(getCanvasAiVideoModelCandidates('seedance2', 'wallet', 'mikoto')).toEqual([
      { source: 'wallet', provider: 'mikoto', model: 'seedance2' },
    ]);
    expect(getCanvasAiVideoModelCandidates('seedance2', 'wallet', 'mikoto', [
      { id: 'mikoto-sd2', provider: 'MIKOTO', capabilities: ['VIDEO'] },
      { id: 'source-mix', provider: 'NEW_API', capabilities: ['VIDEO'] },
    ])).toEqual([
      {
        source: 'wallet', provider: 'mikoto', model: 'seedance2',
        providerChannelId: 'mikoto-sd2', capabilities: ['VIDEO'],
      },
      {
        source: 'wallet', provider: 'new-api', model: 'SourceMix2.0',
        providerChannelId: 'source-mix', capabilities: ['VIDEO'],
      },
    ]);
  });

  it('adapts the reference UI slots to each video model', () => {
    expect(getCanvasAiVideoReferenceSlots('sora-2', 'FLF')).toEqual({
      mode: 'REF', imageSlots: 1, videoSlots: 0, audioSlots: 0,
    });
    expect(getCanvasAiVideoReferenceSlots('veo-3.1', 'REF')).toEqual({
      mode: 'REF', imageSlots: 3, videoSlots: 0, audioSlots: 0,
    });
    expect(getCanvasAiVideoReferenceSlots('veo-3.1-fast', 'FLF')).toEqual({
      mode: 'FLF', imageSlots: 2, videoSlots: 0, audioSlots: 0,
    });
    expect(getCanvasAiVideoReferenceSlots('seedance2', 'REF')).toEqual({
      mode: 'REF', imageSlots: 9, videoSlots: 3, audioSlots: 3,
    });
    expect(getCanvasAiVideoReferenceSlots('seedance2fast', 'FLF')).toEqual({
      mode: 'FLF', imageSlots: 2, videoSlots: 0, audioSlots: 0,
    });
    expect(getCanvasAiVideoReferenceSlots(NEW_API_SEEDANCE_2_MODEL, 'REF')).toEqual({
      mode: 'REF', imageSlots: 9, videoSlots: 3, audioSlots: 3,
    });
    expect(getCanvasAiVideoReferenceSlots('kling-video', 'REF', 'mikoto')).toEqual({
      mode: 'REF', imageSlots: 2, videoSlots: 0, audioSlots: 0,
    });
    expect(getCanvasAiVideoReferenceSlots('kling-omni-video', 'REF', 'mikoto')).toEqual({
      mode: 'REF', imageSlots: 3, videoSlots: 0, audioSlots: 0,
    });
    expect(getCanvasAiVideoReferenceSlotLabels(NEW_API_SEEDANCE_2_MODEL, 'REF')).toHaveLength(9);
    expect(getCanvasAiVideoReferenceSlotLabels('veo-3.1', 'REF')).toEqual([
      '主体', '场景/背景', '风格/纹理',
    ]);
    const oneReferencePrompt = buildNewApiVideoPrompt('veo-3.1', '产品环绕镜头', 'REF', 1);
    expect(oneReferencePrompt).toContain('参考图1为主体参考');
    expect(oneReferencePrompt).not.toContain('参考图2为场景/背景参考');
    expect(buildNewApiVideoPrompt('veo-3.1', '产品环绕镜头', 'FLF', 2)).toBe('产品环绕镜头');
  });

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
    expect(normalizeNewApiBaseEndpoint('https://api.example.com/v1/videos/task-123'))
      .toBe('https://api.example.com/v1');
  });

  it('applies the Sora 2 and Veo 3.1 model constraints', () => {
    expect(getNewApiVideoResolutionValues('sora-2')).toEqual(['720p']);
    expect(getNewApiVideoResolutionValues('veo-3.1')).toEqual(['720p', '1080p']);
    expect(getNewApiVideoResolutionValues('SourceMix2.0-fast')).toEqual(['480p', '720p']);
    expect(getNewApiVideoDurationValues('sora-2')).toEqual([8, 12]);
    expect(getNewApiVideoDurationValues('veo-3.1-fast')).toEqual([4, 5, 6, 7, 8]);
    expect(getNewApiVideoDurationValues('SourceMix2.0')).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(normalizeSeedanceVideoAspectRatio('3:4')).toBe('3:4');
    expect(normalizeSeedanceVideoAspectRatio('2:1')).toBe('16:9');
    expect(normalizeNewApiVideoDurationForModel('sora-2', 10)).toBe(8);
    expect(getNewApiVideoReferenceLimit('sora-2')).toBe(1);
    expect(getNewApiVideoReferenceLimit('veo-3.1')).toBe(3);
    expect(validateCanvasAiVideoReferences('veo-3.1-fast', 'FLF', 1)).toContain('首帧和尾帧');
    expect(validateCanvasAiVideoReferences('veo-3.1-fast', 'FLF', 2)).toBe('');
    expect(validateCanvasAiVideoReferences('veo-3.1-fast', 'REF', 1)).toBe('');
  });

  it('builds the /v1/videos payload for Veo with up to three ingredient references', () => {
    expect(getNewApiVideoDimensions('16:9', '1080p')).toEqual({ width: 1920, height: 1080 });
    expect(newApiVideoRequestParams({
      model: 'veo-3.1-fast',
      prompt: 'Camera moves around the product',
      inputImages: [
        'https://example.com/person.png',
        'https://example.com/scene.png',
        'https://example.com/style.png',
        'https://example.com/ignored.png',
      ],
      aspectRatio: '16:9',
      resolution: '1080p',
      duration: 8,
      inputMode: 'REF',
      count: 1,
    })).toEqual({
      model: 'veo-3.1-fast',
      prompt: [
        'Camera moves around the product',
        '',
        '参考图用途（请按编号分别使用，不要混淆）：',
        '参考图1为主体参考：保持主体（人物、角色或产品等）的外观、结构、颜色和关键识别特征一致。',
        '参考图2为场景/背景参考：保持环境、空间关系、构图和光线氛围。',
        '参考图3为风格/纹理参考：保持材质、色彩、质感和整体视觉风格。',
      ].join('\n'),
      duration: 8,
      size: '1920x1080',
      images: [
        'https://example.com/person.png',
        'https://example.com/scene.png',
        'https://example.com/style.png',
      ],
    });
  });

  it('uses the Veo request shape for NewAPI Seedance 2 models', () => {
    expect(newApiVideoRequestParams({
      model: NEW_API_SEEDANCE_2_MODEL,
      prompt: 'Orbit around the product',
      inputImages: [
        'https://example.com/product.png',
        'https://example.com/scene.png',
        'https://example.com/style.png',
        'https://example.com/ignored.png',
      ],
      aspectRatio: '9:16',
      resolution: '1080p',
      duration: 6,
      inputMode: 'REF',
    })).toEqual({
      model: 'SourceMix2.0',
      prompt: 'Orbit around the product',
      duration: 6,
      size: '1080x1920',
      images: [
        'https://example.com/product.png',
        'https://example.com/scene.png',
        'https://example.com/style.png',
        'https://example.com/ignored.png',
      ],
      ref: [
        'https://example.com/product.png',
        'https://example.com/scene.png',
        'https://example.com/style.png',
        'https://example.com/ignored.png',
      ],
    });
  });

  it('keeps Seedance omni references in their dedicated categories', () => {
    const request = newApiVideoRequestParams({
      model: NEW_API_SEEDANCE_2_FAST_MODEL,
      prompt: 'Use every reference',
      inputImages: Array.from({ length: 10 }, (_, index) => `https://example.com/image-${index}.png`),
      inputVideos: Array.from({ length: 4 }, (_, index) => `https://example.com/video-${index}.mp4`),
      inputAudios: Array.from({ length: 4 }, (_, index) => `https://example.com/audio-${index}.mp3`),
      inputMode: 'REF',
    });
    expect(request.images).toHaveLength(9);
    expect(request.videos).toHaveLength(3);
    expect(request.audios).toHaveLength(3);
    expect(request.ref).toHaveLength(15);
  });

  it('limits Sora 2 to one reference image and 720p', () => {
    expect(newApiVideoRequestParams({
      model: 'sora-2',
      prompt: 'Slow push in',
      inputImages: ['https://example.com/start.png', 'https://example.com/ignored.png'],
      aspectRatio: '9:16',
      resolution: '1080p',
      duration: 12,
    })).toEqual({
      model: 'sora-2',
      prompt: 'Slow push in',
      duration: 12,
      size: '720x1280',
      images: ['https://example.com/start.png'],
    });
  });
});
