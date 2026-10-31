import { describe, expect, it, vi } from 'vitest';
import { DesignMemoryClient } from './storage';
import {
  DEFAULT_DESIGN_MEMORY_SETTINGS, memorySwitch,
  type DesignMemoryDraft, type DesignMemoryKind, type DesignMemoryRecord,
  type DesignMemorySettings, type DesignMemoryTransport,
} from './types';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const record: DesignMemoryRecord = {
  id: 'chat-user:m1', kind: 'chat-design', sourceId: 'old-session', scope: 'long-term', projectId: null,
  title: '设计要求', content: '我喜欢金属磨砂设计', tags: ['金属'], evidence: 'explicit-user-statement',
  attribution: { label: '旧设计对话', messageIds: ['m1'] }, revision: 1, userCorrected: false, createdAt: 1, updatedAt: 2,
};
const fake = () => {
  const state = clone(DEFAULT_DESIGN_MEMORY_SETTINGS);
  const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  const overrides = new Map<string, (args?: Record<string, unknown>) => unknown>();
  const transport: DesignMemoryTransport = async <T,>(command: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({ command, args });
    if (overrides.has(command)) return await overrides.get(command)!(args) as T;
    const kind = args?.kind as DesignMemoryKind;
    let result: unknown;
    if (command === 'design_memory_get_settings') result = clone(state);
    else if (command === 'design_memory_set_enabled') {
      const current = memorySwitch(state, kind);
      if (current.enabled !== args?.enabled) current.generation++;
      current.enabled = Boolean(args?.enabled); result = clone(state);
    } else if (command === 'design_memory_acquire_lease') {
      const current = memorySwitch(state, kind);
      result = current.enabled ? { kind, sourceId: args?.sourceId, generation: current.generation, sourceRevision: 1 } : null;
    } else if (command === 'design_memory_upsert') result = { accepted: true, written: (args?.records as DesignMemoryDraft[]).length };
    else if (command === 'design_memory_recall') result = { settings: clone(state), records: [clone(record)] };
    else if (command === 'design_memory_list') result = { records: [clone(record)], hasMore: false };
    else if (command === 'design_memory_clear') { memorySwitch(state, kind).generation++; result = 1; }
    else if (command === 'design_memory_correct') result = { ...clone(record), content: args?.content, revision: 2, userCorrected: true };
    else if (command === 'design_memory_delete') result = true;
    else if (command === 'design_memory_delete_source') result = 1;
    else throw new Error(`Unexpected command ${command}`);
    return result as T;
  };
  return { client: new DesignMemoryClient(transport), state, calls, overrides };
};

