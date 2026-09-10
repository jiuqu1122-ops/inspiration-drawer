import React from 'react';
import { isPrimaryModifier } from '../../../platform/capabilities';
import type { CanvasContextMenuState } from '../../../types/canvasRuntime';
import { type CanvasImageFusionRole } from '../../../utils/canvasImageFusion';
import { amplifyCanvasWheelZoomDelta, resolveCanvasWheelIntent } from '../canvasWheelInput';
import { getCommonCanvasGroup } from '../../canvasGroups';
import { type CanvasImageItem,type CanvasItemBox,type CanvasResizeCorner } from '../../canvasModel';
import { resolveCanvasPasteSource } from '../../canvasPasteRouting';

type canvasInteractionsEffectContext = { isCanvasMode: boolean; isMacDesktopWindow: boolean; canvasSurfaceRef: React.RefObject<HTMLDivElement | null>; normalizeCanvasWheelDelta: (event: { deltaY: number; deltaMode: number; }) => number; getCanvasNestedWheelScroller: (surface: HTMLDivElement, targetValue: EventTarget | null, deltaY: number) => HTMLElement | null; shouldBlockCanvasWheelZoomTarget: (targetValue: EventTarget | null) => boolean; scheduleCanvasWheelZoom: (clientX: number, clientY: number, deltaY: number) => void; canvasScrollLockRef: React.RefObject<{ left: number; top: number; } | null>; isCanvasZoomingRef: React.RefObject<boolean>; canvasViewportDeferredDuringZoomRef: React.RefObject<boolean>; canvasStateSaveDeferredDuringZoomRef: React.RefObject<boolean>; growCanvasNearViewportEdge: (surface?: HTMLDivElement | null) => void; scheduleCanvasViewportUpdate: () => void; isCanvasSpacePressedRef: React.RefObject<boolean>; canvasPanRef: React.RefObject<{ pointerId: number; button: number; startClientX: number; startClientY: number; startScrollLeft: number; startScrollTop: number; } | null>; scheduleCanvasStateSave: (options?: { syncNodes?: boolean; }) => void; canvasScrollWriteGuardRef: React.RefObject<boolean>; left: number; top: number; writeCanvasSurfaceScroll: (surface: HTMLDivElement, left: number, top: number, updateLock?: boolean) => void; isCanvasModeRef: React.RefObject<boolean>; isTextEntryActive: () => boolean; shouldRouteShortcutToDoodle: (event: Event) => boolean; updateCanvasSelection: (ids: string[]) => void; canvasItemsRef: React.RefObject<CanvasImageItem[]>; canvasSelectedIdsRef: React.RefObject<string[]>; copyCanvasItemsToAvailableClipboards: (ids: string[]) => Promise<boolean>; duplicateCanvasItems: (ids?: string[], client?: { x: number; y: number; }) => number; ungroupCanvasItems: (ids?: string[]) => boolean; renameCanvasGroup: (ids?: string[]) => Promise<boolean>; createCanvasGroup: (ids?: string[]) => Promise<boolean>; fitCanvasViewToItems: (ids?: string[]) => boolean; setIsCanvasChromeHidden: React.Dispatch<React.SetStateAction<boolean>>; canvasSpaceKeyCapturedRef: React.RefObject<boolean>; setCanvasSpacePressed: (pressed: boolean) => void; removeCanvasItemsByIds: (ids: string[], label?: string) => number; showToast: (message: string) => void; activeThreeSceneIdRef: React.RefObject<string | null>; exitThreeSceneInteraction: () => void; canvasDragRef: React.RefObject<{ ids: string[]; pointerId: number; startClientX: number; startClientY: number; startScrollLeft: number; startScrollTop: number; startItems: Record<string, CanvasItemBox>; latestDelta: { dx: number; dy: number; }; hasMoved: boolean; hasConnections: boolean; pendingSelectionIds: string[] | null; } | null>; canvasResizeRef: React.RefObject<{ id: string; corner: CanvasResizeCorner; startClientX: number; startClientY: number; startX: number; startY: number; startWidth: number; startHeight: number; aspect: number; latestBox: CanvasItemBox | null; hasResized: boolean; } | null>; canvasGroupResizeRef: React.RefObject<{ corner: CanvasResizeCorner; startClientX: number; startClientY: number; startBounds: CanvasItemBox; startItems: Record<string, CanvasItemBox>; aspect: number; latestBoxes: Record<string, CanvasItemBox> | null; hasResized: boolean; } | null>; canvasContextMenuRef: React.RefObject<CanvasContextMenuState | null>; canvasConnectionDraft: { fromId: string; sourceIds: string[]; fromX: number; fromY: number; toX: number; toY: number; } | null; canvasInputPickTargetIdRef: React.RefObject<string | null>; cancelCanvasItemDragVisuals: () => void; setCanvasContextMenu: React.Dispatch<React.SetStateAction<CanvasContextMenuState | null>>; setCanvasInputMenuForId: React.Dispatch<React.SetStateAction<string | null>>; setCanvasInputPickTargetId: React.Dispatch<React.SetStateAction<string | null>>; pendingCanvasFusionRoleRef: React.RefObject<{ targetId: string; role: CanvasImageFusionRole; } | null>; setCanvasConnectionDraft: React.Dispatch<React.SetStateAction<{ fromId: string; sourceIds: string[]; fromX: number; fromY: number; toX: number; toY: number; } | null>>; hideCanvasSelectionOverlay: () => void; toggleCanvasMode: () => void; button: number | undefined; canvasPanCleanupRef: React.RefObject<(() => void) | null>; preferCanvasClipboardRef: React.RefObject<boolean>; setCanvasInteractionActive: (active: boolean, releaseDelay?: number, _options?: { preserveImageSources?: boolean; }) => void; getCanvasClipboardImageFiles: (clipboardData: DataTransfer) => File[]; canvasClipboardRef: React.RefObject<CanvasImageItem[]>; pasteCanvasItems: (client?: { x: number; y: number; }, label?: string) => number; pasteSystemClipboardToCanvas: (clipboardData: DataTransfer, client?: { x: number; y: number; }) => Promise<boolean>; };

