import type { AgentSkillId, ContextScope } from '../skills/types';
import type { AppAgentPlan, LegacyAgentAction } from '../commands/commandTypes';
import type { WorkflowFallbackMode, WorkflowOutputType } from '../skills/workflowBuilderSkill';

export interface AppAgentTraceRecord {
  id: string;
  createdAt: number;
  userRequest: string;
  activeSkillIds: AgentSkillId[];
  contextScopes: ContextScope[];
  plan?: AppAgentPlan;
  plannedCommands?: AppAgentPlan['commands'];
  executedLegacyActions?: LegacyAgentAction[];
  llmGeneratedActions?: LegacyAgentAction[];
  deterministicActionsUsed?: boolean;
  plannedStepRefs?: string[];
  resolvedStepRefs?: Record<string, string>;
  createdNodeIds?: string[];
  unresolvedInputIds?: string[];
  fallbackUsed?: boolean;
  fallbackReason?: string;
  workflowIntentDetected?: boolean;
  outputTypes?: WorkflowOutputType[];
  workflowTemplateId?: string;
  fallbackMode?: WorkflowFallbackMode;
  createdGeneratorCount?: number;
  connectedReferenceImageNodeIds?: string[];
  workflowResolvedImageNodeIds?: string[];
  workflowAutoConnections?: Array<{ sourceId: string; targetId: string }>;
  workflowMissingRequiredInputs?: string[];
  confirmationRequired?: boolean;
  executionResults?: unknown[];
  errors?: string[];
  repaired?: boolean;
}

export const createAppAgentTraceId = () => (
  `app-agent-trace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
);
