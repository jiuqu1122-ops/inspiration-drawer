import { describe, expect, it, vi } from 'vitest';
import { indexExistingDesignMemory, type ExistingDesignMemorySources } from './indexExistingDesignMemory';
import type { DesignMemoryClient } from '../designMemory/storage';
import type { DesignMemoryKind, DesignMemoryDraft } from '../designMemory/types';
import type { BufferItem } from '../../types';
import type { ChatMessage } from '../chat/model/chatTypes';

const analyzed = (i: number): BufferItem => ({
  id: `image-${i}`, type: 'image', content: '', name: `Image ${i}`, createdAt: i,
  inspirationProfile: {
    itemId: `image-${i}`, summary: `Form ${i}`, analyzedAt: '2026-10-30T00:00:00Z',
    category: 'Product', objects: [], form: { silhouette: [], geometry: [], proportion: [] },
    cmf: { colors: ['red'], materials: [], finishes: [] },
    style: [], interaction: [], scene: [], mood: [], userTags: [], userNotes: [],
  },
});
const message = (id: string, role: 'user' | 'assistant', content: string): ChatMessage => ({
  id, conversationId: 'chat-1', role, content, status: 'completed', createdAt: Number(id.slice(-1)) + 1,
  attachments: [], toolCalls: [],
});
const fixture = () => {
  let current = true;
  const stored: DesignMemoryDraft[] = [];
  const client = {
    beginBatch: vi.fn(async (kind: DesignMemoryKind) => current ? { kind, generation: 1, localRevision: 1 } : null),
    checkBatch: vi.fn(async () => current), isBatchCurrent: vi.fn(() => current),
    acquire: vi.fn(async (kind: DesignMemoryKind, sourceId: string) => current ? {
      lease: { kind, sourceId, generation: 1, sourceRevision: 1 }, localRevision: 1,
    } : null),
    put: vi.fn(async (_ticket: unknown, drafts: DesignMemoryDraft[]) => {
      if (!current) return { accepted: false, written: 0 };
      stored.push(...drafts);
      return { accepted: true, written: drafts.length };
    }),
  } as unknown as DesignMemoryClient;
  const sources: ExistingDesignMemorySources = {
    client,
    listAnalyzedImages: vi.fn(async () => []),
    listConversations: vi.fn(async () => []),
    listMessages: vi.fn(async () => ({ messages: [], hasMore: false })),
    getSummary: vi.fn(async () => null),
  };
  return { sources, stored, disable: () => { current = false; } };
};

describe('explicit existing design-memory index', () => {
  it('is inert when OFF and performs no original source reads', async () => {
    const f = fixture(); f.disable();
    expect(await indexExistingDesignMemory('drawer-image', f.sources)).toEqual({ processed: 0, written: 0 });
    expect(f.sources.listAnalyzedImages).not.toHaveBeenCalled();
  });
  it('pages existing analyzed image metadata and never reads original image bytes', async () => {
    const f = fixture();
    vi.mocked(f.sources.listAnalyzedImages).mockImplementation(async offset => offset === 0 ?
      Array.from({ length: 100 }, (_, i) => analyzed(i)) : [analyzed(100)]);
    expect(await indexExistingDesignMemory('drawer-image', f.sources)).toEqual({ processed: 101, written: 101 });
    expect(f.sources.listAnalyzedImages).toHaveBeenCalledWith(100);
    expect(f.stored).toHaveLength(101);
    expect(f.stored[0].content).toContain('CMF');
  });
  it('does not write after a switch was disabled while one source page was pending', async () => {
    const f = fixture();
    let finish!: (value: BufferItem[]) => void;
    vi.mocked(f.sources.listAnalyzedImages).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const pending = indexExistingDesignMemory('drawer-image', f.sources);
    for (let i = 0; i < 6; i++) await Promise.resolve();
    f.disable(); finish([analyzed(0)]);
    expect(await pending).toEqual({ processed: 0, written: 0 });
    expect(f.stored).toHaveLength(0);
  });
  it('indexes only completed explicit user design text and design summaries, including archived conversations', async () => {
    const f = fixture();
    const conversation = { id: 'chat-1', title: 'Design discussion', model: 'model', createdAt: 1, updatedAt: 2, archived: true };
    vi.mocked(f.sources.listConversations).mockImplementation(async archived => archived ? [conversation] : []);
    vi.mocked(f.sources.listMessages).mockResolvedValue({ messages: [
      message('m1', 'user', 'My design preference is dark industrial material'), message('m2', 'assistant', 'I suggest red'),
      message('m3', 'user', 'For example, how do others design this?'),
    ], hasMore: false });
    vi.mocked(f.sources.getSummary).mockResolvedValue({ conversationId: 'chat-1', summary: 'Industrial design preferences from user', throughMessageId: 'm3', updatedAt: 4 });
    expect(await indexExistingDesignMemory('chat-design', f.sources)).toEqual({ processed: 1, written: 2 });
    expect(f.stored.map(row => row.evidence)).toEqual(['explicit-user-statement', 'conversation-summary']);
    expect(f.stored.every(row => row.sourceId === 'chat-1')).toBe(true);
  });
  it('uses the ID cursor when multiple messages share a timestamp', async () => {
    const f = fixture();
    vi.mocked(f.sources.listConversations).mockImplementation(async archived => archived ? [] : [{ id: 'chat-1', title: 'Design', model: '', createdAt: 1, updatedAt: 1, archived: false }]);
    vi.mocked(f.sources.listMessages).mockImplementation(async (_id, before, id) => before === undefined ? {
      messages: [message('m3', 'user', 'My design preference is metal')], hasMore: true, nextBeforeCreatedAt: 100, nextBeforeId: 'm3',
    } : id === 'm3' ? {
      messages: [message('m2', 'user', 'My design preference is matte')], hasMore: true, nextBeforeCreatedAt: 100, nextBeforeId: 'm2',
    } : { messages: [message('m1', 'user', 'My design preference is blue')], hasMore: false });
    expect(await indexExistingDesignMemory('chat-design', f.sources)).toEqual({ processed: 1, written: 3 });
    expect(f.sources.listMessages).toHaveBeenLastCalledWith('chat-1', 100, 'm2');
  });

});
