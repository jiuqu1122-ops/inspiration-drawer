import { validateLegacyAgentAction, repairLegacyAgentAction } from './commands/commandValidator';
import { adaptCommandToLegacyAction } from './commands/legacyToolAdapter';
import type { LegacyAgentAction } from './commands/commandTypes';
import { evaluateLegacyActionPermission } from './commands/permissionGate';
import { resolveWorkflowInputs } from './commands/workflowInputResolver';
import { buildAppAgentContext } from './context/appAgentContextBuilder';
import { buildWorkflowDraftFromUserRequest, convertWorkflowDraftToDefinition, detectWorkflowDraftUpdateIntent } from './kernel/appAgentKernel';
import { prepareAppAgentTurn } from './runtime/useAppAgentRuntime';
import { selectAppAgentSkills } from './skills/skillRegistry';
import { extractCreativeBrief } from './skills/creativeProductDesignSkill';
import { detectWorkflowTemplate, parseWorkflowBuilderIntent } from './skills/workflowBuilderSkill';
import type { WorkflowOutputSpec, WorkflowRecipeDraft } from './workflows/workflowRecipeTypes';
import { buildProductDetailPageDraft } from './workflows/recipes/productDetailPageRecipe';
import { validateEcommerceDetailPageDraft } from './workflows/validators/ecommerceDetailPageValidator';
import {
  detectWorkflowDesignIntent,
  parseWorkflowDraftProposal,
  resolveWorkflowPlanningRoute,
  workflowDraftProposalToRecipeDraft,
} from './workflows/workflowPlanning';
import { getXaisImage2RatioOptions, resolveXaisImage2Ratio } from '../canvasAiImage';
import { CANVAS_AGENT_ACTION_SCHEMA } from '../canvasAgentTools';
import type { AgentCanvasContext } from '../agentModel';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const getWorkflowDraftAction = (actions: LegacyAgentAction[]) => (
  actions.find(action => action.tool === 'canvas_create_workflow_draft')
);

const getIndustrialReviewDraftDefinition = (
  actions: LegacyAgentAction[],
  selectedImageNodeIds: string[],
  originalRequest: string,
) => {
  const draftAction = getWorkflowDraftAction(actions);
  const draft = draftAction?.arguments.workflowDraft as WorkflowRecipeDraft | undefined;
  if (!draft) throw new Error('industrial review workflow should create an editable workflow draft');
  assert(draft.templateId === 'industrial-design-review', 'draft.templateId should be industrial-design-review');
  return {
    draftAction,
    draft,
    workflowDefinition: convertWorkflowDraftToDefinition(
      draft,
      selectedImageNodeIds,
      originalRequest,
      'workflow_module',
    ) as unknown as Record<string, unknown>,
  };
};

