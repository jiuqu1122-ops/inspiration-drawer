import { memo, useLayoutEffect, useRef } from 'react';
import type { SnapshotBitmapCache, SnapshotBitmapLease } from '../snapshot/snapshotBitmapCache';
import { drawSnapshotImage, type SnapshotTile } from '../snapshot/snapshotScene';
import {
  captureSnapshotTileContent, getSnapshotTileRasterSize, sameSnapshotTileContent, sameSnapshotTileRasterSize,
  type SnapshotTileContent, type SnapshotTileRasterSize,
} from '../snapshot/snapshotTileRendering';

const ZOOM_SETTLE_MS = 150;
const TILE_DRAW_GAP_MS = 16;

// One queue for all tiles, not one idle callback/timer per tile. At most one backing
// store is resized/drawn per turn, even when the browser reports a long idle period.
const deferredDraws = new Map<object, () => void>();
let drawTimer: ReturnType<typeof setTimeout> | null = null;
let idleDraw: number | null = null;
const cancelDrawTurn = () => {
  if (drawTimer !== null) clearTimeout(drawTimer);
  if (idleDraw !== null) window.cancelIdleCallback(idleDraw);
  drawTimer = null;
  idleDraw = null;
};
const scheduleDrawTurn = (delay: number) => {
  drawTimer = setTimeout(() => {
    drawTimer = null;
    const run = () => {
      idleDraw = null;
      const entry = deferredDraws.entries().next().value;
      if (!entry) return;
      const [key, draw] = entry;
      deferredDraws.delete(key);
      try { draw(); } finally {
        if (deferredDraws.size && drawTimer === null && idleDraw === null) scheduleDrawTurn(TILE_DRAW_GAP_MS);
      }
    };
    if (typeof window.requestIdleCallback === 'function' && typeof window.cancelIdleCallback === 'function') {
      idleDraw = window.requestIdleCallback(run, { timeout: 200 });
    } else run();
  }, delay);
};
const cancelDeferredDraw = (key: object) => {
  deferredDraws.delete(key);
  if (!deferredDraws.size) cancelDrawTurn();
};
const postponeDraws = () => {
  if (!deferredDraws.size) return;
  cancelDrawTurn();
  scheduleDrawTurn(ZOOM_SETTLE_MS);
};
const deferDraw = (key: object, draw: () => void) => {
  deferredDraws.set(key, draw);
  if (drawTimer === null && idleDraw === null) scheduleDrawTurn(ZOOM_SETTLE_MS);
};

type TileProps = {
  tile: SnapshotTile; cache: SnapshotBitmapCache; scale: number; dark: boolean; pixelBudget: number; onFailure: () => void;
};
type TileDrawRequest = TileProps & { content: SnapshotTileContent; size: SnapshotTileRasterSize };
type PaintedTile = { cache: SnapshotBitmapCache; content: SnapshotTileContent; size: SnapshotTileRasterSize };

const paintTile = (canvas: HTMLCanvasElement, request: TileDrawRequest, size: SnapshotTileRasterSize): boolean => {
  const leases: SnapshotBitmapLease[] = [];
  try {
    // Validate and pin every source before clearing old pixels. Nothing is pinned
    // while queued, and partial acquisition/failure releases all earlier leases.
    for (const entry of request.content.items) {
      const lease = request.cache.pin(entry.source, entry.maxEdge);
      if (!lease) return false;
      leases.push(lease);
    }
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return false;
    // Shrink before growing either axis; even intermediate allocations stay bounded.
    if (canvas.height > size.height) canvas.height = size.height;
    if (canvas.width !== size.width) canvas.width = size.width;
    if (canvas.height !== size.height) canvas.height = size.height;
    const box = request.tile.box;
    const xRatio = size.width / box.width, yRatio = size.height / box.height;
    ctx.setTransform(xRatio, 0, 0, yRatio, -box.x * xRatio, -box.y * yRatio);
    ctx.clearRect(box.x, box.y, box.width, box.height);
    for (let index = 0; index < request.tile.items.length; index++) {
      const { item } = request.tile.items[index];
      const { bitmap } = leases[index];
      if (!item.ai) {
        ctx.fillStyle = request.dark ? 'rgba(28,25,23,.88)' : 'rgba(255,255,255,.86)';
        ctx.fillRect(item.x, item.y, item.width, item.height);
      }
      drawSnapshotImage(ctx, bitmap.drawable, bitmap.width, bitmap.height, item);
    }
    canvas.dataset.snapshotDrawCount = String(Number(canvas.dataset.snapshotDrawCount || 0) + 1);
    return true;
  } catch {
    return false;
  } finally {
    for (const lease of leases) lease.release();
  }
};

