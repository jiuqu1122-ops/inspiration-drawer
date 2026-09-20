import { AnimatePresence,motion } from 'framer-motion';
import { Bot,Check,Edit3,FolderPlus,Image as ImageIcon,Move,Plus,Search,Send,Tag,Upload,X } from 'lucide-react';
import { ChatHost } from '../../chat/components/ChatHost';
import { getDrawerFolderPathName } from '../../folderModel';
import type { DrawerFolderTreeEntry } from '../../folderModel';

export type DrawerInteractionOverlaysScope = Record<string, any> & {
  webImageCollectorTags: string[];
  orderedFolderEntries: DrawerFolderTreeEntry[];
  folderMoveTargetEntries: DrawerFolderTreeEntry[];
};

export function DrawerInteractionOverlays({ scope }: { scope: DrawerInteractionOverlaysScope }) {
  const { activeChatImageAspectRatio, activeChatImageModel, activeChatImageModelChoice, activeChatImageResolution, addChatMediaToCanvas, addWebImageCollectorTag, agentModels, agentModelsLoading, buildCanvasAgentSelectedItems, canvasAgent, canvasAgentSelectedItems, canvasAgentSidebarWidth, chatImageAspectRatioOptions, chatImageModelOptions, chatImageResolutionOptions, chooseReferenceImageForCollector, clearWebImageCollectorTags, closeFolderModal, closeWebImageCollector, collectWebImagesToDrawer, commitQuickText, completeChatBatchCanvasGroup, createChatBatchCanvasGroup, createFolderAndMoveSelected, drawerAgentSelectedItems, executeChatTool, fillChatBatchCanvasSlot, folderMoveSelectionIds, folderMoveTargetEntries, folderMoveTargetId, folders, generateQueryAndCollectFromReference, handleAddFolder, handleCloseTextInput, handleDrawerPanelKeyDown, handleDrawerPanelMouseDown, handleDrawerPanelPointerDown, handleOpenTextInput, hasRemoteImageSearch, installOllamaSilently, isCanvasChromeHidden, isCanvasMode, isCollectingWebImages, isDrawerAgentOpen, isGeneratingWebImageQuery, isInstallingOllama, isInvalidFolderMoveTarget, isMovingFolders, isShortcutReveal, isUtilityActiveTab, lastSelectedDrawerItemIdRef, localVisionModelLastError, localVisionModelReadyRef, moveDrawerFoldersToParent, moveFolderName, moveFolderParent, moveSelectedItemsToFolder, newFolderName, newFolderParent, orderedFolderEntries, quickText, refreshAgentModels, removeWebImageCollectorTag, retryLocalVisionModelDownload, selectedIds, setCanvasAgentSidebarWidth, setChatImageAspectRatio, setChatImageModel, setChatImageResolution, setFolderMoveTargetId, setIsDrawerAgentOpen, setMoveFolderName, setNewFolderName, setQuickText, setSelectedIds, setShowFolderModal, setShowMoveExistingFolderModal, setShowMoveFolderModal, setShowSettings, setWebImageCollectorQuery, setWebImageCollectorReference, setWebImageCollectorStatus, setWebImageCollectorTagDraft, showFolderModal, showMoveExistingFolderModal, showMoveFolderModal, showTextInput, showToast, showWebImageCollector, updateCanvasSelection, updateWebImageCollectorTag, webImageCollectorPanelRef, webImageCollectorQuery, webImageCollectorReference, webImageCollectorStatus, webImageCollectorTagDraft, webImageCollectorTags } = scope;
  return (
<>
<ChatHost
                  visible={!isCanvasMode && !showTextInput && !showWebImageCollector && isDrawerAgentOpen}
                  model={canvasAgent.settings.apiModel}
                  serverManagedChannelFailover={canvasAgent.settings.apiProvider === 'unmind-wallet'}
                  cloudWalletMode={canvasAgent.settings.apiProvider === 'unmind-wallet' || canvasAgent.settings.apiCredentialSource === 'cloud_wallet'}
                  runtimeImageModel={activeChatImageModelChoice?.value}
                  approvalMode={canvasAgent.settings.approvalMode}
                  executeTool={executeChatTool}
                  onNotice={showToast}
                  onGeneratedMediaReady={media => addChatMediaToCanvas(media, { autoFocus: true })}
                  onBatchStarted={createChatBatchCanvasGroup}
                  onBatchMediaReady={fillChatBatchCanvasSlot}
                  onBatchCompleted={completeChatBatchCanvasGroup}
                  variant={isCanvasMode ? 'canvas' : 'drawer'}
                  width={isCanvasMode ? canvasAgentSidebarWidth : undefined}
                  topOffset={isCanvasMode && !isCanvasChromeHidden ? 64 : 0}
                  onWidthChange={isCanvasMode ? setCanvasAgentSidebarWidth : undefined}
                  onClose={() => {
                    setIsDrawerAgentOpen(false);
                  }}
                  selectedItems={isCanvasMode ? canvasAgentSelectedItems : drawerAgentSelectedItems}
                  workflowAttachmentOptions={(scope.canvasWorkflowTemplates || []).map((workflow: any) => ({
                    id: workflow.id,
                    label: workflow.label,
                    source: 'template' as const,
                    snapshot: { schema: 'inspiration-workflow-snapshot' as const, version: 1 as const, source: 'template' as const, label: workflow.label, nodes: workflow.nodes || [], edges: [], metadata: { templateId: workflow.id, hint: workflow.hint } },
                  }))}
                  resolveSelectedItems={isCanvasMode ? () => buildCanvasAgentSelectedItems() : undefined}
                  onClearSelectedItems={() => {
                    if (isCanvasMode) {
                      updateCanvasSelection([]);
                      return;
                    }
                    setSelectedIds([]);
                    lastSelectedDrawerItemIdRef.current = null;
                  }}
                  modelOptions={agentModels}
                  modelOptionsLoading={agentModelsLoading}
                  onRefreshModelOptions={refreshAgentModels}
                  imageModel={activeChatImageModel}
                  imageModelOptions={chatImageModelOptions}
                  onImageModelChange={setChatImageModel}
                  imageAspectRatio={activeChatImageAspectRatio}
                  imageAspectRatioOptions={chatImageAspectRatioOptions}
                  onImageAspectRatioChange={setChatImageAspectRatio}
                  imageResolution={activeChatImageResolution}
                  imageResolutionOptions={chatImageResolutionOptions}
                  onImageResolutionChange={setChatImageResolution}
                  onAddGeneratedToCanvas={media => void addChatMediaToCanvas(media)}
                />

                <AnimatePresence>
                  {!isCanvasMode && !showTextInput && !showWebImageCollector && !isDrawerAgentOpen && (
                    <motion.button
                      initial={isShortcutReveal ? false : { opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={isShortcutReveal ? { duration: 0 } : { duration: 0.2, ease: 'easeOut' }}
                      onClick={() => {
                        setIsDrawerAgentOpen(true);
                        setShowSettings(false);
                        setShowFolderModal(false);
                      }}
                      data-drawer-fab="secondary"
                      className="absolute bottom-[84px] right-6 z-[120] flex h-12 w-12 items-center justify-center rounded-full border border-stone-200 bg-stone-900 text-white shadow-[0_6px_16px_rgba(24,24,27,0.14)] transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-stone-800 active:translate-y-0 dark:border-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
                      title="AI Chat"
                    >
                      <Bot className="h-5 w-5" />
                    </motion.button>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {!isUtilityActiveTab && !showTextInput && (
                    <motion.button
                      initial={isShortcutReveal ? false : { opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={isShortcutReveal ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
                      onClick={handleOpenTextInput}
                      data-drawer-fab="primary"
                      className="absolute bottom-6 right-6 z-[120] flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-[0_6px_16px_rgba(37,99,235,0.22)] transition-[background-color,transform] hover:-translate-y-0.5 hover:bg-blue-700 active:translate-y-0 will-change-transform"
                      title="写下灵感"
                    ><Edit3 className="w-5 h-5" /></motion.button>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {showTextInput && (
                    <motion.div data-drawer-dialog="true" initial={isShortcutReveal ? false : { opacity: 0, y: 40, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 40, scale: 0.95 }} transition={isShortcutReveal ? { duration: 0 } : { type: 'tween', duration: 0.2, ease: "easeOut" }} className="absolute bottom-6 left-6 right-6 z-50 bg-white/90 dark:bg-stone-800/90 backdrop-blur-2xl rounded-[26px] shadow-[0_24px_60px_rgba(0,0,0,0.16)] border border-stone-200/60 dark:border-stone-700/60 p-4 flex flex-col gap-3 will-change-transform" onPointerDown={handleDrawerPanelPointerDown} onMouseDown={handleDrawerPanelMouseDown} onKeyDown={handleDrawerPanelKeyDown}>
                      <div data-drawer-dialog-header="true" className="flex justify-between items-center px-1">
                        <span data-drawer-dialog-title="true" className="text-xs font-bold text-stone-700 dark:text-stone-200 flex items-center gap-1.5"><Edit3 className="w-4 h-4 text-blue-500" /> 记录灵感</span>
                        <button data-drawer-dialog-close="true" onClick={handleCloseTextInput} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"><X className="w-4 h-4" /></button>
                      </div>
                      <textarea
                        data-drawer-dialog-field="true"
                        autoFocus value={quickText} onChange={e => setQuickText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            commitQuickText();
                          }
                          if (e.key === 'Escape') handleCloseTextInput();
                        }}
                        placeholder={`随便写点什么...\n(Enter 提交，Shift+Enter 换行)`}
                        className="w-full bg-stone-50/50 dark:bg-stone-900/50 rounded-[20px] p-3 border border-stone-200/50 dark:border-stone-700/50 outline-none resize-none text-sm text-stone-800 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 h-24 focus:ring-2 focus:ring-blue-500/20 transition-all [&::-webkit-scrollbar]:hidden"
                      />
                      <div className="flex justify-between items-center px-1">
                        <span className="text-[10px] text-stone-400 font-mono font-medium">{quickText.length} 字</span>
                        <button
                          data-drawer-dialog-primary="true"
                          onClick={() => {
                            commitQuickText();
                          }}
                          disabled={!quickText.trim()}
                          className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:bg-stone-200 dark:disabled:bg-stone-700 disabled:text-stone-400 text-white text-xs font-medium rounded-[16px] transition-colors shadow-sm disabled:shadow-none"
                        ><Send className="w-3.5 h-3.5" /> 保存</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {showWebImageCollector && (
                    <motion.div
                      data-drawer-dialog="true"
                      ref={webImageCollectorPanelRef}
                      initial={{ opacity: 0, y: 40, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 40, scale: 0.95 }}
                      transition={{ type: 'tween', duration: 0.2, ease: "easeOut" }}
                      className="absolute bottom-6 left-6 right-6 z-50 bg-white/90 dark:bg-stone-800/90 backdrop-blur-2xl rounded-[26px] shadow-[0_24px_60px_rgba(0,0,0,0.16)] border border-stone-200/60 dark:border-stone-700/60 p-4 flex flex-col gap-3 will-change-transform"
                      onPointerDown={handleDrawerPanelPointerDown}
                      onMouseDown={handleDrawerPanelMouseDown}
                      onKeyDown={handleDrawerPanelKeyDown}
                    >
                      <div data-drawer-dialog-header="true" className="flex justify-between items-center px-1">
                        <span data-drawer-dialog-title="true" className="text-xs font-bold text-stone-700 dark:text-stone-200 flex items-center gap-1.5"><ImageIcon className="w-4 h-4 text-sky-500" /> 网络收图</span>
                        <button
                          data-drawer-dialog-close="true"
                          onClick={closeWebImageCollector}
                          disabled={isCollectingWebImages || isGeneratingWebImageQuery}
                          className="text-stone-400 hover:text-stone-600 disabled:cursor-wait disabled:opacity-45 dark:hover:text-stone-300 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      {webImageCollectorReference && (
                        <div className="flex items-center gap-3 rounded-[20px] border border-sky-100/80 bg-sky-50/55 p-2.5 dark:border-sky-400/20 dark:bg-sky-400/10">
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-[14px] bg-white/80 dark:bg-stone-900/55">
                            {(webImageCollectorReference.preview || webImageCollectorReference.source) ? (
                              <img
                                src={webImageCollectorReference.preview || webImageCollectorReference.source}
                                alt={webImageCollectorReference.name}
                                className="h-full w-full object-cover"
                                draggable={false}
                              />
                            ) : (
                              <ImageIcon className="m-3 h-6 w-6 text-sky-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-bold text-stone-700 dark:text-stone-100">{webImageCollectorReference.name}</div>
                            <div className="mt-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-200">参考图</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setWebImageCollectorReference(null);
                              setWebImageCollectorQuery('');
                              clearWebImageCollectorTags();
                              setWebImageCollectorStatus('');
                            }}
                            disabled={isCollectingWebImages || isGeneratingWebImageQuery}
                            className="rounded-[12px] p-1.5 text-stone-400 transition-colors hover:bg-white/70 hover:text-stone-600 disabled:cursor-wait disabled:opacity-45 dark:hover:bg-stone-700/70 dark:hover:text-stone-200"
                            title="移除参考图"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                      <input
                        data-drawer-dialog-field="true"
                        autoFocus
                        value={webImageCollectorQuery}
                        onChange={e => setWebImageCollectorQuery(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void collectWebImagesToDrawer();
                          }
                          if (e.key === 'Escape') closeWebImageCollector();
                        }}
                        disabled={isCollectingWebImages || isGeneratingWebImageQuery}
                        placeholder={webImageCollectorReference ? "识别后可修改主体、风格、材质等标签" : "输入图片需求，比如：新中式的家装效果图"}
                        className="w-full bg-stone-50/50 dark:bg-stone-900/50 rounded-[20px] p-3 border border-stone-200/50 dark:border-stone-700/50 outline-none text-sm text-stone-800 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:ring-2 focus:ring-sky-500/20 transition-all disabled:cursor-wait disabled:opacity-70"
                      />
                      {webImageCollectorReference && (
                        <div className="rounded-[18px] border border-stone-200/60 bg-stone-50/60 px-3 py-2.5 dark:border-stone-700/60 dark:bg-stone-900/35">
                          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black text-stone-500 dark:text-stone-400">
                            <Tag className="h-3.5 w-3.5 text-sky-500" />
                            识别标签，可编辑
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {webImageCollectorTags.map((tag, index) => (
                              <span
                                key={`web_image_tag_${index}`}
                                className="flex max-w-full items-center gap-1 rounded-[13px] border border-sky-100 bg-white/85 px-2 py-1 text-[11px] font-bold text-sky-700 shadow-sm dark:border-sky-400/20 dark:bg-stone-800/80 dark:text-sky-100"
                              >
                                <input
                                  value={tag}
                                  onChange={event => updateWebImageCollectorTag(index, event.target.value)}
                                  onKeyDown={event => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault();
                                      (event.currentTarget as HTMLInputElement).blur();
                                    }
                                    if (event.key === 'Backspace' && !event.currentTarget.value) {
                                      event.preventDefault();
                                      removeWebImageCollectorTag(index);
                                    }
                                  }}
                                  disabled={isCollectingWebImages || isGeneratingWebImageQuery}
                                  style={{ width: `${Math.max(4, Math.min(12, tag.length + 1))}em` }}
                                  className="min-w-0 bg-transparent outline-none disabled:cursor-wait"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeWebImageCollectorTag(index)}
                                  disabled={isCollectingWebImages || isGeneratingWebImageQuery}
                                  className="rounded-full p-0.5 text-sky-300 transition-colors hover:bg-sky-50 hover:text-sky-600 disabled:cursor-wait disabled:opacity-45 dark:hover:bg-sky-400/10 dark:hover:text-sky-100"
                                  title="删除标签"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                            <div className="flex items-center gap-1 rounded-[13px] border border-dashed border-stone-300/80 bg-white/55 px-2 py-1 dark:border-stone-600 dark:bg-stone-800/45">
                              <input
                                value={webImageCollectorTagDraft}
                                onChange={event => setWebImageCollectorTagDraft(event.target.value)}
                                onKeyDown={event => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    addWebImageCollectorTag();
                                  }
                                }}
                                disabled={isCollectingWebImages || isGeneratingWebImageQuery}
                                placeholder="添加标签"
                                className="w-16 bg-transparent text-[11px] font-bold text-stone-600 outline-none placeholder:text-stone-400 disabled:cursor-wait dark:text-stone-200 dark:placeholder:text-stone-500"
                              />
                              <button
                                type="button"
                                onClick={() => addWebImageCollectorTag()}
                                disabled={!webImageCollectorTagDraft.trim() || isCollectingWebImages || isGeneratingWebImageQuery}
                                className="rounded-full p-0.5 text-stone-400 transition-colors hover:bg-sky-50 hover:text-sky-600 disabled:cursor-not-allowed disabled:opacity-35 dark:hover:bg-sky-400/10 dark:hover:text-sky-100"
                                title="添加标签"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2 px-1">
                        <button
                          type="button"
                          onClick={() => void chooseReferenceImageForCollector()}
                          disabled={isCollectingWebImages || isGeneratingWebImageQuery}
                          className="flex items-center gap-1.5 rounded-[15px] border border-stone-200/70 bg-white/65 px-3 py-1.5 text-[11px] font-bold text-stone-500 shadow-sm transition-colors hover:bg-stone-100 hover:text-sky-600 disabled:cursor-wait disabled:opacity-55 dark:border-stone-700/70 dark:bg-stone-900/40 dark:text-stone-300 dark:hover:bg-stone-700"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          选择参考图
                        </button>
                        <button
                          type="button"
                          onClick={() => void generateQueryAndCollectFromReference()}
                          disabled={!webImageCollectorReference || isCollectingWebImages || isGeneratingWebImageQuery}
                          className="flex items-center gap-1.5 rounded-[15px] border border-sky-100 bg-sky-50 px-3 py-1.5 text-[11px] font-bold text-sky-600 shadow-sm transition-colors hover:bg-sky-100 disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-400 disabled:cursor-wait dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200 dark:hover:bg-sky-400/18 dark:disabled:border-stone-700 dark:disabled:bg-stone-800 dark:disabled:text-stone-500"
                        >
                          {isGeneratingWebImageQuery ? (
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          ) : (
                            <Search className="h-3.5 w-3.5" />
                          )}
                          {isGeneratingWebImageQuery ? '识别中' : '识别标签'}
                        </button>
                      </div>
                      {webImageCollectorStatus && (
                        <div className="rounded-[16px] border border-sky-100/75 bg-sky-50/45 px-3 py-2 text-[11px] font-bold text-sky-700 dark:border-sky-400/18 dark:bg-sky-400/10 dark:text-sky-100">
                          {webImageCollectorStatus}
                        </div>
                      )}
                      {webImageCollectorReference && !hasRemoteImageSearch() && localVisionModelLastError && !localVisionModelReadyRef.current && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[16px] border border-amber-200/75 bg-amber-50/70 px-3 py-2 text-[11px] font-bold text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
                          <span className="min-w-[160px] flex-1">云端视觉模型未配置，本地增量包也不可用。可先安装 Ollama 后下载增量包。</span>
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void installOllamaSilently()}
                              disabled={isInstallingOllama}
                              className="rounded-full bg-white/75 px-2.5 py-1 text-[10px] text-amber-700 shadow-sm transition-colors hover:bg-white dark:bg-stone-900/45 dark:text-amber-100 dark:hover:bg-stone-800"
                            >
                              {isInstallingOllama ? '安装中' : '静默安装 Ollama'}
                            </button>
                            <button
                              type="button"
                              onClick={() => void retryLocalVisionModelDownload()}
                              className="rounded-full bg-amber-500 px-2.5 py-1 text-[10px] text-white shadow-sm transition-colors hover:bg-amber-600"
                            >
                              下载增量包
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center justify-between px-1 gap-3">
                        <span className="min-w-0 truncate text-[10px] text-stone-400 font-medium">
                          {webImageCollectorReference
                            ? hasRemoteImageSearch()
                              ? '优先使用已配置的云端视觉模型识别主体和风格；也可在设置里下载本地增量包。'
                              : '未配置云端视觉模型时，需要下载本地大模型增量包才能按参考图识别。'
                            : '自动收集 10 张网络图片，并新建同名文件夹保存。'}
                        </span>
                        <button
                          data-drawer-dialog-primary="true"
                          onClick={() => void collectWebImagesToDrawer()}
                          disabled={!webImageCollectorQuery.trim() || isCollectingWebImages || isGeneratingWebImageQuery}
                          className="shrink-0 flex items-center gap-1.5 px-4 py-1.5 bg-sky-500 hover:bg-sky-600 disabled:bg-stone-200 dark:disabled:bg-stone-700 disabled:text-stone-400 text-white text-xs font-medium rounded-[16px] transition-colors shadow-sm disabled:shadow-none disabled:cursor-wait"
                        >
                          {isCollectingWebImages ? (
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          ) : (
                            <ImageIcon className="w-3.5 h-3.5" />
                          )}
                          {isCollectingWebImages ? '收集中' : '开始收集'}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {showMoveFolderModal && (
                    <motion.div data-drawer-dialog="true" initial={{ opacity: 0, y: 40, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 40, scale: 0.95 }} transition={{ type: 'tween', duration: 0.2, ease: "easeOut" }} className="absolute bottom-6 left-6 right-6 z-50 bg-white/90 dark:bg-stone-800/90 backdrop-blur-2xl rounded-[26px] shadow-[0_24px_60px_rgba(0,0,0,0.16)] border border-stone-200/60 dark:border-stone-700/60 p-4 flex flex-col gap-3 will-change-transform" onPointerDown={handleDrawerPanelPointerDown} onMouseDown={handleDrawerPanelMouseDown} onKeyDown={handleDrawerPanelKeyDown}>
                      <div data-drawer-dialog-header="true" className="flex justify-between items-center px-1">
                        <span data-drawer-dialog-title="true" className="text-xs font-bold text-stone-700 dark:text-stone-200 flex items-center gap-1.5"><Move className="w-4 h-4 text-emerald-500" /> 移动 {selectedIds.length} 个卡片</span>
                        <button data-drawer-dialog-close="true" onClick={() => setShowMoveFolderModal(false)} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"><X className="w-4 h-4" /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                        <button
                          onClick={() => moveSelectedItemsToFolder(undefined)}
                          className="rounded-[16px] border border-stone-200/70 dark:border-stone-700/70 bg-stone-50/80 dark:bg-stone-900/40 px-3 py-2 text-left text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
                        >主抽屉</button>
                        {orderedFolderEntries.map(({ folder, depth }) => (
                          <button
                            key={folder.id}
                            onClick={() => moveSelectedItemsToFolder(folder.id, getDrawerFolderPathName(folders, folder.id))}
                            className={`rounded-[16px] border px-3 py-2 text-left text-xs font-medium transition-colors truncate ${depth > 0 ? 'border-sky-100/80 bg-sky-50/70 text-sky-700 hover:bg-sky-100 dark:border-sky-800/45 dark:bg-sky-900/20 dark:text-sky-300 dark:hover:bg-sky-900/35' : 'border-emerald-100/80 bg-emerald-50/70 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800/45 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/35'}`}
                            style={{ marginLeft: Math.min(depth, 5) * 8 }}
                            title={getDrawerFolderPathName(folders, folder.id)}
                          >{depth > 0 ? `↳ ${folder.name}` : folder.name}</button>
                        ))}
                      </div>
                      <div className="rounded-[18px] bg-stone-50/70 dark:bg-stone-900/35 border border-stone-200/60 dark:border-stone-700/60 p-2.5">
                        <div className="mb-2 text-[11px] font-bold text-stone-500 dark:text-stone-400">{moveFolderParent ? `在「${moveFolderParent.name}」中新建子目录并移动` : '新建项目文件夹并移动'}</div>
                        <div className="flex gap-2">
                          <input
                            data-drawer-dialog-field="true"
                            value={moveFolderName}
                            onChange={e => setMoveFolderName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.preventDefault(); createFolderAndMoveSelected(); }
                              if (e.key === 'Escape') setShowMoveFolderModal(false);
                            }}
                            placeholder={moveFolderParent ? '子目录名称' : '项目文件夹名称'}
                            className="min-w-0 flex-1 bg-white/75 dark:bg-stone-800/75 rounded-[14px] px-3 py-2 border border-white/80 dark:border-stone-700/70 outline-none text-xs text-stone-700 dark:text-stone-200 placeholder:text-stone-400 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                          />
                          <button
                            data-drawer-dialog-primary="true"
                            onClick={createFolderAndMoveSelected}
                            disabled={!moveFolderName.trim()}
                            className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-stone-200 dark:disabled:bg-stone-700 disabled:text-stone-400 text-white text-xs font-medium rounded-[14px] transition-colors shadow-sm disabled:shadow-none"
                          ><FolderPlus className="w-3.5 h-3.5" /> {moveFolderParent ? '新建子目录' : '新建并移动'}</button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {showMoveExistingFolderModal && (
                    <motion.div data-drawer-dialog="true" initial={{ opacity: 0, y: 40, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 40, scale: 0.95 }} transition={{ type: 'tween', duration: 0.2, ease: "easeOut" }} className="absolute bottom-6 left-6 right-6 z-50 bg-white/92 dark:bg-stone-800/92 backdrop-blur-2xl rounded-[26px] shadow-[0_24px_60px_rgba(0,0,0,0.16)] border border-stone-200/60 dark:border-stone-700/60 p-4 flex flex-col gap-3 will-change-transform" onPointerDown={handleDrawerPanelPointerDown} onMouseDown={handleDrawerPanelMouseDown} onKeyDown={handleDrawerPanelKeyDown}>
                      <div data-drawer-dialog-header="true" className="flex items-center justify-between gap-3 px-1">
                        <span data-drawer-dialog-title="true" className="min-w-0 truncate text-xs font-bold text-stone-700 dark:text-stone-200 flex items-center gap-1.5">
                          <Move className="w-4 h-4 text-emerald-500" />
                          移动 {folderMoveSelectionIds.length} 个文件夹到…
                        </span>
                        <button data-drawer-dialog-close="true" onClick={() => setShowMoveExistingFolderModal(false)} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"><X className="w-4 h-4" /></button>
                      </div>
                      <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto pr-1">
                        <button
                          type="button"
                          onClick={() => setFolderMoveTargetId(null)}
                          className={`rounded-[16px] border px-3 py-2 text-left text-xs font-bold transition-colors ${folderMoveTargetId === null ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-300/30 dark:bg-blue-400/16 dark:text-blue-100' : 'border-stone-200/70 bg-stone-50/80 text-stone-600 hover:bg-stone-100 dark:border-stone-700/70 dark:bg-stone-900/40 dark:text-stone-300 dark:hover:bg-stone-700'}`}
                        >
                          主抽屉 / 根目录
                        </button>
                        {folderMoveTargetEntries.map(({ folder, depth }) => {
                          const disabled = isInvalidFolderMoveTarget(folder.id, folderMoveSelectionIds);
                          return (
                            <button
                              key={folder.id}
                              type="button"
                              disabled={disabled}
                              onClick={() => setFolderMoveTargetId(folder.id)}
                              className={`rounded-[16px] border px-3 py-2 text-left text-xs font-medium transition-colors truncate disabled:cursor-not-allowed disabled:opacity-45 ${folderMoveTargetId === folder.id ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-300/30 dark:bg-blue-400/16 dark:text-blue-100' : 'border-emerald-100/80 bg-emerald-50/70 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800/45 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/35'}`}
                              style={{ marginLeft: Math.min(depth, 5) * 10 }}
                              title={disabled ? '不能移动到自身或子文件夹中' : getDrawerFolderPathName(folders, folder.id)}
                            >
                              {depth > 0 ? `↳ ${folder.name}` : folder.name}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex justify-end gap-2 px-1">
                        <button
                          data-drawer-dialog-secondary="true"
                          type="button"
                          onClick={() => setShowMoveExistingFolderModal(false)}
                          className="rounded-[14px] bg-stone-100 px-3 py-2 text-xs font-bold text-stone-500 transition-colors hover:bg-stone-200 dark:bg-stone-900/60 dark:text-stone-300 dark:hover:bg-stone-700"
                        >
                          取消
                        </button>
                        <button
                          data-drawer-dialog-primary="true"
                          type="button"
                          onClick={() => void moveDrawerFoldersToParent(folderMoveSelectionIds, folderMoveTargetId)}
                          disabled={isMovingFolders || folderMoveSelectionIds.length === 0 || isInvalidFolderMoveTarget(folderMoveTargetId, folderMoveSelectionIds)}
                          className="flex items-center gap-1.5 rounded-[14px] bg-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400 dark:disabled:bg-stone-700"
                        >
                          <Check className="w-3.5 h-3.5" />
                          {isMovingFolders ? '移动中' : '确认移动'}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {showFolderModal && (
                    <motion.div data-drawer-dialog="true" initial={{ opacity: 0, y: 40, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 40, scale: 0.95 }} transition={{ type: 'tween', duration: 0.2, ease: "easeOut" }} className="absolute bottom-6 left-6 right-6 z-50 bg-white/90 dark:bg-stone-800/90 backdrop-blur-2xl rounded-[26px] shadow-[0_24px_60px_rgba(0,0,0,0.16)] border border-stone-200/60 dark:border-stone-700/60 p-4 flex flex-col gap-3 will-change-transform" onPointerDown={handleDrawerPanelPointerDown} onMouseDown={handleDrawerPanelMouseDown} onKeyDown={handleDrawerPanelKeyDown}>
                      <div data-drawer-dialog-header="true" className="flex justify-between items-center px-1">
                        <span data-drawer-dialog-title="true" className="text-xs font-bold text-stone-700 dark:text-stone-200 flex items-center gap-1.5"><FolderPlus className="w-4 h-4 text-emerald-500" /> {newFolderParent ? `在「${newFolderParent.name}」中新建子目录` : '新建项目文件夹'}</span>
                        <button data-drawer-dialog-close="true" onClick={closeFolderModal} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"><X className="w-4 h-4" /></button>
                      </div>
                      <input
                        data-drawer-dialog-field="true"
                        autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); handleAddFolder(); }
                          if (e.key === 'Escape') closeFolderModal();
                        }}
                        placeholder={newFolderParent ? '输入子目录名称（如：造型收集、渲染收集）' : '输入项目文件夹名称（如：设计军火库）'}
                        className="w-full bg-stone-50/50 dark:bg-stone-900/50 rounded-[20px] p-3 border border-stone-200/50 dark:border-stone-700/50 outline-none text-sm text-stone-800 dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:ring-2 focus:ring-emerald-500/20 transition-all"
                      />
                      <div className="flex justify-end px-1 mt-1">
                        <button
                          data-drawer-dialog-primary="true"
                          onClick={handleAddFolder}
                          disabled={!newFolderName.trim()}
                          className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-stone-200 dark:disabled:bg-stone-700 disabled:text-stone-400 text-white text-xs font-medium rounded-[16px] transition-colors shadow-sm disabled:shadow-none"
                        ><Check className="w-3.5 h-3.5" /> {newFolderParent ? '创建子目录' : '创建项目'}</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
</>
  );
}