export function runAppAgentSmokeTests() {
  const expectedXaisNanoRatios = ['1:1', '16:9', '9:16', '3:2', '2:3', '4:3', '21:9', '3:4', '1:4', '4:1', '1:8', '8:1'];
  [
    'Xais Nano Pro_2K',
    'Xais Nano Pro_4K',
    'Xais Nano2_2K',
    'Xais Nano2_4K',
    'Xais Nano_Lite_1K',
    'Xais Nano Pro_4K_png',
    'Xais Nano2_4K_png',
  ].forEach(model => {
    assert(
      JSON.stringify(getXaisImage2RatioOptions(model)) === JSON.stringify(expectedXaisNanoRatios),
      `${model} should expose the unified Nano ratio list`,
    );
  });
  assert(resolveXaisImage2Ratio('Xais Nano_Lite_1K', '21:9') === '21:9', 'Nano Lite should keep 21:9 ratio');
  assert(resolveXaisImage2Ratio('Xais Nano Pro_2K', '1:8') === '1:8', 'Nano Pro should keep 1:8 ratio');

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
  assert(schemaText.includes('canvas_create_design_pipeline'), 'agent schema should expose the product design pipeline');
  assert(schemaText.includes('reference_image_bridge'), 'workflow action schema should allow reference_image_bridge');
  const directProductDesignTurn = prepareAppAgentTurn({
    userText: '我要设计一款适合小户型的桌面音箱',
    context: { ...baseContext, selectedIds: [], visualReferences: [], nodes: [] },
  });
  const designPipelineAction = directProductDesignTurn.deterministicLegacyActions.find(
    action => action.tool === 'canvas_create_design_pipeline',
  );
  assert(!!designPipelineAction, 'direct product design request should create the drawer-to-analysis-to-generator pipeline');
  assert(designPipelineAction.arguments.referenceCount === 5, 'product design pipeline should retrieve five role-balanced drawer references');
  assert(designPipelineAction.arguments.autoRunAnalysis === true, 'product design pipeline should run visual design analysis');
  assert(designPipelineAction.arguments.autoRunGenerator === true, 'direct product design request should run the downstream generator after analysis');
  assert(!directProductDesignTurn.deterministicLegacyActions.some(action => action.tool === 'canvas_create_text_agent'), 'pipeline must not also create a disconnected design agent');
  assert(!directProductDesignTurn.deterministicLegacyActions.some(action => action.tool === 'canvas_create_generator'), 'pipeline must not also create a disconnected generator');
  const genericProductDesignTurn = prepareAppAgentTurn({
    userText: '帮我设计一个适合露营使用的杯子',
    context: { ...baseContext, selectedIds: [], visualReferences: [], nodes: [] },
  });
  assert(
    genericProductDesignTurn.deterministicLegacyActions.some(action => action.tool === 'canvas_create_design_pipeline'),
    'generic tangible product requests should also create the design pipeline',
  );
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
  const localFullProcessTurn = prepareAppAgentTurn({
    userText: '使用工业设计全流程工作流设计一台便携咖啡机',
    context: industrialReviewContext,
  });
  assert(
    localFullProcessTurn.activeSkillPrompt.includes('when applying industrial-design-full-process, do not call drawer_search_inspirations'),
    'local-first full-process workflow should suppress the creative skill pre-search call',
  );
  assert(
    localFullProcessTurn.activeSkillPrompt.includes('pass the user\'s exact original request in projectBrief'),
    'workflow skill should pass the original project request into the built-in workflow',
  );
  assert(industrialReviewTurn.shouldUseDeterministicPlan, 'industrial review workflow should use deterministic plan');
  assert(industrialReviewTurn.trace.deterministicActionsUsed === true, 'industrial review workflow trace should mark deterministic actions used');
  const { draftAction: workflowDraftAction, workflowDefinition } = getIndustrialReviewDraftDefinition(
    industrialReviewTurn.deterministicLegacyActions,
    ['product-image-node'],
    industrialReviewRequest,
  );
  assert(!industrialReviewTurn.deterministicLegacyActions.some(action => action.tool === 'canvas_create_workflow'), 'explicit industrial review workflow should create a draft before canvas module creation');
  assert(!industrialReviewTurn.deterministicLegacyActions.some(action => action.tool === 'canvas_create_text_agent'), 'workflow_module should not create loose strategy text-agent');
  assert(!industrialReviewTurn.deterministicLegacyActions.some(action => action.tool === 'canvas_create_generator'), 'workflow_module should not create loose generator nodes');
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
  const workflowInputBindings = workflowDraftAction?.arguments.inputBindings as Record<string, unknown>;
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

  // strategy mode tests: use explicit "工业设计评审" to ensure correct routing
  const multiReferenceContext: AgentCanvasContext = {
    ...industrialReviewContext,
    selectedIds: ['product-ref-a', 'product-ref-b'],
    visualReferences: [
      { id: 'product-ref-a-visual', nodeId: 'product-ref-a', name: 'product ref A', mediaType: 'image' },
      { id: 'product-ref-b-visual', nodeId: 'product-ref-b', name: 'product ref B', mediaType: 'image' },
    ],
    nodes: [
      { id: 'product-ref-a', type: 'image', name: 'product ref A', inputs: [] },
      { id: 'product-ref-b', type: 'image', name: 'product ref B', inputs: [] },
    ],
  };
  const multiReferenceRequest = 'Create an industrial design review workflow from these product references, strategy first, then generate a review suite';
  const multiReferenceTurn = prepareAppAgentTurn({
    userText: multiReferenceRequest,
    context: multiReferenceContext,
  });
  const multiReferenceAction = getWorkflowDraftAction(multiReferenceTurn.deterministicLegacyActions);
  const multiReferenceBindings = multiReferenceAction?.arguments.inputBindings as Record<string, unknown>;
  const multiProductBinding = multiReferenceBindings?.product_reference_image as Record<string, unknown>;
  const multiBoundNodeIds = Array.isArray(multiProductBinding?.nodeIds) ? multiProductBinding.nodeIds.map(String) : [];
  assert(multiProductBinding?.kind === 'canvas_nodes', 'multi-reference workflow should bind product_reference_image as canvas_nodes');
  assert(multiBoundNodeIds.includes('product-ref-a') && multiBoundNodeIds.includes('product-ref-b'), 'multi-reference workflow should preserve all selected product refs');
  assert(multiReferenceTurn.trace.connectedReferenceImageNodeIds?.length === 2, 'trace should keep both connected reference image node ids');
  assert(multiReferenceTurn.trace.workflowInputBindings?.product_reference_image?.length === 2, 'trace workflow input binding should keep both product refs');
  const multiReferenceDefinition = getIndustrialReviewDraftDefinition(
    multiReferenceTurn.deterministicLegacyActions,
    ['product-ref-a', 'product-ref-b'],
    multiReferenceRequest,
  ).workflowDefinition;
  const multiReferenceSteps = Array.isArray(multiReferenceDefinition?.steps) ? multiReferenceDefinition.steps as Array<Record<string, unknown>> : [];
  const multiReferenceGenerators = multiReferenceSteps.filter(step => step.type === 'image_generator');
  assert(multiReferenceDefinition?.strategyStepMode === 'enabled', 'multi-reference strategy-first workflow should enable strategy');
  assert(multiReferenceGenerators.every(step => Array.isArray(step.visualInputStepIds) && step.visualInputStepIds.includes('product_reference_image')), 'multi-reference generators should keep direct visual bridge input');
  assert(multiReferenceGenerators.every(step => Array.isArray(step.textInputStepIds) && step.textInputStepIds.includes('industrial_design_review_strategy')), 'multi-reference generators should depend on strategy text node');

  const strategyDisabledTurn = prepareAppAgentTurn({
    userText: '帮我设计一个工业设计评审工作流，根据参考产品图生成细节图、CMF图、场景图，不要分析，直接出图',
    context: industrialReviewContext,
  });
  const strategyDisabledDefinition = getIndustrialReviewDraftDefinition(
    strategyDisabledTurn.deterministicLegacyActions,
    ['product-image-node'],
    '帮我设计一个工业设计评审工作流，根据参考产品图生成细节图、CMF图、场景图，不要分析，直接出图',
  ).workflowDefinition;
  const strategyDisabledSteps = Array.isArray(strategyDisabledDefinition?.steps) ? strategyDisabledDefinition.steps as Array<Record<string, unknown>> : [];
  assert(strategyDisabledDefinition?.strategyStepMode === 'disabled', 'direct output workflow should disable strategy step');
  assert(!strategyDisabledSteps.some(step => step.type === 'text_agent'), 'strategy disabled workflow should not include strategy step');
  assert(strategyDisabledSteps.filter(step => step.type === 'image_generator').every(step => Array.isArray(step.visualInputStepIds) && step.visualInputStepIds.includes('product_reference_image')), 'strategy disabled generators should still use product_reference_image');

  const strategyEnabledTurn = prepareAppAgentTurn({
    userText: '帮我设计一个工业设计评审工作流，先分析产品设计语言，再生成一套产品评审图',
    context: industrialReviewContext,
  });
  const strategyEnabledDefinition = getIndustrialReviewDraftDefinition(
    strategyEnabledTurn.deterministicLegacyActions,
    ['product-image-node'],
    '帮我设计一个工业设计评审工作流，先分析产品设计语言，再生成一套产品评审图',
  ).workflowDefinition;
  const strategyEnabledSteps = Array.isArray(strategyEnabledDefinition?.steps) ? strategyEnabledDefinition.steps as Array<Record<string, unknown>> : [];
  const strategyEnabledGenerators = strategyEnabledSteps.filter(step => step.type === 'image_generator');
  assert(strategyEnabledDefinition?.strategyStepMode === 'enabled', 'explicit analysis workflow should enable strategy step');
  assert(strategyEnabledSteps.some(step => step.id === 'industrial_design_review_strategy' && step.type === 'text_agent'), 'explicit analysis workflow should include strategy text-agent');
  const designStrategyStep = strategyEnabledSteps.find(step => step.id === 'industrial_design_review_strategy');
  assert((designStrategyStep?.designAgentConfig as Record<string, unknown> | undefined)?.agentRole === 'design_strategist', 'strategy text-agent should carry Design Agent role config');
  assert(strategyEnabledGenerators.every(step => Array.isArray(step.visualInputStepIds) && step.visualInputStepIds.includes('product_reference_image')), 'strategy enabled generators should keep direct product visual input');
  assert(strategyEnabledGenerators.every(step => Array.isArray(step.textInputStepIds) && step.textInputStepIds.includes('industrial_design_review_strategy')), 'strategy enabled generators should reference strategy as text input');

  const suiteOnlyTurn = prepareAppAgentTurn({
    userText: '根据这张参考产品图生成一套工业设计评审图，包括细节图、CMF图、场景图',
    context: industrialReviewContext,
  });
  assert(!suiteOnlyTurn.deterministicLegacyActions.some(action => action.tool === 'canvas_create_workflow'), 'multi-output without explicit workflow can use canvas_nodes_fallback');
  assert(suiteOnlyTurn.deterministicLegacyActions.filter(action => action.tool === 'canvas_create_generator').length >= 3, 'multi-output fallback should create multiple generator nodes');

  const expandedCanvasTurn = prepareAppAgentTurn({
    userText: '不要封装工作流，直接在画布上根据参考产品图搭出这些工业设计评审节点：细节图、CMF图、场景图',
    context: industrialReviewContext,
  });
  assert(expandedCanvasTurn.trace.workflowCreationMode === 'canvas_nodes_fallback', 'explicit expanded canvas request should use canvas_nodes_fallback mode');
  assert(expandedCanvasTurn.deterministicLegacyActions.filter(action => action.tool === 'canvas_create_generator').length >= 3, 'expanded canvas fallback should create multiple generator nodes');

  const unboundWorkflowTurn = prepareAppAgentTurn({
    userText: '帮我设计一个根据参考产品图生成工业设计评审图的工作流',
    context: { ...baseContext, selectedIds: [], visualReferences: [], nodes: [] },
  });
  const unboundWorkflowDefinition = getIndustrialReviewDraftDefinition(
    unboundWorkflowTurn.deterministicLegacyActions,
    [],
    '帮我设计一个根据参考产品图生成工业设计评审图的工作流',
  ).workflowDefinition;
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
  const staleReferenceWorkflowAction = getWorkflowDraftAction(staleReferenceWorkflowTurn.deterministicLegacyActions);
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

  // === Test A: 中文用户创建工业设计评审工作流 ===
  const recipeTestContext: AgentCanvasContext = {
    ...industrialReviewContext,
    selectedIds: ['product-image-node'],
    visualReferences: [{ id: 'product-ref', nodeId: 'product-image-node', name: 'product reference', mediaType: 'image' }],
    nodes: [{ id: 'product-image-node', type: 'image', name: 'product reference', inputs: [] }],
  };
  const recipeTestRequest = '帮我设计一个工作流，可以根据参考产品图，自动生成一套工业设计评审图：包括视频图、细节图、CMF图、场景图、高级氛围图等';

  const recipeTurn = prepareAppAgentTurn({ userText: recipeTestRequest, context: recipeTestContext });
  assert(!recipeTurn.deterministicLegacyActions.some(a => a.tool === 'canvas_create_workflow'), 'A: Chinese user workflow request should create draft before canvas workflow');
  const recipeDefinition = getIndustrialReviewDraftDefinition(
    recipeTurn.deterministicLegacyActions,
    ['product-image-node'],
    recipeTestRequest,
  ).workflowDefinition;
  const recipeMetadata = recipeDefinition?.metadata as Record<string, unknown> | undefined;
  const recipeLanguagePolicy = recipeMetadata?.languagePolicy as Record<string, unknown> | undefined;
  assert(recipeLanguagePolicy?.imageTextLanguage === 'zh-CN', 'A: Chinese input should default languagePolicy.imageTextLanguage to zh-CN');
  const recipeSteps = Array.isArray(recipeDefinition?.steps) ? recipeDefinition.steps as Array<Record<string, unknown>> : [];
  const recipeCmfStep = recipeSteps.find(step => String(step.id || '') === 'cmf_board');
  assert(!!recipeCmfStep, 'A: workflow definition should include cmf_board step');
  const cmfPrompt = String(recipeCmfStep?.prompt || '');
  assert(/中文|Chinese|标注|zh/.test(cmfPrompt), 'A: cmf_board prompt should include Chinese annotation requirement');
  assert(!/^Create a disciplined CMF board/.test(cmfPrompt), 'A: cmf_board prompt should not use old full-English default');
  const recipeGenSteps = recipeSteps.filter(step => step.type === 'image_generator');
  assert(recipeGenSteps.every(step => (step.skillMeta as Record<string, unknown>)?.workflowTemplateId === 'industrial-design-review'), 'A: all generator steps should belong to industrial-design-review template');
  const recipeDraftInMeta = recipeMetadata?.workflowDraft as Record<string, unknown> | undefined;
  if (recipeDraftInMeta) {
    const draftOutputs = Array.isArray(recipeDraftInMeta.outputs) ? recipeDraftInMeta.outputs as Array<Record<string, unknown>> : [];
    assert(draftOutputs.every(o => o.editable === true), 'A: all draft outputs should have editable=true');
  }

  // === Test B: 更新 draft - CMF 图不要英文 ===
  const draftBBrief = extractCreativeBrief({ userText: recipeTestRequest, hasSelectedImages: true });
  const draftB = buildWorkflowDraftFromUserRequest({
    userText: recipeTestRequest,
    brief: draftBBrief,
    outputTypes: ['hero_view', 'detail_view', 'cmf_board', 'usage_scene', 'premium_mood', 'storyboard_or_video_key_visual'],
    strategyStepMode: 'disabled',
  });
  const updatedDraftB = {
    ...draftB,
    languagePolicy: { ...draftB.languagePolicy, imageTextLanguage: 'zh-CN' as const },
    outputs: draftB.outputs.map(o =>
      o.id === 'cmf_board'
        ? { ...o, prompt: o.prompt.includes('中文') ? o.prompt : o.prompt + '\n图中标注使用中文。' }
        : o,
    ),
  };
  assert(updatedDraftB.languagePolicy.imageTextLanguage === 'zh-CN', 'B: updated draft should have zh-CN imageTextLanguage');
  const updatedCmfOutput = updatedDraftB.outputs.find(o => o.id === 'cmf_board');
  assert(!!updatedCmfOutput?.prompt.includes('中文'), 'B: updated cmf_board prompt should include Chinese annotation');

  // === Test C: 不要高级氛围图 ===
  const draftC = buildWorkflowDraftFromUserRequest({
    userText: recipeTestRequest,
    brief: draftBBrief,
    outputTypes: ['hero_view', 'detail_view', 'cmf_board', 'usage_scene', 'premium_mood'],
    strategyStepMode: 'disabled',
  });
  const updatedDraftC = {
    ...draftC,
    outputs: draftC.outputs.map(o => o.id === 'premium_mood' ? { ...o, enabled: false } : o),
  };
  const premiumMoodOutput = updatedDraftC.outputs.find(o => o.id === 'premium_mood');
  assert(premiumMoodOutput?.enabled === false, 'C: premium_mood should be disabled after update');
  const otherOutputsC = updatedDraftC.outputs.filter(o => o.id !== 'premium_mood' && o.enabled);
  assert(otherOutputsC.length >= 4, 'C: other outputs should remain unchanged');

  // === Test D: 加一个爆炸结构图 ===
  const explodedViewOutput: WorkflowOutputSpec = {
    id: 'exploded_view',
    title: '爆炸结构图',
    type: 'image_generator',
    enabled: true,
    order: 7,
    aspectRatio: '16:9',
    prompt: '生成产品爆炸结构图，展示零部件分解、装配关系和结构层次。图中文字以中文为主，可保留结构术语。',
    inputRoles: ['product_reference_image'],
    requiresReferenceImages: true,
    editable: true,
  };
  const updatedDraftD = {
    ...draftC,
    outputs: [...draftC.outputs, explodedViewOutput],
  };
  assert(updatedDraftD.outputs.some(o => o.id === 'exploded_view'), 'D: draft should include exploded_view after adding');
  assert(!!updatedDraftD.outputs.find(o => o.id === 'exploded_view')?.inputRoles.includes('product_reference_image'), 'D: exploded_view should include product_reference_image as input role');

  // === Test E: 不要文字节点，直接出图 (strategy disabled) ===
  const strategyDisabledDraftTurn = prepareAppAgentTurn({
    userText: '帮我设计一个工业设计评审工作流，根据参考产品图生成细节图、CMF图、场景图，不要文字节点，直接出图',
    context: recipeTestContext,
  });
  const strategyDisabledDef = getIndustrialReviewDraftDefinition(
    strategyDisabledDraftTurn.deterministicLegacyActions,
    ['product-image-node'],
    '帮我设计一个工业设计评审工作流，根据参考产品图生成细节图、CMF图、场景图，不要文字节点，直接出图',
  ).workflowDefinition;
  const strategyDisabledStepsE = Array.isArray(strategyDisabledDef?.steps) ? strategyDisabledDef.steps as Array<Record<string, unknown>> : [];
  assert(strategyDisabledDef?.strategyStepMode === 'disabled', 'E: strategy should be disabled when user says no text nodes');
  assert(!strategyDisabledStepsE.some(step => step.type === 'text_agent'), 'E: no strategy text-agent step when strategy disabled');

  // === Test F: 保存工作流 - convertWorkflowDraftToDefinition 保留用户修改 ===
  const draftFWithChanges = {
    ...updatedDraftD,
    outputs: updatedDraftD.outputs.map(o => o.id === 'premium_mood' ? { ...o, enabled: false } : o),
  };
  const definitionF = convertWorkflowDraftToDefinition(draftFWithChanges, ['product-image-node'], recipeTestRequest, 'workflow_module');
  const definitionFSteps = Array.isArray(definitionF.steps) ? definitionF.steps : [];
  const definitionFGenerators = definitionFSteps.filter((s: Record<string, unknown>) => s.type === 'image_generator') as Array<Record<string, unknown>>;
  assert(!definitionFGenerators.some((s: Record<string, unknown>) => s.id === 'premium_mood'), 'F: saved definition should not include disabled premium_mood');
  assert(definitionFGenerators.some((s: Record<string, unknown>) => s.id === 'exploded_view'), 'F: saved definition should include user-added exploded_view');
  assert(definitionF.templateId === 'industrial-design-review', 'F: converted definition should keep templateId');
  assert(definitionF.creationMode === 'workflow_module', 'F: converted definition should preserve creationMode');
}

