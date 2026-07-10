export const IMAGE_RULE_KEYS = [
  'product_consistency',
  'structure_credibility',
  'no_structure_drift',
  'brand_feel',
  'atmosphere',
  'premium_lighting',
  'material_quality',
  'depth_of_field',
  'chinese_labels',
  'ecommerce_layout',
  'detail_closeup',
  'scene_storytelling',
  'clean_background',
  'no_random_text',
  'no_fake_specs',
  'no_over_sci_fi',
] as const;

export type ImageRuleKey = typeof IMAGE_RULE_KEYS[number];
export type ImageRuleState = Partial<Record<ImageRuleKey, boolean>>;

export type ImagePolicy = {
  rules?: ImageRuleState;
  defaultPreset?: string;
  panelExpanded?: boolean;
  updatedAt?: number;
};

export type ImageRuleDefinition = {
  key: ImageRuleKey;
  label: string;
  shortLabel: string;
  description: string;
  fragment: string;
  constraint: 'positive' | 'negative';
};

export const IMAGE_RULE_DEFINITIONS: Record<ImageRuleKey, ImageRuleDefinition> = {
  product_consistency: {
    key: 'product_consistency',
    label: '产品一致性',
    shortLabel: '一致性',
    description: '锁定参考产品的轮廓、比例、颜色、材质和关键结构。',
    fragment: '严格保持参考产品轮廓、比例、颜色、材质、关键结构和部件位置一致。',
    constraint: 'positive',
  },
  structure_credibility: {
    key: 'structure_credibility',
    label: '结构可信',
    shortLabel: '结构',
    description: '优先保证结构、装配、功能分区和制造逻辑可信。',
    fragment: '优先保证结构可信度、装配逻辑、功能分区和制造合理性。',
    constraint: 'positive',
  },
  no_structure_drift: {
    key: 'no_structure_drift',
    label: '禁止乱改结构',
    shortLabel: '锁结构',
    description: '有参考图时避免重画、乱改产品结构或新增不存在部件。',
    fragment: '有参考图时，不要重画产品结构，不要改变关键比例、部件位置、装配关系或新增参考图中不存在的结构。',
    constraint: 'negative',
  },
  brand_feel: {
    key: 'brand_feel',
    label: '品牌感',
    shortLabel: '品牌感',
    description: '让画面更克制、统一、干净，避免廉价装饰。',
    fragment: '强化品牌级视觉表达，构图克制、干净、统一，避免廉价装饰和杂乱元素。',
    constraint: 'positive',
  },
  atmosphere: {
    key: 'atmosphere',
    label: '氛围感',
    shortLabel: '氛围感',
    description: '增强空间情绪、光影层次和前中后景关系。',
    fragment: '增强空间氛围、光影层次、前中后景关系和视觉情绪；允许适度景深，但主体保持清晰。',
    constraint: 'positive',
  },
  premium_lighting: {
    key: 'premium_lighting',
    label: '高级打光',
    shortLabel: '打光',
    description: '使用更高级、柔和、有层次的产品摄影光线。',
    fragment: '使用高级产品摄影打光，主光、轮廓光和环境光层次清晰，避免平光、脏光和过曝。',
    constraint: 'positive',
  },
  material_quality: {
    key: 'material_quality',
    label: '材质质感',
    shortLabel: '材质',
    description: '突出材料、表面工艺、纹理、粗糙度和边界。',
    fragment: '突出材料、颜色、表面工艺、粗糙度、纹理和材质边界。',
    constraint: 'positive',
  },
  depth_of_field: {
    key: 'depth_of_field',
    label: '景深虚化',
    shortLabel: '景深',
    description: '允许适度景深，增强真实摄影感，主体仍清晰。',
    fragment: '使用适度景深和真实镜头虚化增强空间层次，主体、关键结构和可读信息保持清晰。',
    constraint: 'positive',
  },
  chinese_labels: {
    key: 'chinese_labels',
    label: '中文标注',
    shortLabel: '中文',
    description: '图中文字以简体中文为主，可保留常见缩写。',
    fragment: '图中文字以简体中文为主，可保留 CMF、LED、UI 等缩写，不要英文替代中文。',
    constraint: 'positive',
  },
  ecommerce_layout: {
    key: 'ecommerce_layout',
    label: '电商排版',
    shortLabel: '电商',
    description: '按电商详情页逻辑构图，预留标题、卖点和说明区域。',
    fragment: '按照电商详情页视觉逻辑构图，预留标题、卖点标签和说明区域。',
    constraint: 'positive',
  },
  detail_closeup: {
    key: 'detail_closeup',
    label: '细节特写',
    shortLabel: '特写',
    description: '聚焦按键、接口、倒角、纹理和连接结构等细节。',
    fragment: '聚焦按键、接口、材质拼接、倒角、纹理、连接结构等局部细节。',
    constraint: 'positive',
  },
  scene_storytelling: {
    key: 'scene_storytelling',
    label: '场景叙事',
    shortLabel: '叙事',
    description: '通过真实环境和动作关系展示用途、尺度和使用方式。',
    fragment: '通过真实使用环境和动作关系展示产品用途、尺度和使用方式。',
    constraint: 'positive',
  },
  clean_background: {
    key: 'clean_background',
    label: '干净背景',
    shortLabel: '背景',
    description: '背景服务主体，减少杂乱道具和干扰信息。',
    fragment: '保持背景干净、层次明确、服务主体，减少杂乱道具、噪点和无关装饰。',
    constraint: 'positive',
  },
  no_random_text: {
    key: 'no_random_text',
    label: '禁止乱加字',
    shortLabel: '禁乱字',
    description: '不要生成未请求的标题、logo、水印、乱码或伪文字。',
    fragment: '不要生成未请求的标题、logo、水印、伪文字、乱码或随机说明。',
    constraint: 'negative',
  },
  no_fake_specs: {
    key: 'no_fake_specs',
    label: '禁止虚构参数',
    shortLabel: '禁参数',
    description: '不要虚构尺寸、功率、认证、检测报告或百分比数据。',
    fragment: '不要生成未提供的尺寸、功率、承重、认证、检测报告或百分比数据。',
    constraint: 'negative',
  },
  no_over_sci_fi: {
    key: 'no_over_sci_fi',
    label: '禁止过度科幻',
    shortLabel: '禁科幻',
    description: '避免不符合产品定位的发光线、机械切线和夸张特效。',
    fragment: '避免过度科幻化、无意义发光线、复杂机械切线和不符合产品定位的夸张特效。',
    constraint: 'negative',
  },
};

export const IMAGE_RULE_PRIMARY_KEYS: ImageRuleKey[] = [
  'atmosphere',
  'brand_feel',
  'material_quality',
  'product_consistency',
  'chinese_labels',
  'ecommerce_layout',
];

export const isImageRuleKey = (value: unknown): value is ImageRuleKey => (
  typeof value === 'string' && (IMAGE_RULE_KEYS as readonly string[]).includes(value)
);

export const normalizeImageRuleState = (value: unknown): ImageRuleState => {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return IMAGE_RULE_KEYS.reduce<ImageRuleState>((next, key) => {
    if (typeof record[key] === 'boolean') next[key] = record[key];
    return next;
  }, {});
};

export const mergeImageRuleStates = (...states: Array<ImageRuleState | undefined | null>): ImageRuleState => (
  states.reduce<ImageRuleState>((next, state) => ({
    ...next,
    ...normalizeImageRuleState(state),
  }), {})
);
