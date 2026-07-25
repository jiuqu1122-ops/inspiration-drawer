import type { BufferItem, FloatingNoteSnapshot } from '../types';
import { clamp } from './common';
import {
  CANVAS_BASE_HEIGHT,
  CANVAS_BASE_WIDTH,
  CANVAS_MAX_SCALE,
  CANVAS_MIN_SCALE,
  type CanvasAiGeneratedOutput,
  type CanvasImageItem,
} from './canvasModel';
import { recoverCanvasAiNodeWithUsableResults } from './canvasAiOutputs';

const DATA_THUMBNAIL_KEEP_MAX_CHARS = 96 * 1024;

export const CANVAS_UNDO_LIMIT = 6;
export const CANVAS_STATE_SAVE_DEBOUNCE_MS = 320;

export type CanvasPersistedState = {
  items: CanvasImageItem[];
  size: { width: number; height: number };
  scale: number;
  scroll: { left: number; top: number };
  updatedAt: number;
};

export type CanvasUndoSnapshot = {
  items: CanvasImageItem[];
  selectedIds: string[];
  size: { width: number; height: number };
  scroll: { left: number; top: number };
  label: string;
  createdAt: number;
};

export const isDataImageSourceValue = (value?: string | null) => (
  /^data:image\/[a-zA-Z0-9.+-]+;base64,/i.test(String(value || '').trim())
);

const isDataVideoSourceValue = (value?: string | null) => (
  /^data:video\/[a-zA-Z0-9.+-]+;base64,/i.test(String(value || '').trim())
);

export const isDataMediaSourceValue = (value?: string | null) => (
  isDataImageSourceValue(value) || isDataVideoSourceValue(value)
);

