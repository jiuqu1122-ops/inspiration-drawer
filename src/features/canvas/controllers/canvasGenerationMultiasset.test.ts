import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { generateCanvasAiProviderImages } from '../../canvasAiImage';
import { cloneCanvasAiGeneratorForRerunImpl, generateCanvasAiGeneratorNodeImpl, runCanvasAiGeneratorNodeImpl, runCanvasAiGeneratorTargetImpl } from './canvasGenerationActions';
import { createCanvasAiOutputDraftsImpl } from './canvasMediaActions';
import { getCanvasImageInputsForNodeImpl, uploadWalletReferenceInputsImpl } from './canvasInputActions';
import type { CanvasImageItem } from '../../canvasModel';
import { handleCanvasAiRunClickImpl, handleCanvasAiRunPointerDownImpl, runCanvasAiNodeFromControlImpl } from '../../snip/windowSnipActions';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => undefined), convertFileSrc: (path: string) => `asset://${path}` }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('../../drawerPrefs', () => ({
  MIN_DRAWER_WIDTH: 880, MAX_DRAWER_WIDTH: 1920, MIN_DRAWER_HEIGHT: 560, MAX_DRAWER_HEIGHT: 1080,
}));
vi.mock('../../canvasAiImage', async original => ({ ...await original<object>(), generateCanvasAiProviderImages: vi.fn() }));
beforeEach(() => {
  vi.mocked(generateCanvasAiProviderImages).mockReset();
  vi.mocked(invoke).mockClear();
  vi.stubGlobal('window', { setTimeout, clearTimeout, performance: { now: () => 0 } });
  vi.stubGlobal('localStorage', { getItem: () => null });
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function fixture(outputMode: 'single_asset' | 'multiple_assets' = 'multiple_assets', maxOutputImages = 4) {
  const capabilities = { outputMode, maxOutputImages, maxOutputs: 4, billingMode: 'per_request' as const,
    resolutions: ['2k'], aspectRatios: ['1:1'], outputFormats: ['png'] };
  const target: CanvasImageItem = { id: 'node', x: 0, y: 0, width: 600, height: 500,
    item: { id: 'asset', type: 'text', content: 'A landscape', createdAt: 0 },
    ai: { type: 'image-generator', count: 1, provider: 'new-api', model: 'arbitrary-image', resolution: '2k', aspectRatio: '1:1',
      providerCandidates: [{ source: 'wallet', provider: 'new-api', model: 'arbitrary-image', canonicalModelId: 'arbitrary-image', modelCapabilities: capabilities }] } };
  let sequence = 0;
  const ctx = {
    canvasItemsRef: { current: [target] }, activeCanvasIdRef: { current: 'canvas' }, canvasesRef: { current: [] },
    canvasAiCredentialSource: 'wallet', canvasAiProvider: 'new-api', canvasAiUnifiedImageModelOptions: [],
    canvasAiCloudImageModels: { catalog: [{ id: 'arbitrary-image', displayName: 'Configured image', modality: 'image', capabilities }] },
    canvasAiApiKey: '', canvasAiNewApiVideoKey: '', canvasAiEndpoint: '', canvasAiHeadersText: '{}',
    getCanvasAiResolvedModel: (_provider: string, model: string) => model,
    getCanvasTextInputsForNode: () => [], getCanvasImageInputBufferItemsForNode: () => [],
    getCanvasImageInputsForNode: async () => ({ images: [], videos: [], audios: [], temporaryShareIds: [], usedRemoteFirst: false }),
    createCanvasAiOutputDrafts: (node: CanvasImageItem, prompt: string, id?: string) => createCanvasAiOutputDraftsImpl({ createAssetId: () => `${++sequence}-0-0-0-0` }, node, prompt, id),
    getCanvasAiErrorSummary: (message: string) => message,
    pushDrawerUndoSnapshot: vi.fn(), addGeneratedImagesToDrawer: vi.fn(), refreshCloudAccount: vi.fn(async () => undefined),
    showToast: vi.fn(), notifyCanvasAiGenerationResult: vi.fn(),
  } as unknown as Parameters<typeof runCanvasAiGeneratorTargetImpl>[0];
  const updateAi = vi.fn(patch => { Object.assign(target.ai!, patch); });
  return { target, ctx, updateAi };
}

function realControlScenario() {
  const { target, ctx } = fixture();
  const ref = ctx.canvasItemsRef;
  const tokens = { current: new Map<string, string>() };
  const sessions = { current: new Map<string, CanvasImageItem[]>() };
  const pending: Promise<void>[] = [];
  let cloneSequence = 0;
  const update = (_canvas: string, id: string, patch: Partial<NonNullable<CanvasImageItem['ai']>>) => {
    const node = ref.current.find(item => item.id === id);
    if (node?.ai) node.ai = { ...node.ai, ...patch };
    return node;
  };
  const runNode = (id: string) => runCanvasAiGeneratorNodeImpl({
    activeCanvasIdRef: ctx.activeCanvasIdRef, canvasItemsRef: ref, canvasAiRunTokensRef: tokens,
    canvasSessionItemsRef: sessions, getCanvasSessionItems: () => ref.current,
    isCanvasModeRef: { current: true }, commitCanvasAiPromptDraft: vi.fn(),
    markCanvasRunNodeActive: vi.fn(), markCanvasRunNodeSettled: vi.fn(),
    updateCanvasAiGeneratorDataForCanvas: update, updateCanvasSelection: vi.fn(),
    waitForCanvasBackgroundPatches: async () => {}, showToast: vi.fn(),
    runCanvasAiGeneratorTarget: (node, options) => runCanvasAiGeneratorTargetImpl(ctx, node, options),
  }, id);
  const generate = (id: string) => generateCanvasAiGeneratorNodeImpl({
    activeCanvasIdRef: ctx.activeCanvasIdRef, canvasItemsRef: ref, canvasAiRunTokensRef: tokens,
    appendCanvasItems: items => { ref.current = [...ref.current, ...items]; return items.length; },
    cloneCanvasAiGeneratorForRerun: source => cloneCanvasAiGeneratorForRerunImpl({
      createAssetId: () => `${++cloneSequence}-0-0-0-0`, makeCanvasNodeId: seed => `clone-${seed}`,
      getCanvasAiRerunNodePosition: source => ({ x: source.x + source.width + 64, y: source.y }),
    }, source),
    commitCanvasAiPromptDraft: vi.fn(), runCanvasAiGeneratorNode: runNode,
    runCanvasEnhancementNode: vi.fn(), runCanvasExpandedWorkflowFromNode: vi.fn(),
    runCanvasFrameInterpolationNode: vi.fn(), runCanvasTextAgentNode: vi.fn(), showToast: vi.fn(),
  }, id);
  const control = {
    canvasRunButtonPointerRef: { current: null as { targetId: string; at: number } | null },
    runCanvasAiNodeFromControl: (id: string) => runCanvasAiNodeFromControlImpl({
      canvasItemsRef: ref, generateCanvasWorkflowModuleNode: vi.fn(),
      generateCanvasAiGeneratorNode: id => { const promise = generate(id); pending.push(promise); return promise; },
    }, id),
  };
  const event = { preventDefault: vi.fn(), stopPropagation: vi.fn(), currentTarget: { disabled: false } };
  return { target, ref, tokens, pending, control, event };
}

it.each(['click', 'pointer and click'] as const)('starts fresh jobs through the real %s control chain after a completed result', async action => {
  const scenario = realControlScenario();
  scenario.target.ai = { ...scenario.target.ai!, status: 'success', imageClientRequestId: 'old-receipt',
    outputs: Array.from({ length: 4 }, (_, index) => ({ id: `old-${index}`, status: 'success',
      clientRequestId: 'old-receipt', url: `https://cdn.example/old-${index}.png` })) };
  let calls = 0;
  vi.mocked(generateCanvasAiProviderImages).mockImplementation(async () => {
    const call = ++calls;
    return Array.from({ length: 4 }, (_, index) => `https://cdn.example/request-${call}-${index}.png`);
  });
  for (let click = 0; click < 2; click++) {
    if (action === 'pointer and click') handleCanvasAiRunPointerDownImpl(scenario.control,
      scenario.event as unknown as Parameters<typeof handleCanvasAiRunPointerDownImpl>[1], scenario.target.id);
    handleCanvasAiRunClickImpl(scenario.control,
      scenario.event as unknown as Parameters<typeof handleCanvasAiRunClickImpl>[1], scenario.target.id);
    await Promise.all(scenario.pending);
  }
  expect(generateCanvasAiProviderImages).toHaveBeenCalledTimes(2);
  const receipts = vi.mocked(generateCanvasAiProviderImages).mock.calls.map(([input]) => input.clientRequestId);
  expect(new Set(receipts).size).toBe(2);
  expect(receipts).not.toContain('old-receipt');
  expect(scenario.ref.current).toHaveLength(3);
  expect(scenario.ref.current.slice(1).map(node => node.ai?.outputs?.[0].url)).toEqual([
    'https://cdn.example/request-1-0.png', 'https://cdn.example/request-2-0.png',
  ]);
  expect(scenario.tokens.current.size).toBe(0);
});

it('passes a new receipt to the native cloud POST for each completed-node UI rerun', async () => {
  const actual = await vi.importActual<typeof import('../../canvasAiImage')>('../../canvasAiImage');
  vi.mocked(generateCanvasAiProviderImages).mockImplementation(actual.generateCanvasAiProviderImages);
  const scenario = realControlScenario();
  scenario.target.ai = { ...scenario.target.ai!, status: 'success', imageClientRequestId: 'old-receipt',
    outputs: [{ id: 'old-output', status: 'success', clientRequestId: 'old-receipt', url: 'https://cdn.example/old.png' }] };
  const requests: { clientRequestId: string }[] = [];
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === 'generate_cloud_images') {
      const request = (args as { request: { clientRequestId: string } }).request;
      requests.push(request);
      return { images: Array.from({ length: 4 }, (_, index) => `https://cdn.example/native-${requests.length}-${index}.png`),
        provider: 'test', model: 'arbitrary-image', chargedCredits: '20' };
    }
    throw new Error(`Unexpected native command: ${command}`);
  });
  for (let click = 0; click < 2; click++) {
    handleCanvasAiRunClickImpl(scenario.control,
      scenario.event as unknown as Parameters<typeof handleCanvasAiRunClickImpl>[1], scenario.target.id);
    await Promise.all(scenario.pending);
  }
  expect(requests).toHaveLength(2);
  expect(new Set(requests.map(request => request.clientRequestId)).size).toBe(2);
  expect(requests.map(request => request.clientRequestId)).not.toContain('old-receipt');
  expect(vi.mocked(invoke).mock.calls.every(([command]) => command === 'generate_cloud_images')).toBe(true);
  expect(scenario.ref.current.slice(1).map(node => node.ai?.outputs?.[0].url)).toEqual([
    'https://cdn.example/native-1-0.png', 'https://cdn.example/native-2-0.png',
  ]);
});

