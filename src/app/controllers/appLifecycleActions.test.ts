import { describe,expect,it,vi } from 'vitest';
import type { CanvasAiModelCandidate,CanvasImageItem } from '../../features/canvasModel';
import { canvasAiGroupedModelChoiceValue } from '../../utils/canvasAiConfig';
import { getCanvasAiUnifiedImageModelValueImpl } from './appLifecycleActions';
import { runAppLifecycleEffect21 } from './appLifecycleEffects';
import { getCanvasImageInputBufferItemsForNodeImpl } from '../../features/canvas/controllers/canvasMediaActions';

vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: vi.fn(), invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({ cursorPosition: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));

const catalogOption = (
  canonicalModelId: string,
  displayName: string,
  routeModel: string,
  providerChannelId: string,
) => {
  const route: CanvasAiModelCandidate = {
    source: 'wallet',
    provider: 'new-api',
    model: routeModel,
    canonicalModelId,
    displayName,
    providerChannelId,
  };
  return {
    label: displayName,
    value: canvasAiGroupedModelChoiceValue('wallet', {
      ...route,
      model: canonicalModelId,
    }, [route]),
  };
};

describe('getCanvasAiUnifiedImageModelValueImpl', () => {
  it('keeps the selected second Catalog image model by canonical ID', () => {
    const first = catalogOption('catalog-image-a', 'Catalog Image A', 'route-image-a', 'channel-a');
    const second = catalogOption('catalog-image-b', 'Catalog Image B', 'route-image-b', 'channel-b');

    expect(getCanvasAiUnifiedImageModelValueImpl({
      canvasAiCloudImageModels: null,
      canvasAiCredentialSource: 'wallet',
      canvasAiUnifiedImageModelOptions: [first, second],
    }, 'new-api', 'catalog-image-b', 'channel-b')).toBe(second.value);
  });

  it('maps an exact provider route back to its Catalog option', () => {
    const first = catalogOption('catalog-image-a', 'Catalog Image A', 'route-image-a', 'channel-a');
    const second = catalogOption('catalog-image-b', 'Catalog Image B', 'route-image-b', 'channel-b');

    expect(getCanvasAiUnifiedImageModelValueImpl({
      canvasAiCloudImageModels: null,
      canvasAiCredentialSource: 'wallet',
      canvasAiUnifiedImageModelOptions: [first, second],
    }, 'new-api', 'route-image-b', 'channel-b')).toBe(second.value);
  });

  it('uses the channel to disambiguate one upstream id mapped to two Catalog models', () => {
    const image2 = catalogOption('image2', 'GPT Image 2', 'image2', 'channel-image-2');
    const image25 = catalogOption('gpt-image-medium', 'GPT Image 2.5', 'image2', 'channel-image-2-5');

    expect(getCanvasAiUnifiedImageModelValueImpl({
      canvasAiCloudImageModels: null,
      canvasAiCredentialSource: 'wallet',
      canvasAiUnifiedImageModelOptions: [image2, image25],
    }, 'new-api', 'image2', 'channel-image-2-5')).toBe(image25.value);
  });

  it('does not display the first picker model when an explicit model is temporarily unavailable', () => {
    const banana = catalogOption('nano-banana-pro', 'Nano Banana Pro', 'gemini-3-pro-image', 'banana-channel');
    const value = getCanvasAiUnifiedImageModelValueImpl({
      canvasAiCloudImageModels: null,
      canvasAiCredentialSource: 'wallet',
      canvasAiUnifiedImageModelOptions: [banana],
    }, 'new-api', 'gpt-image-medium');

    expect(value).not.toBe(banana.value);
    expect(value).toContain('gpt-image-medium');
  });

  it('does not rewrite an unavailable explicit image model to Banana during option refresh', () => {
    const banana = catalogOption('nano-banana-pro', 'Nano Banana Pro', 'gemini-3-pro-image', 'banana-channel');
    let items = [{
      id: 'image-node',
      item: { id: 'image-node', type: 'text', content: '', createdAt: 1 },
      x: 0,
      y: 0,
      width: 320,
      height: 240,
      ai: {
        type: 'image-generator',
        provider: 'new-api',
        model: 'gpt-image-medium',
        credentialSource: 'wallet',
      },
    }] as CanvasImageItem[];

    runAppLifecycleEffect21({
      canvasAiCloudImageModels: null,
      canvasAiCredentialSource: 'wallet',
      canvasAiUnifiedImageModelOptions: [banana],
      isCanvasMode: true,
      updateCanvasItemsImmediate: updater => {
        items = updater(items);
        return items;
      },
    });

    expect(items[0].ai?.model).toBe('gpt-image-medium');
  });

  it('hydrates a stale video selection with the default Catalog route', () => {
    let items = [{
      id: 'video-node',
      item: { id: 'video-node', type: 'text', content: '', createdAt: 1 },
      x: 0,
      y: 0,
      width: 320,
      height: 240,
      ai: { type: 'video-generator', provider: 'new-api', model: 'catalog-video-b' },
    }] as CanvasImageItem[];
    runAppLifecycleEffect21({
      canvasAiCloudImageModels: {
        provider: 'NEW_API',
        models: [],
        defaultVideoModel: 'catalog-video-b',
        catalog: [{
          id: 'catalog-video-b',
          displayName: 'Catalog Video B',
          modality: 'video',
          aliases: ['route-video-b'],
          capabilities: { resolutions: ['1080p'], durations: [6] },
        }],
        videoChannels: [{
          id: 'video-channel-b',
          name: 'Video channel B',
          provider: 'NEW_API',
          models: ['route-video-b'],
        }],
      },
      canvasAiCredentialSource: 'wallet',
      canvasAiUnifiedImageModelOptions: [],
      isCanvasMode: true,
      updateCanvasItemsImmediate: updater => {
        items = updater(items);
        return items;
      },
    });

    expect(items[0].ai).toMatchObject({
      provider: 'new-api',
      model: 'catalog-video-b',
      providerChannelId: 'video-channel-b',
      credentialSource: 'wallet',
      providerCandidates: [{
        model: 'route-video-b',
        canonicalModelId: 'catalog-video-b',
      }],
    });
  });

  it('reads the server-driven image reference limit instead of the legacy limit', () => {
    const references = Array.from({ length: 9 }, (_, index) => ({
      id: `reference-${index}`,
      item: {
        id: `reference-${index}`,
        type: 'image' as const,
        content: '',
        createdAt: index + 1,
      },
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    })) as CanvasImageItem[];
    const target = {
      id: 'image-node',
      item: { id: 'image-node', type: 'text', content: '', createdAt: 20 },
      x: 0,
      y: 0,
      width: 320,
      height: 240,
      inputs: references.map(reference => reference.id),
      ai: {
        type: 'image-generator',
        provider: 'new-api',
        model: 'catalog-image-x',
        credentialSource: 'wallet',
        providerCandidates: [{
          source: 'wallet',
          provider: 'new-api',
          model: 'route-image-x',
          canonicalModelId: 'catalog-image-x',
          modelCapabilities: { maxReferenceImages: 9 },
        }],
      },
    } as CanvasImageItem;

    const result = getCanvasImageInputBufferItemsForNodeImpl({
      getCanvasInputItemsForNode: (item, sourceItems = references) => (
        (item.inputs || []).flatMap(id => sourceItems.find(source => source.id === id) || [])
      ),
    }, target, references);

    expect(result).toHaveLength(9);
  });
});
