import { describe, expect, it } from 'vitest';
import { normalizeImageVariants, resolveImageVariantToolRoute } from './imageVariantNormalization';

describe('image variant normalization', () => {
  it('normalizes structured aliases, prompt arrays, JSON, and numbered text', () => {
    expect(normalizeImageVariants([
      { title: '方案 A', description: '暖白空间与自然光' },
      '方案 B：深色展台与冷色轮廓光',
      { prompt: '复古胶片颗粒与木质空间' },
      { label: '方案 D', instruction: '轻户外场景与清晨光线' },
    ])).toEqual([
      { name: '方案 A', prompt: '暖白空间与自然光' },
      { name: '方案 B', prompt: '深色展台与冷色轮廓光' },
      { name: '方案 3', prompt: '复古胶片颗粒与木质空间' },
      { name: '方案 D', prompt: '轻户外场景与清晨光线' },
    ]);

    expect(normalizeImageVariants(JSON.stringify({
      variants: [
        { name: '极简', prompt: '克制留白' },
        { name: '科技', prompt: '精密金属' },
      ],
    }))).toHaveLength(2);

    expect(normalizeImageVariants('1. 家居：暖白客厅\n2. 户外：清晨自然光')).toEqual([
      { name: '家居', prompt: '暖白客厅' },
      { name: '户外', prompt: '清晨自然光' },
    ]);
  });

  it('never promotes a name-only object into a prompt', () => {
    expect(normalizeImageVariants([
      { name: '只有名称' },
      { name: '有效方案', prompt: '完整提示词' },
    ])).toEqual([{ name: '有效方案', prompt: '完整提示词' }]);
  });

  it('keeps multiple variants on the batch path and uses the longer fallback', () => {
    const route = resolveImageVariantToolRoute({
      args: { variants: [{ name: '损坏项' }] },
      fallbackVariants: [
        { name: '方案 1', prompt: '提示词 1' },
        { name: '方案 2', prompt: '提示词 2' },
        { name: '方案 3', prompt: '提示词 3' },
        { name: '方案 4', prompt: '提示词 4' },
      ],
      requireMultiple: true,
    });
    expect(route.toolName).toBe('generate_image_variants');
    expect(route.variants).toHaveLength(4);
    expect(route.args.variants).toEqual(route.variants);
  });

  it('routes a single normalized variant through ordinary single-image generation', () => {
    const route = resolveImageVariantToolRoute({
      args: {
        sharedRequirements: '保持主体结构',
        variants: [{ name: '唯一方案', prompt: '暖色自然光' }],
        model: 'image-model',
      },
      fallbackVariants: [
        { name: '旧方案 1', prompt: '旧提示词 1' },
        { name: '旧方案 2', prompt: '旧提示词 2' },
      ],
      requireMultiple: false,
    });
    expect(route.toolName).toBe('generate_image');
    expect(route.args).toMatchObject({ count: 1, model: 'image-model' });
    expect(String(route.args.prompt)).toContain('暖色自然光');
    expect(route.args).not.toHaveProperty('variants');
  });
});
