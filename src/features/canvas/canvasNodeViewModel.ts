import { CANVAS_AI_DEFAULT_ASPECT_RATIO } from '../../utils/canvasAiAspectRatio';
import { CANVAS_AI_DEFAULT_OUTPUT_FORMAT,CANVAS_AI_DEFAULT_VIDEO_DURATION,CANVAS_AI_DEFAULT_VIDEO_RESOLUTION,CANVAS_AI_IMAGE_RESOLUTION_OPTIONS,CANVAS_AI_OUTPUT_FORMAT_OPTIONS,CANVAS_AI_VIDEO_DURATIONS,CANVAS_AI_VIDEO_DURATION_OPTIONS,CANVAS_AI_VIDEO_RESOLUTIONS,CANVAS_AI_VIDEO_RESOLUTION_OPTIONS,canvasAiProviderForCloudKind,getCanvasAiDefaultModel,normalizeCanvasAiProvider,parseCanvasAiModelChoiceValue } from '../../utils/canvasAiConfig';
import { createCanvasAiOutputBufferItem,getCanvasAiOutputDisplaySource,getCanvasAiSuccessfulOutputs,getCanvasItemDisplaySource,getCanvasOriginalImageSource,getCanvasWorkflowTemplateFromNode,isCanvasAgentTextTarget,isCanvasWorkflowReferenceBridge } from '../../utils/canvasItemSelectors';
import { getCanvasAiOutputPreviewSlots,getCanvasWorkflowGroup } from '../../utils/canvasWorkflowRuntime';
import { getCanvasAiImageResolutionValues,getCanvasAiImageResolutionValuesForCandidates,getCanvasAiVideoReferenceSlotLabels,getCanvasAiVideoReferenceSlots,getMikotoVideoDurationValues,getMikotoVideoResolutionValues,getMiniMaxH3VideoResolutionValues,getNewApiVideoDurationValues,getNewApiVideoResolutionValues,hydrateCanvasAiModelCandidateCapabilities,isMiniMaxH3VideoModel,isSeedance20VideoModel,isSeedanceLikeVideoModel,normalizeCanvasAiImageResolutionForCandidates,normalizeCanvasAiImageResolutionForModel,normalizeCanvasAiOutputFormat,normalizeMikotoVideoDuration,normalizeMikotoVideoResolution,normalizeMiniMaxH3VideoResolution,normalizeNewApiVideoDurationForModel,normalizeNewApiVideoResolutionForModel,selectCanvasAiImageCandidatesForResolution,supportsCanvasAiTransparentPng } from '../canvasAiImage';
import { CANVAS_AI_GENERATOR_NODE_DEFAULT_WIDTH,getCanvasAiOutputTileLayout,getCanvasAiPromptAutoHeight } from '../canvasAiNodeLayout';
import { getCanvasAiVisibleOutputs } from '../canvasAiOutputs';
import { getCanvasAiMediaType,isCanvasAiGeneratedType,isCanvasAiGeneratorType } from '../canvasAiRuntime';
import { estimateCanvasImageGenerationCredits,estimateCanvasTextAgentCredits,estimateCanvasVideoGenerationCredits,estimateCanvasWorkflowCredits,shouldShowCanvasGenerationCredits } from '../canvasGenerationCredits';
import type { CanvasImageItem } from '../canvasModel';
import type { BufferItem } from '../../types';
import type { CloudImageModelsResult } from '../../types/license';
import { getCanvasWorkflowInternalSlotNodes,isReplaceableInternalImageSlot } from '../canvasWorkflowInternalSlots';
import { normalizeCanvasWorkflowUserInput } from '../canvasWorkflowUserInput';
import { normalizeDesignAgentConfig } from '../designAgentNode';

export type CanvasNodeViewModelScope = Record<string, any>;

