import type { AgentSkillId, ContextScope } from '../skills/types';
import type { AppAgentPlan, LegacyAgentAction } from '../commands/commandTypes';

export interface AppAgentTraceRecord {
  id: string;
  createdAt: number;
  userRequest: string;
  activeSkillIds: AgentSkillId[];
  contextScopes: ContextScope[];
  plan?: AppAgentPlan;
  commands?: AppAgentPlan['commands'];
  legacyActions?: LegacyAgentAction[];
  confirmationRequired?: boolean;
  executionResults?: unknown[];
  errors?: string[];
  repaired?: boolean;
}

export const createAppAgentTraceId = () => (
  `app-agent-trace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
);
