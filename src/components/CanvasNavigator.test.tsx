import {
  Children,
  isValidElement,
  type ComponentProps,
  type DependencyList,
  type EffectCallback,
  type ReactElement,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CanvasNavigator, type CanvasNavigatorItem, type CanvasNavigatorPreview } from './CanvasNavigator';
import type { CanvasImageItem } from '../features/canvasModel';

type HookApi = {
  useMemo: <T>(create: () => T, deps: DependencyList) => T;
  useCallback: <T>(callback: T, deps: DependencyList) => T;
  useRef: <T>(initial: T) => { current: T };
  useLayoutEffect: (effect: EffectCallback, deps?: DependencyList) => void;
};
const activeHooks = vi.hoisted(() => ({ current: null as HookApi | null }));

// Real React handles SSR. Only the direct element/commit contract tests use hook slots;
// no DOM renderer, browser, user data, or additional test dependency is required.
vi.mock('react', async importOriginal => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useMemo: (create: () => unknown, deps: DependencyList) => activeHooks.current
      ? activeHooks.current.useMemo(create, deps) : actual.useMemo(create, deps),
    useCallback: (callback: (...args: any[]) => unknown, deps: DependencyList) => activeHooks.current
      ? activeHooks.current.useCallback(callback, deps) : actual.useCallback(callback, deps),
    useRef: (initial: unknown) => activeHooks.current
      ? activeHooks.current.useRef(initial) : actual.useRef(initial),
    useLayoutEffect: (effect: EffectCallback, deps?: DependencyList) => activeHooks.current
      ? activeHooks.current.useLayoutEffect(effect, deps) : actual.useLayoutEffect(effect, deps),
  };
});

type Props = ComponentProps<typeof CanvasNavigator>;
type MapProps = Pick<Props, 'items' | 'selectedIds' | 'getPreview' | 'getThumbnailSource' | 'onSelectItem'>;
type Element = ReactElement<Record<string, any>>;

const sameDeps = (a: DependencyList | undefined, b: DependencyList | undefined) =>
  a !== undefined && b !== undefined && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

function hookSlots() {
  const slots: Array<{ value: unknown; deps?: DependencyList }> = [];
  let cursor = 0;
  let effects: Array<() => void> = [];
  const api: HookApi = {
    useMemo<T>(create: () => T, deps: DependencyList) {
      const index = cursor++;
      if (!slots[index] || !sameDeps(slots[index].deps, deps)) slots[index] = { value: create(), deps };
      return slots[index].value as T;
    },
    useCallback: (callback, deps) => api.useMemo(() => callback, deps),
    useRef<T>(initial: T) {
      const index = cursor++;
      slots[index] ??= { value: { current: initial } };
      return slots[index].value as { current: T };
    },
    useLayoutEffect(effect, deps) {
      const index = cursor++;
      if (!slots[index] || !sameDeps(slots[index].deps, deps)) effects.push(() => {
        effect();
        slots[index] = { value: undefined, deps };
      });
    },
  };
  return {
    render<T>(render: () => T) {
      cursor = 0;
      effects = [];
      const previous = activeHooks.current;
      activeHooks.current = api;
      try { return render(); } finally { activeHooks.current = previous; }
    },
    commit() {
      const pending = effects;
      effects = [];
      pending.forEach(effect => effect());
    },
  };
}

function find(tree: ReactNode, predicate: (element: Element) => boolean): Element | undefined {
  for (const child of Children.toArray(tree)) {
    if (!isValidElement<Record<string, any>>(child)) continue;
    if (predicate(child)) return child;
    const match = find(child.props.children, predicate);
    if (match) return match;
  }
  return undefined;
}

function mapElement(tree: ReactNode) {
  const element = find(tree, node => 'getPreview' in node.props && 'selectedIds' in node.props);
  expect(element).toBeDefined();
  return element! as ReactElement<MapProps>;
}

