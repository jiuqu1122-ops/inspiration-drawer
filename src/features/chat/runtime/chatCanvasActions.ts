import { invoke } from '@tauri-apps/api/core';
import React from 'react';
import { CANVAS_TEXT_AGENT_SYSTEM_PROMPT_UTF8_BYTE_LIMIT,CANVAS_TEXT_AGENT_USER_PROMPT_UTF8_BYTE_LIMIT } from '../../../services/canvasTemplateStorage';
import { BufferItem } from '../../../types';
import type { CanvasImageSourceCacheEntry } from '../../../types/canvasMedia';
import { getCanvasInitialImageSource,getCanvasOriginalImageSource,isCanvasAgentTextTarget } from '../../../utils/canvasItemSelectors';
import { buildCanvasContextRoutingInstruction,type CanvasContextRoutingTarget } from '../../../utils/canvasTextContextRouting';
import { isBuiltInAgentSystemPrompt } from '../../agentModel';
import type { AgentApiBalanceResult,AgentApiConnectionResult,AgentCanvasToolExecutor,AgentCanvasVisualReference,AgentCodexApproval,AgentConversation,AgentSendOptions,AgentSettings,CodexInstallProgress,CodexLoginInfo,CodexModelOption,CodexRateLimits,CodexRuntimeStatus,WorkflowResultCardData } from '../../agentModel';
import { truncatePromptToUtf8ByteLimit } from '../../appAgent/imageQuality/imageRulePromptBuilder';
import { type CanvasImageItem,type CanvasItemBox } from '../../canvasModel';
import { buildDesignAgentSystemPrompt,normalizeDesignAgentConfig } from '../../designAgentNode';
import type { ChatGeneratedMedia } from '../model/chatTypes';
import { createChatBatchCanvasLayout,getChatBatchCanvasSlotSize } from './chatBatchCanvasLayout';
import type { ChatBatchCompletedPayload,ChatBatchMediaReadyPayload,ChatBatchStartedPayload } from './useChatRuntime';

