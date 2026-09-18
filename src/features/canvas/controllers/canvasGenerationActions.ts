import { convertFileSrc,invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import React,{ startTransition } from 'react';
import { type RoundedSelectOption } from '../../../components/RoundedSelect';
import { DEFAULT_CANVAS_ID,type CanvasRecord } from '../../../services/canvasApi';
import { BufferItem } from '../../../types';
import type { CanvasContextMenuState,CanvasReferenceDragState,CanvasReferenceReplaceTarget } from '../../../types/canvasRuntime';
import type { CloudAccountSummary,CloudImageModelsResult } from '../../../types/license';
import { CANVAS_AI_DEFAULT_ASPECT_RATIO,parseCanvasAspectRatioValue } from '../../../utils/canvasAiAspectRatio';
import { CANVAS_AI_DEFAULT_COUNT,CANVAS_AI_DEFAULT_OUTPUT_FORMAT,CANVAS_AI_DEFAULT_VIDEO_DURATION,CANVAS_AI_DEFAULT_VIDEO_RESOLUTION,CANVAS_AI_IMAGE_REFERENCE_SHARE_KEEPALIVE_MS,CANVAS_AI_VIDEO_REFERENCE_SHARE_KEEPALIVE_MS,canvasAiGatewayKindForProvider,getCanvasAiEndpointForRequest,getStoredCanvasAiApiKey,getStoredCanvasAiApiProvider,getStoredCanvasAiEndpoint,getStoredCanvasAiHeadersText,isCanvasAiXaisWorkerModel,normalizeCanvasAiProvider,parseCanvasAiHeaders,parseCanvasAiModelChoiceValue } from '../../../utils/canvasAiConfig';
import { AI_GENERATED_FOLDER_NAME,getCanvasGeneratedImageFolderName } from '../../../utils/canvasGeneratedFolders';
import { buildCanvasImageFusionPrompt,getCanvasImageFusionInputIds,isCanvasImageFusionAi,normalizeCanvasImageFusionConfig,removeCanvasImageFusionInput } from '../../../utils/canvasImageFusion';
import { canUseCanvasItemAsAiInput,canUseCanvasItemAsAiTarget,canUseCanvasItemAsFrameInterpolationVideoInput,canUseCanvasItemAsImageEnhancementInput,canUseCanvasItemAsVideoEnhancementInput,createCanvasAiOutputBufferItem,getCanvasAiOutputDisplaySource,getCanvasAiOutputSize,getCanvasAiSuccessfulOutputs,hasCanvasAiGeneratedResults,isCanvasAgentTextTarget } from '../../../utils/canvasItemSelectors';
import { cloneDrawerValue } from '../../../utils/canvasSerialization';
import { canvasAiProviderSupportsNegativePrompt,getCanvasImageRuleState } from '../../../utils/canvasWorkflowDefinitions';
import { getCanvasWorkflowGroup } from '../../../utils/canvasWorkflowRuntime';
import { isCanvasAudioFileName } from '../../../utils/localMediaPaths';
import { buildFinalImagePrompt,truncatePromptToUtf8ByteLimit } from '../../appAgent/imageQuality/imageRulePromptBuilder';
import type { AiGatewayKind } from '../../agentModel';
import { CANVAS_AI_IMAGE_TASK_TIMEOUT_MINUTES,CANVAS_AI_IMAGE_TASK_TIMEOUT_MS,CANVAS_AI_VIDEO_TASK_TIMEOUT_MINUTES,CANVAS_AI_VIDEO_TASK_TIMEOUT_MS,debugXaisImage2,filterCanvasAiVideoModelCandidates,generateCanvasAiProviderImages,generateCanvasAiProviderVideos,getCanvasAiImageOutputConcurrency,getCanvasAiPublicImageModelName,getCanvasAiSlotClientRequestId,getCanvasAiVideoModelCandidates,getDefaultNewApiImageProtocol,hydrateCanvasAiModelCandidateCapabilities,isMiniMaxH3VideoModel,isOpenAiLikeCanvasAiProvider,isSeedanceLikeVideoModel,mergeCanvasAiReferenceSourceItems,resolveCanvasAiImageModelCapabilities,resolveCanvasAiVideoModelCapabilities,shouldRetrySameCanvasAiImageCandidate,shouldUseCanvasAiNativeImageBatchRequest,shouldUsePortableWalletImageReferences } from '../../canvasAiImage';
import { findAiCatalogModel,getAiCatalogModels,getChannelModelCapabilities,hasServerAiCatalog,normalizeVideoAspectRatioSelection,normalizeVideoDurationSelection,normalizeVideoResolutionSelection } from '../../aiModelCapabilities';
import { buildCanvasAiOutputRemoteResultPatch,recoverCanvasAiOutputWithUsableResult } from '../../canvasAiOutputs';
import { claimCanvasAiRun,createCanvasAiClientRequestId,releaseCanvasAiRun } from '../../canvasAiRunGuard';
import { getCanvasAiMediaType,getCanvasAiNodeTitle,isCanvasAiGeneratorType } from '../../canvasAiRuntime';
import { enhancementEstimateCache,getCanvasRifeRateRequest,isCanvasAiEnhancementType,isRifeFixed2xMode,type QuickVideoEnhancementResult,type RealEsrganEnhancementResult,type RifeFrameInterpolationResult,type VideoCfrNormalizationResult } from '../../canvasLocalMediaTools';
import { type CanvasAiCredentialSource,type CanvasAiGeneratedOutput,type CanvasAiModelCandidate,type CanvasAiProvider,type CanvasImageItem,type CanvasItemBox } from '../../canvasModel';
import { reorderCanvasInputs } from '../../canvasReferenceInputs';
import { clamp } from '../../common';
import { findCanvasImageModelChoice,resolveCanvasImageRequestSettings } from '../canvasImageRequestSettings';

type canvasGenerationActionContext = { canvasItemsRef: React.RefObject<CanvasImageItem[]>; createCanvasAudioItemFromPath: (originalPath: string, index?: number, client?: { x: number; y: number; }) => Promise<CanvasImageItem | null>; showToast: (message: string) => void; appendCanvasItems: (nextItems: CanvasImageItem[], label: string, select?: boolean) => number; connectCanvasItemsToGenerator: (sourceIds: string[], targetId: string) => boolean; setCanvasInputMenuForId: React.Dispatch<React.SetStateAction<string | null>>; setCanvasContextMenu: React.Dispatch<React.SetStateAction<CanvasContextMenuState | null>>; setCanvasInputPickTargetId: React.Dispatch<React.SetStateAction<string | null>>; updateCanvasSelection: (ids: string[]) => void; canvasReferenceReplaceTargetRef: React.RefObject<CanvasReferenceReplaceTarget | null>; targetId: string | undefined; canReplaceCanvasImageReferenceForTarget: (target?: CanvasImageItem) => boolean; replaceCanvasGeneratorReference: (replacement: CanvasReferenceReplaceTarget, nextInputId: string, options?: { pushUndo?: boolean; }) => boolean; connectCanvasItems: (sourceId: string, targetId: string) => boolean; setCanvasInteractionActive: (active: boolean, releaseDelay?: number, _options?: { preserveImageSources?: boolean; }) => void; getCanvasItemRenderedBox: (canvasItem: CanvasImageItem) => CanvasItemBox; CANVAS_CONNECTION_HANDLE_OUTSET: 0; canvasSelectedIdsRef: React.RefObject<string[]>; canvasConnectionDragRef: React.RefObject<{ fromId: string; sourceIds: string[]; pointerId: number; fromX: number; fromY: number; } | null>; setCanvasConnectionDraft: React.Dispatch<React.SetStateAction<{ fromId: string; sourceIds: string[]; fromX: number; fromY: number; toX: number; toY: number; } | null>>; autoScrollCanvasNearEdge: (event: { clientX: number; clientY: number; }) => void; getCanvasPointFromClient: (clientX: number, clientY: number) => { x: number; y: number; }; fromId: string; sourceIds: string[]; fromX: number; fromY: number; x: number; y: number; canvasConnectionDraft: { fromId: string; sourceIds: string[]; fromX: number; fromY: number; toX: number; toY: number; } | null; canvasInputActionDragRef: React.RefObject<{ targetId: string; pointerId: number; fromX: number; fromY: number; } | null>; setCanvasInputActionDraft: React.Dispatch<React.SetStateAction<{ targetId: string; fromX: number; fromY: number; toX: number; toY: number; } | null>>; removeCanvasConnection: (targetId: string, sourceId: string, label?: string) => boolean; pushCanvasUndoSnapshot: (label: string, options?: { layoutOnly?: boolean; shareImmutableItems?: boolean; }) => void; updateCanvasItemsImmediate: (updater: (prev: CanvasImageItem[]) => CanvasImageItem[]) => CanvasImageItem[]; canvasReferenceLongPressRef: React.RefObject<{ targetId: string; inputId: string; overInputId: string; pointerId: number; startClientX: number; startClientY: number; clientX: number; clientY: number; previewSource: string; inputIndex: number; rotation: 0 | 90 | 180 | 270; activated: boolean; timer: number | null; previousBodyCursor: string; cleanup: () => void; } | null>; cleanup: (() => void) | undefined; setCanvasReferenceDragState: React.Dispatch<React.SetStateAction<CanvasReferenceDragState | null>>; canvasReferenceSuppressClickRef: React.RefObject<{ targetId: string; } | null>; setCanvasReferenceReplacement: (next: CanvasReferenceReplaceTarget | null) => void; canvasRectsIntersect: (a: CanvasItemBox, b: CanvasItemBox) => boolean; createAssetId: () => `${string}-${string}-${string}-${string}-${string}`; makeCanvasNodeId: (seed: string, kind?: string) => string; getCanvasAiRerunNodePosition: (source: CanvasImageItem) => { x: number; y: number; }; activeCanvasIdRef: React.RefObject<string>; canvasesRef: React.RefObject<CanvasRecord[]>; canvasAiCredentialSource: CanvasAiCredentialSource; canvasAiUnifiedImageModelOptions: RoundedSelectOption[]; canvasAiCloudImageModels: CloudImageModelsResult | null; canvasAiProvider: CanvasAiProvider; isCanvasAiLicenseManaged: boolean; effectiveCanvasAiProvider: CanvasAiProvider; canvasAiApiKey: string; canvasAiNewApiVideoKey: string; getCanvasImageInputBufferItemsForNode: (canvasItem: CanvasImageItem, sourceItems?: CanvasImageItem[]) => BufferItem[]; getCanvasTextInputsForNode: (canvasItem: CanvasImageItem, sourceItems?: CanvasImageItem[]) => string[]; notifyCanvasAiGenerationResult: (options: { status: "success" | "partial" | "error"; label: string; mediaType: "image" | "video"; generatedCount?: number; requestedCount?: number; error?: string; }) => void; createCanvasAiOutputDrafts: (target: CanvasImageItem, prompt: string, clientRequestId?: string) => CanvasAiGeneratedOutput[]; effectiveCanvasAiModel: string; getCanvasAiResolvedModel: (provider: CanvasAiProvider, model?: string | null, mediaType?: "image" | "video") => string; getCanvasImageInputsForNode: (canvasItem: CanvasImageItem, mode?: "stable" | "remote-first", delivery?: "auto" | "direct" | "remote-only", sourceItems?: CanvasImageItem[], referenceFormat?: "any" | "jpeg", publicationPreference?: "cloudflared-first" | "hosted-first", portableWalletReferences?: boolean, runtimeProvider?: CanvasAiProvider) => Promise<{ images: string[]; videos: string[]; audios: string[]; temporaryShareIds: TemporaryReferenceShare[]; usedRemoteFirst: boolean; }>; images: string[]; usedRemoteFirst: boolean; videos: string[]; audios: string[]; temporaryShareIds: TemporaryReferenceShare[]; canvasAiEndpoint: string; canvasAiHeadersText: string; canvasAiApiProvider: string; effectiveCanvasAiGatewayKind: AiGatewayKind; effectiveCanvasAiApiProvider: string; effectiveCanvasAiEndpoint: string; getCanvasAiErrorSummary: (error?: string | null) => string; cacheCanvasGeneratedImageSource: (source: string, name: string, options?: { throwOnFailure?: boolean; }) => Promise<{ url: string; path: string; sourceUrl: string; }>; path: string; url: string; createCanvasImagePreviewThumbnail: (source: string, path?: string, allowWebviewFallback?: boolean) => Promise<string>; sourceUrl: string; pushDrawerUndoSnapshot: (label: string, options?: { shareImmutableItems?: boolean; }) => void; addGeneratedVideosToDrawer: (generatedItems: BufferItem[]) => void; addGeneratedImagesToDrawer: (generatedItems: BufferItem[], options?: { canvasId?: string; onOutputCachePatch?: (outputId: string, matchSources: string[], patch: Partial<CanvasAiGeneratedOutput>) => void; canvasOutputClientRequestId?: string; }) => void; updateDrawerItemsDeferred: (updater: (previous: BufferItem[]) => BufferItem[]) => void; setCanvasAiOutputSourceRecoveryTick: React.Dispatch<React.SetStateAction<number>>; AI_GENERATED_VIDEO_FOLDER_NAME: "AI视频"; refreshCloudAccount: (silent?: boolean) => Promise<CloudAccountSummary>; stopTemporaryReferenceShares: (shares: TemporaryReferenceShare[]) => Promise<void>; getFrameInterpolationVideoInput: (target: CanvasImageItem) => { source: string; item: CanvasImageItem; output?: undefined; } | { source: string; item: CanvasImageItem; output: CanvasAiGeneratedOutput; } | null; updateCanvasAiGeneratorData: (nodeId: string, patch: Partial<NonNullable<CanvasImageItem["ai"]>>, content?: string) => CanvasImageItem | undefined; source: string; output: CanvasAiGeneratedOutput | undefined; item: CanvasImageItem; getCanvasEnhancementInput: (target: CanvasImageItem) => { source: string; item: CanvasImageItem; output?: undefined; } | { source: string; item: CanvasImageItem; output: CanvasAiGeneratedOutput; } | null; commitCanvasAiPromptDraft: (canvasId: string, content?: string, sync?: boolean) => void; canvasSessionItemsRef: React.RefObject<Map<string, CanvasImageItem[]>>; getCanvasSessionItems: (canvasId: string) => CanvasImageItem[]; canvasAiRunTokensRef: React.RefObject<Map<string, string>>; markCanvasRunNodeActive: (canvasId: string, nodeId: string) => void; updateCanvasAiGeneratorDataForCanvas: (targetCanvasId: string, nodeId: string, patch: Partial<NonNullable<CanvasImageItem["ai"]>>, content?: string) => CanvasImageItem | undefined; runCanvasAiGeneratorTarget: (target: CanvasImageItem, options: { canvasId?: string; sourceItems?: () => CanvasImageItem[]; updateAi: (patch: Partial<NonNullable<CanvasImageItem["ai"]>>, content?: string) => void; forceUpdateAi?: (patch: Partial<NonNullable<CanvasImageItem["ai"]>>, content?: string) => void; getLatestTarget?: () => CanvasImageItem | undefined; selectTarget?: () => void; showResultToast?: boolean; toastLabel?: string; clientRequestId?: string; requireLocalImageOutputs?: boolean; }) => Promise<CanvasAiGeneratedOutput[]>; isCanvasModeRef: React.RefObject<boolean>; markCanvasRunNodeSettled: (canvasId: string, nodeId: string) => void; waitForCanvasBackgroundPatches: (canvasId: string) => Promise<void>; runCanvasTextAgentNode: (targetId: string) => Promise<void>; runCanvasFrameInterpolationNode: (targetId: string) => Promise<void>; runCanvasEnhancementNode: (targetId: string) => Promise<void>; runCanvasExpandedWorkflowFromNode: (targetId: string) => Promise<boolean>; runCanvasAiGeneratorNode: (targetId: string) => Promise<void>; cloneCanvasAiGeneratorForRerun: (source: CanvasImageItem) => CanvasImageItem | null; };

type TemporaryReferenceShare = {
  kind: 'oss' | 'cloudflared' | 'r2';
  id: string;
};

type StructuredModelCapabilities = NonNullable<CanvasAiModelCandidate['modelCapabilities']>;

const getActiveStructuredCapabilities = (target?: CanvasImageItem | null) => {
  const candidates = target?.ai?.providerCandidates || [];
  const activeCandidate = candidates.find(candidate => (
    candidate.provider === target?.ai?.provider
    && (candidate.providerChannelId || '') === (target?.ai?.providerChannelId || '')
  )) || candidates.find(candidate => candidate.provider === target?.ai?.provider)
    || candidates[0];
  return activeCandidate?.modelCapabilities ? [activeCandidate.modelCapabilities] : [];
};

const supportsStructuredReference = (
  capabilities: readonly StructuredModelCapabilities[],
  supportKey: 'supportsReferenceImages' | 'supportsReferenceVideo' | 'supportsAudioReference',
  limitKey: 'maxReferenceImages' | 'maxReferenceVideos' | 'maxReferenceAudios',
  legacyFallback: boolean,
) => {
  const hasExplicitSupport = capabilities.some(value => value[supportKey] !== undefined);
  if (hasExplicitSupport) return capabilities.some(value => value[supportKey] === true);
  const explicitLimits = capabilities.flatMap(value => (
    value[limitKey] !== undefined ? [Number(value[limitKey])] : []
  ));
  return explicitLimits.length > 0 ? Math.max(...explicitLimits) > 0 : legacyFallback;
};

export const chooseLocalAudiosForCanvasGeneratorImpl = async (ctx: Pick<canvasGenerationActionContext, 'appendCanvasItems' | 'canvasItemsRef' | 'connectCanvasItemsToGenerator' | 'createCanvasAudioItemFromPath' | 'showToast'>, targetId: string) => {
  const { appendCanvasItems, canvasItemsRef, connectCanvasItemsToGenerator, createCanvasAudioItemFromPath, showToast } = ctx;
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    const structuredCapabilities = getActiveStructuredCapabilities(target);
    const explicitAudioLimits = structuredCapabilities.flatMap(capabilities => (
      capabilities?.maxReferenceAudios !== undefined
        ? [Number(capabilities.maxReferenceAudios)]
        : []
    ));
    const supportsAudioReference = supportsStructuredReference(
      structuredCapabilities as StructuredModelCapabilities[],
      'supportsAudioReference',
      'maxReferenceAudios',
      isSeedanceLikeVideoModel(target?.ai?.model),
    );
    if (!target || target.ai?.type !== 'video-generator' || !supportsAudioReference) return;
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'aac', 'flac', 'm4a', 'ogg', 'opus', 'aiff', 'wma'] }],
        title: '选择参考音频',
      });
      const paths = (Array.isArray(selected) ? selected : selected ? [selected] : [])
        .filter((value): value is string => typeof value === 'string' && !!value)
        .slice(0, explicitAudioLimits.length > 0
          ? Math.max(...explicitAudioLimits)
          : 3);
      if (paths.length === 0) return;
      const created = await Promise.all(paths.map((path, index) => createCanvasAudioItemFromPath(path, index)));
      const audios = created.filter((item): item is CanvasImageItem => !!item).map((item, index) => ({
        ...item,
        x: Math.max(24, target.x - item.width - 72),
        y: Math.max(24, target.y + 120 + index * 42),
      }));
      if (audios.length === 0) {
        showToast('音频读取失败');
        return;
      }
      if (appendCanvasItems(audios, '添加 AI 参考音频', false) <= 0) return;
      connectCanvasItemsToGenerator(audios.map(item => item.id), targetId);
    } catch (err) {
      console.warn('添加 AI 参考音频失败:', err);
      showToast('添加参考音频失败');
    }

};

