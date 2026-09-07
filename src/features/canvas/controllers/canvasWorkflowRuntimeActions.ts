import { convertFileSrc,invoke } from '@tauri-apps/api/core';
import React from 'react';
import { getAssetById } from '../../../services/assetsApi';
import { DEFAULT_CANVAS_ID } from '../../../services/canvasApi';
import { normalizeCanvasWorkflowTemplate } from '../../../services/canvasTemplateStorage';
import { BufferItem,Folder } from '../../../types';
import type { CanvasAiPromptPreset,CanvasWorkflowRunStatus } from '../../../types/canvasWorkflow';
import { readImageDisplaySize } from '../../../utils/canvasImageSize';
import { canUseCanvasItemAsWorkflowMaterial,getCanvasAiOutputDisplaySource,getCanvasAiOutputThumbnailSource,getCanvasAiSuccessfulOutputs,getCanvasItemDisplaySource,getCanvasWorkflowTemplateFromNode,hasCanvasAiGeneratedResults,isCanvasAgentTextTarget } from '../../../utils/canvasItemSelectors';
import { cloneDrawerValue } from '../../../utils/canvasSerialization';
import { validateCanvasWorkflowTemplate } from '../../../utils/canvasWorkflowDefinitions';
import { applyCanvasWorkflowRuntimeSnapshots,createCanvasWorkflowOutputDrafts,createCanvasWorkflowRuntimeValue,getCanvasExpandedWorkflowDownstreamGeneratorIds,getCanvasWorkflowGroup,getCanvasWorkflowOutputLabel,getCanvasWorkflowOutputSlotTemplates,normalizeCanvasWorkflowRuntimeSnapshots,sortCanvasWorkflowRuntimeNodeIds } from '../../../utils/canvasWorkflowRuntime';
import { isCanvasImageFileName,isCanvasTemplateJsonFileName,isCanvasVideoFileName,normalizeLocalDragPath } from '../../../utils/localMediaPaths';
import { type WorkflowResultCardData,type WorkflowResultMedia,type WorkflowResultReference } from '../../agentModel';
import { isCanvasAiImageOutputReadyForWorkflowDependency,recoverCanvasAiNodeWithUsableResults } from '../../canvasAiOutputs';
import { claimCanvasAiRun,createCanvasAiClientRequestId,releaseCanvasAiRun } from '../../canvasAiRunGuard';
import { getCanvasDrawerMediaPreviewSource,getCanvasDrawerMediaSource,isCanvasDrawerMediaItem } from '../../canvasDrawerMedia';
import { CANVAS_GROW_CHUNK,type CanvasAiGeneratedOutput,type CanvasImageItem,type CanvasWorkflowRuntime } from '../../canvasModel';
import { type CanvasWorkflowNodeTemplate,type CanvasWorkflowTemplate } from '../../canvasTemplates';
import { applyCanvasWorkflowInternalSlotBindings,collectCanvasWorkflowInternalSlotBindings,getMissingCanvasWorkflowInternalSlots,normalizeCanvasWorkflowRuntime } from '../../canvasWorkflowInternalSlots';
import { getCanvasAiRetryNodeStatus,mergeCanvasAiRetryOutputSlot } from '../../canvasWorkflowOutputRetry';
import { injectCanvasWorkflowUserInputContext,normalizeCanvasWorkflowUserInput,selectCanvasWorkflowUserInputTargetIds,type CanvasWorkflowUserInputConfig } from '../../canvasWorkflowUserInput';
import { setCanvasChatVisibility } from '../../chat/runtime/canvasChatVisibility';
import { requestCanvasWorkflowConversation } from '../../chat/runtime/canvasWorkflowProgress';
import { buildWorkflowResultCardData } from '../../workflowResult';
import { INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS,INDUSTRIAL_DESIGN_FULL_PROCESS_WORKFLOW_ID,buildIndustrialDesignLocalInspirationContext,buildIndustrialDesignRuntimeContextText,shouldTolerateIndustrialDesignDependencyFailure,type IndustrialDesignLocalInspirationContext } from '../../workflows/industrialDesignFullProcessWorkflow';

type canvasWorkflowRuntimeActionContext = { canvasSurfaceRef: React.RefObject<HTMLDivElement | null>; isCanvasZoomingRef: React.RefObject<boolean>; canvasScaleRef: React.RefObject<number>; canvasSizeRef: React.RefObject<{ width: number; height: number; }>; width: number; height: number; setCanvasSizeImmediate: (nextSize: { width: number; height: number; }) => void; scheduleCanvasStateSave: (options?: { syncNodes?: boolean; }) => void; activeCanvasIdRef: React.RefObject<string>; canvasItemsRef: React.RefObject<CanvasImageItem[]>; canvasSessionItemsRef: React.RefObject<Map<string, CanvasImageItem[]>>; getCanvasSessionItems: (canvasId: string) => CanvasImageItem[]; updateCanvasAiGeneratorDataForCanvas: (targetCanvasId: string, nodeId: string, patch: Partial<NonNullable<CanvasImageItem["ai"]>>, content?: string) => CanvasImageItem | undefined; getCanvasWorkflowExpandedGroupItems: (groupId: string, sourceItems?: CanvasImageItem[]) => CanvasImageItem[]; showToast: (message: string) => void; getCanvasWorkflowGroupItemIdsForSelection: (groupId: string, sourceItems?: CanvasImageItem[]) => string[]; pushCanvasUndoSnapshot: (label: string, options?: { layoutOnly?: boolean; shareImmutableItems?: boolean; }) => void; updateCanvasItemsImmediate: (updater: (prev: CanvasImageItem[]) => CanvasImageItem[]) => CanvasImageItem[]; updateCanvasSelection: (ids: string[]) => void; markCanvasRunNodeActive: (canvasId: string, nodeId: string) => void; runCanvasTextAgentTarget: (target: CanvasImageItem, options: { sourceItems?: () => CanvasImageItem[]; updateTextOutput: (output: string) => void; getLatestTarget?: () => CanvasImageItem | undefined; showResultToast?: boolean; showReferenceToast?: boolean; }) => Promise<string>; updateCanvasNodeForCanvas: (targetCanvasId: string, nodeId: string, updater: (item: CanvasImageItem) => CanvasImageItem) => CanvasImageItem | undefined; runCanvasAiGeneratorTarget: (target: CanvasImageItem, options: { canvasId?: string; sourceItems?: () => CanvasImageItem[]; updateAi: (patch: Partial<NonNullable<CanvasImageItem["ai"]>>, content?: string) => void; forceUpdateAi?: (patch: Partial<NonNullable<CanvasImageItem["ai"]>>, content?: string) => void; getLatestTarget?: () => CanvasImageItem | undefined; selectTarget?: () => void; showResultToast?: boolean; toastLabel?: string; clientRequestId?: string; requireLocalImageOutputs?: boolean; }) => Promise<CanvasAiGeneratedOutput[]>; waitForCanvasBackgroundPatches: (canvasId: string) => Promise<void>; markCanvasRunNodeSettled: (canvasId: string, nodeId: string) => void; notifyCanvasAiGenerationResult: (options: { status: "success" | "partial" | "error"; label: string; mediaType: "image" | "video"; generatedCount?: number; requestedCount?: number; error?: string; }) => void; createCanvasAiOutputDrafts: (target: CanvasImageItem, prompt: string, clientRequestId?: string) => CanvasAiGeneratedOutput[]; canvasAiRunTokensRef: React.RefObject<Map<string, string>>; applyCanvasAiGeneratorDataPatch: (item: CanvasImageItem, patch: Partial<NonNullable<CanvasImageItem["ai"]>>, content?: string) => CanvasImageItem; commitCanvasAiPromptDraft: (canvasId: string, content?: string, sync?: boolean) => void; instantiateCanvasWorkflowTemplateItems: (workflow: CanvasWorkflowTemplate, base: { x: number; y: number; }, externalInputIds?: string[]) => { workflow: null; items: CanvasImageItem[]; idMap: Map<string, string>; } | { workflow: CanvasWorkflowTemplate; items: CanvasImageItem[]; idMap: Map<string, string>; }; items: CanvasImageItem[]; idMap: Map<string, string>; hydrateCanvasWorkflowSlotAssetsFromDrawer: (runtimeItems: CanvasImageItem[]) => CanvasImageItem[]; retryCanvasCollapsedWorkflowOutput: (moduleId: string, visibleOutputIndex: number) => Promise<boolean>; retryCanvasExpandedWorkflowOutput: (targetId: string, outputIndex: number) => Promise<boolean>; getCanvasAiRerunNodePosition: (source: CanvasImageItem) => { x: number; y: number; }; buildCanvasWorkflowModuleNode: (workflow: CanvasWorkflowTemplate, pos: { x: number; y: number; }, inputIds?: string[]) => CanvasImageItem | null; workflowResultPublisherRef: React.RefObject<(result: WorkflowResultCardData) => void>; itemsRef: React.RefObject<BufferItem[]>; foldersRef: React.RefObject<Folder[]>; getCanvasAiErrorSummary: (error?: string | null) => string; isCanvasModeRef: React.RefObject<boolean>; runCanvasWorkflowModuleNode: (targetId: string) => Promise<WorkflowResultCardData | undefined>; cloneCanvasWorkflowModuleForRerun: (source: CanvasImageItem) => CanvasImageItem | null; appendCanvasItems: (nextItems: CanvasImageItem[], label: string, select?: boolean) => number; canvasSelectedIdsRef: React.RefObject<string[]>; generateCanvasWorkflowModuleNode: (targetId: string) => Promise<void>; getCanvasTemplateImportPayload: (rawValue: unknown) => { presets: CanvasAiPromptPreset[]; workflows: { builtin: boolean; id: string; label: string; hint: string; nodes: CanvasWorkflowNodeTemplate[]; userInput?: CanvasWorkflowUserInputConfig; createdAt?: number; }[]; workflowInstances: { workflow: { builtin: boolean; id: string; label: string; hint: string; nodes: CanvasWorkflowNodeTemplate[]; userInput?: CanvasWorkflowUserInputConfig; createdAt?: number; }; runtime: CanvasWorkflowRuntime; }[]; }; presets: CanvasAiPromptPreset[]; workflows: { builtin: boolean; id: string; label: string; hint: string; nodes: CanvasWorkflowNodeTemplate[]; userInput?: CanvasWorkflowUserInputConfig; createdAt?: number; }[]; canvasWorkflowTemplates: CanvasWorkflowTemplate[]; materializeImportedCanvasWorkflows: (workflows: CanvasWorkflowTemplate[]) => Promise<CanvasWorkflowTemplate[]>; setCustomCanvasAiPromptPresets: React.Dispatch<React.SetStateAction<CanvasAiPromptPreset[]>>; updateCanvasNodesForPreset: (preset: CanvasAiPromptPreset) => void; setCustomCanvasWorkflows: React.Dispatch<React.SetStateAction<CanvasWorkflowTemplate[]>>; getSelectedCanvasAiInputIds: () => string[]; getCanvasDropPosition: (index?: number, client?: { x: number; y: number; }) => { x: number; y: number; }; x: number; y: number; buildCanvasAiGeneratorNode: (pos: { x: number; y: number; }, preset?: CanvasAiPromptPreset, inputIds?: string[], mediaType?: "image" | "video") => CanvasImageItem; addCanvasTemplateValuesAtDrop: (rawValues: unknown[], client?: { x: number; y: number; }) => Promise<{ recognized: boolean; created: number; presetCount: number; workflowCount: number; }>; recognized: boolean; presetCount: number; workflowCount: number; lastCanvasDroppedPathsKeyRef: React.RefObject<string>; lastCanvasDropAtRef: React.RefObject<number>; createCanvasImageItemFromFile: (file: File, index?: number, client?: { x: number; y: number; }) => Promise<CanvasImageItem | null>; createCanvasVideoItemFromPath: (originalPath: string, index?: number, client?: { x: number; y: number; }) => Promise<CanvasImageItem | null>; addCanvasImageItems: (nextItems: CanvasImageItem[]) => void; addCanvasDroppedTemplateJsonSources: (sources: Array<{ name: string; read: () => Promise<unknown>; }>, client?: { x: number; y: number; }) => Promise<boolean>; createCanvasImageItemFromPath: (originalPath: string, index?: number, client?: { x: number; y: number; }) => Promise<CanvasImageItem | null>; assetStorageMode: "initializing" | "sqlite" | "json"; createAssetId: () => `${string}-${string}-${string}-${string}-${string}`; makeCanvasNodeId: (seed: string, kind?: string) => string; };