type chatAgentActionContext = { canvasItemsRef: React.RefObject<CanvasImageItem[]>; isCanvasModeRef: React.RefObject<boolean>; enterCanvasMode: () => void; scheduleCanvasFocusItemById: (id?: string | null) => void; canvasAgent: { settings: AgentSettings; settingsLoading: boolean; saveSettings: (input: AgentSettings & { apiKey?: string; clearApiKey?: boolean; }) => Promise<AgentSettings>; refreshSettings: () => Promise<AgentSettings>; listOpenAiModels: () => Promise<string[]>; testAgentApiConnection: () => Promise<AgentApiConnectionResult>; queryAgentApiBalance: () => Promise<AgentApiBalanceResult>; codexStatus: CodexRuntimeStatus | null; codexRateLimits: CodexRateLimits | null; codexRateLimitsLoading: boolean; codexRateLimitsError: string; codexModels: CodexModelOption[]; codexModelsLoading: boolean; codexModelsError: string; codexInstallProgress: CodexInstallProgress | null; codexLoginInfo: CodexLoginInfo | null; installCodex: () => Promise<CodexRuntimeStatus>; refreshCodexStatus: () => Promise<CodexRuntimeStatus>; refreshCodexRateLimits: () => Promise<CodexRateLimits>; refreshCodexModels: () => Promise<CodexModelOption[]>; startCodexLogin: (mode: "chatgpt" | "chatgptDeviceCode") => Promise<CodexLoginInfo>; openCodexLoginUrl: (url: string) => Promise<void>; logoutCodex: () => Promise<void>; codexApprovals: AgentCodexApproval[]; resolveCodexApproval: (approval: AgentCodexApproval, approved: boolean) => Promise<void>; conversations: AgentConversation[]; activeConversation: AgentConversation; activeConversationId: string; busy: boolean; sendMessage: (content: string, sendOptions?: AgentSendOptions) => Promise<boolean>; optimizePrompt: (content: string, mediaType: "image" | "video") => Promise<string>; cancelCurrent: () => Promise<void>; retryLast: () => Promise<void>; resolveToolCall: (toolCallId: string, approved: boolean) => Promise<void>; executeExternalTool: AgentCanvasToolExecutor; appendWorkflowResult: (result: WorkflowResultCardData) => void; newConversation: () => string; selectConversation: (id: string) => void; deleteConversation: (id: string) => void; clearConversation: () => void; clearAllHistory: () => void; getToolLabel: (name: string) => string; }; showToast: (message: string) => void; getCanvasDropPosition: (index?: number, client?: { x: number; y: number; }) => { x: number; y: number; }; x: number; y: number; canvasRectsIntersect: (a: CanvasItemBox, b: CanvasItemBox) => boolean; createAssetId: () => `${string}-${string}-${string}-${string}-${string}`; appendCanvasItems: (nextItems: CanvasImageItem[], label: string, select?: boolean) => number; updateCanvasSelection: (ids: string[]) => void; fitCanvasViewToItems: (ids?: string[]) => boolean; itemsRef: React.RefObject<BufferItem[]>; canvasImageSourceCacheRef: React.RefObject<Map<string, CanvasImageSourceCacheEntry>>; canvasItemsPatchCommitRef: React.RefObject<boolean>; updateCanvasItemsImmediate: (updater: (prev: CanvasImageItem[]) => CanvasImageItem[]) => CanvasImageItem[]; markCanvasNodesChanged: (ids: string[]) => void; scheduleCanvasChangedNodesPatchSave: (ids: string[]) => void; scheduleCanvasStateSave: (options?: { syncNodes?: boolean; }) => void; agentCustomProvider: string; agentCustomBaseUrl: string; setAgentCustomSaving: React.Dispatch<React.SetStateAction<boolean>>; agentCustomApiKey: string; setAgentCustomApiKey: React.Dispatch<React.SetStateAction<string>>; refreshAgentModels: (force?: boolean) => Promise<string[]>; getCanvasTextInputsForNode: (canvasItem: CanvasImageItem, sourceItems?: CanvasImageItem[]) => string[]; getCanvasAgentVisualReferencesForNodeInputs: (canvasItem: CanvasImageItem, sourceItems?: CanvasImageItem[]) => AgentCanvasVisualReference[]; prepareCanvasAgentVisualReferences: (references: AgentCanvasVisualReference[], provider: "openai-compatible" | "codex", maxReferences?: number) => Promise<AgentCanvasVisualReference[]>; getCanvasContextRoutingTargetsForAgent: (agentItem: CanvasImageItem, sourceItems: CanvasImageItem[]) => CanvasContextRoutingTarget[]; agentModelRef: React.RefObject<string>; buildCanvasTextAgentUserContent: (text: string, references: AgentCanvasVisualReference[], seedanceMode?: boolean) => string | ({ type: string; image_url: { url: string | undefined; detail: string; }; text?: undefined; } | { type: string; text: string; })[]; content: string | undefined; canvasTextAreaRefs: React.RefObject<Record<string, HTMLTextAreaElement | null>>; commitCanvasTextDraft: (canvasId: string, content?: string, sync?: boolean) => void; canvasTextAgentRunningIds: string[]; setCanvasTextAgentRunning: (canvasId: string, running: boolean) => void; runCanvasTextAgentTarget: (target: CanvasImageItem, options: { sourceItems?: () => CanvasImageItem[]; updateTextOutput: (output: string) => void; getLatestTarget?: () => CanvasImageItem | undefined; showResultToast?: boolean; showReferenceToast?: boolean; }) => Promise<string>; pushCanvasUndoSnapshot: (label: string, options?: { layoutOnly?: boolean; shareImmutableItems?: boolean; }) => void; updateCanvasTextOutputItem: (canvasId: string, output: string) => void; canvasTextOutputDraftValuesRef: React.RefObject<Record<string, string>>; canvasTextOutputDraftTimersRef: React.RefObject<Record<string, number>>; canvasTextOutputAreaRefs: React.RefObject<Record<string, HTMLTextAreaElement | null>>; getCanvasAiErrorSummary: (error?: string | null) => string; };

