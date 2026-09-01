export const compactChatToolResult = (name: string, value: unknown): unknown => {
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (name === 'web_search') {
    const results = Array.isArray(record.results) ? record.results : [];
    const clip = (value: unknown, limit: number) => {
      const text = String(value || '').trim();
      return text.length > limit ? `${text.slice(0, limit)}…` : text || undefined;
    };
    return {
      query: record.query,
      provider: record.provider,
      searchedAt: record.searchedAt,
      results: results.slice(0, 5).map(value => {
        const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
        return {
          title: item.title,
          url: item.url,
          snippet: clip(item.snippet, 520),
          content: clip(item.content, 1_400),
          publishedAt: item.publishedAt,
        };
      }),
    };
  }
  if (name === 'search_assets') {
    const candidates = Array.isArray(record.inspirationCandidates)
      ? record.inspirationCandidates
      : Array.isArray(record.items) ? record.items : [];
    return {
      items: candidates.slice(0, 8).map(value => {
        const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
        return {
          id: item.id || item.itemId,
          name: item.name,
          type: item.type || 'image',
          thumbnail: item.thumbnail,
          description: item.description || item.reason,
        };
      }),
    };
  }
  return value;
};

export const serializeChatToolResult = (value: unknown) => {
  try { return JSON.stringify(value ?? null); } catch (_) { return JSON.stringify({ error: String(value) }); }
};