export const CanvasSnapshotTile = memo(function CanvasSnapshotTile({ tile, cache, scale, dark, pixelBudget, onFailure }: TileProps) {
  const element = useRef<HTMLCanvasElement | null>(null);
  const queueKey = useRef({});
  const latest = useRef<TileDrawRequest | null>(null);
  const painted = useRef<PaintedTile | null>(null);
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;

  useLayoutEffect(() => {
    const canvas = element.current;
    if (!canvas) return;
    const size = getSnapshotTileRasterSize(tile.box, scale, dpr, pixelBudget);
    if (!size) {
      cancelDeferredDraw(queueKey.current);
      latest.current = null;
      onFailure();
      return;
    }
    const previous = latest.current;
    if (previous && previous.scale !== scale) postponeDraws();
    // Scale-only commits neither inspect the DOM nor walk every image in the tile.
    const content = previous?.tile === tile && previous.dark === dark
      ? previous.content : captureSnapshotTileContent(tile, dark);
    const request = { tile, cache, scale, dark, pixelBudget, onFailure, content, size };
    latest.current = request;
    const old = painted.current;
    const overBudget = old !== null && old.size.width * old.size.height > Math.floor(pixelBudget);
    if (!old || old.cache !== cache || !sameSnapshotTileContent(old.content, content) || overBudget) {
      // Content changes are urgent, but do not also allocate a new resolution in
      // a wheel frame. A shrinking hard budget is the only necessary exception.
      const immediateSize = old && !overBudget ? old.size : size;
      cancelDeferredDraw(queueKey.current);
      if (!paintTile(canvas, request, immediateSize)) {
        painted.current = null;
        onFailure();
        return;
      }
      painted.current = { cache, content, size: immediateSize };
    }
    if (sameSnapshotTileRasterSize(painted.current!.size, size)) {
      cancelDeferredDraw(queueKey.current);
      return;
    }
    const draw = () => {
      const current = latest.current;
      const target = element.current;
      if (!current || !target) return;
      // React scale commits can lag the live CSS transform. Existing gesture
      // metadata avoids upgrading during a subsequent wheel burst, without a
      // computed-style read or a new NodeLayer prop/listener per tile.
      if (target.closest('[data-canvas-surface="true"]')?.hasAttribute('data-canvas-zooming')) {
        deferDraw(queueKey.current, draw);
        postponeDraws();
        return;
      }
      if (!paintTile(target, current, current.size)) {
        painted.current = null;
        current.onFailure();
        return;
      }
      painted.current = { cache: current.cache, content: current.content, size: current.size };
    };
    deferDraw(queueKey.current, draw);
  }, [cache, dark, dpr, onFailure, pixelBudget, scale, tile]);

  useLayoutEffect(() => () => {
    cancelDeferredDraw(queueKey.current);
    latest.current = null;
    painted.current = null;
  }, []);

  return <canvas ref={element} width={1} height={1} data-canvas-snapshot-tile={tile.id} aria-hidden="true"
    className="pointer-events-none absolute" style={{ left: tile.box.x, top: tile.box.y,
      width: tile.box.width, height: tile.box.height, zIndex: 0 }} />;
});
