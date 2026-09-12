import { invoke } from '@tauri-apps/api/core';
import { cursorPosition } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import React,{ startTransition } from 'react';
import { type RoundedSelectOption } from '../../components/RoundedSelect';
import type { AgentApiBalanceResult,AgentApiConnectionResult,AgentCanvasToolExecutor,AgentCodexApproval,AgentConversation,AgentSendOptions,AgentSettings,CodexInstallProgress,CodexLoginInfo,CodexModelOption,CodexRateLimits,CodexRuntimeStatus,WorkflowResultCardData } from '../../features/agentModel';
import { getCanvasAiPublicImageModelVariantName } from '../../features/canvasAiImage';
import { type CanvasAiCredentialSource,type CanvasAiProvider } from '../../features/canvasModel';
import { clearCachedCloudAccount,createSingleFlight,writeCachedCloudAccount } from '../../features/cloudAccountSync';
import { formatCreditAmount,selectRecentNonZeroCreditUsage } from '../../features/cloudCreditUsage';
import { clamp } from '../../features/common';
import { FLOATING_NOTE_LABELS,MAX_FLOATING_NOTE_COUNT,TEXT_FLOATING_NOTE_SIZES,deleteFloatingNoteSnapshot,fitImageFloatingNoteSize,floatingNoteStorageKey,makeFloatingNoteSnapshot,readFloatingNoteSnapshot,readFloatingNoteViewState,readImageAspect,readOpenFloatingNoteLabels,rememberOpenFloatingNoteLabel,writeOpenFloatingNoteLabels } from '../../features/floatingNotes';
import { acquireTimedLocalLock,localLockKeyPart,releaseTimedLocalLock } from '../../features/localLock';
import { type TriggerMode } from '../../features/triggerModel';
import { BufferItem,FloatingNoteSnapshot,Folder } from '../../types';
import type { ConfirmDialogState } from '../../types/dialogs';
import type { DrawerTabType,DrawerUndoSnapshot,FolderContextMenuState } from '../../types/drawer';
import type { CloudAccountSummary,CloudCreditUsageEntry,CloudCreditUsageResult,CloudImageModelsResult,CreditRedemptionResult,EmailCodeChallenge,LicenseStatus } from '../../types/license';
import { canvasAiModelChoiceValue,parseCanvasAiModelChoiceValue } from '../../utils/canvasAiConfig';
import { cloneDrawerValue,compactFloatingNoteSnapshot,stripHeavyDataThumbnail } from '../../utils/canvasSerialization';

