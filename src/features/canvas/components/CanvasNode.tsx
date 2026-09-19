import { convertFileSrc,invoke } from '@tauri-apps/api/core';
import { Brush,ChevronLeft,Clock,Copy,Download,File as FileIcon,Film,Image as ImageIcon,Link,Music,Play,Plus,RefreshCw,RotateCw,Sparkles,Type,Upload,X } from 'lucide-react';
import { CanvasAiRunButton } from '../../../components/CanvasAiRunButton';
import { CanvasGeneratorControls } from '../../../components/CanvasGeneratorControls';
import { CanvasHorizontalRail } from '../../../components/CanvasHorizontalRail';
import { CanvasImageFusionControls } from '../../../components/CanvasImageFusionControls';
import { CanvasLocalMediaControls } from '../../../components/CanvasLocalMediaControls';
import { CanvasSelectionVideo } from '../../../components/CanvasSelectionVideo';
import { RoundedSelect,type RoundedSelectOption } from '../../../components/RoundedSelect';
import { CANVAS_AI_NODE_CHEVRON_CLASS,CANVAS_AI_NODE_SELECT_MENU_CLASS,CANVAS_AI_NODE_SELECT_OPTION_CLASS,CANVAS_AI_NODE_TEXT_SELECT_CLASS } from '../../../components/canvasAiNodeControlStyles';
import { CANVAS_AI_DEFAULT_ASPECT_RATIO,CANVAS_AI_NEW_API_VIDEO_ASPECT_RATIO_OPTIONS,formatCanvasAiAspectRatioOptionLabel,getCanvasAiAspectRatioOptionsForModel,normalizeCanvasAiAspectRatioForModel,usesCanvasAiImage2DimensionOptions } from '../../../utils/canvasAiAspectRatio';
import { CANVAS_AI_DEFAULT_COUNT,CANVAS_AI_DEFAULT_OUTPUT_FORMAT,CANVAS_AI_DEFAULT_VIDEO_DURATION,parseCanvasAiModelChoiceValue } from '../../../utils/canvasAiConfig';
import { isCanvasImageFusionAi,normalizeCanvasImageFusionConfig } from '../../../utils/canvasImageFusion';
import { createCanvasAiOutputBufferItem,getCanvasAiOutputDisplaySource,getCanvasAiOutputThumbnailSource,getCanvasAiSuccessfulOutputs,getCanvasItemNavSource,hasCanvasAiGeneratedResults,isCanvasWorkflowReferenceBridge } from '../../../utils/canvasItemSelectors';
import { getCanvasImageRuleState } from '../../../utils/canvasWorkflowDefinitions';
import { isCanvasAudioFileName } from '../../../utils/localMediaPaths';
import { CANVAS_AI_VIDEO_MODEL_OPTIONS,getCanvasAiImageResolutionValuesForCandidates,getCanvasAiPublicImageModelName,getCanvasAiVideoModelCandidates,getCanvasAiVideoModelOptionValue,getCanvasAiVideoProviderForModel,getCanvasAiVideoReferenceSlotDisplayLabel,isSeedance20VideoModel,normalizeCanvasAiImageResolutionForCandidates,normalizeCanvasAiImageResolutionForModel,normalizeMikotoVideoResolution,normalizeMiniMaxH3VideoResolution,normalizeNewApiVideoAspectRatio,normalizeNewApiVideoDurationForModel,normalizeNewApiVideoResolutionForModel,normalizeSeedanceVideoAspectRatio,supportsCanvasAiImageResolution } from '../../canvasAiImage';
import { CANVAS_AI_COLLAPSED_OUTPUT_PREVIEW_LIMIT } from '../../canvasAiOutputs';
import { getCanvasAiMediaType,getCanvasAiNodeTitle,isCanvasAiGeneratorType } from '../../canvasAiRuntime';
import { formatCanvasWorkingElapsed,formatEnhancementEstimateVideoMeta,formatRifeEstimateRange,formatRifeEstimateVideoMeta,getRifeEngineProgressPercent,isFrameProcessingProgress,isRifeFixed2xMode,shouldShowRifeEngineProgress } from '../../canvasLocalMediaTools';
import { clearCanvasWorkflowInternalSlot,getCanvasWorkflowInternalSlotBinding,removeCanvasWorkflowInternalSlotAsset,reorderCanvasWorkflowInternalSlotAssets } from '../../canvasWorkflowInternalSlots';
import { normalizeDesignAgentConfig } from '../../designAgentNode';
import { ThreeSceneNode } from '../../three/components/ThreeSceneNode';
import { shouldMountThreeSceneRenderer } from '../../three/model/threeSceneInteraction';
import { buildCanvasNodeViewModel } from '../canvasNodeViewModel';
import { findAiCatalogModel,getAiCatalogModels,getDefaultAiCatalogModelId,getImageAspectRatioOptionsForResolution,hasServerAiCatalog,normalizeCapabilityOption,normalizeImageAspectRatioOption,normalizeVideoAspectRatioSelection,normalizeVideoDurationSelection,normalizeVideoResolutionSelection,resolveImageModelCapabilities,resolveVideoModelCapabilities } from '../../aiModelCapabilities';
import { ImageRuleSwitchPanel } from './ImageRuleSwitchPanel';
import type { BufferItem } from '../../../types';
import type { DesignAgentConfig,CanvasImageItem } from '../../canvasModel';
import type { RealEsrganEnhancementEstimate,RifeEngineProgress,RifeFrameInterpolationEstimate } from '../../canvasLocalMediaTools';
import type { CanvasWorkflowInternalSlot } from '../../canvasTemplates';

export type CanvasNodeScope = Record<string, any>;

