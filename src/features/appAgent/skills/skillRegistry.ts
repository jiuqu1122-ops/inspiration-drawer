import type { AppAgentSkill, SkillMatchInput } from './types';
import { appNavigationSkill } from './appNavigationSkill';
import { drawerControlSkill } from './drawerControlSkill';
import { canvasControlSkill } from './canvasControlSkill';
import { creativeProductDesignSkill } from './creativeProductDesignSkill';
import { mediaToolSkill } from './mediaToolSkill';
import { workflowBuilderSkill } from './workflowBuilderSkill';
import { calendarControlSkill } from './calendarControlSkill';
import { serverRuntimeSkill } from './serverRuntimeSkill';

export const APP_AGENT_SKILLS: AppAgentSkill[] = [
  appNavigationSkill,
  drawerControlSkill,
  canvasControlSkill,
  creativeProductDesignSkill,
  mediaToolSkill,
  workflowBuilderSkill,
  calendarControlSkill,
  serverRuntimeSkill,
];

export function selectAppAgentSkills(input: SkillMatchInput) {
  return APP_AGENT_SKILLS
    .map(skill => ({
      skill,
      match: skill.match(input),
    }))
    .filter(entry => entry.match.matched)
    .sort((a, b) => b.match.score - a.match.score);
}
