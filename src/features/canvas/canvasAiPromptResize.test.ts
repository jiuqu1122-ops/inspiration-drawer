import { describe, expect, it, vi } from 'vitest';
import { CANVAS_AI_PROMPT_EDIT_MIN_HEIGHT, getCanvasAiNodeAutoSize } from '../canvasAiNodeLayout';
import type { CanvasImageItem } from '../canvasModel';
import {
  createCanvasAiPromptEditorState, createCanvasAiPromptEditSession, disposeCanvasAiPromptEditorState,
  finishCanvasAiPromptEditSession, getCanvasAiPromptEditingBox, getCanvasAiPromptEditorLayout,
  getCanvasAiPromptHeightFromPointer, isCanvasAiPromptResizeHandleTarget, startCanvasAiPromptResize,
  type CanvasAiPromptResizePointerEvent,
} from './canvasAiPromptResize';

const createItem = (scale = 1): CanvasImageItem => {
  const size = getCanvasAiNodeAutoSize({ type: 'image-generator', imageRulePanelExpanded: false });
  return {
    id: 'image-node', x: 123.456, y: 78.901, width: size.width * scale, height: size.height * scale,
    item: { id: 'prompt', type: 'text', content: '产品设计', createdAt: 0 },
    ai: { type: 'image-generator', imagePolicy: { panelExpanded: false } },
  };
};

const createPointerHarness = (nodeScale = 1, zoom = 1) => {
  const item = createItem(nodeScale);
  const original = structuredClone(item);
  const state = createCanvasAiPromptEditorState();
  state.sessions[item.id] = createCanvasAiPromptEditSession(item,
    getCanvasAiNodeAutoSize({ type: 'image-generator', imageRulePanelExpanded: false }));
  const initialSession = state.sessions[item.id]!;
  const events = new EventTarget();
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  const ownerWindow = {
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    }),
    cancelAnimationFrame: vi.fn((frame: number) => frames.delete(frame)),
    addEventListener: vi.fn((...args: Parameters<EventTarget['addEventListener']>) => events.addEventListener(...args)),
    removeEventListener: vi.fn((...args: Parameters<EventTarget['removeEventListener']>) => events.removeEventListener(...args)),
  };
  const target = Object.assign(new EventTarget(), {
    ownerDocument: { defaultView: ownerWindow },
    setPointerCapture: vi.fn(), hasPointerCapture: vi.fn(() => true), releasePointerCapture: vi.fn(),
    focus: vi.fn(), blur: vi.fn(),
  });
  const context = {
    canvasAiPromptEditorStateRef: { current: state },
    onCanvasAiPromptEditorChange: vi.fn(),
    // Include viewport translation to catch accidentally using raw client coordinates.
    getCanvasPointFromClient: vi.fn((x: number, y: number) => ({ x: (x - 75) / zoom, y: (y - 120) / zoom })),
  };
  const down: CanvasAiPromptResizePointerEvent = {
    button: 0, isPrimary: true, pointerId: 7, clientX: 300, clientY: 400,
    currentTarget: target as unknown as HTMLElement, preventDefault: vi.fn(), stopPropagation: vi.fn(),
  };
  const send = (type: string, y = down.clientY, pointerId = down.pointerId) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { clientX: down.clientX, clientY: y, pointerId });
    (type === 'lostpointercapture' ? target : events).dispatchEvent(event);
    return event;
  };
  const flushFrames = () => {
    const current = Array.from(frames.values());
    frames.clear();
    current.forEach(callback => callback(0));
  };
  return { item, original, state, initialSession, context, down, target, ownerWindow, frames,
    send, flushFrames, start: () => startCanvasAiPromptResize(context, down, item.id) };
};

