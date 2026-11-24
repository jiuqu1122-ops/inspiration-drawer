import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { runAppLifecycleEffect06 } from '../../../app/controllers/appLifecycleEffects';
import type { CanvasUndoSnapshot } from '../../../types/canvasRuntime';
import type { CanvasImageItem } from '../../canvasModel';
import { CanvasLayerNode } from './CanvasLayerNode';
import { observeCanvasLayerRun, settleCanvasLayerHistory, type CanvasLayerContext } from './canvasLayerActions';
import { followLayerJob } from './canvasLayerJobs';
import type { LayerMode, LayerReceipt } from './canvasLayerTypes';

vi.mock('./canvasLayerJobs', () => ({ followLayerJob: vi.fn() }));
vi.mock('./canvasLayerAssets', async importOriginal => ({
  ...await importOriginal<typeof import('./canvasLayerAssets')>(),
  cacheLayerComposite: vi.fn(async () => ({ path: 'composite.png', url: 'https://example.test/composite.png' })),
}));

const start = 10_000;
function pending(mode: LayerMode): CanvasImageItem {
  return { id: 'result', x: 10, y: 20, width: 300, height: 260,
    item: { id: 'result', type: 'image', name: '结果', content: '', createdAt: start },
    layerResult: { mode, requestId: 'original', status: 'processing' } };
}
const snapshot = (items: CanvasImageItem[]): CanvasUndoSnapshot => ({
  items, selectedIds: [], size: { width: 900, height: 800 }, scroll: { left: 0, top: 0 }, label: '移动', createdAt: start,
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it.each(['split', 'edit'] as const)('ticks both %s cards from the persisted start time and stops when settled', mode => {
  vi.useFakeTimers();
  vi.setSystemTime(start + 7_000);
  vi.stubGlobal('window', { setInterval, clearInterval });
  const node = pending(mode);
  const operation: CanvasImageItem = { ...node, id: 'op', layerResult: undefined, layerOperation: { mode, outputs: { [mode]: node.id } } };
  const scope = { canvasItemsById: new Map([[node.id, node]]), canvasWorkingTimerTick: Date.now() };
  const setTick = vi.fn((tick: number | ((previous: number) => number)) => {
    scope.canvasWorkingTimerTick = typeof tick === 'number' ? tick : tick(scope.canvasWorkingTimerTick);
  });
  const stop = runAppLifecycleEffect06({ canvasItems: [operation, node], setCanvasWorkingTimerTick: setTick });
  vi.advanceTimersByTime(2000);
  for (const card of [operation, node]) expect(renderToStaticMarkup(<CanvasLayerNode scope={scope} item={card} />)).toContain('9秒');
  const processing = renderToStaticMarkup(<CanvasLayerNode scope={scope} item={operation} />);
  expect(processing).toContain('aria-busy="true"');
  expect(processing).toContain('disabled:cursor-wait');
  stop?.();
  const failed = { ...node, layerResult: { ...node.layerResult!, status: 'failed' as const } };
  scope.canvasItemsById.set(node.id, failed);
  expect(runAppLifecycleEffect06({ canvasItems: [operation, failed], setCanvasWorkingTimerTick: setTick })).toBeUndefined();
  vi.advanceTimersByTime(1000);
  expect(setTick).toHaveBeenCalledTimes(3);
  for (const card of [operation, failed]) expect(renderToStaticMarkup(<CanvasLayerNode scope={scope} item={card} />)).not.toContain('9秒');
  const idle = renderToStaticMarkup(<CanvasLayerNode scope={scope} item={operation} />);
  expect(idle).toContain('disabled:cursor-not-allowed');
  expect(idle).not.toContain('disabled:cursor-wait');
  expect(idle).not.toContain('aria-busy="true"');
  expect(idle.includes('修改要求（必填）')).toBe(mode === 'edit');
});

it.each(['split', 'edit'] as const)('keeps a settled %s receipt when undo restores a pending snapshot', async mode => {
  const node = pending(mode);
  const formerPosition = { ...node, x: 42, width: 150 };
  const differentRequest = { ...node, layerResult: { ...node.layerResult!, requestId: 'other' } };
  const alreadySettled = { ...node, layerResult: { ...node.layerResult!, status: 'success' as const } };
  let history = [snapshot([]), snapshot([formerPosition]), snapshot([differentRequest]), snapshot([alreadySettled])];
  const pixels = { width: 300, height: 100, alpha: true, transparent: true, asset: 0 };
  const assets = ['https://example.test/base.png'];
  const receipt: LayerReceipt = { status: 'success', chargedCredits: '20', result: mode === 'split'
    ? { operation: mode, width: 300, height: 100, base: pixels, layers: [], assets }
    : { operation: mode, image: pixels, assets } };
  const settleHistory: CanvasLayerContext['settleHistory'] = (_, id, change) => { history = settleCanvasLayerHistory(history, id, change); };
  const ctx = { settleHistory, update: vi.fn(), cacheImage: vi.fn() } as unknown as CanvasLayerContext;
  observeCanvasLayerRun(ctx, 'canvas', node);
  await vi.mocked(followLayerJob).mock.calls[0][2](receipt);
  const restored = history[1].items[0];
  expect(restored).toMatchObject({ x: 42, width: 150, height: 50, layerResult: { status: 'success', chargedCredits: '20' } });
  expect(restored.item.path).toBe(mode === 'split' ? 'composite.png' : assets[0]);
  expect(history[0].items).toHaveLength(0);
  expect(history[2].items[0]).toBe(differentRequest);
  expect(history[3].items[0]).toBe(alreadySettled);
  observeCanvasLayerRun(ctx, 'canvas', restored);
  expect(followLayerJob).toHaveBeenCalledTimes(1);
});
