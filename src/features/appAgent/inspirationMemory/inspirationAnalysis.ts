import type { InspirationProfile } from './types';

const stringList = (value: unknown, max = 16): string[] => Array.isArray(value)
  ? Array.from(new Set(value.map(item => String(item || '').trim()).filter(Boolean))).slice(0, max)
  : String(value || '').trim() ? [String(value).trim()] : [];

const record = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

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
  const summary = String(source.summary || existing?.summary || '').trim();
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
  };
}