export const growCanvasNearViewportEdgeImpl = (ctx: Pick<canvasWorkflowRuntimeActionContext, 'canvasScaleRef' | 'canvasSizeRef' | 'isCanvasZoomingRef' | 'scheduleCanvasStateSave' | 'setCanvasSizeImmediate'>, surface: HTMLDivElement | null) => {
  const { canvasScaleRef, canvasSizeRef, isCanvasZoomingRef, scheduleCanvasStateSave, setCanvasSizeImmediate } = ctx;
    if (!surface || isCanvasZoomingRef.current) return;
    const scale = canvasScaleRef.current || 1;
    const current = canvasSizeRef.current;
    const edgeMargin = Math.max(180, Math.min(520, CANVAS_GROW_CHUNK * scale * 0.28));
    const remainingRight = current.width * scale - (surface.scrollLeft + surface.clientWidth);
    const remainingBottom = current.height * scale - (surface.scrollTop + surface.clientHeight);
    const nextWidth = remainingRight <= edgeMargin ? current.width + CANVAS_GROW_CHUNK : current.width;
    const nextHeight = remainingBottom <= edgeMargin ? current.height + CANVAS_GROW_CHUNK : current.height;
    if (nextWidth !== current.width || nextHeight !== current.height) {
      setCanvasSizeImmediate({ width: nextWidth, height: nextHeight });
      scheduleCanvasStateSave();
    }

};

export const runCanvasExpandedWorkflowFromNodeImpl = async (ctx: Pick<canvasWorkflowRuntimeActionContext, 'activeCanvasIdRef' | 'canvasItemsRef' | 'canvasSessionItemsRef' | 'getCanvasSessionItems' | 'getCanvasWorkflowExpandedGroupItems' | 'getCanvasWorkflowGroupItemIdsForSelection' | 'markCanvasRunNodeActive' | 'markCanvasRunNodeSettled' | 'notifyCanvasAiGenerationResult' | 'pushCanvasUndoSnapshot' | 'runCanvasAiGeneratorTarget' | 'runCanvasTextAgentTarget' | 'showToast' | 'updateCanvasAiGeneratorDataForCanvas' | 'updateCanvasItemsImmediate' | 'updateCanvasNodeForCanvas' | 'updateCanvasSelection' | 'waitForCanvasBackgroundPatches'>, targetId: string) => {
  const { activeCanvasIdRef, canvasItemsRef, canvasSessionItemsRef, getCanvasSessionItems, getCanvasWorkflowExpandedGroupItems, getCanvasWorkflowGroupItemIdsForSelection, markCanvasRunNodeActive, markCanvasRunNodeSettled, notifyCanvasAiGenerationResult, pushCanvasUndoSnapshot, runCanvasAiGeneratorTarget, runCanvasTextAgentTarget, showToast, updateCanvasAiGeneratorDataForCanvas, updateCanvasItemsImmediate, updateCanvasNodeForCanvas, updateCanvasSelection, waitForCanvasBackgroundPatches } = ctx;
    const runCanvasId = activeCanvasIdRef.current || DEFAULT_CANVAS_ID;
    const sourceCanvasItems = canvasItemsRef.current;
    canvasSessionItemsRef.current.set(runCanvasId, sourceCanvasItems);
    const getRunCanvasItems = () => getCanvasSessionItems(runCanvasId);
    const updateRunNodeAi = (
      nodeId: string,
      patch: Partial<NonNullable<CanvasImageItem['ai']>>,
      content?: string,
    ) => updateCanvasAiGeneratorDataForCanvas(runCanvasId, nodeId, patch, content);
    const target = sourceCanvasItems.find(item => item.id === targetId);
    const group = getCanvasWorkflowGroup(target);
    if (!target || target.ai?.type !== 'image-generator' || !group) return false;

    const groupItems = getCanvasWorkflowExpandedGroupItems(group.groupId, sourceCanvasItems);
    const workflow = getCanvasWorkflowTemplateFromNode(group.module);
    if (workflow) {
      const expandedIdMap = new Map<string, string>();
      groupItems.forEach(item => {
        const itemGroup = getCanvasWorkflowGroup(item);
        if (itemGroup?.templateId) expandedIdMap.set(itemGroup.templateId, item.id);
      });
      const currentBindings = collectCanvasWorkflowInternalSlotBindings({
        workflow,
        runtimeItems: groupItems,
        idMap: expandedIdMap,
        previousRuntime: group.module.ai?.workflowRuntime,
      });
      const missingSlots = getMissingCanvasWorkflowInternalSlots({
        workflow,
        runtime: {
          ...normalizeCanvasWorkflowRuntime(group.module.ai?.workflowRuntime),
          internalSlotBindings: currentBindings,
        },
      });
      if (missingSlots.length > 0) {
        showToast(missingSlots.length === 1
          ? `请先设置「${missingSlots[0].label}」`
          : `请先设置：${missingSlots.map(slot => `「${slot.label}」`).join('、')}`);
        return true;
      }
    }
    const workflowUserInput = normalizeCanvasWorkflowUserInput(workflow?.userInput);
    const workflowUserRequest = String(group.module.item.content || '').trim().slice(0, 6_000);
    if (workflowUserInput.enabled && workflowUserInput.required && !workflowUserRequest) {
      showToast(`请输入${workflowUserInput.label || '用户需求'}后再运行`);
      return true;
    }
    const runIds = getCanvasExpandedWorkflowDownstreamGeneratorIds(targetId, groupItems);
    if (runIds.length === 0) {
      showToast('这个展开工作流里没有可运行的后续生图节点');
      return true;
    }

    const explicitTextInputIds = workflow?.nodes
      .filter(node => (
        node.acceptsExternalInputs === true
        && (
          !Array.isArray(node.externalInputTypes)
          || node.externalInputTypes.length === 0
          || node.externalInputTypes.includes('text')
        )
      ))
      .map(node => groupItems.find(item => getCanvasWorkflowGroup(item)?.templateId === node.id)?.id || '')
      .filter(Boolean) || [];
    const workflowContextTargetIds = Array.from(new Set([
      targetId,
      ...selectCanvasWorkflowUserInputTargetIds(groupItems, explicitTextInputIds),
    ]));
    const getExpandedWorkflowSourceItems = () => injectCanvasWorkflowUserInputContext(
      getRunCanvasItems(),
      {
        workflowNodeId: group.module.id,
        request: workflowUserRequest,
        config: workflowUserInput,
        targetNodeIds: workflowContextTargetIds,
      },
    );

    const runIdSet = new Set(runIds);
    const groupSelectionIds = getCanvasWorkflowGroupItemIdsForSelection(group.groupId);
    pushCanvasUndoSnapshot('重新生成工作流内部节点');
    updateCanvasItemsImmediate(prev => prev.map(item => {
      if (!runIdSet.has(item.id) || item.ai?.type !== 'image-generator') return item;
      return {
        ...item,
        ai: {
          ...item.ai,
          type: 'image-generator' as const,
          status: item.id === targetId ? 'working' as const : 'idle' as const,
          error: undefined,
          generatedAt: undefined,
          outputs: [],
        },
      };
    }));
    updateCanvasSelection(groupSelectionIds.length > 0 ? groupSelectionIds : [targetId]);
    showToast(`开始从「${target.ai.presetLabel || target.item.name || '内部节点'}」重新生成，并更新 ${runIds.length - 1} 个后续节点`);

    const failedIds = new Set<string>();
    let successCount = 0;
    runIds.forEach(nodeId => markCanvasRunNodeActive(runCanvasId, nodeId));
    try {
      for (const nodeId of runIds) {
      const current = getRunCanvasItems().find(item => item.id === nodeId);
      if (!current) continue;

      const upstreamRunnableIds = (current.inputs || []).filter(inputId => {
        const source = getRunCanvasItems().find(item => item.id === inputId);
        return !!source && runIdSet.has(inputId) && (source.ai?.type === 'image-generator' || isCanvasAgentTextTarget(source));
      });
      if (upstreamRunnableIds.some(inputId => failedIds.has(inputId))) {
        failedIds.add(nodeId);
        if (current.ai?.type === 'image-generator') {
          updateRunNodeAi(nodeId, {
            status: 'error',
            error: '上游节点生成失败，已跳过',
            outputs: [],
            generatedAt: Date.now(),
          });
        }
        continue;
      }

      if (isCanvasAgentTextTarget(current)) {
        try {
          const output = await runCanvasTextAgentTarget(current, {
            sourceItems: getExpandedWorkflowSourceItems,
            getLatestTarget: () => getExpandedWorkflowSourceItems().find(item => item.id === nodeId),
            updateTextOutput: (textOutput) => updateCanvasNodeForCanvas(
              runCanvasId,
              nodeId,
              item => ({ ...item, item: { ...item.item, remark: textOutput } }),
            ),
            showResultToast: false,
            showReferenceToast: false,
          });
          if (output.trim()) successCount += 1;
          else failedIds.add(nodeId);
        } catch (error) {
          console.warn('展开工作流内部文字节点运行失败:', error);
          failedIds.add(nodeId);
        }
        continue;
      }

      if (current.ai?.type !== 'image-generator') continue;

      await runCanvasAiGeneratorTarget(current, {
        canvasId: runCanvasId,
        sourceItems: getExpandedWorkflowSourceItems,
        updateAi: (patch, content) => updateRunNodeAi(nodeId, patch, content),
        getLatestTarget: () => getExpandedWorkflowSourceItems().find(item => item.id === nodeId),
        showResultToast: false,
        requireLocalImageOutputs: true,
      });

      const latest = getRunCanvasItems().find(item => item.id === nodeId);
      if (getCanvasAiSuccessfulOutputs(latest).some(isCanvasAiImageOutputReadyForWorkflowDependency)) {
        successCount += 1;
      } else {
        failedIds.add(nodeId);
      }
      }
    } finally {
      await waitForCanvasBackgroundPatches(runCanvasId);
      runIds.forEach(nodeId => markCanvasRunNodeSettled(runCanvasId, nodeId));
    }

    showToast(failedIds.size > 0
      ? `展开工作流已部分更新：成功 ${successCount} 个，失败/跳过 ${failedIds.size} 个`
      : `展开工作流已更新 ${successCount} 个节点`);
    notifyCanvasAiGenerationResult({
      status: failedIds.size > 0 ? 'partial' : 'success',
      label: '展开工作流',
      mediaType: 'image',
      generatedCount: successCount,
      requestedCount: runIds.length,
      error: failedIds.size > 0 ? `失败/跳过 ${failedIds.size} 个节点` : undefined,
    });
    return true;

};