export const startPickCanvasImageForGeneratorImpl = (ctx: Pick<canvasGenerationActionContext, 'canvasItemsRef' | 'setCanvasContextMenu' | 'setCanvasInputMenuForId' | 'setCanvasInputPickTargetId' | 'showToast' | 'updateCanvasSelection'>, targetId: string) => {
  const { canvasItemsRef, setCanvasContextMenu, setCanvasInputMenuForId, setCanvasInputPickTargetId, showToast, updateCanvasSelection } = ctx;
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!target || !canUseCanvasItemAsAiTarget(target)) return;
    const structuredVideoCapabilities = getActiveStructuredCapabilities(target);
    const allowImageReference = supportsStructuredReference(
      structuredVideoCapabilities,
      'supportsReferenceImages',
      'maxReferenceImages',
      true,
    );
    const allowVideoReference = target.ai?.type === 'video-generator'
      && target.ai?.videoInputMode !== 'FLF'
      && supportsStructuredReference(
        structuredVideoCapabilities,
        'supportsReferenceVideo',
        'maxReferenceVideos',
        true,
      );
    const allowAudioReference = target.ai?.type === 'video-generator'
      && target.ai.videoInputMode !== 'FLF'
      && supportsStructuredReference(
        structuredVideoCapabilities,
        'supportsAudioReference',
        'maxReferenceAudios',
        isSeedanceLikeVideoModel(target.ai.model),
      );
    const isFrameInterpolationTarget = target.ai?.type === 'frame-interpolation';
    const isVideoEnhancementTarget = target.ai?.type === 'video-enhancement';
    const isImageEnhancementTarget = target.ai?.type === 'image-enhancement';
    setCanvasInputMenuForId(null);
    setCanvasContextMenu(null);
    setCanvasInputPickTargetId(targetId);
    updateCanvasSelection([targetId]);
    showToast(
      isFrameInterpolationTarget
        ? '点击画布里的视频素材或视频生成结果作为补帧输入，Esc 取消'
        : isVideoEnhancementTarget
          ? '点击画布里的视频素材或视频生成结果作为清晰度增强输入，Esc 取消'
          : isImageEnhancementTarget
            ? '点击画布里的图片素材或图片生成结果作为清晰度增强输入，Esc 取消'
            : (allowAudioReference || allowVideoReference)
              ? '点击画布里的图片、视频或生成节点作为输入，Esc 取消'
              : allowImageReference
                ? '点击画布里的图片或图片生成节点作为输入，Esc 取消'
                : '当前模型不支持参考素材'
    );

};

export const pickCanvasImageForGeneratorImpl = (ctx: Pick<canvasGenerationActionContext, 'canReplaceCanvasImageReferenceForTarget' | 'canvasItemsRef' | 'canvasReferenceReplaceTargetRef' | 'connectCanvasItems' | 'replaceCanvasGeneratorReference' | 'setCanvasInputPickTargetId' | 'showToast'>, sourceId: string, targetId: string) => {
  const { canReplaceCanvasImageReferenceForTarget, canvasItemsRef, canvasReferenceReplaceTargetRef, connectCanvasItems, replaceCanvasGeneratorReference, setCanvasInputPickTargetId, showToast } = ctx;
    const source = canvasItemsRef.current.find(item => item.id === sourceId);
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    const structuredVideoCapabilities = getActiveStructuredCapabilities(target);
    const allowImageReference = supportsStructuredReference(
      structuredVideoCapabilities,
      'supportsReferenceImages',
      'maxReferenceImages',
      true,
    );
    const allowVideoReference = target?.ai?.type === 'video-generator'
      && target.ai.videoInputMode !== 'FLF'
      && supportsStructuredReference(
        structuredVideoCapabilities,
        'supportsReferenceVideo',
        'maxReferenceVideos',
        true,
      );
    const allowAudioReference = target?.ai?.type === 'video-generator'
      && target.ai.videoInputMode !== 'FLF'
      && supportsStructuredReference(
        structuredVideoCapabilities,
        'supportsAudioReference',
        'maxReferenceAudios',
        isSeedanceLikeVideoModel(target.ai.model),
      );
    const isFrameInterpolationTarget = target?.ai?.type === 'frame-interpolation';
    const isVideoEnhancementTarget = target?.ai?.type === 'video-enhancement';
    const isImageEnhancementTarget = target?.ai?.type === 'image-enhancement';
    const canPickSource = !!source && (
      isFrameInterpolationTarget
        ? canUseCanvasItemAsFrameInterpolationVideoInput(source)
        : isVideoEnhancementTarget
          ? canUseCanvasItemAsVideoEnhancementInput(source)
          : isImageEnhancementTarget
            ? canUseCanvasItemAsImageEnhancementInput(source)
        : (
          (allowImageReference && source.item.type === 'image')
          || (allowImageReference && source.ai?.type === 'image-generator')
          || (allowImageReference && source.ai?.type === 'workflow')
          || (allowVideoReference && (source.item.type === 'video' || source.ai?.type === 'video-generator'))
          || (allowAudioReference && source.item.type === 'file' && isCanvasAudioFileName(source.item.name || source.item.path))
        )
    );
    if (!canPickSource) {
      showToast(
        isFrameInterpolationTarget || isVideoEnhancementTarget
          ? '请选择视频素材或视频生成结果'
          : '请选择图片素材或图片生成结果'
      );
      return false;
    }
    const referenceReplacement = canvasReferenceReplaceTargetRef.current;
    const connected = referenceReplacement?.targetId === targetId && canReplaceCanvasImageReferenceForTarget(target)
      ? replaceCanvasGeneratorReference(referenceReplacement, sourceId)
      : connectCanvasItems(sourceId, targetId);
    if (connected) setCanvasInputPickTargetId(null);
    return connected;

};

export const startCanvasConnectionDragImpl = (ctx: Pick<canvasGenerationActionContext, 'CANVAS_CONNECTION_HANDLE_OUTSET' | 'autoScrollCanvasNearEdge' | 'canvasConnectionDragRef' | 'canvasItemsRef' | 'canvasSelectedIdsRef' | 'connectCanvasItems' | 'connectCanvasItemsToGenerator' | 'getCanvasItemRenderedBox' | 'getCanvasPointFromClient' | 'setCanvasConnectionDraft' | 'setCanvasContextMenu' | 'setCanvasInteractionActive'>, event: React.PointerEvent, sourceId: string) => {
  const { CANVAS_CONNECTION_HANDLE_OUTSET, autoScrollCanvasNearEdge, canvasConnectionDragRef, canvasItemsRef, canvasSelectedIdsRef, connectCanvasItems, connectCanvasItemsToGenerator, getCanvasItemRenderedBox, getCanvasPointFromClient, setCanvasConnectionDraft, setCanvasContextMenu, setCanvasInteractionActive } = ctx;
    if (event.button !== 0) return;
    const source = canvasItemsRef.current.find(item => item.id === sourceId);
    if (!source || !canUseCanvasItemAsAiInput(source)) return;
    event.preventDefault();
    event.stopPropagation();
    setCanvasInteractionActive(true);
    const sourceBox = getCanvasItemRenderedBox(source);
    const fromX = sourceBox.x + sourceBox.width + CANVAS_CONNECTION_HANDLE_OUTSET;
    const fromY = sourceBox.y + sourceBox.height / 2;
    const sourceIds = canvasSelectedIdsRef.current.includes(sourceId)
      ? canvasSelectedIdsRef.current.filter(id => {
        const item = canvasItemsRef.current.find(canvasItem => canvasItem.id === id);
        return canUseCanvasItemAsAiInput(item);
      })
      : [sourceId];
    canvasConnectionDragRef.current = {
      fromId: sourceId,
      sourceIds,
      pointerId: event.pointerId,
      fromX,
      fromY,
    };
    setCanvasConnectionDraft({ fromId: sourceId, sourceIds, fromX, fromY, toX: fromX, toY: fromY });

    const onMove = (moveEvent: PointerEvent) => {
      const draft = canvasConnectionDragRef.current;
      if (!draft) return;
      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      autoScrollCanvasNearEdge(moveEvent);
      const point = getCanvasPointFromClient(moveEvent.clientX, moveEvent.clientY);
      setCanvasConnectionDraft({
        fromId: draft.fromId,
        sourceIds: draft.sourceIds,
        fromX: draft.fromX,
        fromY: draft.fromY,
        toX: point.x,
        toY: point.y,
      });
    };

    const finish = (upEvent: PointerEvent) => {
      const draft = canvasConnectionDragRef.current;
      canvasConnectionDragRef.current = null;
      setCanvasConnectionDraft(null);
      setCanvasInteractionActive(false, 0);
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', finish, true);
      document.removeEventListener('pointercancel', finish, true);
      if (!draft) return;
      const target = upEvent.target as HTMLElement | null;
      const targetId = target?.closest('[data-canvas-ai-input-id]')?.getAttribute('data-canvas-ai-input-id') || '';
      if (targetId) {
        if (draft.sourceIds.length === 1) connectCanvasItems(draft.fromId, targetId);
        else connectCanvasItemsToGenerator(draft.sourceIds, targetId);
      } else {
        const point = getCanvasPointFromClient(upEvent.clientX, upEvent.clientY);
        setCanvasContextMenu({
          x: upEvent.clientX,
          y: upEvent.clientY,
          worldX: point.x,
          worldY: point.y,
          type: 'source-connection',
          sourceId: draft.fromId,
          sourceIds: draft.sourceIds,
        });
      }
    };

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', finish, true);
    document.addEventListener('pointercancel', finish, true);

};

