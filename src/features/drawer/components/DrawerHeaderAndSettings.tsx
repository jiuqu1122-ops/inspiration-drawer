import { AnimatePresence,motion } from 'framer-motion';
import { ArrowUp,CalendarDays,Check,CheckSquare,ChevronDown,ChevronRight,Download,FolderOpen,History,Image as ImageIcon,Info,Keyboard,LayoutGrid,Lightbulb,Link,LogOut,Minus,Monitor,Move,Palette,Pin,Power,RefreshCw,RotateCcw,Search,Settings,Smartphone,Sparkles,Square,StickyNote,Sun,Trash2,Wallet,X } from 'lucide-react';
import { DrawerAiClassificationBar } from '../../../components/DrawerAiClassificationBar';
import { DrawerOrganizationPanel } from '../../../components/DrawerOrganizationPanel';
import { platformShortcutLabel } from '../../../platform/capabilities';
import { usePlatformCapabilities } from '../../../platform/usePlatformCapabilities';
import { CANVAS_AI_PROVIDER_SELECT_OPTIONS,getCanvasAiApiKeyPlaceholder,getCanvasAiEndpointPlaceholder,getStoredCanvasAiApiKey,getStoredCanvasAiApiProvider,getStoredCanvasAiEndpoint,getStoredCanvasAiHeadersText,isCanvasAiEndpointVisible,isCanvasAiRemoteModelProvider,normalizeCanvasAiProvider } from '../../../utils/canvasAiConfig';
import { BrowserExtensionSetup } from '../../browserExtension/BrowserExtensionSetup';
import { formatCreditAmount } from '../../cloudCreditUsage';
import { clamp } from '../../common';
import { EagleImportSettings } from '../../eagle/EagleImportSettings';
import { getDrawerFolderPathName } from '../../folderModel';
import { CanvasSearchResults } from '../CanvasSearchResults';
import { CANVAS_SEARCH_CANDIDATE_LIMIT } from '../useDrawerSearch';
import type { BufferItem } from '../../../types';
import type { DrawerTabType } from '../../../types/drawer';

export type DrawerHeaderAndSettingsScope = Record<string, any> & {
  displayItems: BufferItem[];
  items: BufferItem[];
  TABS: Array<{ id: DrawerTabType; label: string; icon: React.ComponentType<{ className?: string }> }>;
  setCanvasSearchCandidateLimit: React.Dispatch<React.SetStateAction<number>>;
  setActiveSettingCategory: React.Dispatch<React.SetStateAction<string>>;
  agentModels: string[];
};

