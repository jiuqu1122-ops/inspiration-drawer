import type { AiImageTag, InspirationProfile } from './types';

export type InspirationAnalysisFailure = {
  attemptedAt: number;
  attempts: number;
  message: string;
};

export const AUTO_INSPIRATION_ANALYSIS_MAX_ATTEMPTS = 3;
export const INSPIRATION_ANALYSIS_VERSION = 2;
export const INSPIRATION_ANALYSIS_IMAGE_MAX_EDGE = 512;
export const INSPIRATION_ANALYSIS_IMAGE_TARGET_BYTES = 360 * 1024;

export function buildInspirationAnalysisRequest(input: {
  itemId: string;
  imageSource: string;
  userTags: string[];
  userNotes: string[];
  existingProfile?: InspirationProfile;
}) {
  return {
    itemId: input.itemId,
    imageSource: input.imageSource,
    userTags: input.userTags,
    userNotes: input.userNotes,
    existingProfile: input.existingProfile,
  };
}

export function getInspirationAnalysisSourceCandidates(input: {
  explicitSource?: string;
  generatedThumbnail?: string;
  path?: string;
  url?: string;
  sourceUrl?: string;
  originalUrl?: string;
  storedThumbnail?: string;
}) {
  return Array.from(new Set([
    input.explicitSource,
    input.generatedThumbnail,
    input.path,
    input.url,
    input.sourceUrl,
    input.originalUrl,
    input.storedThumbnail,
  ].map(value => String(value || '').trim()).filter(Boolean)));
}

const AUTO_INSPIRATION_ANALYSIS_RETRY_DELAYS_MS = [12_000, 45_000];

export function hasUsableInspirationAiTags(
  profile?: Pick<InspirationProfile, 'aiTags' | 'analysisVersion'> | null,
) {
  return Boolean(
    (Array.isArray(profile?.aiTags)
      && profile.aiTags.some(tag => String(tag?.name || '').trim().length > 0))
    || Number(profile?.analysisVersion || 0) >= INSPIRATION_ANALYSIS_VERSION,
  );
}

export function requeueInspirationAnalysisItemAfterRestart<T extends {
  type?: string;
  inspirationProfile?: InspirationProfile;
  inspirationAnalysisFailure?: InspirationAnalysisFailure;
}>(item: T): T {
  if (
    item.type !== 'image'
    || hasUsableInspirationAiTags(item.inspirationProfile)
    || !item.inspirationAnalysisFailure
  ) return item;
  const { inspirationAnalysisFailure: _failure, ...requeuedItem } = item;
  return requeuedItem as T;
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

const normalizeListEntry = (value: unknown): string => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entry = value as Record<string, unknown>;
    const label = String(entry.name ?? entry.label ?? entry.title ?? '').trim();
    const color = String(entry.hex ?? entry.color ?? entry.value ?? '').trim();
    if (label && color && label.toLocaleLowerCase() !== color.toLocaleLowerCase()) return `${label} ${color}`;
    return label || color;
  }

  const text = String(value || '').trim();
  return /^\[object\s.+\]$/i.test(text) ? '' : text;
};

const normalizeSemanticKey = (value: string) => value
  .toLocaleLowerCase()
  .replace(/[\s\-_/·、，,。.（）()[\]【】]+/g, '')
  .replace(/(?:颜色|色彩|色调|材质|材料|表面|工艺|造型|形态|风格)$/g, '');

export const getInspirationColorFamilyKey = (value: unknown) => {
  const label = normalizeListEntry(value).toLocaleLowerCase();
  if (!label) return '';
  if (/玫瑰金|rose\s*gold/.test(label)) return 'rose-gold';
  if (/香槟金|champagne\s*gold/.test(label)) return 'champagne-gold';
  if (/半透明|translucent/.test(label)) return 'translucent';
  if (/透明|clear|transparent/.test(label)) return 'transparent';
  if (/炭黑|碳黑|黑|black|graphite/.test(label)) return 'black';
  if (/银|silver/.test(label)) return 'silver';
  if (/深灰|dark\s*gr[ae]y/.test(label)) return 'dark-gray';
  if (/浅灰|light\s*gr[ae]y/.test(label)) return 'light-gray';
  if (/暖灰|warm\s*gr[ae]y/.test(label)) return 'warm-gray';
  if (/灰|gr[ae]y/.test(label)) return 'gray';
  if (/粉|pink|blush/.test(label)) return 'pink';
  if (/暖白|乳白|象牙|米白|warm\s*white|ivory|off[- ]?white/.test(label)) return 'warm-white';
  if (/白|white/.test(label)) return 'white';
  if (/红|red|crimson/.test(label)) return 'red';
  if (/橙|orange/.test(label)) return 'orange';
  if (/黄|yellow/.test(label)) return 'yellow';
  if (/绿|green/.test(label)) return 'green';
  if (/青|cyan|teal/.test(label)) return 'cyan';
  if (/蓝|blue/.test(label)) return 'blue';
  if (/紫|purple|violet|lavender|lilac/.test(label)) return 'purple';
  if (/棕|褐|咖啡|brown/.test(label)) return 'brown';
  if (/米色|beige|cream/.test(label)) return 'beige';
  if (/金|gold/.test(label)) return 'gold';
  return normalizeSemanticKey(label);
};

