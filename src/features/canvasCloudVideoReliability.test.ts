import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { generateCanvasAiProviderVideos, isCloudWalletVideoRequestWatched } from './canvasAiImage';
import { getRecoveredVideoTask, waitForWalletVideoRequest, WalletVideoRecoveryPendingError } from './cloudVideoTasks';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
const walletInvoke = vi.mocked(invoke);
const url = (name: string) => `https://api.unmind.art/v1/ai/video-results/${name}.mp4`;
const options = {
  apiKey: '',
  provider: 'minimax' as const,
  cloudWallet: true,
  model: 'MiniMax-H3',
  prompt: 'test',
  clientRequestId: 'video-client-recovery-1',
  count: 2,
};
const task = (outputIndex: number, status: 'processing' | 'succeeded') => ({
  taskId: `task-${outputIndex}`, outputIndex, status, resultUrl: status === 'succeeded' ? url(`out-${outputIndex}`) : null,
});
const request = (status: 'processing' | 'succeeded') => ({
  requestId: 'internal-request', clientRequestId: options.clientRequestId, status,
  tasks: [task(1, status), task(0, status)],
});

beforeEach(() => { vi.stubGlobal('window', globalThis); });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  walletInvoke.mockReset();
});

describe('wallet video receipts', () => {
  it('recovers a timed-out submit by its original ID without submitting again', async () => {
    vi.useFakeTimers();
    walletInvoke.mockRejectedValueOnce('cloud_unavailable: POST timeout')
      .mockRejectedValueOnce('video_request_not_found: still committing')
      .mockResolvedValueOnce(request('processing'))
      .mockResolvedValueOnce(request('succeeded'));
    const output = generateCanvasAiProviderVideos(options);
    expect(isCloudWalletVideoRequestWatched(options.clientRequestId)).toBe(true);
    const result = expect(output).resolves.toEqual([url('out-0'), url('out-1')]);
    await vi.runAllTimersAsync();
    await result;
    expect(walletInvoke.mock.calls.map(([command]) => command)).toEqual([
      'generate_cloud_videos', 'get_cloud_video_by_request', 'get_cloud_video_by_request', 'get_cloud_video_by_request',
    ]);
    expect(walletInvoke).toHaveBeenLastCalledWith('get_cloud_video_by_request', { clientRequestId: options.clientRequestId });
    expect(isCloudWalletVideoRequestWatched(options.clientRequestId)).toBe(false);
  });

  it('lets multiple video tasks from an older backend poll independently', async () => {
    vi.useFakeTimers();
    let resolveFirst!: (value: unknown) => void;
    const waiting = new Promise(resolve => { resolveFirst = resolve; });
    walletInvoke.mockImplementation(async (command, params) => {
      if (command === 'generate_cloud_videos') return {
        results: [{ task_id: 'first', status: 'processing' }, { task_id: 'second', status: 'processing' }],
      };
      const { taskId } = params as { taskId: string };
      if (taskId === 'first') return waiting;
      return { task_id: 'second', status: 'succeeded', result_url: url('second') };
    });
    const output = generateCanvasAiProviderVideos(options);
    const result = expect(output).resolves.toEqual([url('first'), url('second')]);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(walletInvoke.mock.calls.filter(([command]) => command === 'get_cloud_video_status')).toHaveLength(2);
    resolveFirst({ task_id: 'first', status: 'succeeded', result_url: url('first') });
    await result;
  });

  it('maps a reopened canvas slot to its own task even when task order differs', () => {
    expect(getRecoveredVideoTask(request('succeeded'), '', 0)?.resultUrl).toBe(url('out-0'));
    expect(getRecoveredVideoTask(request('succeeded'), 'task-1', 0)?.resultUrl).toBe(url('out-1'));
    expect(getRecoveredVideoTask(request('succeeded'), '', 2)).toBeUndefined();
  });

  it('leaves ambiguous requests recoverable after the local wait deadline', async () => {
    let now = 0;
    const lookup = vi.fn(async () => request('processing'));
    await expect(waitForWalletVideoRequest({
      lookup, now: () => now, deadline: 4_000, wait: async ms => { now += ms; },
    })).rejects.toBeInstanceOf(WalletVideoRecoveryPendingError);
    expect(now).toBe(4_000);
    expect(lookup).toHaveBeenCalledOnce();
  });
});
