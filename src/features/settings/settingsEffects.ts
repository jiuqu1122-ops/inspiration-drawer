import { invoke } from '@tauri-apps/api/core';
import { emitTo,listen } from '@tauri-apps/api/event';
import React from 'react';
import type { FolderContextMenuState } from '../../types/drawer';
import type { CloudAccountSummary,CloudImageModelsResult } from '../../types/license';
import type { LocalVisionModelProgressPayload } from '../../types/webImageCollector';
import type { AiClassificationGroup } from '../aiClassification';
import type { AiGatewayKind } from '../agentModel';
import { getCanvasAiEndpointForModels,isCanvasAiRemoteModelProvider } from '../../utils/canvasAiConfig';
import { NEW_API_SEEDANCE_2_MODEL,XAIS_CHAT_VIDEO_MODEL_DEFAULT,getCanvasAiVideoModelCandidates } from '../canvasAiImage';
import { type CanvasAiCredentialSource,type CanvasAiProvider,type CanvasImageItem } from '../canvasModel';
import { cacheSuccessfulAiCatalog,getAiCatalogModels,getCachedAiCatalog,getDefaultAiCatalogModelId,hasServerAiCatalog,reconcileStaleCanvasAiModels } from '../aiModelCapabilities';

type settingsEffectContext = { isCanvasMode: boolean; updateCanvasItemsImmediate: (updater: (prev: CanvasImageItem[]) => CanvasImageItem[]) => CanvasImageItem[]; canvasAiCredentialSource: CanvasAiCredentialSource; canvasAiCloudImageModels: CloudImageModelsResult | null; isDrawerAgentOpen: boolean; canvasAiModelRefreshSignatureRef: React.RefObject<string>; canvasAiUsesCloudImageModels: boolean; effectiveCanvasAiProvider: CanvasAiProvider; isCanvasAiLicenseManaged: boolean; canvasAiApiKey: string; canvasAiNewApiVideoKey: string; effectiveCanvasAiEndpoint: string; canvasAiEndpoint: string; effectiveCanvasAiGatewayKind: AiGatewayKind; effectiveCanvasAiApiProvider: string; effectiveCanvasAiModel: string; canvasAiHeadersText: string; refreshCanvasAiOpenAiModels: (silent?: boolean) => Promise<void>; setCanvasAiCloudImageModels: React.Dispatch<React.SetStateAction<CloudImageModelsResult | null>>; startupAutoCloseTimerRef: React.RefObject<any>; idleAutoCloseTimerRef: React.RefObject<any>; setShortcut: React.Dispatch<React.SetStateAction<string>>; setSnipShortcut: React.Dispatch<React.SetStateAction<string>>; setTextShortcut: React.Dispatch<React.SetStateAction<string>>; setSearchShortcut: React.Dispatch<React.SetStateAction<string>>; setTriggerShortcut: React.Dispatch<React.SetStateAction<string>>; setNoteShortcut: React.Dispatch<React.SetStateAction<string>>; setCanvasShortcut: React.Dispatch<React.SetStateAction<string>>; setIsAutoStart: React.Dispatch<React.SetStateAction<boolean>>; setLocalIP: React.Dispatch<React.SetStateAction<string>>; setMobilePairUrl: React.Dispatch<React.SetStateAction<string>>; refreshLicenseStatus: (silent?: boolean) => Promise<void>; cloudStartupSyncStartedRef: React.RefObject<boolean>; refreshCloudAccount: (silent?: boolean) => Promise<CloudAccountSummary>; showWebImageCollector: boolean; webImageCollectorPanelRef: React.RefObject<HTMLDivElement | null>; closeWebImageCollector: () => void; handleLocalVisionModelProgress: (progress: { stage?: string; message: string; progress?: number; }) => void; checkLocalVisionModelStatus: (options?: { silent?: boolean; }) => Promise<boolean>; showSettings: boolean; setShowSettings: React.Dispatch<React.SetStateAction<boolean>>; folderContextMenu: FolderContextMenuState | null; setFolderContextMenu: React.Dispatch<React.SetStateAction<FolderContextMenuState | null>>; stateRef: React.RefObject<{ isOpen: boolean; isPinned: boolean; showTextInput: boolean; isSearchActive: boolean; isAntiTouchMode: boolean; }>; isAntiTouchMode: boolean; enforceAntiTouchClosed: (showFeedback?: boolean) => void; toggleTriggerMode: () => void; setIsDark: React.Dispatch<React.SetStateAction<boolean>>; showToast: (message: string) => void; isDrawerAiClassificationMode: boolean; setActiveDrawerAiClassificationLabel: React.Dispatch<React.SetStateAction<string>>; activeDrawerAiClassificationLabel: string; drawerAiClassificationGroups: AiClassificationGroup[]; };

