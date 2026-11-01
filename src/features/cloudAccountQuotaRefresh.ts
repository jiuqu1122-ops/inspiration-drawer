export const CLOUD_ACCOUNT_QUOTA_REFRESH_DEBOUNCE_MS = 350;

export function createDebouncedCloudAccountRefresh(
  refresh: () => Promise<unknown>,
  delayMs = CLOUD_ACCOUNT_QUOTA_REFRESH_DEBOUNCE_MS,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const schedule = () => {
    if (disposed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void refresh().catch(() => {
        // Silent account refresh failures retain the last successful cache.
      });
    }, Math.max(0, delayMs));
  };

  const dispose = () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  return { schedule, dispose };
}

let cloudAccountRefreshHandler: (() => Promise<unknown>) | null = null;
const accountQuotaRefreshScheduler = createDebouncedCloudAccountRefresh(() => (
  cloudAccountRefreshHandler ? cloudAccountRefreshHandler() : Promise.resolve()
));

export const scheduleCloudAccountQuotaRefresh = () => {
  accountQuotaRefreshScheduler.schedule();
};

export const setCloudAccountQuotaRefreshHandler = (handler: () => Promise<unknown>) => {
  cloudAccountRefreshHandler = handler;
  return () => {
    if (cloudAccountRefreshHandler === handler) cloudAccountRefreshHandler = null;
  };
};
