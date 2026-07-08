import type { AgentCanvasContext } from '../../agentModel';
import type { AppAgentPlan, AppAgentCommand } from '../commands/commandTypes';
import type { AgentSkillId, ContextScope, RiskLevel } from '../skills/types';
import { extractCreativeBrief, isDirectCreativeExecutionRequest } from '../skills/creativeProductDesignSkill';

const createId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const maxRisk = (risks: RiskLevel[]): RiskLevel => {
  const order: RiskLevel[] = ['read', 'safe_write', 'external_network', 'costly', 'destructive', 'system_process'];
  return risks.reduce((best, risk) => (
    order.indexOf(risk) > order.indexOf(best) ? risk : best
  ), 'read' as RiskLevel);
};

const command = (
  domain: AppAgentCommand['domain'],
  action: string,
  args: Record<string, unknown>,
  riskLevel: RiskLevel,
  sourceSkillId?: AgentSkillId,
): AppAgentCommand => ({
  id: createId('app-agent-command'),
  domain,
  action,
  args,
  riskLevel,
  sourceSkillId,
  requiresConfirmation: ['costly', 'destructive', 'system_process'].includes(riskLevel),
});

export function buildAppAgentPlan(input: {
  userText: string;
  activeSkillIds: AgentSkillId[];
  contextScopes: ContextScope[];
  context?: AgentCanvasContext;
}): AppAgentPlan {
  const text = input.userText;
  const commands: AppAgentCommand[] = [];
  if (input.activeSkillIds.includes('app-navigation-skill')) {
    if (/打开抽屉|open drawer/i.test(text)) commands.push(command('app', 'open_drawer', {}, 'safe_write', 'app-navigation-skill'));
    if (/关闭抽屉|close drawer/i.test(text)) commands.push(command('app', 'close_drawer', {}, 'safe_write', 'app-navigation-skill'));
    if (/打开日历|日历/i.test(text)) commands.push(command('app', 'open_calendar', {}, 'safe_write', 'app-navigation-skill'));
    if (/打开设置|settings/i.test(text)) commands.push(command('app', 'open_settings', {}, 'safe_write', 'app-navigation-skill'));
  }
  if (input.activeSkillIds.includes('canvas-control-skill') && /清空画布/.test(text)) {
    commands.push(command('canvas', 'clear_canvas', {}, 'destructive', 'canvas-control-skill'));
  }
  if (input.activeSkillIds.includes('workflow-builder-skill') && /运行.*workflow|运行.*工作流/i.test(text)) {
    commands.push(command('workflow', 'run', { nodeIds: input.context?.selectedIds || [] }, 'costly', 'workflow-builder-skill'));
  }
  if (input.activeSkillIds.includes('creative-product-design-skill')) {
    const brief = extractCreativeBrief({
      userText: text,
      hasSelectedImages: !!input.context?.visualReferences?.length,
      selectedItemCount: input.context?.selectedIds?.length || 0,
      hasCanvasContext: !!input.context?.nodes?.length,
    }, input.context?.visualReferences?.map(reference => reference.nodeId));
    if (brief.requiresStoryboardFirst || brief.requiresStrategyFirst) {
      commands.push(command('canvas', 'create_text_agent', {
        prompt: brief.requiresStoryboardFirst ? `生成视频/分镜策略：\n${brief.generatorPrompt}` : `生成产品设计策略：\n${brief.generatorPrompt}`,
        inputIds: input.context?.selectedIds || [],
        autoRun: false,
      }, 'safe_write', 'creative-product-design-skill'));
    }
    if (!brief.requiresStoryboardFirst || isDirectCreativeExecutionRequest(text)) {
      commands.push(command('canvas', 'create_generator', {
        mediaType: brief.mediaType,
        prompt: brief.generatorPrompt,
        inputIds: input.context?.selectedIds || [],
        autoRun: brief.mediaType === 'image' && isDirectCreativeExecutionRequest(text),
        aspectRatio: brief.dimensions.aspectRatio || null,
        targetSize: brief.dimensions.targetSize || null,
        resolution: brief.dimensions.resolution || null,
        toolHint: brief.toolHint || null,
        referenceRoles: brief.imageRoles.map(role => ({ nodeId: role.imageId, role: role.role })),
        skillMeta: {
          skillId: 'creative-product-design-skill',
          originalRequest: text,
          fidelity: brief.fidelity,
          productCategory: brief.product.category,
          focus: brief.product.focus,
        },
      }, brief.mediaType === 'video' ? 'costly' : 'safe_write', 'creative-product-design-skill'));
    }
  }
  const riskLevel = maxRisk(commands.map(item => item.riskLevel));
  return {
    id: createId('app-agent-plan'),
    title: text.trim().split(/\r?\n/)[0]?.slice(0, 40) || 'App Agent Plan',
    userRequest: text,
    activeSkillIds: input.activeSkillIds,
    contextScopes: input.contextScopes,
    riskLevel,
    requiresConfirmation: commands.some(item => item.requiresConfirmation),
    commands,
  };
}
