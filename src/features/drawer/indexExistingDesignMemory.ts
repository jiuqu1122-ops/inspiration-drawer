import { invoke } from '@tauri-apps/api/core';
import { listAssets } from '../../services/assetsApi';
import { getChatSummary, listChatMessages } from '../chat/storage/chatStorage';
import type { BufferItem } from '../../types';
import type { ChatConversation, ChatMessagePage, ChatSummary } from '../chat/model/chatTypes';
import { buildChatSummaryMemory, buildDrawerImageMemory, buildExplicitChatDesignMemory } from '../designMemory/sources';
import { designMemory, type DesignMemoryClient } from '../designMemory/storage';
import type { DesignMemoryKind } from '../designMemory/types';

const PAGE_SIZE = 100;
const listConversations = (archived: boolean, offset: number) => invoke<ChatConversation[]>(
  'chat_list_conversations', { options: { search: '', archived, limit: PAGE_SIZE, offset } },
);

export type ExistingDesignMemorySources = {
  client: DesignMemoryClient;
  listAnalyzedImages: (offset: number) => Promise<BufferItem[]>;
  listConversations: (archived: boolean, offset: number) => Promise<ChatConversation[]>;
  listMessages: (conversationId: string, beforeCreatedAt?: number, beforeId?: string) => Promise<ChatMessagePage>;
  getSummary: (conversationId: string) => Promise<ChatSummary | null>;
};
const defaultSources: ExistingDesignMemorySources = {
  client: designMemory,
  listAnalyzedImages: offset => listAssets({ file_type: 'image', inspiration_status: 'analyzed', sort: 'created_at_desc', offset, limit: PAGE_SIZE }),
  listConversations,
  listMessages: (id, beforeCreatedAt, beforeId) => listChatMessages(id, { beforeCreatedAt, beforeId, limit: PAGE_SIZE }),
  getSummary: getChatSummary,
};

/** Explicit opt-in only. Reads metadata/text, never image bytes, and never calls AI. */
export const indexExistingDesignMemory = async (
  kind: DesignMemoryKind,
  sources: ExistingDesignMemorySources = defaultSources,
): Promise<{ processed: number; written: number }> => {
  const { client } = sources;
  const batch = await client.beginBatch(kind);
  if (!batch) return { processed: 0, written: 0 };
  let processed = 0;
  let written = 0;
  if (kind === 'drawer-image') {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      if (!await client.checkBatch(batch)) break;
      const assets = await sources.listAnalyzedImages(offset);
      if (!client.isBatchCurrent(batch)) break;
      for (const asset of assets) {
        if (!client.isBatchCurrent(batch)) break;
        processed += 1;
        if (!asset.inspirationProfile) continue;
        const draft = buildDrawerImageMemory(asset.inspirationProfile, { title: asset.name });
        if (!draft || draft.sourceId !== asset.id) continue;
        const ticket = await client.acquire(kind, asset.id, batch);
        if (!ticket) return { processed, written };
        const result = await client.put(ticket, [draft]);
        if (!result.accepted) return { processed, written };
        written += result.written;
      }
      if (assets.length < PAGE_SIZE) break;
    }
    return { processed, written };
  }

  for (const archived of [false, true]) {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      if (!await client.checkBatch(batch)) return { processed, written };
      const conversations = await sources.listConversations(archived, offset);
      if (!client.isBatchCurrent(batch)) return { processed, written };
      for (const conversation of conversations) {
        if (!await client.checkBatch(batch)) return { processed, written };
        processed += 1;
        const ticket = await client.acquire(kind, conversation.id, batch);
        if (!ticket) return { processed, written };
        let before: number | undefined;
        let beforeId: string | undefined;
        const cursors = new Set<string>();
        while (true) {
          if (!await client.checkBatch(batch)) return { processed, written };
          const page = await sources.listMessages(conversation.id, before, beforeId);
          if (!client.isBatchCurrent(batch)) return { processed, written };
          const drafts = page.messages.flatMap(message => {
            const draft = buildExplicitChatDesignMemory(message, { title: conversation.title });
            return draft ? [draft] : [];
          });
          if (drafts.length) {
            const result = await client.put(ticket, drafts);
            if (!result.accepted) return { processed, written };
            written += result.written;
          }
          const nextBefore = page.nextBeforeCreatedAt ?? undefined;
          if (!page.hasMore || nextBefore === undefined) break;
          const nextId = page.nextBeforeId ?? undefined;
          const cursor = JSON.stringify([nextBefore, nextId]);
          if (cursors.has(cursor) || (before !== undefined && (nextBefore > before || (nextBefore === before && !nextId)))) break;
          cursors.add(cursor);
          before = nextBefore;
          beforeId = nextId;
        }
        if (!client.isBatchCurrent(batch)) return { processed, written };
        const summary = await sources.getSummary(conversation.id);
        if (!client.isBatchCurrent(batch)) return { processed, written };
        const draft = summary ? buildChatSummaryMemory(summary, { title: conversation.title }) : null;
        if (draft) {
          const result = await client.put(ticket, [draft]);
          if (!result.accepted) return { processed, written };
          written += result.written;
        }
      }
      if (conversations.length < PAGE_SIZE) break;
    }
  }
  return { processed, written };
};
