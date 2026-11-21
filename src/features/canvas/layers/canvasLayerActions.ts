import type { CanvasImageItem } from '../../canvasModel';
import { getCanvasAiOutputDisplaySource, getCanvasAiSuccessfulOutputs, getCanvasOriginalImageSource } from '../../../utils/canvasItemSelectors';
import { cacheLayerComposite, cacheLayerResult, layerAssetUrl, normalizeLayerInput } from './canvasLayerAssets';
import { prepareLayerRequestImage } from './canvasLayerApi';
import { followLayerJob } from './canvasLayerJobs';
import type { CanvasLayerGroup, CanvasLayerOperation, LayerMode, LayerReceipt } from './canvasLayerTypes';

export function canvasLayerInputSource(item?: CanvasImageItem) {
  if (!item) return '';
  if (item.item.type === 'image') {
    return item.layerResult?.status === 'processing' ? '' : getCanvasOriginalImageSource(item.item);
  }
  const output = getCanvasAiSuccessfulOutputs(item).find(result => (result.mediaType ?? 'image') === 'image' && result.assetType !== 'audio');
  return getCanvasAiOutputDisplaySource(output) || '';
}

export function layerSourceKey(source: string) {
  if (!source.startsWith('data:')) return source;
  // A selection needs an identity, not a second copy of the source bytes.
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return `inline:${source.length}:${hash >>> 0}`;
}

export type CanvasLayerContext = {
  canvasId: () => string;
  getItems: () => CanvasImageItem[];
  append: (items: CanvasImageItem[], label: string, select?: boolean) => number;
  update: (canvasId: string, nodeId: string, change: (item: CanvasImageItem) => CanvasImageItem) => unknown;
  read: (source: string, optimize?: boolean) => Promise<string>;
  cacheImage: (source: string, name: string) => Promise<string>;
  undo: (label: string) => void;
  toast: (message: string) => void;
};

export function makeLayerOperationNode(position: { x: number; y: number }, inputs: string[] = [], mode: LayerMode = 'split'): CanvasImageItem {
  const id = crypto.randomUUID();
  return { id, ...position, width: 290, height: 300, inputs: inputs.slice(0, 1), textMode: 'plain',
    item: { id, type: 'text', name: '图层拆分 / 交互编辑', content: '', createdAt: Date.now() },
    layerOperation: { mode } };
}

export function patchLayerOperation(ctx: CanvasLayerContext, nodeId: string, patch: Partial<CanvasLayerOperation>) {
  ctx.update(ctx.canvasId(), nodeId, item => item.layerOperation ? { ...item, layerOperation: { ...item.layerOperation, ...patch } } : item);
}

export function startCanvasLayerRun(ctx: CanvasLayerContext, nodeId: string, mode: LayerMode, expectedCredits: string, referenceUpload = false) {
  const canvasId = ctx.canvasId();
  const items = ctx.getItems();
  const node = items.find(item => item.id === nodeId);
  const operation = node?.layerOperation;
  if (!node || !operation) return;
  if (items.some(item => item.inputs?.includes(nodeId) && item.layerResult?.mode === mode && item.layerResult.status === 'processing')) return;
  const source = items.find(item => item.id === node.inputs?.[0]);
  const src = canvasLayerInputSource(source);
  const prompt = operation.prompts?.[mode]?.trim() ?? '';
  if (!src || !source || mode === 'edit' && !prompt) {
    ctx.toast('请接入图片，交互编辑时填写修改要求');
    return;
  }
  const offset = items.reduce((y, item) => item.inputs?.includes(nodeId) && item.layerResult
    ? Math.max(y, item.y + item.height + 92) : y, node.y);
  const selection = operation.selection?.sourceId === source.id && operation.selection.source === layerSourceKey(src) ? operation.selection.value : undefined;
  const id = crypto.randomUUID();
  const requestId = 'canvas-layer-' + id;
  const result: CanvasImageItem = {
    id, x: node.x + node.width + 75, y: offset, width: 300, height: 260, inputs: [node.id],
    item: { id, type: 'image', name: mode === 'split' ? '图层组' : '交互编辑结果', content: '', createdAt: Date.now() },
    layerResult: { requestId, mode, status: 'processing', sourceLayer: mode === 'edit' ? source.layerLink : undefined },
  };
  if (!ctx.append([result], '运行' + result.item.name, false)) return;
  patchLayerOperation(ctx, nodeId, { outputs: { ...operation.outputs, [mode]: id } });
  observeCanvasLayerRun(ctx, canvasId, result, async () => {
    const image = await normalizeLayerInput(await ctx.read(src, false));
    return {
      operation: mode, clientRequestId: requestId, prompt, expectedCredits,
      image: await prepareLayerRequestImage(image, referenceUpload),
      ...(mode === 'edit' && selection ? { selection } : {}),
    };
  });
}