// ═══ E2E Routing Chain Smoke Tests ═══════════════════════════════════════════
// 模拟真实用户连续对话，验证 activeDraft 路由链路
export function runRoutingChainSmokeTests() {
  const routingContext: AgentCanvasContext = {
    surface: 'canvas',
    selectedIds: ['product-image-node'],
    selectedItems: [],
    visualReferences: [{ id: 'product-ref', nodeId: 'product-image-node', name: 'product reference', mediaType: 'image' }],
    nodes: [{ id: 'product-image-node', type: 'image', name: 'product reference', inputs: [] }],
    presets: [],
    workflows: [],
    drawer: {
      activeTab: 'all', activeFolderId: '', searchQuery: '', pinned: false, folders: [], items: [],
    },
  };

  // ── Step A: 用户创建工业设计评审工作流 ─────────────────────────────────────
  const createRequest = '帮我设计一个工作流，可以根据参考产品图，自动生成一套工业设计评审图';
  const createTurn = prepareAppAgentTurn({ userText: createRequest, context: routingContext });
  assert(
    createTurn.deterministicLegacyActions.some(a => a.tool === 'canvas_create_workflow_draft'),
    'Routing-A: create workflow request should produce canvas_create_workflow_draft action',
  );
  assert(
    !createTurn.deterministicLegacyActions.some(a => a.tool === 'canvas_create_workflow'),
    'Routing-A: create workflow request should not create canvas workflow before confirmation',
  );
  assert(
    !createTurn.deterministicLegacyActions.some(a => a.tool === 'canvas_update_workflow_draft'),
    'Routing-A: create workflow should NOT produce update_draft action (no active draft)',
  );

  // Simulate what the App would do: build and store the draft
  const brief = extractCreativeBrief({ userText: createRequest, hasSelectedImages: true }, ['product-image-node']);
  const activeDraft: WorkflowRecipeDraft = buildWorkflowDraftFromUserRequest({
    userText: createRequest,
    brief,
    outputTypes: ['hero_view', 'detail_view', 'cmf_board', 'usage_scene', 'premium_mood'],
    strategyStepMode: 'disabled',
  });
  assert(!!activeDraft.id, 'Routing-A: draft should have an id');
  assert(activeDraft.outputs.length >= 5, 'Routing-A: draft should have >= 5 outputs');

  // ── Step B: 用户说"CMF图不要英文" ─────────────────────────────────────────
  const cmfUpdateRequest = 'CMF图不要英文';
  const cmfIntent = detectWorkflowDraftUpdateIntent(cmfUpdateRequest, activeDraft);
  assert(cmfIntent.action === 'update_draft', 'Routing-B: "CMF图不要英文" should produce update_draft intent');
  assert(cmfIntent.updateAction === 'update_output_prompt', 'Routing-B: should use update_output_prompt action');
  assert(cmfIntent.targetOutputId === 'cmf_board', 'Routing-B: should target cmf_board');
  assert(
    typeof cmfIntent.outputSpec?.prompt === 'string' && cmfIntent.outputSpec.prompt.startsWith('__APPEND__:'),
    'Routing-B: CMF update should use __APPEND__ prefix',
  );

  const cmfUpdateTurn = prepareAppAgentTurn({ userText: cmfUpdateRequest, context: routingContext, activeDraft });
  assert(
    cmfUpdateTurn.deterministicLegacyActions.some(a => a.tool === 'canvas_update_workflow_draft'),
    'Routing-B: with active draft, "CMF图不要英文" should produce canvas_update_workflow_draft action',
  );
  assert(
    !cmfUpdateTurn.deterministicLegacyActions.some(a => a.tool === 'canvas_create_workflow'),
    'Routing-B: with active draft, should NOT create a new workflow',
  );
  // 关键：shouldUseDeterministicPlan 必须为 true，不能让 LLM 接管
  assert(
    cmfUpdateTurn.shouldUseDeterministicPlan === true,
    'Routing-B: draft update plan MUST use deterministic execution (not LLM)',
  );
  // 关键：没有 canvas_create_text_agent / canvas_create_generator
  assert(
    !cmfUpdateTurn.deterministicLegacyActions.some(a => a.tool === 'canvas_create_text_agent'),
    'Routing-B: must NOT produce canvas_create_text_agent when updating draft',
  );
  assert(
    !cmfUpdateTurn.deterministicLegacyActions.some(a => a.tool === 'canvas_create_generator'),
    'Routing-B: must NOT produce canvas_create_generator when updating draft',
  );
  // 关键：canvas_update_workflow_draft action 的 arguments 里不能有 referenceRoles
  const cmfUpdateAction = cmfUpdateTurn.deterministicLegacyActions.find(a => a.tool === 'canvas_update_workflow_draft');
  assert(
    !cmfUpdateAction?.arguments.referenceRoles,
    'Routing-B: canvas_update_workflow_draft must NOT contain referenceRoles',
  );

  // Apply the update to draft (simulating the handler)
  const cmfAppendText = (cmfIntent.outputSpec?.prompt as string).slice('__APPEND__:'.length);
  const draftAfterB: WorkflowRecipeDraft = {
    ...activeDraft,
    outputs: activeDraft.outputs.map(o =>
      o.id === 'cmf_board'
        ? { ...o, prompt: o.prompt.includes(cmfAppendText) ? o.prompt : o.prompt + cmfAppendText }
        : o
    ),
  };
  const cmfOutput = draftAfterB.outputs.find(o => o.id === 'cmf_board');
  assert(!!cmfOutput?.prompt.includes('中文'), 'Routing-B: after update, cmf_board prompt should contain Chinese annotation');

  // ── Step C: 用户说"不要高级氛围图" ──────────────────────────────────────────
  const removeRequest = '不要高级氛围图';
  const removeIntent = detectWorkflowDraftUpdateIntent(removeRequest, draftAfterB);
  assert(removeIntent.action === 'update_draft', 'Routing-C: "不要高级氛围图" should produce update_draft intent');
  assert(removeIntent.updateAction === 'remove_output', 'Routing-C: should use remove_output action');
  assert(removeIntent.targetOutputId === 'premium_mood', 'Routing-C: should target premium_mood');

  const removeTurn = prepareAppAgentTurn({ userText: removeRequest, context: routingContext, activeDraft: draftAfterB });
  assert(
    removeTurn.deterministicLegacyActions.some(a =>
      a.tool === 'canvas_update_workflow_draft' &&
      a.arguments.action === 'remove_output' &&
      a.arguments.outputId === 'premium_mood'
    ),
    'Routing-C: with active draft, "不要高级氛围图" should produce correct remove_output action',
  );

  const draftAfterC: WorkflowRecipeDraft = {
    ...draftAfterB,
    outputs: draftAfterB.outputs.map(o =>
      o.id === 'premium_mood' ? { ...o, enabled: false } : o
    ),
  };
  assert(
    draftAfterC.outputs.find(o => o.id === 'premium_mood')?.enabled === false,
    'Routing-C: premium_mood should be disabled after update',
  );
  assert(
    draftAfterC.outputs.filter(o => o.id !== 'premium_mood' && o.enabled !== false).length >= 4,
    'Routing-C: other outputs should remain enabled',
  );

  // ── Step D: 用户说"加一个爆炸结构图" ─────────────────────────────────────
  const addRequest = '加一个爆炸结构图';
  const addIntent = detectWorkflowDraftUpdateIntent(addRequest, draftAfterC);
  assert(addIntent.action === 'update_draft', 'Routing-D: "加一个爆炸结构图" should produce update_draft intent');
  assert(addIntent.updateAction === 'add_output', 'Routing-D: should use add_output action');
  assert(addIntent.targetOutputId === 'exploded_view', 'Routing-D: should add exploded_view');
  assert(addIntent.outputSpec?.id === 'exploded_view', 'Routing-D: outputSpec should have exploded_view id');

  const addTurn = prepareAppAgentTurn({ userText: addRequest, context: routingContext, activeDraft: draftAfterC });
  assert(
    addTurn.deterministicLegacyActions.some(a =>
      a.tool === 'canvas_update_workflow_draft' &&
      a.arguments.action === 'add_output'
    ),
    'Routing-D: with active draft, "加一个爆炸结构图" should produce add_output action',
  );

  const draftAfterD: WorkflowRecipeDraft = {
    ...draftAfterC,
    outputs: [
      ...draftAfterC.outputs.filter(o => o.id !== 'exploded_view'),
      addIntent.outputSpec as WorkflowOutputSpec,
    ],
  };
  assert(
    draftAfterD.outputs.some(o => o.id === 'exploded_view' && o.enabled),
    'Routing-D: exploded_view should be added and enabled',
  );

  // ── Step E: 用户说"保存这个工作流" ──────────────────────────────────────────
  const saveRequest = '保存这个工作流';
  const saveIntent = detectWorkflowDraftUpdateIntent(saveRequest, draftAfterD);
  assert(saveIntent.action === 'save_draft', 'Routing-E: "保存这个工作流" should produce save_draft intent');

  const saveTurn = prepareAppAgentTurn({ userText: saveRequest, context: routingContext, activeDraft: draftAfterD });
  assert(
    saveTurn.deterministicLegacyActions.some(a =>
      a.tool === 'canvas_update_workflow_draft' &&
      a.arguments.action === 'save_draft_as_workflow'
    ),
    'Routing-E: with active draft, "保存这个工作流" should produce save_draft_as_workflow action',
  );

  // Verify the final definition preserves all user edits
  const finalDefinition = convertWorkflowDraftToDefinition(draftAfterD, ['product-image-node'], createRequest, 'workflow_module');
  const finalSteps = Array.isArray(finalDefinition.steps) ? finalDefinition.steps : [];
  const finalGenerators = finalSteps.filter((s: Record<string, unknown>) => s.type === 'image_generator') as Array<Record<string, unknown>>;

  assert(!finalGenerators.some(s => s.id === 'premium_mood'), 'Routing-E: saved definition should not include disabled premium_mood');
  assert(finalGenerators.some(s => s.id === 'exploded_view'), 'Routing-E: saved definition should include user-added exploded_view');
  const finalCmfStep = finalGenerators.find(s => s.id === 'cmf_board');
  assert(!!finalCmfStep && (finalCmfStep.prompt as string).includes('中文'), 'Routing-E: saved definition cmf_board should retain Chinese annotation');
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
  'A: 中文用户工业设计评审工作流 -> languagePolicy.imageTextLanguage=zh-CN + CMF中文标注 + editable=true',
  'B: CMF图不要英文 -> 更新draft languagePolicy + cmf prompt 包含中文标注',
  'C: 不要高级氛围图 -> premium_mood.enabled=false + 其他节点不变',
  'D: 加一个爆炸结构图 -> draft.outputs 新增 exploded_view + inputRoles 包含 product_reference_image',
  'E: 不要文字节点直接出图 -> strategy.enabled=false + 无 text_agent 节点',
  'F: 保存工作流 -> convertWorkflowDraftToDefinition 保留修改后的 outputs/languagePolicy',
];

