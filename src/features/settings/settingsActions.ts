import { convertFileSrc,invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import React from 'react';
import { getCachedPlatformCapabilities,unsupportedPlatformMessage } from '../../platform/capabilities';
import { BufferItem,Folder } from '../../types';
import type { DrawerTabType,FolderContextMenuState } from '../../types/drawer';
import type { CloudImageModelsResult } from '../../types/license';
import type { CanvasAiXaisBalanceState } from '../../types/canvasRuntime';
import type { CollectedWebImage,LocalVisionModelDownloadState,LocalVisionModelStatusPayload,WebImageCollectorReference,WebImageSearchDescription } from '../../types/webImageCollector';
import { canvasAiProviderForCloudKind,getCanvasAiDefaultModel,getCanvasAiEndpointForModels,getCanvasAiRemoteStorageKey,getStoredCanvasAiApiProvider,getStoredCanvasAiEndpoint,getStoredCanvasAiHeadersText,isCanvasAiLikelyOpenAiImageModel,isCanvasAiRemoteModelProvider,normalizeCanvasAiProvider,parseCanvasAiHeaders,sortCanvasAiModelsForProvider } from '../../utils/canvasAiConfig';
import type { AgentApiBalanceResult,AgentApiConnectionResult,AgentCanvasToolExecutor,AgentCodexApproval,AgentConversation,AgentSendOptions,AgentSettings,AiGatewayKind,CodexInstallProgress,CodexLoginInfo,CodexModelOption,CodexRateLimits,CodexRuntimeStatus,WorkflowResultCardData } from '../agentModel';
import { NEW_API_SEEDANCE_2_FAST_MODEL,NEW_API_SEEDANCE_2_MODEL,NEW_API_VIDEO_MODEL_DEFAULT,NEW_API_VIDEO_MODEL_OPTIONS,XAIS_CHAT_VIDEO_MODEL_DEFAULT,getCanvasAiVideoModelOptionValue,isOpenAiLikeCanvasAiProvider,normalizeXaisImage2Model } from '../canvasAiImage';
import { type CanvasAiCreditPricing } from '../canvasGenerationCredits';
import { type CanvasAiProvider,type CanvasImageItem } from '../canvasModel';
import { cacheSuccessfulAiCatalog,getAiCatalogModels,getCachedAiCatalog,reconcileStaleCanvasAiModels } from '../aiModelCapabilities';
import { clamp } from '../common';
import { type TriggerMode } from '../triggerModel';
import { type AiAnalysisConfig } from '../visionAnalysisConfig';

type settingsActionContext = { isCanvasAiLicenseManaged: boolean; canvasAiApiKey: string; setCanvasAiXaisBalance: React.Dispatch<React.SetStateAction<CanvasAiXaisBalanceState>>; showToast: (message: string) => void; effectiveCanvasAiEndpoint: string; canvasAiEndpoint: string; effectiveCanvasAiGatewayKind: AiGatewayKind; effectiveCanvasAiApiProvider: string; effectiveCanvasAiModel: string; canvasAiHeadersText: string; canvasAiUsesCloudImageModels: boolean; effectiveCanvasAiProvider: CanvasAiProvider; canvasAiNewApiVideoKey: string; canvasAiModelRefreshSignatureRef: React.RefObject<string>; setIsRefreshingCanvasAiOpenAiModels: React.Dispatch<React.SetStateAction<boolean>>; setCanvasAiOpenAiModelError: React.Dispatch<React.SetStateAction<string>>; setCanvasAiCloudImageModels: React.Dispatch<React.SetStateAction<CloudImageModelsResult | null>>; setCanvasAiXaisModels: React.Dispatch<React.SetStateAction<string[]>>; setCanvasAiNewApiModels: React.Dispatch<React.SetStateAction<string[]>>; setCanvasAiMikotoModels: React.Dispatch<React.SetStateAction<string[]>>; setCanvasAiOpenAiModels: React.Dispatch<React.SetStateAction<string[]>>; updateCanvasItemsImmediate: (updater: (prev: CanvasImageItem[]) => CanvasImageItem[]) => CanvasImageItem[]; canvasAiProvider: CanvasAiProvider; canvasAgent: { settings: AgentSettings; settingsLoading: boolean; saveSettings: (input: AgentSettings & { apiKey?: string; clearApiKey?: boolean; }) => Promise<AgentSettings>; refreshSettings: () => Promise<AgentSettings>; listOpenAiModels: () => Promise<string[]>; testAgentApiConnection: () => Promise<AgentApiConnectionResult>; queryAgentApiBalance: () => Promise<AgentApiBalanceResult>; codexStatus: CodexRuntimeStatus | null; codexRateLimits: CodexRateLimits | null; codexRateLimitsLoading: boolean; codexRateLimitsError: string; codexModels: CodexModelOption[]; codexModelsLoading: boolean; codexModelsError: string; codexInstallProgress: CodexInstallProgress | null; codexLoginInfo: CodexLoginInfo | null; installCodex: () => Promise<CodexRuntimeStatus>; refreshCodexStatus: () => Promise<CodexRuntimeStatus>; refreshCodexRateLimits: () => Promise<CodexRateLimits>; refreshCodexModels: () => Promise<CodexModelOption[]>; startCodexLogin: (mode: "chatgpt" | "chatgptDeviceCode") => Promise<CodexLoginInfo>; openCodexLoginUrl: (url: string) => Promise<void>; logoutCodex: () => Promise<void>; codexApprovals: AgentCodexApproval[]; resolveCodexApproval: (approval: AgentCodexApproval, approved: boolean) => Promise<void>; conversations: AgentConversation[]; activeConversation: AgentConversation; activeConversationId: string; busy: boolean; sendMessage: (content: string, sendOptions?: AgentSendOptions) => Promise<boolean>; optimizePrompt: (content: string, mediaType: "image" | "video") => Promise<string>; cancelCurrent: () => Promise<void>; retryLast: () => Promise<void>; resolveToolCall: (toolCallId: string, approved: boolean) => Promise<void>; executeExternalTool: AgentCanvasToolExecutor; appendWorkflowResult: (result: WorkflowResultCardData) => void; newConversation: () => string; selectConversation: (id: string) => void; deleteConversation: (id: string) => void; clearConversation: () => void; clearAllHistory: () => void; getToolLabel: (name: string) => string; }; aiApiModel: string; localXaisApiKey: string; splitWebImageTagsFromQuery: (query: string) => string[]; normalizeWebImageCollectorTag: (value: string) => string; normalizeWebImageCollectorTags: (values: string[]) => string[]; localVisionModelDownloadStartedRef: React.RefObject<boolean>; localVisionModelReadyNotifiedRef: React.RefObject<boolean>; setLocalVisionModelLastError: React.Dispatch<React.SetStateAction<string>>; setWebImageCollectorStatus: React.Dispatch<React.SetStateAction<string>>; setIsOpen: React.Dispatch<React.SetStateAction<boolean>>; drawerWidthRef: React.RefObject<number>; drawerHeightRef: React.RefObject<number>; triggerModeRef: React.RefObject<TriggerMode>; isCollectingWebImagesRef: React.RefObject<boolean>; localVisionModelPreparingRef: React.RefObject<boolean>; showWebImageCollector: boolean; setLocalVisionModelDownload: React.Dispatch<React.SetStateAction<LocalVisionModelDownloadState>>; localVisionModelReadyRef: React.RefObject<boolean>; announceLocalVisionModelReady: (options?: { force?: boolean; }) => void; getStoredLocalVisionModel: () => string; setIsLocalVisionModelChecking: React.Dispatch<React.SetStateAction<boolean>>; showLocalVisionModelError: (err: unknown, options?: { silent?: boolean; }) => void; localVisionModelEnsurePromiseRef: React.RefObject<Promise<void> | null>; isInstallingOllama: boolean; setIsInstallingOllama: React.Dispatch<React.SetStateAction<boolean>>; ensureLocalVisionModel: (options?: { silent?: boolean; toast?: boolean; notifyReady?: boolean; }) => Promise<void>; webImageCollectorQuery: string; isCollectingWebImages: boolean; foldersRef: React.RefObject<Folder[]>; createAssetId: () => `${string}-${string}-${string}-${string}-${string}`; getLatestFileCacheDir: () => Promise<string>; setIsCollectingWebImages: React.Dispatch<React.SetStateAction<boolean>>; pushDrawerUndoSnapshot: (label: string, options?: { shareImmutableItems?: boolean; }) => void; setFolders: React.Dispatch<React.SetStateAction<Folder[]>>; insertDrawerFolderAtTop: (currentFolders: Folder[], folder: Folder) => Folder[]; persistFoldersSnapshot: (nextFolders: Folder[]) => void; setItems: React.Dispatch<React.SetStateAction<BufferItem[]>>; enqueueAutoAiTaggingForItems: (incomingItems: BufferItem[]) => void; setActiveFolderId: React.Dispatch<React.SetStateAction<string>>; setActiveTab: React.Dispatch<React.SetStateAction<DrawerTabType>>; setShowWebImageCollector: React.Dispatch<React.SetStateAction<boolean>>; setWebImageCollectorQuery: React.Dispatch<React.SetStateAction<string>>; setWebImageCollectorReference: React.Dispatch<React.SetStateAction<WebImageCollectorReference | null>>; clearWebImageCollectorTags: () => void; imageSourceToModelDataUrl: (source: string) => Promise<string>; hasRemoteImageSearch: () => boolean; remoteImageSearchLabel: () => string; getAiAnalysisConfig: () => AiAnalysisConfig; normalizeRemoteImageSearchDescription: (value: unknown) => WebImageSearchDescription; normalizeLocalVlmImageSearchDescription: (value: unknown) => WebImageSearchDescription; webImageCollectorReference: WebImageCollectorReference | null; isGeneratingWebImageQuery: boolean; localVisionModelLastError: string; setShowTextInput: React.Dispatch<React.SetStateAction<boolean>>; setIsSearchActive: React.Dispatch<React.SetStateAction<boolean>>; setShowSettings: React.Dispatch<React.SetStateAction<boolean>>; setActiveSettingCategory: React.Dispatch<React.SetStateAction<string>>; setShowFolderModal: React.Dispatch<React.SetStateAction<boolean>>; setShowMoveFolderModal: React.Dispatch<React.SetStateAction<boolean>>; setIsGeneratingWebImageQuery: React.Dispatch<React.SetStateAction<boolean>>; describeReferenceImageForSearch: (reference: WebImageCollectorReference, hint: string) => Promise<WebImageSearchDescription>; applyWebImageCollectorTags: (values: string[], fallbackQuery?: string) => { tags: string[]; query: string; }; setWebImageCollectorTagDraft: React.Dispatch<React.SetStateAction<string>>; tags: string[]; webImageSearchSourceLabel: (source: WebImageSearchDescription["source"]) => "本地大模型" | "硅基流动"; setNewFolderParentId: React.Dispatch<React.SetStateAction<string | null>>; setNewFolderName: React.Dispatch<React.SetStateAction<string>>; setFolderContextMenu: React.Dispatch<React.SetStateAction<FolderContextMenuState | null>>; setShowMoveExistingFolderModal: React.Dispatch<React.SetStateAction<boolean>>; isSearchActive: boolean; activateSearch: () => void; searchInputRef: React.RefObject<HTMLInputElement | null>; setSearchQuery: React.Dispatch<React.SetStateAction<string>>; isDrawerWorkbenchMode: boolean; setIsDrawerWorkbenchMode: React.Dispatch<React.SetStateAction<boolean>>; closeTimerRef: React.RefObject<any>; idleAutoCloseTimerRef: React.RefObject<any>; isPointerInsideDrawerRef: React.RefObject<boolean>; isPinnedRef: React.RefObject<boolean>; setIsPinned: React.Dispatch<React.SetStateAction<boolean>>; setDrawerState: React.Dispatch<React.SetStateAction<"closed" | "pre_open" | "open" | "closing">>; isAutoStartChanging: boolean; isAutoStart: boolean; setIsAutoStartChanging: React.Dispatch<React.SetStateAction<boolean>>; setIsAutoStart: React.Dispatch<React.SetStateAction<boolean>>; };

export const getCanvasAiResolvedModelImpl = (ctx: Record<never, never>, provider: CanvasAiProvider, model?: string | null, mediaType: 'image' | 'video' = 'image') => {
  const {  } = ctx;
    const trimmed = String(model || '').trim();
    if (provider === 'xais-chat' && mediaType === 'video') {
      // Keep the public model selected in the node. XAIS only advertises
      // Seedance, but forcing every video node to the XAIS default here made
      // a Kling/Veo selection silently turn back into Seedance.
      return getCanvasAiVideoModelOptionValue(trimmed || XAIS_CHAT_VIDEO_MODEL_DEFAULT);
    }
    if (provider === 'xais-chat' && mediaType === 'image') {
      return normalizeXaisImage2Model(trimmed || getCanvasAiDefaultModel(provider, mediaType));
    }
    if (provider === 'new-api' && mediaType === 'image') {
      return trimmed || getCanvasAiDefaultModel(provider, mediaType);
    }
    if (provider === 'new-api' && mediaType === 'video') {
      const publicModel = getCanvasAiVideoModelOptionValue(trimmed);
      const resolvedModel = publicModel === 'seedance2'
        ? NEW_API_SEEDANCE_2_MODEL
        : publicModel === 'seedance2fast'
          ? NEW_API_SEEDANCE_2_FAST_MODEL
          : publicModel;
      return NEW_API_VIDEO_MODEL_OPTIONS.some(option => (
        option.value === publicModel
        || option.value === resolvedModel
      ))
        ? resolvedModel
        : NEW_API_VIDEO_MODEL_DEFAULT;
    }
    return trimmed || getCanvasAiDefaultModel(provider, mediaType);

};

export const checkCanvasAiXaisBalanceImpl = async (ctx: Pick<settingsActionContext, 'canvasAiApiKey' | 'canvasAiEndpoint' | 'canvasAiHeadersText' | 'effectiveCanvasAiApiProvider' | 'effectiveCanvasAiEndpoint' | 'effectiveCanvasAiGatewayKind' | 'effectiveCanvasAiModel' | 'isCanvasAiLicenseManaged' | 'setCanvasAiXaisBalance' | 'showToast'>) => {
  const { canvasAiApiKey, canvasAiEndpoint, canvasAiHeadersText, effectiveCanvasAiApiProvider, effectiveCanvasAiEndpoint, effectiveCanvasAiGatewayKind, effectiveCanvasAiModel, isCanvasAiLicenseManaged, setCanvasAiXaisBalance, showToast } = ctx;
    const apiKey = isCanvasAiLicenseManaged ? '' : canvasAiApiKey.trim();
    if (!apiKey && !isCanvasAiLicenseManaged) {
      setCanvasAiXaisBalance({ status: 'error', message: '请先填写 API Key' });
      showToast('请先填写 API Key');
      return;
    }

    setCanvasAiXaisBalance({ status: 'loading' });
    try {
      const result = await invoke<{ available: boolean; display: string; expiresAt?: number | null; unsupportedReason?: string | null }>('query_canvas_api_balance', {
        endpoint: effectiveCanvasAiEndpoint || canvasAiEndpoint,
        apiKey,
        gatewayKind: effectiveCanvasAiGatewayKind,
        provider: effectiveCanvasAiApiProvider,
        model: effectiveCanvasAiModel,
        headers: isCanvasAiLicenseManaged ? undefined : parseCanvasAiHeaders(canvasAiHeadersText),
      });
      if (!result.available) {
        const unsupported = result.unsupportedReason || result.display || '该服务未提供标准余额接口';
        setCanvasAiXaisBalance({ status: 'success', message: unsupported, checkedAt: Date.now() });
        showToast(unsupported);
        return;
      }
      const expiresAt = result.expiresAt != null
        ? new Date(result.expiresAt < 1_000_000_000_000 ? result.expiresAt * 1000 : result.expiresAt)
        : null;
      const display = expiresAt && !Number.isNaN(expiresAt.getTime())
        ? `${result.display} · Token 到期 ${expiresAt.toLocaleString('zh-CN')}`
        : result.display;
      setCanvasAiXaisBalance({
        status: 'success',
        message: display,
        checkedAt: Date.now(),
      });
      showToast(display || '余额已读取');
    } catch (err: any) {
      const message = String(err?.message || err || '查询余额失败');
      setCanvasAiXaisBalance({ status: 'error', message });
      showToast('查询余额失败');
    }

};

type settingsCatalogActionContext = settingsActionContext & {
  canvasAiCloudImageModels: CloudImageModelsResult | null;
};

export const refreshCanvasAiOpenAiModelsImpl = async (ctx: Pick<settingsCatalogActionContext, 'canvasAiApiKey' | 'canvasAiCloudImageModels' | 'canvasAiEndpoint' | 'canvasAiHeadersText' | 'canvasAiModelRefreshSignatureRef' | 'canvasAiNewApiVideoKey' | 'canvasAiProvider' | 'canvasAiUsesCloudImageModels' | 'effectiveCanvasAiApiProvider' | 'effectiveCanvasAiEndpoint' | 'effectiveCanvasAiGatewayKind' | 'effectiveCanvasAiModel' | 'effectiveCanvasAiProvider' | 'isCanvasAiLicenseManaged' | 'setCanvasAiCloudImageModels' | 'setCanvasAiMikotoModels' | 'setCanvasAiNewApiModels' | 'setCanvasAiOpenAiModelError' | 'setCanvasAiOpenAiModels' | 'setCanvasAiXaisModels' | 'setIsRefreshingCanvasAiOpenAiModels' | 'showToast' | 'updateCanvasItemsImmediate'>, silent: boolean = false) => {
  const { canvasAiApiKey, canvasAiCloudImageModels, canvasAiEndpoint, canvasAiHeadersText, canvasAiModelRefreshSignatureRef, canvasAiNewApiVideoKey, canvasAiProvider, canvasAiUsesCloudImageModels, effectiveCanvasAiApiProvider, effectiveCanvasAiEndpoint, effectiveCanvasAiGatewayKind, effectiveCanvasAiModel, effectiveCanvasAiProvider, isCanvasAiLicenseManaged, setCanvasAiCloudImageModels, setCanvasAiMikotoModels, setCanvasAiNewApiModels, setCanvasAiOpenAiModelError, setCanvasAiOpenAiModels, setCanvasAiXaisModels, setIsRefreshingCanvasAiOpenAiModels, showToast, updateCanvasItemsImmediate } = ctx;
    if (!canvasAiUsesCloudImageModels && !isCanvasAiRemoteModelProvider(effectiveCanvasAiProvider)) return;
    const provider = effectiveCanvasAiProvider;
    const endpoint = getCanvasAiEndpointForModels(provider, effectiveCanvasAiEndpoint || canvasAiEndpoint);
    const apiKeys = isCanvasAiLicenseManaged
      ? ['']
      : Array.from(new Set([
          canvasAiApiKey.trim(),
          ...(provider === 'new-api' ? [canvasAiNewApiVideoKey.trim()] : []),
        ].filter(Boolean)));
    if (!canvasAiUsesCloudImageModels && (!endpoint || (apiKeys.length === 0 && !isCanvasAiLicenseManaged))) return;
    const keySignature = canvasAiUsesCloudImageModels
      ? 'cloud-wallet-image-models'
      : isCanvasAiLicenseManaged ? 'managed' : apiKeys.join('\n');
    canvasAiModelRefreshSignatureRef.current = `${provider}\n${effectiveCanvasAiGatewayKind}\n${effectiveCanvasAiApiProvider}\n${endpoint}\n${keySignature}\n${effectiveCanvasAiModel}\n${canvasAiHeadersText}`;
    setIsRefreshingCanvasAiOpenAiModels(true);
    setCanvasAiOpenAiModelError('');
    try {
      let detectedProvider = provider;
      let detectedDefaultModel = '';
      let detectedChannels: NonNullable<CloudImageModelsResult['channels']> = [];
      let detectedVideoChannels: NonNullable<CloudImageModelsResult['videoChannels']> = [];
      let detectedPricing: CanvasAiCreditPricing | null | undefined;
      let detectedCatalog: CloudImageModelsResult['catalog'];
      let detectedCapabilities: CloudImageModelsResult['capabilities'];
      let detectedDefaultImageModel: string | null | undefined;
      let detectedDefaultVideoModel: string | null | undefined;
      let hasServerDrivenImageCatalog = false;
      const successfulModels = canvasAiUsesCloudImageModels
        ? await (async () => {
          const result = await invoke<CloudImageModelsResult>('get_cloud_image_models', { provider });
          detectedCatalog = result.catalog;
          detectedCapabilities = result.capabilities;
          detectedDefaultImageModel = result.defaultImageModel;
          detectedDefaultVideoModel = result.defaultVideoModel;
          detectedProvider = canvasAiProviderForCloudKind(result.provider);
          detectedDefaultModel = String(result.defaultModel || '').trim();
          detectedVideoChannels = result.videoChannels || [];
          detectedPricing = result.pricing;
          detectedChannels = (result.channels || []).map(channel => {
            const channelProvider = canvasAiProviderForCloudKind(channel.provider);
            const configuredDefaultModel = String(channel.defaultModel || '').trim();
            const channelModels = [
              ...(channel.models || []),
              ...(configuredDefaultModel ? [configuredDefaultModel] : []),
            ];
            const models = channelProvider === 'xais-chat'
              ? sortCanvasAiModelsForProvider(channelProvider, Array.from(new Set(channelModels
                .map(model => normalizeXaisImage2Model(model.trim()))
                .filter(Boolean))))
              : sortCanvasAiModelsForProvider(channelProvider, Array.from(new Set(channelModels
                .map(model => model.trim())
                .filter(Boolean))));
            return { ...channel, provider: channelProvider, models };
          });
          return [
            ...(result.models || []),
            ...detectedChannels.flatMap(channel => channel.models),
          ];
        })()
        : await (async () => {
          const modelResults = await Promise.allSettled(apiKeys.map(apiKey => invoke<string[]>('get_openai_compatible_models', {
            endpoint,
            apiKey,
            gatewayKind: effectiveCanvasAiGatewayKind,
            provider: effectiveCanvasAiApiProvider,
            model: effectiveCanvasAiModel,
            headers: isCanvasAiLicenseManaged ? undefined : parseCanvasAiHeaders(canvasAiHeadersText),
          })));
          const models = modelResults.flatMap(result => result.status === 'fulfilled' ? result.value || [] : []);
          if (models.length === 0 && modelResults.some(result => result.status === 'rejected')) {
            const failure = modelResults.find(result => result.status === 'rejected');
            throw failure && failure.status === 'rejected' ? failure.reason : new Error('模型列表为空');
          }
          return models;
        })();
      const rawModels = successfulModels.map(model => model.trim()).filter(Boolean);
      const normalized = detectedProvider === 'xais-chat'
        ? sortCanvasAiModelsForProvider(detectedProvider, Array.from(new Set(rawModels
            .map(model => normalizeXaisImage2Model(model)))))
        : sortCanvasAiModelsForProvider(detectedProvider, Array.from(new Set(rawModels)));
      if (canvasAiUsesCloudImageModels) {
        const snapshot = cacheSuccessfulAiCatalog({
          provider: detectedProvider,
          defaultModel: detectedDefaultModel || null,
          defaultImageModel: detectedDefaultImageModel,
          defaultVideoModel: detectedDefaultVideoModel,
          models: normalized,
          catalog: detectedCatalog,
          capabilities: detectedCapabilities,
          channels: detectedChannels,
          videoChannels: detectedVideoChannels,
          pricing: detectedPricing ?? canvasAiCloudImageModels?.pricing ?? getCachedAiCatalog()?.pricing,
        });
        hasServerDrivenImageCatalog = getAiCatalogModels(snapshot, 'image').length > 0;
        setCanvasAiCloudImageModels(snapshot);
        if (getAiCatalogModels(snapshot, 'image').length > 0
          || getAiCatalogModels(snapshot, 'video').length > 0) {
          updateCanvasItemsImmediate(previous => reconcileStaleCanvasAiModels(previous, snapshot));
        }
      } else if (detectedProvider === 'xais-chat') {
        setCanvasAiXaisModels(normalized);
      } else if (detectedProvider === 'new-api') {
        setCanvasAiNewApiModels(normalized);
      } else if (detectedProvider === 'mikoto') {
        setCanvasAiMikotoModels(normalized);
      } else {
        setCanvasAiOpenAiModels(normalized);
      }
      if (!canvasAiUsesCloudImageModels) {
        localStorage.setItem(getCanvasAiRemoteStorageKey(detectedProvider), JSON.stringify(normalized));
      }
      const preferredDefaultModel = detectedDefaultModel || getCanvasAiDefaultModel(detectedProvider);
      const preferredImageModel = isOpenAiLikeCanvasAiProvider(detectedProvider)
        ? normalized.find(isCanvasAiLikelyOpenAiImageModel)
        : '';
      const nextDefaultModel = normalized.includes(preferredDefaultModel)
        ? preferredDefaultModel
        : (preferredImageModel || normalized[0] || preferredDefaultModel);
      const nextVideoModel = NEW_API_VIDEO_MODEL_DEFAULT;
      const defaultChannel = detectedChannels.find(channel => (
        !channel.error && channel.models.includes(nextDefaultModel)
      )) || detectedChannels.find(channel => !channel.error && channel.models.length > 0);
      if (normalized.length > 0 && !hasServerDrivenImageCatalog) {
        updateCanvasItemsImmediate(prev => prev.map(item => {
          const hasSuccessfulOutput = item.ai?.type === 'image-generator'
            && (item.ai.outputs || []).some(output => (
              output.status === 'success' && Boolean(output.url || output.path)
            ));
          if (hasSuccessfulOutput) return item;
          const itemProvider = normalizeCanvasAiProvider(item.ai?.provider || canvasAiProvider);
          const itemChannel = item.ai?.providerChannelId
            ? detectedChannels.find(channel => channel.id === item.ai?.providerChannelId)
            : undefined;
          const hasValidWalletSelection = Boolean(itemChannel
            && canvasAiProviderForCloudKind(itemChannel.provider) === itemProvider
            && item.ai?.model
            && itemChannel.models.includes(item.ai.model));
          const needsImageModel = item.ai?.type === 'image-generator'
            && (canvasAiUsesCloudImageModels
              ? item.ai?.credentialSource !== 'local'
                && !hasValidWalletSelection
              : itemProvider === detectedProvider
                && (!item.ai.model || !normalized.includes(item.ai.model)));
          const needsVideoModel = !canvasAiUsesCloudImageModels
            && detectedProvider === 'new-api'
            && item.ai?.type === 'video-generator'
            && itemProvider === 'new-api'
            && !NEW_API_VIDEO_MODEL_OPTIONS.some(option => (
              option.value === getCanvasAiVideoModelOptionValue(item.ai?.model)
            ));
          if (!needsImageModel && !needsVideoModel) return item;
          return {
              ...item,
              ai: {
                ...item.ai!,
                ...(needsImageModel && canvasAiUsesCloudImageModels && defaultChannel ? {
                  provider: canvasAiProviderForCloudKind(defaultChannel.provider),
                  providerChannelId: defaultChannel.id,
                  credentialSource: 'wallet' as const,
                } : {}),
                model: needsVideoModel
                  ? nextVideoModel
                  : defaultChannel?.models.includes(nextDefaultModel)
                    ? nextDefaultModel
                    : defaultChannel?.models[0] || nextDefaultModel,
              },
            };
        }));
      }
      if (!silent) showToast(normalized.length > 0 ? `已刷新 ${normalized.length} 个模型` : '没有读取到可用模型');
    } catch (err: any) {
      const msg = String(err || '刷新模型列表失败');
      if (canvasAiUsesCloudImageModels) {
        setCanvasAiCloudImageModels(current => current || getCachedAiCatalog());
      }
      setCanvasAiOpenAiModelError(msg);
      if (!silent) showToast('刷新模型列表失败');
    } finally {
      setIsRefreshingCanvasAiOpenAiModels(false);
    }

};

export const remoteImageSearchLabelImpl = (ctx: Pick<settingsActionContext, 'aiApiModel' | 'canvasAgent'>) => {
  const { aiApiModel, canvasAgent } = ctx;
    if (
      canvasAgent.settings.hasApiKey
      && canvasAgent.settings.apiBaseUrl.trim()
      && canvasAgent.settings.apiModel.trim()
    ) {
      const gateway = canvasAgent.settings.apiGatewayKind === 'new_api'
        ? 'NewAPI'
        : canvasAgent.settings.apiGatewayKind === 'xais'
          ? 'XAIS'
          : canvasAgent.settings.apiGatewayKind === 'custom'
            ? '自定义 Gateway'
            : 'OpenAI Compatible';
      return `${gateway} ${canvasAgent.settings.apiModel}`;
    }
    return `硅基流动 ${aiApiModel || '视觉模型'}`;

};

export const checkLocalXaisBalanceImpl = async (ctx: Pick<settingsActionContext, 'localXaisApiKey' | 'setCanvasAiXaisBalance'>) => {
  const { localXaisApiKey, setCanvasAiXaisBalance } = ctx;
    if (!localXaisApiKey) {
      setCanvasAiXaisBalance({ status: 'idle' });
      return;
    }
    setCanvasAiXaisBalance({ status: 'loading' });
    try {
      const result = await invoke<{ available: boolean; display: string; expiresAt?: number | null; unsupportedReason?: string | null }>('query_canvas_api_balance', {
        endpoint: getStoredCanvasAiEndpoint('xais-chat'),
        apiKey: localXaisApiKey,
        gatewayKind: 'xais',
        provider: getStoredCanvasAiApiProvider('xais-chat') || 'xais-chat',
        model: '',
        headers: parseCanvasAiHeaders(getStoredCanvasAiHeadersText('xais-chat')),
      });
      const message = result.available
        ? result.display
        : result.unsupportedReason || result.display || '该 XAIS 账号未提供余额接口';
      setCanvasAiXaisBalance({ status: 'success', message, checkedAt: Date.now() });
      return message;
    } catch (err: any) {
      const message = String(err?.message || err || '查询 XAIS 余额失败');
      setCanvasAiXaisBalance({ status: 'error', message });
      throw err;
    }

};

export const normalizeRemoteImageSearchDescriptionImpl = (ctx: Pick<settingsActionContext, 'normalizeWebImageCollectorTag' | 'normalizeWebImageCollectorTags' | 'splitWebImageTagsFromQuery'>, value: unknown): WebImageSearchDescription => {
  const { normalizeWebImageCollectorTag, normalizeWebImageCollectorTags, splitWebImageTagsFromQuery } = ctx;
    if (typeof value === 'string') {
      const query = value.trim().replace(/\s+/g, ' ');
      return {
        query,
        tags: splitWebImageTagsFromQuery(query),
        source: 'siliconflow',
      };
    }

    const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    const query = String(data.query || '').trim().replace(/\s+/g, ' ');
    const subject = normalizeWebImageCollectorTag(String(data.subject || ''));
    const style = normalizeWebImageCollectorTag(String(data.style || ''));
    const modelTags = Array.isArray(data.tags) ? data.tags.map(tag => String(tag || '')) : [];
    const tags = normalizeWebImageCollectorTags([
      subject,
      style,
      ...modelTags,
      ...(query ? splitWebImageTagsFromQuery(query) : []),
    ]);

    return {
      query: query || tags.join(' '),
      tags,
      subject,
      style,
      source: 'siliconflow',
    };

};

export const announceLocalVisionModelReadyImpl = (ctx: Pick<settingsActionContext, 'drawerHeightRef' | 'drawerWidthRef' | 'localVisionModelDownloadStartedRef' | 'localVisionModelReadyNotifiedRef' | 'setIsOpen' | 'setLocalVisionModelLastError' | 'setWebImageCollectorStatus' | 'showToast' | 'triggerModeRef'>, options: { force?: boolean } = {}) => {
  const { drawerHeightRef, drawerWidthRef, localVisionModelDownloadStartedRef, localVisionModelReadyNotifiedRef, setIsOpen, setLocalVisionModelLastError, setWebImageCollectorStatus, showToast, triggerModeRef } = ctx;
    if ((!options.force && !localVisionModelDownloadStartedRef.current) || localVisionModelReadyNotifiedRef.current) return;
    localVisionModelReadyNotifiedRef.current = true;
    const message = '本地大模型已准备好，可以用参考图搜图了';
    setLocalVisionModelLastError('');
    setWebImageCollectorStatus(prev => prev ? message : prev);
    showToast(message);
    void invoke('show_system_notification', {
      title: '本地大模型已下载完成',
      body: '参考图搜图现在可以使用了。',
    }).catch((err) => console.warn('本地大模型完成通知发送失败:', err));
    setIsOpen(true);
    void invoke('open_drawer', {
      width: drawerWidthRef.current,
      height: drawerHeightRef.current,
      mode: triggerModeRef.current,
    }).catch((err) => console.warn('本地大模型完成后打开抽屉失败:', err));

};

export const handleLocalVisionModelProgressImpl = (ctx: Pick<settingsActionContext, 'announceLocalVisionModelReady' | 'isCollectingWebImagesRef' | 'localVisionModelDownloadStartedRef' | 'localVisionModelPreparingRef' | 'localVisionModelReadyRef' | 'setLocalVisionModelDownload' | 'setLocalVisionModelLastError' | 'setWebImageCollectorStatus' | 'showWebImageCollector'>, progress: { stage?: string; message: string; progress?: number }) => {
  const { announceLocalVisionModelReady, isCollectingWebImagesRef, localVisionModelDownloadStartedRef, localVisionModelPreparingRef, localVisionModelReadyRef, setLocalVisionModelDownload, setLocalVisionModelLastError, setWebImageCollectorStatus, showWebImageCollector } = ctx;
    const message = progress.message || '正在准备本地大模型';
    const shouldHideDuringWebCollect = isCollectingWebImagesRef.current;
    if (progress.stage === 'downloading' || /下载|拉取/.test(message)) {
      localVisionModelPreparingRef.current = true;
      localVisionModelDownloadStartedRef.current = true;
      setLocalVisionModelLastError('');
    }
    if (progress.stage === 'checking' || progress.stage === 'starting' || progress.stage === 'installing') {
      localVisionModelPreparingRef.current = true;
      setLocalVisionModelLastError('');
    }
    if (/正在识别/.test(message)) {
      if (showWebImageCollector && !shouldHideDuringWebCollect) setWebImageCollectorStatus(message);
      return;
    }
    const hasProgress = Number.isFinite(progress.progress);
    const isReady = /已就绪|已下载完成/.test(message);
    setLocalVisionModelDownload(prev => {
      const isDownloading = progress.stage === 'downloading' || /下载|拉取/.test(message);
      const value = hasProgress
        ? clamp(Number(progress.progress), 0, 100)
        : (prev.visible ? prev.progress : 3);
      return {
        visible: isDownloading && !isReady && !shouldHideDuringWebCollect,
        message,
        progress: isReady ? 100 : value,
        phase: isReady ? 'ready' : isDownloading ? 'downloading' : progress.stage === 'installing' ? 'loading' : 'loading',
        startedAt: isReady ? prev.startedAt : (prev.visible && prev.startedAt ? prev.startedAt : Date.now()),
        updatedAt: Date.now(),
      };
    });
    if (isReady) {
      localVisionModelReadyRef.current = true;
      localVisionModelPreparingRef.current = false;
      setLocalVisionModelLastError('');
      announceLocalVisionModelReady();
      window.setTimeout(() => {
        setLocalVisionModelDownload(prev => prev.phase === 'ready' ? { ...prev, visible: false, startedAt: undefined, updatedAt: Date.now() } : prev);
      }, 900);
    }
    if (showWebImageCollector && !shouldHideDuringWebCollect) setWebImageCollectorStatus(message);

};

export const showLocalVisionModelErrorImpl = (ctx: Pick<settingsActionContext, 'localVisionModelPreparingRef' | 'localVisionModelReadyRef' | 'setLocalVisionModelDownload' | 'setLocalVisionModelLastError' | 'setWebImageCollectorStatus' | 'showWebImageCollector'>, err: unknown, options: { silent?: boolean } = {}) => {
  const { localVisionModelPreparingRef, localVisionModelReadyRef, setLocalVisionModelDownload, setLocalVisionModelLastError, setWebImageCollectorStatus, showWebImageCollector } = ctx;
    const message = `本地大模型不可用：${err instanceof Error ? err.message : String(err || '请检查 Ollama 后重试')}`;
    localVisionModelReadyRef.current = false;
    localVisionModelPreparingRef.current = false;
    setLocalVisionModelLastError(message);
    if (options.silent) {
      setLocalVisionModelDownload(prev => ({ ...prev, visible: false, phase: 'idle', updatedAt: Date.now() }));
      console.warn(message);
      return;
    }
    setLocalVisionModelDownload({
      visible: true,
      message,
      progress: 0,
      phase: 'error',
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });
    window.setTimeout(() => {
      setLocalVisionModelDownload(prev => prev.phase === 'error' ? { ...prev, visible: false, startedAt: undefined, updatedAt: Date.now() } : prev);
    }, 5200);
    if (showWebImageCollector) setWebImageCollectorStatus(message);

};

export const checkLocalVisionModelStatusImpl = async (ctx: Pick<settingsActionContext, 'getStoredLocalVisionModel' | 'localVisionModelPreparingRef' | 'localVisionModelReadyRef' | 'setIsLocalVisionModelChecking' | 'setLocalVisionModelDownload' | 'setLocalVisionModelLastError' | 'showLocalVisionModelError'>, options: { silent?: boolean } = {}) => {
  const { getStoredLocalVisionModel, localVisionModelPreparingRef, localVisionModelReadyRef, setIsLocalVisionModelChecking, setLocalVisionModelDownload, setLocalVisionModelLastError, showLocalVisionModelError } = ctx;
    const model = getStoredLocalVisionModel();
    setIsLocalVisionModelChecking(true);
    try {
      const status = await invoke<LocalVisionModelStatusPayload>('get_local_vision_model_status', { model });
      const ready = !!status?.ready;
      localVisionModelReadyRef.current = ready;
      localVisionModelPreparingRef.current = false;
      if (ready) {
        setLocalVisionModelLastError('');
        setLocalVisionModelDownload(prev => ({
          ...prev,
          visible: false,
          message: '本地大模型已就绪',
          progress: 100,
          phase: 'ready',
          updatedAt: Date.now(),
        }));
      } else {
        setLocalVisionModelDownload(prev => ({
          ...prev,
          visible: false,
          message: '本地大模型增量包未下载',
          progress: 0,
          phase: 'idle',
          updatedAt: Date.now(),
        }));
      }
      return ready;
    } catch (err) {
      localVisionModelReadyRef.current = false;
      localVisionModelPreparingRef.current = false;
      if (!options.silent) showLocalVisionModelError(err, { silent: true });
      return false;
    } finally {
      setIsLocalVisionModelChecking(false);
    }

};

export const ensureLocalVisionModelImpl = (ctx: Pick<settingsActionContext, 'announceLocalVisionModelReady' | 'getStoredLocalVisionModel' | 'localVisionModelDownloadStartedRef' | 'localVisionModelEnsurePromiseRef' | 'localVisionModelPreparingRef' | 'localVisionModelReadyRef' | 'setLocalVisionModelDownload' | 'setLocalVisionModelLastError' | 'showLocalVisionModelError' | 'showToast'>, options: { silent?: boolean; toast?: boolean; notifyReady?: boolean } = {}) => {
  const { announceLocalVisionModelReady, getStoredLocalVisionModel, localVisionModelDownloadStartedRef, localVisionModelEnsurePromiseRef, localVisionModelPreparingRef, localVisionModelReadyRef, setLocalVisionModelDownload, setLocalVisionModelLastError, showLocalVisionModelError, showToast } = ctx;
    if (localVisionModelReadyRef.current) return Promise.resolve();
    if (localVisionModelEnsurePromiseRef.current) return localVisionModelEnsurePromiseRef.current;

    const model = getStoredLocalVisionModel();
    localVisionModelPreparingRef.current = true;
    setLocalVisionModelLastError('');
    localVisionModelDownloadStartedRef.current = true;
    if (options.toast) showToast('正在下载本地大模型增量包');

    const promise = invoke('ensure_ollama_vision_model', { model })
      .then(() => {
        localVisionModelReadyRef.current = true;
        localVisionModelPreparingRef.current = false;
        setLocalVisionModelLastError('');
        setLocalVisionModelDownload(prev => ({
          ...prev,
          visible: false,
          message: '本地大模型已就绪',
          progress: 100,
          phase: 'ready',
          updatedAt: Date.now(),
        }));
        if (options.notifyReady) announceLocalVisionModelReady({ force: true });
      })
      .catch((err) => {
        showLocalVisionModelError(err, { silent: options.silent ?? true });
        throw err;
      })
      .finally(() => {
        localVisionModelEnsurePromiseRef.current = null;
      });

    localVisionModelEnsurePromiseRef.current = promise;
    return promise;

};

export const installOllamaSilentlyImpl = async (ctx: Pick<settingsActionContext, 'ensureLocalVisionModel' | 'isInstallingOllama' | 'localVisionModelPreparingRef' | 'setIsInstallingOllama' | 'setLocalVisionModelDownload' | 'setLocalVisionModelLastError' | 'showLocalVisionModelError' | 'showToast'>) => {
  const { ensureLocalVisionModel, isInstallingOllama, localVisionModelPreparingRef, setIsInstallingOllama, setLocalVisionModelDownload, setLocalVisionModelLastError, showLocalVisionModelError, showToast } = ctx;
    if (isInstallingOllama) return;
    setIsInstallingOllama(true);
    localVisionModelPreparingRef.current = true;
    setLocalVisionModelLastError('');
    setLocalVisionModelDownload(prev => ({
      ...prev,
      visible: false,
      message: '正在静默安装 Ollama',
      progress: Math.max(prev.progress || 0, 2),
      phase: 'loading',
      updatedAt: Date.now(),
    }));
    showToast('正在静默安装 Ollama');
    try {
      await invoke('install_ollama_silent');
      showToast('Ollama 已安装，开始下载增量包');
      await ensureLocalVisionModel({ silent: false, toast: true, notifyReady: true });
    } catch (err) {
      console.warn('静默安装 Ollama 失败:', err);
      showLocalVisionModelError(err, { silent: false });
      showToast('静默安装失败，可打开下载页手动安装');
    } finally {
      setIsInstallingOllama(false);
    }

};

export const collectWebImagesToDrawerImpl = async (ctx: Pick<settingsActionContext, 'clearWebImageCollectorTags' | 'createAssetId' | 'enqueueAutoAiTaggingForItems' | 'foldersRef' | 'getLatestFileCacheDir' | 'insertDrawerFolderAtTop' | 'isCollectingWebImages' | 'persistFoldersSnapshot' | 'pushDrawerUndoSnapshot' | 'setActiveFolderId' | 'setActiveTab' | 'setFolders' | 'setIsCollectingWebImages' | 'setIsOpen' | 'setItems' | 'setLocalVisionModelDownload' | 'setShowWebImageCollector' | 'setWebImageCollectorQuery' | 'setWebImageCollectorReference' | 'showToast' | 'webImageCollectorQuery'>, queryOverride?: string) => {
  const { clearWebImageCollectorTags, createAssetId, enqueueAutoAiTaggingForItems, foldersRef, getLatestFileCacheDir, insertDrawerFolderAtTop, isCollectingWebImages, persistFoldersSnapshot, pushDrawerUndoSnapshot, setActiveFolderId, setActiveTab, setFolders, setIsCollectingWebImages, setIsOpen, setItems, setLocalVisionModelDownload, setShowWebImageCollector, setWebImageCollectorQuery, setWebImageCollectorReference, showToast, webImageCollectorQuery } = ctx;
    const query = (queryOverride ?? webImageCollectorQuery).trim().replace(/\s+/g, ' ');
    if (!query || isCollectingWebImages) return;
    const folderName = query.slice(0, 32);
    const existingFolder = foldersRef.current.find(folder => folder.name === folderName);
    const folder: Folder = existingFolder || {
      id: createAssetId(),
      name: folderName,
      color: '#0ea5e9',
    };
    const latestCacheDir = await getLatestFileCacheDir();

    setIsCollectingWebImages(true);
    setLocalVisionModelDownload(prev => ({ ...prev, visible: false, updatedAt: Date.now() }));
    showToast(`开始收集「${query}」图片`);
    try {
      const collected = await invoke<CollectedWebImage[]>('collect_web_images', {
        query,
        count: 10,
        dir: latestCacheDir || undefined,
      });
      if (!Array.isArray(collected) || collected.length === 0) {
        showToast('没有收集到可用图片');
        return;
      }

      const now = Date.now();
      const newItems = collected.map((image, index) => {
        const fileName = image.path.split(/[\\/]/).pop() || `${folderName}_${index + 1}.jpg`;
        return {
          id: `web_collect_${createAssetId()}`,
          type: 'image',
          content: image.title || fileName,
          name: image.title || fileName,
          path: image.path,
          url: convertFileSrc(image.path),
          sourceUrl: image.imageUrl,
          originalUrl: image.imageUrl,
          pageUrl: image.pageUrl || undefined,
          createdAt: now + index,
          isQuickAccess: false,
          folderId: folder.id,
        } as BufferItem;
      });

      pushDrawerUndoSnapshot('网络收集图片');
      if (!existingFolder) {
        setFolders(prev => {
          if (prev.some(item => item.id === folder.id || item.name === folder.name)) return prev;
          const nextFolders = insertDrawerFolderAtTop(prev, folder);
          persistFoldersSnapshot(nextFolders);
          return nextFolders;
        });
      }
      setItems(prev => [...newItems, ...prev]);
      enqueueAutoAiTaggingForItems(newItems);
      setActiveFolderId(folder.id);
      setActiveTab('image');
      setShowWebImageCollector(false);
      setWebImageCollectorQuery('');
      setWebImageCollectorReference(null);
      clearWebImageCollectorTags();
      setIsOpen(true);
      showToast(`已收集 ${newItems.length} 张图片到「${folder.name}」`);
    } catch (err) {
      console.warn('网络图片收集失败:', err);
      showToast(`收集失败：${err instanceof Error ? err.message : String(err || '请稍后重试')}`);
    } finally {
      setIsCollectingWebImages(false);
    }

};

export const describeReferenceImageForSearchImpl = async (ctx: Pick<settingsActionContext, 'getAiAnalysisConfig' | 'getStoredLocalVisionModel' | 'hasRemoteImageSearch' | 'imageSourceToModelDataUrl' | 'localVisionModelReadyRef' | 'normalizeLocalVlmImageSearchDescription' | 'normalizeRemoteImageSearchDescription' | 'remoteImageSearchLabel' | 'setWebImageCollectorStatus' | 'showLocalVisionModelError'>, reference: WebImageCollectorReference, hint: string): Promise<WebImageSearchDescription> => {
  const { getAiAnalysisConfig, getStoredLocalVisionModel, hasRemoteImageSearch, imageSourceToModelDataUrl, localVisionModelReadyRef, normalizeLocalVlmImageSearchDescription, normalizeRemoteImageSearchDescription, remoteImageSearchLabel, setWebImageCollectorStatus, showLocalVisionModelError } = ctx;
    const browserReadableSource = reference.preview || reference.source;
    let aiReadableSource = reference.source;
    let localSource = '';
    try {
      localSource = await imageSourceToModelDataUrl(browserReadableSource);
      if (localSource) aiReadableSource = localSource;
    } catch (imageErr) {
      console.warn('参考图读取失败，将尝试使用原始路径:', imageErr);
    }

    if (hasRemoteImageSearch()) {
      setWebImageCollectorStatus(`正在使用 ${remoteImageSearchLabel()} 识别参考图`);
      try {
        const remoteResult = await invoke<unknown>('describe_image_for_search', {
          imageSource: aiReadableSource,
          hint: hint.trim() || undefined,
          apiConfig: getAiAnalysisConfig(),
        });
        const description = normalizeRemoteImageSearchDescription(remoteResult);
        if (description.query.trim()) return description;
      } catch (remoteErr) {
        console.warn('云端视觉模型参考图识别失败:', remoteErr);
        if (!localVisionModelReadyRef.current) {
          const remoteMessage = remoteErr instanceof Error ? remoteErr.message : String(remoteErr || '请检查视觉模型配置');
          throw new Error(`云端视觉模型识别失败：${remoteMessage}`);
        }
      }
    }

    if (localVisionModelReadyRef.current) {
      setWebImageCollectorStatus('正在使用本地大模型识别参考图');
      try {
        const localVlmResult = await invoke<unknown>('describe_image_for_search_local_vlm', {
          imageSource: aiReadableSource,
          hint: hint.trim() || undefined,
          model: getStoredLocalVisionModel(),
        });
        const description = normalizeLocalVlmImageSearchDescription(localVlmResult);
        if (description.query.trim()) return description;
      } catch (vlmErr) {
        console.warn('本地 Ollama 视觉大模型识别失败:', vlmErr);
        showLocalVisionModelError(vlmErr);
        const vlmMessage = vlmErr instanceof Error ? vlmErr.message : String(vlmErr || '请检查 Ollama 本地视觉模型');
        throw new Error(`本地大模型识别失败：${vlmMessage}`);
      }
    }

    throw new Error('请先在设置里配置硅基流动视觉模型，或下载本地大模型增量包后再按参考图搜图。');

};

export const generateQueryAndCollectFromReferenceImpl = async (ctx: Pick<settingsActionContext, 'applyWebImageCollectorTags' | 'describeReferenceImageForSearch' | 'hasRemoteImageSearch' | 'isCollectingWebImages' | 'isGeneratingWebImageQuery' | 'localVisionModelLastError' | 'localVisionModelPreparingRef' | 'localVisionModelReadyRef' | 'setActiveSettingCategory' | 'setIsGeneratingWebImageQuery' | 'setIsOpen' | 'setIsSearchActive' | 'setShowFolderModal' | 'setShowMoveFolderModal' | 'setShowSettings' | 'setShowTextInput' | 'setShowWebImageCollector' | 'setWebImageCollectorStatus' | 'setWebImageCollectorTagDraft' | 'showToast' | 'splitWebImageTagsFromQuery' | 'webImageCollectorQuery' | 'webImageSearchSourceLabel'>, reference: WebImageCollectorReference | null, hintOverride?: string) => {
  const { applyWebImageCollectorTags, describeReferenceImageForSearch, hasRemoteImageSearch, isCollectingWebImages, isGeneratingWebImageQuery, localVisionModelLastError, localVisionModelPreparingRef, localVisionModelReadyRef, setActiveSettingCategory, setIsGeneratingWebImageQuery, setIsOpen, setIsSearchActive, setShowFolderModal, setShowMoveFolderModal, setShowSettings, setShowTextInput, setShowWebImageCollector, setWebImageCollectorStatus, setWebImageCollectorTagDraft, showToast, splitWebImageTagsFromQuery, webImageCollectorQuery, webImageSearchSourceLabel } = ctx;
    if (!reference?.source || isGeneratingWebImageQuery || isCollectingWebImages) return;

    if (!hasRemoteImageSearch() && !localVisionModelReadyRef.current) {
      const message = localVisionModelPreparingRef.current
        ? '本地大模型增量包正在下载，下载完成后会通知你。'
        : localVisionModelLastError
        ? localVisionModelLastError
        : '请先在设置里配置硅基流动视觉模型，或下载本地大模型增量包后再按参考图搜图。';
      setWebImageCollectorStatus(message);
      setShowWebImageCollector(true);
      setShowTextInput(false);
      setIsSearchActive(false);
      setShowSettings(true);
      setActiveSettingCategory('license');
      setShowFolderModal(false);
      setShowMoveFolderModal(false);
      setIsOpen(true);
      showToast(message);
      return;
    }

    setIsGeneratingWebImageQuery(true);
    setWebImageCollectorStatus(hasRemoteImageSearch() ? '正在使用云端视觉模型识别参考图' : '正在使用本地大模型识别参考图');
    setShowWebImageCollector(true);
    setShowTextInput(false);
    setIsSearchActive(false);
    setShowSettings(false);
    setShowFolderModal(false);
    setShowMoveFolderModal(false);
    setIsOpen(true);
    showToast(hasRemoteImageSearch() ? '正在用云端视觉模型识别参考图' : '正在用本地大模型识别参考图');
    try {
      const described = await describeReferenceImageForSearch(reference, hintOverride ?? webImageCollectorQuery);
      const query = described.query;
      const cleanQuery = String(query || '').trim().replace(/\s+/g, ' ');
      if (!cleanQuery) {
        showToast('没有生成可用的搜图关键词');
        return;
      }
      const recognizedTags = described.tags?.length ? described.tags : splitWebImageTagsFromQuery(cleanQuery);
      const applied = applyWebImageCollectorTags(recognizedTags, cleanQuery);
      setWebImageCollectorTagDraft('');
      setWebImageCollectorStatus(applied.tags.length > 0 ? '已识别标签，可修改后点击开始收集' : '已生成关键词，可修改后点击开始收集');
      showToast(`${webImageSearchSourceLabel(described.source)}已识别标签，可修改后收集`);
    } catch (err) {
      console.warn('按参考图收图失败:', err);
      setWebImageCollectorStatus('');
      showToast(`按图收图失败：${err instanceof Error ? err.message : String(err || '请稍后重试')}`);
    } finally {
      setIsGeneratingWebImageQuery(false);
    }

};

export const chooseReferenceImageForCollectorImpl = async (ctx: Pick<settingsActionContext, 'clearWebImageCollectorTags' | 'isCollectingWebImages' | 'isGeneratingWebImageQuery' | 'setWebImageCollectorQuery' | 'setWebImageCollectorReference' | 'setWebImageCollectorStatus' | 'showToast'>) => {
  const { clearWebImageCollectorTags, isCollectingWebImages, isGeneratingWebImageQuery, setWebImageCollectorQuery, setWebImageCollectorReference, setWebImageCollectorStatus, showToast } = ctx;
    if (isGeneratingWebImageQuery || isCollectingWebImages) return;
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'] }],
      });
      if (typeof selected !== 'string') return;
      const name = selected.split(/[\\/]/).pop() || '参考图';
      setWebImageCollectorQuery('');
      clearWebImageCollectorTags();
      setWebImageCollectorStatus('');
      setWebImageCollectorReference({
        source: selected,
        name,
        preview: convertFileSrc(selected),
      });
    } catch (err) {
      console.warn('选择参考图失败:', err);
      showToast('选择参考图失败');
    }

};