export function observeCanvasLayerRun(ctx: CanvasLayerContext, canvasId: string, node: CanvasImageItem, create?: Parameters<typeof followLayerJob>[1]) {
  if (!node.layerResult || node.layerResult.status !== 'processing') return;
  const { requestId, mode } = node.layerResult;
  const patch = (change: (item: CanvasImageItem) => CanvasImageItem) => ctx.update(canvasId, node.id,
    item => item.layerResult?.requestId === requestId && item.layerResult.status === 'processing' ? change(item) : item);
  const complete = async (receipt: LayerReceipt) => {
    if (receipt.status === 'processing') return;
    if (receipt.status === 'failed') {
      patch(item => ({ ...item, layerResult: { ...item.layerResult!, status: 'failed', message: receipt.message } }));
      return;
    }
    if (receipt.result.operation !== mode) throw new Error('结果操作类型不一致');
    const replacement = await cacheLayerResult(receipt.result, requestId, ctx.cacheImage);
    const group = replacement.group;
    const asset = replacement.asset;
    if (!group && !asset) throw new Error('图层结果缺少素材');
    const media = group ? await cacheLayerComposite(group, requestId) : { path: asset!.path, url: layerAssetUrl(asset!.path) };
    const { width, height } = group ?? asset!;
    patch(item => ({ ...item, height: item.width * height / width,
      item: { ...item.item, ...media },
      layerResult: { ...item.layerResult!, ...replacement, status: 'success', message: undefined, chargedCredits: receipt.chargedCredits } }));
  };
  void followLayerJob(requestId, create, complete, notice => patch(item => ({ ...item, layerResult: { ...item.layerResult!, message: notice } })));
}

export async function updateCanvasLayerGroup(ctx: CanvasLayerContext, nodeId: string,
  edit: (group: CanvasLayerGroup) => CanvasLayerGroup, label: string) {
  const canvasId = ctx.canvasId();
  const group = ctx.getItems().find(item => item.id === nodeId)?.layerResult?.group;
  if (!group) return false;
  const next = edit(group);
  if (next === group) return false;
  const media = await cacheLayerComposite(next, 'layers-' + nodeId);
  if (ctx.canvasId() !== canvasId || ctx.getItems().find(item => item.id === nodeId)?.layerResult?.group !== group) return false;
  ctx.undo(label);
  ctx.update(canvasId, nodeId, item => ({ ...item, item: { ...item.item, ...media }, layerResult: { ...item.layerResult!, group: next } }));
  return true;
}

export function canvasLayerReplacement(ctx: CanvasLayerContext, result: CanvasImageItem) {
  const { sourceLayer: source, asset } = result.layerResult ?? {};
  if (!source || !asset) return Promise.resolve(false);
  return updateCanvasLayerGroup(ctx, source.groupId, group => {
    const original = group.layers.find(layer => layer.id === source.layerId && layer.path === source.path);
    if (!original || asset.width !== original.width || asset.height !== original.height
      || !asset.alpha || original.transparent && !asset.transparent) return group;
    return { ...group, layers: group.layers.map(layer => layer === original ? { ...original, ...asset } : layer) };
  }, '替换原图层');
}

export function appendCanvasLayerReference(ctx: CanvasLayerContext, nodeId: string, layerId: string, edit: boolean) {
  const node = ctx.getItems().find(item => item.id === nodeId);
  const layer = node?.layerResult?.group?.layers.find(entry => entry.id === layerId);
  if (!node || !layer) return;
  const id = crypto.randomUUID();
  const width = 190;
  const height = Math.max(50, width * layer.height / layer.width);
  const reference = { id, x: node.x + node.width + 65, y: node.y, width, height,
    layerLink: { groupId: node.id, layerId: layer.id, path: layer.path },
    item: { id, type: 'image' as const, name: layer.name, path: layer.path, url: layerAssetUrl(layer.path), content: '', createdAt: Date.now() } };
  ctx.append(edit ? [reference, makeLayerOperationNode({ x: reference.x + width + 65, y: node.y }, [id], 'edit')] : [reference],
    edit ? '将图层接到交互编辑' : '引用单个图层');
}
