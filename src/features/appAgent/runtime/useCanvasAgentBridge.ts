import React from 'react';
import { BufferItem,Folder } from '../../../types';
import type { CanvasAiPromptPreset } from '../../../types/canvasWorkflow';
import type { DrawerTabType } from '../../../types/drawer';
import { getCanvasWorkflowTemplateFromNode } from '../../../utils/canvasItemSelectors';
import { type AgentCanvasSelectionItem,type AgentCanvasVisualReference } from '../../agentModel';
import { addLocalDays,parseDateInputValue,startOfLocalDay,type SchedulePriority } from '../../calendarModel';
import { getCanvasAiNodeTitle } from '../../canvasAiRuntime';
import { type CanvasImageItem } from '../../canvasModel';
import { type CanvasWorkflowTemplate } from '../../canvasTemplates';
import { normalizeCanvasWorkflowUserInput } from '../../canvasWorkflowUserInput';
import { useCanvasAgentRuntime } from '../../useCanvasAgentRuntime';
import { resolveWorkflowInputs } from '../commands/workflowInputResolver';
import { executeCanvasCreationTool } from '../tools/canvasCreationToolActions';
import { executeCanvasWorkflowTool } from '../tools/canvasWorkflowToolActions';
import { executeDrawerAgentTool } from '../tools/drawerAgentToolActions';
import type { WorkflowRecipeDraft } from '../workflows/workflowRecipeTypes';

export type CanvasAgentBridgeContext = { activeFolderIdStateRef: React.RefObject<string>; activeTabRef: React.RefObject<DrawerTabType>; activeWorkflowDraftRef: React.RefObject<WorkflowRecipeDraft | null>; buildAgentCalendarEvents: (limit?: number) => { id: string; noteLabel: string; scheduleId: string; title: string; done: boolean; priority: SchedulePriority; startAt: number | undefined; tagIds: string[]; sourceTitle: string; }[]; buildCanvasAgentSelectedItems: (sourceItems?: CanvasImageItem[], sourceSelectedIds?: string[]) => AgentCanvasSelectionItem[]; calendarMonth: number; calendarSelectedDate: number; calendarTagFilter: string; canvasAiPromptPresets: CanvasAiPromptPreset[]; canvasItemsRef: React.RefObject<CanvasImageItem[]>; canvasSelectedIdsRef: React.RefObject<string[]>; canvasWorkflowTemplates: CanvasWorkflowTemplate[]; createDrawerMediaCanvasNode: (itemId: string, client?: { x: number; y: number; }, options?: { reuseExisting?: boolean; select?: boolean; toast?: boolean; label?: string; dropIndex?: number; }) => Promise<string>; createWorkflowAttachmentImageCanvasNode: (reference: AgentCanvasVisualReference, options?: { select?: boolean; label?: string; }) => Promise<string>; drawerAgentSelectedItems: AgentCanvasSelectionItem[]; enterCanvasMode: () => void; foldersRef: React.RefObject<Folder[]>; getSelectedCanvasAiInputIds: () => string[]; isCanvasModeRef: React.RefObject<boolean>; isPinnedRef: React.RefObject<boolean>; itemsRef: React.RefObject<BufferItem[]>; prepareCanvasAgentVisualReferences: (references: AgentCanvasVisualReference[], provider: "openai-compatible" | "codex", maxReferences?: number) => Promise<AgentCanvasVisualReference[]>; searchQuery: string; selectedIds: string[]; showToast: (message: string) => void; updateCanvasItemsImmediate: (updater: (prev: CanvasImageItem[]) => CanvasImageItem[]) => CanvasImageItem[]; } & Record<string, any>;

