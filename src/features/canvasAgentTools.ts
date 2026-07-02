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

export const CANVAS_AGENT_TOOL_DEFINITIONS: ToolDefinition[] = [
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
      }, ['mediaType']),
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_add_text',
      description: '在画布添加一个文字说明节点。',
      parameters: objectSchema({ content: { type: 'string' } }, ['content']),
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
        type: 'object',
        properties: {
          tool: {
            type: 'string',
            enum: CANVAS_AGENT_TOOL_DEFINITIONS.map(tool => tool.function.name),
          },
          arguments: { type: 'object', additionalProperties: true },
        },
        required: ['tool', 'arguments'],
        additionalProperties: false,
      },
    },
  },
  required: ['reply', 'actions'],
  additionalProperties: false,
};

const READ_ONLY_TOOLS = new Set(['canvas_get_context']);

export const isCanvasAgentToolReadOnly = (name: string) => READ_ONLY_TOOLS.has(name);

export const isCanvasAgentToolSensitive = (name: string) => name === 'canvas_run_workflow';

export const getCanvasAgentToolLabel = (name: string) => ({
  canvas_get_context: '读取画布',
  canvas_create_generator: '创建生成节点',
  canvas_add_text: '添加文字节点',
  canvas_apply_workflow: '应用工作流',
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
  try {
    const parsed = JSON.parse(clean);
    if (!parsed || typeof parsed !== 'object') return null;
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
    return null;
  }
};

export const buildCanvasAgentSystemPrompt = (
  basePrompt: string,
  context: AgentCanvasContext,
) => `${basePrompt.trim()}

当前画布上下文如下。节点 ID 必须原样使用，不要虚构不存在的 ID。创建复杂任务时优先使用已有 workflowId。
${JSON.stringify(context)}

执行原则：
- 先理解用户目标，再选择最少的画布操作。
- 不要声称已经执行尚未调用的工具。
- 涉及运行工作流时明确说明可能产生 API 费用。
- 如果信息不足，可以只回复并返回空 actions。`;
