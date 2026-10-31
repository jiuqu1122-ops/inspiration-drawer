import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { generateCanvasAiProviderImages } from '../../canvasAiImage';
import { runCanvasAiGeneratorTargetImpl } from './canvasGenerationActions';
import { createCanvasAiOutputDraftsImpl } from './canvasMediaActions';
import type { CanvasImageItem } from '../../canvasModel';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: (path: string) => `asset://${path}` }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('../../drawerPrefs', () => ({ MIN_DRAWER_WIDTH: 880, MAX_DRAWER_WIDTH: 1920, MIN_DRAWER_HEIGHT: 560, MAX_DRAWER_HEIGHT: 1080 }));
vi.mock('../../canvasAiImage', async original => ({ ...await original<object>(), generateCanvasAiProviderImages: vi.fn() }));
beforeEach(() => {
  vi.mocked(generateCanvasAiProviderImages).mockReset();
  vi.mocked(invoke).mockReset();
  vi.stubGlobal('window', { setTimeout, clearTimeout, performance: { now: () => 0 } });
  vi.stubGlobal('localStorage', { getItem: () => null });
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function fixture(model = 'gpt-image-2.5', count = 6, remoteReferences = false) {
  // Six permitted jobs, not six assets in one POST. No provider/network is invoked.
  const capabilities = { outputMode: 'single_asset' as const, maxOutputImages: 1, maxOutputs: count,
    resolutions: ['2k'], aspectRatios: ['1:1'], supportedOutputFormats: ['jpg'] };
  const target: CanvasImageItem = { id: 'node', x: 0, y: 0, width: 600, height: 500,
    item: { id: 'asset', type: 'text', content: 'A landscape', createdAt: 0 },
    ai: { type: 'image-generator', count, provider: 'new-api', model, resolution: '2k', aspectRatio: '1:1',
      providerCandidates: [{ source: 'wallet', provider: 'new-api', model, canonicalModelId: model, modelCapabilities: capabilities }] } };
  let sequence = 0;
  const prepareInputs = vi.fn(async () => ({ images: remoteReferences ? ['https://cdn.example/reference.png'] : [],
    videos: [], audios: [], temporaryShareIds: [], usedRemoteFirst: remoteReferences }));
  const ctx = {
    canvasItemsRef: { current: [target] }, activeCanvasIdRef: { current: 'canvas' }, canvasesRef: { current: [] },
    canvasAiCredentialSource: 'wallet', canvasAiProvider: 'new-api', canvasAiUnifiedImageModelOptions: [],
    canvasAiCloudImageModels: { catalog: [{ id: model, displayName: model, modality: 'image', capabilities }] },
    canvasAiApiKey: '', canvasAiNewApiVideoKey: '', canvasAiEndpoint: '', canvasAiHeadersText: '{}',
    getCanvasAiResolvedModel: (_provider: string, value: string) => value,
    getCanvasTextInputsForNode: () => [], getCanvasImageInputBufferItemsForNode: () => [],
    getCanvasImageInputsForNode: prepareInputs,
    createCanvasAiOutputDrafts: (node: CanvasImageItem, prompt: string, id?: string) => createCanvasAiOutputDraftsImpl({ createAssetId: () => `${++sequence}-0-0-0-0` }, node, prompt, id),
    getCanvasAiErrorSummary: (message: string) => message,
    pushDrawerUndoSnapshot: vi.fn(), addGeneratedImagesToDrawer: vi.fn(), refreshCloudAccount: vi.fn(async () => undefined),
    showToast: vi.fn(), notifyCanvasAiGenerationResult: vi.fn(),
  } as unknown as Parameters<typeof runCanvasAiGeneratorTargetImpl>[0];
  const updateAi = vi.fn(patch => { Object.assign(target.ai!, patch); });
  return { target, ctx, updateAi, prepareInputs };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('GPT Image client job concurrency', () => {
  it.each(['gpt-image-2', 'gpt-image-2.5', 'gpt-image-medium'])(
    'starts all six real %s slots before any finishes, with one request and receipt per job', async model => {
      const { target, ctx, updateAi } = fixture(model);
      const jobs = Array.from({ length: 6 }, () => deferred<string[]>());
      let started = 0;
      vi.mocked(generateCanvasAiProviderImages).mockImplementation(() => jobs[started++].promise);
      const pending = runCanvasAiGeneratorTargetImpl(ctx, target, { updateAi, clientRequestId: 'six-slots', showResultToast: false });
      try {
        await vi.waitFor(() => expect(started).toBe(6));
        expect(target.ai?.outputs).toHaveLength(6);
        expect(target.ai?.outputs?.every(output => output.status === 'working')).toBe(true);
        expect(vi.mocked(generateCanvasAiProviderImages).mock.calls.map(([options]) => options.count)).toEqual([1, 1, 1, 1, 1, 1]);
        expect(vi.mocked(generateCanvasAiProviderImages).mock.calls.map(([options]) => options.clientRequestId))
          .toEqual(Array.from({ length: 6 }, (_, index) => `six-slots:slot:${index + 1}`));
      } finally {
        jobs.forEach((job, index) => job.resolve([`https://cdn.example/image-${index}.png`]));
        await pending;
      }
      expect(target.ai?.status).toBe('success');
      expect(target.ai?.outputs?.map(output => output.clientRequestId))
        .toEqual(Array.from({ length: 6 }, (_, index) => `six-slots:slot:${index + 1}`));
      expect(generateCanvasAiProviderImages).toHaveBeenCalledTimes(6);
    },
  );

  it('reaches six native cloud POST boundaries before any returns, independently of per-request count', async () => {
    const actual = await vi.importActual<typeof import('../../canvasAiImage')>('../../canvasAiImage');
    vi.mocked(generateCanvasAiProviderImages).mockImplementation(actual.generateCanvasAiProviderImages);
    const { target, ctx, updateAi } = fixture();
    const posts = Array.from({ length: 6 }, () => deferred<{ images: string[] }>());
    let submitted = 0;
    vi.mocked(invoke).mockImplementation(async command => {
      if (command === 'generate_cloud_images') return posts[submitted++].promise;
      throw new Error(`Unexpected IPC command: ${command}`);
    });
    const pending = runCanvasAiGeneratorTargetImpl(ctx, target, { updateAi, clientRequestId: 'native-six-slots', showResultToast: false });
    try {
      await vi.waitFor(() => expect(submitted).toBe(6));
      expect(vi.mocked(invoke).mock.calls.map(([, args]) => (args as { request: { count: number } }).request.count))
        .toEqual([1, 1, 1, 1, 1, 1]);
    } finally {
      posts.forEach((post, index) => post.resolve({ images: [`https://cdn.example/native-${index}.png`] }));
      await pending;
    }
    expect(target.ai?.status).toBe('success');
    expect(invoke).toHaveBeenCalledTimes(6);
  });

  it('discards active-slot completions after cancellation invalidates the request', async () => {
    const { target, ctx, updateAi } = fixture();
    const gate = deferred<string[]>();
    vi.mocked(generateCanvasAiProviderImages).mockImplementation(() => gate.promise);
    const pending = runCanvasAiGeneratorTargetImpl(ctx, target, { updateAi, clientRequestId: 'cancelled-request', showResultToast: false });
    await vi.waitFor(() => expect(generateCanvasAiProviderImages).toHaveBeenCalledTimes(6));
    // Deleting the generator is an existing cancellation/invalidation path.
    ctx.canvasItemsRef.current = [];
    const updates = updateAi.mock.calls.length;
    gate.resolve(['https://cdn.example/late.png']);
    expect(await pending).toEqual([]);
    expect(updateAi.mock.calls).toHaveLength(updates);
    expect(ctx.addGeneratedImagesToDrawer).not.toHaveBeenCalled();
    expect(generateCanvasAiProviderImages).toHaveBeenCalledTimes(6);
  });

  it.each(['HTTP 429: rate limit exceeded', 'provider_request_failed: upstream error (429): concurrency exceeded',
    'IMAGE_TASK_RECOVERY_REQUIRED: accepted task needs confirmation', 'AMBIGUOUS_SUBMIT: request already sent'])(
    'does not resubmit any of six independent jobs after %s', async message => {
      const { target, ctx, updateAi, prepareInputs } = fixture('gpt-image-2.5', 6, true);
      vi.mocked(generateCanvasAiProviderImages).mockRejectedValue(new Error(message));
      await runCanvasAiGeneratorTargetImpl(ctx, target, { updateAi, clientRequestId: 'failure-slots', showResultToast: false });
      expect(generateCanvasAiProviderImages).toHaveBeenCalledTimes(6);
      expect(new Set(vi.mocked(generateCanvasAiProviderImages).mock.calls.map(([options]) => options.clientRequestId)).size).toBe(6);
      expect(prepareInputs).toHaveBeenCalledTimes(1);
      expect(ctx.addGeneratedImagesToDrawer).not.toHaveBeenCalled();
      expect(target.ai?.error).toContain(message);
    },
  );
});
