import type { AgentCanvasContext } from './agentModel';
import { buildAppAgentSystemPrompt } from './appAgent/kernel/appAgentPrompt';
import { IMAGE_RULE_KEYS } from './appAgent/imageQuality/imageRuleCapsules';
import { INSPIRATION_REFERENCE_ROLES } from './appAgent/inspirationMemory/types';

type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

const objectSchema = (
  properties: Record<string, unknown>,
  required: string[] = [],
) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

const APP_NAVIGATION_ACTIONS = [
  'open_drawer',
  'close_drawer',
  'toggle_pin',
  'enter_canvas',
  'exit_canvas',
  'switch_tab',
  'open_folder',
  'search',
  'clear_search',
  'open_settings',
  'open_text_capture',
  'open_notes',
  'open_calendar',
  'undo',
  'minimize',
  'toggle_maximize',
] as const;

const DRAWER_MANAGE_ACTIONS = [
  'create_text',
  'add_web_image',
  'create_folder',
  'rename_folder',
  'delete_folder',
  'select_items',
  'clear_selection',
  'delete_items',
  'move_items',
  'set_quick_access',
  'open_item',
  'create_floating_note',
  'add_items_to_canvas',
  'update_item',
] as const;

const CANVAS_MANAGE_ACTIONS = [
  'select_nodes',
  'clear_selection',
  'delete_nodes',
  'clear_canvas',
  'duplicate_nodes',
  'move_nodes',
  'resize_node',
  'disconnect_nodes',
  'focus_node',
  'fit_view',
  'zoom',
  'undo',
  'add_drawer_items',
  'update_node',
  'run_nodes',
] as const;

const CALENDAR_MANAGE_ACTIONS = [
  'open',
  'jump_today',
  'select_date',
  'add_schedule',
  'update_schedule',
  'delete_schedule',
  'convert_text_notes_to_schedule',
] as const;

const APP_NAVIGATION_PROPERTIES = {
  action: { type: 'string', enum: APP_NAVIGATION_ACTIONS },
  tab: { type: ['string', 'null'] },
  folderId: { type: ['string', 'null'] },
  query: { type: ['string', 'null'] },
};

const DRAWER_MANAGE_PROPERTIES = {
  action: { type: 'string', enum: DRAWER_MANAGE_ACTIONS },
  targetIds: { type: 'array', items: { type: 'string' } },
  folderId: { type: ['string', 'null'] },
  name: { type: ['string', 'null'] },
  content: { type: ['string', 'null'] },
  url: { type: ['string', 'null'] },
  enabled: { type: ['boolean', 'null'] },
};

const DRAWER_PROFILE_ORGANIZATION_PROPERTIES = {
  folderId: { type: ['string', 'null'] },
  recursive: { type: ['boolean', 'null'] },
  strategy: { type: ['string', 'null'], enum: ['topic', 'topic_color', null] },
  categories: { type: 'array', items: { type: 'string' } },
};

const CANVAS_MANAGE_PROPERTIES = {
  action: { type: 'string', enum: CANVAS_MANAGE_ACTIONS },
  targetIds: { type: 'array', items: { type: 'string' } },
  sourceId: { type: ['string', 'null'] },
  targetId: { type: ['string', 'null'] },
  x: { type: ['number', 'null'] },
  y: { type: ['number', 'null'] },
  width: { type: ['number', 'null'] },
  height: { type: ['number', 'null'] },
  deltaX: { type: ['number', 'null'] },
  deltaY: { type: ['number', 'null'] },
  scale: { type: ['number', 'null'] },
  name: { type: ['string', 'null'] },
  provider: { type: ['string', 'null'] },
  model: { type: ['string', 'null'] },
  aspectRatio: { type: ['string', 'null'] },
  outputFormat: { type: ['string', 'null'] },
  count: { type: ['number', 'null'] },
};

const CALENDAR_MANAGE_PROPERTIES = {
  action: { type: 'string', enum: CALENDAR_MANAGE_ACTIONS },
  scheduleId: { type: ['string', 'null'] },
  noteLabel: { type: ['string', 'null'] },
  targetIds: { type: 'array', items: { type: 'string' } },
  text: { type: ['string', 'null'] },
  title: { type: ['string', 'null'] },
  date: { type: ['string', 'null'] },
  priority: { type: ['string', 'null'], enum: ['S', 'A', 'B', 'C', null] },
  done: { type: ['boolean', 'null'] },
  tagId: { type: ['string', 'null'] },
};

