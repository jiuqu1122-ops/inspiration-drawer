import { File as FileIcon,Film,Image as ImageIcon,LayoutGrid,Link,Music,Upload } from 'lucide-react';
import { CanvasNodeRenderGate } from '../../../components/CanvasNodeRenderGate';
import { canUseCanvasItemAsAiInput,canUseCanvasItemAsAiTarget,getCanvasInputTargetLabel,getCanvasWorkflowTemplateFromNode } from '../../../utils/canvasItemSelectors';
import { isSeedanceLikeVideoModel } from '../../canvasAiImage';
import { normalizeCanvasWorkflowUserInput } from '../../canvasWorkflowUserInput';
import { shouldExitThreeSceneInteraction } from '../../three/model/threeSceneInteraction';
import { CanvasNodeLayer } from './CanvasNodeLayer';
import type { CanvasImageItem,CanvasItemBox,CanvasResizeCorner } from '../../canvasModel';

type CanvasRenderConnection = { source: CanvasImageItem; target: CanvasImageItem };
type CanvasRenderGroup = { id: string; name: string; itemIds: string[]; bounds: CanvasItemBox };


export type CanvasWorkbenchScope = Record<string, any>;

export function CanvasWorkbench({ scope }: { scope: CanvasWorkbenchScope }) {
  const { activeThreeSceneId, activeThreeSceneIdRef, analyzeCanvasThreeSceneNode, assignSelectedImagesToCanvasWorkflowSlot, autoScrollCanvasNearEdge, beginThreeSceneInteraction, blockInternalCanvasNativeDrag, cancelCanvasEnhancementEstimate, CANVAS_CONNECTION_HANDLE_OUTSET, CANVAS_TEXT_CONTEXT_ROUTING_OPTIONS, canvasAgent, canvasAiCloudImageModels, canvasAiCredentialSource, canvasAiExpandedOutputNodeIds, canvasAiPromptEditingId, canvasAiPromptTextAreaRefs, canvasAiProvider, canvasAiUnifiedImageModelOptions, canvasConnectedSourceIds, canvasConnectedTargetIds, canvasConnectionDraft, canvasConnectionDraftPath, canvasConnectionsForRender, canvasContentRef, canvasGroupOutlinesForRender, canvasHoveredItemIdRef, canvasInputActionDraft, canvasInputActionDraftPath, canvasInputMenuForId, canvasInputPickTargetId, canvasInputPickTargetIdRef, canvasInteractionSurfaceRectRef, canvasItems, canvasItemsById, canvasPanRef, canvasPromptOptimizingId, canvasReferenceDragState, canvasReferenceReplaceTarget, canvasReferenceSuppressClickRef, canvasRenderableItems, canvasRenderScale, canvasScaledNodeRadius, canvasScaledSelectionRadius, canvasSelectedBounds, canvasSelectedIdsRef, canvasSelectedIdsSet, canvasSelectionOverlayRef, canvasSingleSelectedBoxForRender, canvasSingleSelectedItemForRender, canvasSize, canvasSizerRef, canvasSurfaceRef, canvasTextAgentRunningIds, canvasTextAreaRefs, canvasTextOutputAreaRefs, canvasUploadInputRef, canvasWorkflowFileInputRef, canvasWorkflowSingleEditGroupIds, canvasWorkflowTemplates, canvasWorkingTimerTick, captureThreeSceneView, chooseLocalAudiosForCanvasGenerator, chooseLocalFilesForCanvasWorkflow, chooseLocalImagesForCanvasGenerator, chooseLocalImagesForCanvasWorkflowSlot, chooseLocalVideosForCanvasGenerator, commitCanvasAiPromptDraft, commitCanvasTextDraft, commitCanvasTextOutputDraft, connectSelectedCanvasItemsToGenerator, copyCanvasAiOutputToCanvas, copyCanvasImageToSystemClipboard, copyCanvasTextOutput, DESIGN_AGENT_ARTIFACT_OPTIONS, DESIGN_AGENT_ROLE_OPTIONS, DESIGN_AGENT_THINKING_MODE_OPTIONS, disconnectCanvasInput, downloadBufferItems, enableCanvasWorkflowSingleEditForItem, endThreeSceneInteraction, exitThreeSceneInteraction, getCanvasAiErrorSummary, getCanvasAiNodeDesignSizeForItem, getCanvasAiResolvedModel, getCanvasAiUnifiedImageModelValue, getCanvasImageInputBufferItemsForNode, getCanvasItemRenderedBox, getStableCanvasImageSource, handleCanvasAiRunClick, handleCanvasAiRunPointerDown, handleCanvasDrop, handleCanvasGeneratorUpload, handleCanvasWorkflowFileUpload, handleCanvasWorkflowSlotDrop, isCanvasChromeHidden, isCanvasMode, isCanvasPointerInsideRef, isCanvasSpacePressedRef, isDark, lastCanvasDragClientRef, openCanvasBrushEditor, openCanvasBrushEditorFromSource, openCanvasContextMenu, openCanvasCreateMenu, openCanvasReferenceAddMenu, openCanvasReferenceReplaceMenu, openSelectedImagePreview, openSelectedVideoPreview, optimizeCanvasPrompt, pendingCanvasFusionRoleRef, preventCanvasNativeDrag, removeCanvasConnection, removeCanvasItemsByIds, renameCanvasGroup, replaceCanvasWorkflowSlotAssets, resizeCanvasAiPromptEditor, retryCanvasWorkflowOutput, rotateCanvasImageClockwise, runCanvasTextAgentNode, scheduleCanvasAiPromptDraftCommit, scheduleCanvasTextDraftCommit, scheduleCanvasTextOutputDraftCommit, setCanvasAiPromptEditingId, setCanvasContextMenu, setCanvasDesignAgentConfig, setCanvasInputMenuForId, setCanvasInputPickTargetId, setCanvasReferenceReplacement, setCanvasSpacePressed, setCanvasTextContextRouting, setCanvasTextNodeMode, setCanvasWorkflowOutputMode, showToast, startCanvasConnectionDrag, startCanvasGroupResize, startCanvasInputActionDrag, startCanvasItemDrag, startCanvasItemResize, startCanvasPan, startCanvasReferenceLongPress, startCanvasSelection, startPickCanvasImageForGenerator, startPreviewWindowDrag, threeSceneAnalyzingIds, toggleCanvasAiOutputsExpanded, toggleCanvasImageRule, toggleCanvasImageRulePanel, updateCanvasAiGeneratorData, updateCanvasSelection, updateCollapsedCanvasWorkflowSlot, updateThreeScenePreview, updateThreeSceneReferenceOverlay, updateThreeSceneSpec, WORKFLOW_SLOT_ASSET_DRAG_MIME } = scope;
  return (
<>
{isCanvasMode && (
                    <div
                      ref={canvasSurfaceRef}
                      data-canvas-surface="true"
                      tabIndex={-1}
                      className={`relative min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain bg-[radial-gradient(circle_at_1px_1px,rgba(113,113,122,0.16)_1px,transparent_0)] bg-[length:26px_26px] bg-stone-50 outline-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:bg-stone-950 ${isCanvasChromeHidden ? 'rounded-none border-0' : 'rounded-[18px] border border-stone-200 dark:border-stone-800'}`}
                      style={{
                        touchAction: 'auto',
                        overflowAnchor: 'none',
                        contain: 'layout paint style',
                        willChange: 'scroll-position',
                      }}
                      onPointerEnter={(event) => {
                        isCanvasPointerInsideRef.current = true;
                        canvasInteractionSurfaceRectRef.current = event.currentTarget.getBoundingClientRect();
                      }}
                      onPointerLeave={() => {
                        isCanvasPointerInsideRef.current = false;
                        if (!canvasPanRef.current) setCanvasSpacePressed(false);
                      }}
                      onPointerDown={(e) => {
                        setCanvasContextMenu(null);
                        setCanvasInputMenuForId(null);
                        const pointerTarget = e.target as HTMLElement | null;
                        if (shouldExitThreeSceneInteraction(
                          activeThreeSceneIdRef.current,
                          Boolean(pointerTarget?.closest('[data-three-scene-interactive="true"]')),
                        )) {
                          exitThreeSceneInteraction();
                        }
                        if (e.button === 2 && e.altKey) {
                          startPreviewWindowDrag(e);
                          return;
                        }
                        if (canvasInputPickTargetIdRef.current) {
                          e.preventDefault();
                          e.stopPropagation();
                          showToast('请选择画布里的图片，Esc 取消');
                          return;
                        }
                        if (isCanvasSpacePressedRef.current || e.button === 1 || (e.button === 0 && e.shiftKey)) startCanvasPan(e);
                        else startCanvasSelection(e);
                      }}
                      onDoubleClick={openCanvasCreateMenu}
                      onContextMenu={(e) => {
                        if (e.altKey) {
                          e.preventDefault();
                          e.stopPropagation();
                          return;
                        }
                        const target = e.target as HTMLElement | null;
                        if (target?.closest('[data-canvas-item-id], [data-no-drag="true"], textarea, input, button, select, [contenteditable="true"]')) return;
                        openCanvasContextMenu(e, 'canvas');
                      }}
                      onDragEnter={(e) => {
                        blockInternalCanvasNativeDrag(e);
                        if (e.defaultPrevented) return;
                        e.preventDefault();
                        e.stopPropagation();
                        lastCanvasDragClientRef.current = { x: e.clientX, y: e.clientY };
                        e.dataTransfer.dropEffect = 'copy';
                      }}
                      onDragOver={(e) => {
                        blockInternalCanvasNativeDrag(e);
                        if (e.defaultPrevented) return;
                        e.preventDefault();
                        e.stopPropagation();
                        lastCanvasDragClientRef.current = { x: e.clientX, y: e.clientY };
                        autoScrollCanvasNearEdge(e);
                        e.dataTransfer.dropEffect = 'copy';
                      }}
                      onDrop={handleCanvasDrop}
                    >
                      <input
                        ref={canvasUploadInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleCanvasGeneratorUpload}
                      />
                      <input
                        ref={canvasWorkflowFileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleCanvasWorkflowFileUpload}
                      />
                      {canvasInputPickTargetId && (() => {
                        const target = canvasItemsById.get(canvasInputPickTargetId);
                        const allowVideoReference = (
                          target?.ai?.type === 'frame-interpolation'
                          || target?.ai?.type === 'video-enhancement'
                          || (target?.ai?.type === 'video-generator' && target.ai.videoInputMode !== 'FLF')
                        );
                        return (
                          <div
                            data-no-drag="true"
                            className="fixed left-1/2 top-5 z-[100090] flex -translate-x-1/2 items-center gap-2 rounded-full border border-cyan-200/70 bg-stone-950/86 px-3 py-2 text-[11px] font-bold text-white shadow-[0_12px_32px_rgba(0,0,0,0.24)] backdrop-blur-xl"
                          >
                            {allowVideoReference ? <Film className="h-3.5 w-3.5 text-emerald-300" /> : <ImageIcon className="h-3.5 w-3.5 text-cyan-300" />}
                            {pendingCanvasFusionRoleRef.current?.targetId === canvasInputPickTargetId
                              ? pendingCanvasFusionRoleRef.current.role === 'BASE'
                                ? '点击画布图片设置为基图'
                                : '点击画布图片设置为意向图'
                              : allowVideoReference ? '点击画布图片/视频作为输入' : '点击画布图片作为输入'}
                            <button
                              type="button"
                              className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-white/70 hover:bg-white/16 hover:text-white"
                              onClick={() => {
                                pendingCanvasFusionRoleRef.current = null;
                                setCanvasInputPickTargetId(null);
                              }}
                            >
                              取消
                            </button>
                          </div>
                        );
                      })()}
                      <div
                        ref={canvasSizerRef}
                        className="relative"
                        style={{
                          width: canvasSize.width * canvasRenderScale,
                          height: canvasSize.height * canvasRenderScale,
                          overflowAnchor: 'none',
                        }}
                      >
                        <div
                          ref={canvasContentRef}
                          data-canvas-content-layer="true"
                          className="relative"
                          style={{
                            width: canvasSize.width,
                            height: canvasSize.height,
                            transform: `scale(${canvasRenderScale})`,
                            transformOrigin: '0 0',
                            overflowAnchor: 'none',
                          }}
                        >
                        {canvasItems.length === 0 && (
                          <div className="absolute left-10 top-10 w-[320px] rounded-[14px] border border-dashed border-stone-300 bg-white p-5 text-stone-500 shadow-sm dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
                            <div className="flex items-center gap-2 text-sm font-black text-stone-800 dark:text-stone-100">
                              <LayoutGrid className="h-4 w-4 text-stone-500 dark:text-stone-400" />
                              无限画布
                            </div>
                            <p className="mt-2 text-xs leading-5">
                              把图片拖进这里，按住图片即可移动排列。切回抽屉会保留现场；删除侧边栏里的画布时，可选择把元素保存到抽屉。
                            </p>
                          </div>
                        )}
                        {canvasConnectionsForRender.length > 0 && (
                          <CanvasNodeRenderGate
                            dependencies={[
                              canvasSize.width,
                              canvasSize.height,
                              isDark,
                              ...canvasConnectionsForRender.flatMap(({ source, target }: CanvasRenderConnection) => [source, target]),
                            ]}
                            render={() => (
                          <svg
                            className="pointer-events-none absolute left-0 top-0 z-0 overflow-visible"
                            width={canvasSize.width}
                            height={canvasSize.height}
                            viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
                          >
                            <defs>
                              <linearGradient id="canvasAiLinkGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor={isDark ? '#67e8f9' : '#0891b2'} stopOpacity={isDark ? 0.98 : 0.82} />
                                <stop offset="100%" stopColor={isDark ? '#fbbf24' : '#d97706'} stopOpacity={isDark ? 0.96 : 0.84} />
                              </linearGradient>
                            </defs>
                            {canvasConnectionsForRender.map(({ source, target }: CanvasRenderConnection) => {
                              const sourceBox = getCanvasItemRenderedBox(source);
                              const targetBox = getCanvasItemRenderedBox(target);
                              const sourceX = sourceBox.x + sourceBox.width + CANVAS_CONNECTION_HANDLE_OUTSET;
                              const sourceY = sourceBox.y + sourceBox.height / 2;
                              const targetX = targetBox.x - CANVAS_CONNECTION_HANDLE_OUTSET;
                              const targetY = targetBox.y + targetBox.height / 2;
                              const bend = Math.max(80, Math.abs(targetX - sourceX) * 0.45);
                              const direction = targetX >= sourceX ? 1 : -1;
                              const d = `M ${sourceX} ${sourceY} C ${sourceX + bend * direction} ${sourceY}, ${targetX - bend * direction} ${targetY}, ${targetX} ${targetY}`;
                              return (
                                <g
                                  key={`${source.id}-${target.id}`}
                                  data-canvas-connection-source-id={source.id}
                                  data-canvas-connection-target-id={target.id}
                                  className="group/canvas-link"
                                >
                                  <path
                                    className="pointer-events-none"
                                    d={d}
                                    stroke={isDark ? 'rgba(125,211,252,0.32)' : 'rgba(255,255,255,0.92)'}
                                    strokeWidth={isDark ? 7 : 6}
                                    fill="none"
                                    strokeLinecap="round"
                                    opacity={isDark ? 0.72 : 0.3}
                                  />
                                  <path
                                    className="pointer-events-none transition-opacity group-hover/canvas-link:opacity-100"
                                    d={d}
                                    stroke="url(#canvasAiLinkGradient)"
                                    strokeWidth={isDark ? 3.25 : 2.75}
                                    fill="none"
                                    strokeLinecap="round"
                                    opacity={isDark ? 0.96 : 0.86}
                                  />
                                  <path
                                    d={d}
                                    stroke="transparent"
                                    strokeWidth="18"
                                    fill="none"
                                    strokeLinecap="round"
                                    className="pointer-events-auto cursor-pointer"
                                    onContextMenu={(event) => openCanvasContextMenu(event, 'connection', { sourceId: source.id, targetId: target.id })}
                                    onDoubleClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      if (removeCanvasConnection(target.id, source.id)) showToast('已删除连接线');
                                    }}
                                  />
                                  <circle className="pointer-events-none" cx={sourceX} cy={sourceY} r="5" fill="#22d3ee" opacity="0.88" />
                                  <circle className="pointer-events-none" cx={targetX} cy={targetY} r="5" fill="#3b82f6" opacity="0.9" />
                                </g>
                              );
                            })}
                          </svg>
                            )}
                          />
                        )}
                        {canvasConnectionDraft && (
                          <svg
                            className="pointer-events-none absolute left-0 top-0 z-[5] overflow-visible"
                            width={canvasSize.width}
                            height={canvasSize.height}
                            viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
                          >
                            <path d={canvasConnectionDraftPath} stroke="rgba(8,145,178,0.22)" strokeWidth="8" fill="none" strokeLinecap="round" />
                            <path d={canvasConnectionDraftPath} stroke="#22d3ee" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeDasharray="8 7" />
                            <circle cx={canvasConnectionDraft.fromX} cy={canvasConnectionDraft.fromY} r="5" fill="#22d3ee" />
                            <circle cx={canvasConnectionDraft.toX} cy={canvasConnectionDraft.toY} r="5" fill="#3b82f6" />
                            {canvasRenderableItems.filter((item: CanvasImageItem) => canUseCanvasItemAsAiTarget(item)).map((item: CanvasImageItem) => {
                              const itemBox = getCanvasItemRenderedBox(item);
                              const cx = itemBox.x - CANVAS_CONNECTION_HANDLE_OUTSET;
                              const cy = itemBox.y + itemBox.height / 2;
                              return (
                                <g key={`canvas-ai-drop-${item.id}`} transform={`translate(${cx} ${cy})`}>
                                  <circle r="12" fill="#3b82f6" opacity="0.95" />
                                  <circle r="8" fill="#93c5fd" opacity="0.92" />
                                  <circle r="3.5" fill="#ffffff" opacity="0.96" />
                                </g>
                              );
                            })}
                            {canvasConnectionDraft.sourceIds.length > 1 && (
                              <g transform={`translate(${canvasConnectionDraft.toX + 12} ${canvasConnectionDraft.toY - 10})`}>
                                <rect width="54" height="20" rx="10" fill="rgba(15,23,42,0.82)" />
                                <text x="27" y="13.5" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="800">
                                  {canvasConnectionDraft.sourceIds.length} inputs
                                </text>
                              </g>
                            )}
                          </svg>
                        )}
                        {canvasInputActionDraft && (
                          <svg
                            className="pointer-events-none absolute left-0 top-0 z-[5] overflow-visible"
                            width={canvasSize.width}
                            height={canvasSize.height}
                            viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
                          >
                            <path d={canvasInputActionDraftPath} stroke="rgba(59,130,246,0.18)" strokeWidth="8" fill="none" strokeLinecap="round" />
                            <path d={canvasInputActionDraftPath} stroke="#3b82f6" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeDasharray="8 7" />
                            <circle cx={canvasInputActionDraft.fromX} cy={canvasInputActionDraft.fromY} r="5" fill="#3b82f6" />
                            <circle cx={canvasInputActionDraft.toX} cy={canvasInputActionDraft.toY} r="5" fill="#22d3ee" />
                          </svg>
                        )}
                        {canvasGroupOutlinesForRender.map((group: CanvasRenderGroup) => {
                          const isSelected = group.itemIds.every((id: string) => canvasSelectedIdsSet.has(id));
                          return (
                            <div
                              key={group.id}
                              data-canvas-group-frame-id={group.id}
                              data-canvas-group-selected={isSelected ? 'true' : undefined}
                              className={`pointer-events-none absolute z-0 border border-dashed transition-[border-color,background-color] duration-200 ${
                                isSelected
                                  ? 'border-stone-700/65 bg-transparent dark:border-stone-200/60'
                                  : 'border-stone-400/45 bg-transparent dark:border-stone-600/55'
                              }`}
                              style={{
                                left: group.bounds.x,
                                top: group.bounds.y,
                                width: group.bounds.width,
                                height: group.bounds.height,
                                borderRadius: 10,
                                borderWidth: 1 / Math.max(0.25, canvasRenderScale),
                              }}
                            >
                              <div
                                className={`pointer-events-auto absolute left-1 top-[-7px] flex h-7 max-w-[260px] cursor-grab select-none items-center gap-2 rounded-[7px] border px-2.5 text-[11px] font-semibold tracking-[-0.01em] shadow-[0_3px_10px_rgba(41,37,36,0.08)] backdrop-blur-md transition-[border-color,background-color,box-shadow] duration-200 active:cursor-grabbing active:shadow-[0_2px_6px_rgba(41,37,36,0.1)] ${
                                  isSelected
                                    ? 'border-stone-300 bg-white/95 text-stone-800 dark:border-stone-600 dark:bg-stone-800/95 dark:text-stone-100'
                                    : 'border-stone-200/90 bg-white/88 text-stone-600 dark:border-stone-700 dark:bg-stone-900/88 dark:text-stone-300'
                                }`}
                                style={{
                                  transform: `translateY(-100%) scale(${1 / Math.max(0.25, canvasRenderScale)})`,
                                  transformOrigin: 'left bottom',
                                }}
                                onPointerDown={(event) => startCanvasItemDrag(event, group.itemIds[0])}
                                onDoubleClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  void renameCanvasGroup(group.itemIds);
                                }}
                                onContextMenu={(event) => {
                                  updateCanvasSelection(group.itemIds);
                                  openCanvasContextMenu(event, 'item', { itemId: group.itemIds[0] });
                                }}
                                title="拖动编组 · 双击重命名"
                              >
                                <svg
                                  aria-hidden="true"
                                  viewBox="0 0 8 12"
                                  className="h-3 w-2 shrink-0 text-stone-400 dark:text-stone-500"
                                >
                                  <circle cx="2" cy="2" r="1" fill="currentColor" />
                                  <circle cx="6" cy="2" r="1" fill="currentColor" />
                                  <circle cx="2" cy="6" r="1" fill="currentColor" />
                                  <circle cx="6" cy="6" r="1" fill="currentColor" />
                                  <circle cx="2" cy="10" r="1" fill="currentColor" />
                                  <circle cx="6" cy="10" r="1" fill="currentColor" />
                                </svg>
                                <span className="truncate">{group.name}</span>
                                <span className="h-3 w-px shrink-0 bg-stone-200 dark:bg-stone-700" />
                                <span className="shrink-0 font-mono text-[9px] font-medium tabular-nums text-stone-400 dark:text-stone-500">
                                  {group.itemIds.length}
                                </span>
                              </div>
                            </div>
                          );
                        })}
