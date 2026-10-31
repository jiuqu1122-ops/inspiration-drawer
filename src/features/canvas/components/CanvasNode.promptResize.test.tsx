import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CanvasNode } from './CanvasNode';
import { buildCanvasNodeViewModel } from '../canvasNodeViewModel';
import { createCanvasAiPromptEditSession } from '../canvasAiPromptResize';
import { getCanvasAiNodeAutoSize } from '../../canvasAiNodeLayout';
import type { CanvasImageItem } from '../../canvasModel';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: (path: string) => `asset://${path}` }));

function scenario(editing = true) {
  const design = getCanvasAiNodeAutoSize({ type: 'image-generator', imageRulePanelExpanded: false,
    showOutputPreview: true, aspectRatio: '4:3', outputCount: 1 });
  const target: CanvasImageItem = {
    id: 'generator', x: 25, y: 40, width: design.width * 0.75, height: design.height * 0.75,
    item: { id: 'asset', type: 'image', content: 'A design concept', createdAt: 1 },
    ai: { type: 'image-generator', provider: 'new-api', model: 'configured-image', status: 'idle',
      imagePolicy: { panelExpanded: false },
      outputs: [{ id: 'output', status: 'success', url: 'https://example.test/output.png', width: 1024, height: 768 }] },
  };
  const session = createCanvasAiPromptEditSession(target, design);
  const order: string[] = [];
  const scope = {
    canvasAgent: { settings: { apiProvider: 'unmind-wallet', apiCredentialSource: 'cloud_wallet' } },
    canvasAiCloudImageModels: { provider: 'new-api', models: ['configured-image'], catalog: [] },
    canvasAiCredentialSource: 'wallet', canvasAiProvider: 'new-api', canvasAiUnifiedImageModelOptions: [],
    canvasAiExpandedOutputNodeIds: new Set(), canvasAiPromptEditingId: editing ? target.id : null,
    canvasAiPromptEditorSessions: editing ? { [target.id]: session } : {},
    canvasItems: [target], canvasItemsRef: { current: [target] }, canvasItemsById: new Map([[target.id, target]]),
    canvasRenderScale: 0.5, canvasScaledNodeRadius: 14,
    canvasSelectedIdsSet: new Set([target.id]), canvasSelectedIdsRef: { current: [target.id] },
    canvasTextAgentRunningIds: [], cloudAccount: null,
    getCanvasAiNodeDesignSizeForItem: () => design,
    getCanvasAiResolvedModel: (_provider: string, saved?: string) => saved || 'configured-image',
    getCanvasAiUnifiedImageModelValue: () => 'configured-image',
    getCanvasImageInputBufferItemsForNode: () => [], getStableCanvasImageSource: () => '',
    canvasHoveredItemIdRef: { current: '' }, canvasReferenceSuppressClickRef: { current: null },
    canvasConnectionDraft: null, activeThreeSceneIdRef: { current: null }, threeSceneAnalyzingIds: [],
    canvasAiPromptTextAreaRefs: { current: {} },
    startCanvasAiPromptResize: vi.fn(), scheduleCanvasAiPromptDraftCommit: vi.fn(),
    commitCanvasAiPromptDraft: vi.fn(() => order.push('commit')),
    setCanvasAiPromptEditingId: vi.fn(() => order.push('editing-id')),
    resizeCanvasAiPromptEditor: vi.fn(() => order.push('resize')),
    updateCanvasSelection: vi.fn(),
  };
  const element = () => CanvasNode({ scope, canvasItem: target, canvasItemsRef: scope.canvasItemsRef });
  return { target, scope, session, design, element, order };
}

type Props = Record<string, any>;
function find(element: ReactElement, predicate: (props: Props, type: ReactElement['type']) => boolean): ReactElement<Props> | undefined {
  if (predicate(element.props as Props, element.type)) return element as ReactElement<Props>;
  for (const child of Children.toArray((element.props as { children?: ReactNode }).children)) {
    if (!isValidElement(child)) continue;
    const result = find(child, predicate);
    if (result) return result;
  }
  return undefined;
}

const prompt = (element: ReactElement) => find(element, props => props['data-canvas-node-prompt'] === 'true')!;
const handle = (element: ReactElement) => find(element, props => props['data-canvas-ai-prompt-resize'] === 'generator');