export const retryCanvasExpandedWorkflowOutputImpl = async (ctx: Pick<canvasWorkflowRuntimeActionContext, 'activeCanvasIdRef' | 'applyCanvasAiGeneratorDataPatch' | 'canvasAiRunTokensRef' | 'canvasItemsRef' | 'canvasSessionItemsRef' | 'createCanvasAiOutputDrafts' | 'getCanvasSessionItems' | 'markCanvasRunNodeActive' | 'markCanvasRunNodeSettled' | 'pushCanvasUndoSnapshot' | 'runCanvasAiGeneratorTarget' | 'showToast' | 'updateCanvasNodeForCanvas' | 'waitForCanvasBackgroundPatches'>, targetId: string, outputIndex: number) => {
  const { activeCanvasIdRef, applyCanvasAiGeneratorDataPatch, canvasAiRunTokensRef, canvasItemsRef, canvasSessionItemsRef, createCanvasAiOutputDrafts, getCanvasSessionItems, markCanvasRunNodeActive, markCanvasRunNodeSettled, pushCanvasUndoSnapshot, runCanvasAiGeneratorTarget, showToast, updateCanvasNodeForCanvas, waitForCanvasBackgroundPatches } = ctx;
    const runCanvasId = activeCanvasIdRef.current || DEFAULT_CANVAS_ID;
    canvasSessionItemsRef.current.set(runCanvasId, canvasItemsRef.current);
    const target = getCanvasSessionItems(runCanvasId).find(item => item.id === targetId);
    const group = getCanvasWorkflowGroup(target);
    if (!target || target.ai?.type !== 'image-generator' || !group) return false;
    const currentOutputs = target.ai.outputs?.length
      ? target.ai.outputs
      : createCanvasAiOutputDrafts(target, target.item.content || target.ai.prompt || '');
    const fallback = currentOutputs[outputIndex];
    if (!fallback) {
      showToast('没有找到要重试的工作流图片');
      return true;
    }

    const runToken = createCanvasAiClientRequestId(`${targetId}:output:${outputIndex}`);
    const runKey = `${runCanvasId}:workflow-output:${targetId}`;
    if (!claimCanvasAiRun(canvasAiRunTokensRef.current, runKey, runToken)) {
      showToast('这张图片正在重新生成');
      return true;
    }
    markCanvasRunNodeActive(runCanvasId, targetId);
    pushCanvasUndoSnapshot('重试工作流单张输出');

    const updateRetrySlot = (
      patch: Partial<NonNullable<CanvasImageItem['ai']>>,
      content?: string,
    ) => updateCanvasNodeForCanvas(runCanvasId, targetId, item => {
      if (item.ai?.type !== 'image-generator') return item;
      const existingOutputs = item.ai.outputs?.length ? item.ai.outputs : currentOutputs;
      const outputs = mergeCanvasAiRetryOutputSlot(
        existingOutputs,
        outputIndex,
        patch.outputs,
        fallback,
        patch.status === 'idle' ? undefined : patch.status,
        patch.error,
      );
      const status = getCanvasAiRetryNodeStatus(outputs, patch.status);
      return applyCanvasAiGeneratorDataPatch(item, {
        ...patch,
        outputs,
        status,
        error: status === 'success' ? undefined : patch.error,
      }, content);
    });
    const getSingleTarget = () => {
      const latest = getCanvasSessionItems(runCanvasId).find(item => item.id === targetId);
      return latest?.ai ? {
        ...latest,
        ai: {
          ...latest.ai,
          count: 1,
          outputs: [],
        },
      } as CanvasImageItem : undefined;
    };

    try {
      updateRetrySlot({ status: 'working', error: undefined, outputs: [] });
      const singleTarget = getSingleTarget();
      if (!singleTarget) return true;
      await runCanvasAiGeneratorTarget(singleTarget, {
        canvasId: runCanvasId,
        sourceItems: () => getCanvasSessionItems(runCanvasId),
        updateAi: updateRetrySlot,
        getLatestTarget: getSingleTarget,
        showResultToast: false,
        clientRequestId: runToken,
        requireLocalImageOutputs: true,
      });
      const latest = getCanvasSessionItems(runCanvasId).find(item => item.id === targetId);
      const succeeded = isCanvasAiImageOutputReadyForWorkflowDependency(
        latest?.ai?.outputs?.[outputIndex],
      );
      if (!succeeded) {
        updateCanvasNodeForCanvas(runCanvasId, targetId, item => {
          if (item.ai?.type !== 'image-generator') return item;
          const outputs = [...(item.ai.outputs || currentOutputs)];
          outputs[outputIndex] = fallback;
          return applyCanvasAiGeneratorDataPatch(item, {
            outputs,
            status: target.ai?.status,
            error: target.ai?.error,
          });
        });
      }
      showToast(succeeded
        ? `已重新生成「${target.ai.presetLabel || target.item.name || '内部节点'}」的第 ${outputIndex + 1} 张图片`
        : '这张工作流图片重新生成失败');
      return true;
    } finally {
      releaseCanvasAiRun(canvasAiRunTokensRef.current, runKey, runToken);
      await waitForCanvasBackgroundPatches(runCanvasId);
      markCanvasRunNodeSettled(runCanvasId, targetId);
    }

};