type appLifecycleActionContext = { canvasInteractionTimerRef: React.RefObject<number | null>; cancelCanvasImageSourceUpgradeQueue: () => void; isCanvasInteractingRef: React.RefObject<boolean>; canvasSizeCommitDeferredRef: React.RefObject<boolean>; setCanvasSize: React.Dispatch<React.SetStateAction<{ width: number; height: number; }>>; canvasSizeRef: React.RefObject<{ width: number; height: number; }>; canvasViewportDeferredDuringZoomRef: React.RefObject<boolean>; scheduleCanvasViewportUpdate: () => void; scheduleCanvasVisibleImageSourceUpgrades: () => void; runNextCanvasAiOutputThumbnailJob: () => void; flushCanvasChangedNodePatches: () => void; scheduleCanvasChangedNodesPatchSave: (ids: string[]) => void; scheduleCanvasStateSave: (options?: { syncNodes?: boolean; }) => void; canvasPersistSaveSyncNodesRef: React.RefObject<boolean>; clearExternalDragResetTimer: () => void; setIsDraggingOver: React.Dispatch<React.SetStateAction<boolean>>; externalDragResetTimerRef: React.RefObject<number | null>; appWindow: import('@tauri-apps/api/window').Window; isPointerInsideDrawerRef: React.RefObject<boolean>; licenseGateActiveRef: React.RefObject<boolean>; isPinnedRef: React.RefObject<boolean>; isCanvasModeRef: React.RefObject<boolean>; isMainWorkbenchActiveRef: React.RefObject<boolean>; showLaunchIntroRef: React.RefObject<boolean>; isSplashVisibleRef: React.RefObject<boolean>; showUpdateLogRef: React.RefObject<boolean>; setIsOpen: React.Dispatch<React.SetStateAction<boolean>>; closeTimerRef: React.RefObject<any>; idleAutoCloseTimerRef: React.RefObject<any>; startupAutoCloseSuppressedRef: React.RefObject<boolean>; setIsPinned: React.Dispatch<React.SetStateAction<boolean>>; setDrawerState: React.Dispatch<React.SetStateAction<"closed" | "pre_open" | "open" | "closing">>; setShowTextInput: React.Dispatch<React.SetStateAction<boolean>>; setIsSearchActive: React.Dispatch<React.SetStateAction<boolean>>; setShowSettings: React.Dispatch<React.SetStateAction<boolean>>; setShowFolderModal: React.Dispatch<React.SetStateAction<boolean>>; setShowMoveFolderModal: React.Dispatch<React.SetStateAction<boolean>>; setShowMoveExistingFolderModal: React.Dispatch<React.SetStateAction<boolean>>; setFolderContextMenu: React.Dispatch<React.SetStateAction<FolderContextMenuState | null>>; setSelectedImage: React.Dispatch<React.SetStateAction<string | null>>; setSelectedVideo: React.Dispatch<React.SetStateAction<{ url: string; path: string; fromCanvas?: boolean; } | null>>; triggerModeRef: React.RefObject<TriggerMode>; showToast: (message: string) => void; setCardWidth: React.Dispatch<React.SetStateAction<number>>; setCardMediaHeight: React.Dispatch<React.SetStateAction<number>>; itemsRef: React.RefObject<BufferItem[]>; foldersRef: React.RefObject<Folder[]>; activeFolderIdStateRef: React.RefObject<string>; activeTabRef: React.RefObject<DrawerTabType>; drawerUndoRestoringRef: React.RefObject<boolean>; drawerUndoStackRef: React.RefObject<DrawerUndoSnapshot[]>; takeDrawerUndoSnapshot: (label: string, options?: { shareImmutableItems?: boolean; }) => DrawerUndoSnapshot; DRAWER_UNDO_LIMIT: 8; setItems: React.Dispatch<React.SetStateAction<BufferItem[]>>; drawerTextEditUndoIdsRef: React.RefObject<Set<string>>; pushDrawerUndoSnapshot: (label: string, options?: { shareImmutableItems?: boolean; }) => void; floatingTextUndoTimersRef: React.RefObject<Record<string, number>>; emitFloatingNoteUpdated: (label: string, snapshot: FloatingNoteSnapshot) => Promise<void>; setFolders: React.Dispatch<React.SetStateAction<Folder[]>>; persistFoldersSnapshot: (nextFolders: Folder[]) => void; setActiveFolderId: React.Dispatch<React.SetStateAction<string>>; setActiveTab: React.Dispatch<React.SetStateAction<DrawerTabType>>; setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>; setIsSelectMode: React.Dispatch<React.SetStateAction<boolean>>; setConfirmDialog: React.Dispatch<React.SetStateAction<ConfirmDialogState>>; lastSelectedDrawerItemIdRef: React.RefObject<string | null>; refreshNoteManager: () => void; FLOATING_NOTE_CREATE_LOCK_STORAGE_PREFIX: "drawer_floating_note_create_lock_"; focusFloatingNote: (label: string, snapshot?: FloatingNoteSnapshot | null) => Promise<void>; blankFloatingNoteCreateLockRef: React.RefObject<boolean>; lastBlankFloatingNoteCreatedAtRef: React.RefObject<number>; BLANK_NOTE_CREATE_LOCK_STORAGE_KEY: "drawer_blank_note_create_lock"; setIsCreatingBlankNote: React.Dispatch<React.SetStateAction<boolean>>; createAssetId: () => `${string}-${string}-${string}-${string}-${string}`; activeFolderId: string; setQuickRailMode: React.Dispatch<React.SetStateAction<"notes" | "quick">>; createFloatingNote: (item: BufferItem, options?: { topmost?: boolean; x?: number; y?: number; width?: number; height?: number; silent?: boolean; }) => Promise<{ noteLabel: string; snapshot: FloatingNoteSnapshot; } | null | undefined>; setIsLicenseLoading: React.Dispatch<React.SetStateAction<boolean>>; setLicenseStatus: React.Dispatch<React.SetStateAction<LicenseStatus | null>>; formatLicenseCommandError: (err: unknown) => string; webImageCacheDirRef: React.RefObject<string>; setWebImageCacheDir: React.Dispatch<React.SetStateAction<string>>; registrationEmail: string; setEmailRegistrationError: React.Dispatch<React.SetStateAction<string>>; setIsEmailCodeSending: React.Dispatch<React.SetStateAction<boolean>>; setRegistrationEmail: React.Dispatch<React.SetStateAction<string>>; setEmailChallengeId: React.Dispatch<React.SetStateAction<string>>; setEmailVerificationCode: React.Dispatch<React.SetStateAction<string>>; cloudAccountRefreshFlightRef: React.RefObject<(() => Promise<CloudAccountSummary>) | null>; setIsCloudAccountLoading: React.Dispatch<React.SetStateAction<boolean>>; setCloudAccountSyncError: React.Dispatch<React.SetStateAction<string | null>>; setCloudAccount: React.Dispatch<React.SetStateAction<CloudAccountSummary | null>>; refreshLicenseStatus: (silent?: boolean) => Promise<void>; setIsCreditUsageLoading: React.Dispatch<React.SetStateAction<boolean>>; setCreditUsageError: React.Dispatch<React.SetStateAction<string>>; setCreditUsageItems: React.Dispatch<React.SetStateAction<CloudCreditUsageEntry[]>>; isCloudAccountLoggingOut: boolean; closeConfirmDialog: () => void; setIsCloudAccountLoggingOut: React.Dispatch<React.SetStateAction<boolean>>; setCanvasAiCloudImageModels: React.Dispatch<React.SetStateAction<CloudImageModelsResult | null>>; setRegistrationDisplayName: React.Dispatch<React.SetStateAction<string>>; setCreditRedemptionCode: React.Dispatch<React.SetStateAction<string>>; setCreditRedemptionError: React.Dispatch<React.SetStateAction<string>>; setShowCreditUsage: React.Dispatch<React.SetStateAction<boolean>>; canvasAgent: { settings: AgentSettings; settingsLoading: boolean; saveSettings: (input: AgentSettings & { apiKey?: string; clearApiKey?: boolean; }) => Promise<AgentSettings>; refreshSettings: () => Promise<AgentSettings>; listOpenAiModels: () => Promise<string[]>; testAgentApiConnection: () => Promise<AgentApiConnectionResult>; queryAgentApiBalance: () => Promise<AgentApiBalanceResult>; codexStatus: CodexRuntimeStatus | null; codexRateLimits: CodexRateLimits | null; codexRateLimitsLoading: boolean; codexRateLimitsError: string; codexModels: CodexModelOption[]; codexModelsLoading: boolean; codexModelsError: string; codexInstallProgress: CodexInstallProgress | null; codexLoginInfo: CodexLoginInfo | null; installCodex: () => Promise<CodexRuntimeStatus>; refreshCodexStatus: () => Promise<CodexRuntimeStatus>; refreshCodexRateLimits: () => Promise<CodexRateLimits>; refreshCodexModels: () => Promise<CodexModelOption[]>; startCodexLogin: (mode: "chatgpt" | "chatgptDeviceCode") => Promise<CodexLoginInfo>; openCodexLoginUrl: (url: string) => Promise<void>; logoutCodex: () => Promise<void>; codexApprovals: AgentCodexApproval[]; resolveCodexApproval: (approval: AgentCodexApproval, approved: boolean) => Promise<void>; conversations: AgentConversation[]; activeConversation: AgentConversation; activeConversationId: string; busy: boolean; sendMessage: (content: string, sendOptions?: AgentSendOptions) => Promise<boolean>; optimizePrompt: (content: string, mediaType: "image" | "video") => Promise<string>; cancelCurrent: () => Promise<void>; retryLast: () => Promise<void>; resolveToolCall: (toolCallId: string, approved: boolean) => Promise<void>; executeExternalTool: AgentCanvasToolExecutor; appendWorkflowResult: (result: WorkflowResultCardData) => void; newConversation: () => string; selectConversation: (id: string) => void; deleteConversation: (id: string) => void; clearConversation: () => void; clearAllHistory: () => void; getToolLabel: (name: string) => string; }; creditRedemptionCode: string; setIsRedeemingCredits: React.Dispatch<React.SetStateAction<boolean>>; setIsByokUnlocked: React.Dispatch<React.SetStateAction<boolean>>; setCanvasAiCredentialSource: React.Dispatch<React.SetStateAction<CanvasAiCredentialSource>>; registrationDisplayName: string; emailVerificationCode: string; emailChallengeId: string; setIsEmailVerifying: React.Dispatch<React.SetStateAction<boolean>>; refreshCloudAccount: (silent?: boolean) => Promise<CloudAccountSummary>; canvasAiCloudImageModels: CloudImageModelsResult | null; canvasAiUnifiedImageModelOptions: RoundedSelectOption[]; canvasAiCredentialSource: CanvasAiCredentialSource; };

