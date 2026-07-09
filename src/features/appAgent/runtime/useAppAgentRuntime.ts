import { useMemo } from 'react';
import type { AgentCanvasContext } from '../../agentModel';
import { buildAppAgentContext } from '../context/appAgentContextBuilder';
import { buildAppAgentPlan } from '../kernel/appAgentKernel';
import { adaptPlanToLegacyActions } from '../commands/legacyToolAdapter';
import type { LegacyAgentAction } from '../commands/commandTypes';
import { selectAppAgentSkills } from '../skills/skillRegistry';
import type { AgentSkillId, ContextScope, SkillMatchInput } from '../skills/types';
import { uniqueStrings } from '../skills/skillUtils';
import { extractCreativeBrief } from '../skills/creativeProductDesignSkill';
import {
  parseWorkflowBuilderIntent,
  type StrategyStepMode,
  type WorkflowCreationMode,
  type WorkflowOutputType,
} from '../skills/workflowBuilderSkill';
import { createAppAgentTraceId, type AppAgentTraceRecord } from '../trace/appAgentTrace';

export interface PreparedAppAgentTurn {
  matchInput: SkillMatchInput;
  activeSkillIds: AgentSkillId[];
  contextScopes: ContextScope[];
  activeSkillPrompt: string;
  compactContext: unknown;
  plan: ReturnType<typeof buildAppAgentPlan>;
  deterministicLegacyActions: LegacyAgentAction[];
  shouldUseDeterministicPlan: boolean;
  trace: AppAgentTraceRecord;
}

const HIGH_CONFIDENCE_SKILL_SCORE = 0.5;

const isDirectExecutionBlockedRisk = (riskLevel: string) => (
  riskLevel === 'destructive' || riskLevel === 'system_process'
);

const getBoundNodeIds = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  return [
    typeof record.nodeId === 'string' ? record.nodeId : '',
    ...(Array.isArray(record.nodeIds) ? record.nodeIds.map(String) : []),
  ].filter(Boolean);
};

function isHighConfidenceCreativePlan(input: SkillMatchInput, activeSkillIds: AgentSkillId[]) {
  if (!activeSkillIds.includes('creative-product-design-skill')) return false;
  const brief = extractCreativeBrief(input);
  return brief.requiresStoryboardFirst
    || brief.taskKind === 'generate'
    || brief.taskKind === 'product_design'
    || brief.taskKind === 'cmf'
    || brief.taskKind === 'edit'
    || !!brief.dimensions.aspectRatio
    || !!brief.dimensions.targetSize
    || !!brief.dimensions.resolution
    || input.hasSelectedImages === true;
}

function shouldUseDeterministicPlanForTurn(input: {
  matchInput: SkillMatchInput;
  activeSkillIds: AgentSkillId[];
  selectedSkillScore: number;
  plan: ReturnType<typeof buildAppAgentPlan>;
  deterministicLegacyActions: LegacyAgentAction[];
}) {
  if (input.plan.commands.length === 0 || input.deterministicLegacyActions.length === 0) return false;
  if (isDirectExecutionBlockedRisk(input.plan.riskLevel)) return false;
  if (input.selectedSkillScore < HIGH_CONFIDENCE_SKILL_SCORE) return false;
  if (isHighConfidenceCreativePlan(input.matchInput, input.activeSkillIds)) return true;
  return input.plan.commands.every(command => command.riskLevel !== 'destructive' && command.riskLevel !== 'system_process');
}