export const runSettingsEffect01 = (ctx: Pick<settingsEffectContext, 'canvasAiCloudImageModels' | 'canvasAiCredentialSource' | 'isCanvasMode' | 'updateCanvasItemsImmediate'>) => {
  const { canvasAiCloudImageModels, canvasAiCredentialSource, isCanvasMode, updateCanvasItemsImmediate } = ctx;
    if (!isCanvasMode) return;
    const usesServerCatalog = canvasAiCredentialSource === 'wallet'
      && hasServerAiCatalog(canvasAiCloudImageModels);
    const serverVideoCatalog = usesServerCatalog
      ? getAiCatalogModels(canvasAiCloudImageModels, 'video')
      : [];
    const serverDefaultVideoModel = usesServerCatalog
      ? getDefaultAiCatalogModelId(canvasAiCloudImageModels!, 'video')
      : '';
    updateCanvasItemsImmediate(previous => {
      let changed = false;
      const next = previous.map(item => {
        if (item.ai?.type !== 'video-generator'
          || item.ai.provider !== 'xais-chat'
          || item.ai.model !== XAIS_CHAT_VIDEO_MODEL_DEFAULT) return item;
        if (usesServerCatalog) {
          if (!serverDefaultVideoModel || serverVideoCatalog.length === 0) return item;
          changed = true;
          return {
            ...item,
            ai: {
              ...item.ai,
              model: serverDefaultVideoModel,
              credentialSource: canvasAiCredentialSource,
              providerChannelId: undefined,
              providerCandidates: undefined,
            },
          };
        }
        const candidates = getCanvasAiVideoModelCandidates(
          NEW_API_SEEDANCE_2_MODEL,
          canvasAiCredentialSource,
          'new-api',
          canvasAiCloudImageModels?.videoChannels,
        );
        changed = true;
        return {
          ...item,
          ai: {
            ...item.ai,
            provider: 'new-api' as const,
            model: NEW_API_SEEDANCE_2_MODEL,
            credentialSource: canvasAiCredentialSource,
            providerChannelId: undefined,
            providerCandidates: candidates,
          },
        };
      });
      return changed ? next : previous;
    });

};

