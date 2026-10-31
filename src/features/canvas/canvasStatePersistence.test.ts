import { describe, expect, it, vi } from 'vitest';
import { createCanvasPersistedItemsCache, createCanvasStatePersistence } from './canvasStatePersistence';
import type { CanvasImageItem } from '../canvasModel';
import type { CanvasPersistedState } from '../../types/canvasRuntime';
const items: CanvasImageItem[] = [{ id: 'n', x: 0, y: 0, width: 100, height: 80,
  item: { id: 'a', type: 'image', content: '', createdAt: 1, thumbnail: 'data:image/png;base64,' + 'A'.repeat(4096) } }];
const state = (changes: Partial<CanvasPersistedState & { activeCanvasId: string }> = {}) => ({ activeCanvasId: 'c', items, size: { width: 4000, height: 3000 }, scale: 1, scroll: { left: 20, top: 30 }, updatedAt: 100, ...changes });
describe('post-zoom persistence transport', () => {
  it('reuses sanitized nodes for view changes but not immutable edits/new nodes', () => {
    const sanitize = createCanvasPersistedItemsCache(); const first = sanitize(items);
    for (let i = 0; i < 100; i++) expect(sanitize(items)).toBe(first);
    expect(sanitize([...items])).not.toBe(first);
    const edited = sanitize([{ ...items[0], x: 500 }]); expect(edited[0].x).toBe(500);
  });
  it('transports no node image data for 100 subsequent view-only saves', async () => {
    const invoke = vi.fn(async (command: string) => command === 'save_canvas_view_state' ? true : undefined);
    const save = createCanvasStatePersistence(invoke);
    await save(state());
    for (let i = 0; i < 100; i++) await save(state({ scale: 1 + i / 100, updatedAt: 101 + i }));
    expect(invoke.mock.calls.filter(([command]) => command === 'save_canvas_state')).toHaveLength(1);
    const calls = invoke.mock.calls.filter(([command]) => command === 'save_canvas_view_state');
    expect(calls).toHaveLength(100); expect(JSON.stringify(calls)).not.toContain('data:image');
    expect(JSON.stringify(calls)).not.toContain('items');
  });
  it('full-saves an edited node array or another canvas before using view-only saves', async () => {
    const invoke = vi.fn(async (_command: string, _args: Record<string, unknown>) => true); const save = createCanvasStatePersistence(invoke);
    await save(state()); await save(state({ items: [...items] })); await save(state({ activeCanvasId: 'other' }));
    expect(invoke.mock.calls.map(call => call[0])).toEqual(['save_canvas_state','save_canvas_state','save_canvas_state']);
  });
  it('does not use a light save after a failed full save, and serializes overlapping calls', async () => {
    let resolve!: () => void;
    const invoke = vi.fn().mockImplementationOnce(() => new Promise<void>(done => { resolve = done; })).mockResolvedValue(true);
    const save = createCanvasStatePersistence(invoke);
    const first = save(state()); const second = save(state({ scale: .4 })); await Promise.resolve();
    expect(invoke).toHaveBeenCalledTimes(1); resolve(); await Promise.all([first,second]);
    expect(invoke.mock.calls.map(call => call[0])).toEqual(['save_canvas_state','save_canvas_view_state']);
    const failing = vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined);
    const retry = createCanvasStatePersistence(failing); await expect(retry(state())).rejects.toThrow(); await retry(state());
    expect(failing.mock.calls.every(call => call[0] === 'save_canvas_state')).toBe(true);
  });
  it('falls back to a full authoritative state if native view storage rejects the canvas ID', async () => {
    const invoke = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(false).mockResolvedValueOnce(undefined);
    const save = createCanvasStatePersistence(invoke); await save(state()); await save(state({ scale: .5 }));
    expect(invoke.mock.calls.map(call => call[0])).toEqual(['save_canvas_state','save_canvas_view_state','save_canvas_state']);
  });
});
