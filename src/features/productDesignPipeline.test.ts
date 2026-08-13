import { describe, expect, it } from 'vitest';
import type { InspirationCandidate } from './appAgent/inspirationMemory';
import {
  buildProductDesignPipelineAnalysisPrompt,
  buildProductDesignPipelineGeneratorPrompt,
  expandProductStyleSearchTerms,
  extractExplicitProductStyleTerms,
  filterExplicitStyleReferences,
  mapInspirationRoleToGeneratorRole,
  selectProductDesignReferencesByAxis,
} from './productDesignPipeline';

const candidate = (itemId: string, recommendedRole: InspirationCandidate['recommendedRole']): InspirationCandidate => ({
  itemId,
  recommendedRole,
  summary: itemId,
  reason: `${itemId} relevant`,
  matchedFeatures: ['轮廓'],
  confidence: 0.62,
  state: 'candidate',
});

describe('productDesignPipeline', () => {
  it('takes five unique images with 2 category, 2 form and 1 color/style slots', () => {
    const selected = selectProductDesignReferencesByAxis({
      category: [candidate('category-a', 'SUBJECT_REF'), candidate('category-b', 'SUBJECT_REF')],
      form: [candidate('form-a', 'FORM_REF'), candidate('form-b', 'FORM_REF')],
      color: [candidate('color-a', 'CMF_REF')],
    });
    expect(selected.map(item => item.itemId)).toEqual([
      'category-a', 'category-b', 'form-a', 'form-b', 'color-a',
    ]);
    expect(selected.map(item => item.selectionAxis)).toEqual([
      'category', 'category', 'form', 'form', 'color',
    ]);
  });

  it('deduplicates across axes and fills all five slots from remaining tagged candidates', () => {
    const selected = selectProductDesignReferencesByAxis({
      category: [candidate('shared', 'SUBJECT_REF'), candidate('category-b', 'SUBJECT_REF')],
      form: [candidate('shared', 'FORM_REF'), candidate('form-b', 'FORM_REF'), candidate('form-c', 'FORM_REF')],
      color: [candidate('shared', 'MOOD_REF'), candidate('color-b', 'CMF_REF'), candidate('color-c', 'CMF_REF')],
    });
    expect(new Set(selected.map(item => item.itemId)).size).toBe(5);
    expect(selected).toHaveLength(5);
  });

  it('extracts explicit mechanical and minimalist style constraints', () => {
    expect(extractExplicitProductStyleTerms('做一款机械风、极简风的投影仪')).toEqual(['机械风', '极简风']);
  });

  it('expands colloquial cool styling into searchable analyzed-tag synonyms', () => {
    const styles = extractExplicitProductStyleTerms('帮我设计一款炫酷的电子烟');
    expect(styles).toEqual(['炫酷科技']);
    expect(expandProductStyleSearchTerms(styles)).toEqual(expect.arrayContaining([
      '炫酷科技', '科技感', '未来感', '机能', '赛博', '霓虹', '高对比',
    ]));
  });

  it('keeps only references whose analyzed metadata supports an explicit style', () => {
    const mechanical = {
      ...candidate('mechanical', 'MOOD_REF'),
      matchedFeatures: ['机械美学', '外露结构'],
    };
    const unrelated = {
      ...candidate('soft', 'MOOD_REF'),
      matchedFeatures: ['柔和', '奶油色'],
    };
    expect(filterExplicitStyleReferences([unrelated, mechanical], ['机械风']).map(item => item.itemId))
      .toEqual(['mechanical']);
  });

  it('maps semantic drawer roles to image generator reference roles', () => {
    expect(mapInspirationRoleToGeneratorRole('SUBJECT_REF')).toBe('SUBJECT_REF');
    expect(mapInspirationRoleToGeneratorRole('MOOD_REF')).toBe('STYLE_REF');
    expect(mapInspirationRoleToGeneratorRole('CMF_REF')).toBe('STYLE_REF');
  });

  it('forces the analysis to inspect images and preserves the original request downstream', () => {
    const references = selectProductDesignReferencesByAxis({
      category: [candidate('a', 'SUBJECT_REF')],
      form: [candidate('b', 'FORM_REF')],
      color: [candidate('c', 'CMF_REF')],
      count: 3,
    });
    const analysis = buildProductDesignPipelineAnalysisPrompt({
      request: '帮我设计一款极简桌面音箱',
      references,
      explicitStyleTerms: ['极简风'],
    });
    const generator = buildProductDesignPipelineGeneratorPrompt({ request: '帮我设计一款桌面音箱' });
    expect(analysis).toContain('图 1、图 2');
    expect(analysis).toContain('检索维度: 品类/产品身份');
    expect(analysis).toContain('用户明确风格约束：极简风');
    expect(analysis).toContain('必须亲自观察附件图片');
    expect(generator).toContain('upstream Design Agent analysis');
    expect(generator).toContain('帮我设计一款桌面音箱');
  });
});