export const setCanvasInteractionActiveImpl = (ctx: Pick<appLifecycleActionContext, 'cancelCanvasImageSourceUpgradeQueue' | 'canvasInteractionTimerRef' | 'canvasPersistSaveSyncNodesRef' | 'canvasSizeCommitDeferredRef' | 'canvasSizeRef' | 'canvasViewportDeferredDuringZoomRef' | 'flushCanvasChangedNodePatches' | 'isCanvasInteractingRef' | 'runNextCanvasAiOutputThumbnailJob' | 'scheduleCanvasChangedNodesPatchSave' | 'scheduleCanvasStateSave' | 'scheduleCanvasViewportUpdate' | 'scheduleCanvasVisibleImageSourceUpgrades' | 'setCanvasSize'>, active: boolean, releaseDelay: number = 120, _options: { preserveImageSources?: boolean } = {}) => {
  const { cancelCanvasImageSourceUpgradeQueue, canvasInteractionTimerRef, canvasPersistSaveSyncNodesRef, canvasSizeCommitDeferredRef, canvasSizeRef, canvasViewportDeferredDuringZoomRef, flushCanvasChangedNodePatches, isCanvasInteractingRef, runNextCanvasAiOutputThumbnailJob, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, scheduleCanvasViewportUpdate, scheduleCanvasVisibleImageSourceUpgrades, setCanvasSize } = ctx;
    if (canvasInteractionTimerRef.current !== null) {
      window.clearTimeout(canvasInteractionTimerRef.current);
      canvasInteractionTimerRef.current = null;
    }

    if (active) {
      cancelCanvasImageSourceUpgradeQueue();
      isCanvasInteractingRef.current = true;
      return;
    }

    canvasInteractionTimerRef.current = window.setTimeout(() => {
      canvasInteractionTimerRef.current = null;
      if (!isCanvasInteractingRef.current) return;
      isCanvasInteractingRef.current = false;
      if (canvasSizeCommitDeferredRef.current) {
        canvasSizeCommitDeferredRef.current = false;
        setCanvasSize(canvasSizeRef.current);
      }
      if (canvasViewportDeferredDuringZoomRef.current) {
        canvasViewportDeferredDuringZoomRef.current = false;
      }
      scheduleCanvasViewportUpdate();
      scheduleCanvasVisibleImageSourceUpgrades();
      runNextCanvasAiOutputThumbnailJob();
      flushCanvasChangedNodePatches();
      scheduleCanvasChangedNodesPatchSave([]);
      scheduleCanvasStateSave({ syncNodes: canvasPersistSaveSyncNodesRef.current });
    }, releaseDelay);

};

export const setExternalDragActiveImpl = (ctx: Pick<appLifecycleActionContext, 'appWindow' | 'clearExternalDragResetTimer' | 'externalDragResetTimerRef' | 'isCanvasModeRef' | 'isMainWorkbenchActiveRef' | 'isPinnedRef' | 'isPointerInsideDrawerRef' | 'isSplashVisibleRef' | 'licenseGateActiveRef' | 'setIsDraggingOver' | 'setIsOpen' | 'showLaunchIntroRef' | 'showUpdateLogRef'>, active: boolean) => {
  const { appWindow, clearExternalDragResetTimer, externalDragResetTimerRef, isCanvasModeRef, isMainWorkbenchActiveRef, isPinnedRef, isPointerInsideDrawerRef, isSplashVisibleRef, licenseGateActiveRef, setIsDraggingOver, setIsOpen, showLaunchIntroRef, showUpdateLogRef } = ctx;
    clearExternalDragResetTimer();
    setIsDraggingOver(active);
    externalDragResetTimerRef.current = window.setTimeout(() => {
      externalDragResetTimerRef.current = null;
      setIsDraggingOver(false);
      void Promise.all([
        cursorPosition(),
        appWindow.outerPosition(),
        appWindow.outerSize(),
      ]).then(([cursor, position, size]) => {
        const isCursorInside = cursor.x >= position.x
          && cursor.y >= position.y
          && cursor.x <= position.x + size.width
          && cursor.y <= position.y + size.height;
        isPointerInsideDrawerRef.current = isCursorInside;
        if (
          !isCursorInside
          && !licenseGateActiveRef.current
          && !isPinnedRef.current
          && !isCanvasModeRef.current
          && !isMainWorkbenchActiveRef.current
          && !showLaunchIntroRef.current
          && !isSplashVisibleRef.current
          && !showUpdateLogRef.current
        ) {
          setIsOpen(false);
        }
      }).catch(() => {});
    }, active ? 2800 : 1400);

};

export const enforceAntiTouchClosedImpl = (ctx: Pick<appLifecycleActionContext, 'closeTimerRef' | 'idleAutoCloseTimerRef' | 'isPinnedRef' | 'isPointerInsideDrawerRef' | 'setDrawerState' | 'setFolderContextMenu' | 'setIsOpen' | 'setIsPinned' | 'setIsSearchActive' | 'setSelectedImage' | 'setSelectedVideo' | 'setShowFolderModal' | 'setShowMoveExistingFolderModal' | 'setShowMoveFolderModal' | 'setShowSettings' | 'setShowTextInput' | 'showToast' | 'startupAutoCloseSuppressedRef' | 'triggerModeRef'>, showFeedback: boolean = false) => {
  const { closeTimerRef, idleAutoCloseTimerRef, isPinnedRef, isPointerInsideDrawerRef, setDrawerState, setFolderContextMenu, setIsOpen, setIsPinned, setIsSearchActive, setSelectedImage, setSelectedVideo, setShowFolderModal, setShowMoveExistingFolderModal, setShowMoveFolderModal, setShowSettings, setShowTextInput, showToast, startupAutoCloseSuppressedRef, triggerModeRef } = ctx;
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (idleAutoCloseTimerRef.current) {
      clearTimeout(idleAutoCloseTimerRef.current);
      idleAutoCloseTimerRef.current = null;
    }

    startupAutoCloseSuppressedRef.current = false;
    isPointerInsideDrawerRef.current = false;
    isPinnedRef.current = false;
    setIsOpen(false);
    setIsPinned(false);
    setDrawerState('closed');
    setShowTextInput(false);
    setIsSearchActive(false);
    setShowSettings(false);
    setShowFolderModal(false);
    setShowMoveFolderModal(false);
    setShowMoveExistingFolderModal(false);
    setFolderContextMenu(null);
    setSelectedImage(null);
    setSelectedVideo(null);
    invoke('set_anti_touch_lock', { locked: true }).catch(() => {});
    invoke('toggle_pin', { pinned: false }).catch(() => {});
    invoke('close_drawer', { mode: triggerModeRef.current }).finally(() => {
      invoke('hide_edge').catch(() => {});
    });
    if (showFeedback) showToast('防误触已开启，抽屉保持锁定');

};

