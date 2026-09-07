import { convertFileSrc,invoke } from '@tauri-apps/api/core';
import React from 'react';
import { deleteAssetsBatch,getAssetsByIds,updateAssetsBatch } from '../../../services/assetsApi';
import { BufferItem,FloatingNoteScheduleItem,FloatingNoteSnapshot,Folder } from '../../../types';
import type { DrawerTabType } from '../../../types/drawer';
import { getVisibleAgentUiSnapshot,isAgentUiElementVisible,setAgentUiElementValue } from '../../../utils/agentUiDom';
import { createCanvasAiOutputBufferItem,getCanvasAiSuccessfulOutputs } from '../../../utils/canvasItemSelectors';
import { buildScheduleItemsFromText,getScheduleTextContent,normalizeSchedulePriority,startOfLocalDay,type CalendarScheduleEvent,type SchedulePriority } from '../../calendarModel';
import { getCanvasAiNodeTitle } from '../../canvasAiRuntime';
import { isCanvasDrawerMediaItem } from '../../canvasDrawerMedia';
import { type CanvasImageItem } from '../../canvasModel';
import type { AgentCanvasContext,AgentToolExecutionContext } from '../../agentModel';
import type { WebImageCaptureMetadata } from '../../../types/webImageCollector';
import { setCanvasChatVisibility } from '../../chat/runtime/canvasChatVisibility';
import { FLOATING_NOTE_LABELS,floatingNoteStorageKey,getFolderTagIds,makeFloatingNoteSnapshot,readFloatingNoteSnapshot,readOpenFloatingNoteLabels,rememberOpenFloatingNoteLabel } from '../../floatingNotes';
import { getPreviewOriginalSource } from '../../mediaSources';
import { INSPIRATION_REFERENCE_ROLES,type DrawerSearchInspirationsInput,type InspirationAnalysisJob,type InspirationCandidate,type InspirationProfile } from '../inspirationMemory';
import { buildProfileOrganizationPlan,type ProfileOrganizationPlan,type ProfileOrganizationStrategy } from '../inspirationMemory/profileOrganizer';

type drawerAgentToolContext = { CALENDAR_NEW_NOTE_TARGET: "__new_calendar_schedule_note__"; activeFolderIdStateRef: React.RefObject<string>; activeTabRef: React.RefObject<DrawerTabType>; addDrawerMediaItemToCanvas: (itemId: string, client?: { x: number; y: number; }) => Promise<boolean>; addWebImageUrl: (url: string, name?: string, fallbackUrls?: string[], captureMetadata?: WebImageCaptureMetadata) => void; agentCalendarTagFilter: string; analyzeDrawerInspirationWithLlm: (input: { itemId: string; imageSource?: string; existingProfile?: InspirationProfile; userTags?: string[]; userNotes?: string[]; forceRefresh?: boolean; }) => Promise<InspirationProfile>; appWindow: import('@tauri-apps/api/window').Window; assetStorageMode: "initializing" | "sqlite" | "json"; buildAgentCalendarEvents: (limit?: number) => { id: string; noteLabel: string; scheduleId: string; title: string; done: boolean; priority: SchedulePriority; startAt: number | undefined; tagIds: string[]; sourceTitle: string; }[]; calendarEvents: CalendarScheduleEvent[]; calendarMonth: number; calendarSelectedDate: number; calendarTagFilter: string; calendarTargetNoteLabel: string; canvasItemsRef: React.RefObject<CanvasImageItem[]>; canvasSelectedIdsRef: React.RefObject<string[]>; createAssetId: () => `${string}-${string}-${string}-${string}-${string}`; createFloatingNote: (item: BufferItem, options?: { topmost?: boolean; x?: number; y?: number; width?: number; height?: number; silent?: boolean; }) => Promise<{ noteLabel: string; snapshot: FloatingNoteSnapshot; } | null | undefined>; createTextOrUrlItem: (rawText: string, defaultName?: string) => BufferItem; createdAt: number; deleteCalendarScheduleItem: (event: CalendarScheduleEvent) => Promise<void>; drawerOrganizationPlansRef: React.RefObject<Map<string, { plan: ProfileOrganizationPlan; createdAt: number; }>>; ensureCalendarScheduleNote: (targetLabel?: string) => { label: string; snapshot: FloatingNoteSnapshot | null | undefined; } | null; enterCanvasMode: () => void; foldersRef: React.RefObject<Folder[]>; handleDeleteFolder: (id: string) => void; handleOpenTextInput: () => void; handleTogglePin: () => void; hasSelectionSnapshot: boolean; insertDrawerFolderAtTop: (currentFolders: Folder[], folder: Folder) => Folder[]; inspirationAnalysisJobsRef: React.RefObject<Map<string, InspirationAnalysisJob>>; isCanvasModeRef: React.RefObject<boolean>; isOpen: boolean; isPinnedRef: React.RefObject<boolean>; itemsRef: React.RefObject<BufferItem[]>; jumpCalendarToday: () => void; leaveCanvasToDrawer: () => void; openSelectedImagePreview: (sourceOrItem: string | BufferItem, options?: { fromCanvas?: boolean; galleryItems?: BufferItem[]; galleryIndex?: number; }) => void; openSelectedVideoPreview: (video: { url?: string | null; path?: string | null; }, options?: { fromCanvas?: boolean; }) => void; parseAgentDate: (value: unknown, fallback?: number) => number; patchCalendarScheduleItem: (noteLabel: string, scheduleId: string, patch: Partial<FloatingNoteScheduleItem>) => Promise<void>; persistFoldersSnapshot: (nextFolders: Folder[]) => void; plan: ProfileOrganizationPlan; pushDrawerUndoSnapshot: (label: string, options?: { shareImmutableItems?: boolean; }) => void; removeDrawerItemsFromDrawer: (targetItems: BufferItem[], label?: string) => number; retrieveDrawerInspirationCandidates: (input: DrawerSearchInspirationsInput) => Promise<InspirationCandidate[]>; scheduleCanvasFocusItemById: (id?: string | null) => void; searchQuery: string; selectedIds: string[]; setActiveFolderId: React.Dispatch<React.SetStateAction<string>>; setActiveTab: React.Dispatch<React.SetStateAction<DrawerTabType>>; setAssetStatsRevision: React.Dispatch<React.SetStateAction<number>>; setCalendarMonth: React.Dispatch<React.SetStateAction<number>>; setCalendarSelectedDate: React.Dispatch<React.SetStateAction<number>>; setCalendarTargetNoteLabel: React.Dispatch<React.SetStateAction<string>>; setDrawerState: React.Dispatch<React.SetStateAction<"open" | "closed" | "pre_open" | "closing">>; setFolders: React.Dispatch<React.SetStateAction<Folder[]>>; setIsDrawerAgentOpen: React.Dispatch<React.SetStateAction<boolean>>; setIsOpen: React.Dispatch<React.SetStateAction<boolean>>; setIsPinned: React.Dispatch<React.SetStateAction<boolean>>; setIsSearchActive: React.Dispatch<React.SetStateAction<boolean>>; setIsSelectMode: React.Dispatch<React.SetStateAction<boolean>>; setItems: React.Dispatch<React.SetStateAction<BufferItem[]>>; setQuickAccessItems: React.Dispatch<React.SetStateAction<BufferItem[]>>; setSearchQuery: React.Dispatch<React.SetStateAction<string>>; setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>; setShowSettings: React.Dispatch<React.SetStateAction<boolean>>; setShowTextInput: React.Dispatch<React.SetStateAction<boolean>>; setShowWebImageCollector: React.Dispatch<React.SetStateAction<boolean>>; showToast: (message: string) => void; snapshot: AgentCanvasContext | undefined; snapshotSelectedIds: string[]; snapshotSurface: "canvas" | "drawer"; startDrawerInspirationAnalysisBatch: (input: { itemIds: string[]; forceRefresh?: boolean; priority?: "low" | "normal" | "high"; }) => { jobId: string; }; stateRef: React.RefObject<{ isOpen: boolean; isPinned: boolean; showTextInput: boolean; isSearchActive: boolean; isAntiTouchMode: boolean; }>; syncCalendarScheduleSnapshot: (noteLabel: string, snapshot: FloatingNoteSnapshot) => Promise<FloatingNoteSnapshot>; undoLastCanvasChange: () => boolean; undoLastDrawerChange: () => void; updateCanvasSelection: (ids: string[]) => void; };