export function useCanvasAgentBridge(ctx: CanvasAgentBridgeContext) {
  const { activeFolderIdStateRef, activeTabRef, activeWorkflowDraftId, activeWorkflowDraftRef, addDrawerMediaItemToCanvas, addWebImageUrl, analyzeDrawerInspirationWithLlm, appendCanvasItems, appWindow, assetStorageMode, AUTO_INSPIRATION_ANALYSIS_ENABLED, buildAgentCalendarEvents, buildCanvasAgentSelectedItems, buildCanvasAiGeneratorNode, buildCanvasEnhancementNode, buildCanvasFrameInterpolationNode, buildCanvasWorkflowModuleNode, buildCanvasWorkflowSaveDraftFromSelection, CALENDAR_NEW_NOTE_TARGET, calendarEvents, calendarMonth, calendarSelectedDate, calendarTagFilter, calendarTargetNoteLabel, canvasAiPromptPresets, canvasAiProvider, canvasItemsRef, canvasScaleRef, canvasSelectedIdsRef, canvasSurfaceRef, canvasTextAreaRefs, canvasWorkflowTemplates, connectCanvasItems, createAssetId, createCanvasTextItemFromContent, createDrawerMediaCanvasNode, createFloatingNote, createTextOrUrlItem, createWorkflowAttachmentImageCanvasNode, deleteCalendarScheduleItem, drawerAgentSelectedItems, drawerOrganizationPlansRef, duplicateCanvasItems, ensureCalendarScheduleNote, enterCanvasMode, fitCanvasViewToItems, foldersRef, generateCanvasAiGeneratorNode, generateCanvasWorkflowModuleNode, getCanvasDropPosition, getCanvasItemsBounds, getSelectedCanvasAiInputIds, getSelectedEnhancementInputIds, getSelectedFrameInterpolationInputIds, handleDeleteFolder, handleOpenTextInput, handleTogglePin, insertDrawerFolderAtTop, inspirationAnalysisJobsRef, isCanvasModeRef, isPinnedRef, itemsRef, jumpCalendarToday, leaveCanvasToDrawer, makeCanvasNodeId, openSelectedImagePreview, openSelectedVideoPreview, organizeCanvasItems, patchCalendarScheduleItem, persistFoldersSnapshot, prepareCanvasAgentVisualReferences, pushCanvasUndoSnapshot, pushDrawerUndoSnapshot, removeCanvasConnection, removeCanvasItemsByIds, removeDrawerItemsFromDrawer, retrieveDrawerInspirationCandidates, runCanvasTextAgentNode, runSelectedCanvasWorkflowModules, scheduleCanvasFocusItemById, searchQuery, selectedIds, setActiveDraftForDisplay, setActiveFolderId, setActiveTab, setActiveWorkflowDraftId, setAssetStatsRevision, setCalendarMonth, setCalendarSelectedDate, setCalendarTargetNoteLabel, setCustomCanvasAiPromptPresets, setCustomCanvasWorkflows, setDrawerState, setFolders, setIsDrawerAgentOpen, setIsOpen, setIsPinned, setIsSearchActive, setIsSelectMode, setItems, setQuickAccessItems, setSearchQuery, setSelectedIds, setShowSettings, setShowTextInput, setShowWebImageCollector, setShowWorkflowDraftPanel, showToast, startDrawerInspirationAnalysisBatch, stateRef, syncCalendarScheduleSnapshot, undoLastCanvasChange, undoLastDrawerChange, updateCanvasAiGeneratorData, updateCanvasItemsImmediate, updateCanvasNodesForPreset, updateCanvasSelection, updateCanvasTextItem, zoomCanvasAt } = ctx;
  return useCanvasAgentRuntime({
    getContext: () => {
      const surface = isCanvasModeRef.current ? 'canvas' : 'drawer';
      const selectedItems = surface === 'canvas'
        ? buildCanvasAgentSelectedItems()
        : drawerAgentSelectedItems;
      const selectedVisualReferences = selectedItems.flatMap(item => item.references || []);
      const drawerSearch = String(searchQuery || '').trim().toLowerCase();
      const selectedDrawerIds = new Set([
        ...selectedIds,
        ...selectedItems.map(item => item.id),
        ...selectedItems.map(item => item.sourceItemId || '').filter(Boolean),
        ...selectedVisualReferences.map(reference => reference.sourceItemId || '').filter(Boolean),
      ]);
      const drawerItemsForAgentContext = itemsRef.current
        .filter(item => {
          if (selectedDrawerIds.has(item.id)) return true;
          // With no explicit selection/search, expose lightweight metadata for
          // main-drawer images so canvas state inspection can actually discover
          // the references visible on the drawer home page.
          if (!drawerSearch) return !item.folderId && item.type === 'image';
          return [
            item.id,
            item.name,
            item.content,
            item.folderId,
            ...(item.remarks || []),
          ].filter(Boolean).join(' ').toLowerCase().includes(drawerSearch);
        })
        .slice(0, 40);
      return {
        surface,
        selectedIds: surface === 'canvas' ? [...canvasSelectedIdsRef.current] : [...selectedIds],
        selectedItems,
        visualReferences: selectedVisualReferences,
        calendar: {
          activeDate: calendarSelectedDate,
          activeMonth: calendarMonth,
          tagFilter: calendarTagFilter,
          events: buildAgentCalendarEvents(),
        },
        nodes: canvasItemsRef.current.slice(0, 160).map(canvasItem => ({
          id: canvasItem.id,
          sourceItemId: canvasItem.item.sourceItemId,
          type: canvasItem.ai?.type || canvasItem.item.type,
          name: canvasItem.item.name || getCanvasAiNodeTitle(canvasItem.ai),
          prompt: canvasItem.ai?.prompt || canvasItem.item.content || undefined,
          inputs: [...(canvasItem.inputs || [])],
          status: canvasItem.ai?.status,
        })),
        presets: canvasAiPromptPresets.map(preset => ({
          id: preset.id,
          label: preset.label,
          hint: preset.hint,
        })),
        workflows: canvasWorkflowTemplates.map(workflow => ({
          id: workflow.id,
          label: workflow.label,
          hint: workflow.hint,
          userInput: normalizeCanvasWorkflowUserInput(workflow.userInput),
        })),
        drawer: {
          activeTab: activeTabRef.current,
          activeFolderId: activeFolderIdStateRef.current,
          searchQuery,
          pinned: isPinnedRef.current,
          folders: foldersRef.current.slice(0, 120).map(folder => ({
            id: folder.id,
            name: folder.name,
            parentId: folder.parentId,
          })),
          items: drawerItemsForAgentContext.map(item => ({
            id: item.id,
            type: item.type,
            name: item.name || item.content || '未命名素材',
            content: item.type === 'text' ? item.content.slice(0, 320) : undefined,
            folderId: item.folderId,
            quickAccess: item.isQuickAccess,
            remarks: item.remarks || (item.remark ? [item.remark] : undefined),
            inspirationProfile: item.inspirationProfile,
          })),
        },
      };
    },
    getActiveDraft: () => activeWorkflowDraftRef.current,
    prepareVisualReferences: (context, provider) => (
      prepareCanvasAgentVisualReferences(context.visualReferences || [], provider)
    ),
    executeTool: async (name, args, execution) => {
      const snapshot = execution?.snapshot;
      const executionUserRequest = String(execution?.userRequest || '').trim();
      const hasSelectionSnapshot = snapshot !== undefined;
      const snapshotSelectedIds = Array.isArray(snapshot?.selectedIds)
        ? snapshot.selectedIds.map(String)
        : [];
      const snapshotSurface = snapshot?.surface || (isCanvasModeRef.current ? 'canvas' : 'drawer');
      const snapshotCalendarDate = Number(snapshot?.calendar?.activeDate);
      const agentCalendarDate = Number.isFinite(snapshotCalendarDate)
        ? snapshotCalendarDate
        : calendarSelectedDate;
      const agentCalendarTagFilter = snapshot?.calendar?.tagFilter || calendarTagFilter;
      const parseAgentDate = (value: unknown, fallback = agentCalendarDate) => {
        const text = String(value || '').trim();
        if (!text) return startOfLocalDay(fallback);
        if (text === '今天') return startOfLocalDay(Date.now());
        if (text === '明天') return addLocalDays(Date.now(), 1);
        if (text === '后天') return addLocalDays(Date.now(), 2);
        const parsed = parseDateInputValue(text);
        if (parsed !== undefined) return startOfLocalDay(parsed);
        const native = Date.parse(text);
        if (Number.isFinite(native)) return startOfLocalDay(native);
        throw new Error(`无法识别日期：${text}`);
      };
      const uniqueAgentIds = (ids: string[]) => Array.from(new Set(ids.map(String).filter(Boolean)));
      const collectAgentBoundNodeIds = (value: unknown): string[] => {
        if (Array.isArray(value)) return value.map(String).filter(Boolean);
        if (!value || typeof value !== 'object') return [];
        const record = value as Record<string, unknown>;
        return [
          typeof record.nodeId === 'string' ? record.nodeId : '',
          ...(Array.isArray(record.nodeIds) ? record.nodeIds.map(String) : []),
        ].filter(Boolean);
      };
      const getExistingCanvasIds = (ids: string[]) => {
        const existingIds = new Set(canvasItemsRef.current.map(item => item.id));
        return uniqueAgentIds(ids).filter(id => existingIds.has(id));
      };
      const getAgentWorkflowCanvasNodes = () => canvasItemsRef.current.map(item => ({
        id: item.id,
        sourceItemId: item.item.sourceItemId,
        type: item.ai?.type || item.item.type,
        name: item.item.name || getCanvasAiNodeTitle(item.ai),
        path: item.item.path,
        url: item.item.url,
        thumbnail: item.item.thumbnail,
        sourceUrl: item.item.sourceUrl,
        originalUrl: item.item.originalUrl,
        hasSourceAsset: item.item.type !== 'image' || !!(item.item.url || item.item.path || item.item.thumbnail || item.item.sourceUrl || item.item.originalUrl),
        thumbnailPending: item.item.type === 'image' && !!(item.item.url || item.item.path || item.item.sourceUrl || item.item.originalUrl) && !item.item.thumbnail,
        inputs: [...(item.inputs || [])],
        createdAt: item.item.createdAt,
        item: {
          type: item.item.type,
          sourceItemId: item.item.sourceItemId,
          createdAt: item.item.createdAt,
          path: item.item.path,
          url: item.item.url,
          thumbnail: item.item.thumbnail,
          sourceUrl: item.item.sourceUrl,
          originalUrl: item.item.originalUrl,
          hasSourceAsset: item.item.type !== 'image' || !!(item.item.url || item.item.path || item.item.thumbnail || item.item.sourceUrl || item.item.originalUrl),
          thumbnailPending: item.item.type === 'image' && !!(item.item.url || item.item.path || item.item.sourceUrl || item.item.originalUrl) && !item.item.thumbnail,
        },
        ai: item.ai ? { type: item.ai.type } : undefined,
      }));
      const getAgentWorkflowSelectedDrawerItems = () => {
        const drawerIds = uniqueAgentIds([
          ...(snapshotSurface === 'drawer' ? snapshotSelectedIds : []),
          ...(snapshotSurface === 'drawer' ? selectedIds : []),
          ...(snapshot?.selectedItems || []).flatMap(item => [item.id, item.sourceItemId || '']),
          ...(snapshot?.visualReferences || []).map(reference => reference.sourceItemId || ''),
        ]);
        const drawerItemById = new Map(itemsRef.current.map(item => [item.id, item]));
        return drawerIds
          .map(id => drawerItemById.get(id))
          .filter((item): item is BufferItem => !!item && item.type === 'image');
      };
      const resolveAgentWorkflowInputIds = async (
        workflow: CanvasWorkflowTemplate,
        requestedInputIds: string[] = [],
        options: {
          allowMissingRequired?: boolean;
          useImplicitInputs?: boolean;
          allowRecentCanvasFallback?: boolean;
        } = {},
      ) => {
        const useImplicitInputs = options.useImplicitInputs !== false;
        const requestedInputs = getExistingCanvasIds(requestedInputIds);
        const snapshotCanvasInputIds = snapshotSurface === 'canvas'
          ? getExistingCanvasIds(snapshotSelectedIds)
          : [];
        const fallbackInputIds = requestedInputs.length > 0
          ? requestedInputs
          : (useImplicitInputs ? (snapshotCanvasInputIds.length > 0 ? snapshotCanvasInputIds : getSelectedCanvasAiInputIds()) : []);
        const visualReferences = useImplicitInputs ? snapshot?.visualReferences || [] : [];
        const selectedDrawerItems = useImplicitInputs ? getAgentWorkflowSelectedDrawerItems() : [];
        const runResolver = (extraSelectedNodeIds: string[] = []) => resolveWorkflowInputs({
          workflow,
          selectedNodeIds: uniqueAgentIds([
            ...fallbackInputIds,
            ...(useImplicitInputs ? snapshotCanvasInputIds : []),
            ...extraSelectedNodeIds,
            ...(useImplicitInputs ? visualReferences.map(reference => reference.nodeId) : []),
          ]),
          visualReferences,
          currentMessageAttachments: visualReferences,
          selectedDrawerItems,
          canvasNodes: getAgentWorkflowCanvasNodes(),
          drawerItems: itemsRef.current,
          allowRecentCanvasFallback: options.allowRecentCanvasFallback ?? useImplicitInputs,
        });
        let resolution = runResolver();
        const createdNodeIds: string[] = [];
        if (resolution.nodesToCreateFromDrawerItems.length > 0) {
          if (!isCanvasModeRef.current) enterCanvasMode();
          for (const drawerItemId of resolution.nodesToCreateFromDrawerItems) {
            const nodeId = await createDrawerMediaCanvasNode(drawerItemId, undefined, {
              reuseExisting: true,
              select: false,
              toast: false,
              label: 'Agent 添加 workflow 输入图片',
            });
            if (nodeId) createdNodeIds.push(nodeId);
          }
          resolution = runResolver(createdNodeIds);
        }
        if (resolution.nodesToCreateFromAttachments.length > 0) {
          if (!isCanvasModeRef.current) enterCanvasMode();
          const referenceById = new Map(visualReferences.flatMap(reference => [
            [reference.id, reference],
            [reference.nodeId, reference],
          ] as Array<[string, AgentCanvasVisualReference]>));
          for (const referenceId of resolution.nodesToCreateFromAttachments) {
            const reference = referenceById.get(referenceId);
            if (!reference) continue;
            const nodeId = await createWorkflowAttachmentImageCanvasNode(reference, {
              select: false,
              label: 'Agent 添加 workflow 输入图片',
            });
            if (nodeId) createdNodeIds.push(nodeId);
          }
          resolution = runResolver(createdNodeIds);
        }
        if (!options.allowMissingRequired && resolution.missingRequiredInputs.length > 0) {
          throw new Error(resolution.missingRequiredInputs[0] || '这个工作流需要产品/参考图，请先选择或拖入一张图片。');
        }
        resolution.workflowInputResolution.createdImageNodes = createdNodeIds;
        resolution.workflowInputResolution.thumbnailPlaceholdersCreated = 0;
        const unresolvedInputIds = new Set(resolution.workflowInputResolution.unresolvedThumbnailNodes);
        return {
          inputIds: getExistingCanvasIds([
            ...fallbackInputIds.filter(id => !unresolvedInputIds.has(id)),
            ...resolution.resolvedImageNodeIds,
          ]),
          resolution,
          createdNodeIds,
        };
      };
      const attachAgentWorkflowInputsToModule = async (nodeId: string) => {
        const moduleNode = canvasItemsRef.current.find(item => item.id === nodeId);
        const workflow = getCanvasWorkflowTemplateFromNode(moduleNode);
        if (!moduleNode || !workflow) return null;
        const preflight = await resolveAgentWorkflowInputIds(workflow, moduleNode.inputs || []);
        if (preflight.inputIds.length > 0) {
          updateCanvasItemsImmediate(prev => prev.map(item => (
            item.id === nodeId
              ? { ...item, inputs: uniqueAgentIds([...(item.inputs || []), ...preflight.inputIds]) }
              : item
          )));
        }
        return preflight;
      };
      if (["analyze_inspiration","analyze_inspirations_batch","get_inspiration_analysis_job","drawer_search_inspirations","app_get_context","app_get_ui_snapshot","app_ui_interact","app_navigate","drawer_get_analysis_coverage","drawer_plan_organization","drawer_apply_organization","drawer_manage","calendar_manage"].includes(name)) {
        return executeDrawerAgentTool({ CALENDAR_NEW_NOTE_TARGET, activeFolderIdStateRef, activeTabRef, addDrawerMediaItemToCanvas, addWebImageUrl, agentCalendarTagFilter, analyzeDrawerInspirationWithLlm, appWindow, assetStorageMode, buildAgentCalendarEvents, calendarEvents, calendarMonth, calendarSelectedDate, calendarTagFilter, calendarTargetNoteLabel, canvasItemsRef, canvasSelectedIdsRef, createAssetId, createFloatingNote, createTextOrUrlItem, deleteCalendarScheduleItem, drawerOrganizationPlansRef, ensureCalendarScheduleNote, enterCanvasMode, foldersRef, handleDeleteFolder, handleOpenTextInput, handleTogglePin, hasSelectionSnapshot, insertDrawerFolderAtTop, inspirationAnalysisJobsRef, isCanvasModeRef, isPinnedRef, itemsRef, jumpCalendarToday, leaveCanvasToDrawer, openSelectedImagePreview, openSelectedVideoPreview, parseAgentDate, patchCalendarScheduleItem, persistFoldersSnapshot, pushDrawerUndoSnapshot, removeDrawerItemsFromDrawer, retrieveDrawerInspirationCandidates, scheduleCanvasFocusItemById, searchQuery, selectedIds, setActiveFolderId, setActiveTab, setAssetStatsRevision, setCalendarMonth, setCalendarSelectedDate, setCalendarTargetNoteLabel, setDrawerState, setFolders, setIsDrawerAgentOpen, setIsOpen, setIsPinned, setIsSearchActive, setIsSelectMode, setItems, setQuickAccessItems, setSearchQuery, setSelectedIds, setShowSettings, setShowTextInput, setShowWebImageCollector, showToast, snapshot, snapshotSelectedIds, snapshotSurface, startDrawerInspirationAnalysisBatch, stateRef, syncCalendarScheduleSnapshot, undoLastCanvasChange, undoLastDrawerChange, updateCanvasSelection }, name, args, execution);
      }

      if (["canvas_manage","canvas_get_context","canvas_create_design_pipeline","canvas_create_generator","canvas_create_media_tool","canvas_create_preset","canvas_add_text"].includes(name)) {
        return executeCanvasCreationTool({ AUTO_INSPIRATION_ANALYSIS_ENABLED, addDrawerMediaItemToCanvas, analyzeDrawerInspirationWithLlm, appendCanvasItems, buildCanvasAiGeneratorNode, buildCanvasEnhancementNode, buildCanvasFrameInterpolationNode, canvasAiPromptPresets, canvasItemsRef, canvasScaleRef, canvasSelectedIdsRef, canvasSurfaceRef, collectAgentBoundNodeIds, createAssetId, createCanvasTextItemFromContent, createDrawerMediaCanvasNode, duplicateCanvasItems, enterCanvasMode, executionUserRequest, fitCanvasViewToItems, foldersRef, generateCanvasAiGeneratorNode, generateCanvasWorkflowModuleNode, getCanvasDropPosition, getCanvasItemsBounds, getSelectedCanvasAiInputIds, getSelectedEnhancementInputIds, getSelectedFrameInterpolationInputIds, hasSelectionSnapshot, isCanvasModeRef, itemsRef, makeCanvasNodeId, pushCanvasUndoSnapshot, removeCanvasConnection, removeCanvasItemsByIds, retrieveDrawerInspirationCandidates, runCanvasTextAgentNode, scheduleCanvasFocusItemById, setCustomCanvasAiPromptPresets, showToast, snapshotSelectedIds, snapshotSurface, undoLastCanvasChange, updateCanvasItemsImmediate, updateCanvasNodesForPreset, updateCanvasSelection, zoomCanvasAt }, name, args, execution);
      }

      if (["canvas_create_text_agent","canvas_run_text_agent","canvas_apply_workflow","canvas_create_workflow_draft","canvas_update_workflow_draft","canvas_create_workflow","canvas_update_prompt","canvas_connect_nodes","canvas_organize","canvas_run_workflow"].includes(name)) {
        return executeCanvasWorkflowTool({ activeWorkflowDraftId, activeWorkflowDraftRef, appendCanvasItems, attachAgentWorkflowInputsToModule, buildCanvasWorkflowModuleNode, buildCanvasWorkflowSaveDraftFromSelection, canvasAiProvider, canvasItemsRef, canvasSelectedIdsRef, canvasTextAreaRefs, canvasWorkflowTemplates, collectAgentBoundNodeIds, connectCanvasItems, createAssetId, enterCanvasMode, executionUserRequest, generateCanvasWorkflowModuleNode, getCanvasDropPosition, getCanvasItemsBounds, getExistingCanvasIds, getSelectedCanvasAiInputIds, hasSelectionSnapshot, isCanvasModeRef, makeCanvasNodeId, organizeCanvasItems, pushCanvasUndoSnapshot, resolveAgentWorkflowInputIds, runCanvasTextAgentNode, runSelectedCanvasWorkflowModules, setActiveDraftForDisplay, setActiveWorkflowDraftId, setCustomCanvasWorkflows, setShowWorkflowDraftPanel, showToast, snapshotSelectedIds, snapshotSurface, uniqueAgentIds, updateCanvasAiGeneratorData, updateCanvasItemsImmediate, updateCanvasSelection, updateCanvasTextItem }, name, args, execution);
      }

      throw new Error(`不支持的画布工具：${name}`);
    },
    onNotice: showToast,
  });
}
