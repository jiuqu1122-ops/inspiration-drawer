import {
  IMAGE_RULE_DEFINITIONS,
  type ImageRuleKey,
  type ImageRuleState,
  normalizeImageRuleState,
} from './imageRuleCapsules';

export type ImageRulePromptNodeType = {
  mediaType?: 'image' | 'video';
  hasReferenceImage?: boolean;
  nodeRole?: string | null;
};

export type ImageRulePromptFragments = {
  positive: string[];
  negative: string[];
};

export type FinalImagePromptOptions = {
  userPrompt?: string | null;
  presetPrompt?: string | null;
  textInputs?: string[];
  qualityProfile?: string | null;
  rules?: ImageRuleState | null;
  nodeType?: ImageRulePromptNodeType | string | null;
};

export type FinalImagePrompt = {
  prompt: string;
  positivePrompt: string;
  negativeConstraints: string[];
  ruleFragments: ImageRulePromptFragments;
};

const PRIORITY_REFERENCE_RULES: ImageRuleKey[] = [
  'product_consistency',
  'no_structure_drift',
];

const compactTextParts = (parts: Array<string | null | undefined>) => (
  parts.map(part => String(part || '').trim()).filter(Boolean)
);

const normalizeNodeType = (nodeType?: ImageRulePromptNodeType | string | null): ImageRulePromptNodeType => (
  typeof nodeType === 'string'
    ? { nodeRole: nodeType }
    : nodeType || {}
);

const getOrderedRuleKeys = (rules: ImageRuleState, nodeType: ImageRulePromptNodeType): ImageRuleKey[] => {
  const enabledKeys = Object.entries(normalizeImageRuleState(rules))
    .filter(([, enabled]) => enabled)
    .map(([key]) => key as ImageRuleKey);
  if (!nodeType.hasReferenceImage) return enabledKeys;
  const priority = PRIORITY_REFERENCE_RULES.filter(key => enabledKeys.includes(key));
  return [...priority, ...enabledKeys.filter(key => !priority.includes(key))];
};

export const buildRulePromptFragments = (
  rules: ImageRuleState | null | undefined,
  nodeType?: ImageRulePromptNodeType | string | null,
): ImageRulePromptFragments => {
  const normalizedNodeType = normalizeNodeType(nodeType);
  if (normalizedNodeType.mediaType === 'video') return { positive: [], negative: [] };

  const positive: string[] = [];
  const negative: string[] = [];
  getOrderedRuleKeys(normalizeImageRuleState(rules), normalizedNodeType).forEach(key => {
    const definition = IMAGE_RULE_DEFINITIONS[key];
    if (!definition) return;
    if (definition.constraint === 'negative') negative.push(definition.fragment);
    else positive.push(definition.fragment);
  });
  return { positive, negative };
};

export const buildFinalImagePrompt = (options: FinalImagePromptOptions): FinalImagePrompt => {
  const ruleFragments = buildRulePromptFragments(options.rules, options.nodeType);
  const baseParts = compactTextParts([
    ...(options.textInputs || []),
    options.presetPrompt,
    options.userPrompt,
    options.qualityProfile,
  ]);
  const positiveRuleBlock = ruleFragments.positive.length > 0
    ? `Image quality rules:\n${ruleFragments.positive.map(fragment => `- ${fragment}`).join('\n')}`
    : '';
  const negativeRuleBlock = ruleFragments.negative.length > 0
    ? `Negative constraints:\n${ruleFragments.negative.map(fragment => `- ${fragment}`).join('\n')}`
    : '';
  const prompt = compactTextParts([
    ...baseParts,
    positiveRuleBlock,
    negativeRuleBlock,
  ]).join('\n\n');

  return {
    prompt,
    positivePrompt: compactTextParts([...baseParts, positiveRuleBlock]).join('\n\n'),
    negativeConstraints: ruleFragments.negative,
    ruleFragments,
  };
};
