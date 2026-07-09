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
  type StrategyStepMode,
  type WorkflowCreationMode,
  type WorkflowOutputType,
} from '../skills/workflowBuilderSkill';

const createId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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

const INDUSTRIAL_REVIEW_GENERATOR_SPECS: Array<{
  outputType: WorkflowOutputType;
  stepId: string;
  title: string;
  outputLabel: string;
  focus: string;
}> = [
  {
    outputType: 'hero_view',
    stepId: 'hero_view',
    title: '产品主视觉 / Hero Render',
    outputLabel: '产品主视觉 / hero render',
    focus: 'Create a premium industrial design hero render with clear silhouette, credible structure, controlled lighting, and review-ready composition.',
  },
  {
    outputType: 'detail_view',
    stepId: 'detail_view',
    title: '细节图 / Detail View',
    outputLabel: '局部细节图 / button / interface / material / structure detail',
    focus: 'Create macro detail views for buttons, interface, seams, material transitions, structure details, ports, vents, or grip texture.',
  },
  {
    outputType: 'cmf_board',
    stepId: 'cmf_board',
    title: 'CMF 图 / CMF Board',
    outputLabel: 'CMF 图 / material color finish board',
    focus: 'Create a disciplined CMF board showing material, color, finish, texture, accent hierarchy, and product-positioning logic.',
  },
  {
    outputType: 'usage_scene',
    stepId: 'usage_scene',
    title: '场景图 / Usage Scene',
    outputLabel: '使用场景图 / real usage context',
    focus: 'Create a realistic usage context image with scale cues, ergonomic interaction, and believable environment while keeping the product design consistent.',
  },
  {
    outputType: 'premium_mood',
    stepId: 'premium_mood',
    title: '高级氛围图 / Premium Mood',
    outputLabel: '高级氛围图 / premium brand mood render',
    focus: 'Create a premium brand mood render with refined lighting, restrained atmosphere, and high-end presentation without hiding product design.',
  },
  {
    outputType: 'storyboard_or_video_key_visual',
    stepId: 'storyboard_key_visual',
    title: '视频图 / Storyboard Key Visual',
    outputLabel: '16:9 视频图 / storyboard sheet / video key visual',
    focus: 'Create a 16:9 storyboard or video keyframe sheet as image output; show shot order, key frames, subject action, transitions, and visual continuity.',
  },
];