export const startCanvasInputActionDragImpl = (ctx: Pick<canvasGenerationActionContext, 'CANVAS_CONNECTION_HANDLE_OUTSET' | 'autoScrollCanvasNearEdge' | 'canvasConnectionDraft' | 'canvasInputActionDragRef' | 'canvasItemsRef' | 'getCanvasItemRenderedBox' | 'getCanvasPointFromClient' | 'setCanvasContextMenu' | 'setCanvasInputActionDraft' | 'setCanvasInputMenuForId' | 'setCanvasInteractionActive'>, event: React.PointerEvent, targetId: string) => {
  const { CANVAS_CONNECTION_HANDLE_OUTSET, autoScrollCanvasNearEdge, canvasConnectionDraft, canvasInputActionDragRef, canvasItemsRef, getCanvasItemRenderedBox, getCanvasPointFromClient, setCanvasContextMenu, setCanvasInputActionDraft, setCanvasInputMenuForId, setCanvasInteractionActive } = ctx;
    if (event.button !== 0 || canvasConnectionDraft) return;
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!target || !canUseCanvasItemAsAiTarget(target)) return;
    event.preventDefault();
    event.stopPropagation();
    setCanvasInteractionActive(true);
    setCanvasContextMenu(null);
    setCanvasInputMenuForId(null);
    const targetBox = getCanvasItemRenderedBox(target);
    const fromX = targetBox.x - CANVAS_CONNECTION_HANDLE_OUTSET;
    const fromY = targetBox.y + targetBox.height / 2;
    canvasInputActionDragRef.current = {
      targetId,
      pointerId: event.pointerId,
      fromX,
      fromY,
    };
    setCanvasInputActionDraft({ targetId, fromX, fromY, toX: fromX, toY: fromY });

    const onMove = (moveEvent: PointerEvent) => {
      const draft = canvasInputActionDragRef.current;
      if (!draft) return;
      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      autoScrollCanvasNearEdge(moveEvent);
      const point = getCanvasPointFromClient(moveEvent.clientX, moveEvent.clientY);
      setCanvasInputActionDraft({
        targetId: draft.targetId,
        fromX: draft.fromX,
        fromY: draft.fromY,
        toX: point.x,
        toY: point.y,
      });
    };

    const finish = (upEvent: PointerEvent) => {
      const draft = canvasInputActionDragRef.current;
      canvasInputActionDragRef.current = null;
      setCanvasInputActionDraft(null);
      setCanvasInteractionActive(false, 0);
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', finish, true);
      document.removeEventListener('pointercancel', finish, true);
      if (!draft) return;
      const point = getCanvasPointFromClient(upEvent.clientX, upEvent.clientY);
      setCanvasContextMenu({
        x: upEvent.clientX,
        y: upEvent.clientY,
        worldX: point.x,
        worldY: point.y,
        type: 'target-input',
        targetId: draft.targetId,
      });
    };

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', finish, true);
    document.addEventListener('pointercancel', finish, true);

};

export const disconnectCanvasInputImpl = (ctx: Pick<canvasGenerationActionContext, 'pushCanvasUndoSnapshot' | 'removeCanvasConnection' | 'updateCanvasItemsImmediate'>, targetId: string, inputId: string) => {
  const { pushCanvasUndoSnapshot, removeCanvasConnection, updateCanvasItemsImmediate } = ctx;
    if (removeCanvasConnection(targetId, inputId, '移除 AI 输入')) return;
    pushCanvasUndoSnapshot('移除 AI 输入');
    updateCanvasItemsImmediate(prev => prev.map(item => {
      if (item.id !== targetId) return item;
      if (!isCanvasImageFusionAi(item.ai)) {
        return { ...item, inputs: (item.inputs || []).filter(id => id !== inputId) };
      }
      const fusion = removeCanvasImageFusionInput(item.ai?.imageFusion, item.inputs || [], inputId);
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
    }));

};

export const startCanvasReferenceLongPressImpl = (ctx: Pick<canvasGenerationActionContext, 'canReplaceCanvasImageReferenceForTarget' | 'canvasItemsRef' | 'canvasReferenceLongPressRef' | 'canvasReferenceSuppressClickRef' | 'pushCanvasUndoSnapshot' | 'setCanvasInputMenuForId' | 'setCanvasReferenceDragState' | 'setCanvasReferenceReplacement' | 'showToast' | 'updateCanvasItemsImmediate'>, event: React.PointerEvent<HTMLElement>, targetId: string, inputId: string, previewSource: string, inputIndex: number, rotation: 0 | 90 | 180 | 270) => {
  const { canReplaceCanvasImageReferenceForTarget, canvasItemsRef, canvasReferenceLongPressRef, canvasReferenceSuppressClickRef, pushCanvasUndoSnapshot, setCanvasInputMenuForId, setCanvasReferenceDragState, setCanvasReferenceReplacement, showToast, updateCanvasItemsImmediate } = ctx;
    if (event.button !== 0) return;
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!canReplaceCanvasImageReferenceForTarget(target) || !(target?.inputs || []).includes(inputId)) return;
    event.stopPropagation();
    canvasReferenceLongPressRef.current?.cleanup();
    setCanvasReferenceDragState(null);

    const session = {
      targetId,
      inputId,
      overInputId: inputId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
      previewSource,
      inputIndex,
      rotation,
      activated: false,
      timer: null as number | null,
      previousBodyCursor: '',
      cleanup: () => {},
    };

    const onMove = (moveEvent: PointerEvent) => {
      if (canvasReferenceLongPressRef.current !== session || moveEvent.pointerId !== session.pointerId) return;
      const distance = Math.hypot(
        moveEvent.clientX - session.startClientX,
        moveEvent.clientY - session.startClientY,
      );
      if (!session.activated) {
        if (distance > 7 && session.timer !== null) {
          window.clearTimeout(session.timer);
          session.timer = null;
        }
        return;
      }
      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      session.clientX = moveEvent.clientX;
      session.clientY = moveEvent.clientY;
      const element = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY) as HTMLElement | null;
      const referenceElement = element?.closest<HTMLElement>('[data-canvas-reference-input-id]');
      if (
        referenceElement?.dataset.canvasReferenceTargetId === targetId
        && referenceElement.dataset.canvasReferenceInputId
      ) {
        session.overInputId = referenceElement.dataset.canvasReferenceInputId;
      }
      setCanvasReferenceDragState({
        targetId,
        inputId,
        overInputId: session.overInputId,
        clientX: session.clientX,
        clientY: session.clientY,
        previewSource: session.previewSource,
        inputIndex: session.inputIndex,
        rotation: session.rotation,
      });
    };

    const finish = (upEvent: PointerEvent) => {
      if (canvasReferenceLongPressRef.current !== session || upEvent.pointerId !== session.pointerId) return;
      if (session.activated) {
        upEvent.preventDefault();
        upEvent.stopPropagation();
        const latestTarget = canvasItemsRef.current.find(item => item.id === targetId);
        const inputs = latestTarget?.inputs || [];
        const fromIndex = inputs.indexOf(inputId);
        const toIndex = inputs.indexOf(session.overInputId);
        const nextInputs = reorderCanvasInputs(inputs, fromIndex, toIndex);
        if (upEvent.type !== 'pointercancel' && canReplaceCanvasImageReferenceForTarget(latestTarget) && nextInputs !== inputs) {
          pushCanvasUndoSnapshot('调整参考图顺序');
          updateCanvasItemsImmediate(previous => previous.map(item => (
            item.id === targetId ? { ...item, inputs: nextInputs } : item
          )));
          showToast('参考图顺序已更新');
        }
        const clickSuppression = { targetId };
        canvasReferenceSuppressClickRef.current = clickSuppression;
        window.setTimeout(() => {
          if (canvasReferenceSuppressClickRef.current === clickSuppression) {
            canvasReferenceSuppressClickRef.current = null;
          }
        }, 500);
      }
      session.cleanup();
      setCanvasReferenceDragState(null);
    };

    session.cleanup = () => {
      if (session.timer !== null) {
        window.clearTimeout(session.timer);
        session.timer = null;
      }
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', finish, true);
      document.removeEventListener('pointercancel', finish, true);
      if (canvasReferenceLongPressRef.current === session) {
        canvasReferenceLongPressRef.current = null;
      }
      if (session.activated) document.body.style.cursor = session.previousBodyCursor;
    };
    canvasReferenceLongPressRef.current = session;
    session.timer = window.setTimeout(() => {
      if (canvasReferenceLongPressRef.current !== session) return;
      session.timer = null;
      session.activated = true;
      session.previousBodyCursor = document.body.style.cursor;
      document.body.style.cursor = 'grabbing';
      setCanvasInputMenuForId(null);
      setCanvasReferenceReplacement(null);
      setCanvasReferenceDragState({
        targetId,
        inputId,
        overInputId: inputId,
        clientX: session.clientX,
        clientY: session.clientY,
        previewSource: session.previewSource,
        inputIndex: session.inputIndex,
        rotation: session.rotation,
      });
    }, 300);
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', finish, true);
    document.addEventListener('pointercancel', finish, true);

};

export const getCanvasAiRerunNodePositionImpl = (ctx: Pick<canvasGenerationActionContext, 'canvasItemsRef' | 'canvasRectsIntersect'>, source: CanvasImageItem) => {
  const { canvasItemsRef, canvasRectsIntersect } = ctx;
    const gap = 64;
    const step = 44;
    let x = Math.max(24, source.x + source.width + gap);
    let y = Math.max(24, source.y);
    const items = canvasItemsRef.current;

    for (let attempt = 0; attempt < 18; attempt += 1) {
      const box = { x, y, width: source.width, height: source.height };
      const overlaps = items.some(item => item.id !== source.id && canvasRectsIntersect(box, item));
      if (!overlaps) return { x, y };
      y += step;
      if (attempt === 8) {
        x += step;
        y = Math.max(24, source.y + step);
      }
    }

    return { x, y };

};

export const cloneCanvasAiGeneratorForRerunImpl = (ctx: Pick<canvasGenerationActionContext, 'createAssetId' | 'getCanvasAiRerunNodePosition' | 'makeCanvasNodeId'>, source: CanvasImageItem) => {
  const { createAssetId, getCanvasAiRerunNodePosition, makeCanvasNodeId } = ctx;
    if (!isCanvasAiGeneratorType(source.ai?.type)) return null;
    const nextBufferId = createAssetId();
    const nextCanvasId = makeCanvasNodeId(nextBufferId, 'ai');
    const pos = getCanvasAiRerunNodePosition(source);
    const now = Date.now();
    return {
      ...cloneDrawerValue(source),
      id: nextCanvasId,
      x: pos.x,
      y: pos.y,
      item: {
        ...cloneDrawerValue(source.item),
        id: nextBufferId,
        createdAt: now,
      },
      inputs: [...(source.inputs || [])],
      ai: {
        ...cloneDrawerValue(source.ai),
        type: source.ai.type,
        status: 'idle' as const,
        error: undefined,
        generatedAt: undefined,
        outputs: [],
      },
    } as CanvasImageItem;

};

