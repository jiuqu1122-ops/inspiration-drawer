import { invoke } from '@tauri-apps/api/core';
import { getLayerCatalog, prepareLayerRequestImage } from '../../canvas/layers/canvasLayerApi';
import { cacheLayerResult, normalizeLayerInput } from '../../canvas/layers/canvasLayerAssets';
import { buildLayerPsd } from '../../canvas/layers/canvasLayerExport';
import { followLayerJob } from '../../canvas/layers/canvasLayerJobs';
import type { LayerOffer, LayerReceipt } from '../../canvas/layers/canvasLayerTypes';
import { getGeneratedMediaFromToolCall, type ChatGeneratedFile, type ChatToolExecutionContext } from '../model/chatTypes';

export type LayeredPsdProposal = {
  sourceId: string;
  sourceName: string;
  prompt: string;
  fileName: string;
  requestId: string;
  offer: LayerOffer;
  referenceUpload: boolean;
};

type Source = { id: string; name: string; path: string };
function selectSource(context: ChatToolExecutionContext, sourceId?: string): Source {
  const messages = context.recentMessages.filter(message => message.conversationId === context.conversationId);
  const groups = [...messages].reverse().map(message => {
    const attachments = message.attachments.filter(item => item.type === 'image' && item.path).map(item => ({
      id: item.id, path: item.path, name: sourceName(item.path),
    }));
    const generated = message.toolCalls.filter(call => call.status === 'completed').flatMap(call =>
      getGeneratedMediaFromToolCall(call).filter(item => item.type === 'image').map(item => ({
        id: item.id, path: item.path || item.url!, name: item.name || '对话生成图片',
      })));
    return [...attachments, ...generated];
  }).filter(group => group.length);
  const candidates = sourceId ? groups.flat().filter(item => item.id === sourceId) : groups[0] || [];
  if (candidates.length === 1) return candidates[0];
  throw new Error(candidates.length ? '有多张源图，请指定要拆分哪一张。' : '请在当前对话附上或指定要制作成 PSD 的源图。');
}

function sourceName(path: string) {
  if (path.startsWith('data:')) return '对话附件';
  return path.split('?')[0].split(/[\\/]/).pop() || '对话附件';
}

export async function proposeLayeredPsd(args: Record<string, unknown>, context: ChatToolExecutionContext): Promise<LayeredPsdProposal> {
  const source = selectSource(context, typeof args.sourceId === 'string' ? args.sourceId.trim() : undefined);
  const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : '';
  if (!prompt) throw new Error('请根据用户要求填写分层提示词。');
  if (prompt.length > 4000) throw new Error('分层要求最多 4000 字，请精简后再提交。');
  const catalog = await getLayerCatalog();
  const offer = catalog.split[0];
  if (!offer) throw new Error('当前账号暂无可用的图层拆分服务。');
  const requestedName = typeof args.fileName === 'string' && args.fileName.trim() || source.name.replace(/\.[^.]+$/, '');
  const stem = requestedName.split(/[\\/]/).pop()?.replace(/\.psd$/i, '').trim() || '图层组';
  return {
    sourceId: source.id, sourceName: source.name, prompt,
    fileName: Array.from(stem).slice(0, 90).join('') + '.psd',
    requestId: 'canvas-layer-' + crypto.randomUUID(), offer, referenceUpload: !!catalog.referenceUpload,
  };
}

export type PsdImageAccess = {
  read: (source: string) => Promise<string>;
  cacheImage: (source: string, name: string) => Promise<string>;
};

export async function executeLayeredPsd(context: ChatToolExecutionContext, images: PsdImageAccess) {
  const plan = context.approvedLayeredPsd;
  if (!plan) throw new Error('请先确认图层拆分方案。');
  const source = selectSource(context, plan.sourceId);
  const { requestId, offer } = plan;
  let receipt: LayerReceipt | undefined;
  let notice = '';
  await context.onProgress?.({ requestId, message: '正在拆分图层' });
  await followLayerJob(requestId, async () => ({
    operation: 'split', clientRequestId: requestId, prompt: plan.prompt, expectedCredits: offer.creditsPerRequest,
    expectedCreditsPerOutputImage: offer.creditsPerOutputImage,
    image: await prepareLayerRequestImage(await normalizeLayerInput(await images.read(source.path)), plan.referenceUpload),
  }), async value => { receipt = value; }, value => { notice = value; });
  if (receipt?.status !== 'success') {
    throw new Error((receipt?.status === 'failed' ? receipt.message : notice || '尚未收到图层结果') + '（' + requestId + '）');
  }
  if (receipt.result.operation !== 'split') throw new Error('返回结果缺少拆分图层');
  await context.onProgress?.({ requestId, message: '图层已返回，正在保存 PSD', chargedCredits: receipt.chargedCredits });
  try {
    const { group } = await cacheLayerResult(receipt.result, requestId, images.cacheImage);
    if (!group) throw new Error('缺少图层数据');
    const bytes = await buildLayerPsd(group);
    const { files } = await invoke<{ files: ChatGeneratedFile[] }>('chat_save_layered_psd', bytes, {
      headers: { 'x-chat-output': new URLSearchParams({ conversation: context.conversationId, name: plan.fileName }).toString() },
    });
    if (!files?.[0]?.path) throw new Error('本地文件未保存');
    return { requestId, files, layerCount: 1 + group.layers.length, chargedCredits: receipt.chargedCredits };
  } catch (error) {
    throw new Error(`图层拆分已完成，实扣 ${Number(receipt.chargedCredits)} 积分。PSD 保存失败（${requestId}）：${String(error)}`);
  }
}
