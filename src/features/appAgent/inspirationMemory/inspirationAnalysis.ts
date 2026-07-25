import type { AiImageTag, InspirationProfile } from './types';

export type InspirationAnalysisFailure = {
  attemptedAt: number;
  attempts: number;
  message: string;
};

export const AUTO_INSPIRATION_ANALYSIS_MAX_ATTEMPTS = 3;

const AUTO_INSPIRATION_ANALYSIS_RETRY_DELAYS_MS = [12_000, 45_000];

export function hasUsableInspirationAiTags(
  profile?: Pick<InspirationProfile, 'aiTags'> | null,
) {
  return Boolean(
    Array.isArray(profile?.aiTags)
    && profile.aiTags.some(tag => String(tag?.name || '').trim().length > 0),
  );
}

export function isPermanentInspirationAnalysisFailure(message: string) {
  const normalized = String(message || '').trim();
  return /图片素材没有可读取的图像来源|图片无法转换为 LLM 可读取的来源|参考图不是可用图片|image decode failed|invalid image(?: data)?|unsupported image|empty image|file not found|ENOENT|系统找不到指定的文件/i.test(normalized);
}

export function isRetryableInspirationAnalysisFailure(
  failure?: InspirationAnalysisFailure | null,
) {
  return Boolean(
    failure
    && failure.attempts < AUTO_INSPIRATION_ANALYSIS_MAX_ATTEMPTS
    && !isPermanentInspirationAnalysisFailure(failure.message),
  );
}

export function getInspirationAnalysisRetryAt(failure: InspirationAnalysisFailure) {
  const delayIndex = Math.max(0, Math.min(
    AUTO_INSPIRATION_ANALYSIS_RETRY_DELAYS_MS.length - 1,
    failure.attempts - 1,
  ));
  return failure.attemptedAt + AUTO_INSPIRATION_ANALYSIS_RETRY_DELAYS_MS[delayIndex];
}

export function canRetryInspirationAnalysis(
  failure: InspirationAnalysisFailure | undefined | null,
  now = Date.now(),
) {
  return Boolean(
    failure
    && isRetryableInspirationAnalysisFailure(failure)
    && now >= getInspirationAnalysisRetryAt(failure),
  );
}

export function shouldSkipInspirationAnalysis(failure?: InspirationAnalysisFailure | null) {
  return Boolean(
    failure
    && (
      failure.attempts >= AUTO_INSPIRATION_ANALYSIS_MAX_ATTEMPTS
      || isPermanentInspirationAnalysisFailure(failure.message)
    ),
  );
}

const stringList = (value: unknown, max = 16): string[] => Array.isArray(value)
  ? Array.from(new Set(value.map(item => String(item || '').trim()).filter(Boolean))).slice(0, max)
  : String(value || '').trim() ? [String(value).trim()] : [];

const record = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const AI_TAG_CATEGORY_SET = new Set([
  '产品类别',
  '设计领域',
  '风格',
  '材质',
  '色彩',
  '形态',
  '场景',
  '视角',
]);

const normalizeAiTags = (value: unknown): AiImageTag[] => {
  if (!Array.isArray(value)) return [];
  const best = new Map<string, AiImageTag>();
  value.forEach((entry) => {
    const tag = record(entry);
    const name = String(tag.name || '').trim().slice(0, 40);
    const category = String(tag.category || '').trim();
    const rawConfidence = Number(tag.confidence);
    const confidence = Number.isFinite(rawConfidence) ? Math.max(0, Math.min(1, rawConfidence)) : 0;
    if (!name || !AI_TAG_CATEGORY_SET.has(category) || confidence < 0.65) return;
    const key = `${category}:${name.toLocaleLowerCase()}`;
    const current = best.get(key);
    if (!current || current.confidence < confidence) best.set(key, { name, category: category as AiImageTag['category'], confidence });
  });
  return Array.from(best.values())
    .sort((left, right) => right.confidence - left.confidence || left.name.localeCompare(right.name, 'zh-CN'))
    .slice(0, 16);
};

