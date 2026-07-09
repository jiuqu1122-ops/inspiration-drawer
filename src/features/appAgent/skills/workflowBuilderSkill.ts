import type { AppAgentSkill, ContextScope } from './types';
import { createSkillMatch, noSkillMatch } from './types';
import { findKeywordHits, matchKeywords, normalizeSkillText, uniqueStrings } from './skillUtils';

export type WorkflowOutputType =
  | 'hero_view'
  | 'storyboard_or_video_key_visual'
  | 'storyboard_or_video_keyframe'
  | 'detail_view'
  | 'cmf_board'
  | 'usage_scene'
  | 'premium_mood';

export type WorkflowFallbackMode = 'workflow' | 'multi-node';
export type WorkflowCreationMode = 'workflow_module' | 'canvas_nodes_fallback';
export type StrategyStepMode = 'auto' | 'enabled' | 'disabled';

export interface WorkflowBuilderIntent {
  workflowIntentDetected: boolean;
  createWorkflow: boolean;
  runWorkflow: boolean;
  explicitWorkflowIntent: boolean;
  multiOutputIntent: boolean;
  workflowCreationMode: WorkflowCreationMode;
  strategyStepMode: StrategyStepMode;
  workflowTemplateId?: 'industrial-design-review';
  outputTypes: WorkflowOutputType[];
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

const INDUSTRIAL_REVIEW_PATTERN = /工业设计评审|设计评审图|评审图|参考产品图|产品参考图|product reference|industrial design review/i;

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
  if (/视频图|视频分镜|分镜图|storyboard|keyframe|key frame|video key/.test(text)) outputTypes.push('storyboard_or_video_key_visual');
  if (/细节图|局部细节|detail|button|interface|material detail|structure detail/.test(text)) outputTypes.push('detail_view');
  if (/cmf|材质|配色|material color finish/.test(text)) outputTypes.push('cmf_board');
  if (/场景图|使用场景|场景渲染|usage scene|real usage|context render/.test(text)) outputTypes.push('usage_scene');
  if (/高级氛围图|氛围图|高级感|premium mood|brand mood|mood render/.test(text)) outputTypes.push('premium_mood');
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
  workflowTemplateId?: 'industrial-design-review';
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
  const hasMultiOutputIntent = outputTypes.length >= 2 && /(包括|包含|一套|整套|批量|多张|多个|multi)/i.test(normalized);
  const isIndustrialReview = INDUSTRIAL_REVIEW_PATTERN.test(userText)
    || (/工业设计|产品|product|industrial/.test(normalized) && outputTypes.length >= 2);
  const createWorkflow = !runWorkflow && (createReasons.length > 0 || hasMultiOutputIntent || explicitWorkflowIntent);
  const workflowTemplateId = createWorkflow && isIndustrialReview ? 'industrial-design-review' : undefined;
  const workflowCreationMode = getWorkflowCreationMode(userText);
  const strategyStepMode = getStrategyStepMode({
    userText,
    outputTypes,
    workflowCreationMode,
    workflowTemplateId,
  });
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
    reasons: uniqueStrings([
      ...keywordHits.map(hit => `keyword:${hit}`),
      ...createReasons,
      ...(explicitWorkflowIntent ? ['explicit workflow intent'] : []),
      ...(hasMultiOutputIntent ? ['multi-output intent'] : []),
      ...(workflowCreationMode === 'canvas_nodes_fallback' ? ['canvas nodes fallback mode'] : ['workflow module mode']),
      ...(strategyStepMode !== 'disabled' ? [`strategy step ${strategyStepMode}`] : ['strategy step disabled']),
      ...(isIndustrialReview ? ['industrial design review intent'] : []),
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
        intent.workflowTemplateId === 'industrial-design-review' ? 0.94 : 0.86,
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
    'Do not add a strategy/text-agent step by default. Only add it when the user explicitly asks to analyze the product first or asks for a strategy-first workflow.',
    'Supported deterministic intents: create_workflow, create_workflow_nodes, create_industrial_design_review_workflow, and run_workflow.',
    'Use canvas_apply_workflow for existing workflows and canvas_create_workflow only when the user asks for reusable or multi-stage workflows.',
    'Workflow steps must be compact, non-empty and connected by inputStepIds when later steps depend on earlier ones.',
    'For product detail-page workflows, pass compact intent and steps; the app can compile the local DAG.',
  ].join('\n'),
};
