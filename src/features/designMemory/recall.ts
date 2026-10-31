import { isDesignMemoryTask } from './sources';
import { designMemory, type DesignMemoryClient, type DesignMemorySnapshot } from './storage';

export type DesignMemoryRecallStatus = 'skipped' | 'disabled' | 'unavailable' | 'no-match' | 'matched' | 'stale';
export type DesignMemoryRecallResult = {
  status: DesignMemoryRecallStatus;
  snapshot: DesignMemorySnapshot | null;
};

// Recall intent is deliberately broader than the conservative WRITE recognizer.
// A capability/history question need not contain a design-domain keyword.
const RECALL_INTENT = /记忆|记得|回忆|偏好|聊天(?:历史|记录)|历史(?:聊天|对话|记录|会话)|收藏.{0,12}(?:图|素材|参考)|(?:之前|以前|以往|先前|上次|过去|曾经).{0,24}(?:聊|说|提|要求|参考|图|素材|记录|对话|方案)|(?:参考|回顾|查找|检索|查看|读取|访问).{0,16}(?:收藏|历史|之前|以前)|\b(?:remember|recall|memories|memory|preferences?)\b|\b(?:chat history|past chats?|previous conversations?|saved images?|collected images?)\b/i;
export const isDesignMemoryRecallTask = (query: string) => isDesignMemoryTask(query) || RECALL_INTENT.test(query);

/** Bounded automatic retrieval, never a history sweep, image read, or model call. */
export const recallDesignMemoryForTurn = async (
  query: string,
  projectId: string,
  excludeSourceId?: string,
  client: DesignMemoryClient = designMemory,
): Promise<DesignMemoryRecallResult> => {
  if (!isDesignMemoryRecallTask(query)) return { status: 'skipped', snapshot: null };
  try {
    const snapshot = await client.recall({ query, projectId, excludeSourceId, includeRelatedSummaries: true, limit: 6 });
    const status = snapshot.invalidated || !client.isCurrent(snapshot) ? 'stale'
      : !snapshot.settings.drawerImage.enabled && !snapshot.settings.chatDesign.enabled ? 'disabled'
      : snapshot.records.length ? 'matched' : 'no-match';
    return { status, snapshot };
  } catch {
    // Do not label unavailable storage as an empty memory library, or block Chat.
    return { status: 'unavailable', snapshot: null };
  }
};

/** Compatibility API for consumers that only need the snapshot. */
export const recallDesignMemoryForTask = async (query: string, projectId: string, excludeSourceId?: string) => {
  const result = await recallDesignMemoryForTurn(query, projectId, excludeSourceId);
  return result.snapshot;
};