export const retryCanvasCollapsedWorkflowOutputImpl = async (ctx: Pick<canvasWorkflowRuntimeActionContext, 'activeCanvasIdRef' | 'canvasAiRunTokensRef' | 'canvasItemsRef' | 'canvasSessionItemsRef' | 'commitCanvasAiPromptDraft' | 'createCanvasAiOutputDrafts' | 'getCanvasSessionItems' | 'hydrateCanvasWorkflowSlotAssetsFromDrawer' | 'instantiateCanvasWorkflowTemplateItems' | 'markCanvasRunNodeActive' | 'markCanvasRunNodeSettled' | 'pushCanvasUndoSnapshot' | 'runCanvasAiGeneratorTarget' | 'showToast' | 'updateCanvasAiGeneratorDataForCanvas' | 'waitForCanvasBackgroundPatches'>, moduleId: string, visibleOutputIndex: number) => {
  const { activeCanvasIdRef, canvasAiRunTokensRef, canvasItemsRef, canvasSessionItemsRef, commitCanvasAiPromptDraft, createCanvasAiOutputDrafts, getCanvasSessionItems, hydrateCanvasWorkflowSlotAssetsFromDrawer, instantiateCanvasWorkflowTemplateItems, markCanvasRunNodeActive, markCanvasRunNodeSettled, pushCanvasUndoSnapshot, runCanvasAiGeneratorTarget, showToast, updateCanvasAiGeneratorDataForCanvas, waitForCanvasBackgroundPatches } = ctx;
    commitCanvasAiPromptDraft(moduleId, undefined, true);
    const runCanvasId = activeCanvasIdRef.current || DEFAULT_CANVAS_ID;
    const sourceCanvasItems = canvasItemsRef.current;
    canvasSessionItemsRef.current.set(runCanvasId, sourceCanvasItems);
    const moduleNode = sourceCanvasItems.find(item => item.id === moduleId);
    const workflow = getCanvasWorkflowTemplateFromNode(moduleNode);
    if (!moduleNode || !workflow) return false;
    const outputMode = moduleNode.ai?.workflowOutputMode === 'final' ? 'final' : 'all';
    const visibleSlots = getCanvasWorkflowOutputSlotTemplates(workflow, outputMode);
    const selectedSlot = visibleSlots[visibleOutputIndex];
    if (!selectedSlot || selectedSlot.node.ai?.type !== 'image-generator') {
      showToast('没有找到要重试的工作流节点');
      return true;
    }

    const workflowUserInput = normalizeCanvasWorkflowUserInput(workflow.userInput);
    const workflowMaterialInputIds = (moduleNode.inputs || []).filter(inputId => (
      canUseCanvasItemAsWorkflowMaterial(
        sourceCanvasItems.find(item => item.id === inputId),
        workflowUserInput,
      )
    ));
    const runtime = instantiateCanvasWorkflowTemplateItems(
      workflow,
      { x: moduleNode.x, y: moduleNode.y },
      workflowMaterialInputIds,
    );
    const restoredSnapshots = applyCanvasWorkflowRuntimeSnapshots(
      workflow,
      runtime.items,
      runtime.idMap,
      normalizeCanvasWorkflowRuntimeSnapshots(moduleNode.ai?.workflowRuntime),
    );
    let runtimeItems = hydrateCanvasWorkflowSlotAssetsFromDrawer(applyCanvasWorkflowInternalSlotBindings({
      workflow,
      items: restoredSnapshots,
      idMap: runtime.idMap,
      runtime: moduleNode.ai?.workflowRuntime,
    }));
    const runtimeTargetId = runtime.idMap.get(selectedSlot.node.id);
    const runtimeTarget = runtimeItems.find(item => item.id === runtimeTargetId);
    if (!runtimeTargetId || runtimeTarget?.ai?.type !== 'image-generator') {
      showToast('工作流内部节点恢复失败');
      return true;
    }
    const currentTargetOutputs = runtimeTarget.ai.outputs?.length
      ? runtimeTarget.ai.outputs
      : createCanvasAiOutputDrafts(
        runtimeTarget,
        runtimeTarget.item.content || runtimeTarget.ai.prompt || '',
      );
    const fallback = currentTargetOutputs[selectedSlot.index];
    if (!fallback) {
      showToast('没有找到要重试的工作流图片');
      return true;
    }

    const runToken = createCanvasAiClientRequestId(
      `${moduleId}:${selectedSlot.node.id}:output:${selectedSlot.index}`,
    );
    const runKey = `${runCanvasId}:workflow:${moduleId}`;
    if (!claimCanvasAiRun(canvasAiRunTokensRef.current, runKey, runToken)) {
      showToast('这个工作流正在运行，请等待完成后再重试');
      return true;
    }
    setCanvasChatVisibility(true);
    markCanvasRunNodeActive(runCanvasId, moduleId);
    pushCanvasUndoSnapshot('重试工作流单张输出');

    const collectFinalOutputs = () => {
      const drafts = createCanvasWorkflowOutputDrafts(moduleNode, workflow);
      const slots = getCanvasWorkflowOutputSlotTemplates(workflow);
      return drafts.map((draft, index) => {
        const slot = slots[index];
        const runtimeId = slot ? runtime.idMap.get(slot.node.id) : undefined;
        const output = runtimeItems.find(item => item.id === runtimeId)?.ai?.outputs?.[slot?.index || 0];
        return output ? {
          ...draft,
          ...output,
          id: draft.id,
          name: draft.name,
          nodeId: draft.nodeId,
          nodeLabel: draft.nodeLabel,
        } : draft;
      });
    };
    const syncModule = (
      requestedStatus?: 'idle' | 'working' | 'success' | 'error',
      error?: string,
    ) => {
      const selectedOutputs = runtimeItems.find(item => item.id === runtimeTargetId)?.ai?.outputs || [];
      const status = getCanvasAiRetryNodeStatus(selectedOutputs, requestedStatus);
      updateCanvasAiGeneratorDataForCanvas(runCanvasId, moduleId, {
        outputs: collectFinalOutputs(),
        workflowRuntime: createCanvasWorkflowRuntimeValue(
          workflow,
          runtimeItems,
          runtime.idMap,
          moduleNode.ai?.workflowRuntime,
        ),
        status,
        error: status === 'success' ? undefined : error,
        generatedAt: Date.now(),
      });
    };
    const updateRuntimeRetrySlot = (
      patch: Partial<NonNullable<CanvasImageItem['ai']>>,
      content?: string,
    ) => {
      runtimeItems = runtimeItems.map(item => {
        if (item.id !== runtimeTargetId || item.ai?.type !== 'image-generator') return item;
        const existingOutputs = item.ai.outputs?.length ? item.ai.outputs : currentTargetOutputs;
        const outputs = mergeCanvasAiRetryOutputSlot(
          existingOutputs,
          selectedSlot.index,
          patch.outputs,
          fallback,
          patch.status === 'idle' ? undefined : patch.status,
          patch.error,
        );
        const status = getCanvasAiRetryNodeStatus(outputs, patch.status);
        return {
          ...item,
          item: content === undefined ? item.item : {
            ...item.item,
            content,
          },
          ai: {
            ...item.ai,
            ...patch,
            outputs,
            status,
            error: status === 'success' ? undefined : patch.error,
          },
        };
      });
      syncModule(patch.status, patch.error);
    };
    const getRuntimeSourceItems = () => [
      ...getCanvasSessionItems(runCanvasId).filter(item => item.id !== moduleId),
      ...runtimeItems,
    ];
    const getSingleTarget = () => {
      const latest = runtimeItems.find(item => item.id === runtimeTargetId);
      return latest?.ai ? {
        ...latest,
        ai: {
          ...latest.ai,
          count: 1,
          outputs: [],
        },
      } as CanvasImageItem : undefined;
    };

    try {
      updateRuntimeRetrySlot({ status: 'working', error: undefined, outputs: [] });
      const singleTarget = getSingleTarget();
      if (!singleTarget) return true;
      await runCanvasAiGeneratorTarget(singleTarget, {
        canvasId: runCanvasId,
        sourceItems: getRuntimeSourceItems,
        updateAi: updateRuntimeRetrySlot,
        getLatestTarget: getSingleTarget,
        showResultToast: false,
        clientRequestId: runToken,
        requireLocalImageOutputs: true,
      });
      const latestOutput = runtimeItems.find(item => item.id === runtimeTargetId)
        ?.ai?.outputs?.[selectedSlot.index];
      const succeeded = isCanvasAiImageOutputReadyForWorkflowDependency(latestOutput);
      if (!succeeded) {
        runtimeItems = runtimeItems.map(item => {
          if (item.id !== runtimeTargetId || item.ai?.type !== 'image-generator') return item;
          const outputs = [...(item.ai.outputs || currentTargetOutputs)];
          outputs[selectedSlot.index] = fallback;
          return {
            ...item,
            ai: {
              ...item.ai,
              outputs,
              status: runtimeTarget.ai?.status,
              error: runtimeTarget.ai?.error,
            },
          };
        });
        syncModule(moduleNode.ai?.status, moduleNode.ai?.error);
      } else {
        syncModule('success');
      }
      showToast(succeeded
        ? `已单独重新生成「${getCanvasWorkflowOutputLabel(selectedSlot.node)}」第 ${selectedSlot.index + 1} 张图片`
        : '这张工作流图片重新生成失败');
      return true;
    } finally {
      releaseCanvasAiRun(canvasAiRunTokensRef.current, runKey, runToken);
      await waitForCanvasBackgroundPatches(runCanvasId);
      markCanvasRunNodeSettled(runCanvasId, moduleId);
    }

};

export const retryCanvasWorkflowOutputImpl = async (ctx: Pick<canvasWorkflowRuntimeActionContext, 'canvasItemsRef' | 'retryCanvasCollapsedWorkflowOutput' | 'retryCanvasExpandedWorkflowOutput'>, canvasItemId: string, outputIndex: number) => {
  const { canvasItemsRef, retryCanvasCollapsedWorkflowOutput, retryCanvasExpandedWorkflowOutput } = ctx;
    const canvasItem = canvasItemsRef.current.find(item => item.id === canvasItemId);
    if (!canvasItem) return;
    if (canvasItem.ai?.type === 'workflow') {
      await retryCanvasCollapsedWorkflowOutput(canvasItemId, outputIndex);
      return;
    }
    if (canvasItem.ai?.type === 'image-generator' && getCanvasWorkflowGroup(canvasItem)) {
      await retryCanvasExpandedWorkflowOutput(canvasItemId, outputIndex);
    }

};

export const cloneCanvasWorkflowModuleForRerunImpl = (ctx: Pick<canvasWorkflowRuntimeActionContext, 'buildCanvasWorkflowModuleNode' | 'getCanvasAiRerunNodePosition'>, source: CanvasImageItem): CanvasImageItem | null => {
  const { buildCanvasWorkflowModuleNode, getCanvasAiRerunNodePosition } = ctx;
    const workflow = getCanvasWorkflowTemplateFromNode(source);
    if (!workflow) return null;
    const pos = getCanvasAiRerunNodePosition(source);
    const nextNode = buildCanvasWorkflowModuleNode(workflow, pos, source.inputs || []);
    if (!nextNode) return null;
    return {
      ...nextNode,
      item: {
        ...nextNode.item,
        content: source.item.content || '',
        name: source.item.name || nextNode.item.name,
        remark: source.item.remark || nextNode.item.remark,
      },
      ai: {
        ...(nextNode.ai || { type: 'workflow' as const }),
        type: 'workflow' as const,
        skillMeta: source.ai?.skillMeta,
        workflowRuntime: {
          internalSlotBindings: cloneDrawerValue(
            normalizeCanvasWorkflowRuntime(source.ai?.workflowRuntime).internalSlotBindings || {},
          ),
        },
      },
    };

};

