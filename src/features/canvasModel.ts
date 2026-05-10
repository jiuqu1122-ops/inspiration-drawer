import { BufferItem } from '../types';

export type CanvasImageItem = {
  id: string;
  item: BufferItem;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CanvasResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

export type CanvasSelectionBox = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

export type CanvasItemBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CanvasFolderImportPrompt = {
  folderId?: string;
  folderName: string;
  count: number;
};

export const CANVAS_BASE_WIDTH = 3200;
export const CANVAS_BASE_HEIGHT = 2200;
export const CANVAS_GROW_CHUNK = 1400;
export const CANVAS_EDGE_AUTOSCROLL_MARGIN = 76;
export const CANVAS_EDGE_AUTOSCROLL_SPEED = 34;
export const CANVAS_MIN_SCALE = 0.35;
export const CANVAS_MAX_SCALE = 2.5;
export const CANVAS_MIN_IMAGE_WIDTH = 80;
export const CANVAS_MAX_IMAGE_WIDTH = 1200;
