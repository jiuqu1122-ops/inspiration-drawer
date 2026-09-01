import { describe, expect, it } from 'vitest';
import { compactChatToolResult, serializeChatToolResult } from './chatToolResult';

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
});
