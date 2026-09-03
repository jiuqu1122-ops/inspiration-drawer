import { describe, expect, it } from 'vitest';
import type { ChatAttachment } from '../model/chatTypes';
import { resolveChatReferenceArguments } from './chatReferenceArguments';

const attachments: ChatAttachment[] = [1, 2, 3].map(index => ({
  id: `attachment-${index}`,
  messageId: 'message-1',
  type: 'image',
  path: `C:\\source-${index}.png`,
  createdAt: index,
}));

describe('Chat reference argument resolution', () => {
  it('fills all current images only when a normal generation omitted references', () => {
    expect(resolveChatReferenceArguments({
      toolName: 'generate_image',
      args: { prompt: '综合参考这些图片生成一个设计' },
      currentImageAttachments: attachments,
    }).referenceImages).toEqual(attachments.map(item => item.path));
  });

  it('never overwrites explicit referenceImages', () => {
    expect(resolveChatReferenceArguments({
      toolName: 'generate_image',
      args: { prompt: '只处理一张', referenceImages: ['C:\\explicit.png'] },
      currentImageAttachments: attachments,
    }).referenceImages).toEqual(['C:\\explicit.png']);
    expect(resolveChatReferenceArguments({
      toolName: 'edit_image',
      args: { prompt: '不要引用附件', referenceImages: [] },
      currentImageAttachments: attachments,
    }).referenceImages).toEqual([]);
  });

  it('resolves explicit attachment ids without exposing paths to the model schema', () => {
    expect(resolveChatReferenceArguments({
      toolName: 'generate_image',
      args: { prompt: '处理指定图片', attachmentIds: ['attachment-2'] },
      currentImageAttachments: attachments,
    }).referenceImages).toEqual(['C:\\source-2.png']);
  });

  it('does not inject references into the batch tool', () => {
    expect(resolveChatReferenceArguments({
      toolName: 'batch_image_operation',
      args: { instruction: '逐张处理', mode: 'one_per_image' },
      currentImageAttachments: attachments,
    })).toEqual({ instruction: '逐张处理', mode: 'one_per_image' });
  });

  it('uses the previous generated image only for an attachment-free edit follow-up', () => {
    expect(resolveChatReferenceArguments({
      toolName: 'edit_image',
      args: { prompt: '再简洁一点' },
      currentImageAttachments: [],
      latestGenerated: { id: 'generated-1', type: 'image', path: 'C:\\generated.png' },
    })).toMatchObject({
      sourceImageId: 'generated-1',
      referenceImages: ['C:\\generated.png'],
    });
  });
});
