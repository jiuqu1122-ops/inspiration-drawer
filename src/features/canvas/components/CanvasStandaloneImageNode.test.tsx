import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CanvasStandaloneImageNode } from './CanvasStandaloneImageNode';
import { CanvasNode } from './CanvasNode';
import { isStandaloneCanvasImage, createCanvasNodeRenderScope } from '../canvasNodeRenderDependencies';
import type { CanvasImageItem } from '../../canvasModel';

const item: CanvasImageItem = { id: 'image', x: 10, y: 20, width: 320, height: 240,
  item: { id: 'asset', type: 'image', content: 'Design reference', name: 'Test', createdAt: 1, thumbnail: 'thumb.png' } };
const fixture = () => {
  const scope = {
    canvasSelectedIdsSet: new Set<string>(), canvasSelectedIdsRef: { current: [] as string[] },
    canvasHoveredItemIdRef: { current: '' }, activeThreeSceneIdRef: { current: null as string | null },
    threeSceneAnalyzingIds: [] as string[], getStableCanvasImageSource: vi.fn(() => 'thumb.png'),
    exitThreeSceneInteraction: vi.fn(), startCanvasItemDrag: vi.fn(), preventCanvasNativeDrag: vi.fn(),
    updateCanvasSelection: vi.fn(), openCanvasContextMenu: vi.fn(), enableCanvasWorkflowSingleEditForItem: vi.fn(() => false),
    openCanvasBrushEditor: vi.fn(), copyCanvasImageToSystemClipboard: vi.fn(), rotateCanvasImageClockwise: vi.fn(), removeCanvasItemsByIds: vi.fn(),
  };
  return { scope, render: (node = item) => CanvasStandaloneImageNode({ scope, canvasItem: node }) };
};
function find(node: ReactElement, predicate: (props: any) => boolean): ReactElement<any> | undefined {
  if (predicate(node.props)) return node as ReactElement<any>;
  for (const child of Children.toArray((node.props as { children?: ReactNode }).children)) {
    if (isValidElement(child)) { const result = find(child, predicate); if (result) return result; }
  }
}
const event = () => ({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
describe('standalone image fast path', () => {
  it('strictly isolates generators, active jobs, workflows and media-specialized nodes', () => {
    expect(isStandaloneCanvasImage(item)).toBe(true);
    expect(isStandaloneCanvasImage({ ...item, inputs: ['reference'], canvasGroup: { id: 'user-group', name: 'Group' } } as any)).toBe(true);
    expect(isStandaloneCanvasImage({ ...item, ai: { type: 'generated-image', status: 'success' } })).toBe(true);
    for (const node of [
      { ...item, ai: { type: 'generated-image', status: 'working' } },
      { ...item, ai: { type: 'generated-image', status: 'error' } },
      { ...item, ai: { type: 'image-generator' } },
      { ...item, item: { ...item.item, type: 'video' } },
      { ...item, workflowGroup: {} }, { ...item, workflowBridge: {} },
      { ...item, workflowTemplateNodeId: 'internal' }, { ...item, workflowSlotAssets: [] },
    ]) expect(isStandaloneCanvasImage(node as CanvasImageItem)).toBe(false);
  });
  it('keeps cached event actions live rather than capturing an old App closure', () => {
    const f = fixture(); const first = vi.fn(), second = vi.fn();
    const initial = { ...f.scope, copyCanvasImageToSystemClipboard: first };
    const latest = { current: initial };
    const scope = createCanvasNodeRenderScope(initial, latest, new Map());
    const tree = CanvasStandaloneImageNode({ scope, canvasItem: item });
    latest.current = { ...initial, copyCanvasImageToSystemClipboard: second };
    find(tree, props => props.title === '复制图片')!.props.onClick(event());
    expect(first).not.toHaveBeenCalled(); expect(second).toHaveBeenCalledWith(item);
  });
  it('dispatches eligible nodes before heavy ViewModel resolution', () => {
    const f = fixture();
    const poison = new Proxy(f.scope, { get(target, key, receiver) {
      if (key === 'canvasAgent' || key === 'canvasAiCloudImageModels' || key === 'getCanvasAiResolvedModel') throw new Error('Heavy AI context read');
      return Reflect.get(target, key, receiver);
    } });
    const node = CanvasNode({ scope: poison, canvasItem: item, canvasItemsRef: { current: [item] } });
    expect(node.type).toBe(CanvasStandaloneImageNode);
    expect(renderToStaticMarkup(node)).toContain('src="thumb.png"');
  });
  it('renders without any model, pricing or workflow dependencies', () => {
    const f = fixture();
    const html = renderToStaticMarkup(f.render());
    expect(html).toContain('data-canvas-item-id="image"');
    expect(html).toContain('data-canvas-main-media="true"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('src="thumb.png"');
    expect(html).toContain('width:320px');
    expect(html).toContain('height:240px');
    expect(f.scope.getStableCanvasImageSource).toHaveBeenCalledExactlyOnceWith(item);
  });
  it('preserves drag, hover, context menu and 3D exit routing', () => {
    const f = fixture(); const node = f.render(); const p = node.props as any;
    f.scope.activeThreeSceneIdRef.current = 'other'; const down = event(); p.onPointerDown(down);
    expect(f.scope.exitThreeSceneInteraction).toHaveBeenCalledOnce();
    expect(f.scope.startCanvasItemDrag).toHaveBeenCalledWith(down, item.id);
    p.onPointerEnter(); expect(f.scope.canvasHoveredItemIdRef.current).toBe(item.id);
    p.onPointerLeave(); expect(f.scope.canvasHoveredItemIdRef.current).toBe('');
    const menu = event(); p.onContextMenu(menu);
    expect(f.scope.updateCanvasSelection).toHaveBeenCalledWith([item.id]);
    expect(f.scope.openCanvasContextMenu).toHaveBeenCalledWith(menu, 'item', { itemId: item.id });
  });
  it('preserves brush/copy/rotation/removal actions without native image replacement', () => {
    const f = fixture(); const node = f.render();
    for (const [title, callback, arg] of [
      ['画笔标记', f.scope.openCanvasBrushEditor, item.id],
      ['复制图片', f.scope.copyCanvasImageToSystemClipboard, item],
      ['顺时针旋转 90°', f.scope.rotateCanvasImageClockwise, item.id],
      ['从画布移除', f.scope.removeCanvasItemsByIds, [item.id]],
    ] as const) {
      const button = find(node, props => props.title === title)!;
      const e = event(); button.props.onClick(e);
      expect(callback).toHaveBeenCalledWith(arg); expect(e.preventDefault).toHaveBeenCalled(); expect(e.stopPropagation).toHaveBeenCalled();
    }
  });
  it('keeps successful generated images without a source in the existing waiting state', () => {
    const f = fixture();
    const node = { ...item, ai: { type: 'generated-image', status: 'success' } } as CanvasImageItem;
    f.scope.getStableCanvasImageSource.mockReturnValue('');
    const html = renderToStaticMarkup(f.render(node));
    expect(html).toContain('生成中');
    expect(html).not.toContain('data-canvas-main-media=\"true\"');
    expect(html).not.toContain('画笔标记');
  });
  it('preserves rotated geometry, pending thumbnail state and analysis overlay', () => {
    const f = fixture();
    expect(renderToStaticMarkup(f.render({ ...item, rotation: 90 }))).toContain('rotate(90deg)');
    f.scope.getStableCanvasImageSource.mockReturnValue('');
    expect(renderToStaticMarkup(f.render())).toContain('正在准备缩略图');
    f.scope.threeSceneAnalyzingIds = [item.id];
    expect(renderToStaticMarkup(f.render())).toContain('正在分析图片构图');
  });
  it('keeps the same interactive root when only its presentation becomes static', () => {
    const f = fixture(); const enter = vi.fn(), leave = vi.fn(), begin = vi.fn();
    const tree = CanvasStandaloneImageNode({ scope: f.scope, canvasItem: item, snapshot: { static: true, enter, leave, begin } });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('data-canvas-item-id="image"');
    expect(html).toContain('data-canvas-snapshot-static="true"');
    expect(html).not.toContain('<img'); expect(html).not.toContain('title="画笔标记"');
    expect(f.scope.getStableCanvasImageSource).not.toHaveBeenCalled();
    const props = tree.props as any; props.onPointerEnter(); props.onPointerLeave(); props.onPointerDown(event());
    expect(enter).toHaveBeenCalledOnce(); expect(leave).toHaveBeenCalledOnce(); expect(begin).toHaveBeenCalledOnce();
    expect(f.scope.startCanvasItemDrag).toHaveBeenCalledWith(expect.anything(), item.id);
  });

  it('retains a bounded navigation bitmap for a selected high-resolution image beyond the overview tier', () => {
    const f = fixture(); f.scope.canvasSelectedIdsSet.add(item.id);
    f.scope.getStableCanvasImageSource.mockReturnValue('original-6000px.png');
    const bitmap = { key: 'thumb128', drawable: {} as CanvasImageSource, width: 128, height: 96, bytes: 128 * 96 * 4 };
    const node = CanvasStandaloneImageNode({ scope: { ...f.scope, canvasRenderScale: 2 }, canvasItem: item,
      snapshot: { static: false, bitmap, source: 'thumb.png', maxEdge: 128, enter: vi.fn(), leave: vi.fn(), begin: vi.fn() } });
    const html = renderToStaticMarkup(node);
    expect(html).toContain('data-canvas-selected-state="true"');
    expect(html).toContain('data-canvas-snapshot-preview="true"');
    expect(html).toContain('data-canvas-original-at-rest="true"');
    expect(html).toContain('src="original-6000px.png"');
    expect(html).toContain('title="复制图片"');
  });

});
