import { invoke } from '@tauri-apps/api/core';
import { open,save } from '@tauri-apps/plugin-dialog';
import React from 'react';
import { flushSync } from 'react-dom';
import { DEFAULT_CANVAS_ID } from '../../../services/canvasApi';
import { normalizeCanvasWorkflowTemplate } from '../../../services/canvasTemplateStorage';
import { BufferItem } from '../../../types';
import type { CanvasAiPromptPreset,CanvasWorkflowExpandedGroup } from '../../../types/canvasWorkflow';
import type { ConfirmDialogState } from '../../../types/dialogs';
import { CANVAS_AI_DEFAULT_ASPECT_RATIO } from '../../../utils/canvasAiAspectRatio';
import { assignCanvasImageFusionInputs,isCanvasImageFusionAi,type CanvasImageFusionRole } from '../../../utils/canvasImageFusion';
import { canUseCanvasItemAsAiInput,canUseCanvasItemAsAiTarget,canUseCanvasItemAsFrameInterpolationVideoInput,canUseCanvasItemAsImageEnhancementInput,canUseCanvasItemAsInputForTarget,canUseCanvasItemAsVideoEnhancementInput,canUseCanvasItemAsWorkflowMaterial,createCanvasAiOutputBufferItem,getCanvasAiOutputDisplaySource,getCanvasAiSuccessfulOutputs,getCanvasInputTargetLabel,getCanvasWorkflowTemplateFromNode } from '../../../utils/canvasItemSelectors';
import { cloneDrawerValue,prepareCanvasWorkflowTemplateItem } from '../../../utils/canvasSerialization';
import { CANVAS_BUILT_IN_WORKFLOWS,validateCanvasWorkflowTemplate } from '../../../utils/canvasWorkflowDefinitions';
import { applyCanvasWorkflowRuntimeSnapshots,createCanvasWorkflowModuleOutputsFromExpandedGroup,createCanvasWorkflowRuntimeValue,getCanvasAiOutputPreviewSlots,getCanvasWorkflowGroup,getCanvasWorkflowTerminalNodeTemplates,hasCanvasWorkflowTemplateChanged,normalizeCanvasWorkflowRuntimeSnapshots } from '../../../utils/canvasWorkflowRuntime';
import { isCanvasImageFileName,isCanvasWorkflowReadableTextFileName } from '../../../utils/localMediaPaths';
import type { AgentApiBalanceResult,AgentApiConnectionResult,AgentCanvasToolExecutor,AgentCodexApproval,AgentConversation,AgentSendOptions,AgentSettings,CodexInstallProgress,CodexLoginInfo,CodexModelOption,CodexRateLimits,CodexRuntimeStatus,WorkflowResultCardData } from '../../agentModel';
import { normalizeImageRuleState,type ImageRuleKey } from '../../appAgent/imageQuality/imageRuleCapsules';
import { isSeedanceLikeVideoModel } from '../../canvasAiImage';
import { getCanvasAiNodeAutoSize } from '../../canvasAiNodeLayout';
import { recoverCanvasAiNodeWithUsableResults } from '../../canvasAiOutputs';
import { getCanvasAiMediaType,getCanvasAiNodeTitle,isCanvasAiGeneratorType } from '../../canvasAiRuntime';
import { isCanvasAiEnhancementType,isCanvasAiLocalMediaToolType } from '../../canvasLocalMediaTools';
import { type CanvasAiGeneratedOutput,type CanvasImageItem,type CanvasItemBox,type CanvasResizeCorner,type CanvasWorkflowSlotAsset } from '../../canvasModel';
import { replaceCanvasInputAt } from '../../canvasReferenceInputs';
import { getCanvasDesignScale,rotateCanvasBoxQuarterTurn } from '../../canvasResizeGeometry';
import { type CanvasWorkflowImageNodeModeDraft,type CanvasWorkflowInternalSlot,type CanvasWorkflowNodeTemplate,type CanvasWorkflowSaveDraft,type CanvasWorkflowTemplate } from '../../canvasTemplates';
import { applyCanvasWorkflowInternalSlotBindings,applyCanvasWorkflowSlotAssetToItem,createCanvasWorkflowSlotAssetFromItem,getCanvasWorkflowInternalSlotBinding,getCanvasWorkflowInternalSlotNodes,isReplaceableInternalImageSlot,normalizeCanvasWorkflowInternalSlot,replaceCanvasWorkflowInternalSlot } from '../../canvasWorkflowInternalSlots';
import { exportCanvasWorkflowInstance as buildPortableCanvasWorkflowInstance } from '../../canvasWorkflowPortableImages';
import { normalizeCanvasWorkflowUserInput } from '../../canvasWorkflowUserInput';
import { normalizeDesignAgentConfig } from '../../designAgentNode';
import { getImageFileFromDataTransfer } from '../../dragData';
import { CANVAS_SEARCH_CANDIDATE_LIMIT } from '../../drawer/useDrawerSearch';

type canvasWorkflowEditorActionContext = { showToast: (message: string) => void; getSelectedCanvasAiInputIds: () => string[]; getCanvasItemsBounds: (ids: string[]) => CanvasItemBox | null; getCanvasPointFromClient: (clientX: number, clientY: number) => { x: number; y: number; }; getCanvasDropPosition: (index?: number, client?: { x: number; y: number; }) => { x: number; y: number; }; buildCanvasWorkflowModuleNode: (workflow: CanvasWorkflowTemplate, pos: { x: number; y: number; }, inputIds?: string[]) => CanvasImageItem | null; appendCanvasItems: (nextItems: CanvasImageItem[], label: string, select?: boolean) => number; canvasSelectedIdsRef: React.RefObject<string[]>; canvasItemsRef: React.RefObject<CanvasImageItem[]>; getCanvasBoundsFromItems: (sourceItems: CanvasImageItem[]) => CanvasItemBox | null; canvasWorkflowSaveDraft: CanvasWorkflowSaveDraft | null; setCustomCanvasWorkflows: React.Dispatch<React.SetStateAction<CanvasWorkflowTemplate[]>>; pushCanvasUndoSnapshot: (label: string, options?: { layoutOnly?: boolean; shareImmutableItems?: boolean; }) => void; updateCanvasItemsImmediate: (updater: (prev: CanvasImageItem[]) => CanvasImageItem[]) => CanvasImageItem[]; updateCanvasSelection: (ids: string[]) => void; closeCanvasWorkflowSaveDialog: () => void; canvasWorkflowTemplates: CanvasWorkflowTemplate[]; setIsCanvasPresetEditorOpen: React.Dispatch<React.SetStateAction<boolean>>; setSelectedCanvasWorkflowDeleteIds: React.Dispatch<React.SetStateAction<string[]>>; selectCanvasWorkflowForEdit: (workflowId: string) => void; setIsCanvasWorkflowManagerOpen: React.Dispatch<React.SetStateAction<boolean>>; canvasWorkflowEditingId: string; canvasWorkflowNameDraft: string; canvasWorkflowHintDraft: string; customCanvasWorkflows: CanvasWorkflowTemplate[]; setCanvasWorkflowEditingId: React.Dispatch<React.SetStateAction<string>>; setCanvasWorkflowNameDraft: React.Dispatch<React.SetStateAction<string>>; setCanvasWorkflowHintDraft: React.Dispatch<React.SetStateAction<string>>; updateCanvasWorkflowModuleNodesForTemplate: (workflow: CanvasWorkflowTemplate, resetOutputs?: boolean) => void; buildCanvasWorkflowSaveDraftFromSelection: (defaultName: string) => CanvasWorkflowSaveDraft | null; setHiddenBuiltInCanvasWorkflowIds: React.Dispatch<React.SetStateAction<string[]>>; commitCanvasAiPromptDraft: (canvasId: string, content?: string, sync?: boolean) => void; items: any; instantiateCanvasWorkflowTemplateItems: (workflow: CanvasWorkflowTemplate, base: { x: number; y: number; }, externalInputIds?: string[]) => { workflow: null; items: CanvasImageItem[]; idMap: Map<string, string>; } | { workflow: CanvasWorkflowTemplate; items: CanvasImageItem[]; idMap: Map<string, string>; }; hydrateCanvasWorkflowSlotAssetsFromDrawer: (runtimeItems: CanvasImageItem[]) => CanvasImageItem[]; imageSourceToDataUrl: (source: string, optimizeForAi?: boolean) => Promise<string>; selectedCanvasWorkflowDeleteIds: string[]; setConfirmDialog: React.Dispatch<React.SetStateAction<ConfirmDialogState>>; deleteCanvasWorkflowIds: (workflowIds: string[]) => void; closeConfirmDialog: () => void; getCanvasWorkflowExpandedGroupItems: (groupId: string, sourceItems?: CanvasImageItem[]) => CanvasImageItem[]; buildCanvasWorkflowTemplateFromExpandedGroup: (groupItems: CanvasImageItem[], group: CanvasWorkflowExpandedGroup) => { workflow: CanvasWorkflowTemplate; bounds: CanvasItemBox; externalInputIds: string[]; idMap: Map<string, string>; } | null; workflow: CanvasWorkflowTemplate; bounds: CanvasItemBox; externalInputIds: string[]; idMap: Map<string, string>; canvasWorkflowSingleEditGroupIdsRef: React.RefObject<Set<string>>; setCanvasWorkflowSingleEditGroupIds: React.Dispatch<React.SetStateAction<string[]>>; collapseCanvasWorkflowGroupNow: (group: CanvasWorkflowExpandedGroup, saveTemplate: boolean, changed: boolean) => void; canvasResizeRef: React.RefObject<{ id: string; corner: CanvasResizeCorner; startClientX: number; startClientY: number; startX: number; startY: number; startWidth: number; startHeight: number; aspect: number; latestBox: CanvasItemBox | null; hasResized: boolean; } | null>; id: string | undefined; canvasGroupResizeRef: React.RefObject<{ corner: CanvasResizeCorner; startClientX: number; startClientY: number; startBounds: CanvasItemBox; startItems: Record<string, CanvasItemBox>; aspect: number; latestBoxes: Record<string, CanvasItemBox> | null; hasResized: boolean; } | null>; startItems: Record<string, CanvasItemBox> | undefined; canvasAiPromptEditingId: string | null; getCanvasAiNodeDesignSizeForItem: (canvasItem: CanvasImageItem, promptExpanded?: boolean, outputsExpanded?: boolean) => { width: number; height: number; }; updateCanvasNodeForCanvas: (targetCanvasId: string, nodeId: string, updater: (item: CanvasImageItem) => CanvasImageItem) => CanvasImageItem | undefined; applyCanvasAiGeneratorDataPatch: (item: CanvasImageItem, patch: Partial<NonNullable<CanvasImageItem["ai"]>>, content?: string) => CanvasImageItem; activeCanvasIdRef: React.RefObject<string>; isSwitchingCanvasRef: React.RefObject<boolean>; canvasItemsPatchCommitRef: React.RefObject<boolean>; scheduleCanvasChangedNodesPatchSave: (ids: string[]) => void; getCanvasSessionItems: (canvasId: string) => CanvasImageItem[]; setCanvasSessionItems: (canvasId: string, nextItems: CanvasImageItem[]) => void; enqueueCanvasBackgroundNodePatch: (canvasId: string, node: CanvasImageItem) => Promise<void>; pushDrawerUndoSnapshot: (label: string, options?: { shareImmutableItems?: boolean; }) => void; canvasAiPromptDraftValuesRef: React.RefObject<Record<string, string>>; canvasAiPromptDraftTimersRef: React.RefObject<Record<string, number>>; updateCanvasAiGeneratorData: (nodeId: string, patch: Partial<NonNullable<CanvasImageItem["ai"]>>, content?: string) => CanvasImageItem | undefined; canvasPromptOptimizingId: string | null; canvasAiPromptTextAreaRefs: React.RefObject<Record<string, HTMLTextAreaElement | null>>; setCanvasPromptOptimizingId: React.Dispatch<React.SetStateAction<string | null>>; canvasAgent: { settings: AgentSettings; settingsLoading: boolean; saveSettings: (input: AgentSettings & { apiKey?: string; clearApiKey?: boolean; }) => Promise<AgentSettings>; refreshSettings: () => Promise<AgentSettings>; listOpenAiModels: () => Promise<string[]>; testAgentApiConnection: () => Promise<AgentApiConnectionResult>; queryAgentApiBalance: () => Promise<AgentApiBalanceResult>; codexStatus: CodexRuntimeStatus | null; codexRateLimits: CodexRateLimits | null; codexRateLimitsLoading: boolean; codexRateLimitsError: string; codexModels: CodexModelOption[]; codexModelsLoading: boolean; codexModelsError: string; codexInstallProgress: CodexInstallProgress | null; codexLoginInfo: CodexLoginInfo | null; installCodex: () => Promise<CodexRuntimeStatus>; refreshCodexStatus: () => Promise<CodexRuntimeStatus>; refreshCodexRateLimits: () => Promise<CodexRateLimits>; refreshCodexModels: () => Promise<CodexModelOption[]>; startCodexLogin: (mode: "chatgpt" | "chatgptDeviceCode") => Promise<CodexLoginInfo>; openCodexLoginUrl: (url: string) => Promise<void>; logoutCodex: () => Promise<void>; codexApprovals: AgentCodexApproval[]; resolveCodexApproval: (approval: AgentCodexApproval, approved: boolean) => Promise<void>; conversations: AgentConversation[]; activeConversation: AgentConversation; activeConversationId: string; busy: boolean; sendMessage: (content: string, sendOptions?: AgentSendOptions) => Promise<boolean>; optimizePrompt: (content: string, mediaType: "image" | "video") => Promise<string>; cancelCurrent: () => Promise<void>; retryLast: () => Promise<void>; resolveToolCall: (toolCallId: string, approved: boolean) => Promise<void>; executeExternalTool: AgentCanvasToolExecutor; appendWorkflowResult: (result: WorkflowResultCardData) => void; newConversation: () => string; selectConversation: (id: string) => void; deleteConversation: (id: string) => void; clearConversation: () => void; clearAllHistory: () => void; getToolLabel: (name: string) => string; }; canvasAiExpandedOutputNodeIds: Set<string>; setCanvasAiExpandedOutputNodeIds: React.Dispatch<React.SetStateAction<Set<string>>>; targetId: string; canReplaceCanvasImageReferenceForTarget: (target?: CanvasImageItem) => boolean; inputId: string; setCanvasReferenceReplacement: (next: CanvasReferenceReplaceTarget | null) => void; setCanvasInputMenuForId: React.Dispatch<React.SetStateAction<string | null>>; inputIndex: number; growCanvasToFit: (right: number, bottom: number) => void; canvasReferenceReplaceTargetRef: React.RefObject<CanvasReferenceReplaceTarget | null>; replaceCanvasGeneratorReference: (replacement: CanvasReferenceReplaceTarget, nextInputId: string, options?: { pushUndo?: boolean; }) => boolean; getCanvasImageFusionPreferredRole: (targetId: string) => CanvasImageFusionRole | null; applyCanvasImageFusionConnectionPatch: (item: CanvasImageItem, sourceIds: string[], preferredRole?: CanvasImageFusionRole | null) => CanvasImageItem; pendingCanvasFusionRoleRef: React.RefObject<{ targetId: string; role: CanvasImageFusionRole; } | null>; buildCanvasAiGeneratorNode: (pos: { x: number; y: number; }, preset?: CanvasAiPromptPreset, inputIds?: string[], mediaType?: "image" | "video") => CanvasImageItem; buildCanvasFrameInterpolationNode: (pos: { x: number; y: number; }, inputIds?: string[]) => CanvasImageItem; buildCanvasEnhancementNode: (pos: { x: number; y: number; }, mediaType: "image" | "video", inputIds?: string[]) => CanvasImageItem; createAssetId: () => `${string}-${string}-${string}-${string}-${string}`; makeCanvasNodeId: (seed: string, kind?: string) => string; findCanvasWorkflowSlot: (module: CanvasImageItem | null | undefined, slotId: string) => CanvasWorkflowInternalSlot | null; replaceExpandedCanvasWorkflowSlot: (expandedNodeId: string, assets: CanvasWorkflowSlotAsset[]) => boolean; updateCollapsedCanvasWorkflowSlot: (moduleId: string, slotId: string, operation: (module: CanvasImageItem, slot: CanvasWorkflowInternalSlot) => CanvasImageItem, undoLabel?: string) => boolean; getCanvasWorkflowSlotAssetFromCanvasItem: (canvasItem?: CanvasImageItem | null) => CanvasWorkflowSlotAsset | null; selectedIds: string[]; itemsRef: React.RefObject<BufferItem[]>; getSelectedCanvasWorkflowSlotAssets: (excludeId?: string) => CanvasWorkflowSlotAsset[]; setCanvasWorkflowSlotPickTarget: React.Dispatch<React.SetStateAction<{ moduleId: string; slotId: string; label: string; expandedNodeId?: string; } | null>>; setIsSearchActive: React.Dispatch<React.SetStateAction<boolean>>; setCanvasSearchCandidateLimit: React.Dispatch<React.SetStateAction<number>>; searchInputRef: React.RefObject<HTMLInputElement | null>; replaceCanvasWorkflowSlotAssets: (moduleId: string, slotId: string, assets: CanvasWorkflowSlotAsset[], expandedNodeId?: string) => boolean; canvasWorkflowSlotPickTarget: { moduleId: string; slotId: string; label: string; expandedNodeId?: string; } | null; expandedNodeId: string | undefined; moduleId: string; slotId: string; getDraggedDrawerItemId: (dt?: DataTransfer | null) => string; clearDrawerItemDragState: () => void; createCanvasImageItemFromFile: (file: File, index?: number, client?: { x: number; y: number; }) => Promise<CanvasImageItem | null>; chooseLocalVideosForCanvasGenerator: (targetId: string) => Promise<void>; pendingCanvasFusionUploadRoleRef: React.RefObject<{ targetId: string; role: CanvasImageFusionRole; } | null>; pendingCanvasReferenceUploadReplaceRef: React.RefObject<CanvasReferenceReplaceTarget | null>; pendingCanvasUploadTargetIdRef: React.RefObject<string | null>; canvasUploadInputRef: React.RefObject<HTMLInputElement | null>; pendingCanvasWorkflowSlotUploadRef: React.RefObject<{ moduleId: string; slotId: string; expandedNodeId?: string; } | null>; connectCanvasItemsToGenerator: (sourceIds: string[], targetId: string) => boolean; pendingCanvasWorkflowFileTargetIdRef: React.RefObject<string | null>; canvasWorkflowFileInputRef: React.RefObject<HTMLInputElement | null>; createCanvasVideoItemFromPath: (originalPath: string, index?: number, client?: { x: number; y: number; }) => Promise<CanvasImageItem | null>; };