export const runCanvasAiGeneratorTargetImpl = async (ctx: Pick<canvasGenerationActionContext, 'AI_GENERATED_VIDEO_FOLDER_NAME' | 'activeCanvasIdRef' | 'addGeneratedImagesToDrawer' | 'addGeneratedVideosToDrawer' | 'cacheCanvasGeneratedImageSource' | 'canvasAiApiKey' | 'canvasAiApiProvider' | 'canvasAiCloudImageModels' | 'canvasAiCredentialSource' | 'canvasAiEndpoint' | 'canvasAiHeadersText' | 'canvasAiNewApiVideoKey' | 'canvasAiProvider' | 'canvasAiUnifiedImageModelOptions' | 'canvasItemsRef' | 'canvasesRef' | 'createCanvasAiOutputDrafts' | 'createCanvasImagePreviewThumbnail' | 'effectiveCanvasAiApiProvider' | 'effectiveCanvasAiEndpoint' | 'effectiveCanvasAiGatewayKind' | 'effectiveCanvasAiModel' | 'effectiveCanvasAiProvider' | 'getCanvasAiErrorSummary' | 'getCanvasAiResolvedModel' | 'getCanvasImageInputBufferItemsForNode' | 'getCanvasImageInputsForNode' | 'getCanvasTextInputsForNode' | 'isCanvasAiLicenseManaged' | 'notifyCanvasAiGenerationResult' | 'pushDrawerUndoSnapshot' | 'refreshCloudAccount' | 'setCanvasAiOutputSourceRecoveryTick' | 'showToast' | 'stopTemporaryReferenceShares' | 'updateDrawerItemsDeferred'>, target: CanvasImageItem, options: {
      canvasId?: string;
      sourceItems?: () => CanvasImageItem[];
      updateAi: (patch: Partial<NonNullable<CanvasImageItem['ai']>>, content?: string) => void;
      forceUpdateAi?: (patch: Partial<NonNullable<CanvasImageItem['ai']>>, content?: string) => void;
      getLatestTarget?: () => CanvasImageItem | undefined;
      selectTarget?: () => void;
      showResultToast?: boolean;
      toastLabel?: string;
      clientRequestId?: string;
      requireLocalImageOutputs?: boolean;
    }) => {
  const { AI_GENERATED_VIDEO_FOLDER_NAME, activeCanvasIdRef, addGeneratedImagesToDrawer, addGeneratedVideosToDrawer, cacheCanvasGeneratedImageSource, canvasAiApiKey, canvasAiApiProvider, canvasAiCloudImageModels, canvasAiCredentialSource, canvasAiEndpoint, canvasAiHeadersText, canvasAiNewApiVideoKey, canvasAiProvider, canvasAiUnifiedImageModelOptions, canvasItemsRef, canvasesRef, createCanvasAiOutputDrafts, createCanvasImagePreviewThumbnail, effectiveCanvasAiApiProvider, effectiveCanvasAiEndpoint, effectiveCanvasAiGatewayKind, effectiveCanvasAiModel, effectiveCanvasAiProvider, getCanvasAiErrorSummary, getCanvasAiResolvedModel, getCanvasImageInputBufferItemsForNode, getCanvasImageInputsForNode, getCanvasTextInputsForNode, isCanvasAiLicenseManaged, notifyCanvasAiGenerationResult, pushDrawerUndoSnapshot, refreshCloudAccount, setCanvasAiOutputSourceRecoveryTick, showToast, stopTemporaryReferenceShares, updateDrawerItemsDeferred } = ctx;
    const latestTarget = options.getLatestTarget?.()
      || canvasItemsRef.current.find(item => item.id === target.id);
    if (latestTarget?.id === target.id) target = latestTarget;
    const targetAi = target.ai;
    if (!isCanvasAiGeneratorType(targetAi?.type)) return [] as CanvasAiGeneratedOutput[];
    const generatedCanvasId = options.canvasId?.trim()
      || activeCanvasIdRef.current
      || DEFAULT_CANVAS_ID;
    const generatedCanvasName = canvasesRef.current.find(canvas => canvas.id === generatedCanvasId)?.name;
    const generatedImageFolderLabel = `${AI_GENERATED_FOLDER_NAME} / ${getCanvasGeneratedImageFolderName(
      generatedCanvasName,
      generatedCanvasId,
    )}`;

    const clientRequestId = options.clientRequestId || createCanvasAiClientRequestId(target.id);
    const nodeStartedAt = Date.now();

    const mediaType = getCanvasAiMediaType(targetAi);
    const taskTimeoutMinutes = mediaType === 'image'
      ? CANVAS_AI_IMAGE_TASK_TIMEOUT_MINUTES
      : CANVAS_AI_VIDEO_TASK_TIMEOUT_MINUTES;
    const taskTimeoutMs = mediaType === 'image'
      ? CANVAS_AI_IMAGE_TASK_TIMEOUT_MS
      : CANVAS_AI_VIDEO_TASK_TIMEOUT_MS;
    const taskDeadlineAt = Date.now() + taskTimeoutMs;
    const waitForCanvasAiProviderTask = async <T,>(request: Promise<T>): Promise<T> => {
      const remainingMs = taskDeadlineAt - Date.now();
      if (remainingMs <= 0) {
        void request.catch(() => {});
        throw new Error(`${mediaType === 'image' ? '图片' : '视频'}生成任务等待超过 ${taskTimeoutMinutes} 分钟，已自动取消`);
      }
      let timeoutId: number | null = null;
      try {
        return await Promise.race([
          request,
          new Promise<never>((_, reject) => {
            timeoutId = window.setTimeout(() => {
              reject(new Error(`${mediaType === 'image' ? '图片' : '视频'}生成任务等待超过 ${taskTimeoutMinutes} 分钟，已自动取消`));
            }, remainingMs);
          }),
        ]);
      } finally {
        if (timeoutId !== null) window.clearTimeout(timeoutId);
      }
    };
    // A generator node can retain provider fields from an earlier selection. Re-resolve
    // image requests against the currently selected source so choosing the wallet can
    // never accidentally reuse a local-API candidate.
    const imageCredentialSource = mediaType === 'image'
      ? canvasAiCredentialSource
      : undefined;
    const targetProvider = normalizeCanvasAiProvider(targetAi.provider || '');
    const sourceChoices = mediaType === 'image'
      ? canvasAiUnifiedImageModelOptions
        .map(option => parseCanvasAiModelChoiceValue(option.value))
        .filter((choice): choice is NonNullable<ReturnType<typeof parseCanvasAiModelChoiceValue>> => (
          Boolean(choice && choice.source === imageCredentialSource)
        ))
      : [];
    const targetCanonicalModelId = targetAi.providerCandidates?.find(candidate => (
      candidate.canonicalModelId
      && candidate.provider === targetProvider
      && (!targetAi.providerChannelId || candidate.providerChannelId === targetAi.providerChannelId)
    ))?.canonicalModelId
      || targetAi.providerCandidates?.find(candidate => candidate.canonicalModelId)?.canonicalModelId;
    const targetRawPublicModel = getCanvasAiPublicImageModelName(targetProvider, targetAi.model);
    const targetPublicModel = targetRawPublicModel === 'GPT Image 2 H'
      ? 'GPT Image 2'
      : targetRawPublicModel;
    const matchingSourceChoice = findCanvasImageModelChoice(sourceChoices, {
      canonicalModelId: targetCanonicalModelId,
      provider: targetProvider,
      model: targetAi.model,
      providerChannelId: targetAi.providerChannelId,
      publicModel: targetPublicModel,
    });
    const activeSourceCandidate = matchingSourceChoice?.providerCandidates?.find(candidate => (
      candidate.source === imageCredentialSource
      && candidate.provider === targetProvider
      && candidate.model === targetAi.model
      && (!targetAi.providerChannelId || candidate.providerChannelId === targetAi.providerChannelId)
    )) || matchingSourceChoice?.providerCandidates?.find(candidate => (
      candidate.source === imageCredentialSource
      && candidate.provider === targetProvider
      && (!targetAi.providerChannelId || candidate.providerChannelId === targetAi.providerChannelId)
    )) || matchingSourceChoice?.providerCandidates?.find(candidate => candidate.source === imageCredentialSource);
    const storedVideoCandidates = mediaType === 'video'
      ? filterCanvasAiVideoModelCandidates(targetAi.model, targetAi.providerCandidates)
      : [];
    const resolvedVideoCandidates = mediaType === 'video' && isMiniMaxH3VideoModel(targetAi.model)
      ? (() => {
        const walletCandidates = getCanvasAiVideoModelCandidates(
          targetAi.model,
          canvasAiCredentialSource,
          targetProvider,
          canvasAiCloudImageModels?.videoChannels,
          canvasAiCloudImageModels?.catalog,
        );
        // A wallet response may temporarily omit the MiniMax channel. Keep the
        // provider explicit and let the server select its configured channel;
        // never reuse a stale channel id from the previous video model.
        return walletCandidates.length > 0
          ? walletCandidates
          : [{
            source: canvasAiCredentialSource,
            provider: 'minimax' as const,
            model: 'MiniMax-H3',
          }];
      })()
      : storedVideoCandidates;
    const activeVideoCandidate = mediaType === 'video'
      ? resolvedVideoCandidates.find(candidate => candidate.provider === targetProvider)
        || resolvedVideoCandidates[0]
      : undefined;
    const requestedProvider = normalizeCanvasAiProvider(
      activeVideoCandidate?.provider
      || activeSourceCandidate?.provider
      || matchingSourceChoice?.provider
      || targetAi.provider
      || (mediaType === 'video' ? 'xais-chat' : canvasAiProvider)
    );
    const selectedModel = activeVideoCandidate?.model
      || activeSourceCandidate?.model
      || matchingSourceChoice?.model
      || targetAi.model;
    const selectedProviderCandidates = hydrateCanvasAiModelCandidateCapabilities(
      (mediaType === 'video'
        ? resolvedVideoCandidates
        : matchingSourceChoice?.providerCandidates || targetAi.providerCandidates || [])
        .filter(candidate => mediaType !== 'image' || candidate.source === imageCredentialSource),
      mediaType === 'video' ? canvasAiCloudImageModels?.videoChannels : canvasAiCloudImageModels?.channels,
    );
    const selectedChannelId = activeVideoCandidate?.providerChannelId
      || activeSourceCandidate?.providerChannelId
      || matchingSourceChoice?.providerChannelId
      || (mediaType === 'video' ? undefined : targetAi.providerChannelId);
    const selectedChannelCapabilities = selectedChannelId
      ? (mediaType === 'video'
        ? canvasAiCloudImageModels?.videoChannels?.find(channel => channel.id === selectedChannelId)?.capabilities
        : canvasAiCloudImageModels?.channels?.find(channel => channel.id === selectedChannelId)?.capabilities)
      : undefined;
    const selectedModelCapabilities = selectedProviderCandidates.find(candidate => (
        candidate.provider === requestedProvider && candidate.model === selectedModel
      ))?.capabilities
      || activeVideoCandidate?.capabilities
      || activeSourceCandidate?.capabilities
      || selectedChannelCapabilities;
    const useCloudWallet = (mediaType === 'image' || mediaType === 'video')
      && !isCanvasAiLicenseManaged
      && (mediaType !== 'image' ? canvasAiCredentialSource === 'wallet' : imageCredentialSource === 'wallet');
    const provider = isCanvasAiLicenseManaged ? effectiveCanvasAiProvider : requestedProvider;
    const providerApiKey = provider === canvasAiProvider
      ? canvasAiApiKey
      : getStoredCanvasAiApiKey(provider);
    const apiKey = isCanvasAiLicenseManaged
      ? ''
      : (mediaType === 'video' && provider === 'new-api'
        ? canvasAiNewApiVideoKey.trim() || providerApiKey.trim()
        : providerApiKey.trim());
    const getRuntimeSourceItems = options.sourceItems || (() => canvasItemsRef.current);
    const getSourceItems = () => {
      const runtimeSourceItems = getRuntimeSourceItems();
      return options.sourceItems
        ? runtimeSourceItems
        : mergeCanvasAiReferenceSourceItems(canvasItemsRef.current, runtimeSourceItems);
    };
    const manualPrompt = (target.item.content || (targetAi.presetPrompt ? '' : targetAi.prompt || '')).trim();
    const resultLabel = options.toastLabel || 'AI 节点';
    const isImageFusion = mediaType === 'image' && isCanvasImageFusionAi(targetAi);
    const imageFusionConfig = isImageFusion
      ? normalizeCanvasImageFusionConfig(targetAi.imageFusion, target.inputs || [])
      : null;
    if (isImageFusion) {
      const fusionInputIds = getCanvasImageFusionInputIds(imageFusionConfig, target.inputs || []);
      const resolvedFusionImages = getCanvasImageInputBufferItemsForNode(target, getSourceItems())
        .filter(item => item.type === 'image');
      if (fusionInputIds.length < 2 || resolvedFusionImages.length < 2) {
        const error = fusionInputIds.length < 2
          ? '请先分别设置基图和意向图'
          : '基图或意向图暂时没有可用图片；如果连接的是生图节点，请先让它生成成功';
        options.updateAi({ status: 'error', error });
        options.selectTarget?.();
        showToast(error);
        return [] as CanvasAiGeneratedOutput[];
      }
    }
    const fusionPrompt = imageFusionConfig
      ? buildCanvasImageFusionPrompt({
        baseWeight: imageFusionConfig.baseWeight,
        styleWeight: imageFusionConfig.styleWeight,
        originalRequest: manualPrompt,
      })
      : '';
    const textInputPrompts = [
      fusionPrompt,
      ...getCanvasTextInputsForNode(target, getSourceItems()),
    ].filter(Boolean);
    const promptParts = [
      ...textInputPrompts,
      targetAi.presetPrompt || '',
      isImageFusion ? '' : manualPrompt,
    ].map(text => text.trim()).filter(Boolean);
    let prompt = promptParts.join('\n\n');
    if (!prompt) {
      const errorSummary = mediaType === 'video' ? '请输入视频提示词，或连接一个文字节点' : '请输入提示词，或连接一个文字节点';
      (options.forceUpdateAi || options.updateAi)({ status: 'error', error: errorSummary });
      if (options.showResultToast !== false) {
        showToast(`${resultLabel}生成失败：${errorSummary}`);
        notifyCanvasAiGenerationResult({ status: 'error', label: resultLabel, mediaType, error: errorSummary });
      }
      return [] as CanvasAiGeneratedOutput[];
    }
    if (!apiKey && !isCanvasAiLicenseManaged && !useCloudWallet) {
      const errorSummary = mediaType === 'image'
        ? '请先完成邮箱登录并确认授权钱包有可用额度'
        : '当前视频生成尚未接入授权钱包';
      (options.forceUpdateAi || options.updateAi)({ status: 'error', error: errorSummary });
      if (options.showResultToast !== false) {
        showToast(`${resultLabel}生成失败：${errorSummary}`);
        notifyCanvasAiGenerationResult({ status: 'error', label: resultLabel, mediaType, error: errorSummary });
      }
      return [] as CanvasAiGeneratedOutput[];
    }

    const outputDrafts = createCanvasAiOutputDrafts(target, prompt, clientRequestId);
    let currentOutputs = outputDrafts;
    const setCanvasAiOutputs = (
      outputs: CanvasAiGeneratedOutput[],
      patch: Partial<NonNullable<CanvasImageItem['ai']>> = {}
    ) => {
      currentOutputs = outputs;
      options.updateAi({ outputs, ...patch });
    };
    const forceCanvasAiOutputs = (
      outputs: CanvasAiGeneratedOutput[],
      patch: Partial<NonNullable<CanvasImageItem['ai']>> = {}
    ) => {
      currentOutputs = outputs;
      (options.forceUpdateAi || options.updateAi)({ outputs, ...patch });
    };
    options.updateAi({
      status: 'working',
      error: undefined,
      prompt: manualPrompt,
      outputs: currentOutputs,
      generatedAt: Date.now(),
    });
    let temporaryReferenceShares: TemporaryReferenceShare[] = [];
    try {
      const hasServerCatalogRoute = selectedProviderCandidates.some(candidate => (
        candidate.canonicalModelId
        && candidate.provider === provider
        && candidate.model === selectedModel
      ));
      const requestModel = isCanvasAiLicenseManaged && effectiveCanvasAiModel
        ? effectiveCanvasAiModel
        : hasServerCatalogRoute
          ? selectedModel
          : getCanvasAiResolvedModel(provider, selectedModel, mediaType);
      const selectedCatalogModel = findAiCatalogModel(
        getAiCatalogModels(useCloudWallet ? canvasAiCloudImageModels : null, mediaType),
        targetCanonicalModelId
          || selectedProviderCandidates.find(candidate => (
            candidate.canonicalModelId === targetAi.model
          ))?.canonicalModelId
          || selectedProviderCandidates.find(candidate => candidate.canonicalModelId)?.canonicalModelId
          || targetAi.model
          || selectedModel,
      );
      if (useCloudWallet && hasServerAiCatalog(canvasAiCloudImageModels) && !selectedCatalogModel) {
        throw new Error('当前云端目录中不存在所选模型，请刷新模型列表后重新选择');
      }
      const submittedModel = useCloudWallet
        ? selectedCatalogModel?.id || targetCanonicalModelId || selectedModel
        : requestModel;
      const selectedRouteCandidate = selectedProviderCandidates.find(candidate => (
        candidate.provider === provider && candidate.model === requestModel
      )) || selectedProviderCandidates[0];
      const selectedChannel = (mediaType === 'video'
        ? canvasAiCloudImageModels?.videoChannels
        : canvasAiCloudImageModels?.channels)?.find(channel => channel.id === selectedChannelId);
      const selectedRouteCapabilities = selectedRouteCandidate?.modelCapabilities
        || getChannelModelCapabilities(
          selectedChannel,
          selectedRouteCandidate?.model,
          selectedCatalogModel?.id,
        );
      const resolvedImageCapabilities = resolveCanvasAiImageModelCapabilities({
        provider,
        model: requestModel,
        channelCapabilities: selectedModelCapabilities,
        canonical: selectedCatalogModel?.capabilities,
        route: selectedRouteCapabilities,
      });
      const resolvedVideoCapabilities = resolveCanvasAiVideoModelCapabilities({
        provider,
        model: submittedModel,
        canonical: selectedCatalogModel?.capabilities,
        route: selectedRouteCapabilities,
      });
      const usePortableWalletReferences = shouldUsePortableWalletImageReferences(
        useCloudWallet,
        mediaType,
        provider,
      );
      const isXaisWorkerRequest = provider === 'xais-chat'
        && (mediaType === 'video' || isCanvasAiXaisWorkerModel(requestModel));
      const xaisReferenceFormat: 'any' | 'jpeg' = !usePortableWalletReferences
        && mediaType !== 'video' && provider === 'xais-chat' && isCanvasAiXaisWorkerModel(requestModel)
        ? 'jpeg'
        : 'any';
      const useDirectReferenceImages = isOpenAiLikeCanvasAiProvider(provider)
        || (provider === 'xais-chat' && !isXaisWorkerRequest);
      const inputMode = usePortableWalletReferences
        || isOpenAiLikeCanvasAiProvider(provider)
        || (provider === 'xais-chat' && !isXaisWorkerRequest)
        ? 'stable'
        : 'remote-first';
      const referenceSourceItems = getSourceItems();
      const resolvedReferenceItems = getCanvasImageInputBufferItemsForNode(target, referenceSourceItems);
      const globalTarget = referenceSourceItems.find(item => item.id === target.id);
      const globalReferenceItems = globalTarget
        ? getCanvasImageInputBufferItemsForNode(globalTarget, referenceSourceItems)
        : [];
      if (provider === 'xais-chat') {
        debugXaisImage2('referenceResolution', {
          clientRequestId,
          targetId: target.id,
          targetInputCount: (target.inputs || []).length,
          targetInputIds: (target.inputs || []).slice(0, 8),
          storedProvider: targetAi.provider,
          runtimeProvider: provider,
          runtimeSourceItemCount: getRuntimeSourceItems().length,
          mergedSourceItemCount: referenceSourceItems.length,
          resolvedReferenceCount: resolvedReferenceItems.length,
          resolvedReferenceTypes: resolvedReferenceItems.map(item => item.type),
          globalTargetInputCount: (globalTarget?.inputs || []).length,
          globalResolvedReferenceCount: globalReferenceItems.length,
        });
      }
      const referencePreparationStartedAt = Date.now();
      const preparedInputs = await getCanvasImageInputsForNode(
        target,
        inputMode,
        usePortableWalletReferences || isXaisWorkerRequest
          ? 'remote-only'
          : useDirectReferenceImages ? 'direct' : 'auto',
        referenceSourceItems,
        xaisReferenceFormat,
        'cloudflared-first',
        usePortableWalletReferences,
        provider,
      );
      const referencePreparationCompletedAt = Date.now();
      if (mediaType === 'image') {
        console.info('[canvas_image_reference_timing]', {
          clientRequestId,
          model: requestModel,
          referenceCount: preparedInputs.images.length,
          nodeSetupMs: referencePreparationStartedAt - nodeStartedAt,
          referencePreparationMs: referencePreparationCompletedAt - referencePreparationStartedAt,
          elapsedMs: referencePreparationCompletedAt - nodeStartedAt,
        });
      }
      if (isImageFusion && preparedInputs.images.length < 2) {
        throw new Error('基图或意向图读取失败，溶图需要两张可用图片');
      }
      if (provider === 'xais-chat') {
        debugXaisImage2('referencePreparation', {
          clientRequestId,
          resolvedReferenceCount: resolvedReferenceItems.length,
          preparedReferenceCount: preparedInputs.images.length,
          usedRemoteFirst: preparedInputs.usedRemoteFirst,
          portableWalletReferences: usePortableWalletReferences,
          durationMs: Date.now() - referencePreparationStartedAt,
        });
      }
      if (
        provider === 'xais-chat'
        && Math.max(resolvedReferenceItems.length, globalReferenceItems.length) > 0
        && (preparedInputs.images.length + preparedInputs.videos.length + preparedInputs.audios.length) === 0
      ) {
        throw new Error('XAIS 参考图准备结果为空，已停止本次生成，请查看 xais-image2.log 中的 referenceResolution 记录。');
      }
      let inputImages = preparedInputs.images;
      let inputVideos = preparedInputs.videos;
      let inputAudios = preparedInputs.audios;
      const minimumReferenceImages = mediaType === 'video'
        ? resolvedVideoCapabilities.minReferenceImages
        : resolvedImageCapabilities.minReferenceImages;
      if (inputImages.length < minimumReferenceImages) {
        throw new Error(`当前模型至少需要 ${minimumReferenceImages} 张参考图`);
      }
      if (mediaType === 'video' && resolvedVideoCapabilities.source === 'server') {
        if (inputImages.length > resolvedVideoCapabilities.referenceImages) {
          throw new Error(`当前模型最多支持 ${resolvedVideoCapabilities.referenceImages} 张参考图`);
        }
        if (inputVideos.length < resolvedVideoCapabilities.minReferenceVideos) {
          throw new Error(`当前模型至少需要 ${resolvedVideoCapabilities.minReferenceVideos} 个参考视频`);
        }
        if (inputVideos.length > resolvedVideoCapabilities.referenceVideos) {
          throw new Error(`当前模型最多支持 ${resolvedVideoCapabilities.referenceVideos} 个参考视频`);
        }
        if (inputAudios.length < resolvedVideoCapabilities.minReferenceAudios) {
          throw new Error(`当前模型至少需要 ${resolvedVideoCapabilities.minReferenceAudios} 个参考音频`);
        }
        if (inputAudios.length > resolvedVideoCapabilities.referenceAudios) {
          throw new Error(`当前模型最多支持 ${resolvedVideoCapabilities.referenceAudios} 个参考音频`);
        }
      }
      let negativePrompt: string | undefined;
      let preserveReferenceIdentity = false;
      temporaryReferenceShares = preparedInputs.temporaryShareIds;
      const imageProtocol = mediaType === 'image' && provider === 'new-api'
        ? getDefaultNewApiImageProtocol(requestModel, inputImages.length > 0)
        : undefined;
      if (imageProtocol && targetAi.imageProtocol !== imageProtocol) {
        options.updateAi({ imageProtocol });
      }
      if (mediaType === 'image') {
        const hasReferenceImage = inputImages.length > 0 || (target.inputs || []).length > 0;
        const imageRules = getCanvasImageRuleState(target, hasReferenceImage);
        preserveReferenceIdentity = imageRules.product_consistency === true;
        const finalPrompt = buildFinalImagePrompt({
          textInputs: textInputPrompts,
          presetPrompt: targetAi.presetPrompt || '',
          userPrompt: isImageFusion ? '' : manualPrompt,
          qualityProfile: typeof targetAi.skillMeta?.qualityProfileId === 'string'
            ? targetAi.skillMeta.qualityProfileId
            : '',
          rules: imageRules,
          nodeType: {
            mediaType: 'image',
            hasReferenceImage,
            nodeRole: typeof targetAi.skillMeta?.workflowOutputType === 'string'
              ? targetAi.skillMeta.workflowOutputType
              : targetAi.presetLabel || target.item.name,
          },
        });
        if (canvasAiProviderSupportsNegativePrompt(provider) && finalPrompt.negativeConstraints.length > 0) {
          prompt = finalPrompt.positivePrompt || finalPrompt.prompt || prompt;
          negativePrompt = finalPrompt.negativeConstraints.join('\n');
        } else {
          prompt = finalPrompt.prompt || prompt;
        }
      }
      prompt = truncatePromptToUtf8ByteLimit(prompt);
      const requestedCount = clamp(
        currentOutputs.length || Math.round(Number(targetAi.count) || CANVAS_AI_DEFAULT_COUNT),
        1,
        mediaType === 'video'
          ? resolvedVideoCapabilities.maxOutputs
          : resolvedImageCapabilities.maxOutputs,
      );
      if (currentOutputs.length > requestedCount) {
        setCanvasAiOutputs(currentOutputs.slice(0, requestedCount), {
          status: 'working',
          error: undefined,
        });
      }
      const providerRuntime = (runtimeProvider: CanvasAiProvider) => {
        const runtimeKey = runtimeProvider === canvasAiProvider ? canvasAiApiKey.trim() : getStoredCanvasAiApiKey(runtimeProvider).trim();
        try {
          return {
            apiKey: runtimeKey,
            endpoint: getCanvasAiEndpointForRequest(runtimeProvider, runtimeProvider === canvasAiProvider ? canvasAiEndpoint : getStoredCanvasAiEndpoint(runtimeProvider)),
            headers: parseCanvasAiHeaders(runtimeProvider === canvasAiProvider ? canvasAiHeadersText : getStoredCanvasAiHeadersText(runtimeProvider)),
            apiProvider: runtimeProvider === canvasAiProvider ? canvasAiApiProvider : getStoredCanvasAiApiProvider(runtimeProvider),
            gatewayKind: canvasAiGatewayKindForProvider(runtimeProvider),
          };
        } catch {
          return { apiKey: runtimeKey };
        }
      };
      const prepareInputImagesForCandidate = async (candidate: CanvasAiModelCandidate) => {
        const candidateRequestModel = getCanvasAiResolvedModel(candidate.provider, candidate.model, 'image');
        const candidateUsesWallet = candidate.source === 'wallet';
        if (
          candidate.provider === provider
          && candidateRequestModel === requestModel
          && candidateUsesWallet === useCloudWallet
        ) {
          return inputImages;
        }

        const candidatePortableReferences = shouldUsePortableWalletImageReferences(
          candidateUsesWallet,
          'image',
          candidate.provider,
        );
        const candidateIsXaisWorker = candidate.provider === 'xais-chat'
          && isCanvasAiXaisWorkerModel(candidateRequestModel);
        const candidateReferenceFormat: 'any' | 'jpeg' = !candidatePortableReferences
          && candidateIsXaisWorker
          ? 'jpeg'
          : 'any';
        const candidateUsesDirectReferences = isOpenAiLikeCanvasAiProvider(candidate.provider)
          || (candidate.provider === 'xais-chat' && !candidateIsXaisWorker);
        const candidateInputMode = candidatePortableReferences || candidateUsesDirectReferences
          ? 'stable'
          : 'remote-first';
        const candidatePreparedInputs = await getCanvasImageInputsForNode(
          target,
          candidateInputMode,
          candidatePortableReferences || candidateIsXaisWorker
            ? 'remote-only'
            : candidateUsesDirectReferences ? 'direct' : 'auto',
          referenceSourceItems,
          candidateReferenceFormat,
          'cloudflared-first',
          candidatePortableReferences,
          candidate.provider,
        );
        if (isImageFusion && candidatePreparedInputs.images.length < 2) {
          throw new Error('候选模型未能读取完整的基图与意向图，已停止本次溶图');
        }
        temporaryReferenceShares = [
          ...temporaryReferenceShares,
          ...candidatePreparedInputs.temporaryShareIds,
        ];
        if (candidate.provider === 'xais-chat') {
          debugXaisImage2('candidateReferencePreparation', {
            clientRequestId,
            provider: candidate.provider,
            model: candidateRequestModel,
            source: candidate.source,
            resolvedReferenceCount: resolvedReferenceItems.length,
            preparedReferenceCount: candidatePreparedInputs.images.length,
          });
        }
        if (
          candidate.provider === 'xais-chat'
          && Math.max(resolvedReferenceItems.length, globalReferenceItems.length) > 0
          && candidatePreparedInputs.images.length === 0
        ) {
          throw new Error('XAIS 候选渠道的参考图准备结果为空，已停止本次生成。');
        }
        return candidatePreparedInputs.images;
      };
      // Take all coupled image settings from one imperative snapshot. Reading
      // only the ratio here while keeping an older resolution can turn a visible
      // 1K / 16:9 selection into Image2's 2K square default.
      const latestRequestTarget = options.getLatestTarget?.()
        || canvasItemsRef.current.find(item => item.id === target.id);
      const latestRequestAi = latestRequestTarget?.ai || targetAi;
      const imageRequestSettings = mediaType === 'image'
        ? resolveCanvasImageRequestSettings({
          provider,
          model: submittedModel,
          resolution: latestRequestAi.resolution,
          aspectRatio: latestRequestAi.aspectRatio,
          capabilities: resolvedImageCapabilities,
          providerCandidates: selectedProviderCandidates,
          legacyModelCapabilities: selectedModelCapabilities,
        })
        : null;
      const requestAspectRatio = mediaType === 'video' && resolvedVideoCapabilities.source === 'server'
        ? normalizeVideoAspectRatioSelection(resolvedVideoCapabilities, latestRequestAi.aspectRatio)
        : imageRequestSettings?.aspectRatio
          || latestRequestAi.aspectRatio
          || CANVAS_AI_DEFAULT_ASPECT_RATIO;
      const requestResolution = mediaType === 'video'
        ? resolvedVideoCapabilities.source === 'server'
          ? normalizeVideoResolutionSelection(resolvedVideoCapabilities, latestRequestAi.resolution)
          : latestRequestAi.resolution || CANVAS_AI_DEFAULT_VIDEO_RESOLUTION
        : imageRequestSettings?.resolution;
      if (imageRequestSettings && (
        imageRequestSettings.resolution !== latestRequestAi.resolution
        || imageRequestSettings.aspectRatio !== latestRequestAi.aspectRatio
      )) {
        options.updateAi(imageRequestSettings);
      }
      console.info('[canvas_image_request_snapshot]', {
        clientRequestId,
        provider,
        providerChannelId: selectedChannelId,
        model: submittedModel,
        resolution: requestResolution,
        aspectRatio: requestAspectRatio,
        requestedCount,
      });
      let generateOptions = {
        provider,
        apiKey,
        cloudWallet: useCloudWallet,
        providerChannelId: undefined,
        providerCandidates: !useCloudWallet && (selectedProviderCandidates.length > 1
          || (mediaType === 'video' && Boolean(selectedCatalogModel))
          ) ? selectedProviderCandidates
          : undefined,
        prepareInputImagesForCandidate: !useCloudWallet && mediaType === 'image' && selectedProviderCandidates.length > 1
          ? prepareInputImagesForCandidate
          : undefined,
        providerRuntime: {
          'new-api': providerRuntime('new-api'),
          'xais-chat': providerRuntime('xais-chat'),
          'openai-compatible': providerRuntime('openai-compatible'),
          custom: providerRuntime('custom'),
        },
        gatewayKind: isCanvasAiLicenseManaged
          ? effectiveCanvasAiGatewayKind
          : canvasAiGatewayKindForProvider(provider),
        apiProvider: isCanvasAiLicenseManaged
          ? effectiveCanvasAiApiProvider
          : (provider === canvasAiProvider
            ? canvasAiApiProvider
            : getStoredCanvasAiApiProvider(provider)),
        licenseManaged: isCanvasAiLicenseManaged,
        endpoint: getCanvasAiEndpointForRequest(
          provider,
          isCanvasAiLicenseManaged
            ? effectiveCanvasAiEndpoint
            : provider === canvasAiProvider ? canvasAiEndpoint : getStoredCanvasAiEndpoint(provider)
        ),
        prompt,
        negativePrompt,
        preserveReferenceIdentity,
        model: submittedModel,
        imageProtocol,
        clientRequestId,
        headers: isCanvasAiLicenseManaged
          ? undefined
          : parseCanvasAiHeaders(provider === canvasAiProvider
            ? canvasAiHeadersText
            : getStoredCanvasAiHeadersText(provider)),
        inputImages,
        inputVideos,
        inputAudios,
        aspectRatio: requestAspectRatio,
        resolution: requestResolution,
        outputFormat: targetAi.outputFormat || CANVAS_AI_DEFAULT_OUTPUT_FORMAT,
        duration: mediaType === 'video'
          ? resolvedVideoCapabilities.source === 'server'
            ? normalizeVideoDurationSelection(resolvedVideoCapabilities, targetAi.duration)
            : targetAi.duration || CANVAS_AI_DEFAULT_VIDEO_DURATION
          : undefined,
        inputMode: targetAi.videoInputMode || 'REF',
        timeoutSecs: mediaType === 'image' ? CANVAS_AI_IMAGE_TASK_TIMEOUT_MS / 1000 : undefined,
        count: 1,
        imageCapabilities: mediaType === 'image' ? resolvedImageCapabilities : undefined,
        videoCapabilities: mediaType === 'video' ? resolvedVideoCapabilities : undefined,
      };
      const generatedOutputs: CanvasAiGeneratedOutput[] = [];
      const seenGeneratedUrls = new Set<string>();
      let drawerUndoPushed = false;
      let lastPartialError: unknown = null;
      let didRetryWithStableInputs = false;
      let xaisReferenceRetryCount = 0;

      const retryWithStableInputs = async (cause: unknown) => {
        if (isXaisWorkerRequest) return false;
        if (!preparedInputs.usedRemoteFirst || didRetryWithStableInputs || generatedOutputs.length > 0) return false;
        didRetryWithStableInputs = true;
        console.warn('公网参考图生成失败，尝试切换本地缓存参考图:', cause);
        setCanvasAiOutputs(currentOutputs.map(output => output.status === 'success'
          ? output
          : { ...output, error: 'Switching to local reference images' }
        ), { status: 'working', error: undefined });
        try {
          const fallbackInputs = await getCanvasImageInputsForNode(
            target,
            'stable',
            useDirectReferenceImages ? 'direct' : 'auto',
            getSourceItems(),
            xaisReferenceFormat,
            'cloudflared-first',
            usePortableWalletReferences,
            provider,
          );
          inputImages = fallbackInputs.images;
          inputVideos = fallbackInputs.videos;
          inputAudios = fallbackInputs.audios;
          temporaryReferenceShares = [
            ...temporaryReferenceShares,
            ...fallbackInputs.temporaryShareIds,
          ];
          generateOptions = {
            ...generateOptions,
            inputImages,
            inputVideos,
            inputAudios,
          };
          return (fallbackInputs.images.length + fallbackInputs.videos.length + fallbackInputs.audios.length) > 0;
        } catch (fallbackError) {
          throw new Error(`公网参考图失败：${getCanvasAiErrorSummary(cause instanceof Error ? cause.message : String(cause))}；本地兜底也失败：${getCanvasAiErrorSummary(fallbackError instanceof Error ? fallbackError.message : String(fallbackError))}`);
        }
      };

      const retryWithFreshRemoteInputs = async (cause: unknown) => {
        if ((!isXaisWorkerRequest && !usePortableWalletReferences) || generatedOutputs.length > 0 || xaisReferenceRetryCount >= 3) return false;
        const message = cause instanceof Error ? cause.message : String(cause || '');
        if (!/(?:Failed to download media|DownloadFailed|Bad Gateway|fetch-object|CreateAsset|InvalidParameter\.Name|Name must be no more|Invalid image file|image file or mode|Bad request to openai|reference (?:image HTTP|URL did not return an image)|trycloudflare|cloudflared|Cloudflare Tunnel)/i.test(message)) {
          return false;
        }
        xaisReferenceRetryCount += 1;
        console.warn(`Xais 参考素材抓取失败，重新发布参考素材后重试 ${xaisReferenceRetryCount}/3:`, cause);
        setCanvasAiOutputs(currentOutputs.map(output => output.status === 'success'
          ? output
          : { ...output, status: 'working' as const, error: `重新发布参考素材 ${xaisReferenceRetryCount}/3` }
        ), { status: 'working', error: undefined });
        try {
          const freshInputs = await getCanvasImageInputsForNode(
            target,
            inputMode,
            'remote-only',
            getSourceItems(),
            xaisReferenceFormat,
            'cloudflared-first',
            usePortableWalletReferences,
            provider,
          );
          if ((freshInputs.images.length + freshInputs.videos.length + freshInputs.audios.length) === 0) return false;
          inputImages = freshInputs.images;
          inputVideos = freshInputs.videos;
          inputAudios = freshInputs.audios;
          temporaryReferenceShares = [
            ...temporaryReferenceShares,
            ...freshInputs.temporaryShareIds,
          ];
          generateOptions = {
            ...generateOptions,
            inputImages,
            inputVideos,
            inputAudios,
          };
          await new Promise<void>(resolve => window.setTimeout(resolve, 3200));
          return true;
        } catch (freshError) {
          throw new Error(`参考素材重新发布失败：${getCanvasAiErrorSummary(freshError instanceof Error ? freshError.message : String(freshError))}`);
        }
      };

      const placeGeneratedMedia = async (
        url: string,
        index: number,
        outputClientRequestId = clientRequestId,
      ) => {
        const source = url.trim();
        const durableOutputName = `${outputClientRequestId}${index > 0 ? `_${index + 1}` : ''}`;
        const requireLocalImage = mediaType === 'image' && options.requireLocalImageOutputs === true;
        const publishRemoteMediaImmediately = /^https?:\/\//i.test(source) && !requireLocalImage;
        const cached = publishRemoteMediaImmediately
          ? buildCanvasAiOutputRemoteResultPatch(source)
          : await cacheCanvasGeneratedImageSource(
            source,
            mediaType === 'video' ? `${durableOutputName}.mp4` : durableOutputName,
            { throwOnFailure: requireLocalImage },
          );
        if (requireLocalImage && !cached.path) {
          throw new Error('图片已生成，但下载到本地失败，已停止后续工作流节点');
        }
        const displayUrl = cached.url || source;
        // Avoid decoding a potentially huge generated image in the renderer
        // during result placement. Rust creates the small preview off-thread,
        // while the requested aspect ratio supplies the initial layout size.
        const size = getCanvasAiOutputSize(target.ai?.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO);
        const thumbnail = mediaType === 'image' && !!cached.path
          ? await createCanvasImagePreviewThumbnail(displayUrl, cached.path || undefined)
          : undefined;
        const generatedAt = Date.now();
        const output: CanvasAiGeneratedOutput = {
          ...(currentOutputs[index] || {
            id: `canvas_ai_output_${generatedAt.toString(36)}_${index}`,
            prompt,
          }),
          taskId: outputClientRequestId,
          clientRequestId: outputClientRequestId,
          mediaType,
          url: displayUrl,
          sourceUrl: cached.sourceUrl || source,
          path: cached.path || undefined,
          thumbnail,
          name: durableOutputName,
          prompt,
          status: 'success',
          cacheStatus: cached.path ? 'ready' : publishRemoteMediaImmediately ? 'pending' : 'failed',
          error: undefined,
          generatedAt,
          width: size.width,
          height: size.height,
        };
        const nextOutputs = currentOutputs.map((item, itemIndex) => itemIndex === index ? output : item);
        setCanvasAiOutputs(nextOutputs, { status: 'working', error: undefined, generatedAt });
        generatedOutputs.push(output);
        if (!drawerUndoPushed) {
          pushDrawerUndoSnapshot(
            mediaType === 'video' ? '保存 AI 视频' : '保存 AI 生图',
            { shareImmutableItems: true },
          );
          drawerUndoPushed = true;
        }
        const latestTarget = options.getLatestTarget?.() || {
          ...target,
          ai: {
            ...(target.ai || { type: mediaType === 'video' ? 'video-generator' as const : 'image-generator' as const }),
            outputs: nextOutputs,
            generatedAt,
          },
        } as CanvasImageItem;
        const drawerItem = createCanvasAiOutputBufferItem(latestTarget, output, index);
        if (drawerItem) {
          if (mediaType === 'video') addGeneratedVideosToDrawer([drawerItem]);
          else addGeneratedImagesToDrawer([drawerItem], {
            canvasId: generatedCanvasId,
            canvasOutputClientRequestId: outputClientRequestId,
            onOutputCachePatch: (outputId, matchSources, patch) => {
              const sourceSet = new Set(matchSources);
              const nextOutputs = currentOutputs.map((currentOutput) => (
                currentOutput.id === outputId || sourceSet.has(getCanvasAiOutputDisplaySource(currentOutput))
                  ? recoverCanvasAiOutputWithUsableResult({ ...currentOutput, ...patch })
                  : currentOutput
              ));
              if (nextOutputs.every((currentOutput, outputIndex) => currentOutput === currentOutputs[outputIndex])) return;
              currentOutputs = nextOutputs;
              options.updateAi({ outputs: nextOutputs });
            },
          });
        }
        if (mediaType === 'video') {
          const patchPublishedVideo = (patch: Partial<CanvasAiGeneratedOutput>) => {
            currentOutputs = currentOutputs.map(currentOutput => (
              currentOutput.id === output.id
                ? recoverCanvasAiOutputWithUsableResult({ ...currentOutput, ...patch })
                : currentOutput
            ));
            (options.forceUpdateAi || options.updateAi)({ outputs: currentOutputs });
            if (drawerItem) {
              updateDrawerItemsDeferred(prev => prev.map(item => item.id === drawerItem.id
                ? {
                    ...item,
                    ...(patch.url ? { url: patch.url } : {}),
                    ...(patch.path ? { path: patch.path } : {}),
                    sourceUrl: source,
                  }
                : item));
            }
            if (patch.path) {
              window.setTimeout(() => {
                setCanvasAiOutputSourceRecoveryTick(value => value + 1);
              }, 0);
            }
          };
          void (async () => {
            const localCached = cached.path
              ? cached
              : await cacheCanvasGeneratedImageSource(source, `${durableOutputName}.mp4`);
            if (!localCached.path) throw new Error('视频本地缓存没有返回文件路径');
            const localUrl = localCached.url || convertFileSrc(localCached.path);
            patchPublishedVideo({
              url: localUrl,
              path: localCached.path,
              sourceUrl: source,
              cacheStatus: 'ready',
            });
            const videoCfrMode = target.ai?.videoCfrMode || 'off';
            if (videoCfrMode === 'off') return;
            try {
              const normalized = await invoke<VideoCfrNormalizationResult>('normalize_video_cfr_if_needed', {
                inputPath: localCached.path,
                mode: videoCfrMode === 'auto' ? 'auto-ai' : videoCfrMode,
                progressId: target.id,
              });
              const normalizedPath = (normalized.outputPath || '').trim();
              if (normalized.converted && normalizedPath) {
                patchPublishedVideo({
                  url: convertFileSrc(normalizedPath),
                  path: normalizedPath,
                  sourceUrl: source,
                  cacheStatus: 'ready',
                });
              }
            } catch (error) {
              console.warn('AI 视频帧率后台检测/标准化失败，保留原视频:', error);
            }
          })().catch((error) => {
            console.warn('AI 生成视频后台缓存失败，保留 OSS 远程预览:', error);
            patchPublishedVideo({ cacheStatus: 'failed' });
          });
        }
        return output;
      };

      const slotErrors: unknown[] = [];
      const runNewApiImageBatch = async () => {
        const batchStartedAt = Date.now();
        let responseReceivedAt = 0;
        let returnedCount = 0;
        let responseKinds = '';
        setCanvasAiOutputs(currentOutputs.map(output => ({
          ...output,
          status: 'working' as const,
          error: undefined,
        })), { status: 'working', error: undefined });
        try {
          while (true) {
            try {
              const batch = await waitForCanvasAiProviderTask(
                generateCanvasAiProviderImages({
                  ...generateOptions,
                  count: requestedCount,
                })
              );
              responseReceivedAt = Date.now();
              returnedCount = batch.length;
              responseKinds = Array.from(new Set(batch.map(source => (
                /^data:image\//i.test(source) ? 'base64' : /^https?:\/\//i.test(source) ? 'url' : 'other'
              )))).join(',');
              const freshUrls = Array.from(new Set(batch.map(url => url.trim()).filter(Boolean)))
                .filter(url => !seenGeneratedUrls.has(url))
                .slice(0, requestedCount);
              if (freshUrls.length === 0) throw new Error('接口没有返回新的图片数据');
              for (const [index, freshUrl] of freshUrls.entries()) {
                seenGeneratedUrls.add(freshUrl);
                await placeGeneratedMedia(freshUrl, index);
              }
              if (freshUrls.length < requestedCount) {
                lastPartialError = new Error(`接口只返回了 ${freshUrls.length}/${requestedCount} 张图片`);
              }
              break;
            } catch (error) {
              if (await retryWithFreshRemoteInputs(error)) continue;
              lastPartialError = error;
              slotErrors[0] = error;
              const failedAt = Date.now();
              const errorSummary = getCanvasAiErrorSummary(error instanceof Error ? error.message : String(error));
              setCanvasAiOutputs(currentOutputs.map(output => output.status === 'success'
                ? output
                : { ...output, status: 'error' as const, error: errorSummary, generatedAt: output.generatedAt || failedAt }
              ), { status: 'working', error: undefined, generatedAt: failedAt });
              break;
            }
          }
        } finally {
          const finishedAt = Date.now();
          console.info('[newapi_image_client_timing]', {
            clientRequestId,
            model: submittedModel,
            protocol: imageProtocol,
            requestedCount,
            returnedCount,
            responseKinds,
            nodeSetupMs: referencePreparationStartedAt - nodeStartedAt,
            referencePreparationMs: referencePreparationCompletedAt - referencePreparationStartedAt,
            readyToDispatchMs: batchStartedAt - referencePreparationCompletedAt,
            nodeToDispatchMs: batchStartedAt - nodeStartedAt,
            requestMs: (responseReceivedAt || finishedAt) - batchStartedAt,
            placementMs: responseReceivedAt ? finishedAt - responseReceivedAt : 0,
            totalMs: finishedAt - batchStartedAt,
          });
          void invoke('append_ai_debug_log', {
            name: 'canvas-image-timing',
            line: JSON.stringify({
              at: new Date().toISOString(),
              label: 'imageGeneration',
              value: {
                clientRequestId,
                model: submittedModel,
                nodeSetupMs: referencePreparationStartedAt - nodeStartedAt,
                referencePreparationMs: referencePreparationCompletedAt - referencePreparationStartedAt,
                readyToDispatchMs: batchStartedAt - referencePreparationCompletedAt,
                nodeToDispatchMs: batchStartedAt - nodeStartedAt,
                requestMs: (responseReceivedAt || finishedAt) - batchStartedAt,
                placementMs: responseReceivedAt ? finishedAt - responseReceivedAt : 0,
                totalMs: finishedAt - batchStartedAt,
              },
            }),
          }).catch(() => {});
        }
      };
      const runOutputSlot = async (index: number) => {
        let transientRetryCount = 0;
        while (true) {
          setCanvasAiOutputs(currentOutputs.map((output, outputIndex) => outputIndex === index
            ? { ...output, status: 'working' as const, error: undefined }
            : output
          ), { status: 'working', error: undefined });

          try {
            const requestOptions = {
              ...generateOptions,
              clientRequestId: getCanvasAiSlotClientRequestId(clientRequestId, index, requestedCount),
              count: 1,
            };
            const batch = await waitForCanvasAiProviderTask(
              mediaType === 'video'
                ? generateCanvasAiProviderVideos(requestOptions)
                : generateCanvasAiProviderImages(requestOptions)
            );
            const freshUrl = batch
              .map(url => url.trim())
              .find(url => url && !seenGeneratedUrls.has(url));
            if (!freshUrl) {
              throw new Error(mediaType === 'video' ? '接口没有返回新的视频数据' : '接口没有返回新的图片数据');
            }
            seenGeneratedUrls.add(freshUrl);
            await placeGeneratedMedia(freshUrl, index, requestOptions.clientRequestId);
            return;
          } catch (error) {
            if (
              mediaType === 'image'
              && useCloudWallet
              && transientRetryCount < 2
              && shouldRetrySameCanvasAiImageCandidate(error)
            ) {
              transientRetryCount += 1;
              console.warn(
                `Wallet image slot ${index + 1}/${requestedCount} is temporarily busy; retrying ${transientRetryCount}/2`,
                error,
              );
              setCanvasAiOutputs(currentOutputs.map((output, outputIndex) => outputIndex === index
                ? { ...output, status: 'working' as const, error: `渠道繁忙，自动重试 ${transientRetryCount}/2` }
                : output
              ), { status: 'working', error: undefined });
              await new Promise<void>(resolve => window.setTimeout(resolve, 1_500 * transientRetryCount));
              continue;
            }
            lastPartialError = error;
            slotErrors[index] = error;
            if (await retryWithFreshRemoteInputs(error)) {
              continue;
            }
            if (await retryWithStableInputs(error)) {
              continue;
            }
            const failedAt = Date.now();
            const errorSummary = getCanvasAiErrorSummary(error instanceof Error ? error.message : String(error));
            setCanvasAiOutputs(currentOutputs.map((output, outputIndex) => (
              outputIndex === index && output.status !== 'success'
                ? { ...output, status: 'error' as const, error: errorSummary, generatedAt: output.generatedAt || failedAt }
                : output
            )), { status: 'working', error: undefined, generatedAt: failedAt });
            return;
          }
        }
      };

      if (mediaType === 'image' && shouldUseCanvasAiNativeImageBatchRequest(
        provider,
        useCloudWallet,
        requestedCount,
      )) {
        await runNewApiImageBatch();
      } else {
        const outputConcurrency = mediaType === 'image'
          ? getCanvasAiImageOutputConcurrency(provider, submittedModel, requestedCount)
          : requestedCount;
        let nextOutputIndex = 0;
        const runOutputWorker = async () => {
          while (nextOutputIndex < requestedCount) {
            const outputIndex = nextOutputIndex;
            nextOutputIndex += 1;
            await runOutputSlot(outputIndex);
          }
        };
        await Promise.all(Array.from(
          { length: Math.min(requestedCount, outputConcurrency) },
          () => runOutputWorker(),
        ));
      }

      if (generatedOutputs.length === 0) {
        const firstError = slotErrors.find(Boolean);
        throw firstError || new Error(mediaType === 'video' ? '接口没有返回可用视频' : '接口没有返回可用图片');
      }
      const finishedAt = Date.now();
      const unit = mediaType === 'video' ? '条视频' : '张图片';
      if (generatedOutputs.length < requestedCount) {
        const partialError = lastPartialError
          ? `已生成 ${generatedOutputs.length}/${requestedCount} ${unit}，后续失败：${getCanvasAiErrorSummary(lastPartialError instanceof Error ? lastPartialError.message : String(lastPartialError))}`
          : `接口只返回了 ${generatedOutputs.length}/${requestedCount} ${unit}`;
        setCanvasAiOutputs(currentOutputs.map(output => output.status === 'success'
          ? output
          : { ...output, status: 'error' as const, error: partialError, generatedAt: output.generatedAt || finishedAt }
        ), { status: 'error', error: `已生成 ${generatedOutputs.length}/${requestedCount} ${unit}`, generatedAt: finishedAt });
      } else {
        setCanvasAiOutputs(currentOutputs, { status: 'success', error: undefined, generatedAt: finishedAt });
      }
      options.selectTarget?.();
      if (options.showResultToast !== false) {
        showToast(generatedOutputs.length >= requestedCount
          ? `${resultLabel}生成 ${generatedOutputs.length} ${unit}，已放入「${mediaType === 'video' ? AI_GENERATED_VIDEO_FOLDER_NAME : generatedImageFolderLabel}」`
          : `${resultLabel}生成 ${generatedOutputs.length}/${requestedCount} ${unit}`);
        notifyCanvasAiGenerationResult({
          status: generatedOutputs.length >= requestedCount ? 'success' : 'partial',
          label: resultLabel,
          mediaType,
          generatedCount: generatedOutputs.length,
          requestedCount,
          error: lastPartialError ? getCanvasAiErrorSummary(lastPartialError instanceof Error ? lastPartialError.message : String(lastPartialError)) : undefined,
        });
      }
      if (useCloudWallet) void refreshCloudAccount(true);
      return generatedOutputs;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const errorSummary = getCanvasAiErrorSummary(message);
      console.warn('AI 节点生成失败:', err);
      const failedAt = Date.now();
      const failedOutputs = (currentOutputs.length > 0 ? currentOutputs : outputDrafts).map(output => output.status === 'success'
        ? output
        : { ...output, status: 'error' as const, error: errorSummary, generatedAt: output.generatedAt || failedAt }
      );
      forceCanvasAiOutputs(failedOutputs, { status: 'error', error: errorSummary, generatedAt: failedAt });
      if (options.forceUpdateAi) {
        window.setTimeout(() => {
          forceCanvasAiOutputs(failedOutputs, { status: 'error', error: errorSummary, generatedAt: failedAt });
        }, 0);
      }
      if (options.showResultToast !== false) {
        showToast(`${resultLabel}生成失败：${errorSummary.slice(0, 80)}`);
        notifyCanvasAiGenerationResult({ status: 'error', label: resultLabel, mediaType, error: errorSummary });
      }
      return [] as CanvasAiGeneratedOutput[];
    } finally {
      if (temporaryReferenceShares.length > 0) {
        const keepaliveMs = mediaType === 'video'
          ? CANVAS_AI_VIDEO_REFERENCE_SHARE_KEEPALIVE_MS
          : CANVAS_AI_IMAGE_REFERENCE_SHARE_KEEPALIVE_MS;
        const sharesToStop = [...temporaryReferenceShares];
        window.setTimeout(() => {
          void stopTemporaryReferenceShares(sharesToStop);
        }, keepaliveMs);
      }
    }

};