type AgentOpenAiChatResult = {
  requestId?: string;
  content?: string;
  toolCalls?: Array<{ id?: string; name?: string; arguments?: string }>;
  finishReason?: string;
};

export const addChatMediaToCanvasImpl = async (ctx: Pick<chatAgentActionContext, 'canvasAgent' | 'canvasItemsRef' | 'enterCanvasMode' | 'isCanvasModeRef' | 'scheduleCanvasFocusItemById' | 'showToast'>, media: ChatGeneratedMedia, options: { autoFocus?: boolean } = {}) => {
  const { canvasAgent, canvasItemsRef, enterCanvasMode, isCanvasModeRef, scheduleCanvasFocusItemById, showToast } = ctx;
    const assetId = media.assetId || media.id;
    if (!assetId) return;
    try {
      const existing = canvasItemsRef.current.find(item => (
        item.item.sourceItemId === assetId || item.item.id === assetId
      ));
      if (existing) {
        if (!isCanvasModeRef.current) enterCanvasMode();
        if (options.autoFocus) scheduleCanvasFocusItemById(existing.id);
        return;
      }

      await canvasAgent.executeExternalTool('drawer_manage', {
        action: 'add_items_to_canvas',
        targetIds: [assetId],
      }, { userRequest: options.autoFocus ? 'Chat 生成图片自动加入画布' : '用户点击发送到画布' });

      if (options.autoFocus) {
        const added = canvasItemsRef.current.find(item => (
          item.item.sourceItemId === assetId || item.item.id === assetId
        ));
        if (added) scheduleCanvasFocusItemById(added.id);
      }
      if (!options.autoFocus) showToast('已发送到画布');
    } catch (error) {
      showToast(`${options.autoFocus ? '生成图片自动加入画布失败' : '发送到画布失败'}：${String(error)}`);
    }

};

export const createChatBatchCanvasGroupImpl = async (ctx: Pick<chatAgentActionContext, 'appendCanvasItems' | 'canvasItemsRef' | 'canvasRectsIntersect' | 'createAssetId' | 'enterCanvasMode' | 'fitCanvasViewToItems' | 'getCanvasDropPosition' | 'isCanvasModeRef' | 'updateCanvasSelection'>, payload: ChatBatchStartedPayload) => {
  const { appendCanvasItems, canvasItemsRef, canvasRectsIntersect, createAssetId, enterCanvasMode, fitCanvasViewToItems, getCanvasDropPosition, isCanvasModeRef, updateCanvasSelection } = ctx;
    if (payload.total <= 0) return;
    if (!isCanvasModeRef.current) enterCanvasMode();
    const existingSlots = canvasItemsRef.current.filter(item => item.chatBatchSlot?.batchId === payload.batchId);
    if (existingSlots.length > 0) return;

    const slotSize = getChatBatchCanvasSlotSize(payload.aspectRatio);
    const slotWidth = slotSize.width;
    const slotHeight = slotSize.height;
    const gap = 28;
    const base = getCanvasDropPosition(0);
    let layout = createChatBatchCanvasLayout({
      total: payload.total,
      originX: base.x,
      originY: base.y,
      slotWidth,
      slotHeight,
      gap,
    });
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const column = attempt % 3;
      const row = Math.floor(attempt / 3);
      const candidate = createChatBatchCanvasLayout({
        total: payload.total,
        originX: base.x + column * (layout.width + 72),
        originY: base.y + row * (layout.height + 72),
        slotWidth,
        slotHeight,
        gap,
      });
      const overlaps = candidate.slots.some(slot => canvasItemsRef.current.some(item => (
        canvasRectsIntersect(slot, item)
      )));
      layout = candidate;
      if (!overlaps) break;
    }

    const now = Date.now();
    const group = {
      id: `canvas_group_${payload.batchId}`,
      name: payload.name.trim().slice(0, 48) || 'Chat 批量处理',
    };
    const slots: CanvasImageItem[] = layout.slots.map(slot => ({
      id: `canvas_chat_batch_${payload.batchId}_${slot.index}`,
      item: {
        id: createAssetId(),
        type: 'image',
        content: `等待生成第 ${slot.index + 1} 张图片`,
        name: `生成中 ${slot.index + 1}/${payload.total}`,
        createdAt: now + slot.index,
        isQuickAccess: false,
      },
      x: slot.x,
      y: slot.y,
      width: slot.width,
      height: slot.height,
      canvasGroup: group,
      chatBatchSlot: {
        batchId: payload.batchId,
        sourceIndex: Math.floor(slot.index / payload.outputCountPerImage),
        outputIndex: slot.index % payload.outputCountPerImage,
        status: 'pending',
      },
      ai: {
        type: 'generated-image',
        status: 'working',
        generatedAt: now,
        ...(payload.aspectRatio ? { aspectRatio: payload.aspectRatio } : {}),
      },
    }));
    if (appendCanvasItems(slots, '创建 Chat 批量处理编组', false) <= 0) return;
    updateCanvasSelection(slots.map(slot => slot.id));
    window.setTimeout(() => {
      fitCanvasViewToItems(slots.map(slot => slot.id));
    }, 80);

};

