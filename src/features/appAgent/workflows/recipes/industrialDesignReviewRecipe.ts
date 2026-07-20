import type { WorkflowRecipeDraft, WorkflowOutputSpec, WorkflowTextPolicy } from '../workflowRecipeTypes';

const createId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Default Chinese-first language policy */
export const DEFAULT_ZH_LANGUAGE_POLICY: WorkflowTextPolicy = {
  promptLanguage: 'zh-CN',
  visibleTextLanguage: 'zh-CN',
  imageTextLanguage: 'zh-CN',
  allowEnglishTechnicalTerms: true,
};

export const DEFAULT_EN_LANGUAGE_POLICY: WorkflowTextPolicy = {
  promptLanguage: 'en',
  visibleTextLanguage: 'en',
  imageTextLanguage: 'en',
  allowEnglishTechnicalTerms: true,
};

const CHINESE_IMAGE_TEXT_NOTE = '可见文字、标题、标注、CMF 标签默认使用简体中文；可保留 CMF、LED、UI 等行业缩写。不要默认生成全英文说明、乱码、伪文字或空白文本框。';

const INDUSTRIAL_REVIEW_REFERENCE_LOCK_NOTE = `参考一致性：
- product_reference_image 是最高优先级 SUBJECT_REF，必须保持产品外轮廓、比例、关键结构、按键/接口/开孔、分件线、主色、材质和功能布局一致。
- 只执行当前节点目标，不重新设计产品，不新增参考图不存在的结构、配件、屏幕、按钮、接口、品牌 logo、认证章或具体参数。
- 视觉系统必须产品自适应：先判断产品品类、CMF、主色、材质、使用场景、目标用户和价格带，再决定背景、光影、版式密度、图形语言和标注样式；不要套用固定浅灰蓝、固定黑科技、固定圆角卡片或同一套高级感模板。
- 输出前自检：主体清晰，结构不漂移，材质可信，光影稳定，背景不抢主体。`;

const buildIndustrialReviewOutputPrompt = (...sections: string[]) => [
  ...sections,
  INDUSTRIAL_REVIEW_REFERENCE_LOCK_NOTE,
  CHINESE_IMAGE_TEXT_NOTE,
].join('\n\n');

export const INDUSTRIAL_REVIEW_DEFAULT_OUTPUTS: WorkflowOutputSpec[] = [
  {
    id: 'hero_view',
    title: '产品主视觉',
    type: 'image_generator',
    enabled: true,
    order: 1,
    aspectRatio: '16:9',
    prompt: buildIndustrialReviewOutputPrompt(
      '生成产品主视觉图，作为整套工业设计评审图组的视觉基准。',
      '画面要求：产品完整展示，轮廓清晰，构图稳重，材质和结构可读；背景、台面/空间、色温、光比和图形语言必须从产品气质推导，可深可浅可暖可冷。',
      '质量目标：像设计评审中的主效果图，而不是普通商品图；主体占比合理，关键结构不被裁切、不被景深遮挡。',
    ),
    inputRoles: ['product_reference_image'],
    requiresReferenceImages: true,
    editable: true,
  },
  {
    id: 'detail_view',
    title: '细节图',
    type: 'image_generator',
    enabled: true,
    order: 2,
    aspectRatio: '16:9',
    prompt: buildIndustrialReviewOutputPrompt(
      '生成局部细节图，放大展示一个真实存在且最能体现品质或功能的产品细节。',
      '可聚焦：按键、接口、倒角、转轴、分件线、材质交界、纹理、握持区、灯带或开孔。',
      '质量目标：微距产品摄影质感，关键区域清晰锐利，边缘高光干净，细节能从参考图追溯，不虚构内部结构。',
    ),
    inputRoles: ['product_reference_image'],
    requiresReferenceImages: true,
    editable: true,
  },
  {
    id: 'cmf_board',
    title: 'CMF分析图',
    type: 'image_generator',
    enabled: true,
    order: 3,
    aspectRatio: '16:9',
    prompt: buildIndustrialReviewOutputPrompt(
      '生成一张中文标注的 CMF 分析图，说明材料、颜色、表面工艺、触感、功能分区和结构关系。',
      '版式要求：像为该产品定制的设计评审板，主体产品清晰，旁边可放 3-5 个克制的材质/颜色/工艺信息模块；模块形态、底色、分隔方式和图标风格跟随产品视觉系统。',
      '内容边界：不要虚构具体认证、检测数据、承重、功率、防水等级或品牌授权；未知信息用保守表达。',
    ),
    inputRoles: ['product_reference_image'],
    requiresReferenceImages: true,
    editable: true,
  },
  {
    id: 'usage_scene',
    title: '使用场景图',
    type: 'image_generator',
    enabled: true,
    order: 4,
    aspectRatio: '16:9',
    prompt: buildIndustrialReviewOutputPrompt(
      '生成真实使用情境图，展示产品在可信环境中的尺度、交互方式和使用价值。',
      '场景要求：根据产品类型选择居家、办公、厨房、浴室、户外、运动或专业工作环境；人物/手/道具只作为辅助，不遮挡产品核心结构。',
      '质量目标：产品与环境接触可信，有真实阴影、正确透视和自然光线；画面生活化但不杂乱。',
    ),
    inputRoles: ['product_reference_image'],
    requiresReferenceImages: true,
    editable: true,
  },
  {
    id: 'premium_mood',
    title: '高级氛围图',
    type: 'image_generator',
    enabled: true,
    order: 5,
    aspectRatio: '16:9',
    prompt: buildIndustrialReviewOutputPrompt(
      '生成高级品牌氛围图，用精致光线、克制背景和统一色彩气质提升产品价值感。',
      '视觉要求：产品仍是最大主体；氛围、配色、空间、台面、轮廓光、阴影或抽象图形必须来自产品品类和 CMF 逻辑，不能遮盖产品结构。',
      '质量目标：有该产品自己的品牌感；避免随机装饰、过强科技线、廉价光效、固定浅灰蓝模板和背景喧宾夺主。',
    ),
    inputRoles: ['product_reference_image'],
    requiresReferenceImages: true,
    editable: true,
  },
  {
    id: 'storyboard_key_visual',
    title: '视频分镜图',
    type: 'image_generator',
    enabled: false,
    order: 6,
    aspectRatio: '16:9',
    prompt: buildIndustrialReviewOutputPrompt(
      '生成 16:9 视频分镜图或关键帧板，展示产品广告短片的镜头顺序、主体动作、转场和视觉连贯性。',
      '版式要求：4-6 个清晰分镜或关键帧，镜头有起承转合；每格只表达一个信息，产品结构和 CMF 在所有格中一致。',
      '质量目标：像可执行的商业视频预演，不是随机拼图；可用简短中文说明栏，但不要长段文字、乱码或英文替代中文。',
    ),
    inputRoles: ['product_reference_image'],
    requiresReferenceImages: true,
    editable: true,
  },
];