export const getFrameInterpolationVideoInputImpl = (ctx: Pick<canvasGenerationActionContext, 'canvasItemsRef'>, target: CanvasImageItem) => {
  const { canvasItemsRef } = ctx;
    const inputItems = (target.inputs || [])
      .map(inputId => canvasItemsRef.current.find(item => item.id === inputId))
      .filter((item): item is CanvasImageItem => !!item);
    for (const inputItem of inputItems) {
      if (inputItem.item.type === 'video') {
        const source = (inputItem.item.path || inputItem.item.url || '').trim();
        if (source) return { source, item: inputItem };
      }
      const videoOutput = getCanvasAiSuccessfulOutputs(inputItem).find(output => (
        (output.mediaType || getCanvasAiMediaType(inputItem.ai)) === 'video' && !!getCanvasAiOutputDisplaySource(output)
      ));
      if (videoOutput) {
        const source = (videoOutput.path || videoOutput.url || getCanvasAiOutputDisplaySource(videoOutput)).trim();
        if (source) return { source, item: inputItem, output: videoOutput };
      }
    }
    return null;

};

export const getFrameInterpolationEstimateKeyImpl = (ctx: Record<never, never>, target: CanvasImageItem, source: string) => {
  const {  } = ctx;
    const ai = target.ai;
    const rate = getCanvasRifeRateRequest(ai);
    return [
      'sample-benchmark-v3-auto-cfr',
      source,
      rate.factor,
      rate.targetFps || 'multiplier',
      ai?.videoCfrMode || 'auto',
      ai?.interpolationMode || 'normal',
      ai?.model || 'rife-v4.6',
      ai?.interpolationQuality || 'standard',
      String(ai?.outputFormat || 'mp4').toLowerCase(),
    ].join('|');

};