export const runCanvasWorkflowModuleNodeImpl = async (ctx: Pick<canvasWorkflowRuntimeActionContext, 'activeCanvasIdRef' | 'canvasAiRunTokensRef' | 'canvasItemsRef' | 'canvasSessionItemsRef' | 'commitCanvasAiPromptDraft' | 'foldersRef' | 'getCanvasAiErrorSummary' | 'getCanvasSessionItems' | 'hydrateCanvasWorkflowSlotAssetsFromDrawer' | 'instantiateCanvasWorkflowTemplateItems' | 'isCanvasModeRef' | 'itemsRef' | 'markCanvasRunNodeActive' | 'markCanvasRunNodeSettled' | 'notifyCanvasAiGenerationResult' | 'runCanvasAiGeneratorTarget' | 'runCanvasTextAgentTarget' | 'showToast' | 'updateCanvasAiGeneratorDataForCanvas' | 'updateCanvasSelection' | 'waitForCanvasBackgroundPatches' | 'workflowResultPublisherRef'>, targetId: string) => {
  const { activeCanvasIdRef, canvasAiRunTokensRef, canvasItemsRef, canvasSessionItemsRef, commitCanvasAiPromptDraft, foldersRef, getCanvasAiErrorSummary, getCanvasSessionItems, hydrateCanvasWorkflowSlotAssetsFromDrawer, instantiateCanvasWorkflowTemplateItems, isCanvasModeRef, itemsRef, markCanvasRunNodeActive, markCanvasRunNodeSettled, notifyCanvasAiGenerationResult, runCanvasAiGeneratorTarget, runCanvasTextAgentTarget, showToast, updateCanvasAiGeneratorDataForCanvas, updateCanvasSelection, waitForCanvasBackgroundPatches, workflowResultPublisherRef } = ctx;
    commitCanvasAiPromptDraft(targetId, undefined, true);
    const runCanvasId = activeCanvasIdRef.current || DEFAULT_CANVAS_ID;
    const sourceCanvasItems = canvasItemsRef.current;
    canvasSessionItemsRef.current.set(runCanvasId, sourceCanvasItems);
    const getRunCanvasItems = () => getCanvasSessionItems(runCanvasId);
    const updateModuleAi = (
      patch: Partial<NonNullable<CanvasImageItem['ai']>>,
      content?: string,
    ) => updateCanvasAiGeneratorDataForCanvas(runCanvasId, targetId, patch, content);
    const moduleNode = sourceCanvasItems.find(item => item.id === targetId);
    const workflow = getCanvasWorkflowTemplateFromNode(moduleNode);
    if (!moduleNode || !workflow) {
      showToast('请先选中一个工作流模块');
      return;
    }

    setCanvasChatVisibility(true);
    const publishWorkflowStartup = (
      status: WorkflowResultCardData['status'],
      error?: string,
    ) => workflowResultPublisherRef.current(buildWorkflowResultCardData({
      workflowId: workflow.id,
      workflowNodeId: targetId,
      workflowName: workflow.label,
      status,
      completedAt: Date.now(),
      completedSteps: 0,
      totalSteps: workflow.nodes.length,
      error,
      tasks: workflow.nodes.map((node, index) => ({
        id: node.id,
        label: node.item.name || node.ai?.presetLabel || `任务 ${index + 1}`,
        status: 'waiting',
      })),
    }));
    requestCanvasWorkflowConversation(workflow.label);
    publishWorkflowStartup('running');
    const workflowUserInput = normalizeCanvasWorkflowUserInput(workflow.userInput);
    const workflowUserRequest = String(moduleNode.item.content || '').trim().slice(0, 6_000);
    const missingInternalSlots = getMissingCanvasWorkflowInternalSlots({
      workflow,
      runtime: moduleNode.ai?.workflowRuntime,
    });
    if (missingInternalSlots.length > 0) {
      const error = missingInternalSlots.length === 1
        ? `请先设置「${missingInternalSlots[0].label}」`
        : `请先设置：${missingInternalSlots.map(slot => `「${slot.label}」`).join('、')}`;
      updateModuleAi({ status: 'error', error });
      updateCanvasSelection([targetId]);
      publishWorkflowStartup('error', error);
      showToast(error);
      return;
    }
    const workflowMaterialInputIds = (moduleNode.inputs || []).filter(inputId => (
      canUseCanvasItemAsWorkflowMaterial(
        sourceCanvasItems.find(item => item.id === inputId),
        workflowUserInput,
      )
    ));
    if (workflowUserInput.enabled && workflowUserInput.required && !workflowUserRequest) {
      const error = `请输入${workflowUserInput.label || '用户需求'}后再运行`;
      updateModuleAi({ status: 'error', error });
      updateCanvasSelection([targetId]);
      publishWorkflowStartup('error', error);
      showToast(error);
      return;
    }

    let localInspirationContext: IndustrialDesignLocalInspirationContext | null = null;
    let originalProjectRequest = '';
    let workflowDesignReferencePlan: {
      references: Array<{
        itemId: string;
        role: string;
        reason: string;
        matchedFeatures: string[];
        confidence: number;
      }>;
    } | undefined;
    if (workflow.id === INDUSTRIAL_DESIGN_FULL_PROCESS_WORKFLOW_ID) {
      const connectedItems = workflowMaterialInputIds
        .map(inputId => sourceCanvasItems.find(item => item.id === inputId))
        .filter((item): item is CanvasImageItem => !!item);
      const connectedText = connectedItems
        .filter(item => item.item.type === 'text')
        .map(item => String(item.item.remark || item.item.content || '').trim())
        .filter(Boolean);
      originalProjectRequest = [moduleNode.item.content, ...connectedText]
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .join('\n\n')
        .slice(0, 2_400);
      const explicitlyConnectedDrawerIds = connectedItems.flatMap(item => [
        item.item.sourceItemId,
        item.item.id,
      ]).filter((itemId): itemId is string => !!itemId);
      localInspirationContext = buildIndustrialDesignLocalInspirationContext(
        itemsRef.current,
        originalProjectRequest,
        {
          excludeItemIds: explicitlyConnectedDrawerIds,
          topK: 8,
          folders: foldersRef.current,
        },
      );
    }

    const runtime = instantiateCanvasWorkflowTemplateItems(workflow, { x: moduleNode.x, y: moduleNode.y }, workflowMaterialInputIds);
    let runtimeItems = hydrateCanvasWorkflowSlotAssetsFromDrawer(applyCanvasWorkflowInternalSlotBindings({
      workflow,
      items: runtime.items,
      idMap: runtime.idMap,
      runtime: moduleNode.ai?.workflowRuntime,
    }));
    if (workflow.id === INDUSTRIAL_DESIGN_FULL_PROCESS_WORKFLOW_ID && localInspirationContext) {
      const referenceContextRuntimeId = runtime.idMap.get(INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.references);
      const connectedInputSummary = workflowMaterialInputIds
        .map(inputId => sourceCanvasItems.find(item => item.id === inputId))
        .filter((item): item is CanvasImageItem => !!item)
        .map(item => item.item.name || item.id);
      const injectedContextText = buildIndustrialDesignRuntimeContextText({
        projectRequest: originalProjectRequest,
        connectedInputLabels: connectedInputSummary,
        localInspirationContext,
      });
      workflowDesignReferencePlan = {
        references: localInspirationContext.references.map(reference => ({
          itemId: reference.itemId,
          role: reference.recommendedRole,
          reason: reference.reason,
          matchedFeatures: reference.matchedFeatures,
          confidence: reference.confidence,
        })),
      };

      runtimeItems = runtimeItems.map(item => {
        if (item.id === referenceContextRuntimeId) {
          return {
            ...item,
            item: {
              ...item.item,
              content: injectedContextText,
              remark: injectedContextText,
            },
          };
        }
        if (item.ai?.type !== 'image-generator') return item;
        return {
          ...item,
          ai: {
            ...item.ai,
            skillMeta: {
              ...(item.ai.skillMeta || {}),
              originalRequest: originalProjectRequest || undefined,
              designReferencePlan: workflowDesignReferencePlan,
              localInspirationReferenceState: localInspirationContext?.usedExtraReferences ? 'selected' : 'none',
            },
          },
        };
      });
    }
    if (
      workflow.id !== INDUSTRIAL_DESIGN_FULL_PROCESS_WORKFLOW_ID
      && workflowUserInput.enabled
      && workflowUserRequest
    ) {
      const explicitTextInputIds = workflow.nodes
        .filter(node => (
          node.acceptsExternalInputs === true
          && (
            !Array.isArray(node.externalInputTypes)
            || node.externalInputTypes.length === 0
            || node.externalInputTypes.includes('text')
          )
        ))
        .map(node => runtime.idMap.get(node.id) || '')
        .filter(Boolean);
      const contextTargetIds = selectCanvasWorkflowUserInputTargetIds(runtimeItems, explicitTextInputIds);
      runtimeItems = injectCanvasWorkflowUserInputContext(runtimeItems, {
        workflowNodeId: targetId,
        request: workflowUserRequest,
        config: workflowUserInput,
        targetNodeIds: contextTargetIds,
      });
    }
    const runOrder = sortCanvasWorkflowRuntimeNodeIds(runtimeItems);
    const generatorRunIds = runOrder.filter(nodeId => runtimeItems.find(item => item.id === nodeId)?.ai?.type === 'image-generator');
    if (generatorRunIds.length === 0) {
      const error = '工作流内部没有生图节点';
      updateModuleAi({ status: 'error', error });
      publishWorkflowStartup('error', error);
      showToast(error);
      return;
    }

    const runToken = createCanvasAiClientRequestId(targetId);
    const runKey = `${runCanvasId}:workflow:${targetId}`;
    if (!claimCanvasAiRun(canvasAiRunTokensRef.current, runKey, runToken)) {
      showToast('这个工作流正在运行，请等待完成后再重试');
      return;
    }
    markCanvasRunNodeActive(runCanvasId, targetId);

    try {

    const outputDrafts = createCanvasWorkflowOutputDrafts(moduleNode, workflow, 'working');
    const outputSlots = getCanvasWorkflowOutputSlotTemplates(workflow)
      .map(slot => ({
        ...slot,
        runtimeId: runtime.idMap.get(slot.node.id),
      }))
      .filter((slot): slot is { node: CanvasWorkflowNodeTemplate; index: number; runtimeId: string } => !!slot.runtimeId);
    const runSet = new Set(runOrder);
    const runStatus = new Map<string, CanvasWorkflowRunStatus>(runOrder.map(nodeId => [nodeId, 'waiting']));
    const dependencyMap = new Map<string, string[]>();
    runOrder.forEach(nodeId => {
      const current = runtimeItems.find(item => item.id === nodeId);
      const dependencies = (current?.inputs || []).filter(inputId => {
        const source = runtimeItems.find(item => item.id === inputId);
        return !!source && runSet.has(inputId) && (source.ai?.type === 'image-generator' || isCanvasAgentTextTarget(source));
      });
      dependencyMap.set(nodeId, dependencies);
    });
    const templateNodeIdByRuntimeId = new Map(Array.from(runtime.idMap.entries()).map(
      ([templateNodeId, runtimeNodeId]) => [runtimeNodeId, templateNodeId],
    ));
    const isToleratedDependencyFailure = (nodeId: string, dependencyId: string) => (
      workflow.id === INDUSTRIAL_DESIGN_FULL_PROCESS_WORKFLOW_ID
      && shouldTolerateIndustrialDesignDependencyFailure(
        templateNodeIdByRuntimeId.get(nodeId) || nodeId,
        templateNodeIdByRuntimeId.get(dependencyId) || dependencyId,
      )
    );
    const failedIds = new Set<string>();
    const skippedIds = new Set<string>();
    const runtimeErrors = new Map<string, string>();
    let completedCount = 0;

    const getRuntimeNodeLabel = (nodeId: string) => {
      const templateNode = workflow.nodes.find(node => runtime.idMap.get(node.id) === nodeId);
      const runtimeItem = runtimeItems.find(item => item.id === nodeId);
      return templateNode?.item.name
        || runtimeItem?.ai?.presetLabel
        || runtimeItem?.item.name
        || '内部节点';
    };

    const recordRuntimeNodeFailure = (nodeId: string, error: unknown) => {
      const rawMessage = error instanceof Error ? error.message : String(error || '节点执行失败');
      const summary = getCanvasAiErrorSummary(rawMessage);
      runtimeErrors.set(nodeId, summary);
      return summary;
    };
    const getRuntimeFailureSummary = () => {
      if (failedIds.size <= 0) return '';
      const firstFailedId = runOrder.find(nodeId => (
        runStatus.get(nodeId) === 'failed' && runtimeErrors.has(nodeId)
      ));
      const firstFailure = firstFailedId
        ? `${getRuntimeNodeLabel(firstFailedId)}：${runtimeErrors.get(firstFailedId)}`
        : '';
      return `内部 ${failedIds.size} 个节点失败/跳过${skippedIds.size > 0 ? `（跳过 ${skippedIds.size} 个）` : ''}${firstFailure ? `；首个错误：${firstFailure}` : ''}`;
    };

    const getRuntimeSourceItems = () => [
      ...getRunCanvasItems().filter(item => item.id !== targetId),
      ...runtimeItems,
    ];
    const collectModuleOutputs = (
      fallbackStatus?: CanvasAiGeneratedOutput['status'],
      fallbackError?: string
    ) => outputDrafts.map((draft, slotIndex) => {
      const slot = outputSlots[slotIndex];
      if (!slot) return fallbackStatus ? { ...draft, status: fallbackStatus, error: fallbackError } : draft;
      const runtimeItem = runtimeItems.find(item => item.id === slot.runtimeId);
      const output = getCanvasAiSuccessfulOutputs(runtimeItem)[slot.index];
      if (!output) {
        return fallbackStatus
          ? { ...draft, status: fallbackStatus, error: fallbackError, generatedAt: draft.generatedAt || Date.now() }
          : draft;
      }
      return {
        ...draft,
        ...output,
        id: draft.id,
        name: draft.name,
        nodeId: draft.nodeId,
        nodeLabel: draft.nodeLabel,
      };
    });
    const getRuntimeSnapshots = () => createCanvasWorkflowRuntimeValue(
      workflow,
      runtimeItems,
      runtime.idMap,
      moduleNode.ai?.workflowRuntime,
    );
    const publishWorkflowResult = (
      status: WorkflowResultCardData['status'],
      outputs: CanvasAiGeneratedOutput[],
      error?: string,
    ) => {
      const noExtraReferenceAssets = workflow.id === INDUSTRIAL_DESIGN_FULL_PROCESS_WORKFLOW_ID
        && localInspirationContext
        && !localInspirationContext.usedExtraReferences
        ? [{
          nodeId: INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.references,
          title: '本地灵感参考',
          content: localInspirationContext.metadataText,
          designAgentConfig: {
            agentRole: 'inspiration_analyzer' as const,
            outputArtifactType: 'InspirationAnalysis' as const,
            thinkingMode: 'analysis' as const,
          },
        }]
        : [];
      const textAssets = [...noExtraReferenceAssets, ...workflow.nodes.flatMap(node => {
        const runtimeId = runtime.idMap.get(node.id);
        const runtimeItem = runtimeItems.find(item => item.id === runtimeId);
        if (!runtimeItem || !isCanvasAgentTextTarget(runtimeItem) || runStatus.get(runtimeId || '') !== 'success') return [];
        const content = String(runtimeItem.item.remark || '').trim();
        if (!content) return [];
        return [{
          nodeId: node.id,
          title: node.item.name || runtimeItem.item.name || 'Design Agent 成果',
          content,
          designAgentConfig: node.designAgentConfig || runtimeItem.designAgentConfig,
        }];
      })];

      const inputCanvasItems = workflowMaterialInputIds
        .map(inputId => getRunCanvasItems().find(item => item.id === inputId))
        .filter((item): item is CanvasImageItem => !!item);
      const referenceRoles = new Map<string, string>();
      runtimeItems.forEach(runtimeItem => {
        (runtimeItem.ai?.referenceRoles || []).forEach(reference => {
          if (reference.role !== 'NONE') referenceRoles.set(reference.nodeId, reference.role);
        });
      });
      const getDrawerReferencePreview = (item?: BufferItem) => item
        ? item.thumbnail
          || item.url
          || (item.path ? convertFileSrc(item.path) : '')
          || item.sourceUrl
          || item.originalUrl
          || ''
        : '';
      const getDrawerReferenceName = (item?: BufferItem) => {
        if (!item) return '';
        const name = String(item.name || '').trim();
        const summary = String(item.inspirationProfile?.summary || '').trim();
        return !name || /^(?:ai\s*generated|generated\s*image|ai\s*生成)(?:\s*#?\d+)?$/i.test(name)
          ? summary || name
          : name;
      };
      const getCanvasReferencePreview = (item?: CanvasImageItem) => {
        if (!item) return '';
        const generatedOutput = getCanvasAiSuccessfulOutputs(item)[0];
        return generatedOutput
          ? getCanvasAiOutputThumbnailSource(generatedOutput)
          : item.item.thumbnail || getCanvasItemDisplaySource(item.item);
      };

      const toWorkflowResultReference = (
        reference: Record<string, unknown>,
        idPrefix: string,
        index: number,
      ): WorkflowResultReference | null => {
        const itemId = String(reference.itemId || '').trim();
        if (!itemId) return null;
        const drawerItem = itemsRef.current.find(item => item.id === itemId);
        const canvasItem = getRunCanvasItems().find(item => (
          item.id === itemId || item.item.id === itemId || item.item.sourceItemId === itemId
        ));
        return {
          id: `${idPrefix}:planned-reference:${itemId}:${index}`,
          nodeId: canvasItem?.id,
          itemId,
          name: getDrawerReferenceName(drawerItem) || canvasItem?.item.name || `灵感参考 ${index + 1}`,
          thumbnail: getDrawerReferencePreview(drawerItem) || getCanvasReferencePreview(canvasItem),
          role: String(reference.role || reference.referenceRole || '').trim() || undefined,
          reason: String(reference.reason || '').trim() || undefined,
        };
      };
      const localPlannedReferences: WorkflowResultReference[] = (
        workflowDesignReferencePlan?.references || []
      ).flatMap((reference, index) => {
        const resultReference = toWorkflowResultReference(reference, targetId, index);
        return resultReference ? [resultReference] : [];
      });
      const runtimePlannedReferences: WorkflowResultReference[] = runtimeItems.flatMap(runtimeItem => {
        const plan = runtimeItem.ai?.skillMeta?.designReferencePlan;
        const references = plan && typeof plan === 'object' && !Array.isArray(plan)
          ? (plan as Record<string, unknown>).references
          : undefined;
        if (!Array.isArray(references)) return [];
        return references.flatMap((value, index) => {
          if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
          const resultReference = toWorkflowResultReference(
            value as Record<string, unknown>,
            runtimeItem.id,
            index,
          );
          return resultReference ? [resultReference] : [];
        });
      });
      const plannedReferences = [...localPlannedReferences, ...runtimePlannedReferences];
      const externalReferences: WorkflowResultReference[] = inputCanvasItems.flatMap((inputItem, index) => {
        const output = getCanvasAiSuccessfulOutputs(inputItem)[0];
        const isVisual = inputItem.item.type === 'image'
          || inputItem.item.type === 'video'
          || Boolean(output && getCanvasAiOutputDisplaySource(output));
        if (!isVisual) return [];
        const sourceItemId = inputItem.item.sourceItemId || inputItem.item.id;
        return [{
          id: `${targetId}:external-reference:${inputItem.id}`,
          nodeId: inputItem.id,
          itemId: sourceItemId,
          name: inputItem.item.name || `工作流参考 ${index + 1}`,
          thumbnail: getCanvasReferencePreview(inputItem),
          role: referenceRoles.get(inputItem.id),
          reason: '作为本次工作流的视觉输入',
        } satisfies WorkflowResultReference];
      });
      const generationResults: WorkflowResultMedia[] = outputs
        .filter(output => output.status === 'success' && !!getCanvasAiOutputDisplaySource(output))
        .map((output, index) => ({
          id: output.id || `${targetId}:output:${index}`,
          nodeId: output.nodeId,
          name: output.name || output.nodeLabel || `生成结果 ${index + 1}`,
          mediaType: output.mediaType === 'video' ? 'video' : 'image',
          thumbnail: getCanvasAiOutputThumbnailSource(output),
          url: getCanvasAiOutputDisplaySource(output),
          status: 'success',
        }));
      const completedSteps = Array.from(runStatus.values()).filter(runState => runState === 'success').length;
      const result = buildWorkflowResultCardData({
        workflowId: workflow.id,
        workflowNodeId: targetId,
        workflowName: workflow.label,
        status,
        completedAt: Date.now(),
        completedSteps,
        totalSteps: runOrder.length,
        textAssets,
        inspirationReferences: [...plannedReferences, ...externalReferences],
        generationResults,
        error,
        tasks: workflow.nodes.map((node, index) => {
          const runtimeId = runtime.idMap.get(node.id) || node.id;
          return {
            id: node.id || runtimeId,
            label: node.item.name || node.ai?.presetLabel || `任务 ${index + 1}`,
            status: runStatus.get(runtimeId) || 'waiting',
          };
        }),
      });
      workflowResultPublisherRef.current(result);
      return result;
    };
    const publishWorkflowProgress = () => publishWorkflowResult(
      'running',
      collectModuleOutputs('working'),
      getRuntimeFailureSummary() || undefined,
    );

    updateModuleAi({
      status: 'working',
      error: undefined,
      outputs: outputDrafts,
      generatedAt: Date.now(),
      skillMeta: {
        ...(moduleNode.ai?.skillMeta || {}),
        originalRequest: workflowUserRequest || undefined,
        ...(workflowDesignReferencePlan ? {
          designReferencePlan: workflowDesignReferencePlan,
          localInspirationReferenceState: localInspirationContext?.usedExtraReferences ? 'selected' : 'none',
        } : {}),
      },
    });
    publishWorkflowProgress();
    if (activeCanvasIdRef.current === runCanvasId && isCanvasModeRef.current) {
      updateCanvasSelection([targetId]);
    }
    showToast(`开始运行工作流「${workflow.label}」：${runOrder.length} 个内部节点`);

    const updateRuntimeItemAi = (
      nodeId: string,
      patch: Partial<NonNullable<CanvasImageItem['ai']>>,
      content?: string
    ) => {
      runtimeItems = runtimeItems.map(item => {
        if (item.id !== nodeId) return item;
        const nextItem: CanvasImageItem = {
          ...item,
          ai: item.ai
            ? {
              ...item.ai,
              ...patch,
              type: patch.type || item.ai.type,
            }
            : item.ai,
          item: content === undefined ? item.item : {
            ...item.item,
            content,
            name: content.trim().split(/\r?\n/)[0]?.slice(0, 24) || item.item.name,
          },
        };
        return recoverCanvasAiNodeWithUsableResults(nextItem);
      });
    };
    const markRuntimeNodeSkipped = (nodeId: string, reason = '上游依赖失败') => {
      runStatus.set(nodeId, 'skipped');
      skippedIds.add(nodeId);
      failedIds.add(nodeId);
      const current = runtimeItems.find(item => item.id === nodeId);
      if (current?.ai?.type === 'image-generator') {
        updateRuntimeItemAi(nodeId, {
          status: 'error',
          error: reason,
          outputs: [],
          generatedAt: Date.now(),
        });
      } else if (isCanvasAgentTextTarget(current)) {
        runtimeItems = runtimeItems.map(item => (
          item.id === nodeId
            ? {
              ...item,
              item: {
                ...item.item,
                remark: reason,
              },
            }
            : item
        ));
      }
      publishWorkflowProgress();
    };
    const runRuntimeNode = async (nodeId: string) => {
      const current = runtimeItems.find(item => item.id === nodeId);
      if (!current) {
        runStatus.set(nodeId, 'failed');
        failedIds.add(nodeId);
        recordRuntimeNodeFailure(nodeId, '内部节点不存在');
        publishWorkflowProgress();
        return;
      }
      runStatus.set(nodeId, 'running');
      publishWorkflowProgress();
      if (isCanvasAgentTextTarget(current)) {
        try {
          const output = await runCanvasTextAgentTarget(current, {
            sourceItems: getRuntimeSourceItems,
            getLatestTarget: () => runtimeItems.find(item => item.id === nodeId),
            updateTextOutput: (textOutput) => {
              runtimeItems = runtimeItems.map(item => (
                item.id === nodeId
                  ? {
                    ...item,
                    item: {
                      ...item.item,
                      remark: textOutput,
                    },
                  }
                  : item
              ));
            },
            showResultToast: false,
            showReferenceToast: false,
          });
          if (output.trim()) {
            runStatus.set(nodeId, 'success');
            completedCount += 1;
            updateModuleAi({
              outputs: collectModuleOutputs('working'),
              workflowRuntime: getRuntimeSnapshots(),
              status: 'working',
              error: undefined,
              generatedAt: Date.now(),
            });
            publishWorkflowProgress();
          } else {
            runStatus.set(nodeId, 'failed');
            failedIds.add(nodeId);
            const summary = recordRuntimeNodeFailure(nodeId, 'Agent API 没有返回文字结果');
            runtimeItems = runtimeItems.map(item => (
              item.id === nodeId
                ? { ...item, item: { ...item.item, remark: `运行失败：${summary}` } }
                : item
            ));
            publishWorkflowProgress();
          }
        } catch (error) {
          console.warn('Workflow text node failed', error);
          runStatus.set(nodeId, 'failed');
          failedIds.add(nodeId);
          const summary = recordRuntimeNodeFailure(nodeId, error);
          runtimeItems = runtimeItems.map(item => (
            item.id === nodeId
              ? { ...item, item: { ...item.item, remark: `运行失败：${summary}` } }
              : item
          ));
          publishWorkflowProgress();
        }
        return;
      }
      if (current.ai?.type !== 'image-generator') {
        runStatus.set(nodeId, 'success');
        completedCount += 1;
        publishWorkflowProgress();
        return;
      }
      if (getCanvasAiSuccessfulOutputs(current).some(isCanvasAiImageOutputReadyForWorkflowDependency)) {
        runStatus.set(nodeId, 'success');
        completedCount += 1;
        publishWorkflowProgress();
        return;
      }
      await runCanvasAiGeneratorTarget(current, {
        canvasId: runCanvasId,
        sourceItems: getRuntimeSourceItems,
        updateAi: (patch, content) => updateRuntimeItemAi(nodeId, patch, content),
        getLatestTarget: () => runtimeItems.find(item => item.id === nodeId),
        showResultToast: false,
        requireLocalImageOutputs: true,
      });
      const latest = runtimeItems.find(item => item.id === nodeId);
      if (getCanvasAiSuccessfulOutputs(latest).some(isCanvasAiImageOutputReadyForWorkflowDependency)) {
        runStatus.set(nodeId, 'success');
        completedCount += 1;
        updateModuleAi({
          outputs: collectModuleOutputs('working'),
          workflowRuntime: getRuntimeSnapshots(),
          status: 'working',
          error: undefined,
          generatedAt: Date.now(),
        });
        publishWorkflowProgress();
      } else {
        runStatus.set(nodeId, 'failed');
        failedIds.add(nodeId);
        recordRuntimeNodeFailure(
          nodeId,
          latest?.ai?.error
            || latest?.ai?.outputs?.find(output => output.status === 'error' && output.error)?.error
            || '图片生成节点没有返回可用结果'
        );
        publishWorkflowProgress();
      }
    };

    while (Array.from(runStatus.values()).some(status => status === 'waiting' || status === 'ready')) {
      let changed = false;
      for (const nodeId of runOrder) {
        if (runStatus.get(nodeId) !== 'waiting') continue;
        const dependencies = dependencyMap.get(nodeId) || [];
        if (dependencies.some(inputId => {
          const status = runStatus.get(inputId);
          return (status === 'failed' || status === 'skipped')
            && !isToleratedDependencyFailure(nodeId, inputId);
        })) {
          markRuntimeNodeSkipped(nodeId);
          changed = true;
          continue;
        }
        if (dependencies.every(inputId => {
          const status = runStatus.get(inputId);
          return status === 'success'
            || ((status === 'failed' || status === 'skipped')
              && isToleratedDependencyFailure(nodeId, inputId));
        })) {
          runStatus.set(nodeId, 'ready');
          changed = true;
        }
      }
      const readyIds = runOrder.filter(nodeId => runStatus.get(nodeId) === 'ready');
      if (readyIds.length > 0) {
        await Promise.all(readyIds.map(runRuntimeNode));
        changed = true;
        continue;
      }
      if (!changed) {
        runOrder
          .filter(nodeId => runStatus.get(nodeId) === 'waiting')
          .forEach(nodeId => markRuntimeNodeSkipped(nodeId, 'DAG 调度无法继续，可能存在未满足的依赖'));
        break;
      }
    }

    const workflowError = getRuntimeFailureSummary() || '部分终端输出没有生成';
    const finalOutputs = collectModuleOutputs(
      'error',
      failedIds.size > 0 ? workflowError : '没有生成这个输出'
    );
    const finalSuccessCount = finalOutputs.filter(output => output.status === 'success' && getCanvasAiOutputDisplaySource(output)).length;
    if (failedIds.size > 0 || finalSuccessCount < outputSlots.length) {
      updateModuleAi({
        outputs: finalOutputs,
        workflowRuntime: getRuntimeSnapshots(),
        status: 'error',
        error: workflowError,
        generatedAt: Date.now(),
      });
      showToast(failedIds.size > 0
        ? `工作流「${workflow.label}」部分完成：成功 ${completedCount} 个，失败/中断 ${failedIds.size} 个`
        : `工作流「${workflow.label}」部分输出缺失`);
      notifyCanvasAiGenerationResult({
        status: 'partial',
        label: `工作流「${workflow.label}」`,
        mediaType: 'image',
        generatedCount: finalSuccessCount,
        requestedCount: outputSlots.length,
        error: workflowError,
      });
      return publishWorkflowResult(finalSuccessCount > 0 || completedCount > 0 ? 'partial' : 'error', finalOutputs, workflowError);
    }
    updateModuleAi({
      outputs: finalOutputs,
      workflowRuntime: getRuntimeSnapshots(),
      status: 'success',
      error: undefined,
      generatedAt: Date.now(),
    });
    showToast(`工作流「${workflow.label}」完成：生成 ${finalOutputs.filter(output => getCanvasAiOutputDisplaySource(output)).length} 张结果`);
    notifyCanvasAiGenerationResult({
      status: 'success',
      label: `工作流「${workflow.label}」`,
      mediaType: 'image',
      generatedCount: finalSuccessCount,
      requestedCount: outputSlots.length,
    });
    return publishWorkflowResult('success', finalOutputs);
    } finally {
      releaseCanvasAiRun(canvasAiRunTokensRef.current, runKey, runToken);
      await waitForCanvasBackgroundPatches(runCanvasId);
      markCanvasRunNodeSettled(runCanvasId, targetId);
    }

};

export const generateCanvasWorkflowModuleNodeImpl = async (ctx: Pick<canvasWorkflowRuntimeActionContext, 'appendCanvasItems' | 'canvasItemsRef' | 'cloneCanvasWorkflowModuleForRerun' | 'commitCanvasAiPromptDraft' | 'runCanvasWorkflowModuleNode' | 'showToast'>, targetId: string) => {
  const { appendCanvasItems, canvasItemsRef, cloneCanvasWorkflowModuleForRerun, commitCanvasAiPromptDraft, runCanvasWorkflowModuleNode, showToast } = ctx;
    commitCanvasAiPromptDraft(targetId, undefined, true);
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!target || target.ai?.type !== 'workflow') return;
    if (!hasCanvasAiGeneratedResults(target)) {
      await runCanvasWorkflowModuleNode(targetId);
      return;
    }
    const nextNode = cloneCanvasWorkflowModuleForRerun(target);
    if (!nextNode) return;
    if (appendCanvasItems([nextNode], '再次运行工作流') <= 0) return;
    showToast('已复制工作流模块，开始再次运行');
    await runCanvasWorkflowModuleNode(nextNode.id);

};