type CanvasReferenceReplaceTarget = {
  targetId: string;
  inputId: string;
  inputIndex: number;
};

export const addCanvasWorkflowTemplateImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'appendCanvasItems' | 'buildCanvasWorkflowModuleNode' | 'getCanvasDropPosition' | 'getCanvasItemsBounds' | 'getCanvasPointFromClient' | 'getSelectedCanvasAiInputIds' | 'showToast'>, workflow: CanvasWorkflowTemplate, client?: { x: number; y: number }) => {
  const { appendCanvasItems, buildCanvasWorkflowModuleNode, getCanvasDropPosition, getCanvasItemsBounds, getCanvasPointFromClient, getSelectedCanvasAiInputIds, showToast } = ctx;
    const cleanWorkflow = normalizeCanvasWorkflowTemplate(workflow);
    if (!cleanWorkflow) {
      showToast('工作流模板不可用');
      return 0;
    }
    const validation = validateCanvasWorkflowTemplate(cleanWorkflow);
    if (validation.errors.length > 0) {
      showToast(`Workflow 校验失败：${validation.errors[0].slice(0, 96)}`);
      console.warn('Canvas workflow validation failed:', validation.errors, cleanWorkflow);
      return 0;
    }
    if (validation.warnings.length > 0) {
      console.warn('Canvas workflow validation warnings:', validation.warnings, cleanWorkflow);
    }
    const selectedInputIds = getSelectedCanvasAiInputIds();
    const inputBounds = selectedInputIds.length > 0 ? getCanvasItemsBounds(selectedInputIds) : null;
    const targetPoint = client ? getCanvasPointFromClient(client.x, client.y) : null;
    const base = inputBounds && !targetPoint
      ? { x: inputBounds.x + inputBounds.width + 96, y: inputBounds.y }
      : (targetPoint || getCanvasDropPosition(0, client));
    const canvasItem = buildCanvasWorkflowModuleNode(cleanWorkflow, base, selectedInputIds);
    if (!canvasItem) {
      showToast('工作流模板不可用');
      return 0;
    }
    const addedCount = appendCanvasItems([canvasItem], `添加工作流「${cleanWorkflow.label}」`);
    if (addedCount > 0) {
      showToast(`已添加工作流模块「${cleanWorkflow.label}」${selectedInputIds.length > 0 ? `，已接入 ${selectedInputIds.length} 个输入` : ''}`);
    }
    return addedCount;

};

export const buildCanvasWorkflowSaveDraftFromSelectionImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'canvasItemsRef' | 'canvasSelectedIdsRef' | 'getCanvasBoundsFromItems' | 'showToast'>, defaultName: string): CanvasWorkflowSaveDraft | null => {
  const { canvasItemsRef, canvasSelectedIdsRef, getCanvasBoundsFromItems, showToast } = ctx;
    const selectedIds = canvasSelectedIdsRef.current;
    if (selectedIds.length === 0) {
      showToast('先框选要保存为工作流的节点');
      return null;
    }
    const canvasItemsById = new Map(canvasItemsRef.current.map(item => [item.id, item]));
    const selectedIdSet = new Set(selectedIds);
    for (const item of canvasItemsRef.current) {
      if (!selectedIdSet.has(item.id) || item.ai?.type !== 'image-generator') continue;
      (item.inputs || []).forEach(inputId => {
        const inputItem = canvasItemsById.get(inputId);
        if (!inputItem || inputItem.ai || !['image', 'text'].includes(inputItem.item.type)) return;
        selectedIdSet.add(inputId);
      });
    }
    const selectedItems = canvasItemsRef.current.filter(item => selectedIdSet.has(item.id));
    const workflowItems = selectedItems.filter(item => item.ai?.type !== 'workflow' && (item.ai?.type === 'image-generator' || canUseCanvasItemAsAiInput(item)));
    const aiCount = workflowItems.filter(item => item.ai?.type === 'image-generator').length;
    const fixedImageCount = workflowItems.filter(item => !item.ai && item.item.type === 'image').length;
    const fixedTextCount = workflowItems.filter(item => !item.ai && item.item.type === 'text').length;
    if (aiCount === 0) {
      showToast('工作流至少需要包含一个生图节点');
      return null;
    }
    const bounds = getCanvasBoundsFromItems(workflowItems);
    if (!bounds) return null;
    const workflowNodeIds = new Set(workflowItems.map(item => item.id));
    const nodes = workflowItems.map((item): CanvasWorkflowNodeTemplate => {
      const savedItem = prepareCanvasWorkflowTemplateItem(item.item);
      const internalInputs = (item.inputs || []).filter(inputId => workflowNodeIds.has(inputId));
      const acceptsExternalInputs = (item.inputs || []).some(inputId => !workflowNodeIds.has(inputId));
      return {
        id: item.id,
        x: item.x - bounds.x,
        y: item.y - bounds.y,
        width: item.width,
        height: item.height,
        item: {
          ...savedItem,
          id: item.item.id,
          type: item.item.type,
          content: item.item.content || '',
          name: item.item.name,
          createdAt: 0,
          isQuickAccess: false,
        },
        inputs: internalInputs,
        fixedInput: !item.ai && (item.item.type === 'image' || item.item.type === 'text'),
        textMode: item.textMode,
        contextRouting: item.contextRouting,
        designAgentConfig: item.designAgentConfig
          ? normalizeDesignAgentConfig(item.designAgentConfig)
          : undefined,
        acceptsExternalInputs,
        ai: item.ai
          ? {
            ...cloneDrawerValue(item.ai),
            status: 'idle' as const,
            error: undefined,
            generatedAt: undefined,
            outputs: [],
          }
          : undefined,
      };
    });
    const externalInputIds = Array.from(new Set(workflowItems.flatMap(item => (
      (item.inputs || []).filter(inputId => !workflowNodeIds.has(inputId))
    ))));
    const imageNodeModes = Object.fromEntries(
      nodes
        .filter(node => !node.ai && node.item.type === 'image')
        .map((node, index) => [
          node.id,
          {
            mode: 'fixed',
            slotId: `image-slot-${index + 1}`,
            label: node.item.name || `图片槽位 ${index + 1}`,
            required: true,
            multiple: false,
            maxItems: 1,
            role: '',
            emptyHint: '请选择图片',
            keepDefault: false,
          } satisfies CanvasWorkflowImageNodeModeDraft,
        ]),
    );
    return {
      label: defaultName,
      defaultLabel: defaultName,
      nodes,
      bounds,
      externalInputIds,
      selectedItemIds: workflowItems.map(item => item.id),
      aiCount,
      fixedImageCount,
      fixedTextCount,
      imageNodeModes,
    };

};

export const confirmSaveCanvasWorkflowImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'buildCanvasWorkflowModuleNode' | 'canvasWorkflowSaveDraft' | 'closeCanvasWorkflowSaveDialog' | 'pushCanvasUndoSnapshot' | 'setCustomCanvasWorkflows' | 'showToast' | 'updateCanvasItemsImmediate' | 'updateCanvasSelection'>) => {
  const { buildCanvasWorkflowModuleNode, canvasWorkflowSaveDraft, closeCanvasWorkflowSaveDialog, pushCanvasUndoSnapshot, setCustomCanvasWorkflows, showToast, updateCanvasItemsImmediate, updateCanvasSelection } = ctx;
    if (!canvasWorkflowSaveDraft) return;
    const label = canvasWorkflowSaveDraft.label.trim().slice(0, 32);
    if (!label) {
      showToast('请输入工作流名称');
      return;
    }
    const configuredSlotIds = Object.values(canvasWorkflowSaveDraft.imageNodeModes || {})
      .filter(config => config.mode === 'internal_slot')
      .map(config => String(config.slotId || '').trim());
    if (
      configuredSlotIds.some(slotId => !slotId)
      || new Set(configuredSlotIds).size !== configuredSlotIds.length
    ) {
      showToast('每个图片槽位必须有唯一的槽位 ID');
      return;
    }
    const slotAssets = new Map<string, CanvasWorkflowSlotAsset[]>();
    const configuredNodes = canvasWorkflowSaveDraft.nodes.map((node, nodeIndex): CanvasWorkflowNodeTemplate => {
      const config = canvasWorkflowSaveDraft.imageNodeModes?.[node.id];
      if (!config || node.item.type !== 'image' || node.ai) return node;
      if (config.mode === 'external_bridge') {
        return {
          ...node,
          item: {
            ...node.item,
            type: 'file',
            content: node.item.name || '参考图输入',
            path: undefined,
            url: undefined,
            thumbnail: undefined,
            sourceUrl: undefined,
            originalUrl: undefined,
            sourceItemId: undefined,
          },
          fixedInput: false,
          acceptsExternalInputs: true,
          externalInputTypes: ['image'],
          outputType: 'image',
          bridgeType: 'reference_image',
          internalSlot: undefined,
        };
      }
      if (config.mode === 'internal_slot') {
        const slot = normalizeCanvasWorkflowInternalSlot({
          id: String(config.slotId || '').trim(),
          label: String(config.label || node.item.name || config.slotId || '').trim(),
          mediaType: 'image',
          mode: 'replaceable_internal',
          required: config.required === true,
          multiple: config.multiple === true,
          maxItems: config.multiple ? Math.max(1, Number(config.maxItems) || 12) : 1,
          role: String(config.role || '').trim() || undefined,
          emptyHint: String(config.emptyHint || '').trim() || undefined,
          clearable: true,
          order: nodeIndex,
          defaultValue: config.keepDefault
            ? {
                url: node.item.url,
                path: node.item.path,
                sourceItemId: node.item.sourceItemId || node.item.id,
              }
            : undefined,
        }, {
          id: node.id,
          label: node.item.name || node.id,
          order: nodeIndex,
        })!;
        const currentAsset = createCanvasWorkflowSlotAssetFromItem(node.item);
        if (currentAsset) slotAssets.set(slot.id, [currentAsset]);
        return {
          ...node,
          fixedInput: true,
          acceptsExternalInputs: false,
          externalInputTypes: undefined,
          outputType: slot.multiple ? 'image[]' : 'image',
          bridgeType: undefined,
          internalSlot: slot,
          item: {
            ...node.item,
            path: config.keepDefault ? node.item.path : undefined,
            url: config.keepDefault ? node.item.url : undefined,
            thumbnail: undefined,
            sourceUrl: undefined,
            originalUrl: undefined,
            sourceItemId: config.keepDefault ? node.item.sourceItemId : undefined,
          },
        };
      }
      return {
        ...node,
        fixedInput: config.mode === 'fixed',
        acceptsExternalInputs: false,
        externalInputTypes: undefined,
        bridgeType: undefined,
        internalSlot: undefined,
      };
    });
    const workflow: CanvasWorkflowTemplate = {
      id: `custom-workflow-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      label,
      hint: `${canvasWorkflowSaveDraft.nodes.length} 个节点，${canvasWorkflowSaveDraft.aiCount} 个生图节点，固定 ${canvasWorkflowSaveDraft.fixedImageCount} 图/${canvasWorkflowSaveDraft.fixedTextCount} 文`,
      nodes: configuredNodes,
      userInput: normalizeCanvasWorkflowUserInput(undefined),
      createdAt: Date.now(),
    };
    let moduleNode = buildCanvasWorkflowModuleNode(
      workflow,
      { x: canvasWorkflowSaveDraft.bounds.x, y: canvasWorkflowSaveDraft.bounds.y },
      canvasWorkflowSaveDraft.externalInputIds
    );
    if (!moduleNode) {
      showToast('工作流封装失败');
      return;
    }
    for (const slotNode of getCanvasWorkflowInternalSlotNodes(workflow)) {
      const slot = slotNode.internalSlot!;
      const assets = slotAssets.get(slot.id);
      if (!assets?.length) continue;
      moduleNode = replaceCanvasWorkflowInternalSlot({ module: moduleNode, slot, assets });
    }
    setCustomCanvasWorkflows(prev => [workflow, ...prev].slice(0, 24));
    pushCanvasUndoSnapshot('封装工作流');
    updateCanvasItemsImmediate(prev => {
      const selectedSet = new Set(canvasWorkflowSaveDraft.selectedItemIds);
      const nextItems = prev
        .filter(item => !selectedSet.has(item.id))
        .map(item => {
          const inputs = item.inputs || [];
          if (!inputs.some(inputId => selectedSet.has(inputId))) return item;
          return {
            ...item,
            inputs: Array.from(new Set(inputs.map(inputId => selectedSet.has(inputId) ? moduleNode.id : inputId))),
          };
        });
      return [...nextItems, moduleNode];
    });
    updateCanvasSelection([moduleNode.id]);
    closeCanvasWorkflowSaveDialog();
    showToast(`已保存并封装工作流「${label}」`);

};

export const updateCanvasWorkflowModuleNodesForTemplateImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'updateCanvasItemsImmediate'>, workflow: CanvasWorkflowTemplate, resetOutputs: boolean = false) => {
  const { updateCanvasItemsImmediate } = ctx;
    updateCanvasItemsImmediate(prev => prev.map(item => {
      if (item.ai?.type !== 'workflow' || item.ai.presetId !== workflow.id) return item;
      return {
        ...item,
        item: {
          ...item.item,
          name: `工作流 ${workflow.label}`,
          remark: workflow.hint,
        },
        ai: {
          ...item.ai,
          presetLabel: workflow.label,
          presetPrompt: workflow.hint,
          workflow,
          outputs: resetOutputs ? [] : item.ai.outputs,
          workflowRuntime: resetOutputs ? undefined : item.ai.workflowRuntime,
          status: resetOutputs ? 'idle' as const : item.ai.status,
          error: resetOutputs ? undefined : item.ai.error,
          generatedAt: resetOutputs ? undefined : item.ai.generatedAt,
        },
      };
    }));

};

export const openCanvasWorkflowManagerImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'canvasWorkflowTemplates' | 'selectCanvasWorkflowForEdit' | 'setIsCanvasPresetEditorOpen' | 'setIsCanvasWorkflowManagerOpen' | 'setSelectedCanvasWorkflowDeleteIds' | 'showToast'>, workflowId?: string) => {
  const { canvasWorkflowTemplates, selectCanvasWorkflowForEdit, setIsCanvasPresetEditorOpen, setIsCanvasWorkflowManagerOpen, setSelectedCanvasWorkflowDeleteIds, showToast } = ctx;
    const workflow = (workflowId ? canvasWorkflowTemplates.find(item => item.id === workflowId) : null)
      || canvasWorkflowTemplates.find(item => !item.builtin)
      || canvasWorkflowTemplates[0];
    if (!workflow) {
      showToast('暂无可管理的工作流');
      return;
    }
    setIsCanvasPresetEditorOpen(false);
    setSelectedCanvasWorkflowDeleteIds([]);
    selectCanvasWorkflowForEdit(workflow.id);
    setIsCanvasWorkflowManagerOpen(true);

};

export const saveCanvasWorkflowManagerChangesImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'canvasWorkflowEditingId' | 'canvasWorkflowHintDraft' | 'canvasWorkflowNameDraft' | 'canvasWorkflowTemplates' | 'customCanvasWorkflows' | 'setCanvasWorkflowEditingId' | 'setCanvasWorkflowHintDraft' | 'setCanvasWorkflowNameDraft' | 'setCustomCanvasWorkflows' | 'showToast' | 'updateCanvasWorkflowModuleNodesForTemplate'>) => {
  const { canvasWorkflowEditingId, canvasWorkflowHintDraft, canvasWorkflowNameDraft, canvasWorkflowTemplates, customCanvasWorkflows, setCanvasWorkflowEditingId, setCanvasWorkflowHintDraft, setCanvasWorkflowNameDraft, setCustomCanvasWorkflows, showToast, updateCanvasWorkflowModuleNodesForTemplate } = ctx;
    const source = canvasWorkflowTemplates.find(item => item.id === canvasWorkflowEditingId);
    if (!source) {
      showToast('请选择要修改的工作流');
      return;
    }
    const label = canvasWorkflowNameDraft.trim().slice(0, 32);
    if (!label) {
      showToast('请输入工作流名称');
      return;
    }
    const hint = canvasWorkflowHintDraft.trim().slice(0, 80) || source.hint || '自定义工作流';
    const hasCustomOverride = customCanvasWorkflows.some(item => item.id === source.id);
    const nextWorkflow = normalizeCanvasWorkflowTemplate({
      ...cloneDrawerValue(source),
      id: source.id,
      label,
      hint,
      createdAt: Date.now(),
      builtin: false,
    });
    if (!nextWorkflow) {
      showToast('工作流保存失败');
      return;
    }
    setCustomCanvasWorkflows(prev => (
      hasCustomOverride
        ? prev.map(item => item.id === source.id ? nextWorkflow : item)
        : [nextWorkflow, ...prev].slice(0, 24)
    ));
    setCanvasWorkflowEditingId(nextWorkflow.id);
    setCanvasWorkflowNameDraft(nextWorkflow.label);
    setCanvasWorkflowHintDraft(nextWorkflow.hint || '');
    updateCanvasWorkflowModuleNodesForTemplate(nextWorkflow, false);
    showToast(`已更新工作流「${nextWorkflow.label}」`);

};

export const replaceCanvasWorkflowManagerWithSelectionImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'buildCanvasWorkflowSaveDraftFromSelection' | 'canvasWorkflowEditingId' | 'canvasWorkflowHintDraft' | 'canvasWorkflowNameDraft' | 'canvasWorkflowTemplates' | 'customCanvasWorkflows' | 'setCanvasWorkflowEditingId' | 'setCanvasWorkflowHintDraft' | 'setCanvasWorkflowNameDraft' | 'setCustomCanvasWorkflows' | 'showToast' | 'updateCanvasWorkflowModuleNodesForTemplate'>) => {
  const { buildCanvasWorkflowSaveDraftFromSelection, canvasWorkflowEditingId, canvasWorkflowHintDraft, canvasWorkflowNameDraft, canvasWorkflowTemplates, customCanvasWorkflows, setCanvasWorkflowEditingId, setCanvasWorkflowHintDraft, setCanvasWorkflowNameDraft, setCustomCanvasWorkflows, showToast, updateCanvasWorkflowModuleNodesForTemplate } = ctx;
    const source = canvasWorkflowTemplates.find(item => item.id === canvasWorkflowEditingId);
    if (!source) {
      showToast('请选择要修改的工作流');
      return;
    }
    const hasCustomOverride = customCanvasWorkflows.some(item => item.id === source.id);
    const label = (canvasWorkflowNameDraft.trim() || source.label).slice(0, 32);
    const draft = buildCanvasWorkflowSaveDraftFromSelection(label);
    if (!draft) return;
    const hint = canvasWorkflowHintDraft.trim().slice(0, 80) || `${draft.nodes.length} 个节点，${draft.aiCount} 个生图节点，固定 ${draft.fixedImageCount} 图/${draft.fixedTextCount} 文`;
    const nextWorkflow = normalizeCanvasWorkflowTemplate({
      ...cloneDrawerValue(source),
      id: source.id,
      label,
      hint,
      nodes: draft.nodes,
      createdAt: Date.now(),
      builtin: false,
    });
    if (!nextWorkflow) {
      showToast('工作流结构更新失败');
      return;
    }
    setCustomCanvasWorkflows(prev => (
      hasCustomOverride
        ? prev.map(item => item.id === source.id ? nextWorkflow : item)
        : [nextWorkflow, ...prev].slice(0, 24)
    ));
    setCanvasWorkflowEditingId(nextWorkflow.id);
    setCanvasWorkflowNameDraft(nextWorkflow.label);
    setCanvasWorkflowHintDraft(nextWorkflow.hint || '');
    updateCanvasWorkflowModuleNodesForTemplate(nextWorkflow, true);
    showToast(`已用选中节点更新「${nextWorkflow.label}」`);

};

export const deleteCanvasWorkflowIdsImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'canvasWorkflowTemplates' | 'setCanvasWorkflowEditingId' | 'setCanvasWorkflowHintDraft' | 'setCanvasWorkflowNameDraft' | 'setCustomCanvasWorkflows' | 'setHiddenBuiltInCanvasWorkflowIds' | 'setSelectedCanvasWorkflowDeleteIds' | 'showToast'>, workflowIds: string[]) => {
  const { canvasWorkflowTemplates, setCanvasWorkflowEditingId, setCanvasWorkflowHintDraft, setCanvasWorkflowNameDraft, setCustomCanvasWorkflows, setHiddenBuiltInCanvasWorkflowIds, setSelectedCanvasWorkflowDeleteIds, showToast } = ctx;
    const existingIds = new Set(canvasWorkflowTemplates.map(item => item.id));
    const targetIds = Array.from(new Set(workflowIds)).filter(id => existingIds.has(id));
    if (targetIds.length === 0) {
      showToast('请先选择要删除的工作流');
      return;
    }
    const targetIdSet = new Set(targetIds);
    const builtInIds = CANVAS_BUILT_IN_WORKFLOWS
      .filter(item => targetIdSet.has(item.id))
      .map(item => item.id);
    setCustomCanvasWorkflows(prev => prev.filter(item => !targetIdSet.has(item.id)));
    if (builtInIds.length > 0) {
      setHiddenBuiltInCanvasWorkflowIds(prev => Array.from(new Set([...prev, ...builtInIds])));
    }
    setSelectedCanvasWorkflowDeleteIds(prev => prev.filter(id => !targetIdSet.has(id)));
    const nextWorkflow = canvasWorkflowTemplates.find(item => !targetIdSet.has(item.id)) || null;
    if (nextWorkflow) {
      setCanvasWorkflowEditingId(nextWorkflow.id);
      setCanvasWorkflowNameDraft(nextWorkflow.label);
      setCanvasWorkflowHintDraft(nextWorkflow.hint || '');
    } else {
      setCanvasWorkflowEditingId('');
      setCanvasWorkflowNameDraft('');
      setCanvasWorkflowHintDraft('');
    }
    showToast(
      builtInIds.length > 0
        ? `已删除 ${targetIds.length} 个工作流，内置项已从列表隐藏`
        : `已删除 ${targetIds.length} 个工作流`
    );

};

export const expandCanvasWorkflowModuleForEditImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'canvasItemsRef' | 'commitCanvasAiPromptDraft' | 'hydrateCanvasWorkflowSlotAssetsFromDrawer' | 'instantiateCanvasWorkflowTemplateItems' | 'pushCanvasUndoSnapshot' | 'showToast' | 'updateCanvasItemsImmediate' | 'updateCanvasSelection'>, canvasId: string) => {
  const { canvasItemsRef, commitCanvasAiPromptDraft, hydrateCanvasWorkflowSlotAssetsFromDrawer, instantiateCanvasWorkflowTemplateItems, pushCanvasUndoSnapshot, showToast, updateCanvasItemsImmediate, updateCanvasSelection } = ctx;
    commitCanvasAiPromptDraft(canvasId, undefined, true);
    const moduleNode = canvasItemsRef.current.find(item => item.id === canvasId);
    const workflow = getCanvasWorkflowTemplateFromNode(moduleNode);
    if (!moduleNode || !workflow) {
      showToast('没有可展开的工作流模块');
      return;
    }
    const workflowUserInput = normalizeCanvasWorkflowUserInput(workflow.userInput);
    const acceptedInputIds = (moduleNode.inputs || []).filter(inputId => (
      canUseCanvasItemAsWorkflowMaterial(
        canvasItemsRef.current.find(item => item.id === inputId),
        workflowUserInput,
      )
    ));
    const { items: rawExpandedItems, idMap } = instantiateCanvasWorkflowTemplateItems(
      workflow,
      { x: moduleNode.x, y: moduleNode.y },
      acceptedInputIds
    );
    const runtimeSnapshots = normalizeCanvasWorkflowRuntimeSnapshots(moduleNode.ai?.workflowRuntime);
    const restoredSnapshotItems = applyCanvasWorkflowRuntimeSnapshots(workflow, rawExpandedItems, idMap, runtimeSnapshots);
    const restoredItems = hydrateCanvasWorkflowSlotAssetsFromDrawer(applyCanvasWorkflowInternalSlotBindings({
      workflow,
      items: restoredSnapshotItems,
      idMap,
      runtime: moduleNode.ai?.workflowRuntime,
    }));
    const groupId = `workflow_group_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const expandedItems = restoredItems.map(item => {
      const templateEntry = Array.from(idMap.entries()).find(([, runtimeId]) => runtimeId === item.id);
      const templateId = templateEntry?.[0] || item.id;
      return {
        ...item,
        workflowGroup: {
          groupId,
          templateId,
          workflowId: workflow.id,
          workflowLabel: workflow.label,
          workflowHint: workflow.hint,
          workflowBuiltin: workflow.builtin,
          module: cloneDrawerValue(moduleNode),
          expandedAt: Date.now(),
        } satisfies CanvasWorkflowExpandedGroup,
      };
    });
    if (expandedItems.length === 0) {
      showToast('工作流内部没有可编辑节点');
      return;
    }
    const terminalIds = getCanvasWorkflowTerminalNodeTemplates(workflow)
      .map(node => idMap.get(node.id))
      .filter((id): id is string => !!id);
    pushCanvasUndoSnapshot('展开工作流');
    updateCanvasItemsImmediate(prev => {
      const nextItems = prev
        .filter(item => item.id !== moduleNode.id)
        .map(item => {
          const inputs = item.inputs || [];
          if (!inputs.includes(moduleNode.id)) return item;
          const replacementInputs = terminalIds.length > 0 ? terminalIds : [];
          return {
            ...item,
            inputs: Array.from(new Set(inputs.flatMap(inputId => (
              inputId === moduleNode.id ? replacementInputs : [inputId]
            )))),
          };
        });
      return [...nextItems, ...expandedItems];
    });
    updateCanvasSelection(expandedItems.map(item => item.id));
    showToast(`已展开「${workflow.label}」，可右键内部节点折叠回工作流`);

};

export const buildCanvasWorkflowTemplateFromExpandedGroupImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'getCanvasBoundsFromItems'>, groupItems: CanvasImageItem[], group: CanvasWorkflowExpandedGroup) => {
  const { getCanvasBoundsFromItems } = ctx;
    const bounds = getCanvasBoundsFromItems(groupItems);
    if (!bounds) return null;
    const originalWorkflow = getCanvasWorkflowTemplateFromNode(group.module);
    const templateIdByCanvasId = new Map(groupItems.map(item => [
      item.id,
      getCanvasWorkflowGroup(item)?.templateId || item.id,
    ]));
    const idMap = new Map<string, string>();
    templateIdByCanvasId.forEach((templateId, canvasId) => {
      idMap.set(templateId, canvasId);
    });
    const groupCanvasIds = new Set(groupItems.map(item => item.id));
    const externalInputIds = Array.from(new Set(groupItems.flatMap(item => (
      (item.inputs || []).filter(inputId => !groupCanvasIds.has(inputId))
    ))));
    const nodes = groupItems.map((item): CanvasWorkflowNodeTemplate => {
      const templateId = templateIdByCanvasId.get(item.id) || item.id;
      const originalNode = originalWorkflow?.nodes.find(node => node.id === templateId);
      const isInternalSlot = isReplaceableInternalImageSlot(originalNode);
      const savedItem = isInternalSlot
        ? cloneDrawerValue(originalNode!.item)
        : prepareCanvasWorkflowTemplateItem(item.item);
      const internalInputs = (item.inputs || [])
        .map(inputId => templateIdByCanvasId.get(inputId))
        .filter((inputId): inputId is string => !!inputId);
      const acceptsExternalInputs = originalNode?.acceptsExternalInputs === true
        || (item.inputs || []).some(inputId => !groupCanvasIds.has(inputId));
      return {
        id: templateId,
        x: item.x - bounds.x,
        y: item.y - bounds.y,
        width: item.width,
        height: item.height,
        item: {
          ...savedItem,
          id: templateId,
          type: item.item.type,
          content: item.item.content || '',
          name: item.item.name,
          createdAt: 0,
          isQuickAccess: false,
        },
        inputs: internalInputs,
        fixedInput: isInternalSlot
          ? true
          : !item.ai && (item.item.type === 'image' || item.item.type === 'text'),
        textMode: item.textMode,
        contextRouting: item.contextRouting || originalNode?.contextRouting,
        designAgentConfig: item.designAgentConfig
          ? normalizeDesignAgentConfig(item.designAgentConfig)
          : originalNode?.designAgentConfig,
        acceptsExternalInputs: isInternalSlot ? false : acceptsExternalInputs,
        externalInputTypes: isInternalSlot ? undefined : (acceptsExternalInputs ? originalNode?.externalInputTypes : undefined),
        outputType: isInternalSlot
          ? (originalNode?.internalSlot?.multiple ? 'image[]' : 'image')
          : originalNode?.outputType,
        bridgeType: isInternalSlot ? undefined : originalNode?.bridgeType,
        internalSlot: originalNode?.internalSlot
          ? cloneDrawerValue(originalNode.internalSlot)
          : undefined,
        ai: item.ai
          ? {
            ...cloneDrawerValue(item.ai),
            status: 'idle' as const,
            error: undefined,
            generatedAt: undefined,
            outputs: [],
            workflow: undefined,
            workflowRuntime: undefined,
          }
          : undefined,
      };
    });
    const workflow = normalizeCanvasWorkflowTemplate({
      id: group.workflowId,
      label: group.workflowLabel,
      hint: group.workflowHint,
      nodes,
      userInput: originalWorkflow?.userInput,
      builtin: group.workflowBuiltin,
      createdAt: Date.now(),
    });
    return workflow ? { workflow, bounds, externalInputIds, idMap } : null;

};

