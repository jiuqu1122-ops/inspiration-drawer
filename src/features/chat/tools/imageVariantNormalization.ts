export const IMAGE_VARIANT_MAX_COUNT = 4;

export type ImageVariantSpec = {
  name: string;
  prompt: string;
};

const firstText = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

const cleanText = (value: string) => value
  .replace(/^\s{0,3}#{1,6}\s*/g, '')
  .replace(/^\s*[-*+]\s+/g, '')
  .replace(/\*\*|__/g, '')
  .replace(/`+/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const parseJsonText = (value: string): unknown => {
  const text = value.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  if (!text || !/^[\[{]/.test(text)) return undefined;
  try {
    return JSON.parse(text);
  } catch (_) {
    return undefined;
  }
};

const numberedTextEntries = (value: string) => {
  const entries: string[] = [];
  let current = '';
  for (const line of value.replace(/\r/g, '').split('\n')) {
    const match = line.match(/^\s*(?:#{1,6}\s*)?(?:[-*+]\s*)?(?:\*\*)?(?:\d{1,2}|[一二三四])\s*(?:[.、．:：)）]|[-—–]\s+)\s*(.*)$/);
    if (match) {
      if (current.trim()) entries.push(current.trim());
      current = match[1].trim();
    } else if (current && line.trim()) {
      current = `${current} ${line.trim()}`;
    }
  }
  if (current.trim()) entries.push(current.trim());
  return entries;
};

const variantFromText = (value: string, index: number): ImageVariantSpec | undefined => {
  const promptText = cleanText(value);
  if (!promptText) return undefined;
  const named = promptText.match(/^(.{1,48}?)(?:\s*[：:｜|—–]\s+|\s*[：:]\s*)(.+)$/);
  const name = cleanText(named?.[1] || '') || `方案 ${index + 1}`;
  const prompt = cleanText(named?.[2] || promptText);
  return prompt ? { name: name.slice(0, 48), prompt } : undefined;
};

const listFromValue = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseJsonText(value);
    if (parsed !== undefined) return listFromValue(parsed);
    const numbered = numberedTextEntries(value);
    return numbered.length > 0 ? numbered : value.trim() ? [value] : [];
  }
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  for (const key of ['variants', 'options', 'directions', 'items']) {
    if (key in record) return listFromValue(record[key]);
  }
  const hasVariantFields = ['name', 'title', 'label', 'variantName', 'prompt', 'instruction', 'description', 'content', 'text']
    .some(key => key in record);
  if (hasVariantFields) return [record];
  const mapped = Object.entries(record).flatMap(([name, prompt]) => (
    typeof prompt === 'string' && prompt.trim() ? [{ name, prompt }] : []
  ));
  return mapped;
};

export const normalizeImageVariants = (value: unknown): ImageVariantSpec[] => (
  listFromValue(value).flatMap((entry, index) => {
    if (typeof entry === 'string') {
      const variant = variantFromText(entry, index);
      return variant ? [variant] : [];
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const prompt = firstText(record, ['prompt', 'instruction', 'description', 'content', 'text']);
    if (!prompt) return [];
    const name = firstText(record, ['name', 'title', 'label', 'variantName']) || `方案 ${index + 1}`;
    return [{ name: cleanText(name).slice(0, 48), prompt: cleanText(prompt) }];
  }).filter(variant => variant.name && variant.prompt).slice(0, IMAGE_VARIANT_MAX_COUNT)
);

const withoutVariantOnlyFields = (args: Record<string, unknown>) => {
  const next = { ...args };
  delete next.variants;
  delete next.options;
  delete next.directions;
  delete next.sharedRequirements;
  return next;
};

export const resolveImageVariantToolRoute = (input: {
  args: Record<string, unknown>;
  fallbackVariants?: unknown;
  requireMultiple: boolean;
}): {
  toolName: 'generate_image' | 'generate_image_variants';
  args: Record<string, unknown>;
  variants: ImageVariantSpec[];
} => {
  const sources = [
    input.args.variants,
    input.args.options,
    input.args.directions,
    input.args.prompt,
    ...(input.requireMultiple ? [input.fallbackVariants] : []),
  ];
  const variants = sources
    .map(normalizeImageVariants)
    .sort((left, right) => right.length - left.length)[0] || [];
  if (variants.length !== 1 || input.requireMultiple) {
    const args: Record<string, unknown> = { ...input.args, variants };
    delete args.options;
    delete args.directions;
    if (variants.length >= 2) delete args.prompt;
    return { toolName: 'generate_image_variants', args, variants };
  }

  const [variant] = variants;
  const sharedRequirements = String(input.args.sharedRequirements || '').trim();
  return {
    toolName: 'generate_image',
    args: {
      ...withoutVariantOnlyFields(input.args),
      prompt: [
        sharedRequirements,
        variant.name ? `当前方案：${variant.name}` : '',
        variant.prompt,
      ].filter(Boolean).join('\n\n'),
      count: 1,
    },
    variants,
  };
};
