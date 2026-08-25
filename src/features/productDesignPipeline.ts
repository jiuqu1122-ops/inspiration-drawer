import type { InspirationCandidate } from './appAgent/inspirationMemory';

export type ProductDesignGeneratorReferenceRole = 'STYLE_REF' | 'LAYOUT_REF' | 'SUBJECT_REF';
export type ProductDesignReferenceAxis = 'category' | 'form' | 'color';
export type ProductDesignSelectedReference = InspirationCandidate & {
  selectionAxis: ProductDesignReferenceAxis;
};

const uniqueCandidates = (candidates: InspirationCandidate[]) => {
  const seen = new Set<string>();
  return candidates.filter(candidate => {
    if (!candidate.itemId || seen.has(candidate.itemId)) return false;
    seen.add(candidate.itemId);
    return true;
  });
};

export const extractExplicitProductStyleTerms = (request: string) => {
  const rules: Array<[RegExp, string]> = [
    [/(?:机械风|机械感|机械美学|mechanical)/i, '机械风'],
    [/(?:极简|简约|minimal(?:ist)?)/i, '极简风'],
    [/(?:工业风|工业感|industrial)/i, '工业风'],
    [/(?:复古|怀旧|retro|vintage)/i, '复古风'],
    [/(?:未来感|未来风|futuristic|sci[ -]?fi)/i, '未来风'],
    [/(?:赛博|cyberpunk)/i, '赛博风'],
    [/(?:炫酷|酷炫|很酷|高科技感|high[ -]?tech|\bcool\b)/i, '炫酷科技'],
    [/(?:高级感|高端感|精致感|premium)/i, '高级精致'],
    [/(?:硬核|强悍|硬派|hardcore)/i, '硬核力量'],
    [/(?:动感|运动感|速度感|dynamic|sporty)/i, '动感运动'],
    [/(?:清爽|清新|干净感|fresh|clean)/i, '清爽简洁'],
    [/(?:粗犷|硬朗|rugged)/i, '粗犷硬朗'],
    [/(?:有机|仿生|organic|biomorphic)/i, '有机仿生'],
    [/(?:可爱|萌|cute)/i, '可爱风'],
    [/(?:奢华|豪华|luxury)/i, '奢华风'],
    [/(?:北欧|scandinavian)/i, '北欧风'],
    [/(?:日系|和风|japanese)/i, '日系'],
    [/(?:专业感|专业风|professional)/i, '专业风'],
    [/(?:温暖|温馨|warm)/i, '温暖家居'],
  ];
  return Array.from(new Set(rules.filter(([pattern]) => pattern.test(request)).map(([, label]) => label)));
};

const PRODUCT_STYLE_ALIASES: Record<string, string[]> = {
  '机械风': ['机械', '机甲', 'mechanical'],
  '极简风': ['极简', '简约', 'minimal'],
  '工业风': ['工业风', '工业感', 'industrial'],
  '复古风': ['复古', '怀旧', 'retro', 'vintage'],
  '未来风': ['未来', '科幻', 'futuristic', 'sci-fi', 'scifi'],
  '赛博风': ['赛博', 'cyberpunk'],
  '炫酷科技': ['炫酷', '酷炫', '科技感', '高科技', '未来感', '冷峻', '机能', '赛博', '霓虹', '高对比', 'cool', 'high-tech', 'high tech'],
  '高级精致': ['高级感', '高端', '精致', '克制', '品质感', 'premium'],
  '硬核力量': ['硬核', '强悍', '硬派', '力量感', '机械感', 'rugged', 'hardcore'],
  '动感运动': ['动感', '运动感', '速度感', '流线', 'dynamic', 'sporty'],
  '清爽简洁': ['清爽', '清新', '干净', '简洁', '轻盈', 'fresh', 'clean'],
  '粗犷硬朗': ['粗犷', '硬朗', 'rugged'],
  '有机仿生': ['有机', '仿生', 'organic', 'biomorphic'],
  '可爱风': ['可爱', '萌', 'cute'],
  '奢华风': ['奢华', '豪华', 'luxury'],
  '北欧风': ['北欧', 'scandinavian'],
  '日系': ['日系', '和风', 'japanese'],
  '专业风': ['专业感', '专业风', 'professional'],
  '温暖家居': ['温暖', '温馨', 'warm'],
};

export const expandProductStyleSearchTerms = (styleTerms: string[]) => Array.from(new Set(
  styleTerms.flatMap(term => [term, ...(PRODUCT_STYLE_ALIASES[term] || [])]),
));

const countCandidateStyleMatches = (candidate: InspirationCandidate, styleTerms: string[]) => {
  const haystack = [
    candidate.summary,
    candidate.reason,
    candidate.folderName,
    ...candidate.matchedFeatures,
  ].filter(Boolean).join(' ').toLowerCase();
  return styleTerms.reduce((count, term) => {
    const aliases = PRODUCT_STYLE_ALIASES[term] || [term];
    return count + (aliases.some(alias => haystack.includes(alias.toLowerCase())) ? 1 : 0);
  }, 0);
};

