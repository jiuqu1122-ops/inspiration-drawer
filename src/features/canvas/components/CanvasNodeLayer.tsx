import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CanvasNodeRenderGate } from '../../../components/CanvasNodeRenderGate';
import { createCanvasNodeRenderScope, getCanvasNodeRenderDependencies, isStandaloneCanvasImage } from '../canvasNodeRenderDependencies';
import { CanvasNode } from './CanvasNode';
import { CanvasStandaloneImageNode } from './CanvasStandaloneImageNode';
import { CanvasSnapshotTile } from './CanvasSnapshotLayer';
import type { CanvasImageItem, CanvasItemBox } from '../../canvasModel';
import { createSnapshotBitmapCache } from '../snapshot/snapshotBitmapCache';
import { planSnapshotRuns, planSnapshotTiles, type SnapshotTile } from '../snapshot/snapshotScene';
import { useCanvasSnapshotMode } from '../snapshot/snapshotMode';
import { planIncrementalSnapshotRequests } from '../snapshot/snapshotIncrementalResidency';
import { allocateSnapshotTileBudgets } from '../snapshot/snapshotTileBudgets';
import { canUpdateSnapshotHover, getSnapshotNodeDependencies, planSnapshotResidency, SNAPSHOT_CACHE_BYTES, SNAPSHOT_MAX_RESIDENT_SOURCES, SNAPSHOT_REQUEST_BATCH_SIZE } from '../snapshot/snapshotResidency';

export type CanvasNodeLayerScope = Record<string, any>;

