import { beforeEach,describe,expect,it } from 'vitest';
import type { CloudImageModelsResult } from '../types/license';
import type { CanvasImageItem } from './canvasModel';
import {
  cacheSuccessfulAiCatalog,
  clearCachedAiCatalogForTests,
  findAiCatalogModel,
  getAiCatalogModels,
  getCachedAiCatalog,
  getDefaultAiCatalogModelId,
  getImageAspectRatioOptionsForResolution,
  mergeAiModelCapabilities,
  normalizeImageAspectRatioOption,
  reconcileStaleCanvasAiModels,
  resolveImageModelCapabilities,
  resolveVideoModelCapabilities,
} from './aiModelCapabilities';
import {
  filterCanvasAiVideoModelCandidates,
  getCanvasAiVideoModelCandidates,
  getCanvasAiVideoReferenceSlots,
  resolveCanvasAiImageModelCapabilities,
  resolveCanvasAiVideoModelCapabilities,
} from './canvasAiImage';

const catalogSnapshot = (): CloudImageModelsResult => ({
  provider: 'NEW_API',
  defaultImageModel: 'test-image-x',
  defaultVideoModel: 'test-video-x',
  models: ['route-image-v2'],
  catalog: [{
    id: 'test-image-x',
    displayName: 'Test Image X',
    modality: 'image',
    aliases: ['route-image-v2'],
    capabilities: {
      resolutions: ['2K', '4K'],
      maxReferenceImages: 7,
      supportedOutputFormats: ['jpg', 'png'],
      maxOutputs: 3,
    },
  }, {
    id: 'test-video-x',
    displayName: 'Test Video X',
    modality: 'video',
    aliases: ['route-video-v9'],
    capabilities: {
      resolutions: ['720p', '1080p'],
      durations: [5, 10],
      maxReferenceImages: 4,
      maxReferenceVideos: 2,
      maxReferenceAudios: 1,
      supportsFirstLastFrame: true,
      supportedInputModes: ['reference', 'first_last_frame'],
    },
  }],
  channels: [{
    id: 'image-route',
    name: 'Image route',
    provider: 'NEW_API',
    models: ['route-image-v2'],
  }],
  videoChannels: [{
    id: 'video-route',
    name: 'Video route',
    provider: 'NEW_API',
    models: ['route-video-v9'],
  }],
});

const generatorNode = (
  id: string,
  type: 'image-generator' | 'video-generator',
  model: string,
  credentialSource: 'wallet' | 'local' = 'wallet',
): CanvasImageItem => ({
  id,
  item: { id, type: 'text', content: '', name: id, createdAt: 1, isQuickAccess: false },
  x: 0,
  y: 0,
  width: 320,
  height: 240,
  ai: { type, model, credentialSource },
});

