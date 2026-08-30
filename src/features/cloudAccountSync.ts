import type { CloudAccountSummary } from '../types/license';

export const CLOUD_ACCOUNT_CACHE_KEY = 'drawer_cloud_account_last_success_v1';

export const CLOUD_SYNC_BACKOFF_MS = [5_000, 15_000, 30_000, 60_000] as const;

export function getCloudSyncRetryDelayMs(
  retryIndex: number,
  retryAfterMs?: number | null,
) {
  if (Number.isFinite(retryAfterMs) && (retryAfterMs || 0) > 0) {
    return Math.min(Math.max(retryAfterMs!, 1_000), 300_000);
  }
  return CLOUD_SYNC_BACKOFF_MS[Math.min(Math.max(retryIndex, 0), CLOUD_SYNC_BACKOFF_MS.length - 1)]!;
}

export function createSingleFlight<T>(runner: () => Promise<T>) {
  let inFlight: Promise<T> | null = null;

  return () => {
    if (inFlight) return inFlight;
    let started: Promise<T>;
    try {
      started = runner();
    } catch (error) {
      started = Promise.reject(error);
    }
    const settled = started.finally(() => {
      if (inFlight === settled) inFlight = null;
    });
    inFlight = settled;
    return settled;
  };
}

function isCloudAccountSummary(value: unknown): value is CloudAccountSummary {
  if (!value || typeof value !== 'object') return false;
  const account = value as Partial<CloudAccountSummary>;
  const wallet = account.wallet;
  if (!wallet || typeof wallet !== 'object') return false;
  return [
    wallet.availableCredits,
    wallet.reservedCredits,
    wallet.lifetimeGranted,
    wallet.lifetimeConsumed,
  ].every(item => typeof item === 'string');
}

export function readCachedCloudAccount(
  storage: Pick<Storage, 'getItem'> | undefined = typeof localStorage === 'undefined' ? undefined : localStorage,
) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(CLOUD_ACCOUNT_CACHE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isCloudAccountSummary(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCachedCloudAccount(
  account: CloudAccountSummary,
  storage: Pick<Storage, 'setItem'> | undefined = typeof localStorage === 'undefined' ? undefined : localStorage,
) {
  if (!storage || !isCloudAccountSummary(account)) return;
  try {
    storage.setItem(CLOUD_ACCOUNT_CACHE_KEY, JSON.stringify(account));
  } catch {
    // A full or restricted localStorage must not break account synchronization.
  }
}

export function clearCachedCloudAccount(
  storage: Pick<Storage, 'removeItem'> | undefined = typeof localStorage === 'undefined' ? undefined : localStorage,
) {
  try {
    storage?.removeItem(CLOUD_ACCOUNT_CACHE_KEY);
  } catch {
    // A restricted localStorage must not block logout.
  }
}