export const handleDrawerCardWheelImpl = (ctx: Pick<appLifecycleActionContext, 'setCardMediaHeight' | 'setCardWidth'>, event: React.WheelEvent) => {
  const { setCardMediaHeight, setCardWidth } = ctx;
    if (!event.ctrlKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;

    event.preventDefault();
    event.stopPropagation();

    const factor = clamp(Math.exp(-event.deltaY * 0.0012), 0.88, 1.14);
    setCardWidth(previous => Math.round(clamp(previous * factor, 100, 800)));
    setCardMediaHeight(previous => Math.round(clamp(previous * factor, 40, 600)));

};

export const takeDrawerUndoSnapshotImpl = (ctx: Pick<appLifecycleActionContext, 'activeFolderIdStateRef' | 'activeTabRef' | 'foldersRef' | 'itemsRef'>, label: string, options: { shareImmutableItems?: boolean } = {}): DrawerUndoSnapshot => {
  const { activeFolderIdStateRef, activeTabRef, foldersRef, itemsRef } = ctx;
    const openFloatingNoteLabels = readOpenFloatingNoteLabels();
    return {
      // Generated media only adds immutable records. Sharing those existing records
      // keeps the completion path from cloning the entire drawer on the UI thread;
      // restoreDrawerUndoSnapshot still clones them before putting them back in state.
      items: options.shareImmutableItems
        ? itemsRef.current.slice()
        : cloneDrawerValue(itemsRef.current.map(stripHeavyDataThumbnail)),
      folders: options.shareImmutableItems
        ? foldersRef.current.map(folder => ({ ...folder }))
        : cloneDrawerValue(foldersRef.current),
      activeFolderId: activeFolderIdStateRef.current,
      activeTab: activeTabRef.current,
      openFloatingNoteLabels: cloneDrawerValue(openFloatingNoteLabels),
      floatingNotes: openFloatingNoteLabels
        .map(noteLabel => {
          const snapshot = readFloatingNoteSnapshot(noteLabel);
          return snapshot ? { label: noteLabel, snapshot: cloneDrawerValue(compactFloatingNoteSnapshot(snapshot)) } : null;
        })
        .filter((entry): entry is { label: string; snapshot: FloatingNoteSnapshot } => !!entry),
      label,
      createdAt: Date.now(),
    };

};

export const pushDrawerUndoSnapshotImpl = (ctx: Pick<appLifecycleActionContext, 'DRAWER_UNDO_LIMIT' | 'drawerUndoRestoringRef' | 'drawerUndoStackRef' | 'takeDrawerUndoSnapshot'>, label: string, options: { shareImmutableItems?: boolean } = {}) => {
  const { DRAWER_UNDO_LIMIT, drawerUndoRestoringRef, drawerUndoStackRef, takeDrawerUndoSnapshot } = ctx;
    if (drawerUndoRestoringRef.current) return;
    drawerUndoStackRef.current = [
      ...drawerUndoStackRef.current,
      takeDrawerUndoSnapshot(label, options),
    ].slice(-DRAWER_UNDO_LIMIT);

};

export const updateDrawerItemsDeferredImpl = (ctx: Pick<appLifecycleActionContext, 'itemsRef' | 'setItems'>, updater: (previous: BufferItem[]) => BufferItem[]) => {
  const { itemsRef, setItems } = ctx;
    const nextItems = updater(itemsRef.current);
    if (nextItems === itemsRef.current) return;
    itemsRef.current = nextItems;
    startTransition(() => {
      // Reapply the pure updater to React's latest snapshot so an urgent drawer
      // edit made while this transition is pending cannot be overwritten.
      setItems(current => updater(current));
    });

};

export const beginFloatingTextUndoImpl = (ctx: Pick<appLifecycleActionContext, 'drawerTextEditUndoIdsRef' | 'floatingTextUndoTimersRef' | 'pushDrawerUndoSnapshot'>, itemId: string, label: string) => {
  const { drawerTextEditUndoIdsRef, floatingTextUndoTimersRef, pushDrawerUndoSnapshot } = ctx;
    if (!itemId) return;
    if (!drawerTextEditUndoIdsRef.current.has(itemId)) {
      pushDrawerUndoSnapshot(label);
      drawerTextEditUndoIdsRef.current.add(itemId);
    }
    const timers = floatingTextUndoTimersRef.current;
    if (timers[itemId]) window.clearTimeout(timers[itemId]);
    timers[itemId] = window.setTimeout(() => {
      delete timers[itemId];
      drawerTextEditUndoIdsRef.current.delete(itemId);
    }, 900);

};

export const restoreDrawerUndoSnapshotImpl = (ctx: Pick<appLifecycleActionContext, 'drawerTextEditUndoIdsRef' | 'drawerUndoRestoringRef' | 'emitFloatingNoteUpdated' | 'floatingTextUndoTimersRef' | 'lastSelectedDrawerItemIdRef' | 'persistFoldersSnapshot' | 'refreshNoteManager' | 'setActiveFolderId' | 'setActiveTab' | 'setConfirmDialog' | 'setFolders' | 'setIsSelectMode' | 'setItems' | 'setSelectedIds' | 'setShowMoveFolderModal'>, snapshot: DrawerUndoSnapshot) => {
  const { drawerTextEditUndoIdsRef, drawerUndoRestoringRef, emitFloatingNoteUpdated, floatingTextUndoTimersRef, lastSelectedDrawerItemIdRef, persistFoldersSnapshot, refreshNoteManager, setActiveFolderId, setActiveTab, setConfirmDialog, setFolders, setIsSelectMode, setItems, setSelectedIds, setShowMoveFolderModal } = ctx;
    drawerUndoRestoringRef.current = true;
    const snapshotLabels = new Set(snapshot.openFloatingNoteLabels);
    readOpenFloatingNoteLabels().forEach(label => {
      if (!snapshotLabels.has(label)) {
        deleteFloatingNoteSnapshot(label);
        void invoke('hide_note_window', { label }).catch(() => {});
      }
    });
    snapshot.floatingNotes.forEach(entry => {
      localStorage.setItem(floatingNoteStorageKey(entry.label), JSON.stringify(entry.snapshot));
      void emitFloatingNoteUpdated(entry.label, entry.snapshot).catch(() => {});
    });
    writeOpenFloatingNoteLabels(snapshot.openFloatingNoteLabels);
    setItems(previous => {
      const restoredItems = cloneDrawerValue(snapshot.items);
      const restoredIds = new Set(restoredItems.map(item => item.id));
      const retainedPreviouslyStoredItems = previous.filter(item => (
        !restoredIds.has(item.id) && item.createdAt <= snapshot.createdAt
      ));
      return [...restoredItems, ...retainedPreviouslyStoredItems];
    });
    const nextFolders = cloneDrawerValue(snapshot.folders);
    setFolders(nextFolders);
    persistFoldersSnapshot(nextFolders);
    setActiveFolderId(snapshot.activeFolderId);
    setActiveTab(snapshot.activeTab);
    setSelectedIds([]);
    setIsSelectMode(false);
    setShowMoveFolderModal(false);
    drawerTextEditUndoIdsRef.current.clear();
    Object.values(floatingTextUndoTimersRef.current).forEach(timer => window.clearTimeout(timer));
    floatingTextUndoTimersRef.current = {};
    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
    lastSelectedDrawerItemIdRef.current = null;
    refreshNoteManager();
    window.setTimeout(() => {
      drawerUndoRestoringRef.current = false;
    }, 0);

};

export const applyFloatingNoteDestroyImpl = (ctx: Pick<appLifecycleActionContext, 'pushDrawerUndoSnapshot' | 'refreshNoteManager' | 'setItems'>, rawPayload: any) => {
  const { pushDrawerUndoSnapshot, refreshNoteManager, setItems } = ctx;
    const payload = rawPayload || {};
    const itemId = typeof payload.itemId === 'string' ? payload.itemId : '';
    const label = typeof payload.label === 'string' ? payload.label : '';
    if (itemId) {
      pushDrawerUndoSnapshot('删除便签卡片');
      setItems(prev => prev.filter(item => item.id !== itemId));
    }
    if (label) {
      deleteFloatingNoteSnapshot(label);
      invoke('hide_note_window', { label }).catch(() => {});
    }
    refreshNoteManager();

};

export const focusFloatingNoteImpl = async (ctx: Pick<appLifecycleActionContext, 'emitFloatingNoteUpdated' | 'refreshNoteManager' | 'showToast'>, label: string, snapshot?: FloatingNoteSnapshot | null) => {
  const { emitFloatingNoteUpdated, refreshNoteManager, showToast } = ctx;
    try {
      const note = snapshot || readFloatingNoteSnapshot(label);
      if (!note) {
        showToast('这个便签内容已丢失');
        refreshNoteManager();
        return;
      }

      const view = readFloatingNoteViewState(note.itemId);
      rememberOpenFloatingNoteLabel(label);
      await invoke('show_note_window', {
        label,
        width: Number((note as any).width ?? view.width ?? (note.type === 'text' ? TEXT_FLOATING_NOTE_SIZES.large.width : 360)),
        height: Number((note as any).height ?? view.height ?? (note.type === 'text' ? TEXT_FLOATING_NOTE_SIZES.large.height : 340)),
        topmost: !!note.topmost,
      });
      await emitFloatingNoteUpdated(label, note).catch(() => {});
      refreshNoteManager();
    } catch (err) {
      console.error('显示便签失败:', err);
      showToast('显示便签失败');
    }

};

export const closeFloatingNoteByLabelImpl = async (ctx: Pick<appLifecycleActionContext, 'pushDrawerUndoSnapshot' | 'refreshNoteManager' | 'showToast'>, label: string) => {
  const { pushDrawerUndoSnapshot, refreshNoteManager, showToast } = ctx;
    try {
      pushDrawerUndoSnapshot('删除便签');
      deleteFloatingNoteSnapshot(label);
      await invoke('hide_note_window', { label }).catch(() => {});
      refreshNoteManager();
      showToast('已删除便签');
    } catch (err) {
      console.error('删除便签失败:', err);
      showToast('删除便签失败');
    }

};

export const createFloatingNoteImpl = async (ctx: Pick<appLifecycleActionContext, 'FLOATING_NOTE_CREATE_LOCK_STORAGE_PREFIX' | 'emitFloatingNoteUpdated' | 'focusFloatingNote' | 'refreshNoteManager' | 'showToast'>, item: BufferItem, options: { topmost?: boolean; x?: number; y?: number; width?: number; height?: number; silent?: boolean } = {}) => {
  const { FLOATING_NOTE_CREATE_LOCK_STORAGE_PREFIX, emitFloatingNoteUpdated, focusFloatingNote, refreshNoteManager, showToast } = ctx;
    let pendingNoteLabel = '';
    const lockKey = `${FLOATING_NOTE_CREATE_LOCK_STORAGE_PREFIX}${localLockKeyPart(item.id || item.path || item.url || item.name || 'unknown')}`;
    const lockOwner = acquireTimedLocalLock(lockKey, 1600);
    if (!lockOwner) return null;
    try {
      const existingEntry = readOpenFloatingNoteLabels()
        .map(label => ({ label, snapshot: readFloatingNoteSnapshot(label) }))
        .find(entry => entry.snapshot?.itemId === item.id);
      if (existingEntry?.snapshot) {
        await focusFloatingNote(existingEntry.label, existingEntry.snapshot);
        return { noteLabel: existingEntry.label, snapshot: existingEntry.snapshot };
      }

      const openLabels = readOpenFloatingNoteLabels();
      const noteLabel = FLOATING_NOTE_LABELS.find(label => !openLabels.includes(label));
      if (!noteLabel) {
        showToast(`最多同时保存 ${MAX_FLOATING_NOTE_COUNT} 个桌面便签，请先在抽屉侧栏删除一个`);
        return;
      }
      pendingNoteLabel = noteLabel;
      const view = readFloatingNoteViewState(item.id);
      const imageSize = item.type === 'image'
        ? (options.width && options.height
          ? { width: options.width, height: options.height }
          : fitImageFloatingNoteSize(await readImageAspect(item)))
        : null;
      const defaultWidth = item.type === 'text'
        ? TEXT_FLOATING_NOTE_SIZES.large.width
        : (imageSize?.width || 360);
      const defaultHeight = item.type === 'text'
        ? TEXT_FLOATING_NOTE_SIZES.large.height
        : (imageSize?.height || 340);
      const snapshot = {
        ...makeFloatingNoteSnapshot(item),
        id: `${noteLabel}_${item.id}_${Date.now()}`,
        zoom: item.type === 'image' ? 1 : Number(view.zoom ?? 1),
        width: Number(options.width ?? (item.type === 'image' ? (view.width ?? defaultWidth) : (view.width ?? defaultWidth))),
        height: Number(options.height ?? (item.type === 'image' ? (view.height ?? defaultHeight) : (view.height ?? defaultHeight))),
        topmost: !!options.topmost,
      };

      localStorage.setItem(floatingNoteStorageKey(noteLabel), JSON.stringify(snapshot));
      rememberOpenFloatingNoteLabel(noteLabel);

      void emitFloatingNoteUpdated(noteLabel, snapshot).catch(() => {});
      await invoke('show_note_window', {
        label: noteLabel,
        width: snapshot.width,
        height: snapshot.height,
        x: options.x,
        y: options.y,
        topmost: options.topmost,
      });
      await emitFloatingNoteUpdated(noteLabel, snapshot).catch(() => {});
      refreshNoteManager();
      if (!options.silent) showToast('已打开桌面便签');
      return { noteLabel, snapshot: snapshot as FloatingNoteSnapshot };
    } catch (err) {
      console.error('打开桌面便签失败:', err);
      if (pendingNoteLabel) {
        deleteFloatingNoteSnapshot(pendingNoteLabel);
        await invoke('hide_note_window', { label: pendingNoteLabel }).catch(() => {});
      }
      refreshNoteManager();
      showToast('打开桌面便签失败');
      return null;
    } finally {
      window.setTimeout(() => {
        releaseTimedLocalLock(lockKey, lockOwner);
      }, 350);
    }

};

export const createBlankFloatingNoteImpl = async (ctx: Pick<appLifecycleActionContext, 'BLANK_NOTE_CREATE_LOCK_STORAGE_KEY' | 'activeFolderId' | 'blankFloatingNoteCreateLockRef' | 'createAssetId' | 'createFloatingNote' | 'lastBlankFloatingNoteCreatedAtRef' | 'pushDrawerUndoSnapshot' | 'setIsCreatingBlankNote' | 'setItems' | 'setQuickRailMode'>) => {
  const { BLANK_NOTE_CREATE_LOCK_STORAGE_KEY, activeFolderId, blankFloatingNoteCreateLockRef, createAssetId, createFloatingNote, lastBlankFloatingNoteCreatedAtRef, pushDrawerUndoSnapshot, setIsCreatingBlankNote, setItems, setQuickRailMode } = ctx;
    const now = Date.now();
    if (blankFloatingNoteCreateLockRef.current || now - lastBlankFloatingNoteCreatedAtRef.current < 700) return;
    const lockOwner = acquireTimedLocalLock(BLANK_NOTE_CREATE_LOCK_STORAGE_KEY, 1200);
    if (!lockOwner) return;
    blankFloatingNoteCreateLockRef.current = true;
    lastBlankFloatingNoteCreatedAtRef.current = now;
    setIsCreatingBlankNote(true);

    try {
      const item: BufferItem = {
        id: `blank_note_${createAssetId()}`,
        type: 'text',
        content: '',
        name: '新便签',
        remark: '新便签',
        remarks: ['新便签'],
        createdAt: now,
        folderId: activeFolderId !== 'all' ? activeFolderId : undefined,
      };

      pushDrawerUndoSnapshot('新增便签');
      setItems(prev => [item, ...prev]);
      setQuickRailMode('notes');
      const created = await createFloatingNote(item);
      if (!created) {
        setItems(prev => prev.filter(existing => existing.id !== item.id));
      }
    } finally {
      window.setTimeout(() => {
        blankFloatingNoteCreateLockRef.current = false;
        setIsCreatingBlankNote(false);
        releaseTimedLocalLock(BLANK_NOTE_CREATE_LOCK_STORAGE_KEY, lockOwner);
      }, 250);
    }

};

export const refreshLicenseStatusImpl = async (ctx: Pick<appLifecycleActionContext, 'formatLicenseCommandError' | 'setIsLicenseLoading' | 'setLicenseStatus' | 'showToast'>, silent: boolean = false) => {
  const { formatLicenseCommandError, setIsLicenseLoading, setLicenseStatus, showToast } = ctx;
    setIsLicenseLoading(true);
    try {
      const nextStatus = await invoke<LicenseStatus>('get_license_status');
      setLicenseStatus(nextStatus);
      if (!silent) showToast('授权状态已刷新');
    } catch (err) {
      console.error('读取授权状态失败:', err);
      if (!silent) showToast(formatLicenseCommandError(err));
    } finally {
      setIsLicenseLoading(false);
    }

};

export const getLatestFileCacheDirImpl = async (ctx: Pick<appLifecycleActionContext, 'setWebImageCacheDir' | 'webImageCacheDirRef'>) => {
  const { setWebImageCacheDir, webImageCacheDirRef } = ctx;
    const localValue = (
      webImageCacheDirRef.current ||
      localStorage.getItem('drawer_web_image_cache_dir') ||
      ''
    ).trim();
    if (localValue) return localValue;

    try {
      const dir = await invoke<string>('get_web_image_cache_dir');
      if (dir) {
        setWebImageCacheDir(dir);
        webImageCacheDirRef.current = dir;
        localStorage.setItem('drawer_web_image_cache_dir', dir);
        return dir;
      }
    } catch (_) {}

    return '';

};

export const requestEmailCodeImpl = async (ctx: Pick<appLifecycleActionContext, 'formatLicenseCommandError' | 'registrationEmail' | 'setEmailChallengeId' | 'setEmailRegistrationError' | 'setEmailVerificationCode' | 'setIsEmailCodeSending' | 'setRegistrationEmail' | 'showToast'>) => {
  const { formatLicenseCommandError, registrationEmail, setEmailChallengeId, setEmailRegistrationError, setEmailVerificationCode, setIsEmailCodeSending, setRegistrationEmail, showToast } = ctx;
    const email = registrationEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setEmailRegistrationError('请输入有效的邮箱地址');
      return;
    }

    try {
      setIsEmailCodeSending(true);
      setEmailRegistrationError('');
      const challenge = await invoke<EmailCodeChallenge>('request_email_verification', { email });
      setRegistrationEmail(email);
      setEmailChallengeId(challenge.challengeId);
      setEmailVerificationCode('');
      showToast('验证码已发送，请检查邮箱');
    } catch (err) {
      console.error('发送邮箱验证码失败:', err);
      setEmailRegistrationError(formatLicenseCommandError(err));
    } finally {
      setIsEmailCodeSending(false);
    }

};

