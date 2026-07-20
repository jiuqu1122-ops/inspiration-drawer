import { describe, expect, it } from 'vitest';
import type { BufferItem } from '../../types';
import {
  INDUSTRIAL_DESIGN_FULL_PROCESS_NO_EXTRA_REFERENCE,
  buildIndustrialDesignLocalInspirationContext,
  buildIndustrialDesignRuntimeContextText,
} from './industrialDesignFullProcessWorkflow';

const makeImage = (id: string, profile: BufferItem['inspirationProfile']): BufferItem => ({
  id,
  type: 'image',
  name: profile?.summary || id,
  content: profile?.summary || id,
  createdAt: 1,
  inspirationProfile: profile,
});

const warmCoffeeReference = makeImage('warm-coffee-reference', {
  itemId: 'warm-coffee-reference',
  summary: '轻巧便携的暖白咖啡设备，圆润比例和克制的居家质感',
  objects: ['便携咖啡机', '旋钮'],
  category: '咖啡设备',
  form: {
    silhouette: ['圆润', '紧凑'],
    geometry: ['柔和圆角矩形'],
    proportion: ['轻巧', '便携'],
  },
  cmf: {
    colors: ['暖白', '米白'],
    materials: ['塑料', '金属'],
    finishes: ['磨砂表面'],
  },
  style: ['温暖', '复古', '极简'],
  interaction: ['顶部旋钮'],
  scene: ['年轻用户居家咖啡场景'],
  mood: ['温暖生活方式'],
  userTags: ['便携咖啡机', '暖白', '圆润'],
  userNotes: ['适合作为便携小家电的造型和 CMF 参考'],
});

describe('industrial design local inspiration context', () => {
  it('uses only auto-selected local metadata candidates and caps references', () => {
    const context = buildIndustrialDesignLocalInspirationContext(
      [warmCoffeeReference],
      '为年轻用户设计温暖复古的便携咖啡机，使用暖白磨砂表面',
    );

    expect(context.usedExtraReferences).toBe(true);
    expect(context.references).toHaveLength(1);
    expect(context.references[0]?.itemId).toBe('warm-coffee-reference');
    expect(context.references[0]?.confidence).toBeGreaterThan(0.9);
    expect(context.metadataText).toContain('未重新分析图片');
    expect(context.metadataText).toContain('itemId: warm-coffee-reference');
  });

  it('excludes explicit product references and emits the required no-reference marker', () => {
    const context = buildIndustrialDesignLocalInspirationContext(
      [warmCoffeeReference],
      '设计暖白磨砂的便携咖啡机',
      { excludeItemIds: ['warm-coffee-reference'] },
    );

    expect(context.references).toEqual([]);
    expect(context.usedExtraReferences).toBe(false);
    expect(context.metadataText).toContain(INDUSTRIAL_DESIGN_FULL_PROCESS_NO_EXTRA_REFERENCE);
    expect(context.metadataText).toContain('不要调用外部搜索或网页采集');

    const runtimeText = buildIndustrialDesignRuntimeContextText({
      projectRequest: '设计暖白磨砂的便携咖啡机',
      connectedInputLabels: ['用户产品参考图'],
      localInspirationContext: context,
    });
    expect(runtimeText).toContain('Original request:');
    expect(runtimeText).toContain('设计暖白磨砂的便携咖啡机');
    expect(runtimeText).toContain('用户产品参考图');
    expect(runtimeText).toContain(INDUSTRIAL_DESIGN_FULL_PROCESS_NO_EXTRA_REFERENCE);
  });

  it('does not adopt medium or low confidence metadata candidates', () => {
    const unrelated = makeImage('unrelated-tool', {
      itemId: 'unrelated-tool',
      summary: '黑色硬核电动工具',
      objects: ['电钻'],
      category: '工具',
      form: { silhouette: ['锐利'], geometry: ['折线'], proportion: ['厚重'] },
      cmf: { colors: ['黑色'], materials: ['橡胶'], finishes: ['高对比'] },
      style: ['硬核'],
      interaction: ['扳机'],
      scene: ['工地'],
      mood: ['力量'],
      userTags: [],
      userNotes: [],
    });
    const context = buildIndustrialDesignLocalInspirationContext(
      [unrelated],
      '设计儿童木制积木玩具',
    );

    expect(context.references).toEqual([]);
    expect(context.metadataText).toContain(INDUSTRIAL_DESIGN_FULL_PROCESS_NO_EXTRA_REFERENCE);
  });
});
