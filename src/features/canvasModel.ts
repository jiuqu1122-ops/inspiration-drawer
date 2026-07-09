import { BufferItem } from '../types';

export type CanvasImageItem = {
  id: string;
  item: BufferItem;
  x: number;
  y: number;
  width: number;
  height: number;
  inputs?: string[];
  textMode?: 'agent' | 'plain';
  ai?: CanvasAiItemData;
  workflowGroup?: unknown;
  workflowBridge?: {
    type: 'reference-image';
    label?: string;
    externalInputTypes?: Array<'image' | 'text' | 'video'>;
    outputType?: 'image' | 'image[]' | 'text' | 'video' | 'video[]';
  };
};

export type CanvasAiProvider = 'openai-compatible' | 'new-api' | 'xais-chat' | 'aoduo-ai';

export type CanvasAiMediaType = 'image' | 'video';

export type CanvasAiItemType =
  | 'image-generator'
  | 'video-generator'
  | 'frame-interpolation'
  | 'image-enhancement'
  | 'video-enhancement'
  | 'generated-image'
  | 'generated-video'
  | 'workflow';

export type CanvasAiGeneratedOutput = {
  id: string;
  mediaType?: CanvasAiMediaType;
  url?: string;
  path?: string;
  thumbnail?: string;
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

export type CanvasRifeInterpolationEstimate = {
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  frameCount?: number | null;
  outputFps?: number | null;
  outputFrameCount?: number | null;
  outputWidth?: number | null;
  outputHeight?: number | null;
  sampleFrames?: number | null;
  estimatedSecondsMin?: number | null;
  estimatedSecondsMax?: number | null;
};

export type CanvasRifeEngineProgress = {
  progressId?: string;
  stage?: string;
  label?: string;
  loaded?: number;
  total?: number;
  progress?: number;
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
  targetSize?: string;
  resolution?: string;
  sourceImageNodeId?: string | null;
  referenceImageNodeIds?: string[];
  referenceRoles?: Array<{
    nodeId: string;
    role: 'BASE' | 'STYLE_REF' | 'LAYOUT_REF' | 'SUBJECT_REF' | 'NONE';
  }>;
  toolHint?: string | null;
  skillMeta?: {
    skillId?: string;
    originalRequest?: string;
    fidelity?: 'L1' | 'L2' | 'L3' | 'L4';
    productCategory?: string;
    focus?: string[];
    [key: string]: unknown;
  };
  outputFormat?: string;
  count?: number;
  duration?: number;
  videoInputMode?: 'REF' | 'FLF';
  videoCfrMode?: 'auto' | '24' | '30' | 'off';
  interpolationRateMode?: 'multiplier' | 'target-fps';
  interpolationFactor?: number;
  interpolationTargetFps?: number;
  interpolationMode?: string;
  interpolationQuality?: string;
  interpolationKeepAudio?: boolean;
  interpolationEstimate?: CanvasRifeInterpolationEstimate;
  interpolationEstimateKey?: string;
  interpolationProgress?: CanvasRifeEngineProgress;
  enhancementEngine?: 'ai' | 'quick';
  quickEnhancementScale?: number;
  enhancementScale?: number;
  enhancementMode?: string;
  enhancementResizeMode?: string;
  enhancementKeepAudio?: boolean;
  enhancementEstimate?: CanvasRifeInterpolationEstimate;
  enhancementEstimateKey?: string;
  enhancementProgress?: CanvasRifeEngineProgress;
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