export const refreshCloudAccountImpl = async (ctx: Pick<appLifecycleActionContext, 'cloudAccountRefreshFlightRef' | 'formatLicenseCommandError' | 'refreshLicenseStatus' | 'setCloudAccount' | 'setCloudAccountSyncError' | 'setIsCloudAccountLoading' | 'showToast'>, silent: boolean = false) => {
  const { cloudAccountRefreshFlightRef, formatLicenseCommandError, refreshLicenseStatus, setCloudAccount, setCloudAccountSyncError, setIsCloudAccountLoading, showToast } = ctx;
    if (!cloudAccountRefreshFlightRef.current) {
      cloudAccountRefreshFlightRef.current = createSingleFlight(async () => {
        setIsCloudAccountLoading(true);
        setCloudAccountSyncError(null);
        try {
          const account = await invoke<CloudAccountSummary>('get_cloud_account');
          setCloudAccount(account);
          writeCachedCloudAccount(account);
          await refreshLicenseStatus(true);
          return account;
        } catch (err) {
          const message = formatLicenseCommandError(err);
          setCloudAccountSyncError(message);
          console.error('读取云端账户失败，保留最近一次成功钱包数据:', err);
          throw err;
        } finally {
          setIsCloudAccountLoading(false);
        }
      });
    }
    try {
      const account = await cloudAccountRefreshFlightRef.current();
      if (!silent) showToast('账户余额已刷新');
      return account;
    } catch (err) {
      if (!silent) showToast(formatLicenseCommandError(err));
      throw err;
    }

};

