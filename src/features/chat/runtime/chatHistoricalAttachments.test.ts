import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../model/chatTypes';
import { isHistoricalImageContinuation, selectChatImageAttachments } from './chatHistoricalAttachments';

const message = (
  id: string,
  content: string,
  paths: string[] = [],
  createdAt = 1,
): ChatMessage => ({
  id,
  conversationId: 'conversation-1',
  role: 'user',
  content,
  status: 'completed',
  createdAt,
  attachments: paths.map((path, index) => ({
    id: `${id}-attachment-${index + 1}`,
    messageId: id,
    type: 'image',
    path,
    createdAt: createdAt + index,
  })),
  toolCalls: [],
});

describe('historical Chat image attachments', () => {
  it.each(['开始做吧', '就按刚才的方案来', '继续', '继续处理这些图片', '这六张', '没问题，开始生成']) (
    'recognizes an explicit continuation: %s',
    text => expect(isHistoricalImageContinuation(text)).toBe(true),
  );

  it('reuses the nearest previous image group without duplicating it onto the new message', () => {
    const source = message('message-1', '把这几张图排成一张作品集版面', ['C:\\a.png', 'C:\\b.png'], 1);
    const latest = message('message-2', '开始做吧', [], 2);
    const selection = selectChatImageAttachments([source, latest], latest.content);

    expect(selection.reusedFromHistory).toBe(true);
    expect(selection.sourceMessage?.id).toBe(source.id);
    expect(selection.attachments.map(attachment => attachment.id)).toEqual([
      'message-1-attachment-1',
      'message-1-attachment-2',
    ]);
    expect(selection.toolIntentText).toContain('排成一张作品集版面');
    expect(latest.attachments).toHaveLength(0);
  });

  it('keeps user corrections made between the uploaded images and the final start command', () => {
    const source = message('message-1', '帮我给这几张产品图排一下版', ['C:\\a.png', 'C:\\b.png'], 1);
    const correction = message('message-2', '不要整合，每一张图都要单独排版', [], 2);
    const latest = message('message-3', '开始制作吧', [], 3);
    const selection = selectChatImageAttachments([source, correction, latest], latest.content);

    expect(selection.attachments).toHaveLength(2);
    expect(selection.toolIntentText).toBe([
      source.content,
      correction.content,
      latest.content,
    ].join('\n'));
  });

  it('does not attach historical images to an unrelated new topic', () => {
    const source = message('message-1', '分析图片', ['C:\\a.png'], 1);
    const latest = message('message-2', '帮我写一段会议总结', [], 2);
    expect(selectChatImageAttachments([source, latest], latest.content).attachments).toEqual([]);
  });

  it('reuses the previous images when the user conversationally revises a pending batch plan', () => {
    const source = message('message-1', '把每一张产品图分别排版', ['C:\\a.png', 'C:\\b.png'], 1);
    const plan: ChatMessage = {
      ...message('message-2', '我会分别排版并统一风格。', [], 2),
      role: 'assistant',
      toolCalls: [{
        id: 'batch-plan-1',
        messageId: 'message-2',
        toolName: 'batch_image_operation',
        argumentsJson: '{}',
        resultJson: JSON.stringify({ declined: true, revisionRequested: true }),
        status: 'declined',
        createdAt: 2,
      }],
    };
    const revision = message('message-3', '中文说明改成英文，整体更克制', [], 3);
    const selection = selectChatImageAttachments([source, plan, revision], revision.content);

    expect(selection.reusedFromHistory).toBe(true);
    expect(selection.attachments).toHaveLength(2);
    expect(selection.toolIntentText).toContain('中文说明改成英文');
  });

  it('always prioritizes images explicitly attached to the current message', () => {
    const source = message('message-1', '旧图片', ['C:\\old.png'], 1);
    const latest = message('message-2', '继续处理', ['C:\\new.png'], 2);
    const selection = selectChatImageAttachments([source, latest], latest.content);
    expect(selection.reusedFromHistory).toBe(false);
    expect(selection.attachments.map(attachment => attachment.path)).toEqual(['C:\\new.png']);
  });
});