// Check React.memo's public shallow-prop boundary separately from parent/chrome renders.
// This is a unit-level reconciliation contract, not a native/UI performance measurement.
function mapRenderer() {
  const hooks = hookSlots();
  let previous: ReactElement<MapProps> | undefined;
  let result: ReactNode;
  let renders = 0;
  return {
    render(element: ReactElement<MapProps>) {
      const component = element.type as unknown as {
        $$typeof: symbol;
        compare: null;
        type: (props: MapProps) => ReactNode;
      };
      expect(component.$$typeof).toBe(Symbol.for('react.memo'));
      expect(component.compare).toBeNull();
      const keys = Object.keys(element.props) as Array<keyof MapProps>;
      const unchanged = previous && previous.type === element.type
        && keys.length === Object.keys(previous.props).length
        && keys.every(key => Object.is(element.props[key], previous!.props[key]));
      if (!unchanged) {
        result = hooks.render(() => component.type(element.props));
        previous = element;
        renders++;
      }
      return result;
    },
    get renders() { return renders; },
  };
}

function entry(id: string, x = 0, y = 0, width = 100, height = 100): CanvasNavigatorItem {
  const item: CanvasImageItem = {
    id, x, y, width, height,
    item: { id: `asset-${id}`, type: 'image', content: '', name: id, createdAt: 1 },
  };
  return { item, box: { x, y, width, height } };
}

function fixture(patch: Partial<Props> = {}): Props {
  return {
    visible: true,
    panelRef: { current: null },
    items: [entry('first', -50, -20), entry('second', 50, 80, 1, 1)],
    selectedIds: new Set(),
    zoomPercent: 100,
    getPreview: vi.fn(() => null),
    getThumbnailSource: vi.fn((item, preview) => preview?.source || `thumb-${item.id}.png`),
    onToggle: vi.fn(), onClose: vi.fn(), onSelectItem: vi.fn(),
    onZoomOut: vi.fn(), onResetZoom: vi.fn(), onFit: vi.fn(), onZoomIn: vi.fn(), onLocatePrimary: vi.fn(),
    ...patch,
  };
}

function rootRenderer() {
  const hooks = hookSlots();
  return {
    render(props: Props, commit = true) {
      const tree = hooks.render(() => CanvasNavigator(props));
      if (commit) hooks.commit();
      return tree;
    },
    commit: () => hooks.commit(),
  };
}

const node = (tree: ReactNode, id: string) => find(tree, element => element.props.item?.id === id)!;

