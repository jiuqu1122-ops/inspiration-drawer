import type { ChatThinkingStepStatus } from '../model/chatTypes';

const CHAT_TOOL_LABELS: Record<string, string> = {
  web_search: '联网搜索',
  create_file: '生成文件',
  get_canvas_selection: '读取画布选中项',
  search_assets: '搜索素材库',
  generate_image: '生成图片',
  generate_image_variants: '生成独立方案',
  edit_image: '编辑图片',
  batch_image_operation: '批量处理图片',
  generate_video: '生成视频',
  interpolate_video: '视频补帧',
  enhance_image: '增强图片',
  enhance_video: '增强视频',
  fuse_images: '溶图',
  add_to_canvas: '发送到画布',
  create_canvas_generator: '创建生成节点',
  list_workflows: '读取工作流',
  run_workflow: '运行工作流',
};

export const getChatToolLabel = (name: string) => CHAT_TOOL_LABELS[name] || '执行工具';

export const getChatToolStepTitle = (name: string, status: ChatThinkingStepStatus) => {
  const label = getChatToolLabel(name);
  if (status === 'awaiting-approval') return `${label}等待确认`;
  if (status === 'completed') return `${label}已完成`;
  if (status === 'cancelled') return `${label}已停止`;
  if (status === 'error') return `${label}失败`;
  return `正在${label}`;
};
