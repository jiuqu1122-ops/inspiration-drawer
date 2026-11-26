import type { ChatThinkingStepStatus } from '../model/chatTypes';

const CHAT_TOOL_LABELS: Record<string, string> = {
  rhino_get_context: '读取 Rhino 上下文',
  rhino_reference_fidelity_assessment: '验收模型并规划完善',
  rhino_review_viewport: '对照 Rhino 视口与参考图',
  rhino_native_get_viewport_image: '查看 Rhino 视口',
  rhino_list_objects: '查询 Rhino 对象',
  rhino_list_layers: '查询 Rhino 图层',
  rhino_read_modeling_skill_resource: '读取内置建模 Skill 资料',
  web_search: '联网搜索',
  search_github_skills: '发现开源技能',
  inspect_github_skill: '检查 GitHub 技能',
  install_github_skill: '确认并安装技能',
  list_installed_skills: '读取已安装技能',
  search_skill_resources: '检索技能包资料',
  read_skill_resource: '按需读取技能资源',
  activate_skill: '本会话启用技能',
  get_ui_prototype: '读取已有设计',
  animate_ui_prototype: '保留设计并添加动效',
  create_ui_prototype: '创建原型 / Figma 设计文件',
  create_svg: '制作 SVG 矢量图',
  create_file: '生成文件',
  create_layered_psd: '拆分图层并生成 PSD',
  create_agent: '创建智能体',
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
  create_workflow: '创建工作流',
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
