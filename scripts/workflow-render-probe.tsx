// Development-only fixture, absent from the production Vite inputs. Uses no
// user database/API credentials, and sends no real generation request.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import '../src/index.css';
import { CanvasNodeLayer } from '../src/features/canvas/components/CanvasNodeLayer';
import { createWorkflowZoomScenario } from '../src/features/canvas/testing/workflowZoomScenario';
import { getCanvasAiNodeDesignSizeForItemImpl, beginCanvasZoomInteractionImpl, finishCanvasZoomInteractionImpl } from '../src/features/canvas/controllers/canvasPersistenceActions';
import { zoomCanvasAtImpl } from '../src/features/canvas/controllers/canvasInteractionActions';
import { getCanvasAiOutputPreviewSlots } from '../src/utils/canvasWorkflowRuntime';
import { installRendererDiagnostics, CANVAS_ZOOM_LAYER_PROMOTION_KEY } from '../src/utils/rendererDiagnostics';
import type { CanvasImageItem } from '../src/features/canvasModel';

const ref = <T,>(current: T) => ({ current });
const noAction = () => {};
const diagnosticErrors: string[] = [];
window.addEventListener('error', event => diagnosticErrors.push(event.error?.name || 'Error'));
window.addEventListener('unhandledrejection', () => diagnosticErrors.push('Rejection'));
const promotion = new URLSearchParams(location.search).get('promote') === 'true';
const waitMs = new URLSearchParams(location.search).get('quick') === 'true' ? 0 : 100_000;
const noZoom = new URLSearchParams(location.search).get('nozoom') === 'true';
localStorage.setItem(CANVAS_ZOOM_LAYER_PROMOTION_KEY, String(promotion));
installRendererDiagnostics();

const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768"><rect width="1024" height="768" fill="#bfc8ae"/><circle cx="512" cy="384" r="210" fill="#f2f0dd"/></svg>');
const scenario = createWorkflowZoomScenario({ id: 'probe-result', status: 'success', path: 'fixture-result.png',
  thumbnail: image, width: 1024, height: 768 });
(window as Window & { reportReopenProbe: () => void }).reportReopenProbe = () => {
  void invoke('probe_result', { result: { submissions: scenario.submissions, instances: scenario.instances,
    status: scenario.item.ai?.status, resultPresent: !!getCanvasAiOutputPreviewSlots(scenario.item)[0]?.path } });
};
// A large, unrelated snapshot payload makes accidental render cloning visible.
scenario.item.ai!.workflowRuntime = { nodeSnapshots: { image: { templateId: 'image',
  item: { content: 'fixture-payload '.repeat(140_000) }, ai: { outputs: [] } } } };
const ordinary: CanvasImageItem = { ...scenario.item, id: 'probe-ordinary', x: 680,
  item: { ...scenario.item.item, id: 'ordinary-item', content: '普通生图节点' },
  ai: { type: 'image-generator', aspectRatio: '1:1', count: 1, status: 'success', outputs: [{
    id: 'ordinary-result', status: 'success', path: 'ordinary-fixture.png', thumbnail: image, width: 1024, height: 768,
  }] } };
const getSize = (item: CanvasImageItem, prompt = false, outputs = false) => getCanvasAiNodeDesignSizeForItemImpl({}, item, prompt, outputs);
const scopeBase: Record<string, any> = new Proxy({
  canvasAgent: { settings: { apiProvider: 'openai-compatible', apiCredentialSource: 'local' } },
  canvasAiCloudImageModels: null, canvasAiCredentialSource: 'local', canvasAiProvider: 'openai-compatible',
  canvasAiExpandedOutputNodeIds: new Set(), canvasAiPromptEditingId: null,
  canvasSelectedIdsSet: new Set(), canvasSelectedIdsRef: ref([]), canvasTextAgentRunningIds: [],
  canvasHoveredItemIdRef: ref(''), canvasReferenceSuppressClickRef: ref(null),
  canvasReferenceDragState: null, canvasReferenceReplacement: null, canvasInputMenuForId: null,
  canvasInputPickTargetId: null, canvasConnectionDraft: null, canvasPromptOptimizingId: null,
  activeThreeSceneId: null, activeThreeSceneIdRef: ref(null), cloudAccount: null,
  canvasAiPromptTextAreaRefs: ref({}), canvasTextAreaRefs: ref({}), canvasTextOutputAreaRefs: ref({}),
  canvasAiUnifiedImageModelOptions: [], CANVAS_TEXT_CONTEXT_ROUTING_OPTIONS: [],
  DESIGN_AGENT_ARTIFACT_OPTIONS: [], DESIGN_AGENT_ROLE_OPTIONS: [], DESIGN_AGENT_THINKING_MODE_OPTIONS: [],
  threeSceneAnalyzingIds: [], pendingCanvasFusionRoleRef: ref(null),
  canvasScaledNodeRadius: 14, canvasWorkflowSingleEditGroupIds: [], canvasWorkflowTemplates: [],
  getCanvasAiNodeDesignSizeForItem: getSize, getCanvasAiResolvedModel: () => 'gpt-image-1',
  getCanvasAiUnifiedImageModelValue: () => 'openai-compatible:gpt-image-1',
  getCanvasImageInputBufferItemsForNode: () => [], getStableCanvasImageSource: () => '',
}, { get: (target, key) => key in target ? target[key as string] : noAction });

