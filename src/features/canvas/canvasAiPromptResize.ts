import {
  getCanvasAiPromptAutoHeight,
  getCanvasAiPromptEditLayout,
  getCanvasImageGeneratorMainColumnWidth,
} from '../canvasAiNodeLayout';
import type { CanvasImageItem, CanvasItemBox } from '../canvasModel';
import { getCanvasDesignScale, type CanvasDesignSize } from '../canvasResizeGeometry';

/** Ephemeral presentation only: never attach these values to CanvasImageItem. */
export type CanvasAiPromptEditSession = {
  originalBox: CanvasItemBox;
  collapsedDesignSize: CanvasDesignSize;
  nodeScale: number;
  promptHeight: number;
};

export type CanvasAiPromptEditorSessions = Record<string, CanvasAiPromptEditSession | undefined>;
export type CanvasAiPromptEditorState = {
  sessions: CanvasAiPromptEditorSessions;
  cancelResize: (() => void) | null;
};

export type CanvasAiPromptEditorActionContext = {
  canvasAiPromptEditorStateRef?: { current: CanvasAiPromptEditorState };
  onCanvasAiPromptEditorChange?: (sessions: CanvasAiPromptEditorSessions) => void;
};

export const createCanvasAiPromptEditorState = (): CanvasAiPromptEditorState => ({
  sessions: {},
  cancelResize: null,
});

export const createCanvasAiPromptEditSession = (
  item: CanvasImageItem,
  collapsedDesignSize: CanvasDesignSize,
  promptText = item.item.content || '',
): CanvasAiPromptEditSession => ({
  originalBox: { x: item.x, y: item.y, width: item.width, height: item.height },
  collapsedDesignSize: { ...collapsedDesignSize },
  nodeScale: getCanvasDesignScale(item, collapsedDesignSize),
  promptHeight: getCanvasAiPromptAutoHeight(promptText, getCanvasImageGeneratorMainColumnWidth({
    imageControlsWidth: item.ai?.imageControlsWidth,
    imageRulePanelExpanded: item.ai?.imagePolicy?.panelExpanded !== false,
  }), true),
});

export const getCanvasAiPromptEditorLayout = (
  item: CanvasImageItem,
  session: CanvasAiPromptEditSession | undefined,
) => {
  if (item.ai?.type !== 'image-generator' || !session) return null;
  const layout = getCanvasAiPromptEditLayout(session.collapsedDesignSize, session.promptHeight);
  return {
    promptHeight: layout.promptHeight,
    nodeScale: session.nodeScale,
    designSize: { width: layout.width, height: layout.height },
    box: {
      // Position may legitimately change; closing the editor must not undo a move.
      x: item.x,
      y: item.y,
      width: session.originalBox.width,
      height: session.originalBox.height + layout.extraHeight * session.nodeScale,
    },
  };
};

/** Wrap the existing rendered-box getter, not the persistent item/design getter. */
export const getCanvasAiPromptEditingBox = (
  item: CanvasImageItem,
  sessions: CanvasAiPromptEditorSessions,
): CanvasItemBox | null => getCanvasAiPromptEditorLayout(item, sessions[item.id])?.box || null;

export const publishCanvasAiPromptEditorSessions = (
  ctx: CanvasAiPromptEditorActionContext,
  sessions: CanvasAiPromptEditorSessions,
) => {
  if (!ctx.canvasAiPromptEditorStateRef) return;
  ctx.canvasAiPromptEditorStateRef.current.sessions = sessions;
  ctx.onCanvasAiPromptEditorChange?.(sessions);
};

export const finishCanvasAiPromptEditSession = (ctx: CanvasAiPromptEditorActionContext, id: string) => {
  const state = ctx.canvasAiPromptEditorStateRef?.current;
  if (!state?.sessions[id]) return;
  const next = { ...state.sessions };
  delete next[id];
  // Remove first so cancelling a pending gesture cannot publish an obsolete
  // height, or cause a state update during a teardown/real blur.
  state.sessions = next;
  state.cancelResize?.();
  state.cancelResize = null;
  publishCanvasAiPromptEditorSessions(ctx, next);
};

/** Call on unmount/canvas switch, after committing any outstanding prompt drafts. */
export const disposeCanvasAiPromptEditorState = (state: CanvasAiPromptEditorState) => {
  state.sessions = {};
  state.cancelResize?.();
  state.cancelResize = null;
};

export const isCanvasAiPromptResizeHandleTarget = (target: EventTarget | null, id: string) => {
  const element = target as Element | null;
  return typeof element?.closest === 'function'
    && element.closest('[data-canvas-ai-prompt-resize]')?.getAttribute('data-canvas-ai-prompt-resize') === id;
};

