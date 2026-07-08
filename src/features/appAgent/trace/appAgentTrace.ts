import type { AgentSkillId, ContextScope } from '../skills/types';
import type { AppAgentPlan, LegacyAgentAction } from '../commands/commandTypes';

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
  confirmationRequired?: boolean;
  executionResults?: unknown[];
  errors?: string[];
  repaired?: boolean;
}

export const createAppAgentTraceId = () => (
  `app-agent-trace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
);
