const CHINESE_NUMBER_VALUES: Record<string, number> = {
  二: 2,
  两: 2,
  三: 3,
  四: 4,
};

export type IndependentImageVariantFallback = {
  sharedRequirements: string;
  variants: Array<{ name: string; prompt: string }>;
};

const clampText = (value: string, maxLength: number) => (
  value.length <= maxLength ? value : `${value.slice(0, maxLength).trim()}…`
);

const cleanMarkdownText = (value: string) => value
  .replace(/^\s{0,3}#{1,6}\s*/g, '')
  .replace(/^\s*[-*+]\s+/g, '')
  .replace(/\*\*|__/g, '')
  .replace(/`+/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const isProviderToolDenial = (value: string) => (
  /(?:没有|不具备).{0,12}(?:图片|图像|生图).{0,12}(?:能力|工具)|无法.{0,12}(?:生成|制作).{0,8}(?:图片|图像)/i.test(value)
);

export const requestedImageVariantCount = (text: string) => {
  const match = text.match(/([二两三四2-4])\s*(?:个|种|款|套|组|幅|张)?\s*(?:方案|方向|版本|款式|设计|风格|配色|材质|造型|形态|外观|场景|情境|环境|空间|视角|机位|镜头|构图|布局|氛围|叙事|概念|效果)/i);
  if (!match) return undefined;
  const parsed = Number(match[1]) || CHINESE_NUMBER_VALUES[match[1]];
  return parsed >= 2 && parsed <= 4 ? parsed : undefined;
};

const numberedVariantEntries = (text: string) => {
  const entries: string[] = [];
  let current = '';
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const match = line.match(/^\s*(?:#{1,6}\s*)?(?:[-*+]\s*)?(?:\*\*)?(?:\d{1,2}|[一二三四])\s*(?:[.、．:：)）]|[-—–]\s+)\s*(.*)$/);
    if (match) {
      if (current.trim()) entries.push(current.trim());
      current = match[1].trim();
    } else if (current && line.trim()) {
      current = `${current} ${line.trim()}`;
    }
  }
  if (current.trim()) entries.push(current.trim());
  return entries.slice(0, 4);
};

const variantFromEntry = (entry: string, index: number) => {
  const cleaned = cleanMarkdownText(entry);
  if (!cleaned) return undefined;
  const named = cleaned.match(/^(.{1,48}?)(?:\s*[：:｜|—–]\s+|\s*[：:]\s*)(.+)$/);
  const name = cleanMarkdownText(named?.[1] || '') || `方案 ${index + 1}`;
  const prompt = cleanMarkdownText(named?.[2] || cleaned);
  if (!prompt) return undefined;
  return {
    name: clampText(name, 48),
    prompt: clampText(prompt, 1_200),
  };
};

const structuredVariants = (text: string, expectedCount?: number) => {
  const variants = numberedVariantEntries(text)
    .map(variantFromEntry)
    .filter((value): value is { name: string; prompt: string } => Boolean(value));
  const count = expectedCount ?? Math.min(variants.length, 4);
  return variants.length >= Math.max(2, count) ? variants.slice(0, count) : [];
};

export const buildIndependentImageVariantFallback = (input: {
  userText: string;
  toolIntentText: string;
  assistantTexts: string[];
}): IndependentImageVariantFallback | undefined => {
  const expectedCount = requestedImageVariantCount(input.userText)
    ?? requestedImageVariantCount(input.toolIntentText);
  const assistantTexts = input.assistantTexts
    .map(value => value.trim())
    .filter(value => (
      Boolean(value)
      && !isProviderToolDenial(value)
    ));
  for (const text of assistantTexts) {
    const variants = structuredVariants(text, expectedCount);
    if (variants.length >= 2) {
      return {
        sharedRequirements: clampText([
          '根据当前对话和参考素材分别生成独立图片。所有方案都要保持同一主体的身份、核心结构、比例和关键视觉特征一致。',
          `用户本次要求：${input.userText}`,
        ].join('\n'), 2_000),
        variants,
      };
    }
  }

  const context = assistantTexts[0];
  if (!context || !expectedCount) return undefined;
  const variants = Array.from({ length: expectedCount }, (_, index) => ({
    name: `方案 ${index + 1}`,
    prompt: `只执行下方候选方向清单中的第 ${index + 1} 个方向，并把该方向转化为一张完整、独立、可直接交付的图片。`,
  }));
  return {
    sharedRequirements: clampText([
      '根据当前对话和参考素材分别生成独立图片。所有方案都要保持同一主体的身份、核心结构、比例和关键视觉特征一致。',
      `用户本次要求：${input.userText}`,
      `候选方向清单：\n${context}`,
    ].join('\n\n'), 4_000),
    variants,
  };
};

export const buildCompositeImageVariantFallback = (input: {
  userText: string;
  toolIntentText: string;
  assistantTexts: string[];
}) => {
  const context = input.assistantTexts
    .map(value => value.trim())
    .find(value => Boolean(value) && !isProviderToolDenial(value));
  return {
    prompt: clampText([
      '生成一张完整图片，在同一个画面中清晰呈现用户要求的多个方案。使用明确的分区、并排或方案板布局，但最终只能输出一张图片，不能拆成多张随机候选。',
      `用户本次要求：${input.userText}`,
      context ? `需要呈现的方案与对话背景：\n${context}` : `完整对话目标：\n${input.toolIntentText}`,
    ].join('\n\n'), 5_000),
    count: 1,
  };
};