const APP_UI_INTERACT_PROPERTIES = {
  action: { type: 'string', enum: ['click', 'set_value', 'press_key'] },
  elementId: { type: 'string' },
  value: { type: ['string', 'null'] },
  key: { type: ['string', 'null'] },
};

const CONTEXT_SCOPES = [
  'minimal',
  'app',
  'drawer',
  'canvas',
  'calendar',
  'settings',
  'server',
  'ui',
  'full',
] as const;

const IMAGE_REFERENCE_ROLES = ['BASE', 'STYLE_REF', 'LAYOUT_REF', 'SUBJECT_REF', 'NONE'] as const;

const DESIGN_AGENT_ROLE_VALUES = [
  'requirement_analyzer',
  'inspiration_analyzer',
  'design_strategist',
  'design_reviewer',
  'presentation_writer',
  'seedance_video_analyzer',
  'general',
] as const;
const DESIGN_AGENT_ARTIFACT_VALUES = [
  'DesignBrief',
  'ResearchReport',
  'InspirationAnalysis',
  'DesignStrategy',
  'DesignReview',
  'PromptPackage',
  'SeedancePrompt',
  'Document',
] as const;
const DESIGN_AGENT_THINKING_MODE_VALUES = ['analysis', 'generation', 'review'] as const;

const DESIGN_AGENT_CONFIG_SCHEMA = objectSchema({
  agentRole: { type: ['string', 'null'], enum: [...DESIGN_AGENT_ROLE_VALUES, null] },
  outputArtifactType: { type: ['string', 'null'], enum: [...DESIGN_AGENT_ARTIFACT_VALUES, null] },
  thinkingMode: { type: ['string', 'null'], enum: [...DESIGN_AGENT_THINKING_MODE_VALUES, null] },
});

const INSPIRATION_REFERENCE_SCHEMA = objectSchema({
  itemId: { type: 'string' },
  role: { type: 'string', enum: INSPIRATION_REFERENCE_ROLES },
  reason: { type: 'string' },
  matchedFeatures: { type: 'array', items: { type: 'string' } },
  confidence: { type: ['number', 'null'] },
  state: { type: ['string', 'null'], enum: ['candidate', 'selected', 'rejected', null] },
}, ['itemId', 'role', 'reason']);

const DRAWER_SEARCH_INSPIRATIONS_PROPERTIES = {
  query: { type: 'string' },
  projectBrief: { anyOf: [{ type: 'string' }, { type: 'object', additionalProperties: true }] },
  referenceRole: { type: ['string', 'null'], enum: [...INSPIRATION_REFERENCE_ROLES, null] },
  folderIds: { type: 'array', items: { type: 'string' } },
  topK: { type: ['number', 'null'], minimum: 1, maximum: 8 },
};

const ANALYZE_INSPIRATION_PROPERTIES = {
  itemId: { type: 'string' },
  imageSource: { type: ['string', 'null'] },
  existingProfile: { type: ['object', 'null'], additionalProperties: true },
  userTags: { type: 'array', items: { type: 'string' } },
  userNotes: { type: 'array', items: { type: 'string' } },
  forceRefresh: { type: ['boolean', 'null'] },
};

const ANALYZE_INSPIRATIONS_BATCH_PROPERTIES = {
  itemIds: { type: 'array', items: { type: 'string' } },
  forceRefresh: { type: ['boolean', 'null'] },
  priority: { type: ['string', 'null'], enum: ['low', 'normal', 'high', null] },
};

const GENERATOR_REFERENCE_ROLE_SCHEMA = objectSchema({
  nodeId: { type: 'string' },
  role: { type: 'string', enum: IMAGE_REFERENCE_ROLES },
}, ['nodeId', 'role']);

const GENERATOR_SKILL_META_SCHEMA = {
  type: 'object',
  properties: {
    skillId: { type: ['string', 'null'] },
    originalRequest: { type: ['string', 'null'] },
    fidelity: { type: ['string', 'null'], enum: ['L1', 'L2', 'L3', 'L4', null] },
    productCategory: { type: ['string', 'null'] },
    focus: { type: 'array', items: { type: 'string' } },
  },
  additionalProperties: true,
};

