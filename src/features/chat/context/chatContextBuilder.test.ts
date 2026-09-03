import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../model/chatTypes';
import { buildChatContext, GENERAL_CHAT_SYSTEM_PROMPT } from './chatContextBuilder';
import { selectRecentMessagesForBudget } from './chatContextBudget';

const message = (
  id: string,
  role: ChatMessage['role'],
  content: string,
  overrides: Partial<ChatMessage> = {},
): ChatMessage => ({
  id,
  conversationId: 'conversation-1',
  role,
  content,
  status: 'completed',
  createdAt: Number(id.replace(/\D/g, '')) || 1,
  attachments: [],
  toolCalls: [],
  ...overrides,
});

describe('Chat context builder', () => {
  it('keeps the stable system, summary, recent history, latest input order', async () => {
    const old = message('message-1', 'user', '已经写入摘要的旧消息');
    const boundary = message('message-2', 'assistant', '摘要边界');
    const recent = message('message-3', 'assistant', '近期完整回复');
    const latest = message('message-4', 'user', '本轮真实输入');
    const context = await buildChatContext({
      messages: [old, boundary, recent, latest],
      latestUserMessage: latest,
      summary: {
        conversationId: 'conversation-1',
        summary: '可靠摘要',
        throughMessageId: boundary.id,
        updatedAt: 1,
      },
    });

    expect(context).toEqual([
      { role: 'system', content: GENERAL_CHAT_SYSTEM_PROMPT },
      { role: 'system', content: '此前对话摘要：\n可靠摘要' },
      { role: 'assistant', content: '近期完整回复' },
      { role: 'user', content: '本轮真实输入' },
    ]);
  });

  it('reconstructs persisted tool calls as valid assistant/tool/final assistant messages', async () => {
    const answer = message('message-2', 'assistant', '我找到了两个结果。', {
      toolCalls: [{
        id: 'call-1',
        messageId: 'message-2',
        toolName: 'search_assets',
        argumentsJson: '{"query":"跑车"}',
        resultJson: '{"items":[{"id":"asset-1"}]}',
        status: 'completed',
        createdAt: 2,
        completedAt: 3,
      }],
    });
    const latest = message('message-3', 'user', '第一个是什么？');
    const context = await buildChatContext({ messages: [answer, latest], latestUserMessage: latest });

    expect(context.slice(1)).toEqual([
      {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call-1',
          type: 'function',
          function: { name: 'search_assets', arguments: '{"query":"跑车"}' },
        }],
      },
      { role: 'tool', tool_call_id: 'call-1', content: '{"items":[{"id":"asset-1","type":"image"}]}' },
      { role: 'assistant', content: '我找到了两个结果。' },
      { role: 'user', content: '第一个是什么？' },
    ]);
  });

  it('never restores local image paths or inline image payloads into provider history', async () => {
    const answer = message('message-2', 'assistant', '批量处理完成。', {
      toolCalls: [{
        id: 'call-batch',
        messageId: 'message-2',
        toolName: 'batch_image_operation',
        argumentsJson: '{"instruction":"分别优化","mode":"one_per_image"}',
        resultJson: JSON.stringify({
          ok: true,
          total: 1,
          succeeded: 1,
          results: [{
            attachmentId: 'attachment-1',
            status: 'completed',
            media: [{
              id: 'media-1',
              type: 'image',
              path: 'C:\\private\\generated.png',
              url: 'data:image/png;base64,PRIVATE_PAYLOAD',
            }],
          }],
        }),
        status: 'completed',
        createdAt: 2,
        completedAt: 3,
      }],
    });
    const generated = message('message-3', 'assistant', '已生成。', {
      toolCalls: [{
        id: 'call-generate',
        messageId: 'message-3',
        toolName: 'generate_image',
        argumentsJson: JSON.stringify({
          prompt: '生成一个设计',
          referenceImages: ['C:\\private\\reference.png', 'https://cdn.example.com/reference.png'],
        }),
        resultJson: '{"ok":true}',
        status: 'completed',
        createdAt: 3,
        completedAt: 4,
      }],
    });
    const latest = message('message-4', 'user', '继续优化');
    const context = await buildChatContext({
      messages: [answer, generated, latest],
      latestUserMessage: latest,
    });
    const encoded = JSON.stringify(context);

    expect(encoded).not.toContain('C:\\\\private');
    expect(encoded).not.toContain('data:image');
    expect(encoded).not.toContain('PRIVATE_PAYLOAD');
    expect(encoded).toContain('https://cdn.example.com/reference.png');
  });

  it('keeps the newest complete messages when the budget is exceeded', () => {
    const selected = selectRecentMessagesForBudget([
      message('message-1', 'user', 'a'.repeat(500)),
      message('message-2', 'assistant', 'b'.repeat(500)),
      message('message-3', 'user', 'newest'),
    ], 40);
    expect(selected.map(item => item.id)).toEqual(['message-3']);
  });

  it('sends image attachments to the multimodal LLM input', async () => {
    const latest = message('message-1', 'user', '这张图有哪些优点？', {
      attachments: [{
        id: 'attachment-1',
        messageId: 'message-1',
        type: 'image',
        path: 'C:/images/reference.png',
        mimeType: 'image/png',
        createdAt: 1,
      }],
    });
    const context = await buildChatContext({
      messages: [latest],
      latestUserMessage: latest,
      resolveAttachmentUrl: async () => 'data:image/png;base64,abc',
    });
    expect(context[context.length - 1]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: '这张图有哪些优点？' },
        { type: 'text', text: '图片附件 1\nattachmentId: attachment-1' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc', detail: 'low' } },
      ],
    });
  });

  it('keeps wallet reference object keys for server-side delivery', async () => {
    const latest = message('message-1', 'user', '分析这张图', {
      attachments: [{
        id: 'attachment-cos',
        messageId: 'message-1',
        type: 'image',
        path: 'C:/images/reference.png',
        mimeType: 'image/png',
        createdAt: 1,
      }],
    });
    const objectKey = 'reference-images/12d2e7bb-6e3f-4ba0-bdb0-b82023a67e23.jpg';
    const context = await buildChatContext({
      messages: [latest],
      latestUserMessage: latest,
      resolveAttachmentUrl: async () => objectKey,
    });
    expect(context[context.length - 1]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: '分析这张图' },
        { type: 'text', text: '图片附件 1\nattachmentId: attachment-cos' },
        { type: 'image_url', image_url: { url: objectKey, detail: 'low' } },
      ],
    });
  });

  it('labels failed vision uploads without injecting a local path', async () => {
    const latest = message('message-1', 'user', '分析这些图片', {
      attachments: [{
        id: 'attachment-private',
        messageId: 'message-1',
        type: 'image',
        path: 'C:/Users/example/private.png',
        createdAt: 1,
      }],
    });
    const context = await buildChatContext({
      messages: [latest],
      latestUserMessage: latest,
      resolveAttachmentUrl: async attachment => ({
        attachmentId: attachment.id,
        error: 'upload failed',
        transportBytes: 0,
        inline: false,
      }),
    });
    const encoded = JSON.stringify(context);
    expect(encoded).toContain('attachmentId: attachment-private');
    expect(encoded).toContain('该图片暂时未成功加载');
    expect(encoded).not.toContain('C:/Users/example/private.png');
  });

  it('can restore same-conversation images as historical vision attachments', async () => {
    const latest = message('message-2', 'user', '开始做吧');
    const historicalAttachment = {
      id: 'attachment-history',
      messageId: 'message-1',
      type: 'image' as const,
      path: 'C:/images/history.png',
      createdAt: 1,
    };
    const context = await buildChatContext({
      messages: [latest],
      latestUserMessage: latest,
      visionAttachments: [historicalAttachment],
      reusedVisionAttachments: true,
      resolveAttachmentUrl: async () => 'https://vision.example.test/history.jpg',
    });

    expect(context[context.length - 1]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: '开始做吧' },
        { type: 'text', text: '历史图片附件 1\nattachmentId: attachment-history' },
        {
          type: 'image_url',
          image_url: { url: 'https://vision.example.test/history.jpg', detail: 'low' },
        },
      ],
    });
  });
});
