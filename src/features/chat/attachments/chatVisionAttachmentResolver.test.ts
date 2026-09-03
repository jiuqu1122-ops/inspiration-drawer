import { describe, expect, it, vi } from 'vitest';
import type { ChatAttachment } from '../model/chatTypes';
import { createChatVisionAttachmentResolver } from './chatVisionAttachmentResolver';

const attachment = (id: string): ChatAttachment => ({
  id,
  messageId: 'message-1',
  type: 'image',
  path: `C:\\images\\${id}.png`,
  mimeType: 'image/png',
  createdAt: 1,
});

describe('Chat Vision attachment resolver', () => {
  it('uploads a local image to wallet storage once and reuses its object key in the same turn', async () => {
    const invokeCommand = vi.fn(async (command: string, args?: Record<string, unknown>) => {
      if (command === 'prepare_chat_vision_image') {
        return { path: 'C:\\cache\\vision.jpg', mimeType: 'image/jpeg', byteLength: 400_000, width: 1600, height: 900 };
      }
      if (command === 'upload_wallet_reference_images') {
        return ['reference-images/12d2e7bb-6e3f-4ba0-bdb0-b82023a67e23.jpg'];
      }
      throw new Error(`unexpected command: ${command} ${JSON.stringify(args)}`);
    });
    const resolver = createChatVisionAttachmentResolver({ invokeCommand });
    const image = attachment('attachment-1');
    const [first, second] = await Promise.all([resolver.resolve(image), resolver.resolve(image)]);
    expect(first.url).toBe('reference-images/12d2e7bb-6e3f-4ba0-bdb0-b82023a67e23.jpg');
    expect(second).toEqual(first);
    expect(invokeCommand.mock.calls.filter(call => call[0] === 'prepare_chat_vision_image')).toHaveLength(1);
    expect(invokeCommand.mock.calls.filter(call => call[0] === 'upload_wallet_reference_images')).toHaveLength(1);
    await resolver.dispose();
    expect(invokeCommand.mock.calls.some(call => call[0] === 'delete_oss_public_image_urls')).toBe(false);
  });

  it('does not fall back to Base64 when a large proxy upload fails', async () => {
    const invokeCommand = vi.fn(async (command: string) => {
      if (command === 'prepare_chat_vision_image') {
        return { path: 'C:\\cache\\vision.jpg', mimeType: 'image/jpeg', byteLength: 400_000, width: 1600, height: 900 };
      }
      if (command === 'upload_wallet_reference_images') throw new Error('upload failed');
      throw new Error(`unexpected command: ${command}`);
    });
    const resolver = createChatVisionAttachmentResolver({ invokeCommand });
    const result = await resolver.resolve(attachment('attachment-large'));
    expect(result.url).toBeUndefined();
    expect(result.error).toContain('upload failed');
    expect(invokeCommand.mock.calls.some(call => call[0] === 'read_local_image_data_url')).toBe(false);
  });

  it('allows only a tiny bounded inline fallback', async () => {
    const invokeCommand = vi.fn(async (command: string) => {
      if (command === 'prepare_chat_vision_image') {
        return { path: 'C:\\cache\\tiny.png', mimeType: 'image/png', byteLength: 3, width: 1, height: 1 };
      }
      if (command === 'upload_wallet_reference_images') throw new Error('upload failed');
      if (command === 'read_local_image_data_url') return 'data:image/png;base64,QUJD';
      throw new Error(`unexpected command: ${command}`);
    });
    const resolver = createChatVisionAttachmentResolver({ invokeCommand });
    const result = await resolver.resolve(attachment('attachment-tiny'));
    expect(result).toMatchObject({ url: 'data:image/png;base64,QUJD', transportBytes: 3, inline: true });
  });

  it('limits parallel wallet uploads while resolving six images', async () => {
    let active = 0;
    let peak = 0;
    let index = 0;
    const invokeCommand = vi.fn(async (command: string) => {
      if (command === 'prepare_chat_vision_image') {
        return { path: `C:\\cache\\vision-${index++}.jpg`, mimeType: 'image/jpeg', byteLength: 300_000, width: 1600, height: 900 };
      }
      if (command === 'upload_wallet_reference_images') {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise(resolve => setTimeout(resolve, 5));
        active -= 1;
        return [`reference-images/00000000-0000-4000-8000-${String(index).padStart(12, '0')}.jpg`];
      }
      throw new Error(`unexpected command: ${command}`);
    });
    const resolver = createChatVisionAttachmentResolver({ invokeCommand });
    const results = await Promise.all(Array.from({ length: 6 }, (_, offset) => (
      resolver.resolve(attachment(`attachment-${offset}`))
    )));
    expect(results.every(result => result.url?.startsWith('reference-images/'))).toBe(true);
    expect(peak).toBeLessThanOrEqual(2);
    await resolver.dispose();
  });
});
