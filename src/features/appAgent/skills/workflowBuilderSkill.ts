import type { AppAgentSkill, ContextScope } from './types';
import { matchKeywords } from './skillUtils';

const WORKFLOW_KEYWORDS = [
  '工作流',
  'workflow',
  '自动化流程',
  '封装',
  '复用',
  '多阶段',
  '详情页五图',
  '产品一致性',
  '套流程',
] as const;

export const workflowBuilderSkill: AppAgentSkill = {
  id: 'workflow-builder-skill',
  label: 'Workflow Builder',
  description: '可复用工作流、多阶段生成链路和产品一致性流程。',
  match: input => matchKeywords(input.userText, WORKFLOW_KEYWORDS),
  getRequiredContext: (): ContextScope[] => ['canvas'],
  buildPromptPatch: () => [
    'Active skill: workflow-builder-skill.',
    'Use canvas_apply_workflow for existing workflows and canvas_create_workflow only when the user asks for reusable or multi-stage workflows.',
    'Workflow steps must be compact, non-empty and connected by inputStepIds when later steps depend on earlier ones.',
    'For product detail-page workflows, pass compact intent and steps; the app can compile the local DAG.',
  ].join('\n'),
};