export const runCanvasFrameInterpolationNodeImpl = async (ctx: Pick<canvasGenerationActionContext, 'AI_GENERATED_VIDEO_FOLDER_NAME' | 'addGeneratedVideosToDrawer' | 'canvasItemsRef' | 'getCanvasAiErrorSummary' | 'getFrameInterpolationVideoInput' | 'showToast' | 'updateCanvasAiGeneratorData' | 'updateCanvasSelection'>, targetId: string) => {
  const { AI_GENERATED_VIDEO_FOLDER_NAME, addGeneratedVideosToDrawer, canvasItemsRef, getCanvasAiErrorSummary, getFrameInterpolationVideoInput, showToast, updateCanvasAiGeneratorData, updateCanvasSelection } = ctx;
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!target || target.ai?.type !== 'frame-interpolation') return;

    const videoInput = getFrameInterpolationVideoInput(target);
    if (!videoInput) {
      updateCanvasAiGeneratorData(targetId, {
        status: 'error',
        error: '请先接入一个视频素材或视频生成结果',
        outputs: [],
        generatedAt: Date.now(),
      });
      showToast('请先给补帧节点接入一个视频');
      return;
    }

    const fixed2xMode = isRifeFixed2xMode(target.ai.interpolationMode);
    const rate = getCanvasRifeRateRequest(target.ai);
    const factor = rate.factor;
    const rateLabel = fixed2xMode || target.ai.interpolationRateMode !== 'target-fps'
      ? `${factor}× 补帧`
      : `目标 ${rate.targetFps || 60}fps`;
    const startedAt = Date.now();
    const draft: CanvasAiGeneratedOutput = {
      id: `${target.id}_rife_output_${startedAt}`,
      mediaType: 'video',
      name: `RIFE ${rateLabel}`,
      status: 'working',
      generatedAt: startedAt,
      width: 16,
      height: 9,
    };
    updateCanvasAiGeneratorData(targetId, {
      status: 'working',
      error: undefined,
      interpolationProgress: {
        progressId: targetId,
        stage: 'starting-rife',
        label: '准备补帧',
        loaded: 0,
        total: 0,
        progress: 0,
      },
      outputs: [draft],
      generatedAt: startedAt,
    });
    updateCanvasSelection([targetId]);
    showToast('开始补帧；首次使用会先下载 RIFE 引擎，可能需要几分钟');

    try {
      const result = await invoke<RifeFrameInterpolationResult>('run_rife_frame_interpolation', {
        inputPath: videoInput.source,
        factor,
        model: target.ai.model || 'rife-v4.6',
        targetFps: rate.targetFps,
        cfrMode: target.ai.videoCfrMode || 'auto',
        mode: target.ai.interpolationMode || 'normal',
        quality: target.ai.interpolationQuality || 'standard',
        keepAudio: target.ai.interpolationKeepAudio !== false,
        outputFormat: target.ai.outputFormat || 'mp4',
        progressId: targetId,
      });
      const outputPath = (result.outputPath || '').trim();
      if (!outputPath) throw new Error('RIFE 没有返回输出视频路径');
      const outputUrl = convertFileSrc(outputPath);
      const finishedAt = Date.now();
      const sourceName = videoInput.output?.name || videoInput.item.item.name || videoInput.item.item.content || '视频';
      const output: CanvasAiGeneratedOutput = {
        ...draft,
        mediaType: 'video',
        url: outputUrl,
        path: outputPath,
        name: `${sourceName} · RIFE ${target.ai.interpolationRateMode === 'target-fps' && !fixed2xMode
          ? `${Number(result.fps || 0).toFixed(0)}→${Number(result.outputFps || rate.targetFps || 0).toFixed(0)}fps`
          : `${result.factor || factor}×`}`,
        prompt: `RIFE frame interpolation ${rateLabel}`,
        status: 'success',
        error: undefined,
        generatedAt: finishedAt,
        width: target.width,
        height: Math.max(1, Math.round(target.width / parseCanvasAspectRatioValue(target.ai.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO))),
      };
      updateCanvasAiGeneratorData(targetId, {
        status: 'success',
        error: undefined,
        interpolationProgress: undefined,
        outputs: [output],
        generatedAt: finishedAt,
      });
      const latestTarget = {
        ...target,
        ai: {
          ...target.ai,
          outputs: [output],
          generatedAt: finishedAt,
        },
      } as CanvasImageItem;
      const drawerItem = createCanvasAiOutputBufferItem(latestTarget, output, 0);
      if (drawerItem) addGeneratedVideosToDrawer([drawerItem]);
      showToast(`补帧完成：${(result.outputFps || 0).toFixed(1)} fps，已放入「${AI_GENERATED_VIDEO_FOLDER_NAME}」`);
    } catch (err) {
      const message = getCanvasAiErrorSummary(err instanceof Error ? err.message : String(err));
      const failedAt = Date.now();
      updateCanvasAiGeneratorData(targetId, {
        status: 'error',
        error: message,
        interpolationProgress: undefined,
        outputs: [{ ...draft, status: 'error', error: message, generatedAt: failedAt }],
        generatedAt: failedAt,
      });
      showToast(`补帧失败：${message.slice(0, 80)}`);
    }

};