export const runSelectedCanvasWorkflowModulesImpl = async (ctx: Pick<canvasWorkflowRuntimeActionContext, 'canvasItemsRef' | 'generateCanvasWorkflowModuleNode' | 'showToast'>, seedIds: string[]) => {
  const { canvasItemsRef, generateCanvasWorkflowModuleNode, showToast } = ctx;
    const workflowIds = seedIds.filter(id => canvasItemsRef.current.find(item => item.id === id)?.ai?.type === 'workflow');
    if (workflowIds.length === 0) {
      showToast('先选中一个工作流模块');
      return;
    }
    for (const workflowId of workflowIds) {
      await generateCanvasWorkflowModuleNode(workflowId);
    }

};

export const addCanvasTemplateValuesAtDropImpl = async (ctx: Pick<canvasWorkflowRuntimeActionContext, 'appendCanvasItems' | 'buildCanvasAiGeneratorNode' | 'buildCanvasWorkflowModuleNode' | 'canvasWorkflowTemplates' | 'getCanvasDropPosition' | 'getCanvasTemplateImportPayload' | 'getSelectedCanvasAiInputIds' | 'materializeImportedCanvasWorkflows' | 'setCustomCanvasAiPromptPresets' | 'setCustomCanvasWorkflows' | 'updateCanvasNodesForPreset'>, rawValues: unknown[], client?: { x: number; y: number }) => {
  const { appendCanvasItems, buildCanvasAiGeneratorNode, buildCanvasWorkflowModuleNode, canvasWorkflowTemplates, getCanvasDropPosition, getCanvasTemplateImportPayload, getSelectedCanvasAiInputIds, materializeImportedCanvasWorkflows, setCustomCanvasAiPromptPresets, setCustomCanvasWorkflows, updateCanvasNodesForPreset } = ctx;
    const payload = rawValues.reduce<{
      presets: CanvasAiPromptPreset[];
      workflows: CanvasWorkflowTemplate[];
    }>((result, value) => {
      const parsed = getCanvasTemplateImportPayload(value);
      result.presets.push(...parsed.presets);
      result.workflows.push(...parsed.workflows);
      return result;
    }, { presets: [] as CanvasAiPromptPreset[], workflows: [] as CanvasWorkflowTemplate[] });
    const presetMap = new Map<string, CanvasAiPromptPreset>();
    payload.presets.slice(0, 48).forEach(preset => presetMap.set(preset.id, preset));
    const presets = Array.from(presetMap.values());

    const usedWorkflowIds = new Set(canvasWorkflowTemplates.map(workflow => workflow.id));
    const materializedWorkflows = await materializeImportedCanvasWorkflows(payload.workflows.slice(0, 48));
    const workflows = materializedWorkflows.flatMap((workflow, index) => {
      let nextId = '';
      do {
        nextId = `imported-workflow-${Date.now().toString(36)}-${index}-${Math.random().toString(36).substring(2, 6)}`;
      } while (usedWorkflowIds.has(nextId));
      usedWorkflowIds.add(nextId);
      const imported = normalizeCanvasWorkflowTemplate({
        ...workflow,
        id: nextId,
        builtin: false,
        createdAt: Date.now() + index,
      });
      if (!imported) return [];
      const validation = validateCanvasWorkflowTemplate(imported);
      if (validation.errors.length > 0) {
        console.warn('Dropped canvas workflow validation failed:', validation.errors, imported);
        return [];
      }
      return [imported];
    });

    if (presets.length === 0 && workflows.length === 0) {
      return { recognized: false, created: 0, presetCount: 0, workflowCount: 0 };
    }

    if (presets.length > 0) {
      setCustomCanvasAiPromptPresets(prev => {
        const next = new Map(prev.map(preset => [preset.id, preset]));
        presets.forEach(preset => next.set(preset.id, preset));
        return Array.from(next.values()).slice(0, 48);
      });
      presets.forEach(updateCanvasNodesForPreset);
    }
    if (workflows.length > 0) {
      setCustomCanvasWorkflows(prev => [...workflows, ...prev].slice(0, 48));
    }

    const selectedInputIds = getSelectedCanvasAiInputIds();
    const base = getCanvasDropPosition(0, client);
    const positionForIndex = (index: number) => ({
      x: base.x + (index % 3) * 440,
      y: base.y + Math.floor(index / 3) * 600,
    });
    const createdItems: CanvasImageItem[] = [];
    presets.forEach(preset => {
      createdItems.push(buildCanvasAiGeneratorNode(
        positionForIndex(createdItems.length),
        preset,
        selectedInputIds,
      ));
    });
    workflows.forEach(workflow => {
      const item = buildCanvasWorkflowModuleNode(
        workflow,
        positionForIndex(createdItems.length),
        selectedInputIds,
      );
      if (item) createdItems.push(item);
    });
    const created = appendCanvasItems(createdItems, '拖入画布 JSON 预设');
    return {
      recognized: true,
      created,
      presetCount: presets.length,
      workflowCount: workflows.length,
    };

};

