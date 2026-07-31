import type { AppAgentSkill, ContextScope } from './types';
import { createSkillMatch, noSkillMatch } from './types';
import { findKeywordHits, matchKeywords, normalizeSkillText, uniqueStrings } from './skillUtils';

export type WorkflowTemplateId =
  | 'industrial-design-review'
  | 'product-detail-page'
  | 'product-render-suite'
  | 'social-poster-suite'
  | 'video-storyboard-suite'
  | 'custom-workflow';

export type WorkflowOutputType =
  | 'hero_view'
  | 'storyboard_or_video_key_visual'
  | 'storyboard_or_video_keyframe'
  | 'detail_view'
  | 'cmf_board'
  | 'usage_scene'
  | 'premium_mood'
  | 'exploded_view';

export type WorkflowFallbackMode = 'workflow' | 'multi-node';
export type WorkflowCreationMode = 'workflow_module' | 'canvas_nodes_fallback';
export type StrategyStepMode = 'auto' | 'enabled' | 'disabled';
export type WorkflowModelFamily = 'nano' | 'image2';

export interface WorkflowGenerationSettings {
  aspectRatio?: string;
  targetSize?: string;
  resolution?: '1K' | '2K' | '4K' | '1080p';
  provider?: 'xais-chat' | 'new-api';
  model?: string;
  modelFamily?: WorkflowModelFamily;
  explicitModel: boolean;
  highQuality: boolean;
  reasons: string[];
}

export interface WorkflowBuilderIntent {
  workflowIntentDetected: boolean;
  createWorkflow: boolean;
  runWorkflow: boolean;
  explicitWorkflowIntent: boolean;
  multiOutputIntent: boolean;
  workflowCreationMode: WorkflowCreationMode;
  strategyStepMode: StrategyStepMode;
  workflowTemplateId?: WorkflowTemplateId;
  outputTypes: WorkflowOutputType[];
  generationSettings: WorkflowGenerationSettings;
  reasons: string[];
}

const WORKFLOW_KEYWORDS = [
  '工作流',
  'workflow',
  '自动化流程',
  '可复用',
  '封装',
  '模板',
  '复用',
  '多阶段',
  '详情页五图',
  '详情页',
  '电商详情页',
  '商品详情页',
  '主图',
  '卖点图',
  '功能图',
  '参数图',
  '长图',
  '产品一致性',
  '一套流程',
  '自动生成一套',
  '生成一整套',
  '一套工业设计评审图',
  '批量生成',
  '多节点流程',
] as const;

const WORKFLOW_CREATE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /设计.*工作流|创建.*工作流|搭.*workflow|build.*workflow|create.*workflow/i, reason: 'create workflow wording' },
  { pattern: /自动生成一套|生成一整套|一整套|一套工业设计评审图/i, reason: 'suite generation wording' },
  { pattern: /批量生成(?:多张|一批|多个)?图|多节点流程|multi[-\s]?node/i, reason: 'multi-output workflow wording' },
  { pattern: /包括.+[、,，].+|包含.+[、,，].+/i, reason: 'listed output types' },
];

const WORKFLOW_RUN_PATTERN = /运行.*(?:workflow|工作流)|执行.*(?:workflow|工作流)|run.*workflow/i;
const EXPLICIT_WORKFLOW_PATTERN = /工作流|workflow|自动化流程|可复用|复用|封装|模板/i;
const CANVAS_NODES_FALLBACK_PATTERN = /不要封装|不封装|直接在画布|画布上.*搭|展开节点|散开节点|canvas nodes fallback|forceCanvasNodesFallback/i;
const STRATEGY_ENABLED_PATTERN = /先分析|先做分析|分析产品|先做策略|先出策略|前置分析|先做设计评审|先提炼设计语言|先分析产品设计语言|analy[sz]e first|analy[sz]e product|product analysis|strategy first/i;
const STRATEGY_DISABLED_PATTERN = /不需要分析|不要文字节点|不要分析|直接出图|直接生成这些图|直接生成|skip strategy|no strategy/i;

