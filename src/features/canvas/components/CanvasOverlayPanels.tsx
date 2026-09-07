import { motion } from 'framer-motion';
import { BookOpen,Box,Brush,Check,CheckSquare,Clipboard,Compass,Copy,Download,Edit3,File as FileIcon,Film,Image as ImageIcon,Layers,LayoutGrid,Link,Maximize2,Minimize2,RefreshCw,Sparkles,Trash2,Type,Unplug,Upload,X } from 'lucide-react';
import { CanvasAiSettingsPanel } from '../../../components/CanvasAiSettingsPanel';
import { CanvasNavigator } from '../../../components/CanvasNavigator';
import { CanvasToolbar } from '../../../components/CanvasToolbar';
import { CANVAS_AI_PROMPT_PRESET_ADD_VALUE,CANVAS_AI_PROMPT_PRESET_MANAGE_VALUE,CANVAS_AI_PROMPT_PRESET_PLACEHOLDER,CANVAS_WORKFLOW_MANAGE_VALUE,CANVAS_WORKFLOW_SAVE_SELECTION_VALUE,CANVAS_WORKFLOW_SELECT_PLACEHOLDER } from '../../../services/canvasTemplateStorage';
import { CANVAS_AI_PROVIDER_SELECT_OPTIONS,getCanvasAiApiKeyPlaceholder,getCanvasAiEndpointPlaceholder,getStoredCanvasAiApiKey,getStoredCanvasAiApiProvider,getStoredCanvasAiEndpoint,getStoredCanvasAiHeadersText,isCanvasAiEndpointVisible,isCanvasAiRemoteModelProvider,normalizeCanvasAiProvider } from '../../../utils/canvasAiConfig';
import { canUseCanvasItemAsAiTarget,canUseCanvasItemAsImageEnhancementInput,canUseCanvasItemAsInputForTarget,getCanvasInputTargetLabel,getCanvasItemNavSource,getCanvasWorkflowTemplateFromNode,hasCanvasAiGeneratedResults,isCanvasAgentTextTarget } from '../../../utils/canvasItemSelectors';
import { CANVAS_AI_PROMPT_PRESETS,CANVAS_BUILT_IN_WORKFLOWS } from '../../../utils/canvasWorkflowDefinitions';
import { getCanvasWorkflowGroup } from '../../../utils/canvasWorkflowRuntime';
import { getCanvasAiMediaType,isCanvasAiGeneratorType } from '../../canvasAiRuntime';
import { getCanvasGroupId,getCommonCanvasGroup } from '../../canvasGroups';
import { formatCanvasWorkingElapsed,isCanvasAiEnhancementType } from '../../canvasLocalMediaTools';
import { getCanvasWorkflowInternalSlotNodes } from '../../canvasWorkflowInternalSlots';
import { normalizeCanvasWorkflowUserInput } from '../../canvasWorkflowUserInput';
import { getCanvasChatOffsetRight } from '../../chat/runtime/canvasChatVisibility';
import type { CanvasImageItem } from '../../canvasModel';
import type { CanvasWorkflowTemplate } from '../../canvasTemplates';
import type { CanvasGeneratedListEntry } from '../../../types/canvasMedia';
import type { CanvasAiPromptPreset } from '../../../types/canvasWorkflow';

export type CanvasOverlayPanelsScope = Record<string, any> & {
  canvasAiPromptPresets: CanvasAiPromptPreset[];
  customCanvasAiPromptPresets: CanvasAiPromptPreset[];
  canvasWorkflowTemplates: CanvasWorkflowTemplate[];
  customCanvasWorkflows: CanvasWorkflowTemplate[];
  canvasItems: CanvasImageItem[];
  canvasItemsById: Map<string, CanvasImageItem>;
  canvasSelectedIds: string[];
  canvasGeneratedItemsForList: CanvasGeneratedListEntry[];
  canvasGeneratedItemsForRender: CanvasGeneratedListEntry[];
  canvasGeneratedDownloadableItems: CanvasGeneratedListEntry[];
  selectedCanvasPresetDeleteIds: string[];
  selectedCanvasWorkflowDeleteIds: string[];
  setSelectedCanvasPresetDeleteIds: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedCanvasWorkflowDeleteIds: React.Dispatch<React.SetStateAction<string[]>>;
  setCanvasGeneratedSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  setIsCanvasGeneratedMultiSelect: React.Dispatch<React.SetStateAction<boolean>>;
  setIsCanvasNavigatorVisible: React.Dispatch<React.SetStateAction<boolean>>;
  setIsCanvasChromeHidden: React.Dispatch<React.SetStateAction<boolean>>;
};

