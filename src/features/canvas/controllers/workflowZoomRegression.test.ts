import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorkflowZoomScenario } from '../testing/workflowZoomScenario';
import { getCanvasAiNodeDesignSizeForItemImpl, beginCanvasZoomInteractionImpl, finishCanvasZoomInteractionImpl } from './canvasPersistenceActions';
import { zoomCanvasAtImpl } from './canvasInteractionActions';
import { getCanvasItemRenderedBoxImpl } from '../../drawer/controllers/drawerRenderActions';
import { getCanvasAiOutputForAction, getCanvasAiOutputPreviewSlots, normalizeCanvasWorkflowRuntimeSnapshots } from '../../../utils/canvasWorkflowRuntime';
import * as serialization from '../../../utils/canvasSerialization';
import { getCanvasWorkflowTemplateFromNode } from '../../../utils/canvasItemSelectors';
import type { CanvasImageItem } from '../../canvasModel';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false, invoke: vi.fn(), convertFileSrc: (path: string) => `asset://${path}` }));

const ref = <T>(current: T) => ({ current });
const measure = (item: CanvasImageItem, prompt = false, outputs = false) => getCanvasAiNodeDesignSizeForItemImpl({}, item, prompt, outputs);

export const createZoomHarness = () => {
  const layer = { style: { willChange: '', transform: '' } };
  const surface = { scrollLeft: 0, scrollTop: 0, clientWidth: 900, clientHeight: 700,
    getBoundingClientRect: () => ({ left: 0, top: 0 }), setAttribute: vi.fn(), removeAttribute: vi.fn(),
  } as unknown as HTMLDivElement;
  const state = {
    canvasContentRef: ref(layer as unknown as HTMLDivElement), canvasSurfaceRef: ref(surface),
    isCanvasZoomingRef: ref(false), canvasViewportFrameRef: ref<number | null>(null),
    canvasViewportDeferredDuringZoomRef: ref(false), canvasScaleRef: ref(1),
    canvasSizeRef: ref({ width: 2000, height: 2000 }), canvasSizeCommitDeferredRef: ref(false),
    canvasVisualViewportRef: ref<{ x: number; y: number; width: number; height: number } | null>(null),
    canvasZoomSettleTimerRef: ref<number | null>(null), canvasScrollLockRef: ref({ left: 0, top: 0 }),
    canvasPersistSaveSyncNodesRef: ref(false), canvasStateSaveDeferredDuringZoomRef: ref(false),
    cancelCanvasImageSourceUpgradeQueue: vi.fn(), downgradeCanvasPreviewSources: vi.fn(),
    applyCanvasScaleStyles: vi.fn(), scheduleCanvasScaleRenderSync: vi.fn(),
    scheduleCanvasStateSave: vi.fn(), scheduleCanvasViewportUpdate: vi.fn(),
    scheduleCanvasVisibleImageSourceUpgrades: vi.fn(), setCanvasSize: vi.fn(), writeCanvasSurfaceScroll: vi.fn(),
  };
  const begin = () => beginCanvasZoomInteractionImpl(state);
  const finish = () => finishCanvasZoomInteractionImpl(state);
  const zoom = (delta: number) => zoomCanvasAtImpl({ ...state, beginCanvasZoomInteraction: begin,
    growCanvasToFit: vi.fn(), commitCanvasScaleSoon: vi.fn() }, 450, 350, delta);
  return { state, zoom, finish };
};

