export const normalizeChatModelSelection = (value?: string | null) => (
  String(value || '').trim()
);

export const CHAT_MODEL_OPTIONS = [
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
] as const;

const CHAT_MODEL_OPTION_LOOKUP = new Map(
  CHAT_MODEL_OPTIONS.map(model => [model.toLowerCase(), model]),
);

export const normalizeSupportedChatModel = (value?: string | null) => (
  CHAT_MODEL_OPTION_LOOKUP.get(normalizeChatModelSelection(value).toLowerCase()) || ''
);

export const resolveAvailableChatModels = (models: string[]) => {
  const available = new Set(
    models
      .map(normalizeSupportedChatModel)
      .filter(Boolean),
  );
  const supported = CHAT_MODEL_OPTIONS.filter(model => available.has(model));
  return supported.length > 0 ? [...supported] : [CHAT_MODEL_OPTIONS[0]];
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