const stringList = (
  value: unknown,
  max = 16,
  keyOf: (value: string) => string = normalizeSemanticKey,
): string[] => {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? [value]
      : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of values) {
    const label = normalizeListEntry(entry).replace(/\s+/g, ' ').trim().slice(0, 48);
    const key = keyOf(label);
    if (!label || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(label);
    if (result.length >= max) break;
  }
  return result;
};

const listValues = (...values: unknown[]): unknown[] => values.flatMap(value => (
  Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? [value]
      : []
));

const record = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const AI_TAG_CATEGORY_SET = new Set([
  '产品类别',
  '风格',
  '材质',
  '色彩',
  '形态',
]);

const AI_TAG_POLICY: Record<string, { threshold: number; limit: number }> = {
  产品类别: { threshold: 0.82, limit: 2 },
  风格: { threshold: 0.84, limit: 2 },
  材质: { threshold: 0.88, limit: 2 },
  色彩: { threshold: 0.84, limit: 4 },
  形态: { threshold: 0.86, limit: 3 },
};

const GENERIC_AI_TAGS = new Set([
  '设计', '产品设计', '工业设计', '产品造型', '造型设计', '视觉设计',
  '产品', '设备', '手持装置', '工业产品', '物体', '对象', '图片', '图像', '参考图', '设计参考',
  '雕塑感',
]);

const aiTagKey = (category: string, name: string) => {
  const semantic = category === '色彩'
    ? getInspirationColorFamilyKey(name)
    : normalizeSemanticKey(name);
  return `${category}:${semantic}`;
};

const normalizeAiTags = (value: unknown): AiImageTag[] => {
  if (!Array.isArray(value)) return [];
  const best = new Map<string, AiImageTag>();
  value.forEach((entry) => {
    const tag = record(entry);
    const name = String(tag.name || '').trim().slice(0, 40);
    const category = String(tag.category || '').trim();
    const rawConfidence = Number(tag.confidence);
    const confidence = Number.isFinite(rawConfidence) ? Math.max(0, Math.min(1, rawConfidence)) : 0;
    const policy = AI_TAG_POLICY[category];
    if (
      !name
      || !AI_TAG_CATEGORY_SET.has(category)
      || !policy
      || confidence < policy.threshold
      || GENERIC_AI_TAGS.has(name)
    ) return;
    const key = aiTagKey(category, name);
    const current = best.get(key);
    if (!current || current.confidence < confidence) best.set(key, { name, category: category as AiImageTag['category'], confidence });
  });
  const categoryCounts = new Map<string, number>();
  return Array.from(best.values())
    .sort((left, right) => right.confidence - left.confidence || left.name.localeCompare(right.name, 'zh-CN'))
    .filter((tag) => {
      const used = categoryCounts.get(tag.category) || 0;
      const limit = AI_TAG_POLICY[tag.category]?.limit || 0;
      if (used >= limit) return false;
      categoryCounts.set(tag.category, used + 1);
      return true;
    })
    .slice(0, 12);
};

export const getReliableInspirationAiTags = (
  profile?: Pick<InspirationProfile, 'aiTags'> | null,
) => normalizeAiTags(profile?.aiTags);

const compactRows = (value: unknown): unknown[] => {
  if (!Array.isArray(value) || value.length === 0) return [];
  return Array.isArray(value[0]) || (value[0] && typeof value[0] === 'object')
    ? value
    : [value];
};

const compactEntryName = (value: unknown) => {
  if (Array.isArray(value)) return normalizeListEntry(value[0]);
  const entry = record(value);
  return normalizeListEntry(entry.n ?? entry.name ?? value);
};

const compactEntryConfidence = (value: unknown, category: AiImageTag['category']) => {
  const raw = Array.isArray(value)
    ? value[category === '色彩' ? 2 : 1]
    : record(value).q ?? record(value).confidence;
  return Number(raw);
};

