import type { BufferItem } from '../../../types';
import type {
  DrawerInspirationMatch,
  DrawerSearchInspirationsInput,
  InspirationCandidateState,
  InspirationProfile,
  InspirationReferenceRole,
} from './types';
import { getReliableInspirationAiTags } from './inspirationAnalysis';

const ROLE_TERMS: Record<InspirationReferenceRole, string[]> = {
  FORM_REF: ['form', 'shape', 'silhouette', 'geometry', 'proportion', '造型', '轮廓', '几何', '比例', '圆润', '方正'],
  CMF_REF: ['cmf', 'color', 'material', 'finish', '颜色', '配色', '材质', '表面', '磨砂', '金属', '塑料'],
  STRUCTURE_REF: ['structure', 'mechanism', 'assembly', '结构', '机构', '分件', '接口', '开孔', '连接'],
  INTERACTION_REF: ['interaction', 'control', 'button', 'display', '交互', '操作', '按键', '旋钮', '屏幕', '反馈'],
  MOOD_REF: ['mood', 'scene', 'lifestyle', '氛围', '场景', '生活方式', '温暖', '复古', '科技'],
  SUBJECT_REF: ['subject', 'product', 'identity', '主体', '产品', '一致性', '品类', '结构保持'],
};

export const inferInspirationReferenceRoleFromFolderName = (
  value?: string | null,
): InspirationReferenceRole | undefined => {
  const name = String(value || '').trim();
  if (!name) return undefined;
  if (/(?:造型|形态|轮廓|外观|体块|比例|form|shape|silhouette)/i.test(name)) return 'FORM_REF';
  if (/(?:cmf|色彩|颜色|配色|材质|材料|表面|工艺|color|material|finish)/i.test(name)) return 'CMF_REF';
  if (/(?:结构|机构|装配|构造|工程|structure|mechanism|assembly)/i.test(name)) return 'STRUCTURE_REF';
  if (/(?:交互|操控|按键|旋钮|界面|interaction|control|ui)/i.test(name)) return 'INTERACTION_REF';
  if (/(?:氛围|场景|情绪|风格|意象|mood|scene|style)/i.test(name)) return 'MOOD_REF';
  if (/(?:产品参考|品类参考|竞品|product\s*ref|subject\s*ref)/i.test(name)) return 'SUBJECT_REF';
  if (/(?:参考|reference|(?:^|\W)ref(?:$|\W))/i.test(name)) return 'SUBJECT_REF';
  return undefined;
};

const normalize = (value: unknown) => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const SEARCH_STOP_WORDS = new Set([
  '一个', '一些', '当前', '帮我', '我们', '需要', '进行', '设计', '产品', '用户', '使用', '参考', '方案',
  '设备', '素材', '图片', '图像', '生成', '其他', '视觉', '视觉设计',
  'the', 'and', 'for', 'with', 'from', 'this', 'that',
]);
type SearchSegmenter = {
  segment: (input: string) => Iterable<{ segment: string; isWordLike?: boolean }>;
};
const SegmenterCtor = (Intl as unknown as {
  Segmenter?: new (locale?: string, options?: { granularity?: string }) => SearchSegmenter;
}).Segmenter;
const searchSegmenter = SegmenterCtor
  ? new SegmenterCtor('zh-CN', { granularity: 'word' })
  : null;

export const tokenizeDrawerSearchText = (value: unknown) => {
  const text = normalize(value);
  const wordSegments = searchSegmenter
    ? Array.from(searchSegmenter.segment(text))
      .filter(segment => segment.isWordLike !== false)
      .map(segment => normalize(segment.segment))
    : [];
  const segments = [...text.split(' '), ...wordSegments];
  return Array.from(new Set(segments
    .filter(segment => segment.length > 1 && !SEARCH_STOP_WORDS.has(segment))))
    .slice(0, 96);
};
const compact = (value: unknown, max = 120) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
};
const values = (value: unknown): string[] => Array.isArray(value)
  ? value.map(item => compact(item)).filter(Boolean)
  : compact(value) ? [compact(value)] : [];

export const getInspirationCandidateState = (confidence: number): InspirationCandidateState => (
  confidence > 0.9 ? 'selected' : confidence >= 0.5 ? 'candidate' : 'rejected'
);

const localTerms = (text: string, rules: Array<[RegExp, string]>) => (
  rules.filter(([pattern]) => pattern.test(text)).map(([, label]) => label)
);

