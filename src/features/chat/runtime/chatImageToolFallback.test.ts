import { describe, expect, it } from 'vitest';
import {
  buildCompositeImageVariantFallback,
  buildIndependentImageVariantFallback,
  requestedImageVariantCount,
} from './chatImageToolFallback';

describe('missing image tool fallback', () => {
  it('recognizes a conversational request for all four styles', () => {
    expect(requestedImageVariantCount('这四种风格都想要，你帮我分别出图吧')).toBe(4);
  });

  it('recovers four independent image tasks from the previous numbered proposal', () => {
    const fallback = buildIndependentImageVariantFallback({
      userText: '这四种风格都想要，你帮我分别出图吧',
      toolIntentText: '这四种风格都想要，你帮我分别出图吧',
      assistantTexts: [`
1. **家居极简风**：放在暖白色客厅中，使用柔和自然光和克制留白。
2. **高端科技风**：深色科技展台，冷色轮廓光与精密材质细节。
3. **复古胶片风**：温暖胶片颗粒、复古木质空间与生活化构图。
4. **户外便携风**：置于轻户外场景，强调便携结构与清晨自然光。
      `],
    });

    expect(fallback?.variants).toEqual([
      expect.objectContaining({ name: '家居极简风', prompt: expect.stringContaining('暖白色客厅') }),
      expect.objectContaining({ name: '高端科技风', prompt: expect.stringContaining('冷色轮廓光') }),
      expect.objectContaining({ name: '复古胶片风', prompt: expect.stringContaining('胶片颗粒') }),
      expect.objectContaining({ name: '户外便携风', prompt: expect.stringContaining('轻户外场景') }),
    ]);
  });

  it('keeps a same-image multi-option request as one generated image', () => {
    expect(buildCompositeImageVariantFallback({
      userText: '把四种方案放进同一张图对比',
      toolIntentText: '把四种方案放进同一张图对比',
      assistantTexts: ['1. 极简\n2. 科技\n3. 复古\n4. 户外'],
    })).toMatchObject({ count: 1, prompt: expect.stringContaining('只能输出一张图片') });
  });
});