export function buildCanvasNodeViewModel(scope: CanvasNodeViewModelScope, canvasItem: CanvasImageItem) {
  const { canvasAgent, canvasAiCloudImageModels, canvasAiCredentialSource, canvasAiExpandedOutputNodeIds, canvasAiPromptEditingId, canvasAiProvider, canvasItems, canvasItemsById, canvasRenderScale, canvasSelectedIdsSet, canvasTextAgentRunningIds, getCanvasAiNodeDesignSizeForItem, getCanvasAiResolvedModel, getCanvasAiUnifiedImageModelValue, getCanvasImageInputBufferItemsForNode, getStableCanvasImageSource } = scope;
const isSelected = canvasSelectedIdsSet.has(canvasItem.id);
                          const isTextCanvasItem = canvasItem.item.type === 'text';
                          const isCanvasTextAgentRunning = isTextCanvasItem && canvasTextAgentRunningIds.includes(canvasItem.id);
                          const isCanvasTextPlainMode = isTextCanvasItem && canvasItem.textMode === 'plain';
                          const canvasDesignAgentConfig = normalizeDesignAgentConfig(canvasItem.designAgentConfig);
                          const isCanvasAiGeneratorItem = isCanvasAiGeneratorType(canvasItem.ai?.type);
                          const isCanvasFrameInterpolationItem = canvasItem.ai?.type === 'frame-interpolation';
                          const isCanvasImageEnhancementItem = canvasItem.ai?.type === 'image-enhancement';
                          const isCanvasVideoEnhancementItem = canvasItem.ai?.type === 'video-enhancement';
                          const isQuickVideoEnhancementItem = isCanvasVideoEnhancementItem && canvasItem.ai?.enhancementEngine === 'quick';
                          const isCanvasEnhancementItem = isCanvasImageEnhancementItem || isCanvasVideoEnhancementItem;
                          const isCanvasSingleVideoInputItem = isCanvasFrameInterpolationItem || isCanvasVideoEnhancementItem;
                          const isCanvasWorkflowItem = canvasItem.ai?.type === 'workflow';
                          const isCanvasReferenceBridgeItem = isCanvasWorkflowReferenceBridge(canvasItem);
                          const isCanvasAiNodeItem = isCanvasAiGeneratorItem || isCanvasWorkflowItem;
                          const isCanvasThreeSceneItem = canvasItem.item.type === 'three-scene' && !!canvasItem.threeScene;
                          const canvasThreeSceneReferences = isCanvasThreeSceneItem
                            ? (canvasItem.inputs || []).map((inputId) => {
                              const inputNode = canvasItemsById.get(inputId);
                              if (!inputNode) return null;
                              if (inputNode.item.type === 'image') {
                                return {
                                  id: inputId,
                                  name: inputNode.item.name || inputNode.item.content,
                                  source: getCanvasOriginalImageSource(inputNode.item) || getCanvasItemDisplaySource(inputNode.item),
                                };
                              }
                              const output = getCanvasAiSuccessfulOutputs(inputNode)
                                .find(candidate => (candidate.mediaType || getCanvasAiMediaType(inputNode.ai)) === 'image');
                              return output ? {
                                id: inputId,
                                name: output.name || inputNode.item.name,
                                source: getCanvasAiOutputDisplaySource(output),
                              } : null;
                            }).filter((reference): reference is { id: string; name: string | undefined; source: string } => !!reference)
                            : [];
                          const canvasAiMediaType = getCanvasAiMediaType(canvasItem.ai);
                          const canvasAiItemProvider = normalizeCanvasAiProvider(
                            canvasItem.ai?.provider || (canvasAiMediaType === 'video' ? 'xais-chat' : canvasAiProvider)
                          );
                          const canvasAiItemModel = getCanvasAiResolvedModel(canvasAiItemProvider, canvasItem.ai?.model, canvasAiMediaType);
                          const canvasAiItemCapabilities = canvasAiMediaType === 'image'
                            ? canvasAiCloudImageModels?.channels?.find((channel: NonNullable<CloudImageModelsResult['channels']>[number]) => (
                              channel.id === canvasItem.ai?.providerChannelId
                              && canvasAiProviderForCloudKind(channel.provider) === canvasAiItemProvider
                            ))?.capabilities
                              || canvasItem.ai?.providerCandidates?.find(candidate => (
                                candidate.provider === canvasAiItemProvider
                                && candidate.model === canvasAiItemModel
                              ))?.capabilities
                            : undefined;
                          const canvasAiItemProviderCandidates = hydrateCanvasAiModelCandidateCapabilities(
                            canvasItem.ai?.providerCandidates || [],
                            canvasAiCloudImageModels?.channels,
                          );
                          const canvasAiCandidateImageResolutionValues = getCanvasAiImageResolutionValuesForCandidates(
                            canvasAiItemProviderCandidates,
                          );
                          const canvasAiImageResolutionValues = canvasAiCandidateImageResolutionValues.length > 0
                            ? canvasAiCandidateImageResolutionValues
                            : getCanvasAiImageResolutionValues(
                              canvasAiItemProvider,
                              canvasAiItemModel,
                              canvasAiItemCapabilities,
                            );
                          const canvasAiSupportsImageResolution = canvasAiMediaType === 'image'
                            && canvasAiImageResolutionValues.length > 0;
                          const canvasAiImageResolutionOptions = CANVAS_AI_IMAGE_RESOLUTION_OPTIONS.filter(option => (
                            canvasAiImageResolutionValues.includes(option.value as '1k' | '2k' | '4k')
                          ));
                          const canvasAiItemImageResolution = canvasAiCandidateImageResolutionValues.length > 0
                            ? normalizeCanvasAiImageResolutionForCandidates(
                              canvasAiItemProviderCandidates,
                              canvasItem.ai?.resolution,
                            )
                            : normalizeCanvasAiImageResolutionForModel(
                              canvasAiItemProvider,
                              canvasAiItemModel,
                              canvasItem.ai?.resolution,
                              canvasAiItemCapabilities,
                            );
                          const isCanvasAiNewApiVideo = canvasAiMediaType === 'video' && canvasAiItemProvider === 'new-api';
                          const isCanvasAiSeedanceVideo = canvasAiMediaType === 'video'
                            && isSeedance20VideoModel(canvasAiItemModel);
                          const isCanvasAiSeedanceLikeVideo = canvasAiMediaType === 'video'
                            && isSeedanceLikeVideoModel(canvasAiItemModel);
                          const isCanvasAiMiniMaxVideo = canvasAiMediaType === 'video'
                            && canvasAiItemProvider === 'minimax'
                            && isMiniMaxH3VideoModel(canvasAiItemModel);
                          const isCanvasAiMikotoVideo = canvasAiMediaType === 'video' && canvasAiItemProvider === 'mikoto';
                          const isCanvasAiMikotoKlingVideo = isCanvasAiMikotoVideo
                            && /^kling(?:-omni)?-video$/i.test(String(canvasAiItemModel || '').trim());
                          const canvasAiVideoResolutionValues = isCanvasAiMikotoVideo
                            ? getMikotoVideoResolutionValues(canvasAiItemModel)
                            : isCanvasAiMiniMaxVideo
                            ? getMiniMaxH3VideoResolutionValues()
                            : isCanvasAiSeedanceLikeVideo
                            ? getMikotoVideoResolutionValues(canvasAiItemModel)
                            : isCanvasAiNewApiVideo
                              ? getNewApiVideoResolutionValues(canvasAiItemModel)
                              : CANVAS_AI_VIDEO_RESOLUTIONS;
                          const canvasAiVideoResolutionOptions = isCanvasAiMiniMaxVideo
                            ? canvasAiVideoResolutionValues.map(value => ({ value, label: value }))
                            : CANVAS_AI_VIDEO_RESOLUTION_OPTIONS.filter(option => (
                              canvasAiVideoResolutionValues.includes(option.value)
                            ));
                          const canvasAiVideoResolution = isCanvasAiMikotoVideo
                            ? normalizeMikotoVideoResolution(canvasAiItemModel, canvasItem.ai?.resolution)
                            : isCanvasAiMiniMaxVideo
                            ? normalizeMiniMaxH3VideoResolution(canvasItem.ai?.resolution)
                            : isCanvasAiSeedanceLikeVideo
                            ? normalizeMikotoVideoResolution(canvasAiItemModel, canvasItem.ai?.resolution)
                            : isCanvasAiNewApiVideo
                              ? normalizeNewApiVideoResolutionForModel(canvasAiItemModel, canvasItem.ai?.resolution)
                              : canvasItem.ai?.resolution || CANVAS_AI_DEFAULT_VIDEO_RESOLUTION;
                          const canvasAiVideoDurationValues = isCanvasAiMikotoVideo
                            ? getMikotoVideoDurationValues(canvasAiItemModel)
                            : isCanvasAiSeedanceLikeVideo
                            ? getMikotoVideoDurationValues(canvasAiItemModel)
                            : isCanvasAiNewApiVideo
                            ? getNewApiVideoDurationValues(canvasAiItemModel)
                            : CANVAS_AI_VIDEO_DURATIONS;
                          const canvasAiVideoDurationOptions = CANVAS_AI_VIDEO_DURATION_OPTIONS.filter(option => (
                            canvasAiVideoDurationValues.includes(Number(option.value))
                          ));
                          const canvasAiVideoDuration = isCanvasAiMikotoVideo
                            ? normalizeMikotoVideoDuration(canvasAiItemModel, canvasItem.ai?.duration)
                            : isCanvasAiSeedanceLikeVideo
                            ? normalizeMikotoVideoDuration(canvasAiItemModel, canvasItem.ai?.duration)
                            : isCanvasAiNewApiVideo
                            ? normalizeNewApiVideoDurationForModel(canvasAiItemModel, canvasItem.ai?.duration)
                            : canvasItem.ai?.duration || CANVAS_AI_DEFAULT_VIDEO_DURATION;
                          const canvasAiVideoSupportsFirstLastFrame = !(
                            isCanvasAiNewApiVideo && canvasAiItemModel === 'sora-2'
                          );
                          const canvasAiSupportsTransparentPng = supportsCanvasAiTransparentPng(
                            canvasAiItemProvider,
                            canvasAiItemModel,
                          );
                          const canvasAiOutputFormat = normalizeCanvasAiOutputFormat(
                            canvasAiItemProvider,
                            canvasAiItemModel,
                            canvasItem.ai?.outputFormat || CANVAS_AI_DEFAULT_OUTPUT_FORMAT,
                          );
                          const canvasAiOutputFormatOptions = CANVAS_AI_OUTPUT_FORMAT_OPTIONS.map(option => (
                            option.value === 'png' && !canvasAiSupportsTransparentPng
                              ? {
                                ...option,
                                disabled: true,
                                hint: '仅 Image2 支持透明 PNG',
                              }
                              : option
                          ));
                          const isCanvasWorkflowAllOutputMode = isCanvasWorkflowItem && canvasItem.ai?.workflowOutputMode !== 'final';
                          const canvasWorkflow = isCanvasWorkflowItem ? getCanvasWorkflowTemplateFromNode(canvasItem) : null;
                          const canvasWorkflowInternalSlots = isCanvasWorkflowItem
                            ? getCanvasWorkflowInternalSlotNodes(canvasWorkflow)
                            : [];
                          const canvasExpandedWorkflowGroup = getCanvasWorkflowGroup(canvasItem);
                          const canvasExpandedWorkflow = canvasExpandedWorkflowGroup
                            ? getCanvasWorkflowTemplateFromNode(canvasExpandedWorkflowGroup.module)
                            : null;
                          const canvasExpandedInternalSlotNode = canvasExpandedWorkflow?.nodes.find(node => (
                            node.id === canvasExpandedWorkflowGroup?.templateId
                            && isReplaceableInternalImageSlot(node)
                          ));
                          const canvasExpandedInternalSlot = canvasExpandedInternalSlotNode?.internalSlot;
                          const canvasWalletPricing = canvasAiCloudImageModels?.pricing;
                          // Keep the estimate visible while pricing is being
                          // refreshed. The credit helpers provide conservative
                          // client defaults until the wallet pricing arrives.
                          const showCanvasRunCreditEstimate = shouldShowCanvasGenerationCredits(canvasAiCredentialSource);
                          const canvasImagePricingChoice = canvasItem.ai?.type === 'image-generator'
                            ? parseCanvasAiModelChoiceValue(getCanvasAiUnifiedImageModelValue(
                              canvasAiItemProvider,
                              canvasAiItemModel,
                              canvasItem.ai?.providerChannelId,
                            ))
                            : null;
                          const canvasImagePricingCandidates = canvasImagePricingChoice
                            ? selectCanvasAiImageCandidatesForResolution(
                              canvasImagePricingChoice.providerCandidates?.length
                                ? canvasImagePricingChoice.providerCandidates
                                : [{
                                  source: canvasImagePricingChoice.source,
                                  provider: canvasImagePricingChoice.provider,
                                  model: canvasImagePricingChoice.model,
                                  providerChannelId: canvasImagePricingChoice.providerChannelId,
                                }],
                              canvasAiItemImageResolution,
                            )
                            : [];
                          const canvasImagePricingModel = canvasImagePricingCandidates[0]?.model || canvasAiItemModel;
                          const canvasImagePricingCapabilities = canvasImagePricingCandidates[0]?.capabilities
                            || canvasAiItemCapabilities;
                          const canvasWorkflowCreditEstimate = showCanvasRunCreditEstimate && isCanvasWorkflowItem
                            ? estimateCanvasWorkflowCredits(canvasWorkflow, {
                              resolveImageModel: node => getCanvasAiDefaultModel(normalizeCanvasAiProvider(
                                node.ai?.provider || canvasAiProvider,
                              )),
                              pricing: canvasWalletPricing,
                            })
                            : null;
                          const canvasImageCreditEstimate = showCanvasRunCreditEstimate && canvasItem.ai?.type === 'image-generator'
                            ? estimateCanvasImageGenerationCredits({
                              model: canvasImagePricingModel,
                              resolution: canvasAiItemImageResolution,
                              count: canvasItem.ai.count,
                              capabilities: canvasImagePricingCapabilities,
                            }, canvasWalletPricing)
                            : null;
                          const canvasVideoPricingReferences = canvasItem.ai?.type === 'video-generator'
                            ? getCanvasImageInputBufferItemsForNode(canvasItem, canvasItems)
                            : [];
                          const canvasVideoPricingReferenceCounts = {
                            imageCount: canvasVideoPricingReferences.filter((item: BufferItem) => item.type === 'image').length,
                            videoCount: canvasVideoPricingReferences.filter((item: BufferItem) => item.type === 'video').length,
                          };
                          const canvasVideoCreditEstimate = showCanvasRunCreditEstimate && canvasItem.ai?.type === 'video-generator'
                            ? estimateCanvasVideoGenerationCredits({
                              model: canvasAiItemModel,
                              count: canvasItem.ai.count,
                              duration: canvasAiVideoDuration,
                              resolution: canvasAiVideoResolution,
                            }, canvasWalletPricing, canvasVideoPricingReferenceCounts)
                            : null;
                          const isCanvasAgentWalletFunding = canvasAgent.settings.apiProvider.trim().toLowerCase() === 'unmind-wallet'
                            || canvasAgent.settings.apiCredentialSource === 'cloud_wallet';
                          const canvasTextCreditEstimate = isCanvasAgentWalletFunding && isCanvasAgentTextTarget(canvasItem)
                            ? estimateCanvasTextAgentCredits(canvasWalletPricing, canvasDesignAgentConfig.agentRole)
                            : null;
                          const canvasWorkflowCreditNodeLabel = canvasWorkflowCreditEstimate
                            ? [
                              canvasWorkflowCreditEstimate.imageNodeCount > 0
                                ? `${canvasWorkflowCreditEstimate.imageNodeCount}图片节点`
                                : '',
                              canvasWorkflowCreditEstimate.videoNodeCount > 0
                                ? `${canvasWorkflowCreditEstimate.videoNodeCount}视频节点`
                                : '',
                              canvasWorkflowCreditEstimate.llmNodeCount > 0
                                ? `${canvasWorkflowCreditEstimate.llmNodeCount}LLM节点`
                                : '',
                            ].filter(Boolean).join(' + ')
                            : '';
                          const canvasRunCreditLabel = canvasWorkflowCreditEstimate
                            ? `${canvasWorkflowCreditNodeLabel || '工作流'} · ${canvasWorkflowCreditEstimate.totalCredits}积分`
                            : canvasImageCreditEstimate
                              ? `${canvasImageCreditEstimate.totalCredits}积分`
                              : canvasVideoCreditEstimate
                                ? `${canvasVideoCreditEstimate.totalCredits}积分`
                                : canvasTextCreditEstimate
                                  ? `${canvasTextCreditEstimate.totalCredits}积分`
                              : '';
                          const canvasRunCreditTitle = canvasWorkflowCreditEstimate
                            ? `预计需要 ${canvasWorkflowCreditEstimate.totalCredits} 积分：图片 ${canvasWorkflowCreditEstimate.imageOutputCount} 张（${canvasWorkflowCreditEstimate.imageCredits} 积分）；视频 ${canvasWorkflowCreditEstimate.videoOutputCount} 条（${canvasWorkflowCreditEstimate.videoCredits} 积分）；LLM ${canvasWorkflowCreditEstimate.llmNodeCount} 次（${canvasWorkflowCreditEstimate.llmCredits} 积分）`
                            : canvasImageCreditEstimate
                              ? `预计需要 ${canvasImageCreditEstimate.totalCredits} 积分：生成 ${canvasImageCreditEstimate.outputCount} 张，每张 ${canvasImageCreditEstimate.unitCredits} 积分`
                              : canvasVideoCreditEstimate
                                ? `预计需要 ${canvasVideoCreditEstimate.totalCredits} 积分：${canvasVideoCreditEstimate.creditsPerSecond} 积分/秒 × ${canvasVideoCreditEstimate.durationSeconds} 秒 × ${canvasVideoCreditEstimate.outputCount} 条；已计入 ${canvasVideoPricingReferenceCounts.imageCount} 张参考图和 ${canvasVideoPricingReferenceCounts.videoCount} 段参考视频`
                                : canvasTextCreditEstimate
                                  ? `预计需要 ${canvasTextCreditEstimate.totalCredits} 积分：运行 ${canvasDesignAgentConfig.agentRole === 'inspiration_analyzer' ? '灵感分析' : 'Agent'} 1 次`
                                : undefined;
                          const canvasWorkflowUserInput = isCanvasWorkflowItem
                            ? normalizeCanvasWorkflowUserInput(canvasWorkflow?.userInput)
                            : null;
                          const canvasWorkflowAllowsImages = canvasWorkflowUserInput?.acceptImages !== false;
                          const canvasWorkflowAllowsFiles = canvasWorkflowUserInput?.acceptFiles === true;
                          const showCanvasAiAttachmentControl = !isCanvasWorkflowItem
                            || canvasWorkflowAllowsImages
                            || canvasWorkflowAllowsFiles;
                          const canvasAiOutputs = isCanvasAiNodeItem ? getCanvasAiOutputPreviewSlots(canvasItem) : [];
                          const canvasAiImagePreviewGallery = canvasAiOutputs.flatMap((output, outputIndex) => {
                            const mediaType = output.mediaType || canvasAiMediaType;
                            if (mediaType !== 'image' || output.status === 'error' || !getCanvasAiOutputDisplaySource(output)) return [];
                            const previewItem = createCanvasAiOutputBufferItem(canvasItem, output, outputIndex);
                            return previewItem ? [previewItem] : [];
                          });
                          const isCanvasAiOutputsExpanded = canvasAiExpandedOutputNodeIds.has(canvasItem.id);
                          const canvasAiVisibleOutputs = getCanvasAiVisibleOutputs(canvasAiOutputs, isCanvasAiOutputsExpanded);
                          const canvasAiHiddenOutputCount = Math.max(0, canvasAiOutputs.length - canvasAiVisibleOutputs.length);
                          const canvasAiRealOutputs = isCanvasAiNodeItem ? canvasItem.ai?.outputs || [] : [];
                          const showCanvasAiOutputPreview = isCanvasWorkflowItem || canvasAiRealOutputs.length > 0;
                          const isCanvasAiPromptExpanded = canvasAiPromptEditingId === canvasItem.id;
                          const canvasImageSource = canvasItem.item.type === 'image'
                            ? getStableCanvasImageSource(canvasItem)
                            : getCanvasItemDisplaySource(canvasItem.item);
                          const hasCanvasImageBackingSource = canvasItem.item.type !== 'image'
                            || !!(canvasItem.item.url || canvasItem.item.path || canvasItem.item.thumbnail || canvasItem.item.sourceUrl || canvasItem.item.originalUrl);
                          const hasCanvasImageDisplaySource = canvasItem.item.type !== 'image' || !!canvasImageSource;
                          const isGeneratedMediaItem = isCanvasAiGeneratedType(canvasItem.ai?.type);
                          const isGeneratedVideoItem = canvasItem.ai?.type === 'generated-video';
                          const isGeneratedMediaPending = isGeneratedMediaItem && (canvasItem.ai?.status === 'working' || !hasCanvasImageDisplaySource);
                          const isGeneratedMediaError = isGeneratedMediaItem && canvasItem.ai?.status === 'error';
                          const rawCanvasInputPreviewItems = (canvasItem.inputs || [])
                            .map(inputId => canvasItemsById.get(inputId))
                            .filter((item): item is CanvasImageItem => !!item);
                          const canvasBridgeInputItems = isCanvasReferenceBridgeItem
                            ? getCanvasImageInputBufferItemsForNode(canvasItem, canvasItems)
                            : [];
                          const canvasAiOutputAspectRatio = canvasAiOutputs[0]?.width && canvasAiOutputs[0]?.height
                            ? `${canvasAiOutputs[0].width}:${canvasAiOutputs[0].height}`
                            : canvasItem.ai?.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO;
                          const canvasAiNodeDesignSize = isCanvasAiNodeItem
                            ? getCanvasAiNodeDesignSizeForItem(canvasItem, isCanvasAiPromptExpanded, isCanvasAiOutputsExpanded)
                            : null;
                          const canvasAiMainColumnLayoutWidth = canvasItem.ai?.type === 'image-generator'
                            ? CANVAS_AI_GENERATOR_NODE_DEFAULT_WIDTH
                            : canvasAiNodeDesignSize?.width || canvasItem.width;
                          const isImageRulePanelExpanded = canvasItem.ai?.type === 'image-generator'
                            && canvasItem.ai.imagePolicy?.panelExpanded !== false;
                          const canvasAiOutputTileLayout = isCanvasAiNodeItem && canvasAiNodeDesignSize && showCanvasAiOutputPreview
                            ? getCanvasAiOutputTileLayout({
                              width: canvasAiMainColumnLayoutWidth,
                              aspectRatio: canvasAiOutputAspectRatio,
                              outputCount: canvasAiVisibleOutputs.length || undefined,
                              count: canvasItem.ai?.count,
                              isWorkflow: isCanvasWorkflowItem,
                            })
                            : null;
                          const canvasAiNodeScale = canvasAiNodeDesignSize
                            ? Math.min(canvasItem.width / canvasAiNodeDesignSize.width, canvasItem.height / canvasAiNodeDesignSize.height)
                            : 1;
                          const canvasAiMenuScale = (canvasAiNodeScale || 1) * canvasRenderScale;
                          const canvasRenderedItemWidth = canvasAiNodeDesignSize
                            ? canvasAiNodeDesignSize.width * (canvasAiNodeScale || 1)
                            : canvasItem.width;
                          const canvasAiPromptHeight = isCanvasAiGeneratorItem && canvasAiNodeDesignSize
                            ? getCanvasAiPromptAutoHeight(canvasItem.item.content || '', canvasAiMainColumnLayoutWidth, isCanvasAiPromptExpanded)
                            : 0;
                          const canvasVideoReferenceSlots = getCanvasAiVideoReferenceSlots(
                            canvasAiItemModel,
                            canvasItem.ai?.videoInputMode,
                            canvasAiItemProvider,
                          );
                          const canvasVideoInputMode = canvasVideoReferenceSlots.mode;
                          const canvasVideoReferenceSlotLabels = getCanvasAiVideoReferenceSlotLabels(
                            canvasAiItemModel,
                            canvasVideoInputMode,
                            canvasAiItemProvider,
                          );
                          const canvasAllowsSeedanceOmniReferences = !isCanvasAiSeedanceVideo
                            || canvasVideoReferenceSlots.mode === 'REF';
                          const isCanvasVeoIngredientMode = isCanvasAiNewApiVideo
                            && canvasAiItemModel !== 'sora-2'
                            && canvasVideoInputMode === 'REF';
  return { isSelected, isTextCanvasItem, isCanvasTextAgentRunning, isCanvasTextPlainMode, canvasDesignAgentConfig, isCanvasAiGeneratorItem, isCanvasFrameInterpolationItem, isCanvasImageEnhancementItem, isCanvasVideoEnhancementItem, isQuickVideoEnhancementItem, isCanvasEnhancementItem, isCanvasSingleVideoInputItem, isCanvasWorkflowItem, isCanvasReferenceBridgeItem, isCanvasAiNodeItem, isCanvasThreeSceneItem, canvasThreeSceneReferences, canvasAiMediaType, canvasAiItemProvider, canvasAiItemModel, canvasAiItemCapabilities, canvasAiItemProviderCandidates, canvasAiCandidateImageResolutionValues, canvasAiImageResolutionValues, canvasAiSupportsImageResolution, canvasAiImageResolutionOptions, canvasAiItemImageResolution, isCanvasAiNewApiVideo, isCanvasAiSeedanceVideo, isCanvasAiSeedanceLikeVideo, isCanvasAiMiniMaxVideo, isCanvasAiMikotoVideo, isCanvasAiMikotoKlingVideo, canvasAiVideoResolutionValues, canvasAiVideoResolutionOptions, canvasAiVideoResolution, canvasAiVideoDurationValues, canvasAiVideoDurationOptions, canvasAiVideoDuration, canvasAiVideoSupportsFirstLastFrame, canvasAiSupportsTransparentPng, canvasAiOutputFormat, canvasAiOutputFormatOptions, isCanvasWorkflowAllOutputMode, canvasWorkflow, canvasWorkflowInternalSlots, canvasExpandedWorkflowGroup, canvasExpandedWorkflow, canvasExpandedInternalSlotNode, canvasExpandedInternalSlot, canvasWalletPricing, showCanvasRunCreditEstimate, canvasImagePricingChoice, canvasImagePricingCandidates, canvasImagePricingModel, canvasImagePricingCapabilities, canvasWorkflowCreditEstimate, canvasImageCreditEstimate, canvasVideoPricingReferences, canvasVideoPricingReferenceCounts, canvasVideoCreditEstimate, isCanvasAgentWalletFunding, canvasTextCreditEstimate, canvasWorkflowCreditNodeLabel, canvasRunCreditLabel, canvasRunCreditTitle, canvasWorkflowUserInput, canvasWorkflowAllowsImages, canvasWorkflowAllowsFiles, showCanvasAiAttachmentControl, canvasAiOutputs, canvasAiImagePreviewGallery, isCanvasAiOutputsExpanded, canvasAiVisibleOutputs, canvasAiHiddenOutputCount, canvasAiRealOutputs, showCanvasAiOutputPreview, isCanvasAiPromptExpanded, canvasImageSource, hasCanvasImageBackingSource, hasCanvasImageDisplaySource, isGeneratedMediaItem, isGeneratedVideoItem, isGeneratedMediaPending, isGeneratedMediaError, rawCanvasInputPreviewItems, canvasBridgeInputItems, canvasAiOutputAspectRatio, canvasAiNodeDesignSize, canvasAiMainColumnLayoutWidth, isImageRulePanelExpanded, canvasAiOutputTileLayout, canvasAiNodeScale, canvasAiMenuScale, canvasRenderedItemWidth, canvasAiPromptHeight, canvasVideoReferenceSlots, canvasVideoInputMode, canvasVideoReferenceSlotLabels, canvasAllowsSeedanceOmniReferences, isCanvasVeoIngredientMode };
}