export const getCanvasEnhancementInputImpl = (ctx: Pick<canvasGenerationActionContext, 'canvasItemsRef'>, target: CanvasImageItem) => {
  const { canvasItemsRef } = ctx;
    const mediaType = getCanvasAiMediaType(target.ai);
    const inputItems = (target.inputs || [])
      .map(inputId => canvasItemsRef.current.find(item => item.id === inputId))
      .filter((item): item is CanvasImageItem => !!item);
    for (const inputItem of inputItems) {
      if (inputItem.item.type === mediaType) {
        const source = (inputItem.item.path || inputItem.item.url || '').trim();
        if (source) return { source, item: inputItem };
      }
      const output = getCanvasAiSuccessfulOutputs(inputItem).find(candidate => (
        (candidate.mediaType || getCanvasAiMediaType(inputItem.ai)) === mediaType
        && !!getCanvasAiOutputDisplaySource(candidate)
      ));
      if (output) {
        const source = (output.path || output.url || getCanvasAiOutputDisplaySource(output)).trim();
        if (source) return { source, item: inputItem, output };
      }
    }
    return null;

};

export const cancelCanvasEnhancementEstimateImpl = async (ctx: Pick<canvasGenerationActionContext, 'canvasItemsRef'>, canvasId: string) => {
  const { canvasItemsRef } = ctx;
    const latest = canvasItemsRef.current.find(item => item.id === canvasId);
    const estimateKey = latest?.ai?.enhancementEstimateKey;
    if (!estimateKey) return;
    const sharedByOtherActiveNodes = canvasItemsRef.current.some(item => (
      item.id !== canvasId
      && item.ai?.type === 'video-enhancement'
      && item.ai?.enhancementEngine !== 'quick'
      && item.ai?.enhancementEstimateKey === estimateKey
    ));
    if (sharedByOtherActiveNodes) return;
    try {
      await invoke('cancel_realesrgan_enhancement_estimate', {
        progressId: canvasId,
      });
    } catch {
      // Best effort: if the estimate is already gone, just continue.
    }
    enhancementEstimateCache.delete(estimateKey);

};

