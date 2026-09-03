import type { ChatAttachment, ChatGeneratedMedia } from '../model/chatTypes';

export const BATCH_IMAGE_CONCURRENCY = 6;
export const BATCH_IMAGE_MAX_CONCURRENCY = 6;

export type BatchImageOperationArgs = {
  instruction: string;
  analysisSummary?: string;
  perImageInstructions?: Array<{ imageIndex: number; instruction: string }> | null;
  mode: 'one_per_image';
  attachmentIds?: string[] | null;
  outputCountPerImage?: number | null;
  model?: string | null;
  aspectRatio?: string | null;
  resolution?: string | null;
};

export type BatchImageOperationItemResult = {
  attachmentId: string;
  status: 'completed' | 'error' | 'cancelled';
  media?: ChatGeneratedMedia[];
  error?: string;
};

export type BatchImageOperationPhase = 'preparing' | 'generating' | 'completed' | 'cancelled';

export type BatchImageOperationResult = {
  ok: boolean;
  operation: 'batch_image_operation';
  phase: BatchImageOperationPhase;
  instruction: string;
  total: number;
  started: number;
  active: number;
  completed: number;
  succeeded: number;
  failed: number;
  cancelled: boolean;
  results: BatchImageOperationItemResult[];
};

const cleanMedia = (
  value: unknown,
  fallbackPrompt: string,
  fallbackIdPrefix: string,
): ChatGeneratedMedia[] => {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const media = Array.isArray(record.media) ? record.media : Array.isArray(record.outputs) ? record.outputs : [];
  return media.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    const path = String(item.path || '').trim() || undefined;
    const url = String(item.url || item.sourceUrl || '').trim() || undefined;
    if (!path && !url) return [];
    return [{
      id: String(item.id || `${fallbackIdPrefix}-output-${index}`),
      type: String(item.type || item.mediaType || 'image') === 'video' ? 'video' : 'image',
      path,
      url,
      thumbnail: String(item.thumbnail || '').trim() || undefined,
      assetId: String(item.assetId || item.drawerItemId || '').trim() || undefined,
      prompt: String(item.prompt || record.prompt || fallbackPrompt).trim() || undefined,
      name: String(item.name || '').trim() || undefined,
    } satisfies ChatGeneratedMedia];
  });
};

const normalizeAttachmentIds = (value: unknown) => Array.isArray(value)
  ? [...new Set(value.map(String).map(id => id.trim()).filter(Boolean))]
  : [];

const normalizePerImageInstructions = (value: unknown) => {
  if (!Array.isArray(value)) return new Map<number, string>();
  return new Map(value.flatMap(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const imageIndex = Math.round(Number(record.imageIndex));
    const instruction = String(record.instruction || '').trim();
    return imageIndex >= 1 && instruction ? [[imageIndex, instruction] as const] : [];
  }));
};

export const selectBatchImageAttachments = (
  attachments: ChatAttachment[],
  attachmentIds?: string[] | null,
) => {
  const images = attachments.filter(attachment => attachment.type === 'image' && attachment.path.trim());
  const selectedIds = normalizeAttachmentIds(attachmentIds);
  if (selectedIds.length === 0) return images;
  const byId = new Map(images.map(attachment => [attachment.id, attachment]));
  return selectedIds.flatMap(id => byId.has(id) ? [byId.get(id)!] : []);
};

const buildResult = (
  instruction: string,
  total: number,
  values: Array<BatchImageOperationItemResult | undefined>,
  phase: BatchImageOperationPhase,
  started: number,
  active: number,
  cancelled: boolean,
): BatchImageOperationResult => {
  const results = values.filter((value): value is BatchImageOperationItemResult => Boolean(value));
  const succeeded = results.filter(result => result.status === 'completed').length;
  const failed = results.filter(result => result.status === 'error').length;
  return {
    ok: succeeded > 0 && !cancelled,
    operation: 'batch_image_operation',
    phase,
    instruction,
    total,
    started,
    active,
    completed: results.filter(result => result.status !== 'cancelled').length,
    succeeded,
    failed,
    cancelled,
    results,
  };
};