const cleanCanvasMediaUrl = (value?: string | null) => (
  String(value || '')
    .trim()
    .replace(/^["'`]+/g, '')
    .replace(/["'`\\]+$/g, '')
    .replace(/[.,;，。；]+$/g, '')
);

const hasCanvasVideoFileExtension = (value?: string | null) => (
  /\.(?:mp4|webm|mov|m4v|avi|mkv)(?:[?#].*)?$/i.test(cleanCanvasMediaUrl(value))
);

const hasCanvasImageFileExtension = (value?: string | null) => (
  /\.(?:jpe?g|png|webp|gif|bmp|svg)(?:[?#].*)?$/i.test(cleanCanvasMediaUrl(value))
);

const isInvalidCanvasVideoSuccessOutput = (output: CanvasAiGeneratedOutput) => {
  if (output.status !== 'success') return false;
  const url = cleanCanvasMediaUrl(output.url);
  if (!url) return true;
  if (/^data:video\//i.test(url)) return false;
  if (hasCanvasVideoFileExtension(output.path || url)) return false;
  return hasCanvasImageFileExtension(url);
};

const stripDataImageProvenance = (item: BufferItem): BufferItem => {
  const hasDataSource = isDataImageSourceValue(item.sourceUrl);
  const hasDataOriginal = isDataImageSourceValue(item.originalUrl);
  if (!hasDataSource && !hasDataOriginal) return item;
  const next = { ...item };
  if (hasDataSource) next.sourceUrl = undefined;
  if (hasDataOriginal) next.originalUrl = undefined;
  return next;
};

export const stripHeavyDataThumbnail = (item: BufferItem): BufferItem => {
  const nextItem = stripDataImageProvenance(item);
  const thumbnail = nextItem.thumbnail || '';
  if (!isDataImageSourceValue(thumbnail) || thumbnail.length <= DATA_THUMBNAIL_KEEP_MAX_CHARS) {
    return nextItem;
  }
  const next = nextItem === item ? { ...item } : { ...nextItem };
  next.thumbnail = undefined;
  return next;
};

const getWorkflowEmbeddedImageDataSource = (item: BufferItem) => (
  [item.url, item.path, item.thumbnail, item.sourceUrl, item.originalUrl]
    .map(value => String(value || '').trim())
    .find(isDataImageSourceValue) || ''
);

export const prepareCanvasWorkflowTemplateItem = (item: BufferItem): BufferItem => {
  let next = stripHeavyDataThumbnail(item);
  if (item.type !== 'image') return next;

  const embeddedSource = getWorkflowEmbeddedImageDataSource(item);
  if (!embeddedSource) return next;

  next = {
    ...next,
    url: embeddedSource,
    path: undefined,
    sourceUrl: undefined,
    originalUrl: undefined,
  };
  if (
    next.thumbnail
    && isDataImageSourceValue(next.thumbnail)
    && next.thumbnail.length > DATA_THUMBNAIL_KEEP_MAX_CHARS
  ) {
    next.thumbnail = undefined;
  }
  return next;
};

export const compactFloatingNoteSnapshot = (snapshot: FloatingNoteSnapshot): FloatingNoteSnapshot => {
  const thumbnail = snapshot.thumbnail || '';
  if (!isDataImageSourceValue(thumbnail) || thumbnail.length <= DATA_THUMBNAIL_KEEP_MAX_CHARS) {
    return snapshot;
  }
  return { ...snapshot, thumbnail: undefined };
};

export const stripCanvasItemDataImageProvenance = (item: CanvasImageItem): CanvasImageItem => {
  const nextItem = stripHeavyDataThumbnail(item.item);
  let nextAi = item.ai;
  if (item.ai?.outputs?.length) {
    let outputsChanged = false;
    const outputs = item.ai.outputs.map(output => {
      const thumbnail = output.thumbnail || '';
      if (!isDataImageSourceValue(thumbnail) || thumbnail.length <= DATA_THUMBNAIL_KEEP_MAX_CHARS) return output;
      outputsChanged = true;
      return { ...output, thumbnail: undefined };
    });
    if (outputsChanged) nextAi = { ...item.ai, outputs };
  }
  if (nextItem === item.item && nextAi === item.ai) return item;
  return { ...item, item: nextItem, ai: nextAi };
};

const normalizeInterruptedCanvasAiRun = (
  item: CanvasImageItem,
  activeRunNodeIds?: ReadonlySet<string>,
): CanvasImageItem => {
  const cleanItem = recoverCanvasAiNodeWithUsableResults(stripCanvasItemDataImageProvenance(item));
  if (cleanItem.ai?.type === 'video-generator') {
    const invalidVideoError = '接口返回了无效的视频结果，请重新生成';
    let hasInvalidVideoOutput = false;
    const outputs = (cleanItem.ai.outputs || []).map(output => {
      if (!isInvalidCanvasVideoSuccessOutput(output)) return output;
      hasInvalidVideoOutput = true;
      return {
        ...output,
        status: 'error' as const,
        error: output.error || invalidVideoError,
        generatedAt: output.generatedAt || cleanItem.ai?.generatedAt || Date.now(),
      };
    });
    if (hasInvalidVideoOutput) {
      return {
        ...cleanItem,
        ai: {
          ...cleanItem.ai,
          status: 'error',
          error: cleanItem.ai.error || invalidVideoError,
          outputs,
          generatedAt: cleanItem.ai.generatedAt || Date.now(),
        },
      };
    }
  }

  if (cleanItem.ai?.status !== 'working' || activeRunNodeIds?.has(cleanItem.id)) return cleanItem;
  const failedAt = cleanItem.ai.generatedAt || Date.now();
  const interruptedError = '上次生成已中断，请重新生成';
  return {
    ...cleanItem,
    ai: {
      ...cleanItem.ai,
      status: 'error',
      error: cleanItem.ai.error || interruptedError,
      generatedAt: failedAt,
      outputs: (cleanItem.ai.outputs || []).map(output => output.status === 'success'
        ? output
        : {
          ...output,
          status: 'error' as const,
          error: output.error || interruptedError,
          generatedAt: output.generatedAt || failedAt,
        }),
    },
  };
};

export const sanitizeCanvasPersistedState = (
  value: unknown,
  options: { activeRunNodeIds?: ReadonlySet<string> } = {},
): CanvasPersistedState => {
  const record = value && typeof value === 'object' ? value as Partial<CanvasPersistedState> : {};
  const rawSize = record.size && typeof record.size === 'object' ? record.size : {};
  const rawScroll = record.scroll && typeof record.scroll === 'object' ? record.scroll : {};
  const size = {
    width: clamp(
      Number((rawSize as { width?: unknown }).width) || CANVAS_BASE_WIDTH,
      CANVAS_BASE_WIDTH,
      1_000_000
    ),
    height: clamp(
      Number((rawSize as { height?: unknown }).height) || CANVAS_BASE_HEIGHT,
      CANVAS_BASE_HEIGHT,
      1_000_000
    ),
  };
  const scroll = {
    left: Math.max(0, Number((rawScroll as { left?: unknown }).left) || 0),
    top: Math.max(0, Number((rawScroll as { top?: unknown }).top) || 0),
  };
  return {
    items: Array.isArray(record.items)
      ? record.items.map(item => normalizeInterruptedCanvasAiRun(item, options.activeRunNodeIds))
      : [],
    size,
    scale: clamp(Number(record.scale) || 1, CANVAS_MIN_SCALE, CANVAS_MAX_SCALE),
    scroll,
    updatedAt: Number(record.updatedAt) || 0,
  };
};