export const handleOpenFolderModalImpl = (ctx: Pick<settingsActionContext, 'foldersRef' | 'setFolderContextMenu' | 'setIsSearchActive' | 'setNewFolderName' | 'setNewFolderParentId' | 'setShowFolderModal' | 'setShowMoveExistingFolderModal' | 'setShowSettings' | 'setShowTextInput' | 'setShowWebImageCollector'>, parentId?: string) => {
  const { foldersRef, setFolderContextMenu, setIsSearchActive, setNewFolderName, setNewFolderParentId, setShowFolderModal, setShowMoveExistingFolderModal, setShowSettings, setShowTextInput, setShowWebImageCollector } = ctx;
    const parent = parentId ? foldersRef.current.find(folder => folder.id === parentId) : null;
    setNewFolderParentId(parent?.id || null);
    setNewFolderName('');
    setShowFolderModal(true);
    setFolderContextMenu(null);
    setShowMoveExistingFolderModal(false);
    setShowWebImageCollector(false);
    setIsSearchActive(false);
    setShowSettings(false);
    setShowTextInput(false);

};

export const toggleSearchImpl = (ctx: Pick<settingsActionContext, 'activateSearch' | 'isSearchActive' | 'searchInputRef' | 'setIsSearchActive' | 'setSearchQuery'>) => {
  const { activateSearch, isSearchActive, searchInputRef, setIsSearchActive, setSearchQuery } = ctx;
    if (!isSearchActive) {
      activateSearch();
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      setIsSearchActive(false);
      setSearchQuery('');
      searchInputRef.current?.blur();
    }

};

