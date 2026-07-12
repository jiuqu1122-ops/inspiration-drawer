import type { AgentCanvasContext } from '../../agentModel';
import type { AppAgentPlan, AppAgentCommand } from '../commands/commandTypes';
import type { AgentSkillId, ContextScope, RiskLevel } from '../skills/types';
import {
  buildOriginalRequestLine,
  extractCreativeBrief,
  isDirectCreativeExecutionRequest,
  isExplicitVideoGenerationRequest,
  type CreativeBrief,
} from '../skills/creativeProductDesignSkill';
import {
  getIndustrialDesignReviewOutputTypes,
  parseWorkflowBuilderIntent,
  detectWorkflowTemplate,
  parseWorkflowGenerationSettings,
  resolveWorkflowModel,
  type StrategyStepMode,
  type WorkflowCreationMode,
  type WorkflowGenerationSettings,
  type WorkflowModelFamily,
  type WorkflowOutputType,
} from '../skills/workflowBuilderSkill';
import {
  buildIndustrialDesignReviewDraft,
  detectUserLanguagePolicy,
} from '../workflows/recipes/industrialDesignReviewRecipe';
import {
  buildProductDetailPageDraft,
} from '../workflows/recipes/productDetailPageRecipe';
import type { DetailPageRenderMode, DetailPageSpec } from '../pageLayout/detailPageLayoutTypes';
import { buildDetailPagePrompt } from '../pageLayout/detailPagePromptBuilder';
import type { WorkflowOutputSpec, WorkflowRecipeDraft } from '../workflows/workflowRecipeTypes';
import type { ImagePolicy } from '../imageQuality/imageRuleCapsules';
import { getDefaultImageRuleState } from '../imageQuality/imageRuleDefaults';

const createId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const buildWorkflowOutputImagePolicy = (
  output: Pick<WorkflowOutputSpec, 'id' | 'title' | 'prompt' | 'imagePolicy'>,
  context: {
    hasReferenceImage?: boolean;
    workflowTemplateId?: string;
    qualityProfileId?: string | null;
  } = {},
): ImagePolicy => ({
  ...(output.imagePolicy || {}),
  rules: {
    ...getDefaultImageRuleState({
      hasReferenceImage: context.hasReferenceImage,
      outputRole: output.id,
      presetLabel: output.title,
      workflowTemplateId: context.workflowTemplateId,
      qualityProfileId: context.qualityProfileId,
      prompt: output.prompt,
    }),
    ...(output.imagePolicy?.rules || {}),
  },
});

const maxRisk = (risks: RiskLevel[]): RiskLevel => {
  const order: RiskLevel[] = ['read', 'safe_write', 'external_network', 'costly', 'destructive', 'system_process'];
  return risks.reduce((best, risk) => (
    order.indexOf(risk) > order.indexOf(best) ? risk : best
  ), 'read' as RiskLevel);
};

const command = (
  domain: AppAgentCommand['domain'],
  action: string,
  args: Record<string, unknown>,
  riskLevel: RiskLevel,
  sourceSkillId?: AgentSkillId,
  meta: Pick<AppAgentCommand, 'stepId' | 'createsNode' | 'outputRef'> = {},
): AppAgentCommand => ({
  id: createId('app-agent-command'),
  ...meta,
  domain,
  action,
  args,
  riskLevel,
  sourceSkillId,
  requiresConfirmation: ['costly', 'destructive', 'system_process'].includes(riskLevel),
});

const buildStoryboardTextAgentPrompt = (brief: CreativeBrief) => [
  '视频分镜脚本',
  brief.dimensions.aspectRatio ? `Aspect ratio: ${brief.dimensions.aspectRatio}` : 'Aspect ratio: follow the user request or selected platform.',
  '请先产出可执行的视频分镜脚本，覆盖镜头顺序、单镜头时长、转场方式、主体动作、关键帧和风格一致性。',
  '不要默认直接运行视频生成；如果后续需要创建 video generator，autoRun 必须默认为 false。',
  brief.generatorPrompt,
].join('\n');

const buildProductStrategyTextAgentPrompt = (brief: CreativeBrief) => [
  '产品设计策略',
  '请先产出产品外观/CMF 策略，覆盖产品类型、使用方式、造型重点、CMF 边界、结构可信度和主要设计风险。',
  brief.generatorPrompt,
].join('\n');

const buildWorkflowCreativeContext = (brief: CreativeBrief) => [
  'Task: industrial_design_review_workflow image suite.',
  brief.product.isProductTask
    ? `Product judgement: ${brief.product.category}; usage: ${brief.product.usageMode}; goal: ${brief.product.goal}; stage: ${brief.product.iterationStage}.`
    : '',
  brief.product.isProductTask && brief.product.focus.length
    ? `Design focus: ${brief.product.focus.join(', ')}.`
    : '',
  'Industrial design priorities: silhouette and proportion before decoration; structural credibility before visual tricks; CMF must serve product positioning.',
  'Avoid unrequested generic tech styling, glow lines, carbon fiber, exposed mechanics, excessive cut lines, and decorative noise.',
  brief.imageRoles.length
    ? `Image roles: ${brief.imageRoles.map(role => `${role.imageId}=${role.role}`).join(', ')}.`
    : '',
  `Fidelity level: ${brief.fidelity}. Preserve explicit constraints, spatial relations, camera angle, structure, materials, text and negative prompts.`,
  brief.dimensions.targetSize ? `Target size: ${brief.dimensions.targetSize}.` : '',
  brief.dimensions.aspectRatio ? `Aspect ratio: ${brief.dimensions.aspectRatio}.` : 'Aspect ratio: 16:9.',
  brief.dimensions.resolution ? `Resolution: ${brief.dimensions.resolution}.` : '',
  buildOriginalRequestLine(brief.originalRequest),
].filter(Boolean).join('\n');

const buildIndustrialReviewStrategyPrompt = (brief: CreativeBrief, outputTypes: WorkflowOutputType[]) => [
  '工业设计评审策略',
  'Create the upstream strategy for an Industrial Design Review Workflow.',
  'Cover: product type judgement, usage mode, design risks, CMF boundaries, structural credibility, and unified visual language.',
  `Planned outputs: ${outputTypes.join(', ')}.`,
  'Every downstream generator must keep product identity, proportions, key structures, function layout, material logic, and camera language consistent.',
  buildWorkflowCreativeContext(brief),
].join('\n');

const hasWorkflowGenerationSetting = (settings?: WorkflowGenerationSettings | null) => !!(
  settings
  && (settings.aspectRatio || settings.targetSize || settings.resolution || settings.provider || settings.model)
);

const applyWorkflowGenerationSettingsToOutput = (
  output: WorkflowOutputSpec,
  settings?: WorkflowGenerationSettings | null,
): WorkflowOutputSpec => {
  if (!hasWorkflowGenerationSetting(settings)) return output;
  const aspectRatio = settings?.aspectRatio || output.aspectRatio;
  const nextPageSpec = output.pageSpec && aspectRatio
    ? {
        ...output.pageSpec,
        layout: {
          ...output.pageSpec.layout,
          aspectRatio,
        },
      }
    : output.pageSpec;
  return {
    ...output,
    aspectRatio,
    targetSize: settings?.targetSize ?? output.targetSize,
    resolution: settings?.resolution ?? output.resolution,
    provider: settings?.provider ?? output.provider,
    model: settings?.model ?? output.model,
    pageSpec: nextPageSpec,
  };
};

const applyWorkflowGenerationSettingsToDraft = (
  draft: WorkflowRecipeDraft,
  settings?: WorkflowGenerationSettings | null,
): WorkflowRecipeDraft => {
  if (!hasWorkflowGenerationSetting(settings)) return draft;
  return {
    ...draft,
    outputs: draft.outputs.map(output => applyWorkflowGenerationSettingsToOutput(output, settings)),
    metadata: {
      ...draft.metadata,
      workflowGenerationSettings: settings,
      ...(settings?.aspectRatio ? { aspectRatio: settings.aspectRatio } : {}),
      ...(settings?.targetSize ? { targetSize: settings.targetSize } : {}),
      ...(settings?.resolution ? { resolution: settings.resolution } : {}),
      ...(settings?.provider ? { provider: settings.provider } : {}),
      ...(settings?.model ? { model: settings.model } : {}),
      ...(settings?.modelFamily ? { modelFamily: settings.modelFamily } : {}),
      explicitModel: settings?.explicitModel,
    },
  };
};