const IMAGE_RULE_STATE_SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(IMAGE_RULE_KEYS.map(key => [key, { type: ['boolean', 'null'] }])),
  additionalProperties: false,
};

const IMAGE_POLICY_SCHEMA = {
  type: 'object',
  properties: {
    rules: IMAGE_RULE_STATE_SCHEMA,
    defaultPreset: { type: ['string', 'null'] },
    panelExpanded: { type: ['boolean', 'null'] },
    updatedAt: { type: ['number', 'null'] },
  },
  additionalProperties: false,
};

const CANVAS_CREATE_GENERATOR_PROPERTIES = {
  mediaType: { type: 'string', enum: ['image', 'video'] },
  prompt: { type: ['string', 'null'] },
  presetId: { type: ['string', 'null'] },
  inputIds: { type: 'array', items: { type: 'string' } },
  autoRun: { type: 'boolean' },
  sourceImageNodeId: { type: ['string', 'null'] },
  referenceImageNodeIds: { type: 'array', items: { type: 'string' } },
  referenceRoles: {
    type: 'array',
    items: GENERATOR_REFERENCE_ROLE_SCHEMA,
  },
  aspectRatio: { type: ['string', 'null'] },
  targetSize: { type: ['string', 'null'] },
  resolution: { type: ['string', 'null'] },
  toolHint: { type: ['string', 'null'] },
  skillMeta: GENERATOR_SKILL_META_SCHEMA,
  imagePolicy: IMAGE_POLICY_SCHEMA,
  inspirationReferences: { type: 'array', items: INSPIRATION_REFERENCE_SCHEMA },
};

const CANVAS_CREATE_DESIGN_PIPELINE_PROPERTIES = {
  request: { type: 'string' },
  projectBrief: { anyOf: [{ type: 'string' }, { type: 'object', additionalProperties: true }] },
  analysisPrompt: { type: ['string', 'null'] },
  generatorPrompt: { type: ['string', 'null'] },
  inputIds: { type: 'array', items: { type: 'string' } },
  referenceCount: { type: ['number', 'null'], minimum: 5, maximum: 5 },
  autoRunAnalysis: { type: 'boolean' },
  autoRunGenerator: { type: 'boolean' },
  presetId: { type: ['string', 'null'] },
  provider: { type: ['string', 'null'] },
  model: { type: ['string', 'null'] },
  aspectRatio: { type: ['string', 'null'] },
  targetSize: { type: ['string', 'null'] },
  resolution: { type: ['string', 'null'] },
  toolHint: { type: ['string', 'null'] },
  skillMeta: GENERATOR_SKILL_META_SCHEMA,
};

const WORKFLOW_STEP_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: ['string', 'null'] },
    type: { type: ['string', 'null'], enum: ['text_agent', 'image_generator', 'reference_image_bridge', null] },
    kind: { type: ['string', 'null'], enum: ['text', 'image-generator', 'reference-image-bridge', null] },
    mediaType: { type: ['string', 'null'], enum: ['image', 'video', null] },
    title: { type: ['string', 'null'] },
    label: { type: ['string', 'null'] },
    prompt: { type: ['string', 'null'] },
    outputRole: { type: ['string', 'null'] },
    bridgeType: { type: ['string', 'null'], enum: ['reference_image', null] },
    inputStepIds: { type: 'array', items: { type: 'string' } },
    visualInputStepIds: { type: 'array', items: { type: 'string' } },
    textInputStepIds: { type: 'array', items: { type: 'string' } },
    inputRoles: { type: 'object', additionalProperties: true },
    acceptsExternalInputs: { type: ['boolean', 'null'] },
    externalInputTypes: { type: 'array', items: { type: 'string', enum: ['image', 'text', 'video'] } },
    outputType: { type: ['string', 'null'], enum: ['image', 'image[]', 'text', 'video', 'video[]', null] },
    required: { type: ['boolean', 'null'] },
    requiresReferenceImages: { type: ['boolean', 'null'] },
    optional: { type: ['boolean', 'null'] },
    aspectRatio: { type: ['string', 'null'] },
    targetSize: { type: ['string', 'null'] },
    resolution: { type: ['string', 'null'] },
    outputFormat: { type: ['string', 'null'] },
    count: { type: ['number', 'null'] },
    toolHint: { type: ['string', 'null'] },
    designAgentConfig: DESIGN_AGENT_CONFIG_SCHEMA,
    skillMeta: { type: 'object', additionalProperties: true },
    imagePolicy: IMAGE_POLICY_SCHEMA,
  },
  additionalProperties: true,
};