// Vitest suite wrapper
import { describe, it } from 'vitest';

// ═══ Template Routing Smoke Tests ════════════════════════════════════════════
export function runTemplateRoutingSmokeTests() {
  const ctx: AgentCanvasContext = {
    surface: 'canvas',
    selectedIds: ['product-image-node'],
    selectedItems: [],
    visualReferences: [{ id: 'ref', nodeId: 'product-image-node', name: 'product', mediaType: 'image' }],
    nodes: [{ id: 'product-image-node', type: 'image', name: 'product', inputs: [] }],
    presets: [], workflows: [],
    drawer: { activeTab: 'all', activeFolderId: '', searchQuery: '', pinned: false, folders: [], items: [] },
  };

  // ── A: 详情页请求 ────────────────────────────────────────────────────────────
  const detailReq = '帮我设计一个工作流，可以根据参考产品图，自动生成一套详情页图片';
  assert(detectWorkflowTemplate(detailReq) === 'product-detail-page',
    'Template-A: "详情页图片" should route to product-detail-page');
  const detailTurn = prepareAppAgentTurn({ userText: detailReq, context: ctx });
  assert(detailTurn.shouldUseDeterministicPlan,
    'Template-A: detail page workflow should use deterministic plan');
  const detailAction = detailTurn.deterministicLegacyActions.find(a =>
    a.tool === 'canvas_create_workflow_draft'
  );
  assert(!!detailAction, 'Template-A: should produce canvas_create_workflow_draft (not canvas_create_workflow)');
  const detailDraft = detailAction?.arguments.workflowDraft as Record<string, unknown> | undefined;
  assert(detailDraft?.templateId === 'ecommerce-detail-page',
    'Template-A: draft.templateId should be ecommerce-detail-page');
  assert((detailDraft?.name as string || '').includes('详情页'),
    'Template-A: draft.name should mention 详情页, not 工业设计评审');
  assert(!detailTurn.deterministicLegacyActions.some(a => a.tool === 'canvas_create_workflow'),
    'Template-A: should NOT create canvas_create_workflow for detail page request');
  const detailOutputs = Array.isArray((detailDraft as Record<string, unknown>)?.outputs)
    ? (detailDraft as Record<string, unknown>).outputs as Array<Record<string, unknown>>
    : [];
  assert(detailOutputs.some(o => String(o.id) === 'master_page_image'),
    'Template-A: detail page draft should include master_page_image output');
  assert(detailOutputs.length === 8,
    'Template-A: detail page draft should include 8 default pages');
  assert(!detailOutputs.some(o => String(o.id) === 'premium_mood'),
    'Template-A: detail page draft should NOT include premium_mood');

  const detailRatioReq = '设计一个详情页工作流，要求9比16的比例';
  const detailRatioTurn = prepareAppAgentTurn({ userText: detailRatioReq, context: ctx });
  const detailRatioDraft = getWorkflowDraftAction(detailRatioTurn.deterministicLegacyActions)
    ?.arguments.workflowDraft as WorkflowRecipeDraft | undefined;
  assert(!!detailRatioDraft, 'Template-A2: should create detail page draft with ratio settings');
  assert(detailRatioDraft.outputs.every(output => output.aspectRatio === '9:16'), 'Template-A2: all detail outputs should use requested 9:16');
  assert(detailRatioDraft.outputs.every(output => output.pageSpec?.layout.aspectRatio === '9:16'), 'Template-A2: pageSpec layout should use requested 9:16');
  assert(detailRatioDraft.outputs.every(output => output.provider === 'new-api'), 'Template-A2: detail outputs should use New API provider');
  assert(detailRatioDraft.outputs.every(output => output.model === 'gpt-image-2'), 'Template-A2: detail workflow should default to GPT Image 2 when model is not requested');
  const detailRatioDefinition = convertWorkflowDraftToDefinition(detailRatioDraft, ['product-image-node'], detailRatioReq, 'workflow_module');
  const detailRatioSteps = Array.isArray(detailRatioDefinition.steps) ? detailRatioDefinition.steps as Array<Record<string, unknown>> : [];
  const detailRatioGenerators = detailRatioSteps.filter(step => step.type === 'image_generator');
  assert(detailRatioGenerators.every(step => step.aspectRatio === '9:16'), 'Template-A2: definition generator steps should keep requested ratio');
  assert(detailRatioGenerators.every(step => step.model === 'gpt-image-2'), 'Template-A2: definition generator steps should keep default GPT Image 2 model');
  const detailLiteReq = '做一个产品详情页工作流，并且用nanobananalite那个模型，改成9比16';
  const detailLiteTurn = prepareAppAgentTurn({ userText: detailLiteReq, context: ctx });
  const detailLiteDraft = getWorkflowDraftAction(detailLiteTurn.deterministicLegacyActions)
    ?.arguments.workflowDraft as WorkflowRecipeDraft | undefined;
  assert(!!detailLiteDraft, 'Template-A2b: should create detail page draft with explicit Nano Banana Lite');
  assert(detailLiteDraft.outputs.every(output => output.aspectRatio === '9:16'), 'Template-A2b: explicit Lite draft should keep requested 9:16');
  assert(detailLiteDraft.outputs.every(output => output.model === 'Xais Nano Pro_2K'), 'Template-A2b: nanobananalite should fall back to Nano Pro 2K');
  const detailLiteDefinition = convertWorkflowDraftToDefinition(detailLiteDraft, ['product-image-node'], detailLiteReq, 'workflow_module');
  const detailLiteSteps = Array.isArray(detailLiteDefinition.steps) ? detailLiteDefinition.steps as Array<Record<string, unknown>> : [];
  assert(detailLiteSteps.filter(step => step.type === 'image_generator').every(step => step.model === 'Xais Nano Pro_2K'), 'Template-A2b: saved definition should keep the supported Nano Pro 2K model');
  const workflowNano2Intent = parseWorkflowBuilderIntent('做一个工作流，用Nano_Banana_2_4K_0模型，比例9:16');
  assert(workflowNano2Intent.generationSettings.model === 'Xais Nano2_4K', 'Template-A2c: XAIS Nano Banana 2 call name should map to Nano2 4K');
  const updateDetailSettingsTurn = prepareAppAgentTurn({ userText: '改成4K，用nano模型', context: ctx, activeDraft: detailRatioDraft });
  const updateDetailSettingsAction = updateDetailSettingsTurn.deterministicLegacyActions.find(action => action.tool === 'canvas_update_workflow_draft');
  assert(updateDetailSettingsAction?.arguments.action === 'set_generation_settings', 'Template-A3: detail draft follow-up should update generation settings');
  const updateDetailSettingsSpec = updateDetailSettingsAction.arguments.outputSpec as Record<string, unknown> | undefined;
  assert(updateDetailSettingsSpec?.resolution === '4K', 'Template-A3: follow-up should capture requested 4K');
  assert(updateDetailSettingsSpec?.model === 'Xais Nano Pro_4K', 'Template-A3: follow-up should switch to explicit Nano 4K');
  assert(!updateDetailSettingsTurn.deterministicLegacyActions.some(action => action.tool === 'canvas_create_workflow_draft'), 'Template-A3: follow-up should not create a new draft');
  const updateAspectOnlyTurn = prepareAppAgentTurn({ userText: '改成1:1', context: ctx, activeDraft: detailRatioDraft });
  const updateAspectOnlyAction = updateAspectOnlyTurn.deterministicLegacyActions.find(action => action.tool === 'canvas_update_workflow_draft');
  assert(updateAspectOnlyAction?.arguments.action === 'set_generation_settings', 'Template-A4: aspect-only follow-up should update current draft');
  const updateAspectOnlySpec = updateAspectOnlyAction.arguments.outputSpec as Record<string, unknown> | undefined;
  assert(updateAspectOnlySpec?.aspectRatio === '1:1', 'Template-A4: aspect-only follow-up should capture requested ratio');
  assert(!Object.prototype.hasOwnProperty.call(updateAspectOnlySpec || {}, 'model'), 'Template-A4: aspect-only follow-up should not change model');
  const updateDetail4kTurn = prepareAppAgentTurn({ userText: '改成4K', context: ctx, activeDraft: detailRatioDraft });
  const updateDetail4kAction = updateDetail4kTurn.deterministicLegacyActions.find(action => action.tool === 'canvas_update_workflow_draft');
  assert(updateDetail4kAction?.arguments.action === 'set_generation_settings', 'Template-A5: resolution follow-up should update current draft');
  const updateDetail4kSpec = updateDetail4kAction.arguments.outputSpec as Record<string, unknown> | undefined;
  assert(updateDetail4kSpec?.model === 'Xais Img2_4K', 'Template-A5: detail draft should keep Image2 family when only resolution changes');

  // ── B: 工业设计评审请求 ──────────────────────────────────────────────────────
  const reviewReq = '帮我设计一个工业设计评审工作流，包括视频图、细节图、CMF图、场景图';
  assert(detectWorkflowTemplate(reviewReq) === 'industrial-design-review',
    'Template-B: "工业设计评审" should route to industrial-design-review');
  const reviewTurn = prepareAppAgentTurn({ userText: reviewReq, context: ctx });
  assert(
    reviewTurn.deterministicLegacyActions.some(a => a.tool === 'canvas_create_workflow_draft'),
    'Template-B: industrial design review should produce canvas_create_workflow_draft',
  );
  assert(!reviewTurn.deterministicLegacyActions.some(a => a.tool === 'canvas_create_workflow'),
    'Template-B: industrial design review should not create workflow before confirmation');
  const reviewDraft = getWorkflowDraftAction(reviewTurn.deterministicLegacyActions)
    ?.arguments.workflowDraft as Record<string, unknown> | undefined;
  assert(reviewDraft?.templateId === 'industrial-design-review',
    'Template-B: workflowDraft.templateId should be industrial-design-review');

  const reviewSettingsReq = '帮我设计一个工业设计评审工作流，要求9比16，4K，用nano模型';
  const reviewSettingsTurn = prepareAppAgentTurn({ userText: reviewSettingsReq, context: ctx });
  const reviewSettingsDraft = getWorkflowDraftAction(reviewSettingsTurn.deterministicLegacyActions)
    ?.arguments.workflowDraft as WorkflowRecipeDraft | undefined;
  assert(!!reviewSettingsDraft, 'Template-B2: should create review draft with generation settings');
  assert(reviewSettingsDraft.outputs.every(output => output.aspectRatio === '9:16'), 'Template-B2: review outputs should use requested 9:16');
  assert(reviewSettingsDraft.outputs.every(output => output.resolution === '4K'), 'Template-B2: review outputs should use requested 4K');
  assert(reviewSettingsDraft.outputs.every(output => output.model === 'Xais Nano Pro_4K'), 'Template-B2: explicit nano 4K should select Nano Pro 4K');
  const updateReview2kTurn = prepareAppAgentTurn({ userText: '改成2K', context: ctx, activeDraft: reviewSettingsDraft });
  const updateReview2kAction = updateReview2kTurn.deterministicLegacyActions.find(action => action.tool === 'canvas_update_workflow_draft');
  assert(updateReview2kAction?.arguments.action === 'set_generation_settings', 'Template-B3: review resolution follow-up should update current draft');
  const updateReview2kSpec = updateReview2kAction.arguments.outputSpec as Record<string, unknown> | undefined;
  assert(updateReview2kSpec?.model === 'Xais Nano Pro_2K', 'Template-B3: review draft should keep Nano family when only resolution changes');
  const storyboardIntent = parseWorkflowBuilderIntent('帮我设计一个视频分镜工作流，要求2K');
  assert(storyboardIntent.generationSettings.model === 'Xais Img2_2K', 'Template-B4: video storyboard workflow should default to Image2 2K');
  const animationStoryboardIntent = parseWorkflowBuilderIntent('帮我设计一个动画分镜工作流，要求4K');
  assert(animationStoryboardIntent.workflowTemplateId === 'video-storyboard-suite', 'Template-B5: animation storyboard should route to storyboard workflow');
  assert(animationStoryboardIntent.generationSettings.model === 'Xais Img2_4K', 'Template-B5: animation storyboard should default to Image2 4K');

  const customSettingsReq = '帮我设计一个工作流，生成场景图、细节图，比例4:5，2K';
  const customSettingsTurn = prepareAppAgentTurn({ userText: customSettingsReq, context: ctx });
  const customSettingsDraft = getWorkflowDraftAction(customSettingsTurn.deterministicLegacyActions)
    ?.arguments.workflowDraft as WorkflowRecipeDraft | undefined;
  assert(!!customSettingsDraft, 'Template-B6: custom workflow with generation settings should create draft');
  assert(customSettingsDraft.outputs.length >= 2, 'Template-B6: custom workflow should include requested outputs');
  assert(customSettingsDraft.outputs.every(output => output.aspectRatio === '4:5'), 'Template-B6: custom workflow should keep requested 4:5 ratio');
  assert(customSettingsDraft.outputs.every(output => output.resolution === '2K'), 'Template-B6: custom workflow should keep requested 2K resolution');
  assert(customSettingsDraft.outputs.every(output => output.model === 'Xais Nano Pro_2K'), 'Template-B6: non-detail/storyboard workflow should default to Nano 2K');

  // ── C: 卖点图 + 主图 → product-detail-page 或 custom ──────────────────────
  const listReq = '帮我设计一个工作流，生成主图、卖点图、细节图、参数图';
  const listTemplate = detectWorkflowTemplate(listReq);
  assert(listTemplate === 'product-detail-page' || listTemplate === 'custom-workflow',
    'Template-C: explicit output list without "评审" should NOT route to industrial-design-review');
  assert(detectWorkflowTemplate(listReq) !== 'industrial-design-review',
    'Template-C: explicit output list must not default to industrial-design-review');

  // ── D: 视频分镜请求 ─────────────────────────────────────────────────────────
  const storyboardReq = '帮我设计一个视频分镜工作流';
  assert(detectWorkflowTemplate(storyboardReq) === 'video-storyboard-suite',
    'Template-D: "视频分镜工作流" should route to video-storyboard-suite');

  // ── E: 纯"帮我设计一个工作流"→ custom ────────────────────────────────────
  const genericReq = '帮我设计一个工作流';
  assert(detectWorkflowTemplate(genericReq) === 'custom-workflow',
    'Template-E: generic "帮我设计一个工作流" should route to custom-workflow, NOT industrial-design-review');

  // ── 关键回归：以下输入不能触发 industrial-design-review ─────────────────────
  const detailReq2 = '根据参考产品图自动生成一套详情页图片';
  assert(detectWorkflowTemplate(detailReq2) === 'product-detail-page',
    'Regression: "参考产品图...详情页" should NOT trigger industrial-design-review');
  const renderReq = '帮我设计一个工作流，自动生成一套产品效果图';
  assert(detectWorkflowTemplate(renderReq) !== 'industrial-design-review',
    'Regression: "产品效果图工作流" without 评审 should NOT trigger industrial-design-review');
}