export const runSettingsEffect02 = (ctx: Pick<settingsEffectContext, 'canvasAiApiKey' | 'canvasAiEndpoint' | 'canvasAiHeadersText' | 'canvasAiModelRefreshSignatureRef' | 'canvasAiNewApiVideoKey' | 'canvasAiUsesCloudImageModels' | 'effectiveCanvasAiApiProvider' | 'effectiveCanvasAiEndpoint' | 'effectiveCanvasAiGatewayKind' | 'effectiveCanvasAiModel' | 'effectiveCanvasAiProvider' | 'isCanvasAiLicenseManaged' | 'isCanvasMode' | 'isDrawerAgentOpen' | 'refreshCanvasAiOpenAiModels'>) => {
  const { canvasAiApiKey, canvasAiEndpoint, canvasAiHeadersText, canvasAiModelRefreshSignatureRef, canvasAiNewApiVideoKey, canvasAiUsesCloudImageModels, effectiveCanvasAiApiProvider, effectiveCanvasAiEndpoint, effectiveCanvasAiGatewayKind, effectiveCanvasAiModel, effectiveCanvasAiProvider, isCanvasAiLicenseManaged, isCanvasMode, isDrawerAgentOpen, refreshCanvasAiOpenAiModels } = ctx;
    const shouldRefreshModels = isCanvasMode || isDrawerAgentOpen;
    if (!shouldRefreshModels) {
      canvasAiModelRefreshSignatureRef.current = '';
      return;
    }
    if (!canvasAiUsesCloudImageModels && !isCanvasAiRemoteModelProvider(effectiveCanvasAiProvider)) {
      canvasAiModelRefreshSignatureRef.current = '';
      return;
    }
    const apiKeys = isCanvasAiLicenseManaged
      ? ['managed']
      : Array.from(new Set([
          canvasAiApiKey.trim(),
          ...(effectiveCanvasAiProvider === 'new-api' ? [canvasAiNewApiVideoKey.trim()] : []),
        ].filter(Boolean)));
    const endpoint = getCanvasAiEndpointForModels(effectiveCanvasAiProvider, effectiveCanvasAiEndpoint || canvasAiEndpoint).trim();
    if (!canvasAiUsesCloudImageModels && ((apiKeys.length === 0 && !isCanvasAiLicenseManaged) || !endpoint)) {
      canvasAiModelRefreshSignatureRef.current = '';
      return;
    }
    const signature = canvasAiUsesCloudImageModels
      ? `${effectiveCanvasAiProvider}\ncloud-wallet-image-models`
      : `${effectiveCanvasAiProvider}\n${effectiveCanvasAiGatewayKind}\n${effectiveCanvasAiApiProvider}\n${endpoint}\n${apiKeys.join('\n')}\n${effectiveCanvasAiModel}\n${canvasAiHeadersText}`;
    if (canvasAiModelRefreshSignatureRef.current === signature) return;
    const timer = window.setTimeout(() => {
      canvasAiModelRefreshSignatureRef.current = signature;
      void refreshCanvasAiOpenAiModels(true);
    }, 850);
    return () => window.clearTimeout(timer);

};

export const runSettingsEffect03 = (ctx: Pick<settingsEffectContext, 'canvasAiUsesCloudImageModels' | 'effectiveCanvasAiProvider' | 'isCanvasMode' | 'setCanvasAiCloudImageModels' | 'updateCanvasItemsImmediate'>) => {
  const { canvasAiUsesCloudImageModels, effectiveCanvasAiProvider, isCanvasMode, setCanvasAiCloudImageModels, updateCanvasItemsImmediate } = ctx;
    if (!isCanvasMode || !canvasAiUsesCloudImageModels) return;
    let disposed = false;
    const refreshCloudPricing = () => {
      void invoke<CloudImageModelsResult>('get_cloud_image_models', {
        provider: effectiveCanvasAiProvider,
      }).then((result) => {
        if (disposed) return;
        const channels = (result.channels || []).map(channel => ({
          ...channel,
          models: Array.from(new Set([
            ...(channel.models || []).map(model => model.trim()).filter(Boolean),
            ...(String(channel.defaultModel || '').trim() ? [String(channel.defaultModel).trim()] : []),
          ])),
        }));
        const snapshot = cacheSuccessfulAiCatalog({
          ...result,
          channels,
          models: Array.from(new Set([
            ...(result.models || []).map(model => model.trim()).filter(Boolean),
            ...channels.flatMap(channel => channel.models),
          ])),
          pricing: result.pricing ?? getCachedAiCatalog()?.pricing,
        });
        setCanvasAiCloudImageModels(snapshot);
        updateCanvasItemsImmediate(previous => reconcileStaleCanvasAiModels(previous, snapshot));
      }).catch(() => {
        // Keep the last known pricing while temporarily offline.
      });
    };
    refreshCloudPricing();
    const onFocus = () => refreshCloudPricing();
    window.addEventListener('focus', onFocus);
    const interval = window.setInterval(refreshCloudPricing, 5 * 60_000);
    return () => {
      disposed = true;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(interval);
    };

};