<CanvasNodeLayer
  scope={{ activeThreeSceneId, activeThreeSceneIdRef, analyzeCanvasThreeSceneNode, assignSelectedImagesToCanvasWorkflowSlot, beginThreeSceneInteraction, cancelCanvasEnhancementEstimate, CANVAS_TEXT_CONTEXT_ROUTING_OPTIONS, canvasAgent, canvasAiCloudImageModels, canvasAiCredentialSource, canvasAiExpandedOutputNodeIds, canvasAiPromptEditingId, canvasAiPromptTextAreaRefs, canvasAiProvider, canvasAiUnifiedImageModelOptions, canvasConnectionDraft, canvasHoveredItemIdRef, canvasInputMenuForId, canvasInputPickTargetId, canvasItems, canvasItemsById, canvasPromptOptimizingId, canvasReferenceDragState, canvasReferenceSuppressClickRef, canvasRenderableItems, canvasRenderScale, canvasScaledNodeRadius, canvasSelectedIdsRef, canvasSelectedIdsSet, canvasTextAgentRunningIds, canvasTextAreaRefs, canvasTextOutputAreaRefs, canvasWorkflowSingleEditGroupIds, canvasWorkflowTemplates, canvasWorkingTimerTick, captureThreeSceneView, chooseLocalImagesForCanvasWorkflowSlot, commitCanvasAiPromptDraft, commitCanvasTextDraft, commitCanvasTextOutputDraft, copyCanvasAiOutputToCanvas, copyCanvasImageToSystemClipboard, copyCanvasTextOutput, DESIGN_AGENT_ARTIFACT_OPTIONS, DESIGN_AGENT_ROLE_OPTIONS, DESIGN_AGENT_THINKING_MODE_OPTIONS, disconnectCanvasInput, downloadBufferItems, enableCanvasWorkflowSingleEditForItem, endThreeSceneInteraction, exitThreeSceneInteraction, getCanvasAiErrorSummary, getCanvasAiNodeDesignSizeForItem, getCanvasAiResolvedModel, getCanvasAiUnifiedImageModelValue, getCanvasImageInputBufferItemsForNode, getStableCanvasImageSource, handleCanvasAiRunClick, handleCanvasAiRunPointerDown, handleCanvasWorkflowSlotDrop, openCanvasBrushEditor, openCanvasBrushEditorFromSource, openCanvasContextMenu, openCanvasReferenceAddMenu, openCanvasReferenceReplaceMenu, openSelectedImagePreview, openSelectedVideoPreview, optimizeCanvasPrompt, pendingCanvasFusionRoleRef, preventCanvasNativeDrag, removeCanvasItemsByIds, replaceCanvasWorkflowSlotAssets, resizeCanvasAiPromptEditor, retryCanvasWorkflowOutput, rotateCanvasImageClockwise, runCanvasTextAgentNode, scheduleCanvasAiPromptDraftCommit, scheduleCanvasTextDraftCommit, scheduleCanvasTextOutputDraftCommit, setCanvasAiPromptEditingId, setCanvasDesignAgentConfig, setCanvasInputMenuForId, setCanvasReferenceReplacement, setCanvasTextContextRouting, setCanvasTextNodeMode, setCanvasWorkflowOutputMode, showToast, startCanvasItemDrag, startCanvasReferenceLongPress, threeSceneAnalyzingIds, toggleCanvasAiOutputsExpanded, toggleCanvasImageRule, toggleCanvasImageRulePanel, updateCanvasAiGeneratorData, updateCanvasSelection, updateCollapsedCanvasWorkflowSlot, updateThreeScenePreview, updateThreeSceneReferenceOverlay, updateThreeSceneSpec, WORKFLOW_SLOT_ASSET_DRAG_MIME }}
