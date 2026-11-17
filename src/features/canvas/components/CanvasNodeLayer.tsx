import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { bindCanvasOverviewInteractions } from '../canvasOverviewInteractions';
import { CanvasNodeRenderGate } from '../../../components/CanvasNodeRenderGate';
import { createCanvasNodeRenderScope, getCanvasNodeRenderDependencies, isStandaloneCanvasImage } from '../canvasNodeRenderDependencies';
import { CanvasNode } from './CanvasNode';
import { CanvasStandaloneImageNode } from './CanvasStandaloneImageNode';
import { CanvasSnapshotTile } from './CanvasSnapshotLayer';
import type { CanvasImageItem, CanvasItemBox } from '../../canvasModel';
import { createSnapshotBitmapCache } from '../snapshot/snapshotBitmapCache';
import { planSnapshotRuns, planSnapshotTiles, planSnapshotOverviewTiles, type SnapshotTile } from '../snapshot/snapshotScene';
import { useCanvasSnapshotMode } from '../snapshot/snapshotMode';
import { planIncrementalSnapshotRequests } from '../snapshot/snapshotIncrementalResidency';
import { allocateSnapshotTileBudgets, SNAPSHOT_TOTAL_TILE_PIXELS } from '../snapshot/snapshotTileBudgets';
import { createSnapshotRefreshScheduler } from '../snapshot/snapshotRefreshScheduler';
import { canUpdateSnapshotHover, getSnapshotNodeDependencies, planSnapshotResidency, SNAPSHOT_CACHE_BYTES, SNAPSHOT_MAX_RESIDENT_SOURCES, SNAPSHOT_REQUEST_BATCH_SIZE } from '../snapshot/snapshotResidency';
import { createCanvasOverviewHitIndex, shouldUseCanvasSnapshotOverview, CANVAS_MATERIALIZE_ITEMS_EVENT, CANVAS_SNAPSHOT_OVERVIEW_MAX_TILES, CANVAS_SNAPSHOT_OVERVIEW_TILE_SIZE } from '../canvasSnapshotOverview';