export function CanvasNodeLayer({ scope, canvasItemsRef }: { scope: CanvasNodeLayerScope; canvasItemsRef: { current: CanvasImageItem[] } }) {
  const items = scope.canvasRenderableItems as CanvasImageItem[];
  const latestScope = useRef(scope);
  const actions = useRef(new Map<string, (...args: any[]) => any>());
  useLayoutEffect(() => { latestScope.current = scope; }, [scope]);
  const renderScope = createCanvasNodeRenderScope(scope, latestScope, actions.current);
  const enabledPreference = useCanvasSnapshotMode();
  const enabled = (scope.canvasSnapshotMode as boolean | undefined) ?? enabledPreference;
  const [cache] = useState(() => createSnapshotBitmapCache({ concurrency: 2, maxBytes: SNAPSHOT_CACHE_BYTES, maxEntries: SNAPSHOT_MAX_RESIDENT_SOURCES, maxPendingRequests: SNAPSHOT_REQUEST_BATCH_SIZE }));
  const [version, setVersion] = useState(0);
  const [hovered, setHovered] = useState('');
  useEffect(() => { setHovered(current => current && !items.some(item => item.id === current) ? '' : current); }, [items]);
  const [pressed, setPressed] = useState<ReadonlySet<string>>(() => new Set());
  const [drawingFailed, setDrawingFailed] = useState(false);
  const disposal = useRef<ReturnType<typeof setTimeout> | null>(null);
  const publishFrame = useRef<number | null>(null);
  const publishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (disposal.current !== null) clearTimeout(disposal.current);
    const unsubscribe = cache.subscribe(() => {
      // A 1000-image cold cache must not commit the whole React scene after
      // every pair of decodes. Publish a bounded batch, then paint on a frame.
      if (publishTimer.current !== null || publishFrame.current !== null) return;
      publishTimer.current = setTimeout(() => {
        publishTimer.current = null;
        publishFrame.current = requestAnimationFrame(() => { publishFrame.current = null; setVersion(value => value + 1); });
      }, 80);
    });
    return () => {
      unsubscribe();
      if (publishFrame.current !== null) cancelAnimationFrame(publishFrame.current);
      if (publishTimer.current !== null) clearTimeout(publishTimer.current);
      publishFrame.current = null;
      publishTimer.current = null;
      // Deferred finalization survives React StrictMode's setup/cleanup replay.
      disposal.current = setTimeout(() => cache.dispose(), 0);
    };
  }, [cache]);
  const host = useRef<HTMLDivElement | null>(null);
  const [measuredView, setMeasuredView] = useState<CanvasItemBox | null>(null);
  useLayoutEffect(() => {
    if (!enabled) return;
    const node = host.current;
    const parent = node?.closest<HTMLElement>('[data-canvas-content-layer="true"]') || node?.parentElement;
    const surface = parent?.closest<HTMLElement>('[data-canvas-surface="true"]') || parent?.parentElement?.parentElement;
    if (!parent || !surface) return;
    const measure = () => {
      const scale = Number.parseFloat(getComputedStyle(parent).getPropertyValue('--canvas-live-scale')) || latestScope.current.canvasRenderScale || 1;
      const contentRect = parent.getBoundingClientRect(), surfaceRect = surface.getBoundingClientRect();
      const padding = 180 / scale;
      const next = { x: (surfaceRect.left - contentRect.left) / scale - padding,
        y: (surfaceRect.top - contentRect.top) / scale - padding,
        width: surface.clientWidth / scale + padding * 2, height: surface.clientHeight / scale + padding * 2 };
      setMeasuredView(current => current && Math.abs(current.x - next.x) < 80 && Math.abs(current.y - next.y) < 80
        && Math.abs(current.width - next.width) < 120 && Math.abs(current.height - next.height) < 120 ? current : next);
    };
    measure();
    const timer = setInterval(measure, 120);
    return () => clearInterval(timer);
  }, [enabled]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (timer !== undefined) clearTimeout(timer);
      // Capture target survives pointerup handlers committing original data.
      timer = setTimeout(() => setPressed(current => current.size ? new Set() : current), 0);
    };
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('blur', finish);
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', finish); window.removeEventListener('blur', finish);
    };
  }, []);
  const viewport = (scope.canvasSnapshotViewport || measuredView) as CanvasItemBox | null;
  const selected = scope.canvasSelectedIdsSet as ReadonlySet<string>;
  const eligible = useMemo(() => enabled && !drawingFailed ? items.filter(item => isStandaloneCanvasImage(item)
    && !scope.threeSceneAnalyzingIds.includes(item.id)) : [], [drawingFailed, enabled, items, scope.threeSceneAnalyzingIds]);
  useEffect(() => { if (!enabled) setDrawingFailed(false); }, [enabled]);
  const committedMaxEdge = useRef(512);
  const committedSourceTiers = useRef<ReadonlyMap<string, number>>(new Map());
  const loadSequence = useRef<Promise<void>>(Promise.resolve());
  // Small/medium scenes already fit completely: moving the viewport must not
  // restart the decode pump. Only over-capacity scenes need viewport priority.
  const residencyViewport = eligible.length > SNAPSHOT_MAX_RESIDENT_SOURCES ? viewport : null;
  const residency = useMemo(() => planSnapshotResidency(eligible, residencyViewport, committedMaxEdge.current), [eligible, residencyViewport]);
  const { sources, maxEdge } = residency;
  useLayoutEffect(() => { committedMaxEdge.current = maxEdge; }, [maxEdge]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let wake: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const pause = (delay: number) => new Promise<void>(resolve => {
      wake = resolve;
      timer = setTimeout(resolve, delay);
    });
    const load = async () => {
      const failed = new Set<string>();
      for (;;) {
        if (cancelled) return;
        const incremental = planIncrementalSnapshotRequests(cache, sources, maxEdge, committedSourceTiers.current);
        const pending = incremental.pending.filter(({ source }) => !failed.has(source));
        if (!pending.length) return;
        // Already-cached pictures keep their current tier. Crossing 80/256
        // images does not invalidate/retier every old bitmap on insertion.
        for (const [source, edge] of incremental.tiers) cache.touch(source, edge);
        for (let i = 0; i < pending.length && !cancelled; i += SNAPSHOT_REQUEST_BATCH_SIZE) {
          while (!cancelled && host.current?.closest('[data-canvas-surface="true"]')?.hasAttribute('data-canvas-zooming')) await pause(80);
          if (cancelled) return;
          const batch = pending.slice(i, i + SNAPSHOT_REQUEST_BATCH_SIZE);
          const results = await Promise.all(batch.map(({ source, maxEdge: edge }) => cache.request(source, edge)));
          results.forEach((result, index) => { if (!result) failed.add(batch[index].source); });
          if (cancelled) return;
          if (i + SNAPSHOT_REQUEST_BATCH_SIZE < pending.length) await pause(8);
        }
        // Hard-budget LRU may have evicted some older, oversized tiers. Repair
        // only those misses at the current smaller tier, never restart a full
        // decode pass. Errors are not retried automatically in this generation.
      }
    };
    // Serialize generations so an old, cancelled batch cannot occupy the queue
    // while a new density tier is admitted (which would cause queue-full fallbacks).
    loadSequence.current = loadSequence.current.then(load, load);
    return () => { cancelled = true; if (timer !== undefined) clearTimeout(timer); wake?.(); };
  }, [cache, enabled, maxEdge, sources]);
  const hasViewport = viewport !== null;
  const incremental = useMemo(() => planIncrementalSnapshotRequests(cache, sources, maxEdge, committedSourceTiers.current), [cache, sources, maxEdge, version]);
  useLayoutEffect(() => { committedSourceTiers.current = incremental.tiers; }, [incremental]);
  const readiness = useMemo(() => {
    const ready = new Map<string, string>(), edges = new Map<string, number>();
    if (!hasViewport) return { ready, edges };
    for (const [id, source] of sources) {
      const edge = incremental.tiers.get(source) ?? maxEdge;
      if (cache.peek(source, edge)) { ready.set(id, source); edges.set(id, edge); }
    }
    return { ready, edges };
  }, [cache, sources, incremental, hasViewport, maxEdge]);
  const { ready, edges } = readiness;
  const liveIds = useMemo(() => new Set([...selected, ...pressed, hovered].filter(Boolean)), [hovered, pressed, selected]);
  const plan = useMemo(() => planSnapshotRuns(items, ready, liveIds, undefined, maxEdge, edges), [items, ready, liveIds, maxEdge, edges]);
  const committedTiles = useRef<ReadonlyMap<string, SnapshotTile>>(new Map());
  const nextTiles = new Map<string, SnapshotTile>();
  const runs = useMemo(() => viewport ? plan.runs.map(run => ({ ...run, tiles: planSnapshotTiles(run.items, viewport) })) : [], [plan, viewport])
    .map(run => ({ ...run, tiles: run.tiles.map(tile => {
      const key = `${run.id}:${tile.id}`;
      const old = committedTiles.current.get(key);
      const stable = old && old.items.length === tile.items.length && old.items.every((entry,index) =>
        entry.item === tile.items[index].item && entry.source === tile.items[index].source && entry.maxEdge === tile.items[index].maxEdge) ? old : tile;
      nextTiles.set(key, stable); return stable;
    }) }));
  useLayoutEffect(() => { committedTiles.current = nextTiles; });
  const committedTileBudgets = useRef<ReadonlyMap<string, number>>(new Map());
  const tileBudgets = allocateSnapshotTileBudgets(runs.flatMap(run => run.tiles.map(tile => `${run.beforeId}:${tile.id}`)), committedTileBudgets.current);
  useLayoutEffect(() => { committedTileBudgets.current = tileBudgets; });
  const rasterIds = useMemo(() => new Set(runs.filter(run => run.tiles.length > 0).flatMap(run => run.items.map(({ item }) => item.id))), [runs]);
  const tilesAtId = new Map(runs.filter(run => run.tiles.length > 0).map(run => [run.beforeId, run.tiles]));
  const snapshotById = useMemo(() => new Map([...ready].map(([id, source]) => [id, cache.peek(source, edges.get(id) ?? maxEdge)])), [cache, ready, maxEdge, edges]);
  const failDrawing = useCallback(() => setDrawingFailed(true), []);
  const enter = (id: string) => { if (canUpdateSnapshotHover(host.current)) setHovered(id); };
  const leave = (id: string) => {
    if (canUpdateSnapshotHover(host.current)) setHovered(current => current === id ? '' : current);
  };
  const begin = (id: string) => {
    const ids = latestScope.current.canvasSelectedIdsRef?.current || [];
    setPressed(new Set([...ids, id]));
  };
  const nodes: ReactNode[] = [];
  for (const item of items) {
    const tiles = tilesAtId.get(item.id);
    if (tiles) for (const tile of tiles) nodes.push(<CanvasSnapshotTile key={`tile:${item.id}:${tile.id}`} tile={tile} cache={cache}
      pixelBudget={tileBudgets.get(`${item.id}:${tile.id}`)!} scale={scope.canvasRenderScale || 1} dark={Boolean(scope.canvasSnapshotDark)} onFailure={failDrawing} />);
    if (enabled && !drawingFailed && isStandaloneCanvasImage(item)) {
      const bitmap = snapshotById.get(item.id);
      const itemMaxEdge = edges.get(item.id) ?? maxEdge;
      const raster = rasterIds.has(item.id);
      nodes.push(<CanvasNodeRenderGate key={item.id}
        dependencies={getSnapshotNodeDependencies(item, selected.has(item.id), raster, bitmap, ready.get(item.id), itemMaxEdge, scope.canvasRenderScale || 1, scope.threeSceneAnalyzingIds.includes(item.id))}
        render={() => <CanvasStandaloneImageNode scope={renderScope} canvasItem={item} snapshot={{
          static: raster, bitmap, cache, source: ready.get(item.id), maxEdge: itemMaxEdge,
          enter: () => enter(item.id), leave: () => leave(item.id), begin: () => begin(item.id),
        }} />} />);
    } else nodes.push(<CanvasNodeRenderGate key={item.id} dependencies={getCanvasNodeRenderDependencies(scope, item)}
      render={() => <CanvasNode scope={renderScope} canvasItem={item} canvasItemsRef={canvasItemsRef} />} />);
  }
  return <><div ref={host} data-canvas-snapshot-host="true" data-snapshot-enabled={enabled ? 'true' : 'false'} data-snapshot-static-count={rasterIds.size}
    data-snapshot-max-edge={maxEdge} data-snapshot-source-count={residency.uniqueCount}
    data-snapshot-cache-count={cache.getStats().entries} data-snapshot-cache-bytes={cache.getStats().bytes}
    data-snapshot-live-count={items.length - rasterIds.size} data-snapshot-fallback={drawingFailed ? 'drawing-failed' : undefined}
    className="pointer-events-none absolute h-0 w-0" />{nodes}</>;
}