describe('opt-in Design Memory client', () => {
  it('is default OFF without reading originals or histories', async () => {
    const { client, calls } = fake();
    expect(client.peekSettings()).toEqual(DEFAULT_DESIGN_MEMORY_SETTINGS);
    expect(await client.acquire('chat-design', 'conversation')).toBeNull();
    expect((await client.recall({ query: '金属设计' })).records).toEqual([]);
    expect(calls.every(call => call.command === 'design_memory_get_settings')).toBe(true);
  });
  it('toggles independently and supports real native retrieval across sessions', async () => {
    const { client, state } = fake();
    await client.setEnabled('chat-design', true);
    expect(state.chatDesign.enabled).toBe(true); expect(state.drawerImage.enabled).toBe(false);
    const result = await client.recall({ query: '金属设计', projectId: 'new-project' });
    expect(result.records[0].sourceId).toBe('old-session');
    expect(client.isCurrent(result)).toBe(true);
    await client.setEnabled('drawer-image', true);
    await client.setEnabled('drawer-image', false);
    expect(client.peekSettings().chatDesign.enabled).toBe(true);
  });
  it('revokes pending writes synchronously before disable command completion', async () => {
    const { client, calls, overrides } = fake(); await client.setEnabled('chat-design', true);
    const ticket = await client.acquire('chat-design', 'old-session');
    const pending = deferred<DesignMemorySettings>(); overrides.set('design_memory_set_enabled', () => pending.promise);
    const disable = client.setEnabled('chat-design', false);
    expect(client.peekSettings().chatDesign.enabled).toBe(false);
    expect(await client.put(ticket, [record])).toEqual({ accepted: false, written: 0 });
    expect(calls.some(call => call.command === 'design_memory_upsert')).toBe(false);
    pending.resolve({ drawerImage: { enabled: false, generation: 0 }, chatDesign: { enabled: false, generation: 2 } });
    await disable;
  });
  it('does not revive old tickets after disable and reenable', async () => {
    const { client } = fake(); await client.setEnabled('chat-design', true);
    const ticket = await client.acquire('chat-design', 'old-session');
    await client.setEnabled('chat-design', false); await client.setEnabled('chat-design', true);
    expect((await client.put(ticket, [record])).accepted).toBe(false);
    const fresh = await client.acquire('chat-design', 'old-session');
    expect((await client.put(fresh, [record])).written).toBe(1);
  });
  it('drops in-flight retrieval completions across opt-out and reenable', async () => {
    const { client, overrides, state } = fake(); await client.setEnabled('chat-design', true);
    const pending = deferred<unknown>(); overrides.set('design_memory_recall', () => pending.promise);
    const recalled = client.recall({ query: '金属设计' }); await flush();
    const originalSettings = clone(state);
    await client.setEnabled('chat-design', false); await client.setEnabled('chat-design', true);
    pending.resolve({ settings: originalSettings, records: [record] });
    expect((await recalled).records).toEqual([]);
  });
  it('does not allow an old settings request to turn memory back on during opt-out', async () => {
    const { client, overrides, state } = fake(); await client.setEnabled('chat-design', true);
    const old = clone(state); const read = deferred<DesignMemorySettings>();
    overrides.set('design_memory_get_settings', () => read.promise);
    const refresh = client.getSettings();
    const pending = deferred<DesignMemorySettings>(); overrides.set('design_memory_set_enabled', () => pending.promise);
    const disable = client.setEnabled('chat-design', false);
    read.resolve(old); await refresh;
    expect(client.peekSettings().chatDesign.enabled).toBe(false);
    pending.resolve({ ...old, chatDesign: { enabled: false, generation: 2 } }); await disable;
  });
  it.each(['edit', 'delete', 'clear', 'source-deleted'] as const)('invalidates tickets on %s', async reason => {
    const { client } = fake(); await client.setEnabled('chat-design', true);
    const ticket = await client.acquire('chat-design', record.sourceId);
    if (reason === 'edit') await client.correct(record, '绿色塑料设计');
    if (reason === 'delete') await client.delete(record);
    if (reason === 'clear') await client.clear('chat-design');
    if (reason === 'source-deleted') await client.deleteSource('chat-design', record.sourceId);
    expect((await client.put(ticket, [record])).accepted).toBe(false);
  });
  it('allows explicit management while OFF but does not perform model retrieval', async () => {
    const { client, calls } = fake();
    expect((await client.list('chat-design')).records).toHaveLength(1);
    expect((await client.correct(record, '绿色塑料设计')).userCorrected).toBe(true);
    expect((await client.recall({ query: '塑料设计' })).records).toHaveLength(0);
    expect(calls.some(call => call.command === 'design_memory_recall')).toBe(false);
  });
  it('invalidates a whole explicit reindex batch after disable/reenable', async () => {
    const { client } = fake(); await client.setEnabled('drawer-image', true);
    const batch = await client.beginBatch('drawer-image'); expect(batch).not.toBeNull();
    expect(client.isBatchCurrent(batch)).toBe(true);
    await client.setEnabled('drawer-image', false); await client.setEnabled('drawer-image', true);
    expect(await client.checkBatch(batch)).toBe(false);
    expect(await client.acquire('drawer-image', 'next-old-image', batch)).toBeNull();
  });
  it('does not let an old acquire inherit the new opt-in generation', async () => {
    const { client, overrides, state } = fake(); await client.setEnabled('chat-design', true);
    const pending = deferred<unknown>(); overrides.set('design_memory_acquire_lease', () => pending.promise);
    const ticket = client.acquire('chat-design', 'session');
    await client.setEnabled('chat-design', false); await client.setEnabled('chat-design', true);
    pending.resolve({ kind: 'chat-design', sourceId: 'session', generation: state.chatDesign.generation, sourceRevision: 5 });
    expect(await ticket).toBeNull();
  });
  it('publishes local revocation to request cancellation subscribers immediately', async () => {
    const { client, overrides } = fake(); await client.setEnabled('chat-design', true);
    const subscriber = vi.fn(); client.subscribe(subscriber);
    const pending = deferred<DesignMemorySettings>(); overrides.set('design_memory_set_enabled', () => pending.promise);
    const off = client.setEnabled('chat-design', false);
    expect(subscriber).toHaveBeenCalledWith({ kinds: ['chat-design'], reason: 'settings' });
    pending.resolve(clone(DEFAULT_DESIGN_MEMORY_SETTINGS)); await off;
  });
  it('fails closed without substituting localStorage or cloud calls', async () => {
    const client = new DesignMemoryClient(async () => { throw new Error('database unavailable'); });
    await expect(client.acquire('chat-design', 'session')).rejects.toThrow('database unavailable');
    expect(client.peekSettings()).toEqual(DEFAULT_DESIGN_MEMORY_SETTINGS);
  });
  it('keeps a failed opt-out locally OFF even if a background refresh sees the old enabled state', async () => {
    const { client, overrides } = fake(); await client.setEnabled('chat-design', true);
    overrides.set('design_memory_set_enabled', () => { throw new Error('database locked'); });
    await expect(client.setEnabled('chat-design', false)).rejects.toThrow('database locked');
    await client.getSettings();
    expect(client.peekSettings().chatDesign.enabled).toBe(false);
    expect(await client.acquire('chat-design', 'session')).toBeNull();
    expect((await client.recall({ query: '金属设计' })).records).toHaveLength(0);
  });

});