export const addCanvasDroppedTemplateJsonSourcesImpl = async (ctx: Pick<canvasWorkflowRuntimeActionContext, 'addCanvasTemplateValuesAtDrop' | 'showToast'>, sources: Array<{ name: string; read: () => Promise<unknown> }>, client?: { x: number; y: number }) => {
  const { addCanvasTemplateValuesAtDrop, showToast } = ctx;
    if (sources.length === 0) return false;
    const values: unknown[] = [];
    let failedCount = 0;
    for (const source of sources) {
      try {
        const rawValue = await source.read();
        values.push(typeof rawValue === 'string'
          ? JSON.parse(rawValue) as unknown
          : rawValue);
      } catch (error) {
        failedCount += 1;
        console.warn(`画布 JSON 文件读取失败：${source.name}`, error);
      }
    }
    let result: Awaited<ReturnType<typeof addCanvasTemplateValuesAtDrop>>;
    try {
      result = await addCanvasTemplateValuesAtDrop(values, client);
    } catch (error) {
      console.warn('Failed to restore embedded workflow images:', error);
      const message = error instanceof Error ? error.message : '';
      showToast(message ? `JSON 图片导入失败：${message}` : 'JSON 图片导入失败');
      return true;
    }
    if (!result.recognized) {
      showToast(failedCount > 0 && values.length === 0
        ? 'JSON 文件读取失败，请检查文件内容'
        : '未识别到节点预设或工作流预设');
      return true;
    }
    showToast(
      `已从 JSON 添加 ${result.presetCount} 个节点预设、${result.workflowCount} 个工作流${failedCount > 0 ? `，${failedCount} 个文件失败` : ''}`
    );
    return true;

};