export const runCanvasInteractionsEffect01 = (ctx: Pick<canvasInteractionsEffectContext, 'canvasSurfaceRef' | 'getCanvasNestedWheelScroller' | 'isCanvasMode' | 'isMacDesktopWindow' | 'normalizeCanvasWheelDelta' | 'scheduleCanvasWheelZoom' | 'shouldBlockCanvasWheelZoomTarget'>) => {
  const { canvasSurfaceRef, getCanvasNestedWheelScroller, isCanvasMode, isMacDesktopWindow, normalizeCanvasWheelDelta, scheduleCanvasWheelZoom, shouldBlockCanvasWheelZoomTarget } = ctx;
    if (!isCanvasMode) return;
    const surface = canvasSurfaceRef.current;
    if (!surface) return;

    const handleCanvasWheel = (event: WheelEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      // The surface listener runs in capture phase. Let OrbitControls receive the wheel
      // before applying the infinite-canvas zoom, otherwise both cameras zoom together.
      if (target?.closest('[data-three-scene-interactive="true"]')) return;
      const deltaY = normalizeCanvasWheelDelta(event);
      if (getCanvasNestedWheelScroller(surface, event.target, deltaY)) return;
      // WKWebView reports two-finger scrolling as an ordinary wheel event and
      // trackpad pinching as ctrl+wheel. Preserve native two-axis scrolling and
      // momentum for panning; only the pinch path should zoom the canvas.
      if (resolveCanvasWheelIntent(isMacDesktopWindow, event) === 'pan') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (shouldBlockCanvasWheelZoomTarget(event.target)) return;
      scheduleCanvasWheelZoom(
        event.clientX,
        event.clientY,
        amplifyCanvasWheelZoomDelta(deltaY, isMacDesktopWindow),
      );
    };

    surface.addEventListener('wheel', handleCanvasWheel, { passive: false, capture: true });
    return () => {
      surface.removeEventListener('wheel', handleCanvasWheel, true);
    };

};

