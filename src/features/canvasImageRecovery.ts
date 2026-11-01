import { invoke } from '@tauri-apps/api/core';
import { DEFAULT_CANVAS_ID } from '../services/canvasApi';
import type { BufferItem } from '../types';
import { createCanvasAiOutputBufferItem, getCanvasAiOutputSize } from '../utils/canvasItemSelectors';
import { buildCanvasAiOutputRemoteResultPatch } from './canvasAiOutputs';
import type { CloudImageGenerationLookup } from './canvasAiImage';
import type { CanvasAiGeneratedOutput, CanvasAiItemData, CanvasImageItem } from './canvasModel';
export { canvasImageNeedsRecovery } from './canvasImageOutputPlan';
type RecoveryResponse = CloudImageGenerationLookup & { error?: { message?: string } | null };

type RecoveryOptions = {
  canvasId?: string;
  getLatestTarget?: () => CanvasImageItem | undefined;
  updateAi: (patch: Partial<CanvasAiItemData>) => void;
  showToast: (message: string) => void;
  refreshCloudAccount: (silent?: boolean) => Promise<unknown>;
  addGeneratedImagesToDrawer: (items: BufferItem[], options?: { canvasId?: string; canvasOutputClientRequestId?: string }) => void;
  cacheCanvasGeneratedImageSource: (source: string, name: string, options?: { throwOnFailure?: boolean }) => Promise<Partial<CanvasAiGeneratedOutput>>;
  requireLocalImageOutputs?: boolean;
};

/** Recovery accepts only the persisted request ID; no generation parameters. */
export async function recoverCanvasImageOutputs(target: CanvasImageItem, options: RecoveryOptions) {
  const ai = target.ai!;
  const clientRequestId = ai.imageClientRequestId || ai.outputs?.find(output => output.clientRequestId)?.clientRequestId;
  if (!clientRequestId) { options.showToast('原请求 ID 未保存，请在管理端按渠道任务 ID 核对'); return []; }
  const originalOutputs = ai.outputs || [];
  const isCurrentRequest = () => {
    if (!options.getLatestTarget) return true;
    const current = options.getLatestTarget();
    const currentRequestId = current?.ai?.imageClientRequestId
      || current?.ai?.outputs?.find(output => output.clientRequestId)?.clientRequestId;
    return current?.id === target.id && current.ai?.type === 'image-generator'
      && currentRequestId === clientRequestId;
  };
  options.updateAi({ status: 'working', error: undefined, imageClientRequestId: clientRequestId });
  try {
    const result = await invoke<RecoveryResponse>('recover_cloud_image_generation', { clientRequestId });
    if (!isCurrentRequest()) return [];
    if (['failed', 'refunded'].includes(result.status)) {
      const error = result.error?.message || '渠道已确认原任务失败，预扣积分已释放';
      options.updateAi({ status: 'error', error, outputs: originalOutputs.map(output => ({ ...output, status: 'error', error })) });
      options.showToast(error);
      void options.refreshCloudAccount(true);
      return [];
    }
    const sources = [...new Set((result.images || []).filter(Boolean))];
    if (result.status !== 'succeeded' || !sources.length) throw new Error('原任务结果仍待确认');
    const size = getCanvasAiOutputSize(ai.aspectRatio || '1:1');
    const outputs = await Promise.all(sources.map(async (source, index): Promise<CanvasAiGeneratedOutput> => {
      const cached = options.requireLocalImageOutputs
        ? await options.cacheCanvasGeneratedImageSource(source, `${clientRequestId}_${index + 1}`, { throwOnFailure: true })
        : buildCanvasAiOutputRemoteResultPatch(source);
      return {
        ...originalOutputs[index], ...cached, id: originalOutputs[index]?.id || `${target.id}_recovered_${index}`,
        assetType: 'image', mediaType: 'image', clientRequestId,
        name: originalOutputs[index]?.name || `图片 ${index + 1}`,
        status: 'success', error: undefined, generatedAt: Date.now(), width: size.width, height: size.height,
      };
    }));
    if (!isCurrentRequest()) return [];
    options.updateAi({ status: 'success', error: undefined, outputs, imageExpectedOutputCount: outputs.length, generatedAt: Date.now() });
    const items = outputs.flatMap((output, index) => {
      const item = createCanvasAiOutputBufferItem(target, output, index);
      return item ? [item] : [];
    });
    options.addGeneratedImagesToDrawer(items, { canvasId: options.canvasId || DEFAULT_CANVAS_ID, canvasOutputClientRequestId: clientRequestId });
    options.showToast(`原任务已恢复 ${outputs.length} 张图片`);
    void options.refreshCloudAccount(true);
    return outputs;
  } catch (error) {
    if (!isCurrentRequest()) return [];
    const message = error instanceof Error ? error.message : String(error);
    options.updateAi({ status: 'recovery', error: `${message}。原请求 ID：${clientRequestId}`, outputs: originalOutputs });
    options.showToast('原任务尚未恢复，已保留请求 ID；可稍后再次查询');
    return [];
  }
}
