/** Isolated synthetic high-resolution fixture. NOT a production entry point.
 * Dedicated loopback origin; no App, DB, files, model/API calls or storage.
 * Query: counts=100,250,500&size=2560x1920&autorun=1&transform=stable
 * Controls: viewport=scheduled (production helpers, 80ms) | live | frozen;
 * transform=legacy; cull=all (default live viewport);
 * burstMs=2600&idleMs=1200&revealGraceMs=1000&sampleEvery=1.
 */
import { Profiler, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { invoke, isTauri } from '@tauri-apps/api/core';
import '../src/index.css';
import { CanvasNodeLayer } from '../src/features/canvas/components/CanvasNodeLayer';
import {
  beginCanvasZoomInteractionImpl, commitCanvasScaleSoonImpl,
  finishCanvasZoomInteractionImpl, scheduleCanvasScaleRenderSyncImpl,
} from '../src/features/canvas/controllers/canvasPersistenceActions';
import {
  getCanvasNestedWheelScrollerImpl, normalizeCanvasWheelDeltaImpl,
  scheduleCanvasWheelZoomImpl, zoomCanvasAtImpl, startCanvasPanImpl,
} from '../src/features/canvas/controllers/canvasInteractionActions';
import { runCanvasInteractionsEffect01 } from '../src/features/canvas/controllers/canvasInteractionEffects';
import { applyCanvasContentTransform, CANVAS_CONTENT_TRANSFORM } from '../src/features/canvas/canvasImagePresentation';
import { CANVAS_MIN_SCALE, type CanvasImageItem } from '../src/features/canvasModel';
import { createCanvasViewportScheduler, readCanvasVisualViewport, scheduleCanvasViewportPublication, CANVAS_LIVE_VIEWPORT_INTERVAL_MS } from '../src/features/canvas/canvasViewportScheduler';

const ref = <T,>(current: T) => ({ current });
const noop = () => {};
const clock = () => performance.now();
const sleep = (ms: number) => new Promise<void>(resolve => window.setTimeout(resolve, ms));
const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const round = (n: number) => Math.round(n * 100) / 100;
const params = new URLSearchParams(location.search);
const counts = [...new Set((params.get('counts') || '100,250,500').split(',').map(Number).filter(n => [100, 250, 500].includes(n)))];
if (!counts.length || (params.get('counts') || '100,250,500').split(',').some(n => ![100,250,500].includes(Number(n)))) throw new Error('counts must contain only 100, 250 and/or 500');
if (location.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || ['1420','1461'].includes(location.port)) throw new Error('A dedicated loopback origin is required; production/existing probe ports are forbidden.');
const dimension = /^(\d+)x(\d+)$/.exec(params.get('size') || '2560x1920');
if (!dimension) throw new Error('size must be WIDTHxHEIGHT');
const width = Number(dimension[1]);
const height = Number(dimension[2]);
if (width < 1920 || height < 1080 || width > 4096 || height > 4096) throw new Error('Use dimensions between 1920x1080 and 4096x4096.');
const optionMs = (name: string, fallback: number, min: number) => {
  const value = Number(params.get(name) || fallback);
  return Number.isFinite(value) ? Math.min(15000, Math.max(min, value)) : fallback;
};
const config = {
  snapshots: params.get('snapshots') !== 'off', rapid: params.get('rapid') !== 'off',
  publication: import.meta.env.VITE_CANVAS_RAPID_BASELINE === '1' ? 'baseline-deferred-pan' : 'live-bounded-pan',
  imageSources: 'full-resolution-original-plus-inline-512px-thumbnail',
  counts, width, height, corpus: 'quantized-raster-v2', transform: params.get('transform') === 'legacy' ? 'legacy' : 'stable',
  cull: params.get('cull') === 'all' ? 'all' : 'viewport-live',
  viewportAdapter: params.get('viewport') === 'scheduled' ? 'scheduled-production-80ms' : params.get('viewport') === 'frozen' ? 'frozen-during-zoom' : 'live-every-transform',
  viewportSchedulerDelayMs: params.get('viewport') === 'scheduled' ? (import.meta.env.VITE_CANVAS_RAPID_BASELINE === '1' ? 80 : CANVAS_LIVE_VIEWPORT_INTERVAL_MS) : null,
  overscanMode: params.get('viewport') === 'scheduled' ? '480-idle-or-680-during-interaction-screen-pixels-divided-by-live-scale' : '480-fixed-world-pixels',
  zoomOutScale: Math.max(CANVAS_MIN_SCALE, Math.min(.8, Number(params.get('zoomOut')) || .56)),
  zoomLayerPromotion: ['on','off'].includes(params.get('promote') || '') ? params.get('promote') : 'default',
  burstMs: optionMs('burstMs', 2600, 800), idleMs: optionMs('idleMs', 1200, 400),
  revealGraceMs: optionMs('revealGraceMs', 1000, 500),
  sampleEvery: Math.max(1, Math.min(10, Number(params.get('sampleEvery')) || 1)),
};
if (config.zoomLayerPromotion !== 'default') localStorage.setItem('inspiration.canvas.promoteZoomLayer', config.zoomLayerPromotion === 'on' ? 'true' : 'false');
const activeUrls = new Set<string>();
const makeUrl = (blob: Blob) => { const url = URL.createObjectURL(blob); activeUrls.add(url); return url; };
const revokeUrls = () => { activeUrls.forEach(url => URL.revokeObjectURL(url)); activeUrls.clear(); };
window.addEventListener('pagehide', revokeUrls);
const runtimeErrors: string[] = [];
// No exported stacks, paths, URLs, user agent or image contents.
window.addEventListener('error', e => { if (e.error) runtimeErrors.push(String(e.error.stack || e.error.message || e.error.name || 'Error')); });
window.addEventListener('unhandledrejection', () => runtimeErrors.push('UnhandledRejection'));
interface Rect { x: number; y: number; width: number; height: number }
interface MemoryEstimate { available: boolean; kind: string; usedBytes?: number; totalBytes?: number; limitBytes?: number }
function jsMemory(): MemoryEstimate {
  const p = performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } };
  return p.memory ? { available: true, kind: 'Chromium performance.memory JS heap estimate; NOT renderer RSS, decoded-image RAM or GPU memory',
    usedBytes: p.memory.usedJSHeapSize, totalBytes: p.memory.totalJSHeapSize, limitBytes: p.memory.jsHeapSizeLimit }
    : { available: false, kind: 'JS heap API unavailable; GPU memory/frame time not measured' };
}
function distribution(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const q = (fraction: number) => sorted.length ? round(sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]) : null;
  return { samples: sorted.length, p50Ms: q(.5), p95Ms: q(.95), p99Ms: q(.99), maxMs: q(1) };
}
const intersects = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
async function fingerprint(blob: Blob) {
  // Bounded encoded-byte sample avoids an extra full-size ArrayBuffer for each
  // high-resolution Blob. Include both encoded ends and the exact byte length.
  // This is a sample fingerprint, not a claim to hash the complete image.
  const sampleSize = Math.min(4096, Math.ceil(blob.size / 2));
  const head = new Uint8Array(await blob.slice(0, sampleSize).arrayBuffer());
  const tail = new Uint8Array(await blob.slice(Math.max(0, blob.size - sampleSize), blob.size).arrayBuffer());
  const sample = new Uint8Array(head.length + tail.length + 8);
  sample.set(head, 0); sample.set(tail, head.length);
  new DataView(sample.buffer).setBigUint64(head.length + tail.length, BigInt(blob.size), false);
  if (crypto.subtle) return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', sample)), n => n.toString(16).padStart(2, '0')).join('');
  let hash = 2166136261;
  for (const byte of sample) hash = Math.imul(hash ^ byte, 16777619);
  return `${blob.size}:${hash >>> 0}`;
}
async function generateImages(count: number, signal: AbortSignal, status: (s: string) => void) {
  const started = clock(), canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas2D unavailable');
  const columns = Math.ceil(Math.sqrt(count * 1.5)), nodeWidth = 320, nodeHeight = nodeWidth * height / width;
  const stepX = nodeWidth + 36, stepY = nodeHeight + 36;
  const items: CanvasImageItem[] = [], hashes = new Set<string>();
  let encodedBytes = 0, pngCount = 0, jpegCount = 0;
  try {
    for (let index = 0; index < count; index++) {
      signal.throwIfAborted();
      const hue = (index * 137.508) % 360;
      // Quantized raster bands remain distinct 4.9-megapixel JPEG/PNG inputs,
      // but avoid >500MB of transient encoded Blob backing storage at 250 images
      // (WebView2 returned NotReadableError before any measured phase). This is
      // deliberately not a photographic/large-encoded-file corpus benchmark.
      for (let band = 0; band < 48; band++) {
        ctx.fillStyle = `hsl(${(hue + band * 3) % 360},55%,${28 + band % 30}%)`;
        const top = Math.floor(band * height / 48), bottom = Math.ceil((band + 1) * height / 48);
        ctx.fillRect(0, top, width, bottom - top);
      }
      let seed = (index + 1) * 2654435761 >>> 0;
      const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
      // Different pixels, not 500 references to one bitmap. Fine raster detail
      // makes this materially different from the earlier small SVG fixture.
      for (let mark = 0; mark < 280; mark++) {
        ctx.fillStyle = `hsla(${(hue + random() * 100) % 360},60%,${30 + random() * 55}%,.65)`;
        ctx.fillRect(random() * width, random() * height, 8 + random() * width / 8, 3 + random() * height / 22);
      }
      ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 2; ctx.beginPath();
      for (let x = 0; x < width; x += 37 + index % 7) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
      ctx.stroke(); ctx.fillStyle = '#10151cc0'; ctx.fillRect(width * .07, height * .33, width * .86, height * .34);
      ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.round(width * .115)}px sans-serif`;
      ctx.fillText(`FIXTURE ${String(index + 1).padStart(3, '0')}`, width * .1, height * .54);
      ctx.font = `${Math.round(width * .027)}px monospace`;
      ctx.fillText(`${width} x ${height} | seed ${index + 1} | synthetic only`, width * .1, height * .61);
      const mime = index % 2 ? 'image/png' : 'image/jpeg';
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas encoding failed')), mime, .9));
      if (blob.type !== mime) throw new Error(`Encoder did not produce ${mime}`);
      hashes.add(await fingerprint(blob)); encodedBytes += blob.size; mime === 'image/png' ? pngCount++ : jpegCount++;
      const source = makeUrl(blob);
      const preview = document.createElement('canvas');
      const previewRatio = Math.min(1, 512 / Math.max(width, height));
      preview.width = Math.round(width * previewRatio); preview.height = Math.round(height * previewRatio);
      preview.getContext('2d')!.drawImage(canvas, 0, 0, preview.width, preview.height);
      const thumbnail = preview.toDataURL('image/png');
      preview.width = preview.height = 0;
      items.push({ id: `highres-${count}-${index}`, x: (index % columns) * stepX + 80, y: Math.floor(index / columns) * stepY + 80,
        width: nodeWidth, height: nodeHeight, item: { id: `synthetic-${count}-${index}`, type: 'image',
          name: `Synthetic ${index + 1} ${mime === 'image/png' ? 'PNG' : 'JPEG'}`, content: source, url: source, thumbnail,
          width, height, createdAt: 0 } as CanvasImageItem['item'] });
      if (index % 5 === 0 || index === count - 1) {
        status(`Generating ${count} UNIQUE ${width}×${height} JPEG/PNG: ${index + 1}/${count}\nNo personal files, network images, database or paid calls.`); await nextFrame();
      }
    }
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw new Error(`generateImages failed at count=${count}; completed=${items.length}; ${detail}`);
  } finally { canvas.width = 0; canvas.height = 0; }
  return { items, world: { width: columns * stepX + 500, height: Math.ceil(count / columns) * stepY + 500 },
    generation: { count, uniqueEncodedFingerprints: hashes.size, jpegCount, pngCount, encodedBytes,
      durationMs: round(clock() - started), dimensions: { width, height }, hashAlgorithm: crypto.subtle ? 'SHA-256(encoded head+tail sample+size)' : 'FNV1a32(encoded head+tail sample+size)' } };
}
const baseScope = {
  canvasPanRef: ref<any>(null),
  canvasAgent: { settings: { apiProvider: 'openai-compatible', apiCredentialSource: 'local' } },
  canvasAiCloudImageModels: null, canvasAiCredentialSource: 'local', canvasAiProvider: 'openai-compatible',
  canvasAiExpandedOutputNodeIds: new Set<string>(), canvasAiPromptEditingId: null,
  canvasSelectedIdsSet: new Set<string>(), canvasSelectedIdsRef: ref<string[]>([]), canvasTextAgentRunningIds: [],
  canvasHoveredItemIdRef: ref(''), canvasReferenceSuppressClickRef: ref(null),
  canvasReferenceDragState: null, canvasReferenceReplacement: null, canvasInputMenuForId: null,
  canvasInputPickTargetId: null, canvasConnectionDraft: null, canvasPromptOptimizingId: null,
  activeThreeSceneId: null, activeThreeSceneIdRef: ref(null), cloudAccount: null,
  canvasAiPromptTextAreaRefs: ref({}), canvasTextAreaRefs: ref({}), canvasTextOutputAreaRefs: ref({}),
  canvasAiUnifiedImageModelOptions: [], CANVAS_TEXT_CONTEXT_ROUTING_OPTIONS: [],
  DESIGN_AGENT_ARTIFACT_OPTIONS: [], DESIGN_AGENT_ROLE_OPTIONS: [], DESIGN_AGENT_THINKING_MODE_OPTIONS: [],
  threeSceneAnalyzingIds: [], pendingCanvasFusionRoleRef: ref(null), canvasScaledNodeRadius: 14,
  canvasWorkflowSingleEditGroupIds: [], canvasWorkflowTemplates: [],
  getCanvasAiNodeDesignSizeForItem: () => null, getCanvasAiResolvedModel: () => 'gpt-image-1',
  getCanvasAiUnifiedImageModelValue: () => 'openai-compatible:gpt-image-1', getCanvasImageInputBufferItemsForNode: () => [],
  startCanvasItemDrag: noop, updateCanvasSelection: noop, openCanvasBrushEditor: noop, updateCanvasAiGeneratorData: noop,
};
type CounterName = 'nodeMounts' | 'nodeUnmounts' | 'imageMounts' | 'imageUnmounts' | 'imageRemounts' | 'snapshotFallbacks' |
  'srcChanges' | 'srcClears' | 'loads' | 'loadErrors' | 'decodeErrors' | 'decodeAttempts' | 'decodeSuccesses' | 'retainedVisibleLosses' |
  'sourceGetterCalls' | 'wheelEvents' | 'zoomApplications' | 'beginTransitions' | 'finishTransitions' | 'viewportScheduleRequests' | 'scheduledViewportUpdatesDuringZoom';
const newCounters = (): Record<CounterName, number> => ({ nodeMounts: 0, nodeUnmounts: 0, imageMounts: 0, imageUnmounts: 0, snapshotFallbacks: 0,
  imageRemounts: 0, srcChanges: 0, srcClears: 0, loads: 0, loadErrors: 0, decodeErrors: 0, decodeAttempts: 0, decodeSuccesses: 0, retainedVisibleLosses: 0,
  sourceGetterCalls: 0, wheelEvents: 0, zoomApplications: 0, beginTransitions: 0, finishTransitions: 0, viewportScheduleRequests: 0, scheduledViewportUpdatesDuringZoom: 0 });
interface Phase {
  name: string; start: number; end: number; frames: number[]; reactMs: number[]; imageSampleMs: number[]; decodeMs: number[]; viewportStart: Rect; viewportEnd: Rect;
  before: Record<CounterName, number>; after: Record<CounterName, number>;
  sampledFrames: number; missingDecodedImageSamples: number; missingMountedImageSamples: number;
  peakVisible: number; peakMounted: number; peakDomNodes: number; minimumOverviewDomNodes: number; peakSnapshotTiles: number; overviewSamples: number; peakMissingDecoded: number; peakMissingMounted: number;
  memoryStart: MemoryEstimate; memoryEnd: MemoryEstimate;
}
interface Exposure { first: number; decodedAt?: number }
interface Burst { name: string; start: number; initialVisible: Set<string>; newlyExposed: Map<string, Exposure>; minimumScale: number }
interface ProbeController {
  items: CanvasImageItem[]; world: { width: number; height: number }; currentViewport: () => Rect;
  beginPan: (x: number, y: number) => void; refreshViewport: () => void; reset: () => void; state: Record<string, any>; finish: () => void;
}
class Recorder {
  counters = newCounters(); phases: Phase[] = []; phase: Phase | null = null; burst: Burst | null = null;
  bursts: Record<string, unknown>[] = []; longTasks: { start: number; duration: number }[] = [];
  longTasksSupported = typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask');
  imageIds = new WeakMap<HTMLImageElement, string>(); images = new Map<string, HTMLImageElement>(); seenImageIds = new Set<string>();
  decoded = new WeakMap<HTMLImageElement, { source: string; ready: boolean }>();
  previouslyVisible = new Map<string, boolean>(); visibilityChanges: { atMs: number; state: string }[] = [];
  observer: MutationObserver; taskObserver: PerformanceObserver | null = null; snapshotHost: HTMLElement | null;
  frameId = 0; frameIndex = 0; lastFrame = 0; running = true;
  constructor(readonly content: HTMLDivElement, readonly controller: ProbeController) {
    this.snapshotHost = content.querySelector<HTMLElement>('[data-canvas-snapshot-host="true"]');
    this.observer = new MutationObserver(records => this.mutations(records));
    this.observer.observe(content, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'], attributeOldValue: true });
    content.addEventListener('load', this.onLoad, true); content.addEventListener('error', this.onError, true);
    document.addEventListener('visibilitychange', this.onVisibility);
    if (this.longTasksSupported) {
      this.taskObserver = new PerformanceObserver(list => this.recordTasks(list.getEntries()));
      this.taskObserver.observe({ type: 'longtask', buffered: false });
    }
    this.frameId = requestAnimationFrame(this.tick);
  }
  bump = (name: CounterName) => { this.counters[name]++; };
  id = (image: HTMLImageElement) => this.imageIds.get(image) || image.closest<HTMLElement>('[data-canvas-item-id]')?.dataset.canvasItemId;
  isMainImage = (element: unknown): element is HTMLImageElement => element instanceof HTMLImageElement && element.hasAttribute('data-canvas-main-media');
  recordTasks = (entries: PerformanceEntry[]) => entries.forEach(e => this.longTasks.push({ start: e.startTime, duration: e.duration }));
  onVisibility = () => { this.visibilityChanges.push({ atMs: round(clock()), state: document.visibilityState }); };
  decode = (image: HTMLImageElement) => {
    const source = image.getAttribute('src') || '';
    if (!source || !image.complete || !image.naturalWidth || this.decoded.get(image)?.source === source) return;
    const state = { source, ready: false }; this.decoded.set(image, state);
    const started = clock(); this.bump('decodeAttempts');
    void image.decode().then(() => {
      if (!this.running) return;
      this.bump('decodeSuccesses'); this.phase?.decodeMs.push(clock() - started);
      if (image.getAttribute('src') === source && this.decoded.get(image) === state) state.ready = true;
    }, () => { if (image.isConnected && image.getAttribute('src') === source) this.bump('decodeErrors'); });
  };
  onLoad = (event: Event) => { if (this.isMainImage(event.target)) { this.bump('loads'); this.decode(event.target); } };
  onError = (event: Event) => { if (this.isMainImage(event.target)) this.bump('loadErrors'); };
  visit = (root: Node, selector: string, action: (e: Element) => void) => {
    if (!(root instanceof Element)) return;
    if (root.matches(selector)) action(root); root.querySelectorAll(selector).forEach(action);
  };
  mutations(records: MutationRecord[]) {
    records.forEach((record, index) => {
      if (record.type === 'attributes' && this.isMainImage(record.target)) {
        // Preserve intermediate clears even if src was restored in one microtask.
        const next = records.slice(index + 1).find(r => r.type === 'attributes' && r.target === record.target);
        const value = next ? next.oldValue : record.target.getAttribute('src');
        if (record.oldValue !== value) this.bump('srcChanges');
        if (record.oldValue && !value) this.bump('srcClears');
        if (!next) this.decode(record.target);
      }
      record.removedNodes.forEach(node => {
        this.visit(node, '[data-canvas-item-id]', () => this.bump('nodeUnmounts'));
        this.visit(node, 'img[data-canvas-main-media]', element => {
          const image = element as HTMLImageElement, id = this.id(image); this.bump('imageUnmounts');
          if (id && this.images.get(id) === image) this.images.delete(id);
        });
      });
      record.addedNodes.forEach(node => {
        this.visit(node, '[data-canvas-item-id]', () => this.bump('nodeMounts'));
        this.visit(node, 'img[data-canvas-main-media]', element => {
          const image = element as HTMLImageElement, id = this.id(image); this.bump('imageMounts');
          if (id) { this.imageIds.set(image, id); if (this.seenImageIds.has(id)) this.bump('imageRemounts'); this.seenImageIds.add(id); this.images.set(id, image); }
          this.decode(image);
        });
      });
    });
  }
  visibleIds = () => { const view = this.controller.currentViewport(); return this.controller.items.filter(item => intersects(item, view)).map(item => item.id); };
  observedFrame = -1;
  roots = new Map<string, HTMLElement>();
  paintedTiles: Array<{ x: number; y: number; width: number; height: number }> = [];
  observedItems: CanvasImageItem[] | null = null;
  itemsById = new Map<string, CanvasImageItem>();
  prepareObservation = () => {
    if (this.observedFrame === this.frameIndex) return;
    this.observedFrame = this.frameIndex;
    this.roots = new Map(Array.from(this.content.querySelectorAll<HTMLElement>('[data-canvas-item-id]')).map(root => [root.dataset.canvasItemId!, root]));
    this.paintedTiles = Array.from(this.content.querySelectorAll<HTMLCanvasElement>('[data-canvas-snapshot-tile]'))
      .filter(tile => Number(tile.dataset.snapshotDrawCount) > 0 && tile.width > 1)
      .map(tile => ({ x: parseFloat(tile.style.left), y: parseFloat(tile.style.top), width: parseFloat(tile.style.width), height: parseFloat(tile.style.height) }));
    if (this.observedItems !== this.controller.items) {
      this.observedItems = this.controller.items;
      this.itemsById = new Map(this.controller.items.map(item => [item.id, item]));
    }
  };
  ready = (id: string) => {
    this.prepareObservation();
    const root = this.roots.get(id);
    const model = this.itemsById.get(id);
    if (model?.item.type === 'text' || model?.ai?.type === 'image-generator') return Boolean(root);
    if (config.snapshots && (root?.dataset.canvasSnapshotStatic === 'true'
      || (!root && this.snapshotHost?.dataset.canvasOverviewActive === 'true'))) {
      const item = this.itemsById.get(id);
      if (!item) return false;
      const view = this.controller.currentViewport();
      const left = Math.max(item.x, view.x), top = Math.max(item.y, view.y);
      const right = Math.min(item.x + item.width, view.x + view.width), bottom = Math.min(item.y + item.height, view.y + view.height);
      const tiles = this.paintedTiles;
      return [[left + .1, top + .1], [right - .1, top + .1], [left + .1, bottom - .1], [right - .1, bottom - .1], [(left + right) / 2, (top + bottom) / 2]]
        .every(([x, y]) => tiles.some(tile => x >= tile.x && x <= tile.x + tile.width && y >= tile.y && y <= tile.y + tile.height));
    }
    if (config.snapshots && root?.querySelector('[data-canvas-snapshot-ready="true"]')) return true;
    const image = this.images.get(id);
    return !!image && image.isConnected && image.complete && image.naturalWidth > 0 && this.decoded.get(image)?.ready === true
      && this.decoded.get(image)?.source === image.getAttribute('src');
  };
  sample() {
    const phase = this.phase; if (!phase) return;
    this.observedFrame = -1; this.prepareObservation();
    const visible = this.visibleIds(); let missingDecoded = 0, missingMounted = 0;
    const domNodes = this.content.querySelectorAll('[data-canvas-item-id]').length;
    const snapshotTiles = this.content.querySelectorAll('[data-canvas-snapshot-tile]').length;
    if (this.snapshotHost?.dataset.canvasOverviewActive === 'true') {
      phase.overviewSamples++;
      phase.minimumOverviewDomNodes = Math.min(phase.minimumOverviewDomNodes, domNodes);
    }
    phase.peakDomNodes = Math.max(phase.peakDomNodes, domNodes);
    phase.peakSnapshotTiles = Math.max(phase.peakSnapshotTiles, snapshotTiles);
    if (this.snapshotHost?.dataset.snapshotFallback === 'drawing-failed') this.bump('snapshotFallbacks');
    if (this.burst) this.burst.minimumScale = Math.min(this.burst.minimumScale, this.controller.state.canvasScaleRef.current || 1);
    const currentVisible = new Map<string, boolean>();
    for (const id of visible) {
      const image = this.images.get(id);
      if (image) this.decode(image); else if (!config.snapshots || (!this.roots.has(id) && this.snapshotHost?.dataset.canvasOverviewActive !== 'true')) missingMounted++;
      const ready = this.ready(id); if (!ready) missingDecoded++;
      const pixelsAvailable = config.snapshots ? ready : !!image?.isConnected && image.complete && image.naturalWidth > 0 && !!image.getAttribute('src');
      if (this.previouslyVisible.get(id) === true && !pixelsAvailable) this.bump('retainedVisibleLosses');
      currentVisible.set(id, pixelsAvailable);
      if (this.burst && !this.burst.initialVisible.has(id)) {
        let exposure = this.burst.newlyExposed.get(id);
        if (!exposure) { exposure = { first: clock() }; this.burst.newlyExposed.set(id, exposure); }
        if (ready && exposure.decodedAt === undefined && this.controller.state.isCanvasZoomingRef.current) exposure.decodedAt = clock();
      }
    }
    this.previouslyVisible = currentVisible; phase.sampledFrames++;
    phase.missingDecodedImageSamples += missingDecoded; phase.missingMountedImageSamples += missingMounted;
    phase.peakVisible = Math.max(phase.peakVisible, visible.length); phase.peakMounted = Math.max(phase.peakMounted, this.images.size);
    phase.peakMissingDecoded = Math.max(phase.peakMissingDecoded, missingDecoded); phase.peakMissingMounted = Math.max(phase.peakMissingMounted, missingMounted);
  }
  tick = (now: number) => {
    if (!this.running) return;
    if (this.phase && this.lastFrame) this.phase.frames.push(now - this.lastFrame); this.lastFrame = now;
    if (this.frameIndex++ % config.sampleEvery === 0) { const start = clock(); this.sample(); this.phase?.imageSampleMs.push(clock() - start); } this.frameId = requestAnimationFrame(this.tick);
  };
  beginPhase(name: string) {
    this.endPhase(); this.phase = { name, start: clock(), end: 0, frames: [], reactMs: [], imageSampleMs: [], decodeMs: [], viewportStart: { ...this.controller.currentViewport() }, viewportEnd: { ...this.controller.currentViewport() }, before: { ...this.counters }, after: newCounters(),
      sampledFrames: 0, missingDecodedImageSamples: 0, missingMountedImageSamples: 0, peakVisible: 0, peakMounted: 0,
      peakMissingDecoded: 0, peakMissingMounted: 0, peakDomNodes: 0, minimumOverviewDomNodes: Number.POSITIVE_INFINITY, peakSnapshotTiles: 0, overviewSamples: 0, memoryStart: jsMemory(), memoryEnd: jsMemory() };
    this.lastFrame = 0; this.phases.push(this.phase);
  }
  endPhase() {
    if (!this.phase) return; this.mutations(this.observer.takeRecords());
    this.phase.end = clock(); this.phase.viewportEnd = { ...this.controller.currentViewport() }; this.phase.after = { ...this.counters }; this.phase.memoryEnd = jsMemory(); this.phase = null;
  }
  beginBurst(name: string) { this.burst = { name, start: clock(), initialVisible: new Set(this.visibleIds()), newlyExposed: new Map(), minimumScale: this.controller.state.canvasScaleRef.current || 1 }; }
  endBurst() {
    this.sample(); const burst = this.burst; if (!burst) return;
    const visible = new Set(this.visibleIds());
    const exposures = [...burst.newlyExposed].map(([id, e]) => ({ id, firstExposedMs: round(e.first - burst.start),
      decodedAfterMs: e.decodedAt === undefined ? null : round(e.decodedAt - e.first), currentlyVisible: visible.has(id),
      readyAtBurstEnd: this.ready(id), decodedWhileZooming: e.decodedAt !== undefined }));
    this.bursts.push({ name: burst.name, durationMs: round(clock() - burst.start), initialVisible: burst.initialVisible.size,
      newlyExposed: exposures.length, decodedWhileZooming: exposures.filter(e => e.decodedWhileZooming).length,
      unresolvedStillVisible: exposures.filter(e => e.currentlyVisible && !e.readyAtBurstEnd).length,
      minimumScaleObserved: round(burst.minimumScale), scaleAtBurstEnd: round(this.controller.state.canvasScaleRef.current || 1),
      zoomStillActiveAtCheck: !!this.controller.state.isCanvasZoomingRef.current, exposures }); this.burst = null;
  }
  phaseMetrics(name: string) {
    this.recordTasks(this.taskObserver?.takeRecords() || []);
    const phase = this.phases.find(entry => entry.name === name);
    const tasks = phase ? this.longTasks.filter(task => task.start >= phase.start && task.start < phase.end) : [];
    return {
      frameP95Ms: phase ? distribution(phase.frames).p95Ms : null,
      frameP99Ms: phase ? distribution(phase.frames).p99Ms : null,
      maxFrameIntervalMs: phase ? distribution(phase.frames).maxMs : null,
      longTaskCount: tasks.length,
      longestLongTaskMs: tasks.length ? distribution(tasks.map(task => task.duration)).maxMs : null,
    };
  }
  report() {
    this.endPhase(); this.recordTasks(this.taskObserver?.takeRecords() || []);
    return { counters: { ...this.counters }, visibilityChanges: this.visibilityChanges, phases: this.phases.map(p => {
      const tasks = this.longTasks.filter(t => t.start >= p.start && t.start < p.end);
      return { name: p.name, durationMs: round(p.end - p.start), frameIntervals: distribution(p.frames), explicitImageDecodePromise: distribution(p.decodeMs), reactCommitDuration: distribution(p.reactMs), imageInstrumentationCpu: distribution(p.imageSampleMs), viewportStart: p.viewportStart, viewportEnd: p.viewportEnd,
        counters: Object.fromEntries(Object.keys(p.after).map(key => [key, p.after[key as CounterName] - p.before[key as CounterName]])),
        sampledFrames: p.sampledFrames, missingDecodedImageSamples: p.missingDecodedImageSamples, missingMountedImageSamples: p.missingMountedImageSamples,
        peakVisibleImages: p.peakVisible, peakMountedImages: p.peakMounted, peakDomNodes: p.peakDomNodes, minimumOverviewDomNodes: Number.isFinite(p.minimumOverviewDomNodes) ? p.minimumOverviewDomNodes : null, peakSnapshotTiles: p.peakSnapshotTiles, overviewSamples: p.overviewSamples, peakMissingDecodedImages: p.peakMissingDecoded, peakMissingMountedImages: p.peakMissingMounted,
        longTasks: { supported: !!this.longTasksSupported, count: tasks.length, totalMs: round(tasks.reduce((sum, t) => sum + t.duration, 0)),
          durations: distribution(tasks.map(t => t.duration)) }, memoryStart: p.memoryStart, memoryEnd: p.memoryEnd,
        mountedRgbaBytesUpperBound: p.peakMounted * width * height * 4,
        mountedRgbaEstimateNote: 'Arithmetic full-resolution RGBA upper bound only; NOT measured decoded RAM or GPU allocation' };
    }), bursts: this.bursts };
  }
  dispose() {
    this.running = false; cancelAnimationFrame(this.frameId); this.observer.disconnect(); this.taskObserver?.disconnect();
    this.content.removeEventListener('load', this.onLoad, true); this.content.removeEventListener('error', this.onError, true);
    document.removeEventListener('visibilitychange', this.onVisibility); this.images.clear(); this.previouslyVisible.clear();
  }
}
const api: { status: string; result: Record<string, any> | null; run: () => Promise<void>; stop: () => void } = {
  status: 'ready', result: null, run: async () => {}, stop: noop,
};
(window as unknown as { __canvasHighresProbe: typeof api }).__canvasHighresProbe = api;
function Probe() {
  const [items, setItems] = useState<CanvasImageItem[]>([]), [renderable, setRenderable] = useState<CanvasImageItem[]>([]);
  const [renderScale, setRenderScale] = useState(1), [running, setRunning] = useState(false);
  const [snapshotViewport, setSnapshotViewport] = useState<Rect | null>(null);
  const [result, setResult] = useState<Record<string, any> | null>(null);
  const itemsRef = useRef<CanvasImageItem[]>([]), surfaceRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null), sizerRef = useRef<HTMLDivElement>(null), statusRef = useRef<HTMLPreElement>(null);
  const recorderRef = useRef<Recorder | null>(null), abortRef = useRef<AbortController | null>(null), controllerRef = useRef<ProbeController | null>(null);
  const updateStatus = (message: string) => { api.status = message; if (statusRef.current) statusRef.current.textContent = message; };
  const source = (item: CanvasImageItem) => { recorderRef.current?.bump('sourceGetterCalls'); return item.item.thumbnail; };
  useEffect(() => {
    const surface = surfaceRef.current!, content = contentRef.current!, sizer = sizerRef.current!;
    let lastRenderedIds = '';
    const liveViewportScheduler = createCanvasViewportScheduler(config.publication === 'live-bounded-pan' ? CANVAS_LIVE_VIEWPORT_INTERVAL_MS : 80);
    const state = {
      canvasSurfaceRef: ref(surface), canvasContentRef: ref(content), canvasSizeRef: ref({ width: 10000, height: 10000 }),
      canvasScaleRef: ref(1), canvasScaleRenderFrameRef: ref<number | null>(null), canvasViewportFrameRef: ref<number | null>(null),
      canvasViewportDeferredDuringZoomRef: ref(false), canvasVisualViewportRef: ref<Rect | null>(null), isCanvasZoomingRef: ref(false),
      canvasSizeCommitDeferredRef: ref(false), canvasPanRef: baseScope.canvasPanRef, canvasPanCleanupRef: ref<(() => void) | null>(null),
      isCanvasSpacePressedRef: ref(false), pendingCanvasFocusItemIdRef: ref<string | null>(null), isCanvasInteractingRef: ref(false), canvasScaleCommitTimerRef: ref<number | null>(null),
      canvasZoomSettleTimerRef: ref<number | null>(null), canvasWheelZoomFrameRef: ref<number | null>(null),
      canvasWheelZoomPayloadRef: ref<{ clientX: number; clientY: number; deltaY: number } | null>(null),
      canvasScrollLockRef: ref<{ left: number; top: number } | null>(null), canvasPersistSaveSyncNodesRef: ref(false),
      canvasStateSaveDeferredDuringZoomRef: ref(false), cancelCanvasImageSourceUpgradeQueue: noop, downgradeCanvasPreviewSources: noop,
      scheduleCanvasVisibleImageSourceUpgrades: noop,
      // Intentionally inert: never connect this fixture to persistence.
      scheduleCanvasStateSave: noop, setCanvasSize: noop, setCanvasScale: setRenderScale,
      writeCanvasSurfaceScroll: (element: HTMLDivElement, left: number, top: number) => { element.scrollLeft = left; element.scrollTop = top; },
    };
    const viewport = (): Rect => config.viewportAdapter === 'scheduled-production-80ms'
      ? readCanvasVisualViewport(surface, Math.max(CANVAS_MIN_SCALE, state.canvasScaleRef.current || 1),
        state.isCanvasZoomingRef.current ? state.canvasVisualViewportRef.current : null, 0)
      : state.canvasVisualViewportRef.current || { x: surface.scrollLeft / state.canvasScaleRef.current,
        y: surface.scrollTop / state.canvasScaleRef.current, width: surface.clientWidth / state.canvasScaleRef.current,
        height: surface.clientHeight / state.canvasScaleRef.current };
    const refreshViewport = () => {
      // Fixture-only frozen control: keep visual viewport sampling live, but
      // leave the rendered node membership frozen until finish/settle. This
      // models the observed App scheduler symptom; it is NOT that scheduler.
      if (config.viewportAdapter === 'frozen-during-zoom' && state.isCanvasZoomingRef.current) return;
      const view = viewport();
      const screenOverscan = config.publication === 'live-bounded-pan' && state.isCanvasInteractingRef.current ? 680 : 480;
      const buffer = config.publication === 'live-bounded-pan' ? screenOverscan / Math.max(CANVAS_MIN_SCALE, state.canvasScaleRef.current || 1) : 0;
      const snapshot = { x: view.x - buffer, y: view.y - buffer, width: view.width + buffer * 2, height: view.height + buffer * 2 };
      setSnapshotViewport(old => old && Object.keys(snapshot).every(key => Math.abs(old[key as keyof Rect] - snapshot[key as keyof Rect]) < 2) ? old : snapshot);
      // Match App's non-drag wheel path: 480 screen px, not a fixed world margin.
      // The 680px interaction margin is for drag interactions, not this fixture.
      const overscan = config.viewportAdapter === 'scheduled-production-80ms'
        ? 480 / Math.max(CANVAS_MIN_SCALE, state.canvasScaleRef.current || 1) : 480;
      const bounds = { x: view.x - overscan, y: view.y - overscan, width: view.width + overscan * 2, height: view.height + overscan * 2 };
      const visible = config.cull === 'all' ? itemsRef.current : itemsRef.current.filter(item => intersects(item, bounds));
      const key = visible.map(item => item.id).join('|');
      if (key !== lastRenderedIds) { lastRenderedIds = key; setRenderable(visible); }
    };
    const scheduleMembershipUpdate = () => {
      if (config.publication === 'live-bounded-pan' && config.viewportAdapter === 'scheduled-production-80ms') {
        scheduleCanvasViewportPublication({ active: true, interacting: state.isCanvasInteractingRef.current,
          panning: state.canvasPanRef.current !== null, zooming: state.isCanvasZoomingRef.current,
          frame: state.canvasViewportFrameRef, deferred: state.canvasViewportDeferredDuringZoomRef,
          live: liveViewportScheduler, publish: refreshViewport,
          requestFrame: callback => requestAnimationFrame(() => { state.canvasViewportFrameRef.current = null; callback(clock()); }),
        });
        return;
      }
      if (config.viewportAdapter === 'scheduled-production-80ms' && state.canvasPanRef.current) return;
      if (config.viewportAdapter === 'scheduled-production-80ms' && state.isCanvasZoomingRef.current) {
        recorderRef.current?.bump('viewportScheduleRequests');
        liveViewportScheduler.request(() => {
          if (state.isCanvasZoomingRef.current) recorderRef.current?.bump('scheduledViewportUpdatesDuringZoom');
          refreshViewport();
        });
      } else {
        if (config.viewportAdapter === 'scheduled-production-80ms') liveViewportScheduler.cancel();
        refreshViewport();
      }
    };
    const applyCanvasScaleStyles = (scale = state.canvasScaleRef.current, size = state.canvasSizeRef.current, options: { updateViewport?: boolean } = {}) => {
      const visual = state.isCanvasZoomingRef.current ? state.canvasVisualViewportRef.current : null;
      if (!state.isCanvasZoomingRef.current || options.updateViewport !== false) {
        sizer.style.width = `${size.width * scale}px`; sizer.style.height = `${size.height * scale}px`;
        content.style.width = `${size.width}px`; content.style.height = `${size.height}px`;
      }
      const x = visual ? surface.scrollLeft - visual.x * scale : 0, y = visual ? surface.scrollTop - visual.y * scale : 0;
      if (config.transform === 'legacy') content.style.transform = visual ? `translate3d(${x}px, ${y}px, 0) scale(${scale})` : `scale(${scale})`;
      else applyCanvasContentTransform(content, scale, x, y);
      // scheduled mode uses the production helper, while live/frozen preserve
      // recorded fixture-only baselines. This is still not the full App.
      scheduleMembershipUpdate();
    };
    const zoomContext = { ...state, applyCanvasScaleStyles, scheduleCanvasViewportUpdate: scheduleMembershipUpdate,
      scheduleCanvasScaleRenderSync: () => scheduleCanvasScaleRenderSyncImpl(state) };
    const begin = () => { if (!state.isCanvasZoomingRef.current) recorderRef.current?.bump('beginTransitions'); beginCanvasZoomInteractionImpl(zoomContext); };
    const finish = () => { if (state.isCanvasZoomingRef.current) recorderRef.current?.bump('finishTransitions'); finishCanvasZoomInteractionImpl(zoomContext); };
    const commit = () => commitCanvasScaleSoonImpl({ ...state, beginCanvasZoomInteraction: begin, finishCanvasZoomInteraction: finish });
    const zoom = (clientX: number, clientY: number, deltaY: number) => {
      recorderRef.current?.bump('zoomApplications');
      zoomCanvasAtImpl({ ...state, applyCanvasScaleStyles, beginCanvasZoomInteraction: begin, commitCanvasScaleSoon: commit,
        growCanvasToFit: noop }, clientX, clientY, deltaY);
    };
    const removeWheelListener = runCanvasInteractionsEffect01({ isCanvasMode: true, canvasSurfaceRef: state.canvasSurfaceRef,
      normalizeCanvasWheelDelta: event => normalizeCanvasWheelDeltaImpl(state, event),
      getCanvasNestedWheelScroller: (element, target, delta) => getCanvasNestedWheelScrollerImpl({}, element, target, delta),
      shouldBlockCanvasWheelZoomTarget: () => false,
      scheduleCanvasWheelZoom: (x, y, delta) => { recorderRef.current?.bump('wheelEvents');
        scheduleCanvasWheelZoomImpl({ ...state, zoomCanvasAt: zoom }, x, y, delta); } });
    const panContext = { ...state, CANVAS_INTERACTION_BACKGROUND_SETTLE_MS: 120,
      settleCanvasZoomBeforePointerInteraction: finish, expandCanvasBeforeViewport: noop,
      growCanvasNearViewportEdge: noop, growCanvasToFit: noop,
      scheduleCanvasViewportUpdate: scheduleMembershipUpdate,
      setCanvasInteractionActive: (active: boolean) => { state.isCanvasInteractingRef.current = active; },
    };
    const beginPan = (x: number, y: number) => startCanvasPanImpl(panContext,
      { button: 1, pointerId: 7701, clientX: x, clientY: y, currentTarget: surface,
        shiftKey: false, preventDefault: noop, stopPropagation: noop } as any);
    const cancelTimers = () => {
      state.canvasPanCleanupRef.current?.();

      liveViewportScheduler.cancel();
      [state.canvasScaleCommitTimerRef, state.canvasZoomSettleTimerRef].forEach(timer => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; });
      [state.canvasWheelZoomFrameRef, state.canvasScaleRenderFrameRef, state.canvasViewportFrameRef].forEach(frame => { if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null; });
      state.canvasWheelZoomPayloadRef.current = null;
    };
    const controller: ProbeController = { items: [], world: state.canvasSizeRef.current, currentViewport: viewport, refreshViewport, state, finish, beginPan,
      reset: () => { cancelTimers(); finish(); cancelTimers(); state.canvasVisualViewportRef.current = null;
        state.canvasScrollLockRef.current = null; lastRenderedIds = ''; state.canvasScaleRef.current = 1;
        surface.scrollLeft = 0; surface.scrollTop = 0; applyCanvasScaleStyles(1); } };
    controllerRef.current = controller;
    const onScroll = () => { if (!state.isCanvasZoomingRef.current) scheduleMembershipUpdate(); };
    surface.addEventListener('scroll', onScroll, { passive: true });
    updateStatus(`READY · isolated ${isTauri() ? 'WebView2' : 'browser'} · ${counts.join(' / ')} images · ${width}×${height}\nTransform: ${config.transform} · viewport: ${config.cull}\nClick Run. Synthetic images; no production App/DB/cache.`);
    return () => { abortRef.current?.abort(); removeWheelListener?.(); surface.removeEventListener('scroll', onScroll); cancelTimers(); recorderRef.current?.dispose(); revokeUrls(); };
  }, []);
  async function run() {
    if (abortRef.current) return;
    const abort = new AbortController(); abortRef.current = abort; setRunning(true); setResult(null); api.result = null;
    const started = clock(), errorStart = runtimeErrors.length, cases: Record<string, any>[] = [];
    const initialVisibility = document.visibilityState; let fatal: string | null = null;
    const assertActive = () => abort.signal.throwIfAborted();
    try {
      for (const count of counts) {
        assertActive();
        const controller = controllerRef.current!, generated = await generateImages(count, abort.signal, updateStatus);
        controller.reset(); controller.items = generated.items; controller.world = generated.world; controller.state.canvasSizeRef.current = generated.world;
        const recorder = new Recorder(contentRef.current!, controller); recorderRef.current = recorder; recorder.beginPhase('initial-visible-decode');
        itemsRef.current = generated.items;
        flushSync(() => { setItems(generated.items); setRenderable([]); }); controller.reset();
        // Start in a populated region, not at the edge of a mostly empty world.
        surfaceRef.current!.scrollLeft = generated.world.width * .22;
        surfaceRef.current!.scrollTop = Math.max(0, generated.world.height * .18 - 80); controller.refreshViewport(); await nextFrame();
        const deadline = clock() + 20000;
        while (clock() < deadline && (!recorder.visibleIds().length || recorder.visibleIds().some(id => !recorder.ready(id)))) { assertActive(); await sleep(40); }
        const initialDecodeReady = recorder.visibleIds().length > 0 && recorder.visibleIds().every(id => recorder.ready(id));
        recorder.beginPhase('idle-baseline');
        updateStatus(`${count} images · baseline idle · ${recorder.images.size} real images mounted\nJS frame intervals measured; GPU frame time unavailable.`); await sleep(config.idleMs);
        const emitWheel = (targetScale: number) => {
          const surface = surfaceRef.current!, rect = surface.getBoundingClientRect();
          const deltaY = -Math.log(targetScale / controller.state.canvasScaleRef.current) / .0008;
          surface.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaMode: 0, deltaY,
            clientX: rect.left + surface.clientWidth * .62, clientY: rect.top + surface.clientHeight * .6 }));
        };
        const overviewQuality: Record<string, unknown>[] = [];
        const burst = async (name: string, target: (progress: number, startScale: number) => number) => {
          recorder.beginPhase(name); recorder.beginBurst(name);
          const begin = clock(), startScale = controller.state.canvasScaleRef.current; let sequence = 0;
          while (clock() - begin < config.burstMs) {
            assertActive(); emitWheel(target(Math.min(1, (clock() - begin) / config.burstMs), startScale));
            if (sequence++ % 18 === 0) updateStatus(`${count} images · ${name}\nScale ${controller.state.canvasScaleRef.current.toFixed(3)} · mounted ${recorder.images.size} · wheel events ${recorder.counters.wheelEvents}\nVisible missing decoded: ${recorder.visibleIds().filter(id => !recorder.ready(id)).length}`);
            await sleep(16);
          }
          emitWheel(target(1, startScale)); await nextFrame(); await nextFrame();
          // Actual zoom stays active throughout decode grace. A newly exposed
          // image cannot pass merely by loading after the settle boundary.
          const hold = clock(), finalScale = controller.state.canvasScaleRef.current;
          while (clock() - hold < config.revealGraceMs) { assertActive(); emitWheel(finalScale * (sequence++ % 2 ? 1.0065 : .9935)); await sleep(32); }
          await nextFrame(); await nextFrame(); recorder.endBurst();
          recorder.beginPhase(`${name}:settle-and-idle`); await sleep(config.idleMs + 260); assertActive();
          const effectiveScale = controller.state.canvasScaleRef.current || 1;
          const dpr = window.devicePixelRatio || 1;
          const tiles = [...contentRef.current!.querySelectorAll<HTMLCanvasElement>('[data-canvas-snapshot-tile]')]
            .filter(tile => Number(tile.dataset.snapshotDrawCount) > 0);
          const densities = tiles.map(tile => Math.min(
            tile.width / (Number.parseFloat(tile.style.width) * effectiveScale * dpr),
            tile.height / (Number.parseFloat(tile.style.height) * effectiveScale * dpr)));
          overviewQuality.push({ name, scale: round(effectiveScale), tileCount: tiles.length,
            backingPixels: tiles.reduce((sum, tile) => sum + tile.width * tile.height, 0),
            minPhysicalPixelDensity: densities.length ? round(Math.min(...densities)) : null });
        };
        await burst('continuous-zoom-out', (p, startScale) => startScale * Math.exp(Math.log(config.zoomOutScale / startScale) * p));
        await burst('continuous-zoom-in', (p, startScale) => startScale * Math.exp(Math.log(1.02 / startScale) * p));
        const reverseLowScale = Math.min(.55, config.zoomOutScale);
        await burst('reversed-zoom', (p, startScale) => p < .5 ? startScale * Math.exp(Math.log(reverseLowScale / startScale) * p * 2)
          : reverseLowScale * Math.exp(Math.log(.94 / reverseLowScale) * (p - .5) * 2));
        const motionChecks: Record<string, unknown>[] = [];
        if (config.rapid) {
          const rapidZoom = async (name: string, move = false) => {
            controller.finish(); recorder.beginPhase(name);
            const begin = clock(); let ticks = 0;
            while (clock() - begin < config.burstMs) {
              assertActive();
              const t = (clock() - begin) / 360;
              const target = .25 + .78 * (.5 + .5 * Math.cos(Math.PI * t));
              if (move) {
                controller.finish();
                surfaceRef.current!.scrollLeft = Math.max(0, generated.world.width * target * (.22 + .12 * Math.sin(t)));
                surfaceRef.current!.scrollTop = Math.max(0, generated.world.height * target * (.2 + .12 * Math.cos(t)));
              }
              emitWheel(target); ticks++; await sleep(8);
            }
            recorder.beginPhase(`${name}:abrupt-stop`); await sleep(config.idleMs + 400);
            const missing = recorder.visibleIds().filter(id => !recorder.ready(id)).length;
            motionChecks.push({ name, inputEvents: ticks, missingAfterStop: missing, ...recorder.phaseMetrics(name) });
          };
          await rapidZoom('rapid-zoom-reversals');
          controller.finish(); recorder.beginPhase('rapid-pointer-pan');
          const surface = surfaceRef.current!, rect = surface.getBoundingClientRect();
          const origin = { x: rect.left + surface.clientWidth / 2, y: rect.top + surface.clientHeight / 2 };
          const start = { left: surface.scrollLeft, top: surface.scrollTop };
          const maximum = { left: Math.max(0, generated.world.width * controller.state.canvasScaleRef.current - surface.clientWidth),
            top: Math.max(0, generated.world.height * controller.state.canvasScaleRef.current - surface.clientHeight) };
          let totalDistance = 0, previous = { ...start };
          controller.beginPan(origin.x, origin.y);
          const begin = clock(); let ticks = 0, minimumVisible = Infinity, missingDuringPan = 0;
          while (clock() - begin < config.burstMs) {
            assertActive(); const t = (clock() - begin) / 360;
            document.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7701, buttons: 4, button: 1,
              clientX: origin.x - (maximum.left * (.5 + .45 * Math.sin(t)) - start.left), clientY: origin.y - (maximum.top * (.5 + .45 * Math.cos(t)) - start.top), bubbles: true, cancelable: true }));
            totalDistance += Math.hypot(surface.scrollLeft - previous.left, surface.scrollTop - previous.top);
            previous = { left: surface.scrollLeft, top: surface.scrollTop };
            const ids = recorder.visibleIds(); minimumVisible = Math.min(minimumVisible, ids.length);
            missingDuringPan = Math.max(missingDuringPan, ids.filter(id => !recorder.ready(id)).length);
            ticks++; await sleep(8);
          }
          const moved = Math.hypot(surface.scrollLeft - start.left, surface.scrollTop - start.top);
          document.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7701, button: 1, buttons: 0, bubbles: true }));
          recorder.beginPhase('rapid-pointer-pan:abrupt-stop'); await sleep(config.idleMs + 400);
          motionChecks.push({ name: 'rapid-pointer-pan', inputEvents: ticks, movedScreenPixels: moved, totalTravelScreenPixels: totalDistance, minimumVisible, peakMissingDuringPan: missingDuringPan,
            missingAfterStop: recorder.visibleIds().filter(id => !recorder.ready(id)).length, ...recorder.phaseMetrics('rapid-pointer-pan') });
          await rapidZoom('rapid-zoom-and-scroll', true);
        }
        // Measure actual NodeLayer commits after insertion, not only a static
        // zoom fixture. No App/database/paid API: the existing 500-image scene
        // remains mounted while single images and plain text cards are appended.
        const insertionMeasurements: Record<string, unknown>[] = [];
        controller.finish(); await sleep(260);
        for (const kind of ['image', 'text', 'generator', 'image'] as const) {
          assertActive();
          const index = insertionMeasurements.length;
          const view = controller.currentViewport();
          const template = generated.items[index];
          // Prepare I/O outside commit timing. A unique blob URL ensures the
          // newly added image exercises a genuinely cold bitmap cache entry.
          const thumbnail = kind === 'image'
            ? makeUrl(new Blob([Uint8Array.from(atob(template.item.thumbnail!.split(',')[1]), character => character.charCodeAt(0))], { type: 'image/png' })) : '';
          const added: CanvasImageItem = { ...template, id: `inserted-${kind}-${index}`,
            x: view.x + view.width * .4, y: view.y + view.height * .35,
            ai: kind === 'generator' ? { type: 'image-generator', provider: 'openai-compatible', model: 'gpt-image-1', status: 'idle', prompt: '' } : undefined,
            item: { ...template.item, id: `inserted-asset-${index}`, type: kind === 'generator' ? 'image' : kind,
              content: kind === 'text' ? 'New text node performance fixture' : thumbnail,
              thumbnail, url: kind === 'image' ? thumbnail : undefined } };
          const name = `insert-${kind}-${index}`;
          recorder.beginPhase(name);
          const start = clock();
          baseScope.canvasSelectedIdsSet.clear(); baseScope.canvasSelectedIdsSet.add(added.id);
          baseScope.canvasSelectedIdsRef.current = [added.id];
          const next = [...itemsRef.current, added];
          controller.items = next; itemsRef.current = next;
          setItems(next); controller.refreshViewport();
          const deadline = start + 3000;
          while (clock() < deadline && !contentRef.current!.querySelector(`[data-canvas-item-id="${added.id}"]`)) await nextFrame();
          const nodeCommitMs = clock() - start;
          while (clock() < deadline && !recorder.ready(added.id)) { await nextFrame(); }
          const pixelsReadyMs = clock() - start;
          await sleep(400);
          recorder.endPhase();
          insertionMeasurements.push({ kind, nodeCommitMs: round(nodeCommitMs), pixelsReadyMs: round(pixelsReadyMs),
            ready: recorder.ready(added.id), ...recorder.phaseMetrics(name) });
        }
        baseScope.canvasSelectedIdsSet.clear(); baseScope.canvasSelectedIdsRef.current = [];
        recorder.beginPhase('final-idle'); await sleep(config.idleMs);
        const finalMissing = recorder.visibleIds().filter(id => !recorder.ready(id)).length, measurements = recorder.report();
        const overviewPhases = measurements.phases.filter((phase: any) => phase.name.includes('continuous-zoom-out') || phase.name.includes('continuous-zoom-out:settle'));
        const overviewDomSamples = overviewPhases.filter((phase: any) => phase.overviewSamples > 0);
        const minimumZoomDomNodesDuringOverview = overviewDomSamples.length ? Math.min(...overviewDomSamples.map((phase: any) => phase.minimumOverviewDomNodes ?? Number.MAX_SAFE_INTEGER)) : null;
        const burstResults = measurements.bursts as { newlyExposed: number; unresolvedStillVisible: number; zoomStillActiveAtCheck: boolean; decodedWhileZooming: number }[];
        const continuousZoomPhases = measurements.phases.filter((phase: { name: string }) =>
          phase.name.startsWith('continuous-zoom-') || phase.name.startsWith('reversed-zoom'));
        const rapidPan = motionChecks.find(row => row.name === 'rapid-pointer-pan');
        const checks = {
          continuousZoomFrameBudget: !config.rapid || continuousZoomPhases.length > 0 && continuousZoomPhases.every((phase: any) =>
            Number(phase.frameIntervals.p99Ms) <= 33.3 && phase.longTasks.count === 0),
          minimumZoomReached: !config.rapid || (measurements.bursts as any[]).some(burst => burst.name === 'continuous-zoom-out'
            && burst.minimumScaleObserved <= CANVAS_MIN_SCALE + .001),
          insertedNodesReady: insertionMeasurements.every(row => row.ready && Number(row.nodeCommitMs) < 250),
          overviewDomReduction: !config.snapshots || (overviewDomSamples.length > 0 && Number(minimumZoomDomNodesDuringOverview) < count),
          noSnapshotDrawingFallback: recorder.counters.snapshotFallbacks === 0,
          continuousPanFrameBudget: !config.rapid || !!rapidPan && Number(rapidPan.frameP99Ms) <= 33.3
            && Number(rapidPan.maxFrameIntervalMs) < 100 && Number(rapidPan.longTaskCount) === 0,
          rapidMotionExercised: !config.rapid || motionChecks.length === 3 && motionChecks.every(row => Number(row.inputEvents) > 10),
          rapidMotionRecovered: motionChecks.every(row => row.missingAfterStop === 0),
          uniqueImages: generated.generation.uniqueEncodedFingerprints === count, initialVisibleDecoded: initialDecodeReady,
          realWheelBeginFinish: recorder.counters.wheelEvents > 0 && recorder.counters.beginTransitions >= 3 && recorder.counters.finishTransitions >= 3,
          zeroImageLoadErrors: recorder.counters.loadErrors === 0 && recorder.counters.decodeErrors === 0,
          noAssignedSrcClears: recorder.counters.srcClears === 0, noRetainedVisibleImageLoss: recorder.counters.retainedVisibleLosses === 0,
          newlyExposedAreaExercised: burstResults.filter(b => b.newlyExposed > 0).length >= 2,
          newlyExposedLoadedBeforeSettle: burstResults.every(b => b.unresolvedStillVisible === 0
            && (b.zoomStillActiveAtCheck || b.newlyExposed === b.decodedWhileZooming))
            && burstResults.filter(b => b.newlyExposed > 0).every(b => b.decodedWhileZooming > 0),
          finalVisibleDecoded: finalMissing === 0,
          noHiddenWindowDuringMeasurement: initialVisibility === 'visible' && recorder.visibilityChanges.every(v => v.state === 'visible'),
        };
        cases.push({ count, environment: { surfaceCssWidth: surfaceRef.current!.clientWidth, surfaceCssHeight: surfaceRef.current!.clientHeight, devicePixelRatio: window.devicePixelRatio, initialVisibility }, generation: generated.generation, measurements, motionChecks, insertionMeasurements, overviewQuality, checks, checksPassed: Object.values(checks).every(Boolean), finalMissingDecodedImages: finalMissing, minimumZoomDomNodesDuringOverview });
        updateStatus(`${count} images COMPLETE · ${Object.values(checks).every(Boolean) ? 'DOM/decode checks passed' : 'CHECK FAILURE (see JSON)'}\nReleasing fixture images before the next case…`);
        recorder.dispose(); recorderRef.current = null; controller.items = []; itemsRef.current = [];
        flushSync(() => { setItems([]); setRenderable([]); }); controller.reset(); await nextFrame(); revokeUrls();
        cases[cases.length - 1].cleanup = { activeObjectUrls: activeUrls.size, mountedMainImages: contentRef.current!.querySelectorAll('img[data-canvas-main-media]').length,
          jsHeapAfterRelease: jsMemory(), note: 'No forced GC; decoded texture release is browser-managed.' }; await sleep(400);
      }
    } catch (error) { fatal = abort.signal.aborted ? 'Cancelled' : error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown fixture failure'; }
    finally {
      recorderRef.current?.dispose(); recorderRef.current = null;
      const controller = controllerRef.current;
      if (controller) { controller.items = []; itemsRef.current = []; flushSync(() => { setItems([]); setRenderable([]); }); controller.reset(); }
      revokeUrls(); abortRef.current = null; setRunning(false);
    }
    const output = { schemaVersion: 1, probe: 'canvas-highres-isolated', config, runtime: isTauri() ? 'native-webview2' : 'browser', durationMs: round(clock() - started),
      isolation: { fixtureOnly: true, noAppImport: true, noDatabaseInitialisation: true, noPersistentStorage: true, syntheticCanvasImagesOnly: true, activeObjectUrlsAfterCleanup: activeUrls.size },
      actualPaths: ['CanvasNodeLayer → CanvasNodeRenderGate → CanvasNode', 'runCanvasInteractionsEffect01 (real wheel listener)',
        'scheduleCanvasWheelZoomImpl → zoomCanvasAtImpl', 'beginCanvasZoomInteractionImpl → commitCanvasScaleSoonImpl → finishCanvasZoomInteractionImpl',
        config.transform === 'stable' ? 'applyCanvasContentTransform (production helper)' : 'legacy shape-changing transform (fixture baseline)',
        config.viewportAdapter === 'scheduled-production-80ms' ? 'createCanvasViewportScheduler(80) + readCanvasVisualViewport (production helpers; App-like adapter only)' : 'fixture-only live/frozen viewport adapter'],
      limitations: ['RAF intervals are main-thread scheduling/presentation proxies, NOT GPU frame times or a fixed-FPS guarantee.',
        'DOM continuity and img.decode() cannot detect a GPU/compositor tile flashing while the DOM remains intact; visible QA is required.',
        'scheduled mode imports production 80ms scheduler and visual viewport reader with App-like 480-screen-pixel overscan; this exercises the helpers, NOT full App integration. Live/frozen baselines retain fixed 480-world-pixel overscan.',
        'Snapshot mode uses the production bitmap cache and tile renderer; source images are synthetic high-resolution Blobs, not user files.',
        'Wheel events are scripted DOM WheelEvents through the actual wheel listener, not OS mouse/trackpad input.',
        'srcChanges counts post-mount attribute changes; initial src assignments are represented by imageMounts and load events.',
        'explicitImageDecodePromise measures img.decode after load/complete, not total source-to-visible or first decode cost; decoder work may already have completed.',
        'Per-frame image instrumentation adds CPU work; compare identical viewport, scale, config and sampleEvery.',
        'performance.memory estimates JS heap only; GPU memory, renderer RSS and actual decoded-image allocation are unavailable.',
        'Synthetic quantized raster bands/detail use much smaller encoded Blobs than the initial gradient corpus; still full-resolution decodes, not a photographic or large-file I/O benchmark.',
        'Full App, persistence, sidebar and OS input remain outside this isolated fixture. Pointer pan calls the real helper; wheel and pointermove events are scripted; mixed case alternates zoom and scroll.'],
      cases, fatal, errors: runtimeErrors.slice(errorStart), checksPassed: !fatal && cases.length === counts.length && cases.every(c => c.checksPassed) && runtimeErrors.length === errorStart };
    api.result = output; setResult(output);
    updateStatus(`${output.checksPassed ? 'COMPLETE — DOM/decode checks passed' : 'COMPLETE — failed/incomplete checks'}\n${cases.length}/${counts.length} cases · ${round(output.durationMs / 1000)}s · all generated URLs revoked\n${fatal || 'Inspect phase P50/P95/P99 and burst exposures in JSON. No GPU smoothness claim.'}`);
    console.log('CANVAS_HIGHRES_PROBE_RESULT', JSON.stringify(output));
    if (isTauri()) { try { await invoke('canvas_highres_probe_result', { result: output }); }
      catch { updateStatus(`${api.status}\nNative result delivery failed. JSON remains available.`); } }
  }
  api.run = run; api.stop = () => abortRef.current?.abort();
  useEffect(() => { if (params.get('autorun') === '1') { const timer = window.setTimeout(() => { void api.run(); }, 700); return () => clearTimeout(timer); } }, []);
  const download = () => {
    if (!result) return;
    const url = makeUrl(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `canvas-highres-${config.transform}-${config.counts.join('-')}.json`; link.click();
    window.setTimeout(() => { URL.revokeObjectURL(url); activeUrls.delete(url); }, 1500);
  };
  const scope = { ...baseScope, canvasSnapshotMode: config.snapshots, canvasSnapshotViewport: snapshotViewport, canvasItems: items, canvasRenderableItems: renderable,
    canvasItemsById: new Map(items.map(item => [item.id, item])), canvasItemsRef: itemsRef, canvasRenderScale: renderScale, canvasLiveScaleRef: controllerRef.current?.state.canvasScaleRef,
    canvasWorkingTimerTick: 0, getStableCanvasImageSource: source };
  return <main className="highres-probe">
    <header><div><h1>Canvas high-resolution probe</h1><p>ISOLATED · {counts.join(' / ')} distinct JPEG/PNG · {width} × {height} · {config.transform} transform</p></div>
      <nav><button disabled={running} onClick={() => { void run(); }}>Run isolated suite</button><button disabled={!running} onClick={() => api.stop()}>Stop</button>
        <button disabled={!result || running} onClick={download}>Export JSON</button></nav></header>
    <p className="probe-warning">Synthetic assets only. Memory pressure intentional. No production DB/profile/cache. Frame intervals ≠ GPU frame times. Inspect zoom AND settle.</p>
    <pre ref={statusRef} id="probe-status" role="status" aria-live="polite"/>
    <section ref={surfaceRef} data-canvas-surface="true" id="probe-surface" aria-label="Synthetic high-resolution canvas" tabIndex={0}>
      <div ref={sizerRef} style={{ position: 'relative', width: 10000, height: 10000 }}>
        <div ref={contentRef} data-canvas-content="true" data-canvas-content-layer="true" style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0',
          transform: config.transform === 'stable' ? CANVAS_CONTENT_TRANSFORM : 'scale(1)' }}>
          <Profiler id="highres-real-node-layer" onRender={(_id, _phase, duration) => recorderRef.current?.phase?.reactMs.push(duration)}>
            <CanvasNodeLayer scope={scope} canvasItemsRef={itemsRef}/>
          </Profiler>
        </div>
      </div>
    </section>
    <details open={!!result} className="probe-result"><summary>Results / measurement scope (JSON)</summary>
      <pre id="probe-result">{result ? JSON.stringify(result, null, 2) : 'Run to collect frame-interval percentiles, long tasks, DOM/source/decode continuity and JS heap estimates.'}</pre>
    </details>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Probe/>);
