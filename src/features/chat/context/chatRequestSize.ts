export const MAX_INLINE_VISION_BYTES = 2.5 * 1024 * 1024;
export const CHAT_REQUEST_WARN_BYTES = 1024 * 1024;

export type ChatRequestSizeStats = {
  requestBytes: number;
  messageCount: number;
  visionImageCount: number;
  inlineImageBytes: number;
  removedInlineImages: number;
};

const utf8Bytes = (value: string) => new TextEncoder().encode(value).byteLength;

export const estimateDataUrlBytes = (value: string) => {
  const comma = value.indexOf(',');
  if (comma < 0) return utf8Bytes(value);
  const header = value.slice(0, comma);
  const payload = value.slice(comma + 1).replace(/\s/g, '');
  if (!/;base64(?:;|$)/i.test(header)) return utf8Bytes(decodeURIComponent(payload));
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(payload.length * 3 / 4) - padding);
};

const imageUrlFromPart = (part: unknown) => {
  if (!part || typeof part !== 'object') return '';
  const record = part as Record<string, unknown>;
  if (record.type !== 'image_url' || !record.image_url || typeof record.image_url !== 'object') return '';
  return String((record.image_url as Record<string, unknown>).url || '').trim();
};

export const protectChatProviderRequest = (input: {
  messages: Array<Record<string, unknown>>;
  tools: Array<Record<string, unknown>>;
  model?: string;
}) => {
  let visionImageCount = 0;
  let inlineImageBytes = 0;
  let removedInlineImages = 0;
  const messages = input.messages.map(message => {
    if (!Array.isArray(message.content)) return message;
    const content = message.content.flatMap(part => {
      const url = imageUrlFromPart(part);
      if (!url) return [part];
      visionImageCount += 1;
      if (!url.startsWith('data:')) return [part];
      const bytes = estimateDataUrlBytes(url);
      inlineImageBytes += bytes;
      if (bytes <= MAX_INLINE_VISION_BYTES) return [part];
      removedInlineImages += 1;
      return [{
        type: 'text',
        text: '一张图片附件因内联数据过大而未加入本次视觉请求。',
      }];
    });
    return { ...message, content };
  });
  const requestBytes = utf8Bytes(JSON.stringify({
    messages,
    tools: input.tools,
    model: input.model,
  }));
  const stats: ChatRequestSizeStats = {
    requestBytes,
    messageCount: messages.length,
    visionImageCount,
    inlineImageBytes,
    removedInlineImages,
  };
  if (requestBytes > CHAT_REQUEST_WARN_BYTES || removedInlineImages > 0) {
    console.warn('Chat request size warning', stats);
  }
  return { messages, stats };
};
