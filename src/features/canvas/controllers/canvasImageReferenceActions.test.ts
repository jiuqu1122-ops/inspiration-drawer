import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { generateCanvasAiProviderImages } from '../../canvasAiImage';
import type { CanvasAiCredentialSource, CanvasImageItem } from '../../canvasModel';
import type { AiModelCapabilities } from '../../../types/license';
import { pickCanvasImageForGeneratorImpl, runCanvasAiGeneratorTargetImpl, startCanvasConnectionDragImpl, startPickCanvasImageForGeneratorImpl } from './canvasGenerationActions';
import { chooseLocalImagesForCanvasGeneratorImpl, connectCanvasItemsImpl, connectCanvasItemsToGeneratorImpl, connectSelectedCanvasItemsToGeneratorImpl, handleCanvasGeneratorUploadImpl, replaceCanvasGeneratorReferenceImpl } from './canvasWorkflowEditorActions';
import { buildCanvasAiGeneratorNodeImpl, buildCanvasImageFusionNodeImpl, getCanvasImageInputsForNodeImpl } from './canvasInputActions';
import { createCanvasAiOutputDraftsImpl, getCanvasImageInputBufferItemsForNodeImpl } from './canvasMediaActions';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: (path: string) => `asset://${path}` }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('../../drawerPrefs', () => ({ MIN_DRAWER_WIDTH: 880, MAX_DRAWER_WIDTH: 1920, MIN_DRAWER_HEIGHT: 560, MAX_DRAWER_HEIGHT: 1080 }));
vi.mock('../../canvasAiImage', async original => ({ ...await original<object>(), generateCanvasAiProviderImages: vi.fn(async () => []) }));
beforeEach(() => {
  vi.mocked(generateCanvasAiProviderImages).mockReset().mockResolvedValue([]);
  vi.stubGlobal('window', { setTimeout, clearTimeout, performance: { now: () => 0 } });
  vi.stubGlobal('localStorage', { getItem: () => null });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function scenario(capabilities: AiModelCapabilities = { supportsReferenceImages: false, maxReferenceImages: 5 }) {
  const image: CanvasImageItem = { id: 'image', item: { id: 'asset-image', type: 'image', content: '', url: 'https://fixture.test/image.png', createdAt: 0 }, x: 0, y: 0, width: 100, height: 100 };
  const text: CanvasImageItem = { id: 'text', item: { id: 'asset-text', type: 'text', content: 'A prompt', createdAt: 0 }, x: 0, y: 0, width: 100, height: 100 };
  const bridge: CanvasImageItem = { ...text, id: 'bridge', inputs: [image.id], workflowBridge: { type: 'reference-image', label: 'Reference' } };
  const target: CanvasImageItem = { ...text, id: 'target', item: { ...text.item, id: 'target-asset' }, inputs: [], ai: { type: 'image-generator', provider: 'new-api', model: 'configured-image',
    providerChannelId: 'route', providerCandidates: [{ source: 'wallet', provider: 'new-api', providerChannelId: 'route', model: 'upstream-image', canonicalModelId: 'configured-image', modelCapabilities: { supportsReferenceImages: true, maxReferenceImages: 8 } }] } };
  const ref = { current: [image, text, bridge, target] };
  const context = {
    canvasItemsRef: ref, canvasAiCredentialSource: 'wallet' as CanvasAiCredentialSource,
    canvasAiCloudImageModels: { provider: 'new-api', models: ['configured-image'], catalog: [{ id: 'configured-image', displayName: 'Configured image', modality: 'image' as const, capabilities }] },
    canvasSelectedIdsRef: { current: [image.id, text.id] }, canvasReferenceReplaceTargetRef: { current: null },
    pendingCanvasFusionRoleRef: { current: null }, pendingCanvasFusionUploadRoleRef: { current: null }, pendingCanvasReferenceUploadReplaceRef: { current: null },
    pendingCanvasUploadTargetIdRef: { current: null as string | null }, pendingCanvasWorkflowSlotUploadRef: { current: null },
    canvasUploadInputRef: { current: { click: vi.fn() } }, canReplaceCanvasImageReferenceForTarget: () => true,
    pushCanvasUndoSnapshot: vi.fn(), updateCanvasSelection: vi.fn(), showToast: vi.fn(), setCanvasInputMenuForId: vi.fn(),
    setCanvasInputPickTargetId: vi.fn(), setCanvasContextMenu: vi.fn(), setCanvasReferenceReplacement: vi.fn(),
    getCanvasImageFusionPreferredRole: () => null, applyCanvasImageFusionConnectionPatch: vi.fn(),
    updateCanvasItemsImmediate: (update: (items: CanvasImageItem[]) => CanvasImageItem[]) => { ref.current = update(ref.current); return ref.current; },
    chooseLocalVideosForCanvasGenerator: vi.fn(), createCanvasImageItemFromFile: vi.fn(async () => image), appendCanvasItems: vi.fn(() => 1),
  };
  const connect = (sourceId: string) => connectCanvasItemsImpl(context as unknown as Parameters<typeof connectCanvasItemsImpl>[0], sourceId, target.id);
  const connectMany = (ids: string[]) => connectCanvasItemsToGeneratorImpl(context as unknown as Parameters<typeof connectCanvasItemsToGeneratorImpl>[0], ids, target.id);
  return { image, text, bridge, target, ref, context, connect, connectMany, current: () => ref.current.find(item => item.id === target.id)! };
}

describe('published image reference restrictions at real write actions', () => {
  it.each([{ supportsReferenceImages: false, maxReferenceImages: 5 }, { supportsReferenceImages: true, maxReferenceImages: 0 }])('rejects a direct image connection with %j despite a stale permissive candidate', capabilities => {
    const state = scenario(capabilities);
    expect(state.connect(state.image.id)).toBe(false);
    expect(state.current().inputs).toEqual([]);
    expect(state.context.pushCanvasUndoSnapshot).not.toHaveBeenCalled();
    expect(state.context.showToast).toHaveBeenCalledWith(expect.stringContaining('不支持参考图'));
  });

  it('rejects image bridges while retaining ordinary text connections', () => {
    const state = scenario();
    expect(state.connect(state.bridge.id)).toBe(false);
    expect(state.connect(state.text.id)).toBe(true);
    expect(state.current().inputs).toEqual([state.text.id]);
  });

  it.each(['selected', 'multiple'] as const)('does not write image inputs through the %s connection action', action => {
    const state = scenario();
    if (action === 'selected') connectSelectedCanvasItemsToGeneratorImpl(state.context as unknown as Parameters<typeof connectSelectedCanvasItemsToGeneratorImpl>[0], state.target.id);
    else state.connectMany([state.image.id, state.text.id]);
    expect(state.current().inputs).not.toContain(state.image.id);
    expect(state.context.showToast).toHaveBeenCalledWith(expect.stringContaining('不支持参考图'));
  });

  it.each([false, true])('blocks a real connection drag with multiple=%s at pointerup', multiple => {
    const state = scenario();
    const listeners = new Map<string, (event: unknown) => void>();
    vi.stubGlobal('document', { addEventListener: (name: string, listener: (event: unknown) => void) => listeners.set(name, listener), removeEventListener: vi.fn() });
    if (!multiple) state.context.canvasSelectedIdsRef.current = [state.image.id];
    startCanvasConnectionDragImpl({ ...state.context, CANVAS_CONNECTION_HANDLE_OUTSET: 0, canvasConnectionDragRef: { current: null },
      connectCanvasItems: (id: string) => state.connect(id), connectCanvasItemsToGenerator: (ids: string[]) => state.connectMany(ids),
      getCanvasItemRenderedBox: (item: CanvasImageItem) => item, getCanvasPointFromClient: () => ({ x: 0, y: 0 }),
      setCanvasConnectionDraft: vi.fn(), setCanvasInteractionActive: vi.fn(), autoScrollCanvasNearEdge: vi.fn(),
    } as unknown as Parameters<typeof startCanvasConnectionDragImpl>[0], { button: 0, pointerId: 1, preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as Parameters<typeof startCanvasConnectionDragImpl>[1], state.image.id);
    listeners.get('pointerup')!({ target: { closest: () => ({ getAttribute: () => state.target.id }) } });
    expect(state.current().inputs).not.toContain(state.image.id);
    expect(state.context.showToast).toHaveBeenCalledWith(expect.stringContaining('不支持参考图'));
  });

  it('prevents both entering image pick mode and replacing a historical reference', () => {
    const state = scenario();
    startPickCanvasImageForGeneratorImpl(state.context as unknown as Parameters<typeof startPickCanvasImageForGeneratorImpl>[0], state.target.id);
    expect(state.context.setCanvasInputPickTargetId).not.toHaveBeenCalled();
    expect(pickCanvasImageForGeneratorImpl({ ...state.context, connectCanvasItems: state.connect } as unknown as Parameters<typeof pickCanvasImageForGeneratorImpl>[0], state.image.id, state.target.id)).toBe(false);
    state.target.inputs = ['old-image'];
    expect(replaceCanvasGeneratorReferenceImpl(state.context as unknown as Parameters<typeof replaceCanvasGeneratorReferenceImpl>[0], { targetId: state.target.id, inputId: 'old-image', inputIndex: 0 }, state.image.id)).toBe(false);
    expect(state.current().inputs).toEqual(['old-image']);
  });

  it('uses freshly enabled published support for both picker actions despite a disabled saved candidate', () => {
    const state = scenario({ supportsReferenceImages: true, maxReferenceImages: 5 });
    state.target.ai!.providerCandidates![0].modelCapabilities = { supportsReferenceImages: false, maxReferenceImages: 0 };
    startPickCanvasImageForGeneratorImpl(state.context as unknown as Parameters<typeof startPickCanvasImageForGeneratorImpl>[0], state.target.id);
    expect(state.context.setCanvasInputPickTargetId).toHaveBeenCalledWith(state.target.id);
    expect(pickCanvasImageForGeneratorImpl({ ...state.context, connectCanvasItems: state.connect } as unknown as Parameters<typeof pickCanvasImageForGeneratorImpl>[0], state.image.id, state.target.id)).toBe(true);
    expect(state.current().inputs).toEqual([state.image.id]);
  });

  it('rejects the local upload picker and a stale picker result after support is disabled', async () => {
    const state = scenario();
    chooseLocalImagesForCanvasGeneratorImpl(state.context as unknown as Parameters<typeof chooseLocalImagesForCanvasGeneratorImpl>[0], state.target.id);
    expect(state.context.canvasUploadInputRef.current.click).not.toHaveBeenCalled();
    state.context.pendingCanvasUploadTargetIdRef.current = state.target.id;
    await handleCanvasGeneratorUploadImpl(state.context as unknown as Parameters<typeof handleCanvasGeneratorUploadImpl>[0], { target: { files: [{ type: 'image/png', name: 'ref.png' }], value: 'ref.png' } } as unknown as Parameters<typeof handleCanvasGeneratorUploadImpl>[1]);
    expect(state.context.createCanvasImageItemFromFile).not.toHaveBeenCalled();
    expect(state.context.appendCanvasItems).not.toHaveBeenCalled();
  });

  it('does not attach or append an uploaded reference after the model changes while the file is being read', async () => {
    const state = scenario({ supportsReferenceImages: true, maxReferenceImages: 5 });
    state.context.canvasAiCloudImageModels.catalog.push({ id: 'restricted-image', displayName: 'Restricted', modality: 'image', capabilities: { supportsReferenceImages: false } });
    state.context.pendingCanvasUploadTargetIdRef.current = state.target.id;
    let finish!: (item: CanvasImageItem) => void;
    state.context.createCanvasImageItemFromFile.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const uploading = handleCanvasGeneratorUploadImpl({ ...state.context, connectCanvasItemsToGenerator: state.connectMany } as unknown as Parameters<typeof handleCanvasGeneratorUploadImpl>[0],
      { target: { files: [{ type: 'image/png', name: 'ref.png' }], value: 'ref.png' } } as unknown as Parameters<typeof handleCanvasGeneratorUploadImpl>[1]);
    state.target.ai!.model = 'restricted-image';
    finish(state.image);
    await uploading;
    expect(state.context.appendCanvasItems).not.toHaveBeenCalled();
    expect(state.current().inputs).toEqual([]);
  });

  it.each(['supported', 'unknown', 'byok', 'video', 'workflow'] as const)('keeps the existing image connection contract for %s', kind => {
    const state = scenario(kind === 'unknown' ? {} : { supportsReferenceImages: true, maxReferenceImages: 5 });
    if (kind === 'byok') { state.context.canvasAiCredentialSource = 'local'; state.context.canvasAiCloudImageModels.catalog[0].capabilities = { supportsReferenceImages: false, maxReferenceImages: 0 }; }
    if (kind === 'video') state.target.ai!.type = 'video-generator';
    if (kind === 'workflow') state.target.ai!.type = 'workflow';
    expect(state.connect(state.image.id)).toBe(true);
    expect(state.current().inputs).toEqual([state.image.id]);
  });

  it('preserves an explicitly local image node while the global source is the wallet', () => {
    const state = scenario();
    state.target.ai!.credentialSource = 'local';
    expect(state.connect(state.image.id)).toBe(true);
  });

  it('does not auto-connect selected image assets when creating a node with a restricted default model', () => {
    const state = scenario();
    const created = buildCanvasAiGeneratorNodeImpl({ ...state.context, canvasAiProvider: 'new-api', canvasAiUnifiedImageModelOptions: [], canvasAiUnifiedVideoModelOptions: [],
      createAssetId: () => 'new-0-0-0-0', makeCanvasNodeId: () => 'new-node', getCanvasAiResolvedModel: () => 'configured-image',
    } as unknown as Parameters<typeof buildCanvasAiGeneratorNodeImpl>[0], { x: 20, y: 20 }, undefined, [state.image.id, state.bridge.id, state.text.id]);
    expect(created.inputs).toEqual([state.text.id]);
    expect(state.ref.current).toContain(state.image);
    expect(state.ref.current).toContain(state.bridge);
    expect(state.context.showToast).toHaveBeenCalledWith(expect.stringContaining('已保留源素材'));
  });

  it('does not restore rejected initial image references while building fusion slots', () => {
    const state = scenario();
    const build = (position: { x: number; y: number }, _preset: unknown, ids?: string[]) => buildCanvasAiGeneratorNodeImpl({ ...state.context,
      canvasAiProvider: 'new-api', canvasAiUnifiedImageModelOptions: [], canvasAiUnifiedVideoModelOptions: [],
      createAssetId: () => 'new-0-0-0-0', makeCanvasNodeId: () => 'new-node', getCanvasAiResolvedModel: () => 'configured-image',
    } as unknown as Parameters<typeof buildCanvasAiGeneratorNodeImpl>[0], position, undefined, ids);
    const fusion = buildCanvasImageFusionNodeImpl({ canvasItemsRef: state.ref, buildCanvasAiGeneratorNode: build }, { x: 0, y: 0 }, [state.image.id]);
    expect(fusion.inputs).toEqual([]);
    expect(fusion.ai?.sourceImageNodeId).toBeNull();
  });
});

describe('old connected references at the actual generation entry', () => {
  it.each(['image', 'bridge'] as const)('preserves a historical %s connection and stops before reference preparation or a paid request', async source => {
    const state = scenario();
    state.target.inputs = [state[source].id];
    const prepare = vi.fn(async () => ({ images: [], videos: [], audios: [], temporaryShareIds: [], usedRemoteFirst: false }));
    const context = { ...state.context, activeCanvasIdRef: { current: 'canvas' }, canvasesRef: { current: [] },
      canvasAiProvider: 'new-api', canvasAiUnifiedImageModelOptions: [], canvasAiApiKey: '', canvasAiNewApiVideoKey: '', canvasAiEndpoint: '', canvasAiHeadersText: '{}',
      getCanvasAiResolvedModel: (_provider: string, model: string) => model, getCanvasTextInputsForNode: () => [], getCanvasImageInputBufferItemsForNode: () => [],
      getCanvasImageInputsForNode: prepare, getCanvasAiErrorSummary: (message: string) => message,
      createCanvasAiOutputDrafts: () => [], notifyCanvasAiGenerationResult: vi.fn(), stopTemporaryReferenceShares: vi.fn(async () => {}),
    };
    await runCanvasAiGeneratorTargetImpl(context as unknown as Parameters<typeof runCanvasAiGeneratorTargetImpl>[0], state.target, {
      updateAi: patch => Object.assign(state.target.ai!, patch), getLatestTarget: () => state.target,
    });
    expect(state.target.inputs).toEqual([state[source].id]);
    expect(state.target.ai?.error).toContain('先断开');
    expect(prepare).not.toHaveBeenCalled();
    expect(generateCanvasAiProviderImages).not.toHaveBeenCalled();
    expect(state.ref.current).toContain(state.image);
  });
});

function referenceRunScenario(capabilities: AiModelCapabilities, savedCapabilities: AiModelCapabilities, imageCount = 1) {
  const state = scenario(capabilities);
  const images = Array.from({ length: imageCount }, (_, index): CanvasImageItem => ({ ...state.image, id: `image-${index}`,
    item: { ...state.image.item, id: `asset-${index}`, url: `https://fixture.test/reference-${index}.png` } }));
  state.ref.current = [...images, state.text, state.target];
  state.target.inputs = images.map(image => image.id);
  state.target.ai!.providerCandidates![0].modelCapabilities = savedCapabilities;
  const readReferences = (target: CanvasImageItem, sourceItems: CanvasImageItem[] = state.ref.current) => getCanvasImageInputBufferItemsForNodeImpl({
    ...state.context,
    getCanvasInputItemsForNode: (item, items = state.ref.current) => (item.inputs || [])
      .map(id => items.find(source => source.id === id)).filter((source): source is CanvasImageItem => !!source && source.id !== item.id),
  }, target, sourceItems);
  const upload = vi.fn(async (sources: string[]) => sources.map((_source, index) => `reference-images/fixture-${index}.png`));
  const inputContext: Parameters<typeof getCanvasImageInputsForNodeImpl>[0] = {
    canvasAiProvider: 'new-api', getCanvasAiErrorSummary: message => message || '', getCanvasImageInputBufferItemsForNode: readReferences,
    prepareCanvasAiInputSource: async item => ({ source: item.url || '', remoteFallback: undefined, usedRemoteFirst: false }),
    uploadWalletReferenceInputs: upload, uploadXaisReferenceInputs: vi.fn(async sources => sources),
    publishLocalAiInputs: vi.fn(async sources => ({ urls: sources, shareIds: [] })), stopTemporaryReferenceShares: vi.fn(async () => {}),
  };
  type PrepareReferences = Parameters<typeof runCanvasAiGeneratorTargetImpl>[0]['getCanvasImageInputsForNode'];
  const prepare = vi.fn<PrepareReferences>((target, mode = 'stable', delivery = 'auto', items = state.ref.current, format = 'any', preference = 'cloudflared-first', portable = false, provider) => (
    getCanvasImageInputsForNodeImpl(inputContext, target, mode, delivery, items, format, preference, portable, provider)
  ));
  const context = { ...state.context, activeCanvasIdRef: { current: 'canvas' }, canvasesRef: { current: [] },
    canvasAiProvider: 'new-api', canvasAiUnifiedImageModelOptions: [], canvasAiApiKey: '', canvasAiNewApiVideoKey: '', canvasAiEndpoint: '', canvasAiHeadersText: '{}',
    getCanvasAiResolvedModel: (_provider: string, model: string) => model, getCanvasTextInputsForNode: () => [],
    getCanvasImageInputBufferItemsForNode: readReferences, getCanvasImageInputsForNode: prepare, getCanvasAiErrorSummary: (message: string) => message,
    createCanvasAiOutputDrafts: (target: CanvasImageItem, prompt: string, requestId?: string) => createCanvasAiOutputDraftsImpl({ createAssetId: () => 'fixture-0-0-0-0' }, target, prompt, requestId),
    notifyCanvasAiGenerationResult: vi.fn(), stopTemporaryReferenceShares: inputContext.stopTemporaryReferenceShares,
    pushDrawerUndoSnapshot: vi.fn(), addGeneratedImagesToDrawer: vi.fn(), refreshCloudAccount: vi.fn(async () => {}),
  };
  const run = () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    vi.mocked(generateCanvasAiProviderImages).mockResolvedValueOnce(['https://fixture.test/generated.png']);
    return runCanvasAiGeneratorTargetImpl(context as unknown as Parameters<typeof runCanvasAiGeneratorTargetImpl>[0], state.target, {
      updateAi: patch => Object.assign(state.target.ai!, patch), getLatestTarget: () => state.target,
    });
  };
  return { ...state, images, readReferences, prepare, upload, context, run };
}

describe('live published references through media reading and actual generation', () => {
  it('sends references enabled in the live catalog despite a saved disabled route', async () => {
    const state = referenceRunScenario({ supportsReferenceImages: true, maxReferenceImages: 5 }, { supportsReferenceImages: false, maxReferenceImages: 0 });
    expect(state.readReferences(state.target).map(item => item.id)).toEqual(state.images.map(item => item.item.id));
    await state.run();
    expect(generateCanvasAiProviderImages).toHaveBeenCalledTimes(1);
    expect(generateCanvasAiProviderImages).toHaveBeenCalledWith(expect.objectContaining({ cloudWallet: true, inputImages: ['reference-images/fixture-0.png'] }));
    expect(state.upload).toHaveBeenCalledWith(['https://fixture.test/reference-0.png']);
    expect(state.target.ai?.status).toBe('success');
  });

  it.each([{ supportsReferenceImages: false, maxReferenceImages: 5 }, { supportsReferenceImages: true, maxReferenceImages: 0 }])('reads no disabled references and rejects the historical connection with %j', async capabilities => {
    const state = referenceRunScenario(capabilities, { supportsReferenceImages: true, maxReferenceImages: 8 });
    expect(state.readReferences(state.target)).toEqual([]);
    await state.run();
    expect(state.target.inputs).toEqual(state.images.map(image => image.id));
    expect(state.target.ai?.error).toContain('先断开');
    expect(state.prepare).not.toHaveBeenCalled();
    expect(state.upload).not.toHaveBeenCalled();
    expect(generateCanvasAiProviderImages).not.toHaveBeenCalled();
  });

  it('reads freshly published route support when canonical capabilities are unspecified', async () => {
    const state = referenceRunScenario({}, { supportsReferenceImages: false, maxReferenceImages: 0 });
    Object.assign(state.context.canvasAiCloudImageModels, { channels: [{ id: 'route', name: 'Configured route', provider: 'new-api', models: ['upstream-image'],
      modelCapabilities: { 'upstream-image': { supportsReferenceImages: true, maxReferenceImages: 5 } } }] });
    expect(state.readReferences(state.target)).toHaveLength(1);
    await state.run();
    expect(generateCanvasAiProviderImages).toHaveBeenCalledWith(expect.objectContaining({ inputImages: ['reference-images/fixture-0.png'] }));
    expect(state.target.ai?.status).toBe('success');
  });

  it('keeps text-only generation available when image references are disabled', async () => {
    const state = referenceRunScenario({ supportsReferenceImages: false, maxReferenceImages: 0 }, { supportsReferenceImages: true, maxReferenceImages: 8 }, 0);
    state.target.inputs = [state.text.id];
    expect(state.readReferences(state.target)).toEqual([]);
    await state.run();
    expect(generateCanvasAiProviderImages).toHaveBeenCalledWith(expect.objectContaining({ cloudWallet: true, inputImages: [] }));
    expect(state.target.ai?.status).toBe('success');
  });

  it('limits both preparation and the paid request to the smaller live maximum', async () => {
    const state = referenceRunScenario({ supportsReferenceImages: true, maxReferenceImages: 2 }, { supportsReferenceImages: true, maxReferenceImages: 8 }, 4);
    expect(state.readReferences(state.target)).toHaveLength(2);
    await state.run();
    expect(state.upload).toHaveBeenCalledWith(state.images.slice(0, 2).map(image => image.item.url));
    expect(generateCanvasAiProviderImages).toHaveBeenCalledWith(expect.objectContaining({ inputImages: ['reference-images/fixture-0.png', 'reference-images/fixture-1.png'] }));
    expect(state.target.inputs).toHaveLength(4);
    expect(state.target.ai?.status).toBe('success');
  });

  it('keeps local candidates independent of disabled server capabilities', async () => {
    const state = referenceRunScenario({ supportsReferenceImages: false, maxReferenceImages: 0 }, { supportsReferenceImages: true, maxReferenceImages: 3 });
    state.target.ai!.credentialSource = 'local';
    state.target.ai!.providerCandidates![0].source = 'local';
    expect(state.readReferences(state.target)).toHaveLength(1);
    state.context.canvasAiCredentialSource = 'local';
    state.context.canvasAiApiKey = 'fixture-key';
    await state.run();
    expect(state.upload).not.toHaveBeenCalled();
    expect(generateCanvasAiProviderImages).toHaveBeenCalledWith(expect.objectContaining({ cloudWallet: false, inputImages: ['https://fixture.test/reference-0.png'] }));
    expect(state.target.ai?.status).toBe('success');
  });
});
