import { describe, expect, it, vi } from 'vitest';
import {
  CHAT_REQUEST_HARD_BYTES,
  MAX_INLINE_VISION_BYTES,
  estimateDataUrlBytes,
  protectChatProviderRequest,
} from './chatRequestSize';

describe('Chat provider request size protection', () => {
  it('keeps a tiny inline image fallback', () => {
    const url = 'data:image/png;base64,QUJD';
    const result = protectChatProviderRequest({
      messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url } }] }],
      tools: [],
    });
    expect(estimateDataUrlBytes(url)).toBe(3);
    expect(JSON.stringify(result.messages)).toContain(url);
    expect(result.stats.inlineImageBytes).toBe(3);
  });

  it('removes an oversized inline image before invocation', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const url = `data:image/jpeg;base64,${'A'.repeat((MAX_INLINE_VISION_BYTES + 1) * 4 / 3 + 8)}`;
    const result = protectChatProviderRequest({
      messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url } }] }],
      tools: [],
    });
    expect(result.stats.removedInlineImages).toBe(1);
    expect(JSON.stringify(result.messages)).not.toContain('data:image');
    warn.mockRestore();
  });

  it('represents six high-resolution images as a small HTTPS-only request', () => {
    const content = Array.from({ length: 6 }, (_, index) => ({
      type: 'image_url',
      image_url: { url: `https://vision.example.test/chat/image-${index}.jpg`, detail: 'low' },
    }));
    const result = protectChatProviderRequest({
      messages: [{ role: 'user', content }],
      tools: [],
      model: 'gpt-5.6-terra',
    });
    expect(result.stats).toMatchObject({ visionImageCount: 6, inlineImageBytes: 0, removedInlineImages: 0 });
    expect(result.stats.requestBytes).toBeLessThan(4_096);
  });

  it('blocks an oversized non-image request locally', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => protectChatProviderRequest({
      messages: [{ role: 'user', content: 'x'.repeat(CHAT_REQUEST_HARD_BYTES + 1) }],
      tools: [],
    })).toThrow('发送内容过大');
    error.mockRestore();
  });
});