export const fillChatBatchCanvasSlotImpl = async (ctx: Pick<chatAgentActionContext, 'canvasImageSourceCacheRef' | 'canvasItemsPatchCommitRef' | 'canvasItemsRef' | 'createAssetId' | 'itemsRef' | 'markCanvasNodesChanged' | 'scheduleCanvasChangedNodesPatchSave' | 'scheduleCanvasStateSave' | 'updateCanvasItemsImmediate'>, payload: ChatBatchMediaReadyPayload) => {
  const { canvasImageSourceCacheRef, canvasItemsPatchCommitRef, canvasItemsRef, createAssetId, itemsRef, markCanvasNodesChanged, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, updateCanvasItemsImmediate } = ctx;
    const slot = canvasItemsRef.current.find(item => (
      item.chatBatchSlot?.batchId === payload.batchId
      && item.chatBatchSlot.sourceIndex === payload.sourceIndex
      && item.chatBatchSlot.outputIndex === payload.outputIndex
    ));
    const batchSlot = slot?.chatBatchSlot;
    if (!slot || !batchSlot || batchSlot.status === 'completed') return;
    const media = payload.media;
    const assetId = media.assetId || media.id;
    const drawerSource = itemsRef.current.find(item => item.id === assetId && item.type === 'image');
    const itemId = createAssetId();
    const item: BufferItem = drawerSource ? {
      ...drawerSource,
      id: itemId,
      sourceItemId: drawerSource.id,
      name: drawerSource.name || media.name || `批量结果 ${payload.slotIndex + 1}`,
      content: drawerSource.content || media.prompt || `批量结果 ${payload.slotIndex + 1}`,
      createdAt: Date.now(),
      isQuickAccess: false,
    } : {
      id: itemId,
      type: 'image',
      content: media.prompt || media.name || `批量结果 ${payload.slotIndex + 1}`,
      name: media.name || `批量结果 ${payload.slotIndex + 1}`,
      path: media.path,
      url: media.path ? undefined : media.url,
      sourceUrl: media.url,
      thumbnail: media.thumbnail,
      sourceItemId: assetId || undefined,
      createdAt: Date.now(),
      isQuickAccess: false,
    };
    const nextSlot: CanvasImageItem = {
      ...slot,
      item,
      chatBatchSlot: { ...batchSlot, status: 'completed' },
      ai: {
        type: 'generated-image',
        status: 'success',
        generatedAt: Date.now(),
        outputs: [{
          id: media.id,
          mediaType: 'image',
          path: media.path,
          url: media.url,
          thumbnail: media.thumbnail,
          name: media.name,
          prompt: media.prompt,
          status: 'success',
          generatedAt: Date.now(),
        }],
      },
    };
    canvasImageSourceCacheRef.current.delete(slot.id);
    const imageSource = getCanvasOriginalImageSource(item) || getCanvasInitialImageSource(item);
    if (imageSource) {
      canvasImageSourceCacheRef.current.set(slot.id, {
        src: imageSource,
        quality: 'original',
      });
    }
    canvasItemsPatchCommitRef.current = true;
    updateCanvasItemsImmediate(items => items.map(candidate => candidate.id === slot.id ? nextSlot : candidate));
    markCanvasNodesChanged([slot.id]);
    scheduleCanvasChangedNodesPatchSave([slot.id]);
    scheduleCanvasStateSave({ syncNodes: false });

};

