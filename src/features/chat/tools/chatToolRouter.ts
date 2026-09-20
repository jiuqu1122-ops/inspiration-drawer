import { evaluateLegacyActionPermission } from '../../appAgent/commands/permissionGate';
import type { LegacyAgentAction } from '../../appAgent/commands/commandTypes';
import type { ChatToolExecutionContext, ChatToolExecutor } from '../model/chatTypes';
import { compactChatToolResult } from './chatToolResult';
import { shouldComposeImageVariants, shouldUseIndependentImageVariants } from './chatToolDefinitions';
import { normalizeImageVariants } from './imageVariantNormalization';
import { normalizeChatToolName } from './chatToolNames';

const SUPPORTED_TOOLS = new Set([
  'web_search', 'create_file', 'get_canvas_selection', 'get_canvas_selected_shapes', 'search_assets', 'generate_image', 'generate_image_variants', 'edit_image', 'generate_video',
  'interpolate_video', 'enhance_image', 'enhance_video', 'fuse_images',
  'batch_image_operation', 'add_to_canvas', 'create_canvas_generator', 'list_workflows', 'run_workflow',
]);

const AUTO_EXECUTE_MEDIA_TOOLS = new Set([
  'generate_image',
  'generate_image_variants',
  'edit_image',
  'generate_video',
  'interpolate_video',
  'enhance_image',
  'enhance_video',
  'fuse_images',
  'batch_image_operation',
]);

const permissionActionForChatTool = (name: string, args: Record<string, unknown>): LegacyAgentAction => {
  if (name === 'web_search' || name === 'create_file' || name === 'get_canvas_selection' || name === 'get_canvas_selected_shapes' || name === 'search_assets' || name === 'list_workflows') {
    return { tool: name === 'search_assets' ? 'drawer_search_inspirations' : 'app_get_context', arguments: args };
  }
  if (name === 'run_workflow') return { tool: 'canvas_run_workflow', arguments: args };
  const mediaToolType = name === 'interpolate_video'
    ? 'frame-interpolation'
    : name === 'enhance_image'
      ? 'image-enhancement'
      : name === 'enhance_video'
        ? 'video-enhancement'
        : name === 'fuse_images'
          ? 'image-fusion'
          : '';
  if (mediaToolType) {
    return { tool: 'canvas_create_media_tool', arguments: { ...args, toolType: mediaToolType, autoRun: true } };
  }
  if (name === 'generate_image' || name === 'generate_image_variants' || name === 'edit_image' || name === 'generate_video' || name === 'batch_image_operation') {
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
  const name = normalizeChatToolName(input.name);
  if (!SUPPORTED_TOOLS.has(name)) throw new Error(`不支持的 Chat 工具：${input.name}`);
  if ((name === 'generate_image' || name === 'edit_image' || name === 'generate_video') && !String(input.args.prompt || '').trim()) {
    throw new Error('生成提示词不能为空');
  }
  if (name === 'generate_image' && Number(input.args.count) > 1
    && shouldUseIndependentImageVariants(input.context.userText)) {
    throw new Error('用户要求的是多个语义不同且独立出图的方案；请改用 generate_image_variants，为每个方案提供独立 prompt，并让每个任务只生成一张图。');
  }
  if (name === 'generate_image' && shouldComposeImageVariants(input.context.userText)) {
    input.args.count = 1;
  }
  if (name === 'generate_image_variants') {
    if (shouldComposeImageVariants(input.context.userText)) {
      throw new Error('用户明确要求把多个方案放在同一张图中；请改用 generate_image，使用一个包含同图布局的 prompt，并设置 count=1。');
    }
    const variants = normalizeImageVariants(input.args.variants);
    if (variants.length < 2) throw new Error('独立方案生图至少需要两个包含名称和提示词的 variants');
    input.args.variants = variants;
  }
  if (name === 'batch_image_operation') {
    if (!String(input.args.instruction || '').trim()) throw new Error('批量图片任务 instruction 不能为空');
    if (String(input.args.mode || 'one_per_image') !== 'one_per_image') {
      throw new Error('批量图片任务仅支持 one_per_image 模式');
    }
  }
  if (name === 'search_assets' && !String(input.args.query || '').trim()) throw new Error('素材搜索词不能为空');
  if (name === 'web_search' && !String(input.args.query || '').trim()) throw new Error('联网搜索词不能为空');
  if (name === 'create_file' && (!String(input.args.fileName || '').trim() || !String(input.args.format || '').trim())) {
    throw new Error('生成文件需要文件名和格式');
  }
  const permission = evaluateLegacyActionPermission(permissionActionForChatTool(name, input.args), {
    userText: input.context.userText,
    approvalMode: input.approvalMode,
  });
  const requiresConfirmation = AUTO_EXECUTE_MEDIA_TOOLS.has(name)
    ? false
    : permission.requiresConfirmation;
  if (requiresConfirmation && input.approved !== true) {
    return { requiresApproval: true, permission };
  }
  await input.onExecuting?.();
  const result = await input.executor(name, input.args, input.context);
  return { requiresApproval: false, result: compactChatToolResult(name, result), permission };
};