/**
 * Detect whether the user's input language is primarily Chinese.
 * Defaults to Chinese if the input contains any CJK characters.
 */
export function detectUserLanguagePolicy(userText: string): WorkflowTextPolicy {
  const hasChinese = /[一-鿿㐀-䶿]/.test(userText);
  const hasBilingual = /bilingual|双语/.test(userText);
  if (hasBilingual) {
    return {
      promptLanguage: 'bilingual',
      visibleTextLanguage: 'bilingual',
      imageTextLanguage: 'bilingual',
      allowEnglishTechnicalTerms: true,
    };
  }
  return hasChinese ? DEFAULT_ZH_LANGUAGE_POLICY : DEFAULT_EN_LANGUAGE_POLICY;
}

/**
 * Build the default WorkflowRecipeDraft for industrial design review.
 * All outputs are editable=true and use Chinese-first prompts by default.
 */
export function buildIndustrialDesignReviewDraft(input: {
  originalRequest: string;
  strategyEnabled: boolean;
  outputIds?: string[];
  languagePolicy?: WorkflowTextPolicy;
}): WorkflowRecipeDraft {
  const languagePolicy = input.languagePolicy ?? detectUserLanguagePolicy(input.originalRequest);

  const enabledOutputIds = new Set(
    input.outputIds?.length
      ? input.outputIds
      : INDUSTRIAL_REVIEW_DEFAULT_OUTPUTS.filter(o => o.enabled).map(o => o.id),
  );

  const outputs = INDUSTRIAL_REVIEW_DEFAULT_OUTPUTS.map(spec => ({
    ...spec,
    enabled: enabledOutputIds.has(spec.id),
  }));

  const strategyPrompt = [
    '工业设计评审策略',
    '请先判断产品类型、使用方式、目标场景、造型重点、CMF 边界、结构可信度和主要设计风险。',
    '策略要服务后续图像节点：统一产品身份、视觉调性、光线方向和材质表达；不要写成泛泛而谈的营销文案。',
    `原始请求："${input.originalRequest}"`,
  ].join('\n');

  return {
    id: createId('workflow-draft'),
    name: '工业设计评审工作流',
    description: '根据参考产品图自动生成工业设计评审图组',
    templateId: 'industrial-design-review',
    languagePolicy,
    inputs: [
      {
        id: 'product_reference_image',
        label: '参考产品图',
        type: 'image',
        required: true,
      },
    ],
    strategy: {
      enabled: input.strategyEnabled,
      mode: input.strategyEnabled ? 'enabled' : 'disabled',
      title: '工业设计评审策略',
      prompt: strategyPrompt,
      designAgentConfig: {
        agentRole: 'design_strategist',
        outputArtifactType: 'DesignStrategy',
        thinkingMode: 'analysis',
      },
    },
    outputs,
    metadata: {
      originalRequest: input.originalRequest,
      createdBy: 'app-agent',
      editable: true,
    },
  };
}
