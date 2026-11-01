import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  DEFAULT_DESIGN_MEMORY_SETTINGS, memorySwitch,
  type DesignMemoryDraft, type DesignMemoryInvalidation, type DesignMemoryKind,
  type DesignMemoryLease, type DesignMemoryPage, type DesignMemoryQuery,
  type DesignMemoryRecall, type DesignMemoryRecord, type DesignMemorySettings, type DesignMemoryTransport,
} from './types';

export type DesignMemoryBatch = { kind: DesignMemoryKind; generation: number; localRevision: number };
export type DesignMemoryWriteTicket = { lease: DesignMemoryLease; localRevision: number };
export type DesignMemorySnapshot = {
  records: DesignMemoryRecord[];
  settings: DesignMemorySettings;
  localRevisions: Record<DesignMemoryKind, number>;
  projectId?: string | null;
  /** Retrieval crossed a settings/source revocation; not an ordinary no-match. */
  invalidated?: boolean;
};
const kinds: DesignMemoryKind[] = ['drawer-image', 'chat-design'];
const cloneSettings = (value: DesignMemorySettings): DesignMemorySettings => ({
  drawerImage: { ...value.drawerImage }, chatDesign: { ...value.chatDesign },
});

/** No localStorage fallback: unregistered/unavailable native storage fails closed. */
export class DesignMemoryClient {
  private settings = cloneSettings(DEFAULT_DESIGN_MEMORY_SETTINGS);
  private known = false;
  private localRevisions: Record<DesignMemoryKind, number> = { 'drawer-image': 0, 'chat-design': 0 };
  private pendingSwitches = new Set<DesignMemoryKind>();
  private failedSwitches = new Set<DesignMemoryKind>();
  private listeners = new Set<(event: DesignMemoryInvalidation) => void>();
  constructor(private transport: DesignMemoryTransport) {}