export function CanvasNode({ scope, canvasItem, canvasItemsRef: latestCanvasItemsRef }: { scope: CanvasNodeScope; canvasItem: CanvasImageItem; canvasItemsRef: { current: CanvasImageItem[] } }) {
  const { activeThreeSceneId, activeThreeSceneIdRef, analyzeCanvasThreeSceneNode, assignSelectedImagesToCanvasWorkflowSlot, beginThreeSceneInteraction, cancelCanvasEnhancementEstimate, CANVAS_TEXT_CONTEXT_ROUTING_OPTIONS, canvasAiCloudImageModels, canvasAiCredentialSource, canvasAiPromptTextAreaRefs, canvasAiUnifiedImageModelOptions, canvasConnectionDraft, canvasHoveredItemIdRef, canvasItems, canvasItemsRef, canvasPromptOptimizingId, canvasReferenceDragState, canvasReferenceSuppressClickRef, canvasScaledNodeRadius, canvasSelectedIdsRef, canvasTextAreaRefs, canvasTextOutputAreaRefs, canvasWorkingTimerTick, captureThreeSceneView, chooseLocalImagesForCanvasWorkflowSlot, commitCanvasAiPromptDraft, commitCanvasTextDraft, commitCanvasTextOutputDraft, copyCanvasAiOutputToCanvas, copyCanvasImageToSystemClipboard, copyCanvasTextOutput, DESIGN_AGENT_ARTIFACT_OPTIONS, DESIGN_AGENT_ROLE_OPTIONS, DESIGN_AGENT_THINKING_MODE_OPTIONS, disconnectCanvasInput, downloadBufferItems, enableCanvasWorkflowSingleEditForItem, endThreeSceneInteraction, exitThreeSceneInteraction, getCanvasAiErrorSummary, getCanvasAiUnifiedImageModelValue, getCanvasImageInputBufferItemsForNode, handleCanvasAiRunClick, handleCanvasAiRunPointerDown, handleCanvasWorkflowSlotDrop, openCanvasBrushEditor, openCanvasBrushEditorFromSource, openCanvasContextMenu, openCanvasReferenceAddMenu, openCanvasReferenceReplaceMenu, openSelectedImagePreview, openSelectedVideoPreview, optimizeCanvasPrompt, pendingCanvasFusionRoleRef, preventCanvasNativeDrag, removeCanvasItemsByIds, replaceCanvasWorkflowSlotAssets, resizeCanvasAiPromptEditor, retryCanvasWorkflowOutput, rotateCanvasImageClockwise, runCanvasTextAgentNode, scheduleCanvasAiPromptDraftCommit, scheduleCanvasTextDraftCommit, scheduleCanvasTextOutputDraftCommit, setCanvasAiPromptEditingId, setCanvasDesignAgentConfig, setCanvasInputMenuForId, setCanvasReferenceReplacement, setCanvasTextContextRouting, setCanvasTextNodeMode, setCanvasWorkflowOutputMode, showToast, startCanvasItemDrag, startCanvasReferenceLongPress, threeSceneAnalyzingIds, toggleCanvasAiOutputsExpanded, toggleCanvasImageRule, toggleCanvasImageRulePanel, updateCanvasAiGeneratorData, updateCanvasSelection, updateCollapsedCanvasWorkflowSlot, updateThreeScenePreview, updateThreeSceneReferenceOverlay, updateThreeSceneSpec, WORKFLOW_SLOT_ASSET_DRAG_MIME } = scope;
  // Controls use a deferred React transition. Read the imperative canvas ref
  // inside callbacks so a fast model/resolution/ratio change cannot apply a
  // patch based on the previous render and overwrite the user's selection.
  const getLatestCanvasItem = () => {
    const itemsRef = latestCanvasItemsRef || (canvasItemsRef as { current?: CanvasImageItem[] } | undefined);
    return itemsRef?.current?.find(item => item.id === canvasItem.id) || canvasItem;
  };
const { isSelected, isTextCanvasItem, isCanvasTextAgentRunning, isCanvasTextPlainMode, canvasDesignAgentConfig, isCanvasFrameInterpolationItem, isCanvasImageEnhancementItem, isCanvasVideoEnhancementItem, isQuickVideoEnhancementItem, isCanvasEnhancementItem, isCanvasSingleVideoInputItem, isCanvasWorkflowItem, isCanvasReferenceBridgeItem, isCanvasAiNodeItem, isCanvasThreeSceneItem, canvasThreeSceneReferences, canvasAiMediaType, canvasAiItemProvider, canvasAiItemModel, canvasAiItemCapabilities, canvasAiItemProviderCandidates, canvasAiCandidateImageResolutionValues, canvasAiSupportsImageResolution, canvasAiImageResolutionOptions, canvasAiItemImageResolution, isCanvasAiNewApiVideo, isCanvasAiSeedanceVideo, isCanvasAiSeedanceLikeVideo, isCanvasAiMiniMaxVideo, isCanvasAiMikotoVideo, isCanvasAiMikotoKlingVideo, canvasAiVideoResolutionOptions, canvasAiVideoResolution, canvasAiVideoDurationOptions, canvasAiVideoDuration, canvasAiVideoSupportsFirstLastFrame, canvasAiOutputFormat, canvasAiOutputFormatOptions, canvasAiAspectRatioValues, canvasAiCountOptions, canvasAiCatalogModel, canvasAiResolvedImageCapabilities, canvasAiResolvedVideoCapabilities, canvasWalletVideoModelContext, isCanvasWorkflowAllOutputMode, canvasWorkflow, canvasWorkflowInternalSlots, canvasExpandedWorkflowGroup, canvasExpandedInternalSlot, canvasRunCreditLabel, canvasRunCreditTitle, canvasWorkflowUserInput, canvasWorkflowAllowsImages, canvasWorkflowAllowsFiles, showCanvasAiAttachmentControl, canvasAiOutputs, canvasAiImagePreviewGallery, isCanvasAiOutputsExpanded, canvasAiVisibleOutputs, canvasAiHiddenOutputCount, showCanvasAiOutputPreview, canvasImageSource, hasCanvasImageBackingSource, isGeneratedMediaItem, isGeneratedVideoItem, isGeneratedMediaPending, isGeneratedMediaError, rawCanvasInputPreviewItems, canvasBridgeInputItems, canvasAiNodeDesignSize, isImageRulePanelExpanded, canvasAiOutputTileLayout, canvasAiNodeScale, canvasAiMenuScale, canvasRenderedItemWidth, canvasAiPromptHeight, canvasVideoReferenceSlots, canvasVideoInputMode, canvasVideoReferenceSlotLabels, canvasAllowsSeedanceOmniReferences, isCanvasVeoIngredientMode } = buildCanvasNodeViewModel(scope, canvasItem);
                          const canvasAiVideoCatalogModels = canvasAiCredentialSource === 'wallet'
                            ? getAiCatalogModels(canvasAiCloudImageModels, 'video')
                            : [];
                          const canvasAiVideoModelOptions = canvasAiCredentialSource === 'wallet'
                            && hasServerAiCatalog(canvasAiCloudImageModels)
                            ? [...canvasAiVideoCatalogModels]
                              .sort((left, right) => Number(
                                right.id === getDefaultAiCatalogModelId(canvasAiCloudImageModels, 'video'),
                              ) - Number(
                                left.id === getDefaultAiCatalogModelId(canvasAiCloudImageModels, 'video'),
                              ))
                              .map(model => ({ value: model.id, label: model.displayName }))
                            : CANVAS_AI_VIDEO_MODEL_OPTIONS;
                          const canvasAiImageModelValue = getCanvasAiUnifiedImageModelValue(
                            canvasAiItemProvider,
                            canvasAiItemModel,
                            canvasItem.ai?.providerChannelId,
                          );
                          const canvasAiImageModelLabel = canvasAiCatalogModel?.displayName
                            || canvasAiItemProviderCandidates.find(candidate => (
                              candidate.canonicalModelId === canvasItem.ai?.model
                              || candidate.model === canvasAiItemModel
                            ))?.displayName
                            || getCanvasAiPublicImageModelName(canvasAiItemProvider, canvasAiItemModel)
                            || canvasAiItemModel
                            || '未支持的图像模型';
                          const canvasAiImageModelOptions = canvasAiUnifiedImageModelOptions.some((option: RoundedSelectOption) => (
                            option.value === canvasAiImageModelValue
                          ))
                            ? canvasAiUnifiedImageModelOptions
                            : [{
                              value: canvasAiImageModelValue,
                              label: canvasAiImageModelLabel,
                              hiddenInMenu: true,
                            }, ...canvasAiUnifiedImageModelOptions];
                          const usesServerVideoCapabilities = canvasAiMediaType === 'video'
                            && canvasAiResolvedVideoCapabilities.source === 'server';
                          const canvasAiAspectRatioControlValue = usesServerVideoCapabilities
                            ? normalizeVideoAspectRatioSelection(
                              canvasAiResolvedVideoCapabilities,
                              canvasItem.ai?.aspectRatio,
                            ) || 'auto'
                            : canvasAiAspectRatioValues.length > 0
                              ? normalizeImageAspectRatioOption(
                                canvasAiAspectRatioValues,
                                canvasItem.ai?.aspectRatio,
                                CANVAS_AI_DEFAULT_ASPECT_RATIO,
                              )
                              : (isCanvasAiNewApiVideo && !isCanvasAiSeedanceVideo) || isCanvasAiMikotoKlingVideo
                                ? normalizeNewApiVideoAspectRatio(canvasItem.ai?.aspectRatio)
                                : normalizeCanvasAiAspectRatioForModel(
                                  canvasAiItemModel,
                                  canvasItem.ai?.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO,
                                  canvasAiItemImageResolution,
                                );
                          const canvasAiAspectRatioControlOptions = usesServerVideoCapabilities
                            ? canvasAiAspectRatioValues.map((value: string) => ({
                              value,
                              label: value === 'auto' ? '自动' : formatCanvasAiAspectRatioOptionLabel(value),
                            }))
                            : canvasAiAspectRatioValues.length > 0
                              ? canvasAiAspectRatioValues.map((value: string) => ({
                                value,
                                label: formatCanvasAiAspectRatioOptionLabel(value),
                              }))
                              : (isCanvasAiNewApiVideo && !isCanvasAiSeedanceVideo) || isCanvasAiMikotoKlingVideo
                                ? CANVAS_AI_NEW_API_VIDEO_ASPECT_RATIO_OPTIONS
                                : getCanvasAiAspectRatioOptionsForModel(canvasAiItemModel, canvasAiItemImageResolution);
                          const isCanvasVideoReferenceItem = (inputItem: CanvasImageItem) => {
                            const generatorOutput = getCanvasAiSuccessfulOutputs(inputItem)[0];
                            return inputItem.item.type === 'video'
                              || inputItem.ai?.type === 'video-generator'
                              || generatorOutput?.mediaType === 'video';
                          };
                          const isCanvasImageReferenceItem = (inputItem: CanvasImageItem) => {
                            const generatorOutput = getCanvasAiSuccessfulOutputs(inputItem)[0];
                            return isCanvasWorkflowReferenceBridge(inputItem)
                              || inputItem.item.type === 'image'
                              || inputItem.ai?.type === 'image-generator'
                              || inputItem.ai?.type === 'workflow'
                              || generatorOutput?.mediaType === 'image';
                          };
                          const isCanvasAudioReferenceItem = (inputItem: CanvasImageItem) => (
                            inputItem.item.type === 'file'
                            && isCanvasAudioFileName(inputItem.item.name || inputItem.item.path)
                          );
                          type CanvasInputPreviewItem = {
                            id: string;
                            node: CanvasImageItem;
                            disconnectId: string;
                            bufferItem?: BufferItem;
                          };
                          const getCanvasExpandedInputPreviewItems = (inputItem: CanvasImageItem): CanvasInputPreviewItem[] => {
                            if (!isCanvasWorkflowReferenceBridge(inputItem)) {
                              return [{ id: inputItem.id, node: inputItem, disconnectId: inputItem.id }];
                            }
                            return getCanvasImageInputBufferItemsForNode(inputItem, canvasItems)
                              .map((bufferItem: BufferItem, inputIndex: number) => ({
                                id: `${inputItem.id}:bridge-preview:${bufferItem.id || inputIndex}`,
                                node: inputItem,
                                disconnectId: inputItem.id,
                                bufferItem,
                              }));
                          };
                          const isCanvasVideoReferencePreviewItem = (inputItem: CanvasInputPreviewItem) => {
                            if (inputItem.bufferItem) return inputItem.bufferItem.type === 'video';
                            return isCanvasVideoReferenceItem(inputItem.node);
                          };
                          const isCanvasAudioReferencePreviewItem = (inputItem: CanvasInputPreviewItem) => {
                            if (inputItem.bufferItem) return inputItem.bufferItem.type === 'file'
                              && isCanvasAudioFileName(inputItem.bufferItem.name || inputItem.bufferItem.path);
                            return isCanvasAudioReferenceItem(inputItem.node);
                          };
                          const isCanvasImageReferencePreviewItem = (inputItem: CanvasInputPreviewItem) => {
                            if (inputItem.bufferItem) return inputItem.bufferItem.type === 'image';
                            return isCanvasImageReferenceItem(inputItem.node);
                          };
                          const isCanvasTextReferencePreviewItem = (inputItem: CanvasInputPreviewItem) => (
                            !inputItem.bufferItem && inputItem.node.item.type === 'text' && !inputItem.node.ai
                          );
                          const isCanvasFileReferencePreviewItem = (inputItem: CanvasInputPreviewItem) => (
                            !inputItem.bufferItem && inputItem.node.item.type === 'file' && !inputItem.node.ai
                          );
                          const getCanvasReferencePreviewSource = (inputItem: CanvasInputPreviewItem) => {
                            if (inputItem.bufferItem) return getCanvasItemNavSource(inputItem.bufferItem);
                            if (inputItem.node.item.type === 'image') return getCanvasItemNavSource(inputItem.node.item);
                            if (inputItem.node.item.type === 'video') return inputItem.node.item.thumbnail || '';
                            if (isCanvasAudioReferenceItem(inputItem.node)) return '';
                            const generatorOutput = getCanvasAiSuccessfulOutputs(inputItem.node)[0];
                            return generatorOutput?.mediaType === 'image'
                              ? getCanvasAiOutputThumbnailSource(generatorOutput)
                              : '';
                          };
                          const expandedCanvasInputPreviewItems = rawCanvasInputPreviewItems.flatMap(getCanvasExpandedInputPreviewItems);
                          const canvasAllowsAudioReferences = canvasAiResolvedVideoCapabilities.source === 'server'
                            ? canvasAiResolvedVideoCapabilities.supportsAudioReference
                            : isCanvasAiSeedanceLikeVideo;
                          const canvasVisualInputPreviewItems = expandedCanvasInputPreviewItems.filter(item => (
                            isCanvasImageReferencePreviewItem(item)
                            || (canvasAllowsSeedanceOmniReferences && isCanvasVideoReferencePreviewItem(item))
                            || (canvasAllowsSeedanceOmniReferences && canvasAllowsAudioReferences && isCanvasAudioReferencePreviewItem(item))
                          ));
                          const canvasInputPreviewItems = isCanvasAiNodeItem
                            ? expandedCanvasInputPreviewItems.filter(item => (
                              isCanvasImageReferencePreviewItem(item)
                              || (canvasAllowsSeedanceOmniReferences && isCanvasVideoReferencePreviewItem(item))
                              || (canvasAllowsSeedanceOmniReferences && canvasAllowsAudioReferences && isCanvasAudioReferencePreviewItem(item))
                              || isCanvasTextReferencePreviewItem(item)
                              || (isCanvasWorkflowItem && isCanvasFileReferencePreviewItem(item))
                            ))
                            : expandedCanvasInputPreviewItems;
                          const isCanvasImageFusionItem = isCanvasImageFusionAi(canvasItem.ai);
                          const canvasImageFusionConfig = isCanvasImageFusionItem
                            ? normalizeCanvasImageFusionConfig(canvasItem.ai?.imageFusion, canvasItem.inputs || [])
                            : null;
                          const canvasImageFusionBasePreview = canvasImageFusionConfig?.baseNodeId
                            ? canvasInputPreviewItems.find(item => item.disconnectId === canvasImageFusionConfig.baseNodeId)
                            : undefined;
                          const canvasImageFusionStylePreview = canvasImageFusionConfig?.styleNodeId
                            ? canvasInputPreviewItems.find(item => item.disconnectId === canvasImageFusionConfig.styleNodeId)
                            : undefined;
                          const canvasTextMediaInputItems = isTextCanvasItem
                            ? canvasVisualInputPreviewItems
                            : [];
                          const canvasVideoReferenceImageItems = canvasAiMediaType === 'video' && !isCanvasSingleVideoInputItem
                            ? canvasVisualInputPreviewItems.filter(item => isCanvasImageReferencePreviewItem(item) && !isCanvasVideoReferencePreviewItem(item))
                            : [];
                          const canvasVideoReferenceVideoItems = canvasAiMediaType === 'video'
                            ? canvasVisualInputPreviewItems.filter(isCanvasVideoReferencePreviewItem)
                            : [];
                          const canvasVideoReferenceAudioItems = canvasAiMediaType === 'video'
                            ? canvasVisualInputPreviewItems.filter(isCanvasAudioReferencePreviewItem)
                            : [];
                          const canvasVideoReferenceImageSlotCount = isCanvasSingleVideoInputItem
                            ? 0
                            : canvasVideoReferenceSlots.imageSlots;
                          const canvasVideoReferenceVideoSlotCount = isCanvasSingleVideoInputItem
                            ? 1
                            : canvasVideoReferenceSlots.videoSlots;
                          const canvasVideoReferenceAudioSlotCount = isCanvasSingleVideoInputItem
                            ? 0
                            : canvasVideoReferenceSlots.audioSlots;
                          const canvasVideoReferenceSlotCount = canvasVideoReferenceImageSlotCount
                            + canvasVideoReferenceVideoSlotCount
                            + canvasVideoReferenceAudioSlotCount;
                          const canvasVideoReferenceOverflowCount = Math.max(0, canvasVideoReferenceImageItems.length - canvasVideoReferenceImageSlotCount)
                            + Math.max(0, canvasVideoReferenceVideoItems.length - canvasVideoReferenceVideoSlotCount)
                            + Math.max(0, canvasVideoReferenceAudioItems.length - canvasVideoReferenceAudioSlotCount);
                          const frameInterpolationEstimate = isCanvasFrameInterpolationItem
                            ? canvasItem.ai?.interpolationEstimate as RifeFrameInterpolationEstimate | undefined
                            : undefined;
                          const frameInterpolationProgress = isCanvasFrameInterpolationItem
                            ? canvasItem.ai?.interpolationProgress as RifeEngineProgress | undefined
                            : undefined;
                          const frameInterpolationMetaText = formatRifeEstimateVideoMeta(frameInterpolationEstimate);
                          const frameInterpolationEstimateText = !frameInterpolationEstimate && canvasItem.ai?.interpolationEstimateKey
                            ? '正在实测速度…'
                            : formatRifeEstimateRange(frameInterpolationEstimate);
                          const showFrameInterpolationProgress = shouldShowRifeEngineProgress(frameInterpolationProgress);
                          const frameInterpolationProgressPercent = getRifeEngineProgressPercent(frameInterpolationProgress);
                          const frameInterpolationProgressDetail = isFrameProcessingProgress(frameInterpolationProgress) && frameInterpolationProgress?.total
                            ? `${Math.round(Number(frameInterpolationProgress.loaded || 0))}/${Math.round(Number(frameInterpolationProgress.total))}帧 · ${frameInterpolationProgressPercent}%`
                            : frameInterpolationProgress?.total ? `${frameInterpolationProgressPercent}%` : '处理中';
                          const isFrameInterpolationFixed2xMode = isCanvasFrameInterpolationItem && isRifeFixed2xMode(canvasItem.ai?.interpolationMode);
                          const enhancementEstimate = isCanvasEnhancementItem
                            && !isQuickVideoEnhancementItem
                            ? canvasItem.ai?.enhancementEstimate as RealEsrganEnhancementEstimate | undefined
                            : undefined;
                          const enhancementProgress = isCanvasEnhancementItem
                            ? canvasItem.ai?.enhancementProgress as RifeEngineProgress | undefined
                            : undefined;
                          const enhancementEstimateText = isQuickVideoEnhancementItem
                            ? '快速本地处理'
                            : !enhancementEstimate && canvasItem.ai?.enhancementEstimateKey
                            ? '正在实测速度…'
                            : formatRifeEstimateRange(enhancementEstimate);
                          const enhancementMetaText = formatEnhancementEstimateVideoMeta(enhancementEstimate);
                          const showEnhancementProgress = shouldShowRifeEngineProgress(enhancementProgress);
                          const enhancementProgressPercent = getRifeEngineProgressPercent(enhancementProgress);
                          const enhancementProgressDetail = isFrameProcessingProgress(enhancementProgress) && enhancementProgress?.total
                            ? `${Math.round(Number(enhancementProgress.loaded || 0))}/${Math.round(Number(enhancementProgress.total))}帧 · ${enhancementProgressPercent}%`
                            : enhancementProgress?.total ? `${enhancementProgressPercent}%` : '处理中';
                          const isLocalMediaBenchmarking = !!(
                            frameInterpolationProgress?.stage?.startsWith('benchmarking-')
                            || enhancementProgress?.stage?.startsWith('benchmarking-')
                          );
                          const canvasAiWorkingElapsedText = canvasItem.ai?.status === 'working'
                            ? formatCanvasWorkingElapsed(canvasItem.ai?.generatedAt, canvasWorkingTimerTick)
                            : '';
                          const canvasAiWorkingVerb = isCanvasWorkflowItem
                            ? '运行中'
                            : isCanvasFrameInterpolationItem
                              ? '补帧中'
                              : isCanvasEnhancementItem
                                ? '增强中'
                                : '生成中';
                          const canvasAiWorkingStatusText = canvasAiWorkingElapsedText
                            ? `${canvasAiWorkingVerb} ${canvasAiWorkingElapsedText}`
                            : canvasAiWorkingVerb;
                          return (
                            <div
                            key={canvasItem.id}
                            data-canvas-item-id={canvasItem.id}
                            data-canvas-selected-state={isSelected ? 'true' : undefined}
                            data-canvas-ai-input-id={(isCanvasAiNodeItem || isCanvasThreeSceneItem) && canvasConnectionDraft ? canvasItem.id : undefined}
                            className="group/canvas-item absolute isolate overflow-visible"
                            style={{
                              left: canvasItem.x,
                              top: canvasItem.y,
                              width: canvasItem.width,
                              height: canvasItem.height,
                              zIndex: isSelected ? 2 : 0,
                              touchAction: 'none',
                            }}
                            onPointerDown={(e) => {
                              if (activeThreeSceneIdRef.current && activeThreeSceneIdRef.current !== canvasItem.id) {
                                exitThreeSceneInteraction();
                              }
                              startCanvasItemDrag(e, canvasItem.id);
                            }}
                            onPointerEnter={() => {
                              canvasHoveredItemIdRef.current = canvasItem.id;
                            }}
                            onPointerLeave={() => {
                              if (canvasHoveredItemIdRef.current === canvasItem.id) {
                                canvasHoveredItemIdRef.current = '';
                              }
                            }}
                            onDragStart={preventCanvasNativeDrag}
                            onContextMenu={(e) => {
                              if (!canvasSelectedIdsRef.current.includes(canvasItem.id)) updateCanvasSelection([canvasItem.id]);
                              openCanvasContextMenu(e, 'item', { itemId: canvasItem.id });
                            }}
                            onDoubleClick={(e) => {
                              if (!enableCanvasWorkflowSingleEditForItem(canvasItem.id)) return;
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            >
                              {isCanvasAiNodeItem ? (
                                <>
                                 <div
                                   data-canvas-tool-node-surface={
                                     isCanvasImageFusionItem
                                       ? 'fusion'
                                       : isCanvasFrameInterpolationItem
                                         ? 'frame-interpolation'
                                         : isCanvasImageEnhancementItem
                                           ? 'image-enhancement'
                                           : isCanvasVideoEnhancementItem
                                             ? 'video-enhancement'
                                             : undefined
                                   }
                                   className="relative h-full w-full overflow-hidden"
                                  style={{ borderRadius: canvasScaledNodeRadius }}
                                >
                                  <div
                                    className={`flex flex-col overflow-hidden border bg-gradient-to-br from-white/88 via-white/76 to-stone-100/72 text-stone-800 shadow-[0_8px_22px_rgba(15,23,42,0.08)] backdrop-blur-2xl transition-[box-shadow,border-color] hover:shadow-[0_12px_30px_rgba(15,23,42,0.10)] dark:from-[#272727]/96 dark:via-[#222222]/96 dark:to-[#1d1d1d]/96 dark:text-white dark:shadow-[0_10px_26px_rgba(0,0,0,0.20)] dark:hover:shadow-[0_14px_34px_rgba(0,0,0,0.24)] ${
                                      'border-white/80 dark:border-white/[0.08]'
                                    }`}
                                    style={{
                                      width: canvasAiNodeDesignSize?.width || canvasItem.width,
                                      height: canvasAiNodeDesignSize?.height || canvasItem.height,
                                      borderRadius: canvasScaledNodeRadius,
                                      transform: `scale(${canvasAiNodeScale || 1})`,
                                      transformOrigin: 'left top',
                                    }}
                                  >
                                    <div className={`${canvasItem.ai?.type === 'image-generator' ? 'flex-row' : 'flex-col'} flex min-h-0 flex-1 gap-3 px-4 pb-3 pt-4`}>
                                      <div className="flex min-w-0 flex-1 flex-col gap-3">
                                      <div className="flex items-start justify-between gap-3">
                                        {showCanvasAiAttachmentControl && (
                                        isCanvasImageFusionItem && canvasImageFusionConfig ? (
                                          <CanvasImageFusionControls
                                            basePreviewSource={canvasImageFusionBasePreview ? getCanvasReferencePreviewSource(canvasImageFusionBasePreview) : undefined}
                                            stylePreviewSource={canvasImageFusionStylePreview ? getCanvasReferencePreviewSource(canvasImageFusionStylePreview) : undefined}
                                            baseConnected={!!canvasImageFusionConfig.baseNodeId}
                                            styleConnected={!!canvasImageFusionConfig.styleNodeId}
                                            baseWeight={canvasImageFusionConfig.baseWeight || 0}
                                            styleWeight={canvasImageFusionConfig.styleWeight || 0}
                                            disabled={canvasItem.ai?.status === 'working'}
                                            onOpenSlot={(role) => {
                                              setCanvasReferenceReplacement(null);
                                              pendingCanvasFusionRoleRef.current = { targetId: canvasItem.id, role };
                                              setCanvasInputMenuForId(canvasItem.id);
                                            }}
                                            onRemoveBase={() => {
                                              if (canvasImageFusionConfig.baseNodeId) {
                                                disconnectCanvasInput(canvasItem.id, canvasImageFusionConfig.baseNodeId);
                                              }
                                            }}
                                            onRemoveStyle={() => {
                                              if (canvasImageFusionConfig.styleNodeId) {
                                                disconnectCanvasInput(canvasItem.id, canvasImageFusionConfig.styleNodeId);
                                              }
                                            }}
                                            onBaseWeightChange={(baseWeight) => updateCanvasAiGeneratorData(canvasItem.id, {
                                              imageFusion: { ...canvasImageFusionConfig, baseWeight },
                                            })}
                                            onStyleWeightChange={(styleWeight) => updateCanvasAiGeneratorData(canvasItem.id, {
                                              imageFusion: { ...canvasImageFusionConfig, styleWeight },
                                            })}
                                          />
                                        ) : (
                                        <div
                                          data-no-drag="true"
                                          onPointerDown={(event) => event.stopPropagation()}
                                          onClick={(event) => {
                                            if (canvasReferenceSuppressClickRef.current?.targetId === canvasItem.id) {
                                              canvasReferenceSuppressClickRef.current = null;
                                              event.preventDefault();
                                              event.stopPropagation();
                                              return;
                                            }
                                            if (canvasItem.ai?.type === 'image-generator') return;
                                            event.preventDefault();
                                            event.stopPropagation();
                                            setCanvasReferenceReplacement(null);
                                            setCanvasInputMenuForId((prev: string | null) => prev === canvasItem.id ? null : canvasItem.id);
                                          }}
                                          className={`group/reference relative flex h-[58px] min-w-0 ${canvasAiMediaType === 'video' ? 'w-0 flex-1 overflow-hidden' : 'max-w-[330px] shrink-0 overflow-visible'} items-center justify-start rounded-[12px] text-stone-400 transition-colors hover:text-stone-600 dark:text-white/38 dark:hover:text-white/64`}
                                          title={isCanvasWorkflowItem ? '添加或管理工作流素材' : '添加或管理参考图'}
                                        >
                                          {canvasAiMediaType === 'video' ? (
                                            <CanvasHorizontalRail>
                                              {Array.from({ length: canvasVideoReferenceSlotCount }).map((_, inputIndex) => {
                                                const isVideoReferenceSlot = canvasVideoInputMode === 'REF'
                                                  && inputIndex >= canvasVideoReferenceImageSlotCount
                                                  && inputIndex < canvasVideoReferenceImageSlotCount + canvasVideoReferenceVideoSlotCount;
                                                const isAudioReferenceSlot = canvasVideoInputMode === 'REF'
                                                  && !isCanvasSingleVideoInputItem
                                                  && inputIndex >= canvasVideoReferenceImageSlotCount + canvasVideoReferenceVideoSlotCount;
                                                const inputItem = isAudioReferenceSlot
                                                  ? canvasVideoReferenceAudioItems[inputIndex - canvasVideoReferenceImageSlotCount - canvasVideoReferenceVideoSlotCount]
                                                  : isVideoReferenceSlot
                                                    ? canvasVideoReferenceVideoItems[inputIndex - canvasVideoReferenceImageSlotCount]
                                                    : canvasVideoReferenceImageItems[inputIndex];
                                                const inputSourceNode = inputItem?.node;
                                                const inputPreviewSource = inputItem
                                                  ? getCanvasReferencePreviewSource(inputItem)
                                                  : '';
                                                const slotLabel = isCanvasSingleVideoInputItem
                                                  ? '视频输入'
                                                  : getCanvasAiVideoReferenceSlotDisplayLabel(
                                                    inputIndex,
                                                    canvasVideoReferenceSlots,
                                                    canvasVideoReferenceSlotLabels,
                                                    canvasAiResolvedVideoCapabilities,
                                                  );
                                                return (
                                                  <span
                                                    key={inputItem?.id || `video-reference-${inputIndex}`}
                                                    className={`group/reference-thumbnail relative flex h-[49px] ${isCanvasVeoIngredientMode ? 'w-[68px]' : canvasVideoInputMode === 'FLF' || isVideoReferenceSlot || isAudioReferenceSlot ? 'w-14' : 'w-12'} shrink-0 items-center justify-center overflow-hidden rounded-[11px] text-stone-400 transition-colors hover:z-10 dark:text-white/60`}
                                                    aria-label={inputItem ? `${slotLabel}，双击移除输入` : `添加${slotLabel}`}
                                                    title={inputItem ? `${slotLabel} · 双击移除输入` : `添加${slotLabel}`}
                                                    onPointerDown={(event) => event.stopPropagation()}
                                                    onMouseDown={(event) => event.stopPropagation()}
                                                    onDoubleClick={(event) => {
                                                      if (!inputItem) return;
                                                      event.preventDefault();
                                                      event.stopPropagation();
                                                      disconnectCanvasInput(canvasItem.id, inputItem.disconnectId);
                                                    }}
                                                  >
                                                    {inputPreviewSource ? (
                                                      <img
                                                        src={inputPreviewSource}
                                                        alt=""
                                                        loading="lazy"
                                                        decoding="async"
                                                        className="h-full w-full rounded-[14px] border border-stone-200/32 object-cover mix-blend-multiply shadow-[0_2px_5px_rgba(15,23,42,0.07)] dark:border-white/[0.07] dark:mix-blend-normal dark:shadow-[0_3px_7px_rgba(0,0,0,0.18)]"
                                                        draggable={false}
                                                        onDragStart={preventCanvasNativeDrag}
                                                      />
                                                    ) : inputSourceNode && (isCanvasAiGeneratorType(inputSourceNode.ai?.type) || inputSourceNode.ai?.type === 'workflow') ? (
                                                      <span className="flex h-full w-full items-center justify-center rounded-[14px] border border-stone-200/32 text-stone-400 shadow-[0_2px_5px_rgba(15,23,42,0.07)] dark:border-white/[0.07] dark:text-white/58 dark:shadow-[0_3px_7px_rgba(0,0,0,0.18)]">
                                                        {getCanvasAiMediaType(inputSourceNode.ai) === 'video' ? <Film className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                                                      </span>
                                                    ) : inputItem && isCanvasAudioReferencePreviewItem(inputItem) ? (
                                                      <span className="flex h-full w-full items-center justify-center rounded-[14px] border border-stone-200/32 text-fuchsia-500 shadow-[0_2px_5px_rgba(15,23,42,0.07)] dark:border-white/[0.07] dark:text-fuchsia-300 dark:shadow-[0_3px_7px_rgba(0,0,0,0.18)]">
                                                        <Music className="h-4 w-4" />
                                                      </span>
                                                    ) : inputItem && isCanvasVideoReferencePreviewItem(inputItem) ? (
                                                      <span className="flex h-full w-full items-center justify-center rounded-[14px] border border-stone-200/32 text-stone-400 shadow-[0_2px_5px_rgba(15,23,42,0.07)] dark:border-white/[0.07] dark:text-white/58 dark:shadow-[0_3px_7px_rgba(0,0,0,0.18)]">
                                                        <Film className="h-4 w-4" />
                                                      </span>
                                                    ) : inputItem ? (
                                                      <span className="flex h-full w-full items-center justify-center rounded-[14px] border border-stone-200/32 text-stone-400 shadow-[0_2px_5px_rgba(15,23,42,0.07)] dark:border-white/[0.07] dark:text-white/58 dark:shadow-[0_3px_7px_rgba(0,0,0,0.18)]">
                                                        <Type className="h-4 w-4" />
                                                      </span>
                                                    ) : (
                                                      <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 rounded-[14px] border border-dashed border-stone-300/48 px-1 text-center text-[9px] font-black leading-[11px] text-stone-400 transition-colors group-hover/reference:border-stone-400/70 group-hover/reference:text-stone-500 dark:border-white/[0.12] dark:text-white/34 dark:group-hover/reference:border-white/24 dark:group-hover/reference:text-white/52">
                                                        <span className="text-[10px] leading-none">+</span>
                                                        {isAudioReferenceSlot ? <Music className="h-3 w-3" /> : isVideoReferenceSlot ? <Film className="h-3 w-3" /> : null}
                                                        <span>{slotLabel}</span>
                                                      </span>
                                                    )}
                                                    <span className="pointer-events-none absolute left-1 top-1 z-10 flex h-4 min-w-4 items-center justify-center rounded bg-black/68 px-1 text-[9px] font-black leading-none text-white shadow-sm">
                                                      {inputIndex + 1}
                                                    </span>
                                                    {isCanvasVeoIngredientMode && inputItem && (
                                                      <span className="pointer-events-none absolute inset-x-1 bottom-1 z-10 rounded bg-black/68 px-1 py-0.5 text-center text-[8px] font-black leading-[10px] text-white shadow-sm">
                                                        {slotLabel}
                                                      </span>
                                                    )}
                                                    {inputItem && (
                                                      <span
                                                        data-no-drag="true"
                                                        role="button"
                                                        tabIndex={0}
                                                        aria-label={`移除${slotLabel}`}
                                                        title={`移除${slotLabel}`}
                                                        className="absolute right-1 top-1 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-black/85 text-white opacity-0 shadow-sm transition-[opacity,background-color] hover:bg-black focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 group-hover/reference-thumbnail:opacity-100"
                                                        onPointerDown={(event) => {
                                                          event.preventDefault();
                                                          event.stopPropagation();
                                                        }}
                                                        onMouseDown={(event) => event.stopPropagation()}
                                                        onClick={(event) => {
                                                          event.preventDefault();
                                                          event.stopPropagation();
                                                          disconnectCanvasInput(canvasItem.id, inputItem.disconnectId);
                                                        }}
                                                        onKeyDown={(event) => {
                                                          if (event.key !== 'Enter' && event.key !== ' ') return;
                                                          event.preventDefault();
                                                          event.stopPropagation();
                                                          disconnectCanvasInput(canvasItem.id, inputItem.disconnectId);
                                                        }}
                                                      >
                                                        <X className="h-3 w-3" strokeWidth={2.5} />
                                                      </span>
                                                    )}
                                                  </span>
                                                );
                                              })}
                                              {canvasVideoReferenceOverflowCount > 0 && (
                                                <span
                                                  className="flex h-[49px] w-12 shrink-0 items-center justify-center rounded-[11px] bg-red-500/10 text-[11px] font-black text-red-600 ring-1 ring-red-500/20 dark:text-red-200"
                                                  title={`${canvasVideoReferenceOverflowCount} 个连接不适用于当前模型，生成时不会发送`}
                                                >
                                                  +{canvasVideoReferenceOverflowCount}
                                                </span>
                                              )}
                                            </CanvasHorizontalRail>
                                          ) : canvasItem.ai?.type === 'image-generator' || (isCanvasWorkflowItem && canvasWorkflowAllowsImages) ? (
                                            <CanvasHorizontalRail className="max-w-full">
                                              {canvasInputPreviewItems.map((inputItem, inputIndex) => {
                                                const inputPreviewSource = getCanvasReferencePreviewSource(inputItem);
                                                const inputSourceNode = inputItem.node;
                                                const actualInputIndex = Math.max(0, (canvasItem.inputs || []).indexOf(inputItem.disconnectId));
                                                const isImageReference = isCanvasImageReferencePreviewItem(inputItem);
                                                const canSortReference = isImageReference && !inputItem.bufferItem;
                                                const isDraggingReference = canvasReferenceDragState?.targetId === canvasItem.id
                                                  && canvasReferenceDragState.inputId === inputItem.disconnectId;
                                                const isReferenceDropTarget = canvasReferenceDragState?.targetId === canvasItem.id
                                                  && canvasReferenceDragState.overInputId === inputItem.disconnectId;
                                                return (
                                                  <span
                                                    key={inputItem.id}
                                                    data-canvas-reference-target-id={canvasItem.id}
                                                    data-canvas-reference-input-id={inputItem.disconnectId}
                                                    className={`group/reference-thumbnail relative flex h-[49px] w-[49px] shrink-0 items-center justify-center rounded-[14px] text-stone-400 transition-[transform,opacity,box-shadow] dark:text-white/60 ${
                                                      isDraggingReference ? 'z-20 scale-[0.94] opacity-25' : 'hover:z-10 hover:scale-[1.03]'
                                                    } ${isReferenceDropTarget && !isDraggingReference ? 'ring-2 ring-blue-500/75 ring-offset-1 ring-offset-white dark:ring-blue-300/75 dark:ring-offset-stone-900' : ''}`}
                                                  >
                                                    <button
                                                      data-no-drag="true"
                                                      type="button"
                                                      className={`relative isolate flex h-full w-full touch-none items-center justify-center overflow-hidden rounded-[14px] bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/80 dark:bg-stone-900 ${
                                                        canSortReference ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                                                      }`}
                                                      aria-label={isImageReference ? `替换参考图 ${inputIndex + 1}` : `管理输入 ${inputIndex + 1}`}
                                                      title={canSortReference ? '点击替换图片；长按后拖动调整顺序' : isImageReference ? '点击替换图片' : '点击管理输入'}
                                                      onPointerDown={(event) => {
                                                        if (!canSortReference) {
                                                          event.stopPropagation();
                                                          return;
                                                        }
                                                        startCanvasReferenceLongPress(
                                                          event,
                                                          canvasItem.id,
                                                          inputItem.disconnectId,
                                                          inputPreviewSource,
                                                          inputIndex,
                                                          inputSourceNode.rotation || 0,
                                                        );
                                                      }}
                                                      onClick={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        const suppressed = canvasReferenceSuppressClickRef.current;
                                                        if (suppressed?.targetId === canvasItem.id) {
                                                          canvasReferenceSuppressClickRef.current = null;
                                                          return;
                                                        }
                                                        if (isImageReference) {
                                                          openCanvasReferenceReplaceMenu(
                                                            canvasItem.id,
                                                            inputItem.disconnectId,
                                                            actualInputIndex,
                                                          );
                                                        } else {
                                                          openCanvasReferenceAddMenu(canvasItem.id);
                                                        }
                                                      }}
                                                    >
                                                      {inputPreviewSource ? (
                                                        <img
                                                          src={inputPreviewSource}
                                                          alt=""
                                                          loading="lazy"
                                                          decoding="async"
                                                          className="block h-full w-full rounded-[14px] object-cover shadow-[0_2px_5px_rgba(15,23,42,0.07)] dark:shadow-[0_3px_7px_rgba(0,0,0,0.18)]"
                                                          style={inputSourceNode.rotation ? {
                                                            transform: `rotate(${inputSourceNode.rotation}deg)`,
                                                          } : undefined}
                                                          draggable={false}
                                                          onDragStart={preventCanvasNativeDrag}
                                                        />
                                                      ) : isCanvasAiGeneratorType(inputSourceNode.ai?.type) || inputSourceNode.ai?.type === 'workflow' ? (
                                                        <span className="flex h-full w-full items-center justify-center border border-stone-200/32 shadow-[0_2px_5px_rgba(15,23,42,0.07)] dark:border-white/[0.07] dark:shadow-[0_3px_7px_rgba(0,0,0,0.18)]">
                                                          <Sparkles className="h-4 w-4" />
                                                        </span>
                                                      ) : inputSourceNode.item.type === 'file' ? (
                                                        <span className="flex h-full w-full items-center justify-center border border-stone-200/32 shadow-[0_2px_5px_rgba(15,23,42,0.07)] dark:border-white/[0.07] dark:shadow-[0_3px_7px_rgba(0,0,0,0.18)]">
                                                          <FileIcon className="h-4 w-4" />
                                                        </span>
                                                      ) : (
                                                        <span className="flex h-full w-full items-center justify-center border border-stone-200/32 shadow-[0_2px_5px_rgba(15,23,42,0.07)] dark:border-white/[0.07] dark:shadow-[0_3px_7px_rgba(0,0,0,0.18)]">
                                                          <Type className="h-4 w-4" />
                                                        </span>
                                                      )}
                                                      <span className="pointer-events-none absolute left-1 top-1 z-10 flex h-4 min-w-4 items-center justify-center rounded bg-black/68 px-1 text-[9px] font-black leading-none text-white shadow-sm">
                                                        {inputIndex + 1}
                                                      </span>
                                                      <span className="pointer-events-none absolute inset-0 rounded-[14px] ring-1 ring-inset ring-stone-950/10 dark:ring-white/10" />
                                                    </button>
                                                    <button
                                                      data-no-drag="true"
                                                      type="button"
                                                      aria-label={`移除参考图 ${inputIndex + 1}`}
                                                      title={`移除参考图 ${inputIndex + 1}`}
                                                      className="absolute right-0.5 top-0.5 z-30 flex h-5 w-5 items-center justify-center rounded-full border border-white/30 bg-stone-950/82 text-white opacity-0 shadow-sm backdrop-blur transition-[opacity,background-color,transform] hover:scale-105 hover:bg-red-500 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 group-hover/reference-thumbnail:opacity-100"
                                                      onPointerDown={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                      }}
                                                      onClick={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        disconnectCanvasInput(canvasItem.id, inputItem.disconnectId);
                                                      }}
                                                    >
                                                      <X className="h-3 w-3" strokeWidth={2.5} />
                                                    </button>
                                                  </span>
                                                );
                                              })}
                                              <button
                                                data-no-drag="true"
                                                type="button"
                                                className="group/add-reference flex h-[49px] w-[49px] shrink-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[14px] border border-dashed border-stone-300/65 bg-white/42 text-[8px] font-black text-stone-400 transition-[border-color,color,background-color,transform] hover:scale-[1.03] hover:border-blue-400/75 hover:bg-blue-50/70 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70 dark:border-white/[0.16] dark:bg-white/[0.025] dark:text-white/42 dark:hover:border-blue-300/60 dark:hover:bg-blue-400/10 dark:hover:text-blue-200"
                                                aria-label="添加参考图"
                                                title="添加参考图"
                                                onPointerDown={(event) => event.stopPropagation()}
                                                onClick={(event) => {
                                                  event.preventDefault();
                                                  event.stopPropagation();
                                                  openCanvasReferenceAddMenu(canvasItem.id);
                                                }}
                                              >
                                                <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
                                                <span>参考图</span>
                                              </button>
                                            </CanvasHorizontalRail>
                                          ) : canvasInputPreviewItems.length > 0 ? (
                                            <span className="flex h-[58px] max-w-full items-center gap-1.5 overflow-hidden">
                                              {canvasInputPreviewItems.slice(0, 6).map((inputItem, inputIndex) => {
                                                const inputPreviewSource = getCanvasReferencePreviewSource(inputItem);
                                                const inputSourceNode = inputItem.node;
                                                return (
                                                  <span
                                                    key={inputItem.id}
                                                    className="group/reference-thumbnail relative flex h-14 w-14 shrink-0 items-center justify-center overflow-visible text-stone-400 transition-transform hover:z-10 hover:scale-[1.03] dark:text-white/60"
                                                    style={{
                                                      marginLeft: inputIndex > 0 ? -10 : 0,
                                                    }}
                                                    aria-label="双击移除输入"
                                                    onPointerDown={(event) => event.stopPropagation()}
                                                    onMouseDown={(event) => event.stopPropagation()}
                                                    onDoubleClick={(event) => {
                                                      event.preventDefault();
                                                      event.stopPropagation();
                                                      disconnectCanvasInput(canvasItem.id, inputItem.disconnectId);
                                                    }}
                                                  >
                                                    {inputPreviewSource ? (
                                                      <img
                                                        src={inputPreviewSource}
                                                        alt=""
                                                        loading="lazy"
                                                        decoding="async"
                                                        className="h-full w-full rounded-[14px] border border-stone-200/32 object-cover mix-blend-multiply shadow-[0_2px_5px_rgba(15,23,42,0.07)] dark:border-white/[0.07] dark:mix-blend-normal dark:shadow-[0_3px_7px_rgba(0,0,0,0.18)]"
                                                        draggable={false}
                                                        onDragStart={preventCanvasNativeDrag}
                                                      />
                                                    ) : isCanvasAiGeneratorType(inputSourceNode.ai?.type) || inputSourceNode.ai?.type === 'workflow' ? (
                                                      <span className="flex h-full w-full items-center justify-center rounded-[14px] border border-stone-200/32 text-stone-400 shadow-[0_2px_5px_rgba(15,23,42,0.07)] dark:border-white/[0.07] dark:text-white/58 dark:shadow-[0_3px_7px_rgba(0,0,0,0.18)]">
                                                        {getCanvasAiMediaType(inputSourceNode.ai) === 'video' ? <Film className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                                                      </span>
                                                    ) : inputSourceNode.item.type === 'file' ? (
                                                      <span className="flex h-full w-full items-center justify-center rounded-[14px] border border-stone-200/32 text-stone-400 shadow-[0_2px_5px_rgba(15,23,42,0.07)] dark:border-white/[0.07] dark:text-white/58 dark:shadow-[0_3px_7px_rgba(0,0,0,0.18)]">
                                                        <FileIcon className="h-4 w-4" />
                                                      </span>
                                                    ) : (
                                                      <span className="flex h-full w-full items-center justify-center rounded-[14px] border border-stone-200/32 text-stone-400 shadow-[0_2px_5px_rgba(15,23,42,0.07)] dark:border-white/[0.07] dark:text-white/58 dark:shadow-[0_3px_7px_rgba(0,0,0,0.18)]">
                                                        <Type className="h-4 w-4" />
                                                      </span>
                                                    )}
                                                    <span className="pointer-events-none absolute left-1 top-1 z-10 flex h-4 min-w-4 items-center justify-center rounded bg-black/68 px-1 text-[9px] font-black leading-none text-white shadow-sm">
                                                      {inputIndex + 1}
                                                    </span>
                                                    <span
                                                      data-no-drag="true"
                                                      role="button"
                                                      tabIndex={0}
                                                      aria-label={`移除参考图 ${inputIndex + 1}`}
                                                      title={`移除参考图 ${inputIndex + 1}`}
                                                      className="absolute right-1 top-1 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-black/85 text-white opacity-0 shadow-sm transition-[opacity,background-color] hover:bg-black focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 group-hover/reference-thumbnail:opacity-100"
                                                      onPointerDown={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                      }}
                                                      onMouseDown={(event) => event.stopPropagation()}
                                                      onClick={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        disconnectCanvasInput(canvasItem.id, inputItem.disconnectId);
                                                      }}
                                                      onKeyDown={(event) => {
                                                        if (event.key !== 'Enter' && event.key !== ' ') return;
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        disconnectCanvasInput(canvasItem.id, inputItem.disconnectId);
                                                      }}
                                                    >
                                                      <X className="h-3 w-3" strokeWidth={2.5} />
                                                    </span>
                                                  </span>
                                                );
                                              })}
                                              {canvasVideoReferenceOverflowCount > 0 && (
                                                <span
                                                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-red-500/10 text-[11px] font-black text-red-600 ring-1 ring-red-500/20 dark:text-red-200"
                                                  title={`${canvasVideoReferenceOverflowCount} 个连接不适用于当前模型，生成时不会发送`}
                                                >
                                                  +{canvasVideoReferenceOverflowCount}
                                                </span>
                                              )}
                                            </span>
                                          ) : (
                                            <span className="flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-[14px] border border-dashed border-stone-300/48 text-[9px] font-black text-stone-400 transition-colors group-hover/reference:border-stone-400/70 group-hover/reference:text-stone-500 dark:border-white/[0.12] dark:text-white/34 dark:group-hover/reference:border-white/24 dark:group-hover/reference:text-white/52">
                                              {isCanvasWorkflowItem && !canvasWorkflowAllowsImages && canvasWorkflowAllowsFiles
                                                ? <FileIcon className="h-3.5 w-3.5 shrink-0" />
                                                : <ImageIcon className="h-3.5 w-3.5 shrink-0" />}
                                              <span>{isCanvasWorkflowItem ? '输入素材' : '参考图'}</span>
                                            </span>
                                          )}
                                        </div>
                                        )
                                        )}
                                        <div className="ml-auto flex min-w-[132px] flex-col items-end gap-1.5 pt-0.5">
                                          <span className="max-w-[250px] truncate text-[11px] font-black text-stone-500 dark:text-white/58">
                                            {isCanvasWorkflowItem ? canvasItem.ai?.presetLabel || '工作流模块' : canvasItem.ai?.presetLabel || getCanvasAiNodeTitle(canvasItem.ai)}
                                          </span>
                                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black ${
                                            canvasItem.ai?.status === 'working'
                                              ? 'bg-stone-900/[0.08] text-stone-700 dark:bg-white/12 dark:text-white'
                                              : canvasItem.ai?.status === 'error'
                                                ? 'bg-red-500/10 text-red-600 dark:bg-red-500/18 dark:text-red-100'
                                                : canvasItem.ai?.status === 'success'
                                                  ? 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/16 dark:text-emerald-100'
                                                  : 'bg-stone-900/[0.045] text-stone-400 dark:bg-white/[0.07] dark:text-white/42'
                                          }`}>
                                            {canvasItem.ai?.status === 'working'
                                              ? canvasAiWorkingStatusText
                                              : canvasItem.ai?.status === 'error'
                                                ? '失败'
                                                : canvasItem.ai?.status === 'success'
                                                  ? '完成'
                                                  : '待机'}
                                          </span>
                                        </div>
                                      </div>
                                      {isCanvasWorkflowItem && canvasWorkflowInternalSlots.length > 0 && (
                                        <div
                                          data-no-drag="true"
                                          className="flex shrink-0 flex-col gap-2 rounded-[18px] border border-stone-950/[0.045] bg-stone-950/[0.025] p-2.5 dark:border-white/[0.06] dark:bg-white/[0.025]"
                                          onPointerDown={(event) => event.stopPropagation()}
                                        >
                                          <div className="flex items-center justify-between px-0.5 text-[10px] font-black text-stone-500 dark:text-white/48">
                                            <span>内部图片槽位</span>
                                            <span>{canvasWorkflowInternalSlots.length}</span>
                                          </div>
                                          {canvasWorkflowInternalSlots.map(slotNode => {
                                            const slot = slotNode.internalSlot!;
                                            const binding = getCanvasWorkflowInternalSlotBinding(
                                              canvasItem.ai?.workflowRuntime,
                                              slot,
                                            );
                                            const assets = binding.assets;
                                            const maxItems = slot.multiple
                                              ? Math.max(1, Number(slot.maxItems) || 12)
                                              : 1;
                                            return (
                                              <div
                                                key={slot.id}
                                                className="group/workflow-slot flex min-h-[66px] items-center gap-2 rounded-[14px] bg-white/72 px-2.5 py-2 ring-1 ring-stone-950/[0.045] transition-colors hover:bg-white dark:bg-black/16 dark:ring-white/[0.06] dark:hover:bg-white/[0.055]"
                                                title={slot.description || slot.emptyHint || slot.label}
                                                onDragEnter={(event) => {
                                                  event.preventDefault();
                                                  event.stopPropagation();
                                                  event.dataTransfer.dropEffect = 'copy';
                                                }}
                                                onDragOver={(event) => {
                                                  event.preventDefault();
                                                  event.stopPropagation();
                                                  event.dataTransfer.dropEffect = 'copy';
                                                }}
                                                onDrop={(event) => void handleCanvasWorkflowSlotDrop(
                                                  event,
                                                  canvasItem.id,
                                                  slot.id,
                                                )}
                                              >
                                                <button
                                                  type="button"
                                                  data-no-drag="true"
                                                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                                  onPointerDown={(event) => event.stopPropagation()}
                                                  onClick={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    assignSelectedImagesToCanvasWorkflowSlot(canvasItem.id, slot.id);
                                                  }}
                                                  title="使用画布或灵感抽屉当前选中的图片"
                                                >
                                                  <span className="flex h-11 min-w-11 max-w-[188px] items-center gap-1 overflow-x-auto rounded-[10px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                                    {assets.length > 0 ? assets.map((asset, assetIndex) => {
                                                      const source = asset.thumbnail
                                                        || asset.url
                                                        || (asset.path ? convertFileSrc(asset.path) : '')
                                                        || asset.originalUrl
                                                        || '';
                                                      return source ? (
                                                        <span
                                                          key={`${slot.id}:${assetIndex}:${asset.updatedAt}`}
                                                          draggable={slot.multiple}
                                                          className={`group/slot-asset relative h-11 w-11 shrink-0 overflow-hidden rounded-[10px] bg-stone-100 dark:bg-white/[0.06] ${slot.multiple ? 'cursor-grab active:cursor-grabbing' : ''}`}
                                                          onDragStart={(dragEvent) => {
                                                            if (!slot.multiple) return;
                                                            dragEvent.stopPropagation();
                                                            dragEvent.dataTransfer.effectAllowed = 'move';
                                                            dragEvent.dataTransfer.setData(
                                                              WORKFLOW_SLOT_ASSET_DRAG_MIME,
                                                              String(assetIndex),
                                                            );
                                                          }}
                                                          onDragOver={(dragEvent) => {
                                                            if (!slot.multiple) return;
                                                            dragEvent.preventDefault();
                                                            dragEvent.stopPropagation();
                                                            dragEvent.dataTransfer.dropEffect = 'move';
                                                          }}
                                                          onDrop={(dropEvent) => {
                                                            if (!slot.multiple) return;
                                                            const rawIndex = dropEvent.dataTransfer.getData(WORKFLOW_SLOT_ASSET_DRAG_MIME);
                                                            if (!rawIndex) return;
                                                            dropEvent.preventDefault();
                                                            dropEvent.stopPropagation();
                                                            updateCollapsedCanvasWorkflowSlot(
                                                              canvasItem.id,
                                                              slot.id,
                                                              (module: CanvasImageItem, currentSlot: CanvasWorkflowInternalSlot) => reorderCanvasWorkflowInternalSlotAssets({
                                                                module,
                                                                slot: currentSlot,
                                                                fromIndex: Number(rawIndex),
                                                                toIndex: assetIndex,
                                                              }),
                                                              '调整工作流槽位顺序',
                                                            );
                                                          }}
                                                        >
                                                          <img
                                                            src={source}
                                                            alt=""
                                                            loading="lazy"
                                                            decoding="async"
                                                            className="h-full w-full object-cover"
                                                            draggable={false}
                                                            onDragStart={preventCanvasNativeDrag}
                                                          />
                                                          {slot.multiple && (
                                                            <span
                                                              role="button"
                                                              tabIndex={0}
                                                              className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/85 text-white opacity-0 transition-opacity group-hover/slot-asset:opacity-100"
                                                              title="移除这张图片"
                                                              onPointerDown={(innerEvent) => {
                                                                innerEvent.preventDefault();
                                                                innerEvent.stopPropagation();
                                                              }}
                                                              onClick={(innerEvent) => {
                                                                innerEvent.preventDefault();
                                                                innerEvent.stopPropagation();
                                                                updateCollapsedCanvasWorkflowSlot(
                                                                  canvasItem.id,
                                                                  slot.id,
                                                                  (module: CanvasImageItem, currentSlot: CanvasWorkflowInternalSlot) => removeCanvasWorkflowInternalSlotAsset({
                                                                    module,
                                                                    slot: currentSlot,
                                                                    index: assetIndex,
                                                                  }),
                                                                  '移除工作流槽位图片',
                                                                );
                                                              }}
                                                            >
                                                              <X className="h-2.5 w-2.5" />
                                                            </span>
                                                          )}
                                                        </span>
                                                      ) : null;
                                                    }) : (
                                                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border border-dashed border-stone-300 text-stone-400 dark:border-white/16 dark:text-white/34">
                                                        <ImageIcon className="h-4 w-4" />
                                                      </span>
                                                    )}
                                                  </span>
                                                  <span className="min-w-0 flex-1">
                                                    <span className="flex items-center gap-1 text-[11px] font-black text-stone-700 dark:text-white/76">
                                                      <span className="truncate">{slot.label}</span>
                                                      {slot.required && <span className="text-red-500">*</span>}
                                                    </span>
                                                    {slot.description && (
                                                      <span className="mt-0.5 block truncate text-[9px] font-semibold text-stone-500 dark:text-white/46">
                                                        {slot.description}
                                                      </span>
                                                    )}
                                                    <span className="mt-0.5 block truncate text-[9px] font-semibold text-stone-400 dark:text-white/36">
                                                      {assets.length > 0
                                                        ? slot.multiple
                                                          ? `${assets.length} / ${maxItems} 张`
                                                          : assets[0]?.name || '已设置，点击替换'
                                                        : slot.emptyHint || '点击使用当前选中图片'}
                                                    </span>
                                                  </span>
                                                </button>
                                                <div className="flex shrink-0 items-center gap-1">
                                                  {slot.multiple && assets.length > 1 && (
                                                    <>
                                                      <button
                                                        type="button"
                                                        data-no-drag="true"
                                                        className="flex h-7 w-7 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:text-white/38 dark:hover:bg-white/10 dark:hover:text-white/72"
                                                        title="将最后一张向前移动"
                                                        onPointerDown={(event) => event.stopPropagation()}
                                                        onClick={(event) => {
                                                          event.preventDefault();
                                                          event.stopPropagation();
                                                          updateCollapsedCanvasWorkflowSlot(
                                                            canvasItem.id,
                                                            slot.id,
                                                            (module: CanvasImageItem, currentSlot: CanvasWorkflowInternalSlot) => reorderCanvasWorkflowInternalSlotAssets({
                                                              module,
                                                              slot: currentSlot,
                                                              fromIndex: assets.length - 1,
                                                              toIndex: assets.length - 2,
                                                            }),
                                                            '调整工作流槽位顺序',
                                                          );
                                                        }}
                                                      >
                                                        <ChevronLeft className="h-3.5 w-3.5" />
                                                      </button>
                                                    </>
                                                  )}
                                                  <button
                                                    type="button"
                                                    data-no-drag="true"
                                                    className="flex h-7 w-7 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-emerald-600 dark:text-white/38 dark:hover:bg-white/10 dark:hover:text-emerald-300"
                                                    title={slot.multiple ? '从本地选择图片' : '从本地替换图片'}
                                                    onPointerDown={(event) => event.stopPropagation()}
                                                    onClick={(event) => {
                                                      event.preventDefault();
                                                      event.stopPropagation();
                                                      chooseLocalImagesForCanvasWorkflowSlot(canvasItem.id, slot.id);
                                                    }}
                                                  >
                                                    <Upload className="h-3.5 w-3.5" />
                                                  </button>
                                                  {slot.clearable !== false && assets.length > 0 && (
                                                    <button
                                                      type="button"
                                                      data-no-drag="true"
                                                      className="flex h-7 w-7 items-center justify-center rounded-full text-stone-400 hover:bg-red-50 hover:text-red-600 dark:text-white/38 dark:hover:bg-red-500/12 dark:hover:text-red-300"
                                                      title="清空槽位"
                                                      onPointerDown={(event) => event.stopPropagation()}
                                                      onClick={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        updateCollapsedCanvasWorkflowSlot(
                                                          canvasItem.id,
                                                          slot.id,
                                                          (module: CanvasImageItem, currentSlot: CanvasWorkflowInternalSlot) => clearCanvasWorkflowInternalSlot({
                                                            module,
                                                            slot: currentSlot,
                                                          }),
                                                          '清空工作流槽位',
                                                        );
                                                      }}
                                                    >
                                                      <X className="h-3.5 w-3.5" />
                                                    </button>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                      {!showCanvasAiOutputPreview && (
                                        <div className="flex h-[220px] shrink-0 items-center justify-center">
                                          <button
                                            data-no-drag="true"
                                            type="button"
                                            onPointerDown={(event) => event.stopPropagation()}
                                            onClick={(event) => {
                                              event.preventDefault();
                                              event.stopPropagation();
                                              updateCanvasSelection([canvasItem.id]);
                                            }}
                                            className="flex h-full w-full items-center justify-center rounded-[20px] border border-dashed border-stone-300/46 bg-white/[0.28] text-[11px] font-black text-stone-400 transition-colors hover:border-stone-400/64 hover:bg-white/[0.42] hover:text-stone-500 dark:border-white/[0.11] dark:bg-white/[0.025] dark:text-white/30 dark:hover:border-white/22 dark:hover:bg-white/[0.045] dark:hover:text-white/48"
                                            title={canvasAiMediaType === 'video' ? '生成后视频会显示在这里' : '生成后图片会显示在这里'}
                                          >
                                            <span className="flex flex-col items-center gap-2">
                                              {isCanvasWorkflowItem ? <Link className="h-5 w-5" /> : canvasAiMediaType === 'video' ? <Film className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
                                              <span>{isCanvasWorkflowItem ? '工作流输出' : canvasAiMediaType === 'video' ? '生成视频' : '生成图'}</span>
                                              {canvasItem.ai?.status === 'working' && (
                                                <span className="font-mono text-[10px] text-stone-400 dark:text-white/42">
                                                  {canvasAiWorkingElapsedText}
                                                </span>
                                              )}
                                            </span>
                                          </button>
                                        </div>
                                      )}
                                      {showCanvasAiOutputPreview && canvasAiOutputTileLayout && (
                                        <div className="rounded-[18px] border border-transparent bg-stone-950/[0.035] p-2 dark:bg-white/[0.035]">
                                          <div className="mb-2 flex items-center justify-between text-[10px] font-black text-stone-400 dark:text-white/38">
                                            <span>{isCanvasWorkflowAllOutputMode ? '全部节点输出' : '输出'} {canvasAiOutputs.length}</span>
                                            <div className="flex items-center gap-1.5">
                                              {isCanvasWorkflowItem && (
                                                <button
                                                  data-no-drag="true"
                                                  type="button"
                                                  onPointerDown={(event) => event.stopPropagation()}
                                                  onClick={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    setCanvasWorkflowOutputMode(canvasItem.id, isCanvasWorkflowAllOutputMode ? 'final' : 'all');
                                                  }}
                                                  className="rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-black text-stone-500 transition-colors hover:bg-white hover:text-stone-900 dark:bg-white/10 dark:text-white/58 dark:hover:bg-white/16 dark:hover:text-white"
                                                  title={isCanvasWorkflowAllOutputMode ? '只显示最终输出节点' : '显示所有中间节点和最终节点的输出'}
                                                >
                                                  {isCanvasWorkflowAllOutputMode ? '最终输出' : '全部节点'}
                                                </button>
                                              )}
                                              {canvasAiOutputs.length > CANVAS_AI_COLLAPSED_OUTPUT_PREVIEW_LIMIT && (
                                                <button
                                                  data-no-drag="true"
                                                  type="button"
                                                  onPointerDown={(event) => event.stopPropagation()}
                                                  onClick={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    toggleCanvasAiOutputsExpanded(canvasItem.id);
                                                  }}
                                                  className="rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-black text-stone-500 transition-colors hover:bg-white hover:text-stone-900 dark:bg-white/10 dark:text-white/58 dark:hover:bg-white/16 dark:hover:text-white"
                                                  title={isCanvasAiOutputsExpanded ? '收起输出预览' : `展开其余 ${canvasAiHiddenOutputCount} 个输出`}
                                                >
                                                  {isCanvasAiOutputsExpanded ? '收起' : `展开全部 +${canvasAiHiddenOutputCount}`}
                                                </button>
                                              )}
                                              <span>{canvasItem.ai?.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO}</span>
                                            </div>
                                          </div>
                                          <div
                                            className="grid justify-center gap-2"
                                            style={{
                                              gridTemplateColumns: `repeat(${canvasAiOutputTileLayout.columns}, ${canvasAiOutputTileLayout.tileWidth}px)`,
                                            }}
                                          >
                                            {canvasAiVisibleOutputs.map((output, outputIndex) => {
                                              const outputSource = getCanvasAiOutputDisplaySource(output);
                                              const outputPreviewSource = getCanvasAiOutputThumbnailSource(output);
                                              const outputPreviewItem = createCanvasAiOutputBufferItem(canvasItem, output, outputIndex);
                                              const outputGalleryIndex = outputPreviewItem
                                                ? canvasAiImagePreviewGallery.findIndex(item => item.id === outputPreviewItem.id)
                                                : -1;
                                              const isOutputError = output.status === 'error';
                                              const isOutputWorking = output.status === 'working';
                                              const outputMediaType = output.mediaType || canvasAiMediaType;
                                              const isOutputImageCaching = outputMediaType === 'image' && output.cacheStatus === 'pending';
                                              const isOutputImagePreviewing = isOutputImageCaching && !!output.path;
                                              const didOutputImageCacheFail = outputMediaType === 'image' && output.cacheStatus === 'failed';
                                              const outputLabel = output.nodeLabel || output.name || (isCanvasWorkflowItem ? '工作流输出' : canvasItem.ai?.presetLabel || canvasItem.item.name || `输出 ${outputIndex + 1}`);
                                              const outputWorkingElapsedText = isOutputWorking
                                                ? formatCanvasWorkingElapsed(output.generatedAt || canvasItem.ai?.generatedAt, canvasWorkingTimerTick)
                                                : '';
                                              const canRetryWorkflowOutput = outputMediaType === 'image' && (
                                                isCanvasWorkflowItem
                                                || (
                                                  canvasItem.ai?.type === 'image-generator'
                                                  && !!canvasExpandedWorkflowGroup
                                                )
                                              );
                                              return (
                                                <div
                                                  key={output.id || `${canvasItem.id}-output-${outputIndex}`}
                                                  data-no-drag="true"
                                                  role="button"
                                                  tabIndex={0}
                                                  onPointerDown={(event) => event.stopPropagation()}
                                                  onClick={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    if (!outputSource) return;
                                                    if (outputMediaType === 'video') openSelectedVideoPreview({ url: outputSource, path: output.path || outputSource }, { fromCanvas: true });
                                                    else openSelectedImagePreview(outputPreviewItem || outputSource, {
                                                      fromCanvas: true,
                                                      galleryItems: canvasAiImagePreviewGallery,
                                                      galleryIndex: outputGalleryIndex >= 0 ? outputGalleryIndex : undefined,
                                                    });
                                                  }}
                                                  onKeyDown={(event) => {
                                                    if (event.key !== 'Enter' && event.key !== ' ') return;
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    if (!outputSource) return;
                                                    if (outputMediaType === 'video') openSelectedVideoPreview({ url: outputSource, path: output.path || outputSource }, { fromCanvas: true });
                                                    else openSelectedImagePreview(outputPreviewItem || outputSource, {
                                                      fromCanvas: true,
                                                      galleryItems: canvasAiImagePreviewGallery,
                                                      galleryIndex: outputGalleryIndex >= 0 ? outputGalleryIndex : undefined,
                                                    });
                                                  }}
                                                  className={`group/output-tile relative overflow-hidden rounded-[14px] border text-center transition-colors ${
                                                    isOutputError
                                                      ? 'border-red-300/20 bg-red-500/12 text-red-100'
                                                      : 'border-white/60 bg-white/58 text-stone-500 hover:bg-white/82 dark:border-white/[0.08] dark:bg-black/16 dark:text-white/56 dark:hover:bg-white/[0.06]'
                                                  }`}
                                                  style={{
                                                    width: canvasAiOutputTileLayout.tileWidth,
                                                    height: canvasAiOutputTileLayout.tileHeight,
                                                  }}
                                                  title={outputLabel}
                                                  >
                                                  <span className="pointer-events-none absolute left-2 top-2 z-10 max-w-[calc(100%-112px)] truncate rounded-full bg-white/86 px-2 py-0.5 text-[9px] font-black text-stone-700 shadow-sm ring-1 ring-black/[0.04] backdrop-blur-md dark:bg-stone-950/74 dark:text-white/82 dark:ring-white/[0.08]">
                                                    {outputLabel}
                                                  </span>
                                                  {canRetryWorkflowOutput && !isOutputWorking && (
                                                    <button
                                                      data-no-drag="true"
                                                      type="button"
                                                      className="absolute bottom-2 right-2 z-30 flex h-8 w-8 items-center justify-center rounded-full bg-black/82 text-white opacity-0 shadow-md ring-1 ring-white/16 backdrop-blur-md transition-all hover:scale-105 hover:bg-black focus:opacity-100 group-hover/output-tile:opacity-100"
                                                      title={`只重新生成「${outputLabel}」这张图片`}
                                                      onPointerDown={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                      }}
                                                      onClick={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        void retryCanvasWorkflowOutput(canvasItem.id, outputIndex);
                                                      }}
                                                    >
                                                      <RefreshCw className="h-3.5 w-3.5" />
                                                    </button>
                                                  )}
                                                  {outputSource && !isOutputError && (
                                                    <div className="absolute right-2 top-2 z-20 flex items-center gap-1 opacity-0 transition-opacity group-hover/output-tile:opacity-100">
                                                      {outputMediaType === 'image' && (
                                                        <button
                                                          data-no-drag="true"
                                                          type="button"
                                                          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/88 text-stone-500 shadow-sm ring-1 ring-black/[0.04] backdrop-blur-md transition-colors hover:bg-white hover:text-blue-700 dark:bg-stone-950/76 dark:text-white/70 dark:ring-white/[0.08] dark:hover:bg-stone-950 dark:hover:text-blue-200"
                                                          title="画笔标记"
                                                          onPointerDown={(event) => {
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                            void openCanvasBrushEditorFromSource({
                                                              targetId: canvasItem.id,
                                                              source: outputSource,
                                                              name: outputLabel,
                                                              x: canvasItem.x + ((outputIndex % Math.max(1, canvasAiOutputTileLayout.columns)) * (canvasAiOutputTileLayout.tileWidth + 8)) * (canvasAiNodeScale || 1),
                                                              y: canvasItem.y + 92,
                                                              nodeWidth: canvasAiOutputTileLayout.tileWidth * (canvasAiNodeScale || 1),
                                                              nodeHeight: canvasAiOutputTileLayout.tileHeight * (canvasAiNodeScale || 1),
                                                            });
                                                          }}
                                                          onClick={(event) => {
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                          }}
                                                        >
                                                          <Brush className="h-3.5 w-3.5" />
                                                        </button>
                                                      )}
                                                      <button
                                                        data-no-drag="true"
                                                        type="button"
                                                        className="flex h-7 w-7 items-center justify-center rounded-full bg-white/88 text-stone-500 shadow-sm ring-1 ring-black/[0.04] backdrop-blur-md transition-colors hover:bg-white hover:text-emerald-700 dark:bg-stone-950/76 dark:text-white/70 dark:ring-white/[0.08] dark:hover:bg-stone-950 dark:hover:text-emerald-200"
                                                        title={outputMediaType === 'video' ? '复制这条视频到画布' : '复制这张图到画布'}
                                                        onPointerDown={(event) => event.stopPropagation()}
                                                        onClick={(event) => {
                                                          event.preventDefault();
                                                          event.stopPropagation();
                                                          void copyCanvasAiOutputToCanvas(canvasItem, output, outputIndex);
                                                        }}
                                                      >
                                                        <Copy className="h-3.5 w-3.5" />
                                                      </button>
                                                      <button
                                                        data-no-drag="true"
                                                        type="button"
                                                        className="flex h-7 w-7 items-center justify-center rounded-full bg-white/88 text-stone-500 shadow-sm ring-1 ring-black/[0.04] backdrop-blur-md transition-colors hover:bg-white hover:text-cyan-700 dark:bg-stone-950/76 dark:text-white/70 dark:ring-white/[0.08] dark:hover:bg-stone-950 dark:hover:text-cyan-200"
                                                        title={outputMediaType === 'video' ? '下载这条视频' : '下载这张图'}
                                                        onPointerDown={(event) => event.stopPropagation()}
                                                        onClick={(event) => {
                                                          event.preventDefault();
                                                          event.stopPropagation();
                                                          const outputItem = createCanvasAiOutputBufferItem(canvasItem, output, outputIndex);
                                                          if (outputItem) {
                                                            void downloadBufferItems([outputItem], { feature: 'commercial_export' });
                                                          } else {
                                                            showToast(outputMediaType === 'video' ? '这条视频还不能下载' : '这张图还不能下载');
                                                          }
                                                        }}
                                                      >
                                                        <Download className="h-3.5 w-3.5" />
                                                      </button>
                                                    </div>
                                                  )}
                                                  {outputSource && outputMediaType === 'video' ? (
                                                    <CanvasSelectionVideo
                                                      src={outputSource}
                                                      isSelected={isSelected}
                                                      muted
                                                      loop
                                                      playsInline
                                                      preload="metadata"
                                                      className="h-full w-full object-contain"
                                                      draggable={false}
                                                      onDragStart={preventCanvasNativeDrag}
                                                    />
                                                  ) : outputPreviewSource ? (
                                                    <img
                                                      key={outputPreviewSource}
                                                      src={outputPreviewSource}
                                                      alt={outputLabel}
                                                      loading="lazy"
                                                      decoding="async"
                                                      referrerPolicy="no-referrer"
                                                      className="h-full w-full object-contain transition-opacity duration-200"
                                                      draggable={false}
                                                      onDragStart={preventCanvasNativeDrag}
                                                      onLoad={(event) => {
                                                        event.currentTarget.style.opacity = '1';
                                                      }}
                                                      onError={(event) => {
                                                        event.currentTarget.style.opacity = '0';
                                                      }}
                                                    />
                                                  ) : (
                                                    <span className="flex h-full w-full flex-col items-center justify-center gap-1 px-2">
                                                      <Sparkles className={`h-4 w-4 ${isOutputWorking ? 'animate-pulse' : ''}`} />
                                                      <span className="line-clamp-2 px-2 pt-5 text-[9px] font-black leading-3">
                                                        {isOutputError ? '生成失败' : isOutputWorking ? `生成中 ${outputWorkingElapsedText}` : outputMediaType === 'video' ? '无视频' : '无图片'}
                                                      </span>
                                                    </span>
                                                  )}
                                                  {isOutputError && outputSource && (
                                                    <div className="pointer-events-none absolute bottom-2 left-2 right-12 z-20 rounded-lg bg-red-950/78 px-2 py-1 text-left text-[9px] font-black text-red-50 shadow-sm ring-1 ring-red-100/16 backdrop-blur-md">
                                                      重试失败，已保留原图
                                                    </div>
                                                  )}
                                                  {isOutputWorking && outputSource && (
                                                    <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1.5 bg-black/42 text-white backdrop-blur-[1px]">
                                                      <RefreshCw className="h-5 w-5 animate-spin text-cyan-200" />
                                                      <span className="text-[10px] font-black">正在重新生成</span>
                                                    </div>
                                                  )}
                                                  {isOutputImageCaching && !isOutputError && (
                                                    <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 overflow-hidden rounded-md bg-white/92 px-2.5 py-2 text-left shadow-sm ring-1 ring-black/[0.05] backdrop-blur-md dark:bg-stone-950/88 dark:ring-white/[0.08]">
                                                      <div className="flex items-center gap-2 text-[10px] font-black text-stone-600 dark:text-white/72">
                                                        <Download className="h-3.5 w-3.5 shrink-0 text-cyan-600 dark:text-cyan-300" />
                                                        <span>{isOutputImagePreviewing ? '原图已下载，正在生成预览' : '图片已生成，正在后台缓存，不影响下游生成'}</span>
                                                      </div>
                                                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-stone-950/[0.08] dark:bg-white/[0.09]">
                                                        <div className="h-full w-2/5 animate-pulse rounded-full bg-cyan-500" />
                                                      </div>
                                                    </div>
                                                  )}
                                                  {didOutputImageCacheFail && !output.path && !isOutputError && (
                                                    <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 rounded-md bg-amber-50/94 px-2.5 py-1.5 text-[9px] font-black text-amber-800 shadow-sm ring-1 ring-amber-950/[0.08] backdrop-blur-md dark:bg-amber-950/86 dark:text-amber-100 dark:ring-amber-100/[0.1]">
                                                      本地缓存失败，保留远程预览
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}
                                      {isCanvasWorkflowItem ? (
                                        <div className="shrink-0 rounded-[14px] px-0.5 py-1 text-[13px] font-semibold leading-6 text-stone-500 dark:text-white/54">
                                          <div className="flex items-center gap-2 text-stone-600 dark:text-white/68">
                                            <Link className="h-4 w-4 shrink-0" />
                                            <span className="min-w-0 flex-1 truncate">{canvasWorkflow?.label || canvasItem.ai?.presetLabel || '未命名工作流'}</span>
                                            <span className="shrink-0 rounded-full bg-stone-950/[0.045] px-2 py-0.5 text-[9px] font-black text-stone-500 dark:bg-white/[0.07] dark:text-white/50">
                                              {canvasWorkflow?.nodes.length || 0} 个步骤
                                            </span>
                                          </div>
                                          {canvasWorkflowUserInput?.enabled !== false ? (
                                            <div className="mt-1.5">
                                              <label className="mb-0.5 flex items-center gap-1 text-[10px] font-black text-stone-400 dark:text-white/38">
                                                {canvasWorkflowUserInput?.label || '用户需求'}
                                                {canvasWorkflowUserInput?.required && <span className="text-red-500">*</span>}
                                              </label>
                                              <textarea
                                                data-no-drag="true"
                                                data-canvas-edit-control="true"
                                                data-canvas-node-prompt="true"
                                                rows={2}
                                                defaultValue={canvasItem.item.content || ''}
                                                onChange={(event) => scheduleCanvasAiPromptDraftCommit(canvasItem.id, event.currentTarget.value)}
                                                onFocus={() => {
                                                  setCanvasAiPromptEditingId(canvasItem.id);
                                                  resizeCanvasAiPromptEditor(canvasItem.id, true, false);
                                                  updateCanvasSelection([canvasItem.id]);
                                                }}
                                                onBlur={(event) => {
                                                  commitCanvasAiPromptDraft(canvasItem.id, event.currentTarget.value, true);
                                                  setCanvasAiPromptEditingId((prev: string | null) => prev === canvasItem.id ? null : prev);
                                                  resizeCanvasAiPromptEditor(canvasItem.id, false, true);
                                                }}
                                                onPointerDown={(event) => event.stopPropagation()}
                                                onWheel={(event) => event.stopPropagation()}
                                                placeholder={canvasWorkflowUserInput?.placeholder || '描述你希望这个工作流完成的任务…'}
                                                className="h-[62px] w-full resize-none overflow-y-auto rounded-[11px] border border-stone-950/[0.055] bg-white/42 px-2.5 py-1.5 text-[12px] font-semibold leading-5 text-stone-700 outline-none placeholder:text-stone-400 focus:border-blue-300 focus:bg-white/68 dark:border-white/[0.075] dark:bg-white/[0.035] dark:text-white/74 dark:placeholder:text-white/30 dark:focus:border-blue-300/35 dark:focus:bg-white/[0.055]"
                                              />
                                            </div>
                                          ) : (
                                            <div className="mt-2 line-clamp-3 text-[12px] leading-5 text-stone-400 dark:text-white/38">
                                              {canvasWorkflow?.hint || '右键选择「展开工作流」可查看和修改内部节点。'}
                                            </div>
                                          )}
                                        </div>
                                      ) : isCanvasFrameInterpolationItem ? (
                                        <div data-canvas-local-tool-panel="true" className="shrink-0 rounded-[16px] border border-stone-950/[0.055] bg-stone-950/[0.025] px-3.5 py-3 text-[12px] font-semibold leading-5 text-stone-600 dark:border-white/[0.075] dark:bg-white/[0.045] dark:text-white/64">
                                          <div className="flex items-center justify-between gap-3">
                                            <div className="flex min-w-0 items-center gap-2 text-[13px] font-black text-stone-800 dark:text-white/82">
                                              <RefreshCw className="h-4 w-4 text-cyan-500" />
                                              <span>本地 RIFE 视频补帧</span>
                                            </div>
                                            <span data-canvas-tool-badge="true" className="shrink-0 rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-black text-cyan-700 dark:bg-cyan-300/12 dark:text-cyan-100">
                                              v4.6 / HD / UHD
                                            </span>
                                          </div>
                                          <div className="mt-2 grid gap-1.5">
                                            <div data-canvas-tool-metric="true" className="flex items-center justify-between gap-3 rounded-full bg-white/64 px-2.5 py-1 text-[11px] text-stone-500 ring-1 ring-stone-950/[0.04] dark:bg-black/12 dark:text-white/48 dark:ring-white/[0.05]">
                                              <span className="inline-flex items-center gap-1.5">
                                                <Clock className="h-3.5 w-3.5" />
                                                预计耗时
                                              </span>
                                              <span className="font-black text-stone-800 dark:text-white/78">{frameInterpolationEstimateText}</span>
                                            </div>
                                            <div className="line-clamp-1 text-[11px] text-stone-400 dark:text-white/38">
                                              {frameInterpolationMetaText || '首次使用会把 RIFE 和缺失的 ffmpeg / ffprobe 下载到安装目录。'}
                                            </div>
                                            {showFrameInterpolationProgress && (
                                              <div className="grid gap-1 rounded-[11px] bg-white/70 px-2.5 py-1.5 ring-1 ring-stone-950/[0.04] dark:bg-black/14 dark:ring-white/[0.055]">
                                                <div className="flex min-w-0 items-center justify-between gap-2 text-[10px] font-black text-stone-500 dark:text-white/50">
                                                  <span className="inline-flex min-w-0 flex-1 items-center gap-1.5">
                                                    <Download className="h-3 w-3 shrink-0 text-cyan-500" />
                                                    <span className="truncate">{frameInterpolationProgress?.label || '下载引擎'}</span>
                                                  </span>
                                                  <span className="shrink-0 text-cyan-700 dark:text-cyan-100">{frameInterpolationProgressDetail}</span>
                                                </div>
                                                <div data-canvas-tool-progress-track="true" className="h-1 overflow-hidden rounded-full bg-stone-950/[0.07] dark:bg-white/[0.08]">
                                                  <div
                                                    data-canvas-tool-progress="true"
                                                    className={`h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-[width] duration-200 ${frameInterpolationProgress?.total ? '' : 'animate-pulse'}`}
                                                    style={{ width: `${frameInterpolationProgress?.total ? Math.max(4, frameInterpolationProgressPercent) : 38}%` }}
                                                  />
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      ) : isCanvasEnhancementItem ? (
                                        <div data-canvas-local-tool-panel="true" className="shrink-0 rounded-[16px] border border-stone-950/[0.055] bg-stone-950/[0.025] px-3.5 py-3 text-[12px] font-semibold leading-5 text-stone-600 dark:border-white/[0.075] dark:bg-white/[0.045] dark:text-white/64">
                                          <div className="flex items-center justify-between gap-3">
                                            <div className="flex min-w-0 items-center gap-2 text-[13px] font-black text-stone-800 dark:text-white/82">
                                              {isCanvasVideoEnhancementItem
                                                ? <Film className="h-4 w-4 text-violet-500" />
                                                : <ImageIcon className="h-4 w-4 text-violet-500" />}
                                              <span>{isQuickVideoEnhancementItem
                                                ? '本地视频快速增强'
                                                : isCanvasVideoEnhancementItem ? '本地视频清晰度增强' : '本地图片清晰度增强'}</span>
                                            </div>
                                            <span data-canvas-tool-badge="true" className="shrink-0 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-black text-violet-700 dark:bg-violet-300/12 dark:text-violet-100">
                                              {isQuickVideoEnhancementItem ? 'FFmpeg + NVENC' : 'Real-ESRGAN'}
                                            </span>
                                          </div>
                                          <div className="mt-2 grid gap-1.5">
                                            <div data-canvas-tool-metric="true" className="flex items-center justify-between gap-3 rounded-full bg-white/64 px-2.5 py-1 text-[11px] text-stone-500 ring-1 ring-stone-950/[0.04] dark:bg-black/12 dark:text-white/48 dark:ring-white/[0.05]">
                                              <span className="inline-flex items-center gap-1.5">
                                                <Clock className="h-3.5 w-3.5" />
                                                预计耗时
                                              </span>
                                              <span className="font-black text-stone-800 dark:text-white/78">{enhancementEstimateText}</span>
                                            </div>
                                            <div className="line-clamp-1 text-[11px] text-stone-400 dark:text-white/38">
                                              {isQuickVideoEnhancementItem
                                                ? '轻度去噪、锐化、提升对比与饱和度、减轻压缩糊感，并重新高质量编码。'
                                                : enhancementMetaText || '首次使用会把 Real-ESRGAN 和缺失的 ffmpeg / ffprobe 下载到安装目录。'}
                                            </div>
                                            {showEnhancementProgress && (
                                              <div className="grid gap-1 rounded-[11px] bg-white/70 px-2.5 py-1.5 ring-1 ring-stone-950/[0.04] dark:bg-black/14 dark:ring-white/[0.055]">
                                                <div className="flex min-w-0 items-center justify-between gap-2 text-[10px] font-black text-stone-500 dark:text-white/50">
                                                  <span className="inline-flex min-w-0 flex-1 items-center gap-1.5">
                                                    <Download className="h-3 w-3 shrink-0 text-violet-500" />
                                                    <span className="truncate">{enhancementProgress?.label || '准备增强'}</span>
                                                  </span>
                                                  <span className="shrink-0 text-violet-700 dark:text-violet-100">{enhancementProgressDetail}</span>
                                                </div>
                                                <div data-canvas-tool-progress-track="true" className="h-1 overflow-hidden rounded-full bg-stone-950/[0.07] dark:bg-white/[0.08]">
                                                  <div
                                                    data-canvas-tool-progress="true"
                                                    className={`h-full rounded-full bg-gradient-to-r from-violet-400 to-blue-500 transition-[width] duration-200 ${enhancementProgress?.total ? '' : 'animate-pulse'}`}
                                                    style={{ width: `${enhancementProgress?.total ? Math.max(4, enhancementProgressPercent) : 38}%` }}
                                                  />
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      ) : (
                                        <div
                                          className="relative shrink-0"
                                          style={{ height: canvasAiPromptHeight || undefined }}
                                        >
                                          <textarea
                                          ref={(element) => {
                                            if (element) canvasAiPromptTextAreaRefs.current[canvasItem.id] = element;
                                            else delete canvasAiPromptTextAreaRefs.current[canvasItem.id];
                                          }}
                                          data-no-drag="true"
                                          data-canvas-node-prompt="true"
                                          rows={4}
                                          defaultValue={canvasItem.item.content || ''}
                                          onChange={(event) => scheduleCanvasAiPromptDraftCommit(canvasItem.id, event.currentTarget.value)}
                                          onFocus={() => {
                                            setCanvasAiPromptEditingId(canvasItem.id);
                                            resizeCanvasAiPromptEditor(canvasItem.id, true, false);
                                            updateCanvasSelection([canvasItem.id]);
                                          }}
                                          onBlur={(event) => {
                                            commitCanvasAiPromptDraft(canvasItem.id, event.currentTarget.value, true);
                                            setCanvasAiPromptEditingId((prev: string | null) => prev === canvasItem.id ? null : prev);
                                            resizeCanvasAiPromptEditor(canvasItem.id, false, true);
                                          }}
                                          onPointerDown={(event) => event.stopPropagation()}
                                          onWheel={(event) => event.stopPropagation()}
                                          placeholder={canvasItem.ai?.presetLabel ? '补充这个预设的细节，不填也可以直接生成。' : canvasAiMediaType === 'video' ? '描述你想要的视频运动、镜头和画面...' : '描述你想要的画面...'}
                                          className="block h-full w-full resize-none overflow-y-auto border-0 bg-transparent px-0.5 py-0 pr-10 text-[15px] font-semibold leading-7 text-stone-700 outline-none placeholder:text-stone-400 focus:ring-0 dark:text-white/74 dark:placeholder:text-white/32"
                                          />
                                          {(canvasAiMediaType === 'image' || canvasAiMediaType === 'video') && (
                                            <button
                                              data-no-drag="true"
                                              data-canvas-edit-control="true"
                                              type="button"
                                              disabled={canvasPromptOptimizingId === canvasItem.id}
                                              onPointerDown={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                              }}
                                              onClick={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                void optimizeCanvasPrompt(canvasItem.id);
                                              }}
                                              className="group/prompt-optimize absolute bottom-1.5 right-1.5 inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-transparent bg-transparent text-stone-400 transition-[border-color,background-color,color,transform] hover:border-cyan-500/15 hover:bg-cyan-500/[0.07] hover:text-cyan-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/30 disabled:cursor-wait disabled:opacity-55 dark:text-white/36 dark:hover:border-cyan-300/15 dark:hover:bg-cyan-300/[0.08] dark:hover:text-cyan-200 motion-reduce:transition-colors"
                                              title={canvasPromptOptimizingId === canvasItem.id ? '正在优化提示词' : '使用 Agent 优化提示词'}
                                              aria-label={canvasPromptOptimizingId === canvasItem.id ? '正在优化提示词' : '优化提示词'}
                                            >
                                              {canvasPromptOptimizingId === canvasItem.id
                                                ? <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                                                : <Sparkles className="h-4 w-4" strokeWidth={2.1} />}
                                            </button>
                                          )}
                                        </div>
                                      )}
                                      {canvasAiMediaType === 'video'
                                        && canvasWalletVideoModelContext?.capabilityStatus === 'unresolved' && (
                                        <div className="rounded-[12px] bg-amber-500/10 px-2.5 py-2 text-[10px] font-semibold leading-4 text-amber-700 dark:bg-amber-400/10 dark:text-amber-100">
                                          模型能力尚未加载，请刷新模型
                                        </div>
                                      )}
                                      {canvasAiMediaType === 'video'
                                        && canvasWalletVideoModelContext?.capabilityStatus === 'resolved'
                                        && !canvasAiResolvedVideoCapabilities.supportsTextPrompt && (
                                        <div className="rounded-[12px] bg-sky-500/8 px-2.5 py-1.5 text-[10px] leading-4 text-sky-700 dark:bg-sky-400/10 dark:text-sky-100">
                                          此模型要求媒体输入，文字仅作为辅助指令
                                        </div>
                                      )}
                                      {canvasItem.ai?.error && (
                                        <div
                                          className="max-h-16 overflow-y-auto rounded-[12px] bg-red-500/10 px-2.5 py-2 text-[10px] leading-4 text-red-600 dark:bg-red-500/14 dark:text-red-100"
                                          title={canvasItem.ai.error}
                                        >
                                          {getCanvasAiErrorSummary(canvasItem.ai.error)}
                                        </div>
                                      )}
                                      </div>
                                      {canvasItem.ai?.type === 'image-generator' && (
                                        <div
                                          className="min-h-0 shrink-0 self-stretch"
                                          style={{ width: isImageRulePanelExpanded ? 190 : 34 }}
                                        >
                                          <ImageRuleSwitchPanel
                                            rules={getCanvasImageRuleState(canvasItem)}
                                            expanded={isImageRulePanelExpanded}
                                            onToggle={(key) => toggleCanvasImageRule(canvasItem.id, key)}
                                            onToggleExpanded={() => toggleCanvasImageRulePanel(canvasItem.id)}
                                          />
                                        </div>
                                      )}
                                    </div>
                                    <div
                                      data-canvas-edit-control="true"
                                      className={`flex h-[52px] shrink-0 items-center ${canvasAiMediaType === 'video' ? 'gap-1.5 px-3' : 'gap-2 px-4'} border-t border-stone-950/[0.045] pb-3 pt-2 text-stone-600 dark:border-white/[0.055] dark:text-white/70`}
                                    >
                                      {!isCanvasWorkflowItem && (
                                        <>
                                          {isCanvasFrameInterpolationItem || isCanvasEnhancementItem ? (
                                            <CanvasLocalMediaControls
                                              canvasItem={canvasItem}
                                              isCanvasFrameInterpolationItem={isCanvasFrameInterpolationItem}
                                              isFrameInterpolationFixed2xMode={isFrameInterpolationFixed2xMode}
                                              isCanvasEnhancementItem={isCanvasEnhancementItem}
                                              isCanvasVideoEnhancementItem={isCanvasVideoEnhancementItem}
                                              isQuickVideoEnhancementItem={isQuickVideoEnhancementItem}
                                              canvasAiMenuScale={canvasAiMenuScale}
                                              updateCanvasAiGeneratorData={updateCanvasAiGeneratorData}
                                              cancelCanvasEnhancementEstimate={cancelCanvasEnhancementEstimate}
                                            />
                                          ) : (
                                            <CanvasGeneratorControls
                                              mediaType={canvasAiMediaType}
                                              menuScale={canvasAiMenuScale}
                                              modelValue={canvasAiMediaType === 'image'
                                                ? canvasAiImageModelValue
                                                : canvasAiCatalogModel?.id || getCanvasAiVideoModelOptionValue(canvasAiItemModel)}
                                              modelOptions={canvasAiMediaType === 'image'
                                                ? canvasAiImageModelOptions
                                                : canvasAiVideoModelOptions}
                                              modelTitle={`模型：${canvasAiMediaType === 'image'
                                                ? canvasAiImageModelLabel
                                                : canvasAiCatalogModel?.displayName || canvasAiVideoModelOptions.find(option => option.value === getCanvasAiVideoModelOptionValue(canvasAiItemModel))?.label || canvasAiItemModel}`}
                                              onModelChange={(value) => {
                                                const latestCanvasItem = getLatestCanvasItem();
                                                const latestAi = latestCanvasItem.ai || canvasItem.ai;
                                                const currentImageAspectRatio = canvasAiMediaType === 'image'
                                                  ? canvasAiAspectRatioValues.length > 0
                                                    ? normalizeImageAspectRatioOption(
                                                      canvasAiAspectRatioValues,
                                                      latestAi?.aspectRatio,
                                                      CANVAS_AI_DEFAULT_ASPECT_RATIO,
                                                    )
                                                    : normalizeCanvasAiAspectRatioForModel(
                                                      canvasAiItemModel,
                                                      latestAi?.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO,
                                                      canvasAiItemImageResolution,
                                                    )
                                                  : latestAi?.aspectRatio;
                                                const currentImageAspectRatioIntent = canvasAiMediaType === 'image'
                                                  ? normalizeCanvasAiAspectRatioForModel(null, currentImageAspectRatio)
                                                  : currentImageAspectRatio;
                                                const choice = canvasAiMediaType === 'image'
                                                  ? parseCanvasAiModelChoiceValue(value)
                                                  : null;
                                                const videoCandidates = canvasAiMediaType === 'video'
                                                  ? getCanvasAiVideoModelCandidates(
                                                    value,
                                                    canvasAiCredentialSource,
                                                    canvasAiItemProvider,
                                                    canvasAiCloudImageModels?.videoChannels,
                                                    canvasAiVideoCatalogModels,
                                                  )
                                                  : [];
                                                const selectedVideoCatalogModel = canvasAiMediaType === 'video'
                                                  ? findAiCatalogModel(canvasAiVideoCatalogModels, value)
                                                  : undefined;
                                                const selectedVideoCandidate = videoCandidates.find(candidate => (
                                                  candidate.provider === canvasAiItemProvider
                                                  && (candidate.providerChannelId || '') === (latestAi?.providerChannelId || '')
                                                )) || videoCandidates.find(candidate => candidate.provider === canvasAiItemProvider)
                                                  || videoCandidates[0];
                                                const selectedVideoCapabilities = selectedVideoCatalogModel
                                                  ? resolveVideoModelCapabilities({
                                                    canonical: selectedVideoCatalogModel.capabilities,
                                                    route: selectedVideoCandidate?.modelCapabilities,
                                                  })
                                                  : undefined;
                                                const provider = choice?.provider
                                                  || selectedVideoCandidate?.provider
                                                  || (canvasAiMediaType === 'video'
                                                    ? getCanvasAiVideoProviderForModel(value)
                                                    : canvasAiItemProvider);
                                                const model = choice?.model || selectedVideoCatalogModel?.id || videoCandidates[0]?.model || value;
                                                const selectedImageCandidate = choice?.providerCandidates?.find(candidate => (
                                                  candidate.provider === provider
                                                  && (candidate.model === model || candidate.canonicalModelId === model)
                                                )) || choice?.providerCandidates?.[0];
                                                const modelCapabilities = selectedImageCandidate?.capabilities;
                                                const modelResolutionCandidates = choice?.providerCandidates || [];
                                                const modelResolutionValues = getCanvasAiImageResolutionValuesForCandidates(
                                                  modelResolutionCandidates,
                                                );
                                                const resolution = selectedVideoCapabilities?.resolutions.length
                                                  ? normalizeVideoResolutionSelection(
                                                    selectedVideoCapabilities,
                                                    latestAi?.resolution,
                                                  )
                                                  : modelResolutionValues.length > 0
                                                  ? normalizeCanvasAiImageResolutionForCandidates(
                                                    modelResolutionCandidates,
                                                    latestAi?.resolution,
                                                  )
                                                  : supportsCanvasAiImageResolution(provider, model, modelCapabilities)
                                                    ? normalizeCanvasAiImageResolutionForModel(provider, model, latestAi?.resolution, modelCapabilities)
                                                  : canvasAiMediaType === 'video' && provider === 'new-api'
                                                    ? isSeedance20VideoModel(model)
                                                      ? normalizeMikotoVideoResolution(model, latestAi?.resolution)
                                                      : normalizeNewApiVideoResolutionForModel(model, latestAi?.resolution)
                                                    : canvasAiMediaType === 'video' && provider === 'minimax'
                                                      ? normalizeMiniMaxH3VideoResolution(latestAi?.resolution)
                                                    : canvasAiMediaType === 'video' && provider === 'mikoto'
                                                      ? normalizeMikotoVideoResolution(model, latestAi?.resolution)
                                                    : latestAi?.resolution;
                                                const selectedImageCapabilities = resolveImageModelCapabilities({
                                                  canonical: selectedImageCandidate?.modelCapabilities,
                                                });
                                                const selectedImageAspectRatios = getImageAspectRatioOptionsForResolution(
                                                  selectedImageCapabilities,
                                                  resolution,
                                                );
                                                updateCanvasAiGeneratorData(canvasItem.id, {
                                                  ...(choice ? {
                                                    provider,
                                                    credentialSource: choice.source,
                                                    providerChannelId: choice.providerChannelId,
                                                    providerCandidates: choice.providerCandidates,
                                                  } : canvasAiMediaType === 'video' ? {
                                                    provider,
                                                    credentialSource: canvasAiCredentialSource,
                                                    providerChannelId: selectedVideoCandidate?.providerChannelId,
                                                    providerCandidates: videoCandidates.length > 0 ? videoCandidates : undefined,
                                                  } : {}),
                                                  model,
                                                  imageProtocol: undefined,
                                                  aspectRatio: canvasAiMediaType === 'image' && selectedImageAspectRatios.length > 0
                                                    ? normalizeImageAspectRatioOption(
                                                      selectedImageAspectRatios,
                                                      currentImageAspectRatioIntent,
                                                      CANVAS_AI_DEFAULT_ASPECT_RATIO,
                                                    )
                                                    : selectedVideoCapabilities
                                                    ? normalizeVideoAspectRatioSelection(
                                                      selectedVideoCapabilities,
                                                      latestAi?.aspectRatio,
                                                    ) || 'auto'
                                                    : canvasAiMediaType === 'video'
                                                    && (provider === 'new-api'
                                                      || (provider === 'mikoto' && /^kling(?:-omni)?-video$/i.test(model)))
                                                    ? isSeedance20VideoModel(model)
                                                       ? normalizeSeedanceVideoAspectRatio(latestAi?.aspectRatio)
                                                       : normalizeNewApiVideoAspectRatio(latestAi?.aspectRatio)
                                                    : normalizeCanvasAiAspectRatioForModel(
                                                      model,
                                                      currentImageAspectRatioIntent || CANVAS_AI_DEFAULT_ASPECT_RATIO,
                                                      resolution,
                                                    ),
                                                  ...(selectedVideoCatalogModel ? {
                                                    resolution,
                                                    duration: normalizeVideoDurationSelection(
                                                      selectedVideoCapabilities || {},
                                                      latestAi?.duration,
                                                    ),
                                                    videoInputMode: selectedVideoCapabilities?.firstLastFrame !== true
                                                      ? 'REF'
                                                      : latestAi?.videoInputMode || 'REF',
                                                    count: Math.min(
                                                      Math.max(1, Number(latestAi?.count) || CANVAS_AI_DEFAULT_COUNT),
                                                      selectedVideoCapabilities?.maxOutputs || 1,
                                                    ),
                                                  } : canvasAiMediaType === 'video' && provider === 'new-api' ? {
                                                    resolution,
                                                    duration: normalizeNewApiVideoDurationForModel(model, latestAi?.duration),
                                                    videoInputMode: model === 'sora-2' ? 'REF' : latestAi?.videoInputMode || 'REF',
                                                  } : {}),
                                                  ...(canvasAiMediaType === 'video' && (provider === 'mikoto' || provider === 'minimax') ? { resolution } : {}),
                                                  ...(selectedVideoCapabilities?.resolutions.length
                                                    || modelResolutionValues.length > 0
                                                    || supportsCanvasAiImageResolution(provider, model, modelCapabilities)
                                                    ? { resolution }
                                                    : {}),
                                                });
                                              }}
                                              aspectRatioValue={canvasAiAspectRatioControlValue}
                                              aspectRatioOptions={canvasAiAspectRatioControlOptions}
                                              aspectRatioTitle={`比例：${canvasAiAspectRatioControlValue === 'auto' ? '自动' : canvasAiAspectRatioControlValue}`}
                                              useWideAspectRatioMenu={canvasAiAspectRatioValues.some((value: string) => /^\d+\s*[x×]\s*\d+$/i.test(value))
                                                || (!usesServerVideoCapabilities
                                                  && usesCanvasAiImage2DimensionOptions(canvasAiItemModel, canvasAiItemImageResolution))}
                                              onAspectRatioChange={(value) => updateCanvasAiGeneratorData(canvasItem.id, { aspectRatio: value })}
                                              videoAspectRatioMode={canvasAiResolvedVideoCapabilities.source === 'server'
                                                ? canvasAiResolvedVideoCapabilities.aspectRatioMode
                                                : undefined}
                                              supportsImageResolution={canvasAiSupportsImageResolution}
                                              imageResolutionValue={canvasAiItemImageResolution}
                                              imageResolutionOptions={canvasAiImageResolutionOptions}
                                              onImageResolutionChange={(value) => {
                                                const latestCanvasItem = getLatestCanvasItem();
                                                const latestAi = latestCanvasItem.ai || canvasItem.ai;
                                                const currentAspectRatio = canvasAiAspectRatioValues.length > 0
                                                  ? normalizeImageAspectRatioOption(
                                                    canvasAiAspectRatioValues,
                                                    latestAi?.aspectRatio,
                                                    CANVAS_AI_DEFAULT_ASPECT_RATIO,
                                                  )
                                                  : normalizeCanvasAiAspectRatioForModel(
                                                    canvasAiItemModel,
                                                    latestAi?.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO,
                                                    canvasAiItemImageResolution,
                                                  );
                                                const currentAspectRatioIntent = normalizeCanvasAiAspectRatioForModel(
                                                  null,
                                                  currentAspectRatio,
                                                );
                                                const resolution = canvasAiResolvedImageCapabilities.source === 'server'
                                                  ? normalizeCapabilityOption(
                                                    canvasAiResolvedImageCapabilities.resolutions,
                                                    value,
                                                    '2K',
                                                  )
                                                  : canvasAiCandidateImageResolutionValues.length > 0
                                                  ? normalizeCanvasAiImageResolutionForCandidates(
                                                    canvasAiItemProviderCandidates,
                                                    value,
                                                  )
                                                  : normalizeCanvasAiImageResolutionForModel(
                                                    canvasAiItemProvider,
                                                    canvasAiItemModel,
                                                    value,
                                                    canvasAiItemCapabilities,
                                                  );
                                                updateCanvasAiGeneratorData(canvasItem.id, {
                                                  resolution,
                                                  aspectRatio: (() => {
                                                    const options = getImageAspectRatioOptionsForResolution(
                                                      canvasAiResolvedImageCapabilities,
                                                      resolution,
                                                    );
                                                    return options.length > 0
                                                      ? normalizeImageAspectRatioOption(
                                                        options,
                                                        currentAspectRatioIntent,
                                                        CANVAS_AI_DEFAULT_ASPECT_RATIO,
                                                      )
                                                      : normalizeCanvasAiAspectRatioForModel(
                                                        canvasAiItemModel,
                                                        currentAspectRatioIntent,
                                                        resolution,
                                                      );
                                                  })(),
                                                });
                                              }}
                                              outputFormatValue={canvasAiOutputFormat}
                                              outputFormatOptions={canvasAiOutputFormatOptions}
                                              outputFormatTitle={`格式：${(canvasItem.ai?.outputFormat || CANVAS_AI_DEFAULT_OUTPUT_FORMAT).toUpperCase()}`}
                                              onOutputFormatChange={(value) => updateCanvasAiGeneratorData(canvasItem.id, { outputFormat: value })}
                                              videoResolutionValue={canvasAiVideoResolution}
                                              videoResolutionOptions={canvasAiVideoResolutionOptions}
                                              onVideoResolutionChange={(value) => updateCanvasAiGeneratorData(canvasItem.id, {
                                                resolution: canvasAiResolvedVideoCapabilities.source === 'server'
                                                  ? normalizeVideoResolutionSelection(canvasAiResolvedVideoCapabilities, value) || value
                                                  : isCanvasAiMiniMaxVideo
                                                  ? normalizeMiniMaxH3VideoResolution(value)
                                                  : isCanvasAiSeedanceLikeVideo
                                                    ? normalizeMikotoVideoResolution(canvasAiItemModel, value)
                                                  : isCanvasAiNewApiVideo
                                                    ? normalizeNewApiVideoResolutionForModel(canvasAiItemModel, value)
                                                    : isCanvasAiMikotoVideo
                                                      ? normalizeMikotoVideoResolution(canvasAiItemModel, value)
                                                    : value,
                                              })}
                                              videoCapabilitiesAvailable={canvasWalletVideoModelContext?.capabilityStatus !== 'unresolved'}
                                              videoSupportsFirstLastFrame={canvasAiVideoSupportsFirstLastFrame}
                                              videoInputMode={canvasVideoInputMode}
                                              onVideoInputModeChange={(value) => updateCanvasAiGeneratorData(canvasItem.id, { videoInputMode: value === 'FLF' ? 'FLF' : 'REF' })}
                                              videoDuration={canvasAiVideoDuration}
                                              videoDurationOptions={canvasAiVideoDurationOptions}
                                              onVideoDurationChange={(value) => updateCanvasAiGeneratorData(canvasItem.id, { duration: Number(value) || CANVAS_AI_DEFAULT_VIDEO_DURATION })}
                                              videoCfrMode={canvasItem.ai?.videoCfrMode || 'off'}
                                              onVideoCfrModeChange={(value) => {
                                                const videoCfrMode = value === '24' || value === '30' || value === 'off' ? value : 'auto';
                                                updateCanvasAiGeneratorData(canvasItem.id, { videoCfrMode });
                                                if (videoCfrMode !== 'off') {
                                                  void invoke<void>('ensure_video_cfr_tools', { progressId: canvasItem.id })
                                                    .catch(error => console.warn('FFmpeg / FFprobe 后台准备失败:', error));
                                                }
                                              }}
                                              count={canvasItem.ai?.count || CANVAS_AI_DEFAULT_COUNT}
                                              countOptions={canvasAiCountOptions}
                                              onCountChange={(value) => updateCanvasAiGeneratorData(canvasItem.id, { count: Number(value) || CANVAS_AI_DEFAULT_COUNT })}
                                            />
                                          )}
                                        </>
                                      )}
                                      <CanvasAiRunButton
                                        disabled={canvasItem.ai?.status === 'working'
                                          || isLocalMediaBenchmarking
                                          || canvasWalletVideoModelContext?.capabilityStatus === 'unresolved'}
                                        isWorking={canvasItem.ai?.status === 'working'}
                                        isFrameInterpolation={isCanvasFrameInterpolationItem}
                                        isEnhancement={isCanvasEnhancementItem}
                                        isVideoEnhancement={isCanvasVideoEnhancementItem}
                                        isQuickVideoEnhancement={isQuickVideoEnhancementItem}
                                        isWorkflow={isCanvasWorkflowItem}
                                        hasResults={hasCanvasAiGeneratedResults(canvasItem)}
                                        workingElapsedText={canvasAiWorkingElapsedText}
                                        workingStatusText={canvasAiWorkingStatusText}
                                        creditLabel={canvasRunCreditLabel}
                                        creditTitle={canvasRunCreditTitle}
                                        onPointerDown={(event) => handleCanvasAiRunPointerDown(event, canvasItem.id)}
                                        onClick={(event) => handleCanvasAiRunClick(event, canvasItem.id)}
                                      />
                                    </div>
                                  </div>
                                </div>
                                </>
                              ) : isTextCanvasItem ? (
                                isCanvasTextPlainMode ? (
                                  <div
                                    className={`flex h-full flex-col overflow-hidden border bg-gradient-to-br from-white/88 via-white/76 to-stone-100/72 text-stone-800 backdrop-blur-2xl transition-[border-color] dark:from-[#272727]/96 dark:via-[#222222]/96 dark:to-[#1d1d1d]/96 dark:text-white ${
                                      'border-white/80 dark:border-white/[0.08]'
                                    }`}
                                    style={{ borderRadius: canvasScaledNodeRadius }}
                                  >
                                    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-stone-950/[0.045] px-3 text-[11px] font-black text-stone-500 dark:border-white/[0.055] dark:text-white/58">
                                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[7px] bg-stone-950/[0.055] text-stone-500 dark:bg-white/[0.07] dark:text-white/62">
                                        <Type className="h-3.5 w-3.5" />
                                      </span>
                                      <span className="truncate">{canvasItem.item.name || '文字卡片'}</span>
                                      <button
                                        data-no-drag="true"
                                        type="button"
                                        className="ml-auto rounded-full bg-blue-500/10 px-2 py-0.5 text-[9px] font-black text-blue-600 transition-colors hover:bg-blue-500/16 hover:text-blue-700 dark:bg-blue-400/12 dark:text-blue-200 dark:hover:bg-blue-400/18"
                                        onPointerDown={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                        }}
                                        onClick={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          setCanvasTextNodeMode(canvasItem.id, 'agent');
                                        }}
                                        title="切换回 Agent 文字节点"
                                      >
                                        Agent
                                      </button>
                                      <span className="rounded-full bg-stone-950/[0.045] px-2 py-0.5 text-[9px] font-black tracking-[0.12em] text-stone-400 dark:bg-white/[0.07] dark:text-white/38">
                                        TEXT
                                      </span>
                                    </div>
                                    <textarea
                                      ref={(element) => {
                                        if ((canvasItem.item.remark || '').trim()) {
                                          delete canvasTextAreaRefs.current[canvasItem.id];
                                          if (element) canvasTextOutputAreaRefs.current[canvasItem.id] = element;
                                          else delete canvasTextOutputAreaRefs.current[canvasItem.id];
                                        } else {
                                          delete canvasTextOutputAreaRefs.current[canvasItem.id];
                                          if (element) canvasTextAreaRefs.current[canvasItem.id] = element;
                                          else delete canvasTextAreaRefs.current[canvasItem.id];
                                        }
                                      }}
                                      data-no-drag="true"
                                      defaultValue={(canvasItem.item.remark || canvasItem.item.content || '')}
                                      onChange={(event) => {
                                        if ((canvasItem.item.remark || '').trim()) scheduleCanvasTextOutputDraftCommit(canvasItem.id, event.currentTarget.value);
                                        else scheduleCanvasTextDraftCommit(canvasItem.id, event.currentTarget.value);
                                      }}
                                      onBlur={(event) => {
                                        if ((canvasItem.item.remark || '').trim()) commitCanvasTextOutputDraft(canvasItem.id, event.currentTarget.value, true);
                                        else commitCanvasTextDraft(canvasItem.id, event.currentTarget.value, true);
                                      }}
                                      onFocus={() => updateCanvasSelection([canvasItem.id])}
                                      onPointerDown={(event) => event.stopPropagation()}
                                      onWheel={(event) => event.stopPropagation()}
                                      placeholder="单纯写点文字..."
                                      className="min-h-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-4 py-3 text-[14px] font-semibold leading-6 text-stone-700 outline-none placeholder:text-stone-400 focus:ring-0 dark:text-white/78 dark:placeholder:text-white/30"
                                    />
                                  </div>
                                ) : (
                                <div
                                  className={`flex h-full flex-col overflow-hidden border bg-gradient-to-br from-white/88 via-white/76 to-stone-100/72 text-stone-800 backdrop-blur-2xl transition-[border-color] dark:from-[#272727]/96 dark:via-[#222222]/96 dark:to-[#1d1d1d]/96 dark:text-white ${
                                    'border-white/80 dark:border-white/[0.08]'
                                  }`}
                                  style={{ borderRadius: canvasScaledNodeRadius }}
                                >
                                  <div className="flex h-9 shrink-0 items-center gap-2 border-b border-stone-950/[0.045] px-3 text-[11px] font-black text-stone-500 dark:border-white/[0.055] dark:text-white/58">
                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[7px] bg-stone-950/[0.055] text-stone-500 dark:bg-white/[0.07] dark:text-white/62">
                                      {canvasDesignAgentConfig.agentRole === 'seedance_video_analyzer'
                                        ? <Film className="h-3.5 w-3.5" />
                                        : <Type className="h-3.5 w-3.5" />}
                                    </span>
                                    <span className="truncate">{canvasItem.item.name || '文字卡片'}</span>
                                    <button
                                      data-no-drag="true"
                                      type="button"
                                      className="ml-auto rounded-full bg-stone-950/[0.045] px-2 py-0.5 text-[9px] font-black text-stone-500 transition-colors hover:bg-stone-950/[0.075] hover:text-stone-700 dark:bg-white/[0.07] dark:text-white/46 dark:hover:bg-white/[0.10] dark:hover:text-white/76"
                                      onPointerDown={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                      }}
                                      onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setCanvasTextNodeMode(canvasItem.id, 'plain');
                                      }}
                                      title="切换为纯文本卡片"
                                    >
                                      简洁
                                    </button>
                                    <span className="rounded-full bg-stone-950/[0.045] px-2 py-0.5 text-[9px] font-black tracking-[0.12em] text-stone-400 dark:bg-white/[0.07] dark:text-white/38">
                                      {canvasDesignAgentConfig.agentRole === 'seedance_video_analyzer' ? 'SEEDANCE' : 'DESIGN'}
                                    </span>
                                  </div>
                                  <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-stone-950/[0.045] bg-white/38 px-2.5 dark:border-white/[0.055] dark:bg-white/[0.025]">
                                    <RoundedSelect
                                      data-no-drag="true"
                                      data-canvas-edit-control="true"
                                      value={canvasDesignAgentConfig.agentRole}
                                      options={DESIGN_AGENT_ROLE_OPTIONS}
                                      onChange={(value) => setCanvasDesignAgentConfig(canvasItem.id, normalizeDesignAgentConfig({ agentRole: value }))}
                                      className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} min-w-0 flex-[1.25]`}
                                      labelClassName="truncate text-left"
                                      chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
                                      menuScale={canvasAiMenuScale}
                                      menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
                                      optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
                                      title="Design Agent 角色"
                                    />
                                    <RoundedSelect
                                      data-no-drag="true"
                                      data-canvas-edit-control="true"
                                      value={canvasDesignAgentConfig.outputArtifactType}
                                      options={DESIGN_AGENT_ARTIFACT_OPTIONS}
                                      onChange={(value) => setCanvasDesignAgentConfig(canvasItem.id, {
                                        ...canvasDesignAgentConfig,
                                        outputArtifactType: value as DesignAgentConfig['outputArtifactType'],
                                      })}
                                      className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} min-w-0 flex-[1.1]`}
                                      labelClassName="truncate text-left"
                                      chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
                                      menuScale={canvasAiMenuScale}
                                      menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
                                      optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
                                      title="输出设计资产"
                                    />
                                    <RoundedSelect
                                      data-no-drag="true"
                                      data-canvas-edit-control="true"
                                      value={canvasDesignAgentConfig.thinkingMode}
                                      options={DESIGN_AGENT_THINKING_MODE_OPTIONS}
                                      onChange={(value) => setCanvasDesignAgentConfig(canvasItem.id, {
                                        ...canvasDesignAgentConfig,
                                        thinkingMode: value as DesignAgentConfig['thinkingMode'],
                                      })}
                                      className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} min-w-0 flex-[0.72]`}
                                      labelClassName="truncate text-left"
                                      chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
                                      menuScale={canvasAiMenuScale}
                                      menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
                                      optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
                                      title="思考模式"
                                    />
                                    <RoundedSelect
                                      data-no-drag="true"
                                      data-canvas-edit-control="true"
                                      value={canvasItem.contextRouting === 'auto' ? 'auto' : 'full'}
                                      options={CANVAS_TEXT_CONTEXT_ROUTING_OPTIONS}
                                      onChange={(value) => setCanvasTextContextRouting(
                                        canvasItem.id,
                                        value === 'auto' ? 'auto' : 'full',
                                      )}
                                      className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} min-w-0 flex-[0.86]`}
                                      labelClassName="truncate text-left"
                                      chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS}
                                      menuScale={canvasAiMenuScale}
                                      menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS}
                                      optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS}
                                      title="下游上下文：完整传递或按生图节点自动分流"
                                    />
                                  </div>
                                  {canvasTextMediaInputItems.length > 0 && (
                                    <div className="shrink-0 border-b border-stone-950/[0.045] bg-white/42 px-3 py-2 dark:border-white/[0.055] dark:bg-white/[0.035]">
                                      <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-black text-stone-400 dark:text-white/38">
                                        <span className="flex items-center gap-1">
                                          <ImageIcon className="h-3 w-3" />
                                          接收产物
                                        </span>
                                        <span className="rounded-full bg-stone-950/[0.045] px-1.5 py-0.5 font-mono text-[9px] dark:bg-white/[0.07]">
                                          {canvasTextMediaInputItems.length}
                                        </span>
                                      </div>
                                      <div className="flex max-w-full items-center gap-1.5 overflow-x-auto pb-0.5">
                                        {canvasTextMediaInputItems.slice(0, 6).map(inputItem => {
                                          const previewSource = getCanvasReferencePreviewSource(inputItem);
                                          const isVideoReference = isCanvasVideoReferencePreviewItem(inputItem);
                                          return (
                                            <button
                                              key={inputItem.id}
                                              data-no-drag="true"
                                              type="button"
                                              className="group/text-ref relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-stone-200/70 bg-white/72 text-stone-400 shadow-sm transition-transform hover:scale-[1.03] dark:border-white/[0.08] dark:bg-white/[0.045] dark:text-white/52"
                                              title="双击移除这个上游产物"
                                              onPointerDown={(event) => event.stopPropagation()}
                                              onDoubleClick={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                disconnectCanvasInput(canvasItem.id, inputItem.disconnectId);
                                              }}
                                            >
                                              {previewSource ? (
                                                <img
                                                  src={previewSource}
                                                  alt=""
                                                  loading="lazy"
                                                  decoding="async"
                                                  className="h-full w-full object-cover"
                                                  draggable={false}
                                                  onDragStart={preventCanvasNativeDrag}
                                                />
                                              ) : isVideoReference ? (
                                                <Film className="h-4 w-4" />
                                              ) : (
                                                <Sparkles className="h-4 w-4" />
                                              )}
                                              {isVideoReference && (
                                                <span className="absolute bottom-1 right-1 rounded-full bg-black/62 p-1 text-white shadow-sm">
                                                  <Film className="h-2.5 w-2.5" />
                                                </span>
                                              )}
                                            </button>
                                          );
                                        })}
                                        {canvasTextMediaInputItems.length > 6 && (
                                          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-stone-950/[0.045] text-[11px] font-black text-stone-500 dark:bg-white/[0.06] dark:text-white/60">
                                            +{canvasTextMediaInputItems.length - 6}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-br from-slate-50/82 via-white/42 to-white/12 dark:from-white/[0.045] dark:via-white/[0.025] dark:to-transparent">
                                    <div className="flex h-8 shrink-0 items-center gap-2 px-3 text-[10px] font-black text-stone-400 dark:text-white/38">
                                      <Sparkles className="h-3 w-3" />
                                      <span>生成结果</span>
                                      <button
                                        data-no-drag="true"
                                        type="button"
                                        className="ml-auto rounded-full px-2 py-1 text-[10px] font-black text-stone-400 transition-colors hover:bg-stone-950/[0.05] hover:text-stone-700 dark:text-white/42 dark:hover:bg-white/[0.07] dark:hover:text-white/76"
                                        onPointerDown={(event) => event.stopPropagation()}
                                        onClick={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          void copyCanvasTextOutput(canvasItem.id);
                                        }}
                                        title="复制生成文本"
                                      >
                                        <Copy className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                    <textarea
                                      ref={(element) => {
                                        if (element) canvasTextOutputAreaRefs.current[canvasItem.id] = element;
                                        else delete canvasTextOutputAreaRefs.current[canvasItem.id];
                                      }}
                                      data-no-drag="true"
                                      defaultValue={canvasItem.item.remark || ''}
                                      onChange={(event) => scheduleCanvasTextOutputDraftCommit(canvasItem.id, event.currentTarget.value)}
                                      onBlur={(event) => commitCanvasTextOutputDraft(canvasItem.id, event.currentTarget.value, true)}
                                      onFocus={() => updateCanvasSelection([canvasItem.id])}
                                      onPointerDown={(event) => event.stopPropagation()}
                                      onWheel={(event) => event.stopPropagation()}
                                      placeholder="运行 Agent 后，脚本/分析/文案会生成在这里，可继续编辑或复制。"
                                      className="min-h-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-3.5 pb-3 text-[13px] font-semibold leading-6 text-slate-900 outline-none placeholder:text-stone-400 focus:ring-0 dark:text-white/82 dark:placeholder:text-white/30"
                                    />
                                  </div>
                                  <div className="shrink-0 border-t border-stone-950/[0.045] bg-white/58 px-3 py-2 dark:border-white/[0.055] dark:bg-black/[0.10]">
                                    <div className="mb-1.5 flex items-center gap-1 text-[10px] font-black text-stone-400 dark:text-white/38">
                                      <Type className="h-3 w-3" />
                                      <span>需求</span>
                                    </div>
                                    <textarea
                                      ref={(element) => {
                                        if (element) canvasTextAreaRefs.current[canvasItem.id] = element;
                                        else delete canvasTextAreaRefs.current[canvasItem.id];
                                      }}
                                      data-canvas-text-id={canvasItem.id}
                                      data-no-drag="true"
                                      defaultValue={canvasItem.item.content || ''}
                                      onChange={(event) => scheduleCanvasTextDraftCommit(canvasItem.id, event.currentTarget.value)}
                                      onBlur={(event) => commitCanvasTextDraft(canvasItem.id, event.currentTarget.value, true)}
                                      onFocus={() => updateCanvasSelection([canvasItem.id])}
                                      onPointerDown={(event) => event.stopPropagation()}
                                      onWheel={(event) => event.stopPropagation()}
                                      placeholder="输入你要 Agent 生成什么，比如：基于参考图写 8 秒产品展示脚本..."
                                      className="h-20 w-full resize-none overflow-y-auto rounded-[14px] border border-transparent bg-stone-100/72 px-3 py-2 text-[12px] font-semibold leading-5 text-stone-700 outline-none transition-colors placeholder:text-stone-400 hover:bg-stone-100/88 focus:border-stone-300/70 focus:bg-stone-100/90 focus:ring-2 focus:ring-stone-200/55 dark:border-white/[0.06] dark:bg-white/[0.055] dark:text-white/74 dark:placeholder:text-white/30 dark:hover:bg-white/[0.075] dark:focus:border-white/[0.14] dark:focus:bg-white/[0.08] dark:focus:ring-white/[0.08]"
                                    />
                                    <div className="mt-2 flex items-center gap-2">
                                      <span className="min-w-0 flex-1 truncate text-[10px] font-bold text-stone-400 dark:text-white/32">
                                        {canvasTextMediaInputItems.length > 0 ? '已接收 ' + canvasTextMediaInputItems.length + ' 个上游产物' : '可直接输入需求运行，或先连接参考图/视频'}
                                      </span>
                                      <button
                                        data-no-drag="true"
                                        data-canvas-run-control="true"
                                        type="button"
                                        disabled={isCanvasTextAgentRunning}
                                        onPointerDown={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                        }}
                                        onClick={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          void runCanvasTextAgentNode(canvasItem.id);
                                        }}
                                        title={canvasRunCreditTitle || '使用 Agent API 运行此文字节点'}
                                        className="ml-auto flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[11px] px-2.5 text-[12px] font-black text-stone-500 transition-colors hover:bg-stone-950/[0.05] hover:text-stone-900 disabled:cursor-wait disabled:opacity-45 dark:text-white/58 dark:hover:bg-white/[0.07] dark:hover:text-white"
                                      >
                                        <Play className={'h-4 w-4 fill-current ' + (isCanvasTextAgentRunning ? 'animate-pulse' : '')} />
                                        {isCanvasTextAgentRunning ? '运行中' : (canvasItem.item.remark ? '再次运行' : '运行')}
                                        {!isCanvasTextAgentRunning && canvasRunCreditLabel && (
                                          <span className="whitespace-nowrap text-[10px] font-bold text-amber-600 dark:text-amber-300">
                                            · {canvasRunCreditLabel}
                                          </span>
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                                )
                              ) : isCanvasReferenceBridgeItem ? (
                                <div className="flex h-full w-full flex-col overflow-hidden rounded-[18px] border border-cyan-200/70 bg-white/90 text-stone-700 shadow-[0_10px_26px_rgba(15,23,42,0.10)] transition-[box-shadow,border-color] hover:border-cyan-300/80 hover:shadow-[0_14px_32px_rgba(15,23,42,0.12)] dark:border-cyan-300/16 dark:bg-stone-900/90 dark:text-white/78 dark:hover:border-cyan-300/28">
                                  <div className="flex items-center gap-2 border-b border-stone-950/[0.045] bg-cyan-50/70 px-3 py-2 dark:border-white/[0.06] dark:bg-cyan-300/[0.08]">
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-cyan-500/10 text-cyan-600 dark:bg-cyan-300/12 dark:text-cyan-200">
                                      <Link className="h-4 w-4" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-[12px] font-black">{canvasItem.workflowBridge?.label || canvasItem.item.name || '参考图桥接'}</div>
                                      <div className="truncate text-[10px] font-bold text-stone-400 dark:text-white/38">Reference image bridge</div>
                                    </div>
                                    <span className="shrink-0 rounded-full bg-white/72 px-2 py-0.5 font-mono text-[10px] font-black text-cyan-700 ring-1 ring-cyan-200/70 dark:bg-white/[0.08] dark:text-cyan-100 dark:ring-white/[0.08]">
                                      {canvasBridgeInputItems.length}
                                    </span>
                                  </div>
                                  <div className="flex min-h-0 flex-1 items-center justify-center p-3">
                                    {canvasBridgeInputItems.length > 0 ? (
                                      <div className="grid w-full grid-cols-2 gap-2">
                                        {canvasBridgeInputItems.slice(0, 4).map((inputItem: BufferItem, inputIndex: number) => {
                                          const previewSource = getCanvasItemNavSource(inputItem);
                                          return (
                                            <div
                                              key={inputItem.id || `${canvasItem.id}-bridge-input-${inputIndex}`}
                                              className="relative flex aspect-[4/3] min-h-0 items-center justify-center overflow-hidden rounded-[12px] border border-stone-200/70 bg-stone-100/70 text-stone-400 dark:border-white/[0.08] dark:bg-white/[0.045] dark:text-white/42"
                                              title={inputItem.name || inputItem.content || '参考图'}
                                            >
                                              {previewSource ? (
                                                <img
                                                  src={previewSource}
                                                  alt=""
                                                  loading="lazy"
                                                  decoding="async"
                                                  className="h-full w-full object-cover"
                                                  draggable={false}
                                                  onDragStart={preventCanvasNativeDrag}
                                                />
                                              ) : (
                                                <ImageIcon className="h-4 w-4" />
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    ) : (
                                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-cyan-200/80 bg-cyan-50/42 px-3 text-center text-stone-400 dark:border-cyan-300/16 dark:bg-cyan-300/[0.045] dark:text-white/38">
                                        <ImageIcon className="h-5 w-5 text-cyan-500 dark:text-cyan-200" />
                                        <span className="text-[11px] font-bold">等待接入参考图</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : canvasItem.item.type === 'three-scene' && canvasItem.threeScene ? (
                                <ThreeSceneNode
                                  data={canvasItem.threeScene}
                                  references={canvasThreeSceneReferences}
                                  active={shouldMountThreeSceneRenderer(canvasItem.id, activeThreeSceneId)}
                                  analyzing={threeSceneAnalyzingIds.includes(canvasItem.id)}
                                  onOpenReferences={() => setCanvasInputMenuForId((previous: string | null) => (
                                    previous === canvasItem.id ? null : canvasItem.id
                                  ))}
                                  onRemoveReference={(inputId) => disconnectCanvasInput(canvasItem.id, inputId)}
                                  onGenerate={() => analyzeCanvasThreeSceneNode(canvasItem.id)}
                                  onInteractionStart={(label) => beginThreeSceneInteraction(canvasItem.id, label)}
                                  onInteractionEnd={() => endThreeSceneInteraction(canvasItem.id)}
                                  onSceneSpecChange={(sceneSpec) => updateThreeSceneSpec(canvasItem.id, sceneSpec)}
                                  onPreviewChange={(preview) => updateThreeScenePreview(canvasItem.id, preview)}
                                  onOverlayChange={(patch) => updateThreeSceneReferenceOverlay(canvasItem.id, patch)}
                                  onCapture={(dataUrl) => captureThreeSceneView(canvasItem.id, dataUrl)}
                                  onReanalyze={() => analyzeCanvasThreeSceneNode(canvasItem.id)}
                                />
                              ) : canvasItem.item.type === 'file' ? (
                                <div className="flex h-full w-full flex-col overflow-hidden rounded-[18px] border border-violet-200/70 bg-white/92 text-stone-700 shadow-[0_10px_26px_rgba(15,23,42,0.10)] dark:border-violet-300/16 dark:bg-stone-900/92 dark:text-white/78">
                                  <div className="flex items-center gap-2 border-b border-stone-950/[0.045] bg-violet-50/72 px-3 py-2 dark:border-white/[0.06] dark:bg-violet-300/[0.08]">
                                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-violet-500/10 text-violet-600 dark:bg-violet-300/12 dark:text-violet-200">
                                      <FileIcon className="h-4 w-4" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate text-[12px] font-black">{canvasItem.item.name || '文件附件'}</div>
                                      <div className="truncate text-[9px] font-bold text-stone-400 dark:text-white/38">
                                        {canvasItem.item.fileSize ? `${Math.max(1, Math.round(canvasItem.item.fileSize / 1024))} KB` : 'File input'}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="min-h-0 flex-1 overflow-hidden px-3 py-2 text-[10px] font-semibold leading-4 text-stone-500 dark:text-white/50">
                                    <div className="line-clamp-5 whitespace-pre-wrap">{canvasItem.item.content || '未解析文件内容'}</div>
                                  </div>
                                </div>
                              ) : (
                                <div className={`relative h-full w-full overflow-visible transition-[box-shadow] ${
                                  isGeneratedMediaItem
                                    ? 'bg-transparent shadow-none'
                                    : 'bg-white/86 shadow-[0_10px_26px_rgba(15,23,42,0.10)] hover:shadow-[0_14px_32px_rgba(15,23,42,0.12)] dark:bg-stone-900/88 dark:shadow-[0_12px_30px_rgba(0,0,0,0.24)]'
                                }`}>
                                  {isGeneratedMediaPending || isGeneratedMediaError ? (
                                    <div className={`flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center ${
                                      isGeneratedMediaError ? 'bg-red-950/28 text-red-100' : 'bg-stone-950/74 text-white'
                                    }`}>
                                      <Sparkles className={`h-5 w-5 ${isGeneratedMediaError ? 'text-red-300' : 'text-cyan-300 animate-pulse'}`} />
                                      <div className="text-[12px] font-black">
                                        {isGeneratedMediaError ? '生成失败' : '生成中'}
                                      </div>
                                      <div
                                        className="max-h-16 max-w-full overflow-hidden px-1 text-[10px] font-medium leading-4 opacity-70"
                                        title={isGeneratedMediaError ? canvasItem.ai?.error || '请重试' : canvasItem.item.name || (isGeneratedVideoItem ? '等待接口返回视频' : '等待接口返回图片')}
                                      >
                                        {isGeneratedMediaError ? getCanvasAiErrorSummary(canvasItem.ai?.error) : canvasItem.item.name || (isGeneratedVideoItem ? '等待接口返回视频' : '等待接口返回图片')}
                                      </div>
                                    </div>
                                  ) : isGeneratedVideoItem || canvasItem.item.type === 'video' ? (
                                    <CanvasSelectionVideo
                                      data-canvas-main-media="true"
                                      src={canvasImageSource}
                                      isSelected={isSelected}
                                      controlsWhenSelected
                                      muted
                                      playsInline
                                      preload="metadata"
                                      className="h-full w-full select-none object-contain"
                                      draggable={false}
                                      onDragStart={preventCanvasNativeDrag}
                                    />
                                  ) : canvasImageSource ? (
                                    <img
                                      data-canvas-main-media="true"
                                      src={canvasImageSource}
                                      alt={canvasItem.item.name || '画布图片'}
                                      loading="lazy"
                                      decoding="async"
                                      className="h-full w-full select-none object-contain"
                                      style={canvasItem.rotation ? {
                                        imageRendering: 'auto',
                                        position: 'absolute',
                                        left: '50%',
                                        top: '50%',
                                        width: canvasItem.rotation % 180 === 0 ? canvasItem.width : canvasItem.height,
                                        height: canvasItem.rotation % 180 === 0 ? canvasItem.height : canvasItem.width,
                                        maxWidth: 'none',
                                        maxHeight: 'none',
                                        transform: `translate(-50%, -50%) rotate(${canvasItem.rotation}deg)`,
                                        transformOrigin: 'center',
                                      } : { imageRendering: 'auto' }}
                                      draggable={false}
                                      onDragStart={preventCanvasNativeDrag}
                                    />
                                  ) : (
                                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-stone-100/75 px-4 text-center text-stone-400 dark:bg-stone-900/78 dark:text-white/36">
                                      <ImageIcon className="h-6 w-6" />
                                      <span className="text-[11px] font-bold">{hasCanvasImageBackingSource ? '正在准备缩略图' : '图片源丢失'}</span>
                                    </div>
                                  )}
                                  {canvasItem.item.type === 'image' && threeSceneAnalyzingIds.includes(canvasItem.id) && (
                                    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 bg-stone-950/52 text-white backdrop-blur-[2px]">
                                      <RefreshCw className="h-5 w-5 animate-spin" />
                                      <span className="text-[11px] font-bold">正在分析图片构图…</span>
                                    </div>
                                  )}
                                  {!isGeneratedMediaItem && (
                                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/52 to-transparent px-2 py-1.5 text-[10px] font-bold text-white opacity-0 transition-opacity group-hover/canvas-item:opacity-100">
                                      <span className="block truncate">{canvasItem.item.name || canvasItem.item.content}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            {canvasItem.item.type === 'image' && canvasImageSource && !isGeneratedMediaPending && !isGeneratedMediaError && (
                              <div
                                data-no-drag="true"
                                className="absolute left-1.5 top-1.5 z-50 flex items-center gap-0.5 rounded-[10px] border border-white/72 bg-white/88 p-0.5 text-stone-500 opacity-0 shadow-[0_5px_16px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-[opacity,transform] focus-within:opacity-100 group-hover/canvas-item:opacity-100 dark:border-white/10 dark:bg-stone-950/82 dark:text-white/68 dark:shadow-[0_7px_20px_rgba(0,0,0,0.30)]"
                                style={isCanvasAiNodeItem ? { left: 6, top: 6 } : undefined}
                                onPointerDown={(event) => event.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  className="flex h-7 w-7 items-center justify-center rounded-[8px] transition-[color,background-color,transform] hover:bg-blue-500/10 hover:text-blue-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/65 dark:hover:bg-blue-400/12 dark:hover:text-blue-200"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    void openCanvasBrushEditor(canvasItem.id);
                                  }}
                                  title="画笔标记"
                                  aria-label="画笔标记"
                                >
                                  <Brush className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  className="flex h-7 w-7 items-center justify-center rounded-[8px] transition-[color,background-color,transform] hover:bg-blue-500/10 hover:text-blue-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/65 dark:hover:bg-blue-400/12 dark:hover:text-blue-200"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    void copyCanvasImageToSystemClipboard(canvasItem);
                                  }}
                                  title="复制图片"
                                  aria-label="复制图片"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  className="flex h-7 w-7 items-center justify-center rounded-[8px] transition-[color,background-color,transform] hover:bg-blue-500/10 hover:text-blue-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/65 dark:hover:bg-blue-400/12 dark:hover:text-blue-200"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    rotateCanvasImageClockwise(canvasItem.id);
                                  }}
                                  title="顺时针旋转 90°"
                                  aria-label="顺时针旋转 90°"
                                >
                                  <RotateCw className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                            {canvasExpandedInternalSlot && canvasExpandedWorkflowGroup && (
                              <div
                                data-no-drag="true"
                                className="absolute inset-x-2 bottom-2 z-50 flex items-center gap-1.5 rounded-[12px] bg-black/72 px-2 py-1.5 text-white opacity-0 shadow-lg backdrop-blur-md transition-opacity group-hover/canvas-item:opacity-100"
                                onPointerDown={(event) => event.stopPropagation()}
                                onDragEnter={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  event.dataTransfer.dropEffect = 'copy';
                                }}
                                onDragOver={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  event.dataTransfer.dropEffect = 'copy';
                                }}
                                onDrop={(event) => void handleCanvasWorkflowSlotDrop(
                                  event,
                                  canvasExpandedWorkflowGroup.module.id,
                                  canvasExpandedInternalSlot.id,
                                  canvasItem.id,
                                )}
                              >
                                <button
                                  type="button"
                                  className="min-w-0 flex-1 truncate text-left text-[10px] font-black"
                                  title="使用画布或灵感抽屉当前选中的图片替换"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    assignSelectedImagesToCanvasWorkflowSlot(
                                      canvasExpandedWorkflowGroup.module.id,
                                      canvasExpandedInternalSlot.id,
                                      canvasItem.id,
                                    );
                                  }}
                                >
                                  {canvasExpandedInternalSlot.label}
                                  {canvasExpandedInternalSlot.required ? ' *' : ''}
                                  {canvasExpandedInternalSlot.multiple
                                    ? ` · ${canvasItem.workflowSlotAssets?.length || 0}/${canvasExpandedInternalSlot.maxItems || 12}`
                                    : ''}
                                </button>
                                <button
                                  type="button"
                                  className="flex h-6 w-6 items-center justify-center rounded-full bg-white/12 hover:bg-white/22"
                                  title="从本地选择图片"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    chooseLocalImagesForCanvasWorkflowSlot(
                                      canvasExpandedWorkflowGroup.module.id,
                                      canvasExpandedInternalSlot.id,
                                      canvasItem.id,
                                    );
                                  }}
                                >
                                  <Upload className="h-3 w-3" />
                                </button>
                                {canvasExpandedInternalSlot.clearable !== false && (
                                  <button
                                    type="button"
                                    className="flex h-6 w-6 items-center justify-center rounded-full bg-white/12 hover:bg-red-500/70"
                                    title="清空槽位"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      replaceCanvasWorkflowSlotAssets(
                                        canvasExpandedWorkflowGroup.module.id,
                                        canvasExpandedInternalSlot.id,
                                        [],
                                        canvasItem.id,
                                      );
                                    }}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            )}
                            {!canvasExpandedInternalSlot && <button
                              data-no-drag="true"
                              type="button"
                              className="absolute right-1.5 top-1.5 z-50 flex h-7 w-7 items-center justify-center rounded-[10px] border border-white/72 bg-white/88 text-stone-400 opacity-0 shadow-[0_5px_16px_rgba(15,23,42,0.14)] backdrop-blur-xl transition-[opacity,color,background-color,transform] hover:bg-red-50 hover:text-red-500 active:scale-95 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 group-hover/canvas-item:opacity-100 dark:border-white/10 dark:bg-stone-950/82 dark:text-white/50 dark:shadow-[0_7px_20px_rgba(0,0,0,0.30)] dark:hover:bg-red-500/14 dark:hover:text-red-300"
                              style={isCanvasAiNodeItem ? {
                                left: Math.max(6, canvasRenderedItemWidth - 34),
                                right: 'auto',
                                top: 6,
                              } : undefined}
                              onPointerDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                removeCanvasItemsByIds([canvasItem.id]);
                              }}
                              title="从画布移除"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>}
                            </div>
                          );
}
