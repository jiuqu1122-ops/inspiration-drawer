import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCanvasAiNodeAutoSize } from '../../canvasAiNodeLayout';
import type { CanvasImageItem } from '../../canvasModel';
import {
  createCanvasAiPromptEditorState, getCanvasAiPromptEditingBox, getCanvasAiPromptEditorLayout,
} from '../canvasAiPromptResize';
import {
  applyCanvasAiGeneratorDataPatchImpl, commitCanvasAiPromptDraftImpl, resizeCanvasAiPromptEditorImpl,
} from './canvasWorkflowEditorActions';

const createHarness = (scale = 1, type: 'image-generator' | 'video-generator' | 'workflow' = 'image-generator') => {
  const designSize = (item: CanvasImageItem, promptExpanded = false) => getCanvasAiNodeAutoSize({
    type: item.ai?.type as typeof type, promptText: item.item.content,
    promptExpanded, imageRulePanelExpanded: false,
    imageControlsWidth: item.ai?.imageControlsWidth, count: item.ai?.count,
  });
  const item: CanvasImageItem = {
    id: 'node', x: 25.125, y: 40.625, width: 0, height: 0,
    item: { id: 'prompt', type: 'text', content: '原始提示词', createdAt: 0 },
    ai: { type, status: 'idle', imagePolicy: { panelExpanded: false } },
  };
  const size = designSize(item);
  item.width = size.width * scale;
  item.height = size.height * scale;
  const canvasItemsRef = { current: [item] };
  const canvasAiPromptEditorStateRef = { current: createCanvasAiPromptEditorState() };
  const context = {
    canvasItemsRef, canvasAiPromptEditorStateRef,
    canvasAiPromptTextAreaRefs: { current: {} as Record<string, HTMLTextAreaElement> },
    canvasAiPromptEditingId: null as string | null,
    onCanvasAiPromptEditorChange: vi.fn(),
    getCanvasAiNodeDesignSizeForItem: vi.fn(designSize),
    updateCanvasItemsImmediate: vi.fn((updater: (items: CanvasImageItem[]) => CanvasImageItem[]) => {
      canvasItemsRef.current = updater(canvasItemsRef.current);
      return canvasItemsRef.current;
    }),
    canvasGroupResizeRef: { current: null }, canvasResizeRef: { current: null },
  };
  const focus = () => {
    resizeCanvasAiPromptEditorImpl(context, item.id, true, false);
    context.canvasAiPromptEditingId = item.id;
  };
  const blur = () => {
    resizeCanvasAiPromptEditorImpl(context, item.id, false, true);
    context.canvasAiPromptEditingId = null;
  };
  const getItem = () => canvasItemsRef.current[0];
  const getSession = () => canvasAiPromptEditorStateRef.current.sessions[item.id]!;
  return { item, context, focus, blur, getItem, getSession, state: canvasAiPromptEditorStateRef.current };
};