  peekSettings() { return cloneSettings(this.settings); }
  subscribe(listener: (event: DesignMemoryInvalidation) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  invalidate(event: DesignMemoryInvalidation) {
    event.kinds.forEach(kind => { this.localRevisions[kind] += 1; });
    this.listeners.forEach(listener => listener(event));
  }
  private applySettings(next: DesignMemorySettings) {
    for (const kind of kinds) {
      const current = memorySwitch(this.settings, kind);
      const state = memorySwitch(next, kind);
      if (this.pendingSwitches.has(kind) || this.failedSwitches.has(kind) || state.generation < current.generation) continue;
      if (state.generation !== current.generation || state.enabled !== current.enabled) {
        Object.assign(current, state);
        this.invalidate({ kinds: [kind], reason: 'settings' });
      }
    }
    this.known = true;
    return this.peekSettings();
  }
  async getSettings() {
    return this.applySettings(await this.transport<DesignMemorySettings>('design_memory_get_settings'));
  }
  async setEnabled(kind: DesignMemoryKind, enabled: boolean) {
    if (this.pendingSwitches.has(kind)) throw new Error('设置正在保存，请稍候');
    this.pendingSwitches.add(kind);
    this.failedSwitches.delete(kind);
    // Opting out takes effect synchronously, before the native command can finish.
    memorySwitch(this.settings, kind).enabled = false;
    this.invalidate({ kinds: [kind], reason: 'settings' });
    try {
      const next = await this.transport<DesignMemorySettings>('design_memory_set_enabled', { kind, enabled });
      this.pendingSwitches.delete(kind);
      return this.applySettings(next);
    } catch (error) {
      this.pendingSwitches.delete(kind);
      // Stay OFF even across background refreshes. Only another explicit switch action can recover it.
      this.failedSwitches.add(kind);
      this.known = false;
      throw error;
    }
  }
  async beginBatch(kind: DesignMemoryKind): Promise<DesignMemoryBatch | null> {
    const startRevision = this.known ? this.localRevisions[kind] : null;
    await this.getSettings();
    if (startRevision !== null && startRevision !== this.localRevisions[kind]) return null;
    const state = memorySwitch(this.settings, kind);
    return state.enabled && !this.pendingSwitches.has(kind)
      ? { kind, generation: state.generation, localRevision: this.localRevisions[kind] } : null;
  }
  isBatchCurrent(batch: DesignMemoryBatch | null) {
    if (!batch) return false;
    const state = memorySwitch(this.settings, batch.kind);
    return state.enabled && !this.pendingSwitches.has(batch.kind)
      && state.generation === batch.generation && this.localRevisions[batch.kind] === batch.localRevision;
  }
  async checkBatch(batch: DesignMemoryBatch | null) {
    if (!this.isBatchCurrent(batch)) return false;
    await this.getSettings();
    return this.isBatchCurrent(batch);
  }
  async acquire(kind: DesignMemoryKind, sourceId: string, batch?: DesignMemoryBatch | null): Promise<DesignMemoryWriteTicket | null> {
    if (batch !== undefined && (!batch || batch.kind !== kind || !this.isBatchCurrent(batch))) return null;
    if (!this.known) await this.getSettings();
    if (!memorySwitch(this.settings, kind).enabled || this.pendingSwitches.has(kind)) return null;
    const revision = this.localRevisions[kind];
    const generation = memorySwitch(this.settings, kind).generation;
    const lease = await this.transport<DesignMemoryLease | null>('design_memory_acquire_lease', { kind, sourceId });
    if (batch && (lease?.generation !== batch.generation || !this.isBatchCurrent(batch))) return null;
    if (!lease || lease.generation !== generation || revision !== this.localRevisions[kind] || !memorySwitch(this.settings, kind).enabled) return null;
    return { lease, localRevision: revision };
  }
  async put(ticket: DesignMemoryWriteTicket | null, records: DesignMemoryDraft[]) {
    if (!ticket || !records.length || ticket.localRevision !== this.localRevisions[ticket.lease.kind]
      || !memorySwitch(this.settings, ticket.lease.kind).enabled) return { accepted: false, written: 0 };
    // SQLite checks the same generation/source revision atomically at COMMIT.
    return this.transport<{ accepted: boolean; written: number }>('design_memory_upsert', { lease: ticket.lease, records });
  }
  async recall(query: DesignMemoryQuery): Promise<DesignMemorySnapshot> {
    const startRevisions = this.known ? { ...this.localRevisions } : null;
    await this.getSettings();
    const localRevisions = { ...this.localRevisions };
    if (startRevisions && kinds.some(kind => startRevisions[kind] !== localRevisions[kind])) {
      return { records: [], settings: this.peekSettings(), localRevisions, projectId: query.projectId, invalidated: true };
    }
    if (!kinds.some(kind => memorySwitch(this.settings, kind).enabled)) {
      return { records: [], settings: this.peekSettings(), localRevisions, projectId: query.projectId };
    }
    const result = await this.transport<DesignMemoryRecall>('design_memory_recall', { query });
    // Reject results obtained across any local/cross-window invalidation, including disable+reenable.
    const records = result.records.filter(record => (
      this.localRevisions[record.kind] === localRevisions[record.kind]
      && memorySwitch(this.settings, record.kind).enabled
      && memorySwitch(result.settings, record.kind).enabled
      && memorySwitch(this.settings, record.kind).generation === memorySwitch(result.settings, record.kind).generation
    ));
    return { records, settings: result.settings, localRevisions, projectId: query.projectId,
      invalidated: records.length !== result.records.length || kinds.some(kind => this.localRevisions[kind] !== localRevisions[kind]),
    };
  }
  isCurrent(snapshot: DesignMemorySnapshot) {
    return snapshot.records.every(record => (
      snapshot.localRevisions[record.kind] === this.localRevisions[record.kind]
      && memorySwitch(this.settings, record.kind).enabled
      && snapshot.settings && memorySwitch(snapshot.settings, record.kind).generation === memorySwitch(this.settings, record.kind).generation
    ));
  }
  list(kind?: DesignMemoryKind, offset = 0, limit = 30) {
    return this.transport<DesignMemoryPage>('design_memory_list', { kind: kind ?? null, offset, limit });
  }
  async correct(record: DesignMemoryRecord, content: string) {
    this.invalidate({ kinds: [record.kind], reason: 'edit' });
    return this.transport<DesignMemoryRecord>('design_memory_correct', { id: record.id, expectedRevision: record.revision, content });
  }
  async delete(record: DesignMemoryRecord) {
    this.invalidate({ kinds: [record.kind], reason: 'delete' });
    return this.transport<boolean>('design_memory_delete', { id: record.id, expectedRevision: record.revision });
  }
  async clear(kind: DesignMemoryKind) {
    this.invalidate({ kinds: [kind], reason: 'clear' });
    const result = await this.transport<number>('design_memory_clear', { kind });
    await this.getSettings();
    return result;
  }
  async deleteSource(kind: DesignMemoryKind, sourceId: string) {
    this.invalidate({ kinds: [kind], reason: 'source-deleted' });
    return this.transport<number>('design_memory_delete_source', { kind, sourceId });
  }
}

export const designMemory = new DesignMemoryClient((command, args) => invoke(command, args));
let eventListener: Promise<() => void> | undefined;
/** Shared, app-lifetime listener. Safe before registration; no history is scanned. */
export const connectDesignMemoryEvents = () => {
  eventListener ??= listen<DesignMemoryInvalidation>('design-memory-invalidated', event => {
    const payload = event.payload;
    if (!payload || !Array.isArray(payload.kinds)) return;
    const valid = payload.kinds.filter(kind => kinds.includes(kind));
    if (!valid.length) return;
    designMemory.invalidate({ ...payload, kinds: valid });
    void designMemory.getSettings().catch(() => {});
  }).catch(() => () => {});
  return eventListener;
};
