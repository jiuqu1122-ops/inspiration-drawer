import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CanvasNode } from './CanvasNode';
import { buildCanvasNodeViewModel } from '../canvasNodeViewModel';
import type { CanvasImageItem } from '../../canvasModel';
import type { AiModelCapabilities } from '../../../types/license';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: (path: string) => `asset://${path}` }));

function scenario(capabilities: AiModelCapabilities = {}, options: { route?: AiModelCapabilities; local?: boolean; history?: boolean; model?: string } = {}) {
  const model = options.model || 'configured-image';
  const target: CanvasImageItem = { id: 'generator', x: 0, y: 0, width: 600, height: 500,
    item: { id: 'generator-asset', type: 'image', content: 'A landscape', createdAt: 1 },
    ai: { type: 'image-generator', provider: 'new-api', credentialSource: options.local ? 'local' : 'wallet', model,
      count: 1, aspectRatio: '1:1', resolution: '1k', outputFormat: 'jpg', status: 'idle',
      providerCandidates: [{ source: options.local ? 'local' : 'wallet', provider: 'new-api', model,
        canonicalModelId: model, providerChannelId: 'channel', modelCapabilities: options.route }] } };
  const image: CanvasImageItem = { id: 'reference', x: 700, y: 0, width: 100, height: 100,
    item: { id: 'reference-asset', type: 'image', content: '', name: 'Existing image', url: 'https://images.example.test/reference.png', thumbnail: 'https://images.example.test/reference.png', createdAt: 1 } };
  const text: CanvasImageItem = { id: 'text-input', x: 700, y: 200, width: 100, height: 100,
    item: { id: 'text-asset', type: 'text', content: 'Existing text input', createdAt: 1 } };
  if (options.history) target.inputs = [image.id, text.id];
  const items = [target, image, text];
  const scope = {
    canvasAgent: { settings: { apiProvider: 'unmind-wallet', apiCredentialSource: 'cloud_wallet' } },
    canvasAiCloudImageModels: { provider: 'new-api', models: [model],
      catalog: [{ id: model, displayName: 'Configured image', modality: 'image', capabilities }] },
    canvasAiCredentialSource: 'wallet', canvasAiProvider: 'new-api', canvasAiUnifiedImageModelOptions: [],
    canvasAiExpandedOutputNodeIds: new Set(), canvasAiPromptEditingId: null,
    canvasItems: items, canvasItemsRef: { current: items }, canvasItemsById: new Map(items.map(item => [item.id, item])), canvasRenderScale: 1,
    canvasSelectedIdsSet: new Set(), canvasSelectedIdsRef: { current: [] }, canvasTextAgentRunningIds: [], cloudAccount: null,
    getCanvasAiNodeDesignSizeForItem: () => ({ width: 600, height: 500 }),
    getCanvasAiResolvedModel: (_provider: string, saved?: string) => saved || model,
    getCanvasAiUnifiedImageModelValue: () => model, getCanvasImageInputBufferItemsForNode: () => [], getStableCanvasImageSource: () => '',
    canvasHoveredItemIdRef: { current: '' }, canvasReferenceSuppressClickRef: { current: null },
    canvasConnectionDraft: null as { sourceId: string } | null,
    activeThreeSceneIdRef: { current: null }, threeSceneAnalyzingIds: [],
    openCanvasReferenceAddMenu: vi.fn(), openCanvasReferenceReplaceMenu: vi.fn(), startCanvasReferenceLongPress: vi.fn(), disconnectCanvasInput: vi.fn(),
  };
  const element = () => CanvasNode({ scope, canvasItem: target, canvasItemsRef: scope.canvasItemsRef });
  return { target, scope, element, html: () => renderToStaticMarkup(element()) };
}

function findButton(element: ReactElement, label: string): ReactElement<Record<string, any>> | undefined {
  if (element.type === 'button' && (element.props as Record<string, unknown>)['aria-label'] === label) return element as ReactElement<Record<string, any>>;
  for (const child of Children.toArray((element.props as { children?: ReactNode }).children)) {
    if (!isValidElement(child)) continue;
    const found = findButton(child, label);
    if (found) return found;
  }
  return undefined;
}

