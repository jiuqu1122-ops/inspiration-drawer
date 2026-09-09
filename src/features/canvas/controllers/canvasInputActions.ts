import { convertFileSrc,invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import React from 'react';
import { type RoundedSelectOption } from '../../../components/RoundedSelect';
import type { AiGatewayKind } from '../../agentModel';
import { CANVAS_TEMPLATE_EXPORT_TYPE,CANVAS_TEMPLATE_EXPORT_VERSION,getCanvasAiPresetPrompt,normalizeCanvasAiPromptPreset,normalizeCanvasWorkflowTemplate } from '../../../services/canvasTemplateStorage';
import { BufferItem } from '../../../types';
import type { CanvasAiPromptPreset } from '../../../types/canvasWorkflow';
import type { ConfirmDialogState } from '../../../types/dialogs';
import type { CloudImageModelsResult } from '../../../types/license';
import { CANVAS_AI_DEFAULT_ASPECT_RATIO } from '../../../utils/canvasAiAspectRatio';
import { CANVAS_AI_DEFAULT_COUNT,CANVAS_AI_DEFAULT_IMAGE_RESOLUTION,CANVAS_AI_DEFAULT_OUTPUT_FORMAT,CANVAS_AI_DEFAULT_VIDEO_DURATION,CANVAS_AI_DEFAULT_VIDEO_RESOLUTION,canvasAiGatewayKindForProvider,getCanvasAiDefaultModel,getCanvasAiEndpointForRequest,getStoredCanvasAiApiKey,getStoredCanvasAiApiProvider,getStoredCanvasAiEndpoint,getStoredCanvasAiHeadersText,normalizeCanvasAiProvider,parseCanvasAiHeaders,parseCanvasAiModelChoiceValue } from '../../../utils/canvasAiConfig';
import { isRemoteHttpImageSource,isXaisAttachmentImageRef } from '../../../utils/canvasImageData';
import { assignCanvasImageFusionInputs } from '../../../utils/canvasImageFusion';
import { canUseCanvasItemAsImageEnhancementInput,canUseCanvasItemAsWorkflowMaterial } from '../../../utils/canvasItemSelectors';
import { cloneDrawerValue,isDataMediaSourceValue } from '../../../utils/canvasSerialization';
import { CANVAS_AI_PROMPT_PRESETS,createCanvasImagePolicy,validateCanvasWorkflowTemplate } from '../../../utils/canvasWorkflowDefinitions';
import { getCanvasWorkflowOutputSlotTemplates } from '../../../utils/canvasWorkflowRuntime';
import { isCanvasAudioFileName } from '../../../utils/localMediaPaths';
import { NEW_API_VIDEO_MODEL_DEFAULT,debugXaisImage2,getCanvasAiReferencePublicationMaxUrlLength,getCanvasAiVideoModelCandidates,getCanvasAiVideoProviderForModel,isOpenAiLikeCanvasAiProvider,normalizeNewApiVideoDurationForModel,orderCanvasAiReferenceSources,resolveCanvasAiReferenceProvider,supportsCanvasAiImageResolution } from '../../canvasAiImage';
import { getCanvasAiNodeAutoSize } from '../../canvasAiNodeLayout';
import { type CanvasAiProvider,type CanvasImageItem,type CanvasItemBox,type CanvasWorkflowRuntime } from '../../canvasModel';
import { publishCanvasReferencesInOrder } from '../../canvasReferencePublication';
import { getCanvasTemplateImportCandidates } from '../../canvasTemplateImport';
import { type CanvasWorkflowNodeTemplate,type CanvasWorkflowTemplate } from '../../canvasTemplates';
import type { CanvasWorkflowUserInputConfig } from '../../canvasWorkflowUserInput';
import { getCanvasWorkflowInternalSlotNodes,isExternalReferenceImageBridge,normalizeCanvasWorkflowRuntime } from '../../canvasWorkflowInternalSlots';
import { embedCanvasWorkflowFixedImages,materializeCanvasWorkflowInstance } from '../../canvasWorkflowPortableImages';
import { normalizeDesignAgentConfig } from '../../designAgentNode';

type canvasInputsActionContext = { kind: "oss" | "cloudflared" | "r2"; id: string; CLOUDFLARED_DISCLAIMER_ACCEPTED_STORAGE_KEY: "drawer_cloudflared_disclaimer_accepted"; showUpdateLogRef: React.RefObject<boolean>; setShowUpdateLog: React.Dispatch<React.SetStateAction<boolean>>; getLatestFileCacheDir: () => Promise<string>; urls: string[]; shareId: string; getCanvasAiErrorSummary: (error?: string | null) => string; isCanvasAiLicenseManaged: boolean; effectiveCanvasAiProvider: CanvasAiProvider; canvasAiProvider: CanvasAiProvider; canvasAiApiKey: string; effectiveCanvasAiEndpoint: string; canvasAiEndpoint: string; effectiveCanvasAiGatewayKind: AiGatewayKind; effectiveCanvasAiApiProvider: string; canvasAiApiProvider: string; effectiveCanvasAiModel: string; canvasAiHeadersText: string; canvasItemsRef: React.RefObject<CanvasImageItem[]>; getCanvasImageInputBufferItemsForNode: (canvasItem: CanvasImageItem, sourceItems?: CanvasImageItem[]) => BufferItem[]; prepareCanvasAiInputSource: (item: BufferItem, mode?: "stable" | "remote-first", delivery?: "auto" | "direct" | "remote-only", referenceFormat?: "any" | "jpeg") => Promise<{ source: string; remoteFallback: string | undefined; usedRemoteFirst: boolean; warning?: undefined; } | { source: string; remoteFallback: string | undefined; warning: unknown; usedRemoteFirst: boolean; }>; usedRemoteFirst: boolean; warning: {}; source: string; remoteFallback: string | undefined; publishLocalAiInputs: (sources: string[], preference?: "cloudflared-first" | "hosted-first" | "oss-only", maxUrlLength?: number) => Promise<{ urls: string[]; shareIds: TemporaryReferenceShare[]; }>; stopTemporaryReferenceShares: (shares: TemporaryReferenceShare[]) => Promise<void>; shareIds: TemporaryReferenceShare[]; uploadXaisReferenceInputs: (sources: string[], provider: CanvasAiProvider) => Promise<string[]>; uploadWalletReferenceInputs: (sources: string[]) => Promise<string[]>; updateCanvasItemsImmediate: (updater: (prev: CanvasImageItem[]) => CanvasImageItem[]) => CanvasImageItem[]; setIsCanvasWorkflowManagerOpen: React.Dispatch<React.SetStateAction<boolean>>; canvasAiPromptPresets: CanvasAiPromptPreset[]; openCanvasPresetEditor: () => void; setCanvasPresetEditorMode: React.Dispatch<React.SetStateAction<"create" | "manage">>; setCanvasPresetEditingId: React.Dispatch<React.SetStateAction<string>>; applyCanvasPresetDraft: (preset?: CanvasAiPromptPreset | null) => void; setSelectedCanvasPresetDeleteIds: React.Dispatch<React.SetStateAction<string[]>>; setIsCanvasPresetEditorOpen: React.Dispatch<React.SetStateAction<boolean>>; canvasPresetNameDraft: string; canvasPresetPromptDraft: string; showToast: (message: string) => void; canvasPresetEditorMode: "create" | "manage"; canvasPresetEditingId: string; setCustomCanvasAiPromptPresets: React.Dispatch<React.SetStateAction<CanvasAiPromptPreset[]>>; updateCanvasNodesForPreset: (preset: CanvasAiPromptPreset) => void; closeCanvasPresetEditor: () => void; setHiddenBuiltInCanvasAiPromptPresetIds: React.Dispatch<React.SetStateAction<string[]>>; setCanvasPresetNameDraft: React.Dispatch<React.SetStateAction<string>>; setCanvasPresetPromptDraft: React.Dispatch<React.SetStateAction<string>>; chooseCanvasTemplateImportFiles: () => Promise<string[]>; getCanvasTemplateImportPayload: (rawValue: unknown) => { presets: CanvasAiPromptPreset[]; workflows: { builtin: boolean; id: string; label: string; hint: string; nodes: CanvasWorkflowNodeTemplate[]; userInput?: CanvasWorkflowUserInputConfig; createdAt?: number; }[]; workflowInstances: { workflow: { builtin: boolean; id: string; label: string; hint: string; nodes: CanvasWorkflowNodeTemplate[]; userInput?: CanvasWorkflowUserInputConfig; createdAt?: number; }; runtime: CanvasWorkflowRuntime; }[]; }; presets: CanvasAiPromptPreset[]; workflows: { builtin: boolean; id: string; label: string; hint: string; nodes: CanvasWorkflowNodeTemplate[]; userInput?: CanvasWorkflowUserInputConfig; createdAt?: number; }[]; workflowInstances: { workflow: { builtin: boolean; id: string; label: string; hint: string; nodes: CanvasWorkflowNodeTemplate[]; userInput?: CanvasWorkflowUserInputConfig; createdAt?: number; }; runtime: CanvasWorkflowRuntime; }[]; canvasWorkflowTemplates: CanvasWorkflowTemplate[]; materializeImportedCanvasWorkflows: (workflows: CanvasWorkflowTemplate[]) => Promise<CanvasWorkflowTemplate[]>; setCustomCanvasWorkflows: React.Dispatch<React.SetStateAction<CanvasWorkflowTemplate[]>>; setCanvasWorkflowEditingId: React.Dispatch<React.SetStateAction<string>>; setCanvasWorkflowNameDraft: React.Dispatch<React.SetStateAction<string>>; setCanvasWorkflowHintDraft: React.Dispatch<React.SetStateAction<string>>; isCanvasModeRef: React.RefObject<boolean>; enterCanvasMode: () => void; getCanvasDropPosition: (index?: number, client?: { x: number; y: number; }) => { x: number; y: number; }; buildCanvasWorkflowModuleNode: (workflow: CanvasWorkflowTemplate, pos: { x: number; y: number; }, inputIds?: string[]) => CanvasImageItem | null; x: number; y: number; appendCanvasItems: (nextItems: CanvasImageItem[], label: string, select?: boolean) => number; imageSourceToDataUrl: (source: string, optimizeForAi?: boolean) => Promise<string>; selectedCanvasPresetDeleteIds: string[]; setConfirmDialog: React.Dispatch<React.SetStateAction<ConfirmDialogState>>; deleteCanvasAiPromptPresetIds: (presetIds: string[]) => void; closeConfirmDialog: () => void; createAssetId: () => `${string}-${string}-${string}-${string}-${string}`; canvasAiUnifiedImageModelOptions: RoundedSelectOption[]; getCanvasAiResolvedModel: (provider: CanvasAiProvider, model?: string | null, mediaType?: "image" | "video") => string; makeCanvasNodeId: (seed: string, kind?: string) => string; buildCanvasAiGeneratorNode: (pos: { x: number; y: number; }, preset?: CanvasAiPromptPreset, inputIds?: string[], mediaType?: "image" | "video") => CanvasImageItem; getSelectedCanvasImageFusionInputIds: () => string[]; getCanvasItemsBounds: (ids: string[]) => CanvasItemBox | null; buildCanvasImageFusionNode: (pos: { x: number; y: number; }, inputIds?: string[]) => CanvasImageItem; updateCanvasSelection: (ids: string[]) => void; getSelectedCanvasAiInputIds: () => string[]; getSelectedFrameInterpolationInputIds: () => string[]; buildCanvasFrameInterpolationNode: (pos: { x: number; y: number; }, inputIds?: string[]) => CanvasImageItem; getSelectedEnhancementInputIds: (mediaType: "image" | "video") => string[]; buildCanvasEnhancementNode: (pos: { x: number; y: number; }, mediaType: "image" | "video", inputIds?: string[]) => CanvasImageItem; };

type TemporaryReferenceShare = {
  kind: 'oss' | 'cloudflared' | 'r2';
  id: string;
};
type CloudflaredPublicImageUrlsResult = {
  shareId: string;
  urls: string[];
};

export const stopTemporaryReferenceSharesImpl = async (ctx: Record<never, never>, shares: TemporaryReferenceShare[]) => {
  const {  } = ctx;
    await Promise.all(shares.map(share => {
      const command = share.kind === 'oss'
        ? 'delete_oss_public_image_urls'
        : share.kind === 'r2' ? 'delete_r2_public_image_urls' : 'stop_cloudflared_share';
      return invoke(command, { shareId: share.id }).catch(err => {
        console.warn(`${share.kind} 临时分享清理失败:`, err);
      });
    }));

};

export const publishLocalAiInputsImpl = async (ctx: Pick<canvasInputsActionContext, 'CLOUDFLARED_DISCLAIMER_ACCEPTED_STORAGE_KEY' | 'getCanvasAiErrorSummary' | 'getLatestFileCacheDir' | 'setShowUpdateLog' | 'showUpdateLogRef'>, sources: string[], preference: 'cloudflared-first' | 'hosted-first' | 'oss-only' = 'cloudflared-first', maxUrlLength: number = 64) => {
  const { CLOUDFLARED_DISCLAIMER_ACCEPTED_STORAGE_KEY, getCanvasAiErrorSummary, getLatestFileCacheDir, setShowUpdateLog, showUpdateLogRef } = ctx;
    if (sources.length === 0) return { urls: [] as string[], shareIds: [] as TemporaryReferenceShare[] };
    // Read the persisted value here instead of relying on the render-time state captured by
    // this async generation run. This also covers the narrow window immediately after the
    // user accepts the disclaimer and retries generation.
    if (localStorage.getItem(CLOUDFLARED_DISCLAIMER_ACCEPTED_STORAGE_KEY) !== 'true') {
      showUpdateLogRef.current = true;
      setShowUpdateLog(true);
      throw new Error('使用本地图生图前，需要先同意本软件免责声明；已为你打开免责说明，请点击“同意并知道了”后重新生成');
    }

    const publishViaCloudflared = async () => {
      const cacheDir = await getLatestFileCacheDir();
      const result = await invoke<CloudflaredPublicImageUrlsResult>('create_cloudflared_public_image_urls', {
        sources,
        dir: cacheDir,
        maxUrlLength,
      });
      const urls = Array.isArray(result.urls) ? result.urls.filter(Boolean) : [];
      if (!result.shareId || urls.length === 0) {
        throw new Error('cloudflared 没有返回可用的公网图片 URL');
      }
      return { urls, shareIds: [{ kind: 'cloudflared' as const, id: result.shareId }] };
    };

    const publishViaOss = async () => {
      const result = await invoke<CloudflaredPublicImageUrlsResult>('create_oss_public_image_urls', { sources });
      const urls = Array.isArray(result.urls) ? result.urls.filter(Boolean) : [];
      if (!result.shareId || urls.length === 0) {
        throw new Error('OSS 没有返回可用的公网图片 URL');
      }
      return { urls, shareIds: [{ kind: 'oss' as const, id: result.shareId }] };
    };

    const publishViaLitterbox = async () => {
      const result = await invoke<CloudflaredPublicImageUrlsResult>('create_litterbox_public_image_urls', {
        sources,
        time: '1h',
      });
      const urls = Array.isArray(result.urls) ? result.urls.filter(Boolean) : [];
      if (urls.length === 0) {
        throw new Error('Litterbox 没有返回可用的公网图片 URL');
      }
      return { urls, shareIds: [] as TemporaryReferenceShare[] };
    };

    const publishViaTmpfiles = async () => {
      const result = await invoke<CloudflaredPublicImageUrlsResult>('create_tmpfiles_public_image_urls', { sources });
      const urls = Array.isArray(result.urls) ? result.urls.filter(Boolean) : [];
      if (urls.length === 0) {
        throw new Error('Tmpfiles 没有返回可用的公网图片 URL');
      }
      return { urls, shareIds: [] as TemporaryReferenceShare[] };
    };

    const publishViaR2 = async () => {
      const result = await invoke<CloudflaredPublicImageUrlsResult>('create_r2_public_image_urls', { sources });
      const urls = Array.isArray(result.urls) ? result.urls.filter(Boolean) : [];
      if (!result.shareId || urls.length === 0) {
        throw new Error('R2 没有返回可用的公网图片 URL');
      }
      return { urls, shareIds: [{ kind: 'r2' as const, id: result.shareId }] };
    };

    const attempts = preference === 'oss-only'
      ? [
        { label: 'OSS', run: publishViaOss },
      ]
      : preference === 'hosted-first'
      ? [
        { label: 'OSS', run: publishViaOss },
        { label: 'Litterbox', run: publishViaLitterbox },
        { label: 'cloudflared', run: publishViaCloudflared },
        { label: 'R2', run: publishViaR2 },
        { label: 'Tmpfiles', run: publishViaTmpfiles },
      ]
      : [
        { label: 'OSS', run: publishViaOss },
        { label: 'cloudflared', run: publishViaCloudflared },
        { label: 'Litterbox', run: publishViaLitterbox },
        { label: 'R2', run: publishViaR2 },
        { label: 'Tmpfiles', run: publishViaTmpfiles },
      ];
    const errors: Array<{ label: string; error: unknown }> = [];
    for (const attempt of attempts) {
      try {
        return await attempt.run();
      } catch (error) {
        errors.push({ label: attempt.label, error });
        const nextAttempt = attempts[errors.length];
        console.warn(`${attempt.label} 参考图发布失败${nextAttempt ? `，尝试改用 ${nextAttempt.label}` : ''}:`, error);
      }
    }

    const visibleErrors = errors.filter(({ label, error }) => {
      if (label !== 'R2') return true;
      return !/r2\.local\.json|R2 配置|没有找到 r2/i.test(error instanceof Error ? error.message : String(error));
    });
    const summary = (visibleErrors.length > 0 ? visibleErrors : errors)
      .map(({ label, error }) => `${label}：${getCanvasAiErrorSummary(error instanceof Error ? error.message : String(error))}`)
      .join('；');
    throw new Error(summary || '公网参考图发布失败');

};

export const uploadWalletReferenceInputsImpl = async (ctx: Record<never, never>, sources: string[]) => {
  const {  } = ctx;
    const cleanSources = sources.map(source => source.trim()).filter(Boolean).slice(0, 32);
    if (cleanSources.length === 0) return [] as string[];
    const objectKeys = await invoke<string[]>('upload_wallet_reference_images', { sources: cleanSources });
    const output = (objectKeys || []).map(value => value.trim()).filter(value => value.startsWith('reference-images/'));
    if (output.length !== cleanSources.length) {
      throw new Error(`Wallet reference upload returned ${output.length} objects for ${cleanSources.length} inputs.`);
    }
    return output;

};

export const uploadXaisReferenceInputsImpl = async (ctx: Pick<canvasInputsActionContext, 'canvasAiApiKey' | 'canvasAiApiProvider' | 'canvasAiEndpoint' | 'canvasAiHeadersText' | 'canvasAiProvider' | 'effectiveCanvasAiApiProvider' | 'effectiveCanvasAiEndpoint' | 'effectiveCanvasAiGatewayKind' | 'effectiveCanvasAiModel' | 'effectiveCanvasAiProvider' | 'isCanvasAiLicenseManaged'>, sources: string[], provider: CanvasAiProvider) => {
  const { canvasAiApiKey, canvasAiApiProvider, canvasAiEndpoint, canvasAiHeadersText, canvasAiProvider, effectiveCanvasAiApiProvider, effectiveCanvasAiEndpoint, effectiveCanvasAiGatewayKind, effectiveCanvasAiModel, effectiveCanvasAiProvider, isCanvasAiLicenseManaged } = ctx;
    const cleanSources = sources.map(source => source.trim()).filter(Boolean).slice(0, 8);
    if (cleanSources.length === 0) return [] as string[];
    const requestProvider = isCanvasAiLicenseManaged ? effectiveCanvasAiProvider : provider;
    const apiKey = isCanvasAiLicenseManaged
      ? ''
      : (provider === canvasAiProvider ? canvasAiApiKey : getStoredCanvasAiApiKey(provider)).trim();
    if (!apiKey && !isCanvasAiLicenseManaged) throw new Error('Please enter XAIS API Key first.');
    const endpoint = getCanvasAiEndpointForRequest(
      requestProvider,
      isCanvasAiLicenseManaged
        ? effectiveCanvasAiEndpoint
        : provider === canvasAiProvider ? canvasAiEndpoint : getStoredCanvasAiEndpoint(provider)
    );
    const startedAt = Date.now();
    try {
      const refs = await invoke<string[]>('upload_xais_reference_images', {
        endpoint,
        apiKey,
        gatewayKind: isCanvasAiLicenseManaged
          ? effectiveCanvasAiGatewayKind
          : canvasAiGatewayKindForProvider(provider),
        provider: isCanvasAiLicenseManaged
          ? effectiveCanvasAiApiProvider
          : (provider === canvasAiProvider
            ? canvasAiApiProvider
            : getStoredCanvasAiApiProvider(provider)),
        model: effectiveCanvasAiModel,
        headers: isCanvasAiLicenseManaged
          ? undefined
          : parseCanvasAiHeaders(provider === canvasAiProvider
            ? canvasAiHeadersText
            : getStoredCanvasAiHeadersText(provider)),
        sources: cleanSources,
      });
      const output = (refs || []).map(ref => ref.trim()).filter(Boolean);
      debugXaisImage2('localAttachmentPreparation', {
        sourceCount: cleanSources.length,
        attachmentCount: output.length,
        durationMs: Date.now() - startedAt,
      });
      return output;
    } catch (error) {
      debugXaisImage2('localAttachmentPreparationFailed', {
        sourceCount: cleanSources.length,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

};

export const getCanvasImageInputsForNodeImpl = async (ctx: Pick<canvasInputsActionContext, 'canvasAiProvider' | 'getCanvasAiErrorSummary' | 'getCanvasImageInputBufferItemsForNode' | 'prepareCanvasAiInputSource' | 'publishLocalAiInputs' | 'stopTemporaryReferenceShares' | 'uploadWalletReferenceInputs' | 'uploadXaisReferenceInputs'>, canvasItem: CanvasImageItem, mode: 'stable' | 'remote-first', delivery: 'auto' | 'direct' | 'remote-only', sourceItems: CanvasImageItem[], referenceFormat: 'any' | 'jpeg', publicationPreference: 'cloudflared-first' | 'hosted-first', portableWalletReferences: boolean, runtimeProvider?: CanvasAiProvider) => {
  const { canvasAiProvider, getCanvasAiErrorSummary, getCanvasImageInputBufferItemsForNode, prepareCanvasAiInputSource, publishLocalAiInputs, stopTemporaryReferenceShares, uploadWalletReferenceInputs, uploadXaisReferenceInputs } = ctx;
    const provider = resolveCanvasAiReferenceProvider(
      runtimeProvider,
      canvasItem.ai?.provider ? normalizeCanvasAiProvider(canvasItem.ai.provider) : undefined,
      canvasAiProvider,
    );
    const inputMode = isOpenAiLikeCanvasAiProvider(provider) ? 'stable' : mode;
    const useDirectLocalInputs = isOpenAiLikeCanvasAiProvider(provider) || delivery === 'direct';
    const requireRemoteInputs = delivery === 'remote-only';
    const uploadXaisAttachmentInputs = !portableWalletReferences
      && provider === 'xais-chat'
      && requireRemoteInputs
      && referenceFormat === 'jpeg';
    const inputImageItems = getCanvasImageInputBufferItemsForNode(canvasItem, sourceItems);
    const resultByInputIndex = new Map<number, string>();
    let usedRemoteFirst = false;
    const localInputsForCloudflared: Array<{
      inputIndex: number;
      source: string;
      remoteFallback?: string;
      label: string;
      type: BufferItem['type'];
    }> = [];
    const temporaryShareIds: TemporaryReferenceShare[] = [];
    const failedItems: string[] = [];
    const failedVideoItems: string[] = [];
    const failedAudioItems: string[] = [];
    const preparationErrors: string[] = [];
    for (const [inputIndex, inputItem] of inputImageItems.entries()) {
      const label = inputItem.name || inputItem.content || (inputItem.type === 'video' ? '参考视频' : '参考图');
      try {
        const prepared = await prepareCanvasAiInputSource(inputItem, inputMode, delivery, referenceFormat);
        if (prepared.usedRemoteFirst) usedRemoteFirst = true;
        if (prepared.warning) {
          console.warn('AI 节点参考图浏览器读取失败，改用本地源:', prepared.warning);
        }
        if (!portableWalletReferences
          && provider === 'xais-chat'
          && isXaisAttachmentImageRef(prepared.source)) {
          resultByInputIndex.set(inputIndex, prepared.source);
          continue;
        }
        if (isRemoteHttpImageSource(prepared.source)
          && !uploadXaisAttachmentInputs
          && !portableWalletReferences) {
          resultByInputIndex.set(inputIndex, prepared.source);
          continue;
        }
        if (requireRemoteInputs
          && referenceFormat !== 'jpeg'
          && prepared.remoteFallback
          && !portableWalletReferences) {
          resultByInputIndex.set(inputIndex, prepared.remoteFallback);
          continue;
        }
        localInputsForCloudflared.push({
          inputIndex,
          source: prepared.source,
          remoteFallback: prepared.remoteFallback,
          label,
          type: inputItem.type,
        });
      } catch (err) {
        console.warn('AI 节点参考图读取失败:', err);
        preparationErrors.push(getCanvasAiErrorSummary(err instanceof Error ? err.message : String(err)));
        failedItems.push(label);
        if (inputItem.type === 'video') failedVideoItems.push(label);
        if (inputItem.type === 'file' && isCanvasAudioFileName(inputItem.name || inputItem.path)) failedAudioItems.push(label);
      }
    }

    if (localInputsForCloudflared.length > 0) {
      const assignPreparedSourcesFor = (
        items: typeof localInputsForCloudflared,
        sources: string[],
      ) => {
        items.forEach((item, index) => {
          const source = sources[index]?.trim();
          if (source) resultByInputIndex.set(item.inputIndex, source);
        });
      };

      // Wallet reference tickets are image-only. Keep video/audio references on
      // their existing temporary-publication path when a request mixes media.
      if (portableWalletReferences) {
        const legacyMediaItems = localInputsForCloudflared.filter(item => (
          item.type === 'video'
          || (item.type === 'file' && isCanvasAudioFileName(item.label))
        ));
        if (legacyMediaItems.length > 0) {
          try {
            const published = await publishLocalAiInputs(legacyMediaItems.map(item => item.source));
            if (published.urls.length !== legacyMediaItems.length) {
              await stopTemporaryReferenceShares(published.shareIds);
              throw new Error(`Reference publication returned ${published.urls.length} URLs for ${legacyMediaItems.length} inputs.`);
            }
            assignPreparedSourcesFor(legacyMediaItems, published.urls);
            temporaryShareIds.push(...published.shareIds);
          } catch (error) {
            preparationErrors.push(getCanvasAiErrorSummary(error instanceof Error ? error.message : String(error)));
            legacyMediaItems.forEach(item => {
              if (item.remoteFallback) {
                resultByInputIndex.set(item.inputIndex, item.remoteFallback);
              } else {
                failedItems.push(item.label);
                if (item.type === 'video') failedVideoItems.push(item.label);
                if (item.type === 'file' && isCanvasAudioFileName(item.label)) failedAudioItems.push(item.label);
              }
            });
          }
          const legacyIndexes = new Set(legacyMediaItems.map(item => item.inputIndex));
          for (let index = localInputsForCloudflared.length - 1; index >= 0; index -= 1) {
            if (legacyIndexes.has(localInputsForCloudflared[index]!.inputIndex)) {
              localInputsForCloudflared.splice(index, 1);
            }
          }
        }
      }

      const localSources = localInputsForCloudflared.map(item => item.source);
      const assignPreparedSources = (sources: string[]) => {
        assignPreparedSourcesFor(localInputsForCloudflared, sources);
      };
      if (provider === 'openai-compatible') {
        assignPreparedSources(localSources);
      } else if (uploadXaisAttachmentInputs) {
        try {
          const refs = await uploadXaisReferenceInputs(localSources, provider);
          if (refs.length !== localSources.length) {
            throw new Error(`XAIS returned ${refs.length} references for ${localSources.length} inputs.`);
          }
          assignPreparedSources(refs);
        } catch (err) {
          preparationErrors.push(getCanvasAiErrorSummary(err instanceof Error ? err.message : String(err)));
          failedItems.push(...localInputsForCloudflared.map(item => item.label));
          failedVideoItems.push(...localInputsForCloudflared.filter(item => item.type === 'video').map(item => item.label));
          failedAudioItems.push(...localInputsForCloudflared.filter(item => item.type === 'file' && isCanvasAudioFileName(item.label)).map(item => item.label));
        }
      } else if (requireRemoteInputs) {
        try {
          if (portableWalletReferences) {
            try {
              const objectKeys = await uploadWalletReferenceInputs(localSources);
              assignPreparedSources(objectKeys);
            } catch (directUploadError) {
              console.warn('钱包参考图直传失败，回退到兼容上传接口:', directUploadError);
              const fallbackPublished = await publishCanvasReferencesInOrder(
                localSources,
                sources => publishLocalAiInputs(
                  sources,
                  'oss-only',
                  getCanvasAiReferencePublicationMaxUrlLength(portableWalletReferences, provider),
                ),
                stopTemporaryReferenceShares,
              );
              if (fallbackPublished.urls.length !== localSources.length) {
                await stopTemporaryReferenceShares(fallbackPublished.shareIds);
                throw new Error(`Legacy reference upload returned ${fallbackPublished.urls.length} URLs for ${localSources.length} inputs.`);
              }
              assignPreparedSources(fallbackPublished.urls);
              temporaryShareIds.push(...fallbackPublished.shareIds);
            }
          } else {
          const publicationMaxUrlLength = getCanvasAiReferencePublicationMaxUrlLength(
            portableWalletReferences,
            provider,
          );
          const published = await publishLocalAiInputs(
            localSources,
            publicationPreference,
            publicationMaxUrlLength,
          );
          if (published.urls.length !== localSources.length) {
            await stopTemporaryReferenceShares(published.shareIds);
            throw new Error(`公网图床返回 ${published.urls.length} 张参考图，预期 ${localSources.length} 张。`);
          }
          assignPreparedSources(published.urls);
          temporaryShareIds.push(...published.shareIds);
          }
        } catch (err) {
          preparationErrors.push(getCanvasAiErrorSummary(err instanceof Error ? err.message : String(err)));
          const remoteFallbacks = portableWalletReferences
            ? []
            : localInputsForCloudflared.filter(item => !!item.remoteFallback);
          const failedLocalVideos = localInputsForCloudflared
            .filter(item => item.type === 'video' && !item.remoteFallback)
            .map(item => item.label);
          const failedLocalAudios = localInputsForCloudflared
            .filter(item => item.type === 'file' && isCanvasAudioFileName(item.label) && !item.remoteFallback)
            .map(item => item.label);
          if (remoteFallbacks.length > 0) {
            console.warn('公网参考图发布失败，img2 改用原始公网 URL 兜底:', err);
            remoteFallbacks.forEach(item => {
              if (item.remoteFallback) resultByInputIndex.set(item.inputIndex, item.remoteFallback);
            });
            failedVideoItems.push(...failedLocalVideos);
            failedAudioItems.push(...failedLocalAudios);
          } else {
            console.warn('公网参考图发布失败，img2 不使用 base64 兜底，避免请求体过大:', err);
            failedItems.push(...localInputsForCloudflared.map(item => item.label));
            failedVideoItems.push(...localInputsForCloudflared.filter(item => item.type === 'video').map(item => item.label));
            failedAudioItems.push(...localInputsForCloudflared.filter(item => item.type === 'file' && isCanvasAudioFileName(item.label)).map(item => item.label));
          }
        }
      } else if (useDirectLocalInputs) {
        localInputsForCloudflared.forEach(item => {
          if (isDataMediaSourceValue(item.source)) {
            resultByInputIndex.set(item.inputIndex, item.source);
          } else if (item.remoteFallback) {
            console.warn('本地参考图未能转成 data URL，改用原始公网 URL 兜底');
            resultByInputIndex.set(item.inputIndex, item.remoteFallback);
          } else {
            failedItems.push(item.label);
            if (item.type === 'video') failedVideoItems.push(item.label);
            if (item.type === 'file' && isCanvasAudioFileName(item.label)) failedAudioItems.push(item.label);
          }
        });
      } else {
        try {
          const published = await publishLocalAiInputs(localSources);
          if (published.urls.length !== localSources.length) {
            await stopTemporaryReferenceShares(published.shareIds);
            throw new Error(`公网图床返回 ${published.urls.length} 张参考图，预期 ${localSources.length} 张。`);
          }
          assignPreparedSources(published.urls);
          temporaryShareIds.push(...published.shareIds);
        } catch (err) {
          preparationErrors.push(getCanvasAiErrorSummary(err instanceof Error ? err.message : String(err)));
          const fallbackItems = localInputsForCloudflared.filter(item => (
            isDataMediaSourceValue(item.source) || !!item.remoteFallback
          ));

          if (fallbackItems.length > 0) {
            console.warn('cloudflared 参考图发布失败，改用可用兜底源:', err);
            fallbackItems.forEach(item => {
              resultByInputIndex.set(
                item.inputIndex,
                isDataMediaSourceValue(item.source) ? item.source : item.remoteFallback!,
              );
            });
          } else {
            console.warn('cloudflared 参考图发布失败，且没有可用兜底源:', err);
            failedItems.push(...localInputsForCloudflared.map(item => item.label));
          failedVideoItems.push(...localInputsForCloudflared.filter(item => item.type === 'video').map(item => item.label));
          failedAudioItems.push(...localInputsForCloudflared.filter(item => item.type === 'file' && isCanvasAudioFileName(item.label)).map(item => item.label));
          }
        }
      }
    }

    if (canvasItem.ai?.type === 'video-generator' && (failedVideoItems.length > 0 || failedAudioItems.length > 0)) {
      const failedReferences = [...failedVideoItems, ...failedAudioItems];
      throw new Error(`参考素材准备失败：${Array.from(new Set(failedReferences)).slice(0, 2).join('、')}`);
    }

    if (inputImageItems.length > 0 && resultByInputIndex.size < inputImageItems.length) {
      const hint = delivery === 'remote-only'
        ? 'img2 模型需要公网参考图 URL，请确认 cloudflared 可用或使用公网图片'
        : delivery === 'direct'
          ? '请确认参考图可被读取为 jpg/png'
          : '请确认 cloudflared 可用';
      const detail = Array.from(new Set(preparationErrors.filter(Boolean))).slice(0, 2).join('；');
      const missingCount = inputImageItems.length - resultByInputIndex.size;
      throw new Error(`有 ${missingCount} 张参考图准备失败，已停止生成以避免图号错位：${failedItems.slice(0, 3).join('、') || hint}${detail ? `；${detail}` : ''}`);
    }
    const orderedResults = orderCanvasAiReferenceSources(inputImageItems.length, resultByInputIndex);
    const images: string[] = [];
    const videos: string[] = [];
    const audios: string[] = [];
    inputImageItems.forEach((item, index) => {
      const source = orderedResults[index];
      if (!source) return;
      if (item.type === 'video') videos.push(source);
      else if (item.type === 'file' && isCanvasAudioFileName(item.name || item.path)) audios.push(source);
      else images.push(source);
    });
    return { images, videos, audios, temporaryShareIds, usedRemoteFirst };

};

export const updateCanvasNodesForPresetImpl = (ctx: Pick<canvasInputsActionContext, 'updateCanvasItemsImmediate'>, preset: CanvasAiPromptPreset) => {
  const { updateCanvasItemsImmediate } = ctx;
    updateCanvasItemsImmediate(prev => prev.map(item => (
      item.ai?.type === 'image-generator' && item.ai.presetId === preset.id
        ? {
          ...item,
          item: {
            ...item.item,
            name: `AI ${preset.label}`,
          },
          ai: {
            ...item.ai,
            presetLabel: preset.label,
            presetPrompt: preset.prompt,
            aspectRatio: preset.aspectRatio || item.ai.aspectRatio,
            outputFormat: preset.outputFormat || item.ai.outputFormat,
            count: preset.count || item.ai.count,
            status: 'idle' as const,
            error: undefined,
          },
        }
        : item
    )));

};

export const openCanvasPresetManagerImpl = (ctx: Pick<canvasInputsActionContext, 'applyCanvasPresetDraft' | 'canvasAiPromptPresets' | 'openCanvasPresetEditor' | 'setCanvasPresetEditingId' | 'setCanvasPresetEditorMode' | 'setIsCanvasPresetEditorOpen' | 'setIsCanvasWorkflowManagerOpen' | 'setSelectedCanvasPresetDeleteIds'>, presetId?: string) => {
  const { applyCanvasPresetDraft, canvasAiPromptPresets, openCanvasPresetEditor, setCanvasPresetEditingId, setCanvasPresetEditorMode, setIsCanvasPresetEditorOpen, setIsCanvasWorkflowManagerOpen, setSelectedCanvasPresetDeleteIds } = ctx;
    setIsCanvasWorkflowManagerOpen(false);
    const preset = canvasAiPromptPresets.find(item => item.id === presetId)
      || canvasAiPromptPresets[0]
      || null;
    if (!preset) {
      openCanvasPresetEditor();
      return;
    }
    setCanvasPresetEditorMode('manage');
    setCanvasPresetEditingId(preset.id);
    applyCanvasPresetDraft(preset);
    setSelectedCanvasPresetDeleteIds([]);
    setIsCanvasPresetEditorOpen(true);

};

export const saveCanvasAiCustomPromptPresetImpl = (ctx: Pick<canvasInputsActionContext, 'canvasAiPromptPresets' | 'canvasPresetEditingId' | 'canvasPresetEditorMode' | 'canvasPresetNameDraft' | 'canvasPresetPromptDraft' | 'closeCanvasPresetEditor' | 'setCustomCanvasAiPromptPresets' | 'showToast' | 'updateCanvasNodesForPreset'>) => {
  const { canvasAiPromptPresets, canvasPresetEditingId, canvasPresetEditorMode, canvasPresetNameDraft, canvasPresetPromptDraft, closeCanvasPresetEditor, setCustomCanvasAiPromptPresets, showToast, updateCanvasNodesForPreset } = ctx;
    const label = canvasPresetNameDraft.trim().slice(0, 24);
    const prompt = canvasPresetPromptDraft.trim();
    if (!label || !prompt) {
      showToast('请填写预设名称和 Prompt');
      return;
    }
    const editingPreset = canvasPresetEditorMode === 'manage'
      ? canvasAiPromptPresets.find(item => item.id === canvasPresetEditingId)
      : null;
    const preset: CanvasAiPromptPreset = {
      id: editingPreset?.id || `custom-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      label,
      hint: editingPreset?.hint || '自定义 Prompt 预设',
      prompt,
      aspectRatio: editingPreset?.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO,
      outputFormat: editingPreset?.outputFormat || CANVAS_AI_DEFAULT_OUTPUT_FORMAT,
      count: editingPreset?.count,
    };
    setCustomCanvasAiPromptPresets(prev => (
      prev.some(item => item.id === preset.id)
        ? prev.map(item => item.id === preset.id ? preset : item)
        : [...prev, preset]
    ));
    updateCanvasNodesForPreset(preset);
    closeCanvasPresetEditor();
    showToast(canvasPresetEditorMode === 'manage' ? `已更新预设「${label}」` : `已新增预设「${label}」`);

};

export const deleteCanvasAiPromptPresetIdsImpl = (ctx: Pick<canvasInputsActionContext, 'applyCanvasPresetDraft' | 'canvasAiPromptPresets' | 'setCanvasPresetEditingId' | 'setCanvasPresetEditorMode' | 'setCanvasPresetNameDraft' | 'setCanvasPresetPromptDraft' | 'setCustomCanvasAiPromptPresets' | 'setHiddenBuiltInCanvasAiPromptPresetIds' | 'setSelectedCanvasPresetDeleteIds' | 'showToast'>, presetIds: string[]) => {
  const { applyCanvasPresetDraft, canvasAiPromptPresets, setCanvasPresetEditingId, setCanvasPresetEditorMode, setCanvasPresetNameDraft, setCanvasPresetPromptDraft, setCustomCanvasAiPromptPresets, setHiddenBuiltInCanvasAiPromptPresetIds, setSelectedCanvasPresetDeleteIds, showToast } = ctx;
    const existingIds = new Set(canvasAiPromptPresets.map(item => item.id));
    const targetIds = Array.from(new Set(presetIds)).filter(id => existingIds.has(id));
    if (targetIds.length === 0) {
      showToast('请先选择要删除的预设');
      return;
    }
    const targetIdSet = new Set(targetIds);
    const builtInIds = CANVAS_AI_PROMPT_PRESETS
      .filter(item => targetIdSet.has(item.id))
      .map(item => item.id);
    const builtInIdSet = new Set(builtInIds);
    setCustomCanvasAiPromptPresets(prev => prev.filter(item => !targetIdSet.has(item.id)));
    if (builtInIds.length > 0) {
      setHiddenBuiltInCanvasAiPromptPresetIds(prev => Array.from(new Set([...prev, ...builtInIds])));
    }
    setSelectedCanvasPresetDeleteIds(prev => prev.filter(id => !targetIdSet.has(id)));
    const nextPreset = canvasAiPromptPresets.find(item => !targetIdSet.has(item.id)) || null;
    if (nextPreset) {
      setCanvasPresetEditorMode('manage');
      setCanvasPresetEditingId(nextPreset.id);
      applyCanvasPresetDraft(nextPreset);
    } else {
      setCanvasPresetEditorMode('create');
      setCanvasPresetEditingId('');
      setCanvasPresetNameDraft('');
      setCanvasPresetPromptDraft('');
    }
    showToast(
      builtInIdSet.size > 0
        ? `已删除 ${targetIds.length} 个节点预设，内置项已从列表隐藏`
        : `已删除 ${targetIds.length} 个节点预设`
    );

};

export const getCanvasTemplateImportPayloadImpl = (ctx: Record<never, never>, rawValue: unknown) => {
  const {  } = ctx;
    const candidates = getCanvasTemplateImportCandidates(rawValue);
    return {
      presets: candidates.presets
        .map(normalizeCanvasAiPromptPreset)
        .filter((item): item is CanvasAiPromptPreset => !!item),
      workflows: candidates.workflows
        .map(normalizeCanvasWorkflowTemplate)
        .filter((item): item is CanvasWorkflowTemplate => !!item)
        .map(workflow => ({ ...workflow, builtin: false })),
      workflowInstances: candidates.workflowInstances.flatMap(instance => {
        const workflow = normalizeCanvasWorkflowTemplate(instance.workflow);
        return workflow ? [{
          workflow: { ...workflow, builtin: false },
          runtime: normalizeCanvasWorkflowRuntime(instance.runtime),
        }] : [];
      }),
    };

};

export const importCanvasTemplateFileImpl = async (ctx: Pick<canvasInputsActionContext, 'appendCanvasItems' | 'applyCanvasPresetDraft' | 'buildCanvasWorkflowModuleNode' | 'canvasWorkflowTemplates' | 'chooseCanvasTemplateImportFiles' | 'enterCanvasMode' | 'getCanvasDropPosition' | 'getCanvasTemplateImportPayload' | 'isCanvasModeRef' | 'materializeImportedCanvasWorkflows' | 'setCanvasPresetEditingId' | 'setCanvasPresetEditorMode' | 'setCanvasWorkflowEditingId' | 'setCanvasWorkflowHintDraft' | 'setCanvasWorkflowNameDraft' | 'setCustomCanvasAiPromptPresets' | 'setCustomCanvasWorkflows' | 'setIsCanvasPresetEditorOpen' | 'setIsCanvasWorkflowManagerOpen' | 'showToast' | 'updateCanvasNodesForPreset'>, scope: 'preset' | 'workflow' | 'all') => {
  const { appendCanvasItems, applyCanvasPresetDraft, buildCanvasWorkflowModuleNode, canvasWorkflowTemplates, chooseCanvasTemplateImportFiles, enterCanvasMode, getCanvasDropPosition, getCanvasTemplateImportPayload, isCanvasModeRef, materializeImportedCanvasWorkflows, setCanvasPresetEditingId, setCanvasPresetEditorMode, setCanvasWorkflowEditingId, setCanvasWorkflowHintDraft, setCanvasWorkflowNameDraft, setCustomCanvasAiPromptPresets, setCustomCanvasWorkflows, setIsCanvasPresetEditorOpen, setIsCanvasWorkflowManagerOpen, showToast, updateCanvasNodesForPreset } = ctx;
    try {
      const filePaths = await chooseCanvasTemplateImportFiles();
      if (filePaths.length === 0) return;
      const payload = {
        presets: [] as CanvasAiPromptPreset[],
        workflows: [] as CanvasWorkflowTemplate[],
        workflowInstances: [] as Array<{ workflow: CanvasWorkflowTemplate; runtime: CanvasWorkflowRuntime }>,
      };
      for (const filePath of filePaths) {
        const parsed = await invoke<unknown>('read_canvas_template_json', { path: filePath });
        const filePayload = getCanvasTemplateImportPayload(parsed);
        payload.presets.push(...filePayload.presets);
        payload.workflows.push(...filePayload.workflows);
        payload.workflowInstances.push(...filePayload.workflowInstances);
      }
      const shouldImportPresets = scope === 'preset' || scope === 'all';
      const shouldImportWorkflows = scope === 'workflow' || scope === 'all';
      let importedPresetCount = 0;
      let importedWorkflowCount = 0;
      let importedInstanceCount = 0;

      if (shouldImportPresets && payload.presets.length > 0) {
        importedPresetCount = payload.presets.length;
        setCustomCanvasAiPromptPresets(prev => {
          const map = new Map(prev.map(item => [item.id, item]));
          payload.presets.forEach(preset => {
            map.set(preset.id, preset);
          });
          return Array.from(map.values()).slice(0, 48);
        });
        payload.presets.forEach(updateCanvasNodesForPreset);
        const firstPreset = payload.presets[0];
        if (scope === 'preset' && firstPreset) {
          setCanvasPresetEditorMode('manage');
          setCanvasPresetEditingId(firstPreset.id);
          applyCanvasPresetDraft(firstPreset);
        }
      }

      if (shouldImportWorkflows && payload.workflows.length > 0) {
        const usedWorkflowIds = new Set(canvasWorkflowTemplates.map(workflow => workflow.id));
        const importedWorkflowDrafts = payload.workflows.map((workflow, index) => {
          let nextId = '';
          do {
            nextId = `imported-workflow-${Date.now().toString(36)}-${index}-${Math.random().toString(36).substring(2, 6)}`;
          } while (usedWorkflowIds.has(nextId));
          usedWorkflowIds.add(nextId);
          return {
            ...workflow,
            id: nextId,
            builtin: false,
            createdAt: Date.now() + index,
          };
        });
        const importedWorkflows = await materializeImportedCanvasWorkflows(importedWorkflowDrafts);
        importedWorkflowCount = importedWorkflows.length;
        setCustomCanvasWorkflows(prev => {
          return [...importedWorkflows, ...prev].slice(0, 48);
        });
        const firstWorkflow = importedWorkflows[0];
        if (scope === 'workflow' && firstWorkflow) {
          setCanvasWorkflowEditingId(firstWorkflow.id);
          setCanvasWorkflowNameDraft(firstWorkflow.label);
          setCanvasWorkflowHintDraft(firstWorkflow.hint || '');
          setIsCanvasPresetEditorOpen(false);
          setIsCanvasWorkflowManagerOpen(true);
        }
      }

      if (shouldImportWorkflows && payload.workflowInstances.length > 0) {
        const usedWorkflowIds = new Set(canvasWorkflowTemplates.map(workflow => workflow.id));
        const restoredInstances: Array<{ workflow: CanvasWorkflowTemplate; runtime: CanvasWorkflowRuntime }> = [];
        for (let index = 0; index < payload.workflowInstances.length; index += 1) {
          const candidate = payload.workflowInstances[index];
          const restored = await materializeCanvasWorkflowInstance({
            portable: {
              type: 'inspiration-drawer-workflow-instance',
              version: 1,
              workflow: candidate.workflow,
              runtime: candidate.runtime,
            },
            saveImageDataUrl: (fileName, dataUrl) => invoke<string>('save_dropped_file', { fileName, dataUrl }),
            getDisplayUrl: path => convertFileSrc(path),
          });
          let nextId = '';
          do {
            nextId = `imported-workflow-instance-${Date.now().toString(36)}-${index}-${Math.random().toString(36).substring(2, 6)}`;
          } while (usedWorkflowIds.has(nextId));
          usedWorkflowIds.add(nextId);
          restoredInstances.push({
            workflow: {
              ...restored.workflow,
              id: nextId,
              builtin: false,
              createdAt: Date.now() + index,
            },
            runtime: restored.runtime,
          });
        }
        importedInstanceCount = restoredInstances.length;
        if (restoredInstances.length > 0) {
          setCustomCanvasWorkflows(prev => [
            ...restoredInstances.map(instance => instance.workflow),
            ...prev,
          ].slice(0, 48));
          if (!isCanvasModeRef.current) enterCanvasMode();
          const base = getCanvasDropPosition(0);
          const modules = restoredInstances.flatMap((instance, index) => {
            const module = buildCanvasWorkflowModuleNode(instance.workflow, {
              x: base.x + index * 52,
              y: base.y + index * 52,
            });
            if (!module?.ai) return [];
            return [{
              ...module,
              ai: {
                ...module.ai,
                workflowRuntime: instance.runtime,
              },
            }];
          });
          appendCanvasItems(modules, '导入工作流实例');
        }
      }

      if (importedPresetCount === 0 && importedWorkflowCount === 0 && importedInstanceCount === 0) {
        showToast('没有找到可导入的预设或工作流');
        return;
      }
      showToast(`已导入 ${importedPresetCount} 个预设、${importedWorkflowCount} 个工作流、${importedInstanceCount} 个工作流实例`);
    } catch (err) {
      console.warn('导入画布模板失败:', err);
      const message = err instanceof Error ? err.message : '';
      showToast(message ? `导入失败：${message}` : '导入失败，请检查 JSON 文件');
    }

};

export const exportCanvasTemplateFileImpl = async (ctx: Pick<canvasInputsActionContext, 'imageSourceToDataUrl' | 'showToast'>, payload: { presets?: CanvasAiPromptPreset[]; workflows?: CanvasWorkflowTemplate[] }, defaultName: string) => {
  const { imageSourceToDataUrl, showToast } = ctx;
    const presets = (payload.presets || []).map(preset => ({ ...preset }));
    const workflowDrafts = (payload.workflows || []).map(workflow => ({ ...workflow, builtin: false }));
    if (presets.length === 0 && workflowDrafts.length === 0) {
      showToast('没有可导出的内容');
      return;
    }
    try {
      const filePath = await save({
        defaultPath: defaultName,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!filePath) return;
      const workflows = await embedCanvasWorkflowFixedImages(
        workflowDrafts,
        source => imageSourceToDataUrl(source, false),
      );
      await invoke('save_item_source_as', {
        source: '',
        dest: filePath,
        content: JSON.stringify({
        type: CANVAS_TEMPLATE_EXPORT_TYPE,
        version: CANVAS_TEMPLATE_EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        presets,
        workflows,
        }, null, 2),
        itemType: 'text',
      });
      showToast('已导出 JSON 文件');
    } catch (err) {
      console.warn('导出画布模板失败:', err);
      const message = err instanceof Error ? err.message : '';
      showToast(message ? `导出失败：${message}` : '导出失败');
    }

};

export const deleteSelectedCanvasPromptPresetsImpl = (ctx: Pick<canvasInputsActionContext, 'canvasAiPromptPresets' | 'closeConfirmDialog' | 'deleteCanvasAiPromptPresetIds' | 'selectedCanvasPresetDeleteIds' | 'setConfirmDialog' | 'showToast'>) => {
  const { canvasAiPromptPresets, closeConfirmDialog, deleteCanvasAiPromptPresetIds, selectedCanvasPresetDeleteIds, setConfirmDialog, showToast } = ctx;
    const selectedIds = selectedCanvasPresetDeleteIds.filter(id => canvasAiPromptPresets.some(preset => preset.id === id));
    if (selectedIds.length === 0) {
      showToast('请先勾选要删除的节点预设');
      return;
    }
    const count = selectedIds.length;
    const builtInCount = selectedIds.filter(id => CANVAS_AI_PROMPT_PRESETS.some(preset => preset.id === id)).length;
    setConfirmDialog({
      isOpen: true,
      title: count === 1 ? '删除节点预设？' : `删除 ${count} 个节点预设？`,
      message: `将删除已勾选的 ${count} 个节点预设${builtInCount > 0 ? `，其中 ${builtInCount} 个内置预设会从列表隐藏` : ''}。画布上已有节点会保留当前内容。`,
      onConfirm: () => {},
      actions: [
        {
          label: `删除 ${count} 个`,
          onClick: () => {
            deleteCanvasAiPromptPresetIds(selectedIds);
            closeConfirmDialog();
          },
          className: 'rounded-[16px] bg-red-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-600',
        },
      ],
    });

};

export const buildCanvasAiGeneratorNodeImpl = (ctx: Pick<canvasInputsActionContext, 'canvasAiProvider' | 'canvasAiUnifiedImageModelOptions' | 'createAssetId' | 'getCanvasAiResolvedModel' | 'makeCanvasNodeId'> & {
  canvasAiCloudImageModels: CloudImageModelsResult | null;
  canvasAiCredentialSource: 'wallet' | 'local';
  canvasAiUnifiedVideoModelOptions: RoundedSelectOption[];
}, pos: { x: number; y: number }, preset?: CanvasAiPromptPreset, inputIds: string[] = [], mediaType: 'image' | 'video' = 'image'): CanvasImageItem => {
  const { canvasAiCloudImageModels, canvasAiCredentialSource, canvasAiProvider, canvasAiUnifiedImageModelOptions, canvasAiUnifiedVideoModelOptions, createAssetId, getCanvasAiResolvedModel, makeCanvasNodeId } = ctx;
    const itemId = createAssetId();
    const presetPrompt = getCanvasAiPresetPrompt(preset);
    const isVideo = mediaType === 'video';
    const defaultImageChoice = !isVideo && canvasAiUnifiedImageModelOptions.length > 0
      ? parseCanvasAiModelChoiceValue(canvasAiUnifiedImageModelOptions[0].value)
      : null;
    const defaultVideoModel = isVideo ? canvasAiUnifiedVideoModelOptions[0]?.value : '';
    const defaultVideoCandidates = isVideo
      ? getCanvasAiVideoModelCandidates(
        defaultVideoModel,
        canvasAiCredentialSource,
        canvasAiProvider,
        canvasAiCloudImageModels?.videoChannels,
        canvasAiCloudImageModels?.catalog,
      )
      : [];
    const provider = isVideo
      ? defaultVideoCandidates[0]?.provider
        || (canvasAiProvider === 'mikoto'
          ? 'mikoto'
          : getCanvasAiVideoProviderForModel(defaultVideoModel || NEW_API_VIDEO_MODEL_DEFAULT))
      : defaultImageChoice?.provider || canvasAiProvider;
    const model = isVideo
      ? defaultVideoModel || getCanvasAiResolvedModel(provider, '', mediaType)
      : defaultImageChoice?.model || getCanvasAiResolvedModel(provider, '', mediaType);
    const name = preset ? `AI ${preset.label}` : (isVideo ? 'AI 视频节点' : 'AI 生图节点');
    const aspectRatio = preset?.aspectRatio || (isVideo ? '9:16' : CANVAS_AI_DEFAULT_ASPECT_RATIO);
    const count = preset?.count || CANVAS_AI_DEFAULT_COUNT;
    const imagePolicy = isVideo ? undefined : createCanvasImagePolicy({
      hasReferenceImage: inputIds.length > 0,
      presetId: preset?.id,
      presetLabel: preset?.label,
      prompt: presetPrompt,
    });
    const nodeSize = getCanvasAiNodeAutoSize({
      type: isVideo ? 'video-generator' : 'image-generator',
      aspectRatio,
      count,
      hasPreset: !!preset,
    });
    const item: BufferItem = {
      id: itemId,
      type: 'text',
      content: '',
      name,
      createdAt: Date.now(),
      isQuickAccess: false,
    };
    return {
      id: makeCanvasNodeId(itemId, 'ai'),
      item,
      x: pos.x,
      y: pos.y,
      width: nodeSize.width,
      height: nodeSize.height,
      inputs: Array.from(new Set(inputIds)),
      ai: {
        type: isVideo ? 'video-generator' : 'image-generator',
        provider,
        model,
        providerChannelId: isVideo ? defaultVideoCandidates[0]?.providerChannelId : defaultImageChoice?.providerChannelId,
        credentialSource: isVideo ? canvasAiCredentialSource : defaultImageChoice?.source,
        providerCandidates: isVideo
          ? defaultVideoCandidates.length > 0 ? defaultVideoCandidates : undefined
          : defaultImageChoice?.providerCandidates,
        prompt: '',
        presetId: preset?.id,
        presetLabel: preset?.label,
        presetPrompt: presetPrompt || undefined,
        aspectRatio,
        resolution: isVideo
          ? CANVAS_AI_DEFAULT_VIDEO_RESOLUTION
          : supportsCanvasAiImageResolution(provider, model) ? CANVAS_AI_DEFAULT_IMAGE_RESOLUTION : undefined,
        outputFormat: preset?.outputFormat || CANVAS_AI_DEFAULT_OUTPUT_FORMAT,
        count,
        duration: isVideo
          ? provider === 'new-api'
            ? normalizeNewApiVideoDurationForModel(model, undefined)
            : CANVAS_AI_DEFAULT_VIDEO_DURATION
          : undefined,
        videoInputMode: isVideo ? 'REF' : undefined,
        videoCfrMode: isVideo ? 'off' : undefined,
        imagePolicy,
        status: 'idle',
      },
    };

};

export const buildCanvasImageFusionNodeImpl = (ctx: Pick<canvasInputsActionContext, 'buildCanvasAiGeneratorNode' | 'canvasItemsRef'>, pos: { x: number; y: number }, inputIds: string[] = []): CanvasImageItem => {
  const { buildCanvasAiGeneratorNode, canvasItemsRef } = ctx;
    const validInputIds = Array.from(new Set(inputIds))
      .filter(inputId => {
        const source = canvasItemsRef.current.find(item => item.id === inputId);
        return canUseCanvasItemAsImageEnhancementInput(source);
      })
      .slice(0, 2);
    const canvasItem = buildCanvasAiGeneratorNode(pos, undefined, validInputIds);
    const fusion = assignCanvasImageFusionInputs({ enabled: true }, [], validInputIds);
    const nodeSize = getCanvasAiNodeAutoSize({
      type: 'image-generator',
      aspectRatio: canvasItem.ai?.aspectRatio,
      count: canvasItem.ai?.count,
      imageFusion: true,
    });
    return {
      ...canvasItem,
      width: nodeSize.width,
      height: nodeSize.height,
      inputs: fusion.inputs,
      item: {
        ...canvasItem.item,
        name: 'AI 溶图节点',
      },
      ai: canvasItem.ai ? {
        ...canvasItem.ai,
        imageFusion: fusion.config,
        sourceImageNodeId: fusion.config.baseNodeId,
        referenceImageNodeIds: fusion.config.styleNodeId ? [fusion.config.styleNodeId] : [],
        referenceRoles: fusion.referenceRoles,
      } : canvasItem.ai,
    };

};

export const addCanvasImageFusionNodeImpl = (ctx: Pick<canvasInputsActionContext, 'appendCanvasItems' | 'buildCanvasImageFusionNode' | 'getCanvasDropPosition' | 'getCanvasItemsBounds' | 'getSelectedCanvasImageFusionInputIds' | 'showToast' | 'updateCanvasSelection'>, client?: { x: number; y: number }) => {
  const { appendCanvasItems, buildCanvasImageFusionNode, getCanvasDropPosition, getCanvasItemsBounds, getSelectedCanvasImageFusionInputIds, showToast, updateCanvasSelection } = ctx;
    const inputIds = getSelectedCanvasImageFusionInputIds();
    const inputBounds = inputIds.length > 0 ? getCanvasItemsBounds(inputIds) : null;
    const pos = inputBounds && !client
      ? { x: inputBounds.x + inputBounds.width + 72, y: inputBounds.y }
      : getCanvasDropPosition(0, client);
    const canvasItem = buildCanvasImageFusionNode(pos, inputIds);
    if (appendCanvasItems([canvasItem], '新增 AI 溶图节点') > 0) {
      updateCanvasSelection([canvasItem.id]);
      showToast(inputIds.length === 2
        ? '已添加 AI 溶图节点，并按选择顺序设置基图与意向图'
        : inputIds.length === 1
          ? '已添加 AI 溶图节点，所选图片已设为基图'
          : '已添加 AI 溶图节点');
    }

};

export const addCanvasImageFusionNodeAtWorldImpl = (ctx: Pick<canvasInputsActionContext, 'appendCanvasItems' | 'buildCanvasImageFusionNode' | 'showToast' | 'updateCanvasSelection'>, world: { x: number; y: number }, sourceIds: string[]) => {
  const { appendCanvasItems, buildCanvasImageFusionNode, showToast, updateCanvasSelection } = ctx;
    const canvasItem = buildCanvasImageFusionNode({
      x: Math.max(24, world.x),
      y: Math.max(24, world.y),
    }, sourceIds);
    if (appendCanvasItems([canvasItem], '新增 AI 溶图节点') > 0) {
      updateCanvasSelection([canvasItem.id]);
      showToast((canvasItem.inputs || []).length >= 2
        ? '已添加 AI 溶图节点，并设置基图与意向图'
        : '已添加 AI 溶图节点');
    }

};

export const addCanvasAiGeneratorNodeImpl = (ctx: Pick<canvasInputsActionContext, 'appendCanvasItems' | 'buildCanvasAiGeneratorNode' | 'getCanvasDropPosition' | 'getCanvasItemsBounds' | 'getSelectedCanvasAiInputIds' | 'showToast'>, client?: { x: number; y: number }, preset?: CanvasAiPromptPreset) => {
  const { appendCanvasItems, buildCanvasAiGeneratorNode, getCanvasDropPosition, getCanvasItemsBounds, getSelectedCanvasAiInputIds, showToast } = ctx;
    const inputIds = preset ? getSelectedCanvasAiInputIds() : [];
    const inputBounds = inputIds.length > 0 ? getCanvasItemsBounds(inputIds) : null;
    const pos = inputBounds && !client
      ? { x: inputBounds.x + inputBounds.width + 72, y: inputBounds.y }
      : getCanvasDropPosition(0, client);
    const canvasItem = buildCanvasAiGeneratorNode(pos, preset, inputIds);
    if (appendCanvasItems([canvasItem], preset ? `新增 ${preset.label} Prompt 节点` : '新增 AI 生图节点') > 0) {
      showToast(preset
        ? `已添加「${preset.label}」Prompt 节点${inputIds.length > 0 ? `，已连接 ${inputIds.length} 个输入` : ''}`
        : '已添加 AI 生图节点');
    }

};

export const addCanvasAiGeneratorNodeAtWorldImpl = (ctx: Pick<canvasInputsActionContext, 'appendCanvasItems' | 'buildCanvasAiGeneratorNode' | 'getSelectedCanvasAiInputIds' | 'showToast'>, world: { x: number; y: number }, preset?: CanvasAiPromptPreset) => {
  const { appendCanvasItems, buildCanvasAiGeneratorNode, getSelectedCanvasAiInputIds, showToast } = ctx;
    const inputIds = preset ? getSelectedCanvasAiInputIds() : [];
    const canvasItem = buildCanvasAiGeneratorNode({
      x: Math.max(24, world.x),
      y: Math.max(24, world.y),
    }, preset, inputIds);
    if (appendCanvasItems([canvasItem], preset ? `新增 ${preset.label} Prompt 节点` : '新增 AI 生图节点') > 0) {
      showToast(preset
        ? `已添加「${preset.label}」Prompt 节点${inputIds.length > 0 ? `，已连接 ${inputIds.length} 个输入` : ''}`
        : '已添加 AI 生图节点');
    }

};

export const addCanvasAiVideoGeneratorNodeImpl = (ctx: Pick<canvasInputsActionContext, 'appendCanvasItems' | 'buildCanvasAiGeneratorNode' | 'getCanvasDropPosition' | 'getCanvasItemsBounds' | 'getSelectedCanvasAiInputIds' | 'showToast'>, client?: { x: number; y: number }) => {
  const { appendCanvasItems, buildCanvasAiGeneratorNode, getCanvasDropPosition, getCanvasItemsBounds, getSelectedCanvasAiInputIds, showToast } = ctx;
    const inputIds = getSelectedCanvasAiInputIds();
    const inputBounds = inputIds.length > 0 ? getCanvasItemsBounds(inputIds) : null;
    const pos = inputBounds && !client
      ? { x: inputBounds.x + inputBounds.width + 72, y: inputBounds.y }
      : getCanvasDropPosition(0, client);
    const canvasItem = buildCanvasAiGeneratorNode(pos, undefined, inputIds, 'video');
    if (appendCanvasItems([canvasItem], '新增 AI 视频节点') > 0) {
      showToast(`已添加 AI 视频节点${inputIds.length > 0 ? `，已连接 ${inputIds.length} 个输入` : ''}`);
    }

};

export const addCanvasAiVideoGeneratorNodeAtWorldImpl = (ctx: Pick<canvasInputsActionContext, 'appendCanvasItems' | 'buildCanvasAiGeneratorNode' | 'getSelectedCanvasAiInputIds' | 'showToast'>, world: { x: number; y: number }) => {
  const { appendCanvasItems, buildCanvasAiGeneratorNode, getSelectedCanvasAiInputIds, showToast } = ctx;
    const inputIds = getSelectedCanvasAiInputIds();
    const canvasItem = buildCanvasAiGeneratorNode({
      x: Math.max(24, world.x),
      y: Math.max(24, world.y),
    }, undefined, inputIds, 'video');
    if (appendCanvasItems([canvasItem], '新增 AI 视频节点') > 0) {
      showToast(`已添加 AI 视频节点${inputIds.length > 0 ? `，已连接 ${inputIds.length} 个输入` : ''}`);
    }

};

export const buildCanvasFrameInterpolationNodeImpl = (ctx: Pick<canvasInputsActionContext, 'createAssetId' | 'makeCanvasNodeId'>, pos: { x: number; y: number }, inputIds: string[] = []): CanvasImageItem => {
  const { createAssetId, makeCanvasNodeId } = ctx;
    const itemId = createAssetId();
    const nodeSize = getCanvasAiNodeAutoSize({
      type: 'video-generator',
      aspectRatio: CANVAS_AI_DEFAULT_ASPECT_RATIO,
      count: 1,
      localMediaTool: true,
    });
    return {
      id: makeCanvasNodeId(itemId, 'rife'),
      item: {
        id: itemId,
        type: 'text',
        content: '',
        name: '视频补帧',
        remark: '使用本地 RIFE 引擎把视频补到 2× 或 4× 帧率。',
        createdAt: Date.now(),
        isQuickAccess: false,
      },
      x: Math.max(24, pos.x),
      y: Math.max(24, pos.y),
      width: nodeSize.width,
      height: nodeSize.height,
      inputs: Array.from(new Set(inputIds)),
      ai: {
        type: 'frame-interpolation',
        model: 'rife-v4.6',
        aspectRatio: CANVAS_AI_DEFAULT_ASPECT_RATIO,
        count: 1,
        videoCfrMode: 'auto',
        interpolationRateMode: 'multiplier',
        interpolationFactor: 2,
        interpolationTargetFps: 60,
        interpolationMode: 'normal',
        interpolationQuality: 'standard',
        interpolationKeepAudio: true,
        outputFormat: 'mp4',
        status: 'idle',
        outputs: [],
      },
    };

};

export const addCanvasFrameInterpolationNodeImpl = (ctx: Pick<canvasInputsActionContext, 'appendCanvasItems' | 'buildCanvasFrameInterpolationNode' | 'getCanvasDropPosition' | 'getCanvasItemsBounds' | 'getSelectedFrameInterpolationInputIds' | 'showToast'>, client?: { x: number; y: number }) => {
  const { appendCanvasItems, buildCanvasFrameInterpolationNode, getCanvasDropPosition, getCanvasItemsBounds, getSelectedFrameInterpolationInputIds, showToast } = ctx;
    const inputIds = getSelectedFrameInterpolationInputIds();
    const inputBounds = inputIds.length > 0 ? getCanvasItemsBounds(inputIds) : null;
    const pos = inputBounds && !client
      ? { x: inputBounds.x + inputBounds.width + 72, y: inputBounds.y }
      : getCanvasDropPosition(0, client);
    const canvasItem = buildCanvasFrameInterpolationNode(pos, inputIds);
    if (appendCanvasItems([canvasItem], '新增视频补帧节点') > 0) {
      showToast(`已添加视频补帧节点${inputIds.length > 0 ? `，已连接 ${inputIds.length} 个视频输入` : ''}`);
    }

};

export const addCanvasFrameInterpolationNodeAtWorldImpl = (ctx: Pick<canvasInputsActionContext, 'appendCanvasItems' | 'buildCanvasFrameInterpolationNode' | 'getSelectedFrameInterpolationInputIds' | 'showToast'>, world: { x: number; y: number }) => {
  const { appendCanvasItems, buildCanvasFrameInterpolationNode, getSelectedFrameInterpolationInputIds, showToast } = ctx;
    const inputIds = getSelectedFrameInterpolationInputIds();
    const canvasItem = buildCanvasFrameInterpolationNode({
      x: Math.max(24, world.x),
      y: Math.max(24, world.y),
    }, inputIds);
    if (appendCanvasItems([canvasItem], '新增视频补帧节点') > 0) {
      showToast(`已添加视频补帧节点${inputIds.length > 0 ? `，已连接 ${inputIds.length} 个视频输入` : ''}`);
    }

};

export const buildCanvasEnhancementNodeImpl = (ctx: Pick<canvasInputsActionContext, 'createAssetId' | 'makeCanvasNodeId'>, pos: { x: number; y: number }, mediaType: 'image' | 'video', inputIds: string[] = []): CanvasImageItem => {
  const { createAssetId, makeCanvasNodeId } = ctx;
    const itemId = createAssetId();
    const isVideo = mediaType === 'video';
    const nodeSize = getCanvasAiNodeAutoSize({
      type: isVideo ? 'video-generator' : 'image-generator',
      aspectRatio: CANVAS_AI_DEFAULT_ASPECT_RATIO,
      count: 1,
      localMediaTool: true,
    });
    return {
      id: makeCanvasNodeId(`${mediaType}_${itemId}`, 'realesrgan'),
      item: {
        id: itemId,
        type: 'text',
        content: '',
        name: isVideo ? '视频清晰度增强' : '图片清晰度增强',
        remark: isVideo
          ? '使用本地 Real-ESRGAN 增强视频清晰度，可输出 2× / 4×。'
          : '使用本地 Real-ESRGAN 增强图片清晰度，可输出 2× / 4×。',
        createdAt: Date.now(),
        isQuickAccess: false,
      },
      x: Math.max(24, pos.x),
      y: Math.max(24, pos.y),
      width: nodeSize.width,
      height: nodeSize.height,
      inputs: Array.from(new Set(inputIds)).slice(0, 1),
      ai: {
        type: isVideo ? 'video-enhancement' : 'image-enhancement',
        model: 'realesrgan-x4plus',
        aspectRatio: CANVAS_AI_DEFAULT_ASPECT_RATIO,
        count: 1,
        enhancementScale: 2,
        enhancementEngine: isVideo ? 'ai' : undefined,
        quickEnhancementScale: isVideo ? 2 : undefined,
        enhancementMode: 'general',
        enhancementResizeMode: 'upscale',
        enhancementKeepAudio: true,
        outputFormat: isVideo ? 'mp4' : 'png',
        status: 'idle',
        outputs: [],
      },
    };

};

export const addCanvasEnhancementNodeImpl = (ctx: Pick<canvasInputsActionContext, 'appendCanvasItems' | 'buildCanvasEnhancementNode' | 'getCanvasDropPosition' | 'getCanvasItemsBounds' | 'getSelectedEnhancementInputIds' | 'showToast'>, mediaType: 'image' | 'video', client?: { x: number; y: number }) => {
  const { appendCanvasItems, buildCanvasEnhancementNode, getCanvasDropPosition, getCanvasItemsBounds, getSelectedEnhancementInputIds, showToast } = ctx;
    const inputIds = getSelectedEnhancementInputIds(mediaType);
    const inputBounds = inputIds.length > 0 ? getCanvasItemsBounds(inputIds) : null;
    const pos = inputBounds && !client
      ? { x: inputBounds.x + inputBounds.width + 72, y: inputBounds.y }
      : getCanvasDropPosition(0, client);
    const canvasItem = buildCanvasEnhancementNode(pos, mediaType, inputIds);
    const label = mediaType === 'video' ? '视频清晰度增强' : '图片清晰度增强';
    if (appendCanvasItems([canvasItem], `新增${label}节点`) > 0) {
      showToast(`已添加${label}节点${inputIds.length > 0 ? '，并连接输入素材' : ''}`);
    }

};

export const addCanvasEnhancementNodeAtWorldImpl = (ctx: Pick<canvasInputsActionContext, 'appendCanvasItems' | 'buildCanvasEnhancementNode' | 'getSelectedEnhancementInputIds' | 'showToast'>, mediaType: 'image' | 'video', world: { x: number; y: number }) => {
  const { appendCanvasItems, buildCanvasEnhancementNode, getSelectedEnhancementInputIds, showToast } = ctx;
    const inputIds = getSelectedEnhancementInputIds(mediaType);
    const canvasItem = buildCanvasEnhancementNode({
      x: Math.max(24, world.x),
      y: Math.max(24, world.y),
    }, mediaType, inputIds);
    const label = mediaType === 'video' ? '视频清晰度增强' : '图片清晰度增强';
    if (appendCanvasItems([canvasItem], `新增${label}节点`) > 0) {
      showToast(`已添加${label}节点${inputIds.length > 0 ? '，并连接输入素材' : ''}`);
    }

};

export const instantiateCanvasWorkflowTemplateItemsImpl = (ctx: Pick<canvasInputsActionContext, 'canvasAiProvider' | 'createAssetId' | 'makeCanvasNodeId'>, workflow: CanvasWorkflowTemplate, base: { x: number; y: number }, externalInputIds: string[] = []) => {
  const { canvasAiProvider, createAssetId, makeCanvasNodeId } = ctx;
    const cleanWorkflow = normalizeCanvasWorkflowTemplate(workflow);
    if (!cleanWorkflow) {
      return { workflow: null, items: [] as CanvasImageItem[], idMap: new Map<string, string>() };
    }
    const templateBounds = {
      x: Math.min(...cleanWorkflow.nodes.map(node => node.x)),
      y: Math.min(...cleanWorkflow.nodes.map(node => node.y)),
    };
    const runnableTemplateNodeIds = new Set(cleanWorkflow.nodes
      .filter(node => node.ai?.type === 'image-generator')
      .map(node => node.id));
    const hasExplicitExternalInputTargets = cleanWorkflow.nodes.some(node => node.acceptsExternalInputs);
    const hasInternalImageSlots = getCanvasWorkflowInternalSlotNodes(cleanWorkflow).length > 0;
    const idMap = new Map<string, string>();
  const isWorkflowExternalInputPort = (node: CanvasWorkflowNodeTemplate) => (
      !node.ai && isExternalReferenceImageBridge(node)
    );

    cleanWorkflow.nodes.forEach(node => {
      const nextBufferId = createAssetId();
      idMap.set(node.id, makeCanvasNodeId(nextBufferId, node.ai?.type === 'image-generator' ? 'ai' : 'workflow'));
    });

    const now = Date.now();
    const nextItems = cleanWorkflow.nodes.map((node, index) => {
      const nextBufferId = createAssetId();
      const nextCanvasId = idMap.get(node.id) || makeCanvasNodeId(nextBufferId, node.ai?.type === 'image-generator' ? 'ai' : 'workflow');
      const isAiGenerator = node.ai?.type === 'image-generator';
      const isExternalInputPort = isWorkflowExternalInputPort(node);
      const isAgentTextNode = node.item.type === 'text' && node.textMode !== 'plain' && !node.ai && !isExternalInputPort;
      const provider = normalizeCanvasAiProvider(node.ai?.provider || canvasAiProvider);
      const internalInputs = (node.inputs || [])
        .map(inputId => idMap.get(inputId))
        .filter((inputId): inputId is string => !!inputId);
      const internalSlotReferenceRoles = (node.inputs || []).flatMap(inputId => {
        const inputNode = cleanWorkflow.nodes.find(candidate => candidate.id === inputId);
        const runtimeInputId = idMap.get(inputId);
        const role = inputNode?.internalSlot?.role;
        return runtimeInputId && role ? [{ nodeId: runtimeInputId, role }] : [];
      });
      const shouldAttachExternalInputs = hasExplicitExternalInputTargets
        ? node.acceptsExternalInputs === true
        : hasInternalImageSlots
          ? node.acceptsExternalInputs === true
          : isAiGenerator && !(node.inputs || []).some(inputId => runnableTemplateNodeIds.has(inputId));
      const item: BufferItem = {
        ...cloneDrawerValue(node.item),
        id: nextBufferId,
        type: node.item.type || 'text',
        content: node.item.content || '',
        name: node.item.name || (isAiGenerator ? `AI ${node.ai?.presetLabel || '生图节点'}` : '工作流卡片'),
        createdAt: now + index,
        isQuickAccess: false,
      };
      return {
        id: nextCanvasId,
        item,
        x: Math.max(24, base.x + node.x - templateBounds.x),
        y: Math.max(24, base.y + node.y - templateBounds.y),
        width: node.width,
        height: node.height,
        inputs: Array.from(new Set([
          ...internalInputs,
          ...(shouldAttachExternalInputs ? externalInputIds : []),
        ])),
        textMode: isAgentTextNode ? 'agent' : node.textMode,
        contextRouting: node.contextRouting,
        workflowTemplateNodeId: node.id,
        designAgentConfig: isAgentTextNode
          ? normalizeDesignAgentConfig(node.designAgentConfig)
          : undefined,
        workflowBridge: isExternalInputPort
          ? {
            type: 'reference-image' as const,
            label: node.item.name || node.item.content || '参考图桥接',
            externalInputTypes: node.externalInputTypes,
            outputType: node.outputType,
          }
          : undefined,
        ai: isAiGenerator
          ? {
            ...cloneDrawerValue(node.ai || {}),
            type: 'image-generator' as const,
            provider,
            model: node.ai?.model || getCanvasAiDefaultModel(provider),
            imagePolicy: createCanvasImagePolicy({
              hasReferenceImage: Array.from(new Set([
                ...internalInputs,
                ...(shouldAttachExternalInputs ? externalInputIds : []),
              ])).length > 0,
              presetId: node.ai?.presetId,
              presetLabel: node.ai?.presetLabel,
              outputRole: node.item.remark || node.id,
              workflowTemplateId: cleanWorkflow.id,
              qualityProfileId: typeof node.ai?.skillMeta?.qualityProfileId === 'string' ? node.ai.skillMeta.qualityProfileId : undefined,
              prompt: [node.ai?.presetPrompt, node.ai?.prompt, node.item.content].filter(Boolean).join('\n'),
            }, node.ai?.imagePolicy || null),
            referenceRoles: Array.from(new Map([
              ...(cloneDrawerValue(node.ai?.referenceRoles || []) as Array<{ nodeId: string; role: string }>),
              ...internalSlotReferenceRoles,
            ].map(reference => [reference.nodeId, reference])).values()),
            status: 'idle' as const,
            error: undefined,
            generatedAt: undefined,
            outputs: [],
          }
          : undefined,
      } as CanvasImageItem;
    });

    return { workflow: cleanWorkflow, items: nextItems, idMap };

};

export const buildCanvasWorkflowModuleNodeImpl = (ctx: Pick<canvasInputsActionContext, 'canvasAiProvider' | 'canvasItemsRef' | 'createAssetId' | 'makeCanvasNodeId'>, workflow: CanvasWorkflowTemplate, pos: { x: number; y: number }, inputIds: string[] = []): CanvasImageItem | null => {
  const { canvasAiProvider, canvasItemsRef, createAssetId, makeCanvasNodeId } = ctx;
    const cleanWorkflow = normalizeCanvasWorkflowTemplate(workflow);
    if (!cleanWorkflow) return null;
    const validation = validateCanvasWorkflowTemplate(cleanWorkflow);
    if (validation.errors.length > 0) {
      console.warn('Invalid canvas workflow template:', validation.errors, cleanWorkflow);
      return null;
    }
    if (validation.warnings.length > 0) {
      console.warn('Canvas workflow validation warnings:', validation.warnings, cleanWorkflow);
    }
    const itemId = createAssetId();
    const acceptedInputIds = Array.from(new Set(inputIds)).filter(inputId => (
      canUseCanvasItemAsWorkflowMaterial(
        canvasItemsRef.current.find(item => item.id === inputId),
        cleanWorkflow.userInput,
      )
    ));
    const outputSlots = getCanvasWorkflowOutputSlotTemplates(cleanWorkflow, 'all');
    const outputSlotCount = Math.max(1, outputSlots.length);
    const firstOutputAspectRatio = outputSlots[0]?.node.ai?.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO;
    const nodeSize = getCanvasAiNodeAutoSize({
      type: 'workflow',
      aspectRatio: firstOutputAspectRatio,
      outputCount: outputSlotCount,
      internalSlotCount: getCanvasWorkflowInternalSlotNodes(cleanWorkflow).length,
    });
    return {
      id: makeCanvasNodeId(itemId, 'workflow'),
      item: {
        id: itemId,
        type: 'text',
        content: '',
        name: `工作流 ${cleanWorkflow.label}`,
        remark: cleanWorkflow.hint,
        createdAt: Date.now(),
        isQuickAccess: false,
      },
      x: Math.max(24, pos.x),
      y: Math.max(24, pos.y),
      width: nodeSize.width,
      height: nodeSize.height,
      inputs: acceptedInputIds,
      ai: {
        type: 'workflow',
        provider: canvasAiProvider,
        model: getCanvasAiDefaultModel(canvasAiProvider),
        presetId: cleanWorkflow.id,
        presetLabel: cleanWorkflow.label,
        presetPrompt: cleanWorkflow.hint,
        count: outputSlotCount,
        status: 'idle',
        outputs: [],
        workflow: cleanWorkflow,
        workflowOutputMode: 'all',
      },
    };

};