describe('temporary prompt layout geometry', () => {
  it.each([0.25, 0.5, 1, 1.73, 3])('gives all new height to the prompt at node scale %s', scale => {
    const item = createItem(scale);
    const original = structuredClone(item);
    const size = getCanvasAiNodeAutoSize({ type: 'image-generator', imageRulePanelExpanded: false });
    const session = createCanvasAiPromptEditSession(item, size);
    const initial = getCanvasAiPromptEditorLayout(item, session)!;
    const taller = getCanvasAiPromptEditorLayout(item, { ...session, promptHeight: session.promptHeight + 377.25 })!;
    expect(taller.designSize.width).toBe(initial.designSize.width);
    expect(taller.designSize.height - initial.designSize.height).toBeCloseTo(377.25, 10);
    expect(taller.box.height - initial.box.height).toBeCloseTo(377.25 * scale, 10);
    expect(taller.promptHeight - initial.promptHeight).toBe(377.25);
    expect(taller.nodeScale).toBe(scale);
    expect(taller.box.width).toBe(item.width);
    expect([taller.box.x, taller.box.y]).toEqual([item.x, item.y]);
    expect(item).toEqual(original);
  });

  it('snapshots its inputs and does not undo a legitimate position change', () => {
    const item = createItem();
    const size = getCanvasAiNodeAutoSize({ type: 'image-generator' });
    const session = createCanvasAiPromptEditSession(item, size);
    const oldWidth = session.collapsedDesignSize.width;
    size.width += 100;
    expect(session.collapsedDesignSize.width).toBe(oldWidth);
    expect(getCanvasAiPromptEditorLayout({ ...item, x: 999, y: 888 }, session)?.box)
      .toMatchObject({ x: 999, y: 888, width: item.width });
  });

  it('does not leak prompt editing geometry to video, workflow, or normal nodes', () => {
    const item = createItem();
    const session = createCanvasAiPromptEditSession(item, { width: 640, height: 560 });
    expect(getCanvasAiPromptEditorLayout(item, undefined)).toBeNull();
    expect(getCanvasAiPromptEditingBox(item, {})).toBeNull();
    for (const type of ['video-generator', 'workflow'] as const) {
      expect(getCanvasAiPromptEditorLayout({ ...item, ai: { type } }, session)).toBeNull();
    }
    expect(getCanvasAiPromptEditorLayout({ ...item, ai: undefined }, session)).toBeNull();
  });

  it.each([NaN, Infinity, -Infinity, -10_000])('handles an invalid or too-small height %s', height => {
    expect(getCanvasAiPromptHeightFromPointer(200, 0, height, 1)).toBeGreaterThanOrEqual(CANVAS_AI_PROMPT_EDIT_MIN_HEIGHT);
    expect(getCanvasAiPromptHeightFromPointer(200, 0, 100, height)).toBe(200);
  });

  it('only treats the same node’s dedicated handle as an internal blur', () => {
    const own = { closest: () => ({ getAttribute: () => 'image-node' }) } as unknown as EventTarget;
    const other = { closest: () => ({ getAttribute: () => 'other-node' }) } as unknown as EventTarget;
    const outside = { closest: () => null } as unknown as EventTarget;
    expect(isCanvasAiPromptResizeHandleTarget(own, 'image-node')).toBe(true);
    expect(isCanvasAiPromptResizeHandleTarget(other, 'image-node')).toBe(false);
    expect(isCanvasAiPromptResizeHandleTarget(outside, 'image-node')).toBe(false);
    expect(isCanvasAiPromptResizeHandleTarget(null, 'image-node')).toBe(false);
    expect(isCanvasAiPromptResizeHandleTarget(new EventTarget(), 'image-node')).toBe(false);
  });
});

