import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

// No error messages/stacks, URLs, prompts or paths cross this bridge. Errors
// retain their class and source line so logs are safe to inspect locally.
const errorNames = new Set(['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError',
  'URIError', 'EvalError', 'AggregateError', 'AbortError', 'SecurityError', 'InvalidStateError']);
export const diagnosticErrorName = (value: unknown) => {
  try {
    const name = value && typeof value === 'object' ? (value as { name?: unknown }).name : undefined;
    return typeof name === 'string' && errorNames.has(name) ? name : 'OtherError';
  } catch { return 'OtherError'; }
};

export const CANVAS_ZOOM_LAYER_PROMOTION_KEY = 'inspiration.canvas.promoteZoomLayer';
export const shouldPromoteCanvasZoomLayer = () => {
  try { return localStorage.getItem(CANVAS_ZOOM_LAYER_PROMOTION_KEY) === 'true'; }
  catch { return false; }
};

const workflowRuns = new Set<string>();
let lastZoomAt: number | undefined;
let lastZoomSentAt = 0;
let installed = false;
let longTaskObserver: PerformanceObserver | undefined;

const send = (event: string, fields: Record<string, unknown> = {}) => {
  if (!isTauri()) return;
  void invoke('record_renderer_diagnostic', { sample: {
    event, workflowRunIds: [...workflowRuns].slice(-16), lastZoomAt,
    pageVisible: document.visibilityState === 'visible',
    zoomLayerPromotion: shouldPromoteCanvasZoomLayer(), ...fields,
  } }).catch(() => { /* Diagnostics must never interrupt generation/rendering. */ });
};

export const recordCanvasZoomDiagnostic = () => {
  lastZoomAt = Date.now();
  if (lastZoomAt - lastZoomSentAt < 1000) return;
  lastZoomSentAt = lastZoomAt;
  send('zoom');
};

export const flushCanvasZoomDiagnostic = () => {
  if (lastZoomAt === undefined || lastZoomSentAt === lastZoomAt) return;
  lastZoomSentAt = lastZoomAt;
  send('zoom');
};

export const beginWorkflowDiagnostic = (runId: string) => {
  workflowRuns.add(runId);
  send('workflow_start');
  return () => {
    workflowRuns.delete(runId);
    send('workflow_end');
  };
};

export const installRendererDiagnostics = () => {
  if (installed || !isTauri() || getCurrentWindow().label !== 'main') return;
  installed = true;
  window.addEventListener('error', event => send('frontend_error', {
    errorName: diagnosticErrorName(event.error), line: event.lineno, column: event.colno,
  }));
  window.addEventListener('unhandledrejection', event => send('unhandled_rejection', {
    errorName: diagnosticErrorName(event.reason),
  }));
  document.addEventListener('visibilitychange', () => send('visibility'));
  window.addEventListener('pagehide', () => send('pagehide'));
  let longTaskCount = 0;
  let longestTaskMs = 0;
  let longTaskTotalMs = 0;
  if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
    longTaskObserver = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        longTaskCount += 1;
        longestTaskMs = Math.max(longestTaskMs, entry.duration);
        longTaskTotalMs += entry.duration;
      }
    });
    try { longTaskObserver.observe({ entryTypes: ['longtask'] }); }
    catch { send('longtask_unsupported'); }
  } else send('longtask_unsupported');
  send('renderer_ready');
  window.setInterval(() => {
    send('heartbeat', { longTaskCount, longestTaskMs: Math.round(longestTaskMs),
      longTaskTotalMs: Math.round(longTaskTotalMs) });
    longTaskCount = 0;
    longestTaskMs = 0;
    longTaskTotalMs = 0;
  }, 5000);
};