export const runCanvasEnhancementNodeImpl = async (ctx: Pick<canvasGenerationActionContext, 'activeCanvasIdRef' | 'addGeneratedImagesToDrawer' | 'addGeneratedVideosToDrawer' | 'canvasItemsRef' | 'createCanvasImagePreviewThumbnail' | 'getCanvasAiErrorSummary' | 'getCanvasEnhancementInput' | 'showToast' | 'updateCanvasAiGeneratorData' | 'updateCanvasSelection'>, targetId: string) => {
  const { activeCanvasIdRef, addGeneratedImagesToDrawer, addGeneratedVideosToDrawer, canvasItemsRef, createCanvasImagePreviewThumbnail, getCanvasAiErrorSummary, getCanvasEnhancementInput, showToast, updateCanvasAiGeneratorData, updateCanvasSelection } = ctx;
    const runCanvasId = activeCanvasIdRef.current || DEFAULT_CANVAS_ID;
    const target = canvasItemsRef.current.find(item => item.id === targetId);
    if (!target || !isCanvasAiEnhancementType(target.ai?.type)) return;

    const input = getCanvasEnhancementInput(target);
    const mediaType = getCanvasAiMediaType(target.ai);
    if (!input) {
      const message = mediaType === 'video'
        ? '请先接入一个视频素材或视频生成结果'
        : '请先接入一个图片素材或图片生成结果';
      updateCanvasAiGeneratorData(targetId, {
        status: 'error',
        error: message,
        outputs: [],
        generatedAt: Date.now(),
      });
      showToast(message);
      return;
    }

    const isQuickVideoEnhancement = mediaType === 'video' && target.ai?.enhancementEngine === 'quick';
    const scale = isQuickVideoEnhancement
      ? clamp(Math.round(Number(target.ai?.quickEnhancementScale) || 2), 1, 2)
      : clamp(Math.round(Number(target.ai?.enhancementScale) || 2), 2, 4);
    const startedAt = Date.now();
    const draft: CanvasAiGeneratedOutput = {
      id: `${target.id}_realesrgan_output_${startedAt}`,
      mediaType,
      name: isQuickVideoEnhancement ? `快速视频增强 ${scale}×` : `Real-ESRGAN ${scale}× 清晰度增强`,
      status: 'working',
      generatedAt: startedAt,
      width: mediaType === 'video' ? 16 : 1,
      height: mediaType === 'video' ? 9 : 1,
    };
    updateCanvasAiGeneratorData(targetId, {
      status: 'working',
      error: undefined,
      enhancementProgress: {
        progressId: targetId,
        stage: isQuickVideoEnhancement ? 'starting-quick-enhance' : 'starting-realesrgan',
        label: isQuickVideoEnhancement ? '准备快速去噪与锐化' : mediaType === 'video' ? '准备后台完整增强' : '准备增强',
        loaded: 0,
        total: 0,
        progress: 0,
      },
      outputs: [draft],
      generatedAt: startedAt,
    });
    updateCanvasSelection([targetId]);
    showToast(isQuickVideoEnhancement
      ? '快速增强已开始：去噪、锐化、提升对比与饱和度，并重新高质量编码'
      : mediaType === 'video' ? '完整视频增强已转入后台；可以继续使用画布' : '开始增强图片');

    try {
      const result = isQuickVideoEnhancement
        ? await invoke<QuickVideoEnhancementResult>('run_ffmpeg_quick_video_enhancement', {
          inputPath: input.source,
          scale,
          keepAudio: target.ai?.enhancementKeepAudio !== false,
          outputFormat: target.ai?.outputFormat || 'mp4',
          progressId: targetId,
        })
        : await invoke<RealEsrganEnhancementResult>(
          mediaType === 'video' ? 'run_realesrgan_video_enhancement' : 'run_realesrgan_image_enhancement',
          {
            inputPath: input.source,
            scale,
            mode: target.ai?.enhancementMode || 'general',
            resizeMode: target.ai?.enhancementResizeMode || 'upscale',
            keepAudio: target.ai?.enhancementKeepAudio !== false,
            outputFormat: target.ai?.outputFormat || (mediaType === 'video' ? 'mp4' : 'png'),
            progressId: targetId,
          },
        );
      const outputPath = (result.outputPath || '').trim();
      if (!outputPath) throw new Error(isQuickVideoEnhancement ? 'FFmpeg 没有返回增强视频路径' : 'Real-ESRGAN 没有返回输出文件路径');
      const finishedAt = Date.now();
      const sourceName = input.output?.name || input.item.item.name || input.item.item.content || (mediaType === 'video' ? '视频' : '图片');
      const outputUrl = convertFileSrc(outputPath);
      const thumbnail = mediaType === 'image'
        ? await createCanvasImagePreviewThumbnail(outputUrl, outputPath)
        : undefined;
      const output: CanvasAiGeneratedOutput = {
        ...draft,
        mediaType,
        url: outputUrl,
        path: outputPath,
        thumbnail,
        name: `${sourceName} · ${isQuickVideoEnhancement ? '快速增强' : '清晰度增强'} ${result.scale || scale}×`,
        prompt: isQuickVideoEnhancement
          ? `FFmpeg quick enhancement ${(result as QuickVideoEnhancementResult).encoder || 'high-quality encode'}`
          : `Real-ESRGAN ${result.mode || target.ai?.enhancementMode || 'general'} ${result.scale || scale}x`,
        status: 'success',
        error: undefined,
        generatedAt: finishedAt,
        width: target.width,
        height: Math.max(1, Math.round(target.width / parseCanvasAspectRatioValue(target.ai?.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO))),
      };
      updateCanvasAiGeneratorData(targetId, {
        status: 'success',
        error: undefined,
        enhancementProgress: undefined,
        outputs: [output],
        generatedAt: finishedAt,
      });
      const latestTarget = {
        ...target,
        ai: {
          ...target.ai,
          outputs: [output],
          generatedAt: finishedAt,
        },
      } as CanvasImageItem;
      const drawerItem = createCanvasAiOutputBufferItem(latestTarget, output, 0);
      if (drawerItem) {
        if (mediaType === 'video') addGeneratedVideosToDrawer([drawerItem]);
        else addGeneratedImagesToDrawer([drawerItem], { canvasId: runCanvasId });
      }
      showToast(isQuickVideoEnhancement
        ? `快速视频增强完成（${(result as QuickVideoEnhancementResult).encoder || '高质量编码'}）`
        : `${mediaType === 'video' ? '视频' : '图片'}清晰度增强完成`);
    } catch (err) {
      const message = getCanvasAiErrorSummary(err instanceof Error ? err.message : String(err));
      const failedAt = Date.now();
      updateCanvasAiGeneratorData(targetId, {
        status: 'error',
        error: message,
        enhancementProgress: undefined,
        outputs: [{ ...draft, status: 'error', error: message, generatedAt: failedAt }],
        generatedAt: failedAt,
      });
      showToast(`清晰度增强失败：${message.slice(0, 80)}`);
    }

};

export const runCanvasAiGeneratorNodeImpl = async (ctx: Pick<canvasGenerationActionContext, 'activeCanvasIdRef' | 'canvasAiRunTokensRef' | 'canvasItemsRef' | 'canvasSessionItemsRef' | 'commitCanvasAiPromptDraft' | 'getCanvasSessionItems' | 'isCanvasModeRef' | 'markCanvasRunNodeActive' | 'markCanvasRunNodeSettled' | 'runCanvasAiGeneratorTarget' | 'showToast' | 'updateCanvasAiGeneratorDataForCanvas' | 'updateCanvasSelection' | 'waitForCanvasBackgroundPatches'>, targetId: string) => {
  const { activeCanvasIdRef, canvasAiRunTokensRef, canvasItemsRef, canvasSessionItemsRef, commitCanvasAiPromptDraft, getCanvasSessionItems, isCanvasModeRef, markCanvasRunNodeActive, markCanvasRunNodeSettled, runCanvasAiGeneratorTarget, showToast, updateCanvasAiGeneratorDataForCanvas, updateCanvasSelection, waitForCanvasBackgroundPatches } = ctx;
    commitCanvasAiPromptDraft(targetId, undefined, true);
    const runCanvasId = activeCanvasIdRef.current || DEFAULT_CANVAS_ID;
    canvasSessionItemsRef.current.set(runCanvasId, canvasItemsRef.current);
    const target = getCanvasSessionItems(runCanvasId).find(item => item.id === targetId);
    if (!target || !isCanvasAiGeneratorType(target.ai?.type)) return;
    const runToken = createCanvasAiClientRequestId(targetId);
    const runKey = `${runCanvasId}:${targetId}`;
    if (!claimCanvasAiRun(canvasAiRunTokensRef.current, runKey, runToken)) {
      showToast('这个节点正在生成，请等待完成后再手动重试');
      return;
    }
    markCanvasRunNodeActive(runCanvasId, targetId);
    const isCurrentRun = () => canvasAiRunTokensRef.current.get(runKey) === runToken;
    const updateAiIfCurrent = (patch: Partial<NonNullable<CanvasImageItem['ai']>>, content?: string) => {
      if (!isCurrentRun()) return;
      const hasSettledOutput = patch.outputs?.some(output => output.status === 'success' || output.status === 'error');
      const isCompletionPatch = patch.status === 'success'
        || patch.status === 'error'
        || hasSettledOutput;
      const update = () => updateCanvasAiGeneratorDataForCanvas(runCanvasId, targetId, patch, content);
      if (isCompletionPatch) startTransition(() => { update(); });
      else update();
    };
    try {
      await runCanvasAiGeneratorTarget(target, {
        canvasId: runCanvasId,
        sourceItems: () => getCanvasSessionItems(runCanvasId),
        updateAi: updateAiIfCurrent,
        forceUpdateAi: updateAiIfCurrent,
        getLatestTarget: () => getCanvasSessionItems(runCanvasId).find(item => item.id === targetId),
        selectTarget: () => {
          if (isCurrentRun() && activeCanvasIdRef.current === runCanvasId && isCanvasModeRef.current) {
            updateCanvasSelection([targetId]);
          }
        },
        showResultToast: true,
        toastLabel: getCanvasAiNodeTitle(target.ai),
        clientRequestId: runToken,
      });
    } finally {
      if (isCurrentRun()) {
        const latest = getCanvasSessionItems(runCanvasId).find(item => item.id === targetId);
        if (latest?.ai?.status === 'working') {
          const failedAt = Date.now();
          const error = '生成任务已结束但未返回可用结果，请手动重试。';
          updateCanvasAiGeneratorDataForCanvas(runCanvasId, targetId, {
            status: 'error',
            error,
            generatedAt: failedAt,
            outputs: (latest.ai.outputs || []).map(output => output.status === 'working'
              ? { ...output, status: 'error' as const, error, generatedAt: output.generatedAt || failedAt }
              : output),
          });
        }
        releaseCanvasAiRun(canvasAiRunTokensRef.current, runKey, runToken);
      }
      markCanvasRunNodeSettled(runCanvasId, targetId);
      // The visible generation result is already committed. Let durable background
      // writes finish asynchronously so they cannot keep the App Agent tool card
      // stuck in "running" after the image has completed.
      void waitForCanvasBackgroundPatches(runCanvasId);
    }

};

export const generateCanvasAiGeneratorNodeImpl = async (ctx: Pick<canvasGenerationActionContext, 'activeCanvasIdRef' | 'appendCanvasItems' | 'canvasAiRunTokensRef' | 'canvasItemsRef' | 'cloneCanvasAiGeneratorForRerun' | 'commitCanvasAiPromptDraft' | 'runCanvasAiGeneratorNode' | 'runCanvasEnhancementNode' | 'runCanvasExpandedWorkflowFromNode' | 'runCanvasFrameInterpolationNode' | 'runCanvasTextAgentNode' | 'showToast'>, targetId: string) => {
  const { activeCanvasIdRef, appendCanvasItems, canvasAiRunTokensRef, canvasItemsRef, cloneCanvasAiGeneratorForRerun, commitCanvasAiPromptDraft, runCanvasAiGeneratorNode, runCanvasEnhancementNode, runCanvasExpandedWorkflowFromNode, runCanvasFrameInterpolationNode, runCanvasTextAgentNode, showToast } = ctx;
    const launchCanvasId = activeCanvasIdRef.current || DEFAULT_CANVAS_ID;
    const launchKey = `launch:${launchCanvasId}:${targetId}`;
    const launchToken = createCanvasAiClientRequestId(launchKey);
    let launchReleased = false;
    const releaseLaunch = () => {
      if (launchReleased) return;
      launchReleased = releaseCanvasAiRun(canvasAiRunTokensRef.current, launchKey, launchToken);
    };
    if (!claimCanvasAiRun(canvasAiRunTokensRef.current, launchKey, launchToken)) {
      showToast('这个节点已经在处理本次生成操作');
      return;
    }
    try {
      commitCanvasAiPromptDraft(targetId, undefined, true);
      const target = canvasItemsRef.current.find(item => item.id === targetId);
      if (!target || !canUseCanvasItemAsAiTarget(target)) return;
      if (isCanvasAgentTextTarget(target)) {
        await runCanvasTextAgentNode(targetId);
        return;
      }
      if (target.ai?.type === 'frame-interpolation') {
        await runCanvasFrameInterpolationNode(targetId);
        return;
      }
      if (isCanvasAiEnhancementType(target.ai?.type)) {
        await runCanvasEnhancementNode(targetId);
        return;
      }
      if (getCanvasWorkflowGroup(target) && target.ai?.type === 'image-generator') {
        await runCanvasExpandedWorkflowFromNode(targetId);
        return;
      }
      if (!hasCanvasAiGeneratedResults(target)) {
        await runCanvasAiGeneratorNode(targetId);
        return;
      }

      const nextNode = cloneCanvasAiGeneratorForRerun(target);
      if (!nextNode) return;
      if (appendCanvasItems([nextNode], '再次生成 AI 节点') <= 0) return;
      showToast('已复制节点，开始再次生成');
      releaseLaunch();
      await runCanvasAiGeneratorNode(nextNode.id);
    } finally {
      releaseLaunch();
    }

};