const WORKFLOW_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    type: { type: 'string' },
    required: { type: ['boolean', 'null'] },
    label: { type: ['string', 'null'] },
    bindingState: { type: ['string', 'null'], enum: ['bound', 'unbound', null] },
  },
  additionalProperties: true,
};

const WORKFLOW_DEFINITION_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: ['string', 'null'] },
    name: { type: ['string', 'null'] },
    description: { type: ['string', 'null'] },
    templateId: { type: ['string', 'null'] },
    creationMode: { type: ['string', 'null'], enum: ['workflow_module', 'canvas_nodes_fallback', null] },
    strategyStepMode: { type: ['string', 'null'], enum: ['auto', 'enabled', 'disabled', null] },
    inputs: { type: 'array', items: WORKFLOW_INPUT_SCHEMA },
    steps: { type: 'array', items: WORKFLOW_STEP_SCHEMA },
    metadata: { type: 'object', additionalProperties: true },
    executionOrder: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
  },
  additionalProperties: true,
};

const CANVAS_CREATE_WORKFLOW_PROPERTIES = {
  name: { type: ['string', 'null'] },
  label: { type: ['string', 'null'] },
  description: { type: ['string', 'null'] },
  hint: { type: ['string', 'null'] },
  templateId: { type: ['string', 'null'] },
  inputIds: { type: 'array', items: { type: 'string' } },
  selectedReferenceImageNodeIds: { type: 'array', items: { type: 'string' } },
  inputBindings: { type: 'object', additionalProperties: true },
  autoApplyToCanvas: { type: ['boolean', 'null'] },
  autoRun: { type: 'boolean' },
  inputs: { type: 'array', items: WORKFLOW_INPUT_SCHEMA },
  steps: { type: 'array', items: WORKFLOW_STEP_SCHEMA },
  inspirationReferences: { type: 'array', items: INSPIRATION_REFERENCE_SCHEMA },
  metadata: { type: 'object', additionalProperties: true },
  workflowDefinition: WORKFLOW_DEFINITION_SCHEMA,
};

