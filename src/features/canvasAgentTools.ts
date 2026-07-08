import type { AgentCanvasContext } from './agentModel';
import { buildAppAgentSystemPrompt } from './appAgent/kernel/appAgentPrompt';

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
  'open_web_collector',
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
};

export const CANVAS_AGENT_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'app_get_context',
      description: '按 scopes 读取精简软件上下文。',
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
      name: 'drawer_manage',
      description: '操作抽屉素材、文件夹、选择和便签。',
      parameters: objectSchema(DRAWER_MANAGE_PROPERTIES, ['action']),
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
      }),
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_create_workflow',
      description: '创建并插入一个新的可复用工作流模块。',
      parameters: objectSchema({
        label: { type: 'string' },
        hint: { type: 'string' },
        inputIds: { type: 'array', items: { type: 'string' } },
        autoRun: { type: 'boolean' },
        steps: {
          type: 'array',
          items: objectSchema({
            id: { type: 'string' },
            kind: { type: 'string', enum: ['text', 'image-generator'] },
            label: { type: 'string' },
            prompt: { type: 'string' },
            inputStepIds: { type: 'array', items: { type: 'string' } },
            aspectRatio: { type: 'string' },
            outputFormat: { type: 'string' },
            count: { type: 'number' },
          }, ['kind', 'label', 'prompt']),
        },
      }, ['label', 'steps']),
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
              tool: { type: 'string', enum: ['drawer_manage'] },
              arguments: objectSchema(DRAWER_MANAGE_PROPERTIES, ['action', 'targetIds', 'folderId', 'name', 'content', 'url', 'enabled']),
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
              }, ['workflowId', 'workflowName']),
            },
            required: ['tool', 'arguments'],
            additionalProperties: false,
          },
          {
            type: 'object',
            properties: {
              tool: { type: 'string', enum: ['canvas_create_workflow'] },
              arguments: objectSchema({
                label: { type: 'string' },
                hint: { type: ['string', 'null'] },
                inputIds: { type: 'array', items: { type: 'string' } },
                autoRun: { type: 'boolean' },
                steps: {
                  type: 'array',
                  items: objectSchema({
                    id: { type: ['string', 'null'] },
                    kind: { type: 'string', enum: ['text', 'image-generator'] },
                    label: { type: 'string' },
                    prompt: { type: 'string' },
                    inputStepIds: { type: 'array', items: { type: 'string' } },
                    aspectRatio: { type: ['string', 'null'] },
                    outputFormat: { type: ['string', 'null'] },
                    count: { type: ['number', 'null'] },
                  }, ['id', 'kind', 'label', 'prompt', 'inputStepIds', 'aspectRatio', 'outputFormat', 'count']),
                },
              }, ['label', 'hint', 'inputIds', 'autoRun', 'steps']),
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

const READ_ONLY_TOOLS = new Set(['app_get_context', 'app_get_ui_snapshot', 'canvas_get_context']);

export const isCanvasAgentToolReadOnly = (name: string) => READ_ONLY_TOOLS.has(name);

export const isCanvasAgentToolSensitive = (name: string, args: Record<string, unknown> = {}) => (
  name === 'canvas_run_workflow'
  || name === 'canvas_run_text_agent'
  || name === 'app_ui_interact'
  || (name === 'calendar_manage' && ['delete_schedule'].includes(String(args.action || '')))
  || (name === 'drawer_manage' && ['delete_items', 'delete_folder'].includes(String(args.action || '')))
  || (name === 'canvas_manage' && ['delete_nodes', 'clear_canvas', 'run_nodes'].includes(String(args.action || '')))
  || (
    name === 'canvas_create_generator'
    && args.mediaType === 'video'
    && args.autoRun === true
  )
);

export const getCanvasAgentToolLabel = (name: string) => ({
  app_get_context: '读取软件状态',
  app_get_ui_snapshot: '读取可见控件',
  app_ui_interact: '复刻界面操作',
  app_navigate: '操作软件界面',
  drawer_manage: '操作灵感抽屉',
  canvas_manage: '操作画布节点',
  calendar_manage: '操作日历日程',
  canvas_get_context: '读取画布',
  canvas_create_generator: '创建生成节点',
  canvas_create_media_tool: '创建媒体处理节点',
  canvas_create_preset: '创建节点预设',
  canvas_add_text: '添加文字节点',
  canvas_create_text_agent: '创建 Agent 文字节点',
  canvas_run_text_agent: '运行 Agent 文字节点',
  canvas_apply_workflow: '应用工作流',
  canvas_create_workflow: '创建工作流',
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
