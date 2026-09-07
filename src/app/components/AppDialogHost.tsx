import { convertFileSrc } from '@tauri-apps/api/core';
import { AnimatePresence,motion } from 'framer-motion';
import { BookOpen,Brush,Check,ChevronLeft,ChevronRight,Circle,Crop,Eraser,Film,FolderOpen,History,Image as ImageIcon,Info,LayoutGrid,MessageCircle,Play,Plus,RefreshCw,RotateCcw,Smartphone,Sparkles,Square,X } from 'lucide-react';
import QRCode from 'react-qr-code';
import { DoodleBrushCursor } from '../../components/DoodleBrushCursor';
import { WorkflowDraftPanel } from '../../features/appAgent/components/WorkflowDraftPanel';
import { getCanvasDrawerMediaPreviewSource } from '../../features/canvasDrawerMedia';
import type { CanvasWorkflowImageNodeModeDraft } from '../../features/canvasTemplates';
import { getCanvasChatOffsetRight } from '../../features/chat/runtime/canvasChatVisibility';
import { formatCreditAmount,formatCreditUsageAmount,formatCreditUsageDate,formatCreditUsageDescription } from '../../features/cloudCreditUsage';
import { clamp } from '../../features/common';
import { platformShortcutLabel } from '../../platform/capabilities';
import { usePlatformCapabilities } from '../../platform/usePlatformCapabilities';

export type AppDialogHostScope = Record<string, any>;

