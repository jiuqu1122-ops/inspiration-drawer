import { renderToStaticMarkup } from 'react-dom/server';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatToolCall } from '../model/chatTypes';
import { loadRhinoStepPreviews } from '../storage/rhinoStepPreviews';
import { ChatRhinoStepPreview } from './ChatRhinoStepPreview';

vi.mock('../storage/rhinoStepPreviews', () => ({ loadRhinoStepPreviews: vi.fn() }));
// The project runs component tests in Node. Capture the committed effect so pending
// storage reads can be settled on either side of its cleanup, without timers or IndexedDB.
const frame = vi.hoisted(() => ({ urls: [] as string[] }));
vi.mock('react', async original => {
  const react = await original<typeof import('react')>();
  return { ...react, useEffect: vi.fn(), useState: (initial: unknown) => Array.isArray(initial)
    ? [frame.urls, (urls: string[]) => { frame.urls = urls; }] : react.useState(initial) };
});

const receipt = (marker: unknown, patch: Partial<ChatToolCall> = {}): ChatToolCall => ({
  messageId: 'message', id: 'call', toolName: 'rhino_review_viewport', status: 'completed', createdAt: 1,
  argumentsJson: '{}', resultJson: JSON.stringify({ rhinoStepPreview: marker }), ...patch,
});
const marked = receipt({ version: 1, count: 2 });
const render = (call = marked) => renderToStaticMarkup(<ChatRhinoStepPreview call={call} />);
const mount = (call = marked) => {
  expect(render(call)).toBe('');
  return vi.mocked(useEffect).mock.lastCall![0]() as () => void;
};
const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const raster = (type = 'image/jpeg') => new Blob(['raster fixture'], { type });
beforeEach(() => {
  frame.urls = [];
  vi.clearAllMocks();
  let seq = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:frame-${++seq}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('Rhino step preview', () => {
  it('does not mount a reader for missing, legacy, malformed, unrelated or non-completed receipts', () => {
    for (const call of [
      receipt(null), receipt({ version: 2, count: 1 }), ...[0, -1, 3, '1', 1.5].map(count => receipt({ version: 1, count })),
      { ...marked, resultJson: '{broken' }, { ...marked, resultJson: '{"viewportImageCount":2,"image":"data:image/png;base64,AAAA"}' },
      { ...marked, toolName: 'rhino_native_other' }, ...(['running', 'error', 'cancelled'] as const).map(status => ({ ...marked, status })),
    ]) expect(render(call)).toBe('');
    expect(useEffect).not.toHaveBeenCalled();
    expect(loadRhinoStepPreviews).not.toHaveBeenCalled();
  });

  it.each([1, 2])('uses only the first %i local blobs, reuses their URLs, and releases them on cleanup', async count => {
    const call = receipt({ version: 1, count }, { toolName: 'rhino_native_get_viewport_image' });
    vi.mocked(loadRhinoStepPreviews).mockResolvedValueOnce([raster(), raster('image/webp'), raster()]);
    const cleanup = mount(call);
    await settle();
    expect(loadRhinoStepPreviews).toHaveBeenCalledExactlyOnceWith(call.messageId, call.id);
    const html = render(call);
    expect(html.match(/aria-haspopup="dialog"/g)).toHaveLength(count);
    expect(html.match(/<img src="blob:frame-/g)).toHaveLength(count);
    expect(html).not.toContain('base64');
    cleanup();
    expect(vi.mocked(URL.revokeObjectURL).mock.calls.flat()).toEqual(frame.urls);
  });

  it('allocates nothing for an old read that resolves after switching receipt', async () => {
    let finish!: (blobs: Blob[]) => void;
    vi.mocked(loadRhinoStepPreviews).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const cleanupOld = mount();
    cleanupOld();
    const next = { ...marked, messageId: 'next-message' }; // call IDs can be reused across messages
    vi.mocked(loadRhinoStepPreviews).mockResolvedValueOnce([raster()]);
    const cleanupNew = mount(next);
    await settle();
    finish([raster(), raster()]);
    await settle();
    expect(loadRhinoStepPreviews).toHaveBeenLastCalledWith(next.messageId, next.id);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(frame.urls).toEqual(['blob:frame-1']);
    cleanupNew();
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:frame-1');
  });

  it('leaves no empty gallery or dialog when storage rejects, is empty, or contains unsafe blobs', async () => {
    for (const blobs of [null, [], [new Blob([]), raster('image/svg+xml')]]) {
      if (blobs) vi.mocked(loadRhinoStepPreviews).mockResolvedValueOnce(blobs);
      else vi.mocked(loadRhinoStepPreviews).mockRejectedValueOnce(new Error('no store'));
      const cleanup = mount();
      await settle();
      expect(render()).toBe('');
      cleanup();
    }
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