const inferWorkflowModelFamilyFromModel = (model?: string | null): WorkflowModelFamily | null => {
  const value = String(model || '').trim();
  if (!value) return null;
  if (/img\s*2|image\s*2/i.test(value)) return 'image2';
  if (/nano|banana|香蕉|纳米/i.test(value)) return 'nano';
  return null;
};

const inferWorkflowModelFamilyFromDraft = (draft: WorkflowRecipeDraft): WorkflowModelFamily | null => {
  const metadataFamily = typeof draft.metadata.modelFamily === 'string'
    ? draft.metadata.modelFamily
    : '';
  if (metadataFamily === 'image2' || metadataFamily === 'nano') return metadataFamily;
  const outputModel = draft.outputs.find(output => typeof output.model === 'string' && output.model.trim())?.model || null;
  const metadataModel = typeof draft.metadata.model === 'string' ? draft.metadata.model : null;
  return inferWorkflowModelFamilyFromModel(outputModel || metadataModel);
};

/**
 * Map WorkflowOutputType to recipe output ID.
 * The recipe file defines output specs with IDs matching most output types.
 */
const mapOutputTypeToRecipeId = (outputType: WorkflowOutputType): string => {
  if (outputType === 'storyboard_or_video_key_visual' || outputType === 'storyboard_or_video_keyframe') {
    return 'storyboard_key_visual';
  }
  return outputType;
};

const mapOutputTypesToRecipeIds = (outputTypes: WorkflowOutputType[]): Set<string> => {
  return new Set(outputTypes.map(mapOutputTypeToRecipeId));
};

/**
 * Build a WorkflowRecipeDraft from user request.
 * The draft contains editable outputs with Chinese-first prompts (for Chinese users)
 * and enriched with creative brief context.
 */
export function buildWorkflowDraftFromUserRequest(input: {
  userText: string;
  brief: CreativeBrief;
  outputTypes: WorkflowOutputType[];
  strategyStepMode: StrategyStepMode;
}): WorkflowRecipeDraft {
  const languagePolicy = detectUserLanguagePolicy(input.userText);
  const enabledIds = mapOutputTypesToRecipeIds(input.outputTypes);
  const generationSettings = parseWorkflowGenerationSettings(input.userText, {
    templateId: 'industrial-design-review',
  });

  const draft = buildIndustrialDesignReviewDraft({
    originalRequest: input.userText,
    strategyEnabled: input.strategyStepMode === 'enabled',
    outputIds: enabledIds.size > 0 ? Array.from(enabledIds) : undefined,
    languagePolicy,
  });

  const creativeContext = buildWorkflowCreativeContext(input.brief);

  return applyWorkflowGenerationSettingsToDraft({
    ...draft,
    outputs: draft.outputs.map(output => ({
      ...output,
      prompt: [
        output.prompt,
        'Workflow identity anchor: use the selected product reference image(s) as SUBJECT_REF for every output in this suite.',
        '整套图必须保持同一产品身份、比例、关键结构、功能布局、CMF 边界、材质逻辑、光线方向和视觉调性；每个节点只改变自己的表达重点。',
        'Do not turn this node into a standalone generic render. It is one coordinated output inside an industrial design review workflow.',
        'Before final output, check consistency against the other enabled workflow outputs: same product, same design language, no invented parts, no random labels, no fake logo or unsupported parameters.',
        creativeContext,
      ].join('\n'),
    })),
    strategy: draft.strategy
      ? {
          ...draft.strategy,
          prompt: buildIndustrialReviewStrategyPrompt(input.brief, input.outputTypes),
      }
      : undefined,
  }, generationSettings);
}

/**
 * Convert a WorkflowRecipeDraft to IndustrialReviewWorkflowDefinition.
 * The draft stores enriched prompts ready for execution.
 */
export function convertWorkflowDraftToDefinition(
  draft: WorkflowRecipeDraft,
  selectedImageNodeIds: string[],
  originalText: string,
  creationMode: WorkflowCreationMode,
): AppAgentWorkflowDefinition {
  if (draft.templateId === 'ecommerce-detail-page' || draft.templateId === 'product-detail-page') {
    return buildEcommerceDetailPageWorkflowDefinition(draft, selectedImageNodeIds, originalText, creationMode);
  }

  const strategyEnabled = draft.strategy?.enabled ?? false;
  const aspectRatio = draft.outputs[0]?.aspectRatio || '16:9';
  const strategyStepId = 'industrial_design_review_strategy';

  const referenceBridgeStep: IndustrialReviewWorkflowStep = {
    id: 'product_reference_image',
    type: 'reference_image_bridge',
    title: '参考产品图桥接',
    outputRole: 'visual_reference',
    inputStepIds: [],
    acceptsExternalInputs: true,
    externalInputTypes: ['image'],
    outputType: 'image[]',
    bridgeType: 'reference_image',
    required: true,
  };

  const enabledOutputs = draft.outputs.filter(o => o.enabled);

  const generatorSteps = enabledOutputs.map((output): Extract<IndustrialReviewWorkflowStep, { type: 'image_generator' }> => {
    const inputRoles: Record<string, 'visual_reference' | 'text_strategy'> = {
      product_reference_image: 'visual_reference',
    };
    if (strategyEnabled) inputRoles[strategyStepId] = 'text_strategy';

    return {
      id: output.id,
      type: 'image_generator',
      mediaType: 'image',
      title: output.title,
      outputRole: output.id as WorkflowOutputType,
      visualInputStepIds: ['product_reference_image'],
      textInputStepIds: strategyEnabled ? [strategyStepId] : [],
      inputStepIds: strategyEnabled ? ['product_reference_image', strategyStepId] : ['product_reference_image'],
      inputRoles,
      requiresReferenceImages: true,
      optional: output.id === 'storyboard_key_visual',
      prompt: output.prompt,
      aspectRatio: output.aspectRatio || aspectRatio,
      targetSize: output.targetSize || null,
      resolution: output.resolution || null,
      provider: output.provider || null,
      model: output.model || null,
      toolHint: null,
      imagePolicy: buildWorkflowOutputImagePolicy(output, {
        hasReferenceImage: true,
        workflowTemplateId: 'industrial-design-review',
      }),
      skillMeta: {
        skillId: 'creative-product-design-skill,workflow-builder-skill',
        skillIds: ['creative-product-design-skill', 'workflow-builder-skill'],
        workflowTemplateId: 'industrial-design-review',
        workflowOutputType: output.id,
        originalRequest: originalText,
        taskKind: 'industrial_design_review_workflow',
        fidelity: 'L3',
        productCategory: 'product',
        focus: [],
      },
    };
  });

  const strategyStep: IndustrialReviewWorkflowStep | null = strategyEnabled && draft.strategy
    ? {
        id: strategyStepId,
        type: 'text_agent',
        title: draft.strategy.title,
        optional: false,
        inputStepIds: ['product_reference_image'],
        outputRole: 'text_strategy',
        prompt: draft.strategy.prompt,
      }
    : null;

  return {
    id: createId('industrial-design-review-workflow'),
    name: draft.name,
    description: draft.description,
    templateId: 'industrial-design-review',
    creationMode,
    strategyStepMode: draft.strategy?.mode || 'disabled',
    inputs: [{
      id: 'product_reference_image',
      type: 'image',
      required: true,
      label: draft.inputs[0]?.label || '参考产品图',
      bindingState: selectedImageNodeIds.length > 0 ? 'bound' : 'unbound',
    }],
    steps: [
      referenceBridgeStep,
      ...(strategyStep ? [strategyStep] : []),
      ...generatorSteps,
    ],
    metadata: {
      skillId: 'workflow-builder-skill,creative-product-design-skill',
      skillIds: ['workflow-builder-skill', 'creative-product-design-skill'],
      originalRequest: originalText,
      productCategory: 'product',
      outputTypes: enabledOutputs.map(o => o.id as WorkflowOutputType),
      aspectRatio,
      targetSize: enabledOutputs.find(output => output.targetSize)?.targetSize || null,
      resolution: enabledOutputs.find(output => output.resolution)?.resolution || null,
      provider: enabledOutputs.find(output => output.provider)?.provider || null,
      model: enabledOutputs.find(output => output.model)?.model || null,
      selectedReferenceImageNodeIds: selectedImageNodeIds,
      workflowCreationMode: creationMode,
      strategyStepMode: draft.strategy?.mode || 'disabled',
      workflowDraft: draft,
      languagePolicy: draft.languagePolicy,
    },
    executionOrder: strategyEnabled
      ? [['product_reference_image'], [strategyStepId], generatorSteps.map(step => step.id)]
      : [['product_reference_image'], generatorSteps.map(step => step.id)],
  };
}

