import type { BufferItem } from '../../../types';
import type {
  DrawerInspirationMatch,
  DrawerSearchInspirationsInput,
  InspirationProfile,
  InspirationReferenceRole,
} from './types';

const ROLE_TERMS: Record<InspirationReferenceRole, string[]> = {
  FORM_REF: ['form', 'shape', 'silhouette', 'geometry', 'proportion', '造型', '轮廓', '几何', '比例', '圆润', '方正'],
  CMF_REF: ['cmf', 'color', 'material', 'finish', '颜色', '配色', '材质', '表面', '磨砂', '金属', '塑料'],
  STRUCTURE_REF: ['structure', 'mechanism', 'assembly', '结构', '机构', '分件', '接口', '开孔', '连接'],
  INTERACTION_REF: ['interaction', 'control', 'button', 'display', '交互', '操作', '按键', '旋钮', '屏幕', '反馈'],
  MOOD_REF: ['mood', 'scene', 'lifestyle', '氛围', '场景', '生活方式', '温暖', '复古', '科技'],
  SUBJECT_REF: ['subject', 'product', 'identity', '主体', '产品', '一致性', '品类', '结构保持'],
};

const normalize = (value: unknown) => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const compact = (value: unknown, max = 120) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
};
const values = (value: unknown): string[] => Array.isArray(value)
  ? value.map(item => compact(item)).filter(Boolean)
  : compact(value) ? [compact(value)] : [];

export function createFallbackInspirationProfile(item: BufferItem): InspirationProfile {
  const notes = [...values(item.remark), ...values(item.remarks)];
  return {
    itemId: item.id,
    summary: compact(item.content || item.name || '未分析灵感素材'),
    objects: values(item.name),
    category: compact(item.type),
    form: {
      silhouette: [],
      geometry: [],
      proportion: [],
    },
    cmf: {
      colors: [],
      materials: [],
      finishes: [],
    },
    style: [],
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

const profileFeatures = (profile: InspirationProfile) => ({
  FORM_REF: [...profile.form.silhouette, ...profile.form.geometry, ...profile.form.proportion, ...profile.style],
  CMF_REF: [...profile.cmf.colors, ...profile.cmf.materials, ...profile.cmf.finishes, ...profile.style],
  STRUCTURE_REF: [...profile.objects, ...profile.form.geometry, ...profile.interaction, profile.category],
  INTERACTION_REF: [...profile.interaction, ...profile.objects, ...profile.scene],
  MOOD_REF: [...profile.mood, ...profile.scene, ...profile.style, ...profile.cmf.colors],
  SUBJECT_REF: [...profile.objects, profile.category, profile.summary, ...profile.form.silhouette],
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
  const queryTokens = Array.from(new Set(normalize(`${input.query} ${briefText}`).split(' ').filter(token => token.length > 1)));
  const folderIds = new Set((input.folderIds || []).filter(Boolean));
  const topK = Math.max(1, Math.min(20, Math.round(input.topK || 6)));

  return items
    .filter(item => item.type === 'image')
    .filter(item => folderIds.size === 0 || (!!item.folderId && folderIds.has(item.folderId)))
    .map(item => {
      const profile = getInspirationProfile(item);
      const byRole = profileFeatures(profile);
      const roleScores = Object.fromEntries((Object.keys(byRole) as InspirationReferenceRole[]).map(role => {
        const featureText = normalize(byRole[role].join(' '));
        const lexical = queryTokens.filter(token => featureText.includes(token)).length;
        return [role, lexical];
      })) as Record<InspirationReferenceRole, number>;
      const recommendedRole = inferRole(`${input.query} ${briefText}`, roleScores, input.referenceRole);
      const allText = normalize([
        item.name,
        item.content,
        profile.summary,
        profile.category,
        ...profile.userTags,
        ...profile.userNotes,
        ...Object.values(byRole).flat(),
      ].join(' '));
      const matchedTokens = queryTokens.filter(token => allText.includes(token));
      const roleFeatures = byRole[recommendedRole].filter(feature => {
        const normalizedFeature = normalize(feature);
        return queryTokens.some(token => normalizedFeature.includes(token) || token.includes(normalizedFeature));
      });
      const matchedFeatures = Array.from(new Set([...roleFeatures, ...matchedTokens])).slice(0, 6);
      const metadataBonus = item.inspirationProfile ? 2 : 0;
      const score = matchedTokens.length + roleScores[recommendedRole] * 1.5 + metadataBonus;
      const confidence = Math.max(0.18, Math.min(0.98, 0.3 + score * 0.08));
      const featureReason = matchedFeatures.length > 0 ? matchedFeatures.slice(0, 3).join('、') : profile.summary;
      return {
        itemId: item.id,
        reason: `${featureReason || item.name || '该素材'}与项目需求相关，建议作为 ${recommendedRole}。`,
        matchedFeatures,
        recommendedRole,
        confidence: Number(confidence.toFixed(2)),
        score,
      };
    })
    .filter(result => result.score > 0 || !!input.referenceRole)
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence)
    .slice(0, topK)
    .map(({ score: _score, ...result }) => result);
}