export function buildInspirationAnalysisPrompt(input: {
  itemId: string;
  existingProfile?: InspirationProfile;
  userTags?: string[];
  userNotes?: string[];
}) {
  return [
    'Analyze the attached inspiration image for future product-design retrieval.',
    'Return one JSON object only. Do not use markdown fences or commentary.',
    'Describe only visually supported facts. Keep uncertain fields empty instead of guessing.',
    'Explain what design aspects this image is useful for through concrete structured features.',
    `itemId: ${JSON.stringify(input.itemId)}`,
    `userTags: ${JSON.stringify(input.userTags || [])}`,
    `userNotes: ${JSON.stringify(input.userNotes || [])}`,
    input.existingProfile ? `existingProfile: ${JSON.stringify(input.existingProfile)}` : '',
    'Required schema:',
    JSON.stringify({
      itemId: input.itemId,
      summary: 'concise visual summary and why it is useful as inspiration',
      objects: ['visible objects/product types'],
      category: 'primary design category',
      form: { silhouette: [''], geometry: [''], proportion: [''] },
      cmf: { colors: [''], materials: [''], finishes: [''] },
      style: ['style descriptors'],
      interaction: ['visible controls, affordances, feedback or use patterns'],
      scene: ['usage/environment context'],
      mood: ['mood descriptors'],
      userTags: input.userTags || [],
      userNotes: input.userNotes || [],
    }),
  ].filter(Boolean).join('\n');
}

export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('LLM 没有返回分析结果');
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(unfenced);
  } catch (_) {
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(unfenced.slice(start, end + 1));
    throw new Error('LLM 返回的 InspirationProfile 不是有效 JSON');
  }
}

export function normalizeInspirationProfile(
  value: unknown,
  fallback: {
    itemId: string;
    existingProfile?: InspirationProfile;
    userTags?: string[];
    userNotes?: string[];
  },
): InspirationProfile {
  const source = record(value);
  const existing = fallback.existingProfile;
  const form = record(source.form);
  const cmf = record(source.cmf);
  const aiTags = normalizeAiTags(source.aiTags ?? source.tags ?? existing?.aiTags);
  const summary = String(source.summary || source.description || existing?.summary || aiTags.map(tag => tag.name).join('、')).trim();
  if (!summary) throw new Error('LLM 返回的 InspirationProfile 缺少 summary');
  return {
    itemId: fallback.itemId,
    summary,
    objects: stringList(source.objects ?? existing?.objects),
    category: String(source.category || existing?.category || '').trim(),
    form: {
      silhouette: stringList(form.silhouette ?? existing?.form.silhouette),
      geometry: stringList(form.geometry ?? existing?.form.geometry),
      proportion: stringList(form.proportion ?? existing?.form.proportion),
    },
    cmf: {
      colors: stringList(cmf.colors ?? existing?.cmf.colors),
      materials: stringList(cmf.materials ?? existing?.cmf.materials),
      finishes: stringList(cmf.finishes ?? existing?.cmf.finishes),
    },
    style: stringList(source.style ?? existing?.style),
    interaction: stringList(source.interaction ?? existing?.interaction),
    scene: stringList(source.scene ?? existing?.scene),
    mood: stringList(source.mood ?? existing?.mood),
    userTags: stringList([...(existing?.userTags || []), ...(fallback.userTags || []), ...stringList(source.userTags)]),
    userNotes: stringList([...(existing?.userNotes || []), ...(fallback.userNotes || []), ...stringList(source.userNotes)], 24),
    aiTags,
    analyzedAt: typeof source.analyzedAt === 'string' ? source.analyzedAt : existing?.analyzedAt,
    analysisVersion: typeof source.analysisVersion === 'number' ? source.analysisVersion : existing?.analysisVersion,
  };
}