type EcommerceDetailPageWorkflowStep =
  | {
    id: 'product_reference_image';
    type: 'reference_image_bridge';
    title: string;
    outputRole: 'visual_reference';
    inputStepIds: [];
    acceptsExternalInputs: true;
    externalInputTypes: ['image'];
    outputType: 'image[]';
    bridgeType: 'reference_image';
    required: true;
  }
  | {
    id: string;
    type: 'image_generator';
    mediaType: 'image';
    title: string;
    outputRole: string;
    visualInputStepIds: string[];
    textInputStepIds: string[];
    inputStepIds: string[];
    inputRoles: Record<string, 'visual_reference'>;
    requiresReferenceImages: true;
    optional?: boolean;
    prompt: string;
    aspectRatio: string;
    targetSize: string | null;
    resolution: string | null;
    provider?: string | null;
    model?: string | null;
    toolHint: string | null;
    status?: string;
    renderMode?: string;
    pageSpec?: DetailPageSpec;
    skillMeta: Record<string, unknown>;
    imagePolicy?: ImagePolicy;
  };

export interface EcommerceDetailPageWorkflowDefinition {
  id: string;
  name: string;
  description: string;
  templateId: 'ecommerce-detail-page';
  creationMode: WorkflowCreationMode;
  strategyStepMode: 'disabled';
  inputs: Array<{
    id: 'product_reference_image';
    type: 'image';
    required: true;
    label: string;
    bindingState: 'bound' | 'unbound';
  }>;
  steps: EcommerceDetailPageWorkflowStep[];
  metadata: Record<string, unknown>;
  executionOrder: string[][];
}

export type AppAgentWorkflowDefinition = IndustrialReviewWorkflowDefinition | EcommerceDetailPageWorkflowDefinition;

const buildEcommerceDetailPageWorkflowDefinition = (
  draft: WorkflowRecipeDraft,
  selectedImageNodeIds: string[],
  originalText: string,
  creationMode: WorkflowCreationMode,
): EcommerceDetailPageWorkflowDefinition => {
  const referenceBridgeStep: EcommerceDetailPageWorkflowStep = {
    id: 'product_reference_image',
    type: 'reference_image_bridge',
    title: '产品参考图桥接',
    outputRole: 'visual_reference',
    inputStepIds: [],
    acceptsExternalInputs: true,
    externalInputTypes: ['image'],
    outputType: 'image[]',
    bridgeType: 'reference_image',
    required: true,
  };

  const enabledOutputs = draft.outputs.filter(output => output.enabled !== false);
  const generatorSteps = enabledOutputs.map((output): Extract<EcommerceDetailPageWorkflowStep, { type: 'image_generator' }> => {
    const spec = output.pageSpec;
    const isMaster = output.id === 'master_page_image' || spec?.pageIndex === 1;
    const visualInputStepIds = isMaster
      ? ['product_reference_image']
      : Array.from(new Set(['product_reference_image', ...(output.inputRoles.includes('master_page_image') ? ['master_page_image'] : [])]));
    return {
      id: output.id,
      type: 'image_generator',
      mediaType: 'image',
      title: output.title,
      outputRole: output.id,
      visualInputStepIds,
      textInputStepIds: [],
      inputStepIds: visualInputStepIds,
      inputRoles: Object.fromEntries(visualInputStepIds.map(inputId => [inputId, 'visual_reference' as const])),
      requiresReferenceImages: true,
      optional: false,
      prompt: output.prompt,
      aspectRatio: output.aspectRatio || spec?.layout.aspectRatio || '3:4',
      targetSize: output.targetSize || null,
      resolution: output.resolution || null,
      provider: output.provider || null,
      model: output.model || null,
      toolHint: null,
      status: output.status,
      renderMode: output.renderMode || spec?.renderMode,
      pageSpec: spec,
      imagePolicy: buildWorkflowOutputImagePolicy(output, {
        hasReferenceImage: true,
        workflowTemplateId: 'ecommerce-detail-page',
        qualityProfileId: 'ecommerce_detail_page',
      }),
      skillMeta: {
        skillId: 'ecommerce-detail-page-skill,workflow-builder-skill',
        skillIds: ['ecommerce-detail-page-skill', 'workflow-builder-skill'],
        workflowTemplateId: 'ecommerce-detail-page',
        workflowOutputType: output.id,
        originalRequest: originalText,
        taskKind: 'ecommerce_detail_page_workflow',
        renderMode: output.renderMode || spec?.renderMode,
        pageIndex: spec?.pageIndex,
        uniqueSellingPoint: output.uniqueSellingPoint || spec?.uniqueSellingPoint,
        qualityProfileId: 'ecommerce_detail_page',
      },
    };
  });

  const pageIds = generatorSteps.map(step => step.id);
  const masterId = pageIds.includes('master_page_image') ? 'master_page_image' : pageIds[0] || 'master_page_image';
  const laterPageIds = pageIds.filter(id => id !== masterId);
  return {
    id: createId('ecommerce-detail-page-workflow'),
    name: draft.name,
    description: draft.description,
    templateId: 'ecommerce-detail-page',
    creationMode,
    strategyStepMode: 'disabled',
    inputs: [{
      id: 'product_reference_image',
      type: 'image',
      required: true,
      label: draft.inputs.find(input => input.id === 'product_reference_image')?.label || '产品参考图',
      bindingState: selectedImageNodeIds.length > 0 ? 'bound' : 'unbound',
    }],
    steps: [referenceBridgeStep, ...generatorSteps],
    metadata: {
      skillId: 'workflow-builder-skill,ecommerce-detail-page-skill',
      skillIds: ['workflow-builder-skill', 'ecommerce-detail-page-skill'],
      originalRequest: originalText,
      workflowCreationMode: creationMode,
      selectedReferenceImageNodeIds: selectedImageNodeIds,
      workflowDraft: draft,
      languagePolicy: draft.languagePolicy,
      renderMode: enabledOutputs[0]?.renderMode,
      aspectRatio: enabledOutputs.find(output => output.aspectRatio)?.aspectRatio || null,
      targetSize: enabledOutputs.find(output => output.targetSize)?.targetSize || null,
      resolution: enabledOutputs.find(output => output.resolution)?.resolution || null,
      provider: enabledOutputs.find(output => output.provider)?.provider || null,
      model: enabledOutputs.find(output => output.model)?.model || null,
      qualityProfileId: 'ecommerce_detail_page',
      outputTypes: enabledOutputs.map(output => output.id),
      masterPageRequired: true,
    },
    executionOrder: [['product_reference_image'], [masterId], laterPageIds],
  };
};

type IndustrialReviewWorkflowStep =
  | {
    id: 'product_reference_image';
    type: 'reference_image_bridge';
    title: string;
    outputRole: 'visual_reference';
    inputStepIds: [];
    acceptsExternalInputs: true;
    externalInputTypes: ['image'];
    outputType: 'image[]';
    bridgeType: 'reference_image';
    required: true;
  }
  | {
    id: string;
    type: 'text_agent';
    title: string;
    optional?: boolean;
    inputStepIds: string[];
    outputRole: 'text_strategy';
    prompt: string;
  }
  | {
    id: string;
    type: 'image_generator';
    mediaType: 'image';
    title: string;
    outputRole: WorkflowOutputType;
    visualInputStepIds: string[];
    textInputStepIds: string[];
    inputStepIds: string[];
    inputRoles: Record<string, 'visual_reference' | 'text_strategy'>;
    requiresReferenceImages: true;
    optional?: boolean;
    prompt: string;
    aspectRatio: string;
    targetSize: string | null;
    resolution: string | null;
    provider?: string | null;
    model?: string | null;
    toolHint: string | null;
    skillMeta: Record<string, unknown>;
    imagePolicy?: ImagePolicy;
  };