export function runEcommerceDetailPageSmokeTests() {
  const ctx: AgentCanvasContext = {
    surface: 'canvas',
    selectedIds: ['product-image-node'],
    selectedItems: [],
    visualReferences: [{ id: 'ref', nodeId: 'product-image-node', name: 'product', mediaType: 'image' }],
    nodes: [{ id: 'product-image-node', type: 'image', name: 'product', inputs: [] }],
    presets: [],
    workflows: [],
    drawer: { activeTab: 'all', activeFolderId: '', searchQuery: '', pinned: false, folders: [], items: [] },
  };

  const requestA = '根据这张产品图做一套详情页';
  const turnA = prepareAppAgentTurn({ userText: requestA, context: ctx });
  assert(turnA.activeSkillIds.includes('ecommerce-detail-page-skill'), 'Ecommerce-A: should activate ecommerce-detail-page-skill');
  assert(turnA.activeSkillIds.includes('workflow-builder-skill'), 'Ecommerce-A: should activate workflow-builder-skill');
  assert(detectWorkflowTemplate(requestA) === 'product-detail-page', 'Ecommerce-A: routing should be product-detail-page');
  const actionA = turnA.deterministicLegacyActions.find(action => action.tool === 'canvas_create_workflow_draft');
  assert(!!actionA, 'Ecommerce-A: should create workflow draft');
  const draftA = actionA?.arguments.workflowDraft as WorkflowRecipeDraft;
  assert(draftA.templateId === 'ecommerce-detail-page', 'Ecommerce-A: draft template should be ecommerce-detail-page');
  assert(draftA.outputs.length === 8, 'Ecommerce-A: default should have 8 pages');
  assert(draftA.outputs[0]?.title.includes('主视觉母版页'), 'Ecommerce-A: Page 01 should be master page');
  assert(draftA.outputs.slice(1).every(output => output.status === 'waiting_for_master'), 'Ecommerce-A: Page 02-08 should wait for master');
  assert(draftA.outputs.every(output => output.imageTextLanguage === 'zh-CN'), 'Ecommerce-A: outputs should use zh-CN image text language');
  assert(draftA.outputs.every(output => output.renderMode === 'model_text_baked'), 'Ecommerce-A: default renderMode should be model_text_baked');
  assert(draftA.outputs.every(output => output.prompt.includes('产品锚点：') && output.prompt.includes('生成目标：')), 'Ecommerce-A: default prompt should use structured detail-page visual-director template');
  assert(draftA.outputs.every(output => (
    output.prompt.includes('视觉风格自适应任务')
    && output.prompt.includes('不要所有产品都使用同一套浅灰背景、蓝色标签、灰蓝卡片')
    && output.prompt.includes('不同产品之间必须看起来像不同品牌/不同品类的详情页')
  )), 'Ecommerce-A: prompt should require product-adaptive visual style');
  assert(draftA.outputs.every(output => (
    output.prompt.includes('具体位置、对齐方式、字体气质、标签外形、图标风格')
    && (
      (output.pageSpec?.layout.closeupCount || 0) === 0
      || output.prompt.includes('模块可以是卡片、切片、悬浮玻璃层、硬朗分割框、杂志式标注或场景贴片')
    )
    && !/顶部约 25%|粗黑中文字体|深灰中文字体|圆角描边信息框|真实圆角局部特写卡片/.test(output.prompt)
  )), 'Ecommerce-A: prompt should not hard-code the old detail-page typography/card template');
  assert(draftA.outputs.every(output => (
    output.pageSpec?.styleAnchor.mainColor.includes('产品')
    && output.pageSpec?.styleAnchor.accentColor.includes('不固定蓝色')
    && !/中性浅色背景|低饱和蓝色/.test(output.pageSpec?.styleAnchor.mainColor || '')
  )), 'Ecommerce-A: style anchor should not hard-code the old light gray/blue template');
  assert(draftA.outputs.every(output => output.pageSpec?.copy.adaptive === true), 'Ecommerce-A: default model_text_baked pages should use adaptive product copy');
  assert(draftA.outputs.every(output => output.pageSpec?.copy.sourceBrief === requestA), 'Ecommerce-A: adaptive copy should keep original request as internal brief');
  assert(draftA.outputs.every(output => (
    output.prompt.includes('画面可见文案生成任务')
    && output.prompt.includes('自动写出适合当前产品')
    && output.prompt.includes('绝对不能作为画面文字出现')
  )), 'Ecommerce-A: prompt should separate internal instructions while asking for product-adaptive visible copy');
  assert(draftA.outputs.every(output => !output.prompt.includes('以下文字必须直接、清晰、准确地出现在画面中')), 'Ecommerce-A: adaptive copy prompt should not force fixed template copy');
  const internalInstructionCopyPattern = /prompt|提示词|生成目标|产品锚点|风格锚点|构图锚点|禁止|不得|避免|不要|只呈现|未知参数|保守表达|不制造|不虚构|self-check/i;
  assert(draftA.outputs.every(output => {
    const copy = output.pageSpec?.copy;
    const visibleCopy = [
      copy?.title || '',
      copy?.subtitle || '',
      ...(copy?.tags || []).map(tag => tag.text),
      ...(copy?.localNotes || []),
    ].join(' ');
    return !internalInstructionCopyPattern.test(visibleCopy);
  }), 'Ecommerce-A: visible copy should not contain prompt instructions');
  const defaultLayoutLanguages = draftA.outputs.map(output => output.pageSpec?.styleAnchor.layoutLanguage || '');
  assert(new Set(defaultLayoutLanguages).size >= 6, 'Ecommerce-A: default pages should have varied layout languages');
  const defaultLabelAreas = new Set(draftA.outputs.map(output => output.pageSpec?.layout.labelArea || ''));
  assert(defaultLabelAreas.has('left') && defaultLabelAreas.has('right') && defaultLabelAreas.has('bottom'), 'Ecommerce-A: default pages should vary label areas');
  assert(draftA.outputs.slice(1).every(output => output.prompt.includes('不得复制母版的产品位置')), 'Ecommerce-A: later pages should not copy master composition');
  assert(validateEcommerceDetailPageDraft(draftA).valid, 'Ecommerce-A: default draft should validate');

  const draftB = buildProductDetailPageDraft({
    originalRequest: '生成一套详情页图片，直接带中文标题和卖点标签',
  });
  assert(draftB.outputs.every(output => output.renderMode === 'model_text_baked'), 'Ecommerce-B: direct Chinese copy should use model_text_baked');
  draftB.outputs.forEach(output => {
    const spec = output.pageSpec;
    assert(!!spec, 'Ecommerce-B: each output should have pageSpec');
    assert(spec.copy.adaptive === true, 'Ecommerce-B: each page should let image model adapt copy to product');
    assert(!!spec?.copy.title && !!spec.copy.subtitle, 'Ecommerce-B: each page should have title/subtitle');
    assert(spec.copy.tags.length === 3, 'Ecommerce-B: each page should have 3 tags');
    assert(spec.copy.tags.every(tag => !!tag.icon), 'Ecommerce-B: each tag should have icon');
  });

  const draftC = buildProductDetailPageDraft({
    originalRequest: '只要底图，我后期自己加字',
  });
  assert(draftC.outputs.every(output => output.renderMode === 'visual_background_only'), 'Ecommerce-C: bottom-only request should set visual_background_only');
  assert(draftC.outputs.every(output => (output.pageSpec?.copy.tags.length || 0) === 0), 'Ecommerce-C: visual background only should not force tags/icons');

  const updateDTurn = prepareAppAgentTurn({ userText: '改成6页', context: ctx, activeDraft: draftA });
  const updateD = updateDTurn.deterministicLegacyActions.find(action => action.tool === 'canvas_update_workflow_draft');
  assert(updateD?.arguments.action === 'set_page_count', 'Ecommerce-D: page count edit should update current draft');
  assert(!updateDTurn.deterministicLegacyActions.some(action => action.tool === 'canvas_create_workflow_draft'), 'Ecommerce-D: should not create a new draft');
  const draftD: WorkflowRecipeDraft = {
    ...draftA,
    outputs: draftA.outputs.map(output => ({ ...output, enabled: (output.pageSpec?.pageIndex || output.order) <= 6 })),
  };
  assert(draftD.outputs.filter(output => output.enabled !== false).length === 6, 'Ecommerce-D: draft should have 6 enabled pages after update');

  const updateETurn = prepareAppAgentTurn({ userText: '不要安全页，加一页安装步骤', context: ctx, activeDraft: draftA });
  const updateE = updateETurn.deterministicLegacyActions.find(action => action.tool === 'canvas_update_workflow_draft');
  assert(updateE?.arguments.action === 'ecommerce_patch_pages', 'Ecommerce-E: mixed remove/add should patch current draft');
  const removeIds = Array.isArray(updateE?.arguments.removeOutputIds) ? updateE.arguments.removeOutputIds.map(String) : [];
  const addSpecs = Array.isArray(updateE?.arguments.outputSpecs) ? updateE.arguments.outputSpecs as WorkflowOutputSpec[] : [];
  assert(removeIds.some(id => /安全|稳定|page_04/i.test(id)), 'Ecommerce-E: should remove safety page');
  assert(addSpecs.some(spec => spec.title.includes('安装步骤')), 'Ecommerce-E: should add installation page');

  const updateFTurn = prepareAppAgentTurn({ userText: '确认母版，继续生成后面三页', context: ctx, activeDraft: draftA });
  const updateF = updateFTurn.deterministicLegacyActions.find(action => action.tool === 'canvas_update_workflow_draft');
  assert(updateF?.arguments.action === 'approve_master_and_generate', 'Ecommerce-F: should approve master and ready next pages');
  let readyCount = 0;
  const draftFOutputs = draftA.outputs.map(output => {
    const pageIndex = output.pageSpec?.pageIndex || output.order;
    if (pageIndex === 1) return { ...output, status: 'approved' as const };
    if (output.status === 'waiting_for_master' && readyCount < 3) {
      readyCount += 1;
      return { ...output, status: 'ready' as const };
    }
    return output;
  });
  assert(draftFOutputs.slice(1, 4).every(output => output.status === 'ready'), 'Ecommerce-F: Page 02-04 should become ready');
  assert(draftFOutputs.slice(1, 4).every(output =>
    output.inputRoles.includes('product_reference_image') && output.inputRoles.includes('master_page_image')
  ), 'Ecommerce-F: Page 02-04 should reference product and master images');

  draftA.outputs.forEach(output => {
    const spec = output.pageSpec;
    assert(!!spec, 'Ecommerce-G: every output should have pageSpec');
    assert(/[一-鿿]/.test(spec.copy.title + spec.copy.subtitle + spec.copy.tags.map(tag => tag.text).join('')), 'Ecommerce-G: copy should use Simplified Chinese');
    assert(!spec.copy.tags.some(tag => /^\s*$/.test(tag.text)), 'Ecommerce-G: no blank tag text');
  });
}

