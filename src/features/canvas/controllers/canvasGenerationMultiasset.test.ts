import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { generateCanvasAiProviderImages } from '../../canvasAiImage';
import { runCanvasAiGeneratorTargetImpl } from './canvasGenerationActions';
import { createCanvasAiOutputDraftsImpl } from './canvasMediaActions';
import type { CanvasImageItem } from '../../canvasModel';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => undefined), convertFileSrc: (path: string) => `asset://${path}` }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('../../canvasAiImage', async original => ({ ...await original<object>(), generateCanvasAiProviderImages: vi.fn() }));
beforeEach(() => {
  vi.mocked(generateCanvasAiProviderImages).mockReset();
  vi.stubGlobal('window', { setTimeout, clearTimeout });
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
