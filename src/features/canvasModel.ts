import { BufferItem } from '../types';
import type { ImagePolicy } from './appAgent/imageQuality/imageRuleCapsules';

export type CanvasWorkflowSlotAsset = {
  sourceItemId?: string;
  path?: string;
  url?: string;
  thumbnail?: string;
  originalUrl?: string;
  name?: string;
  updatedAt: number;
};

export type CanvasWorkflowSlotBinding = {
  slotId: string;
  assets: CanvasWorkflowSlotAsset[];
};

export type CanvasWorkflowRuntimeNodeSnapshot = {
  templateId: string;
  item?: Partial<BufferItem>;
  ai?: Partial<CanvasAiItemData>;
};

export type CanvasWorkflowRuntime = {
  nodeSnapshots?: Record<string, CanvasWorkflowRuntimeNodeSnapshot>;
  internalSlotBindings?: Record<string, CanvasWorkflowSlotBinding>;
  [key: string]: unknown;
};

export type CanvasImageItem = {
  id: string;
  item: BufferItem;
  x: number;
  y: number;
  width: number;
  height: number;
  inputs?: string[];
  textMode?: 'agent' | 'plain';
  designAgentConfig?: DesignAgentConfig;
  ai?: CanvasAiItemData;
  workflowGroup?: unknown;
  /**
   * Runtime-only ordered assets for an expanded internal slot node. The
   * collapsed module persists the same data in workflowRuntime.
   */
  workflowSlotAssets?: CanvasWorkflowSlotAsset[];
  workflowBridge?: {
    type: 'reference-image';
    label?: string;
    externalInputTypes?: Array<'image' | 'text' | 'video'>;
    outputType?: 'image' | 'image[]' | 'text' | 'video' | 'video[]';
  };
};

/**
 * Optional industrial-design behaviour for an existing canvas text Agent node.
 * Keeping this separate from CanvasAiItemData preserves the legacy text-node
 * representation (`textMode: 'agent'` with no `ai` object).
 */
export interface DesignAgentConfig {
  agentRole?:
    | 'requirement_analyzer'
    | 'inspiration_analyzer'
    | 'design_strategist'
    | 'design_reviewer'
    | 'presentation_writer'
    | 'general';
  outputArtifactType?:
    | 'DesignBrief'
    | 'ResearchReport'
    | 'InspirationAnalysis'
    | 'DesignStrategy'
    | 'DesignReview'
    | 'PromptPackage'
    | 'Document';
  thinkingMode?: 'analysis' | 'generation' | 'review';
}

export type CanvasAiProvider = 'openai-compatible' | 'new-api' | 'xais-chat' | 'custom';
export type CanvasAiCredentialSource = 'wallet' | 'local';

export type CanvasAiModelCandidate = {
  source: CanvasAiCredentialSource;
  provider: CanvasAiProvider;
  model: string;
  providerChannelId?: string;
};

export type CanvasAiMediaType = 'image' | 'video';

export type NewApiImageProtocol =
  | 'chat_completions'
  | 'images_edits'
  | 'images_generations'
  | 'async_task';

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
  taskId?: string;
  clientRequestId?: string;
  mediaType?: CanvasAiMediaType;
  url?: string;
  sourceUrl?: string;
  path?: string;
  thumbnail?: string;
  name?: string;
  prompt?: string;
  status?: 'working' | 'success' | 'error';
  cacheStatus?: 'pending' | 'ready' | 'failed';
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
  providerChannelId?: string;
  credentialSource?: CanvasAiCredentialSource;
  providerCandidates?: CanvasAiModelCandidate[];
  endpoint?: string;
  model?: string;
  imageProtocol?: NewApiImageProtocol;
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
    role: string;
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
  imagePolicy?: ImagePolicy;
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
  /**
   * Per-module state. Legacy projects can still contain the old snapshot
   * array; all readers normalize that representation before use.
   */
  workflowRuntime?: CanvasWorkflowRuntime | CanvasWorkflowRuntimeNodeSnapshot[];
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