export const loadCloudCreditUsageImpl = async (ctx: Pick<appLifecycleActionContext, 'formatLicenseCommandError' | 'setCreditUsageError' | 'setCreditUsageItems' | 'setIsCreditUsageLoading'>) => {
  const { formatLicenseCommandError, setCreditUsageError, setCreditUsageItems, setIsCreditUsageLoading } = ctx;
    setIsCreditUsageLoading(true);
    setCreditUsageError('');
    try {
      const result = await invoke<CloudCreditUsageResult>('get_cloud_credit_usage');
      setCreditUsageItems(selectRecentNonZeroCreditUsage(result.items, 50));
    } catch (err) {
      console.error('读取积分使用明细失败:', err);
      setCreditUsageError(formatLicenseCommandError(err));
    } finally {
      setIsCreditUsageLoading(false);
    }

};

export const confirmCloudAccountLogoutImpl = (ctx: Pick<appLifecycleActionContext, 'canvasAgent' | 'closeConfirmDialog' | 'formatLicenseCommandError' | 'isCloudAccountLoggingOut' | 'setCanvasAiCloudImageModels' | 'setCloudAccount' | 'setConfirmDialog' | 'setCreditRedemptionCode' | 'setCreditRedemptionError' | 'setCreditUsageError' | 'setCreditUsageItems' | 'setEmailChallengeId' | 'setEmailRegistrationError' | 'setEmailVerificationCode' | 'setIsCloudAccountLoggingOut' | 'setLicenseStatus' | 'setRegistrationDisplayName' | 'setRegistrationEmail' | 'setShowCreditUsage' | 'showToast'>) => {
  const { canvasAgent, closeConfirmDialog, formatLicenseCommandError, isCloudAccountLoggingOut, setCanvasAiCloudImageModels, setCloudAccount, setConfirmDialog, setCreditRedemptionCode, setCreditRedemptionError, setCreditUsageError, setCreditUsageItems, setEmailChallengeId, setEmailRegistrationError, setEmailVerificationCode, setIsCloudAccountLoggingOut, setLicenseStatus, setRegistrationDisplayName, setRegistrationEmail, setShowCreditUsage, showToast } = ctx;
    if (isCloudAccountLoggingOut) return;
    setConfirmDialog({
      isOpen: true,
      title: '退出登录？',
      message: '退出后会移除本机保存的账户授权，并返回邮箱登录界面。抽屉中的素材和本地设置不会被删除。',
      onConfirm: () => {},
      actions: [
        {
          label: '退出登录',
          className: 'inline-flex items-center gap-1.5 rounded-[16px] bg-red-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-600',
          onClick: async () => {
            closeConfirmDialog();
            setIsCloudAccountLoggingOut(true);
            try {
              const nextStatus = await invoke<LicenseStatus>('remove_license');
              setLicenseStatus(nextStatus);
              setCloudAccount(null);
              clearCachedCloudAccount();
              setCanvasAiCloudImageModels(null);
              setRegistrationEmail('');
              setRegistrationDisplayName('');
              setEmailVerificationCode('');
              setEmailChallengeId('');
              setEmailRegistrationError('');
              setCreditRedemptionCode('');
              setCreditRedemptionError('');
              setShowCreditUsage(false);
              setCreditUsageItems([]);
              setCreditUsageError('');
              await canvasAgent.refreshSettings().catch(() => {});
              showToast('已退出登录');
            } catch (err) {
              console.error('退出账户失败:', err);
              showToast(`退出登录失败：${formatLicenseCommandError(err)}`);
            } finally {
              setIsCloudAccountLoggingOut(false);
            }
          },
        },
      ],
    });

};

