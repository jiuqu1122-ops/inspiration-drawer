import type { ChatGeneratedMedia } from '../model/chatTypes';
import {
  normalizeImageVariants,
  type ImageVariantSpec,
} from './imageVariantNormalization';

export { IMAGE_VARIANT_MAX_COUNT } from './imageVariantNormalization';
export type { ImageVariantSpec } from './imageVariantNormalization';

export type ImageVariantItemResult = {
  variantIndex: number;
  name: string;
  prompt: string;
  status: 'completed' | 'error' | 'cancelled';
  media?: ChatGeneratedMedia[];
  error?: string;
};

export type ImageVariantOperationResult = {
  ok: boolean;
  operation: 'generate_image_variants';
  sharedRequirements: string;
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  cancelled: boolean;
  results: ImageVariantItemResult[];
};

const cleanMedia = (value: unknown, fallbackPrompt: string): ChatGeneratedMedia[] => {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const media = Array.isArray(record.media) ? record.media : Array.isArray(record.outputs) ? record.outputs : [];
  return media.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const output = entry as Record<string, unknown>;
    const path = String(output.path || '').trim() || undefined;
    const url = String(output.url || output.sourceUrl || '').trim() || undefined;
    if (!path && !url) return [];
    return [{
      id: String(output.id || `image-variant-${index + 1}`),
      type: 'image' as const,
      path,
      url,
      thumbnail: String(output.thumbnail || '').trim() || undefined,
      assetId: String(output.assetId || output.drawerItemId || '').trim() || undefined,
      prompt: String(output.prompt || record.prompt || fallbackPrompt).trim() || undefined,
      name: String(output.name || '').trim() || undefined,
    }];
  });
};

const buildResult = (
  sharedRequirements: string,
  total: number,
  results: ImageVariantItemResult[],
  cancelled: boolean,
): ImageVariantOperationResult => ({
  ok: results.some(result => result.status === 'completed') && !cancelled,
  operation: 'generate_image_variants',
  sharedRequirements,
  total,
  completed: results.length,
  succeeded: results.filter(result => result.status === 'completed').length,
  failed: results.filter(result => result.status === 'error').length,
  cancelled,
  results: [...results].sort((left, right) => left.variantIndex - right.variantIndex),
});

export const executeImageVariantOperation = async (input: {
  args: Record<string, unknown>;
  generate: (args: Record<string, unknown>, variant: ImageVariantSpec, index: number) => Promise<unknown>;
  signal?: AbortSignal;
  onProgress?: (progress: ImageVariantOperationResult) => void | Promise<void>;
}) => {
  const sharedRequirements = String(input.args.sharedRequirements || '').trim();
  const variants = normalizeImageVariants(input.args.variants);
  if (variants.length < 2) throw new Error('独立方案生图至少需要两个包含名称和提示词的 variants');
  const referenceImages = Array.isArray(input.args.referenceImages)
    ? input.args.referenceImages.map(String).map(value => value.trim()).filter(Boolean).slice(0, 9)
    : [];
  const results: ImageVariantItemResult[] = [];
  await input.onProgress?.(buildResult(sharedRequirements, variants.length, results, false));

  await Promise.all(variants.map(async (variant, index) => {
    if (input.signal?.aborted) {
      results.push({
        variantIndex: index,
        name: variant.name,
        prompt: variant.prompt,
        status: 'cancelled',
      });
      return;
    }
    const prompt = [
      sharedRequirements,
      `当前独立方案：${variant.name}`,
      variant.prompt,
      '只生成当前这一个方案的一张图，画面中只能有一个完整场景。不得加入其他方案或另一场景；不得生成左右/上下分屏、拼图、拼版、网格、双联画、三联画、对比图、方案板或 contact sheet。',
    ].filter(Boolean).join('\n\n');
    try {
      const generated = await input.generate({
        prompt,
        referenceImages,
        count: 1,
        ...(String(input.args.model || '').trim() ? { model: String(input.args.model).trim() } : {}),
        ...(String(input.args.aspectRatio || '').trim() ? { aspectRatio: String(input.args.aspectRatio).trim() } : {}),
        ...(String(input.args.resolution || '').trim() ? { resolution: String(input.args.resolution).trim() } : {}),
      }, variant, index);
      const media = cleanMedia(generated, prompt).slice(0, 1);
      if (media.length === 0) throw new Error('图片生成没有返回可用结果');
      results.push({
        variantIndex: index,
        name: variant.name,
        prompt: variant.prompt,
        status: 'completed',
        media,
      });
    } catch (error) {
      results.push(input.signal?.aborted
        ? { variantIndex: index, name: variant.name, prompt: variant.prompt, status: 'cancelled' }
        : {
          variantIndex: index,
          name: variant.name,
          prompt: variant.prompt,
          status: 'error',
          error: String(error instanceof Error ? error.message : error),
        });
    }
    await input.onProgress?.(buildResult(
      sharedRequirements,
      variants.length,
      results,
      Boolean(input.signal?.aborted),
    ));
  }));

  const result = buildResult(
    sharedRequirements,
    variants.length,
    results,
    Boolean(input.signal?.aborted),
  );
  await input.onProgress?.(result);
  return result;
};