describe('workflow waiting/result and canvas zoom intersection', () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('keeps one submission and execution instance through 100 seconds, zoom, result, and more zoom', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', { getItem: () => null });
    const scenario = createWorkflowZoomScenario({ id: 'result', status: 'success', path: '/fixture/result.png',
      url: 'https://example.test/result.png', width: 1024, height: 768 });
    const clone = vi.spyOn(serialization, 'cloneDrawerValue');
    const execution = scenario.start();
    await vi.advanceTimersByTimeAsync(100_000);
    expect(scenario.submissions).toBe(1);
    const zoom = createZoomHarness();
    const previews = getCanvasAiOutputPreviewSlots(scenario.item);
    const size = measure(scenario.item);
    const timerCopy = { ...scenario.item, ai: { ...scenario.item.ai!, generatedAt: Date.now() + 1000 } };
    expect(getCanvasAiOutputPreviewSlots(timerCopy)).toBe(previews);
    expect(measure(timerCopy)).toBe(size);
    const clonesWhileWaiting = clone.mock.calls.length;
    for (let i = 0; i < 200; i++) {
      zoom.zoom(i % 2 ? -70 : 70);
      getCanvasItemRenderedBoxImpl({ getCanvasAiNodeDesignSizeForItem: measure }, scenario.item);
      expect(getCanvasAiOutputPreviewSlots(scenario.item)).toBe(previews);
      expect(measure(scenario.item)).toBe(size);
      if (i % 10 === 0) zoom.finish();
    }
    expect(clone.mock.calls.length).toBe(clonesWhileWaiting);
    zoom.zoom(-60);
    scenario.injectResult();
    await execution; // Result arrives while zoom is active, without a mounted CanvasNode.
    expect(scenario.item.ai?.status).toBe('success');
    expect(getCanvasAiOutputPreviewSlots(scenario.item)[0]).toMatchObject({ path: '/fixture/result.png', status: 'success', width: 1024 });
    const completed = getCanvasAiOutputPreviewSlots(scenario.item);
    const clonesAfterResult = clone.mock.calls.length;
    for (let i = 0; i < 200; i++) { zoom.zoom(i % 2 ? 70 : -70); measure(scenario.item); }
    zoom.finish();
    expect(getCanvasAiOutputPreviewSlots(scenario.item)).toBe(completed);
    expect(clone.mock.calls.length).toBe(clonesAfterResult);
    expect(scenario.submissions).toBe(1);
    expect(scenario.instances).toBe(1);
    expect(scenario.activeNodes.size).toBe(0);
    expect(scenario.runTokens.size).toBe(0);
    expect(zoom.state.downgradeCanvasPreviewSources).not.toHaveBeenCalled();
  });

  it('never reads runtime item payloads on the readonly size path; restoration still isolates outputs', () => {
    const scenario = createWorkflowZoomScenario({ id: 'out' });
    let payloadReads = 0;
    const snapshot = { templateId: 'image', ai: { outputs: [{ id: 'out', width: 320, height: 180 }] },
      get item(): never { payloadReads++; throw new Error('Render read a full snapshot payload'); },
    };
    scenario.item.ai!.workflowRuntime = { nodeSnapshots: { image: snapshot } };
    for (let i = 0; i < 500; i++) { measure(scenario.item); getCanvasAiOutputPreviewSlots(scenario.item); }
    expect(payloadReads).toBe(0);
    const runtime = { nodeSnapshots: { image: { templateId: 'image', ai: { outputs: [{ id: 'out', width: 320 }] } } } };
    const restored = normalizeCanvasWorkflowRuntimeSnapshots(runtime);
    restored[0].ai!.outputs![0].width = 999;
    expect(runtime.nodeSnapshots.image.ai.outputs[0].width).toBe(320);
  });

  it('keeps execution metadata out of previews but resolves provenance for explicit copy actions', () => {
    const scenario = createWorkflowZoomScenario({ id: 'out' });
    const raw = { id: 'out', prompt: 'original internal prompt', taskId: 'task-123', width: 1000, height: 800 };
    scenario.item.ai!.workflowRuntime = { nodeSnapshots: { image: { templateId: 'image', ai: { outputs: [raw] } } } };
    const preview = getCanvasAiOutputPreviewSlots(scenario.item)[0];
    expect(preview.prompt).toBeUndefined();
    expect(preview.taskId).toBeUndefined();
    expect(getCanvasAiOutputForAction(scenario.item, preview, 0)).toMatchObject({ prompt: raw.prompt, taskId: raw.taskId, id: preview.id });
    expect(raw.id).toBe('out');
  });

  it('invalidates on results, mode, ratio, slot count, prompt and expanded controls; ordinary nodes remain correct', () => {
    const scenario = createWorkflowZoomScenario({ id: 'out' });
    const original = getCanvasAiOutputPreviewSlots(scenario.item);
    const withOutput = { ...scenario.item, ai: { ...scenario.item.ai!, workflowOutputMode: 'final' as const,
      outputs: [{ id: 'complete', status: 'success' as const, width: 900, height: 1600 }] } };
    expect(getCanvasAiOutputPreviewSlots(withOutput)).not.toBe(original);
    expect(measure(withOutput)).not.toBe(measure(scenario.item));
    expect(measure(withOutput, true)).not.toBe(measure(withOutput));
    expect(measure(withOutput, false, true)).not.toBe(measure(withOutput));
    const template = getCanvasWorkflowTemplateFromNode(scenario.item)!;
    const workflow = { ...template, nodes: template.nodes.map(node => ({
      ...node, ai: { ...node.ai!, count: 8, aspectRatio: '9:16' },
    })) };
    const newSlots = { ...scenario.item, ai: { ...scenario.item.ai!, workflow } };
    expect(getCanvasAiOutputPreviewSlots(newSlots)).toHaveLength(8);
    expect(measure(newSlots)).not.toBe(measure(scenario.item));
    const ordinary = { ...scenario.item, ai: { type: 'image-generator' as const, count: 2, aspectRatio: '1:1' } };
    expect(getCanvasAiOutputPreviewSlots(ordinary)).toHaveLength(2);
    const ratio = { ...ordinary, ai: { ...ordinary.ai, aspectRatio: '9:16' } };
    expect(getCanvasAiOutputPreviewSlots(ratio)[0].height).not.toBe(getCanvasAiOutputPreviewSlots(ordinary)[0].height);
    // With no real outputs, ordinary generators intentionally hide previews.
    expect(measure(ratio)).toEqual(measure(ordinary));
    const changedPrompt = { ...ordinary, item: { ...ordinary.item, content: 'long prompt '.repeat(100) } };
    expect(measure(changedPrompt, true)).not.toBe(measure(ordinary, true));
  });
});