export const CANVAS_AGENT_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'app_get_context',
      description: '读取指定 scopes 的 compact 软件上下文。',
      parameters: objectSchema({
        scopes: { type: 'array', items: { type: 'string', enum: CONTEXT_SCOPES } },
        detail: { type: ['string', 'null'], enum: ['compact', 'full', null] },
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'app_get_ui_snapshot',
      description: '读取当前可见 UI 控件快照，返回可交互 elementId。',
      parameters: objectSchema({}),
    },
  },
  {
    type: 'function',
    function: {
      name: 'app_ui_interact',
      description: '按 elementId 复刻一次点击、输入或按键。',
      parameters: objectSchema(APP_UI_INTERACT_PROPERTIES, ['action', 'elementId']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'app_navigate',
      description: '执行全局界面导航、搜索、入口和窗口操作。',
      parameters: objectSchema(APP_NAVIGATION_PROPERTIES, ['action']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_inspiration',
      description: '使用当前 Agent LLM API 分析一张抽屉图片并把结构化 InspirationProfile 写回素材。',
      parameters: objectSchema(ANALYZE_INSPIRATION_PROPERTIES, ['itemId']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_inspirations_batch',
      description: '创建后台批量图片分析任务，使用当前 Agent LLM API 为历史素材补全 InspirationProfile。',
      parameters: objectSchema(ANALYZE_INSPIRATIONS_BATCH_PROPERTIES, ['itemIds']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_inspiration_analysis_job',
      description: '查询批量 InspirationProfile 分析任务的进度和错误。',
      parameters: objectSchema({ jobId: { type: 'string' } }, ['jobId']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'drawer_search_inspirations',
      description: '根据项目需求检索用户长期收藏的图片灵感，并返回推荐参考角色、原因和匹配特征。',
      parameters: objectSchema(DRAWER_SEARCH_INSPIRATIONS_PROPERTIES, ['query', 'projectBrief']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'drawer_manage',
      description: '操作抽屉素材、文件夹、选择和便签。',
      parameters: objectSchema(DRAWER_MANAGE_PROPERTIES, ['action']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'drawer_get_analysis_coverage',
      description: '统计指定文件夹或整个抽屉的图片分析覆盖率。直接扫描完整抽屉，不需要素材 ID。',
      parameters: objectSchema(DRAWER_PROFILE_ORGANIZATION_PROPERTIES),
    },
  },
  {
    type: 'function',
    function: {
      name: 'drawer_plan_organization',
      description: '根据图片已有 InspirationProfile 在本地生成完整整理预览，不调用模型、不移动素材，也不需要素材 ID。默认使用当前文件夹。',
      parameters: objectSchema(DRAWER_PROFILE_ORGANIZATION_PROPERTIES),
    },
  },
  {
    type: 'function',
    function: {
      name: 'drawer_apply_organization',
      description: '执行已预览的抽屉整理计划。必须传入 drawer_plan_organization 返回的 planId；这是批量移动操作，执行前需要用户确认。',
      parameters: objectSchema({
        planId: { type: 'string' },
        minimumConfidence: { type: ['number', 'null'], minimum: 0, maximum: 1 },
      }, ['planId']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_manage',
      description: '操作已有画布节点和画布视图。',
      parameters: objectSchema(CANVAS_MANAGE_PROPERTIES, ['action']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'calendar_manage',
      description: '操作日历、日程和文字便签转日程。',
      parameters: objectSchema(CALENDAR_MANAGE_PROPERTIES, ['action']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_get_context',
      description: '读取当前画布节点、选择、可用预设和工作流。',
      parameters: objectSchema({}),
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_create_design_pipeline',
      description: '根据产品设计需求仅检索灵感抽屉里已有的分析标签和元数据，按品类 2 张、造型 2 张、颜色/明确风格 1 张选取五张图片；把五张图同时连接设计分析 Agent 和下游生图节点。',
      parameters: objectSchema(CANVAS_CREATE_DESIGN_PIPELINE_PROPERTIES, ['request']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_create_generator',
      description: '创建图片或视频生成节点，可连接已有输入节点。',
      parameters: objectSchema(CANVAS_CREATE_GENERATOR_PROPERTIES, ['mediaType']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_create_media_tool',
      description: '创建本地媒体处理节点。',
      parameters: objectSchema({
        toolType: { type: 'string', enum: ['frame-interpolation', 'image-enhancement', 'video-enhancement'] },
        inputIds: { type: 'array', items: { type: 'string' } },
        autoRun: { type: 'boolean' },
      }, ['toolType']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_create_preset',
      description: '创建或更新可复用的画布 Prompt 预设。',
      parameters: objectSchema({
        presetId: { type: 'string' },
        label: { type: 'string' },
        hint: { type: 'string' },
        prompt: { type: 'string' },
        aspectRatio: { type: 'string' },
        outputFormat: { type: 'string' },
        count: { type: 'number' },
        createNode: { type: 'boolean' },
        mediaType: { type: 'string', enum: ['image', 'video'] },
        inputIds: { type: 'array', items: { type: 'string' } },
      }, ['label', 'prompt']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_add_text',
      description: '在画布添加一个静态文字说明节点。',
      parameters: objectSchema({ content: { type: 'string' } }, ['content']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_create_text_agent',
      description: '创建一个可运行的 Agent 文字节点。',
      parameters: objectSchema({
        prompt: { type: 'string' },
        inputIds: { type: 'array', items: { type: 'string' } },
        autoRun: { type: 'boolean' },
        designAgentConfig: DESIGN_AGENT_CONFIG_SCHEMA,
      }, ['prompt']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_run_text_agent',
      description: '运行指定或当前选中的 Agent 文字节点，生成/刷新中间的文本结果。',
      parameters: objectSchema({
        nodeId: { type: 'string' },
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_apply_workflow',
      description: '按 ID 或名称添加已有工作流，并自动连接当前选中素材。',
      parameters: objectSchema({
        workflowId: { type: 'string' },
        workflowName: { type: 'string' },
        inputIds: { type: 'array', items: { type: 'string' } },
        projectBrief: { type: 'string' },
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_create_workflow',
      description: '创建并插入一个新的可复用工作流模块。',
      parameters: objectSchema(CANVAS_CREATE_WORKFLOW_PROPERTIES),
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_create_workflow_draft',
      description: '创建可编辑工作流草稿，展示给用户确认后再保存为正式工作流。',
      parameters: objectSchema({
        workflowDraft: { type: 'object', additionalProperties: true },
        languagePolicy: { type: 'object', additionalProperties: true },
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_update_workflow_draft',
      description: '更新当前工作流草稿的输出节点、语言策略或strategy 开关。',
      parameters: objectSchema({
        action: { type: 'string', enum: ['add_output', 'remove_output', 'update_output_prompt', 'set_language', 'toggle_strategy', 'save_draft_as_workflow'] },
        outputId: { type: ['string', 'null'] },
        outputSpec: { type: 'object', additionalProperties: true },
        languagePolicy: { type: 'object', additionalProperties: true },
        strategyEnabled: { type: ['boolean', 'null'] },
      }, ['action']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_update_prompt',
      description: '修改指定生成节点的 Prompt。',
      parameters: objectSchema({
        nodeId: { type: 'string' },
        prompt: { type: 'string' },
      }, ['nodeId', 'prompt']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_connect_nodes',
      description: '将一个素材或上游节点连接到目标生成/工作流节点。',
      parameters: objectSchema({
        sourceId: { type: 'string' },
        targetId: { type: 'string' },
      }, ['sourceId', 'targetId']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_organize',
      description: '整理全部节点或指定节点的布局。',
      parameters: objectSchema({
        nodeIds: { type: 'array', items: { type: 'string' } },
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_run_workflow',
      description: '运行指定或当前选中的工作流节点。这个操作可能产生 API 费用。',
      parameters: objectSchema({
        nodeIds: { type: 'array', items: { type: 'string' } },
      }),
    },
  },
];

export const CANVAS_AGENT_ACTION_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        anyOf: [
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['app_get_context'] },
              arguments: objectSchema({
                scopes: { type: 'array', items: { type: 'string', enum: CONTEXT_SCOPES } },
                detail: { type: ['string', 'null'], enum: ['compact', 'full', null] },
              }),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['app_get_ui_snapshot'] },
              arguments: objectSchema({}),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['app_ui_interact'] },
              arguments: objectSchema(APP_UI_INTERACT_PROPERTIES, ['action', 'elementId', 'value', 'key']),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['app_navigate'] },
              arguments: objectSchema(APP_NAVIGATION_PROPERTIES, ['action', 'tab', 'folderId', 'query']),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['analyze_inspiration'] },
              arguments: objectSchema(ANALYZE_INSPIRATION_PROPERTIES, ['itemId', 'imageSource', 'existingProfile', 'userTags', 'userNotes', 'forceRefresh']),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['analyze_inspirations_batch'] },
              arguments: objectSchema(ANALYZE_INSPIRATIONS_BATCH_PROPERTIES, ['itemIds', 'forceRefresh', 'priority']),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['get_inspiration_analysis_job'] },
              arguments: objectSchema({ jobId: { type: 'string' } }, ['jobId']),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['drawer_search_inspirations'] },
              arguments: objectSchema(DRAWER_SEARCH_INSPIRATIONS_PROPERTIES, ['query', 'projectBrief', 'referenceRole', 'folderIds', 'topK']),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['drawer_manage'] },
              arguments: objectSchema(DRAWER_MANAGE_PROPERTIES, ['action', 'targetIds', 'folderId', 'name', 'content', 'url', 'enabled']),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['drawer_get_analysis_coverage'] },
              arguments: objectSchema(DRAWER_PROFILE_ORGANIZATION_PROPERTIES, ['folderId', 'recursive', 'strategy', 'categories']),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['drawer_plan_organization'] },
              arguments: objectSchema(DRAWER_PROFILE_ORGANIZATION_PROPERTIES, ['folderId', 'recursive', 'strategy', 'categories']),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['drawer_apply_organization'] },
              arguments: objectSchema({
                planId: { type: 'string' },
                minimumConfidence: { type: ['number', 'null'] },
              }, ['planId', 'minimumConfidence']),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['canvas_manage'] },
              arguments: objectSchema(CANVAS_MANAGE_PROPERTIES, [
                'action',
                'targetIds',
                'sourceId',
                'targetId',
                'x',
                'y',
                'width',
                'height',
                'deltaX',
                'deltaY',
                'scale',
                'name',
                'provider',
                'model',
                'aspectRatio',
                'outputFormat',
                'count',
              ]),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['calendar_manage'] },
              arguments: objectSchema(CALENDAR_MANAGE_PROPERTIES, [
                'action',
                'scheduleId',
                'noteLabel',
                'targetIds',
                'text',
                'title',
                'date',
                'priority',
                'done',
                'tagId',
              ]),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['canvas_get_context'] },
              arguments: objectSchema({}),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['canvas_create_design_pipeline'] },
              arguments: objectSchema(CANVAS_CREATE_DESIGN_PIPELINE_PROPERTIES, ['request']),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['canvas_create_generator'] },
              arguments: objectSchema(CANVAS_CREATE_GENERATOR_PROPERTIES, [
                'mediaType',
                'prompt',
                'presetId',
                'inputIds',
                'autoRun',
              ]),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['canvas_create_media_tool'] },
              arguments: objectSchema({
                toolType: { type: 'string', enum: ['frame-interpolation', 'image-enhancement', 'video-enhancement'] },
                inputIds: { type: 'array', items: { type: 'string' } },
                autoRun: { type: 'boolean' },
              }, ['toolType', 'inputIds', 'autoRun']),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['canvas_create_preset'] },
              arguments: objectSchema({
                presetId: { type: ['string', 'null'] },
                label: { type: 'string' },
                hint: { type: ['string', 'null'] },
                prompt: { type: 'string' },
                aspectRatio: { type: ['string', 'null'] },
                outputFormat: { type: ['string', 'null'] },
                count: { type: ['number', 'null'] },
                createNode: { type: 'boolean' },
                mediaType: { type: ['string', 'null'] },
                inputIds: { type: 'array', items: { type: 'string' } },
              }, [
                'presetId',
                'label',
                'hint',
                'prompt',
                'aspectRatio',
                'outputFormat',
                'count',
                'createNode',
                'mediaType',
                'inputIds',
              ]),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['canvas_add_text'] },
              arguments: objectSchema({ content: { type: 'string' } }, ['content']),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['canvas_create_text_agent'] },
              arguments: objectSchema({
                prompt: { type: 'string' },
                inputIds: { type: 'array', items: { type: 'string' } },
                autoRun: { type: 'boolean' },
              }, ['prompt', 'inputIds', 'autoRun']),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['canvas_run_text_agent'] },
              arguments: objectSchema({
                nodeId: { type: ['string', 'null'] },
              }, ['nodeId']),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['canvas_apply_workflow'] },
              arguments: objectSchema({
                workflowId: { type: ['string', 'null'] },
                workflowName: { type: ['string', 'null'] },
                inputIds: { type: 'array', items: { type: 'string' } },
                projectBrief: { type: ['string', 'null'] },
              }, ['workflowId', 'workflowName']),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['canvas_create_workflow'] },
              arguments: objectSchema(CANVAS_CREATE_WORKFLOW_PROPERTIES),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['canvas_create_workflow_draft'] },
              arguments: objectSchema({
                workflowDraft: { type: 'object', additionalProperties: true },
                languagePolicy: { type: 'object', additionalProperties: true },
              }),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['canvas_update_workflow_draft'] },
              arguments: objectSchema({
                action: { type: 'string', enum: ['add_output', 'remove_output', 'update_output_prompt', 'set_language', 'toggle_strategy', 'save_draft_as_workflow'] },
                outputId: { type: ['string', 'null'] },
                outputSpec: { type: 'object', additionalProperties: true },
                languagePolicy: { type: 'object', additionalProperties: true },
                strategyEnabled: { type: ['boolean', 'null'] },
              }, ['action']),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['canvas_update_prompt'] },
              arguments: objectSchema({
                nodeId: { type: 'string' },
                prompt: { type: 'string' },
              }, ['nodeId', 'prompt']),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['canvas_connect_nodes'] },
              arguments: objectSchema({
                sourceId: { type: 'string' },
                targetId: { type: 'string' },
              }, ['sourceId', 'targetId']),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['canvas_organize'] },
              arguments: objectSchema({
                nodeIds: { type: 'array', items: { type: 'string' } },
              }, ['nodeIds']),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['canvas_run_workflow'] },
              arguments: objectSchema({
                nodeIds: { type: 'array', items: { type: 'string' } },
              }, ['nodeIds']),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
        ],
      },
    },
  },
  required: ['reply', 'actions'],
  additionalProperties: false,
};