export const completeChatBatchCanvasGroupImpl = async (ctx: Pick<chatAgentActionContext, 'canvasItemsPatchCommitRef' | 'canvasItemsRef' | 'markCanvasNodesChanged' | 'scheduleCanvasChangedNodesPatchSave' | 'scheduleCanvasStateSave' | 'showToast' | 'updateCanvasItemsImmediate'>, payload: ChatBatchCompletedPayload) => {
  const { canvasItemsPatchCommitRef, canvasItemsRef, markCanvasNodesChanged, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, showToast, updateCanvasItemsImmediate } = ctx;
    const failedSourceIndexes = new Set(payload.failedSourceIndexes);
    const pendingSlots = canvasItemsRef.current.filter(item => (
      item.chatBatchSlot?.batchId === payload.batchId
      && item.chatBatchSlot.status === 'pending'
    ));
    if (pendingSlots.length > 0) {
      const changedIds = pendingSlots.map(item => item.id);
      canvasItemsPatchCommitRef.current = true;
      updateCanvasItemsImmediate(items => items.map(item => {
        if (item.chatBatchSlot?.batchId !== payload.batchId || item.chatBatchSlot.status !== 'pending') return item;
        const cancelled = payload.cancelled;
        const knownFailure = failedSourceIndexes.has(item.chatBatchSlot.sourceIndex);
        const error = cancelled ? '批量任务已停止' : knownFailure ? '这张图片生成失败' : '没有返回可用图片';
        return {
          ...item,
          item: { ...item.item, content: error, name: error },
          chatBatchSlot: { ...item.chatBatchSlot, status: cancelled ? 'cancelled' : 'error' },
          ai: { ...item.ai, type: 'generated-image', status: 'error', error },
        };
      }));
      markCanvasNodesChanged(changedIds);
      scheduleCanvasChangedNodesPatchSave(changedIds);
      scheduleCanvasStateSave({ syncNodes: false });
    }
    if (payload.cancelled) showToast(`批量任务已停止，已保留 ${payload.completedSlots} 张结果`);
    else showToast(`批量处理完成，${payload.completedSlots} 张图片已自动编组`);

};

export const switchAgentFundingSourceImpl = async (ctx: Pick<chatAgentActionContext, 'agentCustomBaseUrl' | 'agentCustomProvider' | 'canvasAgent' | 'showToast'>, source: 'wallet' | 'codex' | 'custom') => {
  const { agentCustomBaseUrl, agentCustomProvider, canvasAgent, showToast } = ctx;
    try {
      await canvasAgent.saveSettings({
        ...canvasAgent.settings,
        provider: source === 'codex' ? 'codex' : 'openai-compatible',
        ...(source === 'custom' ? {
          apiGatewayKind: 'custom' as const,
          apiProvider: agentCustomProvider.trim() || 'openai-compatible',
          apiBaseUrl: agentCustomBaseUrl.trim() || 'https://api.openai.com/v1',
        } : {}),
        ...(source === 'wallet' ? {
          apiGatewayKind: 'custom' as const,
          apiProvider: 'unmind-wallet',
          apiBaseUrl: 'https://api.unmind.art/v1',
          apiModel: 'unmind-agent',
          apiHeaders: {},
          clearApiKey: true,
        } : {}),
      });
      showToast(source === 'codex' ? 'Agent 已切换到 GPT 登录' : source === 'custom' ? 'Agent 已切换到自定义 API' : 'Agent 已切换到授权钱包额度');
    } catch (err) {
      showToast(String(err));
    }

};