export const addCanvasDroppedFilesImpl = async (ctx: Pick<canvasWorkflowRuntimeActionContext, 'addCanvasImageItems' | 'createCanvasImageItemFromFile' | 'createCanvasVideoItemFromPath' | 'lastCanvasDropAtRef' | 'lastCanvasDroppedPathsKeyRef'>, files: FileList | File[], client?: { x: number; y: number }) => {
  const { addCanvasImageItems, createCanvasImageItemFromFile, createCanvasVideoItemFromPath, lastCanvasDropAtRef, lastCanvasDroppedPathsKeyRef } = ctx;
    const allFiles = Array.from(files || []);
    const templateFiles = allFiles.filter(file => isCanvasTemplateJsonFileName(file.name));
    const imageFiles = allFiles.filter(file => file.type.startsWith('image/') || isCanvasImageFileName(file.name));
    const videoFiles = allFiles.filter(file => file.type.startsWith('video/') || isCanvasVideoFileName(file.name));
    if (templateFiles.length === 0 && imageFiles.length === 0 && videoFiles.length === 0) return false;

    const mediaFiles = [...imageFiles, ...videoFiles];
    if (mediaFiles.length > 0) {
      lastCanvasDroppedPathsKeyRef.current = mediaFiles.map(file => `${file.name}:${file.size}:${file.lastModified}`).join('\n');
      lastCanvasDropAtRef.current = Date.now();
    }

    // Local JSON files are handled by the native path event. Do not call
    // File.text() here: image-bearing workflow JSON can contain tens of
    // megabytes of Base64 and loading it into WebView2 is enough to crash the
    // renderer before Rust can cache the embedded image.
    const handledTemplates = templateFiles.length > 0;

    const createdImages = await Promise.all(imageFiles.map((file, index) => createCanvasImageItemFromFile(file, index, client)));
    const imageItems = createdImages.filter((item): item is CanvasImageItem => !!item);
    const videoPaths = videoFiles
      .map(file => (file as File & { path?: string }).path || '')
      .filter(Boolean);
    const createdVideos = await Promise.all(videoPaths.map((path, index) => createCanvasVideoItemFromPath(path, imageItems.length + index, client)));
    const videoItems = createdVideos.filter((item): item is CanvasImageItem => !!item);
    const nextItems = [...imageItems, ...videoItems];
    addCanvasImageItems(nextItems);
    return handledTemplates || nextItems.length > 0;

};

export const addCanvasDroppedPathsImpl = async (ctx: Pick<canvasWorkflowRuntimeActionContext, 'addCanvasDroppedTemplateJsonSources' | 'addCanvasImageItems' | 'createCanvasImageItemFromPath' | 'createCanvasVideoItemFromPath' | 'lastCanvasDropAtRef' | 'lastCanvasDroppedPathsKeyRef' | 'showToast'>, paths: string[], client?: { x: number; y: number }) => {
  const { addCanvasDroppedTemplateJsonSources, addCanvasImageItems, createCanvasImageItemFromPath, createCanvasVideoItemFromPath, lastCanvasDropAtRef, lastCanvasDroppedPathsKeyRef, showToast } = ctx;
    let cleanPaths = Array.from(new Set((paths || []).map(normalizeLocalDragPath).filter(Boolean)));
    if (cleanPaths.length === 0) return;

    const now = Date.now();
    const recentDrop = now - lastCanvasDropAtRef.current < 700;
    const initialKey = cleanPaths.join('\n');
    if (initialKey === lastCanvasDroppedPathsKeyRef.current && recentDrop) return;
    if (recentDrop) {
      // A DOM drop may already have handled media files from the same gesture.
      // Keep the JSON path so the native importer can safely extract embedded
      // images, while avoiding duplicate image/video nodes.
      cleanPaths = cleanPaths.filter(isCanvasTemplateJsonFileName);
      if (cleanPaths.length === 0) return;
    }
    const key = cleanPaths.join('\n');
    if (key === lastCanvasDroppedPathsKeyRef.current && recentDrop) return;
    lastCanvasDroppedPathsKeyRef.current = key;
    lastCanvasDropAtRef.current = now;

    const templatePaths = cleanPaths.filter(isCanvasTemplateJsonFileName);
    const directMediaPaths = cleanPaths.filter(path => !isCanvasTemplateJsonFileName(path));
    const handledTemplates = await addCanvasDroppedTemplateJsonSources(
      templatePaths.map(path => ({
        name: path.split(/[\\/]/).pop() || path,
        read: () => invoke<unknown>('read_canvas_template_json', { path }),
      })),
      client,
    );
    if (directMediaPaths.length === 0) return;

    let mediaPaths = directMediaPaths;
    try {
      const collected = await invoke<string[]>('collect_drop_media_paths', { paths: directMediaPaths });
      if (Array.isArray(collected) && collected.length > 0) {
        mediaPaths = Array.from(new Set(collected.map(normalizeLocalDragPath).filter(Boolean)));
      }
    } catch (err) {
      console.warn('扫描拖入文件夹失败，回退为直接路径处理:', err);
    }
    console.info('[canvas-drop] media paths', { input: directMediaPaths.length, media: mediaPaths.length, first: mediaPaths.slice(0, 5) });

    const created = await Promise.all(mediaPaths.map((path, index) => (
      isCanvasVideoFileName(path)
        ? createCanvasVideoItemFromPath(path, index, client)
        : createCanvasImageItemFromPath(path, index, client)
    )));
    const mediaItems = created.filter((item): item is CanvasImageItem => !!item);
    addCanvasImageItems(mediaItems);
    if (!handledTemplates && mediaItems.length === 0) showToast('无限画布只接收图片或视频');
    else if (mediaItems.length > 0 && mediaItems.length !== mediaPaths.length) {
      showToast(`已添加 ${mediaItems.length} 个媒体，${mediaPaths.length - mediaItems.length} 个文件暂未显示`);
    }

};

export const createDrawerMediaCanvasNodeImpl = async (ctx: Pick<canvasWorkflowRuntimeActionContext, 'appendCanvasItems' | 'assetStorageMode' | 'canvasItemsRef' | 'createAssetId' | 'getCanvasDropPosition' | 'itemsRef' | 'makeCanvasNodeId' | 'showToast'>, itemId: string, client?: { x: number; y: number }, options: { reuseExisting?: boolean; select?: boolean; toast?: boolean; label?: string; dropIndex?: number } = {}) => {
  const { appendCanvasItems, assetStorageMode, canvasItemsRef, createAssetId, getCanvasDropPosition, itemsRef, makeCanvasNodeId, showToast } = ctx;
    const source = itemsRef.current.find(item => item.id === itemId)
      || (assetStorageMode === 'sqlite' ? await getAssetById(itemId) : null);
    if (!source || !isCanvasDrawerMediaItem(source)) return '';
    const rawSource = getCanvasDrawerMediaSource(source);
    const sourceAsset = source.path && rawSource === source.path && !/^(?:asset:|file:|blob:|data:|https?:)/i.test(rawSource)
      ? convertFileSrc(rawSource)
      : rawSource;
    const mediaLabel = source.type === 'video' ? '视频' : '图片';
    if (!sourceAsset) {
      if (options.toast !== false) showToast(`${mediaLabel}源丢失，无法添加到画布`);
      return '';
    }
    if (options.reuseExisting) {
      const existing = canvasItemsRef.current.find(item => (
        item.item.type === source.type && item.item.sourceItemId === source.id
      ));
      if (existing) return existing.id;
    }

    const item: BufferItem = {
      ...source,
      id: createAssetId(),
      sourceItemId: source.id,
      createdAt: Date.now(),
      isQuickAccess: false,
    };
    const pos = getCanvasDropPosition(options.dropIndex || 0, client);
    const canvasId = makeCanvasNodeId(item.id, source.type);
    const preview = getCanvasDrawerMediaPreviewSource(source);
    const size = source.type === 'video'
      ? preview ? await readImageDisplaySize(preview) : { width: 320, height: 180 }
      : await readImageDisplaySize(sourceAsset);
    const canvasItem = {
      id: canvasId,
      item,
      x: pos.x,
      y: pos.y,
      width: size.width,
      height: size.height,
    };
    if (appendCanvasItems([canvasItem], options.label || `添加${mediaLabel}到画布`, options.select !== false) === 0) return '';
    if (options.toast !== false) showToast('已添加到无限画布');
    return canvasId;

};