const inferLocalMetadata = (item: BufferItem) => {
  const text = [item.name, item.content, item.remark, ...(item.remarks || [])].filter(Boolean).join(' ');
  return {
    category: localTerms(text, [
      [/(投影|projector)/i, '投影设备'], [/(咖啡|coffee)/i, '咖啡设备'],
      [/(灯|lamp|light)/i, '照明'], [/(音箱|speaker|audio)/i, '音频设备'],
      [/(相机|camera)/i, '影像设备'], [/(椅|桌|柜|furniture)/i, '家具'],
    ])[0] || '未分类图片',
    style: localTerms(text, [
      [/(极简|minimal)/i, '极简'], [/(复古|retro|vintage)/i, '复古'],
      [/(温暖|warm)/i, '温暖'], [/(工业|industrial)/i, '工业'],
      [/(自然|organic|natural)/i, '自然'], [/(未来|futuristic)/i, '未来感'],
      [/(可爱|cute)/i, '可爱'], [/(高级|premium)/i, '高级'],
    ]),
    colors: localTerms(text, [
      [/(暖白|warm white)/i, '暖白'], [/(米白|beige)/i, '米白'],
      [/(白色|white)/i, '白色'], [/(黑色|black)/i, '黑色'], [/(灰色|gray|grey)/i, '灰色'],
      [/(蓝色|blue)/i, '蓝色'], [/(红色|red)/i, '红色'], [/(绿色|green)/i, '绿色'],
    ]),
    materials: localTerms(text, [
      [/(铝|金属|aluminum|metal)/i, '金属/铝'], [/(木|wood)/i, '木材'],
      [/(塑料|plastic)/i, '塑料'], [/(玻璃|glass)/i, '玻璃'],
      [/(织物|布料|fabric)/i, '织物'], [/(陶瓷|ceramic)/i, '陶瓷'],
    ]),
    finishes: localTerms(text, [
      [/(磨砂|matte)/i, '磨砂'], [/(高光|亮面|gloss)/i, '高光'],
      [/(拉丝|brushed)/i, '拉丝'], [/(半透明|translucent)/i, '半透明'],
      [/(亲肤|soft touch)/i, '亲肤涂层'],
    ]),
    silhouette: localTerms(text, [
      [/(圆润|rounded)/i, '圆润'], [/(方正|rectangular|square)/i, '方正'],
      [/(圆柱|cylindrical)/i, '圆柱'], [/(轻薄|slim)/i, '轻薄'], [/(紧凑|compact)/i, '紧凑'],
    ]),
  };
};

export function createFallbackInspirationProfile(item: BufferItem): InspirationProfile {
  const notes = [...values(item.remark), ...values(item.remarks)];
  const metadata = inferLocalMetadata(item);
  return {
    itemId: item.id,
    summary: compact(item.content || item.name || '未分析灵感素材'),
    objects: values(item.name),
    category: metadata.category,
    form: {
      silhouette: metadata.silhouette,
      geometry: [],
      proportion: [],
    },
    cmf: {
      colors: metadata.colors,
      materials: metadata.materials,
      finishes: metadata.finishes,
    },
    style: metadata.style,
    interaction: [],
    scene: values(item.content),
    mood: [],
    userTags: [],
    userNotes: notes,
  };
}

export const getInspirationProfile = (item: BufferItem): InspirationProfile => {
  const stored = item.inspirationProfile;
  if (!stored) return createFallbackInspirationProfile(item);
  return {
    ...createFallbackInspirationProfile(item),
    ...stored,
    itemId: item.id,
    form: { ...createFallbackInspirationProfile(item).form, ...stored.form },
    cmf: { ...createFallbackInspirationProfile(item).cmf, ...stored.cmf },
  };
};

const aiTagNames = (profile: InspirationProfile, categories?: string[]) => (
  getReliableInspirationAiTags(profile)
    .filter(tag => !categories || categories.includes(tag.category))
    .map(tag => tag.name)
);

const profileFeatures = (profile: InspirationProfile) => ({
  FORM_REF: [...profile.form.silhouette, ...profile.form.geometry, ...profile.form.proportion, ...profile.style, ...aiTagNames(profile, ['形态', '视角', '风格'])],
  CMF_REF: [...profile.cmf.colors, ...profile.cmf.materials, ...profile.cmf.finishes, ...profile.style, ...aiTagNames(profile, ['色彩', '材质', '风格'])],
  STRUCTURE_REF: [...profile.objects, ...profile.form.geometry, ...profile.interaction, profile.category, ...aiTagNames(profile, ['产品类别', '设计领域', '形态'])],
  INTERACTION_REF: [...profile.interaction, ...profile.objects, ...profile.scene, ...aiTagNames(profile, ['产品类别', '场景'])],
  MOOD_REF: [...profile.mood, ...profile.scene, ...profile.style, ...profile.cmf.colors, ...aiTagNames(profile, ['风格', '色彩', '场景'])],
  SUBJECT_REF: [...profile.objects, profile.category, profile.summary, ...profile.form.silhouette, ...aiTagNames(profile, ['产品类别', '设计领域'])],
});

