import { useMemo } from 'react';
import type { AgentCanvasContext } from '../../agentModel';
import { buildAppAgentContext } from '../context/appAgentContextBuilder';
import { buildAppAgentPlan } from '../kernel/appAgentKernel';
import { selectAppAgentSkills } from '../skills/skillRegistry';
import type { AgentSkillId, ContextScope, SkillMatchInput } from '../skills/types';
import { uniqueStrings } from '../skills/skillUtils';
import { createAppAgentTraceId, type AppAgentTraceRecord } from '../trace/appAgentTrace';

export interface PreparedAppAgentTurn {
  matchInput: SkillMatchInput;
  activeSkillIds: AgentSkillId[];
  contextScopes: ContextScope[];
  activeSkillPrompt: string;
  compactContext: unknown;
  plan: ReturnType<typeof buildAppAgentPlan>;
  trace: AppAgentTraceRecord;
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
  const trace: AppAgentTraceRecord = {
    id: createAppAgentTraceId(),
    createdAt: Date.now(),
    userRequest: input.userText,
    activeSkillIds,
    contextScopes: scopes,
    plan,
    commands: plan.commands,
    confirmationRequired: plan.requiresConfirmation,
  };
  return {
    matchInput,
    activeSkillIds,
    contextScopes: scopes,
    activeSkillPrompt,
    compactContext,
    plan,
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
