import type { CloudImageModelsResult } from '../types/license';
import type { CanvasAiCredentialSource, CanvasImageItem } from './canvasModel';
import { findAiCatalogModel, getAiCatalogModels, getChannelModelCapabilities, resolveImageModelCapabilities } from './aiModelCapabilities';
import { canUseCanvasItemAsImageEnhancementInput, isCanvasWorkflowReferenceBridge } from '../utils/canvasItemSelectors';

export type CanvasImageReferencePolicyContext = {
  canvasAiCloudImageModels?: CloudImageModelsResult | null;
  canvasAiCredentialSource?: CanvasAiCredentialSource;
};

export const CANVAS_IMAGE_REFERENCE_DISABLED_MESSAGE = '当前模型不支持参考图，请先断开已连接的图片输入后再生成';

/** Published wallet capabilities override reference support saved in an old node. */
export const getCanvasImageReferenceCapabilities = (target: CanvasImageItem | null | undefined, ctx: CanvasImageReferencePolicyContext) => {
  if (target?.ai?.type !== 'image-generator' || target.ai.credentialSource === 'local' || ctx.canvasAiCredentialSource !== 'wallet') return null;
  const ai = target.ai;
  const candidates = (ai.providerCandidates || []).filter(candidate => candidate.source === 'wallet');
  const selected = candidates.find(candidate => candidate.provider === ai.provider && candidate.providerChannelId === ai.providerChannelId)
    || candidates.find(candidate => candidate.provider === ai.provider)
    || candidates[0];
  const catalog = getAiCatalogModels(ctx.canvasAiCloudImageModels, 'image');
  const model = findAiCatalogModel(catalog, ai.model)
    || findAiCatalogModel(catalog, selected?.canonicalModelId)
    || findAiCatalogModel(catalog, selected?.model);
  const channel = ctx.canvasAiCloudImageModels?.channels?.find(value => value.id === (ai.providerChannelId || selected?.providerChannelId));
  return resolveImageModelCapabilities({
    canonical: model?.capabilities,
    route: getChannelModelCapabilities(channel, selected?.model, model?.id, ai.model) || selected?.modelCapabilities,
    legacy: { supportsReferenceImages: true, maxReferenceImages: 8 },
  });
};

export const canvasImageReferencesDisabled = (target: CanvasImageItem | null | undefined, ctx: CanvasImageReferencePolicyContext) => {
  const capabilities = getCanvasImageReferenceCapabilities(target, ctx);
  return !!capabilities && (!capabilities.supportsReferenceImages || capabilities.referenceImageLimit === 0);
};

/** Include bridges and image generators whose media may only become available later. */
export const isCanvasImageReferenceSource = (source: CanvasImageItem | undefined, items: readonly CanvasImageItem[], visited = new Set<string>()): boolean => {
  if (!source || visited.has(source.id)) return false;
  visited.add(source.id);
  if (isCanvasWorkflowReferenceBridge(source) || source.ai?.type === 'image-generator' || canUseCanvasItemAsImageEnhancementInput(source)) return true;
  return !source.ai && (source.inputs || []).some(id => isCanvasImageReferenceSource(items.find(item => item.id === id), items, visited));
};

export const hasCanvasImageReferenceInputs = (target: CanvasImageItem, items: readonly CanvasImageItem[]) => (
  (target.inputs || []).some(id => isCanvasImageReferenceSource(items.find(item => item.id === id), items, new Set([target.id])))
);