export const exportCanvasWorkflowModuleInstanceImpl = async (ctx: Pick<canvasWorkflowEditorActionContext, 'canvasItemsRef' | 'imageSourceToDataUrl' | 'showToast'>, canvasId: string) => {
  const { canvasItemsRef, imageSourceToDataUrl, showToast } = ctx;
    const module = canvasItemsRef.current.find(item => item.id === canvasId);
    const workflow = getCanvasWorkflowTemplateFromNode(module);
    if (!module || !workflow) {
      showToast('没有可导出的工作流实例');
      return;
    }
    try {
      const filePath = await save({
        defaultPath: `${workflow.label || 'workflow'}-instance.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!filePath) return;
      const portable = await buildPortableCanvasWorkflowInstance({
        workflow: { ...workflow, builtin: false },
        runtime: module.ai?.workflowRuntime,
        includeInternalSlotAssets: true,
        readImageDataUrl: source => imageSourceToDataUrl(source, false),
      });
      await invoke('save_item_source_as', {
        source: '',
        dest: filePath,
        content: JSON.stringify(portable, null, 2),
        itemType: 'text',
      });
      showToast('已导出工作流实例及槽位图片');
    } catch (error) {
      console.warn('导出工作流实例失败:', error);
      showToast(error instanceof Error ? `导出失败：${error.message}` : '导出失败');
    }

};

export const deleteSelectedCanvasWorkflowsImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'canvasWorkflowTemplates' | 'closeConfirmDialog' | 'deleteCanvasWorkflowIds' | 'selectedCanvasWorkflowDeleteIds' | 'setConfirmDialog' | 'showToast'>) => {
  const { canvasWorkflowTemplates, closeConfirmDialog, deleteCanvasWorkflowIds, selectedCanvasWorkflowDeleteIds, setConfirmDialog, showToast } = ctx;
    const selectedIds = selectedCanvasWorkflowDeleteIds.filter(id => canvasWorkflowTemplates.some(workflow => workflow.id === id));
    if (selectedIds.length === 0) {
      showToast('请先勾选要删除的工作流');
      return;
    }
    const count = selectedIds.length;
    const builtInCount = selectedIds.filter(id => CANVAS_BUILT_IN_WORKFLOWS.some(workflow => workflow.id === id)).length;
    setConfirmDialog({
      isOpen: true,
      title: count === 1 ? '删除工作流预设？' : `删除 ${count} 个工作流预设？`,
      message: `将删除已勾选的 ${count} 个工作流${builtInCount > 0 ? `，其中 ${builtInCount} 个内置工作流会从列表隐藏` : ''}。画布上已有工作流模块会保留当前快照。`,
      onConfirm: () => {},
      actions: [
        {
          label: `删除 ${count} 个`,
          onClick: () => {
            deleteCanvasWorkflowIds(selectedIds);
            closeConfirmDialog();
          },
          className: 'rounded-[16px] bg-red-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-600',
        },
      ],
    });

};

export const collapseCanvasWorkflowGroupNowImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'buildCanvasWorkflowModuleNode' | 'buildCanvasWorkflowTemplateFromExpandedGroup' | 'canvasWorkflowSingleEditGroupIdsRef' | 'customCanvasWorkflows' | 'getCanvasWorkflowExpandedGroupItems' | 'pushCanvasUndoSnapshot' | 'setCanvasWorkflowSingleEditGroupIds' | 'setCustomCanvasWorkflows' | 'showToast' | 'updateCanvasItemsImmediate' | 'updateCanvasSelection'>, group: CanvasWorkflowExpandedGroup, saveTemplate: boolean, changed: boolean) => {
  const { buildCanvasWorkflowModuleNode, buildCanvasWorkflowTemplateFromExpandedGroup, canvasWorkflowSingleEditGroupIdsRef, customCanvasWorkflows, getCanvasWorkflowExpandedGroupItems, pushCanvasUndoSnapshot, setCanvasWorkflowSingleEditGroupIds, setCustomCanvasWorkflows, showToast, updateCanvasItemsImmediate, updateCanvasSelection } = ctx;
    const groupItems = getCanvasWorkflowExpandedGroupItems(group.groupId);
    if (groupItems.length === 0) {
      showToast('没有找到可折叠的工作流节点');
      return;
    }
    const built = buildCanvasWorkflowTemplateFromExpandedGroup(groupItems, group);
    if (!built) {
      showToast('工作流折叠失败');
      return;
    }
    const originalWorkflow = getCanvasWorkflowTemplateFromNode(group.module) || built.workflow;
    let workflowForModule: CanvasWorkflowTemplate = changed ? { ...built.workflow, builtin: false } : originalWorkflow;
    if (saveTemplate && changed) {
      const isCustom = customCanvasWorkflows.some(item => item.id === originalWorkflow.id);
      workflowForModule = {
        ...built.workflow,
        id: isCustom ? originalWorkflow.id : `custom-workflow-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
        label: group.workflowLabel,
        hint: group.workflowHint,
        builtin: false,
        createdAt: Date.now(),
      };
      setCustomCanvasWorkflows(prev => (
        isCustom
          ? prev.map(item => item.id === originalWorkflow.id ? workflowForModule : item)
          : [workflowForModule, ...prev].slice(0, 24)
      ));
    } else if (changed) {
      workflowForModule = {
        ...workflowForModule,
        id: `local-workflow-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
        builtin: false,
      };
    }

    const moduleDraft = buildCanvasWorkflowModuleNode(workflowForModule, { x: built.bounds.x, y: built.bounds.y }, built.externalInputIds);
    if (!moduleDraft) {
      showToast('工作流模块恢复失败');
      return;
    }
    const moduleNode: CanvasImageItem = {
      ...moduleDraft,
      id: group.module.id,
      item: {
        ...moduleDraft.item,
        id: group.module.item.id,
        content: group.module.item.content || '',
        createdAt: group.module.item.createdAt,
      },
      ai: {
        ...moduleDraft.ai,
        type: 'workflow' as const,
        skillMeta: {
          ...(moduleDraft.ai?.skillMeta || {}),
          ...(group.module.ai?.skillMeta || {}),
        },
      },
    };
    const outputs = createCanvasWorkflowModuleOutputsFromExpandedGroup(moduleNode, workflowForModule, groupItems, built.idMap);
    const successCount = outputs.filter(output => output.status === 'success' && getCanvasAiOutputDisplaySource(output)).length;
    const nextStatus = successCount > 0
      ? (successCount === outputs.length ? 'success' as const : 'error' as const)
      : 'idle' as const;
    const workflowRuntime = createCanvasWorkflowRuntimeValue(
      workflowForModule,
      groupItems,
      built.idMap,
      group.module.ai?.workflowRuntime,
    );
    const restoredModule: CanvasImageItem = {
      ...moduleNode,
      ai: {
        ...(moduleNode.ai || { type: 'workflow' as const }),
        type: 'workflow' as const,
        outputs,
        workflowRuntime,
        status: nextStatus,
        error: nextStatus === 'error' ? '部分内部输出缺失' : undefined,
        generatedAt: successCount > 0 ? Date.now() : undefined,
      },
    };
    const groupCanvasIds = new Set(groupItems.map(item => item.id));
    canvasWorkflowSingleEditGroupIdsRef.current.delete(group.groupId);
    setCanvasWorkflowSingleEditGroupIds(prev => prev.filter(groupId => groupId !== group.groupId));
    pushCanvasUndoSnapshot('折叠工作流');
    updateCanvasItemsImmediate(prev => {
      const nextItems = prev
        .filter(item => !groupCanvasIds.has(item.id))
        .map(item => {
          const inputs = item.inputs || [];
          if (!inputs.some(inputId => groupCanvasIds.has(inputId))) return item;
          return {
            ...item,
            inputs: Array.from(new Set(inputs.map(inputId => groupCanvasIds.has(inputId) ? restoredModule.id : inputId))),
          };
        });
      return [...nextItems, restoredModule];
    });
    updateCanvasSelection([restoredModule.id]);
    showToast(saveTemplate && changed
      ? `已保存并折叠工作流「${workflowForModule.label}」`
      : `已折叠工作流「${workflowForModule.label}」`);

};

export const collapseCanvasWorkflowGroupImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'buildCanvasWorkflowTemplateFromExpandedGroup' | 'canvasItemsRef' | 'closeConfirmDialog' | 'collapseCanvasWorkflowGroupNow' | 'getCanvasWorkflowExpandedGroupItems' | 'setConfirmDialog' | 'showToast'>, canvasId: string) => {
  const { buildCanvasWorkflowTemplateFromExpandedGroup, canvasItemsRef, closeConfirmDialog, collapseCanvasWorkflowGroupNow, getCanvasWorkflowExpandedGroupItems, setConfirmDialog, showToast } = ctx;
    const sourceItem = canvasItemsRef.current.find(item => item.id === canvasId);
    const group = getCanvasWorkflowGroup(sourceItem);
    if (!group) {
      showToast('这个节点不属于已展开工作流');
      return;
    }
    const groupItems = getCanvasWorkflowExpandedGroupItems(group.groupId);
    const built = buildCanvasWorkflowTemplateFromExpandedGroup(groupItems, group);
    const originalWorkflow = getCanvasWorkflowTemplateFromNode(group.module);
    if (!built || !originalWorkflow) {
      showToast('工作流折叠失败');
      return;
    }
    const changed = hasCanvasWorkflowTemplateChanged(built.workflow, originalWorkflow);
    if (!changed) {
      collapseCanvasWorkflowGroupNow(group, false, false);
      return;
    }
    setConfirmDialog({
      isOpen: true,
      title: '保存工作流修改？',
      message: `「${group.workflowLabel}」的内部节点有调整。保存会更新工作流模板，但不会保存新生成的图片结果。`,
      onConfirm: () => {},
      actions: [
        {
          label: '不保存折叠',
          onClick: () => {
            closeConfirmDialog();
            collapseCanvasWorkflowGroupNow(group, false, true);
          },
          className: 'rounded-[16px] bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-600 transition-colors hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700',
        },
        {
          label: '保存并折叠',
          onClick: () => {
            closeConfirmDialog();
            collapseCanvasWorkflowGroupNow(group, true, true);
          },
          className: 'rounded-[16px] bg-emerald-500 px-3 py-1.5 text-xs font-black text-white transition-colors hover:bg-emerald-400 dark:bg-emerald-400 dark:text-stone-950 dark:hover:bg-emerald-300',
        },
      ],
    });

};

export const applyCanvasAiGeneratorDataPatchImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'canvasAiPromptEditingId' | 'canvasGroupResizeRef' | 'canvasResizeRef' | 'getCanvasAiNodeDesignSizeForItem'>, item: CanvasImageItem, patch: Partial<NonNullable<CanvasImageItem['ai']>>, content?: string) => {
  const { canvasAiPromptEditingId, canvasGroupResizeRef, canvasResizeRef, getCanvasAiNodeDesignSizeForItem } = ctx;
    const nextAi = {
      ...(item.ai || {}),
      ...patch,
      type: patch.type || item.ai?.type || 'image-generator',
    } as NonNullable<CanvasImageItem['ai']>;
    const nextItem = content === undefined ? item.item : {
      ...item.item,
      content,
      name: item.ai?.type === 'workflow'
        ? item.item.name
        : content.trim().split(/\r?\n/)[0]?.slice(0, 24) || (item.ai?.presetLabel ? `AI ${item.ai.presetLabel}` : getCanvasAiNodeTitle(item.ai)),
    };
    const nextCanvasItem = recoverCanvasAiNodeWithUsableResults({
      ...item,
      ai: nextAi,
      item: nextItem,
    });
    const isResizableAiNode = isCanvasAiGeneratorType(item.ai?.type)
      || item.ai?.type === 'workflow';
    const shouldResizeAiNode = isResizableAiNode && (
      patch.aspectRatio !== undefined
      || patch.count !== undefined
      || content !== undefined
      || patch.outputs !== undefined
      || patch.error !== undefined
      || (
        isCanvasAiLocalMediaToolType(item.ai?.type)
        && (
          patch.interpolationProgress !== undefined
          || patch.enhancementProgress !== undefined
          || patch.enhancementEngine !== undefined
          || patch.quickEnhancementScale !== undefined
        )
      )
    );
    const isBeingManuallyResized = canvasResizeRef.current?.id === item.id
      || !!canvasGroupResizeRef.current?.startItems[item.id];
    if (!shouldResizeAiNode || isBeingManuallyResized) return nextCanvasItem;
    const promptExpanded = canvasAiPromptEditingId === item.id;
    const oldSize = getCanvasAiNodeDesignSizeForItem(item, promptExpanded);
    const nextSize = getCanvasAiNodeDesignSizeForItem(nextCanvasItem, promptExpanded);
    const nodeScale = getCanvasDesignScale(item, oldSize);
    return {
      ...nextCanvasItem,
      width: nextSize.width * nodeScale,
      height: nextSize.height * nodeScale,
    };

};

export const updateCanvasAiGeneratorDataForCanvasImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'applyCanvasAiGeneratorDataPatch' | 'updateCanvasNodeForCanvas'>, targetCanvasId: string, nodeId: string, patch: Partial<NonNullable<CanvasImageItem['ai']>>, content?: string) => {
  const { applyCanvasAiGeneratorDataPatch, updateCanvasNodeForCanvas } = ctx;
    return updateCanvasNodeForCanvas(
      targetCanvasId,
      nodeId,
      item => applyCanvasAiGeneratorDataPatch(item, patch, content),
    );

};

export const updateCanvasNodeForCanvasImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'activeCanvasIdRef' | 'canvasItemsPatchCommitRef' | 'enqueueCanvasBackgroundNodePatch' | 'getCanvasSessionItems' | 'isSwitchingCanvasRef' | 'scheduleCanvasChangedNodesPatchSave' | 'setCanvasSessionItems' | 'updateCanvasItemsImmediate'>, targetCanvasId: string, nodeId: string, updater: (item: CanvasImageItem) => CanvasImageItem) => {
  const { activeCanvasIdRef, canvasItemsPatchCommitRef, enqueueCanvasBackgroundNodePatch, getCanvasSessionItems, isSwitchingCanvasRef, scheduleCanvasChangedNodesPatchSave, setCanvasSessionItems, updateCanvasItemsImmediate } = ctx;
    const normalizedCanvasId = targetCanvasId || DEFAULT_CANVAS_ID;
    let updatedNode: CanvasImageItem | undefined;
    const updateItems = (sourceItems: CanvasImageItem[]) => sourceItems.map(item => {
      if (item.id !== nodeId) return item;
      updatedNode = updater(item);
      return updatedNode;
    });

    if (normalizedCanvasId === activeCanvasIdRef.current && !isSwitchingCanvasRef.current) {
      canvasItemsPatchCommitRef.current = true;
      updateCanvasItemsImmediate(updateItems);
      scheduleCanvasChangedNodesPatchSave([nodeId]);
      return updatedNode;
    }

    const nextItems = updateItems(getCanvasSessionItems(normalizedCanvasId));
    if (!updatedNode) return undefined;
    setCanvasSessionItems(normalizedCanvasId, nextItems);
    void enqueueCanvasBackgroundNodePatch(normalizedCanvasId, updatedNode);
    return updatedNode;

};

export const updateCanvasImageRuleImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'canvasItemsRef' | 'pushDrawerUndoSnapshot' | 'updateCanvasItemsImmediate'>, canvasId: string, key: ImageRuleKey, enabled: boolean) => {
  const { canvasItemsRef, pushDrawerUndoSnapshot, updateCanvasItemsImmediate } = ctx;
    const target = canvasItemsRef.current.find(item => item.id === canvasId);
    if (target?.ai?.type !== 'image-generator') return;
    const explicitRules = normalizeImageRuleState(target.ai.imagePolicy?.rules);
    const nextRules = {
      ...explicitRules,
      [key]: enabled,
    };
    pushDrawerUndoSnapshot('修改图像规则');
    updateCanvasItemsImmediate(prev => prev.map(item => (
      item.id === canvasId && item.ai?.type === 'image-generator'
        ? {
          ...item,
          ai: {
            ...item.ai,
            imagePolicy: {
              ...(item.ai.imagePolicy || {}),
              rules: nextRules,
              updatedAt: Date.now(),
            },
          },
        }
        : item
    )));

};

export const toggleCanvasImageRulePanelImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'canvasAiPromptEditingId' | 'canvasItemsRef' | 'getCanvasAiNodeDesignSizeForItem' | 'updateCanvasItemsImmediate'>, canvasId: string) => {
  const { canvasAiPromptEditingId, canvasItemsRef, getCanvasAiNodeDesignSizeForItem, updateCanvasItemsImmediate } = ctx;
    const target = canvasItemsRef.current.find(item => item.id === canvasId);
    if (target?.ai?.type !== 'image-generator') return;
    const nextExpanded = target.ai.imagePolicy?.panelExpanded === false;
    updateCanvasItemsImmediate(prev => prev.map(item => {
      if (item.id !== canvasId || item.ai?.type !== 'image-generator') return item;
      const nextItem: CanvasImageItem = {
        ...item,
        ai: {
          ...item.ai,
          imagePolicy: {
            ...(item.ai.imagePolicy || {}),
            panelExpanded: nextExpanded,
            updatedAt: Date.now(),
          },
        },
      };
      const promptExpanded = canvasAiPromptEditingId === item.id;
      const oldSize = getCanvasAiNodeDesignSizeForItem(item, promptExpanded);
      const nextSize = getCanvasAiNodeDesignSizeForItem(nextItem, promptExpanded);
      const nodeScale = getCanvasDesignScale(item, oldSize);
      return {
        ...nextItem,
        width: nextSize.width * nodeScale,
        height: nextSize.height * nodeScale,
      };
    }));

};

export const commitCanvasAiPromptDraftImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'canvasAiPromptDraftTimersRef' | 'canvasAiPromptDraftValuesRef' | 'canvasItemsRef' | 'updateCanvasAiGeneratorData'>, canvasId: string, content?: string, sync: boolean = false) => {
  const { canvasAiPromptDraftTimersRef, canvasAiPromptDraftValuesRef, canvasItemsRef, updateCanvasAiGeneratorData } = ctx;
    const nextContent = content ?? canvasAiPromptDraftValuesRef.current[canvasId];
    if (nextContent === undefined) return;
    const timer = canvasAiPromptDraftTimersRef.current[canvasId];
    if (timer !== undefined) {
      window.clearTimeout(timer);
      delete canvasAiPromptDraftTimersRef.current[canvasId];
    }
    delete canvasAiPromptDraftValuesRef.current[canvasId];
    const current = canvasItemsRef.current.find(item => item.id === canvasId);
    if (!current) return;
    if ((current?.item.content || '') === nextContent) return;
    const commit = () => updateCanvasAiGeneratorData(
      canvasId,
      { prompt: nextContent, status: 'idle', error: undefined },
      nextContent
    );
    if (sync) flushSync(commit);
    else commit();

};

export const optimizeCanvasPromptImpl = async (ctx: Pick<canvasWorkflowEditorActionContext, 'canvasAgent' | 'canvasAiPromptDraftValuesRef' | 'canvasAiPromptTextAreaRefs' | 'canvasItemsRef' | 'canvasPromptOptimizingId' | 'commitCanvasAiPromptDraft' | 'setCanvasPromptOptimizingId' | 'showToast' | 'updateCanvasSelection'>, canvasId: string) => {
  const { canvasAgent, canvasAiPromptDraftValuesRef, canvasAiPromptTextAreaRefs, canvasItemsRef, canvasPromptOptimizingId, commitCanvasAiPromptDraft, setCanvasPromptOptimizingId, showToast, updateCanvasSelection } = ctx;
    if (canvasPromptOptimizingId) return;
    const target = canvasItemsRef.current.find(item => item.id === canvasId);
    if (!target || (target.ai?.type !== 'image-generator' && target.ai?.type !== 'video-generator')) return;

    const prompt = canvasAiPromptDraftValuesRef.current[canvasId]
      ?? canvasAiPromptTextAreaRefs.current[canvasId]?.value
      ?? target.item.content
      ?? '';
    if (!prompt.trim()) {
      showToast('请先在文本框中输入提示词');
      return;
    }

    updateCanvasSelection([canvasId]);
    setCanvasPromptOptimizingId(canvasId);
    try {
      const mediaType = target.ai.type === 'video-generator' ? 'video' : 'image';
      const optimized = await canvasAgent.optimizePrompt(prompt, mediaType);
      const nextPrompt = optimized.trim();
      if (!nextPrompt) throw new Error('模型没有返回可用的优化结果');

      const livePrompt = canvasAiPromptTextAreaRefs.current[canvasId]?.value
        ?? canvasItemsRef.current.find(item => item.id === canvasId)?.item.content
        ?? '';
      if (livePrompt.trim() !== prompt.trim()) {
        showToast('提示词已被修改，未覆盖当前内容');
        return;
      }

      const textarea = canvasAiPromptTextAreaRefs.current[canvasId];
      if (textarea) textarea.value = nextPrompt;
      commitCanvasAiPromptDraft(canvasId, nextPrompt, true);
      showToast('提示词已优化');
    } catch (error) {
      showToast(`提示词优化失败：${error instanceof Error ? error.message : String(error || '请稍后重试')}`);
    } finally {
      setCanvasPromptOptimizingId(current => current === canvasId ? null : current);
    }

};

export const resizeCanvasAiPromptEditorImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'canvasAiPromptEditingId' | 'getCanvasAiNodeDesignSizeForItem' | 'updateCanvasItemsImmediate'>, canvasId: string, expanded: boolean, previousExpanded?: boolean) => {
  const { canvasAiPromptEditingId, getCanvasAiNodeDesignSizeForItem, updateCanvasItemsImmediate } = ctx;
    updateCanvasItemsImmediate(prev => prev.map(item => {
      if (item.id !== canvasId || (!isCanvasAiGeneratorType(item.ai?.type) && item.ai?.type !== 'workflow')) return item;
      const oldExpanded = previousExpanded ?? canvasAiPromptEditingId === item.id;
      const oldSize = getCanvasAiNodeDesignSizeForItem(item, oldExpanded);
      const nextSize = getCanvasAiNodeDesignSizeForItem(item, expanded);
      const nodeScale = getCanvasDesignScale(item, oldSize);
      return {
        ...item,
        width: nextSize.width * nodeScale,
        height: nextSize.height * nodeScale,
      };
    }));

};

export const toggleCanvasAiOutputsExpandedImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'canvasAiExpandedOutputNodeIds' | 'canvasAiPromptEditingId' | 'getCanvasAiNodeDesignSizeForItem' | 'setCanvasAiExpandedOutputNodeIds' | 'updateCanvasItemsImmediate'>, canvasId: string) => {
  const { canvasAiExpandedOutputNodeIds, canvasAiPromptEditingId, getCanvasAiNodeDesignSizeForItem, setCanvasAiExpandedOutputNodeIds, updateCanvasItemsImmediate } = ctx;
    const wasExpanded = canvasAiExpandedOutputNodeIds.has(canvasId);
    updateCanvasItemsImmediate(prev => prev.map(item => {
      if (item.id !== canvasId || (!isCanvasAiGeneratorType(item.ai?.type) && item.ai?.type !== 'workflow')) return item;
      const promptExpanded = canvasAiPromptEditingId === item.id;
      const oldSize = getCanvasAiNodeDesignSizeForItem(item, promptExpanded, wasExpanded);
      const nextSize = getCanvasAiNodeDesignSizeForItem(item, promptExpanded, !wasExpanded);
      const nodeScale = getCanvasDesignScale(item, oldSize);
      return {
        ...item,
        width: nextSize.width * nodeScale,
        height: nextSize.height * nodeScale,
      };
    }));
    setCanvasAiExpandedOutputNodeIds(previous => {
      const next = new Set(previous);
      if (wasExpanded) next.delete(canvasId);
      else next.add(canvasId);
      return next;
    });

};

export const setCanvasWorkflowOutputModeImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'showToast' | 'updateCanvasItemsImmediate'>, canvasId: string, mode: 'final' | 'all') => {
  const { showToast, updateCanvasItemsImmediate } = ctx;
    updateCanvasItemsImmediate(prev => prev.map(item => {
      if (item.id !== canvasId || item.ai?.type !== 'workflow') return item;
      const workflow = getCanvasWorkflowTemplateFromNode(item);
      if (!workflow) return item;
      const currentOutputs = getCanvasAiOutputPreviewSlots(item);
      const nextItem: CanvasImageItem = {
        ...item,
        ai: {
          ...item.ai,
          workflowOutputMode: mode,
        },
      };
      const nextOutputs = getCanvasAiOutputPreviewSlots(nextItem);
      const getOutputAspectRatio = (outputs: CanvasAiGeneratedOutput[]) => (
        outputs[0]?.width && outputs[0]?.height
          ? `${outputs[0].width}:${outputs[0].height}`
          : item.ai?.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO
      );
      const currentSize = getCanvasAiNodeAutoSize({
        type: 'workflow',
        aspectRatio: getOutputAspectRatio(currentOutputs),
        outputCount: currentOutputs.length || undefined,
        hasError: !!item.ai?.error,
        showOutputPreview: true,
      });
      const nextSize = getCanvasAiNodeAutoSize({
        type: 'workflow',
        aspectRatio: getOutputAspectRatio(nextOutputs),
        outputCount: nextOutputs.length || undefined,
        hasError: !!item.ai?.error,
        showOutputPreview: true,
      });
      const currentScale = getCanvasDesignScale(item, currentSize);
      return {
        ...nextItem,
        width: nextSize.width * currentScale,
        height: nextSize.height * currentScale,
      };
    }));
    showToast(mode === 'all' ? '已显示工作流全部节点输出' : '已显示工作流最终输出');

};

export const applyCanvasImageFusionConnectionPatchImpl = (ctx: Record<never, never>, item: CanvasImageItem, sourceIds: string[], preferredRole?: CanvasImageFusionRole | null): CanvasImageItem => {
  const {  } = ctx;
    if (!isCanvasImageFusionAi(item.ai)) return item;
    const fusion = assignCanvasImageFusionInputs(
      item.ai?.imageFusion,
      item.inputs || [],
      sourceIds,
      preferredRole,
    );
    return {
      ...item,
      inputs: fusion.inputs,
      ai: item.ai ? {
        ...item.ai,
        imageFusion: fusion.config,
        sourceImageNodeId: fusion.config.baseNodeId,
        referenceImageNodeIds: fusion.config.styleNodeId ? [fusion.config.styleNodeId] : [],
        referenceRoles: fusion.referenceRoles,
      } : item.ai,
    };

};

export const replaceCanvasGeneratorReferenceImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'canReplaceCanvasImageReferenceForTarget' | 'canvasItemsRef' | 'pushCanvasUndoSnapshot' | 'setCanvasInputMenuForId' | 'setCanvasReferenceReplacement' | 'showToast' | 'updateCanvasItemsImmediate' | 'updateCanvasSelection'>, replacement: CanvasReferenceReplaceTarget, nextInputId: string, options: { pushUndo?: boolean } = {}) => {
  const { canReplaceCanvasImageReferenceForTarget, canvasItemsRef, pushCanvasUndoSnapshot, setCanvasInputMenuForId, setCanvasReferenceReplacement, showToast, updateCanvasItemsImmediate, updateCanvasSelection } = ctx;
    const target = canvasItemsRef.current.find(item => item.id === replacement.targetId);
    const source = canvasItemsRef.current.find(item => item.id === nextInputId);
    if (
      !target
      || !canReplaceCanvasImageReferenceForTarget(target)
      || !source
      || source.id === target.id
      || !canUseCanvasItemAsImageEnhancementInput(source)
    ) {
      showToast('请选择可用的图片素材或图片生成结果');
      return false;
    }
    const previousInputs = target.inputs || [];
    const nextInputs = replaceCanvasInputAt(previousInputs, replacement.inputId, nextInputId);
    if (nextInputs === previousInputs) {
      setCanvasReferenceReplacement(null);
      setCanvasInputMenuForId(null);
      updateCanvasSelection([target.id]);
      return true;
    }
    if (options.pushUndo !== false) pushCanvasUndoSnapshot('替换参考图');
    updateCanvasItemsImmediate(previous => previous.map(item => (
      item.id === target.id ? { ...item, inputs: nextInputs } : item
    )));
    setCanvasReferenceReplacement(null);
    setCanvasInputMenuForId(null);
    updateCanvasSelection([target.id]);
    showToast(`已替换参考图 ${replacement.inputIndex + 1}`);
    return true;

};

export const rotateCanvasImageClockwiseImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'canvasItemsRef' | 'growCanvasToFit' | 'pushCanvasUndoSnapshot' | 'updateCanvasItemsImmediate' | 'updateCanvasSelection'>, id: string) => {
  const { canvasItemsRef, growCanvasToFit, pushCanvasUndoSnapshot, updateCanvasItemsImmediate, updateCanvasSelection } = ctx;
    const current = canvasItemsRef.current.find(item => item.id === id);
    if (!current || current.item.type !== 'image') return;
    const rotated = rotateCanvasBoxQuarterTurn(current);
    const nextRotation = (((current.rotation || 0) + 90) % 360) as 0 | 90 | 180 | 270;
    const nextBox = {
      ...rotated,
      x: Math.max(0, rotated.x),
      y: Math.max(0, rotated.y),
    };
    pushCanvasUndoSnapshot('旋转图片');
    updateCanvasItemsImmediate(previous => previous.map(item => item.id === id ? {
      ...item,
      ...nextBox,
      rotation: nextRotation,
    } : item));
    growCanvasToFit(nextBox.x + nextBox.width, nextBox.y + nextBox.height);
    updateCanvasSelection([id]);

};

export const connectSelectedCanvasItemsToGeneratorImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'applyCanvasImageFusionConnectionPatch' | 'canReplaceCanvasImageReferenceForTarget' | 'canvasItemsRef' | 'canvasReferenceReplaceTargetRef' | 'canvasSelectedIdsRef' | 'getCanvasImageFusionPreferredRole' | 'pendingCanvasFusionRoleRef' | 'pushCanvasUndoSnapshot' | 'replaceCanvasGeneratorReference' | 'showToast' | 'updateCanvasItemsImmediate' | 'updateCanvasSelection'>, targetId: string) => {
  const { applyCanvasImageFusionConnectionPatch, canReplaceCanvasImageReferenceForTarget, canvasItemsRef, canvasReferenceReplaceTargetRef, canvasSelectedIdsRef, getCanvasImageFusionPreferredRole, pendingCanvasFusionRoleRef, pushCanvasUndoSnapshot, replaceCanvasGeneratorReference, showToast, updateCanvasItemsImmediate, updateCanvasSelection } = ctx;
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!target || !canUseCanvasItemAsAiTarget(target)) {
      showToast('目标节点不能接入输入');
      return;
    }
    const sourceIds = canvasSelectedIdsRef.current
      .filter(id => id !== targetId)
      .filter(id => {
        const source = canvasItemsRef.current.find(item => item.id === id);
        return isCanvasImageFusionAi(target.ai)
          ? canUseCanvasItemAsImageEnhancementInput(source)
          : canUseCanvasItemAsInputForTarget(source, target);
      });
    if (sourceIds.length === 0) {
      showToast('先多选要接入的图片或文字节点');
      return;
    }
    const referenceReplacement = canvasReferenceReplaceTargetRef.current;
    if (referenceReplacement?.targetId === targetId && canReplaceCanvasImageReferenceForTarget(target)) {
      const replacementSourceId = sourceIds.find(sourceId => (
        canUseCanvasItemAsImageEnhancementInput(canvasItemsRef.current.find(item => item.id === sourceId))
      ));
      if (!replacementSourceId) {
        showToast('已选节点中没有可用图片');
        return;
      }
      replaceCanvasGeneratorReference(referenceReplacement, replacementSourceId);
      return;
    }
    pushCanvasUndoSnapshot('连接 AI 输入');
    const preferredRole = getCanvasImageFusionPreferredRole(targetId);
    updateCanvasItemsImmediate(prev => prev.map(item => {
      if (item.id !== targetId) return item;
      if (isCanvasImageFusionAi(item.ai)) {
        return applyCanvasImageFusionConnectionPatch(item, sourceIds.slice(0, 2), preferredRole);
      }
      const nextInputs = Array.from(new Set([...(item.inputs || []), ...sourceIds]));
      return { ...item, inputs: nextInputs };
    }));
    pendingCanvasFusionRoleRef.current = null;
    updateCanvasSelection([targetId]);
    showToast(isCanvasImageFusionAi(target.ai)
      ? '已设置溶图输入槽位'
      : `已连接 ${sourceIds.length} 个输入到 ${getCanvasInputTargetLabel(target)}`);

};

export const connectCanvasItemsImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'applyCanvasImageFusionConnectionPatch' | 'canvasItemsRef' | 'getCanvasImageFusionPreferredRole' | 'pendingCanvasFusionRoleRef' | 'pushCanvasUndoSnapshot' | 'showToast' | 'updateCanvasItemsImmediate' | 'updateCanvasSelection'>, sourceId: string, targetId: string) => {
  const { applyCanvasImageFusionConnectionPatch, canvasItemsRef, getCanvasImageFusionPreferredRole, pendingCanvasFusionRoleRef, pushCanvasUndoSnapshot, showToast, updateCanvasItemsImmediate, updateCanvasSelection } = ctx;
    if (!sourceId || !targetId || sourceId === targetId) return false;
    const source = canvasItemsRef.current.find(item => item.id === sourceId);
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!source || !target || !canUseCanvasItemAsAiTarget(target) || !canUseCanvasItemAsInputForTarget(source, target)) return false;
    if (isCanvasImageFusionAi(target.ai) && !canUseCanvasItemAsImageEnhancementInput(source)) {
      showToast('溶图节点的基图和意向图都必须是图片素材或图片生成结果');
      return false;
    }
    const isSingleMediaInputTarget = target.ai?.type === 'frame-interpolation' || isCanvasAiEnhancementType(target.ai?.type);
    const isThreeSceneTarget = target.item.type === 'three-scene';
    const fusionPreferredRole = getCanvasImageFusionPreferredRole(targetId);
    if (!isCanvasImageFusionAi(target.ai) && (target.inputs || []).includes(sourceId)) {
      updateCanvasSelection([targetId]);
      return true;
    }
    pushCanvasUndoSnapshot('连接 AI 输入');
    updateCanvasItemsImmediate(prev => prev.map(item => {
      if (item.id !== targetId) return item;
      if (isCanvasImageFusionAi(item.ai)) {
        return applyCanvasImageFusionConnectionPatch(item, [sourceId], fusionPreferredRole);
      }
      const inputs = isSingleMediaInputTarget
        ? [sourceId]
        : Array.from(new Set([...(item.inputs || []), sourceId]));
      return { ...item, inputs: isThreeSceneTarget ? inputs.slice(0, 8) : inputs };
    }));
    pendingCanvasFusionRoleRef.current = null;
    updateCanvasSelection([targetId]);
    showToast(isCanvasImageFusionAi(target.ai)
      ? fusionPreferredRole === 'STYLE_REF' ? '已设置意向图' : fusionPreferredRole === 'BASE' ? '已设置基图' : '已连接到溶图节点'
      : `已连接到 ${getCanvasInputTargetLabel(target)}`);
    return true;

};

export const connectCanvasItemsToGeneratorImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'applyCanvasImageFusionConnectionPatch' | 'canvasItemsRef' | 'getCanvasImageFusionPreferredRole' | 'pendingCanvasFusionRoleRef' | 'pushCanvasUndoSnapshot' | 'showToast' | 'updateCanvasItemsImmediate' | 'updateCanvasSelection'>, sourceIds: string[], targetId: string) => {
  const { applyCanvasImageFusionConnectionPatch, canvasItemsRef, getCanvasImageFusionPreferredRole, pendingCanvasFusionRoleRef, pushCanvasUndoSnapshot, showToast, updateCanvasItemsImmediate, updateCanvasSelection } = ctx;
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!target || !canUseCanvasItemAsAiTarget(target)) return false;
    const validSourceIds = Array.from(new Set(sourceIds))
      .filter(sourceId => sourceId && sourceId !== targetId)
      .filter(sourceId => {
        const source = canvasItemsRef.current.find(item => item.id === sourceId);
        return isCanvasImageFusionAi(target.ai)
          ? canUseCanvasItemAsImageEnhancementInput(source)
          : canUseCanvasItemAsInputForTarget(source, target);
      });
    if (validSourceIds.length === 0) return false;

    const previousInputs = target.inputs || [];
    const isSingleMediaInputTarget = target.ai?.type === 'frame-interpolation' || isCanvasAiEnhancementType(target.ai?.type);
    const fusionPreferredRole = getCanvasImageFusionPreferredRole(targetId);
    const fusionPatch = isCanvasImageFusionAi(target.ai)
      ? applyCanvasImageFusionConnectionPatch(target, validSourceIds.slice(0, 2), fusionPreferredRole)
      : null;
    const mergedInputs = Array.from(new Set([...previousInputs, ...validSourceIds]));
    const nextInputs = fusionPatch?.inputs || (isSingleMediaInputTarget
      ? validSourceIds.slice(0, 1)
      : target.item.type === 'three-scene'
        ? mergedInputs.slice(0, 8)
        : mergedInputs);
    const inputsChanged = previousInputs.length !== nextInputs.length
      || previousInputs.some((inputId, index) => inputId !== nextInputs[index]);
    const addedCount = nextInputs.length - previousInputs.length;
    if (!inputsChanged) {
      pendingCanvasFusionRoleRef.current = null;
      updateCanvasSelection([targetId]);
      showToast(isCanvasImageFusionAi(target.ai) ? '两个溶图槽位均已设置，请点击对应槽位进行更换' : '这些输入已经连接过了');
      return true;
    }

    pushCanvasUndoSnapshot('连接 AI 输入');
    updateCanvasItemsImmediate(prev => prev.map(item => {
      if (item.id !== targetId) return item;
      return fusionPatch || { ...item, inputs: nextInputs };
    }));
    pendingCanvasFusionRoleRef.current = null;
    updateCanvasSelection([targetId]);
    showToast(isCanvasImageFusionAi(target.ai)
      ? '已设置溶图输入槽位'
      : isSingleMediaInputTarget ? '已更换输入素材' : `已连接 ${Math.max(1, addedCount)} 个输入到 ${getCanvasInputTargetLabel(target)}`);
    return true;

};

export const addCanvasAiGeneratorNodeForSourcesImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'appendCanvasItems' | 'buildCanvasAiGeneratorNode' | 'canvasItemsRef' | 'showToast' | 'updateCanvasSelection'>, sourceIds: string[], world: { x: number; y: number }) => {
  const { appendCanvasItems, buildCanvasAiGeneratorNode, canvasItemsRef, showToast, updateCanvasSelection } = ctx;
    const validSourceIds = Array.from(new Set(sourceIds))
      .filter(sourceId => {
        const source = canvasItemsRef.current.find(item => item.id === sourceId);
        return canUseCanvasItemAsAiInput(source);
      });
    if (validSourceIds.length === 0) return;
    const canvasItem = buildCanvasAiGeneratorNode({
      x: Math.max(24, world.x),
      y: Math.max(24, world.y),
    }, undefined, validSourceIds);
    if (appendCanvasItems([canvasItem], '新增 AI 生图节点') > 0) {
      updateCanvasSelection([canvasItem.id]);
      showToast(`已新建 AI 生图节点，并连接 ${validSourceIds.length} 个输入`);
    }

};

export const addCanvasAiVideoGeneratorNodeForSourcesImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'appendCanvasItems' | 'buildCanvasAiGeneratorNode' | 'canvasItemsRef' | 'showToast' | 'updateCanvasSelection'>, sourceIds: string[], world: { x: number; y: number }) => {
  const { appendCanvasItems, buildCanvasAiGeneratorNode, canvasItemsRef, showToast, updateCanvasSelection } = ctx;
    const validSourceIds = Array.from(new Set(sourceIds))
      .filter(sourceId => {
        const source = canvasItemsRef.current.find(item => item.id === sourceId);
        return canUseCanvasItemAsAiInput(source);
      });
    if (validSourceIds.length === 0) return;
    const canvasItem = buildCanvasAiGeneratorNode({
      x: Math.max(24, world.x),
      y: Math.max(24, world.y),
    }, undefined, validSourceIds, 'video');
    if (appendCanvasItems([canvasItem], '新增 AI 视频节点') > 0) {
      updateCanvasSelection([canvasItem.id]);
      showToast(`已新建 AI 视频节点，并连接 ${validSourceIds.length} 个输入`);
    }

};

export const addCanvasFrameInterpolationNodeForSourcesImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'appendCanvasItems' | 'buildCanvasFrameInterpolationNode' | 'canvasItemsRef' | 'showToast' | 'updateCanvasSelection'>, sourceIds: string[], world: { x: number; y: number }) => {
  const { appendCanvasItems, buildCanvasFrameInterpolationNode, canvasItemsRef, showToast, updateCanvasSelection } = ctx;
    const validSourceIds = Array.from(new Set(sourceIds))
      .filter(sourceId => {
        const source = canvasItemsRef.current.find(item => item.id === sourceId);
        return canUseCanvasItemAsFrameInterpolationVideoInput(source);
      })
      .slice(0, 1);
    if (validSourceIds.length === 0) {
      showToast('请先选择视频素材或视频生成结果');
      return;
    }
    const canvasItem = buildCanvasFrameInterpolationNode({
      x: Math.max(24, world.x),
      y: Math.max(24, world.y),
    }, validSourceIds);
    if (appendCanvasItems([canvasItem], '新增视频补帧节点') > 0) {
      updateCanvasSelection([canvasItem.id]);
      showToast('已新建视频补帧节点，并连接视频输入');
    }

};

export const addCanvasEnhancementNodeForSourcesImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'appendCanvasItems' | 'buildCanvasEnhancementNode' | 'canvasItemsRef' | 'showToast' | 'updateCanvasSelection'>, sourceIds: string[], mediaType: 'image' | 'video', world: { x: number; y: number }) => {
  const { appendCanvasItems, buildCanvasEnhancementNode, canvasItemsRef, showToast, updateCanvasSelection } = ctx;
    const validSourceIds = Array.from(new Set(sourceIds))
      .filter(sourceId => {
        const source = canvasItemsRef.current.find(item => item.id === sourceId);
        return mediaType === 'video'
          ? canUseCanvasItemAsVideoEnhancementInput(source)
          : canUseCanvasItemAsImageEnhancementInput(source);
      })
      .slice(0, 1);
    if (validSourceIds.length === 0) {
      showToast(mediaType === 'video' ? '请先选择视频素材或视频生成结果' : '请先选择图片素材或图片生成结果');
      return;
    }
    const canvasItem = buildCanvasEnhancementNode({
      x: Math.max(24, world.x),
      y: Math.max(24, world.y),
    }, mediaType, validSourceIds);
    const label = mediaType === 'video' ? '视频清晰度增强' : '图片清晰度增强';
    if (appendCanvasItems([canvasItem], `新增${label}节点`) > 0) {
      updateCanvasSelection([canvasItem.id]);
      showToast(`已新建${label}节点并连接素材`);
    }

};

export const addCanvasTextInputForGeneratorImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'canvasItemsRef' | 'createAssetId' | 'makeCanvasNodeId' | 'pushCanvasUndoSnapshot' | 'showToast' | 'updateCanvasItemsImmediate' | 'updateCanvasSelection'>, targetId: string, world: { x: number; y: number }) => {
  const { canvasItemsRef, createAssetId, makeCanvasNodeId, pushCanvasUndoSnapshot, showToast, updateCanvasItemsImmediate, updateCanvasSelection } = ctx;
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!target || !canUseCanvasItemAsAiTarget(target)) return;
    const item: BufferItem = {
      id: createAssetId(),
      type: 'text',
      content: '',
      name: '文字说明',
      createdAt: Date.now(),
      isQuickAccess: false,
    };
    const canvasItem: CanvasImageItem = {
      id: makeCanvasNodeId(item.id, 'text_input'),
      item,
      x: Math.max(24, world.x),
      y: Math.max(24, world.y),
      width: 420,
      height: 360,
    };
    pushCanvasUndoSnapshot('新增文字说明输入');
    updateCanvasItemsImmediate(prev => ([
      ...prev.map(current => (
        current.id === targetId
          ? { ...current, inputs: Array.from(new Set([...(current.inputs || []), canvasItem.id])) }
          : current
      )),
      canvasItem,
    ]));
    updateCanvasSelection([canvasItem.id]);
    showToast('已添加文字说明并连接到节点');

};

export const updateCollapsedCanvasWorkflowSlotImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'canvasItemsRef' | 'findCanvasWorkflowSlot' | 'pushCanvasUndoSnapshot' | 'updateCanvasItemsImmediate'>, moduleId: string, slotId: string, operation: (
      module: CanvasImageItem,
      slot: CanvasWorkflowInternalSlot,
    ) => CanvasImageItem, undoLabel: string = '更新工作流图片槽位') => {
  const { canvasItemsRef, findCanvasWorkflowSlot, pushCanvasUndoSnapshot, updateCanvasItemsImmediate } = ctx;
    const module = canvasItemsRef.current.find(item => item.id === moduleId);
    const slot = findCanvasWorkflowSlot(module, slotId);
    if (!module || !slot) return false;
    pushCanvasUndoSnapshot(undoLabel);
    updateCanvasItemsImmediate(prev => prev.map(item => (
      item.id === moduleId ? operation(item, slot) : item
    )));
    return true;

};

export const replaceExpandedCanvasWorkflowSlotImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'canvasItemsRef' | 'pushCanvasUndoSnapshot' | 'updateCanvasItemsImmediate'>, expandedNodeId: string, assets: CanvasWorkflowSlotAsset[]) => {
  const { canvasItemsRef, pushCanvasUndoSnapshot, updateCanvasItemsImmediate } = ctx;
    const expandedNode = canvasItemsRef.current.find(item => item.id === expandedNodeId);
    const group = getCanvasWorkflowGroup(expandedNode);
    const workflow = getCanvasWorkflowTemplateFromNode(group?.module);
    const templateNode = workflow?.nodes.find(node => node.id === group?.templateId);
    const slot = templateNode?.internalSlot;
    if (!expandedNode || !group || !slot || !isReplaceableInternalImageSlot(templateNode)) return false;
    const normalizedAssets = slot.multiple ? assets : assets.slice(0, 1);
    pushCanvasUndoSnapshot('替换工作流内部槽位');
    updateCanvasItemsImmediate(prev => prev.map(item => {
      const itemGroup = getCanvasWorkflowGroup(item);
      if (itemGroup?.groupId !== group.groupId) return item;
      const nextModule = replaceCanvasWorkflowInternalSlot({
        module: itemGroup.module,
        slot,
        assets: normalizedAssets,
      });
      if (item.id !== expandedNodeId) {
        return {
          ...item,
          workflowGroup: {
            ...itemGroup,
            module: nextModule,
          },
        };
      }
      return {
        ...item,
        item: applyCanvasWorkflowSlotAssetToItem(item.item, normalizedAssets[0]),
        workflowSlotAssets: normalizedAssets,
        workflowGroup: {
          ...itemGroup,
          module: nextModule,
        },
      };
    }));
    return true;

};

export const replaceCanvasWorkflowSlotAssetsImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'replaceExpandedCanvasWorkflowSlot' | 'showToast' | 'updateCollapsedCanvasWorkflowSlot'>, moduleId: string, slotId: string, assets: CanvasWorkflowSlotAsset[], expandedNodeId?: string) => {
  const { replaceExpandedCanvasWorkflowSlot, showToast, updateCollapsedCanvasWorkflowSlot } = ctx;
    const changed = expandedNodeId
      ? replaceExpandedCanvasWorkflowSlot(expandedNodeId, assets)
      : updateCollapsedCanvasWorkflowSlot(
          moduleId,
          slotId,
          (module, slot) => replaceCanvasWorkflowInternalSlot({ module, slot, assets }),
          '替换工作流内部槽位',
        );
    if (changed) showToast(assets.length > 0 ? '槽位图片已更新' : '槽位已清空');
    return changed;

};

export const getCanvasWorkflowSlotAssetFromCanvasItemImpl = (ctx: Record<never, never>, canvasItem?: CanvasImageItem | null): CanvasWorkflowSlotAsset | null => {
  const {  } = ctx;
    if (!canvasItem) return null;
    if (canvasItem.item.type === 'image') {
      return createCanvasWorkflowSlotAssetFromItem(canvasItem.item);
    }
    const output = getCanvasAiSuccessfulOutputs(canvasItem)
      .find(candidate => (candidate.mediaType || getCanvasAiMediaType(canvasItem.ai)) === 'image');
    if (!output) return null;
    const bufferItem = createCanvasAiOutputBufferItem(canvasItem, output, 0);
    return bufferItem ? createCanvasWorkflowSlotAssetFromItem(bufferItem) : null;

};

export const getSelectedCanvasWorkflowSlotAssetsImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'canvasItemsRef' | 'canvasSelectedIdsRef' | 'getCanvasWorkflowSlotAssetFromCanvasItem' | 'itemsRef' | 'selectedIds'>, excludeId?: string) => {
  const { canvasItemsRef, canvasSelectedIdsRef, getCanvasWorkflowSlotAssetFromCanvasItem, itemsRef, selectedIds } = ctx;
    const canvasAssets = canvasSelectedIdsRef.current
      .filter(id => id !== excludeId)
      .map(id => getCanvasWorkflowSlotAssetFromCanvasItem(canvasItemsRef.current.find(item => item.id === id)))
      .filter((asset): asset is CanvasWorkflowSlotAsset => !!asset);
    if (canvasAssets.length > 0) return canvasAssets;
    return selectedIds
      .map(id => itemsRef.current.find(item => item.id === id))
      .filter((item): item is BufferItem => !!item && item.type === 'image')
      .map(item => createCanvasWorkflowSlotAssetFromItem(item))
      .filter((asset): asset is CanvasWorkflowSlotAsset => !!asset);

};

export const assignSelectedImagesToCanvasWorkflowSlotImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'canvasItemsRef' | 'findCanvasWorkflowSlot' | 'getSelectedCanvasWorkflowSlotAssets' | 'replaceCanvasWorkflowSlotAssets' | 'searchInputRef' | 'setCanvasSearchCandidateLimit' | 'setCanvasWorkflowSlotPickTarget' | 'setIsSearchActive' | 'showToast'>, moduleId: string, slotId: string, expandedNodeId?: string) => {
  const { canvasItemsRef, findCanvasWorkflowSlot, getSelectedCanvasWorkflowSlotAssets, replaceCanvasWorkflowSlotAssets, searchInputRef, setCanvasSearchCandidateLimit, setCanvasWorkflowSlotPickTarget, setIsSearchActive, showToast } = ctx;
    const module = expandedNodeId
      ? getCanvasWorkflowGroup(canvasItemsRef.current.find(item => item.id === expandedNodeId))?.module
      : canvasItemsRef.current.find(item => item.id === moduleId);
    const slot = findCanvasWorkflowSlot(module, slotId);
    const assets = getSelectedCanvasWorkflowSlotAssets(expandedNodeId || moduleId);
    if (!slot) return;
    if (assets.length === 0) {
      setCanvasWorkflowSlotPickTarget({
        moduleId,
        slotId,
        label: slot.label,
        expandedNodeId,
      });
      setIsSearchActive(true);
      setCanvasSearchCandidateLimit(CANVAS_SEARCH_CANDIDATE_LIMIT);
      window.setTimeout(() => searchInputRef.current?.focus(), 80);
      showToast(`请搜索并点击要设置到「${slot.label}」的图片`);
      return;
    }
    const existing = getCanvasWorkflowInternalSlotBinding(module?.ai?.workflowRuntime, slot).assets;
    replaceCanvasWorkflowSlotAssets(
      moduleId,
      slotId,
      slot.multiple ? [...existing, ...assets] : assets.slice(0, 1),
      expandedNodeId,
    );

};

export const assignDrawerImageToCanvasWorkflowSlotImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'canvasItemsRef' | 'findCanvasWorkflowSlot' | 'replaceCanvasWorkflowSlotAssets' | 'setCanvasWorkflowSlotPickTarget' | 'showToast'>, target: { moduleId: string; slotId: string; label: string; expandedNodeId?: string }, item: BufferItem) => {
  const { canvasItemsRef, findCanvasWorkflowSlot, replaceCanvasWorkflowSlotAssets, setCanvasWorkflowSlotPickTarget, showToast } = ctx;
    if (item.type !== 'image') {
      showToast('内部图片槽位只支持图片');
      return false;
    }
    const module = target.expandedNodeId
      ? getCanvasWorkflowGroup(canvasItemsRef.current.find(candidate => candidate.id === target.expandedNodeId))?.module
      : canvasItemsRef.current.find(candidate => candidate.id === target.moduleId);
    const slot = findCanvasWorkflowSlot(module, target.slotId);
    const nextAsset = createCanvasWorkflowSlotAssetFromItem(item);
    if (!slot || !nextAsset) return false;
    const existing = getCanvasWorkflowInternalSlotBinding(module?.ai?.workflowRuntime, slot).assets;
    const assets = slot.multiple ? [...existing, nextAsset] : [nextAsset];
    const changed = replaceCanvasWorkflowSlotAssets(
      target.moduleId,
      target.slotId,
      assets,
      target.expandedNodeId,
    );
    if (!slot.multiple || assets.length >= Math.max(1, Number(slot.maxItems) || 12)) {
      setCanvasWorkflowSlotPickTarget(null);
    }
    return changed;

};

export const handleCanvasWorkflowSlotDropImpl = async (ctx: Pick<canvasWorkflowEditorActionContext, 'canvasItemsRef' | 'clearDrawerItemDragState' | 'createCanvasImageItemFromFile' | 'findCanvasWorkflowSlot' | 'getDraggedDrawerItemId' | 'itemsRef' | 'replaceCanvasWorkflowSlotAssets' | 'showToast'>, event: React.DragEvent<HTMLElement>, moduleId: string, slotId: string, expandedNodeId?: string) => {
  const { canvasItemsRef, clearDrawerItemDragState, createCanvasImageItemFromFile, findCanvasWorkflowSlot, getDraggedDrawerItemId, itemsRef, replaceCanvasWorkflowSlotAssets, showToast } = ctx;
    event.preventDefault();
    event.stopPropagation();
    const drawerItemId = getDraggedDrawerItemId(event.dataTransfer);
    const drawerItem = itemsRef.current.find(item => item.id === drawerItemId && item.type === 'image');
    if (drawerItem) {
      const asset = createCanvasWorkflowSlotAssetFromItem(drawerItem);
      if (asset) {
        const module = expandedNodeId
          ? getCanvasWorkflowGroup(canvasItemsRef.current.find(item => item.id === expandedNodeId))?.module
          : canvasItemsRef.current.find(item => item.id === moduleId);
        const slot = findCanvasWorkflowSlot(module, slotId);
        const existing = slot ? getCanvasWorkflowInternalSlotBinding(module?.ai?.workflowRuntime, slot).assets : [];
        replaceCanvasWorkflowSlotAssets(
          moduleId,
          slotId,
          slot?.multiple ? [...existing, asset] : [asset],
          expandedNodeId,
        );
        clearDrawerItemDragState();
        return;
      }
    }
    const imageFile = getImageFileFromDataTransfer(event.dataTransfer);
    if (imageFile && imageFile.size > 0) {
      const imageItem = await createCanvasImageItemFromFile(imageFile, 0);
      const asset = imageItem ? createCanvasWorkflowSlotAssetFromItem(imageItem.item) : null;
      if (asset) {
        const module = expandedNodeId
          ? getCanvasWorkflowGroup(canvasItemsRef.current.find(item => item.id === expandedNodeId))?.module
          : canvasItemsRef.current.find(item => item.id === moduleId);
        const slot = findCanvasWorkflowSlot(module, slotId);
        const existing = slot ? getCanvasWorkflowInternalSlotBinding(module?.ai?.workflowRuntime, slot).assets : [];
        replaceCanvasWorkflowSlotAssets(
          moduleId,
          slotId,
          slot?.multiple ? [...existing, asset] : [asset],
          expandedNodeId,
        );
      }
      return;
    }
    showToast('请拖入灵感库图片或本地图片');

};

export const chooseLocalImagesForCanvasGeneratorImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'canReplaceCanvasImageReferenceForTarget' | 'canvasItemsRef' | 'canvasReferenceReplaceTargetRef' | 'canvasUploadInputRef' | 'chooseLocalVideosForCanvasGenerator' | 'pendingCanvasFusionRoleRef' | 'pendingCanvasFusionUploadRoleRef' | 'pendingCanvasReferenceUploadReplaceRef' | 'pendingCanvasUploadTargetIdRef' | 'setCanvasInputMenuForId'>, targetId: string) => {
  const { canReplaceCanvasImageReferenceForTarget, canvasItemsRef, canvasReferenceReplaceTargetRef, canvasUploadInputRef, chooseLocalVideosForCanvasGenerator, pendingCanvasFusionRoleRef, pendingCanvasFusionUploadRoleRef, pendingCanvasReferenceUploadReplaceRef, pendingCanvasUploadTargetIdRef, setCanvasInputMenuForId } = ctx;
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (target?.ai?.type === 'frame-interpolation' || target?.ai?.type === 'video-enhancement') {
      void chooseLocalVideosForCanvasGenerator(targetId);
      return;
    }
    const pendingFusionRole = pendingCanvasFusionRoleRef.current;
    pendingCanvasFusionUploadRoleRef.current = pendingFusionRole?.targetId === targetId
      ? pendingFusionRole
      : null;
    const referenceReplacement = canvasReferenceReplaceTargetRef.current;
    pendingCanvasReferenceUploadReplaceRef.current = referenceReplacement?.targetId === targetId
      && canReplaceCanvasImageReferenceForTarget(target)
      ? referenceReplacement
      : null;
    pendingCanvasFusionRoleRef.current = null;
    pendingCanvasUploadTargetIdRef.current = targetId;
    setCanvasInputMenuForId(null);
    canvasUploadInputRef.current?.click();

};

export const handleCanvasGeneratorUploadImpl = async (ctx: Pick<canvasWorkflowEditorActionContext, 'appendCanvasItems' | 'canvasItemsRef' | 'connectCanvasItemsToGenerator' | 'createCanvasImageItemFromFile' | 'findCanvasWorkflowSlot' | 'pendingCanvasFusionRoleRef' | 'pendingCanvasFusionUploadRoleRef' | 'pendingCanvasReferenceUploadReplaceRef' | 'pendingCanvasUploadTargetIdRef' | 'pendingCanvasWorkflowSlotUploadRef' | 'replaceCanvasGeneratorReference' | 'replaceCanvasWorkflowSlotAssets' | 'showToast'>, event: React.ChangeEvent<HTMLInputElement>) => {
  const { appendCanvasItems, canvasItemsRef, connectCanvasItemsToGenerator, createCanvasImageItemFromFile, findCanvasWorkflowSlot, pendingCanvasFusionRoleRef, pendingCanvasFusionUploadRoleRef, pendingCanvasReferenceUploadReplaceRef, pendingCanvasUploadTargetIdRef, pendingCanvasWorkflowSlotUploadRef, replaceCanvasGeneratorReference, replaceCanvasWorkflowSlotAssets, showToast } = ctx;
    const slotTarget = pendingCanvasWorkflowSlotUploadRef.current;
    pendingCanvasWorkflowSlotUploadRef.current = null;
    const targetId = pendingCanvasUploadTargetIdRef.current;
    pendingCanvasUploadTargetIdRef.current = null;
    const fusionUploadRole = pendingCanvasFusionUploadRoleRef.current;
    pendingCanvasFusionUploadRoleRef.current = null;
    const referenceUploadReplacement = pendingCanvasReferenceUploadReplaceRef.current;
    pendingCanvasReferenceUploadReplaceRef.current = null;
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (slotTarget) {
      const imageFiles = files.filter(file => file.type.startsWith('image/') || isCanvasImageFileName(file.name));
      if (imageFiles.length === 0) {
        showToast('请选择图片文件');
        return;
      }
      const module = slotTarget.expandedNodeId
        ? getCanvasWorkflowGroup(canvasItemsRef.current.find(item => item.id === slotTarget.expandedNodeId))?.module
        : canvasItemsRef.current.find(item => item.id === slotTarget.moduleId);
      const slot = findCanvasWorkflowSlot(module, slotTarget.slotId);
      const selectedFiles = slot?.multiple
        ? imageFiles.slice(0, Math.max(1, Number(slot.maxItems) || 12))
        : imageFiles.slice(0, 1);
      const created = await Promise.all(selectedFiles.map((file, index) => createCanvasImageItemFromFile(file, index)));
      const assets = created
        .map(item => item ? createCanvasWorkflowSlotAssetFromItem(item.item) : null)
        .filter((asset): asset is CanvasWorkflowSlotAsset => !!asset);
      if (assets.length === 0) {
        showToast('图片读取失败');
        return;
      }
      const existing = slot
        ? getCanvasWorkflowInternalSlotBinding(module?.ai?.workflowRuntime, slot).assets
        : [];
      replaceCanvasWorkflowSlotAssets(
        slotTarget.moduleId,
        slotTarget.slotId,
        slot?.multiple ? [...existing, ...assets] : assets,
        slotTarget.expandedNodeId,
      );
      return;
    }
    if (!targetId || files.length === 0) return;

    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!target || !canUseCanvasItemAsAiTarget(target)) return;

    const imageFiles = files.filter(file => file.type.startsWith('image/') || isCanvasImageFileName(file.name));
    if (imageFiles.length === 0) {
      showToast('请选择图片文件');
      return;
    }

    const selectedImageFiles = referenceUploadReplacement?.targetId === targetId
      ? imageFiles.slice(0, 1)
      : isCanvasImageFusionAi(target.ai)
      ? imageFiles.slice(0, fusionUploadRole?.targetId === targetId ? 1 : 2)
      : target.item.type === 'three-scene'
        ? imageFiles.slice(0, Math.max(0, 8 - (target.inputs || []).length))
        : imageFiles;
    if (selectedImageFiles.length === 0) {
      showToast('3D 场景节点最多添加 8 张参考图');
      return;
    }
    const created = await Promise.all(selectedImageFiles.map((file, index) => createCanvasImageItemFromFile(file, index)));
    const images = created.filter((item): item is CanvasImageItem => !!item).map((item, index) => ({
      ...item,
      x: Math.max(24, target.x - item.width - 72 - (index % 2) * 22),
      y: Math.max(24, target.y + index * 42),
    }));
    if (images.length === 0) {
      showToast('图片读取失败');
      return;
    }

    const addedCount = appendCanvasItems(images, '添加 AI 输入图片', false);
    if (addedCount <= 0) return;
    if (fusionUploadRole?.targetId === targetId) {
      pendingCanvasFusionRoleRef.current = fusionUploadRole;
    }
    if (referenceUploadReplacement?.targetId === targetId) {
      replaceCanvasGeneratorReference(referenceUploadReplacement, images[0].id, { pushUndo: false });
      return;
    }
    connectCanvasItemsToGenerator(images.map(item => item.id), targetId);

};

export const chooseLocalFilesForCanvasWorkflowImpl = (ctx: Pick<canvasWorkflowEditorActionContext, 'canvasItemsRef' | 'canvasWorkflowFileInputRef' | 'pendingCanvasWorkflowFileTargetIdRef' | 'setCanvasInputMenuForId' | 'showToast'>, targetId: string) => {
  const { canvasItemsRef, canvasWorkflowFileInputRef, pendingCanvasWorkflowFileTargetIdRef, setCanvasInputMenuForId, showToast } = ctx;
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    const workflow = getCanvasWorkflowTemplateFromNode(target);
    if (!target || target.ai?.type !== 'workflow' || !normalizeCanvasWorkflowUserInput(workflow?.userInput).acceptFiles) {
      showToast('这个工作流未启用文件输入');
      return;
    }
    pendingCanvasWorkflowFileTargetIdRef.current = targetId;
    setCanvasInputMenuForId(null);
    canvasWorkflowFileInputRef.current?.click();

};

export const handleCanvasWorkflowFileUploadImpl = async (ctx: Pick<canvasWorkflowEditorActionContext, 'appendCanvasItems' | 'canvasItemsRef' | 'connectCanvasItemsToGenerator' | 'createAssetId' | 'makeCanvasNodeId' | 'pendingCanvasWorkflowFileTargetIdRef'>, event: React.ChangeEvent<HTMLInputElement>) => {
  const { appendCanvasItems, canvasItemsRef, connectCanvasItemsToGenerator, createAssetId, makeCanvasNodeId, pendingCanvasWorkflowFileTargetIdRef } = ctx;
    const targetId = pendingCanvasWorkflowFileTargetIdRef.current;
    pendingCanvasWorkflowFileTargetIdRef.current = null;
    const files = Array.from(event.target.files || []).slice(0, 6);
    event.target.value = '';
    if (!targetId || files.length === 0) return;

    const target = canvasItemsRef.current.find(item => item.id === targetId);
    const workflow = getCanvasWorkflowTemplateFromNode(target);
    if (!target || target.ai?.type !== 'workflow' || !normalizeCanvasWorkflowUserInput(workflow?.userInput).acceptFiles) return;

    const perFileTextLimit = Math.max(2_000, Math.floor(16_000 / files.length));
    const created = await Promise.all(files.map(async (file, index): Promise<CanvasImageItem> => {
      let extractedText = '';
      if (isCanvasWorkflowReadableTextFileName(file.name)) {
        try {
          const byteLimit = perFileTextLimit * 4;
          const rawText = await file.slice(0, byteLimit).text();
          const wasTruncated = file.size > byteLimit || rawText.length > perFileTextLimit;
          extractedText = rawText.trim().slice(0, perFileTextLimit);
          if (wasTruncated && extractedText) extractedText += '\n\n[文件内容已截断]';
        } catch (error) {
          console.warn('读取工作流文字附件失败:', error);
        }
      }
      const localPath = (file as File & { path?: string }).path;
      const metadata = [
        `文件：${file.name}`,
        file.type ? `类型：${file.type}` : '',
        extractedText ? `内容：\n${extractedText}` : '正文未解析；仅提供文件名称和类型。',
      ].filter(Boolean).join('\n');
      const itemId = createAssetId();
      return {
        id: makeCanvasNodeId(itemId, 'file_input'),
        item: {
          id: itemId,
          type: 'file',
          content: metadata,
          name: file.name,
          path: localPath,
          fileSize: file.size,
          modifiedAt: file.lastModified,
          createdAt: Date.now() + index,
          isQuickAccess: false,
        },
        x: Math.max(24, target.x - 440 - (index % 2) * 24),
        y: Math.max(24, target.y + index * 52),
        width: 360,
        height: 180,
      };
    }));

    if (appendCanvasItems(created, '添加 Workflow 输入文件', false) <= 0) return;
    connectCanvasItemsToGenerator(created.map(item => item.id), targetId);

};

export const chooseLocalVideosForCanvasGeneratorImpl = async (ctx: Pick<canvasWorkflowEditorActionContext, 'appendCanvasItems' | 'canvasItemsRef' | 'connectCanvasItemsToGenerator' | 'createCanvasVideoItemFromPath' | 'showToast'>, targetId: string) => {
  const { appendCanvasItems, canvasItemsRef, connectCanvasItemsToGenerator, createCanvasVideoItemFromPath, showToast } = ctx;
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!target || !canUseCanvasItemAsAiTarget(target)) return;
    if (
      target.ai?.type !== 'frame-interpolation'
      && target.ai?.type !== 'video-enhancement'
      && (target.ai?.type !== 'video-generator' || target.ai?.videoInputMode === 'FLF')
    ) {
      showToast('只有视频节点的参考图模式支持参考视频');
      return;
    }

    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'] }],
        title: '选择参考视频',
      });
      const paths = (Array.isArray(selected) ? selected : selected ? [selected] : [])
        .filter((value): value is string => typeof value === 'string' && !!value);
      if (paths.length === 0) return;

      const activeCandidate = target.ai?.providerCandidates?.find(candidate => (
        candidate.provider === target.ai?.provider
        && (candidate.providerChannelId || '') === (target.ai?.providerChannelId || '')
      )) || target.ai?.providerCandidates?.find(candidate => candidate.provider === target.ai?.provider)
        || target.ai?.providerCandidates?.[0];
      const structuredCapabilities = activeCandidate?.modelCapabilities;
      const maxVideoReferences = target.ai?.type === 'video-generator'
        ? structuredCapabilities?.supportsReferenceVideo === false
          ? 0
          : structuredCapabilities?.maxReferenceVideos !== undefined
          ? Number(structuredCapabilities.maxReferenceVideos)
          : isSeedanceLikeVideoModel(target.ai.model) ? 3 : 1
        : 1;
      const created = await Promise.all(paths.slice(0, maxVideoReferences).map((path, index) => createCanvasVideoItemFromPath(path, index)));
      const videos = created.filter((item): item is CanvasImageItem => !!item).map((item, index) => ({
        ...item,
        x: Math.max(24, target.x - item.width - 72 - (index % 2) * 22),
        y: Math.max(24, target.y + 120 + index * 42),
      }));
      if (videos.length === 0) {
        showToast('视频读取失败');
        return;
      }

      const addedCount = appendCanvasItems(videos, '添加 AI 参考视频', false);
      if (addedCount <= 0) return;
      connectCanvasItemsToGenerator(videos.map(item => item.id), targetId);
    } catch (err) {
      console.warn('添加 AI 参考视频失败:', err);
      showToast('添加参考视频失败');
    }

};
