import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDebouncedCloudAccountRefresh } from './cloudAccountQuotaRefresh';

describe('cloud account quota refresh scheduling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes once after a completed LLM settlement', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = createDebouncedCloudAccountRefresh(refresh, 350);

    scheduler.schedule();
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(350);
    expect(refresh).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });

  it('debounces concurrent LLM settlement completions into one account refresh', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn().mockResolvedValue(undefined);
    const scheduler = createDebouncedCloudAccountRefresh(refresh, 350);

    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(100);
    scheduler.schedule();
    scheduler.schedule();
    await vi.advanceTimersByTimeAsync(349);
    expect(refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });
});
