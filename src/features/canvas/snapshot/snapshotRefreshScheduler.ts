/** Coalesce cache-ready notifications and hold scene replacement until the live zoom settles. */
export const createSnapshotRefreshScheduler = (
  shouldDefer: () => boolean,
  publish: () => void,
  delayMs = 80,
) => {
  let timer: number | null = null;
  let frame: number | null = null;
  let pending = false;
  let disposed = false;
  const schedule = () => {
    timer = setTimeout(() => {
      timer = null;
      if (disposed || !pending) return;
      if (shouldDefer()) { schedule(); return; }
      frame = requestAnimationFrame(() => {
        frame = null;
        if (disposed || !pending) return;
        pending = false;
        publish();
      });
    }, delayMs);
  };
  return {
    request() {
      if (disposed) return;
      pending = true;
      if (timer === null && frame === null) schedule();
    },
    dispose() {
      disposed = true;
      pending = false;
      if (timer !== null) clearTimeout(timer);
      if (frame !== null) cancelAnimationFrame(frame);
      timer = null;
      frame = null;
    },
  };
};
