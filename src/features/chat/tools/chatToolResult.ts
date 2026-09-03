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
  if (name === 'batch_image_operation') {
    const results = Array.isArray(record.results) ? record.results : [];
    return {
      ok: record.ok === true,
      operation: 'batch_image_operation',
      phase: record.phase,
      instruction: String(record.instruction || '').slice(0, 2_000),
      total: Number(record.total) || 0,
      started: Number(record.started) || 0,
      active: Number(record.active) || 0,
      completed: Number(record.completed) || 0,
      succeeded: Number(record.succeeded) || 0,
      failed: Number(record.failed) || 0,
      cancelled: record.cancelled === true,
      results: results.map(value => {
        const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
        const media = Array.isArray(item.media) ? item.media : [];
        return {
          attachmentId: item.attachmentId,
          status: item.status,
          error: item.error ? String(item.error).slice(0, 500) : undefined,
          media: media.flatMap(value => {
            const output = value && typeof value === 'object' ? value as Record<string, unknown> : {};
            const url = String(output.url || '').trim();
            const path = String(output.path || '').trim();
            if (!path && !/^https:\/\//i.test(url)) return [];
            return [{
              id: output.id,
              type: output.type || 'image',
              path: path || undefined,
              url: /^https:\/\//i.test(url) ? url : undefined,
              thumbnail: output.thumbnail,
              assetId: output.assetId,
              prompt: output.prompt,
              name: output.name,
            }];
          }),
        };
      }),
    };
  }
  return value;
};

export const compactChatToolResultForProvider = (name: string, value: unknown): unknown => {
  const compact = compactChatToolResult(name, value);
  if (name !== 'batch_image_operation' || !compact || typeof compact !== 'object') return compact;
  const record = compact as Record<string, unknown>;
  return {
    ...record,
    results: (Array.isArray(record.results) ? record.results : []).map(value => {
      const result = value && typeof value === 'object' ? value as Record<string, unknown> : {};
      return {
        attachmentId: result.attachmentId,
        status: result.status,
        error: result.error,
        media: (Array.isArray(result.media) ? result.media : []).map(value => {
          const media = value && typeof value === 'object' ? value as Record<string, unknown> : {};
          return {
            id: media.id,
            type: media.type,
            assetId: media.assetId,
            url: /^https:\/\//i.test(String(media.url || '')) ? media.url : undefined,
            name: media.name,
          };
        }),
      };
    }),
  };
};

export const serializeChatToolResult = (value: unknown) => {
  try { return JSON.stringify(value ?? null); } catch (_) { return JSON.stringify({ error: String(value) }); }
};