export const saveAgentCustomApiImpl = async (ctx: Pick<chatAgentActionContext, 'agentCustomApiKey' | 'agentCustomBaseUrl' | 'agentCustomProvider' | 'canvasAgent' | 'refreshAgentModels' | 'setAgentCustomApiKey' | 'setAgentCustomSaving' | 'showToast'>) => {
  const { agentCustomApiKey, agentCustomBaseUrl, agentCustomProvider, canvasAgent, refreshAgentModels, setAgentCustomApiKey, setAgentCustomSaving, showToast } = ctx;
    const provider = agentCustomProvider.trim() || 'openai-compatible';
    const baseUrl = agentCustomBaseUrl.trim();
    if (!baseUrl) {
      showToast('请填写 Agent API Base URL');
      return;
    }
    try {
      setAgentCustomSaving(true);
      await canvasAgent.saveSettings({
        ...canvasAgent.settings,
        provider: 'openai-compatible',
        apiGatewayKind: 'custom',
        apiProvider: provider,
        apiBaseUrl: baseUrl,
        apiKey: agentCustomApiKey.trim() || undefined,
      });
      setAgentCustomApiKey('');
      void refreshAgentModels(true);
      showToast('Agent 自定义 API 已保存');
    } catch (error) {
      showToast(String(error));
    } finally {
      setAgentCustomSaving(false);
    }

};

