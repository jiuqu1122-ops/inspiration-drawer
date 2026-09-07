export const normalizeChatModelSelection = (value?: string | null) => (
  String(value || '').trim()
);

export const CHAT_AUTOMATIC_MODEL = 'default';

const CHAT_AUTOMATIC_MODEL_ALIASES = new Set([
  'unmind-agent',
  'auto',
  'default',
  'recommended',
]);

export const isAutomaticChatModel = (value?: string | null) => (
  CHAT_AUTOMATIC_MODEL_ALIASES.has(normalizeChatModelSelection(value).toLowerCase())
);

export const normalizeSupportedChatModel = (value?: string | null) => (
  isAutomaticChatModel(value)
    ? CHAT_AUTOMATIC_MODEL
    : normalizeChatModelSelection(value)
);

export const resolveAvailableChatModels = (
  models: string[],
  currentModel?: string | null,
) => {
  const available: string[] = [];
  const seen = new Set<string>();
  models.forEach(value => {
    const model = normalizeSupportedChatModel(value);
    const key = model.toLowerCase();
    if (!model || seen.has(key)) return;
    seen.add(key);
    available.push(model);
  });
  available.reverse();

  const concreteModels = available.filter(model => !isAutomaticChatModel(model));
  const automaticModels = available.filter(model => isAutomaticChatModel(model));
  const current = normalizeSupportedChatModel(currentModel);
  const currentKey = current.toLowerCase();
  if (current && !seen.has(currentKey)) {
    if (isAutomaticChatModel(current)) automaticModels.push(current);
    else concreteModels.push(current);
  }
  return [...concreteModels, ...automaticModels];
};

export const resolveChatRequestModel = (
  selectedModel?: string | null,
  conversationModel?: string | null,
  fallbackModel?: string | null,
) => (
  normalizeChatModelSelection(selectedModel)
  || normalizeChatModelSelection(conversationModel)
  || normalizeChatModelSelection(fallbackModel)
  || CHAT_AUTOMATIC_MODEL
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