export const filterExplicitStyleReferences = (
  candidates: InspirationCandidate[],
  styleTerms: string[],
) => styleTerms.length === 0
  ? candidates
  : candidates
    .map((candidate, index) => ({ candidate, index, matches: countCandidateStyleMatches(candidate, styleTerms) }))
    .filter(item => item.matches > 0)
    .sort((a, b) => b.matches - a.matches || a.index - b.index)
    .map(item => item.candidate);

export const selectProductDesignReferencesByAxis = (input: {
  category: InspirationCandidate[];
  form: InspirationCandidate[];
  color: InspirationCandidate[];
  count?: number;
}): ProductDesignSelectedReference[] => {
  const count = Math.max(1, Math.min(5, Math.round(input.count || 5)));
  const buckets: Record<ProductDesignReferenceAxis, InspirationCandidate[]> = {
    category: uniqueCandidates(input.category),
    form: uniqueCandidates(input.form),
    color: uniqueCandidates(input.color),
  };
  const quotas: Array<[ProductDesignReferenceAxis, number]> = [
    ['category', 2],
    ['form', 2],
    ['color', 1],
  ];
  const selected: ProductDesignSelectedReference[] = [];
  const selectedIds = new Set<string>();
  const push = (candidate: InspirationCandidate | undefined, selectionAxis: ProductDesignReferenceAxis) => {
    if (!candidate || selectedIds.has(candidate.itemId) || selected.length >= count) return false;
    selectedIds.add(candidate.itemId);
    selected.push({ ...candidate, selectionAxis });
    return true;
  };

  quotas.forEach(([axis, quota]) => {
    let accepted = 0;
    for (const candidate of buckets[axis]) {
      if (push(candidate, axis)) accepted += 1;
      if (accepted >= quota || selected.length >= count) break;
    }
  });

  if (selected.length < count) {
    const fallbackOrder: ProductDesignReferenceAxis[] = ['category', 'form', 'color'];
    let addedInPass = true;
    while (selected.length < count && addedInPass) {
      addedInPass = false;
      fallbackOrder.forEach(axis => {
        const candidate = buckets[axis].find(item => !selectedIds.has(item.itemId));
        if (push(candidate, axis)) addedInPass = true;
      });
    }
  }
  return selected;
};

export const mapInspirationRoleToGeneratorRole = (
  role: InspirationCandidate['recommendedRole'],
): ProductDesignGeneratorReferenceRole => {
  if (role === 'SUBJECT_REF') return 'SUBJECT_REF';
  return 'STYLE_REF';
};

export const buildProductDesignPipelineAnalysisPrompt = (input: {
  request: string;
  basePrompt?: string;
  references: ProductDesignSelectedReference[];
  explicitStyleTerms?: string[];
}) => [
  input.basePrompt?.trim() || [
    '工业设计意向分析与生图策略',
    '分析用户需求和所有实际连接的参考图；逐图提取造型、比例、结构、CMF、交互和氛围特征。',
    '综合给出产品定位、概念方向、silhouette/body/surface/function/CMF、可制造性、设计风险与完整下游生图提示词。',
  ].join('\n'),
  '',
  `Original request: "${input.request.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
  input.explicitStyleTerms?.length
    ? `用户明确风格约束：${input.explicitStyleTerms.join('、')}。分析与最终策略必须验证参考图是否真正支持这些风格，不得忽略。`
    : '',
  '自动检索参考图清单（顺序与图 1、图 2…附件严格一致）：',
  ...(input.references.length > 0
    ? input.references.map((reference, index) => [
      `${index + 1}. itemId: ${reference.itemId}`,
      `检索维度: ${reference.selectionAxis === 'category' ? '品类/产品身份' : reference.selectionAxis === 'form' ? '造型/轮廓比例' : '颜色/CMF/明确风格'}`,
      `建议角色: ${reference.recommendedRole}`,
      `检索依据: ${reference.reason}`,
      reference.matchedFeatures.length > 0 ? `匹配特征: ${reference.matchedFeatures.join('、')}` : '',
    ].filter(Boolean).join('\n'))
    : ['未找到可用的抽屉意向图；请明确说明本次仅依据文字需求分析。']),
  '必须亲自观察附件图片后验证、修正或否定上述元数据建议，不能把检索摘要当成图片分析结果。',
].filter(Boolean).join('\n');

export const buildProductDesignPipelineGeneratorPrompt = (input: {
  request: string;
  basePrompt?: string;
}) => [
  input.basePrompt?.trim() || input.request.trim(),
  'Use the connected upstream Design Agent analysis as the design decision source.',
  'Use the connected visual references according to their assigned roles and synthesize one coherent new product design.',
  'Do not create a collage. Do not copy logos, text, watermarks, brand signatures, or unsupported mechanical details from references.',
  `Original request: "${input.request.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
].filter(Boolean).join('\n');