it.each([
  ['gpt-image-2-5', 'max', true], ['gpt-image-2-5', 'max', false],
  ['gpt-image-2-5-sunburst', undefined, true], ['gpt-image-2-5-sunburst', undefined, false],
] as const)('preserves the canonical SKU, quality and staged references for %s (quality %s, reference %s)', async (model, quality, withReference) => {
  const actual = await vi.importActual<typeof import('../../canvasAiImage')>('../../canvasAiImage');
  vi.mocked(generateCanvasAiProviderImages).mockImplementation(actual.generateCanvasAiProviderImages);
  const { target, ctx, updateAi } = fixture('single_asset');
  const capabilities = { supportedQualities: quality ? ['high', 'xhigh', 'max'] : [], qualityParameter: 'quality',
    minReferenceImages: 0, maxReferenceImages: 9, supportsReferenceImages: true,
    resolutions: ['2k'], aspectRatios: ['16:9'], supportedOutputFormats: ['jpg'], maxOutputs: 4 };
  target.ai = { ...target.ai!, model, quality, resolution: '2k', aspectRatio: '16:9', outputFormat: 'jpg',
    providerCandidates: [{ source: 'wallet', provider: 'new-api', model: 'image2', canonicalModelId: model, modelCapabilities: capabilities }] };
  const references = withReference ? [{ id: 'reference', type: 'image' as const, content: '', createdAt: 0, path: 'reference.png' }] : [];
  target.inputs = references.map(item => item.id);
  ctx.canvasAiCloudImageModels = { provider: 'new-api', models: [model], catalog: [{ id: model, displayName: model, modality: 'image', capabilities }] };
  ctx.getCanvasImageInputBufferItemsForNode = () => references;
  ctx.getCanvasImageInputsForNode = (node, mode = 'stable', delivery = 'auto', sources = [], format = 'any', preference = 'cloudflared-first', portable = false, provider) => (
    getCanvasImageInputsForNodeImpl({
      canvasAiProvider: 'new-api', getCanvasAiErrorSummary: String,
      getCanvasImageInputBufferItemsForNode: () => references,
      prepareCanvasAiInputSource: async () => ({ source: 'data:image/png;base64,fixture', remoteFallback: undefined, usedRemoteFirst: false }),
      uploadWalletReferenceInputs: sources => uploadWalletReferenceInputsImpl({}, sources),
      uploadXaisReferenceInputs: vi.fn(), publishLocalAiInputs: vi.fn(), stopTemporaryReferenceShares: vi.fn(),
    }, node, mode, delivery, sources, format, preference, portable, provider)
  );
  vi.mocked(invoke).mockImplementation(async (command, args) => {
    if (command === 'upload_wallet_reference_images') return ['reference-images/fixture.png'];
    if (command === 'generate_cloud_images') {
      expect(args).toMatchObject({ request: { model, quality, inputImages: withReference ? ['reference-images/fixture.png'] : [] } });
      return { images: ['https://cdn.example/result.png'], chargedCredits: '20', provider: 'test', model };
    }
    throw new Error(`Unexpected native command: ${command}`);
  });
  const output = await runCanvasAiGeneratorTargetImpl(ctx, target, { updateAi, showResultToast: false });
  expect(output).toHaveLength(1);
  expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === 'generate_cloud_images')).toHaveLength(1);
  expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === 'upload_wallet_reference_images')).toHaveLength(withReference ? 1 : 0);
});

