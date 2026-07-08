import type { AgentSkillId, ContextScope, RiskLevel } from '../skills/types';

export interface AppAgentCommand {
  id: string;
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
  actions: Array<{
    tool: string;
    arguments: Record<string, unknown>;
  }>;
}

export type LegacyAgentAction = AppAgentEnvelope['actions'][number];
