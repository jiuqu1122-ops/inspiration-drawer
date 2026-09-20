import { canUseCanvasItemAsFrameInterpolationVideoInput, canUseCanvasItemAsImageEnhancementInput, canUseCanvasItemAsVideoEnhancementInput } from '../../../utils/canvasItemSelectors';
import type { CanvasImageItem } from '../../canvasModel';
import { getGeneratedMediaFromToolCall, type ChatGeneratedMedia, type ChatToolExecutor, type ChatToolExecutionContext } from '../model/chatTypes';
import { executeBatchImageOperation } from './batchImageOperation';
import { executeImageVariantOperation } from './imageVariantOperation';
import { normalizeChatToolName } from './chatToolNames';

type WorkflowDescriptor = { id: string; label: string; hint?: string };

type ChatCanvasMediaToolType = 'frame-interpolation' | 'image-enhancement' | 'video-enhancement' | 'image-fusion';

const uniqueIds = (values: string[]) => [...new Set(values.map(value => value.trim()).filter(Boolean))];

const findRecentGeneratedMedia = (context: ChatToolExecutionContext, mediaId: string) => {
  if (!mediaId) return undefined;
  for (const message of [...context.recentMessages].reverse()) {
    for (const call of [...message.toolCalls].reverse()) {
      const media = getGeneratedMediaFromToolCall(call).find(item => item.id === mediaId || item.assetId === mediaId);
      if (media) return media;
    }
  }
  return undefined;
};

export const resolveChatMediaCanvasInputIds = (input: {
  canvasItems: CanvasImageItem[];
  selectedIds: string[];
  toolType: ChatCanvasMediaToolType;
  requestedInputIds?: string[];
  mediaId?: string;
  media?: ChatGeneratedMedia;
}) => {
  const maxInputs = input.toolType === 'image-fusion' ? 2 : 1;
  const isValid = (item?: CanvasImageItem) => (
    input.toolType === 'frame-interpolation'
      ? canUseCanvasItemAsFrameInterpolationVideoInput(item)
      : input.toolType === 'video-enhancement'
        ? canUseCanvasItemAsVideoEnhancementInput(item)
        : canUseCanvasItemAsImageEnhancementInput(item)
  );
  const resolveRequestedId = (requestedId: string) => {
    const direct = input.canvasItems.find(item => item.id === requestedId && isValid(item));
    if (direct) return direct.id;
    const byProvenance = input.canvasItems.find(item => (
      item.chatGeneratedMedia?.mediaId === requestedId && isValid(item)
    ));
    if (byProvenance) return byProvenance.id;
    const mediaAssetId = input.media && (input.media.id === requestedId || input.media.assetId === requestedId)
      ? input.media.assetId
      : undefined;
    const assetId = mediaAssetId || requestedId;
    const bySourceAsset = input.canvasItems.find(item => item.item.sourceItemId === assetId && isValid(item));
    if (bySourceAsset) return bySourceAsset.id;
    return input.canvasItems.find(item => item.item.id === assetId && isValid(item))?.id;
  };
  const requested = uniqueIds(input.requestedInputIds || [])
    .map(resolveRequestedId)
    .filter((id): id is string => !!id);
  if (requested.length > 0) return uniqueIds(requested).slice(0, maxInputs);
  if (input.mediaId) {
    const byProvenance = input.canvasItems.find(item => (
      item.chatGeneratedMedia?.mediaId === input.mediaId && isValid(item)
    ));
    if (byProvenance) return [byProvenance.id];
    const assetId = input.media?.assetId || input.mediaId;
    const bySourceAsset = input.canvasItems.find(item => item.item.sourceItemId === assetId && isValid(item));
    if (bySourceAsset) return [bySourceAsset.id];
    const byItemAsset = input.canvasItems.find(item => item.item.id === assetId && isValid(item));
    if (byItemAsset) return [byItemAsset.id];
  }
  return uniqueIds(input.selectedIds)
    .filter(id => isValid(input.canvasItems.find(item => item.id === id)))
    .slice(0, maxInputs);
};

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
  getCanvasItems?: () => CanvasImageItem[];
  getSelectedCanvasIds?: () => string[];
}): ChatToolExecutor => async (rawName, args, context) => {
  const name = normalizeChatToolName(rawName);
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
  const mediaToolType = name === 'interpolate_video'
    ? 'frame-interpolation'
    : name === 'enhance_image'
      ? 'image-enhancement'
      : name === 'enhance_video'
        ? 'video-enhancement'
        : name === 'fuse_images'
          ? 'image-fusion'
          : null;
  if (mediaToolType) {
    const requestedInputIds = name === 'fuse_images'
      ? (Array.isArray(args.inputIds)
          ? args.inputIds.map(String)
          : [args.baseImageId, args.styleImageId].map(value => String(value || '')).filter(Boolean))
      : [args.inputId].map(value => String(value || '')).filter(Boolean);
    const mediaId = String(args.mediaId || '').trim();
    const inputIds = resolveChatMediaCanvasInputIds({
      canvasItems: input.getCanvasItems?.() || [],
      selectedIds: input.getSelectedCanvasIds?.() || [],
      toolType: mediaToolType,
      requestedInputIds,
      mediaId,
      media: findRecentGeneratedMedia(context, mediaId),
    });
    return input.executeExistingTool('canvas_create_media_tool', {
      toolType: mediaToolType,
      inputIds,
      autoRun: true,
    }, execution);
  }
  if (name === 'generate_image_variants') {
    return executeImageVariantOperation({
      args,
      signal: context.signal,
      onProgress: context.onProgress,
      generate: generationArgs => input.generateMedia('generate_image', generationArgs),
    });
  }
  if (name === 'batch_image_operation') {
    return executeBatchImageOperation({
      args,
      attachments: context.currentUserAttachments || [],
      signal: context.signal,
      onProgress: context.onProgress,
      generate: generationArgs => input.generateMedia('generate_image', generationArgs),
    });
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