const getIndustrialReviewTraceFields = (actions: LegacyAgentAction[]) => {
  const validOutputTypes = new Set<WorkflowOutputType>([
    'hero_view',
    'storyboard_or_video_key_visual',
    'storyboard_or_video_keyframe',
    'detail_view',
    'cmf_board',
    'usage_scene',
    'premium_mood',
  ]);
  const workflowAction = actions.find(action => {
    if (action.tool !== 'canvas_create_workflow') return false;
    const workflowDefinition = action.arguments.workflowDefinition && typeof action.arguments.workflowDefinition === 'object' && !Array.isArray(action.arguments.workflowDefinition)
      ? action.arguments.workflowDefinition as Record<string, unknown>
      : {};
    return workflowDefinition.templateId === 'industrial-design-review'
      || action.arguments.templateId === 'industrial-design-review';
  });
  if (workflowAction) {
    const workflowDefinition = workflowAction.arguments.workflowDefinition && typeof workflowAction.arguments.workflowDefinition === 'object' && !Array.isArray(workflowAction.arguments.workflowDefinition)
      ? workflowAction.arguments.workflowDefinition as Record<string, unknown>
      : workflowAction.arguments;
    const metadata = workflowDefinition.metadata && typeof workflowDefinition.metadata === 'object' && !Array.isArray(workflowDefinition.metadata)
      ? workflowDefinition.metadata as Record<string, unknown>
      : {};
    const steps = Array.isArray(workflowDefinition.steps) ? workflowDefinition.steps : [];
    const generatorSteps = steps
      .map(step => step && typeof step === 'object' && !Array.isArray(step) ? step as Record<string, unknown> : null)
      .filter((step): step is Record<string, unknown> => !!step && /image[-_]?generator/.test(String(step.type || step.kind || '').toLowerCase()));
    const outputTypes = uniqueStrings([
      ...(
        Array.isArray(metadata.outputTypes)
          ? metadata.outputTypes.map(String)
          : []
      ),
      ...generatorSteps.map(step => String(step.outputRole || '')),
    ].filter((value): value is WorkflowOutputType => validOutputTypes.has(value as WorkflowOutputType)));
    const inputBindings = workflowAction.arguments.inputBindings && typeof workflowAction.arguments.inputBindings === 'object' && !Array.isArray(workflowAction.arguments.inputBindings)
      ? workflowAction.arguments.inputBindings as Record<string, unknown>
      : {};
    const connectedReferenceImageNodeIds = uniqueStrings([
      ...(Array.isArray(workflowAction.arguments.selectedReferenceImageNodeIds)
        ? workflowAction.arguments.selectedReferenceImageNodeIds.map(String)
        : []),
      ...getBoundNodeIds(inputBindings.product_reference_image),
    ]);
    const workflowInputBindings = {
      ...Object.fromEntries(Object.entries(inputBindings).map(([key, value]) => [
        key,
        getBoundNodeIds(value),
      ])),
      ...(connectedReferenceImageNodeIds.length > 0 && getBoundNodeIds(inputBindings.product_reference_image).length === 0
        ? { product_reference_image: connectedReferenceImageNodeIds }
        : {}),
    };
    const workflowVisualFanout = generatorSteps.flatMap(step => {
      const visualInputStepIds = Array.isArray(step.visualInputStepIds)
        ? step.visualInputStepIds.map(String)
        : [];
      return (visualInputStepIds.length > 0 ? visualInputStepIds : ['product_reference_image']).map(inputId => ({
        inputId,
        targetStepId: String(step.id || step.title || ''),
        sourceNodeIds: connectedReferenceImageNodeIds,
      }));
    });
    const workflowTextDependencies = generatorSteps.flatMap(step => (
      Array.isArray(step.textInputStepIds)
        ? step.textInputStepIds.map(String).filter(Boolean).map(sourceStepId => ({
          sourceStepId,
          targetStepId: String(step.id || step.title || ''),
        }))
        : []
    ));
    const workflowCreationModeValue = String(workflowDefinition.creationMode || metadata.workflowCreationMode || '');
    const workflowCreationMode: WorkflowCreationMode | undefined = workflowCreationModeValue === 'workflow_module' || workflowCreationModeValue === 'canvas_nodes_fallback'
      ? workflowCreationModeValue
      : undefined;
    const strategyStepModeValue = String(workflowDefinition.strategyStepMode || metadata.strategyStepMode || '');
    const strategyStepMode: StrategyStepMode | undefined = strategyStepModeValue === 'auto' || strategyStepModeValue === 'enabled' || strategyStepModeValue === 'disabled'
      ? strategyStepModeValue
      : undefined;
    return {
      generatorActions: [],
      outputTypes,
      connectedReferenceImageNodeIds,
      workflowCreationMode,
      strategyStepMode,
      workflowTemplateId: String(workflowDefinition.templateId || workflowAction.arguments.templateId || '') || undefined,
      fallbackMode: 'workflow' as const,
      createdGeneratorCount: generatorSteps.length,
      workflowInputBindings,
      workflowVisualFanout,
      workflowTextDependencies,
      workflowInputResolution: {
        selectedCanvasImageNodeIds: connectedReferenceImageNodeIds,
        reusedExistingImageNodes: connectedReferenceImageNodeIds,
        createdImageNodes: [],
        duplicateImageNodesPrevented: 0,
        thumbnailPlaceholdersCreated: 0,
        unresolvedThumbnailNodes: [],
      },
    };
  }
  const generatorActions = actions.filter(action => {
    if (action.tool !== 'canvas_create_generator') return false;
    const meta = action.arguments.skillMeta && typeof action.arguments.skillMeta === 'object' && !Array.isArray(action.arguments.skillMeta)
      ? action.arguments.skillMeta as Record<string, unknown>
      : {};
    return meta.workflowTemplateId === 'industrial-design-review';
  });
  const outputTypes = uniqueStrings(generatorActions
    .map(action => {
      const meta = action.arguments.skillMeta && typeof action.arguments.skillMeta === 'object' && !Array.isArray(action.arguments.skillMeta)
        ? action.arguments.skillMeta as Record<string, unknown>
        : {};
      return String(meta.workflowOutputType || '');
    })
    .filter((value): value is WorkflowOutputType => validOutputTypes.has(value as WorkflowOutputType)));
  const connectedReferenceImageNodeIds = uniqueStrings(generatorActions.flatMap(action => (
    Array.isArray(action.arguments.referenceImageNodeIds)
      ? action.arguments.referenceImageNodeIds.map(String)
      : []
  )));
  return {
    generatorActions,
    outputTypes,
    connectedReferenceImageNodeIds,
    workflowCreationMode: undefined,
    strategyStepMode: undefined,
    workflowTemplateId: undefined,
    fallbackMode: generatorActions.length > 0 ? 'multi-node' as const : undefined,
    createdGeneratorCount: generatorActions.length || undefined,
    workflowInputBindings: undefined,
    workflowVisualFanout: undefined,
    workflowTextDependencies: undefined,
    workflowInputResolution: undefined,
  };
};