export interface IndustrialReviewWorkflowDefinition {
  id: string;
  name: string;
  description: string;
  templateId: 'industrial-design-review';
  creationMode: WorkflowCreationMode;
  strategyStepMode: StrategyStepMode;
  inputs: Array<{
    id: 'product_reference_image';
    type: 'image';
    required: true;
    label: string;
    bindingState: 'bound' | 'unbound';
  }>;
  steps: IndustrialReviewWorkflowStep[];
  metadata: Record<string, unknown>;
  executionOrder: string[][];
}

export const buildIndustrialReviewWorkflowDefinition = (
  brief: CreativeBrief,
  outputTypes: WorkflowOutputType[],
  selectedImageNodeIds: string[],
  originalText: string,
  creationMode: WorkflowCreationMode,
  strategyStepMode: StrategyStepMode,
): IndustrialReviewWorkflowDefinition => {
  const draft = buildWorkflowDraftFromUserRequest({
    userText: originalText,
    brief,
    outputTypes,
    strategyStepMode,
  });
  const definition = convertWorkflowDraftToDefinition(draft, selectedImageNodeIds, originalText, creationMode) as IndustrialReviewWorkflowDefinition;
  // Preserve brief-specific fields in skillMeta and metadata
  const metadataAspectRatio = typeof definition.metadata.aspectRatio === 'string' ? definition.metadata.aspectRatio : '';
  const metadataTargetSize = typeof definition.metadata.targetSize === 'string' ? definition.metadata.targetSize : '';
  const metadataResolution = typeof definition.metadata.resolution === 'string' ? definition.metadata.resolution : '';
  const aspectRatio = brief.dimensions.aspectRatio || metadataAspectRatio || definition.steps.find(step => step.type === 'image_generator')?.aspectRatio || '16:9';
  const targetSize = brief.dimensions.targetSize || metadataTargetSize || definition.steps.find(step => step.type === 'image_generator')?.targetSize || null;
  const resolution = brief.dimensions.resolution || metadataResolution || definition.steps.find(step => step.type === 'image_generator')?.resolution || null;
  return {
    ...definition,
    steps: definition.steps.map(step => {
      if (step.type !== 'image_generator') return step;
      return {
        ...step,
        aspectRatio,
        targetSize,
        resolution,
        toolHint: brief.toolHint || null,
        skillMeta: {
          ...step.skillMeta,
          fidelity: brief.fidelity,
          productCategory: brief.product.category,
          focus: brief.product.focus,
        },
      };
    }),
    metadata: {
      ...definition.metadata,
      productCategory: brief.product.category,
      aspectRatio,
      targetSize,
      resolution,
      selectedReferenceImageNodeIds: selectedImageNodeIds,
      outputTypes,
    },
  };
};

const buildIndustrialReviewCanvasNodeFallbackCommands = (
  brief: CreativeBrief,
  outputTypes: WorkflowOutputType[],
  selectedImageNodeIds: string[],
  originalText: string,
  strategyStepMode: StrategyStepMode,
) => {
  const commands: AppAgentCommand[] = [];
  const strategyStepId = 'industrialDesignReviewStrategy';
  const strategyOutputRef = `$${strategyStepId}.nodeId`;
  const strategyEnabled = strategyStepMode === 'enabled';
  const plannedNodeRefs = strategyEnabled ? [`$${strategyStepId}.nodeId`] : [];
  const aspectRatio = brief.dimensions.aspectRatio || '16:9';
  const referenceRoles = selectedImageNodeIds.map(nodeId => ({ nodeId, role: 'SUBJECT_REF' as const }));

  if (strategyEnabled) {
    commands.push(command('canvas', 'create_text_agent', {
      prompt: buildIndustrialReviewStrategyPrompt(brief, outputTypes),
      inputIds: selectedImageNodeIds,
      autoRun: false,
    }, 'safe_write', 'workflow-builder-skill', {
      stepId: strategyStepId,
      createsNode: true,
      outputRef: strategyOutputRef,
    }));
  }

  const draft = buildWorkflowDraftFromUserRequest({
    userText: originalText,
    brief,
    outputTypes,
    strategyStepMode,
  });
  const enabledRecipeIds = mapOutputTypesToRecipeIds(outputTypes);
  const enabledOutputs = draft.outputs.filter(o => enabledRecipeIds.has(o.id));

  enabledOutputs.forEach(output => {
    const outputRef = `$${output.id}.nodeId`;
    plannedNodeRefs.push(outputRef);
    commands.push(command('canvas', 'create_generator', {
      mediaType: 'image',
      prompt: output.prompt,
      inputIds: Array.from(new Set([...(strategyEnabled ? [strategyOutputRef] : []), ...selectedImageNodeIds])),
      referenceImageNodeIds: selectedImageNodeIds,
      referenceRoles,
      autoRun: false,
      aspectRatio,
      targetSize: brief.dimensions.targetSize || null,
      resolution: brief.dimensions.resolution || null,
      toolHint: brief.toolHint || null,
      imagePolicy: output.imagePolicy,
      skillMeta: {
        skillId: 'creative-product-design-skill,workflow-builder-skill',
        skillIds: ['creative-product-design-skill', 'workflow-builder-skill'],
        workflowTemplateId: 'industrial-design-review',
        workflowOutputType: output.id,
        originalRequest: originalText,
        taskKind: 'industrial_design_review_workflow',
        fidelity: brief.fidelity,
        productCategory: brief.product.category,
        focus: brief.product.focus,
      },
    }, 'safe_write', 'workflow-builder-skill', {
      stepId: output.id,
      createsNode: true,
      outputRef,
    }));
  });

  commands.push(command('canvas', 'organize', {
    nodeIds: plannedNodeRefs,
  }, 'safe_write', 'workflow-builder-skill'));

  return commands;
};

const buildStoryboardSheetPrompt = (brief: CreativeBrief) => [
  `${brief.dimensions.aspectRatio || '16:9'} 视频分镜图 / Storyboard Sheet`,
  'Generate a 4-6 panel visual storyboard sheet from the connected storyboard script and selected references.',
  'Keep shot order, duration cues, transitions, subject action, key frames, and visual style consistent.',
  brief.generatorPrompt,
].join('\n');

const getSelectedImageNodeIds = (context?: AgentCanvasContext) => {
  const selectedIds = new Set((context?.selectedIds || []).map(String));
  const nodeById = new Map((context?.nodes || []).map(node => [node.id, node]));
  const fromSelectedIds = Array.from(selectedIds).filter(id => {
    const node = nodeById.get(id);
    return !!node && /image|image-generator|generated-image/i.test(node.type || '');
  });
  return Array.from(new Set(fromSelectedIds.filter(Boolean)));
};

const shouldAutoRunVideoGenerator = (text: string) => (
  /直接.*(?:生成|做成|输出|出).*视频|直接生成视频|直接出视频/i.test(text)
);

/**
 * 从用户文本提取明确列出的详情页输出 id。
 * 例如"主图、卖点图、细节图"→ ['hero_banner','selling_points','detail_closeups']
 */
const extractUserSpecifiedDetailOutputIds = (userText: string): string[] => {
  const ids: string[] = [];
  if (/主图|首图|banner|主视觉/.test(userText)) ids.push('hero_banner');
  if (/卖点图|核心卖点|selling/.test(userText)) ids.push('selling_points');
  if (/功能说明|功能图|feature/.test(userText)) ids.push('feature_explanation');
  if (/细节图|特写|细节特写|closeup/.test(userText)) ids.push('detail_closeups');
  if (/场景图|使用场景|scene/.test(userText)) ids.push('usage_scene');
  if (/材质|工艺|cmf/.test(userText)) ids.push('cmf_or_material');
  if (/参数|对比图|spec|comparison/.test(userText)) ids.push('spec_or_comparison');
  return [...new Set(ids)];
};

const CUSTOM_WORKFLOW_OUTPUT_TITLES: Record<string, string> = {
  portfolio_cover: '作品集封面',
  portfolio_overview: '项目总览',
  case_study_detail: '案例细节页',
  final_presentation: '最终展示页',
  brand_key_visual: '品牌主视觉',
  brand_usage_scene: '品牌场景图',
  brand_detail_system: '视觉系统细节',
  concept_overview: '概念总览',
  key_visual: '关键视觉',
  detail_variation: '细节变化',
};