export const redeemCloudCreditsImpl = async (ctx: Pick<appLifecycleActionContext, 'canvasAgent' | 'creditRedemptionCode' | 'formatLicenseCommandError' | 'setCanvasAiCredentialSource' | 'setCloudAccount' | 'setCreditRedemptionCode' | 'setCreditRedemptionError' | 'setIsByokUnlocked' | 'setIsRedeemingCredits' | 'showToast'>) => {
  const { canvasAgent, creditRedemptionCode, formatLicenseCommandError, setCanvasAiCredentialSource, setCloudAccount, setCreditRedemptionCode, setCreditRedemptionError, setIsByokUnlocked, setIsRedeemingCredits, showToast } = ctx;
    const code = creditRedemptionCode.trim();
    if (code.length < 10 && code.trim().toLowerCase() !== 'undesign') {
      setCreditRedemptionError('请输入有效的额度兑换码');
      return;
    }
    try {
      setIsRedeemingCredits(true);
      setCreditRedemptionError('');
      const unlocked = await invoke<boolean>('activate_byok_unlock', { code }).catch(() => false);
      if (unlocked) {
        setIsByokUnlocked(true);
        setCanvasAiCredentialSource('local');
        setCreditRedemptionCode('');
        await canvasAgent.refreshSettings().catch(() => {});
        return;
      }
      const result = await invoke<CreditRedemptionResult>('redeem_credit_code', { code });
      setCloudAccount(result.account);
      setCreditRedemptionCode('');
      showToast(`兑换成功，已增加 ${formatCreditAmount(result.redeemedCredits)} 额度`);
    } catch (err) {
      console.error('兑换额度失败:', err);
      setCreditRedemptionError(formatLicenseCommandError(err));
    } finally {
      setIsRedeemingCredits(false);
    }

};