export const runSettingsEffect04 = (ctx: Pick<settingsEffectContext, 'idleAutoCloseTimerRef' | 'startupAutoCloseTimerRef'>) => {
  const { idleAutoCloseTimerRef, startupAutoCloseTimerRef } = ctx;
    // 旧版 edge 会写 drawer_startup_preview_pending_at 来触发启动预览。
    // 新版启动动画由 main 自己控制，这里只清理旧标记，避免被误判为 startup-preview。
    localStorage.removeItem('drawer_startup_preview_pending_at');

    return () => {
      if (startupAutoCloseTimerRef.current) clearTimeout(startupAutoCloseTimerRef.current);
      if (idleAutoCloseTimerRef.current) clearTimeout(idleAutoCloseTimerRef.current);
    };

};

export const runSettingsEffect05 = (ctx: Pick<settingsEffectContext, 'cloudStartupSyncStartedRef' | 'refreshCloudAccount' | 'refreshLicenseStatus' | 'setCanvasShortcut' | 'setIsAutoStart' | 'setLocalIP' | 'setMobilePairUrl' | 'setNoteShortcut' | 'setSearchShortcut' | 'setShortcut' | 'setSnipShortcut' | 'setTextShortcut' | 'setTriggerShortcut'>) => {
  const { cloudStartupSyncStartedRef, refreshCloudAccount, refreshLicenseStatus, setCanvasShortcut, setIsAutoStart, setLocalIP, setMobilePairUrl, setNoteShortcut, setSearchShortcut, setShortcut, setSnipShortcut, setTextShortcut, setTriggerShortcut } = ctx;
    invoke('get_shortcut', { name: 'update_shortcut' }).then((res: any) => { if (res) setShortcut(res); }).catch(()=>{});
    invoke('get_shortcut', { name: 'update_snip_shortcut' }).then((res: any) => { if (res) setSnipShortcut(res); }).catch(()=>{});
    invoke('get_shortcut', { name: 'update_text_shortcut' }).then((res: any) => { if (res) setTextShortcut(res); }).catch(()=>{});
    invoke('get_shortcut', { name: 'update_search_shortcut' }).then((res: any) => { if (res) setSearchShortcut(res); }).catch(()=>{});
    invoke('get_shortcut', { name: 'update_trigger_shortcut' }).then((res: any) => { if (res) { setTriggerShortcut(res); localStorage.setItem('drawer_trigger_shortcut', res); } }).catch(()=>{});
    invoke('get_shortcut', { name: 'update_note_shortcut' }).then((res: any) => { if (res) setNoteShortcut(res); }).catch(()=>{});
    invoke('get_shortcut', { name: 'update_canvas_shortcut' }).then((res: any) => { if (res) setCanvasShortcut(res); }).catch(()=>{});
    invoke('get_auto_start').then((res: any) => setIsAutoStart(!!res)).catch(()=>{});
    invoke('get_local_ip').then((res: any) => setLocalIP(String(res || ''))).catch(()=>{});
    invoke('get_mobile_pair_url').then((res: any) => setMobilePairUrl(String(res || ''))).catch(()=>{});
    invoke('set_topmost', { topmost: true }).catch(()=>{});
    void refreshLicenseStatus(true);
    if (!cloudStartupSyncStartedRef.current) {
      cloudStartupSyncStartedRef.current = true;
      void refreshCloudAccount(true)
        .catch((err) => {
          console.warn('云端授权同步失败，将按当前本地授权状态继续:', err);
          void refreshLicenseStatus(true);
        });
    }

};

export const runSettingsEffect06 = (ctx: Pick<settingsEffectContext, 'closeWebImageCollector' | 'showWebImageCollector' | 'webImageCollectorPanelRef'>) => {
  const { closeWebImageCollector, showWebImageCollector, webImageCollectorPanelRef } = ctx;
    if (!showWebImageCollector) return;
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || webImageCollectorPanelRef.current?.contains(target)) return;
      closeWebImageCollector();
    };
    document.addEventListener('pointerdown', handleOutsidePointerDown, true);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown, true);

};

