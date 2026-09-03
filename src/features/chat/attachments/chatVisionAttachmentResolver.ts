import { invoke } from '@tauri-apps/api/core';
import type { ChatAttachment } from '../model/chatTypes';
import { estimateDataUrlBytes, MAX_INLINE_VISION_BYTES } from '../context/chatRequestSize';

export const CHAT_VISION_UPLOAD_CONCURRENCY = 2;

type InvokeCommand = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

type PreparedVisionImage = {
  path: string;
  mimeType: string;
  byteLength: number;
  width: number;
  height: number;
};

export type ChatVisionAttachmentResolution = {
  attachmentId: string;
  url?: string;
  error?: string;
  transportBytes: number;
  inline: boolean;
};

export type ChatVisionAttachmentResolver = {
  resolve: (attachment: ChatAttachment) => Promise<ChatVisionAttachmentResolution>;
  failures: () => ChatVisionAttachmentResolution[];
  dispose: () => Promise<void>;
};

const createTaskLimiter = (limit: number) => {
  let active = 0;
  const pending: Array<() => void> = [];
  const next = () => {
    if (active >= limit) return;
    const start = pending.shift();
    if (!start) return;
    active += 1;
    start();
  };
  return <T>(task: () => Promise<T>) => new Promise<T>((resolve, reject) => {
    pending.push(() => {
      void task().then(resolve, reject).finally(() => {
        active -= 1;
        next();
      });
    });
    next();
  });
};

const errorText = (error: unknown) => String(error instanceof Error ? error.message : error || '图片上传失败');

export const createChatVisionAttachmentResolver = (options: {
  invokeCommand?: InvokeCommand;
  concurrency?: number;
} = {}): ChatVisionAttachmentResolver => {
  const invokeCommand = options.invokeCommand || ((command, args) => invoke(command, args));
  const runLimited = createTaskLimiter(Math.max(1, Math.min(3, options.concurrency || CHAT_VISION_UPLOAD_CONCURRENCY)));
  const cache = new Map<string, Promise<ChatVisionAttachmentResolution>>();
  const completed = new Map<string, ChatVisionAttachmentResolution>();

  const resolveOne = async (attachment: ChatAttachment): Promise<ChatVisionAttachmentResolution> => {
    const source = attachment.path.trim();
    if (/^https:\/\//i.test(source)) {
      return {
        attachmentId: attachment.id,
        url: source,
        transportBytes: new TextEncoder().encode(source).byteLength,
        inline: false,
      };
    }
    if (/^data:image\//i.test(source) && estimateDataUrlBytes(source) <= MAX_INLINE_VISION_BYTES) {
      return {
        attachmentId: attachment.id,
        url: source,
        transportBytes: estimateDataUrlBytes(source),
        inline: true,
      };
    }
    try {
      const prepared = await invokeCommand('prepare_chat_vision_image', { source }) as PreparedVisionImage;
      try {
        const uploaded = await invokeCommand('upload_wallet_reference_images', {
          sources: [prepared.path],
        }) as string[];
        const url = String(uploaded?.[0] || '').trim();
        if (!/^reference-images\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(url)) {
          throw new Error('参考图上传服务没有返回有效的对象标识');
        }
        return {
          attachmentId: attachment.id,
          url,
          transportBytes: new TextEncoder().encode(url).byteLength,
          inline: false,
        };
      } catch (uploadError) {
        if (prepared.byteLength <= MAX_INLINE_VISION_BYTES) {
          const dataUrl = String(await invokeCommand('read_local_image_data_url', { path: prepared.path }) || '');
          if (/^data:image\//i.test(dataUrl) && estimateDataUrlBytes(dataUrl) <= MAX_INLINE_VISION_BYTES) {
            return {
              attachmentId: attachment.id,
              url: dataUrl,
              transportBytes: estimateDataUrlBytes(dataUrl),
              inline: true,
            };
          }
        }
        throw uploadError;
      }
    } catch (error) {
      return {
        attachmentId: attachment.id,
        error: errorText(error),
        transportBytes: 0,
        inline: false,
      };
    }
  };

  const resolve = (attachment: ChatAttachment) => {
    const key = `${attachment.id}\u0000${attachment.path}`;
    const existing = cache.get(key);
    if (existing) return existing;
    const pending = runLimited(() => resolveOne(attachment)).then(result => {
      completed.set(attachment.id, result);
      return result;
    });
    cache.set(key, pending);
    return pending;
  };

  return {
    resolve,
    failures: () => [...completed.values()].filter(result => !result.url),
    dispose: async () => {},
  };
};