/>
                        {canvasRenderableItems.map((canvasItem: CanvasImageItem) => {
                          const isSelected = canvasSelectedIdsSet.has(canvasItem.id);
                          const isConnectedSource = canvasConnectedSourceIds.has(canvasItem.id);
                          if (!canUseCanvasItemAsAiInput(canvasItem) || (!isSelected && !isConnectedSource)) return null;
                          const itemBox = getCanvasItemRenderedBox(canvasItem);
                          const centerX = itemBox.x + itemBox.width + CANVAS_CONNECTION_HANDLE_OUTSET;
                          const centerY = itemBox.y + itemBox.height / 2;
                          return (
                            <button
                              key={`canvas-source-handle-${canvasItem.id}`}
                              data-no-drag="true"
                              data-canvas-connection-handle-id={canvasItem.id}
                              data-canvas-connection-handle-side="source"
                              type="button"
                              className="absolute z-[3] flex h-9 w-9 items-center justify-center rounded-full text-cyan-500 transition-all hover:scale-105"
                              style={{
                                left: centerX - 18,
                                top: centerY - 18,
                              }}
                              onPointerDown={(event) => startCanvasConnectionDrag(event, canvasItem.id)}
                              title="拖出连接线到生图/视频、工作流或文字节点"
                            >
                              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-white/95 bg-cyan-500/95 text-white shadow-[0_5px_13px_rgba(8,145,178,0.28)] ring-2 ring-cyan-200/25 backdrop-blur-sm dark:border-white/20 dark:bg-cyan-400 dark:ring-cyan-900/30">
                                <span className="h-1.5 w-1.5 rounded-full bg-white shadow-sm dark:bg-stone-950" />
                              </span>
                            </button>
                          );
                        })}
                        {canvasRenderableItems.map((canvasItem: CanvasImageItem) => {
                          if (!canUseCanvasItemAsAiTarget(canvasItem)) return null;
                          const isSelected = canvasSelectedIdsSet.has(canvasItem.id);
                          const isConnectedTarget = canvasConnectedTargetIds.has(canvasItem.id);
                          const showTargetHandle = canvasConnectionDraft || canvasInputActionDraft || isSelected
                            || isConnectedTarget || canvasInputMenuForId === canvasItem.id;
                          if (!showTargetHandle) return null;
                          const itemBox = getCanvasItemRenderedBox(canvasItem);
                          const centerX = itemBox.x - CANVAS_CONNECTION_HANDLE_OUTSET;
                          const centerY = itemBox.y + itemBox.height / 2;
                          return (
                            <div
                              key={`canvas-target-handle-${canvasItem.id}`}
                              data-no-drag="true"
                              data-canvas-connection-handle-id={canvasItem.id}
                              data-canvas-connection-handle-side="target"
                              data-canvas-ai-input-id={canvasItem.id}
                              className="absolute z-[3] flex h-9 w-9 items-center justify-center rounded-full text-white"
                              style={{
                                left: centerX - 18,
                                top: centerY - 18,
                              }}
                              onPointerDown={(event) => {
                                if (canvasConnectionDraft) {
                                  event.stopPropagation();
                                  return;
                                }
                                startCanvasInputActionDrag(event, canvasItem.id);
                              }}
                              title={'连接到此 ' + getCanvasInputTargetLabel(canvasItem)}
                            >
                              <button
                                type="button"
                                data-canvas-ai-input-id={canvasItem.id}
                                title={'连接到此 ' + getCanvasInputTargetLabel(canvasItem)}
                                className="flex h-5 w-5 items-center justify-center rounded-full border border-white/95 bg-blue-500 text-white shadow-[0_5px_13px_rgba(59,130,246,0.28)] ring-2 ring-blue-300/45 transition-all hover:scale-105 hover:bg-blue-400 dark:border-white/20 dark:bg-blue-400 dark:text-stone-950"
                              >
                                <span className="h-1.5 w-1.5 rounded-full bg-white shadow-sm dark:bg-stone-950" />
                              </button>
                            </div>
                          );
                        })}
                        {canvasInputMenuForId && (() => {
                          const canvasItem = canvasItemsById.get(canvasInputMenuForId);
                          if (!canvasItem || !canUseCanvasItemAsAiTarget(canvasItem)) return null;
                          const canvasAiNodeDesignSize = canvasItem.item.type === 'three-scene'
                            ? { width: canvasItem.width, height: canvasItem.height }
                            : getCanvasAiNodeDesignSizeForItem(canvasItem);
                          const nodeScale = Math.min(canvasItem.width / canvasAiNodeDesignSize.width, canvasItem.height / canvasAiNodeDesignSize.height) || 1;
                          const referenceLeft = canvasItem.x + 16 * nodeScale;
                          const referenceTop = canvasItem.y + 16 * nodeScale;
                          const referenceSize = 58 * nodeScale;
                          const menuScale = Math.max(0.35, Math.min(1, nodeScale));
                          const canUploadReferenceVideo = (
                            canvasItem.ai?.type === 'frame-interpolation'
                            || canvasItem.ai?.type === 'video-enhancement'
                            || (canvasItem.ai?.type === 'video-generator' && canvasItem.ai?.videoInputMode !== 'FLF')
                          );
                          const canUploadReferenceAudio = canvasItem.ai?.type === 'video-generator'
                            && canvasItem.ai?.videoInputMode !== 'FLF'
                            && isSeedanceLikeVideoModel(canvasItem.ai?.model);
                          const isVideoOnlyInput = canvasItem.ai?.type === 'frame-interpolation' || canvasItem.ai?.type === 'video-enhancement';
                          const workflowUserInput = canvasItem.ai?.type === 'workflow'
                            ? normalizeCanvasWorkflowUserInput(getCanvasWorkflowTemplateFromNode(canvasItem)?.userInput)
                            : null;
                          const canUploadWorkflowImages = canvasItem.ai?.type !== 'workflow' || workflowUserInput?.acceptImages !== false;
                          const canUploadWorkflowFiles = canvasItem.ai?.type === 'workflow' && workflowUserInput?.acceptFiles === true;
                          const pendingFusionRole = pendingCanvasFusionRoleRef.current?.targetId === canvasItem.id
                            ? pendingCanvasFusionRoleRef.current.role
                            : null;
                          const referenceReplacement = canvasReferenceReplaceTarget?.targetId === canvasItem.id
                            ? canvasReferenceReplaceTarget
                            : null;
                          return (
                            <div
                              key={`canvas-input-menu-${canvasItem.id}`}
                              data-canvas-floating-layer="true"
                              className="pointer-events-auto absolute z-[120] w-36 rounded-[18px] border border-white/70 bg-white/94 p-1.5 text-[11px] font-bold text-stone-700 shadow-2xl shadow-black/18 backdrop-blur-xl dark:border-white/10 dark:bg-stone-950/94 dark:text-white"
                              style={{
                                left: referenceLeft + referenceSize + 10 * menuScale,
                                top: referenceTop,
                                transform: `scale(${menuScale})`,
                                transformOrigin: 'left top',
                              }}
                              onPointerDown={(event) => {
                                event.stopPropagation();
                              }}
                            >
                              {pendingFusionRole && (
                                <div className="px-2.5 pb-1 pt-1 text-[9px] font-black uppercase tracking-[0.14em] text-fuchsia-500 dark:text-fuchsia-300">
                                  {pendingFusionRole === 'BASE' ? '设置基图' : '设置意向图'}
                                </div>
                              )}
                              {referenceReplacement && (
                                <div className="px-2.5 pb-1 pt-1 text-[9px] font-black tracking-[0.08em] text-blue-600 dark:text-blue-300">
                                  替换参考图 {referenceReplacement.inputIndex + 1}
                                </div>
                              )}
                              {!isVideoOnlyInput && canUploadWorkflowImages && (
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-[12px] px-2.5 py-2 text-left text-stone-600 hover:bg-stone-100 hover:text-stone-950 dark:text-white/88 dark:hover:bg-white/10 dark:hover:text-white"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    chooseLocalImagesForCanvasGenerator(canvasItem.id);
                                  }}
                                >
                                  <Upload className="h-3.5 w-3.5 text-cyan-500 dark:text-cyan-300" />
                                  本地图片
                                </button>
                              )}
                              {canUploadWorkflowFiles && (
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-[12px] px-2.5 py-2 text-left text-stone-600 hover:bg-stone-100 hover:text-stone-950 dark:text-white/88 dark:hover:bg-white/10 dark:hover:text-white"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    chooseLocalFilesForCanvasWorkflow(canvasItem.id);
                                  }}
                                >
                                  <FileIcon className="h-3.5 w-3.5 text-violet-500 dark:text-violet-300" />
                                  本地文件
                                </button>
                              )}
                              {canUploadReferenceVideo && (
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-[12px] px-2.5 py-2 text-left text-stone-600 hover:bg-stone-100 hover:text-stone-950 dark:text-white/88 dark:hover:bg-white/10 dark:hover:text-white"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    void chooseLocalVideosForCanvasGenerator(canvasItem.id);
                                    setCanvasInputMenuForId(null);
                                  }}
                                >
                                  <Film className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-300" />
                                  本地视频
                                </button>
                              )}
                              {canUploadReferenceAudio && (
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 rounded-[12px] px-2.5 py-2 text-left text-stone-600 hover:bg-stone-100 hover:text-stone-950 dark:text-white/88 dark:hover:bg-white/10 dark:hover:text-white"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    void chooseLocalAudiosForCanvasGenerator(canvasItem.id);
                                    setCanvasInputMenuForId(null);
                                  }}
                                >
                                  <Music className="h-3.5 w-3.5 text-fuchsia-500 dark:text-fuchsia-300" />
                                  本地音频
                                </button>
                              )}
                              {canUploadWorkflowImages && (
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-[12px] px-2.5 py-2 text-left text-stone-600 hover:bg-stone-100 hover:text-stone-950 dark:text-white/88 dark:hover:bg-white/10 dark:hover:text-white"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  startPickCanvasImageForGenerator(canvasItem.id);
                                }}
                              >
                                {isVideoOnlyInput
                                  ? <Film className="h-3.5 w-3.5 text-amber-500 dark:text-amber-300" />
                                  : <ImageIcon className="h-3.5 w-3.5 text-amber-500 dark:text-amber-300" />}
                                {isVideoOnlyInput ? '画布视频' : '画布图片'}
                              </button>
                              )}
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-[12px] px-2.5 py-2 text-left text-stone-500 hover:bg-stone-100 hover:text-stone-950 dark:text-white/65 dark:hover:bg-white/10 dark:hover:text-white"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  connectSelectedCanvasItemsToGenerator(canvasItem.id);
                                  setCanvasInputMenuForId(null);
                                }}
                              >
                                <Link className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-300" />
                                已选节点
                              </button>
                            </div>
                          );
                        })()}
                        {canvasSingleSelectedBoxForRender && canvasSingleSelectedItemForRender && (
                          <div
                            data-canvas-selection-frame="true"
                            className="pointer-events-none absolute z-[60] border-2 border-stone-900/80 bg-stone-900/[0.025] shadow-[0_0_0_3px_rgba(255,255,255,0.42)] dark:border-stone-100/70 dark:bg-white/[0.035] dark:shadow-[0_0_0_3px_rgba(0,0,0,0.24)]"
                            style={{
                              left: canvasSingleSelectedBoxForRender.x - 12,
                              top: canvasSingleSelectedBoxForRender.y - 12,
                              width: canvasSingleSelectedBoxForRender.width + 24,
                              height: canvasSingleSelectedBoxForRender.height + 24,
                              borderRadius: canvasScaledSelectionRadius,
                            }}
                          >
                            {(['nw', 'ne', 'sw', 'se'] as CanvasResizeCorner[]).map(corner => (
                              <button
                                key={corner}
                                data-no-drag="true"
                                type="button"
                                tabIndex={-1}
                                className={`pointer-events-auto absolute z-10 flex h-8 w-8 items-center justify-center ${
                                  corner === 'nw' ? '-left-4 -top-4 cursor-nwse-resize' :
                                  corner === 'ne' ? '-right-4 -top-4 cursor-nesw-resize' :
                                  corner === 'sw' ? '-left-4 -bottom-4 cursor-nesw-resize' :
                                  '-right-4 -bottom-4 cursor-nwse-resize'
                                }`}
                                style={{
                                  transform: `scale(${1 / Math.max(0.25, canvasRenderScale)})`,
                                  transformOrigin: 'center',
                                }}
                                onPointerDown={(event) => startCanvasItemResize(
                                  event,
                                  canvasSingleSelectedItemForRender.id,
                                  corner,
                                )}
                                title="拖动缩放"
                              >
                                <span className="h-3 w-3 rounded-[3px] border-2 border-white bg-stone-900 shadow-[0_2px_8px_rgba(24,24,27,0.28)] dark:border-stone-950 dark:bg-stone-100" />
                              </button>
                            ))}
                          </div>
                        )}
                        {canvasSelectedBounds && (
                          <div
                            data-canvas-selection-frame="true"
                            className="pointer-events-none absolute z-[60] border-2 border-stone-900/80 bg-stone-900/[0.025] dark:border-stone-100/70 dark:bg-white/[0.035]"
                            style={{
                              left: canvasSelectedBounds.x,
                              top: canvasSelectedBounds.y,
                              width: canvasSelectedBounds.width,
                              height: canvasSelectedBounds.height,
                              borderRadius: canvasScaledSelectionRadius,
                            }}
                          >
                            {(['nw', 'ne', 'sw', 'se'] as CanvasResizeCorner[]).map(corner => (
                              <button
                                key={corner}
                                data-no-drag="true"
                                type="button"
                                tabIndex={-1}
                                className={`pointer-events-auto absolute flex h-8 w-8 items-center justify-center ${
                                  corner === 'nw' ? '-left-4 -top-4 cursor-nwse-resize' :
                                  corner === 'ne' ? '-right-4 -top-4 cursor-nesw-resize' :
                                  corner === 'sw' ? '-left-4 -bottom-4 cursor-nesw-resize' :
                                  '-right-4 -bottom-4 cursor-nwse-resize'
                                }`}
                                style={{
                                  transform: `scale(${1 / Math.max(0.25, canvasRenderScale)})`,
                                  transformOrigin: 'center',
                                }}
                                onPointerDown={(event) => startCanvasGroupResize(event, corner)}
                                title="整体缩放"
                              >
                                <span className="h-3 w-3 rounded-[3px] border-2 border-white bg-stone-900 shadow-[0_2px_8px_rgba(24,24,27,0.28)] dark:border-stone-950 dark:bg-stone-100" />
                              </button>
                            ))}
                          </div>
                        )}
                        <div
                          ref={canvasSelectionOverlayRef}
                          className="pointer-events-none absolute left-0 top-0 hidden border border-stone-800 bg-stone-500/10 dark:border-stone-200 dark:bg-white/10"
                          style={{
                            width: 0,
                            height: 0,
                            borderRadius: canvasScaledSelectionRadius,
                            willChange: 'transform, width, height',
                          }}
                        />
                        </div>
                      </div>
                    </div>
                  )}
</>
  );
}