export const executeDrawerAgentTool = async (ctx: Pick<drawerAgentToolContext, 'CALENDAR_NEW_NOTE_TARGET' | 'activeFolderIdStateRef' | 'activeTabRef' | 'addDrawerMediaItemToCanvas' | 'addWebImageUrl' | 'agentCalendarTagFilter' | 'analyzeDrawerInspirationWithLlm' | 'appWindow' | 'assetStorageMode' | 'buildAgentCalendarEvents' | 'calendarEvents' | 'calendarMonth' | 'calendarSelectedDate' | 'calendarTagFilter' | 'calendarTargetNoteLabel' | 'canvasItemsRef' | 'canvasSelectedIdsRef' | 'createAssetId' | 'createFloatingNote' | 'createTextOrUrlItem' | 'deleteCalendarScheduleItem' | 'drawerOrganizationPlansRef' | 'ensureCalendarScheduleNote' | 'enterCanvasMode' | 'foldersRef' | 'handleDeleteFolder' | 'handleOpenTextInput' | 'handleTogglePin' | 'hasSelectionSnapshot' | 'insertDrawerFolderAtTop' | 'inspirationAnalysisJobsRef' | 'isCanvasModeRef' | 'isPinnedRef' | 'itemsRef' | 'jumpCalendarToday' | 'leaveCanvasToDrawer' | 'openSelectedImagePreview' | 'openSelectedVideoPreview' | 'parseAgentDate' | 'patchCalendarScheduleItem' | 'persistFoldersSnapshot' | 'pushDrawerUndoSnapshot' | 'removeDrawerItemsFromDrawer' | 'retrieveDrawerInspirationCandidates' | 'scheduleCanvasFocusItemById' | 'searchQuery' | 'selectedIds' | 'setActiveFolderId' | 'setActiveTab' | 'setAssetStatsRevision' | 'setCalendarMonth' | 'setCalendarSelectedDate' | 'setCalendarTargetNoteLabel' | 'setDrawerState' | 'setFolders' | 'setIsDrawerAgentOpen' | 'setIsOpen' | 'setIsPinned' | 'setIsSearchActive' | 'setIsSelectMode' | 'setItems' | 'setQuickAccessItems' | 'setSearchQuery' | 'setSelectedIds' | 'setShowSettings' | 'setShowTextInput' | 'setShowWebImageCollector' | 'showToast' | 'snapshot' | 'snapshotSelectedIds' | 'snapshotSurface' | 'startDrawerInspirationAnalysisBatch' | 'stateRef' | 'syncCalendarScheduleSnapshot' | 'undoLastCanvasChange' | 'undoLastDrawerChange' | 'updateCanvasSelection'>, name: string, args: Record<string, unknown>, _execution: AgentToolExecutionContext | undefined) => {
  const { CALENDAR_NEW_NOTE_TARGET, activeFolderIdStateRef, activeTabRef, addDrawerMediaItemToCanvas, addWebImageUrl, agentCalendarTagFilter, analyzeDrawerInspirationWithLlm, appWindow, assetStorageMode, buildAgentCalendarEvents, calendarEvents, calendarMonth, calendarSelectedDate, calendarTagFilter, calendarTargetNoteLabel, canvasItemsRef, canvasSelectedIdsRef, createAssetId, createFloatingNote, createTextOrUrlItem, deleteCalendarScheduleItem, drawerOrganizationPlansRef, ensureCalendarScheduleNote, enterCanvasMode, foldersRef, handleDeleteFolder, handleOpenTextInput, handleTogglePin, hasSelectionSnapshot, insertDrawerFolderAtTop, inspirationAnalysisJobsRef, isCanvasModeRef, isPinnedRef, itemsRef, jumpCalendarToday, leaveCanvasToDrawer, openSelectedImagePreview, openSelectedVideoPreview, parseAgentDate, patchCalendarScheduleItem, persistFoldersSnapshot, pushDrawerUndoSnapshot, removeDrawerItemsFromDrawer, retrieveDrawerInspirationCandidates, scheduleCanvasFocusItemById, searchQuery, selectedIds, setActiveFolderId, setActiveTab, setAssetStatsRevision, setCalendarMonth, setCalendarSelectedDate, setCalendarTargetNoteLabel, setDrawerState, setFolders, setIsDrawerAgentOpen, setIsOpen, setIsPinned, setIsSearchActive, setIsSelectMode, setItems, setQuickAccessItems, setSearchQuery, setSelectedIds, setShowSettings, setShowTextInput, setShowWebImageCollector, showToast, snapshot, snapshotSelectedIds, snapshotSurface, startDrawerInspirationAnalysisBatch, stateRef, syncCalendarScheduleSnapshot, undoLastCanvasChange, undoLastDrawerChange, updateCanvasSelection } = ctx;
if (name === 'analyze_inspiration') {
        return analyzeDrawerInspirationWithLlm({
          itemId: String(args.itemId || '').trim(),
          imageSource: String(args.imageSource || '').trim() || undefined,
          existingProfile: args.existingProfile && typeof args.existingProfile === 'object'
            ? args.existingProfile as InspirationProfile
            : undefined,
          userTags: Array.isArray(args.userTags) ? args.userTags.map(String).filter(Boolean) : undefined,
          userNotes: Array.isArray(args.userNotes) ? args.userNotes.map(String).filter(Boolean) : undefined,
          forceRefresh: args.forceRefresh === true,
        });
      }
      if (name === 'analyze_inspirations_batch') {
        return startDrawerInspirationAnalysisBatch({
          itemIds: Array.isArray(args.itemIds) ? args.itemIds.map(String).filter(Boolean) : [],
          forceRefresh: args.forceRefresh === true,
          priority: ['low', 'high'].includes(String(args.priority))
            ? String(args.priority) as 'low' | 'high'
            : 'normal',
        });
      }
      if (name === 'get_inspiration_analysis_job') {
        const jobId = String(args.jobId || '').trim();
        const job = inspirationAnalysisJobsRef.current.get(jobId);
        if (!job) throw new Error(`灵感分析任务不存在：${jobId}`);
        return job;
      }
      if (name === 'drawer_search_inspirations') {
        const query = String(args.query || '').trim();
        if (!query) throw new Error('灵感检索 query 不能为空');
        const role = String(args.referenceRole || '').trim();
        if (role && !INSPIRATION_REFERENCE_ROLES.includes(role as typeof INSPIRATION_REFERENCE_ROLES[number])) {
          throw new Error(`不支持的参考角色：${role}`);
        }
        const folderIds = Array.isArray(args.folderIds) ? args.folderIds.map(String).filter(Boolean) : [];
        const missingFolderId = folderIds.find(folderId => !foldersRef.current.some(folder => folder.id === folderId));
        if (missingFolderId) throw new Error(`文件夹不存在：${missingFolderId}`);
        return await retrieveDrawerInspirationCandidates({
          query,
          projectBrief: args.projectBrief && typeof args.projectBrief === 'object'
            ? args.projectBrief as Record<string, unknown>
            : String(args.projectBrief || ''),
          referenceRole: role ? role as DrawerSearchInspirationsInput['referenceRole'] : undefined,
          folderIds,
          topK: Math.min(8, Math.max(1, Number(args.topK) || 8)),
        });
      }
      if (name === 'app_get_context') {
        const requestedScopes = Array.isArray(args.scopes)
          ? args.scopes.map(String).filter(Boolean)
          : ['minimal'];
        const scopeSet = new Set(requestedScopes.length > 0 ? requestedScopes : ['minimal']);
        const hasScope = (scope: string) => scopeSet.has('full') || scopeSet.has(scope);
        const response: Record<string, unknown> = {
          scopes: Array.from(scopeSet),
          surface: isCanvasModeRef.current ? 'canvas' : 'drawer',
          selectedIds: isCanvasModeRef.current ? [...canvasSelectedIdsRef.current] : [...selectedIds],
        };
        if (hasScope('app') || hasScope('minimal')) {
          response.app = {
            surface: isCanvasModeRef.current ? 'canvas' : 'drawer',
            drawerPinned: isPinnedRef.current,
            drawerOpen: stateRef.current.isOpen,
          };
        }
        if (hasScope('drawer')) {
          const drawerSearch = String(searchQuery || '').trim().toLowerCase();
          const selectedDrawerIds = new Set([
            ...selectedIds,
            ...(snapshot?.selectedItems || []).map(item => item.id),
            ...(snapshot?.selectedItems || []).map(item => item.sourceItemId || '').filter(Boolean),
            ...(snapshot?.visualReferences || []).map(reference => reference.sourceItemId || '').filter(Boolean),
          ]);
          const drawerItemsForContext = itemsRef.current
            .filter(item => {
              if (selectedDrawerIds.has(item.id)) return true;
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
          response.drawer = {
            activeTab: activeTabRef.current,
            activeFolderId: activeFolderIdStateRef.current,
            searchQuery,
            selectedIds: [...selectedIds],
            itemCount: itemsRef.current.length,
            returnedItemCount: drawerItemsForContext.length,
            folderCount: foldersRef.current.length,
            items: drawerItemsForContext.map(item => ({
              id: item.id,
              type: item.type,
              name: item.name || item.content || '未命名素材',
              folderId: item.folderId,
              quickAccess: item.isQuickAccess,
              inspirationProfile: item.inspirationProfile,
            })),
            folders: foldersRef.current.slice(0, 120).map(folder => ({
              id: folder.id,
              name: folder.name,
              parentId: folder.parentId,
            })),
          };
        }
        if (hasScope('canvas')) {
          response.canvas = {
            selectedIds: [...canvasSelectedIdsRef.current],
            nodeCount: canvasItemsRef.current.length,
            nodes: canvasItemsRef.current.slice(0, 180).map(item => ({
              id: item.id,
              sourceItemId: item.item.sourceItemId,
              type: item.ai?.type || item.item.type,
              name: item.item.name || getCanvasAiNodeTitle(item.ai),
              inputs: item.inputs || [],
              status: item.ai?.status,
            })),
          };
        }
        if (hasScope('calendar')) {
          response.calendar = {
            activeDate: calendarSelectedDate,
            activeMonth: calendarMonth,
            tagFilter: calendarTagFilter,
            events: buildAgentCalendarEvents(120),
          };
        }
        return response;
      }

      if (name === 'app_get_ui_snapshot') {
        return {
          surface: isCanvasModeRef.current ? 'canvas' : 'drawer',
          elements: getVisibleAgentUiSnapshot(),
        };
      }

      if (name === 'app_ui_interact') {
        const action = String(args.action || '');
        const elementId = String(args.elementId || '').trim();
        const element = Array.from(document.querySelectorAll<HTMLElement>('[data-agent-ui-id]'))
          .find(item => item.dataset.agentUiId === elementId);
        if (!element || !element.isConnected) throw new Error('目标控件已失效，请重新读取界面控件');
        if (!isAgentUiElementVisible(element)) throw new Error('目标控件当前不可见，请重新读取界面控件');
        if ('disabled' in element && Boolean((element as HTMLButtonElement).disabled)) throw new Error('目标控件当前不可用');
        element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        element.focus({ preventScroll: true });
        if (action === 'click') {
          element.click();
        } else if (action === 'set_value') {
          setAgentUiElementValue(element, String(args.value || ''));
        } else if (action === 'press_key') {
          const key = String(args.key || 'Enter');
          const keyboardInit: KeyboardEventInit = { key, bubbles: true, cancelable: true };
          const allowed = element.dispatchEvent(new KeyboardEvent('keydown', keyboardInit));
          if (allowed && key === 'Enter' && element instanceof HTMLButtonElement) element.click();
          element.dispatchEvent(new KeyboardEvent('keyup', keyboardInit));
        } else {
          throw new Error(`不支持的界面操作：${action}`);
        }
        return { action, elementId };
      }

      if (name === 'app_navigate') {
        const action = String(args.action || '');
        if (action === 'open_drawer') {
          setIsOpen(true);
          setDrawerState('open');
        } else if (action === 'close_drawer') {
          setIsDrawerAgentOpen(false);
          setIsOpen(false);
          setIsPinned(false);
          isPinnedRef.current = false;
        } else if (action === 'toggle_pin') {
          handleTogglePin();
        } else if (action === 'enter_canvas') {
          if (!isCanvasModeRef.current) enterCanvasMode();
          setCanvasChatVisibility(true);
        } else if (action === 'exit_canvas') {
          if (isCanvasModeRef.current) leaveCanvasToDrawer();
          setIsDrawerAgentOpen(true);
        } else if (action === 'switch_tab') {
          const requestedTab = String(args.tab || 'all') as DrawerTabType;
          const tabs: DrawerTabType[] = ['all', 'image', 'text', 'video', 'file', 'notes', 'calendar'];
          if (!tabs.includes(requestedTab)) throw new Error('未知抽屉分类');
          if (isCanvasModeRef.current) leaveCanvasToDrawer();
          setActiveTab(requestedTab);
          setIsOpen(true);
        } else if (action === 'open_folder') {
          const folderId = String(args.folderId || 'all');
          if (folderId !== 'all' && !foldersRef.current.some(folder => folder.id === folderId)) {
            throw new Error('文件夹不存在');
          }
          if (isCanvasModeRef.current) leaveCanvasToDrawer();
          setActiveFolderId(folderId);
          setActiveTab('all');
          setIsOpen(true);
        } else if (action === 'search') {
          const query = String(args.query || '').trim();
          setSearchQuery(query);
          setIsSearchActive(true);
          setShowSettings(false);
          setIsOpen(true);
        } else if (action === 'clear_search') {
          setSearchQuery('');
          setIsSearchActive(false);
        } else if (action === 'open_settings') {
          if (isCanvasModeRef.current) leaveCanvasToDrawer();
          setShowSettings(true);
          setIsSearchActive(false);
          setShowTextInput(false);
          setShowWebImageCollector(false);
          setIsOpen(true);
        } else if (action === 'open_text_capture') {
          if (isCanvasModeRef.current) leaveCanvasToDrawer();
          setIsDrawerAgentOpen(false);
          handleOpenTextInput();
          setIsOpen(true);
        } else if (action === 'open_notes') {
          if (isCanvasModeRef.current) leaveCanvasToDrawer();
          setActiveTab('notes');
          setIsOpen(true);
        } else if (action === 'open_calendar') {
          if (isCanvasModeRef.current) leaveCanvasToDrawer();
          setActiveTab('calendar');
          setIsOpen(true);
        } else if (action === 'undo') {
          if (isCanvasModeRef.current) {
            if (!undoLastCanvasChange()) showToast('没有可撤回的画布操作');
          } else {
            undoLastDrawerChange();
          }
        } else if (action === 'minimize') {
          await appWindow.minimize();
        } else if (action === 'toggle_maximize') {
          await appWindow.toggleMaximize();
        } else {
          throw new Error(`不支持的软件导航操作：${action}`);
        }
        return { action, surface: isCanvasModeRef.current ? 'canvas' : 'drawer' };
      }

      if (name === 'drawer_get_analysis_coverage' || name === 'drawer_plan_organization') {
        const requestedFolderId = String(args.folderId ?? '').trim();
        const activeDrawerFolderId = activeFolderIdStateRef.current;
        const sourceFolderId = requestedFolderId === 'all'
          ? undefined
          : requestedFolderId || (activeDrawerFolderId !== 'all' ? activeDrawerFolderId : undefined);
        if (sourceFolderId && !foldersRef.current.some(folder => folder.id === sourceFolderId)) {
          throw new Error('整理范围对应的文件夹不存在');
        }
        const strategy = ['topic', 'topic_color'].includes(String(args.strategy))
          ? String(args.strategy) as ProfileOrganizationStrategy
          : 'topic';
        const plan = buildProfileOrganizationPlan({
          items: itemsRef.current,
          folders: foldersRef.current,
          sourceFolderId,
          recursive: args.recursive !== false,
          strategy,
          categories: Array.isArray(args.categories) ? args.categories.map(String).filter(Boolean) : [],
        });
        const sourceFolder = sourceFolderId
          ? foldersRef.current.find(folder => folder.id === sourceFolderId)
          : undefined;
        const coverage = {
          scope: sourceFolder?.name || '整个抽屉',
          totalImages: plan.totalImages,
          analyzedImages: plan.analyzedImages,
          unanalyzedImages: plan.unanalyzedImages,
          coveragePercent: plan.totalImages > 0
            ? Math.round((plan.analyzedImages / plan.totalImages) * 100)
            : 100,
        };
        if (name === 'drawer_get_analysis_coverage') return coverage;
        const planId = `drawer_organize_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        drawerOrganizationPlansRef.current.set(planId, { plan, createdAt: Date.now() });
        return {
          planId,
          ...coverage,
          strategy,
          plannedItems: plan.assignments.length,
          unresolvedItems: plan.unresolvedItemIds.length,
          groups: plan.groups.map(group => ({
            name: group.name,
            count: group.count,
            minimumConfidence: group.confidence,
            reason: group.reason,
            samples: group.samples,
          })),
          note: plan.unresolvedItemIds.length > 0
            ? '未分析或无法可靠分类的素材会保留原位，不影响其余素材整理。'
            : '全部图片均已有可用分析结果。',
        };
      }

      if (name === 'drawer_apply_organization') {
        const planId = String(args.planId || '').trim();
        const storedPlan = drawerOrganizationPlansRef.current.get(planId);
        if (!storedPlan) throw new Error('整理计划不存在或已经执行，请重新生成预览');
        if (Date.now() - storedPlan.createdAt > 30 * 60 * 1000) {
          drawerOrganizationPlansRef.current.delete(planId);
          throw new Error('整理计划已超过 30 分钟，请重新生成预览');
        }
        const minimumConfidence = Math.min(1, Math.max(0, Number(args.minimumConfidence) || 0.74));
        const assignments = storedPlan.plan.assignments.filter(assignment => assignment.confidence >= minimumConfidence);
        const existingItemIds = new Set(itemsRef.current.map(item => item.id));
        const validAssignments = assignments.filter(assignment => existingItemIds.has(assignment.itemId));
        if (validAssignments.length === 0) throw new Error('整理计划中没有符合置信度要求的可移动素材');

        const nextFolders = [...foldersRef.current];
        const parentId = storedPlan.plan.sourceFolderId;
        const parent = parentId ? nextFolders.find(folder => folder.id === parentId) : undefined;
        const folderIdByName = new Map<string, string>();
        nextFolders
          .filter(folder => (folder.parentId || undefined) === parentId)
          .forEach(folder => folderIdByName.set(folder.name.trim().toLocaleLowerCase(), folder.id));
        const createdFolders: Folder[] = [];
        validAssignments.forEach(assignment => {
          if (assignment.destinationFolderId && nextFolders.some(folder => folder.id === assignment.destinationFolderId)) return;
          const key = assignment.destinationName.trim().toLocaleLowerCase();
          if (folderIdByName.has(key)) return;
          const folder: Folder = {
            id: `org_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
            name: assignment.destinationName,
            color: parent?.color || '#10b981',
            parentId,
          };
          nextFolders.push(folder);
          createdFolders.push(folder);
          folderIdByName.set(key, folder.id);
        });
        const destinationByItemId = new Map(validAssignments.map(assignment => [
          assignment.itemId,
          assignment.destinationFolderId
            || folderIdByName.get(assignment.destinationName.trim().toLocaleLowerCase()),
        ]));
        const movedIds = new Set<string>();
        const nextItems = itemsRef.current.map(item => {
          const destinationId = destinationByItemId.get(item.id);
          if (!destinationId || item.folderId === destinationId) return item;
          movedIds.add(item.id);
          return { ...item, folderId: destinationId };
        });
        if (movedIds.size === 0 && createdFolders.length === 0) {
          drawerOrganizationPlansRef.current.delete(planId);
          return { planId, moved: 0, createdFolders: [], skipped: validAssignments.length };
        }
        pushDrawerUndoSnapshot('智能整理抽屉');
        foldersRef.current = nextFolders;
        itemsRef.current = nextItems;
        setFolders(nextFolders);
        persistFoldersSnapshot(nextFolders);
        setItems(nextItems);
        setSelectedIds([]);
        setIsSelectMode(false);
        drawerOrganizationPlansRef.current.delete(planId);
        showToast(`智能整理完成：移动 ${movedIds.size} 项`);
        return {
          planId,
          moved: movedIds.size,
          skipped: validAssignments.length - movedIds.size,
          createdFolders: createdFolders.map(folder => folder.name),
          unresolvedItems: storedPlan.plan.unresolvedItemIds.length,
          undoAvailable: true,
        };
      }

      if (name === 'drawer_manage') {
        const action = String(args.action || '');
        const requestedIds = Array.isArray(args.targetIds) ? args.targetIds.map(String) : [];
        const fallbackDrawerIds = hasSelectionSnapshot && snapshotSurface === 'drawer'
          ? snapshotSelectedIds
          : [...selectedIds];
        const targetIds = requestedIds.length > 0 ? requestedIds : fallbackDrawerIds;
        const normalizeAgentSourceKey = (value?: string | null) => {
          const text = String(value || '').trim();
          if (!text) return '';
          return text
            .replace(/^asset:\/\/localhost\//i, '')
            .replace(/^https?:\/\/asset\.localhost\//i, '')
            .replace(/^file:\/\//i, '')
            .replace(/\\/g, '/')
            .toLowerCase();
        };
        const drawerItemSourceKeys = (item: BufferItem) => [
          item.path,
          item.url,
          item.thumbnail,
          item.sourceUrl,
          item.originalUrl,
        ].map(normalizeAgentSourceKey).filter(Boolean);
        const resolveDrawerTargets = async (ids: string[]) => {
          const drawerById = new Map(itemsRef.current.map(item => [item.id, item]));
          const drawerBySource = new Map<string, BufferItem>();
          itemsRef.current.forEach(item => {
            drawerItemSourceKeys(item).forEach(key => {
              if (!drawerBySource.has(key)) drawerBySource.set(key, item);
            });
          });
          const resolved = new Map<string, BufferItem>();
          ids.forEach(id => {
            const direct = drawerById.get(id);
            if (direct) {
              resolved.set(direct.id, direct);
              return;
            }
            const [nodeIdFromReference, outputIdFromReference] = id.includes(':') ? id.split(':') : ['', ''];
            const canvasNode = canvasItemsRef.current.find(node => (
              node.id === id
              || node.item.id === id
              || node.id === nodeIdFromReference
              || getCanvasAiSuccessfulOutputs(node).some(output => output.id === id || (node.id === nodeIdFromReference && output.id === outputIdFromReference))
            ));
            if (!canvasNode) return;
            const matchedOutput = getCanvasAiSuccessfulOutputs(canvasNode)
              .find(output => output.id === id || output.id === outputIdFromReference);
            if (matchedOutput) {
              const outputItem = createCanvasAiOutputBufferItem(
                canvasNode,
                matchedOutput,
                getCanvasAiSuccessfulOutputs(canvasNode).findIndex(output => output === matchedOutput),
              );
              const outputDirect = outputItem ? drawerById.get(outputItem.id) : undefined;
              if (outputDirect) {
                resolved.set(outputDirect.id, outputDirect);
                return;
              }
              const outputMatchedBySource = outputItem
                ? drawerItemSourceKeys(outputItem).map(key => drawerBySource.get(key)).find(Boolean)
                : undefined;
              if (outputMatchedBySource) {
                resolved.set(outputMatchedBySource.id, outputMatchedBySource);
                return;
              }
            }
            const sourceId = canvasNode.item.sourceItemId;
            const sourceItem = sourceId ? drawerById.get(sourceId) : undefined;
            if (sourceItem) {
              resolved.set(sourceItem.id, sourceItem);
              return;
            }
            const matchedBySource = drawerItemSourceKeys(canvasNode.item)
              .map(key => drawerBySource.get(key))
              .find(Boolean);
            if (matchedBySource) resolved.set(matchedBySource.id, matchedBySource);
          });
          if (assetStorageMode === 'sqlite') {
            const unresolvedIds = ids.filter(id => !resolved.has(id) && !id.includes(':'));
            if (unresolvedIds.length > 0) {
              const storedAssets = await getAssetsByIds(unresolvedIds);
              storedAssets.forEach(item => resolved.set(item.id, item));
            }
          }
          return [...resolved.values()];
        };
        const targets = await resolveDrawerTargets(targetIds);
        if (action === 'create_text') {
          const content = String(args.content || '').trim();
          if (!content) throw new Error('文字内容不能为空');
          const folderId = String(args.folderId || '').trim();
          if (folderId && !foldersRef.current.some(folder => folder.id === folderId)) throw new Error('目标文件夹不存在');
          const item = {
            ...createTextOrUrlItem(content, String(args.name || '').trim() || 'Agent 灵感'),
            folderId: folderId || undefined,
          };
          pushDrawerUndoSnapshot('Agent 新增灵感');
          setItems(prev => [item, ...prev]);
          setActiveTab('text');
          return { action, itemId: item.id };
        }
        if (action === 'add_web_image') {
          const url = String(args.url || '').trim();
          if (!/^https?:\/\//i.test(url)) throw new Error('需要有效的网页图片 URL');
          addWebImageUrl(url, String(args.name || '').trim() || undefined);
          return { action, url };
        }
        if (action === 'create_folder') {
          const folderName = String(args.name || '').trim();
          if (!folderName) throw new Error('文件夹名称不能为空');
          const parentId = String(args.folderId || '').trim() || undefined;
          const parent = parentId ? foldersRef.current.find(folder => folder.id === parentId) : undefined;
          if (parentId && !parent) throw new Error('父文件夹不存在');
          if (foldersRef.current.some(folder => (folder.parentId || undefined) === parentId && folder.name.toLowerCase() === folderName.toLowerCase())) {
            throw new Error('已有同名文件夹');
          }
          const folder: Folder = {
            id: createAssetId(),
            name: folderName,
            color: parent?.color || '#10b981',
            parentId,
          };
          pushDrawerUndoSnapshot(parent ? 'Agent 新建子目录' : 'Agent 新建文件夹');
          setFolders(prev => {
            const nextFolders = insertDrawerFolderAtTop(prev, folder);
            persistFoldersSnapshot(nextFolders);
            return nextFolders;
          });
          return { action, folderId: folder.id };
        }
        if (action === 'rename_folder') {
          const folderId = String(args.folderId || '').trim();
          const folderName = String(args.name || '').trim();
          const current = foldersRef.current.find(folder => folder.id === folderId);
          if (!current || !folderName) throw new Error('文件夹或新名称无效');
          if (foldersRef.current.some(folder => folder.id !== folderId && (folder.parentId || undefined) === (current.parentId || undefined) && folder.name.toLowerCase() === folderName.toLowerCase())) {
            throw new Error('已有同名文件夹');
          }
          pushDrawerUndoSnapshot('Agent 重命名文件夹');
          setFolders(prev => {
            const nextFolders = prev.map(folder => folder.id === folderId ? { ...folder, name: folderName } : folder);
            persistFoldersSnapshot(nextFolders);
            return nextFolders;
          });
          return { action, folderId, name: folderName };
        }
        if (action === 'delete_folder') {
          const folderId = String(args.folderId || '').trim();
          if (!foldersRef.current.some(folder => folder.id === folderId)) throw new Error('文件夹不存在');
          handleDeleteFolder(folderId);
          return { action, folderId };
        }
        if (action === 'select_items') {
          const validIds = targets.map(item => item.id);
          setIsSelectMode(true);
          setSelectedIds(validIds);
          return { action, selectedIds: validIds };
        }
        if (action === 'clear_selection') {
          setSelectedIds([]);
          setIsSelectMode(false);
          return { action };
        }
        if (action === 'delete_items') {
          if (targets.length === 0) throw new Error('没有找到要删除的抽屉素材');
          const deletable = targets.filter(item => !item.isQuickAccess);
          if (deletable.length === 0) throw new Error('目标均已星标保护，请先取消星标');
          if (assetStorageMode === 'sqlite') {
            await deleteAssetsBatch(deletable.map(item => item.id));
          }
          const removed = removeDrawerItemsFromDrawer(deletable, 'Agent 删除素材');
          setAssetStatsRevision(revision => revision + 1);
          setSelectedIds(prev => prev.filter(id => !deletable.some(item => item.id === id)));
          return { action, removed };
        }
        if (action === 'move_items') {
          if (targets.length === 0) throw new Error('没有找到要移动的素材');
          const folderId = String(args.folderId || '').trim() || undefined;
          if (folderId && !foldersRef.current.some(folder => folder.id === folderId)) throw new Error('目标文件夹不存在');
          pushDrawerUndoSnapshot('Agent 移动素材');
          const idSet = new Set(targets.map(item => item.id));
          if (assetStorageMode === 'sqlite') {
            await updateAssetsBatch([{
              ids: [...idSet],
              patch: { folder_id: folderId || '' },
            }]);
          }
          setItems(prev => prev.map(item => idSet.has(item.id) ? { ...item, folderId } : item));
          setAssetStatsRevision(revision => revision + 1);
          return { action, moved: idSet.size, folderId: folderId || 'all' };
        }
        if (action === 'set_quick_access') {
          if (targets.length === 0) throw new Error('没有找到要设置星标的素材');
          const enabled = args.enabled !== false;
          pushDrawerUndoSnapshot(enabled ? 'Agent 添加星标' : 'Agent 取消星标');
          const idSet = new Set(targets.map(item => item.id));
          if (assetStorageMode === 'sqlite') {
            await updateAssetsBatch(targets.map(item => ({
              ids: [item.id],
              patch: { metadata: { ...item, isQuickAccess: enabled } },
            })));
          }
          setItems(prev => prev.map(item => idSet.has(item.id) ? { ...item, isQuickAccess: enabled } : item));
          setQuickAccessItems(previous => enabled
            ? [...new Map([...targets.map(item => ({ ...item, isQuickAccess: true })), ...previous]
                .map(item => [item.id, item])).values()]
            : previous.filter(item => !idSet.has(item.id)));
          setAssetStatsRevision(revision => revision + 1);
          return { action, updated: idSet.size, enabled };
        }
        if (action === 'open_item') {
          const item = targets[0];
          if (!item) throw new Error('没有找到要打开的素材');
          if (item.type === 'image' && getPreviewOriginalSource(item)) openSelectedImagePreview(item);
          else if (item.type === 'video' && item.path) openSelectedVideoPreview({ url: convertFileSrc(item.path), path: item.path });
          else {
            const target = item.path || item.url || item.content;
            if (!target) throw new Error('素材没有可打开的内容');
            await invoke('open_file', { path: target });
          }
          return { action, itemId: item.id };
        }
        if (action === 'create_floating_note') {
          if (targets.length === 0) throw new Error('没有找到要创建便签的素材');
          let created = 0;
          for (const item of targets.slice(0, 6)) {
            if (await createFloatingNote(item, { topmost: args.enabled === true, silent: true })) created += 1;
          }
          return { action, created };
        }
        if (action === 'add_items_to_canvas') {
          const mediaTargets = targets.filter(isCanvasDrawerMediaItem);
          if (mediaTargets.length === 0) throw new Error('请选择要加入画布的图片或视频素材');
          if (!isCanvasModeRef.current) enterCanvasMode();
          setCanvasChatVisibility(true);
          let added = 0;
          let existing = 0;
          for (const item of mediaTargets) {
            const existingCanvasItem = canvasItemsRef.current.find(canvasItem => (
              canvasItem.item.sourceItemId === item.id
            ));
            if (existingCanvasItem) {
              existing += 1;
              updateCanvasSelection([existingCanvasItem.id]);
              scheduleCanvasFocusItemById(existingCanvasItem.id);
              continue;
            }
            if (await addDrawerMediaItemToCanvas(item.id)) added += 1;
          }
          return { action, added, existing };
        }
        if (action === 'update_item') {
          if (targets.length === 0) throw new Error('没有找到要修改的素材');
          const nextName = String(args.name || '').trim();
          const nextContent = String(args.content || '').trim();
          const folderId = String(args.folderId || '').trim();
          if (folderId && !foldersRef.current.some(folder => folder.id === folderId)) throw new Error('目标文件夹不存在');
          pushDrawerUndoSnapshot('Agent 修改素材');
          const idSet = new Set(targets.map(item => item.id));
          if (assetStorageMode === 'sqlite') {
            await updateAssetsBatch([{
              ids: [...idSet],
              patch: {
                name: nextName || undefined,
                content: nextContent || undefined,
                folder_id: args.folderId !== undefined && args.folderId !== null ? folderId : undefined,
              },
            }]);
          }
          setItems(prev => prev.map(item => idSet.has(item.id) ? {
            ...item,
            ...(nextName ? { name: nextName } : {}),
            ...(nextContent ? { content: nextContent } : {}),
            ...(args.folderId !== undefined && args.folderId !== null ? { folderId: folderId || undefined } : {}),
          } : item));
          setAssetStatsRevision(revision => revision + 1);
          return { action, updated: idSet.size };
        }
        throw new Error(`不支持的抽屉操作：${action}`);
      }

      if (name === 'calendar_manage') {
        const action = String(args.action || '');
        if (isCanvasModeRef.current) leaveCanvasToDrawer();
        setActiveTab('calendar');
        setIsOpen(true);
        const requestedIds = Array.isArray(args.targetIds) ? args.targetIds.map(String) : [];
        const fallbackDrawerIds = hasSelectionSnapshot && snapshotSurface === 'drawer'
          ? snapshotSelectedIds
          : [...selectedIds];
        const targetIds = requestedIds.length > 0 ? requestedIds : fallbackDrawerIds;
        const text = String(args.text || args.title || '').trim();
        const date = parseAgentDate(args.date);
        const priority = normalizeSchedulePriority(String(args.priority || 'B'));
        const tagId = String(args.tagId || '').trim();
        if (tagId && !foldersRef.current.some(folder => folder.id === tagId)) {
          throw new Error('目标日程标签不存在');
        }

        if (action === 'open') {
          return { action, activeDate: calendarSelectedDate };
        }
        if (action === 'jump_today') {
          jumpCalendarToday();
          return { action, activeDate: startOfLocalDay(Date.now()) };
        }
        if (action === 'select_date') {
          setCalendarSelectedDate(date);
          setCalendarMonth(new Date(new Date(date).getFullYear(), new Date(date).getMonth(), 1).getTime());
          return { action, activeDate: date };
        }
        if (action === 'add_schedule') {
          if (!text) throw new Error('日程内容不能为空');
          const requestedTargetLabel = String(args.noteLabel || calendarTargetNoteLabel || CALENDAR_NEW_NOTE_TARGET);
          const target = ensureCalendarScheduleNote(requestedTargetLabel);
          if (!target) throw new Error('没有可用的日程便签');
          const targetSnapshot = target.snapshot;
          if (!targetSnapshot) throw new Error('没有可用的日程便签');
          pushDrawerUndoSnapshot('Agent 新增日程');
          const now = Date.now();
          const tagIds = tagId
            ? [tagId]
            : (agentCalendarTagFilter === 'untagged'
              ? []
              : (agentCalendarTagFilter !== 'all'
                ? [agentCalendarTagFilter]
                : getFolderTagIds(targetSnapshot.folderId, targetSnapshot.tagIds)));
          const nextItem: FloatingNoteScheduleItem = {
            id: `schedule_${now}_${Math.random().toString(36).slice(2, 7)}`,
            text,
            done: false,
            priority,
            startAt: date,
            allDay: true,
            tagIds,
            sourceItemId: targetSnapshot.itemId,
            createdAt: now,
          };
          const next: FloatingNoteSnapshot = {
            ...targetSnapshot,
            type: 'text' as const,
            noteMode: 'schedule' as const,
            scheduleItems: [...(targetSnapshot.scheduleItems || []), nextItem],
            updatedAt: now,
          };
          await syncCalendarScheduleSnapshot(target.label, next);
          if (requestedTargetLabel === CALENDAR_NEW_NOTE_TARGET) setCalendarTargetNoteLabel(target.label);
          setCalendarSelectedDate(date);
          setCalendarMonth(new Date(new Date(date).getFullYear(), new Date(date).getMonth(), 1).getTime());
          return { action, noteLabel: target.label, scheduleId: nextItem.id, text, date };
        }
        if (action === 'update_schedule') {
          const noteLabel = String(args.noteLabel || '').trim();
          const scheduleId = String(args.scheduleId || '').trim();
          if (!noteLabel || !scheduleId) throw new Error('修改日程需要 noteLabel 和 scheduleId');
          const event = calendarEvents.find(item => item.noteLabel === noteLabel && item.schedule.id === scheduleId);
          if (!event) throw new Error('没有找到要修改的日程');
          const patch: Partial<FloatingNoteScheduleItem> = {};
          if (typeof args.done === 'boolean') patch.done = args.done;
          if (text) patch.text = text;
          if (args.date !== undefined && args.date !== null) patch.startAt = date;
          if (args.priority) patch.priority = priority;
          if (tagId) patch.tagIds = [tagId];
          if (Object.keys(patch).length === 0) throw new Error('没有提供要修改的日程字段');
          await patchCalendarScheduleItem(noteLabel, scheduleId, patch);
          return { action, noteLabel, scheduleId, patch };
        }
        if (action === 'delete_schedule') {
          const noteLabel = String(args.noteLabel || '').trim();
          const scheduleId = String(args.scheduleId || '').trim();
          const event = calendarEvents.find(item => (
            (noteLabel ? item.noteLabel === noteLabel : true)
            && item.schedule.id === scheduleId
          ));
          if (!event) throw new Error('没有找到要删除的日程');
          await deleteCalendarScheduleItem(event);
          return { action, noteLabel: event.noteLabel, scheduleId };
        }
        if (action === 'convert_text_notes_to_schedule') {
          const targets = itemsRef.current.filter(item => targetIds.includes(item.id) && item.type === 'text');
          if (targets.length === 0) throw new Error('请选择要转为日程的文字便签/文字素材');
          pushDrawerUndoSnapshot('Agent 便签转日程');
          const converted: Array<{ itemId: string; noteLabel: string; count: number }> = [];
          const openLabels = readOpenFloatingNoteLabels();
          for (const item of targets.slice(0, 8)) {
            const label = openLabels.find(candidate => readFloatingNoteSnapshot(candidate)?.itemId === item.id)
              || FLOATING_NOTE_LABELS.find(candidate => !readOpenFloatingNoteLabels().includes(candidate));
            if (!label) throw new Error('便签数量已达上限，无法继续转换');
            const existing = readFloatingNoteSnapshot(label);
            const baseSnapshot = existing && existing.itemId === item.id
              ? existing
              : makeFloatingNoteSnapshot(item);
            const content = item.content || baseSnapshot.content || '';
            const scheduleItems = buildScheduleItemsFromText(content, baseSnapshot.scheduleItems || [], {
              tagIds: getFolderTagIds(item.folderId, baseSnapshot.tagIds),
              sourceItemId: item.id,
              defaultPriority: priority,
            }).map(schedule => ({
              ...schedule,
              startAt: schedule.startAt ?? date,
              priority: normalizeSchedulePriority(schedule.priority || priority),
            }));
            const next: FloatingNoteSnapshot = {
              ...baseSnapshot,
              type: 'text',
              name: String(args.title || baseSnapshot.name || item.remark || item.name || '日程便签').trim(),
              content: getScheduleTextContent(scheduleItems),
              noteMode: 'schedule',
              scheduleItems,
              updatedAt: Date.now(),
            };
            localStorage.setItem(floatingNoteStorageKey(label), JSON.stringify(next));
            rememberOpenFloatingNoteLabel(label);
            await syncCalendarScheduleSnapshot(label, next);
            converted.push({ itemId: item.id, noteLabel: label, count: scheduleItems.length });
          }
          setActiveTab('calendar');
          return { action, converted };
        }
        throw new Error(`不支持的日历操作：${action}`);
      }
};