const READ_ONLY_TOOLS = new Set([
  'app_get_context',
  'app_get_ui_snapshot',
  'canvas_get_context',
  'drawer_search_inspirations',
  'get_inspiration_analysis_job',
  'drawer_get_analysis_coverage',
  'drawer_plan_organization',
]);

export const isCanvasAgentToolReadOnly = (name: string) => READ_ONLY_TOOLS.has(name);

export const isCanvasAgentToolSensitive = (name: string, args: Record<string, unknown> = {}) => (
  name === 'canvas_run_workflow'
  || name === 'canvas_run_text_agent'
  || name === 'app_ui_interact'
  || name === 'drawer_apply_organization'
  || (name === 'calendar_manage' && ['delete_schedule'].includes(String(args.action || '')))
  || (name === 'drawer_manage' && ['delete_items', 'delete_folder'].includes(String(args.action || '')))
  || (name === 'canvas_manage' && ['delete_nodes', 'clear_canvas', 'run_nodes'].includes(String(args.action || '')))
  || (
    name === 'canvas_create_design_pipeline'
    && (args.autoRunAnalysis !== false || args.autoRunGenerator === true)
  )
  || (
    name === 'canvas_create_generator'
    && args.mediaType === 'video'
    && args.autoRun === true
  )
);

export const getCanvasAgentToolLabel = (name: string) => ({
  drawer_get_analysis_coverage: '统计图片分析覆盖率',
  drawer_plan_organization: '预览智能整理',
  drawer_apply_organization: '执行智能整理',
  app_get_context: '读取软件状态',
  app_get_ui_snapshot: '读取可见控件',
  app_ui_interact: '复刻界面操作',
  app_navigate: '操作软件界面',
  drawer_manage: '操作灵感抽屉',
  drawer_search_inspirations: '检索灵感抽屉',
  analyze_inspiration: '分析灵感图片',
  analyze_inspirations_batch: '批量分析灵感图片',
  get_inspiration_analysis_job: '查询灵感分析进度',
  canvas_manage: '操作画布节点',
  calendar_manage: '操作日历日程',
  canvas_get_context: '读取画布',
  canvas_create_design_pipeline: '创建产品设计链路',
  canvas_create_generator: '创建生成节点',
  canvas_create_media_tool: '创建媒体处理节点',
  canvas_create_preset: '创建节点预设',
  canvas_add_text: '添加文字节点',
  canvas_create_text_agent: '创建 Design Agent 节点',
  canvas_run_text_agent: '运行 Design Agent 节点',
  canvas_apply_workflow: '应用工作流',
  canvas_create_workflow: '创建工作流',
  canvas_create_workflow_draft: '创建工作流草稿',
  canvas_update_workflow_draft: '更新工作流草稿',
  canvas_update_prompt: '修改 Prompt',
  canvas_connect_nodes: '连接节点',
  canvas_organize: '整理画布',
  canvas_run_workflow: '运行工作流',
}[name] || name);

export const parseAgentArguments = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }
  return {};
};

export const parseCodexCanvasEnvelope = (raw: string) => {
  const clean = raw.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  const candidates = [clean];
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(clean.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (!parsed || typeof parsed !== 'object') continue;
      const record = parsed as Record<string, unknown>;
      return {
        reply: typeof record.reply === 'string' ? record.reply : raw,
        actions: Array.isArray(record.actions)
          ? record.actions.map(action => {
            const item = action && typeof action === 'object' ? action as Record<string, unknown> : {};
            return {
              tool: typeof item.tool === 'string' ? item.tool : '',
              arguments: parseAgentArguments(item.arguments),
            };
          }).filter(action => action.tool)
          : [],
      };
    } catch (_) {
      // Try the next candidate.
    }
  }
  return null;
};

export const buildCanvasAgentSystemPrompt = (
  basePrompt: string,
  context: AgentCanvasContext | unknown,
  activeSkillPrompt = '',
) => buildAppAgentSystemPrompt({
  basePrompt,
  activeSkillPrompt,
  compactContext: context,
});