export const toggleDrawerWorkbenchModeImpl = (ctx: Pick<settingsActionContext, 'closeTimerRef' | 'idleAutoCloseTimerRef' | 'isDrawerWorkbenchMode' | 'isPinnedRef' | 'isPointerInsideDrawerRef' | 'setDrawerState' | 'setIsDrawerWorkbenchMode' | 'setIsOpen' | 'setIsPinned' | 'showToast'>) => {
  const { closeTimerRef, idleAutoCloseTimerRef, isDrawerWorkbenchMode, isPinnedRef, isPointerInsideDrawerRef, setDrawerState, setIsDrawerWorkbenchMode, setIsOpen, setIsPinned, showToast } = ctx;
    const next = !isDrawerWorkbenchMode;
    setIsDrawerWorkbenchMode(next);
    if (next) {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      if (idleAutoCloseTimerRef.current) {
        clearTimeout(idleAutoCloseTimerRef.current);
        idleAutoCloseTimerRef.current = null;
      }
      isPointerInsideDrawerRef.current = true;
      isPinnedRef.current = false;
      setIsPinned(false);
      setIsOpen(true);
      setDrawerState('open');
      invoke('toggle_pin', { pinned: false }).catch(() => {});
    }
    showToast(next ? '已开启抽屉工作台模式' : '已关闭抽屉工作台模式');

};

export const toggleAutoStartSettingImpl = async (ctx: Pick<settingsActionContext, 'isAutoStart' | 'isAutoStartChanging' | 'setIsAutoStart' | 'setIsAutoStartChanging' | 'showToast'>) => {
  const { isAutoStart, isAutoStartChanging, setIsAutoStart, setIsAutoStartChanging, showToast } = ctx;
    if (getCachedPlatformCapabilities()?.autoStart === false) {
      showToast(unsupportedPlatformMessage('开机自动启动'));
      return;
    }
    if (isAutoStartChanging) return;
    const previous = isAutoStart;
    const next = !isAutoStart;
    setIsAutoStartChanging(true);
    setIsAutoStart(next);
    try {
      await invoke('set_auto_start', { autoStart: next });
      const persisted = await invoke('get_auto_start');
      if (!!persisted !== next) throw new Error('autostart state verification failed');
      setIsAutoStart(!!persisted);
      showToast(next ? '已开启开机自动启动' : '已关闭开机自动启动');
    } catch (err) {
      console.error('设置开机启动失败:', err);
      setIsAutoStart(previous);
      showToast('开机启动设置失败');
    } finally {
      setIsAutoStartChanging(false);
    }

};
