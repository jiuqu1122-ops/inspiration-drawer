/** Shared bounded queue: effect restarts cannot multiply concurrent decoders. */
export const createCanvasBackgroundQueue = (concurrency = 2) => {
  const limit = Math.max(1, Math.floor(concurrency) || 1);
  let active = 0;
  const pending: Array<() => void> = [];
  const drain = () => {
    while (active < limit && pending.length) {
      active += 1;
      pending.shift()!();
    }
  };
  return <T>(task: () => Promise<T>): Promise<T> => new Promise<T>((resolve, reject) => {
    pending.push(() => {
      Promise.resolve().then(task).then(resolve, reject).finally(() => { active -= 1; drain(); });
    });
    drain();
  });
};