export function prepareAppAgentTurn(input: {
  userText: string;
  context: AgentCanvasContext;
}): PreparedAppAgentTurn {
  const context = input.context;
  const matchInput: SkillMatchInput = {
    userText: input.userText,
    surface: context.surface,
    selectedItemCount: context.selectedIds?.length || context.selectedItems?.length || 0,
    selectedNodeCount: context.selectedIds?.length || 0,
    hasSelectedImages: !!context.visualReferences?.some(reference => reference.mediaType === 'image')
      || !!context.selectedItems?.some(item => item.type === 'image' || item.referenceCount || item.references?.length),
    hasCanvasContext: context.nodes.length > 0,
  };
  const selectedSkills = selectAppAgentSkills(matchInput);
  const activeSkillIds = selectedSkills.map(entry => entry.skill.id);
  const selectedSkillScore = selectedSkills[0]?.match.score || 0;
  const requiredScopes: ContextScope[] = selectedSkills.flatMap(entry => entry.skill.getRequiredContext?.(matchInput) || ['minimal']);
  const contextScopes = uniqueStrings<ContextScope>(requiredScopes);
  const fallbackScopes: ContextScope[] = ['minimal'];
  const scopes: ContextScope[] = contextScopes.length > 0 ? contextScopes : fallbackScopes;
  const compactContext = buildAppAgentContext(context, { scopes, detail: 'compact' });
  const activeSkillPrompt = selectedSkills
    .map(entry => entry.skill.buildPromptPatch?.(matchInput))
    .filter((patch): patch is string => !!patch?.trim())
    .join('\n\n');
  const plan = buildAppAgentPlan({
    userText: input.userText,
    activeSkillIds,
    contextScopes: scopes,
    context,
  });
  const deterministicLegacyActions = adaptPlanToLegacyActions(plan);
  const shouldUseDeterministicPlan = shouldUseDeterministicPlanForTurn({
    matchInput,
    activeSkillIds,
    selectedSkillScore,
    plan,
    deterministicLegacyActions,
  });
  const workflowIntent = parseWorkflowBuilderIntent(input.userText);
  const industrialReviewTrace = getIndustrialReviewTraceFields(deterministicLegacyActions);
  const trace: AppAgentTraceRecord = {
    id: createAppAgentTraceId(),
    createdAt: Date.now(),
    userRequest: input.userText,
    activeSkillIds,
    contextScopes: scopes,
    plan,
    plannedCommands: plan.commands,
    executedLegacyActions: [],
    llmGeneratedActions: [],
    deterministicActionsUsed: shouldUseDeterministicPlan,
    confirmationRequired: plan.requiresConfirmation,
    workflowIntentDetected: workflowIntent.workflowIntentDetected,
    workflowCreationMode: industrialReviewTrace.workflowCreationMode || workflowIntent.workflowCreationMode,
    strategyStepMode: industrialReviewTrace.strategyStepMode || workflowIntent.strategyStepMode,
    outputTypes: industrialReviewTrace.outputTypes.length > 0
      ? industrialReviewTrace.outputTypes
      : workflowIntent.outputTypes,
    workflowTemplateId: industrialReviewTrace.workflowTemplateId || workflowIntent.workflowTemplateId,
    fallbackMode: industrialReviewTrace.fallbackMode || (workflowIntent.workflowTemplateId === 'industrial-design-review' ? 'multi-node' : undefined),
    createdGeneratorCount: industrialReviewTrace.createdGeneratorCount,
    connectedReferenceImageNodeIds: industrialReviewTrace.connectedReferenceImageNodeIds,
    workflowInputBindings: industrialReviewTrace.workflowInputBindings,
    workflowVisualFanout: industrialReviewTrace.workflowVisualFanout,
    workflowTextDependencies: industrialReviewTrace.workflowTextDependencies,
    workflowInputResolution: industrialReviewTrace.workflowInputResolution,
  };
  return {
    matchInput,
    activeSkillIds,
    contextScopes: scopes,
    activeSkillPrompt,
    compactContext,
    plan,
    deterministicLegacyActions,
    shouldUseDeterministicPlan,
    trace,
  };
}

export function useAppAgentRuntime(input: {
  getContext: () => AgentCanvasContext;
}) {
  return useMemo(() => ({
    prepareTurn: (userText: string) => prepareAppAgentTurn({
      userText,
      context: input.getContext(),
    }),
  }), [input]);
}
