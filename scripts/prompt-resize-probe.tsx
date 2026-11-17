/** Isolated native WebView2 fixture. No App, production setup, database or AI calls. */
import { useLayoutEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { invoke, isTauri } from '@tauri-apps/api/core';
import '../src/index.css';
import { CanvasNodeLayer } from '../src/features/canvas/components/CanvasNodeLayer';
import { getCanvasAiNodeAutoSize } from '../src/features/canvasAiNodeLayout';
import type { CanvasImageItem } from '../src/features/canvasModel';
import {
  createCanvasAiPromptEditorState, disposeCanvasAiPromptEditorState,
  type CanvasAiPromptEditorSessions, type CanvasAiPromptEditorState,
} from '../src/features/canvas/canvasAiPromptResize';
import {
  applyCanvasAiGeneratorDataPatchImpl, commitCanvasAiPromptDraftImpl,
  resizeCanvasAiPromptEditorImpl, startCanvasAiPromptResizeImpl,
} from '../src/features/canvas/controllers/canvasWorkflowEditorActions';

const ref = <T,>(current: T) => ({ current });
const noop = () => {};
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const paint = async () => { await frame(); await frame(); };
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const errors: string[] = [];
window.addEventListener('error', event => errors.push(event.error?.message || event.message || 'window error'));
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason || 'unhandled rejection')));
const stage = document.getElementById('stage')!;
const status = document.getElementById('status')!;
const results = document.getElementById('results')!;
const root: Root = createRoot(stage);
const round = (n: number) => Number(n.toFixed(4));
const close = (a: number, b: number, tolerance = 0.18) => Math.abs(a - b) <= tolerance;
const rect = (element: Element) => {
  const value = element.getBoundingClientRect();
  return { x: round(value.x), y: round(value.y), width: round(value.width), height: round(value.height) };
};
const geometry = (item: CanvasImageItem) => ({ x: item.x, y: item.y, width: item.width, height: item.height });
const geometryKey = (item: CanvasImageItem) => JSON.stringify(geometry(item));
const makePreview = () => {
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#edf2f7'; ctx.fillRect(0, 0, 640, 480);
  ctx.fillStyle = '#2d5f8b'; ctx.fillRect(48, 56, 544, 300);
  ctx.fillStyle = '#f5c76a'; ctx.beginPath(); ctx.arc(320, 206, 90, 0, Math.PI * 2); ctx.fill();
  return canvas.toDataURL('image/png');
};
const previewSource = makePreview();
const longChinese = '设计约束：金属外壳、细腻磨砂、圆角过渡；需要兼顾手持舒适度、装配工艺与配色。\n'.repeat(160) + '最终输入 👩‍🎨 é';
const designSize = (item: CanvasImageItem, _promptExpanded = false) => getCanvasAiNodeAutoSize({
  type: 'image-generator', aspectRatio: item.ai?.aspectRatio || '4:3', count: 1, outputCount: 1,
  promptText: item.item.content,
  // Match App: edit dimensions are presentation-only, persistent image design stays collapsed.
  promptExpanded: false, showOutputPreview: true, imageRulePanelExpanded: false,
  imageControlsWidth: item.ai?.imageControlsWidth,
});
function makeItem(nodeScale: number, prompt: string): CanvasImageItem {
  const item: CanvasImageItem = {
    id: 'prompt-probe-node', x: 30.125, y: 30.625, width: 0, height: 0,
    item: { id: 'prompt-probe-asset', type: 'image', content: prompt, name: '合成提示词探针', createdAt: 1 },
    ai: { type: 'image-generator', provider: 'openai-compatible', model: 'gpt-image-1', status: 'idle',
      aspectRatio: '4:3', count: 1, imagePolicy: { panelExpanded: false },
      outputs: [{ id: 'probe-output', name: '输出 1', status: 'success', url: previewSource, width: 640, height: 480, mediaType: 'image' }] },
  };
  const size = designSize(item);
  return { ...item, width: size.width * nodeScale, height: size.height * nodeScale };
}
interface Harness {
  itemsRef: { current: CanvasImageItem[] };
  stateRef: { current: CanvasAiPromptEditorState };
  draftRef: { current: Record<string, string> };
  actionLog: string[];
  moveWorldPoint: (x: number, y: number) => { x: number; y: number };
}
let active: Harness | null = null;
function CaseHarness({ nodeScale, canvasScale, prompt }: { nodeScale: number; canvasScale: number; prompt: string }) {
  const [items, setItems] = useState(() => [makeItem(nodeScale, prompt)]);
  const itemsRef = useRef(items);
  const stateRef = useRef(createCanvasAiPromptEditorState());
  const [sessions, setSessions] = useState<CanvasAiPromptEditorSessions>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement>>({});
  const draftRef = useRef<Record<string, string>>({});
  const draftTimersRef = useRef<Record<string, number>>({});
  const contentRef = useRef<HTMLDivElement>(null);
  const actionLog = useRef<string[]>([]);
  const box = () => contentRef.current!.getBoundingClientRect();
  const worldPoint = (x: number, y: number) => ({ x: (x - box().left) / canvasScale, y: (y - box().top) / canvasScale });
  const context = {
    canvasAiPromptEditorStateRef: stateRef, onCanvasAiPromptEditorChange: setSessions,
    canvasItemsRef: itemsRef, canvasAiPromptTextAreaRefs: textareaRefs,
    getCanvasAiNodeDesignSizeForItem: designSize, canvasAiPromptEditingId: editingId,
    canvasGroupResizeRef: ref(null), canvasResizeRef: ref(null),
    updateCanvasItemsImmediate: (updater: (value: CanvasImageItem[]) => CanvasImageItem[]) => {
      itemsRef.current = updater(itemsRef.current); setItems(itemsRef.current); return itemsRef.current;
    },
  };
  const update = (id: string, patch: Partial<NonNullable<CanvasImageItem['ai']>>, content?: string) => {
    itemsRef.current = itemsRef.current.map(item => item.id === id ? applyCanvasAiGeneratorDataPatchImpl(context, item, patch, content) : item);
    setItems(itemsRef.current);
    return itemsRef.current.find(item => item.id === id);
  };
  const scope: Record<string, any> = {
    ...context, canvasItems: items, canvasRenderableItems: items, canvasItemsById: new Map(items.map(item => [item.id, item])),
    canvasAgent: { settings: { apiProvider: 'openai-compatible', apiCredentialSource: 'local' } },
    canvasAiCloudImageModels: null, canvasAiCredentialSource: 'local', canvasAiProvider: 'openai-compatible',
    canvasAiExpandedOutputNodeIds: new Set<string>(), canvasAiPromptEditorSessions: sessions,
    canvasSelectedIdsSet: new Set([items[0].id]), canvasSelectedIdsRef: ref([items[0].id]), canvasTextAgentRunningIds: [],
    canvasHoveredItemIdRef: ref(''), canvasReferenceSuppressClickRef: ref(null), canvasReferenceDragState: null,
    canvasReferenceReplacement: null, canvasInputMenuForId: null, canvasInputPickTargetId: null,
    canvasConnectionDraft: null, canvasPromptOptimizingId: null, activeThreeSceneId: null,
    activeThreeSceneIdRef: ref(null), cloudAccount: null, canvasTextAreaRefs: ref({}), canvasTextOutputAreaRefs: ref({}),
    canvasAiUnifiedImageModelOptions: [], CANVAS_TEXT_CONTEXT_ROUTING_OPTIONS: [], DESIGN_AGENT_ARTIFACT_OPTIONS: [],
    DESIGN_AGENT_ROLE_OPTIONS: [], DESIGN_AGENT_THINKING_MODE_OPTIONS: [], threeSceneAnalyzingIds: [],
    pendingCanvasFusionRoleRef: ref(null), canvasScaledNodeRadius: 14, canvasWorkflowSingleEditGroupIds: [], canvasWorkflowTemplates: [],
    canvasRenderScale: canvasScale,
    getCanvasAiResolvedModel: () => 'gpt-image-1', getCanvasAiUnifiedImageModelValue: () => 'openai-compatible:gpt-image-1',
    getCanvasImageInputBufferItemsForNode: () => [], getStableCanvasImageSource: () => previewSource,
    startCanvasItemDrag: () => actionLog.current.push('unexpected-node-drag'), updateCanvasSelection: noop,
    preventCanvasNativeDrag: noop, openCanvasContextMenu: noop, copyCanvasAiOutputToCanvas: noop,
    openCanvasBrushEditor: noop, downloadBufferItems: noop, showToast: noop,
    handleCanvasAiRunClick: () => actionLog.current.push('unexpected-run'), handleCanvasAiRunPointerDown: noop,
    setCanvasAiPromptEditingId: setEditingId,
    resizeCanvasAiPromptEditor: (id: string, expanded: boolean, previous?: boolean) => {
      actionLog.current.push(expanded ? 'open-session' : 'close-session');
      resizeCanvasAiPromptEditorImpl(context, id, expanded, previous);
    },
    startCanvasAiPromptResize: (event: Parameters<typeof startCanvasAiPromptResizeImpl>[1], id: string) => {
      actionLog.current.push('resize-start');
      return startCanvasAiPromptResizeImpl({ ...context, getCanvasPointFromClient: worldPoint }, event, id);
    },
    scheduleCanvasAiPromptDraftCommit: (id: string, value: string) => { draftRef.current[id] = value; },
    commitCanvasAiPromptDraft: (id: string, content?: string, sync = false) => {
      actionLog.current.push('commit-draft');
      commitCanvasAiPromptDraftImpl({ canvasItemsRef: itemsRef, canvasAiPromptDraftTimersRef: draftTimersRef,
        canvasAiPromptDraftValuesRef: draftRef, updateCanvasAiGeneratorData: update }, id, content, sync);
    },
    updateCanvasAiGeneratorData: update,
  };
  useLayoutEffect(() => {
    active = { itemsRef, stateRef, draftRef, actionLog: actionLog.current, moveWorldPoint: worldPoint };
  });
  useLayoutEffect(() => () => disposeCanvasAiPromptEditorState(stateRef.current), []);
  return <>
    <div ref={contentRef} data-probe-content style={{ position: 'relative', width: 2300, height: 2300,
      transform: `translate(17px, 13px) scale(${canvasScale})`, transformOrigin: 'top left' }}>
      <CanvasNodeLayer scope={scope} canvasItemsRef={itemsRef} />
    </div>
    <button id="outside" type="button" style={{ position: 'fixed', top: 12, right: 24 }}>Outside blur target</button>
  </>;
}
function required<T extends Element>(selector: string): T {
  const target = stage.querySelector<T>(selector);
  if (!target) throw new Error(`Missing real CanvasNode DOM: ${selector}`);
  return target;
}
const promptElement = () => required<HTMLTextAreaElement>('[data-canvas-node-prompt="true"]');
const handleElement = () => required<HTMLButtonElement>('[data-canvas-ai-prompt-resize="prompt-probe-node"]');
const snapshot = () => {
  const node = required<HTMLElement>('[data-canvas-item-id="prompt-probe-node"]');
  const textarea = promptElement();
  const preview = required<HTMLImageElement>('img[alt="输出 1"]');
  const tile = preview.parentElement!;
  const font = getComputedStyle(textarea);
  const nodeRect = rect(node), promptRect = rect(textarea), previewRect = rect(preview);
  return { node: nodeRect, prompt: promptRect, preview: previewRect, tile: rect(tile),
    font: { size: font.fontSize, lineHeight: font.lineHeight, family: font.fontFamily },
    geometry: geometry(active!.itemsRef.current[0]), serialized: JSON.stringify(active!.itemsRef.current[0]),
    focused: document.activeElement === textarea, handleVisible: !!stage.querySelector('[data-canvas-ai-prompt-resize]'),
    scrollHeight: textarea.scrollHeight, clientHeight: textarea.clientHeight,
    previewReady: preview.complete && preview.naturalWidth === 640,
  };
};
let pointerId = 500;
const event = (name: string, id: number, x: number, y: number) => new PointerEvent(name, {
  bubbles: true, cancelable: true, pointerId: id, pointerType: 'mouse', isPrimary: true,
  button: 0, buttons: name === 'pointerup' ? 0 : 1, clientX: x, clientY: y,
});
const begin = () => {
  const handle = handleElement(); const bounds = handle.getBoundingClientRect();
  const point = { id: ++pointerId, x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
  const dispatchResult = handle.dispatchEvent(event('pointerdown', point.id, point.x, point.y));
  return { ...point, defaultPrevented: !dispatchResult };
};
const move = (point: ReturnType<typeof begin>, delta: number, id = point.id) => window.dispatchEvent(event('pointermove', id, point.x, point.y + delta));
const end = (point: ReturnType<typeof begin>, delta: number, id = point.id) => window.dispatchEvent(event('pointerup', id, point.x, point.y + delta));
const setText = (value: string) => {
  const textarea = promptElement();
  // Native setter avoids React's value tracker swallowing synthetic input.
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, value);
  textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
};