export const runSettingsEffect07 = (ctx: Pick<settingsEffectContext, 'checkLocalVisionModelStatus' | 'handleLocalVisionModelProgress'>) => {
  const { checkLocalVisionModelStatus, handleLocalVisionModelProgress } = ctx;
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    const startLocalVisionModelStatusWatcher = async () => {
      try {
        const cleanup = await listen<LocalVisionModelProgressPayload>('local-vision-model-progress', (event) => {
          if (cancelled) return;
          const payload = event.payload || {};
          handleLocalVisionModelProgress({
            stage: payload.stage,
            message: payload.message || '正在准备本地大模型',
            progress: typeof payload.progress === 'number' ? payload.progress : undefined,
          });
        });
        if (cancelled) {
          cleanup();
          return;
        }
        unlisten = cleanup;
      } catch (err) {
        console.warn('监听本地大模型下载进度失败:', err);
      }

      if (!cancelled) void checkLocalVisionModelStatus({ silent: true });
    };

    void startLocalVisionModelStatusWatcher();

    return () => {
      cancelled = true;
      unlisten?.();
    };

};

export const runSettingsEffect08 = (ctx: Pick<settingsEffectContext, 'setShowSettings' | 'showSettings'>) => {
  const { setShowSettings, showSettings } = ctx;
    if (!showSettings) return;
    const closeSettingsOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest('[data-drawer-settings-panel="true"]') ||
        target?.closest('[data-drawer-settings-toggle="true"]')
      ) {
        return;
      }
      setShowSettings(false);
    };

    document.addEventListener('pointerdown', closeSettingsOnOutsidePointer, true);
    return () => {
      document.removeEventListener('pointerdown', closeSettingsOnOutsidePointer, true);
    };

};

export const runSettingsEffect09 = (ctx: Pick<settingsEffectContext, 'folderContextMenu' | 'setFolderContextMenu'>) => {
  const { folderContextMenu, setFolderContextMenu } = ctx;
    if (!folderContextMenu) return;
    const closeFolderContextMenu = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-folder-context-menu="true"]')) return;
      setFolderContextMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFolderContextMenu(null);
    };
    window.addEventListener('pointerdown', closeFolderContextMenu, true);
    window.addEventListener('keydown', closeOnEscape, true);
    return () => {
      window.removeEventListener('pointerdown', closeFolderContextMenu, true);
      window.removeEventListener('keydown', closeOnEscape, true);
    };

};

export const runSettingsEffect10 = (ctx: Pick<settingsEffectContext, 'enforceAntiTouchClosed' | 'setIsDark' | 'showToast' | 'stateRef' | 'toggleTriggerMode'>) => {
  const { enforceAntiTouchClosed, setIsDark, showToast, stateRef, toggleTriggerMode } = ctx;
    let unlistenTrayTrigger: (() => void) | undefined;
    let unlistenTrayTheme: (() => void) | undefined;

    listen('tray-toggle-trigger-mode', () => {
      if (stateRef.current.isAntiTouchMode) {
        enforceAntiTouchClosed(true);
        return;
      }
      toggleTriggerMode();
    }).then(f => unlistenTrayTrigger = f);

    listen('tray-toggle-theme', () => {
      setIsDark(prev => {
        const next = !prev;
        localStorage.setItem('theme', next ? 'dark' : 'light');
        emitTo('edge', 'theme-changed', next ? 'dark' : 'light').catch(() => {});
        showToast(next ? '已切换为深色主题' : '已切换为浅色主题');
        return next;
      });
    }).then(f => unlistenTrayTheme = f);

    return () => {
      if (unlistenTrayTrigger) unlistenTrayTrigger();
      if (unlistenTrayTheme) unlistenTrayTheme();
    };

};

export const runSettingsEffect11 = (ctx: Pick<settingsEffectContext, 'activeDrawerAiClassificationLabel' | 'drawerAiClassificationGroups' | 'isDrawerAiClassificationMode' | 'setActiveDrawerAiClassificationLabel'>) => {
  const { activeDrawerAiClassificationLabel, drawerAiClassificationGroups, isDrawerAiClassificationMode, setActiveDrawerAiClassificationLabel } = ctx;
    if (!isDrawerAiClassificationMode) {
      setActiveDrawerAiClassificationLabel('all');
      return;
    }
    if (
      activeDrawerAiClassificationLabel !== 'all'
      && !drawerAiClassificationGroups.some(group => group.label === activeDrawerAiClassificationLabel)
    ) {
      setActiveDrawerAiClassificationLabel('all');
    }

};