// 工业设计评审：必须出现明确的评审/审查/ID review关键词
// 不能只凭"产品图"或"参考图"就判断
const INDUSTRIAL_REVIEW_PATTERN = /工业设计评审|设计评审图|ID\s*review|产品设计评审|CMF\s*评审|结构评审|设计方案评审|industrial design review/i;

// 详情页路由
const PRODUCT_DETAIL_PAGE_PATTERN = /详情页|电商详情|商品详情|详情页图片|做一套详情页|生成详情页|主图卖点图|主图.*卖点图|卖点图|功能图|参数图|长图|商品图组|listing\s*images|amazon\s*(?:images|listing)|亚马逊\s*listing|淘宝详情|小红书(?:详情图|商品图)/i;

// 视频分镜路由
const VIDEO_STORYBOARD_PATTERN = /视频分镜|动画分镜|动效分镜|storyboard|animation\s*storyboard|分镜图|视频脚本图|动画脚本图|关键帧图/i;

const isImage2DefaultWorkflowTemplate = (templateId?: string) => (
  templateId === 'product-detail-page'
  || templateId === 'ecommerce-detail-page'
  || templateId === 'video-storyboard-suite'
);

const toWorkflowModelToken = (value?: string | null) => (
  String(value || '').trim().replace(/[^a-z0-9]+/gi, '').toLowerCase()
);

export const resolveWorkflowModel = (input: {
  modelFamily: WorkflowModelFamily;
  resolution?: WorkflowGenerationSettings['resolution'];
  highQuality?: boolean;
  text?: string;
}) => {
  const resolution = input.resolution || (input.modelFamily === 'image2' ? '1K' : '2K');
  const text = input.text || '';
  const modelToken = toWorkflowModelToken(text);
  if (input.modelFamily === 'image2') {
    const wantsHighQuality = input.highQuality || /(?:img2|image2)(?:2k|4k)(?:h|hq|high|highquality)/i.test(modelToken);
    if (resolution === '4K') return wantsHighQuality ? 'Xais Img2_4K(高画质)' : 'Xais Img2_4K';
    if (resolution === '2K') return wantsHighQuality ? 'Xais Img2_2K(高画质)' : 'Xais Img2_2K';
    return 'gpt-image-2';
  }

  if (/lite|轻量|极速/i.test(text) || /nanobananalite|nanolite|nanolite1k/i.test(modelToken) || resolution === '1K') return 'Xais Nano Pro_2K';
  const useNano2 = /nano\s*2|nano2|banana\s*2|香蕉\s*2/i.test(text)
    || /nanobanana2|nano2|xaisnano2/i.test(modelToken);
  if (useNano2) return resolution === '4K' ? 'Xais Nano2_4K' : 'Xais Nano2_2K';
  return resolution === '4K' ? 'Xais Nano Pro_4K' : 'Xais Nano Pro_2K';
};

