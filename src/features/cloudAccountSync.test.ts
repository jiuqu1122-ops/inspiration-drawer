import { describe, expect, it, vi } from 'vitest';
import {
  CLOUD_ACCOUNT_CACHE_KEY,
  createSingleFlight,
  getCloudSyncRetryDelayMs,
  readCachedCloudAccount,
  writeCachedCloudAccount,
} from './cloudAccountSync';

const account = {
  email: 'designer@example.com',
  displayName: 'Designer',
  wallet: {
    availableCredits: '123',
    reservedCredits: '4',
    lifetimeGranted: '500',
    lifetimeConsumed: '373',
  },
};

describe('cloud account synchronization safeguards', () => {
  it('coalesces five concurrent sync callers into one request', async () => {
    let calls = 0;
    let resolveRequest!: (value: typeof account) => void;
    const request = new Promise<typeof account>(resolve => { resolveRequest = resolve; });
    const sync = createSingleFlight(async () => {
      calls += 1;
      return request;
    });

    const callers = Array.from({ length: 5 }, () => sync());
    expect(calls).toBe(1);
    resolveRequest(account);
    await expect(Promise.all(callers)).resolves.toEqual(Array.from({ length: 5 }, () => account));
    expect(calls).toBe(1);
  });

  it('allows a later refresh after the previous flight settles', async () => {
    const sync = createSingleFlight(async () => 'ok');
    await expect(sync()).resolves.toBe('ok');
    await expect(sync()).resolves.toBe('ok');
  });

  it('uses Retry-After when present and never retries immediately', () => {
    expect(getCloudSyncRetryDelayMs(0, 0)).toBe(5_000);
    expect(getCloudSyncRetryDelayMs(0, 2_000)).toBe(2_000);
    expect(getCloudSyncRetryDelayMs(1, 600_000)).toBe(300_000);
    expect(getCloudSyncRetryDelayMs(3, null)).toBe(60_000);
  });

  it('keeps and restores the last successful wallet snapshot', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    writeCachedCloudAccount(account, storage);
    expect(values.has(CLOUD_ACCOUNT_CACHE_KEY)).toBe(true);
    expect(readCachedCloudAccount(storage)).toEqual(account);
  });

  it('ignores malformed cached wallet data', () => {
    const getItem = vi.fn(() => JSON.stringify({ wallet: { availableCredits: 123 } }));
    expect(readCachedCloudAccount({ getItem })).toBeNull();
  });
});
