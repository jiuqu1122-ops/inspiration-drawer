import type { ChatToolExecutor } from '../model/chatTypes';

type WorkflowDescriptor = { id: string; label: string; hint?: string };

export const createInspirationChatToolExecutor = (input: {
  executeExistingTool: (
    name: string,
    args: Record<string, unknown>,
    execution: { userRequest: string },
  ) => Promise<unknown>;
  generateMedia: (
    name: 'generate_image' | 'edit_image' | 'generate_video',
    args: Record<string, unknown>,
  ) => Promise<unknown>;
  listWorkflowDescriptors: () => WorkflowDescriptor[];
  searchWeb: (query: string, limit: number) => Promise<unknown>;
  createFile: (request: Record<string, unknown>) => Promise<unknown>;
}): ChatToolExecutor => async (name, args, context) => {
  const execution = { userRequest: context.userText };
  if (name === 'web_search') {
    return input.searchWeb(
      String(args.query || '').trim(),
      Math.min(8, Math.max(1, Number(args.limit) || 6)),
    );
  }
  if (name === 'create_file') {
    return input.createFile({
      ...args,
      conversationId: context.conversationId,
    });
  }
  if (name === 'get_canvas_selection') {
    return input.executeExistingTool('app_get_context', { scopes: ['canvas'], detail: 'compact' }, execution);
  }
  if (name === 'search_assets') {
    return input.executeExistingTool('drawer_search_inspirations', {
      query: String(args.query || '').trim(),
      topK: Math.min(8, Math.max(1, Number(args.limit) || 6)),
      ...(args.filter && typeof args.filter === 'object' ? args.filter as Record<string, unknown> : {}),
    }, execution);
  }
  if (name === 'generate_image' || name === 'edit_image' || name === 'generate_video') {
    return input.generateMedia(name, args);
  }
  if (name === 'add_to_canvas') {
    const assetId = String(args.assetId || args.mediaId || '').trim();
    if (!assetId) throw new Error('没有找到可发送到画布的媒体');
    return input.executeExistingTool('drawer_manage', {
      action: 'add_items_to_canvas',
      targetIds: [assetId],
    }, execution);
  }
  if (name === 'create_canvas_generator') {
    return input.executeExistingTool('canvas_create_generator', { ...args, autoRun: false }, execution);
  }
  if (name === 'list_workflows') {
    const query = String(args.query || '').trim().toLowerCase();
    const limit = Math.min(20, Math.max(1, Number(args.limit) || 12));
    return {
      workflows: input.listWorkflowDescriptors()
        .filter(workflow => !query || `${workflow.label} ${workflow.hint || ''}`.toLowerCase().includes(query))
        .slice(0, limit)
        .map(workflow => ({ id: workflow.id, name: workflow.label, description: workflow.hint })),
    };
  }
  if (name === 'run_workflow') {
    const applied = await input.executeExistingTool('canvas_apply_workflow', {
      workflowId: args.workflowId,
      inputIds: Array.isArray(args.inputIds) ? args.inputIds : [],
      projectBrief: args.projectBrief,
    }, execution) as Record<string, unknown>;
    const nodeId = String(applied.nodeId || '').trim();
    if (!nodeId) throw new Error('工作流没有创建可运行节点');
    const result = await input.executeExistingTool('canvas_run_workflow', { nodeIds: [nodeId] }, execution);
    return { ...applied, result };
  }
  throw new Error(`不支持的 Chat 工具：${name}`);
};
