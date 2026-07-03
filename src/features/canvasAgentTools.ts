import type { AgentCanvasContext } from './agentModel';

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

export const CANVAS_AGENT_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'app_get_context',
      description: '读取整个软件当前状态，包括所在界面、抽屉素材/文件夹、选中项、日历日程、画布节点、预设和工作流。执行软件操作前优先读取。',
      parameters: objectSchema({}),
    },
  },
  {
    type: 'function',
    function: {
      name: 'app_get_ui_snapshot',
      description: '读取当前屏幕上可见的按钮、输入框、选择器和链接，返回可交互 elementId。仅当语义工具没有覆盖某个新功能时使用。密码值永远不会返回。',
      parameters: objectSchema({}),
    },
  },
  {
    type: 'function',
    function: {
      name: 'app_ui_interact',
      description: '按 app_get_ui_snapshot 返回的 elementId 复刻一次用户点击、输入或按键。此回退操作始终需要用户确认。',
      parameters: objectSchema(APP_UI_INTERACT_PROPERTIES, ['action', 'elementId']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'app_navigate',
      description: '复刻用户的界面导航操作：开关抽屉、钉住、进入/退出画布、切换分类/文件夹、搜索、打开设置/记录灵感/网络收图/便签/日历、撤销或控制窗口。',
      parameters: objectSchema(APP_NAVIGATION_PROPERTIES, ['action']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'drawer_manage',
      description: '操作抽屉中的素材、文字、网址、文件夹和桌面便签；targetIds 使用 app_get_context 返回的抽屉 item ID。',
      parameters: objectSchema(DRAWER_MANAGE_PROPERTIES, ['action']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_manage',
      description: '复刻画布节点的选择、删除、清空、复制、移动、缩放、断线、聚焦、运行和参数更新；也可把抽屉图片加入画布。',
      parameters: objectSchema(CANVAS_MANAGE_PROPERTIES, ['action']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'calendar_manage',
      description: '操作日历和日程便签：打开日历、选择日期、新增/更新/删除日程、把抽屉里的文字便签转换为日程便签。日期使用 YYYY-MM-DD、今天、明天或后天；targetIds 使用抽屉文字素材 ID；scheduleId/noteLabel 使用 app_get_context 返回的 calendar.events。',
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
      parameters: objectSchema({
        mediaType: { type: 'string', enum: ['image', 'video'] },
        prompt: { type: 'string' },
        presetId: { type: 'string' },
        inputIds: { type: 'array', items: { type: 'string' } },
        autoRun: { type: 'boolean' },
      }, ['mediaType']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_create_media_tool',
      description: '创建本地媒体处理节点：补帧(frame-interpolation)、图片清晰度增强(image-enhancement)、视频清晰度增强(video-enhancement)。用于用户说“补帧/插帧/图增强/图片增强/视增强/视频增强/清晰度增强”等操作。',
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
      description: '创建或更新可复用的画布节点预设（Prompt 预设）。当用户要做“节点预设/保存预设/修改预设”时使用，不要改用文字节点保存预设文案。',
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
      description: '在画布添加一个文字说明节点。用于保存参考图分析、产品卖点、视频脚本、分镜脚本、提示词拆解、执行说明等文本结果。',
      parameters: objectSchema({ content: { type: 'string' } }, ['content']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_create_text_agent',
      description: '创建一个可运行的 Agent 文字节点。用于让节点根据需求和连接的参考图/视频生成脚本、分析、文案等文本结果；可自动连接当前选中素材并可自动运行。',
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
      description: '创建并插入一个新的可复用工作流模块。仅当用户明确要求“封装/复用/多阶段工作流/自动化流程”时使用；如果只是基于参考图生成脚本/分镜/分析文本，优先使用单个 canvas_create_text_agent，不要拆成多个文字节点。',
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
              arguments: objectSchema({}),
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
              arguments: objectSchema({
                mediaType: { type: 'string', enum: ['image', 'video'] },
                prompt: { type: ['string', 'null'] },
                presetId: { type: ['string', 'null'] },
                inputIds: { type: 'array', items: { type: 'string' } },
                autoRun: { type: 'boolean' },
              }, ['mediaType', 'prompt', 'presetId', 'inputIds', 'autoRun']),
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
  context: AgentCanvasContext,
) => `${basePrompt.trim()}

Agent 执行补充：
- 你是整个“灵感抽屉”软件的操作 Agent，不只是聊天助手。用户要求操作界面、素材、文件夹、便签、日历、日程或画布时，必须调用 app_navigate、drawer_manage、calendar_manage、canvas_manage 或已有画布工具实际执行。
- surface 表示当前界面。位于 drawer 时优先操作抽屉；需要使用画布能力时先 app_navigate(action=enter_canvas)，退出画布使用 exit_canvas。
- 抽屉素材和文件夹 ID 必须来自 drawer.items / drawer.folders；画布节点 ID 必须来自 nodes。不要虚构 ID。
- “打开/切换/搜索/钉住/记录灵感/网络收图/设置/便签/日历”使用 app_navigate；素材增删改、归类、星标、桌面便签和加入画布使用 drawer_manage；新增/修改/删除/完成日程、把文字便签转为日程便签使用 calendar_manage；节点选择、删除、复制、移动、缩放、断线、运行和参数修改使用 canvas_manage。
- 如果用户要求的可见界面操作没有语义工具，先调用 app_get_ui_snapshot 获取控件 elementId，再调用 app_ui_interact 复刻点击、输入或按键；不要猜 elementId。app_ui_interact 会始终要求用户确认。
- 用户明确要求删除、清空或运行付费节点时可以调用对应工具，应用会负责审批；不要只回复操作步骤。
- selectedItems 是用户当前明确选择的素材；回复时要说明你基于哪张/哪些选中素材处理。
- 当用户提到“日历、日程、待办、安排、转日程、便签转日程、完成/勾选/删除日程”时，优先使用 calendar_manage。新增日程传 text/date/priority；修改现有日程使用 calendar.events 里的 noteLabel 与 scheduleId；用户说“把这个/选中的便签转日程”时使用 calendar_manage(action=convert_text_notes_to_schedule,targetIds=selectedIds)。
- 本轮消息发出时的 selectedIds/selectedItems 是稳定快照；即使用户之后取消选择，也要继续使用这些 ID 完成操作，不要因为当前界面选择为空而放弃。
- 用户说“节点预设、Prompt 预设、保存成预设、创建预设、修改预设”时，必须使用 canvas_create_preset；不要把预设内容写进 canvas_add_text。
- 用户说“识别/分析参考图、根据图片输出信息、写视频脚本、写分镜脚本、提炼卖点/风格/材质/镜头语言”时，先基于 visualReferences 中的参考图进行分析，然后必须使用 canvas_add_text 把结果落成文字节点；不要只在聊天里口头回复。
- 如果 selectedItems 为空但 visualReferences 有图片，说明画布上已有可用参考图；用户说“参考图/这张图/这些图”时默认使用这些视觉参考。
- 用户明确要求“封装/复用/多阶段工作流/自动化流程/套流程”时，才使用 canvas_create_workflow；如果目标只是基于参考图生成脚本、分镜脚本、文案或分析文本，使用单个 canvas_create_text_agent，不要拆成多个文字节点。
- 用户说“生成、制作、渲染、效果图、出图、做一张图/视频”时，使用 canvas_create_generator，并把 autoRun 设为 true，让应用创建节点后立即开始生成。
- 用户只说“创建生成节点、放一个预设节点”但没有要求立刻出结果时，使用 canvas_create_generator 并把 autoRun 设为 false。
- 如果用户要求最终产出视频/动画，默认链路是：先创建一个 canvas_create_text_agent 连接参考图生成脚本/分镜，再创建 mediaType=video 的 canvas_create_generator，并把 inputIds 显式连接到这个脚本/分镜节点；不要只创建图片节点或文字节点就结束。
- 只有用户明确要求多个可编辑阶段产物时，才创建多个依赖节点；创建多个依赖节点时，后续节点的 inputIds 必须显式填写上一步返回的 nodeId，确保画布上有可见连线。
- 只有用户明确要求便签、文字说明或静态文本节点时，才使用 canvas_add_text。
- 用户要求“做一个生成脚本的节点 / 生成文案的节点 / 生成分析文本的节点 / 可运行的文字节点 / 基于参考图写脚本或分镜”时，使用一个 canvas_create_text_agent，并把参考图/视频节点作为 inputIds 接入；如果用户要求立刻生成结果，把 autoRun 设为 true。
- 用户说“补帧/插帧/RIFE”时，使用 canvas_create_media_tool 且 toolType=frame-interpolation；说“图增强/图片增强/图片清晰度增强/放大修复”时，toolType=image-enhancement；说“视增强/视频增强/视频清晰度增强”时，toolType=video-enhancement。

当前软件上下文如下。所有 ID 必须原样使用。创建复杂任务时优先使用已有 workflowId。
${JSON.stringify(context)}

执行原则：
- 先理解用户目标，再选择最少的软件操作。
- 不要声称已经执行尚未调用的工具。
- 涉及运行工作流时明确说明可能产生 API 费用。
- 如果信息不足，可以只回复并返回空 actions。`;
