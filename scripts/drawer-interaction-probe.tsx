import { applyCanvasContentTransform, CANVAS_CONTENT_TRANSFORM } from '../src/features/canvas/canvasImagePresentation';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import BufferItemCard from '../src/components/BufferItemCard';
import { runCanvasInteractionsEffect03 } from '../src/features/canvas/controllers/canvasInteractionEffects';
import '../src/index.css';

const root = createRoot(document.getElementById('root')!);
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
const errors: string[] = [];
window.addEventListener('error', event => errors.push(event.message));
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 160;
const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#3498db'; ctx.fillRect(0, 0, 240, 160);
ctx.fillStyle = '#ffcf70'; ctx.fillRect(40, 25, 100, 100);
const thumbnail = canvas.toDataURL('image/png');
const item = { id: 'synthetic-1', type: 'image', name: 'Synthetic test only', content: '', createdAt: 1,
  width: 240, height: 160, thumbnail, inspirationProfile: {
    itemId: 'synthetic-1', summary: '合成测试图片', objects: [], category: '产品',
    form: { silhouette: [], geometry: [], proportion: [] },
    cmf: { colors: ['#3498db', '#ffcf70'], materials: [], finishes: [] },
    style: ['??'], interaction: [], scene: [], mood: [], userTags: [], userNotes: [],
    aiTags: [{ name: '??', category: '??', confidence: .99 }],
  } };
const render = (selected = false) => flushSync(() => root.render(
  <div className="drawer-theme dark" style={{ padding: 24, minHeight: '100vh' }}>
    <h1 style={{ color: '#fff' }}>隔离交互验证：只使用合成图片</h1>
    <div data-probe-card style={{ width: 280 }}><BufferItemCard item={item} cardWidth={280} mediaHeight={180}
      isSelectMode={selected} isSelected={selected} onToggleSelect={() => {}} showToast={() => {}} /></div>
    <div data-canvas-surface="true" tabIndex={-1} style={{ marginTop: 30, padding: 20, background: '#ddd' }}>
      <div data-probe-node>画布节点</div>
      <section data-chat-view="true"><p data-probe-text>Chat 设计文字测试，不应复制画布元素。</p><textarea defaultValue="文本编辑测试" /></section>
    </div>
    <pre data-probe-status style={{ color: '#fff', whiteSpace: 'pre-wrap' }}>正在验证…</pre>
  </div>,
));
const hover = (inside: boolean) => {
  const card = document.querySelector('[data-asset-card="true"]')!;
  const relatedTarget = inside ? document.body : document.body;
  card.dispatchEvent(new PointerEvent(inside ? 'pointerover' : 'pointerout', { bubbles: true, relatedTarget, pointerType: 'mouse' }));
  card.dispatchEvent(new MouseEvent(inside ? 'mouseover' : 'mouseout', { bubbles: true, relatedTarget }));
};
const hasAnalysis = () => Boolean(document.querySelector('[data-asset-analysis="true"]'));
const checks: Record<string, boolean> = {};
try {
  render(); await frame();
  hover(true); await pause(250);
  checks.noEarlyAnalysis = !hasAnalysis();
  hover(false); await pause(550);
  checks.cancelledBriefVisit = !hasAnalysis();
  hover(true); await pause(650);
  checks.analysisAfterDelay = hasAnalysis();
  hover(false); await pause(200);
  checks.analysisCloses = !hasAnalysis();
  render(true); await frame();
  const overlay = document.querySelector('[data-asset-selection-overlay="true"]')!;
  const color = getComputedStyle(overlay).backgroundColor;
  const pixel = document.createElement('canvas'); pixel.width = 1; pixel.height = 1;
  const pixelContext = pixel.getContext('2d')!;
  pixelContext.fillStyle = color; pixelContext.fillRect(0, 0, 1, 1);
  const rgba = [...pixelContext.getImageData(0, 0, 1, 1).data];
  checks.translucentDarkSelection = rgba[0] === 0 && rgba[1] === 0 && rgba[2] === 0 && Math.abs(rgba[3] - 51) <= 1;
  const surface = document.querySelector<HTMLDivElement>('[data-canvas-surface]')!;
  const node = document.querySelector('[data-probe-node]')!;
  const text = document.querySelector('[data-probe-text]')!;
  let copies = 0;
  const prefer = { current: true };
  const cleanup = runCanvasInteractionsEffect03({
    canvasSurfaceRef: { current: surface }, isCanvasModeRef: { current: true },
    isTextEntryActive: () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || ''),
    shouldRouteShortcutToDoodle: () => false, canvasSelectedIdsRef: { current: ['image'] },
    copyCanvasItemsToAvailableClipboards: () => { copies++; }, preferCanvasClipboardRef: prefer,
  } as any);
  const copyKey = (element: Element) => {
    const event = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true });
    element.dispatchEvent(event); return event;
  };
  const range = document.createRange(); range.selectNodeContents(text);
  const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  const e = copyKey(text);
  checks.selectedChatTextWins = !e.defaultPrevented && copies === 0 && selection.toString().includes('设计文字');
  checks.textCopyClearsInternalPreference = !prefer.current;
  selection.removeAllRanges();
  checks.chatWithoutSelectionNotCanvasCopy = !copyKey(text).defaultPrevented && copies === 0;
  const editor = document.querySelector('textarea')!; editor.focus(); editor.select();
  checks.editorWins = !copyKey(editor).defaultPrevented && copies === 0;
  editor.blur(); selection.removeAllRanges();
  checks.canvasNodeCopyPreserved = copyKey(node).defaultPrevented && copies === 1;
  cleanup?.();
  const layer = document.createElement('div');
  const child = document.createElement('div');
  layer.appendChild(child); document.body.appendChild(layer);
  layer.style.transform = CANVAS_CONTENT_TRANSFORM;
  layer.style.setProperty('--canvas-render-scale', '.45');
  const initialMatrix = new DOMMatrixReadOnly(getComputedStyle(layer).transform);
  checks.initialTransformFallbackPreserved = Math.abs(initialMatrix.a - .45) < .0001;
  applyCanvasContentTransform(layer, .75, 14, 23);
  const matrix = new DOMMatrixReadOnly(getComputedStyle(layer).transform);
  checks.liveTransformCorrect = Math.abs(matrix.a - .75) < .0001 && matrix.e === 14 && matrix.f === 23;
  checks.liveCoordinatesDoNotInherit = getComputedStyle(child).getPropertyValue('--canvas-live-scale').trim() === ''
    && getComputedStyle(child).getPropertyValue('--canvas-offset-x').trim() === '0px';
  layer.remove();
  const result = { checksPassed: Object.values(checks).every(Boolean) && errors.length === 0, checks, darkOverlayColor: color, errors };
  document.querySelector('[data-probe-status]')!.textContent = JSON.stringify(result, null, 2);
  await frame();
  if ('__TAURI_INTERNALS__' in window) await invoke('probe_result', { result });
} catch (error) {
  const result = { checksPassed: false, checks, errors: [...errors, String(error)] };
  document.querySelector('[data-probe-status]')!.textContent = JSON.stringify(result, null, 2);
  if ('__TAURI_INTERNALS__' in window) await invoke('probe_result', { result });
}