const compactNames = (value: unknown, max: number) => stringList(
  compactRows(value).map(compactEntryName),
  max,
);

const compactTags = (source: Record<string, unknown>): AiImageTag[] => ([
  ['p', '产品类别'],
  ['c', '色彩'],
  ['f', '形态'],
  ['m', '材质'],
  ['s', '风格'],
] as const).flatMap(([key, category]) => compactRows(source[key]).map(entry => ({
  name: compactEntryName(entry),
  category,
  confidence: compactEntryConfidence(entry, category),
})));

const compactColors = (value: unknown): unknown[] => compactRows(value).map((entry) => {
  const name = compactEntryName(entry);
  const entryRecord = record(entry);
  const hex = Array.isArray(entry)
    ? String(entry[1] || '').trim()
    : String(entryRecord.h ?? entryRecord.hex ?? '').trim();
  return hex ? { name, hex } : name;
});

export function buildInspirationAnalysisPrompt(_input: {
  itemId: string;
  existingProfile?: InspirationProfile;
  userTags?: string[];
  userNotes?: string[];
}) {
  return [
    '仅看主体，严格返回单行JSON，无解释/Markdown；不确定或低于阈值则省略。',
    '只标p品类、c颜色、f造型语言、m材质、s设计风格；禁工艺/交互/场景/视角。',
    '忽略背景/阴影/高光/反射色；透明非颜色；银灰≠金属，高光≠玻璃；禁产品/设备/产品造型/工业设计/雕塑感等泛词。',
    '阈值/上限：p 0.82/2，c 0.84/4，f 0.86/3，m 0.88/2，s 0.84/2。',
    '格式：{"p":[["名",0.9]],"c":[["名","#RRGGBB",0.9]],"f":[["名",0.9]],"m":[["名",0.9]],"s":[["名",0.9]]}；空类=[]；勿输出其他键。',
  ].join('\n');
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
  const isCompactResponse = ['p', 'c', 'f', 'm', 's'].some(key => Object.prototype.hasOwnProperty.call(source, key));
  const compactProductNames = compactNames(source.p, 2);
  const compactFormNames = compactNames(source.f, 3);
  const compactMaterialNames = compactNames(source.m, 2);
  const compactStyleNames = compactNames(source.s, 2);
  const explicitAiTags = source.aiTags ?? source.tags;
  const aiTags = normalizeAiTags(
    explicitAiTags !== undefined
      ? explicitAiTags
      : isCompactResponse
        ? compactTags(source)
        : existing?.aiTags,
  );
  const reportedColors = isCompactResponse
    ? compactColors(source.c)
    : listValues(cmf.colors, source.colors, source.colorPalette, source.palette, source.dominantColors);
  const compactSummary = stringList([
    ...compactProductNames,
    ...compactFormNames,
    ...compactMaterialNames,
    ...compactStyleNames,
  ], 6).join('、');
  const summary = String(
    source.summary
    || source.description
    || compactSummary
    || (!isCompactResponse ? existing?.summary : '')
    || aiTags.map(tag => tag.name).join('、')
    || '已完成视觉分析',
  ).trim();
  return {
    itemId: fallback.itemId,
    summary,
    objects: isCompactResponse
      ? compactProductNames
      : stringList(source.objects ?? existing?.objects, 5),
    category: String(
      isCompactResponse
        ? compactProductNames[0] || ''
        : source.category || existing?.category || '',
    ).trim(),
    form: {
      silhouette: isCompactResponse ? [] : stringList(form.silhouette ?? existing?.form.silhouette, 2),
      geometry: isCompactResponse ? compactFormNames : stringList(form.geometry ?? existing?.form.geometry, 3),
      proportion: isCompactResponse ? [] : stringList(form.proportion ?? existing?.form.proportion, 2),
    },
    cmf: {
      colors: stringList(listValues(
        reportedColors.length > 0 ? reportedColors : existing?.cmf.colors,
      ), 4, getInspirationColorFamilyKey),
      materials: isCompactResponse ? compactMaterialNames : stringList(cmf.materials, 2),
      finishes: [],
    },
    style: isCompactResponse ? compactStyleNames : stringList(source.style ?? existing?.style, 2),
    interaction: [],
    scene: [],
    mood: [],
    userTags: stringList([...(existing?.userTags || []), ...(fallback.userTags || []), ...stringList(source.userTags)]),
    userNotes: stringList([...(existing?.userNotes || []), ...(fallback.userNotes || []), ...stringList(source.userNotes)], 24),
    aiTags,
    analyzedAt: new Date().toISOString(),
    analysisVersion: INSPIRATION_ANALYSIS_VERSION,
  };
}