const getDefaultCustomWorkflowOutputIds = (userText: string): string[] => {
  if (/作品集|portfolio/i.test(userText)) {
    return ['portfolio_cover', 'portfolio_overview', 'case_study_detail', 'final_presentation'];
  }
  if (/品牌|brand/i.test(userText)) {
    return ['brand_key_visual', 'brand_usage_scene', 'brand_detail_system', 'final_presentation'];
  }
  return ['concept_overview', 'key_visual', 'detail_variation', 'final_presentation'];
};

// ─── Workflow draft update intent detection ────────────────────────────────

const DRAFT_SAVE_PATTERN = /保存.*工作流|保存草稿|save.*workflow|save.*draft/i;
const DRAFT_RUN_PATTERN = /运行.*工作流|run.*workflow/i;
const DRAFT_STRATEGY_DISABLE_PATTERN = /不要文字节点|不要分析|直接出图|no.*text.*node|skip.*strategy|disable.*strategy/i;
const DRAFT_STRATEGY_ENABLE_PATTERN = /先分析|先做分析|加分析步骤|enable.*strategy|add.*strategy/i;

const DRAFT_OUTPUT_REMOVE_PATTERNS: Array<{ pattern: RegExp; id: string }> = [
  { pattern: /不要.*高级氛围|删除.*高级氛围|去掉.*氛围图|remove.*premium/i, id: 'premium_mood' },
  { pattern: /不要.*场景图|删除.*场景|去掉.*场景/i, id: 'usage_scene' },
  { pattern: /不要.*细节图|删除.*细节|去掉.*细节/i, id: 'detail_view' },
  { pattern: /不要.*CMF|删除.*CMF|去掉.*CMF/i, id: 'cmf_board' },
  { pattern: /不要.*主视|删除.*主视|去掉.*主视/i, id: 'hero_view' },
  { pattern: /不要.*故事板|不要.*分镜|删除.*故事板/i, id: 'storyboard_key_visual' },
];

const DRAFT_OUTPUT_ADD_PATTERNS: Array<{ pattern: RegExp; id: string; title: string }> = [
  { pattern: /加.*爆炸|增加.*爆炸|添加.*爆炸|exploded.*view|add.*exploded/i, id: 'exploded_view', title: '爆炸结构图' },
  { pattern: /加.*故事板|加.*分镜|添加.*分镜/i, id: 'storyboard_key_visual', title: '故事板关键帧' },
];

const DRAFT_LANGUAGE_PATTERNS: Array<{ pattern: RegExp; lang: 'zh-CN' | 'en' | 'bilingual' }> = [
  { pattern: /CMF.*不要英文|CMF.*用中文|CMF.*改成.*中文|cmf.*chinese/i, lang: 'zh-CN' },
  { pattern: /所有.*中文|都用中文|改成中文|全部.*中文/i, lang: 'zh-CN' },
  { pattern: /改成.*英文|用.*英文/i, lang: 'en' },
  { pattern: /中英.*双语|bilingual/i, lang: 'bilingual' },
];

const DRAFT_ASPECT_RATIO_PATTERN = /(?:所有图|所有节点)?.*改成\s*(\d+:\d+)|(?:aspect.?ratio|宽高比)\s*(\d+:\d+)/i;

const isEcommerceDetailPageDraft = (draft: WorkflowRecipeDraft) => (
  draft.templateId === 'ecommerce-detail-page' || draft.templateId === 'product-detail-page'
);

const createDetailPageOutputFromSpec = (
  spec: DetailPageSpec,
  order = spec.pageIndex,
): import('../workflows/workflowRecipeTypes').WorkflowOutputSpec => ({
  id: `page_${String(spec.pageIndex).padStart(2, '0')}_${spec.pageName.replace(/\s*\/\s*/g, '_').replace(/[^\w\u4e00-\u9fa5]+/g, '_').replace(/^_+|_+$/g, '')}`,
  title: `Page ${String(spec.pageIndex).padStart(2, '0')}：${spec.pageName}`,
  type: 'image_generator',
  enabled: true,
  order,
  aspectRatio: spec.layout.aspectRatio,
  prompt: buildDetailPagePrompt(spec),
  inputRoles: ['product_reference_image', 'master_page_image'],
  requiresReferenceImages: true,
  editable: true,
  uniqueSellingPoint: spec.uniqueSellingPoint,
  pageSpec: spec,
  status: 'waiting_for_master',
  imageTextLanguage: 'zh-CN',
  renderMode: spec.renderMode,
});

const buildInstallationDetailPageOutput = (
  draft: WorkflowRecipeDraft,
): import('../workflows/workflowRecipeTypes').WorkflowOutputSpec => {
  const enabledOutputs = draft.outputs.filter(output => output.enabled !== false);
  const nextIndex = Math.max(2, ...enabledOutputs.map(output => output.pageSpec?.pageIndex || output.order || 1)) + 1;
  const anchorOutput = draft.outputs.find(output => output.pageSpec) || draft.outputs[0];
  const renderMode = anchorOutput?.pageSpec?.renderMode || 'model_text_baked';
  const aspectRatio = anchorOutput?.pageSpec?.layout.aspectRatio || anchorOutput?.aspectRatio || '3:4';
  const spec: DetailPageSpec = {
    pageIndex: nextIndex,
    pageName: '安装步骤页',
    uniqueSellingPoint: '用简洁步骤说明安装或上手流程',
    productAnchor: {
      referenceImageNodeIds: [],
      lockedFeatures: ['整体轮廓', '主色和材质', '关键结构位置', '真实安装关系'],
      forbiddenChanges: ['虚构折叠结构', '新增原图不存在配件', '虚构螺丝孔位', '改变产品型号'],
    },
    styleAnchor: {
      masterPageNodeId: 'master_page_image',
      backgroundStyle: '延续主视觉母版的产品专属电商详情页视觉系统，并根据安装/上手主题调整步骤动线和局部特写表现',
      mainColor: '沿用当前产品母版提取的主背景色，不强制浅色',
      auxiliaryColors: ['产品主色提取色', '母版辅助色', '步骤强调色'],
      accentColor: '沿用产品母版中的功能强调色或产品可见强调色，不固定蓝色',
      lighting: '延续母版光影，并让步骤结构和连接区域更清晰',
      iconStyle: '跟随产品母版图标风格的步骤图标',
      closeupFrameStyle: '跟随产品母版卡片/标注风格的步骤框',
      layoutLanguage: '顶部标题区 + 三步流程 + 产品主体',
    },
    layout: {
      aspectRatio,
      productPosition: 'right',
      productAngle: '三分之二视角',
      titleArea: 'top',
      labelArea: 'left',
      closeupCount: 3,
      closeupPosition: 'left',
    },
    copy: renderMode === 'visual_background_only'
      ? { pageNo: `PAGE ${String(nextIndex).padStart(2, '0')}`, title: '', subtitle: '', tags: [] }
      : {
        pageNo: `PAGE ${String(nextIndex).padStart(2, '0')}`,
        title: '安装步骤简单清晰',
        subtitle: '三步上手更省心，安装过程一目了然',
        tags: [
          { text: '步骤清楚', icon: 'steps' },
          { text: '上手省心', icon: 'hand' },
          { text: '结构真实', icon: 'check' },
        ],
        localNotes: ['第一步', '第二步', '完成安装'],
        adaptive: renderMode === 'model_text_baked',
        sourceBrief: String(draft.metadata.originalRequest || ''),
      },
    renderMode,
  };
  const output = createDetailPageOutputFromSpec(spec, nextIndex);
  return {
    ...output,
    targetSize: anchorOutput?.targetSize ?? output.targetSize,
    resolution: anchorOutput?.resolution ?? output.resolution,
    provider: anchorOutput?.provider ?? output.provider,
    model: anchorOutput?.model ?? output.model,
  };
};

export interface WorkflowDraftUpdateIntent {
  action: 'update_draft' | 'save_draft' | 'run_draft' | 'none';
  updateAction?: 'update_output_prompt' | 'remove_output' | 'add_output' | 'toggle_strategy' | 'set_language' | 'set_aspect_ratio' | 'set_generation_settings' | 'set_page_count' | 'set_render_mode' | 'ecommerce_patch_pages' | 'approve_master_and_generate';
  targetOutputId?: string;
  outputSpec?: Partial<import('../workflows/workflowRecipeTypes').WorkflowOutputSpec>;
  outputSpecs?: Array<Partial<import('../workflows/workflowRecipeTypes').WorkflowOutputSpec>>;
  removeOutputIds?: string[];
  languagePolicy?: Partial<import('../workflows/workflowRecipeTypes').WorkflowTextPolicy>;
  strategyEnabled?: boolean;
  pageCount?: number;
  renderMode?: DetailPageRenderMode;
  nextPageCount?: number;
  generationSettings?: WorkflowGenerationSettings;
  reasons: string[];
}

