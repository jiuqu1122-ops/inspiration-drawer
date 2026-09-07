import React from 'react';
import type { ActiveShortcutScope,CanvasBrushEditorState } from '../../../types/canvasRuntime';

type canvasMediaEffectContext = { canvasBrushEditorOpenRef: React.RefObject<boolean>; canvasBrushEditor: CanvasBrushEditorState | null; activeShortcutScopeRef: React.RefObject<ActiveShortcutScope>; setActiveShortcutScope: (scope: ActiveShortcutScope) => void; hideCanvasBrushCursor: () => void; doodleRootRef: React.RefObject<HTMLDivElement | null>; };

export const runCanvasMediaEffect01 = (ctx: Pick<canvasMediaEffectContext, 'activeShortcutScopeRef' | 'canvasBrushEditor' | 'canvasBrushEditorOpenRef' | 'doodleRootRef' | 'hideCanvasBrushCursor' | 'setActiveShortcutScope'>) => {
  const { activeShortcutScopeRef, canvasBrushEditor, canvasBrushEditorOpenRef, doodleRootRef, hideCanvasBrushCursor, setActiveShortcutScope } = ctx;
    canvasBrushEditorOpenRef.current = !!canvasBrushEditor;
    if (!canvasBrushEditor) {
      if (activeShortcutScopeRef.current === 'doodle') setActiveShortcutScope('canvas');
      hideCanvasBrushCursor();
      return;
    }

    setActiveShortcutScope('doodle');
    const focusFrame = window.requestAnimationFrame(() => {
      doodleRootRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(focusFrame);

};