export const executeBatchImageOperation = async (input: {
  args: Record<string, unknown>;
  attachments: ChatAttachment[];
  generate: (args: Record<string, unknown>, attachment: ChatAttachment) => Promise<unknown>;
  signal?: AbortSignal;
  concurrency?: number;
  onProgress?: (progress: BatchImageOperationResult) => void | Promise<void>;
}) => {
  const instruction = String(input.args.instruction || '').trim();
  if (!instruction) throw new Error('批量图片任务 instruction 不能为空');
  const mode = String(input.args.mode || 'one_per_image');
  if (mode !== 'one_per_image') throw new Error('batch_image_operation 仅支持 one_per_image 模式');
  const attachments = selectBatchImageAttachments(
    input.attachments,
    normalizeAttachmentIds(input.args.attachmentIds),
  );
  if (attachments.length === 0) throw new Error('当前消息中没有可批量处理的图片附件');

  const outputCount = Math.min(4, Math.max(1, Math.round(Number(input.args.outputCountPerImage) || 1)));
  const perImageInstructions = normalizePerImageInstructions(input.args.perImageInstructions);
  const concurrency = Math.min(
    attachments.length,
    Math.max(1, Math.min(
      BATCH_IMAGE_MAX_CONCURRENCY,
      Math.round(input.concurrency || BATCH_IMAGE_CONCURRENCY),
    )),
  );
  const results: Array<BatchImageOperationItemResult | undefined> = new Array(attachments.length);
  let cursor = 0;
  let started = 0;
  let active = 0;

  await input.onProgress?.(buildResult(
    instruction,
    attachments.length,
    results,
    'preparing',
    started,
    active,
    false,
  ));
  const worker = async () => {
    while (!input.signal?.aborted) {
      const index = cursor;
      cursor += 1;
      if (index >= attachments.length) return;
      const attachment = attachments[index];
      started += 1;
      active += 1;
      await input.onProgress?.(buildResult(
        instruction,
        attachments.length,
        results,
        'generating',
        started,
        active,
        false,
      ));
      try {
        const perImageInstruction = perImageInstructions.get(index + 1);
        const itemInstruction = perImageInstruction
          ? [
            instruction,
            `当前只处理图片 ${index + 1}。这张图片的专属要求：${perImageInstruction}`,
            '只执行当前图片的专属要求，不要套用其他编号图片的标题、文案、构图或局部处理。',
          ].join('\n\n')
          : instruction;
        const generated = await input.generate({
          prompt: itemInstruction,
          referenceImages: [attachment.path],
          count: outputCount,
          ...(String(input.args.model || '').trim() ? { model: String(input.args.model).trim() } : {}),
          ...(String(input.args.aspectRatio || '').trim() ? { aspectRatio: String(input.args.aspectRatio).trim() } : {}),
          ...(String(input.args.resolution || '').trim() ? { resolution: String(input.args.resolution).trim() } : {}),
        }, attachment);
        const media = cleanMedia(generated, itemInstruction, attachment.id);
        if (media.length === 0) throw new Error('图片生成没有返回可用结果');
        results[index] = { attachmentId: attachment.id, status: 'completed', media };
      } catch (error) {
        results[index] = input.signal?.aborted
          ? { attachmentId: attachment.id, status: 'cancelled' }
          : { attachmentId: attachment.id, status: 'error', error: String(error instanceof Error ? error.message : error) };
      }
      active = Math.max(0, active - 1);
      const cancelled = Boolean(input.signal?.aborted);
      const finished = results.filter(Boolean).length >= attachments.length;
      await input.onProgress?.(buildResult(
        instruction,
        attachments.length,
        results,
        cancelled ? 'cancelled' : finished ? 'completed' : 'generating',
        started,
        active,
        cancelled,
      ));
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const cancelled = Boolean(input.signal?.aborted);
  if (cancelled) {
    for (let index = 0; index < attachments.length; index += 1) {
      if (!results[index]) results[index] = { attachmentId: attachments[index].id, status: 'cancelled' };
    }
  }
  const result = buildResult(
    instruction,
    attachments.length,
    results,
    cancelled ? 'cancelled' : 'completed',
    started,
    0,
    cancelled,
  );
  await input.onProgress?.(result);
  return result;
};
