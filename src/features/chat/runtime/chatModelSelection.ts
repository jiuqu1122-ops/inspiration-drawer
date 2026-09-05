export const normalizeChatModelSelection = (value?: string | null) => (
  String(value || '').trim()
);

export const normalizeSupportedChatModel = (value?: string | null) => (
  normalizeChatModelSelection(value)
);

export const resolveAvailableChatModels = (
  models: string[],
  currentModel?: string | null,
) => {
  const available: string[] = [];
  const seen = new Set<string>();
  [currentModel, ...models].forEach(value => {
    const model = normalizeSupportedChatModel(value);
    const key = model.toLowerCase();
    if (!model || seen.has(key)) return;
    seen.add(key);
    available.push(model);
  });
  return available;
};

export const resolveChatRequestModel = (
  selectedModel?: string | null,
  conversationModel?: string | null,
  fallbackModel?: string | null,
) => (
  normalizeChatModelSelection(selectedModel)
  || normalizeChatModelSelection(conversationModel)
  || normalizeChatModelSelection(fallbackModel)
  || 'default'
);

export type KeyedSerialTaskQueue = <T>(key: string, task: () => Promise<T>) => Promise<T>;

export const createKeyedSerialTaskQueue = (): KeyedSerialTaskQueue => {
  const tails = new Map<string, Promise<void>>();

  return <T>(key: string, task: () => Promise<T>) => {
    const previous = tails.get(key) || Promise.resolve();
    const result = previous.catch(() => undefined).then(task);
    const tail = result.then(() => undefined, () => undefined);
    tails.set(key, tail);
    void tail.finally(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    return result;
  };
};
