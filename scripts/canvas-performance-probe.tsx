// Isolated development fixture: generated local images, no user data/API calls.
import React, { Profiler, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import '../src/index.css';
import { CanvasNodeLayer } from '../src/features/canvas/components/CanvasNodeLayer';
import { getCanvasItemElementFromContent } from '../src/features/canvas/canvasDomLookup';
import { flushCanvasInteractionFrameImpl, refreshCanvasConnectionHandleOcclusionImpl } from '../src/features/canvas/controllers/canvasPersistenceActions';
import { updateCanvasTextItemImpl, commitCanvasTextDraftImpl } from '../src/features/canvas/controllers/canvasMediaActions';
import type { CanvasImageItem } from '../src/features/canvasModel';

const ref = <T,>(current: T) => ({ current });
const noAction = () => {};
const errors: string[] = [];
window.addEventListener('error', event => errors.push(event.error?.name || 'Error'));
window.addEventListener('unhandledrejection', () => errors.push('Rejection'));
const initial: CanvasImageItem[] = Array.from({ length: 240 }, (_, index) => ({
  id: `image-${index}`, x: (index % 20) * 130, y: Math.floor(index / 20) * 104,
  width: 120, height: 90,
  item: { id: `asset-${index}`, type: 'image', content: '', name: `测试图 ${index}`,
    thumbnail: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768"><rect width="1024" height="768" fill="hsl(${index * 7 % 360},35%,70%)"/><circle cx="512" cy="384" r="200" fill="#eef0dc"/><text x="440" y="420" font-size="80">${index}</text></svg>`) } as CanvasImageItem['item'],
}));
initial.push({ id: 'text-node', x: 100, y: 1300, width: 440, height: 260,
  textMode: 'plain', item: { id: 'text-asset', type: 'text', content: '输入测试', name: '输入测试' } as CanvasImageItem['item'] });
const itemsRef = ref(initial);
const contentRef = ref<HTMLDivElement | null>(null);
const surfaceRef = ref<HTMLDivElement | null>(null);
let imageRenders = 0;
let domQueries = 0;
const renderDurations: number[] = [];
const frameDurations: number[] = [];
const actionCalls: number[] = [];
const base = {
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
  getCanvasAiNodeDesignSizeForItem: () => null, getCanvasAiResolvedModel: () => 'gpt-image-1',
  getCanvasAiUnifiedImageModelValue: () => 'openai-compatible:gpt-image-1',
  getCanvasImageInputBufferItemsForNode: () => [],
  getStableCanvasImageSource: (item: CanvasImageItem) => { imageRenders++; return item.item.thumbnail; },
};
const box = (item: CanvasImageItem) => item;
const percentile = (values: number[], fraction: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * fraction))] || 0;
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function Probe() {
  const [items, setItems] = useState(initial);
  const [scale, setScale] = useState(.33);
  const [actionVersion, setActionVersion] = useState(0);
  const draftTimers = useRef<Record<string, number>>({});
  const draftValues = useRef<Record<string, string>>({});
  const update = (updater: (items: CanvasImageItem[]) => CanvasImageItem[]) => {
    const next = updater(itemsRef.current); itemsRef.current = next; setItems(next); return next;
  };
  const draftContext = { canvasItemsRef: itemsRef, canvasTextDraftTimersRef: draftTimers,
    canvasTextDraftValuesRef: draftValues,
    updateCanvasTextItem: (id: string, value: string) => updateCanvasTextItemImpl({
      canvasItemsPatchCommitRef: ref(false), scheduleCanvasChangedNodesPatchSave: noAction, updateCanvasItemsImmediate: update,
    }, id, value) };
  useEffect(() => {
    void (async () => {
      await pause(1200);
      await Promise.all([...document.querySelectorAll<HTMLImageElement>('[data-canvas-main-media]')].map(img => img.decode()));
      const originalImages = [...document.querySelectorAll<HTMLImageElement>('[data-canvas-main-media]')];
      const sourceBefore = originalImages.map(img => img.src);
      const originalQuery = contentRef.current!.querySelector.bind(contentRef.current!);
      contentRef.current!.querySelector = ((selector: string) => { domQueries++; return originalQuery(selector); }) as typeof originalQuery;
      const getElement = (id: string) => getCanvasItemElementFromContent(contentRef.current, id);
      const occlusionContext = { CANVAS_CONNECTION_HANDLE_OUTSET: 14, canvasContentRef: contentRef,
        canvasItemsRef: itemsRef, canvasSelectedIdsRef: ref<string[]>([]), getCanvasItemRenderedBox: box };
      const occlusionTimes: number[] = [];
      for (let i = 0; i < 30; i++) {
        const start = performance.now(); refreshCanvasConnectionHandleOcclusionImpl(occlusionContext, { renderedItems: itemsRef.current });
        occlusionTimes.push(performance.now() - start); await frame();
      }
      imageRenders = 0; renderDurations.length = 0;
      for (let i = 0; i < 30; i++) {
        const start = performance.now(); flushSync(() => setScale(i % 2 ? .33 : .35));
        frameDurations.push(performance.now() - start); await frame();
      }
      const zoomRenders = imageRenders;
      const zoomRenderP95Ms = percentile(renderDurations, .95);
      imageRenders = 0; renderDurations.length = 0;
      for (let i = 0; i < 20; i++) {
        flushSync(() => commitCanvasTextDraftImpl(draftContext, 'text-node', `输入测试 ${i} 中文组合输入`)); await frame();
      }
      const typingImageRenders = imageRenders;
      const typingRenderP95Ms = percentile(renderDurations, .95);
      const dragIds = initial.slice(0, 50).map(item => item.id);
      const paintContext = { canvasInteractionFrameRef: ref<number | null>(null),
        canvasInteractionPayloadRef: ref<any>(null), canvasSelectionOverlayRef: ref(null),
        getCanvasItemElement: getElement, paintCanvasDragChrome: noAction };
      const dragTimes: number[] = [];
      domQueries = 0;
      for (let i = 0; i < 90; i++) {
        paintContext.canvasInteractionPayloadRef.current = { kind: 'move', ids: dragIds, dx: i, dy: i / 2 };
        const start = performance.now(); flushCanvasInteractionFrameImpl(paintContext); dragTimes.push(performance.now() - start);
        await frame();
      }
      const dragQueries = domQueries;
      flushSync(() => update(previous => previous.map(item => dragIds.includes(item.id) ? { ...item, x: item.x + 89, y: item.y + 44.5 } : item)));
      dragIds.forEach(id => { getElement(id)!.style.transform = ''; });
      await frame();
      const latestImages = [...document.querySelectorAll<HTMLImageElement>('[data-canvas-main-media]')];
      const sameImages = latestImages.length === originalImages.length && latestImages.every((img, i) => img === originalImages[i] && img.src === sourceBefore[i]);
      const savedText = itemsRef.current.at(-1)!.item.content === '输入测试 19 中文组合输入';
      // Actual React input/composition events through the real uncontrolled
      // textarea and its existing 900ms draft-commit boundary.
      const textarea = document.querySelector<HTMLTextAreaElement>('[data-canvas-item-id="text-node"] textarea')!;
      const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      textarea.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      for (const value of ['输入法', '输入法组合', '输入法组合测试']) {
        setValue.call(textarea, value);
        textarea.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertCompositionText', isComposing: true }));
        flushSync(() => setScale(.34)); await frame();
      }
      textarea.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '输入法组合测试' }));
      textarea.dispatchEvent(new InputEvent('input', { bubbles: true, data: '输入法组合测试', inputType: 'insertText' }));
      await pause(1000);
      const compositionPreserved = textarea.value === '输入法组合测试' && itemsRef.current.at(-1)!.item.content === '输入法组合测试';
      flushSync(() => setActionVersion(1)); await frame();
      const firstNode = getElement('image-0')!;
      firstNode.querySelector<HTMLButtonElement>('[title="画笔标记"]')!.click();
      firstNode.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
      const liveActions = actionCalls.length === 2 && actionCalls.every(version => version === 1);
      const sourceHandle = document.querySelector<HTMLElement>('[data-canvas-connection-handle-id="image-0"][data-canvas-connection-handle-side="source"]')!;
      occlusionContext.canvasSelectedIdsRef.current = [];
      refreshCanvasConnectionHandleOcclusionImpl(occlusionContext, { renderedItems: initial });
      const covered = sourceHandle.style.visibility === 'hidden';
      occlusionContext.canvasSelectedIdsRef.current = ['image-0'];
      refreshCanvasConnectionHandleOcclusionImpl(occlusionContext, { renderedItems: initial });
      const selectedAbove = sourceHandle.style.visibility === '';
      occlusionContext.canvasSelectedIdsRef.current = [];
      refreshCanvasConnectionHandleOcclusionImpl(occlusionContext, { renderedItems: initial.map(item => item.id === 'image-1' ? { ...item, x: 5000 } : item) });
      const uncoveredAfterMove = sourceHandle.style.visibility === '';
      const stackingPreserved = covered && selectedAbove && uncoveredAfterMove;
      const pass = sameImages && latestImages.length === 240 && itemsRef.current.length === 241
        && itemsRef.current[0].x === 89 && savedText && compositionPreserved && liveActions && stackingPreserved && errors.length === 0;
      await invoke('probe_result', { result: { performanceProbe: true, checksPassed: pass, imageCount: 240,
        zoomImageRenders: zoomRenders, zoomRenderP95Ms, zoomCommitP95Ms: percentile(frameDurations, .95),
        typingImageRenders, typingRenderP95Ms, dragDomQueries: dragQueries, dragPaintP95Ms: percentile(dragTimes, .95),
        occlusionP95Ms: percentile(occlusionTimes, .95), sameImages, movedNodes: 50, textPreserved: savedText,
        compositionPreserved, liveActions, stackingPreserved, errors } });
    })().catch(error => { void invoke('probe_result', { result: { failure: String(error), errors } }); });
  }, []);
  const scope = { ...base, canvasItems: items, canvasRenderableItems: items,
    canvasItemsById: new Map(items.map(item => [item.id, item])), canvasRenderScale: scale,
    canvasWorkingTimerTick: 0, canvasItemsRef: itemsRef, canvasTextAreaRefs: base.canvasTextAreaRefs,
    scheduleCanvasTextDraftCommit: (id: string, value: string) => {
      draftValues.current[id] = value;
      clearTimeout(draftTimers.current[id]);
      draftTimers.current[id] = window.setTimeout(() => commitCanvasTextDraftImpl(draftContext, id), 900);
    },
    commitCanvasTextDraft: (id: string, value: string, sync: boolean) => commitCanvasTextDraftImpl(draftContext, id, value, sync),
    openCanvasBrushEditor: () => actionCalls.push(actionVersion),
    startCanvasItemDrag: () => actionCalls.push(actionVersion),
    updateCanvasSelection: noAction };
  return <><p style={{ padding: 8 }}>隔离性能测试：240 张本地测试图 · 文字提交 · 缩放 · 50 图拖动</p>
    <div ref={el => { surfaceRef.current = el; }} style={{ position: 'relative', height: 650, overflow: 'auto' }}>
      <div ref={el => { contentRef.current = el; }} style={{ position: 'relative', width: 2800, height: 1700, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
        <Profiler id="canvas" onRender={(_id, phase, duration) => { if (phase !== 'mount') renderDurations.push(duration); }}>
          <CanvasNodeLayer scope={scope} canvasItemsRef={itemsRef}/>
        </Profiler>
        {items.slice(0, 240).flatMap(item => ['source', 'target'].map(side => <span key={`${item.id}-${side}`}
          data-canvas-connection-handle-id={item.id} data-canvas-connection-handle-side={side}
          style={{ position: 'absolute', left: side === 'source' ? item.x + item.width + 14 : item.x - 14, top: item.y + item.height / 2, width: 8, height: 8, background: '#777' }}/>))}
      </div>
    </div></>;
}
createRoot(document.getElementById('root')!).render(<Probe/>);