it('renders four working slots before one provider call while keeping its requested count at one', async () => {
  const { target, ctx, updateAi } = fixture();
  vi.mocked(generateCanvasAiProviderImages).mockImplementation(async options => {
    expect(options.count).toBe(1);
    expect(target.ai?.outputs).toHaveLength(4);
    expect(target.ai?.outputs?.every(output => output.clientRequestId === 'original-receipt')).toBe(true);
    return Array.from({ length: 4 }, (_, index) => `https://cdn.example/image-${index}.png`);
  });
  const outputs = await runCanvasAiGeneratorTargetImpl(ctx, target, { updateAi, clientRequestId: 'original-receipt', showResultToast: false });
  expect(generateCanvasAiProviderImages).toHaveBeenCalledTimes(1);
  expect(outputs).toHaveLength(4);
  expect(target.ai?.status).toBe('success');
  expect(target.ai?.outputs).toHaveLength(4);
});
it('does not turn a model maximum into a required output count when it returns fewer assets', async () => {
  const { target, ctx, updateAi } = fixture();
  vi.mocked(generateCanvasAiProviderImages).mockResolvedValue(['https://cdn.example/image.png']);
  await runCanvasAiGeneratorTargetImpl(ctx, target, { updateAi, showResultToast: false });
  expect(target.ai?.status).toBe('success');
  expect(target.ai?.outputs).toHaveLength(1);
});
it.each([2, 8, 16])('uses the published maximum of %i image slots independently of request count and maxOutputs', async maxOutputImages => {
  const { target, ctx, updateAi } = fixture('multiple_assets', maxOutputImages);
  vi.mocked(generateCanvasAiProviderImages).mockImplementation(async options => {
    expect(options.count).toBe(1);
    expect(target.ai?.outputs).toHaveLength(maxOutputImages);
    return Array.from({ length: maxOutputImages }, (_, index) => `https://cdn.example/image-${index}.png`);
  });
  const outputs = await runCanvasAiGeneratorTargetImpl(ctx, target, { updateAi, showResultToast: false });
  expect(outputs).toHaveLength(maxOutputImages);
  expect(generateCanvasAiProviderImages).toHaveBeenCalledTimes(1);
});
it('leaves an ordinary single-output model with one working slot and one provider request', async () => {
  const { target, ctx, updateAi } = fixture('single_asset');
  vi.mocked(generateCanvasAiProviderImages).mockImplementation(async () => {
    expect(target.ai?.outputs).toHaveLength(1);
    return ['https://cdn.example/image.png'];
  });
  const outputs = await runCanvasAiGeneratorTargetImpl(ctx, target, { updateAi, showResultToast: false });
  expect(generateCanvasAiProviderImages).toHaveBeenCalledTimes(1);
  expect(outputs).toHaveLength(1); expect(target.ai?.status).toBe('success');
});
it('retains a held request as recovery, without a failure toast or another submission', async () => {
  const { target, ctx, updateAi } = fixture();
  vi.mocked(generateCanvasAiProviderImages).mockRejectedValue(new Error('IMAGE_TASK_RECOVERY_REQUIRED: pending'));
  await runCanvasAiGeneratorTargetImpl(ctx, target, { updateAi, clientRequestId: 'original-receipt' });
  expect(target.ai?.status).toBe('recovery');
  expect(target.ai?.imageClientRequestId).toBe('original-receipt');
  expect(target.ai?.outputs?.every(output => output.status === 'recovery')).toBe(true);
  expect(ctx.notifyCanvasAiGenerationResult).not.toHaveBeenCalled();
  expect(generateCanvasAiProviderImages).toHaveBeenCalledTimes(1);
});
it('keeps two ordinary image jobs as separate one-image requests and preserves both results', async () => {
  const { target, ctx, updateAi } = fixture('single_asset');
  target.ai!.count = 2;
  let calls = 0;
  vi.mocked(generateCanvasAiProviderImages).mockImplementation(async options => {
    expect(options.count).toBe(1);
    return [`https://cdn.example/image-${++calls}.png`];
  });
  const outputs = await runCanvasAiGeneratorTargetImpl(ctx, target, { updateAi, clientRequestId: 'original-receipt', showResultToast: false });
  expect(generateCanvasAiProviderImages).toHaveBeenCalledTimes(2);
  expect(new Set(outputs.map(output => output.clientRequestId)).size).toBe(2);
  expect(outputs).toHaveLength(2); expect(target.ai?.status).toBe('success');
});