const inferRole = (query: string, scores: Record<InspirationReferenceRole, number>, requested?: InspirationReferenceRole) => {
  if (requested) return requested;
  const normalizedQuery = normalize(query);
  return (Object.keys(ROLE_TERMS) as InspirationReferenceRole[])
    .map(role => ({
      role,
      score: scores[role] + ROLE_TERMS[role].filter(term => normalizedQuery.includes(normalize(term))).length * 2,
    }))
    .sort((a, b) => b.score - a.score)[0]?.role || 'SUBJECT_REF';
};

export function searchDrawerInspirations(
  items: BufferItem[],
  input: DrawerSearchInspirationsInput,
): DrawerInspirationMatch[] {
  const briefText = typeof input.projectBrief === 'string'
    ? input.projectBrief
    : JSON.stringify(input.projectBrief || {});
  const queryTokens = tokenizeDrawerSearchText(`${input.query} ${briefText}`);
  const directQueryTokens = tokenizeDrawerSearchText(input.query);
  const folderIds = new Set((input.folderIds || []).filter(Boolean));
  const topK = Math.max(1, Math.min(8, Math.round(input.topK || 8)));

  return items
    .filter(item => item.type === 'image')
    .filter(item => folderIds.size === 0 || (!!item.folderId && folderIds.has(item.folderId)))
    .map(item => {
      const profile = getInspirationProfile(item);
      const folderName = item.folderId ? String(input.folderNames?.[item.folderId] || '').trim() : '';
      const folderRole = inferInspirationReferenceRoleFromFolderName(folderName);
      const byRole = profileFeatures(profile);
      const roleScores = Object.fromEntries((Object.keys(byRole) as InspirationReferenceRole[]).map(role => {
        const featureText = normalize(byRole[role].join(' '));
        const lexical = queryTokens.filter(token => featureText.includes(token)).length;
        return [role, lexical];
      })) as Record<InspirationReferenceRole, number>;
      const recommendedRole = inferRole(
        `${input.query} ${briefText}`,
        roleScores,
        input.referenceRole || folderRole,
      );
      const allText = normalize([
        item.name,
        item.content,
        folderName,
        profile.summary,
        profile.category,
        ...aiTagNames(profile),
        ...profile.userTags,
        ...profile.userNotes,
        ...Object.values(byRole).flat(),
      ].join(' '));
      const matchedTokens = queryTokens.filter(token => allText.includes(token));
      const roleFeatures = byRole[recommendedRole].filter(feature => {
        const normalizedFeature = normalize(feature);
        return normalizedFeature.length > 1
          && queryTokens.some(token => normalizedFeature.includes(token) || token.includes(normalizedFeature));
      });
      const normalizedFolderName = normalize(folderName);
      const folderMatchedTokens = folderName
        ? directQueryTokens.filter(token => normalizedFolderName.includes(token) || token.includes(normalizedFolderName))
        : [];
      const subjectText = normalize([
        folderName,
        item.name,
        profile.category,
        ...profile.objects,
        ...aiTagNames(profile, ['产品类别', '设计领域']),
        ...profile.userTags,
      ].join(' '));
      const subjectMatchedTokens = directQueryTokens.filter(token => (
        subjectText.includes(token) || token.includes(subjectText)
      ));
      const folderEvidence = folderName && (folderRole || folderMatchedTokens.length > 0)
        ? [`参考文件夹：${folderName}`]
        : [];
      const matchedFeatures = Array.from(new Set([
        ...roleFeatures,
        ...subjectMatchedTokens,
        ...matchedTokens,
        ...folderEvidence,
      ])).slice(0, 6);
      const metadataBonus = item.inspirationProfile ? 2 : 0;
      const folderRoleBonus = folderRole ? 2 : 0;
      const subjectSemanticBonus = subjectMatchedTokens.length * 3;
      const folderSemanticBonus = folderMatchedTokens.length > 0
        ? 8 + folderMatchedTokens.length * 4
        : 0;
      const score = matchedTokens.length
        + roleScores[recommendedRole] * 1.5
        + metadataBonus
        + folderRoleBonus
        + subjectSemanticBonus
        + folderSemanticBonus;
      const confidence = Math.max(0.18, Math.min(0.98, 0.3 + score * 0.08));
      const featureReason = matchedFeatures.length > 0 ? matchedFeatures.slice(0, 3).join('、') : profile.summary;
      return {
        itemId: item.id,
        summary: compact(profile.summary || item.name || item.content),
        reason: `${folderName ? `来自“${folderName}”；` : ''}${featureReason || item.name || '该素材'}与项目需求相关，建议作为 ${recommendedRole}。`,
        matchedFeatures,
        recommendedRole,
        confidence: Number(confidence.toFixed(2)),
        state: getInspirationCandidateState(confidence),
        folderId: item.folderId,
        folderName: folderName || undefined,
        score,
      };
    })
    .filter(result => result.score > 0 || !!input.referenceRole)
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence)
    .slice(0, topK)
    .map(({ score: _score, ...result }) => result);
}
