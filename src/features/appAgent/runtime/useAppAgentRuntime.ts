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
