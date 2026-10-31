import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke, convertFileSrc: (path: string) => `asset://${path}`, isTauri: () => true }));
import { generateCanvasAiProviderImages } from './canvasAiImage';

const generate = () => generateCanvasAiProviderImages({
  cloudWallet: true, provider: 'new-api', apiKey: '', model: 'seedream-5.0-pro', prompt: 'fixture',
  clientRequestId: 'image-failure-fixture', count: 1,
});
const postCount = () => invoke.mock.calls.filter(call => call[0] === 'generate_cloud_images').length;
const getCount = () => invoke.mock.calls.filter(call => call[0] === 'get_cloud_image_generation_by_request').length;

beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('window', { setTimeout, clearTimeout }); invoke.mockReset();
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('cloud image terminal failure delivery', () => {
  it.each(['failed', 'refunded', 'cancelled'])('settles %s from lookup even while the original POST is still pending', async status => {
    invoke.mockImplementation(async command => command === 'generate_cloud_images'
      ? new Promise(() => {}) : { status, images: [], error: { message: '参考图片被渠道安全策略拒绝' } });
    let failure: unknown;
    void generate().catch(error => { failure = error; });
    await vi.advanceTimersByTimeAsync(1_200);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain('参考图片被渠道安全策略拒绝');
    await vi.advanceTimersByTimeAsync(180_000);
    expect(postCount()).toBe(1); expect(getCount()).toBe(1);
  });

  it('immediately rejects an explicit upstream 400 URL policy error without recovery delays', async () => {
    invoke.mockRejectedValue(new Error('provider_request_failed: upstream error: 400 message=Image URL is blocked'));
    let failure: unknown; void generate().catch(error => { failure = error; });
    await vi.advanceTimersByTimeAsync(0);
    expect((failure as Error).message).toContain('Image URL is blocked');
    await vi.advanceTimersByTimeAsync(180_000);
    expect(postCount()).toBe(1); expect(getCount()).toBe(0);
  });

  it('does not start another recovery window after a lookup confirms a failed task', async () => {
    invoke.mockImplementation(async command => {
      if (command === 'generate_cloud_images') throw new Error('HTTP 502 gateway failure');
      return { status: 'failed', images: [], error: { message: '渠道拒绝参考图片 URL' } };
    });
    let failure: unknown; void generate().catch(error => { failure = error; });
    await vi.advanceTimersByTimeAsync(1_200);
    expect((failure as Error).message).toContain('渠道拒绝参考图片 URL');
    await vi.advanceTimersByTimeAsync(180_000);
    expect(postCount()).toBe(1); expect(getCount()).toBe(1);
  });

  it('surfaces manual confirmation while keeping the accepted request available and never resubmitting', async () => {
    invoke.mockImplementation(async command => command === 'generate_cloud_images'
      ? new Promise(() => {}) : { status: 'processing', images: [], confirmationRequired: true, recoveryStatus: 'manual_confirmation_required' });
    let failure: unknown; void generate().catch(error => { failure = error; });
    await vi.advanceTimersByTimeAsync(1_200);
    expect((failure as Error).message).toContain('IMAGE_TASK_RECOVERY_REQUIRED');
    await vi.advanceTimersByTimeAsync(180_000);
    expect(postCount()).toBe(1); expect(getCount()).toBe(1);
  });

  it('recovers usable results and stops polling when a pending POST has already delivered through lookup', async () => {
    invoke.mockImplementation(async command => {
      if (command === 'generate_cloud_images') return new Promise(() => {});
      return getCount() === 1 ? { status: 'processing', images: [] } : { status: 'succeeded', images: ['https://fixture.example/result.png'] };
    });
    const result = generate(); await vi.advanceTimersByTimeAsync(3_700);
    await expect(result).resolves.toEqual(['https://fixture.example/result.png']);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(postCount()).toBe(1); expect(getCount()).toBe(2);
  });

  it('retains usable partial images from a failed task', async () => {
    invoke.mockImplementation(async command => command === 'generate_cloud_images'
      ? new Promise(() => {}) : { status: 'failed', images: ['https://fixture.example/partial.png'] });
    const result = generate(); await vi.advanceTimersByTimeAsync(1_200);
    await expect(result).resolves.toEqual(['https://fixture.example/partial.png']);
    expect(postCount()).toBe(1);
  });

  it('preserves late 504 read-side recovery after the first window expires', async () => {
    invoke.mockImplementation(async command => {
      if (command === 'generate_cloud_images') return new Promise((_, reject) => setTimeout(() => reject(new Error('HTTP 504 gateway timeout')), 120_000));
      return Date.now() >= started + 120_000
        ? { status: 'succeeded', images: ['https://fixture.example/recovered.png'] } : { status: 'processing', images: [] };
    });
    const started = Date.now(); const result = generate();
    await vi.advanceTimersByTimeAsync(123_000);
    await expect(result).resolves.toEqual(['https://fixture.example/recovered.png']);
    expect(postCount()).toBe(1);
  });
});
