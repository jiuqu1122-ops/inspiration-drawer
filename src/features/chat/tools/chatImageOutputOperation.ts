import type { ChatGeneratedMedia } from '../model/chatTypes';

export const CHAT_IMAGE_MAX_OUTPUTS = 10;
export const normalizeChatImageOutputCount = (value: unknown) => {
  const count = Math.round(Number(value) || 1);
  if (!Number.isFinite(count) || count > CHAT_IMAGE_MAX_OUTPUTS) throw new Error('Chat 每次最多生成 10 张图片。');
  return Math.max(1, count);
};

/** Creates a bounded FIFO semaphore; scripts/tests can use an isolated instance. */
export const createChatImageSlots = () => {
  let active = 0;
  const queue: Array<() => void> = [];
  return async <T>(work: () => Promise<T>): Promise<T> => {
    if (active >= CHAT_IMAGE_MAX_OUTPUTS) await new Promise<void>(resolve => queue.push(resolve));
    else active += 1;
    try { return await work(); }
    finally { const next = queue.shift(); if (next) next(); else active -= 1; }
  };
};

/** Independent n=1 jobs respect model per-request output limits and never silently truncate 6 to 3/4. */
export const executeChatImageOutputs = async (input: {
  args: Record<string, unknown>;
  generate: (args: Record<string, unknown>) => Promise<unknown>;
  signal?: AbortSignal;
}) => {
  const count = normalizeChatImageOutputCount(input.args.count);
  if (count === 1) {
    if (input.signal?.aborted) throw new Error('图片生成已取消。');
    return input.generate({ ...input.args, count: 1 });
  }
  const results = await Promise.all(Array.from({ length: count }, async (_, index) => {
    try {
      if (input.signal?.aborted) return { index, cancelled: true, media: [] as ChatGeneratedMedia[] };
      const value = await input.generate({ ...input.args, count: 1 });
      const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
      const media = (Array.isArray(record.media) ? record.media : []).filter(item => item && (item.path || item.url)).slice(0, 1) as ChatGeneratedMedia[];
      if (!media.length) throw new Error('独立图片任务没有返回有效结果。');
      return { index, media };
    } catch (error) { return { index, media: [] as ChatGeneratedMedia[], error: String(error instanceof Error ? error.message : error) }; }
  }));
  const media = results.flatMap(result => result.media);
  const failures = results.filter(result => result.error || result.cancelled);
  return { ok: media.length === count, prompt: String(input.args.prompt || ''), requestedCount: count,
    succeeded: media.length, failed: failures.filter(result => result.error).length,
    cancelled: failures.some(result => result.cancelled), partial: media.length !== count, media,
    failures: failures.map(({ index, error, cancelled }) => ({ index, error, cancelled })),
  };
};

/** Shared across executor re-creations/renders and conversations in this desktop runtime. */
export const withChatImageSlot = createChatImageSlots();
