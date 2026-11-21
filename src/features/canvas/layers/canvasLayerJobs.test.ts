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
