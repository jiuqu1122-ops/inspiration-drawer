import { describe, expect, it } from 'vitest';
import { applyChatImageGenerationSettings, CHAT_AUTO_IMAGE_SETTING } from './chatImageGenerationSettings';

describe('applyChatImageGenerationSettings', () => {
  it('uses manually selected settings but keeps explicit per-request overrides', () => {
    expect(applyChatImageGenerationSettings(
      { prompt: 'A landscape', aspectRatio: '1:1' },
      { imageModel: 'model-a', imageAspectRatio: '16:9', imageResolution: '4k', imageQuality: 'high' },
    )).toEqual({ prompt: 'A landscape', model: 'model-a', aspectRatio: '1:1', resolution: '4k', quality: 'high' });
  });

  it('selects a capable model, wide ratio and high resolution for slide layout art', () => {
    expect(applyChatImageGenerationSettings(
      { prompt: '为演示文稿制作一张横版产品概念排版图，包含清晰文字和细节' },
      {
        imageModel: CHAT_AUTO_IMAGE_SETTING, imageAspectRatio: CHAT_AUTO_IMAGE_SETTING, imageResolution: CHAT_AUTO_IMAGE_SETTING,
        imageModelOptions: [
          { value: 'fast-model', label: '快速模型', aspectRatios: ['1:1'], resolutions: ['1k'] },
          { value: 'pro-model', label: '专业高清模型', aspectRatios: ['16:9'], resolutions: ['2k', '4k'] },
        ],
        imageAspectRatioOptions: ['1:1', '16:9'], imageResolutionOptions: ['1k', '2k', '4k'],
      },
    )).toMatchObject({ model: 'pro-model', aspectRatio: '16:9', resolution: '4k' });
  });

  it('maps an explicit display label to the provider value', () => {
    expect(applyChatImageGenerationSettings(
      { prompt: 'image', model: '专业高清模型' },
      { imageModelOptions: [{ value: 'provider-model-choice', label: '专业高清模型' }] },
    )).toMatchObject({ model: 'provider-model-choice' });
  });

  it('omits automatic settings when there is no supported model metadata', () => {
    expect(applyChatImageGenerationSettings(
      { prompt: 'image' },
      { imageModel: CHAT_AUTO_IMAGE_SETTING, imageAspectRatio: CHAT_AUTO_IMAGE_SETTING, imageResolution: CHAT_AUTO_IMAGE_SETTING },
    )).toEqual({ prompt: 'image' });
  });

  it('keeps Mask off by default and requires an explicit capable model when enabled', () => {
    expect(applyChatImageGenerationSettings(
      { prompt: 'edit', maskImage: 'C:/mask.png' },
      { imageModel: 'model-a' },
    )).not.toHaveProperty('maskImage');
    expect(applyChatImageGenerationSettings(
      { prompt: 'edit', maskImage: 'C:/mask.png' },
      {
        imageModel: 'model-mask', imageMaskMode: 'on', imageMaskAttachmentId: 'mask-id',
        imageModelOptions: [{ value: 'model-mask', supportsMask: true }],
      },
    )).toMatchObject({ maskImage: 'C:/mask.png', maskAttachmentId: 'mask-id' });
  });

  it('rejects Mask mode when the selected model is not explicitly declared mask-capable', () => {
    expect(() => applyChatImageGenerationSettings(
      { prompt: 'edit' },
      { imageModel: 'model-a', imageMaskMode: 'on', imageMaskAttachmentId: 'mask-id', imageModelOptions: [{ value: 'model-a' }] },
    )).toThrow('未声明支持 Mask');
  });
});