export function CanvasOverlayPanels({ scope }: { scope: CanvasOverlayPanelsScope }) {
  const { addCanvasAiGeneratorNode, addCanvasAiGeneratorNodeAtWorld, addCanvasAiGeneratorNodeForSources, addCanvasAiVideoGeneratorNode, addCanvasAiVideoGeneratorNodeAtWorld, addCanvasAiVideoGeneratorNodeForSources, addCanvasEnhancementNode, addCanvasEnhancementNodeAtWorld, addCanvasEnhancementNodeForSources, addCanvasFrameInterpolationNode, addCanvasFrameInterpolationNodeAtWorld, addCanvasFrameInterpolationNodeForSources, addCanvasImageFusionNode, addCanvasImageFusionNodeAtWorld, addCanvasTextInputForGenerator, addCanvasTextItem, addCanvasTextItemAtWorld, addCanvasThreeSceneGeneratorNode, addCanvasWorkflowTemplate, applyCanvasScaleStyles, CANVAS_GENERATED_LIST_RENDER_LIMIT, canvasAiApiKey, canvasAiCanRefreshModels, canvasAiEndpoint, canvasAiHasApiCredential, canvasAiHeadersText, canvasAiNewApiVideoKey, canvasAiOpenAiModelError, canvasAiPromptPresets, canvasAiPromptPresetSelectOptions, canvasAiProvider, canvasAiRemoteModelCount, canvasAiRemoteModelEmptyHint, canvasAiXaisBalance, canvasAiXaisBalanceText, canvasClipboardRef, canvasContextMenu, canvasGeneratedDownloadableItems, canvasGeneratedItemsForList, canvasGeneratedItemsForRender, canvasGeneratedSelectedDownloadItems, canvasGeneratedSelectedIdSet, canvasItems, canvasItemsById, canvasNavigatorPanelRef, canvasNavItems, canvasPresetEditingId, canvasPresetEditorMode, canvasPresetEditorTitle, canvasPresetNameDraft, canvasPresetPromptDraft, canvasReferenceDragState, canvasScale, canvasScaleRef, canvasSelectedIds, canvasSelectedIdsSet, canvasSizeRef, canvasSurfaceRef, canvasToolbarRef, canvasToolbarTop, canvasWorkflowEditingAiCount, canvasWorkflowEditingId, canvasWorkflowEditingNodeCount, canvasWorkflowHintDraft, canvasWorkflowNameDraft, canvasWorkflowSelectOptions, canvasWorkflowTemplates, canvasWorkingTimerTick, centerCanvasItemInView, checkCanvasAiXaisBalance, chooseLocalFilesForCanvasWorkflow, chooseLocalImagesForCanvasGenerator, chooseLocalVideosForCanvasGenerator, closeCanvasPresetEditor, closeCanvasWorkflowManager, collapseCanvasWorkflowGroup, commitCanvasScaleSoon, connectCanvasItemsToGenerator, copyCanvasItemsToAvailableClipboards, createCanvasGroup, customCanvasAiPromptPresets, customCanvasWorkflows, deleteSelectedCanvasPromptPresets, deleteSelectedCanvasWorkflows, downloadBufferItems, downloadCanvasItemsByIds, effectiveCanvasAiApiProvider, effectiveCanvasAiEndpoint, effectiveCanvasAiProvider, ENABLE_THREE_SCENE_CREATION, expandCanvasWorkflowModuleForEdit, exportAllCanvasPresets, exportAllCanvasWorkflows, exportCanvasWorkflowModuleInstance, exportCurrentCanvasPreset, exportCurrentCanvasWorkflow, fitCanvasViewToItems, generateCanvasAiGeneratorNode, generateCanvasWorkflowModuleNode, getCachedCanvasNavThumbnailSource, getCanvasActionIds, getCanvasAiErrorSummary, getCanvasItemNavPreview, getCanvasPrimaryImageItem, importCanvasTemplateFile, isCanvasAiLicenseManaged, isCanvasAiPanelOpen, isCanvasChromeHidden, isCanvasGeneratedListVisible, isCanvasGeneratedMultiSelect, isCanvasMode, isCanvasNavigatorVisible, isCanvasPresetEditorOpen, isCanvasWorkflowManagerOpen, isRefreshingCanvasAiOpenAiModels, licenseAiAccess, managedCanvasAiProviderLabel, openCanvasBrushEditor, openCanvasPresetEditor, openCanvasPresetManager, openCanvasWorkflowManager, openInspirationSpace, organizeCanvasItems, pasteCanvasItems, refreshCanvasAiOpenAiModels, removeCanvasConnection, removeCanvasItemsByIds, renameCanvasGroup, replaceCanvasWorkflowManagerWithSelection, runCanvasTextAgentNode, runSelectedCanvasWorkflowModules, saveCanvasAiCustomPromptPreset, saveCanvasWorkflowManagerChanges, saveSelectedCanvasWorkflow, selectCanvasPresetForEdit, selectCanvasWorkflowForEdit, selectedCanvasPresetDeleteIds, selectedCanvasWorkflowDeleteIds, setCanvasAiApiKey, setCanvasAiApiProvider, setCanvasAiEndpoint, setCanvasAiHeadersText, setCanvasAiNewApiVideoKey, setCanvasAiProvider, setCanvasContextMenu, setCanvasGeneratedSelectedIds, setCanvasPresetNameDraft, setCanvasPresetPromptDraft, setCanvasWorkflowHintDraft, setCanvasWorkflowNameDraft, setIsCanvasAiPanelOpen, setIsCanvasChromeHidden, setIsCanvasGeneratedListVisible, setIsCanvasGeneratedMultiSelect, setIsCanvasNavigatorVisible, setSelectedCanvasPresetDeleteIds, setSelectedCanvasWorkflowDeleteIds, showToast, ungroupCanvasItems, updateCanvasSelection, zoomCanvasAt } = scope;
  return (
<>
{isCanvasMode && isCanvasAiPanelOpen && (
                    <CanvasAiSettingsPanel
                      licenseManaged={isCanvasAiLicenseManaged}
                      managedProviderLabel={managedCanvasAiProviderLabel}
                      providerValue={effectiveCanvasAiProvider}
                      providerOptions={CANVAS_AI_PROVIDER_SELECT_OPTIONS}
                      onProviderChange={(value) => {
                        const provider = normalizeCanvasAiProvider(value);
                        setCanvasAiProvider(provider);
                        setCanvasAiApiKey(getStoredCanvasAiApiKey(provider));
                        setCanvasAiHeadersText(getStoredCanvasAiHeadersText(provider));
                        setCanvasAiApiProvider(getStoredCanvasAiApiProvider(provider));
                        const endpoint = getStoredCanvasAiEndpoint(provider);
                        if (endpoint) setCanvasAiEndpoint(endpoint);
                      }}
                      apiProviderValue={effectiveCanvasAiApiProvider}
                      onApiProviderChange={(value) => {
                        if (!isCanvasAiLicenseManaged) setCanvasAiApiProvider(value);
                      }}
                      apiKeyType={isCanvasAiLicenseManaged ? 'text' : 'password'}
                      apiKeyValue={isCanvasAiLicenseManaged
                        ? `由高级版授权提供${licenseAiAccess?.canvas_api_key_last4 ? ` · ****${licenseAiAccess.canvas_api_key_last4}` : ''}`
                        : canvasAiApiKey}
                      onApiKeyChange={(value) => {
                        if (!isCanvasAiLicenseManaged) setCanvasAiApiKey(value);
                      }}
                      apiKeyPlaceholder={isCanvasAiLicenseManaged
                        ? 'API 配置由高级版授权提供'
                        : getCanvasAiApiKeyPlaceholder(canvasAiProvider)}
                      showVideoKey={!isCanvasAiLicenseManaged && effectiveCanvasAiProvider === 'new-api'}
                      videoKeyValue={canvasAiNewApiVideoKey}
                      onVideoKeyChange={setCanvasAiNewApiVideoKey}
                      showBalance={isCanvasAiRemoteModelProvider(effectiveCanvasAiProvider)}
                      balanceStatus={canvasAiXaisBalance.status}
                      balanceText={canvasAiXaisBalanceText}
                      canCheckBalance={canvasAiHasApiCredential}
                      onCheckBalance={() => void checkCanvasAiXaisBalance()}
                      showEndpoint={isCanvasAiEndpointVisible(effectiveCanvasAiProvider)}
                      endpointValue={isCanvasAiLicenseManaged ? effectiveCanvasAiEndpoint : canvasAiEndpoint}
                      onEndpointChange={(value) => {
                        if (!isCanvasAiLicenseManaged) setCanvasAiEndpoint(value);
                      }}
                      endpointPlaceholder={isCanvasAiLicenseManaged
                        ? 'API Base URL 由高级版授权提供'
                        : getCanvasAiEndpointPlaceholder(canvasAiProvider)}
                      showRemoteModels={isCanvasAiRemoteModelProvider(effectiveCanvasAiProvider)}
                      isRefreshingModels={isRefreshingCanvasAiOpenAiModels}
                      canRefreshModels={canvasAiCanRefreshModels}
                      onRefreshModels={() => refreshCanvasAiOpenAiModels(false)}
                      modelHint={canvasAiOpenAiModelError
                        || (canvasAiRemoteModelCount > 0
                          ? `已读取 ${canvasAiRemoteModelCount} 个模型`
                          : canvasAiRemoteModelEmptyHint)}
                      modelError={!!canvasAiOpenAiModelError}
                      showHeaders={!isCanvasAiLicenseManaged}
                      headersValue={canvasAiHeadersText}
                      onHeadersChange={setCanvasAiHeadersText}
                      onClose={() => setIsCanvasAiPanelOpen(false)}
                    />
                  )}
                  {isCanvasMode && isCanvasPresetEditorOpen && (
                    <motion.div
                      data-no-drag="true"
                      data-canvas-floating-layer="true"
                      data-canvas-template-panel="true"
                      data-canvas-manager="preset"
                      initial={{ opacity: 0, x: 8, y: '-50%', scale: 0.98 }}
                      animate={{ opacity: 1, x: 0, y: '-50%', scale: 1 }}
                      exit={{ opacity: 0, x: 8, y: '-50%', scale: 0.98 }}
                      style={{
                        top: canvasToolbarTop,
                        right: getCanvasChatOffsetRight(100),
                      }}
                      data-canvas-chat-offset-base="100"
                      className="absolute z-[100070] w-[500px] rounded-[16px] border border-stone-200/85 bg-white/96 p-3 text-stone-700 shadow-[0_18px_48px_rgba(15,23,42,0.16)] backdrop-blur-2xl dark:border-stone-700/80 dark:bg-stone-950/96 dark:text-stone-200"
                      onPointerDown={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                      onWheel={(event) => event.stopPropagation()}
                    >
                      <div data-canvas-manager-header="true" className="mb-2 flex items-center justify-between gap-2">
                        <div data-canvas-manager-title="true" className="flex items-center gap-1.5 text-xs font-black">
                          <Sparkles className="h-4 w-4 text-cyan-500" />
                          <span>{canvasPresetEditorTitle}</span>
                        </div>
                        <button
                          type="button"
                          onClick={closeCanvasPresetEditor}
                          className="rounded-full p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-red-500 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-red-300"
                          title="关闭"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div data-canvas-manager-toolbar="true" className="mb-2 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => void importCanvasTemplateFile('preset')}
                          className="rounded-[13px] bg-stone-100 px-2.5 py-1 text-[10px] font-black text-stone-600 transition-colors hover:bg-stone-200 dark:bg-white/10 dark:text-stone-200 dark:hover:bg-white/14"
                        >
                          批量导入
                        </button>
                        {canvasPresetEditorMode === 'manage' && (
                          <button
                            type="button"
                            onClick={exportCurrentCanvasPreset}
                            className="rounded-[13px] bg-cyan-50 px-2.5 py-1 text-[10px] font-black text-cyan-700 transition-colors hover:bg-cyan-100 dark:bg-cyan-400/10 dark:text-cyan-100 dark:hover:bg-cyan-400/16"
                          >
                            导出当前
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={exportAllCanvasPresets}
                          className="rounded-[13px] bg-cyan-50 px-2.5 py-1 text-[10px] font-black text-cyan-700 transition-colors hover:bg-cyan-100 dark:bg-cyan-400/10 dark:text-cyan-100 dark:hover:bg-cyan-400/16"
                        >
                          批量导出
                        </button>
                      </div>
                      <div className="grid gap-2">
                        {canvasPresetEditorMode === 'manage' && (
                          <div data-canvas-manager-list="true" className="grid gap-1.5 rounded-[12px] border border-stone-200/80 bg-stone-50/80 p-2 dark:border-stone-700/80 dark:bg-white/5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-black uppercase tracking-wide text-stone-500 dark:text-stone-400">节点预设列表</span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setSelectedCanvasPresetDeleteIds(canvasAiPromptPresets.map(preset => preset.id))}
                                  disabled={canvasAiPromptPresets.length === 0}
                                  className="rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-black text-cyan-600 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:text-stone-300 dark:bg-white/10 dark:text-cyan-100 dark:hover:bg-white/16 dark:disabled:text-stone-600"
                                >
                                  全选
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSelectedCanvasPresetDeleteIds([])}
                                  disabled={selectedCanvasPresetDeleteIds.length === 0}
                                  className="rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-black text-cyan-600 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:text-stone-300 dark:bg-white/10 dark:text-cyan-100 dark:hover:bg-white/16 dark:disabled:text-stone-600"
                                >
                                  清空
                                </button>
                              </div>
                            </div>
                            <div className="grid max-h-52 gap-1 overflow-y-auto pr-1">
                              {canvasAiPromptPresets.length === 0 ? (
                                <div className="rounded-[10px] border border-dashed border-stone-300/80 bg-white/70 px-3 py-4 text-center text-[11px] font-bold text-stone-400 dark:border-stone-700 dark:bg-white/5 dark:text-stone-500">
                                  暂无节点预设
                                </div>
                              ) : canvasAiPromptPresets.map(preset => {
                                const isSelectedForDelete = selectedCanvasPresetDeleteIds.includes(preset.id);
                                const isEditing = canvasPresetEditingId === preset.id;
                                const isBuiltIn = CANVAS_AI_PROMPT_PRESETS.some(item => item.id === preset.id);
                                const isCustom = customCanvasAiPromptPresets.some(item => item.id === preset.id);
                                return (
                                  <div
                                    key={preset.id}
                                    data-canvas-manager-row="true"
                                    data-active={isEditing ? 'true' : 'false'}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => selectCanvasPresetForEdit(preset.id)}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        selectCanvasPresetForEdit(preset.id);
                                      }
                                    }}
                                    className={`grid cursor-pointer grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 rounded-[10px] border px-2.5 py-2 text-left transition-colors ${
                                      isEditing
                                        ? 'border-stone-900 bg-white text-stone-900 shadow-sm dark:border-stone-100 dark:bg-white/10 dark:text-stone-50'
                                        : 'border-stone-200/70 bg-white/72 text-stone-700 hover:border-stone-300 hover:bg-white dark:border-white/10 dark:bg-stone-950/30 dark:text-stone-200 dark:hover:bg-white/8'
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      data-canvas-manager-check="true"
                                      data-selected={isSelectedForDelete ? 'true' : 'false'}
                                      aria-pressed={isSelectedForDelete}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setSelectedCanvasPresetDeleteIds(prev => (
                                          prev.includes(preset.id)
                                            ? prev.filter(id => id !== preset.id)
                                            : [...prev, preset.id]
                                        ));
                                      }}
                                      className={`flex h-5 w-5 items-center justify-center rounded-[7px] border transition-colors ${
                                        isSelectedForDelete
                                          ? 'border-red-400 bg-red-500 text-white'
                                          : 'border-stone-300 bg-white/80 text-transparent hover:border-red-300 dark:border-stone-700 dark:bg-stone-950/40'
                                      }`}
                                      title={`选择删除「${preset.label}」`}
                                    >
                                      <Check className="h-3 w-3" strokeWidth={3} />
                                    </button>
                                    <div className="min-w-0">
                                      <div className="truncate text-xs font-black">{preset.label}</div>
                                      <div className="truncate text-[10px] font-bold text-stone-400 dark:text-stone-500">
                                        {preset.hint || preset.aspectRatio || '节点预设'}
                                      </div>
                                    </div>
                                    <span className="rounded-[7px] bg-stone-100 px-2 py-0.5 text-[9px] font-black text-stone-500 dark:bg-white/8 dark:text-stone-400">
                                      {isBuiltIn && isCustom ? '已修改' : isBuiltIn ? '内置' : '自定义'}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        <input
                          data-no-drag="true"
                          data-canvas-manager-input="true"
                          value={canvasPresetNameDraft}
                          onChange={(event) => setCanvasPresetNameDraft(event.target.value)}
                          placeholder="预设名称"
                          maxLength={24}
                          className="h-9 rounded-[10px] border border-stone-200/80 bg-white px-3 text-xs font-bold text-stone-700 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200/50 dark:border-stone-700 dark:bg-stone-950/60 dark:text-stone-100 dark:focus:border-cyan-700 dark:focus:ring-cyan-900/30"
                        />
                        <textarea
                          data-no-drag="true"
                          data-canvas-manager-input="true"
                          value={canvasPresetPromptDraft}
                          onChange={(event) => setCanvasPresetPromptDraft(event.target.value)}
                          onWheel={(event) => event.stopPropagation()}
                          placeholder="写入这个预设的隐藏 Prompt。创建预设卡片时，节点输入框会保持空白。"
                          className="h-36 resize-y rounded-[10px] border border-stone-200/80 bg-white px-3 py-2 text-xs leading-5 text-stone-700 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200/50 dark:border-stone-700 dark:bg-stone-950/60 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-cyan-700 dark:focus:ring-cyan-900/30"
                        />
                        <div data-canvas-manager-footer="true" className="flex items-center justify-between gap-2">
                          <div>
                            {canvasPresetEditorMode === 'manage' && (
                              <button
                                type="button"
                                onClick={deleteSelectedCanvasPromptPresets}
                                disabled={selectedCanvasPresetDeleteIds.length === 0}
                                className="rounded-[15px] bg-red-50 px-3 py-1.5 text-xs font-bold text-red-500 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-300 dark:bg-red-400/10 dark:text-red-200 dark:hover:bg-red-400/16 dark:disabled:bg-stone-800 dark:disabled:text-stone-600"
                                title="删除已勾选的节点预设"
                              >
                                {selectedCanvasPresetDeleteIds.length > 0 ? `删除已选 ${selectedCanvasPresetDeleteIds.length}` : '删除'}
                              </button>
                            )}
                          </div>
                          <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={closeCanvasPresetEditor}
                            className="rounded-[15px] bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-600 transition-colors hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            onClick={saveCanvasAiCustomPromptPreset}
                            data-canvas-manager-primary="true"
                            className="rounded-[15px] bg-cyan-500 px-3 py-1.5 text-xs font-black text-white shadow-sm shadow-cyan-500/20 transition-colors hover:bg-cyan-400 dark:bg-cyan-400 dark:text-stone-950 dark:hover:bg-cyan-300"
                          >
                            {canvasPresetEditorMode === 'manage' ? '保存修改' : '保存'}
                          </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                  {isCanvasMode && isCanvasWorkflowManagerOpen && (
                    <motion.div
                      data-no-drag="true"
                      data-canvas-floating-layer="true"
                      data-canvas-template-panel="true"
                      data-canvas-manager="workflow"
                      initial={{ opacity: 0, x: 8, y: '-50%', scale: 0.98 }}
                      animate={{ opacity: 1, x: 0, y: '-50%', scale: 1 }}
                      exit={{ opacity: 0, x: 8, y: '-50%', scale: 0.98 }}
                      style={{
                        top: canvasToolbarTop,
                        right: getCanvasChatOffsetRight(100),
                      }}
                      data-canvas-chat-offset-base="100"
                      className="absolute z-[100070] w-[520px] rounded-[16px] border border-stone-200/85 bg-white/96 p-3 text-stone-700 shadow-[0_18px_48px_rgba(15,23,42,0.16)] backdrop-blur-2xl dark:border-stone-700/80 dark:bg-stone-950/96 dark:text-stone-200"
                      onPointerDown={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                      onWheel={(event) => event.stopPropagation()}
                    >
                      <div data-canvas-manager-header="true" className="mb-2 flex items-center justify-between gap-2">
                        <div data-canvas-manager-title="true" className="flex items-center gap-1.5 text-xs font-black">
                          <BookOpen className="h-4 w-4 text-emerald-500" />
                          <span>管理工作流</span>
                        </div>
                        <button
                          type="button"
                          onClick={closeCanvasWorkflowManager}
                          className="rounded-full p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-red-500 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-red-300"
                          title="关闭"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div data-canvas-manager-toolbar="true" className="mb-2 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => void importCanvasTemplateFile('workflow')}
                          className="rounded-[13px] bg-stone-100 px-2.5 py-1 text-[10px] font-black text-stone-600 transition-colors hover:bg-stone-200 dark:bg-white/10 dark:text-stone-200 dark:hover:bg-white/14"
                        >
                          批量导入
                        </button>
                        <button
                          type="button"
                          onClick={exportCurrentCanvasWorkflow}
                          className="rounded-[13px] bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700 transition-colors hover:bg-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-100 dark:hover:bg-emerald-400/16"
                        >
                          导出当前
                        </button>
                        <button
                          type="button"
                          onClick={exportAllCanvasWorkflows}
                          className="rounded-[13px] bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700 transition-colors hover:bg-emerald-100 dark:bg-emerald-400/10 dark:text-emerald-100 dark:hover:bg-emerald-400/16"
                        >
                          批量导出
                        </button>
                      </div>
                      <div className="grid gap-2">
                        <div data-canvas-manager-list="true" className="grid gap-1.5 rounded-[12px] border border-stone-200/80 bg-stone-50/80 p-2 dark:border-stone-700/80 dark:bg-white/5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wide text-stone-500 dark:text-stone-400">工作流列表</span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setSelectedCanvasWorkflowDeleteIds(canvasWorkflowTemplates.map(workflow => workflow.id))}
                                disabled={canvasWorkflowTemplates.length === 0}
                                className="rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-black text-emerald-600 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:text-stone-300 dark:bg-white/10 dark:text-emerald-100 dark:hover:bg-white/16 dark:disabled:text-stone-600"
                              >
                                全选
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedCanvasWorkflowDeleteIds([])}
                                disabled={selectedCanvasWorkflowDeleteIds.length === 0}
                                className="rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-black text-emerald-600 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:text-stone-300 dark:bg-white/10 dark:text-emerald-100 dark:hover:bg-white/16 dark:disabled:text-stone-600"
                              >
                                清空
                              </button>
                            </div>
                          </div>
                          <div className="grid max-h-52 gap-1 overflow-y-auto pr-1">
                            {canvasWorkflowTemplates.length === 0 ? (
                              <div className="rounded-[10px] border border-dashed border-stone-300/80 bg-white/70 px-3 py-4 text-center text-[11px] font-bold text-stone-400 dark:border-stone-700 dark:bg-white/5 dark:text-stone-500">
                                暂无工作流
                              </div>
                            ) : canvasWorkflowTemplates.map(workflow => {
                              const isSelectedForDelete = selectedCanvasWorkflowDeleteIds.includes(workflow.id);
                              const isEditing = canvasWorkflowEditingId === workflow.id;
                              const isBuiltIn = CANVAS_BUILT_IN_WORKFLOWS.some(item => item.id === workflow.id);
                              const isCustom = customCanvasWorkflows.some(item => item.id === workflow.id);
                              const aiNodeCount = workflow.nodes.filter(node => node.ai?.type === 'image-generator').length;
                              return (
                                <div
                                  key={workflow.id}
                                  data-canvas-manager-row="true"
                                  data-active={isEditing ? 'true' : 'false'}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => selectCanvasWorkflowForEdit(workflow.id)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault();
                                      selectCanvasWorkflowForEdit(workflow.id);
                                    }
                                  }}
                                  className={`grid cursor-pointer grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 rounded-[10px] border px-2.5 py-2 text-left transition-colors ${
                                    isEditing
                                      ? 'border-stone-900 bg-white text-stone-900 shadow-sm dark:border-stone-100 dark:bg-white/10 dark:text-stone-50'
                                      : 'border-stone-200/70 bg-white/72 text-stone-700 hover:border-stone-300 hover:bg-white dark:border-white/10 dark:bg-stone-950/30 dark:text-stone-200 dark:hover:bg-white/8'
                                  }`}
                                >
                                  <button
                                    type="button"
                                    data-canvas-manager-check="true"
                                    data-selected={isSelectedForDelete ? 'true' : 'false'}
                                    aria-pressed={isSelectedForDelete}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setSelectedCanvasWorkflowDeleteIds(prev => (
                                        prev.includes(workflow.id)
                                          ? prev.filter(id => id !== workflow.id)
                                          : [...prev, workflow.id]
                                      ));
                                    }}
                                    className={`flex h-5 w-5 items-center justify-center rounded-[7px] border transition-colors ${
                                      isSelectedForDelete
                                        ? 'border-red-400 bg-red-500 text-white'
                                        : 'border-stone-300 bg-white/80 text-transparent hover:border-red-300 dark:border-stone-700 dark:bg-stone-950/40'
                                    }`}
                                    title={`选择删除「${workflow.label}」`}
                                  >
                                    <Check className="h-3 w-3" strokeWidth={3} />
                                  </button>
                                  <div className="min-w-0">
                                    <div className="truncate text-xs font-black">{workflow.label}</div>
                                    <div className="truncate text-[10px] font-bold text-stone-400 dark:text-stone-500">
                                      {workflow.nodes.length} 个节点 / {aiNodeCount} 个生图节点
                                    </div>
                                  </div>
                                  <span className="rounded-[7px] bg-stone-100 px-2 py-0.5 text-[9px] font-black text-stone-500 dark:bg-white/8 dark:text-stone-400">
                                    {isBuiltIn && isCustom ? '已修改' : isBuiltIn ? '内置' : '自定义'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <input
                          data-no-drag="true"
                          data-canvas-manager-input="true"
                          value={canvasWorkflowNameDraft}
                          onChange={(event) => setCanvasWorkflowNameDraft(event.target.value)}
                          placeholder="工作流名称"
                          maxLength={32}
                          className="h-9 rounded-[10px] border border-stone-200/80 bg-white px-3 text-xs font-bold text-stone-700 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200/50 dark:border-stone-700 dark:bg-stone-950/60 dark:text-stone-100 dark:focus:border-emerald-700 dark:focus:ring-emerald-900/30"
                        />
                        <textarea
                          data-no-drag="true"
                          data-canvas-manager-input="true"
                          value={canvasWorkflowHintDraft}
                          onChange={(event) => setCanvasWorkflowHintDraft(event.target.value)}
                          onWheel={(event) => event.stopPropagation()}
                          placeholder="工作流说明"
                          maxLength={80}
                          className="h-20 resize-y rounded-[10px] border border-stone-200/80 bg-white px-3 py-2 text-xs leading-5 text-stone-700 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200/50 dark:border-stone-700 dark:bg-stone-950/60 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-emerald-700 dark:focus:ring-emerald-900/30"
                        />
                        <div data-canvas-manager-stats="true" className="flex flex-wrap gap-1.5 text-[10px] font-black text-stone-500 dark:text-stone-400">
                          <span className="rounded-full bg-stone-100 px-2 py-1 dark:bg-white/10">{canvasWorkflowEditingNodeCount} 个节点</span>
                          <span className="rounded-full bg-stone-100 px-2 py-1 dark:bg-white/10">{canvasWorkflowEditingAiCount} 个生图节点</span>
                        </div>
                        <button
                          type="button"
                          onClick={replaceCanvasWorkflowManagerWithSelection}
                          data-canvas-manager-replace="true"
                          className="flex h-8 items-center justify-center gap-1.5 rounded-[14px] border border-emerald-200/80 bg-emerald-50 px-3 text-[11px] font-black text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100 dark:hover:bg-emerald-400/16"
                          title="用当前框选的节点替换这个工作流的内部结构；内置工作流会保存为本地修改"
                        >
                          <LayoutGrid className="h-3.5 w-3.5" />
                          用当前选中覆盖结构
                        </button>
                        <div data-canvas-manager-footer="true" className="flex items-center justify-between gap-2 pt-1">
                          <button
                            type="button"
                            onClick={deleteSelectedCanvasWorkflows}
                            className="rounded-[15px] bg-red-50 px-3 py-1.5 text-xs font-bold text-red-500 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-300 dark:bg-red-400/10 dark:text-red-200 dark:hover:bg-red-400/16 dark:disabled:bg-stone-800 dark:disabled:text-stone-600"
                            disabled={selectedCanvasWorkflowDeleteIds.length === 0}
                            title="删除已勾选的工作流预设"
                          >
                            {selectedCanvasWorkflowDeleteIds.length > 0 ? `删除已选 ${selectedCanvasWorkflowDeleteIds.length}` : '删除'}
                          </button>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={closeCanvasWorkflowManager}
                              className="rounded-[15px] bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-600 transition-colors hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                            >
                              取消
                            </button>
                            <button
                              type="button"
                              onClick={saveCanvasWorkflowManagerChanges}
                              data-canvas-manager-primary="true"
                              className="rounded-[15px] bg-emerald-500 px-3 py-1.5 text-xs font-black text-white shadow-sm shadow-emerald-500/20 transition-colors hover:bg-emerald-400 dark:bg-emerald-400 dark:text-stone-950 dark:hover:bg-emerald-300"
                            >
                              保存修改
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                  {isCanvasMode && canvasReferenceDragState && (
                    <div
                      data-canvas-floating-layer="true"
                      className="pointer-events-none fixed z-[100090]"
                      style={{
                        left: canvasReferenceDragState.clientX,
                        top: canvasReferenceDragState.clientY,
                        transform: 'translate(-50%, -50%)',
                      }}
                    >
                      <motion.div
                        initial={{ opacity: 0, scale: 0.82, rotate: 0 }}
                        animate={{ opacity: 1, scale: 1.08, rotate: 2 }}
                        exit={{ opacity: 0, scale: 0.92, rotate: 0 }}
                        transition={{ duration: 0.12 }}
                        className="relative h-16 w-16 overflow-hidden rounded-[16px] border-2 border-white bg-stone-100 shadow-[0_18px_42px_rgba(15,23,42,0.34)] ring-2 ring-blue-500/65 dark:border-stone-900 dark:bg-stone-900 dark:ring-blue-300/70"
                      >
                        {canvasReferenceDragState.previewSource ? (
                          <img
                            src={canvasReferenceDragState.previewSource}
                            alt=""
                            className="block h-full w-full rounded-[14px] object-cover"
                            style={canvasReferenceDragState.rotation ? {
                              transform: `rotate(${canvasReferenceDragState.rotation}deg)`,
                            } : undefined}
                            draggable={false}
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-blue-500 dark:text-blue-200">
                            <ImageIcon className="h-5 w-5" />
                          </span>
                        )}
                        <span className="absolute left-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-[6px] bg-stone-950/82 px-1 text-[10px] font-black text-white shadow-sm">
                          {canvasReferenceDragState.inputIndex + 1}
                        </span>
                      </motion.div>
                    </div>
                  )}
                  {isCanvasMode && canvasContextMenu && (
                    <div
                      data-no-drag="true"
                      data-canvas-floating-layer="true"
                      data-canvas-context-menu="true"
                      className="fixed z-[100080] max-h-[calc(100vh-24px)] min-w-[176px] overflow-y-auto rounded-[16px] border border-white/55 bg-stone-950/86 p-1.5 text-stone-100 shadow-[0_18px_46px_rgba(0,0,0,0.28)] backdrop-blur-2xl dark:border-stone-700/70"
                      style={{
                        left: Math.min(canvasContextMenu.x, window.innerWidth - 196),
                        top: Math.max(12, Math.min(canvasContextMenu.y, window.innerHeight - 420)),
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                      onWheel={(event) => event.stopPropagation()}
                    >
                      {(canvasContextMenu.type === 'canvas' || canvasContextMenu.type === 'item') && (
                        <>
                          {canvasContextMenu.type === 'canvas' && (
                            <>
                              {canvasSelectedIds.length > 1 && (() => {
                                const selectedGroup = getCommonCanvasGroup(canvasSelectedIds, canvasItems);
                                const selectionHasGroup = canvasSelectedIds.some(id => (
                                  !!getCanvasGroupId(canvasItemsById.get(id))
                                ));
                                return (
                                  <>
                                    <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white/38">已选节点</div>
                                    <button
                                      type="button"
                                      className="group/menu-action flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-all hover:bg-violet-500/16 hover:text-violet-100 active:scale-[0.985]"
                                      onClick={() => {
                                        if (selectedGroup) void renameCanvasGroup(canvasSelectedIds);
                                        else void createCanvasGroup(canvasSelectedIds);
                                        setCanvasContextMenu(null);
                                      }}
                                    >
                                      {selectedGroup
                                        ? <Edit3 className="h-3.5 w-3.5 text-violet-300" />
                                        : <Layers className="h-3.5 w-3.5 text-violet-300" />}
                                      <span>{selectedGroup ? '重命名编组' : selectionHasGroup ? '重新编组' : '编组'}</span>
                                      <span className="ml-auto font-mono text-[9px] font-medium tracking-normal text-stone-400">Ctrl G</span>
                                    </button>
                                    {selectionHasGroup && (
                                      <button
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-all hover:bg-white/10 active:scale-[0.985]"
                                        onClick={() => {
                                          ungroupCanvasItems(canvasSelectedIds);
                                          setCanvasContextMenu(null);
                                        }}
                                      >
                                        <Unplug className="h-3.5 w-3.5 text-stone-400" />
                                        <span>取消编组</span>
                                      </button>
                                    )}
                                    <div className="my-1 h-px bg-white/10" />
                                  </>
                                );
                              })()}
                              <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white/38">创建</div>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-cyan-500/18 hover:text-cyan-200"
                                onClick={() => {
                                  addCanvasAiGeneratorNodeAtWorld({ x: canvasContextMenu.worldX, y: canvasContextMenu.worldY });
                                  setCanvasContextMenu(null);
                                }}
                              >
                                <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
                                AI 生图节点
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-fuchsia-500/18 hover:text-fuchsia-200"
                                onClick={() => {
                                  addCanvasImageFusionNodeAtWorld({ x: canvasContextMenu.worldX, y: canvasContextMenu.worldY });
                                  setCanvasContextMenu(null);
                                }}
                              >
                                <Layers className="h-3.5 w-3.5 text-fuchsia-300" />
                                AI 溶图节点
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-emerald-500/18 hover:text-emerald-200"
                                onClick={() => {
                                  addCanvasAiVideoGeneratorNodeAtWorld({ x: canvasContextMenu.worldX, y: canvasContextMenu.worldY });
                                  setCanvasContextMenu(null);
                                }}
                              >
                                <Film className="h-3.5 w-3.5 text-emerald-300" />
                                AI 视频节点
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                onClick={() => {
                                  addCanvasFrameInterpolationNodeAtWorld({ x: canvasContextMenu.worldX, y: canvasContextMenu.worldY });
                                  setCanvasContextMenu(null);
                                }}
                              >
                                <RefreshCw className="h-3.5 w-3.5 text-cyan-300" />
                                视频补帧节点
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-violet-500/18 hover:text-violet-200"
                                onClick={() => {
                                  addCanvasEnhancementNodeAtWorld('image', { x: canvasContextMenu.worldX, y: canvasContextMenu.worldY });
                                  setCanvasContextMenu(null);
                                }}
                              >
                                <ImageIcon className="h-3.5 w-3.5 text-violet-300" />
                                图片清晰度增强
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-violet-500/18 hover:text-violet-200"
                                onClick={() => {
                                  addCanvasEnhancementNodeAtWorld('video', { x: canvasContextMenu.worldX, y: canvasContextMenu.worldY });
                                  setCanvasContextMenu(null);
                                }}
                              >
                                <Film className="h-3.5 w-3.5 text-violet-300" />
                                视频清晰度增强
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                onClick={() => {
                                  addCanvasTextItemAtWorld({ x: canvasContextMenu.worldX, y: canvasContextMenu.worldY });
                                  setCanvasContextMenu(null);
                                }}
                              >
                                <Type className="h-3.5 w-3.5 text-amber-300" />
                                文字节点
                              </button>
                              {canvasClipboardRef.current.length > 0 && (
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                  onClick={() => {
                                    pasteCanvasItems({ x: canvasContextMenu.x, y: canvasContextMenu.y });
                                    setCanvasContextMenu(null);
                                  }}
                                >
                                  <Clipboard className="h-3.5 w-3.5 text-emerald-300" />
                                  粘贴
                                </button>
                              )}
                              <div className="my-1 h-px bg-white/10" />
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                onClick={() => {
                                  fitCanvasViewToItems();
                                  setCanvasContextMenu(null);
                                }}
                              >
                                <Compass className="h-3.5 w-3.5 text-amber-300" />
                                适配全部
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                onClick={() => {
                                  organizeCanvasItems();
                                  setCanvasContextMenu(null);
                                }}
                              >
                                <LayoutGrid className="h-3.5 w-3.5 text-cyan-300" />
                                一键整理
                              </button>
                            </>
                          )}
                          {canvasContextMenu.type === 'item' && (() => {
                            const actionIds = getCanvasActionIds(canvasContextMenu.itemId);
                            const target = canvasItemsById.get(canvasContextMenu.itemId || '');
                            const targetWorkflowGroup = getCanvasWorkflowGroup(target);
                            const commonCanvasGroup = getCommonCanvasGroup(actionIds, canvasItems);
                            const hasCanvasGroup = actionIds.some((id: string) => (
                              !!getCanvasGroupId(canvasItemsById.get(id))
                            ));
                            return (
                              <>
                                <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white/38">节点</div>
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                  onClick={() => {
                                    void copyCanvasItemsToAvailableClipboards(actionIds);
                                    setCanvasContextMenu(null);
                                  }}
                                >
                                  <Copy className="h-3.5 w-3.5 text-cyan-300" />
                                  复制
                                </button>
                                {actionIds.length > 1 && !commonCanvasGroup && (
                                  <button
                                    type="button"
                                    className="group/menu-action flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-all hover:bg-violet-500/16 hover:text-violet-100 active:scale-[0.985]"
                                    onClick={() => {
                                      void createCanvasGroup(actionIds);
                                      setCanvasContextMenu(null);
                                    }}
                                  >
                                    <Layers className="h-3.5 w-3.5 text-violet-300" />
                                    <span>{hasCanvasGroup ? '重新编组' : '编组'}</span>
                                    <span className="ml-auto font-mono text-[9px] font-medium tracking-normal text-stone-400 transition-colors group-hover/menu-action:text-violet-300">Ctrl G</span>
                                  </button>
                                )}
                                {commonCanvasGroup && (
                                  <button
                                    type="button"
                                    className="group/menu-action flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-all hover:bg-violet-500/16 hover:text-violet-100 active:scale-[0.985]"
                                    onClick={() => {
                                      void renameCanvasGroup(actionIds);
                                      setCanvasContextMenu(null);
                                    }}
                                  >
                                    <Edit3 className="h-3.5 w-3.5 text-violet-300" />
                                    <span>重命名编组</span>
                                  </button>
                                )}
                                {hasCanvasGroup && (
                                  <button
                                    type="button"
                                    className="group/menu-action flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-all hover:bg-white/10 active:scale-[0.985]"
                                    onClick={() => {
                                      ungroupCanvasItems(actionIds);
                                      setCanvasContextMenu(null);
                                    }}
                                  >
                                    <Unplug className="h-3.5 w-3.5 text-stone-400" />
                                    <span>取消编组</span>
                                    <span className="ml-auto font-mono text-[9px] font-medium tracking-normal text-stone-400">Ctrl ⇧ G</span>
                                  </button>
                                )}
                                {target?.item.type !== 'three-scene' && (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                    onClick={() => {
                                      void downloadCanvasItemsByIds(actionIds);
                                      setCanvasContextMenu(null);
                                    }}
                                  >
                                    <Download className="h-3.5 w-3.5 text-sky-300" />
                                    下载
                                  </button>
                                )}
                                {ENABLE_THREE_SCENE_CREATION && target?.item.type === 'image' && actionIds.length === 1 && (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                    onClick={() => {
                                      setCanvasContextMenu(null);
                                      addCanvasThreeSceneGeneratorNode(undefined, [target.id]);
                                    }}
                                  >
                                    <Box className="h-3.5 w-3.5 text-stone-300" />
                                    新建 3D 场景节点
                                  </button>
                                )}
                                {isCanvasAgentTextTarget(target) && (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-blue-500/18 hover:text-blue-200"
                                    onClick={() => {
                                      if (!target) return;
                                      void runCanvasTextAgentNode(target.id);
                                      setCanvasContextMenu(null);
                                    }}
                                  >
                                    <Sparkles className="h-3.5 w-3.5 text-blue-300" />
                                    运行 Agent
                                  </button>
                                )}
                                {isCanvasAiGeneratorType(target?.ai?.type) && (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-cyan-500/18 hover:text-cyan-200"
                                    onClick={() => {
                                      if (!target) return;
                                      void generateCanvasAiGeneratorNode(target.id);
                                      setCanvasContextMenu(null);
                                    }}
                                  >
                                    {getCanvasAiMediaType(target?.ai) === 'video' ? <Film className="h-3.5 w-3.5 text-emerald-300" /> : <Sparkles className="h-3.5 w-3.5 text-cyan-300" />}
                                    {hasCanvasAiGeneratedResults(target) ? '再次生成' : '生成'}
                                  </button>
                                )}
                                {target?.ai?.type === 'workflow' && (
                                  <>
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-emerald-500/18 hover:text-emerald-200"
                                      onClick={() => {
                                        void generateCanvasWorkflowModuleNode(target.id);
                                        setCanvasContextMenu(null);
                                      }}
                                    >
                                      <Link className="h-3.5 w-3.5 text-emerald-300" />
                                      {hasCanvasAiGeneratedResults(target) ? '再次运行工作流' : '运行工作流'}
                                    </button>
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                      onClick={() => {
                                        expandCanvasWorkflowModuleForEdit(target.id);
                                        setCanvasContextMenu(null);
                                      }}
                                    >
                                      <Edit3 className="h-3.5 w-3.5 text-amber-300" />
                                      {hasCanvasAiGeneratedResults(target) ? '展开工作流' : '修改工作流'}
                                    </button>
                                    {getCanvasWorkflowInternalSlotNodes(getCanvasWorkflowTemplateFromNode(target)).length > 0 && (
                                      <button
                                        type="button"
                                        className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                        onClick={() => {
                                          void exportCanvasWorkflowModuleInstance(target.id);
                                          setCanvasContextMenu(null);
                                        }}
                                      >
                                        <Download className="h-3.5 w-3.5 text-sky-300" />
                                        导出实例（含槽位图片）
                                      </button>
                                    )}
                                  </>
                                )}
                                {targetWorkflowGroup && (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-emerald-500/18 hover:text-emerald-200"
                                    onClick={() => {
                                      collapseCanvasWorkflowGroup(canvasContextMenu.itemId || '');
                                      setCanvasContextMenu(null);
                                    }}
                                  >
                                    <Link className="h-3.5 w-3.5 text-emerald-300" />
                                    折叠工作流
                                  </button>
                                )}
                                {target?.ai?.type !== 'workflow' && target?.item.type !== 'three-scene' && (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                    onClick={() => {
                                      updateCanvasSelection(actionIds);
                                      saveSelectedCanvasWorkflow();
                                      setCanvasContextMenu(null);
                                    }}
                                  >
                                    <BookOpen className="h-3.5 w-3.5 text-violet-300" />
                                    保存为工作流
                                  </button>
                                )}
                                {target?.item.type === 'image' && (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                    onPointerDown={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      void openCanvasBrushEditor(target.id);
                                      setCanvasContextMenu(null);
                                    }}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                    }}
                                  >
                                    <Brush className="h-3.5 w-3.5 text-blue-300" />
                                    画笔标记
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                  onClick={() => {
                                    fitCanvasViewToItems(actionIds);
                                    setCanvasContextMenu(null);
                                  }}
                                >
                                  <Compass className="h-3.5 w-3.5 text-amber-300" />
                                  适配选中
                                </button>
                                {actionIds.length > 1 && (
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                    onClick={() => {
                                      organizeCanvasItems(actionIds);
                                      setCanvasContextMenu(null);
                                    }}
                                  >
                                    <LayoutGrid className="h-3.5 w-3.5 text-cyan-300" />
                                    整理选中
                                  </button>
                                )}
                                <div className="my-1 h-px bg-white/10" />
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-red-300 transition-colors hover:bg-red-500/18"
                                  onClick={() => {
                                    const removedCount = removeCanvasItemsByIds(actionIds);
                                    if (removedCount > 0) showToast(`已从画布移除 ${removedCount} 个节点，抽屉素材已保留`);
                                    setCanvasContextMenu(null);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  从画布移除
                                </button>
                              </>
                            );
                          })()}
                        </>
                      )}
                      {canvasContextMenu.type === 'source-connection' && (() => {
                        const sourceIds = canvasContextMenu.sourceIds?.length
                          ? canvasContextMenu.sourceIds
                          : canvasContextMenu.sourceId
                            ? [canvasContextMenu.sourceId]
                            : [];
                        const targetNodes = canvasItems
                          .filter(item => canUseCanvasItemAsAiTarget(item) && !sourceIds.includes(item.id))
                          .filter(item => sourceIds.some((sourceId: string) => canUseCanvasItemAsInputForTarget(canvasItemsById.get(sourceId), item)))
                          .slice(0, 6);
                        return (
                          <>
                            <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white/38">连接到</div>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-cyan-500/18 hover:text-cyan-200"
                              onClick={() => {
                                addCanvasAiGeneratorNodeForSources(sourceIds, { x: canvasContextMenu.worldX, y: canvasContextMenu.worldY });
                                setCanvasContextMenu(null);
                              }}
                            >
                              <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
                              新建 AI 生图节点
                            </button>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-fuchsia-500/18 hover:text-fuchsia-200"
                              onClick={() => {
                                addCanvasImageFusionNodeAtWorld(
                                  { x: canvasContextMenu.worldX, y: canvasContextMenu.worldY },
                                  sourceIds,
                                );
                                setCanvasContextMenu(null);
                              }}
                            >
                              <Layers className="h-3.5 w-3.5 text-fuchsia-300" />
                              新建 AI 溶图节点
                            </button>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-emerald-500/18 hover:text-emerald-200"
                              onClick={() => {
                                addCanvasAiVideoGeneratorNodeForSources(sourceIds, { x: canvasContextMenu.worldX, y: canvasContextMenu.worldY });
                                setCanvasContextMenu(null);
                              }}
                            >
                              <Film className="h-3.5 w-3.5 text-emerald-300" />
                              新建 AI 视频节点
                            </button>
                            {ENABLE_THREE_SCENE_CREATION && sourceIds.some((sourceId: string) => canUseCanvasItemAsImageEnhancementInput(canvasItemsById.get(sourceId))) && (
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                onClick={() => {
                                  addCanvasThreeSceneGeneratorNode(
                                    { x: canvasContextMenu.worldX, y: canvasContextMenu.worldY },
                                    sourceIds,
                                  );
                                  setCanvasContextMenu(null);
                                }}
                              >
                                <Box className="h-3.5 w-3.5 text-stone-300" />
                                新建 3D 场景节点
                              </button>
                            )}
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-cyan-500/18 hover:text-cyan-200"
                              onClick={() => {
                                addCanvasFrameInterpolationNodeForSources(sourceIds, { x: canvasContextMenu.worldX, y: canvasContextMenu.worldY });
                                setCanvasContextMenu(null);
                              }}
                            >
                              <RefreshCw className="h-3.5 w-3.5 text-cyan-300" />
                              新建视频补帧节点
                            </button>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-violet-500/18 hover:text-violet-200"
                              onClick={() => {
                                addCanvasEnhancementNodeForSources(sourceIds, 'image', { x: canvasContextMenu.worldX, y: canvasContextMenu.worldY });
                                setCanvasContextMenu(null);
                              }}
                            >
                              <ImageIcon className="h-3.5 w-3.5 text-violet-300" />
                              新建图片增强节点
                            </button>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-violet-500/18 hover:text-violet-200"
                              onClick={() => {
                                addCanvasEnhancementNodeForSources(sourceIds, 'video', { x: canvasContextMenu.worldX, y: canvasContextMenu.worldY });
                                setCanvasContextMenu(null);
                              }}
                            >
                              <Film className="h-3.5 w-3.5 text-violet-300" />
                              新建视频增强节点
                            </button>
                            {targetNodes.length > 0 && (
                              <>
                                <div className="my-1 h-px bg-white/10" />
                                {targetNodes.map(target => (
                                  <button
                                    key={target.id}
                                    type="button"
                                    className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                                    onClick={() => {
                                      connectCanvasItemsToGenerator(sourceIds, target.id);
                                      setCanvasContextMenu(null);
                                    }}
                                  >
                                    {isCanvasAgentTextTarget(target)
                                      ? <Type className="h-3.5 w-3.5 text-amber-300" />
                                      : target.item.type === 'three-scene'
                                        ? <Box className="h-3.5 w-3.5 text-stone-300" />
                                      : target.ai?.type === 'workflow'
                                        ? <Link className="h-3.5 w-3.5 text-emerald-300" />
                                        : getCanvasAiMediaType(target.ai) === 'video'
                                          ? <Film className="h-3.5 w-3.5 text-emerald-300" />
                                          : <Sparkles className="h-3.5 w-3.5 text-cyan-300" />}
                                    <span className="max-w-[138px] truncate">{getCanvasInputTargetLabel(target)}</span>
                                  </button>
                                ))}
                              </>
                            )}
                          </>
                        );
                      })()}
                      {canvasContextMenu.type === 'target-input' && canvasContextMenu.targetId && (() => {
                        const target = canvasItemsById.get(canvasContextMenu.targetId || '');
                        const canUploadReferenceVideo = (
                          target?.ai?.type === 'frame-interpolation'
                          || target?.ai?.type === 'video-enhancement'
                          || (target?.ai?.type === 'video-generator' && target.ai.videoInputMode !== 'FLF')
                        );
                        const isMediaToolInput = target?.item.type === 'three-scene'
                          || target?.ai?.type === 'frame-interpolation'
                          || isCanvasAiEnhancementType(target?.ai?.type);
                        const isVideoOnlyInput = target?.ai?.type === 'frame-interpolation' || target?.ai?.type === 'video-enhancement';
                        const workflowUserInput = target?.ai?.type === 'workflow'
                          ? normalizeCanvasWorkflowUserInput(getCanvasWorkflowTemplateFromNode(target)?.userInput)
                          : null;
                        const canUploadWorkflowImages = target?.ai?.type !== 'workflow' || workflowUserInput?.acceptImages !== false;
                        const canUploadWorkflowFiles = target?.ai?.type === 'workflow' && workflowUserInput?.acceptFiles === true;
                        return (
                        <>
                          <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-white/38">新增输入</div>
                          {!isMediaToolInput && (
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                              onClick={() => {
                                addCanvasTextInputForGenerator(canvasContextMenu.targetId || '', { x: canvasContextMenu.worldX, y: canvasContextMenu.worldY });
                                setCanvasContextMenu(null);
                              }}
                            >
                              <Type className="h-3.5 w-3.5 text-amber-300" />
                              文字说明
                            </button>
                          )}
                          {!isVideoOnlyInput && canUploadWorkflowImages && (
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                              onClick={() => {
                                const targetId = canvasContextMenu.targetId || '';
                                setCanvasContextMenu(null);
                                chooseLocalImagesForCanvasGenerator(targetId);
                              }}
                            >
                              <Upload className="h-3.5 w-3.5 text-cyan-300" />
                              上传图片
                            </button>
                          )}
                          {canUploadWorkflowFiles && (
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                              onClick={() => {
                                const targetId = canvasContextMenu.targetId || '';
                                setCanvasContextMenu(null);
                                chooseLocalFilesForCanvasWorkflow(targetId);
                              }}
                            >
                              <FileIcon className="h-3.5 w-3.5 text-violet-300" />
                              上传文件
                            </button>
                          )}
                          {canUploadReferenceVideo && (
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-stone-100 transition-colors hover:bg-white/10"
                              onClick={() => {
                                const targetId = canvasContextMenu.targetId || '';
                                setCanvasContextMenu(null);
                                void chooseLocalVideosForCanvasGenerator(targetId);
                              }}
                            >
                              <Film className="h-3.5 w-3.5 text-emerald-300" />
                              上传视频
                            </button>
                          )}
                        </>
                        );
                      })()}
                      {canvasContextMenu.type === 'connection' && (
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left text-xs font-bold text-red-300 transition-colors hover:bg-red-500/18"
                          onClick={() => {
                            if (canvasContextMenu.targetId && canvasContextMenu.sourceId && removeCanvasConnection(canvasContextMenu.targetId, canvasContextMenu.sourceId)) {
                              showToast('已删除连接线');
                            }
                            setCanvasContextMenu(null);
                          }}
                        >
                          <Unplug className="h-3.5 w-3.5" />
                          删除连接线
                        </button>
                      )}
                    </div>
                  )}
                  {isCanvasMode && (
                    <CanvasToolbar
                      toolbarRef={canvasToolbarRef}
                      top={canvasToolbarTop}
                      right={16}
                      navigator={(
                        <CanvasNavigator
                          visible={isCanvasNavigatorVisible}
                          panelRef={canvasNavigatorPanelRef}
                          items={canvasNavItems}
                          selectedIds={canvasSelectedIdsSet}
                          zoomPercent={Math.round(canvasScale * 100)}
                          getPreview={getCanvasItemNavPreview}
                          getThumbnailSource={getCachedCanvasNavThumbnailSource}
                          onToggle={() => setIsCanvasNavigatorVisible(value => !value)}
                          onClose={() => setIsCanvasNavigatorVisible(false)}
                          onSelectItem={item => centerCanvasItemInView(item, { select: true })}
                          onZoomOut={() => {
                            const surface = canvasSurfaceRef.current;
                            if (surface) {
                              zoomCanvasAt(
                                surface.getBoundingClientRect().left + surface.clientWidth / 2,
                                surface.getBoundingClientRect().top + surface.clientHeight / 2,
                                360
                              );
                            }
                          }}
                          onResetZoom={() => {
                            canvasScaleRef.current = 1;
                            applyCanvasScaleStyles(1, canvasSizeRef.current, { updateViewport: false });
                            commitCanvasScaleSoon();
                          }}
                          onFit={() => fitCanvasViewToItems(
                            canvasSelectedIds.length > 0 ? canvasSelectedIds : undefined
                          )}
                          onZoomIn={() => {
                            const surface = canvasSurfaceRef.current;
                            if (surface) {
                              zoomCanvasAt(
                                surface.getBoundingClientRect().left + surface.clientWidth / 2,
                                surface.getBoundingClientRect().top + surface.clientHeight / 2,
                                -360
                              );
                            }
                          }}
                          onLocatePrimary={() => centerCanvasItemInView(
                            getCanvasPrimaryImageItem(),
                            { select: true }
                          )}
                        />
                      )}
                      promptValue={CANVAS_AI_PROMPT_PRESET_PLACEHOLDER}
                      promptOptions={canvasAiPromptPresetSelectOptions}
                      workflowValue={CANVAS_WORKFLOW_SELECT_PLACEHOLDER}
                      workflowOptions={canvasWorkflowSelectOptions}
                      hasWorkflow={canvasItems.some(item => item.ai?.type === 'workflow')}
                      onAddImage={() => addCanvasAiGeneratorNode()}
                      showThreeScene={ENABLE_THREE_SCENE_CREATION}
                      onCreateThreeScene={() => addCanvasThreeSceneGeneratorNode()}
                      onAddFusion={() => addCanvasImageFusionNode()}
                      onAddVideo={() => addCanvasAiVideoGeneratorNode()}
                      onAddFrameInterpolation={() => addCanvasFrameInterpolationNode()}
                      onAddEnhancement={mediaType => addCanvasEnhancementNode(mediaType)}
                      onPromptChange={(value) => {
                        if (value === CANVAS_AI_PROMPT_PRESET_ADD_VALUE) {
                          openCanvasPresetEditor();
                          return;
                        }
                        if (value === CANVAS_AI_PROMPT_PRESET_MANAGE_VALUE) {
                          openCanvasPresetManager();
                          return;
                        }
                        const preset = canvasAiPromptPresets.find(item => item.id === value);
                        if (preset) addCanvasAiGeneratorNode(undefined, preset);
                      }}
                      onWorkflowChange={(value) => {
                        if (value === CANVAS_WORKFLOW_SAVE_SELECTION_VALUE) {
                          saveSelectedCanvasWorkflow();
                          return;
                        }
                        if (value === CANVAS_WORKFLOW_MANAGE_VALUE) {
                          openCanvasWorkflowManager();
                          return;
                        }
                        const workflow = canvasWorkflowTemplates.find(item => item.id === value);
                        if (workflow) addCanvasWorkflowTemplate(workflow);
                      }}
                      onRunWorkflow={() => runSelectedCanvasWorkflowModules()}
                      onAddText={() => addCanvasTextItem()}
                      onOpenInspirationSpace={openInspirationSpace}
                    />
                  )}
                  {isCanvasMode && isCanvasGeneratedListVisible && (
                    <div
                      data-no-drag="true"
                      data-canvas-generated-panel="true"
                      className="absolute bottom-4 left-4 z-[100050] flex max-h-[42vh] w-[292px] flex-col rounded-[14px] border border-stone-200 bg-white p-2.5 text-stone-700 shadow-[0_10px_28px_rgba(24,24,27,0.10)] dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
                      onPointerDown={(event) => event.stopPropagation()}
                      onMouseDown={(event) => event.stopPropagation()}
                      onWheel={(event) => event.stopPropagation()}
                    >
                      <div className="flex items-center justify-between gap-2 px-0.5">
                        <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-black">
                          <ImageIcon className="h-3.5 w-3.5 text-stone-500" />
                          <span>已生成</span>
                          <span className="rounded-[6px] bg-stone-100 px-1.5 py-0.5 font-mono text-[9px] text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                            {canvasGeneratedItemsForList.length}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {canvasGeneratedDownloadableItems.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsCanvasGeneratedMultiSelect(prev => {
                                  if (prev) setCanvasGeneratedSelectedIds([]);
                                  return !prev;
                                });
                              }}
                              className={`flex h-[22px] items-center gap-1 rounded-[7px] px-1.5 text-[9px] font-black transition-colors ${
                                isCanvasGeneratedMultiSelect
                                  ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950'
                                  : 'text-stone-400 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-100'
                              }`}
                              title={isCanvasGeneratedMultiSelect ? '退出多选' : '批量选择下载'}
                            >
                              <CheckSquare className="h-3 w-3" />
                              {isCanvasGeneratedMultiSelect ? '取消' : '多选'}
                            </button>
                          )}
                          {canvasGeneratedItemsForList.length > 0 && (
                            <button
                              type="button"
                              onClick={() => fitCanvasViewToItems(canvasGeneratedItemsForList.map(entry => entry.canvasItem.id))}
                              className="flex h-[18px] w-[18px] items-center justify-center rounded-[7px] text-stone-400 transition-colors hover:bg-stone-100 hover:text-cyan-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-cyan-200"
                              title="适配全部已生成内容"
                            >
                              <LayoutGrid className="h-2.5 w-2.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setIsCanvasGeneratedListVisible(false)}
                            className="flex h-[18px] w-[18px] items-center justify-center rounded-[7px] text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                            title="隐藏已生成列表"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      </div>
                      {isCanvasGeneratedMultiSelect && (
                        <div className="mt-2 flex items-center justify-between gap-2 rounded-[10px] bg-stone-100 px-2 py-1.5 dark:bg-stone-800">
                          <button
                            type="button"
                            onClick={() => {
                              const allIds = canvasGeneratedDownloadableItems.map(entry => entry.id);
                              const allSelected = allIds.length > 0 && allIds.every(id => canvasGeneratedSelectedIdSet.has(id));
                              setCanvasGeneratedSelectedIds(allSelected ? [] : allIds);
                            }}
                            className="flex items-center gap-1 text-[9px] font-black text-cyan-700 hover:text-cyan-900 dark:text-cyan-200 dark:hover:text-white"
                          >
                            <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border ${
                              canvasGeneratedDownloadableItems.length > 0
                              && canvasGeneratedDownloadableItems.every(entry => canvasGeneratedSelectedIdSet.has(entry.id))
                                ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950'
                                : 'border-stone-300 bg-white dark:border-stone-600 dark:bg-stone-900'
                            }`}>
                              {canvasGeneratedDownloadableItems.length > 0
                              && canvasGeneratedDownloadableItems.every(entry => canvasGeneratedSelectedIdSet.has(entry.id))
                                ? <Check className="h-2.5 w-2.5" />
                                : null}
                            </span>
                            全选
                          </button>
                          <span className="text-[9px] font-bold text-stone-500 dark:text-stone-400">
                            已选 {canvasGeneratedSelectedDownloadItems.length} 张
                          </span>
                          <button
                            type="button"
                            disabled={canvasGeneratedSelectedDownloadItems.length === 0}
                            onClick={() => {
                              void downloadBufferItems(canvasGeneratedSelectedDownloadItems, { feature: 'commercial_export' });
                            }}
                            className="flex h-6 items-center gap-1 rounded-[7px] bg-stone-900 px-2 text-[9px] font-semibold text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-300 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-white dark:disabled:bg-stone-700"
                          >
                            <Download className="h-3 w-3" />
                            下载
                          </button>
                        </div>
                      )}
                      {canvasGeneratedItemsForList.length > CANVAS_GENERATED_LIST_RENDER_LIMIT && (
                        <div className="mt-1.5 px-1 text-[9px] font-bold text-stone-400 dark:text-stone-500">
                          为保持流畅，仅显示最近 {CANVAS_GENERATED_LIST_RENDER_LIMIT} 条
                        </div>
                      )}
                      <div className="mt-2 min-h-0 overflow-y-auto pr-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {canvasGeneratedItemsForList.length === 0 ? (
                          <div className="flex h-24 flex-col items-center justify-center gap-1 rounded-[14px] border border-dashed border-stone-200/80 bg-white/52 text-center text-[10px] font-bold text-stone-400 dark:border-stone-700/70 dark:bg-stone-950/36 dark:text-stone-500">
                            <Sparkles className="h-4 w-4 text-cyan-400" />
                            暂无生成内容
                          </div>
                        ) : (
                          <div className="grid gap-1.5">
                            {canvasGeneratedItemsForRender.map(generatedItem => {
                              const source = getCanvasItemNavSource(generatedItem.item);
                              const isPending = generatedItem.ai?.status === 'working' || !source;
                              const isError = generatedItem.ai?.status === 'error';
                              const prompt = (generatedItem.ai?.prompt || generatedItem.item.remark || '').trim();
                              const generatedAt = generatedItem.ai?.generatedAt || generatedItem.item.createdAt || 0;
                              const generatedElapsedText = generatedItem.ai?.status === 'working'
                                ? formatCanvasWorkingElapsed(generatedItem.ai?.generatedAt, canvasWorkingTimerTick)
                                : '';
                              return (
                                <div
                                  key={`canvas-generated-list-${generatedItem.id}`}
                                  role="button"
                                  tabIndex={0}
                                  onPointerDown={(event) => {
                                    if (!isCanvasGeneratedMultiSelect) return;
                                    event.preventDefault();
                                    event.stopPropagation();
                                    if (isPending || isError) return;
                                    setCanvasGeneratedSelectedIds(prev => (
                                      prev.includes(generatedItem.id)
                                        ? prev.filter(id => id !== generatedItem.id)
                                        : [...prev, generatedItem.id]
                                    ));
                                  }}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    if (isCanvasGeneratedMultiSelect) {
                                      return;
                                    }
                                    centerCanvasItemInView(generatedItem.canvasItem, { select: true });
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key !== 'Enter' && event.key !== ' ') return;
                                    event.preventDefault();
                                    event.stopPropagation();
                                    if (isCanvasGeneratedMultiSelect) {
                                      if (isPending || isError) return;
                                      setCanvasGeneratedSelectedIds(prev => (
                                        prev.includes(generatedItem.id)
                                          ? prev.filter(id => id !== generatedItem.id)
                                          : [...prev, generatedItem.id]
                                      ));
                                      return;
                                    }
                                    centerCanvasItemInView(generatedItem.canvasItem, { select: true });
                                  }}
                                  className={`group/generated flex w-full cursor-pointer items-center gap-2 rounded-[14px] border p-1.5 text-left transition-colors ${
                                    isCanvasGeneratedMultiSelect && canvasGeneratedSelectedIdSet.has(generatedItem.id)
                                      ? 'border-stone-900 bg-stone-100 ring-1 ring-stone-300/60 dark:border-stone-100 dark:bg-stone-800'
                                      : canvasSelectedIdsSet.has(generatedItem.canvasItem.id)
                                      ? 'border-stone-400 bg-stone-100 dark:border-stone-500 dark:bg-stone-800'
                                      : 'border-white/70 bg-white/58 hover:bg-white/90 dark:border-stone-700/60 dark:bg-stone-950/28 dark:hover:bg-stone-800/70'
                                  }`}
                                  title={prompt || generatedItem.item.name || '定位已生成内容'}
                                >
                                  <div className="relative h-12 w-14 shrink-0 overflow-hidden rounded-[10px] bg-stone-900/8 dark:bg-white/8">
                                    {isCanvasGeneratedMultiSelect && (
                                      <span className={`absolute left-1 top-1 z-10 flex h-4 w-4 items-center justify-center rounded-[5px] border shadow-sm ${
                                        canvasGeneratedSelectedIdSet.has(generatedItem.id)
                                          ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950'
                                          : isPending || isError
                                            ? 'border-stone-300 bg-stone-200/90 text-stone-400 dark:border-stone-600 dark:bg-stone-700/90'
                                            : 'border-white bg-white/90 text-transparent dark:border-stone-500 dark:bg-stone-900/90'
                                      }`}>
                                        {canvasGeneratedSelectedIdSet.has(generatedItem.id) && <Check className="h-3 w-3" />}
                                      </span>
                                    )}
                                    {isPending || isError ? (
                                      <div className={`flex h-full w-full items-center justify-center ${isError ? 'bg-red-500/12 text-red-500' : 'bg-cyan-500/10 text-cyan-500'}`}>
                                        <Sparkles className={`h-4 w-4 ${isPending && !isError ? 'animate-pulse' : ''}`} />
                                      </div>
                                    ) : generatedItem.item.type === 'video' && source && !/^data:image\//i.test(source) ? (
                                      source ? (
                                        <video
                                          src={source}
                                          muted
                                          loop
                                          playsInline
                                          preload="metadata"
                                          className="h-full w-full object-cover"
                                        />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center text-emerald-500">
                                          <Film className="h-4 w-4" />
                                        </div>
                                      )
                                    ) : (
                                      <img
                                        src={source}
                                        alt={generatedItem.item.name || '已生成图片'}
                                        loading="lazy"
                                        decoding="async"
                                        className="h-full w-full object-cover"
                                        draggable={false}
                                      />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-black ${
                                        isError
                                          ? 'bg-red-100 text-red-600 dark:bg-red-400/16 dark:text-red-200'
                                          : isPending
                                            ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-400/16 dark:text-cyan-200'
                                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/16 dark:text-emerald-200'
                                      }`}>
                                        {isError ? '失败' : isPending ? (generatedElapsedText ? `生成中 ${generatedElapsedText}` : '生成中') : '完成'}
                                      </span>
                                      <span className="truncate text-[10px] font-black text-stone-700 dark:text-stone-200">
                                        {generatedItem.item.name || (generatedItem.item.type === 'video' ? 'AI 视频' : 'AI 生图')}
                                      </span>
                                    </div>
                                    <div className="mt-0.5 truncate text-[9px] font-medium text-stone-400 dark:text-stone-500">
                                      {prompt || (isError ? getCanvasAiErrorSummary(generatedItem.ai?.error) : '无 Prompt 记录')}
                                    </div>
                                    <div className="mt-1 flex items-center justify-between gap-1">
                                      <span className="font-mono text-[9px] font-bold text-stone-400 dark:text-stone-500">
                                        {generatedAt ? new Date(generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                      </span>
                                      <span className="flex items-center gap-1">
                                        {!isCanvasGeneratedMultiSelect && !isPending && !isError && generatedItem.item.type === 'image' && (
                                          <button
                                            type="button"
                                            onPointerDown={(event) => {
                                              event.preventDefault();
                                              event.stopPropagation();
                                              void openCanvasBrushEditor(generatedItem.canvasItem.id);
                                            }}
                                            onClick={(event) => {
                                              event.preventDefault();
                                              event.stopPropagation();
                                            }}
                                            className="flex h-5 w-5 items-center justify-center rounded-[8px] text-stone-400 opacity-0 transition-all hover:bg-blue-100 hover:text-blue-700 group-hover/generated:opacity-100 dark:hover:bg-blue-400/14 dark:hover:text-blue-200"
                                            title="画笔标记"
                                          >
                                            <Brush className="h-3 w-3" />
                                          </button>
                                        )}
                                        {!isCanvasGeneratedMultiSelect && <button
                                          type="button"
                                          onClick={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            void downloadBufferItems([generatedItem.item], { feature: 'commercial_export' });
                                          }}
                                          className="flex h-5 w-5 items-center justify-center rounded-[8px] text-stone-400 opacity-0 transition-all hover:bg-cyan-100 hover:text-cyan-700 group-hover/generated:opacity-100 dark:hover:bg-cyan-400/14 dark:hover:text-cyan-200"
                                          title="下载"
                                        >
                                          <Download className="h-3 w-3" />
                                        </button>}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {isCanvasMode && !isCanvasGeneratedListVisible && (
                    <button
                      type="button"
                      data-no-drag="true"
                      onClick={() => setIsCanvasGeneratedListVisible(true)}
                      className="absolute bottom-4 left-4 z-[100050] flex h-9 items-center gap-1.5 rounded-[10px] border border-stone-200 bg-white px-3 text-[11px] font-semibold text-stone-700 shadow-[0_4px_14px_rgba(24,24,27,0.08)] transition-colors hover:bg-stone-100 hover:text-stone-950 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                      title="显示已生成列表"
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      已生成 {canvasGeneratedItemsForList.length}
                    </button>
                  )}
                  {isCanvasMode && (
                    <button
                      type="button"
                      data-no-drag="true"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setIsCanvasChromeHidden(prev => !prev);
                        window.requestAnimationFrame(() => {
                          canvasSurfaceRef.current?.focus({ preventScroll: true });
                        });
                      }}
                      className="absolute bottom-4 z-[100050] flex h-10 w-10 items-center justify-center rounded-[10px] border border-stone-700 bg-stone-900 text-white shadow-[0_6px_18px_rgba(24,24,27,0.16)] transition-colors hover:bg-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 dark:border-stone-600 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-white"
                      style={{ right: getCanvasChatOffsetRight(16) }}
                      data-canvas-chat-offset-base="16"
                      title={isCanvasChromeHidden ? '显示菜单栏 (Tab)' : '隐藏菜单栏，画布全屏 (Tab)'}
                    >
                      {isCanvasChromeHidden ? <Minimize2 className="h-[18px] w-[18px]" /> : <Maximize2 className="h-[18px] w-[18px]" />}
                    </button>
                  )}
</>
  );
}