export type CanvasNodeLayerScope = Record<string, any>;
const getSnapshotTileKey = (tile: SnapshotTile, runId: string) => `${tile.id}:${tile.items[0]?.item.id ?? runId}`;
const canRasterizeImageOverview = (item: CanvasImageItem) => isStandaloneCanvasImage(item)
  && [item.x, item.y, item.width, item.height].every(Number.isFinite) && item.width > 0 && item.height > 0;

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
  const host = useRef<HTMLDivElement | null>(null);
  const disposal = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (disposal.current !== null) clearTimeout(disposal.current);
    const refresh = createSnapshotRefreshScheduler(
      () => Boolean(host.current?.closest('[data-canvas-surface="true"]')?.hasAttribute('data-canvas-zooming')
        || (latestScope.current.canvasPanRef as { current?: unknown } | undefined)?.current),
      () => setVersion(value => value + 1),
    );
    const unsubscribe = cache.subscribe(() => refresh.request());
    return () => {
      unsubscribe();
      refresh.dispose();
      // Deferred finalization survives React StrictMode's setup/cleanup replay.
      disposal.current = setTimeout(() => cache.dispose(), 0);
    };
  }, [cache]);
  const [measuredView, setMeasuredView] = useState<CanvasItemBox | null>(null);
  const providedViewport = scope.canvasSnapshotViewport as CanvasItemBox | null | undefined;
  useLayoutEffect(() => {
    if (!enabled || providedViewport) return;
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
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    return () => observer.disconnect();
  }, [enabled, Boolean(providedViewport)]);
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
  const viewport = providedViewport || measuredView;
  const scale = Number(scope.canvasLiveScaleRef?.current) || Number(scope.canvasRenderScale) || 1;
  const cacheCandidates = (scope.canvasItems as CanvasImageItem[] | undefined) ?? items;
  const previousOverview = useRef(false);
  const overview = Boolean(enabled && !drawingFailed && viewport && shouldUseCanvasSnapshotOverview(scale, previousOverview.current, cacheCandidates.length));
  useLayoutEffect(() => { previousOverview.current = overview; }, [overview]);
  const selected = scope.canvasSelectedIdsSet as ReadonlySet<string>;
  // Warm the bounded low-resolution overview from the full document, not only
  // the currently mounted/cull-filtered render list. This lets far nodes be
  // raster-ready before a zoom-to-fit exposes hundreds of them at once.
  const eligible = useMemo(() => enabled && !drawingFailed ? cacheCandidates.filter(item => isStandaloneCanvasImage(item)
    && !scope.threeSceneAnalyzingIds.includes(item.id)) : [], [cacheCandidates, drawingFailed, enabled, scope.threeSceneAnalyzingIds]);
  useEffect(() => { if (!enabled) setDrawingFailed(false); }, [enabled]);
  const committedMaxEdge = useRef(512);
  const committedSourceTiers = useRef<ReadonlyMap<string, number>>(new Map());
  const residency = useMemo(() => planSnapshotResidency(eligible, viewport, committedMaxEdge.current), [eligible, viewport]);
  const { prioritySources, maxEdge } = residency;
  // For documents within the hard source cap, use a stable source map in canvas
  // order. A changing viewport updates only queue priority, not every cached
  // tier/readiness map on every pointer/zoom publication.
  const sources = useMemo(() => eligible.length > SNAPSHOT_MAX_RESIDENT_SOURCES
    ? residency.sources
    : planSnapshotResidency(eligible, null, maxEdge).sources,
  [eligible, eligible.length > SNAPSHOT_MAX_RESIDENT_SOURCES ? residency.sources : null, maxEdge]);
  const prioritySourcesRef = useRef<readonly string[]>(prioritySources);
  useLayoutEffect(() => { prioritySourcesRef.current = prioritySources; }, [prioritySources]);
  useLayoutEffect(() => { cache.prioritize(viewport ? prioritySources : null); }, [cache, prioritySources, viewport]);
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
        let pending = incremental.pending.filter(({ source }) => !failed.has(source));
        const surface = host.current?.closest('[data-canvas-surface="true"]');
        const zooming = Boolean(surface?.hasAttribute('data-canvas-zooming'));
        const panning = Boolean((latestScope.current.canvasPanRef as { current?: unknown } | undefined)?.current);
        if (zooming || panning) {
          const prioritized = new Set(prioritySourcesRef.current);
          pending = pending.filter(({ source }) => prioritized.has(source));
        }
        if (!pending.length) {
          if (zooming || panning) { await pause(64); continue; }
          return;
        }
        const rank = new Map(prioritySourcesRef.current.map((source, index) => [source, index]));
        pending.sort((a, b) => (rank.get(a.source) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.source) ?? Number.MAX_SAFE_INTEGER));
        // Already-cached pictures keep their current tier. Crossing 80/256
        // images does not invalidate/retier every old bitmap on insertion.
        for (const [source, edge] of incremental.tiers) cache.touch(source, edge);
        let queueFull = false;
        let cancelledQueuedWork = false;
        while (pending.length && !cancelled) {
          const batch = pending.splice(0, SNAPSHOT_REQUEST_BATCH_SIZE);
          const results = await Promise.all(batch.map(({ source, maxEdge: edge }) => cache.request(source, edge)));
          results.forEach((result, index) => {
            if (result) return;
            const failure = cache.getFailure(batch[index].source, batch[index].maxEdge);
            if (failure?.code === 'queue-full') queueFull = true;
            else if (failure) failed.add(batch[index].source);
            else cancelledQueuedWork = true;
          });
          if (cancelled) return;
          if (queueFull || cancelledQueuedWork) await pause(64);
          else if (pending.length) await pause(8);
          // Recompute viewport priority between batches. The cache scheduler
          // cancels obsolete queued jobs; those are re-tried only if/when visible.
          if (pending.length) {
            const liveZoom = Boolean(host.current?.closest('[data-canvas-surface="true"]')?.hasAttribute('data-canvas-zooming'));
            const livePan = Boolean((latestScope.current.canvasPanRef as { current?: unknown } | undefined)?.current);
            const liveRank = new Map(prioritySourcesRef.current.map((source, index) => [source, index]));
            pending = pending.filter(({ source }) => !failed.has(source) && (!(liveZoom || livePan) || liveRank.has(source)))
              .sort((a, b) => (liveRank.get(a.source) ?? Number.MAX_SAFE_INTEGER) - (liveRank.get(b.source) ?? Number.MAX_SAFE_INTEGER));
          }
          queueFull = false; cancelledQueuedWork = false;
        }
        // Hard-budget LRU may have evicted some older, oversized tiers. Repair
        // only those misses at the current smaller tier, never restart a full
        // decode pass. Errors are not retried automatically in this generation.
      }
    };
    // Viewport-priority cancellation releases obsolete queued jobs, so the newest
    // generation can start immediately without waiting for stale active decodes.
    void load();
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
  const liveIds = useMemo(() => new Set([...selected, ...(scope.canvasSelectedIdsRef?.current || []), ...pressed, hovered].filter(Boolean)), [hovered, pressed, selected, scope.canvasSelectedIdsRef]);
  const sceneItems = overview ? cacheCandidates : items;
  // Rasterize only the current visual viewport and its existing overscan. A
  // full-document raster spreads the same pixel budget over vast empty space,
  // making visible nodes look heavily pixelated at minimum zoom.
  const overviewViewport = viewport;
  const plan = useMemo(() => planSnapshotRuns(sceneItems, ready, liveIds, undefined, maxEdge, edges), [sceneItems, ready, liveIds, maxEdge, edges]);
  const committedTiles = useRef<ReadonlyMap<string, SnapshotTile>>(new Map());
  const planned = useMemo(() => {
    const nextTiles = new Map<string, SnapshotTile>();
    const runs = overviewViewport ? plan.runs.map(run => ({
      ...run,
      tiles: overview
        ? planSnapshotOverviewTiles(run.items, overviewViewport, CANVAS_SNAPSHOT_OVERVIEW_TILE_SIZE,
          Math.max(4, Math.floor(CANVAS_SNAPSHOT_OVERVIEW_MAX_TILES / Math.max(1, plan.runs.length))))
        : planSnapshotTiles(run.items, overviewViewport),
    })).map(run => ({ ...run, tiles: run.tiles.map(tile => {
      const key = getSnapshotTileKey(tile, run.id);
      const old = committedTiles.current.get(key);
      const stable = old && old.items.length === tile.items.length && old.items.every((entry,index) =>
        entry.item === tile.items[index].item && entry.source === tile.items[index].source && entry.maxEdge === tile.items[index].maxEdge) ? old : tile;
      nextTiles.set(key, stable);
      return stable;
    }) })) : [];
    return { runs, nextTiles };
  }, [overview, plan, overviewViewport]);
  const { runs, nextTiles } = planned;
  useLayoutEffect(() => { committedTiles.current = nextTiles; }, [nextTiles]);
  const allOverviewTileKeys = useMemo(() => runs.flatMap(run => run.tiles.map(tile => getSnapshotTileKey(tile, run.id))), [runs]);
  const [readyOverviewTileKeys, setReadyOverviewTileKeys] = useState<ReadonlySet<string>>(() => new Set());
  const readyOverviewTileKeysRef = useRef<ReadonlySet<string>>(new Set());
  useLayoutEffect(() => {
    if (overview) return;
    if (readyOverviewTileKeysRef.current.size) {
      readyOverviewTileKeysRef.current = new Set();
      setReadyOverviewTileKeys(readyOverviewTileKeysRef.current);
    }
  }, [overview]);
  useEffect(() => {
    if (!overview || !allOverviewTileKeys.length) return;
    let cancelled = false;
    let frame: number | null = null;
    const stageNextBatch = () => {
      frame = null;
      if (cancelled) return;
      const current = readyOverviewTileKeysRef.current;
      const currentKeys = new Set(allOverviewTileKeys);
      const retained = [...current].filter(key => currentKeys.has(key));
      const pending = allOverviewTileKeys.filter(key => !current.has(key));
      if (!pending.length) return;
      const next = new Set(retained);
      pending.slice(0, 1).forEach(key => next.add(key));
      readyOverviewTileKeysRef.current = next;
      setReadyOverviewTileKeys(next);
      if (next.size < allOverviewTileKeys.length) frame = requestAnimationFrame(stageNextBatch);
    };
    frame = requestAnimationFrame(stageNextBatch);
    return () => {
      cancelled = true;
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [allOverviewTileKeys, overview]);
  const overviewTileKeys = useMemo(() => !overview ? null : typeof window === 'undefined'
    ? new Set(allOverviewTileKeys) : readyOverviewTileKeys, [allOverviewTileKeys, overview, readyOverviewTileKeys]);
  const visibleRuns = useMemo(() => !overviewTileKeys ? runs : runs.map(run => ({
    ...run, tiles: run.tiles.filter(tile => overviewTileKeys.has(getSnapshotTileKey(tile, run.id))),
  })), [overviewTileKeys, runs]);
  const completeOverviewRasterIds = useMemo(() => {
    if (!overviewTileKeys) return null;
    const tileKeysByItem = new Map<string, string[]>();
    for (const run of runs) for (const tile of run.tiles) {
      const key = getSnapshotTileKey(tile, run.id);
      for (const { item } of tile.items) {
        const keys = tileKeysByItem.get(item.id);
        if (keys) keys.push(key); else tileKeysByItem.set(item.id, [key]);
      }
    }
    return new Set([...tileKeysByItem].filter(([, keys]) => keys.every(key => overviewTileKeys.has(key))).map(([id]) => id));
  }, [overviewTileKeys, runs]);
  const committedTileBudgets = useRef<ReadonlyMap<string, number>>(new Map());
  const tileBudgets = allocateSnapshotTileBudgets(allOverviewTileKeys, committedTileBudgets.current, overview ? SNAPSHOT_TOTAL_TILE_PIXELS : undefined);
  useLayoutEffect(() => { committedTileBudgets.current = tileBudgets; });
  const rasterIds = useMemo(() => completeOverviewRasterIds ?? new Set(runs.flatMap(run => run.tiles.flatMap(tile => tile.items.map(({ item }) => item.id)))), [completeOverviewRasterIds, runs]);
  const tilesAtId = new Map(visibleRuns.filter(run => run.tiles.length > 0).map(run => [run.beforeId, run.tiles]));
  const snapshotById = useMemo(() => new Map([...ready].map(([id, source]) => [id, cache.peek(source, edges.get(id) ?? maxEdge)])), [cache, ready, maxEdge, edges]);
  const failDrawing = useCallback(() => setDrawingFailed(true), []);
  const visibleItemIds = useMemo(() => new Set(items.map(item => item.id)), [items]);
  const overviewHitIndex = useMemo(() => overview ? createCanvasOverviewHitIndex(sceneItems.filter(canRasterizeImageOverview)) : null,
    [overview, sceneItems]);
  const overviewState = useRef({ index: overviewHitIndex, rasterIds, scale, scope });
  useLayoutEffect(() => { overviewState.current = { index: overviewHitIndex, rasterIds, scale, scope }; });
  useLayoutEffect(() => {
    const content = host.current?.closest<HTMLElement>('[data-canvas-content-layer="true"]');
    if (!content || !overview) return;
    const materialize = (event: Event) => {
      const ids = (event as CustomEvent<unknown>).detail;
      if (!Array.isArray(ids)) return;
      flushSync(() => setPressed(current => {
        const next = new Set(current);
        ids.forEach(id => { if (typeof id === 'string') next.add(id); });
        return next.size === current.size ? current : next;
      }));
    };
    const promote = (id: string) => {
      const ids = latestScope.current.canvasSelectedIdsRef?.current || [];
      flushSync(() => setPressed(current => new Set([...current, ...ids, id])));
    };
    content.setAttribute('data-canvas-overview', 'true');
    content.addEventListener(CANVAS_MATERIALIZE_ITEMS_EVENT, materialize);
    const unbind = bindCanvasOverviewInteractions(content, () => overviewState.current, promote);
    return () => {
      unbind();
      content.removeEventListener(CANVAS_MATERIALIZE_ITEMS_EVENT, materialize);
      content.removeAttribute('data-canvas-overview');
    };
  }, [overview]);
  const enter = (id: string) => { if (canUpdateSnapshotHover(host.current)) setHovered(id); };
  const leave = (id: string) => {
    if (canUpdateSnapshotHover(host.current)) setHovered(current => current === id ? '' : current);
  };
  const begin = (id: string) => {
    const ids = latestScope.current.canvasSelectedIdsRef?.current || [];
    setPressed(new Set([...ids, id]));
  };
  const nodes: ReactNode[] = [];
  let mountedNodeCount = 0;
  for (const item of sceneItems) {
    const tiles = tilesAtId.get(item.id);
    if (tiles) for (const tile of tiles) nodes.push(<CanvasSnapshotTile key={`tile:${tile.id}:${tile.items[0]?.item.id ?? item.id}`} tile={tile} cache={cache}
      pixelBudget={tileBudgets.get(`${tile.id}:${tile.items[0]?.item.id ?? item.id}`)!} scale={scope.canvasRenderScale || 1} dark={Boolean(scope.canvasSnapshotDark)} onFailure={failDrawing} />);
    if (overview && rasterIds.has(item.id)) continue;
    if (overview && !visibleItemIds.has(item.id) && !selected.has(item.id) && !pressed.has(item.id)) continue;
    mountedNodeCount++;
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
  return <><div ref={host} data-canvas-snapshot-host="true" data-snapshot-enabled={enabled ? 'true' : 'false'} data-canvas-overview-active={overview ? 'true' : 'false'} data-snapshot-static-count={rasterIds.size}
    data-snapshot-max-edge={maxEdge} data-snapshot-source-count={residency.uniqueCount}
    data-snapshot-cache-count={cache.getStats().entries} data-snapshot-cache-bytes={cache.getStats().bytes} data-snapshot-overview-tiles-ready={overview ? readyOverviewTileKeys.size : undefined}
    data-snapshot-dom-count={mountedNodeCount} data-snapshot-tile-count={nextTiles.size} data-snapshot-live-count={items.filter(item => !rasterIds.has(item.id)).length} data-snapshot-fallback={drawingFailed ? 'drawing-failed' : undefined}
    className="pointer-events-none absolute h-0 w-0" />{nodes}</>;
}