export function parseWorkflowGenerationSettings(
  userText: string,
  options: { templateId?: WorkflowTemplateId | string } = {},
): WorkflowGenerationSettings {
  const text = userText.trim();
  const lower = normalizeSkillText(text);
  const reasons: string[] = [];
  const settings: WorkflowGenerationSettings = {
    explicitModel: false,
    highQuality: /高画质|高质量|hq|high\s*quality/i.test(text),
    reasons,
  };

  const pixelSize = /(?:^|[^\w])(\d{3,5})\s*(?:x|\*|×)\s*(\d{3,5})(?:[^\w]|$)/i.exec(text);
  if (pixelSize) {
    settings.targetSize = `${pixelSize[1]}x${pixelSize[2]}`;
    reasons.push(`targetSize:${settings.targetSize}`);
  }

  const ratio = /(?:^|[^\d])([1-9]\d?)\s*(?::|：|比)\s*([1-9]\d?)(?:[^\d]|$)/.exec(text);
  if (ratio) {
    settings.aspectRatio = `${ratio[1]}:${ratio[2]}`;
    reasons.push(`aspectRatio:${settings.aspectRatio}`);
  } else if (/(竖版|portrait|vertical|手机|story|reels|shorts)/i.test(text)) {
    settings.aspectRatio = '9:16';
    reasons.push('aspectRatio:portrait');
  } else if (/(横版|landscape|horizontal|banner|宽屏)/i.test(text)) {
    settings.aspectRatio = '16:9';
    reasons.push('aspectRatio:landscape');
  } else if (/(方图|square|instagram feed|小红书)/i.test(text)) {
    settings.aspectRatio = '1:1';
    reasons.push('aspectRatio:square');
  } else if (/海报/i.test(text)) {
    settings.aspectRatio = '3:4';
    reasons.push('aspectRatio:poster');
  }

  if (/\b4\s*k\b|4K|超高清|超清/i.test(lower)) {
    settings.resolution = '4K';
    reasons.push('resolution:4K');
  } else if (/\b2\s*k\b|2K/i.test(lower)) {
    settings.resolution = '2K';
    reasons.push('resolution:2K');
  } else if (/\b1\s*k\b|1K/i.test(lower)) {
    settings.resolution = '1K';
    reasons.push('resolution:1K');
  } else if (/\b1080p\b|full\s*hd/i.test(lower)) {
    settings.resolution = '1080p';
    reasons.push('resolution:1080p');
  }

  const modelMentions: Array<{ index: number; family: WorkflowModelFamily; reason: string }> = [];
  const image2Match = /image[\s_-]*2|img[\s_-]*2|image2|img2|图像\s*2/i.exec(text);
  if (image2Match?.index !== undefined) {
    modelMentions.push({ index: image2Match.index, family: 'image2', reason: 'explicit:image2' });
  }
  const nanoMatch = /nano|banana|香蕉|纳米/i.exec(text);
  if (nanoMatch?.index !== undefined) {
    modelMentions.push({ index: nanoMatch.index, family: 'nano', reason: 'explicit:nano' });
  }

  if (modelMentions.length > 0) {
    const selected = modelMentions.sort((a, b) => a.index - b.index)[modelMentions.length - 1];
    settings.modelFamily = selected.family;
    settings.explicitModel = true;
    reasons.push(selected.reason);
  } else {
    settings.modelFamily = isImage2DefaultWorkflowTemplate(options.templateId) ? 'image2' : 'nano';
    reasons.push(`default:${settings.modelFamily}`);
  }

  settings.model = resolveWorkflowModel({
    modelFamily: settings.modelFamily,
    resolution: settings.resolution,
    highQuality: settings.highQuality,
    text,
  });
  settings.provider = settings.model === 'gpt-image-2' ? 'new-api' : 'xais-chat';
  reasons.push(`model:${settings.model}`);

  return settings;
}

/**
 * 检测用户 workflow 请求应走哪个模板。
 * 规则从严到宽：先精确 templateId，找不到再走 custom。
 */
export function detectWorkflowTemplate(userText: string): WorkflowTemplateId {
  if (INDUSTRIAL_REVIEW_PATTERN.test(userText)) return 'industrial-design-review';
  if (PRODUCT_DETAIL_PAGE_PATTERN.test(userText)) return 'product-detail-page';
  if (VIDEO_STORYBOARD_PATTERN.test(userText)) return 'video-storyboard-suite';
  // 主图 / 场景图 / 细节图组合但不含详情页/评审 → 通用渲染套
  const hasRenderSuiteKeywords = /产品效果图|渲染图组|场景图.*细节图|细节图.*场景图/i.test(userText);
  if (hasRenderSuiteKeywords) return 'product-render-suite';
  return 'custom-workflow';
}

export const INDUSTRIAL_DESIGN_REVIEW_BASE_OUTPUT_TYPES: WorkflowOutputType[] = [
  'hero_view',
  'detail_view',
  'cmf_board',
  'usage_scene',
  'premium_mood',
];

