import {
  type ImageRuleKey,
  type ImageRuleState,
  mergeImageRuleStates,
  normalizeImageRuleState,
} from './imageRuleCapsules';

export type ImageRuleDefaultContext = {
  hasReferenceImage?: boolean;
  presetId?: string | null;
  presetLabel?: string | null;
  outputRole?: string | null;
  workflowTemplateId?: string | null;
  qualityProfileId?: string | null;
  prompt?: string | null;
};

const stateFromKeys = (keys: ImageRuleKey[]): ImageRuleState => (
  Object.fromEntries(keys.map(key => [key, true])) as ImageRuleState
);

export const PRODUCT_IMAGE_GENERATOR_DEFAULT_RULES = stateFromKeys([
  'product_consistency',
  'structure_credibility',
  'no_random_text',
]);

export const REFERENCE_IMAGE_DEFAULT_RULES = stateFromKeys([
  'no_structure_drift',
]);

export const HERO_MAIN_VISUAL_RECOMMENDED_RULES = stateFromKeys([
  'brand_feel',
  'atmosphere',
  'premium_lighting',
  'clean_background',
]);

export const CMF_BOARD_RECOMMENDED_RULES = stateFromKeys([
  'material_quality',
  'chinese_labels',
  'product_consistency',
  'no_random_text',
]);

export const DETAIL_VIEW_RECOMMENDED_RULES = stateFromKeys([
  'detail_closeup',
  'material_quality',
  'structure_credibility',
  'product_consistency',
]);

export const USAGE_SCENE_RECOMMENDED_RULES = stateFromKeys([
  'scene_storytelling',
  'atmosphere',
  'depth_of_field',
  'product_consistency',
]);

export const ECOMMERCE_DETAIL_PAGE_RECOMMENDED_RULES = stateFromKeys([
  'ecommerce_layout',
  'chinese_labels',
  'brand_feel',
  'product_consistency',
  'no_random_text',
]);

export const DEFAULT_ENABLED_IMAGE_RULES = mergeImageRuleStates(
  PRODUCT_IMAGE_GENERATOR_DEFAULT_RULES,
);

export const getDefaultEnabledImageRules = (context: ImageRuleDefaultContext = {}): ImageRuleState => (
  mergeImageRuleStates(
    DEFAULT_ENABLED_IMAGE_RULES,
    context.hasReferenceImage ? REFERENCE_IMAGE_DEFAULT_RULES : undefined,
  )
);

const contextText = (context: ImageRuleDefaultContext) => [
  context.presetId,
  context.presetLabel,
  context.outputRole,
  context.workflowTemplateId,
  context.qualityProfileId,
  context.prompt,
].filter(Boolean).join('\n').toLowerCase();

export const inferImageRulePresetId = (context: ImageRuleDefaultContext = {}) => {
  const text = contextText(context);
  if (/ecommerce|detail[-_\s]?page|商品详情|电商详情|详情页|master_page|page_\d+|selling[_\s-]?point/.test(text)) {
    return 'ecommerce_detail_page';
  }
  if (/cmf|material|材质|色板|配色|工艺/.test(text)) return 'cmf_board';
  if (/detail|macro|close[-_\s]?up|局部|细节|特写|接口|按键|倒角/.test(text)) return 'detail_view';
  if (/usage|scene|lifestyle|context|使用|生活方式|场景|安装|步骤/.test(text)) return 'usage_scene';
  if (/hero|main|key[_\s-]?visual|premium[_\s-]?mood|主视觉|首图|海报|氛围/.test(text)) return 'hero_main_visual';
  return 'product_image_generator';
};

export const getDefaultImageRuleState = (context: ImageRuleDefaultContext = {}): ImageRuleState => {
  return getDefaultEnabledImageRules(context);
};

export const getRecommendedImageRuleState = (context: ImageRuleDefaultContext = {}): ImageRuleState => {
  const presetId = inferImageRulePresetId(context);
  return presetId === 'ecommerce_detail_page'
    ? ECOMMERCE_DETAIL_PAGE_RECOMMENDED_RULES
    : presetId === 'cmf_board'
      ? CMF_BOARD_RECOMMENDED_RULES
      : presetId === 'detail_view'
        ? DETAIL_VIEW_RECOMMENDED_RULES
        : presetId === 'usage_scene'
          ? USAGE_SCENE_RECOMMENDED_RULES
          : presetId === 'hero_main_visual'
            ? HERO_MAIN_VISUAL_RECOMMENDED_RULES
            : {};
};

export const resolveImageRuleState = (
  explicitRules?: ImageRuleState | null,
  context: ImageRuleDefaultContext = {},
): ImageRuleState => mergeImageRuleStates(
  getDefaultImageRuleState(context),
  normalizeImageRuleState(explicitRules),
);
