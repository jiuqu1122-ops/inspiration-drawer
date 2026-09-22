// MODEL_CATALOG_STABILITY_PATCH_V1
// src/App.tsx
import {
ArchiveRestore,
CalendarDays,
Copy,
Edit3,
File as FileIcon,
Film,
Image as ImageIcon,
Layers,
LayoutGrid,
Type
} from 'lucide-react';
import React,{ useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState } from 'react';
import type { CanvasActionMenuPlacement } from './components/CanvasListItems';
import {
CanvasListItem,
CanvasRailItem,
CanvasTrashListItem,
} from './components/CanvasListItems';
import {
SnipOverlay
} from './components/SnipOverlay';

import { convertFileSrc,invoke } from '@tauri-apps/api/core';
import { emitTo,listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';

import { AppToastHost,showAppToast } from './components/AppToastHost';
import { useBrowserExtensionDragCollector } from './features/browserExtension/useBrowserExtensionDragCollector';
import type { ChatGeneratedMedia,ChatImageModelOption } from './features/chat/model/chatTypes';
import {
getCanvasChatVisibility,
setCanvasChatVisibility,
subscribeCanvasChatVisibility
} from './features/chat/runtime/canvasChatVisibility';
import {
setCanvasWorkflowProgress
} from './features/chat/runtime/canvasWorkflowProgress';
import {
cacheAvailableAgentModels,
clearAvailableAgentModels,
resolveValidAgentModel
} from './features/chat/runtime/agentModelResolution';
import type {
ChatBatchCompletedPayload,
ChatBatchMediaReadyPayload,
ChatBatchStartedPayload,
} from './features/chat/runtime/useChatRuntime';
import { runChatMediaGeneration } from './features/chat/tools/chatGenerationBridge';
import { createInspirationChatToolExecutor } from './features/chat/tools/inspirationChatToolExecutor';
import {
readCachedCloudAccount
} from './features/cloudAccountSync';
import { CloudAccountProvider } from './features/cloudAccountContext';
import { CREDIT_RECHARGE_OPEN_EVENT } from './features/recharge/CreditRechargeOverlay';
import {
scheduleCloudAccountQuotaRefresh,
setCloudAccountQuotaRefreshHandler
} from './features/cloudAccountQuotaRefresh';
import type { SceneAnalysisV1 } from './features/three/model/threeSceneAnalysisTypes';
import type { SceneSpecV1 } from './features/three/model/threeSceneTypes';
import { useAppUpdate } from './hooks/useAppUpdate';
import {
CANVAS_AI_CUSTOM_PROMPTS_STORAGE_KEY,
CANVAS_AI_HIDDEN_BUILT_IN_PROMPTS_STORAGE_KEY,
CANVAS_AI_PROMPT_PRESET_ADD_VALUE,
CANVAS_AI_PROMPT_PRESET_MANAGE_VALUE,
CANVAS_AI_PROMPT_PRESET_PLACEHOLDER,
CANVAS_CUSTOM_WORKFLOWS_STORAGE_KEY,
CANVAS_HIDDEN_BUILT_IN_WORKFLOWS_STORAGE_KEY,
CANVAS_TEMPLATE_EXPORT_TYPE,
CANVAS_TEMPLATE_EXPORT_VERSION,
CANVAS_WORKFLOW_MANAGE_VALUE,
CANVAS_WORKFLOW_SAVE_SELECTION_VALUE,
CANVAS_WORKFLOW_SELECT_PLACEHOLDER,
readCanvasTemplateHiddenIds,
readCustomCanvasAiPromptPresets,
readCustomCanvasWorkflows
} from './services/canvasTemplateStorage';
import { BufferItem,FloatingNoteScheduleItem,FloatingNoteSnapshot,Folder } from './types';
import type {
CanvasAiOutputThumbnailJob,
CanvasGeneratedListEntry,
CanvasImageSourceCacheEntry,
CanvasNavPreview,
CanvasNavThumbnailCacheEntry
} from './types/canvasMedia';
import type {
ActiveShortcutScope,
CanvasAiXaisBalanceState,
CanvasBrushCropRect,
CanvasBrushEditorMode,
CanvasBrushEditorOpenOptions,
CanvasBrushEditorState,
CanvasBrushPoint,
CanvasBrushShapeMode,
CanvasContextMenuState,
CanvasFolderMediaPickerState,
CanvasPersistedState,
CanvasReferenceDragState,
CanvasReferenceReplaceTarget,
CanvasUndoSnapshot,
CanvasViewportRect,
} from './types/canvasRuntime';
import type {
CanvasAiPromptPreset,
CanvasWorkflowExpandedGroup
} from './types/canvasWorkflow';
import type {
ConfirmDialogState,
TextInputDialogOptions,
TextInputDialogState,
} from './types/dialogs';
import type {
DrawerClassificationView,
DrawerSidebarLayout,
DrawerTabType,
DrawerUndoSnapshot,
FolderContextMenuState,
} from './types/drawer';
import type {
CloudAccountSummary,
CloudCreditUsageEntry,
CloudImageModelsResult,
LicenseEdition,
LicenseState,
LicenseStatus
} from './types/license';
import type { VirtualDropUiJob } from './types/virtualDrop';
import type {
LocalVisionModelDownloadState,
WebImageCaptureMetadata,
WebImageCollectorReference,
WebImageSearchDescription
} from './types/webImageCollector';
import {
CANVAS_AI_DEFAULT_ASPECT_RATIO,
formatCanvasAiAspectRatioOptionLabel,
getCanvasAiAspectRatioOptionsForModel,
normalizeCanvasAiAspectRatioForModel
} from './utils/canvasAiAspectRatio';
import {
CANVAS_AI_CREDENTIAL_SOURCE_STORAGE_KEY,
CANVAS_AI_DEFAULT_IMAGE_RESOLUTION,
CANVAS_AI_ENDPOINT_STORAGE_KEY,
CANVAS_AI_NEW_API_VIDEO_KEY_STORAGE_KEY,
CANVAS_AI_PROVIDER_DEFAULT_VERSION,
CANVAS_AI_PROVIDER_DEFAULT_VERSION_STORAGE_KEY,
CANVAS_AI_PROVIDER_STORAGE_KEY,
canvasAiGatewayKindForProvider,
canvasAiGroupedModelChoiceValue,
canvasAiProviderForCloudKind,
canvasAiProviderForGateway,
defaultCanvasAiApiProvider,
getCanvasAiApiKeyStorageKey,
getCanvasAiApiProviderStorageKey,
getCanvasAiEndpointStorageKey,
getCanvasAiHeadersStorageKey,
getStoredCanvasAiApiKey,
getStoredCanvasAiApiProvider,
getStoredCanvasAiCredentialSource,
getStoredCanvasAiEndpoint,
getStoredCanvasAiHeadersText,
getStoredCanvasAiProvider,
parseCanvasAiModelChoiceValue,
readStoredCanvasAiMikotoModels,
readStoredCanvasAiNewApiModels,
readStoredCanvasAiOpenAiModels,
readStoredCanvasAiXaisModels
} from './utils/canvasAiConfig';
import {
getAiGeneratedImageFolderIds
} from './utils/canvasGeneratedFolders';
import {
blobToDataUrl,
imageDataUrlToJpegDataUrl
} from './utils/canvasImageData';
import {
readImageDisplaySize
} from './utils/canvasImageSize';
import {
canUseCanvasItemAsAiInput,
canUseCanvasItemAsAiTarget,
canUseCanvasItemAsFrameInterpolationVideoInput,
canUseCanvasItemAsImageEnhancementInput,
canUseCanvasItemAsVideoEnhancementInput,
createCanvasAiOutputBufferItem,
getCanvasAiSuccessfulOutputs,
getCanvasBufferItemNavPreview,
getCanvasItemDisplaySource,
getCanvasItemNavSource,
getCanvasOutputNavPreview,
getCanvasWorkflowGroupIdForSelection,
getCanvasWorkflowTemplateFromNode
} from './utils/canvasItemSelectors';
import {
cloneDrawerValue,
stripCanvasItemDataImageProvenance
} from './utils/canvasSerialization';
import {
CANVAS_AI_PROMPT_PRESETS,
CANVAS_BUILT_IN_WORKFLOWS,
createCanvasImagePolicy,
getCanvasImageRuleState
} from './utils/canvasWorkflowDefinitions';
import {
getCanvasAiOutputPreviewSlots,
getCanvasWorkflowGroup
} from './utils/canvasWorkflowRuntime';
import {
isCanvasImageFileName
} from './utils/localMediaPaths';
import { AppFontSizeProvider,useAppFontSize } from './features/preferences/AppFontSizeContext';

const ENABLE_THREE_SCENE_CREATION = false;

import { type RoundedSelectOption } from './components/RoundedSelect';
import {
DEFAULT_AGENT_SETTINGS,
type AgentCanvasSelectionItem,
type AgentCanvasVisualReference,
type WorkflowResultCardData
} from './features/agentModel';
import { readAgentSidebarWidth,writeAgentSidebarWidth } from './features/agentStorage';
import {
type ImageRuleKey
} from './features/appAgent/imageQuality/imageRuleCapsules';
import {
canRetryInspirationAnalysis,
getInspirationAnalysisRetryAt,
hasUsableInspirationAiTags,
isRetryableInspirationAnalysisFailure,
shouldSkipInspirationAnalysis,
type DrawerSearchInspirationsInput,
type InspirationAnalysisJob,
type InspirationCandidate,
type InspirationProfile
} from './features/appAgent/inspirationMemory';
import {
type ProfileOrganizationPlan
} from './features/appAgent/inspirationMemory/profileOrganizer';
import type { WorkflowRecipeDraft } from './features/appAgent/workflows/workflowRecipeTypes';
import { prepareAgentVisualReferences } from './features/canvasAgentVisualReferences';
import {
getCanvasAiMediaType,
isCanvasAiGeneratorType
} from './features/canvasAiRuntime';
import { buildCanvasGeneratedItemsForList } from './features/canvasGeneratedList';
import {
getCanvasGroupOutlines
} from './features/canvasGroups';
import { clamp } from './features/common';
import {
isPromptSharePayload,
type InspirationShare,
type InspirationSpaceDrawerImageOption,
type InspirationSpacePreparedTemplate,
type InspirationSpaceTemplateKind,
type InspirationSpaceTemplateOption,
} from './features/inspirationSpace/model';
import { useEventCallback } from './features/useEventCallback';
import {
DEFAULT_CANVAS_ID,
DEFAULT_LIBRARY_ID,
DEFAULT_PROJECT_ID,
listDeletedCanvases,
patchCanvasNodes,
type CanvasRecord
} from './services/canvasApi';
import {
type CanvasImageFusionRole
} from './utils/canvasImageFusion';
import {
type CanvasContextRoutingTarget
} from './utils/canvasTextContextRouting';

const sortCanvasesNewestFirst = (items: CanvasRecord[]) => (
  [...items].sort((a, b) => (
    (b.sortOrder - a.sortOrder) || (b.createdAt - a.createdAt)
  ))
);

import { AppDialogHost } from './app/components/AppDialogHost';
import { AppPrimaryOverlays } from './app/components/AppPrimaryOverlays';
import { applyFloatingNoteDestroyImpl,beginFloatingTextUndoImpl,cancelByokCustomizationImpl,chooseWebImageCacheDirImpl,closeFloatingNoteByLabelImpl,confirmCloudAccountLogoutImpl,createBlankFloatingNoteImpl,createFloatingNoteImpl,enforceAntiTouchClosedImpl,focusFloatingNoteImpl,getCanvasAiUnifiedImageModelValueImpl,getLatestFileCacheDirImpl,handleDrawerCardWheelImpl,loadCloudCreditUsageImpl,pushDrawerUndoSnapshotImpl,redeemCloudCreditsImpl,refreshCloudAccountImpl,refreshLicenseStatusImpl,requestEmailCodeImpl,resetWebImageCacheDirImpl,restoreDrawerUndoSnapshotImpl,setCanvasInteractionActiveImpl,setExternalDragActiveImpl,takeDrawerUndoSnapshotImpl,updateDrawerItemsDeferredImpl,verifyEmailAccountImpl } from './app/controllers/appLifecycleActions';
import { runAppLifecycleEffect01,runAppLifecycleEffect02,runAppLifecycleEffect03,runAppLifecycleEffect04,runAppLifecycleEffect05,runAppLifecycleEffect06,runAppLifecycleEffect07,runAppLifecycleEffect08,runAppLifecycleEffect09,runAppLifecycleEffect10,runAppLifecycleEffect11,runAppLifecycleEffect12,runAppLifecycleEffect13,runAppLifecycleEffect14,runAppLifecycleEffect15,runAppLifecycleEffect16,runAppLifecycleEffect17,runAppLifecycleEffect18,runAppLifecycleEffect19,runAppLifecycleEffect20,runAppLifecycleEffect21 } from './app/controllers/appLifecycleEffects';
import { EdgeTrigger } from './features/EdgeTrigger';
import {
AI_CLASSIFICATION_DIMENSIONS,
buildAiClassificationGroups,
itemMatchesAiClassification,
type AiClassificationDimension,
} from './features/aiClassification';
import { analyzeDrawerInspirationWithLlmImpl,buildCanvasAgentSelectedItemsImpl,enqueueAutoAiTaggingForItemsImpl,getCanvasAgentVisualReferencesForNodeInputsImpl,getCanvasAgentVisualReferencesImpl,recordAutoAiAnalysisFailureImpl,retrieveDrawerInspirationCandidatesImpl,startDrawerInspirationAnalysisBatchImpl } from './features/appAgent/inspirationAgentActions';
import { runInspirationAgentEffect01,runInspirationAgentEffect02 } from './features/appAgent/inspirationAgentEffects';
import { useCanvasAgentBridge } from './features/appAgent/runtime/useCanvasAgentBridge';
import {
addLocalDays,
compareCalendarEvents,
getLocalDateKey,
normalizeSchedulePriority,
startOfLocalDay,
type CalendarScheduleEvent,
type SchedulePriority
} from './features/calendarModel';
import { runDerivedUiEffect01,runDerivedUiEffect02,runDerivedUiEffect03,runDerivedUiEffect04,runDerivedUiEffect05,runDerivedUiEffect06,runDerivedUiEffect07 } from './features/canvas/controllers/canvasDerivedEffects';
import { cancelCanvasEnhancementEstimateImpl,chooseLocalAudiosForCanvasGeneratorImpl,cloneCanvasAiGeneratorForRerunImpl,disconnectCanvasInputImpl,generateCanvasAiGeneratorNodeImpl,getCanvasAiRerunNodePositionImpl,getCanvasEnhancementInputImpl,getFrameInterpolationEstimateKeyImpl,getFrameInterpolationVideoInputImpl,pickCanvasImageForGeneratorImpl,runCanvasAiGeneratorNodeImpl,runCanvasAiGeneratorTargetImpl,runCanvasEnhancementNodeImpl,runCanvasFrameInterpolationNodeImpl,startCanvasConnectionDragImpl,startCanvasInputActionDragImpl,startCanvasReferenceLongPressImpl,startPickCanvasImageForGeneratorImpl } from './features/canvas/controllers/canvasGenerationActions';
import { runCanvasGenerationEffect01,runCanvasGenerationEffect02,runCanvasGenerationEffect03 } from './features/canvas/controllers/canvasGenerationEffects';
import { addCanvasAiGeneratorNodeAtWorldImpl,addCanvasAiGeneratorNodeImpl,addCanvasAiVideoGeneratorNodeAtWorldImpl,addCanvasAiVideoGeneratorNodeImpl,addCanvasEnhancementNodeAtWorldImpl,addCanvasEnhancementNodeImpl,addCanvasFrameInterpolationNodeAtWorldImpl,addCanvasFrameInterpolationNodeImpl,addCanvasImageFusionNodeAtWorldImpl,addCanvasImageFusionNodeImpl,buildCanvasAiGeneratorNodeImpl,buildCanvasEnhancementNodeImpl,buildCanvasFrameInterpolationNodeImpl,buildCanvasImageFusionNodeImpl,buildCanvasWorkflowModuleNodeImpl,deleteCanvasAiPromptPresetIdsImpl,deleteSelectedCanvasPromptPresetsImpl,exportCanvasTemplateFileImpl,getCanvasImageInputsForNodeImpl,getCanvasTemplateImportPayloadImpl,importCanvasTemplateFileImpl,instantiateCanvasWorkflowTemplateItemsImpl,openCanvasPresetManagerImpl,publishLocalAiInputsImpl,saveCanvasAiCustomPromptPresetImpl,stopTemporaryReferenceSharesImpl,updateCanvasNodesForPresetImpl,uploadWalletReferenceInputsImpl,uploadXaisReferenceInputsImpl } from './features/canvas/controllers/canvasInputActions';
import { addCanvasSearchMediaCandidateImpl,addCanvasWebImageUrlImpl,addFolderMediaToCanvasImpl,buildCanvasDrawerFolderNameImpl,cacheWebImageFromCandidatesImpl,centerCanvasItemInViewImpl,claimExternalWebImageDropImpl,clampCanvasSurfaceScrollImpl,closeCanvasFolderMediaPickerImpl,copyCanvasItemsToDrawerFolderImpl,createWorkflowAttachmentImageCanvasNodeImpl,enterCanvasModeImpl,fitCanvasViewToItemsImpl,getCanvasNestedWheelScrollerImpl,handleCanvasDropImpl,leaveCanvasToDrawerImpl,loadCanvasFolderMediaPageImpl,normalizeCanvasWheelDeltaImpl,requestAddFolderMediaToCanvasImpl,runCanvasWorkbenchWindowActionImpl,runDrawerWorkbenchWindowActionImpl,scheduleCanvasFocusItemByIdImpl,scheduleCanvasFocusNearestContentIfViewportEmptyImpl,scheduleCanvasWheelZoomImpl,startCanvasGroupResizeImpl,startCanvasItemDragImpl,startCanvasItemResizeImpl,startCanvasPanImpl,startCanvasSelectionImpl,startMainDrawerLongPressImpl,writeCanvasSurfaceScrollImpl,zoomCanvasAtImpl } from './features/canvas/controllers/canvasInteractionActions';
import { runCanvasInteractionsEffect01,runCanvasInteractionsEffect02,runCanvasInteractionsEffect03,runCanvasInteractionsEffect04 } from './features/canvas/controllers/canvasInteractionEffects';
import { runCanvasPasteWithViewportPreserved } from './features/canvasPasteViewport';
import { activateCanvasBrushToolImpl,addCanvasTextItemAtWorldImpl,addCanvasTextItemImpl,applyCanvasBrushCropImpl,autoScrollCanvasNearEdgeImpl,cacheCanvasGeneratedImageSourceImpl,commitCanvasTextDraftImpl,commitCanvasTextOutputDraftImpl,copyCanvasImageToSystemClipboardImpl,copyCanvasItemsImpl,copyCanvasItemsToAvailableClipboardsImpl,copyCanvasTextOutputImpl,copyImageDataUrlToSystemClipboardImpl,copyImageSourceToSystemClipboardImpl,copySelectedImagePreviewToClipboardImpl,createCanvasAiOutputDraftsImpl,createCanvasAudioItemFromPathImpl,createCanvasContextMenuStateImpl,createCanvasGroupImpl,createCanvasImageItemFromPathImpl,createCanvasImagePreviewThumbnailImpl,createCanvasTextItemFromContentImpl,createCanvasVideoItemFromPathImpl,drawCanvasBrushEditorBaseImpl,enqueueCanvasAiOutputThumbnailJobImpl,expandCanvasBeforeViewportImpl,finishCanvasBrushStrokeImpl,getCanvasBrushShapeBoxImpl,getCanvasClipboardImageFilesImpl,getCanvasContextRoutingTargetsForAgentImpl,getCanvasImageInputBufferItemsForNodeImpl,getCanvasTextInputsForNodeImpl,handleCanvasBrushPointerDownImpl,handleCanvasBrushPointerMoveImpl,handleDoodleKeyDownImpl,imageSourceToDataUrlImpl,normalizeCanvasBrushCropRectImpl,openCanvasBrushEditorFromSourceImpl,openCanvasBrushEditorImpl,paintCanvasBrushShapeImpl,paintCanvasBrushStrokeImpl,pasteCanvasItemsImpl,pasteSystemClipboardToCanvasImpl,prepareCanvasAiInputSourceImpl,pushCanvasBrushHistoryImpl,redoCanvasBrushStrokeImpl,renameCanvasGroupImpl,runNextCanvasAiOutputThumbnailJobImpl,saveCanvasBrushEditedImageImpl,setCanvasDesignAgentConfigImpl,setCanvasTextContextRoutingImpl,settleCanvasAiOutputThumbnailJobImpl,shiftCanvasWorldImpl,undoCanvasBrushStrokeImpl,ungroupCanvasItemsImpl,updateCanvasBrushCursorFromEventImpl,updateCanvasTextItemImpl,updateCanvasTextOutputItemImpl } from './features/canvas/controllers/canvasMediaActions';
import { runCanvasMediaEffect01 } from './features/canvas/controllers/canvasMediaEffects';
import { addCanvasThreeSceneGeneratorNodeImpl,analyzeCanvasThreeSceneNodeImpl,appendCanvasItemsImpl,applyCanvasSelectionDomFeedbackImpl,beginCanvasZoomInteractionImpl,cancelCanvasItemDragVisualsImpl,captureThreeSceneViewImpl,clearCanvasItemInteractionStylesImpl,commitCanvasScaleSoonImpl,commitCanvasSelectionImpl,confirmPermanentlyDeleteCanvasPageImpl,confirmSoftDeleteCanvasPageImpl,copyCanvasAiOutputToCanvasImpl,createNewCanvasPageImpl,downgradeCanvasPreviewSourcesImpl,duplicateCanvasPageImpl,enableCanvasWorkflowSingleEditForItemImpl,enqueueCanvasBackgroundWriteImpl,expandCanvasSelectionIdsWithGroupsImpl,finishCanvasZoomInteractionImpl,flushCanvasInteractionFrameImpl,getCanvasAiNodeDesignSizeForItemImpl,getCanvasAiOutputCopyPositionImpl,getCanvasPointFromClientImpl,getStableCanvasImageSourceImpl,getThreeSceneAnalysisImagesImpl,hideCanvasSelectionOverlayImpl,loadCanvasItemsImpl,moveCanvasPageToTrashImpl,normalizeCanvasSelectionBoxImpl,openCanvasTrashImpl,organizeCanvasItemsImpl,paintCanvasDragChromeImpl,pushCanvasUndoSnapshotImpl,refreshCanvasConnectionHandleOcclusionImpl,refreshCanvasesImpl,removeCanvasConnectionImpl,removeCanvasItemsByIdsImpl,renameCanvasPageImpl,resetCanvasDragChromeImpl,restoreCanvasItemBoxStylesImpl,restoreCanvasUndoSnapshotImpl,restoreDeletedCanvasPageImpl,runCanvasImageSourceUpgradeQueueImpl,saveCanvasPageElementsToDrawerImpl,saveCanvasStateNowImpl,saveCurrentCanvasAsSnapshotImpl,saveCurrentCanvasBeforeSwitchImpl,scheduleCanvasChangedNodesPatchSaveImpl,scheduleCanvasScaleRenderSyncImpl,scheduleCanvasSelectionImageSourcesImpl,scheduleCanvasStateSaveImpl,scheduleCanvasVisibleImageSourceUpgradesImpl,setCanvasItemDraggingFlagImpl,setCanvasSizeImmediateImpl,setThreeSceneRunStateImpl,settleCanvasZoomBeforePointerInteractionImpl,shouldUpgradeCanvasImageSourceImpl,switchToCanvasImpl,syncCanvasSelectionFrameStylesImpl,takeCanvasUndoSnapshotImpl,trimCanvasPreviewSourceCacheImpl,updateCanvasItemsDeferredImpl,updateCanvasItemsImmediateImpl,updateThreeScenePreviewImpl,updateThreeSceneReferenceOverlayImpl,updateThreeSceneSpecImpl } from './features/canvas/controllers/canvasPersistenceActions';
import { runCanvasPersistenceEffect01 } from './features/canvas/controllers/canvasPersistenceEffects';
import { addCanvasAiGeneratorNodeForSourcesImpl,addCanvasAiVideoGeneratorNodeForSourcesImpl,addCanvasEnhancementNodeForSourcesImpl,addCanvasFrameInterpolationNodeForSourcesImpl,addCanvasTextInputForGeneratorImpl,addCanvasWorkflowTemplateImpl,applyCanvasAiGeneratorDataPatchImpl,applyCanvasImageFusionConnectionPatchImpl,assignDrawerImageToCanvasWorkflowSlotImpl,assignSelectedImagesToCanvasWorkflowSlotImpl,buildCanvasWorkflowSaveDraftFromSelectionImpl,buildCanvasWorkflowTemplateFromExpandedGroupImpl,chooseLocalFilesForCanvasWorkflowImpl,chooseLocalImagesForCanvasGeneratorImpl,chooseLocalVideosForCanvasGeneratorImpl,collapseCanvasWorkflowGroupImpl,collapseCanvasWorkflowGroupNowImpl,commitCanvasAiPromptDraftImpl,confirmSaveCanvasWorkflowImpl,connectCanvasItemsImpl,connectCanvasItemsToGeneratorImpl,connectSelectedCanvasItemsToGeneratorImpl,deleteCanvasWorkflowIdsImpl,deleteSelectedCanvasWorkflowsImpl,expandCanvasWorkflowModuleForEditImpl,exportCanvasWorkflowModuleInstanceImpl,getCanvasWorkflowSlotAssetFromCanvasItemImpl,getSelectedCanvasWorkflowSlotAssetsImpl,handleCanvasGeneratorUploadImpl,handleCanvasWorkflowFileUploadImpl,handleCanvasWorkflowSlotDropImpl,openCanvasWorkflowManagerImpl,optimizeCanvasPromptImpl,replaceCanvasGeneratorReferenceImpl,replaceCanvasWorkflowManagerWithSelectionImpl,replaceCanvasWorkflowSlotAssetsImpl,replaceExpandedCanvasWorkflowSlotImpl,resizeCanvasAiPromptEditorImpl,rotateCanvasImageClockwiseImpl,saveCanvasWorkflowManagerChangesImpl,setCanvasWorkflowOutputModeImpl,toggleCanvasAiOutputsExpandedImpl,toggleCanvasImageRulePanelImpl,updateCanvasAiGeneratorDataForCanvasImpl,updateCanvasImageRuleImpl,updateCanvasNodeForCanvasImpl,updateCanvasWorkflowModuleNodesForTemplateImpl,updateCollapsedCanvasWorkflowSlotImpl } from './features/canvas/controllers/canvasWorkflowEditorActions';
import { addCanvasDroppedFilesImpl,addCanvasDroppedPathsImpl,addCanvasDroppedTemplateJsonSourcesImpl,addCanvasTemplateValuesAtDropImpl,cloneCanvasWorkflowModuleForRerunImpl,createDrawerMediaCanvasNodeImpl,generateCanvasWorkflowModuleNodeImpl,growCanvasNearViewportEdgeImpl,retryCanvasCollapsedWorkflowOutputImpl,retryCanvasExpandedWorkflowOutputImpl,retryCanvasWorkflowOutputImpl,runCanvasExpandedWorkflowFromNodeImpl,runCanvasWorkflowModuleNodeImpl,runSelectedCanvasWorkflowModulesImpl } from './features/canvas/controllers/canvasWorkflowRuntimeActions';
import {
CANVAS_AI_IMAGE_MODEL_MENU_NAMES,
CANVAS_AI_VIDEO_MODEL_OPTIONS,
getCanvasAiImageResolutionValues,
getCanvasAiImageResolutionValuesForCandidates,
getCanvasAiPublicImageModelId,
getCanvasAiPublicImageModelVariantName,
isCanvasAiPublicImageModel
} from './features/canvasAiImage';
import { findAiCatalogModel,getAiCatalogModels,getChannelModelCapabilities,getDefaultAiCatalogModelId,getImageAspectRatioOptionsForResolution,hasServerAiCatalog,mergeAiModelCapabilities,normalizeCapabilityOption,resolveImageModelCapabilities } from './features/aiModelCapabilities';
import {
CANVAS_AI_COLLAPSED_OUTPUT_PREVIEW_LIMIT
} from './features/canvasAiOutputs';
import {
isCanvasDrawerMediaItem,
type CanvasDrawerMediaItem
} from './features/canvasDrawerMedia';
import {
CANVAS_BASE_HEIGHT,
CANVAS_BASE_WIDTH,
CANVAS_GROW_CHUNK,
CANVAS_MAX_SCALE,
CANVAS_MIN_SCALE,
type CanvasAiCredentialSource,
type CanvasAiGeneratedOutput,
type CanvasAiModelCandidate,
type CanvasAiProvider,
type CanvasImageItem,
type CanvasItemBox,
type CanvasResizeCorner,
type CanvasWorkflowRuntime,
type CanvasWorkflowSlotAsset,
type DesignAgentConfig
} from './features/canvasModel';
import {
type CanvasWorkflowInternalSlot,
type CanvasWorkflowSaveDraft,
type CanvasWorkflowTemplate
} from './features/canvasTemplates';
import {
applyCanvasWorkflowSlotAssetToItem,
createCanvasWorkflowSlotAssetFromItem,
getCanvasWorkflowInternalSlotNodes
} from './features/canvasWorkflowInternalSlots';
import {
embedCanvasWorkflowFixedImages,
materializeCanvasWorkflowFixedImages,
materializeCanvasWorkflowInstance
} from './features/canvasWorkflowPortableImages';
import {
normalizeCanvasWorkflowUserInput
} from './features/canvasWorkflowUserInput';
import { addChatMediaToCanvasImpl,buildCanvasTextAgentUserContentImpl,completeChatBatchCanvasGroupImpl,createChatBatchCanvasGroupImpl,fillChatBatchCanvasSlotImpl,runCanvasTextAgentNodeImpl,runCanvasTextAgentTargetImpl,saveAgentCustomApiImpl,switchAgentFundingSourceImpl } from './features/chat/runtime/chatCanvasActions';
import { runChatCanvasEffect01,runChatCanvasEffect02 } from './features/chat/runtime/chatCanvasEffects';
import {
DESIGN_AGENT_ARTIFACT_LABELS,
DESIGN_AGENT_ARTIFACT_TYPES,
DESIGN_AGENT_ROLES,
DESIGN_AGENT_ROLE_LABELS,
DESIGN_AGENT_THINKING_MODES,
DESIGN_AGENT_THINKING_MODE_LABELS
} from './features/designAgentNode';
import {
normalizeDraggedUrl
} from './features/dragData';
import { DrawerShell } from './features/drawer/components/DrawerShell';
import { addDroppedPathsImpl,addWebImageUrlImpl,createFolderAndMoveSelectedImpl,deleteDrawerFoldersImpl,downloadBufferItemsImpl,downloadCanvasItemsByIdsImpl,exportFileNameForItemImpl,getDraggedDrawerFolderIdsImpl,getDraggedDrawerItemIdImpl,handleAddFolderImpl,handleDeleteFolderImpl,handleDrawerFolderDragStartImpl,handleDrawerFolderSelectionClickImpl,handleDrawerItemDragOverFolderImpl,handleDrawerItemDropToFolderImpl,handleDrawerItemSelectImpl,handleExportSelectedItemsImpl,handleFolderContextMenuImpl,handleRenameFolderImpl,importBrowserExtensionImageToCanvasImpl,importBrowserExtensionImageToDrawerImpl,moveDrawerFoldersToParentImpl,moveSelectedItemsToFolderImpl,openMoveExistingFolderModalImpl,resolveExternalDragLocalPathImpl,startDrawerFolderPointerDragImpl,startDrawerItemPointerDragImpl,startNativeDrawerItemDragImpl } from './features/drawer/controllers/drawerAssetActions';
import { runDrawerAssetsEffect01,runDrawerAssetsEffect02,runDrawerAssetsEffect03,runDrawerAssetsEffect04,runDrawerAssetsEffect05,runDrawerAssetsEffect06 } from './features/drawer/controllers/drawerAssetEffects';
import { addCalendarScheduleItemImpl,addGeneratedImagesToDrawerImpl,addGeneratedVideosToDrawerImpl,applyFloatingTextPayloadToSnapshotsImpl,broadcastFloatingNoteTextUpdateImpl,broadcastFloatingNoteTitleUpdateImpl,deleteCalendarScheduleItemImpl,deleteDrawerLocalFilesImpl,ensureAiGeneratedVideoFolderImpl,ensureCalendarScheduleNoteImpl,ensureCanvasAiGeneratedFolderImpl,ensureImageThumbnailImpl,ensureVideoThumbnailImpl,flushImageThumbnailUpdatesImpl,getCanvasDropPositionImpl,notifyCanvasAiGenerationResultImpl,patchCalendarScheduleItemImpl,persistFoldersSnapshotImpl,renderCalendarEventImpl,requestDeleteDrawerItemsImpl,runNextImageThumbnailJobsImpl,saveDrawerItemsNowImpl,scheduleDrawerItemsSaveImpl,sendSystemNotificationImpl,shouldAcceptMobilePayloadImpl,syncCalendarScheduleSnapshotImpl,testCanvasAiConnectionImpl } from './features/drawer/controllers/drawerCoreActions';
import { runDrawerCoreEffect01,runDrawerCoreEffect02,runDrawerCoreEffect03,runDrawerCoreEffect04,runDrawerCoreEffect05,runDrawerCoreEffect06,runDrawerCoreEffect07,runDrawerCoreEffect08,runDrawerCoreEffect09,runDrawerCoreEffect10,runDrawerCoreEffect11,runDrawerCoreEffect12 } from './features/drawer/controllers/drawerCoreEffects';
import { getCanvasItemRenderedBoxImpl,renderDrawerFolderListItemImpl,renderDrawerFolderRailItemImpl } from './features/drawer/controllers/drawerRenderActions';
import { useDrawerAssetQuery } from './features/drawer/useDrawerAssetQuery';
import {
useDrawerSearch
} from './features/drawer/useDrawerSearch';
import {
CALENDAR_COMPACT_CANVAS_WIDTH,
CALENDAR_COMPACT_DRAWER_WIDTH,
DEFAULT_DRAWER_HEIGHT,
DEFAULT_DRAWER_WIDTH,
DRAWER_CONTENT_X_PADDING,
DRAWER_SIDE_RAIL_WIDTH,
MAX_DRAWER_HEIGHT,
MAX_DRAWER_WIDTH,
MIN_DRAWER_HEIGHT,
MIN_DRAWER_WIDTH,
getStoredDrawerSize,
migrateDrawerSizeDefaults
} from './features/drawerPrefs';
import { useEagleImport } from './features/eagle/useEagleImport';
import {
FOLDERS_CACHE_STORAGE_KEY,
deleteFloatingNoteSnapshot,
getFolderTagIds,
readFloatingNoteSnapshot,
readOpenFloatingNoteLabels
} from './features/floatingNotes';
import {
flattenDrawerFolderTree,
getDrawerFolderPathName,
getDrawerFolderScopeIds,
isDrawerFolderDescendant,
normalizeDrawerFolders
} from './features/folderModel';
import { LruCache } from './features/lruCache';
import { announceLocalVisionModelReadyImpl,checkCanvasAiXaisBalanceImpl,checkLocalVisionModelStatusImpl,checkLocalXaisBalanceImpl,chooseReferenceImageForCollectorImpl,collectWebImagesToDrawerImpl,describeReferenceImageForSearchImpl,ensureLocalVisionModelImpl,generateQueryAndCollectFromReferenceImpl,getCanvasAiResolvedModelImpl,handleLocalVisionModelProgressImpl,handleOpenFolderModalImpl,installOllamaSilentlyImpl,normalizeRemoteImageSearchDescriptionImpl,refreshCanvasAiOpenAiModelsImpl,remoteImageSearchLabelImpl,showLocalVisionModelErrorImpl,toggleAutoStartSettingImpl,toggleDrawerWorkbenchModeImpl,toggleSearchImpl } from './features/settings/settingsActions';
import { runSettingsEffect01,runSettingsEffect02,runSettingsEffect03,runSettingsEffect04,runSettingsEffect05,runSettingsEffect06,runSettingsEffect07,runSettingsEffect08,runSettingsEffect09,runSettingsEffect10,runSettingsEffect11 } from './features/settings/settingsEffects';
import { applyWindowBoundsImpl,blurCanvasActiveTextEntryImpl,closeSelectedImagePreviewImpl,confirmSnipImpl,copyLocalImageToClipboardImpl,createTextOrUrlItemImpl,exitSnipImpl,finishLaunchIntroImpl,finishResizeImpl,finishSnipWindowSessionImpl,getQuickAccessVisualImpl,getSnipPlaceholderUrlImpl,handleCanvasAiRunClickImpl,handleCanvasAiRunPointerDownImpl,handleRecordShortcutImpl,handleSnipSelectionImpl,handleSnipWindowCapturedImpl,handleTogglePinImpl,holdDrawerForPanelInteractionImpl,isCursorInsideDrawerWindowImpl,openQuickAccessItemImpl,openSelectedImagePreviewImpl,openSelectedVideoPreviewImpl,playSnipShutterSoundImpl,recoverSnipWindowFromMainImpl,requestAutoCloseDrawerImpl,resetSnipSessionStateImpl,restoreCanvasAfterMediaPreviewImpl,revealDrawerAfterSnipCopyImpl,runCanvasAiNodeFromControlImpl,scheduleAutoCloseImpl,scheduleIdleAutoCloseImpl,startDrawerTitleDragImpl,startPreviewWindowDragImpl,startResizingCornerImpl,startResizingFolderSidebarWidthImpl,startResizingHeightImpl,startResizingRightCornerImpl,startResizingSidebarAreasImpl,startResizingWidthImpl,startSelectedImagePanDragImpl,startSnipImpl,stepSelectedImageGalleryImpl } from './features/snip/windowSnipActions';
import { runWindowSnipEffect01,runWindowSnipEffect02,runWindowSnipEffect03,runWindowSnipEffect04,runWindowSnipEffect05,runWindowSnipEffect06,runWindowSnipEffect07,runWindowSnipEffect08,runWindowSnipEffect09,runWindowSnipEffect10,runWindowSnipEffect11,runWindowSnipEffect12,runWindowSnipEffect13,runWindowSnipEffect14,runWindowSnipEffect15,runWindowSnipEffect16 } from './features/snip/windowSnipEffects';
import {
clearLegacyStartupFlags,
isLaunchIntroDoneThisPage
} from './features/startup';
import { EDGE_WIDTH,getStoredTriggerMode,type TriggerMode } from './features/triggerModel';
import {
SILICONFLOW_DEFAULT_ENDPOINT,
SILICONFLOW_DEFAULT_MODEL,
isSiliconFlowProvider,
type AiAnalysisConfig,
} from './features/visionAnalysisConfig';
import { useDrawerAssetCache } from './hooks/useDrawerAssetCache';
import {
listAssets,
updateAsset
} from './services/assetsApi';




const shouldShowLegacyAiSettings = (): boolean => false;
const CHAT_IMAGE_MODEL_STORAGE_KEY = 'drawer_chat_image_model';
const CHAT_IMAGE_ASPECT_RATIO_STORAGE_KEY = 'drawer_chat_image_aspect_ratio';
const CHAT_IMAGE_RESOLUTION_STORAGE_KEY = 'drawer_chat_image_resolution';
const LOCAL_VISION_MODEL_STORAGE_KEY = 'drawer_local_vision_model';
const DEFAULT_LOCAL_VISION_MODEL = 'qwen2.5vl:3b';
const LEGACY_LOCAL_VISION_MODEL = 'qwen2.5vl:7b';
const getStoredLocalVisionModel = () => {
  const stored = (localStorage.getItem(LOCAL_VISION_MODEL_STORAGE_KEY) || '').trim();
  if (!stored || stored === LEGACY_LOCAL_VISION_MODEL) {
    localStorage.setItem(LOCAL_VISION_MODEL_STORAGE_KEY, DEFAULT_LOCAL_VISION_MODEL);
    return DEFAULT_LOCAL_VISION_MODEL;
  }
  return stored;
};
const appWindow = getCurrentWindow();
clearLegacyStartupFlags();
const LazyFloatingNoteHost = React.lazy(() => (
  import('./features/FloatingNoteHost').then(module => ({ default: module.FloatingNoteHost }))
));
const LazyInspirationSpaceWindow = React.lazy(() => (
  import('./features/inspirationSpace/InspirationSpaceWindow').then(module => ({ default: module.InspirationSpaceWindow }))
));
const CANVAS_WORKBENCH_MODE_STORAGE_KEY = 'drawer_canvas_workbench_mode';
const DRAWER_WORKBENCH_MODE_STORAGE_KEY = 'drawer_workbench_mode';
const DRAWER_SIDEBAR_LAYOUT_STORAGE_KEY = 'drawer_sidebar_layout';
const DRAWER_CLASSIFICATION_VIEW_STORAGE_KEY = 'drawer_classification_view';
const DRAWER_AI_CLASSIFICATION_DIMENSION_STORAGE_KEY = 'drawer_ai_classification_dimension';
const DRAWER_FOLDER_SIDEBAR_WIDTH_STORAGE_KEY = 'drawer_folder_sidebar_width';
const DRAWER_FOLDER_SIDEBAR_DEFAULT_WIDTH = 260;
const DRAWER_FOLDER_SIDEBAR_MIN_WIDTH = 250;
const DRAWER_FOLDER_SIDEBAR_MAX_WIDTH = 320;
const FOLDER_DRAG_MIME = 'application/x-inspiration-drawer-folder-ids';
const WORKFLOW_SLOT_ASSET_DRAG_MIME = 'application/x-inspiration-workflow-slot-asset-index';
const DRAWER_UNDO_LIMIT = 8;
const CANVAS_UNDO_LIMIT = 6;
const CANVAS_STATE_SAVE_DEBOUNCE_MS = 320;
const DRAWER_ITEMS_SAVE_DEBOUNCE_MS = 360;

const LICENSE_STATE_LABELS: Record<LicenseState, string> = {
  unlicensed: '未授权',
  trial: '高级版',
  pro: '高级版',
  enterprise: '高级版',
  expired: '已过期',
};

const LICENSE_EDITION_LABELS: Record<LicenseEdition, string> = {
  trial: '高级版',
  pro: '高级版',
  enterprise: '高级版',
};

const formatLicenseCommandError = (err: unknown) => (
  String(err || '授权操作失败').replace(/^[a-z_]+:\s*/i, '').trim() || '授权操作失败'
);

const isCanvasBrushShapeMode = (mode: CanvasBrushEditorMode): mode is CanvasBrushShapeMode => (
  mode === 'rectangle' || mode === 'circle' || mode === 'ellipse'
);

const CANVAS_BRUSH_COLORS = [
  '#ef4444',
  '#f59e0b',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#a855f7',
  '#ec4899',
  '#ffffff',
  '#111827',
];
const CANVAS_BRUSH_EDITOR_MAX_EDGE = 2048;

type TemporaryReferenceShare = {
  kind: 'oss' | 'cloudflared' | 'r2';
  id: string;
};

const CANVAS_FOLDER_PICKER_INITIAL_VISIBLE = 24;
const CANVAS_FOLDER_PICKER_VISIBLE_STEP = 24;
const CANVAS_FOLDER_PICKER_SCROLL_EDGE = 96;

type CanvasFolderMediaPagingState = {
  folderKey: string;
  imageOffset: number;
  videoOffset: number;
  imageTotal: number;
  videoTotal: number;
};

const getCanvasAiErrorSummary = (error?: string | null) => {
  const message = String(error || '').replace(/\s+/g, ' ').trim();
  if (!message) return '生成失败，请重试';
  if (/Tmpfiles|Litterbox|R2|r2\.local\.json|兜底|鍏滃簳/i.test(message)) {
    return message.length > 260 ? `${message.slice(0, 260)}...` : message;
  }
  if (/cloudflared|trycloudflare|Cloudflare Tunnel/i.test(message)) {
    return '本地参考图公网分享失败：cloudflared 没有拿到可用链接。请稍后重试，或先改用网络图片作为参考图。';
  }
  return message.length > 180 ? `${message.slice(0, 180)}...` : message;
};

const TABS: { id: DrawerTabType; label: string; icon: any }[] = [
  { id: 'all', label: '全部', icon: LayoutGrid },
  { id: 'image', label: '图片', icon: ImageIcon },
  { id: 'text', label: '文本', icon: Type },
  { id: 'video', label: '视频', icon: Film },
  { id: 'file', label: '文件', icon: FileIcon },
  { id: 'calendar', label: '日历', icon: CalendarDays },
];

const CALENDAR_NOTIFICATIONS_ENABLED_STORAGE_KEY = 'drawer_calendar_notifications_enabled';
const SCREENSHOT_AUTO_PIN_NOTE_STORAGE_KEY = 'drawer_screenshot_auto_pin_note';
const AUTO_INSPIRATION_ANALYSIS_ENABLED = true;
const AUTO_INSPIRATION_ANALYSIS_UI_IDLE_MS = 1200;
const AUTO_INSPIRATION_ANALYSIS_NOTE_PAYLOAD_FIX_KEY = 'drawer_ai_analysis_note_payload_fix_v2';
const AI_GENERATED_IMAGE_PROMPT_NOTE_CLEANUP_KEY = 'drawer_ai_generated_prompt_note_cleanup_v1';
const AUTO_INSPIRATION_ANALYSIS_RETRY_MIGRATION_KEY = 'drawer_ai_analysis_retry_migration_v3';
const CALENDAR_NOTIFICATION_SENT_STORAGE_PREFIX = 'drawer_calendar_notification_sent_';
const CALENDAR_NOTIFICATION_HOURS = [10, 15];
const CALENDAR_NEW_NOTE_TARGET = '__new_calendar_schedule_note__';
const IMAGE_THUMBNAIL_MAX_CONCURRENCY = 2;
const IMAGE_THUMBNAIL_QUEUE_LIMIT = 32;
const IMAGE_THUMBNAIL_UPDATE_BATCH_MS = 90;
// Keep pending longer than the native 4K download plus its one UI retry. The
// recovery effect must not launch a duplicate cache job while the first one is
// still downloading through object storage.
const CANVAS_AI_OUTPUT_CACHE_STALE_MS = 8 * 60_000;
const CANVAS_AI_OUTPUT_SOURCE_RECOVERY_RETRY_DELAY_MS = 8_000;
const GENERATED_IMAGE_CACHE_RETRY_DELAYS_MS = [1_500];
const CANVAS_IMAGE_SOURCE_UPGRADE_CONCURRENCY = 1;
const CANVAS_IMAGE_SOURCE_UPGRADE_BATCH_SIZE = 3;
const CANVAS_IMAGE_SOURCE_UPGRADE_DELAY_MS = 90;
const CANVAS_IMAGE_SOURCE_UPGRADE_MIN_SCALE = 1.15;
const CANVAS_IMAGE_SOURCE_DOWNGRADE_SCALE = 0.65;
const CANVAS_IMAGE_SOURCE_UPGRADE_PIXEL_THRESHOLD = 480;
const CANVAS_IMAGE_SOURCE_UPGRADE_MAX_ACTIVE_PREVIEWS = 3;
const CANVAS_IMAGE_PREVIEW_UPGRADE_ENABLED = true;
const CANVAS_INTERACTION_BACKGROUND_SETTLE_MS = 900;
const CANVAS_INTERACTION_DEBUG = false;
const DATA_THUMBNAIL_RECOMPRESS_MIN_CHARS = 64 * 1024;
const BLANK_NOTE_CREATE_LOCK_STORAGE_KEY = 'drawer_blank_note_create_lock';
const FLOATING_NOTE_CREATE_LOCK_STORAGE_PREFIX = 'drawer_floating_note_create_lock_';
const DRAWER_VIRTUALIZATION_THRESHOLD = 240;
const createAssetId = () => globalThis.crypto.randomUUID();
const PREVIEW_ORIGINAL_CACHE_LIMIT = 5;
const CANVAS_NAV_PANEL_TOP_MARGIN = 12;
const CANVAS_PASTE_OFFSET = 54;
const STARTUP_CONSENT_DELAY_MS = 15000;
const CLOUDFLARED_DISCLAIMER_ACCEPTED_STORAGE_KEY = 'drawer_cloudflared_disclaimer_accepted';
const CANVAS_CONNECTION_HANDLE_OUTSET = 0;
const CANVAS_SELECTION_RADIUS = 18;
const CANVAS_NODE_RADIUS = 20;
const CANVAS_VIEWPORT_OVERSCAN_PX = 480;
const CANVAS_INTERACTION_OVERSCAN_PX = 680;
const CANVAS_GENERATED_LIST_RENDER_LIMIT = 60;
const AI_GENERATED_VIDEO_FOLDER_ID = 'ai_generated_videos';
const AI_GENERATED_VIDEO_FOLDER_NAME = 'AI视频';
const AI_GENERATED_VIDEO_FOLDER_COLOR = '#10b981';
const DESIGN_AGENT_ROLE_OPTIONS: RoundedSelectOption[] = DESIGN_AGENT_ROLES.map(value => ({
  value,
  label: DESIGN_AGENT_ROLE_LABELS[value],
}));
const DESIGN_AGENT_ARTIFACT_OPTIONS: RoundedSelectOption[] = DESIGN_AGENT_ARTIFACT_TYPES.map(value => ({
  value,
  label: DESIGN_AGENT_ARTIFACT_LABELS[value],
}));
const DESIGN_AGENT_THINKING_MODE_OPTIONS: RoundedSelectOption[] = DESIGN_AGENT_THINKING_MODES.map(value => ({
  value,
  label: DESIGN_AGENT_THINKING_MODE_LABELS[value],
}));
const CANVAS_TEXT_CONTEXT_ROUTING_OPTIONS: RoundedSelectOption[] = [
  { value: 'full', label: '完整传递' },
  { value: 'auto', label: '自动分流' },
];
const DRAWER_TOOL_BUTTON_BASE_CLASS = 'inline-flex h-9 min-w-9 items-center justify-center rounded-[9px] border border-stone-200/80 bg-white px-2 text-stone-500 transition-[background-color,border-color,color,transform] duration-200 cursor-pointer hover:bg-stone-50 hover:text-stone-900 active:translate-y-px dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100';
const DRAWER_FOLDER_TONES = [
  {
    active: 'bg-blue-500 text-white shadow-md shadow-blue-500/20 dark:bg-blue-400 dark:text-stone-950 dark:shadow-blue-950/30',
    soft: 'hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-400/12 dark:hover:text-blue-200',
    drag: 'ring-2 ring-blue-300 bg-blue-50 text-blue-600 dark:ring-blue-400/40 dark:bg-blue-400/14 dark:text-blue-200',
    label: 'text-blue-600 dark:text-blue-300',
    badge: 'bg-blue-500 dark:bg-blue-400 dark:text-stone-950',
  },
];
const DRAWER_COLLAPSED_FOLDER_IDS_STORAGE_KEY = 'drawer_collapsed_folder_ids';
const FOLDERS_CACHE_UPDATED_AT_STORAGE_KEY = `${FOLDERS_CACHE_STORAGE_KEY}_updated_at`;
const normalizeDrawerSidebarLayout = (value: string | null): DrawerSidebarLayout => (
  value === 'icons' ? 'icons' : 'folders'
);
const normalizeDrawerClassificationView = (value: string | null): DrawerClassificationView => (
  value === 'ai' ? 'ai' : 'folders'
);
const normalizeAiClassificationDimension = (value: string | null): AiClassificationDimension => (
  AI_CLASSIFICATION_DIMENSIONS.some(option => option.id === value) ? value as AiClassificationDimension : 'product'
);
const readFoldersFromCache = (): { folders: Folder[]; isValid: boolean; updatedAt: number } => {
  const raw = localStorage.getItem(FOLDERS_CACHE_STORAGE_KEY);
  const updatedAt = Number(localStorage.getItem(FOLDERS_CACHE_UPDATED_AT_STORAGE_KEY) || 0) || 0;
  if (raw === null) return { folders: [], isValid: false, updatedAt };
  try {
    const parsed = JSON.parse(raw);
    return {
      folders: Array.isArray(parsed) ? parsed : [],
      isValid: Array.isArray(parsed),
      updatedAt,
    };
  } catch (_) {
    return { folders: [], isValid: false, updatedAt };
  }
};
const emitFloatingNoteUpdated = (label: string, snapshot: FloatingNoteSnapshot) => (
  emitTo({ kind: 'WebviewWindow', label }, 'floating-note-updated', { ...snapshot, targetLabel: label })
);
const emitFloatingNoteSourceUpdated = (label: string, payload: Record<string, unknown>) => (
  emitTo({ kind: 'WebviewWindow', label }, 'floating-note-source-updated', { ...payload, targetLabel: label })
);

const insertDrawerFolderAtTop = (currentFolders: Folder[], folder: Folder) => {
  if (folder.parentId) {
    const firstSiblingIndex = currentFolders.findIndex(item => item.parentId === folder.parentId);
    const insertIndex = firstSiblingIndex >= 0
      ? firstSiblingIndex
      : Math.max(currentFolders.findIndex(item => item.id === folder.parentId) + 1, 0);
    return [
      ...currentFolders.slice(0, insertIndex),
      folder,
      ...currentFolders.slice(insertIndex),
    ];
  }

  const firstRootIndex = currentFolders.findIndex(item => !item.parentId);
  const insertIndex = firstRootIndex >= 0 ? firstRootIndex : 0;
  return [
    ...currentFolders.slice(0, insertIndex),
    folder,
    ...currentFolders.slice(insertIndex),
  ];
};


function MainApp() {
  const isMainDrawerWindow = (appWindow as any).label !== 'edge';
  const shouldShowInitialLaunchIntro = () => isMainDrawerWindow && !isLaunchIntroDoneThisPage();

  const [assetStorageMode, setAssetStorageMode] = useState<'initializing' | 'sqlite' | 'json'>('initializing');
  const [assetLibraryReady, setAssetLibraryReady] = useState(false);
  const [assetStatsRevision, setAssetStatsRevision] = useState(0);
  const {
    assets: items,
    setAssets: setItems,
    replaceAssetsFromQuery,
    appendAssetsFromQuery,
    updateAssetsFromQuery,
    prependAssetsAndPersist,
  } = useDrawerAssetCache({
    storageMode: assetStorageMode,
    onPersisted: () => setAssetStatsRevision(revision => revision + 1),
    onError: error => console.warn('SQLite 素材写入失败:', error),
  });
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<DrawerTabType>('all');
  const [autoAiAnalysisProgress, setAutoAiAnalysisProgress] = useState<{
    completed: number;
    failed: number;
    total: number;
  } | null>(null);
  const [sqliteAiAnalysisSummary, setSqliteAiAnalysisSummary] = useState<{
    analyzed: number;
    skipped: number;
    waitingRetry: number;
    total: number;
  } | null>(null);
  const [autoAiAnalysisRetryTick, setAutoAiAnalysisRetryTick] = useState(0);
  const [isAutoAiAnalysisStartupReady, setIsAutoAiAnalysisStartupReady] = useState(false);
  const itemsRef = useRef<BufferItem[]>([]);
  const inspirationAnalysisJobsRef = useRef(new Map<string, InspirationAnalysisJob>());
  const drawerOrganizationPlansRef = useRef(new Map<string, {
    plan: ProfileOrganizationPlan;
    createdAt: number;
  }>());
  const inspirationRetrievalCacheRef = useRef(new Map<string, { createdAt: number; candidates: InspirationCandidate[] }>());
  const autoInspirationAnalysisAttemptedRef = useRef(new Set<string>());
  const autoInspirationAnalysisPendingIdsRef = useRef(new Set<string>());
  const autoInspirationAnalysisRunningRef = useRef(false);
  const autoInspirationAnalysisStartupRequeueRef = useRef(false);
  const autoInspirationAnalysisRetryTimersRef = useRef(new Set<number>());
  const autoInspirationAnalysisLastUserActivityAtRef = useRef(Date.now());
  const agentModelRef = useRef('unmind-agent');
  const foldersRef = useRef<Folder[]>([]);
  const hasRestoredNonEmptyFoldersRef = useRef(false);
  const activeFolderIdStateRef = useRef<string>('all');
  const activeTabRef = useRef<DrawerTabType>('all');
  const drawerUndoStackRef = useRef<DrawerUndoSnapshot[]>([]);
  const drawerUndoRestoringRef = useRef(false);
  const canvasUndoStackRef = useRef<CanvasUndoSnapshot[]>([]);
  const canvasUndoRestoringRef = useRef(false);
  const drawerItemsSaveTimerRef = useRef<number | null>(null);
  const drawerItemsSaveInFlightRef = useRef(false);
  const drawerItemsSaveQueuedRef = useRef(false);
  const floatingBridgeSeenRef = useRef<Record<string, number>>({});
  const drawerTextEditUndoIdsRef = useRef<Set<string>>(new Set());
  const floatingTextUndoTimersRef = useRef<Record<string, number>>({});
  const blankFloatingNoteCreateLockRef = useRef(false);
  const lastBlankFloatingNoteCreatedAtRef = useRef(0);
  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => () => {
    autoInspirationAnalysisRetryTimersRef.current.forEach(timer => window.clearTimeout(timer));
    autoInspirationAnalysisRetryTimersRef.current.clear();
  }, []);
  useEffect(() => { foldersRef.current = folders; }, [folders]);
  useEffect(() => { activeFolderIdStateRef.current = activeFolderId; }, [activeFolderId]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { localStorage.removeItem('drawer_auto_ai_tags'); }, []);
  useEffect(() => { return runAppLifecycleEffect01({ folders, lastSelectedFolderIdRef, setSelectedFolderIds }); }, [folders]);
  const [isCanvasMode, setIsCanvasMode] = useState(false);
  const [isCanvasWorkbenchMode, setIsCanvasWorkbenchMode] = useState(() => localStorage.getItem(CANVAS_WORKBENCH_MODE_STORAGE_KEY) !== 'false');
  const [isDrawerWorkbenchMode, setIsDrawerWorkbenchMode] = useState(() => localStorage.getItem(DRAWER_WORKBENCH_MODE_STORAGE_KEY) === 'true');
  const isCanvasWorkbenchActive = isCanvasMode && isCanvasWorkbenchMode;
  const isDrawerWorkbenchActive = !isCanvasMode && isDrawerWorkbenchMode;
  const isMainWorkbenchActive = isCanvasWorkbenchActive || isDrawerWorkbenchActive;
  const isCanvasWorkbenchActiveRef = useRef(false);
  const isMainWorkbenchActiveRef = useRef(false);
  useEffect(() => {
    localStorage.setItem(CANVAS_WORKBENCH_MODE_STORAGE_KEY, isCanvasWorkbenchMode ? 'true' : 'false');
  }, [isCanvasWorkbenchMode]);
  useEffect(() => {
    localStorage.setItem(DRAWER_WORKBENCH_MODE_STORAGE_KEY, isDrawerWorkbenchMode ? 'true' : 'false');
  }, [isDrawerWorkbenchMode]);
  useEffect(() => {
    isCanvasWorkbenchActiveRef.current = isCanvasWorkbenchActive;
  }, [isCanvasWorkbenchActive]);
  useEffect(() => {
    isMainWorkbenchActiveRef.current = isMainWorkbenchActive;
    invoke('set_main_workbench_active', { active: isMainWorkbenchActive }).catch((err) => {
      console.warn('set main workbench mode failed:', err);
    });
  }, [isMainWorkbenchActive]);
  const [canvasItems, setCanvasItems] = useState<CanvasImageItem[]>([]);
  const [activeThreeSceneId, setActiveThreeSceneId] = useState<string | null>(null);
  const [threeSceneAnalyzingIds, setThreeSceneAnalyzingIds] = useState<string[]>([]);
  const activeThreeSceneIdRef = useRef<string | null>(null);
  const threeSceneAnalyzingIdsRef = useRef<Set<string>>(new Set());
  const threeSceneHistoryGestureRef = useRef<string | null>(null);
  const [canvasWorkingTimerTick, setCanvasWorkingTimerTick] = useState(() => Date.now());
  const [canvasScale, setCanvasScale] = useState(1);
  const [canvasSize, setCanvasSize] = useState({ width: CANVAS_BASE_WIDTH, height: CANVAS_BASE_HEIGHT });
  const [isCanvasChromeHidden, setIsCanvasChromeHidden] = useState(false);
  const [isCanvasNavigatorVisible, setIsCanvasNavigatorVisible] = useState(() => localStorage.getItem('drawer_canvas_navigator_visible') !== 'false');
  const [isCanvasGeneratedListVisible, setIsCanvasGeneratedListVisible] = useState(() => localStorage.getItem('drawer_canvas_generated_list_visible') !== 'false');
  const [isCanvasGeneratedMultiSelect, setIsCanvasGeneratedMultiSelect] = useState(false);
  const [canvasGeneratedSelectedIds, setCanvasGeneratedSelectedIds] = useState<string[]>([]);
  const [isInspirationSpaceOpen, setIsInspirationSpaceOpen] = useState(false);
  const [isCreditRechargeOpen, setIsCreditRechargeOpen] = useState(false);
  useEffect(() => {
    const openCreditRecharge = () => setIsCreditRechargeOpen(true);
    window.addEventListener(CREDIT_RECHARGE_OPEN_EVENT, openCreditRecharge);
    return () => window.removeEventListener(CREDIT_RECHARGE_OPEN_EVENT, openCreditRecharge);
  }, []);
  const [isDrawerAgentOpen, setIsDrawerAgentOpen] = useState(false);
  const [canvasTextAgentRunningIds, setCanvasTextAgentRunningIds] = useState<string[]>([]);
  const [canvasAgentSidebarWidth, setCanvasAgentSidebarWidth] = useState(readAgentSidebarWidth);
  const [canvasSelectedIds, setCanvasSelectedIds] = useState<string[]>([]);
  const [canvasViewport, setCanvasViewport] = useState<CanvasViewportRect | null>(null);
  const [canvases, setCanvases] = useState<CanvasRecord[]>([]);
  const [activeCanvasId, setActiveCanvasId] = useState(DEFAULT_CANVAS_ID);
  const [canvasActionMenuId, setCanvasActionMenuId] = useState<string | null>(null);
  const [isSwitchingCanvas, setIsSwitchingCanvas] = useState(false);
  const [isCanvasTrashOpen, setIsCanvasTrashOpen] = useState(false);
  const [deletedCanvases, setDeletedCanvases] = useState<CanvasRecord[]>([]);
  const [canvasTrashCount, setCanvasTrashCount] = useState(0);
  const [isLoadingCanvasTrash, setIsLoadingCanvasTrash] = useState(false);
  const [canvasFolderImportPrompt, setCanvasFolderImportPrompt] = useState<CanvasFolderMediaPickerState | null>(null);
  const [canvasConnectionDraft, setCanvasConnectionDraft] = useState<{ fromId: string; sourceIds: string[]; fromX: number; fromY: number; toX: number; toY: number } | null>(null);
  const [canvasInputActionDraft, setCanvasInputActionDraft] = useState<{ targetId: string; fromX: number; fromY: number; toX: number; toY: number } | null>(null);
  const [canvasContextMenu, setCanvasContextMenu] = useState<CanvasContextMenuState | null>(null);
  const [canvasInputMenuForId, setCanvasInputMenuForId] = useState<string | null>(null);
  const [canvasReferenceReplaceTarget, setCanvasReferenceReplaceTarget] = useState<CanvasReferenceReplaceTarget | null>(null);
  const [canvasReferenceDragState, setCanvasReferenceDragState] = useState<CanvasReferenceDragState | null>(null);
  const [canvasAiPromptEditingId, setCanvasAiPromptEditingId] = useState<string | null>(null);
  const [canvasPromptOptimizingId, setCanvasPromptOptimizingId] = useState<string | null>(null);
  const [canvasAiExpandedOutputNodeIds, setCanvasAiExpandedOutputNodeIds] = useState<Set<string>>(() => new Set());
  const [canvasInputPickTargetId, setCanvasInputPickTargetId] = useState<string | null>(null);
  const [canvasBrushEditor, setCanvasBrushEditor] = useState<CanvasBrushEditorState | null>(null);
  const [canvasFolderPickerVisibleCount, setCanvasFolderPickerVisibleCount] = useState(CANVAS_FOLDER_PICKER_INITIAL_VISIBLE);
  const [canvasFolderPickerItems, setCanvasFolderPickerItems] = useState<CanvasDrawerMediaItem[]>([]);
  const [canvasFolderPickerTotal, setCanvasFolderPickerTotal] = useState(0);
  const [canvasFolderPickerHasMore, setCanvasFolderPickerHasMore] = useState(false);
  const [isCanvasFolderPickerLoading, setIsCanvasFolderPickerLoading] = useState(false);
  const [canvasFolderPickerError, setCanvasFolderPickerError] = useState('');
  const canvasFolderPickerItemsRef = useRef<CanvasDrawerMediaItem[]>([]);
  const canvasFolderPickerRequestRef = useRef(0);
  const canvasFolderPickerLoadingRef = useRef(false);
  const canvasFolderPickerPagingRef = useRef<CanvasFolderMediaPagingState>({
    folderKey: '',
    imageOffset: 0,
    videoOffset: 0,
    imageTotal: 0,
    videoTotal: 0,
  });
  const [canvasBrushMode, setCanvasBrushMode] = useState<CanvasBrushEditorMode>('brush');
  const [canvasBrushColor, setCanvasBrushColor] = useState(CANVAS_BRUSH_COLORS[0]);
  const [canvasBrushSize, setCanvasBrushSize] = useState(26);
  const [canvasBrushOpacity, setCanvasBrushOpacity] = useState(0.72);
  const [canvasBrushHistory, setCanvasBrushHistory] = useState<string[]>([]);
  const [canvasBrushRedoHistory, setCanvasBrushRedoHistory] = useState<string[]>([]);
  const [canvasBrushCropRect, setCanvasBrushCropRect] = useState<CanvasBrushCropRect | null>(null);
  const [canvasBrushCursor, setCanvasBrushCursor] = useState({ visible: false, x: 0, y: 0, scale: 1 });
  const canvasContextMenuRef = useRef<CanvasContextMenuState | null>(null);
  const canvasInputPickTargetIdRef = useRef<string | null>(null);
  const activeShortcutScopeRef = useRef<ActiveShortcutScope>('canvas');
  const canvasBrushEditorOpenRef = useRef(false);
  const doodleRootRef = useRef<HTMLDivElement | null>(null);
  const canvasBrushCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasBrushBaseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasBrushDrawingRef = useRef(false);
  const canvasBrushLastPointRef = useRef<CanvasBrushPoint | null>(null);
  const canvasBrushCropStartRef = useRef<CanvasBrushPoint | null>(null);
  const canvasBrushShapeStartRef = useRef<CanvasBrushPoint | null>(null);
  const canvasBrushShapeSnapshotRef = useRef<ImageData | null>(null);
  const canvasBrushPendingMarksRef = useRef<string | null>(null);
  const canvasBrushOpenRequestRef = useRef(0);
  const canvasBrushPendingCursorRef = useRef<{ visible: boolean; x: number; y: number; scale: number } | null>(null);
  const canvasBrushCursorFrameRef = useRef<number | null>(null);
  const setActiveShortcutScope = useCallback((scope: ActiveShortcutScope) => {
    activeShortcutScopeRef.current = scope;
  }, []);
  const isEventFromDoodleSurface = useCallback((event: Event) => {
    const target = event.target;
    return target instanceof Element && !!target.closest('[data-doodle-surface="true"]');
  }, []);
  const shouldRouteShortcutToDoodle = useCallback((event: Event) => {
    if (!canvasBrushEditorOpenRef.current) {
      if (activeShortcutScopeRef.current === 'doodle') setActiveShortcutScope('canvas');
      return false;
    }
    return activeShortcutScopeRef.current === 'doodle' || isEventFromDoodleSurface(event);
  }, [isEventFromDoodleSurface, setActiveShortcutScope]);
  const activateDoodleShortcutScope = useCallback(() => {
    setActiveShortcutScope('doodle');
  }, [setActiveShortcutScope]);
  const hideCanvasBrushCursor = useCallback(() => {
    canvasBrushPendingCursorRef.current = { visible: false, x: 0, y: 0, scale: 1 };
    if (canvasBrushCursorFrameRef.current != null) return;
    canvasBrushCursorFrameRef.current = window.requestAnimationFrame(() => {
      canvasBrushCursorFrameRef.current = null;
      const nextCursor = canvasBrushPendingCursorRef.current;
      canvasBrushPendingCursorRef.current = null;
      if (nextCursor) setCanvasBrushCursor(nextCursor);
    });
  }, []);
  const updateCanvasBrushCursor = useCallback((nextCursor: { visible: boolean; x: number; y: number; scale: number }) => {
    canvasBrushPendingCursorRef.current = nextCursor;
    if (canvasBrushCursorFrameRef.current != null) return;
    canvasBrushCursorFrameRef.current = window.requestAnimationFrame(() => {
      canvasBrushCursorFrameRef.current = null;
      const pendingCursor = canvasBrushPendingCursorRef.current;
      canvasBrushPendingCursorRef.current = null;
      if (pendingCursor) setCanvasBrushCursor(pendingCursor);
    });
  }, []);
  const [isCanvasAiPanelOpen, setIsCanvasAiPanelOpen] = useState(false);
  const [canvasAiProvider, setCanvasAiProvider] = useState<CanvasAiProvider>(() => getStoredCanvasAiProvider());
  const [canvasAiCredentialSource, setCanvasAiCredentialSource] = useState<CanvasAiCredentialSource>(() => getStoredCanvasAiCredentialSource());
  const [isByokUnlocked, setIsByokUnlocked] = useState(false);
  const [canvasAiApiKey, setCanvasAiApiKey] = useState(() => getStoredCanvasAiApiKey(getStoredCanvasAiProvider()));
  const [canvasAiNewApiVideoKey, setCanvasAiNewApiVideoKey] = useState(() => (
    localStorage.getItem(CANVAS_AI_NEW_API_VIDEO_KEY_STORAGE_KEY) || ''
  ));
  const [canvasAiEndpoint, setCanvasAiEndpoint] = useState(() => getStoredCanvasAiEndpoint(getStoredCanvasAiProvider()));
  const [canvasAiHeadersText, setCanvasAiHeadersText] = useState(() => getStoredCanvasAiHeadersText(getStoredCanvasAiProvider()));
  const [canvasAiApiProvider, setCanvasAiApiProvider] = useState(() => getStoredCanvasAiApiProvider(getStoredCanvasAiProvider()));
  const [canvasAiOpenAiModels, setCanvasAiOpenAiModels] = useState<string[]>(() => readStoredCanvasAiOpenAiModels());
  const [canvasAiNewApiModels, setCanvasAiNewApiModels] = useState<string[]>(() => readStoredCanvasAiNewApiModels());
  const [canvasAiMikotoModels, setCanvasAiMikotoModels] = useState<string[]>(() => readStoredCanvasAiMikotoModels());
  const [canvasAiXaisModels, setCanvasAiXaisModels] = useState<string[]>(() => readStoredCanvasAiXaisModels());
  const [canvasAiCloudImageModels, setCanvasAiCloudImageModels] = useState<CloudImageModelsResult | null>(null);
  const [isRefreshingCanvasAiOpenAiModels, setIsRefreshingCanvasAiOpenAiModels] = useState(false);
  const [isTestingCanvasAiConnection, setIsTestingCanvasAiConnection] = useState(false);
  const [canvasAiOpenAiModelError, setCanvasAiOpenAiModelError] = useState('');
  const [canvasAiXaisBalance, setCanvasAiXaisBalance] = useState<CanvasAiXaisBalanceState>({ status: 'idle' });

  useEffect(() => { return runAppLifecycleEffect02({ setIsByokUnlocked }); }, []);
  const [customCanvasAiPromptPresets, setCustomCanvasAiPromptPresets] = useState<CanvasAiPromptPreset[]>(() => readCustomCanvasAiPromptPresets());
  const [customCanvasWorkflows, setCustomCanvasWorkflows] = useState<CanvasWorkflowTemplate[]>(() => readCustomCanvasWorkflows());
  const [hiddenBuiltInCanvasAiPromptPresetIds, setHiddenBuiltInCanvasAiPromptPresetIds] = useState<string[]>(() => readCanvasTemplateHiddenIds(CANVAS_AI_HIDDEN_BUILT_IN_PROMPTS_STORAGE_KEY));
  const [hiddenBuiltInCanvasWorkflowIds, setHiddenBuiltInCanvasWorkflowIds] = useState<string[]>(() => readCanvasTemplateHiddenIds(CANVAS_HIDDEN_BUILT_IN_WORKFLOWS_STORAGE_KEY));
  const [selectedCanvasPresetDeleteIds, setSelectedCanvasPresetDeleteIds] = useState<string[]>([]);
  const [selectedCanvasWorkflowDeleteIds, setSelectedCanvasWorkflowDeleteIds] = useState<string[]>([]);
  const [canvasWorkflowSaveDraft, setCanvasWorkflowSaveDraft] = useState<CanvasWorkflowSaveDraft | null>(null);
  const activeWorkflowDraftRef = useRef<WorkflowRecipeDraft | null>(null);
  const [activeWorkflowDraftId, setActiveWorkflowDraftId] = useState<string | null>(null);
  const [activeDraftForDisplay, setActiveDraftForDisplay] = useState<WorkflowRecipeDraft | null>(null);
  const [showWorkflowDraftPanel, setShowWorkflowDraftPanel] = useState(false);
  const [isCanvasWorkflowManagerOpen, setIsCanvasWorkflowManagerOpen] = useState(false);
  const [canvasWorkflowEditingId, setCanvasWorkflowEditingId] = useState('');
  const [canvasWorkflowNameDraft, setCanvasWorkflowNameDraft] = useState('');
  const [canvasWorkflowHintDraft, setCanvasWorkflowHintDraft] = useState('');
  const [isCanvasPresetEditorOpen, setIsCanvasPresetEditorOpen] = useState(false);
  const [canvasPresetEditorMode, setCanvasPresetEditorMode] = useState<'create' | 'manage'>('create');
  const [canvasPresetEditingId, setCanvasPresetEditingId] = useState('');
  const [canvasPresetNameDraft, setCanvasPresetNameDraft] = useState('');
  const [canvasPresetPromptDraft, setCanvasPresetPromptDraft] = useState('');
  const [canvasWorkflowSingleEditGroupIds, setCanvasWorkflowSingleEditGroupIds] = useState<string[]>([]);
  const isCanvasModeRef = useRef(false);
  const canvasesRef = useRef<CanvasRecord[]>([]);
  const activeCanvasIdRef = useRef(DEFAULT_CANVAS_ID);
  const isSwitchingCanvasRef = useRef(false);
  const canvasItemsRef = useRef<CanvasImageItem[]>([]);
  const canvasSelectedIdsRef = useRef<string[]>([]);
  const workflowResultPublisherRef = useRef<(result: WorkflowResultCardData) => void>(() => {});
  const canvasWorkflowSingleEditGroupIdsRef = useRef<Set<string>>(new Set());
  const isAgentChatOpenRef = useRef(getCanvasChatVisibility());
  const canvasAgentSidebarWidthRef = useRef(readAgentSidebarWidth());
  const canvasScaleRef = useRef(1);
  const canvasSizeRef = useRef({ width: CANVAS_BASE_WIDTH, height: CANVAS_BASE_HEIGHT });
  const canvasSurfaceRef = useRef<HTMLDivElement | null>(null);
  const canvasSizerRef = useRef<HTMLDivElement | null>(null);
  const canvasContentRef = useRef<HTMLDivElement | null>(null);
  const canvasVisualViewportRef = useRef<CanvasViewportRect | null>(null);
  const canvasToolbarRef = useRef<HTMLDivElement | null>(null);
  const canvasNavigatorPanelRef = useRef<HTMLDivElement | null>(null);
  const canvasViewportRef = useRef<CanvasViewportRect | null>(null);
  const canvasViewportFrameRef = useRef<number | null>(null);
  const canvasChatViewportTimerRef = useRef<number | null>(null);
  const canvasInteractionFrameRef = useRef<number | null>(null);
  const canvasInteractionPayloadRef = useRef<null | {
    kind: 'move';
    ids: string[];
    dx: number;
    dy: number;
  } | {
    kind: 'resize';
    boxes: Record<string, CanvasItemBox>;
  } | {
    kind: 'selection';
    rect: CanvasItemBox;
  }>(null);
  const canvasSelectionOverlayRef = useRef<HTMLDivElement | null>(null);
  const canvasPendingSelectionDomIdsRef = useRef<Set<string>>(new Set());
  const canvasInteractionChangedNodeIdsRef = useRef<Set<string>>(new Set());
  const canvasItemsPatchCommitRef = useRef(false);
  const canvasPatchSaveTimerRef = useRef<number | null>(null);
  const canvasPatchSavePendingIdsRef = useRef<Set<string>>(new Set());
  const isCanvasZoomingRef = useRef(false);
  const canvasZoomSettleTimerRef = useRef<number | null>(null);
  const canvasViewportDeferredDuringZoomRef = useRef(false);
  const canvasSizeCommitDeferredRef = useRef(false);
  const canvasNavThumbnailCacheRef = useRef<Map<string, CanvasNavThumbnailCacheEntry>>(new Map());
  const [canvasNavThumbnailRevision, setCanvasNavThumbnailRevision] = useState(0);
  const canvasImageSourceCacheRef = useRef(new Map<string, CanvasImageSourceCacheEntry>());
  const canvasPreviewSourceIdsRef = useRef(new Set<string>());
  const canvasSelectionImageSourceFrameRef = useRef<number | null>(null);
  const canvasSelectionImageSourceIdsRef = useRef(new Set<string>());
  const canvasImageUpgradeQueueRef = useRef<string[]>([]);
  const canvasImageUpgradeInFlightRef = useRef(new Set<string>());
  const canvasImageUpgradeFailedRef = useRef(new Set<string>());
  const canvasImageUpgradeTimerRef = useRef<number | null>(null);
  const canvasImageUpgradeTokenRef = useRef(0);
  const canvasHoveredItemIdRef = useRef('');
  const canvasSearchAddingIdsRef = useRef(new Set<string>());
  const canvasSearchDropIndexRef = useRef(0);
  const canvasAiRunTokensRef = useRef(new Map<string, string>());
  const canvasSessionItemsRef = useRef(new Map<string, CanvasImageItem[]>());
  const canvasBackgroundPatchChainsRef = useRef(new Map<string, Promise<void>>());
  const canvasActiveRunNodeIdsRef = useRef(new Map<string, Map<string, number>>());
  const canvasAiModelRefreshSignatureRef = useRef('');
  const canvasScaleCommitTimerRef = useRef<number | null>(null);
  const canvasRunButtonPointerRef = useRef<{ targetId: string; at: number } | null>(null);
  const canvasPointerInteractionCleanupRef = useRef<(() => void) | null>(null);
  const canvasDragDebugRef = useRef<{
    startNodeCount: number;
    pointerMoveCount: number;
    lastNodeCount: number;
  } | null>(null);
  const canvasInteractionTimerRef = useRef<number | null>(null);
  const canvasScaleRenderFrameRef = useRef<number | null>(null);
  const canvasWheelZoomFrameRef = useRef<number | null>(null);
  const canvasWheelZoomPayloadRef = useRef<{ clientX: number; clientY: number; deltaY: number } | null>(null);
  const canvasInteractionSurfaceRectRef = useRef<DOMRect | null>(null);
  const [canvasToolbarTop, setCanvasToolbarTop] = useState('max(50%, 444px)');
  const isCanvasInteractingRef = useRef(false);
  const isCanvasPointerInsideRef = useRef(false);
  const lastCanvasDragClientRef = useRef<{ x: number; y: number } | null>(null);
  const lastCanvasPointerClientRef = useRef<{ x: number; y: number } | null>(null);
  const lastCanvasDropAtRef = useRef(0);
  const lastCanvasDroppedPathsKeyRef = useRef('');
  const mainDrawerLongPressTimerRef = useRef<number | null>(null);
  const mainDrawerLongPressTriggeredRef = useRef(false);
  const canvasDragRef = useRef<{
    ids: string[];
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startScrollLeft: number;
    startScrollTop: number;
    startItems: Record<string, CanvasItemBox>;
    latestDelta: { dx: number; dy: number };
    hasMoved: boolean;
    hasConnections: boolean;
    pendingSelectionIds: string[] | null;
  } | null>(null);
  const canvasResizeRef = useRef<{
    id: string;
    corner: CanvasResizeCorner;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    aspect: number;
    latestBox: CanvasItemBox | null;
    hasResized: boolean;
  } | null>(null);
  const canvasGroupResizeRef = useRef<{
    corner: CanvasResizeCorner;
    startClientX: number;
    startClientY: number;
    startBounds: CanvasItemBox;
    startItems: Record<string, CanvasItemBox>;
    aspect: number;
    latestBoxes: Record<string, CanvasItemBox> | null;
    hasResized: boolean;
  } | null>(null);
  const canvasSelectionDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    additive: boolean;
    baseSelectedIds: string[];
    hasMoved: boolean;
  } | null>(null);
  const canvasConnectionDragRef = useRef<{
    fromId: string;
    sourceIds: string[];
    pointerId: number;
    fromX: number;
    fromY: number;
  } | null>(null);
  const canvasInputActionDragRef = useRef<{
    targetId: string;
    pointerId: number;
    fromX: number;
    fromY: number;
  } | null>(null);
  const canvasUploadInputRef = useRef<HTMLInputElement | null>(null);
  const pendingCanvasUploadTargetIdRef = useRef<string | null>(null);
  const canvasReferenceReplaceTargetRef = useRef<CanvasReferenceReplaceTarget | null>(null);
  const pendingCanvasReferenceUploadReplaceRef = useRef<CanvasReferenceReplaceTarget | null>(null);
  const canvasReferenceLongPressRef = useRef<{
    targetId: string;
    inputId: string;
    overInputId: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    clientX: number;
    clientY: number;
    previewSource: string;
    inputIndex: number;
    rotation: 0 | 90 | 180 | 270;
    activated: boolean;
    timer: number | null;
    previousBodyCursor: string;
    cleanup: () => void;
  } | null>(null);
  const canvasReferenceSuppressClickRef = useRef<{ targetId: string } | null>(null);
  const pendingCanvasFusionRoleRef = useRef<{
    targetId: string;
    role: CanvasImageFusionRole;
  } | null>(null);
  const pendingCanvasFusionUploadRoleRef = useRef<{
    targetId: string;
    role: CanvasImageFusionRole;
  } | null>(null);
  const pendingCanvasWorkflowSlotUploadRef = useRef<{
    moduleId: string;
    slotId: string;
    expandedNodeId?: string;
  } | null>(null);
  const canvasWorkflowFileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingCanvasWorkflowFileTargetIdRef = useRef<string | null>(null);
  const canvasClipboardRef = useRef<CanvasImageItem[]>([]);
  const preferCanvasClipboardRef = useRef(false);
  const canvasPanRef = useRef<{
    pointerId: number;
    button: number;
    startClientX: number;
    startClientY: number;
    startScrollLeft: number;
    startScrollTop: number;
  } | null>(null);
  const canvasPanCleanupRef = useRef<(() => void) | null>(null);
  const canvasScrollLockRef = useRef<{ left: number; top: number } | null>(null);
  const canvasScrollWriteGuardRef = useRef(false);
  const canvasScrollWriteFrameRef = useRef<number | null>(null);
  const canvasAiPromptDraftTimersRef = useRef<Record<string, number>>({});
  const canvasAiPromptDraftValuesRef = useRef<Record<string, string>>({});
  const canvasAiPromptTextAreaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const canvasTextDraftTimersRef = useRef<Record<string, number>>({});
  const canvasTextDraftValuesRef = useRef<Record<string, string>>({});
  const canvasTextAreaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const canvasTextOutputDraftTimersRef = useRef<Record<string, number>>({});
  const canvasTextOutputDraftValuesRef = useRef<Record<string, string>>({});
  const canvasTextOutputAreaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const isCanvasSpacePressedRef = useRef(false);
  const canvasSpaceKeyCapturedRef = useRef(false);
  const keepCanvasSessionOnLeaveRef = useRef(false);
  const canvasReturnScrollRef = useRef<{ left: number; top: number } | null>(null);
  const canvasStateLoadedRef = useRef(false);
  const canvasPersistSaveTimerRef = useRef<number | null>(null);
  const canvasPersistSaveSyncNodesRef = useRef(false);
  const canvasLastSyncedNodesSignatureRef = useRef('');
  const canvasStateSaveDeferredDuringZoomRef = useRef(false);
  const pendingCanvasFocusItemIdRef = useRef<string | null>(null);
  const setCanvasSpacePressed = (pressed: boolean) => {
    isCanvasSpacePressedRef.current = pressed;
    const surface = canvasSurfaceRef.current;
    if (!surface) return;
    if (pressed) surface.setAttribute('data-canvas-space-pressed', 'true');
    else surface.removeAttribute('data-canvas-space-pressed');
  };
  const setCanvasInteractionActive = (
    active: boolean,
    releaseDelay = 120,
    _options: { preserveImageSources?: boolean } = {},
  ) => { return setCanvasInteractionActiveImpl({ cancelCanvasImageSourceUpgradeQueue, canvasInteractionTimerRef, canvasPersistSaveSyncNodesRef, canvasSizeCommitDeferredRef, canvasSizeRef, canvasViewportDeferredDuringZoomRef, flushCanvasChangedNodePatches, isCanvasInteractingRef, runNextCanvasAiOutputThumbnailJob, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, scheduleCanvasViewportUpdate, scheduleCanvasVisibleImageSourceUpgrades, setCanvasSize }, active, releaseDelay, _options); };

  const preventCanvasNativeDrag = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  useEffect(() => { return runAppLifecycleEffect03({ activeThreeSceneIdRef, cancelCanvasImageSourceUpgradeQueue, cancelCanvasItemDragVisuals, canvasAiPromptDraftTimersRef, canvasAiPromptDraftValuesRef, canvasConnectionDragRef, canvasHoveredItemIdRef, canvasImageSourceCacheRef, canvasInputActionDragRef, canvasPanCleanupRef, canvasPanRef, canvasPreviewSourceIdsRef, canvasReferenceLongPressRef, canvasReferenceReplaceTargetRef, canvasScrollLockRef, canvasSelectedIdsRef, canvasSelectionDragRef, canvasSelectionImageSourceFrameRef, canvasSelectionImageSourceIdsRef, canvasSpaceKeyCapturedRef, canvasTextDraftTimersRef, canvasTextDraftValuesRef, canvasTextOutputDraftTimersRef, canvasTextOutputDraftValuesRef, canvasUndoRestoringRef, canvasUndoStackRef, canvasViewportRef, hideCanvasSelectionOverlay, isCanvasMode, isCanvasModeRef, isCanvasPointerInsideRef, keepCanvasSessionOnLeaveRef, pendingCanvasFusionRoleRef, pendingCanvasReferenceUploadReplaceRef, setActiveThreeSceneId, setCanvasActionMenuId, setCanvasConnectionDraft, setCanvasContextMenu, setCanvasFolderImportPrompt, setCanvasInputActionDraft, setCanvasInputMenuForId, setCanvasInputPickTargetId, setCanvasInteractionActive, setCanvasReferenceDragState, setCanvasReferenceReplaceTarget, setCanvasSelectedIds, setCanvasSpacePressed, setCanvasViewport, setIsCanvasAiPanelOpen, setIsCanvasChromeHidden, threeSceneHistoryGestureRef }); }, [isCanvasMode]);
  useEffect(() => { return runAppLifecycleEffect04({ canvasSurfaceRef, isCanvasMode }); }, [isCanvasMode]);
  useEffect(() => {
    activeThreeSceneIdRef.current = null;
    threeSceneHistoryGestureRef.current = null;
    setActiveThreeSceneId(null);
  }, [activeCanvasId]);
  useEffect(() => { canvasItemsRef.current = canvasItems; }, [canvasItems]);
  useLayoutEffect(() => { return runAppLifecycleEffect05({ canvasContentRef, canvasDragRef, canvasPendingSelectionDomIdsRef, canvasSurfaceRef, paintCanvasDragChrome }); }, [canvasSelectedIds]);
  useEffect(() => { return runAppLifecycleEffect06({ canvasItems, setCanvasWorkingTimerTick }); }, [canvasItems]);
  useEffect(() => { canvasesRef.current = canvases; }, [canvases]);
  useEffect(() => { activeCanvasIdRef.current = activeCanvasId; }, [activeCanvasId]);
  useEffect(() => { isSwitchingCanvasRef.current = isSwitchingCanvas; }, [isSwitchingCanvas]);
  useEffect(() => {
    if (canvasScaleCommitTimerRef.current !== null && Math.abs((canvasScaleRef.current || 1) - canvasScale) > 0.001) {
      return;
    }
    canvasScaleRef.current = canvasScale;
  }, [canvasScale]);
  useEffect(() => { canvasSizeRef.current = canvasSize; }, [canvasSize]);
  useEffect(() => { canvasAgentSidebarWidthRef.current = canvasAgentSidebarWidth; }, [canvasAgentSidebarWidth]);
  useEffect(() => subscribeCanvasChatVisibility(() => {
    isAgentChatOpenRef.current = getCanvasChatVisibility();
    if (canvasChatViewportTimerRef.current !== null) {
      window.clearTimeout(canvasChatViewportTimerRef.current);
    }
    if (isAgentChatOpenRef.current) return;
    canvasChatViewportTimerRef.current = window.setTimeout(() => {
      canvasChatViewportTimerRef.current = null;
      if (!isCanvasModeRef.current) return;
      React.startTransition(() => updateCanvasViewportNow());
    }, 0);
  }), []);
  useEffect(() => { canvasContextMenuRef.current = canvasContextMenu; }, [canvasContextMenu]);
  useEffect(() => { return runAppLifecycleEffect07({ canvasInputPickTargetIdRef, canvasReferenceReplaceTargetRef, isCanvasMode, pendingCanvasFusionRoleRef, setCanvasContextMenu, setCanvasFolderImportPrompt, setCanvasInputMenuForId, setCanvasReferenceReplaceTarget, setIsCanvasAiPanelOpen, setIsCanvasPresetEditorOpen, setIsCanvasWorkflowManagerOpen }); }, [isCanvasMode]);
  useEffect(() => { canvasInputPickTargetIdRef.current = canvasInputPickTargetId; }, [canvasInputPickTargetId]);
  useEffect(() => { localStorage.setItem('drawer_canvas_navigator_visible', isCanvasNavigatorVisible ? 'true' : 'false'); }, [isCanvasNavigatorVisible]);
  useEffect(() => { localStorage.setItem('drawer_canvas_generated_list_visible', isCanvasGeneratedListVisible ? 'true' : 'false'); }, [isCanvasGeneratedListVisible]);
  useEffect(() => {
    if (!isCanvasMode) setCanvasChatVisibility(false);
    else setIsDrawerAgentOpen(false);
  }, [isCanvasMode]);
  useEffect(() => {
    localStorage.setItem(CANVAS_AI_PROVIDER_STORAGE_KEY, canvasAiProvider);
    localStorage.setItem(CANVAS_AI_PROVIDER_DEFAULT_VERSION_STORAGE_KEY, CANVAS_AI_PROVIDER_DEFAULT_VERSION);
  }, [canvasAiProvider]);
  useEffect(() => {
    localStorage.setItem(CANVAS_AI_CREDENTIAL_SOURCE_STORAGE_KEY, canvasAiCredentialSource);
  }, [canvasAiCredentialSource]);
  useEffect(() => {
    localStorage.setItem(getCanvasAiApiKeyStorageKey(canvasAiProvider), canvasAiApiKey);
  }, [canvasAiApiKey, canvasAiProvider]);
  useEffect(() => {
    localStorage.setItem(CANVAS_AI_NEW_API_VIDEO_KEY_STORAGE_KEY, canvasAiNewApiVideoKey);
  }, [canvasAiNewApiVideoKey]);
  useEffect(() => {
    localStorage.setItem(getCanvasAiEndpointStorageKey(canvasAiProvider), canvasAiEndpoint);
    localStorage.setItem(CANVAS_AI_ENDPOINT_STORAGE_KEY, canvasAiEndpoint);
  }, [canvasAiEndpoint, canvasAiProvider]);
  useEffect(() => {
    localStorage.setItem(getCanvasAiHeadersStorageKey(canvasAiProvider), canvasAiHeadersText);
  }, [canvasAiHeadersText, canvasAiProvider]);
  useEffect(() => {
    localStorage.setItem(getCanvasAiApiProviderStorageKey(canvasAiProvider), canvasAiApiProvider);
  }, [canvasAiApiProvider, canvasAiProvider]);
  useEffect(() => {
    localStorage.setItem(CANVAS_AI_CUSTOM_PROMPTS_STORAGE_KEY, JSON.stringify(customCanvasAiPromptPresets));
  }, [customCanvasAiPromptPresets]);
  useEffect(() => {
    localStorage.setItem(CANVAS_AI_HIDDEN_BUILT_IN_PROMPTS_STORAGE_KEY, JSON.stringify(hiddenBuiltInCanvasAiPromptPresetIds));
  }, [hiddenBuiltInCanvasAiPromptPresetIds]);
  useEffect(() => { return runAppLifecycleEffect08({ setCustomCanvasAiPromptPresets }); }, []);
  useEffect(() => {
    localStorage.setItem(CANVAS_CUSTOM_WORKFLOWS_STORAGE_KEY, JSON.stringify(customCanvasWorkflows));
  }, [customCanvasWorkflows]);
  useEffect(() => {
    localStorage.setItem(CANVAS_HIDDEN_BUILT_IN_WORKFLOWS_STORAGE_KEY, JSON.stringify(hiddenBuiltInCanvasWorkflowIds));
  }, [hiddenBuiltInCanvasWorkflowIds]);
  useEffect(() => {
    canvasWorkflowSingleEditGroupIdsRef.current = new Set(canvasWorkflowSingleEditGroupIds);
  }, [canvasWorkflowSingleEditGroupIds]);
  useLayoutEffect(() => {
    if (!isCanvasMode) return;
    applyCanvasScaleStyles(canvasScaleRef.current, canvasSizeRef.current);
    scheduleCanvasViewportUpdate();
  }, [isCanvasMode, canvasScale, canvasSize]);
  useEffect(() => { return runAppLifecycleEffect09({ canvasSurfaceRef, isCanvasMode, scheduleCanvasViewportUpdate }); }, [isCanvasMode]);
  useEffect(() => () => {
    canvasReferenceLongPressRef.current?.cleanup();
    if (canvasChatViewportTimerRef.current !== null) {
      window.clearTimeout(canvasChatViewportTimerRef.current);
      canvasChatViewportTimerRef.current = null;
    }
    if (canvasViewportFrameRef.current !== null) {
      window.cancelAnimationFrame(canvasViewportFrameRef.current);
      canvasViewportFrameRef.current = null;
    }
    if (canvasScaleCommitTimerRef.current !== null) {
      window.clearTimeout(canvasScaleCommitTimerRef.current);
      canvasScaleCommitTimerRef.current = null;
      canvasZoomSettleTimerRef.current = null;
    }
    if (canvasScaleRenderFrameRef.current !== null) {
      window.cancelAnimationFrame(canvasScaleRenderFrameRef.current);
      canvasScaleRenderFrameRef.current = null;
    }
    if (canvasWheelZoomFrameRef.current !== null) {
      window.cancelAnimationFrame(canvasWheelZoomFrameRef.current);
      canvasWheelZoomFrameRef.current = null;
      canvasWheelZoomPayloadRef.current = null;
    }
    if (canvasInteractionTimerRef.current !== null) {
      window.clearTimeout(canvasInteractionTimerRef.current);
      canvasInteractionTimerRef.current = null;
    }
  }, []);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfLocalDay(Date.now()));
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(() => startOfLocalDay(Date.now()));
  const [calendarTagFilter, setCalendarTagFilter] = useState('all');
  const [calendarDraftText, setCalendarDraftText] = useState('');
  const [calendarDraftPriority, setCalendarDraftPriority] = useState<SchedulePriority>('B');
  const [calendarTargetNoteLabel, setCalendarTargetNoteLabel] = useState(CALENDAR_NEW_NOTE_TARGET);

  const [isOpen, setIsOpen] = useState(shouldShowInitialLaunchIntro);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const externalDragResetTimerRef = useRef<number | null>(null);
  const [triggerMode, setTriggerMode] = useState<TriggerMode>(() => getStoredTriggerMode());
  const triggerModeRef = useRef<TriggerMode>(triggerMode);
  useEffect(() => { triggerModeRef.current = triggerMode; }, [triggerMode]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedImageGallery, setSelectedImageGallery] = useState<{ items: BufferItem[]; index: number } | null>(null);
  const selectedImageReturnToCanvasRef = useRef(false);
  const selectedImageOriginalCacheRef = useRef(new LruCache<string, string>(PREVIEW_ORIGINAL_CACHE_LIMIT));
  const [selectedVideo, setSelectedVideo] = useState<{url: string, path: string, fromCanvas?: boolean} | null>(null);
  const selectedVideoReturnToCanvasRef = useRef(false);
  const [selectedImageZoom, setSelectedImageZoom] = useState(1);
  const [selectedImagePan, setSelectedImagePan] = useState({ x: 0, y: 0 });
  const selectedImagePanRef = useRef(selectedImagePan);
  useEffect(() => { selectedImagePanRef.current = selectedImagePan; }, [selectedImagePan]);
  const [showSelectedImageZoom, setShowSelectedImageZoom] = useState(false);
  const selectedImageZoomTimerRef = useRef<any | null>(null);
  const previewDragActiveRef = useRef(false);
  const lastNativeDropAtRef = useRef(0);
  const lastDroppedPathsKeyRef = useRef('');
  const lastWebImageUrlRef = useRef('');
  const lastWebImageDropAtRef = useRef(0);
  const lastAcceptedWebImageRef = useRef<{
    id: string;
    location: 'drawer' | 'canvas';
    inline: boolean;
    at: number;
  } | null>(null);
  const supersededWebImageItemIdsRef = useRef(new Set<string>());
  const [isShortcutReveal, setIsShortcutReveal] = useState(false);
  const shortcutRevealTimerRef = useRef<any | null>(null);

  const markShortcutReveal = () => {
    if (shortcutRevealTimerRef.current) clearTimeout(shortcutRevealTimerRef.current);
    setIsShortcutReveal(true);
    shortcutRevealTimerRef.current = setTimeout(() => {
      shortcutRevealTimerRef.current = null;
      setIsShortcutReveal(false);
    }, 420);
  };

  const clearExternalDragResetTimer = () => {
    if (externalDragResetTimerRef.current !== null) {
      window.clearTimeout(externalDragResetTimerRef.current);
      externalDragResetTimerRef.current = null;
    }
  };

  const setExternalDragActive = (active: boolean) => { return setExternalDragActiveImpl({ appWindow, clearExternalDragResetTimer, externalDragResetTimerRef, isCanvasModeRef, isMainWorkbenchActiveRef, isPinnedRef, isPointerInsideDrawerRef, isSplashVisibleRef, licenseGateActiveRef, setIsDraggingOver, setIsOpen, showLaunchIntroRef, showUpdateLogRef }, active); };

  useEffect(() => () => {
    clearExternalDragResetTimer();
    if (shortcutRevealTimerRef.current) clearTimeout(shortcutRevealTimerRef.current);
    Object.values(floatingTextUndoTimersRef.current).forEach(timer => window.clearTimeout(timer));
    floatingTextUndoTimersRef.current = {};
  }, []);

  useEffect(() => { return runAppLifecycleEffect10({ selectedImage, selectedImagePanRef, selectedImageZoomTimerRef, setSelectedImagePan, setSelectedImageZoom, setShowSelectedImageZoom }); }, [selectedImage]);

  const [isPinned, setIsPinned] = useState(false);
  const closeTimerRef = useRef<any | null>(null);
  const idleAutoCloseTimerRef = useRef<any | null>(null);
  const startupAutoCloseTimerRef = useRef<any | null>(null);
  const startupAutoCloseSuppressedRef = useRef(false);
  const isPostInstallLaunchRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const enforceAntiTouchClosed = (showFeedback = false) => { return enforceAntiTouchClosedImpl({ closeTimerRef, idleAutoCloseTimerRef, isPinnedRef, isPointerInsideDrawerRef, setDrawerState, setFolderContextMenu, setIsOpen, setIsPinned, setIsSearchActive, setSelectedImage, setSelectedVideo, setShowFolderModal, setShowMoveExistingFolderModal, setShowMoveFolderModal, setShowSettings, setShowTextInput, showToast, startupAutoCloseSuppressedRef, triggerModeRef }, showFeedback); };

  // 🌟 放在其他 useState 旁边
  const [isDraggingTitle, setIsDraggingTitle] = useState(false);
  const isDraggingTitleRef = useRef(false);
  useEffect(() => { isDraggingTitleRef.current = isDraggingTitle; }, [isDraggingTitle]);

  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark');
  useEffect(() => { localStorage.setItem('theme', isDark ? 'dark' : 'light'); }, [isDark]);
  const { appFontSize, appFontScale } = useAppFontSize();

  const [drawerSidebarLayout, setDrawerSidebarLayout] = useState<DrawerSidebarLayout>(() => (
    normalizeDrawerSidebarLayout(localStorage.getItem(DRAWER_SIDEBAR_LAYOUT_STORAGE_KEY))
  ));
  useEffect(() => {
    localStorage.setItem(DRAWER_SIDEBAR_LAYOUT_STORAGE_KEY, drawerSidebarLayout);
  }, [drawerSidebarLayout]);
  const isFolderSidebarLayout = drawerSidebarLayout === 'folders';
  const [drawerClassificationView, setDrawerClassificationView] = useState<DrawerClassificationView>(() => (
    normalizeDrawerClassificationView(localStorage.getItem(DRAWER_CLASSIFICATION_VIEW_STORAGE_KEY))
  ));
  useEffect(() => {
    localStorage.setItem(DRAWER_CLASSIFICATION_VIEW_STORAGE_KEY, drawerClassificationView);
  }, [drawerClassificationView]);
  const isDrawerAiClassificationMode = drawerClassificationView === 'ai';
  const [drawerAiClassificationDimension, setDrawerAiClassificationDimension] = useState<AiClassificationDimension>(() => (
    normalizeAiClassificationDimension(localStorage.getItem(DRAWER_AI_CLASSIFICATION_DIMENSION_STORAGE_KEY))
  ));
  useEffect(() => {
    localStorage.setItem(DRAWER_AI_CLASSIFICATION_DIMENSION_STORAGE_KEY, drawerAiClassificationDimension);
  }, [drawerAiClassificationDimension]);
  const [activeDrawerAiClassificationLabel, setActiveDrawerAiClassificationLabel] = useState('all');
  const [drawerFolderSidebarWidth, setDrawerFolderSidebarWidth] = useState(() => (
    clamp(
      Number(localStorage.getItem(DRAWER_FOLDER_SIDEBAR_WIDTH_STORAGE_KEY)) || DRAWER_FOLDER_SIDEBAR_DEFAULT_WIDTH,
      DRAWER_FOLDER_SIDEBAR_MIN_WIDTH,
      DRAWER_FOLDER_SIDEBAR_MAX_WIDTH,
    )
  ));
  useEffect(() => {
    localStorage.setItem(DRAWER_FOLDER_SIDEBAR_WIDTH_STORAGE_KEY, String(Math.round(drawerFolderSidebarWidth)));
  }, [drawerFolderSidebarWidth]);

  const [cardWidth, setCardWidth] = useState(() => Number(localStorage.getItem('drawer_card_width')) || 320);
  useEffect(() => { localStorage.setItem('drawer_card_width', cardWidth.toString()); }, [cardWidth]);

  const [cardMediaHeight, setCardMediaHeight] = useState(() => Number(localStorage.getItem('drawer_media_height')) || 180);
  useEffect(() => { localStorage.setItem('drawer_media_height', cardMediaHeight.toString()); }, [cardMediaHeight]);

  const handleDrawerCardWheel = (event: React.WheelEvent) => { return handleDrawerCardWheelImpl({ setCardMediaHeight, setCardWidth }, event); };

  const [folderRailHeight, setFolderRailHeight] = useState(() => Number(localStorage.getItem('drawer_folder_rail_height')) || 386);
  useEffect(() => {
    localStorage.setItem('drawer_folder_rail_height', String(Math.round(folderRailHeight)));
  }, [folderRailHeight]);
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<string[]>(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(DRAWER_COLLAPSED_FOLDER_IDS_STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string') : [];
    } catch (_) {
      return [];
    }
  });
  useEffect(() => {
    localStorage.setItem(DRAWER_COLLAPSED_FOLDER_IDS_STORAGE_KEY, JSON.stringify(collapsedFolderIds));
  }, [collapsedFolderIds]);

  const [isResizingCards, setIsResizingCards] = useState(false);
  const drawerScrollRef = useRef<HTMLDivElement | null>(null);
  const [drawerScrollNode, setDrawerScrollNode] = useState<HTMLDivElement | null>(null);
  const setDrawerScrollElement = useCallback((node: HTMLDivElement | null) => {
    drawerScrollRef.current = node;
    setDrawerScrollNode(current => current === node ? current : node);
  }, []);
  const [isAntiTouchMode, setIsAntiTouchMode] = useState(() => localStorage.getItem('drawer_anti_touch_mode') === 'true');
  useEffect(() => {
    invoke('set_anti_touch_lock', { locked: isAntiTouchMode }).catch(() => {});
    if (isAntiTouchMode && !showLaunchIntroRef.current && !isSplashVisibleRef.current && !showUpdateLogRef.current) {
      enforceAntiTouchClosed(false);
    }
  }, [isAntiTouchMode]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [isFoldersLoaded, setIsFoldersLoaded] = useState(false);
  useEffect(() => { return runAppLifecycleEffect11({ AUTO_INSPIRATION_ANALYSIS_RETRY_MIGRATION_KEY, assetStorageMode, autoInspirationAnalysisAttemptedRef, autoInspirationAnalysisPendingIdsRef, isDataLoaded, itemsRef, setItems }); }, [assetStorageMode, isDataLoaded]);
  useEffect(() => { return runAppLifecycleEffect12({ assetStorageMode, autoInspirationAnalysisAttemptedRef, autoInspirationAnalysisPendingIdsRef, autoInspirationAnalysisStartupRequeueRef, isDataLoaded, itemsRef, setAssetStatsRevision, setAutoAiAnalysisRetryTick, setIsAutoAiAnalysisStartupReady, setItems, updateAssetsFromQuery }); }, [assetStorageMode, isDataLoaded]);
  useEffect(() => { return runAppLifecycleEffect13({ AUTO_INSPIRATION_ANALYSIS_NOTE_PAYLOAD_FIX_KEY, assetStorageMode, isDataLoaded, itemsRef, setItems }); }, [assetStorageMode, isDataLoaded]);
  useEffect(() => { return runAppLifecycleEffect14({ AI_GENERATED_IMAGE_PROMPT_NOTE_CLEANUP_KEY, foldersRef, isDataLoaded, isFoldersLoaded, itemsRef, setItems }); }, [isDataLoaded, isFoldersLoaded]);

  const [showLaunchIntro, setShowLaunchIntro] = useState(shouldShowInitialLaunchIntro);
  const showLaunchIntroRef = useRef(showLaunchIntro);
  useEffect(() => { showLaunchIntroRef.current = showLaunchIntro; }, [showLaunchIntro]);
  const [showUpdateLog, setShowUpdateLog] = useState(false);
  const showUpdateLogRef = useRef(showUpdateLog);
  useEffect(() => { showUpdateLogRef.current = showUpdateLog; }, [showUpdateLog]);
  const [isCloudflaredDisclaimerAccepted, setIsCloudflaredDisclaimerAccepted] = useState(() => (
    localStorage.getItem(CLOUDFLARED_DISCLAIMER_ACCEPTED_STORAGE_KEY) === 'true'
  ));
  const [isSplashVisible, setIsSplashVisible] = useState(showLaunchIntro);
  const isSplashVisibleRef = useRef(isSplashVisible);
  useEffect(() => { isSplashVisibleRef.current = isSplashVisible; }, [isSplashVisible]);

  const acceptCloudflaredDisclaimer = () => {
    localStorage.setItem(CLOUDFLARED_DISCLAIMER_ACCEPTED_STORAGE_KEY, 'true');
    setIsCloudflaredDisclaimerAccepted(true);
  };

  const declineCloudflaredDisclaimer = () => {
    localStorage.setItem(CLOUDFLARED_DISCLAIMER_ACCEPTED_STORAGE_KEY, 'false');
    setIsCloudflaredDisclaimerAccepted(false);
  };

  const closeUpdateLog = () => {
    setShowUpdateLog(false);
    showUpdateLogRef.current = false;
    localStorage.setItem('drawer_v4_update_shown', 'true');
  };

  const acceptUpdateLogAndClose = () => {
    acceptCloudflaredDisclaimer();
    closeUpdateLog();
  };

  const showToast = showAppToast;
  const [virtualDropJobs, setVirtualDropJobs] = useState<VirtualDropUiJob[]>([]);
  const {
    appVersion,
    checkAndInstallAppUpdate,
    handleAppUpdatePromptClick,
    isCheckingAppUpdate,
    showAppUpdatePromptArrow,
  } = useAppUpdate({ isMainDrawerWindow, showToast });
  const [isMobileConnected, setIsMobileConnected] = useState(false);
  const disconnectTimerRef = useRef<any | null>(null);
  const recentMobilePayloadsRef = useRef<Record<string, number>>({});

  const resetDisconnectTimer = () => {
    if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
    disconnectTimerRef.current = setTimeout(() => setIsMobileConnected(false), 30000);
  };

  const formatVirtualDropBytes = (value?: number | null) => {
    const bytes = Math.max(0, Number(value || 0));
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${Math.round(bytes)} B`;
  };

  const cancelVirtualDropJob = (jobId: string) => {
    setVirtualDropJobs(prev => prev.map(job => (
      job.id === jobId ? { ...job, message: 'Cancelling...' } : job
    )));
    invoke('cancel_virtual_drop', { jobId }).catch((err) => {
      console.warn('cancel virtual drop failed:', err);
      showToast('取消网页图片导入失败');
    });
  };

  const toggleDrawerSidebarLayout = () => {
    setDrawerSidebarLayout(previous => {
      const next: DrawerSidebarLayout = previous === 'folders' ? 'icons' : 'folders';
      showToast(next === 'folders' ? '侧边栏已切换为文件夹列表' : '侧边栏已切换为大图标');
      return next;
    });
  };

  useEffect(() => { return runAppLifecycleEffect15({ canvasItemsRef, isMainDrawerWindow, updateCanvasAiGeneratorData }); }, []);

  const takeDrawerUndoSnapshot = (
    label: string,
    options: { shareImmutableItems?: boolean } = {},
  ): DrawerUndoSnapshot => { return takeDrawerUndoSnapshotImpl({ activeFolderIdStateRef, activeTabRef, foldersRef, itemsRef }, label, options); };

  const pushDrawerUndoSnapshot = (
    label: string,
    options: { shareImmutableItems?: boolean } = {},
  ) => { return pushDrawerUndoSnapshotImpl({ DRAWER_UNDO_LIMIT, drawerUndoRestoringRef, drawerUndoStackRef, takeDrawerUndoSnapshot }, label, options); };

  const updateDrawerItemsDeferred = (updater: (previous: BufferItem[]) => BufferItem[]) => { return updateDrawerItemsDeferredImpl({ itemsRef, setItems }, updater); };

  const beginDrawerTextEditUndo = (itemId: string) => {
    if (!itemId || drawerTextEditUndoIdsRef.current.has(itemId)) return;
    pushDrawerUndoSnapshot('修改文本');
    drawerTextEditUndoIdsRef.current.add(itemId);
  };

  const endDrawerTextEditUndo = (itemId: string) => {
    if (!itemId) return;
    drawerTextEditUndoIdsRef.current.delete(itemId);
  };

  const beginFloatingTextUndo = (itemId: string, label: string) => { return beginFloatingTextUndoImpl({ drawerTextEditUndoIdsRef, floatingTextUndoTimersRef, pushDrawerUndoSnapshot }, itemId, label); };

  const restoreDrawerUndoSnapshot = (snapshot: DrawerUndoSnapshot) => { return restoreDrawerUndoSnapshotImpl({ drawerTextEditUndoIdsRef, drawerUndoRestoringRef, emitFloatingNoteUpdated, floatingTextUndoTimersRef, lastSelectedDrawerItemIdRef, persistFoldersSnapshot, refreshNoteManager, setActiveFolderId, setActiveTab, setConfirmDialog, setFolders, setIsSelectMode, setItems, setSelectedIds, setShowMoveFolderModal }, snapshot); };

  const undoLastDrawerChange = () => {
    const snapshot = drawerUndoStackRef.current.pop();
    if (!snapshot) {
      showToast('没有可撤回的操作');
      return;
    }
    restoreDrawerUndoSnapshot(snapshot);
    showToast(`已撤回：${snapshot.label}`);
  };

  const [calendarNotificationsEnabled, setCalendarNotificationsEnabled] = useState(
    () => localStorage.getItem(CALENDAR_NOTIFICATIONS_ENABLED_STORAGE_KEY) === 'true',
  );
  const [screenshotAutoPinNote, setScreenshotAutoPinNote] = useState(
    () => localStorage.getItem(SCREENSHOT_AUTO_PIN_NOTE_STORAGE_KEY) === 'true',
  );
  const screenshotAutoPinNoteRef = useRef(screenshotAutoPinNote);

  useEffect(() => {
    localStorage.setItem(CALENDAR_NOTIFICATIONS_ENABLED_STORAGE_KEY, String(calendarNotificationsEnabled));
  }, [calendarNotificationsEnabled]);

  useEffect(() => {
    screenshotAutoPinNoteRef.current = screenshotAutoPinNote;
    localStorage.setItem(SCREENSHOT_AUTO_PIN_NOTE_STORAGE_KEY, String(screenshotAutoPinNote));
  }, [screenshotAutoPinNote]);

  const [noteManagerVersion, setNoteManagerVersion] = useState(0);
  const [quickRailMode, setQuickRailMode] = useState<'quick' | 'notes'>('quick');
  const [isCreatingBlankNote, setIsCreatingBlankNote] = useState(false);
  const refreshNoteManager = () => setNoteManagerVersion(version => version + 1);

  useEffect(() => { return runAppLifecycleEffect16({}); }, []);

  const openFloatingNoteEntries = useMemo(() => (
    readOpenFloatingNoteLabels()
      .map(label => ({ label, snapshot: readFloatingNoteSnapshot(label) }))
      .filter(entry => !!entry.snapshot)
  ), [noteManagerVersion, items]);

  const openFloatingNoteCount = openFloatingNoteEntries.length;

  const applyFloatingNoteDestroy = (rawPayload: any) => { return applyFloatingNoteDestroyImpl({ pushDrawerUndoSnapshot, refreshNoteManager, setItems }, rawPayload); };

  useEffect(() => { return runAppLifecycleEffect17({ applyFloatingNoteDestroy, refreshNoteManager }); }, []);

  const focusFloatingNote = async (label: string, snapshot?: FloatingNoteSnapshot | null) => { return focusFloatingNoteImpl({ emitFloatingNoteUpdated, refreshNoteManager, showToast }, label, snapshot); };

  const closeFloatingNoteByLabel = async (label: string) => { return closeFloatingNoteByLabelImpl({ pushDrawerUndoSnapshot, refreshNoteManager, showToast }, label); };

  const closeAllFloatingNotes = async () => {
    const labels = readOpenFloatingNoteLabels();
    if (labels.length > 0) pushDrawerUndoSnapshot('删除全部便签');
    labels.forEach(label => deleteFloatingNoteSnapshot(label));
    await Promise.all(labels.map(label => invoke('hide_note_window', { label }).catch(() => {})));
    refreshNoteManager();
    showToast(labels.length > 0 ? '已删除全部便签' : '当前没有保存的便签');
  };

  const createFloatingNote = async (
    item: BufferItem,
    options: { topmost?: boolean; x?: number; y?: number; width?: number; height?: number; silent?: boolean } = {},
  ) => { return createFloatingNoteImpl({ FLOATING_NOTE_CREATE_LOCK_STORAGE_PREFIX, emitFloatingNoteUpdated, focusFloatingNote, refreshNoteManager, showToast }, item, options); };

  const createBlankFloatingNote = async () => { return createBlankFloatingNoteImpl({ BLANK_NOTE_CREATE_LOCK_STORAGE_KEY, activeFolderId, blankFloatingNoteCreateLockRef, createAssetId, createFloatingNote, lastBlankFloatingNoteCreatedAtRef, pushDrawerUndoSnapshot, setIsCreatingBlankNote, setItems, setQuickRailMode }); };

  const [showSettings, setShowSettings] = useState(false);
  const [activeSettingCategory, setActiveSettingCategory] = useState<string>('license');
  const [showHelp, setShowHelp] = useState(false);
  const [showAboutSoftware, setShowAboutSoftware] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [showStoragePath, setShowStoragePath] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [localIP, setLocalIP] = useState('');
  const [mobilePairUrl, setMobilePairUrl] = useState('');
  const [isAutoStart, setIsAutoStart] = useState(false);
  const [isAutoStartChanging, setIsAutoStartChanging] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [isLicenseLoading, setIsLicenseLoading] = useState(false);
  const [registrationEmail, setRegistrationEmail] = useState('');
  const [registrationDisplayName, setRegistrationDisplayName] = useState('');
  const [registrationInviteCode, setRegistrationInviteCode] = useState('');
  const [emailVerificationCode, setEmailVerificationCode] = useState('');
  const [emailChallengeId, setEmailChallengeId] = useState('');
  const [emailRegistrationError, setEmailRegistrationError] = useState('');
  const [isEmailCodeSending, setIsEmailCodeSending] = useState(false);
  const [isEmailVerifying, setIsEmailVerifying] = useState(false);
  const [cloudAccount, setCloudAccount] = useState<CloudAccountSummary | null>(() => readCachedCloudAccount());
  const [isCloudAccountLoading, setIsCloudAccountLoading] = useState(false);
  const [cloudAccountSyncError, setCloudAccountSyncError] = useState<string | null>(null);
  const cloudAccountRefreshFlightRef = useRef<(() => Promise<CloudAccountSummary>) | null>(null);
  const cloudStartupSyncStartedRef = useRef(false);
  const [isCloudAccountLoggingOut, setIsCloudAccountLoggingOut] = useState(false);
  const [creditRedemptionCode, setCreditRedemptionCode] = useState('');
  const [creditRedemptionError, setCreditRedemptionError] = useState('');
  const [isRedeemingCredits, setIsRedeemingCredits] = useState(false);
  const [showCreditUsage, setShowCreditUsage] = useState(false);
  const [creditUsageItems, setCreditUsageItems] = useState<CloudCreditUsageEntry[]>([]);
  const [isCreditUsageLoading, setIsCreditUsageLoading] = useState(false);
  const [creditUsageError, setCreditUsageError] = useState('');
  const licenseGateActiveRef = useRef(true);

  const [shortcut, setShortcut] = useState('Alt+G');
  const [isRecording, setIsRecording] = useState(false);
  const [snipShortcut, setSnipShortcut] = useState('F1');
  const [isRecordingSnip, setIsRecordingSnip] = useState(false);
  const [textShortcut, setTextShortcut] = useState('Alt+T');
  const [isRecordingText, setIsRecordingText] = useState(false);
  const [searchShortcut, setSearchShortcut] = useState('Alt+S');
  const [isRecordingSearch, setIsRecordingSearch] = useState(false);
  const [triggerShortcut, setTriggerShortcut] = useState(() => localStorage.getItem('drawer_trigger_shortcut') || 'Alt+Q');
  const [isRecordingTrigger, setIsRecordingTrigger] = useState(false);
  const [noteShortcut, setNoteShortcut] = useState('Alt+E');
  const [isRecordingNote, setIsRecordingNote] = useState(false);
  const [canvasShortcut, setCanvasShortcut] = useState('Alt+`');
  const [isRecordingCanvas, setIsRecordingCanvas] = useState(false);

  const refreshLicenseStatus = async (silent = false) => { return refreshLicenseStatusImpl({ formatLicenseCommandError, setIsLicenseLoading, setLicenseStatus, showToast }, silent); };

  const [showTextInput, setShowTextInput] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [showWebImageCollector, setShowWebImageCollector] = useState(false);
  const webImageCollectorPanelRef = useRef<HTMLDivElement | null>(null);
  const [webImageCollectorQuery, setWebImageCollectorQuery] = useState('');
  const [webImageCollectorReference, setWebImageCollectorReference] = useState<WebImageCollectorReference | null>(null);
  const [webImageCollectorTags, setWebImageCollectorTags] = useState<string[]>([]);
  const [webImageCollectorTagDraft, setWebImageCollectorTagDraft] = useState('');
  const [isCollectingWebImages, setIsCollectingWebImages] = useState(false);
  const isCollectingWebImagesRef = useRef(false);
  const [isGeneratingWebImageQuery, setIsGeneratingWebImageQuery] = useState(false);
  const [webImageCollectorStatus, setWebImageCollectorStatus] = useState('');
  const [localVisionModelDownload, setLocalVisionModelDownload] = useState<LocalVisionModelDownloadState>({
    visible: false,
    message: '',
    progress: 0,
    phase: 'idle',
  });
  const [isLocalVisionModelChecking, setIsLocalVisionModelChecking] = useState(false);
  const [isInstallingOllama, setIsInstallingOllama] = useState(false);
  const localVisionModelReadyRef = useRef(false);
  const localVisionModelPreparingRef = useRef(false);
  const localVisionModelDownloadStartedRef = useRef(false);
  const localVisionModelReadyNotifiedRef = useRef(false);
  const localVisionModelEnsurePromiseRef = useRef<Promise<void> | null>(null);
  const [localVisionModelLastError, setLocalVisionModelLastError] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const {
    canvasSearchCandidateLimit,
    canvasSearchMediaResults,
    deferredSearchQuery,
    drawerAssetListOptions,
    drawerAssetQueryKey,
    drawerScopedItems,
    normalizedDeferredSearchQuery,
    searchQuery,
    setCanvasSearchCandidateLimit,
    setSearchQuery,
  } = useDrawerSearch({
    activeFolderId,
    activeTab,
    assetStorageMode,
    folders,
    isCanvasMode,
    isSearchActive,
    items,
  });
  const [canvasWorkflowSlotPickTarget, setCanvasWorkflowSlotPickTarget] = useState<{
    moduleId: string;
    slotId: string;
    label: string;
    expandedNodeId?: string;
  } | null>(null);

  useEffect(() => { isCollectingWebImagesRef.current = isCollectingWebImages; }, [isCollectingWebImages]);

  const [aiApiProvider, setAiApiProvider] = useState(() => localStorage.getItem('drawer_ai_provider') || 'siliconflow');
  const [aiApiEndpoint, setAiApiEndpoint] = useState(() => localStorage.getItem('drawer_ai_endpoint') || SILICONFLOW_DEFAULT_ENDPOINT);
  const [aiApiKey, setAiApiKey] = useState(() => localStorage.getItem('drawer_ai_key') || '');
  const [aiApiModel, setAiApiModel] = useState(() => localStorage.getItem('drawer_ai_model') || SILICONFLOW_DEFAULT_MODEL);
  const [webImageCacheDir, setWebImageCacheDir] = useState(() => localStorage.getItem('drawer_web_image_cache_dir') || '');
  const webImageCacheDirRef = useRef(webImageCacheDir);
  useEffect(() => { webImageCacheDirRef.current = webImageCacheDir; }, [webImageCacheDir]);

  const getLatestFileCacheDir = async () => { return getLatestFileCacheDirImpl({ setWebImageCacheDir, webImageCacheDirRef }); };
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const lastSelectedDrawerItemIdRef = useRef<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const draggingItemIdRef = useRef<string | null>(null);
  useEffect(() => { draggingItemIdRef.current = draggingItemId; }, [draggingItemId]);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const selectedFolderIdsRef = useRef<string[]>([]);
  useEffect(() => { selectedFolderIdsRef.current = selectedFolderIds; }, [selectedFolderIds]);
  const lastSelectedFolderIdRef = useRef<string | null>(null);
  const [draggingFolderIds, setDraggingFolderIds] = useState<string[]>([]);
  const draggingFolderIdsRef = useRef<string[]>([]);
  useEffect(() => { draggingFolderIdsRef.current = draggingFolderIds; }, [draggingFolderIds]);
  const [folderMoveDragOverId, setFolderMoveDragOverId] = useState<string | null>(null);
  const suppressNextFolderClickRef = useRef(false);
  const [folderContextMenu, setFolderContextMenu] = useState<FolderContextMenuState | null>(null);
  const [showMoveExistingFolderModal, setShowMoveExistingFolderModal] = useState(false);
  const [folderMoveTargetId, setFolderMoveTargetId] = useState<string | null>(null);
  const [isMovingFolders, setIsMovingFolders] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const closeConfirmDialog = () => {
    setConfirmDialog(prev => ({ ...prev, isOpen: false }));
  };

  const requestEmailCode = async () => { return requestEmailCodeImpl({ formatLicenseCommandError, registrationEmail, setEmailChallengeId, setEmailRegistrationError, setEmailVerificationCode, setIsEmailCodeSending, setRegistrationEmail, showToast }); };

  const refreshCloudAccount = async (silent = false) => { return refreshCloudAccountImpl({ cloudAccountRefreshFlightRef, formatLicenseCommandError, refreshLicenseStatus, setCloudAccount, setCloudAccountSyncError, setIsCloudAccountLoading, showToast }, silent); };
  const refreshCloudAccountRef = useRef(refreshCloudAccount);
  refreshCloudAccountRef.current = refreshCloudAccount;
  useEffect(() => setCloudAccountQuotaRefreshHandler(
    () => refreshCloudAccountRef.current(true),
  ), []);
  const cloudAccountContextValue = useMemo(() => ({
    account: cloudAccount,
    loading: isCloudAccountLoading,
    scheduleQuotaRefresh: scheduleCloudAccountQuotaRefresh,
  }), [cloudAccount, isCloudAccountLoading]);

  const loadCloudCreditUsage = async () => { return loadCloudCreditUsageImpl({ formatLicenseCommandError, setCreditUsageError, setCreditUsageItems, setIsCreditUsageLoading }); };

  const openCloudCreditUsage = () => {
    setShowCreditUsage(true);
    void loadCloudCreditUsage();
  };

  const confirmCloudAccountLogout = () => { return confirmCloudAccountLogoutImpl({ canvasAgent, closeConfirmDialog, formatLicenseCommandError, isCloudAccountLoggingOut, setCanvasAiCloudImageModels, setCloudAccount, setConfirmDialog, setCreditRedemptionCode, setCreditRedemptionError, setCreditUsageError, setCreditUsageItems, setEmailChallengeId, setEmailRegistrationError, setEmailVerificationCode, setIsCloudAccountLoggingOut, setLicenseStatus, setRegistrationDisplayName, setRegistrationEmail, setShowCreditUsage, showToast }); };

  const redeemCloudCredits = async () => { return redeemCloudCreditsImpl({ canvasAgent, creditRedemptionCode, formatLicenseCommandError, setCanvasAiCredentialSource, setCloudAccount, setCreditRedemptionCode, setCreditRedemptionError, setIsByokUnlocked, setIsRedeemingCredits, showToast }); };

  const cancelByokCustomization = async () => { return cancelByokCustomizationImpl({ canvasAgent, setCanvasAiCredentialSource, setIsByokUnlocked, showToast }); };

  const verifyEmailAccount = async () => { return verifyEmailAccountImpl({ emailChallengeId, emailVerificationCode, formatLicenseCommandError, refreshCloudAccount, registrationDisplayName, registrationEmail, registrationInviteCode, setEmailChallengeId, setEmailRegistrationError, setEmailVerificationCode, setIsEmailVerifying, setLicenseStatus, showToast }); };
  const textInputDialogResolverRef = useRef<((value: string | null) => void) | null>(null);
  const textInputDialogInputRef = useRef<HTMLInputElement | null>(null);
  const [textInputDialog, setTextInputDialog] = useState<TextInputDialogState>({
    isOpen: false,
    title: '',
    value: '',
    confirmLabel: '确定',
    icon: 'canvas',
    autoSelect: true,
  });
  const closeTextInputDialog = useCallback((value: string | null = null) => {
    const resolver = textInputDialogResolverRef.current;
    textInputDialogResolverRef.current = null;
    setTextInputDialog(prev => ({ ...prev, isOpen: false }));
    resolver?.(value);
  }, []);
  const openTextInputDialog = useCallback((options: TextInputDialogOptions) => {
    textInputDialogResolverRef.current?.(null);
    return new Promise<string | null>((resolve) => {
      textInputDialogResolverRef.current = resolve;
      setTextInputDialog({
        isOpen: true,
        title: options.title,
        description: options.description,
        value: options.defaultValue || '',
        placeholder: options.placeholder,
        confirmLabel: options.confirmLabel || '确定',
        icon: options.icon || 'canvas',
        autoSelect: options.autoSelect !== false,
      });
    });
  }, []);

  useEffect(() => {
    if (!textInputDialog.isOpen) return;
    const frame = requestAnimationFrame(() => {
      textInputDialogInputRef.current?.focus({ preventScroll: true });
      if (textInputDialog.autoSelect) textInputDialogInputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [textInputDialog.autoSelect, textInputDialog.isOpen]);

  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);
  const [showMoveFolderModal, setShowMoveFolderModal] = useState(false);
  const [moveFolderName, setMoveFolderName] = useState('');

  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [snipMode, setSnipMode] = useState<{ active: boolean; bg: string }>({ active: false, bg: '' });
  const [isSnipSessionActive, setIsSnipSessionActive] = useState(false);
  const snipModeActiveRef = useRef(false);
  const snipExitInFlightRef = useRef(false);
  const snipRestoreDrawerRef = useRef<{ isOpen: boolean; isPinned: boolean; isCanvasMode: boolean } | null>(null);
  useEffect(() => { snipModeActiveRef.current = snipMode.active || isSnipSessionActive; }, [snipMode.active, isSnipSessionActive]);
  const [selection, setSelection] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  const isMouseDown = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });

  const stateRef = useRef({ isOpen, isPinned, showTextInput, isSearchActive, isAntiTouchMode });
  useEffect(() => {
    stateRef.current = { isOpen, isPinned, showTextInput, isSearchActive, isAntiTouchMode };
  }, [isOpen, isPinned, showTextInput, isSearchActive, isAntiTouchMode]);

  useEffect(() => { return runAppLifecycleEffect18({ setAiApiEndpoint, setAiApiKey, setAiApiModel, setAiApiProvider }); }, []);

  useEffect(() => { return runAppLifecycleEffect19({ setWebImageCacheDir, webImageCacheDirRef }); }, []);

  const chooseWebImageCacheDir = async () => { return chooseWebImageCacheDirImpl({ setWebImageCacheDir, showToast, webImageCacheDirRef }); };

  const resetWebImageCacheDir = async () => { return resetWebImageCacheDirImpl({ setWebImageCacheDir, showToast, webImageCacheDirRef }); };

  useEffect(() => { return runAppLifecycleEffect20({ aiApiEndpoint, aiApiKey, aiApiModel, aiApiProvider }); }, [aiApiProvider, aiApiEndpoint, aiApiKey, aiApiModel]);

  const canvasAiUnifiedImageModelOptions = useMemo<RoundedSelectOption[]>(() => {
    const candidates: CanvasAiModelCandidate[] = [];
    if (canvasAiCredentialSource === 'wallet' && canvasAiCloudImageModels) {
      const channels = canvasAiCloudImageModels.channels || [];
      const catalog = getAiCatalogModels(canvasAiCloudImageModels, 'image');
      if (hasServerAiCatalog(canvasAiCloudImageModels)) {
        const defaultModelId = getDefaultAiCatalogModelId(canvasAiCloudImageModels, 'image');
        const orderedCatalog = [...catalog].sort((left, right) => (
          Number(right.id === defaultModelId) - Number(left.id === defaultModelId)
        ));
        return orderedCatalog.map(catalogModel => {
          const routes = channels.flatMap(channel => (channel.models || []).flatMap(routeModel => {
            const matched = findAiCatalogModel(catalog, routeModel);
            if (matched?.id !== catalogModel.id) return [];
            return [{
              source: 'wallet' as const,
              provider: canvasAiProviderForCloudKind(channel.provider),
              model: routeModel,
              canonicalModelId: catalogModel.id,
              displayName: catalogModel.displayName,
              providerChannelId: channel.id,
              providerChannelName: channel.name,
              capabilities: channel.capabilities,
              modelCapabilities: mergeAiModelCapabilities(
                catalogModel.capabilities,
                getChannelModelCapabilities(channel, routeModel, catalogModel.id),
              ),
            }];
          }));
          const fallbackProvider = channels[0]
            ? canvasAiProviderForCloudKind(channels[0].provider)
            : canvasAiProviderForCloudKind(canvasAiCloudImageModels.provider);
          const resolvedRoutes = routes.length > 0 ? routes : [{
            source: 'wallet' as const,
            provider: fallbackProvider,
            model: catalogModel.id,
            canonicalModelId: catalogModel.id,
            displayName: catalogModel.displayName,
            modelCapabilities: catalogModel.capabilities,
          }];
          const first = resolvedRoutes[0];
          return {
            value: canvasAiGroupedModelChoiceValue('wallet', {
              ...first,
              model: catalogModel.id,
              canonicalModelId: catalogModel.id,
              displayName: catalogModel.displayName,
            }, resolvedRoutes),
            label: catalogModel.displayName,
          };
        });
      }
      if (channels.length > 0) {
        channels.forEach(channel => channel.models.forEach(model => candidates.push({
          source: 'wallet',
          provider: canvasAiProviderForCloudKind(channel.provider),
          model,
          providerChannelId: channel.id,
          providerChannelName: channel.name,
          capabilities: channel.capabilities,
        })));
      } else {
        const provider = canvasAiProviderForCloudKind(canvasAiCloudImageModels.provider);
        canvasAiCloudImageModels.models.forEach(model => candidates.push({ source: 'wallet', provider, model }));
      }
    }
    if (canvasAiCredentialSource === 'local') {
      const modelSources = new Map<CanvasAiProvider, string[]>([
        ['new-api', canvasAiNewApiModels],
        ['mikoto', canvasAiMikotoModels],
        ['xais-chat', canvasAiXaisModels],
        ['openai-compatible', canvasAiOpenAiModels],
        ['custom', canvasAiOpenAiModels],
      ]);
      const providers = [canvasAiProvider, ...Array.from(modelSources.keys()).filter(provider => provider !== canvasAiProvider)];
      providers.forEach(provider => {
        const apiKey = provider === canvasAiProvider ? canvasAiApiKey.trim() : getStoredCanvasAiApiKey(provider).trim();
        if (!apiKey) return;
        (modelSources.get(provider) || []).forEach(model => candidates.push({ source: 'local', provider, model }));
      });
    }
    return CANVAS_AI_IMAGE_MODEL_MENU_NAMES.map(label => {
      const modelCandidates = candidates.filter(candidate => (
        isCanvasAiPublicImageModel(candidate.provider, candidate.model)
        && getCanvasAiPublicImageModelVariantName(
          candidate.provider,
          candidate.model,
          candidate.capabilities,
          candidate.providerChannelName,
        ) === label
      ));
      const fallbackProvider = canvasAiCredentialSource === 'wallet'
        ? canvasAiCloudImageModels?.channels?.[0]
          ? canvasAiProviderForCloudKind(canvasAiCloudImageModels.channels[0].provider)
          : canvasAiCloudImageModels
            ? canvasAiProviderForCloudKind(canvasAiCloudImageModels.provider)
            : canvasAiProvider
        : canvasAiProvider;
      const first = modelCandidates[0] || {
        source: canvasAiCredentialSource,
        provider: fallbackProvider,
        model: getCanvasAiPublicImageModelId(fallbackProvider, label),
      };
      const routes = modelCandidates.length > 0 ? modelCandidates : [first];
      const fastChannelUnavailable = label.endsWith('（稳定高速）') && modelCandidates.length === 0;
      return {
        value: canvasAiGroupedModelChoiceValue(first.source, first, routes),
        label,
        disabled: fastChannelUnavailable,
        hint: fastChannelUnavailable ? '后台未配置对应高速渠道' : undefined,
      };
    });
  }, [canvasAiApiKey, canvasAiCloudImageModels, canvasAiCredentialSource, canvasAiMikotoModels, canvasAiNewApiModels, canvasAiOpenAiModels, canvasAiProvider, canvasAiXaisModels]);

  const canvasAiUnifiedVideoModelOptions = useMemo<RoundedSelectOption[]>(() => {
    const catalog = getAiCatalogModels(canvasAiCloudImageModels, 'video');
    if (canvasAiCredentialSource !== 'wallet' || !hasServerAiCatalog(canvasAiCloudImageModels)) {
      return CANVAS_AI_VIDEO_MODEL_OPTIONS;
    }
    const defaultModelId = getDefaultAiCatalogModelId(canvasAiCloudImageModels!, 'video');
    return [...catalog]
      .sort((left, right) => Number(right.id === defaultModelId) - Number(left.id === defaultModelId))
      .map(model => ({ value: model.id, label: model.displayName }));
  }, [canvasAiCloudImageModels, canvasAiCredentialSource]);

  useEffect(() => { return runAppLifecycleEffect21({ canvasAiCloudImageModels, canvasAiCredentialSource, canvasAiUnifiedImageModelOptions, isCanvasMode, updateCanvasItemsImmediate }); }, [canvasAiCloudImageModels, canvasAiCredentialSource, canvasAiUnifiedImageModelOptions, isCanvasMode]);

  const getCanvasAiUnifiedImageModelValue = (
    provider: CanvasAiProvider,
    model: string,
    providerChannelId?: string,
  ) => { return getCanvasAiUnifiedImageModelValueImpl({ canvasAiCloudImageModels, canvasAiCredentialSource, canvasAiUnifiedImageModelOptions }, provider, model, providerChannelId); };

  const getCanvasAiResolvedModel = (provider: CanvasAiProvider, model?: string | null, mediaType: 'image' | 'video' = 'image') => { return getCanvasAiResolvedModelImpl({}, provider, model, mediaType); };

  useEffect(() => { return runSettingsEffect01({ canvasAiCloudImageModels, canvasAiCredentialSource, isCanvasMode, updateCanvasItemsImmediate }); }, [canvasAiCloudImageModels?.videoChannels, canvasAiCredentialSource, isCanvasMode]);
  const canvasAiPromptPresets = useMemo(() => {
    const defaultIds = new Set(CANVAS_AI_PROMPT_PRESETS.map(preset => preset.id));
    const customById = new Map(customCanvasAiPromptPresets.map(preset => [preset.id, preset]));
    const hiddenBuiltInIds = new Set(hiddenBuiltInCanvasAiPromptPresetIds);
    return [
      ...CANVAS_AI_PROMPT_PRESETS
        .filter(preset => !hiddenBuiltInIds.has(preset.id))
        .map(preset => customById.get(preset.id) || preset),
      ...customCanvasAiPromptPresets.filter(preset => !defaultIds.has(preset.id) || hiddenBuiltInIds.has(preset.id)),
    ];
  }, [customCanvasAiPromptPresets, hiddenBuiltInCanvasAiPromptPresetIds]);
  const canvasAiPromptPresetSelectOptions = useMemo<RoundedSelectOption[]>(() => [
    { value: CANVAS_AI_PROMPT_PRESET_PLACEHOLDER, label: '节点…', hiddenInMenu: true },
    ...canvasAiPromptPresets.map(preset => ({
      value: preset.id,
      label: preset.label,
      hint: preset.hint || '创建带固定提示词的 AI 节点',
      meta: preset.aspectRatio,
      section: '节点预设',
      sectionHint: '选择后新增一个 AI 生图节点',
    })),
    { value: CANVAS_AI_PROMPT_PRESET_ADD_VALUE, label: '+ 新增节点预设', hint: '保存常用节点提示词', section: '操作', kind: 'action' },
    { value: CANVAS_AI_PROMPT_PRESET_MANAGE_VALUE, label: '管理节点预设', hint: '编辑名称和提示词', section: '操作', kind: 'action' },
  ], [canvasAiPromptPresets]);
  const canvasWorkflowTemplates = useMemo(() => {
    const customIds = new Set(customCanvasWorkflows.map(workflow => workflow.id));
    const hiddenBuiltInIds = new Set(hiddenBuiltInCanvasWorkflowIds);
    return [
      ...CANVAS_BUILT_IN_WORKFLOWS
        .filter(workflow => !hiddenBuiltInIds.has(workflow.id))
        .map(workflow => customIds.has(workflow.id)
          ? customCanvasWorkflows.find(custom => custom.id === workflow.id) || workflow
          : workflow),
      ...customCanvasWorkflows.filter(workflow => !CANVAS_BUILT_IN_WORKFLOWS.some(builtIn => builtIn.id === workflow.id) || hiddenBuiltInIds.has(workflow.id)),
    ];
  }, [customCanvasWorkflows, hiddenBuiltInCanvasWorkflowIds]);
  const inspirationSpaceTemplateOptions = useMemo<InspirationSpaceTemplateOption[]>(() => {
    const builtInPresetIds = new Set(CANVAS_AI_PROMPT_PRESETS.map(preset => preset.id));
    return [
      ...canvasAiPromptPresets.map(preset => ({
        id: preset.id,
        label: preset.label,
        hint: preset.hint || '',
        kind: 'NODE_PRESET' as const,
        builtin: builtInPresetIds.has(preset.id),
      })),
      ...canvasWorkflowTemplates.map(workflow => ({
        id: workflow.id,
        label: workflow.label,
        hint: workflow.hint || '',
        kind: 'WORKFLOW' as const,
        builtin: Boolean(workflow.builtin),
      })),
    ];
  }, [canvasAiPromptPresets, canvasWorkflowTemplates]);
  const canvasWorkflowSelectOptions = useMemo<RoundedSelectOption[]>(() => [
    { value: CANVAS_WORKFLOW_SELECT_PLACEHOLDER, label: '工作…', hiddenInMenu: true },
    ...canvasWorkflowTemplates.map(workflow => ({
      value: workflow.id,
      label: workflow.label,
      hint: workflow.hint || '多节点自动生成流程',
      meta: workflow.builtin ? '内置' : '自定义',
      section: '工作流',
      sectionHint: '插入可展开的工作流模块',
    })),
    { value: CANVAS_WORKFLOW_SAVE_SELECTION_VALUE, label: '+ 保存选中', hint: '把当前选择封装成工作流', section: '操作', kind: 'action' },
    { value: CANVAS_WORKFLOW_MANAGE_VALUE, label: '管理工作流', hint: '编辑或另存工作流', section: '操作', kind: 'action' },
  ], [canvasWorkflowTemplates]);
  useEffect(() => {
    const presetIds = new Set(canvasAiPromptPresets.map(preset => preset.id));
    setSelectedCanvasPresetDeleteIds(prev => {
      const next = prev.filter(id => presetIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [canvasAiPromptPresets]);
  useEffect(() => {
    const workflowIds = new Set(canvasWorkflowTemplates.map(workflow => workflow.id));
    setSelectedCanvasWorkflowDeleteIds(prev => {
      const next = prev.filter(id => workflowIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [canvasWorkflowTemplates]);
  const licenseAiAccess = licenseStatus?.valid ? licenseStatus.ai_access : null;
  const canvasAiUsesCloudImageModels = canvasAiCredentialSource === 'wallet' && Boolean(cloudAccount);
  const isCanvasAiLicenseManaged = !isByokUnlocked
    && !cloudAccount
    && !canvasAiApiKey.trim()
    && licenseAiAccess?.mode === 'license_managed'
    && !!licenseAiAccess.canvas_provider
    && !!licenseAiAccess.canvas_base_url
    && !!licenseAiAccess.canvas_model;
  const managedCanvasAiProvider = canvasAiProviderForGateway(
    licenseAiAccess?.canvas_gateway_kind,
    licenseAiAccess?.canvas_provider,
  );
  const cloudCanvasAiProvider = canvasAiCloudImageModels
    ? canvasAiProviderForCloudKind(canvasAiCloudImageModels.provider)
    : null;
  const effectiveCanvasAiProvider = canvasAiUsesCloudImageModels && cloudCanvasAiProvider
    ? cloudCanvasAiProvider
    : isCanvasAiLicenseManaged ? managedCanvasAiProvider : canvasAiProvider;
  const effectiveCanvasAiGatewayKind = isCanvasAiLicenseManaged
    ? licenseAiAccess?.canvas_gateway_kind || canvasAiGatewayKindForProvider(managedCanvasAiProvider)
    : canvasAiGatewayKindForProvider(canvasAiProvider);
  const effectiveCanvasAiApiProvider = isCanvasAiLicenseManaged
    ? String(licenseAiAccess?.canvas_provider || '').trim()
    : canvasAiApiProvider.trim() || defaultCanvasAiApiProvider(canvasAiProvider);
  const effectiveCanvasAiEndpoint = isCanvasAiLicenseManaged
    ? String(licenseAiAccess?.canvas_base_url || '').trim()
    : canvasAiEndpoint;
  const effectiveCanvasAiModel = isCanvasAiLicenseManaged
    ? String(licenseAiAccess?.canvas_model || '').trim()
    : '';
  const canvasAiHasApiCredential = isCanvasAiLicenseManaged || !!canvasAiApiKey.trim();
  const canvasAiHasModelCredential = canvasAiHasApiCredential
    || (effectiveCanvasAiProvider === 'new-api' && !!canvasAiNewApiVideoKey.trim());
  const canvasAiCanRefreshModels = canvasAiUsesCloudImageModels || (
    Boolean((effectiveCanvasAiEndpoint || canvasAiEndpoint).trim()) && canvasAiHasModelCredential
  );
  const managedCanvasAiProviderLabel = `高级版授权 · ${licenseAiAccess?.canvas_gateway_kind || managedCanvasAiProvider}`;
  const canvasAiRemoteModelCount = canvasAiUsesCloudImageModels
    ? canvasAiCloudImageModels?.models.length || 0
    : effectiveCanvasAiProvider === 'xais-chat'
    ? canvasAiXaisModels.length
    : effectiveCanvasAiProvider === 'new-api'
      ? canvasAiNewApiModels.length
    : effectiveCanvasAiProvider === 'mikoto'
      ? canvasAiMikotoModels.length
    : canvasAiOpenAiModels.length;
  const canvasAiRemoteModelEmptyHint = effectiveCanvasAiProvider === 'xais-chat'
    ? canvasAiUsesCloudImageModels ? '从授权钱包生图渠道读取模型' : '填入 Key 后自动读取 /v1/models'
    : canvasAiUsesCloudImageModels ? '从授权钱包生图渠道读取模型' : '填入 Key 和 URL 后自动刷新';
  const canvasAiXaisBalanceText = canvasAiXaisBalance.status === 'success'
    ? canvasAiXaisBalance.message || '余额已读取'
    : canvasAiXaisBalance.status === 'loading'
      ? '正在查询余额'
      : canvasAiXaisBalance.status === 'error'
        ? canvasAiXaisBalance.message || '查询余额失败'
        : '点击查询当前 Gateway 余额';
  const localXaisApiKey = (canvasAiProvider === 'xais-chat'
    ? canvasAiApiKey
    : getStoredCanvasAiApiKey('xais-chat')).trim();
  const hasLocalXaisAccount = localXaisApiKey.length > 0;

  useEffect(() => {
    setCanvasAiXaisBalance(prev => (
      prev.status === 'loading' ? prev : { status: 'idle' }
    ));
  }, [effectiveCanvasAiProvider, effectiveCanvasAiGatewayKind, effectiveCanvasAiApiProvider, canvasAiApiKey, canvasAiEndpoint, canvasAiHeadersText, effectiveCanvasAiEndpoint, isCanvasAiLicenseManaged]);

  const checkCanvasAiXaisBalance = async () => { return checkCanvasAiXaisBalanceImpl({ canvasAiApiKey, canvasAiEndpoint, canvasAiHeadersText, effectiveCanvasAiApiProvider, effectiveCanvasAiEndpoint, effectiveCanvasAiGatewayKind, effectiveCanvasAiModel, isCanvasAiLicenseManaged, setCanvasAiXaisBalance, showToast }); };

  const refreshCanvasAiOpenAiModels = async (silent = false) => { return refreshCanvasAiOpenAiModelsImpl({ canvasAiApiKey, canvasAiCloudImageModels, canvasAiEndpoint, canvasAiHeadersText, canvasAiModelRefreshSignatureRef, canvasAiNewApiVideoKey, canvasAiProvider, canvasAiUsesCloudImageModels, effectiveCanvasAiApiProvider, effectiveCanvasAiEndpoint, effectiveCanvasAiGatewayKind, effectiveCanvasAiModel, effectiveCanvasAiProvider, isCanvasAiLicenseManaged, setCanvasAiCloudImageModels, setCanvasAiMikotoModels, setCanvasAiNewApiModels, setCanvasAiOpenAiModelError, setCanvasAiOpenAiModels, setCanvasAiXaisModels, setIsRefreshingCanvasAiOpenAiModels, showToast, updateCanvasItemsImmediate }, silent); };

  useEffect(() => { return runSettingsEffect02({ canvasAiApiKey, canvasAiEndpoint, canvasAiHeadersText, canvasAiModelRefreshSignatureRef, canvasAiNewApiVideoKey, canvasAiUsesCloudImageModels, effectiveCanvasAiApiProvider, effectiveCanvasAiEndpoint, effectiveCanvasAiGatewayKind, effectiveCanvasAiModel, effectiveCanvasAiProvider, isCanvasAiLicenseManaged, isCanvasMode, isDrawerAgentOpen, refreshCanvasAiOpenAiModels }); }, [isCanvasMode, isDrawerAgentOpen, effectiveCanvasAiProvider, effectiveCanvasAiGatewayKind, effectiveCanvasAiApiProvider, effectiveCanvasAiEndpoint, effectiveCanvasAiModel, canvasAiApiKey, canvasAiNewApiVideoKey, canvasAiEndpoint, canvasAiHeadersText, isCanvasAiLicenseManaged, canvasAiUsesCloudImageModels]);

  useEffect(() => { return runSettingsEffect03({ canvasAiUsesCloudImageModels, effectiveCanvasAiProvider, isCanvasMode, setCanvasAiCloudImageModels, updateCanvasItemsImmediate }); }, [isCanvasMode, canvasAiUsesCloudImageModels, effectiveCanvasAiProvider]);

  const getAiAnalysisConfig = (): AiAnalysisConfig => ({
    provider: aiApiProvider,
    endpoint: aiApiEndpoint.trim(),
    apiKey: aiApiKey.trim(),
    model: aiApiModel.trim(),
    proxy: '',
  });

  const hasAiAnalysis = isSiliconFlowProvider(aiApiProvider)
    ? aiApiEndpoint.trim().length > 0 && aiApiKey.trim().length > 0 && aiApiModel.trim().length > 0
    : aiApiEndpoint.trim().length > 0;
  const hasRemoteImageSearch = () => (
    (hasAiAnalysis && isSiliconFlowProvider(aiApiProvider))
    || (
      canvasAgent.settings.hasApiKey
      && !!canvasAgent.settings.apiBaseUrl.trim()
      && !!canvasAgent.settings.apiModel.trim()
    )
  );
  const remoteImageSearchLabel = () => { return remoteImageSearchLabelImpl({ aiApiModel, canvasAgent }); };

  const checkLocalXaisBalance = async () => { return checkLocalXaisBalanceImpl({ localXaisApiKey, setCanvasAiXaisBalance }); };

  const refreshVisibleBalances = async () => {
    const tasks: Promise<unknown>[] = [refreshCloudAccount(true)];
    if (hasLocalXaisAccount) tasks.push(checkLocalXaisBalance());
    await Promise.allSettled(tasks);
    showToast('额度信息已刷新');
  };


  useEffect(() => { return runSettingsEffect04({ idleAutoCloseTimerRef, startupAutoCloseTimerRef }); }, []);

  useEffect(() => { return runSettingsEffect05({ cloudStartupSyncStartedRef, refreshCloudAccount, refreshLicenseStatus, setCanvasShortcut, setIsAutoStart, setLocalIP, setMobilePairUrl, setNoteShortcut, setSearchShortcut, setShortcut, setSnipShortcut, setTextShortcut, setTriggerShortcut }); }, []);

  const handleOpenTextInput = () => { setIsDrawerAgentOpen(false); setShowTextInput(true); setShowWebImageCollector(false); setIsSearchActive(false); setShowSettings(false); setShowFolderModal(false); };
  const normalizeWebImageCollectorTag = (value: string) => (
    String(value || '')
      .trim()
      .replace(/[，、,]+/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 24)
  );

  const normalizeWebImageCollectorTags = (values: string[]) => {
    const tags: string[] = [];
    values.forEach(value => {
      const clean = normalizeWebImageCollectorTag(value);
      if (!clean || tags.includes(clean)) return;
      tags.push(clean);
    });
    return tags.slice(0, 8);
  };

  const splitWebImageTagsFromQuery = (query: string) => normalizeWebImageCollectorTags(
    String(query || '')
      .split(/[，,、\s]+/)
      .filter(Boolean),
  );

  const normalizeRemoteImageSearchDescription = (value: unknown): WebImageSearchDescription => { return normalizeRemoteImageSearchDescriptionImpl({ normalizeWebImageCollectorTag, normalizeWebImageCollectorTags, splitWebImageTagsFromQuery }, value); };

  const normalizeLocalVlmImageSearchDescription = (value: unknown): WebImageSearchDescription => ({
    ...normalizeRemoteImageSearchDescription(value),
    source: 'ollama',
  });

  const webImageSearchSourceLabel = (source: WebImageSearchDescription['source']) => {
    if (source === 'ollama') return '本地大模型';
    return '硅基流动';
  };

  const applyWebImageCollectorTags = (values: string[], fallbackQuery = '') => {
    const tags = normalizeWebImageCollectorTags(values);
    const query = tags.length ? tags.join(' ') : String(fallbackQuery || '').trim().replace(/\s+/g, ' ');
    setWebImageCollectorTags(tags);
    setWebImageCollectorQuery(query);
    return { tags, query };
  };

  const updateWebImageCollectorTag = (index: number, value: string) => {
    const next = [...webImageCollectorTags];
    next[index] = value.replace(/[，、,]+/g, ' ').slice(0, 24);
    applyWebImageCollectorTags(next, webImageCollectorQuery);
  };

  const removeWebImageCollectorTag = (index: number) => {
    applyWebImageCollectorTags(webImageCollectorTags.filter((_, itemIndex) => itemIndex !== index), webImageCollectorQuery);
  };

  const addWebImageCollectorTag = (value = webImageCollectorTagDraft) => {
    const parts = String(value || '').split(/[，,、\n]+/).filter(Boolean);
    if (parts.length === 0) return;
    applyWebImageCollectorTags([...webImageCollectorTags, ...parts], webImageCollectorQuery);
    setWebImageCollectorTagDraft('');
  };

  const clearWebImageCollectorTags = () => {
    setWebImageCollectorTags([]);
    setWebImageCollectorTagDraft('');
  };

  const closeWebImageCollector = () => {
    if (isCollectingWebImages || isGeneratingWebImageQuery) return;
    setShowWebImageCollector(false);
    setWebImageCollectorReference(null);
    setWebImageCollectorStatus('');
    setWebImageCollectorQuery('');
    clearWebImageCollectorTags();
  };

  useEffect(() => { return runSettingsEffect06({ closeWebImageCollector, showWebImageCollector, webImageCollectorPanelRef }); }, [showWebImageCollector, isCollectingWebImages, isGeneratingWebImageQuery]);

  const announceLocalVisionModelReady = (options: { force?: boolean } = {}) => { return announceLocalVisionModelReadyImpl({ drawerHeightRef, drawerWidthRef, localVisionModelDownloadStartedRef, localVisionModelReadyNotifiedRef, setIsOpen, setLocalVisionModelLastError, setWebImageCollectorStatus, showToast, triggerModeRef }, options); };

  const handleLocalVisionModelProgress = (progress: { stage?: string; message: string; progress?: number }) => { return handleLocalVisionModelProgressImpl({ announceLocalVisionModelReady, isCollectingWebImagesRef, localVisionModelDownloadStartedRef, localVisionModelPreparingRef, localVisionModelReadyRef, setLocalVisionModelDownload, setLocalVisionModelLastError, setWebImageCollectorStatus, showWebImageCollector }, progress); };

  const showLocalVisionModelError = (err: unknown, options: { silent?: boolean } = {}) => { return showLocalVisionModelErrorImpl({ localVisionModelPreparingRef, localVisionModelReadyRef, setLocalVisionModelDownload, setLocalVisionModelLastError, setWebImageCollectorStatus, showWebImageCollector }, err, options); };

  const checkLocalVisionModelStatus = async (options: { silent?: boolean } = {}) => { return checkLocalVisionModelStatusImpl({ getStoredLocalVisionModel, localVisionModelPreparingRef, localVisionModelReadyRef, setIsLocalVisionModelChecking, setLocalVisionModelDownload, setLocalVisionModelLastError, showLocalVisionModelError }, options); };

  const ensureLocalVisionModel = (options: { silent?: boolean; toast?: boolean; notifyReady?: boolean } = {}) => { return ensureLocalVisionModelImpl({ announceLocalVisionModelReady, getStoredLocalVisionModel, localVisionModelDownloadStartedRef, localVisionModelEnsurePromiseRef, localVisionModelPreparingRef, localVisionModelReadyRef, setLocalVisionModelDownload, setLocalVisionModelLastError, showLocalVisionModelError, showToast }, options); };

  const retryLocalVisionModelDownload = async () => {
    setWebImageCollectorStatus('正在下载本地大模型增量包');
    try {
      await ensureLocalVisionModel({ silent: false, toast: true, notifyReady: true });
      showToast('本地大模型已准备好');
    } catch (_) {
      showToast('增量包下载失败，请先安装或启动 Ollama');
    }
  };

  const installOllamaSilently = async () => { return installOllamaSilentlyImpl({ ensureLocalVisionModel, isInstallingOllama, localVisionModelPreparingRef, setIsInstallingOllama, setLocalVisionModelDownload, setLocalVisionModelLastError, showLocalVisionModelError, showToast }); };

  const openOllamaDownloadPage = async () => {
    try {
      await openUrl('https://ollama.com/download/windows');
    } catch (err) {
      console.warn('打开 Ollama 下载页失败:', err);
      showToast('无法打开 Ollama 下载页');
    }
  };

  useEffect(() => { return runSettingsEffect07({ checkLocalVisionModelStatus, handleLocalVisionModelProgress }); }, []);

  const collectWebImagesToDrawer = async (queryOverride?: string) => { return collectWebImagesToDrawerImpl({ clearWebImageCollectorTags, createAssetId, enqueueAutoAiTaggingForItems, foldersRef, getLatestFileCacheDir, insertDrawerFolderAtTop, isCollectingWebImages, persistFoldersSnapshot, pushDrawerUndoSnapshot, setActiveFolderId, setActiveTab, setFolders, setIsCollectingWebImages, setIsOpen, setItems, setLocalVisionModelDownload, setShowWebImageCollector, setWebImageCollectorQuery, setWebImageCollectorReference, showToast, webImageCollectorQuery }, queryOverride); };

  const describeReferenceImageForSearch = async (reference: WebImageCollectorReference, hint: string): Promise<WebImageSearchDescription> => { return describeReferenceImageForSearchImpl({ getAiAnalysisConfig, getStoredLocalVisionModel, hasRemoteImageSearch, imageSourceToModelDataUrl, localVisionModelReadyRef, normalizeLocalVlmImageSearchDescription, normalizeRemoteImageSearchDescription, remoteImageSearchLabel, setWebImageCollectorStatus, showLocalVisionModelError }, reference, hint); };

  const generateQueryAndCollectFromReference = async (reference: WebImageCollectorReference | null = webImageCollectorReference, hintOverride?: string) => { return generateQueryAndCollectFromReferenceImpl({ applyWebImageCollectorTags, describeReferenceImageForSearch, hasRemoteImageSearch, isCollectingWebImages, isGeneratingWebImageQuery, localVisionModelLastError, localVisionModelPreparingRef, localVisionModelReadyRef, setActiveSettingCategory, setIsGeneratingWebImageQuery, setIsOpen, setIsSearchActive, setShowFolderModal, setShowMoveFolderModal, setShowSettings, setShowTextInput, setShowWebImageCollector, setWebImageCollectorStatus, setWebImageCollectorTagDraft, showToast, splitWebImageTagsFromQuery, webImageCollectorQuery, webImageSearchSourceLabel }, reference, hintOverride); };

  const chooseReferenceImageForCollector = async () => { return chooseReferenceImageForCollectorImpl({ clearWebImageCollectorTags, isCollectingWebImages, isGeneratingWebImageQuery, setWebImageCollectorQuery, setWebImageCollectorReference, setWebImageCollectorStatus, showToast }); };

  const handleOpenFolderModal = (parentId?: string) => { return handleOpenFolderModalImpl({ foldersRef, setFolderContextMenu, setIsSearchActive, setNewFolderName, setNewFolderParentId, setShowFolderModal, setShowMoveExistingFolderModal, setShowSettings, setShowTextInput, setShowWebImageCollector }, parentId); };
  const closeFolderModal = () => {
    setShowFolderModal(false);
    setNewFolderName('');
    setNewFolderParentId(null);
  };
  const commitQuickText = () => {
    if (!quickText.trim()) return;
    const newItem: BufferItem = createTextOrUrlItem(quickText, '灵感笔记');
    pushDrawerUndoSnapshot('新增文字');
    setItems(prev => [newItem, ...prev]);
    setActiveTab('text');
    setQuickText('');
    handleCloseTextInput();
  };
  const activateSearch = () => {
    setIsSearchActive(true);
    setShowSettings(false);
    setShowTextInput(false);
    setShowWebImageCollector(false);
    setShowFolderModal(false);
  };
  const toggleSearch = () => { return toggleSearchImpl({ activateSearch, isSearchActive, searchInputRef, setIsSearchActive, setSearchQuery }); };
  const toggleSettings = () => {
    if (!showSettings) {
      setIsDrawerAgentOpen(false);
      setShowSettings(true); setIsSearchActive(false); setShowTextInput(false); setShowWebImageCollector(false); setShowFolderModal(false);
    } else {
      setShowSettings(false);
    }
  };

  useEffect(() => { return runSettingsEffect08({ setShowSettings, showSettings }); }, [showSettings]);

  useEffect(() => { return runSettingsEffect09({ folderContextMenu, setFolderContextMenu }); }, [folderContextMenu]);

  const toggleTriggerMode = () => {
    const current = triggerModeRef.current;
    const next: TriggerMode = current === 'edge' ? 'float' : 'edge';
    setTriggerMode(next);
    triggerModeRef.current = next;
    localStorage.setItem('drawer_trigger_mode', next);
    emitTo('edge', 'trigger-mode-changed', next).catch(() => {});
    showToast(next === 'float' ? '已切换为悬浮方块模式' : '已切换为侧边小条模式');
  };

  const toggleCanvasWorkbenchMode = () => {
    const next = !isCanvasWorkbenchMode;
    setIsCanvasWorkbenchMode(next);
    showToast(next ? '已开启画布工作台模式' : '已关闭画布工作台模式');
  };

  const toggleDrawerWorkbenchMode = () => { return toggleDrawerWorkbenchModeImpl({ closeTimerRef, idleAutoCloseTimerRef, isDrawerWorkbenchMode, isPinnedRef, isPointerInsideDrawerRef, setDrawerState, setIsDrawerWorkbenchMode, setIsOpen, setIsPinned, showToast }); };

  const toggleAutoStartSetting = async () => { return toggleAutoStartSettingImpl({ isAutoStart, isAutoStartChanging, setIsAutoStart, setIsAutoStartChanging, showToast }); };

  const toggleCalendarNotificationsSetting = () => {
    const next = !calendarNotificationsEnabled;
    setCalendarNotificationsEnabled(next);
    showToast(next ? '已开启日程通知' : '已关闭日程通知');
  };

  const toggleScreenshotAutoPinNoteSetting = () => {
    const next = !screenshotAutoPinNote;
    screenshotAutoPinNoteRef.current = next;
    setScreenshotAutoPinNote(next);
    showToast(next ? '截图后将自动置顶为便签' : '已关闭截图自动置顶便签');
  };

  useEffect(() => { return runSettingsEffect10({ enforceAntiTouchClosed, setIsDark, showToast, stateRef, toggleTriggerMode }); }, [triggerMode]);

  const isUtilityActiveTab = activeTab === 'notes' || activeTab === 'calendar' || isCanvasMode;
  const markDrawerFirstPageReady = useCallback(() => setIsDataLoaded(true), []);
  const {
    totalAssetCount,
    assetWindowOffset,
    hasMoreAssets,
    isAssetPageLoading,
    folderAssetCountRows,
    quickAccessItems,
    setQuickAccessItems,
    loadNextDrawerAssetPage,
    loadPreviousDrawerAssetPage,
    refreshDrawerAssetQuery,
    cancelDrawerAssetQuery,
  } = useDrawerAssetQuery({
    ready: assetLibraryReady,
    storageMode: assetStorageMode,
    isUtilityActive: isUtilityActiveTab,
    query: drawerAssetListOptions,
    queryKey: drawerAssetQueryKey,
    statsRevision: assetStatsRevision,
    items,
    itemsRef,
    replaceAssets: replaceAssetsFromQuery,
    appendAssets: appendAssetsFromQuery,
    onFirstPageReady: markDrawerFirstPageReady,
  });

  useEffect(() => {
    drawerUndoStackRef.current = [];
    drawerTextEditUndoIdsRef.current.clear();
  }, [drawerAssetQueryKey]);

  const folderChildrenByParent = useMemo(() => {
    const grouped = new Map<string, Folder[]>();
    folders.forEach(folder => {
      if (!folder.parentId) return;
      grouped.set(folder.parentId, [...(grouped.get(folder.parentId) || []), folder]);
    });
    return grouped;
  }, [folders]);
  const visibleFolderEntries = useMemo(() => flattenDrawerFolderTree(folders, collapsedFolderIds), [folders, collapsedFolderIds]);
  const orderedFolderEntries = useMemo(() => flattenDrawerFolderTree(folders, []), [folders]);
  const orderedFolders = useMemo(() => orderedFolderEntries.map(entry => entry.folder), [orderedFolderEntries]);
  const visibleFolderRailEntryCount = useMemo(() => (
    visibleFolderEntries.length
  ), [visibleFolderEntries]);
  const aiGeneratedImageFolderIds = useMemo(
    () => getAiGeneratedImageFolderIds(folders),
    [folders],
  );
  const folderItemCounts = useMemo(() => {
    const directCounts = new Map(
      folderAssetCountRows
        .filter((row): row is { folderId: string; count: number } => Boolean(row.folderId))
        .map(row => [row.folderId, row.count]),
    );
    const counts = new Map<string, number>();
    folders.forEach(folder => {
      const scopeIds = getDrawerFolderScopeIds(folders, folder.id);
      let count = 0;
      scopeIds.forEach(id => { count += directCounts.get(id) || 0; });
      counts.set(folder.id, count);
    });
    return counts;
  }, [folderAssetCountRows, folders]);
  const visibleFolderIds = useMemo(() => visibleFolderEntries.map(entry => entry.folder.id), [visibleFolderEntries]);
  const folderMoveSelectionIds = useMemo(() => (
    selectedFolderIds.filter(id => folders.some(folder => folder.id === id))
  ), [folders, selectedFolderIds]);
  const folderMoveTargetEntries = orderedFolderEntries;
  const isInvalidFolderMoveTarget = useCallback((targetId: string | null, movingIds = folderMoveSelectionIds) => {
    if (!targetId) return false;
    if (movingIds.includes(targetId)) return true;
    return movingIds.some(id => isDrawerFolderDescendant(folders, targetId, id));
  }, [folderMoveSelectionIds, folders]);
  const mainDrawerItemCount = useMemo(() => (
    folderAssetCountRows.find(row => row.folderId === null)?.count || 0
  ), [folderAssetCountRows]);
  const drawerAiAnalysisSummary = useMemo(() => {
    if (assetStorageMode === 'sqlite' && sqliteAiAnalysisSummary) {
      return sqliteAiAnalysisSummary;
    }
    const images = items.filter(item => item.type === 'image');
    return {
      analyzed: images.filter(item => hasUsableInspirationAiTags(item.inspirationProfile)).length,
      skipped: images.filter(item => (
        !hasUsableInspirationAiTags(item.inspirationProfile)
        && shouldSkipInspirationAnalysis(item.inspirationAnalysisFailure)
      )).length,
      waitingRetry: images.filter(item => (
        !hasUsableInspirationAiTags(item.inspirationProfile)
        && Boolean(item.inspirationAnalysisFailure)
        && !shouldSkipInspirationAnalysis(item.inspirationAnalysisFailure)
      )).length,
      total: images.length,
    };
  }, [assetStorageMode, items, sqliteAiAnalysisSummary]);
  const drawerAiClassificationGroups = useMemo(() => (
    buildAiClassificationGroups(drawerScopedItems, drawerAiClassificationDimension)
  ), [drawerAiClassificationDimension, drawerScopedItems]);
  const displayItems = useMemo(() => {
    if (!isDrawerAiClassificationMode || activeDrawerAiClassificationLabel === 'all') {
      return drawerScopedItems;
    }
    return drawerScopedItems.filter(item => itemMatchesAiClassification(
      item,
      drawerAiClassificationDimension,
      activeDrawerAiClassificationLabel,
    ));
  }, [
    activeDrawerAiClassificationLabel,
    drawerAiClassificationDimension,
    drawerScopedItems,
    isDrawerAiClassificationMode,
  ]);
  useEffect(() => { return runSettingsEffect11({ activeDrawerAiClassificationLabel, drawerAiClassificationGroups, isDrawerAiClassificationMode, setActiveDrawerAiClassificationLabel }); }, [
    activeDrawerAiClassificationLabel,
    drawerAiClassificationGroups,
    isDrawerAiClassificationMode,
  ]);
  const canvasDrawerSourceItemIds = useMemo(() => {
    if (!isCanvasMode || !isSearchActive || !normalizedDeferredSearchQuery) return new Set<string>();
    return new Set(canvasItems.flatMap(canvasItem => (
      canvasItem.item.sourceItemId ? [canvasItem.item.sourceItemId] : []
    )));
  }, [canvasItems, isCanvasMode, isSearchActive, normalizedDeferredSearchQuery]);

  const setDrawerItemQuickAccess = useCallback((item: BufferItem, enabled: boolean) => {
    const nextItem = { ...item, isQuickAccess: enabled };
    const isLoaded = itemsRef.current.some(candidate => candidate.id === item.id);
    if (isLoaded) {
      setItems(previous => previous.map(candidate => candidate.id === item.id ? nextItem : candidate));
    } else if (assetStorageMode === 'sqlite') {
      void updateAsset(item.id, { metadata: nextItem })
        .then(() => setAssetStatsRevision(revision => revision + 1))
        .catch(error => console.warn('更新快速访问失败:', error));
    }
    setQuickAccessItems(previous => enabled
      ? [...new Map([nextItem, ...previous].map(candidate => [candidate.id, candidate])).values()]
      : previous.filter(candidate => candidate.id !== item.id));
  }, [assetStorageMode, setItems]);

  const drawerCardActionContext = useMemo(() => ({}), []);

  const calendarEvents = useMemo<CalendarScheduleEvent[]>(() => {
    const sourceById = new Map(items.map(item => [item.id, item]));

    return openFloatingNoteEntries.flatMap(({ label, snapshot }) => {
      if (!snapshot || snapshot.type !== 'text' || snapshot.noteMode !== 'schedule' || !Array.isArray(snapshot.scheduleItems)) {
        return [];
      }

      const source = sourceById.get(snapshot.itemId);
      const fallbackTagIds = getFolderTagIds(snapshot.folderId || source?.folderId, snapshot.tagIds);
      const sourceTitle = snapshot.name || source?.remark || source?.name || source?.content || '日程便签';

      return snapshot.scheduleItems.map(schedule => {
        const tagIds = getFolderTagIds(undefined, schedule.tagIds && schedule.tagIds.length > 0 ? schedule.tagIds : fallbackTagIds);
        const dayKey = schedule.startAt ? getLocalDateKey(schedule.startAt) : '';
        return {
          id: `${label}:${schedule.id}`,
          noteLabel: label,
          note: snapshot,
          item: source,
          schedule,
          title: schedule.text,
          sourceTitle,
          dayKey,
          tagIds,
          isUnscheduled: !dayKey,
        } as CalendarScheduleEvent;
      });
    });
  }, [openFloatingNoteEntries, items, noteManagerVersion]);

  const filteredCalendarEvents = useMemo(() => (
    calendarEvents.filter(event => {
      if (calendarTagFilter === 'all') return true;
      if (calendarTagFilter === 'untagged') return event.tagIds.length === 0;
      const folderScopeIds = getDrawerFolderScopeIds(folders, calendarTagFilter);
      return event.tagIds.some(tagId => folderScopeIds.has(tagId));
    })
  ), [calendarEvents, calendarTagFilter, folders]);
  const calendarTagOptions = useMemo(() => ([
    { value: 'all', label: '全部' },
    { value: 'untagged', label: '无标签' },
    ...orderedFolders.map(folder => ({ value: folder.id, label: getDrawerFolderPathName(folders, folder.id) })),
  ]), [folders, orderedFolders]);
  const calendarTagFilterLabel = calendarTagOptions.find(option => option.value === calendarTagFilter)?.label || '全部';
  const calendarScheduleNoteOptions = useMemo<RoundedSelectOption[]>(() => {
    const sourceById = new Map(items.map(item => [item.id, item]));
    const existing = openFloatingNoteEntries
      .filter(entry => (
        entry.snapshot?.type === 'text' &&
        entry.snapshot.noteMode === 'schedule' &&
        Array.isArray(entry.snapshot.scheduleItems)
      ))
      .map((entry, index) => {
        const snapshot = entry.snapshot!;
        const source = sourceById.get(snapshot.itemId);
        const title = snapshot.name || source?.remark || source?.name || `日程便签 ${index + 1}`;
        const count = snapshot.scheduleItems?.length || 0;
        return {
          value: entry.label,
          label: `${title}${count > 0 ? ` · ${count}` : ''}`,
        };
      });

    return [
      { value: CALENDAR_NEW_NOTE_TARGET, label: '新便签' },
      ...existing,
    ];
  }, [openFloatingNoteEntries, items, noteManagerVersion]);

  useEffect(() => {
    if (
      calendarTargetNoteLabel !== CALENDAR_NEW_NOTE_TARGET &&
      !calendarScheduleNoteOptions.some(option => option.value === calendarTargetNoteLabel)
    ) {
      setCalendarTargetNoteLabel(CALENDAR_NEW_NOTE_TARGET);
    }
  }, [calendarTargetNoteLabel, calendarScheduleNoteOptions]);

  const calendarEventsByDay = useMemo(() => {
    const map = new Map<string, CalendarScheduleEvent[]>();
    filteredCalendarEvents.forEach(event => {
      if (!event.dayKey) return;
      const list = map.get(event.dayKey) || [];
      list.push(event);
      map.set(event.dayKey, list);
    });
    map.forEach(list => list.sort(compareCalendarEvents));
    return map;
  }, [filteredCalendarEvents]);

  const selectedCalendarEvents = calendarEventsByDay.get(getLocalDateKey(calendarSelectedDate)) || [];
  const unscheduledCalendarEvents = filteredCalendarEvents
    .filter(event => event.isUnscheduled)
    .sort(compareCalendarEvents);
  const calendarOpenCount = filteredCalendarEvents.filter(event => !event.schedule.done).length;
  const selectedCalendarOpenCount = selectedCalendarEvents.filter(event => !event.schedule.done).length;
  const buildAgentCalendarEvents = (limit = 80) => (
    filteredCalendarEvents.slice(0, limit).map(event => ({
      id: event.id,
      noteLabel: event.noteLabel,
      scheduleId: event.schedule.id,
      title: event.title,
      done: !!event.schedule.done,
      priority: normalizeSchedulePriority(event.schedule.priority),
      startAt: event.schedule.startAt,
      tagIds: event.tagIds,
      sourceTitle: event.sourceTitle,
    }))
  );

  const sendSystemNotification = async (title: string, body: string, options: { silent?: boolean } = {}) => { return sendSystemNotificationImpl({ showToast }, title, body, options); };

  const testCanvasAiConnection = async () => { return testCanvasAiConnectionImpl({ canvasAiApiKey, canvasAiEndpoint, canvasAiHeadersText, canvasAiUsesCloudImageModels, effectiveCanvasAiApiProvider, effectiveCanvasAiEndpoint, effectiveCanvasAiGatewayKind, effectiveCanvasAiModel, effectiveCanvasAiProvider, isCanvasAiLicenseManaged, setCanvasAiCloudImageModels, setIsTestingCanvasAiConnection, showToast }); };

  const notifyCanvasAiGenerationResult = (options: {
    status: 'success' | 'partial' | 'error';
    label: string;
    mediaType: 'image' | 'video';
    generatedCount?: number;
    requestedCount?: number;
    error?: string;
  }) => { return notifyCanvasAiGenerationResultImpl({ sendSystemNotification }, options); };

  useEffect(() => { return runDrawerCoreEffect01({ CALENDAR_NOTIFICATION_HOURS, CALENDAR_NOTIFICATION_SENT_STORAGE_PREFIX, calendarEventsByDay, calendarNotificationsEnabled, sendSystemNotification }); }, [calendarNotificationsEnabled, calendarEventsByDay]);

  const calendarMonthDays = useMemo(() => {
    const monthDate = new Date(calendarMonth);
    const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const firstOffset = firstOfMonth.getDay();
    const gridStart = addLocalDays(firstOfMonth.getTime(), -firstOffset);
    return Array.from({ length: 42 }, (_, index) => addLocalDays(gridStart, index));
  }, [calendarMonth]);

  const patchCalendarScheduleItem = async (
    noteLabel: string,
    scheduleId: string,
    patch: Partial<FloatingNoteScheduleItem>,
  ) => { return patchCalendarScheduleItemImpl({ pushDrawerUndoSnapshot, syncCalendarScheduleSnapshot }, noteLabel, scheduleId, patch); };

  const syncCalendarScheduleSnapshot = async (noteLabel: string, snapshot: FloatingNoteSnapshot) => { return syncCalendarScheduleSnapshotImpl({ emitFloatingNoteUpdated, refreshNoteManager, setItems }, noteLabel, snapshot); };

  const deleteCalendarScheduleItem = async (event: CalendarScheduleEvent) => { return deleteCalendarScheduleItemImpl({ pushDrawerUndoSnapshot, syncCalendarScheduleSnapshot }, event); };

  const ensureCalendarScheduleNote = (targetLabel = calendarTargetNoteLabel) => { return ensureCalendarScheduleNoteImpl({ CALENDAR_NEW_NOTE_TARGET, calendarTagFilter, openFloatingNoteEntries, setCalendarTargetNoteLabel, showToast }, targetLabel); };

  const addCalendarScheduleItem = async () => { return addCalendarScheduleItemImpl({ CALENDAR_NEW_NOTE_TARGET, calendarDraftPriority, calendarDraftText, calendarSelectedDate, calendarTagFilter, calendarTargetNoteLabel, ensureCalendarScheduleNote, pushDrawerUndoSnapshot, setCalendarDraftText, setCalendarTargetNoteLabel, syncCalendarScheduleSnapshot }); };

  const moveCalendarMonth = (delta: number) => {
    setCalendarMonth(prev => {
      const date = new Date(prev);
      return new Date(date.getFullYear(), date.getMonth() + delta, 1).getTime();
    });
  };

  const jumpCalendarToday = () => {
    const today = startOfLocalDay(Date.now());
    setCalendarMonth(today);
    setCalendarSelectedDate(today);
  };

  const getCalendarTagName = (tagId?: string) => {
    if (!tagId) return '无标签';
    return getDrawerFolderPathName(folders, tagId) || '未知标签';
  };

  const renderCalendarEvent = (event: CalendarScheduleEvent) => { return renderCalendarEventImpl({ deleteCalendarScheduleItem, focusFloatingNote, getCalendarTagName, patchCalendarScheduleItem }, event); };

  const ensureCanvasAiGeneratedFolder = (canvasId?: string | null) => { return ensureCanvasAiGeneratedFolderImpl({ canvasesRef, foldersRef, persistFoldersSnapshot, setFolders }, canvasId); };

  const ensureAiGeneratedVideoFolder = () => { return ensureAiGeneratedVideoFolderImpl({ AI_GENERATED_VIDEO_FOLDER_COLOR, AI_GENERATED_VIDEO_FOLDER_ID, AI_GENERATED_VIDEO_FOLDER_NAME, foldersRef, insertDrawerFolderAtTop, persistFoldersSnapshot, setFolders }); };

  const addGeneratedImagesToDrawer = (
    generatedItems: BufferItem[],
    options?: {
      canvasId?: string;
      onOutputCachePatch?: (
        outputId: string,
        matchSources: string[],
        patch: Partial<CanvasAiGeneratedOutput>
      ) => void;
      canvasOutputClientRequestId?: string;
    }
  ) => { return addGeneratedImagesToDrawerImpl({ GENERATED_IMAGE_CACHE_RETRY_DELAYS_MS, activeCanvasIdRef, addGeneratedImagesToDrawer, canvasPanRef, enqueueCanvasAiOutputThumbnailJob, ensureCanvasAiGeneratedFolder, generatedImageCachePendingIdsRef, generatedImageCachePromisesRef, isCanvasInteractingRef, isCanvasZoomingRef, setActiveFolderId, setActiveTab, updateCanvasItemsImmediate, updateDrawerItemsDeferred, webImageCacheDirRef }, generatedItems, options); };

  const addGeneratedVideosToDrawer = (generatedItems: BufferItem[]) => { return addGeneratedVideosToDrawerImpl({ ensureAiGeneratedVideoFolder, setActiveFolderId, setActiveTab, updateDrawerItemsDeferred }, generatedItems); };

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen('mobile-server-ready', (event: any) => {
      const url = String(event.payload || '');
      if (url) setMobilePairUrl(url);
    }).then(f => unlisten = f);
    return () => { if (unlisten) unlisten(); };
  }, []);

  useEffect(() => {
    let unlisten: () => void;
    listen('mobile-connected', () => {
      if (!isMobileConnected) showToast('📱 手机连接成功！');
      setIsMobileConnected(true); resetDisconnectTimer();
    }).then(f => unlisten = f);
    return () => { if (unlisten) unlisten(); };
  }, [isMobileConnected]);

  useEffect(() => { return runDrawerCoreEffect02({ createAssetId, enqueueAutoAiTaggingForItems, isMobileConnected, pushDrawerUndoSnapshot, resetDisconnectTimer, setActiveFolderId, setActiveTab, setIsMobileConnected, setIsOpen, setItems, shouldAcceptMobilePayload, showToast, stateRef }); }, [isMobileConnected]);

  useEffect(() => { return () => { if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current); }; }, []);

  const shouldAcceptMobilePayload = (data: any) => { return shouldAcceptMobilePayloadImpl({ recentMobilePayloadsRef }, data); };

  // 🌟 完美修复的快捷键注册逻辑
  useEffect(() => { return runDrawerCoreEffect03({ canvasShortcut, createBlankFloatingNote, enforceAntiTouchClosed, enterCanvasMode, isCanvasModeRef, licenseGateActiveRef, markShortcutReveal, noteShortcut, requestExitCanvasMode, searchInputRef, searchShortcut, setIsAntiTouchMode, setIsOpen, setIsPinned, setIsSearchActive, setSearchQuery, setShowFolderModal, setShowSettings, setShowTextInput, setShowWebImageCollector, shortcut, showToast, snipShortcut, startSnip, stateRef, textShortcut, toggleTriggerMode, triggerShortcut }); }, [snipShortcut, shortcut, textShortcut, searchShortcut, triggerShortcut, noteShortcut, canvasShortcut]);

  useEffect(() => { return runDrawerCoreEffect04({ drawerHeightRef, drawerWidthRef, isPointerInsideDrawerRef, setConfirmDialog, setIsAntiTouchMode, setIsOpen, setIsPinned, setShowFolderModal, setShowHelp, setShowQR, setShowSettings, setShowTextInput, setShowUpdateLog, setShowWebImageCollector, startupAutoCloseSuppressedRef, stateRef, triggerModeRef }); }, []);


  useEffect(() => { return runDrawerCoreEffect05({ clearIdleAutoClose, closeTimerRef, drawerAutoCloseBlockRef, drawerPanelInteractionHoldUntilRef, enforceAntiTouchClosed, idleAutoCloseTimerRef, isMainWorkbenchActiveRef, isPinnedRef, isPointerInsideDrawerRef, isSplashVisibleRef, isTextEntryActive, licenseGateActiveRef, setDrawerState, setIsOpen, setIsPinned, showLaunchIntroRef, showUpdateLogRef, snipExitInFlightRef, snipModeActiveRef, startupAutoCloseSuppressedRef, stateRef }); }, []);

  useEffect(() => { return runDrawerCoreEffect06({ enforceAntiTouchClosed, handleOpenTextInput, isCanvasModeRef, isSearchActive, setIsOpen, setIsSearchActive, setSearchQuery, setShowTextInput, showTextInput, stateRef, toggleSearch }); }, [showTextInput, isSearchActive]);

  useEffect(() => {
    if (!isOpen && !isPinned) {
      setShowSettings(false); setIsRecording(false); setIsRecordingSnip(false); setIsRecordingText(false); setIsRecordingSearch(false); setIsRecordingTrigger(false); setIsRecordingNote(false); setIsRecordingCanvas(false);
      setShowHelp(false); setShowQR(false); setIsSelectMode(false); setSelectedIds([]); lastSelectedDrawerItemIdRef.current = null;
      setConfirmDialog(prev => ({...prev, isOpen: false})); setShowTextInput(false); setShowWebImageCollector(false); setShowFolderModal(false);
      setFolderContextMenu(null); setShowMoveExistingFolderModal(false);
      setIsSearchActive(false); setSearchQuery(''); setEditingFolderId(null); setShowUpdateLog(false);
    }
  }, [isOpen, isPinned]);

  const isGlobalMouseDown = useRef(false);
  const isPinnedRef = useRef(isPinned);
  useEffect(() => { isPinnedRef.current = isPinned; }, [isPinned]);

  useEffect(() => { return runDrawerCoreEffect07({ isDraggingTitleRef, isGlobalMouseDown, previewDragActiveRef, setIsDraggingTitle }); }, []);

  useEffect(() => { return runDrawerCoreEffect08({ activeCanvasIdRef, applyCanvasScaleStyles, canvasItemsRef, canvasLastSyncedNodesSignatureRef, canvasReturnScrollRef, canvasScaleRef, canvasScrollLockRef, canvasSessionItemsRef, canvasSizeRef, canvasStateLoadedRef, getActiveCanvasRunNodeIds, getCanvasNodesPersistSignature, hasRestoredNonEmptyFoldersRef, readFoldersFromCache, replaceAssetsFromQuery, setActiveCanvasId, setAssetLibraryReady, setAssetStorageMode, setCanvasItems, setCanvasScale, setCanvasSize, setCanvasTrashCount, setCanvases, setFolders, setIsDataLoaded, setIsFoldersLoaded, sortCanvasesNewestFirst }); }, [replaceAssetsFromQuery]);

  const saveDrawerItemsNow = () => { return saveDrawerItemsNowImpl({ assetStorageMode, drawerItemsSaveInFlightRef, drawerItemsSaveQueuedRef, isDataLoaded, itemsRef, saveDrawerItemsNow }); };

  const scheduleDrawerItemsSave = () => { return scheduleDrawerItemsSaveImpl({ DRAWER_ITEMS_SAVE_DEBOUNCE_MS, drawerItemsSaveTimerRef, isDataLoaded, saveDrawerItemsNow }); };

  useEffect(() => {
    if (assetStorageMode === 'json') scheduleDrawerItemsSave();
  }, [assetStorageMode, items, isDataLoaded]);
  useEffect(() => () => {
    if (drawerItemsSaveTimerRef.current !== null) {
      window.clearTimeout(drawerItemsSaveTimerRef.current);
      drawerItemsSaveTimerRef.current = null;
    }
    saveDrawerItemsNow();
  }, [assetStorageMode, isDataLoaded]);
  useEffect(() => {
    if (canvasItemsPatchCommitRef.current) {
      canvasItemsPatchCommitRef.current = false;
      scheduleCanvasStateSave();
      return;
    }
    scheduleCanvasStateSave({ syncNodes: true });
  }, [canvasItems]);
  useEffect(() => { scheduleCanvasStateSave(); }, [canvasSize]);
  useEffect(() => () => {
    if (canvasPersistSaveTimerRef.current !== null) {
      window.clearTimeout(canvasPersistSaveTimerRef.current);
      canvasPersistSaveTimerRef.current = null;
    }
    saveCanvasStateNow({ syncNodes: true });
  }, []);
  const persistFoldersSnapshot = (nextFolders: Folder[]) => { return persistFoldersSnapshotImpl({ FOLDERS_CACHE_UPDATED_AT_STORAGE_KEY, hasRestoredNonEmptyFoldersRef }, nextFolders); };
  useEffect(() => {
    if (!isFoldersLoaded) return;
    persistFoldersSnapshot(folders);
  }, [folders, isFoldersLoaded]);
  const {
    eagleImportStatus,
    eagleImportMode,
    setEagleImportMode,
    importFromEagle,
    importFromEagleLibrary,
  } = useEagleImport({
    storageMode: assetStorageMode,
    folders,
    getCurrentAssets: () => itemsRef.current,
    getCacheDir: getLatestFileCacheDir,
    onFoldersReady: nextFolders => {
      const normalized = normalizeDrawerFolders(nextFolders);
      foldersRef.current = normalized;
      setFolders(normalized);
      persistFoldersSnapshot(normalized);
    },
    onJsonBatch: assets => {
      setItems(previous => [...assets, ...previous]);
    },
    onComplete: firstFolderId => {
      setActiveTab('all');
      if (firstFolderId) setActiveFolderId(firstFolderId);
      setAssetStatsRevision(revision => revision + 1);
      refreshDrawerAssetQuery();
    },
    showToast,
  });
  const broadcastFloatingNoteTextUpdate = (itemId: string, content?: string, name?: string, sourceLabel?: string) => { return broadcastFloatingNoteTextUpdateImpl({ emitFloatingNoteSourceUpdated }, itemId, content, name, sourceLabel); };

  const broadcastFloatingNoteTitleUpdate = (itemId: string, name: string, sourceLabel?: string) => { return broadcastFloatingNoteTitleUpdateImpl({ emitFloatingNoteSourceUpdated }, itemId, name, sourceLabel); };

  const applyFloatingTextPayloadToSnapshots = (payload: any) => { return applyFloatingTextPayloadToSnapshotsImpl({ refreshNoteManager }, payload); };

  useEffect(() => { return runDrawerCoreEffect09({ applyFloatingTextPayloadToSnapshots, beginFloatingTextUndo, broadcastFloatingNoteTextUpdate, broadcastFloatingNoteTitleUpdate, floatingBridgeSeenRef, setItems }); }, []);

// 🌟 1. 用 Ref 缓存 activeFolderId，防止在监听器内部拿到旧的数据
  const activeFolderIdRef = useRef(activeFolderId);
  useEffect(() => { activeFolderIdRef.current = activeFolderId; }, [activeFolderId]);

  const deleteDrawerLocalFiles = async (paths: string[]) => { return deleteDrawerLocalFilesImpl({}, paths); };

  const removeDrawerItemsFromDrawer = (targetItems: BufferItem[], label = '删除卡片') => {
    const ids = Array.from(new Set(targetItems.map(item => item.id).filter(Boolean)));
    if (ids.length === 0) return 0;
    const idSet = new Set(ids);
    pushDrawerUndoSnapshot(label);
    setItems(prev => prev.filter(item => !idSet.has(item.id)));
    return ids.length;
  };

  const requestDeleteDrawerItems = (
    targetItems: BufferItem[],
    options: { label?: string; afterDelete?: () => void } = {}
  ) => { return requestDeleteDrawerItemsImpl({ deleteDrawerLocalFiles, removeDrawerItemsFromDrawer, setConfirmDialog, showToast }, targetItems, options); };

  const imageThumbnailInFlightRef = useRef<Set<string>>(new Set());
  const imageThumbnailQueueRef = useRef<BufferItem[]>([]);
  const imageThumbnailActiveCountRef = useRef(0);
  const imageThumbnailPendingUpdatesRef = useRef(new Map<string, { thumbnail: string; existingThumbnail?: string }>());
  const imageThumbnailUpdateTimerRef = useRef<number | null>(null);
  const imageThumbnailDisposedRef = useRef(false);
  const canvasAiOutputThumbnailQueueRef = useRef<CanvasAiOutputThumbnailJob[]>([]);
  const canvasAiOutputThumbnailInFlightRef = useRef(new Set<string>());
  const canvasAiOutputThumbnailRecoveryAttemptedRef = useRef(new Set<string>());
  const canvasAiOutputSourceRecoveryAttemptedRef = useRef(new Set<string>());
  const canvasAiOutputSourceRecoveryRetryAtRef = useRef(new Map<string, number>());
  const canvasAiOutputSourceRecoveryInFlightRef = useRef(new Set<string>());
  const [canvasAiOutputSourceRecoveryTick, setCanvasAiOutputSourceRecoveryTick] = useState(0);
  const canvasAiTimedOutRecoveryInFlightRef = useRef(new Set<string>());
  const canvasAiTimedOutRecoverySettledRef = useRef(new Set<string>());
  const [canvasAiTimedOutRecoveryTick, setCanvasAiTimedOutRecoveryTick] = useState(0);
  const generatedImageCachePendingIdsRef = useRef(new Set<string>());
  const generatedImageCachePromisesRef = useRef(new Map<string, Promise<string>>());

  const flushImageThumbnailUpdates = () => { return flushImageThumbnailUpdatesImpl({ applyCanvasImageSourceToElement, canvasImageSourceCacheRef, canvasPreviewSourceIdsRef, imageThumbnailDisposedRef, imageThumbnailPendingUpdatesRef, imageThumbnailUpdateTimerRef, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, setItems, updateCanvasItemsImmediate }); };

  const scheduleImageThumbnailUpdate = (itemId: string, thumbnail: string, existingThumbnail?: string) => {
    if (imageThumbnailDisposedRef.current) return;
    imageThumbnailPendingUpdatesRef.current.set(itemId, { thumbnail, existingThumbnail });
    if (imageThumbnailUpdateTimerRef.current !== null) return;
    imageThumbnailUpdateTimerRef.current = window.setTimeout(
      flushImageThumbnailUpdates,
      IMAGE_THUMBNAIL_UPDATE_BATCH_MS,
    );
  };

  const runNextImageThumbnailJobs = () => { return runNextImageThumbnailJobsImpl({ IMAGE_THUMBNAIL_MAX_CONCURRENCY, imageThumbnailActiveCountRef, imageThumbnailDisposedRef, imageThumbnailInFlightRef, imageThumbnailQueueRef, runNextImageThumbnailJobs, scheduleImageThumbnailUpdate }); };

  const ensureImageThumbnail = (item: BufferItem) => { return ensureImageThumbnailImpl({ IMAGE_THUMBNAIL_QUEUE_LIMIT, generatedImageCachePendingIdsRef, imageThumbnailInFlightRef, imageThumbnailQueueRef, runNextImageThumbnailJobs }, item); };

  useEffect(() => { return runDrawerCoreEffect10({ imageThumbnailDisposedRef, imageThumbnailPendingUpdatesRef, imageThumbnailQueueRef, imageThumbnailUpdateTimerRef }); }, []);

  const videoThumbnailInFlightRef = useRef<Set<string>>(new Set());

  const ensureVideoThumbnail = (item: BufferItem) => { return ensureVideoThumbnailImpl({ setItems, videoThumbnailInFlightRef }, item); };

  const ensureMediaThumbnail = (item: BufferItem) => {
    if (item.type === 'image') ensureImageThumbnail(item);
    if (item.type === 'video') ensureVideoThumbnail(item);
  };

  useEffect(() => { return runDrawerCoreEffect11({ quickAccessItems, setItems, videoThumbnailInFlightRef }); }, [items, quickAccessItems]);

  const thumbnailRecompressInFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => { return runDrawerCoreEffect12({ DATA_THUMBNAIL_RECOMPRESS_MIN_CHARS, items, setItems, thumbnailRecompressInFlightRef }); }, [items]);

  const getCanvasDropPosition = (index = 0, client?: { x: number; y: number }) => { return getCanvasDropPositionImpl({ canvasItemsRef, canvasScaleRef, canvasSurfaceRef }, index, client); };

  const getCanvasPointFromClient = (clientX: number, clientY: number) => { return getCanvasPointFromClientImpl({ canvasScaleRef, canvasSurfaceRef }, clientX, clientY); };

  const normalizeCanvasSelectionBox = (box: { startX: number; startY: number; currentX: number; currentY: number }): CanvasItemBox => { return normalizeCanvasSelectionBoxImpl({}, box); };

  const canvasRectsIntersect = (a: CanvasItemBox, b: CanvasItemBox) => (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );

  const getCanvasItemsBounds = (ids: string[]): CanvasItemBox | null => {
    const selected = canvasItemsRef.current.filter(item => ids.includes(item.id));
    if (selected.length === 0) return null;
    const left = Math.min(...selected.map(item => item.x));
    const top = Math.min(...selected.map(item => item.y));
    const right = Math.max(...selected.map(item => item.x + item.width));
    const bottom = Math.max(...selected.map(item => item.y + item.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
  };

  const getCanvasPrimaryImageItem = (source = canvasItemsRef.current) => {
    const imageItems = source.filter(item => item.item.type === 'image');
    if (imageItems.length === 0) return null;
    return imageItems.reduce((best, item) => (
      (item.item.createdAt || 0) > (best.item.createdAt || 0) ? item : best
    ), imageItems[0]);
  };

  const cancelCanvasImageSourceUpgradeQueue = () => {
    canvasImageUpgradeTokenRef.current += 1;
    canvasImageUpgradeQueueRef.current = [];
    if (canvasImageUpgradeTimerRef.current !== null) {
      window.clearTimeout(canvasImageUpgradeTimerRef.current);
      canvasImageUpgradeTimerRef.current = null;
    }
  };

  const getStableCanvasImageSource = (canvasItem: CanvasImageItem) => { return getStableCanvasImageSourceImpl({ CANVAS_IMAGE_PREVIEW_UPGRADE_ENABLED, canvasImageSourceCacheRef, canvasPreviewSourceIdsRef, canvasSelectedIdsRef }, canvasItem); };

  const applyCanvasImageSourceToElement = (id: string, source: string) => {
    const element = getCanvasItemElement(id)?.querySelector<HTMLImageElement | HTMLVideoElement>('[data-canvas-main-media="true"]');
    if (!element || element.getAttribute('src') === source) return;
    element.setAttribute('src', source);
  };

  const scheduleCanvasSelectionImageSources = (ids: Iterable<string>) => { return scheduleCanvasSelectionImageSourcesImpl({ applyCanvasImageSourceToElement, canvasImageSourceCacheRef, canvasItemsRef, canvasPreviewSourceIdsRef, canvasSelectedIdsRef, canvasSelectionImageSourceFrameRef, canvasSelectionImageSourceIdsRef }, ids); };

  const downgradeCanvasPreviewSources = () => { return downgradeCanvasPreviewSourcesImpl({ applyCanvasImageSourceToElement, canvasImageSourceCacheRef, canvasItemsRef, canvasPreviewSourceIdsRef }); };

  const trimCanvasPreviewSourceCache = (keepIds: Set<string>) => { return trimCanvasPreviewSourceCacheImpl({ applyCanvasImageSourceToElement, canvasImageSourceCacheRef, canvasItemsRef, canvasPreviewSourceIdsRef }, keepIds); };

  const shouldUpgradeCanvasImageSource = (canvasItem: CanvasImageItem, scale = canvasScaleRef.current || 1) => { return shouldUpgradeCanvasImageSourceImpl({ CANVAS_IMAGE_PREVIEW_UPGRADE_ENABLED, CANVAS_IMAGE_SOURCE_UPGRADE_MIN_SCALE, CANVAS_IMAGE_SOURCE_UPGRADE_PIXEL_THRESHOLD, canvasImageSourceCacheRef, canvasImageUpgradeFailedRef }, canvasItem, scale); };

  const runCanvasImageSourceUpgradeQueue = (token: number) => { return runCanvasImageSourceUpgradeQueueImpl({ CANVAS_IMAGE_SOURCE_UPGRADE_CONCURRENCY, CANVAS_IMAGE_SOURCE_UPGRADE_DELAY_MS, applyCanvasImageSourceToElement, canvasImageSourceCacheRef, canvasImageUpgradeFailedRef, canvasImageUpgradeInFlightRef, canvasImageUpgradeQueueRef, canvasImageUpgradeTimerRef, canvasImageUpgradeTokenRef, canvasItemsRef, canvasPanRef, canvasPreviewSourceIdsRef, isCanvasInteractingRef, isCanvasModeRef, isCanvasZoomingRef, runCanvasImageSourceUpgradeQueue, shouldUpgradeCanvasImageSource }, token); };

  const scheduleCanvasVisibleImageSourceUpgrades = () => { return scheduleCanvasVisibleImageSourceUpgradesImpl({ CANVAS_IMAGE_PREVIEW_UPGRADE_ENABLED, CANVAS_IMAGE_SOURCE_DOWNGRADE_SCALE, CANVAS_IMAGE_SOURCE_UPGRADE_BATCH_SIZE, CANVAS_IMAGE_SOURCE_UPGRADE_DELAY_MS, CANVAS_IMAGE_SOURCE_UPGRADE_MAX_ACTIVE_PREVIEWS, cancelCanvasImageSourceUpgradeQueue, canvasHoveredItemIdRef, canvasImageUpgradeQueueRef, canvasImageUpgradeTimerRef, canvasImageUpgradeTokenRef, canvasItemsRef, canvasPanRef, canvasPreviewSourceIdsRef, canvasRectsIntersect, canvasScaleRef, canvasSelectedIdsRef, canvasViewportRef, getCanvasItemRenderedBox, isCanvasInteractingRef, isCanvasModeRef, isCanvasZoomingRef, readCanvasViewportRect, runCanvasImageSourceUpgradeQueue, shouldUpgradeCanvasImageSource, trimCanvasPreviewSourceCache }); };

  const getCanvasAiNodeDesignSizeForItem = (
    canvasItem: CanvasImageItem,
    promptExpanded = canvasAiPromptEditingId === canvasItem.id,
    outputsExpanded = canvasAiExpandedOutputNodeIds.has(canvasItem.id),
  ) => { return getCanvasAiNodeDesignSizeForItemImpl({}, canvasItem, promptExpanded, outputsExpanded); };

  const canvasAiCompactOutputNodeSignature = canvasItems
    .filter(item => (
      (isCanvasAiGeneratorType(item.ai?.type) || item.ai?.type === 'workflow')
      && (item.ai?.outputs?.length || 0) > CANVAS_AI_COLLAPSED_OUTPUT_PREVIEW_LIMIT
    ))
    .map(item => [
      item.id,
      item.ai?.outputs?.length || 0,
      Math.round(item.width),
      Math.round(item.height),
      canvasAiExpandedOutputNodeIds.has(item.id) ? 1 : 0,
    ].join(':'))
    .join('|');

  useEffect(() => { return runCanvasPersistenceEffect01({ canvasAiCompactOutputNodeSignature, canvasAiExpandedOutputNodeIds, canvasAiPromptEditingId, getCanvasAiNodeDesignSizeForItem, isCanvasMode, updateCanvasItemsImmediate }); }, [
    canvasAiCompactOutputNodeSignature,
    canvasAiExpandedOutputNodeIds,
    canvasAiPromptEditingId,
    isCanvasMode,
  ]);
  const makeCanvasItemBoxMap = (ids: string[]) => (
    canvasItemsRef.current
      .filter(item => ids.includes(item.id))
      .reduce<Record<string, CanvasItemBox>>((acc, item) => {
        acc[item.id] = { x: item.x, y: item.y, width: item.width, height: item.height };
        return acc;
      }, {})
  );

  const getCanvasWorkflowGroupItemIdsForSelection = (
    groupId: string,
    sourceItems: CanvasImageItem[] = canvasItemsRef.current
  ) => (
    groupId
      ? sourceItems
        .filter(item => getCanvasWorkflowGroupIdForSelection(item) === groupId)
        .map(item => item.id)
      : []
  );

  const isCanvasWorkflowGroupInSingleEdit = (groupId?: string | null) => (
    !!groupId && canvasWorkflowSingleEditGroupIdsRef.current.has(groupId)
  );

  const expandCanvasSelectionIdsWithGroups = (
    ids: string[],
    sourceItems: CanvasImageItem[] = canvasItemsRef.current
  ) => { return expandCanvasSelectionIdsWithGroupsImpl({ getCanvasWorkflowGroupItemIdsForSelection, isCanvasWorkflowGroupInSingleEdit }, ids, sourceItems); };

  const getCanvasSelectionIdsForItem = (
    id: string,
    sourceItems: CanvasImageItem[] = canvasItemsRef.current
  ) => expandCanvasSelectionIdsWithGroups([id], sourceItems);

  const applyCanvasSelectionDomFeedback = (currentIds: string[], nextIds: string[]) => { return applyCanvasSelectionDomFeedbackImpl({ canvasContentRef, canvasItemsRef, canvasPendingSelectionDomIdsRef, canvasSurfaceRef, getCanvasItemElement }, currentIds, nextIds); };

  const commitCanvasSelection = (unique: string[]) => { return commitCanvasSelectionImpl({ activeThreeSceneIdRef, applyCanvasSelectionDomFeedback, canvasItemsRef, canvasSelectedIdsRef, scheduleCanvasSelectionImageSources, setActiveThreeSceneId, setCanvasSelectedIds, threeSceneHistoryGestureRef }, unique); };

  const setCanvasSelectionWithoutWorkflowExpansion = (ids: string[]) => {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    commitCanvasSelection(unique);
  };

  const updateCanvasSelection = (ids: string[]) => {
    const unique = Array.from(new Set(expandCanvasSelectionIdsWithGroups(ids)));
    commitCanvasSelection(unique);
  };

  const enableCanvasWorkflowSingleEditForItem = (id: string) => { return enableCanvasWorkflowSingleEditForItemImpl({ canvasItemsRef, canvasWorkflowSingleEditGroupIdsRef, setCanvasSelectionWithoutWorkflowExpansion, setCanvasWorkflowSingleEditGroupIds, showToast }, id); };

  const updateCanvasItemsImmediate = (updater: (prev: CanvasImageItem[]) => CanvasImageItem[]) => { return updateCanvasItemsImmediateImpl({ activeCanvasIdRef, canvasDragRef, canvasItemsRef, canvasSessionItemsRef, scheduleCanvasInteractionPaint, setCanvasItems }, updater); };

  const updateCanvasItemsDeferred = (updater: (prev: CanvasImageItem[]) => CanvasImageItem[]) => { return updateCanvasItemsDeferredImpl({ activeCanvasIdRef, canvasItemsRef, canvasSessionItemsRef, setCanvasItems }, updater); };

  const getCanvasSessionItems = (canvasId: string) => {
    const normalizedCanvasId = canvasId || DEFAULT_CANVAS_ID;
    if (normalizedCanvasId === activeCanvasIdRef.current && !isSwitchingCanvasRef.current) {
      return canvasItemsRef.current;
    }
    return canvasSessionItemsRef.current.get(normalizedCanvasId) || [];
  };

  const setCanvasSessionItems = (canvasId: string, nextItems: CanvasImageItem[]) => {
    const normalizedCanvasId = canvasId || DEFAULT_CANVAS_ID;
    canvasSessionItemsRef.current.set(normalizedCanvasId, nextItems);
    if (normalizedCanvasId !== activeCanvasIdRef.current || isSwitchingCanvasRef.current) return;
    canvasItemsRef.current = nextItems;
    setCanvasItems(nextItems);
  };

  const getActiveCanvasRunNodeIds = (canvasId: string) => {
    const activeNodeCounts = canvasActiveRunNodeIdsRef.current.get(canvasId || DEFAULT_CANVAS_ID);
    return activeNodeCounts ? new Set(activeNodeCounts.keys()) : undefined;
  };

  const markCanvasRunNodeActive = (canvasId: string, nodeId: string) => {
    const normalizedCanvasId = canvasId || DEFAULT_CANVAS_ID;
    const activeNodeCounts = canvasActiveRunNodeIdsRef.current.get(normalizedCanvasId) || new Map<string, number>();
    activeNodeCounts.set(nodeId, (activeNodeCounts.get(nodeId) || 0) + 1);
    canvasActiveRunNodeIdsRef.current.set(normalizedCanvasId, activeNodeCounts);
  };

  const markCanvasRunNodeSettled = (canvasId: string, nodeId: string) => {
    const normalizedCanvasId = canvasId || DEFAULT_CANVAS_ID;
    const activeNodeCounts = canvasActiveRunNodeIdsRef.current.get(normalizedCanvasId);
    if (!activeNodeCounts) return;
    const nextCount = (activeNodeCounts.get(nodeId) || 0) - 1;
    if (nextCount > 0) activeNodeCounts.set(nodeId, nextCount);
    else activeNodeCounts.delete(nodeId);
    if (activeNodeCounts.size === 0) canvasActiveRunNodeIdsRef.current.delete(normalizedCanvasId);
  };

  const waitForCanvasBackgroundPatches = async (canvasId: string) => {
    const pending = canvasBackgroundPatchChainsRef.current.get(canvasId || DEFAULT_CANVAS_ID);
    if (!pending) return;
    try {
      await pending;
    } catch {
      // The write already logs its own error. Loading the latest durable snapshot can continue.
    }
  };

  const enqueueCanvasBackgroundWrite = (
    canvasId: string,
    write: () => Promise<void>,
  ) => { return enqueueCanvasBackgroundWriteImpl({ canvasBackgroundPatchChainsRef }, canvasId, write); };

  const enqueueCanvasBackgroundNodePatch = (canvasId: string, node: CanvasImageItem) => {
    const normalizedCanvasId = canvasId || DEFAULT_CANVAS_ID;
    const persistedNode = stripCanvasItemDataImageProvenance(node);
    return enqueueCanvasBackgroundWrite(normalizedCanvasId, async () => {
      await patchCanvasNodes(normalizedCanvasId, [persistedNode]);
    });
  };

  const getCanvasItemElement = (id: string) => {
    const content = canvasContentRef.current;
    if (!content) return null;
    const selectorId = typeof CSS !== 'undefined' && CSS.escape
      ? CSS.escape(id)
      : id.replace(/["\\]/g, '\\$&');
    return content.querySelector<HTMLElement>(`[data-canvas-item-id="${selectorId}"]`);
  };

  const paintCanvasDragChrome = (ids: string[], dx: number, dy: number) => { return paintCanvasDragChromeImpl({ CANVAS_CONNECTION_HANDLE_OUTSET, canvasContentRef, canvasDragRef, canvasItemsById, getCanvasItemRenderedBox }, ids, dx, dy); };

  const syncCanvasSelectionFrameStyles = () => { return syncCanvasSelectionFrameStylesImpl({ canvasContentRef, canvasItemsRef, canvasSelectedIdsRef, getCanvasItemRenderedBox }); };

  const resetCanvasDragChrome = () => { return resetCanvasDragChromeImpl({ CANVAS_CONNECTION_HANDLE_OUTSET, canvasContentRef, canvasItemsRef, getCanvasItemRenderedBox, syncCanvasSelectionFrameStyles }); };

  const refreshCanvasConnectionHandleOcclusion = (options: {
    renderedItems?: CanvasImageItem[];
    affectedItemIds?: ReadonlySet<string>;
  } = {}) => { return refreshCanvasConnectionHandleOcclusionImpl({ CANVAS_CONNECTION_HANDLE_OUTSET, canvasContentRef, canvasItemsRef, canvasSelectedIdsRef, getCanvasItemRenderedBox }, options); };

  const setCanvasItemDraggingFlag = (ids: string[], active: boolean) => { return setCanvasItemDraggingFlagImpl({ canvasContentRef, getCanvasItemElement }, ids, active); };

  const setCanvasItemResizingFlag = (ids: string[], active: boolean) => {
    ids.forEach((id) => {
      const element = getCanvasItemElement(id);
      if (!element) return;
      if (active) element.setAttribute('data-canvas-resizing', 'true');
      else element.removeAttribute('data-canvas-resizing');
    });
  };

  const clearCanvasItemInteractionStyles = (ids: string[], refreshOcclusion = true) => { return clearCanvasItemInteractionStylesImpl({ canvasItemsRef, canvasPendingSelectionDomIdsRef, canvasSurfaceRef, getCanvasItemElement, refreshCanvasConnectionHandleOcclusion, resetCanvasDragChrome }, ids, refreshOcclusion); };

  const restoreCanvasItemBoxStyles = (ids: string[]) => { return restoreCanvasItemBoxStylesImpl({ canvasItemsRef, getCanvasItemElement }, ids); };

  const cancelCanvasItemDragVisuals = () => { return cancelCanvasItemDragVisualsImpl({ cancelCanvasInteractionPaint, canvasDragDebugRef, canvasDragRef, canvasGroupResizeRef, canvasPointerInteractionCleanupRef, canvasResizeRef, clearCanvasItemInteractionStyles, restoreCanvasItemBoxStyles }); };

  const hideCanvasSelectionOverlay = () => { return hideCanvasSelectionOverlayImpl({ canvasSelectionOverlayRef }); };

  const flushCanvasInteractionFrame = () => { return flushCanvasInteractionFrameImpl({ canvasInteractionFrameRef, canvasInteractionPayloadRef, canvasSelectionOverlayRef, getCanvasItemElement, paintCanvasDragChrome }); };

  const scheduleCanvasInteractionPaint = (payload: NonNullable<typeof canvasInteractionPayloadRef.current>) => {
    canvasInteractionPayloadRef.current = payload;
    if (canvasInteractionFrameRef.current !== null) return;
    canvasInteractionFrameRef.current = window.requestAnimationFrame(flushCanvasInteractionFrame);
  };

  const cancelCanvasInteractionPaint = () => {
    if (canvasInteractionFrameRef.current !== null) {
      window.cancelAnimationFrame(canvasInteractionFrameRef.current);
      canvasInteractionFrameRef.current = null;
    }
    canvasInteractionPayloadRef.current = null;
  };

  const scheduleCanvasChangedNodesPatchSave = (ids: string[]) => { return scheduleCanvasChangedNodesPatchSaveImpl({ activeCanvasIdRef, canvasItemsRef, canvasPanRef, canvasPatchSavePendingIdsRef, canvasPatchSaveTimerRef, canvasStateLoadedRef, isCanvasInteractingRef, isCanvasZoomingRef, scheduleCanvasChangedNodesPatchSave }, ids); };

  const markCanvasNodesChanged = (ids: string[]) => {
    ids.filter(Boolean).forEach(id => canvasInteractionChangedNodeIdsRef.current.add(id));
  };

  const flushCanvasChangedNodePatches = () => {
    const changedIds = Array.from(canvasInteractionChangedNodeIdsRef.current);
    canvasInteractionChangedNodeIdsRef.current.clear();
    scheduleCanvasChangedNodesPatchSave(changedIds);
  };

  const buildCanvasPersistedState = (): CanvasPersistedState => ({
    items: canvasItemsRef.current.map(stripCanvasItemDataImageProvenance),
    size: cloneDrawerValue(canvasSizeRef.current),
    scale: clamp(canvasScaleRef.current || 1, CANVAS_MIN_SCALE, CANVAS_MAX_SCALE),
    scroll: cloneDrawerValue(
      canvasSurfaceRef.current
        ? {
          left: canvasSurfaceRef.current.scrollLeft,
          top: canvasSurfaceRef.current.scrollTop,
        }
        : canvasScrollLockRef.current ||
      canvasReturnScrollRef.current ||
      {
        left: 0,
        top: 0,
      }
    ),
    updatedAt: Date.now(),
  });

  const getCanvasNodesPersistSignature = (items: CanvasImageItem[]) => JSON.stringify(items);

  const saveCanvasStateNow = (options: { syncNodes?: boolean } = {}) => { return saveCanvasStateNowImpl({ activeCanvasIdRef, buildCanvasPersistedState, canvasLastSyncedNodesSignatureRef, canvasPanRef, canvasPersistSaveSyncNodesRef, canvasStateLoadedRef, canvasStateSaveDeferredDuringZoomRef, getCanvasNodesPersistSignature, isCanvasInteractingRef, isCanvasZoomingRef }, options); };

  const scheduleCanvasStateSave = (options: { syncNodes?: boolean } = {}) => { return scheduleCanvasStateSaveImpl({ CANVAS_STATE_SAVE_DEBOUNCE_MS, canvasPanRef, canvasPersistSaveSyncNodesRef, canvasPersistSaveTimerRef, canvasStateLoadedRef, canvasStateSaveDeferredDuringZoomRef, isCanvasInteractingRef, isCanvasZoomingRef, saveCanvasStateNow }, options); };

  const refreshCanvases = async () => { return refreshCanvasesImpl({ activeCanvasIdRef, isSwitchingCanvasRef, setActiveCanvasId, setCanvasTrashCount, setCanvases, sortCanvasesNewestFirst }); };

  const refreshDeletedCanvases = async () => {
    const deletedList = await listDeletedCanvases(DEFAULT_PROJECT_ID, DEFAULT_LIBRARY_ID);
    setDeletedCanvases(deletedList);
    setCanvasTrashCount(deletedList.length);
    return deletedList;
  };

  const openCanvasTrash = async () => { return openCanvasTrashImpl({ refreshDeletedCanvases, setCanvasActionMenuId, setIsCanvasTrashOpen, setIsLoadingCanvasTrash, showToast }); };

  const loadCanvasItems = async (canvasId: string, options: { knownEmpty?: boolean } = {}) => { return loadCanvasItemsImpl({ applyCanvasScaleStyles, cancelCanvasImageSourceUpgradeQueue, canvasImageSourceCacheRef, canvasImageUpgradeFailedRef, canvasItemsRef, canvasLastSyncedNodesSignatureRef, canvasPreviewSourceIdsRef, canvasScaleRef, canvasSelectionImageSourceFrameRef, canvasSelectionImageSourceIdsRef, canvasSessionItemsRef, canvasSizeRef, canvasViewportRef, clearCanvasUndoStack, getActiveCanvasRunNodeIds, getCanvasNodesPersistSignature, hideCanvasSelectionOverlay, isCanvasModeRef, pendingCanvasFusionRoleRef, scheduleCanvasFocusNearestContentIfViewportEmpty, setCanvasConnectionDraft, setCanvasContextMenu, setCanvasInputActionDraft, setCanvasInputMenuForId, setCanvasInputPickTargetId, setCanvasItems, setCanvasSize, setCanvasViewport, updateCanvasSelection, waitForCanvasBackgroundPatches }, canvasId, options); };

  const saveCurrentCanvasBeforeSwitch = async () => { return saveCurrentCanvasBeforeSwitchImpl({ activeCanvasIdRef, buildCanvasPersistedState, canvasInteractionChangedNodeIdsRef, canvasLastSyncedNodesSignatureRef, canvasPatchSavePendingIdsRef, canvasPatchSaveTimerRef, canvasPersistSaveTimerRef, canvasSessionItemsRef, enqueueCanvasBackgroundWrite, getCanvasNodesPersistSignature, waitForCanvasBackgroundPatches }); };

  const makeCanvasNodeId = (seed: string, kind = 'node') => {
    const scope = activeCanvasIdRef.current || DEFAULT_CANVAS_ID;
    return `canvas_${kind}_${scope}_${seed}_${Math.random().toString(36).slice(2, 7)}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  };

  const switchToCanvas = async (canvasId: string) => { return switchToCanvasImpl({ activeCanvasIdRef, enterCanvasMode, isCanvasModeRef, isSwitchingCanvasRef, loadCanvasItems, saveCurrentCanvasBeforeSwitch, setActiveCanvasId, setCanvasActionMenuId, setCanvases, setIsSwitchingCanvas, showToast, sortCanvasesNewestFirst }, canvasId); };

  const createNewCanvasPage = async () => { return createNewCanvasPageImpl({ activeCanvasIdRef, canvases, enterCanvasMode, isCanvasModeRef, isSwitchingCanvasRef, loadCanvasItems, openTextInputDialog, saveCurrentCanvasBeforeSwitch, setActiveCanvasId, setCanvasActionMenuId, setCanvases, setIsSwitchingCanvas, showToast, sortCanvasesNewestFirst }); };

  const renameCanvasPage = async (canvas: CanvasRecord) => { return renameCanvasPageImpl({ openTextInputDialog, setCanvases, showToast }, canvas); };

  const duplicateCanvasPage = async (canvas: CanvasRecord) => { return duplicateCanvasPageImpl({ openTextInputDialog, refreshCanvases, saveCurrentCanvasBeforeSwitch, showToast }, canvas); };

  const saveCurrentCanvasAsSnapshot = async (canvas: CanvasRecord, switchAfterSave = false) => { return saveCurrentCanvasAsSnapshotImpl({ openTextInputDialog, refreshCanvases, saveCurrentCanvasBeforeSwitch, showToast, switchToCanvas }, canvas, switchAfterSave); };

  const moveCanvasPageToTrash = async (canvas: CanvasRecord) => { return moveCanvasPageToTrashImpl({ activeCanvasIdRef, isCanvasTrashOpen, loadCanvasItems, refreshCanvases, refreshDeletedCanvases, saveCurrentCanvasBeforeSwitch, setActiveCanvasId }, canvas); };

  const saveCanvasPageElementsToDrawer = async (canvas: CanvasRecord) => { return saveCanvasPageElementsToDrawerImpl({ activeCanvasIdRef, canvasItemsRef, copyCanvasItemsToDrawerFolder, getActiveCanvasRunNodeIds, saveCurrentCanvasBeforeSwitch, waitForCanvasBackgroundPatches }, canvas); };

  const confirmSoftDeleteCanvasPage = (canvas: CanvasRecord) => { return confirmSoftDeleteCanvasPageImpl({ activeCanvasIdRef, canvasItemsRef, closeConfirmDialog, moveCanvasPageToTrash, saveCanvasPageElementsToDrawer, setCanvasActionMenuId, setConfirmDialog, showToast }, canvas); };

  const restoreDeletedCanvasPage = async (canvas: CanvasRecord) => { return restoreDeletedCanvasPageImpl({ refreshCanvases, refreshDeletedCanvases, showToast }, canvas); };

  const confirmPermanentlyDeleteCanvasPage = (canvas: CanvasRecord) => { return confirmPermanentlyDeleteCanvasPageImpl({ closeConfirmDialog, refreshDeletedCanvases, setConfirmDialog, showToast }, canvas); };

  const handleCanvasListOpen = useEventCallback((canvasId: string) => {
    void switchToCanvas(canvasId);
  });
  const handleCanvasMenuOpen = useEventCallback((canvasId: string) => {
    setCanvasActionMenuId(canvasId);
  });
  const handleCanvasMenuToggle = useEventCallback((canvasId: string) => {
    setCanvasActionMenuId(prev => prev === canvasId ? null : canvasId);
  });
  const handleCanvasListDelete = useEventCallback((canvas: CanvasRecord) => {
    confirmSoftDeleteCanvasPage(canvas);
  });
  const handleRestoreDeletedCanvas = useEventCallback((canvas: CanvasRecord) => {
    void restoreDeletedCanvasPage(canvas);
  });
  const handlePermanentlyDeleteCanvas = useEventCallback((canvas: CanvasRecord) => {
    confirmPermanentlyDeleteCanvasPage(canvas);
  });

  function applyCanvasScaleStyles(
    scale = canvasScaleRef.current || 1,
    size = canvasSizeRef.current,
    options: { updateViewport?: boolean } = {}
  ) {
    const visualViewport = isCanvasZoomingRef.current ? canvasVisualViewportRef.current : null;
    const sizer = canvasSizerRef.current;
    const shouldUpdateSizer = !isCanvasZoomingRef.current || options.updateViewport !== false;
    if (sizer && shouldUpdateSizer) {
      sizer.style.width = `${size.width * scale}px`;
      sizer.style.height = `${size.height * scale}px`;
    }

    const content = canvasContentRef.current;
    if (content) {
      if (!isCanvasZoomingRef.current || options.updateViewport !== false) {
        content.style.width = `${size.width}px`;
        content.style.height = `${size.height}px`;
      }
      if (visualViewport && canvasSurfaceRef.current) {
        const translateX = canvasSurfaceRef.current.scrollLeft - visualViewport.x * scale;
        const translateY = canvasSurfaceRef.current.scrollTop - visualViewport.y * scale;
        content.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`;
      } else {
        content.style.transform = `scale(${scale})`;
      }
    }
    if (options.updateViewport !== false) scheduleCanvasViewportUpdate();
  }

  function readCanvasViewportRect(surface = canvasSurfaceRef.current): CanvasViewportRect | null {
    if (!surface) return null;
    const scale = clamp(canvasScaleRef.current || 1, CANVAS_MIN_SCALE, CANVAS_MAX_SCALE);
    const chatOccludedWidth = isAgentChatOpenRef.current
      ? Math.min(Math.max(0, surface.clientWidth - 1), canvasAgentSidebarWidthRef.current)
      : 0;
    return {
      x: surface.scrollLeft / scale,
      y: surface.scrollTop / scale,
      width: Math.max(1, surface.clientWidth - chatOccludedWidth) / scale,
      height: surface.clientHeight / scale,
    };
  }

  function updateCanvasViewportNow() {
    canvasViewportFrameRef.current = null;
    if (!isCanvasModeRef.current) return;
    const next = readCanvasViewportRect();
    const current = canvasViewportRef.current;
    const isSame = current && next
      && Math.abs(current.x - next.x) < 2
      && Math.abs(current.y - next.y) < 2
      && Math.abs(current.width - next.width) < 2
      && Math.abs(current.height - next.height) < 2;
    if (isSame) return;
    canvasViewportRef.current = next;
    setCanvasViewport(next);
    scheduleCanvasVisibleImageSourceUpgrades();
  }

  function scheduleCanvasViewportUpdate() {
    if (!isCanvasModeRef.current || canvasViewportFrameRef.current !== null) return;
    if (isCanvasInteractingRef.current || isCanvasZoomingRef.current || canvasPanRef.current) {
      canvasViewportDeferredDuringZoomRef.current = true;
      return;
    }
    canvasViewportFrameRef.current = window.requestAnimationFrame(updateCanvasViewportNow);
  }

  const beginCanvasZoomInteraction = () => { return beginCanvasZoomInteractionImpl({ cancelCanvasImageSourceUpgradeQueue, canvasContentRef, canvasSurfaceRef, canvasViewportDeferredDuringZoomRef, canvasViewportFrameRef, downgradeCanvasPreviewSources, isCanvasZoomingRef }); };

  const scheduleCanvasScaleRenderSync = () => { return scheduleCanvasScaleRenderSyncImpl({ canvasScaleRef, canvasScaleRenderFrameRef, setCanvasScale }); };

  const finishCanvasZoomInteraction = () => { return finishCanvasZoomInteractionImpl({ applyCanvasScaleStyles, canvasContentRef, canvasPersistSaveSyncNodesRef, canvasScaleRef, canvasScrollLockRef, canvasSizeCommitDeferredRef, canvasSizeRef, canvasStateSaveDeferredDuringZoomRef, canvasSurfaceRef, canvasViewportDeferredDuringZoomRef, canvasVisualViewportRef, canvasZoomSettleTimerRef, isCanvasZoomingRef, scheduleCanvasScaleRenderSync, scheduleCanvasStateSave, scheduleCanvasViewportUpdate, scheduleCanvasVisibleImageSourceUpgrades, setCanvasSize, writeCanvasSurfaceScroll }); };

  const settleCanvasZoomBeforePointerInteraction = () => { return settleCanvasZoomBeforePointerInteractionImpl({ canvasScaleCommitTimerRef, canvasZoomSettleTimerRef, finishCanvasZoomInteraction, isCanvasZoomingRef }); };

  const commitCanvasScaleSoon = () => { return commitCanvasScaleSoonImpl({ beginCanvasZoomInteraction, canvasScaleCommitTimerRef, canvasZoomSettleTimerRef, finishCanvasZoomInteraction }); };

  const setCanvasSizeImmediate = (nextSize: { width: number; height: number }) => { return setCanvasSizeImmediateImpl({ applyCanvasScaleStyles, canvasPanRef, canvasScaleRef, canvasSizeCommitDeferredRef, canvasSizeRef, isCanvasInteractingRef, isCanvasZoomingRef, setCanvasSize }, nextSize); };

  const growCanvasToFit = (right: number, bottom: number) => {
    const current = canvasSizeRef.current;
    const targetWidth = Math.max(current.width, Math.ceil((right + CANVAS_GROW_CHUNK * 0.45) / CANVAS_GROW_CHUNK) * CANVAS_GROW_CHUNK);
    const targetHeight = Math.max(current.height, Math.ceil((bottom + CANVAS_GROW_CHUNK * 0.45) / CANVAS_GROW_CHUNK) * CANVAS_GROW_CHUNK);
    if (targetWidth !== current.width || targetHeight !== current.height) {
      setCanvasSizeImmediate({ width: targetWidth, height: targetHeight });
    }
  };

  const clearCanvasUndoStack = () => {
    canvasUndoStackRef.current = [];
    canvasUndoRestoringRef.current = false;
  };

  const takeCanvasUndoSnapshot = (
    label: string,
    options: { layoutOnly?: boolean; shareImmutableItems?: boolean } = {},
  ): CanvasUndoSnapshot => { return takeCanvasUndoSnapshotImpl({ canvasItemsRef, canvasReturnScrollRef, canvasScrollLockRef, canvasSelectedIdsRef, canvasSizeRef, canvasSurfaceRef }, label, options); };

  const pushCanvasUndoSnapshot = (
    label: string,
    options: { layoutOnly?: boolean; shareImmutableItems?: boolean } = {},
  ) => { return pushCanvasUndoSnapshotImpl({ CANVAS_UNDO_LIMIT, canvasUndoRestoringRef, canvasUndoStackRef, isCanvasModeRef, takeCanvasUndoSnapshot }, label, options); };

  const restoreCanvasUndoSnapshot = (snapshot: CanvasUndoSnapshot) => { return restoreCanvasUndoSnapshotImpl({ canvasReturnScrollRef, canvasScaleRef, canvasScrollLockRef, canvasSurfaceRef, canvasUndoRestoringRef, clampCanvasSurfaceScroll, hideCanvasSelectionOverlay, isCanvasModeRef, setCanvasSizeImmediate, updateCanvasItemsImmediate, updateCanvasSelection, writeCanvasSurfaceScroll }, snapshot); };

  const undoLastCanvasChange = () => {
    const snapshot = canvasUndoStackRef.current.pop();
    if (!snapshot) return false;
    restoreCanvasUndoSnapshot(snapshot);
    showToast(`已撤回：${snapshot.label}`);
    return true;
  };

  const appendCanvasItems = (nextItems: CanvasImageItem[], label: string, select = true, options: { focusSelection?: boolean } = {}) => { return appendCanvasItemsImpl({ canvasImageSourceCacheRef, canvasItemsPatchCommitRef, growCanvasToFit, isCanvasModeRef, pushCanvasUndoSnapshot, scheduleCanvasChangedNodesPatchSave, scheduleCanvasFocusItemById, updateCanvasItemsDeferred, updateCanvasSelection }, nextItems, label, select, options); };

  const appendCanvasItemsForPaste = (nextItems: CanvasImageItem[], label: string, select = true, options: { focusSelection?: boolean } = {}) => {
    return runCanvasPasteWithViewportPreserved(
      canvasSurfaceRef,
      writeCanvasSurfaceScroll,
      () => appendCanvasItems(nextItems, label, select, options),
    );
  };

  // Inspiration Space closes its modal immediately after a successful add.
  // Commit those imported nodes at normal priority so that closing the modal
  // cannot overtake the canvas render while still reusing the normal append,
  // selection, persistence, and focus behavior.
  const appendCanvasItemsSynchronously = (nextItems: CanvasImageItem[], label: string, select = true) => { return appendCanvasItemsImpl({ canvasImageSourceCacheRef, canvasItemsPatchCommitRef, growCanvasToFit, isCanvasModeRef, pushCanvasUndoSnapshot, scheduleCanvasChangedNodesPatchSave, scheduleCanvasFocusItemById, updateCanvasItemsDeferred: updateCanvasItemsImmediate, updateCanvasSelection }, nextItems, label, select); };

  const getCanvasAiOutputCopyPosition = (
    sourceItem: CanvasImageItem,
    size: { width: number; height: number },
    outputIndex: number
  ) => { return getCanvasAiOutputCopyPositionImpl({ canvasItemsRef, canvasRectsIntersect }, sourceItem, size, outputIndex); };

  const copyCanvasAiOutputToCanvas = async (
    sourceCanvasItem: CanvasImageItem,
    output: CanvasAiGeneratedOutput,
    outputIndex: number
  ) => { return copyCanvasAiOutputToCanvasImpl({ appendCanvasItems, createAssetId, getCanvasAiOutputCopyPosition, makeCanvasNodeId, showToast }, sourceCanvasItem, output, outputIndex); };

  const setThreeSceneAnalyzing = (id: string, analyzing: boolean) => {
    const next = new Set(threeSceneAnalyzingIdsRef.current);
    if (analyzing) next.add(id);
    else next.delete(id);
    threeSceneAnalyzingIdsRef.current = next;
    setThreeSceneAnalyzingIds(Array.from(next));
  };

  const activateThreeSceneInteraction = (nodeId: string) => {
    activeThreeSceneIdRef.current = nodeId;
    setActiveThreeSceneId(nodeId);
    updateCanvasSelection([nodeId]);
  };

  const exitThreeSceneInteraction = () => {
    activeThreeSceneIdRef.current = null;
    threeSceneHistoryGestureRef.current = null;
    setActiveThreeSceneId(null);
  };

  const beginThreeSceneInteraction = (nodeId: string, label: string) => {
    if (threeSceneHistoryGestureRef.current === nodeId) return;
    threeSceneHistoryGestureRef.current = nodeId;
    pushCanvasUndoSnapshot(label, { shareImmutableItems: true });
  };

  const endThreeSceneInteraction = (nodeId: string) => {
    if (threeSceneHistoryGestureRef.current === nodeId) {
      threeSceneHistoryGestureRef.current = null;
    }
  };

  const updateThreeSceneSpec = (
    nodeId: string,
    sceneSpec: SceneSpecV1,
    options: {
      resetAnalysisCamera?: boolean;
      sourceImageIds?: string[];
      sourceImagePaths?: string[];
      sceneAnalysis?: SceneAnalysisV1;
    } = {},
  ) => { return updateThreeSceneSpecImpl({ canvasItemsPatchCommitRef, markCanvasNodesChanged, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, updateCanvasItemsImmediate }, nodeId, sceneSpec, options); };

  const updateThreeScenePreview = (nodeId: string, preview: string) => { return updateThreeScenePreviewImpl({ markCanvasNodesChanged, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, updateCanvasItemsImmediate }, nodeId, preview); };

  const updateThreeSceneReferenceOverlay = (
    nodeId: string,
    patch: Partial<{ visible: boolean; opacity: number; guides: boolean }>,
  ) => { return updateThreeSceneReferenceOverlayImpl({ canvasItemsPatchCommitRef, markCanvasNodesChanged, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, updateCanvasItemsImmediate }, nodeId, patch); };

  const setThreeSceneRunState = (
    nodeId: string,
    status: 'idle' | 'working' | 'success' | 'error',
    error?: string,
  ) => { return setThreeSceneRunStateImpl({ canvasItemsPatchCommitRef, markCanvasNodesChanged, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, updateCanvasItemsImmediate }, nodeId, status, error); };

  const getThreeSceneAnalysisImages = (node: CanvasImageItem) => { return getThreeSceneAnalysisImagesImpl({ canvasItemsRef, getCanvasImageInputBufferItemsForNode }, node); };

  const analyzeCanvasThreeSceneNode = async (nodeId: string) => { return analyzeCanvasThreeSceneNodeImpl({ activateThreeSceneInteraction, agentModelRef, canvasItemsRef, getThreeSceneAnalysisImages, pushCanvasUndoSnapshot, setThreeSceneAnalyzing, setThreeSceneRunState, showToast, threeSceneAnalyzingIdsRef, updateThreeSceneSpec }, nodeId); };

  const addCanvasThreeSceneGeneratorNode = (
    client?: { x: number; y: number },
    requestedSourceIds?: string[],
  ) => { return addCanvasThreeSceneGeneratorNodeImpl({ appendCanvasItems, canvasItemsRef, canvasSelectedIdsRef, createAssetId, getCanvasDropPosition, getCanvasItemsBounds, makeCanvasNodeId, showToast, updateCanvasSelection }, client, requestedSourceIds); };

  const captureThreeSceneView = async (nodeId: string, dataUrl: string) => { return captureThreeSceneViewImpl({ appendCanvasItems, canvasItemsRef, createAssetId, getCanvasAiOutputCopyPosition, makeCanvasNodeId, showToast }, nodeId, dataUrl); };

  const removeCanvasItemsByIds = (ids: string[], label = '从画布移除节点') => { return removeCanvasItemsByIdsImpl({ activeThreeSceneIdRef, canvasContentRef, canvasImageSourceCacheRef, canvasImageUpgradeFailedRef, canvasImageUpgradeInFlightRef, canvasImageUpgradeQueueRef, canvasItemsRef, canvasPreviewSourceIdsRef, canvasSelectedIdsRef, exitThreeSceneInteraction, getCanvasItemElement, isCanvasModeRef, pushCanvasUndoSnapshot, showToast, updateCanvasItemsDeferred, updateCanvasSelection }, ids, label); };

  const getCanvasBoundsFromItems = (sourceItems: CanvasImageItem[]): CanvasItemBox | null => {
    if (sourceItems.length === 0) return null;
    const left = Math.min(...sourceItems.map(item => item.x));
    const top = Math.min(...sourceItems.map(item => item.y));
    const right = Math.max(...sourceItems.map(item => item.x + item.width));
    const bottom = Math.max(...sourceItems.map(item => item.y + item.height));
    return { x: left, y: top, width: right - left, height: bottom - top };
  };

  const organizeCanvasItems = (ids?: string[]) => { return organizeCanvasItemsImpl({ canvasItemsRef, canvasSelectedIdsRef, fitCanvasViewToItems, getCanvasBoundsFromItems, growCanvasToFit, hideCanvasSelectionOverlay, isCanvasModeRef, pushCanvasUndoSnapshot, showToast, updateCanvasItemsImmediate, updateCanvasSelection }, ids); };

  const openInspirationSpace = () => {
    setIsInspirationSpaceOpen(true);
  };

  const prepareInspirationSpaceTemplate = useEventCallback(async (
    kind: InspirationSpaceTemplateKind,
    templateId: string,
  ): Promise<InspirationSpacePreparedTemplate> => {
    if (kind === 'NODE_PRESET') {
      const preset = canvasAiPromptPresets.find(item => item.id === templateId);
      if (!preset) throw new Error('所选节点预设已经不存在，请刷新后重试');
      return {
        label: preset.label,
        kind,
        payload: {
          type: CANVAS_TEMPLATE_EXPORT_TYPE,
          version: CANVAS_TEMPLATE_EXPORT_VERSION,
          exportedAt: new Date().toISOString(),
          presets: [{ ...preset }],
          workflows: [],
        },
      };
    }
    const workflowId = templateId;
    const workflow = canvasWorkflowTemplates.find(item => item.id === workflowId);
    if (!workflow) throw new Error('所选工作流已经不存在，请刷新后重试');
    const [portableWorkflow] = await embedCanvasWorkflowFixedImages(
      [{ ...workflow, builtin: false }],
      source => imageSourceToDataUrl(source, false),
    );
    if (!portableWorkflow) throw new Error('工作流便携数据生成失败');
    return {
      label: workflow.label,
      kind,
      payload: {
        type: CANVAS_TEMPLATE_EXPORT_TYPE,
        version: CANVAS_TEMPLATE_EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        presets: [],
        workflows: [portableWorkflow],
      },
    };
  });

  const loadInspirationSpaceDrawerImages = useEventCallback(async (): Promise<InspirationSpaceDrawerImageOption[]> => {
    let storedImages: BufferItem[] = [];
    if (assetStorageMode === 'sqlite') {
      try {
        storedImages = await listAssets({
          folder_id: 'all',
          file_type: 'image',
          sort: 'created_at_desc',
          offset: 0,
          limit: 120,
        });
      } catch (error) {
        console.warn('灵感空间读取抽屉图片失败，改用当前素材缓存:', error);
      }
    }
    const uniqueDrawerImages = new Map<string, BufferItem>();
    [...storedImages, ...itemsRef.current]
      .filter(item => item.type === 'image')
      .sort((a, b) => (
        Math.max(Number(b.importedAt || 0), Number(b.createdAt || 0))
        - Math.max(Number(a.importedAt || 0), Number(a.createdAt || 0))
      ))
      .forEach(item => {
        if (!uniqueDrawerImages.has(item.id)) uniqueDrawerImages.set(item.id, item);
      });

    const currentCanvasGeneratedImages = canvasItemsRef.current.flatMap(canvasItem => (
      getCanvasAiSuccessfulOutputs(canvasItem).flatMap((output, index) => {
        const image = createCanvasAiOutputBufferItem(canvasItem, output, index);
        return image?.type === 'image' ? [image] : [];
      })
    ));
    const generatedFolderIds = getAiGeneratedImageFolderIds(foldersRef.current);
    const isGeneratedImage = (item: BufferItem) => (
      generatedFolderIds.has(item.folderId || '')
      || /^canvas_ai_output_/i.test(item.id)
      || /^canvas_realesrgan_.*_output_/i.test(item.id)
      || /^AI\s*生图(?:\s|[-·:：]|$)/i.test(item.name || item.content || '')
      || /^AI generated(?:\s|[-·:：]|$)/i.test(item.name || item.content || '')
    );
    const drawerImages = [...uniqueDrawerImages.values()];
    const candidates = [
      ...currentCanvasGeneratedImages.map(item => ({ item, origin: 'GENERATED' as const })),
      ...drawerImages.filter(isGeneratedImage).map(item => ({ item, origin: 'GENERATED' as const })),
      ...drawerImages.filter(item => !isGeneratedImage(item)).map(item => ({ item, origin: 'DRAWER' as const })),
    ];
    const uniqueRecentImages = new Map<string, InspirationSpaceDrawerImageOption>();
    candidates.forEach(({ item, origin }) => {
      const source = item.path
        ? convertFileSrc(item.path)
        : item.url || item.sourceUrl || item.originalUrl || item.thumbnail || '';
      const preview = item.thumbnail || source;
      if (!source || !preview) return;
      const key = `${origin}:${item.id || item.path || source}`;
      if (uniqueRecentImages.has(key)) return;
      uniqueRecentImages.set(key, {
        id: item.id,
        name: String(item.name || item.content || '抽屉图片').slice(0, 120),
        source,
        preview,
        origin,
        createdAt: Math.max(Number(item.importedAt || 0), Number(item.createdAt || 0)),
        width: item.width,
        height: item.height,
      });
    });
    const recentImages = [...uniqueRecentImages.values()]
      .sort((a, b) => b.createdAt - a.createdAt);
    const recentGenerated = recentImages.filter(image => image.origin === 'GENERATED').slice(0, 60);
    const recentDrawer = recentImages.filter(image => image.origin === 'DRAWER').slice(0, 60);
    return [...recentGenerated, ...recentDrawer].sort((a, b) => b.createdAt - a.createdAt);
  });

  const readInspirationSpaceDrawerImage = useEventCallback(async (
    image: InspirationSpaceDrawerImageOption,
  ): Promise<string> => {
    const candidates = Array.from(new Set([image.source, image.preview].filter(Boolean)));
    let lastError: unknown;
    for (const candidate of candidates) {
      try {
        if (/^blob:/i.test(candidate)) {
          const response = await fetch(candidate);
          if (!response.ok) throw new Error('读取临时图片失败');
          return await blobToDataUrl(await response.blob());
        }
        const dataUrl = await imageSourceToDataUrl(candidate, false);
        if (dataUrl) return dataUrl;
      } catch (error) {
        lastError = error;
      }
    }
    console.warn('灵感空间读取抽屉原图失败:', lastError);
    throw new Error('图片原文件读取失败，请确认文件仍然存在后重试');
  });

  const removeCanvasConnection = (targetId: string, sourceId: string, label = '删除连接线') => { return removeCanvasConnectionImpl({ canvasItemsRef, pushCanvasUndoSnapshot, updateCanvasItemsImmediate }, targetId, sourceId, label); };

  const createCanvasContextMenuState = (
    event: { clientX: number; clientY: number },
    type: CanvasContextMenuState['type'],
    patch: Partial<CanvasContextMenuState> = {}
  ): CanvasContextMenuState => { return createCanvasContextMenuStateImpl({ getCanvasPointFromClient }, event, type, patch); };

  const openCanvasContextMenu = (
    event: React.MouseEvent,
    type: CanvasContextMenuState['type'],
    patch: Partial<CanvasContextMenuState> = {}
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setCanvasContextMenu(createCanvasContextMenuState(event, type, patch));
  };

  const openCanvasCreateMenu = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-canvas-item-id], [data-no-drag="true"], textarea, input, button, select, [contenteditable="true"]')) return;
    event.preventDefault();
    event.stopPropagation();
    setCanvasContextMenu(createCanvasContextMenuState(event, 'canvas'));
  };

  const getCanvasActionIds = (itemId?: string) => {
    const selectedIds = canvasSelectedIdsRef.current;
    if (itemId && selectedIds.includes(itemId)) return selectedIds;
    if (itemId) return getCanvasSelectionIdsForItem(itemId);
    return selectedIds;
  };

  const createCanvasGroup = async (ids = canvasSelectedIdsRef.current) => { return createCanvasGroupImpl({ canvasItemsPatchCommitRef, canvasItemsRef, expandCanvasSelectionIdsWithGroups, markCanvasNodesChanged, openTextInputDialog, pushCanvasUndoSnapshot, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, showToast, updateCanvasItemsImmediate, updateCanvasSelection }, ids); };

  const renameCanvasGroup = async (ids = canvasSelectedIdsRef.current) => { return renameCanvasGroupImpl({ canvasItemsPatchCommitRef, canvasItemsRef, expandCanvasSelectionIdsWithGroups, markCanvasNodesChanged, openTextInputDialog, pushCanvasUndoSnapshot, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, showToast, updateCanvasItemsImmediate }, ids); };

  const ungroupCanvasItems = (ids = canvasSelectedIdsRef.current) => { return ungroupCanvasItemsImpl({ canvasItemsPatchCommitRef, canvasItemsRef, expandCanvasSelectionIdsWithGroups, markCanvasNodesChanged, pushCanvasUndoSnapshot, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, setCanvasSelectionWithoutWorkflowExpansion, showToast, updateCanvasItemsImmediate }, ids); };

  const copyCanvasItems = (
    ids = canvasSelectedIdsRef.current,
    options: { showToast?: boolean } = {},
  ) => { return copyCanvasItemsImpl({ canvasClipboardRef, canvasItemsRef, preferCanvasClipboardRef, showToast }, ids, options); };

  const pasteCanvasItems = (client?: { x: number; y: number }, label = '粘贴画布元素') => { return pasteCanvasItemsImpl({ CANVAS_PASTE_OFFSET, appendCanvasItems: appendCanvasItemsForPaste, canvasClipboardRef, createAssetId, getCanvasBoundsFromItems, getCanvasPointFromClient, isCanvasModeRef, makeCanvasNodeId, showToast }, client, label); };

  const duplicateCanvasItems = (ids = canvasSelectedIdsRef.current, client?: { x: number; y: number }) => {
    if (copyCanvasItems(ids) === 0) return 0;
    return pasteCanvasItems(client, '复制画布元素');
  };

  const shiftCanvasWorld = (deltaX: number, deltaY: number) => { return shiftCanvasWorldImpl({ canvasDragRef, canvasGroupResizeRef, canvasResizeRef, canvasScaleRef, canvasSelectionDragRef, hideCanvasSelectionOverlay, updateCanvasItemsImmediate }, deltaX, deltaY); };

  const expandCanvasBeforeViewport = (left: number, top: number) => { return expandCanvasBeforeViewportImpl({ canvasPanRef, canvasScaleRef, canvasSizeRef, canvasSurfaceRef, setCanvasSizeImmediate, shiftCanvasWorld, writeCanvasSurfaceScroll }, left, top); };

  const autoScrollCanvasNearEdge = (event: { clientX: number; clientY: number }) => { return autoScrollCanvasNearEdgeImpl({ canvasInteractionSurfaceRectRef, canvasPanRef, canvasScaleRef, canvasSurfaceRef, expandCanvasBeforeViewport, growCanvasToFit, isCanvasInteractingRef, writeCanvasSurfaceScroll }, event); };

  const createCanvasImageItemFromPath = async (originalPath: string, index = 0, client?: { x: number; y: number }): Promise<CanvasImageItem | null> => { return createCanvasImageItemFromPathImpl({ createAssetId, getCanvasDropPosition, getLatestFileCacheDir, makeCanvasNodeId }, originalPath, index, client); };

  const createCanvasVideoItemFromPath = async (originalPath: string, index = 0, client?: { x: number; y: number }): Promise<CanvasImageItem | null> => { return createCanvasVideoItemFromPathImpl({ createAssetId, getCanvasDropPosition, getLatestFileCacheDir, makeCanvasNodeId }, originalPath, index, client); };

  const createCanvasAudioItemFromPath = async (originalPath: string, index = 0, client?: { x: number; y: number }): Promise<CanvasImageItem | null> => { return createCanvasAudioItemFromPathImpl({ createAssetId, getCanvasDropPosition, getLatestFileCacheDir, makeCanvasNodeId }, originalPath, index, client); };

  const addCanvasImageItems = (nextItems: CanvasImageItem[]) => {
    const addedCount = appendCanvasItems(nextItems, '添加素材到画布');
    if (addedCount > 0) showToast(`已添加 ${addedCount} 个素材到无限画布`);
  };

  const addCanvasTextItem = (client?: { x: number; y: number }) => { return addCanvasTextItemImpl({ appendCanvasItems, createAssetId, getCanvasDropPosition, makeCanvasNodeId, showToast }, client); };

  const addCanvasTextItemAtWorld = (world: { x: number; y: number }) => { return addCanvasTextItemAtWorldImpl({ appendCanvasItems, createAssetId, makeCanvasNodeId, showToast }, world); };

  const createCanvasTextItemFromContent = (content: string, index = 0, client?: { x: number; y: number }): CanvasImageItem | null => { return createCanvasTextItemFromContentImpl({ createAssetId, getCanvasDropPosition, makeCanvasNodeId }, content, index, client); };

  const getCanvasClipboardImageFiles = (clipboardData: DataTransfer) => { return getCanvasClipboardImageFilesImpl({}, clipboardData); };

  const pasteSystemClipboardToCanvas = async (clipboardData: DataTransfer, client?: { x: number; y: number }) => { return pasteSystemClipboardToCanvasImpl({ appendCanvasItems: appendCanvasItemsForPaste, createCanvasImageItemFromFile, createCanvasTextItemFromContent, getCanvasClipboardImageFiles, showToast }, clipboardData, client); };

  const updateCanvasTextItem = (canvasId: string, content: string) => { return updateCanvasTextItemImpl({ canvasItemsPatchCommitRef, scheduleCanvasChangedNodesPatchSave, updateCanvasItemsImmediate }, canvasId, content); };

  const updateCanvasTextOutputItem = (canvasId: string, output: string) => { return updateCanvasTextOutputItemImpl({ canvasItemsPatchCommitRef, scheduleCanvasChangedNodesPatchSave, updateCanvasItemsImmediate }, canvasId, output); };

  const setCanvasTextNodeMode = (canvasId: string, mode: 'agent' | 'plain') => {
    pushCanvasUndoSnapshot(mode === 'plain' ? '切换为纯文本卡片' : '切换为 Agent 文字节点');
    updateCanvasItemsImmediate(prev => prev.map(canvasItem => (
      canvasItem.id === canvasId && canvasItem.item.type === 'text' && !canvasItem.ai
        ? { ...canvasItem, textMode: mode }
        : canvasItem
    )));
  };

  const setCanvasDesignAgentConfig = (canvasId: string, config: DesignAgentConfig) => { return setCanvasDesignAgentConfigImpl({ canvasItemsRef, pushCanvasUndoSnapshot, updateCanvasItemsImmediate }, canvasId, config); };

  const setCanvasTextContextRouting = (canvasId: string, mode: 'full' | 'auto') => { return setCanvasTextContextRoutingImpl({ canvasItemsRef, pushCanvasUndoSnapshot, showToast, updateCanvasItemsImmediate }, canvasId, mode); };

  const commitCanvasTextDraft = (canvasId: string, content?: string, sync = false) => { return commitCanvasTextDraftImpl({ canvasItemsRef, canvasTextDraftTimersRef, canvasTextDraftValuesRef, updateCanvasTextItem }, canvasId, content, sync); };

  const scheduleCanvasTextDraftCommit = (canvasId: string, content: string) => {
    canvasTextDraftValuesRef.current[canvasId] = content;
    const timer = canvasTextDraftTimersRef.current[canvasId];
    if (timer !== undefined) window.clearTimeout(timer);
    canvasTextDraftTimersRef.current[canvasId] = window.setTimeout(() => {
      commitCanvasTextDraft(canvasId);
    }, 900);
  };

  const commitCanvasTextOutputDraft = (canvasId: string, output?: string, sync = false) => { return commitCanvasTextOutputDraftImpl({ canvasItemsRef, canvasTextOutputDraftTimersRef, canvasTextOutputDraftValuesRef, updateCanvasTextOutputItem }, canvasId, output, sync); };

  const scheduleCanvasTextOutputDraftCommit = (canvasId: string, output: string) => {
    canvasTextOutputDraftValuesRef.current[canvasId] = output;
    const timer = canvasTextOutputDraftTimersRef.current[canvasId];
    if (timer !== undefined) window.clearTimeout(timer);
    canvasTextOutputDraftTimersRef.current[canvasId] = window.setTimeout(() => {
      commitCanvasTextOutputDraft(canvasId);
    }, 900);
  };

  const copyCanvasTextOutput = async (canvasId: string) => { return copyCanvasTextOutputImpl({ canvasItemsRef, canvasTextOutputAreaRefs, showToast }, canvasId); };

  const createCanvasImageItemFromFile = (file: File, index = 0, client?: { x: number; y: number }) => new Promise<CanvasImageItem | null>((resolve) => {
    if (!file.type.startsWith('image/') && !isCanvasImageFileName(file.name)) {
      resolve(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const url = typeof reader.result === 'string' ? reader.result : '';
      if (!url) {
        resolve(null);
        return;
      }
      let savedPath = '';
      try {
        savedPath = await invoke<string>('save_dropped_file', {
          fileName: file.name || 'canvas-image.png',
          dataUrl: url,
        });
      } catch (err) {
        console.warn('保存画布图片到本地缓存失败，暂用内存图片:', err);
      }
      const displayUrl = savedPath ? convertFileSrc(savedPath) : url;
      const item: BufferItem = {
        id: createAssetId(),
        type: 'image',
        content: file.name || '画布图片',
        name: file.name || '画布图片',
        url: displayUrl,
        path: savedPath || undefined,
        createdAt: Date.now(),
        isQuickAccess: false,
      };
      const pos = getCanvasDropPosition(index, client);
      const size = await readImageDisplaySize(displayUrl);
      resolve({
        id: makeCanvasNodeId(item.id, 'image'),
        item,
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
      });
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });

  const imageSourceToDataUrl = async (source: string, optimizeForAi = false) => { return imageSourceToDataUrlImpl({ generatedImageCachePromisesRef }, source, optimizeForAi); };

  const imageSourceToJpegDataUrl = async (source: string) => {
    const dataUrl = await imageSourceToDataUrl(source, false);
    return imageDataUrlToJpegDataUrl(dataUrl);
  };

  const imageSourceToModelDataUrl = async (source: string) => {
    const dataUrl = await imageSourceToDataUrl(source, true);
    return dataUrl || '';
  };

  const copyImageDataUrlToSystemClipboard = async (dataUrl: string) => { return copyImageDataUrlToSystemClipboardImpl({}, dataUrl); };

  const getCopyableCanvasImageFromIds = (ids: string[]) => {
    const idSet = new Set(ids.filter(Boolean));
    return canvasItemsRef.current.find(item => (
      idSet.has(item.id) &&
      item.item.type === 'image' &&
      !!getCanvasItemDisplaySource(item.item)
    )) || null;
  };

  const shouldTryBackendImageCopyDirectly = (source: string) => {
    const value = source.trim();
    if (!value) return false;
    if (/^blob:/i.test(value)) return false;
    return true;
  };

  const copyImageSourceToSystemClipboard = async (source: string) => { return copyImageSourceToSystemClipboardImpl({ copyImageDataUrlToSystemClipboard, imageSourceToDataUrl, shouldTryBackendImageCopyDirectly }, source); };

  const copySelectedImagePreviewToClipboard = async () => { return copySelectedImagePreviewToClipboardImpl({ copyImageSourceToSystemClipboard, selectedImage, showToast }); };

  const copyCanvasImageToSystemClipboard = async (
    canvasItem?: CanvasImageItem | null,
    options: { successToast?: string; missingToast?: string; failureToast?: string } = {}
  ) => { return copyCanvasImageToSystemClipboardImpl({ copyImageSourceToSystemClipboard, showToast }, canvasItem, options); };

  const copyCanvasItemsToAvailableClipboards = async (ids: string[]) => { return copyCanvasItemsToAvailableClipboardsImpl({ copyCanvasImageToSystemClipboard, copyCanvasItems, getCopyableCanvasImageFromIds }, ids); };

  const loadCanvasBrushImage = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片加载失败'));
    image.decoding = 'async';
    image.src = source;
  });

  const drawCanvasBrushEditorBase = async (editor: CanvasBrushEditorState | null) => { return drawCanvasBrushEditorBaseImpl({ canvasBrushBaseCanvasRef, canvasBrushCanvasRef, canvasBrushPendingMarksRef, loadCanvasBrushImage, setCanvasBrushEditor, setCanvasBrushHistory, setCanvasBrushRedoHistory, showToast }, editor); };

  useEffect(() => {
    if (!canvasBrushEditor) return;
    void drawCanvasBrushEditorBase(canvasBrushEditor);
  }, [canvasBrushEditor?.targetId, canvasBrushEditor?.baseDataUrl]);

  useEffect(() => { return runCanvasMediaEffect01({ activeShortcutScopeRef, canvasBrushEditor, canvasBrushEditorOpenRef, doodleRootRef, hideCanvasBrushCursor, setActiveShortcutScope }); }, [canvasBrushEditor, hideCanvasBrushCursor, setActiveShortcutScope]);

  useEffect(() => () => {
    if (canvasBrushCursorFrameRef.current != null) {
      window.cancelAnimationFrame(canvasBrushCursorFrameRef.current);
      canvasBrushCursorFrameRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (canvasBrushMode !== 'brush' && canvasBrushMode !== 'eraser') hideCanvasBrushCursor();
  }, [canvasBrushMode, hideCanvasBrushCursor]);

  const openCanvasBrushEditorFromSource = async (options: CanvasBrushEditorOpenOptions) => { return openCanvasBrushEditorFromSourceImpl({ CANVAS_BRUSH_EDITOR_MAX_EDGE, canvasBrushCanvasRef, canvasBrushCropStartRef, canvasBrushOpenRequestRef, canvasBrushPendingMarksRef, canvasBrushShapeSnapshotRef, canvasBrushShapeStartRef, canvasItemsRef, hideCanvasBrushCursor, imageSourceToDataUrl, keepDrawerOpenByPointer, loadCanvasBrushImage, setCanvasBrushCropRect, setCanvasBrushEditor, setCanvasBrushHistory, setCanvasBrushMode, setCanvasBrushRedoHistory, setCanvasContextMenu, setCanvasInputMenuForId, updateCanvasSelection }, options); };

  const openCanvasBrushEditor = async (targetId: string) => { return openCanvasBrushEditorImpl({ canvasItemsRef, openCanvasBrushEditorFromSource, showToast }, targetId); };

  const getCanvasBrushPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasBrushCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height,
    };
  };

  const updateCanvasBrushCursorFromEvent = (event: React.PointerEvent<Element>) => { return updateCanvasBrushCursorFromEventImpl({ canvasBrushCanvasRef, canvasBrushMode, hideCanvasBrushCursor, updateCanvasBrushCursor }, event); };

  const paintCanvasBrushStroke = (from: CanvasBrushPoint, to: CanvasBrushPoint) => { return paintCanvasBrushStrokeImpl({ canvasBrushCanvasRef, canvasBrushColor, canvasBrushMode, canvasBrushOpacity, canvasBrushSize }, from, to); };

  const getCanvasBrushShapeBox = (
    mode: CanvasBrushShapeMode,
    from: CanvasBrushPoint,
    to: CanvasBrushPoint
  ) => { return getCanvasBrushShapeBoxImpl({ canvasBrushSize }, mode, from, to); };

  const paintCanvasBrushShape = (
    mode: CanvasBrushShapeMode,
    from: CanvasBrushPoint,
    to: CanvasBrushPoint
  ) => { return paintCanvasBrushShapeImpl({ canvasBrushCanvasRef, canvasBrushColor, canvasBrushOpacity, getCanvasBrushShapeBox }, mode, from, to); };

  const restoreCanvasBrushShapeSnapshot = () => {
    const canvas = canvasBrushCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    const snapshot = canvasBrushShapeSnapshotRef.current;
    if (!canvas || !ctx || !snapshot) return false;
    ctx.putImageData(snapshot, 0, 0);
    return true;
  };

  const clearCanvasBrushShapeDraft = () => {
    canvasBrushShapeStartRef.current = null;
    canvasBrushShapeSnapshotRef.current = null;
  };

  const normalizeCanvasBrushCropRect = (
    from: CanvasBrushPoint,
    to: CanvasBrushPoint,
    width: number,
    height: number
  ): CanvasBrushCropRect | null => { return normalizeCanvasBrushCropRectImpl({}, from, to, width, height); };

  const pushCanvasBrushHistory = () => { return pushCanvasBrushHistoryImpl({ canvasBrushCanvasRef, setCanvasBrushHistory, setCanvasBrushRedoHistory }); };

  const applyCanvasBrushCrop = () => { return applyCanvasBrushCropImpl({ canvasBrushBaseCanvasRef, canvasBrushCanvasRef, canvasBrushCropRect, canvasBrushEditor, canvasBrushPendingMarksRef, clearCanvasBrushShapeDraft, setCanvasBrushCropRect, setCanvasBrushEditor, setCanvasBrushHistory, setCanvasBrushMode, setCanvasBrushRedoHistory, showToast }); };

  const clearCanvasBrushCrop = () => {
    setCanvasBrushCropRect(null);
    canvasBrushCropStartRef.current = null;
  };

  const activateCanvasBrushTool = (mode: CanvasBrushEditorMode) => { return activateCanvasBrushToolImpl({ activateDoodleShortcutScope, canvasBrushDrawingRef, canvasBrushLastPointRef, clearCanvasBrushCrop, clearCanvasBrushShapeDraft, doodleRootRef, hideCanvasBrushCursor, setCanvasBrushMode }, mode); };

  const handleCanvasBrushPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => { return handleCanvasBrushPointerDownImpl({ activateDoodleShortcutScope, canvasBrushCanvasRef, canvasBrushCropStartRef, canvasBrushDrawingRef, canvasBrushLastPointRef, canvasBrushMode, canvasBrushShapeSnapshotRef, canvasBrushShapeStartRef, doodleRootRef, getCanvasBrushPoint, isCanvasBrushShapeMode, paintCanvasBrushStroke, setCanvasBrushCropRect, updateCanvasBrushCursorFromEvent }, event); };

  const handleCanvasBrushPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => { return handleCanvasBrushPointerMoveImpl({ canvasBrushCanvasRef, canvasBrushCropStartRef, canvasBrushDrawingRef, canvasBrushLastPointRef, canvasBrushMode, canvasBrushShapeStartRef, getCanvasBrushPoint, isCanvasBrushShapeMode, normalizeCanvasBrushCropRect, paintCanvasBrushShape, paintCanvasBrushStroke, restoreCanvasBrushShapeSnapshot, setCanvasBrushCropRect, updateCanvasBrushCursorFromEvent }, event); };

  const finishCanvasBrushStroke = (event?: React.PointerEvent<HTMLCanvasElement>) => { return finishCanvasBrushStrokeImpl({ canvasBrushCropStartRef, canvasBrushDrawingRef, canvasBrushLastPointRef, canvasBrushMode, canvasBrushShapeStartRef, clearCanvasBrushShapeDraft, doodleRootRef, getCanvasBrushPoint, hideCanvasBrushCursor, isCanvasBrushShapeMode, paintCanvasBrushShape, pushCanvasBrushHistory, restoreCanvasBrushShapeSnapshot }, event); };

  const undoCanvasBrushStroke = () => { return undoCanvasBrushStrokeImpl({ canvasBrushCanvasRef, canvasBrushHistory, setCanvasBrushHistory, setCanvasBrushRedoHistory }); };

  const redoCanvasBrushStroke = () => { return redoCanvasBrushStrokeImpl({ canvasBrushCanvasRef, canvasBrushRedoHistory, setCanvasBrushHistory, setCanvasBrushRedoHistory }); };

  const handleDoodleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => { return handleDoodleKeyDownImpl({ activateDoodleShortcutScope, redoCanvasBrushStroke, undoCanvasBrushStroke }, event); };

  const clearCanvasBrushMarks = () => {
    if (!canvasBrushEditor) return;
    clearCanvasBrushShapeDraft();
    setCanvasBrushRedoHistory([]);
    void drawCanvasBrushEditorBase(canvasBrushEditor);
  };

  const saveCanvasBrushEditedImage = async () => { return saveCanvasBrushEditedImageImpl({ appendCanvasItems, canvasBrushBaseCanvasRef, canvasBrushCanvasRef, canvasBrushEditor, createAssetId, loadCanvasBrushImage, makeCanvasNodeId, setCanvasBrushEditor, showToast }); };

  const prepareCanvasAiInputSource = async (
    item: BufferItem,
    mode: 'stable' | 'remote-first' = 'stable',
    delivery: 'auto' | 'direct' | 'remote-only' = 'auto',
    referenceFormat: 'any' | 'jpeg' = 'any'
  ) => { return prepareCanvasAiInputSourceImpl({ imageSourceToDataUrl, imageSourceToJpegDataUrl }, item, mode, delivery, referenceFormat); };

  const cacheCanvasGeneratedImageSource = async (
    source: string,
    name: string,
    options?: { throwOnFailure?: boolean },
  ) => { return cacheCanvasGeneratedImageSourceImpl({ GENERATED_IMAGE_CACHE_RETRY_DELAYS_MS, webImageCacheDirRef }, source, name, options); };

  const createCanvasImagePreviewThumbnail = async (
    source: string,
    path?: string,
    allowWebviewFallback = false
  ) => { return createCanvasImagePreviewThumbnailImpl({}, source, path, allowWebviewFallback); };

  const settleCanvasAiOutputThumbnailJob = (
    job: CanvasAiOutputThumbnailJob,
    patch: Partial<CanvasAiGeneratedOutput>
  ) => { return settleCanvasAiOutputThumbnailJobImpl({ canvasPanRef, generatedImageCachePendingIdsRef, isCanvasInteractingRef, isCanvasZoomingRef, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, settleCanvasAiOutputThumbnailJob, updateCanvasItemsImmediate, updateDrawerItemsDeferred }, job, patch); };

  const runNextCanvasAiOutputThumbnailJob = () => { return runNextCanvasAiOutputThumbnailJobImpl({ IMAGE_THUMBNAIL_UPDATE_BATCH_MS, canvasAiOutputThumbnailInFlightRef, canvasAiOutputThumbnailQueueRef, canvasPanRef, createCanvasImagePreviewThumbnail, enqueueCanvasAiOutputThumbnailJob, isCanvasInteractingRef, isCanvasZoomingRef, runNextCanvasAiOutputThumbnailJob, settleCanvasAiOutputThumbnailJob }); };

  const enqueueCanvasAiOutputThumbnailJob = (job: CanvasAiOutputThumbnailJob) => { return enqueueCanvasAiOutputThumbnailJobImpl({ IMAGE_THUMBNAIL_QUEUE_LIMIT, canvasAiOutputThumbnailInFlightRef, canvasAiOutputThumbnailQueueRef, runNextCanvasAiOutputThumbnailJob, settleCanvasAiOutputThumbnailJob }, job); };

  const createCanvasAiOutputDrafts = (
    target: CanvasImageItem,
    prompt: string,
    clientRequestId?: string,
  ): CanvasAiGeneratedOutput[] => { return createCanvasAiOutputDraftsImpl({ createAssetId }, target, prompt, clientRequestId); };

  const getCanvasInputItemsForNode = (
    canvasItem: CanvasImageItem,
    sourceItems: CanvasImageItem[] = canvasItemsRef.current
  ) => {
    const itemsById = new Map(sourceItems.map(item => [item.id, item]));
    return (canvasItem.inputs || [])
      .map(inputId => itemsById.get(inputId))
      .filter((item): item is CanvasImageItem => !!item && item.id !== canvasItem.id);
  };

  const getCanvasContextRoutingTargetKeys = (canvasItem: CanvasImageItem) => Array.from(new Set([
    getCanvasWorkflowGroup(canvasItem)?.templateId,
    canvasItem.workflowTemplateNodeId,
    canvasItem.id,
  ].map(value => String(value || '').trim()).filter(Boolean)));

  const getCanvasContextRoutingTargetsForAgent = (
    agentItem: CanvasImageItem,
    sourceItems: CanvasImageItem[],
  ): CanvasContextRoutingTarget[] => { return getCanvasContextRoutingTargetsForAgentImpl({ getCanvasContextRoutingTargetKeys }, agentItem, sourceItems); };

  const getCanvasTextInputsForNode = (
    canvasItem: CanvasImageItem,
    sourceItems: CanvasImageItem[] = canvasItemsRef.current
  ) => { return getCanvasTextInputsForNodeImpl({ getCanvasContextRoutingTargetKeys, getCanvasInputItemsForNode }, canvasItem, sourceItems); };

  const getCanvasImageInputBufferItemsForNode = (
    canvasItem: CanvasImageItem,
    sourceItems: CanvasImageItem[] = canvasItemsRef.current
  ) => { return getCanvasImageInputBufferItemsForNodeImpl({
    canvasAiCloudImageModels,
    canvasAiCredentialSource,
    getCanvasInputItemsForNode,
  }, canvasItem, sourceItems); };

  const stopTemporaryReferenceShares = async (shares: TemporaryReferenceShare[]) => { return stopTemporaryReferenceSharesImpl({}, shares); };

  const publishLocalAiInputs = async (
    sources: string[],
    preference: 'cloudflared-first' | 'hosted-first' | 'oss-only' = 'cloudflared-first',
    maxUrlLength = 64,
  ) => { return publishLocalAiInputsImpl({ CLOUDFLARED_DISCLAIMER_ACCEPTED_STORAGE_KEY, getCanvasAiErrorSummary, getLatestFileCacheDir, setShowUpdateLog, showUpdateLogRef }, sources, preference, maxUrlLength); };

  const uploadWalletReferenceInputs = async (sources: string[]) => { return uploadWalletReferenceInputsImpl({}, sources); };

  const uploadXaisReferenceInputs = async (
    sources: string[],
    provider: CanvasAiProvider
  ) => { return uploadXaisReferenceInputsImpl({ canvasAiApiKey, canvasAiApiProvider, canvasAiEndpoint, canvasAiHeadersText, canvasAiProvider, effectiveCanvasAiApiProvider, effectiveCanvasAiEndpoint, effectiveCanvasAiGatewayKind, effectiveCanvasAiModel, effectiveCanvasAiProvider, isCanvasAiLicenseManaged }, sources, provider); };

  const getCanvasImageInputsForNode = async (
    canvasItem: CanvasImageItem,
    mode: 'stable' | 'remote-first' = 'stable',
    delivery: 'auto' | 'direct' | 'remote-only' = 'auto',
    sourceItems: CanvasImageItem[] = canvasItemsRef.current,
    referenceFormat: 'any' | 'jpeg' = 'any',
    publicationPreference: 'cloudflared-first' | 'hosted-first' = 'cloudflared-first',
    portableWalletReferences = false,
    runtimeProvider?: CanvasAiProvider,
  ) => { return getCanvasImageInputsForNodeImpl({ canvasAiProvider, getCanvasAiErrorSummary, getCanvasImageInputBufferItemsForNode, prepareCanvasAiInputSource, publishLocalAiInputs, stopTemporaryReferenceShares, uploadWalletReferenceInputs, uploadXaisReferenceInputs }, canvasItem, mode, delivery, sourceItems, referenceFormat, publicationPreference, portableWalletReferences, runtimeProvider); };

  const getSelectedCanvasAiInputIds = () => (
    canvasSelectedIdsRef.current.filter(id => {
      const item = canvasItemsRef.current.find(canvasItem => canvasItem.id === id);
      return canUseCanvasItemAsAiInput(item);
    })
  );

  const applyCanvasPresetDraft = (preset?: CanvasAiPromptPreset | null) => {
    setCanvasPresetNameDraft(preset?.label || '');
    setCanvasPresetPromptDraft(preset?.prompt || '');
  };

  const updateCanvasNodesForPreset = (preset: CanvasAiPromptPreset) => { return updateCanvasNodesForPresetImpl({ updateCanvasItemsImmediate }, preset); };

  const openCanvasPresetEditor = () => {
    setIsCanvasWorkflowManagerOpen(false);
    setSelectedCanvasPresetDeleteIds([]);
    setCanvasPresetEditorMode('create');
    setCanvasPresetEditingId('');
    setCanvasPresetNameDraft('');
    setCanvasPresetPromptDraft('');
    setIsCanvasPresetEditorOpen(true);
  };

  const openCanvasPresetManager = (presetId?: string) => { return openCanvasPresetManagerImpl({ applyCanvasPresetDraft, canvasAiPromptPresets, openCanvasPresetEditor, setCanvasPresetEditingId, setCanvasPresetEditorMode, setIsCanvasPresetEditorOpen, setIsCanvasWorkflowManagerOpen, setSelectedCanvasPresetDeleteIds }, presetId); };

  const selectCanvasPresetForEdit = (presetId: string) => {
    const preset = canvasAiPromptPresets.find(item => item.id === presetId);
    if (!preset) return;
    setCanvasPresetEditingId(preset.id);
    applyCanvasPresetDraft(preset);
  };

  const closeCanvasPresetEditor = () => {
    setIsCanvasPresetEditorOpen(false);
    setCanvasPresetEditorMode('create');
    setCanvasPresetEditingId('');
    setCanvasPresetNameDraft('');
    setCanvasPresetPromptDraft('');
    setSelectedCanvasPresetDeleteIds([]);
  };

  const saveCanvasAiCustomPromptPreset = () => { return saveCanvasAiCustomPromptPresetImpl({ canvasAiPromptPresets, canvasPresetEditingId, canvasPresetEditorMode, canvasPresetNameDraft, canvasPresetPromptDraft, closeCanvasPresetEditor, setCustomCanvasAiPromptPresets, showToast, updateCanvasNodesForPreset }); };

  const deleteCanvasAiPromptPresetIds = (presetIds: string[]) => { return deleteCanvasAiPromptPresetIdsImpl({ applyCanvasPresetDraft, canvasAiPromptPresets, setCanvasPresetEditingId, setCanvasPresetEditorMode, setCanvasPresetNameDraft, setCanvasPresetPromptDraft, setCustomCanvasAiPromptPresets, setHiddenBuiltInCanvasAiPromptPresetIds, setSelectedCanvasPresetDeleteIds, showToast }, presetIds); };

  const getCanvasTemplateImportPayload = (rawValue: unknown) => { return getCanvasTemplateImportPayloadImpl({}, rawValue); };

  const materializeImportedCanvasWorkflows = (workflows: CanvasWorkflowTemplate[]) => (
    materializeCanvasWorkflowFixedImages(
      workflows,
      (fileName, dataUrl) => invoke<string>('save_dropped_file', { fileName, dataUrl }),
      path => convertFileSrc(path),
    )
  );

  const chooseCanvasTemplateImportFiles = async () => {
    const selected = await open({
      multiple: true,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    return Array.isArray(selected) ? selected : (selected ? [selected] : []);
  };

  const importCanvasTemplateFile = async (scope: 'preset' | 'workflow' | 'all') => { return importCanvasTemplateFileImpl({ appendCanvasItems, applyCanvasPresetDraft, buildCanvasWorkflowModuleNode, canvasWorkflowTemplates, chooseCanvasTemplateImportFiles, enterCanvasMode, getCanvasDropPosition, getCanvasTemplateImportPayload, isCanvasModeRef, materializeImportedCanvasWorkflows, setCanvasPresetEditingId, setCanvasPresetEditorMode, setCanvasWorkflowEditingId, setCanvasWorkflowHintDraft, setCanvasWorkflowNameDraft, setCustomCanvasAiPromptPresets, setCustomCanvasWorkflows, setIsCanvasPresetEditorOpen, setIsCanvasWorkflowManagerOpen, showToast, updateCanvasNodesForPreset }, scope); };

  const exportCanvasTemplateFile = async (
    payload: { presets?: CanvasAiPromptPreset[]; workflows?: CanvasWorkflowTemplate[] },
    defaultName: string
  ) => { return exportCanvasTemplateFileImpl({ imageSourceToDataUrl, showToast }, payload, defaultName); };

  const exportCurrentCanvasPreset = () => {
    const preset = canvasAiPromptPresets.find(item => item.id === canvasPresetEditingId);
    if (!preset) {
      showToast('请选择要导出的预设');
      return;
    }
    void exportCanvasTemplateFile({ presets: [preset] }, `${preset.label || 'canvas-preset'}.json`);
  };

  const exportAllCanvasPresets = () => {
    void exportCanvasTemplateFile({ presets: canvasAiPromptPresets }, 'canvas-all-prompt-presets.json');
  };

  const deleteSelectedCanvasPromptPresets = () => { return deleteSelectedCanvasPromptPresetsImpl({ canvasAiPromptPresets, closeConfirmDialog, deleteCanvasAiPromptPresetIds, selectedCanvasPresetDeleteIds, setConfirmDialog, showToast }); };

  const buildCanvasAiGeneratorNode = (
    pos: { x: number; y: number },
    preset?: CanvasAiPromptPreset,
    inputIds: string[] = [],
    mediaType: 'image' | 'video' = 'image'
  ): CanvasImageItem => { return buildCanvasAiGeneratorNodeImpl({ canvasAiCloudImageModels, canvasAiCredentialSource, canvasAiProvider, canvasAiUnifiedImageModelOptions, canvasAiUnifiedVideoModelOptions, createAssetId, getCanvasAiResolvedModel, makeCanvasNodeId }, pos, preset, inputIds, mediaType); };

  const buildCanvasImageFusionNode = (
    pos: { x: number; y: number },
    inputIds: string[] = [],
  ): CanvasImageItem => { return buildCanvasImageFusionNodeImpl({ buildCanvasAiGeneratorNode, canvasItemsRef }, pos, inputIds); };

  const getSelectedCanvasImageFusionInputIds = () => (
    getSelectedCanvasAiInputIds()
      .filter(inputId => {
        const source = canvasItemsRef.current.find(item => item.id === inputId);
        return canUseCanvasItemAsImageEnhancementInput(source);
      })
      .slice(0, 2)
  );

  const addCanvasImageFusionNode = (client?: { x: number; y: number }) => { return addCanvasImageFusionNodeImpl({ appendCanvasItems, buildCanvasImageFusionNode, getCanvasDropPosition, getCanvasItemsBounds, getSelectedCanvasImageFusionInputIds, showToast, updateCanvasSelection }, client); };

  const addCanvasImageFusionNodeAtWorld = (
    world: { x: number; y: number },
    sourceIds: string[] = getSelectedCanvasImageFusionInputIds(),
  ) => { return addCanvasImageFusionNodeAtWorldImpl({ appendCanvasItems, buildCanvasImageFusionNode, showToast, updateCanvasSelection }, world, sourceIds); };

  const addCanvasAiGeneratorNode = (client?: { x: number; y: number }, preset?: CanvasAiPromptPreset) => { return addCanvasAiGeneratorNodeImpl({ appendCanvasItems, buildCanvasAiGeneratorNode, getCanvasDropPosition, getCanvasItemsBounds, getSelectedCanvasAiInputIds, showToast }, client, preset); };

  const addCanvasAiGeneratorNodeAtWorld = (world: { x: number; y: number }, preset?: CanvasAiPromptPreset) => { return addCanvasAiGeneratorNodeAtWorldImpl({ appendCanvasItems, buildCanvasAiGeneratorNode, getSelectedCanvasAiInputIds, showToast }, world, preset); };

  const addCanvasAiVideoGeneratorNode = (client?: { x: number; y: number }) => { return addCanvasAiVideoGeneratorNodeImpl({ appendCanvasItems, buildCanvasAiGeneratorNode, getCanvasDropPosition, getCanvasItemsBounds, getSelectedCanvasAiInputIds, showToast }, client); };

  const addCanvasAiVideoGeneratorNodeAtWorld = (world: { x: number; y: number }) => { return addCanvasAiVideoGeneratorNodeAtWorldImpl({ appendCanvasItems, buildCanvasAiGeneratorNode, getSelectedCanvasAiInputIds, showToast }, world); };

  const getSelectedFrameInterpolationInputIds = () => (
    getSelectedCanvasAiInputIds().filter(inputId => {
      const source = canvasItemsRef.current.find(item => item.id === inputId);
      return canUseCanvasItemAsFrameInterpolationVideoInput(source);
    }).slice(0, 1)
  );

  const buildCanvasFrameInterpolationNode = (pos: { x: number; y: number }, inputIds: string[] = []): CanvasImageItem => { return buildCanvasFrameInterpolationNodeImpl({ createAssetId, makeCanvasNodeId }, pos, inputIds); };

  const addCanvasFrameInterpolationNode = (client?: { x: number; y: number }) => { return addCanvasFrameInterpolationNodeImpl({ appendCanvasItems, buildCanvasFrameInterpolationNode, getCanvasDropPosition, getCanvasItemsBounds, getSelectedFrameInterpolationInputIds, showToast }, client); };

  const addCanvasFrameInterpolationNodeAtWorld = (world: { x: number; y: number }) => { return addCanvasFrameInterpolationNodeAtWorldImpl({ appendCanvasItems, buildCanvasFrameInterpolationNode, getSelectedFrameInterpolationInputIds, showToast }, world); };

  const getSelectedEnhancementInputIds = (mediaType: 'image' | 'video') => (
    getSelectedCanvasAiInputIds().filter(inputId => {
      const source = canvasItemsRef.current.find(item => item.id === inputId);
      return mediaType === 'video'
        ? canUseCanvasItemAsVideoEnhancementInput(source)
        : canUseCanvasItemAsImageEnhancementInput(source);
    }).slice(0, 1)
  );

  const buildCanvasEnhancementNode = (
    pos: { x: number; y: number },
    mediaType: 'image' | 'video',
    inputIds: string[] = [],
  ): CanvasImageItem => { return buildCanvasEnhancementNodeImpl({ createAssetId, makeCanvasNodeId }, pos, mediaType, inputIds); };

  const addCanvasEnhancementNode = (
    mediaType: 'image' | 'video',
    client?: { x: number; y: number },
  ) => { return addCanvasEnhancementNodeImpl({ appendCanvasItems, buildCanvasEnhancementNode, getCanvasDropPosition, getCanvasItemsBounds, getSelectedEnhancementInputIds, showToast }, mediaType, client); };

  const addCanvasEnhancementNodeAtWorld = (
    mediaType: 'image' | 'video',
    world: { x: number; y: number },
  ) => { return addCanvasEnhancementNodeAtWorldImpl({ appendCanvasItems, buildCanvasEnhancementNode, getSelectedEnhancementInputIds, showToast }, mediaType, world); };

  const getCanvasWorkflowExpandedGroupItems = (
    groupId: string,
    sourceItems: CanvasImageItem[] = canvasItemsRef.current,
  ) => (
    sourceItems.filter(item => getCanvasWorkflowGroup(item)?.groupId === groupId)
  );

  const hydrateCanvasWorkflowSlotAssetsFromDrawer = (
    runtimeItems: CanvasImageItem[],
  ) => runtimeItems.map(item => {
    if (!item.workflowSlotAssets?.length) return item;
    const assets = item.workflowSlotAssets.map(asset => {
      const drawerItem = asset.sourceItemId
        ? itemsRef.current.find(candidate => candidate.id === asset.sourceItemId)
        : null;
      if (!drawerItem || drawerItem.type !== 'image') return asset;
      return {
        ...createCanvasWorkflowSlotAssetFromItem(drawerItem, asset.updatedAt),
        ...asset,
        path: asset.path || drawerItem.path,
        url: asset.url || drawerItem.url,
        thumbnail: asset.thumbnail || drawerItem.thumbnail,
        originalUrl: asset.originalUrl || drawerItem.originalUrl || drawerItem.sourceUrl,
        name: asset.name || drawerItem.name,
        updatedAt: asset.updatedAt,
      } as CanvasWorkflowSlotAsset;
    });
    return {
      ...item,
      item: applyCanvasWorkflowSlotAssetToItem(item.item, assets[0]),
      workflowSlotAssets: assets,
    };
  });

  const instantiateCanvasWorkflowTemplateItems = (
    workflow: CanvasWorkflowTemplate,
    base: { x: number; y: number },
    externalInputIds: string[] = []
  ) => { return instantiateCanvasWorkflowTemplateItemsImpl({ canvasAiProvider, createAssetId, makeCanvasNodeId }, workflow, base, externalInputIds); };

  const buildCanvasWorkflowModuleNode = (
    workflow: CanvasWorkflowTemplate,
    pos: { x: number; y: number },
    inputIds: string[] = []
  ): CanvasImageItem | null => { return buildCanvasWorkflowModuleNodeImpl({ canvasAiProvider, canvasItemsRef, createAssetId, makeCanvasNodeId }, workflow, pos, inputIds); };

  const addCanvasWorkflowTemplate = (workflow: CanvasWorkflowTemplate, client?: { x: number; y: number }) => { return addCanvasWorkflowTemplateImpl({ appendCanvasItems, buildCanvasWorkflowModuleNode, getCanvasDropPosition, getCanvasItemsBounds, getCanvasPointFromClient, getSelectedCanvasAiInputIds, showToast }, workflow, client); };

  const buildCanvasWorkflowSaveDraftFromSelection = (defaultName: string): CanvasWorkflowSaveDraft | null => { return buildCanvasWorkflowSaveDraftFromSelectionImpl({ canvasItemsRef, canvasSelectedIdsRef, getCanvasBoundsFromItems, showToast }, defaultName); };

  const saveSelectedCanvasWorkflow = () => {
    const selectedIds = canvasSelectedIdsRef.current;
    const selectedIdSet = new Set(selectedIds);
    const selectedItems = canvasItemsRef.current.filter(item => selectedIdSet.has(item.id));
    const aiCount = selectedItems.filter(item => item.ai?.type === 'image-generator').length;
    const defaultName = aiCount > 1 ? `我的工作流 ${customCanvasWorkflows.length + 1}` : '我的生图工作流';
    const draft = buildCanvasWorkflowSaveDraftFromSelection(defaultName);
    if (draft) setCanvasWorkflowSaveDraft(draft);
  };

  const closeCanvasWorkflowSaveDialog = () => {
    setCanvasWorkflowSaveDraft(null);
  };

  const confirmSaveCanvasWorkflow = () => { return confirmSaveCanvasWorkflowImpl({ buildCanvasWorkflowModuleNode, canvasWorkflowSaveDraft, closeCanvasWorkflowSaveDialog, pushCanvasUndoSnapshot, setCustomCanvasWorkflows, showToast, updateCanvasItemsImmediate, updateCanvasSelection }); };

  const updateCanvasWorkflowModuleNodesForTemplate = (
    workflow: CanvasWorkflowTemplate,
    resetOutputs = false
  ) => { return updateCanvasWorkflowModuleNodesForTemplateImpl({ updateCanvasItemsImmediate }, workflow, resetOutputs); };

  const selectCanvasWorkflowForEdit = (workflowId: string) => {
    const workflow = canvasWorkflowTemplates.find(item => item.id === workflowId) || canvasWorkflowTemplates[0];
    if (!workflow) return;
    setCanvasWorkflowEditingId(workflow.id);
    setCanvasWorkflowNameDraft(workflow.label);
    setCanvasWorkflowHintDraft(workflow.hint || '');
  };

  const openCanvasWorkflowManager = (workflowId?: string) => { return openCanvasWorkflowManagerImpl({ canvasWorkflowTemplates, selectCanvasWorkflowForEdit, setIsCanvasPresetEditorOpen, setIsCanvasWorkflowManagerOpen, setSelectedCanvasWorkflowDeleteIds, showToast }, workflowId); };

  const closeCanvasWorkflowManager = () => {
    setIsCanvasWorkflowManagerOpen(false);
    setSelectedCanvasWorkflowDeleteIds([]);
  };

  const saveCanvasWorkflowManagerChanges = () => { return saveCanvasWorkflowManagerChangesImpl({ canvasWorkflowEditingId, canvasWorkflowHintDraft, canvasWorkflowNameDraft, canvasWorkflowTemplates, customCanvasWorkflows, setCanvasWorkflowEditingId, setCanvasWorkflowHintDraft, setCanvasWorkflowNameDraft, setCustomCanvasWorkflows, showToast, updateCanvasWorkflowModuleNodesForTemplate }); };

  const replaceCanvasWorkflowManagerWithSelection = () => { return replaceCanvasWorkflowManagerWithSelectionImpl({ buildCanvasWorkflowSaveDraftFromSelection, canvasWorkflowEditingId, canvasWorkflowHintDraft, canvasWorkflowNameDraft, canvasWorkflowTemplates, customCanvasWorkflows, setCanvasWorkflowEditingId, setCanvasWorkflowHintDraft, setCanvasWorkflowNameDraft, setCustomCanvasWorkflows, showToast, updateCanvasWorkflowModuleNodesForTemplate }); };

  const deleteCanvasWorkflowIds = (workflowIds: string[]) => { return deleteCanvasWorkflowIdsImpl({ canvasWorkflowTemplates, setCanvasWorkflowEditingId, setCanvasWorkflowHintDraft, setCanvasWorkflowNameDraft, setCustomCanvasWorkflows, setHiddenBuiltInCanvasWorkflowIds, setSelectedCanvasWorkflowDeleteIds, showToast }, workflowIds); };

  const expandCanvasWorkflowModuleForEdit = (canvasId: string) => { return expandCanvasWorkflowModuleForEditImpl({ canvasItemsRef, commitCanvasAiPromptDraft, hydrateCanvasWorkflowSlotAssetsFromDrawer, instantiateCanvasWorkflowTemplateItems, pushCanvasUndoSnapshot, showToast, updateCanvasItemsImmediate, updateCanvasSelection }, canvasId); };

  const buildCanvasWorkflowTemplateFromExpandedGroup = (
    groupItems: CanvasImageItem[],
    group: CanvasWorkflowExpandedGroup
  ) => { return buildCanvasWorkflowTemplateFromExpandedGroupImpl({ getCanvasBoundsFromItems }, groupItems, group); };

  const exportCurrentCanvasWorkflow = () => {
    const workflow = canvasWorkflowTemplates.find(item => item.id === canvasWorkflowEditingId);
    if (!workflow) {
      showToast('请选择要导出的工作流');
      return;
    }
    void exportCanvasTemplateFile({ workflows: [workflow] }, `${workflow.label || 'canvas-workflow'}.json`);
  };

  const exportAllCanvasWorkflows = () => {
    void exportCanvasTemplateFile({ workflows: canvasWorkflowTemplates }, 'canvas-all-workflows.json');
  };

  const exportCanvasWorkflowModuleInstance = async (canvasId: string) => { return exportCanvasWorkflowModuleInstanceImpl({ canvasItemsRef, imageSourceToDataUrl, showToast }, canvasId); };

  const deleteSelectedCanvasWorkflows = () => { return deleteSelectedCanvasWorkflowsImpl({ canvasWorkflowTemplates, closeConfirmDialog, deleteCanvasWorkflowIds, selectedCanvasWorkflowDeleteIds, setConfirmDialog, showToast }); };

  const collapseCanvasWorkflowGroupNow = (
    group: CanvasWorkflowExpandedGroup,
    saveTemplate: boolean,
    changed: boolean
  ) => { return collapseCanvasWorkflowGroupNowImpl({ buildCanvasWorkflowModuleNode, buildCanvasWorkflowTemplateFromExpandedGroup, canvasWorkflowSingleEditGroupIdsRef, customCanvasWorkflows, getCanvasWorkflowExpandedGroupItems, pushCanvasUndoSnapshot, setCanvasWorkflowSingleEditGroupIds, setCustomCanvasWorkflows, showToast, updateCanvasItemsImmediate, updateCanvasSelection }, group, saveTemplate, changed); };

  const collapseCanvasWorkflowGroup = (canvasId: string) => { return collapseCanvasWorkflowGroupImpl({ buildCanvasWorkflowTemplateFromExpandedGroup, canvasItemsRef, closeConfirmDialog, collapseCanvasWorkflowGroupNow, getCanvasWorkflowExpandedGroupItems, setConfirmDialog, showToast }, canvasId); };

  const applyCanvasAiGeneratorDataPatch = (
    item: CanvasImageItem,
    patch: Partial<NonNullable<CanvasImageItem['ai']>>,
    content?: string,
  ) => { return applyCanvasAiGeneratorDataPatchImpl({ canvasAiPromptEditingId, canvasGroupResizeRef, canvasResizeRef, getCanvasAiNodeDesignSizeForItem }, item, patch, content); };

  const updateCanvasAiGeneratorDataForCanvas = (
    targetCanvasId: string,
    nodeId: string,
    patch: Partial<NonNullable<CanvasImageItem['ai']>>,
    content?: string,
  ) => { return updateCanvasAiGeneratorDataForCanvasImpl({ applyCanvasAiGeneratorDataPatch, updateCanvasNodeForCanvas }, targetCanvasId, nodeId, patch, content); };

  const updateCanvasNodeForCanvas = (
    targetCanvasId: string,
    nodeId: string,
    updater: (item: CanvasImageItem) => CanvasImageItem,
  ) => { return updateCanvasNodeForCanvasImpl({ activeCanvasIdRef, canvasItemsPatchCommitRef, enqueueCanvasBackgroundNodePatch, getCanvasSessionItems, isSwitchingCanvasRef, scheduleCanvasChangedNodesPatchSave, setCanvasSessionItems, updateCanvasItemsImmediate }, targetCanvasId, nodeId, updater); };

  const updateCanvasAiGeneratorData = (
    nodeId: string,
    patch: Partial<NonNullable<CanvasImageItem['ai']>>,
    content?: string,
  ) => updateCanvasAiGeneratorDataForCanvas(
    activeCanvasIdRef.current || DEFAULT_CANVAS_ID,
    nodeId,
    patch,
    content,
  );

  const updateCanvasImageRule = (canvasId: string, key: ImageRuleKey, enabled: boolean) => { return updateCanvasImageRuleImpl({ canvasItemsRef, pushDrawerUndoSnapshot, updateCanvasItemsImmediate }, canvasId, key, enabled); };

  const toggleCanvasImageRule = (canvasId: string, key: ImageRuleKey) => {
    const target = canvasItemsRef.current.find(item => item.id === canvasId);
    if (target?.ai?.type !== 'image-generator') return;
    const resolvedRules = getCanvasImageRuleState(target);
    updateCanvasImageRule(canvasId, key, resolvedRules[key] !== true);
  };

  const toggleCanvasImageRulePanel = (canvasId: string) => { return toggleCanvasImageRulePanelImpl({ canvasAiPromptEditingId, canvasItemsRef, getCanvasAiNodeDesignSizeForItem, updateCanvasItemsImmediate }, canvasId); };

  const commitCanvasAiPromptDraft = (canvasId: string, content?: string, sync = false) => { return commitCanvasAiPromptDraftImpl({ canvasAiPromptDraftTimersRef, canvasAiPromptDraftValuesRef, canvasItemsRef, updateCanvasAiGeneratorData }, canvasId, content, sync); };

  const scheduleCanvasAiPromptDraftCommit = (canvasId: string, content: string) => {
    canvasAiPromptDraftValuesRef.current[canvasId] = content;
    const timer = canvasAiPromptDraftTimersRef.current[canvasId];
    if (timer !== undefined) window.clearTimeout(timer);
    canvasAiPromptDraftTimersRef.current[canvasId] = window.setTimeout(() => {
      commitCanvasAiPromptDraft(canvasId);
    }, 900);
  };

  const optimizeCanvasPrompt = async (canvasId: string) => { return optimizeCanvasPromptImpl({ canvasAgent, canvasAiPromptDraftValuesRef, canvasAiPromptTextAreaRefs, canvasItemsRef, canvasPromptOptimizingId, commitCanvasAiPromptDraft, setCanvasPromptOptimizingId, showToast, updateCanvasSelection }, canvasId); };

  const resizeCanvasAiPromptEditor = (canvasId: string, expanded: boolean, previousExpanded?: boolean) => { return resizeCanvasAiPromptEditorImpl({ canvasAiPromptEditingId, getCanvasAiNodeDesignSizeForItem, updateCanvasItemsImmediate }, canvasId, expanded, previousExpanded); };

  const toggleCanvasAiOutputsExpanded = (canvasId: string) => { return toggleCanvasAiOutputsExpandedImpl({ canvasAiExpandedOutputNodeIds, canvasAiPromptEditingId, getCanvasAiNodeDesignSizeForItem, setCanvasAiExpandedOutputNodeIds, updateCanvasItemsImmediate }, canvasId); };

  const setCanvasWorkflowOutputMode = (canvasId: string, mode: 'final' | 'all') => { return setCanvasWorkflowOutputModeImpl({ showToast, updateCanvasItemsImmediate }, canvasId, mode); };

  const getCanvasImageFusionPreferredRole = (targetId: string) => {
    const pending = pendingCanvasFusionRoleRef.current;
    return pending?.targetId === targetId ? pending.role : null;
  };

  const applyCanvasImageFusionConnectionPatch = (
    item: CanvasImageItem,
    sourceIds: string[],
    preferredRole?: CanvasImageFusionRole | null,
  ): CanvasImageItem => { return applyCanvasImageFusionConnectionPatchImpl({}, item, sourceIds, preferredRole); };

  const setCanvasReferenceReplacement = (next: CanvasReferenceReplaceTarget | null) => {
    canvasReferenceReplaceTargetRef.current = next;
    setCanvasReferenceReplaceTarget(next);
  };

  const openCanvasReferenceAddMenu = (targetId: string) => {
    setCanvasReferenceReplacement(null);
    setCanvasInputMenuForId(targetId);
  };

  const openCanvasReferenceReplaceMenu = (
    targetId: string,
    inputId: string,
    inputIndex: number,
  ) => {
    setCanvasReferenceReplacement({ targetId, inputId, inputIndex });
    setCanvasInputMenuForId(targetId);
  };

  const canReplaceCanvasImageReferenceForTarget = (target?: CanvasImageItem) => (
    target?.ai?.type === 'image-generator'
    || (
      target?.ai?.type === 'workflow'
      && normalizeCanvasWorkflowUserInput(getCanvasWorkflowTemplateFromNode(target)?.userInput).acceptImages !== false
    )
  );

  const replaceCanvasGeneratorReference = (
    replacement: CanvasReferenceReplaceTarget,
    nextInputId: string,
    options: { pushUndo?: boolean } = {},
  ) => { return replaceCanvasGeneratorReferenceImpl({ canReplaceCanvasImageReferenceForTarget, canvasItemsRef, pushCanvasUndoSnapshot, setCanvasInputMenuForId, setCanvasReferenceReplacement, showToast, updateCanvasItemsImmediate, updateCanvasSelection }, replacement, nextInputId, options); };

  const rotateCanvasImageClockwise = (id: string) => { return rotateCanvasImageClockwiseImpl({ canvasItemsRef, growCanvasToFit, pushCanvasUndoSnapshot, updateCanvasItemsImmediate, updateCanvasSelection }, id); };

  const connectSelectedCanvasItemsToGenerator = (targetId: string) => { return connectSelectedCanvasItemsToGeneratorImpl({ applyCanvasImageFusionConnectionPatch, canReplaceCanvasImageReferenceForTarget, canvasItemsRef, canvasReferenceReplaceTargetRef, canvasSelectedIdsRef, getCanvasImageFusionPreferredRole, pendingCanvasFusionRoleRef, pushCanvasUndoSnapshot, replaceCanvasGeneratorReference, showToast, updateCanvasItemsImmediate, updateCanvasSelection }, targetId); };

  const connectCanvasItems = (sourceId: string, targetId: string) => { return connectCanvasItemsImpl({ applyCanvasImageFusionConnectionPatch, canvasItemsRef, getCanvasImageFusionPreferredRole, pendingCanvasFusionRoleRef, pushCanvasUndoSnapshot, showToast, updateCanvasItemsImmediate, updateCanvasSelection }, sourceId, targetId); };

  const connectCanvasItemsToGenerator = (sourceIds: string[], targetId: string) => { return connectCanvasItemsToGeneratorImpl({ applyCanvasImageFusionConnectionPatch, canvasItemsRef, getCanvasImageFusionPreferredRole, pendingCanvasFusionRoleRef, pushCanvasUndoSnapshot, showToast, updateCanvasItemsImmediate, updateCanvasSelection }, sourceIds, targetId); };

  const addCanvasAiGeneratorNodeForSources = (sourceIds: string[], world: { x: number; y: number }) => { return addCanvasAiGeneratorNodeForSourcesImpl({ appendCanvasItems, buildCanvasAiGeneratorNode, canvasItemsRef, showToast, updateCanvasSelection }, sourceIds, world); };

  const addCanvasAiVideoGeneratorNodeForSources = (sourceIds: string[], world: { x: number; y: number }) => { return addCanvasAiVideoGeneratorNodeForSourcesImpl({ appendCanvasItems, buildCanvasAiGeneratorNode, canvasItemsRef, showToast, updateCanvasSelection }, sourceIds, world); };

  const addCanvasFrameInterpolationNodeForSources = (sourceIds: string[], world: { x: number; y: number }) => { return addCanvasFrameInterpolationNodeForSourcesImpl({ appendCanvasItems, buildCanvasFrameInterpolationNode, canvasItemsRef, showToast, updateCanvasSelection }, sourceIds, world); };

  const addCanvasEnhancementNodeForSources = (
    sourceIds: string[],
    mediaType: 'image' | 'video',
    world: { x: number; y: number },
  ) => { return addCanvasEnhancementNodeForSourcesImpl({ appendCanvasItems, buildCanvasEnhancementNode, canvasItemsRef, showToast, updateCanvasSelection }, sourceIds, mediaType, world); };

  const addCanvasTextInputForGenerator = (targetId: string, world: { x: number; y: number }) => { return addCanvasTextInputForGeneratorImpl({ canvasItemsRef, createAssetId, makeCanvasNodeId, pushCanvasUndoSnapshot, showToast, updateCanvasItemsImmediate, updateCanvasSelection }, targetId, world); };

  const findCanvasWorkflowSlot = (
    module: CanvasImageItem | null | undefined,
    slotId: string,
  ): CanvasWorkflowInternalSlot | null => {
    const workflow = getCanvasWorkflowTemplateFromNode(module);
    return getCanvasWorkflowInternalSlotNodes(workflow)
      .find(node => node.internalSlot?.id === slotId)
      ?.internalSlot || null;
  };

  const updateCollapsedCanvasWorkflowSlot = (
    moduleId: string,
    slotId: string,
    operation: (
      module: CanvasImageItem,
      slot: CanvasWorkflowInternalSlot,
    ) => CanvasImageItem,
    undoLabel = '更新工作流图片槽位',
  ) => { return updateCollapsedCanvasWorkflowSlotImpl({ canvasItemsRef, findCanvasWorkflowSlot, pushCanvasUndoSnapshot, updateCanvasItemsImmediate }, moduleId, slotId, operation, undoLabel); };

  const replaceExpandedCanvasWorkflowSlot = (
    expandedNodeId: string,
    assets: CanvasWorkflowSlotAsset[],
  ) => { return replaceExpandedCanvasWorkflowSlotImpl({ canvasItemsRef, pushCanvasUndoSnapshot, updateCanvasItemsImmediate }, expandedNodeId, assets); };

  const replaceCanvasWorkflowSlotAssets = (
    moduleId: string,
    slotId: string,
    assets: CanvasWorkflowSlotAsset[],
    expandedNodeId?: string,
  ) => { return replaceCanvasWorkflowSlotAssetsImpl({ replaceExpandedCanvasWorkflowSlot, showToast, updateCollapsedCanvasWorkflowSlot }, moduleId, slotId, assets, expandedNodeId); };

  const getCanvasWorkflowSlotAssetFromCanvasItem = (
    canvasItem?: CanvasImageItem | null,
  ): CanvasWorkflowSlotAsset | null => { return getCanvasWorkflowSlotAssetFromCanvasItemImpl({}, canvasItem); };

  const getSelectedCanvasWorkflowSlotAssets = (excludeId?: string) => { return getSelectedCanvasWorkflowSlotAssetsImpl({ canvasItemsRef, canvasSelectedIdsRef, getCanvasWorkflowSlotAssetFromCanvasItem, itemsRef, selectedIds }, excludeId); };

  const assignSelectedImagesToCanvasWorkflowSlot = (
    moduleId: string,
    slotId: string,
    expandedNodeId?: string,
  ) => { return assignSelectedImagesToCanvasWorkflowSlotImpl({ canvasItemsRef, findCanvasWorkflowSlot, getSelectedCanvasWorkflowSlotAssets, replaceCanvasWorkflowSlotAssets, searchInputRef, setCanvasSearchCandidateLimit, setCanvasWorkflowSlotPickTarget, setIsSearchActive, showToast }, moduleId, slotId, expandedNodeId); };

  const assignDrawerImageToCanvasWorkflowSlot = (
    target: NonNullable<typeof canvasWorkflowSlotPickTarget>,
    item: BufferItem,
  ) => { return assignDrawerImageToCanvasWorkflowSlotImpl({ canvasItemsRef, findCanvasWorkflowSlot, replaceCanvasWorkflowSlotAssets, setCanvasWorkflowSlotPickTarget, showToast }, target, item); };

  const chooseLocalImagesForCanvasWorkflowSlot = (
    moduleId: string,
    slotId: string,
    expandedNodeId?: string,
  ) => {
    pendingCanvasWorkflowSlotUploadRef.current = { moduleId, slotId, expandedNodeId };
    setCanvasInputMenuForId(null);
    canvasUploadInputRef.current?.click();
  };

  const handleCanvasWorkflowSlotDrop = async (
    event: React.DragEvent<HTMLElement>,
    moduleId: string,
    slotId: string,
    expandedNodeId?: string,
  ) => { return handleCanvasWorkflowSlotDropImpl({ canvasItemsRef, clearDrawerItemDragState, createCanvasImageItemFromFile, findCanvasWorkflowSlot, getDraggedDrawerItemId, itemsRef, replaceCanvasWorkflowSlotAssets, showToast }, event, moduleId, slotId, expandedNodeId); };

  const chooseLocalImagesForCanvasGenerator = (targetId: string) => { return chooseLocalImagesForCanvasGeneratorImpl({ canReplaceCanvasImageReferenceForTarget, canvasItemsRef, canvasReferenceReplaceTargetRef, canvasUploadInputRef, chooseLocalVideosForCanvasGenerator, pendingCanvasFusionRoleRef, pendingCanvasFusionUploadRoleRef, pendingCanvasReferenceUploadReplaceRef, pendingCanvasUploadTargetIdRef, setCanvasInputMenuForId }, targetId); };

  const handleCanvasGeneratorUpload = async (event: React.ChangeEvent<HTMLInputElement>) => { return handleCanvasGeneratorUploadImpl({ appendCanvasItems, canvasItemsRef, connectCanvasItemsToGenerator, createCanvasImageItemFromFile, findCanvasWorkflowSlot, pendingCanvasFusionRoleRef, pendingCanvasFusionUploadRoleRef, pendingCanvasReferenceUploadReplaceRef, pendingCanvasUploadTargetIdRef, pendingCanvasWorkflowSlotUploadRef, replaceCanvasGeneratorReference, replaceCanvasWorkflowSlotAssets, showToast }, event); };

  const chooseLocalFilesForCanvasWorkflow = (targetId: string) => { return chooseLocalFilesForCanvasWorkflowImpl({ canvasItemsRef, canvasWorkflowFileInputRef, pendingCanvasWorkflowFileTargetIdRef, setCanvasInputMenuForId, showToast }, targetId); };

  const handleCanvasWorkflowFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => { return handleCanvasWorkflowFileUploadImpl({ appendCanvasItems, canvasItemsRef, connectCanvasItemsToGenerator, createAssetId, makeCanvasNodeId, pendingCanvasWorkflowFileTargetIdRef }, event); };

  const chooseLocalVideosForCanvasGenerator = async (targetId: string) => { return chooseLocalVideosForCanvasGeneratorImpl({ appendCanvasItems, canvasItemsRef, connectCanvasItemsToGenerator, createCanvasVideoItemFromPath, showToast }, targetId); };

  const chooseLocalAudiosForCanvasGenerator = async (targetId: string) => { return chooseLocalAudiosForCanvasGeneratorImpl({ appendCanvasItems, canvasAiCloudImageModels, canvasAiCredentialSource, canvasItemsRef, connectCanvasItemsToGenerator, createCanvasAudioItemFromPath, showToast }, targetId); };

  const startPickCanvasImageForGenerator = (targetId: string) => { return startPickCanvasImageForGeneratorImpl({ canvasAiCloudImageModels, canvasAiCredentialSource, canvasItemsRef, setCanvasContextMenu, setCanvasInputMenuForId, setCanvasInputPickTargetId, showToast, updateCanvasSelection }, targetId); };

  const pickCanvasImageForGenerator = (sourceId: string, targetId: string) => { return pickCanvasImageForGeneratorImpl({ canReplaceCanvasImageReferenceForTarget, canvasAiCloudImageModels, canvasAiCredentialSource, canvasItemsRef, canvasReferenceReplaceTargetRef, connectCanvasItems, replaceCanvasGeneratorReference, setCanvasInputPickTargetId, showToast }, sourceId, targetId); };

  const startCanvasConnectionDrag = (event: React.PointerEvent, sourceId: string) => { return startCanvasConnectionDragImpl({ CANVAS_CONNECTION_HANDLE_OUTSET, autoScrollCanvasNearEdge, canvasConnectionDragRef, canvasItemsRef, canvasSelectedIdsRef, connectCanvasItems, connectCanvasItemsToGenerator, getCanvasItemRenderedBox, getCanvasPointFromClient, setCanvasConnectionDraft, setCanvasContextMenu, setCanvasInteractionActive }, event, sourceId); };

  const startCanvasInputActionDrag = (event: React.PointerEvent, targetId: string) => { return startCanvasInputActionDragImpl({ CANVAS_CONNECTION_HANDLE_OUTSET, autoScrollCanvasNearEdge, canvasConnectionDraft, canvasInputActionDragRef, canvasItemsRef, getCanvasItemRenderedBox, getCanvasPointFromClient, setCanvasContextMenu, setCanvasInputActionDraft, setCanvasInputMenuForId, setCanvasInteractionActive }, event, targetId); };

  const disconnectCanvasInput = (targetId: string, inputId: string) => { return disconnectCanvasInputImpl({ pushCanvasUndoSnapshot, removeCanvasConnection, updateCanvasItemsImmediate }, targetId, inputId); };

  const startCanvasReferenceLongPress = (
    event: React.PointerEvent<HTMLElement>,
    targetId: string,
    inputId: string,
    previewSource: string,
    inputIndex: number,
    rotation: 0 | 90 | 180 | 270,
  ) => { return startCanvasReferenceLongPressImpl({ canReplaceCanvasImageReferenceForTarget, canvasItemsRef, canvasReferenceLongPressRef, canvasReferenceSuppressClickRef, pushCanvasUndoSnapshot, setCanvasInputMenuForId, setCanvasReferenceDragState, setCanvasReferenceReplacement, showToast, updateCanvasItemsImmediate }, event, targetId, inputId, previewSource, inputIndex, rotation); };

  const getCanvasAiRerunNodePosition = (source: CanvasImageItem) => { return getCanvasAiRerunNodePositionImpl({ canvasItemsRef, canvasRectsIntersect }, source); };

  const cloneCanvasAiGeneratorForRerun = (source: CanvasImageItem) => { return cloneCanvasAiGeneratorForRerunImpl({ createAssetId, getCanvasAiRerunNodePosition, makeCanvasNodeId }, source); };

  const runCanvasAiGeneratorTarget = async (
    target: CanvasImageItem,
    options: {
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
    }
  ) => { return runCanvasAiGeneratorTargetImpl({ AI_GENERATED_VIDEO_FOLDER_NAME, activeCanvasIdRef, addGeneratedImagesToDrawer, addGeneratedVideosToDrawer, cacheCanvasGeneratedImageSource, canvasAiApiKey, canvasAiApiProvider, canvasAiCloudImageModels, canvasAiCredentialSource, canvasAiEndpoint, canvasAiHeadersText, canvasAiNewApiVideoKey, canvasAiProvider, canvasAiUnifiedImageModelOptions, canvasItemsRef, canvasesRef, createCanvasAiOutputDrafts, createCanvasImagePreviewThumbnail, effectiveCanvasAiApiProvider, effectiveCanvasAiEndpoint, effectiveCanvasAiGatewayKind, effectiveCanvasAiModel, effectiveCanvasAiProvider, getCanvasAiErrorSummary, getCanvasAiResolvedModel, getCanvasImageInputBufferItemsForNode, getCanvasImageInputsForNode, getCanvasTextInputsForNode, isCanvasAiLicenseManaged, notifyCanvasAiGenerationResult, pushDrawerUndoSnapshot, refreshCloudAccount, setCanvasAiOutputSourceRecoveryTick, showToast, stopTemporaryReferenceShares, updateDrawerItemsDeferred }, target, options); };

  const getFrameInterpolationVideoInput = (target: CanvasImageItem) => { return getFrameInterpolationVideoInputImpl({ canvasItemsRef }, target); };

  const getFrameInterpolationEstimateKey = (target: CanvasImageItem, source: string) => { return getFrameInterpolationEstimateKeyImpl({}, target, source); };

  useEffect(() => { return runCanvasGenerationEffect01({ canvasItems, canvasItemsRef, getFrameInterpolationEstimateKey, getFrameInterpolationVideoInput, isCanvasMode, updateCanvasAiGeneratorData }); }, [canvasItems, isCanvasMode]);

  const runCanvasFrameInterpolationNode = async (targetId: string) => { return runCanvasFrameInterpolationNodeImpl({ AI_GENERATED_VIDEO_FOLDER_NAME, addGeneratedVideosToDrawer, canvasItemsRef, getCanvasAiErrorSummary, getFrameInterpolationVideoInput, showToast, updateCanvasAiGeneratorData, updateCanvasSelection }, targetId); };

  const getCanvasEnhancementInput = (target: CanvasImageItem) => { return getCanvasEnhancementInputImpl({ canvasItemsRef }, target); };

  const getEnhancementQualityKey = (target: CanvasImageItem, source: string) => [
    source,
    target.ai?.type || 'image-enhancement',
    clamp(Math.round(Number(target.ai?.enhancementScale) || 2), 2, 4),
    target.ai?.enhancementMode || 'general',
    target.ai?.enhancementResizeMode || 'upscale',
    String(target.ai?.outputFormat || (getCanvasAiMediaType(target.ai) === 'video' ? 'mp4' : 'png')).toLowerCase(),
  ].join('|');
  const getEnhancementEstimateKey = (target: CanvasImageItem, source: string) => [
    'sample-benchmark-v4',
    getEnhancementQualityKey(target, source),
  ].join('|');

  const cancelCanvasEnhancementEstimate = async (canvasId: string) => { return cancelCanvasEnhancementEstimateImpl({ canvasItemsRef }, canvasId); };

  useEffect(() => { return runCanvasGenerationEffect02({ canvasItems, canvasItemsRef, getCanvasAiErrorSummary, getCanvasEnhancementInput, getEnhancementEstimateKey, isCanvasMode, updateCanvasAiGeneratorData }); }, [canvasItems, isCanvasMode]);

  const runCanvasEnhancementNode = async (targetId: string) => { return runCanvasEnhancementNodeImpl({ activeCanvasIdRef, addGeneratedImagesToDrawer, addGeneratedVideosToDrawer, canvasItemsRef, createCanvasImagePreviewThumbnail, getCanvasAiErrorSummary, getCanvasEnhancementInput, showToast, updateCanvasAiGeneratorData, updateCanvasSelection }, targetId); };

  const runCanvasAiGeneratorNode = async (targetId: string) => { return runCanvasAiGeneratorNodeImpl({ activeCanvasIdRef, canvasAiRunTokensRef, canvasItemsRef, canvasSessionItemsRef, commitCanvasAiPromptDraft, getCanvasSessionItems, isCanvasModeRef, markCanvasRunNodeActive, markCanvasRunNodeSettled, runCanvasAiGeneratorTarget, showToast, updateCanvasAiGeneratorDataForCanvas, updateCanvasSelection, waitForCanvasBackgroundPatches }, targetId); };

  useEffect(() => { return runCanvasGenerationEffect03({ canvasAiRunTokensRef, canvasItemsRef, isCanvasMode, showToast, updateCanvasAiGeneratorData }); }, [isCanvasMode]);

  const generateCanvasAiGeneratorNode = async (targetId: string) => { return generateCanvasAiGeneratorNodeImpl({ activeCanvasIdRef, appendCanvasItems, canvasAiRunTokensRef, canvasItemsRef, cloneCanvasAiGeneratorForRerun, commitCanvasAiPromptDraft, runCanvasAiGeneratorNode, runCanvasEnhancementNode, runCanvasExpandedWorkflowFromNode, runCanvasFrameInterpolationNode, runCanvasTextAgentNode, showToast }, targetId); };

  const growCanvasNearViewportEdge = (surface = canvasSurfaceRef.current) => { return growCanvasNearViewportEdgeImpl({ canvasScaleRef, canvasSizeRef, isCanvasZoomingRef, scheduleCanvasStateSave, setCanvasSizeImmediate }, surface); };

  const runCanvasExpandedWorkflowFromNode = async (targetId: string) => { return runCanvasExpandedWorkflowFromNodeImpl({ activeCanvasIdRef, canvasItemsRef, canvasSessionItemsRef, getCanvasSessionItems, getCanvasWorkflowExpandedGroupItems, getCanvasWorkflowGroupItemIdsForSelection, markCanvasRunNodeActive, markCanvasRunNodeSettled, notifyCanvasAiGenerationResult, pushCanvasUndoSnapshot, runCanvasAiGeneratorTarget, runCanvasTextAgentTarget, showToast, updateCanvasAiGeneratorDataForCanvas, updateCanvasItemsImmediate, updateCanvasNodeForCanvas, updateCanvasSelection, waitForCanvasBackgroundPatches }, targetId); };

  const retryCanvasExpandedWorkflowOutput = async (
    targetId: string,
    outputIndex: number,
  ) => { return retryCanvasExpandedWorkflowOutputImpl({ activeCanvasIdRef, applyCanvasAiGeneratorDataPatch, canvasAiRunTokensRef, canvasItemsRef, canvasSessionItemsRef, createCanvasAiOutputDrafts, getCanvasSessionItems, markCanvasRunNodeActive, markCanvasRunNodeSettled, pushCanvasUndoSnapshot, runCanvasAiGeneratorTarget, showToast, updateCanvasNodeForCanvas, waitForCanvasBackgroundPatches }, targetId, outputIndex); };

  const retryCanvasCollapsedWorkflowOutput = async (
    moduleId: string,
    visibleOutputIndex: number,
  ) => { return retryCanvasCollapsedWorkflowOutputImpl({ activeCanvasIdRef, canvasAiRunTokensRef, canvasItemsRef, canvasSessionItemsRef, commitCanvasAiPromptDraft, createCanvasAiOutputDrafts, getCanvasSessionItems, hydrateCanvasWorkflowSlotAssetsFromDrawer, instantiateCanvasWorkflowTemplateItems, markCanvasRunNodeActive, markCanvasRunNodeSettled, pushCanvasUndoSnapshot, runCanvasAiGeneratorTarget, showToast, updateCanvasAiGeneratorDataForCanvas, waitForCanvasBackgroundPatches }, moduleId, visibleOutputIndex); };

  const retryCanvasWorkflowOutput = async (
    canvasItemId: string,
    outputIndex: number,
  ) => { return retryCanvasWorkflowOutputImpl({ canvasItemsRef, retryCanvasCollapsedWorkflowOutput, retryCanvasExpandedWorkflowOutput }, canvasItemId, outputIndex); };

  const cloneCanvasWorkflowModuleForRerun = (source: CanvasImageItem): CanvasImageItem | null => { return cloneCanvasWorkflowModuleForRerunImpl({ buildCanvasWorkflowModuleNode, getCanvasAiRerunNodePosition }, source); };

  const runCanvasWorkflowModuleNode = async (targetId: string) => { return runCanvasWorkflowModuleNodeImpl({ activeCanvasIdRef, canvasAiRunTokensRef, canvasItemsRef, canvasSessionItemsRef, commitCanvasAiPromptDraft, foldersRef, getCanvasAiErrorSummary, getCanvasSessionItems, hydrateCanvasWorkflowSlotAssetsFromDrawer, instantiateCanvasWorkflowTemplateItems, isCanvasModeRef, itemsRef, markCanvasRunNodeActive, markCanvasRunNodeSettled, notifyCanvasAiGenerationResult, runCanvasAiGeneratorTarget, runCanvasTextAgentTarget, showToast, updateCanvasAiGeneratorDataForCanvas, updateCanvasSelection, waitForCanvasBackgroundPatches, workflowResultPublisherRef }, targetId); };

  const generateCanvasWorkflowModuleNode = async (targetId: string) => { return generateCanvasWorkflowModuleNodeImpl({ appendCanvasItems, canvasItemsRef, cloneCanvasWorkflowModuleForRerun, commitCanvasAiPromptDraft, runCanvasWorkflowModuleNode, showToast }, targetId); };

  const runSelectedCanvasWorkflowModules = async (seedIds = canvasSelectedIdsRef.current) => { return runSelectedCanvasWorkflowModulesImpl({ canvasItemsRef, generateCanvasWorkflowModuleNode, showToast }, seedIds); };

  const addCanvasTemplateValuesAtDrop = async (
    rawValues: unknown[],
    client?: { x: number; y: number },
    options: { immediate?: boolean } = {},
  ) => { return addCanvasTemplateValuesAtDropImpl({ appendCanvasItems: options.immediate ? appendCanvasItemsSynchronously : appendCanvasItems, buildCanvasAiGeneratorNode, buildCanvasWorkflowModuleNode, canvasWorkflowTemplates, getCanvasDropPosition, getCanvasTemplateImportPayload, getSelectedCanvasAiInputIds, materializeImportedCanvasWorkflows, setCustomCanvasAiPromptPresets, setCustomCanvasWorkflows, updateCanvasNodesForPreset }, rawValues, client); };

  const addCanvasDroppedTemplateJsonSources = async (
    sources: Array<{ name: string; read: () => Promise<unknown> }>,
    client?: { x: number; y: number },
  ) => { return addCanvasDroppedTemplateJsonSourcesImpl({ addCanvasTemplateValuesAtDrop, showToast }, sources, client); };

  const addCanvasDroppedFiles = async (files: FileList | File[], client?: { x: number; y: number }) => { return addCanvasDroppedFilesImpl({ addCanvasImageItems, createCanvasImageItemFromFile, createCanvasVideoItemFromPath, lastCanvasDropAtRef, lastCanvasDroppedPathsKeyRef }, files, client); };

  const addCanvasDroppedPaths = async (paths: string[], client?: { x: number; y: number }) => { return addCanvasDroppedPathsImpl({ addCanvasDroppedTemplateJsonSources, addCanvasImageItems, createCanvasImageItemFromPath, createCanvasVideoItemFromPath, lastCanvasDropAtRef, lastCanvasDroppedPathsKeyRef, showToast }, paths, client); };

  const createDrawerMediaCanvasNode = async (
    itemId: string,
    client?: { x: number; y: number },
    options: { reuseExisting?: boolean; select?: boolean; toast?: boolean; label?: string; dropIndex?: number } = {},
  ) => { return createDrawerMediaCanvasNodeImpl({ appendCanvasItems, assetStorageMode, canvasItemsRef, createAssetId, getCanvasDropPosition, itemsRef, makeCanvasNodeId, showToast }, itemId, client, options); };

  const createWorkflowAttachmentImageCanvasNode = async (
    reference: AgentCanvasVisualReference,
    options: { select?: boolean; label?: string } = {},
  ) => { return createWorkflowAttachmentImageCanvasNodeImpl({ appendCanvasItems, createAssetId, ensureImageThumbnail, getCanvasDropPosition, makeCanvasNodeId, showToast }, reference, options); };

  const addDrawerMediaItemToCanvas = async (itemId: string, client?: { x: number; y: number }) => {
    const nodeId = await createDrawerMediaCanvasNode(itemId, client, { toast: true });
    return !!nodeId;
  };

  const addCanvasSearchMediaCandidate = async (itemId: string) => { return addCanvasSearchMediaCandidateImpl({ canvasSearchAddingIdsRef, canvasSearchDropIndexRef, createDrawerMediaCanvasNode, showToast }, itemId); };

  const getFolderMediaItemsForCanvas = (folderId?: string) => {
    const folderScopeIds = getDrawerFolderScopeIds(folders, folderId);
    return items
      .filter(isCanvasDrawerMediaItem)
      .filter(item => (
        folderId ? !!item.folderId && folderScopeIds.has(item.folderId) : !item.folderId
      ));
  };

  const closeCanvasFolderMediaPicker = () => { return closeCanvasFolderMediaPickerImpl({ CANVAS_FOLDER_PICKER_INITIAL_VISIBLE, canvasFolderPickerItemsRef, canvasFolderPickerLoadingRef, canvasFolderPickerRequestRef, setCanvasFolderImportPrompt, setCanvasFolderPickerError, setCanvasFolderPickerHasMore, setCanvasFolderPickerItems, setCanvasFolderPickerTotal, setCanvasFolderPickerVisibleCount, setIsCanvasFolderPickerLoading }); };

  const loadCanvasFolderMediaPage = async (folderId?: string, reset = false) => { return loadCanvasFolderMediaPageImpl({ assetStorageMode, canvasFolderPickerItemsRef, canvasFolderPickerLoadingRef, canvasFolderPickerPagingRef, canvasFolderPickerRequestRef, closeCanvasFolderMediaPicker, folders, getFolderMediaItemsForCanvas, setCanvasFolderImportPrompt, setCanvasFolderPickerError, setCanvasFolderPickerHasMore, setCanvasFolderPickerItems, setCanvasFolderPickerTotal, setIsCanvasFolderPickerLoading, showToast }, folderId, reset); };

  const requestAddFolderMediaToCanvas = (folderId?: string, folderName = '主抽屉', anchor?: { x: number; y: number }) => { return requestAddFolderMediaToCanvasImpl({ CANVAS_FOLDER_PICKER_INITIAL_VISIBLE, loadCanvasFolderMediaPage, setCanvasFolderImportPrompt, setCanvasFolderPickerVisibleCount }, folderId, folderName, anchor); };

  const addFolderMediaToCanvas = async (mediaItems: BufferItem[]) => { return addFolderMediaToCanvasImpl({ appendCanvasItems, createAssetId, getCanvasDropPosition, makeCanvasNodeId, showToast }, mediaItems); };

  const confirmAddFolderMediaToCanvas = () => {
    if (!canvasFolderImportPrompt) return;
    const loadedMediaItems = canvasFolderPickerItemsRef.current;
    closeCanvasFolderMediaPicker();
    void addFolderMediaToCanvas(loadedMediaItems);
  };

  const addFolderMediaPickerItemToCanvas = (itemId: string) => {
    closeCanvasFolderMediaPicker();
    void addDrawerMediaItemToCanvas(itemId);
  };

  const cacheWebImageFromCandidates = async (
    urls: string[],
    name: string,
    dir?: string,
  ) => { return cacheWebImageFromCandidatesImpl({}, urls, name, dir); };

  const getWebCaptureSourceSite = (pageUrl?: string) => {
    if (!pageUrl) return undefined;
    try {
      return new URL(pageUrl).hostname || undefined;
    } catch {
      return undefined;
    }
  };

  const getPersistentWebSourceUrl = (value?: string) => {
    const normalized = normalizeDraggedUrl(value || '');
    return /^https?:\/\//i.test(normalized) ? normalized : undefined;
  };

  const claimExternalWebImageDrop = (
    normalizedUrl: string,
    itemId: string,
    location: 'drawer' | 'canvas',
  ) => { return claimExternalWebImageDropImpl({ lastAcceptedWebImageRef, lastWebImageDropAtRef, lastWebImageUrlRef, setItems, supersededWebImageItemIdsRef, updateCanvasItemsImmediate }, normalizedUrl, itemId, location); };

  const addCanvasWebImageUrl = async (
    url: string,
    name?: string,
    client?: { x: number; y: number },
    fallbackUrls: string[] = [],
    captureMetadata: WebImageCaptureMetadata = {},
  ) => { return addCanvasWebImageUrlImpl({ appendCanvasItems, cacheWebImageFromCandidates, claimExternalWebImageDrop, createAssetId, getCanvasDropPosition, getPersistentWebSourceUrl, getWebCaptureSourceSite, makeCanvasNodeId, showToast, supersededWebImageItemIdsRef, updateCanvasItemsImmediate, webImageCacheDirRef }, url, name, client, fallbackUrls, captureMetadata); };

  const enterCanvasMode = () => { return enterCanvasModeImpl({ canvasItemsRef, canvasReturnScrollRef, canvasSurfaceRef, getCanvasPrimaryImageItem, isCanvasModeRef, isPinnedRef, scheduleCanvasFocusItemById, setActiveFolderId, setActiveTab, setDrawerState, setIsCanvasMode, setIsOpen, setIsPinned, setIsSearchActive, setIsSelectMode, setSelectedIds, setShowSettings, setShowTextInput, showToast, writeCanvasSurfaceScroll }); };

  const handleInspirationSpaceAddToCanvas = useEventCallback(async (share: InspirationShare, payload: unknown) => {
    if (!share?.id) throw new Error('灵感资源信息不完整');
    if (!isCanvasModeRef.current) enterCanvasMode();

    if (share.kind === 'PROMPT') {
      if (!isPromptSharePayload(payload)) throw new Error('提示词资源内容无法识别');
      const prompt = payload.prompt.trim();
      if (!prompt) throw new Error('提示词资源内容为空');
      const basePromptNode = buildCanvasAiGeneratorNode(getCanvasDropPosition(0), undefined, []);
      const promptNode: CanvasImageItem = {
        ...basePromptNode,
        item: {
          ...basePromptNode.item,
          name: `AI ${share.title}`,
          content: prompt,
        },
        ai: basePromptNode.ai ? {
          ...basePromptNode.ai,
          prompt,
          presetId: undefined,
          presetLabel: undefined,
          presetPrompt: undefined,
          imagePolicy: createCanvasImagePolicy({
            hasReferenceImage: false,
            prompt,
          }),
        } : undefined,
      };
      const addedPromptNode = appendCanvasItemsSynchronously([promptNode], `添加社区提示词「${share.title}」`);
      if (addedPromptNode === 0) throw new Error('提示词节点未能添加到画布');
      return `已将填写好提示词的生图节点添加到画布`;
    }

    const parsed = getCanvasTemplateImportPayload(payload);
    let createdCount = 0;
    if (parsed.presets.length > 0 || parsed.workflows.length > 0) {
      const result = await addCanvasTemplateValuesAtDrop([payload], undefined, { immediate: true });
      if (!result.recognized || result.created === 0) throw new Error('资源已识别，但没有生成可用的画布节点');
      createdCount += result.created;
    }

    if (parsed.workflowInstances.length > 0) {
      const usedWorkflowIds = new Set(canvasWorkflowTemplates.map(workflow => workflow.id));
      const restoredInstances: Array<{ workflow: CanvasWorkflowTemplate; runtime: CanvasWorkflowRuntime }> = [];
      for (let index = 0; index < parsed.workflowInstances.length; index += 1) {
        const candidate = parsed.workflowInstances[index];
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
          nextId = `community-workflow-${share.id}-${index}-${Math.random().toString(36).slice(2, 6)}`;
        } while (usedWorkflowIds.has(nextId));
        usedWorkflowIds.add(nextId);
        restoredInstances.push({
          workflow: {
            ...restored.workflow,
            id: nextId,
            label: restored.workflow.label || share.title,
            builtin: false,
            createdAt: Date.now() + index,
          },
          runtime: restored.runtime,
        });
      }
      setCustomCanvasWorkflows(prev => [
        ...restoredInstances.map(instance => instance.workflow),
        ...prev,
      ].slice(0, 48));
      const base = getCanvasDropPosition(0);
      const modules = restoredInstances.flatMap((instance, index) => {
        const module = buildCanvasWorkflowModuleNode(instance.workflow, {
          x: base.x + index * 52,
          y: base.y + index * 52,
        });
        if (!module?.ai) return [];
        return [{
          ...module,
          ai: { ...module.ai, workflowRuntime: instance.runtime },
        }];
      });
      createdCount += appendCanvasItemsSynchronously(modules, `添加社区工作流「${share.title}」`);
    }

    if (createdCount === 0) throw new Error('没有识别到可添加的节点预设或工作流');
    return `已将「${share.title}」添加到画布`;
  });

  const addInspirationSpaceShareAndReturnToCanvas = useEventCallback(async (
    share: InspirationShare,
    payload: unknown,
  ) => {
    const message = await handleInspirationSpaceAddToCanvas(share, payload);
    showToast(message);
    return message;
  });

  const clearMainDrawerLongPress = () => {
    if (mainDrawerLongPressTimerRef.current !== null) {
      window.clearTimeout(mainDrawerLongPressTimerRef.current);
      mainDrawerLongPressTimerRef.current = null;
    }
  };

  const startMainDrawerLongPress = (e: React.PointerEvent) => { return startMainDrawerLongPressImpl({ clearMainDrawerLongPress, enterCanvasMode, isCanvasModeRef, mainDrawerLongPressTimerRef, mainDrawerLongPressTriggeredRef, requestExitCanvasMode }, e); };

  const finishMainDrawerPress = () => {
    clearMainDrawerLongPress();
    window.setTimeout(() => {
      mainDrawerLongPressTriggeredRef.current = false;
    }, 0);
  };

  const startCanvasItemDrag = (e: React.PointerEvent, id: string) => { return startCanvasItemDragImpl({ CANVAS_INTERACTION_BACKGROUND_SETTLE_MS, CANVAS_INTERACTION_DEBUG, applyCanvasSelectionDomFeedback, autoScrollCanvasNearEdge, cancelCanvasImageSourceUpgradeQueue, cancelCanvasInteractionPaint, canvasContentRef, canvasDragDebugRef, canvasDragRef, canvasInputPickTargetIdRef, canvasItemsPatchCommitRef, canvasItemsRef, canvasPointerInteractionCleanupRef, canvasResizeRef, canvasScaleRef, canvasSelectedIdsRef, canvasSurfaceRef, clearCanvasItemInteractionStyles, expandCanvasSelectionIdsWithGroups, getCanvasItemElement, getCanvasSelectionIdsForItem, growCanvasToFit, isCanvasSpacePressedRef, makeCanvasItemBoxMap, markCanvasNodesChanged, pickCanvasImageForGenerator, pushCanvasUndoSnapshot, restoreCanvasItemBoxStyles, scheduleCanvasInteractionPaint, scheduleCanvasSelectionImageSources, setCanvasInteractionActive, setCanvasItemDraggingFlag, setCanvasSelectedIds, settleCanvasZoomBeforePointerInteraction, updateCanvasItemsDeferred }, e, id); };

  const startCanvasItemResize = (e: React.PointerEvent, id: string, corner: CanvasResizeCorner) => { return startCanvasItemResizeImpl({ CANVAS_INTERACTION_BACKGROUND_SETTLE_MS, cancelCanvasInteractionPaint, canvasItemsPatchCommitRef, canvasItemsRef, canvasPointerInteractionCleanupRef, canvasResizeRef, canvasScaleRef, canvasSelectedIdsRef, clearCanvasItemInteractionStyles, getCanvasItemRenderedBox, growCanvasToFit, markCanvasNodesChanged, pushCanvasUndoSnapshot, restoreCanvasItemBoxStyles, scheduleCanvasInteractionPaint, setCanvasInteractionActive, setCanvasItemResizingFlag, settleCanvasZoomBeforePointerInteraction, updateCanvasItemsDeferred, updateCanvasSelection }, e, id, corner); };

  const startCanvasGroupResize = (e: React.PointerEvent, corner: CanvasResizeCorner) => { return startCanvasGroupResizeImpl({ CANVAS_INTERACTION_BACKGROUND_SETTLE_MS, cancelCanvasInteractionPaint, canvasGroupResizeRef, canvasItemsPatchCommitRef, canvasItemsRef, canvasPointerInteractionCleanupRef, canvasScaleRef, canvasSelectedIdsRef, clearCanvasItemInteractionStyles, getCanvasItemRenderedBox, growCanvasToFit, markCanvasNodesChanged, pushCanvasUndoSnapshot, restoreCanvasItemBoxStyles, scheduleCanvasInteractionPaint, setCanvasInteractionActive, setCanvasItemResizingFlag, settleCanvasZoomBeforePointerInteraction, updateCanvasItemsDeferred }, e, corner); };

  const startCanvasSelection = (e: React.PointerEvent<HTMLDivElement>) => { return startCanvasSelectionImpl({ CANVAS_INTERACTION_BACKGROUND_SETTLE_MS, autoScrollCanvasNearEdge, cancelCanvasImageSourceUpgradeQueue, cancelCanvasInteractionPaint, canvasItemsRef, canvasRectsIntersect, canvasSelectedIdsRef, canvasSelectionDragRef, canvasViewportRef, getCanvasPointFromClient, hideCanvasSelectionOverlay, isCanvasSpacePressedRef, normalizeCanvasSelectionBox, scheduleCanvasInteractionPaint, setCanvasInteractionActive, updateCanvasSelection }, e); };

  const releaseCanvasScrollWriteGuard = () => {
    if (canvasScrollWriteFrameRef.current !== null) {
      cancelAnimationFrame(canvasScrollWriteFrameRef.current);
    }
    canvasScrollWriteFrameRef.current = requestAnimationFrame(() => {
      canvasScrollWriteFrameRef.current = null;
      canvasScrollWriteGuardRef.current = false;
    });
  };

  const writeCanvasSurfaceScroll = (
    surface: HTMLDivElement,
    left: number,
    top: number,
    updateLock = true
  ) => { return writeCanvasSurfaceScrollImpl({ canvasPanRef, canvasScrollLockRef, canvasScrollWriteGuardRef, canvasStateSaveDeferredDuringZoomRef, isCanvasInteractingRef, isCanvasZoomingRef, releaseCanvasScrollWriteGuard, scheduleCanvasStateSave }, surface, left, top, updateLock); };

  const clampCanvasSurfaceScroll = (
    surface: HTMLDivElement,
    left: number,
    top: number,
    scale = canvasScaleRef.current || 1,
    size = canvasSizeRef.current
  ) => { return clampCanvasSurfaceScrollImpl({}, surface, left, top, scale, size); };

  const centerCanvasItemInView = (canvasItem?: CanvasImageItem | null, options: { select?: boolean } = {}) => { return centerCanvasItemInViewImpl({ canvasReturnScrollRef, canvasScaleRef, canvasSurfaceRef, growCanvasToFit, updateCanvasSelection, writeCanvasSurfaceScroll }, canvasItem, options); };

  const fitCanvasViewToItems = (ids?: string[]) => { return fitCanvasViewToItemsImpl({ applyCanvasScaleStyles, beginCanvasZoomInteraction, canvasItemsRef, canvasScaleRef, canvasSizeRef, canvasSurfaceRef, commitCanvasScaleSoon, getCanvasBoundsFromItems, growCanvasToFit, writeCanvasSurfaceScroll }, ids); };

  const focusCanvasItemById = (id?: string | null) => {
    if (!id) return false;
    return centerCanvasItemInView(canvasItemsRef.current.find(item => item.id === id), { select: true });
  };

  const scheduleCanvasFocusItemById = (id?: string | null) => { return scheduleCanvasFocusItemByIdImpl({ canvasPanRef, focusCanvasItemById, isCanvasInteractingRef, isCanvasModeRef, isCanvasZoomingRef, pendingCanvasFocusItemIdRef }, id); };

  const scheduleCanvasFocusNearestContentIfViewportEmpty = (canvasId: string) => { return scheduleCanvasFocusNearestContentIfViewportEmptyImpl({ activeCanvasIdRef, canvasItemsRef, canvasPanRef, canvasSurfaceRef, centerCanvasItemInView, isCanvasInteractingRef, isCanvasModeRef, isCanvasZoomingRef, readCanvasViewportRect }, canvasId); };

  const startCanvasPan = (e: React.PointerEvent<HTMLDivElement>) => { return startCanvasPanImpl({ CANVAS_INTERACTION_BACKGROUND_SETTLE_MS, canvasPanCleanupRef, canvasPanRef, canvasScaleRef, canvasScrollLockRef, canvasSurfaceRef, expandCanvasBeforeViewport, growCanvasNearViewportEdge, growCanvasToFit, isCanvasSpacePressedRef, pendingCanvasFocusItemIdRef, scheduleCanvasStateSave, scheduleCanvasViewportUpdate, setCanvasInteractionActive, writeCanvasSurfaceScroll }, e); };

  const zoomCanvasAt = (clientX: number, clientY: number, deltaY: number) => { return zoomCanvasAtImpl({ applyCanvasScaleStyles, beginCanvasZoomInteraction, canvasScaleRef, canvasSizeRef, canvasSurfaceRef, canvasVisualViewportRef, commitCanvasScaleSoon, growCanvasToFit }, clientX, clientY, deltaY); };

  const scheduleCanvasWheelZoom = (clientX: number, clientY: number, deltaY: number) => { return scheduleCanvasWheelZoomImpl({ canvasWheelZoomFrameRef, canvasWheelZoomPayloadRef, zoomCanvasAt }, clientX, clientY, deltaY); };

  const normalizeCanvasWheelDelta = (event: { deltaY: number; deltaMode: number }) => { return normalizeCanvasWheelDeltaImpl({ canvasSurfaceRef }, event); };

  const getCanvasNestedWheelScroller = (surface: HTMLDivElement, targetValue: EventTarget | null, deltaY: number) => { return getCanvasNestedWheelScrollerImpl({}, surface, targetValue, deltaY); };

  const shouldBlockCanvasWheelZoomTarget = (targetValue: EventTarget | null) => {
    const target = targetValue instanceof Element ? targetValue : null;
    if (!target) return false;
    return !!target.closest('textarea, input, [contenteditable="true"], [data-canvas-wheel-scroll="true"]');
  };

  useEffect(() => { return runCanvasInteractionsEffect01({ canvasSurfaceRef, getCanvasNestedWheelScroller, isCanvasMode, normalizeCanvasWheelDelta, scheduleCanvasWheelZoom, shouldBlockCanvasWheelZoomTarget }); }, [isCanvasMode]);

  useEffect(() => { return runCanvasInteractionsEffect02({ canvasPanRef, canvasScrollLockRef, canvasScrollWriteGuardRef, canvasStateSaveDeferredDuringZoomRef, canvasSurfaceRef, canvasViewportDeferredDuringZoomRef, growCanvasNearViewportEdge, isCanvasMode, isCanvasSpacePressedRef, isCanvasZoomingRef, scheduleCanvasStateSave, scheduleCanvasViewportUpdate, writeCanvasSurfaceScroll }); }, [isCanvasMode]);

  const handleCanvasDrop = async (e: React.DragEvent<HTMLDivElement>) => { return handleCanvasDropImpl({ addCanvasDroppedFiles, addCanvasDroppedPaths, addCanvasWebImageUrl, addDrawerMediaItemToCanvas, clearDrawerItemDragState, getDraggedDrawerItemId, lastCanvasDragClientRef, showToast }, e); };

  const blockInternalCanvasNativeDrag = (e: React.DragEvent<HTMLDivElement>) => {
    const eventTarget = e.target as HTMLElement | null;
    if (!eventTarget?.closest('[data-canvas-item-id]')) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const leaveCanvasToDrawer = () => { return leaveCanvasToDrawerImpl({ canvasItemsRef, canvasReturnScrollRef, canvasScrollLockRef, canvasSurfaceRef, isCanvasModeRef, isPinnedRef, keepCanvasSessionOnLeaveRef, saveCanvasStateNow, setCanvasSpacePressed, setIsCanvasMode, setIsPinned, showToast, updateCanvasSelection }); };

  const requestExitCanvasMode = () => {
    leaveCanvasToDrawer();
  };

  const runCanvasWorkbenchWindowAction = (action: 'minimize' | 'maximize' | 'close') => { return runCanvasWorkbenchWindowActionImpl({ appWindow, requestExitCanvasMode, showToast }, action); };

  const runDrawerWorkbenchWindowAction = (action: 'minimize' | 'maximize' | 'close') => { return runDrawerWorkbenchWindowActionImpl({ appWindow, isPinnedRef, isPointerInsideDrawerRef, setIsOpen, setIsPinned, showToast }, action); };

  const toggleCanvasMode = () => {
    if (isCanvasModeRef.current) requestExitCanvasMode();
    else enterCanvasMode();
  };

  useEffect(() => { return runCanvasInteractionsEffect03({ activeThreeSceneIdRef, cancelCanvasItemDragVisuals, canvasClipboardRef, canvasConnectionDraft, canvasContextMenuRef, canvasDragRef, canvasGroupResizeRef, canvasInputPickTargetIdRef, canvasItemsRef, canvasPanCleanupRef, canvasPanRef, canvasResizeRef, canvasScrollLockRef, canvasSelectedIdsRef, canvasSpaceKeyCapturedRef, canvasSurfaceRef, copyCanvasItemsToAvailableClipboards, createCanvasGroup, duplicateCanvasItems, exitThreeSceneInteraction, fitCanvasViewToItems, getCanvasClipboardImageFiles, hideCanvasSelectionOverlay, isCanvasModeRef, isCanvasSpacePressedRef, isTextEntryActive, lastCanvasPointerClientRef, pasteCanvasItems, pasteSystemClipboardToCanvas, pendingCanvasFusionRoleRef, preferCanvasClipboardRef, removeCanvasItemsByIds, renameCanvasGroup, setCanvasConnectionDraft, setCanvasContextMenu, setCanvasInputMenuForId, setCanvasInputPickTargetId, setCanvasInteractionActive, setCanvasSpacePressed, setIsCanvasChromeHidden, shouldRouteShortcutToDoodle, showToast, toggleCanvasMode, ungroupCanvasItems, updateCanvasSelection }); }, []);

  useEffect(() => { return runCanvasInteractionsEffect04({ isCanvasModeRef }); }, []);

  const buildCanvasDrawerFolderName = (canvas: CanvasRecord, now = Date.now()) => { return buildCanvasDrawerFolderNameImpl({}, canvas, now); };

  const copyCanvasItemsToDrawerFolder = (snapshots: CanvasImageItem[], canvas: CanvasRecord) => { return copyCanvasItemsToDrawerFolderImpl({ buildCanvasDrawerFolderName, createAssetId, foldersRef, insertDrawerFolderAtTop, itemsRef, persistFoldersSnapshot, pushDrawerUndoSnapshot, setActiveFolderId, setActiveTab, setFolders, setItems }, snapshots, canvas); };

  const invalidateDrawerAssetQueryForImport = () => {
    cancelDrawerAssetQuery();
  };

  const addDroppedPaths = async (paths: string[]) => { return addDroppedPathsImpl({ activeFolderIdRef, createAssetId, enqueueAutoAiTaggingForItems, getLatestFileCacheDir, invalidateDrawerAssetQueryForImport, lastDroppedPathsKeyRef, lastNativeDropAtRef, prependAssetsAndPersist, pushDrawerUndoSnapshot, setActiveTab, setIsOpen, setItems }, paths); };

  const addWebImageUrl = (
    url: string,
    name?: string,
    fallbackUrls: string[] = [],
    captureMetadata: WebImageCaptureMetadata = {},
  ) => { return addWebImageUrlImpl({ activeFolderIdRef, cacheWebImageFromCandidates, claimExternalWebImageDrop, createAssetId, enqueueAutoAiTaggingForItems, getPersistentWebSourceUrl, getWebCaptureSourceSite, invalidateDrawerAssetQueryForImport, prependAssetsAndPersist, pushDrawerUndoSnapshot, setActiveTab, setIsOpen, setItems, showToast, supersededWebImageItemIdsRef, webImageCacheDirRef }, url, name, fallbackUrls, captureMetadata); };

  const importBrowserExtensionImageToDrawer = async (
    source: string,
    displayName: string,
    fallbackUrls: string[],
    captureMetadata: WebImageCaptureMetadata,
  ) => { return importBrowserExtensionImageToDrawerImpl({ activeFolderIdRef, cacheWebImageFromCandidates, claimExternalWebImageDrop, createAssetId, enqueueAutoAiTaggingForItems, getPersistentWebSourceUrl, getWebCaptureSourceSite, invalidateDrawerAssetQueryForImport, prependAssetsAndPersist, pushDrawerUndoSnapshot, setActiveTab, setIsOpen, setItems, showToast, webImageCacheDirRef }, source, displayName, fallbackUrls, captureMetadata); };

  const importBrowserExtensionImageToCanvas = async (
    source: string,
    displayName: string,
    fallbackUrls: string[],
    captureMetadata: WebImageCaptureMetadata,
    client?: { x: number; y: number },
  ) => { return importBrowserExtensionImageToCanvasImpl({ appendCanvasItems, cacheWebImageFromCandidates, claimExternalWebImageDrop, createAssetId, getCanvasDropPosition, getPersistentWebSourceUrl, getWebCaptureSourceSite, makeCanvasNodeId, showToast, webImageCacheDirRef }, source, displayName, fallbackUrls, captureMetadata, client); };

  useBrowserExtensionDragCollector(async (payload, dropContext) => {
    const source = payload.localPath || payload.dataUrl || payload.imageUrl || '';
    if (!source) {
      void emitTo('edge', 'browser-extension-image-save-failed', { dragId: payload.dragId });
      return;
    }
    const displayName = payload.imageTitle || payload.alt || payload.pageTitle || '网页图片';
    const fallbackUrls = payload.dataUrl && payload.imageUrl ? [payload.imageUrl] : [];
    const captureMetadata: WebImageCaptureMetadata = {
      dragId: payload.dragId,
      sourceUrl: payload.imageUrl || undefined,
      pageUrl: payload.pageUrl || undefined,
      pageTitle: payload.pageTitle || undefined,
      imageAlt: payload.alt || undefined,
      width: payload.width || undefined,
      height: payload.height || undefined,
      sourceType: payload.sourceType,
      captureSource: 'browser-extension',
      folderId: dropContext.folderId,
      localPath: payload.localPath || undefined,
    };
    if (dropContext.target === 'canvas') {
      await importBrowserExtensionImageToCanvas(
        source,
        displayName,
        fallbackUrls,
        captureMetadata,
        typeof dropContext.clientX === 'number' && typeof dropContext.clientY === 'number'
          ? { x: dropContext.clientX, y: dropContext.clientY }
          : undefined,
      );
      return;
    }
    await importBrowserExtensionImageToDrawer(source, displayName, fallbackUrls, captureMetadata);
  });

  // Windows 原生 OLE 拖拽：统一接收本地源路径 + 网页图片 URL。
  // Rust 后端会发 native-drop，payload.paths 是本地文件/文件夹源路径，
  // payload.web_images 是从 HTML Format / URL / 文本中解析到的网页图片。
  useEffect(() => { return runDrawerAssetsEffect01({ setVirtualDropJobs, showToast }); }, []);

  useEffect(() => { return runDrawerAssetsEffect02({ addCanvasDroppedPaths, addCanvasWebImageUrl, addDroppedPaths, addWebImageUrl, appWindow, drawerHeightRef, drawerWidthRef, isCanvasModeRef, isMainWorkbenchActiveRef, isPinnedRef, isSplashVisibleRef, lastAcceptedWebImageRef, lastCanvasDragClientRef, lastCanvasDropAtRef, licenseGateActiveRef, setDrawerState, setExternalDragActive, setIsOpen, setIsPinned, setItems, showLaunchIntroRef, showUpdateLogRef, stateRef, supersededWebImageItemIdsRef, triggerModeRef, updateCanvasItemsImmediate }); }, []);

  // Tauri 原生文件拖入：负责拿到真实文件路径。
  useEffect(() => { return runDrawerAssetsEffect03({ addCanvasDroppedPaths, addDroppedPaths, appWindow, drawerHeightRef, drawerWidthRef, isCanvasModeRef, isMainWorkbenchActiveRef, isPinnedRef, isSplashVisibleRef, lastCanvasDragClientRef, lastCanvasDropAtRef, lastWebImageDropAtRef, licenseGateActiveRef, setDrawerState, setExternalDragActive, setIsOpen, setIsPinned, showLaunchIntroRef, showUpdateLogRef, stateRef, triggerModeRef }); }, []);


  // 如果文件被直接松手到 edge 小条/悬浮方块窗口，edge 会把真实路径转发到 main。
  useEffect(() => { return runDrawerAssetsEffect04({ addCanvasDroppedPaths, addCanvasWebImageUrl, addDroppedPaths, addWebImageUrl, isCanvasModeRef, lastCanvasDragClientRef, lastCanvasDropAtRef, lastWebImageDropAtRef, setExternalDragActive, stateRef }); }, []);

  // DOM 拖拽只处理网页图片。
  // 本地文件/本地图片/文件夹必须走 Tauri 原生 drag-drop，才能拿到源路径；
  // DOM File 无法暴露真实路径，因此这里绝不再复制到 app data/uploads。
  useEffect(() => { return runDrawerAssetsEffect05({ addCanvasWebImageUrl, addWebImageUrl, isCanvasModeRef, setExternalDragActive, stateRef }); }, []);

  const handleAddFolder = () => { return handleAddFolderImpl({ closeFolderModal, createAssetId, folders, insertDrawerFolderAtTop, newFolderName, newFolderParentId, persistFoldersSnapshot, pushDrawerUndoSnapshot, setCollapsedFolderIds, setFolders, showToast }); };

  const handleDeleteFolder = (id: string) => { return handleDeleteFolderImpl({ activeFolderId, assetStorageMode, folders, persistFoldersSnapshot, pushDrawerUndoSnapshot, setActiveFolderId, setAssetStatsRevision, setCollapsedFolderIds, setFolders, setItems, showToast }, id); };

  const getFolderActionIds = (folderId?: string | null) => {
    const selection = selectedFolderIdsRef.current.filter(id => foldersRef.current.some(folder => folder.id === id));
    if (folderId && selection.includes(folderId)) return selection;
    return folderId && foldersRef.current.some(folder => folder.id === folderId) ? [folderId] : selection;
  };

  const handleDrawerFolderSelectionClick = (folderId: string, event: React.MouseEvent) => { return handleDrawerFolderSelectionClickImpl({ lastSelectedFolderIdRef, setSelectedFolderIds, visibleFolderIds }, folderId, event); };

  const openMoveExistingFolderModal = (folderIds: string[]) => { return openMoveExistingFolderModalImpl({ foldersRef, lastSelectedFolderIdRef, setFolderContextMenu, setFolderMoveTargetId, setSelectedFolderIds, setShowFolderModal, setShowMoveExistingFolderModal, setShowMoveFolderModal }, folderIds); };

  const moveDrawerFoldersToParent = async (folderIds: string[], targetParentId?: string | null) => { return moveDrawerFoldersToParentImpl({ foldersRef, isInvalidFolderMoveTarget, persistFoldersSnapshot, setCollapsedFolderIds, setFolderContextMenu, setFolderMoveTargetId, setFolders, setIsMovingFolders, setSelectedFolderIds, setShowMoveExistingFolderModal, showToast }, folderIds, targetParentId); };

  const handleFolderContextMenu = (event: React.MouseEvent, folderId: string) => { return handleFolderContextMenuImpl({ getFolderActionIds, lastSelectedFolderIdRef, setFolderContextMenu, setSelectedFolderIds }, event, folderId); };

  const deleteDrawerFolders = (folderIds: string[]) => { return deleteDrawerFoldersImpl({ activeFolderIdStateRef, assetStorageMode, foldersRef, lastSelectedFolderIdRef, persistFoldersSnapshot, pushDrawerUndoSnapshot, setActiveFolderId, setAssetStatsRevision, setCollapsedFolderIds, setFolderContextMenu, setFolders, setItems, setSelectedFolderIds, showToast }, folderIds); };

  const getDraggedDrawerItemId = (dt?: DataTransfer | null) => { return getDraggedDrawerItemIdImpl({ draggingItemIdRef }, dt); };

  const getDraggedDrawerFolderIds = (dt?: DataTransfer | null) => { return getDraggedDrawerFolderIdsImpl({ FOLDER_DRAG_MIME, draggingFolderIdsRef, foldersRef }, dt); };

  const clearDrawerFolderDragState = () => {
    setDraggingFolderIds([]);
    setFolderMoveDragOverId(null);
    setDragOverFolderId(null);
  };

  const handleDrawerFolderDragStart = (event: React.DragEvent, folderId: string) => { return handleDrawerFolderDragStartImpl({ FOLDER_DRAG_MIME, getFolderActionIds, lastSelectedFolderIdRef, setDraggingFolderIds, setSelectedFolderIds }, event, folderId); };

  const handleDrawerFolderDragEnd = () => {
    clearDrawerFolderDragState();
  };

  const startDrawerFolderPointerDrag = (event: React.PointerEvent, folderId: string) => { return startDrawerFolderPointerDragImpl({ clearDrawerFolderDragState, editingFolderId, getFolderActionIds, isInvalidFolderMoveTarget, lastSelectedFolderIdRef, moveDrawerFoldersToParent, setDragOverFolderId, setDraggingFolderIds, setFolderMoveDragOverId, setSelectedFolderIds, showToast, suppressNextFolderClickRef }, event, folderId); };

  const moveDrawerItemToFolder = (itemId: string, folderId?: string, folderName?: string) => {
    if (!itemId || !items.some(i => i.id === itemId)) return false;
    const currentFolderId = items.find(i => i.id === itemId)?.folderId;
    if ((currentFolderId || undefined) === folderId) return false;
    pushDrawerUndoSnapshot(folderId ? '移动到文件夹' : '移出文件夹');
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, folderId } : i));
    showToast(folderId ? `已归类至 ${folderName || '文件夹'}` : '已移出至主抽屉');
    return true;
  };

  const sanitizeExportFileName = (name: string, fallback = '灵感卡片') => {
    const cleaned = (name || fallback)
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.\s]+$/g, '');
    return (cleaned || fallback).slice(0, 120);
  };

  const extensionFromValue = (value?: string | null) => {
    const clean = String(value || '').split('?')[0].split('#')[0];
    const name = clean.split(/[\\/]/).pop() || '';
    const ext = name.includes('.') ? name.split('.').pop() || '' : '';
    return ext.toLowerCase();
  };

  const exportFileNameForItem = (item: BufferItem, index: number, used: Set<string>) => { return exportFileNameForItemImpl({ extensionFromValue, sanitizeExportFileName }, item, index, used); };

  const handleExportSelectedItems = async () => { return handleExportSelectedItemsImpl({ exportFileNameForItem, items, selectedIds, setIsSelectMode, setSelectedIds, showToast }); };

  const downloadBufferItems = async (sourceItems: BufferItem[], options?: { feature?: string }) => { return downloadBufferItemsImpl({ exportFileNameForItem, showToast, webImageCacheDirRef }, sourceItems, options); };

  const downloadCanvasItemsByIds = async (ids: string[]) => { return downloadCanvasItemsByIdsImpl({ canvasItemsRef, downloadBufferItems }, ids); };

  const moveSelectedItemsToFolder = (folderId?: string, folderName?: string) => { return moveSelectedItemsToFolderImpl({ pushDrawerUndoSnapshot, selectedIds, setIsSelectMode, setItems, setSelectedIds, setShowMoveFolderModal, showToast }, folderId, folderName); };

  const createFolderAndMoveSelected = () => { return createFolderAndMoveSelectedImpl({ activeFolderId, createAssetId, folders, insertDrawerFolderAtTop, moveFolderName, persistFoldersSnapshot, pushDrawerUndoSnapshot, selectedIds, setCollapsedFolderIds, setFolders, setIsSelectMode, setItems, setMoveFolderName, setSelectedIds, setShowMoveFolderModal, showToast }); };

  const clearDrawerItemDragState = () => {
    setDraggingItemId(null);
    setDragOverFolderId(null);
    draggingItemIdRef.current = null;
    isGlobalMouseDown.current = false;
    document.body.style.cursor = '';
  };

  const handleDrawerItemDropToFolder = (e: React.DragEvent, folderId?: string, folderName?: string) => { return handleDrawerItemDropToFolderImpl({ clearDrawerFolderDragState, clearDrawerItemDragState, getDraggedDrawerFolderIds, getDraggedDrawerItemId, isInvalidFolderMoveTarget, moveDrawerFoldersToParent, moveDrawerItemToFolder, showToast }, e, folderId, folderName); };

  const handleDrawerItemDragOverFolder = (e: React.DragEvent, folderId: string) => { return handleDrawerItemDragOverFolderImpl({ getDraggedDrawerFolderIds, getDraggedDrawerItemId, isInvalidFolderMoveTarget, items, setDragOverFolderId, setFolderMoveDragOverId }, e, folderId); };

  const handleDrawerItemDragLeaveFolder = (e: React.DragEvent, folderId: string) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragOverFolderId(prev => prev === folderId ? null : prev);
    setFolderMoveDragOverId(prev => prev === folderId ? null : prev);
  };

  const handleDrawerFolderPointerEnter = (folderId: string) => {
    if (draggingItemIdRef.current) setDragOverFolderId(folderId);
  };

  const handleDrawerFolderPointerLeave = (folderId: string) => {
    if (draggingItemIdRef.current) {
      setDragOverFolderId(prev => prev === folderId ? null : prev);
    }
  };

  const handleDrawerFolderPointerUp = (folderId?: string, folderName?: string) => {
    const itemId = draggingItemIdRef.current;
    if (!itemId) return;
    moveDrawerItemToFolder(itemId, folderId, folderName);
    clearDrawerItemDragState();
  };

  const handleDrawerItemSelect = (itemId: string, event?: React.MouseEvent) => { return handleDrawerItemSelectImpl({ displayItems, lastSelectedDrawerItemIdRef, setSelectedIds }, itemId, event); };

  const getExternalDragItemsForItem = (itemId: string) => {
    const dragIds = selectedIds.includes(itemId) && selectedIds.length > 1 ? selectedIds : [itemId];
    return items
      .filter(item => dragIds.includes(item.id))
      .filter(item => item.type === 'image' || item.type === 'file' || item.type === 'video');
  };

  const resolveExternalDragLocalPath = async (item: BufferItem) => { return resolveExternalDragLocalPathImpl({ cacheWebImageFromCandidates, setItems, updateCanvasItemsImmediate, webImageCacheDirRef }, item); };

  const startNativeDrawerItemDrag = async (itemId: string) => { return startNativeDrawerItemDragImpl({ clearIdleAutoClose, getExternalDragItemsForItem, isPointerInsideDrawerRef, resolveExternalDragLocalPath, scheduleAutoClose, showToast }, itemId); };

  const startDrawerItemPointerDrag = (e: React.PointerEvent, itemId: string) => { return startDrawerItemPointerDragImpl({ addDrawerMediaItemToCanvas, canvasSurfaceRef, clearDrawerItemDragState, draggingItemIdRef, isCanvasModeRef, isGlobalMouseDown, isResizingCards, moveDrawerItemToFolder, setDraggingItemId, startNativeDrawerItemDrag }, e, itemId); };

  const handleRenameFolder = (id: string) => { return handleRenameFolderImpl({ folders, persistFoldersSnapshot, pushDrawerUndoSnapshot, renameValue, setEditingFolderId, setFolders, showToast }, id); };

  const handleCloseTextInput = () => { setShowTextInput(false); };

  const [drawerWidth, setDrawerWidth] = useState(() => {
      migrateDrawerSizeDefaults();
      const w = Number(localStorage.getItem('drawer_width'));
      const max = MAX_DRAWER_WIDTH;
      return (!w || Number.isNaN(w) || w < MIN_DRAWER_WIDTH || w > max) ? DEFAULT_DRAWER_WIDTH : w;
  });
  const [drawerHeight, setDrawerHeight] = useState(() => {
      const h = Number(localStorage.getItem('drawer_height'));
      const max = MAX_DRAWER_HEIGHT;
      return (!h || Number.isNaN(h) || h < MIN_DRAWER_HEIGHT || h > max) ? DEFAULT_DRAWER_HEIGHT : h;
  });

  const isResizingState = useRef(false);

  useEffect(() => { localStorage.setItem('drawer_width', drawerWidth.toString()); }, [drawerWidth]);
  useEffect(() => { localStorage.setItem('drawer_height', drawerHeight.toString()); }, [drawerHeight]);


  const [drawerState, setDrawerState] = useState<'closed' | 'pre_open' | 'open' | 'closing'>(() => shouldShowInitialLaunchIntro() ? 'pre_open' : 'closed');

  useEffect(() => { return runDrawerAssetsEffect06({ drawerHeightRef, drawerWidthRef, isPinnedRef, isPointerInsideDrawerRef, isPostInstallLaunchRef, isSplashVisibleRef, setDrawerState, setIsOpen, setIsPinned, setIsSplashVisible, setShowLaunchIntro, showLaunchIntroRef, startupAutoCloseSuppressedRef, triggerModeRef }); }, []);

  const isPointerInsideDrawerRef = useRef(false);
  const lastDrawerPointerDownAtRef = useRef(0);
  const drawerPanelInteractionHoldUntilRef = useRef(0);
  const drawerAutoCloseBlockRef = useRef(false);
  const drawerWidthRef = useRef(drawerWidth);
  const drawerHeightRef = useRef(drawerHeight);
  const pendingBoundsRef = useRef<{ width: number; height: number; anchor?: 'left' | 'right' } | null>(null);
  const boundsFrameRef = useRef<number | null>(null);
  const boundsInvokeInFlightRef = useRef(false);
  const boundsSyncRequestedRef = useRef(false);
  const drawerResizeAnchorRef = useRef<'left' | 'right'>('right');
  const snipCaptureInFlightRef = useRef(false);
  const handledSnipPathsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => { drawerWidthRef.current = drawerWidth; }, [drawerWidth]);
  useEffect(() => { drawerHeightRef.current = drawerHeight; }, [drawerHeight]);

  const openSelectedImagePreview = (
    sourceOrItem: string | BufferItem,
    options: { fromCanvas?: boolean; galleryItems?: BufferItem[]; galleryIndex?: number } = {}
  ) => { return openSelectedImagePreviewImpl({ selectedImageOriginalCacheRef, selectedImageReturnToCanvasRef, setSelectedImage, setSelectedImageGallery }, sourceOrItem, options); };

  const stepSelectedImageGallery = (direction: -1 | 1) => { return stepSelectedImageGalleryImpl({ isCanvasModeRef, openSelectedImagePreview, selectedImageGallery, selectedImageReturnToCanvasRef }, direction); };

  const restoreCanvasAfterMediaPreview = () => { return restoreCanvasAfterMediaPreviewImpl({ canvasSurfaceRef, closeTimerRef, drawerHeightRef, drawerWidthRef, idleAutoCloseTimerRef, isCanvasWorkbenchActiveRef, isPinnedRef, isPointerInsideDrawerRef, setDrawerState, setIsOpen, setIsPinned, startupAutoCloseSuppressedRef, triggerModeRef }); };

  const closeSelectedImagePreview = () => { return closeSelectedImagePreviewImpl({ isCanvasModeRef, restoreCanvasAfterMediaPreview, selectedImageReturnToCanvasRef, setSelectedImage, setSelectedImageGallery }); };

  const openSelectedVideoPreview = (
    video: { url?: string | null; path?: string | null },
    options: { fromCanvas?: boolean } = {},
  ) => { return openSelectedVideoPreviewImpl({ selectedVideoReturnToCanvasRef, setSelectedVideo }, video, options); };

  const closeSelectedVideoPreview = () => {
    const shouldReturnToCanvas = selectedVideoReturnToCanvasRef.current || selectedVideo?.fromCanvas || isCanvasModeRef.current;
    selectedVideoReturnToCanvasRef.current = false;
    setSelectedVideo(null);

    if (shouldReturnToCanvas && isCanvasModeRef.current) {
      restoreCanvasAfterMediaPreview();
    }
  };

  const isStartupOverlayActive = showLaunchIntro || isSplashVisible || showUpdateLog;
  const isCanvasWorkbenchMediaPreviewActive =
    isCanvasWorkbenchActive &&
    isCanvasMode &&
    (!!selectedImage || !!selectedVideo);

  const isDrawerActive =
    isOpen ||
    isPinned ||
    isStartupOverlayActive ||
    ((!!selectedImage || !!selectedVideo) && !isCanvasWorkbenchMediaPreviewActive);
  const startupOverlayWasActiveRef = useRef(isStartupOverlayActive);

  // 启动欢迎/更新日志期间只做一次确定的“侧边滑出”序列：
  // 1. 先把真实 Tauri 窗口打开到抽屉尺寸
  // 2. 前端从 pre_open 的侧边位置滑到 open
  // 3. 倒计时结束后，如果鼠标不在抽屉里，再缩回
  useLayoutEffect(() => { return runWindowSnipEffect01({ closeTimerRef, drawerHeightRef, drawerWidthRef, isSnipSessionActive, isStartupOverlayActive, setDrawerState, setIsOpen, snipMode, startupAutoCloseTimerRef, triggerModeRef }); }, [isStartupOverlayActive, snipMode.active, isSnipSessionActive]);

  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const playSnipShutterSound = () => { return playSnipShutterSoundImpl({}); };

  const copyLocalImageToClipboard = async (path: string) => { return copyLocalImageToClipboardImpl({ copyImageDataUrlToSystemClipboard, imageSourceToDataUrl, wait }, path); };

  const applyWindowBounds = (width: number, height: number, anchor: 'left' | 'right' = 'right') => { return applyWindowBoundsImpl({ applyWindowBounds, boundsFrameRef, boundsInvokeInFlightRef, boundsSyncRequestedRef, isSnipSessionActive, pendingBoundsRef, snipMode }, width, height, anchor); };

  useEffect(() => {
    return () => {
      if (boundsFrameRef.current !== null) {
        cancelAnimationFrame(boundsFrameRef.current);
        boundsFrameRef.current = null;
      }
    };
  }, []);

const startSnip = async () => { return startSnipImpl({ closeTimerRef, drawerHeightRef, drawerState, drawerWidthRef, enforceAntiTouchClosed, idleAutoCloseTimerRef, isCanvasMode, isDraggingTitleRef, isGlobalMouseDown, isOpen, isPinned, isPinnedRef, isResizingState, setIsDraggingTitle, setIsSnipSessionActive, setSelection, setSnipMode, showToast, snipCaptureInFlightRef, snipModeActiveRef, snipRestoreDrawerRef, stateRef, triggerModeRef }); };

  // 开合动画只响应“激活/关闭”变化，尺寸变化不再重新触发 pre_open -> open，避免缩放闪烁。
useEffect(() => { return runWindowSnipEffect02({ closeTimerRef, drawerHeightRef, drawerWidthRef, isDrawerActive, isSnipSessionActive, isStartupOverlayActive, setDrawerState, snipExitInFlightRef, snipMode, startupOverlayWasActiveRef, triggerModeRef }); }, [isDrawerActive, isStartupOverlayActive, snipMode.active, isSnipSessionActive]);

  // 兜底：只要前端状态已经是 closed，就再次把真实 Tauri 窗口压回 20px。
  // 这样即使上一轮动画/异步 resize 被打断，也不会留下一个透明的大命中框。
  useEffect(() => {
    if (snipMode.active || isSnipSessionActive || snipExitInFlightRef.current || isDrawerActive || drawerState !== 'closed') return;
    invoke('close_drawer', { mode: triggerModeRef.current }).catch(() => {});
  }, [drawerState, isDrawerActive, snipMode.active, isSnipSessionActive]);

  useEffect(() => { return runWindowSnipEffect03({ drawerHeightRef, isAntiTouchMode, isDrawerActive, isSnipSessionActive, isStartupOverlayActive, snipExitInFlightRef, snipMode, triggerModeRef }); }, [
    drawerState,
    isStartupOverlayActive,
    isDrawerActive,
    isAntiTouchMode,
    triggerMode,
    snipMode.active,
    isSnipSessionActive,
  ]);

  // 尺寸变化只同步系统窗口大小，不重置抽屉动画状态。
useEffect(() => {
  if (snipMode.active || isSnipSessionActive || isResizingState.current || !isDrawerActive || drawerState === 'closed' || drawerState === 'closing') return;
  applyWindowBounds(drawerWidth + EDGE_WIDTH, drawerHeight, drawerResizeAnchorRef.current);
}, [drawerWidth, drawerHeight, isDrawerActive, drawerState, snipMode.active, isSnipSessionActive]);




  let transformX = '0px';
  let transitionStyle = 'none';

  if (drawerState === 'closed') {
      transformX = `${drawerWidth}px`;
      transitionStyle = 'none';
  } else if (drawerState === 'pre_open') {
      transformX = `${drawerWidth}px`;
      transitionStyle = 'none';
  } else if (drawerState === 'open') {
      transformX = '0px';
      transitionStyle = isResizingState.current ? 'none' : (isShortcutReveal ? 'transform 0.24s ease-out' : 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)');
  } else if (drawerState === 'closing') {
      transformX = `${drawerWidth}px`;
      transitionStyle = 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)';
  }
  const drawerShellTransform = transformX === '0px' ? 'none' : `translateX(${transformX})`;
  const drawerShellClassName = `pointer-events-auto absolute inset-0 z-40 h-full w-full min-h-[560px] min-w-[880px] border flex flex-row rounded-[16px] overflow-hidden isolate${drawerShellTransform === 'none' ? '' : ' will-change-transform'}`;
  const drawerSidebarClassName = isCanvasMode && isCanvasChromeHidden
    ? 'hidden'
    : `${isFolderSidebarLayout ? '' : 'w-16'} relative h-full border-r flex flex-col pt-3 pb-4 z-10 shrink-0 overflow-hidden transition-[width] duration-200 ease-out ${isFolderSidebarLayout ? 'items-stretch' : 'items-center'}`;

  // 🌟 退出截图时，必须先把 Tauri 窗口恢复到抽屉尺寸，再卸载全屏截图层。
  // 否则 React 会先把抽屉内容显示在全屏窗口里，视觉上就像“先放大再缩小”。
  const exitSnip = async (reopen = false) => { return exitSnipImpl({ appWindow, drawerHeightRef, drawerWidthRef, enforceAntiTouchClosed, isMouseDown, setDrawerState, setIsOpen, setIsPinned, setSelection, setSnipMode, snipCaptureInFlightRef, snipExitInFlightRef, snipModeActiveRef, stateRef, triggerModeRef }, reopen); };

  const revealDrawerAfterSnipCopy = async () => { return revealDrawerAfterSnipCopyImpl({ closeTimerRef, drawerHeightRef, drawerWidthRef, enforceAntiTouchClosed, isPointerInsideDrawerRef, markShortcutReveal, scheduleIdleAutoClose, setActiveTab, setDrawerState, setIsOpen, snipExitInFlightRef, startupAutoCloseSuppressedRef, stateRef, triggerModeRef }); };

  const getSnipPlaceholderUrl = () => { return getSnipPlaceholderUrlImpl({}); };

  const confirmSnip = async (pointer?: { screenX: number; screenY: number; clientX: number; clientY: number }) => { return confirmSnipImpl({ activeFolderId, copyLocalImageToClipboard, createAssetId, createFloatingNote, emitFloatingNoteUpdated, exitSnip, getSnipPlaceholderUrl, playSnipShutterSound, pushDrawerUndoSnapshot, refreshNoteManager, revealDrawerAfterSnipCopy, screenshotAutoPinNoteRef, selection, setActiveTab, setItems, showToast, snipCaptureInFlightRef }, pointer); };

  const finishSnipWindowSession = async (_restoreTrigger = false) => { return finishSnipWindowSessionImpl({ drawerHeightRef, drawerWidthRef, enforceAntiTouchClosed, isDraggingTitleRef, isGlobalMouseDown, isResizingState, setDrawerState, setIsDraggingTitle, setIsOpen, setIsPinned, setIsSnipSessionActive, setSelection, setSnipMode, snipExitInFlightRef, snipModeActiveRef, snipRestoreDrawerRef, stateRef, triggerModeRef }, _restoreTrigger); };

  const resetSnipSessionState = () => { return resetSnipSessionStateImpl({ isDraggingTitleRef, isGlobalMouseDown, isResizingState, setIsDraggingTitle, setIsSnipSessionActive, setSelection, setSnipMode, snipCaptureInFlightRef, snipExitInFlightRef, snipModeActiveRef, snipRestoreDrawerRef }); };

  const handleSnipWindowCaptured = async (payload: any) => { return handleSnipWindowCapturedImpl({ activeFolderIdRef, addCanvasImageItems, copyLocalImageToClipboard, createAssetId, createCanvasImageItemFromPath, createFloatingNote, enqueueAutoAiTaggingForItems, finishSnipWindowSession, handledSnipPathsRef, isCanvasModeRef, isDraggingTitleRef, isGlobalMouseDown, isResizingState, playSnipShutterSound, pushDrawerUndoSnapshot, resetSnipSessionState, screenshotAutoPinNoteRef, setActiveTab, setIsDraggingTitle, setIsSnipSessionActive, setItems, showToast, snipCaptureInFlightRef, snipExitInFlightRef, snipModeActiveRef }, payload); };

  const recoverSnipWindowFromMain = async (restoreDrawer: boolean) => { return recoverSnipWindowFromMainImpl({ drawerHeightRef, drawerWidthRef, triggerModeRef }, restoreDrawer); };

  const handleSnipSelection = async (payload: any) => { return handleSnipSelectionImpl({ copyLocalImageToClipboard, handleSnipWindowCaptured, recoverSnipWindowFromMain, resetSnipSessionState, showToast, snipCaptureInFlightRef, snipRestoreDrawerRef }, payload); };

  useEffect(() => { return runWindowSnipEffect04({ finishSnipWindowSession, handleSnipSelection, handleSnipWindowCaptured, resetSnipSessionState, showToast }); }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && snipMode.active) exitSnip(); };
    window.addEventListener('keydown', handleEsc);
    return () => { window.removeEventListener('keydown', handleEsc); };
  }, [snipMode.active]);

  useEffect(() => { return runWindowSnipEffect05({ closeSelectedImagePreview, selectedImage, selectedImageGallery, stepSelectedImageGallery }); }, [selectedImage, selectedImageGallery]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedVideo) closeSelectedVideoPreview();
    };
    window.addEventListener('keydown', handleEsc);
    return () => { window.removeEventListener('keydown', handleEsc); };
  }, [selectedVideo]);

  const handleTogglePin = () => { return handleTogglePinImpl({ isPinned, isPinnedRef, isPointerInsideDrawerRef, setDrawerState, setIsOpen, setIsPinned }); };

  const finishResize = (anchor: 'left' | 'right' = 'right') => { return finishResizeImpl({ applyWindowBounds, closeTimerRef, drawerHeightRef, drawerResizeAnchorRef, drawerWidthRef, isGlobalMouseDown, isPointerInsideDrawerRef, isResizingState, setDrawerHeight, setDrawerWidth, setIsOpen, shouldBlockAutoClose }, anchor); };

  const startResizingWidth = (e: React.PointerEvent) => { return startResizingWidthImpl({ applyWindowBounds, drawerHeightRef, drawerWidthRef, finishResize, isGlobalMouseDown, isResizingState, setDrawerState, setIsOpen }, e); };

  const startResizingHeight = (e: React.PointerEvent) => { return startResizingHeightImpl({ applyWindowBounds, drawerHeightRef, drawerWidthRef, finishResize, isGlobalMouseDown, isResizingState, setDrawerState, setIsOpen }, e); };

  const startResizingCorner = (e: React.PointerEvent) => { return startResizingCornerImpl({ applyWindowBounds, drawerHeightRef, drawerWidthRef, finishResize, isGlobalMouseDown, isResizingState, setDrawerState, setIsOpen }, e); };

  const startResizingRightCorner = (e: React.PointerEvent) => { return startResizingRightCornerImpl({ applyWindowBounds, drawerHeightRef, drawerWidthRef, finishResize, isGlobalMouseDown, isResizingState, setDrawerState, setIsOpen }, e); };

  const handleRecordShortcut = (e: React.KeyboardEvent, setter: Function, submitterName: string) => { return handleRecordShortcutImpl({}, e, setter, submitterName); };

  const createTextOrUrlItem = (rawText: string, defaultName = '文本片段'): BufferItem => { return createTextOrUrlItemImpl({ activeFolderId, createAssetId }, rawText, defaultName); };

  useEffect(() => { return runWindowSnipEffect06({ activeFolderId, createAssetId, createTextOrUrlItem, enqueueAutoAiTaggingForItems, invalidateDrawerAssetQueryForImport, isSearchActive, isTextEntryActive, prependAssetsAndPersist, pushDrawerUndoSnapshot, setActiveTab, setIsOpen, showFolderModal, showTextInput, showWebImageCollector }); }, [showTextInput, showWebImageCollector, isSearchActive, showFolderModal, activeFolderId]);



  const finishLaunchIntro = (manualOrEvent?: boolean | React.MouseEvent, acceptDisclaimer = true) => { return finishLaunchIntroImpl({ CLOUDFLARED_DISCLAIMER_ACCEPTED_STORAGE_KEY, acceptCloudflaredDisclaimer, declineCloudflaredDisclaimer, isPinnedRef, isPointerInsideDrawerRef, isSplashVisibleRef, setDrawerState, setIsOpen, setIsPinned, setIsSplashVisible, setShowLaunchIntro, showLaunchIntroRef, startupAutoCloseSuppressedRef, startupAutoCloseTimerRef }, manualOrEvent, acceptDisclaimer); };

  useLayoutEffect(() => { return runWindowSnipEffect07({ STARTUP_CONSENT_DELAY_MS, finishLaunchIntro, isPinnedRef, isPointerInsideDrawerRef, isSplashVisibleRef, setIsPinned, setIsSplashVisible, showLaunchIntro, startupAutoCloseSuppressedRef }); }, [showLaunchIntro]);

  const isTextEntryActive = () => {
    const element = document.activeElement as HTMLElement | null;
    if (!element) return false;
    const tag = element.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable || !!element.closest('[data-canvas-edit-control="true"]');
  };

  useEffect(() => { return runWindowSnipEffect08({ canvasBrushEditor, confirmDialog, drawerAutoCloseBlockRef, editingFolderId, folderContextMenu, isCanvasWorkbenchActive, isDraggingOver, isDraggingTitleRef, isDrawerAgentOpen, isGlobalMouseDown, isPinned, isResizingState, isSearchActive, isSnipSessionActive, isSplashVisible, isTextEntryActive, selectedImage, selectedVideo, showFolderModal, showLaunchIntro, showMoveExistingFolderModal, showMoveFolderModal, showTextInput, showUpdateLog, showWebImageCollector, snipMode, startupAutoCloseSuppressedRef, textInputDialog }); }, [
    isDraggingOver,
    isCanvasWorkbenchActive,
    isPinned,
    canvasBrushEditor,
    selectedImage,
    selectedVideo,
    isDrawerAgentOpen,
    showTextInput,
    showWebImageCollector,
    showFolderModal,
    showMoveFolderModal,
    showMoveExistingFolderModal,
    folderContextMenu,
    isSearchActive,
    editingFolderId,
    textInputDialog.isOpen,
    confirmDialog.isOpen,
    showLaunchIntro,
    isSplashVisible,
    showUpdateLog,
    snipMode.active,
    isSnipSessionActive,
  ]);

  const blurCanvasActiveTextEntry = (nextTarget?: EventTarget | null) => { return blurCanvasActiveTextEntryImpl({ isCanvasModeRef }, nextTarget); };

  const runCanvasAiNodeFromControl = (targetId: string) => { return runCanvasAiNodeFromControlImpl({ canvasItemsRef, generateCanvasAiGeneratorNode, generateCanvasWorkflowModuleNode }, targetId); };

  const handleCanvasAiRunPointerDown = (event: React.PointerEvent<HTMLButtonElement>, targetId: string) => { return handleCanvasAiRunPointerDownImpl({ canvasRunButtonPointerRef, runCanvasAiNodeFromControl }, event, targetId); };

  const handleCanvasAiRunClick = (event: React.MouseEvent<HTMLButtonElement>, targetId: string) => { return handleCanvasAiRunClickImpl({ canvasRunButtonPointerRef, runCanvasAiNodeFromControl }, event, targetId); };

  useEffect(() => { return runWindowSnipEffect09({ blurCanvasActiveTextEntry, isCanvasMode }); }, [isCanvasMode]);

  useEffect(() => { return runWindowSnipEffect10({ isCanvasModeRef, isDrawerActive, isTextEntryActive, shouldRouteShortcutToDoodle, undoLastCanvasChange, undoLastDrawerChange }); }, [isDrawerActive]);

  useEffect(() => { return runWindowSnipEffect11({ confirmDialog, displayItems, isDrawerActive, isSearchActive, isSelectMode, isSnipSessionActive, isTextEntryActive, isUtilityActiveTab, lastSelectedDrawerItemIdRef, selectedImage, selectedVideo, setIsSelectMode, showFolderModal, showMoveExistingFolderModal, showMoveFolderModal, showSettings, showTextInput, showWebImageCollector, snipMode, textInputDialog }); }, [
    isDrawerActive,
    isSelectMode,
    isUtilityActiveTab,
    displayItems.length,
    showSettings,
    showTextInput,
    showWebImageCollector,
    showFolderModal,
    showMoveFolderModal,
    showMoveExistingFolderModal,
    isSearchActive,
    textInputDialog.isOpen,
    confirmDialog.isOpen,
    selectedImage,
    selectedVideo,
    snipMode.active,
    isSnipSessionActive,
  ]);

  useEffect(() => { return runWindowSnipEffect12({ canvasWorkflowSaveDraft, closeCanvasWorkflowSaveDialog }); }, [canvasWorkflowSaveDraft]);

  const shouldBlockAutoClose = () => (
    licenseGateActiveRef.current ||
    Date.now() < drawerPanelInteractionHoldUntilRef.current ||
    isDraggingTitleRef.current ||
    startupAutoCloseSuppressedRef.current ||
    isGlobalMouseDown.current ||
    isResizingState.current ||
    isDraggingOver ||
    isMainWorkbenchActive ||
    isMainWorkbenchActiveRef.current ||
    isPinned ||
    isPinnedRef.current ||
    !!canvasBrushEditor ||
    !!selectedImage ||
    !!selectedVideo ||
    showLaunchIntro ||
    isSplashVisible ||
    showUpdateLog ||
    snipMode.active ||
    snipModeActiveRef.current ||
    snipExitInFlightRef.current ||
    isSnipSessionActive
  );

  const shouldBlockIdleAutoClose = () => (
    licenseGateActiveRef.current ||
    Date.now() < drawerPanelInteractionHoldUntilRef.current ||
    isDraggingTitleRef.current ||
    startupAutoCloseSuppressedRef.current ||
    isGlobalMouseDown.current ||
    isResizingState.current ||
    isDraggingOver ||
    isMainWorkbenchActive ||
    isMainWorkbenchActiveRef.current ||
    isPinned ||
    !!canvasBrushEditor ||
    !!selectedImage ||
    !!selectedVideo ||
    isTextEntryActive() ||
    isDrawerAgentOpen ||
    showTextInput ||
    showWebImageCollector ||
    showFolderModal ||
    showMoveFolderModal ||
    showMoveExistingFolderModal ||
    !!folderContextMenu ||
    editingFolderId !== null ||
    textInputDialog.isOpen ||
    confirmDialog.isOpen ||
    showLaunchIntro ||
    isSplashVisible ||
    showUpdateLog ||
    snipMode.active ||
    isSnipSessionActive
  );

  const clearIdleAutoClose = () => {
    if (idleAutoCloseTimerRef.current) {
      clearTimeout(idleAutoCloseTimerRef.current);
      idleAutoCloseTimerRef.current = null;
    }
  };

  const isCursorInsideDrawerWindow = async () => { return isCursorInsideDrawerWindowImpl({ appWindow, isPointerInsideDrawerRef }); };

  const requestAutoCloseDrawer = () => { return requestAutoCloseDrawerImpl({ clearIdleAutoClose, closeTimerRef, isPinnedRef, isPointerInsideDrawerRef, lastSelectedDrawerItemIdRef, setIsOpen, setIsPinned, setIsSelectMode, setSelectedIds, shouldBlockAutoClose }); };

  const holdDrawerForPanelInteraction = (duration = 1400) => { return holdDrawerForPanelInteractionImpl({ clearIdleAutoClose, closeTimerRef, drawerPanelInteractionHoldUntilRef, lastDrawerPointerDownAtRef }, duration); };

  const handleDrawerPanelPointerDown = (event: React.PointerEvent) => {
    holdDrawerForPanelInteraction();
    event.stopPropagation();
  };

  const handleDrawerPanelMouseDown = (event: React.MouseEvent) => {
    holdDrawerForPanelInteraction();
    event.stopPropagation();
  };

  const handleDrawerPanelKeyDown = () => {
    holdDrawerForPanelInteraction(1800);
  };

  const scheduleIdleAutoClose = (delay = 3000) => { return scheduleIdleAutoCloseImpl({ clearIdleAutoClose, drawerState, idleAutoCloseTimerRef, isDrawerActive, isPointerInsideDrawerRef, requestAutoCloseDrawer, shouldBlockIdleAutoClose }, delay); };

  const scheduleAutoClose = (delay = 180) => { return scheduleAutoCloseImpl({ clearIdleAutoClose, closeTimerRef, isCursorInsideDrawerWindow, isPointerInsideDrawerRef, requestAutoCloseDrawer }, delay); };

  const keepDrawerOpenByPointer = () => {
    startupAutoCloseSuppressedRef.current = false;
    isPointerInsideDrawerRef.current = true;
    clearIdleAutoClose();
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const handleFloatingLayerPointerLeave = (e: React.PointerEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    isPointerInsideDrawerRef.current = false;
    if (drawerState === 'open' && !shouldBlockAutoClose()) scheduleAutoClose(180);
    else scheduleAutoClose(3000);
  };

  useEffect(() => { return runWindowSnipEffect13({ confirmDialog, folderContextMenu, holdDrawerForPanelInteraction, isDrawerAgentOpen, showFolderModal, showMoveExistingFolderModal, showMoveFolderModal, showTextInput, showWebImageCollector, textInputDialog }); }, [
    showTextInput,
    showWebImageCollector,
    showFolderModal,
    showMoveFolderModal,
    showMoveExistingFolderModal,
    isDrawerAgentOpen,
    folderContextMenu,
    textInputDialog.isOpen,
    confirmDialog.isOpen,
  ]);

  useEffect(() => { return runWindowSnipEffect14({ appWindow, clearIdleAutoClose, closeTimerRef, drawerState, isDraggingOver, isDraggingTitleRef, isMainWorkbenchActiveRef, isOpen, isPinnedRef, isPointerInsideDrawerRef, isResizingState, isSelectMode, isSnipSessionActive, isSplashVisibleRef, lastDrawerPointerDownAtRef, lastSelectedDrawerItemIdRef, setIsOpen, setIsPinned, setIsSelectMode, setSelectedIds, shouldBlockAutoClose, showLaunchIntroRef, showUpdateLogRef, snipExitInFlightRef, snipModeActiveRef }); }, [
    isOpen,
    drawerState,
    isCanvasWorkbenchActive,
    canvasBrushEditor,
    selectedImage,
    selectedVideo,
    showTextInput,
    showWebImageCollector,
    showFolderModal,
    showMoveFolderModal,
    showMoveExistingFolderModal,
    isDrawerAgentOpen,
    folderContextMenu,
    isSearchActive,
    editingFolderId,
    textInputDialog.isOpen,
    confirmDialog.isOpen,
    showLaunchIntro,
    isSplashVisible,
    showUpdateLog,
    snipMode.active,
    isSelectMode,
    isSnipSessionActive,
    isDraggingOver,
  ]);

  useEffect(() => { return runWindowSnipEffect15({ clearIdleAutoClose, drawerState, isDrawerActive, isPointerInsideDrawerRef, scheduleIdleAutoClose, shouldBlockIdleAutoClose }); }, [
    isDrawerActive,
    drawerState,
    isPinned,
    isCanvasWorkbenchActive,
    selectedImage,
    selectedVideo,
    showTextInput,
    showWebImageCollector,
    showFolderModal,
    showMoveFolderModal,
    showMoveExistingFolderModal,
    isDrawerAgentOpen,
    folderContextMenu,
    isSearchActive,
    editingFolderId,
    textInputDialog.isOpen,
    confirmDialog.isOpen,
    showLaunchIntro,
    isSplashVisible,
    showUpdateLog,
    snipMode.active,
    isSnipSessionActive,
    isDraggingOver,
  ]);

  useEffect(() => { return runWindowSnipEffect16({ clearIdleAutoClose, isPointerInsideDrawerRef, scheduleIdleAutoClose }); }, [
    isDrawerActive,
    drawerState,
    isPinned,
    isCanvasWorkbenchActive,
    showTextInput,
    showWebImageCollector,
    showFolderModal,
    showMoveFolderModal,
    showMoveExistingFolderModal,
    isDrawerAgentOpen,
    folderContextMenu,
    editingFolderId,
    textInputDialog.isOpen,
    confirmDialog.isOpen,
    showLaunchIntro,
    isSplashVisible,
    showUpdateLog,
    snipMode.active,
    isSnipSessionActive,
  ]);

  const flashSelectedImageZoom = () => {
    setShowSelectedImageZoom(true);
    if (selectedImageZoomTimerRef.current) clearTimeout(selectedImageZoomTimerRef.current);
    selectedImageZoomTimerRef.current = setTimeout(() => {
      setShowSelectedImageZoom(false);
      selectedImageZoomTimerRef.current = null;
    }, 1000);
  };

  const startSelectedImagePanDrag = (e: React.MouseEvent | React.PointerEvent) => { return startSelectedImagePanDragImpl({ isGlobalMouseDown, selectedImagePanRef, setSelectedImagePan }, e); };

  const startPreviewWindowDrag = (e: React.MouseEvent | React.PointerEvent) => { return startPreviewWindowDragImpl({ appWindow, isDraggingTitleRef, isGlobalMouseDown, previewDragActiveRef, setIsDraggingTitle, setIsOpen }, e); };

  const startDrawerTitleDrag = (e: React.PointerEvent) => { return startDrawerTitleDragImpl({ appWindow, closeTimerRef, isDraggingTitleRef, isGlobalMouseDown, isMainWorkbenchActiveRef, isPinnedRef, isPointerInsideDrawerRef, setDrawerState, setIsDraggingTitle, setIsOpen, setIsPinned }, e); };

  const getQuickAccessVisual = (item: BufferItem & { isDirectory?: boolean; isUrl?: boolean }) => { return getQuickAccessVisualImpl({}, item); };

  const openQuickAccessItem = (item: BufferItem & { isDirectory?: boolean; isUrl?: boolean }, e: React.MouseEvent) => { return openQuickAccessItemImpl({ openSelectedImagePreview, showToast }, item, e); };

  const startResizingSidebarAreas = (e: React.PointerEvent) => { return startResizingSidebarAreasImpl({ folderRailHeight, setFolderRailHeight }, e); };

  const startResizingFolderSidebarWidth = (e: React.PointerEvent) => { return startResizingFolderSidebarWidthImpl({ DRAWER_FOLDER_SIDEBAR_MAX_WIDTH, DRAWER_FOLDER_SIDEBAR_MIN_WIDTH, drawerFolderSidebarWidth, drawerWidthRef, isFolderSidebarLayout, setDrawerFolderSidebarWidth }, e); };

  const getCanvasAgentVisualReferences = (canvasItem: CanvasImageItem): AgentCanvasVisualReference[] => { return getCanvasAgentVisualReferencesImpl({}, canvasItem); };

  const getCanvasAgentVisualReferencesForNodeInputs = (
    canvasItem: CanvasImageItem,
    sourceItems: CanvasImageItem[] = canvasItemsRef.current
  ) => { return getCanvasAgentVisualReferencesForNodeInputsImpl({ getCanvasAgentVisualReferences, getCanvasInputItemsForNode }, canvasItem, sourceItems); };

  const buildCanvasAgentSelectedItems = (
    sourceItems: CanvasImageItem[] = canvasItemsRef.current,
    sourceSelectedIds: string[] = canvasSelectedIdsRef.current,
  ): AgentCanvasSelectionItem[] => { return buildCanvasAgentSelectedItemsImpl({ getCanvasAgentVisualReferences, getCanvasAgentVisualReferencesForNodeInputs }, sourceItems, sourceSelectedIds); };

  const canvasAgentSelectedItems = useMemo<AgentCanvasSelectionItem[]>(() => [], []);

  const drawerAgentSelectedItems = useMemo<AgentCanvasSelectionItem[]>(() => {
    const selectedSet = new Set(selectedIds);
    return items.filter(item => selectedSet.has(item.id)).slice(0, 20).map(item => {
      const source = item.url || item.thumbnail || (item.path ? convertFileSrc(item.path) : '');
      const mediaType = item.type === 'video' ? 'video' : item.type === 'image' ? 'image' : null;
      const localPath = item.path && !/^(?:https?:|data:|asset:)/i.test(item.path) ? item.path : undefined;
      const references: AgentCanvasVisualReference[] = mediaType && source
        ? [{
            id: `drawer-${item.id}`,
            nodeId: item.id,
            name: item.name || item.content || '抽屉素材',
            mediaType,
            source,
            path: localPath,
            thumbnail: item.thumbnail || source,
          }]
        : [];
      return {
        id: item.id,
        name: item.name || item.content || '抽屉素材',
        type: item.type,
        thumbnail: item.thumbnail || (item.type === 'image' ? source : undefined),
        prompt: item.remark || item.content || undefined,
        referenceCount: references.length,
        references: references.length > 0 ? references : undefined,
      };
    });
  }, [items, selectedIds]);

  const prepareCanvasAgentVisualReferences = async (
    references: AgentCanvasVisualReference[],
    provider: 'openai-compatible' | 'codex',
    maxReferences = 6,
  ): Promise<AgentCanvasVisualReference[]> => prepareAgentVisualReferences(references, {
    provider,
    toModelDataUrl: imageSourceToModelDataUrl,
    maxReferences,
  });

  const analyzeDrawerInspirationWithLlm = async (input: {
    itemId: string;
    imageSource?: string;
    existingProfile?: InspirationProfile;
    userTags?: string[];
    userNotes?: string[];
    forceRefresh?: boolean;
  }): Promise<InspirationProfile> => { return analyzeDrawerInspirationWithLlmImpl({ assetStorageMode, imageSourceToDataUrl, inspirationRetrievalCacheRef, itemsRef, setItems, updateAssetsFromQuery }, input); };

  const isAutoAiTaggableItem = (item: BufferItem) => {
    if (
      item.type !== 'image'
      || hasUsableInspirationAiTags(item.inspirationProfile)
      || !Boolean(item.url || item.thumbnail || item.path || item.sourceUrl || item.originalUrl)
    ) return false;
    if (!item.inspirationAnalysisFailure) return true;
    return canRetryInspirationAnalysis(item.inspirationAnalysisFailure);
  };

  const recordAutoAiAnalysisFailure = async (itemId: string, error: unknown) => { return recordAutoAiAnalysisFailureImpl({ assetStorageMode, itemsRef, setItems, updateAssetsFromQuery }, itemId, error); };

  const scheduleAutoAiAnalysisRetry = (failure?: BufferItem['inspirationAnalysisFailure']) => {
    if (!failure || !isRetryableInspirationAnalysisFailure(failure)) return;
    const delay = Math.max(0, getInspirationAnalysisRetryAt(failure) - Date.now()) + 100;
    const timer = window.setTimeout(() => {
      autoInspirationAnalysisRetryTimersRef.current.delete(timer);
      setAutoAiAnalysisRetryTick(current => current + 1);
    }, delay);
    autoInspirationAnalysisRetryTimersRef.current.add(timer);
  };

  const enqueueAutoAiTaggingForItems = (incomingItems: BufferItem[]) => { return enqueueAutoAiTaggingForItemsImpl({ AUTO_INSPIRATION_ANALYSIS_ENABLED, assetStorageMode, autoInspirationAnalysisAttemptedRef, autoInspirationAnalysisPendingIdsRef, isAutoAiTaggableItem, setAutoAiAnalysisProgress, setAutoAiAnalysisRetryTick }, incomingItems); };

  useEffect(() => { return runInspirationAgentEffect01({ autoInspirationAnalysisLastUserActivityAtRef }); }, []);

  const startDrawerInspirationAnalysisBatch = (input: {
    itemIds: string[];
    forceRefresh?: boolean;
    priority?: 'low' | 'normal' | 'high';
  }) => { return startDrawerInspirationAnalysisBatchImpl({ analyzeDrawerInspirationWithLlm, inspirationAnalysisJobsRef, itemsRef }, input); };

  const retrieveDrawerInspirationCandidates = async (
    input: DrawerSearchInspirationsInput,
  ): Promise<InspirationCandidate[]> => { return retrieveDrawerInspirationCandidatesImpl({ agentModelRef, assetStorageMode, foldersRef, inspirationRetrievalCacheRef, itemsRef, totalAssetCount }, input); };

  useEffect(() => { return runInspirationAgentEffect02({ AUTO_INSPIRATION_ANALYSIS_ENABLED, AUTO_INSPIRATION_ANALYSIS_UI_IDLE_MS, analyzeDrawerInspirationWithLlm, assetStorageMode, autoInspirationAnalysisAttemptedRef, autoInspirationAnalysisLastUserActivityAtRef, autoInspirationAnalysisPendingIdsRef, autoInspirationAnalysisRetryTimersRef, autoInspirationAnalysisRunningRef, isAutoAiAnalysisStartupReady, isAutoAiTaggableItem, isDataLoaded, isDraggingTitle, isResizingState, items, itemsRef, recordAutoAiAnalysisFailure, scheduleAutoAiAnalysisRetry, setAutoAiAnalysisProgress, setAutoAiAnalysisRetryTick, setSqliteAiAnalysisSummary, updateAssetsFromQuery }); }, [
    assetStatsRevision,
    assetStorageMode,
    autoAiAnalysisProgress,
    autoAiAnalysisRetryTick,
    isDataLoaded,
    isAutoAiAnalysisStartupReady,
    isDraggingTitle,
    items,
  ]);

  const canvasAgent = useCanvasAgentBridge({ activeFolderIdStateRef, activeTabRef, activeWorkflowDraftId, activeWorkflowDraftRef, addDrawerMediaItemToCanvas, addWebImageUrl, analyzeDrawerInspirationWithLlm, appendCanvasItems, appWindow, assetStorageMode, AUTO_INSPIRATION_ANALYSIS_ENABLED, buildAgentCalendarEvents, buildCanvasAgentSelectedItems, buildCanvasAiGeneratorNode, buildCanvasEnhancementNode, buildCanvasFrameInterpolationNode, buildCanvasImageFusionNode, buildCanvasWorkflowModuleNode, buildCanvasWorkflowSaveDraftFromSelection, CALENDAR_NEW_NOTE_TARGET, calendarEvents, calendarMonth, calendarSelectedDate, calendarTagFilter, calendarTargetNoteLabel, canvasAiPromptPresets, canvasAiProvider, canvasItemsRef, canvasScaleRef, canvasSelectedIdsRef, canvasSurfaceRef, canvasTextAreaRefs, canvasWorkflowTemplates, connectCanvasItems, createAssetId, createCanvasTextItemFromContent, createDrawerMediaCanvasNode, createFloatingNote, createTextOrUrlItem, createWorkflowAttachmentImageCanvasNode, deleteCalendarScheduleItem, drawerAgentSelectedItems, drawerOrganizationPlansRef, duplicateCanvasItems, ensureCalendarScheduleNote, enterCanvasMode, fitCanvasViewToItems, foldersRef, generateCanvasAiGeneratorNode, generateCanvasWorkflowModuleNode, getCanvasDropPosition, getCanvasItemsBounds, getSelectedCanvasAiInputIds, getSelectedCanvasImageFusionInputIds, getSelectedEnhancementInputIds, getSelectedFrameInterpolationInputIds, handleDeleteFolder, handleOpenTextInput, handleTogglePin, insertDrawerFolderAtTop, inspirationAnalysisJobsRef, isCanvasModeRef, isPinnedRef, itemsRef, jumpCalendarToday, leaveCanvasToDrawer, makeCanvasNodeId, openSelectedImagePreview, openSelectedVideoPreview, organizeCanvasItems, patchCalendarScheduleItem, persistFoldersSnapshot, prepareCanvasAgentVisualReferences, pushCanvasUndoSnapshot, pushDrawerUndoSnapshot, removeCanvasConnection, removeCanvasItemsByIds, removeDrawerItemsFromDrawer, retrieveDrawerInspirationCandidates, runCanvasTextAgentNode: (targetId: string) => runCanvasTextAgentNode(targetId), runSelectedCanvasWorkflowModules, scheduleCanvasFocusItemById, searchQuery, selectedIds, setActiveDraftForDisplay, setActiveFolderId, setActiveTab, setActiveWorkflowDraftId, setAssetStatsRevision, setCalendarMonth, setCalendarSelectedDate, setCalendarTargetNoteLabel, setCustomCanvasAiPromptPresets, setCustomCanvasWorkflows, setDrawerState, setFolders, setIsDrawerAgentOpen, setIsOpen, setIsPinned, setIsSearchActive, setIsSelectMode, setItems, setQuickAccessItems, setSearchQuery, setSelectedIds, setShowSettings, setShowTextInput, setShowWebImageCollector, setShowWorkflowDraftPanel, showToast, startDrawerInspirationAnalysisBatch, stateRef, syncCalendarScheduleSnapshot, undoLastCanvasChange, undoLastDrawerChange, updateCanvasAiGeneratorData, updateCanvasItemsImmediate, updateCanvasNodesForPreset, updateCanvasSelection, updateCanvasTextItem, zoomCanvasAt });
  workflowResultPublisherRef.current = (result) => {
    setCanvasWorkflowProgress(result);
    canvasAgent.appendWorkflowResult(result);
  };

  const chatImageModelOptions = useMemo<ChatImageModelOption[]>(() => (
    canvasAiUnifiedImageModelOptions
      .filter(option => !option.disabled)
      .map(option => {
        const choice = parseCanvasAiModelChoiceValue(option.value);
        return {
          value: option.label,
          label: option.label,
          hint: option.hint,
          meta: choice?.source === 'local' ? '本地 API' : '账号额度',
        };
      })
  ), [canvasAiUnifiedImageModelOptions]);
  const [chatImageModel, setChatImageModel] = useState(() => (
    localStorage.getItem(CHAT_IMAGE_MODEL_STORAGE_KEY) || ''
  ));
  const activeChatImageModel = chatImageModelOptions.some(option => option.value === chatImageModel)
    ? chatImageModel
    : chatImageModelOptions[0]?.value || '';
  const activeChatImageModelChoice = canvasAiUnifiedImageModelOptions
    .find(option => !option.disabled && option.label === activeChatImageModel);
  const activeChatImageModelConfig = activeChatImageModelChoice
    ? parseCanvasAiModelChoiceValue(activeChatImageModelChoice.value)
    : null;
  const activeChatImageModelCandidates = activeChatImageModelConfig?.providerCandidates || [];
  const activeChatImageModelCandidate = activeChatImageModelCandidates[0];
  const activeChatImageCatalogModel = findAiCatalogModel(
    getAiCatalogModels(canvasAiCloudImageModels, 'image'),
    activeChatImageModelCandidate?.canonicalModelId || activeChatImageModelConfig?.model,
  );
  const chatLegacyImageResolutionValues = activeChatImageModelCandidates.length > 0
    ? getCanvasAiImageResolutionValuesForCandidates(activeChatImageModelCandidates)
    : getCanvasAiImageResolutionValues(
      activeChatImageModelConfig?.provider,
      activeChatImageModelConfig?.model,
    );
  const chatResolvedImageCapabilities = resolveImageModelCapabilities({
    canonical: activeChatImageCatalogModel?.capabilities,
    route: activeChatImageModelCandidate?.modelCapabilities,
    legacy: { resolutions: chatLegacyImageResolutionValues },
  });
  const chatImageResolutionValues = Array.from(new Set([
    ...chatResolvedImageCapabilities.resolutions,
    ...chatLegacyImageResolutionValues,
  ]));
  const chatImageResolutionOptions = useMemo<ChatImageModelOption[]>(() => (
    chatImageResolutionValues.length > 0
      ? chatImageResolutionValues.map(value => ({ value, label: value.toUpperCase() }))
      : [{ value: '', label: '模型默认' }]
  ), [chatImageResolutionValues.join('|')]);
  const [chatImageResolution, setChatImageResolution] = useState(() => (
    localStorage.getItem(CHAT_IMAGE_RESOLUTION_STORAGE_KEY) || CANVAS_AI_DEFAULT_IMAGE_RESOLUTION
  ));
  const activeChatImageResolution = chatImageResolutionOptions.some(option => option.value === chatImageResolution)
    ? chatImageResolution
    : chatImageResolutionOptions[0]?.value || '';
  const chatImageAspectRatioValues = getImageAspectRatioOptionsForResolution(
    chatResolvedImageCapabilities,
    activeChatImageResolution,
  );
  const chatImageAspectRatioOptions = useMemo<ChatImageModelOption[]>(() => (
    chatImageAspectRatioValues.length > 0
      ? chatImageAspectRatioValues.map(value => ({
        value,
        label: formatCanvasAiAspectRatioOptionLabel(value),
      }))
      : getCanvasAiAspectRatioOptionsForModel(
        activeChatImageModelConfig?.model,
        activeChatImageResolution,
      ).map(option => ({ value: option.value, label: option.label, hint: option.hint }))
  ), [activeChatImageModelConfig?.model, activeChatImageResolution, chatImageAspectRatioValues.join('|')]);
  const [chatImageAspectRatio, setChatImageAspectRatio] = useState(() => (
    localStorage.getItem(CHAT_IMAGE_ASPECT_RATIO_STORAGE_KEY) || CANVAS_AI_DEFAULT_ASPECT_RATIO
  ));
  const activeChatImageAspectRatio = chatImageAspectRatioValues.length > 0
    ? normalizeCapabilityOption(
      chatImageAspectRatioValues,
      chatImageAspectRatio,
      CANVAS_AI_DEFAULT_ASPECT_RATIO,
    )
    : normalizeCanvasAiAspectRatioForModel(
      activeChatImageModelConfig?.model,
      chatImageAspectRatio,
      activeChatImageResolution,
    );
  useEffect(() => {
    if (!activeChatImageModel || activeChatImageModel === chatImageModel) return;
    setChatImageModel(activeChatImageModel);
  }, [activeChatImageModel, chatImageModel]);
  useEffect(() => {
    if (activeChatImageModel) localStorage.setItem(CHAT_IMAGE_MODEL_STORAGE_KEY, activeChatImageModel);
  }, [activeChatImageModel]);
  useEffect(() => {
    if (activeChatImageResolution !== chatImageResolution) setChatImageResolution(activeChatImageResolution);
    if (activeChatImageResolution) localStorage.setItem(CHAT_IMAGE_RESOLUTION_STORAGE_KEY, activeChatImageResolution);
    else localStorage.removeItem(CHAT_IMAGE_RESOLUTION_STORAGE_KEY);
  }, [activeChatImageResolution, chatImageResolution]);
  useEffect(() => {
    if (activeChatImageAspectRatio !== chatImageAspectRatio) setChatImageAspectRatio(activeChatImageAspectRatio);
    localStorage.setItem(CHAT_IMAGE_ASPECT_RATIO_STORAGE_KEY, activeChatImageAspectRatio);
  }, [activeChatImageAspectRatio, chatImageAspectRatio]);

  const generateChatMedia = (
    toolName: 'generate_image' | 'edit_image' | 'generate_video',
    args: Record<string, unknown>,
  ) => runChatMediaGeneration({
    toolName,
    args,
    sourceItems: () => canvasItemsRef.current,
    buildGeneratorNode: (position, inputIds, mediaType) => (
      buildCanvasAiGeneratorNode(position, undefined, inputIds, mediaType)
    ),
    runGenerator: (target, options) => runCanvasAiGeneratorTarget(target, options),
  });

  const executeChatTool = createInspirationChatToolExecutor({
    executeExistingTool: (name, args, execution) => canvasAgent.executeExternalTool(name, args, execution),
    generateMedia: generateChatMedia,
    listWorkflowDescriptors: () => canvasWorkflowTemplates,
    searchWeb: (query, limit) => invoke('chat_web_search', { query, limit }),
    createFile: request => invoke('chat_create_file', { request }),
    getCanvasItems: () => canvasItemsRef.current,
    getSelectedCanvasIds: () => canvasSelectedIdsRef.current,
  });

  const addChatMediaToCanvas = async (
    media: ChatGeneratedMedia,
    options: { autoFocus?: boolean } = {},
  ) => { return addChatMediaToCanvasImpl({ canvasAgent, canvasItemsRef, enterCanvasMode, isCanvasModeRef, scheduleCanvasFocusItemById, showToast, updateCanvasItemsImmediate }, media, options); };

  const createChatBatchCanvasGroup = async (payload: ChatBatchStartedPayload) => { return createChatBatchCanvasGroupImpl({ appendCanvasItems, canvasItemsRef, canvasRectsIntersect, createAssetId, enterCanvasMode, fitCanvasViewToItems, getCanvasDropPosition, isCanvasModeRef, updateCanvasSelection }, payload); };

  const fillChatBatchCanvasSlot = async (payload: ChatBatchMediaReadyPayload) => { return fillChatBatchCanvasSlotImpl({ canvasImageSourceCacheRef, canvasItemsPatchCommitRef, canvasItemsRef, createAssetId, itemsRef, markCanvasNodesChanged, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, updateCanvasItemsImmediate }, payload); };

  const completeChatBatchCanvasGroup = async (payload: ChatBatchCompletedPayload) => { return completeChatBatchCanvasGroupImpl({ canvasItemsPatchCommitRef, canvasItemsRef, markCanvasNodesChanged, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, showToast, updateCanvasItemsImmediate }, payload); };

  const [agentModels, setAgentModels] = useState<string[]>([]);
  const [agentModelsLoading, setAgentModelsLoading] = useState(false);
  const [agentCustomProvider, setAgentCustomProvider] = useState('openai-compatible');
  const [agentCustomBaseUrl, setAgentCustomBaseUrl] = useState('https://api.openai.com/v1');
  const [agentCustomApiKey, setAgentCustomApiKey] = useState('');
  const [agentCustomSaving, setAgentCustomSaving] = useState(false);
  const agentModelsRef = useRef<string[]>([]);
  const agentModelRepairKeyRef = useRef('');
  const agentModelsProfileKeyRef = useRef('');
  const agentModelsFlightRef = useRef<{
    profileKey: string;
    promise: Promise<string[]>;
  } | null>(null);
  const agentModelsProfileKey = JSON.stringify([
    canvasAgent.settings.provider,
    canvasAgent.settings.apiGatewayKind,
    canvasAgent.settings.apiProvider,
    canvasAgent.settings.apiBaseUrl,
    canvasAgent.settings.apiHeaders,
    canvasAgent.settings.apiCredentialSource,
    canvasAgent.settings.hasApiKey,
    canvasAgent.settings.apiKeyLast4,
    licenseStatus?.valid,
    cloudAccount?.email,
  ]);

  const refreshAgentModels = useCallback((force = false): Promise<string[]> => {
    if (canvasAgent.settingsLoading) return Promise.resolve(agentModelsRef.current);
    const profileKey = agentModelsProfileKey;
    const currentFlight = agentModelsFlightRef.current;
    if (!force && currentFlight?.profileKey === profileKey) return currentFlight.promise;

    setAgentModelsLoading(true);
    const flight: { profileKey: string; promise: Promise<string[]> } = {
      profileKey,
      promise: Promise.resolve([]),
    };
    flight.promise = canvasAgent.listOpenAiModels()
      .then(models => {
        const seen = new Set<string>();
        const available = (models || []).flatMap(model => {
          const value = model.trim();
          const key = value.toLowerCase();
          if (!value || seen.has(key)) return [];
          seen.add(key);
          return [value];
        });
        if (
          agentModelsFlightRef.current === flight
          && agentModelsProfileKeyRef.current === profileKey
          && available.length > 0
        ) {
          cacheAvailableAgentModels(available);
          agentModelsRef.current = available;
          setAgentModels(available);
          const modelResolution = resolveValidAgentModel({
            savedModel: canvasAgent.settings.apiModel,
            availableModels: available,
            usageContext: 'system_internal',
            fallbackModel: DEFAULT_AGENT_SETTINGS.apiModel,
          });
          if (modelResolution.fallbackUsed) {
            const savedModel = canvasAgent.settings.apiModel;
            const repairKey = `${profileKey}:${savedModel.toLowerCase()}`;
            agentModelRef.current = modelResolution.resolvedModel;
            if (agentModelRepairKeyRef.current !== repairKey) {
              agentModelRepairKeyRef.current = repairKey;
              console.warn('[agent-model-fallback]', {
                context: 'system_internal',
                savedModel,
                reason: modelResolution.fallbackReason || 'not_in_available_models',
                fallbackTarget: modelResolution.resolvedModel,
                requestId: `model_refresh_${Date.now().toString(36)}`,
              });
              void canvasAgent.saveSettings({
                ...canvasAgent.settings,
                apiModel: modelResolution.resolvedModel,
              }).catch(error => {
                if (agentModelRepairKeyRef.current === repairKey) {
                  agentModelRef.current = savedModel;
                }
                console.warn('Repairing stale Agent model selection failed:', error);
              }).finally(() => {
                if (agentModelRepairKeyRef.current === repairKey) {
                  agentModelRepairKeyRef.current = '';
                }
              });
            }
          }
        }
        return available;
      })
      .catch(error => {
        console.warn('读取 Chat 模型列表失败:', error);
        return agentModelsRef.current;
      })
      .finally(() => {
        if (agentModelsFlightRef.current === flight) {
          agentModelsFlightRef.current = null;
          setAgentModelsLoading(false);
        }
      });
    agentModelsFlightRef.current = flight;
    return flight.promise;
  }, [
    agentModelsProfileKey,
    canvasAgent.listOpenAiModels,
    canvasAgent.saveSettings,
    canvasAgent.settings,
    canvasAgent.settingsLoading,
  ]);

  useEffect(() => {
    const profileChanged = agentModelsProfileKeyRef.current !== agentModelsProfileKey;
    agentModelsProfileKeyRef.current = agentModelsProfileKey;
    if (profileChanged) {
      clearAvailableAgentModels();
      agentModelRepairKeyRef.current = '';
      agentModelsRef.current = [];
      setAgentModels([]);
    }
    if (!canvasAgent.settingsLoading) void refreshAgentModels();
  }, [agentModelsProfileKey, canvasAgent.settingsLoading, refreshAgentModels]);

  useEffect(() => {
    if (canvasAgent.settingsLoading || (!isCanvasMode && !isDrawerAgentOpen)) return;
    void refreshAgentModels();
  }, [canvasAgent.settingsLoading, isCanvasMode, isDrawerAgentOpen, refreshAgentModels]);

  useEffect(() => { return runChatCanvasEffect01({ canvasAgent, isByokUnlocked, setAgentCustomBaseUrl, setAgentCustomProvider }); }, [canvasAgent.settings.apiBaseUrl, canvasAgent.settings.apiProvider, isByokUnlocked]);
  if (!agentModelRepairKeyRef.current) {
    agentModelRef.current = canvasAgent.settings.apiModel;
  }

  const switchAgentFundingSource = async (source: 'wallet' | 'codex' | 'custom') => { return switchAgentFundingSourceImpl({ agentCustomBaseUrl, agentCustomProvider, canvasAgent, showToast }, source); };

  const saveAgentCustomApi = async () => { return saveAgentCustomApiImpl({ agentCustomApiKey, agentCustomBaseUrl, agentCustomProvider, canvasAgent, refreshAgentModels, setAgentCustomApiKey, setAgentCustomSaving, showToast }); };

  const setCanvasTextAgentRunning = (canvasId: string, running: boolean) => {
    setCanvasTextAgentRunningIds(prev => {
      const exists = prev.includes(canvasId);
      if (running) return exists ? prev : [...prev, canvasId];
      return exists ? prev.filter(id => id !== canvasId) : prev;
    });
  };

  const buildCanvasTextAgentUserContent = (
    text: string,
    references: AgentCanvasVisualReference[],
    seedanceMode = false,
  ) => { return buildCanvasTextAgentUserContentImpl({}, text, references, seedanceMode); };

  const runCanvasTextAgentTarget = async (
    target: CanvasImageItem,
    options: {
      sourceItems?: () => CanvasImageItem[];
      updateTextOutput: (output: string) => void;
      getLatestTarget?: () => CanvasImageItem | undefined;
      showResultToast?: boolean;
      showReferenceToast?: boolean;
    }
  ) => { return runCanvasTextAgentTargetImpl({ agentModelRef, buildCanvasTextAgentUserContent, canvasAgent, canvasItemsRef, getCanvasAgentVisualReferencesForNodeInputs, getCanvasContextRoutingTargetsForAgent, getCanvasTextInputsForNode, prepareCanvasAgentVisualReferences, showToast }, target, options); };

  const runCanvasTextAgentNode = async (targetId: string) => { return runCanvasTextAgentNodeImpl({ canvasItemsRef, canvasTextAgentRunningIds, canvasTextAreaRefs, canvasTextOutputAreaRefs, canvasTextOutputDraftTimersRef, canvasTextOutputDraftValuesRef, commitCanvasTextDraft, getCanvasAiErrorSummary, pushCanvasUndoSnapshot, runCanvasTextAgentTarget, setCanvasTextAgentRunning, showToast, updateCanvasSelection, updateCanvasTextOutputItem }, targetId); };

  useEffect(() => { return runChatCanvasEffect02({ canvasAgent, licenseStatus }); }, [
    canvasAgent.refreshSettings,
    licenseStatus?.valid,
    licenseStatus?.edition,
    licenseStatus?.expire_at,
    licenseStatus?.error_code,
    licenseStatus?.ai_access?.mode,
    licenseStatus?.ai_access?.managed_provider,
    licenseStatus?.ai_access?.managed_base_url,
    licenseStatus?.ai_access?.managed_model,
    licenseStatus?.ai_access?.managed_gateway_kind,
    licenseStatus?.ai_access?.canvas_provider,
    licenseStatus?.ai_access?.canvas_base_url,
    licenseStatus?.ai_access?.canvas_model,
    licenseStatus?.ai_access?.canvas_gateway_kind,
  ]);

  useEffect(() => {
    writeAgentSidebarWidth(canvasAgentSidebarWidth);
    if (!isCanvasMode) return;
    const frame = window.requestAnimationFrame(() => updateCanvasViewportNow());
    return () => window.cancelAnimationFrame(frame);
  }, [canvasAgentSidebarWidth, isCanvasMode]);

  const isCalendarCompactScale = drawerWidth <= CALENDAR_COMPACT_DRAWER_WIDTH;
  const calendarAvailableWidth = Math.max(1, drawerWidth - DRAWER_SIDE_RAIL_WIDTH - DRAWER_CONTENT_X_PADDING);
  const calendarPageScale = isCalendarCompactScale
    ? clamp(calendarAvailableWidth / CALENDAR_COMPACT_CANVAS_WIDTH, 0.62, 1)
    : 1;
  const calendarPageStyle = isCalendarCompactScale
    ? ({ width: CALENDAR_COMPACT_CANVAS_WIDTH, zoom: calendarPageScale } as React.CSSProperties & { zoom: number })
    : undefined;
  const deferredCanvasItems = React.useDeferredValue(canvasItems);
  const canvasItemsForNav = deferredCanvasItems;
  const canvasGeneratedItemsForList = useMemo<CanvasGeneratedListEntry[]>(
    () => buildCanvasGeneratedItemsForList(deferredCanvasItems),
    [deferredCanvasItems],
  );
  const canvasGeneratedItemsForRender = useMemo(
    () => canvasGeneratedItemsForList.slice(0, CANVAS_GENERATED_LIST_RENDER_LIMIT),
    [canvasGeneratedItemsForList],
  );
  const canvasGeneratedDownloadableItems = useMemo(
    () => canvasGeneratedItemsForList.filter(entry => (
      entry.ai?.status !== 'working'
      && entry.ai?.status !== 'error'
      && !!getCanvasItemNavSource(entry.item)
    )),
    [canvasGeneratedItemsForList],
  );
  const canvasGeneratedSelectedIdSet = useMemo(
    () => new Set(canvasGeneratedSelectedIds),
    [canvasGeneratedSelectedIds],
  );
  const canvasGeneratedSelectedDownloadItems = useMemo(
    () => canvasGeneratedDownloadableItems
      .filter(entry => canvasGeneratedSelectedIdSet.has(entry.id))
      .map(entry => entry.item),
    [canvasGeneratedDownloadableItems, canvasGeneratedSelectedIdSet],
  );
  const getCanvasItemRenderedBox = (canvasItem: CanvasImageItem): CanvasItemBox => { return getCanvasItemRenderedBoxImpl({ getCanvasAiNodeDesignSizeForItem }, canvasItem); };
  const canvasNavItems = useMemo(() => canvasItemsForNav.map(item => ({
    item,
    box: getCanvasItemRenderedBox(item),
  })), [canvasItemsForNav, canvasAiPromptEditingId]);
  const canvasSelectedIdsSet = useMemo(() => new Set(canvasSelectedIds), [canvasSelectedIds]);
  const canvasSelectedBoxesForRender = useMemo(() => (
    canvasSelectedIds.length > 1
      ? canvasItems.filter(item => canvasSelectedIdsSet.has(item.id)).map(getCanvasItemRenderedBox)
      : []
  ), [canvasItems, canvasSelectedIds, canvasSelectedIdsSet, canvasAiPromptEditingId]);
  const canvasSelectedBounds = useMemo(() => (canvasSelectedBoxesForRender.length > 1 ? {
    x: Math.min(...canvasSelectedBoxesForRender.map(box => box.x)),
    y: Math.min(...canvasSelectedBoxesForRender.map(box => box.y)),
    width: Math.max(...canvasSelectedBoxesForRender.map(box => box.x + box.width)) - Math.min(...canvasSelectedBoxesForRender.map(box => box.x)),
    height: Math.max(...canvasSelectedBoxesForRender.map(box => box.y + box.height)) - Math.min(...canvasSelectedBoxesForRender.map(box => box.y)),
  } : null), [canvasSelectedBoxesForRender]);
  const canvasSingleSelectedItemForRender = useMemo(() => (
    canvasSelectedIds.length === 1
      ? canvasItems.find(item => item.id === canvasSelectedIds[0]) || null
      : null
  ), [canvasItems, canvasSelectedIds]);
  const canvasSingleSelectedBoxForRender = useMemo(() => (
    canvasSingleSelectedItemForRender
      ? getCanvasItemRenderedBox(canvasSingleSelectedItemForRender)
      : null
  ), [canvasSingleSelectedItemForRender, canvasAiPromptEditingId]);
  const canvasScaledSelectionRadius = CANVAS_SELECTION_RADIUS;
  const canvasScaledNodeRadius = CANVAS_NODE_RADIUS;
  const canvasRenderScale = clamp(canvasScale || 1, CANVAS_MIN_SCALE, CANVAS_MAX_SCALE);
  const canvasItemsById = useMemo(() => new Map(canvasItems.map(item => [item.id, item])), [canvasItems]);
  const canvasRenderViewport = useMemo<CanvasItemBox | null>(() => {
    if (!canvasViewport) return null;
    const overscan = isCanvasInteractingRef.current ? CANVAS_INTERACTION_OVERSCAN_PX : CANVAS_VIEWPORT_OVERSCAN_PX;
    return {
      x: canvasViewport.x - overscan,
      y: canvasViewport.y - overscan,
      width: canvasViewport.width + overscan * 2,
      height: canvasViewport.height + overscan * 2,
    };
  }, [canvasViewport]);
  const canvasGroupOutlinesForRender = useMemo(() => (
    getCanvasGroupOutlines(canvasItems, getCanvasItemRenderedBox)
      .filter(outline => (
        !canvasRenderViewport
        || outline.itemIds.some(id => canvasSelectedIdsSet.has(id))
        || canvasRectsIntersect(canvasRenderViewport, outline.bounds)
      ))
  ), [
    canvasAiPromptEditingId,
    canvasItems,
    canvasRenderViewport,
    canvasSelectedIdsSet,
  ]);
  const canvasAlwaysRenderedIds = useMemo(() => {
    const ids = new Set<string>();
    if (activeThreeSceneId) ids.add(activeThreeSceneId);
    if (canvasInputMenuForId) ids.add(canvasInputMenuForId);
    if (canvasAiPromptEditingId) ids.add(canvasAiPromptEditingId);
    if (canvasPromptOptimizingId) ids.add(canvasPromptOptimizingId);
    if (canvasInputPickTargetId) ids.add(canvasInputPickTargetId);
    if (canvasConnectionDraft) {
      ids.add(canvasConnectionDraft.fromId);
      canvasConnectionDraft.sourceIds.forEach(id => ids.add(id));
    }
    if (canvasInputActionDraft) ids.add(canvasInputActionDraft.targetId);
    return ids;
  }, [
    canvasAiPromptEditingId,
    canvasConnectionDraft,
    canvasInputActionDraft,
    canvasInputMenuForId,
    canvasInputPickTargetId,
    canvasPromptOptimizingId,
  ]);
  const canvasViewportRenderableItems = useMemo(() => {
    if (!canvasRenderViewport) return canvasItems;
    return canvasItems.filter(item => (
      canvasAlwaysRenderedIds.has(item.id)
      || canvasRectsIntersect(canvasRenderViewport, getCanvasItemRenderedBox(item))
    ));
  }, [
    canvasAlwaysRenderedIds,
    canvasAiPromptEditingId,
    canvasItems,
    canvasRenderViewport,
  ]);
  const canvasRenderableItems = useMemo(() => {
    if (!canvasRenderViewport || canvasSelectedIds.length === 0) return canvasViewportRenderableItems;
    const supplementalSelectedItems = canvasSelectedIds.reduce<CanvasImageItem[]>((items, id) => {
      if (canvasAlwaysRenderedIds.has(id)) return items;
      const item = canvasItemsById.get(id);
      if (!item || canvasRectsIntersect(canvasRenderViewport, getCanvasItemRenderedBox(item))) return items;
      items.push(item);
      return items;
    }, []);
    return supplementalSelectedItems.length > 0
      ? [...canvasViewportRenderableItems, ...supplementalSelectedItems]
      : canvasViewportRenderableItems;
  }, [
    activeThreeSceneId,
    canvasAiPromptEditingId,
    canvasAlwaysRenderedIds,
    canvasItemsById,
    canvasRenderViewport,
    canvasSelectedIds,
    canvasViewportRenderableItems,
  ]);
  useEffect(() => { return runDerivedUiEffect01({ activeCanvasIdRef, addGeneratedImagesToDrawer, canvasAiTimedOutRecoveryInFlightRef, canvasAiTimedOutRecoverySettledRef, canvasItems, canvasItemsRef, enqueueCanvasAiOutputThumbnailJob, getCanvasAiErrorSummary, isCanvasMode, refreshCloudAccount, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, setCanvasAiTimedOutRecoveryTick, showToast, updateCanvasItemsImmediate }); }, [isCanvasMode, canvasItems, canvasAiTimedOutRecoveryTick]);
  useEffect(() => { return runDerivedUiEffect02({ CANVAS_AI_OUTPUT_SOURCE_RECOVERY_RETRY_DELAY_MS, cacheCanvasGeneratedImageSource, canvasAiOutputSourceRecoveryAttemptedRef, canvasAiOutputSourceRecoveryInFlightRef, canvasAiOutputSourceRecoveryRetryAtRef, canvasItems, enqueueCanvasAiOutputThumbnailJob, isCanvasMode, itemsRef, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, setCanvasAiOutputSourceRecoveryTick, setItems, updateCanvasItemsImmediate }); }, [isCanvasMode, canvasItems, canvasAiOutputSourceRecoveryTick]);
  useEffect(() => { return runDerivedUiEffect03({ CANVAS_AI_OUTPUT_CACHE_STALE_MS, canvasAiOutputThumbnailRecoveryAttemptedRef, canvasPanRef, canvasRenderableItems, enqueueCanvasAiOutputThumbnailJob, ensureImageThumbnail, isCanvasInteractingRef, isCanvasMode, isCanvasZoomingRef, scheduleCanvasChangedNodesPatchSave, scheduleCanvasStateSave, updateCanvasItemsImmediate }); }, [isCanvasMode, canvasRenderableItems]);
  const getCanvasItemNavPreview = useCallback((canvasItem: CanvasImageItem): CanvasNavPreview | null => {
    const directPreview = getCanvasBufferItemNavPreview(canvasItem.item);
    if (directPreview) return directPreview;

    const outputPreview = getCanvasAiOutputPreviewSlots(canvasItem)
      .map(output => getCanvasOutputNavPreview(canvasItem, output))
      .find((preview): preview is { source: string; mediaType: 'image' | 'video' } => !!preview);
    if (outputPreview) return outputPreview;

    for (const inputId of canvasItem.inputs || []) {
      const inputItem = canvasItemsById.get(inputId);
      if (!inputItem) continue;
      const inputDirectPreview = getCanvasBufferItemNavPreview(inputItem.item);
      if (inputDirectPreview) return inputDirectPreview;
      const inputOutputPreview = getCanvasAiSuccessfulOutputs(inputItem)
        .map(output => getCanvasOutputNavPreview(inputItem, output))
        .find((preview): preview is { source: string; mediaType: 'image' | 'video' } => !!preview);
      if (inputOutputPreview) return inputOutputPreview;
    }

    return null;
  }, [canvasItemsById]);
  const getCanvasNavSignaturePart = (value?: string | number | null) => {
    const rawValue = String(value || '');
    if (rawValue.length <= 260) return rawValue;
    return `${rawValue.length}:${rawValue.slice(0, 120)}:${rawValue.slice(-120)}`;
  };
  const getCanvasNavThumbnailSignature = (
    canvasItem: CanvasImageItem,
    preview?: CanvasNavPreview | null,
  ) => [
    canvasItem.id,
    canvasItem.item.id,
    canvasItem.item.type,
    canvasItem.item.name || '',
    canvasItem.item.content || '',
    canvasItem.item.path || '',
    canvasItem.item.url || '',
    canvasItem.item.sourceUrl || '',
    canvasItem.item.originalUrl || '',
    preview?.mediaType || 'none',
    getCanvasNavSignaturePart(preview?.source),
    getCanvasNavSignaturePart(canvasItem.item.thumbnail),
    canvasItem.item.createdAt || '',
    canvasItem.item.isDirectory ? '1' : '0',
    canvasItem.item.isUrl ? '1' : '0',
    (canvasItem.inputs || []).join(','),
    canvasItem.ai?.type || '',
    canvasItem.ai?.status || '',
    canvasItem.ai?.generatedAt || '',
    canvasItem.ai?.presetLabel || '',
    canvasItem.ai?.presetId || '',
    canvasItem.ai?.error || '',
    (canvasItem.ai?.outputs || []).map(output => [
      output.id,
      output.status,
      output.mediaType,
      getCanvasNavSignaturePart(output.url),
      getCanvasNavSignaturePart(output.path),
      output.generatedAt || '',
      output.width || '',
      output.height || '',
    ].join(':')).join('|'),
  ].join('::');
  const getCachedCanvasNavThumbnailSource = useCallback((
    canvasItem: CanvasImageItem,
    preview?: CanvasNavPreview | null,
  ) => {
    const signature = getCanvasNavThumbnailSignature(canvasItem, preview);
    const cached = canvasNavThumbnailCacheRef.current.get(canvasItem.id);
    if (!cached || cached.signature !== signature || cached.status !== 'ready') return '';
    return cached.thumbnail;
  }, [canvasNavThumbnailRevision]);
  useEffect(() => { return runDerivedUiEffect04({ canvasNavItems, canvasNavThumbnailCacheRef, canvasPanRef, getCanvasItemNavPreview, getCanvasNavThumbnailSignature, isCanvasInteractingRef, isCanvasMode, isCanvasNavigatorVisible, isCanvasZoomingRef, setCanvasNavThumbnailRevision }); }, [isCanvasMode, isCanvasNavigatorVisible, canvasNavItems, canvasItemsById]);
  useLayoutEffect(() => { return runDerivedUiEffect05({ CANVAS_NAV_PANEL_TOP_MARGIN, canvasNavigatorPanelRef, canvasToolbarRef, isCanvasMode, isCanvasNavigatorVisible, setCanvasToolbarTop }); }, [canvasNavThumbnailRevision, isCanvasMode, isCanvasNavigatorVisible, canvasNavItems.length]);
  const canvasConnections = useMemo(() => canvasItems.flatMap(target => (
    (target.inputs || [])
      .map(sourceId => {
        const source = canvasItemsById.get(sourceId);
        return source ? { source, target } : null;
      })
      .filter((item): item is { source: CanvasImageItem; target: CanvasImageItem } => !!item)
  )), [canvasItems, canvasItemsById]);
  const canvasConnectionsForRender = useMemo(() => {
    if (!canvasRenderViewport) return canvasConnections;
    return canvasConnections.filter(({ source, target }) => (
      canvasRectsIntersect(canvasRenderViewport, getCanvasItemRenderedBox(source))
      || canvasRectsIntersect(canvasRenderViewport, getCanvasItemRenderedBox(target))
    ));
  }, [canvasAiPromptEditingId, canvasConnections, canvasRenderViewport]);
  const canvasConnectedSourceIds = useMemo(() => (
    new Set(canvasConnections.map(connection => connection.source.id))
  ), [canvasConnections]);
  const canvasConnectedTargetIds = useMemo(() => (
    new Set(canvasConnections.map(connection => connection.target.id))
  ), [canvasConnections]);
  const canvasHandleOcclusionInputsRef = useRef<{
    renderedItems: CanvasImageItem[];
    connections: unknown;
    renderScale: number;
    selectedIds: string[];
  } | null>(null);
  useEffect(() => { return runDerivedUiEffect06({ canvasConnections, canvasHandleOcclusionInputsRef, canvasRenderScale, canvasRenderableItems, canvasSelectedIds, isCanvasMode, refreshCanvasConnectionHandleOcclusion }); }, [
    isCanvasMode,
    canvasRenderableItems,
    canvasSelectedIds,
    canvasConnections,
    canvasRenderScale,
  ]);
  const canvasConnectionDraftPath = canvasConnectionDraft ? (() => {
    const bend = Math.max(80, Math.abs(canvasConnectionDraft.toX - canvasConnectionDraft.fromX) * 0.45);
    const direction = canvasConnectionDraft.toX >= canvasConnectionDraft.fromX ? 1 : -1;
    return `M ${canvasConnectionDraft.fromX} ${canvasConnectionDraft.fromY} C ${canvasConnectionDraft.fromX + bend * direction} ${canvasConnectionDraft.fromY}, ${canvasConnectionDraft.toX - bend * direction} ${canvasConnectionDraft.toY}, ${canvasConnectionDraft.toX} ${canvasConnectionDraft.toY}`;
  })() : '';
  const canvasInputActionDraftPath = canvasInputActionDraft ? (() => {
    const bend = Math.max(80, Math.abs(canvasInputActionDraft.fromX - canvasInputActionDraft.toX) * 0.45);
    const direction = canvasInputActionDraft.toX <= canvasInputActionDraft.fromX ? -1 : 1;
    return `M ${canvasInputActionDraft.fromX} ${canvasInputActionDraft.fromY} C ${canvasInputActionDraft.fromX + bend * direction} ${canvasInputActionDraft.fromY}, ${canvasInputActionDraft.toX - bend * direction} ${canvasInputActionDraft.toY}, ${canvasInputActionDraft.toX} ${canvasInputActionDraft.toY}`;
  })() : '';
  const selectedCanvasAiGenerator = canvasItems.find(item => canvasSelectedIdsSet.has(item.id) && canUseCanvasItemAsAiTarget(item));
  const selectedCanvasConnectableCount = selectedCanvasAiGenerator
    ? canvasSelectedIds.filter(id => {
      if (id === selectedCanvasAiGenerator.id) return false;
      const item = canvasItemsById.get(id);
      return canUseCanvasItemAsAiInput(item);
    }).length
    : 0;
  const visibleCanvasFolderPickerItems = useMemo(
    () => canvasFolderPickerItems.slice(0, canvasFolderPickerVisibleCount),
    [canvasFolderPickerItems, canvasFolderPickerVisibleCount],
  );
  const canvasPresetEditorTitle = canvasPresetEditorMode === 'manage' ? '管理预设' : '新增预设';
  const canvasWorkflowEditingTemplate = canvasWorkflowTemplates.find(item => item.id === canvasWorkflowEditingId) || null;
  const canvasWorkflowEditingNodeCount = canvasWorkflowEditingTemplate?.nodes.length || 0;
  const canvasWorkflowEditingAiCount = canvasWorkflowEditingTemplate?.nodes.filter(node => node.ai?.type === 'image-generator').length || 0;
  const isLicenseUnlocked = licenseStatus?.valid === true && licenseStatus.needs_email_registration !== true;
  const isLicenseGateActive = !isLicenseUnlocked;
  const canRegisterByEmail = licenseStatus?.needs_email_registration !== false;
  licenseGateActiveRef.current = isLicenseGateActive;
  const licenseGateState = licenseStatus?.state || 'unlicensed';
  const licenseGateTitle = isLicenseLoading && !licenseStatus
    ? '正在读取授权'
    : isLicenseUnlocked
      ? '授权有效'
      : canRegisterByEmail
        ? '邮箱注册 / 登录'
        : LICENSE_STATE_LABELS[licenseGateState] || '未授权';
  const licenseGateMessage = isLicenseLoading && !licenseStatus
    ? '正在读取本机授权状态，请稍候。'
    : canRegisterByEmail
      ? '普通账户长期可用；会员权益和价格由服务端按到期时间管理，注册时填写邀请码可获得双方奖励。'
      : licenseStatus?.message || '请导入有效 license 后使用抽屉。';

  useEffect(() => { return runDerivedUiEffect07({ clearIdleAutoClose, closeTimerRef, drawerHeightRef, drawerWidthRef, isLicenseGateActive, isPointerInsideDrawerRef, isPostInstallLaunchRef, isStartupOverlayActive, licenseStatus, setDrawerState, setIsOpen, startupAutoCloseSuppressedRef, startupAutoCloseTimerRef, stateRef, triggerModeRef }); }, [isLicenseGateActive, isStartupOverlayActive]);

  const newFolderParent = newFolderParentId
    ? folders.find(folder => folder.id === newFolderParentId) || null
    : null;
  const activeFolderForMove = folders.find(folder => folder.id === activeFolderId);
  const moveFolderParent = activeFolderForMove?.parentId
    ? folders.find(folder => folder.id === activeFolderForMove.parentId) || null
    : activeFolderForMove || null;
  const renderDrawerFolderRailItem = (folder: Folder, folderIndex: number, depth = 0) => { return renderDrawerFolderRailItemImpl({ DRAWER_FOLDER_TONES, activeFolderId, canvasFolderImportPrompt, collapsedFolderIds, deleteDrawerFolders, dragOverFolderId, editingFolderId, folderChildrenByParent, folderItemCounts, folderMoveDragOverId, folders, getFolderActionIds, handleDrawerFolderDragEnd, handleDrawerFolderDragStart, handleDrawerFolderPointerEnter, handleDrawerFolderPointerLeave, handleDrawerFolderPointerUp, handleDrawerFolderSelectionClick, handleDrawerItemDragLeaveFolder, handleDrawerItemDragOverFolder, handleDrawerItemDropToFolder, handleFolderContextMenu, handleOpenFolderModal, handleRenameFolder, isCanvasMode, renameValue, requestAddFolderMediaToCanvas, setActiveFolderId, setCollapsedFolderIds, setEditingFolderId, setRenameValue, startDrawerFolderPointerDrag, suppressNextFolderClickRef }, folder, folderIndex, depth); };

  const renderDrawerFolderListItem = (folder: Folder, _folderIndex: number, depth = 0) => { return renderDrawerFolderListItemImpl({ activeFolderId, canvasFolderImportPrompt, collapsedFolderIds, deleteDrawerFolders, dragOverFolderId, editingFolderId, folderChildrenByParent, folderItemCounts, folderMoveDragOverId, folders, getFolderActionIds, handleDrawerFolderDragEnd, handleDrawerFolderDragStart, handleDrawerFolderPointerEnter, handleDrawerFolderPointerLeave, handleDrawerFolderPointerUp, handleDrawerFolderSelectionClick, handleDrawerItemDragLeaveFolder, handleDrawerItemDragOverFolder, handleDrawerItemDropToFolder, handleFolderContextMenu, handleOpenFolderModal, handleRenameFolder, isCanvasMode, renameValue, requestAddFolderMediaToCanvas, setActiveFolderId, setCollapsedFolderIds, setEditingFolderId, setRenameValue, startDrawerFolderPointerDrag, suppressNextFolderClickRef }, folder, _folderIndex, depth); };

  const renderCanvasActionMenu = useEventCallback((canvas: CanvasRecord, placement: CanvasActionMenuPlacement = 'floating') => {
    const canDeleteCanvas = !isSwitchingCanvas;
    const placementClass = placement === 'floating'
      ? 'absolute right-1 top-9 w-36'
      : placement === 'inline'
        ? 'mt-1 w-full'
        : 'w-36';
    return (
      <div
        data-no-drag="true"
        className={`${placementClass} z-[100060] overflow-hidden rounded-[12px] border border-stone-200 bg-white py-1 text-[11px] font-bold text-stone-700 shadow-xl dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200`}
        onClick={event => event.stopPropagation()}
        onMouseDown={event => event.stopPropagation()}
      >
        <button type="button" onClick={() => { setCanvasActionMenuId(null); void switchToCanvas(canvas.id); }} className="flex w-full items-center px-3 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800">打开</button>
        <button type="button" onClick={() => { setCanvasActionMenuId(null); void renameCanvasPage(canvas); }} className="flex w-full items-center px-3 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800">重命名</button>
        <button type="button" onClick={() => { setCanvasActionMenuId(null); void duplicateCanvasPage(canvas); }} className="flex w-full items-center px-3 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800">复制</button>
        <button type="button" onClick={() => { setCanvasActionMenuId(null); void saveCurrentCanvasAsSnapshot(canvas); }} className="flex w-full items-center px-3 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800">保存为快照</button>
        <button
          type="button"
          disabled={!canDeleteCanvas}
          onClick={() => confirmSoftDeleteCanvasPage(canvas)}
          className="flex w-full items-center px-3 py-1.5 text-left text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-stone-400 disabled:hover:bg-transparent dark:text-red-300 dark:hover:bg-red-950/30 dark:disabled:text-stone-600"
        >
          移到回收站
        </button>
      </div>
    );
  });

  const canvasListItems = useMemo(() => (
    canvases.map(canvas => (
      <CanvasListItem
        key={canvas.id}
        canvas={canvas}
        isActive={activeCanvasId === canvas.id}
        canDelete={!isSwitchingCanvas}
        isSwitching={isSwitchingCanvas}
        isMenuOpen={canvasActionMenuId === canvas.id}
        onOpen={handleCanvasListOpen}
        onOpenMenu={handleCanvasMenuOpen}
        onToggleMenu={handleCanvasMenuToggle}
        onDelete={handleCanvasListDelete}
        renderMenu={renderCanvasActionMenu}
      />
    ))
  ), [
    canvases,
    activeCanvasId,
    isSwitchingCanvas,
    canvasActionMenuId,
    handleCanvasListOpen,
    handleCanvasMenuOpen,
    handleCanvasMenuToggle,
    handleCanvasListDelete,
    renderCanvasActionMenu,
  ]);

  const canvasRailItems = useMemo(() => (
    canvases.map(canvas => (
      <CanvasRailItem
        key={canvas.id}
        canvas={canvas}
        isActive={activeCanvasId === canvas.id}
        isSwitching={isSwitchingCanvas}
        isMenuOpen={canvasActionMenuId === canvas.id}
        onOpen={handleCanvasListOpen}
        onOpenMenu={handleCanvasMenuOpen}
        onToggleMenu={handleCanvasMenuToggle}
        renderMenu={renderCanvasActionMenu}
      />
    ))
  ), [
    canvases,
    activeCanvasId,
    isSwitchingCanvas,
    canvasActionMenuId,
    handleCanvasListOpen,
    handleCanvasMenuOpen,
    handleCanvasMenuToggle,
    renderCanvasActionMenu,
  ]);

  const deletedCanvasItems = useMemo(() => (
    deletedCanvases.map(canvas => (
      <CanvasTrashListItem
        key={canvas.id}
        canvas={canvas}
        onRestore={handleRestoreDeletedCanvas}
        onPermanentlyDelete={handlePermanentlyDeleteCanvas}
      />
    ))
  ), [deletedCanvases, handleRestoreDeletedCanvas, handlePermanentlyDeleteCanvas]);
  const TextInputDialogIcon = textInputDialog.icon === 'rename'
    ? Edit3
    : textInputDialog.icon === 'copy'
      ? Copy
      : textInputDialog.icon === 'snapshot'
        ? ArchiveRestore
        : Layers;
  const textInputDialogCanConfirm = textInputDialog.value.trim().length > 0;

  return (
    <CloudAccountProvider value={cloudAccountContextValue}>
      <div
        data-drawer-theme="true"
        data-app-font-size={appFontSize}
        className={`${isDark ? 'dark' : ''} drawer-theme w-screen h-screen bg-transparent relative overflow-hidden font-sans select-none flex items-center justify-start pointer-events-none`}
        style={{ '--app-font-scale': appFontScale } as React.CSSProperties}
        // 把全局拖拽接管挂在最外层
    >
      <AppToastHost />

<AppPrimaryOverlays
  scope={{ addInspirationSpaceShareAndReturnToCanvas, cancelVirtualDropJob, canRegisterByEmail, confirmSnip, deleteDrawerFolders, emailChallengeId, emailRegistrationError, emailVerificationCode, folderContextMenu, folders, formatVirtualDropBytes, getFolderActionIds, handleOpenFolderModal, inspirationSpaceTemplateOptions, isCreditRechargeOpen, isEmailCodeSending, isEmailVerifying, isInspirationSpaceOpen, isLicenseGateActive, isLicenseLoading, isMouseDown, keepDrawerOpenByPointer, LazyInspirationSpaceWindow, licenseGateMessage, licenseGateTitle, loadInspirationSpaceDrawerImages, openMoveExistingFolderModal, prepareInspirationSpaceTemplate, readInspirationSpaceDrawerImage, refreshCloudAccount, registrationDisplayName, registrationEmail, registrationInviteCode, requestEmailCode, selection, setActiveFolderId, setEditingFolderId, setEmailChallengeId, setEmailRegistrationError, setEmailVerificationCode, setEmailInviteCode: setRegistrationInviteCode, setFolderContextMenu, setIsCreditRechargeOpen, setIsInspirationSpaceOpen, setRegistrationDisplayName, setRegistrationEmail, setRenameValue, setSelection, snipMode, startPos, verifyEmailAccount, virtualDropJobs }}
/>

<DrawerShell
  canvasItemsRef={canvasItemsRef}
  scope={{ activateSearch, activeChatImageAspectRatio, activeChatImageModel, activeChatImageModelChoice, activeChatImageResolution, activeDrawerAiClassificationLabel, activeFolderId, activeSettingCategory, activeTab, activeThreeSceneId, activeThreeSceneIdRef, addCalendarScheduleItem, addCanvasAiGeneratorNode, addCanvasAiGeneratorNodeAtWorld, addCanvasAiGeneratorNodeForSources, addCanvasAiVideoGeneratorNode, addCanvasAiVideoGeneratorNodeAtWorld, addCanvasAiVideoGeneratorNodeForSources, addCanvasEnhancementNode, addCanvasEnhancementNodeAtWorld, addCanvasEnhancementNodeForSources, addCanvasFrameInterpolationNode, addCanvasFrameInterpolationNodeAtWorld, addCanvasFrameInterpolationNodeForSources, addCanvasImageFusionNode, addCanvasImageFusionNodeAtWorld, addCanvasSearchMediaCandidate, addCanvasTextInputForGenerator, addCanvasTextItem, addCanvasTextItemAtWorld, addCanvasThreeSceneGeneratorNode, addCanvasWorkflowTemplate, addChatMediaToCanvas, addWebImageCollectorTag, agentCustomApiKey, agentCustomBaseUrl, agentCustomProvider, agentCustomSaving, agentModels, agentModelsLoading, aiGeneratedImageFolderIds, analyzeCanvasThreeSceneNode, applyCanvasScaleStyles, appVersion, assetWindowOffset, assignDrawerImageToCanvasWorkflowSlot, assignSelectedImagesToCanvasWorkflowSlot, autoAiAnalysisProgress, autoScrollCanvasNearEdge, beginDrawerTextEditUndo, beginThreeSceneInteraction, blockInternalCanvasNativeDrag, broadcastFloatingNoteTextUpdate, broadcastFloatingNoteTitleUpdate, buildCanvasAgentSelectedItems, calendarDraftPriority, calendarDraftText, calendarEvents, calendarEventsByDay, calendarMonth, calendarMonthDays, calendarNotificationsEnabled, calendarOpenCount, calendarPageStyle, calendarScheduleNoteOptions, calendarSelectedDate, calendarTagFilter, calendarTagFilterLabel, calendarTagOptions, calendarTargetNoteLabel, cancelByokCustomization, cancelCanvasEnhancementEstimate, CANVAS_CONNECTION_HANDLE_OUTSET, CANVAS_GENERATED_LIST_RENDER_LIMIT, CANVAS_TEXT_CONTEXT_ROUTING_OPTIONS, canvasAgent, canvasAgentSelectedItems, canvasAgentSidebarWidth, canvasAiApiKey, canvasAiCanRefreshModels, canvasAiCloudImageModels, canvasAiCredentialSource, canvasAiEndpoint, canvasAiExpandedOutputNodeIds, canvasAiHasApiCredential, canvasAiHeadersText, canvasAiNewApiVideoKey, canvasAiOpenAiModelError, canvasAiPromptEditingId, canvasAiPromptPresets, canvasAiPromptPresetSelectOptions, canvasAiPromptTextAreaRefs, canvasAiProvider, canvasAiRemoteModelCount, canvasAiRemoteModelEmptyHint, canvasAiUnifiedImageModelOptions, canvasAiUsesCloudImageModels, canvasAiXaisBalance, canvasAiXaisBalanceText, canvasBrushEditor, canvasClipboardRef, canvasConnectedSourceIds, canvasConnectedTargetIds, canvasConnectionDraft, canvasConnectionDraftPath, canvasConnectionsForRender, canvasContentRef, canvasContextMenu, canvasDrawerSourceItemIds, canvasGeneratedDownloadableItems, canvasGeneratedItemsForList, canvasGeneratedItemsForRender, canvasGeneratedSelectedDownloadItems, canvasGeneratedSelectedIdSet, canvasGroupOutlinesForRender, canvasHoveredItemIdRef, canvasInputActionDraft, canvasInputActionDraftPath, canvasInputMenuForId, canvasInputPickTargetId, canvasInputPickTargetIdRef, canvasInteractionSurfaceRectRef, canvasItems, canvasItemsById, canvasListItems, canvasNavigatorPanelRef, canvasNavItems, canvasPanRef, canvasPresetEditingId, canvasPresetEditorMode, canvasPresetEditorTitle, canvasPresetNameDraft, canvasPresetPromptDraft, canvasPromptOptimizingId, canvasRailItems, canvasReferenceDragState, canvasReferenceReplaceTarget, canvasReferenceSuppressClickRef, canvasRenderableItems, canvasRenderScale, canvasScale, canvasScaledNodeRadius, canvasScaledSelectionRadius, canvasScaleRef, canvasSearchCandidateLimit, canvasSearchMediaResults, canvasSelectedBounds, canvasSelectedIds, canvasSelectedIdsRef, canvasSelectedIdsSet, canvasSelectionOverlayRef, canvasShortcut, canvasSingleSelectedBoxForRender, canvasSingleSelectedItemForRender, canvasSize, canvasSizeRef, canvasSizerRef, canvasSurfaceRef, canvasTextAgentRunningIds, canvasTextAreaRefs, canvasTextOutputAreaRefs, canvasToolbarRef, canvasToolbarTop, canvasTrashCount, canvasUploadInputRef, canvasWorkflowEditingAiCount, canvasWorkflowEditingId, canvasWorkflowEditingNodeCount, canvasWorkflowFileInputRef, canvasWorkflowHintDraft, canvasWorkflowNameDraft, canvasWorkflowSelectOptions, canvasWorkflowSingleEditGroupIds, canvasWorkflowSlotPickTarget, canvasWorkflowTemplates, canvasWorkingTimerTick, captureThreeSceneView, cardMediaHeight, cardWidth, centerCanvasItemInView, chatImageAspectRatioOptions, chatImageModelOptions, chatImageResolutionOptions, checkCanvasAiXaisBalance, checkLocalVisionModelStatus, chooseLocalAudiosForCanvasGenerator, chooseLocalFilesForCanvasWorkflow, chooseLocalImagesForCanvasGenerator, chooseLocalImagesForCanvasWorkflowSlot, chooseLocalVideosForCanvasGenerator, chooseReferenceImageForCollector, clearIdleAutoClose, clearWebImageCollectorTags, closeAllFloatingNotes, closeCanvasPresetEditor, closeCanvasWorkflowManager, closeFloatingNoteByLabel, closeFolderModal, closeTimerRef, closeWebImageCollector, cloudAccount, cloudAccountSyncError, collapseCanvasWorkflowGroup, collectWebImagesToDrawer, commitCanvasAiPromptDraft, commitCanvasScaleSoon, commitCanvasTextDraft, commitCanvasTextOutputDraft, commitQuickText, completeChatBatchCanvasGroup, confirmCloudAccountLogout, connectCanvasItemsToGenerator, connectSelectedCanvasItemsToGenerator, copyCanvasAiOutputToCanvas, copyCanvasImageToSystemClipboard, copyCanvasItemsToAvailableClipboards, copyCanvasTextOutput, createBlankFloatingNote, createCanvasGroup, createChatBatchCanvasGroup, createFloatingNote, createFolderAndMoveSelected, createNewCanvasPage, creditRedemptionCode, creditRedemptionError, customCanvasAiPromptPresets, customCanvasWorkflows, deferredSearchQuery, deletedCanvasItems, deleteSelectedCanvasPromptPresets, deleteSelectedCanvasWorkflows, DESIGN_AGENT_ARTIFACT_OPTIONS, DESIGN_AGENT_ROLE_OPTIONS, DESIGN_AGENT_THINKING_MODE_OPTIONS, disconnectCanvasInput, displayItems, downloadBufferItems, downloadCanvasItemsByIds, draggingItemId, dragOverFolderId, DRAWER_TOOL_BUTTON_BASE_CLASS, DRAWER_VIRTUALIZATION_THRESHOLD, drawerAgentSelectedItems, drawerAiAnalysisSummary, drawerAiClassificationDimension, drawerAiClassificationGroups, drawerAssetQueryKey, drawerCardActionContext, drawerClassificationView, drawerFolderSidebarWidth, drawerHeight, drawerScopedItems, drawerScrollNode, drawerShellClassName, drawerShellTransform, drawerSidebarClassName, drawerState, eagleImportMode, eagleImportStatus, effectiveCanvasAiApiProvider, effectiveCanvasAiEndpoint, effectiveCanvasAiProvider, ENABLE_THREE_SCENE_CREATION, enableCanvasWorkflowSingleEditForItem, endDrawerTextEditUndo, endThreeSceneInteraction, ensureMediaThumbnail, enterCanvasMode, executeChatTool, exitThreeSceneInteraction, expandCanvasWorkflowModuleForEdit, exportAllCanvasPresets, exportAllCanvasWorkflows, exportCanvasWorkflowModuleInstance, exportCurrentCanvasPreset, exportCurrentCanvasWorkflow, fillChatBatchCanvasSlot, filteredCalendarEvents, finishMainDrawerPress, fitCanvasViewToItems, focusFloatingNote, folderMoveSelectionIds, folderMoveTargetEntries, folderMoveTargetId, folderRailHeight, folders, generateCanvasAiGeneratorNode, generateCanvasWorkflowModuleNode, generatedImageCachePendingIdsRef, generateQueryAndCollectFromReference, getCachedCanvasNavThumbnailSource, getCanvasActionIds, getCanvasAiErrorSummary, getCanvasAiNodeDesignSizeForItem, getCanvasAiResolvedModel, getCanvasAiUnifiedImageModelValue, getCanvasImageInputBufferItemsForNode, getCanvasItemNavPreview, getCanvasItemRenderedBox, getCanvasPrimaryImageItem, getQuickAccessVisual, getStableCanvasImageSource, handleAddFolder, handleAppUpdatePromptClick, handleCanvasAiRunClick, handleCanvasAiRunPointerDown, handleCanvasDrop, handleCanvasGeneratorUpload, handleCanvasWorkflowFileUpload, handleCanvasWorkflowSlotDrop, handleCloseTextInput, handleDrawerCardWheel, handleDrawerFolderPointerEnter, handleDrawerFolderPointerLeave, handleDrawerFolderPointerUp, handleDrawerItemDragLeaveFolder, handleDrawerItemDragOverFolder, handleDrawerItemDropToFolder, handleDrawerItemSelect, handleDrawerPanelKeyDown, handleDrawerPanelMouseDown, handleDrawerPanelPointerDown, handleExportSelectedItems, handleOpenFolderModal, handleOpenTextInput, handleRecordShortcut, handleTogglePin, hasLocalXaisAccount, hasMoreAssets, hasRemoteImageSearch, importCanvasTemplateFile, importFromEagle, importFromEagleLibrary, installOllamaSilently, isAssetPageLoading, isAutoStart, isAutoStartChanging, isByokUnlocked, isCanvasAiLicenseManaged, isCanvasAiPanelOpen, isCanvasChromeHidden, isCanvasGeneratedListVisible, isCanvasGeneratedMultiSelect, isCanvasMode, isCanvasNavigatorVisible, isCanvasPointerInsideRef, isCanvasPresetEditorOpen, isCanvasSpacePressedRef, isCanvasTrashOpen, isCanvasWorkbenchActive, isCanvasWorkbenchMode, isCanvasWorkflowManagerOpen, isCheckingAppUpdate, isCloudAccountLoading, isCloudAccountLoggingOut, isCollectingWebImages, isCreatingBlankNote, isDark, isDataLoaded, isDrawerActive, isDrawerAgentOpen, isDrawerAiClassificationMode, isDrawerWorkbenchActive, isDrawerWorkbenchMode, isFolderSidebarLayout, isGeneratingWebImageQuery, isInstallingOllama, isInvalidFolderMoveTarget, isLicenseGateActive, isLicenseLoading, isLoadingCanvasTrash, isLocalVisionModelChecking, isMainWorkbenchActive, isMainWorkbenchActiveRef, isMobileConnected, isMovingFolders, isOpen, isPinned, isPointerInsideDrawerRef, isRecording, isRecordingCanvas, isRecordingNote, isRecordingSearch, isRecordingSnip, isRecordingText, isRecordingTrigger, isRedeemingCredits, isRefreshingCanvasAiOpenAiModels, isResizingCards, isSearchActive, isSelectMode, isShortcutReveal, isStartupOverlayActive, isTestingCanvasAiConnection, isUtilityActiveTab, items, jumpCalendarToday, lastCanvasDragClientRef, lastDrawerPointerDownAtRef, lastSelectedDrawerItemIdRef, LICENSE_EDITION_LABELS, LICENSE_STATE_LABELS, licenseAiAccess, licenseStatus, loadNextDrawerAssetPage, loadPreviousDrawerAssetPage, localVisionModelDownload, localVisionModelLastError, localVisionModelReadyRef, mainDrawerItemCount, mainDrawerLongPressTriggeredRef, managedCanvasAiProviderLabel, moveCalendarMonth, moveDrawerFoldersToParent, moveFolderName, moveFolderParent, moveSelectedItemsToFolder, newFolderName, newFolderParent, normalizedDeferredSearchQuery, noteShortcut, openCanvasBrushEditor, openCanvasBrushEditorFromSource, openCanvasContextMenu, openCanvasCreateMenu, openCanvasPresetEditor, openCanvasPresetManager, openCanvasReferenceAddMenu, openCanvasReferenceReplaceMenu, openCanvasTrash, openCanvasWorkflowManager, openCloudCreditUsage, openFloatingNoteCount, openFloatingNoteEntries, openInspirationSpace, openOllamaDownloadPage, openQuickAccessItem, openSelectedImagePreview, openSelectedVideoPreview, optimizeCanvasPrompt, orderedFolderEntries, organizeCanvasItems, pasteCanvasItems, pendingCanvasFusionRoleRef, preventCanvasNativeDrag, pushDrawerUndoSnapshot, quickAccessItems, quickRailMode, quickText, redeemCloudCredits, refreshAgentModels, refreshCanvasAiOpenAiModels, refreshCloudAccount, refreshNoteManager, refreshVisibleBalances, removeCanvasConnection, removeCanvasItemsByIds, removeDrawerItemsFromDrawer, removeWebImageCollectorTag, renameCanvasGroup, renderCalendarEvent, renderDrawerFolderListItem, renderDrawerFolderRailItem, replaceCanvasWorkflowManagerWithSelection, replaceCanvasWorkflowSlotAssets, requestAddFolderMediaToCanvas, requestDeleteDrawerItems, requestExitCanvasMode, resizeCanvasAiPromptEditor, retryCanvasWorkflowOutput, retryLocalVisionModelDownload, rotateCanvasImageClockwise, runCanvasTextAgentNode, runCanvasWorkbenchWindowAction, runDrawerWorkbenchWindowAction, runSelectedCanvasWorkflowModules, saveAgentCustomApi, saveCanvasAiCustomPromptPreset, saveCanvasWorkflowManagerChanges, saveSelectedCanvasWorkflow, scheduleAutoClose, scheduleCanvasAiPromptDraftCommit, scheduleCanvasTextDraftCommit, scheduleCanvasTextOutputDraftCommit, screenshotAutoPinNote, searchInputRef, searchQuery, searchShortcut, selectCanvasPresetForEdit, selectCanvasWorkflowForEdit, selectedCalendarEvents, selectedCalendarOpenCount, selectedCanvasAiGenerator, selectedCanvasConnectableCount, selectedCanvasPresetDeleteIds, selectedCanvasWorkflowDeleteIds, selectedIds, selectedImage, selectedVideo, setActiveDrawerAiClassificationLabel, setActiveFolderId, setActiveSettingCategory, setActiveTab, setAgentCustomApiKey, setAgentCustomBaseUrl, setAgentCustomProvider, setCalendarDraftPriority, setCalendarDraftText, setCalendarMonth, setCalendarSelectedDate, setCalendarTagFilter, setCalendarTargetNoteLabel, setCanvasAgentSidebarWidth, setCanvasAiApiKey, setCanvasAiApiProvider, setCanvasAiCredentialSource, setCanvasAiEndpoint, setCanvasAiHeadersText, setCanvasAiNewApiVideoKey, setCanvasAiPromptEditingId, setCanvasAiProvider, setCanvasContextMenu, setCanvasDesignAgentConfig, setCanvasGeneratedSelectedIds, setCanvasInputMenuForId, setCanvasInputPickTargetId, setCanvasPresetNameDraft, setCanvasPresetPromptDraft, setCanvasReferenceReplacement, setCanvasSearchCandidateLimit, setCanvasShortcut, setCanvasSpacePressed, setCanvasTextContextRouting, setCanvasTextNodeMode, setCanvasWorkflowHintDraft, setCanvasWorkflowNameDraft, setCanvasWorkflowOutputMode, setCanvasWorkflowSlotPickTarget, setCardMediaHeight, setCardWidth, setChatImageAspectRatio, setChatImageModel, setChatImageResolution, setCreditRedemptionCode, setCreditRedemptionError, setDrawerAiClassificationDimension, setDrawerClassificationView, setDrawerItemQuickAccess, setDrawerScrollElement, setEagleImportMode, setFolderMoveTargetId, setIsCanvasAiPanelOpen, setIsCanvasChromeHidden, setIsCanvasGeneratedListVisible, setIsCanvasGeneratedMultiSelect, setIsCanvasNavigatorVisible, setIsCanvasTrashOpen, setIsDark, setIsDrawerAgentOpen, setIsRecording, setIsRecordingCanvas, setIsRecordingNote, setIsRecordingSearch, setIsRecordingSnip, setIsRecordingText, setIsRecordingTrigger, setIsResizingCards, setIsSearchActive, setIsSelectMode, setItems, setMoveFolderName, setNewFolderName, setNoteShortcut, setQuickRailMode, setQuickText, setSearchQuery, setSearchShortcut, setSelectedCanvasPresetDeleteIds, setSelectedCanvasWorkflowDeleteIds, setSelectedIds, setShortcut, setShowAboutSoftware, setShowFolderModal, setShowMoveExistingFolderModal, setShowMoveFolderModal, setShowQR, setShowSettings, setShowStoragePath, setSnipShortcut, setTextShortcut, setTriggerShortcut, setWebImageCollectorQuery, setWebImageCollectorReference, setWebImageCollectorStatus, setWebImageCollectorTagDraft, shortcut, shouldBlockAutoClose, shouldShowLegacyAiSettings, showAboutSoftware, showAppUpdatePromptArrow, showContact, showFolderModal, showHelp, showMoveExistingFolderModal, showMoveFolderModal, showQR, showSettings, showStoragePath, showTextInput, showToast, showWebImageCollector, snipMode, snipShortcut, startCanvasConnectionDrag, startCanvasGroupResize, startCanvasInputActionDrag, startCanvasItemDrag, startCanvasItemResize, startCanvasPan, startCanvasReferenceLongPress, startCanvasSelection, startDrawerItemPointerDrag, startDrawerTitleDrag, startMainDrawerLongPress, startPickCanvasImageForGenerator, startPreviewWindowDrag, startResizingCorner, startResizingFolderSidebarWidth, startResizingHeight, startResizingRightCorner, startResizingSidebarAreas, startResizingWidth, startupAutoCloseSuppressedRef, switchAgentFundingSource, TABS, testCanvasAiConnection, textShortcut, threeSceneAnalyzingIds, toggleAutoStartSetting, toggleCalendarNotificationsSetting, toggleCanvasAiOutputsExpanded, toggleCanvasImageRule, toggleCanvasImageRulePanel, toggleCanvasWorkbenchMode, toggleDrawerSidebarLayout, toggleDrawerWorkbenchMode, toggleScreenshotAutoPinNoteSetting, toggleSettings, toggleTriggerMode, totalAssetCount, transitionStyle, triggerMode, triggerShortcut, ungroupCanvasItems, unscheduledCalendarEvents, updateCanvasAiGeneratorData, updateCanvasSelection, updateCollapsedCanvasWorkflowSlot, updateThreeScenePreview, updateThreeSceneReferenceOverlay, updateThreeSceneSpec, updateWebImageCollectorTag, visibleFolderEntries, visibleFolderRailEntryCount, webImageCacheDir, webImageCollectorPanelRef, webImageCollectorQuery, webImageCollectorReference, webImageCollectorStatus, webImageCollectorTagDraft, webImageCollectorTags, WORKFLOW_SLOT_ASSET_DRAG_MIME, zoomCanvasAt }}
/>
<AppDialogHost
  scope={{ acceptUpdateLogAndClose, activateCanvasBrushTool, activateDoodleShortcutScope, activeDraftForDisplay, activeWorkflowDraftRef, addFolderMediaPickerItemToCanvas, applyCanvasBrushCrop, appVersion, CANVAS_BRUSH_COLORS, CANVAS_FOLDER_PICKER_SCROLL_EDGE, CANVAS_FOLDER_PICKER_VISIBLE_STEP, canvasAgent, canvasBrushBaseCanvasRef, canvasBrushCanvasRef, canvasBrushColor, canvasBrushCropRect, canvasBrushCursor, canvasBrushEditor, canvasBrushHistory, canvasBrushMode, canvasBrushOpacity, canvasBrushSize, canvasFolderImportPrompt, canvasFolderPickerError, canvasFolderPickerHasMore, canvasFolderPickerItems, canvasFolderPickerTotal, canvasFolderPickerVisibleCount, canvasShortcut, canvasToolbarTop, canvasWorkflowSaveDraft, checkAndInstallAppUpdate, chooseWebImageCacheDir, clearCanvasBrushCrop, clearCanvasBrushMarks, closeCanvasFolderMediaPicker, closeCanvasWorkflowSaveDialog, closeConfirmDialog, closeSelectedImagePreview, closeSelectedVideoPreview, closeTextInputDialog, closeUpdateLog, cloudAccount, confirmAddFolderMediaToCanvas, confirmDialog, confirmSaveCanvasWorkflow, copySelectedImagePreviewToClipboard, creditUsageError, creditUsageItems, doodleRootRef, finishCanvasBrushStroke, finishLaunchIntro, flashSelectedImageZoom, handleCanvasBrushPointerDown, handleCanvasBrushPointerMove, handleDoodleKeyDown, handleFloatingLayerPointerLeave, hideCanvasBrushCursor, isCanvasBrushShapeMode, isCanvasFolderPickerLoading, isCheckingAppUpdate, isCloudflaredDisclaimerAccepted, isCreditUsageLoading, keepDrawerOpenByPointer, loadCanvasFolderMediaPage, loadCloudCreditUsage, localIP, mobilePairUrl, resetWebImageCacheDir, saveCanvasBrushEditedImage, selectedImage, selectedImageGallery, selectedImagePan, selectedImagePanRef, selectedImageZoom, selectedVideo, setActiveDraftForDisplay, setActiveShortcutScope, setCanvasBrushColor, setCanvasBrushEditor, setCanvasBrushOpacity, setCanvasBrushSize, setCanvasFolderPickerVisibleCount, setCanvasWorkflowSaveDraft, setSelectedImagePan, setSelectedImageZoom, setShowAboutSoftware, setShowContact, setShowCreditUsage, setShowHelp, setShowQR, setShowStoragePath, setShowUpdateLog, setShowWorkflowDraftPanel, setTextInputDialog, showAboutSoftware, showContact, showCreditUsage, showHelp, showLaunchIntro, showQR, showSelectedImageZoom, showStoragePath, showToast, showUpdateLog, showWorkflowDraftPanel, startPreviewWindowDrag, startResizingCorner, startResizingHeight, startResizingRightCorner, startResizingWidth, startSelectedImagePanDrag, STARTUP_CONSENT_DELAY_MS, stepSelectedImageGallery, textInputDialog, textInputDialogCanConfirm, TextInputDialogIcon, textInputDialogInputRef, triggerShortcut, undoCanvasBrushStroke, updateCanvasBrushCursorFromEvent, visibleCanvasFolderPickerItems, webImageCacheDir }}
/>
    </div>
    </CloudAccountProvider>
  );
}

export default function App() {
  const label = (appWindow as any).label;
  if (label === 'edge') return <EdgeTrigger />;
  if (label === 'snip') return <SnipOverlay />;
  if (label === 'note' || (typeof label === 'string' && label.startsWith('note_'))) {
    return (
      <React.Suspense fallback={null}>
        <LazyFloatingNoteHost
          getStoredDrawerSize={getStoredDrawerSize}
          getStoredTriggerMode={getStoredTriggerMode}
        />
      </React.Suspense>
    );
  }
  return (
    <AppFontSizeProvider>
      <MainApp />
    </AppFontSizeProvider>
  );
}