let syntheticFocusEvents = 0;
async function focusPrompt() {
  const textarea = promptElement();
  textarea.focus({ preventScroll: true }); await paint();
  // A non-activated isolated native window has document.hasFocus()===false:
  // .focus() sets activeElement but Windows does not deliver a focusin event.
  // Explicitly dispatch the same React DOM event rather than stealing OS focus.
  if (!active!.stateRef.current.sessions['prompt-probe-node']) {
    syntheticFocusEvents += 1;
    textarea.dispatchEvent(new FocusEvent('focusin', { bubbles: true, relatedTarget: required('#outside') }));
    await paint();
  }
}
async function blurPrompt() {
  const textarea = promptElement();
  const outside = required<HTMLButtonElement>('#outside');
  outside.focus({ preventScroll: true }); await paint();
  if (active!.stateRef.current.sessions['prompt-probe-node']) {
    syntheticFocusEvents += 1;
    textarea.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }));
    await paint();
  }
}
async function runCase(canvasScale: number, nodeScale: number, initialLong: boolean, key: number) {
  flushSync(() => root.render(<CaseHarness key={key} canvasScale={canvasScale} nodeScale={nodeScale} prompt={initialLong ? longChinese : '初始设计提示词'} />));
  await paint(); await pause(90); await paint();
  const firstPreview = stage.querySelector<HTMLImageElement>('img[alt="输出 1"]');
  if (firstPreview) { firstPreview.loading = 'eager'; await firstPreview.decode(); }
  const collapsed = snapshot();
  const geometryBefore = geometryKey(active!.itemsRef.current[0]);
  const itemBefore = JSON.stringify(active!.itemsRef.current[0]);
  const checks: Record<string, boolean> = { collapsedNoHandle: !collapsed.handleVisible, syntheticPreviewDecoded: collapsed.previewReady };
  await focusPrompt();
  const editing = snapshot();
  checks.realFocusStartsSession = editing.focused && editing.handleVisible && Boolean(active!.stateRef.current.sessions['prompt-probe-node']);
  checks.focusExpandsOnlyHeight = editing.node.height > collapsed.node.height && close(editing.node.width, collapsed.node.width);
  const session = active!.stateRef.current.sessions['prompt-probe-node'];
  if (!session) throw new Error('Prompt edit session missing: ' + JSON.stringify({ focused: editing.focused, handle: editing.handleVisible, logs: active!.actionLog, tag: document.activeElement?.tagName, promptCount: stage.querySelectorAll('[data-canvas-node-prompt]').length, documentFocus: document.hasFocus() }));
  const startHeight = session.promptHeight;
  const expectedDelta = 240 * canvasScale * nodeScale;
  const gesture = begin();
  checks.pointerDownPrevented = gesture.defaultPrevented;
  checks.pointerDownKeepsFocus = document.activeElement === promptElement();
  // Wrong pointer id cannot change the current gesture.
  move(gesture, 999, gesture.id + 17); end(gesture, 999, gesture.id + 17); await paint();
  checks.foreignPointerIgnored = active!.stateRef.current.sessions['prompt-probe-node']!.promptHeight === startHeight;
  // Queue one move, then finish at a later location without waiting for RAF.
  move(gesture, expectedDelta * 0.4); end(gesture, expectedDelta); await paint();
  const resized = snapshot();
  checks.finalUpFlushed = close(active!.stateRef.current.sessions['prompt-probe-node']!.promptHeight, startHeight + 240, 0.25);
  checks.dragHeightCorrect = close(resized.node.height - editing.node.height, expectedDelta)
    && close(resized.prompt.height - editing.prompt.height, expectedDelta);
  checks.widthUnchanged = close(resized.node.width, collapsed.node.width) && close(resized.prompt.width, editing.prompt.width);
  checks.fontUnchanged = JSON.stringify(collapsed.font) === JSON.stringify(editing.font) && JSON.stringify(editing.font) === JSON.stringify(resized.font);
  checks.previewUnchanged = ['x', 'y', 'width', 'height'].every(axis => close(resized.preview[axis as keyof typeof resized.preview], editing.preview[axis as keyof typeof editing.preview])
    && close(collapsed.preview[axis as keyof typeof collapsed.preview], editing.preview[axis as keyof typeof editing.preview]));
  checks.tileUnchanged = ['width', 'height'].every(axis => close(resized.tile[axis as 'width' | 'height'], collapsed.tile[axis as 'width' | 'height']));
  checks.focusKeptAfterResize = resized.focused;
  checks.noTemporaryGeometryWritten = geometryKey(active!.itemsRef.current[0]) === geometryBefore
    && JSON.stringify(active!.itemsRef.current[0]) === itemBefore;
  // Synthetic Unicode/Chinese input is not an OS IME composition test.
  const committedText = `${longChinese}\n画布缩放 ${canvasScale} / 节点缩放 ${nodeScale}`;
  setText(committedText); await paint();
  checks.changeStoresChineseDraft = active!.draftRef.current['prompt-probe-node'] === committedText;
  checks.draftDoesNotChangeGeometry = geometryKey(active!.itemsRef.current[0]) === geometryBefore;
  await blurPrompt();
  const restored = snapshot();
  checks.realBlurCommitsLatestDOMText = active!.itemsRef.current[0].item.content === committedText && active!.itemsRef.current[0].ai?.prompt === committedText;
  checks.realBlurClearsSession = !restored.handleVisible && !Object.keys(active!.stateRef.current.sessions).length;
  checks.realBlurRestoresGeometry = close(restored.node.height, collapsed.node.height) && close(restored.node.width, collapsed.node.width)
    && geometryKey(active!.itemsRef.current[0]) === geometryBefore;
  checks.saveSnapshotHasNoPresentationState = !/"(?:originalBox|collapsedDesignSize|promptHeight|cancelResize)"/.test(restored.serialized);
  checks.commitBeforeClose = active!.actionLog.indexOf('commit-draft') >= 0 && active!.actionLog.indexOf('commit-draft') < active!.actionLog.indexOf('close-session');
  // Reenter, shrink beyond minimum, then cancel a queued downward gesture.
  await focusPrompt();
  const shrink = begin(); end(shrink, -10000 * canvasScale * nodeScale); await paint();
  checks.minimumHeight180 = active!.stateRef.current.sessions['prompt-probe-node']!.promptHeight === 180;
  const minimum = snapshot(); const cancelled = begin(); move(cancelled, 83 * canvasScale * nodeScale); await paint();
  checks.cancelActuallyChangedHeightFirst = active!.stateRef.current.sessions['prompt-probe-node']!.promptHeight > 180;
  window.dispatchEvent(event('pointercancel', cancelled.id, cancelled.x, cancelled.y)); await paint();
  checks.cancelRestoresStartHeight = active!.stateRef.current.sessions['prompt-probe-node']!.promptHeight === 180
    && close(snapshot().node.height, minimum.node.height);
  checks.cancelCleansLifecycle = active!.stateRef.current.cancelResize === null;
  const lost = begin(); move(lost, 71 * canvasScale * nodeScale); await paint();
  handleElement().dispatchEvent(event('lostpointercapture', lost.id, lost.x, lost.y)); await paint();
  checks.lostCaptureRestoresAndCleans = active!.stateRef.current.sessions['prompt-probe-node']!.promptHeight === 180 && active!.stateRef.current.cancelResize === null;
  await blurPrompt();
  checks.secondExitNoDrift = close(snapshot().node.height, collapsed.node.height) && geometryKey(active!.itemsRef.current[0]) === geometryBefore;
  checks.noNodeDragOrGeneration = !active!.actionLog.some(value => value.startsWith('unexpected-'));
  return { canvasScale, nodeScale, initialLong, checks, checksPassed: Object.values(checks).every(Boolean),
    measurements: { collapsed, editing, resized, restored, minimum, expectedClientDelta: round(expectedDelta), startPromptHeight: startHeight },
    actionLog: [...active!.actionLog] };
}
async function run() {
  const cases: Awaited<ReturnType<typeof runCase>>[] = [];
  let fatal: string | null = null;
  let anchor: Record<string, any> | null = null;
  try {
    let key = 0;
    for (const canvasScale of [0.35, 0.5, 0.75, 1, 1.25, 1.75]) {
      for (const nodeScale of [0.65, 1, 1.4]) {
        status.textContent = `Synthetic DOM: canvas ${canvasScale}, node ${nodeScale}`;
        cases.push(await runCase(canvasScale, nodeScale, key % 2 === 1, key++));
      }
    }
    flushSync(() => root.render(null)); await paint();
    status.textContent = 'Native GetWindowRect fixed-anchor checks…';
    if (!isTauri()) throw new Error('Native WebView2 required; browser-only result is not a native pass');
    anchor = await invoke<Record<string, any>>('prompt_resize_probe_anchor');
  } catch (error) { fatal = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack || ''}` : String(error); }
  const output = { schemaVersion: 1, probe: 'prompt-resize-isolated', runtime: isTauri() ? 'native-webview2' : 'browser',
    isolation: { noAppImport: true, noProductionSetup: true, noDatabase: true, syntheticLocalImageOnly: true, noPersistentSaveCalls: true },
    actualPaths: ['CanvasNodeLayer → CanvasNodeRenderGate → CanvasNode', 'real React textarea handlers via DOM focus/input/blur events (untrusted fallback for nonactivated host)',
      'resizeCanvasAiPromptEditorImpl', 'startCanvasAiPromptResizeImpl', 'commitCanvasAiPromptDraftImpl → applyCanvasAiGeneratorDataPatchImpl',
      'drawer_bounds::anchored_rect → drawer_bounds::apply → SetWindowPos → GetWindowRect'],
    limitations: ['Scripted, untrusted DOM PointerEvents and focus events when host not activated; not physical mouse/trackpad or OS pointer capture.',
      'Chinese Unicode is assigned through the native textarea value setter and InputEvent; no OS IME/composition claim.',
      'CanvasNodeLayer and production actions are real, but this is an isolated adapter, not the full App/CanvasWorkbench.',
      'Persistence geometry means serialization of in-memory items; no production saves, DB, user state or cloud models are touched.',
      'Native integer anchor verification covers the current OS DPI; other DPI multipliers are synthetic size inputs, not monitor-switch validation.',
      'GetWindowRect stability does not prove absence of compositor flicker or visible native drag jitter.'],
    syntheticFocusEvents,
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, userAgent: navigator.userAgent },
    cases, anchor, errors, fatal,
    checksPassed: !fatal && !errors.length && cases.length === 18 && cases.every(entry => entry.checksPassed) && anchor?.checksPassed === true };
  status.textContent = output.checksPassed ? 'PASS: synthetic DOM and physical native coordinates' : 'FAIL / incomplete: inspect JSON';
  results.textContent = JSON.stringify(output, null, 2);
  console.log('PROMPT_RESIZE_PROBE_RESULT', JSON.stringify(output));
  if (isTauri()) {
    try { await invoke('prompt_resize_probe_result', { result: output }); }
    catch (error) { status.textContent += `; native delivery failed: ${String(error)}`; }
  }
}
// Isolated native host is the only caller. No import of the production entry point.
void pause(300).then(run);