export const buildCanvasTextAgentUserContentImpl = (ctx: Record<never, never>, text: string, references: AgentCanvasVisualReference[], seedanceMode: boolean = false) => {
  const {  } = ctx;
    const imageReferences = references
      .filter(reference => reference.mediaType === 'image' && /^data:image\/|^https?:\/\//i.test(reference.source || ''))
      .slice(0, seedanceMode ? 9 : 6);
    let imageIndex = 0;
    let videoIndex = 0;
    const labeledReferences = imageReferences.map((reference, index) => {
      if (!seedanceMode) return { reference, label: '图' + String(index + 1) + '（Image ' + String(index + 1) + '）' };
      if (reference.sourceMediaType === 'video') {
        videoIndex += 1;
        return { reference, label: '@视频' + String(videoIndex) + '的预览帧' };
      }
      imageIndex += 1;
      return { reference, label: '@图片' + String(imageIndex) };
    });
    const notice = imageReferences.length > 0
      ? [
        seedanceMode
          ? '已连接以下 Seedance 视觉素材，并随本次请求附加：'
          : '已连接 ' + imageReferences.length + ' 张参考图，并随本次请求附加：',
        ...labeledReferences.map(({ reference, label }) => (
          label + '：' + reference.name + '（nodeId: ' + reference.nodeId + (reference.outputId ? ', outputId: ' + reference.outputId : '') + '）'
        )),
        seedanceMode
          ? '图片和视频编号分别按上述清单递增，不得交换或重排；视频附件这里只提供预览帧，不得臆测未展示的动作、运镜或声音。'
          : '图号严格对应附件顺序，不得交换或重排。',
      ].join('\n')
      : '';
    const textPart = [text, notice].filter(Boolean).join('\n\n');
    if (imageReferences.length === 0) return textPart;
    return [
      { type: 'text', text: textPart },
      ...labeledReferences.flatMap(({ reference, label }) => ([
        { type: 'text', text: '紧随此文字的图片附件对应' + label + '：' + reference.name },
        {
          type: 'image_url',
          image_url: {
            url: reference.source,
            detail: 'low',
          },
        },
      ])),
    ];

};

export const runCanvasTextAgentTargetImpl = async (ctx: Pick<chatAgentActionContext, 'agentModelRef' | 'buildCanvasTextAgentUserContent' | 'canvasAgent' | 'canvasItemsRef' | 'getCanvasAgentVisualReferencesForNodeInputs' | 'getCanvasContextRoutingTargetsForAgent' | 'getCanvasTextInputsForNode' | 'prepareCanvasAgentVisualReferences' | 'showToast'>, target: CanvasImageItem, options: {
      sourceItems?: () => CanvasImageItem[];
      updateTextOutput: (output: string) => void;
      getLatestTarget?: () => CanvasImageItem | undefined;
      showResultToast?: boolean;
      showReferenceToast?: boolean;
    }) => {
  const { agentModelRef, buildCanvasTextAgentUserContent, canvasAgent, canvasItemsRef, getCanvasAgentVisualReferencesForNodeInputs, getCanvasContextRoutingTargetsForAgent, getCanvasTextInputsForNode, prepareCanvasAgentVisualReferences, showToast } = ctx;
    if (!isCanvasAgentTextTarget(target)) return '';
    const getSourceItems = options.sourceItems || (() => canvasItemsRef.current);
    const latestTarget = options.getLatestTarget?.() || target;
    const designAgentConfig = normalizeDesignAgentConfig(latestTarget.designAgentConfig);
    const isSeedanceVideoAnalysis = designAgentConfig.agentRole === 'seedance_video_analyzer';
    const userRequest = (latestTarget.item.content || target.item.content || '').trim();
    if (!userRequest) {
      throw new Error('先在文字节点里输入需求');
    }

    const upstreamTexts = getCanvasTextInputsForNode(latestTarget, getSourceItems())
      .map((content, index) => '上游文字 ' + (index + 1) + '：\n' + content);
    const visualReferences = getCanvasAgentVisualReferencesForNodeInputs(latestTarget, getSourceItems());
    let preparedReferences: AgentCanvasVisualReference[] = [];

    if (visualReferences.length > 0) {
      try {
        preparedReferences = await prepareCanvasAgentVisualReferences(
          visualReferences,
          'openai-compatible',
          isSeedanceVideoAnalysis ? 9 : 6,
        );
        if (preparedReferences.length === 0 && options.showReferenceToast !== false) {
            showToast('连接的参考图暂时无法读取，本次仅使用文字运行');
        }
      } catch (error) {
        console.warn('文字节点参考图准备失败:', error);
        if (options.showReferenceToast !== false) {
          showToast('参考图准备失败，本次仅使用文字运行');
        }
        preparedReferences = [];
      }
    }

    const customAgentPrompt = isBuiltInAgentSystemPrompt(canvasAgent.settings.systemPrompt)
      ? ''
      : canvasAgent.settings.systemPrompt.trim();
    const designAgentPrompt = buildDesignAgentSystemPrompt(designAgentConfig);
    const contextRoutingInstruction = buildCanvasContextRoutingInstruction(
      getCanvasContextRoutingTargetsForAgent(latestTarget, getSourceItems()),
    );
    const systemPrompt = truncatePromptToUtf8ByteLimit([
      customAgentPrompt,
      [
        '你是画布中的 Design Agent Node 执行器。',
        '用户会在当前文字节点里写需求，也可能连接上游文字和参考图。',
        contextRoutingInstruction
          ? '请直接产出要写回当前文字节点的结果，不要调用工具，不要寒暄；严格遵守用户消息末尾的上下文自动路由协议，只输出协议要求的 JSON。'
          : '请直接产出要写回当前文字节点的结果，不要调用工具，不要输出 JSON 包装，不要寒暄。',
        '如果参考图存在，请把它们作为视觉依据；如果没有参考图，就只根据文字需求完成。',
      ].join('\n'),
      designAgentPrompt,
    ].filter(Boolean).join('\n\n'), CANVAS_TEXT_AGENT_SYSTEM_PROMPT_UTF8_BYTE_LIMIT);
    const promptParts = [
      '当前文字节点需求：\n' + userRequest,
      upstreamTexts.length > 0 ? upstreamTexts.join('\n\n') : '',
      contextRoutingInstruction,
    ].filter(Boolean);
    const requestId = 'canvas_text_agent_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    const selectedAgentModel = agentModelRef.current.trim();
    const requestedAgentModel = /^(?:unmind-agent|auto|default|recommended)$/i.test(selectedAgentModel)
      ? undefined
      : selectedAgentModel || undefined;
    const userPrompt = truncatePromptToUtf8ByteLimit(
      promptParts.join('\n\n'),
      CANVAS_TEXT_AGENT_USER_PROMPT_UTF8_BYTE_LIMIT,
    );
    const result = await invoke<AgentOpenAiChatResult>('agent_openai_chat', {
      request: {
        requestId,
        model: requestedAgentModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: buildCanvasTextAgentUserContent(userPrompt, preparedReferences, isSeedanceVideoAnalysis) },
        ],
      },
    });
    const output = String(result.content || '').trim();
    if (!output) throw new Error('Agent API 没有返回可写入的文字结果');
    options.updateTextOutput(output);
    if (options.showResultToast !== false) {
      showToast('文字节点已由 Agent 生成结果');
    }
    return output;

};

