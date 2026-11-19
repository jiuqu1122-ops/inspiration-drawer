import { validateSvgToolArguments, svgCreationFailure } from './chatSvgTool';
import { collectChatHtmlArtifacts } from '../html/chatHtmlArtifacts';
import { applyPrototypeMotions } from '../prototypes/prototypeMotion';
import { executeGithubSkillTool, isGithubSkillTool } from '../skills/githubSkillTools';
import { createPrototypePackage } from '../prototypes/prototypePackage';
import { parsePrototype } from '../prototypes/prototypeSchema';
import { canUseCanvasItemAsFrameInterpolationVideoInput, canUseCanvasItemAsImageEnhancementInput, canUseCanvasItemAsVideoEnhancementInput } from '../../../utils/canvasItemSelectors';
import type { CanvasImageItem } from '../../canvasModel';
import { getGeneratedMediaFromToolCall, type ChatGeneratedMedia, type ChatToolExecutor, type ChatToolExecutionContext } from '../model/chatTypes';
import { executeBatchImageOperation } from './batchImageOperation';
import { executeImageVariantOperation } from './imageVariantOperation';
import { normalizeChatToolName } from './chatToolNames';
import { preparePresentationFileRequest } from '../presentations/preparePresentationRequest';
import { createChatSkill, importChatSkillMarkdown, loadChatSkills, saveChatSkill, selectChatSkill } from '../skills/chatSkills';

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
  createPrototype?: typeof createPrototypePackage;
  createFile: (request: Record<string, unknown>) => Promise<unknown>;
  getCanvasItems?: () => CanvasImageItem[];
  getSelectedCanvasIds?: () => string[];
}): ChatToolExecutor => async (rawName, args, context) => {
  const name = normalizeChatToolName(rawName);
  if (isGithubSkillTool(name)) return executeGithubSkillTool(name, args, context, input.searchWeb);
  const execution = { userRequest: context.userText };
  if (name === 'web_search') {
    return input.searchWeb(
      String(args.query || '').trim(),
      Math.min(8, Math.max(1, Number(args.limit) || 6)),
    );
  }
  if (name === 'get_ui_prototype' || name === 'animate_ui_prototype') {
    const allowed=name==='get_ui_prototype'?['artifactId','offset','limit']:['artifactId','motions','replace'];
    if(Object.keys(args).some(key=>!allowed.includes(key))||typeof args.artifactId!=='string')throw new Error('原型工具参数无效');
    const artifact=collectChatHtmlArtifacts(context.recentMessages,context.conversationId).find(a=>a.id===args.artifactId&&a.prototype);
    if(!artifact?.prototype)throw new Error('指定可编辑原型不属于当前对话或尚未完成；不能读取其他对话或普通 HTML');
    if(name==='get_ui_prototype'){
      const offset=Number(args.offset||0),limit=Number(args.limit??60);
      if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>80)throw new Error('原型节点分页参数无效');
      return {artifactId:artifact.id,name:artifact.prototype.name,screens:artifact.prototype.screens,interactions:artifact.prototype.interactions,motions:artifact.prototype.motions||[],nodes:artifact.prototype.nodes.slice(offset,offset+limit).map(({imageData,...n})=>({...n,hasImage:Boolean(imageData)})),totalNodes:artifact.prototype.nodes.length,nextOffset:offset+limit<artifact.prototype.nodes.length?offset+limit:null};
    }
    if(args.replace!==undefined&&typeof args.replace!=='boolean')throw new Error('replace 需要布尔值');
    const prototype=applyPrototypeMotions(artifact.prototype,args.motions,args.replace===true);
    const result=await (input.createPrototype||createPrototypePackage)(prototype,context.conversationId);
    return {...result,prototypeDocument:prototype,sourceArtifactId:artifact.id,staticDesignPreserved:true};
  }
  if (name === 'create_ui_prototype') {
    return (input.createPrototype || createPrototypePackage)(parsePrototype(args.prototype), context.conversationId);
  }
  if(name==='create_svg'){
    validateSvgToolArguments(args);
    try {
      const result = await input.createFile({ ...args, format: 'svg', conversationId: context.conversationId });
      if (!result || typeof result !== 'object' || !('files' in result) || !Array.isArray(result.files) || result.files.length === 0) {
        throw new Error('原生文件工具没有返回可下载文件，不能视为已保存');
      }
      return { ...result, svgSource: args.content };
    } catch (error) {
      throw svgCreationFailure(error);
    }
  }
  if (name === 'create_file') {
    const result=await input.createFile({...preparePresentationFileRequest(args,context),conversationId:context.conversationId});
    return args.format==='svg'&&result&&typeof result==='object'?{...result,svgSource:args.content}:result;
  }
  if (name === 'create_agent') {
    const agentName = String(args.name || '').trim();
    const existing = loadChatSkills().find(skill => skill.name.toLocaleLowerCase() === agentName.toLocaleLowerCase());
    const skill = existing || (() => {
      const adapted = importChatSkillMarkdown(String(args.instructions || ''), 'chat-created.md');
      return {
        ...createChatSkill(
          agentName,
          String(args.description || ''),
          adapted.instructions,
          Array.isArray(args.triggers) ? args.triggers.map(String) : [],
        ),
        conversionNotes: adapted.conversionNotes,
      };
    })();
    if (!existing) saveChatSkill(skill);
    const activate = args.activate === true && /(?:启用|使用|切换|开始用|马上用|立即用|activate|use\s+(?:it|this))/i.test(context.userText);
    if (activate) selectChatSkill(context.conversationId, skill.id);
    return {
      created: !existing,
      id: skill.id,
      name: skill.name,
      description: skill.description,
      triggers: skill.triggers,
      activated: activate,
      message: existing ? '同名智能体已存在，未重复创建。' : '智能体已保存到列表。',
    };
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
  if (name === 'create_workflow') {
    const label = String(args.label || '').trim();
    const steps = Array.isArray(args.steps) ? args.steps : [];
    if (!label || steps.length === 0) throw new Error('创建工作流需要名称和步骤');
    return input.executeExistingTool('canvas_create_workflow', {
      label,
      hint: typeof args.hint === 'string' ? args.hint : undefined,
      steps,
      inputIds: Array.isArray(args.inputIds) ? args.inputIds : [],
      autoRun: false,
    }, execution);
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