describe('prompt resize pointer lifecycle', () => {
  const scales = [0.25, 0.5, 1, 1.7, 3].flatMap(nodeScale =>
    [0.1, 0.25, 0.75, 1, 2, 3].map(zoom => ({ nodeScale, zoom })));
  it.each(scales)('uses world coordinates at node=$nodeScale, canvas=$zoom', ({ nodeScale, zoom }) => {
    const h = createPointerHarness(nodeScale, zoom);
    expect(h.start()).toBe(true);
    h.send('pointermove', 490);
    h.flushFrames();
    const layout = getCanvasAiPromptEditorLayout(h.item, h.state.sessions[h.item.id])!;
    expect(layout.promptHeight).toBeCloseTo(h.initialSession.promptHeight + 90 / zoom / nodeScale, 8);
    const originalLayout = getCanvasAiPromptEditorLayout(h.item, h.initialSession)!;
    expect(layout.box.height - originalLayout.box.height).toBeCloseTo(90 / zoom, 8);
    expect(layout.box.width).toBe(h.item.width);
    expect(layout.nodeScale).toBe(nodeScale);
    expect(h.item).toEqual(h.original);
    h.send('pointerup', 490);
  });

  it('coalesces moves into one frame, preserving focus and composition', () => {
    const h = createPointerHarness();
    h.start();
    h.send('pointermove', 420);
    h.send('pointermove', 440);
    h.send('pointermove', 480);
    expect(h.frames.size).toBe(1);
    expect(h.context.onCanvasAiPromptEditorChange).not.toHaveBeenCalled();
    h.flushFrames();
    expect(h.context.onCanvasAiPromptEditorChange).toHaveBeenCalledTimes(1);
    expect(h.state.sessions[h.item.id]?.promptHeight).toBe(h.initialSession.promptHeight + 80);
    expect(h.down.preventDefault).toHaveBeenCalled();
    expect(h.down.stopPropagation).toHaveBeenCalled();
    expect(h.target.focus).not.toHaveBeenCalled();
    expect(h.target.blur).not.toHaveBeenCalled();
    h.send('pointerup', 480);
    expect(h.context.onCanvasAiPromptEditorChange).toHaveBeenCalledTimes(1);
  });

  it('uses pointerup’s final position even before the queued frame', () => {
    const h = createPointerHarness();
    h.start();
    h.send('pointermove', 410);
    h.send('pointerup', 515);
    expect(h.state.sessions[h.item.id]?.promptHeight).toBe(h.initialSession.promptHeight + 115);
    expect(h.frames.size).toBe(0);
    expect(h.state.cancelResize).toBeNull();
    expect(h.ownerWindow.removeEventListener).toHaveBeenCalledTimes(4);
    expect(h.target.releasePointerCapture).toHaveBeenCalledWith(7);
    const count = h.context.onCanvasAiPromptEditorChange.mock.calls.length;
    h.send('pointermove', 800);
    h.flushFrames();
    expect(h.context.onCanvasAiPromptEditorChange).toHaveBeenCalledTimes(count);
  });

  it('supports pulling up to the minimum and starting a second drag from there', () => {
    const h = createPointerHarness();
    h.start();
    h.send('pointerup', -1000);
    expect(h.state.sessions[h.item.id]?.promptHeight).toBe(CANVAS_AI_PROMPT_EDIT_MIN_HEIGHT);
    h.start();
    h.send('pointerup', 450);
    expect(h.state.sessions[h.item.id]?.promptHeight).toBe(CANVAS_AI_PROMPT_EDIT_MIN_HEIGHT + 50);
  });

  it.each(['pointercancel', 'lostpointercapture', 'blur'])('cancels and cleans up on %s', type => {
    const h = createPointerHarness();
    h.start();
    h.send('pointermove', 470);
    h.flushFrames();
    h.send('pointermove', 490);
    const queued = Array.from(h.frames.values());
    h.send(type);
    expect(h.state.sessions[h.item.id]?.promptHeight).toBe(h.initialSession.promptHeight);
    expect(h.frames.size).toBe(0);
    expect(h.state.cancelResize).toBeNull();
    expect(h.ownerWindow.removeEventListener).toHaveBeenCalledTimes(4);
    queued.forEach(callback => callback(0));
    expect(h.state.sessions[h.item.id]?.promptHeight).toBe(h.initialSession.promptHeight);
  });

  it('ignores another pointer and rejects nonprimary or nonediting gestures', () => {
    const h = createPointerHarness();
    expect(startCanvasAiPromptResize(h.context, { ...h.down, button: 2 }, h.item.id)).toBe(false);
    expect(startCanvasAiPromptResize(h.context, { ...h.down, isPrimary: false }, h.item.id)).toBe(false);
    expect(startCanvasAiPromptResize(h.context, h.down, 'not-editing')).toBe(false);
    h.start();
    h.send('pointermove', 800, 99);
    h.send('pointerup', 800, 99);
    h.send('pointercancel', 800, 99);
    expect(h.frames.size).toBe(0);
    expect(h.state.cancelResize).not.toBeNull();
    h.send('pointerup', 400);
  });

  it('falls back to window events when pointer capture is unavailable', () => {
    const h = createPointerHarness();
    h.target.setPointerCapture.mockImplementation(() => { throw new Error('detached'); });
    h.start();
    h.send('pointerup', 475);
    expect(h.state.sessions[h.item.id]?.promptHeight).toBe(h.initialSession.promptHeight + 75);
    expect(h.state.cancelResize).toBeNull();
  });

  it('finishes a removed node and invalidates any queued callback before the next edit', () => {
    const h = createPointerHarness();
    h.start();
    h.send('pointermove', 490);
    const queued = Array.from(h.frames.values());
    finishCanvasAiPromptEditSession(h.context, h.item.id);
    expect(h.state.sessions).toEqual({});
    h.state.sessions[h.item.id] = createCanvasAiPromptEditSession(h.item,
      getCanvasAiNodeAutoSize({ type: 'image-generator', imageRulePanelExpanded: false }));
    const nextSession = h.state.sessions[h.item.id];
    queued.forEach(callback => callback(0));
    expect(h.state.sessions[h.item.id]).toBe(nextSession);
    expect(h.state.cancelResize).toBeNull();
    disposeCanvasAiPromptEditorState(h.state);
    expect(h.state.sessions).toEqual({});
  });

  it('releases active pointer listeners when the canvas is unmounted', () => {
    const h = createPointerHarness();
    h.start();
    h.send('pointermove', 490);
    disposeCanvasAiPromptEditorState(h.state);
    expect(h.frames.size).toBe(0);
    expect(h.state.sessions).toEqual({});
    expect(h.state.cancelResize).toBeNull();
    expect(h.ownerWindow.removeEventListener).toHaveBeenCalledTimes(4);
  });
});