export function parseWorkflowOutputTypes(userText: string): WorkflowOutputType[] {
  const text = normalizeSkillText(userText);
  const outputTypes: WorkflowOutputType[] = [];
  if (/主视觉|主图|hero|key visual|产品评审|评审图|效果图/.test(text)) outputTypes.push('hero_view');
  if (/视频图|视频分镜|动画分镜|动效分镜|分镜图|storyboard|animation storyboard|keyframe|key frame|video key/.test(text)) outputTypes.push('storyboard_or_video_key_visual');
  if (/细节图|局部细节|detail|button|interface|material detail|structure detail/.test(text)) outputTypes.push('detail_view');
  if (/cmf|材质|配色|material color finish/.test(text)) outputTypes.push('cmf_board');
  if (/场景图|使用场景|场景渲染|usage scene|real usage|context render/.test(text)) outputTypes.push('usage_scene');
  if (/高级氛围图|氛围图|高级感|premium mood|brand mood|mood render/.test(text)) outputTypes.push('premium_mood');
  if (/爆炸图|爆炸结构图|分解图|exploded view|exploded structure/.test(text)) outputTypes.push('exploded_view');
  return uniqueStrings(outputTypes);
}

export function getIndustrialDesignReviewOutputTypes(
  intent: Pick<WorkflowBuilderIntent, 'outputTypes'>,
): WorkflowOutputType[] {
  const hasStoryboard = intent.outputTypes.includes('storyboard_or_video_key_visual')
    || intent.outputTypes.includes('storyboard_or_video_keyframe');
  return uniqueStrings([
    ...INDUSTRIAL_DESIGN_REVIEW_BASE_OUTPUT_TYPES,
    ...(hasStoryboard ? ['storyboard_or_video_key_visual' as const] : []),
  ]);
}

export function getWorkflowCreationMode(userText: string): WorkflowCreationMode {
  if (CANVAS_NODES_FALLBACK_PATTERN.test(userText)) return 'canvas_nodes_fallback';
  if (EXPLICIT_WORKFLOW_PATTERN.test(userText)) return 'workflow_module';
  return 'canvas_nodes_fallback';
}

export function getStrategyStepMode(input: {
  userText: string;
  outputTypes: WorkflowOutputType[];
  workflowCreationMode: WorkflowCreationMode;
  workflowTemplateId?: WorkflowTemplateId;
}): StrategyStepMode {
  if (STRATEGY_DISABLED_PATTERN.test(input.userText)) return 'disabled';
  if (STRATEGY_ENABLED_PATTERN.test(input.userText)) return 'enabled';
  return 'disabled';
}

export function parseWorkflowBuilderIntent(userText: string): WorkflowBuilderIntent {
  const normalized = normalizeSkillText(userText);
  const keywordHits = findKeywordHits(userText, WORKFLOW_KEYWORDS);
  const createReasons = WORKFLOW_CREATE_PATTERNS
    .filter(item => item.pattern.test(userText))
    .map(item => item.reason);
  const runWorkflow = WORKFLOW_RUN_PATTERN.test(userText);
  const outputTypes = parseWorkflowOutputTypes(userText);
  const explicitWorkflowIntent = EXPLICIT_WORKFLOW_PATTERN.test(userText);
  const detectedTemplateId = detectWorkflowTemplate(userText);
  const detailPageIntent = detectedTemplateId === 'product-detail-page';
  const hasMultiOutputIntent = outputTypes.length >= 2 && /(包括|包含|一套|整套|批量|多张|多个|multi)/i.test(normalized);
  const createWorkflow = !runWorkflow && (createReasons.length > 0 || hasMultiOutputIntent || explicitWorkflowIntent || detailPageIntent);
  // Use strict template detection — "参考产品图" alone no longer triggers industrial-design-review
  const templateId: WorkflowTemplateId = createWorkflow ? detectedTemplateId : 'custom-workflow';
  const workflowTemplateId: WorkflowTemplateId | undefined =
    templateId !== 'custom-workflow' ? templateId : undefined;
  const workflowCreationMode = getWorkflowCreationMode(userText);
  const strategyStepMode = getStrategyStepMode({
    userText,
    outputTypes,
    workflowCreationMode,
    workflowTemplateId,
  });
  const generationSettings = parseWorkflowGenerationSettings(userText, { templateId });
  const workflowIntentDetected = runWorkflow || createWorkflow || keywordHits.length > 0;
  return {
    workflowIntentDetected,
    createWorkflow,
    runWorkflow,
    explicitWorkflowIntent,
    multiOutputIntent: hasMultiOutputIntent,
    workflowCreationMode,
    strategyStepMode,
    workflowTemplateId,
    outputTypes,
    generationSettings,
    reasons: uniqueStrings([
      ...keywordHits.map(hit => `keyword:${hit}`),
      ...createReasons,
      ...generationSettings.reasons,
      ...(explicitWorkflowIntent ? ['explicit workflow intent'] : []),
      ...(hasMultiOutputIntent ? ['multi-output intent'] : []),
      ...(workflowCreationMode === 'canvas_nodes_fallback' ? ['canvas nodes fallback mode'] : ['workflow module mode']),
      ...(strategyStepMode !== 'disabled' ? [`strategy step ${strategyStepMode}`] : ['strategy step disabled']),
      ...(templateId === 'industrial-design-review' ? ['industrial design review intent'] : [`template:${templateId}`]),
      ...(runWorkflow ? ['run workflow wording'] : []),
    ]),
  };
}

