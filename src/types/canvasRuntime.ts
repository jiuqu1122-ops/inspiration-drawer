import type { CanvasFolderImportPrompt, CanvasImageItem } from '../features/canvasModel';

export type CanvasUndoSnapshot = {
  items: CanvasImageItem[];
  selectedIds: string[];
  size: { width: number; height: number };
  scroll: { left: number; top: number };
  label: string;
  createdAt: number;
};

export type CanvasPersistedState = {
  items: CanvasImageItem[];
  size: { width: number; height: number };
  scale: number;
  scroll: { left: number; top: number };
  updatedAt: number;
};

export type CanvasBrushEditorMode = 'brush' | 'crop' | 'eraser' | 'rectangle' | 'circle' | 'ellipse';

export type CanvasAiXaisBalanceState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  balance?: number;
  id?: number;
  hasWx?: boolean;
  isMgr?: boolean;
  message?: string;
  checkedAt?: number;
};

export type CanvasReferenceReplaceTarget = {
  targetId: string;
  inputId: string;
  inputIndex: number;
};

export type CanvasReferenceDragState = {
  targetId: string;
  inputId: string;
  overInputId: string;
  clientX: number;
  clientY: number;
  previewSource: string;
  inputIndex: number;
  rotation: 0 | 90 | 180 | 270;
};

export type CanvasBrushShapeMode = Extract<CanvasBrushEditorMode, 'rectangle' | 'circle' | 'ellipse'>;

export type CanvasBrushPoint = { x: number; y: number };

export type ActiveShortcutScope = 'canvas' | 'doodle' | 'input' | 'agent' | 'none';

export type CanvasBrushCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CanvasViewportRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CanvasBrushEditorState = {
  targetId: string;
  source: string;
  baseDataUrl: string;
  name: string;
  x: number;
  y: number;
  nodeWidth: number;
  nodeHeight: number;
  width: number;
  height: number;
};

export type CanvasBrushEditorOpenOptions = {
  targetId: string;
  source: string;
  name: string;
  x: number;
  y: number;
  nodeWidth: number;
  nodeHeight: number;
};

export type CanvasFolderMediaPickerState = CanvasFolderImportPrompt & {
  x: number;
  y: number;
};

export type CanvasContextMenuState = {
  x: number;
  y: number;
  worldX: number;
  worldY: number;
  type: 'canvas' | 'item' | 'connection' | 'source-connection' | 'target-input';
  itemId?: string;
  sourceId?: string;
  sourceIds?: string[];
  targetId?: string;
};
