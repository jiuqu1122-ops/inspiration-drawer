import { refreshCanvasConnectionHandleOcclusionImpl } from './controllers/canvasPersistenceActions';
import { describe, expect, it, vi } from 'vitest';
import { CanvasBoxIndex } from './canvasBoxIndex';
import { getCanvasItemElementFromContent } from './canvasDomLookup';
import { createCanvasNodeRenderScope, getCanvasNodeRenderDependencies } from './canvasNodeRenderDependencies';
import { areCanvasRenderDependenciesEqual } from '../../components/CanvasNodeRenderGate';
import type { CanvasImageItem, CanvasItemBox } from '../canvasModel';

const item = (patch: Partial<CanvasImageItem> = {}): CanvasImageItem => ({
  id: 'image', x: 0, y: 0, width: 100, height: 80,
  item: { id: 'asset', type: 'image', name: '图片', content: '' } as CanvasImageItem['item'], ...patch,
});
const scope = () => ({
  canvasSelectedIdsSet: new Set<string>(), canvasTextAgentRunningIds: [], activeThreeSceneId: null,
  threeSceneAnalyzingIds: [], canvasAiPromptEditingId: null, canvasPromptOptimizingId: null,
  canvasInputMenuForId: null, canvasInputPickTargetId: null, canvasConnectionDraft: null,
  canvasAiExpandedOutputNodeIds: new Set<string>(), canvasRenderScale: 1, canvasScaledNodeRadius: 14,
  canvasAiProvider: 'openai-compatible', canvasAiCredentialSource: 'wallet', canvasAiCloudImageModels: {},
  canvasAiUnifiedImageModelOptions: [], canvasAgent: { settings: {} }, canvasWorkflowTemplates: [],
  canvasWorkflowSingleEditGroupIds: [], canvasWorkingTimerTick: 0, canvasItemsById: new Map<string, CanvasImageItem>(),
});

describe('canvas render dependencies', () => {
  it('does not rerender 240 unchanged standalone images for zoom/settings, but does for actual image changes', () => {
    const before = scope();
    const after = { ...before, canvasRenderScale: .35, canvasWorkingTimerTick: 1000,
      canvasAiCloudImageModels: {}, canvasAgent: { settings: {} }, canvasAiUnifiedImageModelOptions: [] };
    for (let i = 0; i < 240; i++) {
      const node = item({ id: `image-${i}` });
      const old = getCanvasNodeRenderDependencies(before, node);
      expect(areCanvasRenderDependenciesEqual(old, getCanvasNodeRenderDependencies(after, node))).toBe(true);
      for (const changed of [{ ...node, x: 20 }, { ...node, rotation: 90 as const },
        { ...node, item: { ...node.item, thumbnail: 'new-source' } }]) {
        expect(areCanvasRenderDependenciesEqual(old, getCanvasNodeRenderDependencies(after, changed))).toBe(false);
      }
    }
  });
  it('preserves zoom invalidation for text, workflow, bridge, expanded slot, video and pending/error nodes', () => {
    const before = scope(), after = { ...before, canvasRenderScale: .5 };
    const nodes = [item({ item: { ...item().item, type: 'text' } }),
      item({ ai: { type: 'workflow' } }), item({ workflowGroup: { templateId: 'slot' } }),
      item({ workflowBridge: { type: 'reference-image' } }), item({ workflowSlotAssets: [] }),
      item({ item: { ...item().item, type: 'video' } }),
      item({ ai: { type: 'generated-image', status: 'working' } }),
      item({ ai: { type: 'generated-image', status: 'error' } })];
    for (const node of nodes) expect(areCanvasRenderDependenciesEqual(
      getCanvasNodeRenderDependencies(before, node), getCanvasNodeRenderDependencies(after, node),
    )).toBe(false);
  });
  it('invalidates related inputs, running progress and video selection without refreshing unrelated images', () => {
    const input = item(), node = item({ id: 'generator', inputs: ['image'], ai: { type: 'image-generator', status: 'working' } });
    const before = scope(); before.canvasItemsById.set(input.id, input);
    const old = getCanvasNodeRenderDependencies(before, node);
    const newerInput = { ...before, canvasItemsById: new Map([[input.id, { ...input, x: 4 }]]) };
    expect(areCanvasRenderDependenciesEqual(old, getCanvasNodeRenderDependencies(newerInput, node))).toBe(false);
    expect(areCanvasRenderDependenciesEqual(old, getCanvasNodeRenderDependencies({ ...before, canvasWorkingTimerTick: 1000 }, node))).toBe(false);
    const video = item({ item: { ...input.item, type: 'video' } });
    expect(areCanvasRenderDependenciesEqual(getCanvasNodeRenderDependencies(before, video),
      getCanvasNodeRenderDependencies({ ...before, canvasSelectedIdsSet: new Set(['image']) }, video))).toBe(false);
  });
  it('cached node event handlers call current actions while render data stays a snapshot', () => {
    const first = vi.fn(), second = vi.fn();
    const latest = { current: { drag: first, label: 'old', getValue: () => 10 } };
    const cache = new Map();
    const oldRender = createCanvasNodeRenderScope(latest.current, latest, cache);
    latest.current = { drag: second, label: 'new', getValue: () => 20 };
    const newRender = createCanvasNodeRenderScope(latest.current, latest, cache);
    oldRender.drag('image', .5);
    expect(first).not.toHaveBeenCalled(); expect(second).toHaveBeenCalledWith('image', .5);
    expect(newRender.drag).toBe(oldRender.drag); expect(oldRender.label).toBe('old');
    expect(oldRender.getValue()).toBe(10); expect(newRender.getValue()).toBe(20);
  });
});

