import type { AgentCanvasContext } from '../../agentModel';
import type { AppAgentPlan, AppAgentCommand } from '../commands/commandTypes';
import type { AgentSkillId, ContextScope, RiskLevel } from '../skills/types';
import {
  extractCreativeBrief,
  isDirectCreativeExecutionRequest,
  isExplicitVideoGenerationRequest,
  type CreativeBrief,
} from '../skills/creativeProductDesignSkill';

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
  meta: Pick<AppAgentCommand, 'stepId' | 'createsNode' | 'outputRef'> = {},
): AppAgentCommand => ({
  id: createId('app-agent-command'),
  ...meta,
  domain,
  action,
  args,
  riskLevel,
  sourceSkillId,
  requiresConfirmation: ['costly', 'destructive', 'system_process'].includes(riskLevel),
});

const buildStoryboardTextAgentPrompt = (brief: CreativeBrief) => [
  '视频分镜脚本',
  brief.dimensions.aspectRatio ? `Aspect ratio: ${brief.dimensions.aspectRatio}` : 'Aspect ratio: follow the user request or selected platform.',
  '请先产出可执行的视频分镜脚本，覆盖镜头顺序、单镜头时长、转场方式、主体动作、关键帧和风格一致性。',
  '不要默认直接运行视频生成；如果后续需要创建 video generator，autoRun 必须默认为 false。',
  brief.generatorPrompt,
].join('\n');

const buildProductStrategyTextAgentPrompt = (brief: CreativeBrief) => [
  '产品设计策略',
  '请先产出产品外观/CMF 策略，覆盖产品类型、使用方式、造型重点、CMF 边界、结构可信度和主要设计风险。',
  brief.generatorPrompt,
].join('\n');

const buildStoryboardSheetPrompt = (brief: CreativeBrief) => [
  `${brief.dimensions.aspectRatio || '16:9'} 视频分镜图 / Storyboard Sheet`,
  'Generate a 4-6 panel visual storyboard sheet from the connected storyboard script and selected references.',
  'Keep shot order, duration cues, transitions, subject action, key frames, and visual style consistent.',
  brief.generatorPrompt,
].join('\n');

const getSelectedImageNodeIds = (context?: AgentCanvasContext) => {
  const selectedIds = new Set((context?.selectedIds || []).map(String));
  const nodeById = new Map((context?.nodes || []).map(node => [node.id, node]));
  const fromVisualReferences = (context?.visualReferences || [])
    .filter(reference => reference.mediaType === 'image')
    .map(reference => reference.nodeId);
  const fromSelectedIds = Array.from(selectedIds).filter(id => {
    const node = nodeById.get(id);
    return !!node && /image|image-generator|generated-image/i.test(node.type || '');
  });
  return Array.from(new Set([...fromSelectedIds, ...fromVisualReferences].filter(Boolean)));
};

const shouldAutoRunVideoGenerator = (text: string) => (
  /直接.*(?:生成|做成|输出|出).*视频|直接生成视频|直接出视频/i.test(text)
);

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
    const selectedImageNodeIds = getSelectedImageNodeIds(input.context);
    const textAgentStepId = brief.requiresStoryboardFirst ? 'storyboardScript' : 'productStrategy';
    const textAgentOutputRef = `$${textAgentStepId}.nodeId`;
    if (brief.requiresStoryboardFirst || brief.requiresStrategyFirst) {
      commands.push(command('canvas', 'create_text_agent', {
        prompt: brief.requiresStoryboardFirst
          ? buildStoryboardTextAgentPrompt(brief)
          : buildProductStrategyTextAgentPrompt(brief),
        inputIds: input.context?.selectedIds || [],
        autoRun: false,
      }, 'safe_write', 'creative-product-design-skill', {
        stepId: textAgentStepId,
        createsNode: true,
        outputRef: textAgentOutputRef,
      }));
    }
    if (brief.requiresStoryboardFirst && !isExplicitVideoGenerationRequest(text)) {
      commands.push(command('canvas', 'create_generator', {
        mediaType: 'image',
        prompt: buildStoryboardSheetPrompt(brief),
        inputIds: [textAgentOutputRef, ...selectedImageNodeIds],
        referenceImageNodeIds: selectedImageNodeIds,
        autoRun: false,
        aspectRatio: brief.dimensions.aspectRatio || null,
        targetSize: brief.dimensions.targetSize || null,
        resolution: brief.dimensions.resolution || null,
        toolHint: brief.toolHint || null,
        referenceRoles: brief.imageRoles.map(role => ({ nodeId: role.imageId, role: role.role })),
        skillMeta: {
          skillId: 'creative-product-design-skill',
          originalRequest: text,
          taskKind: 'storyboard',
          fidelity: brief.fidelity,
          productCategory: brief.product.category,
          focus: brief.product.focus,
        },
      }, 'safe_write', 'creative-product-design-skill', {
        stepId: 'storyboardSheet',
        createsNode: true,
        outputRef: '$storyboardSheet.nodeId',
      }));
    } else if (!brief.requiresStoryboardFirst || isDirectCreativeExecutionRequest(text)) {
      commands.push(command('canvas', 'create_generator', {
        mediaType: brief.mediaType,
        prompt: brief.generatorPrompt,
        inputIds: Array.from(new Set([
          ...(input.context?.selectedIds || []),
          ...(brief.requiresStrategyFirst ? [textAgentOutputRef] : []),
        ])),
        autoRun: brief.mediaType === 'video'
          ? shouldAutoRunVideoGenerator(text)
          : isDirectCreativeExecutionRequest(text),
        aspectRatio: brief.dimensions.aspectRatio || null,
        targetSize: brief.dimensions.targetSize || null,
        resolution: brief.dimensions.resolution || null,
        toolHint: brief.toolHint || null,
        referenceRoles: brief.imageRoles.map(role => ({ nodeId: role.imageId, role: role.role })),
        skillMeta: {
          skillId: 'creative-product-design-skill',
          originalRequest: text,
          taskKind: brief.taskKind,
          fidelity: brief.fidelity,
          productCategory: brief.product.category,
          focus: brief.product.focus,
        },
      }, brief.mediaType === 'video' ? 'costly' : 'safe_write', 'creative-product-design-skill', {
        stepId: brief.mediaType === 'video' ? 'videoGenerator' : 'creativeGenerator',
        createsNode: true,
        outputRef: brief.mediaType === 'video' ? '$videoGenerator.nodeId' : '$creativeGenerator.nodeId',
      }));
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