describe('image reference capability controls', () => {
  it.each([
    { supportsReferenceImages: false, maxReferenceImages: 5 },
    { supportsReferenceImages: true, maxReferenceImages: 0 },
    { maxReferenceImages: 0 },
  ])('hides the add reference entry when the published model disables references: %j', capabilities => {
    const state = scenario(capabilities);
    expect(buildCanvasNodeViewModel(state.scope, state.target).showCanvasAiAttachmentControl).toBe(false);
    const html = state.html();
    expect(html).not.toContain('aria-label="添加参考图"');
    expect(html).not.toContain('title="添加或管理参考图"');
  });

  it('honors a route-level false when canonical reference support is unspecified', () => {
    const state = scenario({}, { route: { supportsReferenceImages: false, maxReferenceImages: 5 } });
    expect(state.html()).not.toContain('aria-label="添加参考图"');
  });

  it('keeps the canonical promise ahead of stale route reference settings', () => {
    const state = scenario({ supportsReferenceImages: true, maxReferenceImages: 5 }, { route: { supportsReferenceImages: false, maxReferenceImages: 0 } });
    expect(state.html()).toContain('aria-label="添加参考图"');
  });

  it.each(['configured-image', 'midjourney-v7'])('restores the normal add entry when %s explicitly allows five references', model => {
    const state = scenario({ supportsReferenceImages: true, maxReferenceImages: 5 }, { model });
    expect(state.html()).toContain('aria-label="添加参考图"');
    const add = findButton(state.element(), '添加参考图');
    expect(add).toBeDefined();
    add!.props.onClick({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
    expect(state.scope.openCanvasReferenceAddMenu).toHaveBeenCalledExactlyOnceWith('generator');
  });

  it('keeps the legacy default and local provider controls', () => {
    expect(scenario().html()).toContain('aria-label="添加参考图"');
    expect(scenario({ supportsReferenceImages: false, maxReferenceImages: 0 }, { local: true }).html()).toContain('aria-label="添加参考图"');
  });

  it('restores the entry on the same node when the refreshed catalog enables five references', () => {
    const state = scenario({ supportsReferenceImages: false, maxReferenceImages: 0 }, { model: 'midjourney-v7' });
    expect(state.html()).not.toContain('aria-label="添加参考图"');
    state.scope.canvasAiCloudImageModels.catalog[0].capabilities = { supportsReferenceImages: true, maxReferenceImages: 5 };
    expect(state.html()).toContain('aria-label="添加参考图"');
  });

  it('does not expose fusion slot add or replace controls for a disabled model', () => {
    const state = scenario({ supportsReferenceImages: false, maxReferenceImages: 5 }, { history: true });
    state.target.ai!.imageFusion = { enabled: true, baseNodeId: 'reference' };
    const html = state.html();
    expect(html).not.toContain('data-canvas-fusion-slot');
    expect(html).not.toContain('aria-label="添加参考图"');
    expect(html).toContain('aria-label="移除参考图 1"');
  });

  it('preserves historical inputs and removal without retaining add, replace or long-press entry points', () => {
    const state = scenario({ supportsReferenceImages: false, maxReferenceImages: 5 }, { history: true });
    state.scope.canvasConnectionDraft = { sourceId: 'text-input' };
    const html = state.html();
    expect(html).toContain('reference.png');
    expect(html).toContain('data-canvas-ai-input-id="generator"');
    expect(html).toContain('aria-label="管理输入 2"');
    expect(html).toContain('aria-label="移除参考图 1"');
    expect(html).not.toContain('aria-label="添加参考图"');
    expect(html).not.toContain('aria-label="替换参考图');
    expect(html).not.toContain('data-canvas-reference-target-id');
    const preview = findButton(state.element(), '已连接参考图 1')!;
    expect(preview.props.disabled).toBe(true);
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    preview.props.onClick(event);
    preview.props.onPointerDown(event);
    expect(state.scope.openCanvasReferenceAddMenu).not.toHaveBeenCalled();
    expect(state.scope.openCanvasReferenceReplaceMenu).not.toHaveBeenCalled();
    expect(state.scope.startCanvasReferenceLongPress).not.toHaveBeenCalled();
    findButton(state.element(), '移除参考图 1')!.props.onClick(event);
    expect(state.scope.disconnectCanvasInput).toHaveBeenCalledExactlyOnceWith('generator', 'reference');
    expect(state.target.inputs).toEqual(['reference', 'text-input']);
  });
});
