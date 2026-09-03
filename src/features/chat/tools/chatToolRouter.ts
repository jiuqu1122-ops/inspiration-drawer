import { evaluateLegacyActionPermission } from '../../appAgent/commands/permissionGate';
import type { LegacyAgentAction } from '../../appAgent/commands/commandTypes';
import type { ChatToolExecutionContext, ChatToolExecutor } from '../model/chatTypes';
import { compactChatToolResult } from './chatToolResult';

const SUPPORTED_TOOLS = new Set([
  'web_search', 'create_file', 'get_canvas_selection', 'search_assets', 'generate_image', 'edit_image', 'generate_video',
  'batch_image_operation', 'add_to_canvas', 'create_canvas_generator', 'list_workflows', 'run_workflow',
]);

const AUTO_EXECUTE_MEDIA_TOOLS = new Set([
  'generate_image',
  'edit_image',
  'generate_video',
  'batch_image_operation',
]);

const permissionActionForChatTool = (name: string, args: Record<string, unknown>): LegacyAgentAction => {
  if (name === 'web_search' || name === 'create_file' || name === 'get_canvas_selection' || name === 'search_assets' || name === 'list_workflows') {
    return { tool: name === 'search_assets' ? 'drawer_search_inspirations' : 'app_get_context', arguments: args };
  }
  if (name === 'run_workflow') return { tool: 'canvas_run_workflow', arguments: args };
  if (name === 'generate_image' || name === 'edit_image' || name === 'generate_video' || name === 'batch_image_operation') {
    return { tool: 'canvas_create_generator', arguments: { ...args, autoRun: true } };
  }
  if (name === 'add_to_canvas') return { tool: 'drawer_manage', arguments: { ...args, action: 'add_items_to_canvas' } };
  return { tool: 'canvas_create_generator', arguments: { ...args, autoRun: false } };
};

export const routeChatToolCall = async (input: {
  name: string;
  args: Record<string, unknown>;
  context: ChatToolExecutionContext;
  executor: ChatToolExecutor;
  approvalMode?: 'ask' | 'auto';
  approved?: boolean;
  onExecuting?: () => void | Promise<void>;
}) => {
  if (!SUPPORTED_TOOLS.has(input.name)) throw new Error(`不支持的 Chat 工具：${input.name}`);
  if ((input.name === 'generate_image' || input.name === 'edit_image' || input.name === 'generate_video') && !String(input.args.prompt || '').trim()) {
    throw new Error('生成提示词不能为空');
  }
  if (input.name === 'batch_image_operation') {
    if (!String(input.args.instruction || '').trim()) throw new Error('批量图片任务 instruction 不能为空');
    if (String(input.args.mode || 'one_per_image') !== 'one_per_image') {
      throw new Error('批量图片任务仅支持 one_per_image 模式');
    }
  }
  if (input.name === 'search_assets' && !String(input.args.query || '').trim()) throw new Error('素材搜索词不能为空');
  if (input.name === 'web_search' && !String(input.args.query || '').trim()) throw new Error('联网搜索词不能为空');
  if (input.name === 'create_file' && (!String(input.args.fileName || '').trim() || !String(input.args.format || '').trim())) {
    throw new Error('生成文件需要文件名和格式');
  }
  const permission = evaluateLegacyActionPermission(permissionActionForChatTool(input.name, input.args), {
    userText: input.context.userText,
    approvalMode: input.approvalMode,
  });
  const requiresConfirmation = AUTO_EXECUTE_MEDIA_TOOLS.has(input.name)
    ? false
    : permission.requiresConfirmation;
  if (requiresConfirmation && input.approved !== true) {
    return { requiresApproval: true, permission };
  }
  await input.onExecuting?.();
  const result = await input.executor(input.name, input.args, input.context);
  return { requiresApproval: false, result: compactChatToolResult(input.name, result), permission };
};