describe('canvas element lookup', () => {
  it('reuses mounted nodes and re-queries after removal, replacement, an earlier miss or a canvas switch', () => {
    const element = { dataset: { canvasItemId: 'image' } };
    const live = new Set([element]);
    const root = { contains: (node: typeof element) => live.has(node), querySelector: vi.fn(() => [...live][0] || null) };
    const content = root as unknown as HTMLElement;
    expect(getCanvasItemElementFromContent(content, 'image')).toBe(element);
    expect(getCanvasItemElementFromContent(content, 'image')).toBe(element);
    expect(root.querySelector).toHaveBeenCalledTimes(1);
    live.clear(); expect(getCanvasItemElementFromContent(content, 'image')).toBeNull();
    const replacement = { dataset: { canvasItemId: 'image' } }; live.add(replacement);
    expect(getCanvasItemElementFromContent(content, 'image')).toBe(replacement);
    const anotherRoot = { contains: () => false, querySelector: vi.fn(() => element) };
    expect(getCanvasItemElementFromContent(anotherRoot as unknown as HTMLElement, 'image')).toBe(element);
    expect(anotherRoot.querySelector).toHaveBeenCalledTimes(1);
  });
});

describe('canvas world box index', () => {
  it('agrees with a full scan for overlaps, edges, negative coordinates and very large nodes', () => {
    let seed = 31;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const boxes: CanvasItemBox[] = Array.from({ length: 240 }, () => ({ x: random() * 8000 - 1000,
      y: random() * 6000 - 1000, width: random() * 1100, height: random() * 900 }));
    boxes.push({ x: -2e6, y: -2e6, width: 4e6, height: 4e6 });
    const index = new CanvasBoxIndex(boxes.map((box, i) => ({ item: i, box })));
    const points = boxes.flatMap(box => [[box.x, box.y], [box.x + box.width, box.y + box.height]]);
    points.push(...Array.from({ length: 500 }, () => [random() * 10000 - 1000, random() * 8000 - 1000]));
    for (const [x, y] of points) {
      const above = Math.floor(random() * boxes.length);
      expect(index.someAtPoint(x, y, i => i > above)).toBe(boxes.some((box, i) => i > above
        && x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height));
    }
  });
  it('uses current boxes after movement/resizing and preserves selection-based stacking predicates', () => {
    const node = { id: 'cover', selected: true };
    const oldBox = { x: 0, y: 0, width: 100, height: 100 };
    const old = new CanvasBoxIndex([{ item: node, box: oldBox }]);
    const next = new CanvasBoxIndex([{ item: node, box: { ...oldBox, x: 500, width: 200 } }]);
    expect(old.someAtPoint(50, 50, item => item.selected)).toBe(true);
    expect(next.someAtPoint(50, 50, item => item.selected)).toBe(false);
    expect(next.someAtPoint(700, 50, item => item.selected)).toBe(true);
    expect(next.someAtPoint(700, 50, item => !item.selected)).toBe(false);
  });
  it('returns viewport intersections in stacking order and keeps forced offscreen items', () => {
    const back = { id: 'back' }, middle = { id: 'middle' }, front = { id: 'front' }, forced = { id: 'forced' };
    const index = new CanvasBoxIndex([
      { item: back, box: { x: 0, y: 0, width: 100, height: 100 } },
      { item: middle, box: { x: 120, y: 0, width: 100, height: 100 } },
      { item: front, box: { x: 240, y: 0, width: 100, height: 100 } },
      { item: forced, box: { x: 5000, y: 5000, width: 100, height: 100 } },
    ]);
    expect(index.intersecting({ x: -10, y: -10, width: 380, height: 120 })).toEqual([back, middle, front]);
    expect(index.intersecting({ x: -10, y: -10, width: 380, height: 120 }, [forced])).toEqual([back, middle, front, forced]);
    expect(index.intersecting({ x: -10, y: -10, width: 1, height: 1 }, [forced])).toEqual([forced]);
    expect(index.intersecting({ x: -100000, y: -100000, width: 200000, height: 200000 })).toEqual([back, middle, front, forced]);
  });
  it('returns the topmost overlap in canvas order and prioritizes selected nodes', () => {
    const back = { id: 'back', selected: false }, front = { id: 'front', selected: false }, selected = { id: 'selected', selected: true };
    const index = new CanvasBoxIndex([back, front, selected].map(item => ({ item, box: { x: 0, y: 0, width: 100, height: 100 } })));
    expect(index.topAtPoint(50, 50)?.id).toBe('selected');
    expect(index.topAtPoint(50, 50, item => item.selected)?.id).toBe('selected');
    expect(index.topAtPoint(150, 50)).toBeNull();
  });
  it('matches a full ordered scan for randomized viewport ranges', () => {
    let seed = 9107;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const nodes = Array.from({ length: 600 }, (_, id) => ({ id }));
    const boxes = nodes.map((node, index) => ({ item: node, box: {
      x: random() * 30000 - 15000, y: random() * 20000 - 10000,
      width: index % 73 === 0 ? 5000 : random() * 900,
      height: index % 73 === 0 ? 5000 : random() * 700,
    } }));
    const index = new CanvasBoxIndex(boxes);
    for (let sample = 0; sample < 80; sample++) {
      const view = { x: random() * 30000 - 15000, y: random() * 20000 - 10000,
        width: 100 + random() * 4000, height: 100 + random() * 3000 };
      const expected = boxes.filter(({ box }) => box.x <= view.x + view.width && box.x + box.width >= view.x
        && box.y <= view.y + view.height && box.y + box.height >= view.y).map(({ item }) => item);
      expect(index.intersecting(view)).toEqual(expected);
    }
  });
});


describe('unconnected canvas occlusion fast path', () => {
  it('builds no geometry/index and scans no node IDs when no handles exist', () => {
    const query = vi.fn(() => []);
    const getBox = vi.fn(() => { throw new Error('Unnecessary world geometry'); });
    const sourceItems = { [Symbol.iterator]: () => { throw new Error('Unnecessary full canvas traversal'); } };
    refreshCanvasConnectionHandleOcclusionImpl({
      canvasContentRef: { current: { querySelectorAll: query } },
      canvasItemsRef: { current: sourceItems }, canvasSelectedIdsRef: { current: [] },
      CANVAS_CONNECTION_HANDLE_OUTSET: 0, getCanvasItemRenderedBox: getBox,
    } as any);
    expect(query).toHaveBeenCalledExactlyOnceWith('[data-canvas-connection-handle-id]');
    expect(getBox).not.toHaveBeenCalled();
  });
});