export const runCanvasTextAgentNodeImpl = async (ctx: Pick<chatAgentActionContext, 'canvasItemsRef' | 'canvasTextAgentRunningIds' | 'canvasTextAreaRefs' | 'canvasTextOutputAreaRefs' | 'canvasTextOutputDraftTimersRef' | 'canvasTextOutputDraftValuesRef' | 'commitCanvasTextDraft' | 'getCanvasAiErrorSummary' | 'pushCanvasUndoSnapshot' | 'runCanvasTextAgentTarget' | 'setCanvasTextAgentRunning' | 'showToast' | 'updateCanvasSelection' | 'updateCanvasTextOutputItem'>, targetId: string) => {
  const { canvasItemsRef, canvasTextAgentRunningIds, canvasTextAreaRefs, canvasTextOutputAreaRefs, canvasTextOutputDraftTimersRef, canvasTextOutputDraftValuesRef, commitCanvasTextDraft, getCanvasAiErrorSummary, pushCanvasUndoSnapshot, runCanvasTextAgentTarget, setCanvasTextAgentRunning, showToast, updateCanvasSelection, updateCanvasTextOutputItem } = ctx;
    const liveTextarea = canvasTextAreaRefs.current[targetId];
    if (liveTextarea) {
      commitCanvasTextDraft(targetId, liveTextarea.value, true);
    } else {
      commitCanvasTextDraft(targetId, undefined, true);
    }

    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!target || !isCanvasAgentTextTarget(target)) {
      showToast('请选择一个普通文字节点运行 Agent');
      return;
    }
    if (canvasTextAgentRunningIds.includes(targetId)) return;

    setCanvasTextAgentRunning(targetId, true);
    try {
      await runCanvasTextAgentTarget(target, {
        getLatestTarget: () => canvasItemsRef.current.find(item => item.id === targetId),
        updateTextOutput: (output) => {
          if (!canvasItemsRef.current.some(item => item.id === targetId)) return;
          pushCanvasUndoSnapshot('Agent 运行文字节点');
          updateCanvasTextOutputItem(targetId, output);
          delete canvasTextOutputDraftValuesRef.current[targetId];
          const timer = canvasTextOutputDraftTimersRef.current[targetId];
          if (timer !== undefined) {
            window.clearTimeout(timer);
            delete canvasTextOutputDraftTimersRef.current[targetId];
          }
          const outputTextarea = canvasTextOutputAreaRefs.current[targetId];
          if (outputTextarea) outputTextarea.value = output;
          updateCanvasSelection([targetId]);
        },
      });
    } catch (error) {
      const message = getCanvasAiErrorSummary(error instanceof Error ? error.message : String(error));
      console.warn('文字节点 Agent 运行失败:', error);
      showToast('文字节点运行失败：' + message.slice(0, 80));
    } finally {
      setCanvasTextAgentRunning(targetId, false);
    }

};
