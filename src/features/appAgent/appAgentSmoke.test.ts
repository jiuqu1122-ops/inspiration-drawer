import { validateLegacyAgentAction, repairLegacyAgentAction } from './commands/commandValidator';
import { adaptCommandToLegacyAction } from './commands/legacyToolAdapter';
import { evaluateLegacyActionPermission } from './commands/permissionGate';
import { resolveWorkflowInputs } from './commands/workflowInputResolver';
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
    context: baseContext,
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
  assert(!!storyboardGenerator, 'storyboard should create an image generator for storyboard sheet');
  assert(storyboardGenerator?.arguments.mediaType === 'image', 'plain storyboard should create image generator, not video');
  assert(storyboardGenerator?.arguments.autoRun === false, 'storyboard image generator should default autoRun false');
  assert(storyboardGenerator?.arguments.aspectRatio === '16:9', 'storyboard image generator should carry aspectRatio');
  const storyboardInputIds = Array.isArray(storyboardGenerator?.arguments.inputIds)
    ? storyboardGenerator.arguments.inputIds.map(String)
    : [];
  assert(storyboardInputIds.includes('$storyboardScript.nodeId'), 'storyboard generator should reference text-agent outputRef before runtime binding');
  assert(storyboardInputIds.includes('node-1'), 'storyboard generator should include selected image nodeId');
  assert(!storyboardInputIds.some(id => /^canvas_text_canvas-/i.test(id)), 'storyboard generator should not include predicted canvas text nodeId');
  assert(!storyboardTurn.deterministicLegacyActions.some(action => action.tool === 'canvas_create_generator' && action.arguments.mediaType === 'video'), 'plain storyboard should not create video generator');

  const videoTurn = prepareAppAgentTurn({
    userText: '根据这个分镜生成视频',
    context: baseContext,
  });
  const videoGenerator = videoTurn.deterministicLegacyActions.find(action => action.tool === 'canvas_create_generator');
  assert(videoGenerator?.arguments.mediaType === 'video', 'explicit video generation should create video generator');
  assert(videoGenerator?.arguments.autoRun === false, 'video generator should default autoRun false');

  const industrialReviewRequest = '帮我设计一个工作流，可以根据参考产品图，自动生成一套工业设计评审图：包括视频图、细节图、CMF图、场景图、高级氛围图等';
  const industrialReviewContext: AgentCanvasContext = {
    ...baseContext,
    selectedIds: ['product-image-node'],
    visualReferences: [
      { id: 'product-ref', nodeId: 'product-image-node', name: 'product reference', mediaType: 'image' },
    ],
    nodes: [
      { id: 'product-image-node', type: 'image', name: 'product reference', inputs: [] },
    ],
  };
  const industrialReviewTurn = prepareAppAgentTurn({
    userText: industrialReviewRequest,
    context: industrialReviewContext,
  });
  assert(industrialReviewTurn.activeSkillIds.includes('workflow-builder-skill'), 'industrial review workflow should match workflow-builder-skill');
  assert(industrialReviewTurn.activeSkillIds.includes('creative-product-design-skill'), 'industrial review workflow should also match creative-product-design-skill');
  assert(industrialReviewTurn.shouldUseDeterministicPlan, 'industrial review workflow should use deterministic plan');
  assert(industrialReviewTurn.trace.deterministicActionsUsed === true, 'industrial review workflow trace should mark deterministic actions used');
  const industrialCreateActions = industrialReviewTurn.deterministicLegacyActions
    .filter(action => action.tool === 'canvas_create_text_agent' || action.tool === 'canvas_create_generator');
  assert(industrialCreateActions.length >= 6, 'industrial review workflow should create at least 6 nodes');
  const industrialStrategy = industrialReviewTurn.deterministicLegacyActions
    .find(action => action.tool === 'canvas_create_text_agent');
  assert(!!industrialStrategy, 'industrial review workflow should create a strategy text-agent');
  assert(String(industrialStrategy?.arguments.prompt || '').includes('工业设计评审策略'), 'strategy text-agent should be titled as industrial review strategy');
  const industrialGenerators = industrialReviewTurn.deterministicLegacyActions
    .filter(action => action.tool === 'canvas_create_generator');
  assert(industrialGenerators.length >= 5, 'industrial review workflow should create multiple image generators');
  assert(industrialGenerators.every(action => action.arguments.mediaType === 'image'), 'industrial review workflow should create image generators');
  assert(!industrialGenerators.some(action => action.arguments.mediaType === 'video'), 'video key visual should not create video generator by default');
  const industrialPromptText = industrialGenerators.map(action => String(action.arguments.prompt || '')).join('\n');
  assert(/Hero|主视觉|产品评审/.test(industrialPromptText), 'industrial review workflow should include hero/product review generator');
  assert(/Detail|细节图/.test(industrialPromptText), 'industrial review workflow should include detail generator');
  assert(/CMF/.test(industrialPromptText), 'industrial review workflow should include CMF generator');
  assert(/Usage Scene|场景图/.test(industrialPromptText), 'industrial review workflow should include scene generator');
  assert(/Premium Mood|高级氛围图/.test(industrialPromptText), 'industrial review workflow should include premium mood generator');
  assert(/Storyboard|视频分镜图|video key visual/.test(industrialPromptText), 'industrial review workflow should include storyboard/key visual image generator');
  industrialGenerators.forEach(action => {
    const inputIds = Array.isArray(action.arguments.inputIds) ? action.arguments.inputIds.map(String) : [];
    const referenceImageNodeIds = Array.isArray(action.arguments.referenceImageNodeIds)
      ? action.arguments.referenceImageNodeIds.map(String)
      : [];
    assert(inputIds.includes('product-image-node'), 'each industrial review generator inputIds should include selected product image');
    assert(referenceImageNodeIds.includes('product-image-node'), 'each industrial review generator referenceImageNodeIds should include selected product image');
    assert(String(action.arguments.prompt || '').includes(`Original request: "${industrialReviewRequest}"`), 'each industrial review generator prompt should include Original request');
    const meta = action.arguments.skillMeta && typeof action.arguments.skillMeta === 'object' && !Array.isArray(action.arguments.skillMeta)
      ? action.arguments.skillMeta as Record<string, unknown>
      : {};
    assert(String(meta.skillId || '').includes('creative-product-design-skill') || String(meta.skillId || '').includes('workflow-builder-skill'), 'generator skillMeta should include app skill id');
  });
  assert(
    industrialReviewTurn.deterministicLegacyActions.some(action => action.tool === 'canvas_organize'),
    'industrial review workflow should end with canvas_organize',
  );
  assert(industrialReviewTurn.trace.workflowIntentDetected === true, 'trace should record workflowIntentDetected');
  assert(industrialReviewTurn.trace.workflowTemplateId === 'industrial-design-review', 'trace should record workflowTemplateId');
  assert(industrialReviewTurn.trace.fallbackMode === 'multi-node', 'trace should record multi-node fallback mode');
  assert(industrialReviewTurn.trace.createdGeneratorCount === industrialGenerators.length, 'trace should record created generator count');
  assert(industrialReviewTurn.trace.connectedReferenceImageNodeIds?.includes('product-image-node') === true, 'trace should record connected reference image node ids');
  assert(industrialReviewTurn.trace.outputTypes?.includes('cmf_board') === true, 'trace should include CMF output type');
  assert(industrialReviewTurn.trace.outputTypes?.includes('storyboard_or_video_keyframe') === true, 'trace should include storyboard/key visual output type');

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

  const commerceWorkflow = {
    id: 'commerce-workflow',
    label: 'Commerce hero',
    nodes: [
      {
        id: 'product_refs',
        item: { type: 'image', name: 'Product refs' },
        acceptsExternalInputs: true,
        externalInputTypes: ['image'],
        outputType: 'image[]',
      },
      {
        id: 'commerce-hero',
        inputs: ['product_refs'],
        item: { type: 'text', name: 'commerce hero' },
        ai: {
          type: 'image-generator',
          presetPrompt: 'Create commerce-hero from connected product reference images.',
        },
      },
    ],
  };
  const workflowCanvasResolution = resolveWorkflowInputs({
    workflow: commerceWorkflow,
    selectedNodeIds: ['product-image-node'],
    canvasNodes: [{ id: 'product-image-node', type: 'image', name: 'product', inputs: [] }],
  });
  assert(workflowCanvasResolution.resolvedImageNodeIds.includes('product-image-node'), 'workflow resolver should use selected canvas product image');
  assert(workflowCanvasResolution.autoConnections.some(connection => connection.sourceId === 'product-image-node' && connection.targetId === 'product_refs'), 'workflow resolver should connect selected image to external product refs');

  const workflowDrawerResolution = resolveWorkflowInputs({
    workflow: commerceWorkflow,
    selectedDrawerItems: [{ id: 'drawer-image-1', type: 'image', name: 'drawer product' }],
    canvasNodes: [],
  });
  assert(workflowDrawerResolution.nodesToCreateFromDrawerItems.includes('drawer-image-1'), 'workflow resolver should request canvas node creation for selected drawer image');

  const workflowMissingResolution = resolveWorkflowInputs({
    workflow: commerceWorkflow,
    selectedNodeIds: [],
    canvasNodes: [],
  });
  assert(workflowMissingResolution.missingRequiredInputs.length > 0, 'workflow resolver should block missing product/reference images');
}

export const APP_AGENT_SMOKE_TESTS = [
  '打开抽屉 -> app-navigation-skill',
  '移动素材 -> drawer-control-skill',
  'CMF 16:9 -> creative skill + aspectRatio + Original request',
  'CMF 16:9 -> generator schema allows aspectRatio/referenceRoles/skillMeta',
  '视频分镜 16比9 -> creative skill + canvas-only context + deterministic text-agent + image generator binding',
  '根据分镜生成视频 -> video generator autoRun false',
  '工业设计评审工作流 -> workflow + creative skills + multi-node image generator plan',
  'workflow resolver -> selected/drawer/missing product images',
  'edit background without BASE -> validator blocks',
  '清空画布 command -> canvas_manage clear_canvas',
  'app_get_context scopes canvas drawer -> compact scoped context',
];