const buildIndustrialReviewGeneratorPrompt = (
  brief: CreativeBrief,
  spec: typeof INDUSTRIAL_REVIEW_GENERATOR_SPECS[number],
) => [
  spec.title,
  `Output: ${spec.outputLabel}.`,
  spec.focus,
  'Use the selected product reference image(s) as the identity anchor.',
  '保持产品身份一致、比例一致、关键结构一致；keep product identity, proportions, key structures, functional layout, CMF boundaries, and material logic consistent across the full review workflow.',
  'Use the connected industrial_design_review_strategy text-agent output as strategy guidance, not as a replacement for the product reference image.',
  'This is one node inside a multi-output workflow, not a standalone CMF-only task.',
  buildWorkflowCreativeContext(brief),
].join('\n');

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
    toolHint: string | null;
    skillMeta: Record<string, unknown>;
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
  const strategyEnabled = strategyStepMode === 'enabled';
  const aspectRatio = brief.dimensions.aspectRatio || '16:9';
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
  const specs = INDUSTRIAL_REVIEW_GENERATOR_SPECS.filter(spec => outputTypes.includes(spec.outputType));
  const generatorSteps = specs.map((spec): Extract<IndustrialReviewWorkflowStep, { type: 'image_generator' }> => {
    const inputRoles: Record<string, 'visual_reference' | 'text_strategy'> = {
      product_reference_image: 'visual_reference',
    };
    if (strategyEnabled) inputRoles[strategyStepId] = 'text_strategy';
    return {
      id: spec.stepId,
      type: 'image_generator',
      mediaType: 'image',
      title: spec.title,
      outputRole: spec.outputType,
      visualInputStepIds: ['product_reference_image'],
      textInputStepIds: strategyEnabled ? [strategyStepId] : [],
      inputStepIds: strategyEnabled ? ['product_reference_image', strategyStepId] : ['product_reference_image'],
      inputRoles,
      requiresReferenceImages: true,
      optional: spec.outputType === 'storyboard_or_video_key_visual',
      prompt: buildIndustrialReviewGeneratorPrompt(brief, spec),
      aspectRatio,
      targetSize: brief.dimensions.targetSize || null,
      resolution: brief.dimensions.resolution || null,
      toolHint: brief.toolHint || null,
      skillMeta: {
        skillId: 'creative-product-design-skill,workflow-builder-skill',
        skillIds: ['creative-product-design-skill', 'workflow-builder-skill'],
        workflowTemplateId: 'industrial-design-review',
        workflowOutputType: spec.outputType,
        originalRequest: originalText,
        taskKind: 'industrial_design_review_workflow',
        fidelity: brief.fidelity,
        productCategory: brief.product.category,
        focus: brief.product.focus,
      },
    };
  });
  const strategyStep: IndustrialReviewWorkflowStep | null = strategyEnabled
    ? {
      id: strategyStepId,
      type: 'text_agent',
      title: '工业设计评审策略',
      optional: false,
      inputStepIds: ['product_reference_image'],
      outputRole: 'text_strategy',
      prompt: buildIndustrialReviewStrategyPrompt(brief, outputTypes),
    }
    : null;

  return {
    id: createId('industrial-design-review-workflow'),
    name: '工业设计评审工作流',
    description: '根据参考产品图自动生成工业设计评审图组',
    templateId: 'industrial-design-review',
    creationMode,
    strategyStepMode,
    inputs: [{
      id: 'product_reference_image',
      type: 'image',
      required: true,
      label: '参考产品图',
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
      productCategory: brief.product.category,
      outputTypes,
      aspectRatio,
      selectedReferenceImageNodeIds: selectedImageNodeIds,
      workflowCreationMode: creationMode,
      strategyStepMode,
    },
    executionOrder: strategyEnabled
      ? [['product_reference_image'], [strategyStepId], generatorSteps.map(step => step.id)]
      : [['product_reference_image'], generatorSteps.map(step => step.id)],
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

  const specs = INDUSTRIAL_REVIEW_GENERATOR_SPECS.filter(spec => outputTypes.includes(spec.outputType));
  specs.forEach(spec => {
    const outputRef = `$${spec.stepId}.nodeId`;
    plannedNodeRefs.push(outputRef);
    commands.push(command('canvas', 'create_generator', {
      mediaType: 'image',
      prompt: buildIndustrialReviewGeneratorPrompt(brief, spec),
      inputIds: Array.from(new Set([...(strategyEnabled ? [strategyOutputRef] : []), ...selectedImageNodeIds])),
      referenceImageNodeIds: selectedImageNodeIds,
      referenceRoles,
      autoRun: false,
      aspectRatio,
      targetSize: brief.dimensions.targetSize || null,
      resolution: brief.dimensions.resolution || null,
      toolHint: brief.toolHint || null,
      skillMeta: {
        skillId: 'creative-product-design-skill,workflow-builder-skill',
        skillIds: ['creative-product-design-skill', 'workflow-builder-skill'],
        workflowTemplateId: 'industrial-design-review',
        workflowOutputType: spec.outputType,
        originalRequest: originalText,
        taskKind: 'industrial_design_review_workflow',
        fidelity: brief.fidelity,
        productCategory: brief.product.category,
        focus: brief.product.focus,
      },
    }, 'safe_write', 'workflow-builder-skill', {
      stepId: spec.stepId,
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

export function buildAppAgentPlan(input: {
  userText: string;
  activeSkillIds: AgentSkillId[];
  contextScopes: ContextScope[];
  context?: AgentCanvasContext;
}): AppAgentPlan {
  const text = input.userText;
  const commands: AppAgentCommand[] = [];
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
  const handledWorkflowCreation = input.activeSkillIds.includes('workflow-builder-skill')
    && workflowIntent.createWorkflow
    && workflowIntent.workflowTemplateId === 'industrial-design-review';
  if (handledWorkflowCreation) {
    const brief = extractCreativeBrief({
      userText: text,
      hasSelectedImages: !!input.context?.visualReferences?.length,
      selectedItemCount: input.context?.selectedIds?.length || 0,
      hasCanvasContext: !!input.context?.nodes?.length,
    }, input.context?.visualReferences?.map(reference => reference.nodeId));
    const selectedImageNodeIds = getSelectedImageNodeIds(input.context);
    const outputTypes = getIndustrialDesignReviewOutputTypes(workflowIntent);
    if (workflowIntent.workflowCreationMode === 'workflow_module') {
      const workflowDefinition = buildIndustrialReviewWorkflowDefinition(
        brief,
        outputTypes,
        selectedImageNodeIds,
        text,
        workflowIntent.workflowCreationMode,
        workflowIntent.strategyStepMode,
      );
      commands.push(command('workflow', 'create', {
        workflowDefinition,
        selectedReferenceImageNodeIds: selectedImageNodeIds,
        inputIds: selectedImageNodeIds,
        inputBindings: selectedImageNodeIds.length > 0
          ? {
            product_reference_image: selectedImageNodeIds.length === 1
              ? { kind: 'canvas_node', nodeId: selectedImageNodeIds[0] }
              : { kind: 'canvas_nodes', nodeIds: selectedImageNodeIds },
          }
          : { product_reference_image: { kind: 'unbound', nodeId: null } },
        autoApplyToCanvas: true,
        autoRun: false,
      }, 'safe_write', 'workflow-builder-skill'));
    } else {
      commands.push(...buildIndustrialReviewCanvasNodeFallbackCommands(
        brief,
        outputTypes,
        selectedImageNodeIds,
        text,
        workflowIntent.strategyStepMode,
      ));
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
        referenceRoles: brief.imageRoles.map(role => ({ nodeId: role.imageId, role: role.role })),
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
        referenceRoles: brief.imageRoles.map(role => ({ nodeId: role.imageId, role: role.role })),
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