export const runCanvasInteractionsEffect02 = (ctx: Pick<canvasInteractionsEffectContext, 'canvasPanRef' | 'canvasScrollLockRef' | 'canvasScrollWriteGuardRef' | 'canvasStateSaveDeferredDuringZoomRef' | 'canvasSurfaceRef' | 'canvasViewportDeferredDuringZoomRef' | 'growCanvasNearViewportEdge' | 'isCanvasMode' | 'isCanvasSpacePressedRef' | 'isCanvasZoomingRef' | 'scheduleCanvasStateSave' | 'scheduleCanvasViewportUpdate' | 'writeCanvasSurfaceScroll'>) => {
  const { canvasPanRef, canvasScrollLockRef, canvasScrollWriteGuardRef, canvasStateSaveDeferredDuringZoomRef, canvasSurfaceRef, canvasViewportDeferredDuringZoomRef, growCanvasNearViewportEdge, isCanvasMode, isCanvasSpacePressedRef, isCanvasZoomingRef, scheduleCanvasStateSave, scheduleCanvasViewportUpdate, writeCanvasSurfaceScroll } = ctx;
    if (!isCanvasMode) return;
    const surface = canvasSurfaceRef.current;
    if (!surface) return;

    canvasScrollLockRef.current = {
      left: surface.scrollLeft,
      top: surface.scrollTop,
    };

    const handleCanvasScroll = () => {
      if (isCanvasZoomingRef.current) {
        canvasScrollLockRef.current = {
          left: surface.scrollLeft,
          top: surface.scrollTop,
        };
        canvasViewportDeferredDuringZoomRef.current = true;
        canvasStateSaveDeferredDuringZoomRef.current = true;
        return;
      }
      growCanvasNearViewportEdge(surface);
      scheduleCanvasViewportUpdate();
      const shouldLockScroll = isCanvasSpacePressedRef.current || canvasPanRef.current !== null;
      if (!shouldLockScroll) {
        canvasScrollLockRef.current = {
          left: surface.scrollLeft,
          top: surface.scrollTop,
        };
        scheduleCanvasStateSave();
        return;
      }

      if (canvasScrollWriteGuardRef.current) {
        canvasScrollLockRef.current = {
          left: surface.scrollLeft,
          top: surface.scrollTop,
        };
        scheduleCanvasStateSave();
        return;
      }

      const locked = canvasScrollLockRef.current;
      if (!locked) {
        canvasScrollLockRef.current = {
          left: surface.scrollLeft,
          top: surface.scrollTop,
        };
        scheduleCanvasStateSave();
        return;
      }

      if (surface.scrollLeft !== locked.left || surface.scrollTop !== locked.top) {
        writeCanvasSurfaceScroll(surface, locked.left, locked.top, false);
      }
    };

    surface.addEventListener('scroll', handleCanvasScroll);
    return () => {
      surface.removeEventListener('scroll', handleCanvasScroll);
    };

};