export const cancelByokCustomizationImpl = async (ctx: Pick<appLifecycleActionContext, 'canvasAgent' | 'setCanvasAiCredentialSource' | 'setIsByokUnlocked' | 'showToast'>) => {
  const { canvasAgent, setCanvasAiCredentialSource, setIsByokUnlocked, showToast } = ctx;
    try {
      await invoke('deactivate_byok_unlock');
      setIsByokUnlocked(false);
      setCanvasAiCredentialSource('wallet');
      await canvasAgent.refreshSettings().catch(() => {});
    } catch (err) {
      showToast(String(err));
    }

};

export const verifyEmailAccountImpl = async (ctx: Pick<appLifecycleActionContext, 'emailChallengeId' | 'emailVerificationCode' | 'formatLicenseCommandError' | 'refreshCloudAccount' | 'registrationDisplayName' | 'registrationEmail' | 'setEmailChallengeId' | 'setEmailRegistrationError' | 'setEmailVerificationCode' | 'setIsEmailVerifying' | 'setLicenseStatus' | 'showToast'> & { registrationInviteCode: string }) => {
  const { emailChallengeId, emailVerificationCode, formatLicenseCommandError, refreshCloudAccount, registrationDisplayName, registrationEmail, registrationInviteCode, setEmailChallengeId, setEmailRegistrationError, setEmailVerificationCode, setIsEmailVerifying, setLicenseStatus, showToast } = ctx;
    const email = registrationEmail.trim().toLowerCase();
    const displayName = registrationDisplayName.trim();
    const code = emailVerificationCode.trim();
    if (!emailChallengeId) {
      setEmailRegistrationError('请先获取邮箱验证码');
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setEmailRegistrationError('请输入 6 位数字验证码');
      return;
    }
    if (displayName && (Array.from(displayName).length < 2 || Array.from(displayName).length > 32)) {
      setEmailRegistrationError('用户名需要填写 2 到 32 个字符');
      return;
    }

    try {
      setIsEmailVerifying(true);
      setEmailRegistrationError('');
      const nextStatus = await invoke<LicenseStatus>('verify_email_registration', {
        email,
        challengeId: emailChallengeId,
        code,
        displayName: displayName || null,
        inviteCode: registrationInviteCode.trim() || null,
      });
      setLicenseStatus(nextStatus);
      setEmailVerificationCode('');
      setEmailChallengeId('');
      await refreshCloudAccount(true);
      showToast('邮箱验证成功，高级版授权已同步');
    } catch (err) {
      console.error('邮箱注册或登录失败:', err);
      setEmailRegistrationError(formatLicenseCommandError(err));
    } finally {
      setIsEmailVerifying(false);
    }

};

export const chooseWebImageCacheDirImpl = async (ctx: Pick<appLifecycleActionContext, 'setWebImageCacheDir' | 'showToast' | 'webImageCacheDirRef'>) => {
  const { setWebImageCacheDir, showToast, webImageCacheDirRef } = ctx;
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择文件缓存文件夹',
      });
      if (typeof selected !== 'string') return;

      const savedDir = await invoke<string>('set_web_image_cache_dir', { dir: selected });
      setWebImageCacheDir(savedDir);
      webImageCacheDirRef.current = savedDir;
      localStorage.setItem('drawer_web_image_cache_dir', savedDir);
      showToast('文件缓存路径已更新');
    } catch (err) {
      console.error('设置文件缓存路径失败:', err);
      showToast('缓存路径设置失败');
    }

};

export const resetWebImageCacheDirImpl = async (ctx: Pick<appLifecycleActionContext, 'setWebImageCacheDir' | 'showToast' | 'webImageCacheDirRef'>) => {
  const { setWebImageCacheDir, showToast, webImageCacheDirRef } = ctx;
    try {
      const savedDir = await invoke<string>('set_web_image_cache_dir', { dir: '' });
      setWebImageCacheDir(savedDir);
      webImageCacheDirRef.current = savedDir;
      localStorage.setItem('drawer_web_image_cache_dir', savedDir);
      showToast('已恢复默认缓存路径');
    } catch (err) {
      console.error('恢复默认缓存路径失败:', err);
      showToast('恢复默认路径失败');
    }

};

export const getCanvasAiUnifiedImageModelValueImpl = (ctx: Pick<appLifecycleActionContext, 'canvasAiCloudImageModels' | 'canvasAiCredentialSource' | 'canvasAiUnifiedImageModelOptions'>, provider: CanvasAiProvider, model: string, providerChannelId?: string) => {
  const { canvasAiCloudImageModels, canvasAiCredentialSource, canvasAiUnifiedImageModelOptions } = ctx;
    const parsedOptions = canvasAiUnifiedImageModelOptions.map(option => ({
      option,
      choice: parseCanvasAiModelChoiceValue(option.value),
    }));
    // A provider can expose the same upstream model id from multiple channels
    // that are intentionally mapped to different public SKUs. In that case the
    // channel-specific route is more precise than treating the id as canonical.
    const matchingRouteOption = parsedOptions.find(({ choice }) => (
      choice?.providerCandidates?.some(candidate => (
        candidate.provider === provider
        && candidate.model === model
        && (!providerChannelId || candidate.providerChannelId === providerChannelId)
      ))
    ));
    if (matchingRouteOption) return matchingRouteOption.option.value;
    const matchingCanonicalOption = parsedOptions.find(({ choice }) => {
      if (!choice) return false;
      return choice.model === model
        || choice.providerCandidates?.some(candidate => candidate.canonicalModelId === model);
    });
    if (matchingCanonicalOption) return matchingCanonicalOption.option.value;
    const channel = providerChannelId
      ? canvasAiCloudImageModels?.channels?.find(item => item.id === providerChannelId)
      : undefined;
    const rawPublicName = getCanvasAiPublicImageModelVariantName(
      provider,
      model,
      channel?.capabilities,
      channel?.name,
    );
    const publicName = rawPublicName === 'GPT Image 2 H' ? 'GPT Image 2' : rawPublicName;
    const matchingOption = canvasAiUnifiedImageModelOptions.find(option => option.label === publicName);
    return matchingOption?.value || canvasAiUnifiedImageModelOptions[0]?.value
      || canvasAiModelChoiceValue(canvasAiCredentialSource, provider, model);

};