/** Deltas are in world units, so node scaling is applied exactly once. */
export const getCanvasAiPromptHeightFromPointer = (
  startPromptHeight: number,
  startWorldY: number,
  worldY: number,
  nodeScale: number,
) => getCanvasAiPromptEditLayout({ width: 0, height: 0 },
  Number.isFinite(worldY) && Number.isFinite(startWorldY) && Number.isFinite(nodeScale) && nodeScale > 0
    ? startPromptHeight + (worldY - startWorldY) / nodeScale
    : startPromptHeight,
).promptHeight;

export type CanvasAiPromptResizePointerEvent = Pick<PointerEvent,
  'button' | 'isPrimary' | 'pointerId' | 'clientX' | 'clientY' | 'preventDefault' | 'stopPropagation'
> & { currentTarget: HTMLElement };

export type CanvasAiPromptResizeContext = CanvasAiPromptEditorActionContext & {
  getCanvasPointFromClient: (clientX: number, clientY: number) => { x: number; y: number };
};

/**
 * A separate pointer lifecycle: never invokes the proportional node resizer,
 * blurs/refocuses the textarea, writes canvas items, or creates undo snapshots.
 */
export const startCanvasAiPromptResize = (
  ctx: CanvasAiPromptResizeContext,
  event: CanvasAiPromptResizePointerEvent,
  id: string,
) => {
  event.preventDefault();
  event.stopPropagation();
  if (event.button !== 0 || event.isPrimary === false) return false;
  const state = ctx.canvasAiPromptEditorStateRef?.current;
  state?.cancelResize?.();
  const session = state?.sessions[id];
  const target = event.currentTarget;
  const ownerWindow = target.ownerDocument.defaultView;
  if (!state || !session || !ownerWindow) return false;
  const startWorldY = ctx.getCanvasPointFromClient(event.clientX, event.clientY).y;
  if (!Number.isFinite(startWorldY)) return false;

  const pointerId = event.pointerId;
  let pendingPoint: { x: number; y: number } | null = null;
  let frame: number | null = null;
  let finished = false;

  const setHeight = (height: number) => {
    const current = state.sessions[id];
    // Do not let a queued event from a previous editing cycle affect a new one.
    if (!current || current.originalBox !== session.originalBox || current.promptHeight === height) return;
    publishCanvasAiPromptEditorSessions(ctx, { ...state.sessions, [id]: { ...current, promptHeight: height } });
  };
  const flush = () => {
    frame = null;
    if (finished || !pendingPoint) return;
    const point = pendingPoint;
    pendingPoint = null;
    const worldY = ctx.getCanvasPointFromClient(point.x, point.y).y;
    setHeight(getCanvasAiPromptHeightFromPointer(session.promptHeight, startWorldY, worldY, session.nodeScale));
  };
  const cleanup = (commit: boolean) => {
    if (finished) return;
    if (frame !== null) ownerWindow.cancelAnimationFrame(frame);
    frame = null;
    if (commit) flush();
    else setHeight(session.promptHeight);
    finished = true;
    pendingPoint = null;
    ownerWindow.removeEventListener('pointermove', onMove, true);
    ownerWindow.removeEventListener('pointerup', onUp, true);
    ownerWindow.removeEventListener('pointercancel', onCancel, true);
    ownerWindow.removeEventListener('blur', onWindowBlur);
    target.removeEventListener('lostpointercapture', onLostCapture);
    if (state.cancelResize === cancel) state.cancelResize = null;
    try {
      if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId);
    } catch { /* Detached nodes/WebViews may already have released capture. */ }
  };
  const cancel = () => cleanup(false);
  const onMove = (next: PointerEvent) => {
    if (next.pointerId !== pointerId || finished) return;
    next.preventDefault();
    pendingPoint = { x: next.clientX, y: next.clientY };
    if (frame === null) frame = ownerWindow.requestAnimationFrame(flush);
  };
  const onUp = (next: PointerEvent) => {
    if (next.pointerId !== pointerId || finished) return;
    // pointerup can arrive before the last queued frame or without a final move.
    pendingPoint = { x: next.clientX, y: next.clientY };
    cleanup(true);
  };
  const onCancel = (next: PointerEvent) => {
    if (next.pointerId === pointerId) cancel();
  };
  const onLostCapture = (next: Event) => {
    if ((next as PointerEvent).pointerId === pointerId) cancel();
  };
  const onWindowBlur = () => cancel();

  state.cancelResize = cancel;
  ownerWindow.addEventListener('pointermove', onMove, { capture: true, passive: false });
  ownerWindow.addEventListener('pointerup', onUp, true);
  ownerWindow.addEventListener('pointercancel', onCancel, true);
  ownerWindow.addEventListener('blur', onWindowBlur);
  target.addEventListener('lostpointercapture', onLostCapture);
  try { target.setPointerCapture?.(pointerId); } catch { /* Window listeners remain a safe fallback. */ }
  return true;
};