export function detectWorkflowDraftUpdateIntent(
  userText: string,
  activeDraft: import('../workflows/workflowRecipeTypes').WorkflowRecipeDraft,
): WorkflowDraftUpdateIntent {
  const reasons: string[] = [];

  if (DRAFT_SAVE_PATTERN.test(userText)) {
    return { action: 'save_draft', reasons: ['save workflow draft'] };
  }

  if (DRAFT_RUN_PATTERN.test(userText)) {
    return { action: 'run_draft', reasons: ['run workflow draft'] };
  }

  const generationSettings = parseWorkflowGenerationSettings(userText, { templateId: activeDraft.templateId });
  if (
    generationSettings.aspectRatio
    || generationSettings.targetSize
    || generationSettings.resolution
    || generationSettings.explicitModel
  ) {
    const shouldUpdateModel = !!generationSettings.explicitModel || !!generationSettings.resolution;
    const modelFamily = generationSettings.explicitModel
      ? generationSettings.modelFamily
      : inferWorkflowModelFamilyFromDraft(activeDraft) || generationSettings.modelFamily;
    const model = shouldUpdateModel && modelFamily
      ? resolveWorkflowModel({
        modelFamily,
        resolution: generationSettings.resolution,
        highQuality: generationSettings.highQuality,
        text: userText,
      })
      : undefined;
    const effectiveGenerationSettings: WorkflowGenerationSettings = {
      ...generationSettings,
      modelFamily,
      provider: model ? generationSettings.provider : undefined,
      model,
    };
    return {
      action: 'update_draft',
      updateAction: 'set_generation_settings',
      outputSpec: {
        ...(generationSettings.aspectRatio ? { aspectRatio: generationSettings.aspectRatio } : {}),
        ...(generationSettings.targetSize ? { targetSize: generationSettings.targetSize } : {}),
        ...(generationSettings.resolution ? { resolution: generationSettings.resolution } : {}),
        ...(model && generationSettings.provider ? { provider: generationSettings.provider } : {}),
        ...(model ? { model } : {}),
      },
      generationSettings: effectiveGenerationSettings,
      reasons: effectiveGenerationSettings.reasons,
    };
  }

  if (isEcommerceDetailPageDraft(activeDraft)) {
    const pageCountMatch = /改成\s*(\d+)\s*页|(\d+)\s*页/.exec(userText);
    if (pageCountMatch && /改成|只要|保留|压缩/.test(userText)) {
      const pageCount = Number(pageCountMatch[1] || pageCountMatch[2]);
      if (Number.isFinite(pageCount) && pageCount > 0) {
        return {
          action: 'update_draft',
          updateAction: 'set_page_count',
          pageCount,
          reasons: [`set ecommerce detail page count to ${pageCount}`],
        };
      }
    }

    if (/只要底图|后期.*加字|自己.*加字|不要文案|不要文字|不要图标/.test(userText)) {
      return {
        action: 'update_draft',
        updateAction: 'set_render_mode',
        renderMode: 'visual_background_only',
        reasons: ['set ecommerce detail page renderMode visual_background_only'],
      };
    }

    if (/确认母版|母版.*确认|主视觉.*确认|继续生成后面/.test(userText)) {
      const nextMatch = /后面\s*(\d+)\s*页|继续生成.*?(\d+)\s*页/.exec(userText);
      const nextPageCount = Number(nextMatch?.[1] || nextMatch?.[2] || 3);
      return {
        action: 'update_draft',
        updateAction: 'approve_master_and_generate',
        nextPageCount: Number.isFinite(nextPageCount) ? nextPageCount : 3,
        reasons: ['approve master page and ready next ecommerce pages'],
      };
    }

    const removeOutputIds: string[] = [];
    if (/不要.*安全页|去掉.*安全页|删除.*安全页/.test(userText)) {
      removeOutputIds.push(...activeDraft.outputs
        .filter(output => /安全|稳定/.test(output.title) || /安全|稳定/.test(output.pageSpec?.pageName || ''))
        .map(output => output.id));
    }
    const outputSpecs: Array<Partial<import('../workflows/workflowRecipeTypes').WorkflowOutputSpec>> = [];
    if (/加.*安装步骤|新增.*安装步骤|添加.*安装步骤|安装步骤页/.test(userText)) {
      outputSpecs.push(buildInstallationDetailPageOutput(activeDraft));
    }
    if (removeOutputIds.length > 0 || outputSpecs.length > 0) {
      return {
        action: 'update_draft',
        updateAction: 'ecommerce_patch_pages',
        removeOutputIds,
        outputSpecs,
        reasons: [
          ...(removeOutputIds.length ? ['remove ecommerce detail pages'] : []),
          ...(outputSpecs.length ? ['add ecommerce detail pages'] : []),
        ],
      };
    }
  }

  // strategy toggle
  if (DRAFT_STRATEGY_DISABLE_PATTERN.test(userText)) {
    return {
      action: 'update_draft',
      updateAction: 'toggle_strategy',
      strategyEnabled: false,
      reasons: ['disable strategy step'],
    };
  }
  if (DRAFT_STRATEGY_ENABLE_PATTERN.test(userText)) {
    return {
      action: 'update_draft',
      updateAction: 'toggle_strategy',
      strategyEnabled: true,
      reasons: ['enable strategy step'],
    };
  }

  // remove output
  for (const { pattern, id } of DRAFT_OUTPUT_REMOVE_PATTERNS) {
    if (pattern.test(userText)) {
      return {
        action: 'update_draft',
        updateAction: 'remove_output',
        targetOutputId: id,
        reasons: [`remove output ${id}`],
      };
    }
  }

  // add output
  for (const { pattern, id, title } of DRAFT_OUTPUT_ADD_PATTERNS) {
    if (pattern.test(userText)) {
      const anchorOutput = activeDraft.outputs.find(output => output.enabled !== false) || activeDraft.outputs[0];
      return {
        action: 'update_draft',
        updateAction: 'add_output',
        targetOutputId: id,
        outputSpec: {
          id,
          title,
          type: 'image_generator' as const,
          enabled: true,
          order: 99,
          aspectRatio: anchorOutput?.aspectRatio || (typeof activeDraft.metadata.aspectRatio === 'string' ? activeDraft.metadata.aspectRatio : '16:9'),
          targetSize: anchorOutput?.targetSize || (typeof activeDraft.metadata.targetSize === 'string' ? activeDraft.metadata.targetSize : null),
          resolution: anchorOutput?.resolution || (typeof activeDraft.metadata.resolution === 'string' ? activeDraft.metadata.resolution : null),
          provider: anchorOutput?.provider || (typeof activeDraft.metadata.provider === 'string' ? activeDraft.metadata.provider : null),
          model: anchorOutput?.model || (typeof activeDraft.metadata.model === 'string' ? activeDraft.metadata.model : null),
          prompt: `生成${title}，展示产品结构和造型。图中文字以中文为主，可保留行业术语。`,
          inputRoles: ['product_reference_image'],
          requiresReferenceImages: true,
          editable: true,
        },
        reasons: [`add output ${id}`],
      };
    }
  }

  // language policy
  for (const { pattern, lang } of DRAFT_LANGUAGE_PATTERNS) {
    if (pattern.test(userText)) {
      const isCmfOnly = /CMF/i.test(userText);
      if (isCmfOnly) {
        // Update CMF prompt specifically
        const cmfSuffix = '\n图中标注使用中文，包括材料名称、表面工艺、颜色标注，不要默认全英文。';
        return {
          action: 'update_draft',
          updateAction: 'update_output_prompt',
          targetOutputId: 'cmf_board',
          outputSpec: {
            prompt: `__APPEND__:${cmfSuffix}`,
          },
          reasons: ['update CMF prompt to Chinese'],
        };
      }
      return {
        action: 'update_draft',
        updateAction: 'set_language',
        languagePolicy: { imageTextLanguage: lang },
        reasons: [`set language to ${lang}`],
      };
    }
  }

  // aspect ratio
  const arMatch = DRAFT_ASPECT_RATIO_PATTERN.exec(userText);
  if (arMatch) {
    const ratio = arMatch[1] || arMatch[2];
    return {
      action: 'update_draft',
      updateAction: 'set_aspect_ratio',
      outputSpec: { aspectRatio: ratio },
      reasons: [`set aspect ratio to ${ratio}`],
    };
  }

  return { action: 'none', reasons };
}