export function runWorkflowPlanningRouteSmokeTests() {
  assert(
    resolveWorkflowPlanningRoute({
      quickPlanRequested: false,
      aiAvailability: { canPlanWorkflow: true },
    }) === 'remote_ai',
    'Workflow route: API available + normal send should use remote_ai',
  );
  assert(
    resolveWorkflowPlanningRoute({
      quickPlanRequested: true,
      aiAvailability: { canPlanWorkflow: true },
    }) === 'local_deterministic',
    'Workflow route: quick plan should force local deterministic planner',
  );
  assert(
    resolveWorkflowPlanningRoute({
      quickPlanRequested: false,
      aiAvailability: { canPlanWorkflow: false },
    }) === 'local_deterministic',
    'Workflow route: API unavailable should use local deterministic planner',
  );

  const activeDraft = buildProductDetailPageDraft({ originalRequest: 'make a detail page workflow' });
  assert(
    detectWorkflowDesignIntent({ userText: 'design a portfolio workflow' }) === true,
    'Workflow route: new workflow design request should be detected',
  );
  assert(
    detectWorkflowDesignIntent({ userText: 'change to 6 pages', activeWorkflowDraft: activeDraft }) === false,
    'Workflow route: simple active draft edit should not trigger remote planner',
  );
  assert(
    detectWorkflowDesignIntent({ userText: '保存这个工作流', activeWorkflowDraft: activeDraft }) === false,
    'Workflow route: saving active draft should not trigger remote planner',
  );
  assert(
    detectWorkflowDesignIntent({ userText: 'redesign this workflow deeply', activeWorkflowDraft: activeDraft }) === true,
    'Workflow route: redesign request on active draft should trigger remote planner',
  );

  const updateTurn = prepareAppAgentTurn({ userText: '改成6页', context: {
    surface: 'canvas',
    selectedIds: [],
    selectedItems: [],
    visualReferences: [],
    nodes: [],
    presets: [],
    workflows: [],
    drawer: { activeTab: 'all', activeFolderId: '', searchQuery: '', pinned: false, folders: [], items: [] },
  }, activeDraft });
  assert(
    updateTurn.deterministicLegacyActions.some(action => action.tool === 'canvas_update_workflow_draft'),
    'Workflow route: page count edit should update same draft locally',
  );
  assert(
    !updateTurn.deterministicLegacyActions.some(action => action.tool === 'canvas_create_workflow_draft'),
    'Workflow route: page count edit should not create a new draft',
  );

  const saveTurn = prepareAppAgentTurn({ userText: '保存这个工作流', context: {
    surface: 'canvas',
    selectedIds: [],
    selectedItems: [],
    visualReferences: [],
    nodes: [],
    presets: [],
    workflows: [],
    drawer: { activeTab: 'all', activeFolderId: '', searchQuery: '', pinned: false, folders: [], items: [] },
  }, activeDraft });
  assert(
    saveTurn.deterministicLegacyActions.some(action =>
      action.tool === 'canvas_update_workflow_draft'
      && action.arguments.action === 'save_draft_as_workflow'
    ),
    'Workflow route: save active draft should save the same draft locally',
  );
  assert(
    !saveTurn.deterministicLegacyActions.some(action => action.tool === 'canvas_create_workflow_draft'),
    'Workflow route: save active draft should not create a new draft',
  );

  const proposal = parseWorkflowDraftProposal(JSON.stringify({
    name: 'Portfolio Workflow',
    description: 'Build a concise portfolio image sequence.',
    inputs: [{ id: 'product_reference_image', label: 'Reference', type: 'image', required: true }],
    outputs: [
      {
        id: 'cover',
        title: 'Cover',
        type: 'image_generator',
        enabled: true,
        order: 1,
        prompt: 'Create a cover image.',
        inputRoles: ['product_reference_image'],
      },
      {
        id: 'cover',
        title: 'Case Study',
        type: 'image_generator',
        enabled: true,
        order: 2,
        prompt: 'Create a case study page.',
        inputRoles: ['missing_input'],
      },
    ],
    strategy: { enabled: false, title: '', prompt: '' },
    executionOrder: [['product_reference_image'], ['cover', 'cover_2']],
    languagePolicy: {
      promptLanguage: 'en',
      visibleTextLanguage: 'en',
      imageTextLanguage: 'en',
      allowEnglishTechnicalTerms: true,
    },
    assumptions: ['No brand assets were provided.'],
    imagePolicy: {},
  }));
  const draft = workflowDraftProposalToRecipeDraft({
    proposal,
    userText: 'design a portfolio workflow',
  });
  const noisyProposal = parseWorkflowDraftProposal(
    `Here is the proposal:\n\n\`\`\`json\n${JSON.stringify({
      name: 'Noisy proposal',
      inputs: [{ id: 'product_reference_image', type: 'image' }],
      outputs: [{ id: 'hero', type: 'image_generator', prompt: 'hero' }],
    })}\n\`\`\`\nI kept the output editable.`,
  );
  assert(noisyProposal.name === 'Noisy proposal', 'Workflow proposal: should extract JSON from model preamble and trailing note');
  const trailingCommaProposal = parseWorkflowDraftProposal('{"name":"Trailing comma","inputs":[],"outputs":[],}');
  assert(trailingCommaProposal.name === 'Trailing comma', 'Workflow proposal: should tolerate trailing commas');
  assert(draft.outputs.length === 2, 'Workflow proposal: should create two outputs');
  assert(new Set(draft.outputs.map(output => output.id)).size === 2, 'Workflow proposal: output ids should be unique');
  assert(draft.outputs.every(output => output.prompt.includes('Original request:')), 'Workflow proposal: prompts should include Original request');
  assert(draft.outputs[1]?.inputRoles.includes('product_reference_image'), 'Workflow proposal: invalid input reference should fall back to product reference');
}

describe('App Agent Smoke Tests', () => {
  it('should pass all smoke tests', () => {
    runAppAgentSmokeTests();
  });
  it('should pass routing chain smoke tests (A-E)', () => {
    runRoutingChainSmokeTests();
  });
  it('should pass template routing smoke tests (A-E)', () => {
    runTemplateRoutingSmokeTests();
  });
  it('should pass ecommerce detail page smoke tests (A-G)', () => {
    runEcommerceDetailPageSmokeTests();
  });
  it('should pass workflow planning route smoke tests', () => {
    runWorkflowPlanningRouteSmokeTests();
  });
});