it.each(['success', 'failure'])('does not let a late initial generation %s replace a newer request', async outcome => {
  const { target, ctx, updateAi } = fixture();
  let completeOld!: (images: string[]) => void;
  let rejectOld!: (reason: Error) => void;
  let startedOld!: () => void;
  const oldStarted = new Promise<void>(resolve => { startedOld = resolve; });
  vi.mocked(generateCanvasAiProviderImages)
    .mockImplementationOnce(() => { startedOld(); return new Promise((resolve, reject) => { completeOld = resolve; rejectOld = reject; }); })
    .mockResolvedValueOnce(['https://cdn.example/new.png']);
  const old = runCanvasAiGeneratorTargetImpl(ctx, target, { updateAi, clientRequestId: 'old-request', showResultToast: false });
  await oldStarted;
  await runCanvasAiGeneratorTargetImpl(ctx, target, { updateAi, clientRequestId: 'new-request', showResultToast: false });
  if (outcome === 'success') completeOld(['https://cdn.example/old.png']);
  else rejectOld(new Error('old provider failed'));
  expect(await old).toEqual([]);
  expect(target.ai?.imageClientRequestId).toBe('new-request');
  expect(target.ai?.outputs?.map(output => output.sourceUrl)).toEqual(['https://cdn.example/new.png']);
  expect(ctx.addGeneratedImagesToDrawer).toHaveBeenCalledTimes(1);
});

it('creates a fresh receipt and output IDs for each completed generation', async () => {
  const { target, ctx, updateAi } = fixture();
  vi.mocked(generateCanvasAiProviderImages).mockResolvedValue(['https://cdn.example/image.png']);
  const first = await runCanvasAiGeneratorTargetImpl(ctx, target, { updateAi, showResultToast: false });
  const firstRequest = target.ai?.imageClientRequestId;
  const second = await runCanvasAiGeneratorTargetImpl(ctx, target, { updateAi, showResultToast: false });
  expect(target.ai?.imageClientRequestId).not.toBe(firstRequest);
  expect(second[0].id).not.toBe(first[0].id);
  expect(vi.mocked(generateCanvasAiProviderImages).mock.calls.map(([input]) => input.clientRequestId)).toEqual([firstRequest, target.ai?.imageClientRequestId]);
});
