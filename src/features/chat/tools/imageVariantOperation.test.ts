import { describe, expect, it, vi } from 'vitest';
import { executeImageVariantOperation } from './imageVariantOperation';

describe('generate_image_variants', () => {
  it('runs every semantic variant as one independent task with shared references', async () => {
    const generate = vi.fn(async (_args: Record<string, unknown>) => ({
      media: [{
        id: `output-${generate.mock.calls.length}`,
        path: `C:\\outputs\\variant-${generate.mock.calls.length}.png`,
      }],
    }));
    const result = await executeImageVariantOperation({
      args: {
        sharedRequirements: '保持参考主体的身份、结构、比例和视角不变',
        variants: [
          { name: '方向 A', prompt: '采用温暖的天然材质' },
          { name: '方向 B', prompt: '采用冷峻的金属材质' },
          { name: '方向 C', prompt: '采用柔和的织物材质' },
        ],
        referenceImages: ['C:\\references\\product.png'],
        count: 3,
      },
      generate,
    });

    expect(generate).toHaveBeenCalledTimes(3);
    for (const [args] of generate.mock.calls) {
      expect(args).toMatchObject({
        count: 1,
        referenceImages: ['C:\\references\\product.png'],
      });
      expect(String(args.prompt)).toContain('只生成当前这一个方案的一张图');
      expect(String(args.prompt)).toContain('不得生成左右/上下分屏、拼图、拼版');
    }
    expect(generate.mock.calls.map(([args]) => String(args.prompt))).toEqual([
      expect.stringContaining('方向 A'),
      expect.stringContaining('方向 B'),
      expect.stringContaining('方向 C'),
    ]);
    expect(result).toMatchObject({ total: 3, completed: 3, succeeded: 3, failed: 0 });
    expect(result.results.flatMap(item => item.media || [])).toHaveLength(3);
  });

  it('rejects a variants call that does not describe multiple distinct outputs', async () => {
    await expect(executeImageVariantOperation({
      args: { variants: [{ name: '唯一方案', prompt: '一个方向' }] },
      generate: vi.fn(),
    })).rejects.toThrow('至少需要两个');
  });
});
