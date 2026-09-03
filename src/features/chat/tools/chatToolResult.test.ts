import { describe, expect, it } from 'vitest';
import {
  compactChatToolResult,
  compactChatToolResultForProvider,
  serializeChatToolResult,
} from './chatToolResult';

describe('Chat tool-result compaction', () => {
  it('bounds web-search excerpts before the next model request', () => {
    const compacted = compactChatToolResult('web_search', {
      query: '最新新闻',
      provider: 'test',
      results: Array.from({ length: 8 }, (_, index) => ({
        title: `result-${index}`,
        url: `https://example.com/${index}`,
        snippet: 's'.repeat(2_000),
        content: 'c'.repeat(8_000),
      })),
    }) as { results: Array<{ snippet?: string; content?: string }> };

    expect(compacted.results).toHaveLength(5);
    expect(compacted.results[0].snippet?.length).toBeLessThanOrEqual(521);
    expect(compacted.results[0].content?.length).toBeLessThanOrEqual(1_401);
    expect(serializeChatToolResult(compacted).length).toBeLessThan(11_000);
  });

  it('keeps batch media usable locally while hiding paths and inline data from the provider', () => {
    const source = {
      ok: true,
      instruction: '分别优化每一张图片',
      total: 2,
      completed: 2,
      succeeded: 2,
      failed: 0,
      results: [
        {
          attachmentId: 'attachment-1',
          status: 'completed',
          media: [
            {
              id: 'media-local',
              type: 'image',
              path: 'C:\\private\\generated.png',
              url: 'data:image/png;base64,VERY_LARGE_PRIVATE_PAYLOAD',
              assetId: 'asset-local',
            },
            {
              id: 'media-remote',
              type: 'image',
              path: 'C:\\private\\remote.png',
              url: 'https://cdn.example.com/generated.png',
              assetId: 'asset-remote',
            },
          ],
        },
      ],
    };

    const local = serializeChatToolResult(compactChatToolResult('batch_image_operation', source));
    const provider = serializeChatToolResult(compactChatToolResultForProvider('batch_image_operation', source));

    expect(local).toContain('C:\\\\private\\\\generated.png');
    expect(provider).not.toContain('C:\\\\private');
    expect(provider).not.toContain('data:image');
    expect(provider).not.toContain('VERY_LARGE_PRIVATE_PAYLOAD');
    expect(provider).toContain('https://cdn.example.com/generated.png');
  });
});
