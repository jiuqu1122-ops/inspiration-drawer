import { BufferItem } from '../types';

export type CanvasImageItem = {
  id: string;
  item: BufferItem;
  x: number;
  y: number;
  width: number;
  height: number;
  inputs?: string[];
  ai?: CanvasAiItemData;
  workflowGroup?: unknown;
};

export type CanvasAiProvider = 'openai-compatible' | 'xais-chat' | 'aoduo-ai';

export type CanvasAiItemType = 'image-generator' | 'generated-image' | 'workflow';

export type CanvasAiGeneratedOutput = {
  id: string;
  url?: string;
  path?: string;
  name?: string;
  prompt?: string;
  status?: 'working' | 'success' | 'error';
  error?: string;
  generatedAt?: number;
  width?: number;
  height?: number;
  nodeId?: string;
  nodeLabel?: string;
};

export type CanvasAiItemData = {
  type: CanvasAiItemType;
  provider?: CanvasAiProvider;
  endpoint?: string;
  model?: string;
  prompt?: string;
  presetId?: string;
  presetLabel?: string;
  presetPrompt?: string;
  aspectRatio?: string;
  resolution?: string;
  outputFormat?: string;
  count?: number;
  status?: 'idle' | 'working' | 'success' | 'error';
  error?: string;
  generatedAt?: number;
  outputs?: CanvasAiGeneratedOutput[];
  workflow?: unknown;
  workflowRuntime?: unknown;
  workflowOutputMode?: 'final' | 'all';
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
export const CANVAS_MIN_SCALE = 0.08;
export const CANVAS_MAX_SCALE = 4;
export const CANVAS_MIN_IMAGE_WIDTH = 80;
export const CANVAS_MAX_IMAGE_WIDTH = 1200;