export function buildAppAgentPlan(input: {
  userText: string;
  activeSkillIds: AgentSkillId[];
  contextScopes: ContextScope[];
  context?: AgentCanvasContext;
  activeDraft?: WorkflowRecipeDraft;
}): AppAgentPlan {
  const text = input.userText;
  const commands: AppAgentCommand[] = [];

  // ── Active draft routing (highest priority) ─────────────────────────────
  if (input.activeDraft) {
    const draftIntent = detectWorkflowDraftUpdateIntent(text, input.activeDraft);

    if (draftIntent.action === 'save_draft' || draftIntent.action === 'run_draft') {
      commands.push(command('workflow', 'update_draft', {
        action: 'save_draft_as_workflow',
        autoRun: draftIntent.action === 'run_draft',
      }, 'safe_write', 'workflow-builder-skill'));
      const riskLevel = maxRisk(commands.map(item => item.riskLevel));
      return {
        id: createId('app-agent-plan'),
        title: text.trim().split(/\r?\n/)[0]?.slice(0, 40) || 'Save Workflow Draft',
        userRequest: text,
        activeSkillIds: input.activeSkillIds,
        contextScopes: input.contextScopes,
        commands,
        riskLevel,
        requiresConfirmation: ['costly', 'destructive', 'system_process'].includes(riskLevel),
      };
    }

    if (draftIntent.action === 'update_draft') {
      const updateArgs: Record<string, unknown> = { action: draftIntent.updateAction };

      if (draftIntent.updateAction === 'toggle_strategy') {
        updateArgs.strategyEnabled = draftIntent.strategyEnabled;
      } else if (draftIntent.updateAction === 'remove_output') {
        updateArgs.outputId = draftIntent.targetOutputId;
      } else if (draftIntent.updateAction === 'add_output') {
        updateArgs.outputSpec = draftIntent.outputSpec;
      } else if (draftIntent.updateAction === 'update_output_prompt') {
        updateArgs.outputId = draftIntent.targetOutputId;
        updateArgs.outputSpec = draftIntent.outputSpec;
      } else if (draftIntent.updateAction === 'set_language') {
        updateArgs.languagePolicy = draftIntent.languagePolicy;
      } else if (draftIntent.updateAction === 'set_aspect_ratio') {
        updateArgs.outputSpec = draftIntent.outputSpec;
      } else if (draftIntent.updateAction === 'set_generation_settings') {
        updateArgs.outputSpec = draftIntent.outputSpec;
        updateArgs.generationSettings = draftIntent.generationSettings;
      } else if (draftIntent.updateAction === 'set_page_count') {
        updateArgs.pageCount = draftIntent.pageCount;
      } else if (draftIntent.updateAction === 'set_render_mode') {
        updateArgs.renderMode = draftIntent.renderMode;
      } else if (draftIntent.updateAction === 'ecommerce_patch_pages') {
        updateArgs.removeOutputIds = draftIntent.removeOutputIds;
        updateArgs.outputSpecs = draftIntent.outputSpecs;
      } else if (draftIntent.updateAction === 'approve_master_and_generate') {
        updateArgs.nextPageCount = draftIntent.nextPageCount;
      }

      commands.push(command('workflow', 'update_draft', updateArgs, 'safe_write', 'workflow-builder-skill'));
      const riskLevel = maxRisk(commands.map(item => item.riskLevel));
      return {
        id: createId('app-agent-plan'),
        title: text.trim().split(/\r?\n/)[0]?.slice(0, 40) || 'Update Workflow Draft',
        userRequest: text,
        activeSkillIds: input.activeSkillIds,
        contextScopes: input.contextScopes,
        commands,
        riskLevel,
        requiresConfirmation: ['costly', 'destructive', 'system_process'].includes(riskLevel),
      };
    }
  }
  // ────────────────────────────────────────────────────────────────────────
  const workflowIntent = parseWorkflowBuilderIntent(text);
  if (input.activeSkillIds.includes('app-navigation-skill')) {
    if (/打开抽屉|open drawer/i.test(text)) commands.push(command('app', 'open_drawer', {}, 'safe_write', 'app-navigation-skill'));
    if (/关闭抽屉|close drawer/i.test(text)) commands.push(command('app', 'close_drawer', {}, 'safe_write', 'app-navigation-skill'));
    if (/打开日历|日历/i.test(text)) commands.push(command('app', 'open_calendar', {}, 'safe_write', 'app-navigation-skill'));
    if (/打开设置|settings/i.test(text)) commands.push(command('app', 'open_settings', {}, 'safe_write', 'app-navigation-skill'));
  }
  if (input.activeSkillIds.includes('canvas-control-skill') && /清空画布/.test(text)) {
    commands.push(command('canvas', 'clear_canvas', {}, 'destructive', 'canvas-control-skill'));
  }
  if (input.activeSkillIds.includes('workflow-builder-skill') && /运行.*workflow|运行.*工作流/i.test(text)) {
    commands.push(command('workflow', 'run', { nodeIds: input.context?.selectedIds || [] }, 'costly', 'workflow-builder-skill'));
  }
  if (
    input.activeSkillIds.includes('workflow-builder-skill')
    && workflowIntent.runWorkflow
    && !commands.some(item => item.domain === 'workflow' && item.action === 'run')
  ) {
    commands.push(command('workflow', 'run', { nodeIds: input.context?.selectedIds || [] }, 'costly', 'workflow-builder-skill'));
  }
  const _wfTemplateId = input.activeSkillIds.includes('workflow-builder-skill') && workflowIntent.createWorkflow
    ? detectWorkflowTemplate(text)
    : 'custom-workflow';
  // Only handle workflow creation when:
  // - industrial-design-review workflow_module creates editable draft, canvas_nodes_fallback uses generators
  // - workflow_module + any other template creates editable draft
  // - canvas_nodes_fallback + non-industrial-review → NOT handled here, falls through to creative-product-design-skill
  const handledWorkflowCreation = input.activeSkillIds.includes('workflow-builder-skill')
    && workflowIntent.createWorkflow
    && (_wfTemplateId === 'industrial-design-review' || _wfTemplateId === 'product-detail-page' || workflowIntent.workflowCreationMode === 'workflow_module');
  if (handledWorkflowCreation) {
    const templateId = _wfTemplateId;
    const generationSettings = workflowIntent.generationSettings;
    const selectedImageNodeIds = getSelectedImageNodeIds(input.context);
    const strategyEnabled = workflowIntent.strategyStepMode === 'enabled';
    const inputBindings = selectedImageNodeIds.length > 0
      ? {
        product_reference_image: selectedImageNodeIds.length === 1
          ? { kind: 'canvas_node', nodeId: selectedImageNodeIds[0] }
          : { kind: 'canvas_nodes', nodeIds: selectedImageNodeIds },
      }
      : { product_reference_image: { kind: 'unbound', nodeId: null } };

    if (templateId === 'industrial-design-review') {
      // ── 工业设计评审 ─────────────────────────────────────────────────────
      const brief = extractCreativeBrief({
        userText: text,
        hasSelectedImages: !!input.context?.visualReferences?.length,
        selectedItemCount: input.context?.selectedIds?.length || 0,
        hasCanvasContext: !!input.context?.nodes?.length,
      }, input.context?.visualReferences?.map(reference => reference.nodeId));
      const outputTypes = getIndustrialDesignReviewOutputTypes(workflowIntent);
      if (workflowIntent.workflowCreationMode === 'workflow_module') {
        const draft = buildWorkflowDraftFromUserRequest({
          userText: text,
          brief,
          outputTypes,
          strategyStepMode: workflowIntent.strategyStepMode,
        });
        commands.push(command('workflow', 'create_draft', {
          workflowDraft: draft,
          languagePolicy: draft.languagePolicy,
          selectedReferenceImageNodeIds: selectedImageNodeIds,
          inputBindings,
        }, 'safe_write', 'workflow-builder-skill'));
      } else {
        const brief2 = extractCreativeBrief({
          userText: text,
          hasSelectedImages: !!input.context?.visualReferences?.length,
          selectedItemCount: input.context?.selectedIds?.length || 0,
          hasCanvasContext: !!input.context?.nodes?.length,
        }, input.context?.visualReferences?.map(r => r.nodeId));
        commands.push(...buildIndustrialReviewCanvasNodeFallbackCommands(
          brief2,
          outputTypes,
          selectedImageNodeIds,
          text,
          workflowIntent.strategyStepMode,
        ));
      }

    } else if (templateId === 'product-detail-page') {
      // ── 详情页图片工作流 ──────────────────────────────────────────────────
      const draft = buildProductDetailPageDraft({
        originalRequest: text,
        strategyEnabled,
        aspectRatio: generationSettings.aspectRatio,
        targetSize: generationSettings.targetSize || null,
        resolution: generationSettings.resolution || null,
        provider: generationSettings.provider || null,
        model: generationSettings.model || null,
      });
      commands.push(command('workflow', 'create_draft', {
        workflowDraft: draft,
        languagePolicy: draft.languagePolicy,
        selectedReferenceImageNodeIds: selectedImageNodeIds,
        inputBindings,
      }, 'safe_write', 'workflow-builder-skill'));

    } else {
      // ── custom-workflow / 其他模板：生成 draft 供用户编辑 ─────────────────
      const userOutputIds = extractUserSpecifiedDetailOutputIds(text);
      const customOutputIds = userOutputIds.length > 0
        ? userOutputIds
        : workflowIntent.outputTypes.map(mapOutputTypeToRecipeId);
      const plannedOutputIds = customOutputIds.length > 0
        ? customOutputIds
        : getDefaultCustomWorkflowOutputIds(text);
      const languagePolicy = detectUserLanguagePolicy(text);
      const draft: WorkflowRecipeDraft = {
        id: `custom-draft-${Date.now().toString(36)}`,
        name: '自定义工作流',
        description: '根据用户需求生成的工作流',
        templateId: templateId as string,
        languagePolicy,
        inputs: [
          { id: 'product_reference_image', label: '参考图', type: 'image' as const, required: true },
        ],
        strategy: { enabled: false, mode: 'disabled' as const, title: '', prompt: '' },
        outputs: plannedOutputIds.length > 0
          ? plannedOutputIds.map((id, i) => ({
            id,
            title: CUSTOM_WORKFLOW_OUTPUT_TITLES[id] || id.replace(/_/g, ' '),
            type: 'image_generator' as const,
            enabled: true,
            order: i + 1,
            aspectRatio: generationSettings.aspectRatio || '16:9',
            targetSize: generationSettings.targetSize || null,
            resolution: generationSettings.resolution || null,
            provider: generationSettings.provider || null,
            model: generationSettings.model || null,
            prompt: `生成${CUSTOM_WORKFLOW_OUTPUT_TITLES[id] || id.replace(/_/g, ' ')}图片。\n${buildOriginalRequestLine(text)}`,
            inputRoles: ['product_reference_image'],
            requiresReferenceImages: true,
            editable: true,
          }))
          : [],
        metadata: {
          originalRequest: text,
          createdBy: 'app-agent',
          editable: true,
          workflowGenerationSettings: generationSettings,
          aspectRatio: generationSettings.aspectRatio,
          targetSize: generationSettings.targetSize,
          resolution: generationSettings.resolution,
          provider: generationSettings.provider,
          model: generationSettings.model,
          modelFamily: generationSettings.modelFamily,
          explicitModel: generationSettings.explicitModel,
        },
      };
      commands.push(command('workflow', 'create_draft', {
        workflowDraft: draft,
        languagePolicy: draft.languagePolicy,
      }, 'safe_write', 'workflow-builder-skill'));
    }
  }
  if (!handledWorkflowCreation && input.activeSkillIds.includes('creative-product-design-skill')) {
    const brief = extractCreativeBrief({
      userText: text,
      hasSelectedImages: !!input.context?.visualReferences?.length,
      selectedItemCount: input.context?.selectedIds?.length || 0,
      hasCanvasContext: !!input.context?.nodes?.length,
    }, input.context?.visualReferences?.map(reference => reference.nodeId));
    const selectedImageNodeIds = getSelectedImageNodeIds(input.context);
    const textAgentStepId = brief.requiresStoryboardFirst ? 'storyboardScript' : 'productStrategy';
    const textAgentOutputRef = `$${textAgentStepId}.nodeId`;
    if (brief.requiresStoryboardFirst || brief.requiresStrategyFirst) {
      commands.push(command('canvas', 'create_text_agent', {
        prompt: brief.requiresStoryboardFirst
          ? buildStoryboardTextAgentPrompt(brief)
          : buildProductStrategyTextAgentPrompt(brief),
        inputIds: input.context?.selectedIds || [],
        autoRun: false,
      }, 'safe_write', 'creative-product-design-skill', {
        stepId: textAgentStepId,
        createsNode: true,
        outputRef: textAgentOutputRef,
      }));
    }
    if (brief.requiresStoryboardFirst && !isExplicitVideoGenerationRequest(text)) {
      commands.push(command('canvas', 'create_generator', {
        mediaType: 'image',
        prompt: buildStoryboardSheetPrompt(brief),
        inputIds: [textAgentOutputRef, ...selectedImageNodeIds],
        referenceImageNodeIds: selectedImageNodeIds,
        autoRun: false,
        aspectRatio: brief.dimensions.aspectRatio || null,
        targetSize: brief.dimensions.targetSize || null,
        resolution: brief.dimensions.resolution || null,
        toolHint: brief.toolHint || null,
        referenceRoles: selectedImageNodeIds.map(nodeId => ({ nodeId, role: 'SUBJECT_REF' as const })),
        skillMeta: {
          skillId: 'creative-product-design-skill',
          originalRequest: text,
          taskKind: 'storyboard',
          fidelity: brief.fidelity,
          productCategory: brief.product.category,
          focus: brief.product.focus,
        },
      }, 'safe_write', 'creative-product-design-skill', {
        stepId: 'storyboardSheet',
        createsNode: true,
        outputRef: '$storyboardSheet.nodeId',
      }));
    } else if (!brief.requiresStoryboardFirst || isDirectCreativeExecutionRequest(text)) {
      commands.push(command('canvas', 'create_generator', {
        mediaType: brief.mediaType,
        prompt: brief.generatorPrompt,
        inputIds: Array.from(new Set([
          ...(input.context?.selectedIds || []),
          ...(brief.requiresStrategyFirst ? [textAgentOutputRef] : []),
        ])),
        autoRun: brief.mediaType === 'video'
          ? shouldAutoRunVideoGenerator(text)
          : isDirectCreativeExecutionRequest(text),
        aspectRatio: brief.dimensions.aspectRatio || null,
        targetSize: brief.dimensions.targetSize || null,
        resolution: brief.dimensions.resolution || null,
        toolHint: brief.toolHint || null,
        referenceRoles: selectedImageNodeIds.map(nodeId => ({ nodeId, role: 'SUBJECT_REF' as const })),
        skillMeta: {
          skillId: 'creative-product-design-skill',
          originalRequest: text,
          taskKind: brief.taskKind,
          fidelity: brief.fidelity,
          productCategory: brief.product.category,
          focus: brief.product.focus,
        },
      }, brief.mediaType === 'video' ? 'costly' : 'safe_write', 'creative-product-design-skill', {
        stepId: brief.mediaType === 'video' ? 'videoGenerator' : 'creativeGenerator',
        createsNode: true,
        outputRef: brief.mediaType === 'video' ? '$videoGenerator.nodeId' : '$creativeGenerator.nodeId',
      }));
    }
  }
  const riskLevel = maxRisk(commands.map(item => item.riskLevel));
  return {
    id: createId('app-agent-plan'),
    title: text.trim().split(/\r?\n/)[0]?.slice(0, 40) || 'App Agent Plan',
    userRequest: text,
    activeSkillIds: input.activeSkillIds,
    contextScopes: input.contextScopes,
    riskLevel,
    requiresConfirmation: commands.some(item => item.requiresConfirmation),
    commands,
  };
}