export const runCanvasInteractionsEffect03 = (ctx: Pick<canvasInteractionsEffectContext, 'activeThreeSceneIdRef' | 'cancelCanvasItemDragVisuals' | 'canvasClipboardRef' | 'canvasConnectionDraft' | 'canvasContextMenuRef' | 'canvasDragRef' | 'canvasGroupResizeRef' | 'canvasInputPickTargetIdRef' | 'canvasItemsRef' | 'canvasPanCleanupRef' | 'canvasPanRef' | 'canvasResizeRef' | 'canvasScrollLockRef' | 'canvasSelectedIdsRef' | 'canvasSpaceKeyCapturedRef' | 'canvasSurfaceRef' | 'copyCanvasItemsToAvailableClipboards' | 'createCanvasGroup' | 'duplicateCanvasItems' | 'exitThreeSceneInteraction' | 'fitCanvasViewToItems' | 'getCanvasClipboardImageFiles' | 'hideCanvasSelectionOverlay' | 'isCanvasModeRef' | 'isCanvasSpacePressedRef' | 'isTextEntryActive' | 'pasteCanvasItems' | 'pasteSystemClipboardToCanvas' | 'pendingCanvasFusionRoleRef' | 'preferCanvasClipboardRef' | 'removeCanvasItemsByIds' | 'renameCanvasGroup' | 'setCanvasConnectionDraft' | 'setCanvasContextMenu' | 'setCanvasInputMenuForId' | 'setCanvasInputPickTargetId' | 'setCanvasInteractionActive' | 'setCanvasSpacePressed' | 'setIsCanvasChromeHidden' | 'shouldRouteShortcutToDoodle' | 'showToast' | 'toggleCanvasMode' | 'ungroupCanvasItems' | 'updateCanvasSelection'>) => {
  const { activeThreeSceneIdRef, cancelCanvasItemDragVisuals, canvasClipboardRef, canvasConnectionDraft, canvasContextMenuRef, canvasDragRef, canvasGroupResizeRef, canvasInputPickTargetIdRef, canvasItemsRef, canvasPanCleanupRef, canvasPanRef, canvasResizeRef, canvasScrollLockRef, canvasSelectedIdsRef, canvasSpaceKeyCapturedRef, canvasSurfaceRef, copyCanvasItemsToAvailableClipboards, createCanvasGroup, duplicateCanvasItems, exitThreeSceneInteraction, fitCanvasViewToItems, getCanvasClipboardImageFiles, hideCanvasSelectionOverlay, isCanvasModeRef, isCanvasSpacePressedRef, isTextEntryActive, pasteCanvasItems, pasteSystemClipboardToCanvas, pendingCanvasFusionRoleRef, preferCanvasClipboardRef, removeCanvasItemsByIds, renameCanvasGroup, setCanvasConnectionDraft, setCanvasContextMenu, setCanvasInputMenuForId, setCanvasInputPickTargetId, setCanvasInteractionActive, setCanvasSpacePressed, setIsCanvasChromeHidden, shouldRouteShortcutToDoodle, showToast, toggleCanvasMode, ungroupCanvasItems, updateCanvasSelection } = ctx;
    const shouldStartCanvasSpacePan = (event: KeyboardEvent) => {
      if (!isCanvasModeRef.current || isTextEntryActive()) return false;
      const target = event.target as HTMLElement | null;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) {
        return false;
      }
      const surface = canvasSurfaceRef.current;
      if (!surface) return false;
      return true;
    };

    const handleCanvasKeysDown = (event: KeyboardEvent) => {
      if (shouldRouteShortcutToDoodle(event)) return;
      if (isCanvasModeRef.current && !isTextEntryActive()) {
        const key = event.key.toLowerCase();
        const isMod = isPrimaryModifier(event);
        if (isMod && !event.altKey && key === 'a') {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          updateCanvasSelection(canvasItemsRef.current.map(item => item.id));
          return;
        }
        if (isMod && !event.altKey && key === 'c') {
          const selectedIds = canvasSelectedIdsRef.current;
          if (selectedIds.length === 0) return;
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          void copyCanvasItemsToAvailableClipboards(selectedIds);
          return;
        }
        if (isMod && !event.altKey && key === 'd') {
          const selectedIds = canvasSelectedIdsRef.current;
          if (selectedIds.length === 0) return;
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          duplicateCanvasItems(selectedIds);
          return;
        }
        if (isMod && !event.altKey && key === 'g') {
          const selectedIds = canvasSelectedIdsRef.current;
          if (selectedIds.length === 0) return;
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          if (event.shiftKey) {
            ungroupCanvasItems(selectedIds);
          } else if (getCommonCanvasGroup(selectedIds, canvasItemsRef.current)) {
            void renameCanvasGroup(selectedIds);
          } else {
            void createCanvasGroup(selectedIds);
          }
          return;
        }
        if (isMod && !event.altKey && (key === '0' || key === 'f')) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          fitCanvasViewToItems(canvasSelectedIdsRef.current.length > 0 ? canvasSelectedIdsRef.current : undefined);
          return;
        }
      }
      if (isCanvasModeRef.current && event.key === 'Tab') {
        if (isTextEntryActive()) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (!event.repeat) {
          setIsCanvasChromeHidden(prev => !prev);
          window.requestAnimationFrame(() => {
            canvasSurfaceRef.current?.focus({ preventScroll: true });
          });
        }
        return;
      }
      if (event.code === 'Space') {
        if (!shouldStartCanvasSpacePan(event)) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        canvasSpaceKeyCapturedRef.current = true;
        if (!isCanvasSpacePressedRef.current) {
          const surface = canvasSurfaceRef.current;
          if (surface) {
            const activeElement = document.activeElement as HTMLElement | null;
            if (activeElement && activeElement !== surface && typeof activeElement.blur === 'function') {
              activeElement.blur();
            }
            surface.focus({ preventScroll: true });
            canvasScrollLockRef.current = {
              left: surface.scrollLeft,
              top: surface.scrollTop,
            };
          }
          setCanvasSpacePressed(true);
        }
        return;
      }
      if (isCanvasModeRef.current && (event.key === 'Delete' || event.key === 'Backspace')) {
        if (isTextEntryActive()) return;
        const selectedIds = canvasSelectedIdsRef.current;
        if (selectedIds.length === 0) return;
        event.preventDefault();
        event.stopPropagation();
        const removedCount = removeCanvasItemsByIds(selectedIds);
        if (removedCount > 0) showToast(`已从画布移除 ${removedCount} 个节点，抽屉素材已保留`);
        return;
      }
      if (isCanvasModeRef.current && event.key === 'Escape') {
        if (activeThreeSceneIdRef.current) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          exitThreeSceneInteraction();
          updateCanvasSelection([]);
          return;
        }
        if (
          canvasDragRef.current
          || canvasResizeRef.current
          || canvasGroupResizeRef.current
          || canvasContextMenuRef.current
          || canvasSelectedIdsRef.current.length > 0
          || canvasConnectionDraft
          || canvasInputPickTargetIdRef.current
        ) {
          event.preventDefault();
          event.stopPropagation();
          cancelCanvasItemDragVisuals();
          setCanvasContextMenu(null);
          setCanvasInputMenuForId(null);
          setCanvasInputPickTargetId(null);
          pendingCanvasFusionRoleRef.current = null;
          setCanvasConnectionDraft(null);
          updateCanvasSelection([]);
          hideCanvasSelectionOverlay();
        }
        return;
      }
      if (event.repeat) return;
      if (event.altKey && (event.code === 'Backquote' || event.key === '`' || event.key === '~')) {
        event.preventDefault();
        toggleCanvasMode();
        return;
      }
    };
    const handleCanvasKeysUp = (event: KeyboardEvent) => {
      if (shouldRouteShortcutToDoodle(event)) return;
      if (event.code === 'Space') {
        if (canvasSpaceKeyCapturedRef.current || isCanvasSpacePressedRef.current) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        }
        canvasSpaceKeyCapturedRef.current = false;
        setCanvasSpacePressed(false);
        if (canvasPanRef.current?.button === 0) canvasPanCleanupRef.current?.();
        const surface = canvasSurfaceRef.current;
        if (surface) {
          canvasScrollLockRef.current = {
            left: surface.scrollLeft,
            top: surface.scrollTop,
          };
        }
      }
    };
    const handleCanvasKeyBlur = () => {
      preferCanvasClipboardRef.current = false;
      setCanvasSpacePressed(false);
      canvasSpaceKeyCapturedRef.current = false;
      canvasPanCleanupRef.current?.();
      cancelCanvasItemDragVisuals();
      setCanvasInteractionActive(false, 0);
    };
    const handleCanvasPaste = (event: ClipboardEvent) => {
      if (shouldRouteShortcutToDoodle(event)) return;
      if (!isCanvasModeRef.current || isTextEntryActive()) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [data-canvas-edit-control="true"]')) return;
      const clipboardData = event.clipboardData;
      const imageCount = clipboardData ? getCanvasClipboardImageFiles(clipboardData).length : 0;
      const text = clipboardData?.getData('text/plain') || '';
      const pasteSource = resolveCanvasPasteSource({
        systemImageCount: imageCount,
        systemText: text,
        canvasItemCount: canvasClipboardRef.current.length,
        preferCanvasItems: preferCanvasClipboardRef.current,
      });
      if (pasteSource === 'none') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (pasteSource === 'canvas') {
        pasteCanvasItems();
        return;
      }
      if (clipboardData) {
        preferCanvasClipboardRef.current = false;
        void pasteSystemClipboardToCanvas(clipboardData).catch((err) => {
          console.warn('粘贴剪贴板内容到画布失败:', err);
          showToast('粘贴失败');
        });
      }
    };
    const handleNativeCopy = () => {
      preferCanvasClipboardRef.current = false;
    };

    window.addEventListener('keydown', handleCanvasKeysDown, true);
    window.addEventListener('keyup', handleCanvasKeysUp, true);
    window.addEventListener('blur', handleCanvasKeyBlur);
    document.addEventListener('paste', handleCanvasPaste, true);
    document.addEventListener('copy', handleNativeCopy, true);
    return () => {
      window.removeEventListener('keydown', handleCanvasKeysDown, true);
      window.removeEventListener('keyup', handleCanvasKeysUp, true);
      window.removeEventListener('blur', handleCanvasKeyBlur);
      document.removeEventListener('paste', handleCanvasPaste, true);
      document.removeEventListener('copy', handleNativeCopy, true);
    };

};

export const runCanvasInteractionsEffect04 = (ctx: Pick<canvasInteractionsEffectContext, 'isCanvasModeRef'>) => {
  const { isCanvasModeRef } = ctx;
    const blurCanvasModeButtonAfterClick = (event: PointerEvent) => {
      if (!isCanvasModeRef.current) return;
      const target = event.target as Element | null;
      if (!(target instanceof Element)) return;
      const focusable = target.closest('button, a, [role="button"]');
      if (!(focusable instanceof HTMLElement)) return;
      window.requestAnimationFrame(() => {
        if (document.activeElement === focusable) focusable.blur();
      });
    };

    window.addEventListener('pointerup', blurCanvasModeButtonAfterClick, true);
    return () => {
      window.removeEventListener('pointerup', blurCanvasModeButtonAfterClick, true);
    };

};
