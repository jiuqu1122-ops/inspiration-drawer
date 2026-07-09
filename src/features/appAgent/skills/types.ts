export type AgentSkillId =
  | 'app-navigation-skill'
  | 'drawer-control-skill'
  | 'canvas-control-skill'
  | 'creative-product-design-skill'
  | 'ecommerce-detail-page-skill'
  | 'media-tool-skill'
  | 'workflow-builder-skill'
  | 'calendar-control-skill'
  | 'server-runtime-skill';

export type ContextScope =
  | 'minimal'
  | 'app'
  | 'drawer'
  | 'canvas'
  | 'calendar'
  | 'settings'
  | 'server'
  | 'ui'
  | 'full';

export type RiskLevel =
  | 'read'
  | 'safe_write'
  | 'costly'
  | 'destructive'
  | 'external_network'
  | 'system_process';

export interface SkillMatchInput {
  userText: string;
  surface?: string;
  selectedItemCount?: number;
  selectedNodeCount?: number;
  hasSelectedImages?: boolean;
  hasCanvasContext?: boolean;
}

export interface SkillMatchResult {
  matched: boolean;
  score: number;
  reasons: string[];
}

export interface AppAgentSkill {
  id: AgentSkillId;
  label: string;
  description: string;
  match(input: SkillMatchInput): SkillMatchResult;
  getRequiredContext?(input: SkillMatchInput): ContextScope[];
  buildPromptPatch?(input: SkillMatchInput): string;
}

export const noSkillMatch = (): SkillMatchResult => ({
  matched: false,
  score: 0,
  reasons: [],
});

export const createSkillMatch = (score: number, reasons: string[]): SkillMatchResult => ({
  matched: score > 0,
  score,
  reasons,
});