export const workflowBuilderSkill: AppAgentSkill = {
  id: 'workflow-builder-skill',
  label: 'Workflow Builder',
  description: '可复用工作流、多阶段生成链路和产品一致性流程。',
  match: input => {
    const intent = parseWorkflowBuilderIntent(input.userText);
    if (intent.createWorkflow) {
      return createSkillMatch(
        intent.workflowTemplateId === 'industrial-design-review'
          ? 0.94
          : intent.workflowTemplateId === 'product-detail-page'
          ? 0.9
          : 0.86,
        intent.reasons,
      );
    }
    if (intent.runWorkflow) return createSkillMatch(0.82, intent.reasons);
    const keywordMatch = matchKeywords(input.userText, WORKFLOW_KEYWORDS);
    return keywordMatch.matched ? keywordMatch : noSkillMatch();
  },
  getRequiredContext: (): ContextScope[] => ['canvas'],
  buildPromptPatch: () => [
    'Active skill: workflow-builder-skill.',
    'Create workflow intent includes: 设计一个工作流, 创建一个工作流, 搭一个 workflow, 自动生成一套, 批量生成多张图, 多节点流程, 生成一整套, or a list of multiple output types.',
    'Intent priority: workflow intent > multi-output intent > storyboard/video intent > CMF intent > single image generation.',
    'Explicit workflow/module/template/reusable wording must create a workflow module; only use canvas_nodes_fallback for multi-output without explicit workflow wording or when the user asks to expand nodes on canvas.',
    'Workflow creation has priority over single CMF/image intent. If the user asks for a workflow or a suite of outputs, do not collapse it into one generator.',
    'Industrial design review workflow must include a reference_image_bridge step id product_reference_image that accepts external image inputs and fans out directly to all image generators.',
    'Detail-page requests route to ecommerce-detail-page/product-detail-page draft and must not default to industrial-design-review.',
    'When creating or editing workflow drafts, preserve user generation settings: aspect ratio, target size, clarity/resolution (1K/2K/4K/1080p), provider and model. Default detail-page and storyboard/animation-storyboard workflows to Image2 when no model is requested; default all other workflows to Nano.',
    'Do not add a strategy/text-agent step by default. Only add it when the user explicitly asks to analyze the product first or asks for a strategy-first workflow.',
    'When an industrial-design workflow explicitly includes requirement breakdown, inspiration analysis, strategy, review, or delivery writing, preserve each stage as a text_agent with designAgentConfig and connect it through inputStepIds. Do not collapse the stages into one prompt.',
    'Use image_generator nodes only for visual concept execution; Design Agent text nodes own design reasoning and text artifacts.',
    'Supported deterministic intents: create_workflow, create_workflow_nodes, create_industrial_design_review_workflow, and run_workflow.',
    'Use canvas_apply_workflow for existing workflows and canvas_create_workflow only when the user asks for reusable or multi-stage workflows.',
    'For a local-first end-to-end industrial design request, apply workflow industrial-design-full-process and pass the user\'s exact original request in projectBrief. Its runtime performs metadata-only local inspiration retrieval; do not call drawer analysis, external search, or the web collector before applying it.',
    'Workflow steps must be compact, non-empty and connected by inputStepIds when later steps depend on earlier ones.',
    'For product detail-page workflows, pass compact intent and steps; the app can compile the local DAG.',
  ].join('\n'),
};