describe('editing-only node prompt UI', () => {
  it('renders an editing-only bottom-center handle that does not steal focus', () => {
    const h = scenario();
    const control = handle(h.element())!;
    expect(control).toBeDefined();
    expect(control.props['data-no-drag']).toBe('true');
    expect(control.props.tabIndex).toBe(-1);
    expect(control.props.className).toContain('left-1/2');
    expect(control.props.className).toContain('cursor-ns-resize');
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    control.props.onPointerDown(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(h.scope.startCanvasAiPromptResize).toHaveBeenCalledExactlyOnceWith(event, h.target.id);
    expect(h.scope.commitCanvasAiPromptDraft).not.toHaveBeenCalled();
    expect(h.scope.resizeCanvasAiPromptEditor).not.toHaveBeenCalled();
    expect(handle(scenario(false).element())).toBeUndefined();
  });

  it('does not finish editing when a WebView transfers focus to its own handle', () => {
    const h = scenario();
    const focus = vi.fn();
    prompt(h.element()).props.onBlur({
      relatedTarget: { closest: () => ({ getAttribute: () => h.target.id }) },
      currentTarget: { value: '组合输入尚未结束', focus },
    });
    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
    expect(h.scope.commitCanvasAiPromptDraft).not.toHaveBeenCalled();
    expect(h.scope.setCanvasAiPromptEditingId).not.toHaveBeenCalled();
    expect(h.scope.resizeCanvasAiPromptEditor).not.toHaveBeenCalled();
  });

  it.each([null, { closest: () => null }, { closest: () => ({ getAttribute: () => 'another-node' }) }])(
    'commits the exact DOM value before collapsing on a real blur', relatedTarget => {
      const h = scenario();
      const value = '长文本与最终中文输入 👩‍🎨\n'.repeat(3_000);
      const focus = vi.fn();
      prompt(h.element()).props.onBlur({ relatedTarget, currentTarget: { value, focus } });
      expect(h.scope.commitCanvasAiPromptDraft).toHaveBeenCalledExactlyOnceWith(h.target.id, value, true);
      expect(h.scope.resizeCanvasAiPromptEditor).toHaveBeenCalledExactlyOnceWith(h.target.id, false, true);
      expect(h.order).toEqual(['commit', 'editing-id', 'resize']);
      expect(focus).not.toHaveBeenCalled();
    },
  );

  it('leaves the textarea uncontrolled, preserving long text and composition during resize renders', () => {
    const h = scenario();
    const before = prompt(h.element());
    const value = '正在组合输入的长文本 👨‍👩‍👧‍👦'.repeat(2_000);
    before.props.onChange({ currentTarget: { value } });
    expect(h.scope.scheduleCanvasAiPromptDraftCommit).toHaveBeenCalledExactlyOnceWith(h.target.id, value);
    h.scope.canvasAiPromptEditorSessions[h.target.id] = { ...h.session, promptHeight: 1_200 };
    const after = prompt(h.element());
    expect(after.props.value).toBeUndefined();
    expect(after.key).toBe(before.key);
    expect(after.type).toBe('textarea');
    expect(after.props.defaultValue).toBe(before.props.defaultValue);
    expect(h.scope.commitCanvasAiPromptDraft).not.toHaveBeenCalled();
  });

  it('uses matching outer/inner/prompt heights without changing font, width, or preview geometry', () => {
    const h = scenario();
    const before = buildCanvasNodeViewModel(h.scope, h.target);
    const beforeElement = h.element();
    const promptClass = prompt(beforeElement).props.className;
    const originalWidth = beforeElement.props.style.width;
    const originalOuterHeight = beforeElement.props.style.height;
    h.scope.canvasAiPromptEditorSessions[h.target.id] = { ...h.session, promptHeight: h.session.promptHeight + 700 };
    const after = buildCanvasNodeViewModel(h.scope, h.target);
    const afterElement = h.element();
    expect(afterElement.props.style.width).toBe(originalWidth);
    expect(afterElement.props.style.height - originalOuterHeight).toBe(700 * 0.75);
    expect(after.canvasAiNodeDesignSize!.height - before.canvasAiNodeDesignSize!.height).toBe(700);
    expect(after.canvasAiPromptHeight - before.canvasAiPromptHeight).toBe(700);
    expect(after.canvasAiNodeScale).toBe(before.canvasAiNodeScale);
    expect(before.canvasAiOutputTileLayout).not.toBeNull();
    expect(after.canvasAiOutputTileLayout).toEqual(before.canvasAiOutputTileLayout);
    expect(prompt(afterElement).props.className).toBe(promptClass);
    expect(prompt(afterElement).props.style).toEqual(prompt(beforeElement).props.style);
  });
});
