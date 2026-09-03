const INVISIBLE_CHAT_CHARACTERS = /[\u200B-\u200D\u2060\uFEFF]/g;

export const stripInvisibleChatCharacters = (value: unknown) => (
  String(value ?? '').replace(INVISIBLE_CHAT_CHARACTERS, '')
);

export const normalizeVisibleChatText = (value: unknown) => (
  stripInvisibleChatCharacters(value).trim()
);
