import { afterEach, expect, it, vi } from 'vitest';
import { lookupLayer, submitLayer } from './canvasLayerApi';
import { followLayerJob } from './canvasLayerJobs';
import type { LayerReceipt } from './canvasLayerTypes';

vi.mock('./canvasLayerApi', () => ({ lookupLayer: vi.fn(), submitLayer: vi.fn() }));

afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

const receipt: LayerReceipt = {
  status: 'success', chargedCredits: '8', result: {
    operation: 'edit', assets: ['https://example.test/result.png'],
    image: { asset: 0, width: 640, height: 480, alpha: true, transparent: true },
  },
};

it('keeps following a slow split on the same request and stops at the two-hour deadline', async () => {
  vi.useFakeTimers();
  const lookup = vi.mocked(lookupLayer).mockResolvedValue({ status: 'processing' });
  const complete = vi.fn().mockResolvedValue(undefined);
  const pending = vi.fn();
  const requestId = 'canvas-layer-long-split';
  const run = followLayerJob(requestId, undefined, complete, pending);
  await vi.advanceTimersByTimeAsync(110 * 60_000);
  expect(pending).not.toHaveBeenCalled();
  expect(complete).not.toHaveBeenCalled();
  const reads = lookup.mock.calls.length;
  await vi.advanceTimersByTimeAsync(60_000);
  expect(lookup.mock.calls.length - reads).toBe(6);
  await vi.advanceTimersByTimeAsync(9 * 60_000);
  await run;
  expect(pending).toHaveBeenCalledOnce();
  expect(submitLayer).not.toHaveBeenCalled();
  lookup.mockResolvedValue(receipt);
  await followLayerJob(requestId, undefined, complete, pending);
  expect(complete).toHaveBeenCalledExactlyOnceWith(receipt);
  expect(lookup).toHaveBeenLastCalledWith(requestId);
});

it('automatically applies an edit that becomes available twenty minutes after a single submission', async () => {
  vi.useFakeTimers();
  const readyAt = Date.now() + 20 * 60_000;
  vi.mocked(submitLayer).mockResolvedValue({ status: 'processing' });
  vi.mocked(lookupLayer).mockImplementation(async () => Date.now() >= readyAt ? receipt : { status: 'processing' });
  const complete = vi.fn().mockResolvedValue(undefined);
  const pending = vi.fn();
  const requestId = 'canvas-layer-slow-edit';
  const run = followLayerJob(requestId, async () => ({
    operation: 'edit', clientRequestId: requestId, image: 'image', prompt: 'edit', expectedCredits: '8',
  }), complete, pending);
  await vi.advanceTimersByTimeAsync(20 * 60_000);
  await run;
  expect(complete).toHaveBeenCalledExactlyOnceWith(receipt);
  expect(pending).not.toHaveBeenCalled();
  expect(submitLayer).toHaveBeenCalledOnce();
  expect(lookupLayer).toHaveBeenLastCalledWith(requestId);
});

it('reports a cache failure immediately and lets the original request be recovered without submitting again', async () => {
  vi.useFakeTimers();
  vi.mocked(lookupLayer).mockResolvedValue(receipt);
  const complete = vi.fn().mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValueOnce(undefined);
  const pending = vi.fn();
  const requestId = 'canvas-layer-cache-recovery';

  const first = followLayerJob(requestId, undefined, complete, pending);
  await vi.runAllTimersAsync();
  await first;

  expect(lookupLayer).toHaveBeenCalledExactlyOnceWith(requestId);
  expect(complete).toHaveBeenCalledExactlyOnceWith(receipt);
  expect(pending).toHaveBeenCalledExactlyOnceWith('结果暂未保存，可重新查询。Failed to fetch');

  await followLayerJob(requestId, undefined, complete, pending);

  expect(lookupLayer).toHaveBeenCalledTimes(2);
  expect(lookupLayer).toHaveBeenLastCalledWith(requestId);
  expect(complete).toHaveBeenCalledTimes(2);
  expect(pending).toHaveBeenCalledTimes(1);
  expect(submitLayer).not.toHaveBeenCalled();
});