export function AppDialogHost({ scope }: { scope: AppDialogHostScope }) {
  const { acceptUpdateLogAndClose, activateCanvasBrushTool, activateDoodleShortcutScope, activeDraftForDisplay, activeWorkflowDraftRef, addFolderMediaPickerItemToCanvas, applyCanvasBrushCrop, appVersion, CANVAS_BRUSH_COLORS, CANVAS_FOLDER_PICKER_SCROLL_EDGE, CANVAS_FOLDER_PICKER_VISIBLE_STEP, canvasAgent, canvasBrushBaseCanvasRef, canvasBrushCanvasRef, canvasBrushColor, canvasBrushCropRect, canvasBrushCursor, canvasBrushEditor, canvasBrushHistory, canvasBrushMode, canvasBrushOpacity, canvasBrushSize, canvasFolderImportPrompt, canvasFolderPickerError, canvasFolderPickerHasMore, canvasFolderPickerItems, canvasFolderPickerTotal, canvasFolderPickerVisibleCount, canvasShortcut, canvasToolbarTop, canvasWorkflowSaveDraft, checkAndInstallAppUpdate, chooseWebImageCacheDir, clearCanvasBrushCrop, clearCanvasBrushMarks, closeCanvasFolderMediaPicker, closeCanvasWorkflowSaveDialog, closeConfirmDialog, closeSelectedImagePreview, closeSelectedVideoPreview, closeTextInputDialog, closeUpdateLog, cloudAccount, confirmAddFolderMediaToCanvas, confirmDialog, confirmSaveCanvasWorkflow, copySelectedImagePreviewToClipboard, creditUsageError, creditUsageItems, doodleRootRef, finishCanvasBrushStroke, finishLaunchIntro, flashSelectedImageZoom, handleCanvasBrushPointerDown, handleCanvasBrushPointerMove, handleDoodleKeyDown, handleFloatingLayerPointerLeave, hideCanvasBrushCursor, isCanvasBrushShapeMode, isCanvasFolderPickerLoading, isCheckingAppUpdate, isCloudflaredDisclaimerAccepted, isCreditUsageLoading, keepDrawerOpenByPointer, loadCanvasFolderMediaPage, loadCloudCreditUsage, localIP, mobilePairUrl, resetWebImageCacheDir, saveCanvasBrushEditedImage, selectedImage, selectedImageGallery, selectedImagePan, selectedImagePanRef, selectedImageZoom, selectedVideo, setActiveDraftForDisplay, setActiveShortcutScope, setCanvasBrushColor, setCanvasBrushEditor, setCanvasBrushOpacity, setCanvasBrushSize, setCanvasFolderPickerVisibleCount, setCanvasWorkflowSaveDraft, setSelectedImagePan, setSelectedImageZoom, setShowAboutSoftware, setShowContact, setShowCreditUsage, setShowHelp, setShowQR, setShowStoragePath, setShowUpdateLog, setShowWorkflowDraftPanel, setTextInputDialog, showAboutSoftware, showContact, showCreditUsage, showHelp, showLaunchIntro, showQR, showSelectedImageZoom, showStoragePath, showToast, showUpdateLog, showWorkflowDraftPanel, startPreviewWindowDrag, startResizingCorner, startResizingHeight, startResizingRightCorner, startResizingWidth, startSelectedImagePanDrag, STARTUP_CONSENT_DELAY_MS, stepSelectedImageGallery, textInputDialog, textInputDialogCanConfirm, TextInputDialogIcon, textInputDialogInputRef, triggerShortcut, undoCanvasBrushStroke, updateCanvasBrushCursorFromEvent, visibleCanvasFolderPickerItems, webImageCacheDir } = scope;
  const platformCapabilities = usePlatformCapabilities();
  const autoUpdaterSupported = platformCapabilities?.autoUpdater === true;
  return (
<>
<AnimatePresence>
        {showCreditUsage && (
          <motion.div
            data-drawer-dialog-backdrop="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100130] flex items-center justify-center overflow-hidden rounded-[30px] bg-black/30 p-5 backdrop-blur-sm pointer-events-auto"
            onPointerEnter={keepDrawerOpenByPointer}
            onPointerMove={keepDrawerOpenByPointer}
            onPointerLeave={handleFloatingLayerPointerLeave}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setShowCreditUsage(false);
            }}
          >
            <motion.div
              data-drawer-dialog="true"
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 12 }}
              transition={{ type: 'tween', duration: 0.18, ease: 'easeOut' }}
              className="flex max-h-[76vh] w-full max-w-[390px] flex-col overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-2xl dark:border-stone-700 dark:bg-stone-900"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div data-drawer-dialog-header="true" className="flex shrink-0 items-center justify-between gap-3 border-b border-stone-100 px-5 py-4 dark:border-stone-800">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                    <History className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div data-drawer-dialog-title="true" className="truncate text-sm font-black text-stone-800 dark:text-stone-100">积分使用明细</div>
                    <div className="mt-0.5 text-[10px] font-medium text-stone-400 dark:text-stone-500">最近 50 条非零积分消耗记录</div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void loadCloudCreditUsage()}
                    disabled={isCreditUsageLoading}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 disabled:cursor-wait disabled:opacity-50 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                    title="刷新明细"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isCreditUsageLoading ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    data-drawer-dialog-close="true"
                    type="button"
                    onClick={() => setShowCreditUsage(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-red-500 dark:hover:bg-stone-800"
                    title="关闭"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="shrink-0 px-4 pt-4">
                <div className="flex items-center justify-between gap-4 rounded-[18px] border border-stone-200 bg-stone-50/75 px-3.5 py-3 dark:border-stone-800 dark:bg-stone-950/30">
                  <div>
                    <div className="text-[10px] font-bold text-stone-400 dark:text-stone-500">当前可用积分</div>
                    <div className="mt-0.5 text-xl font-black tabular-nums text-stone-800 dark:text-stone-100">{cloudAccount ? formatCreditAmount(cloudAccount.wallet.availableCredits) : '—'}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-bold text-stone-400 dark:text-stone-500">本次显示</div>
                    <div className="mt-0.5 text-xs font-black tabular-nums text-stone-600 dark:text-stone-300">{creditUsageItems.length} 条</div>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 [scrollbar-width:thin] [scrollbar-color:rgba(168,162,158,0.45)_transparent]">
                {isCreditUsageLoading && creditUsageItems.length === 0 ? (
                  <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-stone-400 dark:text-stone-500">
                    <RefreshCw className="h-5 w-5 animate-spin text-stone-500" />
                    <span className="text-[11px] font-bold">正在读取积分明细…</span>
                  </div>
                ) : creditUsageError ? (
                  <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-[18px] border border-stone-200 bg-stone-50/60 px-5 text-center dark:border-stone-800 dark:bg-stone-950/25">
                    <div className="text-[11px] leading-5 text-stone-600 dark:text-stone-300">{creditUsageError}</div>
                    <button
                      type="button"
                      onClick={() => void loadCloudCreditUsage()}
                      className="rounded-[12px] bg-stone-900 px-3 py-1.5 text-[10px] font-black text-white transition-colors hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
                    >
                      重新加载
                    </button>
                  </div>
                ) : creditUsageItems.length === 0 ? (
                  <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-stone-400 dark:text-stone-500">
                    <History className="h-6 w-6 opacity-60" />
                    <div className="text-[11px] font-bold">最近没有产生积分消耗</div>
                    <div className="text-[10px]">0 积分记录不会显示在这里</div>
                  </div>
                ) : (
                  <div className="grid gap-1.5">
                    {creditUsageItems.map((entry: any) => {
                      const description = formatCreditUsageDescription(entry.description);
                      return (
                        <div
                          key={entry.id}
                          className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 rounded-[16px] border border-stone-100 bg-stone-50/65 px-3 py-2.5 transition-colors hover:border-stone-200 hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-950/25 dark:hover:border-stone-700 dark:hover:bg-stone-950/40"
                        >
                          <div className="min-w-0">
                            <div className="text-[11px] font-black leading-4 text-stone-700 dark:text-stone-200">
                              <span className="font-black">{description.title}</span>
                            </div>
                            {description.details.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] font-medium leading-4 text-stone-500 dark:text-stone-400">
                                {description.details.map((detail: string) => (
                                  <span key={detail} className="whitespace-nowrap tabular-nums">{detail}</span>
                                ))}
                              </div>
                            )}
                            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[9px] font-medium text-stone-400 dark:text-stone-500">
                              <span>{formatCreditUsageDate(entry.createdAt)}</span>
                              <span className="h-0.5 w-0.5 rounded-full bg-stone-300 dark:bg-stone-600" />
                              <span className="tabular-nums">余额 {formatCreditAmount(entry.balanceAfter)}</span>
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-sm font-black tabular-nums text-stone-800 dark:text-stone-100">{formatCreditUsageAmount(entry.amount)}</div>
                            <div className="mt-0.5 text-[9px] font-bold text-stone-400 dark:text-stone-500">积分</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {canvasBrushEditor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100120] flex items-center justify-center p-4 pointer-events-auto"
            onPointerEnter={keepDrawerOpenByPointer}
            onPointerMove={keepDrawerOpenByPointer}
            onPointerLeave={handleFloatingLayerPointerLeave}
            onPointerDown={(event) => {
              keepDrawerOpenByPointer();
              if (event.target === event.currentTarget) setCanvasBrushEditor(null);
            }}
          >
            <motion.div
              ref={doodleRootRef}
              initial={{ y: 18, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 14, scale: 0.98 }}
              transition={{ type: 'tween', duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              data-no-drag="true"
              data-doodle-surface="true"
              tabIndex={-1}
              className="relative flex max-h-[92vh] w-full max-w-[1180px] overflow-hidden rounded-[28px] border border-stone-200/80 bg-white/96 text-stone-900 shadow-[0_24px_80px_rgba(15,23,42,0.20)] outline-none dark:border-white/12 dark:bg-stone-950/94 dark:text-white dark:shadow-[0_24px_80px_rgba(0,0,0,0.42)]"
              onPointerDown={(event) => {
                keepDrawerOpenByPointer();
                activateDoodleShortcutScope();
                doodleRootRef.current?.focus({ preventScroll: true });
                event.stopPropagation();
              }}
              onPointerEnter={activateDoodleShortcutScope}
              onPointerMove={updateCanvasBrushCursorFromEvent}
              onPointerLeave={(event) => {
                const nextTarget = event.relatedTarget;
                if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                  hideCanvasBrushCursor();
                  if (event.currentTarget.contains(document.activeElement)) return;
                  setActiveShortcutScope('canvas');
                }
              }}
              onFocus={activateDoodleShortcutScope}
              onBlur={(event) => {
                const nextTarget = event.relatedTarget;
                if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                  setActiveShortcutScope('canvas');
                }
              }}
              onKeyDown={handleDoodleKeyDown}
              onMouseDown={(event) => event.stopPropagation()}
              onWheel={(event) => event.stopPropagation()}
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-stone-200/70 px-4 dark:border-white/10">
                  <div className="flex min-w-0 items-center gap-2">
                    <Brush className="h-4 w-4 shrink-0 text-blue-500 dark:text-blue-300" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black">{canvasBrushEditor.name}</div>
                      <div className="text-[10px] font-bold text-stone-400 dark:text-white/40">
                        {canvasBrushEditor.width} x {canvasBrushEditor.height}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCanvasBrushEditor(null)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:text-white/48 dark:hover:bg-white/10 dark:hover:text-white"
                    title="关闭"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-stone-100 p-5 dark:bg-stone-950">
                  <div
                    className="relative overflow-hidden rounded-[18px] bg-white shadow-2xl shadow-stone-900/12 dark:shadow-black/35"
                    style={{
                      width: `min(${canvasBrushEditor.width}px, 100%, calc((92vh - 104px) * ${canvasBrushEditor.width / Math.max(1, canvasBrushEditor.height)}))`,
                      aspectRatio: `${canvasBrushEditor.width} / ${canvasBrushEditor.height}`,
                    }}
                  >
                    <img
                      src={canvasBrushEditor.baseDataUrl}
                      alt={canvasBrushEditor.name}
                      className="absolute inset-0 h-full w-full select-none object-contain"
                      draggable={false}
                    />
                    <canvas
                      ref={canvasBrushCanvasRef}
                      width={canvasBrushEditor.width}
                      height={canvasBrushEditor.height}
                      className="absolute inset-0 h-full w-full touch-none"
                      style={{
                        cursor: canvasBrushMode === 'brush' || canvasBrushMode === 'eraser'
                          ? 'none'
                          : canvasBrushMode === 'crop' ? 'crosshair' : 'crosshair',
                      }}
                      onPointerDown={handleCanvasBrushPointerDown}
                      onPointerEnter={updateCanvasBrushCursorFromEvent}
                      onPointerMove={handleCanvasBrushPointerMove}
                      onPointerUp={finishCanvasBrushStroke}
                      onPointerCancel={finishCanvasBrushStroke}
                      onPointerLeave={finishCanvasBrushStroke}
                    />
                    {canvasBrushMode === 'crop' && canvasBrushCropRect && (
                      <div
                        className="pointer-events-none absolute border-2 border-blue-500 bg-blue-400/10 shadow-[0_0_0_9999px_rgba(15,23,42,0.36)]"
                        style={{
                          left: `${(canvasBrushCropRect.x / canvasBrushEditor.width) * 100}%`,
                          top: `${(canvasBrushCropRect.y / canvasBrushEditor.height) * 100}%`,
                          width: `${(canvasBrushCropRect.width / canvasBrushEditor.width) * 100}%`,
                          height: `${(canvasBrushCropRect.height / canvasBrushEditor.height) * 100}%`,
                        }}
                      />
                    )}
                    <canvas ref={canvasBrushBaseCanvasRef} className="hidden" />
                  </div>
                </div>
              </div>
              <div className="flex w-[250px] shrink-0 flex-col gap-4 border-l border-stone-200/70 bg-stone-50/80 p-4 dark:border-white/10 dark:bg-white/[0.035]">
                <div className="grid grid-cols-3 gap-1.5 rounded-[16px] bg-stone-100 p-1 dark:bg-white/6">
                  {([
                    { mode: 'brush' as const, icon: Brush, label: '画笔' },
                    { mode: 'crop' as const, icon: Crop, label: '裁剪' },
                    { mode: 'eraser' as const, icon: Eraser, label: '橡皮' },
                    { mode: 'rectangle' as const, icon: Square, label: '矩形' },
                    { mode: 'circle' as const, icon: Circle, label: '圆形' },
                    { mode: 'ellipse' as const, icon: Circle, label: '椭圆' },
                  ]).map(option => {
                    const Icon = option.icon;
                    const active = canvasBrushMode === option.mode;
                    return (
                      <button
                        key={option.mode}
                        type="button"
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          activateCanvasBrushTool(option.mode);
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        className={`flex h-16 flex-col items-center justify-center gap-1 rounded-[13px] text-[10px] font-black transition-colors ${
                          active ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20 dark:bg-blue-500' : 'text-stone-500 hover:bg-white hover:text-stone-900 dark:text-white/56 dark:hover:bg-white/10 dark:hover:text-white'
                        }`}
                        title={option.label}
                      >
                        <Icon className={`h-4 w-4 ${option.mode === 'ellipse' ? 'scale-x-150' : ''}`} />
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                {canvasBrushMode === 'crop' ? (
                  <div className="grid gap-3 rounded-[18px] border border-blue-100 bg-blue-50/70 p-3 text-[11px] font-bold text-blue-800 dark:border-blue-400/18 dark:bg-blue-400/10 dark:text-blue-100">
                    <div className="flex items-center gap-2">
                      <Crop className="h-4 w-4 shrink-0" />
                      <span>拖动画面选择裁剪范围</span>
                    </div>
                    <div className="font-mono text-[10px] text-blue-700/70 dark:text-blue-100/60">
                      {canvasBrushCropRect
                        ? `${canvasBrushCropRect.width} x ${canvasBrushCropRect.height}`
                        : '未选择区域'}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={clearCanvasBrushCrop}
                        disabled={!canvasBrushCropRect}
                        className="flex h-9 items-center justify-center gap-1.5 rounded-[13px] bg-white/70 text-[11px] font-black text-blue-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-45 dark:bg-white/10 dark:text-blue-100 dark:hover:bg-white/14"
                      >
                        重选
                      </button>
                      <button
                        type="button"
                        onClick={applyCanvasBrushCrop}
                        disabled={!canvasBrushCropRect}
                        className="flex h-9 items-center justify-center gap-1.5 rounded-[13px] bg-blue-600 text-[11px] font-black text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-blue-500 dark:hover:bg-blue-400"
                      >
                        应用裁剪
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {isCanvasBrushShapeMode(canvasBrushMode) && (
                      <div className="rounded-[18px] border border-emerald-100 bg-emerald-50/70 p-3 text-[11px] font-bold leading-5 text-emerald-800 dark:border-emerald-400/18 dark:bg-emerald-400/10 dark:text-emerald-100">
                        拖动画面绘制填色形状，松手确认；颜色和不透明度会直接应用到形状填充。
                      </div>
                    )}
                    <div>
                      <div className="mb-2 flex items-center justify-between text-[11px] font-black text-stone-500 dark:text-white/68">
                        <span>颜色</span>
                        <span className="font-mono text-stone-400 dark:text-white/40">{canvasBrushColor.toUpperCase()}</span>
                      </div>
                      <div className="grid grid-cols-5 gap-2">
                        {CANVAS_BRUSH_COLORS.map((color: string) => (
                          <button
                            key={color}
                            type="button"
                            className={`h-8 rounded-[11px] border transition-transform hover:scale-105 ${
                              canvasBrushColor === color ? 'border-blue-500 ring-2 ring-blue-300/70 dark:border-white' : 'border-stone-200 dark:border-white/18'
                            }`}
                            style={{ backgroundColor: color }}
                            onClick={() => setCanvasBrushColor(color)}
                            title={color}
                          />
                        ))}
                      </div>
                    </div>

                    <label className="grid gap-2 text-[11px] font-black text-stone-500 dark:text-white/68">
                      <span className="flex items-center justify-between">
                        <span>{isCanvasBrushShapeMode(canvasBrushMode) ? '点按默认尺寸' : '笔刷大小'}</span>
                        <span className="font-mono text-stone-400 dark:text-white/40">{canvasBrushSize}px</span>
                      </span>
                      <input
                        type="range"
                        min={4}
                        max={120}
                        value={canvasBrushSize}
                        onChange={(event) => setCanvasBrushSize(Number(event.target.value) || 4)}
                        className="accent-blue-500"
                      />
                    </label>

                    <label className="grid gap-2 text-[11px] font-black text-stone-500 dark:text-white/68">
                      <span className="flex items-center justify-between">
                        <span>不透明度</span>
                        <span className="font-mono text-stone-400 dark:text-white/40">{Math.round(canvasBrushOpacity * 100)}%</span>
                      </span>
                      <input
                        type="range"
                        min={10}
                        max={100}
                        value={Math.round(canvasBrushOpacity * 100)}
                        onChange={(event) => setCanvasBrushOpacity(clamp((Number(event.target.value) || 10) / 100, 0.1, 1))}
                        className="accent-blue-500"
                      />
                    </label>
                  </>
                )}

                <div className="mt-auto grid gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={undoCanvasBrushStroke}
                      disabled={canvasBrushHistory.length <= 1}
                      className="flex h-9 items-center justify-center gap-1.5 rounded-[14px] bg-stone-100 text-[11px] font-black text-stone-600 transition-colors hover:bg-stone-200 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-35 dark:bg-white/8 dark:text-white/72 dark:hover:bg-white/12 dark:hover:text-white"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      撤销
                    </button>
                    <button
                      type="button"
                      onClick={clearCanvasBrushMarks}
                      className="flex h-9 items-center justify-center gap-1.5 rounded-[14px] bg-stone-100 text-[11px] font-black text-stone-600 transition-colors hover:bg-stone-200 hover:text-stone-900 dark:bg-white/8 dark:text-white/72 dark:hover:bg-white/12 dark:hover:text-white"
                    >
                      <Eraser className="h-3.5 w-3.5" />
                      清空
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => void saveCanvasBrushEditedImage()}
                    className="flex h-10 items-center justify-center gap-2 rounded-[15px] bg-blue-600 text-xs font-black text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-500 dark:bg-blue-500 dark:hover:bg-blue-400"
                  >
                    <Check className="h-4 w-4" />
                    保存为标记图
                  </button>
                </div>
              </div>
            </motion.div>
            <DoodleBrushCursor
              visible={canvasBrushCursor.visible && (canvasBrushMode === 'brush' || canvasBrushMode === 'eraser')}
              x={canvasBrushCursor.x}
              y={canvasBrushCursor.y}
              size={canvasBrushSize}
              scale={canvasBrushCursor.scale}
              color={canvasBrushColor}
              tool={canvasBrushMode === 'eraser' ? 'eraser' : 'brush'}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-[9998] rounded-[30px] overflow-hidden bg-black/45 backdrop-blur-sm flex items-center justify-center p-5 pointer-events-auto"
            onPointerDown={(e) => {
              if (e.button === 0 && e.target === e.currentTarget) {
                closeSelectedImagePreview();
                return;
              }
              if (e.button === 2) startPreviewWindowDrag(e);
            }}
            onMouseDown={(e) => {
              if (e.button === 0 && e.target === e.currentTarget) {
                closeSelectedImagePreview();
                return;
              }
              if (e.button === 2) startPreviewWindowDrag(e);
            }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <div className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-emerald-400/50 z-[10000] transition-colors" onMouseDown={e => e.stopPropagation()} onPointerDown={startResizingWidth} />
            <div className="absolute bottom-0 left-0 right-0 h-2 cursor-row-resize hover:bg-emerald-400/50 z-[10000] transition-colors" onMouseDown={e => e.stopPropagation()} onPointerDown={startResizingHeight} />
            <div className="absolute bottom-0 left-0 w-6 h-6 cursor-sw-resize hover:bg-emerald-400/50 z-[10001] transition-colors rounded-bl-[30px]" onMouseDown={e => e.stopPropagation()} onPointerDown={startResizingCorner} />
            <div className="absolute bottom-0 right-0 w-8 h-8 cursor-nwse-resize hover:bg-emerald-400/50 z-[10001] transition-colors rounded-br-[30px]" onMouseDown={e => e.stopPropagation()} onPointerDown={startResizingRightCorner} />

            <button
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); closeSelectedImagePreview(); }}
              className="absolute top-4 right-4 z-[10003] w-8 h-8 rounded-full bg-white dark:bg-stone-800 shadow-lg flex items-center justify-center text-stone-500 hover:text-red-500"
              title="关闭预览"
            >
              <X className="w-4 h-4" />
            </button>

            {selectedImageGallery && selectedImageGallery.items.length > 1 && (
              <>
                <button
                  type="button"
                  onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                  onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                  onClick={(event) => { event.preventDefault(); event.stopPropagation(); stepSelectedImageGallery(-1); }}
                  className="absolute left-5 top-1/2 z-[10003] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/92 text-stone-600 shadow-lg transition-colors hover:bg-white hover:text-stone-950 dark:bg-stone-800/92 dark:text-stone-200 dark:hover:bg-stone-700"
                  title="上一张（←）"
                  aria-label="上一张图片"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                  onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                  onClick={(event) => { event.preventDefault(); event.stopPropagation(); stepSelectedImageGallery(1); }}
                  className="absolute right-5 top-1/2 z-[10003] flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/92 text-stone-600 shadow-lg transition-colors hover:bg-white hover:text-stone-950 dark:bg-stone-800/92 dark:text-stone-200 dark:hover:bg-stone-700"
                  title="下一张（→）"
                  aria-label="下一张图片"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
                <span className="absolute bottom-4 left-5 z-[10003] rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold text-white/90 backdrop-blur-sm">
                  {selectedImageGallery.index + 1} / {selectedImageGallery.items.length}
                </span>
              </>
            )}

            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="relative w-full h-full pointer-events-auto flex items-center justify-center overflow-hidden rounded-[26px]"
              onPointerDown={(e) => {
                if (e.button === 0 && e.target === e.currentTarget) {
                  closeSelectedImagePreview();
                  return;
                }
                if (e.button === 2) {
                  startPreviewWindowDrag(e);
                  return;
                }
              }}
              onMouseDown={(e) => {
                if (e.button === 0 && e.target === e.currentTarget) {
                  closeSelectedImagePreview();
                  return;
                }
                if (e.button === 2) {
                  startPreviewWindowDrag(e);
                  return;
                }
              }}
              onContextMenu={(e) => e.preventDefault()}
              onWheel={(e) => {
                e.preventDefault();
                e.stopPropagation();
                flashSelectedImageZoom();
                setSelectedImageZoom((z: number) => clamp(z + (e.deltaY < 0 ? 0.12 : -0.12), 0.25, 5));
              }}
            >
              <AnimatePresence>
                {showSelectedImageZoom && (
                  <motion.button
                    initial={{ opacity: 0, y: 6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onClick={() => { setSelectedImageZoom(1); setSelectedImagePan({ x: 0, y: 0 }); selectedImagePanRef.current = { x: 0, y: 0 }; flashSelectedImageZoom(); }}
                    className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[10002] rounded-full bg-white/90 dark:bg-stone-800/90 shadow-lg px-3 py-1 text-[11px] font-mono text-stone-600 dark:text-stone-200 hover:bg-white dark:hover:bg-stone-700"
                    title="重置缩放"
                  >
                    {Math.round(selectedImageZoom * 100)}%
                  </motion.button>
                )}
              </AnimatePresence>
              <img
                src={selectedImage}
                alt="图片预览"
                decoding="async"
                className="max-w-full max-h-full w-auto h-auto rounded-[28px] shadow-2xl object-contain bg-white/10 cursor-grab active:cursor-grabbing select-none"
                style={{
                  transform: selectedImageZoom === 1 && selectedImagePan.x === 0 && selectedImagePan.y === 0
                    ? 'none'
                    : `translate(${Math.round(selectedImagePan.x)}px, ${Math.round(selectedImagePan.y)}px) scale(${selectedImageZoom})`,
                  transformOrigin: 'center center',
                  imageRendering: 'auto',
                  backfaceVisibility: 'hidden',
                }}
                draggable={false}
                onPointerDown={(e) => {
                  if (e.button === 2) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  if (e.button === 0) {
                    startSelectedImagePanDrag(e);
                    return;
                  }
                  e.stopPropagation();
                }}
                onMouseDown={(e) => {
                  if (e.button === 2) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                  }
                  if (e.button === 0) {
                    startSelectedImagePanDrag(e);
                    return;
                  }
                  e.stopPropagation();
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void copySelectedImagePreviewToClipboard();
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedVideo && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 rounded-[30px] overflow-hidden z-[9998] bg-black/45 backdrop-blur-sm flex items-center justify-center p-5 pointer-events-auto"
            onPointerDown={(event) => {
              if (event.button === 0 && event.target === event.currentTarget) {
                event.preventDefault();
                event.stopPropagation();
                closeSelectedVideoPreview();
                return;
              }
              if (event.button === 2) startPreviewWindowDrag(event);
            }}
            onMouseDown={(event) => {
              if (event.button === 0 && event.target === event.currentTarget) {
                event.preventDefault();
                event.stopPropagation();
                closeSelectedVideoPreview();
                return;
              }
              if (event.button === 2) startPreviewWindowDrag(event);
            }}
            onContextMenu={(event) => event.preventDefault()}
          >
            <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} className="relative w-full max-w-3xl" onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
              <button
                onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                onClick={(event) => { event.preventDefault(); event.stopPropagation(); closeSelectedVideoPreview(); }}
                className="absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full bg-white dark:bg-stone-800 shadow-lg flex items-center justify-center text-stone-500 hover:text-red-500"
              >
                <X className="w-4 h-4" />
              </button>
              <video
                src={selectedVideo.url || convertFileSrc(selectedVideo.path)}
                controls
                autoPlay
                className="w-full max-h-[calc(100vh-72px)] rounded-[28px] shadow-2xl bg-black"
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {canvasFolderImportPrompt && (
          <motion.div
            data-canvas-floating-layer="true"
            data-canvas-folder-picker="true"
            initial={{ opacity: 0, scale: 0.96, x: -6 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.96, x: -6 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="fixed z-[100120] w-[286px] overflow-hidden rounded-[18px] border border-blue-200/70 bg-white/96 p-2.5 text-stone-700 shadow-2xl shadow-black/15 backdrop-blur-xl pointer-events-auto dark:border-blue-400/20 dark:bg-stone-950/96 dark:text-stone-100"
            style={{
              left: Math.min(canvasFolderImportPrompt.x, Math.max(78, window.innerWidth - 306)),
              top: Math.min(canvasFolderImportPrompt.y, Math.max(12, window.innerHeight - 430)),
            }}
            onPointerEnter={keepDrawerOpenByPointer}
            onPointerMove={keepDrawerOpenByPointer}
            onPointerLeave={handleFloatingLayerPointerLeave}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div data-canvas-folder-picker-header="true" className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span data-canvas-folder-picker-icon="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200">
                  <FolderOpen className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-xs font-black">{canvasFolderImportPrompt.folderName}</div>
                  <div className="text-[10px] font-medium text-stone-400 dark:text-stone-500">
                    {isCanvasFolderPickerLoading && canvasFolderPickerTotal === 0
                      ? '正在读取图片和视频…'
                      : `${canvasFolderPickerTotal} 个图片或视频`}
                  </div>
                </div>
              </div>
              <button
                type="button"
                data-canvas-folder-picker-close="true"
                onClick={closeCanvasFolderMediaPicker}
                className="rounded-full p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-red-500 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-red-300"
                title="关闭"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <button
              type="button"
              data-canvas-folder-picker-primary="true"
              onClick={confirmAddFolderMediaToCanvas}
              disabled={canvasFolderPickerItems.length === 0}
              className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-[13px] bg-blue-500 text-[11px] font-black text-white shadow-sm shadow-blue-500/20 transition-colors hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400 disabled:shadow-none dark:disabled:bg-stone-800 dark:disabled:text-stone-500"
            >
              <Plus className="h-3.5 w-3.5" />
              已加载素材加入画布（{canvasFolderPickerItems.length}）
            </button>

            <div
              data-canvas-folder-picker-scroll="true"
              className="mt-2 max-h-[320px] overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              onScroll={(event) => {
                const target = event.currentTarget;
                if (target.scrollTop + target.clientHeight < target.scrollHeight - CANVAS_FOLDER_PICKER_SCROLL_EDGE) return;
                const nextVisibleCount = Math.min(
                  canvasFolderPickerItems.length,
                  canvasFolderPickerVisibleCount + CANVAS_FOLDER_PICKER_VISIBLE_STEP,
                );
                setCanvasFolderPickerVisibleCount(nextVisibleCount);
                if (nextVisibleCount >= canvasFolderPickerItems.length && canvasFolderPickerHasMore) {
                  void loadCanvasFolderMediaPage(canvasFolderImportPrompt.folderId);
                }
              }}
            >
              <div className="grid grid-cols-3 gap-1.5">
                {visibleCanvasFolderPickerItems.map((item: any) => {
                  const preview = getCanvasDrawerMediaPreviewSource(item)
                    || (item.type === 'image' && item.path ? convertFileSrc(item.path) : '');
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-canvas-folder-picker-item="true"
                      onClick={() => addFolderMediaPickerItemToCanvas(item.id)}
                      className="group relative aspect-square overflow-hidden rounded-[12px] border border-stone-200/70 bg-stone-100 shadow-sm transition hover:border-blue-300 hover:ring-2 hover:ring-blue-200/70 dark:border-white/10 dark:bg-stone-900 dark:hover:border-blue-300/50 dark:hover:ring-blue-300/20"
                      title={item.name || item.content || '加入画布'}
                    >
                      {preview ? (
                        <img
                          src={preview}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center bg-stone-100 text-stone-400 dark:bg-stone-900 dark:text-stone-500">
                          {item.type === 'video' ? <Film className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}
                        </span>
                      )}
                      {item.type === 'video' && (
                        <span className="pointer-events-none absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white shadow-sm">
                          <Play className="h-3 w-3 fill-current" />
                        </span>
                      )}
                      <span className="absolute inset-x-0 bottom-0 hidden bg-black/58 px-1 py-1 text-[9px] font-bold text-white group-hover:block">
                        <span className="block truncate">{item.name || item.content || '加入画布'}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {isCanvasFolderPickerLoading && canvasFolderPickerItems.length === 0 && (
                <div className="py-8 text-center text-[10px] font-bold text-stone-400 dark:text-stone-500">
                  正在按需加载素材…
                </div>
              )}
              {canvasFolderPickerError && (
                <button
                  type="button"
                  onClick={() => void loadCanvasFolderMediaPage(
                    canvasFolderImportPrompt.folderId,
                    canvasFolderPickerItems.length === 0,
                  )}
                  className="my-2 w-full rounded-[10px] bg-stone-100 px-2 py-2 text-center text-[10px] font-black text-stone-600 transition-colors hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                >
                  {canvasFolderPickerError}
                </button>
              )}
              {!canvasFolderPickerError && visibleCanvasFolderPickerItems.length < canvasFolderPickerItems.length && (
                <div className="py-2 text-center text-[10px] font-bold text-stone-400 dark:text-stone-500">
                  继续向下浏览（{visibleCanvasFolderPickerItems.length}/{canvasFolderPickerTotal}）
                </div>
              )}
              {!canvasFolderPickerError
                && visibleCanvasFolderPickerItems.length >= canvasFolderPickerItems.length
                && canvasFolderPickerHasMore && (
                <div className="py-2 text-center text-[10px] font-bold text-stone-400 dark:text-stone-500">
                  {isCanvasFolderPickerLoading
                    ? `正在加载更多（${canvasFolderPickerItems.length}/${canvasFolderPickerTotal}）`
                    : `继续向下滚动加载更多（${canvasFolderPickerItems.length}/${canvasFolderPickerTotal}）`}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Workflow Draft Panel */}
      {showWorkflowDraftPanel && (activeDraftForDisplay ?? activeWorkflowDraftRef.current) && (
        <WorkflowDraftPanel
          draft={(activeDraftForDisplay ?? activeWorkflowDraftRef.current)!}
          onUpdate={(patch) => {
            if (!activeWorkflowDraftRef.current) return;
            const updated = { ...activeWorkflowDraftRef.current, ...patch };
            activeWorkflowDraftRef.current = updated;
            setActiveDraftForDisplay(updated);  // 触发 re-render，panel 立即响应
          }}
          onSave={() => {
            void canvasAgent.sendMessage('保存这个工作流');
            setShowWorkflowDraftPanel(false);
          }}
          onDiscard={() => {
            setShowWorkflowDraftPanel(false);
          }}
        />
      )}

      <AnimatePresence>
        {canvasWorkflowSaveDraft && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] rounded-[30px] overflow-hidden bg-black/15 backdrop-blur-[2px] pointer-events-auto"
            onPointerEnter={keepDrawerOpenByPointer}
            onPointerMove={keepDrawerOpenByPointer}
            onPointerLeave={handleFloatingLayerPointerLeave}
            onMouseDown={(event) => { if (event.button === 0) closeCanvasWorkflowSaveDialog(); }}
          >
            <motion.form
              initial={{ opacity: 0, x: 8, y: '-50%', scale: 0.98 }}
              animate={{ opacity: 1, x: 0, y: '-50%', scale: 1 }}
              exit={{ opacity: 0, x: 8, y: '-50%', scale: 0.98 }}
              data-canvas-template-panel="true"
              style={{
                position: 'absolute',
                top: canvasToolbarTop,
                right: getCanvasChatOffsetRight(100),
              }}
              data-canvas-chat-offset-base="100"
              className="max-h-[calc(100vh-80px)] w-[520px] overflow-y-auto rounded-[16px] border border-stone-200 bg-white p-4 shadow-[0_18px_48px_rgba(15,23,42,0.16)] dark:border-stone-700 dark:bg-stone-900"
              onMouseDown={(event) => event.stopPropagation()}
              onSubmit={(event) => {
                event.preventDefault();
                confirmSaveCanvasWorkflow();
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-black text-stone-800 dark:text-stone-100">
                  <BookOpen className="h-4 w-4 text-emerald-500" />
                  保存工作流
                </div>
                <button
                  type="button"
                  onClick={closeCanvasWorkflowSaveDialog}
                  className="rounded-full p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-red-500 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-red-300"
                  title="关闭"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-2 text-xs leading-5 text-stone-500 dark:text-stone-400">
                将当前选中的 {canvasWorkflowSaveDraft.nodes.length} 个节点封装成一个工作流模块，之后可右键模块再展开修改。
              </p>
              <label className="mt-3 block">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-stone-400 dark:text-stone-500">名称</span>
                <input
                  data-no-drag="true"
                  autoFocus
                  value={canvasWorkflowSaveDraft.label}
                  maxLength={32}
                  onChange={(event) => setCanvasWorkflowSaveDraft((prev: any) => prev ? { ...prev, label: event.target.value } : prev)}
                  placeholder={canvasWorkflowSaveDraft.defaultLabel}
                  className="h-10 w-full rounded-[16px] border border-stone-200/80 bg-stone-50/80 px-3 text-sm font-bold text-stone-700 outline-none transition focus:border-emerald-300 focus:bg-white focus:ring-2 focus:ring-emerald-200/55 dark:border-stone-700 dark:bg-stone-950/44 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:border-emerald-500/60 dark:focus:bg-stone-950 dark:focus:ring-emerald-900/35"
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-black text-stone-500 dark:text-stone-400">
                <span className="rounded-full bg-stone-100 px-2 py-1 dark:bg-white/10">{canvasWorkflowSaveDraft.aiCount} 个生图节点</span>
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200">{canvasWorkflowSaveDraft.fixedImageCount} 张固定图</span>
                <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700 dark:bg-blue-400/10 dark:text-blue-200">{canvasWorkflowSaveDraft.fixedTextCount} 段固定文字</span>
                <span className="rounded-full bg-stone-100 px-2 py-1 dark:bg-white/10">{canvasWorkflowSaveDraft.externalInputIds.length} 个外部输入</span>
              </div>
              {Object.entries(canvasWorkflowSaveDraft.imageNodeModes || {} as Record<string, any>).length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-wide text-stone-400 dark:text-stone-500">
                    内部图片行为
                  </div>
                  {Object.entries(canvasWorkflowSaveDraft.imageNodeModes || {} as Record<string, any>).map(([nodeId, config]: [string, any], imageIndex) => {
                    const node = canvasWorkflowSaveDraft.nodes.find((candidate: any) => candidate.id === nodeId);
                    const updateConfig = (patch: Partial<CanvasWorkflowImageNodeModeDraft>) => {
                      setCanvasWorkflowSaveDraft((prev: any) => prev ? {
                        ...prev,
                        imageNodeModes: {
                          ...(prev.imageNodeModes || {}),
                          [nodeId]: {
                            ...(prev.imageNodeModes?.[nodeId] || config),
                            ...patch,
                          },
                        },
                      } : prev);
                    };
                    return (
                      <div
                        key={nodeId}
                        className="rounded-[14px] border border-stone-200/80 bg-stone-50/72 p-3 dark:border-white/[0.08] dark:bg-white/[0.035]"
                      >
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-[11px] font-black text-stone-700 dark:text-white/72">
                            {node?.item.name || `图片节点 ${imageIndex + 1}`}
                          </span>
                          <select
                            data-no-drag="true"
                            value={config.mode}
                            onChange={(event) => updateConfig({
                              mode: event.target.value as CanvasWorkflowImageNodeModeDraft['mode'],
                            })}
                            className="h-8 rounded-[10px] border border-stone-200 bg-white px-2 text-[10px] font-bold text-stone-600 outline-none dark:border-white/10 dark:bg-stone-950 dark:text-white/70"
                          >
                            <option value="normal">普通内部节点</option>
                            <option value="fixed">不可替换固定图</option>
                            <option value="internal_slot">可替换内部槽位</option>
                            <option value="external_bridge">外部参考图输入</option>
                          </select>
                        </div>
                        {config.mode === 'internal_slot' && (
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <input
                              data-no-drag="true"
                              value={config.label || ''}
                              onChange={(event) => updateConfig({ label: event.target.value })}
                              placeholder="槽位名称"
                              className="h-8 rounded-[10px] border border-stone-200 bg-white px-2 text-[10px] font-semibold outline-none dark:border-white/10 dark:bg-stone-950"
                            />
                            <input
                              data-no-drag="true"
                              value={config.slotId || ''}
                              onChange={(event) => updateConfig({
                                slotId: event.target.value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80),
                              })}
                              placeholder="槽位 ID"
                              className="h-8 rounded-[10px] border border-stone-200 bg-white px-2 font-mono text-[10px] outline-none dark:border-white/10 dark:bg-stone-950"
                            />
                            <input
                              data-no-drag="true"
                              value={config.role || ''}
                              onChange={(event) => updateConfig({ role: event.target.value })}
                              placeholder="参考职责 role（任意文本）"
                              className="h-8 rounded-[10px] border border-stone-200 bg-white px-2 text-[10px] font-semibold outline-none dark:border-white/10 dark:bg-stone-950"
                            />
                            <input
                              data-no-drag="true"
                              value={config.emptyHint || ''}
                              onChange={(event) => updateConfig({ emptyHint: event.target.value })}
                              placeholder="空状态提示"
                              className="h-8 rounded-[10px] border border-stone-200 bg-white px-2 text-[10px] font-semibold outline-none dark:border-white/10 dark:bg-stone-950"
                            />
                            <label className="flex items-center gap-1.5 text-[10px] font-bold text-stone-500 dark:text-white/52">
                              <input
                                type="checkbox"
                                checked={config.required === true}
                                onChange={(event) => updateConfig({ required: event.target.checked })}
                              />
                              必填
                            </label>
                            <label className="flex items-center gap-1.5 text-[10px] font-bold text-stone-500 dark:text-white/52">
                              <input
                                type="checkbox"
                                checked={config.multiple === true}
                                onChange={(event) => updateConfig({
                                  multiple: event.target.checked,
                                  maxItems: event.target.checked ? Math.max(2, Number(config.maxItems) || 4) : 1,
                                })}
                              />
                              允许多图
                            </label>
                            {config.multiple && (
                              <label className="flex items-center gap-2 text-[10px] font-bold text-stone-500 dark:text-white/52">
                                最多
                                <input
                                  type="number"
                                  min={1}
                                  max={12}
                                  value={config.maxItems || 4}
                                  onChange={(event) => updateConfig({
                                    maxItems: clamp(Number(event.target.value) || 1, 1, 12),
                                  })}
                                  className="h-7 w-16 rounded-[8px] border border-stone-200 bg-white px-2 text-[10px] outline-none dark:border-white/10 dark:bg-stone-950"
                                />
                                张
                              </label>
                            )}
                            <label className="flex items-center gap-1.5 text-[10px] font-bold text-stone-500 dark:text-white/52">
                              <input
                                type="checkbox"
                                checked={config.keepDefault === true}
                                onChange={(event) => updateConfig({ keepDefault: event.target.checked })}
                              />
                              保留当前图为默认值
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeCanvasWorkflowSaveDialog}
                  className="rounded-[16px] bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-600 transition-colors hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={!canvasWorkflowSaveDraft.label.trim()}
                  className="rounded-[16px] bg-emerald-500 px-3 py-1.5 text-xs font-black text-white shadow-sm shadow-emerald-500/20 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400 dark:bg-emerald-400 dark:text-stone-950 dark:hover:bg-emerald-300 dark:disabled:bg-white/10 dark:disabled:text-white/35"
                >
                  保存并封装
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {textInputDialog.isOpen && (
          <motion.div
            data-drawer-dialog-backdrop="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            data-canvas-floating-layer="true"
            className="fixed inset-0 z-[100230] flex items-center justify-center overflow-hidden rounded-[30px] bg-black/28 p-5 backdrop-blur-sm pointer-events-auto"
            onPointerEnter={keepDrawerOpenByPointer}
            onPointerMove={keepDrawerOpenByPointer}
            onPointerLeave={handleFloatingLayerPointerLeave}
            onMouseDown={(event) => {
              if (event.button === 0 && event.target === event.currentTarget) closeTextInputDialog(null);
            }}
          >
            <motion.form
              data-drawer-dialog="true"
              initial={{ scale: 0.96, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 12 }}
              transition={{ type: 'tween', duration: 0.18, ease: 'easeOut' }}
              className="w-full max-w-[380px] overflow-hidden rounded-[26px] border border-stone-200/80 bg-white/95 p-4 text-stone-900 shadow-[0_24px_80px_rgba(15,23,42,0.24)] backdrop-blur-2xl dark:border-white/10 dark:bg-stone-950/94 dark:text-stone-50"
              onMouseDown={(event) => event.stopPropagation()}
              onSubmit={(event) => {
                event.preventDefault();
                const value = textInputDialog.value.trim();
                if (!value) return;
                closeTextInputDialog(value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  closeTextInputDialog(null);
                }
              }}
            >
              <div data-drawer-dialog-header="true" className="flex items-start gap-3">
                <div data-drawer-dialog-icon="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[15px] bg-stone-900 text-white shadow-sm shadow-stone-900/15 dark:bg-white dark:text-stone-950">
                  <TextInputDialogIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 data-drawer-dialog-title="true" className="truncate text-sm font-black text-stone-900 dark:text-stone-50">{textInputDialog.title}</h3>
                  {textInputDialog.description && (
                    <p className="mt-1 text-[11px] font-medium leading-5 text-stone-500 dark:text-stone-400">
                      {textInputDialog.description}
                    </p>
                  )}
                </div>
                <button
                  data-drawer-dialog-close="true"
                  type="button"
                  onClick={() => closeTextInputDialog(null)}
                  className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:text-white/45 dark:hover:bg-white/10 dark:hover:text-white"
                  title="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <input
                data-drawer-dialog-field="true"
                ref={textInputDialogInputRef}
                value={textInputDialog.value}
                onChange={(event) => setTextInputDialog((prev: any) => ({ ...prev, value: event.target.value }))}
                placeholder={textInputDialog.placeholder}
                spellCheck={false}
                className="mt-4 h-11 w-full rounded-[18px] border border-stone-200/80 bg-stone-50/80 px-3 text-sm font-bold text-stone-900 outline-none transition-all placeholder:text-stone-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/12 dark:border-white/10 dark:bg-white/[0.06] dark:text-stone-50 dark:placeholder:text-white/30 dark:focus:border-blue-300/60 dark:focus:bg-white/[0.08]"
              />

              <div className="mt-4 flex justify-end gap-2">
                <button
                  data-drawer-dialog-secondary="true"
                  type="button"
                  onClick={() => closeTextInputDialog(null)}
                  className="rounded-[16px] bg-stone-100 px-3.5 py-2 text-xs font-bold text-stone-600 transition-colors hover:bg-stone-200 dark:bg-white/8 dark:text-stone-300 dark:hover:bg-white/12"
                >
                  取消
                </button>
                <button
                  data-drawer-dialog-primary="true"
                  type="submit"
                  disabled={!textInputDialogCanConfirm}
                  className="inline-flex items-center gap-1.5 rounded-[16px] bg-blue-600 px-4 py-2 text-xs font-black text-white shadow-sm shadow-blue-500/20 transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400 disabled:shadow-none dark:bg-blue-500 dark:hover:bg-blue-400 dark:disabled:bg-white/10 dark:disabled:text-white/35"
                >
                  <Check className="h-3.5 w-3.5" />
                  {textInputDialog.confirmLabel}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmDialog.isOpen && (
          <motion.div data-drawer-dialog-backdrop="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-canvas-floating-layer="true" className="fixed inset-0 z-[100220] rounded-[30px] overflow-hidden bg-black/30 backdrop-blur-sm flex items-center justify-center p-6 pointer-events-auto" onPointerEnter={keepDrawerOpenByPointer} onPointerMove={keepDrawerOpenByPointer} onPointerLeave={handleFloatingLayerPointerLeave} onMouseDown={(event) => { if (event.button === 0) closeConfirmDialog(); }}>
            <motion.div data-drawer-dialog="true" initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }} className="w-full max-w-[320px] rounded-[28px] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-2xl p-4" onMouseDown={(event) => event.stopPropagation()}>
              <h3 data-drawer-dialog-title="true" className="text-sm font-bold text-stone-800 dark:text-stone-100">{confirmDialog.title || '确认操作'}</h3>
              <p className="mt-2 text-xs leading-5 text-stone-500 dark:text-stone-400">{confirmDialog.message || '确定继续吗？'}</p>
              <div className="mt-4 flex justify-end gap-2">
                <button data-drawer-dialog-secondary="true" onClick={closeConfirmDialog} className="px-3 py-1.5 rounded-[16px] text-xs bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">取消</button>
                {(confirmDialog.actions && confirmDialog.actions.length > 0
                  ? confirmDialog.actions
                  : [{
                    label: '确定',
                    onClick: confirmDialog.onConfirm,
                    className: 'rounded-[16px] bg-red-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-600',
                  }]
                ).map((action: any, index: number) => (
                  <button
                    key={`${action.label}-${index}`}
                    onClick={() => {
                      void Promise.resolve(action.onClick()).catch((err) => {
                        console.warn('确认操作失败:', err);
                        showToast('操作失败');
                      });
                    }}
                    title={action.title}
                    className={action.className || 'rounded-[16px] bg-red-500 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-600'}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showQR && (
          <motion.div data-drawer-dialog-backdrop="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[9997] rounded-[30px] overflow-hidden bg-black/30 backdrop-blur-sm flex items-center justify-center p-6 pointer-events-auto" onPointerEnter={keepDrawerOpenByPointer} onPointerMove={keepDrawerOpenByPointer} onPointerLeave={handleFloatingLayerPointerLeave} onMouseDown={() => { setShowQR(false); }}>
            <motion.div data-drawer-dialog="true" initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }} className="w-full max-w-[300px] rounded-[28px] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-2xl p-5 text-center" onMouseDown={e => e.stopPropagation()}>
              <div data-drawer-dialog-header="true" className="flex items-center justify-between mb-3">
                <span data-drawer-dialog-title="true" className="text-sm font-bold text-stone-800 dark:text-stone-100 flex items-center gap-1.5"><Smartphone className="w-4 h-4 text-emerald-500" /> 手机配对</span>
                <button data-drawer-dialog-close="true" onClick={() => { setShowQR(false); }} className="text-stone-400 hover:text-red-500"><X className="w-4 h-4" /></button>
              </div>
              <div className="mx-auto w-fit p-3 rounded-[20px] bg-white">
                <QRCode value={mobilePairUrl || (localIP ? `http://${localIP}:1420/pair` : 'inspiration-drawer')} size={160} />
              </div>
              <p className="mt-3 text-xs text-stone-500 dark:text-stone-400 break-all">{mobilePairUrl ? `手机与电脑同一网络下扫码访问：${mobilePairUrl}` : (localIP ? `正在启动手机连接服务：${localIP}` : '正在获取本机 IP...')}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLaunchIntro && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.22, delay: 0.18, ease: 'easeOut' }}
            className="fixed inset-0 z-[9998] rounded-[30px] overflow-hidden bg-stone-950/35 backdrop-blur-xl flex items-center justify-center p-6 pointer-events-auto"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.32, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
              data-drawer-launch-intro="true"
              className="relative w-full max-w-[380px] overflow-hidden rounded-[32px] bg-white/92 dark:bg-stone-900/94 border border-white/70 dark:border-stone-700/70 shadow-2xl p-5"
              onMouseDown={e => e.stopPropagation()}
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-stone-200/80 dark:bg-stone-700/80 overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-amber-300 via-emerald-300 to-blue-300"
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: STARTUP_CONSENT_DELAY_MS / 1000, ease: 'linear' }}
                />
              </div>

              <div className="flex items-start gap-3 pt-1">
                <div className="w-12 h-12 rounded-[20px] bg-amber-100/95 dark:bg-amber-200/90 border border-amber-200/80 flex items-center justify-center shadow-lg shadow-amber-200/30 shrink-0">
                  <LayoutGrid className="w-5 h-5 text-amber-700" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-600 dark:text-amber-300">Welcome Back</p>
                      <h2 className="mt-1 text-lg font-black text-stone-900 dark:text-stone-50">灵感抽屉 v{appVersion || '6.0.20'}</h2>
                    </div>
                    <button onClick={(event) => finishLaunchIntro(event, false)} className="p-2 rounded-full text-stone-400 hover:text-red-500 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors" title="暂不同意免责声明">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">启动时从侧边滑出，15 秒后自动进入抽屉；未关闭即视为同意本软件免责声明。</p>
                </div>
              </div>

              <div className="mt-5 space-y-2.5 text-xs leading-5 text-stone-600 dark:text-stone-300">
                <div className="rounded-[20px] bg-stone-50/90 dark:bg-stone-800/70 border border-stone-100 dark:border-stone-700/70 p-3">
                  <p className="font-bold text-stone-800 dark:text-stone-100 mb-1">本次更新</p>
                  <p>优化图片保存逻辑：画布参考图只保留在画布，需要时仍可主动保存到素材抽屉。</p>
                  <p className="mt-1">素材卡片按图片或视频的实际比例显示，并自动补齐瀑布流空位。</p>
                  <p className="mt-1">滑动到底部会自动加载更多素材，无需再手动点击。</p>
                </div>
                <div className="rounded-[20px] bg-stone-50/90 dark:bg-stone-800/70 border border-stone-100 dark:border-stone-700/70 p-3">
                  <p className="font-bold text-stone-800 dark:text-stone-100 mb-1">免责说明</p>
                  <p>本软件不提供生图服务，只是 API 接口工具。</p>
                  <p className="mt-1">用户使用自己的 API 时，请遵守相关网站的用户协议。</p>
                  <p className="mt-1">关闭本弹窗表示暂不同意，15 秒未关闭或点击下方按钮视为同意。</p>
                </div>
              </div>

              <button onClick={(event) => finishLaunchIntro(event, true)} className="mt-5 w-full py-2.5 rounded-[22px] bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 text-xs font-black shadow-lg hover:scale-[1.01] active:scale-[0.98] transition-transform">
                同意并进入抽屉
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showStoragePath && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9997] rounded-[30px] overflow-hidden bg-black/25 backdrop-blur-sm flex items-center justify-center p-6 pointer-events-auto"
            onPointerEnter={keepDrawerOpenByPointer}
            onPointerMove={keepDrawerOpenByPointer}
            onPointerLeave={handleFloatingLayerPointerLeave}
            onMouseDown={() => setShowStoragePath(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-[360px] rounded-[28px] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-2xl p-5"
              onMouseDown={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-stone-800 dark:text-stone-100 flex items-center gap-1.5"><FolderOpen className="w-4 h-4 text-amber-500" /> 文件缓存路径</span>
                <button onClick={() => setShowStoragePath(false)} className="text-stone-400 hover:text-red-500"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-3 text-xs leading-5 text-stone-600 dark:text-stone-300">
                <div className="rounded-[18px] border border-stone-200/80 bg-stone-50/80 p-3 dark:border-stone-700 dark:bg-stone-800/70">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400 dark:text-stone-500">当前路径</p>
                  <p className="break-all font-mono text-[11px] text-stone-700 dark:text-stone-200">{webImageCacheDir || '使用默认缓存目录'}</p>
                </div>
                <p className="text-[11px] leading-5 text-stone-500 dark:text-stone-400">
                  拖入的本地文件、图片、视频和网页图片都会复制/缓存到这里；卡片打开和定位会指向缓存副本。
                </p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void chooseWebImageCacheDir()}
                  className="rounded-[18px] bg-stone-900 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
                >
                  修改路径
                </button>
                <button
                  type="button"
                  onClick={() => void resetWebImageCacheDir()}
                  className="rounded-[18px] border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-600 transition-colors hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
                >
                  恢复默认
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAboutSoftware && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9997] rounded-[30px] overflow-hidden bg-black/25 backdrop-blur-sm flex items-center justify-center p-6 pointer-events-auto"
            onPointerEnter={keepDrawerOpenByPointer}
            onPointerMove={keepDrawerOpenByPointer}
            onPointerLeave={handleFloatingLayerPointerLeave}
            onMouseDown={() => setShowAboutSoftware(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-[360px] rounded-[28px] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-2xl p-5"
              onMouseDown={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-stone-800 dark:text-stone-100 flex items-center gap-1.5"><Info className="w-4 h-4 text-violet-500" /> 关于软件</span>
                <button onClick={() => setShowAboutSoftware(false)} className="text-stone-400 hover:text-red-500"><X className="w-4 h-4" /></button>
              </div>
              <div className="divide-y divide-stone-200/70 overflow-hidden rounded-[20px] border border-stone-200/70 bg-stone-50/75 dark:divide-stone-700/70 dark:border-stone-700 dark:bg-stone-800/55">
                <div className="flex items-center justify-between gap-3 px-3 py-3">
                  <span className="flex items-center gap-2 text-xs font-medium text-stone-600 dark:text-stone-300">
                    <BookOpen className="h-4 w-4 text-blue-500" /> 使用说明
                  </span>
                  <button
                    type="button"
                    onClick={() => { setShowAboutSoftware(false); setShowHelp(true); }}
                    className="rounded-full border border-stone-200 bg-white px-3 py-1 text-[11px] font-medium text-stone-600 transition-colors hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-200 dark:hover:bg-stone-600"
                  >
                    查看
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-3">
                  <span className="flex items-center gap-2 text-xs font-medium text-stone-600 dark:text-stone-300">
                    <Sparkles className="h-4 w-4 text-amber-500" /> 更新日志
                  </span>
                  <button
                    type="button"
                    onClick={() => { setShowAboutSoftware(false); setShowUpdateLog(true); }}
                    className="rounded-full border border-stone-200 bg-white px-3 py-1 text-[11px] font-medium text-stone-600 transition-colors hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-200 dark:hover:bg-stone-600"
                  >
                    查看
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-3">
                  <span className="flex items-center gap-2 text-xs font-medium text-stone-600 dark:text-stone-300">
                    <MessageCircle className="h-4 w-4 text-sky-500" /> 微信联系
                  </span>
                  <button
                    type="button"
                    onClick={() => { setShowAboutSoftware(false); setShowContact(true); }}
                    className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-medium text-sky-700 transition-colors hover:bg-sky-100 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-200 dark:hover:bg-sky-400/15"
                  >
                    查看二维码
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-3">
                  <span className="flex items-center gap-2 text-xs font-medium text-stone-600 dark:text-stone-300">
                    <RefreshCw className="h-4 w-4 text-emerald-500" /> 版本号
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-bold text-stone-500 dark:text-stone-400">v{appVersion || '5.0.15'}</span>
                    <button
                      type="button"
                      onClick={() => void checkAndInstallAppUpdate({ silent: false })}
                      disabled={isCheckingAppUpdate || !autoUpdaterSupported}
                      title={!autoUpdaterSupported ? '当前平台暂不支持自动更新' : undefined}
                      className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-60 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-200 dark:hover:bg-emerald-400/15"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isCheckingAppUpdate ? 'animate-spin' : ''}`} />
                      {isCheckingAppUpdate ? '检查中' : '检查更新'}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showContact && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9997] rounded-[30px] overflow-hidden bg-black/30 backdrop-blur-sm flex items-center justify-center p-6 pointer-events-auto"
            onPointerEnter={keepDrawerOpenByPointer}
            onPointerMove={keepDrawerOpenByPointer}
            onPointerLeave={handleFloatingLayerPointerLeave}
            onMouseDown={() => setShowContact(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-[330px] rounded-[28px] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-2xl p-5 text-center"
              onMouseDown={event => event.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-stone-800 dark:text-stone-100 flex items-center gap-1.5">
                  <MessageCircle className="w-4 h-4 text-sky-500" /> 微信联系
                </span>
                <button onClick={() => setShowContact(false)} className="text-stone-400 hover:text-red-500" aria-label="关闭联系方式">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="mx-auto w-fit rounded-[22px] border border-sky-100 bg-white p-3 shadow-sm">
                <img
                  src="/contact-wechat-qr.png"
                  alt="微信联系方式二维码"
                  width={654}
                  height={645}
                  draggable={false}
                  className="h-[220px] w-[220px] select-none object-contain"
                />
              </div>
              <p className="mt-3 text-xs font-semibold text-stone-700 dark:text-stone-200">使用微信扫码添加</p>
              <p className="mt-1 text-[11px] leading-5 text-stone-500 dark:text-stone-400">产品咨询、商务合作与售后支持</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHelp && (
          <motion.div data-drawer-dialog-backdrop="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 rounded-[30px] overflow-hidden z-[9997] bg-black/30 backdrop-blur-sm flex items-center justify-center p-6 pointer-events-auto" onPointerEnter={keepDrawerOpenByPointer} onPointerMove={keepDrawerOpenByPointer} onPointerLeave={handleFloatingLayerPointerLeave} onMouseDown={() => setShowHelp(false)}>
            <motion.div data-drawer-dialog="true" initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }} className="w-full max-w-[360px] rounded-[28px] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-2xl p-5" onMouseDown={e => e.stopPropagation()}>
              <div data-drawer-dialog-header="true" className="flex items-center justify-between mb-3">
                <span data-drawer-dialog-title="true" className="text-sm font-bold text-stone-800 dark:text-stone-100 flex items-center gap-1.5"><BookOpen className="w-4 h-4 text-blue-500" /> 使用说明</span>
                <button data-drawer-dialog-close="true" onClick={() => setShowHelp(false)} className="text-stone-400 hover:text-red-500"><X className="w-4 h-4" /></button>
              </div>
              <div className="max-h-[62vh] overflow-y-auto pr-1 space-y-4 text-xs leading-5 text-stone-600 dark:text-stone-300 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-stone-300 dark:[&::-webkit-scrollbar-thumb]:bg-stone-700 [&::-webkit-scrollbar-thumb]:rounded-full">
                <section className="space-y-1.5">
                  <h3 className="text-[12px] font-bold text-stone-800 dark:text-stone-100">基础功能</h3>
                  <p>把本地文件、图片、视频、PPT、文件夹拖进抽屉，可以作为临时素材暂存。文件夹只保存路径，不会展开里面的文件。</p>
                  <p>本地文件、图片和视频会复制到缓存路径，卡片右上角可复制、另存、在文件夹中显示；网页图片也会缓存为本地副本。</p>
                  <p>如果本地源文件还在，“在文件夹中显示”会优先定位原文件；源文件被删后会定位缓存副本。</p>
                  <p>点击图片进入大图预览；点击视频可以直接在抽屉里播放；点击普通文件会使用系统默认软件打开。卡片也可以拖出到支持文件拖放的应用。</p>
                </section>

                <section className="space-y-1.5">
                  <h3 className="text-[12px] font-bold text-stone-800 dark:text-stone-100">抽屉与触发入口</h3>
                  <p>抽屉支持“侧边小条”和“悬浮方块”两种入口，可在设置里切换，也可用 <span className="font-semibold">{platformShortcutLabel(triggerShortcut)}</span> 快速切换。</p>
                  <p>侧边小条默认在右侧中间：悬停展开；按住左键经过不会误触发；<span className="font-semibold">{platformShortcutLabel('Ctrl + 鼠标左键拖动')}</span> 可上下移动小条。</p>
                  <p>悬浮方块默认在右下角：悬停 0.8 秒展开；按住左键可拖动位置；拖入文件/网页图会自动展开抽屉。</p>
                  <p>拖动抽屉标题栏可以移动抽屉位置，移动后会自动进入钉住状态；点击右上角收回按钮后，抽屉会回到触发边并恢复自动缩回。</p>
                  <p>左边缘、底边和左下角可以拖动调整抽屉宽高；鼠标离开抽屉后，如果没有钉住或预览内容，抽屉会自动缩回。</p>
                </section>

                <section className="space-y-1.5">
                  <h3 className="text-[12px] font-bold text-stone-800 dark:text-stone-100">分类与整理</h3>
                  <p>左侧栏可以创建收纳夹，把卡片拖到收纳夹上即可归类。双击收纳夹名称可重命名，鼠标悬停可删除收纳夹。</p>
                  <p>进入多选模式后，可以批量导出到本地、移动到已有/新建分类文件夹，或批量删除。</p>
                  <p>文本卡片双击正文即可编辑；鼠标悬停任意卡片后按 <span className="font-semibold">{platformShortcutLabel('Ctrl + C')}</span> 可直接复制该卡片内容。</p>
                  <p>搜索会同时匹配文件名、路径、文本内容和备注，适合快速找回临时素材。</p>
                </section>

                <section className="space-y-1.5">
                  <h3 className="text-[12px] font-bold text-stone-800 dark:text-stone-100">桌面便签</h3>
                  <p>鼠标悬停卡片后，点击右上角的便签按钮，可以把图片、文本、视频或文件固定成独立桌面便签；原卡片仍保留在抽屉里。</p>
                  <p>便签可以同时打开多个。单击并拖动便签非编辑区域可以移动位置；右下角手柄可调整窗口大小；滚轮可以缩放便签内容。</p>
                  <p>文字便签单击正文进入编辑，修改会同步回抽屉里的原文本卡片；悬浮按钮可切换颜色，也可转为日程便签。</p>
                  <p>右键便签可打开抽屉或关闭当前便签，鼠标进入便签时会显示置顶按钮；关闭后仍可在抽屉左侧便签栏重新显示。</p>
                </section>

                <section className="space-y-1.5">
                  <h3 className="text-[12px] font-bold text-stone-800 dark:text-stone-100">截图与手机传输</h3>
                  <p>点击相机按钮或使用截图快捷键后，框选区域即可截图。截图会先显示占位卡片，保存完成后自动替换成真实图片，并自动复制到剪贴板；“截图自动置顶便签”默认关闭，可在高级与系统设置中开启。</p>
                  <p>手机配对需要手机和电脑在同一局域网。打开二维码后，用手机 App 扫码连接，即可从手机发送文字、图片和文件到电脑抽屉。</p>
                </section>

                <section className="space-y-1.5">
                  <h3 className="text-[12px] font-bold text-stone-800 dark:text-stone-100">快捷键</h3>
                  <p><span className="font-semibold text-stone-800 dark:text-stone-100">{platformShortcutLabel('Alt + G')}</span>：切换防误触模式。开启后抽屉会锁定，避免鼠标靠边误触。</p>
                  <p><span className="font-semibold text-stone-800 dark:text-stone-100">F1</span>：快速截图。</p>
                  <p><span className="font-semibold text-stone-800 dark:text-stone-100">{platformShortcutLabel('Alt + T')}</span>：打开快速文字记录。</p>
                  <p><span className="font-semibold text-stone-800 dark:text-stone-100">{platformShortcutLabel('Alt + E')}</span>：新增桌面便签。</p>
                  <p><span className="font-semibold text-stone-800 dark:text-stone-100">{platformShortcutLabel(canvasShortcut)}</span>：切换无限画布 / 普通抽屉。</p>
                  <p><span className="font-semibold text-stone-800 dark:text-stone-100">{platformShortcutLabel('Alt + S')}</span>：打开搜索栏。</p>
                  <p><span className="font-semibold text-stone-800 dark:text-stone-100">{platformShortcutLabel('Alt + Q')}</span>：切换侧边小条 / 悬浮方块。</p>
                  <p><span className="font-semibold text-stone-800 dark:text-stone-100">{platformShortcutLabel('Ctrl + C')}</span>：鼠标悬停卡片时复制该卡片内容。</p>
                  <p>以上全局快捷键都可以在设置里重新录制和修改。</p>
                </section>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showUpdateLog && (
          <motion.div data-drawer-dialog-backdrop="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[9996] rounded-[30px] overflow-hidden bg-black/20 backdrop-blur-sm flex items-center justify-center p-6 pointer-events-auto" onPointerEnter={keepDrawerOpenByPointer} onPointerMove={keepDrawerOpenByPointer} onPointerLeave={handleFloatingLayerPointerLeave} onMouseDown={closeUpdateLog}>
            <motion.div data-drawer-dialog="true" initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }} className="w-full max-w-[360px] rounded-[28px] bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 shadow-2xl p-5" onMouseDown={e => e.stopPropagation()}>
              <div data-drawer-dialog-header="true" className="flex items-center justify-between mb-3">
                <span data-drawer-dialog-title="true" className="text-sm font-bold text-stone-800 dark:text-stone-100 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-amber-500" /> 更新日志</span>
                <button data-drawer-dialog-close="true" onClick={closeUpdateLog} className="text-stone-400 hover:text-red-500"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-2 text-xs leading-5 text-stone-600 dark:text-stone-300">
                <p className="font-bold text-stone-800 dark:text-stone-100">v6.0.20</p>
                <p>优化画布生成节点的模型、比例、清晰度、格式和数量切换，减少选择后的界面卡顿。</p>
                <p>优化生成结果落地、缩略图回填和抽屉同步，生成完成后画布操作更加流畅。</p>
                <p>钱包参考图改为直接上传 COS，并兼容不同渠道返回的参考图字段。</p>
                <p>减少钱包余额的重复同步，同时保留最近一次可用余额缓存。</p>
                <div className="rounded-[18px] border border-amber-200/80 bg-amber-50/80 p-3 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
                  <p className="font-bold">免责说明</p>
                  <p className="mt-1">本软件不提供生图服务，只是 API 接口工具。用户使用自己的 API 时，请遵守相关网站的用户协议。</p>
                  <p className="mt-1">{isCloudflaredDisclaimerAccepted ? '当前已同意本软件免责声明。' : '点击下方按钮后，将视为同意本软件免责声明。'}</p>
                </div>
              </div>
              <button data-drawer-dialog-primary="true" onClick={acceptUpdateLogAndClose} className="mt-4 w-full py-2 rounded-[20px] bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900 text-xs font-bold">
                {isCloudflaredDisclaimerAccepted ? '知道了' : '同意并知道了'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
</>
  );
}
