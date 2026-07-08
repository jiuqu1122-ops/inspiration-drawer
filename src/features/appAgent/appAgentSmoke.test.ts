import { validateLegacyAgentAction, repairLegacyAgentAction } from './commands/commandValidator';
import { adaptCommandToLegacyAction } from './commands/legacyToolAdapter';
import { evaluateLegacyActionPermission } from './commands/permissionGate';
import { buildAppAgentContext } from './context/appAgentContextBuilder';
import { prepareAppAgentTurn } from './runtime/useAppAgentRuntime';
import { selectAppAgentSkills } from './skills/skillRegistry';
import { CANVAS_AGENT_ACTION_SCHEMA } from '../canvasAgentTools';
import type { AgentCanvasContext } from '../agentModel';

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

export function runAppAgentSmokeTests() {
  const baseContext: AgentCanvasContext = {
    surface: 'canvas',
    selectedIds: ['node-1', 'node-2'],
    selectedItems: [],
    visualReferences: [
      { id: 'ref-1', nodeId: 'node-1', name: 'ref 1', mediaType: 'image' },
      { id: 'ref-2', nodeId: 'node-2', name: 'ref 2', mediaType: 'image' },
    ],
    nodes: [
      { id: 'node-1', type: 'image', name: 'ref 1', inputs: [] },
      { id: 'node-2', type: 'image', name: 'ref 2', inputs: [] },
    ],
    presets: [],
    workflows: [{ id: 'workflow-1', label: 'workflow', hint: 'test workflow' }],
    drawer: {
      activeTab: 'all',
      activeFolderId: '',
      searchQuery: '',
      pinned: false,
      folders: [{ id: 'folder-1', name: 'refs' }],
      items: [{ id: 'item-1', type: 'image', name: 'drawer ref' }],
    },
  };

  const navigation = selectAppAgentSkills({ userText: '打开抽屉' }).map(entry => entry.skill.id);
  assert(navigation.includes('app-navigation-skill'), '打开抽屉 should match app-navigation-skill');
  const openDrawerTurn = prepareAppAgentTurn({ userText: '打开抽屉', context: baseContext });
  assert(
    openDrawerTurn.deterministicLegacyActions.some(action => action.tool === 'app_navigate' && action.arguments.action === 'open_drawer'),
    '打开抽屉 should produce deterministic app_navigate open_drawer',
  );

  const drawer = selectAppAgentSkills({ userText: '把这些素材移动到手柄参考文件夹', selectedItemCount: 2 }).map(entry => entry.skill.id);
  assert(drawer.includes('drawer-control-skill'), 'move materials should match drawer-control-skill');

  const creative = selectAppAgentSkills({ userText: '参考这几张图做一个手持控制器 CMF 方案，16:9', hasSelectedImages: true }).map(entry => entry.skill.id);
  assert(creative.includes('creative-product-design-skill'), 'CMF request should match creative skill');
  const schemaText = JSON.stringify(CANVAS_AGENT_ACTION_SCHEMA);
  assert(schemaText.includes('aspectRatio'), 'generator action schema should allow aspectRatio');
  assert(schemaText.includes('referenceRoles'), 'generator action schema should allow referenceRoles');
  assert(schemaText.includes('skillMeta'), 'generator action schema should allow skillMeta');
  const cmfTurn = prepareAppAgentTurn({
    userText: '参考这几张图做一个手持控制器 CMF 方案，16:9',
    context: baseContext,
  });
  const cmfGenerator = cmfTurn.deterministicLegacyActions.find(action => action.tool === 'canvas_create_generator');
  assert(cmfGenerator?.arguments.aspectRatio === '16:9', 'CMF generator should carry aspectRatio 16:9');
  assert(Array.isArray(cmfGenerator?.arguments.referenceRoles), 'CMF generator should carry referenceRoles');
  assert(!!cmfGenerator?.arguments.skillMeta, 'CMF generator should carry skillMeta');

  const storyboardTurn = prepareAppAgentTurn({
    userText: '做一个16比9的视频分镜',
    context: {
      ...baseContext,
      selectedIds: [],
      selectedItems: [],
      visualReferences: [],
    },
  });
  assert(storyboardTurn.activeSkillIds.includes('creative-product-design-skill'), 'storyboard should match creative skill');
  assert(!storyboardTurn.contextScopes.includes('drawer'), 'storyboard context should not include drawer by default');
  assert(storyboardTurn.shouldUseDeterministicPlan, 'storyboard should use deterministic plan');
  assert(storyboardTurn.trace.deterministicActionsUsed === true, 'storyboard trace should mark deterministic actions used');
  const storyboardTextAgent = storyboardTurn.deterministicLegacyActions.find(action => action.tool === 'canvas_create_text_agent');
  assert(!!storyboardTextAgent, 'storyboard should create a text-agent node');
  const storyboardPrompt = String(storyboardTextAgent?.arguments.prompt || '');
  assert(storyboardPrompt.includes('视频分镜脚本'), 'storyboard text-agent prompt should have storyboard title');
  assert(storyboardPrompt.includes('Aspect ratio: 16:9'), 'storyboard text-agent prompt should carry aspectRatio 16:9');
  assert(storyboardPrompt.includes('Original request: "做一个16比9的视频分镜"'), 'storyboard prompt should inject Original request');
  const storyboardGenerator = storyboardTurn.deterministicLegacyActions.find(action => action.tool === 'canvas_create_generator');
  if (storyboardGenerator) {
    assert(storyboardGenerator.arguments.autoRun === false, 'storyboard video generator should default autoRun false');
    assert(storyboardGenerator.arguments.aspectRatio === '16:9', 'storyboard video generator should carry aspectRatio');
  }

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

  const editWithoutBase = validateLegacyAgentAction({
    tool: 'canvas_create_generator',
    arguments: {
      mediaType: 'image',
      prompt: '只改这张图的背景，其他不要变\nOriginal request: "只改这张图的背景，其他不要变"',
      inputIds: [],
      autoRun: false,
    },
  }, baseContext, '只改这张图的背景，其他不要变');
  assert(!editWithoutBase.valid, 'edit without BASE should be blocked');
  assert(editWithoutBase.errors.some(error => error.includes('BASE')), 'edit without BASE should mention BASE');

  const legacy = adaptCommandToLegacyAction({
    id: 'command-1',
    domain: 'canvas',
    action: 'clear_canvas',
    args: {},
    riskLevel: 'destructive',
  });
  assert(legacy.tool === 'canvas_manage' && legacy.arguments.action === 'clear_canvas', 'legacy adapter should map canvas clear');
  const clearCanvasTurn = prepareAppAgentTurn({ userText: '清空画布', context: baseContext });
  assert(clearCanvasTurn.plan.riskLevel === 'destructive', 'clear canvas should be destructive');
  assert(clearCanvasTurn.plan.requiresConfirmation, 'clear canvas should require confirmation');
  const clearCanvasPermission = evaluateLegacyActionPermission(clearCanvasTurn.deterministicLegacyActions[0], { userText: '清空画布' });
  assert(clearCanvasPermission.requiresConfirmation, 'permission gate should stop clear canvas for confirmation');

  const appContextSchemaText = JSON.stringify(CANVAS_AGENT_ACTION_SCHEMA);
  assert(appContextSchemaText.includes('scopes'), 'app_get_context schema should allow scopes');
  const scopedContext = buildAppAgentContext(baseContext, { scopes: ['canvas', 'drawer'], detail: 'compact' }) as Record<string, unknown>;
  assert(!!scopedContext.drawer, 'scoped compact context should include drawer scope');
  assert(((scopedContext.drawer as Record<string, unknown>).items as unknown[]).length === 0, 'drawer compact context should omit unselected and unsearched items');
  assert(!!scopedContext.nodes, 'scoped compact context should include canvas nodes');
  assert(!scopedContext.calendar, 'scoped compact context should omit unrequested calendar scope');
}

export const APP_AGENT_SMOKE_TESTS = [
  '打开抽屉 -> app-navigation-skill',
  '移动素材 -> drawer-control-skill',
  'CMF 16:9 -> creative skill + aspectRatio + Original request',
  'CMF 16:9 -> generator schema allows aspectRatio/referenceRoles/skillMeta',
  '视频分镜 16比9 -> creative skill + canvas-only context + deterministic text-agent',
  'edit background without BASE -> validator blocks',
  '清空画布 command -> canvas_manage clear_canvas',
  'app_get_context scopes canvas drawer -> compact scoped context',
];
