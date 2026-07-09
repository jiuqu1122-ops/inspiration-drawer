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
  assert(schemaText.includes('reference_image_bridge'), 'workflow action schema should allow reference_image_bridge');
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
  const workflowCreateAction = industrialReviewTurn.deterministicLegacyActions.find(action => action.tool === 'canvas_create_workflow');
  assert(!!workflowCreateAction, 'explicit industrial review workflow should create a workflow module action');
  assert(!industrialReviewTurn.deterministicLegacyActions.some(action => action.tool === 'canvas_create_text_agent'), 'workflow_module should not create loose strategy text-agent');
  assert(!industrialReviewTurn.deterministicLegacyActions.some(action => action.tool === 'canvas_create_generator'), 'workflow_module should not create loose generator nodes');
  const workflowDefinition = workflowCreateAction?.arguments.workflowDefinition as Record<string, unknown>;
  assert(!!workflowDefinition, 'workflow action should include workflowDefinition');
  assert(workflowDefinition.templateId === 'industrial-design-review', 'workflowDefinition should use industrial-design-review template');
  assert(workflowDefinition.creationMode === 'workflow_module', 'workflowDefinition should use workflow_module mode');
  const workflowInputs = Array.isArray(workflowDefinition.inputs) ? workflowDefinition.inputs as Array<Record<string, unknown>> : [];
  assert(workflowInputs.some(input => input.id === 'product_reference_image' && input.type === 'image'), 'workflowDefinition should include product_reference_image input');
  const workflowSteps = Array.isArray(workflowDefinition.steps) ? workflowDefinition.steps as Array<Record<string, unknown>> : [];
  const workflowBridgeStep = workflowSteps.find(step => step.id === 'product_reference_image');
  assert(workflowBridgeStep?.type === 'reference_image_bridge', 'workflowDefinition should include reference_image_bridge step');
  assert(workflowBridgeStep?.bridgeType === 'reference_image', 'workflow bridge step should be a reference image bridge');
  const workflowGeneratorSteps = workflowSteps.filter(step => step.type === 'image_generator');
  assert(workflowDefinition.strategyStepMode === 'disabled', 'workflowDefinition should disable strategy step by default');
  assert(!workflowSteps.some(step => step.id === 'industrial_design_review_strategy'), 'workflowDefinition should not include internal strategy step by default');
  assert(workflowGeneratorSteps.length >= 5, 'workflowDefinition should include multiple image generator steps');
  assert(workflowGeneratorSteps.some(step => /hero/i.test(String(step.id))), 'workflowDefinition should include hero/product review generator');
  assert(workflowGeneratorSteps.some(step => /detail/i.test(String(step.id))), 'workflowDefinition should include detail generator');
  assert(workflowGeneratorSteps.some(step => /cmf/i.test(String(step.id))), 'workflowDefinition should include CMF generator');
  assert(workflowGeneratorSteps.some(step => /usage_scene/i.test(String(step.id))), 'workflowDefinition should include usage scene generator');
  assert(workflowGeneratorSteps.some(step => /premium_mood/i.test(String(step.id))), 'workflowDefinition should include premium mood generator');
  assert(workflowGeneratorSteps.some(step => /storyboard|video/i.test(String(step.id))), 'workflowDefinition should include storyboard/key visual image generator');
  workflowGeneratorSteps.forEach(step => {
    assert(step.mediaType === 'image', 'workflow generator step should be image mediaType');
    assert(Array.isArray(step.visualInputStepIds) && step.visualInputStepIds.includes('product_reference_image'), 'each workflow generator should directly include product_reference_image visual input');
    assert(!Array.isArray(step.textInputStepIds) || step.textInputStepIds.length === 0, 'default workflow generator should not depend on strategy text input');
    assert(String(step.prompt || '').includes(`Original request: "${industrialReviewRequest}"`), 'each workflow generator prompt should include Original request');
    const meta = step.skillMeta && typeof step.skillMeta === 'object' && !Array.isArray(step.skillMeta)
      ? step.skillMeta as Record<string, unknown>
      : {};
    assert(String(meta.skillId || '').includes('creative-product-design-skill') || String(meta.skillId || '').includes('workflow-builder-skill'), 'workflow generator skillMeta should include app skill id');
  });
  const workflowInputBindings = workflowCreateAction?.arguments.inputBindings as Record<string, unknown>;
  const productReferenceBinding = workflowInputBindings.product_reference_image as Record<string, unknown>;
  assert(productReferenceBinding.kind === 'canvas_node', 'workflow action should bind selected product image as existing canvas node');
  assert(productReferenceBinding.nodeId === 'product-image-node', 'selected product image should bind to product_reference_image');
  assert(industrialReviewTurn.trace.workflowIntentDetected === true, 'trace should record workflowIntentDetected');
  assert(industrialReviewTurn.trace.workflowCreationMode === 'workflow_module', 'trace should record workflow_module mode');
  assert(industrialReviewTurn.trace.workflowTemplateId === 'industrial-design-review', 'trace should record workflowTemplateId');
  assert(industrialReviewTurn.trace.fallbackMode === 'workflow', 'trace should record workflow fallback mode');
  assert(industrialReviewTurn.trace.createdGeneratorCount === workflowGeneratorSteps.length, 'trace should record created generator count from workflowDefinition');
  assert(industrialReviewTurn.trace.connectedReferenceImageNodeIds?.includes('product-image-node') === true, 'trace should record connected reference image node ids');
  assert(industrialReviewTurn.trace.workflowInputBindings?.product_reference_image?.includes('product-image-node') === true, 'trace should record workflow input bindings');
  assert(industrialReviewTurn.trace.workflowVisualFanout?.some(item => item.targetStepId === 'cmf_board' && item.inputId === 'product_reference_image') === true, 'trace should record workflow visual fanout');
  assert((industrialReviewTurn.trace.workflowTextDependencies || []).length === 0, 'trace should not record workflow text dependencies by default');
  assert(industrialReviewTurn.trace.workflowInputResolution?.reusedExistingImageNodes.includes('product-image-node') === true, 'trace should record reused existing image node');
  assert(industrialReviewTurn.trace.workflowInputResolution?.createdImageNodes.length === 0, 'trace should not create new image nodes when selected canvas image exists');
  assert(industrialReviewTurn.trace.workflowInputResolution?.thumbnailPlaceholdersCreated === 0, 'trace should not create thumbnail placeholders');
  assert(industrialReviewTurn.trace.outputTypes?.includes('cmf_board') === true, 'trace should include CMF output type');
  assert(industrialReviewTurn.trace.outputTypes?.includes('storyboard_or_video_key_visual') === true, 'trace should include storyboard/key visual output type');

  const strategyDisabledTurn = prepareAppAgentTurn({
    userText: '帮我设计一个工作流，根据参考产品图生成细节图、CMF图、场景图，不要分析，直接出图',
    context: industrialReviewContext,
  });
  const strategyDisabledDefinition = strategyDisabledTurn.deterministicLegacyActions
    .find(action => action.tool === 'canvas_create_workflow')?.arguments.workflowDefinition as Record<string, unknown>;
  const strategyDisabledSteps = Array.isArray(strategyDisabledDefinition.steps) ? strategyDisabledDefinition.steps as Array<Record<string, unknown>> : [];
  assert(strategyDisabledDefinition.strategyStepMode === 'disabled', 'direct output workflow should disable strategy step');
  assert(!strategyDisabledSteps.some(step => step.type === 'text_agent'), 'strategy disabled workflow should not include strategy step');
  assert(strategyDisabledSteps.filter(step => step.type === 'image_generator').every(step => Array.isArray(step.visualInputStepIds) && step.visualInputStepIds.includes('product_reference_image')), 'strategy disabled generators should still use product_reference_image');

  const strategyEnabledTurn = prepareAppAgentTurn({
    userText: '帮我设计一个工作流，先分析产品设计语言，再生成一套产品评审图',
    context: industrialReviewContext,
  });
  const strategyEnabledDefinition = strategyEnabledTurn.deterministicLegacyActions
    .find(action => action.tool === 'canvas_create_workflow')?.arguments.workflowDefinition as Record<string, unknown>;
  const strategyEnabledSteps = Array.isArray(strategyEnabledDefinition.steps) ? strategyEnabledDefinition.steps as Array<Record<string, unknown>> : [];
  const strategyEnabledGenerators = strategyEnabledSteps.filter(step => step.type === 'image_generator');
  assert(strategyEnabledDefinition.strategyStepMode === 'enabled', 'explicit analysis workflow should enable strategy step');
  assert(strategyEnabledSteps.some(step => step.id === 'industrial_design_review_strategy' && step.type === 'text_agent'), 'explicit analysis workflow should include strategy text-agent');
  assert(strategyEnabledGenerators.every(step => Array.isArray(step.visualInputStepIds) && step.visualInputStepIds.includes('product_reference_image')), 'strategy enabled generators should keep direct product visual input');
  assert(strategyEnabledGenerators.every(step => Array.isArray(step.textInputStepIds) && step.textInputStepIds.includes('industrial_design_review_strategy')), 'strategy enabled generators should reference strategy as text input');

  const suiteOnlyTurn = prepareAppAgentTurn({
    userText: '根据这张参考产品图生成一套工业设计评审图，包括细节图、CMF图、场景图',
    context: industrialReviewContext,
  });
  assert(!suiteOnlyTurn.deterministicLegacyActions.some(action => action.tool === 'canvas_create_workflow'), 'multi-output without explicit workflow can use canvas_nodes_fallback');
  assert(suiteOnlyTurn.deterministicLegacyActions.filter(action => action.tool === 'canvas_create_generator').length >= 3, 'multi-output fallback should create multiple generator nodes');

  const expandedCanvasTurn = prepareAppAgentTurn({
    userText: '不要封装工作流，直接在画布上根据参考产品图搭出这些节点：细节图、CMF图、场景图',
    context: industrialReviewContext,
  });
  assert(expandedCanvasTurn.trace.workflowCreationMode === 'canvas_nodes_fallback', 'explicit expanded canvas request should use canvas_nodes_fallback mode');
  assert(expandedCanvasTurn.deterministicLegacyActions.filter(action => action.tool === 'canvas_create_generator').length >= 3, 'expanded canvas fallback should create multiple generator nodes');

  const unboundWorkflowTurn = prepareAppAgentTurn({
    userText: '帮我设计一个根据参考产品图生成工业设计评审图的工作流',
    context: { ...baseContext, selectedIds: [], visualReferences: [], nodes: [] },
  });
  const unboundWorkflowDefinition = unboundWorkflowTurn.deterministicLegacyActions
    .find(action => action.tool === 'canvas_create_workflow')?.arguments.workflowDefinition as Record<string, unknown>;
  const unboundInputs = Array.isArray(unboundWorkflowDefinition.inputs) ? unboundWorkflowDefinition.inputs as Array<Record<string, unknown>> : [];
  assert(unboundInputs.some(input => input.id === 'product_reference_image' && input.required === true && input.bindingState === 'unbound'), 'workflow template without selected image should mark required input unbound');

  const staleReferenceWorkflowTurn = prepareAppAgentTurn({
    userText: '帮我设计一个根据参考产品图生成工业设计评审图的工作流',
    context: {
      ...industrialReviewContext,
      selectedIds: [],
      visualReferences: [{ id: 'stale-ref', nodeId: 'product-image-node', name: 'stale ref', mediaType: 'image' }],
    },
  });
  const staleReferenceWorkflowAction = staleReferenceWorkflowTurn.deterministicLegacyActions
    .find(action => action.tool === 'canvas_create_workflow');
  const staleReferenceBindings = staleReferenceWorkflowAction?.arguments.inputBindings as Record<string, unknown>;
  const staleProductBinding = staleReferenceBindings?.product_reference_image as Record<string, unknown>;
  assert(staleProductBinding?.kind === 'unbound', 'workflow creation should not bind stale visualReferences when no canvas image is selected');
  assert(!Array.isArray(staleReferenceWorkflowAction?.arguments.selectedReferenceImageNodeIds) || staleReferenceWorkflowAction?.arguments.selectedReferenceImageNodeIds.length === 0, 'workflow creation should not send stale selectedReferenceImageNodeIds');

  const invalidStrategyOnlyWorkflow = validateLegacyAgentAction({
    tool: 'canvas_create_workflow',
    arguments: {
      workflowDefinition: {
        templateId: 'industrial-design-review',
        inputs: [{ id: 'product_reference_image', type: 'image', required: true }],
        steps: [
          { id: 'industrial_design_review_strategy', type: 'text_agent', inputStepIds: ['product_reference_image'], prompt: 'strategy' },
          {
            id: 'bad_generator',
            type: 'image_generator',
            requiresReferenceImages: true,
            textInputStepIds: ['industrial_design_review_strategy'],
            inputStepIds: ['industrial_design_review_strategy'],
            prompt: 'bad generator',
          },
        ],
      },
      autoRun: false,
    },
  }, industrialReviewContext, industrialReviewRequest);
  assert(!invalidStrategyOnlyWorkflow.valid, 'validator should block strategy-only workflow generator');
  assert(invalidStrategyOnlyWorkflow.errors.some(error => /strategy|visual reference|product_reference_image/i.test(error)), 'validator error should explain strategy cannot replace visual reference');

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
    selectedDrawerItems: [{ id: 'drawer-image-1', type: 'image', name: 'drawer product', url: 'asset://drawer-image-1' }],
    currentMessageAttachments: [{ id: 'attachment-1', nodeId: 'attachment-1', name: 'attachment', mediaType: 'image', source: 'data:image/png;base64,abc' }],
    canvasNodes: [{ id: 'product-image-node', type: 'image', name: 'product', inputs: [], url: 'asset://product-image-node' }],
  });
  assert(workflowCanvasResolution.resolvedImageNodeIds.includes('product-image-node'), 'workflow resolver should use selected canvas product image');
  assert(workflowCanvasResolution.autoConnections.some(connection => connection.sourceId === 'product-image-node' && connection.targetId === 'product_refs'), 'workflow resolver should connect selected image to external product refs');
  assert(workflowCanvasResolution.nodesToCreateFromDrawerItems.length === 0, 'workflow resolver should not create drawer duplicate when selected canvas image exists');
  assert(workflowCanvasResolution.nodesToCreateFromAttachments.length === 0, 'workflow resolver should not create attachment duplicate when selected canvas image exists');
  assert(workflowCanvasResolution.workflowInputResolution.duplicateImageNodesPrevented >= 1, 'workflow resolver should record duplicate image prevention');

  const workflowDrawerResolution = resolveWorkflowInputs({
    workflow: commerceWorkflow,
    selectedDrawerItems: [{ id: 'drawer-image-1', type: 'image', name: 'drawer product', url: 'asset://drawer-image-1' }],
    canvasNodes: [],
  });
  assert(workflowDrawerResolution.nodesToCreateFromDrawerItems.includes('drawer-image-1'), 'workflow resolver should request canvas node creation for selected drawer image');

  const workflowAttachmentResolution = resolveWorkflowInputs({
    workflow: commerceWorkflow,
    currentMessageAttachments: [{ id: 'attachment-1', nodeId: 'attachment-node-missing', name: 'attachment', mediaType: 'image', source: 'data:image/png;base64,abc' }],
    canvasNodes: [],
  });
  assert(workflowAttachmentResolution.nodesToCreateFromAttachments.includes('attachment-1'), 'workflow resolver should request real node creation for attachment image with source');

  const workflowPlaceholderResolution = resolveWorkflowInputs({
    workflow: commerceWorkflow,
    selectedNodeIds: ['placeholder-node'],
    canvasNodes: [{ id: 'placeholder-node', type: 'image', name: 'placeholder', inputs: [], hasSourceAsset: false, thumbnailPending: true }],
  });
  assert(!workflowPlaceholderResolution.resolvedImageNodeIds.includes('placeholder-node'), 'workflow resolver should not treat missing-source placeholder as valid reference image');
  assert(workflowPlaceholderResolution.workflowInputResolution.unresolvedThumbnailNodes.includes('placeholder-node'), 'workflow resolver should record unresolved thumbnail node');

  const placeholderValidationContext = {
    ...baseContext,
    selectedIds: ['placeholder-node'],
    visualReferences: [],
    nodes: [{ id: 'placeholder-node', type: 'image', name: 'placeholder', inputs: [], hasSourceAsset: false, thumbnailPending: true }],
  } as unknown as AgentCanvasContext;
  const placeholderValidation = validateLegacyAgentAction({
    tool: 'canvas_create_workflow',
    arguments: {
      workflowDefinition: {
        templateId: 'industrial-design-review',
        inputs: [{ id: 'product_reference_image', type: 'image', required: true }],
        steps: [{
          id: 'hero_view',
          type: 'image_generator',
          requiresReferenceImages: true,
          visualInputStepIds: ['product_reference_image'],
          prompt: 'hero',
        }],
      },
      inputBindings: { product_reference_image: { kind: 'canvas_node', nodeId: 'placeholder-node' } },
      selectedReferenceImageNodeIds: ['placeholder-node'],
      autoRun: true,
    },
  }, placeholderValidationContext, industrialReviewRequest);
  assert(!placeholderValidation.valid, 'validator should block missing-source placeholder workflow input');
  assert(placeholderValidation.errors.some(error => /source asset|placeholder/i.test(error)), 'validator should mention placeholder/source asset');

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
  '工业设计评审工作流 -> workflow module + definition fan-out',
  '工业设计评审工作流 strategy modes -> auto/enabled/disabled',
  '多输出但不说工作流 -> canvas_nodes_fallback',
  'workflow validator -> strategy text cannot replace visual reference',
  'workflow resolver -> selected/drawer/missing product images',
  'workflow resolver -> selected canvas image prevents duplicate placeholders',
  'workflow resolver -> attachment image requires real source',
  'workflow resolver -> missing-source placeholder is invalid',
  'workflow validator -> missing-source placeholder blocked',
  'edit background without BASE -> validator blocks',
  '清空画布 command -> canvas_manage clear_canvas',
  'app_get_context scopes canvas drawer -> compact scoped context',
];
