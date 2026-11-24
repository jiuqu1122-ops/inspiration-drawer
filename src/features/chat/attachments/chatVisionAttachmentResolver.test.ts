import { describe, expect, it, vi } from 'vitest';
import type { ChatAttachment } from '../model/chatTypes';
import { MAX_INLINE_VISION_BYTES } from '../context/chatRequestSize';
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
  it('uses the canvas image source when its saved local path is missing', async () => {
    const invokeCommand = vi.fn().mockRejectedValue(new Error('file no longer exists'));
    const resolver = createChatVisionAttachmentResolver({ invokeCommand });
    const image = attachment('moved');
    const source = 'https://example.test/three-view.jpg';
    const result = await resolver.resolve({ ...image, metadataJson: JSON.stringify({ canvasImageSource: source }) });
    expect(invokeCommand).toHaveBeenCalledWith('prepare_chat_vision_image', { source: image.path });
    expect(result.url).toBe(source);
    expect(resolver.failures()).toEqual([]);
  });

  it('prepares a Tauri asset URL locally instead of sending it to the cloud', async () => {
    const invokeCommand = vi.fn()
      .mockResolvedValueOnce({ path: 'C:/cache/three-view.jpg', byteLength: 100 })
      .mockResolvedValueOnce(['reference-images/three-view.jpg']);
    const resolver = createChatVisionAttachmentResolver({ invokeCommand });
    const source = 'https://asset.localhost/C%3A%5Cimages%5Cthree-view.jpg';
    expect((await resolver.resolve({ ...attachment('tauri'), path: source })).url).toBe('reference-images/three-view.jpg');
    expect(invokeCommand).toHaveBeenCalledWith('prepare_chat_vision_image', { source });
  });

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
        return {
          path: 'C:\\cache\\vision.jpg',
          mimeType: 'image/jpeg',
          byteLength: MAX_INLINE_VISION_BYTES + 1,
          width: 1600,
          height: 900,
        };
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

  it('keeps the backend upload stage and redacts sensitive upload details', async () => {
    const invokeCommand = vi.fn(async (command: string) => {
      if (command === 'prepare_chat_vision_image') {
        return {
          path: 'C:\\cache\\vision.jpg',
          mimeType: 'image/jpeg',
          byteLength: MAX_INLINE_VISION_BYTES + 1,
          width: 1600,
          height: 900,
        };
      }
      if (command === 'upload_wallet_reference_images') {
        throw new Error(
          '上传图片文件失败：连接被重置 https://oss.example.test/file?X-Amz-Signature=secret '
          + 'Authorization: Bearer token-secret C:\\Users\\private\\reference.jpg',
        );
      }
      throw new Error(`unexpected command: ${command}`);
    });
    const resolver = createChatVisionAttachmentResolver({ invokeCommand });
    const result = await resolver.resolve(attachment('attachment-sensitive'));
    expect(result.error).toContain('上传图片文件失败：连接被重置');
    expect(result.error).not.toContain('https://');
    expect(result.error).not.toContain('X-Amz-Signature');
    expect(result.error).not.toContain('token-secret');
    expect(result.error).not.toContain('C:\\Users\\private');
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
