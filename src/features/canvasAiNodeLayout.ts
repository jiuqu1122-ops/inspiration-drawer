import { clamp } from './common';

const CANVAS_AI_DEFAULT_ASPECT_RATIO = '16:9';
const CANVAS_AI_DEFAULT_COUNT = 1;
const CANVAS_AI_GENERATOR_NODE_DEFAULT_WIDTH = 560;
const CANVAS_AI_VIDEO_GENERATOR_NODE_DEFAULT_WIDTH = 760;
const CANVAS_AI_WORKFLOW_MODULE_DEFAULT_WIDTH = 590;
const CANVAS_AI_NODE_GRID_GAP = 8;
const CANVAS_AI_LOCAL_TOOL_PANEL_HEIGHT = 108;
const CANVAS_AI_LOCAL_TOOL_PROGRESS_PANEL_HEIGHT = 142;

export const CANVAS_AI_MAX_OUTPUT_COUNT = 64;
export const CANVAS_WORKFLOW_MAX_OUTPUT_SLOTS = 64;

export const parseCanvasAspectRatioValue = (aspectRatio = CANVAS_AI_DEFAULT_ASPECT_RATIO) => {
  const [rawW, rawH] = String(aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO)
    .split(/[:x×]/i)
    .map(value => Number(value));
  return rawW > 0 && rawH > 0 ? rawW / rawH : 16 / 9;
};

export const getCanvasAiOutputTileLayout = (options?: {
  width?: number;
  aspectRatio?: string;
  count?: number;
  outputCount?: number;
  isWorkflow?: boolean;
}) => {
  const width = options?.width || CANVAS_AI_GENERATOR_NODE_DEFAULT_WIDTH;
  const outputCount = clamp(
    Math.round(Number(options?.outputCount || options?.count) || CANVAS_AI_DEFAULT_COUNT),
    1,
    options?.isWorkflow ? CANVAS_WORKFLOW_MAX_OUTPUT_SLOTS : CANVAS_AI_MAX_OUTPUT_COUNT
  );
  const columns = outputCount <= 1 ? 1 : outputCount > 12 ? 4 : outputCount > 4 ? 3 : 2;
  const ratio = parseCanvasAspectRatioValue(options?.aspectRatio);
  const gridWidth = width - 36 - 18;
  const columnWidth = (gridWidth - CANVAS_AI_NODE_GRID_GAP * (columns - 1)) / columns;
  const maxTileHeight = outputCount <= 1 ? 360 : outputCount > 8 ? 190 : 330;
  const minTileHeight = outputCount <= 1 ? 230 : outputCount > 8 ? 108 : outputCount > 4 ? 124 : 150;
  const rawHeight = columnWidth / ratio;
  const tileHeight = clamp(rawHeight, minTileHeight, maxTileHeight);
  const tileWidth = Math.min(columnWidth, tileHeight * ratio);
  const rows = Math.max(1, Math.ceil(outputCount / columns));
  return {
    columns,
    rows,
    tileWidth: Math.round(tileWidth),
    tileHeight: Math.round(tileHeight),
    gridHeight: Math.round(rows * tileHeight + (rows - 1) * CANVAS_AI_NODE_GRID_GAP),
  };
};

export const getCanvasAiPromptAutoHeight = (
  promptText = '',
  width = CANVAS_AI_GENERATOR_NODE_DEFAULT_WIDTH,
  expanded = false
) => {
  if (!expanded) return 108;
  const text = promptText.trim();
  const charsPerLine = Math.max(26, Math.floor((width - 44) / 14));
  const visualLines = text
    ? Math.max(3, text.split(/\r?\n/).reduce(
      (total, line) => total + Math.max(1, Math.ceil(line.length / charsPerLine)),
      0
    ))
    : 3;
  return clamp(visualLines * 28 + 24, 180, 320);
};

export const getCanvasAiNodeAutoSize = (options?: {
  type?: 'image-generator' | 'video-generator' | 'workflow';
  aspectRatio?: string;
  count?: number;
  outputCount?: number;
  hasPreset?: boolean;
  hasError?: boolean;
  promptText?: string;
  promptExpanded?: boolean;
  showOutputPreview?: boolean;
  localMediaTool?: boolean;
  showLocalMediaProgress?: boolean;
}) => {
  const isWorkflow = options?.type === 'workflow';
  const isVideo = options?.type === 'video-generator';
  const width = isWorkflow
    ? CANVAS_AI_WORKFLOW_MODULE_DEFAULT_WIDTH
    : isVideo
      ? CANVAS_AI_VIDEO_GENERATOR_NODE_DEFAULT_WIDTH
      : CANVAS_AI_GENERATOR_NODE_DEFAULT_WIDTH;
  const outputCount = clamp(
    Math.round(Number(options?.outputCount || options?.count) || CANVAS_AI_DEFAULT_COUNT),
    1,
    isWorkflow ? CANVAS_WORKFLOW_MAX_OUTPUT_SLOTS : CANVAS_AI_MAX_OUTPUT_COUNT
  );
  const outputLayout = options?.showOutputPreview
    ? getCanvasAiOutputTileLayout({
      width,
      aspectRatio: options?.aspectRatio,
      outputCount,
      isWorkflow,
    })
    : null;
  const headerSectionHeight = 58;
  const outputSectionHeight = outputLayout ? 36 + outputLayout.gridHeight : 220;
  const metaSectionHeight = isWorkflow || options?.hasPreset ? 44 : 0;
  const promptHeight = isWorkflow
    ? 118
    : options?.localMediaTool
      ? options?.showLocalMediaProgress
        ? CANVAS_AI_LOCAL_TOOL_PROGRESS_PANEL_HEIGHT
        : CANVAS_AI_LOCAL_TOOL_PANEL_HEIGHT
      : getCanvasAiPromptAutoHeight(options?.promptText, width, !!options?.promptExpanded);
  const inputHeight = 52;
  const errorHeight = options?.hasError ? 48 : 0;
  const bodyGapCount = [
    headerSectionHeight,
    outputSectionHeight,
    metaSectionHeight,
    promptHeight,
    inputHeight,
    errorHeight,
  ].filter(Boolean).length - 1;
  const bodyHeight = headerSectionHeight
    + outputSectionHeight
    + metaSectionHeight
    + promptHeight
    + inputHeight
    + errorHeight
    + Math.max(0, bodyGapCount) * 12
    + 32;
  return {
    width,
    height: Math.ceil(bodyHeight),
  };
};