describe('image prompt edit actions', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it.each([0.25, 0.5, 1, 1.37, 3])('does not drift or persist dimensions across 100 cycles at scale %s', scale => {
    const h = createHarness(scale);
    const initialGeometry = [h.item.x, h.item.y, h.item.width, h.item.height];
    for (let cycle = 0; cycle < 100; cycle++) {
      h.focus();
      const firstSession = h.getSession();
      resizeCanvasAiPromptEditorImpl(h.context, h.item.id, true, false);
      expect(h.getSession()).toBe(firstSession);
      h.state.sessions[h.item.id] = { ...firstSession, promptHeight: 211.125 + cycle * 19.75 };
      expect(getCanvasAiPromptEditingBox(h.getItem(), h.state.sessions)?.height).toBeGreaterThan(h.item.height);
      const text = `第${cycle}轮\n${'长文本与组合输入 👩‍🎨 é '.repeat(cycle * 5 + 1)}`;
      const next = applyCanvasAiGeneratorDataPatchImpl(h.context, h.getItem(), { prompt: text }, text);
      h.context.canvasItemsRef.current = [next];
      expect([next.x, next.y, next.width, next.height]).toEqual(initialGeometry);
      h.blur();
      expect(h.getItem().item.content).toBe(text);
      expect(getCanvasAiPromptEditingBox(h.getItem(), h.state.sessions)).toBeNull();
      expect([h.getItem().x, h.getItem().y, h.getItem().width, h.getItem().height]).toEqual(initialGeometry);
    }
    expect(h.context.updateCanvasItemsImmediate).not.toHaveBeenCalled();
  });

  it('commits the latest DOM value on true exit without overwriting text or adopting the temporary size', () => {
    const h = createHarness(0.7);
    const latestText = '设计约束\n'.repeat(10_000) + '最终输入：中文 👨‍👩‍👧‍👦 é';
    h.context.canvasAiPromptTextAreaRefs.current[h.item.id] = { value: latestText } as HTMLTextAreaElement;
    h.focus();
    expect(h.getSession().promptHeight).toBe(320);
    h.state.sessions[h.item.id] = { ...h.getSession(), promptHeight: 1_600.125 };
    const original = { width: h.item.width, height: h.item.height };
    const clearTimeout = vi.fn();
    vi.stubGlobal('window', { clearTimeout });
    const timers: Record<string, number> = { [h.item.id]: 123 };
    const drafts: Record<string, string> = { [h.item.id]: '更早的防抖草稿' };
    const update = vi.fn((id: string, patch: Partial<NonNullable<CanvasImageItem['ai']>>, content?: string) => {
      h.context.canvasItemsRef.current = h.context.canvasItemsRef.current.map(item => item.id === id
        ? applyCanvasAiGeneratorDataPatchImpl(h.context, item, patch, content) : item);
      return h.getItem();
    });
    commitCanvasAiPromptDraftImpl({
      canvasAiPromptDraftTimersRef: { current: timers }, canvasAiPromptDraftValuesRef: { current: drafts },
      canvasItemsRef: h.context.canvasItemsRef, updateCanvasAiGeneratorData: update,
    }, h.item.id, latestText, true);
    h.blur();
    expect(h.getItem().item.content).toBe(latestText);
    expect(h.getItem().ai?.prompt).toBe(latestText);
    expect(h.getItem()).toMatchObject(original);
    expect(clearTimeout).toHaveBeenCalledExactlyOnceWith(123);
    expect(timers).toEqual({});
    expect(drafts).toEqual({});
    expect(update).toHaveBeenCalledTimes(1);
    expect(h.state.sessions).toEqual({});
    expect(h.context.updateCanvasItemsImmediate).not.toHaveBeenCalled();
  });

  it('keeps a debounced composing draft while resizing, then commits the last draft on exit', () => {
    const h = createHarness();
    h.focus();
    const draft = '正在编辑的设计需求：材质、CMF、尺寸、使用场景\n'.repeat(3_000);
    const drafts: Record<string, string> = { [h.item.id]: draft };
    h.state.sessions[h.item.id] = { ...h.getSession(), promptHeight: 888 };
    const layout = getCanvasAiPromptEditorLayout(h.getItem(), h.getSession());
    expect(layout?.promptHeight).toBe(888);
    expect(drafts[h.item.id]).toBe(draft);
    expect(h.getItem().item.content).toBe('原始提示词');
    commitCanvasAiPromptDraftImpl({
      canvasAiPromptDraftTimersRef: { current: {} }, canvasAiPromptDraftValuesRef: { current: drafts },
      canvasItemsRef: h.context.canvasItemsRef,
      updateCanvasAiGeneratorData: (id, patch, content) => {
        h.context.canvasItemsRef.current = h.context.canvasItemsRef.current.map(item => item.id === id
          ? applyCanvasAiGeneratorDataPatchImpl(h.context, item, patch, content) : item);
        return h.getItem();
      },
    }, h.item.id, undefined, true);
    h.blur();
    expect(h.getItem().item.content).toBe(draft);
    expect(h.getItem().height).toBe(h.item.height);
  });

  it('retains serializable persistent geometry throughout the editing session', () => {
    const h = createHarness(1.375);
    const persisted = JSON.stringify(h.getItem());
    h.focus();
    h.state.sessions[h.item.id] = { ...h.getSession(), promptHeight: 2_048 };
    expect(JSON.stringify(h.getItem())).toBe(persisted);
    expect(JSON.stringify(h.getItem())).not.toContain('promptHeight');
    expect(JSON.stringify(h.getItem())).not.toContain('originalBox');
    h.blur();
    expect(JSON.stringify(h.getItem())).toBe(persisted);
  });

  it('cancels active resize before deleting a session even if the node was removed', () => {
    const h = createHarness();
    h.focus();
    const cancel = vi.fn();
    h.state.cancelResize = cancel;
    h.context.canvasItemsRef.current = [];
    h.blur();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(h.state.sessions).toEqual({});
    expect(h.context.updateCanvasItemsImmediate).not.toHaveBeenCalled();
  });

  it('preserves video prompt expansion and proportional scale', () => {
    const h = createHarness(1.73, 'video-generator');
    const before = { width: h.item.width, height: h.item.height };
    h.focus();
    expect(h.state.sessions).toEqual({});
    expect(h.getItem().height).toBeGreaterThan(before.height);
    expect(h.getItem().width).toBeCloseTo(before.width, 10);
    h.blur();
    expect(h.getItem().width).toBeCloseTo(before.width, 10);
    expect(h.getItem().height).toBeCloseTo(before.height, 10);
  });

  it('keeps normal automatic sizing outside an image edit session', () => {
    const h = createHarness(0.75);
    const next = applyCanvasAiGeneratorDataPatchImpl(h.context, h.item, { imageControlsWidth: 928 });
    expect(next.width).toBe(928 * 0.75);
    expect(next.height).toBe(h.context.getCanvasAiNodeDesignSizeForItem(next, false).height * 0.75);
    expect(next.x).toBe(h.item.x);
    expect(next.y).toBe(h.item.y);
  });
});