describe('server-driven AI model capabilities', () => {
  beforeEach(() => clearCachedAiCatalogForTests());

  it('drives a new image model resolution list and seven reference slots without name checks', () => {
    const model = getAiCatalogModels(catalogSnapshot(), 'image')[0];
    const resolved = resolveImageModelCapabilities({
      canonical: model.capabilities,
      legacy: { resolutions: ['1K'], maxReferenceImages: 1 },
    });
    expect(resolved.source).toBe('server');
    expect(resolved.resolutions).toEqual(['2K', '4K']);
    expect(resolved.referenceImageLimit).toBe(7);
    expect(resolved.maxOutputs).toBe(3);
  });

  it('keeps exact Image2 dimensions isolated by resolution', () => {
    const resolved = resolveImageModelCapabilities({
      canonical: {
        resolutions: ['1K', '2K', '4K'],
        aspectRatios: ['1:1', '16:9'],
        aspectRatiosByResolution: {
          '1K': ['1024x1024', '1280x720'],
          '2K': ['2048x2048', '2048x1152'],
          '4K': ['2880x2880', '3840x2160'],
        },
      },
    });
    expect(getImageAspectRatioOptionsForResolution(resolved, '2k')).toEqual([
      '2048x2048', '2048x1152',
    ]);
    expect(getImageAspectRatioOptionsForResolution(resolved, '4K')).toEqual([
      '2880x2880', '3840x2160',
    ]);
    expect(getImageAspectRatioOptionsForResolution(resolved, '1K')).toEqual(['1:1', '16:9']);
  });

  it('maps semantic image ratios to exact Image2 dimensions instead of the square first option', () => {
    expect(normalizeImageAspectRatioOption(
      ['2048x2048', '2048x1152'],
      '16:9',
      '16:9',
    )).toBe('2048x1152');
    expect(normalizeImageAspectRatioOption(
      ['2880x2880', '3840x2160'],
      '2048x1152',
      '16:9',
    )).toBe('3840x2160');
  });

  it('uses the displayed default when an old exact dimension is stale at 1K', () => {
    expect(normalizeImageAspectRatioOption(
      ['1:1', '16:9'],
      '2048x2048',
      '16:9',
    )).toBe('16:9');
  });

  it('drives a new video model resolutions, durations, reference slots and FLF mode', () => {
    const model = getAiCatalogModels(catalogSnapshot(), 'video')[0];
    const resolved = resolveVideoModelCapabilities({ canonical: model.capabilities });
    expect(resolved.resolutions).toEqual(['720p', '1080p']);
    expect(resolved.durations).toEqual([5, 10]);
    expect(getCanvasAiVideoReferenceSlots('unrecognised-route', 'REF', 'new-api', resolved)).toEqual({
      mode: 'REF', imageSlots: 4, videoSlots: 2, audioSlots: 1,
    });
    expect(getCanvasAiVideoReferenceSlots('unrecognised-route', 'FLF', 'new-api', resolved)).toEqual({
      mode: 'FLF', imageSlots: 2, videoSlots: 0, audioSlots: 0,
    });
  });

  it('lets canonical server capabilities beat conflicting legacy inference', () => {
    const resolved = resolveImageModelCapabilities({
      canonical: { resolutions: ['4K'], maxReferenceImages: 2, supportsReferenceImages: false },
      legacy: { resolutions: ['1K', '2K'], maxReferenceImages: 9, supportsReferenceImages: true },
    });
    expect(resolved.resolutions).toEqual(['4K']);
    expect(resolved.referenceImageLimit).toBe(0);
  });

  it('uses a selected route override only when canonical data omits that field', () => {
    const resolved = resolveVideoModelCapabilities({
      canonical: { resolutions: ['1080p'] },
      route: { durations: [6, 12], maxReferenceImages: 3 },
      legacy: { resolutions: ['480p'], durations: [4], maxReferenceImages: 9 },
    });
    expect(resolved.resolutions).toEqual(['1080p']);
    expect(resolved.durations).toEqual([6, 12]);
    expect(resolved.referenceImages).toBe(3);
  });

  it('stores canonical promises while using route capabilities only for missing fields', () => {
    expect(mergeAiModelCapabilities(
      { maxReferenceImages: 4, resolutions: ['1080p'] },
      { maxReferenceImages: 9, maxReferenceVideos: 2, resolutions: ['720p'] },
    )).toEqual({
      maxReferenceImages: 4,
      maxReferenceVideos: 2,
      resolutions: ['1080p'],
    });
  });

  it('lets server input modes disable the legacy first/last-frame mode', () => {
    const resolved = resolveVideoModelCapabilities({
      canonical: { supportedInputModes: ['reference'] },
      legacy: {
        supportsFirstLastFrame: true,
        supportedInputModes: ['reference', 'first_last_frame'],
      },
    });
    expect(resolved.firstLastFrame).toBe(false);
    expect(resolved.inputModes).toEqual(['reference']);
  });

  it('preserves Banana, Image2, Seedance and MiniMax legacy behaviour without server data', () => {
    expect(resolveCanvasAiImageModelCapabilities({
      provider: 'new-api', model: 'gemini-3-pro-image',
    }).resolutions).toEqual(['2k', '4k']);
    expect(resolveCanvasAiImageModelCapabilities({
      provider: 'new-api', model: 'gpt-image-2',
    }).resolutions).toEqual(['1k', '2k', '4k']);
    expect(resolveCanvasAiVideoModelCapabilities({
      provider: 'new-api', model: 'SourceMix2.0',
    }).referenceImages).toBe(9);
    expect(resolveCanvasAiVideoModelCapabilities({
      provider: 'minimax', model: 'MiniMax-H3',
    }).resolutions).toEqual(['768P', '2K']);
  });

  it('falls back cleanly when an old server has no catalog or capability map', () => {
    const oldServer: CloudImageModelsResult = {
      provider: 'NEW_API', models: ['gpt-image-2'], channels: [], videoChannels: [],
    };
    expect(getAiCatalogModels(oldServer, 'image')).toEqual([]);
    expect(resolveCanvasAiImageModelCapabilities({
      provider: 'new-api', model: 'gpt-image-2',
    }).source).toBe('legacy');
  });

  it('keeps the last successful in-memory catalog when a later request fails', () => {
    const snapshot = catalogSnapshot();
    cacheSuccessfulAiCatalog(snapshot);
    // A rejected refresh does not call cacheSuccessfulAiCatalog.
    expect(getCachedAiCatalog()).toBe(snapshot);
  });

  it('preserves an unavailable explicit image model during catalog refresh', () => {
    const next = reconcileStaleCanvasAiModels(
      [generatorNode('image', 'image-generator', 'retired-image')],
      catalogSnapshot(),
    );
    expect(next[0].ai?.model).toBe('retired-image');
  });

  it('preserves an unavailable explicit video model during catalog refresh', () => {
    const next = reconcileStaleCanvasAiModels(
      [generatorNode('video', 'video-generator', 'retired-video')],
      catalogSnapshot(),
    );
    expect(next[0].ai?.model).toBe('retired-video');
  });

  it('uses the server default only for an unconfigured wallet node', () => {
    const next = reconcileStaleCanvasAiModels(
      [generatorNode('image', 'image-generator', '')],
      catalogSnapshot(),
    );
    expect(next[0].ai?.model).toBe('test-image-x');
  });

  it('does not reset local models during a wallet catalog refresh', () => {
    const next = reconcileStaleCanvasAiModels(
      [generatorNode('local', 'video-generator', 'private-local-model', 'local')],
      catalogSnapshot(),
    );
    expect(next[0].ai?.model).toBe('private-local-model');
  });

  it('keeps a canonical SKU stable when an exact server alias route is renamed', () => {
    const snapshot = catalogSnapshot();
    const catalog = getAiCatalogModels(snapshot, 'video');
    const candidates = getCanvasAiVideoModelCandidates(
      'test-video-x', 'wallet', 'new-api', snapshot.videoChannels, catalog,
    );
    expect(findAiCatalogModel(catalog, 'route-video-v9')?.id).toBe('test-video-x');
    expect(candidates).toMatchObject([{
      model: 'route-video-v9',
      canonicalModelId: 'test-video-x',
      displayName: 'Test Video X',
    }]);
    expect(filterCanvasAiVideoModelCandidates('test-video-x', candidates)).toEqual(candidates);
  });

  it('accepts only canonical ids and explicit aliases, never fuzzy guesses', () => {
    const catalog = getAiCatalogModels(catalogSnapshot(), 'image');
    expect(findAiCatalogModel(catalog, 'route-image-v2')?.id).toBe('test-image-x');
    expect(findAiCatalogModel(catalog, 'test image x')).toBeUndefined();
    expect(getDefaultAiCatalogModelId(catalogSnapshot(), 'image')).toBe('test-image-x');
  });
});