describe('CanvasNavigator bounded render work', () => {
  it('does zero item/bounds, preview or thumbnail/signature work while hidden (real SSR)', () => {
    const props = fixture({ visible: false });
    const getEntry = vi.fn(() => { throw new Error('Hidden navigator traversed its items'); });
    Object.defineProperty(props.items, 0, { get: getEntry });
    const has = vi.spyOn(props.selectedIds, 'has');
    const html = renderToStaticMarkup(<CanvasNavigator {...props} />);
    expect(html).toContain('data-canvas-navigator-toggle="true"');
    expect(html).toContain('title="显示导航"');
    expect(html).not.toContain('data-canvas-navigator-panel');
    expect(getEntry).not.toHaveBeenCalled();
    expect(props.getPreview).not.toHaveBeenCalled();
    expect(props.getThumbnailSource).not.toHaveBeenCalled();
    expect(has).not.toHaveBeenCalled();
  });

  it('keeps the map/list cached across 100 zoom/chrome-only parent renders', () => {
    const props = fixture();
    const root = rootRenderer();
    const map = mapRenderer();
    const selectedHas = vi.spyOn(props.selectedIds, 'has');
    const firstElement = mapElement(root.render(props));
    const firstMap = map.render(firstElement);
    const selectedReads = selectedHas.mock.calls.length;
    for (let i = 0; i < 100; i++) {
      const next = root.render({
        ...props, zoomPercent: 30 + i, panelRef: { current: null },
        onSelectItem: vi.fn(), onZoomIn: vi.fn(), onZoomOut: vi.fn(),
        onResetZoom: vi.fn(), onFit: vi.fn(), onLocatePrimary: vi.fn(), onClose: vi.fn(), onToggle: vi.fn(),
      });
      const nextMap = mapElement(next);
      expect(nextMap.props.onSelectItem).toBe(firstElement.props.onSelectItem);
      expect(map.render(nextMap)).toBe(firstMap);
      expect(find(next, element => element.props.title === '重置缩放')!.props.children).toEqual([30 + i, '%']);
    }
    expect(map.renders).toBe(1);
    expect(props.getPreview).toHaveBeenCalledTimes(2);
    expect(props.getThumbnailSource).toHaveBeenCalledTimes(2);
    expect(selectedHas).toHaveBeenCalledTimes(selectedReads);
  });

  it('invalidates selection without rederiving previews; selector and item changes refresh map fields', () => {
    const props = fixture();
    const root = rootRenderer();
    const map = mapRenderer();
    const render = (next: Props) => map.render(mapElement(root.render(next)));
    expect(node(render(props), 'first').props.selected).toBe(false);
    const selected = { ...props, selectedIds: new Set(['first']) };
    expect(node(render(selected), 'first').props.selected).toBe(true);
    expect(props.getPreview).toHaveBeenCalledTimes(2);
    expect(props.getThumbnailSource).toHaveBeenCalledTimes(2);

    const preview: CanvasNavigatorPreview = { source: 'new-preview.png', mediaType: 'video' };
    const getPreview = vi.fn(() => preview);
    const changedPreview = { ...selected, getPreview };
    expect(node(render(changedPreview), 'first').props.source).toBe('new-preview.png');
    expect(getPreview).toHaveBeenCalledTimes(2);
    expect(props.getThumbnailSource).toHaveBeenLastCalledWith(props.items[1].item, preview);

    const getThumbnailSource = vi.fn((_item: CanvasImageItem, value: CanvasNavigatorPreview | null) => `cached:${value?.source}`);
    const changedThumbnail = { ...changedPreview, getThumbnailSource };
    expect(node(render(changedThumbnail), 'first').props.source).toBe('cached:new-preview.png');
    expect(getThumbnailSource).toHaveBeenCalledTimes(2);

    const updated = entry('first', -50, -20, 200, 150);
    const changedItems = { ...changedThumbnail, items: [updated, props.items[1]] };
    const finalMap = render(changedItems);
    expect(node(finalMap, 'first').props.item).toBe(updated.item);
    expect(node(finalMap, 'first').props.width).not.toBe(node(render(props), 'first').props.width);
    expect(getThumbnailSource).toHaveBeenCalledWith(updated.item, preview);
  });

  it('does not publish an uncommitted selection action and uses the latest committed action without map work', () => {
    const first = vi.fn();
    const abandoned = vi.fn();
    const latest = vi.fn();
    const props = fixture({ onSelectItem: first });
    const root = rootRenderer();
    const map = mapRenderer();
    const initialMap = mapElement(root.render(props));
    const tree = map.render(initialMap);
    const firstNode = node(tree, 'first');
    const nodeComponent = firstNode.type as unknown as { type: (props: Element['props']) => Element };
    const button = nodeComponent.type(firstNode.props);
    const click = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    const select = () => button.props.onClick(click);
    const target = props.items[0].item;

    root.render({ ...props, onSelectItem: abandoned }, false);
    select();
    expect(first).toHaveBeenCalledExactlyOnceWith(target);
    expect(abandoned).not.toHaveBeenCalled();
    const committed = mapElement(root.render({ ...props, onSelectItem: latest }));
    expect(map.render(committed)).toBe(tree);
    select();
    expect(click.preventDefault).toHaveBeenCalledTimes(2);
    expect(click.stopPropagation).toHaveBeenCalledTimes(2);
    expect(latest).toHaveBeenCalledExactlyOnceWith(target);
    expect(abandoned).not.toHaveBeenCalled();
    expect(map.renders).toBe(1);
  });

  it('keeps all chrome actions live and preserves panel event isolation', () => {
    const root = rootRenderer();
    const props = fixture();
    root.render(props);
    const latest = fixture({ items: props.items });
    const tree = root.render(latest);
    const toggle = find(tree, element => element.props['data-canvas-navigator-toggle'] === 'true')!;
    toggle.props.onClick();
    expect(latest.onToggle).toHaveBeenCalledOnce();
    for (const [title, action] of [
      ['隐藏导航', 'onClose'], ['缩小', 'onZoomOut'], ['重置缩放', 'onResetZoom'],
      ['适配全部 / 选中', 'onFit'], ['放大', 'onZoomIn'], ['定位最近图片', 'onLocatePrimary'],
    ] as const) {
      const control = find(tree, element => element.props.title === title && !element.props['data-canvas-navigator-toggle'])!;
      control.props.onClick();
      expect(latest[action]).toHaveBeenCalledOnce();
      expect(props[action]).not.toHaveBeenCalled();
    }
    expect(props.onToggle).not.toHaveBeenCalled();
    const panel = find(tree, element => element.props['data-canvas-navigator-panel'] === 'true')!;
    expect(panel.props.ref).toBe(latest.panelRef);
    const stopPropagation = vi.fn();
    panel.props.onPointerDown({ stopPropagation });
    panel.props.onMouseDown({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalledTimes(2);
  });

  it('derives only the current data after a hidden period, including changed selectors', () => {
    const root = rootRenderer();
    const props = fixture({ visible: false });
    root.render(props);
    const getPreview = vi.fn((): CanvasNavigatorPreview => ({ source: 'latest.png', mediaType: 'image' }));
    const hidden = root.render({ ...props, getPreview, items: [entry('latest')] });
    expect(find(hidden, element => 'getPreview' in element.props)).toBeUndefined();
    expect(props.getPreview).not.toHaveBeenCalled();
    expect(getPreview).not.toHaveBeenCalled();
    const shown = mapElement(root.render({ ...props, visible: true, getPreview, items: [entry('latest')] }));
    expect(node(mapRenderer().render(shown), 'latest').props.source).toBe('latest.png');
    expect(getPreview).toHaveBeenCalledOnce();
    expect(props.getPreview).not.toHaveBeenCalled();
  });

  it('preserves single-pass bounds geometry, minimum node size, source and fallback labels (real SSR)', () => {
    const props = fixture({ selectedIds: new Set(['first']), zoomPercent: 42 });
    const html = renderToStaticMarkup(<CanvasNavigator {...props} />);
    const scale = 98 / 101;
    expect(html).toContain(`left:9px;top:9px;width:${100 * scale}px;height:${100 * scale}px`);
    expect(html).toContain(`left:${9 + 100 * scale}px;top:${9 + 100 * scale}px;width:10px;height:10px`);
    expect(html).toContain('src="thumb-first.png"');
    expect(html).toContain('alt="first"');
    expect(html).toContain('ring-2 ring-stone-400/35');
    expect(html).toContain('42%');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(props.getPreview).toHaveBeenCalledTimes(2);

    const video = entry('video');
    video.item.item = { ...video.item.item, type: 'video', name: undefined };
    const text = entry('text');
    text.item.item = { ...text.item.item, type: 'text', name: undefined };
    const workflow = entry('workflow');
    workflow.item.ai = { type: 'workflow', presetLabel: '示例工作流' };
    const fallback = renderToStaticMarkup(<CanvasNavigator {...fixture({
      items: [video, text, workflow], getThumbnailSource: () => '',
    })} />);
    expect(fallback).toContain('>视频</span>');
    expect(fallback).toContain('>文字</span>');
    expect(fallback).toContain('>示例工作流</span>');
  });

  it('reads each entry box once for bounds and once for preview data, not four bounds passes', () => {
    const props = fixture();
    const reads = props.items.map(() => vi.fn());
    props.items = props.items.map((value, index) => ({
      item: value.item,
      get box() {
        reads[index]();
        return value.box;
      },
    }));
    renderToStaticMarkup(<CanvasNavigator {...props} />);
    reads.forEach(read => expect(read).toHaveBeenCalledTimes(2));
  });

  it('keeps empty-state UI and skips preview calls for an empty map (real SSR)', () => {
    const props = fixture({ items: [] });
    const html = renderToStaticMarkup(<CanvasNavigator {...props} />);
    expect(html).toContain('暂无节点');
    expect(html).toContain('title="定位最近图片"');
    expect(props.getPreview).not.toHaveBeenCalled();
    expect(props.getThumbnailSource).not.toHaveBeenCalled();
  });
});
