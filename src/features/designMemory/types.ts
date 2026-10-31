export type DesignMemoryKind = 'drawer-image' | 'chat-design';
export type DesignMemoryScope = 'project' | 'long-term';
export type DesignMemoryEvidence = 'analyzed-image' | 'explicit-user-statement' | 'conversation-summary';

export type DesignMemorySwitch = { enabled: boolean; generation: number };
export type DesignMemorySettings = {
  drawerImage: DesignMemorySwitch;
  chatDesign: DesignMemorySwitch;
};
export const DEFAULT_DESIGN_MEMORY_SETTINGS: DesignMemorySettings = {
  drawerImage: { enabled: false, generation: 0 },
  chatDesign: { enabled: false, generation: 0 },
};
export const memorySwitch = (settings: DesignMemorySettings, kind: DesignMemoryKind) => (
  kind === 'drawer-image' ? settings.drawerImage : settings.chatDesign
);

export type DesignMemoryAttribution = {
  label: string;
  messageIds?: string[];
  throughMessageId?: string;
  analyzedAt?: string;
};
export type DesignMemoryDraft = {
  id: string;
  kind: DesignMemoryKind;
  sourceId: string;
  scope: DesignMemoryScope;
  projectId: string | null;
  title: string;
  content: string;
  tags: string[];
  evidence: DesignMemoryEvidence;
  attribution: DesignMemoryAttribution;
};
export type DesignMemoryRecord = DesignMemoryDraft & {
  revision: number;
  userCorrected: boolean;
  createdAt: number;
  updatedAt: number;
};
/** Acquire BEFORE asynchronous work. Never reacquire this for a completed job. */
export type DesignMemoryLease = {
  kind: DesignMemoryKind;
  sourceId: string;
  generation: number;
  sourceRevision: number;
};
export type DesignMemoryQuery = {
  query: string;
  projectId?: string | null;
  excludeSourceId?: string;
  /** Other-project summaries are historical examples only, never active constraints. */
  includeRelatedSummaries?: boolean;
  limit?: number;
};
export type DesignMemoryRecall = {
  settings: DesignMemorySettings;
  records: DesignMemoryRecord[];
};
export type DesignMemoryPage = { records: DesignMemoryRecord[]; hasMore: boolean };
export type DesignMemoryInvalidation = {
  kinds: DesignMemoryKind[];
  reason: 'settings' | 'edit' | 'delete' | 'clear' | 'source-deleted';
};
export type DesignMemoryTransport = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
