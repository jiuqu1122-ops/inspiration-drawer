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
  it.each([
    '开始做吧',
    '就按刚才的方案来',
    '继续',
    '继续处理这些图片',
    '这六张',
    '没问题，开始生成',
    '按你的想法帮我生成三个不同方向',
    '根据前面的分析继续优化这个产品',
    '保持原来的造型和比例，只调整材质',
    '把这款设计做成两个独立版本',
    '那你帮我改一下，然后出图',
    '出图',
    '改成红色',
    '把材质换成金属',
    '再做一个更简洁的版本',
    '我想要红色宫墙的视觉效果，同样保留以上对话的特点，建筑不要纹理太复杂',
    '我希望整体配色更温暖，但保留前面的设计特征',
    '同样保留以上对话的特点',
    '建筑不要纹理太复杂',
    'Make the material warmer while keeping the previous design features',
    '三个方案都分别出图我看看',
  ]) (
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

  it.each([
    '帮我生成一张全新的宇宙风景图',
    '换个话题，生成一张城市夜景图',
    '不要参考之前的图片，生成一张新海报',
  ])('does not carry the old visual subject into an explicit new request: %s', text => {
    const source = message('message-1', '分析图片', ['C:\\a.png'], 1);
    const latest = message('message-2', text, [], 2);
    expect(selectChatImageAttachments([source, latest], latest.content).attachments).toEqual([]);
  });

  it('keeps the original visual reference across analysis, revision and a terse render command', () => {
    const source = message('message-1', '分析一下这个产品的 CMF', ['C:\\product.png'], 1);
    const revision = message('message-2', '那你帮我改一下，然后出图', [], 2);
    const render = message('message-3', '出图', [], 3);
    const selection = selectChatImageAttachments([source, revision, render], render.content);

    expect(selection.reusedFromHistory).toBe(true);
    expect(selection.attachments.map(attachment => attachment.path)).toEqual(['C:\\product.png']);
    expect(selection.toolIntentText).toBe([
      source.content,
      revision.content,
      render.content,
    ].join('\n'));
  });

  it('reuses a prior visual subject for a semantic follow-up without a fixed continuation command', () => {
    const source = message('message-1', '分析这个产品还能如何优化', ['C:\\product.png'], 1);
    const latest = message('message-2', '按你的建议做三个不同方向，每个方向单独出图', [], 2);
    const selection = selectChatImageAttachments([source, latest], latest.content);

    expect(selection.reusedFromHistory).toBe(true);
    expect(selection.attachments.map(attachment => attachment.path)).toEqual(['C:\\product.png']);
    expect(selection.toolIntentText).toContain(source.content);
    expect(selection.toolIntentText).toContain(latest.content);
  });

  it('reuses the visual reference for a preference-and-constraint follow-up without an image command', () => {
    const source = message('message-1', '分析这张建筑参考图的视觉特点', ['C:\\palace.png'], 1);
    const analysis: ChatMessage = {
      ...message('message-2', '红墙、克制的纹理和简洁轮廓是主要特点。', [], 2),
      role: 'assistant',
    };
    const latest = message(
      'message-3',
      '我想要红色宫墙的视觉效果，同样保留以上对话的特点，建筑不要纹理太复杂',
      [],
      3,
    );
    const selection = selectChatImageAttachments([source, analysis, latest], latest.content);

    expect(selection.reusedFromHistory).toBe(true);
    expect(selection.attachments.map(attachment => attachment.path)).toEqual(['C:\\palace.png']);
    expect(selection.toolIntentText).toContain(source.content);
    expect(selection.toolIntentText).toContain(latest.content);
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

  it('reuses earlier references when the user asks to render the proposed variants', () => {
    const source = message('message-1', '帮我看看怎么重新设计一下', ['C:\\a.png', 'C:\\b.png'], 1);
    const latest = message('message-2', '三个方案都分别出图我看看', [], 2);
    const selection = selectChatImageAttachments([source, latest], latest.content);

    expect(selection.reusedFromHistory).toBe(true);
    expect(selection.attachments.map(attachment => attachment.path)).toEqual(['C:\\a.png', 'C:\\b.png']);
    expect(selection.toolIntentText).toContain(latest.content);
  });

  it('keeps the pending image request when references arrive in the next message', () => {
    const request = message('message-1', '三个方案都分别出图我看看', [], 1);
    const references = message('message-2', '这是参考图', ['C:\\a.png', 'C:\\b.png'], 2);
    const selection = selectChatImageAttachments([request, references], references.content);

    expect(selection.reusedFromHistory).toBe(false);
    expect(selection.sourceMessage?.id).toBe(references.id);
    expect(selection.attachments.map(attachment => attachment.path)).toEqual(['C:\\a.png', 'C:\\b.png']);
    expect(selection.toolIntentText).toBe([request.content, references.content].join('\n'));
  });
});
