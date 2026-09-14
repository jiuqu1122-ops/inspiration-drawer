import { describe,expect,it } from 'vitest';
import type { ResolvedImageModelCapabilities } from '../aiModelCapabilities';
import { findCanvasImageModelChoice,resolveCanvasImageRequestSettings } from './canvasImageRequestSettings';

const image2Capabilities: ResolvedImageModelCapabilities = {
  source: 'server',
  resolutions: ['1K', '2K', '4K'],
  aspectRatios: ['1:1', '3:4', '4:3', '9:16', '16:9'],
  aspectRatiosByResolution: {
    '2k': ['2048x2048', '1536x2048', '2048x1536', '1152x2048', '2048x1152'],
    '4k': ['2880x2880', '2400x3200', '3200x2400', '2160x3840', '3840x2160'],
  },
  referenceImageLimit: 9,
  minReferenceImages: 0,
  outputFormats: ['jpg', 'png'],
  maxOutputs: 4,
  supportsReferenceImages: true,
  supportsTransparentBackground: true,
};

const resolve = (resolution: string, aspectRatio: string) => resolveCanvasImageRequestSettings({
  provider: 'new-api',
  model: 'gpt-image-2.5',
  resolution,
  aspectRatio,
  capabilities: image2Capabilities,
});

describe('canvas image request settings', () => {
  it('uses the latest visible 1K resolution and semantic ratio on first submit', () => {
    expect(resolve('1K', '16:9')).toEqual({ resolution: '1K', aspectRatio: '16:9' });
  });

  it('maps a saved semantic ratio to the correct Image2 exact dimensions', () => {
    expect(resolve('2K', '16:9')).toEqual({ resolution: '2K', aspectRatio: '2048x1152' });
    expect(resolve('4K', '16:9')).toEqual({ resolution: '4K', aspectRatio: '3840x2160' });
  });

  it('does not revive a stale 2K square dimension when an old node displays 1K 16:9', () => {
    expect(resolve('1K', '2048x2048')).toEqual({ resolution: '1K', aspectRatio: '16:9' });
  });
});

describe('canvas image model identity matching', () => {
  const banana = {
    source: 'wallet' as const,
    provider: 'new-api' as const,
    model: 'nano-banana-pro',
    providerCandidates: [{
      source: 'wallet' as const,
      provider: 'new-api' as const,
      model: 'gemini-3-pro-image',
      canonicalModelId: 'nano-banana-pro',
    }],
  };
  const image25 = {
    source: 'wallet' as const,
    provider: 'new-api' as const,
    model: 'gpt-image-medium',
    providerCandidates: [{
      source: 'wallet' as const,
      provider: 'new-api' as const,
      model: 'image2',
      canonicalModelId: 'gpt-image-medium',
    }],
  };

  it('keeps an explicit Image2.5 canonical identity', () => {
    expect(findCanvasImageModelChoice([banana, image25], {
      canonicalModelId: 'gpt-image-medium',
      provider: 'new-api',
      model: 'image2',
      publicModel: 'GPT Image 2.5',
    })).toBe(image25);
  });

  it('returns no match instead of falling back to Banana', () => {
    expect(findCanvasImageModelChoice([banana], {
      canonicalModelId: 'gpt-image-medium',
      provider: 'new-api',
      model: 'image2',
      publicModel: 'GPT Image 2.5',
    })).toBeUndefined();
  });
});
