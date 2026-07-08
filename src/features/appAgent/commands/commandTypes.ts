import type { AgentSkillId, ContextScope, RiskLevel } from '../skills/types';

export interface AppAgentCommand {
  id: string;
  stepId?: string;
  createsNode?: boolean;
  outputRef?: string;
  domain:
    | 'app'
    | 'drawer'
    | 'canvas'
    | 'calendar'
    | 'media'
    | 'workflow'
    | 'server'
    | 'ui';
  action: string;
  args: Record<string, unknown>;
  riskLevel: RiskLevel;
  sourceSkillId?: AgentSkillId;
  requiresConfirmation?: boolean;
}

export interface AppAgentPlan {
  id: string;
  title: string;
  userRequest: string;
  activeSkillIds: AgentSkillId[];
  contextScopes: ContextScope[];
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  commands: AppAgentCommand[];
}

export interface AppAgentEnvelope {
  reply: string;
  plan?: AppAgentPlan;
  actions: LegacyAgentAction[];
}

export interface LegacyAgentAction {
  tool: string;
  arguments: Record<string, unknown>;
  stepId?: string;
  createsNode?: boolean;
  outputRef?: string;
  sourceCommandId?: string;
}