export function DrawerHeaderAndSettings({ scope }: { scope: DrawerHeaderAndSettingsScope }) {
  const { activateSearch, activeDrawerAiClassificationLabel, activeFolderId, activeSettingCategory, activeTab, addCanvasSearchMediaCandidate, agentCustomApiKey, agentCustomBaseUrl, agentCustomProvider, agentCustomSaving, agentModels, agentModelsLoading, appVersion, assignDrawerImageToCanvasWorkflowSlot, autoAiAnalysisProgress, calendarNotificationsEnabled, cancelByokCustomization, canvasAgent, canvasAiApiKey, canvasAiCanRefreshModels, canvasAiCredentialSource, canvasAiEndpoint, canvasAiHasApiCredential, canvasAiHeadersText, canvasAiNewApiVideoKey, canvasAiOpenAiModelError, canvasAiProvider, canvasAiRemoteModelCount, canvasAiRemoteModelEmptyHint, canvasAiUsesCloudImageModels, canvasAiXaisBalance, canvasAiXaisBalanceText, canvasDrawerSourceItemIds, canvasSearchCandidateLimit, canvasSearchMediaResults, canvasShortcut, canvasWorkflowSlotPickTarget, checkCanvasAiXaisBalance, checkLocalVisionModelStatus, cloudAccount, cloudAccountSyncError, confirmCloudAccountLogout, connectSelectedCanvasItemsToGenerator, creditRedemptionCode, creditRedemptionError, displayItems, DRAWER_TOOL_BUTTON_BASE_CLASS, drawerAiAnalysisSummary, drawerAiClassificationDimension, drawerAiClassificationGroups, drawerClassificationView, drawerScopedItems, eagleImportMode, eagleImportStatus, effectiveCanvasAiApiProvider, effectiveCanvasAiEndpoint, effectiveCanvasAiProvider, enterCanvasMode, folders, handleAppUpdatePromptClick, handleExportSelectedItems, handleRecordShortcut, handleTogglePin, hasLocalXaisAccount, importFromEagle, importFromEagleLibrary, installOllamaSilently, isAutoStart, isAutoStartChanging, isByokUnlocked, isCanvasAiLicenseManaged, isCanvasChromeHidden, isCanvasMode, isCanvasWorkbenchActive, isCanvasWorkbenchMode, isCheckingAppUpdate, isCloudAccountLoading, isCloudAccountLoggingOut, isDark, isDrawerAiClassificationMode, isDrawerWorkbenchActive, isDrawerWorkbenchMode, isFolderSidebarLayout, isInstallingOllama, isLicenseLoading, isLocalVisionModelChecking, isMainWorkbenchActive, isMobileConnected, isPinned, isRecording, isRecordingCanvas, isRecordingNote, isRecordingSearch, isRecordingSnip, isRecordingText, isRecordingTrigger, isRedeemingCredits, isRefreshingCanvasAiOpenAiModels, isSearchActive, isSelectMode, isTestingCanvasAiConnection, items, lastSelectedDrawerItemIdRef, LICENSE_EDITION_LABELS, LICENSE_STATE_LABELS, licenseAiAccess, licenseStatus, localVisionModelDownload, localVisionModelLastError, managedCanvasAiProviderLabel, normalizedDeferredSearchQuery, noteShortcut, openCloudCreditUsage, openOllamaDownloadPage, redeemCloudCredits, refreshCanvasAiOpenAiModels, refreshCloudAccount, refreshVisibleBalances, requestDeleteDrawerItems, requestExitCanvasMode, retryLocalVisionModelDownload, runCanvasWorkbenchWindowAction, runDrawerWorkbenchWindowAction, saveAgentCustomApi, screenshotAutoPinNote, searchInputRef, searchQuery, searchShortcut, selectedCanvasAiGenerator, selectedCanvasConnectableCount, selectedIds, setActiveDrawerAiClassificationLabel, setActiveSettingCategory, setActiveTab, setAgentCustomApiKey, setAgentCustomBaseUrl, setAgentCustomProvider, setCanvasAiApiKey, setCanvasAiApiProvider, setCanvasAiCredentialSource, setCanvasAiEndpoint, setCanvasAiHeadersText, setCanvasAiNewApiVideoKey, setCanvasAiProvider, setCanvasSearchCandidateLimit, setCanvasShortcut, setCanvasWorkflowSlotPickTarget, setCreditRedemptionCode, setCreditRedemptionError, setDrawerAiClassificationDimension, setDrawerClassificationView, setEagleImportMode, setIsDark, setIsRecording, setIsRecordingCanvas, setIsRecordingNote, setIsRecordingSearch, setIsRecordingSnip, setIsRecordingText, setIsRecordingTrigger, setIsSearchActive, setIsSelectMode, setNoteShortcut, setSearchQuery, setSearchShortcut, setSelectedIds, setShortcut, setShowAboutSoftware, setShowMoveFolderModal, setShowQR, setShowSettings, setShowStoragePath, setSnipShortcut, setTextShortcut, setTriggerShortcut, shortcut, shouldShowLegacyAiSettings, showAppUpdatePromptArrow, showSettings, showToast, snipShortcut, startDrawerTitleDrag, switchAgentFundingSource, TABS, testCanvasAiConnection, textShortcut, toggleAutoStartSetting, toggleCalendarNotificationsSetting, toggleCanvasWorkbenchMode, toggleDrawerSidebarLayout, toggleDrawerWorkbenchMode, toggleScreenshotAutoPinNoteSetting, toggleSettings, toggleTriggerMode, triggerMode, triggerShortcut, webImageCacheDir } = scope;
  const platformCapabilities = usePlatformCapabilities();
  const isMacDesktopWindow = platformCapabilities?.platform === 'macos';
  return (
<>
{/* 🌟 标题栏区域：安全的动态拖拽魔法 */}
                <div
                  data-drawer-header="true"
                  data-canvas-header={isCanvasMode ? 'true' : undefined}
                  className={isCanvasMode && isCanvasChromeHidden ? 'hidden' : 'min-h-16 px-5 border-b border-stone-200/70 dark:border-stone-800 flex flex-nowrap justify-between items-center gap-4 bg-white dark:bg-stone-950 relative cursor-move z-20'}
                  onPointerDown={startDrawerTitleDrag}
                >
                  <h2 data-drawer-title="true" className="flex h-9 min-w-[140px] max-w-full items-center gap-2 text-[18px] font-semibold tracking-[-0.02em] leading-none text-stone-900 pointer-events-none relative dark:text-stone-100">
                        {isCanvasMode
                      ? <LayoutGrid className="w-4 h-4 text-stone-500 dark:text-stone-400" />
                      : activeFolderId === 'all'
                        ? <Lightbulb className="w-4 h-4 text-blue-500 dark:text-blue-300" />
                        : <FolderOpen className="w-4 h-4 text-emerald-500" />}
                    {isCanvasMode ? '无限画布' : activeFolderId === 'all' ? '灵感抽屉' : getDrawerFolderPathName(folders, activeFolderId) || '未知分类'}
                    {!isCanvasMode && isDrawerAiClassificationMode && (
                      <span className="ml-1 rounded-[6px] border border-stone-200 bg-stone-100 px-1.5 py-0.5 text-[9px] font-semibold text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
                        AI 分类
                      </span>
                    )}

                    {/* 小圆点：阻止冒泡，防止触发拖拽 */}
                    <div
                      title={isMobileConnected ? "手机已连接" : "手机未连接 (点此扫码配对)"}
                      className="flex items-center justify-center ml-1 p-1 pointer-events-auto cursor-pointer hover:scale-110 transition-transform"
                      onPointerDown={e => e.stopPropagation()}
                      onClick={() => { setShowQR(true); setShowSettings(false); }}
                    >
                      <span className={`w-2 h-2 rounded-full transition-colors ${
                        isMobileConnected ? "bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.6)] animate-pulse" : "bg-amber-400 shadow-[0_0_2px_rgba(251,191,36,0.6)]"
                      }`} />
                    </div>
                    <AnimatePresence initial={false}>
                      {showAppUpdatePromptArrow && (
                        <motion.button
                          key="app-update-prompt-arrow"
                          type="button"
                          initial={{ opacity: 0, y: 3, scale: 0.9 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -3, scale: 0.9 }}
                          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                          onPointerDown={e => e.stopPropagation()}
                          onClick={handleAppUpdatePromptClick}
                          disabled={isCheckingAppUpdate}
                          title={isCheckingAppUpdate ? '正在检查更新' : '检查更新'}
                          className="pointer-events-auto ml-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-blue-500 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:cursor-wait disabled:opacity-75 dark:text-blue-300 dark:hover:bg-blue-400/12 dark:hover:text-blue-200"
                        >
                          {isCheckingAppUpdate
                            ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            : <ArrowUp className="h-3.5 w-3.5 stroke-[2.6]" />}
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </h2>

                  {/* 右侧按钮组：按钮本身不拖动，按钮之间的空白仍可拖动 */}
                  <div data-drawer-tools="true" data-canvas-header-tools={isCanvasMode ? 'true' : undefined} className="z-[100] flex flex-nowrap items-center justify-end gap-2 flex-1 min-w-[180px] max-w-full">

                    {isDrawerWorkbenchActive && !isMacDesktopWindow && (
                      <div
                        data-no-drag="true"
                        data-drawer-window-controls="true"
                        className="mr-1 flex items-center gap-1 rounded-[14px] border border-stone-200/70 bg-white/72 p-0.5 shadow-sm backdrop-blur-md dark:border-stone-700/70 dark:bg-stone-800/65"
                        title="抽屉工作台窗口控制"
                      >
                        <button
                          type="button"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={() => runDrawerWorkbenchWindowAction('minimize')}
                          className="flex h-7 w-7 items-center justify-center rounded-[10px] text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 dark:text-stone-300 dark:hover:bg-stone-700 dark:hover:text-stone-50"
                          title="最小化"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={() => runDrawerWorkbenchWindowAction('maximize')}
                          className="flex h-7 w-7 items-center justify-center rounded-[10px] text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 dark:text-stone-300 dark:hover:bg-stone-700 dark:hover:text-stone-50"
                          title="最大化 / 还原"
                        >
                          <Square className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={() => runDrawerWorkbenchWindowAction('close')}
                          className="flex h-7 w-7 items-center justify-center rounded-[10px] text-stone-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-stone-300 dark:hover:bg-red-400/15 dark:hover:text-red-200"
                          title="关闭抽屉"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

                    {isSelectMode ? (
                      <>
                        <button onClick={() => setSelectedIds(displayItems.map(i => i.id))} className="text-xs font-medium px-2.5 py-1.5 bg-white/65 dark:bg-stone-800/65 backdrop-blur-md rounded-[14px] text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors shadow-sm">全选</button>
                        {selectedIds.length > 0 && (
                          <>
                            <button
                              onClick={handleExportSelectedItems}
                              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300 rounded-[14px] hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors shadow-sm"
                              title="导出选中卡片到本地文件夹"
                            ><Download className="w-3.5 h-3.5" /> 导出</button>
                            <button
                              onClick={() => setShowMoveFolderModal(true)}
                              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300 rounded-[14px] hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors shadow-sm"
                              title="移动到分类文件夹"
                            ><Move className="w-3.5 h-3.5" /> 移动</button>
                            <button
                              onClick={() => {
                                const deletableItems = items.filter(i => selectedIds.includes(i.id) && !i.isQuickAccess);

                                requestDeleteDrawerItems(deletableItems, {

                                  label: '批量删除',

                                  afterDelete: () => {

                                    setSelectedIds([]);

                                    setIsSelectMode(false);

                                    setShowMoveFolderModal(false);

                                  },

                                });
                              }}
                              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 rounded-[14px] hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors shadow-sm"
                            ><Trash2 className="w-3.5 h-3.5" /> 删 ({selectedIds.length})</button>
                          </>
                        )}
                        <button onClick={() => { setIsSelectMode(false); setSelectedIds([]); lastSelectedDrawerItemIdRef.current = null; setShowMoveFolderModal(false); }} className="text-xs font-medium px-2.5 py-1.5 bg-white/65 dark:bg-stone-800/65 backdrop-blur-md rounded-[14px] text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors shadow-sm">取消</button>
                      </>
                    ) : (
                      <>
                        {isCanvasMode && (
                          <>
                          {isCanvasWorkbenchActive && !isMacDesktopWindow && (
                            <div
                              data-no-drag="true"
                              data-canvas-window-controls="true"
                              className="mr-1 flex items-center gap-1 rounded-[14px] border border-stone-200/70 bg-white/72 p-0.5 shadow-sm backdrop-blur-md dark:border-stone-700/70 dark:bg-stone-800/65"
                              title="画布工作台窗口控制"
                            >
                              <button
                                type="button"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={() => runCanvasWorkbenchWindowAction('minimize')}
                                className="flex h-7 w-7 items-center justify-center rounded-[10px] text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 dark:text-stone-300 dark:hover:bg-stone-700 dark:hover:text-stone-50"
                                title="最小化"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={() => runCanvasWorkbenchWindowAction('maximize')}
                                className="flex h-7 w-7 items-center justify-center rounded-[10px] text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 dark:text-stone-300 dark:hover:bg-stone-700 dark:hover:text-stone-50"
                                title="最大化 / 还原"
                              >
                                <Square className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={() => runCanvasWorkbenchWindowAction('close')}
                                className="flex h-7 w-7 items-center justify-center rounded-[10px] text-stone-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-stone-300 dark:hover:bg-red-400/15 dark:hover:text-red-200"
                                title="关闭画布"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                          {selectedCanvasAiGenerator && selectedCanvasConnectableCount > 0 && (
                            <button
                              data-canvas-header-action="connect"
                              onClick={() => connectSelectedCanvasItemsToGenerator(selectedCanvasAiGenerator.id)}
                              className="flex h-9 items-center gap-1.5 rounded-[9px] border border-stone-200 bg-white px-3 text-xs font-medium text-stone-600 transition-colors hover:border-stone-300 hover:bg-stone-100 hover:text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-white"
                              title="把当前多选的图片/文字连接到 AI 或文字节点"
                            >
                              <Link className="w-3.5 h-3.5 shrink-0" />
                              <span data-canvas-header-label="true">连接</span>
                              <span>{selectedCanvasConnectableCount}</span>
                            </button>
                          )}
                          <button
                            data-canvas-header-action="exit"
                            onClick={requestExitCanvasMode}
                            className="flex h-9 items-center gap-1.5 rounded-[9px] border border-stone-200 bg-stone-100 px-3 text-xs font-medium text-stone-700 transition-colors hover:border-stone-300 hover:bg-stone-200 hover:text-stone-950 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700 dark:hover:text-white"
                            title="退出无限画布"
                          >
                            <X className="w-3.5 h-3.5 shrink-0" />
                            <span data-canvas-header-label="true">退出画布</span>
                          </button>
                          </>
                        )}
                        {!isCanvasMode && (
                          <>
                            <button
                              onClick={enterCanvasMode}
                              className={`flex items-center gap-1 text-xs font-medium ${DRAWER_TOOL_BUTTON_BASE_CLASS} hover:bg-cyan-50 hover:text-cyan-600 dark:hover:bg-cyan-400/12 dark:hover:text-cyan-200`}
                              title={`进入生图画布 (${platformShortcutLabel(canvasShortcut)})`}
                            >
                              <LayoutGrid className="w-3.5 h-3.5" />
                              <span>生图</span>
                            </button>
                            <button
                              onClick={() => { setIsSelectMode(true); setSelectedIds([]); lastSelectedDrawerItemIdRef.current = null; setShowSettings(false); setIsSearchActive(false); }}
                              className={`${DRAWER_TOOL_BUTTON_BASE_CLASS} hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-400/12 dark:hover:text-blue-200`}
                              title="多选"
                            >
                              <CheckSquare className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        <div
                          data-drawer-search-trigger="true"
                          data-canvas-header-search={isCanvasMode ? 'true' : undefined}
                          className="group/search relative inline-flex h-9 w-[184px] items-center rounded-[9px] border border-stone-200 bg-white text-[12px] transition-[background-color,border-color] duration-200 hover:border-stone-300 dark:border-stone-700 dark:bg-stone-900 dark:hover:border-stone-600"
                          title={platformShortcutLabel(isCanvasMode ? '搜索图片 (Ctrl+F)' : '搜索 (Ctrl+F)')}
                        >
                          <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-stone-400" />
                          <input
                            ref={searchInputRef}
                            type="search"
                            value={searchQuery}
                            onFocus={activateSearch}
                            onBlur={() => {
                              if (!searchQuery.trim()) setIsSearchActive(false);
                            }}
                            onChange={(event) => {
                              if (!isSearchActive) activateSearch();
                              setSearchQuery(event.target.value);
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== 'Escape') return;
                              event.preventDefault();
                              setSearchQuery('');
                              setIsSearchActive(false);
                              event.currentTarget.blur();
                            }}
                            placeholder={isCanvasMode ? '搜索图片...' : '搜索文件...'}
                            aria-label={isCanvasMode ? '搜索图片' : '搜索文件'}
                            className="h-full min-w-0 flex-1 appearance-none bg-transparent pl-9 pr-8 text-[12px] font-normal text-stone-700 outline-none placeholder:text-stone-400 dark:text-stone-200 dark:placeholder:text-stone-500 [&::-webkit-search-cancel-button]:hidden"
                          />
                          {searchQuery && (
                            <button
                              type="button"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setSearchQuery('');
                                setIsSearchActive(false);
                                searchInputRef.current?.focus();
                              }}
                              className="absolute right-2 flex h-5 w-5 items-center justify-center rounded-md text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                              aria-label="清空搜索"
                              title="清空搜索"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        <button data-drawer-settings-toggle="true" data-canvas-header-action={isCanvasMode ? 'settings' : undefined} data-active={showSettings ? 'true' : 'false'} onClick={toggleSettings} className={`${DRAWER_TOOL_BUTTON_BASE_CLASS} ${showSettings ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950' : 'hover:bg-stone-100 hover:text-stone-800 dark:hover:bg-stone-800 dark:hover:text-stone-200'}`} title="设置与帮助">
                          <Settings className="block h-3.5 w-3.5 shrink-0 opacity-100" strokeWidth={2} />
                        </button>
                        {!isMainWorkbenchActive && (
                          <button onClick={handleTogglePin} className={`${DRAWER_TOOL_BUTTON_BASE_CLASS} ${isPinned ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/30 dark:bg-blue-400/14 dark:text-blue-200' : ''}`} title={isPinned ? '收回抽屉' : '钉住抽屉'}>
                            {isPinned ? <RotateCcw className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <AnimatePresence initial={false}>
                  {autoAiAnalysisProgress && autoAiAnalysisProgress.completed < autoAiAnalysisProgress.total && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                      data-drawer-analysis-progress="true"
                      className="shrink-0 overflow-hidden border-b border-stone-200/80 bg-stone-50/80 px-3 py-1.5 dark:border-white/8 dark:bg-stone-900/72"
                      onMouseDown={event => event.stopPropagation()}
                    >
                      <div className="flex items-center justify-between gap-3 text-[10px] font-semibold text-stone-600 dark:text-stone-300">
                        <span className="flex min-w-0 items-center gap-1.5"><Sparkles className="h-3 w-3 shrink-0 text-black dark:text-white" /> 正在分析抽屉图片</span>
                        <span className="shrink-0 tabular-nums text-stone-500 dark:text-stone-400">
                          已完成 {drawerAiAnalysisSummary.analyzed} / {drawerAiAnalysisSummary.total}
                          {drawerAiAnalysisSummary.waitingRetry > 0 ? ` · 待重试 ${drawerAiAnalysisSummary.waitingRetry}` : ''}
                          {drawerAiAnalysisSummary.skipped > 0 ? ` · 跳过 ${drawerAiAnalysisSummary.skipped}` : ''}
                        </span>
                      </div>
                      <div
                        role="progressbar"
                        aria-label="AI 图片分析进度"
                        aria-valuemin={0}
                        aria-valuemax={drawerAiAnalysisSummary.total}
                        aria-valuenow={drawerAiAnalysisSummary.analyzed + drawerAiAnalysisSummary.skipped}
                        className="mt-1.5 h-1 overflow-hidden rounded-full bg-stone-200/90 dark:bg-white/10"
                      >
                        <motion.div
                          className="h-full rounded-full bg-black dark:bg-white"
                          animate={{ width: `${Math.max(2, Math.min(100, ((drawerAiAnalysisSummary.analyzed + drawerAiAnalysisSummary.skipped) / Math.max(1, drawerAiAnalysisSummary.total)) * 100))}%` }}
                          transition={{ duration: 0.3, ease: 'easeOut' }}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div data-drawer-tabs="true" className={`${isCanvasMode ? 'hidden' : 'px-5 py-3 flex'} flex-wrap items-center gap-1.5 border-b border-stone-200/60 dark:border-stone-800 bg-white dark:bg-stone-950 z-10 shrink-0`} onMouseDown={e => e.stopPropagation()}>
                  {!isCanvasMode && (
                    <>
                    <div className="hidden items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-700 dark:bg-amber-900/24 dark:text-amber-300">
                      <ImageIcon className="h-3.5 w-3.5" />
                      拖入图片后可在画布上自由排列
                    </div>
                    {
                    TABS.map(tab => (
                      <button data-tab-active={activeTab === tab.id ? 'true' : 'false'} key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex h-8 items-center gap-1.5 px-3 rounded-[8px] text-[12px] font-medium transition-colors whitespace-nowrap cursor-pointer ${activeTab === tab.id ? 'bg-stone-100 text-stone-900 dark:bg-stone-800 dark:text-stone-100' : 'bg-transparent text-stone-500 dark:text-stone-400 hover:bg-stone-100/80 hover:text-stone-800 dark:hover:bg-stone-800/70 dark:hover:text-stone-200'}`}>
                        <tab.icon className={`w-3.5 h-3.5 ${activeTab === tab.id ? 'opacity-100' : 'opacity-70'}`} />{tab.label}
                      </button>
                    ))}
                    </>
                  )}
                </div>
                {!isCanvasMode && isDrawerAiClassificationMode && activeTab !== 'notes' && activeTab !== 'calendar' && (
                  <DrawerAiClassificationBar
                    dimension={drawerAiClassificationDimension}
                    activeLabel={activeDrawerAiClassificationLabel}
                    total={drawerScopedItems.length}
                    groups={drawerAiClassificationGroups}
                    onDimensionChange={setDrawerAiClassificationDimension}
                    onLabelChange={setActiveDrawerAiClassificationLabel}
                  />
                )}
                <AnimatePresence initial={false}>
                  {isCanvasMode && isSearchActive && searchQuery.trim() && normalizedDeferredSearchQuery && (
                    <CanvasSearchResults
                      candidateLimit={canvasSearchCandidateLimit}
                      candidates={canvasSearchMediaResults.candidates}
                      sourceItemIds={canvasDrawerSourceItemIds}
                      total={canvasSearchMediaResults.total}
                      workflowTargetLabel={canvasWorkflowSlotPickTarget?.label}
                      onCancelWorkflowTarget={() => setCanvasWorkflowSlotPickTarget(null)}
                      onLoadMore={() => setCanvasSearchCandidateLimit(current => (
                        current + CANVAS_SEARCH_CANDIDATE_LIMIT
                      ))}
                      onSelect={candidate => {
                        if (canvasWorkflowSlotPickTarget && candidate.type === 'image') {
                          assignDrawerImageToCanvasWorkflowSlot(canvasWorkflowSlotPickTarget, candidate);
                          return;
                        }
                        void addCanvasSearchMediaCandidate(candidate.id);
                      }}
                    />
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {showSettings && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15, ease: "easeOut" }}
                      data-drawer-settings-panel="true"
                      className="bg-stone-50/95 dark:bg-stone-900/95 backdrop-blur-md border-b border-stone-200/50 dark:border-stone-800/50 overflow-hidden relative z-[99] will-change-transform" onMouseDown={e => e.stopPropagation()}
                    >
                      <div data-settings-scroll="true" className="p-3 space-y-2 max-h-[60vh] overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-stone-300 dark:[&::-webkit-scrollbar-thumb]:bg-stone-600 [&::-webkit-scrollbar-thumb]:rounded-full">

                        <div data-settings-section="true" data-active={activeSettingCategory === 'appearance' ? 'true' : 'false'} className="bg-white/75 dark:bg-stone-800/75 rounded-[22px] border border-white/60 dark:border-stone-700/60 overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.04)] backdrop-blur-xl">
                          <button data-settings-section-trigger="true" onClick={() => setActiveSettingCategory(prev => prev === 'appearance' ? '' : 'appearance')} className="w-full flex items-center justify-between p-3 hover:bg-stone-50 dark:hover:bg-stone-700/50 transition-colors">
                            <span className="flex items-center gap-2 text-xs font-bold text-stone-700 dark:text-stone-200"><Palette className="w-4 h-4 text-emerald-500"/> 外观模式</span>
                            <ChevronDown className={`w-4 h-4 text-stone-400 transition-transform ${activeSettingCategory === 'appearance' ? 'rotate-180' : ''}`} />
                          </button>
                          <AnimatePresence>
                            {activeSettingCategory === 'appearance' && (
                              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.15, ease: "easeOut" }} className="overflow-hidden will-change-transform">
                                <div data-settings-section-content="true" className="px-3 pb-3 pt-1 flex flex-col gap-3 border-t border-stone-100 dark:border-stone-700/50">
                                  <div className="flex items-center justify-between pt-1">
                                    <span className="text-xs font-medium text-stone-600 dark:text-stone-300 flex items-center gap-1.5"><Sun className="w-3.5 h-3.5 text-stone-400" /> 色彩主题</span>
                                    <button onClick={() => setIsDark(!isDark)} className="flex items-center gap-1.5 px-3 py-1 rounded border border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-600 text-[11px] font-medium transition-colors">
                                      {isDark ? '切换浅色' : '切换深色'}
                                    </button>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={toggleDrawerSidebarLayout}
                                    className="group flex min-h-[42px] w-full items-center justify-between gap-3 rounded-[16px] border border-transparent px-2.5 py-2 text-left transition-all hover:border-stone-200/80 hover:bg-stone-50/85 active:scale-[0.995] dark:hover:border-stone-600/70 dark:hover:bg-stone-700/50"
                                    title="切换左侧侧边栏显示方式"
                                  >
                                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-stone-600 dark:text-stone-300">
                                      <FolderOpen className="w-3.5 h-3.5 text-amber-500" /> 侧边栏样式
                                    </span>
                                    <span className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ${isFolderSidebarLayout ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/50 dark:bg-amber-900/30 dark:text-amber-300' : 'border-stone-200 bg-stone-50 text-stone-500 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-300'}`}>
                                      {isFolderSidebarLayout ? '文件夹列表' : '大图标'}
                                      <ChevronRight className="w-3 h-3 opacity-45 transition-transform group-hover:translate-x-0.5" />
                                    </span>
                                  </button>
                                  <DrawerOrganizationPanel
                                    classificationView={drawerClassificationView}
                                    onChange={setDrawerClassificationView}
                                    onResetLabel={() => setActiveDrawerAiClassificationLabel('all')}
                                    onToast={showToast}
                                  />
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        <div data-settings-section="true" data-active={activeSettingCategory === 'shortcuts' ? 'true' : 'false'} className="bg-white/75 dark:bg-stone-800/75 rounded-[22px] border border-white/60 dark:border-stone-700/60 overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.04)] backdrop-blur-xl">
                          <button data-settings-section-trigger="true" onClick={() => setActiveSettingCategory(prev => prev === 'shortcuts' ? '' : 'shortcuts')} className="w-full flex items-center justify-between p-3 hover:bg-stone-50 dark:hover:bg-stone-700/50 transition-colors">
                            <span className="flex items-center gap-2 text-xs font-bold text-stone-700 dark:text-stone-200"><Keyboard className="w-4 h-4 text-blue-500"/> 快捷键配置</span>
                            <ChevronDown className={`w-4 h-4 text-stone-400 transition-transform ${activeSettingCategory === 'shortcuts' ? 'rotate-180' : ''}`} />
                          </button>
                          <AnimatePresence>
                            {activeSettingCategory === 'shortcuts' && (
                              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.15, ease: "easeOut" }} className="overflow-hidden will-change-transform">
                                <div data-settings-section-content="true" className="px-3 pb-3 pt-1 flex flex-col gap-2.5 border-t border-stone-100 dark:border-stone-700/50">
                                  <div className="flex items-center justify-between pt-1">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">防误触模式</span>
                                    <button className={`px-2 py-1 rounded border text-[10px] font-mono tracking-wider transition-colors outline-none cursor-pointer ${isRecording ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:border-blue-400'}`} onClick={() => { setIsRecording(true); setIsRecordingSnip(false); setIsRecordingText(false); setIsRecordingSearch(false); setIsRecordingTrigger(false); setIsRecordingNote(false); setIsRecordingCanvas(false); }} onKeyDown={(e) => { if (isRecording) handleRecordShortcut(e, (s: string) => { setShortcut(s); setIsRecording(false); }, 'update-shortcut'); }} onBlur={() => setIsRecording(false)}>{isRecording ? '请按键...' : platformShortcutLabel(shortcut)}</button>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">极速截图</span>
                                    <button className={`px-2 py-1 rounded border text-[10px] font-mono tracking-wider transition-colors outline-none cursor-pointer ${isRecordingSnip ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:border-blue-400'}`} onClick={() => { setIsRecordingSnip(true); setIsRecording(false); setIsRecordingText(false); setIsRecordingSearch(false); setIsRecordingTrigger(false); setIsRecordingNote(false); setIsRecordingCanvas(false); }} onKeyDown={(e) => { if (isRecordingSnip) handleRecordShortcut(e, (s: string) => { setSnipShortcut(s); setIsRecordingSnip(false); }, 'update-snip-shortcut'); }} onBlur={() => setIsRecordingSnip(false)}>{isRecordingSnip ? '请按键...' : platformShortcutLabel(snipShortcut)}</button>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">快速记录灵感</span>
                                    <button className={`px-2 py-1 rounded border text-[10px] font-mono tracking-wider transition-colors outline-none cursor-pointer ${isRecordingText ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:border-blue-400'}`} onClick={() => { setIsRecordingText(true); setIsRecording(false); setIsRecordingSnip(false); setIsRecordingSearch(false); setIsRecordingTrigger(false); setIsRecordingNote(false); setIsRecordingCanvas(false); }} onKeyDown={(e) => { if (isRecordingText) handleRecordShortcut(e, (s: string) => { setTextShortcut(s); setIsRecordingText(false); }, 'update-text-shortcut'); }} onBlur={() => setIsRecordingText(false)}>{isRecordingText ? '请按键...' : platformShortcutLabel(textShortcut)}</button>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">全局搜索唤出</span>
                                    <button className={`px-2 py-1 rounded border text-[10px] font-mono tracking-wider transition-colors outline-none cursor-pointer ${isRecordingSearch ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:border-blue-400'}`} onClick={() => { setIsRecordingSearch(true); setIsRecordingText(false); setIsRecording(false); setIsRecordingSnip(false); setIsRecordingTrigger(false); setIsRecordingNote(false); setIsRecordingCanvas(false); }} onKeyDown={(e) => { if (isRecordingSearch) handleRecordShortcut(e, (s: string) => { setSearchShortcut(s); setIsRecordingSearch(false); }, 'update-search-shortcut'); }} onBlur={() => setIsRecordingSearch(false)}>{isRecordingSearch ? '请按键...' : platformShortcutLabel(searchShortcut)}</button>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">切换触发入口</span>
                                    <button className={`px-2 py-1 rounded border text-[10px] font-mono tracking-wider transition-colors outline-none cursor-pointer ${isRecordingTrigger ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:border-blue-400'}`} onClick={() => { setIsRecordingTrigger(true); setIsRecordingSearch(false); setIsRecordingText(false); setIsRecording(false); setIsRecordingSnip(false); setIsRecordingNote(false); setIsRecordingCanvas(false); }} onKeyDown={(e) => { if (isRecordingTrigger) handleRecordShortcut(e, (s: string) => { setTriggerShortcut(s); setIsRecordingTrigger(false); }, 'update-trigger-shortcut'); }} onBlur={() => setIsRecordingTrigger(false)}>{isRecordingTrigger ? '请按键...' : platformShortcutLabel(triggerShortcut)}</button>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">新增便签</span>
                                    <button className={`px-2 py-1 rounded border text-[10px] font-mono tracking-wider transition-colors outline-none cursor-pointer ${isRecordingNote ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:border-blue-400'}`} onClick={() => { setIsRecordingNote(true); setIsRecordingTrigger(false); setIsRecordingSearch(false); setIsRecordingText(false); setIsRecording(false); setIsRecordingSnip(false); setIsRecordingCanvas(false); }} onKeyDown={(e) => { if (isRecordingNote) handleRecordShortcut(e, (s: string) => { setNoteShortcut(s); setIsRecordingNote(false); }, 'update-note-shortcut'); }} onBlur={() => setIsRecordingNote(false)}>{isRecordingNote ? '请按键...' : platformShortcutLabel(noteShortcut)}</button>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">切换无限画布</span>
                                    <button className={`px-2 py-1 rounded border text-[10px] font-mono tracking-wider transition-colors outline-none cursor-pointer ${isRecordingCanvas ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' : 'border-stone-200 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:border-blue-400'}`} onClick={() => { setIsRecordingCanvas(true); setIsRecordingNote(false); setIsRecordingTrigger(false); setIsRecordingSearch(false); setIsRecordingText(false); setIsRecording(false); setIsRecordingSnip(false); }} onKeyDown={(e) => { if (isRecordingCanvas) handleRecordShortcut(e, (s: string) => { setCanvasShortcut(s); setIsRecordingCanvas(false); }, 'update-canvas-shortcut'); }} onBlur={() => setIsRecordingCanvas(false)}>{isRecordingCanvas ? '请按键...' : platformShortcutLabel(canvasShortcut)}</button>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        <BrowserExtensionSetup
                          expanded={activeSettingCategory === 'browser-extension'}
                          onToggle={() => setActiveSettingCategory(prev => prev === 'browser-extension' ? '' : 'browser-extension')}
                        />

                        {shouldShowLegacyAiSettings() && (
                        <div data-settings-section="true" data-active={activeSettingCategory === 'ai-overview' ? 'true' : 'false'} className="bg-white/75 dark:bg-stone-800/75 rounded-[22px] border border-white/60 dark:border-stone-700/60 overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.04)] backdrop-blur-xl">
                          <button data-settings-section-trigger="true" onClick={() => setActiveSettingCategory(prev => prev === 'ai-overview' ? '' : 'ai-overview')} className="w-full flex items-center justify-between p-3 hover:bg-stone-50 dark:hover:bg-stone-700/50 transition-colors">
                            <span className="flex items-center gap-2 text-xs font-bold text-stone-700 dark:text-stone-200"><Sparkles className="w-4 h-4 text-blue-500"/> AI 与额度</span>
                            <ChevronDown className={`w-4 h-4 text-stone-400 transition-transform ${activeSettingCategory === 'ai-overview' ? 'rotate-180' : ''}`} />
                          </button>
                          <AnimatePresence>
                            {activeSettingCategory === 'ai-overview' && (
                              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.15, ease: "easeOut" }} className="overflow-hidden will-change-transform">
                                <div data-settings-section-content="true" className="flex flex-col gap-2.5 border-t border-stone-100 px-3 pb-3 pt-2 dark:border-stone-700/50">
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    <button
                                      data-settings-choice="true"
                                      data-active={canvasAiCredentialSource === 'wallet' ? 'true' : 'false'}
                                      type="button"
                                      onClick={() => setCanvasAiCredentialSource('wallet')}
                                      aria-pressed={canvasAiCredentialSource === 'wallet'}
                                      className={`rounded-[16px] border px-3 py-2.5 text-left transition ${canvasAiCredentialSource === 'wallet' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200/70 dark:border-blue-300 dark:bg-blue-400/15 dark:ring-blue-400/20' : 'border-blue-100 bg-blue-50/60 hover:border-blue-300 dark:border-blue-400/20 dark:bg-blue-400/10'}`}
                                    >
                                      <div className="text-[10px] font-black text-blue-700 dark:text-blue-200">授权钱包余额</div>
                                      <div className="mt-1 text-xl font-black tabular-nums text-stone-900 dark:text-white">
                                        {isCloudAccountLoading ? '…' : cloudAccount ? formatCreditAmount(cloudAccount.wallet.availableCredits) : '—'}
                                      </div>
                                      <div className="mt-0.5 truncate text-[10px] text-stone-400 dark:text-stone-500">
                                        {cloudAccount?.displayName || licenseStatus?.customer || '邮箱账号钱包'}
                                      </div>
                                      {cloudAccountSyncError && (
                                        <div className="mt-0.5 truncate text-[9px] font-bold text-amber-600 dark:text-amber-300" title={cloudAccountSyncError}>
                                          同步失败，显示最近一次成功余额
                                        </div>
                                      )}
                                    </button>
                                    <button
                                      data-settings-choice="true"
                                      data-active={canvasAiCredentialSource === 'local' ? 'true' : 'false'}
                                      type="button"
                                      onClick={() => {
                                        setCanvasAiCredentialSource('local');
                                      }}
                                      aria-pressed={canvasAiCredentialSource === 'local'}
                                      className={`rounded-[16px] border px-3 py-2.5 text-left transition ${canvasAiCredentialSource === 'local' ? 'border-cyan-500 bg-cyan-50 ring-2 ring-cyan-200/70 dark:border-cyan-300 dark:bg-cyan-400/15 dark:ring-cyan-400/20' : 'border-cyan-100 bg-cyan-50/60 hover:border-cyan-300 dark:border-cyan-400/20 dark:bg-cyan-400/10'}`}
                                    >
                                        <div className="text-[10px] font-black text-cyan-700 dark:text-cyan-200">本地 API 额度</div>
                                        <div className={`mt-1 min-h-7 text-[12px] font-black leading-5 ${canvasAiXaisBalance.status === 'error' ? 'text-red-500 dark:text-red-300' : 'text-stone-900 dark:text-white'}`}>
                                          {hasLocalXaisAccount ? canvasAiXaisBalanceText : '使用本机已配置的 API'}
                                        </div>
                                    </button>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => void refreshVisibleBalances()}
                                    disabled={isCloudAccountLoading || canvasAiXaisBalance.status === 'loading'}
                                    className="flex h-8 items-center justify-center gap-1.5 rounded-[13px] border border-blue-100 bg-white/80 text-[10px] font-black text-blue-700 transition hover:bg-blue-50 disabled:cursor-wait disabled:opacity-55 dark:border-blue-400/20 dark:bg-stone-950/30 dark:text-blue-200 dark:hover:bg-blue-400/10"
                                  >
                                    <RefreshCw className={`h-3.5 w-3.5 ${(isCloudAccountLoading || canvasAiXaisBalance.status === 'loading') ? 'animate-spin' : ''}`} />
                                    查询全部额度
                                  </button>

                                  <div className="grid gap-1.5 rounded-[18px] border border-blue-100 bg-blue-50/45 px-3 py-2.5 dark:border-blue-400/20 dark:bg-blue-400/10">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-[11px] font-black text-stone-700 dark:text-stone-200">生图 / 视频额度来源</span>
                                      <span className="text-[10px] text-stone-400">画布节点会同步过滤模型</span>
                                    </div>
                                    <div className="text-[10px] leading-4 text-stone-400 dark:text-stone-500">
                                      点击上方余额卡片即可切换来源；同名模型会合并，调用失败时会自动尝试该来源下的其它可用渠道。
                                    </div>
                                  </div>

                                  <div className="grid gap-2 rounded-[18px] border border-stone-200/80 bg-white/70 px-3 py-2.5 dark:border-stone-700 dark:bg-stone-950/30">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-[11px] font-black text-stone-700 dark:text-stone-200">Agent 使用方式</span>
                                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${canvasAgent.settings.provider === 'codex' ? 'bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-200' : canvasAgent.settings.apiProvider.toLowerCase() !== 'unmind-wallet' ? 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200' : 'bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200'}`}>
                                        {canvasAgent.settings.provider === 'codex' ? 'GPT 登录' : canvasAgent.settings.apiProvider.toLowerCase() !== 'unmind-wallet' ? '自定义 API' : '钱包额度'}
                                      </span>
                                    </div>
                                    <select
                                      value={canvasAgent.settings.provider === 'codex'
                                        ? 'codex'
                                        : isByokUnlocked && canvasAgent.settings.apiProvider.toLowerCase() !== 'unmind-wallet' ? 'custom' : 'wallet'}
                                      onChange={event => void switchAgentFundingSource(event.target.value === 'codex' ? 'codex' : event.target.value === 'custom' ? 'custom' : 'wallet')}
                                      disabled={canvasAgent.settingsLoading}
                                      className="w-full rounded-[13px] border border-stone-200 bg-white px-3 py-2 text-[11px] font-bold text-stone-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-200/50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                                    >
                                      <option value="wallet">使用授权钱包余额</option>
                                      <option value="codex">使用 GPT / ChatGPT 登录</option>
                                      {isByokUnlocked && <option value="custom">使用自定义 API</option>}
                                    </select>
                                    {canvasAgent.settings.provider !== 'codex' && (
                                      <label className="flex flex-col gap-1">
                                        <span className="text-[10px] font-bold text-stone-500 dark:text-stone-400">LLM 模型</span>
                                        <select
                                          value={canvasAgent.settings.apiModel || ''}
                                          onChange={event => {
                                            const apiModel = event.target.value;
                                            void canvasAgent.saveSettings({
                                              ...canvasAgent.settings,
                                              apiModel,
                                            }).catch((error: unknown) => showToast(String(error)));
                                          }}
                                          disabled={canvasAgent.settingsLoading}
                                          className="w-full rounded-[13px] border border-blue-100 bg-white px-3 py-2 text-[11px] font-bold text-stone-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-200/50 dark:border-blue-400/20 dark:bg-stone-900 dark:text-stone-100"
                                        >
                                          {!canvasAgent.settings.apiModel && <option value="">{agentModelsLoading ? '读取模型中…' : '暂无可用模型'}</option>}
                                          {canvasAgent.settings.apiModel && !agentModels.includes(canvasAgent.settings.apiModel) && (
                                            <option value={canvasAgent.settings.apiModel}>{canvasAgent.settings.apiModel}（当前）</option>
                                          )}
                                          {agentModels.map(model => <option key={model} value={model}>{model}</option>)}
                                        </select>
                                      </label>
                                    )}
                                    {isByokUnlocked && (
                                      <div className="flex flex-col gap-2 rounded-[15px] border border-amber-200/80 bg-amber-50/55 p-2.5 dark:border-amber-400/20 dark:bg-amber-400/10">
                                        <div className="text-[10px] font-black text-amber-800 dark:text-amber-100">自定义 Agent API</div>
                                        <input
                                          value={agentCustomProvider}
                                          onChange={event => setAgentCustomProvider(event.target.value)}
                                          placeholder="Provider，例如 openai-compatible"
                                          className="w-full rounded-[11px] border border-amber-200 bg-white/85 px-2.5 py-1.5 text-[10px] text-stone-700 outline-none focus:border-amber-400 dark:border-amber-400/25 dark:bg-stone-900/45 dark:text-stone-100"
                                        />
                                        <input
                                          value={agentCustomBaseUrl}
                                          onChange={event => setAgentCustomBaseUrl(event.target.value)}
                                          placeholder="API Base URL，例如 https://api.openai.com/v1"
                                          className="w-full rounded-[11px] border border-amber-200 bg-white/85 px-2.5 py-1.5 text-[10px] text-stone-700 outline-none focus:border-amber-400 dark:border-amber-400/25 dark:bg-stone-900/45 dark:text-stone-100"
                                        />
                                        <input
                                          type="password"
                                          value={agentCustomApiKey}
                                          onChange={event => setAgentCustomApiKey(event.target.value)}
                                          placeholder={canvasAgent.settings.hasApiKey ? 'API Key 已保存，留空保持不变' : 'API Key'}
                                          className="w-full rounded-[11px] border border-amber-200 bg-white/85 px-2.5 py-1.5 text-[10px] text-stone-700 outline-none focus:border-amber-400 dark:border-amber-400/25 dark:bg-stone-900/45 dark:text-stone-100"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => void saveAgentCustomApi()}
                                          disabled={agentCustomSaving || canvasAgent.settingsLoading}
                                          className="h-7 rounded-[11px] bg-amber-500 text-[10px] font-black text-white transition hover:bg-amber-600 disabled:cursor-wait disabled:opacity-50"
                                        >
                                          {agentCustomSaving ? '保存中' : '保存自定义 API'}
                                        </button>
                                      </div>
                                    )}
                                    <div className="text-[10px] leading-4 text-stone-400 dark:text-stone-500">
                                      钱包模式由 api.unmind.art 统一计费；GPT 登录使用用户自己的 ChatGPT / Codex 账号。
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => void canvasAgent.startCodexLogin('chatgpt')}
                                        disabled={canvasAgent.settingsLoading}
                                        className="rounded-[12px] bg-violet-600 px-3 py-1.5 text-[10px] font-black text-white transition hover:bg-violet-700 disabled:opacity-50"
                                      >
                                        {canvasAgent.codexStatus?.authenticated ? '重新登录 GPT' : '登录 GPT'}
                                      </button>
                                      {canvasAgent.codexStatus?.authenticated && (
                                        <button
                                          type="button"
                                          onClick={() => void canvasAgent.logoutCodex()}
                                          className="rounded-[12px] border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-bold text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
                                        >退出 GPT</button>
                                      )}
                                      {(canvasAgent.codexLoginInfo?.authUrl || canvasAgent.codexLoginInfo?.verificationUrl) && (
                                        <button
                                          type="button"
                                          onClick={() => void canvasAgent.openCodexLoginUrl(canvasAgent.codexLoginInfo?.authUrl || canvasAgent.codexLoginInfo?.verificationUrl || '')}
                                          className="rounded-[12px] border border-violet-100 bg-violet-50 px-3 py-1.5 text-[10px] font-bold text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-200"
                                        >打开登录页面</button>
                                      )}
                                    </div>
                                    {canvasAgent.codexLoginInfo?.userCode && (
                                      <div className="rounded-[12px] bg-violet-50 px-3 py-2 text-[10px] font-bold text-violet-700 dark:bg-violet-400/10 dark:text-violet-200">
                                        设备码：<span className="font-mono text-xs">{canvasAgent.codexLoginInfo.userCode}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                          {isByokUnlocked && (
                            <>
                          <button
                            type="button"
                            onClick={() => setActiveSettingCategory(prev => prev === 'ai' ? '' : 'ai')}
                            className="flex w-full items-center justify-between border-t border-stone-100 p-3 text-left transition-colors hover:bg-stone-50 dark:border-stone-700/50 dark:hover:bg-stone-700/50"
                          >
                            <span className="flex items-center gap-2 text-xs font-bold text-stone-700 dark:text-stone-200">
                              <Sparkles className="h-4 w-4 text-cyan-500" />
                              AI 图像 / 视频
                              {isByokUnlocked && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200">自定义 API</span>}
                            </span>
                            <ChevronDown className={`h-4 w-4 text-stone-400 transition-transform ${activeSettingCategory === 'ai' ? 'rotate-180' : ''}`} />
                          </button>
                          <AnimatePresence>
                            {activeSettingCategory === 'ai' && (
                              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.15, ease: "easeOut" }} className="overflow-hidden will-change-transform">
                                <div className="px-3 pb-3 pt-1 flex flex-col gap-2.5 border-t border-stone-100 dark:border-stone-700/50">
                                  <div className="flex flex-col gap-2 rounded-[18px] border border-cyan-100 bg-cyan-50/58 px-3 py-2.5 dark:border-cyan-900/45 dark:bg-cyan-950/16">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="flex items-center gap-1.5 text-[11px] font-black text-cyan-800 dark:text-cyan-200">
                                        <Sparkles className="h-3.5 w-3.5" />
                                        AI 图像 / 视频
                                      </span>
                                      <span className="truncate rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold text-cyan-700 dark:bg-cyan-900/36 dark:text-cyan-200">
                                        {isCanvasAiLicenseManaged ? managedCanvasAiProviderLabel : CANVAS_AI_PROVIDER_SELECT_OPTIONS.find(option => option.value === effectiveCanvasAiProvider)?.label || effectiveCanvasAiProvider}
                                      </span>
                                    </div>
                                    <label className="flex flex-col gap-1">
                                      <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">接口类型</span>
                                      {isCanvasAiLicenseManaged ? (
                                        <div className="w-full rounded-[14px] border border-cyan-100 bg-white/82 px-3 py-1.5 text-xs font-bold text-stone-700 dark:border-cyan-900/45 dark:bg-stone-800/70 dark:text-stone-200">
                                          {managedCanvasAiProviderLabel}
                                        </div>
                                      ) : (
                                        <select
                                          value={effectiveCanvasAiProvider}
                                          onChange={(event) => {
                                            const provider = normalizeCanvasAiProvider(event.target.value);
                                            setCanvasAiProvider(provider);
                                            setCanvasAiApiKey(getStoredCanvasAiApiKey(provider));
                                            setCanvasAiHeadersText(getStoredCanvasAiHeadersText(provider));
                                            setCanvasAiApiProvider(getStoredCanvasAiApiProvider(provider));
                                            const endpoint = getStoredCanvasAiEndpoint(provider);
                                            if (endpoint) setCanvasAiEndpoint(endpoint);
                                          }}
                                          className="w-full rounded-[14px] bg-white/82 dark:bg-stone-800/70 border border-cyan-100 dark:border-cyan-900/45 px-3 py-1.5 text-xs text-stone-700 dark:text-stone-200 outline-none focus:ring-2 focus:ring-cyan-500/20"
                                        >
                                          {CANVAS_AI_PROVIDER_SELECT_OPTIONS.map(option => (
                                            <option key={option.value} value={option.value}>{option.label}</option>
                                          ))}
                                        </select>
                                      )}
                                    </label>
                                    <label className="flex flex-col gap-1">
                                      <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">Provider</span>
                                      <input
                                        value={effectiveCanvasAiApiProvider}
                                        onChange={event => {
                                          if (!isCanvasAiLicenseManaged) setCanvasAiApiProvider(event.target.value);
                                        }}
                                        disabled={isCanvasAiLicenseManaged}
                                        placeholder="例如 xais-chat、new-api、openai-compatible"
                                        className="w-full rounded-[14px] border border-cyan-100 bg-white/82 px-3 py-1.5 text-xs text-stone-700 outline-none focus:ring-2 focus:ring-cyan-500/20 disabled:opacity-75 dark:border-cyan-900/45 dark:bg-stone-800/70 dark:text-stone-200"
                                      />
                                    </label>
                                    <label className="flex flex-col gap-1">
                                      <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">API Key</span>
                                      <input
                                        type={isCanvasAiLicenseManaged ? 'text' : 'password'}
                                        value={isCanvasAiLicenseManaged ? `由高级版授权提供${licenseAiAccess?.canvas_api_key_last4 ? ` · ****${licenseAiAccess.canvas_api_key_last4}` : ''}` : canvasAiApiKey}
                                        onChange={(event) => {
                                          if (!isCanvasAiLicenseManaged) setCanvasAiApiKey(event.target.value);
                                        }}
                                        disabled={isCanvasAiLicenseManaged}
                                        placeholder={isCanvasAiLicenseManaged ? 'API 配置由高级版授权提供' : getCanvasAiApiKeyPlaceholder(canvasAiProvider)}
                                        className="w-full rounded-[14px] bg-white/82 dark:bg-stone-800/70 border border-cyan-100 dark:border-cyan-900/45 px-3 py-1.5 text-xs text-stone-700 dark:text-stone-200 outline-none focus:ring-2 focus:ring-cyan-500/20"
                                      />
                                    </label>
                                    {!isCanvasAiLicenseManaged && effectiveCanvasAiProvider === 'new-api' && (
                                      <label className="flex flex-col gap-1">
                                        <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">视频 API Key（可留空）</span>
                                        <input
                                          type="password"
                                          value={canvasAiNewApiVideoKey}
                                          onChange={event => setCanvasAiNewApiVideoKey(event.target.value)}
                                          placeholder="留空时复用上面的 New API Key"
                                          className="w-full rounded-[14px] border border-cyan-100 bg-white/82 px-3 py-1.5 text-xs text-stone-700 outline-none focus:ring-2 focus:ring-cyan-500/20 dark:border-cyan-900/45 dark:bg-stone-800/70 dark:text-stone-200"
                                        />
                                      </label>
                                    )}
                                    {isCanvasAiRemoteModelProvider(effectiveCanvasAiProvider) && (
                                      <div className="flex items-center justify-between gap-2 rounded-[14px] border border-cyan-100/80 bg-white/62 px-2.5 py-2 dark:border-cyan-900/38 dark:bg-stone-900/38">
                                        <div className="flex min-w-0 items-center gap-2">
                                          <Wallet className="h-3.5 w-3.5 shrink-0 text-cyan-600 dark:text-cyan-300" />
                                          <span className={`truncate text-[10px] font-bold ${canvasAiXaisBalance.status === 'error' ? 'text-red-500 dark:text-red-300' : 'text-cyan-700 dark:text-cyan-200'}`}>
                                            {canvasAiXaisBalanceText}
                                          </span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => void checkCanvasAiXaisBalance()}
                                          disabled={canvasAiXaisBalance.status === 'loading' || !canvasAiHasApiCredential}
                                          className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-cyan-100 px-2 text-[10px] font-black text-cyan-700 transition-colors hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-cyan-900/42 dark:text-cyan-100 dark:hover:bg-cyan-900/70"
                                          title="查询 Gateway 余额"
                                        >
                                          <RefreshCw className={`h-3 w-3 ${canvasAiXaisBalance.status === 'loading' ? 'animate-spin' : ''}`} />
                                          查余额
                                        </button>
                                      </div>
                                    )}
                                    {isCanvasAiRemoteModelProvider(effectiveCanvasAiProvider) && (
                                      <div className="flex flex-col gap-1">
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">
                                            {isCanvasAiEndpointVisible(effectiveCanvasAiProvider) ? 'API Base URL' : '连接与模型'}
                                          </span>
                                          <div className="flex gap-1">
                                            <button
                                              type="button"
                                              onClick={() => void testCanvasAiConnection()}
                                              disabled={isTestingCanvasAiConnection || (!canvasAiUsesCloudImageModels && (!(effectiveCanvasAiEndpoint || canvasAiEndpoint).trim() || !canvasAiHasApiCredential))}
                                              className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700 disabled:opacity-45 dark:bg-violet-400/15 dark:text-violet-100"
                                            >
                                              {isTestingCanvasAiConnection ? '测试中' : '测试连接'}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => refreshCanvasAiOpenAiModels(false)}
                                              disabled={isRefreshingCanvasAiOpenAiModels || !canvasAiCanRefreshModels}
                                              className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-700 disabled:opacity-45 dark:bg-cyan-900/35 dark:text-cyan-200"
                                            >
                                              {isRefreshingCanvasAiOpenAiModels ? '刷新中' : '刷新模型'}
                                            </button>
                                          </div>
                                        </div>
                                        {isCanvasAiEndpointVisible(effectiveCanvasAiProvider) && (
                                          <input
                                            value={isCanvasAiLicenseManaged ? effectiveCanvasAiEndpoint : canvasAiEndpoint}
                                            onChange={(event) => {
                                              if (!isCanvasAiLicenseManaged) setCanvasAiEndpoint(event.target.value);
                                            }}
                                            disabled={isCanvasAiLicenseManaged}
                                            placeholder={isCanvasAiLicenseManaged ? 'API Base URL 由高级版授权提供' : getCanvasAiEndpointPlaceholder(canvasAiProvider)}
                                            className="w-full rounded-[14px] bg-white/82 dark:bg-stone-800/70 border border-cyan-100 dark:border-cyan-900/45 px-3 py-1.5 text-xs text-stone-700 dark:text-stone-200 outline-none focus:ring-2 focus:ring-cyan-500/20"
                                          />
                                        )}
                                        <span className={`text-[10px] leading-4 ${canvasAiOpenAiModelError ? 'text-red-500 dark:text-red-300' : 'text-stone-400 dark:text-stone-500'}`}>
                                          {canvasAiOpenAiModelError || (canvasAiRemoteModelCount > 0 ? `已读取 ${canvasAiRemoteModelCount} 个模型` : canvasAiRemoteModelEmptyHint)}
                                        </span>
                                      </div>
                                    )}
                                    {!isCanvasAiLicenseManaged && (
                                      <label className="flex flex-col gap-1">
                                        <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">自定义 Headers (JSON)</span>
                                        <textarea
                                          value={canvasAiHeadersText}
                                          onChange={event => setCanvasAiHeadersText(event.target.value)}
                                          rows={2}
                                          spellCheck={false}
                                          placeholder='例如 {"X-Tenant":"demo"}'
                                          className="w-full resize-y rounded-[14px] border border-cyan-100 bg-white/82 px-3 py-2 font-mono text-[10px] text-stone-700 outline-none focus:ring-2 focus:ring-cyan-500/20 dark:border-cyan-900/45 dark:bg-stone-800/70 dark:text-stone-200"
                                        />
                                      </label>
                                    )}
                                  </div>
                                  <div className="hidden flex-col gap-2 rounded-[18px] border border-sky-100 bg-sky-50/50 px-3 py-2.5 dark:border-sky-400/20 dark:bg-sky-400/10">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="flex items-center gap-1.5 text-[11px] font-black text-sky-800 dark:text-sky-100">
                                        <Download className="h-3.5 w-3.5" />
                                        本地大模型增量包
                                      </span>
                                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                        localVisionModelDownload.phase === 'ready'
                                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200'
                                          : localVisionModelDownload.phase === 'downloading' || localVisionModelDownload.phase === 'loading'
                                          ? 'bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-100'
                                          : localVisionModelDownload.phase === 'error'
                                          ? 'bg-red-100 text-red-600 dark:bg-red-400/15 dark:text-red-200'
                                          : 'bg-white/75 text-stone-500 dark:bg-stone-900/35 dark:text-stone-300'
                                      }`}>
                                        {localVisionModelDownload.phase === 'ready'
                                          ? '已就绪'
                                          : localVisionModelDownload.phase === 'downloading'
                                          ? `${Math.round(localVisionModelDownload.progress)}%`
                                          : localVisionModelDownload.phase === 'loading' || isLocalVisionModelChecking
                                          ? '检查中'
                                          : localVisionModelDownload.phase === 'error'
                                          ? '不可用'
                                          : '未下载'}
                                      </span>
                                    </div>
                                    <div className="text-[10px] leading-4 text-stone-500 dark:text-stone-400">
                                      主安装包不包含 Ollama 和本地视觉模型。需要离线或本地参考图识别时，可静默安装 Ollama，并下载 qwen2.5vl:3b 增量包，约 3.2GB。
                                    </div>
                                    {(localVisionModelDownload.phase === 'downloading' || localVisionModelDownload.phase === 'loading') && (
                                      <div className="h-1 overflow-hidden rounded-full bg-white/80 dark:bg-stone-900/50">
                                        <div
                                          className="h-full rounded-full bg-sky-500 transition-all"
                                          style={{ width: `${clamp(localVisionModelDownload.progress || 3, 3, 100)}%` }}
                                        />
                                      </div>
                                    )}
                                    {localVisionModelLastError && (
                                      <div className="rounded-[12px] border border-amber-200/70 bg-white/68 px-2 py-1.5 text-[10px] leading-4 text-amber-700 dark:border-amber-400/20 dark:bg-stone-900/30 dark:text-amber-100">
                                        {localVisionModelLastError}
                                      </div>
                                    )}
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => void retryLocalVisionModelDownload()}
                                        disabled={isInstallingOllama || localVisionModelDownload.phase === 'downloading' || localVisionModelDownload.phase === 'loading'}
                                        className="rounded-[13px] bg-sky-500 px-3 py-1.5 text-[10px] font-bold text-white shadow-sm transition-colors hover:bg-sky-600 disabled:cursor-wait disabled:bg-stone-200 disabled:text-stone-400 dark:disabled:bg-stone-700"
                                      >
                                        {localVisionModelDownload.phase === 'ready' ? '重新检查/补齐' : '下载增量包'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void checkLocalVisionModelStatus({ silent: false })}
                                        disabled={isInstallingOllama || isLocalVisionModelChecking || localVisionModelDownload.phase === 'downloading'}
                                        className="rounded-[13px] border border-sky-100 bg-white/75 px-3 py-1.5 text-[10px] font-bold text-sky-700 transition-colors hover:bg-sky-50 disabled:cursor-wait disabled:opacity-50 dark:border-sky-400/20 dark:bg-stone-900/35 dark:text-sky-100 dark:hover:bg-sky-400/10"
                                      >
                                        {isLocalVisionModelChecking ? '检查中' : '检查状态'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void installOllamaSilently()}
                                        disabled={isInstallingOllama || localVisionModelDownload.phase === 'downloading'}
                                        className="rounded-[13px] border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-[10px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-55 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100 dark:hover:bg-emerald-400/15"
                                      >
                                        {isInstallingOllama ? '安装中' : '静默安装 Ollama'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void openOllamaDownloadPage()}
                                        disabled={isInstallingOllama}
                                        className="rounded-[13px] border border-stone-200 bg-white/75 px-3 py-1.5 text-[10px] font-bold text-stone-500 transition-colors hover:bg-stone-100 disabled:cursor-wait disabled:opacity-55 dark:border-stone-700 dark:bg-stone-900/35 dark:text-stone-300 dark:hover:bg-stone-800"
                                      >
                                        下载页
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                            </>
                          )}
                        </div>
                        )}

                        <div data-settings-section="true" data-active={activeSettingCategory === 'license' ? 'true' : 'false'} className="overflow-hidden rounded-[18px] border border-stone-200/80 bg-white dark:border-stone-700/70 dark:bg-stone-800">
                          <button data-settings-section-trigger="true" onClick={() => setActiveSettingCategory(prev => prev === 'license' ? '' : 'license')} className="flex w-full items-center justify-between px-4 py-3.5 transition-colors hover:bg-stone-50 dark:hover:bg-stone-700/50">
                            <span className="flex items-center gap-2 text-xs font-bold text-stone-700 dark:text-stone-200"><Wallet className="h-4 w-4 text-stone-500 dark:text-stone-400"/> 账号额度</span>
                            <ChevronDown className={`w-4 h-4 text-stone-400 transition-transform ${activeSettingCategory === 'license' ? 'rotate-180' : ''}`} />
                          </button>
                          <AnimatePresence>
                            {activeSettingCategory === 'license' && (
                              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.15, ease: "easeOut" }} className="overflow-hidden will-change-transform">
                                <div data-settings-section-content="true" className="flex flex-col gap-3 border-t border-stone-100 bg-stone-50/35 p-3 dark:border-stone-700/50 dark:bg-stone-900/15">
                                  <div className="rounded-[14px] bg-white px-3.5 py-3 dark:bg-stone-900/45">
                                    <div className="flex items-start justify-between gap-4">
                                      <div className="min-w-0">
                                        <div className="text-[9px] font-semibold text-stone-400 dark:text-stone-500">当前账号</div>
                                        <div className="mt-1 truncate text-[12px] font-bold text-stone-800 dark:text-stone-100">
                                          {cloudAccount?.displayName || licenseStatus?.customer || '-'}
                                        </div>
                                        {cloudAccount?.email && (
                                          <div className="mt-0.5 truncate text-[10px] text-stone-400 dark:text-stone-500">{cloudAccount.email}</div>
                                        )}
                                      </div>
                                      <span className="shrink-0 rounded-[8px] bg-stone-100 px-2.5 py-1 text-[9px] font-bold text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                                        {isLicenseLoading ? '读取中' : LICENSE_STATE_LABELS[licenseStatus?.state || 'unlicensed']}
                                      </span>
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-3 border-t border-stone-100 pt-2.5 text-[10px] dark:border-stone-800">
                                      <div>
                                        <div className="text-stone-400 dark:text-stone-500">版本</div>
                                        <div className="mt-0.5 font-semibold text-stone-700 dark:text-stone-200">{licenseStatus?.edition ? LICENSE_EDITION_LABELS[licenseStatus.edition] : '-'}</div>
                                      </div>
                                      <div>
                                        <div className="text-stone-400 dark:text-stone-500">到期时间</div>
                                        <div className="mt-0.5 font-semibold tabular-nums text-stone-700 dark:text-stone-200">{licenseStatus?.expire_at || '-'}</div>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="rounded-[14px] border border-stone-200/80 bg-white p-3.5 dark:border-stone-700/70 dark:bg-stone-900/45">
                                    <div className="flex items-center justify-between gap-3">
                                      <span className="flex items-center gap-1.5 text-[10px] font-semibold text-stone-500 dark:text-stone-400">
                                        <Wallet className="h-3.5 w-3.5" /> 可用积分
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => void refreshCloudAccount()}
                                        disabled={isCloudAccountLoading}
                                        className="grid h-7 w-7 place-items-center rounded-[8px] text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 disabled:cursor-wait disabled:opacity-45 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                                        title="刷新账号额度"
                                        aria-label="刷新账号额度"
                                      >
                                        <RefreshCw className={`h-3.5 w-3.5 ${isCloudAccountLoading ? 'animate-spin' : ''}`} />
                                      </button>
                                    </div>
                                    <div className="mt-1 flex items-baseline gap-1.5">
                                      <span className="text-[22px] font-black leading-none tracking-[-0.03em] tabular-nums text-stone-900 dark:text-stone-50">
                                        {isCloudAccountLoading ? '读取中…' : cloudAccount ? formatCreditAmount(cloudAccount.wallet.availableCredits) : '—'}
                                      </span>
                                      {!isCloudAccountLoading && cloudAccount && (
                                        <span className="text-[9px] font-semibold text-stone-400 dark:text-stone-500">积分</span>
                                      )}
                                    </div>
                                    {cloudAccountSyncError && (
                                      <div className="mt-2 truncate text-[9px] font-semibold text-amber-600 dark:text-amber-300" title={cloudAccountSyncError}>
                                        同步失败，显示最近一次成功余额
                                      </div>
                                    )}
                                    <button
                                      type="button"
                                      onClick={openCloudCreditUsage}
                                      disabled={!cloudAccount || isCloudAccountLoading}
                                      className="group mt-3 flex min-h-9 w-full items-center justify-between gap-2 rounded-[10px] bg-stone-50 px-2.5 py-2 text-left transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-stone-800/70 dark:hover:bg-stone-800"
                                    >
                                      <span className="flex min-w-0 items-center gap-2 text-[10px] font-semibold text-stone-700 dark:text-stone-200">
                                        <History className="h-3.5 w-3.5 shrink-0 text-stone-400" />
                                        积分使用明细
                                      </span>
                                      <span className="flex shrink-0 items-center gap-0.5 text-[9px] font-medium text-stone-400 transition-colors group-hover:text-stone-600 dark:group-hover:text-stone-300">
                                        最近 50 条
                                        <ChevronRight className="h-3 w-3" />
                                      </span>
                                    </button>
                                    <div className="mt-3 text-[9px] font-semibold text-stone-400 dark:text-stone-500">兑换额度</div>
                                    <div className="mt-1.5 flex gap-1.5">
                                      <input
                                        value={creditRedemptionCode}
                                        onChange={event => {
                                          setCreditRedemptionCode(event.target.value.toUpperCase());
                                          setCreditRedemptionError('');
                                        }}
                                        onKeyDown={event => {
                                          if (event.key === 'Enter' && !isRedeemingCredits) void redeemCloudCredits();
                                        }}
                                        placeholder="输入额度兑换码"
                                        className="min-w-0 flex-1 rounded-[10px] border border-stone-200 bg-transparent px-3 py-1.5 text-[11px] font-medium text-stone-700 outline-none transition focus:border-stone-400 focus:ring-2 focus:ring-stone-200/70 dark:border-stone-700 dark:text-stone-100 dark:focus:border-stone-500 dark:focus:ring-stone-700/60"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => void redeemCloudCredits()}
                                        disabled={isRedeemingCredits || (creditRedemptionCode.trim().length < 10 && creditRedemptionCode.trim().toLowerCase() !== 'undesign')}
                                        className="shrink-0 rounded-[10px] bg-stone-900 px-3 py-1.5 text-[10px] font-bold text-white transition-colors hover:bg-stone-700 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
                                      >
                                        {isRedeemingCredits ? '兑换中' : '兑换'}
                                      </button>
                                      {isByokUnlocked && (
                                        <button
                                          type="button"
                                          onClick={() => void cancelByokCustomization()}
                                          className="shrink-0 rounded-[12px] border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-black text-stone-600 transition hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
                                        >
                                          取消自定义
                                        </button>
                                      )}
                                    </div>
                                    {creditRedemptionError && (
                                      <div className="text-[10px] leading-4 text-red-500 dark:text-red-300">{creditRedemptionError}</div>
                                    )}
                                  </div>

                                  {licenseStatus?.valid && licenseStatus.needs_email_registration === false && (
                                    <button
                                      type="button"
                                      onClick={confirmCloudAccountLogout}
                                      disabled={isCloudAccountLoggingOut}
                                      className="inline-flex min-h-8 self-end items-center justify-center gap-1.5 rounded-[9px] px-2.5 py-1.5 text-[10px] font-semibold text-stone-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-wait disabled:opacity-55 dark:text-stone-500 dark:hover:bg-red-400/10 dark:hover:text-red-300"
                                    >
                                      <LogOut className={`h-3.5 w-3.5 ${isCloudAccountLoggingOut ? 'animate-pulse' : ''}`} />
                                      {isCloudAccountLoggingOut ? '正在退出…' : '退出登录'}
                                    </button>
                                  )}

                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        <div data-settings-section="true" data-active={activeSettingCategory === 'system' ? 'true' : 'false'} className="bg-white/75 dark:bg-stone-800/75 rounded-[22px] border border-white/60 dark:border-stone-700/60 overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.04)] backdrop-blur-xl">
                          <button data-settings-section-trigger="true" onClick={() => setActiveSettingCategory(prev => prev === 'system' ? '' : 'system')} className="w-full flex items-center justify-between p-3 hover:bg-stone-50 dark:hover:bg-stone-700/50 transition-colors">
                            <span className="flex items-center gap-2 text-xs font-bold text-stone-700 dark:text-stone-200"><Settings className="w-4 h-4 text-purple-500"/> 高级与系统</span>
                            <ChevronDown className={`w-4 h-4 text-stone-400 transition-transform ${activeSettingCategory === 'system' ? 'rotate-180' : ''}`} />
                          </button>
                          <AnimatePresence>
                            {activeSettingCategory === 'system' && (
                              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} transition={{ duration: 0.15, ease: "easeOut" }} className="overflow-hidden will-change-transform">
                                <div data-settings-section-content="true" className="px-2.5 pb-3 pt-1.5 flex flex-col gap-1.5 border-t border-stone-100 dark:border-stone-700/50">
                                  <button
                                    type="button"
                                    disabled={isAutoStartChanging || platformCapabilities?.autoStart === false}
                                    onClick={() => void toggleAutoStartSetting()}
                                    className="group flex min-h-[42px] w-full items-center justify-between gap-3 rounded-[16px] border border-transparent px-2.5 py-2 text-left transition-all hover:border-stone-200/80 hover:bg-stone-50/85 active:scale-[0.995] disabled:cursor-wait disabled:opacity-70 dark:hover:border-stone-600/70 dark:hover:bg-stone-700/50"
                                    title={platformCapabilities?.autoStart === false ? 'macOS Preview 暂不支持开机自动启动' : '点击切换开机自动启动'}
                                  >
                                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-stone-600 dark:text-stone-300">
                                      <Power className="w-3.5 h-3.5 text-purple-500" /> 开机自动启动
                                    </span>
                                    <span className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ${
                                      isAutoStart
                                        ? 'bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800/50'
                                        : 'bg-stone-50 text-stone-500 border-stone-200 dark:bg-stone-700 dark:text-stone-300 dark:border-stone-600'
                                    }`}>
                                      {isAutoStart ? <Check className="w-3 h-3" /> : <Power className="w-3 h-3" />}
                                      {isAutoStartChanging ? '处理中' : (isAutoStart ? '已开启' : '已关闭')}
                                      <ChevronRight className="w-3 h-3 opacity-45 transition-transform group-hover:translate-x-0.5" />
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={toggleCalendarNotificationsSetting}
                                    className="group flex min-h-[42px] w-full items-center justify-between gap-3 rounded-[16px] border border-transparent px-2.5 py-2 text-left transition-all hover:border-stone-200/80 hover:bg-stone-50/85 active:scale-[0.995] dark:hover:border-stone-600/70 dark:hover:bg-stone-700/50"
                                    title="每天 10:00 和 15:00 提醒今天未完成日程"
                                  >
                                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-stone-600 dark:text-stone-300">
                                      <CalendarDays className="w-3.5 h-3.5 text-sky-500" /> 日程通知
                                    </span>
                                    <span className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ${
                                      calendarNotificationsEnabled
                                        ? 'bg-sky-50 text-sky-600 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800/50'
                                        : 'bg-stone-50 text-stone-500 border-stone-200 dark:bg-stone-700 dark:text-stone-300 dark:border-stone-600'
                                    }`}>
                                      {calendarNotificationsEnabled ? <Check className="w-3 h-3" /> : <Power className="w-3 h-3" />}
                                      {calendarNotificationsEnabled ? '已开启' : '已关闭'}
                                      <ChevronRight className="w-3 h-3 opacity-45 transition-transform group-hover:translate-x-0.5" />
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={toggleScreenshotAutoPinNoteSetting}
                                    className="group flex min-h-[42px] w-full items-center justify-between gap-3 rounded-[16px] border border-transparent px-2.5 py-2 text-left transition-all hover:border-stone-200/80 hover:bg-stone-50/85 active:scale-[0.995] dark:hover:border-stone-600/70 dark:hover:bg-stone-700/50"
                                    title="截图完成后自动创建并置顶桌面便签"
                                  >
                                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-stone-600 dark:text-stone-300">
                                      <StickyNote className="w-3.5 h-3.5 text-amber-500" /> 截图自动置顶便签
                                    </span>
                                    <span className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ${
                                      screenshotAutoPinNote
                                        ? 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/50'
                                        : 'bg-stone-50 text-stone-500 border-stone-200 dark:bg-stone-700 dark:text-stone-300 dark:border-stone-600'
                                    }`}>
                                      {screenshotAutoPinNote ? <Check className="w-3 h-3" /> : <Power className="w-3 h-3" />}
                                      {screenshotAutoPinNote ? '已开启' : '已关闭'}
                                      <ChevronRight className="w-3 h-3 opacity-45 transition-transform group-hover:translate-x-0.5" />
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={toggleTriggerMode}
                                    className="group flex min-h-[42px] w-full items-center justify-between gap-3 rounded-[16px] border border-transparent px-2.5 py-2 text-left transition-all hover:border-stone-200/80 hover:bg-stone-50/85 active:scale-[0.995] dark:hover:border-stone-600/70 dark:hover:bg-stone-700/50"
                                    title="点击切换侧边小条 / 悬浮方块"
                                  >
                                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-stone-600 dark:text-stone-300">
                                      {triggerMode === 'float' ? <LayoutGrid className="w-3.5 h-3.5 text-emerald-500" /> : <Move className="w-3.5 h-3.5 text-emerald-500" />}
                                      触发入口
                                    </span>
                                    <span className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ${triggerMode === 'float' ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/50' : 'bg-stone-50 text-stone-500 border-stone-200 dark:bg-stone-700 dark:text-stone-300 dark:border-stone-600'}`}>
                                      {triggerMode === 'float' ? '悬浮方块' : '侧边小条'}
                                      <ChevronRight className="w-3 h-3 opacity-45 transition-transform group-hover:translate-x-0.5" />
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={toggleDrawerWorkbenchMode}
                                    className="group flex min-h-[42px] w-full items-center justify-between gap-3 rounded-[16px] border border-transparent px-2.5 py-2 text-left transition-all hover:border-stone-200/80 hover:bg-stone-50/85 active:scale-[0.995] dark:hover:border-stone-600/70 dark:hover:bg-stone-700/50"
                                    title="开启后，抽屉按普通工作台窗口运行：显示在任务栏，不再自动缩回，并提供最小化、最大化和关闭按钮"
                                  >
                                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-stone-600 dark:text-stone-300">
                                      <Monitor className="w-3.5 h-3.5 text-sky-500" /> 抽屉工作台模式
                                    </span>
                                    <span className={'flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ' + (
                                      isDrawerWorkbenchMode
                                        ? 'bg-sky-50 text-sky-600 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800/50'
                                        : 'bg-stone-50 text-stone-500 border-stone-200 dark:bg-stone-700 dark:text-stone-300 dark:border-stone-600'
                                    )}>
                                      {isDrawerWorkbenchMode ? <Check className="w-3 h-3" /> : <Power className="w-3 h-3" />}
                                      {isDrawerWorkbenchMode ? '已开启' : '已关闭'}
                                      <ChevronRight className="w-3 h-3 opacity-45 transition-transform group-hover:translate-x-0.5" />
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={toggleCanvasWorkbenchMode}
                                    className="group flex min-h-[42px] w-full items-center justify-between gap-3 rounded-[16px] border border-transparent px-2.5 py-2 text-left transition-all hover:border-stone-200/80 hover:bg-stone-50/85 active:scale-[0.995] dark:hover:border-stone-600/70 dark:hover:bg-stone-700/50"
                                    title="开启后，进入画布时按普通工作台窗口运行：不再全局置顶，并显示最小化、最大化、关闭按钮"
                                  >
                                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-stone-600 dark:text-stone-300">
                                      <Monitor className="w-3.5 h-3.5 text-indigo-500" /> 画布工作台模式
                                    </span>
                                    <span className={'flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ' + (
                                      isCanvasWorkbenchMode
                                        ? 'bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800/50'
                                        : 'bg-stone-50 text-stone-500 border-stone-200 dark:bg-stone-700 dark:text-stone-300 dark:border-stone-600'
                                    )}>
                                      {isCanvasWorkbenchMode ? <Check className="w-3 h-3" /> : <Power className="w-3 h-3" />}
                                      {isCanvasWorkbenchMode ? '已开启' : '已关闭'}
                                      <ChevronRight className="w-3 h-3 opacity-45 transition-transform group-hover:translate-x-0.5" />
                                    </span>
                                  </button>
                                  <EagleImportSettings
                                    mode={eagleImportMode}
                                    status={eagleImportStatus}
                                    onModeChange={setEagleImportMode}
                                    onOnlineImport={() => void importFromEagle()}
                                    onOfflineImport={() => void importFromEagleLibrary()}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => { setShowStoragePath(true); setShowSettings(false); }}
                                    className="group flex min-h-[42px] w-full items-center justify-between gap-3 rounded-[16px] border border-transparent px-2.5 py-2 text-left transition-all hover:border-stone-200/80 hover:bg-stone-50/85 active:scale-[0.995] dark:hover:border-stone-600/70 dark:hover:bg-stone-700/50"
                                    title="点击查看和修改文件缓存路径"
                                  >
                                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-stone-600 dark:text-stone-300">
                                      <FolderOpen className="w-3.5 h-3.5 text-amber-500" /> 文件缓存路径
                                    </span>
                                    <span className="flex min-w-0 items-center gap-1.5 rounded-full border border-stone-200 bg-white/75 px-2.5 py-1 text-[10px] font-bold text-stone-500 dark:border-stone-600 dark:bg-stone-700/70 dark:text-stone-300">
                                      <span className="min-w-0 max-w-[128px] truncate text-right">{webImageCacheDir || '默认路径'}</span>
                                      <ChevronRight className="w-3 h-3 shrink-0 opacity-45 transition-transform group-hover:translate-x-0.5" />
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setShowQR(true); setShowSettings(false); }}
                                    className="group flex min-h-[42px] w-full items-center justify-between gap-3 rounded-[16px] border border-transparent px-2.5 py-2 text-left transition-all hover:border-stone-200/80 hover:bg-stone-50/85 active:scale-[0.995] dark:hover:border-stone-600/70 dark:hover:bg-stone-700/50"
                                    title="点击显示手机配对二维码"
                                  >
                                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-stone-600 dark:text-stone-300">
                                      <Smartphone className="w-3.5 h-3.5 text-blue-500" /> 手机配对通道
                                    </span>
                                    <span className="flex items-center gap-1 rounded-full border border-stone-200 bg-white/75 px-2.5 py-1 text-[10px] font-bold text-stone-600 dark:border-stone-600 dark:bg-stone-700/70 dark:text-stone-300">
                                      显示二维码
                                      <ChevronRight className="w-3 h-3 opacity-45 transition-transform group-hover:translate-x-0.5" />
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { setShowAboutSoftware(true); setShowSettings(false); }}
                                    className="group flex min-h-[42px] w-full items-center justify-between gap-3 rounded-[16px] border border-transparent px-2.5 py-2 text-left transition-all hover:border-stone-200/80 hover:bg-stone-50/85 active:scale-[0.995] dark:hover:border-stone-600/70 dark:hover:bg-stone-700/50"
                                    title="点击查看使用说明、更新日志和版本信息"
                                  >
                                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-stone-600 dark:text-stone-300">
                                      <Info className="w-3.5 h-3.5 text-violet-500" /> 关于软件
                                    </span>
                                    <span className="flex items-center gap-1 rounded-full border border-stone-200 bg-white/75 px-2.5 py-1 font-mono text-[10px] font-bold text-stone-500 dark:border-stone-600 dark:bg-stone-700/70 dark:text-stone-300">
                                      v{appVersion || '5.0.15'}
                                      <ChevronRight className="w-3 h-3 opacity-45 transition-transform group-hover:translate-x-0.5" />
                                    </span>
                                  </button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
</>
  );
}