const zoomState: any = {
  canvasContentRef: ref(null), canvasSurfaceRef: ref(null), isCanvasZoomingRef: ref(false),
  canvasViewportFrameRef: ref(null), canvasViewportDeferredDuringZoomRef: ref(false), canvasScaleRef: ref(0.7),
  canvasSizeRef: ref({ width: 2200, height: 1800 }), canvasSizeCommitDeferredRef: ref(false),
  canvasVisualViewportRef: ref(null), canvasZoomSettleTimerRef: ref(null), canvasScrollLockRef: ref({ left: 0, top: 0 }),
  canvasPersistSaveSyncNodesRef: ref(false), canvasStateSaveDeferredDuringZoomRef: ref(false),
  cancelCanvasImageSourceUpgradeQueue: noAction, downgradeCanvasPreviewSources: () => { throw new Error('Unexpected source downgrade'); },
  scheduleCanvasStateSave: noAction, scheduleCanvasViewportUpdate: noAction, scheduleCanvasVisibleImageSourceUpgrades: noAction,
  setCanvasSize: noAction, growCanvasToFit: noAction, commitCanvasScaleSoon: noAction,
  writeCanvasSurfaceScroll: (surface: HTMLElement, x: number, y: number) => { surface.scrollLeft = x; surface.scrollTop = y; },
};
zoomState.beginCanvasZoomInteraction = () => beginCanvasZoomInteractionImpl(zoomState);
zoomState.applyCanvasScaleStyles = (scale: number) => { zoomState.canvasContentRef.current.style.transform = `scale(${scale})`; };
let setRenderScale = noAction as (scale: number) => void;
zoomState.scheduleCanvasScaleRenderSync = () => setRenderScale(zoomState.canvasScaleRef.current);
const zoom = (delta: number) => zoomCanvasAtImpl(zoomState, 400, 350, delta);
const finish = () => finishCanvasZoomInteractionImpl(zoomState);
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function Probe() {
  const [tick, setTick] = useState(Date.now());
  const [scale, setScale] = useState(0.7);
  const [mounted, setMounted] = useState(true);
  setRenderScale = setScale;
  useEffect(() => {
    const unsubscribe = scenario.subscribe(() => setTick(Date.now()));
    const timer = setInterval(() => setTick(Date.now()), 1000);
    let active = true;
    void (async () => {
      const startTime = performance.now();
      const execution = scenario.start();
      await delay(waitMs);
      const stablePreview = getCanvasAiOutputPreviewSlots(scenario.item);
      const stableSize = getSize(scenario.item);
      let previewCacheMisses = 0;
      let sizeCacheMisses = 0;
      for (let i = 0; i < (noZoom ? 0 : 90) && active; i++) {
        zoom(i % 2 ? -60 : 60);
        if (getCanvasAiOutputPreviewSlots(scenario.item) !== stablePreview) previewCacheMisses++;
        if (getSize(scenario.item) !== stableSize) sizeCacheMisses++;
        if (i % 10 === 0) finish();
        await delay(16);
      }
      // Exercise real CanvasNode unmounting independently of execution.
      setMounted(false);
      if (!noZoom) zoom(60);
      scenario.injectResult();
      await execution;
      setMounted(true);
      finish();
      await delay(100);
      const previewElement = document.querySelector<HTMLImageElement>('[data-canvas-item-id="probe-module"] img');
      const ordinaryElement = document.querySelector<HTMLImageElement>('[data-canvas-item-id="probe-ordinary"] img');
      const sourceBefore = previewElement?.src;
      for (let i = 0; i < (noZoom ? 0 : 90) && active; i++) {
        zoom(i % 2 ? -60 : 60);
        if (i % 10 === 0) finish();
        await delay(16);
      }
      finish();
      await delay(100);
      const sameElement = previewElement === document.querySelector('[data-canvas-item-id="probe-module"] img');
      await invoke('probe_result', { result: {
        promotion, noZoom, submissions: scenario.submissions, instances: scenario.instances,
        previewCacheMisses, sizeCacheMisses, status: scenario.item.ai?.status,
        resultPresent: !!getCanvasAiOutputPreviewSlots(scenario.item)[0]?.path,
        sameImageElement: sameElement, sameImageSource: sourceBefore === previewElement?.src,
        imageDecoded: !!previewElement?.complete && !!previewElement?.naturalWidth,
        ordinaryImageDecoded: !!ordinaryElement?.complete && !!ordinaryElement?.naturalWidth,
        errors: diagnosticErrors, elapsedMs: Math.round(performance.now() - startTime),
      } });
    })().catch(error => { void invoke('probe_result', { result: { failure: String(error) } }); });
    return () => { active = false; clearInterval(timer); unsubscribe(); };
  }, []);
  const items = [scenario.item, ordinary];
  const scope = { ...scopeBase, canvasItems: items, canvasItemsById: new Map(items.map(item => [item.id, item])),
    canvasRenderableItems: mounted ? items : [ordinary],
    canvasRenderScale: scale, canvasWorkingTimerTick: tick, canvasItemsRef: scenario.itemsRef };
  return <><p style={{ padding: 10 }}>独立测试 · will-change={String(promotion)} · 等待100秒 · 请求={scenario.submissions}</p>
    <div ref={el => { zoomState.canvasSurfaceRef.current = el; }} style={{ position: 'relative', height: 640, overflow: 'auto' }}>
      <div ref={el => { zoomState.canvasContentRef.current = el; }} style={{ position: 'relative', width: 2200, height: 1800, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
        <CanvasNodeLayer scope={scope} canvasItemsRef={scenario.itemsRef} />
      </div>
    </div></>;
}
createRoot(document.getElementById('root')!).render(<Probe />);
