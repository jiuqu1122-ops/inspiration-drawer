import { validateLegacyAgentAction, repairLegacyAgentAction } from './commands/commandValidator';
import { adaptCommandToLegacyAction } from './commands/legacyToolAdapter';
import { selectAppAgentSkills } from './skills/skillRegistry';

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

export function runAppAgentSmokeTests() {
  const navigation = selectAppAgentSkills({ userText: '打开抽屉' }).map(entry => entry.skill.id);
  assert(navigation.includes('app-navigation-skill'), '打开抽屉 should match app-navigation-skill');

  const drawer = selectAppAgentSkills({ userText: '把这些素材移动到手柄参考文件夹', selectedItemCount: 2 }).map(entry => entry.skill.id);
  assert(drawer.includes('drawer-control-skill'), 'move materials should match drawer-control-skill');

  const creative = selectAppAgentSkills({ userText: '参考这几张图做一个手持控制器 CMF 方案，16:9', hasSelectedImages: true }).map(entry => entry.skill.id);
  assert(creative.includes('creative-product-design-skill'), 'CMF request should match creative skill');

  const repaired = repairLegacyAgentAction({
    tool: 'canvas_create_generator',
    arguments: { mediaType: 'image', prompt: '做一个手持控制器 CMF 方案', inputIds: ['node-1'], autoRun: false },
  }, '参考这几张图做一个手持控制器 CMF 方案，16:9');
  assert(repaired.arguments.aspectRatio === '16:9', 'creative repair should map aspectRatio');
  assert(String(repaired.arguments.prompt).includes('Original request:'), 'creative repair should inject Original request');

  const validation = validateLegacyAgentAction(repaired, {
    selectedIds: ['node-1'],
    nodes: [{ id: 'node-1', type: 'image', name: 'ref', inputs: [] }],
    presets: [],
    workflows: [],
    visualReferences: [{ id: 'ref-1', nodeId: 'node-1', name: 'ref', mediaType: 'image' }],
  }, '参考这几张图做一个手持控制器 CMF 方案，16:9');
  assert(validation.valid, validation.errors.join('; '));

  const legacy = adaptCommandToLegacyAction({
    id: 'command-1',
    domain: 'canvas',
    action: 'clear_canvas',
    args: {},
    riskLevel: 'destructive',
  });
  assert(legacy.tool === 'canvas_manage' && legacy.arguments.action === 'clear_canvas', 'legacy adapter should map canvas clear');
}

export const APP_AGENT_SMOKE_TESTS = [
  '打开抽屉 -> app-navigation-skill',
  '移动素材 -> drawer-control-skill',
  'CMF 16:9 -> creative skill + aspectRatio + Original request',
  '清空画布 command -> canvas_manage clear_canvas',
];
