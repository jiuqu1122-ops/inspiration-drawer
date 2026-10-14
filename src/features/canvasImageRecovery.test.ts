import { beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { canvasImageOutputPlan } from './canvasImageOutputPlan';
import { canvasImageNeedsRecovery, recoverCanvasImageOutputs } from './canvasImageRecovery';
import type { CanvasImageItem } from './canvasModel';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: (path: string) => `asset://${path}` }));
beforeEach(() => { vi.mocked(invoke).mockReset(); });
const target: CanvasImageItem = { id: 'node', x: 0, y: 0, width: 600, height: 500,
  item: { id: 'asset', type: 'text', content: 'Prompt', createdAt: 0 },
  ai: { type: 'image-generator', count: 1, status: 'recovery', imageClientRequestId: 'original-receipt',
    outputs: [{ id: 'draft', clientRequestId: 'original-receipt', status: 'recovery' }] } };
const options = () => ({ updateAi: vi.fn(), showToast: vi.fn(), refreshCloudAccount: vi.fn(async () => undefined),
  addGeneratedImagesToDrawer: vi.fn(), cacheCanvasGeneratedImageSource: vi.fn(async () => ({ path: 'cached.png' })) });

it('shows four output slots for one configured multiasset job and leaves ordinary counts unchanged', () => {
  expect(canvasImageOutputPlan({ count: 1 }, { maxOutputs: 4, maxOutputImages: 4, outputMode: 'multiple_assets' })).toEqual({ requestCount: 1, outputCount: 4 });
  expect(canvasImageOutputPlan({ count: 2 }, { maxOutputs: 4, maxOutputImages: 4, outputMode: 'single_asset' })).toEqual({ requestCount: 2, outputCount: 2 });
});
it('recovers a legacy confirmation error while ordinary provider failures still permit generation', () => {
  expect(canvasImageNeedsRecovery({ type: 'image-generator', status: 'error', error: 'IMAGE_TASK_RECOVERY_REQUIRED: pending' })).toBe(true);
  expect(canvasImageNeedsRecovery({ type: 'image-generator', status: 'error', error: 'HTTP 400' })).toBe(false);
  expect(canvasImageNeedsRecovery({ type: 'image-generator', status: 'error', error: 'IMAGE_TASK_RECOVERY_REQUIRED',
    outputs: [{ id: 'a', clientRequestId: 'job-a' }, { id: 'b', clientRequestId: 'job-b' }] })).toBe(false);
});
it('restores all four images with only the original ID, never invoking generation', async () => {
  const images = Array.from({ length: 4 }, (_, index) => `https://cdn.example/image-${index}.png`);
  vi.mocked(invoke).mockResolvedValue({ status: 'succeeded', images, chargedCredits: '20' });
  const opts = options();
  const outputs = await recoverCanvasImageOutputs(target, opts);
  expect(outputs.map(output => output.url)).toEqual(images);
  expect(invoke).toHaveBeenCalledExactlyOnceWith('recover_cloud_image_generation', { clientRequestId: 'original-receipt' });
  expect(opts.updateAi).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'success', imageExpectedOutputCount: 4 }));
  expect(opts.addGeneratedImagesToDrawer.mock.calls[0]?.[0]).toHaveLength(4);
});
it('retains the ID and recovery state if the original task still cannot be read', async () => {
  vi.mocked(invoke).mockRejectedValue(new Error('IMAGE_TASK_RECOVERY_REQUIRED: unavailable'));
  const opts = options();
  expect(await recoverCanvasImageOutputs(target, opts)).toEqual([]);
  expect(opts.updateAi).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'recovery', outputs: target.ai?.outputs }));
  expect(opts.addGeneratedImagesToDrawer).not.toHaveBeenCalled();
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('does not replace a newer generation when an older recovery finishes late', async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(invoke).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  let latest = structuredClone(target);
  const opts = { ...options(), getLatestTarget: () => latest };
  const pending = recoverCanvasImageOutputs(target, opts);
  latest = { ...latest, ai: { ...latest.ai!, imageClientRequestId: 'new-request', status: 'working',
    outputs: [{ id: 'new-output', clientRequestId: 'new-request', status: 'working' }] } };
  finish({ status: 'succeeded', images: ['https://cdn.example/old.png'] });
  expect(await pending).toEqual([]);
  expect(opts.updateAi).toHaveBeenCalledTimes(1);
  expect(opts.addGeneratedImagesToDrawer).not.toHaveBeenCalled();
});

it('does not restore an older error after another generation starts', async () => {
  let reject!: (reason: Error) => void;
  vi.mocked(invoke).mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
  let latest = structuredClone(target);
  const opts = { ...options(), getLatestTarget: () => latest };
  const pending = recoverCanvasImageOutputs(target, opts);
  latest = { ...latest, ai: { ...latest.ai!, imageClientRequestId: 'new-request', status: 'working' } };
  reject(new Error('old recovery failed'));
  expect(await pending).toEqual([]);
  expect(opts.updateAi).toHaveBeenCalledTimes(1);
  expect(opts.showToast).not.toHaveBeenCalled();
});

it('checks the request again after downloading recovered images locally', async () => {
  vi.mocked(invoke).mockResolvedValue({ status: 'succeeded', images: ['https://cdn.example/old.png'] });
  let finish!: (value: { path: string }) => void;
  let latest = structuredClone(target);
  const opts = { ...options(), requireLocalImageOutputs: true, getLatestTarget: () => latest,
    cacheCanvasGeneratedImageSource: vi.fn(() => new Promise<{ path: string }>(resolve => { finish = resolve; })) };
  const pending = recoverCanvasImageOutputs(target, opts);
  await Promise.resolve();
  expect(opts.cacheCanvasGeneratedImageSource).toHaveBeenCalledOnce();
  latest = { ...latest, ai: { ...latest.ai!, imageClientRequestId: 'new-request', status: 'working' } };
  finish({ path: 'old.png' });
  expect(await pending).toEqual([]);
  expect(opts.updateAi).toHaveBeenCalledTimes(1);
  expect(opts.addGeneratedImagesToDrawer).not.toHaveBeenCalled();
});
